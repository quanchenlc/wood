#!/usr/bin/env node
/**
 * CI: fail if any shipped asset SHA-256 matches recorded screen.toys hashes.
 * Hashes were captured before 0.4.0 deletion — see scripts/ip-forbidden-hashes.json.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL("..", import.meta.url)));
const HASH_FILE = join(ROOT, "scripts/ip-forbidden-hashes.json");

const SCAN_ROOTS = [
  "public",
  "minigame/subpackages",
  "minigame/js",
  "dist",
  "art-sets",
];

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

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name === "node_modules" || name.name === ".git") continue;
    const p = join(dir, name.name);
    if (name.isDirectory()) walk(p, acc);
    else {
      const ext = name.name.slice(name.name.lastIndexOf(".")).toLowerCase();
      if (EXTS.has(ext)) acc.push(p);
    }
  }
  return acc;
}

const data = JSON.parse(readFileSync(HASH_FILE, "utf8"));
const forbidden = new Set(data.forbidden_sha256 || []);
if (forbidden.size === 0) {
  console.error("[ip-check] empty forbidden set");
  process.exit(2);
}

const hits = [];
for (const root of SCAN_ROOTS) {
  for (const file of walk(join(ROOT, root))) {
    // axe.* is ours — still check hash (should not match forbidden)
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
  `[ip-check] OK — scanned under ${SCAN_ROOTS.join(", ")}; none of ${forbidden.size} forbidden hashes found`,
);
