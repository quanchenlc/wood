import * as THREE from "three";
import { MODELS } from "../config/assets";
import type { CameraController } from "../camera/CameraController";
import { createGltfLoader } from "../core/gltf";
import type { ProgressFn } from "../core/loading";

/**
 * 斧头挥砍动画 —— 0.4.0 起完全用自研关键帧，不再加载 ax_anim_*.glb。
 * 节奏：预备抬起 → 下劈撞击 → 短暂停顿 → 淡出（总长约 0.28s，贴近原手感）。
 */
const SWING_MS = {
  windup: 0.06,
  strike: 0.12,
  hold: 0.04,
  fade: 0.06,
};
const SWING_TOTAL =
  SWING_MS.windup + SWING_MS.strike + SWING_MS.hold + SWING_MS.fade;

export class AxeAnimation {
  private readonly scene: THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly cameraController: CameraController;
  private readonly pivot = new THREE.Object3D();
  private animNull: THREE.Object3D | null = null;
  private animScene: THREE.Object3D | null = null;
  private axeModel: THREE.Object3D | null = null;
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
    this.renderer = renderer;
    this.cameraController = cameraController;
    this.pivot.visible = false;
    scene.add(this.pivot);
    this.ready = this.load(renderer, onProgress);
  }

  private async load(renderer: THREE.WebGLRenderer, onProgress?: ProgressFn) {
    const loader = createGltfLoader(renderer);
    try {
      // 仅加载自研斧模；挥砍轨道路径代码生成
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
        // No envMap: metalness>0 mirrors the blue sky → "flat blue box".
        // Painted steel albedo + warm tint; ORM drives roughness only.
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
    this.axeModel.position.set(0, 0, 0);
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

  playFromImpact(point: THREE.Vector3, _sliceNormal: THREE.Vector3) {
    if (!this.readyState || !this.animNull || !this.animScene) return;
    this.playSerial++;
    this.playing = true;
    this.progress = 0;
    this.pivot.position.copy(point);
    this.orientToCamera();
    this.axeModel?.scale.setScalar(1);
    this.animNull.rotation.set(0, 0, 0);
    this.animNull.position.set(0, 0, 0);
    this.animNull.scale.setScalar(1);
    this.pivot.visible = true;
    this.animScene.visible = true;
  }

  update(dt: number) {
    if (!this.playing || !this.readyState || !this.animNull) return;
    this.orientToCamera();
    this.progress += dt / SWING_TOTAL;
    const t = Math.min(1, this.progress);
    const elapsed = t * SWING_TOTAL;

    let rotX = 0;
    let posY = 0;
    let scale = 1;

    if (elapsed <= SWING_MS.windup) {
      const u = elapsed / SWING_MS.windup;
      const e = u * u;
      rotX = e * 0.35;
      posY = e * 0.12;
    } else if (elapsed <= SWING_MS.windup + SWING_MS.strike) {
      const u = (elapsed - SWING_MS.windup) / SWING_MS.strike;
      // ease-in strike
      const e = u * u * (3 - 2 * u);
      rotX = 0.35 - e * (0.35 + Math.PI / 2.6);
      posY = 0.12 - e * 0.35;
    } else if (elapsed <= SWING_MS.windup + SWING_MS.strike + SWING_MS.hold) {
      rotX = -Math.PI / 2.6;
      posY = -0.23;
    } else {
      const u =
        (elapsed - SWING_MS.windup - SWING_MS.strike - SWING_MS.hold) / SWING_MS.fade;
      rotX = -Math.PI / 2.6;
      posY = -0.23;
      scale = Math.max(0, 1 - u);
    }

    this.animNull.rotation.x = rotX;
    this.animNull.position.y = posY;
    this.animNull.scale.setScalar(1);
    this.axeModel?.scale.setScalar(scale);

    if (t >= 1) this.finish();
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
    this.axeModel?.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const m = mesh.material;
      Array.isArray(m) ? m.forEach((x) => x.dispose()) : m?.dispose();
    });
  }
}
