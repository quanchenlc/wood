/**
 * 构建后廉价贴图回归：
 * 1) stump：albedo 方差 + 暖色门禁；public vs minigame stump_baseColor 拷贝一致性
 *    （0.4.0 起已无 web KTX2，禁止再和自身渲染比 MAD→0.00）
 * 2) axe：渲染木柄占位（不再 vs Fiskars web）；确认加载成功并出图
 *
 * 用法：node minigame/scripts/verify-texture-mad.mjs
 * SKIP_TEXTURE_MAD=1 跳过；TEXTURE_MAD_MAX 默认 18
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
// ARTIFACT_DIR 可选；默认 os.tmpdir()，避免硬编码 /opt/cursor/artifacts 在别的机器上失败
const OUT = process.env.ARTIFACT_DIR
  ? join(process.env.ARTIFACT_DIR, "texture-mad")
  : join(tmpdir(), "firewood-texture-mad");
const MAD_MAX = Number(process.env.TEXTURE_MAD_MAX || 18);
const SIZE = 256;

if (process.env.SKIP_TEXTURE_MAD === "1") {
  console.log("[mad] skipped (SKIP_TEXTURE_MAD=1)");
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });

const CHROME =
  process.env.CHROME_PATH ||
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"].find(
    (p) => existsSync(p),
  );
if (!CHROME) {
  console.error("[mad] no chrome — skip (non-fatal)");
  process.exit(0);
}

const MIME = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".html": "text/html",
};

function pageHtml(kind) {
  const modelUrl =
    kind === "mg-axe"
      ? "/minigame/subpackages/assets/assets/axe.gltf"
      : kind === "web-stump"
        ? "/public/assets/stump.gltf"
        : kind === "mg-stump"
          ? "/minigame/subpackages/assets/assets/stump.gltf"
          : kind === "mg-axe-stump"
            ? null
            : null;
  const useKtx2 = kind === "web-stump";
  const isCombo = kind === "mg-axe-stump";
  const cam = kind.includes("axe") && !isCombo
    ? "camera.position.set(0.45, 0.15, 0.7); camera.lookAt(0, 0.05, 0);"
    : isCombo
      ? "camera.position.set(1.4, 1.0, 2.0); camera.lookAt(0, 0.2, 0);"
      : "camera.position.set(1.6, 1.1, 2.2); camera.lookAt(0, 0.15, 0);";

  const loadBlock = isCombo
    ? `
const stumpG = await loader.loadAsync('/minigame/subpackages/assets/assets/stump.gltf');
const axeG = await loader.loadAsync('/minigame/subpackages/assets/assets/axe.gltf');
function prep(root, scaleHint) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (m.map) { m.map.colorSpace = THREE.SRGBColorSpace; m.map.flipY = false; m.map.needsUpdate = true; }
      if (m.color) m.color.set(0xffffff);
      if (typeof m.metalness === 'number') m.metalness = 0;
      if (typeof m.roughness === 'number') m.roughness = Math.max(m.roughness, 0.55);
    }
  });
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  root.scale.setScalar(scaleHint / Math.max(size.x, size.y, size.z));
  return root;
}
const stump = prep(stumpG.scene, 1.5);
const axe = prep(axeG.scene, 0.9);
axe.position.set(0.55, 0.15, 0.35);
axe.rotation.z = -0.4;
scene.add(stump);
scene.add(axe);
`
    : `
const gltf = await loader.loadAsync('${modelUrl}');
const root = gltf.scene;
root.traverse((o) => {
  if (!o.isMesh) return;
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  for (const m of mats) {
    if (!m) continue;
    if (m.map) {
      m.map.colorSpace = THREE.SRGBColorSpace;
      m.map.flipY = false;
      m.map.needsUpdate = true;
    }
    if (m.color) m.color.set(0xffffff);
    if (typeof m.metalness === 'number') m.metalness = 0;
  }
});
const box = new THREE.Box3().setFromObject(root);
const size = box.getSize(new THREE.Vector3());
const center = box.getCenter(new THREE.Vector3());
root.position.sub(center);
const s = ${kind.includes("axe") ? "2.0" : "1.4"} / Math.max(size.x, size.y, size.z);
root.scale.setScalar(s);
scene.add(root);
`;

  return `<!doctype html>
<html><body style="margin:0;background:#87CEEB">
<canvas id="c" width="${SIZE}" height="${SIZE}"></canvas>
<script type="importmap">
{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}
</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
${useKtx2 ? "import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';" : ""}

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(${SIZE}, ${SIZE});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
const light = new THREE.DirectionalLight(0xffffff, 2.2);
light.position.set(2, 4, 3);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.55));

const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
${cam}

let loader = new GLTFLoader();
${
  useKtx2
    ? `const ktx2 = new KTX2Loader().setTranscoderPath('/public/basis/').detectSupport(renderer);
loader = loader.setKTX2Loader(ktx2);`
    : ""
}

${loadBlock}
renderer.render(scene, camera);
window.__READY__ = true;
</script>
</body></html>`;
}

const PORT = 5203;
const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === "/view") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(pageHtml(url.searchParams.get("kind") || "mg-axe"));
    return;
  }
  const file = join(ROOT, url.pathname.replace(/^\//, ""));
  if (!existsSync(file)) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});

await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
  ],
});

async function shot(kind, name) {
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${PORT}/view?kind=${kind}`, {
    waitUntil: "networkidle0",
    timeout: 120000,
  });
  await page.waitForFunction(() => window.__READY__, { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 250));
  const path = join(OUT, name);
  await page.screenshot({ path, type: "png" });
  await page.close();
  return path;
}

async function madMasked(aPath, bPath) {
  const a = await sharp(aPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(bPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = a.data.length;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i += 4) {
    const ar = a.data[i];
    const ag = a.data[i + 1];
    const ab = a.data[i + 2];
    const br = b.data[i];
    const bg = b.data[i + 1];
    const bb = b.data[i + 2];
    const aSky = Math.abs(ar - 135) < 28 && Math.abs(ag - 206) < 28 && Math.abs(ab - 235) < 28;
    const bSky = Math.abs(br - 135) < 28 && Math.abs(bg - 206) < 28 && Math.abs(bb - 235) < 28;
    if (aSky && bSky) continue;
    sum += Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb);
    count += 3;
  }
  return count ? sum / count : 999;
}

/** 木柄占位：中段不应再是 Fiskars 橙斑；粗查非天空像素里橙偏少、偏暖木色 */
async function assertWoodAxeLooksPlausible(pngPath) {
  const { data, info } = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let nonSky = 0;
  let orangeish = 0;
  let warmWood = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (Math.abs(r - 135) < 28 && Math.abs(g - 206) < 28 && Math.abs(b - 235) < 28) continue;
    nonSky++;
    // Fiskars 把手橙：高 R、中 G、低 B
    if (r > 160 && g > 60 && g < 160 && b < 80) orangeish++;
    // 木柄：暖棕 R≈G>B 或 R>G>B 中等亮度
    if (r > 70 && r < 210 && g > 45 && g < 180 && b < g && r >= g - 15) warmWood++;
  }
  if (nonSky < 80) throw new Error(`[mad] axe render mostly empty (nonSky=${nonSky})`);
  const orangeRatio = orangeish / nonSky;
  const woodRatio = warmWood / nonSky;
  if (orangeRatio > 0.12) {
    throw new Error(
      `[mad] axe still looks Fiskars-orange (orangeRatio=${orangeRatio.toFixed(3)}) — wrong atlas?`,
    );
  }
  console.log(
    `[mad] axe wood check: nonSky=${nonSky} orangeRatio=${orangeRatio.toFixed(3)} woodRatio=${woodRatio.toFixed(3)} (${info.width}x${info.height})`,
  );
}

