import { DESIGN_C } from "./design";
import type { EconomyState } from "./types";

let lastSync = 0;

/**
 * 一期：写入开放数据域 KV（total_pieces 主字段）。
 * 无 wx / 失败时静默；榜 UI 仍可用本地 self score。
 */
export function syncOpenDataRank(state: EconomyState, force = false) {
  const now = Date.now();
  if (!force && now - lastSync < 1200) return;
  lastSync = now;

  const kv = [
    { key: DESIGN_C.rank.primaryKey, value: String(state.total_pieces) },
    { key: "today_pieces", value: String(state.today_pieces) },
    { key: "today_date", value: state.today_date },
  ];

  try {
    const wx = (globalThis as {
      wx?: {
        setUserCloudStorage?: (opt: {
          KVDataList: { key: string; value: string }[];
          success?: () => void;
          fail?: () => void;
        }) => void;
      };
    }).wx;
    wx?.setUserCloudStorage?.({ KVDataList: kv });
  } catch {
    /* ignore */
  }
}
