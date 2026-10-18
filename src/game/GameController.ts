import * as THREE from "three";
import type { AxeAnimation } from "../anim/AxeAnimation";
import type { PieceAnimator } from "../anim/PieceAnimator";
import type { AudioManager } from "../audio/AudioManager";
import type { CameraController } from "../camera/CameraController";
import type { DebugLine } from "../debug/DebugLine";
import type { Physics, PhysicsEntry } from "../physics/Physics";
import type { FirewoodPile } from "../pile/FirewoodPile";
import { createLog } from "../wood/logFactory";
import type { WoodMaterials } from "../wood/materials";
import {
  computeSplitPoint,
  isTooThinToSplit,
  pickSplittable,
  sliceWood,
  splitPlaneNormal,
  type SplittableMesh,
} from "../wood/slicer";
import { INCH } from "../config/constants";

export type GameState = "SPAWNING" | "IDLE" | "SPLITTING" | "SETTLING" | "STACKING";

interface LogPiece {
  mesh: SplittableMesh;
}

interface FirewoodPiece {
  mesh: SplittableMesh;
  physicsEntry: PhysicsEntry | null;
}

interface PendingSplit {
  piece: LogPiece;
  worldPoint: THREE.Vector3;
  sliceNormal: THREE.Vector3;
  timer: number;
}

interface SettleCandidate {
  mesh: SplittableMesh;
  desiredX: number;
  desiredZ: number;
  hull: THREE.Vector2[];
  yAngle: number;
  popHeight: number;
  delayMs: number;
  tiltMultiplier: number;
  isStationary?: boolean;
}

export interface EconomyHooks {
  /** 是否允许主动劈（日额度 > 0 且 UI 未挡） */
  canActiveChop: () => boolean;
  /** 入垛后是否禁止再刷出下一根（额度耗尽） */
  shouldBlockSpawn?: () => boolean;
  /** 当前根按几何规则劈完并开始入垛时回调（计 1 树根） */
  onRootStacked: () => void;
  /** 额度耗尽时回调 */
  onQuotaBlocked?: () => void;
  /** 一次有效劈砍结算（引导用） */
  onChopSettled?: () => void;
}

export interface GameDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controller: CameraController;
  debugLine: DebugLine;
  physics: Physics;
  animator: PieceAnimator;
  pile: FirewoodPile;
  axe: AxeAnimation;
  audio: AudioManager;
  materials: WoodMaterials;
  stumpTopY: number;
  economy?: EconomyHooks;
}

// materials 在热换时会被替换；deps 保持可变引用

/**
 * 游戏主循环的状态机。
 *
 *   SPAWNING ──→ IDLE ──点击──→ SPLITTING ──┐
 *                 ↑                          │还有能劈的
 *                 └──────────────────────────┘
 *                 ↑                          │劈完了
 *              SPAWNING ←── STACKING ←── SETTLING
 *
 * 分状态的意义在于:劈砍动画播到一半时不能再接受点击,木块还在地上滚的时候
 * 不能开始码垛。这些时序约束用一个显式状态机表达,比散在各处的布尔标志清楚得多。
 */
export class GameController {
  private readonly d: GameDeps;
  private state: GameState = "SPAWNING";
  private timer = 0;

  private logPieces: LogPiece[] = [];
  private firewoodPieces: FirewoodPiece[] = [];
  private firewoodOnGround: FirewoodPiece[] = [];
  private pendingSplit: PendingSplit | null = null;
  private stacked = 0;
  private lastSplitTime = 0;
  /** 当前树根已有效刀数（仅诊断；不参与伐倒判定） */
  private chopsOnRoot = 0;
  private rootsFelled = 0;

  constructor(deps: GameDeps) {
    this.d = deps;
    this.spawn();
  }

  setEconomyHooks(hooks: EconomyHooks | undefined) {
    this.d.economy = hooks;
  }

  get rootsFelledCount(): number {
    return this.rootsFelled;
  }

  get chopsOnCurrentRoot(): number {
    return this.chopsOnRoot;
  }

  get currentState(): GameState {
    return this.state;
  }

  /** 累计码进柴堆的木块数 */
  get stackedCount(): number {
    return this.stacked;
  }

  get diagnostics() {
    return {
      state: this.state,
      splittable: this.getSplittablePieces().length,
      firewoodFlying: this.firewoodPieces.length,
      firewoodReady: this.firewoodOnGround.length,
      pendingSplit: this.pendingSplit !== null,
      volumes: this.logPieces.map(({ mesh }) => Number(mesh.userData.volumeInches ?? 0)),
    };
  }

