import { COPY_C } from "../../economy/design";
import { formatCountdown } from "../../economy/time";
import type { EconomySnapshot } from "../../economy/types";
import { getParchmentTextures, getUiDpr, type ParchmentTex, type TexMap } from "./assets";
import { GUIDE_COPY } from "./guide";
import { drawNineSlice, snapPt, snapRect, type Insets } from "./nineSlice";

export type PanelMode = "none" | "claim" | "exhausted" | "rank";

export interface GuideTargets {
  /** 木头屏幕投影（CSS px） */
  log?: { x: number; y: number; w: number; h: number };
  /** 剩余树根 + 生长倒计时合并框 */
  roots?: { x: number; y: number; w: number; h: number };
  /** 右侧图标列 */
  icons?: { x: number; y: number; w: number; h: number };
}

export interface ParchmentUiState {
  panel: PanelMode;
  toast: string | null;
  loading: { loaded: number; total: number; status: string } | null;
  economy: EconomySnapshot | null;
  selfRank?: { name: string; pieces: number; rank: number };
  guideStep?: number | null;
  guideTargets?: GuideTargets;
  /** 广告位今日剩余次数角标 */
  adRemaining?: number;
}

export type UiHit =
  | "claim"
  | "claim_strip"
  | "ad_quota"
  | "ad_skip"
  | "dismiss"
  | "panel"
  | "rank_open"
  | "rank_close"
  | "help_open"
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

function pushHit(hits: HitRect[], id: UiHit, x: number, y: number, w: number, h: number) {
  hits.push({ id, x, y, w, h });
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
    drawNineSlice(
      ctx,
      tex.img,
      r.x,
      r.y,
      r.w,
      r.h,
      tex.srcInsets,
      tex.dstInsets as Insets,
    );
  } else {
    ctx.drawImage(tex.img, r.x, r.y, r.w, r.h);
  }
  return true;
}

function drawChip(
  ctx: CanvasRenderingContext2D,
  tex: TexMap,
  boost: boolean,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  dpr: number,
  valueColor = INK,
) {
  const entry = boost ? tex.chip_boost : tex.chip_parchment;
  if (!drawTexNine(ctx, entry, x, y, w, h, dpr)) {
    ctx.fillStyle = boost ? "rgba(180,90,40,0.55)" : "rgba(232,220,190,0.85)";
    const r = snapRect(x, y, w, h, dpr);
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = INK_SOFT;
  ctx.font = fontSans(12);
  ctx.fillText(label, snapPt(x + 10, dpr), snapPt(y + h / 2, dpr));
  ctx.textAlign = "right";
  ctx.fillStyle = valueColor;
  ctx.font = fontSerif(16, "700");
  ctx.fillText(value, snapPt(x + w - 10, dpr), snapPt(y + h / 2, dpr));
}

function paintRibbonTitle(
  ctx: CanvasRenderingContext2D,
  tex: TexMap,
  cx: number,
  y: number,
  title: string,
  width: number,
  dpr: number,
) {
  const h = 36;
  const x = cx - width / 2;
  drawTexNine(ctx, tex.ribbon_madder, x, y, width, h, dpr);
  ctx.fillStyle = CREAM;
  ctx.font = fontSerif(15, "700");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, snapPt(cx, dpr), snapPt(y + h / 2 + 1, dpr));
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
  withSeal = false,
) {
  if (!drawTexNine(ctx, tex.btn_leather, x, y, w, h, dpr)) {
    const r = snapRect(x, y, w, h, dpr);
    ctx.fillStyle = "#4a3020";
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  if (withSeal && tex.seal_wax) {
    const sh = h * 0.72;
    ctx.drawImage(tex.seal_wax.img, snapPt(x + 8, dpr), snapPt(y + (h - sh) / 2, dpr), sh, sh);
  }
  ctx.fillStyle = CREAM;
  ctx.font = fontSerif(Math.max(14, h * 0.36), "700");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, snapPt(x + w / 2 + (withSeal ? 8 : 0), dpr), snapPt(y + h / 2, dpr));
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
  ctx.font = fontSerif(Math.max(12, h * 0.4), "600");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, snapPt(x + w / 2, dpr), snapPt(y + h / 2, dpr));
}

