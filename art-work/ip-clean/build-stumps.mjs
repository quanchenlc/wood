/**
 * 0.4.1 — solid chopping-block stumps A/B.
 * Wide cylindrical block (≥ log width), sawn flat top, bark sides, gentle root flare.
 * Soft-edged forest-floor patch (no hard disc).
 */
import { existsSync, mkdirSync, writeFileSync, cpSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup } from "@gltf-transform/functions";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const DL = "/tmp/ip-clean-dl";
const OUT_A = join(ROOT, "public/assets/stump-a");
const OUT_B = join(ROOT, "public/assets/stump-b");
const ASSETS = join(ROOT, "public/assets");

/** Match physics STUMP_TOP_RADIUS ≈ 11*INCH; slightly wider than typical log. */
const TARGET_R = 0.32;
const TARGET_H = 0.42;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

async function makeCollider(outPath, radius = TARGET_R, height = TARGET_H) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const segs = 24;
  const positions = [];
  const indices = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    positions.push(x, 0, z, x, -height, z);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const posAcc = doc
    .createAccessor()
    .setType("VEC3")
    .setArray(new Float32Array(positions))
    .setBuffer(buffer);
  const idxAcc = doc
    .createAccessor()
    .setType("SCALAR")
    .setArray(new Uint16Array(indices))
    .setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", posAcc)
    .setIndices(idxAcc)
    .setMode(4);
  const mesh = doc.createMesh("stump_collider").addPrimitive(prim);
  const collider = doc.createNode("stump_collider").setMesh(mesh);
  // Keep well inside ground disc (14*FOOT≈4.27). Prior −5.3 / −3.2 sat on the rim
  // and read as floating above the horizon. Y: mesh bottom ≈ -H → y = GROUND_Y + H.
  // Behind-left of hero stump, well inside leafy disc (not on horizon rim).
  // Y slightly below 0 so mesh bottom (≈ -H) sits into GROUND_Y (-0.33).
  const instance = doc
    .createNode("instance")
    .setTranslation([-1.2, -0.08, -0.7])
    .setScale([-1, 1, 1]);
  const scene = doc.createScene("data").addChild(collider).addChild(instance);
  doc.getRoot().setDefaultScene(scene);
  await io.write(outPath, doc);
}

async function writeHeroAndLod(doc, outDir, lodMeshOpts) {
  for (const b of doc.getRoot().listBuffers()) b.setURI("stump.bin");
  await io.write(join(outDir, "stump.gltf"), doc);
  forceClampSamplers(join(outDir, "stump.gltf"));
  // Do NOT meshopt-simplify: it welds the u=0/u=1 seam column and melts far-stump UVs.
  // Build a true low-seg mesh instead (same atlas, fewer rings).
  const lodDir = join(outDir, ".lod-tmp");
  ensureDir(lodDir);
  const { cpSync: cp, rmSync: rm } = await import("node:fs");
  cp(join(outDir, "stump_baseColor.jpg"), join(lodDir, "stump_baseColor.jpg"));
  cp(join(outDir, "stump_normal.jpg"), join(lodDir, "stump_normal.jpg"));
  genSolidBlockPy(lodDir, lodMeshOpts);
  let lodDoc = await io.read(join(lodDir, "stump.gltf"));
  await lodDoc.transform(dedup());
  for (const b of lodDoc.getRoot().listBuffers()) b.setURI("stump_lod.bin");
  await io.write(join(outDir, "stump_lod.gltf"), lodDoc);
  forceClampSamplers(join(outDir, "stump_lod.gltf"));
  rm(lodDir, { recursive: true, force: true });
}

/** Soft-edged forest floor: leaves/chips in center → fade to ground green. */
async function makeSoftGround(outPath, leafSrc, groundRgb = [63, 74, 38]) {
  const size = 1024;
  const leaf = await sharp(leafSrc)
    .resize(size, size, { fit: "cover" })
    .modulate({ saturation: 0.9, brightness: 0.95 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = leaf;
  const out = Buffer.alloc(size * size * 3);
  const cx = size / 2;
  const cy = size / 2;
  // Soft falloff: full leaf to ~0.55R, gone by ~0.92R
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      // Soft blend starts early so the disc doesn't read as a hard cookie-cutter
      let t = 1;
      if (r > 0.28) t = Math.max(0, 1 - (r - 0.28) / 0.62);
      t = t * t * (3 - 2 * t); // smoothstep
      out[i] = Math.round(data[i] * t + groundRgb[0] * (1 - t));
      out[i + 1] = Math.round(data[i + 1] * t + groundRgb[1] * (1 - t));
      out[i + 2] = Math.round(data[i + 2] * t + groundRgb[2] * (1 - t));
    }
  }
  await sharp(out, { raw: { width: size, height: size, channels: 3 } })
    .jpeg({ quality: 84 })
    .toFile(outPath);
  void info;
}

function genSolidBlockPy(outDir, opts) {
  const {
    rTop = TARGET_R,
    rBot = TARGET_R * 1.18,
    h = TARGET_H,
    segs = 64,
    stacks = 12,
    uneven = 0.012,
    seed = 1,
    oval = 0.0,
    ridge = 0.04,
  } = opts;
  const script = join(__dirname, "gen_sealed_block.py");
  const r = spawnSync(
    "python3",
    [
      script,
      outDir,
      String(rTop),
      String(rBot),
      String(h),
      String(segs),
      String(stacks),
      String(uneven),
      String(seed),
      String(oval),
      String(ridge),
    ],
    { stdio: "inherit" },
  );
  if (r.status !== 0) throw new Error("sealed block mesh gen failed");
}

