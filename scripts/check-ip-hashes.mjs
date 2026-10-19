#!/usr/bin/env node
/**
 * CI: fail if any shipped asset SHA-256 matches recorded screen.toys hashes,
 * or if ax_anim_v03 baked keyframe float sequences reappear in source/bundle.
 * Hashes: scripts/ip-forbidden-hashes.json (recorded before 0.4.0 deletion).
 * Keyframes: scripts/ip-forbidden-keyframes.json (from 35050ca bake — must not ship).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL("..", import.meta.url)));
const HASH_FILE = join(ROOT, "scripts/ip-forbidden-hashes.json");
const KEYFRAME_FILE = join(ROOT, "scripts/ip-forbidden-keyframes.json");

const SCAN_ROOTS = [
  "public",
  "minigame/subpackages",
  "minigame/js",
  "dist",
  "art-sets",
];

/** Text / bundle roots where ax_anim float literals must not reappear. */
const KEYFRAME_SCAN_ROOTS = ["src", "minigame/js", "dist"];

const EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".glb",
  ".gltf",
  ".bin",
  ".mp3",
  ".ktx2",
  ".wasm",
]);

const TEXT_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".map",
  ".glsl",
  ".vert",
  ".frag",
]);

function walk(dir, acc = [], exts = null) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name === "node_modules" || name.name === ".git") continue;
    const p = join(dir, name.name);
    if (name.isDirectory()) walk(p, acc, exts);
    else {
      const ext = name.name.slice(name.name.lastIndexOf(".")).toLowerCase();
      if (!exts || exts.has(ext)) acc.push(p);
    }
  }
  return acc;
}

function checkHashes() {
  const data = JSON.parse(readFileSync(HASH_FILE, "utf8"));
  const forbidden = new Set(data.forbidden_sha256 || []);
  if (forbidden.size === 0) {
    console.error("[ip-check] empty forbidden set");
    process.exit(2);
  }

  const hits = [];
  for (const root of SCAN_ROOTS) {
    for (const file of walk(join(ROOT, root), [], EXTS)) {
      const buf = readFileSync(file);
      const h = createHash("sha256").update(buf).digest("hex");
      if (forbidden.has(h)) {
        hits.push({ file: relative(ROOT, file), sha256: h, bytes: buf.length });
      }
    }
  }

  if (hits.length) {
    console.error("[ip-check] FAIL — shipped files match screen.toys hashes:");
    for (const h of hits) console.error(" ", h.file, h.sha256.slice(0, 16), h.bytes);
    process.exit(1);
  }

  console.log(
    `[ip-check] OK hashes — scanned under ${SCAN_ROOTS.join(", ")}; none of ${forbidden.size} forbidden hashes found`,
  );
}

/**
 * Pull ordered JS/JSON number literals from text (decimals / scientific).
 * Skips the fingerprint JSON path itself by never scanning scripts/.
 */
function extractFloats(text) {
  const re = /[-+]?(?:\d+\.\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const v = Number(m[0]);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

function windowsMatch(hay, needle, tol) {
  if (needle.length < 8 || hay.length < needle.length) return -1;
  const n = needle.length;
  outer: for (let i = 0; i <= hay.length - n; i++) {
    for (let j = 0; j < n; j++) {
      if (Math.abs(hay[i + j] - needle[j]) > tol) continue outer;
    }
    return i;
  }
  return -1;
}

function checkKeyframes() {
  if (!existsSync(KEYFRAME_FILE)) {
    console.error("[ip-check] missing", relative(ROOT, KEYFRAME_FILE));
    process.exit(2);
  }
  const data = JSON.parse(readFileSync(KEYFRAME_FILE, "utf8"));
  const tol = Number(data.tolerance ?? 1e-4);
  const win = Number(data.window ?? 8);
  const sequences = data.sequences || [];
  if (!sequences.length) {
    console.error("[ip-check] empty keyframe sequences");
    process.exit(2);
  }

  /** Every contiguous window of `win` floats from each forbidden sequence. */
  const needles = [];
  for (const seq of sequences) {
    const vals = seq.values || [];
    if (vals.length < win) continue;
    for (let i = 0; i <= vals.length - win; i++) {
      needles.push({
        name: seq.name,
        offset: i,
        values: vals.slice(i, i + win),
      });
    }
  }

  const hits = [];
  for (const root of KEYFRAME_SCAN_ROOTS) {
    for (const file of walk(join(ROOT, root), [], TEXT_EXTS)) {
      const text = readFileSync(file, "utf8");
      const floats = extractFloats(text);
      if (floats.length < win) continue;
      for (const needle of needles) {
        const at = windowsMatch(floats, needle.values, tol);
        if (at >= 0) {
          hits.push({
            file: relative(ROOT, file),
            sequence: needle.name,
            windowOffset: needle.offset,
            floatIndex: at,
            sample: needle.values.slice(0, 4).map((v) => +v.toPrecision(8)),
          });
          break; // one hit per file is enough
        }
      }
    }
  }

  if (hits.length) {
    console.error(
      "[ip-check] FAIL — ax_anim_v03 keyframe floats (≥8 consecutive, tol=" +
        tol +
        ") found in source/bundle:",
    );
    for (const h of hits) {
      console.error(
        " ",
        h.file,
        h.sequence,
        "win@" + h.windowOffset,
        "floats@" + h.floatIndex,
        h.sample,
      );
    }
    process.exit(1);
  }

  console.log(
    `[ip-check] OK keyframes — scanned ${KEYFRAME_SCAN_ROOTS.join(", ")}; ${needles.length} windows × ${sequences.length} sequences, none matched`,
  );
}

checkHashes();
checkKeyframes();
