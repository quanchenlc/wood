/**
 * 小游戏 HUD：全部画在 canvas 上，禁止 wx.showLoading / showToast / showModal。
 * - harness：DOM 透明覆盖层 canvas
 * - 真机：离屏 2D canvas → CanvasTexture，每帧叠在 WebGL 上
 * - 0.3.2：羊皮纸 HUD 全 device DPR 绘制（3D 仍 ≤1.5）；支持 @2x 切片
 */

/** UI 层取完整 devicePixelRatio（可略封顶防极端机型），与 3D maxDpr=1.5 解耦 */
function uiDeviceDpr(fallback = 2): number {
  let raw = fallback;
  try {
    if (typeof wx !== "undefined") {
      const info = (
        wx as { getSystemInfoSync?: () => { pixelRatio?: number } }
      ).getSystemInfoSync?.();
      if (info?.pixelRatio) raw = info.pixelRatio;
    } else if (typeof window !== "undefined") {
      raw = window.devicePixelRatio || fallback;
    }
  } catch {
    raw = typeof window !== "undefined" ? window.devicePixelRatio || fallback : fallback;
  }
  // 全 DPR 锐利文字；仅防 4x 极端机型撑爆内存
  return Math.min(Math.max(1, raw), 3);
}

import * as THREE from "three";
import { isMinigame } from "./env";
import {
  hitTestUi,
  hitTestUiFull,
  paintParchmentLoading,
  paintParchmentUi,
  setUiDpr,
  type HitRect,
  type ParchmentUiState,
  type UiHit,
} from "../ui/parchment";

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
  setParchmentUi?(state: ParchmentUiState): void;
  hitTestParchment?(clientX: number, clientY: number): UiHit;
  hitTestParchmentFull?(clientX: number, clientY: number): HitRect | null;
  /** 真机 WebGL 叠加；DOM 模式为空操作 */
  composite?(renderer: THREE.WebGLRenderer): void;
  /** 与绘图缓冲对齐（WebGL overlay）；DOM 层空操作 */
  syncToDrawingBuffer?(renderer: THREE.WebGLRenderer): void;
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
  paintParchmentLoading(ctx, w, h, loaded, total, status || "正在磨斧…");
}

/** harness：DOM 覆盖层 */
class DomCanvasHud implements HudApi {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private loaded = 0;
  private total = 1;
  private status = "正在磨斧…";
  private loadingVisible = true;
  private parchment: ParchmentUiState = { panel: "none", toast: null, loading: null, economy: null };
  private parchmentHits: HitRect[] = [];
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
    // 独立 DOM 层：全设备 DPR，不经 1.5x 3D 缓冲（0.3.2 已修）
    const dpr = uiDeviceDpr(window.devicePixelRatio || 2);
    setUiDpr(dpr);
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
  };

  setProgress(loaded: number, total: number) {
    this.loaded = loaded;
    this.total = Math.max(1, total);
    this.loadingVisible = true;
  }

  setStatus(text: string) {
    this.status = text || "正在磨斧…";
    this.loadingVisible = true;
  }

  hideLoading() {
    this.loadingVisible = false;
  }

  showHint(_actionText: string) {
    /* 0.3.3 旧 hint 条已移除 */
  }

  hideHint() {
    /* no-op */
  }

  setArtSwitcher(_state: ArtSwitcherState) {
    /* 0.3.4 左下切换已移除 */
  }

  setParchmentUi(state: ParchmentUiState) {
    this.parchment = state;
  }

  hitTestParchment(clientX: number, clientY: number): UiHit {
    return hitTestUi(this.parchmentHits, clientX, clientY);
  }

  hitTestParchmentFull(clientX: number, clientY: number): HitRect | null {
    return hitTestUiFull(this.parchmentHits, clientX, clientY);
  }

  hitTestArtSwitcher(_clientX: number, _clientY: number): ArtSwitcherHit {
    return null;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const w = window.innerWidth || 375;
    const h = window.innerHeight || 812;
    this.ctx.clearRect(0, 0, w, h);
    if (this.loadingVisible) {
      paintLoading(this.ctx, w, h, this.loaded, this.total, this.status);
      this.parchmentHits = [];
    } else {
      this.parchmentHits = paintParchmentUi(this.ctx, w, h, this.parchment);
    }
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
  private status = "正在磨斧…";
  private loadingVisible = true;
  private art: ArtSwitcherState = { visible: false, open: false, activeId: "set0", options: [] };
  private parchment: ParchmentUiState = { panel: "none", toast: null, loading: null, economy: null };
  private parchmentHits: HitRect[] = [];
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
    // 与屏缓冲同 DPR（ScenePresenter 已把屏提到设备 DPR）；禁止再 min(dpr,2) 后塞进 1.5x
    const dpr = uiDeviceDpr(info.pixelRatio || window.devicePixelRatio || 2);
    setUiDpr(dpr);
    this.surface.width = Math.floor(this.cssW * dpr);
    this.surface.height = Math.floor(this.cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
    this.dirty = true;
  }

  /** 与 renderer 绘图缓冲对齐（1:1，无二次缩放） */
  syncToDrawingBuffer(renderer: THREE.WebGLRenderer) {
    const size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);
    const dpr = size.x / Math.max(1, this.cssW);
    if (
      Math.abs(this.surface.width - size.x) > 1 ||
      Math.abs(this.surface.height - size.y) > 1
    ) {
      setUiDpr(dpr);
      this.surface.width = Math.floor(size.x);
      this.surface.height = Math.floor(size.y);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = "high";
      this.redraw();
    }
  }

  private ensureOverlay(renderer: THREE.WebGLRenderer) {
    if (this.overlayScene) return;
    this.texture = new THREE.CanvasTexture(this.surface);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.premultiplyAlpha = true;
    const mat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      premultipliedAlpha: true,
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
      this.parchmentHits = [];
    } else {
      this.parchmentHits = paintParchmentUi(this.ctx, w, h, this.parchment);
    }
    this.dirty = true;
    if (this.texture) this.texture.needsUpdate = true;
  }

  setArtSwitcher(state: ArtSwitcherState) {
    this.art = state;
    this.redraw();
  }

  setParchmentUi(state: ParchmentUiState) {
    this.parchment = state;
    this.redraw();
  }

  hitTestParchment(clientX: number, clientY: number): UiHit {
    return hitTestUi(this.parchmentHits, clientX, clientY);
  }

  hitTestParchmentFull(clientX: number, clientY: number): HitRect | null {
    return hitTestUiFull(this.parchmentHits, clientX, clientY);
  }

  hitTestArtSwitcher(_clientX: number, _clientY: number): ArtSwitcherHit {
    return null;
  }

  setProgress(loaded: number, total: number) {
    this.loaded = loaded;
    this.total = Math.max(1, total);
    this.loadingVisible = true;
    this.redraw();
  }

  setStatus(text: string) {
    this.status = text || "正在磨斧…";
    this.loadingVisible = true;
    this.redraw();
  }

  hideLoading() {
    this.loadingVisible = false;
    this.redraw();
  }

  showHint(_actionText: string) {
    /* 0.3.3 旧 hint 条已移除 */
  }

  hideHint() {
    /* no-op */
  }

  composite(renderer: THREE.WebGLRenderer) {
    const hasPanel =
      this.parchment.panel !== "none" ||
      Boolean(this.parchment.economy) ||
      Boolean(this.parchment.guideStep);
    if (!this.loadingVisible && !this.art.visible && !hasPanel) return;
    this.syncToDrawingBuffer(renderer);
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
