/**
 * AbortController / AbortSignal / Request / Headers polyfill。
 * 微信 JSCore 无 AbortController；three FileLoader 会：
 *   new AbortController() + new Request(url, { signal })
 * 空实现即可：abort() 设 aborted=true 并派发 abort；fetch 忽略 signal。
 * harness 剥掉原生 AbortController/Request/Headers 后也装同一套（原生 Request 会拒收 polyfill signal）。
 */

function installAbortPolyfill() {
  const g = globalThis;
  if (
    g.AbortController &&
    g.AbortController.__fwPolyfill &&
    g.Request &&
    g.Request.__fwPolyfill
  ) {
    return;
  }

  class AbortSignalPolyfill {
    constructor() {
      this.aborted = false;
      this.reason = undefined;
      this.onabort = null;
      this._listeners = [];
    }
    addEventListener(type, fn) {
      if (type === "abort" && typeof fn === "function") this._listeners.push(fn);
    }
    removeEventListener(type, fn) {
      if (type !== "abort") return;
      this._listeners = this._listeners.filter((f) => f !== fn);
    }
    dispatchEvent(ev) {
      if (!ev || ev.type !== "abort") return false;
      for (const fn of this._listeners.slice()) {
        try {
          fn.call(this, ev);
        } catch {
          /* ignore */
        }
      }
      if (typeof this.onabort === "function") {
        try {
          this.onabort(ev);
        } catch {
          /* ignore */
        }
      }
      return true;
    }
    static abort(reason) {
      const s = new AbortSignalPolyfill();
      s.aborted = true;
      s.reason = reason;
      return s;
    }
    static timeout() {
      return new AbortSignalPolyfill();
    }
  }

  class AbortControllerPolyfill {
    constructor() {
      this.signal = new AbortSignalPolyfill();
    }
    abort(reason) {
      const s = this.signal;
      if (s.aborted) return;
      s.aborted = true;
      s.reason = reason !== undefined ? reason : new Error("AbortError");
      const ev = { type: "abort", target: s, currentTarget: s };
      s.dispatchEvent(ev);
    }
  }
  AbortControllerPolyfill.__fwPolyfill = true;
  AbortSignalPolyfill.__fwPolyfill = true;

  class HeadersPolyfill {
    constructor(init) {
      this._map = Object.create(null);
      if (!init) return;
      if (typeof init.forEach === "function") {
        init.forEach((v, k) => {
          this._map[String(k).toLowerCase()] = String(v);
        });
      } else if (typeof init === "object") {
        for (const [k, v] of Object.entries(init)) {
          this._map[String(k).toLowerCase()] = String(v);
        }
      }
    }
    get(name) {
      const v = this._map[String(name).toLowerCase()];
      return v === undefined ? null : v;
    }
    set(name, value) {
      this._map[String(name).toLowerCase()] = String(value);
    }
    has(name) {
      return Object.prototype.hasOwnProperty.call(this._map, String(name).toLowerCase());
    }
    forEach(fn) {
      for (const k of Object.keys(this._map)) fn(this._map[k], k, this);
    }
  }
  HeadersPolyfill.__fwPolyfill = true;

  class RequestPolyfill {
    constructor(input, init) {
      const opts = init && typeof init === "object" ? { ...init } : {};
      if (typeof input === "string") {
        this.url = input;
      } else if (input && typeof input === "object") {
        this.url = input.url || String(input);
        if (!opts.method && input.method) opts.method = input.method;
        if (!opts.headers && input.headers) opts.headers = input.headers;
        if (!opts.credentials && input.credentials) opts.credentials = input.credentials;
        if (opts.signal === undefined && input.signal) opts.signal = input.signal;
      } else {
        this.url = String(input);
      }
      this.method = String(opts.method || "GET").toUpperCase();
      this.headers =
        opts.headers && typeof opts.headers.get === "function"
          ? opts.headers
          : new HeadersPolyfill(opts.headers || {});
      this.credentials = opts.credentials || "same-origin";
      this.signal = opts.signal;
    }
  }
  RequestPolyfill.__fwPolyfill = true;

  const targets = [g];
  try {
    if (typeof window !== "undefined") targets.push(window);
  } catch {
    /* ignore */
  }
  try {
    if (typeof GameGlobal !== "undefined") targets.push(GameGlobal);
  } catch {
    /* ignore */
  }

  function assign(t, key, value) {
    try {
      t[key] = value;
    } catch {
      try {
        Object.defineProperty(t, key, {
          configurable: true,
          writable: true,
          value,
        });
      } catch {
        /* ignore */
      }
    }
  }

  for (const t of targets) {
    assign(t, "AbortSignal", AbortSignalPolyfill);
    assign(t, "AbortController", AbortControllerPolyfill);
    assign(t, "Headers", HeadersPolyfill);
    assign(t, "Request", RequestPolyfill);
  }
}

module.exports = { installAbortPolyfill };
