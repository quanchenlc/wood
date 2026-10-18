/**
 * 小游戏 HUD：全部画在 canvas 上，禁止 wx.showLoading / showToast / showModal。
 * - harness：DOM 透明覆盖层 canvas
 * - 真机：离屏 2D canvas → CanvasTexture，每帧叠在 WebGL 上
 */

import * as THREE from "three";
import { isMinigame } from "./env";

export interface ArtSwitcherState {
  visible: boolean;
  open: boolean;
  activeId: string;
  options: { id: string; label: string }[];
  /** 切换加载中文案；非空时显示半透明遮罩进度 */
  loadingText?: string | null;
}

export type ArtSwitcherHit = "toggle" | string | null;

export interface HudApi {
  setProgress(loaded: number, total: number): void;
  setStatus?(text: string): void;
  hideLoading(): void;
  showHint(actionText: string): void;
  hideHint(): void;
  setArtSwitcher?(state: ArtSwitcherState): void;
  /** CSS 像素坐标（相对窗口） */
  hitTestArtSwitcher?(clientX: number, clientY: number): ArtSwitcherHit;
  /** 真机 WebGL 叠加；DOM 模式为空操作 */
  composite?(renderer: THREE.WebGLRenderer): void;
  dispose(): void;
}

function paintLoading(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  loaded: number,
  total: number,
  status: string,
) {
  const pct = Math.round((loaded / Math.max(1, total)) * 100);
  ctx.fillStyle = "#1a1207";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#e8d5b0";
  ctx.font = "600 22px Georgia, Songti SC, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(status || "正在加载", w / 2, h / 2 - 36);
  ctx.globalAlpha = 0.75;
  ctx.font = "600 18px ui-monospace, monospace";
  ctx.fillText(`${pct}%`, w / 2, h / 2 - 6);
  ctx.globalAlpha = 0.55;
  ctx.font = "13px ui-monospace, monospace";
  ctx.fillText(`${loaded} / ${total}`, w / 2, h / 2 + 18);
  ctx.globalAlpha = 1;
  const barW = Math.min(240, w * 0.62);
  const barX = (w - barW) / 2;
  const barY = h / 2 + 36;
  ctx.fillStyle = "rgba(232,213,176,0.15)";
  ctx.fillRect(barX, barY, barW, 6);
  ctx.fillStyle = "#e8d5b0";
  ctx.fillRect(barX, barY, barW * Math.min(1, loaded / Math.max(1, total)), 6);
}

function paintHint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  actionText: string,
  alpha: number,
) {
  const text = `← 拖动旋转 →  ·  ${actionText}`;
  ctx.globalAlpha = alpha;
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

/** harness：DOM 覆盖层 */
class DomCanvasHud implements HudApi {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private loaded = 0;
  private total = 1;
  private status = "正在加载";
  private loadingVisible = true;
  private hintVisible = false;
  private hintAction = "点击劈开";
  private art: ArtSwitcherState = { visible: false, open: false, activeId: "set0", options: [] };
  private artHit: ReturnType<typeof paintArtSwitcher> | null = null;
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

  setStatus(text: string) {
    this.status = text || "正在加载";
    this.loadingVisible = true;
  }

  hideLoading() {
    this.loadingVisible = false;
  }

  showHint(actionText: string) {
    this.hintAction = actionText;
    this.hintVisible = true;
  }

  hideHint() {
    this.hintVisible = false;
  }

  setArtSwitcher(state: ArtSwitcherState) {
    this.art = state;
  }

  hitTestArtSwitcher(clientX: number, clientY: number): ArtSwitcherHit {
    if (!this.art.visible || !this.artHit) return null;
    if (this.art.loadingText) return null;
    if (hitRect(this.artHit.toggle, clientX, clientY)) return "toggle";
    for (const opt of this.artHit.options) {
      if (hitRect(opt.rect, clientX, clientY)) return opt.id;
    }
    if (this.art.open) return "toggle"; // 点空白收起
    return null;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const w = window.innerWidth || 375;
    const h = window.innerHeight || 812;
    this.ctx.clearRect(0, 0, w, h);
    if (this.loadingVisible) {
      paintLoading(this.ctx, w, h, this.loaded, this.total, this.status);
    }
    if (this.hintVisible) {
      paintHint(this.ctx, w, h, this.hintAction, 1);
    }
    this.artHit = this.art.visible ? paintArtSwitcher(this.ctx, w, h, this.art) : null;
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.syncSize);
    this.canvas.remove();
  }
}

