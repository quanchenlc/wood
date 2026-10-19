/** 抽屉展开/卷回曲线 — 对齐 D_final/src/motion_math.py */

export const OPEN_MS = 350;
export const CLOSE_MS = 250;
const OPEN_EASE = [0.4, 0.3, 0.4, 1] as const;
const CLOSE_EASE = [0.55, 0, 0.8, 0.35] as const;
const H0 = 20;
const H1 = 400;
const D0 = 40;
const D1 = 14;

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

export function clipH(p: number) {
  return H0 + (H1 - H0) * p;
}
export function diam(p: number) {
  return Math.sqrt(D1 * D1 + (D0 * D0 - D1 * D1) * (1 - p));
}
export function rollAlpha(p: number) {
  return p < 0.93 ? 1 : Math.max(0, (1 - p) / 0.07);
}
export function tagTop(p: number) {
  return Math.max(48, clipH(p) - 16 + 1.25 * (diam(p) - D1));
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

/** 打开：q 为线性 0→1（时间比例） */
export function stateOpen(q: number): DrawerMotion {
  const ms = q * OPEN_MS;
  const p = easeOpen(q);
  return {
    p,
    clipH: clipH(p),
    d: diam(p),
    rollY: clipH(p),
    rollA: rollAlpha(p),
    tagY: tagTop(p),
    contentA: contentAlphaOpen(ms),
    dim: dimOpen(ms),
    contentTY: 6 * (1 - contentAlphaOpen(ms)),
  };
}

/** 收起：q 为线性 0→1（从开到关的进度） */
export function stateClose(q: number): DrawerMotion {
  const ms = q * CLOSE_MS;
  // 内容先在 0–80ms 淡出
  const ca = ms < 80 ? 1 - ms / 80 : 0;
  const contentTY = ms < 80 ? -4 * (ms / 80) : -4;
  // p 从 1 降到 0：用收起曲线
  const p = 1 - easeClose(q);
  const dim = 0.3 * (1 - Math.min(1, ms / CLOSE_MS));
  // 末段 210–250ms 滚筒淡出
  let ra = rollAlpha(p);
  if (ms >= 210) ra *= Math.max(0, 1 - (ms - 210) / 40);
  return {
    p,
    clipH: clipH(p),
    d: diam(p),
    rollY: clipH(p),
    rollA: ra,
    tagY: tagTop(p),
    contentA: ca,
    dim,
    contentTY,
  };
}

/** 从当前 p 反解打开/关闭的线性 q（二分） */
export function invertEase(p: number, open: boolean): number {
  const ease = open ? easeOpen : easeClose;
  // open: ease(q)=p; close: 1-ease(q)=p → ease(q)=1-p
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

export function motionAt(p: number, contentA: number, dim: number, contentTY = 0): DrawerMotion {
  return {
    p,
    clipH: clipH(p),
    d: diam(p),
    rollY: clipH(p),
    rollA: rollAlpha(p),
    tagY: tagTop(p),
    contentA,
    dim,
    contentTY,
  };
}
