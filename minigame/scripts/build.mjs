/**
 * 打包微信小游戏：
 * - esbuild 把共享 src + entry 打成 js/game.bundle.js（CJS）
 * - 拷贝 public/assets 到素材分包（不拷 basis）
 * - 离线把 KTX2 解成 JPEG，再导出为 .gltf + 独立 jpg
 * - 颜色贴图 ≤1024、法线 ≤512
 * - 同步 AppID；打印主包 / 分包体积
 */
import * as esbuild from "esbuild";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  readdirSync,
  renameSync,
} from "node:fs";
import { dirname, join, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const MG = join(ROOT, "minigame");
const OUT_BUNDLE = join(MG, "js/game.bundle.js");
const SUB_ASSETS = join(MG, "subpackages/assets");

// Node 构建读 .cjs；真机只加载构建生成的 app.config.js
const config = require(join(MG, "app.config.cjs"));

const COLOR_MAX = 1024;
const NORMAL_MAX = 512;

/**
 * 从 app.config.cjs 生成微信可 require 的 app.config.js。
 * 真机不识别 .cjs，运行时绝不能 require('*.cjs')。
 */
function emitRuntimeAppConfig() {
  const out = join(MG, "app.config.js");
  const body = `/**
 * 由 minigame/scripts/build.mjs 从 app.config.cjs 自动生成。
 * 请改 app.config.cjs 后重新 build:minigame，不要手改本文件。
 * 微信小游戏运行时只认 .js。
 */
module.exports = ${JSON.stringify(config, null, 2)};
`;
  writeFileSync(out, body);
  console.log("[build] emitted", relative(ROOT, out));
}

function walkSizes(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) walkSizes(p, acc);
    else acc.push({ path: p, size: statSync(p).size });
  }
  return acc;
}

