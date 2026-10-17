/**
 * 最小 Blob + URL.createObjectURL polyfill。
 * three GLTFLoader 解嵌图会 `new Blob` + createObjectURL；
 * 不实现 Worker 用的完整 Blob，只够贴图 / 音频 arrayBuffer。
 */

function installBlobPolyfill() {
  // harness：直接恢复浏览器原生 Blob/URL，避免 dataURL 被 LoadingManager 拼成相对路径
  const native = globalThis.__HARNESS_NATIVE__;
  if (native && native.Blob && native.URL) {
    try {
      globalThis.Blob = native.Blob;
      globalThis.URL = native.URL;
    } catch {
      /* ignore */
    }
    return;
  }

  if (typeof Blob === "function" && typeof URL !== "undefined" && URL.createObjectURL) {
    return;
  }

  class MiniBlob {
    constructor(parts = [], options = {}) {
      const chunks = (parts || []).map((p) => {
        if (typeof p === "string") return new TextEncoder().encode(p);
        if (p instanceof ArrayBuffer) return new Uint8Array(p);
        if (ArrayBuffer.isView(p)) return new Uint8Array(p.buffer, p.byteOffset, p.byteLength);
        if (p && p._data) return p._data;
        return new Uint8Array(0);
      });
      let len = 0;
      for (const c of chunks) len += c.length;
      const data = new Uint8Array(len);
      let o = 0;
      for (const c of chunks) {
        data.set(c, o);
        o += c.length;
      }
      this._data = data;
      this.size = len;
      this.type = (options && options.type) || "";
    }

    arrayBuffer() {
      return Promise.resolve(this._data.buffer.slice(this._data.byteOffset, this._data.byteOffset + this._data.byteLength));
    }

    text() {
      return Promise.resolve(new TextDecoder().decode(this._data));
    }

    slice(start = 0, end = this.size, type = this.type) {
      return new MiniBlob([this._data.subarray(start, end)], { type });
    }
  }

  try {
    globalThis.Blob = MiniBlob;
  } catch {
    /* ignore */
  }

  const gURL = globalThis.URL || function URL() {};
  const prevCreate = typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL.bind(URL) : null;
  const prevRevoke = typeof URL !== "undefined" && URL.revokeObjectURL ? URL.revokeObjectURL.bind(URL) : null;

  gURL.createObjectURL = function createObjectURL(obj) {
    if (obj && obj._data instanceof Uint8Array) {
      const mime = obj.type || "application/octet-stream";
      // 大贴图用 data URL；真机 Image 可吃 data: / 本地临时文件
      let binary = "";
      const data = obj._data;
      const chunk = 0x8000;
      for (let i = 0; i < data.length; i += chunk) {
        binary += String.fromCharCode.apply(null, data.subarray(i, i + chunk));
      }
      return `data:${mime};base64,${btoa(binary)}`;
    }
    if (prevCreate) return prevCreate(obj);
    throw new Error("URL.createObjectURL: unsupported object");
  };

  gURL.revokeObjectURL = function revokeObjectURL(url) {
    if (prevRevoke && url && !String(url).startsWith("data:")) prevRevoke(url);
  };

  try {
    globalThis.URL = gURL;
  } catch {
    /* ignore */
  }
}

module.exports = { installBlobPolyfill };