const CLAMP_TO_EDGE = 33071;

/** Ensure written glTF samplers are ClampToEdge (never REPEAT 10497). */
function forceClampSamplers(gltfPath) {
  const gltf = JSON.parse(readFileSync(gltfPath, "utf8"));
  if (!gltf.samplers || !gltf.samplers.length) {
    gltf.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: CLAMP_TO_EDGE, wrapT: CLAMP_TO_EDGE }];
  } else {
    for (const s of gltf.samplers) {
      s.wrapS = CLAMP_TO_EDGE;
      s.wrapT = CLAMP_TO_EDGE;
    }
  }
  writeFileSync(gltfPath, `${JSON.stringify(gltf)}\n`);
}

async function makeAtlas(outDir) {
  // bark top ~448 + warm wood pad + end-grain bottom — pad kills mip bleed grey rim at v=0.5
  const barkH = 448;
  const padH = 64;
  const endH = 512;
  const barkBuf = await sharp(join(ASSETS, "outsidebark.jpg")).resize(1024, barkH).jpeg().toBuffer();
  const topMeta = await sharp(join(ASSETS, "top.jpg")).resize(64, 64).stats();
  const edgeRgb = {
    r: Math.round(topMeta.channels[0].mean),
    g: Math.round(topMeta.channels[1].mean),
    b: Math.round(topMeta.channels[2].mean),
  };
  // Cover full bottom with end grain (overscan) so rim UVs stay wood-colored
  const topFull = await sharp(join(ASSETS, "top.jpg"))
    .resize(1024, endH + padH, { fit: "cover" })
    .jpeg()
    .toBuffer();
  await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: edgeRgb },
  })
    .composite([
      { input: barkBuf, top: 0, left: 0 },
      { input: topFull, top: barkH, left: 0 },
    ])
    .jpeg({ quality: 88 })
    .toFile(join(outDir, "stump_baseColor.jpg"));

  const barkN = join(ASSETS, "outsidebark_n.jpg");
  await sharp(barkN).resize(512, 512).jpeg({ quality: 85 }).toFile(join(outDir, "stump_normal.jpg"));
}

async function processVariant(id, outDir, meshOpts, leafSrc) {
  ensureDir(outDir);
  await makeAtlas(outDir);
  await makeSoftGround(join(outDir, "ground_floor.jpg"), leafSrc);
  genSolidBlockPy(outDir, meshOpts);
  let doc = await io.read(join(outDir, "stump.gltf"));
  // dedup only — do NOT weld: seam column shares XYZ but needs distinct UVs (u=0 vs u=1).
  // Welding re-merges them and brings back the dark vertical stripe.
  await doc.transform(dedup());
  const lodOpts = {
    ...meshOpts,
    segs: Math.max(16, Math.round((meshOpts.segs || 64) * 0.4)),
    stacks: Math.max(6, Math.round((meshOpts.stacks || 12) * 0.5)),
  };
  await writeHeroAndLod(doc, outDir, lodOpts);
  await makeCollider(join(outDir, "stump_data.glb"));
  // drop png normals if any leftover
  const png = join(outDir, "stump_normal.png");
  if (existsSync(png)) {
    const { unlinkSync } = await import("node:fs");
    unlinkSync(png);
  }
  console.log(`[${id} done]`, outDir);
}

async function main() {
  // Ensure log textures exist first
  if (!existsSync(join(ASSETS, "outsidebark.jpg"))) {
    throw new Error("run gen-log-textures.py first");
  }
  const leaf =
    existsSync(join(DL, "forest_leaves_03_diff_1k.jpg"))
      ? join(DL, "forest_leaves_03_diff_1k.jpg")
      : join(DL, "ph/bark_brown_02_diff_1k.jpg");

  // A: squat wide block, almost round, mild flare — "scan-like" calm silhouette
  await processVariant(
    "A",
    OUT_A,
    { rTop: 0.34, rBot: 0.44, h: 0.40, uneven: 0.008, seed: 2, oval: 0.02, ridge: 0.018, segs: 64, stacks: 14 },
    leaf,
  );
  // B: taller flare, more oval/ridge — distinct but still solid block
  await processVariant(
    "B",
    OUT_B,
    { rTop: 0.32, rBot: 0.46, h: 0.43, uneven: 0.014, seed: 9, oval: 0.05, ridge: 0.06, segs: 56, stacks: 14 },
    leaf,
  );

  // installDefaultFromA without broken await hack
  for (const name of [
    "stump.gltf",
    "stump.bin",
    "stump_baseColor.jpg",
    "stump_normal.jpg",
    "stump_lod.gltf",
    "stump_lod.bin",
    "stump_data.glb",
    "ground_floor.jpg",
  ]) {
    const src = join(OUT_A, name);
    if (existsSync(src)) cpSync(src, join(ASSETS, name));
  }
  for (const stale of ["stump_normal.png", "stump_top.jpg"]) {
    const p = join(ASSETS, stale);
    if (existsSync(p)) {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(p);
    }
  }
  console.log("[install default A → public/assets]");

  for (const dir of [OUT_A, OUT_B]) {
    let n = 0;
    for (const f of ["stump.bin", "stump_baseColor.jpg", "stump_normal.jpg", "stump_lod.bin"]) {
      const p = join(dir, f);
      if (existsSync(p)) n += readFileSync(p).byteLength;
    }
    console.log(dir, "core", (n / 1024 / 1024).toFixed(2), "MB");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
