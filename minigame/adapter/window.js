const { ListenerList } = require("./event-target");
const { createRafPair } = require("./raf");

function createWindow(canvas) {
  const listeners = new ListenerList();
  const { requestAnimationFrame: raf, cancelAnimationFrame: caf } = createRafPair(canvas);

  const info =
    typeof wx !== "undefined" && wx.getSystemInfoSync
      ? wx.getSystemInfoSync()
      : { windowWidth: 375, windowHeight: 812, pixelRatio: 2 };

  const win = {
    innerWidth: info.windowWidth || info.screenWidth || 375,
    innerHeight: info.windowHeight || info.screenHeight || 812,
    devicePixelRatio: info.pixelRatio || 2,
    screen: {
      width: info.screenWidth || info.windowWidth || 375,
      height: info.screenHeight || info.windowHeight || 812,
      availWidth: info.windowWidth || 375,
      availHeight: info.windowHeight || 812,
    },
    navigator: {
      userAgent: "WeChat MiniGame",
      platform: info.platform || "devtools",
      language: "zh-CN",
      maxTouchPoints: 5,
    },
    location: { href: "game://minigame", protocol: "game:", search: "", hash: "" },
    performance: typeof performance !== "undefined" ? performance : { now: () => Date.now() },
    Date,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    // 闭包持有原生实现，禁止再读全局（避免注入后递归）
    requestAnimationFrame: raf,
    cancelAnimationFrame: caf,
    addEventListener: (type, fn) => listeners.on(type, fn),
    removeEventListener: (type, fn) => listeners.off(type, fn),
    dispatchEvent: (event) => listeners.emit(event.type, event),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    matchMedia: (query) => ({
      matches: String(query).includes("pointer: coarse"),
      media: query,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
    }),
    ontouchstart: null,
    ontouchmove: null,
    ontouchend: null,
    HTMLElement: function HTMLElement() {},
    HTMLCanvasElement: canvas.constructor,
    Image: typeof Image !== "undefined" ? Image : undefined,
    WebGLRenderingContext: typeof WebGLRenderingContext !== "undefined" ? WebGLRenderingContext : undefined,
    WebGL2RenderingContext:
      typeof WebGL2RenderingContext !== "undefined" ? WebGL2RenderingContext : undefined,
    console,
  };

  if (typeof wx !== "undefined") {
    if (wx.onShow) {
      wx.onShow(() => {
        win.document.visibilityState = "visible";
        win.document.hidden = false;
        listeners.emit("focus", { type: "focus" });
        win.document.__emit("visibilitychange", { type: "visibilitychange" });
      });
    }
    if (wx.onHide) {
      wx.onHide(() => {
        win.document.visibilityState = "hidden";
        win.document.hidden = true;
        listeners.emit("blur", { type: "blur" });
        win.document.__emit("visibilitychange", { type: "visibilitychange" });
      });
    }
  }

  return win;
}

module.exports = { createWindow };
