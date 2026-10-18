import { COPY_C } from "../../economy/design";
import { formatCountdown } from "../../economy/time";
import type { EconomySnapshot } from "../../economy/types";
import {
  getParchmentTextures,
  NINE_SLICE,
  scaledInsets,
  type ParchmentTex,
  type TexMap,
} from "./assets";
import { GUIDE_STEPS } from "./guide";
import { drawNineSlice } from "./nineSlice";

export type PanelMode = "none" | "claim" | "exhausted" | "rank";

export interface ParchmentUiState {
  panel: PanelMode;
  toast: string | null;
  /** 加载中：null 表示已结束；loading 用程序条，不贴 bg */
  loading: { loaded: number; total: number; status: string } | null;
  economy: EconomySnapshot | null;
  /** 榜上本地自己 */
  selfRank?: { name: string; pieces: number; rank: number };
  /** 首次引导步 1–3；null/0 表示不显示 */
  guideStep?: number | null;
}

export type UiHit =
  | "claim"
  | "ad_quota"
  | "ad_skip"
  | "dismiss"
  | "panel"
  | "rank_open"
  | "rank_close"
  | "guide_next"
  | "guide_skip"
  | null;

function texImg(t: ParchmentTex | undefined): HTMLImageElement | undefined {
  return t?.img;
}

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
  valueColor = INK,
) {
  const entry = boost ? tex["chip_boost.png"] : tex["chip_parchment.png"];
  const base = boost ? NINE_SLICE.chip_boost : NINE_SLICE.chip_parchment;
  const img = texImg(entry);
  if (img) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    drawNineSlice(ctx, img, x, y, w, h, scaledInsets(base, entry));
  } else {
    ctx.fillStyle = boost ? "rgba(180,90,40,0.55)" : "rgba(232,220,190,0.85)";
    ctx.fillRect(x, y, w, h);
  }
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = INK_SOFT;
  ctx.font = fontSans(Math.round(h * 0.32));
  ctx.fillText(label, x + 14, y + h / 2);
  ctx.textAlign = "right";
  ctx.fillStyle = valueColor;
  ctx.font = fontSerif(Math.round(h * 0.42), "700");
  ctx.fillText(value, x + w - 14, y + h / 2);
}

/** 经济 HUD chips：左上两行 + 小榜入口，避开胶囊（右缘 ≤ ~520 @750） */
export function paintEconomyHud(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  snap: EconomySnapshot,
  tex: TexMap = getParchmentTextures(),
  hits?: HitRect[],
): void {
  const scale = Math.min(w / 750, h / 1334);
  const chipH = Math.round(56 * scale);
  const gap = Math.round(8 * scale);
  const left = Math.round(16 * scale);
  const top = Math.round(48 * scale);
  const maxRight = Math.round(520 * scale);
  const row1W = Math.min(Math.round(200 * scale), (maxRight - left - gap * 2) / 2);

  const s = snap.state;
  drawChip(ctx, tex, false, left, top, row1W, chipH, COPY_C.hudToday, String(s.today_pieces));
  drawChip(
    ctx,
    tex,
    false,
    left + row1W + gap,
    top,
    row1W,
    chipH,
    COPY_C.hudRemaining,
    String(s.daily_remaining),
    s.daily_remaining <= 0 ? MADDER : INK,
  );

  const row2Y = top + chipH + gap;
  const growW = Math.round(240 * scale);
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
  );
  if (snap.boosting) {
    const bw = Math.round(130 * scale);
    drawChip(ctx, tex, true, left + growW + gap, row2Y, bw, chipH, COPY_C.hudBoost, "×2", MADDER);
  }

  // 小榜入口：顶栏右侧、仍避开胶囊
  const rankW = Math.round(88 * scale);
  const rankH = Math.round(40 * scale);
  const rx = Math.min(maxRight - rankW, w - rankW - Math.round(16 * scale));
  const ry = top + Math.round(4 * scale);
  const strip = tex["strip_parchment.png"];
  const simg = texImg(strip);
  if (simg) {
    drawNineSlice(ctx, simg, rx, ry, rankW, rankH, scaledInsets(NINE_SLICE.strip_parchment, strip));
  } else {
    ctx.fillStyle = "rgba(240,228,200,0.9)";
    ctx.fillRect(rx, ry, rankW, rankH);
  }
  ctx.fillStyle = INK;
  ctx.font = fontSerif(Math.round(rankH * 0.42), "600");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("柴榜", rx + rankW / 2, ry + rankH / 2);
  if (hits) pushHit(hits, "rank_open", rx, ry, rankW, rankH);
}

