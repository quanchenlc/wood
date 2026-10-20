/**
 * Blob / createObjectURL（无 btoa / 无 data URL）。
 *
 * three GLTFLoader 对 bufferView 嵌图会 new Blob + createObjectURL。
 * 真机没有可靠 Blob URL，对大图做 base64 data URL 会把内存打到数百 MB 并卡死启动。
 * 这里把字节写到 wx.env.USER_DATA_PATH 临时文件，返回本地路径给 Image / wx.createImage。
 *
 * 小游戏树桩/斧头已导出为 .gltf + 独立 jpg，正常路径不走这里；本 polyfill 仅作兜底。
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

function toArrayBuffer(bytes) {
  if (bytes instanceof ArrayBuffer) return bytes;
  if (ArrayBuffer.isView(bytes)) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  return new Uint8Array(bytes || []).buffer;
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
  const data = toArrayBuffer(bytes);

  // 微信基础库：writeFileSync(filePath, data) data 为 ArrayBuffer | string
  // 部分版本对 TypedArray 不友好，统一传 ArrayBuffer；禁止 btoa/data URL。
  try {
    fs.writeFileSync(path, data);
  } catch (e1) {
    try {
      fs.writeFileSync(path, data, "binary");
    } catch (e2) {
      throw new Error(
        `blob polyfill writeFileSync failed: ${e1 && e1.message} / ${e2 && e2.message}`,
      );
    }
  }
  return path;
}

function installBlobPolyfill() {
  class MiniBlob {
    constructor(parts = [], options = {}) {
      const chunks = (parts || []).map((p) => {
        if (typeof p === "string") {
          // 禁止把二进制当字符串拼 data URL；字符串仅用于小文本
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
      return Promise.resolve(toArrayBuffer(this._data));
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
      // 大图写临时文件，返回本地路径（绝不用 btoa / data:）
      const path = writeTempFile(obj._data, obj.type || "application/octet-stream");
      objectUrls.set(path, true);
      return path;
    }
    throw new Error("URL.createObjectURL: only MiniBlob supported (no btoa/data URL)");
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
