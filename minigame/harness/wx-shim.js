/**
 * 浏览器端 wx API 仿真：让真正的 minigame/game.js 可以在 Chromium 里跑起来。
 * 不是微信开发者工具，真机差异见 README。
 */
(function installWxShim(global) {
  const canvas = document.getElementById("game");
  if (!canvas) throw new Error("#game canvas missing");

  // 给 adapter 用：若 wx.createCanvas 被调用，返回这块上屏 canvas
  let mainCanvasGiven = false;

  const touchHandlers = {
    start: [],
    move: [],
    end: [],
    cancel: [],
  };

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
        t.clientX !== undefined ? toTouch(t) : toTouch({
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

    // 鼠标仿真触摸（方便 puppeteer click）
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

  const showListeners = [];
  const hideListeners = [];

  const wx = {
    createCanvas() {
      if (!mainCanvasGiven) {
        mainCanvasGiven = true;
        return canvas;
      }
      // 必须用真实 DOM，避免走到适配层 document 造成递归
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
          return audio.play();
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
      return {
        readFileSync() {
          throw new Error("harness: use fetch/XHR for package files");
        },
        accessSync() {
          throw new Error("missing");
        },
        mkdirSync() {},
      };
    },
    loadSubpackage({ name, success, fail }) {
      console.log("[wx-shim] loadSubpackage", name);
      // 素材已由静态服务器挂在 /subpackages/assets
      Promise.resolve().then(() => success && success({}));
      return { onProgressUpdate() {} };
    },
    downloadFile({ url, filePath, success, fail }) {
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then(() => success && success({ statusCode: 200, tempFilePath: filePath || url }))
        .catch((e) => fail && fail(e));
    },
    request({ url, method = "GET", responseType, success, fail }) {
      fetch(url, { method })
        .then(async (r) => {
          const data = responseType === "arraybuffer" ? await r.arrayBuffer() : await r.text();
          success && success({ statusCode: r.status, data });
        })
        .catch((e) => fail && fail(e));
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
    env: { USER_DATA_PATH: "/tmp/firewood_userdata" },
  };

  // 真机进度条 API 的空实现（harness 走 Canvas HUD）
  wx.showLoading = function () {};
  wx.hideLoading = function () {};
  wx.showToast = function (o) {
    console.log("[wx.showToast]", o && o.title);
  };

  global.wx = wx;
  global.WXWebAssembly = global.WebAssembly;
  global.__HARNESS_DOCUMENT__ = document;
  global.__HARNESS_CANVAS__ = canvas;
  global.__HARNESS_XHR__ = XMLHttpRequest;

  bindDomTouch();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") showListeners.forEach((f) => f({}));
    else hideListeners.forEach((f) => f({}));
  });
})(window);
