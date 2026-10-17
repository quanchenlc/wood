import * as THREE from "three";
import { isMinigame } from "../platform/env";

export function createRenderer(): THREE.WebGLRenderer {
  // 微信小游戏适配层会预先 wx.createCanvas() 并挂到 globalThis.canvas
  const existing =
    typeof globalThis !== "undefined" ? (globalThis.canvas as HTMLCanvasElement | undefined) : undefined;

  const renderer = new THREE.WebGLRenderer({
    canvas: existing,
    antialias: true,
    powerPreference: "high-performance",
  });

  // 高 DPI 屏上限制到 2x,再高对这个场景没有肉眼收益,只是白烧 GPU
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
