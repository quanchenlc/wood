import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: "./",
  build: {
    target: "es2022",
    assetsInlineLimit: 0,
  },
  server: { host: true },
  // three-pinata 与 planck 是 CJS/ESM 混合,预打包一次避免开发期反复重载
  optimizeDeps: command === "serve" ? { include: ["three", "cannon-es", "planck"] } : undefined,
}));
