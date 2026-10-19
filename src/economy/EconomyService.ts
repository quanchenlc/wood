import { playRewardedAd } from "./ads";
import { DESIGN_C } from "./design";
import {
  applyTimeSkip,
  msUntilNextRoot,
  settleOffline,
} from "./growth";
import { syncOpenDataRank } from "./rank";
import { createLocalBackend, type EconomyStoreBackend } from "./store";
import { shanghaiDateString } from "./time";
import type { AdPlacement, EconomySnapshot, EconomyState } from "./types";

export class EconomyService {
  private state: EconomyState;
  private readonly backend: EconomyStoreBackend;
  private listeners = new Set<() => void>();

  constructor(backend: EconomyStoreBackend = createLocalBackend()) {
    this.backend = backend;
    this.state = backend.load();
    this.ensureDay(Date.now());
    this.settle(Date.now());
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
  }

  private persist() {
    this.backend.save(this.state);
    syncOpenDataRank(this.state);
    this.emit();
  }

  getState(): EconomyState {
    return { ...this.state };
  }

  snapshot(now = Date.now()): EconomySnapshot {
    this.ensureDay(now);
    // 轻量推进进度碎片（不每次写盘）
    this.tickProgress(now);
    const pendingFull = this.state.pending_claim >= DESIGN_C.pendingCap;
    return {
      state: this.getState(),
      nextRootMs: msUntilNextRoot(
        this.state.pending_claim,
        DESIGN_C.pendingCap,
        this.state.offline_index,
        this.state.offline_progress_ms,
      ),
      pendingFull,
      quotaExhausted: this.state.daily_remaining <= 0,
      boosting: now < this.state.boost_until_ms,
    };
  }

  /** 日切（上海） */
  ensureDay(now = Date.now()) {
    const today = shanghaiDateString(now);
    if (this.state.today_date === today) return;
    this.state.today_date = today;
    this.state.today_pieces = 0;
    this.state.daily_bonus = 0;
    this.state.daily_remaining = DESIGN_C.dailyQuota;
    this.state.ad_daily_offline_skip = 0;
    this.state.ad_daily_quota_plus = 0;
    this.persist();
  }

  /** 回线 / 周期结算 pending */
  settle(now = Date.now()): number {
    this.ensureDay(now);
    const result = settleOffline({
      now,
      lastOfflineTs: this.state.last_offline_ts,
      offlineIndex: this.state.offline_index,
      pending: this.state.pending_claim,
      progressMs: this.state.offline_progress_ms,
      pendingCap: DESIGN_C.pendingCap,
    });
    const produced = result.produced;
    this.state.pending_claim = result.pending;
    this.state.offline_index = result.offlineIndex;
    this.state.last_offline_ts = result.lastOfflineTs;
    this.state.offline_progress_ms = result.progressMs;
    if (produced > 0) this.persist();
    else {
      // 仅刷新时间戳，避免 thrash：进度碎片用 tick
      this.backend.save(this.state);
    }
    return produced;
  }

  private tickProgress(now: number) {
    if (this.state.pending_claim >= DESIGN_C.pendingCap) {
      this.state.last_offline_ts = now;
      return;
    }
    const result = settleOffline({
      now,
      lastOfflineTs: this.state.last_offline_ts,
      offlineIndex: this.state.offline_index,
      pending: this.state.pending_claim,
      progressMs: this.state.offline_progress_ms,
      pendingCap: DESIGN_C.pendingCap,
    });
    this.state.pending_claim = result.pending;
    this.state.offline_index = result.offlineIndex;
    this.state.last_offline_ts = result.lastOfflineTs;
    this.state.offline_progress_ms = result.progressMs;
  }

  /** 主动入垛 1 根（一整根木头劈完、开始入垛时调用一次）；耗日额度 */
  tryActiveStack(now = Date.now()): boolean {
    this.ensureDay(now);
    if (this.state.daily_remaining <= 0) return false;
    this.state.daily_remaining -= 1;
    this.state.today_pieces += 1;
    this.state.total_pieces += 1;
    this.persist();
    return true;
  }

