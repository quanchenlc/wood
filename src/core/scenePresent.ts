/**
 * 小游戏：屏幕缓冲 = 设备 DPR（HUD 1:1），3D 渲到 ≤1.5x RT 再 blit。
 * 避免 HUD 被塞进 1.5x 缓冲后再被系统放大发糊。
 */
import * as THREE from "three";
import { IS_MINIGAME } from "../config/constants";

export class ScenePresenter {
  private rt: THREE.WebGLRenderTarget | null = null;
  private blitScene: THREE.Scene | null = null;
  private blitCam: THREE.OrthographicCamera | null = null;
  private blitMat: THREE.MeshBasicMaterial | null = null;
  private readonly sceneDpr: number;
  private readonly screenDpr: number;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    opts?: { screenDpr?: number; sceneDpr?: number },
  ) {
    const device =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    this.screenDpr = Math.min(opts?.screenDpr ?? device, 3);
    this.sceneDpr = Math.min(opts?.sceneDpr ?? 1.5, this.screenDpr);
  }

  /** 是否启用 RT 路径（小游戏且屏 DPR > 场景 DPR） */
  get enabled() {
    return IS_MINIGAME && this.screenDpr > this.sceneDpr + 0.01;
  }

  getUiDpr() {
    return this.enabled ? this.screenDpr : Math.min(this.screenDpr, IS_MINIGAME ? 1.5 : 2);
  }

  applyScreenSize(cssW: number, cssH: number) {
    if (this.enabled) {
      this.renderer.setPixelRatio(this.screenDpr);
      this.renderer.setSize(cssW, cssH, false);
      const rw = Math.max(1, Math.floor(cssW * this.sceneDpr));
      const rh = Math.max(1, Math.floor(cssH * this.sceneDpr));
      if (!this.rt || this.rt.width !== rw || this.rt.height !== rh) {
        this.rt?.dispose();
        this.rt = new THREE.WebGLRenderTarget(rw, rh, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          generateMipmaps: false,
          colorSpace: THREE.SRGBColorSpace,
        });
        this.ensureBlit();
        if (this.blitMat) this.blitMat.map = this.rt.texture;
      }
    } else {
      this.renderer.setPixelRatio(this.sceneDpr);
      this.renderer.setSize(cssW, cssH, false);
    }
  }

  private ensureBlit() {
    if (this.blitScene) return;
    this.blitMat = new THREE.MeshBasicMaterial({
      map: null,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blitMat);
    this.blitScene = new THREE.Scene();
    this.blitScene.add(mesh);
    this.blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /** 渲染 3D 到 RT（或直出），再 blit 到屏 */
  present(renderScene: () => void) {
    if (!this.enabled || !this.rt) {
      renderScene();
      return;
    }
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.clear();
    renderScene();
    this.renderer.setRenderTarget(prev);
    this.ensureBlit();
    const prevAuto = this.renderer.autoClear;
    this.renderer.autoClear = true;
    this.renderer.render(this.blitScene!, this.blitCam!);
    this.renderer.autoClear = prevAuto;
  }

  dispose() {
    this.rt?.dispose();
    this.blitMat?.dispose();
    this.rt = null;
    this.blitScene = null;
    this.blitCam = null;
    this.blitMat = null;
  }
}
