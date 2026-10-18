# Parchment UI v3 — 清晰度 / 3D 首屏 / 新手引导

Export: `/workspace/ui-parchment-v2/export/`（v1 备份在 `export_v1/`）
Generators: `src/make_textures_v3.py`, `src/make_mockups_v3.py`, `src/make_compare_v3.py`, `src/build_export_v3.py`
（v2 脚本备份 `src/*_v2.py.bak`）

---

## 1. 为什么糊（根因：代码 + 资源，代码占大头）

### 代码（branch `cursor/wechat-minigame-9515` @ eca182b，0.3.1）
1. **HUD 只有 1.5x 分辨率。** `src/core/renderer.ts:18-19` 小游戏 `maxDpr = 1.5` → 屏幕上唯一的 WebGL 画布只有 1.5x 像素。HUD 是离屏 2D canvas → `CanvasTexture` → 画进这块 1.5x 缓冲（`hud.ts` `WebglOverlayHud.composite`），所以 dpr 3 的 iPhone 上整个 HUD 被系统再 **放大 2 倍**；dpr 2 的手机放大 1.33 倍。这是主要原因，换多清晰的贴图也救不回来。
2. **重复重采样。** `hud.ts:263` HUD 面按 `min(dpr,2)` = 2x 建，再以 `LinearFilter`、无 mipmap 缩到 1.5x 缓冲（2→1.5 非整数比），然后被放大到 3x。
3. **HUD 走了色调映射。** 叠加用 `MeshBasicMaterial`，`toneMapped` 默认 true，而渲染器开了 `NeutralToneMapping`，羊皮纸/墨色对比被压低，发灰发闷。需 `toneMapped = false`。
4. **字太小。** `paint.ts paintEconomyHud`：`scale = min(w/750, h/1334)`，`w` 是 CSS 宽（约 375），于是 scale≈0.5 → 小条 28pt 高、标签 **9px**、数值 12px。9px 中文在任何屏幕上都发虚。
5. **9-slice 角落按 CSS px 算。** `nineSlice.ts drawNineSlice` 把源像素 insets 直接当目标 CSS px 用（角落 1 texel = 1pt），坐标也没对齐设备像素。
6. （小问题）CanvasTexture 没开预乘 alpha，半透明边缘可能有暗边。

### 资源（v1 export）
- 贴图只有显示尺寸的约 1x：panel 400×300 被拉到约 330×420pt，chip 280×64，seal 128，bg 576×1024 被放大。
- PNG 被量化成 **256 色 + Floyd-Steinberg 抖动**，带进噪点，看起来糊。
- 稿子里的文字用了 GaussianBlur 晕墨（只影响效果图，不影响运行时）。

## 2. v3 资源改动
- 全部切片重新生成，按 **@3x 逻辑尺寸**（3 texel/pt，dpr 3 下 1:1）；panel 是 @2x（纸张本身软，控包体）。
- 量化：pngquant q70–95、轻抖动（floyd 0.25）、保留完整 alpha；只有省体积时才替换 PNG-32。不再用 256 色重抖动。
- 文字区的纸纹略作平滑（仅颜色层，边缘和 alpha 不糊），保证运行时墨字清楚。
- 稿子去掉文字模糊，字体用 Noto Sans/Serif CJK，接近 PingFang / 宋体的系统字效果。
- `bg_parchment.jpg` **移出运行时**（放到 `optional/`，JPEG q88，576×1024）：游戏现在直接进 3D，加载页本来就是纯 canvas 程序绘制（`paintParchmentLoading` 不读 bg）。
- 新增：`btn_icon_rank/ad/help.png`（圆形羊皮纸图标钮），引导用的 `guide_bubble.png`（9-slice）、`guide_tail.png`、`guide_hand.png`、`guide_ring.png`。
- 运行时总量 **480 KB**（目标 <600 KB）。

## 3. 客户端必改（清晰度）
优先级从高到低：
1. **屏幕缓冲按设备 dpr 走，3D 单独降分辨率**（推荐）：
   ```ts
   const dpr = Math.min(wx.getSystemInfoSync().pixelRatio || 1, 3);
   renderer.setPixelRatio(dpr);                      // 默认帧缓冲 = 设备分辨率，HUD 画在这里
   const rt = new THREE.WebGLRenderTarget(w*1.5, h*1.5); // 3D 仍按 1.5x 渲（不开 MSAA / composer）
   // 每帧：renderer.setRenderTarget(rt); render(scene,cam); setRenderTarget(null); 全屏 quad 放大 rt；再 composite HUD
   ```
   1170×2532 的 RGBA 缓冲约 12 MB，远低于之前 composer 的 ~1 GB 问题。
   退一步的方案：`maxDpr` 提到 2，并让 HUD 面 = `renderer.getDrawingBufferSize()`（1:1）。最低限度：HUD 面至少别和缓冲尺寸不一致。
