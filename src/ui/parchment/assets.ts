import { isMinigame } from "../../platform/env";

/** export/manifest.json 权威 insets：[L,T,R,B] */
export const NINE_SLICE = {
  panel_vellum: [60, 60, 60, 60] as const,
  strip_parchment: [24, 16, 24, 16] as const,
  chip_parchment: [20, 14, 20, 14] as const,
  chip_boost: [20, 14, 20, 14] as const,
  btn_leather: [40, 28, 40, 28] as const,
  ribbon_madder: [70, 18, 70, 18] as const,
} as const;

export type ParchmentTextureKey =
  | "bg_parchment.jpg"
  | "panel_vellum.png"
  | "strip_parchment.png"
  | "btn_leather.png"
  | "ribbon_madder.png"
  | "seal_wax.png"
  | "chip_parchment.png"
  | "chip_boost.png";

/** 主包路径：minigame/ui/parchment（非素材分包） */
export function parchmentUrl(file: ParchmentTextureKey | string): string {
  const clean = file.replace(/^\//, "");
  if (isMinigame()) {
    const harness = Boolean(
      (globalThis as { __HARNESS_CANVAS__?: boolean }).__HARNESS_CANVAS__,
    );
    return harness ? `/ui/parchment/${clean}` : `ui/parchment/${clean}`;
  }
  return `/ui/parchment/${clean}`;
}

export type TexMap = Partial<Record<ParchmentTextureKey, HTMLImageElement | ImageBitmap>>;

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

export function loadParchmentTextures(): Promise<TexMap> {
  if (cache) return Promise.resolve(cache);
  if (loading) return loading;
  loading = Promise.all(
    KEYS.map(async (k) => {
      try {
        const img = await loadImage(parchmentUrl(k));
        return [k, img] as const;
      } catch {
        return [k, null] as const;
      }
    }),
  ).then((pairs) => {
    const map: TexMap = {};
    for (const [k, img] of pairs) {
      if (img) map[k] = img;
    }
    cache = map;
    return map;
  });
  return loading;
}

export function getParchmentTextures(): TexMap {
  return cache || {};
}
