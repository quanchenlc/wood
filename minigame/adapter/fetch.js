/**
 * fetch 适配：three r186 FileLoader 走 fetch。
 * - http(s) → wx.request
 * - 包内/分包相对路径 → wx.getFileSystemManager().readFile
 */

function toAbsolutePackagePath(url) {
  let path = String(url || "");
  // 去掉 query string
  path = path.split("?")[0].split("#")[0];
  // harness 绝对路径 /subpackages/... → 去掉前导 /
  if (path.startsWith("/")) path = path.slice(1);
  // ./foo → foo
  path = path.replace(/^\.\//, "");
  return path;
}

function isRemote(url) {
  return /^https?:\/\//i.test(String(url));
}

function makeResponse(data, status, url) {
  const ok = status >= 200 && status < 300;
  const asArrayBuffer = () => {
    if (data instanceof ArrayBuffer) return Promise.resolve(data);
    if (ArrayBuffer.isView(data)) {
      return Promise.resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    }
    if (typeof data === "string") {
      const enc = new TextEncoder();
      return Promise.resolve(enc.encode(data).buffer);
    }
    return Promise.reject(new TypeError("fetch response is not binary"));
  };
  const asText = () => {
    if (typeof data === "string") return Promise.resolve(data);
    return asArrayBuffer().then((buf) => new TextDecoder().decode(buf));
  };
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    url: String(url),
    headers: { get: () => null },
    arrayBuffer: asArrayBuffer,
    text: asText,
    json: () => asText().then((t) => JSON.parse(t)),
    blob: () =>
      asArrayBuffer().then((buf) => {
        if (typeof Blob === "function") return new Blob([buf]);
        // 小游戏无 Blob：给一个最小 shim，TextureLoader 一般不走这条
        return { size: buf.byteLength, type: "", arrayBuffer: () => Promise.resolve(buf) };
      }),
  };
}

function wxRequest(url, init) {
  const method = ((init && init.method) || "GET").toUpperCase();
  return new Promise((resolve, reject) => {
    if (typeof wx === "undefined" || !wx.request) {
      reject(new Error("wx.request unavailable"));
      return;
    }
    wx.request({
      url,
      method,
      // arraybuffer 覆盖 GLB / 贴图 / 音频；text 由调用方再解码
      responseType: "arraybuffer",
      header: (init && init.headers) || {},
      success: (res) => resolve(makeResponse(res.data, res.statusCode || 200, url)),
      fail: (err) => reject(err),
    });
  });
}

function fsRead(url) {
  const filePath = toAbsolutePackagePath(url);
  return new Promise((resolve, reject) => {
    if (typeof wx === "undefined" || !wx.getFileSystemManager) {
      reject(new Error("wx.getFileSystemManager unavailable"));
      return;
    }
    const fs = wx.getFileSystemManager();
    // 优先异步 API
    if (typeof fs.readFile === "function") {
      fs.readFile({
        filePath,
        success: (res) => resolve(makeResponse(res.data, 200, url)),
        fail: (err) => {
          // 再试带 USER_DATA_PATH 前缀
          const alt =
            wx.env && wx.env.USER_DATA_PATH ? `${wx.env.USER_DATA_PATH}/${filePath}` : null;
          if (!alt) {
            reject(err);
            return;
          }
          fs.readFile({
            filePath: alt,
            success: (res2) => resolve(makeResponse(res2.data, 200, url)),
            fail: reject,
          });
        },
      });
      return;
    }
    // sync 兜底（部分基础库）
    try {
      const data = fs.readFileSync(filePath);
      resolve(makeResponse(data, 200, url));
    } catch (e) {
      reject(e);
    }
  });
}

function decodeDataUrl(url) {
  const m = String(url).match(/^data:([^;,]+)?((?:;[^;,]+)*)?(;base64)?,([\s\S]*)$/);
  if (!m) return Promise.reject(new TypeError("invalid data URL"));
  const mime = m[1] || "application/octet-stream";
  const isB64 = Boolean(m[3]);
  const payload = m[4] || "";
  let bytes;
  if (isB64) {
    const bin = atob(payload);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(payload));
  }
  return Promise.resolve(makeResponse(bytes.buffer, 200, url));
}

function createFetch() {
  return function fetch(input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    if (!url) return Promise.reject(new TypeError("fetch: invalid url"));
    // ImageBitmapLoader 会对 createObjectURL 得到的 data:/blob: 再 fetch
    if (/^data:/i.test(url)) return decodeDataUrl(url);
    if (/^blob:/i.test(url)) {
      // harness 恢复了原生 Blob/URL 时，blob: 只能用原生 fetch 读
      const native = globalThis.__HARNESS_NATIVE__ && globalThis.__HARNESS_NATIVE__.fetch;
      if (native) return native(url, init || {});
      return Promise.reject(new Error("fetch: blob URLs not supported on device polyfill"));
    }
    if (isRemote(url)) return wxRequest(url, init || {});
    return fsRead(url);
  };
}

module.exports = { createFetch, toAbsolutePackagePath };
