/**
 * 0.4.6 part1 — axe orientation fix shots + blade-normal assert at impact.
 * Side-by-side with pre-clean refs from /tmp/axe046_refs/.
 * Store: /cursor/stores/self/axe046/  (no version bump)
 */
import { createServer } from "node:http";
import {
  readFileSync,
  existsSync,
  statSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const MG = join(fileURLToPath(new URL("..", import.meta.url)));
const ARTIFACTS = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const STORE = "/cursor/stores/self/axe046";
const REFS = "/tmp/axe046_refs";
const PORT = Number(process.env.HARNESS_PORT || 5211);
const CHROME =
  process.env.CHROME_PATH ||
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"].find(
    (p) => existsSync(p),
  );

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(ARTIFACTS, { recursive: true });
mkdirSync(STORE, { recursive: true });

function save(page, name) {
  const dest = join(ARTIFACTS, name);
  return page.screenshot({ path: dest, type: "png" }).then(() => {
    copyFileSync(dest, join(STORE, name));
    console.log("shot", name);
  });
}

async function sideBySide(refName, fixName, outName) {
  const refPath = join(REFS, refName);
  const fixPath = join(STORE, fixName);
  if (!existsSync(refPath) || !existsSync(fixPath)) {
    console.warn("skip composite", outName, existsSync(refPath), existsSync(fixPath));
    return;
  }
  const ref = sharp(refPath);
  const fix = sharp(fixPath);
  const rMeta = await ref.metadata();
  const fMeta = await fix.metadata();
  const h = Math.max(rMeta.height || 1, fMeta.height || 1);
  const rw = Math.round(((rMeta.width || 1) * h) / (rMeta.height || 1));
  const fw = Math.round(((fMeta.width || 1) * h) / (fMeta.height || 1));
  const gap = 8;
  const labelH = 36;
  const canvasW = rw + gap + fw;
  const canvasH = h + labelH;
  const refBuf = await sharp(refPath).resize(rw, h).png().toBuffer();
  const fixBuf = await sharp(fixPath).resize(fw, h).png().toBuffer();
  const svg = Buffer.from(
    `<svg width="${canvasW}" height="${labelH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#1a1410"/>
      <text x="${rw / 2}" y="24" fill="#e8dcc8" font-size="18" text-anchor="middle" font-family="sans-serif">pre-clean ref</text>
      <text x="${rw + gap + fw / 2}" y="24" fill="#e8dcc8" font-size="18" text-anchor="middle" font-family="sans-serif">0.4.6 fix</text>
    </svg>`,
  );
  const out = join(STORE, outName);
  await sharp({
    create: { width: canvasW, height: canvasH, channels: 3, background: "#111" },
  })
    .composite([
      { input: svg, top: 0, left: 0 },
      { input: refBuf, top: labelH, left: 0 },
      { input: fixBuf, top: labelH, left: rw + gap },
    ])
    .png()
    .toFile(out);
  copyFileSync(out, join(ARTIFACTS, outName));
  console.log("composite", outName);
}

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
  console.log("[page]", t.slice(0, 160));
});

async function waitReady() {
  for (let i = 0; i < 120; i++) {
    const ok = await page.evaluate(
      () => typeof window.__fw?.axe === "function" && window.__fw?.state?.()?.game === "IDLE",
    );
    if (ok) return;
    await sleep(400);
  }
  throw new Error("fw not ready");
}

