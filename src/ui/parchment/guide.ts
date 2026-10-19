/** 首次三步引导 — D 抽屉规格（guide/ + interaction.md §8） */

export const STORAGE_KEY_GUIDE = "fw_guide_v1";

export type GuideMark = "done" | "skipped";

export const GUIDE_COPY = {
  1: {
    title: "点一下木头，劈开它",
    body: "按住左右拖动，可以转着看",
  },
  2: {
    title: "点这里看柴棚",
    body: "小签显示剩余树根；有可领时会出现红点",
  },
  3: {
    title: "免费领柴，换个风格",
    body: "柴棚里的柴点「免费领取」就能拿，不用看广告；「风格」可以换成别的画风。",
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

export function trackGuide(
  event: "guide_step_view" | "guide_complete" | "guide_skip" | "drawer_open",
  payload?: { step?: number; src?: string },
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
      wx?: { reportAnalytics?: (name: string, data: Record<string, number | string>) => void };
    };
    g.__FIREWOOD_ANALYTICS__?.(detail);
    if (event === "guide_step_view" && payload?.step != null) {
      g.wx?.reportAnalytics?.("guide_step_view", { step: payload.step });
    } else if (event === "guide_complete") {
      g.wx?.reportAnalytics?.("guide_complete", { v: 1 });
    } else if (event === "guide_skip" && payload?.step != null) {
      g.wx?.reportAnalytics?.("guide_skip", { step: payload.step });
    } else if (event === "drawer_open") {
      g.wx?.reportAnalytics?.("drawer_open", { src: payload?.src || "tap" });
    }
  } catch {
    /* ignore */
  }
}

export const STORAGE_KEY_STYLE = "fw_style";

export function readStyleId(fallback = "set4"): string {
  try {
    const raw = wxStorage()?.getStorageSync?.(STORAGE_KEY_STYLE);
    if (typeof raw === "string" && raw) return raw;
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage?.getItem?.(STORAGE_KEY_STYLE);
    if (raw) return raw;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function writeStyleId(id: string) {
  try {
    wxStorage()?.setStorageSync?.(STORAGE_KEY_STYLE, id);
  } catch {
    /* ignore */
  }
  try {
    localStorage?.setItem?.(STORAGE_KEY_STYLE, id);
  } catch {
    /* ignore */
  }
}
