# D 抽屉 · D_fix_v3（0.3.6 复核修正）

基于 D_fix_v2 复制后修改，D_fix_v2 原样保留。复核报告：`/workspace/shots-036/review/review.md`。

## 相对 v2 的变更（changelog）
| # | 项 | v2 | v3 | 对应复核 |
|---|---|---|---|---|
| 1 | `tear_edge` | 上 2/3 不透明的拉丝纸，无渐隐，齿口软羽化 | 顶 **14pt 渐隐→透明**；纸纹取自 paper_tile（256pt 同尺度，预拉宽 2.2× 抵消竖屏压缩），低对比；**硬边齿口**（1px 抗锯齿 + 0.5pt 墨线 + 2pt 焦边）；**独立 3pt 柔影**，只在纸外。尺寸 812×32pt、insets [48,0,48,0] 不变 | P0-1、P2-1 |
| 2 | 撕口叠放 | tear_top = paperBottom − 10 | **−16pt**（渐隐区必须全在纸上） | P0-1 |
| 3 | `paper_tile` | logical 512（与 scale 矛盾）；@3x 1024²=341pt | **logical 256pt**；@2x 512² / @3x **768²**，两档同为 256pt 一格；无缝，无明显周期 | P1-1 |
| 4 | 纸面绘制 | cover 或 tile | **只平铺 1 texel = 1 设备 px，禁止 cover**（0.3.6 柴榜页 cover 放大 1.82× 导致发糊） | P1-1 |
| 5 | `strip_parchment` | 中央大块污渍，拉宽后拖影 | 去掉大污渍；中段 208pt 横向无缝：可 stretch（≤2.2× 已验证）或 repeat-x；尺寸和 insets 不变 | P1-8 |
| 6 | `row_self_highlight` | 无 | **新增** 343×52pt，九宫格 [12,12,12,12]pt，浅羊皮纸半透明 + 6pt 圆角，用于固定页脚「我」 | P1-4 |
| 7 | 横屏规范 | 顶/底 8pt；左 24；小签被切 | 纸面 y=0 起；撕口下沿 **318pt**；小签 **318–350**；左 = safeArea.left+16 = **60**；右 ≤ 698；无说明文字；「N 根」；视口渐隐和 52pt 页脚 | P1-5/6/7、P2-5/7 |
| 8 | 竖屏柴榜规范 | 硬裁切，无页脚 | 视口 132–500 上下 16pt 渐隐；固定 52pt「我」页脚 508–560；顶栏 top = 胶囊底 + 12（字顶 ≥94）；撕口 600pt | P1-2/3、P2-4/6 |
| 9 | 新增 | — | `spec/landscape_style(.png/_clean)`；`portrait_style_clean.png` | — |

### v3b · 2026-10-19 11:25（UTC+8）· 0.4.2 复核 P2-5
| # | 项 | v3a | v3b |
|---|---|---|---|
| 10 | `tear_edge@2x/@3x` 纸纹对比度 | 0.4：齿口上方 6–14pt 的纹理标准差约 1.1（真机 1.04–1.10），纸面约 3.0，看起来是一条更平的带子 | **1.0**（等于 paper_tile 原对比度）：该带纹理标准差 @3x 2.62（横屏）/ 2.87（竖屏），@2x 2.89 / 2.90；纸面 2.93–3.03。均色不变（Δ<1）。只改纹理，几何不变：812×32pt、insets [48,0,48,0]、顶 14pt 渐隐、叠放 −16pt、齿口和阴影都不变 |

说明：0.75 实测只能到 2.14 / 2.30（横向预拉宽 2.2× 会吃掉一部分细纹），所以取 1.0。旧文件：`backup/tear_edge@{2x,3x}_v3a.png`，旧对比图 `backup/before_after_tear_junction_v3a.png`。测量脚本：`src/qa_tear_texture.py` + `src/texmetric.py`（逐行亮度标准差，取干净列，与真机截图同一口径）。客户端换图即可，无需改代码。

