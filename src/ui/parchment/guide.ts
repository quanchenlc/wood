/** 首次三步引导：本地一次，可跳过。文案占位，美术后续换视觉。 */

export const STORAGE_KEY_GUIDE = "fw_onboarding_guide_v1";

export const GUIDE_STEPS = [
  {
    step: 1,
    title: "点树桩劈柴",
    body: "对准树桩点三刀，树根入垛才算一棵。",
  },
  {
    step: 2,
    title: "柴棚领取",
    body: "离线攒的树根在柴棚待取，回来一键领取。",
  },
  {
    step: 3,
    title: "广告加速",
    body: "看一支短片可推进疏伐；加额度可选，领取不锁。",
  },
] as const;

function wxStorage():
  | {
      getStorageSync?: (k: string) => unknown;
      setStorageSync?: (k: string, v: string) => void;
    }
  | undefined {
  return typeof globalThis !== "undefined"
    ? (globalThis as {
        wx?: {
          getStorageSync?: (k: string) => unknown;
          setStorageSync?: (k: string, v: string) => void;
        };
      }).wx
    : undefined;
}

export function isGuideDone(): boolean {
  try {
    const raw = wxStorage()?.getStorageSync?.(STORAGE_KEY_GUIDE);
    if (raw === "1" || raw === 1 || raw === true) return true;
  } catch {
    /* ignore */
  }
  try {
    return localStorage?.getItem?.(STORAGE_KEY_GUIDE) === "1";
  } catch {
    return false;
  }
}

export function markGuideDone() {
  try {
    wxStorage()?.setStorageSync?.(STORAGE_KEY_GUIDE, "1");
  } catch {
    /* ignore */
  }
  try {
    localStorage?.setItem?.(STORAGE_KEY_GUIDE, "1");
  } catch {
    /* ignore */
  }
}

/** harness / 调试重置 */
export function resetGuideForTests() {
  try {
    wxStorage()?.setStorageSync?.(STORAGE_KEY_GUIDE, "0");
  } catch {
    /* ignore */
  }
  try {
    localStorage?.removeItem?.(STORAGE_KEY_GUIDE);
  } catch {
    /* ignore */
  }
}
