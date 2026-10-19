import * as THREE from "three";
import { MODELS } from "../config/assets";
import type { CameraController } from "../camera/CameraController";
import { createGltfLoader } from "../core/gltf";
import type { ProgressFn } from "../core/loading";
import {
  AXE_ANIM_DURATION,
  AXE_ANIM_FADE,
  AXE_ANIM_ROTATION,
  AXE_ANIM_TRANSLATION,
} from "./axeAnimClip";

/**
 * 斧头挥砍 —— 重放 pre-IP-clean `ax_anim_v03` 的 anim 节点 TRS 曲线（代码烘焙，不装 GLB）。
 *
 * 原点/枢轴：procedural `axe.gltf` 的 Mesh translation/scale 与原 `ax_v01` 一致；
 * 真正决定「相对落点怎么摆」的是 anim 父节点的位移+四元数。0.4.0 把 anim 换成单位阵
 * 并用 rotX 手搓轨迹，等于丢掉枢轴，斧头才变成竖棍浮在空中。这里只恢复那条曲线。
 */
function sampleLinear(
  times: Float32Array,
  values: Float32Array,
  stride: number,
  t: number,
  out: number[],
) {
  const n = times.length;
  if (t <= times[0]) {
    for (let c = 0; c < stride; c++) out[c] = values[c]!;
    return;
  }
  if (t >= times[n - 1]!) {
    const base = (n - 1) * stride;
    for (let c = 0; c < stride; c++) out[c] = values[base + c]!;
    return;
  }
  let i = 0;
  while (t > times[i + 1]!) i++;
  const u = (t - times[i]!) / (times[i + 1]! - times[i]!);
  const a = i * stride;
  const b = (i + 1) * stride;
  if (stride === 4) {
    _qa.set(values[a]!, values[a + 1]!, values[a + 2]!, values[a + 3]!);
    _qb.set(values[b]!, values[b + 1]!, values[b + 2]!, values[b + 3]!);
    _qa.slerp(_qb, u);
    out[0] = _qa.x;
    out[1] = _qa.y;
    out[2] = _qa.z;
    out[3] = _qa.w;
    return;
  }
  for (let c = 0; c < stride; c++) {
    out[c] = values[a + c]! + (values[b + c]! - values[a + c]!) * u;
  }
}

/** glTF CUBICSPLINE: per-key [inTangent, value, outTangent] */
function sampleCubic(
  times: Float32Array,
  values: Float32Array,
  stride: number,
  t: number,
  out: number[],
) {
  const n = times.length;
  if (t <= times[0]) {
    const base = stride; // first key value
    for (let c = 0; c < stride; c++) out[c] = values[base + c]!;
    return;
  }
  if (t >= times[n - 1]!) {
    const base = (n - 1) * stride * 3 + stride;
    for (let c = 0; c < stride; c++) out[c] = values[base + c]!;
    return;
  }
  let i = 0;
  while (t > times[i + 1]!) i++;
  const t0 = times[i]!;
  const t1 = times[i + 1]!;
  const td = t1 - t0;
  const u = (t - t0) / td;
  const u2 = u * u;
  const u3 = u2 * u;
  const base0 = i * stride * 3;
  const base1 = (i + 1) * stride * 3;
  const a = 2 * u3 - 3 * u2 + 1;
  const b = u3 - 2 * u2 + u;
  const c = -2 * u3 + 3 * u2;
  const d = u3 - u2;
  for (let k = 0; k < stride; k++) {
    const p0 = values[base0 + stride + k]!;
    const m0 = values[base0 + 2 * stride + k]! * td;
    const p1 = values[base1 + stride + k]!;
    const m1 = values[base1 + k]! * td;
    out[k] = a * p0 + b * m0 + c * p1 + d * m1;
  }
}

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _pos = [0, 0, 0];
const _rot = [0, 0, 0, 1];

export class AxeAnimation {
  private readonly scene: THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly cameraController: CameraController;
  private readonly pivot = new THREE.Object3D();
  private animNull: THREE.Object3D | null = null;
  private animScene: THREE.Object3D | null = null;
  private axeModel: THREE.Object3D | null = null;
  private elapsed = 0;
  private readyState = false;
  private playing = false;
  private playSerial = 0;
  private lastSliceNormal = new THREE.Vector3(1, 0, 0);
  private lastImpactPoint = new THREE.Vector3();

  readonly ready: Promise<void>;

