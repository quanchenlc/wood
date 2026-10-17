import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { basisPath } from "../config/assets";
import { isMinigame } from "../platform/env";

let ktx2: KTX2Loader | null = null;

/**
 * GLTF 加载器。
 *
 * 小游戏：树桩等已离线解成 JPG 嵌进 GLB，不挂 KTX2Loader
 * （真机无 Blob/Worker；esbuild 用 stubs/KTX2Loader.js 替换本 import）。
 * Web：KTX2Loader + basis transcoder。
 */
export function createGltfLoader(renderer: THREE.WebGLRenderer): GLTFLoader {
  if (isMinigame()) {
    return new GLTFLoader();
  }

  ktx2 ??= new KTX2Loader().setTranscoderPath(basisPath()).detectSupport(renderer);
  return new GLTFLoader().setKTX2Loader(ktx2);
}

export function disposeGltfLoader() {
  ktx2?.dispose();
  ktx2 = null;
}