  private spawn() {
    if (this.d.economy?.shouldBlockSpawn?.()) {
      this.d.economy.onQuotaBlocked?.();
      this.state = "IDLE";
      this.logPieces = [];
      this.firewoodPieces = [];
      this.firewoodOnGround = [];
      this.pendingSplit = null;
      this.chopsOnRoot = 0;
      return;
    }
    const { materials, scene, animator, audio } = this.d;
    const log = createLog(materials);
    log.mesh.position.set(0, 6 * INCH, 0);
    scene.add(log.mesh);
    animator.animateDrop(log.mesh, 6, () => audio.play("drop", 0.45));
    this.logPieces = [{ mesh: log.mesh }];
    this.firewoodPieces = [];
    this.firewoodOnGround = [];
    this.pendingSplit = null;
    this.chopsOnRoot = 0;
    this.state = "SPAWNING";
  }

  getSplittablePieces(): LogPiece[] {
    return this.logPieces.filter(
      ({ mesh }) => mesh.userData.isSplittable && !mesh.userData.isFirewood,
    );
  }

  private raycastForSplittable(ndc: THREE.Vector2) {
    const pieces = this.getSplittablePieces();
    const hit = pickSplittable(
      pieces.map(({ mesh }) => mesh),
      ndc,
      this.d.camera,
    );
    if (!hit) return null;
    const piece = pieces.find(({ mesh }) => mesh === hit.mesh);
    return piece ? { piece, point: hit.point } : null;
  }

  private performSplit(
    logPiece: LogPiece,
    point: THREE.Vector3,
    normal: THREE.Vector3,
  ) {
    const { scene, controller, audio, materials, animator, physics, camera } = this.d;
    this.state = "SPLITTING";
    const pieces = sliceWood(logPiece.mesh, normal, point, materials);
    if (!pieces) {
      this.state = "IDLE";
      return;
    }

    controller.triggerShake();

    scene.remove(logPiece.mesh);
    logPiece.mesh.geometry.dispose();
    this.logPieces = this.logPieces.filter((piece) => piece !== logPiece);

    const thrown: Array<{ mesh: SplittableMesh; pushDir: THREE.Vector3 }> = [];
    const settling: SettleCandidate[] = [];
    for (const piece of pieces) {
      scene.add(piece);
      const pushDir = new THREE.Vector3(
        piece.position.x - point.x,
        0,
        piece.position.z - point.z,
      );
      if (pushDir.length() < 0.001) pushDir.set(1, 0, 0);
      pushDir.normalize();

      if (piece.userData.isFirewood) {
        thrown.push({ mesh: piece, pushDir });
      } else {
        const yAngle = THREE.MathUtils.degToRad((Math.random() - 0.5) * 4);
        piece.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yAngle);
        settling.push({
          mesh: piece,
          desiredX: piece.position.x + pushDir.x * INCH,
          desiredZ: piece.position.z + pushDir.z * INCH,
          hull: planarHull(piece),
          yAngle,
          popHeight: 2,
          delayMs: 0,
          tiltMultiplier: 1,
        });
        this.logPieces.push({ mesh: piece });
      }
    }

    animator.finishAnimationsForMeshes(this.logPieces.map(({ mesh }) => mesh));
    this.addNeighborReactions(point, pieces, settling);
    resolvePlanarOverlaps(settling, 12 * INCH, 0.5 * INCH);

    for (const candidate of settling) {
      const direction = new THREE.Vector3(
        candidate.desiredX - candidate.mesh.position.x,
        0,
        candidate.desiredZ - candidate.mesh.position.z,
      );
      const distanceIn = direction.length() / INCH;
      if (candidate.isStationary && distanceIn < 0.04) continue;
      if (distanceIn < 1e-4) continue;
      direction.normalize();
      animator.animate(
        candidate.mesh,
        direction,
        distanceIn,
        candidate.isStationary ? 0.3 : candidate.popHeight,
        candidate.isStationary ? 0 : candidate.delayMs,
        candidate.isStationary ? 0.3 : candidate.tiltMultiplier,
        undefined,
        candidate.yAngle,
      );
    }

