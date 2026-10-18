/** 首次三步引导 — 规格见 ui-parchment-v2/notes-v3.md §5 */

export const STORAGE_KEY_GUIDE = "fw_guide_v1";

export type GuideMark = "done" | "skipped";

export const GUIDE_COPY = {
  1: {
    title: "点一下木头，劈开它",
    body: "按住左右拖动，可以转着看",
  },
  2: {
    title: "树根每天有限，砍完会慢慢长回来",
    body: "看「剩余树根」和「生长倒计时」",
  },
  3: {
    title: "看短片，树根长得更快",
    body: "好友柴榜：比比谁砍得多",
  },
} as const;

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

export function readGuideMark(): GuideMark | null {
  try {
    const raw = wxStorage()?.getStorageSync?.(STORAGE_KEY_GUIDE);
    if (raw === "done" || raw === "skipped") return raw;
    // 兼容 0.3.2
    if (raw === "1" || raw === 1 || raw === true) return "done";
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage?.getItem?.(STORAGE_KEY_GUIDE);
    if (raw === "done" || raw === "skipped") return raw;
    if (raw === "1") return "done";
  } catch {
    /* ignore */
  }
  return null;
}

export function isGuideDone(): boolean {
  return readGuideMark() !== null;
}

export function markGuide(mark: GuideMark) {
  try {
    wxStorage()?.setStorageSync?.(STORAGE_KEY_GUIDE, mark);
  } catch {
    /* ignore */
  }
  try {
    localStorage?.setItem?.(STORAGE_KEY_GUIDE, mark);
  } catch {
    /* ignore */
  }
}

export function markGuideDone() {
  markGuide("done");
}

export function resetGuideForTests() {
  try {
    wxStorage()?.setStorageSync?.(STORAGE_KEY_GUIDE, "");
  } catch {
    /* ignore */
  }
  try {
    localStorage?.removeItem?.(STORAGE_KEY_GUIDE);
  } catch {
    /* ignore */
  }
}

/** 埋点：控制台 + 可选 wx.reportAnalytics / 自定义钩子 */
export function trackGuide(
  event: "guide_step_view" | "guide_complete" | "guide_skip",
  payload?: { step?: number },
) {
  const detail = { event, ...payload, t: Date.now() };
  try {
    console.log("[analytics]", detail);
  } catch {
    /* ignore */
  }
  try {
    const g = globalThis as {
      __FIREWOOD_ANALYTICS__?: (d: unknown) => void;
      wx?: { reportAnalytics?: (name: string, data: Record<string, number>) => void };
    };
    g.__FIREWOOD_ANALYTICS__?.(detail);
    if (event === "guide_step_view" && payload?.step != null) {
      g.wx?.reportAnalytics?.("guide_step_view", { step: payload.step });
    } else if (event === "guide_complete") {
      g.wx?.reportAnalytics?.("guide_complete", { v: 1 });
    } else if (event === "guide_skip" && payload?.step != null) {
      g.wx?.reportAnalytics?.("guide_skip", { step: payload.step });
    }
  } catch {
    /* ignore */
  }
}
