/**
 * 打包微信小游戏：
 * - esbuild 把共享 src + entry 打成 js/game.bundle.js（CJS）
 * - 拷贝 public/assets 到素材分包（不拷 basis）
 * - 树桩：离线 KTX2→色图 JPEG + 法线 PNG → stump.gltf
 * - 斧头：直接用美术木柄占位 axe.gltf/.bin/.jpg/.png（去掉 Fiskars GLB）
 * - 色图 JPEG ≤1024 quality≥85；法线必须 PNG ≤512（禁止 JPEG）
 * - 构建后 stump MAD + 木柄斧出图校验；同步 AppID；打印体积
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
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, simplify, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

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
/** 色图 JPEG 质量下限（美术要求 ≥85） */
const COLOR_JPEG_QUALITY = 85;

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

/** 使用 package.json 锁定的本地 @gltf-transform/cli，禁止 npx 现场拉取 */
function resolveGltfCli() {
  // package exports 不暴露 bin 子路径，直接定位 node_modules 内文件
  const candidates = [
    join(ROOT, "node_modules/@gltf-transform/cli/bin/cli.js"),
    join(ROOT, "node_modules/@gltf-transform/cli/bin/cli.cjs"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    "@gltf-transform/cli not found — run npm ci (devDependency @gltf-transform/cli). Do not use npx.",
  );
}

function runGltf(args) {
  const cli = resolveGltfCli();
  const r = spawnSync(process.execPath, [cli, ...args], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error(`gltf-transform failed: ${args.join(" ")}`);
  }
}

/**
 * KTX2 GLB → 解压后：色图转 JPEG（排除 normalTexture 槽），法线转/保持 PNG。
 * 禁止 `jpeg --formats *` 一把梭（会把法线压成 JPEG 发糊发花）。
 */
function decompressKtx2Glb(input, { quality = COLOR_JPEG_QUALITY } = {}) {
  if (!existsSync(input)) return;
  const before = statSync(input).size;
  const raw = `${input}.raw.glb`;
  const colorGlb = `${input}.color.glb`;

  console.log("[build] decode KTX2", relative(ROOT, input));
  const decode = spawnSync(process.execPath, [join(MG, "scripts/decode-stump.mjs"), input, raw], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (decode.status !== 0) {
    throw new Error(`decode-stump.mjs failed for ${input}`);
  }

  // 色图：只转非 normal 槽；源格式含 png（decode 产出），不用 --formats *
  // 用 --formats png 覆盖 decode 后的 PNG 色图；法线槽由 !normalTexture 排除
  runGltf([
    "jpeg",
    raw,
    colorGlb,
    "--formats",
    "png",
    "--slots",
    "!normalTexture",
    "--quality",
    String(quality),
  ]);
  // 法线：强制 PNG（若误成 jpeg 则转回）；不碰色图
  runGltf(["png", colorGlb, input, "--formats", "jpeg", "--slots", "normalTexture"]);
  // 再跑一次 png←png：确保 decode 留下的 PNG 法线也走 png 编码器（可跳过已是最优的）
  runGltf(["png", input, input, "--formats", "png", "--slots", "normalTexture"]);

  rmSync(raw, { force: true });
  rmSync(colorGlb, { force: true });

  const after = statSync(input).size;
  console.log(`[build] ${relative(ROOT, input)} ${formatMb(before)} → ${formatMb(after)}`);
}

/**
 * 按 glTF material 槽判定每张 image 的角色（禁止靠文件名猜 normal）。
 * @returns {Map<number, Set<string>>} imageIndex → roles
 */
function classifyImageRoles(gltfJson) {
  const textures = gltfJson.textures || [];
  const imageRoles = new Map();

  const add = (texIndex, role) => {
    if (texIndex == null || texIndex < 0) return;
    const tex = textures[texIndex];
    if (!tex || tex.source == null) return;
    const imgIdx = tex.source;
    if (!imageRoles.has(imgIdx)) imageRoles.set(imgIdx, new Set());
    imageRoles.get(imgIdx).add(role);
  };

  for (const mat of gltfJson.materials || []) {
    const pbr = mat.pbrMetallicRoughness || {};
    if (pbr.baseColorTexture) add(pbr.baseColorTexture.index, "baseColor");
    if (pbr.metallicRoughnessTexture) add(pbr.metallicRoughnessTexture.index, "metallicRoughness");
    if (mat.normalTexture) add(mat.normalTexture.index, "normal");
    if (mat.emissiveTexture) add(mat.emissiveTexture.index, "emissive");
    if (mat.occlusionTexture) add(mat.occlusionTexture.index, "occlusion");
  }
  return imageRoles;
}

function semanticColorName(outStem, matName, colorIdx) {
  const n = String(matName || "").toLowerCase();
  if (/moss|苔/.test(n)) return `${outStem}_moss.jpg`;
  if (/bark|皮|树皮/.test(n)) return `${outStem}_bark.jpg`;
  if (/top|end|切|顶/.test(n)) return `${outStem}_top.jpg`;
  if (colorIdx === 1) return `${outStem}_baseColor.jpg`;
  return `${outStem}_baseColor_${colorIdx}.jpg`;
}

/**
 * 用 sharp 按角色压尺寸/格式：色图 JPEG≤1024 q≥85，法线 PNG≤512。
 */
async function rewriteTextureFile(absPath, role, destPath) {
  const img = sharp(absPath);
  const meta = await img.metadata();
  const w = meta.width || 1;
  const h = meta.height || 1;
  const isNormal = role === "normal";
  const max = isNormal ? NORMAL_MAX : COLOR_MAX;
  const scale = Math.min(max / w, max / h, 1);
  const nw = Math.max(1, Math.round(w * scale));
  const nh = Math.max(1, Math.round(h * scale));
  const pipeline = sharp(absPath).resize(nw, nh, { fit: "inside", withoutEnlargement: true });
  const tmp = `${destPath}.tmp`;
  if (isNormal) {
    await pipeline.png({ compressionLevel: 9 }).toFile(tmp);
  } else {
    // baseline（非 progressive）：部分微信 WebGL 对 progressive JPEG 贴图不友好
    await pipeline.jpeg({ quality: COLOR_JPEG_QUALITY, mozjpeg: true, progressive: false }).toFile(tmp);
  }
  renameSync(tmp, destPath);
  return { nw, nh, bytes: statSync(destPath).size };
}

/**
 * GLB → .gltf + 外置贴图/.bin。
 * 按 material 槽重命名：{stem}_baseColor.jpg / {stem}_normal.png（无法线则跳过）。
 */
async function exportExternalGltf(destAssets, glbName, outStem) {
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

  // P0 真机：WeChat WebGL 可能不认 normalized u16 TEXCOORD / i16 POSITION
  // （KHR_mesh_quantization）→ UV 爆炸 + REPEAT 平铺 atlas → 斧头橙黑条纹。
  // 导出前去量化为 float32，并去掉该扩展。
  runGltf(["dequantize", tmpGltf, tmpGltf]);

  const gltfJson = JSON.parse(readFileSync(tmpGltf, "utf8"));
  const images = gltfJson.images || [];
  const textures = gltfJson.textures || [];
  const imageRoles = classifyImageRoles(gltfJson);

  // Sampler：REPEAT(10497) → CLAMP_TO_EDGE(33071 / 0x812F)，避免 UV 越界时扫到 atlas 黑底/邻岛
  // 注意：3361 不是合法 GL enum，GLTFLoader 会当成 Repeat，构建侧 clamp 会失效
  const CLAMP = 33071;
  for (const s of gltfJson.samplers || []) {
    s.wrapS = CLAMP;
    s.wrapT = CLAMP;
  }
  if (!gltfJson.samplers || gltfJson.samplers.length === 0) {
    gltfJson.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: CLAMP, wrapT: CLAMP }];
  }
  for (const tex of textures) {
    if (tex.sampler == null) tex.sampler = 0;
  }

  // imageIndex → 引用它的 material 名（多色图时取语义名）
  const imageMatNames = new Map();
  for (const mat of gltfJson.materials || []) {
    const pbr = mat.pbrMetallicRoughness || {};
    const bc = pbr.baseColorTexture && textures[pbr.baseColorTexture.index];
    if (bc && bc.source != null) {
      if (!imageMatNames.has(bc.source)) imageMatNames.set(bc.source, mat.name || "");
    }
  }

  let colorIdx = 0;
  let normalIdx = 0;
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (!img.uri || /^(data:|https?:)/i.test(img.uri)) continue;
    const src = join(tmpDir, img.uri);
    if (!existsSync(src)) continue;

    const roles = imageRoles.get(i) || new Set();
    const isNormal = roles.has("normal") && !roles.has("baseColor");
    // 同图既是色又是法线极少见：按色图处理并告警
    if (roles.has("normal") && roles.has("baseColor")) {
      console.warn(`[build] ${outStem}: image ${i} used as both baseColor and normal — keep as color JPEG`);
    }

    let finalName;
    if (isNormal) {
      normalIdx += 1;
      finalName =
        normalIdx === 1 ? `${outStem}_normal.png` : `${outStem}_normal_${normalIdx}.png`;
    } else {
      colorIdx += 1;
      finalName = semanticColorName(outStem, imageMatNames.get(i), colorIdx);
    }

    const dest = join(tmpDir, finalName);
    const info = await rewriteTextureFile(src, isNormal ? "normal" : "baseColor", dest);
    if (src !== dest && existsSync(src)) rmSync(src, { force: true });
    img.uri = finalName;
    img.mimeType = isNormal ? "image/png" : "image/jpeg";
    console.log(
      `[build] ${outStem} img[${i}] roles=[${[...roles].join(",") || "untagged"}] → ${finalName} ${info.nw}x${info.nh} ${formatMb(info.bytes)}`,
    );
  }

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

  for (const name of readdirSync(tmpDir)) {
    const from = join(tmpDir, name);
    const to = join(destAssets, name);
    rmSync(to, { force: true });
    renameSync(from, to);
  }
  rmSync(tmpDir, { recursive: true, force: true });

  // 清掉旧法线 jpg，避免分包残留
  rmSync(join(destAssets, `${outStem}_normal.jpg`), { force: true });

  rmSync(glb, { force: true });
  validateExportedGltf(destAssets, outStem);
  console.log(`[build] exported ${outStem}.gltf (+ external textures/bin)`);
}

