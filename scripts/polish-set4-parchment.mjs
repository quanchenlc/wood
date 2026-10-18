/**
 * 0.2.3 set4 polish: stronger illustrated sepia, ink lines + hatch,
 * light parchment ground island, crisp top rings preserved.
 */
import { readFileSync, writeFileSync, renameSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEST = join(ROOT, "art-sets/set4");
const PARCH = join(ROOT, "ui-parchment-v2/textures/bg_parchment.jpg");
const SRC1 = join(ROOT, "art-sets/set1");

function sepiaRamp(t) {
  // lighter paper range — avoid muddy chocolate floor
  const stops = [
    [0.0, [62, 42, 28]], // ink
    [0.18, [110, 78, 48]],
    [0.4, [168, 138, 96]],
    [0.62, [210, 188, 148]],
    [0.82, [232, 216, 184]],
    [1.0, [244, 234, 210]],
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

function lum(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Hatch pattern: diagonal ink lines in shadow regions */
function hatch(x, y, amount) {
  if (amount <= 0.02) return 0;
  const s = ((x + y * 2) % 7) / 7;
  const line = s < 0.22 ? 1 : 0;
  const s2 = ((x * 2 - y) % 11) / 11;
  const line2 = s2 < 0.12 ? 0.6 : 0;
  return Math.min(1, line + line2) * amount;
}

async function illustrate(srcPath, outPath, opts) {
  const w = opts.w;
  const h = opts.h;
  // Prefer set1 source for max detail on stump top island when polishing stump
  const src = await loadRaw(srcPath, w, h);
  const grain = await loadRaw(PARCH, w, h);
  const out = Buffer.alloc(w * h * 3);
  const Lbuf = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 3;
    Lbuf[i] = lum(src.data[o], src.data[o + 1], src.data[o + 2]);
  }

  const inkStr = opts.ink ?? 0.72;
  const contrast = opts.contrast ?? 1.35;
  const grainAmt = opts.grain ?? 0.38;
  const liftDark = opts.liftDark ?? 0.12; // push muddy darks toward paper
  const hatchAmt = opts.hatch ?? 0.45;
  // Optional: protect bright ring detail (top island often brighter)
  const protectBright = opts.protectBright ?? true;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 3;
      let L = Lbuf[i];
      L = Math.min(1, Math.max(0, (L - 0.42) * contrast + 0.42));
      L = L + liftDark * Math.pow(1 - L, 1.6);

      const xm = Math.min(w - 1, x + 1);
      const ym = Math.min(h - 1, y + 1);
      const gx = Lbuf[y * w + xm] - Lbuf[y * w + Math.max(0, x - 1)];
      const gy = Lbuf[ym * w + x] - Lbuf[Math.max(0, y - 1) * w + x];
      let edge = Math.min(1, Math.sqrt(gx * gx + gy * gy) * 5.2);

      // keep fine rings: if already bright+high-freq, soften ink crush
      if (protectBright && L > 0.62) edge *= 0.55;

      let [r, g, b] = sepiaRamp(L);
      const gL = lum(grain.data[o], grain.data[o + 1], grain.data[o + 2]);
      const gMul = 1 + (gL - 0.52) * grainAmt * 2.2;
      r = Math.min(255, Math.max(0, r * gMul));
      g = Math.min(255, Math.max(0, g * gMul));
      b = Math.min(255, Math.max(0, b * gMul));

      const ink = edge * inkStr;
      r = Math.round(r * (1 - ink) + 38 * ink);
      g = Math.round(g * (1 - ink) + 26 * ink);
      b = Math.round(b * (1 - ink) + 16 * ink);

      // cross-hatch in shadows
      const shadow = Math.max(0, 0.55 - L);
      const ht = hatch(x, y, shadow * hatchAmt);
      r = Math.round(r * (1 - ht * 0.55) + 48 * ht * 0.55);
      g = Math.round(g * (1 - ht * 0.55) + 34 * ht * 0.55);
      b = Math.round(b * (1 - ht * 0.55) + 22 * ht * 0.55);

      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
    }
  }

  const tmp = outPath + ".tmp.jpg";
  await sharp(out, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: opts.q ?? 86, mozjpeg: true })
    .toFile(tmp);
  renameSync(tmp, outPath);
}

