import * as THREE from "three";
import { INCH } from "../config/constants";

interface BaseAnimation {
  type: "bounce" | "drop" | "throw";
  object: THREE.Object3D;
  duration: number;
  delayMs: number;
  startTime: number | null;
  onDone?: () => void;
}

interface BounceAnimation extends BaseAnimation {
  type: "bounce";
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  popHeight: number;
  tiltAxis: THREE.Vector3;
  tiltDegrees: number;
  targetYRotation: number;
}

interface DropAnimation extends BaseAnimation {
  type: "drop";
  startY: number;
  endY: number;
  tiltAxis: THREE.Vector3;
  tiltDegrees: number;
  landed: boolean;
}

interface ThrowAnimation extends BaseAnimation {
  type: "throw";
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  arcHeight: number;
  startQuat: THREE.Quaternion;
  endQuat: THREE.Quaternion;
  spinAxis: THREE.Vector3;
}

type Animation = BounceAnimation | DropAnimation | ThrowAnimation;
const UP = new THREE.Vector3(0, 1, 0);

export class PieceAnimator {
  private readonly animations: Animation[] = [];

  /** 原站留桩碎块的 150ms pop/bounce。距离与高度参数使用英寸。 */
  animate(
    object: THREE.Object3D,
    direction: THREE.Vector3,
    distanceIn = 0.5,
    popHeightIn = 1,
    delayMs = 0,
    tiltMultiplier = 1,
    onDone?: () => void,
    yAngle = 0,
  ) {
    this.finishAnimationsForMeshes([object]);
    const startPos = object.position.clone();
    const endPos = startPos.clone().addScaledVector(direction, distanceIn * INCH);
    const tiltAxis = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    this.animations.push({
      type: "bounce",
      object,
      startPos,
      endPos,
      popHeight: popHeightIn * INCH,
      tiltAxis,
      tiltDegrees: 3 * tiltMultiplier,
      targetYRotation: yAngle,
      delayMs,
      duration: 150,
      startTime: null,
      onDone,
    });
  }

  /** 新原木从“最终位置上方 N 英寸”落下并弹两次，总时长 300ms。 */
  animateDrop(object: THREE.Mesh, extraHeightIn = 2, onDone?: () => void) {
    object.geometry.computeBoundingBox();
    const halfHeight =
      (object.geometry.boundingBox!.max.y - object.geometry.boundingBox!.min.y) / 2;
    const startY = halfHeight + extraHeightIn * INCH;
    object.position.y = startY;
    this.animations.push({
      type: "drop",
      object,
      startY,
      endY: halfHeight,
      tiltAxis: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
      tiltDegrees: 4,
      duration: 300,
      delayMs: 0,
      startTime: null,
      landed: false,
      onDone,
    });
  }

