import * as THREE from "three";

/** 悬停时显示参考站同款竖直切割预览线。 */
export class DebugLine {
  private readonly scene: THREE.Scene;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.LineBasicMaterial({
    color: 0xff4444,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  });
  private readonly line: THREE.Line;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.geometry.setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]);
    this.line = new THREE.Line(this.geometry, this.material);
    this.line.renderOrder = 999;
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.line);
  }

  update(worldPoint: THREE.Vector3, mesh: THREE.Mesh, _sliceNormal: THREE.Vector3) {
    mesh.geometry.computeBoundingBox();
    const height = mesh.geometry.boundingBox
      ? mesh.geometry.boundingBox.max.y - mesh.geometry.boundingBox.min.y
      : 0.4;
    const positions = this.geometry.getAttribute("position") as THREE.BufferAttribute;
    positions.setXYZ(0, worldPoint.x, worldPoint.y - height / 2, worldPoint.z);
    positions.setXYZ(1, worldPoint.x, worldPoint.y + height / 2, worldPoint.z);
    positions.needsUpdate = true;
    this.line.visible = true;
  }

  hide() {
    this.line.visible = false;
  }

  dispose() {
    this.scene.remove(this.line);
    this.geometry.dispose();
    this.material.dispose();
  }
}
