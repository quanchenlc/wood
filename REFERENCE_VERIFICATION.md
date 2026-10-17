# 原站劈砍逻辑对齐验证

行为基准：`site/screen.toys/firewood/assets/index-C6RyM-i2.js`。

## 已对齐的关键链路

- 输入：6px 拖拽/点击判定、点击 NDC 快照、hover NDC、SETTLING 点击吞掉
- 切点：相机水平右向、500 in³ 两侧约束、1000 in³ 以下中心切、5 英寸厚度保护
- 斧头：双 GLB 层级、`AnimationMixer`、逐帧朝向相机、点击后 0.1 秒执行切割
- 切片：切前 outer/inner 两组、切后 side/top/inner 三组、新切面 UV、重复切割
- 分类：250/500 in³、长宽比 3、RESCUED、`isFirewood/isSplittable`
- 留桩：1 英寸分离、±2° 偏转、150ms bounce、15 英寸邻块反应、凸包 SAT
- 飞出：质量 0.5、3 英寸分离、2 英寸抬升、线性冲量和相机相关角速度
- 时序：SPAWNING/IDLE/SPLITTING/SETTLING/STACKING、500ms 等待、码垛后换新原木

## 10 条场景验证

| # | 输入 | 预期 | 实测 |
|---|---|---|---|
| 1 | 初始原木 | side/top 材质明确，木身无水平 wrap 接缝 | 通过，见 `/tmp/firewood-material-fixed.png` |
| 2 | 树桩 KTX2 材质 | base color 置白，颜色贴图与 emissive 走 sRGB | 通过，树桩不再额外乘灰色 tint |
| 3 | 有动画 GLB 时点击 | 双 GLB 播放，pivot 按相机右向逐帧朝向 | 通过，见 `/tmp/firewood-axe-aligned.png` |
| 4 | 有效点击 | 立即起斧，pending=true，0.1 秒后切开 | 通过；切前 pending=true，切后进入 SETTLING |
| 5 | 沿法线厚度 4 in | 拒绝切割 | 通过，`isTooThinToSplit=true` |
| 6 | 沿法线厚度 6 in | 允许切割 | 通过，`isTooThinToSplit=false` |
| 7 | 12 in 宽、1152 in³，点击靠边 | 自动约束，较小一侧不少于 500 in³ | 通过，切点被夹到中心外约 0.792 in |
| 8 | 250 in³；251 in³/长宽比 2；500 in³/长宽比 3 | 均归为 firewood | 通过 |
| 9 | 251–500 in³ 且长宽比 >3；501 in³ | 前者 RESCUED，后者保持 splittable | 通过 |
| 10 | 连续扫描点击 40 次 | 多碎块留桩、完成至少一次码垛并生成下一根 | 通过，stacked=4，见 `/tmp/firewood-full-cycle-wide.png` |

附加验证：在 SETTLING 状态再次点击，`pendingSplit` 保持 false，点击被消费但不会开始新一刀。

## 保留差异

- three.js 版本比参考 bundle 新，阴影枚举和部分类型签名不同，但不改变劈砍行为。
- 当前码垛类继续使用项目已有的模块化实现；已对齐 60 英寸半径、320° 起始角、
  230° 弧宽、18 英寸层深、400 个 1/60 秒 Planck step、触发条件和飞行动画时序。
- 树桩碰撞体仍由当前 `Physics.addStumpCollider()` 使用圆柱近似；参考站从 data GLB
  读取 collider 后同样转成 16 边圆柱，实际行为等价。
