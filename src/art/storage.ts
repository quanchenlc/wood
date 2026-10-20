import { DEFAULT_ART_SET, STORAGE_KEY_ART_SET, isArtSetId } from "./registry";
import type { ArtSetId } from "./types";

function wxStorage():
  | {
      getStorageSync?: (k: string) => unknown;
      setStorageSync?: (k: string, v: string) => void;
    }
  | undefined {
  return typeof globalThis !== "undefined"
    ? (globalThis as { wx?: { getStorageSync?: (k: string) => unknown; setStorageSync?: (k: string, v: string) => void } }).wx
    : undefined;
}

export function readStoredArtSet(): ArtSetId {
  try {
    const wx = wxStorage();
    const raw = wx?.getStorageSync?.(STORAGE_KEY_ART_SET);
    if (typeof raw === "string" && isArtSetId(raw)) return raw;
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage?.getItem?.(STORAGE_KEY_ART_SET);
    if (raw && isArtSetId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_ART_SET;
}

export function writeStoredArtSet(id: ArtSetId) {
  try {
    wxStorage()?.setStorageSync?.(STORAGE_KEY_ART_SET, id);
  } catch {
    /* ignore */
  }
  try {
    localStorage?.setItem?.(STORAGE_KEY_ART_SET, id);
  } catch {
    /* ignore */
  }
}
