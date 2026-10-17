import * as THREE from "three";
import { TEXTURES } from "../config/assets";
import type { ProgressFn } from "../core/loading";

export interface WoodMaterials {
  /** 原木圆周表面的树皮 */
  side: THREE.MeshStandardMaterial;
  /** 原木上下端面的年轮 */
  top: THREE.MeshStandardMaterial;
  /** 劈开后露出的新鲜切面 */
  inner: THREE.MeshStandardMaterial;
  dispose(): void;
}

export async function loadWoodMaterials(onProgress?: ProgressFn): Promise<WoodMaterials> {
  const loader = new THREE.TextureLoader();

  const load = (url: string, srgb: boolean, repeat = false) =>
    loader.loadAsync(url).then((tex) => {
      if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
      if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 8;
      onProgress?.();
      return tex;
    });

  const [barkColor, barkNormal, endColor, endNormal, innerColor, innerNormal] = await Promise.all([
    load(TEXTURES.barkColor, true, true),
    load(TEXTURES.barkNormal, false, true),
    load(TEXTURES.endColor, true),
    load(TEXTURES.endNormal, false),
    load(TEXTURES.innerColor, true, true),
    load(TEXTURES.innerNormal, false, true),
  ]);

  const side = new THREE.MeshStandardMaterial({
    map: barkColor,
    normalMap: barkNormal,
    normalScale: new THREE.Vector2(2, 2),
    roughness: 0.7,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  const top = new THREE.MeshStandardMaterial({
    map: endColor,
    normalMap: endNormal,
    normalScale: new THREE.Vector2(1.5, 1.5),
    roughness: 0.7,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  const inner = new THREE.MeshStandardMaterial({
    map: innerColor,
    normalMap: innerNormal,
    normalScale: new THREE.Vector2(1.5, 1.5),
    roughness: 0.7,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  const textures = [barkColor, barkNormal, endColor, endNormal, innerColor, innerNormal];
  return {
    side,
    top,
    inner,
    dispose() {
      side.dispose();
      top.dispose();
      inner.dispose();
      textures.forEach((t) => t.dispose());
    },
  };
}
