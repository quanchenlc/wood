const { ListenerList } = require("./event-target");

function createWindow(canvas) {
  const listeners = new ListenerList();
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
    requestAnimationFrame: (cb) =>
      (typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (fn) => setTimeout(() => fn(Date.now()), 1000 / 60))(cb),
    cancelAnimationFrame: (id) =>
      (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : clearTimeout)(id),
    addEventListener: (type, fn) => listeners.on(type, fn),
    removeEventListener: (type, fn) => listeners.off(type, fn),
    dispatchEvent: (event) => listeners.emit(event.type, event),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    matchMedia: (query) => ({
      matches: String(query).includes("pointer: coarse") ? true : false,
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
    AudioContext:
      typeof AudioContext !== "undefined"
        ? AudioContext
        : typeof webkitAudioContext !== "undefined"
          ? webkitAudioContext
          : undefined,
    webkitAudioContext: typeof webkitAudioContext !== "undefined" ? webkitAudioContext : undefined,
    WebGLRenderingContext: typeof WebGLRenderingContext !== "undefined" ? WebGLRenderingContext : undefined,
    WebGL2RenderingContext:
      typeof WebGL2RenderingContext !== "undefined" ? WebGL2RenderingContext : undefined,
    URL: typeof URL !== "undefined" ? URL : { createObjectURL: () => "", revokeObjectURL() {} },
    Blob: typeof Blob !== "undefined" ? Blob : function Blob() {},
    Worker: typeof Worker !== "undefined" ? Worker : undefined,
    WebAssembly: typeof WebAssembly !== "undefined" ? WebAssembly : undefined,
    fetch: typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined,
    console,
  };

  // 可见性：切前后台
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
