/**
 * Original authored axe swing (0.4.6).
 *
 * Measured goals from a pre-clean playthrough (not its keyframe data):
 * - idle: axe hidden
 * - wind-up: raised beside the log, below the top HUD band
 * - impact (~0.12s): blade tip on the log top centre; handle laid across
 *   so the mesh stays clear of the top drawer tab
 * - follow-through then fade
 *
 * Keys / timing / easing are project-authored. No ax_anim / screen.toys curves.
 */

export const AXE_ANIM_DURATION = 0.78;
export const AXE_ANIM_FADE = 0.14;
/** Align with GameController pendingSplit ≈ 0.1s */
export const AXE_ANIM_IMPACT_AT = 0.12;

export type AxeKey = {
  t: number;
  /** anim-node local position relative to impact pivot */
  p: readonly [number, number, number];
  /** anim-node local quaternion xyzw (unit) */
  q: readonly [number, number, number, number];
};

/** Five keys; smoothstep (cubic) between neighbours. */
export const AXE_KEYS: readonly AxeKey[] = [
  // wind-up — mid height, camera-right; mesh top stays under the HUD tab
  { t: 0, p: [0.4423, 0.3204, 0.0378], q: [-0.05887, 0.5171, -0.27922, 0.80696] },
  // pre-strike
  { t: 0.08, p: [0.1966, 0.0313, -0.0065], q: [-0.2549, 0.43192, -0.41817, 0.75737] },
  // impact — tip on log top centre; handle nearly horizontal (no tab overlap)
  { t: AXE_ANIM_IMPACT_AT, p: [0.0615, -0.107, 0.0519], q: [-0.44511, 0.29964, -0.53519, 0.65243] },
  // follow-through
  { t: 0.36, p: [-0.0818, -0.3918, 0.1913], q: [-0.52695, 0.20983, -0.55678, 0.60687] },
  // exit / fade hold
  { t: AXE_ANIM_DURATION, p: [-0.1429, -0.6408, 0.3737], q: [-0.59664, 0.13064, -0.52708, 0.59089] },
];
