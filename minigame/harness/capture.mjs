/**
 * 在 headless Chromium 里跑真正的 minigame/game.js（经 wx shim），
 * 产出加载/劈砍/码垛截图 + 短录屏。
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

const MG = join(fileURLToPath(new URL("..", import.meta.url)));
const ROOT = MG;
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
  ".wasm": "application/wasm",
  ".mp3": "audio/mpeg",
  ".map": "application/json",
  ".ktx2": "application/octet-stream",
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") pathname = "/harness/index.html";
      const file = normalize(join(ROOT, pathname.replace(/^\//, "")));
      if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
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
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}\n${e.stack || ""}`));
page.on("requestfailed", (r) =>
  logs.push(`[failed] ${r.url()} ${r.failure()?.errorText ?? ""}`),
);

const url = `http://127.0.0.1:${PORT}/harness/index.html`;
await page.goto(url, { waitUntil: "networkidle0", timeout: 120000 });

// 首屏：加载中 / 刚起来
await sleep(800);
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
    .waitForFunction(() => window.__fw?.state()?.game === "IDLE", {
      timeout,
      polling: 400,
    })
    .then(() => true)
    .catch(() => false);
}

await grab("pre");

// 模拟点击：先触屏坐标，再用 __fw.click 兜底
for (let i = 0; i < 5; i++) {
  await waitIdle();
  const offsets = [0, -28, 28, -55, 55];
  const x = 188 + offsets[i % offsets.length];
  const y = 410 + (i % 3) * 18;
  await page.mouse.click(x, y);
  await sleep(400);
  // 若状态仍 IDLE，走调试钩子强制劈一刀
  const st = await page.evaluate(() => window.__fw?.state?.() ?? null);
  if (st?.game === "IDLE") {
    await page.evaluate(() => window.__fw?.click?.());
  }
  await sleep(Math.min(STEP, 2500));
  await grab(`chop-${i}`);
  await sleep(STEP);
}

const mid = join(outDir, "03-mid-chop.png");
cpSync(framePaths[Math.min(3, framePaths.length - 1)], mid);
console.log("shot3", mid);

// 继续直到有码垛或再砍若干刀
for (let i = 0; i < 8; i++) {
  const st = await page.evaluate(() => window.__fw?.state?.() ?? null);
  if (st && st.stacked > 0) break;
  await waitIdle(90000);
  await page.evaluate(() => window.__fw?.click?.());
  await sleep(STEP);
  await grab(`auto-${i}`);
}

await sleep(2500);
const shot3 = join(outDir, "04-after-split-stack.png");
await page.screenshot({ path: shot3, type: "png" });
await grab("final");

const state = await page.evaluate(() => window.__fw?.state?.() ?? null);
writeFileSync(
  join(outDir, "capture-state.json"),
  JSON.stringify({ state, logs: logs.slice(-120), method: "chromium-wx-shim-harness" }, null, 2),
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
if (mp4Size > 15 * 1024 * 1024) {
  console.warn("WARNING: mp4 exceeds 15MB");
  process.exitCode = 1;
}
process.exit(0);
