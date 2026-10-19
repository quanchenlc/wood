/**
 * Original authored axe swing (0.4.7).
 *
 * Impact (classic chopping-block silhouette):
 * - Blade plane vertical (contains handle); cutting tip points world −Y (edge down)
 * - Flat cheek toward camera (side profile: handle up, wedge tapering into log top)
 * - Tip seated on log TOP CENTER (slight bite) — not beside / behind the log
 *
 * Mesh (build_axe_placeholder): handle +Y, blade tip −X, cheek ±Z.
 * Impact uses Euler(rx≈16°, 0, rz≈56°) so −X maps mostly to −Y while cheek stays
 * +Z (faces camera after pivot.lookAt). Orientation is rotation-only — never
 * non-uniform scale (that squashed the head into a slab). Tip in AuxScene /
 * authoring space — never Mesh-bin local. No ax_anim_v03 / screen.toys floats.
 */

export const AXE_ANIM_DURATION = 0.78;
export const AXE_ANIM_FADE = 0.14;
export const AXE_ANIM_IMPACT_AT = 0.12;

/** Uniform model scale (believable head∶handle proportions). */
export const AXE_MODEL_SCALE = 0.88;

/** Blade tip in AuxScene / authoring space (build_axe_placeholder XE,y). */
export const AXE_TIP_LOCAL: readonly [number, number, number] = [-0.162, 0.05, 0];

/**
 * Poll / eye reference in authoring space (toward handle from tip along +X).
 * Used by harness to measure blade direction (poll→tip ≈ −X).
 */
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
 * Quaternions are Euler(rx, 0, rz) — cheek +Z, blade toward −Y at impact.
 * Tip targets stay on the pivot XZ origin (log top center).
 */
export const AXE_KEYS: readonly AxeKey[] = [
  // wind-up — raised
  { t: 0, p: [0.14421, 0.48786, 0.00532], q: [0.06705, -0.01923, 0.27497, 0.95892] },
  // pre-strike
  { t: 0.06, p: [0.13192, 0.26817, 0.01449], q: [0.09657, -0.04, 0.38059, 0.91882] },
  // impact — tip on log center (+1.5 cm); edge down; cheek to camera
  { t: AXE_ANIM_IMPACT_AT, p: [0.1162, 0.10496, 0.0258], q: [0.12288, -0.06534, 0.4649, 0.87435] },
  // follow-through
  { t: 0.34, p: [0.10939, 0.09034, 0.0347], q: [0.15038, -0.08682, 0.4924, 0.85287] },
  // exit
  { t: AXE_ANIM_DURATION, p: [0.12809, 0.03983, 0.01591], q: [0.09549, -0.04252, 0.40451, 0.90854] },
];