2. **HUD 面尺寸 = 绘图缓冲尺寸**（`renderer.getDrawingBufferSize(v)`；`surface.width = v.x`；`ctx.setTransform(v.x/cssW,0,0,v.y/cssH,0,0)`），不再单独 `min(dpr,2)`。纹理设 `generateMipmaps=false`、`minFilter=magFilter=LinearFilter`，1:1 时也可以用 `NearestFilter`。
3. 叠加材质：`toneMapped = false`；建议同时 `texture.premultiplyAlpha = true` + `material.premultipliedAlpha = true`。
4. `ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'`（真机不支持时无害）。
5. **9-slice 按 scale 画**：目标角落 = `insets_px / scale`（pt），即 manifest 的 `nine_slice_insets_pt`。所有 dx/dy/dw/dh 先对齐设备像素：`snap = v => Math.round(v*dpr)/dpr`。整块图标（seal/icon/hand）绘制尺寸 = px / scale。
   ```ts
   drawNineSlice(ctx, img, snap(x), snap(y), snap(w), snap(h), srcInsetsPx, dstInsetsPt)
   ```
6. **字号按 pt 写，别乘 750 比例**：小条高 34pt，标签 12pt（`500 12px "PingFang SC","Noto Sans CJK SC",sans-serif`），数值 16pt（`700 16px "Songti SC","Noto Serif CJK SC",serif`），图标钮文字 11pt 粗体 + 2pt 奶油描边（`strokeText` 再 `fillText`）。全站最小 11pt。canvas 已按 dpr 缩放，所以不要再额外缩小。
7. 修完后真机截图核对：`07_sharpness_before_after.png` 是 dpr-3 设备像素模拟。

## 4. 3D 首屏布局规则（375×812 pt，见 `05_safe_zones.png`）
- **没有首页 / 开始按钮。** 加载（纯 canvas 墨线进度）→ 100% 后 300 ms 淡出 → 直接进 3D，可以立即点木头。去掉 `uiPanel="home"` / `startedPlay=false` 这道门（见 §6）。
- 状态栏 0–44pt 不放 UI。胶囊按钮用 `wx.getMenuButtonBoundingClientRect()` 取位置（iPhone X 上约 281,50–368,82），四周留 8pt 禁区。
- **经济小条**放左上：x=12，第 1 行 y=胶囊 top（约 50），高 34，宽 120/120，间距 6；第 2 行 y=+40：生长倒计时宽 150，加速中（chip_boost）宽 96。右边缘 ≤ 胶囊左 −12（约 268）。
- **图标按钮列**放右侧：48pt 圆钮，x=屏宽−12−48，起点 y=胶囊底+18（约 100），步进 72：好友柴榜 / 看短片加速（可带红色角标，显示今日剩余次数）/ 玩法（重看引导）。文字 11pt 在钮下。
- **底部**：左下美术切换不动（12,758 起，110×34）；右下 vConsole（仅调试）；底部中间 y≈712：`柴棚待取 N · 领取` 纸条按钮（168×40），**不再启动就弹领取面板**（那又是一道门）。用尽/领取面板仍用 panel_vellum，盖在场景上，35–50% 暗遮罩。
- 中间劈砍区（约 92–284 × 270–520pt）保持干净，除了引导不放任何 UI。

## 5. 新手引导规格
**真实操作**（代码 `CameraController` + `GameController.handleInput`）：在木头上**轻点**（pointerup 且拖动 ≤ `clickSlopPx` 6px）→ 斧头落在点击处劈开；**左右拖动**是转视角，不劈。所以第一步写「点一下」，不写「往下划」。

