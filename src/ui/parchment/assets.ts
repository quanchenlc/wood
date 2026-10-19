import { isMinigame } from "../../platform/env";
import type { Insets } from "./nineSlice";

export type TexId =
  | "btn_icon_ad"
  | "btn_icon_help"
  | "btn_icon_rank"
  | "btn_icon_style"
  | "btn_leather"
  | "drawer_vellum"
  | "guide_bubble"
  | "guide_hand"
  | "guide_ring"
  | "guide_tail"
  | "icon_check"
  | "panel_vellum"
  | "ribbon_madder"
  | "roll_paper"
  | "roll_shadow"
  | "strip_parchment"
  | "tag_madder"
  | "tag_parchment";

export interface ManifestVariant {
  file: string;
  bytes: number;
  width: number;
  height: number;
  scale?: number;
  nine_slice_insets?: Insets | null;
}

export interface ManifestTexture {
  file: string;
  logical_size: [number, number];
  scale?: number;
  visual_pad_pt?: number;
  nine_slice_insets_pt?: Insets | null;
  nine_slice_insets_2x?: Insets | null;
  nine_slice_insets?: Insets | null;
  variants: {
    "2x"?: ManifestVariant;
    "3x"?: ManifestVariant;
  };
  role?: string;
}

export interface UiManifest {
  version?: string;
  textures: ManifestTexture[];
}

export interface ParchmentTex {
  id: TexId;
  img: HTMLImageElement;
  density: 2 | 3;
  logicalW: number;
  logicalH: number;
  srcInsets: Insets | null;
  dstInsets: Insets | null;
  visualPadPt: number;
}

export type TexMap = Partial<Record<TexId, ParchmentTex>>;

let manifestCache: UiManifest | null = null;
let texCache: TexMap | null = null;
let loading: Promise<TexMap> | null = null;
let uiDpr = 2;

export function setUiDpr(dpr: number) {
  uiDpr = Math.min(Math.max(1, dpr), 3);
}

export function getUiDpr(): number {
  return uiDpr;
}

function baseUrl(): string {
  if (isMinigame()) {
    const harness = Boolean(
      (globalThis as { __HARNESS_CANVAS__?: boolean }).__HARNESS_CANVAS__,
    );
    return harness ? "/subpackages/ui-parchment/" : "subpackages/ui-parchment/";
  }
  return "/ui/parchment/";
}

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
    img.onerror = () => reject(new Error(`ui tex fail: ${url}`));
    img.src = url;
  });
}

function loadJson(url: string): Promise<UiManifest> {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, false);
    xhr.send(null);
    if (xhr.status === 200 || xhr.status === 0) {
      return Promise.resolve(JSON.parse(xhr.responseText) as UiManifest);
    }
  } catch {
    /* fall through */
  }
  const wxApi = (globalThis as {
    wx?: {
      request?: (o: {
        url: string;
        success: (r: { data: unknown }) => void;
        fail: (e: unknown) => void;
      }) => void;
    };
  }).wx;
  if (wxApi?.request) {
    return new Promise<UiManifest>((resolve, reject) => {
      wxApi.request!({
        url,
        success: (r) => {
          const data = r.data;
          if (typeof data === "string") resolve(JSON.parse(data) as UiManifest);
          else resolve(data as UiManifest);
        },
        fail: reject,
      });
    });
  }
  return fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`manifest ${r.status}`);
    return r.json();
  });
}

function idFromFile(file: string): TexId {
  return file.replace(/@[23]x\.(png|jpg|jpeg)$/i, "").replace(/\.(png|jpg|jpeg)$/i, "") as TexId;
}

function pickVariant(
  entry: ManifestTexture,
  dpr: number,
): { density: 2 | 3; variant: ManifestVariant } | null {
  const v3 = entry.variants?.["3x"];
  const v2 = entry.variants?.["2x"];
  // v3.1: dpr>=2.5 → 3x if present
  if (dpr >= 2.5 && v3?.file) return { density: 3, variant: v3 };
  if (v2?.file) return { density: 2, variant: v2 };
  if (v3?.file) return { density: 3, variant: v3 };
  return null;
}

