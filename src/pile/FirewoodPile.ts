import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GROUND_Y, INCH, PILE } from "../config/constants";
import type { WoodMaterials } from "../wood/materials";
import {
  settleBatch,
  type BatchPlacement,
  type SettledShape,
  type SlotLayout,
} from "./stackSolver";

const UP = new THREE.Vector3(0, 1, 0);
const SLOT_SPACING = 5 * INCH;
const MAX_BRIDGE_HEIGHT = 18 * INCH;

interface StackAnimation {
  mesh: THREE.Mesh;
  endPos: THREE.Vector3;
  endQuat: THREE.Quaternion;
  height: number;
  startTime: number;
  duration: number;
  apexBaseHeight: number;
  startPos?: THREE.Vector3;
  startQuat?: THREE.Quaternion;
  apexHeight?: number;
  flipAxis?: THREE.Vector3;
  rockSign?: number;
  grabbed: boolean;
  landed: boolean;
  done: boolean;
}

export interface PileOptions {
  scene: THREE.Scene;
  materials: WoodMaterials;
  /** 木块落位时回调,用来放音效 */
  onLand?: () => void;
}

/**
 * 围着树桩码柴堆。
 *
 * 摆法是「一垛一垛沿圆弧排开」:每块柴的长轴指向树桩(所以观众看到的是端面),
 * 沿弧长方向一块挨一块,摞满一行往上摞,摞满一层就整体往外退一圈开新的一层。
 *
 * 每块柴具体停在哪由 stackSolver 的二维物理算,不是硬编码的网格 ——
 * 所以木块会有自然的歪斜和高低差,而不是像砖墙一样死板。
 */
export class FirewoodPile {
  private readonly scene: THREE.Scene;
  private readonly onLand?: () => void;
  /** 与原木一致的 side / top / inner 三材质 */
  private materials: THREE.Material[];

  private tierLevel = 0;
  private startAngle = PILE.startAngle;
  private readonly filledSlots = new Set<string>();
  private readonly slotTops = new Map<string, number>();
  private maxGx = -1;
  private minGx = 1;
  private maxPhysicalHeight = 0;
  private settledPieces: SettledShape[] = [];
  private needsTierAdvance = false;
  private animations: StackAnimation[] = [];
  private onPieceGrabbed: ((mesh: THREE.Mesh) => void) | null = null;
  private onComplete: (() => void) | null = null;
  isAnimating = false;

  /** 已经落位、等待合并的木块 */
  private readonly pending: THREE.Mesh[] = [];
  /** 合并后的静态柴堆,整垛只占一个 draw call */
  private merged: THREE.Mesh | null = null;

  constructor({ scene, materials, onLand }: PileOptions) {
    this.scene = scene;
    this.onLand = onLand;
    this.materials = [materials.side, materials.top, materials.inner];
  }

  get height(): number {
    return this.maxPhysicalHeight;
  }

  get layout(): Readonly<SettledShape[]> {
    return this.settledPieces;
  }

  startStacking(
    pieces: THREE.Mesh[],
    onPieceGrabbed?: (mesh: THREE.Mesh) => void,
    onComplete?: () => void,
  ) {
    if (pieces.length === 0) {
      onComplete?.();
      return;
    }
    if (this.needsTierAdvance) {
      this.advanceTier();
      this.needsTierAdvance = false;
    }

    const layouts = pieces.map((piece) => this.getSlotLayout(piece));
    const radius = PILE.radiusIn * INCH + this.tierLevel * PILE.tierDepthIn * INCH;
    const arcLength = PILE.arcSpan * radius;
    if (layouts.some((layout) => Math.abs(layout.slotX * SLOT_SPACING) >= arcLength)) {
      this.needsTierAdvance = true;
    }

    const { placements, settled } = settleBatch(layouts, this.settledPieces);
    this.settledPieces = settled;
    this.refreshSlotHeights(layouts, placements);

    this.isAnimating = true;
    this.animations = [];
    this.onPieceGrabbed = onPieceGrabbed ?? null;
    this.onComplete = onComplete ?? null;
    const stagger = pieces.length > 1 ? 300 / (pieces.length - 1) : 0;
    const apexBaseHeight = this.height + 12 * INCH;

    pieces.forEach((mesh, index) => {
      const pose = this.simToWorld(placements[index]);
      this.animations.push({
        mesh,
        endPos: pose.position,
        endQuat: pose.quaternion,
        height: placements[index].crossSection.height,
        startTime: performance.now() + index * stagger,
        duration: 500,
        apexBaseHeight,
        grabbed: false,
        landed: false,
        done: false,
      });
    });
  }

