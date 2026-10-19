import * as THREE from "three";
import { DestructibleMesh } from "@dgreenheck/three-pinata";
import { INCH } from "../config/constants";
import type { WoodMaterials } from "./materials";

const raycaster = new THREE.Raycaster();
const FIREWOOD_MAX_VOLUME = 500;
const FIREWOOD_ABSOLUTE_VOLUME = 250;
const RESCUE_ASPECT_RATIO = 3;
const MIN_HALF_THICKNESS_IN = 2.5;
const CUT_EPSILON = 0.005;
const CUT_SURFACE_NOISE = 0.15 * INCH;

export type SplittableMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;

export interface SplitTarget {
  mesh: SplittableMesh;
  /** 世界坐标下的落点 */
  point: THREE.Vector3;
}

/** 射线拾取:光标下有没有可劈的木头 */
export function pickSplittable(
  candidates: SplittableMesh[],
  ndc: THREE.Vector2,
  camera: THREE.Camera,
): SplitTarget | null {
  if (candidates.length === 0) return null;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(candidates, false);
  if (hits.length === 0) return null;
  return { mesh: hits[0].object as SplittableMesh, point: hits[0].point.clone() };
}

/**
 * 劈柴的切割平面。
 *
 * 真实劈柴是顺着木纹竖着劈,所以平面必须包含木头的轴线(本地 Y 轴),
 * 法线一定是水平的。用相机右方向当法线,劈出来的两半正好一左一右
 * 分开,观众看得最清楚。
 */
export function splitPlaneNormal(cameraRight: THREE.Vector3): THREE.Vector3 {
  return cameraRight.clone().setY(0).normalize();
}

/**
 * 沿指定平面把木头劈开。
 *
 * 失败(几何太薄、三角化退化)时返回 null,由调用方决定是保持原状还是换个角度重试 ——
 * 千万不要让一次失败的切割留下半个残缺的 mesh。
 */
export function sliceWood(
  target: SplittableMesh,
  normal: THREE.Vector3,
  origin: THREE.Vector3,
  materials: WoodMaterials,
): DestructibleMesh[] | null {
  const destructible = toDestructible(target, materials);
  destructible.updateMatrixWorld(true);
  const inverse = destructible.matrixWorld.clone().invert();
  const localNormal = normal.clone().transformDirection(inverse).normalize();
  const localOrigin = origin.clone().applyMatrix4(inverse);

  let pieces: DestructibleMesh[];
  try {
    pieces = destructible.slice(localNormal, localOrigin, undefined, (piece) => {
      piece.castShadow = true;
      piece.receiveShadow = true;
      piece.position.copy(destructible.position);
      piece.quaternion.copy(destructible.quaternion);
      piece.scale.copy(destructible.scale);
      rebuildFragment(piece, target, localNormal, localOrigin, materials);
    });
  } catch (err) {
    console.warn("切割失败:", err);
    destructible.geometry?.dispose();
    return null;
  }

  // toDestructible 克隆的几何体用完即释，避免每刀泄漏一份 non-indexed 网格
  destructible.geometry?.dispose();

  if (pieces.length < 2) {
    console.warn(`切割只产出 ${pieces.length} 块,放弃`);
    pieces.forEach((p) => p.geometry?.dispose());
    return null;
  }

  return pieces;
}

/**
 * 把带 side/top/inner 三组的普通 Mesh 包装成 three-pinata 需要的两组：
 * 0=已有外表面（side+top），1=已有切面。包装只操作克隆，不污染场景里的原 mesh。
 */
