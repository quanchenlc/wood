import { DESIGN_C } from "./design";
import { shanghaiDateString } from "./time";
import { STORAGE_KEY_ECONOMY, type EconomyState } from "./types";

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

export function defaultEconomyState(now = Date.now()): EconomyState {
  return {
    total_pieces: 0,
    today_pieces: 0,
    today_date: shanghaiDateString(now),
    daily_remaining: DESIGN_C.dailyQuota,
    daily_bonus: 0,
    pending_claim: 0,
    offline_index: 1,
    last_offline_ts: now,
    offline_progress_ms: 0,
    ad_daily_offline_skip: 0,
    ad_daily_quota_plus: 0,
    boost_until_ms: 0,
  };
}

function coerceState(raw: unknown, now: number): EconomyState {
  const base = defaultEconomyState(now);
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const num = (k: string, fallback: number) =>
    typeof o[k] === "number" && Number.isFinite(o[k] as number) ? (o[k] as number) : fallback;
  return {
    total_pieces: Math.max(0, Math.floor(num("total_pieces", base.total_pieces))),
    today_pieces: Math.max(0, Math.floor(num("today_pieces", base.today_pieces))),
    today_date: typeof o.today_date === "string" ? o.today_date : base.today_date,
    daily_remaining: Math.max(0, Math.floor(num("daily_remaining", base.daily_remaining))),
    daily_bonus: Math.max(0, Math.floor(num("daily_bonus", base.daily_bonus))),
    pending_claim: Math.max(0, Math.floor(num("pending_claim", base.pending_claim))),
    offline_index: Math.max(1, Math.floor(num("offline_index", base.offline_index))),
    last_offline_ts: Math.max(0, Math.floor(num("last_offline_ts", base.last_offline_ts))),
    offline_progress_ms: Math.max(0, Math.floor(num("offline_progress_ms", 0))),
    ad_daily_offline_skip: Math.max(0, Math.floor(num("ad_daily_offline_skip", 0))),
    ad_daily_quota_plus: Math.max(0, Math.floor(num("ad_daily_quota_plus", 0))),
    boost_until_ms: Math.max(0, Math.floor(num("boost_until_ms", 0))),
  };
}

export function loadEconomyState(now = Date.now()): EconomyState {
  try {
    const wx = wxStorage();
    const raw = wx?.getStorageSync?.(STORAGE_KEY_ECONOMY);
    if (typeof raw === "string") return coerceState(JSON.parse(raw), now);
    if (raw && typeof raw === "object") return coerceState(raw, now);
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage?.getItem?.(STORAGE_KEY_ECONOMY);
    if (raw) return coerceState(JSON.parse(raw), now);
  } catch {
    /* ignore */
  }
  return defaultEconomyState(now);
}

export function saveEconomyState(state: EconomyState) {
  const json = JSON.stringify(state);
  try {
    wxStorage()?.setStorageSync?.(STORAGE_KEY_ECONOMY, json);
  } catch {
    /* ignore */
  }
  try {
    localStorage?.setItem?.(STORAGE_KEY_ECONOMY, json);
  } catch {
    /* ignore */
  }
}

/**
 * 云函数替换点：一期本地读写；二期可改成 RPC 再写本地缓存。
 */
export interface EconomyStoreBackend {
  load(): EconomyState;
  save(state: EconomyState): void;
}

export function createLocalBackend(): EconomyStoreBackend {
  return {
    load: () => loadEconomyState(),
    save: (s) => saveEconomyState(s),
  };
}
