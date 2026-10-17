import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { basisPath } from "../config/assets";
import { isMinigame } from "../platform/env";

let ktx2: KTX2Loader | null = null;

/**
 * 微信基础库在部分机型上禁用了全局 WebAssembly，需改用 WXWebAssembly。
 * 仅在小游戏运行时挂别名；Web 版不动。
 */
function ensureWasmAlias() {
  if (!isMinigame()) return;
  const g = globalThis as typeof globalThis & {
    WXWebAssembly?: typeof WebAssembly;
    WebAssembly?: typeof WebAssembly;
  };
  if (g.WXWebAssembly && !g.WebAssembly) {
    g.WebAssembly = g.WXWebAssembly;
  }
}

/**
 * 带 KTX2 支持的 GLTF 加载器。
 *
 * 模型里只要有一张 KTX2 压缩贴图,没挂 transcoder 的 loader 就会直接抛错,
 * 而且报的是「setKTX2Loader must be called」这种和素材本身无关的错。
 * 统一从这里拿 loader,就不会有哪个模块漏配。
 *
 * transcoder 全局只建一个:它背后是一个 WASM worker 池,建多份纯属浪费。
 * 小游戏上 Worker/Blob URL 仍是风险点，构建产物把 basis 放进分包并保留 wasm。
 */
export function createGltfLoader(renderer: THREE.WebGLRenderer): GLTFLoader {
  ensureWasmAlias();
  ktx2 ??= new KTX2Loader().setTranscoderPath(basisPath()).detectSupport(renderer);
  return new GLTFLoader().setKTX2Loader(ktx2);
}

export function disposeGltfLoader() {
  ktx2?.dispose();
  ktx2 = null;
}
