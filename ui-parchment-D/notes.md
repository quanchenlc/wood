# D 抽屉 · 紧急修图 D_fix_v2

真机竖缝 + 纸面发糊的根因：旧 `drawer_vellum` 只有 200×140pt，九宫格拉到约 431×424pt，右端接缝和糊都是拉伸造成的。本目录用 **无缝 paper_tile + 独立 tear_edge** 替换纸身九宫格。

老板已拍板：@2x/@3x 进 ui-parchment 分包按 dpr 加载，不为主包 600KB 压画质；风格入口只保留「风格：… 〉」行；好友柴榜改为**抽屉内第二页**（与风格列表同模型，非弹层）。

## 目录
| 路径 | 内容 |
|---|---|
| `textures/` | 运行时切片；无 `drawer_vellum`、无 `btn_icon_style` |
| `manifest.json` | v3.1 规则合并清单（顶层=@2x） |
| `manifest_validation.md` | 脚本校验 **PASS** |
| `spec/portrait_drawer.png` | 竖屏展开标注 |
| `spec/landscape_drawer.png` | 横屏近铺满标注（812×375pt） |
| `spec/portrait_rank.png` | 竖屏 · 抽屉内柴榜页 |
| `spec/landscape_rank.png` | 横屏 · 抽屉内柴榜页 |
| `spec/portrait_style.png` | 竖屏 · 抽屉内风格页 |
| `spec/*_clean.png` | 无标注成品 |
| `guide/` `motion/` | 沿用 D_final 引导与卷开动效关键帧（撕口高改为 32pt，见 interaction） |
| `interaction.md` | 交互（含柴榜内页、纸面合成） |
| `src/` | 生成脚本 |

## 接缝原因与新画法（客户端必读）

**旧：** `drawer_vellum` 九宫格，左右 inset 28pt 在宽屏被拉出竖缝；纸心分辨率不够 → 糊。

**新合成（每帧）：**
1. 纸身矩形：`paper_tile` **cover 或 tile** 填满（禁止九宫格纸心）。竖屏可用 cover；横屏 812pt 宽建议 **tile**（@3x 1024²，约 0.8 次水平重复），单张 cover 放大勿超过 ~1.5×。
2. 展开动画：对「纸身+撕口」整体做 **高度裁切** `clipH`（与 D_final §5 相同），纸纹不拉伸、不游动。
3. `tear_edge`：贴在纸身底边，上叠约 10pt；**仅左右九宫格**，高度固定 **32pt**；源逻辑宽 812pt（覆盖横屏）。
4. `roll_paper` + `roll_shadow`：滚筒中心在 `clipH`；p→1 时淡出，露出撕口。小签挂在滚筒/撕口下沿。

```
┌─────────────────────────────┐
│ paper_tile (cover / tile)   │  ← clip top portion while animating
│                             │
│············ tear overlap····│
├──────── tear_edge ──────────┤  ← 9-slice L/R only, h=32pt
│  (roll sits on clip edge)   │
└────────── tag ──────────────┘
```

## 切片 KB
| 切片 | 逻辑 pt | @2x | @3x | 说明 |
|---|---|---|---|---|
| paper_tile | 512² 参考 | 512² · 21.4KB JPG | 1024² · 91.2KB JPG | 无缝；无 alpha |
| tear_edge | 812×32 | 1624×64 · 18.2KB | 2436×96 · 31.6KB | 九宫格 L/R 48pt |
| （其余沿用 D_final，已删 style/vellum） | | | | |

- **@2x 套：313.8 KB**
- **@3x 套：466.8 KB**（panel_vellum 仅 @2x）
- 两套合计约 781 KB；按分包 dpr 只加载一套即可。
- 新增 tile+tear 合计 @2x 39.6 / @3x 122.8 KB，远小于一张横屏整图。

## 已删除
- `drawer_vellum`（全部）
- `btn_icon_style`（客户端确认未绘制；风格只走条）

## 布局要点
- 竖屏：三统计 → 免费领取 → 三圆钮（榜/加速/玩法）→ 风格行。加速中写在第三列「下一根 00:50 · 加速中」。
- 横屏 812×375：近铺满（顶/底各 8pt）；内容重排避刘海与胶囊；统计横排、领取避胶囊、三钮+风格居中。
- **好友柴榜**：抽屉内页，「‹ 返回」回首页；sharedCanvas 按 dpr 建，嵌在内容区。旧 e_rank 弹层废弃。
- 用尽文案：日配额 →「明天 0 点恢复」；临时无根 → 显示生长倒计时。

## 素材来源
- 纸纹：程序周期噪声 + Towneley / oldpapertex 高频纤维（PD），无品牌/文字。
- 其余切片同源 D_final / ui-parchment-v2。

## 待客户端 0.3.5
1. 换纸面绘制路径（tile/cover + tear + roll）。
2. 柴榜改为抽屉内页。
3. 删 btn_icon_style 引用。
4. 真机验收：竖屏满宽、横屏铺满、无竖缝、字 ≥11pt。
