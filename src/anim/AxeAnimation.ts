import * as THREE from "three";
import { MODELS } from "../config/assets";
import type { CameraController } from "../camera/CameraController";
import { createGltfLoader } from "../core/gltf";
import type { ProgressFn } from "../core/loading";
import {
  AXE_ANIM_DURATION,
  AXE_ANIM_IMPACT_AT,
  AXE_HANDLE_TOP_LOCAL,
  AXE_MODEL_SCALE,
  AXE_POLL_LOCAL,
  AXE_TIP_LOCAL,
} from "./axeAnimClip";

/** Keep uniform model scale — never fade-to-zero (boss: 缩小像元宝). */
function applyAxeModelScale(obj: THREE.Object3D | null) {
  if (!obj) return;
  obj.scale.setScalar(AXE_MODEL_SCALE);
}

/**
 * 斧头挥砍 —— 自研 clip GLB + AnimationMixer + 每帧 orientToCamera。
 *
 * 与 early wood / screen.toys 控制流同构（不含 ax_anim 浮点曲线）：
 * - 加载 `axe_swing_clip.glb` 提供 `anim` 节点与 clip
 * - 自研木柄斧挂到 `anim`；每帧 pivot.lookAt(camera-right)
 * - 击中后顺势旋转离屏，再 visible=false（不缩小）
 * - 落点由 axeContactPoint 钉在木块顶面（bbox max.y）
 */
export class AxeAnimation {
  private readonly scene: THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly cameraController: CameraController;
  private readonly pivot = new THREE.Object3D();
  private animNull: THREE.Object3D | null = null;
  private animScene: THREE.Object3D | null = null;
  private axeModel: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private action: THREE.AnimationAction | null = null;
  private hasClip = false;
  private readyState = false;
  private playing = false;
  private playSerial = 0;
  /** Harness seek: hold paused pose; do not finish on clamp. */
  private seekHold = false;
  private lastSliceNormal = new THREE.Vector3(1, 0, 0);
  private lastImpactPoint = new THREE.Vector3();
  private elapsed = 0;

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
      const [animationGltf, modelGltf] = await Promise.all([
        loader.loadAsync(MODELS.axeAnimation).finally(() => onProgress?.()),
        loader.loadAsync(MODELS.axe).finally(() => onProgress?.()),
      ]);

      this.animScene = animationGltf.scene;
      this.animScene.visible = false;
      this.animScene.traverse((object) => {
        if (object.name === "anim") this.animNull = object;
        if ((object as THREE.Mesh).isMesh) object.visible = false;
      });
      this.animNull ??= this.animScene;