function paintIconBtn(
  ctx: CanvasRenderingContext2D,
  tex: TexMap,
  id: "btn_icon_rank" | "btn_icon_ad" | "btn_icon_help",
  x: number,
  y: number,
  label: string,
  dpr: number,
  badge?: number,
) {
  const size = 48;
  const entry = tex[id];
  const r = snapRect(x, y, size, size, dpr);
  if (entry) ctx.drawImage(entry.img, r.x, r.y, r.w, r.h);
  else {
    ctx.fillStyle = "rgba(232,220,190,0.9)";
    ctx.beginPath();
    ctx.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (badge != null && badge > 0) {
    ctx.fillStyle = MADDER;
    ctx.beginPath();
    ctx.arc(r.x + r.w - 4, r.y + 6, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = CREAM;
    ctx.font = fontSans(11, "700");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(Math.min(badge, 9)), r.x + r.w - 4, r.y + 6);
  }
  ctx.font = fontSans(11, "700");
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.strokeStyle = "rgba(243,230,200,0.85)";
  ctx.lineWidth = 2;
  ctx.strokeText(label, snapPt(x + size / 2, dpr), snapPt(y + size + 4, dpr));
  ctx.fillStyle = INK;
  ctx.fillText(label, snapPt(x + size / 2, dpr), snapPt(y + size + 4, dpr));
  return { x, y, w: size, h: size + 20 };
}

/** 程序化加载（无 bg 贴图） */
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
  ctx.fillStyle = "rgba(60,40,20,0.18)";
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
  const fill = barW * Math.min(1, loaded / Math.max(1, total));
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + fill, barY);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(barX + fill, barY, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = INK_SOFT;
  ctx.font = fontSans(14);
  ctx.fillText(`${status || COPY_C.loading} ${pct}%`, w / 2, barY + 28);
  ctx.globalAlpha = 0.35;
  ctx.font = fontSans(11);
  ctx.fillText("v0.3.3 · 羊皮纸稿", w / 2, h - 24);
  ctx.globalAlpha = 1;
}

export function paintEconomyHud(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  snap: EconomySnapshot,
  tex: TexMap,
  hits: HitRect[],
  opts?: { adRemaining?: number; hideClaimStrip?: boolean },
): GuideTargets {
  const dpr = getUiDpr();
  const chipH = 34;
  const gap = 6;
  const left = 12;
  // 胶囊安全：约 y=50，右缘 ≤268 @375
  const top = 50;
  const chipW = 120;

  const s = snap.state;
  drawChip(ctx, tex, false, left, top, chipW, chipH, COPY_C.hudToday, String(s.today_pieces), dpr);
  drawChip(
    ctx,
    tex,
    false,
    left + chipW + gap,
    top,
    chipW,
    chipH,
    COPY_C.hudRemaining,
    String(s.daily_remaining),
    dpr,
    s.daily_remaining <= 0 ? MADDER : INK,
  );

  const row2Y = top + chipH + gap;
  const growW = 150;
  drawChip(
    ctx,
    tex,
    false,
    left,
    row2Y,
    growW,
    chipH,
    COPY_C.hudGrowing,
    snap.pendingFull ? "已满" : formatCountdown(snap.nextRootMs),
    dpr,
  );
  if (snap.boosting) {
    drawChip(ctx, tex, true, left + growW + gap, row2Y, 96, chipH, COPY_C.hudBoost, "×2", dpr, MADDER);
  }

  // 右侧图标列
  const iconX = w - 12 - 48;
  let iconY = 100;
  const rankBox = paintIconBtn(ctx, tex, "btn_icon_rank", iconX, iconY, "柴榜", dpr);
  pushHit(hits, "rank_open", rankBox.x, rankBox.y, rankBox.w, rankBox.h);
  iconY += 72;
  const adBox = paintIconBtn(
    ctx,
    tex,
    "btn_icon_ad",
    iconX,
    iconY,
    "加速",
    dpr,
    opts?.adRemaining,
  );
  pushHit(hits, "ad_skip", adBox.x, adBox.y, adBox.w, adBox.h);
  iconY += 72;
  const helpBox = paintIconBtn(ctx, tex, "btn_icon_help", iconX, iconY, "玩法", dpr);
  pushHit(hits, "help_open", helpBox.x, helpBox.y, helpBox.w, helpBox.h);

  // 底部领取纸条（引导期间隐藏）
  if (!opts?.hideClaimStrip && s.pending_claim > 0) {
    const sw = 168;
    const sh = 40;
    const sx = (w - sw) / 2;
    const sy = Math.min(h - 100, 712);
    paintStripBtn(ctx, tex, sx, sy, sw, sh, `柴棚待取 ${s.pending_claim} · 领取`, dpr);
    pushHit(hits, "claim_strip", sx, sy, sw, sh);
  }

  return {
    roots: {
      x: left,
      y: top,
      w: chipW * 2 + gap,
      h: chipH * 2 + gap,
    },
    icons: {
      x: iconX - 4,
      y: 96,
      w: 56,
      h: 72 * 2 + 48,
    },
  };
}

