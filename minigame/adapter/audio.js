/**
 * 音频适配：
 * - AudioContext ← wx.createWebAudioContext（无则保持空，由业务 try/catch）
 * - InnerAudio 工厂给 BGM 用
 */

function installAudioContext() {
  const g = globalThis;
  if (typeof g.AudioContext === "function" || typeof g.webkitAudioContext === "function") {
    return g.AudioContext || g.webkitAudioContext;
  }
  if (typeof wx !== "undefined" && typeof wx.createWebAudioContext === "function") {
    // 微信返回的是已创建的 context 实例，不是构造函数。
    // three.js `new AudioContext()` 需要构造器；构造函数若返回对象则用该对象。
    const Ctor = function WebAudioContext() {
      return wx.createWebAudioContext();
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

function createInnerAudio() {
  if (typeof wx !== "undefined" && typeof wx.createInnerAudioContext === "function") {
    return wx.createInnerAudioContext();
  }
  return null;
}

module.exports = { installAudioContext, createInnerAudio };
