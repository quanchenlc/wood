/** 单套美术资源清单（相对该套根目录） */
export interface ArtSetFileMap {
  axe?: string;
  stump?: string;
  stumpLod?: string;
  stumpData?: string;
  barkColor?: string;
  barkNormal?: string;
  endColor?: string;
  endNormal?: string;
  innerColor?: string;
  innerNormal?: string;
  /** 可选近地贴图；缺省用 solid ground 色 */
  groundColor?: string;
}

export interface ArtSetGrassColors {
  deep: [number, number, number];
  fresh: [number, number, number];
  dry: [number, number, number];
}

export interface ArtSetManifest {
  id: string;
  label: string;
  version: number;
  /**
   * 未交付完整文件时可指向已加载套（通常 set0）。
   * 有 fallback 时 files 可空，切换只换标签/持久化，资源仍用 fallback。
   */
  fallback?: string;
  files?: ArtSetFileMap;
  sky?: string;
  fog?: string;
  ground?: string;
  grass?: ArtSetGrassColors;
}

export type ArtSetId = "set0" | "set1" | "set2" | "set3";

export interface ArtSetCatalogEntry {
  id: ArtSetId;
  label: string;
  /** 微信分包名；set0 复用主素材分包 assets */
  subpackage: string | null;
  /** 分包内根路径（相对小游戏根，末尾 /） */
  root: string;
}