## 客户端要点（必读）
1. **纸身**：`paper_tile` 平铺，cell = 贴图 px ÷ dpr = 256pt；从抽屉原点平铺，不随 clipH 或抽屉高度缩放；禁止 cover 和九宫格。
2. **撕口**：`tear_edge` 顶 = 纸身底 − 16pt；只拉左右，中段 stretch；高 32pt；阴影已烘焙在条内，不要再加。
3. **strip_parchment**：中段可 stretch 或 repeat-x（中段 208pt 横向无缝）。横屏选中行 ≤ 300pt。
4. **柴榜**：sharedCanvas = 视口 pt × dpr；上下 16pt 渐隐；「我」固定页脚始终显示。
5. **横屏**：撕口下沿 = windowHeight − safeArea 底部 − 36；内容左 = safeArea.left + 16。

## 目录
| 路径 | 内容 |
|---|---|
| `textures/` | 运行时切片（19 项，@2x/@3x；panel_vellum 仅 @2x） |
| `manifest.json` | v3.1 合并清单（顶层 = @2x，每个变体都满足 px/scale = logical_size），含 `changelog_vs_v2` |
| `manifest_validation.md` | 严格校验 **PASS**（40 行 PASS / 0 FAIL；v2 中 paper_tile 的豁免已删除） |
| `spec/portrait_{drawer,rank,style}(.png/_clean.png)` | 竖屏标注稿和成品 |
| `spec/landscape_{drawer,rank,style}(.png/_clean.png)` | 横屏标注稿和成品（812×375pt） |
| `qa/before_after_tear_junction.png` | 撕口和纸面交界的前后对比（0.3.6 真机 / v2 素材 / v3 素材） |
| `qa/after_junction_{p,l}_x2.png` | v3 交界 2× 放大（竖屏压缩 / 横屏 1:1） |
| `qa/qa_strip_row_at3x.png` | strip 原尺寸 / 36pt 高 / 拉伸 2.2× / 平铺，以及「我」行 |
| `qa/qa_paper_tiled_*` | 纸纹 768² 平铺，周期检查 |
| `guide/` `motion/` | 沿用 v2，未改。关键帧里的撕口仍是 v2 外观，仅作时序参考 |
| `src/make_v3_assets.py` | v3 切片生成；`make_specs.py` 生成规范图；`build_manifest.py` 生成清单并校验；`qa_*.py` 生成 QA 图 |

## 验证
- 交界处无接缝（v3b）：渐隐和叠放区 100–119pt 的最大行均值跳变 @3x 0.37（横屏）/ 0.41（竖屏），@2x 0.34 / 0.60；纸面内部 0.26–0.29，同量级；v2 素材在真机上是明显的纹理带（见 qa 对比图）。
- paper_tile 无缝：原图卷绕处差值 1.00，内部相邻差值 0.90；JPEG 后卷绕处 1.47，与 JPEG 块边界的 1.28 相当，肉眼不可见。
- 平铺周期：纸纹没有可辨认的斑块地标（异常值已做 tanh 压缩），横屏 812pt 宽重复约 3.2 次，看不出重复。
- 色调：纸面均色约 (215,192,151)，和 v2、真机一致；撕口不透明区和纸面均色差 < 1。

## 切片体积（KB）
| 切片 | @2x | @3x | v2 @2x / @3x |
|---|---|---|---|
| paper_tile | 22.2（512²） | 41.7（768²） | 21.4 / 91.2 |
| tear_edge | 22.0 | 38.9 | v3a 21.1 / 36.4 |
| strip_parchment | 22.3 | 45.0 | 28.0 / 52.5 |
| row_self_highlight（新） | 1.2 | 1.7 | — |
| **整套** | **314.0** | **418.8** | 313.8 / 466.8 |

整套 @3x 比 v2 少 48.0KB。两套合计 732.8KB；按 dpr 分包只加载一套。

## 素材来源
程序生成噪声，加 Towneley 扫描（PD）的高频纤维。无品牌、文字或标志。
