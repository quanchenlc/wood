import { ensureHud } from "../platform/hud";

/** 加载进度条。每加载完一项调一次 step()。Web 用 DOM，小游戏用 Canvas HUD。 */
export class LoadingProgress {
  private loaded = 0;
  private readonly countEl = typeof document !== "undefined" ? document.getElementById("loading-count") : null;
  private readonly barEl = typeof document !== "undefined" ? document.getElementById("loading-bar") : null;
  private readonly hud = ensureHud();

  constructor(private readonly total: number) {
    this.render();
  }

  readonly step = () => {
    this.loaded = Math.min(this.loaded + 1, this.total);
    this.render();
  };

  private render() {
    if (this.countEl) this.countEl.textContent = `${this.loaded} / ${this.total}`;
    if (this.barEl) this.barEl.style.width = `${(this.loaded / this.total) * 100}%`;
    this.hud?.setProgress(this.loaded, this.total);
  }

  finish() {
    this.hud?.hideLoading();
    const overlay = typeof document !== "undefined" ? document.getElementById("loading") : null;
    if (!overlay) return;
    overlay.classList.add("hidden");
    setTimeout(() => overlay.remove(), 600);
  }
}

export type ProgressFn = () => void;