| step | spotlight（暗遮罩 0.58 + 柔边挖洞 + guide_ring / 奶油描边） | 气泡（guide_bubble + guide_tail） | 怎么推进 |
|---|---|---|---|
| 1/3 | 椭圆，框住木头的屏幕投影包围盒（每帧用木头 mesh bbox `project()` 计算；稿中约 84,268–292,508pt） | **点一下木头，劈开它** / 按住左右拖动，可以转着看。尾巴朝下指木头 | 可交互：点击和拖动正常传给游戏。**第一次劈开成功**（split 结算）后等 600 ms 进入 2/3。guide_hand 指尖在木头顶面中心，0.9 s 循环：缩到 0.9 + 下压 3pt + 墨色涟漪 |
| 2/3 | 圆角矩形框住「剩余树根」+「生长倒计时」两个小条 | **树根每天有限，砍完会慢慢长回来** / 看「剩余树根」和「生长倒计时」。尾巴朝上 | 点任意处 →（下方提示「轻点任意处继续」） |
| 3/3 | 圆角矩形框住右侧「好友柴榜」「看短片加速」 | **看短片，树根长得更快** / 好友柴榜：比比谁砍得多。尾巴朝右 | 皮革按钮 **知道了，开砍！** 或点任意处 → 完成 |

- 所有步骤底部中间都有 **跳过 ›**（纸条按钮 84×32 @ y≈712，引导期间这里不显示领取条）。
- **触发条件**：只在首次启动、加载完成后，且没有引导标记时。标记存在 `wx.setStorageSync('fw_guide_v1', 'done'|'skipped')`（web 用 localStorage），完成或跳过都写。之后可以从「玩法 ?」重看。
- 如果开局 `daily_remaining = 0`，直接从 2/3 开始。引导期间不弹领取/用尽面板（排队到引导结束后）；美术切换照常显示。
- 动效：遮罩和气泡 200 ms 淡入，步骤之间 150 ms 交叉淡化。全程最短约 10–15 s，第 1 步本身就是在玩。
- 埋点（给后端）：`guide_step_view{step}`、`guide_complete`、`guide_skip{step}`。
- 文字全部运行时绘制（serif 16pt 标题 / sans 12pt 副标题，墨色 #3a2a18 / #5c4a32），贴图上不带字。

## 6. 客户端代码改动清单（不只美术）
- `src/main.ts:83,433`：`uiPanel` 初始值改 `"none"`；`boot()` 结束时 `startedPlay = true; economy.settle();`。不要 `openClaimIfNeeded()` 自动弹面板，改成在 HUD 上显示领取纸条（pending>0 时）。`rank_close/dismiss` 一律回到 `"none"`。
- `src/ui/parchment/paint.ts`：`paintHomePanel` / `"start"` 命中不再使用；`paintEconomyHud` 改成 pt 布局（§4）；新增 `paintIconColumn`、`paintClaimStrip`、`paintGuide(step, targetRect)`；`showHint()` 里的老提示条「← 拖动旋转 → · 点击劈开」由引导第 1 步替代（引导完成后不再显示）。
- `src/ui/parchment/assets.ts`：KEYS 去掉 `bg_parchment.jpg`，加入新文件；`NINE_SLICE` 改为同时带 `src`（px）和 `dst`（pt）insets，或者直接读 `manifest.json`。
- `src/ui/parchment/nineSlice.ts`：拆成 src/dst insets，并做设备像素对齐（§3.5）。
- `src/platform/hud.ts` + `src/core/renderer.ts`：dpr 和合成相关改动（§3.1–3.4）。

## 7. 素材来源（公有领域 / CC0，来自 Wikimedia Commons，和 v2 相同）
致谢页一句话：
> Background & panel vellum from Wikimedia Commons PD scans — “Old paper1.jpg”, Towneley Lectionary blank page (NYPL); leather from “Leather brown.jpg” (PD); wax seal from “1778 wax seal of merchant guild in Sombor.jpg” (PD). Processed into UI slices; no third-party trademarks.

- panel / strip / chip / chip_boost / guide_bubble / 图标钮圆盘：Towneley Lectionary 空白羊皮纸页（NYPL，PD）
- btn_leather / ribbon_madder：“Leather brown.jpg”（PD）
- seal_wax：1778 Sombor 商会火漆印（PD）。仍保留历史拉丁铭文和船纹，如果审核要求印面无字，可以换成空白火漆。
- 图标线稿（三段原木 + 小旗、卷轴播放、问号）、guide_hand（中世纪袖口指点手）、guide_ring、guide_tail：自绘程序生成，自有版权。问号来自 Noto Serif CJK 字形（OFL，栅格化输出不受限）。
- 稿中字体：Noto Sans/Serif CJK（OFL），只用于效果图；运行时用系统字体。

## 8. 注意
- 效果图背景是真实游戏截图（`art-sets/_checks/set1_02-start-idle.png`，旧的提示条已修掉）。胶囊、vConsole、状态栏是示意。
- 效果图按 @2x（750×1624）出；切片是 @3x，按 pt insets 缩放后合成，和正确的客户端做法一致。
