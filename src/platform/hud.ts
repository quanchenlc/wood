/**
 * 小游戏 HUD：
 * - harness：挂到真实浏览器 DOM 的透明 canvas，盖在游戏 canvas 上
 * - 真机微信：无第二块上屏 canvas，加载期用 wx.showLoading；提示用 wx.showToast
 */

import { isMinigame } from "./env";

export interface HudApi {
  setProgress(loaded: number, total: number): void;
  hideLoading(): void;
  showHint(actionText: string): void;
  hideHint(): void;
  dispose(): void;
}

type WxLike = {
  showLoading?: (o: { title: string; mask?: boolean }) => void;
  hideLoading?: () => void;
  showToast?: (o: { title: string; icon?: string; duration?: number }) => void;
};

class CanvasHud implements HudApi {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private loaded = 0;
  private total = 1;
  private loadingVisible = true;
  private hintVisible = false;
  private hintAction = "点击劈开";
  private hintAlpha = 1;
  private raf = 0;

  constructor(realDoc: Document) {
    this.canvas = realDoc.createElement("canvas");
    this.canvas.id = "fw-hud";
    Object.assign(this.canvas.style, {
      position: "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "1000",
    });
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("HUD 2D context unavailable");
    this.ctx = ctx;
    realDoc.body.appendChild(this.canvas);
    this.syncSize();
    this.loop();
    window.addEventListener("resize", this.syncSize);
  }

  private syncSize = () => {
    const w = window.innerWidth || 375;
    const h = window.innerHeight || 812;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  setProgress(loaded: number, total: number) {
    this.loaded = loaded;
    this.total = Math.max(1, total);
    this.loadingVisible = true;
  }

  hideLoading() {
    this.loadingVisible = false;
  }

  showHint(actionText: string) {
    this.hintAction = actionText;
    this.hintVisible = true;
    this.hintAlpha = 1;
  }

  hideHint() {
    this.hintVisible = false;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.paint();
  };

  private paint() {
    const w = window.innerWidth || 375;
    const h = window.innerHeight || 812;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    if (this.loadingVisible) {
      ctx.fillStyle = "#1a1207";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#e8d5b0";
      ctx.font = "600 22px Georgia, Songti SC, serif";
      ctx.textAlign = "center";
      ctx.fillText("正在加载", w / 2, h / 2 - 28);
      ctx.globalAlpha = 0.6;
      ctx.font = "14px ui-monospace, monospace";
      ctx.fillText(`${this.loaded} / ${this.total}`, w / 2, h / 2);
      ctx.globalAlpha = 1;
      const barW = 220;
      const barX = (w - barW) / 2;
      const barY = h / 2 + 18;
      ctx.fillStyle = "rgba(232,213,176,0.15)";
      ctx.fillRect(barX, barY, barW, 4);
      ctx.fillStyle = "#e8d5b0";
      ctx.fillRect(barX, barY, barW * (this.loaded / this.total), 4);
    }

    if (this.hintVisible && this.hintAlpha > 0) {
      const text = `← 拖动旋转 →  ·  ${this.hintAction}`;
      ctx.globalAlpha = this.hintAlpha;
      ctx.font = "600 14px system-ui, PingFang SC, sans-serif";
      const tw = ctx.measureText(text).width;
      const padX = 18;
      const boxW = tw + padX * 2;
      const boxH = 34;
      const x = (w - boxW) / 2;
      const y = h - 42 - boxH;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      roundRect(ctx, x, y, boxW, boxH, 17);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e8d5b0";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, w / 2, y + boxH / 2);
      ctx.globalAlpha = 1;
      ctx.textBaseline = "alphabetic";
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.syncSize);
    this.canvas.remove();
  }
}

/** 真机：无 DOM 覆盖层时的降级 HUD */
class WxNativeHud implements HudApi {
  private lastTitle = "";
  private readonly wx: WxLike;

  constructor(wx: WxLike) {
    this.wx = wx;
    this.wx.showLoading?.({ title: "正在加载 0%", mask: true });
  }

  setProgress(loaded: number, total: number) {
    const title = `正在加载 ${Math.round((loaded / Math.max(1, total)) * 100)}%`;
    if (title === this.lastTitle) return;
    this.lastTitle = title;
    this.wx.showLoading?.({ title, mask: true });
  }

  hideLoading() {
    this.wx.hideLoading?.();
  }

  showHint(actionText: string) {
    this.wx.showToast?.({
      title: `拖动旋转 · ${actionText}`,
      icon: "none",
      duration: 2500,
    });
  }

  hideHint() {}

  dispose() {
    this.wx.hideLoading?.();
  }
}

function roundRect(
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

let hud: HudApi | null = null;

/** Web 有 DOM 加载层时返回 null；小游戏返回 HUD。 */
export function ensureHud(): HudApi | null {
  if (!isMinigame()) return null;
  if (hud) return hud;

  const harnessDoc = (globalThis as { __HARNESS_DOCUMENT__?: Document }).__HARNESS_DOCUMENT__;
  if (harnessDoc?.body) {
    hud = new CanvasHud(harnessDoc);
    return hud;
  }

  const wxApi = (globalThis as { wx?: WxLike }).wx;
  if (wxApi?.showLoading) {
    hud = new WxNativeHud(wxApi);
    return hud;
  }

  return null;
}

export function disposeHud() {
  hud?.dispose();
  hud = null;
}