/** 构建后校验：槽位 uri 正确，法线必须是 .png */
function validateExportedGltf(destAssets, outStem) {
  const gltfPath = join(destAssets, `${outStem}.gltf`);
  const gltf = JSON.parse(readFileSync(gltfPath, "utf8"));
  const images = gltf.images || [];
  const textures = gltf.textures || [];

  for (const img of images) {
    if (!img.uri || img.bufferView != null) {
      throw new Error(`[build] ${outStem}.gltf image must be external uri, got ${JSON.stringify(img)}`);
    }
    const abs = join(destAssets, img.uri);
    if (!existsSync(abs)) {
      throw new Error(`[build] ${outStem}.gltf missing texture file ${img.uri}`);
    }
  }

  const roles = classifyImageRoles(gltf);
  let hasBaseColor = false;
  for (const mat of gltf.materials || []) {
    const pbr = mat.pbrMetallicRoughness || {};
    if (pbr.baseColorTexture) {
      hasBaseColor = true;
      const tex = textures[pbr.baseColorTexture.index];
      const img = images[tex.source];
      if (!/\.jpe?g$/i.test(img.uri)) {
        throw new Error(`[build] ${outStem}: baseColor must be JPEG, got ${img.uri}`);
      }
      if (img.mimeType && img.mimeType !== "image/jpeg") {
        throw new Error(`[build] ${outStem}: baseColor mimeType must be image/jpeg`);
      }
    }
    if (mat.normalTexture) {
      const tex = textures[mat.normalTexture.index];
      const img = images[tex.source];
      if (!/\.png$/i.test(img.uri)) {
        throw new Error(`[build] ${outStem}: normalTexture must be PNG, got ${img.uri}`);
      }
      if (img.mimeType && img.mimeType !== "image/png") {
        throw new Error(`[build] ${outStem}: normal mimeType must be image/png`);
      }
    }
  }

  // 语义文件名存在性（有 baseColor 槽时）
  if (hasBaseColor) {
    const colorOk = images.some((img) =>
      new RegExp(`^${outStem}_(baseColor|bark|moss|top)`).test(img.uri),
    );
    if (!colorOk) {
      throw new Error(`[build] ${outStem}: expected semantic baseColor uri, images=${images.map((i) => i.uri)}`);
    }
  }

  // 若 material 无法线槽，跳过；有则必须有 *_normal.png
  const needsNormal = [...roles.values()].some((s) => s.has("normal"));
  if (needsNormal) {
    const normalOk = images.some((img) => new RegExp(`^${outStem}_normal`).test(img.uri) && /\.png$/i.test(img.uri));
    if (!normalOk) {
      throw new Error(`[build] ${outStem}: expected ${outStem}_normal.png`);
    }
  }

  // 禁止残留量化：真机 UV 依赖 float TEXCOORD
  const extUsed = gltf.extensionsUsed || [];
  const extReq = gltf.extensionsRequired || [];
  if (extUsed.includes("KHR_mesh_quantization") || extReq.includes("KHR_mesh_quantization")) {
    throw new Error(`[build] ${outStem}.gltf still requires KHR_mesh_quantization — dequantize failed`);
  }
  for (const acc of gltf.accessors || []) {
    // TEXCOORD / POSITION / NORMAL 必须是 float（5126），不能再是 normalized int
    if (acc.normalized) {
      throw new Error(
        `[build] ${outStem}.gltf accessor still normalized (comp=${acc.componentType} type=${acc.type})`,
      );
    }
    if (acc.type === "VEC2" && acc.componentType !== 5126) {
      throw new Error(`[build] ${outStem}.gltf TEXCOORD must be float32, got componentType=${acc.componentType}`);
    }
  }
  const CLAMP = 33071; // GL_CLAMP_TO_EDGE
  for (const s of gltf.samplers || []) {
    if (s.wrapS !== CLAMP || s.wrapT !== CLAMP) {
      throw new Error(`[build] ${outStem}.gltf sampler must be ClampToEdge(33071), got wrapS=${s.wrapS} wrapT=${s.wrapT}`);
    }
  }

  console.log(`[build] validate ${outStem}.gltf: ok (dequantized + clamp)`);
}