async function prep() {
  await page.evaluate(async () => {
    window.__fw.economy?.()?.skipGuide?.();
    window.__fw.economy?.()?.setRemaining?.(12);
    window.__fw.economy?.()?.closeDrawer?.();
    await window.__fw.art?.()?.switchTo?.("set0");
    for (let i = 0; i < 40; i++) {
      if (!window.__fw.art?.()?.isSwitching?.()) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    window.__fw.look?.(18);
  });
  await sleep(800);
}

async function seek(pose) {
  await page.evaluate((p) => window.__fw.axe().seekPose(p), pose);
  await sleep(200);
}

async function assertImpactBlade() {
  const m = await page.evaluate(() => window.__fw.axe().bladeMetrics());
  console.log("bladeMetrics@impact", m);
  const faceOk = Math.abs(m.faceDotSlice) >= 0.85;
  const edgeOk = m.edgeDotUp >= 0.85;
  if (!faceOk || !edgeOk) {
    throw new Error(
      `blade assert failed: faceDotSlice=${m.faceDotSlice} (need |·|≥0.85), edgeDotUp=${m.edgeDotUp} (need ≥0.85)`,
    );
  }
  console.log("PASS blade normal ∥ slice, edge ≈ vertical");
  return m;
}

async function captureOrients(prefix) {
  await seek("rest");
  await save(page, `${prefix}_rest.png`);
  await seek("top");
  await save(page, `${prefix}_top.png`);
  await seek("impact");
  const metrics = await assertImpactBlade();
  await save(page, `${prefix}_impact.png`);
  return metrics;
}

await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:${PORT}/harness/index.html`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await waitReady();
await prep();
const portraitMetrics = await captureOrients("axe046_portrait");

await page.setViewport({ width: 812, height: 375, deviceScaleFactor: 2 });
await page.evaluate(() => window.dispatchEvent(new Event("resize")));
await sleep(700);
await prep();
const landscapeMetrics = await captureOrients("axe046_landscape");

// Style page + set0 restore (harness convention)
await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2 });
await page.evaluate(() => window.dispatchEvent(new Event("resize")));
await sleep(500);
await page.evaluate(async () => {
  await window.__fw.art().switchTo("set4");
  for (let i = 0; i < 40; i++) {
    if (!window.__fw.art().isSwitching()) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  window.__fw.economy().setDrawerQ(1);
  window.__fw.economy().setDrawerPage("style");
});
await sleep(700);
await save(page, "axe046_portrait_style.png");
await page.evaluate(async () => {
  await window.__fw.art().switchTo("set0");
  for (let i = 0; i < 40; i++) {
    if (!window.__fw.art().isSwitching()) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  window.__fw.economy().closeDrawer?.();
});
await sleep(400);

const pairs = [
  ["ref_portrait_rest.png", "axe046_portrait_rest.png", "axe046_compare_portrait_rest.png"],
  ["ref_portrait_top.png", "axe046_portrait_top.png", "axe046_compare_portrait_top.png"],
  ["ref_portrait_impact.png", "axe046_portrait_impact.png", "axe046_compare_portrait_impact.png"],
  ["ref_landscape_rest.png", "axe046_landscape_rest.png", "axe046_compare_landscape_rest.png"],
  ["ref_landscape_top.png", "axe046_landscape_top.png", "axe046_compare_landscape_top.png"],
  ["ref_landscape_impact.png", "axe046_landscape_impact.png", "axe046_compare_landscape_impact.png"],
];
for (const [r, f, o] of pairs) await sideBySide(r, f, o);

const version = require("../version.js");
const meta = {
  version: {
    VERSION: version.VERSION,
    BUILD_NOTE: version.BUILD_NOTE,
    BUILD_REV: version.BUILD_REV,
  },
  tip: version.BUILD_REV,
  note: "0.4.6 part1 axe orientation — no version bump yet",
  root_cause:
    "IP-clean removed ax_anim_v03 and replaced it with identity animNull + rotX-only keyframes. The original anim node yawed the axe ~90° so cheek normals aligned with camera right (slice normal); without that yaw the procedural model's ±Z cheeks faced the camera (edge left-right). Fix: MODEL_YAW=π/2 on attach, and impact holds near-vertical edge (IMPACT_ROT_X≈−0.12) instead of −π/2.6.",
  assert: { portrait: portraitMetrics, landscape: landscapeMetrics },
  shots: [
    "axe046_portrait_rest.png",
    "axe046_portrait_top.png",
    "axe046_portrait_impact.png",
    "axe046_landscape_rest.png",
    "axe046_landscape_top.png",
    "axe046_landscape_impact.png",
    "axe046_compare_portrait_rest.png",
    "axe046_compare_portrait_top.png",
    "axe046_compare_portrait_impact.png",
    "axe046_compare_landscape_rest.png",
    "axe046_compare_landscape_top.png",
    "axe046_compare_landscape_impact.png",
  ],
};
writeFileSync(join(STORE, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
writeFileSync(join(ARTIFACTS, "axe046_meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
console.log("done", meta.version, meta.assert);

await browser.close();
server.close();
