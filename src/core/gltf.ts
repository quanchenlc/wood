import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { BASIS_PATH } from "../config/assets";

let ktx2: KTX2Loader | null = null;

/**
 * 带 KTX2 支持的 GLTF 加载器。
 *
 * 模型里只要有一张 KTX2 压缩贴图,没挂 transcoder 的 loader 就会直接抛错,
 * 而且报的是「setKTX2Loader must be called」这种和素材本身无关的错。
 * 统一从这里拿 loader,就不会有哪个模块漏配。
 *
 * transcoder 全局只建一个:它背后是一个 WASM worker 池,建多份纯属浪费。
 */
export function createGltfLoader(renderer: THREE.WebGLRenderer): GLTFLoader {
  ktx2 ??= new KTX2Loader().setTranscoderPath(BASIS_PATH).detectSupport(renderer);
  return new GLTFLoader().setKTX2Loader(ktx2);
}

export function disposeGltfLoader() {
  ktx2?.dispose();
  ktx2 = null;
}
