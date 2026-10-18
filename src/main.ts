import * as THREE from "three";
import { TOTAL_ASSETS } from "./config/assets";
import { CAMERA, IS_MINIGAME, LIGHTING } from "./config/constants";
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
import {
  applyInkOutlines,
  applyParchmentGroundFade,
  applyParchmentStumpDiscFade,
} from "./art/parchmentLook";
import type { ArtSetId } from "./art/types";
import { isArtSetId } from "./art/registry";
import { COPY_C, DESIGN_C, getEconomy } from "./economy";
import { ScenePresenter } from "./core/scenePresent";
import {
  isGuideDone,
  loadParchmentTextures,
  markGuide,
  resetGuideForTests,
  trackGuide,
} from "./ui/parchment";
import type { GuideTargets, PanelMode, ParchmentUiState } from "./ui/parchment";

const renderer = createRenderer();
const scene = createScene();
const camera = new THREE.PerspectiveCamera(
  CAMERA.fov,
  window.innerWidth / window.innerHeight,
  CAMERA.near,
  CAMERA.far,
);

const controller = new CameraController(camera, renderer.domElement);
const { sun, ambient, direction: sunDirection } = createLights(scene);
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
let backgroundMap: THREE.Texture | null = null;
let clearGroundFade: (() => void) | null = null;
let clearStumpDiscFade: (() => void) | null = null;
let hemi: THREE.HemisphereLight | null = null;
const economy = getEconomy();
const presenter = new ScenePresenter(renderer);
let uiPanel: PanelMode = "none";
let uiToast: string | null = null;
let toastUntil = 0;
let uiBusy = false;
/** 首次引导：1–3；null 表示已完成/跳过 */
let guideStep: number | null = null;
let guideAdvanceAt = 0;
let guideTargets: GuideTargets = {};
let lastGuideTracked = 0;

function initGuideStep() {
  if (isGuideDone()) {
    guideStep = null;
    return;
  }
  // 开局无树根额度 → 从 2/3 开始
  guideStep = economy.canActiveChop() ? 1 : 2;
}

function showToast(text: string, ms = 2200) {
  uiToast = text;
  toastUntil = performance.now() + ms;
  syncParchmentHud();
}

function finishGuide(mark: "done" | "skipped" = "done") {
  const step = guideStep;
  guideStep = null;
  markGuide(mark);
  if (mark === "done") trackGuide("guide_complete");
  else trackGuide("guide_skip", { step: step ?? 0 });
  syncParchmentHud();
}

function syncParchmentHud() {
  const hud = ensureHud();
  if (!hud?.setParchmentUi) return;
  if (uiToast && performance.now() > toastUntil) uiToast = null;
  if (guideStep && guideStep !== lastGuideTracked) {
    trackGuide("guide_step_view", { step: guideStep });
    lastGuideTracked = guideStep;
  }
  const snap = economy.snapshot();
  const adLeft =
    DESIGN_C.ads.AD_OFFLINE_SKIP.dailyLimit - snap.state.ad_daily_offline_skip;
  const state: ParchmentUiState = {
    panel: uiPanel,
    toast: uiToast,
    loading: null,
    economy: snap,
    selfRank: { name: "我", pieces: snap.state.total_pieces, rank: 5 },
    guideStep,
    guideTargets,
    adRemaining: Math.max(0, adLeft),
  };
  hud.setParchmentUi(state);
}

function openExhaustedPanel() {
  if (guideStep) return;
  uiPanel = "exhausted";
  syncParchmentHud();
}

