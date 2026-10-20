/**
 * 0.4.7 axe046c — re-authored swing (no ax_anim curves); metal head must be visible.
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
const SWING_MS = 850; // cover full 0.68s clip + margin (snappier exit)
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
        <text x="${canvasW * 0.75}" y="26" fill="#e8dcc8" font-size="16" text-anchor="middle" font-family="sans-serif">current (clip+mixer)</text>
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
          <text x="12" y="24" fill="#e8dcc8" font-size="15" font-family="sans-serif">${orient} impact — edge down / blade in split / tip on top${
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
      // Boss review finals: raw seek-pose closeup (full frame) + labelled crop
      const finalName = `axe046c_closeup_final_${orient}.png`;
      copyFileSync(closeupSrc, join(ARTIFACTS, finalName));
      copyFileSync(closeupSrc, join(STORE, finalName));
      console.log("final", finalName);
    }

    // Impact → exit strip (no shrink): pre / impact / after / exit-mid / exit
    const stripNames = [
      "strip_pre.png",
      "strip_impact.png",
      "strip_after.png",
      "strip_exit_mid.png",
      "strip_exit.png",
    ];
    const stripLabels = ["pre", "IMPACT", "follow", "exit-mid", "exit"];
    // Older captures may lack exit frames — fall back to 3-panel.
    const stripPresent = stripNames.filter((n) => existsSync(join(STORE, "current", orient, n)));
    const useStrip = stripPresent.length >= 3 ? stripPresent : [];
    const useLabels =
      useStrip.length === stripNames.length
        ? stripLabels
        : ["pre-impact", "IMPACT", "after"].slice(0, useStrip.length);
    if (useStrip.length >= 3) {
      const tip = currentM.impact?.hook
        ? { x: currentM.impact.hook.bladeScreenX, y: currentM.impact.hook.bladeScreenY }
        : currentM.impact?.tipCss;
      const log = currentM.impact?.logTopCss;
      const rowH = 360;
      const gap = 8;
      const labelH = 28;
      const panels = [];
      let totalW = 0;
      for (let i = 0; i < useStrip.length; i++) {
        const crop = await cropAction(join(STORE, "current", orient, useStrip[i]), tip, log);
        const pw = Math.round(((crop.info.width || 1) * rowH) / (crop.info.height || 1));
        panels.push({
          label: useLabels[i],
          w: pw,
          buf: await sharp(crop.data).resize(pw, rowH).png().toBuffer(),
        });
        totalW += pw + (i ? gap : 0);
      }
      const canvasW = totalW + 24;
      const canvasH = labelH + rowH + 16;
      const comps = [];
      let x = 12;
      for (const p of panels) {
        const lab = Buffer.from(
          `<svg width="${p.w}" height="${labelH}" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#241c14"/>
            <text x="8" y="19" fill="#cbb89a" font-size="14" font-family="sans-serif">${orient} ${p.label}</text>
          </svg>`,
        );
        comps.push({ input: lab, top: 8, left: x });
        comps.push({ input: p.buf, top: 8 + labelH, left: x });
        x += p.w + gap;
      }
      const stripName = `axe046c_strip_${orient}.png`;
      const stripOut = join(STORE, stripName);
      await sharp({
        create: { width: canvasW, height: canvasH, channels: 3, background: "#0e0a08" },
      })
        .composite(comps)
        .png()
        .toFile(stripOut);
      copyFileSync(stripOut, join(ARTIFACTS, stripName));
      console.log("strip", stripName);
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
    note: "0.4.11 axe046c — snappier post-hit exit (~33% shorter leave arc); no shrink; clip+orientToCamera + axeContactPoint; pack4 audio",
    root_cause:
      "0.4.10 exit look OK but 下落收尾 felt slow. Compress post-impact clip keys only (0.28/0.55/0.95 → 0.22/0.40/0.68); same poses, no scale fade. Impact local blade pose + orientToCamera + axeContactPoint unchanged.",
    asserts: metaAsserts,
    shots: [
      "axe046c_contact_portrait.png",
      "axe046c_contact_landscape.png",
      "axe046c_impact_closeup_portrait.png",
      "axe046c_impact_closeup_landscape.png",
      "axe046c_strip_portrait.png",
      "axe046c_strip_landscape.png",
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
  // Side-by-side vs boss wrong + orig_impact_01 (when present on disk).
  const bossRefs = [
    "/workspace/shots-047b/boss_axe_047_wrong.png",
    "/workspace/shots-048/vs_boss.png",
    join(ARTIFACTS, "axe046c_boss_wrong_ref.png"),
  ];
  const origRefs = [
    "/workspace/shots-047b/orig_ref/orig_impact_01.png",
    "/workspace/shots-047b/orig_impact_01.png",
  ];
  const ourPortrait = join(STORE, "current", "portrait", "impact_closeup.png");
  const bossPath = bossRefs.find((p) => existsSync(p));
  const origPath = origRefs.find((p) => existsSync(p));
  async function sideBySide(leftPath, rightPath, leftLabel, rightLabel, outName) {
    const H = 720;
    const leftMeta = await sharp(leftPath).metadata();
    const rightMeta = await sharp(rightPath).metadata();
    const lw = Math.round(((leftMeta.width || 1) * H) / (leftMeta.height || 1));
    const rw = Math.round(((rightMeta.width || 1) * H) / (rightMeta.height || 1));
    const gap = 10;
    const labelH = 36;
    const W = lw + gap + rw + 24;
    const leftBuf = await sharp(leftPath).resize(lw, H).png().toBuffer();
    const rightBuf = await sharp(rightPath).resize(rw, H).png().toBuffer();
    const header = Buffer.from(
      `<svg width="${W}" height="${labelH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#1a1410"/>
        <text x="${12 + lw / 2}" y="24" fill="#e8dcc8" font-size="15" text-anchor="middle" font-family="sans-serif">${leftLabel}</text>
        <text x="${12 + lw + gap + rw / 2}" y="24" fill="#e8dcc8" font-size="15" text-anchor="middle" font-family="sans-serif">${rightLabel}</text>
      </svg>`,
    );
    const out = join(ARTIFACTS, outName);
    await sharp({
      create: { width: W, height: H + labelH + 12, channels: 3, background: "#0e0a08" },
    })
      .composite([
        { input: header, top: 0, left: 0 },
        { input: leftBuf, top: labelH + 6, left: 12 },
        { input: rightBuf, top: labelH + 6, left: 12 + lw + gap },
      ])
      .png()
      .toFile(out);
    copyFileSync(out, join(STORE, outName));
    console.log("sbs", outName);
    return outName;
  }
  if (bossPath && existsSync(ourPortrait)) {
    meta.shots.push(
      await sideBySide(bossPath, ourPortrait, "boss FAIL (cheek mid-face)", "0.4.11 tip-on-top (snappy exit)", "axe046c_vs_boss.png"),
    );
  }
  if (origPath && existsSync(ourPortrait)) {
    meta.shots.push(
      await sideBySide(origPath, ourPortrait, "orig_impact_01 (screen.toys)", "0.4.11 ours", "axe046c_vs_orig.png"),
    );
  }

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

/** Cool steel vs warm wood/bark (boss bare-stick false-positive guard). */
function isCoolSteelPixel(r, g, bl) {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  const max = Math.max(r, g, bl);
  const min = Math.min(r, g, bl);
  const chroma = max - min;
  // Warm wood / endgrain — never count as metal head.
  if (r > g + 10 && g > bl + 6 && chroma > 22) return false;
  if (r > bl + 28 && r > 110) return false;
  // Cool mid-grey steel albedo (0.4.7 axe_baseColor).
  return lum > 70 && lum < 210 && chroma < 48 && bl + 10 >= r && r < 200;
}