function sum(files) {
  return files.reduce((n, f) => n + f.size, 0);
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isMainPackageFile(absPath) {
  const rel = relative(MG, absPath).replace(/\\/g, "/");
  if (rel.startsWith("subpackages/")) return false;
  if (rel.startsWith("harness/")) return false;
  if (rel.startsWith("scripts/")) return false;
  if (rel.startsWith("src/")) return false;
  if (rel === "README.md" || rel === "size-report.json") return false;
  if (rel.startsWith("node_modules/")) return false;
  if (rel.endsWith(".map")) return false;
  return true;
}

async function bundle() {
  mkdirSync(dirname(OUT_BUNDLE), { recursive: true });
  await esbuild.build({
    absWorkingDir: ROOT,
    entryPoints: [join(MG, "src/entry.ts")],
    outfile: OUT_BUNDLE,
    bundle: true,
    format: "cjs",
    platform: "browser",
    target: ["es2020"],
    sourcemap: process.env.MINIGAME_SOURCEMAP === "1",
    minify: true,
    legalComments: "none",
    logLevel: "info",
    define: {
      "import.meta.env.BASE_URL": JSON.stringify("./"),
      "import.meta.env.DEV": "false",
      "import.meta.env.PROD": "true",
      "import.meta.env.MODE": JSON.stringify("minigame"),
      "import.meta.url": JSON.stringify("https://firewood.local/js/game.bundle.js"),
    },
    loader: {
      ".glsl": "text",
      ".wgsl": "text",
    },
    // 小游戏不打 KTX2Loader（已离线转 JPEG），避免 basis Worker/Blob 代码进主包
    alias: {
      "three/examples/jsm/loaders/KTX2Loader.js": join(MG, "stubs/KTX2Loader.js"),
    },
  });
}

function runGltf(args) {
  const r = spawnSync("npx", ["--yes", "@gltf-transform/cli@4.5.1", ...args], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error(`gltf-transform failed: ${args.join(" ")}`);
  }
}

function decompressKtx2Glb(input, { maxSize = COLOR_MAX, quality = 82 } = {}) {
  if (!existsSync(input)) return;
  const before = statSync(input).size;
  const raw = `${input}.raw.glb`;
  const jpg = `${input}.jpg.glb`;

  console.log("[build] decode KTX2", relative(ROOT, input));
  const decode = spawnSync(process.execPath, [join(MG, "scripts/decode-stump.mjs"), input, raw], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (decode.status !== 0) {
    throw new Error(`decode-stump.mjs failed for ${input}`);
  }

  runGltf(["jpeg", raw, jpg, "--formats", "*", "--quality", String(quality)]);
  runGltf(["resize", jpg, input, "--width", String(maxSize), "--height", String(maxSize)]);
  rmSync(raw, { force: true });
  rmSync(jpg, { force: true });

  const after = statSync(input).size;
  console.log(`[build] ${relative(ROOT, input)} ${formatMb(before)} → ${formatMb(after)}`);
}

/**
 * GLB（已 JPEG）→ .gltf + 独立 jpg/.bin；颜色 ≤1024，法线 ≤512。
 * 输出固定文件名，方便 assets.ts 引用。
 */
function exportExternalGltf(destAssets, glbName, outStem) {
  const glb = join(destAssets, glbName);
  if (!existsSync(glb)) {
    console.warn("[build] skip missing", glbName);
    return;
  }
  const tmpDir = join(destAssets, `.tmp_${outStem}`);
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  const tmpGltf = join(tmpDir, `${outStem}.gltf`);
  runGltf(["copy", glb, tmpGltf]);

  // 先整体压到颜色上限，再把法线压到 512
  runGltf([
    "resize",
    tmpGltf,
    tmpGltf,
    "--width",
    String(COLOR_MAX),
    "--height",
    String(COLOR_MAX),
  ]);
  runGltf([
    "resize",
    tmpGltf,
    tmpGltf,
    "--width",
    String(NORMAL_MAX),
    "--height",
    String(NORMAL_MAX),
    "--pattern",
    "*normal*",
  ]);

  // 把外部资源重命名为 outStem_*，避免 stump/axe 互相覆盖
  const gltfJson = JSON.parse(readFileSync(tmpGltf, "utf8"));
  const images = gltfJson.images || [];
  let colorIdx = 0;
  let normalIdx = 0;
  for (const img of images) {
    if (!img.uri || /^(data:|https?:)/i.test(img.uri)) continue;
    const src = join(tmpDir, img.uri);
    if (!existsSync(src)) continue;
    const isNormal = /normal/i.test(img.uri) || /normal/i.test(img.name || "");
    const ext = img.uri.toLowerCase().endsWith(".png") ? "png" : "jpg";
    let finalName;
    if (isNormal) {
      normalIdx += 1;
      finalName =
        normalIdx === 1 ? `${outStem}_normal.${ext}` : `${outStem}_normal_${normalIdx}.${ext}`;
    } else {
      colorIdx += 1;
      finalName =
        colorIdx === 1 ? `${outStem}_baseColor.${ext}` : `${outStem}_baseColor_${colorIdx}.${ext}`;
    }
    const dest = join(tmpDir, finalName);
    if (src !== dest) renameSync(src, dest);
    img.uri = finalName;
  }
  // bin
  if (gltfJson.buffers) {
    for (const buf of gltfJson.buffers) {
      if (!buf.uri || /^(data:|https?:)/i.test(buf.uri)) continue;
      const src = join(tmpDir, buf.uri);
      const destName = `${outStem}.bin`;
      const dest = join(tmpDir, destName);
      if (existsSync(src) && src !== dest) renameSync(src, dest);
      buf.uri = destName;
    }
  }
  writeFileSync(tmpGltf, `${JSON.stringify(gltfJson, null, 2)}\n`);

  // 移到 assets 根并清理临时目录
  for (const name of readdirSync(tmpDir)) {
    const from = join(tmpDir, name);
    const to = join(destAssets, name);
    rmSync(to, { force: true });
    renameSync(from, to);
  }
  rmSync(tmpDir, { recursive: true, force: true });

  // 源 GLB 已由 .gltf 替代，删掉减小分包（保留 data/anim 等无贴图 GLB）
  rmSync(glb, { force: true });
  console.log(`[build] exported ${outStem}.gltf (+ external jpg/bin)`);
}

async function resizeStandaloneTextures(destAssets) {
  const files = readdirSync(destAssets).filter((n) => /\.jpe?g$/i.test(n));
  for (const name of files) {
    // 跳过刚从模型导出的（已按规则缩过）
    if (/^(stump|axe)_/.test(name)) continue;
    const abs = join(destAssets, name);
    const isNormal = /_n(?:ormal)?(?:_|\.|$)/i.test(name) || /normal/i.test(name);
    const max = isNormal ? NORMAL_MAX : COLOR_MAX;
    const img = sharp(abs);
    const meta = await img.metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;
    if (w <= max && h <= max) continue;
    const scale = Math.min(max / w, max / h, 1);
    const nw = Math.max(1, Math.round(w * scale));
    const nh = Math.max(1, Math.round(h * scale));
    const before = statSync(abs).size;
    await sharp(abs)
      .resize(nw, nh, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(abs + ".tmp");
    renameSync(abs + ".tmp", abs);
    console.log(
      `[build] resize ${name} ${w}x${h} → ${nw}x${nh} (${formatMb(before)} → ${formatMb(statSync(abs).size)})`,
    );
  }
}

function decompressAllKtx2(destAssets) {
  const targets = [
    { file: "stump_v02_mesh_warm_ktx2_2048.glb", maxSize: COLOR_MAX },
    { file: "ax_v01_reduced_compressed.glb", maxSize: COLOR_MAX },
  ];
  for (const t of targets) {
    decompressKtx2Glb(join(destAssets, t.file), { maxSize: t.maxSize });
  }
}

async function copyAssets() {
  const pubAssets = join(ROOT, "public/assets");
  const destAssets = join(SUB_ASSETS, "assets");
  const destBasis = join(SUB_ASSETS, "basis");

  rmSync(destAssets, { recursive: true, force: true });
  rmSync(destBasis, { recursive: true, force: true });
  mkdirSync(SUB_ASSETS, { recursive: true });

  if (!existsSync(pubAssets)) {
    throw new Error(`missing ${pubAssets}`);
  }
  cpSync(pubAssets, destAssets, { recursive: true });
  // 刻意不拷贝 basis_transcoder：小游戏已去掉 KTX2Loader

  decompressAllKtx2(destAssets);
  exportExternalGltf(destAssets, "stump_v02_mesh_warm_ktx2_2048.glb", "stump");
  exportExternalGltf(destAssets, "ax_v01_reduced_compressed.glb", "axe");
  await resizeStandaloneTextures(destAssets);

  const subEntry = join(SUB_ASSETS, "game.js");
  if (!existsSync(subEntry)) {
    writeFileSync(subEntry, 'console.log("[firewood] assets subpackage ready");\n');
  }
}

function syncProjectConfig() {
  const path = join(MG, "project.config.json");
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.appid = config.WECHAT_APPID;
  json.isGameTourist = config.WECHAT_APPID === "touristappid";
  json.description = `劈柴模拟器 — 微信小游戏（AppID ${config.WECHAT_APPID}，可由 app.config.cjs 一处更换）`;
  // 上传包排除 .cjs（含源配置），真机只带生成的 app.config.js
  const ignore = (json.packOptions && json.packOptions.ignore) || [];
  const need = [
    { type: "suffix", value: ".cjs" },
    { type: "file", value: "app.config.cjs" },
  ];
  for (const item of need) {
    if (!ignore.some((i) => i.type === item.type && i.value === item.value)) {
      ignore.push(item);
    }
  }
  json.packOptions = json.packOptions || {};
  json.packOptions.ignore = ignore;
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
}

/** 扫描上传包：禁止任何 require('*.cjs') */
function assertNoCjsRequireInPackage() {
  const skipTop = new Set(["harness", "scripts", "src", "node_modules"]);
  const hits = [];
  const re = /require\s*\(\s*['"][^'"]*\.cjs['"]\s*\)/;

  function walk(dir) {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      if (name.name.startsWith(".")) continue;
      const p = join(dir, name.name);
      const rel = relative(MG, p).replace(/\\/g, "/");
      const top = rel.split("/")[0];
      if (skipTop.has(top)) continue;
      if (name.isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.js$/.test(name.name)) continue;
      const text = readFileSync(p, "utf8");
      if (re.test(text)) hits.push(rel);
    }
  }
  walk(MG);
  if (hits.length) {
    throw new Error(
      `upload package still require('*.cjs') — WeChat will black-screen:\n  - ${hits.join("\n  - ")}`,
    );
  }
  console.log("[build] assertNoCjsRequireInPackage: ok");
}

function reportSizes() {
  const all = walkSizes(MG).filter((f) => {
    const rel = relative(MG, f.path).replace(/\\/g, "/");
    return !rel.startsWith("harness/") && !rel.startsWith("scripts/") && !rel.startsWith("src/");
  });
  const mainFiles = all.filter((f) => isMainPackageFile(f.path));
  const subFiles = all.filter((f) =>
    relative(MG, f.path).replace(/\\/g, "/").startsWith("subpackages/"),
  );
  const mainBytes = sum(mainFiles);
  const subBytes = sum(subFiles);

  const report = {
    appid: config.WECHAT_APPID,
    mainPackageBytes: mainBytes,
    mainPackage: formatMb(mainBytes),
    mainUnder4MB: mainBytes <= 4 * 1024 * 1024,
    assetsSubpackageBytes: subBytes,
    assetsSubpackage: formatMb(subBytes),
    bundle: formatMb(statSync(OUT_BUNDLE).size),
    largestMain: mainFiles
      .slice()
      .sort((a, b) => b.size - a.size)
      .slice(0, 8)
      .map((f) => ({ file: relative(MG, f.path), size: formatMb(f.size) })),
  };

  writeFileSync(join(MG, "size-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log("\n=== minigame size report ===");
  console.log(JSON.stringify(report, null, 2));
  if (!report.mainUnder4MB) {
    console.error("ERROR: main package exceeds 4MB WeChat limit");
    process.exitCode = 1;
  }
}

emitRuntimeAppConfig();
await bundle();
await copyAssets();
syncProjectConfig();
assertNoCjsRequireInPackage();
reportSizes();
console.log("\nminigame build ok →", MG);
