import * as THREE from "three";
import { INCH, LOG } from "../config/constants";
import type { WoodMaterials } from "./materials";

export interface WoodPiece {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material[]>;
  /** 外接圆半径(米),含形状噪声后的最大值 */
  radius: number;
  /** 沿轴长度(米) */
  length: number;
}

/**
 * 绕圆周的多频噪声。
 *
 * 真树干不是正圆:有几处鼓包、几处凹陷,而且越靠根部越明显。
 * 三个互质频率的正弦叠加就够像了,比引入一个 simplex noise 库轻得多,
 * 而且给定种子完全可复现。
 */
function radialNoise(angle: number, heightRatio: number, seed: number): number {
  const a = Math.sin(angle * 2 + seed) * 0.55;
  const b = Math.sin(angle * 5 + seed * 1.7) * 0.3;
  const c = Math.sin(angle * 11 + seed * 2.3) * 0.15;
  // 越靠近底部(heightRatio→0)噪声越强,模拟根部起伏
  return (a + b + c) * (1 - heightRatio * 0.45);
}

/** 生成一根随机形状的原木。每次调用形状都不同。 */
export function createLog(materials: WoodMaterials, seed = Math.random() * 1000): WoodPiece {
  const diameterIn = LOG.minDiameterIn + Math.random() * (LOG.maxDiameterIn - LOG.minDiameterIn);
  const lengthIn = LOG.minLengthIn + Math.random() * (LOG.maxLengthIn - LOG.minLengthIn);

  const baseRadius = (diameterIn / 2) * INCH;
  const length = lengthIn * INCH;
  const bulge = LOG.bulgeIn * INCH;

  const geometry = new THREE.CylinderGeometry(
    baseRadius,
    baseRadius,
    length,
    LOG.radialSegments,
    LOG.heightSegments,
    false,
  );

  const position = geometry.attributes.position as THREE.BufferAttribute;
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  let maxRadius = 0;

  // CylinderGeometry 的前 297 个顶点是侧面，后续顶点属于两个端盖。
  const sideVertexCount = (LOG.radialSegments + 1) * (LOG.heightSegments + 1);

  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);

    const angle = Math.atan2(v.z, v.x);
    const heightRatio = v.y / length + 0.5;
    const currentRadius = Math.hypot(v.x, v.z);

    // 关键:侧面和端面的边缘顶点必须用完全相同的公式位移。
    // three-pinata 靠顶点坐标哈希判断哪些面是连在一起的,只要两边算出来
    // 差一丁点,它就会把端面当成独立碎块 —— 一刀下去能切出七块。
    if (currentRadius > 1e-6) {
      const offset =
        radialNoise(angle, heightRatio, seed) * bulge * (1 + (1 - heightRatio) * LOG.bulgeTaper);
      const scale = (currentRadius + offset) / currentRadius;
      position.setXYZ(i, v.x * scale, v.y, v.z * scale);
      maxRadius = Math.max(maxRadius, currentRadius + offset);
    }

    if (i >= sideVertexCount) {
      // 端盖明确使用 XZ 平面投影，避免 CylinderGeometry 的端盖 UV 在扰动后拉花。
      uv.setXY(i, v.x / (baseRadius * 2) + 0.5, v.z / (baseRadius * 2) + 0.5);
    }
  }

  // 原站只随机平移树皮的 U 相位，不沿 V 重复缩放；这样不会在木身中间产生水平接缝。
  const barkOffset = Math.random();
  for (let i = 0; i < sideVertexCount; i++) uv.setX(i, uv.getX(i) + barkOffset);

  position.needsUpdate = true;
  uv.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  // 保留 CylinderGeometry 原生三组：侧面、上端盖、下端盖。
  const mesh = new THREE.Mesh(geometry, [materials.side, materials.top, materials.top]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const volume = Math.PI * (diameterIn / 2) ** 2 * lengthIn;
  Object.assign(mesh.userData, {
    volumeInches: volume,
    radius: diameterIn / 2,
    height: lengthIn,
    isLog: true,
    isSplittable: true,
    isFirewood: false,
    sideMaterial: materials.side,
    topMaterial: materials.top,
    innerMaterial: materials.inner,
    originalCenterOffset: new THREE.Vector3(),
  });

  return { mesh, radius: maxRadius, length };
}