      if (animationGltf.animations.length > 0) {
        this.hasClip = true;
        this.mixer = new THREE.AnimationMixer(this.animScene);
        this.action = this.mixer.clipAction(animationGltf.animations[0]!);
        this.action.setLoop(THREE.LoopOnce, 1);
        this.action.clampWhenFinished = true;
      }

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
        if (mat.color) mat.color.setRGB(1.0, 1.0, 1.0);
        mat.metalness = 0.28;
        mat.metalnessMap = null;
        mat.roughness = Math.max(mat.roughness ?? 0.45, 0.42);
        mat.envMapIntensity = 0;
        // Slightly brighter steel so thin edge-down wedge still reads as metal
        // in portrait (few pixels vs cheek-on-face plate).
        if (mat.emissive) mat.emissive.setRGB(0.04, 0.04, 0.045);
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
    // Clip encodes local head orientation relative to pivot — identity attach.
    this.axeModel.position.set(0, 0, 0);
    this.axeModel.rotation.set(0, 0, 0);
    this.axeModel.quaternion.identity();
    applyAxeModelScale(this.axeModel);
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
    if (this.hasClip && this.action) return this.action.getClip().duration;
    return AXE_ANIM_DURATION;
  }

  get impactAt(): number {
    return AXE_ANIM_IMPACT_AT;
  }

  playFromImpact(point: THREE.Vector3, sliceNormal: THREE.Vector3) {
    if (!this.readyState || !this.animNull || !this.animScene) return;
    this.playSerial++;
    this.playing = true;
    this.seekHold = false;
    this.elapsed = 0;
    this.lastImpactPoint.copy(point);
    this.lastSliceNormal.copy(sliceNormal).setY(0);
    if (this.lastSliceNormal.lengthSq() < 1e-8) this.lastSliceNormal.set(1, 0, 0);
    else this.lastSliceNormal.normalize();
    this.pivot.position.copy(point);
    this.orientToCamera();
    applyAxeModelScale(this.axeModel);
    this.animNull.rotation.set(0, 0, 0);
    this.animNull.position.set(0, 0, 0);
    this.animNull.scale.setScalar(1);
    if (this.hasClip && this.action && this.mixer) {
      this.action.reset();
      this.action.play();
      this.mixer.update(0);
    }
    this.pivot.visible = true;
    this.animScene.visible = true;
  }

  /** harness：采样 clip 时刻（秒） */
  seekTime(seconds: number) {
    if (!this.readyState || !this.animNull || !this.animScene) return;
    this.playing = true;
    this.seekHold = true;
    this.elapsed = Math.max(0, Math.min(this.duration, seconds));
    this.pivot.visible = true;
    this.animScene.visible = true;
    this.orientToCamera();
    if (this.hasClip && this.action && this.mixer) {
      this.action.reset();
      this.action.play();
      this.action.time = this.elapsed;
      this.action.paused = true;
      this.mixer.update(0);
      applyAxeModelScale(this.axeModel);
      return;
    }
    this.applyProceduralAt(this.elapsed);
  }

  getImpactDebug(): {
    bladeTip: THREE.Vector3;
    impactPoint: THREE.Vector3;
    pivot: THREE.Vector3;
    elapsed: number;
    visible: boolean;
    edgeDir: THREE.Vector3;
    handleDir: THREE.Vector3;
    cheekNormal: THREE.Vector3;
    cheekAlongRight: number;
    cheekTowardCamera: number;
    /** |handle · cameraForward| — orig foreshortened handle, not vertical stick. */
    handleTowardCamera: number;
    /** Uniform model scale — must stay ~1 (no yuanbao shrink fade). */
    modelScale: number;
  } {
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
      handleTowardCamera: Math.abs(handleDir.dot(camFwd)),
      modelScale: this.axeModel?.scale.x ?? AXE_MODEL_SCALE,
    };
  }

  update(dt: number) {
    if (!this.playing || !this.readyState || !this.animNull) return;
    this.orientToCamera();

    if (this.hasClip && this.mixer && this.action) {
      if (this.seekHold) {
        this.orientToCamera();
        return;
      }
      this.mixer.update(dt);
      this.elapsed = this.action.time;
      applyAxeModelScale(this.axeModel);
      const remaining = this.action.getClip().duration - this.action.time;
      if (this.action.paused || remaining <= 0) this.finish();
      return;
    }

    this.elapsed += dt;
    this.applyProceduralAt(this.elapsed);
    if (this.elapsed >= AXE_ANIM_DURATION) this.finish();
  }

  /** Procedural fallback when clip GLB failed to load. */
  private applyProceduralAt(t: number) {
    if (!this.animNull) return;
    const tt = Math.max(0, Math.min(AXE_ANIM_DURATION, t));
    const qImpact = new THREE.Quaternion(0.51, 0.53, 0.41, 0.54).normalize();
    const qWind = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.72).multiply(qImpact);
    const qExit = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.55).multiply(qImpact);
    let q: THREE.Quaternion;
    let extraY = 0;
    let extraZ = 0;
    if (tt <= AXE_ANIM_IMPACT_AT) {
      const e = tt / AXE_ANIM_IMPACT_AT;
      q = qWind.clone().slerp(qImpact, e * e * (3 - 2 * e));
      extraY = 0.42 * (1 - e);
    } else {
      const e = (tt - AXE_ANIM_IMPACT_AT) / (AXE_ANIM_DURATION - AXE_ANIM_IMPACT_AT);
      q = qImpact.clone().slerp(qExit, e);
      // Carry off-camera: down + toward cam (no shrink).
      extraY = -1.15 * e;
      extraZ = 1.05 * e;
    }
    this.animNull.quaternion.copy(q);
    const tip = new THREE.Vector3(AXE_TIP_LOCAL[0], AXE_TIP_LOCAL[1], AXE_TIP_LOCAL[2]).applyQuaternion(q);
    this.animNull.position.set(-tip.x, -tip.y + extraY, -tip.z + extraZ);
    this.animNull.scale.setScalar(1);
    applyAxeModelScale(this.axeModel);
  }

  private orientToCamera() {
    const right = this.cameraController.getRight();
    const offset = new THREE.Vector3(-right.z, 0, right.x);
    const target = this.pivot.position.clone().add(offset);
    this.pivot.lookAt(target.x, this.pivot.position.y, target.z);
  }

  private finish() {
    this.playing = false;
    this.seekHold = false;
    this.pivot.visible = false;
    if (this.animScene) this.animScene.visible = false;
    if (this.animNull) {
      this.animNull.position.set(0, 0, 0);
      this.animNull.rotation.set(0, 0, 0);
      this.animNull.quaternion.identity();
      this.animNull.scale.setScalar(1);
    }
    applyAxeModelScale(this.axeModel);
  }

  dispose() {
    this.scene.remove(this.pivot);
    this.mixer?.stopAllAction();
    this.axeModel?.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const m = mesh.material;
      Array.isArray(m) ? m.forEach((x) => x.dispose()) : m?.dispose();
    });
  }
}