  constructor(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    cameraController: CameraController,
    onProgress?: ProgressFn,
  ) {
    this.scene = scene;
    this.renderer = renderer;
    this.cameraController = cameraController;
    this.pivot.visible = false;
    scene.add(this.pivot);
    this.ready = this.load(renderer, onProgress);
  }

  private async load(renderer: THREE.WebGLRenderer, onProgress?: ProgressFn) {
    const loader = createGltfLoader(renderer);
    try {
      const modelGltf = await loader.loadAsync(MODELS.axe).finally(() => onProgress?.());
      onProgress?.(); // 占位：原 animation 资源的进度 tick

      this.animScene = new THREE.Object3D();
      this.animScene.name = "axe_anim_root";
      this.animNull = new THREE.Object3D();
      this.animNull.name = "anim";
      this.animScene.add(this.animNull);
      this.animScene.visible = false;

      this.pivot.add(this.animScene);
      this.attachAxeModel(modelGltf.scene);
      this.readyState = true;
    } catch (err) {
      console.warn("斧头模型加载失败,本局不显示斧头:", err);
    }
  }

  private prepareAxeMaterials(root: THREE.Object3D) {
    root.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const mat = m as THREE.MeshStandardMaterial;
        if (!mat) continue;
        const clampMap = (tex: THREE.Texture | null | undefined, srgb: boolean) => {
          if (!tex) return;
          if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.flipY = false;
          tex.needsUpdate = true;
        };
        clampMap(mat.map, true);
        clampMap(mat.emissiveMap, true);
        clampMap(mat.metalnessMap, false);
        clampMap(mat.roughnessMap, false);
        clampMap(mat.aoMap, false);
        if (mat.color) mat.color.set(0xffffff);
        mat.metalness = 0;
        mat.metalnessMap = null;
        mat.roughness = Math.max(mat.roughness ?? 0.45, 0.4);
        mat.envMapIntensity = 0;
        mat.color.setRGB(1.08, 1.04, 0.94);
        mat.needsUpdate = true;
      }
    });
  }

  private disposeAxeModel() {
    if (!this.axeModel) return;
    this.animNull?.remove(this.axeModel);
    const seenTex = new Set<THREE.Texture>();
    this.axeModel.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial;
        for (const key of [
          "map",
          "normalMap",
          "roughnessMap",
          "metalnessMap",
          "aoMap",
          "emissiveMap",
          "alphaMap",
        ] as const) {
          const tex = std[key] as THREE.Texture | null | undefined;
          if (tex && !seenTex.has(tex)) {
            seenTex.add(tex);
            tex.dispose();
          }
        }
        mat.dispose();
      }
    });
    this.axeModel = null;
  }

  private attachAxeModel(root: THREE.Object3D) {
    this.disposeAxeModel();
    this.axeModel = root;
    // Mesh 节点已带与 ax_v01 相同的 translation/scale；父节点不额外 yaw/偏移
    this.axeModel.position.set(0, 0, 0);
    this.axeModel.rotation.set(0, 0, 0);
    this.axeModel.scale.setScalar(1);
    this.prepareAxeMaterials(this.axeModel);
    this.animNull?.add(this.axeModel);
  }

  async reloadAxeModel(url: string) {
    if (this.playing || !this.animNull) return;
    const loader = createGltfLoader(this.renderer);
    const modelGltf = await loader.loadAsync(url);
    this.attachAxeModel(modelGltf.scene);
  }

  withAxeModel(fn: (root: THREE.Object3D) => void) {
    if (this.axeModel) fn(this.axeModel);
  }

  get busy(): boolean {
    return this.playing;
  }

  get currentPhase(): string {
    return this.playing ? "playing" : "idle";
  }

  get playCount(): number {
    return this.playSerial;
  }

  get duration(): number {
    return AXE_ANIM_DURATION;
  }

  playFromImpact(point: THREE.Vector3, sliceNormal: THREE.Vector3) {
    if (!this.readyState || !this.animNull || !this.animScene) return;
    this.playSerial++;
    this.playing = true;
    this.elapsed = 0;
    this.lastImpactPoint.copy(point);
    this.lastSliceNormal.copy(sliceNormal).setY(0);
    if (this.lastSliceNormal.lengthSq() < 1e-8) this.lastSliceNormal.set(1, 0, 0);
    else this.lastSliceNormal.normalize();
    this.pivot.position.copy(point);
    this.orientToCamera();
    this.axeModel?.scale.setScalar(1);
    this.pivot.visible = true;
    this.animScene.visible = true;
    this.applyClipAt(0);
  }

  /** harness：采样 clip 时刻（秒），不推进播放状态机的 finish */
  seekTime(seconds: number) {
    if (!this.readyState || !this.animNull || !this.animScene) return;
    this.playing = true;
    this.elapsed = Math.max(0, Math.min(AXE_ANIM_DURATION, seconds));
    this.pivot.visible = true;
    this.animScene.visible = true;
    this.orientToCamera();
    this.applyClipAt(this.elapsed);
  }

  /** 世界空间刃尖（模型局部刃口近似点）与落点 */
  getImpactDebug(): {
    bladeTip: THREE.Vector3;
    impactPoint: THREE.Vector3;
    pivot: THREE.Vector3;
    elapsed: number;
    visible: boolean;
  } {
    // 刃口：走 Mesh 节点局部点（与 ax_v01 同构的 glTF Mesh translation/scale 已在节点上），
    // 再乘世界矩阵。避免用 AABB.min.y——斜砍时包围盒底角不是刃口。
    const bladeTip = new THREE.Vector3(-0.162, 0.02, 0);
    if (this.axeModel) {
      this.axeModel.updateWorldMatrix(true, true);
      // 子级 Mesh 节点带 translation/scale；局部点落在 AuxScene 根下
      let meshNode: THREE.Object3D | null = null;
      this.axeModel.traverse((o) => {
        if (meshNode) return;
        if ((o as THREE.Mesh).isMesh) meshNode = o;
      });
      const target = meshNode ?? this.axeModel;
      bladeTip.applyMatrix4(target.matrixWorld);
    }
    return {
      bladeTip,
      impactPoint: this.lastImpactPoint.clone(),
      pivot: this.pivot.position.clone(),
      elapsed: this.elapsed,
      visible: this.pivot.visible && !!this.animScene?.visible,
    };
  }

  update(dt: number) {
    if (!this.playing || !this.readyState || !this.animNull) return;
    this.orientToCamera();
    this.elapsed += dt;
    this.applyClipAt(this.elapsed);
    if (this.elapsed >= AXE_ANIM_DURATION) this.finish();
  }

  private applyClipAt(t: number) {
    if (!this.animNull) return;
    const tt = Math.max(0, Math.min(AXE_ANIM_DURATION, t));
    if (AXE_ANIM_TRANSLATION.interp === "CUBICSPLINE") {
      sampleCubic(AXE_ANIM_TRANSLATION.times, AXE_ANIM_TRANSLATION.values, 3, tt, _pos);
    } else {
      sampleLinear(AXE_ANIM_TRANSLATION.times, AXE_ANIM_TRANSLATION.values, 3, tt, _pos);
    }
    sampleLinear(AXE_ANIM_ROTATION.times, AXE_ANIM_ROTATION.values, 4, tt, _rot);
    this.animNull.position.set(_pos[0]!, _pos[1]!, _pos[2]!);
    this.animNull.quaternion.set(_rot[0]!, _rot[1]!, _rot[2]!, _rot[3]!);
    this.animNull.scale.setScalar(1);

    // 原版：clip 末尾 5 帧淡出
    const remaining = AXE_ANIM_DURATION - tt;
    const scale =
      remaining <= AXE_ANIM_FADE ? Math.max(0, remaining / AXE_ANIM_FADE) : 1;
    this.axeModel?.scale.setScalar(scale);
  }

  private orientToCamera() {
    const right = this.cameraController.getRight();
    const offset = new THREE.Vector3(-right.z, 0, right.x);
    const target = this.pivot.position.clone().add(offset);
    this.pivot.lookAt(target.x, this.pivot.position.y, target.z);
  }

  private finish() {
    this.playing = false;
    this.pivot.visible = false;
    if (this.animScene) this.animScene.visible = false;
    if (this.animNull) {
      this.animNull.position.set(0, 0, 0);
      this.animNull.rotation.set(0, 0, 0);
      this.animNull.quaternion.identity();
      this.animNull.scale.setScalar(1);
    }
    this.axeModel?.scale.setScalar(1);
  }

  dispose() {
    this.scene.remove(this.pivot);
    this.axeModel?.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const m = mesh.material;
      Array.isArray(m) ? m.forEach((x) => x.dispose()) : m?.dispose();
    });
  }
}
