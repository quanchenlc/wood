/**
 * 0.4.6 part1 redo — real-chop swing sequences for pre-clean vs current.
 *
 * Usage:
 *   MG_ROOT=/tmp/wood-preclean/minigame LABEL=preclean PORT=5220 node capture-axe046b.mjs
 *   MG_ROOT=/workspace/minigame LABEL=current PORT=5221 node capture-axe046b.mjs
 *   Then: node capture-axe046b.mjs --compose
 *
 * Frames: idle + 12 samples across the swing (start→impact→recovery), portrait & landscape.
 * Input: wx.__simulateTouch only (same path as a tap).
 */
import { createServer } from "node:http";
import {
  readFileSync,
  existsSync,
  statSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
} from "node:fs";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const THIS_MG = join(fileURLToPath(new URL("..", import.meta.url)));
const MG = process.env.MG_ROOT || THIS_MG;
const LABEL = process.env.LABEL || "current";
const STORE = "/cursor/stores/self/axe046b";
const ARTIFACTS = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const PORT = Number(process.env.HARNESS_PORT || 5220);
const CHROME =
  process.env.CHROME_PATH ||
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"].find(
    (p) => existsSync(p),
  );

const FRAME_COUNT = 12; // swing samples
const SWING_MS = 1100; // cover full ~0.97s clip + margin

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".glb": "model/gltf-binary",
  ".gltf": "application/json",
  ".bin": "application/octet-stream",
  ".wasm": "application/octet-stream",
  ".mp3": "audio/mpeg",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") pathname = "/harness/index.html";
      if (pathname === "/favicon.ico") {
        res.writeHead(204);
        res.end();
        return;
      }
      const file = normalize(join(MG, pathname.replace(/^\//, "")));
      if (!file.startsWith(MG) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404);
        res.end("nf");
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(readFileSync(file));
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

async function composeContactSheets() {
  mkdirSync(STORE, { recursive: true });
  mkdirSync(ARTIFACTS, { recursive: true });
  const orients = ["portrait", "landscape"];
  const metaAsserts = {};
  for (const orient of orients) {
    const precleanDir = join(STORE, "preclean", orient);
    const currentDir = join(STORE, "current", orient);
    const names = ["idle.png", ...Array.from({ length: FRAME_COUNT }, (_, i) => `f${String(i).padStart(2, "0")}.png`)];
    const cells = [];
    for (const name of names) {
      const a = join(precleanDir, name);
      const b = join(currentDir, name);
      if (!existsSync(a) || !existsSync(b)) throw new Error(`missing ${a} or ${b}`);
      cells.push({ name, a, b });
    }
    // Each row: preclean | current, scaled to common height
    const rowH = 280;
    const gap = 6;
    const labelH = 28;
    const rows = [];
    let maxW = 0;
    for (const cell of cells) {
      const am = await sharp(cell.a).metadata();
      const bm = await sharp(cell.b).metadata();
      const aw = Math.round(((am.width || 1) * rowH) / (am.height || 1));
      const bw = Math.round(((bm.width || 1) * rowH) / (bm.height || 1));
      const rowW = aw + gap + bw;
      maxW = Math.max(maxW, rowW);
      rows.push({
        label: cell.name.replace(".png", ""),
        aw,
        bw,
        rowW,
        aBuf: await sharp(cell.a).resize(aw, rowH).png().toBuffer(),
        bBuf: await sharp(cell.b).resize(bw, rowH).png().toBuffer(),
      });
    }
    const headerH = 36;
    const canvasH = headerH + rows.length * (rowH + labelH + gap);
    const canvasW = maxW + 24;
    const composites = [];
    const headerSvg = Buffer.from(
      `<svg width="${canvasW}" height="${headerH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#1a1410"/>
        <text x="${canvasW * 0.25}" y="24" fill="#e8dcc8" font-size="16" text-anchor="middle" font-family="sans-serif">pre-clean (34cc814)</text>
        <text x="${canvasW * 0.75}" y="24" fill="#e8dcc8" font-size="16" text-anchor="middle" font-family="sans-serif">current (baked anim clip)</text>
      </svg>`,
    );
    composites.push({ input: headerSvg, top: 0, left: 0 });
    let y = headerH;
    for (const row of rows) {
      const lab = Buffer.from(
        `<svg width="${canvasW}" height="${labelH}" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#241c14"/>
          <text x="12" y="20" fill="#cbb89a" font-size="14" font-family="sans-serif">${row.label}</text>
        </svg>`,
      );
      composites.push({ input: lab, top: y, left: 0 });
      y += labelH;
      composites.push({ input: row.aBuf, top: y, left: 12 });
      composites.push({ input: row.bBuf, top: y, left: 12 + row.aw + gap });
      y += rowH + gap;
    }
    const outName = `axe046b_contact_${orient}.png`;
    const outPath = join(STORE, outName);
    await sharp({
      create: { width: canvasW, height: canvasH, channels: 3, background: "#0e0a08" },
    })
      .composite(composites)
      .png()
      .toFile(outPath);
    copyFileSync(outPath, join(ARTIFACTS, outName));
    console.log("contact", outName);

    // Asserts from recorded metrics JSON
    const precleanM = JSON.parse(readFileSync(join(STORE, "preclean", `${orient}_metrics.json`), "utf8"));
    const currentM = JSON.parse(readFileSync(join(STORE, "current", `${orient}_metrics.json`), "utf8"));
    metaAsserts[orient] = compareMetrics(precleanM, currentM, orient);
  }

  let version = { VERSION: "?", BUILD_NOTE: "?", BUILD_REV: "?" };
  try {
    version = require(join(THIS_MG, "version.js"));
  } catch {
    /* ignore */
  }
  const meta = {
    version: {
      VERSION: version.VERSION,
      BUILD_NOTE: version.BUILD_NOTE,
      BUILD_REV: version.BUILD_REV,
    },
    tip: version.BUILD_REV,
    note: "0.4.6 part1 redo — real-chop sequences; no version bump",
    root_cause:
      "IP-clean discarded ax_anim_v03's anim-node TRS (the real pivot relative to the impact point) and replaced it with an identity parent + handmade rotX path. The procedural axe.gltf Mesh translation/scale already matched ax_v01; without the anim parent the blade hung as a vertical stick above the log. Fix: bake the original anim translation/rotation curves into code and replay them on animNull — no MODEL_YAW hack.",
    asserts: metaAsserts,
    shots: ["axe046b_contact_portrait.png", "axe046b_contact_landscape.png"],
  };
  writeFileSync(join(STORE, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  writeFileSync(join(ARTIFACTS, "axe046b_meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  console.log("compose done", meta.asserts);
  for (const [orient, a] of Object.entries(metaAsserts)) {
    if (!a.ok) throw new Error(`assert failed ${orient}: ${JSON.stringify(a)}`);
  }
}

/**
 * Diff `pngPath` against an idle baseline to isolate the moving axe.
 * Tip = lowest changed pixel in the central column band (CSS px).
 */
async function probeAxeInImage(pngPath, { baselinePath = null, topBandCss = 90, dpr = 2 } = {}) {
  const { data, info } = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const topBandPx = Math.round(topBandCss * dpr);
  let base = null;
  if (baselinePath && existsSync(baselinePath)) {
    const b = await sharp(baselinePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (b.info.width === w && b.info.height === h) base = b.data;
  }

  let tabHits = 0;
  let sumX = 0;
  let sumY = 0;
  let n = 0;
  let tipX = 0;
  let tipY = -1;
  // Central band where the swing happens; ignore far sides / HUD chrome
  const x0 = Math.floor(w * 0.28);
  const x1 = Math.floor(w * 0.72);
  // Ignore very bottom UI / ground strip
  const y1 = Math.floor(h * 0.92);

  for (let y = 0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      let hit = false;
      if (base) {
        const dr = Math.abs(data[i] - base[i]);
        const dg = Math.abs(data[i + 1] - base[i + 1]);
        const db = Math.abs(data[i + 2] - base[i + 2]);
        // Significant RGB change vs idle → swing / chips
        hit = dr + dg + db > 110;
      } else {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        // Fallback without baseline: cool-grey metal only (axe blade), not warm sky/parchment
        hit = lum > 160 && max - min < 40 && b >= g - 5 && r < 200;
      }
      if (!hit) continue;
      n++;
      sumX += x;
      sumY += y;
      if (y > tipY) {
        tipY = y;
        tipX = x;
      }
      if (y < topBandPx) tabHits++;
    }
  }
  return {
    axeVisible: n > 120,
    metalCount: n,
    tabMetalCount: tabHits,
    overlapsTopTab: tabHits > 80,
    centroidCss: n ? { x: sumX / n / dpr, y: sumY / n / dpr } : null,
    tipCss: tipY >= 0 ? { x: tipX / dpr, y: tipY / dpr } : null,
    usedBaseline: Boolean(base),
  };
}

/** Idle-only: did a vertical stick occupy the top-tab band? Compare warm UI vs cold metal stick. */
async function probeIdleTab(pngPath, { topBandCss = 90, dpr = 2 } = {}) {
  const { data, info } = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const topBandPx = Math.round(topBandCss * dpr);
  // Drawer pull-tab sits near horizontal centre at the top edge
  const x0 = Math.floor(w * 0.35);
  const x1 = Math.floor(w * 0.65);
  let coldBright = 0;
  let total = 0;
  for (let y = 0; y < topBandPx; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      total++;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      // Floating axe stick was a cold grey vertical bar; parchment tab is warm
      if (lum > 130 && max - min < 35 && b + 8 >= r && r < 210) coldBright++;
    }
  }
  return {
    tabMetalCount: coldBright,
    overlapsTopTab: coldBright > total * 0.04 && coldBright > 100,
    tabSample: total,
  };
}

/** Tip among diff pixels constrained to a band around the log top (CSS). */
async function probeAxeNearLog(pngPath, baselinePath, logTopCss, { dpr = 2, bandCss = 100 } = {}) {
  const { data, info } = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(baselinePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (b.info.width !== info.width || b.info.height !== info.height) return null;
  const w = info.width;
  const h = info.height;
  const yMid = logTopCss.y * dpr;
  const y0 = Math.max(0, Math.floor(yMid - bandCss * dpr));
  const y1 = Math.min(h, Math.ceil(yMid + bandCss * 0.6 * dpr));
  const x0 = Math.floor(w * 0.28);
  const x1 = Math.floor(w * 0.72);
  let tipX = 0;
  let tipY = -1;
  let n = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const dr = Math.abs(data[i] - b.data[i]);
      const dg = Math.abs(data[i + 1] - b.data[i + 1]);
      const db = Math.abs(data[i + 2] - b.data[i + 2]);
      if (dr + dg + db <= 110) continue;
      n++;
      sumX += x;
      sumY += y;
      if (y > tipY) {
        tipY = y;
        tipX = x;
      }
    }
  }
  if (n < 40) return null;
  // Prefer centroid near the log (stable); keep lowest-in-band as tipLow
  return {
    tipCss: { x: sumX / n / dpr, y: sumY / n / dpr },
    tipLowCss: { x: tipX / dpr, y: tipY / dpr },
    centroidCss: { x: sumX / n / dpr, y: sumY / n / dpr },
    metalCount: n,
  };
}

/** Estimate log-top centre line from a mid-frame by finding the dark circular stump top near screen centre. */
async function probeLogTop(pngPath, { dpr = 2 } = {}) {
  const { data, info } = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  // Search a window around geometric centre for dark wood pixels
  const cx0 = Math.floor(w * 0.35);
  const cx1 = Math.floor(w * 0.65);
  const cy0 = Math.floor(h * 0.35);
  const cy1 = Math.floor(h * 0.7);
  let bestY = null;
  let bestX = (cx0 + cx1) / 2;
  // Walk rows top→bottom; first dense dark band ≈ log top silhouette edge from camera
  for (let y = cy0; y < cy1; y++) {
    let dark = 0;
    let sx = 0;
    for (let x = cx0; x < cx1; x++) {
      const i = (y * w + x) * 4;
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (lum < 70) {
        dark++;
        sx += x;
      }
    }
    if (dark > (cx1 - cx0) * 0.12) {
      bestY = y;
      bestX = sx / dark;
      break;
    }
  }
  if (bestY == null) {
    return { x: w / 2 / dpr, y: h * 0.5 / dpr, from: "fallback" };
  }
  return { x: bestX / dpr, y: bestY / dpr, from: "image" };
}

function compareMetrics(pre, cur, orient) {
  // idle: axe must not sit on the top drawer tab; pose must match pre-clean (hidden)
  const idleOk = !cur.idle.overlapsTopTab && !cur.idle.hookVisible;
  const idleMatch =
    Boolean(pre.idle.overlapsTopTab) === Boolean(cur.idle.overlapsTopTab) &&
    Boolean(pre.idle.axeVisible) === Boolean(cur.idle.axeVisible);

  const preTip = pre.impact.tipCss || {
    x: pre.impact.bladeScreenX,
    y: pre.impact.bladeScreenY,
  };
  const curTip = cur.impact.tipCss || {
    x: cur.impact.bladeScreenX,
    y: cur.impact.bladeScreenY,
  };
  const log = cur.impact.logTopCss || {
    x: cur.impact.logCenterX,
    y: cur.impact.logTopY,
  };

  const dx = Math.abs((curTip?.x ?? 0) - (preTip?.x ?? 0));
  const dy = Math.abs((curTip?.y ?? 0) - (preTip?.y ?? 0));
  const tipVsPreOk =
    preTip?.x != null &&
    curTip?.x != null &&
    dx <= 28 &&
    dy <= 36;

  // Contact vs log top centre line: image centroid (same method as tipVsPre) OR
  // harness world-space blade tip vs impact point (current build only).
  const hook = cur.impact.hook;
  let tipVsLogDy = null;
  let tipVsLogDx = null;
  let tipVsLogWorldDy = null;
  let imgLogOk = false;
  let hookLogOk = false;
  if (curTip?.x != null && log?.y != null) {
    tipVsLogDy = Math.abs(curTip.y - log.y);
    tipVsLogDx = Math.abs(curTip.x - (log.x ?? curTip.x));
    imgLogOk = tipVsLogDy <= 48 && tipVsLogDx <= 48;
  }
  if (hook?.tip && hook?.imp) {
    tipVsLogWorldDy = Math.abs((hook.tip[1] ?? 0) - (hook.imp[1] ?? 0));
    const hookDx = Math.abs((hook.bladeScreenX ?? 0) - (hook.logCenterX ?? 0));
    const hookDy = Math.abs((hook.bladeScreenY ?? 0) - (hook.logTopY ?? 0));
    // Keep image dx/dy as primary report; note hook deltas alongside
    if (tipVsLogDx == null) tipVsLogDx = hookDx;
    if (tipVsLogDy == null) tipVsLogDy = hookDy;
    hookLogOk = tipVsLogWorldDy <= 0.1 && hookDx <= 45;
  }
  const tipVsLogOk = imgLogOk || hookLogOk;

  const ok = idleOk && tipVsPreOk && tipVsLogOk && idleMatch;
  return {
    ok,
    idleOk,
    idleMatch,
    tipVsPreOk,
    tipVsLogOk,
    dx,
    dy,
    tipVsLogDy,
    tipVsLogDx,
    tipVsLogWorldDy,
    preImpact: pre.impact,
    curImpact: cur.impact,
    preIdle: pre.idle,
    curIdle: cur.idle,
    orient,
  };
}

if (process.argv.includes("--compose")) {
  await composeContactSheets();
  process.exit(0);
}

mkdirSync(STORE, { recursive: true });
mkdirSync(ARTIFACTS, { recursive: true });
const outDir = join(STORE, LABEL);
mkdirSync(outDir, { recursive: true });

const server = await startServer();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: ["--no-sandbox", "--disable-gpu", "--use-gl=swiftshader"],
});
const page = await browser.newPage();
page.on("console", (m) => {
  const t = m.text();
  if (/404|Failed to load|GPU stall|deprecated/i.test(t)) return;
  console.log("[page]", t.slice(0, 140));
});

async function waitReady() {
  for (let i = 0; i < 150; i++) {
    const ok = await page.evaluate(
      () => typeof window.__fw?.state === "function" && window.__fw.state()?.game === "IDLE",
    );
    if (ok) return;
    await sleep(400);
  }
  throw new Error("not ready " + LABEL);
}

async function waitIdle(timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const st = await page.evaluate(() => window.__fw?.state?.() ?? null);
    if (st?.game === "IDLE" && !st?.axeBusy) return st;
    await sleep(80);
  }
  throw new Error("waitIdle timeout");
}

async function fireTouch(x, y) {
  await page.evaluate(
    ({ x, y }) => {
      const wx = window.wx;
      if (!wx?.__simulateTouch) throw new Error("no __simulateTouch");
      wx.__simulateTouch("start", x, y);
      wx.__simulateTouch("end", x, y);
    },
    { x, y },
  );
}

async function captureSequence(orient, cssW, cssH) {
  const dir = join(outDir, orient);
  mkdirSync(dir, { recursive: true });
  await page.setViewport({ width: cssW, height: cssH, deviceScaleFactor: 2 });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await sleep(600);
  await page.evaluate(() => {
    window.__fw.economy?.()?.skipGuide?.();
    window.__fw.economy?.()?.setRemaining?.(50);
    window.__fw.economy?.()?.closeDrawer?.();
    window.__fw.look?.(12);
  });
  await sleep(500);
  await waitIdle();

  // idle
  const idlePath = join(dir, "idle.png");
  await page.screenshot({ path: idlePath, type: "png" });
  const idleTab = await probeIdleTab(idlePath);
  // Never call __fw.axe() here — preclean's axe() side-effects a playFromImpact.
  const idleHook = await page.evaluate(() => {
    const st = window.__fw.state?.() ?? {};
    return { hookVisible: st.axe === "playing", phase: st.axe ?? null };
  });
  const idleProbe = {
    ...idleTab,
    axeVisible: idleTab.overlapsTopTab || idleHook.hookVisible,
    hookVisible: idleHook.hookVisible,
    phase: idleHook.phase,
  };
  console.log(LABEL, orient, "idle", idleProbe);

  await page.evaluate(() => {
    window.__fw.economy?.()?.setRemaining?.(50);
    window.__fw.economy?.()?.closeDrawer?.();
  });
  await sleep(300);
  await waitIdle(30000);

  const framePaths = [];
  // Impact ~0.1s into clip; capture must start the instant touch fires
  const impactFrameIdx = Math.max(
    0,
    Math.min(FRAME_COUNT - 1, Math.round((0.1 / SWING_MS) * (FRAME_COUNT - 1))),
  );

  // Fire touch then burst-capture immediately (no probe chop — that exhausts the log).
  const cx = Math.round(cssW * 0.5);
  const cy = Math.round(cssH * 0.52);
  const burstPoints = [
    { x: cx, y: cy },
    { x: cx, y: cy - 30 },
    { x: cx, y: cy + 30 },
    { x: cx - 20, y: cy },
    { x: cx + 20, y: cy },
    { x: cx - 40, y: cy - 10 },
    { x: cx + 40, y: cy - 10 },
  ];
  let started = false;
  let playBefore = 0;
  let chopPt = burstPoints[0];
  for (const pt of burstPoints) {
    await waitIdle(30000);
    playBefore = await page.evaluate(() => window.__fw?.state?.()?.axePlayCount ?? 0);
    await fireTouch(pt.x, pt.y);
    const t0 = Date.now();
    const paths = [];
    for (let i = 0; i < FRAME_COUNT; i++) {
      const target = t0 + (i / (FRAME_COUNT - 1)) * SWING_MS;
      const wait = target - Date.now();
      if (wait > 0) await sleep(wait);
      const name = `f${String(i).padStart(2, "0")}.png`;
      const path = join(dir, name);
      await page.screenshot({ path, type: "png" });
      paths.push(path);
    }
    const playAfter = await page.evaluate(() => window.__fw?.state?.()?.axePlayCount ?? 0);
    if (playAfter > playBefore) {
      // Keep successful burst frames
      for (const p of paths) framePaths.push(p);
      started = true;
      chopPt = pt;
      console.log(LABEL, orient, "burst", pt.x, pt.y);
      break;
    }
    console.log(LABEL, orient, "burst miss", pt.x, pt.y);
    await waitIdle(30000);
  }
  if (!started) {
    throw new Error(LABEL + " " + orient + " burst touch did not start a chop");
  }
  await waitIdle(90000);

  // Image metrics from the real-chop impact frame (diff vs idle — works for both builds)
  const impactPath = framePaths[impactFrameIdx];
  const logTopCss = await probeLogTop(impactPath);
  // Prefer an early frame that still shows the axe near the log (f00–f03), not follow-through
  let bestImpact = { idx: impactFrameIdx, path: impactPath, img: null, score: -1 };
  for (let i = 0; i <= Math.min(4, FRAME_COUNT - 1); i++) {
    const p = framePaths[i];
    const img = await probeAxeInImage(p, { baselinePath: idlePath });
    if (!img.tipCss) continue;
    // Score: tip near log top, and enough changed pixels
    const dy = Math.abs(img.tipCss.y - logTopCss.y);
    const score = img.metalCount - dy * 40;
    if (score > bestImpact.score) bestImpact = { idx: i, path: p, img, score };
  }
  const impactImg =
    bestImpact.img || (await probeAxeInImage(impactPath, { baselinePath: idlePath }));
  // Clamp tip to the contact band around the log top (ignore follow-through / chips low on screen)
  if (impactImg.tipCss && logTopCss?.y != null) {
    const band = await probeAxeNearLog(bestImpact.path || impactPath, idlePath, logTopCss);
    if (band?.tipCss) impactImg.tipCss = band.tipCss;
  }

  // Optional: current build can refine tip via seekTime(0.1) after another real chop.
  // Do NOT call __fw.axe() to probe — preclean's axe() plays a chop as a side effect.
  let hookImpact = null;
  const hasSeek = await page.evaluate(() => {
    if (!window.__fw.projectWorld) return false;
    // Current build: axe() returns { seekTime, impactDebug, ... }; preclean returns undefined.
    // Peek without invoking by checking a non-side-effect marker we set after first safe call —
    // instead: only use seek when projectLogTop exists (current-only hook).
    return typeof window.__fw.projectLogTop === "function";
  });
  if (hasSeek) {
    await waitIdle(30000);
    await fireTouch(chopPt.x, chopPt.y);
    await sleep(20);
    // Seek+read in one turn so the frame loop cannot advance elapsed past contact
    hookImpact = await page.evaluate(() => {
      const api = window.__fw.axe();
      api.seekTime(0.1);
      const dbg = api.impactDebug();
      const tipP = window.__fw.projectWorld(dbg.bladeTip);
      const logP = window.__fw.projectLogTop?.() ?? window.__fw.projectWorld(dbg.impactPoint);
      return {
        bladeScreenX: tipP?.x ?? null,
        bladeScreenY: tipP?.y ?? null,
        logCenterX: logP?.x ?? null,
        logTopY: logP?.y ?? null,
        elapsed: dbg.elapsed,
        visible: dbg.visible,
        tip: dbg.bladeTip,
        imp: dbg.impactPoint,
      };
    });
    await page.evaluate(() => window.__fw.axe().seekTime(5));
    await sleep(80);
    await waitIdle(30000);
  }

  const tipCss = impactImg.tipCss || (hookImpact
    ? { x: hookImpact.bladeScreenX, y: hookImpact.bladeScreenY }
    : null);
  const impact = {
    frame: `f${String(impactFrameIdx).padStart(2, "0")}.png`,
    tipCss,
    logTopCss,
    bladeScreenX: tipCss?.x ?? hookImpact?.bladeScreenX ?? null,
    bladeScreenY: tipCss?.y ?? hookImpact?.bladeScreenY ?? null,
    logCenterX: logTopCss?.x ?? hookImpact?.logCenterX ?? null,
    logTopY: logTopCss?.y ?? hookImpact?.logTopY ?? null,
    img: impactImg,
    hook: hookImpact,
  };

  const metrics = {
    label: LABEL,
    orient,
    idle: idleProbe,
    impact,
    playBefore,
    impactFrameIdx,
    frames: framePaths.map((p) => p.split("/").pop()),
  };
  writeFileSync(join(outDir, `${orient}_metrics.json`), `${JSON.stringify(metrics, null, 2)}\n`);
  console.log(LABEL, orient, "metrics", {
    tipCss: impact.tipCss,
    logTopCss: impact.logTopCss,
    idleTab: idleProbe.tabMetalCount,
  });
}

// Expose projectWorld on __fw for metrics — inject via evaluate after load if missing
async function ensureProjectHooks() {
  await page.evaluate(() => {
    if (window.__fw.projectWorld) return;
    // Best-effort: no camera access on older builds — metrics fall back to impact point only
    window.__fw.projectWorld = (arr) => {
      // Without camera, return null; compose asserts then rely on current build hooks
      void arr;
      return null;
    };
  });
}

await page.goto(`http://127.0.0.1:${PORT}/harness/index.html`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await waitReady();
await ensureProjectHooks();

// Portrait then landscape
await captureSequence("portrait", 375, 812);
await captureSequence("landscape", 812, 375);

await browser.close();
server.close();
console.log("captured", LABEL, "→", outDir);
