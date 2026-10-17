/**
 * TextEncoder / TextDecoder（UTF-8）polyfill，仅在全局缺失时安装。
 */

function installTextCodecs() {
  if (typeof TextEncoder !== "function") {
    globalThis.TextEncoder = class TextEncoder {
      encode(str) {
        const s = String(str ?? "");
        const bytes = [];
        for (let i = 0; i < s.length; i++) {
          let code = s.charCodeAt(i);
          if (code < 0x80) {
            bytes.push(code);
          } else if (code < 0x800) {
            bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
          } else if (code >= 0xd800 && code <= 0xdbff) {
            const next = s.charCodeAt(++i);
            code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
            bytes.push(
              0xf0 | (code >> 18),
              0x80 | ((code >> 12) & 0x3f),
              0x80 | ((code >> 6) & 0x3f),
              0x80 | (code & 0x3f),
            );
          } else {
            bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
          }
        }
        return new Uint8Array(bytes);
      }
    };
  }

  if (typeof TextDecoder !== "function") {
    globalThis.TextDecoder = class TextDecoder {
      constructor(label = "utf-8") {
        this.encoding = String(label || "utf-8").toLowerCase();
      }
      decode(input) {
        const bytes =
          input instanceof ArrayBuffer
            ? new Uint8Array(input)
            : input
              ? new Uint8Array(input.buffer || input, input.byteOffset || 0, input.byteLength || input.length)
              : new Uint8Array(0);
        let out = "";
        let i = 0;
        while (i < bytes.length) {
          const c = bytes[i++];
          if (c < 0x80) {
            out += String.fromCharCode(c);
          } else if (c < 0xe0) {
            const c2 = bytes[i++];
            out += String.fromCharCode(((c & 0x1f) << 6) | (c2 & 0x3f));
          } else if (c < 0xf0) {
            const c2 = bytes[i++];
            const c3 = bytes[i++];
            out += String.fromCharCode(((c & 0x0f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f));
          } else {
            const c2 = bytes[i++];
            const c3 = bytes[i++];
            const c4 = bytes[i++];
            let code =
              ((c & 0x07) << 18) | ((c2 & 0x3f) << 12) | ((c3 & 0x3f) << 6) | (c4 & 0x3f);
            code -= 0x10000;
            out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
          }
        }
        return out;
      }
    };
  }
}

module.exports = { installTextCodecs };
