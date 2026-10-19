/**
 * 0.4.4c — art review packing: portrait on-open + landscape A/B → store ui044c
 * meta.json always reads BUILD_REV from minigame/version.js (post-stamp).
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
const STORE = "/cursor/stores/self/ui044c";
const PORT = Number(process.env.HARNESS_PORT || 5203);
const CHROME =
  process.env.CHROME_PATH ||
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"].find(
    (p) => existsSync(p),
  );

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".glb": "model/gltf-binary",
  ".gltf": "application/json",
  ".bin": "application/octet-stream",
  ".wasm": "application/octet-stream",
  ".mp3": "audio/mpeg",
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
        res.end("nf");
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

async function prep() {
  await page.evaluate(async () => {
    await window.__fw.art().switchTo("set4");
    for (let i = 0; i < 60; i++) {
      if (!window.__fw.art().isSwitching()) break;
      await new Promise((r) => setTimeout(r, 200));
    }
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
await sleep(800);
await prep();

// Portrait on open: setDrawerPage("style") auto-scrolls selected row (羊皮纸 → 30)
await page.evaluate(() => {
  window.__fw.economy().setDrawerQ(1);
  window.__fw.economy().setDrawerPage("style");
});
await sleep(700);
const scrollY = await page.evaluate(() => window.__fw.economy().getStyleScroll?.() ?? null);
console.log("portrait styleScrollY", scrollY);
await saveShot(page, "ui044c_portrait_style.png");

// Landscape A selected
await page.setViewport({ width: 812, height: 375, deviceScaleFactor: 3 });
await page.evaluate(() => window.dispatchEvent(new Event("resize")));
await sleep(700);
await prep();
await page.evaluate(async () => {
  await window.__fw.stump().switchTo("A");
  for (let i = 0; i < 40; i++) {
    if (window.__fw.stump().active === "A") break;
    await new Promise((r) => setTimeout(r, 100));
  }
  window.__fw.economy().setDrawerQ(1);
  window.__fw.economy().setDrawerPage("style");
});
await sleep(700);
await saveShot(page, "ui044c_landscape_style_A.png");

// Landscape B selected
await page.evaluate(async () => {
  await window.__fw.stump().switchTo("B");
  for (let i = 0; i < 40; i++) {
    if (window.__fw.stump().active === "B") break;
    await new Promise((r) => setTimeout(r, 100));
  }
  window.__fw.economy().setDrawerPage("style");
});
await sleep(700);
await saveShot(page, "ui044c_landscape_style_B.png");

const version = require("../version.js");
const meta = {
  version: {
    VERSION: version.VERSION,
    BUILD_NOTE: version.BUILD_NOTE,
    BUILD_REV: version.BUILD_REV,
  },
  tip: version.BUILD_REV,
  shots: [
    "ui044c_portrait_style.png",
    "ui044c_landscape_style_A.png",
    "ui044c_landscape_style_B.png",
  ],
  note: "art-review packing; meta BUILD_REV from version.js",
};
writeFileSync(join(ARTIFACTS, "ui044c_meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
writeFileSync(join(STORE, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
console.log("done", meta);
await browser.close();
server.close();
