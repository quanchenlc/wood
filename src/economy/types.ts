/** 方案 C 本地存档字段（§4.3）；云函数可日后替换同一形状 */

export interface EconomyState {
  total_pieces: number;
  today_pieces: number;
  /** Asia/Shanghai YYYY-MM-DD */
  today_date: string;
  daily_remaining: number;
  /** 当日广告加额尚未消耗部分（展示用） */
  daily_bonus: number;
  pending_claim: number;
  /** 下一根离线序号 n（从 1 起） */
  offline_index: number;
  /** 上次离线结算 Unix ms */
  last_offline_ts: number;
  /** 当前根已累计计时碎片 ms（不足一整根） */
  offline_progress_ms: number;
  ad_daily_offline_skip: number;
  ad_daily_quota_plus: number;
  /** 加速展示截止 ms（画布「加速中」chip） */
  boost_until_ms: number;
}

export type AdPlacement = "AD_OFFLINE_SKIP" | "AD_QUOTA_PLUS";

export type AdResult = "ended" | "closed" | "fail";

export interface EconomySnapshot {
  state: EconomyState;
  /** 下一根生长剩余 ms；柴棚满或无可算时为 null */
  nextRootMs: number | null;
  pendingFull: boolean;
  quotaExhausted: boolean;
  boosting: boolean;
}

export const STORAGE_KEY_ECONOMY = "fw_economy_scheme_c_v1";
