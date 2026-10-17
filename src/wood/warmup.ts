import * as THREE from "three";
import { createLog } from "./logFactory";
import { sliceWood } from "./slicer";
import type { WoodMaterials } from "./materials";

/** 预热用的临时物件放在场景外这么高的地方,不会入镜 */
const OFFSCREEN_Y = 100;

/**
 * 切片管线预热。
 *
 * 第一次劈柴会明显卡一下,原因有两个:切面材质的着色器还没编译,
 * 三角化那堆代码也还没被 JIT 优化过。开场时在镜头外偷偷劈几刀、
 * 渲染一帧逼着着色器编译,把这一下卡顿挪到 loading 画面里去。
 */
export function warmUpSlicePipeline(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  camera: THREE.Camera,
  materials: WoodMaterials,
  rounds = 3,
) {
  const temporary: THREE.Mesh[] = [];

  for (let i = 0; i < rounds; i++) {
    const { mesh } = createLog(materials);
    mesh.position.set(0, OFFSCREEN_Y, 0);
    mesh.frustumCulled = false;
    scene.add(mesh);
    temporary.push(mesh);

    const pieces = sliceWood(mesh, new THREE.Vector3(1, 0, 0), mesh.position.clone(), materials);
    if (!pieces) continue;

    for (const piece of pieces) {
      piece.frustumCulled = false;
      scene.add(piece);
      temporary.push(piece);
    }

    // 再切一刀:二次切割走的是「已经有切面组」的分支,和首次切割不是同一段代码
    if (i === rounds - 1 && pieces.length > 0) {
      const again = sliceWood(
        pieces[0],
        new THREE.Vector3(0, 0, 1),
        worldOrigin(pieces[0]),
        materials,
      );
      for (const piece of again ?? []) {
        piece.frustumCulled = false;
        scene.add(piece);
        temporary.push(piece);
      }
    }
  }

  // 必须真渲染一帧,着色器才会被提交编译
  renderer.render(scene, camera);

  for (const mesh of temporary) {
    scene.remove(mesh);
    mesh.geometry.dispose();
  }
}

function worldOrigin(mesh: THREE.Mesh): THREE.Vector3 {
  mesh.geometry.computeBoundingBox();
  const center = mesh.geometry.boundingBox!.getCenter(new THREE.Vector3());
  mesh.updateMatrixWorld();
  return center.applyMatrix4(mesh.matrixWorld);
}
