/**
 * Original authored axe swing (0.4.6).
 *
 * Measured goals from a pre-clean playthrough (not its keyframe data):
 * - idle: axe hidden
 * - wind-up: raised, clear of the top HUD band
 * - impact (~0.12s): tip on log top; handle from above; blade edge into the
 *   log (−Y); cheek ≈ +X; head attached to the handle
 * - follow-through then fade
 *
 * Tip placement accounts for axe.gltf Mesh translation/scale. Keys / timing /
 * easing are project-authored — no ax_anim keyframe arrays.
 */

export const AXE_ANIM_DURATION = 0.78;
export const AXE_ANIM_FADE = 0.14;
export const AXE_ANIM_IMPACT_AT = 0.12;

export type AxeKey = {
  t: number;
  p: readonly [number, number, number];
  q: readonly [number, number, number, number];
};

/** Five keys; smoothstep (cubic) between neighbours. */
export const AXE_KEYS: readonly AxeKey[] = [
  { t: 0, p: [0.3105, 0.0264, -0.2335], q: [-0.17904, -0.67468, -0.19349, -0.68943] },
  { t: 0.08, p: [0.1292, -0.1602, -0.4037], q: [-0.21495, -0.66296, -0.2253, -0.68083] },
  { t: AXE_ANIM_IMPACT_AT, p: [0.0283, -0.273, -0.4894], q: [-0.24964, -0.65044, -0.25721, -0.66966] },
  { t: 0.36, p: [-0.117, -0.4096, -0.4444], q: [-0.32101, -0.65596, -0.31477, -0.6063] },
  { t: AXE_ANIM_DURATION, p: [-0.1962, -0.5969, -0.3207], q: [-0.36385, -0.64749, -0.36385, -0.56213] },
];