  update() {
    if (!this.isAnimating) return;
    const now = performance.now();
    let allDone = true;
    for (const animation of this.animations) {
      if (animation.done) continue;
      if (now < animation.startTime) {
        allDone = false;
        continue;
      }
      if (!animation.grabbed) this.beginAnimation(animation);

      const totalDuration = animation.duration * 1.6;
      const progress = Math.min((now - animation.startTime) / totalDuration, 1);
      if (progress >= 1) {
        animation.mesh.position.copy(animation.endPos);
        animation.mesh.quaternion.copy(animation.endQuat);
        animation.done = true;
        continue;
      }
      allDone = false;
      this.updateAnimation(animation, progress);
    }

    if (allDone) {
      this.isAnimating = false;
      this.pending.push(...this.animations.map(({ mesh }) => mesh));
      this.flush();
      this.animations = [];
      this.onComplete?.();
      this.onComplete = null;
    }
  }

  private getValidSlot() {
    if (this.filledSlots.size === 0) return { x: 0, y: 0 };
    const candidates = [{ x: this.minGx - 1, y: 0 }];
    for (const key of this.filledSlots) {
      const [xText, yText] = key.split(",");
      const x = Number(xText);
      const y = Number(yText);
      const leftKey = `${(x - 1).toFixed(1)},${y}`;
      if (!this.filledSlots.has(leftKey)) continue;
      const upperX = x - 0.5;
      const upperY = y + 1;
      const upperKey = `${upperX.toFixed(1)},${upperY}`;
      if (this.filledSlots.has(upperKey)) continue;
      const rightTop = this.slotTops.get(`${x.toFixed(1)},${y}`) ?? 0;
      const leftTop = this.slotTops.get(leftKey) ?? 0;
      if (Math.max(rightTop, leftTop) < MAX_BRIDGE_HEIGHT) {
        candidates.push({ x: upperX, y: upperY });
      }
    }
    candidates.sort((a, b) => b.y - a.y || Math.abs(a.x) - Math.abs(b.x));
    return candidates[0];
  }

  private getSlotLayout(piece: THREE.Mesh): SlotLayout {
    piece.geometry.computeBoundingBox();
    const size = piece.geometry.boundingBox!.getSize(new THREE.Vector3());
    const thickness = Math.min(size.x, size.z);
    const isXThinner = size.x < size.z;
    const slot = this.getValidSlot();
    const key = `${slot.x.toFixed(1)},${slot.y}`;
    let physicalBaseY = 0;
    if (slot.y > 0) {
      physicalBaseY = Math.max(
        this.slotTops.get(`${(slot.x - 0.5).toFixed(1)},${slot.y - 1}`) ?? 0,
        this.slotTops.get(`${(slot.x + 0.5).toFixed(1)},${slot.y - 1}`) ?? 0,
      );
    }
    this.filledSlots.add(key);
    this.slotTops.set(key, physicalBaseY + thickness);
    this.maxGx = Math.max(this.maxGx, slot.x);
    this.minGx = Math.min(this.minGx, slot.x);
    this.maxPhysicalHeight = Math.max(
      this.maxPhysicalHeight,
      physicalBaseY + thickness,
    );
    return {
      piece,
      slotX: slot.x,
      slotGridY: slot.y,
      physicalBaseY,
      thickness,
      isXThinner,
      tierLevel: this.tierLevel,
      startAngle: this.startAngle,
    };
  }

  private refreshSlotHeights(layouts: SlotLayout[], placements: BatchPlacement[]) {
    layouts.forEach((layout, index) => {
      const placement = placements[index];
      const top = placement.simY + placement.crossSection.height / 2;
      const key = `${layout.slotX.toFixed(1)},${layout.slotGridY}`;
      this.slotTops.set(key, top);
      this.maxPhysicalHeight = Math.max(this.maxPhysicalHeight, top);
    });
  }

