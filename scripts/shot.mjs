/**
 * 开发期截图自检:自己拉起 vite,用本机 Chrome 抓一张图 + 收集控制台报错,然后收摊。
 * 用法: node scripts/shot.mjs [输出路径] [等待秒数]
 */
import { createServer } from "vite";
import puppeteer from "puppeteer-core";

const OUT = process.argv[2] ?? "/tmp/firewood.png";
const WAIT_MS = Number(process.argv[3] ?? 9) * 1000;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const server = await createServer({ server: { port: 5199, strictPort: true } });
await server.listen();
const URL = `http://localhost:5199/`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--window-size=1280,800",
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("requestfailed", (r) => logs.push(`[failed] ${r.url()} ${r.failure()?.errorText ?? ""}`));
page.on("response", (r) => r.status() >= 400 && logs.push(`[${r.status()}] ${r.url()}`));

await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, WAIT_MS));

// 软件渲染只有 2~3 FPS,而主循环把 dt 夹在 0.05,动画只能按真实速度的
// 十分之一推进。所以每步之间要等得比直觉长得多,默认 6 秒。
const STEP_WAIT = Number(process.env.SHOT_STEP_WAIT ?? 6) * 1000;

// SHOT_CLICKS="640,300 640,340" —— 在这些视口坐标依次点一下
for (const spec of (process.env.SHOT_CLICKS ?? "").split(" ").filter(Boolean)) {
  const [x, y] = spec.split(",").map(Number);
  await page.mouse.click(x, y);
  await new Promise((r) => setTimeout(r, STEP_WAIT));
}

// SHOT_PLAY=N —— 自动玩 N 刀:每次等状态机回到 IDLE 再点,避免点在动画中间被忽略
const plays = Number(process.env.SHOT_PLAY ?? 0);
for (let i = 0; i < plays; i++) {
  const ok = await page
    .waitForFunction(() => window.__fw?.state().game === "IDLE", { timeout: 60000, polling: 500 })
    .then(() => true)
    .catch(() => false);
  if (!ok) {
    console.log(`  第 ${i + 1} 刀等不到 IDLE,放弃`);
    break;
  }
  // 第一刀打中线；碎块展开后扫描左右不同位置，覆盖多块留桩的拾取链路。
  const offsets = [0, -35, 35, -70, 70, -105, 105, -140, 140];
  const rows = [380, 345, 415];
  await page.mouse.click(640 + offsets[i % offsets.length], rows[i % rows.length]);
  await new Promise((r) => setTimeout(r, 1200));
}
if (plays) console.log("  play 结束:", JSON.stringify(await page.evaluate(() => window.__fw?.state())));

// SHOT_SCRIPT="split split stack" —— 依次调用 window.__fw 上的开发钩子
for (const step of (process.env.SHOT_SCRIPT ?? "").split(" ").filter(Boolean)) {
  const [name, arg] = step.split(":");
  const out = await page.evaluate(
    (n, a) => {
      const fw = window.__fw;
      return fw && typeof fw[n] === "function" ? fw[n](a === undefined ? undefined : Number(a)) : `no such hook: ${n}`;
    },
    name,
    arg,
  );
  console.log(`  __fw.${step}() ->`, JSON.stringify(out));
  await new Promise((r) => setTimeout(r, STEP_WAIT));
}

const state = await page.evaluate(() => ({
  canvas: !!document.querySelector("canvas"),
  loadingVisible: !!document.getElementById("loading"),
  drawCalls: window.__stats ?? null,
}));

await page.screenshot({ path: OUT });
await browser.close();
await server.close();

console.log("state:", JSON.stringify(state));
console.log("--- console ---");
console.log(logs.join("\n") || "(无输出)");
console.log("--- saved:", OUT);

