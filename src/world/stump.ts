import * as THREE from "three";
import { MODELS } from "../config/assets";
import { IS_MINIGAME, GROUND_Y, INCH, FOOT } from "../config/constants";
import { createGltfLoader } from "../core/gltf";
import type { ProgressFn } from "../core/loading";
import { assetUrl } from "../platform/env";

export interface Stump {
  root: THREE.Object3D;
  /** 给物理引擎用的碰撞面高度(树桩顶面 y) */
  topY: number;
  /** 顶面半径,决定原木能放在哪 */
  topRadius: number;
  dispose(): void;
}

const STUMP_TOP_Y = 0;
const STUMP_TOP_RADIUS = 11 * INCH;

/**
 * 素材缺失时的兜底树桩:一个带年轮渐变的圆台。
 * 不好看,但保证项目换了素材也能跑起来,不至于白屏。
 */
function createFallbackStump(): THREE.Object3D {
  const height = STUMP_TOP_Y - GROUND_Y;
  const geometry = new THREE.CylinderGeometry(STUMP_TOP_RADIUS, STUMP_TOP_RADIUS * 1.15, height, 40, 1);
  geometry.translate(0, GROUND_Y + height / 2, 0);

  const material = new THREE.MeshStandardMaterial({ color: 0x8a6b45, roughness: 0.9, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function prepareStumpMaterials(root: THREE.Object3D, opts: { castShadow: boolean }) {
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    mesh.castShadow = opts.castShadow;
    mesh.receiveShadow = true;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat) return;
    if (mat.map) {
      mat.map.colorSpace = THREE.SRGBColorSpace;
      mat.map.flipY = false;
      mat.map.wrapS = THREE.ClampToEdgeWrapping;
      mat.map.wrapT = THREE.ClampToEdgeWrapping;
      mat.map.needsUpdate = true;
    }
    if (mat.normalMap) {
      mat.normalMap.flipY = false;
      mat.normalMap.wrapS = THREE.ClampToEdgeWrapping;
      mat.normalMap.wrapT = THREE.ClampToEdgeWrapping;
      mat.normalMap.needsUpdate = true;
    }
    if (mat.emissiveMap) {
      mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      mat.emissiveMap.wrapS = THREE.ClampToEdgeWrapping;
      mat.emissiveMap.wrapT = THREE.ClampToEdgeWrapping;
      mat.emissiveMap.needsUpdate = true;
    }
    mat.color.setRGB(1.08, 1.02, 0.92);
    mat.roughness = Math.max(mat.roughness, 0.78);
    mat.metalness = 0;
    mat.side = THREE.DoubleSide;
    if (mat.normalScale) mat.normalScale.set(1.05, 1.05);
  });
}

export interface StumpLoadUrls {
  stump?: string;
  stumpLod?: string;
  stumpData?: string;
}

/**
 * 近处砍伐树桩保持全精度；远处副本用 build 产出的 stump_lod（同贴图、少三角），
 * 且不投影 —— 画像显示 stump×2 ≈ 场景 87% tris。
 */
export async function loadStump(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  onProgress?: ProgressFn,
  urls?: StumpLoadUrls,
): Promise<Stump> {
  const loader = createGltfLoader(renderer);
  let root: THREE.Object3D;
  let farRoot: THREE.Object3D | null = null;
  const stumpUrl = urls?.stump || MODELS.stump;
  const dataUrl = urls?.stumpData || MODELS.stumpData;
  const lodUrl = urls?.stumpLod || (IS_MINIGAME ? assetUrl("/assets/stump_lod.gltf") : null);

  try {
    const [main, data] = await Promise.all([
      loader.loadAsync(stumpUrl).then((g) => (onProgress?.(), g)),
      loader.loadAsync(dataUrl).then((g) => (onProgress?.(), g)),
    ]);

    root = main.scene;
    prepareStumpMaterials(root, { castShadow: true });

    const placement = data.scene.getObjectByName("instance");

    // 小游戏：远景用 LOD；Web / 缺 LOD 时退回全模 clone
    if (IS_MINIGAME && lodUrl) {
      try {
        const lodGltf = await loader.loadAsync(lodUrl);
        farRoot = lodGltf.scene;
        prepareStumpMaterials(farRoot, { castShadow: false });
      } catch (err) {
        console.warn("stump_lod 加载失败,远景退回全模 clone:", err);
        farRoot = root.clone(true);
        prepareStumpMaterials(farRoot, { castShadow: false });
      }
    } else {
      farRoot = root.clone(true);
      // Web 远景仍投影；小游戏已关
      prepareStumpMaterials(farRoot, { castShadow: IS_MINIGAME ? false : true });
    }

    if (placement) {
      placement.updateWorldMatrix(true, false);
      placement.matrixWorld.decompose(farRoot.position, farRoot.quaternion, farRoot.scale);
    } else {
      // Behind-left, well inside leafy disc; sink into GROUND_Y
      farRoot.position.set(-1.2, -0.08, -0.7);
      farRoot.scale.set(-1, 1, 1);
    }
    // Stay clear of disc rim so silhouette doesn't read as floating over sky
    const groundR = 14 * FOOT * 0.55;
    const dist = Math.hypot(farRoot.position.x, farRoot.position.z);
    if (dist > groundR) {
      const s = groundR / dist;
      farRoot.position.x *= s;
      farRoot.position.z *= s;
    }
    if (farRoot.position.y > -0.05) farRoot.position.y = -0.08;
    scene.add(farRoot);
  } catch (err) {
    console.warn("树桩模型加载失败,改用兜底几何体:", err);
    onProgress?.();
    onProgress?.();
    root = createFallbackStump();
  }

  scene.add(root);

  return {
    root,
    topY: STUMP_TOP_Y,
    topRadius: STUMP_TOP_RADIUS,
    dispose() {
      scene.remove(root);
      if (farRoot) scene.remove(farRoot);
      // LOD 可能是独立加载或 clone；用 Set 避免贴图/材质/几何 double-dispose
      const seenGeo = new Set<THREE.BufferGeometry>();
      const seenMat = new Set<THREE.Material>();
      const seenTex = new Set<THREE.Texture>();
      const disposeMat = (mat: THREE.Material) => {
        if (seenMat.has(mat)) return;
        seenMat.add(mat);
        const std = mat as THREE.MeshStandardMaterial;
        for (const key of [
          "map",
          "normalMap",
          "roughnessMap",
          "metalnessMap",
          "aoMap",
          "emissiveMap",
          "alphaMap",
        ] as const) {
          const tex = std[key] as THREE.Texture | null | undefined;
          if (tex && !seenTex.has(tex)) {
            seenTex.add(tex);
            tex.dispose();
          }
        }
        mat.dispose();
      };
      const disposeTree = (o: THREE.Object3D) => {
        o.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          if (mesh.geometry && !seenGeo.has(mesh.geometry)) {
            seenGeo.add(mesh.geometry);
            mesh.geometry.dispose();
          }
          const m = mesh.material;
          if (Array.isArray(m)) m.forEach(disposeMat);
          else if (m) disposeMat(m);
        });
      };
      disposeTree(root);
      if (farRoot && farRoot !== root) disposeTree(farRoot);
    },
  };
}