export function paintClaimOrExhausted(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  snap: EconomySnapshot,
  tex: TexMap,
  hits: HitRect[],
  mode: "claim" | "exhausted",
) {
  const dpr = getUiDpr();
  ctx.fillStyle = "rgba(40,28,16,0.4)";
  ctx.fillRect(0, 0, w, h);
  pushHit(hits, "dismiss", 0, 0, w, h);

  const pw = Math.min(300, w * 0.86);
  const ph = mode === "exhausted" ? 360 : 320;
  const px = (w - pw) / 2;
  const py = (h - ph) / 2 - 16;
  pushHit(hits, "panel", px, py, pw, ph);
  drawTexNine(ctx, tex.panel_vellum, px, py, pw, ph, dpr);

  const title =
    mode === "exhausted"
      ? snap.quotaExhausted
        ? COPY_C.resting
        : COPY_C.exhaustedTitle
      : snap.pendingFull
        ? COPY_C.shedFull
        : COPY_C.pending(snap.state.pending_claim);

  paintRibbonTitle(ctx, tex, w / 2, py + 14, title, Math.min(pw * 0.9, 260), dpr);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const bodyY = py + 70;
  if (mode === "exhausted") {
    ctx.fillStyle = INK;
    ctx.font = fontSerif(15, "600");
    ctx.fillText(COPY_C.exhaustedBody1, w / 2, bodyY);
    ctx.fillStyle = INK_SOFT;
    ctx.font = fontSans(12);
    ctx.fillText(COPY_C.exhaustedBody2, w / 2, bodyY + 24);
    ctx.fillText(COPY_C.restingHint, w / 2, bodyY + 46);
  } else {
    ctx.fillStyle = INK_SOFT;
    ctx.font = fontSans(13);
    ctx.fillText(COPY_C.pendingHint, w / 2, bodyY);
  }

  const btnW = Math.min(220, pw * 0.78);
  const btnH = 48;
  const bx = (w - btnW) / 2;
  if (mode === "claim" && snap.state.pending_claim > 0 && snap.state.daily_remaining > 0) {
    const by = bodyY + 40;
    paintLeatherBtn(
      ctx,
      tex,
      bx,
      by,
      btnW,
      btnH,
      `${COPY_C.claim}（${Math.min(snap.state.pending_claim, snap.state.daily_remaining)}）`,
      dpr,
    );
    pushHit(hits, "claim", bx, by, btnW, btnH);
    ctx.fillStyle = INK_SOFT;
    ctx.font = fontSans(12);
    ctx.fillText(COPY_C.watchAd, w / 2, by + btnH + 24);
    const ay = by + btnH + 36;
    paintLeatherBtn(ctx, tex, bx, ay, btnW, btnH, COPY_C.adSkipBtn, dpr, true);
    pushHit(hits, "ad_skip", bx, ay, btnW, btnH);
  } else {
    ctx.fillStyle = INK_SOFT;
    ctx.font = fontSans(12);
    ctx.fillText(COPY_C.watchAd, w / 2, bodyY + 36);
    const ay = bodyY + 50;
    paintLeatherBtn(ctx, tex, bx, ay, btnW, btnH, COPY_C.adQuotaBtn, dpr, true);
    pushHit(hits, "ad_quota", bx, ay, btnW, btnH);
    if (snap.state.pending_claim > 0 && snap.state.daily_remaining > 0) {
      const cy = ay + btnH + 14;
      paintStripBtn(
        ctx,
        tex,
        bx,
        cy,
        btnW,
        36,
        `${COPY_C.claim}（${Math.min(snap.state.pending_claim, snap.state.daily_remaining)}）`,
        dpr,
      );
      pushHit(hits, "claim", bx, cy, btnW, 36);
    }
  }
}