/**
 * Metal axe-head bbox near the tip (diff vs idle). Returns aspect = width/height.
 * Cheek-facing → wider than tall (aspect > 1). Sideways-on-face often also wide but
 * sits below the log top (centroid deep on the log face).
 * Counts ONLY cool-steel pixels so bark/endgrain cannot fake metalVisible.
 */
async function probeHeadBBox(pngPath, baselinePath, tipCss, logTopCss, { dpr = 2 } = {}) {
  const { data, info } = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(baselinePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (b.info.width !== info.width || b.info.height !== info.height) return null;
  const w = info.width;
  const h = info.height;
  const tx = (tipCss?.x ?? w / dpr / 2) * dpr;
  const ty = (tipCss?.y ?? h / dpr / 2) * dpr;
  // Box around blade tip / head — include cheek to the side of the handle.
  const radX = Math.round(Math.min(w, h) * 0.22);
  const radUp = Math.round(Math.min(w, h) * 0.1);
  const radDown = Math.round(Math.min(w, h) * 0.14);
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
  let sumX = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const dr = Math.abs(data[i] - b.data[i]);
      const dg = Math.abs(data[i + 1] - b.data[i + 1]);
      const db = Math.abs(data[i + 2] - b.data[i + 2]);
      if (dr + dg + db <= 90) continue;
      const r = data[i];
      const g = data[i + 1];
      const bl = data[i + 2];
      if (!isCoolSteelPixel(r, g, bl)) continue;
      n++;
      sumY += y;
      sumX += x;
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
  const centroidX = sumX / n / dpr;
  const logY = logTopCss?.y ?? centroidY;
  // Boss sideways bug: tip itself sits on the vertical log FACE (well below log top),
  // not merely the blade biting a few cm into the kerf from above.
  const tipY = tipCss?.y ?? centroidY;
  const tipOnFace = tipY - logY > 48;
  const onLogFace = tipOnFace && centroidY - logY > 70;
  return {
    aspect,
    widthCss: bw / dpr,
    heightCss: bh / dpr,
    metalCount: n,
    centroidCss: { x: centroidX, y: centroidY },
    // Cheek-facing head silhouette is wider than tall (allow near-square).
    widerThanTall: aspect >= 0.9,
    onLogFace,
    tipOnFace,
    sidewaysBossPattern: aspect >= 0.9 && onLogFace,
  };
}

/**
 * Sample cool-steel presence in a small patch around the projected tip and
 * toward the expected cheek (left of tip in portrait). Boss bare-stick frames
 * have near-zero cool steel here (only warm wood / handle).
 */
async function probeTipCoolSteel(pngPath, tipCss, { dpr = 2, radiusCss = 28 } = {}) {
  const { data, info } = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const tx = Math.round((tipCss?.x ?? w / dpr / 2) * dpr);
  const ty = Math.round((tipCss?.y ?? h / dpr / 2) * dpr);
  const rad = Math.round(radiusCss * dpr);
  let cool = 0;
  let warm = 0;
  let total = 0;
  for (let y = Math.max(0, ty - rad); y < Math.min(h, ty + rad); y++) {
    for (let x = Math.max(0, tx - rad); x < Math.min(w, tx + rad * 1.4); x++) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const bl = data[i + 2];
      total++;
      if (isCoolSteelPixel(r, g, bl)) cool++;
      else if (r > g + 10 && g > bl + 6) warm++;
    }
  }
  return {
    coolSteelCount: cool,
    warmCount: warm,
    sample: total,
    tipHasCoolSteel: cool >= 120,
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
  // Raised tip (visible metal head) can sit higher than pre-clean; keep soft.
  const tipVsPreOk =
    preTip?.x != null &&
    curTip?.x != null &&
    dx <= 120 &&
    dy <= 80;

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
    // Tip near log top (bite or slight hover); screen near log center.
    hookLogOk = tipVsLogWorldDy <= 0.08 && hookDx <= 36;
  }
  const tipVsLogOk = imgLogOk || hookLogOk;

  // Orientation + seating (must match LIVE gameplay, not only seek-on-intact-log).
  // Boss cheek-on-face: tip at mesh CENTER (mid-bark). Fix: axeContactPoint → top.
  // Blade in split plane: cheek ≈ ±cameraRight; edge down; handle toward cam; tip on top.
  const edgeDir = hook?.edgeDir ?? null;
  const handleDir = hook?.handleDir ?? null;
  const cheekNormal = hook?.cheekNormal ?? null;
  const cheekAlongRight = hook?.cheekAlongRight ?? null;
  const cheekTowardCamera = hook?.cheekTowardCamera ?? null;
  const bladePlaneVertical =
    cheekNormal != null && Math.abs(cheekNormal[1] ?? 1) <= 0.4;
  const edgeDown = edgeDir != null && (edgeDir[1] ?? 0) <= -0.5;
  // orig_impact_01: handle foreshortened toward camera (not a vertical stick).
  const handleTowardCam =
    (hook?.handleTowardCamera != null && hook.handleTowardCamera >= 0.55) ||
    (handleDir != null &&
      Math.hypot(handleDir[0] ?? 0, handleDir[2] ?? 0) >= 0.55 &&
      (handleDir[1] ?? 0) > -0.25);
  const bladeInSplitPlane = cheekAlongRight != null && cheekAlongRight >= 0.7;
  let tipInLogFootprint = false;
  let tipFootprintR = null;
  let tipOnTop = false;
  let tipVsTopDy = null;
  if (hook?.tip && hook?.imp) {
    const dx = (hook.tip[0] ?? 0) - (hook.imp[0] ?? 0);
    const dz = (hook.tip[2] ?? 0) - (hook.imp[2] ?? 0);
    tipFootprintR = Math.hypot(dx, dz);
    tipInLogFootprint = tipFootprintR <= 0.11;
    tipVsTopDy = Math.abs((hook.tip[1] ?? 0) - (hook.imp[1] ?? 0));
    tipOnTop = tipVsTopDy <= 0.06;
  }
  // Boss FAIL: tip mid-face (well below top) OR cheek fully toward camera while tip off-top.
  const cheekOnFace =
    (tipOnTop === false && tipVsTopDy != null && tipVsTopDy > 0.08) ||
    (cheekTowardCamera != null &&
      cheekTowardCamera >= 0.7 &&
      (cheekAlongRight == null || cheekAlongRight < 0.4));
  let bladeContainsHandle = false;
  if (edgeDir && handleDir && cheekNormal) {
    const eDot =
      edgeDir[0] * cheekNormal[0] + edgeDir[1] * cheekNormal[1] + edgeDir[2] * cheekNormal[2];
    const hDot =
      handleDir[0] * cheekNormal[0] +
      handleDir[1] * cheekNormal[1] +
      handleDir[2] * cheekNormal[2];
    bladeContainsHandle = Math.abs(eDot) <= 0.3 && Math.abs(hDot) <= 0.3;
  }
  const orientOk =
    bladePlaneVertical &&
    edgeDown &&
    handleTowardCam &&
    tipInLogFootprint &&
    tipOnTop &&
    bladeContainsHandle &&
    bladeInSplitPlane &&
    !cheekOnFace;

  // Impact must not put the axe handle through the top drawer tab.
  // Prefer closeup probeIdleTab (same cold-bright test as idle); parchment UI
  // alone stays under the overlapsTopTab threshold.
  const closeupTabHit = cur.impact?.closeup?.overlapsTopTab;
  const impactTabOk =
    closeupTabHit === false ||
    (closeupTabHit == null && !cur.impact?.img?.overlapsTopTab);
  const preImpactTab = Boolean(pre.impact?.img?.overlapsTopTab);

  // Head must not match boss sideways-on-face; edge-down side profile may be
  // taller than wide — prefer world orientOk over widerThanTall alone.
  const curHead = cur.impact?.head || cur.impact?.closeup?.head || null;
  const preHead = pre.impact?.head || null;
  const bossFace = cur.impact?.bossFace || cur.impact?.closeup?.bossFace || null;
  const headOnTop =
    tipVsLogOk &&
    curHead != null &&
    curHead.onLogFace !== true &&
    curHead.tipOnFace !== true &&
    curHead.sidewaysBossPattern !== true;
  const notBossFace = headOnTop || bossFace?.bossSidewaysFace !== true;
  const headAspectOk =
    tipVsLogOk &&
    curHead?.sidewaysBossPattern !== true &&
    (orientOk ||
      headOnTop ||
      (curHead == null && bossFace?.bossSidewaysFace !== true));
  // Boss "bare stick": metal head fully occluded / near-zero cool steel at tip.
  const metalCount = curHead?.metalCount ?? 0;
  const tipSteel = cur.impact?.tipSteel || cur.impact?.closeup?.tipSteel || null;
  const tipCool = tipSteel?.coolSteelCount ?? 0;
  // Thin edge-down wedge (orig silhouette) yields far fewer metal pixels than
  // cheek-on-face, especially in portrait end-on. Trust world orientOk + tip
  // cool-steel probe over the wide-plate metalCount heuristic.
  const metalVisible =
    tipSteel?.tipHasCoolSteel === true &&
    ((curHead != null &&
      (curHead.widthCss ?? 0) >= 24 &&
      (curHead.heightCss ?? 0) >= 16 &&
      (metalCount >= 300 || (metalCount >= 160 && tipCool >= 700))) ||
      (orientOk && tipCool >= 120));
  const bareStick = !metalVisible;
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
    headAspectOk &&
    metalVisible &&
    !bareStick &&
    orientOk &&
    !cheekOnFace;
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
    metalVisible,
    bareStick,
    metalCount,
    tipSteel,
    orientOk,
    bladePlaneVertical,
    edgeDown,
    handleTowardCam,
    tipInLogFootprint,
    tipOnTop,
    tipVsTopDy,
    tipFootprintR,
    bladeContainsHandle,
    bladeInSplitPlane,
    cheekOnFace,
    cheekAlongRight,
    cheekTowardCamera,
    edgeDir,
    handleDir,
    cheekNormal,
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
    // Default shipping azimuth (π/2) — do NOT look(12); that masked the
    // cheek-on-face failure that live 体验版 showed under the real camera.
    window.__fw.look?.(90);
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
  let closeupTipSteel = null;
  let closeupTab = null;
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
        edgeDir: dbg.edgeDir ?? null,
        handleDir: dbg.handleDir ?? null,
        cheekNormal: dbg.cheekNormal ?? null,
        cheekAlongRight: dbg.cheekAlongRight ?? null,
        cheekTowardCamera: dbg.cheekTowardCamera ?? null,
        handleTowardCamera: dbg.handleTowardCamera ?? null,
      };
    }, IMPACT_AT);
    // Let the presenter paint the seek pose before screenshot
    await sleep(120);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    // Impact → exit strip: full-size follow-through (no yuanbao shrink).
    const exitStrip = [];
    for (const [name, tSeek] of [
      ["strip_pre.png", 0.06],
      ["strip_impact.png", IMPACT_AT],
      ["strip_after.png", 0.22],
      ["strip_exit_mid.png", 0.4],
      ["strip_exit.png", 0.62],
    ]) {
      const scaleSample = await page.evaluate((t) => {
        window.__fw.axe().seekTime(t);
        return window.__fw.axe().impactDebug()?.modelScale ?? null;
      }, tSeek);
      await sleep(80);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.screenshot({ path: join(dir, name), type: "png" });
      exitStrip.push({ name, tSeek, modelScale: scaleSample });
    }
    writeFileSync(join(dir, "exit_scale.json"), `${JSON.stringify(exitStrip, null, 2)}\n`);
    // Assert: never shrink during exit (scale stays ~1).
    for (const s of exitStrip) {
      if (s.modelScale != null && s.modelScale < 0.92) {
        throw new Error(
          `${LABEL} ${orient} yuanbao shrink at ${s.name} t=${s.tSeek}: modelScale=${s.modelScale}`,
        );
      }
    }
    // Re-seek impact for the labelled close-up + metrics
    await page.evaluate((t) => window.__fw.axe().seekTime(t), IMPACT_AT);
    await sleep(80);
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
    closeupTipSteel = await probeTipCoolSteel(closeupPath, headTip);
    closeupTab = await probeIdleTab(closeupPath);
    await page.evaluate(() => window.__fw.axe().seekTime(5));
    await sleep(80);
    await waitIdle(30000);
    console.log(
      LABEL,
      orient,
      "closeup head",
      closeupHead,
      "bossFace",
      closeupBossFace,
      "tipSteel",
      closeupTipSteel,
    );
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
  const tipSteel =
    closeupTipSteel ||
    (await probeTipCoolSteel(bestImpact.path || impactPath, tipCss));

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
    tipSteel,
    closeup: closeupPath
      ? {
          path: "impact_closeup.png",
          head: closeupHead,
          bossFace: closeupBossFace,
          tipSteel: closeupTipSteel,
          overlapsTopTab: Boolean(closeupTab?.overlapsTopTab),
          tabSteelCount: closeupTab?.tabMetalCount ?? 0,
        }
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
