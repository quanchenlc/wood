/**
 * XMLHttpRequest 适配：本地包内路径走 wx 文件系统 / 仿真 harness 的 fetch；
 * http(s) 走 wx.request 或浏览器 XHR。
 */

function createXMLHttpRequest() {
  // harness / 浏览器环境直接用原生
  if (typeof globalThis.__HARNESS_XHR__ !== "undefined") {
    return globalThis.__HARNESS_XHR__;
  }
  if (typeof XMLHttpRequest !== "undefined" && typeof wx === "undefined") {
    return XMLHttpRequest;
  }

  class WxXMLHttpRequest {
    constructor() {
      this.method = "GET";
      this.url = "";
      this.responseType = "";
      this.response = null;
      this.responseText = "";
      this.status = 0;
      this.readyState = 0;
      this.onreadystatechange = null;
      this.onload = null;
      this.onerror = null;
      this.onloadend = null;
      this._headers = {};
    }

    open(method, url) {
      this.method = method;
      this.url = url;
      this.readyState = 1;
    }

    setRequestHeader(k, v) {
      this._headers[k] = v;
    }

    addEventListener(type, fn) {
      this[`on${type}`] = fn;
    }

    send() {
      const url = this.url;
      const isHttp = /^https?:\/\//i.test(url);

      if (isHttp && typeof wx !== "undefined" && wx.request) {
        wx.request({
          url,
          method: this.method,
          responseType: this.responseType === "arraybuffer" ? "arraybuffer" : "text",
          header: this._headers,
          success: (res) => {
            this.status = res.statusCode || 200;
            this.readyState = 4;
            this.response = res.data;
            this.responseText = typeof res.data === "string" ? res.data : "";
            this._fire();
          },
          fail: (err) => {
            this.status = 0;
            this.readyState = 4;
            if (this.onerror) this.onerror(err);
            if (this.onloadend) this.onloadend();
          },
        });
        return;
      }

      // 包内相对路径：优先 FileSystemManager
      if (typeof wx !== "undefined" && wx.getFileSystemManager) {
        const fs = wx.getFileSystemManager();
        const rel = url.replace(/^\.\//, "").replace(/^\//, "");
        try {
          if (this.responseType === "arraybuffer") {
            const data = fs.readFileSync(rel);
            this.status = 200;
            this.readyState = 4;
            this.response = data;
            this._fire();
          } else {
            const data = fs.readFileSync(rel, "utf8");
            this.status = 200;
            this.readyState = 4;
            this.response = data;
            this.responseText = data;
            this._fire();
          }
          return;
        } catch (e) {
          // fallthrough to fetch/download
        }

        if (wx.downloadFile && isHttp) {
          wx.downloadFile({
            url,
            success: (res) => {
              try {
                const data = fs.readFileSync(res.tempFilePath);
                this.status = 200;
                this.readyState = 4;
                this.response = data;
                this._fire();
              } catch (err) {
                if (this.onerror) this.onerror(err);
              }
            },
            fail: (err) => this.onerror && this.onerror(err),
          });
          return;
        }
      }

      // harness：用 fetch
      if (typeof fetch === "function") {
        fetch(url)
          .then(async (res) => {
            this.status = res.status;
            this.readyState = 4;
            if (this.responseType === "arraybuffer") {
              this.response = await res.arrayBuffer();
            } else if (this.responseType === "blob") {
              this.response = await res.blob();
            } else {
              this.responseText = await res.text();
              this.response = this.responseText;
            }
            this._fire();
          })
          .catch((err) => {
            if (this.onerror) this.onerror(err);
            if (this.onloadend) this.onloadend();
          });
        return;
      }

      if (this.onerror) this.onerror(new Error(`XHR cannot load ${url}`));
    }

    _fire() {
      if (this.onreadystatechange) this.onreadystatechange();
      if (this.onload) this.onload();
      if (this.onloadend) this.onloadend();
    }
  }

  return WxXMLHttpRequest;
}

module.exports = { createXMLHttpRequest };
