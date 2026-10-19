/**
 * ========== 微信小游戏可改配置（唯一入口，仅给 Node 构建用）==========
 * 换成正式 AppID 时，只改下面的 WECHAT_APPID。
 * 构建脚本会同步到 project.config.json，并生成运行时用的 app.config.js。
 * 真机 / 适配层不要 require 本文件（微信不识别 .cjs）。
 */
module.exports = {
  /** 微信小游戏 AppID（换号只改这一处；构建会同步到 project.config.json） */
  WECHAT_APPID: "wx3371f99b1b0e73d1",

  /**
   * 远程素材根 URL（可选）。非空时，大文件优先走远程下载到本地缓存。
   * 例: "https://cdn.example.com/firewood/"
   * 留空则使用分包内本地文件。
   */
  REMOTE_ASSET_BASE: "",

  /** 需要优先远程拉取的相对路径（相对素材根；下载后走本地缓存路径） */
  REMOTE_ASSET_FILES: [
    "assets/stump.gltf",
    "assets/stump.bin",
    "assets/stump_baseColor.jpg",
    "assets/stump_normal.jpg",
    "assets/stump_top.jpg",
  ],

  /** 分包名，对应 game.json subpackages */
  ASSETS_SUBPACKAGE: "assets",

  /** 分包加载后的本地素材根（相对小游戏根目录，末尾 /） */
  LOCAL_ASSET_BASE: "subpackages/assets/",
};
