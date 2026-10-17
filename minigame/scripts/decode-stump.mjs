/**
 * 用 headless Chromium + three.js KTX2Loader 把 stump GLB 里的 KTX2
 * 贴图解成 JPEG，再经 GLTFExporter 导出无 KHR_texture_basisu 的 GLB。
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const INPUT = process.argv[2] || join(ROOT, "public/assets/stump_v02_mesh_warm_ktx2_2048.glb");
const OUTPUT = process.argv[3] || INPUT;

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
  ".html": "text/html",
};

const html = `<!doctype html>
<html><body>
<script type="importmap">
{
  "imports": {
    "three": "/node_modules/three/build/three.module.js",
    "three/addons/": "/node_modules/three/examples/jsm/"
  }
}
</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(64, 64);
document.body.appendChild(renderer.domElement);

const ktx2 = new KTX2Loader()
  .setTranscoderPath('/public/basis/')
  .detectSupport(renderer);

const loader = new GLTFLoader().setKTX2Loader(ktx2);
const gltf = await loader.loadAsync('/input.glb');

// 把压缩贴图画到 canvas，换成普通 CanvasTexture，便于 exporter 出 JPEG/PNG
async function materializeTexture(tex) {
  if (!tex || !tex.isTexture) return tex;
  if (tex.isCanvasTexture || (tex.image && tex.image.tagName === 'IMG')) return tex;
  const img = tex.image;
  const w = img?.width || img?.image?.width || tex.source?.data?.width;
  const h = img?.height || img?.image?.height || tex.source?.data?.height;
  if (!w || !h) return tex;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  try {
    // CompressedTexture / ImageBitmap / HTMLCanvas
    if (typeof createImageBitmap === 'function' && (img instanceof ImageBitmap || img?.data)) {
      const bmp = img instanceof ImageBitmap ? img : await createImageBitmap(img);
      ctx.drawImage(bmp, 0, 0);
    } else if (img instanceof HTMLCanvasElement || img instanceof HTMLImageElement) {
      ctx.drawImage(img, 0, 0);
    } else {
      // 回读 GPU：用临时场景贴到全屏四边形
      const rt = new THREE.WebGLRenderTarget(w, h);
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const mat = new THREE.MeshBasicMaterial({ map: tex });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      const sc = new THREE.Scene();
      sc.add(mesh);
      renderer.setRenderTarget(rt);
      renderer.render(sc, cam);
      renderer.setRenderTarget(null);
      const buf = new Uint8Array(w * h * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
      const data = new ImageData(new Uint8ClampedArray(buf), w, h);
      // WebGL Y-flip
      const flip = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        const src = (h - 1 - y) * w * 4;
        const dst = y * w * 4;
        flip.data.set(data.data.subarray(src, src + w * 4), dst);
      }
      ctx.putImageData(flip, 0, 0);
      rt.dispose();
      mat.dispose();
    }
  } catch (e) {
    console.warn('texture bake failed', e);
    return tex;
  }
  const out = new THREE.CanvasTexture(c);
  out.colorSpace = tex.colorSpace;
  out.wrapS = tex.wrapS;
  out.wrapT = tex.wrapT;
  out.magFilter = tex.magFilter;
  out.minFilter = THREE.LinearMipmapLinearFilter;
  out.flipY = false;
  out.needsUpdate = true;
  return out;
}

gltf.scene.traverse(async () => {});
const meshes = [];
gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
for (const mesh of meshes) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const mat of mats) {
    if (!mat) continue;
    for (const key of ['map', 'normalMap', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
      if (mat[key]) mat[key] = await materializeTexture(mat[key]);
    }
  }
}

const exporter = new GLTFExporter();
const ab = await new Promise((resolve, reject) => {
  exporter.parse(
    gltf.scene,
    (result) => resolve(result),
    (err) => reject(err),
    { binary: true, forceIndices: true },
  );
});

const bytes = new Uint8Array(ab);
let binary = '';
for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
window.__OUT_B64 = btoa(binary);
window.__OUT_SIZE = bytes.length;
console.log('exported', bytes.length);
</script>
</body></html>`;

const PORT = 5199;
const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let file;
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
    return;
  }
  if (url.pathname === "/input.glb") file = INPUT;
  else file = join(ROOT, url.pathname.replace(/^\//, ""));
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
const page = await browser.newPage();
page.on("console", (m) => console.log("[decode]", m.text()));
page.on("pageerror", (e) => console.error("[decode:err]", e.message));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle0", timeout: 120000 });
await page.waitForFunction(() => window.__OUT_B64, { timeout: 180000 });
const { b64, size } = await page.evaluate(() => ({ b64: window.__OUT_B64, size: window.__OUT_SIZE }));
const buf = Buffer.from(b64, "base64");
writeFileSync(OUTPUT, buf);
console.log(`[decode-stump] ${INPUT} (${statSync(INPUT).size}) → ${OUTPUT} (${size})`);
await browser.close();
server.close();
