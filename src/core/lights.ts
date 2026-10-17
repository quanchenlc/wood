import * as THREE from "three";
import { IS_MOBILE, LIGHTING } from "../config/constants";

export interface Sunlight {
  sun: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
  /** 归一化的太阳方向(从场景指向太阳),草地和 gobo 都要用 */
  direction: THREE.Vector3;
}

export function createLights(scene: THREE.Scene): Sunlight {
  const { sunAzimuth: az, sunElevation: el, sunDistance: d } = LIGHTING;

  const sun = new THREE.DirectionalLight(LIGHTING.sunColor, LIGHTING.sunIntensity);
  sun.position.set(
    Math.cos(az) * Math.cos(el) * d,
    Math.sin(el) * d,
    Math.sin(az) * Math.cos(el) * d,
  );
  sun.castShadow = true;

  const shadow = sun.shadow;
  shadow.mapSize.set(LIGHTING.shadowMapSize, LIGHTING.shadowMapSize);
  const cam = shadow.camera;
  cam.left = -LIGHTING.shadowExtent;
  cam.right = LIGHTING.shadowExtent;
  cam.top = LIGHTING.shadowExtent;
  cam.bottom = -LIGHTING.shadowExtent;
  cam.near = LIGHTING.shadowNear;
  cam.far = LIGHTING.shadowFar;
  cam.updateProjectionMatrix();

  // 用 normalBias 而不是 bias 消除自阴影粉刺:柴火是圆柱面,常规 bias 会让
  // 接触点的影子脱开,normalBias 沿法线推开就没这个问题
  shadow.bias = 0;
  shadow.normalBias = LIGHTING.shadowNormalBias;
  shadow.radius = LIGHTING.shadowRadius;
  if (!IS_MOBILE) shadow.blurSamples = LIGHTING.shadowBlurSamples;

  scene.add(sun);
  scene.add(sun.target);

  const ambient = new THREE.AmbientLight(LIGHTING.ambientColor, LIGHTING.ambientIntensity);
  scene.add(ambient);

  return { sun, ambient, direction: sun.position.clone().normalize() };
}
