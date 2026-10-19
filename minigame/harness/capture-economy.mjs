/**
 * 0.3.5 drawer-hires-landscape — portrait 375×812 + landscape 812×375 @ DPR3
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
const outDir = join(ARTIFACTS, "minigame-035");
mkdirSync(outDir, { recursive: true });

const server = await startServer();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: ["--no-sandbox", "--disable-gpu", "--use-gl=swiftshader"],
});
const page = await browser.newPage();
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

async function waitReady() {
  for (let i = 0; i < 100; i++) {
    const ready = await page.evaluate(
      () => typeof window.__fw?.economy === "function" && typeof window.__fw?.art === "function",
    );
    if (ready) return;
    await sleep(400);
  }
  throw new Error("fw not ready");
}

async function prepBase() {
  await page.evaluate(async () => {
    await window.__fw.art().switchTo("set4");
    for (let i = 0; i < 60; i++) {
      if (!window.__fw.art().isSwitching()) break;
      await new Promise((r) => setTimeout(r, 200));
    }
  });
  await sleep(600);
  await page.evaluate(() => {
    window.__fw.economy().skipGuide();
    window.__fw.economy().setRemaining(12);
    window.__fw.economy().openPanel("none");
    window.__fw.economy().closeDrawer?.();
  });
  await sleep(400);
}

async function shootPortrait() {
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 3 });
  await page.goto(`http://127.0.0.1:${PORT}/harness/index.html`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await waitReady();
  await sleep(1200);
  await prepBase();

  await page.screenshot({ path: join(outDir, "p01_idle.png"), type: "png" });

  await page.evaluate(() => window.__fw.economy().setDrawerQ(1));
  await sleep(450);
  await page.screenshot({ path: join(outDir, "p02_drawer.png"), type: "png" });

  // seam close-up: crop bottom tear region of drawer
  await page.screenshot({
    path: join(outDir, "p02b_seam_closeup.png"),
    type: "png",
    clip: { x: 0, y: 350, width: 375, height: 80 },
  });

  await page.evaluate(() => window.__fw.economy().setDrawerPage("rank"));
  await sleep(450);
  await page.screenshot({ path: join(outDir, "p03_rank.png"), type: "png" });

  await page.evaluate(() => window.__fw.economy().setDrawerPage("style"));
  await sleep(450);
  await page.screenshot({ path: join(outDir, "p04_style.png"), type: "png" });
}

async function shootLandscape() {
  await page.setViewport({ width: 812, height: 375, deviceScaleFactor: 3 });
  // force resize path
  await page.evaluate(() => {
    window.dispatchEvent(new Event("resize"));
  });
  await sleep(800);
  await page.evaluate(() => {
    window.__fw.economy().skipGuide();
    window.__fw.economy().setRemaining(12);
    window.__fw.economy().openPanel("none");
    window.__fw.economy().closeDrawer?.();
  });
  await sleep(500);

  await page.screenshot({ path: join(outDir, "l01_idle.png"), type: "png" });

  await page.evaluate(() => window.__fw.economy().setDrawerQ(1));
  await sleep(500);
  await page.screenshot({ path: join(outDir, "l02_drawer.png"), type: "png" });

  await page.screenshot({
    path: join(outDir, "l02b_seam_closeup.png"),
    type: "png",
    clip: { x: 0, y: 300, width: 812, height: 60 },
  });

  await page.evaluate(() => window.__fw.economy().setDrawerPage("rank"));
  await sleep(500);
  await page.screenshot({ path: join(outDir, "l03_rank.png"), type: "png" });

  await page.evaluate(() => window.__fw.economy().setDrawerPage("style"));
  await sleep(500);
  await page.screenshot({ path: join(outDir, "l04_style.png"), type: "png" });
}

await shootPortrait();
await shootLandscape();

const version = require("../version.js");
const meta = await page.evaluate(() => {
  const c = document.getElementById("fw-hud");
  return {
    snap: window.__fw.economy().snapshot(),
    guide: window.__fw.economy().guideStep(),
    hud: c
      ? {
          w: c.width,
          h: c.height,
          cssW: window.innerWidth,
          cssH: window.innerHeight,
          dpr: c.width / window.innerWidth,
        }
      : null,
    orientation: window.innerWidth > window.innerHeight ? "landscape" : "portrait",
  };
});
meta.version = version;
meta.warn404 = warn404;
meta.deviceOrientation = require("../game.json").deviceOrientation;
writeFileSync(join(outDir, "meta.json"), JSON.stringify(meta, null, 2));
console.log("wrote", outDir, "hud", meta.hud, "404-ish", warn404);
await browser.close();
server.close();
