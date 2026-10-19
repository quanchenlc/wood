/**
 * Original authored axe swing (0.4.6).
 *
 * Measured goals from pre-clean playthrough + boss wrong-shot (references only):
 * - idle: axe hidden
 * - wind-up: raised, clear of the top HUD band
 * - impact (~0.12s): tip on log TOP centre; handle from above (edge line ≈ +Y,
 *   tilted toward camera so the handle foreshortens clear of the top tab);
 *   blade EDGE into the log; cheek ≈ +Z (toward camera after pivot.lookAt);
 *   head attached to the handle
 *   (NOT the boss pattern: vertical stick + sideways cheek on the log FACE)
 * - follow-through then fade
 *
 * Keys are pure rotX + tip-zeroed translation (axe.gltf Mesh T/S accounted for).
 * No ax_anim_v03 / screen.toys keyframe floats.
 */

export const AXE_ANIM_DURATION = 0.78;
export const AXE_ANIM_FADE = 0.14;
export const AXE_ANIM_IMPACT_AT = 0.12;

export type AxeKey = {
  t: number;
  p: readonly [number, number, number];
  q: readonly [number, number, number, number];
};

/**
 * Five keys; smoothstep between neighbours.
 * Quaternions are Euler(rotX, 0, 0) only — keeps cheek +Z / edge +Y in pivot space.
 * Positions place the mesh tip (Mesh local −X) on the pivot at impact; a small
 * negative Y bite sinks the edge into the log top without parking on the bark face.
 */
export const AXE_KEYS: readonly AxeKey[] = [
  // wind-up — raised; strong rotX keeps handle clear of the top tab
  { t: 0, p: [0.1808, 0.0506, -0.5073], q: [0.54383, 0, 0, 0.83919] },
  // pre-strike
  { t: 0.06, p: [0.1608, -0.2296, -0.4612], q: [0.45734, 0, 0, 0.88929] },
  // impact — tip on log top (−2 cm bite); edge down; cheek to camera; head on handle
  { t: AXE_ANIM_IMPACT_AT, p: [0.1408, -0.4079, -0.4245], q: [0.39861, 0, 0, 0.91712] },
  // follow-through
  { t: 0.34, p: [0.1408, -0.5451, -0.2555], q: [0.22311, 0, 0, 0.97479] },
  // exit
  { t: AXE_ANIM_DURATION, p: [0.1408, -0.654, -0.0148], q: [0.025, 0, 0, 0.99969] },
];
