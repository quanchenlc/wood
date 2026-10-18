/**
 * 在 headless Chromium 里跑真正的 minigame/game.js（经 wx shim），
 * 产出加载/劈砍/码垛截图 + 短录屏。
 * 交互只走 wx.__simulateTouch，禁止 __fw.click() 兜底。
 */
import { createServer } from "node:http";
import {
  readFileSync,
  existsSync,
  statSync,
  mkdirSync,
  writeFileSync,
  cpSync,
  rmSync,
} from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
import { assertNoCjsRequireInUploadPackage } from "./assert-no-cjs-require.mjs";

const MG = join(fileURLToPath(new URL("..", import.meta.url)));
const ROOT = MG;

// 上传包若仍 require('*.cjs') 直接失败（真机黑屏）
assertNoCjsRequireInUploadPackage();
console.log("[capture] assertNoCjsRequireInUploadPackage: ok");
const ARTIFACTS = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const PORT = Number(process.env.HARNESS_PORT || 5188);
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
      // 浏览器会自动要 favicon，给 204 避免控制台 404
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

const outDir = join(ARTIFACTS, "minigame");
mkdirSync(outDir, { recursive: true });
const framesDir = join(outDir, "frames");
rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const server = await startServer();
console.log("harness on", PORT, "chrome", CHROME);

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
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}\n${e.stack || ""}`));
page.on("requestfailed", (r) =>
  logs.push(`[failed] ${r.url()} ${r.failure()?.errorText ?? ""}`),
);
page.on("response", (r) => {
  if (r.status() === 404) {
    notFound.push(r.url());
    logs.push(`[404] ${r.url()}`);
  }
});

const url = `http://127.0.0.1:${PORT}/harness/index.html`;
// 尽早截 loading（不等 networkidle，避免错过 canvas 进度条）
const nav = page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(600);
const shotLoading = join(outDir, "01-loading-canvas.png");
await page.screenshot({ path: shotLoading, type: "png" });
console.log("shot-loading", shotLoading);
await nav;
await sleep(400);
const shot1 = join(outDir, "01-loading-or-start.png");
await page.screenshot({ path: shot1, type: "png" });
console.log("shot1", shot1);

await page.waitForFunction(() => window.__fw?.state()?.game === "IDLE", {
  timeout: 180000,
  polling: 400,
});
await sleep(1500);
const shotStart = join(outDir, "02-start-idle.png");
await page.screenshot({ path: shotStart, type: "png" });
console.log("shot2", shotStart, await page.evaluate(() => window.__fw.state()));

// 近景一张：方便看清树桩木纹
await page.evaluate(() => {
  // 若有调试相机钩子则拉近；没有则保持默认
  try {
    const st = window.__fw?.state?.();
    return st;
  } catch {
    return null;
  }
});
const shotWood = join(outDir, "02b-stump-wood-grain.png");
await page.screenshot({ path: shotWood, type: "png" });
console.log("shot-wood", shotWood);

const STEP = Number(process.env.SHOT_STEP_WAIT || 6) * 1000;
let frameIdx = 0;
const framePaths = [];

async function grab(label) {
  const p = join(framesDir, `f${String(frameIdx).padStart(4, "0")}.png`);
  await page.screenshot({ path: p, type: "png" });
  framePaths.push(p);
  frameIdx++;
  const st = await page.evaluate(() => window.__fw?.state?.() ?? null);
  console.log("frame", label, st);
  return st;
}

async function waitIdle(timeout = 120000) {
  return page
    .waitForFunction(() => {
      const st = window.__fw?.state?.();
      if (!st || st.game !== "IDLE") return false;
      // SETTLING/飞柴期间点会被吞掉且不转视角，必须等干净
      const d = st.diagnostics;
      if (d && (d.pendingSplit || d.firewoodFlying > 0 || d.state === "SETTLING")) return false;
      if (st.axe && st.axe !== "idle") return false;
      return true;
    }, {
      timeout,
      polling: 400,
    })
    .then(() => true)
    .catch(() => false);
}

async function fireTouch(x, y) {
  await page.evaluate(
    ({ x, y }) => {
      if (!wx || typeof wx.__simulateTouch !== "function") {
        throw new Error("wx.__simulateTouch unavailable");
      }
      wx.__simulateTouch("start", x, y);
      wx.__simulateTouch("end", x, y);
    },
    { x, y },
  );
}

