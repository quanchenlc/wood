const config = require("../app.config.js");

/**
 * 加载素材分包，并按需把大文件从远程拉到本地用户目录。
 * 返回最终素材根路径（末尾带 /），供 __FIREWOOD_ASSET_BASE__ 使用。
 * 远程下载完成后返回本地缓存路径，不再返回 CDN 地址。
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

function ensureDir(fs, dir) {
  try {
    fs.accessSync(dir);
  } catch {
    try {
      fs.mkdirSync(dir, true);
    } catch {
      try {
        fs.mkdirSync(dir);
      } catch {
        /* ignore */
      }
    }
  }
}

async function ensureRemoteAssets(localBase) {
  const remoteBase = (config.REMOTE_ASSET_BASE || "").trim();
  if (!remoteBase) return localBase;

  const files = config.REMOTE_ASSET_FILES || [];
  if (!files.length) {
    // 配置了远程根但没有文件列表：仍返回本地分包根（不直接指 CDN）
    return localBase;
  }

  const userRoot =
    typeof wx !== "undefined" && wx.env && wx.env.USER_DATA_PATH
      ? `${wx.env.USER_DATA_PATH}/firewood_assets`
      : null;

  if (!userRoot) {
    console.warn("[assets] USER_DATA_PATH missing; keep local subpackage base");
    return localBase;
  }

  const fs = wx.getFileSystemManager();
  ensureDir(fs, userRoot);

  for (const rel of files) {
    const clean = rel.replace(/^\//, "");
    const url = `${remoteBase.replace(/\/$/, "")}/${clean}`;
    const dest = `${userRoot}/${clean}`;
    const dir = dest.replace(/\/[^/]+$/, "");
    ensureDir(fs, dir);
    let exists = false;
    try {
      fs.accessSync(dest);
      exists = true;
    } catch {
      exists = false;
    }
    if (!exists) {
      console.log("[assets] downloading", url, "→", dest);
      await downloadRemoteFile(url, dest);
    }
  }

  // 关键：返回本地用户目录镜像根，loader 用本地路径读缓存文件
  return userRoot.endsWith("/") ? userRoot : `${userRoot}/`;
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
