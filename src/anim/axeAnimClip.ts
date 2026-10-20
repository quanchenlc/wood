/**
 * Self-authored axe swing clip metadata (0.4.11).
 *
 * Runtime plays `public/assets/axe_swing_clip.glb` via AnimationMixer +
 * orientToCamera (same control flow as early wood / screen.toys). Clip TRS
 * lives in the GLB only — built by `minigame/scripts/build_axe_swing_clip.mjs`
 * from our wood-handle axe axes. No ax_anim_v03 floats.
 *
 * 0.4.10: no scale-to-zero fade; exit via follow-through off-frame.
 * 0.4.11: same leave poses, ~33% shorter post-hit arc (snappier 下落收尾).
 * Keep axeContactPoint (bbox max.y) + impact local blade orientation.
 */

/** Must match build_axe_swing_clip.mjs DUR. */
export const AXE_ANIM_DURATION = 0.68;

/** Must match build_axe_swing_clip.mjs IMPACT_AT. */
export const AXE_ANIM_IMPACT_AT = 0.12;

/** Uniform model scale on the wood-handle placeholder — never faded. */
export const AXE_MODEL_SCALE = 1.0;

/**
 * Blade tip in AuxScene / authoring space (build_axe_placeholder XE,y).
 * Used only for harness getImpactDebug — clip tip-zeros this onto the pivot.
 */
export const AXE_TIP_LOCAL: readonly [number, number, number] = [-0.162, 0.05, 0];

/** Poll / eye reference (authoring +X from tip). */
export const AXE_POLL_LOCAL: readonly [number, number, number] = [0.059, 0.05, 0];

/** Handle butt reference (authoring +Y). */
export const AXE_HANDLE_TOP_LOCAL: readonly [number, number, number] = [0, 1.098, 0];
