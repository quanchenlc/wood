/**
 * 音效包：pack1–4 按需分包；legacy = public/assets/sounds（0.4.5 内置「旧版」）。
 * 默认 pack1（原味）。失败时静默回退到内置，不用 wx.show*。
 */

import { assetUrl, isMinigame } from "../platform/env";
import type { SoundGroup } from "../config/assets";

export type SoundPackId = "pack1" | "pack2" | "pack3" | "pack4" | "legacy";

export const STORAGE_KEY_SOUND_PACK = "fw_sound_pack";

export const SOUND_PACK_CATALOG: readonly {
  id: SoundPackId;
  label: string;
  /** 微信分包名；legacy 无分包 */
  subpackage: string | null;
  /** 运行时文件根（相对小游戏包 / Web public） */
  root: string | null;
  color: string;
}[] = [
  {
    id: "pack1",
    label: "原味",
    subpackage: "sounds-pack1",
    root: "subpackages/sounds-packs/pack1/",
    color: "#8a7355",
  },
  {
    id: "pack2",
    label: "清脆",
    subpackage: "sounds-pack2",
    root: "subpackages/sounds-packs/pack2/",
    color: "#6b8a55",
  },
  {
    id: "pack3",
    label: "厚重",
    subpackage: "sounds-pack3",
    root: "subpackages/sounds-packs/pack3/",
    color: "#5a4a3a",
  },
  {
    id: "pack4",
    label: "层次",
    subpackage: "sounds-pack4",
    root: "subpackages/sounds-packs/pack4/",
    color: "#557a8a",
  },
  {
    id: "legacy",
    label: "旧版",
    subpackage: null,
    root: null,
    color: "#6b5a44",
  },
] as const;

export const DEFAULT_SOUND_PACK: SoundPackId = "pack1";

const SOUND_STEMS: Record<SoundGroup, string[]> = {
  bg: ["bg"],
  drop: ["drop"],
  split: ["split1", "split2", "split3", "split4", "split5", "split6"],
  splitBreak: [
    "splitb1",
    "splitb2",
    "splitb3",
    "splitb4",
    "splitb5",
    "splitb6",
    "splitb7",
    "splitb8",
    "splitb9",
    "splitb10",
  ],
  stack: [
    "stack1",
    "stack2",
    "stack3",
    "stack4",
    "stack5",
    "stack6",
    "stack7",
    "stack8",
    "stack9",
    "stack10",
    "stack11",
    "stack12",
    "stack13",
    "stack14",
  ],
};

export function isSoundPackId(v: string): v is SoundPackId {
  return SOUND_PACK_CATALOG.some((e) => e.id === v);
}

export function soundPackEntry(id: SoundPackId) {
  return SOUND_PACK_CATALOG.find((e) => e.id === id)!;
}

export function readSoundPack(): SoundPackId {
  try {
    const wx = (globalThis as { wx?: { getStorageSync?: (k: string) => unknown } }).wx;
    const v = wx?.getStorageSync?.(STORAGE_KEY_SOUND_PACK);
    if (typeof v === "string" && isSoundPackId(v)) return v;
    if (typeof localStorage !== "undefined") {
      const s = localStorage.getItem(STORAGE_KEY_SOUND_PACK);
      if (s && isSoundPackId(s)) return s;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_SOUND_PACK;
}

export function writeSoundPack(id: SoundPackId) {
  try {
    const wx = (globalThis as { wx?: { setStorageSync?: (k: string, v: string) => void } }).wx;
    wx?.setStorageSync?.(STORAGE_KEY_SOUND_PACK, id);
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY_SOUND_PACK, id);
  } catch {
    /* ignore */
  }
}

/** 某包下全部音效 URL（与 SOUNDS 分组一致） */
export function soundUrlsForPack(id: SoundPackId): Record<SoundGroup, string[]> {
  const file = (stem: string) => soundFileUrl(id, `${stem}.mp3`);
  return {
    bg: SOUND_STEMS.bg.map(file),
    drop: SOUND_STEMS.drop.map(file),
    split: SOUND_STEMS.split.map(file),
    splitBreak: SOUND_STEMS.splitBreak.map(file),
    stack: SOUND_STEMS.stack.map(file),
  };
}

export function soundFileUrl(id: SoundPackId, filename: string): string {
  const clean = filename.replace(/^\//, "");
  if (id === "legacy") {
    return assetUrl(`assets/sounds/${clean}`);
  }
  const entry = soundPackEntry(id);
  let root = entry.root || `subpackages/sounds-packs/${id}/`;
  // Web / Vite：public/sounds-packs/<id>/
  if (!isMinigame()) {
    return `/sounds-packs/${id}/${clean}`;
  }
  if (typeof globalThis !== "undefined") {
    const harness = Boolean((globalThis as { __HARNESS_CANVAS__?: boolean }).__HARNESS_CANVAS__);
    if (harness && !root.startsWith("/")) root = `/${root}`;
  }
  if (!root.endsWith("/")) root += "/";
  return `${root}${clean}`;
}

/** 按需加载音效分包；无 wx / harness 视为已就绪 */
export function loadSoundSubpackage(id: SoundPackId): Promise<void> {
  const entry = soundPackEntry(id);
  if (!entry.subpackage) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const wxApi = (globalThis as {
      wx?: {
        loadSubpackage?: (opts: {
          name: string;
          success: () => void;
          fail: (e: unknown) => void;
        }) => unknown;
      };
    }).wx;

    if (!wxApi?.loadSubpackage) {
      resolve();
      return;
    }

    wxApi.loadSubpackage({
      name: entry.subpackage!,
      success: () => resolve(),
      fail: (err) => reject(err),
    });
  });
}
