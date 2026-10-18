/**
 * 廉价 MAD：同视角渲染 web KTX2 vs minigame 外置 JPG，比像素差。
 * 用于 catch decode Y-flip 回归（斧柄条纹时 MAD 会飙到几十）。
 *
 * 用法：node minigame/scripts/verify-texture-mad.mjs
 * 环境：SKIP_TEXTURE_MAD=1 跳过；TEXTURE_MAD_MAX 默认 18（0–255）
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const OUT = process.env.ARTIFACT_DIR
  ? join(process.env.ARTIFACT_DIR, "texture-mad-0.1.8")
  : "/opt/cursor/artifacts/texture-mad-0.1.8";
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
    kind === "web-axe"
      ? "/public/assets/ax_v01_reduced_compressed.glb"
      : kind === "mg-axe"
        ? "/minigame/subpackages/assets/assets/axe.gltf"
        : kind === "web-stump"
          ? "/public/assets/stump_v02_mesh_warm_ktx2_2048.glb"
          : "/minigame/subpackages/assets/assets/stump.gltf";
  const useKtx2 = kind.startsWith("web");
  // 斧头特写：对准柄身中段，条纹最明显
  const cam =
    kind.includes("axe")
      ? "camera.position.set(0.35, 0.05, 0.55); camera.lookAt(0, 0.02, 0);"
      : "camera.position.set(1.6, 1.1, 2.2); camera.lookAt(0, 0.15, 0);";
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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
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
const s = ${kind.includes("axe") ? "2.2" : "1.4"} / Math.max(size.x, size.y, size.z);
root.scale.setScalar(s);
scene.add(root);
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
    res.end(pageHtml(url.searchParams.get("kind") || "web-axe"));
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
  await new Promise((r) => setTimeout(r, 200));
  const path = join(OUT, name);
  await page.screenshot({ path, type: "png" });
  await page.close();
  return path;
}

/** 忽略天空蓝背景，只比模型像素；返回 MAD (0–255) */
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
    // #87CEEB ≈ 135,206,235 — 两边都接近天空则跳过
    const aSky = Math.abs(ar - 135) < 28 && Math.abs(ag - 206) < 28 && Math.abs(ab - 235) < 28;
    const bSky = Math.abs(br - 135) < 28 && Math.abs(bg - 206) < 28 && Math.abs(bb - 235) < 28;
    if (aSky && bSky) continue;
    sum += Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb);
    count += 3;
  }
  return count ? sum / count : 999;
}

const pairs = [
  ["web-axe", "mg-axe", "axe"],
  ["web-stump", "mg-stump", "stump"],
];

const results = {};
let failed = false;
for (const [webKind, mgKind, label] of pairs) {
  const web = await shot(webKind, `${label}-web.png`);
  const mg = await shot(mgKind, `${label}-mg.png`);
  const mad = await madMasked(web, mg);
  results[label] = { mad: Number(mad.toFixed(2)), max: MAD_MAX, ok: mad <= MAD_MAX };
  console.log(`[mad] ${label}: MAD=${mad.toFixed(2)} (max ${MAD_MAX}) ${mad <= MAD_MAX ? "ok" : "FAIL"}`);
  if (mad > MAD_MAX) failed = true;

  // 并排证据
  const w = SIZE;
  await sharp({
    create: { width: w * 2 + 8, height: w + 28, channels: 3, background: { r: 24, g: 24, b: 24 } },
  })
    .composite([
      { input: web, left: 0, top: 28 },
      { input: mg, left: w + 8, top: 28 },
      {
        input: Buffer.from(
          `<svg width="${w * 2 + 8}" height="28"><text x="8" y="20" fill="#ddd" font-size="14">Web KTX2</text><text x="${w + 16}" y="20" fill="#ddd" font-size="14">MG JPG MAD=${mad.toFixed(1)}</text></svg>`,
        ),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toFile(join(OUT, `${label}-compare.png`));
}

writeFileSync(join(OUT, "mad.json"), `${JSON.stringify({ madMax: MAD_MAX, results }, null, 2)}\n`);
await browser.close();
server.close();

if (failed) {
  console.error("[mad] FAIL — decode orientation / texture mismatch. See", OUT);
  process.exit(1);
}
console.log("[mad] ok →", OUT);
