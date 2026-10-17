/**
 * 上传包审计：运行时 .js 里若仍有 require('*.cjs')，微信会黑屏。
 * 被 capture / 手动 node 调用；失败 process.exit(1)。
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const MG = join(fileURLToPath(new URL("..", import.meta.url)));
const SKIP_TOP = new Set(["harness", "scripts", "src", "node_modules"]);
const CJS_REQUIRE = /require\s*\(\s*['"][^'"]*\.cjs['"]\s*\)/;

function walkJs(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name.startsWith(".")) continue;
    const p = join(dir, name.name);
    const rel = relative(MG, p).replace(/\\/g, "/");
    const top = rel.split("/")[0];
    if (SKIP_TOP.has(top)) continue;
    if (name.isDirectory()) {
      walkJs(p, acc);
      continue;
    }
    if (!name.name.endsWith(".js")) continue;
    if (!statSync(p).isFile()) continue;
    acc.push({ path: p, rel });
  }
  return acc;
}

export function assertNoCjsRequireInUploadPackage() {
  const hits = [];
  for (const { path, rel } of walkJs(MG)) {
    const text = readFileSync(path, "utf8");
    if (CJS_REQUIRE.test(text)) hits.push(rel);
  }
  if (hits.length) {
    const msg =
      `FAIL: upload package contains require('*.cjs') (WeChat black-screen):\n` +
      hits.map((h) => `  - ${h}`).join("\n");
    const err = new Error(msg);
    err.hits = hits;
    throw err;
  }
  return { ok: true, scannedRoot: MG };
}

import { resolve } from "node:path";

const invoked =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invoked) {
  try {
    const r = assertNoCjsRequireInUploadPackage();
    console.log("[assert-no-cjs-require]", r);
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }
}
