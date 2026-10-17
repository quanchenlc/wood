/**
 * 微信小游戏入口。
 * 1) 安装 BOM/DOM 适配层
 * 2) 加载素材分包 / 远程资源
 * 3) 启动打包后的共享游戏逻辑
 */
const { installAdapter } = require("./adapter/index");
const { prepareAssets } = require("./adapter/assets-loader");
const { VERSION, BUILD_NOTE, BUILD_REV } = require("./version.js");

installAdapter();
console.log("[firewood]", VERSION, BUILD_REV || "", BUILD_NOTE);

prepareAssets()
  .then((assetBase) => {
    globalThis.__FIREWOOD_ASSET_BASE__ = assetBase;
    globalThis.__FIREWOOD_RUNTIME__ = "minigame";
    console.log("[firewood] asset base =", assetBase, "ver=", VERSION, BUILD_REV || "");
    require("./js/game.bundle.js");
  })
  .catch((err) => {
    console.error("[firewood] boot failed", err && err.stack ? err.stack : err);
    // 兜底：仍尝试用默认分包路径启动，避免白屏
    globalThis.__FIREWOOD_ASSET_BASE__ = "subpackages/assets/";
    globalThis.__FIREWOOD_RUNTIME__ = "minigame";
    try {
      require("./js/game.bundle.js");
    } catch (e2) {
      console.error("[firewood] fallback boot failed", e2 && e2.stack ? e2.stack : e2);
    }
  });