export function paintRankPanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  snap: EconomySnapshot | null,
  tex: TexMap,
  hits: HitRect[],
  self?: { name: string; pieces: number; rank: number },
) {
  const dpr = getUiDpr();
  ctx.fillStyle = "rgba(40,28,16,0.4)";
  ctx.fillRect(0, 0, w, h);
  pushHit(hits, "dismiss", 0, 0, w, h);

  const pw = Math.min(320, w * 0.9);
  const ph = Math.min(520, h * 0.7);
  const px = (w - pw) / 2;
  const py = (h - ph) / 2 - 8;
  pushHit(hits, "panel", px, py, pw, ph);
  drawTexNine(ctx, tex.panel_vellum, px, py, pw, ph, dpr);
  paintRibbonTitle(ctx, tex, w / 2, py + 12, `${COPY_C.rankTitle} · 本周`, Math.min(pw * 0.88, 260), dpr);
  if (tex.seal_wax) {
    const s = 36;
    ctx.drawImage(tex.seal_wax.img, snapPt(px + pw - s - 14, dpr), snapPt(py + 18, dpr), s, s);
  }

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

  let y = py + 70;
  ctx.textBaseline = "middle";
  rows.slice(0, 8).forEach((row, i) => {
    const rh = 40;
    if (row.self || row.name === name) {
      drawTexNine(ctx, tex.strip_parchment, px + 14, y - 2, pw - 28, rh, dpr);
    }
    ctx.fillStyle = INK;
    ctx.font = fontSerif(14, "700");
    ctx.textAlign = "left";
    ctx.fillText(ranks[i] || String(i + 1), px + 24, y + rh / 2 - 2);
    ctx.font = fontSans(13);
    ctx.fillText(row.name, px + 56, y + rh / 2 - 2);
    ctx.textAlign = "right";
    ctx.font = fontSerif(13, "600");
    ctx.fillText(`${row.pieces.toLocaleString()} 根`, px + pw - 24, y + rh / 2 - 2);
    y += rh;
  });

  ctx.textAlign = "center";
  ctx.fillStyle = INK_SOFT;
  ctx.font = fontSans(11);
  ctx.fillText(COPY_C.rankInvite, w / 2, py + ph - 58);
  paintLeatherBtn(ctx, tex, (w - 140) / 2, py + ph - 42, 140, 40, COPY_C.back, dpr);
  pushHit(hits, "rank_close", (w - 140) / 2, py + ph - 42, 140, 40);
}

function drawSpotlight(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  hole: { x: number; y: number; w: number; h: number },
  round = false,
) {
  ctx.save();
  ctx.fillStyle = "rgba(20,12,6,0.58)";
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  if (round) {
    const cx = hole.x + hole.w / 2;
    const cy = hole.y + hole.h / 2;
    const rx = hole.w / 2;
    const ry = hole.h / 2;
    ctx.moveTo(cx + rx, cy);
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2, true);
  } else {
    const r = 10;
    const { x, y, w: hw, h: hh } = hole;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + hw, y, x + hw, y + hh, r);
    ctx.arcTo(x + hw, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r);
    ctx.arcTo(x, y, x + hw, y, r);
    ctx.closePath();
  }
  ctx.fill("evenodd");
  ctx.restore();
}

