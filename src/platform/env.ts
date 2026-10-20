/**
 * 运行环境探测与素材根路径。
 * Web / 微信小游戏共用；小游戏入口可在启动前设置 `__FIREWOOD_ASSET_BASE__`。
 */

export type RuntimeKind = "web" | "minigame";

declare global {
  // eslint-disable-next-line no-var
  var __FIREWOOD_ASSET_BASE__: string | undefined;
  // eslint-disable-next-line no-var
  var __FIREWOOD_RUNTIME__: RuntimeKind | undefined;
  // eslint-disable-next-line no-var
  var canvas: HTMLCanvasElement | undefined;
  // eslint-disable-next-line no-var
  var wx: unknown;
}

export function getRuntime(): RuntimeKind {
  if (typeof globalThis.__FIREWOOD_RUNTIME__ === "string") {
    return globalThis.__FIREWOOD_RUNTIME__;
  }
  if (typeof globalThis.wx !== "undefined" && typeof globalThis.canvas !== "undefined") {
    return "minigame";
  }
  return "web";
}

export function isMinigame(): boolean {
  return getRuntime() === "minigame";
}

/** 素材 URL 根路径，末尾带 `/`。小游戏可指向分包或远程目录。 */
export function getAssetBase(): string {
  const override = globalThis.__FIREWOOD_ASSET_BASE__;
  if (typeof override === "string" && override.length > 0) {
    return override.endsWith("/") ? override : `${override}/`;
  }
  // Vite 注入；esbuild 小游戏构建会 define 成 "./"
  try {
    return import.meta.env.BASE_URL;
  } catch {
    return "./";
  }
}

export function assetUrl(path: string): string {
  const clean = path.replace(/^\//, "");
  return `${getAssetBase()}${clean}`;
}
