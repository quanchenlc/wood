import * as THREE from "three";
import { TOTAL_ASSETS } from "./config/assets";
import { CAMERA, LIGHTING } from "./config/constants";
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
  CLOSE_MS,
  HEIGHT_MORPH_MS,
  OPEN_MS,
  buildMockRankRows,
  capsuleTopPt,
  easeUnroll,
  invertEase,
  isGuideDone,
  isLandscape,
  loadParchmentTextures,
  markGuide,
  motionAt,
  resetGuideForTests,
  stateClose,
  stateOpen,
  targetDrawerH1,
  trackGuide,
  writeStyleId,
} from "./ui/parchment";
import type {
  DrawerPage,
  GuideTargets,
  PanelMode,
  ParchmentUiState,
  RankRow,
} from "./ui/parchment";
import { ART_SET_CATALOG } from "./art/registry";
import {
  readStumpVariant,
  writeStumpVariant,
  stumpVariantUrls,
  type StumpVariantId,
} from "./art/stumpVariant";
import { loadStump } from "./world/stump";
import { formatCountdown } from "./economy/time";

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

/** 抽屉动画：q 线性 0..1，opening 表示朝打开方向 */
let drawerQ: number | null = null;
let drawerOpening = true;
let drawerAnimating = false;
let drawerAnimStart = 0;
let drawerAnimFromQ = 0;
let drawerAnimDur = OPEN_MS;
let drawerPage: DrawerPage = "main";
let drawerDragP: number | null = null;
/** 纸面高度（pt）：main↔rank morph 插值后的当前值 */
let drawerH1: number | null = null;
let heightMorphFrom = 0;
let heightMorphTo = 0;
let heightMorphStart = 0;
let heightMorphActive = false;
let rankScrollY = 0;
let styleScrollY = 0;
let rankRowsCache: RankRow[] = [];
let listScrollDragging: "rank" | "style" | null = null;
let listScrollLastY = 0;
let listScrollMoved = false;
let listScrollPickMeta: string | null = null;
let claimFlash: string | null = null;
let claimFlashUntil = 0;
let showRedDot = false;
let lastSeenRedHash = "";
let exhaustedBubble: { text: string; until: number } | null = null;
let exhaustedAutoShownDay = "";
let styleSwitching = false;
let stumpVariant: StumpVariantId = readStumpVariant();
let groundFloorMap: THREE.Texture | null = null;

const STYLE_COLORS: Record<string, string> = {
  set0: "#b4966e",
  set1: "#608052",
  set2: "#d68c46",
  set3: "#c47878",
  set4: "#ceb688",
};

function initGuideStep() {
  if (isGuideDone()) {
    guideStep = null;
    return;
  }
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
  closeDrawer(true);
  syncParchmentHud();
}

function redDotHash(snap = economy.snapshot()): string {
  const adLeft =
    DESIGN_C.ads.AD_OFFLINE_SKIP.dailyLimit - snap.state.ad_daily_offline_skip;
  const boost = snap.boosting ? 1 : 0;
  return `${snap.state.pending_claim}|${adLeft}|${boost}`;
}

function refreshRedDot(openingDrawer = false) {
  const snap = economy.snapshot();
  const hash = redDotHash(snap);
  if (openingDrawer) {
    lastSeenRedHash = hash;
    showRedDot = false;
    return;
  }
  if (guideStep || uiPanel !== "none" || snap.state.daily_remaining <= 0) {
    showRedDot = false;
    return;
  }
  if (hash !== lastSeenRedHash) {
    const adLeft =
      DESIGN_C.ads.AD_OFFLINE_SKIP.dailyLimit - snap.state.ad_daily_offline_skip;
    showRedDot =
      snap.state.pending_claim > 0 || (adLeft > 0 && !snap.boosting);
  }
}

function screenSize() {
  return {
    w: window.innerWidth || 375,
    h: window.innerHeight || 812,
  };
}

