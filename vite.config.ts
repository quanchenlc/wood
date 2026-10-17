import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * 开发期兜底:若 `public/` 里还没有素材,把 /assets 和 /basis 映射到参考目录。
 * 构建不走这里 —— 运行时素材已经放在 `public/`,会原样拷进 dist。
 */
const REFERENCE_ASSETS = "site/screen.toys/firewood";

const MIME: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".wasm": "application/wasm",
  ".js": "text/javascript",
  ".ktx2": "image/ktx2",
};

/** 开发期兜底映射。public/ 有同名文件时,中间件和静态目录都能对上。 */
function referenceAssets(root: string): Plugin {
  const base = join(root, REFERENCE_ASSETS);
  return {
    name: "firewood-reference-assets",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (!url.startsWith("/assets/") && !url.startsWith("/basis/")) return next();

        const file = normalize(join(base, decodeURIComponent(url)));
        if (!file.startsWith(base) || !existsSync(file) || !statSync(file).isFile()) return next();

        res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
        res.setHeader("Content-Length", statSync(file).size);
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  base: "./",
  plugins: [referenceAssets(process.cwd())],
  build: {
    target: "es2022",
    assetsInlineLimit: 0,
  },
  server: { host: true },
  // three-pinata 与 planck 是 CJS/ESM 混合,预打包一次避免开发期反复重载
  optimizeDeps: command === "serve" ? { include: ["three", "cannon-es", "planck"] } : undefined,
}));
