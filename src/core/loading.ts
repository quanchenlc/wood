/** 加载进度条。每加载完一项调一次 step()。 */
export class LoadingProgress {
  private loaded = 0;
  private readonly countEl = document.getElementById("loading-count");
  private readonly barEl = document.getElementById("loading-bar");

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
  }

  finish() {
    const overlay = document.getElementById("loading");
    if (!overlay) return;
    overlay.classList.add("hidden");
    setTimeout(() => overlay.remove(), 600);
  }
}

export type ProgressFn = () => void;