/**
 * 只通过 wx 触摸通道劈砍（绝不调用 __fw.click）。
 * 未命中 / 点空地 / 无视角变化：换下一个点重试；全部失败才报错。
 */
async function touchChop(preferredX, preferredY) {
  const candidates = [
    [preferredX, preferredY],
    [188, 400],
    [188, 430],
    [170, 410],
    [206, 410],
    [188, 380],
    [160, 400],
    [210, 400],
    [188, 450],
  ];

  let lastBefore = null;
  let lastAfter = null;

  for (const [x, y] of candidates) {
    await waitIdle(60000);
    const before = await page.evaluate(() => window.__fw?.state?.() ?? null);
    lastBefore = before;
    const playBefore = before?.axePlayCount ?? 0;

    await fireTouch(x, y);

    const hit = await page
      .waitForFunction(
        (prevPlay) => {
          const st = window.__fw?.state?.();
          if (!st) return false;
          if (typeof st.axePlayCount === "number" && st.axePlayCount > prevPlay) return true;
          if (st.game && st.game !== "IDLE" && st.game !== "BOOTING") return true;
          return false;
        },
        { timeout: 2500, polling: 80 },
        playBefore,
      )
      .then(() => true)
      .catch(() => false);

    if (hit) {
      console.log("touchChop hit", x, y);
      return;
    }

    lastAfter = await page.evaluate(() => window.__fw?.state?.() ?? null);
    const nudged =
      lastAfter &&
      (lastAfter.cameraTargetAzimuth != null ||
        lastAfter.cameraAzimuth !== before?.cameraAzimuth ||
        lastAfter.axe !== before?.axe);
    if (nudged) {
      console.log("touchChop miss (camera nudged), retry", x, y);
      await sleep(800);
    } else {
      // 点到空地：可能既不劈也不转视角，换点继续，勿立刻 exit 1
      console.log("touchChop no visible change, retry next point", x, y);
      await sleep(400);
    }
  }

  throw new Error(
    `wx touch chop failed all aim points; before=${JSON.stringify(lastBefore)} after=${JSON.stringify(lastAfter)}`,
  );
}

await grab("pre");

for (let i = 0; i < 5; i++) {
  await waitIdle();
  const offsets = [0, -20, 20, -36, 36];
  const x = 188 + offsets[i % offsets.length];
  const y = 405 + (i % 3) * 12;
  await touchChop(x, y);
  await sleep(Math.min(STEP, 2500));
  await grab(`chop-${i}`);
  await sleep(STEP);
}

const mid = join(outDir, "03-mid-chop.png");
cpSync(framePaths[Math.min(3, framePaths.length - 1)], mid);
console.log("shot3", mid);

for (let i = 0; i < 8; i++) {
  const st = await page.evaluate(() => window.__fw?.state?.() ?? null);
  if (st && st.stacked > 0) break;
  await waitIdle(90000);
  await touchChop(188, 410);
  await sleep(STEP);
  await grab(`auto-${i}`);
}

await sleep(2500);
const shot3 = join(outDir, "04-after-split-stack.png");
await page.screenshot({ path: shot3, type: "png" });
await grab("final");

const state = await page.evaluate(() => window.__fw?.state?.() ?? null);
const forbiddenUi = await page.evaluate(() => window.__HARNESS_FORBIDDEN_UI__ || []);

// 过滤掉已处理的 favicon；其余 404 视为失败
const real404 = [...new Set(notFound.filter((u) => !/\/favicon\.ico(\?|$)/i.test(u)))];
if (real404.length) {
  console.error("ERROR: unexpected 404s:", real404);
}

writeFileSync(
  join(outDir, "capture-state.json"),
  JSON.stringify(
    {
      state,
      logs: logs.slice(-160),
      notFound: real404,
      forbiddenUi,
      method: "chromium-wx-shim-harness-touch-only",
    },
    null,
    2,
  ),
);
writeFileSync(join(outDir, "console.log"), logs.join("\n"));

const mp4 = join(outDir, "gameplay.mp4");
await new Promise((resolve, reject) => {
  const args = [
    "-y",
    "-framerate",
    "0.7",
    "-i",
    join(framesDir, "f%04d.png"),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-crf",
    "28",
    mp4,
  ];
  const ff = spawn("ffmpeg", args, { stdio: "inherit" });
  ff.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg " + code))));
});

