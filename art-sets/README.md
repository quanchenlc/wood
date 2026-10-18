# 美术套装交付说明（小游戏 switchable art sets）

运行时有 4 套：`set0` 原版 + `set1`/`set2`/`set3` 自有版权方案。  
**同名 pivot/朝向/尺度**；近处砍伐桩/斧/原木保持全质量（见 0.1.9 性能约定）。

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
    stump.gltf             # 必填，近处砍伐桩（全精度）
    stump.bin
    stump_baseColor.jpg    # ≤1024
    stump_normal.png       # ≤512 PNG
    stump_lod.gltf         # 强烈建议：远景桩；若缺，构建会尝试从 stump 简化
    stump_lod.bin
    stump_v02_data.glb     # 可选；缺则用原版摆放点
    outsidebark.jpg        # 原木树皮（色图 JPEG）
    outsidebark_n.png      # 法线必须 PNG（勿 JPEG）
    insidegrain.jpg
    insidegrain_n.png
    top.jpg
    top_n.png
    ground.jpg             # 可选；近处地面色图（≤1024）
    sky.jpg                # 可选；暂未接全景，可先省略
  set2/ … 同结构
  set3/ … 同结构
```

> **法线一律 PNG**：`outsidebark_n.png` / `insidegrain_n.png` / `top_n.png` / `stump_normal.png`。  
> set0 历史资源仍为 `*_n.jpg`；**set1–set3 请只交 PNG 法线**。构建会保留 `.png` 扩展名并缩到 ≤512，不会压成 JPEG。

构建产物：

| 套装 | 微信分包 |
|------|----------|
| set0 | `subpackages/assets/`（启动必载，含音频等共享） |
| set1 | `subpackages/art-set1/`（按需 `wx.loadSubpackage`） |
| set2 | `subpackages/art-set2/` |
| set3 | `subpackages/art-set3/` |

主包必须 ≤4MB；每套视觉资源进各自分包。

## manifest.json 格式

```json
{
  "id": "set1",
  "label": "方案1",
  "version": 1,
  "files": {
    "axe": "axe.gltf",
    "stump": "stump.gltf",
    "stumpLod": "stump_lod.gltf",
    "stumpData": "stump_v02_data.glb",
    "barkColor": "outsidebark.jpg",
    "barkNormal": "outsidebark_n.png",
    "endColor": "top.jpg",
    "endNormal": "top_n.png",
    "innerColor": "insidegrain.jpg",
    "innerNormal": "insidegrain_n.png",
    "groundColor": "ground.jpg"
  },
  "sky": "#9fc4e0",
  "fog": "#9fc4e0",
  "ground": "#3f4a26",
  "grass": {
    "deep": [0.07, 0.17, 0.05],
    "fresh": [0.24, 0.45, 0.11],
    "dry": [0.34, 0.36, 0.14]
  }
}
```

- 路径均相对**该套根目录**（与 `manifest.json` 同级）。
- 未交付前可用 `"fallback": "set0"`，不放模型文件；客户端会显示本套标签但复用 set0 资源（便于测切换器）。
- 交付完整套装后**删掉 `fallback`**，并放入上表文件。
- `barkNormal` / `endNormal` / `innerNormal` 必须指向 **`.png`**。

## 约束速查

- 斧 / 近 stump / 原木贴图：勿擅自大幅减面或降分辨率（性能预算见 0.1.9）。
- 远景桩用 `stump_lod`，可与近 stump 共用 `stump_baseColor.jpg` / `stump_normal.png`。
- 采样：ClampToEdge；色图 sRGB JPEG；**法线 PNG ≤512**。
- 客户端热切换会 dispose 旧几何与贴图；pivot/scale 必须与现网一致。
- 画布内套装切换器在**左下角**（避开右下 vConsole / 右上胶囊）。
