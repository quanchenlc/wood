import type { ArtSetCatalogEntry, ArtSetId, ArtSetManifest } from "./types";

/** 四套固定目录；标签可被各套 manifest.label 覆盖 */
export const ART_SET_CATALOG: readonly ArtSetCatalogEntry[] = [
  {
    id: "set0",
    label: "原版",
    subpackage: null,
    // 与现网一致：__FIREWOOD_ASSET_BASE__ + assets/...
    root: "assets/",
  },
  {
    id: "set1",
    label: "晨林写实",
    subpackage: "art-set1",
    root: "subpackages/art-set1/",
  },
  {
    id: "set2",
    label: "卡通低多边形",
    subpackage: "art-set2",
    root: "subpackages/art-set2/",
  },
  {
    id: "set3",
    label: "手绘温馨",
    subpackage: "art-set3",
    root: "subpackages/art-set3/",
  },
  {
    id: "set4",
    label: "羊皮纸",
    subpackage: "art-set4",
    root: "subpackages/art-set4/",
  },
] as const;

export const DEFAULT_ART_SET: ArtSetId = "set0";

export const STORAGE_KEY_ART_SET = "fw_art_set";

/** set0 内置默认（无网络时的兜底，与 art-sets/set0/manifest.json 对齐） */
export const SET0_DEFAULT_MANIFEST: ArtSetManifest = {
  id: "set0",
  label: "原版",
  version: 1,
  files: {
    axe: "axe.gltf",
    stump: "stump.gltf",
    stumpLod: "stump_lod.gltf",
    stumpData: "stump_data.glb",
    barkColor: "outsidebark.jpg",
    barkNormal: "outsidebark_n.jpg",
    endColor: "top.jpg",
    endNormal: "top_n.jpg",
    innerColor: "insidegrain.jpg",
    innerNormal: "insidegrain_n.jpg",
  },
  sky: "#9fc4e0",
  fog: "#9fc4e0",
  ground: "#3f4a26",
  grass: {
    deep: [0.07, 0.17, 0.05],
    fresh: [0.24, 0.45, 0.11],
    dry: [0.34, 0.36, 0.14],
  },
};

export function isArtSetId(v: string): v is ArtSetId {
  return v === "set0" || v === "set1" || v === "set2" || v === "set3" || v === "set4";
}

export function catalogEntry(id: ArtSetId): ArtSetCatalogEntry {
  return ART_SET_CATALOG.find((e) => e.id === id)!;
}
