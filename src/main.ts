import * as THREE from "three";
import { TOTAL_ASSETS } from "./config/assets";
import { CAMERA } from "./config/constants";
import { AxeAnimation } from "./anim/AxeAnimation";
import { PieceAnimator } from "./anim/PieceAnimator";
import { AudioManager } from "./audio/AudioManager";
import { CameraController, handleResize } from "./camera/CameraController";
import { LoadingProgress } from "./core/loading";
import { createLights } from "./core/lights";
import { createPost } from "./core/postprocess";
import { disposeGltfLoader } from "./core/gltf";
import { createRenderer, createScene } from "./core/renderer";
import { DebugLine } from "./debug/DebugLine";
import { GameController } from "./game/GameController";
import { Physics } from "./physics/Physics";
import { FirewoodPile } from "./pile/FirewoodPile";
import { createGobo } from "./world/gobo";
import { createGrass } from "./world/grass";
import { createGround } from "./world/ground";
import { loadStump } from "./world/stump";
import { createLog } from "./wood/logFactory";
import { loadWoodMaterials, type WoodMaterials } from "./wood/materials";
import { warmUpSlicePipeline } from "./wood/warmup";
import { ensureHud, isMinigameRuntime } from "./platform/runtime";

const renderer = createRenderer();
const scene = createScene();
const camera = new THREE.PerspectiveCamera(
  CAMERA.fov,
  window.innerWidth / window.innerHeight,
  CAMERA.near,
  CAMERA.far,
);

const controller = new CameraController(camera, renderer.domElement);
const { direction: sunDirection } = createLights(scene);
createGround(scene);
const grass = createGrass(scene, sunDirection);
const gobo = createGobo(scene, sunDirection);

const post = createPost(renderer, scene, camera);
post.excludeFromDepth(grass.mesh);

const progress = new LoadingProgress(TOTAL_ASSETS);
const physics = new Physics();
const animator = new PieceAnimator();
const audio = new AudioManager(camera, progress.step);
const debugLine = new DebugLine(scene);
const axe = new AxeAnimation(scene, renderer, controller, progress.step);

let game: GameController | null = null;
let debugPile: FirewoodPile | null = null;
let debugMaterials: WoodMaterials | null = null;

async function boot() {
  const [materials, stump] = await Promise.all([
    loadWoodMaterials(progress.step),
    loadStump(scene, renderer, progress.step),
    axe.ready,
  ]);

  physics.addStumpCollider(stump.topY, stump.topRadius);

  // 趁 loading 还没消失,把第一次切割的卡顿消化掉
  warmUpSlicePipeline(scene, renderer, camera, materials);

  const pile = new FirewoodPile({
    scene,
    materials,
    onLand: () => audio.play("stack", 0.5),
  });
  debugMaterials = materials;
  game = new GameController({
    scene,
    camera,
    controller,
    debugLine,
    physics,
    animator,
    axe,
    audio,
    materials,
    stumpTopY: stump.topY,
    pile,
  });
  debugPile = pile;

  // 模型都加载完了,transcoder 的 worker 池可以收掉
  disposeGltfLoader();

  progress.finish();
  showHint();
}

function showHint() {
  const coarse =
    typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const actionText = "点击劈开";

  const hud = ensureHud();
  if (hud) {
    hud.showHint(actionText);
    const dismiss = () => {
      hud.hideHint();
      window.removeEventListener("pointerdown", dismiss);
    };
    window.addEventListener("pointerdown", dismiss);
    return;
  }

  const hint = document.getElementById("hint");
  if (!hint) return;
  const action = document.getElementById("hint-action");
  if (action && coarse) action.textContent = actionText;
  hint.hidden = false;

  const dismiss = () => {
    hint.classList.add("fade-out");
    setTimeout(() => hint.remove(), 900);
    window.removeEventListener("pointerdown", dismiss);
  };
  window.addEventListener("pointerdown", dismiss);
}

boot().catch((err) => console.error("启动失败:", err));

window.addEventListener("resize", () => {
  handleResize(camera, renderer);
  post.setSize(window.innerWidth, window.innerHeight);
});
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("selectstart", (e) => e.preventDefault());

window.addEventListener("beforeunload", () => {
  game?.dispose();
  axe.dispose();
  grass.dispose();
  gobo.dispose();
  audio.dispose();
  physics.dispose();
  post.dispose();
  controller.dispose();
  debugLine.dispose();
  renderer.dispose();
});

let last = performance.now();
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  // 切标签页回来时 dt 会非常大,夹住上限免得物理炸开
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  controller.update(dt);
  physics.update(dt);
  axe.update(dt);
  game?.update(dt);
  animator.update(dt);
  debugPile?.update();
  grass.update(dt);
  gobo.update(dt);

  post.composer.render();
}
frame();

// Web 开发模式 + 小游戏（含仿真 harness）都挂调试钩子，方便自动截图/点砍。
if (import.meta.env.DEV || isMinigameRuntime()) {
  Object.assign(window, {
    __fw: {
      look: (deg: number) => controller.setAzimuth((deg * Math.PI) / 180),
      nudge: (direction: number) => controller.nudgeAzimuth(direction),
      axe: () =>
        axe.playFromImpact(new THREE.Vector3(0, 0.2, 0), controller.getRight()),
      pile: () => ({
        height: debugPile?.height ?? 0,
        isAnimating: debugPile?.isAnimating ?? false,
        settled: debugPile?.layout.map((shape) => ({
          x: shape.position.x,
          y: shape.position.y,
          angle: shape.angle,
          width: shape.halfWidth * 2,
          height: shape.halfHeight * 2,
        })) ?? [],
      }),
      stackTest: (count: number) => {
        if (!debugPile || !debugMaterials || debugPile.isAnimating) return false;
        const pieces = Array.from({ length: count }, () => createLog(debugMaterials!).mesh);
        for (const piece of pieces) scene.add(piece);
        debugPile.startStacking(pieces);
        return true;
      },
      state: () => ({
        game: game?.currentState ?? "BOOTING",
        axe: axe.currentPhase,
        axePlayCount: axe.playCount,
        stacked: game?.stackedCount ?? 0,
        diagnostics: game?.diagnostics,
        cameraAzimuth: controller.currentAzimuth,
        cameraTargetAzimuth: controller.targetAzimuth,
      }),
      click: () => game?.handleClick(),
    },
  });
}