  private simToWorld(placement: BatchPlacement) {
    const tierOffset = placement.tierLevel * PILE.tierDepthIn * INCH;
    const angle =
      placement.startAngle +
      placement.simX / (PILE.radiusIn * INCH + tierOffset);
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const tangent = new THREE.Vector3().crossVectors(UP, radial).normalize();
    const position = radial.clone().multiplyScalar(PILE.radiusIn * INCH + tierOffset);
    position.y = GROUND_Y + placement.simY;
    position.addScaledVector(radial, (Math.random() - 0.5) * 2 * INCH);

    const basis = new THREE.Matrix4();
    if (placement.isXThinner) basis.makeBasis(UP, radial, tangent);
    else basis.makeBasis(tangent.clone().negate(), radial, UP);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);
    quaternion.premultiply(
      new THREE.Quaternion().setFromAxisAngle(radial, placement.simAngle),
    );
    quaternion.premultiply(
      new THREE.Quaternion().setFromAxisAngle(UP, Math.PI),
    );
    return { position, quaternion };
  }

  private beginAnimation(animation: StackAnimation) {
    animation.grabbed = true;
    this.onPieceGrabbed?.(animation.mesh);
    animation.startPos = animation.mesh.position.clone();
    animation.startQuat = animation.mesh.quaternion.clone();
    animation.apexHeight = Math.max(
      animation.apexBaseHeight,
      animation.startPos.y + 0.5,
    );
    const direction = animation.endPos
      .clone()
      .sub(animation.startPos)
      .setY(0);
    if (direction.length() < 0.001) direction.set(1, 0, 0);
    direction.normalize();
    animation.flipAxis = new THREE.Vector3(-direction.z, 0, direction.x);
    animation.rockSign = Math.random() < 0.5 ? 1 : -1;
  }

  private updateAnimation(animation: StackAnimation, progress: number) {
    const flyEnd = 0.55;
    const landEnd = 0.75;
    const reboundEnd = 0.92;
    const rock = THREE.MathUtils.degToRad(10);
    if (progress < flyEnd) {
      const t = progress / flyEnd;
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const position = animation.startPos!.clone().lerp(animation.endPos, eased);
      position.y += 4 * animation.apexHeight! * t * (1 - t);
      animation.mesh.position.copy(position);
      const flip = new THREE.Quaternion().setFromAxisAngle(
        animation.flipAxis!,
        eased * Math.PI * 4,
      );
      animation.mesh.quaternion.slerpQuaternions(
        animation.startQuat!,
        animation.endQuat,
        eased,
      );
      animation.mesh.quaternion.premultiply(flip);
    } else if (progress < landEnd) {
      if (!animation.landed) {
        animation.landed = true;
        this.onLand?.();
      }
      const t = (progress - flyEnd) / (landEnd - flyEnd);
      animation.mesh.position.copy(animation.endPos);
      animation.mesh.position.y += Math.sin(t * Math.PI) * animation.height;
      animation.mesh.quaternion.copy(animation.endQuat);
      animation.mesh.quaternion.premultiply(
        new THREE.Quaternion().setFromAxisAngle(
          animation.flipAxis!,
          Math.sin(t * Math.PI * 2) * rock * animation.rockSign!,
        ),
      );
    } else if (progress < reboundEnd) {
      const t = (progress - landEnd) / (reboundEnd - landEnd);
      animation.mesh.position.copy(animation.endPos);
      animation.mesh.position.y += Math.sin(t * Math.PI) * animation.height * 0.15;
      animation.mesh.quaternion.copy(animation.endQuat);
      animation.mesh.quaternion.premultiply(
        new THREE.Quaternion().setFromAxisAngle(
          animation.flipAxis!,
          Math.sin(t * Math.PI * 2) * rock * 0.3 * animation.rockSign!,
        ),
      );
    } else {
      animation.mesh.position.copy(animation.endPos);
      animation.mesh.quaternion.copy(animation.endQuat);
    }
  }

  private advanceTier() {
    this.tierLevel++;
    this.filledSlots.clear();
    this.slotTops.clear();
    this.maxGx = -1;
    this.minGx = 1;
    this.maxPhysicalHeight = 0;
    this.startAngle = PILE.startAngle;
    this.settledPieces = [];
  }

  /**
   * 把已落位的木块烘成一个静态 mesh。
   *
   * 一垛柴动辄上百块,每块两个材质槽就是两百个 draw call。合并之后不管堆多少,
   * 柴堆永远只有两个。代价是合并后的木块不能再单独动 —— 反正也不需要。
   */
  flush() {
    if (this.pending.length === 0) return;

    // 按材质分桶。mergeGeometries(list, true) 会按几何体序号分配材质，
    // 所以必须先把 side / top / inner 各自合并，再组成固定的三组。
    const side: THREE.BufferGeometry[] = [];
    const top: THREE.BufferGeometry[] = [];
    const inner: THREE.BufferGeometry[] = [];

    const collect = (mesh: THREE.Mesh, bake: boolean) => {
      const geometry = mesh.geometry.clone();
      if (bake) {
        mesh.updateMatrixWorld(true);
        geometry.applyMatrix4(mesh.matrixWorld);
      }
      side.push(extractByMaterial(geometry, 0));
      top.push(extractByMaterial(geometry, 1));
      inner.push(extractByMaterial(geometry, 2));
      geometry.dispose();
    };

    // 已合并的那份已经处于世界空间，不要重复应用 matrixWorld。
    if (this.merged) collect(this.merged, false);
    for (const piece of this.pending) collect(piece, true);

    const combined = joinByMaterial(side, top, inner);
    if (!combined) {
      console.warn("柴堆合并失败,保持逐块渲染");
      this.pending.length = 0;
      return;
    }

    const next = new THREE.Mesh(combined, this.materials);
    next.castShadow = true;
    next.receiveShadow = true;
    next.frustumCulled = false;
    this.scene.add(next);

    if (this.merged) {
      this.scene.remove(this.merged);
      this.merged.geometry.dispose();
    }
    for (const piece of this.pending) {
      this.scene.remove(piece);
      piece.geometry.dispose();
    }

    this.merged = next;
    this.pending.length = 0;
  }

  dispose() {
    this.animations = [];
    this.isAnimating = false;
    this.flush();
    if (this.merged) {
      this.scene.remove(this.merged);
      this.merged.geometry.dispose();
      this.merged = null;
    }
  }

  /** 美术套装热换：清视觉并换材质引用（不 dispose 材质本体，由调用方管） */
  setMaterials(materials: WoodMaterials) {
    this.clearVisuals();
    this.materials = [materials.side, materials.top, materials.inner];
  }

  clearVisuals() {
    this.animations = [];
    this.isAnimating = false;
    this.pending.length = 0;
    if (this.merged) {
      this.scene.remove(this.merged);
      this.merged.geometry.dispose();
      this.merged = null;
    }
    this.settledPieces = [];
    this.filledSlots.clear();
    this.slotTops.clear();
    this.tierLevel = 0;
    this.maxGx = -1;
    this.minGx = 1;
    this.maxPhysicalHeight = 0;
  }
}

