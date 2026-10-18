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
  const files = effectiveFiles(manifest, fallbackManifest);
  const rel = files[key];
  if (!rel) return null;
  // 本套未提供该文件且声明了 fallback → 从 fallback 套的根路径取
  const own = Boolean(manifest.files?.[key]);
  const sourceId = (own ? setId : (manifest.fallback as ArtSetId | undefined) || setId) as ArtSetId;
  return artFileUrl(sourceId, rel);
}

/** set0 在 Web 上仍可用嵌图 GLB；小游戏强制外置路径由 caller 决定 */
export function set0UsesExternalGltf(): boolean {
  return import.meta.env.MODE === "minigame" || isMinigame();
}

export function describeActiveBase(setId: ArtSetId): string {
  if (setId === "set0") return getAssetBase();
  return catalogEntry(setId).root;
}