const results = {};
let failed = false;

/** stump albedo：有纹理 + 暖色；public/minigame 拷贝一致（有意义的门禁，非自比） */
async function assertStumpAlbedoSane() {
  const pub = join(ROOT, "public/assets/stump_baseColor.jpg");
  const mg = join(ROOT, "minigame/subpackages/assets/assets/stump_baseColor.jpg");
  if (!existsSync(pub) || !existsSync(mg)) {
    throw new Error(`[mad] missing stump_baseColor.jpg (pub=${existsSync(pub)} mg=${existsSync(mg)})`);
  }
  const { data: a, info } = await sharp(pub).resize(SIZE, SIZE).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data: b } = await sharp(mg).resize(SIZE, SIZE).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let sumSq = 0;
  let madCopy = 0;
  let warm = 0;
  const n = SIZE * SIZE;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const r = a[o];
    const g = a[o + 1];
    const bl = a[o + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * bl;
    sum += lum;
    sumSq += lum * lum;
    madCopy += Math.abs(r - b[o]) + Math.abs(g - b[o + 1]) + Math.abs(bl - b[o + 2]);
    if (r > bl + 8) warm++;
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  const copyMad = madCopy / (n * 3);
  const warmRatio = warm / n;
  console.log(
    `[mad] stump albedo: var=${variance.toFixed(1)} warmRatio=${warmRatio.toFixed(3)} copyMAD=${copyMad.toFixed(2)} (${info.width}x${info.height})`,
  );
  if (variance < 80) {
    throw new Error(`[mad] stump_baseColor looks flat (variance=${variance.toFixed(1)})`);
  }
  if (warmRatio < 0.45) {
    throw new Error(`[mad] stump_baseColor not warm enough (warmRatio=${warmRatio.toFixed(3)})`);
  }
  if (copyMad > 2.5) {
    throw new Error(`[mad] public vs minigame stump_baseColor diverge (copyMAD=${copyMad.toFixed(2)})`);
  }
  // Still render mg stump for evidence
  await shot("mg-stump", "stump-mg.png");
  return { variance: Number(variance.toFixed(1)), warmRatio: Number(warmRatio.toFixed(3)), copyMad: Number(copyMad.toFixed(2)), ok: true };
}

{
  try {
    results.stump = await assertStumpAlbedoSane();
  } catch (e) {
    console.error(String(e && e.message ? e.message : e));
    results.stump = { ok: false, error: String(e && e.message ? e.message : e) };
    failed = true;
  }
}

// 木柄斧：出图 + 非 Fiskars 橙斑检查（不再 vs web KTX2）
{
  const axe = await shot("mg-axe", "axe-mg-wood.png");
  try {
    await assertWoodAxeLooksPlausible(axe);
    results.axe = { ok: true, note: "wood-placeholder-render" };
  } catch (e) {
    console.error(String(e && e.message ? e.message : e));
    results.axe = { ok: false, error: String(e && e.message ? e.message : e) };
    failed = true;
  }
}

// 桌面证据：斧 + 树桩同框
await shot("mg-axe-stump", "axe-stump-mg.png");

writeFileSync(join(OUT, "mad.json"), `${JSON.stringify({ madMax: MAD_MAX, results }, null, 2)}\n`);
await browser.close();
server.close();

if (failed) {
  console.error("[mad] FAIL — see", OUT);
  process.exit(1);
}
console.log("[mad] ok →", OUT);
