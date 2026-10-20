import { DESIGN_C } from "./design";

/**
 * 离线第 n 根耗时（分钟）。n 从 1 起。
 * 公式见 docs/design-scheme-c.md §3.1
 */
export function minutesForRoot(n: number): number {
  const { flatCount, flatMinutes, stageSize } = DESIGN_C.offline;
  if (n < 1) n = 1;
  if (n <= flatCount) return flatMinutes;
  const stage = Math.ceil((n - flatCount) / stageSize);
  return 2 ** stage * flatMinutes;
}

export function msForRoot(n: number): number {
  return minutesForRoot(n) * 60_000;
}

export interface SettleInput {
  now: number;
  lastOfflineTs: number;
  offlineIndex: number;
  pending: number;
  progressMs: number;
  pendingCap: number;
}

export interface SettleResult {
  pending: number;
  offlineIndex: number;
  lastOfflineTs: number;
  progressMs: number;
  produced: number;
}

/** 按离开时长推进 pending（受 pendingCap 封顶） */
export function settleOffline(input: SettleInput): SettleResult {
  const cap = input.pendingCap;
  let pending = input.pending;
  let index = Math.max(1, input.offlineIndex);
  let progress = Math.max(0, input.progressMs);
  const now = input.now;
  let remain = Math.max(0, now - input.lastOfflineTs) + progress;
  progress = 0;
  let produced = 0;

  while (pending < cap && remain > 0) {
    const need = msForRoot(index);
    if (remain >= need) {
      pending += 1;
      index += 1;
      remain -= need;
      produced += 1;
    } else {
      progress = remain;
      remain = 0;
    }
  }

  return {
    pending,
    offlineIndex: index,
    lastOfflineTs: now,
    progressMs: pending >= cap ? 0 : progress,
    produced,
  };
}

/** 广告跳过等价离线时间（仍受 pendingCap） */
export function applyTimeSkip(
  input: Omit<SettleInput, "lastOfflineTs"> & { skipMs: number },
): SettleResult {
  return settleOffline({
    ...input,
    lastOfflineTs: input.now - input.skipMs,
    progressMs: input.progressMs,
  });
}

/** 距下一根产出的剩余 ms；满棚返回 null */
export function msUntilNextRoot(
  pending: number,
  pendingCap: number,
  offlineIndex: number,
  progressMs: number,
): number | null {
  if (pending >= pendingCap) return null;
  const need = msForRoot(Math.max(1, offlineIndex));
  return Math.max(0, need - Math.max(0, progressMs));
}