function ensureRankRows() {
  if (rankRowsCache.length >= 15) return rankRowsCache;
  const snap = economy.snapshot();
  rankRowsCache = buildMockRankRows(snap.state.total_pieces, "我");
  return rankRowsCache;
}

function currentTargetH1(page: DrawerPage = drawerPage): number {
  const { w, h } = screenSize();
  return targetDrawerH1(h, isLandscape(w, h), page);
}

function resolveDrawerH1(): number {
  if (heightMorphActive) {
    const t = Math.min(
      1,
      (performance.now() - heightMorphStart) / HEIGHT_MORPH_MS,
    );
    const e = easeUnroll(t);
    drawerH1 = heightMorphFrom + (heightMorphTo - heightMorphFrom) * e;
    if (t >= 1) {
      heightMorphActive = false;
      drawerH1 = heightMorphTo;
    }
    return drawerH1;
  }
  if (drawerH1 == null) drawerH1 = currentTargetH1();
  return drawerH1;
}

/** 切抽屉内页：竖屏 main↔rank 做 250ms 高度 morph；横屏近铺满不变 */
function setDrawerPage(page: DrawerPage) {
  const { w, h } = screenSize();
  const landscape = isLandscape(w, h);
  const from = resolveDrawerH1();
  drawerPage = page;
  if (page === "rank") ensureRankRows();
  else rankScrollY = 0;
  if (page === "style") styleScrollY = styleScrollToRevealSelection();
  else styleScrollY = 0;
  const to = targetDrawerH1(h, landscape, page);
  if (!landscape && Math.abs(from - to) > 0.5) {
    heightMorphFrom = from;
    heightMorphTo = to;
    heightMorphStart = performance.now();
    heightMorphActive = true;
  } else {
    heightMorphActive = false;
    drawerH1 = to;
  }
  syncParchmentHud();
}

function openDrawer(src: "tap" | "drag" | "guide" = "tap", fromP?: number) {
  if (uiPanel !== "none") return;
  const snap = economy.snapshot();
  if (snap.state.daily_remaining <= 0 && !guideStep) {
    openExhaustedPanel();
    return;
  }
  refreshRedDot(true);
  trackGuide("drawer_open", { src });
  const p0 = fromP ?? (drawerQ != null ? (drawerOpening ? stateOpen(drawerQ).p : stateClose(1 - (drawerQ ?? 0)).p) : 0);
  const q0 = invertEase(Math.max(0, Math.min(1, p0)), true);
  drawerOpening = true;
  drawerAnimating = true;
  drawerAnimStart = performance.now();
  drawerAnimFromQ = q0;
  drawerAnimDur = OPEN_MS * (1 - q0);
  drawerQ = q0;
  drawerDragP = null;
  drawerPage = "main";
  rankScrollY = 0;
  styleScrollY = 0;
  heightMorphActive = false;
  drawerH1 = currentTargetH1("main");
  syncParchmentHud();
}

function closeDrawer(instant = false) {
  if (drawerQ == null && !drawerAnimating) return;
  if (instant) {
    drawerQ = null;
    drawerAnimating = false;
    drawerDragP = null;
    drawerPage = "main";
    rankScrollY = 0;
    styleScrollY = 0;
    heightMorphActive = false;
    drawerH1 = currentTargetH1("main");
    syncParchmentHud();
    return;
  }
  const pNow =
    drawerDragP ??
    (drawerQ != null
      ? drawerOpening
        ? stateOpen(drawerQ).p
        : stateClose(1 - drawerQ).p
      : 1);
  const qClose = invertEase(Math.max(0, Math.min(1, pNow)), false);
  drawerOpening = false;
  drawerAnimating = true;
  drawerAnimStart = performance.now();
  drawerAnimFromQ = qClose;
  drawerAnimDur = CLOSE_MS * (1 - qClose);
  drawerQ = 1 - qClose;
  drawerDragP = null;
  syncParchmentHud();
}

