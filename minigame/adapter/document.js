const { ListenerList } = require("./event-target");

function createElementFactory(canvas) {
  return function createElement(tagName) {
    const tag = String(tagName).toLowerCase();
    if (tag === "canvas") {
      // 第一次返回上屏 canvas；后续离屏
      if (!createElement._mainUsed) {
        createElement._mainUsed = true;
        return canvas;
      }
      if (typeof wx !== "undefined" && wx.createCanvas) return wx.createCanvas();
      const off = canvas.ownerDocument
        ? canvas.ownerDocument.createElement("canvas")
        : null;
      if (off) return off;
      // harness：用浏览器 document 造离屏 canvas
      if (typeof globalThis.__HARNESS_DOCUMENT__ !== "undefined") {
        return globalThis.__HARNESS_DOCUMENT__.createElement("canvas");
      }
      return canvas;
    }
    if (tag === "img" || tag === "image") {
      if (typeof wx !== "undefined" && wx.createImage) return wx.createImage();
      if (typeof Image !== "undefined") return new Image();
      if (typeof globalThis.__HARNESS_DOCUMENT__ !== "undefined") {
        return globalThis.__HARNESS_DOCUMENT__.createElement("img");
      }
      throw new Error("Image not available");
    }
    if (tag === "div" || tag === "span" || tag === "style" || tag === "script") {
      return createFakeElement(tag);
    }
    return createFakeElement(tag);
  };
}

function createFakeElement(tag) {
  const listeners = new ListenerList();
  const el = {
    tagName: tag.toUpperCase(),
    style: {},
    children: [],
    childNodes: [],
    parentNode: null,
    classList: {
      _c: new Set(),
      add(...xs) {
        xs.forEach((x) => this._c.add(x));
      },
      remove(...xs) {
        xs.forEach((x) => this._c.delete(x));
      },
      contains(x) {
        return this._c.has(x);
      },
    },
    set hidden(v) {
      this._hidden = !!v;
    },
    get hidden() {
      return !!this._hidden;
    },
    textContent: "",
    innerHTML: "",
    id: "",
    className: "",
    appendChild(child) {
      this.children.push(child);
      this.childNodes.push(child);
      child.parentNode = this;
      return child;
    },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      child.parentNode = null;
      return child;
    },
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    },
    setAttribute(k, v) {
      this[k] = v;
    },
    getAttribute(k) {
      return this[k];
    },
    addEventListener: (t, fn) => listeners.on(t, fn),
    removeEventListener: (t, fn) => listeners.off(t, fn),
    dispatchEvent: (e) => listeners.emit(e.type, e),
  };
  return el;
}

function createDocument(canvas) {
  const listeners = new ListenerList();
  const body = createFakeElement("body");
  const html = createFakeElement("html");
  html.appendChild(body);

  const ids = new Map();
  const createElement = createElementFactory(canvas);
  // 上屏 canvas 已由入口持有，后续 createElement('canvas') 一律离屏
  createElement._mainUsed = true;

  const doc = {
    body,
    documentElement: html,
    readyState: "complete",
    visibilityState: "visible",
    hidden: false,
    createElement,
    createElementNS: (_ns, tag) => createElement(tag),
    getElementById(id) {
      return ids.get(id) || null;
    },
    querySelector(sel) {
      if (sel === "canvas") return canvas;
      if (sel.startsWith("#")) return ids.get(sel.slice(1)) || null;
      return null;
    },
    querySelectorAll(sel) {
      const one = doc.querySelector(sel);
      return one ? [one] : [];
    },
    addEventListener: (t, fn) => listeners.on(t, fn),
    removeEventListener: (t, fn) => listeners.off(t, fn),
    __emit: (t, e) => listeners.emit(t, e),
    __register(id, el) {
      ids.set(id, el);
    },
  };

  // 给 canvas 挂上 ownerDocument / style，贴近浏览器
  canvas.ownerDocument = doc;
  canvas.style = canvas.style || {};
  canvas.clientWidth = canvas.width;
  canvas.clientHeight = canvas.height;
  canvas.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: canvas.width,
    bottom: canvas.height,
    width: canvas.width,
    height: canvas.height,
  });
  canvas.setPointerCapture = () => {};
  canvas.releasePointerCapture = () => {};
  canvas.hasPointerCapture = () => false;
  body.appendChild(canvas);

  return doc;
}

module.exports = { createDocument, createFakeElement };
