/**
 * 0.3.4 minimal-drawer-ui — DPR3 @ 375×812
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
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const require = createRequire(import.meta.url);
const MG = join(fileURLToPath(new URL("..", import.meta.url)));
const ARTIFACTS = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const PORT = Number(process.env.HARNESS_PORT || 5194);
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
  ".wasm": "application/octet-stream",
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
      if (pathname === "/favicon.ico") {
        res.writeHead(204);
        res.end();
        return;
      }
      const file = normalize(join(MG, pathname.replace(/^\//, "")));
      if (!file.startsWith(MG) || !existsSync(file) || !statSync(file).isFile()) {
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const outDir = join(ARTIFACTS, "minigame-034");
mkdirSync(outDir, { recursive: true });

const server = await startServer();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: ["--no-sandbox", "--disable-gpu", "--use-gl=swiftshader"],
});
const page = await browser.newPage();
await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 3 });
let warn404 = 0;
page.on("console", (m) => {
  const t = m.text();
  if (/404|Failed to load resource/i.test(t)) {
    warn404++;
    return;
  }
  console.log("[page]", m.type(), t);
});
page.on("requestfailed", (req) => {
  if (req.url().includes("@")) warn404++;
});

await page.goto(`http://127.0.0.1:${PORT}/harness/index.html`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});

for (let i = 0; i < 100; i++) {
  const ready = await page.evaluate(
    () => typeof window.__fw?.economy === "function" && typeof window.__fw?.art === "function",
  );
  if (ready) break;
  await sleep(400);
}
await sleep(1800);

await page.evaluate(async () => {
  await window.__fw.art().switchTo("set4");
  for (let i = 0; i < 60; i++) {
    if (!window.__fw.art().isSwitching()) break;
    await new Promise((r) => setTimeout(r, 200));
  }
});
await sleep(800);

// skip guide for idle shots
await page.evaluate(() => {
  window.__fw.economy().skipGuide();
  window.__fw.economy().setRemaining(12);
  window.__fw.economy().openPanel("none");
  window.__fw.economy().closeDrawer?.();
});
await sleep(600);
await page.screenshot({ path: join(outDir, "01_idle.png"), type: "png" });

// drawer keyframes via setDrawerQ (linear q ≈ open ease samples)
for (const [name, q] of [
  ["02_drawer_30", 0.3],
  ["03_drawer_60", 0.6],
  ["04_drawer_100", 1.0],
]) {
  await page.evaluate((qq) => window.__fw.economy().setDrawerQ(qq), q);
  await sleep(400);
  await page.screenshot({ path: join(outDir, `${name}.png`), type: "png" });
}

await page.evaluate(() => {
  window.__fw.economy().closeDrawer();
  window.__fw.economy().setRemaining(0);
  window.__fw.economy().showExhaustedBubble();
});
await sleep(500);
await page.screenshot({ path: join(outDir, "05_exhausted_bubble.png"), type: "png" });

await page.evaluate(() => window.__fw.economy().openPanel("exhausted"));
await sleep(500);
await page.screenshot({ path: join(outDir, "06_exhausted_panel.png"), type: "png" });

await page.evaluate(() => {
  window.__fw.economy().openPanel("none");
  window.__fw.economy().setRemaining(12);
  window.__fw.economy().setDrawerQ(1);
  window.__fw.economy().setDrawerPage("style");
});
await sleep(500);
await page.screenshot({ path: join(outDir, "07_style_list.png"), type: "png" });

await page.evaluate(() => {
  window.__fw.economy().closeDrawer();
  window.__fw.economy().openPanel("rank");
});
await sleep(500);
await page.screenshot({ path: join(outDir, "08_rank.png"), type: "png" });

await page.evaluate(() => {
  window.__fw.economy().openPanel("none");
  window.__fw.economy().resetGuide();
  window.__fw.economy().setGuideStep(1);
});
await sleep(700);
await page.screenshot({ path: join(outDir, "09_guide_step1.png"), type: "png" });

await page.evaluate(() => window.__fw.economy().setGuideStep(2));
await sleep(500);
await page.screenshot({ path: join(outDir, "10_guide_step2.png"), type: "png" });

await page.evaluate(() => window.__fw.economy().setGuideStep(3));
await sleep(900);
await page.screenshot({ path: join(outDir, "11_guide_step3.png"), type: "png" });

const version = require("../version.js");
const meta = await page.evaluate(() => {
  const c = document.getElementById("fw-hud");
  return {
    snap: window.__fw.economy().snapshot(),
    guide: window.__fw.economy().guideStep(),
    hud: c
      ? { w: c.width, h: c.height, cssW: window.innerWidth, dpr: c.width / window.innerWidth }
      : null,
  };
});
meta.version = version;
meta.warn404 = warn404;
writeFileSync(join(outDir, "meta.json"), JSON.stringify(meta, null, 2));
console.log("wrote", outDir, "hud", meta.hud, "404-ish", warn404);
await browser.close();
server.close();
