import * as THREE from "three";

const INK = 0x3a2818;

/**
 * 廉价反转外壳描边（BackSide + 微放大）。
 * 几何共享，仅多一份材质；dispose 时随父 mesh 一并清理。
 */
export function applyInkOutlines(root: THREE.Object3D, scale = 1.028, color = INK) {
  const added: THREE.Mesh[] = [];
  // 先收集再挂描边，避免 traverse 时把新 child 再描一遍造成无限嵌套
  const targets: THREE.Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (mesh.userData.isInkOutline || mesh.userData.inkOutline) return;
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (bb) {
      const size = new THREE.Vector3();
      bb.getSize(size);
      // 跳过 stump 自带地面盘等极扁大片
      if (size.y < 0.02 && Math.max(size.x, size.z) > 2) return;
    }
    targets.push(mesh);
  });

  for (const mesh of targets) {
    const outline = new THREE.Mesh(
      mesh.geometry,
      new THREE.MeshBasicMaterial({
        color,
        side: THREE.BackSide,
        depthWrite: true,
        toneMapped: false,
      }),
    );
    outline.scale.setScalar(scale);
    outline.castShadow = false;
    outline.receiveShadow = false;
    outline.frustumCulled = mesh.frustumCulled;
    outline.userData.isInkOutline = true;
    mesh.add(outline);
    mesh.userData.inkOutline = outline;
    added.push(outline);
  }
  return added;
}

/** 地面圆盘边缘淡入雾色，消掉地平线硬缝 */
export function applyParchmentGroundFade(
  ground: THREE.Mesh,
  fogColor: THREE.Color,
  opts?: { inner?: number; outer?: number },
) {
  const mat = ground.material as THREE.MeshStandardMaterial;
  const inner = opts?.inner ?? 7.5;
  const outer = opts?.outer ?? 13.5;
  const uFog = { value: fogColor.clone() };
  const uInner = { value: inner };
  const uOuter = { value: outer };

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uParchFog = uFog;
    shader.uniforms.uParchInner = uInner;
    shader.uniforms.uParchOuter = uOuter;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vParchWorld;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vParchWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 uParchFog;
        uniform float uParchInner;
        uniform float uParchOuter;
        varying vec3 vParchWorld;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float pr = length(vParchWorld.xz);
        float pFade = smoothstep(uParchInner, uParchOuter, pr);
        diffuseColor.rgb = mix(diffuseColor.rgb, uParchFog, pFade);`,
      );
  };
  mat.customProgramCacheKey = () => `parchment-ground-fade`;
  mat.needsUpdate = true;

  return () => {
    // clear custom shader when leaving set4
    mat.onBeforeCompile = () => {};
    mat.customProgramCacheKey = () => "";
    mat.needsUpdate = true;
  };
}

export function clearInkOutlines(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const outline = mesh.userData.inkOutline as THREE.Mesh | undefined;
    if (!outline) return;
    mesh.remove(outline);
    (outline.material as THREE.Material).dispose();
    mesh.userData.inkOutline = null;
  });
}

/**
 * 把 stump 自带的大地面盘溶进纸色雾（按世界 XZ 半径淡出），
 * 消掉「圆盘硬边地平线」。
 */
export function applyParchmentStumpDiscFade(
  root: THREE.Object3D,
  fogColor: THREE.Color,
  opts?: { inner?: number; outer?: number; discY?: number },
) {
  const inner = opts?.inner ?? 2.0;
  const outer = opts?.outer ?? 5.8;
  const discY = opts?.discY ?? -0.32;
  const clears: Array<() => void> = [];

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    if (mesh.userData.isInkOutline) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const mat = m as THREE.MeshStandardMaterial;
      if (!mat.isMeshStandardMaterial) continue;
      const uFog = { value: fogColor.clone() };
      const uInner = { value: inner };
      const uOuter = { value: outer };
      const uDiscY = { value: discY };
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uDiscFog = uFog;
        shader.uniforms.uDiscInner = uInner;
        shader.uniforms.uDiscOuter = uOuter;
        shader.uniforms.uDiscY = uDiscY;
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            `#include <common>
            varying vec3 vDiscWorld;`,
          )
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
            vDiscWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
            uniform vec3 uDiscFog;
            uniform float uDiscInner;
            uniform float uDiscOuter;
            uniform float uDiscY;
            varying vec3 vDiscWorld;`,
          )
          .replace(
            "#include <color_fragment>",
            `#include <color_fragment>
            // 仅抬高「地面盘」薄片：y 贴近 discY 且半径大
            float discBand = 1.0 - smoothstep(0.04, 0.14, abs(vDiscWorld.y - uDiscY));
            float discR = length(vDiscWorld.xz);
            float discFade = smoothstep(uDiscInner, uDiscOuter, discR) * discBand;
            diffuseColor.rgb = mix(diffuseColor.rgb, uDiscFog, discFade);`,
          );
      };
      mat.customProgramCacheKey = () => "parchment-stump-disc-fade";
      mat.needsUpdate = true;
      clears.push(() => {
        mat.onBeforeCompile = () => {};
        mat.customProgramCacheKey = () => "";
        mat.needsUpdate = true;
      });
    }
  });

  return () => {
    for (const c of clears) c();
  };
}
