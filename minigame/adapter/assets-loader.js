const config = require("../app.config.cjs");

/**
 * 加载素材分包，并按需把大文件从远程拉到本地用户目录。
 * 返回最终素材根路径（末尾带 /），供 __FIREWOOD_ASSET_BASE__ 使用。
 */
function loadSubpackage(name) {
  return new Promise((resolve, reject) => {
    if (typeof wx === "undefined" || !wx.loadSubpackage) {
      // harness：分包文件已直接放在可访问路径，跳过
      resolve();
      return;
    }
    const task = wx.loadSubpackage({
      name,
      success: () => resolve(),
      fail: (err) => reject(err),
    });
    if (task && task.onProgressUpdate) {
      task.onProgressUpdate(() => {});
    }
  });
}

function downloadRemoteFile(url, filePath) {
  return new Promise((resolve, reject) => {
    if (typeof wx === "undefined" || !wx.downloadFile) {
      reject(new Error("wx.downloadFile unavailable"));
      return;
    }
    wx.downloadFile({
      url,
      filePath,
      success: (res) => {
        if (res.statusCode === 200) resolve(filePath);
        else reject(new Error(`download ${url} -> ${res.statusCode}`));
      },
      fail: reject,
    });
  });
}

async function ensureRemoteAssets(localBase) {
  const remoteBase = (config.REMOTE_ASSET_BASE || "").trim();
  if (!remoteBase) return localBase;

  const files = config.REMOTE_ASSET_FILES || [];
  if (!files.length) return remoteBase.endsWith("/") ? remoteBase : `${remoteBase}/`;

  // 下载到用户目录后，素材根改为用户目录下的镜像
  const userRoot =
    typeof wx !== "undefined" && wx.env && wx.env.USER_DATA_PATH
      ? `${wx.env.USER_DATA_PATH}/firewood_assets`
      : null;

  if (!userRoot) {
    // 无用户目录时直接用远程 URL 作为根（XHR/fetch 走 http）
    return remoteBase.endsWith("/") ? remoteBase : `${remoteBase}/`;
  }

  const fs = wx.getFileSystemManager();
  try {
    fs.accessSync(userRoot);
  } catch {
    fs.mkdirSync(userRoot, true);
  }

  for (const rel of files) {
    const url = `${remoteBase.replace(/\/$/, "")}/${rel.replace(/^\//, "")}`;
    const dest = `${userRoot}/${rel.replace(/^\//, "")}`;
    const dir = dest.replace(/\/[^/]+$/, "");
    try {
      fs.accessSync(dir);
    } catch {
      fs.mkdirSync(dir, true);
    }
    let exists = false;
    try {
      fs.accessSync(dest);
      exists = true;
    } catch {
      exists = false;
    }
    if (!exists) {
      console.log("[assets] downloading", url);
      await downloadRemoteFile(url, dest);
    }
  }

  // 远程只覆盖大文件；其余仍走分包。返回分包根，大文件路径由调用方按需改写。
  // 简化：若配置了远程，把整个根指到远程（纹理/音频也走 CDN）。
  return remoteBase.endsWith("/") ? remoteBase : `${remoteBase}/`;
}

async function prepareAssets() {
  const subName = config.ASSETS_SUBPACKAGE || "assets";
  await loadSubpackage(subName);

  let localBase = config.LOCAL_ASSET_BASE || "subpackages/assets/";
  // harness 页面在 /harness/ 下，相对路径会错解析到 /harness/subpackages/...
  // 浏览器仿真改用站点根绝对路径；真机微信仍用包内相对路径。
  if (typeof globalThis !== "undefined" && globalThis.__HARNESS_CANVAS__) {
    localBase = `/${localBase.replace(/^\//, "")}`;
  }
  const base = await ensureRemoteAssets(localBase);
  return base.endsWith("/") ? base : `${base}/`;
}

module.exports = { prepareAssets, loadSubpackage };
