/**
 * Build stump variants A (Poly Haven tree_stump_01 + end-grain cap) and B (procedural),
 * plus LODs, colliders, and forest-floor ground textures.
 */
import { existsSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  prune,
  weld,
  simplify,
  cloneDocument,
} from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const DL = "/tmp/ip-clean-dl";
const OUT_A = join(ROOT, "public/assets/stump-a");
const OUT_B = join(ROOT, "public/assets/stump-b");
const ASSETS = join(ROOT, "public/assets");

const TARGET_R = 0.28;
const TARGET_H = 0.45;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function meshBBox(doc) {
  let minY = Infinity,
    maxY = -Infinity,
    maxR = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      if (!pos) continue;
      const arr = pos.getArray();
      for (let i = 0; i < arr.length; i += 3) {
        const x = arr[i],
          y = arr[i + 1],
          z = arr[i + 2];
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        maxR = Math.max(maxR, Math.hypot(x, z));
      }
    }
  }
  return { minY, maxY, maxR, height: maxY - minY };
}

/** Apply uniform XZ scale + Y stretch so top sits at y=0 and height≈TARGET_H. */
function fitStumpNodes(doc, targetR = TARGET_R, targetH = TARGET_H) {
  const { minY, maxY, maxR } = meshBBox(doc);
  const scaleXZ = targetR / Math.max(maxR, 1e-6);
  const rawH = (maxY - minY) * scaleXZ;
  const scaleY = (targetH / Math.max(rawH, 1e-6)) * scaleXZ;
  // After scale, top = maxY*scaleY + ty = 0 → ty = -maxY*scaleY
  const yOff = -maxY * scaleY;
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh() && node.listChildren().length === 0) continue;
    const t = node.getTranslation();
    const s = node.getScale();
    node.setScale([s[0] * scaleXZ, s[1] * scaleY, s[2] * scaleXZ]);
    node.setTranslation([t[0] * scaleXZ, t[1] * scaleY + yOff, t[2] * scaleXZ]);
  }
  return { scaleXZ, scaleY, yOff, rawH };
}

/** Flat end-grain disc at y≈0 with our top.jpg. */
function addEndGrainCap(doc, radius = TARGET_R * 0.92) {
  const buffer = doc.getRoot().listBuffers()[0] || doc.createBuffer().setURI("stump.bin");
  const segs = 48;
  const positions = [0, 0.002, 0];
  const normals = [0, 1, 0];
  const uvs = [0.5, 0.5];
  const indices = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    positions.push(Math.cos(a) * radius, 0.002, Math.sin(a) * radius);
    normals.push(0, 1, 0);
    uvs.push(0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a));
  }
  for (let i = 0; i < segs; i++) {
    indices.push(0, 1 + i, 1 + ((i + 1) % segs));
  }
  const posAcc = doc
    .createAccessor()
    .setType("VEC3")
    .setArray(new Float32Array(positions))
    .setBuffer(buffer);
  const nrmAcc = doc
    .createAccessor()
    .setType("VEC3")
    .setArray(new Float32Array(normals))
    .setBuffer(buffer);
  const uvAcc = doc
    .createAccessor()
    .setType("VEC2")
    .setArray(new Float32Array(uvs))
    .setBuffer(buffer);
  const idxAcc = doc
    .createAccessor()
    .setType("SCALAR")
    .setArray(new Uint16Array(indices))
    .setBuffer(buffer);

  const tex = doc.createTexture("stump_top").setURI("stump_top.jpg").setMimeType("image/jpeg");
  // image bytes filled by caller after create
  const mat = doc
    .createMaterial("endgrain")
    .setBaseColorTexture(tex)
    .setMetallicFactor(0)
    .setRoughnessFactor(0.88);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", posAcc)
    .setAttribute("NORMAL", nrmAcc)
    .setAttribute("TEXCOORD_0", uvAcc)
    .setIndices(idxAcc)
    .setMaterial(mat)
    .setMode(4);
  const mesh = doc.createMesh("endgrain_cap").addPrimitive(prim);
  const node = doc.createNode("endgrain_cap").setMesh(mesh);
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  scene.addChild(node);
}

