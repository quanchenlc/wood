/**
 * Original authored axe swing (0.4.7).
 *
 * Impact: tip on log TOP with metal HEAD visible (cheek to camera, edge down).
 * Tip in AuxScene/authoring space — never Mesh-bin local (that buried the head
 * ~35 cm below the log). Non-uniform scale enlarges the head; tip +Z seats the
 * cheek on the near/top side of the log (validated against bare-stick boss shot).
 * No ax_anim_v03 / screen.toys keyframe floats.
 */

export const AXE_ANIM_DURATION = 0.78;
export const AXE_ANIM_FADE = 0.14;
export const AXE_ANIM_IMPACT_AT = 0.12;

/** Enlarge head (X/Z); shorten handle (Y) for top-tab clearance. */
export const AXE_MODEL_SCALE_X = 1.85;
export const AXE_MODEL_SCALE_Y = 0.58;
export const AXE_MODEL_SCALE_Z = 1.85;
export const AXE_MODEL_SCALE = AXE_MODEL_SCALE_Y;

/** Blade tip in AuxScene / authoring space (build_axe_placeholder XE,y). */
export const AXE_TIP_LOCAL: readonly [number, number, number] = [-0.162, 0.05, 0];

export type AxeKey = {
  t: number;
  p: readonly [number, number, number];
  q: readonly [number, number, number, number];
};

/**
 * Pure Euler(rotX) keys; tip-zeroed with AXE_MODEL_SCALE_*.
 * Impact tip ~(0, 2 cm, +8 cm): slight bite + offset so metal cheek clears the log.
 */
export const AXE_KEYS: readonly AxeKey[] = [
  { t: 0, p: [0.3497, 0.32463, 0.07541], q: [0.48481, 0, 0, 0.87462] },
  { t: 0.06, p: [0.3247, 0.14136, 0.06778], q: [0.42262, 0, 0, 0.90631] },
  { t: AXE_ANIM_IMPACT_AT, p: [0.2997, -0.00155, 0.0606], q: [0.35837, 0, 0, 0.93358] },
  { t: 0.34, p: [0.2997, -0.02725, 0.05008], q: [0.17365, 0, 0, 0.98481] },
  { t: AXE_ANIM_DURATION, p: [0.2997, -0.05896, 0.04152], q: [-0.02618, 0, 0, 0.99966] },
];