function syncParchmentHud() {
  const hud = ensureHud();
  if (!hud?.setParchmentUi) return;
  if (uiToast && performance.now() > toastUntil) uiToast = null;
  if (claimFlash && performance.now() > claimFlashUntil) claimFlash = null;
  if (exhaustedBubble && performance.now() > exhaustedBubble.until) {
    exhaustedBubble = null;
  }
  if (guideStep && guideStep !== lastGuideTracked) {
    trackGuide("guide_step_view", { step: guideStep });
    lastGuideTracked = guideStep;
  }
  refreshRedDot(false);
  const snap = economy.snapshot();
  const adLeft =
    DESIGN_C.ads.AD_OFFLINE_SKIP.dailyLimit - snap.state.ad_daily_offline_skip;
  const styleId = artSets.activeId;
  const styleLabel =
    ART_SET_CATALOG.find((e) => e.id === styleId)?.label || "羊皮纸";

  let motion = null as ReturnType<typeof stateOpen> | null;
  if (drawerDragP != null) {
    motion = motionAt(drawerDragP, 0, 0.3 * Math.min(1, drawerDragP));
  } else if (drawerQ != null) {
    motion = drawerOpening ? stateOpen(drawerQ) : stateClose(1 - drawerQ);
  }

  const selfPieces = snap.state.total_pieces;
  const rows = drawerPage === "rank" ? ensureRankRows() : rankRowsCache;
  const selfIdx = rows.findIndex((r) => r.self);
  const state: ParchmentUiState = {
    panel: uiPanel,
    toast: uiToast,
    loading: null,
    economy: snap,
    selfRank: {
      name: "我",
      pieces: selfPieces,
      rank: selfIdx >= 0 ? selfIdx + 1 : 5,
    },
    guideStep,
    guideTargets,
    adRemaining: Math.max(0, adLeft),
    drawerQ,
    drawerOpening,
    drawerPage,
    drawerMotion: motion,
    drawerH1: resolveDrawerH1(),
    rankScrollY,
    styleScrollY,
    rankRows: rows,
    showRedDot,
    styleId,
    styleLabel,
    styleOptions: ART_SET_CATALOG.map((e) => ({
      id: e.id,
      label: e.label,
      color: STYLE_COLORS[e.id] || "#ceb688",
    })),
    stumpVariant,
    styleSwitching,
    exhaustedBubble,
    capsuleTop: capsuleTopPt(),
    claimFlash,
  };
  hud.setParchmentUi(state);
}

function openExhaustedPanel() {
  if (guideStep) return;
  uiPanel = "exhausted";
  closeDrawer(true);
  syncParchmentHud();
}

