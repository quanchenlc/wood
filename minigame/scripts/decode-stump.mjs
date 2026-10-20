/**
 * 用 headless Chromium + three.js KTX2Loader 把 stump/axe GLB 里的 KTX2
 * 贴图解成未压缩图，再经 GLTFExporter 导出无 KHR_texture_basisu 的 GLB。
 *
 * P0：GPU 回读必须带正确 colorSpace（sRGB map → SRGBColorSpace），
 * 否则按 linear 写出亮度≈0.33、发黑发脏。compressed 禁止 createImageBitmap。
 *
 * P0′：readRenderTargetPixels 后不要再做 CPU Y-flip；外置 JPG + glTF flipY=false
 * 必须与 KTX2 GPU 采样同向，否则斧柄会采到 atlas 邻岛。
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

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
renderer.setSize(64, 64);
// 默认 output 是 sRGB；blit 到 RT 时会另设，避免和默认搅在一起
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const ktx2 = new KTX2Loader()
  .setTranscoderPath('/public/basis/')
  .detectSupport(renderer);

const loader = new GLTFLoader().setKTX2Loader(ktx2);
const gltf = await loader.loadAsync('/input.glb');

/**
 * 把压缩贴图 GPU 回读到 canvas，换成普通 CanvasTexture，便于 exporter 出 JPEG/PNG。
 * compressed 只用 GPU 回读，不走 createImageBitmap。
 */
async function materializeTexture(tex) {
  if (!tex || !tex.isTexture) return tex;
  // 已是 CPU 可读位图且非压缩：直接用
  if (
    !tex.isCompressedTexture &&
    (tex.isCanvasTexture ||
      (tex.image && (tex.image.tagName === 'IMG' || tex.image.tagName === 'CANVAS')))
  ) {
    return tex;
  }
  const img = tex.image;
  const w = img?.width || img?.image?.width || tex.source?.data?.width;
  const h = img?.height || img?.image?.height || tex.source?.data?.height;
  if (!w || !h) return tex;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const prevTarget = renderer.getRenderTarget();
  const prevOutput = renderer.outputColorSpace;
  const texCS = tex.colorSpace || THREE.NoColorSpace;
  try {
    if (
      !tex.isCompressedTexture &&
      (img instanceof HTMLCanvasElement || img instanceof HTMLImageElement)
    ) {
      ctx.drawImage(img, 0, 0);
    } else {
      // CompressedTexture 等：只走 GPU 回读（禁止 createImageBitmap）
      //
      // 根因：普通 RT 按 working(linear) 写出；sRGB map 经 shader decode 后写线性
      // → 亮度≈0.33。构造 RT 时必须传入 colorSpace: tex.colorSpace。
      //
      // Basis/KTX2 在 GPU 上已是 sRGB 编码字节；若再走 sRGB→linear→sRGB 会过亮(~170)。
      // blit 时：关掉 ColorManagement、tex/RT/output 均 NoColorSpace，原样拷 texel；
      // 导出的 CanvasTexture 再挂回 texCS，供后续 JPEG/PNG 与运行时使用。
      const rt = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        // 客户端要求：sRGB map 必须带 SRGBColorSpace（记录意图；blit 中临时改 NoColorSpace）
        colorSpace: texCS,
        depthBuffer: false,
        stencilBuffer: false,
      });

      const prevCM = THREE.ColorManagement.enabled;
      const prevTexCS = tex.colorSpace;
      THREE.ColorManagement.enabled = false;
      tex.colorSpace = THREE.NoColorSpace;
      rt.texture.colorSpace = THREE.NoColorSpace;

      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      const sc = new THREE.Scene();
      sc.add(mesh);

      // 勿与默认 sRGB output 搅在一起（NoColorSpace 不能当 output，会缺 config）
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(sc, cam);

      tex.colorSpace = prevTexCS;
      THREE.ColorManagement.enabled = prevCM;

      const buf = new Uint8Array(w * h * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
      // 不要再做 CPU Y-flip：外置 JPG + glTF flipY=false 需与 KTX2 GPU 采样同向。
      // 旧逻辑（readRenderTargetPixels 后再竖直翻转）会写出 V 颠倒的 baseColor，
      // 导致斧柄中段采到 atlas 邻岛（橙/白条纹）；同 mesh 把 JPG 再翻回来即可对齐 web。
      const data = new ImageData(new Uint8ClampedArray(buf.buffer), w, h);
      ctx.putImageData(data, 0, 0);
      rt.dispose();
      mat.dispose();
    }
  } catch (e) {
    console.warn('texture bake failed', e);
    renderer.setRenderTarget(prevTarget);
    renderer.outputColorSpace = prevOutput;
    return tex;
  }
  renderer.setRenderTarget(prevTarget);
  renderer.outputColorSpace = prevOutput;

  const out = new THREE.CanvasTexture(c);
  out.colorSpace = texCS;
  out.wrapS = tex.wrapS;
  out.wrapT = tex.wrapT;
  out.magFilter = tex.magFilter;
  out.minFilter = THREE.LinearMipmapLinearFilter;
  out.flipY = false;
  out.needsUpdate = true;
  return out;
}

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
