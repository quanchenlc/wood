/**
 * 同视角对比：web 原版 KTX2 GLB vs minigame 外置 gltf+jpg/png。
 * 产出 stump / axe 对比图到 /opt/cursor/artifacts/texture-compare-0.1.6/
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const OUT = process.env.ARTIFACT_DIR
  ? join(process.env.ARTIFACT_DIR, "texture-compare-0.1.6")
  : "/opt/cursor/artifacts/texture-compare-0.1.6";
mkdirSync(OUT, { recursive: true });

const CHROME =
  process.env.CHROME_PATH ||
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"].find(
    (p) => existsSync(p),
  );

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
    kind === "web-stump"
      ? "/public/assets/stump_v02_mesh_warm_ktx2_2048.glb"
      : kind === "web-axe"
        ? "/public/assets/ax_v01_reduced_compressed.glb"
        : kind === "mg-stump"
          ? "/minigame/subpackages/assets/assets/stump.gltf"
          : "/minigame/subpackages/assets/assets/axe.gltf";
  const useKtx2 = kind.startsWith("web");
  return `<!doctype html>
<html><body style="margin:0;background:#87CEEB">
<canvas id="c" width="512" height="512"></canvas>
<script type="importmap">
{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}
</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
${useKtx2 ? "import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';" : ""}

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(512, 512);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
const light = new THREE.DirectionalLight(0xffffff, 2.2);
light.position.set(2, 4, 3);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.55));

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
// 同视角：略俯视看底座 + 斧头侧面
camera.position.set(1.6, 1.1, 2.2);
camera.lookAt(0, 0.15, 0);

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
    if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
    if (m.color) m.color.set(0xffffff);
    if (typeof m.metalness === 'number') m.metalness = 0;
  }
});
// 居中缩放到视野
const box = new THREE.Box3().setFromObject(root);
const size = box.getSize(new THREE.Vector3());
const center = box.getCenter(new THREE.Vector3());
root.position.sub(center);
const s = 1.4 / Math.max(size.x, size.y, size.z);
root.scale.setScalar(s);
scene.add(root);

renderer.render(scene, camera);
window.__READY__ = true;
</script>
</body></html>`;
}

const PORT = 5201;
const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === "/view") {
    const kind = url.searchParams.get("kind") || "web-stump";
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(pageHtml(kind));
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
  await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${PORT}/view?kind=${kind}`, {
    waitUntil: "networkidle0",
    timeout: 120000,
  });
  await page.waitForFunction(() => window.__READY__, { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 400));
  const path = join(OUT, name);
  await page.screenshot({ path, type: "png" });
  await page.close();
  console.log("[compare]", path);
  return path;
}

await shot("web-stump", "stump-web-ktx2.png");
await shot("mg-stump", "stump-minigame-gltf.png");
await shot("web-axe", "axe-web-ktx2.png");
await shot("mg-axe", "axe-minigame-gltf.png");

// 并排拼接
const { default: sharp } = await import("sharp");
async function sideBySide(a, b, out) {
  const left = sharp(a);
  const right = sharp(b);
  const meta = await left.metadata();
  const w = meta.width || 512;
  const h = meta.height || 512;
  await sharp({
    create: { width: w * 2 + 8, height: h + 36, channels: 3, background: { r: 30, g: 30, b: 30 } },
  })
    .composite([
      { input: await left.png().toBuffer(), left: 0, top: 36 },
      { input: await right.png().toBuffer(), left: w + 8, top: 36 },
      {
        input: Buffer.from(
          `<svg width="${w * 2 + 8}" height="36">
            <text x="16" y="24" fill="#eee" font-size="16" font-family="sans-serif">Web KTX2</text>
            <text x="${w + 24}" y="24" fill="#eee" font-size="16" font-family="sans-serif">Minigame glTF</text>
          </svg>`,
        ),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toFile(out);
  console.log("[compare] side-by-side", out);
}

await sideBySide(join(OUT, "stump-web-ktx2.png"), join(OUT, "stump-minigame-gltf.png"), join(OUT, "stump-compare.png"));
await sideBySide(join(OUT, "axe-web-ktx2.png"), join(OUT, "axe-minigame-gltf.png"), join(OUT, "axe-compare.png"));

// baseColor before/after 缩略并排
await sideBySide(
  join(OUT, "before/stump_baseColor.jpg"),
  join(OUT, "after/stump_baseColor.jpg"),
  join(OUT, "stump_baseColor-before-after.png"),
);

writeFileSync(
  join(OUT, "README.txt"),
  `0.1.6 texture compare
stump-compare.png / axe-compare.png: web KTX2 vs minigame glTF same camera
stump_baseColor-before-after.png: decode fix before(~45,46,27) vs after(~107,111,81)
`,
);

await browser.close();
server.close();
console.log("[compare] done →", OUT);