function paintRibbonTitle(
  ctx: CanvasRenderingContext2D,
  tex: TexMap,
  cx: number,
  y: number,
  title: string,
  width: number,
) {
  const entry = tex["ribbon_madder.png"];
  const img = texImg(entry);
  const h = Math.round(width * (75 / 380));
  const x = cx - width / 2;
  if (img) drawNineSlice(ctx, img, x, y, width, h, scaledInsets(NINE_SLICE.ribbon_madder, entry));
  else {
    ctx.fillStyle = MADDER;
    ctx.fillRect(x, y, width, h);
  }
  ctx.fillStyle = CREAM;
  ctx.font = fontSerif(Math.round(h * 0.42), "700");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, cx, y + h / 2 + 1);
  return { x, y, w: width, h };
}

function paintLeatherBtn(
  ctx: CanvasRenderingContext2D,
  tex: TexMap,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  withSeal = false,
) {
  const entry = tex["btn_leather.png"];
  const img = texImg(entry);
  if (img) drawNineSlice(ctx, img, x, y, w, h, scaledInsets(NINE_SLICE.btn_leather, entry));
  else {
    ctx.fillStyle = "#4a3020";
    ctx.fillRect(x, y, w, h);
  }
  const seal = texImg(tex["seal_wax.png"]);
  if (withSeal && seal) {
    const sh = h * 0.85;
    ctx.drawImage(seal, x + 8, y + (h - sh) / 2, sh, sh);
  }
  ctx.fillStyle = CREAM;
  ctx.font = fontSerif(Math.round(h * 0.38), "700");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2 + (withSeal ? 10 : 0), y + h / 2);
}

function paintStripBtn(
  ctx: CanvasRenderingContext2D,
  tex: TexMap,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
) {
  const entry = tex["strip_parchment.png"];
  const img = texImg(entry);
  if (img) drawNineSlice(ctx, img, x, y, w, h, scaledInsets(NINE_SLICE.strip_parchment, entry));
  else {
    ctx.fillStyle = "rgba(240,228,200,0.9)";
    ctx.fillRect(x, y, w, h);
  }
  ctx.fillStyle = INK;
  ctx.font = fontSerif(Math.round(h * 0.4), "600");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2);
}

/** 程序化加载条（无贴图，notes 要求 first paint 不依赖纹理 I/O） */
export function paintParchmentLoading(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  loaded: number,
  total: number,
  status: string,
) {
  // 暖纸底 + 暗角（不读 bg）
  const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.1, w / 2, h / 2, w * 0.75);
  g.addColorStop(0, "#e8dcc4");
  g.addColorStop(1, "#c4a882");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(60,40,20,0.18)";
  ctx.fillRect(0, 0, w, h);

  const pct = Math.round((loaded / Math.max(1, total)) * 100);
  ctx.fillStyle = INK;
  ctx.font = fontSerif(Math.round(Math.min(w, h) * 0.055), "700");
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(COPY_C.title, w / 2, h * 0.42);

  const barW = Math.min(280, w * 0.62);
  const barX = (w - barW) / 2;
  const barY = h * 0.48;
  ctx.strokeStyle = "rgba(58,42,24,0.25)";
  ctx.lineWidth = 1;
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
  ctx.fillText("v0.3.2 · 羊皮纸稿", w / 2, h - 24);
  ctx.globalAlpha = 1;
}

