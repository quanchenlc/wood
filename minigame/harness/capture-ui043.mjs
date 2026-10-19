/**
 * 0.4.3 UI layout check — 8 drawer states → artifacts + Agent Store ui043
 * Writes real BUILD_REV into meta.json (never "pending").
 */
import { createServer } from "node:http";
import {
  readFileSync,
  existsSync,
  statSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const require = createRequire(import.meta.url);
const MG = join(fileURLToPath(new URL("..", import.meta.url)));
const ARTIFACTS = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const STORE = "/cursor/stores/self/ui043";
const PORT = Number(process.env.HARNESS_PORT || 5198);
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
  ".gltf": "application/json",
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
mkdirSync(ARTIFACTS, { recursive: true });
mkdirSync(STORE, { recursive: true });

function saveShot(page, name) {
  const dest = join(ARTIFACTS, name);
  return page.screenshot({ path: dest, type: "png" }).then(() => {
    copyFileSync(dest, join(STORE, name));
    console.log("shot", name);
  });
}

const server = await startServer();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: ["--no-sandbox", "--disable-gpu", "--use-gl=swiftshader"],
});
const page = await browser.newPage();
page.on("console", (m) => {
  const t = m.text();
  if (/404|Failed to load resource/i.test(t)) return;
  console.log("[page]", m.type(), t.slice(0, 200));
});

async function waitReady() {
  for (let i = 0; i < 120; i++) {
    const ready = await page.evaluate(
      () => typeof window.__fw?.economy === "function" && typeof window.__fw?.art === "function",
    );
    if (ready) return;
    await sleep(400);
  }
  throw new Error("fw not ready");
}

async function prepBase({ remaining = 12 } = {}) {
  await page.evaluate(async () => {
    await window.__fw.art().switchTo("set4");
    for (let i = 0; i < 60; i++) {
      if (!window.__fw.art().isSwitching()) break;
      await new Promise((r) => setTimeout(r, 200));
    }
  });
  await sleep(400);
  await page.evaluate(({ remaining }) => {
    window.__fw.economy().skipGuide();
    window.__fw.economy().setRemaining(remaining);
    window.__fw.economy().openPanel("none");
    window.__fw.economy().closeDrawer?.();
  }, { remaining });
  await sleep(300);
}

await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 3 });
await page.goto(`http://127.0.0.1:${PORT}/harness/index.html`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await waitReady();
await sleep(1000);
await prepBase({ remaining: 12 });

await page.evaluate(() => {
  window.__fw.economy().setDrawerQ(1);
  window.__fw.economy().setDrawerPage("main");
});
await sleep(500);
await saveShot(page, "ui043_portrait_main.png");

await page.evaluate(() => {
  window.__fw.economy().skipMinutes?.(200);
  window.__fw.economy().setRemaining(50);
  window.__fw.economy().setDrawerPage("main");
});
await sleep(600);
await saveShot(page, "ui043_portrait_leather.png");

await page.evaluate(() => {
  window.__fw.economy().claim?.();
  window.__fw.economy().setRemaining(12);
});

await page.evaluate(() => {
  window.__fw.economy().setDrawerPage("rank");
  window.__fw.economy().setRankScroll?.(0);
});
await sleep(700);
await saveShot(page, "ui043_portrait_rank_top.png");

await page.evaluate(() => {
  window.__fw.economy().setRankScroll?.(360);
});
await sleep(400);
await saveShot(page, "ui043_portrait_rank_scrolled.png");

await page.evaluate(() => {
  window.__fw.economy().setDrawerPage("style");
  window.__fw.economy().setStyleScroll?.(0);
});
await sleep(500);
await saveShot(page, "ui043_portrait_style.png");

// landscape
await page.setViewport({ width: 812, height: 375, deviceScaleFactor: 3 });
await page.evaluate(() => window.dispatchEvent(new Event("resize")));
await sleep(800);
await prepBase({ remaining: 12 });

// landscape main with leather CTA visible (P2-4 width ≤360)
await page.evaluate(() => {
  window.__fw.economy().skipMinutes?.(200);
  window.__fw.economy().setRemaining(50);
  window.__fw.economy().setDrawerQ(1);
  window.__fw.economy().setDrawerPage("main");
});
await sleep(600);
await saveShot(page, "ui043_landscape_main.png");

await page.evaluate(() => {
  window.__fw.economy().claim?.();
  window.__fw.economy().setRemaining(12);
  window.__fw.economy().setDrawerPage("rank");
  window.__fw.economy().setRankScroll?.(0);
});
await sleep(600);
await saveShot(page, "ui043_landscape_rank.png");

await page.evaluate(() => {
  window.__fw.economy().setDrawerPage("style");
});
await sleep(500);
await saveShot(page, "ui043_landscape_style.png");

const version = require("../version.js");
const meta = await page.evaluate(() => ({
  h1: window.__fw.economy().getDrawerH1?.(),
  rows: window.__fw.economy().getRankRows?.()?.length,
  size: { w: window.innerWidth, h: window.innerHeight },
}));
meta.version = {
  VERSION: version.VERSION,
  BUILD_NOTE: version.BUILD_NOTE,
  BUILD_REV: version.BUILD_REV,
};
if (!meta.version.BUILD_REV || meta.version.BUILD_REV === "pending") {
  console.warn("WARN: BUILD_REV is still pending — stamp before ship");
}
writeFileSync(join(ARTIFACTS, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
copyFileSync(join(ARTIFACTS, "meta.json"), join(STORE, "meta.json"));
console.log("done", meta);
await browser.close();
server.close();
