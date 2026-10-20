/**
 * 音频适配：
 * - AudioContext ← wx.createWebAudioContext
 * - decodeAudioData 始终返回 Promise
 * - AudioParam ramp/setValue 防护（微信校验更严）
 * - InnerAudio 固定大小对象池
 */

const INNER_POOL_SIZE = 8;
const pool = [];
const inUse = new Set();

function patchDecodeAudioData(ctx) {
  if (!ctx || typeof ctx.decodeAudioData !== "function") return ctx;
  const native = ctx.decodeAudioData.bind(ctx);
  /**
   * three AudioLoader 会 decodeAudioData(buf, cb).catch(...)，
   * 微信回调版返回 undefined → .catch 抛 TypeError。
   * 统一始终返回 Promise；success/error 与 resolve/reject 各只触发一次。
   */
  ctx.decodeAudioData = function decodeAudioData(arrayBuffer, success, error) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ok = (buf) => {
        if (settled) return;
        settled = true;
        if (typeof success === "function") {
          try {
            success(buf);
          } catch {
            /* ignore user callback errors */
          }
        }
        resolve(buf);
      };
      const fail = (err) => {
        if (settled) return;
        settled = true;
        if (typeof error === "function") {
          try {
            error(err);
          } catch {
            /* ignore */
          }
        }
        reject(err);
      };
      try {
        const ret = native(arrayBuffer, ok, fail);
        if (ret && typeof ret.then === "function") {
          ret.then(ok, fail);
        }
      } catch (e) {
        fail(e);
      }
    });
  };
  return ctx;
}

/**
 * 包装 AudioParam：过滤 NaN/Infinity，endTime 钳到 >= currentTime，
 * 失败时退化为 param.value = target（three 音量淡入在微信上会炸）。
 */
function patchAudioParam(param, ctx) {
  if (!param || param.__fwAudioParamPatched) return param;
  param.__fwAudioParamPatched = true;

  const nowOf = () => {
    const t = ctx && typeof ctx.currentTime === "number" ? ctx.currentTime : 0;
    return Number.isFinite(t) && t >= 0 ? t : 0;
  };

  const sanitize = (value, endTime, { positive = false } = {}) => {
    let v = Number(value);
    if (!Number.isFinite(v)) v = positive ? 0.0001 : 0;
    if (positive && v <= 0) v = 0.0001;
    let t = Number(endTime);
    if (!Number.isFinite(t)) t = nowOf();
    const now = nowOf();
    if (t < now) t = now;
    return { v, t };
  };

  const fallbackSet = (v) => {
    try {
      param.value = v;
    } catch {
      /* ignore */
    }
  };

  const wrapBinary = (method, opts) => {
    const native = typeof param[method] === "function" ? param[method].bind(param) : null;
    if (!native) return;
    param[method] = function patched(value, endTime) {
      const { v, t } = sanitize(value, endTime, opts);
      try {
        return native(v, t);
      } catch {
        fallbackSet(v);
        return param;
      }
    };
  };

  wrapBinary("setValueAtTime");
  wrapBinary("linearRampToValueAtTime");
  wrapBinary("exponentialRampToValueAtTime", { positive: true });

  if (typeof param.setTargetAtTime === "function") {
    const native = param.setTargetAtTime.bind(param);
    param.setTargetAtTime = function (target, startTime, timeConstant) {
      let v = Number(target);
      if (!Number.isFinite(v)) v = 0;
      let t = Number(startTime);
      if (!Number.isFinite(t) || t < nowOf()) t = nowOf();
      let c = Number(timeConstant);
      if (!Number.isFinite(c) || c <= 0) c = 0.01;
      try {
        return native(v, t, c);
      } catch {
        fallbackSet(v);
        return param;
      }
    };
  }

  return param;
}

function patchNodeParams(node, ctx) {
  if (!node || node.__fwNodeParamsPatched) return node;
  node.__fwNodeParamsPatched = true;
  const keys = [
    "gain",
    "frequency",
    "detune",
    "Q",
    "delayTime",
    "pan",
    "offset",
    "positionX",
    "positionY",
    "positionZ",
    "orientationX",
    "orientationY",
    "orientationZ",
    // AudioListener / Panner 空间参数（three AudioListener.updateMatrixWorld）
    "forwardX",
    "forwardY",
    "forwardZ",
    "upX",
    "upY",
    "upZ",
  ];
  for (const k of keys) {
    try {
      if (node[k] && typeof node[k].setValueAtTime === "function") {
        patchAudioParam(node[k], ctx);
      }
    } catch {
      /* ignore */
    }
  }
  return node;
}