function projectLogTarget(): GuideTargets["log"] | undefined {
  if (!game) return undefined;
  const pieces = game.getSplittablePieces();
  if (!pieces.length) return undefined;
  const box = new THREE.Box3();
  for (const { mesh } of pieces) box.expandByObject(mesh);
  if (box.isEmpty()) return undefined;
  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const v = new THREE.Vector3();
  for (const c of corners) {
    v.copy(c).project(camera);
    const x = ((v.x + 1) / 2) * window.innerWidth;
    const y = ((-v.y + 1) / 2) * window.innerHeight;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const pad = 24;
  return {
    x: minX - pad,
    y: minY - pad,
    w: maxX - minX + pad * 2,
    h: maxY - minY + pad * 2,
  };
}

async function handleParchmentHit() {
  const hud = ensureHud();
  if (!hud?.hitTestParchment) return false;
  const pt = controller.peekClickClient();
  if (!pt) return false;
  const hit = hud.hitTestParchment(pt.x, pt.y);
  if (!hit) return false;

  // 引导第 1 步：不吞游戏点击（除 skip）
  if (guideStep === 1 && hit !== "guide_skip") {
    return false;
  }

  controller.cancelPendingClick();
  if (uiBusy) return true;

  if (hit === "guide_next" || hit === "guide_tap") {
    if (guideStep && guideStep < 3) {
      guideStep += 1;
      syncParchmentHud();
    } else {
      finishGuide("done");
    }
    return true;
  }
  if (hit === "guide_skip") {
    finishGuide("skipped");
    return true;
  }
  if (hit === "help_open") {
    // 玩法重看：不清 storage，完成/跳过时再写 done|skipped
    guideStep = economy.canActiveChop() ? 1 : 2;
    lastGuideTracked = 0;
    guideAdvanceAt = 0;
    uiPanel = "none";
    syncParchmentHud();
    return true;
  }
  if (hit === "rank_open") {
    uiPanel = "rank";
    syncParchmentHud();
    return true;
  }
  if (hit === "claim_strip") {
    uiPanel = "claim";
    syncParchmentHud();
    return true;
  }
  if (hit === "panel") return true;
  if (hit === "rank_close" || hit === "dismiss") {
    if (guideStep) return true;
    uiPanel = "none";
    syncParchmentHud();
    return true;
  }
  if (hit === "claim") {
    const n = economy.claim();
    showToast(n > 0 ? `已领取 ${n} 根` : COPY_C.resting);
    if (economy.snapshot().quotaExhausted && economy.snapshot().state.pending_claim > 0) {
      uiPanel = "exhausted";
    } else if (economy.snapshot().state.pending_claim <= 0) {
      uiPanel = "none";
    }
    syncParchmentHud();
    return true;
  }
  if (hit === "ad_skip" || hit === "ad_quota") {
    uiBusy = true;
    const placement = hit === "ad_skip" ? "AD_OFFLINE_SKIP" : "AD_QUOTA_PLUS";
    const res = await economy.watchAd(placement);
    uiBusy = false;
    if (!res.ok) {
      showToast(res.reason === "fail" || res.reason === "closed" ? COPY_C.adFail : "今日次数已用完");
    } else if (placement === "AD_QUOTA_PLUS") {
      showToast(COPY_C.quotaPlus);
      uiPanel = "none";
    } else {
      showToast(`${COPY_C.speedUp} +${res.gained ?? 0}`);
      uiPanel = "none";
    }
    syncParchmentHud();
    return true;
  }
  return true;
}

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

function applySetLighting(set: ArtSetResolved) {
  const parchment = set.id === "set4";
  if (parchment) {
    // 柔和暖光 + 高环境：影子是暖褐而不是死黑
    sun.color.set("#f2e6c8");
    sun.intensity = 1.85;
    sun.shadow.radius = 6;
    ambient.color.set("#eddcc0");
    ambient.intensity = 1.55;
    renderer.toneMappingExposure = 0.95;
    if (!hemi) {
      hemi = new THREE.HemisphereLight(0xf5ead2, 0xb8956a, 0.85);
      scene.add(hemi);
    }
    hemi.visible = true;
    gobo.setEnabled?.(false);
  } else {
    sun.color.set(LIGHTING.sunColor);
    sun.intensity = LIGHTING.sunIntensity;
    sun.shadow.radius = LIGHTING.shadowRadius;
    ambient.color.set(LIGHTING.ambientColor);
    ambient.intensity = LIGHTING.ambientIntensity;
    renderer.toneMappingExposure = 1;
    if (hemi) hemi.visible = false;
    gobo.setEnabled?.(true);
  }
}

async function applyArtAtmosphere(set: ArtSetResolved) {
  const parchment = set.id === "set4";
  applyGrassColors(grass, set.grass);
  grass.setInkMode?.(parchment);
  applySetLighting(set);

  // 羊皮纸：不用全屏贴图作 background（会与地面圆盘形成硬地平线），
  // 改用纸色天空 + 暖雾，地面边缘淡入雾色。
  if (backgroundMap) {
    backgroundMap.dispose();
    backgroundMap = null;
  }
  applyEnvironment(scene, set, null);
  if (scene.fog && (scene.fog as THREE.Fog).isFog) {
    const fog = scene.fog as THREE.Fog;
    if (parchment) {
      // 更近的雾：远场地面/桩盘溶进纸色，消硬缝
      fog.near = 3.2;
      fog.far = 11;
    } else {
      fog.near = 6;
      fog.far = 22;
    }
  }

  clearGroundFade?.();
  clearGroundFade = null;
  clearStumpDiscFade?.();
  clearStumpDiscFade = null;

  if (set.urls.groundColor) {
    try {
      const tex = await new THREE.TextureLoader().loadAsync(set.urls.groundColor);
      groundMap?.dispose();
      groundMap = tex;
      applyGroundLook(ground, set, groundMap);
    } catch {
      applyGroundLook(ground, set, null);
    }
  } else if (groundMap) {
    groundMap.dispose();
    groundMap = null;
    applyGroundLook(ground, set, null);
  } else {
    applyGroundLook(ground, set, null);
  }

  if (parchment) {
    // 地面圆盘半径 ≈ 14*FOOT ≈ 4.27m；淡出必须落在盘内，否则地平线仍是硬边
    clearGroundFade = applyParchmentGroundFade(ground, new THREE.Color(set.fog), {
      inner: 2.2,
      outer: 4.05,
    });
  }
}

async function applyResolvedArt(set: ArtSetResolved, opts?: { skipAxe?: boolean }) {
  await applyArtAtmosphere(set);

  const materials = await loadWoodMaterialsForSet(set.urls);
  const oldMaterials = debugMaterials;
  debugMaterials = materials;

  if (currentStump) {
    currentStump.dispose();
    currentStump = null;
  }
  currentStump = await loadStumpForSet(scene, renderer, set.urls);
  // 桩身描边靠烘焙墨线（反转外壳会 +~9k tris，超出 set1–3 预算）
  if (set.id === "set4" && currentStump) {
    clearStumpDiscFade = applyParchmentStumpDiscFade(
      currentStump.root,
      new THREE.Color(set.fog),
      { inner: 1.8, outer: 5.5, discY: -0.32 },
    );
  }

  if (!opts?.skipAxe) {
    await axe.reloadAxeModel(set.urls.axe);
  }
  if (set.id === "set4") {
    // 斧面数小，保留廉价外壳描边
    axe.withAxeModel((root) => applyInkOutlines(root, 1.03));
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
  presenter.applyScreenSize(window.innerWidth, window.innerHeight);
  void loadParchmentTextures(presenter.getUiDpr()).then(() => syncParchmentHud());
  const initial = await artSets.initFromStorage((p, text) => {
    progress.step();
    ensureHud()?.setStatus?.(text);
    void p;
  });
  await applyArtAtmosphere(initial);

  const [materials, stump] = await Promise.all([
    loadWoodMaterialsForSet(initial.urls, progress.step),
    loadStumpForSet(scene, renderer, initial.urls, progress.step),
    axe.ready,
  ]);
  // 启动时 axe 已按 MODELS.axe（set0）加载；若偏好非 set0 再换斧
  if (initial.id !== "set0") {
    await axe.reloadAxeModel(initial.urls.axe);
  }
  if (initial.id === "set4") {
    clearStumpDiscFade = applyParchmentStumpDiscFade(stump.root, new THREE.Color(initial.fog), {
      inner: 1.8,
      outer: 5.5,
      discY: -0.32,
    });
    axe.withAxeModel((root) => applyInkOutlines(root, 1.03));
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
    economy: {
      canActiveChop: () =>
        (guideStep === 1 || !guideStep) &&
        uiPanel === "none" &&
        economy.canActiveChop(),
      shouldBlockSpawn: () => !economy.canActiveChop(),
      onRootStacked: () => {
        economy.tryActiveStack();
        syncParchmentHud();
      },
      onQuotaBlocked: () => openExhaustedPanel(),
      onChopSettled: () => {
        if (guideStep === 1 && guideAdvanceAt <= 0) {
          guideAdvanceAt = performance.now() + 600;
        }
      },
    },
  });
  debugPile = pile;

  disposeGltfLoader();
  progress.finish();
  syncArtSwitcherHud(null);
  economy.settle();
  initGuideStep();
  uiPanel = "none";
  syncParchmentHud();
}

boot().catch((err) => console.error("启动失败:", err));

window.addEventListener("resize", () => {
  handleResize(camera, renderer);
  presenter.applyScreenSize(window.innerWidth, window.innerHeight);
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
  void handleParchmentHit();
  if (uiPanel === "none" && (!guideStep || guideStep === 1)) handleArtSwitcherClick();
  physics.update(dt);
  axe.update(dt);
  game?.update(dt);
  animator.update(dt);
  debugPile?.update();
  grass.update(dt);
  gobo.update(dt);

  if (guideStep === 1) {
    guideTargets = { ...guideTargets, log: projectLogTarget() };
    if (guideAdvanceAt > 0 && performance.now() >= guideAdvanceAt) {
      guideAdvanceAt = 0;
      guideStep = 2;
      syncParchmentHud();
    }
  } else if (guideStep === 2 || guideStep === 3) {
    // roots/icons 由 paintEconomyHud 每帧给出，sync 时带上
  }

  // 经济 HUD / 引导手势刷新
  if (guideStep === 1 || Math.floor(now / 500) !== Math.floor((now - dt * 1000) / 500)) {
    syncParchmentHud();
  } else if (uiToast && performance.now() > toastUntil) {
    syncParchmentHud();
  }

  presenter.present(() => {
    post.composer.render();
  });
  // HUD：独立 DOM 层或与屏缓冲 1:1 的 WebGL 叠加（不用系统 UI）
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
      economy: () => ({
        snapshot: () => economy.snapshot(),
        claim: () => economy.claim(),
        settle: () => economy.settle(),
        skipMinutes: (m: number) => economy.debugSkipMinutes(m),
        setRemaining: (n: number) => economy.debugSetRemaining(n),
        watchAd: (p: "AD_OFFLINE_SKIP" | "AD_QUOTA_PLUS") => economy.watchAd(p),
        openPanel: (p: PanelMode) => {
          guideStep = null;
          uiPanel = p;
          syncParchmentHud();
        },
        skipGuide: () => finishGuide("skipped"),
        resetGuide: () => {
          resetGuideForTests();
          guideStep = economy.canActiveChop() ? 1 : 2;
          lastGuideTracked = 0;
          uiPanel = "none";
          syncParchmentHud();
        },
        setGuideStep: (n: number) => {
          guideStep = Math.max(1, Math.min(3, Math.floor(n)));
          lastGuideTracked = 0;
          uiPanel = "none";
          syncParchmentHud();
        },
        guideStep: () => guideStep,
        chops: () => game?.chopsOnCurrentRoot ?? 0,
        roots: () => game?.rootsFelledCount ?? 0,
      }),
      art: () => ({
        active: artSets.activeId,
        labels: artSets.labels(),
        switchTo: (id: string) => {
          if (isArtSetId(id)) return switchArtSet(id);
          return Promise.reject(new Error("bad set id"));
        },
        /** 便于 harness 轮询 */
        isSwitching: () => artSwitching,
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
