import * as THREE from "three";
import { IS_MINIGAME } from "../config/constants";
import { isMinigame } from "../platform/env";

export function createRenderer(): THREE.WebGLRenderer {
  // 微信小游戏适配层会预先 wx.createCanvas() 并挂到 globalThis.canvas
  const existing =
    typeof globalThis !== "undefined" ? (globalThis.canvas as HTMLCanvasElement | undefined) : undefined;

  const renderer = new THREE.WebGLRenderer({
    canvas: existing,
    // 小游戏关 MSAA：省带宽/显存，近处模型靠贴图观感
    antialias: !IS_MINIGAME,
    powerPreference: "high-performance",
  });

  // 小游戏 DPR≤1.5：真机 2x+composer 曾推到 ~1GB 级绘图缓冲
  const maxDpr = IS_MINIGAME ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.setSize(window.innerWidth, window.innerHeight);

  renderer.shadowMap.enabled = true;
  // three r186 起移除了 PCFSoftShadowMap,统一用 PCF 配合 shadow.radius 做软化
  renderer.shadowMap.type = THREE.PCFShadowMap;

  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  if (!existing && !isMinigame()) {
    document.body.appendChild(renderer.domElement);
  }
  return renderer;
}

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc4e0);
  scene.fog = new THREE.Fog(0x9fc4e0, 6, 22);
  return scene;
}
