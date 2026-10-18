import * as THREE from "three";
import { MODELS } from "../config/assets";
import { GROUND_Y, INCH } from "../config/constants";
import { createGltfLoader } from "../core/gltf";
import type { ProgressFn } from "../core/loading";

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

export async function loadStump(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  onProgress?: ProgressFn,
): Promise<Stump> {
  const loader = createGltfLoader(renderer);
  let root: THREE.Object3D;

  try {
    const [main, data] = await Promise.all([
      loader.loadAsync(MODELS.stump).then((g) => (onProgress?.(), g)),
      loader.loadAsync(MODELS.stumpData).then((g) => (onProgress?.(), g)),
    ]);

    root = main.scene;
    root.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
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
      // glTF 的 baseColor 会与贴图相乘。强制白色，避免素材自带 tint 把树皮染灰。
      mat.color.set(0xffffff);
      // 原模型烘焙过高光,这里压平一点让它吃场景光而不是自带反射
      mat.roughness = Math.max(mat.roughness, 0.7);
      mat.metalness = 0;
    });

    // data GLB 里放着副本树桩的摆放点,复制一个摆在旁边做前景
    const placement = data.scene.getObjectByName("instance");
    {
      const clone = root.clone(true);
      if (placement) {
        placement.updateWorldMatrix(true, false);
        placement.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
      } else {
        // 线上 data GLB 没有 instance 节点时，原站仍会摆一棵镜像的远景树桩。
        clone.position.set(-5.3, 0, 0);
        clone.scale.set(-1, 1, 1);
      }
      clone.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      scene.add(clone);
    }
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
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const m = mesh.material;
          Array.isArray(m) ? m.forEach((x) => x.dispose()) : m?.dispose();
        }
      });
    },
  };
}