function isNormalMapName(name) {
  return /_n(?:ormal)?(?:_|\.|$)/i.test(name) || /normal/i.test(name);
}

/**
 * 色图 JPEG 缩/压；法线 PNG 只缩尺寸、保持 PNG（美术 set1–3 法线勿转 JPEG）。
 * @param {string} destDir
 * @param {{ skipStemPrefixes?: RegExp }} [opts]
 */
async function resizeStandaloneTextures(destDir, opts = {}) {
  const skipStem = opts.skipStemPrefixes || /^(stump|axe)_/;
  const files = readdirSync(destDir).filter((n) => /\.(jpe?g|png)$/i.test(n));
  for (const name of files) {
    if (skipStem.test(name)) continue;
    const abs = join(destDir, name);
    const isPng = /\.png$/i.test(name);
    const isNormal = isNormalMapName(name);
    // 非法线 PNG（如 axe_orm）可缩；色图应为 JPEG
    if (isPng && !isNormal && !/orm|occlusion|roughness|metal/i.test(name)) {
      // 普通 PNG 色图不在此强转；只处理法线/ORM
    }
    const max = isNormal || /orm/i.test(name) ? NORMAL_MAX : COLOR_MAX;
    const meta = await sharp(abs).metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;

    if (isNormal && !isPng) {
      console.warn(
        `[build] WARN normal map should be PNG for art sets: ${name} (kept as-is for set0 legacy jpg)`,
      );
    }

    if (w <= max && h <= max) {
      if (!isNormal && !isPng) {
        const before = statSync(abs).size;
        await sharp(abs)
          .jpeg({ quality: COLOR_JPEG_QUALITY, mozjpeg: true })
          .toFile(abs + ".tmp");
        renameSync(abs + ".tmp", abs);
        if (statSync(abs).size !== before) {
          console.log(`[build] recompress ${name} q=${COLOR_JPEG_QUALITY}`);
        }
      }
      continue;
    }

    const scale = Math.min(max / w, max / h, 1);
    const nw = Math.max(1, Math.round(w * scale));
    const nh = Math.max(1, Math.round(h * scale));
    const before = statSync(abs).size;
    const pipeline = sharp(abs).resize(nw, nh, { fit: "inside", withoutEnlargement: true });
    // 按扩展名落盘：PNG 法线保持 PNG；set0 历史 JPG 法线仍写 JPEG，勿把内容写成 PNG 塞进 .jpg
    if (isPng) {
      await pipeline.png({ compressionLevel: 9 }).toFile(abs + ".tmp");
    } else {
      await pipeline.jpeg({ quality: COLOR_JPEG_QUALITY, mozjpeg: true }).toFile(abs + ".tmp");
    }
    renameSync(abs + ".tmp", abs);
    console.log(
      `[build] resize ${name} ${w}x${h} → ${nw}x${nh} (${formatMb(before)} → ${formatMb(statSync(abs).size)})`,
    );
  }
}