    for (const { mesh, pushDir } of thrown) {
      mesh.userData.isFirewood = true;
      mesh.userData.isSplittable = false;
      mesh.position.addScaledVector(pushDir, 3 * INCH);
      mesh.position.y += 2 * INCH;
      const entry = physics.addBody(mesh, 0.5);
      const linearImpulse = new THREE.Vector3(
        pushDir.x * 24 * INCH,
        12 * INCH,
        pushDir.z * 24 * INCH,
      );
      const cameraForward = new THREE.Vector3();
      camera.getWorldDirection(cameraForward);
      const right = controller.getRight();
      const sign = Math.sign(pushDir.x * right.x + pushDir.z * right.z);
      const spin = 8 + Math.random() * 6;
      const angularVelocity = new THREE.Vector3(
        cameraForward.x * spin * sign,
        cameraForward.y * spin * sign + (Math.random() - 0.5) * 3,
        cameraForward.z * spin * sign,
      );
      physics.applyThrowImpulse(entry, linearImpulse, angularVelocity);
      this.firewoodPieces.push({ mesh, physicsEntry: entry });
    }

    audio.play(thrown.length > 0 ? "splitBreak" : "split", thrown.length > 0 ? 0.6 : 0.8);
    this.chopsOnRoot += 1;
    this.state = "SETTLING";
    this.lastSplitTime = performance.now();
    this.d.economy?.onChopSettled?.();
  }

  private addNeighborReactions(
    splitPoint: THREE.Vector3,
    newPieces: SplittableMesh[],
    settling: SettleCandidate[],
  ) {
    const newSet = new Set(newPieces);
    const staggerDistance = 24 * INCH;
    for (const { mesh } of this.logPieces) {
      if (newSet.has(mesh) || !mesh.userData.isSplittable || mesh.userData.isFirewood) continue;
      const dx = mesh.position.x - splitPoint.x;
      const dz = mesh.position.z - splitPoint.z;
      const distance = Math.hypot(dx, dz);
      const reaction = Math.max(0, 1 - distance / (15 * INCH));
      const push = 0.5 * reaction * INCH;
      const direction =
        distance < 0.001 * INCH
          ? new THREE.Vector2().set(Math.random() - 0.5, Math.random() - 0.5).normalize()
          : new THREE.Vector2(dx / distance, dz / distance);
      const yAngle = new THREE.Euler().setFromQuaternion(mesh.quaternion, "YXZ").y;
      if (push >= 0.001) {
        settling.push({
          mesh,
          desiredX: mesh.position.x + direction.x * push,
          desiredZ: mesh.position.z + direction.y * push,
          hull: planarHull(mesh),
          yAngle,
          popHeight: 2 * reaction,
          delayMs: Math.min(distance / staggerDistance, 1) * 150,
          tiltMultiplier: reaction,
        });
      }
    }

    for (const { mesh } of this.logPieces) {
      if (settling.some((candidate) => candidate.mesh === mesh)) continue;
      if (!mesh.userData.isSplittable || mesh.userData.isFirewood) continue;
      settling.push({
        mesh,
        desiredX: mesh.position.x,
        desiredZ: mesh.position.z,
        hull: planarHull(mesh),
        yAngle: new THREE.Euler().setFromQuaternion(mesh.quaternion, "YXZ").y,
        popHeight: 0,
        delayMs: 0,
        tiltMultiplier: 0,
        isStationary: true,
      });
    }
  }

  private startStacking() {
    const { physics, pile } = this.d;
    this.state = "STACKING";
    // 原版：仅在无可劈块时入垛；不再 early force-fell / convertRemaining
    const pieces = [...this.firewoodOnGround];
    for (const log of this.logPieces) {
      if (log.mesh.userData.isFirewood) pieces.push({ mesh: log.mesh, physicsEntry: null });
    }
    this.logPieces = this.logPieces.filter(({ mesh }) => !mesh.userData.isFirewood);
    this.firewoodOnGround = [];
    pile.startStacking(
      pieces.map(({ mesh }) => mesh),
      (mesh) => {
        const piece = pieces.find((candidate) => candidate.mesh === mesh);
        if (piece?.physicsEntry) {
          physics.removeBody(piece.physicsEntry);
          piece.physicsEntry = null;
        }
      },
    );
    this.stacked += pieces.length;
    // 几何劈完 → 入垛即计 1 树根（不要求固定刀数）
    this.rootsFelled += 1;
    this.d.economy?.onRootStacked();
    this.chopsOnRoot = 0;
  }

  update(dt: number) {
    this.timer += dt;

    switch (this.state) {
      case "SPAWNING":
        if (this.d.animator.allDone()) this.state = "IDLE";
        break;
      case "IDLE":
      case "SETTLING": {
        this.handleInput(dt);
        this.updateHover();
        if (this.state === "SETTLING") {
          const animationsDone = this.d.animator.allDone();
          const splittable = this.getSplittablePieces();
          const waitDone =
            splittable.length > 0 || performance.now() - this.lastSplitTime >= 500;
          if (animationsDone && waitDone) {
            this.firewoodOnGround.push(...this.firewoodPieces);
            this.firewoodPieces = [];
            if (splittable.length === 0) this.startStacking();
            else this.state = "IDLE";
          }
        }
        break;
      }
      case "SPLITTING":
        break;
      case "STACKING": {
        if (!this.d.pile.isAnimating) this.spawn();
        break;
      }
    }
  }

  private handleInput(dt: number) {
    const click = this.d.controller.consumeClickPosition();
    if (click) {
      if (this.pendingSplit || this.state === "SETTLING") {
        // 与原站一致：SETTLING 中消费点击但不触发动作。
      } else if (this.d.economy && !this.d.economy.canActiveChop()) {
        this.d.economy.onQuotaBlocked?.();
      } else {
        const hit = this.raycastForSplittable(click);
        if (hit) {
          const sliceNormal = splitPlaneNormal(this.d.controller.getRight());
          const worldPoint = computeSplitPoint(hit.piece.mesh, hit.point, sliceNormal);
          this.d.debugLine.hide();
          if (isTooThinToSplit(hit.piece.mesh, sliceNormal)) {
            this.d.controller.nudgeAzimuth(click.x < 0 ? -1 : 1);
          } else {
            this.d.axe.playFromImpact(worldPoint, sliceNormal);
            this.pendingSplit = {
              piece: hit.piece,
              worldPoint,
              sliceNormal,
              timer: 0.1,
            };
          }
        }
      }
    }

    if (this.pendingSplit) {
      this.pendingSplit.timer -= dt;
      if (this.pendingSplit.timer <= 0) {
        const pending = this.pendingSplit;
        this.pendingSplit = null;
        this.performSplit(pending.piece, pending.worldPoint, pending.sliceNormal);
      }
    }
  }

  private updateHover() {
    const hover = this.d.controller.getHoverNdc();
    if (!hover) return this.d.debugLine.hide();
    const hit = this.raycastForSplittable(hover);
    if (!hit) return this.d.debugLine.hide();
    const normal = splitPlaneNormal(this.d.controller.getRight());
    const point = computeSplitPoint(hit.piece.mesh, hit.point, normal);
    this.d.debugLine.update(point, hit.piece.mesh, normal);
  }

  /** 开发期自动化入口：把屏幕中心当点击位置。 */
  handleClick() {
    if (this.state !== "IDLE" || this.pendingSplit) return;
    if (this.d.economy && !this.d.economy.canActiveChop()) {
      this.d.economy.onQuotaBlocked?.();
      return;
    }
    const hit = this.raycastForSplittable(new THREE.Vector2());
    if (!hit) return;
    const normal = splitPlaneNormal(this.d.controller.getRight());
    const point = computeSplitPoint(hit.piece.mesh, hit.point, normal);
    if (isTooThinToSplit(hit.piece.mesh, normal)) return;
    this.d.axe.playFromImpact(point, normal);
    this.pendingSplit = { piece: hit.piece, worldPoint: point, sliceNormal: normal, timer: 0.1 };
  }

  dispose() {
    this.clearWorldPieces();
  }

  /** 清场上所有可劈/在飞/待码木块（几何 dispose） */
  clearWorldPieces() {
    this.pendingSplit = null;
    for (const { mesh, physicsEntry } of this.firewoodPieces) {
      if (physicsEntry) this.d.physics.removeBody(physicsEntry);
      this.d.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    for (const { mesh, physicsEntry } of this.firewoodOnGround) {
      if (physicsEntry) this.d.physics.removeBody(physicsEntry);
      this.d.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    for (const { mesh } of this.logPieces) {
      this.d.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.logPieces = [];
    this.firewoodPieces = [];
    this.firewoodOnGround = [];
  }

  /**
   * 美术套装热换：换材质、清场、重新掉落一根原木。
   * 需在 IDLE/非劈砍动画时调用。
   */
  applyArtMaterials(materials: WoodMaterials) {
    this.clearWorldPieces();
    this.d.materials = materials;
    this.d.pile.setMaterials(materials);
    this.spawn();
  }
}

/** 原站 VC：把局部顶点按当前 quaternion 投影到 XZ，再取凸包。 */
function planarHull(mesh: SplittableMesh): THREE.Vector2[] {
  const cached = mesh.userData.hull2D as THREE.Vector2[] | undefined;
  if (cached) return cached;
  const position = mesh.geometry.getAttribute("position");
  const point = new THREE.Vector3();
  const points: THREE.Vector2[] = [];
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyQuaternion(mesh.quaternion);
    points.push(new THREE.Vector2(point.x, point.z));
  }
  const hull = convexHull(points);
  mesh.userData.hull2D = hull;
  return hull;
}

function convexHull(points: THREE.Vector2[]): THREE.Vector2[] {
  const sorted = points
    .map((point) => point.clone())
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length <= 2) return sorted;
  const cross = (o: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: THREE.Vector2[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: THREE.Vector2[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i];
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** 原站 qC：先把碎块约束在 12 英寸树桩圆内，再用凸包 SAT 消除互相穿插。 */
function resolvePlanarOverlaps(
  candidates: SettleCandidate[],
  stumpRadius: number,
  separation: number,
) {
  for (let iteration = 0; iteration < 5; iteration++) {
    let moved = false;
    for (const candidate of candidates) {
      const correction = containInCircle(
        candidate.hull,
        candidate.desiredX,
        candidate.desiredZ,
        stumpRadius,
      );
      if (correction) {
        candidate.desiredX += correction.x;
        candidate.desiredZ += correction.y;
        moved = true;
      }
    }
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i];
        const b = candidates[j];
        const correction = hullSeparation(
          a.hull,
          a.desiredX,
          a.desiredZ,
          b.hull,
          b.desiredX,
          b.desiredZ,
          separation,
        );
        if (!correction) continue;
        a.desiredX -= correction.x / 2;
        a.desiredZ -= correction.y / 2;
        b.desiredX += correction.x / 2;
        b.desiredZ += correction.y / 2;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function hullAxes(hull: THREE.Vector2[]): THREE.Vector2[] {
  const axes: THREE.Vector2[] = [];
  for (let i = 0; i < hull.length; i++) {
    const next = hull[(i + 1) % hull.length];
    const dx = next.x - hull[i].x;
    const dz = next.y - hull[i].y;
    const length = Math.hypot(dx, dz);
    if (length > 1e-8) axes.push(new THREE.Vector2(-dz / length, dx / length));
  }
  return axes;
}

function projectHull(
  hull: THREE.Vector2[],
  x: number,
  z: number,
  axis: THREE.Vector2,
) {
  let min = Infinity;
  let max = -Infinity;
  for (const point of hull) {
    const projection = (point.x + x) * axis.x + (point.y + z) * axis.y;
    min = Math.min(min, projection);
    max = Math.max(max, projection);
  }
  return { min, max };
}

function hullSeparation(
  a: THREE.Vector2[],
  ax: number,
  az: number,
  b: THREE.Vector2[],
  bx: number,
  bz: number,
  padding: number,
): THREE.Vector2 | null {
  let minimum = Infinity;
  let minimumAxis: THREE.Vector2 | null = null;
  for (const axis of [...hullAxes(a), ...hullAxes(b)]) {
    const pa = projectHull(a, ax, az, axis);
    const pb = projectHull(b, bx, bz, axis);
    pa.min -= padding / 2;
    pa.max += padding / 2;
    const overlap = Math.min(pa.max - pb.min, pb.max - pa.min);
    if (overlap <= 0) return null;
    if (overlap < minimum) {
      minimum = overlap;
      minimumAxis = axis;
    }
  }
  if (!minimumAxis) return null;
  if (minimumAxis.x * (bx - ax) + minimumAxis.y * (bz - az) < 0) {
    minimumAxis.negate();
  }
  return minimumAxis.multiplyScalar(minimum);
}

function containInCircle(
  hull: THREE.Vector2[],
  x: number,
  z: number,
  radius: number,
): THREE.Vector2 | null {
  let excess = 0;
  let dirX = 0;
  let dirZ = 0;
  for (const point of hull) {
    const px = point.x + x;
    const pz = point.y + z;
    const length = Math.hypot(px, pz);
    const outside = length - radius;
    if (outside > excess && length > 1e-6) {
      excess = outside;
      dirX = px / length;
      dirZ = pz / length;
    }
  }
  return excess > 0 ? new THREE.Vector2(-dirX * excess, -dirZ * excess) : null;
}
