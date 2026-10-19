/**
 * 0.4.0 ip-clean 对比截图：木桩 A / B + 各一帧 gameplay。
 * 用法: node scripts/capture-ip-clean.mjs
 */
import { createServer } from "vite";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const OUT = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
mkdirSync(OUT, { recursive: true });

const CHROME =
  process.env.CHROME_PATH ||
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"].find(
    (p) => existsSync(p),
  );

const PORT = 5198;
const server = await createServer({
  server: { port: PORT, strictPort: true, host: "127.0.0.1" },
});
await server.listen();
const URL = `http://127.0.0.1:${PORT}/`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--window-size=720,1280",
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 720, height: 1280, deviceScaleFactor: 1 });

const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: "networkidle2", timeout: 90000 });

// Wait for debug hooks + IDLE
await page
  .waitForFunction(() => window.__fw?.state?.()?.game === "IDLE", {
    timeout: 90000,
    polling: 500,
  })
  .catch(() => null);

await page.evaluate(() => {
  try {
    localStorage.setItem("fw_guide_done", "1");
    localStorage.setItem("fw_stump_variant", "A");
  } catch {}
  window.__fw?.economy?.()?.skipGuide?.();
  window.__fw?.look?.(22);
});

await new Promise((r) => setTimeout(r, 3000));

async function shot(name) {
  const path = join(OUT, name);
  await page.screenshot({ path, type: "png" });
  console.log("wrote", path);
  return path;
}

async function waitIdle(ms = 25000) {
  return page
    .waitForFunction(() => window.__fw?.state?.()?.game === "IDLE", {
      timeout: ms,
      polling: 400,
    })
    .then(() => true)
    .catch(() => false);
}

async function switchStump(id) {
  await waitIdle();
  await page.evaluate(async (sid) => {
    await window.__fw?.stump?.()?.switchTo?.(sid);
  }, id);
  await new Promise((r) => setTimeout(r, 4000));
  const active = await page.evaluate(() => window.__fw?.stump?.()?.active);
  console.log("stump active", active);
  return active;
}

// —— Clean stump portraits (whole log, before any chop) ——
await switchStump("A");
await page.evaluate(() => window.__fw?.look?.(18));
await new Promise((r) => setTimeout(r, 2000));
await shot("ipclean_stump_A.png");

await switchStump("B");
await page.evaluate(() => window.__fw?.look?.(18));
await new Promise((r) => setTimeout(r, 2000));
await shot("ipclean_stump_B.png");

// —— Gameplay frames ——
await switchStump("A");
await waitIdle();
await page.evaluate(() => window.__fw?.click?.());
await new Promise((r) => setTimeout(r, 3500));
await shot("ipclean_gameplay_A.png");

await waitIdle();
await switchStump("B");
await waitIdle();
await page.evaluate(() => window.__fw?.click?.());
await new Promise((r) => setTimeout(r, 3500));
await shot("ipclean_gameplay_B.png");

const state = await page.evaluate(() => ({
  game: window.__fw?.state?.(),
  stump: window.__fw?.stump?.()?.active,
  art: window.__fw?.art?.()?.active,
}));
writeFileSync(join(OUT, "ipclean_capture_meta.json"), JSON.stringify({ state, logs: logs.slice(-40) }, null, 2));
console.log("meta", state);

await browser.close();
await server.close();
