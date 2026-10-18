import * as THREE from "three";
import { MODELS } from "../config/assets";
import { IS_MINIGAME, GROUND_Y, INCH } from "../config/constants";
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
      mat.map.wrapS = THREE.ClampToEdgeWrapping;
      mat.map.wrapT = THREE.ClampToEdgeWrapping;
      mat.map.needsUpdate = true;
    }
    if (mat.normalMap) {
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
    mat.color.set(0xffffff);
    mat.roughness = Math.max(mat.roughness, 0.7);
    mat.metalness = 0;
  });
}

/**
 * 近处砍伐树桩保持全精度；远处副本用 build 产出的 stump_lod（同贴图、少三角），
 * 且不投影 —— 画像显示 stump×2 ≈ 场景 87% tris。
 */
export async function loadStump(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  onProgress?: ProgressFn,
): Promise<Stump> {
  const loader = createGltfLoader(renderer);
  let root: THREE.Object3D;
  let farRoot: THREE.Object3D | null = null;

  try {
    const [main, data] = await Promise.all([
      loader.loadAsync(MODELS.stump).then((g) => (onProgress?.(), g)),
      loader.loadAsync(MODELS.stumpData).then((g) => (onProgress?.(), g)),
    ]);

    root = main.scene;
    prepareStumpMaterials(root, { castShadow: true });

    const placement = data.scene.getObjectByName("instance");

    // 小游戏：远景用 LOD；Web / 缺 LOD 时退回全模 clone
    if (IS_MINIGAME) {
      try {
        const lodUrl = assetUrl("/assets/stump_lod.gltf");
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
      prepareStumpMaterials(farRoot, { castShadow: true });
    }

    if (placement) {
      placement.updateWorldMatrix(true, false);
      placement.matrixWorld.decompose(farRoot.position, farRoot.quaternion, farRoot.scale);
    } else {
      farRoot.position.set(-5.3, 0, 0);
      farRoot.scale.set(-1, 1, 1);
    }
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
      const disposeTree = (o: THREE.Object3D) => {
        o.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.geometry?.dispose();
          const m = mesh.material;
          Array.isArray(m) ? m.forEach((x) => x.dispose()) : m?.dispose();
        });
      };
      disposeTree(root);
      // far LOD 有独立 geometry；clone 时 geometry 与 root 共享，避免 double-dispose
      if (farRoot && farRoot !== root) {
        const shared = new Set<THREE.BufferGeometry>();
        root.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh && m.geometry) shared.add(m.geometry);
        });
        farRoot.traverse((c) => {
          const mesh = c as THREE.Mesh;
          if (!mesh.isMesh) return;
          if (mesh.geometry && !shared.has(mesh.geometry)) mesh.geometry.dispose();
        });
      }
    },
  };
}