async function writeHeroAndLod(doc, outDir) {
  for (const b of doc.getRoot().listBuffers()) b.setURI("stump.bin");
  await io.write(join(outDir, "stump.gltf"), doc);

  await MeshoptSimplifier.ready;
  const lodDoc = cloneDocument(doc);
  await lodDoc.transform(
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.3, error: 0.012 }),
  );
  for (const b of lodDoc.getRoot().listBuffers()) b.setURI("stump_lod.bin");
  await io.write(join(outDir, "stump_lod.gltf"), lodDoc);
}

async function makeCollider(outPath, radius = TARGET_R, height = TARGET_H) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const segs = 24;
  const positions = [];
  const indices = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    positions.push(x, 0, z, x, -height, z);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const posAcc = doc
    .createAccessor()
    .setType("VEC3")
    .setArray(new Float32Array(positions))
    .setBuffer(buffer);
  const idxAcc = doc
    .createAccessor()
    .setType("SCALAR")
    .setArray(new Uint16Array(indices))
    .setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", posAcc)
    .setIndices(idxAcc)
    .setMode(4);
  const mesh = doc.createMesh("stump_collider").addPrimitive(prim);
  const collider = doc.createNode("stump_collider").setMesh(mesh);
  const instance = doc
    .createNode("instance")
    .setTranslation([-5.3, 0, 0])
    .setScale([-1, 1, 1]);
  const scene = doc.createScene("data").addChild(collider).addChild(instance);
  doc.getRoot().setDefaultScene(scene);
  await io.write(outPath, doc);
  console.log("[collider]", outPath);
}

async function processPhStumpA() {
  ensureDir(OUT_A);
  const gltfPath = join(DL, "tree_stump_01_1k.gltf");
  if (!existsSync(gltfPath)) throw new Error("missing PH stump gltf");

  const { readFileSync } = await import("node:fs");
  const diffSrc = join(DL, "textures/tree_stump_01_diff_1k.jpg");
  const norSrc = join(DL, "textures/tree_stump_01_nor_gl_1k.jpg");

  // 1024 colour / 512 normal (JPEG) — stay near 1.5–2.5MB hero budget
  const bcBuf = await sharp(diffSrc)
    .resize(1024, 1024, { fit: "cover" })
    .jpeg({ quality: 82 })
    .toBuffer();
  const norBuf = await sharp(norSrc)
    .resize(512, 512, { fit: "cover" })
    .jpeg({ quality: 80 })
    .toBuffer();
  const topBuf = await sharp(join(ASSETS, "top.jpg"))
    .resize(512, 512)
    .jpeg({ quality: 85 })
    .toBuffer();
  writeFileSync(join(OUT_A, "stump_baseColor.jpg"), bcBuf);
  writeFileSync(join(OUT_A, "stump_normal.jpg"), norBuf);
  writeFileSync(join(OUT_A, "stump_top.jpg"), topBuf);

  const forest = join(DL, "forest_leaves_03_diff_1k.jpg");
  if (existsSync(forest)) {
    await sharp(forest)
      .resize(1024, 1024, { fit: "cover" })
      .jpeg({ quality: 82 })
      .toFile(join(OUT_A, "ground_floor.jpg"));
  }

  let doc = await io.read(gltfPath);
  for (const img of doc.getRoot().listTextures()) {
    const name = (img.getName() || img.getURI() || "").toLowerCase();
    if (name.includes("nor")) {
      img.setImage(norBuf);
      img.setURI("stump_normal.jpg");
      img.setMimeType("image/jpeg");
    } else if (name.includes("diff") || name.includes("col") || name.includes("base")) {
      img.setImage(bcBuf);
      img.setURI("stump_baseColor.jpg");
      img.setMimeType("image/jpeg");
    } else if (name.includes("arm") || name.includes("orm") || name.includes("rough")) {
      img.dispose();
    }
  }
  await doc.transform(prune());

  // Simplify hero mesh before fit so bin stays small
  await MeshoptSimplifier.ready;
  await doc.transform(
    dedup(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.55, error: 0.008 }),
  );

  const fit = fitStumpNodes(doc);
  console.log("[A fit]", fit);

  addEndGrainCap(doc, TARGET_R * 0.9);
  // Patch end-grain texture image bytes
  for (const tex of doc.getRoot().listTextures()) {
    if ((tex.getURI() || "").includes("stump_top")) {
      tex.setImage(topBuf);
      tex.setMimeType("image/jpeg");
    }
  }

  await writeHeroAndLod(doc, OUT_A);
  // Re-assert external texture files (gltf-transform may rewrite)
  writeFileSync(join(OUT_A, "stump_baseColor.jpg"), bcBuf);
  writeFileSync(join(OUT_A, "stump_normal.jpg"), norBuf);
  writeFileSync(join(OUT_A, "stump_top.jpg"), topBuf);
  // Drop leftover png if any
  const png = join(OUT_A, "stump_normal.png");
  if (existsSync(png)) {
    const { unlinkSync } = await import("node:fs");
    unlinkSync(png);
  }

  await makeCollider(join(OUT_A, "stump_data.glb"));
  console.log("[A done]", OUT_A, "bc", bcBuf.length, "nor", norBuf.length, "top", topBuf.length);
}

