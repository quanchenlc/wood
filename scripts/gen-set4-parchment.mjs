/**
 * Build art-sets/set4 (羊皮纸) from set1 geometry + parchment-styled textures.
 * Sources: set1 meshes (own); UI parchment scans (CC0/PD via ui-parchment-v2/notes.md);
 * albedo remaps are derivative processing, not third-party brand assets.
 */
import {
  cpSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "art-sets/set1");
const DEST = join(ROOT, "art-sets/set4");
const PARCH = join(ROOT, "ui-parchment-v2/textures/bg_parchment.jpg");

mkdirSync(DEST, { recursive: true });

for (const name of [
  "stump.gltf",
  "stump.bin",
  "stump_lod.gltf",
  "stump_lod.bin",
  "axe.gltf",
  "axe.bin",
  "axe_orm.png",
]) {
  cpSync(join(SRC, name), join(DEST, name));
}

/** Sepia ink ramp: dark chocolate → madder-tinged mid → cream paper */
function sepiaRamp(t) {
  const stops = [
    [0.0, [48, 32, 22]],
    [0.22, [92, 58, 36]],
    [0.45, [140, 100, 62]],
    [0.7, [196, 168, 120]],
    [0.88, [228, 210, 172]],
    [1.0, [242, 230, 200]],
  ];
  let i = 0;
  while (i < stops.length - 1 && t > stops[i + 1][0]) i++;
  const [t0, c0] = stops[i];
  const [t1, c1] = stops[i + 1];
  const u = (t - t0) / Math.max(1e-6, t1 - t0);
  return [
    Math.round(c0[0] + (c1[0] - c0[0]) * u),
    Math.round(c0[1] + (c1[1] - c0[1]) * u),
    Math.round(c0[2] + (c1[2] - c0[2]) * u),
  ];
}

async function loadRaw(path, w, h) {
  const { data, info } = await sharp(path)
    .resize(w, h, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

function luminance(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Remap albedo to parchment sepia + grain + optional ink edge boost */
async function parchmentizeAlbedo(srcPath, outPath, opts = {}) {
  const w = opts.width;
  const h = opts.height;
  const src = await loadRaw(srcPath, w, h);
  const grain = await loadRaw(PARCH, w, h);
  const out = Buffer.alloc(w * h * 3);

  // sobel-ish edge for ink lines (from source luminance)
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 3;
    lum[i] = luminance(src.data[o], src.data[o + 1], src.data[o + 2]);
  }

  const inkStrength = opts.ink ?? 0.55;
  const contrast = opts.contrast ?? 1.15;
  const grainAmt = opts.grain ?? 0.28;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 3;
      let L = lum[i];
      // local contrast stretch
      L = Math.min(1, Math.max(0, (L - 0.5) * contrast + 0.5));

      // edge magnitude
      const xm = Math.min(w - 1, x + 1);
      const ym = Math.min(h - 1, y + 1);
      const gx = lum[y * w + xm] - lum[y * w + Math.max(0, x - 1)];
      const gy = lum[ym * w + x] - lum[Math.max(0, y - 1) * w + x];
      const edge = Math.min(1, Math.sqrt(gx * gx + gy * gy) * 4.5);

      let [r, g, b] = sepiaRamp(L);
      // multiply parchment grain (centered)
      const go = o;
      const gL = luminance(grain.data[go], grain.data[go + 1], grain.data[go + 2]);
      const gMul = 1 + (gL - 0.55) * grainAmt * 2;
      r = Math.min(255, Math.max(0, r * gMul));
      g = Math.min(255, Math.max(0, g * gMul));
      b = Math.min(255, Math.max(0, b * gMul));

      // ink line darkening on edges (sepia ink, not pure black)
      const ink = edge * inkStrength;
      r = Math.round(r * (1 - ink) + 42 * ink);
      g = Math.round(g * (1 - ink) + 28 * ink);
      b = Math.round(b * (1 - ink) + 18 * ink);

      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
    }
  }

  const q = opts.jpegQuality ?? 88;
  await sharp(out, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: q, mozjpeg: true })
    .toFile(outPath);
  return outPath;
}