/** 源 insets：优先用所选 variant 自带的 insets，否则顶层 @2x / 兼容字段 */
function srcInsetsFor(
  entry: ManifestTexture,
  density: 2 | 3,
  variant: ManifestVariant,
): Insets | null {
  if (variant.nine_slice_insets) return variant.nine_slice_insets;
  if (density === 2) {
    return entry.nine_slice_insets_2x ?? entry.nine_slice_insets ?? null;
  }
  return entry.nine_slice_insets ?? entry.nine_slice_insets_2x ?? null;
}

export async function ensureUiSubpackage(
  onProgress?: (p: number, text: string) => void,
): Promise<void> {
  if (!isMinigame()) {
    onProgress?.(1, "UI就绪");
    return;
  }
  const wxApi = (globalThis as {
    wx?: {
      loadSubpackage?: (opts: {
        name: string;
        success: () => void;
        fail: (e: unknown) => void;
      }) => { onProgressUpdate?: (cb: (r: { progress?: number }) => void) => void };
    };
  }).wx;
  if (!wxApi?.loadSubpackage) {
    onProgress?.(1, "UI就绪");
    return;
  }
  onProgress?.(0, "加载界面");
  await new Promise<void>((resolve) => {
    const task = wxApi.loadSubpackage!({
      name: "ui-parchment",
      success: () => {
        onProgress?.(1, "界面就绪");
        resolve();
      },
      fail: (err) => {
        console.warn("[ui] loadSubpackage ui-parchment", err);
        onProgress?.(1, "界面就绪");
        resolve();
      },
    });
    task?.onProgressUpdate?.((res) => {
      const p = typeof res.progress === "number" ? res.progress / 100 : 0;
      onProgress?.(Math.max(0, Math.min(1, p)), "下载界面");
    });
  });
}

export async function loadParchmentTextures(dpr = uiDpr): Promise<TexMap> {
  setUiDpr(dpr);
  if (texCache) return texCache;
  if (loading) return loading;

  loading = (async () => {
    await ensureUiSubpackage();
    const base = baseUrl();
    if (!manifestCache) {
      manifestCache = await loadJson(`${base}manifest.json`);
    }
    const map: TexMap = {};
    await Promise.all(
      manifestCache.textures.map(async (entry) => {
        const picked = pickVariant(entry, uiDpr);
        if (!picked) return;
        const id = idFromFile(entry.file);
        try {
          const img = await loadImage(`${base}${picked.variant.file}`);
          map[id] = {
            id,
            img,
            density: picked.density,
            // 始终用 logical_size（pt），避免 0.3.3 manifest 错写导致 px/scale 缩到 2/3
            logicalW: entry.logical_size[0],
            logicalH: entry.logical_size[1],
            srcInsets: srcInsetsFor(entry, picked.density, picked.variant),
            dstInsets: entry.nine_slice_insets_pt ?? null,
            visualPadPt: entry.visual_pad_pt ?? 0,
          };
        } catch (err) {
          console.warn("[ui] tex miss", picked.variant.file, err);
        }
      }),
    );
    texCache = map;
    return map;
  })();

  return loading;
}

/** 测试/热换时可清缓存 */
export function clearParchmentTextureCache() {
  texCache = null;
  loading = null;
  manifestCache = null;
}

export function getParchmentTextures(): TexMap {
  return texCache || {};
}

export function getManifest(): UiManifest | null {
  return manifestCache;
}

export const NINE_SLICE = {} as const;
export function parchmentUrl(file: string): string {
  return `${baseUrl()}${file.replace(/^\//, "")}`;
}
export function at2xName(file: string): string {
  return file;
}
export function scaledInsets(
  base: Insets,
  _tex?: ParchmentTex,
): [number, number, number, number] {
  return [base[0], base[1], base[2], base[3]];
}
