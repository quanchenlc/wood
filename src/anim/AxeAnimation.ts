import * as THREE from "three";
import { MODELS } from "../config/assets";
import type { CameraController } from "../camera/CameraController";
import { createGltfLoader } from "../core/gltf";
import type { ProgressFn } from "../core/loading";
import {
  AXE_ANIM_DURATION,
  AXE_ANIM_FADE,
  AXE_ANIM_IMPACT_AT,
  AXE_KEYS,
} from "./axeAnimClip";

/**
 * 斧头挥砍 —— 项目自撰关键姿态 + smoothstep 插值。
 *
 * 测量目标来自 pre-clean 实机观感（闲置隐藏、落点贴齐木顶、柄自上方落下、
 * 颊面朝相机、不挡顶栏）。不含 ax_anim / screen.toys 的关键帧数据。
 *
 * 模型约定（build_axe_placeholder）：柄 +Y，刃口线 ∥ Y，刃朝 −X，颊面 ±Z。
 * pivot.lookAt 后 local +Z 朝镜头、+X 朝右；animNull 只用 rotX 下劈
 * （勿套用 ax_anim 的复合四元数，否则刃口线会躺平、颊面贴在原木立面上）。
 * 挂模保持 identity（不要 MODEL_YAW），否则颊面转到 ±X，屏幕上只剩窄侧影。
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
        // Painted steel: no envMap (sky tint → translucent ghost). Warm grade,
        // metalness 0 so the cheek reads as solid opaque steel on the log top.
        if (mat.color) mat.color.setRGB(1.1, 1.05, 0.95);
        mat.metalness = 0;
        mat.metalnessMap = null;
        mat.roughness = Math.max(mat.roughness ?? 0.45, 0.42);
        mat.envMapIntensity = 0;
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
    // Identity pose: cheek ±Z faces camera after pivot.lookAt (see class note).
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
    this.axeModel?.scale.setScalar(1);
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
  } {
    // Blade tip in axe.gltf Mesh local space (see build_axe_placeholder XE).
    const bladeTip = new THREE.Vector3(-0.162, 0.05, 0);
    if (this.axeModel) {
      this.axeModel.updateWorldMatrix(true, true);
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
    const scale = remaining <= AXE_ANIM_FADE ? Math.max(0, remaining / AXE_ANIM_FADE) : 1;
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
