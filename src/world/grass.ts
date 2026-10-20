import * as THREE from "three";
import { GRASS, GROUND_Y } from "../config/constants";

export interface Grass {
  mesh: THREE.InstancedMesh;
  update(dt: number): void;
  /** 美术套装：更新假 SSS 用的草叶色（线性 0–1） */
  setColors?(
    deep: [number, number, number],
    fresh: [number, number, number],
    dry: [number, number, number],
  ): void;
  /** 羊皮纸：墨线草模式（矮、无透光、暖赭） */
  setInkMode?(on: boolean): void;
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
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(new Array((segments + 1) * 2).fill([0, 0, 1]).flat(), 3),
  );
  geometry.setIndex(index);
  return geometry;
}

/**
 * 地被草。InstancedMesh + 假 SSS；羊皮纸套装可切墨线模式。
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
    uDeep: { value: new THREE.Color(0.07, 0.17, 0.05) },
    uFresh: { value: new THREE.Color(0.24, 0.45, 0.11) },
    uDry: { value: new THREE.Color(0.34, 0.36, 0.14) },
    uInk: { value: 0 },
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
        uniform float uInk;
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
        vBladeT = position.y;
        vTint = aTint;

        float hMul = mix(1.0, 0.42, uInk);
        transformed.y *= aHeight * hMul;
        transformed.x *= mix(1.0, 0.45, uInk);

        float lean = vBladeT * vBladeT;
        float sway = sin(uTime * ${GRASS.windSpeed.toFixed(2)} + aPhase) * uWind * mix(1.0, 0.25, uInk);
        transformed.x += (${GRASS.bend.toFixed(3)} + sway) * lean;

        transformed = rotateY(transformed, aRotation) + aOffset;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `uniform vec3 uSun;
        uniform vec3 uDeep;
        uniform vec3 uFresh;
        uniform vec3 uDry;
        uniform float uInk;
        varying float vBladeT;
        varying float vTint;
        void main() {`,
      )
      .replace(
        "#include <map_fragment>",
        `vec3 base = mix(uDeep, uFresh, vBladeT);
        diffuseColor.rgb *= mix(base, uDry, vTint * 0.35);
        if (uInk > 0.5) {
          float grey = dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(grey) * vec3(1.05, 0.92, 0.7), 0.45);
        }`,
      )
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
        float backlit = max(0.0, -dot(normal, uSun));
        vec3 glow = vec3(0.45, 0.62, 0.16) * pow(backlit, 1.5) * 0.55 * vBladeT * (1.0 - uInk);
        reflectedLight.indirectDiffuse += glow * diffuseColor.rgb;`,
      );
  };

  material.customProgramCacheKey = () => "grass-v2";

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  scene.add(mesh);

  return {
    mesh,
    update(dt) {
      uniforms.uTime.value += dt;
    },
    setColors(deep, fresh, dry) {
      uniforms.uDeep.value.setRGB(deep[0], deep[1], deep[2]);
      uniforms.uFresh.value.setRGB(fresh[0], fresh[1], fresh[2]);
      uniforms.uDry.value.setRGB(dry[0], dry[1], dry[2]);
    },
    setInkMode(on) {
      uniforms.uInk.value = on ? 1 : 0;
      material.needsUpdate = true;
    },
    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      blade.dispose();
      material.dispose();
    },
  };
}
