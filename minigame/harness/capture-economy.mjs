/**
 * 0.3.2 直进场景 + HiDPI HUD + 引导截图
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

const MG = join(fileURLToPath(new URL("..", import.meta.url)));
const ARTIFACTS = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const PORT = Number(process.env.HARNESS_PORT || 5192);
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
const outDir = join(ARTIFACTS, "minigame-032");
mkdirSync(outDir, { recursive: true });

const server = await startServer();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: ["--no-sandbox", "--disable-gpu", "--use-gl=swiftshader"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3 });
page.on("console", (m) => console.log("[page]", m.type(), m.text()));

await page.goto(`http://127.0.0.1:${PORT}/harness/index.html`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});

for (let i = 0; i < 90; i++) {
  const ready = await page.evaluate(
    () => typeof window.__fw?.economy === "function" && typeof window.__fw?.art === "function",
  );
  if (ready) break;
  await sleep(500);
}
await sleep(1200);

// Guide step 1 (fresh)
await page.evaluate(() => window.__fw.economy().resetGuide());
await sleep(500);
await page.screenshot({ path: join(outDir, "01_guide_step1.png"), type: "png" });

await page.evaluate(async () => {
  window.__fw.economy().skipGuide();
  await window.__fw.art().switchTo("set4");
  for (let i = 0; i < 60; i++) {
    if (!window.__fw.art().isSwitching()) break;
    await new Promise((r) => setTimeout(r, 250));
  }
});
await sleep(1000);

await page.evaluate(() => {
  window.__fw.economy().setRemaining(12);
  window.__fw.economy().openPanel("none");
});
await sleep(500);
await page.screenshot({ path: join(outDir, "02_scene_hud.png"), type: "png" });

await page.evaluate(() => {
  window.__fw.economy().skipMinutes(45);
  window.__fw.economy().openPanel("claim");
});
await sleep(500);
await page.screenshot({ path: join(outDir, "03_claim.png"), type: "png" });

const meta = await page.evaluate(() => ({
  snap: window.__fw.economy().snapshot(),
  guide: window.__fw.economy().guideStep(),
  version: require("./version.js"),
  hudCanvas: (() => {
    const c = document.getElementById("fw-hud");
    if (!c) return null;
    return {
      css: { w: window.innerWidth, h: window.innerHeight },
      buffer: { w: c.width, h: c.height },
      dprApprox: c.width / window.innerWidth,
    };
  })(),
}));

writeFileSync(join(outDir, "meta.json"), JSON.stringify(meta, null, 2));
console.log("wrote", outDir, JSON.stringify(meta.hudCanvas), "guide", meta.guide);
await browser.close();
server.close();
