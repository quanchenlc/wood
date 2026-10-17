/**
 * 微信小游戏 BOM/DOM 适配层（自研，不依赖 Cocos）。
 * - 真机：用 wx.* 模拟 window/document/XHR/touch
 * - harness：保留真实浏览器 window/document，只注入 canvas / runtime 标记
 */
const { createWindow } = require("./window");
const { createDocument } = require("./document");
const { createXMLHttpRequest } = require("./xhr");
const { installTouchBridge } = require("./touch");

function installHarnessSoft(canvas) {
  const info = wx.getSystemInfoSync();
  const dpr = Math.min(info.pixelRatio || 2, 2);
  canvas.width = Math.floor((info.windowWidth || 375) * dpr);
  canvas.height = Math.floor((info.windowHeight || 812) * dpr);

  globalThis.canvas = canvas;
  globalThis.__FIREWOOD_RUNTIME__ = "minigame";
  globalThis.__FIREWOOD_ADAPTER_INSTALLED__ = true;
  globalThis.__wxCreateInnerAudio = () =>
    wx.createInnerAudioContext ? wx.createInnerAudioContext() : null;

  if (typeof WXWebAssembly !== "undefined" && typeof WebAssembly === "undefined") {
    globalThis.WebAssembly = WXWebAssembly;
  }

  // 真机路径才需要把 touch→pointer；harness 上 canvas 已有原生 pointer
  return canvas;
}

function installWechatFull() {
  const canvas = wx.createCanvas();
  const info = wx.getSystemInfoSync();
  const dpr = Math.min(info.pixelRatio || 2, 2);
  canvas.width = Math.floor((info.windowWidth || 375) * dpr);
  canvas.height = Math.floor((info.windowHeight || 812) * dpr);

  const win = createWindow(canvas);
  const doc = createDocument(canvas);
  win.document = doc;
  win.canvas = canvas;

  if (typeof WXWebAssembly !== "undefined" && typeof WebAssembly === "undefined") {
    globalThis.WebAssembly = WXWebAssembly;
    win.WebAssembly = WXWebAssembly;
  }

  const XHR = createXMLHttpRequest();

  const inject = {
    canvas,
    // 注意：真机没有宿主 window；不要在浏览器 harness 里走到这里
    window: win,
    document: doc,
    XMLHttpRequest: XHR,
    HTMLElement: win.HTMLElement,
    HTMLCanvasElement: win.HTMLCanvasElement || function HTMLCanvasElement() {},
    Image: win.Image || (typeof Image !== "undefined" ? Image : undefined),
    AudioContext: win.AudioContext,
    webkitAudioContext: win.webkitAudioContext,
    devicePixelRatio: win.devicePixelRatio,
    innerWidth: win.innerWidth,
    innerHeight: win.innerHeight,
    navigator: win.navigator,
    performance: win.performance,
    requestAnimationFrame: win.requestAnimationFrame.bind(win),
    cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    matchMedia: win.matchMedia.bind(win),
    fetch: win.fetch,
    WebAssembly: win.WebAssembly || globalThis.WebAssembly,
    URL: win.URL,
    Blob: win.Blob,
    Worker: win.Worker,
  };

  for (const [k, v] of Object.entries(inject)) {
    if (v === undefined) continue;
    try {
      globalThis[k] = v;
    } catch {
      /* ignore readonly */
    }
  }

  try {
    globalThis.self = globalThis;
  } catch {
    /* ignore */
  }

  installTouchBridge(canvas, win);

  globalThis.__wxCreateInnerAudio = () =>
    wx.createInnerAudioContext ? wx.createInnerAudioContext() : null;
  globalThis.__FIREWOOD_ADAPTER_INSTALLED__ = true;
  globalThis.__FIREWOOD_RUNTIME__ = "minigame";
  return canvas;
}

function installAdapter() {
  if (globalThis.__FIREWOOD_ADAPTER_INSTALLED__) return globalThis.canvas;

  if (typeof wx === "undefined") {
    throw new Error("adapter: wx is undefined");
  }

  // harness 预先放好了真实 canvas，切勿替换浏览器 window/location
  if (globalThis.__HARNESS_CANVAS__) {
    return installHarnessSoft(globalThis.__HARNESS_CANVAS__);
  }

  return installWechatFull();
}

module.exports = { installAdapter };
