import { COPY_C } from "../../economy/design";
import { formatCountdown } from "../../economy/time";
import type { EconomySnapshot } from "../../economy/types";
import { getParchmentTextures, getUiDpr, type ParchmentTex, type TexMap } from "./assets";
import { GUIDE_COPY } from "./guide";
import {
  type DrawerMotion,
  motionAt,
  stateClose,
  stateOpen,
} from "./motion";
import { drawNineSlice, snapPt, snapRect, type Insets } from "./nineSlice";

export type PanelMode = "none" | "exhausted" | "rank";
export type DrawerPage = "main" | "style";

export interface GuideTargets {
  log?: { x: number; y: number; w: number; h: number };
  tag?: { x: number; y: number; w: number; h: number };
  claim?: { x: number; y: number; w: number; h: number };
  styleRow?: { x: number; y: number; w: number; h: number };
}

export interface ParchmentUiState {
  panel: PanelMode;
  toast: string | null;
  loading: { loaded: number; total: number; status: string } | null;
  economy: EconomySnapshot | null;
  selfRank?: { name: string; pieces: number; rank: number };
  guideStep?: number | null;
  guideTargets?: GuideTargets;
  adRemaining?: number;
  /** 抽屉线性进度 0..1（打开方向的 q）；null=关 */
  drawerQ?: number | null;
  drawerOpening?: boolean;
  drawerPage?: DrawerPage;
  drawerMotion?: DrawerMotion | null;
  showRedDot?: boolean;
  styleId?: string;
  styleLabel?: string;
  styleOptions?: { id: string; label: string; color: string }[];
  styleSwitching?: boolean;
  exhaustedBubble?: { text: string; until: number } | null;
  capsuleTop?: number;
  claimFlash?: string | null;
}

export type UiHit =
  | "tag"
  | "drawer_mask"
  | "claim_free"
  | "ad_quota"
  | "ad_skip"
  | "rank_open"
  | "rank_close"
  | "help_open"
  | "style_open"
  | "style_back"
  | "style_pick"
  | "dismiss"
  | "panel"
  | "exhausted_ok"
  | "bubble_ad"
  | "guide_next"
  | "guide_skip"
  | "guide_tap"
  | null;

export interface HitRect {
  id: UiHit;
  x: number;
  y: number;
  w: number;
  h: number;
  meta?: string;
}

const INK = "#3a2a18";
const INK_SOFT = "#5c4a32";
const CREAM = "#f3e6c8";
const MADDER = "#8b2e2e";

function fontSerif(size: number, weight = "600") {
  return `${weight} ${size}px "Songti SC", "Noto Serif CJK SC", "STSong", serif`;
}
function fontSans(size: number, weight = "500") {
  return `${weight} ${size}px "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif`;
}

function pushHit(
  hits: HitRect[],
  id: UiHit,
  x: number,
  y: number,
  w: number,
  h: number,
  meta?: string,
) {
  hits.push({ id, x, y, w, h, meta });
}

function drawTexNine(
  ctx: CanvasRenderingContext2D,
  tex: ParchmentTex | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  dpr: number,
) {
  if (!tex) return false;
  const r = snapRect(x, y, w, h, dpr);
  if (tex.srcInsets && tex.dstInsets) {
    drawNineSlice(ctx, tex.img, r.x, r.y, r.w, r.h, tex.srcInsets, tex.dstInsets as Insets);
  } else {
    ctx.drawImage(tex.img, r.x, r.y, r.w, r.h);
  }
  return true;
}

