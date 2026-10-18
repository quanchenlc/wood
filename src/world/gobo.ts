import * as THREE from "three";
import { IS_MINIGAME } from "../config/constants";

export interface Gobo {
  update(dt: number): void;
  /** 羊皮纸等套装关掉树冠遮罩，避免黑斑硬影 */
  setEnabled?(on: boolean): void;
  dispose(): void;
}

/** 遮罩片相对太阳方向的摆位:距离、横向偏移、高度偏移、尺寸 */
const PANELS_FULL = [
  { distance: 3.0, lateral: -1.4, vertical: -0.6, size: 9, drift: 0.035 },
  { distance: 4.6, lateral: 1.1, vertical: 0.4, size: 11, drift: -0.022 },
] as const;

/** 小游戏只留一片：远景光斑够用，少一次阴影 caster */
const PANELS_MINI = [{ distance: 3.0, lateral: -1.4, vertical: -0.6, size: 9, drift: 0.035 }] as const;

/**
 * 程序化生成的树冠遮罩:一堆大小不一、边缘柔和的叶簇。
 *
 * 关键是「透明底 + 不透明叶簇」,遮挡靠的是 alpha 通道 ——
 * 底色如果填成不透明的白,整张图 alpha 恒为 1,alphaTest 一个像素都裁不掉,
 * 遮罩片就成了一块实心板,把整个场景压黑。
 *
 * 用 canvas 现画而不是读贴图:省一个素材依赖,而且每次刷新图案都不一样。
 */
function createCanopyTexture(size = IS_MINIGAME ? 256 : 512): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  // 三档尺寸各画一轮:大团定骨架,小点碎化边缘,光斑才有层次
  const layers = [
    { count: 16, min: size * 0.07, max: size * 0.13 },
    { count: 40, min: size * 0.035, max: size * 0.07 },
    { count: 80, min: size * 0.012, max: size * 0.032 },
  ];

  for (const layer of layers) {
    for (let i = 0; i < layer.count; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = layer.min + Math.random() * (layer.max - layer.min);
      // 径向渐变让叶簇边缘是软的;中心 alpha 要明确高过 alphaTest 阈值才挡得住光
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, "rgba(0,0,0,1)");
      gradient.addColorStop(0.55, "rgba(0,0,0,0.85)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * 树冠光斑。
 *
 * 做法是在太阳和场景之间架几片「只投影、不显形」的遮罩片:
 * 相机看不见它们(关掉颜色和深度写入),但阴影通道照常渲染,
 * 于是地面上就出现了斑驳的树影。比起真的建一棵树,这个便宜太多。
 */
export function createGobo(scene: THREE.Scene, sunDirection: THREE.Vector3): Gobo {
  const texture = createCanopyTexture();
  const panels: THREE.Mesh[] = [];
  const PANELS = IS_MINIGAME ? PANELS_MINI : PANELS_FULL;

  // 以太阳方向为法线搭一个局部坐标系,遮罩片就贴在这个平面上
  const forward = sunDirection.clone().normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();

  for (const cfg of PANELS) {
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      // 只参与阴影通道:颜色和深度都不写,相机就看不到这几片
      colorWrite: false,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(cfg.size, cfg.size), material);
    // 阴影通道用的是独立的深度材质,alpha 裁剪要在这里再声明一次,
    // 否则投下来的会是一整块方影子,而不是叶隙
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: texture,
      alphaTest: 0.5,
    });
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;

    mesh.position
      .copy(forward)
      .multiplyScalar(cfg.distance)
      .addScaledVector(right, cfg.lateral)
      .addScaledVector(up, cfg.vertical);
    mesh.lookAt(mesh.position.clone().sub(forward));

    scene.add(mesh);
    panels.push(mesh);
  }

  let elapsed = 0;
  let enabled = true;
  return {
    update(dt) {
      if (!enabled) return;
      elapsed += dt;
      // 两片按不同速度缓慢平移,光斑就会像有风一样慢慢游走
      PANELS.forEach((cfg, i) => {
        const material = panels[i].material as THREE.MeshBasicMaterial;
        material.map!.offset.x = elapsed * cfg.drift;
        material.map!.offset.y = Math.sin(elapsed * cfg.drift * 2) * 0.02;
      });
    },
    setEnabled(on) {
      enabled = on;
      for (const mesh of panels) {
        mesh.visible = on;
        mesh.castShadow = on;
      }
    },
    dispose() {
      for (const mesh of panels) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        mesh.customDepthMaterial?.dispose();
      }
      texture.dispose();
    },
  };
}
