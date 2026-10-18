/**
 * 四套美术端到端：load → switch → idle 截图 → 劈一刀 → perf(tris/drawcalls)。
 * 交互劈砍走 wx.__simulateTouch；切套走 __fw.art().switchTo。
 */
import { createServer } from "node:http";
import {
  readFileSync,
  existsSync,
  statSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { assertNoCjsRequireInUploadPackage } from "./assert-no-cjs-require.mjs";

const MG = join(fileURLToPath(new URL("..", import.meta.url)));
const ROOT = MG;
assertNoCjsRequireInUploadPackage();

const ARTIFACTS = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const PORT = Number(process.env.HARNESS_PORT || 5191);
const CHROME =
  process.env.CHROME_PATH ||
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"].find(
    (p) => existsSync(p),
  );

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".wasm": "application/wasm",
  ".mp3": "audio/mpeg",
  ".map": "application/json",
  ".ktx2": "application/octet-stream",
  ".ico": "image/x-icon",
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") pathname = "/harness/index.html";
      if (pathname === "/favicon.ico") {
        res.writeHead(204);
        res.end();
        return;
      }
      const file = normalize(join(ROOT, pathname.replace(/^\//, "")));
      if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
        console.warn("[harness-404]", pathname);
        res.writeHead(404);
        res.end("not found " + pathname);
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(readFileSync(file));
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const outDir = join(ARTIFACTS, "art-sets-0.2.0");
mkdirSync(outDir, { recursive: true });

const server = await startServer();
console.log("[artsets] harness on", PORT);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--window-size=375,812",
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2 });

const logs = [];
const notFound = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("response", (r) => {
  if (r.status() === 404) {
    notFound.push(r.url());
    logs.push(`[404] ${r.url()}`);
  }
});

await page.goto(`http://127.0.0.1:${PORT}/harness/index.html`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});

await page.waitForFunction(() => window.__fw?.state()?.game === "IDLE", {
  timeout: 180000,
  polling: 400,
});
await sleep(800);

async function waitIdle(timeout = 90000) {
  return page
    .waitForFunction(
      () => {
        const st = window.__fw?.state?.();
        if (!st || st.game !== "IDLE") return false;
        const d = st.diagnostics;
        if (d && (d.pendingSplit || d.firewoodFlying > 0 || d.state === "SETTLING")) return false;
        if (st.axe && st.axe !== "idle") return false;
        return true;
      },
      { timeout, polling: 400 },
    )
    .then(() => true)
    .catch(() => false);
}

async function fireTouch(x, y) {
  await page.evaluate(
    ({ x, y }) => {
      wx.__simulateTouch("start", x, y);
      wx.__simulateTouch("end", x, y);
    },
    { x, y },
  );
}

async function touchChop() {
  const candidates = [
    [188, 405],
    [188, 420],
    [170, 410],
    [206, 410],
    [188, 380],
  ];
  for (const [x, y] of candidates) {
    await waitIdle(60000);
    const playBefore = await page.evaluate(() => window.__fw?.state?.()?.axePlayCount ?? 0);
    await fireTouch(x, y);
    const hit = await page
      .waitForFunction(
        (prev) => {
          const st = window.__fw?.state?.();
          if (!st) return false;
          if (typeof st.axePlayCount === "number" && st.axePlayCount > prev) return true;
          if (st.game && st.game !== "IDLE" && st.game !== "BOOTING") return true;
          return false;
        },
        { timeout: 2500, polling: 80 },
        playBefore,
      )
      .then(() => true)
      .catch(() => false);
    if (hit) return;
    await sleep(400);
  }
  throw new Error("touchChop failed");
}

async function switchSet(id) {
  await waitIdle(60000);
  await page.evaluate(async (setId) => {
    await window.__fw.art().switchTo(setId);
  }, id);
  await page.waitForFunction(
    (setId) => {
      const art = window.__fw?.art?.();
      if (!art || art.active !== setId) return false;
      const st = window.__fw?.state?.();
      return st && st.game === "IDLE";
    },
    { timeout: 120000, polling: 400 },
    id,
  );
  await sleep(900);
}

const sets = ["set0", "set1", "set2", "set3"];
const report = { sets: {}, notFound: [], logsTail: [] };

for (const id of sets) {
  console.log("[artsets] switch", id);
  if (id !== "set0") {
    await switchSet(id);
  } else {
    // ensure set0
    const active = await page.evaluate(() => window.__fw?.art?.()?.active);
    if (active && active !== "set0") await switchSet("set0");
    await sleep(600);
  }

  const idlePath = join(outDir, `${id}-idle.png`);
  await page.screenshot({ path: idlePath, type: "png" });
  console.log("[artsets] shot", idlePath);

  const perfBefore = await page.evaluate(() => window.__fw?.perf?.() ?? null);

  await touchChop();
  await sleep(1800);
  await waitIdle(90000);

  const chopPath = join(outDir, `${id}-after-chop.png`);
  await page.screenshot({ path: chopPath, type: "png" });

  const perfAfter = await page.evaluate(() => window.__fw?.perf?.() ?? null);
  const art = await page.evaluate(() => window.__fw?.art?.() ?? null);
  const state = await page.evaluate(() => window.__fw?.state?.() ?? null);

  report.sets[id] = {
    label: art?.labels?.find?.((l) => l.id === id)?.label || id,
    active: art?.active,
    idleShot: idlePath,
    chopShot: chopPath,
    perf: perfAfter || perfBefore,
    state,
  };
  console.log(
    "[artsets]",
    id,
    "tris",
    perfAfter?.summary?.tris,
    "calls",
    perfAfter?.renderer?.render?.calls,
  );
}

const real404 = [...new Set(notFound.filter((u) => !/\/favicon\.ico(\?|$)/i.test(u)))];
report.notFound = real404;
report.logsTail = logs.slice(-200);
writeFileSync(join(outDir, "artsets-report.json"), JSON.stringify(report, null, 2));
writeFileSync(join(outDir, "console.log"), logs.join("\n"));

if (real404.length) {
  console.error("ERROR: unexpected 404s:", real404);
  process.exitCode = 1;
}

const verLog = logs.find((l) => /\[firewood\].*0\.2\.0/.test(l));
if (!verLog) {
  console.error("ERROR: missing 0.2.0 version log");
  process.exitCode = 1;
} else {
  console.log("version log:", verLog);
}

await browser.close();
server.close();
console.log("[artsets] done →", outDir);