/**
 * 真机：离屏 2D + 全屏 CanvasTexture，叠在 WebGL 上。
 * 不使用任何 wx.showLoading / showToast / showModal。
 */
class WebglOverlayHud implements HudApi {
  private readonly surface: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private loaded = 0;
  private total = 1;
  private status = "正在加载";
  private loadingVisible = true;
  private hintVisible = false;
  private hintAction = "点击劈开";
  private art: ArtSwitcherState = { visible: false, open: false, activeId: "set0", options: [] };
  private artHit: ReturnType<typeof paintArtSwitcher> | null = null;
  private dirty = true;
  private cssW = 375;
  private cssH = 812;
  private overlayScene: THREE.Scene | null = null;
  private overlayCam: THREE.OrthographicCamera | null = null;
  private texture: THREE.CanvasTexture | null = null;
  private mesh: THREE.Mesh | null = null;

  constructor() {
    const g = globalThis as {
      wx?: { createCanvas?: () => HTMLCanvasElement };
      document?: Document;
    };
    let surface: HTMLCanvasElement | null = null;
    if (g.wx?.createCanvas) {
      try {
        surface = g.wx.createCanvas();
      } catch {
        surface = null;
      }
    }
    if (!surface && typeof document !== "undefined") {
      surface = document.createElement("canvas");
    }
    if (!surface) throw new Error("HUD surface unavailable");
    this.surface = surface;
    const ctx = this.surface.getContext("2d");
    if (!ctx) throw new Error("HUD 2D context unavailable");
    this.ctx = ctx;
    this.resizeSurface();
    this.redraw();
  }

