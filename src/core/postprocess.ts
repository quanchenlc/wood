import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { POST } from "../config/constants";

export interface Post {
  composer: EffectComposer;
  setSize(width: number, height: number): void;
  /**
   * 景深 pass 会重新渲染一遍深度。草叶是一堆细长的半透明片,
   * 在深度图里会打出大量噪点,让背景糊成一团。渲染深度时先把它藏起来。
   */
  excludeFromDepth(object: THREE.Object3D): void;
  dispose(): void;
}

export function createPost(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): Post {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bokeh = new BokehPass(scene, camera, {
    focus: POST.focus,
    aperture: POST.aperture,
    maxblur: POST.maxBlur,
  });

  const hidden: THREE.Object3D[] = [];
  const originalRender = bokeh.render.bind(bokeh);
  bokeh.render = (...args: Parameters<typeof originalRender>) => {
    const wasVisible = hidden.map((o) => o.visible);
    hidden.forEach((o) => (o.visible = false));
    originalRender(...args);
    hidden.forEach((o, i) => (o.visible = wasVisible[i]));
  };

  composer.addPass(bokeh);
  composer.addPass(new OutputPass());

  return {
    composer,
    setSize: (w, h) => composer.setSize(w, h),
    excludeFromDepth: (object) => hidden.push(object),
    dispose: () => composer.dispose(),
  };
}
