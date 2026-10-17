/**
 * 浏览器端 wx API 仿真（加严版）：
 * - 先抠掉浏览器自带的 fetch / AudioContext / Blob / Worker，逼适配层自己补
 * - wx.request / 文件系统内部用保存的原生 fetch 读静态服务器
 */
(function installWxShim(global) {
  const canvas = document.getElementById("game");
  if (!canvas) throw new Error("#game canvas missing");

  // —— 保存原生能力，再剥离全局，模拟真机缺口 ——
  const nativeFetch = global.fetch.bind(global);
  const NativeAudioContext = global.AudioContext || global.webkitAudioContext;
  const NativeBlob = global.Blob;
  const NativeWorker = global.Worker;
  const NativeURL = global.URL;

  function strip(name) {
    // 可被适配层再次赋值；初始为 undefined，模拟真机缺失
    let value;
    try {
      delete global[name];
    } catch {
      /* ignore */
    }
    try {
      Object.defineProperty(global, name, {
        configurable: true,
        enumerable: true,
        get() {
          return value;
        },
        set(v) {
          value = v;
        },
      });
    } catch {
      try {
        global[name] = undefined;
      } catch {
        /* ignore */
      }
    }
  }

  strip("fetch");
  strip("AudioContext");
  strip("webkitAudioContext");
  strip("Blob");
  strip("Worker");

  let mainCanvasGiven = false;
  const touchHandlers = { start: [], move: [], end: [], cancel: [] };
  const showListeners = [];
  const hideListeners = [];

  function bindDomTouch() {
    const fire = (kind, ev) => {
      const list = touchHandlers[kind];
      if (!list.length) return;
      const rect = canvas.getBoundingClientRect();
      const toTouch = (t) => ({
        identifier: t.identifier,
        clientX: t.clientX,
        clientY: t.clientY,
        pageX: t.pageX,
        pageY: t.pageY,
        x: t.clientX - rect.left,
        y: t.clientY - rect.top,
      });
      const touches = Array.from(ev.touches || []).map(toTouch);
      const changedTouches = Array.from(ev.changedTouches || [ev]).map((t) =>
        t.clientX !== undefined
          ? toTouch(t)
          : toTouch({
              identifier: 1,
              clientX: ev.clientX,
              clientY: ev.clientY,
              pageX: ev.pageX,
              pageY: ev.pageY,
            }),
      );
      const payload = { touches, changedTouches, timeStamp: ev.timeStamp };
      for (const fn of list) fn(payload);
    };

    let down = false;
    canvas.addEventListener("pointerdown", (ev) => {
      down = true;
      canvas.setPointerCapture(ev.pointerId);
      fire("start", {
        touches: [ev],
        changedTouches: [ev],
        timeStamp: ev.timeStamp,
        clientX: ev.clientX,
        clientY: ev.clientY,
        pageX: ev.pageX,
        pageY: ev.pageY,
      });
    });
    canvas.addEventListener("pointermove", (ev) => {
      if (!down) return;
      fire("move", {
        touches: [ev],
        changedTouches: [ev],
        timeStamp: ev.timeStamp,
        clientX: ev.clientX,
        clientY: ev.clientY,
        pageX: ev.pageX,
        pageY: ev.pageY,
      });
    });
    const up = (ev) => {
      if (!down) return;
      down = false;
      fire("end", {
        touches: [],
        changedTouches: [ev],
        timeStamp: ev.timeStamp,
        clientX: ev.clientX,
        clientY: ev.clientY,
        pageX: ev.pageX,
        pageY: ev.pageY,
      });
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", (ev) => {
      down = false;
      fire("cancel", {
        touches: [],
        changedTouches: [ev],
        timeStamp: ev.timeStamp,
        clientX: ev.clientX,
        clientY: ev.clientY,
        pageX: ev.pageX,
        pageY: ev.pageY,
      });
    });
  }

  function resolveLocalUrl(filePath) {
    let p = String(filePath || "");
    if (p.startsWith("/")) return p;
    return "/" + p.replace(/^\.\//, "");
  }

  const fs = {
    readFile({ filePath, encoding, success, fail }) {
      const url = resolveLocalUrl(filePath);
      nativeFetch(url)
        .then(async (r) => {
          if (!r.ok) throw new Error("readFile " + url + " " + r.status);
          const data =
            encoding === "utf8" || encoding === "utf-8" ? await r.text() : await r.arrayBuffer();
          success && success({ data });
        })
        .catch((e) => fail && fail(e));
    },
    readFileSync(filePath, encoding) {
      const url = resolveLocalUrl(filePath);
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, false);
      if (encoding !== "utf8" && encoding !== "utf-8") xhr.responseType = "arraybuffer";
      xhr.send(null);
      if (xhr.status !== 200 && xhr.status !== 0) throw new Error("readFileSync " + url);
      return encoding === "utf8" || encoding === "utf-8" ? xhr.responseText : xhr.response;
    },
    accessSync() {
      throw new Error("missing");
    },
    mkdirSync() {},
  };

  const wx = {
    createCanvas() {
      if (!mainCanvasGiven) {
        mainCanvasGiven = true;
        return canvas;
      }
      const real = global.__HARNESS_DOCUMENT__ || document;
      return real.createElement("canvas");
    },
    createImage() {
      const real = global.__HARNESS_DOCUMENT__ || document;
      return real.createElement("img");
    },
    createInnerAudioContext() {
      const audio = new Audio();
      const api = {
        src: "",
        autoplay: false,
        loop: false,
        volume: 1,
        startTime: 0,
        obeyMuteSwitch: true,
        play() {
          audio.src = api.src;
          audio.loop = api.loop;
          audio.volume = api.volume;
          return audio.play().catch(() => {});
        },
        pause() {
          audio.pause();
        },
        stop() {
          audio.pause();
          audio.currentTime = 0;
        },
        destroy() {
          audio.pause();
          audio.removeAttribute("src");
        },
        onCanplay(fn) {
          audio.addEventListener("canplay", fn);
        },
        onEnded(fn) {
          audio.addEventListener("ended", fn);
        },
        onError(fn) {
          audio.addEventListener("error", fn);
        },
        offCanplay() {},
        offEnded() {},
        offError() {},
      };
      return api;
    },
    createWebAudioContext() {
      if (!NativeAudioContext) throw new Error("no native AudioContext for harness shim");
      return new NativeAudioContext();
    },
    getSystemInfoSync() {
      return {
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        pixelRatio: window.devicePixelRatio || 2,
        platform: "devtools-harness",
        brand: "harness",
        model: "chromium",
        system: "Linux",
        language: "zh_CN",
      };
    },
    getFileSystemManager() {
      return fs;
    },
    loadSubpackage({ name, success }) {
      console.log("[wx-shim] loadSubpackage", name);
      Promise.resolve().then(() => success && success({}));
      return { onProgressUpdate() {} };
    },
    downloadFile({ url, filePath, success, fail }) {
      nativeFetch(url)
        .then((r) => r.arrayBuffer())
        .then(() => success && success({ statusCode: 200, tempFilePath: filePath || url }))
        .catch((e) => fail && fail(e));
    },
    request({ url, method = "GET", responseType, header, success, fail }) {
      nativeFetch(url, { method, headers: header })
        .then(async (r) => {
          const data =
            responseType === "arraybuffer" || responseType === "arrayBuffer"
              ? await r.arrayBuffer()
              : await r.text();
          success && success({ statusCode: r.status, data });
        })
        .catch((e) => fail && fail(e));
    },
    requestAnimationFrame: (cb) => {
      // 用 canvas 的 rAF，避免被我们剥离/覆盖的全局
      if (typeof canvas.requestAnimationFrame === "function") return canvas.requestAnimationFrame(cb);
      return setTimeout(() => cb(Date.now()), 1000 / 60);
    },
    cancelAnimationFrame: (id) => {
      if (typeof canvas.cancelAnimationFrame === "function") return canvas.cancelAnimationFrame(id);
      return clearTimeout(id);
    },
    onTouchStart(fn) {
      touchHandlers.start.push(fn);
    },
    onTouchMove(fn) {
      touchHandlers.move.push(fn);
    },
    onTouchEnd(fn) {
      touchHandlers.end.push(fn);
    },
    onTouchCancel(fn) {
      touchHandlers.cancel.push(fn);
    },
    onShow(fn) {
      showListeners.push(fn);
    },
    onHide(fn) {
      hideListeners.push(fn);
    },
    showLoading() {},
    hideLoading() {},
    showToast(o) {
      console.log("[wx.showToast]", o && o.title);
    },
    env: { USER_DATA_PATH: "/tmp/firewood_userdata" },
  };

  global.wx = wx;
  // 不暴露浏览器 WebAssembly 给业务误用 basis；真机应走 WXWebAssembly
  global.WXWebAssembly = global.WebAssembly;
  global.__HARNESS_DOCUMENT__ = document;
  global.__HARNESS_CANVAS__ = canvas;
  global.__HARNESS_XHR__ = XMLHttpRequest;
  global.__HARNESS_NATIVE__ = {
    fetch: nativeFetch,
    AudioContext: NativeAudioContext,
    Blob: NativeBlob,
    Worker: NativeWorker,
    URL: NativeURL,
  };
  // harness 专属：打开 __fw 调试钩子
  global.__FIREWOOD_ENABLE_DEBUG__ = true;

  bindDomTouch();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") showListeners.forEach((f) => f({}));
    else hideListeners.forEach((f) => f({}));
  });
})(window);
