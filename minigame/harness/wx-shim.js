/**
 * 浏览器端 wx API 仿真（加严版）：
 * - 先抠掉浏览器自带的 fetch / AudioContext / Blob / Worker / btoa / atob / createObjectURL
 * - 逼适配层自己补；Blob 必须走 USER_DATA_PATH 临时文件
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
  const NativeBtoa = global.btoa;
  const NativeAtob = global.atob;

  const userDataRoot = "/tmp/firewood_userdata";
  const memFs = new Map(); // path -> Uint8Array | string marker for dirs

  function strip(name) {
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
  strip("btoa");
  strip("atob");

  // 保留 URL 构造，但禁用原生 createObjectURL / revokeObjectURL
  try {
    const proto = NativeURL && NativeURL.prototype;
    if (proto) {
      // no-op placeholder until adapter overwrites
    }
    Object.defineProperty(global, "URL", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: class HarnessURL extends NativeURL {
        static createObjectURL() {
          throw new Error(
            "harness: URL.createObjectURL stripped — adapter must use USER_DATA_PATH files",
          );
        }
        static revokeObjectURL() {}
      },
    });
    // 静态方法在某些引擎不继承，再挂一层
    global.URL.createObjectURL = function createObjectURL() {
      throw new Error(
        "harness: URL.createObjectURL stripped — adapter must use USER_DATA_PATH files",
      );
    };
    global.URL.revokeObjectURL = function revokeObjectURL() {};
  } catch (e) {
    console.warn("[wx-shim] failed to strip createObjectURL", e);
  }

  let mainCanvasGiven = false;
  const touchHandlers = { start: [], move: [], end: [], cancel: [] };
  const showListeners = [];
  const hideListeners = [];

  function fireTouch(kind, payload) {
    const list = touchHandlers[kind];
    for (const fn of list) fn(payload);
  }

  /** 录屏 / 测试专用：只走 wx 触摸通道 */
  function simulateTouch(kind, x, y, identifier = 1) {
    const touch = {
      identifier,
      clientX: x,
      clientY: y,
      pageX: x,
      pageY: y,
      x,
      y,
    };
    if (kind === "start") {
      fireTouch("start", {
        touches: [touch],
        changedTouches: [touch],
        timeStamp: Date.now(),
      });
    } else if (kind === "move") {
      fireTouch("move", {
        touches: [touch],
        changedTouches: [touch],
        timeStamp: Date.now(),
      });
    } else if (kind === "end" || kind === "cancel") {
      fireTouch(kind, {
        touches: [],
        changedTouches: [touch],
        timeStamp: Date.now(),
      });
    }
  }

  function resolveLocalUrl(filePath) {
    let p = String(filePath || "");
    // USER_DATA_PATH 内存文件不走 HTTP
    if (p.startsWith(userDataRoot)) return null;
    if (p.startsWith("/")) return p;
    return "/" + p.replace(/^\.\//, "");
  }

  function ensureMemDir(dir) {
    memFs.set(dir, "__dir__");
  }

  const fs = {
    readFile({ filePath, encoding, success, fail }) {
      if (memFs.has(filePath) && memFs.get(filePath) !== "__dir__") {
        const data = memFs.get(filePath);
        const out =
          encoding === "utf8" || encoding === "utf-8"
            ? new TextDecoder().decode(data)
            : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        success && success({ data: out });
        return;
      }
      const url = resolveLocalUrl(filePath);
      if (!url) {
        fail && fail(new Error("readFile missing " + filePath));
        return;
      }
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
      if (memFs.has(filePath) && memFs.get(filePath) !== "__dir__") {
        const data = memFs.get(filePath);
        return encoding === "utf8" || encoding === "utf-8"
          ? new TextDecoder().decode(data)
          : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      }
      const url = resolveLocalUrl(filePath);
      if (!url) throw new Error("readFileSync missing " + filePath);
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, false);
      if (encoding !== "utf8" && encoding !== "utf-8") xhr.responseType = "arraybuffer";
      xhr.send(null);
      if (xhr.status !== 200 && xhr.status !== 0) throw new Error("readFileSync " + url);
      return encoding === "utf8" || encoding === "utf-8" ? xhr.responseText : xhr.response;
    },
    writeFileSync(filePath, data) {
      let bytes;
      if (typeof data === "string") {
        bytes = new TextEncoder().encode(data);
      } else if (data instanceof ArrayBuffer) {
        bytes = new Uint8Array(data);
      } else if (ArrayBuffer.isView(data)) {
        bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      } else {
        bytes = new Uint8Array(0);
      }
      const dir = String(filePath).replace(/\/[^/]+$/, "");
      ensureMemDir(dir);
      memFs.set(filePath, bytes);
      // 同步写到真实 /tmp，方便 Image.src 用 HTTP 映射加载
      try {
        // 通过特殊 URL 暴露：harness server 会映射 USER_DATA_PATH
        global.__HARNESS_MEMFS__ = memFs;
      } catch {
        /* ignore */
      }
    },
    unlinkSync(filePath) {
      memFs.delete(filePath);
    },
    accessSync(filePath) {
      if (memFs.has(filePath)) return;
      // 包内路径：用 sync XHR 探测
      const url = resolveLocalUrl(filePath);
      if (!url) throw new Error("missing");
      const xhr = new XMLHttpRequest();
      xhr.open("HEAD", url, false);
      try {
        xhr.send(null);
      } catch {
        throw new Error("missing");
      }
      if (xhr.status !== 200 && xhr.status !== 0) throw new Error("missing");
    },
    mkdirSync(dir) {
      ensureMemDir(dir);
    },
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
      const img = real.createElement("img");
      // 拦截 USER_DATA_PATH：转成 harness 可 fetch 的 memfs URL
      const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
      Object.defineProperty(img, "src", {
        configurable: true,
        enumerable: true,
        get() {
          return this.__fwSrc || "";
        },
        set(v) {
          const s = String(v || "");
          this.__fwSrc = s;
          if (s.startsWith(userDataRoot) && memFs.has(s)) {
            const bytes = memFs.get(s);
            const blob = new NativeBlob([bytes]);
            const obj = NativeURL.createObjectURL(blob);
            if (desc && desc.set) desc.set.call(this, obj);
            else HTMLImageElement.prototype.setAttribute.call(this, "src", obj);
            return;
          }
          if (desc && desc.set) desc.set.call(this, s);
          else HTMLImageElement.prototype.setAttribute.call(this, "src", s);
        },
      });
      return img;
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
      // 模拟真机：decodeAudioData 只支持回调，不返回 Promise
      const ctx = new NativeAudioContext();
      const nativeDecode = ctx.decodeAudioData.bind(ctx);
      ctx.decodeAudioData = function decodeAudioData(arrayBuffer, success, error) {
        nativeDecode(arrayBuffer).then(
          (buf) => {
            if (typeof success === "function") success(buf);
          },
          (err) => {
            if (typeof error === "function") error(err);
          },
        );
        // 故意不返回 Promise，逼适配层兼容回调
        return undefined;
      };
      return ctx;
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
        .then((r) => {
          if (!r.ok) throw new Error("download " + r.status);
          return r.arrayBuffer();
        })
        .then((buf) => {
          if (filePath) fs.writeFileSync(filePath, buf);
          success && success({ statusCode: 200, tempFilePath: filePath || url });
        })
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
    showLoading(o) {
      const msg = "[forbidden] wx.showLoading " + ((o && o.title) || "");
      console.error(msg);
      (global.__HARNESS_FORBIDDEN_UI__ = global.__HARNESS_FORBIDDEN_UI__ || []).push(msg);
    },
    hideLoading() {
      const msg = "[forbidden] wx.hideLoading";
      console.error(msg);
      (global.__HARNESS_FORBIDDEN_UI__ = global.__HARNESS_FORBIDDEN_UI__ || []).push(msg);
    },
    showToast(o) {
      const msg = "[forbidden] wx.showToast " + ((o && o.title) || "");
      console.error(msg);
      (global.__HARNESS_FORBIDDEN_UI__ = global.__HARNESS_FORBIDDEN_UI__ || []).push(msg);
    },
    showModal(o) {
      const msg = "[forbidden] wx.showModal " + ((o && o.title) || "");
      console.error(msg);
      (global.__HARNESS_FORBIDDEN_UI__ = global.__HARNESS_FORBIDDEN_UI__ || []).push(msg);
    },
    env: { USER_DATA_PATH: userDataRoot },
    __simulateTouch: simulateTouch,
  };
  global.__HARNESS_FORBIDDEN_UI__ = [];

  global.wx = wx;
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
    btoa: NativeBtoa,
    atob: NativeAtob,
  };
  global.__FIREWOOD_ENABLE_DEBUG__ = true;
  global.__HARNESS_MEMFS__ = memFs;

  // 不再把 DOM pointer 自动转成 wx 触摸：录屏必须显式走 __simulateTouch
  // （避免 capture 误用 mouse.click 旁路）

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") showListeners.forEach((f) => f({}));
    else hideListeners.forEach((f) => f({}));
  });
})(window);