export function paintGuide(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  step: number,
  tex: TexMap,
  hits: HitRect[],
  targets?: GuideTargets,
) {
  const dpr = getUiDpr();
  const copy = GUIDE_COPY[step as 1 | 2 | 3] || GUIDE_COPY[1];

  let hole = { x: w * 0.22, y: h * 0.32, w: w * 0.56, h: h * 0.28 };
  let round = true;
  if (step === 1 && targets?.log) {
    hole = { ...targets.log };
    round = true;
  } else if (step === 2 && targets?.roots) {
    hole = { ...targets.roots };
    round = false;
  } else if (step === 3 && targets?.icons) {
    hole = { ...targets.icons };
    round = false;
  }

  drawSpotlight(ctx, w, h, hole, round);
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

  // bubble
  const bw = Math.min(220, w * 0.72);
  const bh = 72;
  let bx = (w - bw) / 2;
  let by = hole.y - bh - 28;
  if (step === 2) by = hole.y + hole.h + 16;
  if (step === 3) {
    bx = Math.max(12, hole.x - bw - 12);
    by = hole.y + 8;
  }
  if (by < 48) by = hole.y + hole.h + 16;
  drawTexNine(ctx, tex.guide_bubble, bx, by, bw, bh, dpr);
  if (tex.guide_tail) {
    const tw = 28;
    const th = 18;
    if (step === 1) {
      ctx.drawImage(tex.guide_tail.img, snapPt(bx + bw / 2 - tw / 2, dpr), snapPt(by + bh - 4, dpr), tw, th);
    } else if (step === 2) {
      ctx.save();
      ctx.translate(snapPt(bx + bw / 2, dpr), snapPt(by + 2, dpr));
      ctx.scale(1, -1);
      ctx.drawImage(tex.guide_tail.img, -tw / 2, 0, tw, th);
      ctx.restore();
    }
  }
  ctx.fillStyle = INK;
  ctx.font = fontSerif(15, "700");
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(copy.title, snapPt(bx + bw / 2, dpr), snapPt(by + 28, dpr));
  ctx.fillStyle = INK_SOFT;
  ctx.font = fontSans(12);
  ctx.fillText(copy.body, snapPt(bx + bw / 2, dpr), snapPt(by + 50, dpr));

  if (step === 1 && tex.guide_hand) {
    const t = (performance.now() % 900) / 900;
    const press = Math.sin(t * Math.PI) * 3;
    const sc = 1 - Math.sin(t * Math.PI) * 0.1;
    const hx = hole.x + hole.w / 2 - 16;
    const hy = hole.y + hole.h * 0.35 + press;
    const hs = 48 * sc;
    ctx.drawImage(tex.guide_hand.img, snapPt(hx, dpr), snapPt(hy, dpr), hs, hs);
  }

  // skip strip bottom
  const skipW = 84;
  const skipH = 32;
  const skipX = (w - skipW) / 2;
  const skipY = Math.min(h - 80, 712);
  paintStripBtn(ctx, tex, skipX, skipY, skipW, skipH, "跳过 ›", dpr);
  pushHit(hits, "guide_skip", skipX, skipY, skipW, skipH);

  if (step === 3) {
    const btnW = 200;
    const btnH = 48;
    const btnX = (w - btnW) / 2;
    const btnY = skipY - 64;
    paintLeatherBtn(ctx, tex, btnX, btnY, btnW, btnH, "知道了，开砍！", dpr);
    pushHit(hits, "guide_next", btnX, btnY, btnW, btnH);
  } else if (step === 2) {
    ctx.fillStyle = "rgba(243,230,200,0.75)";
    ctx.font = fontSans(12);
    ctx.textAlign = "center";
    ctx.fillText("轻点任意处继续", w / 2, skipY - 24);
    pushHit(hits, "guide_tap", 0, 0, w, h);
  }
  // step1：可交互，不挡游戏点击（不推全屏 hit）
}

export function paintParchmentUi(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: ParchmentUiState,
): HitRect[] {
  const hits: HitRect[] = [];
  const tex = getParchmentTextures();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (state.loading) {
    paintParchmentLoading(ctx, w, h, state.loading.loaded, state.loading.total, state.loading.status);
    return hits;
  }

  const guideOn = Boolean(state.guideStep && state.guideStep >= 1 && state.guideStep <= 3);
  let targets = state.guideTargets;

  if (state.economy && state.panel !== "rank") {
    targets = paintEconomyHud(ctx, w, h, state.economy, tex, hits, {
      adRemaining: state.adRemaining,
      hideClaimStrip: guideOn,
    });
  }

  if (guideOn) {
    paintGuide(ctx, w, h, state.guideStep!, tex, hits, targets);
  } else if (state.panel === "claim" && state.economy) {
    paintClaimOrExhausted(ctx, w, h, state.economy, tex, hits, "claim");
  } else if (state.panel === "exhausted" && state.economy) {
    paintClaimOrExhausted(ctx, w, h, state.economy, tex, hits, "exhausted");
  } else if (state.panel === "rank") {
    paintRankPanel(ctx, w, h, state.economy, tex, hits, state.selfRank);
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

/** 兼容旧导出名 */
export function paintEconomyHudLegacy() {}
