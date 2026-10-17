import * as THREE from "three";
import { CAMERA, SHAKE } from "../config/constants";

/**
 * 绕树桩的水平轨道相机。
 *
 * 只让水平角可拖,俯仰和距离锁死 —— 这样构图永远稳,玩家也不会把相机拖到地下去。
 * 另外要区分「拖动」和「点击」:按下到松开之间位移超过阈值就算拖动,
 * 不能触发劈砍,否则转视角时会误砍。
 */
export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  private readonly dom: HTMLElement;

  private azimuth = CAMERA.azimuth;
  /** 松手后的角速度,用于惯性滑行 */
  private angularVelocity = 0;
  /** 不可砍时的自动转向终点；使用目标角保证累计严格为 90°。 */
  private autoAzimuthTarget: number | null = null;

  private pointerId: number | null = null;
  private lastX = 0;
  private dragDistancePx = 0;
  /** 本次按下是否已经判定为拖拽 */
  private dragged = false;
  /** 有一次「干净的点击」待消费 */
  private pendingClick = false;
  private readonly lastClickNdc = new THREE.Vector2();

  /** 光标的归一化设备坐标,射线拾取用 */
  readonly pointerNdc = new THREE.Vector2();
  private hasPointer = false;

  private shakeTime = 0;
  private readonly shakeOffset = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.camera = camera;
    this.dom = dom;

    dom.addEventListener("pointerdown", this.onPointerDown);
    dom.addEventListener("pointermove", this.onPointerMove);
    dom.addEventListener("pointerup", this.onPointerUp);
    dom.addEventListener("pointercancel", this.onPointerUp);

    this.applyTransform();
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.lastX = e.clientX;
    this.dragDistancePx = 0;
    this.dragged = false;
    this.angularVelocity = 0;
    this.autoAzimuthTarget = null;
    this.dom.setPointerCapture(e.pointerId);
    this.updateNdc(e);
  };

  private onPointerMove = (e: PointerEvent) => {
    this.updateNdc(e);
    if (e.pointerId !== this.pointerId) return;

    const dx = e.clientX - this.lastX;
    this.lastX = e.clientX;
    this.dragDistancePx += Math.abs(dx);
    if (this.dragDistancePx > CAMERA.clickSlopPx) this.dragged = true;

    if (this.dragged) {
      const delta = (-dx / window.innerWidth) * CAMERA.dragSpeed;
      this.azimuth += delta;
      // 记下瞬时速度,松手时接着滑
      this.angularVelocity = delta * 60;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    if (this.dom.hasPointerCapture(e.pointerId)) this.dom.releasePointerCapture(e.pointerId);
    if (!this.dragged) {
      this.pendingClick = true;
      this.lastClickNdc.copy(this.pointerNdc);
      this.angularVelocity = 0;
    }
  };

  private updateNdc(e: PointerEvent) {
    this.pointerNdc.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    this.hasPointer = true;
  }

  /** 取走一次点击。取过就没了,保证一次点击只劈一刀。 */
  consumeClick(): boolean {
    if (!this.pendingClick) return false;
    this.pendingClick = false;
    return true;
  }

  /** 消费点击并返回 pointerup 当时的 NDC，避免后续 hover 移动改变命中点。 */
  consumeClickPosition(): THREE.Vector2 | null {
    if (!this.pendingClick) return null;
    this.pendingClick = false;
    return this.lastClickNdc.clone();
  }

  /** 光标位置;还没动过鼠标(比如移动端首次)时回退到屏幕中心 */
  getPointerNdc(): THREE.Vector2 {
    return this.hasPointer ? this.pointerNdc : this.pointerNdc.set(0, 0);
  }

  /** 鼠标未按下时才提供悬停坐标；触屏尚未移动时返回 null。 */
  getHoverNdc(): THREE.Vector2 | null {
    return this.pointerId === null && this.hasPointer ? this.pointerNdc : null;
  }

  /** 相机右方向(投影到水平面),劈砍时决定默认的切割平面朝向 */
  getRight(target = new THREE.Vector3()): THREE.Vector3 {
    return target.setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
  }

  /** 相机看向场景的水平方向 */
  getForward(target = new THREE.Vector3()): THREE.Vector3 {
    return target.setFromMatrixColumn(this.camera.matrixWorld, 2).setY(0).normalize().negate();
  }

  /** 斧头落下时调一次,给个短促的高频抖动 */
  triggerShake() {
    this.shakeTime = SHAKE.duration;
  }

  /** 轻微推一下视角,劈完换个角度看更有动感 */
  nudge(radians: number) {
    this.angularVelocity += radians;
  }

  /**
   * 参考站的 nudgeAzimuth 最终累计转过 90°。
   * 这里改成帧率无关的目标角缓动，避免 dt 积分只能转几度。
   */
  nudgeAzimuth(direction: number) {
    const base = this.autoAzimuthTarget ?? this.azimuth;
    this.autoAzimuthTarget = base + Math.sign(direction || 1) * Math.PI / 2;
    this.angularVelocity = 0;
  }

  /** 直接把视角摆到指定方位(弧度) */
  setAzimuth(radians: number) {
    this.azimuth = radians;
    this.angularVelocity = 0;
    this.autoAzimuthTarget = null;
    this.applyTransform();
  }

  update(dt: number) {
    if (this.pointerId === null && this.autoAzimuthTarget !== null) {
      const delta = this.autoAzimuthTarget - this.azimuth;
      const step = 1 - Math.exp(-8 * dt);
      this.azimuth += delta * step;
      if (Math.abs(delta) < 1e-4) {
        this.azimuth = this.autoAzimuthTarget;
        this.autoAzimuthTarget = null;
      }
    } else if (this.pointerId === null && this.angularVelocity !== 0) {
      this.azimuth += this.angularVelocity * dt;
      // damping 定义为「每秒保留比例」,用 pow 让衰减与帧率无关
      this.angularVelocity *= Math.pow(CAMERA.damping, dt);
      if (Math.abs(this.angularVelocity) < 1e-4) this.angularVelocity = 0;
    }

    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const t = this.shakeTime / SHAKE.duration;
      // 振幅随剩余时间平方衰减,收尾干脆不拖泥带水
      const amp = SHAKE.amplitude * t * t;
      const phase = (SHAKE.duration - this.shakeTime) * SHAKE.frequency;
      this.shakeOffset.set(Math.sin(phase) * amp, Math.sin(phase * 1.7) * amp * 0.7, 0);
    } else {
      this.shakeOffset.set(0, 0, 0);
    }

    this.applyTransform();
  }

  get currentAzimuth(): number {
    return this.azimuth;
  }

  get targetAzimuth(): number | null {
    return this.autoAzimuthTarget;
  }

  private applyTransform() {
    const { distance, elevation, target } = CAMERA;
    const horizontal = Math.cos(elevation) * distance;
    this.camera.position.set(
      Math.cos(this.azimuth) * horizontal + this.shakeOffset.x,
      Math.sin(elevation) * distance + target + this.shakeOffset.y,
      Math.sin(this.azimuth) * horizontal,
    );
    this.camera.lookAt(0, target, 0);
  }

  dispose() {
    this.dom.removeEventListener("pointerdown", this.onPointerDown);
    this.dom.removeEventListener("pointermove", this.onPointerMove);
    this.dom.removeEventListener("pointerup", this.onPointerUp);
    this.dom.removeEventListener("pointercancel", this.onPointerUp);
  }
}

export function handleResize(camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