async function processProceduralStumpB() {
  ensureDir(OUT_B);

  // Atlas: bark (top half) + end-grain (bottom half)
  const barkBuf = await sharp(join(ASSETS, "outsidebark.jpg")).resize(1024, 512).jpeg().toBuffer();
  const topBuf = await sharp(join(ASSETS, "top.jpg")).resize(512, 512).jpeg().toBuffer();
  await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: "#8a7a68" },
  })
    .composite([
      { input: barkBuf, top: 0, left: 0 },
      { input: topBuf, top: 512, left: 256 },
    ])
    .jpeg({ quality: 88 })
    .toFile(join(OUT_B, "stump_baseColor.jpg"));

  await sharp(join(ASSETS, "outsidebark_n.jpg"))
    .resize(512, 512)
    .png()
    .toFile(join(OUT_B, "stump_normal.png"));

  // Forest floor — prefer ambientCG Ground037 if cached, else PH leaves
  const groundCandidates = [
    join(DL, "acg/Ground037/Ground037_1K-JPG_Color.jpg"),
    join(DL, "acg/Ground037_1K-JPG/Ground037_1K-JPG_Color.jpg"),
    join(DL, "forest_leaves_03_diff_1k.jpg"),
  ];
  let groundSrc = groundCandidates.find((p) => existsSync(p));
  if (!groundSrc) {
    // try unzip again
    const gzip = join(DL, "acg/Ground037.zip");
    if (existsSync(gzip)) {
      spawnSync("unzip", ["-o", "-q", gzip, "-d", join(DL, "acg/Ground037")], {
        stdio: "inherit",
      });
      const found = spawnSync("bash", [
        "-lc",
        `ls ${DL}/acg/Ground037/**/*Color* ${DL}/acg/Ground037/*Color* 2>/dev/null | head -1`,
      ])
        .stdout.toString()
        .trim();
      if (found) groundSrc = found;
    }
  }
  if (!groundSrc) groundSrc = join(DL, "forest_leaves_03_diff_1k.jpg");
  await sharp(groundSrc)
    .modulate({ saturation: 0.9, brightness: 0.95 })
    .resize(1024, 1024)
    .jpeg({ quality: 85 })
    .toFile(join(OUT_B, "ground_floor.jpg"));

  // Procedural mesh: flared base, ridged bark, uneven top, scattered chip wedges
  const meshPy = `
import json, math, numpy as np
from pathlib import Path
out = Path(${JSON.stringify(OUT_B)})
R_TOP, R_BOT, H = 0.275, 0.36, 0.45
segs, stacks = 56, 14
rng = np.random.default_rng(7)
verts=[]; uvs=[]; norms=[]; idx=[]
def add_v(x,y,z,u,v,nx,ny,nz):
    verts.extend([float(x),float(y),float(z)]); uvs.extend([float(u),float(v)]); norms.extend([float(nx),float(ny),float(nz)]); return len(verts)//3-1

# Side walls — stronger silhouette wobble than A
for j in range(stacks+1):
    t=j/stacks
    y = -t*H
    r = R_TOP*(1-t) + R_BOT*t
    r *= 1 + 0.06*math.sin(t*math.pi*2.5) + 0.03*math.sin(t*math.pi*5)
    for i in range(segs):
        a=2*math.pi*i/segs
        rw = r * (1 + 0.07*math.sin(a*4 + t*3) + 0.03*math.cos(a*7))
        x,z = rw*math.cos(a), rw*math.sin(a)
        nx,nz = math.cos(a), math.sin(a)
        add_v(x,y,z, i/segs, t*0.48, nx,0,nz)
for j in range(stacks):
    for i in range(segs):
        a=j*segs+i; b=j*segs+(i+1)%segs
        c=(j+1)*segs+i; d=(j+1)*segs+(i+1)%segs
        idx.extend([a,c,b, b,c,d])

# Uneven top disc (end-grain UV region u in [0.25..0.75], v in [0.5..1])
center=add_v(0,0.0,0, 0.5, 0.75, 0,1,0)
ring=[]
for i in range(segs):
    a=2*math.pi*i/segs
    bump=0.018*math.sin(a*3)+0.012*math.cos(a*5)+0.006*math.sin(a*8)
    # slight oval
    rx = R_TOP*(1+0.04*math.cos(a*2))
    rz = R_TOP*(1-0.03*math.sin(a*2))
    x,z=rx*math.cos(a), rz*math.sin(a)
    u=0.5+0.22*math.cos(a); v=0.75+0.22*math.sin(a)
    ring.append(add_v(x,bump,z,u,v,0,1,0))
for i in range(segs):
    idx.extend([center, ring[i], ring[(i+1)%segs]])

# Bottom
bc=add_v(0,-H,0,0.5,0.55,0,-1,0)
bring=[]
for i in range(segs):
    a=2*math.pi*i/segs
    x,z=R_BOT*math.cos(a), R_BOT*math.sin(a)
    bring.append(add_v(x,-H,z,0.1,0.55,0,-1,0))
for i in range(segs):
    idx.extend([bc, bring[(i+1)%segs], bring[i]])

# Scattered chip wedges around base (local bark/end mix)
for k in range(10):
    ang = 2*math.pi*k/10 + rng.uniform(-0.15,0.15)
    dist = R_BOT*0.85 + rng.uniform(0.02,0.08)
    cx,cz = dist*math.cos(ang), dist*math.sin(ang)
    cy = -H + 0.02
    w = rng.uniform(0.03,0.06); L=rng.uniform(0.04,0.09); th=rng.uniform(0.012,0.025)
    ca,sa=math.cos(ang),math.sin(ang)
    corners=[]
    for dx,dy,dz in [(-w,0,-L),(w,0,-L),(w,0,L),(-w,0,L),(-w,th,-L),(w,th,-L),(w,th,L),(-w,th,L)]:
        x = cx + dx*ca - dz*sa
        z = cz + dx*sa + dz*ca
        corners.append(add_v(x,cy+dy,z, 0.1+0.1*dx, 0.55+0.1*dz, 0,1,0))
    faces=[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]
    for a,b,c,d in faces:
        idx.extend([corners[a],corners[b],corners[c], corners[a],corners[c],corners[d]])

pos=np.array(verts,np.float32); nrm=np.array(norms,np.float32); uv=np.array(uvs,np.float32); ix=np.array(idx,np.uint16)
# pad blob to 4
parts=[pos.tobytes(), nrm.tobytes(), uv.tobytes(), ix.tobytes()]
blob=b''; bv=[]; off=0
for raw, is_idx in zip(parts,[False,False,False,True]):
    bv.append({"buffer":0,"byteOffset":off,"byteLength":len(raw),"target":34963 if is_idx else 34962})
    blob += raw; off += len(raw)
    while off%4: blob += b'\\x00'; off=len(blob)
bin_path=out/'stump.bin'; bin_path.write_bytes(blob)
gltf={
 "asset":{"version":"2.0","generator":"firewood-ip-clean-B"},
 "buffers":[{"byteLength":len(blob),"uri":"stump.bin"}],
 "bufferViews":bv,
 "accessors":[
   {"bufferView":0,"componentType":5126,"count":len(pos)//3,"type":"VEC3","min":pos.reshape(-1,3).min(0).tolist(),"max":pos.reshape(-1,3).max(0).tolist()},
   {"bufferView":1,"componentType":5126,"count":len(nrm)//3,"type":"VEC3"},
   {"bufferView":2,"componentType":5126,"count":len(uv)//2,"type":"VEC2"},
   {"bufferView":3,"componentType":5123,"count":len(ix),"type":"SCALAR"},
 ],
 "images":[{"uri":"stump_baseColor.jpg"},{"uri":"stump_normal.png"}],
 "samplers":[{"magFilter":9729,"minFilter":9987,"wrapS":10497,"wrapT":10497}],
 "textures":[{"sampler":0,"source":0},{"sampler":0,"source":1}],
 "materials":[{"name":"stump","pbrMetallicRoughness":{"baseColorTexture":{"index":0},"metallicFactor":0,"roughnessFactor":0.85},"normalTexture":{"index":1}}],
 "meshes":[{"name":"stump","primitives":[{"attributes":{"POSITION":0,"NORMAL":1,"TEXCOORD_0":2},"indices":3,"material":0}]}],
 "nodes":[{"name":"stump","mesh":0}],
 "scenes":[{"nodes":[0]}],
 "scene":0
}
(out/'stump.gltf').write_text(json.dumps(gltf))
print('B verts', len(pos)//3, 'tris', len(ix)//3, 'Y', pos.reshape(-1,3).min(0)[1], pos.reshape(-1,3).max(0)[1])
`;
  writeFileSync("/tmp/ip-clean-dl/gen_stump_b.py", meshPy);
  const py = spawnSync("python3", ["/tmp/ip-clean-dl/gen_stump_b.py"], { stdio: "inherit" });
  if (py.status !== 0) throw new Error("stump B mesh gen failed");

  let doc = await io.read(join(OUT_B, "stump.gltf"));
  await writeHeroAndLod(doc, OUT_B);
  await makeCollider(join(OUT_B, "stump_data.glb"));
  console.log("[B done]", OUT_B);
}