/** Soften normals toward flat parchment relief (keep structure, lower intensity) */
async function parchmentNormal(srcPath, outPath, size = 512) {
  const { data, info } = await sharp(srcPath)
    .resize(size, size, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  const flat = 0.45; // blend toward flat normal (128,128,255)
  for (let i = 0; i < info.width * info.height; i++) {
    const o = i * 4;
    out[o] = Math.round(data[o] * (1 - flat) + 128 * flat);
    out[o + 1] = Math.round(data[o + 1] * (1 - flat) + 128 * flat);
    out[o + 2] = Math.round(data[o + 2] * (1 - flat) + 255 * flat);
    out[o + 3] = 255;
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

/** Ground: warm parchment dirt/grass hybrid from bg crop */
async function makeGround(outPath) {
  await sharp(PARCH)
    .resize(1024, 1024, { fit: "cover" })
    .modulate({ brightness: 0.72, saturation: 0.55 })
    .tint({ r: 120, g: 110, b: 70 })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(outPath);
}

console.log("[set4] parchmentize textures…");
await parchmentizeAlbedo(join(SRC, "stump_baseColor.jpg"), join(DEST, "stump_baseColor.jpg"), {
  width: 2048,
  height: 2048,
  ink: 0.62,
  contrast: 1.22,
  grain: 0.32,
  jpegQuality: 90,
});
await parchmentNormal(join(SRC, "stump_normal.png"), join(DEST, "stump_normal.png"), 512);

await parchmentizeAlbedo(join(SRC, "axe_baseColor.jpg"), join(DEST, "axe_baseColor.jpg"), {
  width: 1024,
  height: 1024,
  ink: 0.7,
  contrast: 1.25,
  grain: 0.22,
  jpegQuality: 88,
});

await parchmentizeAlbedo(join(SRC, "outsidebark.jpg"), join(DEST, "outsidebark.jpg"), {
  width: 1024,
  height: 512,
  ink: 0.58,
  contrast: 1.18,
  grain: 0.3,
  jpegQuality: 86,
});
{
  const { renameSync } = await import("node:fs");
  const tmp = join(DEST, "outsidebark_n.tmp.png");
  await parchmentNormal(join(SRC, "outsidebark_n.png"), tmp, 512);
  await sharp(tmp).resize(512, 256, { fit: "fill" }).png({ compressionLevel: 9 }).toFile(join(DEST, "outsidebark_n.png"));
  rmSync(tmp, { force: true });
  void renameSync;
}

await parchmentizeAlbedo(join(SRC, "top.jpg"), join(DEST, "top.jpg"), {
  width: 1024,
  height: 1024,
  ink: 0.68,
  contrast: 1.28,
  grain: 0.25,
  jpegQuality: 90,
});
await parchmentNormal(join(SRC, "top_n.png"), join(DEST, "top_n.png"), 512);

await parchmentizeAlbedo(join(SRC, "insidegrain.jpg"), join(DEST, "insidegrain.jpg"), {
  width: 1024,
  height: 1024,
  ink: 0.5,
  contrast: 1.15,
  grain: 0.28,
  jpegQuality: 86,
});
await parchmentNormal(join(SRC, "insidegrain_n.png"), join(DEST, "insidegrain_n.png"), 512);

await makeGround(join(DEST, "ground.jpg"));
cpSync(PARCH, join(DEST, "bg_parchment.jpg"));

// bump stump material roughness in gltf (avoid glossy)
for (const stem of ["stump", "stump_lod", "axe"]) {
  const p = join(DEST, `${stem}.gltf`);
  const g = JSON.parse(readFileSync(p, "utf8"));
  for (const mat of g.materials || []) {
    mat.pbrMetallicRoughness = mat.pbrMetallicRoughness || {};
    mat.pbrMetallicRoughness.metallicFactor = 0;
    mat.pbrMetallicRoughness.roughnessFactor = stem === "axe" ? 0.82 : 0.95;
  }
  g.asset = g.asset || {};
  g.asset.generator = "firewood set4 parchment (geometry from set1; textures remapped CC0 parchment)";
  writeFileSync(p, `${JSON.stringify(g, null, 1)}\n`);
}

const manifest = {
  id: "set4",
  label: "羊皮纸",
  version: 1,
  files: {
    axe: "axe.gltf",
    stump: "stump.gltf",
    stumpLod: "stump_lod.gltf",
    barkColor: "outsidebark.jpg",
    barkNormal: "outsidebark_n.png",
    endColor: "top.jpg",
    endNormal: "top_n.png",
    innerColor: "insidegrain.jpg",
    innerNormal: "insidegrain_n.png",
    groundColor: "ground.jpg",
    background: "bg_parchment.jpg",
  },
  sky: "#c3a372",
  fog: "#c3a372",
  ground: "#6e5a3a",
  grass: {
    deep: [0.22, 0.2, 0.1],
    fresh: [0.42, 0.4, 0.22],
    dry: [0.55, 0.48, 0.28],
  },
  styleDescription:
    "羊皮纸：中世纪手稿/羊皮纸氛围。奶油·赭石·褪朱红点缀；去饱和墨线描边感；暖纸色雾与背景。几何复用 set1（pivot 对齐），贴图为 CC0 扫描羊皮纸衍生再映射。",
};

writeFileSync(join(DEST, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(
  join(DEST, "SOURCES.md"),
  `# set4 羊皮纸 — 来源说明

## 几何
- stump / stump_lod / axe：自 set1 网格（本项目美术交付，自有版权布局），仅改材质粗糙度。

## 贴图
- \`bg_parchment.jpg\` / 颗粒叠加：来自 \`ui-parchment-v2/\`（见该目录 \`notes.md\`），Wikimedia Commons **公有领域 / CC0** 扫描衍生。
- stump / axe / bark / top / insidegrain 色图：对 set1 色图做亮度→赭石色带映射 + 羊皮纸颗粒 + Sobel 墨线，非品牌素材。
- 法线：自 set1 法线弱化（flat blend），保持结构、降低塑料感。

## 未使用
- UI 控件图（panel/ribbon/seal/btn）留给后续羊皮纸 UI 任务，本套装不进分包。
`,
);

// size report
const { readdirSync, statSync } = await import("node:fs");
let total = 0;
for (const n of readdirSync(DEST)) {
  if (n.startsWith("preview")) continue;
  total += statSync(join(DEST, n)).size;
}
console.log(`[set4] written ${DEST} (${(total / 1048576).toFixed(2)} MB)`);
