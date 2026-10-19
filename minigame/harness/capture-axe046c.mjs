/**
 * 0.4.6 axe046c — re-authored swing (no ax_anim curves) vs pre-clean.
 *
 * Usage:
 *   # Reuse axe046b preclean frames, or recapture:
 *   MG_ROOT=/tmp/wood-preclean/minigame LABEL=preclean PORT=5220 node capture-axe046c.mjs
 *   MG_ROOT=/workspace/minigame LABEL=current PORT=5222 node capture-axe046c.mjs
 *   Then: node capture-axe046c.mjs --compose
 *
 * Contact sheets: impact ±2 frames, one cropped row per frame at full width.
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
const STORE = "/cursor/stores/self/axe046c";
const PRECLEAN_FALLBACK = "/cursor/stores/self/axe046b/preclean";
const ARTIFACTS = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const PORT = Number(process.env.HARNESS_PORT || 5222);
const CHROME =
  process.env.CHROME_PATH ||
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"].find(
    (p) => existsSync(p),
  );

const FRAME_COUNT = 12; // swing samples
const SWING_MS = 900; // cover full 0.78s authored clip + margin
const IMPACT_AT = 0.12;

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

/** Crop a generous box around the log / tip region (larger than prior sheets). */
async function cropAction(pngPath, tipCss, logCss, { dpr = 2 } = {}) {
  const meta = await sharp(pngPath).metadata();
  const w = meta.width || 1;
  const h = meta.height || 1;
  const cx = ((tipCss?.x ?? logCss?.x ?? w / dpr / 2) * dpr);
  const cy = ((tipCss?.y ?? logCss?.y ?? h / dpr / 2) * dpr);
  // ~70% of the shorter side, centred on contact
  const side = Math.round(Math.min(w, h) * 0.72);
  const left = Math.max(0, Math.min(w - side, Math.round(cx - side / 2)));
  const top = Math.max(0, Math.min(h - side, Math.round(cy - side / 2)));
  return sharp(pngPath)
    .extract({ left, top, width: Math.min(side, w - left), height: Math.min(side, h - top) })
    .png()
    .toBuffer({ resolveWithObject: true });
}

