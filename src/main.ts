import * as THREE from "three";
import { TOTAL_ASSETS } from "./config/assets";
import { CAMERA, IS_MINIGAME } from "./config/constants";
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
import type { Stump } from "./world/stump";
import { createLog } from "./wood/logFactory";
import type { WoodMaterials } from "./wood/materials";
import { warmUpSlicePipeline } from "./wood/warmup";
import { ensureHud, compositeHud } from "./platform/runtime";
import {
  ArtSetController,
  applyEnvironment,
  applyGrassColors,
  applyGroundLook,
  loadStumpForSet,
  loadWoodMaterialsForSet,
  type ArtSetResolved,
} from "./art/ArtSetController";
import type { ArtSetId } from "./art/types";
import { isArtSetId } from "./art/registry";

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
const ground = createGround(scene);
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
const artSets = new ArtSetController();

let game: GameController | null = null;
let debugPile: FirewoodPile | null = null;
let debugMaterials: WoodMaterials | null = null;
let currentStump: Stump | null = null;
let artPickerOpen = false;
let artSwitching = false;
let groundMap: THREE.Texture | null = null;

function syncArtSwitcherHud(loadingText?: string | null) {
  const hud = ensureHud();
  hud?.setArtSwitcher?.({
    visible: IS_MINIGAME || Boolean(hud),
    open: artPickerOpen,
    activeId: artSets.activeId,
    options: artSets.labels(),
    loadingText: loadingText ?? null,
  });
}

async function applyResolvedArt(set: ArtSetResolved, opts?: { skipAxe?: boolean }) {
  applyEnvironment(scene, set);
  applyGrassColors(grass, set.grass);
  applyGroundLook(ground, set, groundMap);

  if (set.urls.groundColor) {
    try {
      const tex = await new THREE.TextureLoader().loadAsync(set.urls.groundColor);
      groundMap?.dispose();
      groundMap = tex;
      applyGroundLook(ground, set, groundMap);
    } catch {
      /* optional */
    }
  } else if (groundMap) {
    groundMap.dispose();
    groundMap = null;
    applyGroundLook(ground, set, null);
  }

  const materials = await loadWoodMaterialsForSet(set.urls);
  const oldMaterials = debugMaterials;
  debugMaterials = materials;

  if (currentStump) {
    currentStump.dispose();
    currentStump = null;
  }
  currentStump = await loadStumpForSet(scene, renderer, set.urls);

  if (!opts?.skipAxe) {
    await axe.reloadAxeModel(set.urls.axe);
  }

  if (game && debugPile) {
    game.applyArtMaterials(materials);
  }

  oldMaterials?.dispose();
  artSets.persist(set.id);
  syncArtSwitcherHud(null);
}

async function switchArtSet(id: ArtSetId) {
  if (artSwitching || id === artSets.activeId) {
    artPickerOpen = false;
    syncArtSwitcherHud(null);
    return;
  }
  if (game && game.currentState !== "IDLE" && game.currentState !== "SPAWNING") return;
  if (axe.busy) return;

  artSwitching = true;
  artPickerOpen = false;
  const label = artSets.labels().find((l) => l.id === id)?.label || id;
  syncArtSwitcherHud(`加载${label}…`);
  try {
    const set = await artSets.ensureLoaded(id, (p, text) => {
      syncArtSwitcherHud(`${text} ${Math.round(p * 100)}%`);
    });
    await applyResolvedArt(set);
  } catch (err) {
    console.warn("[art] switch failed", err);
    syncArtSwitcherHud(null);
  } finally {
    artSwitching = false;
  }
}

function handleArtSwitcherClick() {
  const hud = ensureHud();
  if (!hud?.hitTestArtSwitcher) return false;
  const pt = controller.peekClickClient();
  if (!pt) return false;
  const hit = hud.hitTestArtSwitcher(pt.x, pt.y);
  if (!hit) return false;
  controller.cancelPendingClick();
  if (hit === "toggle") {
    artPickerOpen = !artPickerOpen;
    syncArtSwitcherHud(artSwitching ? "加载中…" : null);
    return true;
  }
  if (isArtSetId(hit)) {
    void switchArtSet(hit);
    return true;
  }
  return false;
}