  private resizeSurface() {
    const info =
      typeof wx !== "undefined" && (wx as { getSystemInfoSync?: () => { windowWidth?: number; windowHeight?: number; pixelRatio?: number } }).getSystemInfoSync
        ? (wx as { getSystemInfoSync: () => { windowWidth?: number; windowHeight?: number; pixelRatio?: number } }).getSystemInfoSync()
        : { windowWidth: window.innerWidth, windowHeight: window.innerHeight, pixelRatio: 2 };
    this.cssW = info.windowWidth || window.innerWidth || 375;
    this.cssH = info.windowHeight || window.innerHeight || 812;
    const dpr = Math.min(info.pixelRatio || window.devicePixelRatio || 2, 2);
    this.surface.width = Math.floor(this.cssW * dpr);
    this.surface.height = Math.floor(this.cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dirty = true;
  }

  private ensureOverlay(renderer: THREE.WebGLRenderer) {
    if (this.overlayScene) return;
    this.texture = new THREE.CanvasTexture(this.surface);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    const mat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const geo = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.overlayScene = new THREE.Scene();
    this.overlayScene.add(this.mesh);
    this.overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    void renderer; // bind when first composited
  }

  private redraw() {
    const w = this.cssW;
    const h = this.cssH;
    this.ctx.clearRect(0, 0, w, h);
    if (this.loadingVisible) {
      paintLoading(this.ctx, w, h, this.loaded, this.total, this.status);
    }
    if (this.hintVisible) {
      paintHint(this.ctx, w, h, this.hintAction, 1);
    }
    this.artHit = this.art.visible ? paintArtSwitcher(this.ctx, w, h, this.art) : null;
    this.dirty = true;
    if (this.texture) this.texture.needsUpdate = true;
  }

  setArtSwitcher(state: ArtSwitcherState) {
    this.art = state;
    this.redraw();
  }

  hitTestArtSwitcher(clientX: number, clientY: number): ArtSwitcherHit {
    if (!this.art.visible || !this.artHit) return null;
    if (this.art.loadingText) return null;
    if (hitRect(this.artHit.toggle, clientX, clientY)) return "toggle";
    for (const opt of this.artHit.options) {
      if (hitRect(opt.rect, clientX, clientY)) return opt.id;
    }
    if (this.art.open) return "toggle";
    return null;
  }

  setProgress(loaded: number, total: number) {
    this.loaded = loaded;
    this.total = Math.max(1, total);
    this.loadingVisible = true;
    this.redraw();
  }

  setStatus(text: string) {
    this.status = text || "正在加载";
    this.loadingVisible = true;
    this.redraw();
  }

  hideLoading() {
    this.loadingVisible = false;
    this.redraw();
  }

  showHint(actionText: string) {
    this.hintAction = actionText;
    this.hintVisible = true;
    this.redraw();
  }

  hideHint() {
    this.hintVisible = false;
    this.redraw();
  }

  composite(renderer: THREE.WebGLRenderer) {
    if (!this.loadingVisible && !this.hintVisible && !this.art.visible) return;
    this.ensureOverlay(renderer);
    if (this.dirty && this.texture) {
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.overlayScene!, this.overlayCam!);
    renderer.autoClear = prevAutoClear;
  }

  dispose() {
    this.texture?.dispose();
    if (this.mesh) {
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
    }
    this.overlayScene = null;
    this.overlayCam = null;
    this.texture = null;
    this.mesh = null;
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

/** 左下角套装切换（避开 vConsole/胶囊）：按钮 + 可选四项列表；返回命中区供 hitTest */
function paintArtSwitcher(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: ArtSwitcherState,
): { toggle: DOMRect; options: { id: string; rect: DOMRect }[] } {
  // 左下角：避开右下角微信绿色 vConsole、右上角胶囊按钮
  const safeLeft = 12;
  const safeBottom = 20;
  const btnH = 34;
  // 五套标签（含「卡通低多边形」「羊皮纸」）需略宽
  const btnW = 110;
  const bx = safeLeft;
  const by = h - safeBottom - btnH;
  const active = state.options.find((o) => o.id === state.activeId);
  const label = active?.label || "原版";

  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = "rgba(20,14,8,0.55)";
  ctx.strokeStyle = "rgba(232,213,176,0.35)";
  roundRect(ctx, bx, by, btnW, btnH, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#e8d5b0";
  ctx.font = "600 13px system-ui, PingFang SC, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${label}${state.open ? " ▴" : " ▾"}`, bx + btnW / 2, by + btnH / 2);

  const options: { id: string; rect: DOMRect }[] = [];
  if (state.open) {
    const rowH = 36;
    const listH = state.options.length * rowH;
    const lx = bx;
    const ly = by - 8 - listH;
    const lw = btnW;
    roundRect(ctx, lx, ly, lw, listH, 10);
    ctx.fillStyle = "rgba(20,14,8,0.72)";
    ctx.fill();
    ctx.strokeStyle = "rgba(232,213,176,0.28)";
    ctx.stroke();
    state.options.forEach((opt, i) => {
      const ry = ly + i * rowH;
      if (opt.id === state.activeId) {
        ctx.fillStyle = "rgba(232,213,176,0.18)";
        ctx.fillRect(lx + 2, ry + 2, lw - 4, rowH - 4);
      }
      ctx.fillStyle = "#e8d5b0";
      ctx.fillText(opt.label, lx + lw / 2, ry + rowH / 2);
      options.push({
        id: opt.id,
        rect: { x: lx, y: ry, width: lw, height: rowH, top: ry, left: lx, bottom: ry + rowH, right: lx + lw, toJSON() {} },
      });
    });
  }

  if (state.loadingText) {
    ctx.fillStyle = "rgba(10,8,5,0.45)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#e8d5b0";
    ctx.font = "600 16px Georgia, Songti SC, serif";
    ctx.fillText(state.loadingText, w / 2, h / 2);
  }
  ctx.restore();

  return {
    toggle: { x: bx, y: by, width: btnW, height: btnH, top: by, left: bx, bottom: by + btnH, right: bx + btnW, toJSON() {} },
    options,
  };
}

function hitRect(r: { x: number; y: number; width: number; height: number }, x: number, y: number) {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

let hud: HudApi | null = null;

/** Web 有 DOM 加载层时返回 null；小游戏返回 canvas HUD。 */
export function ensureHud(): HudApi | null {
  if (!isMinigame()) return null;
  if (hud) return hud;

  const harnessDoc = (globalThis as { __HARNESS_DOCUMENT__?: Document }).__HARNESS_DOCUMENT__;
  if (harnessDoc?.body) {
    hud = new DomCanvasHud(harnessDoc);
    return hud;
  }

  hud = new WebglOverlayHud();
  return hud;
}

export function compositeHud(renderer: THREE.WebGLRenderer) {
  hud?.composite?.(renderer);
}

export function disposeHud() {
  hud?.dispose();
  hud = null;
}

declare const wx:
  | {
      getSystemInfoSync?: () => {
        windowWidth?: number;
        windowHeight?: number;
        pixelRatio?: number;
      };
      createCanvas?: () => HTMLCanvasElement;
    }
  | undefined;
