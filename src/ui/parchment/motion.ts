/** 抽屉展开/卷回曲线 — 对齐 D_final/src/motion_math.py；H1 随竖/横屏布局变化 */

export const OPEN_MS = 350;
export const CLOSE_MS = 250;
/** main ↔ rank 纸面高度 morph（与 unroll 同 open ease） */
export const HEIGHT_MORPH_MS = 250;
const OPEN_EASE = [0.4, 0.3, 0.4, 1] as const;
const CLOSE_EASE = [0.55, 0, 0.8, 0.35] as const;
const H0_PORTRAIT = 20;
/** 竖屏首页 / 风格页 */
export const H1_PORTRAIT_MAIN = 400;
/** 竖屏柴榜：撕口下沿 600pt（D_fix_v3） */
export const H1_PORTRAIT_RANK = 600;
/** @deprecated 保留导出名；柴榜已改为固定 600pt */
export const H1_PORTRAIT_RANK_FRAC = 600 / 812;
/** 横屏：撕口下沿固定 318pt（小签 318–350） */
export const H1_LANDSCAPE = 318;
const D0 = 40;
const D1 = 14;
/** @deprecated 横屏不再用底 inset；撕口钉在 318 */
export const LANDSCAPE_INSET = 0;
const TEAR_H = 32;
/** 撕口顶叠在纸底之上：14pt 羽化须全在纸上 */
const TEAR_OVERLAP = 16;

export type DrawerPageKind = "main" | "style" | "rank";

function bezier(x1: number, y1: number, x2: number, y2: number) {
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 60; i++) {
      const u = (lo + hi) / 2;
      const x = 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u * u * x2 + u ** 3;
      if (x < t) lo = u;
      else hi = u;
    }
    const u = (lo + hi) / 2;
    return 3 * (1 - u) ** 2 * u * y1 + 3 * (1 - u) * u * u * y2 + u ** 3;
  };
}

const easeOpen = bezier(...OPEN_EASE);
const easeClose = bezier(...CLOSE_EASE);

/** 打开曲线采样（main↔rank 高度 morph 复用） */
export function easeUnroll(t: number): number {
  return easeOpen(Math.max(0, Math.min(1, t)));
}

export interface DrawerLayout {
  landscape: boolean;
  screenW: number;
  screenH: number;
  h0: number;
  h1: number;
  paperY: number;
  paperX: number;
  /** 一律 tile：1 texel = 1 设备 px（cell 256pt） */
  paperMode: "tile";
  bodyH: number;
  tearH: number;
  tearOverlap: number;
  capsuleTop: number;
  capsuleBottom: number;
  capsuleLeft: number;
  contentLeft: number;
  contentRight: number;
  page: DrawerPageKind;
  safeLeft: number;
  safeBottom: number;
}

export function isLandscape(w: number, h: number): boolean {
  return w > h;
}

function readSafeArea(_screenW: number, landscape: boolean): { left: number; bottom: number } {
  try {
    const wx = (globalThis as {
      wx?: {
        getSystemInfoSync?: () => {
          safeArea?: { left?: number; bottom?: number; top?: number };
          windowHeight?: number;
        };
      };
    }).wx;
    const info = wx?.getSystemInfoSync?.();
    const sa = info?.safeArea;
    if (sa) {
      const winH = info?.windowHeight ?? (landscape ? 375 : 812);
      const bottomInset =
        typeof sa.bottom === "number" ? Math.max(0, winH - sa.bottom) : landscape ? 21 : 0;
      return {
        left: Math.max(0, sa.left ?? (landscape ? 44 : 0)),
        bottom: bottomInset,
      };
    }
  } catch {
    /* ignore */
  }
  // iPhone X 档横屏默认
  return { left: landscape ? 44 : 0, bottom: landscape ? 21 : 0 };
}

/** 目标纸底高度（pt）= 撕口下沿 */
export function targetDrawerH1(
  _screenH: number,
  landscape: boolean,
  page: DrawerPageKind = "main",
): number {
  if (landscape) return H1_LANDSCAPE;
  if (page === "rank") return H1_PORTRAIT_RANK;
  return H1_PORTRAIT_MAIN;
}

export function layoutFor(
  w: number,
  h: number,
  capsule?: { top?: number; left?: number; bottom?: number } | null,
  opts?: { page?: DrawerPageKind; h1?: number },
): DrawerLayout {
  const landscape = isLandscape(w, h);
  const page = opts?.page ?? "main";
  const safe = readSafeArea(w, landscape);
  const capTop = capsule?.top ?? (landscape ? 18 : 48);
  const capBottom = capsule?.bottom ?? capTop + 32;
  const capLeft = capsule?.left ?? (landscape ? w - 7 - 87 : w - 7 - 87);
  const h1 = opts?.h1 ?? targetDrawerH1(h, landscape, page);
  const paperY = 0;
  const paperX = landscape ? -12 : -16;
  // tear bottom ≈ h1；bodyH = h1 - tearH + tearOverlap - paperY
  const bodyH = Math.max(80, h1 - TEAR_H + TEAR_OVERLAP - paperY);

  if (landscape) {
    const left = safe.left + 16; // X 档 = 60
    const right = Math.min(698, Math.min(w - 24, capLeft - 20));
    return {
      landscape: true,
      screenW: w,
      screenH: h,
      h0: 12,
      h1,
      paperY,
      paperX,
      paperMode: "tile",
      bodyH,
      tearH: TEAR_H,
      tearOverlap: TEAR_OVERLAP,
      capsuleTop: capTop,
      capsuleBottom: capBottom,
      capsuleLeft: capLeft,
      contentLeft: left,
      contentRight: Math.max(left + 200, right),
      page,
      safeLeft: safe.left,
      safeBottom: safe.bottom,
    };
  }

  return {
    landscape: false,
    screenW: w,
    screenH: h,
    h0: H0_PORTRAIT,
    h1,
    paperY,
    paperX,
    paperMode: "tile",
    bodyH,
    tearH: TEAR_H,
    tearOverlap: TEAR_OVERLAP,
    capsuleTop: capTop,
    capsuleBottom: capBottom,
    capsuleLeft: capLeft,
    contentLeft: 24,
    contentRight: w - 24,
    page,
    safeLeft: safe.left,
    safeBottom: safe.bottom,
  };
}