function patchAudioContextParams(ctx) {
  if (!ctx || ctx.__fwParamsPatched) return ctx;
  ctx.__fwParamsPatched = true;

  // 若存在原型则先包一层（覆盖后续新建的 param）
  try {
    const Proto =
      (typeof AudioParam !== "undefined" && AudioParam.prototype) ||
      (ctx.createGain && ctx.createGain().gain && Object.getPrototypeOf(ctx.createGain().gain));
    if (Proto && !Proto.__fwAudioParamProtoPatched) {
      Proto.__fwAudioParamProtoPatched = true;
      // 原型级包装拿不到 ctx.currentTime，用 param.context 或闭包 ctx
      for (const method of [
        "setValueAtTime",
        "linearRampToValueAtTime",
        "exponentialRampToValueAtTime",
      ]) {
        if (typeof Proto[method] !== "function") continue;
        const native = Proto[method];
        Proto[method] = function (value, endTime) {
          const c = this.context || ctx;
          const now = c && typeof c.currentTime === "number" ? c.currentTime : 0;
          let v = Number(value);
          if (!Number.isFinite(v)) v = method.indexOf("exponential") >= 0 ? 0.0001 : 0;
          if (method.indexOf("exponential") >= 0 && v <= 0) v = 0.0001;
          let t = Number(endTime);
          if (!Number.isFinite(t) || t < now) t = now;
          try {
            return native.call(this, v, t);
          } catch {
            try {
              this.value = v;
            } catch {
              /* ignore */
            }
            return this;
          }
        };
      }
    }
  } catch {
    /* ignore */
  }

  const wrapFactory = (name) => {
    if (typeof ctx[name] !== "function") return;
    const native = ctx[name].bind(ctx);
    ctx[name] = function (...args) {
      const node = native(...args);
      return patchNodeParams(node, ctx);
    };
  };

  [
    "createGain",
    "createOscillator",
    "createBiquadFilter",
    "createDelay",
    "createPanner",
    "createStereoPanner",
    "createConstantSource",
    "createBufferSource",
  ].forEach(wrapFactory);

  // destination 上也可能有相关 param（少见）
  try {
    patchNodeParams(ctx.destination, ctx);
  } catch {
    /* ignore */
  }

  // listener（Panner 空间）
  try {
    if (ctx.listener) patchNodeParams(ctx.listener, ctx);
  } catch {
    /* ignore */
  }

  return ctx;
}

function hardenAudioContext(ctx) {
  if (!ctx) return ctx;
  patchDecodeAudioData(ctx);
  patchAudioContextParams(ctx);
  return ctx;
}

function installAudioContext() {
  const g = globalThis;

  // 无论谁直接调 wx.createWebAudioContext，都 harden 一次（防漏）
  if (typeof wx !== "undefined" && typeof wx.createWebAudioContext === "function" && !wx.__fwAudioHardened) {
    const rawCreate = wx.createWebAudioContext.bind(wx);
    wx.createWebAudioContext = function createWebAudioContextPatched() {
      return hardenAudioContext(rawCreate());
    };
    wx.__fwAudioHardened = true;
  }

  if (typeof g.AudioContext === "function" || typeof g.webkitAudioContext === "function") {
    const Existing = g.AudioContext || g.webkitAudioContext;
    if (Existing.__fwHardenedCtor) return Existing;
    const Wrapped = function AudioContext(...args) {
      const ctx = new Existing(...args);
      return hardenAudioContext(ctx);
    };
    Wrapped.prototype = Existing.prototype;
    Wrapped.__fwHardenedCtor = true;
    try {
      g.AudioContext = Wrapped;
      g.webkitAudioContext = Wrapped;
    } catch {
      /* ignore */
    }
    return Wrapped;
  }
  if (typeof wx !== "undefined" && typeof wx.createWebAudioContext === "function") {
    const Ctor = function WebAudioContext() {
      return wx.createWebAudioContext();
    };
    Ctor.__fwHardenedCtor = true;
    try {
      g.AudioContext = Ctor;
      g.webkitAudioContext = Ctor;
    } catch {
      /* ignore */
    }
    return Ctor;
  }
  return null;
}

function rawCreateInner() {
  if (typeof wx !== "undefined" && typeof wx.createInnerAudioContext === "function") {
    return wx.createInnerAudioContext();
  }
  return null;
}

function releaseInner(inner) {
  if (!inner || inner.__fwReleased) return;
  inner.__fwReleased = true;
  inUse.delete(inner);
  try {
    // 只 stop，不要清空 src：部分机型清空 src 会异步 onError，
    // 若实例已被下一音效借走会被误 release，导致播放中断。
    inner.stop();
  } catch {
    /* ignore */
  }
  if (pool.length < INNER_POOL_SIZE && !pool.includes(inner)) {
    pool.push(inner);
  } else if (!pool.includes(inner)) {
    try {
      inner.destroy();
    } catch {
      /* ignore */
    }
  }
}

/** 新建实例时挂一次归还钩子；从池取出不再重复 onEnded/onError */
function attachPoolLifecycleOnce(inner) {
  if (!inner || inner.__fwPoolHooked) return;
  inner.__fwPoolHooked = true;

  const onDone = () => releaseInner(inner);
  if (typeof inner.onEnded === "function") inner.onEnded(onDone);
  if (typeof inner.onError === "function") inner.onError(onDone);

  const originalDestroy = inner.destroy?.bind(inner);
  inner.destroy = () => {
    inUse.delete(inner);
    const idx = pool.indexOf(inner);
    if (idx >= 0) pool.splice(idx, 1);
    if (originalDestroy) originalDestroy();
  };
}

function createInnerAudio() {
  const fromPool = pool.length > 0;
  const inner = fromPool ? pool.pop() : rawCreateInner();
  if (!inner) return null;
  inner.__fwReleased = false;
  inUse.add(inner);
  if (!fromPool) attachPoolLifecycleOnce(inner);
  return inner;
}

function installAudioLifecycle(getManagers) {
  if (typeof wx === "undefined") return;
  if (wx.onHide) {
    wx.onHide(() => {
      const list = getManagers?.() || [];
      for (const m of list) {
        try {
          m.suspend?.();
        } catch {
          /* ignore */
        }
      }
    });
  }
  if (wx.onShow) {
    wx.onShow(() => {
      const list = getManagers?.() || [];
      for (const m of list) {
        try {
          m.resumeFromBackground?.();
        } catch {
          /* ignore */
        }
      }
    });
  }
}

module.exports = {
  installAudioContext,
  createInnerAudio,
  releaseInner,
  installAudioLifecycle,
  patchDecodeAudioData,
  patchAudioContextParams,
  hardenAudioContext,
};
