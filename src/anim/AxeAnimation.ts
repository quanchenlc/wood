import * as THREE from "three";
import { MODELS } from "../config/assets";
import type { CameraController } from "../camera/CameraController";
import { createGltfLoader } from "../core/gltf";
import type { ProgressFn } from "../core/loading";

const PROCEDURAL_DURATION = 0.25;
const CLIP_FADE_SECONDS = 5 / 30;

/**
 * 斧头。
 *
 * 原站使用一个动画 GLB 提供 `anim` 节点和 clip，再把真实斧头模型挂到该节点。
 * 这样支点、轨迹和资源作者导出的坐标系全部保留，不再根据包围盒猜测。
 */
export class AxeAnimation {
  private readonly scene: THREE.Scene;
  private readonly cameraController: CameraController;
  private readonly pivot = new THREE.Object3D();
  private animNull: THREE.Object3D | null = null;
  private animScene: THREE.Object3D | null = null;
  private axeModel: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private action: THREE.AnimationAction | null = null;
  private hasClip = false;
  private progress = 0;
  private readyState = false;
  private playing = false;
  private playSerial = 0;

  readonly ready: Promise<void>;

  constructor(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    cameraController: CameraController,
    onProgress?: ProgressFn,
  ) {
    this.scene = scene;
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
        this.action = this.mixer.clipAction(animationGltf.animations[0]);
        this.action.setLoop(THREE.LoopOnce, 1);
        this.action.clampWhenFinished = true;
      }

      this.pivot.add(this.animScene);
      this.axeModel = modelGltf.scene;
      this.axeModel.position.set(0, 0, 0);
      this.axeModel.traverse((obj) => {
        if (!(obj as THREE.Mesh).isMesh) return;
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // 资源无关：色图 sRGB + Clamp；ORM/金属度贴图可有可无（占位斧有 axe_orm.png）
        // metalness 强制 0 → ORM 金属通道被压掉；roughnessMap 仍参与，并抬到底 0.55
        // 禁止 flipY=true 纸糊：外置 JPG 朝向由 bake/美术保证（glTF flipY=false）
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
          // ORM / metallicRoughness：线性，勿标 sRGB
          clampMap(mat.metalnessMap, false);
          clampMap(mat.roughnessMap, false);
          clampMap(mat.aoMap, false);
          if (mat.color) mat.color.set(0xffffff);
          if (typeof mat.metalness === "number") mat.metalness = 0;
          if (typeof mat.roughness === "number") mat.roughness = Math.max(mat.roughness, 0.55);
          mat.needsUpdate = true;
        }
      });
      this.animNull.add(this.axeModel);
      this.readyState = true;
    } catch (err) {
      console.warn("斧头模型加载失败,本局不显示斧头:", err);
    }
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

  /** 斧头只负责视觉；几何切割由 GameController 的 0.1 秒 pending timer 触发。 */
  playFromImpact(point: THREE.Vector3, _sliceNormal: THREE.Vector3) {
    if (!this.readyState || !this.animNull || !this.animScene) return;
    this.playSerial++;
    this.playing = true;
    this.progress = 0;
    this.pivot.position.copy(point);
    this.orientToCamera();
    // 上一段动画可能仍处在末尾淡出状态；新一刀必须从完整可见的初始状态重播。
    this.axeModel?.scale.setScalar(1);
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

  update(dt: number) {
    if (!this.playing || !this.readyState || !this.animNull) return;
    this.orientToCamera();

    if (this.hasClip && this.mixer) {
      this.mixer.update(dt);
      if (this.action && this.axeModel) {
        const remaining = this.action.getClip().duration - this.action.time;
        this.axeModel.scale.setScalar(
          remaining <= CLIP_FADE_SECONDS
            ? Math.max(0, remaining / CLIP_FADE_SECONDS)
            : 1,
        );
      }
      if (this.action?.paused) this.finish();
      return;
    }

    this.progress += dt / PROCEDURAL_DURATION;
    if (this.progress <= 0.15) {
      this.animNull.rotation.x = 0;
      this.animNull.position.y = 0;
    } else if (this.progress <= 1) {
      const normalized = (this.progress - 0.15) / 0.85;
      const eased = normalized * normalized;
      this.animNull.rotation.x = -eased * Math.PI / 3;
      this.animNull.position.y = eased * 0.4;
      if (normalized > 0.7) {
        this.animNull.scale.setScalar(1 - (normalized - 0.7) / 0.3);
      }
    } else {
      this.finish();
    }
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
      this.animNull.scale.setScalar(1);
    }
    this.axeModel?.scale.setScalar(1);
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