/** 校验 art-set manifest：法线路径必须是 .png（set0 除外） */
function assertArtSetNormalPng(destDir, setId) {
  const manPath = join(destDir, "manifest.json");
  if (!existsSync(manPath)) return;
  const man = JSON.parse(readFileSync(manPath, "utf8"));
  if (man.fallback) return; // stub
  const files = man.files || {};
  for (const key of ["barkNormal", "endNormal", "innerNormal"]) {
    const rel = files[key];
    if (!rel) continue;
    if (!/\.png$/i.test(rel)) {
      throw new Error(
        `[build] ${setId} manifest.${key} must be .png (got ${rel}); art delivers PNG normals only`,
      );
    }
    if (!existsSync(join(destDir, rel))) {
      throw new Error(`[build] ${setId} missing normal file ${rel}`);
    }
  }
}

function decompressAllKtx2(destAssets) {
  // 斧头已换成美术木柄占位（public/assets/axe.*），不再从 Fiskars KTX2 GLB 导出
  const targets = ["stump_v02_mesh_warm_ktx2_2048.glb"];
  for (const file of targets) {
    decompressKtx2Glb(join(destAssets, file), { quality: COLOR_JPEG_QUALITY });
  }
}

/**
 * 远景树桩 LOD：hero stump.gltf 保持全精度；另写 stump_lod.gltf（同贴图 URI）。
 * 画像：stump×2 ≈ 场景 87% tris；只砍远的那份。
 */
