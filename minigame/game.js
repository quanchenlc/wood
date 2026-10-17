/**
 * 微信小游戏入口。
 * 0) AbortController polyfill（须在 adapter / three 之前）
 * 1) 安装 BOM/DOM 适配层
 * 2) canvas 自绘 loading + 加载素材分包 / 远程资源（禁止系统 UI）
 * 3) 启动打包后的共享游戏逻辑
 */
require("./adapter/abort").installAbortPolyfill();
const { installAdapter } = require("./adapter/index");
const { prepareAssets } = require("./adapter/assets-loader");
const { showBootLoading, setBootProgress, hideBootLoading } = require("./adapter/boot-loading");
const { VERSION, BUILD_NOTE, BUILD_REV } = require("./version.js");

installAdapter();
console.log("[firewood]", VERSION, BUILD_REV || "", BUILD_NOTE);

showBootLoading("加载分包");

prepareAssets((p, text) => setBootProgress(p, text))
  .then((assetBase) => {
    globalThis.__FIREWOOD_ASSET_BASE__ = assetBase;
    globalThis.__FIREWOOD_RUNTIME__ = "minigame";
    console.log("[firewood] asset base =", assetBase, "ver=", VERSION, BUILD_REV || "");
    setBootProgress(1, "启动游戏");
    // WebGL 接管主 canvas 前结束 2D boot loading
    hideBootLoading();
    require("./js/game.bundle.js");
  })
  .catch((err) => {
    console.error("[firewood] boot failed", err && err.stack ? err.stack : err);
    globalThis.__FIREWOOD_ASSET_BASE__ = "subpackages/assets/";
    globalThis.__FIREWOOD_RUNTIME__ = "minigame";
    hideBootLoading();
    try {
      require("./js/game.bundle.js");
    } catch (e2) {
      console.error("[firewood] fallback boot failed", e2 && e2.stack ? e2.stack : e2);
    }
  });
