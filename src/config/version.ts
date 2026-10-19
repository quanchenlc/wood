/**
 * App version label — injected at build from minigame/version.js.
 * esbuild (minigame) and vite both define __FW_APP_VERSION__ / __FW_APP_BUILD_NOTE__.
 */
declare const __FW_APP_VERSION__: string | undefined;
declare const __FW_APP_BUILD_NOTE__: string | undefined;

export const APP_VERSION: string =
  typeof __FW_APP_VERSION__ !== "undefined" ? __FW_APP_VERSION__ : "0.0.0-dev";

export const APP_BUILD_NOTE: string =
  typeof __FW_APP_BUILD_NOTE__ !== "undefined" ? __FW_APP_BUILD_NOTE__ : "dev";

/** e.g. "v0.4.5 · final-A-textures" */
export function appVersionLabel(): string {
  return `v${APP_VERSION} · ${APP_BUILD_NOTE}`;
}