async function buildStumpFarLod(destAssets) {
  const src = join(destAssets, "stump.gltf");
  if (!existsSync(src)) {
    console.warn("[build] skip stump_lod — missing stump.gltf");
    return;
  }
  const tmpDir = join(destAssets, ".tmp_stump_lod");
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(src);
  await doc.transform(
    dedup(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.08, error: 0.01 }),
  );

  const tmpGltf = join(tmpDir, "stump_lod.gltf");
  await io.write(tmpGltf, doc);

  const json = JSON.parse(readFileSync(tmpGltf, "utf8"));
  // 贴图指回 dest 里的 hero 同款（不降分辨率、不复制）
  for (const img of json.images || []) {
    if (!img.uri) continue;
    const base = basename(img.uri);
    if (/normal/i.test(base) || img.mimeType === "image/png") img.uri = "stump_normal.png";
    else img.uri = "stump_baseColor.jpg";
  }
  for (const buf of json.buffers || []) {
    if (buf.uri) buf.uri = "stump_lod.bin";
  }
  writeFileSync(tmpGltf, `${JSON.stringify(json, null, 2)}\n`);

  // 把 tmp 里的 bin 挪成 stump_lod.bin
  const tmpBin =
    readdirSync(tmpDir).find((n) => n.endsWith(".bin")) || "stump_lod.bin";
  const fromBin = join(tmpDir, tmpBin);
  const outGltf = join(destAssets, "stump_lod.gltf");
  const outBin = join(destAssets, "stump_lod.bin");
  rmSync(outGltf, { force: true });
  rmSync(outBin, { force: true });
  if (!existsSync(fromBin)) throw new Error("[build] stump_lod bin missing in tmp");
  renameSync(fromBin, outBin);
  renameSync(tmpGltf, outGltf);
  rmSync(tmpDir, { recursive: true, force: true });

  // hero stump.bin 必须仍在
  if (!existsSync(join(destAssets, "stump.bin"))) {
    throw new Error("[build] hero stump.bin missing after LOD export");
  }

  let verts = 0;
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const v = prim.getAttribute("POSITION")?.getCount() || 0;
      const idx = prim.getIndices();
      verts += v;
      tris += idx ? idx.getCount() / 3 : v / 3;
    }
  }
  console.log(
    `[build] stump_lod (far only): verts=${verts} tris=${Math.round(tris)} — hero stump untouched`,
  );
}