export function clipH(p: number, h0 = H0_PORTRAIT, h1 = H1_PORTRAIT_MAIN) {
  return h0 + (h1 - h0) * p;
}
export function diam(p: number) {
  return Math.sqrt(D1 * D1 + (D0 * D0 - D1 * D1) * (1 - p));
}
export function rollAlpha(p: number) {
  return p < 0.93 ? 1 : Math.max(0, (1 - p) / 0.07);
}
/** 竖屏：小签略低于 clip；横屏：小签挂在撕口下沿（clip = 318） */
export function tagTop(
  p: number,
  h0 = H0_PORTRAIT,
  h1 = H1_PORTRAIT_MAIN,
  minY = 48,
  landscape = false,
) {
  const ch = clipH(p, h0, h1);
  if (landscape) return Math.max(minY, ch);
  return Math.max(minY, ch - 16 + 1.25 * (diam(p) - D1));
}
export function contentAlphaOpen(ms: number) {
  const t = Math.min(1, Math.max(0, (ms - 203) / 120));
  return 1 - (1 - t) ** 2;
}
export function dimOpen(ms: number) {
  return 0.3 * Math.min(1, ms / 200);
}

export interface DrawerMotion {
  p: number;
  clipH: number;
  d: number;
  rollY: number;
  rollA: number;
  tagY: number;
  contentA: number;
  dim: number;
  contentTY: number;
}

/** 按当前屏宽高把基于竖屏 H1=400 的 motion 映射到竖/横布局 */
export function adaptMotion(m: DrawerMotion, layout: DrawerLayout): DrawerMotion {
  const ch = clipH(m.p, layout.h0, layout.h1);
  return {
    ...m,
    clipH: ch,
    rollY: ch,
    tagY: tagTop(m.p, layout.h0, layout.h1, layout.capsuleTop, layout.landscape),
  };
}

/** 打开：q 为线性 0→1（时间比例）；默认竖屏 H1=400 */
export function stateOpen(q: number, layout?: DrawerLayout): DrawerMotion {
  const ms = q * OPEN_MS;
  const p = easeOpen(q);
  const h0 = layout?.h0 ?? H0_PORTRAIT;
  const h1 = layout?.h1 ?? H1_PORTRAIT_MAIN;
  const minY = layout?.capsuleTop ?? 48;
  const landscape = layout?.landscape ?? false;
  return {
    p,
    clipH: clipH(p, h0, h1),
    d: diam(p),
    rollY: clipH(p, h0, h1),
    rollA: rollAlpha(p),
    tagY: tagTop(p, h0, h1, minY, landscape),
    contentA: contentAlphaOpen(ms),
    dim: dimOpen(ms),
    contentTY: 6 * (1 - contentAlphaOpen(ms)),
  };
}

/** 收起：q 为线性 0→1（从开到关的进度） */
export function stateClose(q: number, layout?: DrawerLayout): DrawerMotion {
  const ms = q * CLOSE_MS;
  const ca = ms < 80 ? 1 - ms / 80 : 0;
  const contentTY = ms < 80 ? -4 * (ms / 80) : -4;
  const p = 1 - easeClose(q);
  const dim = 0.3 * (1 - Math.min(1, ms / CLOSE_MS));
  let ra = rollAlpha(p);
  if (ms >= 210) ra *= Math.max(0, 1 - (ms - 210) / 40);
  const h0 = layout?.h0 ?? H0_PORTRAIT;
  const h1 = layout?.h1 ?? H1_PORTRAIT_MAIN;
  const minY = layout?.capsuleTop ?? 48;
  const landscape = layout?.landscape ?? false;
  return {
    p,
    clipH: clipH(p, h0, h1),
    d: diam(p),
    rollY: clipH(p, h0, h1),
    rollA: ra,
    tagY: tagTop(p, h0, h1, minY, landscape),
    contentA: ca,
    dim,
    contentTY,
  };
}

/** 从当前 p 反解打开/关闭的线性 q（二分） */
export function invertEase(p: number, open: boolean): number {
  const ease = open ? easeOpen : easeClose;
  const target = open ? p : 1 - p;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (ease(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function motionAt(
  p: number,
  contentA: number,
  dim: number,
  contentTY = 0,
  layout?: DrawerLayout,
): DrawerMotion {
  const h0 = layout?.h0 ?? H0_PORTRAIT;
  const h1 = layout?.h1 ?? H1_PORTRAIT_MAIN;
  const minY = layout?.capsuleTop ?? 48;
  const landscape = layout?.landscape ?? false;
  return {
    p,
    clipH: clipH(p, h0, h1),
    d: diam(p),
    rollY: clipH(p, h0, h1),
    rollA: rollAlpha(p),
    tagY: tagTop(p, h0, h1, minY, landscape),
    contentA,
    dim,
    contentTY,
  };
}
