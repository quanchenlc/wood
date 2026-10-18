import { isMinigame } from "../../platform/env";

/** export/manifest.json 权威 insets：[L,T,R,B]（1x 源像素） */
export const NINE_SLICE = {
  panel_vellum: [60, 60, 60, 60] as const,
  strip_parchment: [24, 16, 24, 16] as const,
  chip_parchment: [20, 14, 20, 14] as const,
  chip_boost: [20, 14, 20, 14] as const,
  btn_leather: [40, 28, 40, 28] as const,
  ribbon_madder: [70, 18, 70, 18] as const,
} as const;

/** 1x 逻辑尺寸（用于 @2x 时推算 inset 缩放） */
export const LOGICAL_SIZE: Record<string, { w: number; h: number }> = {
  "bg_parchment.jpg": { w: 576, h: 1024 },
  "btn_leather.png": { w: 340, h: 120 },
  "chip_boost.png": { w: 280, h: 64 },
  "chip_parchment.png": { w: 280, h: 64 },
  "panel_vellum.png": { w: 400, h: 300 },
  "ribbon_madder.png": { w: 380, h: 75 },
  "seal_wax.png": { w: 128, h: 129 },
  "strip_parchment.png": { w: 360, h: 80 },
};

export type ParchmentTextureKey =
  | "bg_parchment.jpg"
  | "panel_vellum.png"
  | "strip_parchment.png"
  | "btn_leather.png"
  | "ribbon_madder.png"
  | "seal_wax.png"
  | "chip_parchment.png"
  | "chip_boost.png";

export interface ParchmentTex {
  img: HTMLImageElement;
  /** 相对 1x 的倍率（@2x → 2） */
  scale: number;
}

/** 主包路径：minigame/ui/parchment（非素材分包） */
export function parchmentUrl(file: string): string {
  const clean = file.replace(/^\//, "");
  if (isMinigame()) {
    const harness = Boolean(
      (globalThis as { __HARNESS_CANVAS__?: boolean }).__HARNESS_CANVAS__,
    );
    return harness ? `/ui/parchment/${clean}` : `ui/parchment/${clean}`;
  }
  return `/ui/parchment/${clean}`;
}

/** foo.png → foo@2x.png；已带 @2x 则原样 */
export function at2xName(file: string): string {
  if (/@2x\./i.test(file)) return file;
  const i = file.lastIndexOf(".");
  if (i < 0) return `${file}@2x`;
  return `${file.slice(0, i)}@2x${file.slice(i)}`;
}

export type TexMap = Partial<Record<ParchmentTextureKey, ParchmentTex>>;

const KEYS: ParchmentTextureKey[] = [
  "bg_parchment.jpg",
  "panel_vellum.png",
  "strip_parchment.png",
  "btn_leather.png",
  "ribbon_madder.png",
  "seal_wax.png",
  "chip_parchment.png",
  "chip_boost.png",
];

let cache: TexMap | null = null;
let loading: Promise<TexMap> | null = null;

function createImageEl(): HTMLImageElement {
  const g = globalThis as {
    wx?: { createImage?: () => HTMLImageElement };
    Image?: { new (): HTMLImageElement };
  };
  if (g.wx?.createImage) return g.wx.createImage();
  if (typeof document !== "undefined") {
    try {
      return document.createElement("img");
    } catch {
      /* fall through */
    }
  }
  return new (g.Image || Image)();
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = createImageEl();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`parchment tex fail: ${url}`));
    img.src = url;
  });
}

function deviceDpr(): number {
  try {
    if (typeof wx !== "undefined") {
      const info = (
        wx as { getSystemInfoSync?: () => { pixelRatio?: number } }
      ).getSystemInfoSync?.();
      if (info?.pixelRatio) return info.pixelRatio;
    }
  } catch {
    /* ignore */
  }
  return typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
}

/**
 * 优先加载 @2x（DPR≥1.5 时），失败回落 1x。
 * 美术后续交付 `name@2x.ext` 即可自动启用，无需改代码。
 */
async function loadOne(key: ParchmentTextureKey): Promise<ParchmentTex | null> {
  const want2x = deviceDpr() >= 1.5;
  if (want2x) {
    try {
      const img = await loadImage(parchmentUrl(at2xName(key)));
      const logical = LOGICAL_SIZE[key];
      const scale = logical ? img.naturalWidth / logical.w || 2 : 2;
      return { img, scale: scale >= 1.5 ? 2 : 1 };
    } catch {
      /* fall through to 1x */
    }
  }
  try {
    const img = await loadImage(parchmentUrl(key));
    return { img, scale: 1 };
  } catch {
    return null;
  }
}

export function scaledInsets(
  base: readonly [number, number, number, number],
  tex: ParchmentTex | undefined,
): [number, number, number, number] {
  const s = tex?.scale ?? 1;
  if (s === 1) return [base[0], base[1], base[2], base[3]];
  return [
    Math.round(base[0] * s),
    Math.round(base[1] * s),
    Math.round(base[2] * s),
    Math.round(base[3] * s),
  ];
}

export function loadParchmentTextures(): Promise<TexMap> {
  if (cache) return Promise.resolve(cache);
  if (loading) return loading;
  loading = Promise.all(KEYS.map(async (k) => [k, await loadOne(k)] as const)).then((pairs) => {
    const map: TexMap = {};
    for (const [k, tex] of pairs) {
      if (tex) map[k] = tex;
    }
    cache = map;
    return map;
  });
  return loading;
}

export function getParchmentTextures(): TexMap {
  return cache || {};
}

declare const wx:
  | {
      getSystemInfoSync?: () => { pixelRatio?: number };
    }
  | undefined;
