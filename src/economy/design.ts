/**
 * 方案 C 配置常量 —— 唯一权威见 docs/design-scheme-c.md §9。
 * 改数值请先改文档，再同步本文件。
 *
 * 物理刀数：恢复 pre-0.3.0 几何切割（薄到不可劈 / 无可劈块才入垛）。
 * 方案 C 曾写的「3 刀/根」已废弃，不参与伐倒判定。
 */
export const DESIGN_C = {
  offline: {
    flatCount: 180,
    flatMinutes: 1,
    stageSize: 20,
  },
  pendingCap: 200,
  dailyQuota: 300,
  ads: {
    AD_OFFLINE_SKIP: { skipMinutes: 30, dailyLimit: 8 },
    AD_QUOTA_PLUS: { quotaPlus: 20, dailyLimit: 5 },
    AD_ACTIVE_BURST: { dailyLimit: 3, enabled: false },
    AD_CLAIM_DOUBLE: { enabled: false },
  },
  rank: {
    primaryKey: "total_pieces",
    phase1: "open_data_domain",
    phase2: "cloud_dev",
  },
  timezone: "Asia/Shanghai",
} as const;

export type DesignC = typeof DESIGN_C;

/** §6 文案（与策划定稿对齐） */
export const COPY_C = {
  title: "来我的花园砍柴",
  tagline: "一斧一木 · 日日有柴",
  unit: "树根",
  thinning: (n: number) => `今日还可疏伐 ${n} 根`,
  thinningHint: "适量砍伐，林子才长得更好。",
  pending: (m: number) => `柴棚待取：${m} 根`,
  pendingHint: "疏伐队已备好，回来领取即可。",
  shedFull: "柴棚已满（200）",
  shedFullHint: "先领取再继续疏伐。",
  resting: "今日蓄养中",
  restingHint: "已达可持续砍伐量。看一支短片可临时增加疏伐额度。",
  speedUp: "疏伐加速",
  speedUpHint: "短片结束后，为你推进一段疏伐进度。",
  quotaPlus: "临时许可 +20",
  quotaPlusHint: "护林员特批，今日可持续砍伐量 +20。",
  claim: "领取",
  claimTomorrow: "明日再来",
  watchAd: "或 观看一段广告",
  adQuotaBtn: "再领 +20 额度",
  adSkipBtn: "疏伐加速 30 分",
  adFail: "疏伐队暂时联系不上，稍后再试",
  rankTitle: "好友砍柴榜",
  rankScoreHint: "累计疏伐（入垛）",
  rankEmpty: "喊上好友一起来疏伐吧",
  rankInvite: "— 邀请好友同砍，柴多者居上 —",
  hudToday: "今日已砍",
  hudRemaining: "剩余树根",
  hudGrowing: "生长倒计时",
  hudBoost: "加速中",
  exhaustedTitle: "树根用尽",
  exhaustedBody1: "今天的树根已经砍完了",
  exhaustedBody2: "明天 0 点恢复",
  startChop: "开始砍柴",
  openRank: "好友柴榜",
  loading: "正在磨斧…",
  back: "返回",
} as const;
