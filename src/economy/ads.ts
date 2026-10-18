import type { AdPlacement, AdResult } from "./types";

/**
 * 激励视频桩：无真实广告位时立即成功（harness / 本地）。
 * 真机有 adUnitId 时可替换为 wx.createRewardedVideoAd。
 */
export async function playRewardedAd(placement: AdPlacement): Promise<AdResult> {
  const g = globalThis as {
    wx?: {
      createRewardedVideoAd?: (opt: { adUnitId: string }) => {
        show: () => Promise<unknown>;
        load?: () => Promise<unknown>;
        onClose?: (cb: (r: { isEnded?: boolean }) => void) => void;
        onError?: (cb: (e: unknown) => void) => void;
      };
    };
    __FIREWOOD_AD_STUB__?: "ended" | "closed" | "fail";
  };

  if (g.__FIREWOOD_AD_STUB__) return g.__FIREWOOD_AD_STUB__;

  // 无广告位配置：桩返回看完
  const unitId = (g as { __FIREWOOD_AD_UNITS__?: Record<string, string> }).__FIREWOOD_AD_UNITS__?.[
    placement
  ];
  if (!unitId || !g.wx?.createRewardedVideoAd) {
    await new Promise((r) => setTimeout(r, 120));
    return "ended";
  }

  return new Promise((resolve) => {
    try {
      const ad = g.wx!.createRewardedVideoAd!({ adUnitId: unitId });
      let settled = false;
      const finish = (r: AdResult) => {
        if (settled) return;
        settled = true;
        resolve(r);
      };
      ad.onError?.(() => finish("fail"));
      ad.onClose?.((res) => finish(res?.isEnded ? "ended" : "closed"));
      const show = () => {
        ad.show().catch(() => {
          ad.load?.()
            .then(() => ad.show())
            .catch(() => finish("fail"));
        });
      };
      show();
    } catch {
      resolve("fail");
    }
  });
}