const MERGE_ATTRIBUTES = ["position", "normal", "uv"] as const;

/**
 * 抽出属于某个材质槽的三角形,输出一个不带索引的独立几何体。
 *
 * 展开成非索引是故意的:这样新几何体只带自己用到的顶点,合并时不会把
 * 另一半材质的顶点也一路拖着走,否则每合并一次内存就要翻倍。
 */
function extractByMaterial(source: THREE.BufferGeometry, materialIndex: number): THREE.BufferGeometry {
  const index = source.getIndex();
  const groups = source.groups.filter((g) => (g.materialIndex ?? 0) === materialIndex);
  // 没有分组信息时,整个几何体都算 0 号槽
  const ranges = source.groups.length === 0 && materialIndex === 0
    ? [{ start: 0, count: index ? index.count : source.attributes.position.count }]
    : groups;

  const picked: number[] = [];
  for (const g of ranges) {
    for (let i = g.start; i < g.start + g.count; i++) picked.push(index ? index.getX(i) : i);
  }

  const out = new THREE.BufferGeometry();
  for (const name of MERGE_ATTRIBUTES) {
    const attr = source.getAttribute(name);
    if (!attr) continue;
    const size = attr.itemSize;
    const data = new Float32Array(picked.length * size);
    picked.forEach((vertexIndex, i) => {
      for (let c = 0; c < size; c++) data[i * size + c] = attr.getComponent(vertexIndex, c);
    });
    out.setAttribute(name, new THREE.BufferAttribute(data, size));
  }
  return out;
}

/** 三组按材质分好的几何体合成一个 mesh：0=side、1=top、2=inner。 */
function joinByMaterial(
  side: THREE.BufferGeometry[],
  top: THREE.BufferGeometry[],
  inner: THREE.BufferGeometry[],
): THREE.BufferGeometry | null {
  const nonEmpty = (list: THREE.BufferGeometry[]) =>
    list.filter((g) => (g.getAttribute("position")?.count ?? 0) > 0);

  const sideMerged = mergeGeometries(nonEmpty(side), false);
  const topMerged = mergeGeometries(nonEmpty(top), false);
  const innerMerged = mergeGeometries(nonEmpty(inner), false);
  [...side, ...top, ...inner].forEach((g) => g.dispose());

  if (!sideMerged) return null;
  const groups = [sideMerged, topMerged, innerMerged].filter(
    (geometry): geometry is THREE.BufferGeometry => geometry !== null,
  );
  const combined = mergeGeometries(groups, true);
  groups.forEach((geometry) => geometry.dispose());
  return combined;
}