/** 首次三步引导（占位文案；可跳过） */
export function paintGuide(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  step: number,
  tex: TexMap,
  hits: HitRect[],
) {
  const info = GUIDE_STEPS.find((s) => s.step === step) || GUIDE_STEPS[0];
  ctx.fillStyle = "rgba(40,28,16,0.4)";
  ctx.fillRect(0, 0, w, h);
  pushHit(hits, "dismiss", 0, 0, w, h);

  const pw = Math.min(320, w * 0.84);
  const ph = Math.min(280, h * 0.38);
  const px = (w - pw) / 2;
  const py = h * 0.28;
  pushHit(hits, "panel", px, py, pw, ph);
  const panel = tex["panel_vellum.png"];
  const pimg = texImg(panel);
  if (pimg) drawNineSlice(ctx, pimg, px, py, pw, ph, scaledInsets(NINE_SLICE.panel_vellum, panel));
  else {
    ctx.fillStyle = "#f0e6d0";
    ctx.fillRect(px, py, pw, ph);
  }

  paintRibbonTitle(ctx, tex, w / 2, py + 16, `入门 ${info.step}/3`, Math.min(pw * 0.85, 260));
  ctx.fillStyle = INK;
  ctx.font = fontSerif(18, "700");
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(info.title, w / 2, py + 90);
  ctx.fillStyle = INK_SOFT;
  ctx.font = fontSans(13);
  const lines = info.body.length > 18 ? [info.body.slice(0, 16), info.body.slice(16)] : [info.body];
  lines.forEach((line, i) => ctx.fillText(line, w / 2, py + 122 + i * 22));

  const btnW = Math.min(200, pw * 0.7);
  const bx = (w - btnW) / 2;
  const by = py + ph - 88;
  paintLeatherBtn(ctx, tex, bx, by, btnW, 48, info.step < 3 ? "下一步" : "开始砍柴");
  pushHit(hits, "guide_next", bx, by, btnW, 48);

  ctx.fillStyle = "rgba(58,42,24,0.55)";
  ctx.font = fontSans(13);
  ctx.fillText("跳过引导", w / 2, py + ph - 22);
  pushHit(hits, "guide_skip", w / 2 - 50, py + ph - 36, 100, 28);
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
  // 半透明遮罩，保留 3D 场景可见
  ctx.fillStyle = "rgba(40,28,16,0.35)";
  ctx.fillRect(0, 0, w, h);
  // 先登记全屏 dismiss，面板本体与按钮后登记（命中优先）
  pushHit(hits, "dismiss", 0, 0, w, h);

  const pw = Math.min(340, w * 0.86);
  const ph = mode === "exhausted" ? Math.min(420, h * 0.55) : Math.min(380, h * 0.5);
  const px = (w - pw) / 2;
  const py = (h - ph) / 2 - 20;
  pushHit(hits, "panel", px, py, pw, ph);
  const panel = tex["panel_vellum.png"];
  const pimg = texImg(panel);
  if (pimg) drawNineSlice(ctx, pimg, px, py, pw, ph, scaledInsets(NINE_SLICE.panel_vellum, panel));
  else {
    ctx.fillStyle = "#f0e6d0";
    ctx.fillRect(px, py, pw, ph);
  }

  const title =
    mode === "exhausted"
      ? snap.state.pending_claim > 0 && snap.quotaExhausted
        ? COPY_C.resting
        : COPY_C.exhaustedTitle
      : snap.pendingFull
        ? COPY_C.shedFull
        : COPY_C.pending(snap.state.pending_claim);

  paintRibbonTitle(ctx, tex, w / 2, py + 18, title, Math.min(pw * 0.92, 300));

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  // claim：丝带已含「柴棚待取：N 根」，正文只保留疏伐队提示，避免重复
  const bodyY = mode === "claim" ? py + 88 : py + 100;
  if (mode === "exhausted") {
    ctx.fillStyle = INK;
    ctx.font = fontSerif(16, "600");
    ctx.fillText(COPY_C.exhaustedBody1, w / 2, bodyY);
    ctx.font = fontSans(13);
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(COPY_C.exhaustedBody2, w / 2, bodyY + 28);
    ctx.fillText(COPY_C.restingHint, w / 2, bodyY + 52);
  } else {
    ctx.fillStyle = INK_SOFT;
    ctx.font = fontSans(14);
    ctx.fillText(COPY_C.pendingHint, w / 2, bodyY);
  }

  const divY = mode === "claim" ? bodyY + 36 : bodyY + 72;
  ctx.strokeStyle = "rgba(58,42,24,0.25)";
  ctx.beginPath();
  ctx.moveTo(px + 40, divY);
  ctx.lineTo(w / 2 - 8, divY);
  ctx.moveTo(w / 2 + 8, divY);
  ctx.lineTo(px + pw - 40, divY);
  ctx.stroke();
  ctx.fillStyle = INK_SOFT;
  ctx.font = fontSans(12);
  ctx.fillText("◆", w / 2, divY + 4);

  const btnW = Math.min(260, pw * 0.78);
  const btnH = 52;
  const bx = (w - btnW) / 2;

  if (mode === "claim" && snap.state.pending_claim > 0 && snap.state.daily_remaining > 0) {
    const by = divY + 28;
    paintLeatherBtn(ctx, tex, bx, by, btnW, btnH, `${COPY_C.claim}（${Math.min(snap.state.pending_claim, snap.state.daily_remaining)}）`);
    pushHit(hits, "claim", bx, by, btnW, btnH);

    ctx.fillStyle = INK_SOFT;
    ctx.font = fontSans(12);
    ctx.fillText(COPY_C.watchAd, w / 2, by + btnH + 28);
    const ay = by + btnH + 40;
    paintLeatherBtn(ctx, tex, bx, ay, btnW, btnH, COPY_C.adSkipBtn, true);
    pushHit(hits, "ad_skip", bx, ay, btnW, btnH);
  } else {
    // 蓄养 / 额度用尽：加额度广告；若仍有 pending 但额度 0，领取入口仍可见（灰/提示）但可先加额
    ctx.fillStyle = INK_SOFT;
    ctx.font = fontSans(12);
    ctx.fillText(COPY_C.watchAd, w / 2, divY + 24);
    const ay = divY + 38;
    paintLeatherBtn(ctx, tex, bx, ay, btnW, btnH, COPY_C.adQuotaBtn, true);
    pushHit(hits, "ad_quota", bx, ay, btnW, btnH);

    if (snap.state.pending_claim > 0) {
      const cy = ay + btnH + 16;
      paintStripBtn(
        ctx,
        tex,
        bx,
        cy,
        btnW,
        40,
        snap.state.daily_remaining > 0
          ? `${COPY_C.claim}（${Math.min(snap.state.pending_claim, snap.state.daily_remaining)}）`
          : `${COPY_C.claim}（需加额度）`,
      );
      if (snap.state.daily_remaining > 0) pushHit(hits, "claim", bx, cy, btnW, 40);
    }
  }

  // 面板打开时不画淡化「明日再来」（易叠在树桩上像残留 HUD）；点遮罩空白可关
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
  ctx.fillStyle = "rgba(40,28,16,0.4)";
  ctx.fillRect(0, 0, w, h);

  const pw = Math.min(360, w * 0.9);
  const ph = Math.min(560, h * 0.72);
  const px = (w - pw) / 2;
  const py = (h - ph) / 2 - 10;
  const panel = tex["panel_vellum.png"];
  const pimg = texImg(panel);
  if (pimg) drawNineSlice(ctx, pimg, px, py, pw, ph, scaledInsets(NINE_SLICE.panel_vellum, panel));
  else {
    ctx.fillStyle = "#f0e6d0";
    ctx.fillRect(px, py, pw, ph);
  }

  paintRibbonTitle(ctx, tex, w / 2, py + 16, `${COPY_C.rankTitle} · 本周`, Math.min(pw * 0.88, 300));
  const seal = texImg(tex["seal_wax.png"]);
  if (seal) {
    const s = 42;
    ctx.drawImage(seal, px + pw - s - 18, py + 22, s, s);
  }

  const pieces = self?.pieces ?? snap?.state.total_pieces ?? 0;
  const rank = self?.rank ?? 1;
  const name = self?.name ?? "我";
  const ranks = ["壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌"];

  // 占位好友 + 本地自己高亮
  const rows = [
    { r: 1, name: "林间老樵", pieces: Math.max(pieces + 200, 1284) },
    { r: 2, name: "阿菜", pieces: Math.max(pieces + 80, 960) },
    { r: 3, name: "松下客", pieces: Math.max(pieces + 40, 720) },
    { r: 4, name: "柴门客", pieces: Math.max(pieces + 10, 600) },
    { r: rank, name, pieces, self: true },
    { r: 6, name: "南枝", pieces: Math.max(0, pieces - 40) },
    { r: 7, name: "晚风", pieces: Math.max(0, pieces - 80) },
    { r: 8, name: "山客", pieces: Math.max(0, pieces - 120) },
  ].sort((a, b) => b.pieces - a.pieces);

  let y = py + 90;
  ctx.textBaseline = "middle";
  rows.slice(0, 8).forEach((row, i) => {
    const rh = 44;
    if (row.self || row.name === name) {
      const strip = tex["strip_parchment.png"];
      const simg = texImg(strip);
      if (simg) {
        drawNineSlice(
          ctx,
          simg,
          px + 16,
          y - 4,
          pw - 32,
          rh,
          scaledInsets(NINE_SLICE.strip_parchment, strip),
        );
      }
    }
    ctx.fillStyle = INK;
    ctx.font = fontSerif(16, "700");
    ctx.textAlign = "left";
    ctx.fillText(ranks[i] || String(i + 1), px + 28, y + rh / 2 - 4);
    ctx.beginPath();
    ctx.arc(px + 70, y + rh / 2 - 4, 14, 0, Math.PI * 2);
    ctx.strokeStyle = INK_SOFT;
    ctx.stroke();
    ctx.font = fontSans(12);
    ctx.textAlign = "center";
    ctx.fillText(row.name.slice(0, 1), px + 70, y + rh / 2 - 4);
    ctx.textAlign = "left";
    ctx.font = fontSans(14);
    ctx.fillText(row.name, px + 96, y + rh / 2 - 4);
    ctx.textAlign = "right";
    ctx.font = fontSerif(14, "600");
    ctx.fillText(`${row.pieces.toLocaleString()} 根`, px + pw - 28, y + rh / 2 - 4);
    y += rh;
  });

  ctx.textAlign = "center";
  ctx.fillStyle = INK_SOFT;
  ctx.font = fontSans(12);
  ctx.fillText(COPY_C.rankInvite, w / 2, py + ph - 70);
  ctx.font = fontSans(11);
  ctx.fillText(COPY_C.rankScoreHint, w / 2, py + ph - 52);

  const bw = 140;
  const bh = 44;
  const bx = (w - bw) / 2;
  const by = py + ph - 40;
  paintLeatherBtn(ctx, tex, bx, by, bw, bh, COPY_C.back);
  pushHit(hits, "rank_close", bx, by, bw, bh);
}

export function paintParchmentUi(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: ParchmentUiState,
): HitRect[] {
  const hits: HitRect[] = [];
  const tex = getParchmentTextures();

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

  if (state.economy && state.panel !== "rank" && !guideOn) {
    paintEconomyHud(ctx, w, h, state.economy, tex, hits);
  }

  if (guideOn) {
    paintGuide(ctx, w, h, state.guideStep!, tex, hits);
  } else if (state.panel === "claim" && state.economy) {
    paintClaimOrExhausted(ctx, w, h, state.economy, tex, hits, "claim");
  } else if (state.panel === "exhausted" && state.economy) {
    paintClaimOrExhausted(ctx, w, h, state.economy, tex, hits, "exhausted");
  } else if (state.panel === "rank") {
    paintRankPanel(ctx, w, h, state.economy, tex, hits, state.selfRank);
  }

  if (state.toast) {
    ctx.fillStyle = "rgba(40,28,16,0.75)";
    const tw = Math.min(w * 0.8, 320);
    const th = 40;
    const tx = (w - tw) / 2;
    const ty = h * 0.18;
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