/** 小游戏包禁止带上旧 Fiskars 嵌图 GLB；斧头走 public 里的外置 gltf+jpg */
function assertMinigameAxePlaceholder(destAssets) {
  const need = ["axe.gltf", "axe.bin", "axe_baseColor.jpg", "axe_orm.png"];
  for (const f of need) {
    if (!existsSync(join(destAssets, f))) {
      throw new Error(`[build] missing wood-handle axe placeholder: ${f}`);
    }
  }
  const banned = ["ax_v01_reduced_compressed.glb", "ax_v01_reduced_compressed.glb.raw.glb"];
  for (const f of banned) {
    if (existsSync(join(destAssets, f))) {
      throw new Error(`[build] Fiskars GLB still in minigame package: ${f}`);
    }
  }
  // 占位材质应引用 orm，且无品牌 atlas 以外的嵌图
  const gltf = JSON.parse(readFileSync(join(destAssets, "axe.gltf"), "utf8"));
  const uris = (gltf.images || []).map((i) => i.uri).filter(Boolean);
  if (!uris.includes("axe_baseColor.jpg") || !uris.includes("axe_orm.png")) {
    throw new Error(`[build] axe.gltf images unexpected: ${uris.join(",")}`);
  }
  console.log("[build] wood-handle axe placeholder: ok");
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

  // Web 仍用旧 GLB；小游戏包去掉 Fiskars 嵌图，改用美术木柄占位 axe.*
  rmSync(join(destAssets, "ax_v01_reduced_compressed.glb"), { force: true });

  decompressAllKtx2(destAssets);
  await exportExternalGltf(destAssets, "stump_v02_mesh_warm_ktx2_2048.glb", "stump");
  await buildStumpFarLod(destAssets);
  await resizeStandaloneTextures(destAssets);
  assertMinigameAxePlaceholder(destAssets);

  // set0 manifest 放进主素材分包，供运行时 ArtSetController 读取
  const set0ManifestSrc = join(ROOT, "art-sets/set0/manifest.json");
  if (existsSync(set0ManifestSrc)) {
    cpSync(set0ManifestSrc, join(destAssets, "manifest.json"));
  }

  const subEntry = join(SUB_ASSETS, "game.js");
  if (!existsSync(subEntry)) {
    writeFileSync(subEntry, 'console.log("[firewood] assets subpackage ready");\n');
  }

  await packArtSetSubpackages();
}

/**
 * set1–set3：各自分包。未交付前仅拷 manifest（fallback:set0），体积可忽略。
 * 美术交付后把完整文件放进 art-sets/setN/ 即可；法线 PNG 会缩到 ≤512 且保持 PNG。
 */
async function packArtSetSubpackages() {
  const gameJsonPath = join(MG, "game.json");
  const gameJson = JSON.parse(readFileSync(gameJsonPath, "utf8"));
  const subs = [
    { name: "assets", root: "subpackages/assets/" },
    { name: "art-set1", root: "subpackages/art-set1/" },
    { name: "art-set2", root: "subpackages/art-set2/" },
    { name: "art-set3", root: "subpackages/art-set3/" },
  ];
  gameJson.subpackages = subs;
  writeFileSync(gameJsonPath, `${JSON.stringify(gameJson, null, 2)}\n`);

  for (const id of ["set1", "set2", "set3"]) {
    const srcDir = join(ROOT, "art-sets", id);
    const dest = join(MG, "subpackages", `art-${id}`);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    writeFileSync(
      join(dest, "game.js"),
      `console.log("[firewood] art ${id} subpackage ready");\n`,
    );
    if (!existsSync(srcDir)) {
      writeFileSync(
        join(dest, "manifest.json"),
        `${JSON.stringify({ id, label: id, version: 1, fallback: "set0", files: {} }, null, 2)}\n`,
      );
      console.log(`[build] art-${id}: stub manifest (fallback set0)`);
      continue;
    }
    for (const name of readdirSync(srcDir)) {
      if (name.startsWith(".")) continue;
      cpSync(join(srcDir, name), join(dest, name), { recursive: true });
    }
    if (!existsSync(join(dest, "manifest.json"))) {
      throw new Error(`[build] art-${id} missing manifest.json`);
    }
    assertArtSetNormalPng(dest, id);
    // 不跳过 stump_/axe_：套装根目录文件都要过一遍尺寸闸
    await resizeStandaloneTextures(dest, { skipStemPrefixes: /^$/ });
    console.log(`[build] art-${id}: packed from art-sets/${id}`);
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

/** 构建后廉价 MAD：web KTX2 vs 外置 JPG，抓住 decode Y-flip 回归 */
function verifyTextureMad() {
  if (process.env.SKIP_TEXTURE_MAD === "1") {
    console.log("[build] SKIP_TEXTURE_MAD=1 — skip mad check");
    return;
  }
  console.log("[build] verify texture MAD (web KTX2 vs minigame JPG)…");
  const r = spawnSync(process.execPath, [join(MG, "scripts/verify-texture-mad.mjs")], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error("verify-texture-mad.mjs failed — axe/stump JPG orientation likely wrong");
  }
}

emitRuntimeAppConfig();
await bundle();
await copyAssets();
verifyTextureMad();
syncProjectConfig();
assertNoCjsRequireInPackage();
reportSizes();
console.log("\nminigame build ok →", MG);
