# 美术套装交付说明（小游戏 switchable art sets）

运行时有 4 套：`set0` 原版 + `set1`/`set2`/`set3` 自有版权方案。  
**同名 pivot/朝向/尺度**；近处砍伐桩/斧/原木保持全质量（见 0.1.9 性能约定）。

当前交付标签：

| id | label |
|----|--------|
| set0 | 原版 |
| set1 | 晨林写实 |
| set2 | 卡通低多边形 |
| set3 | 手绘温馨 |
| set4 | 羊皮纸（中世纪手稿氛围；见 `set4/SOURCES.md`） |

## 目录布局（请按套交付）

```
art-sets/
  set0/   # 可选：对照用；构建默认从 public/assets 生成原版
  set1/
    manifest.json          # 必填
    axe.gltf               # 必填（外置贴图，与现网一致）
    axe.bin
    axe_baseColor.jpg      # ≤1024，JPEG q≥85
    axe_orm.png            # 可选，≤256
    stump.gltf             # 必填，近处砍伐桩（全精度；可含地面盘）
    stump.bin
    stump_baseColor.jpg    # ≤1024
    stump_normal.png       # ≤512 PNG
    stump_lod.gltf         # 远景装饰桩（仅桩体，无地面盘）
    stump_lod.bin
    outsidebark.jpg        # 原木树皮（色图 JPEG）
    outsidebark_n.png      # 法线必须 PNG（勿 JPEG）
    insidegrain.jpg
    insidegrain_n.png
    top.jpg
    top_n.png
    preview.png            # 可选；构建会排除，不进微信分包
  set2/ … 同结构
  set3/ … 同结构
```

> **法线一律 PNG**：`outsidebark_n.png` / `insidegrain_n.png` / `top_n.png` / `stump_normal.png`。  
> set0 历史资源仍为 `*_n.jpg`；**set1–set3 请只交 PNG 法线**。  
> 构建对 set1–3 **原样拷贝**（不重导出、不压贴图）；`preview.png` / `ground.jpg` / `background.gltf` 不要指望进包。

共享（不进 art-set 分包）：`ax_anim_v03_glb.glb`、音频、`stump_v02_data.glb`（远景点位）仍在 set0/`assets`。

构建产物：

| 套装 | 微信分包 |
|------|----------|
| set0 | `subpackages/assets/`（启动必载，含音频等共享） |
| set1 | `subpackages/art-set1/`（按需 `wx.loadSubpackage`） |
| set2 | `subpackages/art-set2/` |
| set3 | `subpackages/art-set3/` |
| set4 | `subpackages/art-set4/` |

主包必须 ≤4MB；每套视觉资源进各自分包（set4 目标 ≤2.5MB）。纹理 MAD 校验只跑 set0。

## manifest.json 格式

```json
{
  "id": "set1",
  "label": "晨林写实",
  "version": 1,
  "files": {
    "axe": "axe.gltf",
    "stump": "stump.gltf",
    "stumpLod": "stump_lod.gltf",
    "barkColor": "outsidebark.jpg",
    "barkNormal": "outsidebark_n.png",
    "endColor": "top.jpg",
    "endNormal": "top_n.png",
    "innerColor": "insidegrain.jpg",
    "innerNormal": "insidegrain_n.png"
  },
  "sky": "#c9dbe8",
  "fog": "#c9dbe8",
  "ground": "#526531",
  "grass": {
    "deep": [0.07, 0.17, 0.05],
    "fresh": [0.26, 0.46, 0.12],
    "dry": [0.4, 0.38, 0.16]
  }
}
```

- 路径均相对**该套根目录**（与 `manifest.json` 同级）。
- 未交付前可用 `"fallback": "set0"`，不放模型文件；客户端会显示本套标签但复用 set0 资源。
- 交付完整套装后**删掉 `fallback`**，并放入上表文件。
- `barkNormal` / `endNormal` / `innerNormal` 必须指向 **`.png`**。
- 可不提供 `groundColor` / `stumpData`：地面用 `ground` 纯色；远景点位复用 set0 的 `stump_v02_data.glb`。

## 约束速查

- 斧 / 近 stump / 原木贴图：勿擅自大幅减面或降分辨率（性能预算见 0.1.9）。
- 远景桩用 `stump_lod`，可与近 stump 共用 `stump_baseColor.jpg` / `stump_normal.png`。
- 采样：ClampToEdge；色图 sRGB JPEG；**法线 PNG ≤512**。
- 客户端热切换会 dispose 旧几何与贴图；pivot/scale 必须与现网一致。
- 画布内套装切换器在**左下角**（避开右下 vConsole / 右上胶囊）。
