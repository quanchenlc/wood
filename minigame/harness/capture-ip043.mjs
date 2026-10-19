/**
 * 0.4.3 stump visual check — A/B + gameplay → artifacts + Agent Store ip043
 */
import { createServer } from "node:http";
import {
  readFileSync,
  existsSync,
  statSync,
  mkdirSync,
  copyFileSync,
} from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const MG = join(fileURLToPath(new URL("..", import.meta.url)));
const ARTIFACTS = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const STORE = "/cursor/stores/self/ip043";
const PORT = Number(process.env.HARNESS_PORT || 5199);
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
  ".jpeg": "image/jpeg",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
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

function save(page, name) {
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
  args: ["--no-sandbox", "--disable-gpu", "--use-gl=swiftshader", "--window-size=720,1280"],
});
const page = await browser.newPage();
await page.setViewport({ width: 720, height: 1280, deviceScaleFactor: 1 });
page.on("console", (m) => {
  const t = m.text();
  if (/404|Failed to load|GPU stall/i.test(t)) return;
  console.log("[page]", t.slice(0, 160));
});

await page.goto(`http://127.0.0.1:${PORT}/harness/index.html`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
for (let i = 0; i < 100; i++) {
  const ready = await page.evaluate(
    () => typeof window.__fw?.stump === "function" && window.__fw?.state?.()?.game === "IDLE",
  );
  if (ready) break;
  await sleep(400);
}
await page.evaluate(() => {
  window.__fw.economy?.()?.skipGuide?.();
  window.__fw.look?.(20);
});
await sleep(1500);

await page.evaluate(async () => {
  await window.__fw.stump().switchTo("A");
});
await sleep(3500);
await page.evaluate(() => window.__fw.look?.(18));
await sleep(800);
await save(page, "ip043_stump_A.png");

await page.evaluate(async () => {
  await window.__fw.stump().switchTo("B");
});
await sleep(3500);
await save(page, "ip043_stump_B.png");

await page.evaluate(async () => {
  await window.__fw.stump().switchTo("A");
});
await sleep(2500);
// one chop for gameplay
await page.evaluate(() => window.__fw.click?.());
await sleep(2200);
await save(page, "ip043_gameplay_A.png");

await page.evaluate(async () => {
  await window.__fw.stump().switchTo("B");
});
await sleep(2500);
await page.evaluate(() => window.__fw.click?.());
await sleep(2200);
await save(page, "ip043_gameplay_B.png");

await browser.close();
server.close();
console.log("done →", STORE);
