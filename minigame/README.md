# 劈柴模拟器 — 微信小游戏

原生微信小游戏运行时 + three.js，**不使用 Cocos / 其它游戏引擎**。
游戏逻辑与 Web 版共用 `../src`，本目录提供适配层、分包素材与打包脚本。

## 换 AppID

只改 [`app.config.cjs`](./app.config.cjs) 里的 `WECHAT_APPID`，然后重新执行构建；`project.config.json` 会自动同步。当前为正式号 `wx3371f99b1b0e73d1`。

可选：设置 `REMOTE_ASSET_BASE` 把大 GLB 等放到 CDN。

## 构建

```bash
# 在仓库根目录
npm run build:minigame
```

产物：

| 路径 | 说明 |
|---|---|
| `game.js` / `game.json` / `project.config.json` | 小游戏入口与工程配置 |
| `adapter/` | wx → BOM/DOM 适配层 |
| `js/game.bundle.js` | 共享源码打包 |
| `subpackages/assets/` | 贴图 / 模型 / 音频 / basis（分包，不进主包） |
| `size-report.json` | 主包 / 分包体积报告 |

用[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)打开 **`minigame/`** 目录即可预览（游客 AppID）。

## 本地仿真 harness（无开发者工具时）

```bash
npm run build:minigame
npm run harness:minigame          # http://127.0.0.1:5188/harness/index.html
npm run capture:minigame          # 无头截图 + 录屏
```

Harness 会注入 `wx` shim，但**实际执行的是 `minigame/game.js` 入口**，不是 Web 的 `index.html`。

## 包体策略

- 主包：适配层 + `game.bundle.js`（目标 ≤ 4MB）
- 分包 `assets`：全部 GLB / 贴图 / 音频 / basis transcoder
- 可选远程：`REMOTE_ASSET_BASE` + `REMOTE_ASSET_FILES`

## 已知风险（真机需再验）

1. **KTX2 / basis WASM**：依赖 Worker + `WebAssembly`；真机需 `WXWebAssembly`，部分基础库对 Blob Worker 不友好。
2. **WebAudio**：当前仍走 `THREE.Audio`；若某机型无 AudioContext，需改 `wx.createInnerAudioContext`。
3. **EffectComposer / 浮点纹理**：低端 GPU 可能降级或掉帧。
4. Harness ≠ 真机：输入、音频策略、包内读文件、WASM 路径都可能不同。
