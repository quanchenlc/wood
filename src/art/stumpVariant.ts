/** 木桩 A/B 变体：CC0 扫描 (A) vs 程序生成 (B) */

import { assetUrl } from "../platform/env";

export type StumpVariantId = "A" | "B";

export const STORAGE_KEY_STUMP = "fw_stump_variant";

export function readStumpVariant(): StumpVariantId {
  try {
    const wx = (globalThis as { wx?: { getStorageSync?: (k: string) => unknown } }).wx;
    const v = wx?.getStorageSync?.(STORAGE_KEY_STUMP);
    if (v === "B" || v === "A") return v;
    if (typeof localStorage !== "undefined") {
      const s = localStorage.getItem(STORAGE_KEY_STUMP);
      if (s === "B" || s === "A") return s;
    }
  } catch {
    /* ignore */
  }
  return "A";
}

export function writeStumpVariant(id: StumpVariantId) {
  try {
    const wx = (globalThis as { wx?: { setStorageSync?: (k: string, v: string) => void } }).wx;
    wx?.setStorageSync?.(STORAGE_KEY_STUMP, id);
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY_STUMP, id);
  } catch {
    /* ignore */
  }
}

export function stumpVariantUrls(id: StumpVariantId) {
  const folder = id === "B" ? "stump-b" : "stump-a";
  const file = (name: string) => assetUrl(`/assets/${folder}/${name}`);
  return {
    stump: file("stump.gltf"),
    stumpLod: file("stump_lod.gltf"),
    stumpData: file("stump_data.glb"),
    groundFloor: file("ground_floor.jpg"),
    label: id === "A" ? "木桩 A · 扫描" : "木桩 B · 程序",
  };
}
