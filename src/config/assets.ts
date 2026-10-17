/**
 * 素材清单 —— 全项目唯一的素材引用点。
 *
 * 运行时文件放在 `public/assets` 和 `public/basis`,Vite 构建时原样拷进 dist。
 * 路径走 import.meta.env.BASE_URL,配合 vite.config 的 `base: "./"`,
 * 无论是根路径、子目录还是直接打开 dist/index.html 都能找到。
 */

/** 开发是 `/`,构建是 `./`,子路径部署则是对应前缀 */
const root = import.meta.env.BASE_URL;

const href = (path: string) => `${root}${path.replace(/^\//, "")}`;

const range = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

export const TEXTURES = {
  /** 树皮:侧面 */
  barkColor: href("/assets/outsidebark.jpg"),
  barkNormal: href("/assets/outsidebark_n.jpg"),
  /** 原木上下两个端面(未劈开时的年轮) */
  endColor: href("/assets/top.jpg"),
  endNormal: href("/assets/top_n.jpg"),
  /** 劈开后露出的内部木纹 */
  innerColor: href("/assets/insidegrain.jpg"),
  innerNormal: href("/assets/insidegrain_n.jpg"),
} as const;

export const MODELS = {
  /** 树桩本体,贴图用 KTX2 压缩,需要 basis transcoder */
  stump: href("/assets/stump_v02_mesh_warm_ktx2_2048.glb"),
  /** 树桩的碰撞体与副本摆放点,是个只含空节点的轻量 GLB */
  stumpData: href("/assets/stump_v02_data.glb"),
  axe: href("/assets/ax_v01_reduced_compressed.glb"),
  axeAnimation: href("/assets/ax_anim_v03_glb.glb"),
} as const;

/** basis_transcoder.js / .wasm 所在目录,KTX2Loader 要求以斜杠结尾 */
export const BASIS_PATH = href("/basis/");

export const SOUNDS = {
  bg: [href("/assets/sounds/bg.mp3")],
  /** 木块落地 */
  drop: [href("/assets/sounds/drop.mp3")],
  /** 劈开瞬间的脆裂声 */
  split: range("/assets/sounds/split", 6).map((s) => href(`${s}.mp3`)),
  /** 劈开后的木头分离声,比 split 长 */
  splitBreak: range("/assets/sounds/splitb", 10).map((s) => href(`${s}.mp3`)),
  /** 码垛时木头互相碰撞 */
  stack: range("/assets/sounds/stack", 14).map((s) => href(`${s}.mp3`)),
} as const;

export type SoundGroup = keyof typeof SOUNDS;

/** 加载进度条的分母:6 张贴图 + 4 个模型 + 全部音频 */
export const TOTAL_ASSETS =
  Object.keys(TEXTURES).length +
  Object.keys(MODELS).length +
  Object.values(SOUNDS).reduce((n, list) => n + list.length, 0);