/** 3-slice 水平（滚筒） */
function drawThreeSliceH(
  ctx: CanvasRenderingContext2D,
  tex: ParchmentTex | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  endW: number,
  dpr: number,
) {
  if (!tex) return;
  const img = tex.img;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const sL = Math.min(tex.srcInsets?.[0] ?? iw / 4, Math.floor(iw / 2));
  const sR = Math.min(tex.srcInsets?.[2] ?? iw / 4, Math.floor(iw / 2));
  const mid = Math.max(1, iw - sL - sR);
  const r = snapRect(x, y, w, h, dpr);
  const eL = Math.min(endW, r.w / 2);
  const eR = eL;
  const midW = Math.max(0, r.w - eL - eR);
  ctx.drawImage(img, 0, 0, sL, ih, r.x, r.y, eL, r.h);
  if (midW > 0) ctx.drawImage(img, sL, 0, mid, ih, r.x + eL, r.y, midW, r.h);
  ctx.drawImage(img, iw - sR, 0, sR, ih, r.x + eL + midW, r.y, eR, r.h);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of text) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = ch === " " ? "" : ch;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function formatRemain(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function capsuleTopPt(fallback = 48): number {
  try {
    const wx = (globalThis as {
      wx?: { getMenuButtonBoundingClientRect?: () => { top?: number; height?: number } };
    }).wx;
    const r = wx?.getMenuButtonBoundingClientRect?.();
    if (r?.top != null) return r.top;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function getTagHitRect(capsuleTop = capsuleTopPt()): {
  x: number;
  y: number;
  w: number;
  h: number;
  visual: { x: number; y: number; w: number; h: number };
} {
  const visW = 96;
  const visH = 32;
  const vx = (375 - visW) / 2;
  const vy = capsuleTop;
  return {
    x: 375 / 2 - 64,
    y: Math.max(40, capsuleTop - 8),
    w: 128,
    h: 48,
    visual: { x: vx, y: vy, w: visW, h: visH },
  };
}

function paintTag(
  ctx: CanvasRenderingContext2D,
  tex: TexMap,
  opts: {
    y: number;
    remain: number;
    exhausted: boolean;
    redDot: boolean;
    arrowUp: boolean;
    labelOverride?: string | null;
    pulseScale?: number;
    dpr: number;
    wScreen: number;
  },
) {
  const {
    y,
    remain,
    exhausted,
    redDot,
    arrowUp,
    labelOverride,
    pulseScale = 1,
    dpr,
    wScreen,
  } = opts;
  const visW = exhausted ? 112 : 96;
  const visH = 32;
  const pad = 4;
  const drawW = visW + pad * 2;
  const drawH = visH + pad * 2;
  const cx = wScreen / 2;
  const vx = cx - visW / 2;
  const entry = exhausted ? tex.tag_madder : tex.tag_parchment;
  ctx.save();
  if (pulseScale !== 1) {
    ctx.translate(cx, y + visH / 2);
    ctx.scale(pulseScale, pulseScale);
    ctx.translate(-cx, -(y + visH / 2));
  }
  drawTexNine(ctx, entry, vx - pad, y - pad, drawW, drawH, dpr);
  const label =
    labelOverride ||
    (exhausted ? "树根用尽" : `余 ${formatRemain(Math.max(0, remain))}`);
  ctx.fillStyle = exhausted ? CREAM : INK;
  ctx.font = fontSans(13, "600");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx - 6, y + visH / 2 + 0.5);
  // chevron
  ctx.strokeStyle = exhausted ? CREAM : INK;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const ax = cx + 30;
  const ay = y + visH / 2;
  ctx.beginPath();
  if (arrowUp) {
    ctx.moveTo(ax - 5, ay + 2);
    ctx.lineTo(ax, ay - 3);
    ctx.lineTo(ax + 5, ay + 2);
  } else {
    ctx.moveTo(ax - 5, ay - 2);
    ctx.lineTo(ax, ay + 3);
    ctx.lineTo(ax + 5, ay - 2);
  }
  ctx.stroke();
  if (redDot && !exhausted) {
    const rx = vx + visW - 3;
    const ry = y + 3;
    ctx.beginPath();
    ctx.arc(rx, ry, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = MADDER;
    ctx.fill();
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
  return { x: vx, y, w: visW, h: visH };
}

function paintLeatherBtn(
  ctx: CanvasRenderingContext2D,
  tex: TexMap,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  dpr: number,
) {
  if (!drawTexNine(ctx, tex.btn_leather, x, y, w, h, dpr)) {
    const r = snapRect(x, y, w, h, dpr);
    ctx.fillStyle = "#4a3020";
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.font = fontSerif(Math.max(14, h * 0.34), "700");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = "rgba(40,28,16,0.55)";
  ctx.lineWidth = 1;
  ctx.strokeText(label, snapPt(x + w / 2, dpr), snapPt(y + h / 2, dpr));
  ctx.fillStyle = CREAM;
  ctx.fillText(label, snapPt(x + w / 2, dpr), snapPt(y + h / 2, dpr));
}

function paintStripBtn(
  ctx: CanvasRenderingContext2D,
  tex: TexMap,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  dpr: number,
) {
  if (!drawTexNine(ctx, tex.strip_parchment, x, y, w, h, dpr)) {
    const r = snapRect(x, y, w, h, dpr);
    ctx.fillStyle = "rgba(240,228,200,0.9)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.fillStyle = INK;
  ctx.font = fontSerif(Math.max(12, h * 0.38), "600");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, snapPt(x + w / 2, dpr), snapPt(y + h / 2, dpr));
}

function paintDrawerIcon(
  ctx: CanvasRenderingContext2D,
  tex: TexMap,
  id: "btn_icon_rank" | "btn_icon_ad" | "btn_icon_help",
  cx: number,
  y: number,
  label: string,
  dpr: number,
  badge?: number,
) {
  const size = 46;
  const x = cx - size / 2;
  const entry = tex[id];
  const r = snapRect(x, y, size, size, dpr);
  if (entry) ctx.drawImage(entry.img, r.x, r.y, r.w, r.h);
  if (badge != null && badge > 0) {
    ctx.fillStyle = MADDER;
    ctx.beginPath();
    ctx.arc(r.x + r.w - 2, r.y + 4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = CREAM;
    ctx.font = fontSans(11, "700");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(Math.min(badge, 9)), r.x + r.w - 2, r.y + 4);
  }
  ctx.font = fontSans(11, "700");
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.strokeStyle = "rgba(243,230,200,0.85)";
  ctx.lineWidth = 2;
  ctx.strokeText(label, cx, y + size + 4);
  ctx.fillStyle = INK;
  ctx.fillText(label, cx, y + size + 4);
  return { x, y, w: size, h: size + 22 };
}

function paintDrawerContent(
  ctx: CanvasRenderingContext2D,
  w: number,
  snap: EconomySnapshot,
  tex: TexMap,
  hits: HitRect[],
  state: ParchmentUiState,
  dpr: number,
  contentTY: number,
): GuideTargets {
  const targets: GuideTargets = {};
  ctx.save();
  ctx.translate(0, contentTY);
  const s = snap.state;
  const page = state.drawerPage || "main";

  if (page === "style") {
    ctx.fillStyle = INK_SOFT;
    ctx.font = fontSans(15);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("〈", 24, 108);
    pushHit(hits, "style_back", 16, 86, 44, 44);
    ctx.fillStyle = INK;
    ctx.font = fontSerif(17, "700");
    ctx.textAlign = "center";
    ctx.fillText("风格", w / 2, 108);
    ctx.strokeStyle = "rgba(58,42,24,0.3)";
    ctx.beginPath();
    ctx.moveTo(24, 128);
    ctx.lineTo(w - 24, 128);
    ctx.stroke();
    const opts = state.styleOptions || [];
    opts.forEach((opt, i) => {
      const y = 136 + i * 48;
      const active = opt.id === state.styleId;
      if (active) drawTexNine(ctx, tex.strip_parchment, 24, y + 2, w - 48, 44, dpr);
      ctx.beginPath();
      ctx.arc(55, y + 24, 11, 0, Math.PI * 2);
      ctx.fillStyle = opt.color;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = fontSans(15);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(opt.label, 80, y + 24);
      if (active && tex.icon_check) {
        ctx.drawImage(
          tex.icon_check.img,
          snapPt(w - 60, dpr),
          snapPt(y + 14, dpr),
          20,
          20,
        );
      }
      pushHit(hits, "style_pick", 24, y, w - 48, 48, opt.id);
    });
    ctx.fillStyle = INK_SOFT;
    ctx.font = fontSans(11);
    ctx.textAlign = "center";
    ctx.fillText("切换即时生效，下次启动保留", w / 2, 388);
    ctx.restore();
    return targets;
  }

  // stats 3 cols
  const cols = [
    { label: COPY_C.hudToday, value: String(s.today_pieces) },
    { label: COPY_C.hudRemaining, value: String(s.daily_remaining) },
    {
      label: COPY_C.hudGrowing,
      value: snap.pendingFull
        ? "已满"
        : snap.boosting
          ? `${formatCountdown(snap.nextRootMs)} · 加速中`
          : formatCountdown(snap.nextRootMs),
    },
  ];
  const cxs = [62.5, 187.5, 312.5];
  cols.forEach((c, i) => {
    ctx.fillStyle = INK_SOFT;
    ctx.font = fontSans(11);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(c.label, cxs[i], 104);
    ctx.fillStyle = INK;
    ctx.font = fontSerif(i === 2 && snap.boosting ? 16 : 22, "700");
    ctx.fillText(c.value, cxs[i], 128);
  });
  ctx.strokeStyle = "rgba(58,42,24,0.3)";
  ctx.beginPath();
  ctx.moveTo(24, 152);
  ctx.lineTo(w - 24, 152);
  ctx.stroke();

  // claim
  const claimLabel =
    state.claimFlash ||
    (s.pending_claim > 0
      ? `免费领取 柴棚 ${s.pending_claim} 根`
      : `柴棚空了 · 下一批 ${formatCountdown(snap.nextRootMs)}`);
  if (s.pending_claim > 0 || state.claimFlash) {
    paintLeatherBtn(ctx, tex, 32, 164, 311, 48, claimLabel, dpr);
    pushHit(hits, "claim_free", 32, 164, 311, 48);
    targets.claim = { x: 32, y: 164, w: 311, h: 48 };
  } else {
    ctx.fillStyle = "rgba(92,74,50,0.55)";
    ctx.font = fontSans(13);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(claimLabel, w / 2, 188);
  }

  // 3 icons (no style button — style is row only)
  const icons: {
    id: "btn_icon_rank" | "btn_icon_ad" | "btn_icon_help";
    label: string;
    hit: UiHit;
    badge?: number;
  }[] = [
    { id: "btn_icon_rank", label: "好友柴榜", hit: "rank_open" },
    {
      id: "btn_icon_ad",
      label: "看短片加速",
      hit: "ad_skip",
      badge: state.adRemaining,
    },
    { id: "btn_icon_help", label: "玩法", hit: "help_open" },
  ];
  icons.forEach((ic, i) => {
    const cx = cxs[i];
    const box = paintDrawerIcon(ctx, tex, ic.id, cx, 228, ic.label, dpr, ic.badge);
    pushHit(hits, ic.hit, box.x, box.y, box.w, box.h);
  });

  // style row
  const sw = 230;
  const sx = (w - sw) / 2;
  const sy = 306;
  paintStripBtn(
    ctx,
    tex,
    sx,
    sy,
    sw,
    36,
    `风格：${state.styleLabel || "羊皮纸"} 〉`,
    dpr,
  );
  pushHit(hits, "style_open", sx, sy, sw, 36);
  targets.styleRow = { x: sx, y: sy, w: sw, h: 36 };

  ctx.restore();
  return targets;
}

function paintDrawerShell(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tex: TexMap,
  motion: DrawerMotion,
  hits: HitRect[],
  state: ParchmentUiState,
  dpr: number,
): GuideTargets {
  const { clipH: ch, d, rollY, rollA, tagY, contentA, dim, contentTY, p } = motion;
  // mask
  if (dim > 0.001) {
    ctx.fillStyle = `rgba(30,20,10,${dim})`;
    ctx.fillRect(0, 0, w, h);
    pushHit(hits, "drawer_mask", 0, ch, w, h - ch);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, ch);
  ctx.clip();
  // paper shadow
  ctx.shadowColor = "rgba(40,28,16,0.45)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 3;
  drawTexNine(ctx, tex.drawer_vellum, -28, -24, 431, 424, dpr);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  let targets: GuideTargets = {};
  if (contentA > 0.01 && state.economy) {
    ctx.globalAlpha = contentA;
    targets = paintDrawerContent(ctx, w, state.economy, tex, hits, state, dpr, contentTY);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // roll
  if (rollA > 0.01 && p < 0.999) {
    ctx.globalAlpha = rollA;
    const rollW = 395;
    const rollX = -10;
    const endW = 16 * (d / 24);
    if (tex.roll_shadow) {
      const sh = 0.6 * d;
      ctx.drawImage(
        tex.roll_shadow.img,
        snapPt(rollX, dpr),
        snapPt(rollY + 0.35 * d, dpr),
        snapPt(rollW, dpr),
        snapPt(sh, dpr),
      );
    }
    drawThreeSliceH(ctx, tex.roll_paper, rollX, rollY - d / 2, rollW, d, endW, dpr);
    ctx.globalAlpha = 1;
  }

  // tag on paper edge
  const snap = state.economy;
  const remain = snap?.state.daily_remaining ?? 0;
  const exhausted = Boolean(snap?.quotaExhausted && remain <= 0);
  paintTag(ctx, tex, {
    y: tagY,
    remain,
    exhausted,
    redDot: false,
    arrowUp: p > 0.5,
    labelOverride: state.styleSwitching ? "切换中…" : null,
    dpr,
    wScreen: w,
  });
  const tagHit = getTagHitRect(state.capsuleTop ?? 48);
  pushHit(hits, "tag", tagHit.x, Math.min(tagHit.y, tagY - 8), tagHit.w, 48);

  return targets;
}

export function paintParchmentLoading(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  loaded: number,
  total: number,
  status: string,
) {
  const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.1, w / 2, h / 2, w * 0.75);
  g.addColorStop(0, "#e8dcc4");
  g.addColorStop(1, "#c4a882");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const pct = Math.round((loaded / Math.max(1, total)) * 100);
  ctx.fillStyle = INK;
  ctx.font = fontSerif(22, "700");
  ctx.textAlign = "center";
  ctx.fillText(COPY_C.title, w / 2, h * 0.42);
  const barW = Math.min(280, w * 0.62);
  const barX = (w - barW) / 2;
  const barY = h * 0.48;
  ctx.strokeStyle = "rgba(58,42,24,0.25)";
  ctx.beginPath();
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + barW, barY);
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + barW * Math.min(1, loaded / Math.max(1, total)), barY);
  ctx.stroke();
  ctx.fillStyle = INK_SOFT;
  ctx.font = fontSans(14);
  ctx.fillText(`${status || COPY_C.loading} ${pct}%`, w / 2, barY + 28);
  ctx.globalAlpha = 0.35;
  ctx.font = fontSans(11);
  ctx.fillText("v0.3.4 · 极简抽屉", w / 2, h - 24);
  ctx.globalAlpha = 1;
}

function paintExhaustedPanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  snap: EconomySnapshot,
  tex: TexMap,
  hits: HitRect[],
) {
  const dpr = getUiDpr();
  ctx.fillStyle = "rgba(40,28,16,0.42)";
  ctx.fillRect(0, 0, w, h);
  pushHit(hits, "dismiss", 0, 0, w, h);

  const pw = 300;
  const inner = pw - 48;
  const px = (w - pw) / 2;
  let y = 0;
  // measure body
  ctx.font = fontSans(13);
  const body =
    snap.quotaExhausted
      ? "明天 0 点恢复。也可以看一支短片，今天多砍 20 根。"
      : `下一根 ${formatCountdown(snap.nextRootMs)} 后长出。也可以看一支短片，今天多砍 20 根。`;
  const lines = wrapText(ctx, body, inner);
  const bodyH = lines.length * 18.2;
  const hasClaim = snap.state.pending_claim > 0;
  const ph = 34 + 28 + bodyH + 16 + (hasClaim ? 52 : 0) + 56 + 40 + 20;
  const py = (h - ph) / 2 - 8;

  pushHit(hits, "panel", px, py, pw, ph);
  drawTexNine(ctx, tex.panel_vellum, px, py, pw, ph, dpr);

  // ribbon straddling top
  const rw = 210;
  drawTexNine(ctx, tex.ribbon_madder, (w - rw) / 2, py - 20, rw, 40, dpr);
  ctx.fillStyle = CREAM;
  ctx.font = fontSerif(17, "700");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("树根用尽", w / 2, py);

  y = py + 40;
  ctx.fillStyle = INK;
  ctx.font = fontSerif(17, "700");
  ctx.textBaseline = "alphabetic";
  ctx.fillText("今天的树根已经砍完了", w / 2, y);
  y += 28;
  ctx.fillStyle = INK_SOFT;
  ctx.font = fontSans(13);
  ctx.textAlign = "left";
  for (const ln of lines) {
    ctx.fillText(ln, px + 24, y);
    y += 18.2;
  }
  y += 10;
  ctx.strokeStyle = "rgba(58,42,24,0.25)";
  ctx.beginPath();
  ctx.moveTo(px + 24, y);
  ctx.lineTo(px + pw - 24, y);
  ctx.stroke();
  y += 14;

  if (hasClaim) {
    paintStripBtn(
      ctx,
      tex,
      px + 24,
      y,
      252,
      44,
      `免费领取 柴棚 ${snap.state.pending_claim} 根`,
      dpr,
    );
    pushHit(hits, "claim_free", px + 24, y, 252, 44);
    y += 52;
  }

  paintLeatherBtn(ctx, tex, px + 24, y, 252, 48, "▶ 看短片 +20 根", dpr);
  pushHit(hits, "ad_quota", px + 24, y, 252, 48);
  y += 56;

  ctx.fillStyle = INK_SOFT;
  ctx.font = fontSans(13);
  ctx.textAlign = "center";
  ctx.fillText("知道了", w / 2, y + 10);
  pushHit(hits, "exhausted_ok", w / 2 - 40, y - 10, 80, 44);
}

function paintRankPanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  snap: EconomySnapshot | null,
  tex: TexMap,
  hits: HitRect[],
  self?: { name: string; pieces: number; rank: number },
) {
  const dpr = getUiDpr();
  // 开放数据域 sharedCanvas 按设备 dpr 建（若可用）
  try {
    const wx = (globalThis as {
      wx?: {
        getOpenDataContext?: () => { canvas?: HTMLCanvasElement };
      };
    }).wx;
    const od = wx?.getOpenDataContext?.();
    if (od?.canvas) {
      const cssW = w;
      const cssH = Math.min(520, h * 0.7);
      od.canvas.width = Math.floor(cssW * dpr);
      od.canvas.height = Math.floor(cssH * dpr);
    }
  } catch {
    /* ignore */
  }

  ctx.fillStyle = "rgba(40,28,16,0.42)";
  ctx.fillRect(0, 0, w, h);
  pushHit(hits, "dismiss", 0, 0, w, h);
  const pw = Math.min(320, w * 0.9);
  const ph = Math.min(520, h * 0.7);
  const px = (w - pw) / 2;
  const py = (h - ph) / 2 - 8;
  pushHit(hits, "panel", px, py, pw, ph);
  drawTexNine(ctx, tex.panel_vellum, px, py, pw, ph, dpr);
  const rw = Math.min(pw * 0.88, 260);
  drawTexNine(ctx, tex.ribbon_madder, (w - rw) / 2, py - 18, rw, 40, dpr);
  ctx.fillStyle = CREAM;
  ctx.font = fontSerif(16, "700");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${COPY_C.rankTitle} · 本周`, w / 2, py + 2);

  const pieces = self?.pieces ?? snap?.state.total_pieces ?? 0;
  const name = self?.name ?? "我";
  const ranks = ["壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌"];
  const rows = [
    { name: "林间老樵", pieces: Math.max(pieces + 200, 1284) },
    { name: "阿菜", pieces: Math.max(pieces + 80, 960) },
    { name: "松下客", pieces: Math.max(pieces + 40, 720) },
    { name: "柴门客", pieces: Math.max(pieces + 10, 600) },
    { name, pieces, self: true },
    { name: "南枝", pieces: Math.max(0, pieces - 40) },
    { name: "晚风", pieces: Math.max(0, pieces - 80) },
    { name: "山客", pieces: Math.max(0, pieces - 120) },
  ].sort((a, b) => b.pieces - a.pieces);

  let y = py + 56;
  rows.slice(0, 8).forEach((row, i) => {
    const rh = 40;
    if (row.self || row.name === name) {
      drawTexNine(ctx, tex.strip_parchment, px + 14, y - 2, pw - 28, rh, dpr);
    }
    ctx.fillStyle = INK;
    ctx.font = fontSerif(14, "700");
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(ranks[i] || String(i + 1), px + 24, y + rh / 2);
    ctx.font = fontSans(13);
    ctx.fillText(row.name, px + 56, y + rh / 2);
    ctx.textAlign = "right";
    ctx.font = fontSerif(13, "600");
    ctx.fillText(`${row.pieces.toLocaleString()} 根`, px + pw - 24, y + rh / 2);
    y += rh;
  });

  paintLeatherBtn(ctx, tex, (w - 140) / 2, py + ph - 42, 140, 40, COPY_C.back, dpr);
  pushHit(hits, "rank_close", (w - 140) / 2, py + ph - 42, 140, 40);
}

function paintGuide(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  step: number,
  tex: TexMap,
  hits: HitRect[],
  targets?: GuideTargets,
  drawerOpen = false,
) {
  const dpr = getUiDpr();
  const copy = GUIDE_COPY[step as 1 | 2 | 3] || GUIDE_COPY[1];
  const dim = step === 3 ? 0.5 : 0.58;
  ctx.fillStyle = `rgba(20,12,6,${dim})`;

  if (step === 1) {
    const hole = targets?.log || { x: w * 0.22, y: h * 0.32, w: w * 0.56, h: h * 0.28 };
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    const cx = hole.x + hole.w / 2;
    const cy = hole.y + hole.h / 2;
    ctx.moveTo(cx + hole.w / 2, cy);
    ctx.ellipse(cx, cy, hole.w / 2, hole.h / 2, 0, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    ctx.restore();
    if (tex.guide_ring) {
      const pad = 8;
      ctx.drawImage(
        tex.guide_ring.img,
        snapPt(hole.x - pad, dpr),
        snapPt(hole.y - pad, dpr),
        snapPt(hole.w + pad * 2, dpr),
        snapPt(hole.h + pad * 2, dpr),
      );
    }
    if (tex.guide_hand) {
      const t = (performance.now() % 900) / 900;
      const press = Math.sin(t * Math.PI) * 3;
      const sc = 1 - Math.sin(t * Math.PI) * 0.1;
      const hs = 64 * sc;
      // tip hotspot (30,3) of 64 → center top of log
      const hx = hole.x + hole.w / 2 - 30 * sc;
      const hy = hole.y + hole.h * 0.28 + press - 3 * sc;
      ctx.drawImage(tex.guide_hand.img, snapPt(hx, dpr), snapPt(hy, dpr), hs, hs);
      // ink ripple
      ctx.strokeStyle = `rgba(58,42,24,${0.35 * Math.sin(t * Math.PI)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hole.x + hole.w / 2, hole.y + hole.h * 0.28, 10 + t * 18, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (step === 2) {
    const tag = targets?.tag || getTagHitRect().visual;
    const hole = {
      x: tag.x - 4,
      y: tag.y - 4,
      w: tag.w + 8,
      h: tag.h + 8,
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    const r = 12;
    const { x, y, w: hw, h: hh } = hole;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + hw, y, x + hw, y + hh, r);
    ctx.arcTo(x + hw, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r);
    ctx.arcTo(x, y, x + hw, y, r);
    ctx.closePath();
    ctx.fill("evenodd");
    ctx.restore();
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 2;
    ctx.beginPath();
    roundPath(ctx, hole.x, hole.y, hole.w, hole.h, 12);
    ctx.stroke();
  } else if (step === 3 && drawerOpen) {
    ctx.fillRect(0, 0, w, h);
    const boxes = [targets?.claim, targets?.styleRow].filter(Boolean) as {
      x: number;
      y: number;
      w: number;
      h: number;
    }[];
    for (const b of boxes) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      roundPath(ctx, b.x - 4, b.y - 4, b.w + 8, b.h + 8, 10);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = CREAM;
      ctx.lineWidth = 2;
      roundPath(ctx, b.x - 4, b.y - 4, b.w + 8, b.h + 8, 10);
      ctx.stroke();
    }
  } else {
    ctx.fillRect(0, 0, w, h);
  }

  // bubble
  const bw = Math.min(295, w * 0.78);
  const bh = step === 3 ? 88 : 72;
  let bx = (w - bw) / 2;
  let by = step === 1 ? (targets?.log?.y ?? 260) - bh - 24 : step === 2 ? 120 : 420;
  if (step === 3) by = 448;
  if (step === 2) by = (targets?.tag?.y ?? 48) + 48;
  drawTexNine(ctx, tex.guide_bubble, bx, by, bw, bh, dpr);
  if (tex.guide_tail) {
    const tw = 24;
    const th = 15;
    if (step === 1) {
      ctx.drawImage(tex.guide_tail.img, bx + bw / 2 - tw / 2, by + bh - 4, tw, th);
    } else {
      ctx.save();
      ctx.translate(bx + bw / 2, by + 2);
      ctx.scale(1, -1);
      ctx.drawImage(tex.guide_tail.img, -tw / 2, 0, tw, th);
      ctx.restore();
    }
  }
  ctx.fillStyle = INK_SOFT;
  ctx.font = fontSans(11);
  ctx.textAlign = "right";
  ctx.fillText(`${step}/3`, bx + bw - 14, by + 16);
  ctx.fillStyle = INK;
  ctx.font = fontSerif(16, "700");
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(copy.title, bx + 16, by + 28);
  ctx.fillStyle = INK_SOFT;
  ctx.font = fontSans(12);
  const bodyLines = wrapText(ctx, copy.body, bw - 32);
  bodyLines.slice(0, 2).forEach((ln, i) => {
    ctx.fillText(ln, bx + 16, by + 48 + i * 16);
  });

  if (step === 3) {
    const btnW = 200;
    const btnH = 48;
    const btnX = (w - btnW) / 2;
    const btnY = by + bh + 12;
    paintLeatherBtn(ctx, tex, btnX, btnY, btnW, btnH, "知道了，开砍！", getUiDpr());
    pushHit(hits, "guide_next", btnX, btnY, btnW, btnH);
  } else if (step === 2) {
    ctx.fillStyle = "rgba(243,230,200,0.75)";
    ctx.font = fontSans(12);
    ctx.textAlign = "center";
    ctx.fillText("轻点任意处继续", w / 2, by + bh + 28);
    pushHit(hits, "guide_tap", 0, 0, w, h);
  }

  paintStripBtn(ctx, tex, (w - 84) / 2, Math.min(h - 80, 712), 84, 32, "跳过 〉", dpr);
  pushHit(hits, "guide_skip", (w - 84) / 2, Math.min(h - 80, 712), 84, 32);
}

function roundPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function paintExhaustedBubble(
  ctx: CanvasRenderingContext2D,
  w: number,
  tex: TexMap,
  text: string,
  hits: HitRect[],
  dpr: number,
) {
  const bx = 72;
  const by = 214;
  const bw = 232;
  const bh = 72;
  drawTexNine(ctx, tex.guide_bubble, bx, by, bw, bh, dpr);
  if (tex.guide_tail) {
    ctx.drawImage(tex.guide_tail.img, w / 2 - 12, by + bh - 2, 24, 15);
  }
  ctx.fillStyle = INK;
  ctx.font = fontSerif(13, "600");
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, bx + 16, by + 22);
  drawTexNine(ctx, tex.tag_madder, bx + 12, by + 34, 136, 36, dpr);
  ctx.fillStyle = CREAM;
  ctx.font = fontSans(12, "700");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("▶ 看短片 +20 根", bx + 80, by + 52);
  pushHit(hits, "bubble_ad", bx + 12, by + 34, 136, 44);
}

export function resolveDrawerMotion(state: ParchmentUiState): DrawerMotion | null {
  if (state.drawerMotion) return state.drawerMotion;
  if (state.drawerQ == null) return null;
  const q = Math.max(0, Math.min(1, state.drawerQ));
  return state.drawerOpening === false ? stateClose(1 - q) : stateOpen(q);
}

export function paintParchmentUi(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: ParchmentUiState,
): HitRect[] {
  const hits: HitRect[] = [];
  const tex = getParchmentTextures();
  const dpr = getUiDpr();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (state.loading) {
    paintParchmentLoading(
      ctx,
      w,
      h,
      state.loading.loaded,
      state.loading.total,
      state.loading.status,
    );
    return hits;
  }

  const guideOn = Boolean(state.guideStep && state.guideStep >= 1 && state.guideStep <= 3);
  const motion = resolveDrawerMotion(state);
  const drawerVisible = Boolean(motion && motion.p > 0.001);
  const panelOpen = state.panel !== "none";
  const capTop = state.capsuleTop ?? capsuleTopPt();
  const snap = state.economy;
  const remain = snap?.state.daily_remaining ?? 0;
  const exhausted = Boolean(snap && remain <= 0);
  let guideTargets: GuideTargets = { ...(state.guideTargets || {}) };

  // idle tag (hidden under panels; always visible during guide)
  if (!panelOpen && !drawerVisible) {
    const tagVis = paintTag(ctx, tex, {
      y: capTop,
      remain,
      exhausted,
      redDot: Boolean(state.showRedDot) && !guideOn && !exhausted,
      arrowUp: false,
      labelOverride: state.styleSwitching ? "切换中…" : null,
      dpr,
      wScreen: w,
    });
    guideTargets.tag = tagVis;
    const hit = getTagHitRect(capTop);
    pushHit(hits, "tag", hit.x, hit.y, hit.w, hit.h);
  }

  // exhausted bubble near log
  if (
    !panelOpen &&
    !drawerVisible &&
    exhausted &&
    state.exhaustedBubble &&
    performance.now() < state.exhaustedBubble.until
  ) {
    paintExhaustedBubble(ctx, w, tex, state.exhaustedBubble.text, hits, dpr);
  }

  if (drawerVisible && motion) {
    const t = paintDrawerShell(ctx, w, h, tex, motion, hits, state, dpr);
    guideTargets = { ...guideTargets, ...t };
  }

  if (guideOn) {
    paintGuide(
      ctx,
      w,
      h,
      state.guideStep!,
      tex,
      hits,
      guideTargets,
      drawerVisible && (motion?.p ?? 0) > 0.9,
    );
    // keep tag hittable during guide
    if (!drawerVisible) {
      const hit = getTagHitRect(capTop);
      pushHit(hits, "tag", hit.x, hit.y, hit.w, hit.h);
    }
  } else if (state.panel === "exhausted" && snap) {
    paintExhaustedPanel(ctx, w, h, snap, tex, hits);
  } else if (state.panel === "rank") {
    paintRankPanel(ctx, w, h, snap, tex, hits, state.selfRank);
  }

  if (state.toast) {
    const tw = Math.min(w * 0.8, 300);
    const th = 36;
    const tx = (w - tw) / 2;
    const ty = h * 0.16;
    ctx.fillStyle = "rgba(40,28,16,0.78)";
    ctx.fillRect(tx, ty, tw, th);
    ctx.fillStyle = CREAM;
    ctx.font = fontSans(13);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(state.toast, w / 2, ty + th / 2);
  }

  return hits;
}

export function hitTestUi(hits: HitRect[], x: number, y: number): UiHit {
  for (let i = hits.length - 1; i >= 0; i--) {
    const r = hits[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.id;
  }
  return null;
}

export function hitTestUiFull(hits: HitRect[], x: number, y: number): HitRect | null {
  for (let i = hits.length - 1; i >= 0; i--) {
    const r = hits[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
  }
  return null;
}

/** 兼容旧导出名 */
export function paintEconomyHud() {}
export function paintEconomyHudLegacy() {}
export { stateOpen, stateClose, motionAt, capsuleTopPt };
