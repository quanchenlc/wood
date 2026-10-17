import * as THREE from "three";
import { FOOT, GROUND_Y } from "../config/constants";

/** 地面圆盘。草地长在它上面,落地的柴火也踩在这个高度。 */
export function createGround(scene: THREE.Scene): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(14 * FOOT, 64);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, GROUND_Y, 0);

  const material = new THREE.MeshStandardMaterial({
    color: 0x3f4a26,
    roughness: 1,
    metalness: 0,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
