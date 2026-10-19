/**
 * Original authored axe swing (0.4.8).
 *
 * Root cause of live 体验版 cheek-on-face (harness PASS / live FAIL):
 * harness seeked the intact log TOP, but gameplay seated the axe at
 * computeSplitPoint's mesh CENTER for small pieces → tip mid-bark.
 * Fixed in GameController via axeContactPoint (bbox max.y).
 *
 * Orientation technique (early wood / screen.toys pattern — no ax_anim floats):
 * - Every frame: pivot.lookAt(camera-forward); local +X = camera-right
 * - MODEL_YAW = π/2 on the mesh: authoring cheek ±Z → ±X (blade in split plane)
 * - animNull is rotX-only (large compound rz + cheek-to-camera = plate-on-face)
 * - Tip tip-zeroed onto log TOP CENTER; uniform scale
 */

export const AXE_ANIM_DURATION = 0.78;
export const AXE_ANIM_FADE = 0.14;
export const AXE_ANIM_IMPACT_AT = 0.12;

/** Uniform model scale. */
export const AXE_MODEL_SCALE = 1.0;

/**
 * Rest yaw: cheek ±Z → pivot ±X (camera-right / split normal after lookAt).
 * Camera sees the wedge biting the top — not cheek plastered on bark.
 */
export const AXE_MODEL_YAW = Math.PI / 2;

/** Blade tip in AuxScene / authoring space (build_axe_placeholder XE,y). */
export const AXE_TIP_LOCAL: readonly [number, number, number] = [-0.162, 0.05, 0];

/** Poll / eye reference (authoring +X from tip). */
export const AXE_POLL_LOCAL: readonly [number, number, number] = [0.059, 0.05, 0];

/** Handle butt reference (authoring +Y). */
export const AXE_HANDLE_TOP_LOCAL: readonly [number, number, number] = [0, 1.098, 0];

export type AxeKey = {
  t: number;
  p: readonly [number, number, number];
  q: readonly [number, number, number, number];
};

/**
 * Five keys; smoothstep between neighbours.
 * Quaternions are pure Euler(rotX, 0, 0). MODEL_YAW on the mesh does the rest.
 * Impact ~rotX 48°: edge world −Y, handle up, tip on pivot origin.
 */
export const AXE_KEYS: readonly AxeKey[] = [
  // wind-up — rotX 62°
  { t: 0, p: [0.02, 0.56956, -0.0602], q: [0.51504, 0, 0, 0.85717] },
  // pre-strike — rotX 54°
  { t: 0.06, p: [0.01, 0.26167, -0.10567], q: [0.45399, 0, 0, 0.89101] },
  // impact — tip on log top center; rotX 48°
  { t: AXE_ANIM_IMPACT_AT, p: [0, 0.09893, -0.14556], q: [0.40674, 0, 0, 0.91355] },
  // follow-through — rotX 42°
  { t: 0.34, p: [0, 0.06324, -0.17385], q: [0.35837, 0, 0, 0.93358] },
  // exit — rotX 28°
  { t: AXE_ANIM_DURATION, p: [0.02, 0.00191, -0.21651], q: [0.24192, 0, 0, 0.9703] },
];
