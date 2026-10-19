/**
 * Build a self-authored axe swing clip GLB (IP-clean).
 *
 * Architecture matches early wood / screen.toys control flow:
 *   scene root → node "anim" (TRS animated) → real axe mesh parented at runtime
 *   + hidden placeholder mesh (so glTF validates)
 *
 * Motion is authored from OUR wood-handle axe axes (handle +Y, edge −X, cheek ±Z)
 * under pivot.lookAt(camera-right), NOT copied from ax_anim_v03 floats.
 *
 * Impact silhouette (matches orig_impact_01):
 *   tip on pivot origin, edge world −Y, cheek along camera-right (+X),
 *   handle toward camera (+Z) — foreshortened from elevated cam, not a vertical stick.
 *
 * Usage: node minigame/scripts/build_axe_swing_clip.mjs [out.glb]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";

const OUT =
  process.argv[2] ||
  resolve(fileURLToPath(new URL("../../public/assets/axe_swing_clip.glb", import.meta.url)));

/** Tip / poll in authoring space (build_axe_placeholder). */
const TIP = [-0.162, 0.05, 0];
const POLL = [0.059, 0.05, 0];

function quatMul(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function quatFromAxisAngle(axis, angle) {
  const [x, y, z] = axis;
  const s = Math.sin(angle / 2);
  return [x * s, y * s, z * s, Math.cos(angle / 2)];
}

function normalizeQuat(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return q.map((v) => v / n);
}

/**
 * Impact rotation (self-authored, tip-zeroed at runtime via translation):
 * edge ≈ world −Y, cheek ≈ +X (blade in split / camera-right), handle mostly
 * toward camera with a slight +Y so the metal head stays readable beside the
 * foreshortened wood handle (orig_impact_01 silhouette — not a vertical stick).
 * Floats are coarse on purpose (not ax_anim_v03 precision windows).
 */
const Q_IMPACT = normalizeQuat([0.51, 0.53, 0.41, 0.54]);

function rotateVec(q, v) {
  const [x, y, z] = v;
  const [qx, qy, qz, qw] = q;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

/** Translation that seats tip at the pivot origin for a given rotation. */
function tipZeroTranslation(q) {
  const t = rotateVec(q, TIP);
  return [-t[0], -t[1], -t[2]];
}

// Swing: wind-up (blade raised, rotated back around camera-right = world +X),
// strike to impact, hold, follow-through (slightly past), settle.
const DUR = 0.8;
const IMPACT_AT = 0.12;

const windupQ = normalizeQuat(
  quatMul(quatFromAxisAngle([1, 0, 0], 0.72), Q_IMPACT),
);
const preQ = normalizeQuat(
  quatMul(quatFromAxisAngle([1, 0, 0], 0.28), Q_IMPACT),
);
const followQ = normalizeQuat(
  quatMul(quatFromAxisAngle([1, 0, 0], -0.18), Q_IMPACT),
);
const exitQ = normalizeQuat(
  quatMul(quatFromAxisAngle([1, 0, 0], -0.42), Q_IMPACT),
);

function lift(q, extraY) {
  const t = tipZeroTranslation(q);
  return [t[0], t[1] + extraY, t[2]];
}

const keys = [
  { t: 0, q: windupQ, p: lift(windupQ, 0.42) },
  { t: 0.06, q: preQ, p: lift(preQ, 0.12) },
  { t: IMPACT_AT, q: Q_IMPACT, p: tipZeroTranslation(Q_IMPACT) },
  { t: 0.36, q: followQ, p: lift(followQ, -0.04) },
  { t: DUR, q: exitQ, p: lift(exitQ, -0.1) },
];

// Round to 4 decimals — clean self-authored literals, not ax_anim windows.
function r4(v) {
  return Math.round(v * 1e4) / 1e4;
}

const times = keys.map((k) => r4(k.t));
const translations = keys.flatMap((k) => k.p.map(r4));
const rotations = keys.flatMap((k) => normalizeQuat(k.q).map(r4));

const doc = new Document();
const buffer = doc.createBuffer();
const animNode = doc.createNode("anim").setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]);

// Tiny hidden cube so the GLB has a mesh (runtime hides all meshes).
const prim = doc
  .createPrimitive()
  .setAttribute(
    "POSITION",
    doc
      .createAccessor()
      .setType("VEC3")
      .setArray(new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0]))
      .setBuffer(buffer),
  )
  .setIndices(
    doc
      .createAccessor()
      .setType("SCALAR")
      .setArray(new Uint16Array([0, 1, 2]))
      .setBuffer(buffer),
  );
const mesh = doc.createMesh("ClipProxy").addPrimitive(prim);
const cube = doc.createNode("Cube").setMesh(mesh);
const root = doc.createNode("axe_swing_root").addChild(animNode).addChild(cube);
doc.createScene("Scene").addChild(root);

const input = doc
  .createAccessor()
  .setType("SCALAR")
  .setArray(new Float32Array(times))
  .setBuffer(buffer);
const outT = doc
  .createAccessor()
  .setType("VEC3")
  .setArray(new Float32Array(translations))
  .setBuffer(buffer);
const outR = doc
  .createAccessor()
  .setType("VEC4")
  .setArray(new Float32Array(rotations))
  .setBuffer(buffer);

const sampT = doc
  .createAnimationSampler()
  .setInput(input)
  .setOutput(outT)
  .setInterpolation("LINEAR");
const sampR = doc
  .createAnimationSampler()
  .setInput(input)
  .setOutput(outR)
  .setInterpolation("LINEAR");
const chT = doc
  .createAnimationChannel()
  .setTargetNode(animNode)
  .setTargetPath("translation")
  .setSampler(sampT);
const chR = doc
  .createAnimationChannel()
  .setTargetNode(animNode)
  .setTargetPath("rotation")
  .setSampler(sampR);
doc
  .createAnimation("axe_swing")
  .addSampler(sampT)
  .addSampler(sampR)
  .addChannel(chT)
  .addChannel(chR);

mkdirSync(dirname(OUT), { recursive: true });
const io = new NodeIO();
const glb = await io.writeBinary(doc);
writeFileSync(OUT, glb);

// Verify linkages survived write
{
  const check = await io.read(OUT);
  const a = check.getRoot().listAnimations()[0];
  if (!a || a.listSamplers().length < 2 || a.listChannels().length < 2) {
    throw new Error(
      `axe_swing_clip write failed: samplers=${a?.listSamplers().length} channels=${a?.listChannels().length}`,
    );
  }
}

// Sanity: tip / edge / cheek at impact
const q = Q_IMPACT;
const p = tipZeroTranslation(q);
const tip = rotateVec(q, TIP).map((v, i) => v + p[i]);
const poll = rotateVec(q, POLL).map((v, i) => v + p[i]);
const edge = [tip[0] - poll[0], tip[1] - poll[1], tip[2] - poll[2]];
const el = Math.hypot(...edge) || 1;
const cheek = rotateVec(q, [0, 0, 1]);
console.log("[axe_swing_clip]", OUT, `${glb.byteLength} bytes`);
console.log("  duration", DUR, "impactAt", IMPACT_AT);
console.log("  impact tip", tip.map(r4));
console.log("  impact edge", edge.map((v) => r4(v / el)));
console.log("  impact cheek", cheek.map(r4));
console.log("  keys", keys.length);
