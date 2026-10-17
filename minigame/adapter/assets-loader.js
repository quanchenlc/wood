const config = require("../app.config.js");

/**
 * 加载素材分包，并按需把大文件从远程拉到本地用户目录。
 * 返回最终素材根路径（末尾带 /），供 __FIREWOOD_ASSET_BASE__ 使用。
 * 远程下载完成后返回本地缓存路径，不再返回 CDN 地址。
 * 进度通过 onProgress(0..1, statusText) 回调，由 canvas HUD 绘制（不用系统 UI）。
 */
function loadSubpackage(name, onProgress) {
  return new Promise((resolve, reject) => {
    if (typeof wx === "undefined" || !wx.loadSubpackage) {
      // harness：分包文件已直接放在可访问路径，跳过
      onProgress?.(1, "资源就绪");
      resolve();
      return;
    }
    const task = wx.loadSubpackage({
      name,
      success: () => {
        onProgress?.(1, "分包就绪");
        resolve();
      },
      fail: (err) => reject(err),
    });
    if (task && task.onProgressUpdate) {
      task.onProgressUpdate((res) => {
        const p =
          typeof res.progress === "number"
            ? res.progress / 100
            : typeof res.totalBytesExpectedToWrite === "number" && res.totalBytesExpectedToWrite > 0
              ? res.totalBytesWritten / res.totalBytesExpectedToWrite
              : 0;
        onProgress?.(Math.max(0, Math.min(1, p)), "下载分包");
      });
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

async function ensureRemoteAssets(localBase, onProgress) {
  const remoteBase = (config.REMOTE_ASSET_BASE || "").trim();
  if (!remoteBase) return localBase;

  const files = config.REMOTE_ASSET_FILES || [];
  if (!files.length) {
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

  let i = 0;
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
      onProgress?.(i / Math.max(1, files.length), "下载资源");
      await downloadRemoteFile(url, dest);
    }
    i += 1;
    onProgress?.(i / Math.max(1, files.length), "下载资源");
  }

  return userRoot.endsWith("/") ? userRoot : `${userRoot}/`;
}

async function prepareAssets(onProgress) {
  const subName = config.ASSETS_SUBPACKAGE || "assets";
  onProgress?.(0, "加载分包");
  await loadSubpackage(subName, onProgress);

  let localBase = config.LOCAL_ASSET_BASE || "subpackages/assets/";
  if (typeof globalThis !== "undefined" && globalThis.__HARNESS_CANVAS__) {
    localBase = `/${localBase.replace(/^\//, "")}`;
  }
  const base = await ensureRemoteAssets(localBase, onProgress);
  onProgress?.(1, "准备完成");
  return base.endsWith("/") ? base : `${base}/`;
}

module.exports = { prepareAssets, loadSubpackage };
