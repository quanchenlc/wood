import * as THREE from "three";
import { GRASS, GROUND_Y } from "../config/constants";

export interface Grass {
  mesh: THREE.InstancedMesh;
  update(dt: number): void;
  dispose(): void;
}

/** 一片草叶:三段四排的细长条,越往上越尖 */
function createBladeGeometry(): THREE.BufferGeometry {
  const segments = 3;
  const position: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];

  for (let row = 0; row <= segments; row++) {
    const t = row / segments;
    // 宽度往上收,叶尖收到三成
    const halfWidth = (GRASS.bladeWidth / 2) * (1 - t * 0.7);
    position.push(-halfWidth, t, 0, halfWidth, t, 0);
    uv.push(0, t, 1, t);
  }

  for (let row = 0; row < segments; row++) {
    const a = row * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  // 法线统一朝 +Z。草叶是单薄的片,给它逐顶点法线反而会让光照忽明忽暗。
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(new Array((segments + 1) * 2).fill([0, 0, 1]).flat(), 3),
  );
  geometry.setIndex(index);
  return geometry;
}

/**
 * 地被草。
 *
 * 一万片草叶用 InstancedMesh 一次画完,姿态、高度、颜色差异全靠逐实例属性,
 * 风吹的摆动在顶点着色器里按高度加权 —— 根部不动、叶尖摆得最欢。
 *
 * 光照上做了一个很省的「假次表面散射」:太阳在草叶背面时,按背光程度
 * 补一点暖绿色,叶尖更透。真做 SSS 太贵,这个近似在斜射光下已经很像了。
 */
export function createGrass(scene: THREE.Scene, sunDirection: THREE.Vector3): Grass {
  const geometry = new THREE.InstancedBufferGeometry();
  const blade = createBladeGeometry();
  geometry.index = blade.index;
  geometry.attributes = blade.attributes;

  const count = GRASS.count;
  const offsets = new Float32Array(count * 3);
  const rotations = new Float32Array(count);
  const heights = new Float32Array(count);
  const tints = new Float32Array(count);
  const phases = new Float32Array(count);

  let placed = 0;
  // 拒绝采样:半径均匀取点后按 (1-r)^falloff 的概率保留,
  // 得到中心密、边缘疏的自然分布,而不是一圈生硬的边界
  while (placed < count) {
    const angle = Math.random() * Math.PI * 2;
    const t = Math.random();
    if (Math.random() > Math.pow(1 - t, GRASS.densityFalloff)) continue;

    const radius = GRASS.innerRadius + t * (GRASS.outerRadius - GRASS.innerRadius);
    offsets[placed * 3 + 0] = Math.cos(angle) * radius;
    offsets[placed * 3 + 1] = GROUND_Y;
    offsets[placed * 3 + 2] = Math.sin(angle) * radius;
    rotations[placed] = Math.random() * Math.PI * 2;
    heights[placed] = GRASS.minHeight + Math.random() * (GRASS.maxHeight - GRASS.minHeight);
    tints[placed] = Math.random();
    phases[placed] = Math.random() * Math.PI * 2;
    placed++;
  }

  geometry.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offsets, 3));
  geometry.setAttribute("aRotation", new THREE.InstancedBufferAttribute(rotations, 1));
  geometry.setAttribute("aHeight", new THREE.InstancedBufferAttribute(heights, 1));
  geometry.setAttribute("aTint", new THREE.InstancedBufferAttribute(tints, 1));
  geometry.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
  geometry.instanceCount = count;

  const uniforms = {
    uTime: { value: 0 },
    uWind: { value: GRASS.windStrength },
    uSun: { value: sunDirection.clone() },
  };

  const material = new THREE.MeshStandardMaterial({
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        "void main() {",
        `attribute vec3 aOffset;
        attribute float aRotation;
        attribute float aHeight;
        attribute float aTint;
        attribute float aPhase;
        uniform float uTime;
        uniform float uWind;
        varying float vBladeT;
        varying float vTint;

        vec3 rotateY(vec3 p, float a) {
          float s = sin(a), c = cos(a);
          return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
        }

        void main() {`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        // position.y 本来就是 0..1 的归一化高度,直接当插值参数用
        vBladeT = position.y;
        vTint = aTint;

        transformed.y *= aHeight;

        // 自然弯曲 + 风摆,都按高度的平方加权:根部纹丝不动,叶尖甩得最开
        float lean = vBladeT * vBladeT;
        float sway = sin(uTime * ${GRASS.windSpeed.toFixed(2)} + aPhase) * uWind;
        transformed.x += (${GRASS.bend.toFixed(3)} + sway) * lean;

        transformed = rotateY(transformed, aRotation) + aOffset;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `uniform vec3 uSun;
        varying float vBladeT;
        varying float vTint;
        void main() {`,
      )
      .replace(
        "#include <map_fragment>",
        `// 根部偏深、叶尖偏亮,再按实例掺一点枯黄,整片草地才不呆板
        vec3 deep = vec3(0.07, 0.17, 0.05);
        vec3 fresh = vec3(0.24, 0.45, 0.11);
        vec3 dry = vec3(0.34, 0.36, 0.14);
        vec3 base = mix(deep, fresh, vBladeT);
        diffuseColor.rgb *= mix(base, dry, vTint * 0.35);`,
      )
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
        // 廉价的透光近似:太阳照在草叶背面时补一点暖绿。
        // 叶尖更薄所以透得更多,乘 vBladeT 做衰减。
        float backlit = max(0.0, -dot(normal, uSun));
        vec3 glow = vec3(0.45, 0.62, 0.16) * pow(backlit, 1.5) * 0.55 * vBladeT;
        reflectedLight.indirectDiffuse += glow * diffuseColor.rgb;`,
      );
  };

  material.customProgramCacheKey = () => "grass";

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  // 位置全在着色器里算,three 的实例矩阵用不上,也就没法做视锥剔除
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  // 草叶不投影:一万片细长片打进阴影图只会变成一团噪点,收益为负
  mesh.castShadow = false;
  scene.add(mesh);

  return {
    mesh,
    update(dt) {
      uniforms.uTime.value += dt;
    },
    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      blade.dispose();
      material.dispose();
    },
  };
}
