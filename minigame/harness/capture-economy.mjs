/**
 * 0.3.0 经济 + 羊皮纸 UI 截图：HUD / claim / exhausted / set4 场景
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
const outDir = join(ARTIFACTS, "minigame-economy-030");
mkdirSync(outDir, { recursive: true });

const server = await startServer();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: ["--no-sandbox", "--disable-gpu", "--use-gl=swiftshader"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
page.on("console", (m) => console.log("[page]", m.type(), m.text()));

await page.goto(`http://127.0.0.1:${PORT}/harness/index.html`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});

// wait __fw
for (let i = 0; i < 90; i++) {
  const ready = await page.evaluate(
    () => typeof window.__fw?.economy === "function" && typeof window.__fw?.art === "function",
  );
  if (ready) break;
  await sleep(500);
}
await sleep(1500);

await page.screenshot({ path: join(outDir, "01_home.png"), type: "png" });

await page.evaluate(async () => {
  await window.__fw.art().switchTo("set4");
  for (let i = 0; i < 60; i++) {
    if (!window.__fw.art().isSwitching()) break;
    await new Promise((r) => setTimeout(r, 250));
  }
});
await sleep(1000);

await page.evaluate(() => {
  window.__fw.economy().start();
  window.__fw.economy().skipMinutes(45);
  window.__fw.economy().openPanel("claim");
});
await sleep(800);
await page.screenshot({ path: join(outDir, "02_claim_panel.png"), type: "png" });

await page.evaluate(() => {
  window.__fw.economy().setRemaining(0);
  window.__fw.economy().openPanel("exhausted");
});
await sleep(500);
await page.screenshot({ path: join(outDir, "03_exhausted_hud.png"), type: "png" });

await page.evaluate(() => {
  window.__fw.economy().setRemaining(12);
  window.__fw.economy().openPanel("none");
});
await sleep(500);
await page.screenshot({ path: join(outDir, "04_hud_set4.png"), type: "png" });

await page.evaluate(() => window.__fw.economy().openPanel("rank"));
await sleep(500);
await page.screenshot({ path: join(outDir, "05_rank_shell.png"), type: "png" });

const snap = await page.evaluate(() => window.__fw.economy().snapshot());
const version = await page.evaluate(() => {
  try {
    return require("./version.js");
  } catch {
    return null;
  }
});

writeFileSync(
  join(outDir, "economy-snap.json"),
  JSON.stringify({ snap, version, at: new Date().toISOString() }, null, 2),
);

console.log("wrote", outDir);
await browser.close();
server.close();