function toDestructible(target: SplittableMesh, materials: WoodMaterials): DestructibleMesh {
  let geometry = target.geometry.clone();
  if (geometry.index) geometry = geometry.toNonIndexed();
  geometry.computeVertexNormals();

  const groups = geometry.groups;
  if (groups.length >= 3) {
    const outerCount = groups[0].count + groups[1].count;
    const innerCount = groups.slice(2).reduce((sum, group) => sum + group.count, 0);
    geometry.clearGroups();
    geometry.addGroup(0, outerCount, 0);
    geometry.addGroup(outerCount, innerCount, 1);
  }

  const mesh = new DestructibleMesh(geometry, materials.side, materials.inner);
  mesh.position.copy(target.position);
  mesh.quaternion.copy(target.quaternion);
  mesh.scale.copy(target.scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  Object.assign(mesh.userData, target.userData);
  return mesh;
}

/**
 * three-pinata 只知道“外表面/切面”两类。这里按原站 vT 的规则重新拆成：
 * 0=side、1=top、2=inner，并为本次新切面重建连续 UV。
 */
function rebuildFragment(
  piece: DestructibleMesh,
  source: SplittableMesh,
  sliceNormal: THREE.Vector3,
  sliceOrigin: THREE.Vector3,
  materials: WoodMaterials,
) {
  const geometry = piece.geometry;
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const index = geometry.getIndex();
  if (!position || !uv) return;

  const side: number[] = [];
  const top: number[] = [];
  const inner: number[] = [];
  const sideUv: number[] = [];
  const topUv: number[] = [];
  const innerUv: number[] = [];

  const radius = ((source.userData.radius as number | undefined) ?? 6) * INCH;
  const height = ((source.userData.height as number | undefined) ?? 16) * INCH;
  const originalOffset =
    (source.userData.originalCenterOffset as THREE.Vector3 | undefined)?.clone() ??
    new THREE.Vector3();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(sliceNormal, sliceOrigin);
  const vertical = new THREE.Vector3(0, 1, 0)
    .addScaledVector(sliceNormal, -sliceNormal.y)
    .normalize();
  if (vertical.lengthSq() < 1e-6) vertical.set(0, 1, 0);
  const horizontal = new THREE.Vector3().crossVectors(sliceNormal, vertical).normalize();

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const p = new THREE.Vector3();

  for (const group of geometry.groups) {
    const end = group.start + group.count;
    for (let cursor = group.start; cursor < end; cursor += 3) {
      const ia = index ? index.getX(cursor) : cursor;
      const ib = index ? index.getX(cursor + 1) : cursor + 1;
      const ic = index ? index.getX(cursor + 2) : cursor + 2;
      a.fromBufferAttribute(position, ia);
      b.fromBufferAttribute(position, ib);
      c.fromBufferAttribute(position, ic);
      faceNormal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize();

      const isTop = Math.abs(faceNormal.y) > 0.95;
      const isInner = !isTop && group.materialIndex === 1;
      const vertices = [ia, ib, ic];
      const positions = isTop ? top : isInner ? inner : side;
      const uvs = isTop ? topUv : isInner ? innerUv : sideUv;
      const isNewCut =
        isInner &&
        vertices.every((vertex) => {
          p.fromBufferAttribute(position, vertex);
          return Math.abs(plane.distanceToPoint(p)) < CUT_EPSILON;
        });

      for (const vertex of vertices) {
        p.fromBufferAttribute(position, vertex);
        const original = p.clone().add(originalOffset);
        if (Math.abs(plane.distanceToPoint(p)) < CUT_EPSILON) {
          const noise =
            (Math.sin(original.y * 40) * 0.6 +
              Math.cos((original.x + original.z) * 52) * 0.4) *
            CUT_SURFACE_NOISE;
          p.addScaledVector(sliceNormal, noise);
        }
        positions.push(p.x, p.y, p.z);

        if (isTop) {
          uvs.push(original.x / (radius * 2) + 0.5, original.z / (radius * 2) + 0.5);
        } else if (isNewCut) {
          uvs.push(
            original.dot(horizontal) / (radius * 2) + 0.5,
            original.dot(vertical) / height + 0.5,
          );
        } else {
          uvs.push(uv.getX(vertex), uv.getY(vertex));
        }
      }
    }
  }

  const rebuilt = new THREE.BufferGeometry();
  const positions = [...side, ...top, ...inner];
  const uvs = [...sideUv, ...topUv, ...innerUv];
  rebuilt.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  rebuilt.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  rebuilt.addGroup(0, side.length / 3, 0);
  rebuilt.addGroup(side.length / 3, top.length / 3, 1);
  rebuilt.addGroup((side.length + top.length) / 3, inner.length / 3, 2);
  rebuilt.computeVertexNormals();
  rebuilt.computeBoundingBox();

  const center = rebuilt.boundingBox!.getCenter(new THREE.Vector3());
  rebuilt.translate(-center.x, -center.y, -center.z);
  const worldOffset = center.clone().applyQuaternion(piece.quaternion).multiply(piece.scale);
  piece.position.add(worldOffset);
  piece.geometry.dispose();
  piece.geometry = rebuilt;
  piece.material = [materials.side, materials.top, materials.inner];

  const volumeInches = geometryVolumeInches(rebuilt);
  const isFirewood = classifyFragment(
    volumeInches,
    horizontalAspectRatio(rebuilt),
  ).isFirewood;
  Object.assign(piece.userData, {
    volumeInches,
    isLog: true,
    isSplittable: !isFirewood,
    isFirewood,
    sideMaterial: materials.side,
    topMaterial: materials.top,
    innerMaterial: materials.inner,
    radius: source.userData.radius,
    height: source.userData.height,
    originalCenterOffset: originalOffset
      .add(center.clone().applyQuaternion(piece.quaternion.clone().invert()).divide(piece.scale)),
  });
}

export function classifyFragment(volumeInches: number, aspectRatio: number) {
  const rescued =
    volumeInches > FIREWOOD_ABSOLUTE_VOLUME &&
    volumeInches <= FIREWOOD_MAX_VOLUME &&
    aspectRatio > RESCUE_ASPECT_RATIO;
  const isFirewood = volumeInches <= FIREWOOD_MAX_VOLUME && !rescued;
  return { isFirewood, isSplittable: !isFirewood, rescued };
}

/** 原站用包围盒体积 × 0.7 估算碎块体积，再换算为立方英寸。 */
export function geometryVolumeInches(geometry: THREE.BufferGeometry): number {
  geometry.computeBoundingBox();
  if (!geometry.boundingBox) return 0;
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  return (size.x * size.y * size.z * 0.7) / INCH ** 3;
}

/** 用 XZ 顶点协方差的主轴估算水平截面长宽比，对齐原站 hT。 */
export function horizontalAspectRatio(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute("position");
  if (!position || position.count === 0) return 1;
  let meanX = 0;
  let meanZ = 0;
  for (let i = 0; i < position.count; i++) {
    meanX += position.getX(i);
    meanZ += position.getZ(i);
  }
  meanX /= position.count;
  meanZ /= position.count;

  let xx = 0;
  let xz = 0;
  let zz = 0;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) - meanX;
    const z = position.getZ(i) - meanZ;
    xx += x * x;
    xz += x * z;
    zz += z * z;
  }
  const trace = xx + zz;
  const determinant = xx * zz - xz * xz;
  const eigen = (trace + Math.sqrt(Math.max(0, trace * trace - 4 * determinant))) / 2;
  let axisX = 1;
  let axisZ = 0;
  if (Math.abs(xz) > 1e-10) {
    axisX = xz;
    axisZ = eigen - xx;
    const length = Math.hypot(axisX, axisZ);
    axisX /= length;
    axisZ /= length;
  }
  const crossX = -axisZ;
  const crossZ = axisX;
  let minA = Infinity;
  let maxA = -Infinity;
  let minB = Infinity;
  let maxB = -Infinity;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) - meanX;
    const z = position.getZ(i) - meanZ;
    const pa = x * axisX + z * axisZ;
    const pb = x * crossX + z * crossZ;
    minA = Math.min(minA, pa);
    maxA = Math.max(maxA, pa);
    minB = Math.min(minB, pb);
    maxB = Math.max(maxB, pb);
  }
  const width = maxA - minA;
  const depth = maxB - minB;
  return width < 1e-10 || depth < 1e-10 ? 1 : Math.max(width, depth) / Math.min(width, depth);
}

