import * as THREE from "three";
import type { ProgressFn } from "../core/loading";
import { loadWoodMaterials, type WoodMaterials } from "../wood/materials";
import { loadStump, type Stump } from "../world/stump";
import type { Grass } from "../world/grass";
import {
  ART_SET_CATALOG,
  DEFAULT_ART_SET,
  SET0_DEFAULT_MANIFEST,
  catalogEntry,
} from "./registry";
import { artFileUrl, effectiveFiles, resolveFile } from "./paths";
import { loadArtSubpackage } from "./subpackage";
import { readStoredArtSet, writeStoredArtSet } from "./storage";
import type { ArtSetGrassColors, ArtSetId, ArtSetManifest } from "./types";

export interface ArtSetUrls {
  axe: string;
  stump: string;
  stumpLod: string | null;
  stumpData: string;
  barkColor: string;
  barkNormal: string;
  endColor: string;
  endNormal: string;
  innerColor: string;
  innerNormal: string;
  groundColor: string | null;
}

export interface ArtSetResolved {
  id: ArtSetId;
  label: string;
  manifest: ArtSetManifest;
  urls: ArtSetUrls;
  sky: string;
  fog: string;
  ground: string;
  grass: ArtSetGrassColors;
}

async function fetchManifest(setId: ArtSetId): Promise<ArtSetManifest> {
  if (setId === "set0") {
    try {
      const url = artFileUrl("set0", "manifest.json");
      const res = await fetch(url);
      if (res.ok) return (await res.json()) as ArtSetManifest;
    } catch {
      /* use default */
    }
    return { ...SET0_DEFAULT_MANIFEST };
  }

  const url = artFileUrl(setId, "manifest.json");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`manifest missing for ${setId}: ${url}`);
  return (await res.json()) as ArtSetManifest;
}

function buildUrls(setId: ArtSetId, manifest: ArtSetManifest, fb: ArtSetManifest | null): ArtSetUrls {
  const files = effectiveFiles(manifest, fb);
  const req = (key: keyof typeof files, fallbackRel: string) => {
    const u = resolveFile(setId, manifest, key, fb);
    if (u) return u;
    return artFileUrl((manifest.fallback as ArtSetId) || "set0", fallbackRel);
  };
  return {
    axe: req("axe", "axe.gltf"),
    stump: req("stump", "stump.gltf"),
    stumpLod: resolveFile(setId, manifest, "stumpLod", fb),
    stumpData: req("stumpData", "stump_v02_data.glb"),
    barkColor: req("barkColor", "outsidebark.jpg"),
    barkNormal: req("barkNormal", "outsidebark_n.jpg"),
    endColor: req("endColor", "top.jpg"),
    endNormal: req("endNormal", "top_n.jpg"),
    innerColor: req("innerColor", "insidegrain.jpg"),
    innerNormal: req("innerNormal", "insidegrain_n.jpg"),
    groundColor: resolveFile(setId, manifest, "groundColor", fb),
  };
}

/**
 * 美术套装：解析 manifest、按需分包、产出可加载 URL。
 * 真正的场景替换由 main 里的 apply 完成（dispose + 重载）。
 */
export class ArtSetController {
  activeId: ArtSetId = DEFAULT_ART_SET;
  private cache = new Map<ArtSetId, ArtSetResolved>();
  private set0Manifest: ArtSetManifest = { ...SET0_DEFAULT_MANIFEST };

  labels(): { id: ArtSetId; label: string }[] {
    return ART_SET_CATALOG.map((e) => {
      const cached = this.cache.get(e.id);
      return { id: e.id, label: cached?.label || e.label };
    });
  }

  async initFromStorage(
    onProgress?: (p: number, text: string) => void,
  ): Promise<ArtSetResolved> {
    this.set0Manifest = await fetchManifest("set0");
    this.cache.set("set0", this.resolveLocal("set0", this.set0Manifest, null));

    const preferred = readStoredArtSet();
    if (preferred === "set0") {
      this.activeId = "set0";
      return this.cache.get("set0")!;
    }
    return this.ensureLoaded(preferred, onProgress);
  }

  private resolveLocal(
    id: ArtSetId,
    manifest: ArtSetManifest,
    fb: ArtSetManifest | null,
  ): ArtSetResolved {
    const grass = manifest.grass || fb?.grass || SET0_DEFAULT_MANIFEST.grass!;
    return {
      id,
      label: manifest.label || catalogEntry(id).label,
      manifest,
      urls: buildUrls(id, manifest, fb),
      sky: manifest.sky || fb?.sky || SET0_DEFAULT_MANIFEST.sky!,
      fog: manifest.fog || fb?.fog || SET0_DEFAULT_MANIFEST.fog!,
      ground: manifest.ground || fb?.ground || SET0_DEFAULT_MANIFEST.ground!,
      grass,
    };
  }

  async ensureLoaded(
    id: ArtSetId,
    onProgress?: (p: number, text: string) => void,
  ): Promise<ArtSetResolved> {
    const hit = this.cache.get(id);
    if (hit) {
      this.activeId = id;
      return hit;
    }

    await loadArtSubpackage(id, onProgress);
    const manifest = await fetchManifest(id);
    let fb: ArtSetManifest | null = null;
    if (manifest.fallback === "set0") fb = this.set0Manifest;
    else if (manifest.fallback) {
      fb = (await this.ensureLoaded(manifest.fallback as ArtSetId, onProgress)).manifest;
    }
    const resolved = this.resolveLocal(id, manifest, fb);
    this.cache.set(id, resolved);
    this.activeId = id;
    return resolved;
  }

  persist(id: ArtSetId) {
    writeStoredArtSet(id);
    this.activeId = id;
  }
}

/** 便捷：按 resolved urls 加载木头材质 */
export async function loadWoodMaterialsForSet(
  urls: ArtSetUrls,
  onProgress?: ProgressFn,
): Promise<WoodMaterials> {
  return loadWoodMaterials(onProgress, {
    barkColor: urls.barkColor,
    barkNormal: urls.barkNormal,
    endColor: urls.endColor,
    endNormal: urls.endNormal,
    innerColor: urls.innerColor,
    innerNormal: urls.innerNormal,
  });
}

export async function loadStumpForSet(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  urls: ArtSetUrls,
  onProgress?: ProgressFn,
): Promise<Stump> {
  return loadStump(scene, renderer, onProgress, {
    stump: urls.stump,
    stumpLod: urls.stumpLod || undefined,
    stumpData: urls.stumpData,
  });
}

export function applyEnvironment(scene: THREE.Scene, set: ArtSetResolved) {
  scene.background = new THREE.Color(set.sky);
  if (scene.fog && (scene.fog as THREE.Fog).isFog) {
    (scene.fog as THREE.Fog).color.set(set.fog);
  } else {
    scene.fog = new THREE.Fog(set.fog, 6, 22);
  }
}

export function applyGroundLook(
  ground: THREE.Mesh,
  set: ArtSetResolved,
  groundMap: THREE.Texture | null,
) {
  const mat = ground.material as THREE.MeshStandardMaterial;
  mat.color.set(set.ground);
  if (mat.map && mat.map !== groundMap) {
    mat.map.dispose();
  }
  mat.map = groundMap;
  if (groundMap) {
    groundMap.colorSpace = THREE.SRGBColorSpace;
    groundMap.wrapS = groundMap.wrapT = THREE.ClampToEdgeWrapping;
  }
  mat.needsUpdate = true;
}

export function applyGrassColors(grass: Grass, colors: ArtSetGrassColors) {
  grass.setColors?.(colors.deep, colors.fresh, colors.dry);
}