async function softNormal(src, dest, w, h) {
  const { data, info } = await sharp(src)
    .resize(w, h, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  const flat = 0.62; // flatter for illustration
  for (let i = 0; i < info.width * info.height; i++) {
    const o = i * 4;
    out[o] = Math.round(data[o] * (1 - flat) + 128 * flat);
    out[o + 1] = Math.round(data[o + 1] * (1 - flat) + 128 * flat);
    out[o + 2] = Math.round(data[o + 2] * (1 - flat) + 255 * flat);
    out[o + 3] = 255;
  }
  const tmp = dest + ".tmp.png";
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(tmp);
  renameSync(tmp, dest);
}

/** Light warm parchment ground — paper grain, not mud */
async function makeGround() {
  const tmp = join(DEST, "ground.jpg.tmp");
  await sharp(PARCH)
    .resize(768, 768, { fit: "cover" })
    .modulate({ brightness: 1.12, saturation: 0.42 })
    .tint({ r: 220, g: 200, b: 160 })
    .blur(0.3)
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(tmp);
  renameSync(tmp, join(DEST, "ground.jpg"));
}

/** Soft vignette parchment for optional far card — lighter center */
async function makeBg() {
  const { data, info } = await sharp(PARCH)
    .resize(480, 854, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const out = Buffer.from(data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      // mild bottom vignette so it can blend toward ground fog (no hard edge)
      const v = y / (h - 1);
      const bottomFade = Math.pow(Math.max(0, v - 0.45) / 0.55, 1.4);
      // lift toward paper cream at bottom
      out[o] = Math.min(255, Math.round(out[o] * (1 - bottomFade * 0.15) + 236 * bottomFade * 0.15));
      out[o + 1] = Math.min(255, Math.round(out[o + 1] * (1 - bottomFade * 0.15) + 220 * bottomFade * 0.15));
      out[o + 2] = Math.min(255, Math.round(out[o + 2] * (1 - bottomFade * 0.15) + 186 * bottomFade * 0.15));
    }
  }
  const tmp = join(DEST, "bg_parchment.jpg.tmp");
  await sharp(out, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 76, mozjpeg: true })
    .toFile(tmp);
  renameSync(tmp, join(DEST, "bg_parchment.jpg"));
}

console.log("[polish-set4] illustrate maps from set1 sources…");

await illustrate(join(SRC1, "stump_baseColor.jpg"), join(DEST, "stump_baseColor.jpg"), {
  w: 2048,
  h: 2048,
  ink: 0.78,
  contrast: 1.4,
  grain: 0.4,
  liftDark: 0.22,
  hatch: 0.5,
  q: 86,
  protectBright: true,
});
await softNormal(join(SRC1, "stump_normal.png"), join(DEST, "stump_normal.png"), 256, 256);

await illustrate(join(SRC1, "axe_baseColor.jpg"), join(DEST, "axe_baseColor.jpg"), {
  w: 1024,
  h: 1024,
  ink: 0.85,
  contrast: 1.45,
  grain: 0.28,
  liftDark: 0.1,
  hatch: 0.55,
  q: 84,
});

await illustrate(join(SRC1, "outsidebark.jpg"), join(DEST, "outsidebark.jpg"), {
  w: 1024,
  h: 512,
  ink: 0.75,
  contrast: 1.35,
  grain: 0.36,
  liftDark: 0.15,
  hatch: 0.48,
  q: 84,
});
await softNormal(join(SRC1, "outsidebark_n.png"), join(DEST, "outsidebark_n.png"), 256, 128);

await illustrate(join(SRC1, "top.jpg"), join(DEST, "top.jpg"), {
  w: 1024,
  h: 1024,
  ink: 0.7,
  contrast: 1.38,
  grain: 0.3,
  liftDark: 0.08,
  hatch: 0.25,
  q: 88,
  protectBright: true,
});
await softNormal(join(SRC1, "top_n.png"), join(DEST, "top_n.png"), 256, 256);

await illustrate(join(SRC1, "insidegrain.jpg"), join(DEST, "insidegrain.jpg"), {
  w: 1024,
  h: 1024,
  ink: 0.55,
  contrast: 1.25,
  grain: 0.32,
  liftDark: 0.12,
  hatch: 0.35,
  q: 84,
});
await softNormal(join(SRC1, "insidegrain_n.png"), join(DEST, "insidegrain_n.png"), 256, 256);

await makeGround();
await makeBg();

// bump roughness in gltfs
for (const stem of ["stump", "stump_lod", "axe"]) {
  const p = join(DEST, `${stem}.gltf`);
  const g = JSON.parse(readFileSync(p, "utf8"));
  for (const mat of g.materials || []) {
    mat.pbrMetallicRoughness = mat.pbrMetallicRoughness || {};
    mat.pbrMetallicRoughness.metallicFactor = 0;
    mat.pbrMetallicRoughness.roughnessFactor = stem === "axe" ? 0.88 : 0.97;
  }
  writeFileSync(p, `${JSON.stringify(g, null, 1)}\n`);
}

const manifest = {
  id: "set4",
  label: "羊皮纸",
  version: 2,
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
  // warm paper — matches fog so horizon soft-blends (no hard seam)
  sky: "#e6d7b8",
  fog: "#e6d7b8",
  ground: "#d8c8a4",
  grass: {
    deep: [0.28, 0.22, 0.12],
    fresh: [0.4, 0.34, 0.2],
    dry: [0.48, 0.4, 0.26],
  },
  styleDescription:
    "羊皮纸 v2 polish：浅赭纸地+墨线草；插画化 stump/斧；暖雾消地平线硬缝；描边+阴影排线。",
};
writeFileSync(join(DEST, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

let total = 0;
for (const n of readdirSync(DEST)) {
  if (n === "SOURCES.md" || n.startsWith("preview")) continue;
  total += statSync(join(DEST, n)).size;
}
console.log(`[polish-set4] done ${(total / 1048576).toFixed(2)} MB`);
