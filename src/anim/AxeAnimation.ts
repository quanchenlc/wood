import * as THREE from "three";
import { MODELS } from "../config/assets";
import type { CameraController } from "../camera/CameraController";
import { createGltfLoader } from "../core/gltf";
import type { ProgressFn } from "../core/loading";
import {
  AXE_ANIM_DURATION,
  AXE_ANIM_FADE,
  AXE_ANIM_IMPACT_AT,
  AXE_HANDLE_TOP_LOCAL,
  AXE_KEYS,
  AXE_MODEL_SCALE,
  AXE_MODEL_YAW,
  AXE_POLL_LOCAL,
  AXE_TIP_LOCAL,
} from "./axeAnimClip";

function applyAxeModelScale(obj: THREE.Object3D | null, fade = 1) {
  if (!obj) return;
  obj.scale.setScalar(AXE_MODEL_SCALE * Math.max(0, fade));
}

/**
 * 斧头挥砍 —— 项目自撰关键姿态 + smoothstep 插值。
 *
 * 与早期 wood / screen.toys orient 同构（不含 ax_anim 浮点曲线）：
 * - 每帧 pivot.lookAt(camera-forward)；挂模 MODEL_YAW=π/2 → 颊面沿相机右
 *   （刃面落在劈面内，尖端朝下扎进顶心）
 * - animNull 只用 rotX；落点由 axeContactPoint 钉在木块顶面（勿用小块中心）
 * - 统一等比缩放
 */
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

function smoothstep(u: number): number {
  const x = Math.max(0, Math.min(1, u));
  return x * x * (3 - 2 * x);
}

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
      onProgress?.();

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
        // Neutral steel albedo; slight metalness for lit specular (no envMap — sky
        // ghost). Keep tint white so cheek reads grey metal, not sky-blue plastic.
        if (mat.color) mat.color.setRGB(1.0, 1.0, 1.0);
        mat.metalness = 0.28;
        mat.metalnessMap = null;
        mat.roughness = Math.max(mat.roughness ?? 0.45, 0.42);
        mat.envMapIntensity = 0;
        if (mat.emissive) mat.emissive.setRGB(0.025, 0.025, 0.028);
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
        mat.depthTest = true;
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
    // MODEL_YAW puts cheek on ±X (camera-right / split normal after lookAt).
    // Swing is rotX-only on animNull. Uniform scale only.
    this.axeModel.position.set(0, 0, 0);
    this.axeModel.rotation.set(0, AXE_MODEL_YAW, 0);
    applyAxeModelScale(this.axeModel, 1);
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

  get impactAt(): number {
    return AXE_ANIM_IMPACT_AT;
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
    applyAxeModelScale(this.axeModel, 1);
    this.pivot.visible = true;
    this.animScene.visible = true;
    this.applyClipAt(0);
  }

  /** harness：采样 clip 时刻（秒） */
  seekTime(seconds: number) {
    if (!this.readyState || !this.animNull || !this.animScene) return;
    this.playing = true;
    this.elapsed = Math.max(0, Math.min(AXE_ANIM_DURATION, seconds));
    this.pivot.visible = true;
    this.animScene.visible = true;
    this.orientToCamera();
    this.applyClipAt(this.elapsed);
  }

  getImpactDebug(): {
    bladeTip: THREE.Vector3;
    impactPoint: THREE.Vector3;
    pivot: THREE.Vector3;
    elapsed: number;
    visible: boolean;
    /** Unit vector poll→tip (blade / edge direction) in world space. */
    edgeDir: THREE.Vector3;
    /** Unit vector along handle (+Y) in world space. */
    handleDir: THREE.Vector3;
    /** Cheek normal (+Z authoring) in world space — blade-plane normal. */
    cheekNormal: THREE.Vector3;
    /** |cheek · cameraRight| — should be ~1 when blade lies in the split plane. */
    cheekAlongRight: number;
    /** |cheek · cameraForward| — high means boss cheek-on-face (toward camera). */
    cheekTowardCamera: number;
  } {
    // Tip in AuxScene / authoring space (AXE_TIP_LOCAL). Do NOT apply through
    // Mesh-bin local — Mesh T/S remaps authored points; treating authoring
    // coords as bin-local zeroed the mid-handle and buried the metal head.
    const bladeTip = new THREE.Vector3(
      AXE_TIP_LOCAL[0],
      AXE_TIP_LOCAL[1],
      AXE_TIP_LOCAL[2],
    );
    const poll = new THREE.Vector3(
      AXE_POLL_LOCAL[0],
      AXE_POLL_LOCAL[1],
      AXE_POLL_LOCAL[2],
    );
    const handleTop = new THREE.Vector3(
      AXE_HANDLE_TOP_LOCAL[0],
      AXE_HANDLE_TOP_LOCAL[1],
      AXE_HANDLE_TOP_LOCAL[2],
    );
    const cheekLocal = new THREE.Vector3(0, 0, 1);
    if (this.axeModel) {
      this.axeModel.updateWorldMatrix(true, true);
      const m = this.axeModel.matrixWorld;
      bladeTip.applyMatrix4(m);
      poll.applyMatrix4(m);
      handleTop.applyMatrix4(m);
      // Normal: transform direction (ignore translation)
      cheekLocal.transformDirection(m).normalize();
    }
    const edgeDir = bladeTip.clone().sub(poll).normalize();
    const handleDir = handleTop.clone().sub(poll).normalize();
    const camRight = this.cameraController.getRight(new THREE.Vector3());
    const camFwd = new THREE.Vector3(-camRight.z, 0, camRight.x);
    return {
      bladeTip,
      impactPoint: this.lastImpactPoint.clone(),
      pivot: this.pivot.position.clone(),
      elapsed: this.elapsed,
      visible: this.pivot.visible && !!this.animScene?.visible,
      edgeDir,
      handleDir,
      cheekNormal: cheekLocal,
      cheekAlongRight: Math.abs(cheekLocal.dot(camRight)),
      cheekTowardCamera: Math.abs(cheekLocal.dot(camFwd)),
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
    const keys = AXE_KEYS;
    let i = 0;
    while (i < keys.length - 1 && tt > keys[i + 1]!.t) i++;
    const a = keys[i]!;
    const b = keys[Math.min(i + 1, keys.length - 1)]!;
    const span = Math.max(1e-6, b.t - a.t);
    const u = smoothstep((tt - a.t) / span);

    this.animNull.position.set(
      a.p[0] + (b.p[0] - a.p[0]) * u,
      a.p[1] + (b.p[1] - a.p[1]) * u,
      a.p[2] + (b.p[2] - a.p[2]) * u,
    );
    _qa.set(a.q[0], a.q[1], a.q[2], a.q[3]);
    _qb.set(b.q[0], b.q[1], b.q[2], b.q[3]);
    this.animNull.quaternion.copy(_qa.slerp(_qb, u));
    this.animNull.scale.setScalar(1);

    const remaining = AXE_ANIM_DURATION - tt;
    const fade = remaining <= AXE_ANIM_FADE ? Math.max(0, remaining / AXE_ANIM_FADE) : 1;
    applyAxeModelScale(this.axeModel, fade);
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
    applyAxeModelScale(this.axeModel, 1);
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
