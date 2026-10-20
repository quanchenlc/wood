import { assetUrl, getAssetBase, isMinigame } from "../platform/env";
import { SET0_DEFAULT_MANIFEST, catalogEntry } from "./registry";
import type { ArtSetFileMap, ArtSetId, ArtSetManifest } from "./types";

/**
 * 解析某套装下的文件 URL。
 * - set0：走现有 getAssetBase()+assets/（与 TEXTURES/MODELS 兼容）
 * - set1–3：分包根 + 相对路径；harness 下补前导 /
 */
export function artFileUrl(setId: ArtSetId, relativePath: string): string {
  const clean = relativePath.replace(/^\.\//, "").replace(/^\//, "");
  const entry = catalogEntry(setId);

  if (setId === "set0") {
    // 现网：base=subpackages/assets/ + assets/axe.gltf
    return assetUrl(`assets/${clean}`);
  }

  let root = entry.root;
  if (isMinigame() && typeof globalThis !== "undefined") {
    const harness = Boolean((globalThis as { __HARNESS_CANVAS__?: boolean }).__HARNESS_CANVAS__);
    if (harness && !root.startsWith("/")) root = `/${root}`;
  }
  if (!root.endsWith("/")) root += "/";
  return `${root}${clean}`;
}

/** 有效文件表：有 fallback 时合并 fallback 的 files */
export function effectiveFiles(
  manifest: ArtSetManifest,
  fallbackManifest?: ArtSetManifest | null,
): ArtSetFileMap {
  const base = fallbackManifest?.files || SET0_DEFAULT_MANIFEST.files || {};
  return { ...base, ...(manifest.files || {}) };
}

export function resolveFile(
  setId: ArtSetId,
  manifest: ArtSetManifest,
  key: keyof ArtSetFileMap,
  fallbackManifest?: ArtSetManifest | null,
): string | null {
  // 本套显式交付的文件
  const ownRel = manifest.files?.[key];
  if (ownRel) return artFileUrl(setId, ownRel);

  // 声明了 fallback（通常 set0）→ 从 fallback 清单取
  if (manifest.fallback) {
    const fbFiles = fallbackManifest?.files || SET0_DEFAULT_MANIFEST.files || {};
    const rel = fbFiles[key];
    if (!rel) return null;
    return artFileUrl(manifest.fallback as ArtSetId, rel);
  }

  // 无 fallback：不要把 SET0_DEFAULT 的键误解析到本套根路径
  // （如 stumpData 共享资源由 buildUrls 的 req 回落到 set0）
  return null;
}

/** set0 在 Web 上仍可用嵌图 GLB；小游戏强制外置路径由 caller 决定 */
export function set0UsesExternalGltf(): boolean {
  return import.meta.env.MODE === "minigame" || isMinigame();
}

export function describeActiveBase(setId: ArtSetId): string {
  if (setId === "set0") return getAssetBase();
  return catalogEntry(setId).root;
}