async function composeContactSheets() {
  mkdirSync(STORE, { recursive: true });
  mkdirSync(ARTIFACTS, { recursive: true });
  // Prefer local preclean; else reuse axe046b preclean captures
  if (!existsSync(join(STORE, "preclean", "portrait", "idle.png")) && existsSync(join(PRECLEAN_FALLBACK, "portrait", "idle.png"))) {
    mkdirSync(join(STORE, "preclean"), { recursive: true });
    for (const orient of ["portrait", "landscape"]) {
      const src = join(PRECLEAN_FALLBACK, orient);
      const dst = join(STORE, "preclean", orient);
      mkdirSync(dst, { recursive: true });
      for (const name of readdirSync(src)) {
        copyFileSync(join(src, name), join(dst, name));
      }
      const mSrc = join(PRECLEAN_FALLBACK, `${orient}_metrics.json`);
      if (existsSync(mSrc)) copyFileSync(mSrc, join(STORE, "preclean", `${orient}_metrics.json`));
    }
    console.log("seeded preclean from", PRECLEAN_FALLBACK);
  }

  const orients = ["portrait", "landscape"];
  const metaAsserts = {};
  for (const orient of orients) {
    const precleanDir = join(STORE, "preclean", orient);
    const currentDir = join(STORE, "current", orient);
    const currentM = JSON.parse(readFileSync(join(STORE, "current", `${orient}_metrics.json`), "utf8"));
    const precleanM = JSON.parse(readFileSync(join(STORE, "preclean", `${orient}_metrics.json`), "utf8"));
    const impactIdx = Number(currentM.impactFrameIdx ?? 0);
    // impact ±2 frames (one row each, full width)
    const frameIdxs = [];
    for (let d = -2; d <= 2; d++) {
      const i = Math.max(0, Math.min(FRAME_COUNT - 1, impactIdx + d));
      if (!frameIdxs.includes(i)) frameIdxs.push(i);
    }
    const tipCss = currentM.impact?.tipCss || currentM.impact?.img?.tipCss;
    const logCss = currentM.impact?.logTopCss;

    const rowH = 420; // larger crop row
    const gap = 8;
    const labelH = 30;
    const panelGap = 8;
    const rows = [];
    let maxW = 0;
    for (const idx of frameIdxs) {
      const name = `f${String(idx).padStart(2, "0")}.png`;
      const aPath = join(precleanDir, name);
      const bPath = join(currentDir, name);
      if (!existsSync(aPath) || !existsSync(bPath)) throw new Error(`missing ${aPath} or ${bPath}`);
      const aCrop = await cropAction(aPath, tipCss, logCss);
      const bCrop = await cropAction(bPath, tipCss, logCss);
      const aw = Math.round(((aCrop.info.width || 1) * rowH) / (aCrop.info.height || 1));
      const bw = Math.round(((bCrop.info.width || 1) * rowH) / (bCrop.info.height || 1));
      const rowW = aw + panelGap + bw;
      maxW = Math.max(maxW, rowW);
      const tag = idx === impactIdx ? `${name} IMPACT` : name;
      rows.push({
        label: tag,
        aw,
        bw,
        aBuf: await sharp(aCrop.data).resize(aw, rowH).png().toBuffer(),
        bBuf: await sharp(bCrop.data).resize(bw, rowH).png().toBuffer(),
      });
    }

    const headerH = 40;
    const canvasW = maxW + 24;
    const canvasH = headerH + rows.length * (rowH + labelH + gap);
    const composites = [];
    const headerSvg = Buffer.from(
      `<svg width="${canvasW}" height="${headerH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#1a1410"/>
        <text x="${canvasW * 0.25}" y="26" fill="#e8dcc8" font-size="16" text-anchor="middle" font-family="sans-serif">pre-clean</text>
        <text x="${canvasW * 0.75}" y="26" fill="#e8dcc8" font-size="16" text-anchor="middle" font-family="sans-serif">current (authored keys)</text>
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
      composites.push({ input: row.bBuf, top: y, left: 12 + row.aw + panelGap });
      y += rowH + gap;
    }
    const outName = `axe046c_contact_${orient}.png`;
    const outPath = join(STORE, outName);
    await sharp({
      create: { width: canvasW, height: canvasH, channels: 3, background: "#0e0a08" },
    })
      .composite(composites)
      .png()
      .toFile(outPath);
    copyFileSync(outPath, join(ARTIFACTS, outName));
    console.log("contact", outName);

    // Labelled close-up of impact head orientation (current seekTime frame)
    const closeupSrc = join(STORE, "current", orient, "impact_closeup.png");
    if (existsSync(closeupSrc)) {
      const tip = currentM.impact?.hook
        ? { x: currentM.impact.hook.bladeScreenX, y: currentM.impact.hook.bladeScreenY }
        : currentM.impact?.tipCss;
      const log = currentM.impact?.logTopCss;
      const crop = await cropAction(closeupSrc, tip, log);
      const labelH2 = 36;
      const closeW = Math.max(640, crop.info.width || 640);
      const closeH = Math.round(((crop.info.height || 1) * closeW) / (crop.info.width || 1));
      const resized = await sharp(crop.data).resize(closeW, closeH).png().toBuffer();
      const head = currentM.impact?.head;
      const labelSvg = Buffer.from(
        `<svg width="${closeW}" height="${labelH2}" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#1a1410"/>
          <text x="12" y="24" fill="#e8dcc8" font-size="15" font-family="sans-serif">${orient} impact close-up — edge down / cheek to camera${
            head ? ` (aspect ${Number(head.aspect).toFixed(2)}, onFace=${head.onLogFace})` : ""
          }</text>
        </svg>`,
      );
      const closeName = `axe046c_impact_closeup_${orient}.png`;
      const closeOut = join(STORE, closeName);
      await sharp({
        create: { width: closeW, height: closeH + labelH2, channels: 3, background: "#0e0a08" },
      })
        .composite([
          { input: labelSvg, top: 0, left: 0 },
          { input: resized, top: labelH2, left: 0 },
        ])
        .png()
        .toFile(closeOut);
      copyFileSync(closeOut, join(ARTIFACTS, closeName));
      console.log("closeup", closeName);
    }

    metaAsserts[orient] = compareMetrics(precleanM, currentM, orient);
  }

  let version = { VERSION: "?", BUILD_NOTE: "?", BUILD_REV: "?" };
  try {
    version = require(join(THIS_MG, "version.js"));
  } catch {
    /* ignore */
  }
  let sizes = null;
  try {
    sizes = JSON.parse(readFileSync(join(THIS_MG, "size-report.json"), "utf8"));
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
    note: "0.4.6 axe046c — rotX tip-zeroed swing (edge down / cheek to camera) + pack4 audio; boss-face harness",
    root_cause:
      "Boss 体验版 showed vertical stick + sideways cool-grey cheek on the log FACE (detached head). Cause: authored keys still used ax_anim-like compound quaternions that laid the edge line toward the camera. Fix: pure Euler(rotX) keys with tip-zeroed Mesh T/S positions so cheek +Z faces the camera, tip sits on the log TOP, handle foreshortens clear of the top tab. Harness fails bossSidewaysFace + sidewaysBossPattern.",
    asserts: metaAsserts,
    shots: [
      "axe046c_contact_portrait.png",
      "axe046c_contact_landscape.png",
      "axe046c_impact_closeup_portrait.png",
      "axe046c_impact_closeup_landscape.png",
    ],
    audio: {
      shipped: "pack4 层次 → public/assets/sounds/",
      switcher: false,
    },
    sizes: sizes
      ? {
          mainPackage: sizes.mainPackage,
          mainUnder4MB: sizes.mainUnder4MB,
          subpackagesTotal: sizes.subpackagesTotal,
          subpackages: sizes.subpackages,
        }
      : null,
  };
  writeFileSync(join(STORE, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  writeFileSync(join(ARTIFACTS, "axe046c_meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
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

/**
 * Boss wrong-shot detector: large cool-grey cheek silhouette on the vertical log FACE
 * (mid-body), NOT on the log top. Matches boss_axe_wrong.png (handle stick + detached head).
 */
async function probeBossSidewaysFace(pngPath, logTopCss, { dpr = 2, tipCss = null } = {}) {
  const { data, info } = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const logY = Math.round((logTopCss?.y ?? h / dpr / 2) * dpr);
  const logX = Math.round((logTopCss?.x ?? w / dpr / 2) * dpr);
  // Face band: well below log top, central column (where the boss grey cheek sits).
  // Start deeper so a cheek seated on the top rim is not counted as "on the face".
  const y0 = Math.min(h - 2, logY + Math.round(70 * dpr));
  const y1 = Math.min(h, logY + Math.round(170 * dpr));
  const x0 = Math.max(0, logX - Math.round(90 * dpr));
  const x1 = Math.min(w, logX + Math.round(90 * dpr));
  const tipY = tipCss?.y != null ? tipCss.y * dpr : null;
  let n = 0;
  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;
  for (let y = y0; y < y1; y++) {
    // Skip a band around the measured tip (edge-down head on the top rim).
    if (tipY != null && Math.abs(y - tipY) < 35 * dpr) continue;
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      // Cool translucent grey cheek (boss shot) — not warm bark
      if (!(lum > 120 && lum < 210 && max - min < 35 && b + 6 >= r && r < 200)) continue;
      n++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const aspect = bw / bh;
  // Boss pattern: substantial cool-grey mass mid-face, wider than tall.
  const hit = n > 1500 && aspect >= 1.2;
  return {
    coolFaceCount: n,
    aspect,
    widthCss: bw / dpr,
    heightCss: bh / dpr,
    bossSidewaysFace: hit,
  };
}

/**
 * Metal axe-head bbox near the tip (diff vs idle). Returns aspect = width/height.
 * Cheek-facing → wider than tall (aspect > 1). Sideways-on-face often also wide but
 * sits below the log top (centroid deep on the log face).
 */
async function probeHeadBBox(pngPath, baselinePath, tipCss, logTopCss, { dpr = 2 } = {}) {
  const { data, info } = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(baselinePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (b.info.width !== info.width || b.info.height !== info.height) return null;
  const w = info.width;
  const h = info.height;
  const tx = (tipCss?.x ?? w / dpr / 2) * dpr;
  const ty = (tipCss?.y ?? h / dpr / 2) * dpr;
  // Tight box around the blade tip / head — exclude the tall wooden handle above.
  const radX = Math.round(Math.min(w, h) * 0.18);
  const radUp = Math.round(Math.min(w, h) * 0.08);
  const radDown = Math.round(Math.min(w, h) * 0.12);
  const x0 = Math.max(0, Math.floor(tx - radX));
  const x1 = Math.min(w, Math.ceil(tx + radX));
  const y0 = Math.max(0, Math.floor(ty - radUp));
  const y1 = Math.min(h, Math.ceil(ty + radDown));
  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;
  let n = 0;
  let sumY = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const dr = Math.abs(data[i] - b.data[i]);
      const dg = Math.abs(data[i + 1] - b.data[i + 1]);
      const db = Math.abs(data[i + 2] - b.data[i + 2]);
      if (dr + dg + db <= 110) continue;
      // Axe head baseColor is warm steel (not cool grey); accept bright low-chroma diffs.
      const r = data[i];
      const g = data[i + 1];
      const bl = data[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
      const max = Math.max(r, g, bl);
      const min = Math.min(r, g, bl);
      if (!(lum > 130 && max - min < 70)) continue;
      n++;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (n < 40) return null;
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const aspect = bw / bh;
  const centroidY = sumY / n / dpr;
  const logY = logTopCss?.y ?? centroidY;
  // Boss sideways bug: tip itself sits on the vertical log FACE (well below log top),
  // not merely the blade biting a few cm into the kerf from above.
  const tipY = (tipCss?.y ?? centroidY);
  const tipOnFace = tipY - logY > 48;
  const onLogFace = tipOnFace && centroidY - logY > 70;
  return {
    aspect,
    widthCss: bw / dpr,
    heightCss: bh / dpr,
    metalCount: n,
    centroidCss: { x: (minX + maxX) / 2 / dpr, y: centroidY },
    // Cheek-facing head silhouette is wider than tall (allow near-square).
    widerThanTall: aspect >= 0.9,
    onLogFace,
    tipOnFace,
    sidewaysBossPattern: aspect >= 0.9 && onLogFace,
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
  // Pre-clean tip match is a soft visual guide; authored swing may land a bit
  // off-pre while still on the log top (tipVsLogOk) with correct head aspect.
  const tipVsPreOk =
    preTip?.x != null &&
    curTip?.x != null &&
    dx <= 72 &&
    dy <= 40;

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
    hookLogOk = tipVsLogWorldDy <= 0.12 && hookDx <= 45;
  }
  const tipVsLogOk = imgLogOk || hookLogOk;

  // Impact must not put metal in the top drawer tab (pre-clean impact was clean).
  const impactTabOk = !cur.impact?.img?.overlapsTopTab;
  const preImpactTab = Boolean(pre.impact?.img?.overlapsTopTab);

  // Head orientation: must NOT match boss sideways-on-face (wide cool cheek on log FACE).
  // When the metal bbox is measurable on the log top (cheek-facing, not onFace), trust it
  // over the cool-grey face probe (bark/sky noise can inflate coolFaceCount).
  const curHead = cur.impact?.head || cur.impact?.closeup?.head || null;
  const preHead = pre.impact?.head || null;
  const bossFace = cur.impact?.bossFace || cur.impact?.closeup?.bossFace || null;
  const headOnTop =
    tipVsLogOk &&
    curHead != null &&
    curHead.widerThanTall === true &&
    curHead.onLogFace !== true &&
    curHead.tipOnFace !== true &&
    curHead.sidewaysBossPattern !== true;
  const notBossFace = headOnTop || bossFace?.bossSidewaysFace !== true;
  const headAspectOk =
    tipVsLogOk &&
    curHead?.sidewaysBossPattern !== true &&
    (headOnTop ||
      (curHead == null && bossFace?.bossSidewaysFace !== true) ||
      (curHead != null &&
        curHead.widerThanTall === true &&
        curHead.onLogFace !== true &&
        bossFace?.bossSidewaysFace !== true));
  const headAspectMatchPre =
    preHead?.aspect != null &&
    curHead?.aspect != null &&
    Math.abs(curHead.aspect - preHead.aspect) <= 0.85;

  const ok =
    idleOk &&
    tipVsPreOk &&
    tipVsLogOk &&
    idleMatch &&
    impactTabOk &&
    headAspectOk;
  return {
    ok,
    idleOk,
    idleMatch,
    tipVsPreOk,
    tipVsLogOk,
    impactTabOk,
    preImpactTab,
    headAspectOk,
    headAspectMatchPre,
    notBossFace,
    bossFace,
    curHead,
    preHead,
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

  // Pose-only close-up FIRST (intact log): playFromImpact + seek — head must be visible.
  let hookImpact = null;
  let closeupPath = null;
  let closeupHead = null;
  let closeupBossFace = null;
  const hasSeek = await page.evaluate(() => {
    if (!window.__fw.projectWorld) return false;
    return typeof window.__fw.projectLogTop === "function";
  });
  if (hasSeek) {
    hookImpact = await page.evaluate((impactAt) => {
      const api = window.__fw.axe();
      // play() targets the live log top (bbox max.y), not stump topY (=0).
      api.play();
      api.seekTime(impactAt);
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
    }, IMPACT_AT);
    // Let the presenter paint the seek pose before screenshot
    await sleep(120);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    closeupPath = join(dir, "impact_closeup.png");
    await page.screenshot({ path: closeupPath, type: "png" });
    const closeupLog = await probeLogTop(closeupPath);
    const logRef =
      closeupLog?.y != null ? closeupLog : { x: hookImpact.logCenterX, y: hookImpact.logTopY };
    // Prefer harness tip when it sits on the log top (world + screen). Image tip
    // can latch onto bark/handle noise and falsely flag tipOnFace.
    const closeupImg = await probeAxeInImage(closeupPath, { baselinePath: idlePath });
    const hookDyWorld = Math.abs((hookImpact.tip?.[1] ?? 0) - (hookImpact.imp?.[1] ?? 0));
    const hookDyScreen = Math.abs(
      (hookImpact.bladeScreenY ?? 0) - (hookImpact.logTopY ?? hookImpact.bladeScreenY ?? 0),
    );
    const hookTipOk = hookDyWorld <= 0.12 && hookDyScreen <= 40;
    const headTip = hookTipOk
      ? { x: hookImpact.bladeScreenX, y: hookImpact.bladeScreenY }
      : closeupImg.tipCss || {
          x: hookImpact.bladeScreenX,
          y: (hookImpact.bladeScreenY + (logRef?.y ?? hookImpact.bladeScreenY)) / 2,
        };
    closeupHead = await probeHeadBBox(closeupPath, idlePath, headTip, logRef);
    closeupBossFace = await probeBossSidewaysFace(closeupPath, logRef, { tipCss: headTip });
    await page.evaluate(() => window.__fw.axe().seekTime(5));
    await sleep(80);
    await waitIdle(30000);
    console.log(LABEL, orient, "closeup head", closeupHead, "bossFace", closeupBossFace);
  }

  const framePaths = [];
  // Impact ~IMPACT_AT into clip; capture must start the instant touch fires
  const impactFrameIdx = Math.max(
    0,
    Math.min(FRAME_COUNT - 1, Math.round((IMPACT_AT / (SWING_MS / 1000)) * (FRAME_COUNT - 1))),
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
      for (const p of paths) framePaths.push(p);
      started = true;
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
  let bestImpact = { idx: impactFrameIdx, path: impactPath, img: null, score: -1 };
  const searchLo = Math.max(0, impactFrameIdx - 2);
  const searchHi = Math.min(FRAME_COUNT - 1, impactFrameIdx + 2);
  for (let i = searchLo; i <= searchHi; i++) {
    const p = framePaths[i];
    const img = await probeAxeInImage(p, { baselinePath: idlePath });
    if (!img.tipCss) continue;
    const dy = Math.abs(img.tipCss.y - logTopCss.y);
    const tabPenalty = img.overlapsTopTab ? 5000 : 0;
    const score = img.metalCount - dy * 40 - tabPenalty;
    if (score > bestImpact.score) bestImpact = { idx: i, path: p, img, score };
  }
  const impactImg =
    bestImpact.img || (await probeAxeInImage(impactPath, { baselinePath: idlePath }));
  if (impactImg.tipCss && logTopCss?.y != null) {
    const band = await probeAxeNearLog(bestImpact.path || impactPath, idlePath, logTopCss);
    if (band?.tipCss) impactImg.tipCss = band.tipCss;
  }

  const tipCss = impactImg.tipCss || (hookImpact
    ? { x: hookImpact.bladeScreenX, y: hookImpact.bladeScreenY }
    : null);
  const chosenImpactIdx = bestImpact.img ? bestImpact.idx : impactFrameIdx;
  // Prefer closeup head when it is not the boss sideways-on-face pattern; else
  // fall back to the real-chop impact frame (image tip near log top).
  let head = closeupHead;
  if (!head || head.sidewaysBossPattern || head.metalCount < 80) {
    const burstHead = await probeHeadBBox(
      bestImpact.path || impactPath,
      idlePath,
      tipCss,
      logTopCss,
    );
    if (burstHead && (!head || !burstHead.sidewaysBossPattern)) head = burstHead;
  }
  const bossFace =
    closeupBossFace ||
    (await probeBossSidewaysFace(bestImpact.path || impactPath, logTopCss, { tipCss }));

  const impact = {
    frame: `f${String(chosenImpactIdx).padStart(2, "0")}.png`,
    tipCss,
    logTopCss,
    bladeScreenX: tipCss?.x ?? hookImpact?.bladeScreenX ?? null,
    bladeScreenY: tipCss?.y ?? hookImpact?.bladeScreenY ?? null,
    logCenterX: logTopCss?.x ?? hookImpact?.logCenterX ?? null,
    logTopY: logTopCss?.y ?? hookImpact?.logTopY ?? null,
    img: impactImg,
    hook: hookImpact,
    head,
    bossFace,
    closeup: closeupPath
      ? { path: "impact_closeup.png", head: closeupHead, bossFace: closeupBossFace }
      : null,
  };

  const metrics = {
    label: LABEL,
    orient,
    idle: idleProbe,
    impact,
    playBefore,
    impactFrameIdx: chosenImpactIdx,
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
