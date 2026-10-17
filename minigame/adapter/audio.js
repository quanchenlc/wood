/**
 * 音频适配：
 * - AudioContext ← wx.createWebAudioContext，并兼容 callback 版 decodeAudioData
 * - InnerAudio 固定大小对象池；onEnded/onError 只在新建时挂一次，回收再取不重复挂
 */

const INNER_POOL_SIZE = 8;
const pool = [];
const inUse = new Set();

function patchDecodeAudioData(ctx) {
  if (!ctx || typeof ctx.decodeAudioData !== "function") return ctx;
  const native = ctx.decodeAudioData.bind(ctx);
  ctx.decodeAudioData = function decodeAudioData(arrayBuffer, success, error) {
    // 已是 Promise 风格且无回调
    if (success == null && error == null) {
      try {
        const ret = native(arrayBuffer);
        if (ret && typeof ret.then === "function") return ret;
        // 某些基础库无回调也不返回 Promise —— 包一层
        return new Promise((resolve, reject) => {
          try {
            native(arrayBuffer, resolve, reject);
          } catch (e) {
            reject(e);
          }
        });
      } catch (e) {
        return Promise.reject(e);
      }
    }
    // 回调风格
    try {
      const ret = native(arrayBuffer, success, error);
      if (ret && typeof ret.then === "function") {
        ret.then(success, error);
      }
      return ret;
    } catch (e) {
      if (typeof error === "function") error(e);
      return undefined;
    }
  };
  return ctx;
}

function installAudioContext() {
  const g = globalThis;
  if (typeof g.AudioContext === "function" || typeof g.webkitAudioContext === "function") {
    const Existing = g.AudioContext || g.webkitAudioContext;
    const Wrapped = function AudioContext(...args) {
      const ctx = new Existing(...args);
      return patchDecodeAudioData(ctx);
    };
    Wrapped.prototype = Existing.prototype;
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
      const ctx = wx.createWebAudioContext();
      return patchDecodeAudioData(ctx);
    };
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
  // 仅新建时挂生命周期；池回收实例已挂过
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
};
