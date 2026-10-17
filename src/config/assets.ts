/**
 * 素材清单 —— 全项目唯一的素材引用点。
 *
 * 运行时文件放在 `public/assets` 和 `public/basis`,Vite 构建时原样拷进 dist。
 * 小游戏构建会把同一批文件拷到分包目录，并通过 `getAssetBase()` 解析路径。
 * 路径用 getter 惰性求值，方便启动时先 loadSubpackage / 设远程根再读。
 */

import { assetUrl, isMinigame } from "../platform/env";

const href = (path: string) => assetUrl(path);

const range = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

export const TEXTURES = {
  get barkColor() {
    return href("/assets/outsidebark.jpg");
  },
  get barkNormal() {
    return href("/assets/outsidebark_n.jpg");
  },
  get endColor() {
    return href("/assets/top.jpg");
  },
  get endNormal() {
    return href("/assets/top_n.jpg");
  },
  get innerColor() {
    return href("/assets/insidegrain.jpg");
  },
  get innerNormal() {
    return href("/assets/insidegrain_n.jpg");
  },
} as const;

export const MODELS = {
  get stump() {
    // 小游戏：.gltf + 分包内独立 jpg，避免 GLB 嵌图走 Blob/btoa
    return isMinigame()
      ? href("/assets/stump.gltf")
      : href("/assets/stump_v02_mesh_warm_ktx2_2048.glb");
  },
  get stumpData() {
    return href("/assets/stump_v02_data.glb");
  },
  get axe() {
    return isMinigame()
      ? href("/assets/axe.gltf")
      : href("/assets/ax_v01_reduced_compressed.glb");
  },
  get axeAnimation() {
    return href("/assets/ax_anim_v03_glb.glb");
  },
} as const;

/** basis_transcoder.js / .wasm 所在目录,KTX2Loader 要求以斜杠结尾 */
export function basisPath(): string {
  return href("/basis/");
}

export const SOUNDS = {
  get bg() {
    return [href("/assets/sounds/bg.mp3")];
  },
  get drop() {
    return [href("/assets/sounds/drop.mp3")];
  },
  get split() {
    return range("/assets/sounds/split", 6).map((s) => href(`${s}.mp3`));
  },
  get splitBreak() {
    return range("/assets/sounds/splitb", 10).map((s) => href(`${s}.mp3`));
  },
  get stack() {
    return range("/assets/sounds/stack", 14).map((s) => href(`${s}.mp3`));
  },
} as const;

export type SoundGroup = keyof typeof SOUNDS;

/** 加载进度条的分母:6 张贴图 + 4 个模型 + 全部音频 */
export const TOTAL_ASSETS =
  Object.keys(TEXTURES).length +
  Object.keys(MODELS).length +
  // bg1 + drop1 + split6 + splitb10 + stack14
  1 +
  1 +
  6 +
  10 +
  14;