async function boot() {
  const initial = await artSets.initFromStorage((p, text) => {
    progress.step();
    ensureHud()?.setStatus?.(text);
    void p;
  });
  applyEnvironment(scene, initial);
  applyGrassColors(grass, initial.grass);
  applyGroundLook(ground, initial, null);

  const [materials, stump] = await Promise.all([
    loadWoodMaterialsForSet(initial.urls, progress.step),
    loadStumpForSet(scene, renderer, initial.urls, progress.step),
    axe.ready,
  ]);
  // 启动时 axe 已按 MODELS.axe（set0）加载；若偏好非 set0 再换斧
  if (initial.id !== "set0") {
    await axe.reloadAxeModel(initial.urls.axe);
  }

  currentStump = stump;
  physics.addStumpCollider(stump.topY, stump.topRadius);

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

  disposeGltfLoader();
  progress.finish();
  syncArtSwitcherHud(null);
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
  handleArtSwitcherClick();
  physics.update(dt);
  axe.update(dt);
  game?.update(dt);
  animator.update(dt);
  debugPile?.update();
  grass.update(dt);
  gobo.update(dt);

  post.composer.render();
  // 小游戏 loading / 提示叠在 WebGL 之上（canvas 自绘，不用系统 UI）
  compositeHud(renderer);
}
frame();

// 仅 Web DEV 或 harness 显式打开调试钩子；正式小游戏构建不挂 __fw。
const enableDebugHooks =
  import.meta.env.DEV ||
  (typeof globalThis !== "undefined" &&
    Boolean((globalThis as { __FIREWOOD_ENABLE_DEBUG__?: boolean }).__FIREWOOD_ENABLE_DEBUG__));

if (enableDebugHooks) {
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
      art: () => ({
        active: artSets.activeId,
        labels: artSets.labels(),
        switchTo: (id: string) => {
          if (isArtSetId(id)) return switchArtSet(id);
          return Promise.reject(new Error("bad set id"));
        },
      }),
      /** 性能画像：按物体汇总 verts/tris，并读 renderer.info */
      perf: () => {
        renderer.info.reset();
        post.composer.render();
        const byName: Record<
          string,
          { meshes: number; verts: number; tris: number; castShadow: number }
        > = {};
        let meshes = 0;
        let verts = 0;
        let tris = 0;
        let castShadow = 0;
        scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh || !mesh.geometry) return;
          meshes++;
          const geo = mesh.geometry;
          const v = geo.getAttribute("position")?.count ?? 0;
          const idx = geo.getIndex();
          const inst =
            (mesh as THREE.InstancedMesh).isInstancedMesh
              ? (mesh as THREE.InstancedMesh).count || 1
              : 1;
          const t = (idx ? idx.count / 3 : v / 3) * inst;
          const vv = v * inst;
          verts += vv;
          tris += t;
          if (mesh.castShadow) castShadow++;
          const label = (mesh as THREE.InstancedMesh).isInstancedMesh
            ? "grass(instanced)"
            : mesh.name || mesh.parent?.name || geo.type || "mesh";
          const slot = (byName[label] ??= { meshes: 0, verts: 0, tris: 0, castShadow: 0 });
          slot.meshes++;
          slot.verts += vv;
          slot.tris += t;
          if (mesh.castShadow) slot.castShadow++;
        });
        const info = renderer.info;
        const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
        return {
          summary: {
            meshes,
            verts: Math.round(verts),
            tris: Math.round(tris),
            castShadowMeshes: castShadow,
            drawCalls: info.render.calls,
            trianglesDrawn: info.render.triangles,
            geometries: info.memory.geometries,
            textures: info.memory.textures,
            jsHeapMB: mem ? Number((mem.usedJSHeapSize / 1048576).toFixed(1)) : null,
            pixelRatio: renderer.getPixelRatio(),
          },
          byName,
        };
      },
    },
  });
}
