/**
 * 微信小游戏 BOM/DOM 适配层（自研，不依赖 Cocos）。
 * harness 与真机共用同一套 polyfill（fetch / AudioContext / rAF），
 * 仅在 DOM 上：harness 保留真实 document，真机用模拟 document。
 */
const { createWindow } = require("./window");
const { createDocument } = require("./document");
const { createXMLHttpRequest } = require("./xhr");
const { installTouchBridge } = require("./touch");
const { createFetch } = require("./fetch");
const { createRafPair } = require("./raf");
const {
  installAudioContext,
  createInnerAudio,
  releaseInner,
  installAudioLifecycle,
} = require("./audio");
const { installBlobPolyfill } = require("./blob");
const { installTextCodecs } = require("./text");

function injectGlobals(map) {
  for (const [k, v] of Object.entries(map)) {
    if (v === undefined) continue;
    try {
      globalThis[k] = v;
    } catch {
      try {
        Object.defineProperty(globalThis, k, {
          configurable: true,
          writable: true,
          value: v,
        });
      } catch {
        /* ignore readonly */
      }
    }
  }
}

function installCommonPolyfills(canvas) {
  installTextCodecs();

  const { requestAnimationFrame: raf, cancelAnimationFrame: caf } = createRafPair(canvas);
  const fetchFn = createFetch();
  const AudioCtor = installAudioContext();
  const XHR = createXMLHttpRequest();

  // Worker 保持缺失（KTX2 已去掉）。Blob 用文件路径 polyfill（无 btoa）。
  try {
    delete globalThis.Worker;
  } catch {
    /* ignore */
  }
  injectGlobals({ Worker: undefined });
  installBlobPolyfill();

  injectGlobals({
    canvas,
    fetch: fetchFn,
    XMLHttpRequest: XHR,
    requestAnimationFrame: raf,
    cancelAnimationFrame: caf,
    AudioContext: AudioCtor || undefined,
    webkitAudioContext: AudioCtor || undefined,
  });

  globalThis.__wxCreateInnerAudio = createInnerAudio;
  globalThis.__wxReleaseInnerAudio = releaseInner;
  installAudioLifecycle(() => {
    const get = globalThis.__FIREWOOD_AUDIO_MANAGERS__;
    return typeof get === "function" ? get() : [];
  });

  globalThis.__FIREWOOD_ADAPTER_INSTALLED__ = true;
  globalThis.__FIREWOOD_RUNTIME__ = "minigame";
}

function installHarnessSoft(canvas) {
  const info = wx.getSystemInfoSync();
  const dpr = Math.min(info.pixelRatio || 2, 2);
  canvas.width = Math.floor((info.windowWidth || 375) * dpr);
  canvas.height = Math.floor((info.windowHeight || 812) * dpr);

  installCommonPolyfills(canvas);

  // 覆盖 UA，走移动端性能档
  try {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      get: () => "WeChat MiniGame",
    });
  } catch {
    /* ignore */
  }

  // harness 也走 wx 触摸 → pointer，禁止依赖浏览器原生点击旁路
  const winProxy = {
    dispatchEvent(event) {
      try {
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
          let pe = event;
          if (typeof PointerEvent === "function" && event && event.type) {
            try {
              pe = new PointerEvent(event.type, {
                bubbles: true,
                cancelable: true,
                clientX: event.clientX,
                clientY: event.clientY,
                pageX: event.pageX,
                pageY: event.pageY,
                pointerId: event.pointerId || 1,
                pointerType: "touch",
                buttons: event.buttons,
                button: event.button || 0,
              });
            } catch {
              pe = event;
            }
          }
          window.dispatchEvent(pe);
        }
      } catch {
        /* ignore */
      }
    },
  };
  installTouchBridge(canvas, winProxy);

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

  installCommonPolyfills(canvas);

  const AudioCtor = globalThis.AudioContext;
  injectGlobals({
    window: win,
    document: doc,
    HTMLElement: win.HTMLElement,
    HTMLCanvasElement: win.HTMLCanvasElement || function HTMLCanvasElement() {},
    Image: win.Image || (typeof Image !== "undefined" ? Image : undefined),
    devicePixelRatio: win.devicePixelRatio,
    innerWidth: win.innerWidth,
    innerHeight: win.innerHeight,
    navigator: win.navigator,
    performance: win.performance,
    matchMedia: win.matchMedia.bind(win),
    AudioContext: AudioCtor,
    webkitAudioContext: AudioCtor,
  });

  // window 上也挂同一套闭包 rAF / fetch，避免读到错误实现
  win.requestAnimationFrame = globalThis.requestAnimationFrame;
  win.cancelAnimationFrame = globalThis.cancelAnimationFrame;
  win.fetch = globalThis.fetch;
  win.AudioContext = AudioCtor;
  win.XMLHttpRequest = globalThis.XMLHttpRequest;

  try {
    globalThis.self = globalThis;
  } catch {
    /* ignore */
  }

  installTouchBridge(canvas, win);
  return canvas;
}

function installAdapter() {
  if (globalThis.__FIREWOOD_ADAPTER_INSTALLED__) return globalThis.canvas;

  if (typeof wx === "undefined") {
    throw new Error("adapter: wx is undefined");
  }

  if (globalThis.__HARNESS_CANVAS__) {
    return installHarnessSoft(globalThis.__HARNESS_CANVAS__);
  }

  return installWechatFull();
}

module.exports = { installAdapter };
