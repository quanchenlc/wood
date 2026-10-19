/**
 * 0.4.6 part2 — sound-pack drawer section shots → /cursor/stores/self/snd046/
 * Opens drawer → 风格, scrolls to 音效, captures portrait + landscape.
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
const STORE = "/cursor/stores/self/snd046";
const PORT = Number(process.env.HARNESS_PORT || 5230);
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function saveShot(page, name) {
  const dest = join(ARTIFACTS, name);
  return page.screenshot({ path: dest, type: "png" }).then(() => {
    copyFileSync(dest, join(STORE, name));
    console.log("shot", name);
  });
}

mkdirSync(ARTIFACTS, { recursive: true });
mkdirSync(STORE, { recursive: true });

const server = await startServer();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: ["--no-sandbox", "--disable-gpu", "--use-gl=swiftshader"],
});
const page = await browser.newPage();
page.on("console", (m) => {
  const t = m.text();
  if (/404|Failed to load|GPU stall|deprecated/i.test(t)) return;
  console.log("[page]", t.slice(0, 140));
});

async function waitReady() {
  for (let i = 0; i < 150; i++) {
    const ok = await page.evaluate(
      () => typeof window.__fw?.state === "function" && window.__fw.state()?.game === "IDLE",
    );
    if (ok) return;
    await sleep(400);
  }
  throw new Error("not ready");
}

async function openStyleSound(cssW, cssH) {
  await page.setViewport({ width: cssW, height: cssH, deviceScaleFactor: 2 });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await sleep(500);
  await page.evaluate(() => {
    window.__fw.economy?.()?.skipGuide?.();
    window.__fw.economy?.()?.setRemaining?.(50);
    window.__fw.economy?.()?.closeDrawer?.();
    window.__fw.look?.(12);
  });
  await sleep(400);
  // Open drawer → style page, scroll to sound section
  await page.evaluate(() => {
    window.__fw.economy?.()?.openDrawer?.();
  });
  await sleep(450);
  await page.evaluate(() => {
    window.__fw.economy?.()?.setDrawerPage?.("style");
  });
  await sleep(400);
  // Prefer soundPack hook to ensure pack1 selected for checkmark
  await page.evaluate(async () => {
    try {
      await window.__fw.soundPack?.()?.switchTo?.("pack1");
    } catch {
      /* ignore */
    }
  });
  await sleep(400);
  // Scroll to sound section: portrait clamps to max so all 5 rows fit; landscape shows heading
  await page.evaluate((landscape) => {
    const rowStep = landscape ? 48 : 46;
    const headH = 28;
    const cols = landscape ? 2 : 1;
    const styleRows = Math.ceil(5 / cols);
    const stumpRows = landscape ? 1 : 2;
    const soundBase = styleRows * rowStep + headH + stumpRows * rowStep + headH;
    const listTop = landscape ? 58 : 132;
    const listBottom = landscape ? 260 : 342;
    const viewH = Math.max(40, listBottom - listTop);
    const soundRows = landscape ? Math.ceil(5 / cols) : 5;
    const contentH = soundBase + soundRows * rowStep;
    const maxScroll = Math.max(0, contentH - viewH);
    // Portrait: max scroll → all five options; landscape: keep 「音效」 label in view
    const scroll = landscape ? Math.max(0, soundBase - 8) : maxScroll;
    window.__fw.economy?.()?.setStyleScroll?.(Math.min(scroll, maxScroll));
  }, cssW > cssH);
  await sleep(400);
}

await page.goto(`http://127.0.0.1:${PORT}/harness/index.html`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await waitReady();

await openStyleSound(375, 812);
await saveShot(page, "snd046_portrait_sound.png");

await openStyleSound(812, 375);
await saveShot(page, "snd046_landscape_sound.png");

const version = require(join(MG, "version.js"));
const sizeReport = JSON.parse(readFileSync(join(MG, "size-report.json"), "utf8"));
const soundSubs = {};
for (const k of ["sounds-pack1", "sounds-pack2", "sounds-pack3", "sounds-pack4"]) {
  soundSubs[k] = sizeReport.subpackages?.[k] ?? null;
}
const meta = {
  version: {
    VERSION: version.VERSION,
    BUILD_NOTE: version.BUILD_NOTE,
    BUILD_REV: version.BUILD_REV,
  },
  tip: version.BUILD_REV,
  note: "0.4.6 sound-pack switcher in drawer 风格 → 音效",
  defaultPack: "pack1",
  options: ["原味", "清脆", "厚重", "层次", "旧版"],
  soundSubpackages: soundSubs,
  mainPackage: sizeReport.mainPackage,
  mainUnder4MB: sizeReport.mainUnder4MB,
  subpackagesTotal: sizeReport.subpackagesTotal,
  shots: ["snd046_portrait_sound.png", "snd046_landscape_sound.png"],
};
writeFileSync(join(STORE, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
writeFileSync(join(ARTIFACTS, "snd046_meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
copyFileSync(join(STORE, "snd046_portrait_sound.png"), join(ARTIFACTS, "snd046_portrait_sound.png"));
copyFileSync(join(STORE, "snd046_landscape_sound.png"), join(ARTIFACTS, "snd046_landscape_sound.png"));

await browser.close();
server.close();
console.log("snd046 done", meta);