/** 将世界点击点修正为原站约束后的世界切点。 */
export function computeSplitPoint(
  mesh: SplittableMesh,
  worldHit: THREE.Vector3,
  worldNormal: THREE.Vector3,
): THREE.Vector3 {
  mesh.updateMatrixWorld(true);
  const inverse = mesh.matrixWorld.clone().invert();
  const localHit = worldHit.clone().applyMatrix4(inverse);
  const localNormal = worldNormal.clone().transformDirection(inverse).normalize();
  const localPoint = constrainedLocalSplitPoint(mesh, localHit, localNormal);
  return localPoint.applyMatrix4(mesh.matrixWorld);
}

/**
 * Axe VFX contact point: keep the split's XZ, but seat the tip on the piece's
 * world-space TOP end-grain (bbox max.y).
 *
 * `computeSplitPoint` returns the mesh center for small pieces (volume ≤ 2×
 * firewood). Playing the axe from that center plastered the cheek mid-face on
 * rectangular halves — the live 体验版 boss fail — while the harness always
 * seeked the intact log's top and falsely PASSed.
 */
export function axeContactPoint(mesh: SplittableMesh, splitPoint: THREE.Vector3): THREE.Vector3 {
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  const topY = Number.isFinite(box.max.y) ? box.max.y : splitPoint.y;
  return new THREE.Vector3(splitPoint.x, topY, splitPoint.z);
}

