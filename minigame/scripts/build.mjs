/**
 * 打包微信小游戏：
 * - esbuild 把共享 src + entry 打成 js/game.bundle.js（CJS）
 * - 拷贝 public/assets 到素材分包（不拷 basis）
 * - 离线把 KTX2 树桩解成 JPEG 嵌进 GLB
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
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const MG = join(ROOT, "minigame");
const OUT_BUNDLE = join(MG, "js/game.bundle.js");
const SUB_ASSETS = join(MG, "subpackages/assets");

const config = require(join(MG, "app.config.cjs"));

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

function decompressKtx2Glb(input, { maxSize = 1024, quality = 82 } = {}) {
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

function decompressAllKtx2(destAssets) {
  // 凡带 KHR_texture_basisu 的模型都离线转 JPEG
  const targets = [
    { file: "stump_v02_mesh_warm_ktx2_2048.glb", maxSize: 1024 },
    { file: "ax_v01_reduced_compressed.glb", maxSize: 1024 },
  ];
  for (const t of targets) {
    decompressKtx2Glb(join(destAssets, t.file), { maxSize: t.maxSize });
  }
}

function copyAssets() {
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
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
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

await bundle();
copyAssets();
syncProjectConfig();
reportSizes();
console.log("\nminigame build ok →", MG);
