/**
 * 保存原生 rAF/cAF，再导出包装函数。
 * 绝不能在包装里再次查找全局 requestAnimationFrame，否则注入回 global 后会无限递归。
 */

function resolveNativeRaf(canvas) {
  if (canvas && typeof canvas.requestAnimationFrame === "function") {
    return canvas.requestAnimationFrame.bind(canvas);
  }
  if (typeof wx !== "undefined" && typeof wx.requestAnimationFrame === "function") {
    return wx.requestAnimationFrame.bind(wx);
  }
  // 捕获「当前」全局实现（注入前），闭包持有
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame.bind(globalThis);
  }
  return (cb) => setTimeout(() => cb(Date.now()), 1000 / 60);
}

function resolveNativeCaf(canvas) {
  if (canvas && typeof canvas.cancelAnimationFrame === "function") {
    return canvas.cancelAnimationFrame.bind(canvas);
  }
  if (typeof wx !== "undefined" && typeof wx.cancelAnimationFrame === "function") {
    return wx.cancelAnimationFrame.bind(wx);
  }
  if (typeof cancelAnimationFrame === "function") {
    return cancelAnimationFrame.bind(globalThis);
  }
  return (id) => clearTimeout(id);
}

function createRafPair(canvas) {
  const nativeRaf = resolveNativeRaf(canvas);
  const nativeCaf = resolveNativeCaf(canvas);
  return {
    requestAnimationFrame: (cb) => nativeRaf(cb),
    cancelAnimationFrame: (id) => nativeCaf(id),
  };
}

module.exports = { createRafPair };
