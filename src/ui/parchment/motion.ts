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
/** 竖屏柴榜页：约屏高 78%，留树桩顶 + 小签 */
export const H1_PORTRAIT_RANK_FRAC = 0.78;
const D0 = 40;
const D1 = 14;
/** 横屏近铺满：顶/底各 8pt（D_fix_v2） */
export const LANDSCAPE_INSET = 8;
const TEAR_H = 32;

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
  paperMode: "cover" | "tile";
  bodyH: number;
  tearH: number;
  tearOverlap: number;
  capsuleTop: number;
  capsuleLeft: number;
  contentLeft: number;
  contentRight: number;
  page: DrawerPageKind;
}

export function isLandscape(w: number, h: number): boolean {
  return w > h;
}

/** 目标纸底高度（pt）：竖屏 rank≈78% 屏高；横屏近铺满 */
export function targetDrawerH1(
  screenH: number,
  landscape: boolean,
  page: DrawerPageKind = "main",
): number {
  if (landscape) return screenH - LANDSCAPE_INSET;
  if (page === "rank") return Math.round(screenH * H1_PORTRAIT_RANK_FRAC);
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
  const capTop = capsule?.top ?? (landscape ? 18 : 48);
  const capLeft = capsule?.left ?? (landscape ? w - 7 - 87 : w - 7 - 87);
  const h1 = opts?.h1 ?? targetDrawerH1(h, landscape, page);
  if (landscape) {
    const paperY = LANDSCAPE_INSET;
    const bodyH = Math.max(80, h1 - paperY - 18);
    const left = 24;
    const right = Math.min(w - 24, capLeft - 20);
    return {
      landscape: true,
      screenW: w,
      screenH: h,
      h0: LANDSCAPE_INSET + 12,
      h1,
      paperY,
      paperX: -12,
      paperMode: "tile",
      bodyH,
      tearH: TEAR_H,
      tearOverlap: 10,
      capsuleTop: capTop,
      capsuleLeft: capLeft,
      contentLeft: left,
      contentRight: Math.max(left + 200, right),
      page,
    };
  }
  const paperY = -8;
  const bodyH = Math.max(80, h1 - paperY - 22);
  return {
    landscape: false,
    screenW: w,
    screenH: h,
    h0: H0_PORTRAIT,
    h1,
    paperY,
    paperX: -16,
    paperMode: "cover",
    bodyH,
    tearH: TEAR_H,
    tearOverlap: 10,
    capsuleTop: capTop,
    capsuleLeft: capLeft,
    contentLeft: 24,
    contentRight: w - 24,
    page,
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
export function tagTop(p: number, h0 = H0_PORTRAIT, h1 = H1_PORTRAIT_MAIN, minY = 48) {
  return Math.max(minY, clipH(p, h0, h1) - 16 + 1.25 * (diam(p) - D1));
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
    tagY: tagTop(m.p, layout.h0, layout.h1, layout.capsuleTop),
  };
}

/** 打开：q 为线性 0→1（时间比例）；默认竖屏 H1=400 */
export function stateOpen(q: number, layout?: DrawerLayout): DrawerMotion {
  const ms = q * OPEN_MS;
  const p = easeOpen(q);
  const h0 = layout?.h0 ?? H0_PORTRAIT;
  const h1 = layout?.h1 ?? H1_PORTRAIT_MAIN;
  const minY = layout?.capsuleTop ?? 48;
  return {
    p,
    clipH: clipH(p, h0, h1),
    d: diam(p),
    rollY: clipH(p, h0, h1),
    rollA: rollAlpha(p),
    tagY: tagTop(p, h0, h1, minY),
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
  return {
    p,
    clipH: clipH(p, h0, h1),
    d: diam(p),
    rollY: clipH(p, h0, h1),
    rollA: ra,
    tagY: tagTop(p, h0, h1, minY),
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
  return {
    p,
    clipH: clipH(p, h0, h1),
    d: diam(p),
    rollY: clipH(p, h0, h1),
    rollA: rollAlpha(p),
    tagY: tagTop(p, h0, h1, minY),
    contentA,
    dim,
    contentTY,
  };
}