function maybeAutoExhausted() {
  if (guideStep) return;
  const snap = economy.snapshot();
  if (snap.state.daily_remaining > 0) return;
  const day = snap.state.today_date;
  if (exhaustedAutoShownDay === day) return;
  exhaustedAutoShownDay = day;
  setTimeout(() => openExhaustedPanel(), 600);
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

  // 引导第 1 步：不吞游戏点击（除 skip / tag）
  if (guideStep === 1 && hit !== "guide_skip") {
    return false;
  }

  controller.cancelPendingClick();
  if (uiBusy) return true;

  if (hit === "guide_next" || hit === "guide_tap") {
    if (guideStep === 2) {
      guideStep = 3;
      openDrawer("guide");
      syncParchmentHud();
    } else if (guideStep && guideStep < 3) {
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
  if (hit === "tag") {
    if (guideStep === 2) {
      guideStep = 3;
      openDrawer("guide");
      return true;
    }
    if (drawerQ != null && (drawerOpening ? drawerQ > 0.5 : drawerQ < 0.5)) {
      closeDrawer();
    } else {
      openDrawer("tap");
    }
    return true;
  }
  if (hit === "drawer_mask") {
    closeDrawer();
    return true;
  }
  if (hit === "style_open") {
    setDrawerPage("style");
    return true;
  }
  if (hit === "style_back") {
    setDrawerPage("main");
    return true;
  }
  if (hit === "rank_list" || hit === "style_list") {
    // 点击落在列表上：不关抽屉；滚动由 pointer 手势处理
    return true;
  }
  if (hit === "style_pick") {
    const full = hud.hitTestParchmentFull?.(pt.x, pt.y);
    const id = full?.meta;
    if (id === "stumpA" || id === "stumpB") {
      styleSwitching = true;
      syncParchmentHud();
      void applyStumpVariant(id === "stumpA" ? "A" : "B", { force: true }).finally(() => {
        styleSwitching = false;
        syncParchmentHud();
      });
      return true;
    }
    if (id && isArtSetId(id)) {
      styleSwitching = true;
      writeStyleId(id);
      syncParchmentHud();
      void switchArtSet(id).finally(() => {
        styleSwitching = false;
        syncParchmentHud();
      });
    }
    return true;
  }
  if (hit === "help_open") {
    closeDrawer(true);
    guideStep = economy.canActiveChop() ? 1 : 2;
    lastGuideTracked = 0;
    guideAdvanceAt = 0;
    uiPanel = "none";
    syncParchmentHud();
    return true;
  }
  if (hit === "rank_open") {
    // 0.3.5+：柴榜为抽屉内页；0.3.6 加高纸面
    uiPanel = "none";
    setDrawerPage("rank");
    return true;
  }
  if (hit === "rank_back" || hit === "rank_close") {
    uiPanel = "none";
    setDrawerPage("main");
    return true;
  }
  if (hit === "panel") return true;
  if (hit === "dismiss" || hit === "exhausted_ok") {
    if (guideStep) return true;
    uiPanel = "none";
    syncParchmentHud();
    return true;
  }
  if (hit === "claim_free") {
    const n = economy.claim();
    claimFlash = n > 0 ? `已入柴棚 +${n}` : COPY_C.resting;
    claimFlashUntil = performance.now() + 1200;
    if (economy.snapshot().state.pending_claim <= 0 && uiPanel === "exhausted") {
      /* keep panel if still exhausted */
    }
    syncParchmentHud();
    return true;
  }
  if (hit === "bubble_ad" || hit === "ad_skip" || hit === "ad_quota") {
    uiBusy = true;
    const placement =
      hit === "ad_skip" ? "AD_OFFLINE_SKIP" : "AD_QUOTA_PLUS";
    const res = await economy.watchAd(placement);
    uiBusy = false;
    if (!res.ok) {
      showToast(
        res.reason === "fail" || res.reason === "closed"
          ? COPY_C.adFail
          : "今日次数已用完",
      );
    } else if (placement === "AD_QUOTA_PLUS") {
      showToast(COPY_C.quotaPlus);
      uiPanel = "none";
      exhaustedBubble = null;
    } else {
      showToast(`${COPY_C.speedUp} +${res.gained ?? 0}`);
    }
    syncParchmentHud();
    return true;
  }
  return true;
}

function syncArtSwitcherHud(_loadingText?: string | null) {
  // 0.3.4：左下艺术切换已移除，入口在抽屉「风格」行
  const hud = ensureHud();
  hud?.setArtSwitcher?.({
    visible: false,
    open: false,
    activeId: artSets.activeId,
    options: [],
    loadingText: null,
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

async function applyStumpVariant(id: StumpVariantId, opts?: { force?: boolean }) {
  if (!opts?.force && id === stumpVariant && currentStump) {
    return;
  }
  stumpVariant = id;
  writeStumpVariant(id);
  const urls = stumpVariantUrls(id);
  if (currentStump) {
    currentStump.dispose();
    currentStump = null;
  }
  currentStump = await loadStump(scene, renderer, undefined, {
    stump: urls.stump,
    stumpLod: urls.stumpLod,
    stumpData: urls.stumpData,
  });
  // 森林地面贴图（final_A：512² tile，需 6×6 repeat；勿放进 applyGroundFromSet）
  try {
    const tex = await new THREE.TextureLoader().loadAsync(urls.groundFloor);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 6);
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    groundFloorMap?.dispose();
    groundFloorMap = tex;
    const mat = ground.material as THREE.MeshStandardMaterial;
    mat.map = tex;
    mat.color.set(0xffffff);
    mat.needsUpdate = true;
  } catch (err) {
    console.warn("[stump] ground floor", err);
  }
  if (game) {
    // 物理碰撞半径不变（常量）；仅视觉替换
  }
  syncParchmentHud();
}

async function switchArtSet(id: ArtSetId) {
  if (artSwitching || id === artSets.activeId) {
    syncArtSwitcherHud(null);
    return;
  }
  if (game && game.currentState !== "IDLE" && game.currentState !== "SPAWNING") return;
  if (axe.busy) return;

  artSwitching = true;
  styleSwitching = true;
  syncParchmentHud();
  try {
    const set = await artSets.ensureLoaded(id, (_p, _text) => {
      /* 进度显示在小签「切换中…」 */
    });
    await applyResolvedArt(set);
    writeStyleId(id);
    // 艺术套装切换后仍叠当前木桩变体
    await applyStumpVariant(stumpVariant, { force: true });
  } catch (err) {
    console.warn("[art] switch failed", err);
  } finally {
    artSwitching = false;
    styleSwitching = false;
    syncArtSwitcherHud(null);
    syncParchmentHud();
  }
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
  // 0.4.0：默认木桩 A（CC0 扫描），可切 B
  await applyStumpVariant(stumpVariant, { force: true });

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
        drawerQ == null &&
        !drawerAnimating &&
        economy.canActiveChop(),
      shouldBlockSpawn: () => !economy.canActiveChop(),
      onRootStacked: () => {
        economy.tryActiveStack();
        lastSeenRedHash = ""; // 新状态可再亮红点
        syncParchmentHud();
      },
      onQuotaBlocked: () => {
        if (guideStep) return;
        const snap = economy.snapshot();
        const text = snap.quotaExhausted
          ? "今日蓄养中 · 明天 0 点恢复"
          : `今日蓄养中 · ${formatCountdown(snap.nextRootMs)} 后长出`;
        exhaustedBubble = { text, until: performance.now() + 6000 };
        maybeAutoExhausted();
        syncParchmentHud();
      },
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

/** 柴榜列表最大滚动（与 paintRankPage 几何对齐） */
function rankListMaxScroll(): number {
  const rows = ensureRankRows();
  const { w, h } = screenSize();
  const landscape = isLandscape(w, h);
  const rowH = landscape ? 40 : 54;
  const listTop = landscape ? 66 : 132;
  const listBottom = landscape ? 212 : 500;
  const scrollViewH = Math.max(80, listBottom - listTop);
  const cols = landscape ? 2 : 1;
  const contentH = Math.ceil(rows.length / cols) * rowH;
  return Math.max(0, contentH - scrollViewH);
}

/** 竖屏风格列表最大滚动（风格行 +「木桩」小节 + A/B；视口至脚注上） */
function styleListMaxScroll(): number {
  const { w, h } = screenSize();
  if (isLandscape(w, h)) return 0;
  const listTop = 132;
  // tearY = bodyH - 16；首页 bodyH=384 → tear 368；脚注 tear−14；视口底脚注−12 → 342
  const listBottom = 368 - 14 - 12;
  const scrollViewH = Math.max(40, listBottom - listTop);
  const contentH = ART_SET_CATALOG.length * 46 + 28 + 2 * 46;
  return Math.max(0, contentH - scrollViewH);
}

/**
 * 打开风格页时 ensureVisible(selected, margin 16)。
 * 羊皮纸（content bottom 224）→ scrollTop = 224 − (210 − 16) = 30。
 * 选中木桩 A/B 行时用同一公式（contentY = styles×46 + 28 + i×46）。
 */
function styleScrollToRevealSelection(focus: "style" | "stump" = "style"): number {
  const { w, h } = screenSize();
  if (isLandscape(w, h)) return 0;
  const listBottom = 368 - 14 - 12; // 342
  const scrollViewH = Math.max(40, listBottom - 132); // 210
  const rowStep = 46;
  const rowH = 40;
  const headH = 28;
  const margin = 16;
  let selTop: number;
  let selBottom: number;
  if (focus === "stump") {
    const stumpIdx = stumpVariant === "B" ? 1 : 0;
    selTop = ART_SET_CATALOG.length * rowStep + headH + stumpIdx * rowStep;
    selBottom = selTop + rowH;
  } else {
    const styleIdx = Math.max(
      0,
      ART_SET_CATALOG.findIndex((e) => e.id === artSets.activeId),
    );
    selTop = styleIdx * rowStep;
    selBottom = selTop + rowH;
  }
  let scroll = 0;
  if (selBottom > scrollViewH - margin) {
    scroll = selBottom - (scrollViewH - margin);
  }
  if (selTop < scroll + margin) {
    scroll = Math.max(0, selTop - margin);
  }
  return Math.max(0, Math.min(styleListMaxScroll(), scroll));
}

function onListPointerDown(e: PointerEvent) {
  if (drawerQ == null) return;
  const hud = ensureHud();
  if (!hud?.hitTestParchment) return;
  const hit = hud.hitTestParchment(e.clientX, e.clientY);
  const full = hud.hitTestParchmentFull?.(e.clientX, e.clientY) ?? null;
  if (hit === "rank_list" && drawerPage === "rank") {
    listScrollDragging = "rank";
    listScrollPickMeta = null;
  } else if (
    drawerPage === "style" &&
    (hit === "style_list" || hit === "style_pick") &&
    styleListMaxScroll() > 0
  ) {
    // style_pick 叠在 style_list 上：按下同时允许滚；未移动则 pointerup 时再选中
    listScrollDragging = "style";
    listScrollPickMeta = hit === "style_pick" ? full?.meta ?? null : null;
  } else {
    return;
  }
  listScrollMoved = false;
  listScrollLastY = e.clientY;
  controller.capturePointerForUi();
  e.preventDefault();
}

function onListPointerMove(e: PointerEvent) {
  if (!listScrollDragging) return;
  const dy = e.clientY - listScrollLastY;
  listScrollLastY = e.clientY;
  if (Math.abs(dy) > 2) listScrollMoved = true;
  if (listScrollDragging === "rank") {
    rankScrollY = Math.max(0, Math.min(rankListMaxScroll(), rankScrollY - dy));
  } else {
    styleScrollY = Math.max(0, Math.min(styleListMaxScroll(), styleScrollY - dy));
  }
  syncParchmentHud();
  e.preventDefault();
}

function onListPointerUp() {
  if (!listScrollDragging) return;
  const wasStyle = listScrollDragging === "style";
  const pick = listScrollPickMeta;
  const moved = listScrollMoved;
  listScrollDragging = null;
  listScrollPickMeta = null;
  listScrollMoved = false;
  controller.releaseUiCapture();
  // 竖屏风格：轻点未滚 → 选中行
  if (wasStyle && !moved && pick) {
    if (pick === "stumpA" || pick === "stumpB") {
      styleSwitching = true;
      syncParchmentHud();
      void applyStumpVariant(pick === "stumpA" ? "A" : "B", { force: true }).finally(() => {
        styleSwitching = false;
        syncParchmentHud();
      });
    } else if (isArtSetId(pick)) {
      void switchArtSet(pick);
    }
  }
}

window.addEventListener("pointerdown", onListPointerDown, { capture: true });
window.addEventListener("pointermove", onListPointerMove, { capture: true });
window.addEventListener("pointerup", onListPointerUp, { capture: true });
window.addEventListener("pointercancel", onListPointerUp, { capture: true });

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
  // 0.3.4：无左下艺术切换
  physics.update(dt);
  axe.update(dt);
  game?.update(dt);
  animator.update(dt);
  debugPile?.update();
  grass.update(dt);
  gobo.update(dt);

  // 抽屉动画推进
  if (drawerAnimating && drawerQ != null) {
    const elapsed = now - drawerAnimStart;
    const t = Math.min(1, elapsed / Math.max(1, drawerAnimDur));
    if (drawerOpening) {
      drawerQ = drawerAnimFromQ + (1 - drawerAnimFromQ) * t;
      if (t >= 1) {
        drawerQ = 1;
        drawerAnimating = false;
      }
    } else {
      const qClose = drawerAnimFromQ + (1 - drawerAnimFromQ) * t;
      drawerQ = 1 - qClose;
      if (t >= 1) {
        drawerQ = null;
        drawerAnimating = false;
        drawerPage = "main";
        rankScrollY = 0;
        styleScrollY = 0;
        heightMorphActive = false;
        drawerH1 = currentTargetH1("main");
      }
    }
    syncParchmentHud();
  }

  // main↔rank 纸面高度 morph
  if (heightMorphActive) {
    resolveDrawerH1();
    syncParchmentHud();
  }

  if (guideStep === 1) {
    guideTargets = { ...guideTargets, log: projectLogTarget() };
    if (guideAdvanceAt > 0 && performance.now() >= guideAdvanceAt) {
      guideAdvanceAt = 0;
      guideStep = 2;
      syncParchmentHud();
    }
  } else if (
    guideStep === 3 &&
    drawerQ == null &&
    !drawerAnimating &&
    lastGuideTracked === 3
  ) {
    // step3 首次进入时自动展开抽屉（track 后只开一次由 drawerQ 保持）
    openDrawer("guide");
  }

  const needHud =
    drawerAnimating ||
    heightMorphActive ||
    listScrollDragging ||
    drawerDragP != null ||
    guideStep === 1 ||
    guideStep === 3 ||
    Boolean(exhaustedBubble) ||
    Boolean(claimFlash) ||
    Math.floor(now / 500) !== Math.floor((now - dt * 1000) / 500) ||
    (uiToast && performance.now() > toastUntil);
  if (needHud) syncParchmentHud();

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
      axe: () => ({
        play: () => {
          const y = (() => {
            try {
              const pieces = game.getSplittablePieces?.() ?? [];
              if (pieces.length) {
                const box = new THREE.Box3();
                for (const { mesh } of pieces) box.expandByObject(mesh);
                if (Number.isFinite(box.max.y)) return box.max.y;
              }
            } catch {
              /* fall through */
            }
            return 0.2;
          })();
          axe.playFromImpact(new THREE.Vector3(0, y, 0), controller.getRight());
        },
        playAt: (x: number, y: number, z: number) =>
          axe.playFromImpact(new THREE.Vector3(x, y, z), controller.getRight()),
        seekTime: (seconds: number) => axe.seekTime(seconds),
        duration: () => axe.duration,
        busy: () => axe.busy,
        playCount: () => axe.playCount,
        impactDebug: () => {
          const d = axe.getImpactDebug();
          return {
            bladeTip: d.bladeTip.toArray() as [number, number, number],
            impactPoint: d.impactPoint.toArray() as [number, number, number],
            pivot: d.pivot.toArray() as [number, number, number],
            elapsed: d.elapsed,
            visible: d.visible,
            edgeDir: d.edgeDir.toArray() as [number, number, number],
            handleDir: d.handleDir.toArray() as [number, number, number],
            cheekNormal: d.cheekNormal.toArray() as [number, number, number],
            cheekAlongRight: d.cheekAlongRight,
            cheekTowardCamera: d.cheekTowardCamera,
            handleTowardCamera: d.handleTowardCamera,
          };
        },
        withAxeModel: (fn: (root: THREE.Object3D) => void) => axe.withAxeModel(fn),
      }),
      /** CSS 像素：世界坐标 → 画布 client 坐标（与截图像素 / deviceScaleFactor 对齐时再乘 dpr） */
      projectWorld: (xyz: [number, number, number] | number[]) => {
        const v = new THREE.Vector3(xyz[0] ?? 0, xyz[1] ?? 0, xyz[2] ?? 0);
        v.project(camera);
        const el = renderer.domElement;
        const cssW = el.clientWidth || 1;
        const cssH = el.clientHeight || 1;
        return {
          x: (v.x * 0.5 + 0.5) * cssW,
          y: (-v.y * 0.5 + 0.5) * cssH,
          ndcZ: v.z,
        };
      },
      /** 当前树桩顶面中心（劈砍落点参考）的 CSS 投影 */
      projectLogTop: () => {
        let y = 0.2;
        try {
          const pieces = game.getSplittablePieces?.() ?? [];
          if (pieces.length) {
            const box = new THREE.Box3();
            for (const { mesh } of pieces) box.expandByObject(mesh);
            if (Number.isFinite(box.max.y)) y = box.max.y;
          }
        } catch {
          /* keep fallback */
        }
        const v = new THREE.Vector3(0, y, 0);
        v.project(camera);
        const el = renderer.domElement;
        const cssW = el.clientWidth || 1;
        const cssH = el.clientHeight || 1;
        return {
          x: (v.x * 0.5 + 0.5) * cssW,
          y: (-v.y * 0.5 + 0.5) * cssH,
          worldY: y,
        };
      },
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
          closeDrawer(true);
          uiPanel = p;
          syncParchmentHud();
        },
        skipGuide: () => finishGuide("skipped"),
        resetGuide: () => {
          resetGuideForTests();
          guideStep = economy.canActiveChop() ? 1 : 2;
          lastGuideTracked = 0;
          uiPanel = "none";
          closeDrawer(true);
          syncParchmentHud();
        },
        setGuideStep: (n: number) => {
          guideStep = Math.max(1, Math.min(3, Math.floor(n)));
          lastGuideTracked = 0;
          uiPanel = "none";
          if (guideStep === 3) openDrawer("guide");
          else closeDrawer(true);
          syncParchmentHud();
        },
        guideStep: () => guideStep,
        chops: () => game?.chopsOnCurrentRoot ?? 0,
        roots: () => game?.rootsFelledCount ?? 0,
        openDrawer: () => openDrawer("tap"),
        closeDrawer: () => closeDrawer(),
        setDrawerQ: (q: number) => {
          drawerAnimating = false;
          drawerOpening = true;
          drawerQ = Math.max(0, Math.min(1, q));
          drawerDragP = null;
          syncParchmentHud();
        },
        setDrawerPage: (p: DrawerPage) => {
          if (drawerQ == null) {
            drawerQ = 1;
            drawerOpening = true;
            drawerAnimating = false;
            drawerH1 = currentTargetH1("main");
          }
          setDrawerPage(p);
        },
        setRankScroll: (y: number) => {
          rankScrollY = Math.max(0, y);
          syncParchmentHud();
        },
        getRankScroll: () => rankScrollY,
        setStyleScroll: (y: number) => {
          styleScrollY = Math.max(0, y);
          syncParchmentHud();
        },
        getStyleScroll: () => styleScrollY,
        getRankRows: () => ensureRankRows(),
        getDrawerH1: () => resolveDrawerH1(),
        showExhaustedBubble: () => {
          const snap = economy.snapshot();
          exhaustedBubble = {
            text: snap.quotaExhausted
              ? "今日蓄养中 · 明天 0 点恢复"
              : `今日蓄养中 · ${formatCountdown(snap.nextRootMs)} 后长出`,
            until: performance.now() + 60000,
          };
          syncParchmentHud();
        },
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
      stump: () => ({
        active: stumpVariant,
        switchTo: (id: string) => {
          if (id !== "A" && id !== "B") return Promise.reject(new Error("bad stump id"));
          return applyStumpVariant(id);
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
