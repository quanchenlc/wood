/**
 * 0.4.5 final_A — stump A/B: gameplay, mid-split, close-up, portrait style → store tex045
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
const STORE = "/cursor/stores/self/tex045";
const PORT = Number(process.env.HARNESS_PORT || 5205);
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

async function waitReady(page) {
  for (let i = 0; i < 120; i++) {
    const ready = await page.evaluate(
      () =>
        typeof window.__fw?.stump === "function" &&
        typeof window.__fw?.economy === "function" &&
        window.__fw?.state?.()?.game === "IDLE",
    );
    if (ready) return;
    await sleep(400);
  }
  throw new Error("fw not ready");
}

async function waitGame(page, pred, arg, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const ok = await page.evaluate(pred, arg);
    if (ok) return true;
    await sleep(50);
  }
  return false;
}

async function prepEconomy(page) {
  await page.evaluate(() => {
    window.__fw.economy().skipGuide();
    window.__fw.economy().setRemaining(50);
    window.__fw.economy().openPanel("none");
    window.__fw.economy().closeDrawer?.();
  });
  await sleep(300);
}

async function switchStump(page, id) {
  await page.evaluate(async (sid) => {
    await window.__fw.stump().switchTo(sid);
  }, id);
  for (let i = 0; i < 50; i++) {
    const active = await page.evaluate(() => window.__fw.stump().active);
    if (active === id) break;
    await sleep(100);
  }
  await sleep(2000);
}

async function captureVariant(page, id) {
  const tag = id; // A | B
  await switchStump(page, id);
  await page.evaluate(() => window.__fw.look?.(18));
  await sleep(600);

  // gameplay: stump + log IDLE
  await waitGame(page, () => window.__fw?.state?.()?.game === "IDLE", undefined, 30000);
  await saveShot(page, `tex045_stump${tag}_gameplay.png`);

  // mid-split: chop then grab while SPLITTING
  const playBefore = await page.evaluate(() => window.__fw?.state?.()?.axePlayCount ?? 0);
  await page.evaluate(() => window.__fw.click?.());
  const midOk = await waitGame(
    page,
    (prev) => {
      const st = window.__fw?.state?.();
      return st?.game === "SPLITTING" || (st?.axePlayCount ?? 0) > prev;
    },
    playBefore,
    4000,
  );
  if (midOk) {
    // brief delay into the split for a readable mid frame
    await sleep(180);
    await saveShot(page, `tex045_stump${tag}_midsplit.png`);
  } else {
    console.warn("mid-split state miss; capturing anyway");
    await sleep(200);
    await saveShot(page, `tex045_stump${tag}_midsplit.png`);
  }

  // settle then close-up
  await waitGame(page, () => window.__fw?.state?.()?.game === "IDLE", undefined, 45000);
  await page.evaluate(() => window.__fw.look?.(28));
  await sleep(700);
  await saveShot(page, `tex045_stump${tag}_closeup.png`);

  // portrait style page with check (羊皮纸 selected)
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 3 });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await sleep(500);
  await page.evaluate(async () => {
    await window.__fw.art().switchTo("set4");
    for (let i = 0; i < 60; i++) {
      if (!window.__fw.art().isSwitching()) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    window.__fw.economy().closeDrawer?.();
    window.__fw.economy().setDrawerQ(1);
    window.__fw.economy().setDrawerPage("style");
  });
  await sleep(800);
  await saveShot(page, `tex045_stump${tag}_portrait_style.png`);

  // Return art set to set0 after style-page shots (kept for subsequent gameplay)
  await page.evaluate(async () => {
    await window.__fw.art().switchTo("set0");
    for (let i = 0; i < 60; i++) {
      if (!window.__fw.art().isSwitching()) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    window.__fw.economy().closeDrawer?.();
  });
  await sleep(500);

  // restore landscape-ish portrait viewport for next gameplay
  await page.setViewport({ width: 720, height: 1280, deviceScaleFactor: 1 });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("resize"));
    window.__fw.economy().closeDrawer?.();
  });
  await sleep(600);
}

const server = await startServer();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: ["--no-sandbox", "--disable-gpu", "--use-gl=swiftshader", "--window-size=720,1280"],
});
const page = await browser.newPage();
page.on("console", (m) => {
  const t = m.text();
  if (/404|Failed to load|GPU stall/i.test(t)) return;
  console.log("[page]", t.slice(0, 160));
});

await page.setViewport({ width: 720, height: 1280, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${PORT}/harness/index.html`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await waitReady(page);
await prepEconomy(page);
await sleep(800);

await captureVariant(page, "A");
await captureVariant(page, "B");

const version = require("../version.js");
const shots = [
  "tex045_stumpA_gameplay.png",
  "tex045_stumpA_midsplit.png",
  "tex045_stumpA_closeup.png",
  "tex045_stumpA_portrait_style.png",
  "tex045_stumpB_gameplay.png",
  "tex045_stumpB_midsplit.png",
  "tex045_stumpB_closeup.png",
  "tex045_stumpB_portrait_style.png",
];
const meta = {
  version: {
    VERSION: version.VERSION,
    BUILD_NOTE: version.BUILD_NOTE,
    BUILD_REV: version.BUILD_REV,
  },
  tip: version.BUILD_REV,
  shots,
  note: "final_A textures; meta BUILD_REV from version.js",
};
writeFileSync(join(ARTIFACTS, "tex045_meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
writeFileSync(join(STORE, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
console.log("done", meta);

await browser.close();
server.close();
