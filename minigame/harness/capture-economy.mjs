/**
 * 0.3.6 rank-page-tall — portrait tall rank + scroll + landscape rank
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
const outDir = join(ARTIFACTS, "minigame-036");
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
  await sleep(500);
  await page.evaluate(() => {
    window.__fw.economy().skipGuide();
    window.__fw.economy().setRemaining(12);
    window.__fw.economy().openPanel("none");
    window.__fw.economy().closeDrawer?.();
  });
  await sleep(400);
}

await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 3 });
await page.goto(`http://127.0.0.1:${PORT}/harness/index.html`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await waitReady();
await sleep(1200);
await prepBase();

// main drawer for comparison
await page.evaluate(() => {
  window.__fw.economy().setDrawerQ(1);
  window.__fw.economy().setDrawerPage("main");
});
await sleep(500);
await page.screenshot({ path: join(outDir, "p01_main_drawer.png"), type: "png" });

// tall rank top
await page.evaluate(() => {
  window.__fw.economy().setDrawerPage("rank");
  window.__fw.economy().setRankScroll?.(0);
});
await sleep(700); // allow height morph 250ms + settle
const rankMeta = await page.evaluate(() => ({
  h1: window.__fw.economy().getDrawerH1?.(),
  rows: window.__fw.economy().getRankRows?.()?.length,
  scroll: window.__fw.economy().getRankScroll?.(),
}));
console.log("rank meta", rankMeta);
await page.screenshot({ path: join(outDir, "p02_rank_top.png"), type: "png" });

// scrolled
await page.evaluate(() => {
  window.__fw.economy().setRankScroll?.(320);
});
await sleep(400);
await page.screenshot({ path: join(outDir, "p03_rank_scrolled.png"), type: "png" });

// landscape rank
await page.setViewport({ width: 812, height: 375, deviceScaleFactor: 3 });
await page.evaluate(() => window.dispatchEvent(new Event("resize")));
await sleep(800);
await page.evaluate(() => {
  window.__fw.economy().skipGuide();
  window.__fw.economy().setRemaining(12);
  window.__fw.economy().setDrawerQ(1);
  window.__fw.economy().setDrawerPage("rank");
  window.__fw.economy().setRankScroll?.(0);
});
await sleep(600);
await page.screenshot({ path: join(outDir, "l01_rank.png"), type: "png" });

const version = require("../version.js");
const meta = await page.evaluate(() => {
  const c = document.getElementById("fw-hud");
  return {
    h1: window.__fw.economy().getDrawerH1?.(),
    rows: window.__fw.economy().getRankRows?.()?.length,
    hud: c
      ? {
          w: c.width,
          h: c.height,
          cssW: window.innerWidth,
          cssH: window.innerHeight,
          dpr: c.width / window.innerWidth,
        }
      : null,
  };
});
meta.version = version;
meta.warn404 = warn404;
meta.deviceOrientation = require("../game.json").deviceOrientation;
meta.portraitRankMeta = rankMeta;
writeFileSync(join(outDir, "meta.json"), JSON.stringify(meta, null, 2));
console.log("wrote", outDir, meta);
await browser.close();
server.close();
