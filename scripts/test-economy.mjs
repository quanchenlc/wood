/**
 * 方案 C 数值自检（docs/design-scheme-c.md §8 / §9）
 * 无 DOM：直接跑 growth 公式与结算逻辑的镜像实现。
 */
import assert from "node:assert/strict";

const DESIGN_C = {
  hitsPerRoot: 3,
  offline: { flatCount: 180, flatMinutes: 1, stageSize: 20 },
  pendingCap: 200,
  dailyQuota: 300,
  ads: {
    AD_OFFLINE_SKIP: { skipMinutes: 30, dailyLimit: 8 },
    AD_QUOTA_PLUS: { quotaPlus: 20, dailyLimit: 5 },
  },
};

function minutesForRoot(n) {
  const { flatCount, flatMinutes, stageSize } = DESIGN_C.offline;
  if (n < 1) n = 1;
  if (n <= flatCount) return flatMinutes;
  const stage = Math.ceil((n - flatCount) / stageSize);
  return 2 ** stage * flatMinutes;
}

function settle({ now, last, index, pending, progress, cap }) {
  let remain = Math.max(0, now - last) + progress;
  progress = 0;
  let produced = 0;
  while (pending < cap && remain > 0) {
    const need = minutesForRoot(index) * 60_000;
    if (remain >= need) {
      pending++;
      index++;
      remain -= need;
      produced++;
    } else {
      progress = remain;
      remain = 0;
    }
  }
  return { pending, index, progress, produced };
}

// §8.1 递进
assert.equal(minutesForRoot(1), 1);
assert.equal(minutesForRoot(180), 1);
assert.equal(minutesForRoot(181), 2);
assert.equal(minutesForRoot(200), 2);
assert.equal(minutesForRoot(201), 4);
assert.equal(minutesForRoot(221), 8);

// 180 根 × 1min
{
  const r = settle({
    now: 180 * 60_000,
    last: 0,
    index: 1,
    pending: 0,
    progress: 0,
    cap: 200,
  });
  assert.equal(r.produced, 180);
  assert.equal(r.pending, 180);
  assert.equal(r.index, 181);
}

// pending cap 200
{
  const r = settle({
    now: 400 * 60_000,
    last: 0,
    index: 1,
    pending: 0,
    progress: 0,
    cap: 200,
  });
  assert.equal(r.pending, 200);
  assert.ok(r.produced === 200);
}

// 30min skip from n=1 → 30 roots
{
  const r = settle({
    now: 30 * 60_000,
    last: 0,
    index: 1,
    pending: 0,
    progress: 0,
    cap: 200,
  });
  assert.equal(r.produced, 30);
}

// claim shared with daily
{
  let pending = 50;
  let daily = 20;
  let today = 0;
  let total = 0;
  const claim = Math.min(pending, daily);
  pending -= claim;
  daily -= claim;
  today += claim;
  total += claim;
  assert.equal(claim, 20);
  assert.equal(pending, 30);
  assert.equal(daily, 0);
  assert.equal(today, 20);
}

// active + claim share 300
{
  let rem = 300;
  rem -= 100; // active
  const claim = Math.min(250, rem);
  rem -= claim;
  assert.equal(claim, 200);
  assert.equal(rem, 0);
}

// hitsPerRoot
assert.equal(DESIGN_C.hitsPerRoot, 3);
assert.equal(DESIGN_C.ads.AD_QUOTA_PLUS.quotaPlus, 20);
assert.equal(DESIGN_C.ads.AD_OFFLINE_SKIP.skipMinutes, 30);

console.log("test-economy: ok");
