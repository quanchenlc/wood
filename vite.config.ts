import { createRequire } from "node:module";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);
const ver = require("./minigame/version.js") as {
  VERSION?: string;
  BUILD_NOTE?: string;
};

export default defineConfig(({ command }) => ({
  base: "./",
  build: {
    target: "es2022",
    assetsInlineLimit: 0,
  },
  define: {
    __FW_APP_VERSION__: JSON.stringify(String(ver.VERSION || "0.0.0")),
    __FW_APP_BUILD_NOTE__: JSON.stringify(String(ver.BUILD_NOTE || "")),
  },
  server: { host: true },
  // three-pinata 与 planck 是 CJS/ESM 混合,预打包一次避免开发期反复重载
  optimizeDeps: command === "serve" ? { include: ["three", "cannon-es", "planck"] } : undefined,
}));