  /** 码垛使用的抛物线飞行动画，接口保留米制目标位姿。 */
  throwTo(
    object: THREE.Object3D,
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    options: { duration?: number; delay?: number; arcHeight?: number; onDone?: () => void } = {},
  ) {
    const startPos = object.position.clone();
    this.animations.push({
      type: "throw",
      object,
      startPos,
      endPos: position.clone(),
      arcHeight: options.arcHeight ?? startPos.y + 3 * INCH,
      startQuat: object.quaternion.clone(),
      endQuat: quaternion.clone(),
      spinAxis: new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
      ).normalize(),
      duration: (options.duration ?? 0.5) * 1000,
      delayMs: (options.delay ?? 0) * 1000,
      startTime: null,
      onDone: options.onDone,
    });
  }

  get busy(): boolean {
    return !this.allDone();
  }

  allDone(): boolean {
    return this.animations.length === 0;
  }

  finishAnimationsForMeshes(objects: THREE.Object3D[]) {
    const targets = new Set(objects);
    for (let i = this.animations.length - 1; i >= 0; i--) {
      const animation = this.animations[i];
      if (!targets.has(animation.object)) continue;
      this.finish(animation);
      this.animations.splice(i, 1);
    }
  }

  update(_dt?: number) {
    const now = performance.now();
    for (let i = this.animations.length - 1; i >= 0; i--) {
      const animation = this.animations[i];
      animation.startTime ??= now + animation.delayMs;
      const elapsed = now - animation.startTime;
      if (elapsed < 0) continue;
      const t = Math.min(elapsed / animation.duration, 1);
      if (animation.type === "bounce") this.updateBounce(animation, t);
      else if (animation.type === "drop") this.updateDrop(animation, t);
      else this.updateThrow(animation, t);
      if (t >= 1) {
        this.animations.splice(i, 1);
        animation.onDone?.();
      }
    }
  }

  private updateBounce(animation: BounceAnimation, t: number) {
    if (t >= 1) return this.finish(animation);
    const moveT = 1 - (1 - t) ** 2;
    const x = THREE.MathUtils.lerp(animation.startPos.x, animation.endPos.x, moveT);
    const z = THREE.MathUtils.lerp(animation.startPos.z, animation.endPos.z, moveT);
    const startY = animation.startPos.y;
    const tilt = THREE.MathUtils.degToRad(animation.tiltDegrees);
    let y = startY;
    let tiltAngle = 0;
    if (t < 0.3) {
      const p = t / 0.3;
      y += animation.popHeight * (1 - (1 - p) ** 2);
      tiltAngle = THREE.MathUtils.lerp(0, tilt, p);
    } else if (t < 0.6) {
      const p = (t - 0.3) / 0.3;
      y += animation.popHeight * (1 - p * p);
      tiltAngle = tilt;
    } else if (t < 0.8) {
      const p = (t - 0.6) / 0.2;
      y += Math.sin(p * Math.PI) * animation.popHeight * 0.3;
      tiltAngle = THREE.MathUtils.lerp(tilt, -tilt * 0.5, p);
    } else {
      tiltAngle = THREE.MathUtils.lerp(-tilt * 0.5, 0, (t - 0.8) / 0.2);
    }
    animation.object.position.set(x, y, z);
    const yaw = new THREE.Quaternion().setFromAxisAngle(UP, animation.targetYRotation);
    const lean = new THREE.Quaternion().setFromAxisAngle(animation.tiltAxis, tiltAngle);
    animation.object.quaternion.copy(yaw).multiply(lean);
  }

  private updateDrop(animation: DropAnimation, t: number) {
    if (t >= 1) return this.finish(animation);
    const distance = animation.startY - animation.endY;
    const tilt = THREE.MathUtils.degToRad(animation.tiltDegrees);
    let y: number;
    let angle: number;
    if (t < 1 / 3) {
      const p = t * 3;
      y = THREE.MathUtils.lerp(animation.startY, animation.endY, p * p);
      angle = tilt;
    } else if (t < 2 / 3) {
      if (!animation.landed) {
        animation.landed = true;
        animation.onDone?.();
        animation.onDone = undefined;
      }
      const p = (t - 1 / 3) * 3;
      y = animation.endY + (distance / 3) * 4 * p * (1 - p);
      angle = THREE.MathUtils.lerp(tilt, -tilt * 0.75, p);
    } else {
      const p = (t - 2 / 3) * 3;
      y = animation.endY + (distance / 9) * 4 * p * (1 - p);
      angle = THREE.MathUtils.lerp(-tilt * 0.75, 0, p);
    }
    animation.object.position.y = y;
    animation.object.quaternion.setFromAxisAngle(animation.tiltAxis, angle);
  }

  private updateThrow(animation: ThrowAnimation, t: number) {
    if (t >= 1) return this.finish(animation);
    const moveT = 1 - (1 - t) ** 2;
    const x = THREE.MathUtils.lerp(animation.startPos.x, animation.endPos.x, moveT);
    const z = THREE.MathUtils.lerp(animation.startPos.z, animation.endPos.z, moveT);
    const y =
      THREE.MathUtils.lerp(animation.startPos.y, animation.endPos.y, t) +
      4 *
        (animation.arcHeight - Math.max(animation.startPos.y, animation.endPos.y)) *
        t *
        (1 - t);
    animation.object.position.set(x, y, z);
    const spin = new THREE.Quaternion().setFromAxisAngle(animation.spinAxis, t * Math.PI * 2);
    animation.object.quaternion.copy(animation.startQuat).multiply(spin);
    animation.object.quaternion.slerp(animation.endQuat, moveT * moveT);
  }

  private finish(animation: Animation) {
    if (animation.type === "bounce") {
      animation.object.position.copy(animation.endPos);
      animation.object.quaternion.setFromAxisAngle(UP, animation.targetYRotation);
    } else if (animation.type === "drop") {
      animation.object.position.y = animation.endY;
      animation.object.quaternion.identity();
    } else {
      animation.object.position.copy(animation.endPos);
      animation.object.quaternion.copy(animation.endQuat);
    }
  }

  clear() {
    this.animations.length = 0;
  }
}
