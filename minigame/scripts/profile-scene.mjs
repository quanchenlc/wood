/**
 * 桌面 harness：统计 verts/tris/drawcalls/geometries/textures + 可选连劈内存。
 * 用法：node minigame/scripts/profile-scene.mjs [--chops=30]
 */
import { createServer } from "node:http";
import { readFileSync, existsSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import puppeteer from "puppeteer-core";

const MG = join(fileURLToPath(new URL("..", import.meta.url)));
const ROOT = MG;
const OUT = process.env.ARTIFACT_DIR
  ? join(process.env.ARTIFACT_DIR, "perf-0.1.9")
  : join(tmpdir(), "firewood-perf");
mkdirSync(OUT, { recursive: true });
const CHOPS = Number((process.argv.find((a) => a.startsWith("--chops=")) || "--chops=0").split("=")[1]);
const PORT = Number(process.env.HARNESS_PORT || 5191);
const CHROME =
  process.env.CHROME_PATH ||
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"].find(
    (p) => existsSync(p),
  );

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".glb": "application/octet-stream",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".mp3": "audio/mpeg",
  ".wasm": "application/wasm",
};

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/harness/index.html";
  if (pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }
  const file = normalize(join(ROOT, pathname.replace(/^\//, "")));
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
page.on("console", (m) => {
  const t = m.text();
  if (/firewood|perf|ERROR|error/i.test(t)) console.log("[page]", t);
});
await page.goto(`http://127.0.0.1:${PORT}/harness/index.html`, { waitUntil: "networkidle0", timeout: 120000 });
await page.waitForFunction(() => window.__fw && window.__fw.state && window.__fw.state().game === "IDLE", {
  timeout: 120000,
});
await new Promise((r) => setTimeout(r, 800));

const stats = await page.evaluate(() => {
  const fw = window.__fw;
  if (!fw?.perf) return { error: "no __fw.perf — rebuild with debug hooks" };
  return fw.perf();
});
writeFileSync(join(OUT, "idle-stats.json"), `${JSON.stringify(stats, null, 2)}\n`);
await page.screenshot({ path: join(OUT, "idle.png"), type: "png" });
console.log("[perf] idle", JSON.stringify(stats?.summary || stats, null, 2));

const memSeries = [];
if (CHOPS > 0) {
  for (let i = 0; i < CHOPS; i++) {
    await page.evaluate(() => window.__fw.click());
    await page.waitForFunction(
      (n) => window.__fw.state().axePlayCount >= n || window.__fw.state().game === "STACKING",
      { timeout: 15000 },
      i + 1,
    ).catch(() => {});
    await new Promise((r) => setTimeout(r, 450));
    // 等码垛结束回到 IDLE
    await page.waitForFunction(() => window.__fw.state().game === "IDLE", { timeout: 20000 }).catch(() => {});
    const s = await page.evaluate(() => window.__fw.perf());
    memSeries.push({
      chop: i + 1,
      geometries: s?.summary?.geometries,
      textures: s?.summary?.textures,
      tris: s?.summary?.tris,
      drawCalls: s?.summary?.drawCalls,
      jsHeap: s?.summary?.jsHeapMB,
    });
    if ((i + 1) % 5 === 0) console.log(`[perf] after ${i + 1} chops`, memSeries[memSeries.length - 1]);
  }
  writeFileSync(join(OUT, "memory-over-chops.json"), `${JSON.stringify(memSeries, null, 2)}\n`);
  await page.screenshot({ path: join(OUT, `after-${CHOPS}-chops.png`), type: "png" });
}

await browser.close();
server.close();
console.log("[perf] wrote", OUT);
