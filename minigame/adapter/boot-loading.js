/**
 * 分包下载阶段的 canvas 自绘 loading。
 * 禁止使用 wx.showLoading / showToast / showModal。
 *
 * 重要：绝不能在主游戏 canvas 上 getContext('2d')，
 * 否则同一 canvas 无法再创建 WebGL，启动会卡死。
 * - harness：挂独立 DOM 覆盖层
 * - 真机：无 DOM 时仅记进度，资源加载 HUD 由游戏内 WebGL 叠加层负责
 */

let visible = false;
let progress = 0;
let status = "正在加载";
let raf = 0;
let overlay = null;
let ctx = null;

function ensureOverlay() {
  if (overlay) return true;
  const doc = globalThis.__HARNESS_DOCUMENT__ || (typeof document !== "undefined" ? document : null);
  if (!doc || !doc.body) return false;

  overlay = doc.createElement("canvas");
  overlay.id = "fw-boot-loading";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "2000",
  });
  ctx = overlay.getContext("2d");
  if (!ctx) return false;
  doc.body.appendChild(overlay);
  return true;
}

function syncSize() {
  if (!overlay || !ctx) return;
  const w = (typeof window !== "undefined" && window.innerWidth) || 375;
  const h = (typeof window !== "undefined" && window.innerHeight) || 812;
  const dpr = Math.min((typeof window !== "undefined" && window.devicePixelRatio) || 2, 2);
  overlay.width = Math.floor(w * dpr);
  overlay.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}

function paint() {
  if (!visible || !ensureOverlay()) return;
  const size = syncSize();
  if (!size || !ctx) return;
  const { w, h } = size;
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);

  ctx.fillStyle = "#1a1207";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#e8d5b0";
  ctx.textAlign = "center";
  ctx.font = "600 22px Georgia, Songti SC, serif";
  ctx.fillText(status, w / 2, h / 2 - 36);
  ctx.font = "600 18px ui-monospace, monospace";
  ctx.fillText(`${pct}%`, w / 2, h / 2 - 6);
  const barW = Math.min(240, w * 0.62);
  const barX = (w - barW) / 2;
  const barY = h / 2 + 28;
  ctx.fillStyle = "rgba(232,213,176,0.15)";
  ctx.fillRect(barX, barY, barW, 6);
  ctx.fillStyle = "#e8d5b0";
  ctx.fillRect(barX, barY, barW * (pct / 100), 6);
}

function loop() {
  if (!visible) return;
  paint();
  const rafFn =
    (typeof requestAnimationFrame === "function" && requestAnimationFrame) ||
    ((cb) => setTimeout(() => cb(Date.now()), 16));
  raf = rafFn(loop);
}

function showBootLoading(text) {
  visible = true;
  status = text || "正在加载";
  progress = 0;
  if (ensureOverlay()) loop();
  else console.log("[boot-loading]", status, "0%");
}

function setBootProgress(p, text) {
  progress = Math.max(0, Math.min(1, Number(p) || 0));
  if (text) status = text;
  if (!visible) showBootLoading(status);
  if (overlay) paint();
  else console.log("[boot-loading]", status, Math.round(progress * 100) + "%");
}

function hideBootLoading() {
  visible = false;
  if (raf) {
    try {
      cancelAnimationFrame(raf);
    } catch {
      clearTimeout(raf);
    }
  }
  raf = 0;
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  overlay = null;
  ctx = null;
}

module.exports = { showBootLoading, setBootProgress, hideBootLoading };