function installDefaultFromA() {
  for (const name of [
    "stump.gltf",
    "stump.bin",
    "stump_baseColor.jpg",
    "stump_normal.jpg",
    "stump_normal.png", // legacy name if still present
    "stump_top.jpg",
    "stump_lod.gltf",
    "stump_lod.bin",
    "stump_data.glb",
    "ground_floor.jpg",
  ]) {
    const src = join(OUT_A, name);
    if (existsSync(src)) cpSync(src, join(ASSETS, name));
  }
  // Prefer jpg normal as stump_normal.png alias only if png missing — update gltf refs already jpg
  console.log("[install default A → public/assets]");
}

async function main() {
  await processPhStumpA();
  await processProceduralStumpB();
  installDefaultFromA();
  const { readFileSync } = await import("node:fs");
  for (const dir of [OUT_A, OUT_B]) {
    let n = 0;
    for (const f of [
      "stump.bin",
      "stump_baseColor.jpg",
      "stump_normal.jpg",
      "stump_normal.png",
      "stump_lod.bin",
      "stump_top.jpg",
    ]) {
      const p = join(dir, f);
      if (existsSync(p)) n += readFileSync(p).byteLength;
    }
    console.log(dir, "core bytes", n, (n / 1024 / 1024).toFixed(2), "MB");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