function constrainedLocalSplitPoint(
  mesh: SplittableMesh,
  localHit: THREE.Vector3,
  normal: THREE.Vector3,
): THREE.Vector3 {
  const volume = (mesh.userData.volumeInches as number | undefined) ?? geometryVolumeInches(mesh.geometry);
  mesh.geometry.computeBoundingBox();
  const center = mesh.geometry.boundingBox!.getCenter(new THREE.Vector3());
  if (volume <= FIREWOOD_MAX_VOLUME * 2) return center;

  const position = mesh.geometry.getAttribute("position");
  let min = Infinity;
  let max = -Infinity;
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    const projection = p.sub(center).dot(normal);
    min = Math.min(min, projection);
    max = Math.max(max, projection);
  }
  const thickness = max - min;
  if (thickness < 0.001) return localHit.clone();

  const hitProjection = localHit.clone().sub(center).dot(normal);
  let ratio = THREE.MathUtils.clamp((hitProjection - min) / thickness, 0.01, 0.99);
  if (volume * ratio < FIREWOOD_MAX_VOLUME) ratio = FIREWOOD_MAX_VOLUME / volume;
  if (volume * (1 - ratio) < FIREWOOD_MAX_VOLUME) ratio = 1 - FIREWOOD_MAX_VOLUME / volume;
  const minimumRatio = MIN_HALF_THICKNESS_IN / (thickness / INCH);
  if (minimumRatio < 0.5) {
    ratio = THREE.MathUtils.clamp(ratio, minimumRatio, 1 - minimumRatio);
  }

  const result = center.clone().addScaledVector(normal, min + ratio * thickness);
  result.y = localHit.y;
  return result;
}

/** 当前相机方向下的世界投影厚度是否小于原站的 5 英寸阈值。 */
export function isTooThinToSplit(mesh: SplittableMesh, worldNormal: THREE.Vector3): boolean {
  mesh.updateMatrixWorld(true);
  const position = mesh.geometry.getAttribute("position");
  const normal = worldNormal.clone().normalize();
  const point = new THREE.Vector3();
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    const projection = point.dot(normal);
    min = Math.min(min, projection);
    max = Math.max(max, projection);
  }
  return (max - min) / INCH < MIN_HALF_THICKNESS_IN * 2;
}

/**
 * 木块的世界重心。
 *
 * 注意 three-pinata 切完不做重心归零 —— 碎块沿用母体的 transform,
 * 几何体里存的还是原坐标。所以 mesh.position 对所有碎块都一样,
 * 要判断谁在左谁在右,必须走包围盒。
 */
export function worldCenter(mesh: THREE.Mesh, target = new THREE.Vector3()): THREE.Vector3 {
  mesh.geometry.computeBoundingBox();
  mesh.geometry.boundingBox!.getCenter(target);
  mesh.updateMatrixWorld();
  return target.applyMatrix4(mesh.matrixWorld);
}

/** 木块的世界尺寸,码垛和物理都要用 */
export function measure(mesh: THREE.Mesh): THREE.Vector3 {
  mesh.geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  mesh.geometry.boundingBox!.getSize(size);
  return size.multiply(mesh.scale);
}

/** 木块最长的那条边有多长 —— 用来判断它还值不值得再劈一次 */
export function longestEdge(mesh: THREE.Mesh): number {
  const s = measure(mesh);
  return Math.max(s.x, s.y, s.z);
}

/** 最短边。太薄的木片再劈就会产生退化三角形,直接筛掉。 */
export function shortestEdge(mesh: THREE.Mesh): number {
  const s = measure(mesh);
  return Math.min(s.x, s.y, s.z);
}
