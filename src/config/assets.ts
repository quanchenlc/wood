/**
 * 素材清单 —— 全项目唯一的素材引用点。
 *
 * 运行时文件放在 `public/assets` 和 `public/basis`,Vite 构建时原样拷进 dist。
 * 小游戏构建会把同一批文件拷到分包目录，并通过 `getAssetBase()` 解析路径。
 * 路径用 getter 惰性求值，方便启动时先 loadSubpackage / 设远程根再读。
 */

import { assetUrl } from "../platform/env";

const href = (path: string) => assetUrl(path);

const range = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

export const TEXTURES = {
  get barkColor() {
    return href("/assets/outsidebark.jpg");
  },
  get barkNormal() {
    return href("/assets/outsidebark_n.png");
  },
  get endColor() {
    return href("/assets/top.jpg");
  },
  get endNormal() {
    return href("/assets/top_n.png");
  },
  get innerColor() {
    return href("/assets/insidegrain.jpg");
  },
  get innerNormal() {
    return href("/assets/insidegrain_n.png");
  },
} as const;

export const MODELS = {
  get stump() {
    // 0.4.0：自研 / CC0 树桩外置 glTF（A/B 变体由 runtime 覆盖）
    return href("/assets/stump.gltf");
  },
  get stumpData() {
    return href("/assets/stump_data.glb");
  },
  get axe() {
    // 自研木柄斧占位（build_axe_placeholder.mjs）
    return href("/assets/axe.gltf");
  },
} as const;

/** 木桩 A/B 资源根（相对 /assets/） */
export function stumpVariantRoot(variant: "A" | "B"): string {
  return variant === "B" ? "/assets/stump-b/" : "/assets/stump-a/";
}

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

/** 加载进度条的分母:6 张贴图 + 3 个模型 + 全部音频 */
export const TOTAL_ASSETS =
  Object.keys(TEXTURES).length +
  Object.keys(MODELS).length +
  // bg1 + drop1 + split6 + splitb10 + stack14
  1 +
  1 +
  6 +
  10 +
  14;
