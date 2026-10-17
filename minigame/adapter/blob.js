/**
 * Blob / createObjectURL：不走 btoa。
 * 真机把二进制写到 USER_DATA_PATH 临时文件，返回可给 Image 用的本地路径。
 * harness 同样写临时文件（经 wx 文件系统 shim），禁止依赖浏览器 Blob/btoa。
 */

let seq = 0;

function ensureDir(fs, dir) {
  try {
    fs.accessSync(dir);
  } catch {
    try {
      fs.mkdirSync(dir, true);
    } catch {
      try {
        fs.mkdirSync(dir);
      } catch {
        /* ignore */
      }
    }
  }
}

function writeTempFile(bytes, mime) {
  if (typeof wx === "undefined" || !wx.getFileSystemManager || !wx.env || !wx.env.USER_DATA_PATH) {
    throw new Error("blob polyfill: USER_DATA_PATH unavailable");
  }
  const fs = wx.getFileSystemManager();
  const dir = `${wx.env.USER_DATA_PATH}/fw_blob`;
  ensureDir(fs, dir);
  const ext = /png/i.test(mime) ? "png" : /jpeg|jpg/i.test(mime) ? "jpg" : "bin";
  const path = `${dir}/t${Date.now()}_${seq++}.${ext}`;
  const data = bytes.buffer
    ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    : bytes;
  fs.writeFileSync(path, data);
  return path;
}

function installBlobPolyfill() {
  class MiniBlob {
    constructor(parts = [], options = {}) {
      const chunks = (parts || []).map((p) => {
        if (typeof p === "string") {
          return new TextEncoder().encode(p);
        }
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
      return Promise.resolve(
        this._data.buffer.slice(this._data.byteOffset, this._data.byteOffset + this._data.byteLength),
      );
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
  const objectUrls = new Map();

  gURL.createObjectURL = function createObjectURL(obj) {
    if (obj && obj._data instanceof Uint8Array) {
      const path = writeTempFile(obj._data, obj.type || "application/octet-stream");
      objectUrls.set(path, true);
      return path;
    }
    throw new Error("URL.createObjectURL: only MiniBlob supported (no browser Blob/btoa)");
  };

  gURL.revokeObjectURL = function revokeObjectURL(url) {
    if (!objectUrls.has(url)) return;
    objectUrls.delete(url);
    try {
      wx.getFileSystemManager().unlinkSync(url);
    } catch {
      /* ignore */
    }
  };

  try {
    globalThis.URL = gURL;
  } catch {
    try {
      Object.defineProperty(globalThis, "URL", { configurable: true, writable: true, value: gURL });
    } catch {
      /* ignore */
    }
  }
}

module.exports = { installBlobPolyfill };