const mp4Size = statSync(mp4).size;
console.log("mp4", mp4, `${(mp4Size / (1024 * 1024)).toFixed(2)} MB`);
console.log("final state", state);
console.log("artifacts", outDir);

await browser.close();
server.close();

const audioFails = logs.filter((l) => l.includes("音效加载失败"));
if (audioFails.length) {
  console.error("ERROR: audio load failures:", audioFails.length);
  console.error(audioFails.slice(0, 8).join("\n"));
}

const abortFails = logs.filter((l) => /AbortController/i.test(l));
if (abortFails.length) {
  console.error("ERROR: AbortController errors (polyfill missing?):", abortFails.length);
  console.error(abortFails.slice(0, 8).join("\n"));
}

const bootFails = logs.filter(
  (l) =>
    l.includes("boot failed") ||
    l.includes("fallback boot failed") ||
    l.includes("启动失败"),
);
if (bootFails.length) {
  console.error("ERROR: boot failed logs:", bootFails.length);
  console.error(bootFails.slice(0, 8).join("\n"));
}

const audioParamFails = logs.filter((l) =>
  /AudioParam\.(setValueAtTime|linearRamp)|Property 'value' or 'endTime' invalid/i.test(l),
);
if (audioParamFails.length) {
  console.error("ERROR: AudioParam ramp errors (harden missing?):", audioParamFails.length);
  console.error(audioParamFails.slice(0, 8).join("\n"));
}

const verLog = logs.find((l) => /\[firewood\].*0\.1\.9/.test(l));
if (!verLog) {
  console.error("ERROR: missing 0.1.9 version log in console");
} else {
  console.log("version log:", verLog);
}

// 视觉回归：截 stump 区域，底座平均色若仍过暗/过绿则 warning（不硬失败，避免光照抖动）
try {
  const stumpShot = join(outDir, "02-start-idle.png");
  if (existsSync(stumpShot)) {
    const { default: sharp } = await import("sharp");
    // 中下部树桩底座区域（竖屏 375x812 @2x → 750x1624 图；取中央偏下一块）
    const meta = await sharp(stumpShot).metadata();
    const W = meta.width || 750;
    const H = meta.height || 1624;
    const crop = {
      left: Math.floor(W * 0.28),
      top: Math.floor(H * 0.48),
      width: Math.floor(W * 0.44),
      height: Math.floor(H * 0.22),
    };
    const { data, info } = await sharp(stumpShot)
      .extract(crop)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let r = 0,
      g = 0,
      b = 0,
      n = info.width * info.height;
    for (let i = 0; i < data.length; i += 3) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    r /= n;
    g /= n;
    b /= n;
    const greenDom = g > r + 18 && g > b + 25;
    const tooDark = (r + g + b) / 3 < 35;
    console.log(
      `stump-region mean RGB=(${r.toFixed(1)},${g.toFixed(1)},${b.toFixed(1)}) greenDom=${greenDom} tooDark=${tooDark}`,
    );
    if (greenDom || tooDark) {
      console.warn(
        "WARNING: stump base region looks overly green/dark — check normal=PNG + decode colorSpace",
      );
    }
    writeFileSync(
      join(outDir, "stump-region-stats.json"),
      JSON.stringify({ r, g, b, greenDom, tooDark, crop }, null, 2),
    );
  }
} catch (e) {
  console.warn("WARNING: stump visual check skipped", e && e.message);
}

const forbiddenFromLogs = logs.filter((l) =>
  /\[forbidden\] wx\.(showLoading|hideLoading|showToast|showModal)/.test(l),
);
if (forbiddenUi.length || forbiddenFromLogs.length) {
  console.error("ERROR: system UI used:", [...forbiddenUi, ...forbiddenFromLogs].slice(0, 10));
}

let exit = 0;
if (mp4Size > 15 * 1024 * 1024) {
  console.warn("WARNING: mp4 exceeds 15MB");
  exit = 1;
}
if (real404.length) exit = 1;
if (audioFails.length) exit = 1;
if (abortFails.length) exit = 1;
if (bootFails.length) exit = 1;
if (audioParamFails.length) exit = 1;
if (!verLog) exit = 1;
if (forbiddenUi.length || forbiddenFromLogs.length) exit = 1;
process.exit(exit);