  canActiveChop(now = Date.now()): boolean {
    this.ensureDay(now);
    return this.state.daily_remaining > 0;
  }

  /**
   * 领取：claim = min(pending, daily_remaining)。
   * 禁止用广告锁死本入口。
   */
  claim(now = Date.now()): number {
    this.ensureDay(now);
    this.settle(now);
    const amount = Math.min(this.state.pending_claim, this.state.daily_remaining);
    if (amount <= 0) return 0;
    this.state.pending_claim -= amount;
    this.state.daily_remaining -= amount;
    this.state.today_pieces += amount;
    this.state.total_pieces += amount;
    this.persist();
    return amount;
  }

  async watchAd(placement: AdPlacement, now = Date.now()): Promise<{
    ok: boolean;
    reason?: "limit" | "fail" | "closed" | "disabled";
    gained?: number;
  }> {
    this.ensureDay(now);
    if (placement === "AD_OFFLINE_SKIP") {
      const cfg = DESIGN_C.ads.AD_OFFLINE_SKIP;
      if (this.state.ad_daily_offline_skip >= cfg.dailyLimit) {
        return { ok: false, reason: "limit" };
      }
      const result = await playRewardedAd(placement);
      if (result === "fail") return { ok: false, reason: "fail" };
      if (result !== "ended") return { ok: false, reason: "closed" };
      this.state.ad_daily_offline_skip += 1;
      const skip = applyTimeSkip({
        now,
        offlineIndex: this.state.offline_index,
        pending: this.state.pending_claim,
        progressMs: this.state.offline_progress_ms,
        pendingCap: DESIGN_C.pendingCap,
        skipMs: cfg.skipMinutes * 60_000,
      });
      const gained = skip.produced;
      this.state.pending_claim = skip.pending;
      this.state.offline_index = skip.offlineIndex;
      this.state.last_offline_ts = skip.lastOfflineTs;
      this.state.offline_progress_ms = skip.progressMs;
      this.state.boost_until_ms = now + 60_000;
      this.persist();
      return { ok: true, gained };
    }

    if (placement === "AD_QUOTA_PLUS") {
      const cfg = DESIGN_C.ads.AD_QUOTA_PLUS;
      if (this.state.ad_daily_quota_plus >= cfg.dailyLimit) {
        return { ok: false, reason: "limit" };
      }
      const result = await playRewardedAd(placement);
      if (result === "fail") return { ok: false, reason: "fail" };
      if (result !== "ended") return { ok: false, reason: "closed" };
      this.state.ad_daily_quota_plus += 1;
      this.state.daily_remaining += cfg.quotaPlus;
      this.state.daily_bonus += cfg.quotaPlus;
      this.persist();
      return { ok: true, gained: cfg.quotaPlus };
    }

    return { ok: false, reason: "disabled" };
  }

  /** 测试/harness：快进离线分钟 */
  debugSkipMinutes(minutes: number, now = Date.now()) {
    const skip = applyTimeSkip({
      now,
      offlineIndex: this.state.offline_index,
      pending: this.state.pending_claim,
      progressMs: this.state.offline_progress_ms,
      pendingCap: DESIGN_C.pendingCap,
      skipMs: minutes * 60_000,
    });
    this.state.pending_claim = skip.pending;
    this.state.offline_index = skip.offlineIndex;
    this.state.last_offline_ts = skip.lastOfflineTs;
    this.state.offline_progress_ms = skip.progressMs;
    this.persist();
  }

  /** 测试：设额度 */
  debugSetRemaining(n: number) {
    this.state.daily_remaining = Math.max(0, Math.floor(n));
    this.persist();
  }
}

let singleton: EconomyService | null = null;

export function getEconomy(): EconomyService {
  if (!singleton) singleton = new EconomyService();
  return singleton;
}

export function resetEconomyForTests(backend?: EconomyStoreBackend) {
  singleton = new EconomyService(backend ?? createLocalBackend());
  return singleton;
}
