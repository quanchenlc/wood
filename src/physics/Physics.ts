import * as THREE from "three";
import * as CANNON from "cannon-es";
import { GROUND_Y, PHYSICS } from "../config/constants";

export interface PhysicsEntry {
  body: CANNON.Body;
  mesh: THREE.Object3D;
  settled: boolean;
  spawnTime: number;
}

/**
 * cannon-es 的薄封装。
 *
 * 这里只管「劈开后的木块掉到地上滚两下」这一件事,所以碰撞体一律用
 * 包围盒近似 —— 木块本身是不规则的切片,用真实凸包既慢又容易卡死,
 * 而观众根本看不出区别。
 */
export class Physics {
  readonly world: CANNON.World;
  private readonly links: PhysicsEntry[] = [];
  private readonly material: CANNON.Material;

  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, PHYSICS.gravity, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    (this.world.solver as CANNON.GSSolver).iterations = PHYSICS.solverIterations;

    this.material = new CANNON.Material("wood");
    this.world.defaultContactMaterial = new CANNON.ContactMaterial(this.material, this.material, {
      friction: PHYSICS.friction,
      restitution: PHYSICS.restitution,
    });

    const ground = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      material: this.material,
    });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    ground.position.set(0, GROUND_Y, 0);
    this.world.addBody(ground);
  }

  /** 树桩当成一个静态圆柱,免得木块穿过去 */
  addStumpCollider(topY: number, radius: number) {
    const height = topY - GROUND_Y;
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Cylinder(radius, radius, height, 16),
      material: this.material,
    });
    body.position.set(0, GROUND_Y + height / 2, 0);
    this.world.addBody(body);
  }

  /**
   * 把一个 mesh 交给物理接管。返回的 body 可以用来施加初速度。
   * mesh 的 position/quaternion 之后由物理驱动,不要再手动改。
   */
  addBody(mesh: THREE.Mesh, mass = 1): PhysicsEntry {
    mesh.geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    mesh.geometry.boundingBox!.getSize(size);

    const body = new CANNON.Body({
      mass,
      shape: new CANNON.Box(
        new CANNON.Vec3(
          Math.max(size.x / 2, 0.005),
          Math.max(size.y / 2, 0.005),
          Math.max(size.z / 2, 0.005),
        ),
      ),
      material: this.material,
      linearDamping: 0.3,
      angularDamping: 0.3,
      allowSleep: true,
      sleepSpeedLimit: 0.3,
      sleepTimeLimit: 0.15,
    });

    body.position.copy(mesh.position as unknown as CANNON.Vec3);
    body.quaternion.copy(mesh.quaternion as unknown as CANNON.Quaternion);
    this.world.addBody(body);
    const entry = { body, mesh, settled: false, spawnTime: performance.now() };
    body.addEventListener("collide", () => {
      body.linearDamping = 0.95;
      body.angularDamping = 0.98;
    });
    this.links.push(entry);
    return entry;
  }

  attach(mesh: THREE.Mesh, options: { mass?: number; velocity?: THREE.Vector3 } = {}): CANNON.Body {
    const entry = this.addBody(mesh, options.mass);
    if (options.velocity) {
      entry.body.velocity.set(options.velocity.x, options.velocity.y, options.velocity.z);
    }
    return entry.body;
  }

  applyThrowImpulse(
    entry: PhysicsEntry,
    linearImpulse: THREE.Vector3,
    angularVelocity?: THREE.Vector3,
  ) {
    entry.body.wakeUp();
    entry.settled = false;
    entry.body.linearDamping = 0.3;
    entry.body.angularDamping = 0.3;
    entry.body.applyImpulse(
      new CANNON.Vec3(linearImpulse.x, linearImpulse.y, linearImpulse.z),
      new CANNON.Vec3(),
    );
    if (angularVelocity) {
      entry.body.angularVelocity.set(angularVelocity.x, angularVelocity.y, angularVelocity.z);
    }
  }

  /** 交还控制权:物理不再驱动这个 mesh(比如它要进入码垛动画了) */
  detach(mesh: THREE.Object3D) {
    const i = this.links.findIndex((l) => l.mesh === mesh);
    if (i < 0) return;
    this.world.removeBody(this.links[i].body);
    this.links.splice(i, 1);
  }

  removeBody(entry: PhysicsEntry) {
    this.world.removeBody(entry.body);
    const i = this.links.indexOf(entry);
    if (i >= 0) this.links.splice(i, 1);
  }

  /** 这个 mesh 是否已经躺稳了(线速度和角速度都得停下来才算) */
  isAsleep(mesh: THREE.Object3D): boolean {
    const link = this.links.find((l) => l.mesh === mesh);
    if (!link) return true;
    return link.settled || link.body.sleepState === CANNON.Body.SLEEPING;
  }

  allSettled(): boolean {
    return this.links.every(
      (entry) => entry.settled || entry.body.sleepState === CANNON.Body.SLEEPING,
    );
  }

  update(dt: number) {
    this.world.step(1 / 60, dt, 3);
    const now = performance.now();
    for (const entry of this.links) {
      const { body, mesh } = entry;
      if (!entry.settled) {
        if (now - entry.spawnTime > 1000) {
          body.velocity.setZero();
          body.angularVelocity.setZero();
          entry.settled = true;
          body.sleep();
        } else if (body.sleepState === CANNON.Body.SLEEPING) {
          entry.settled = true;
        }
      }
      mesh.position.set(body.position.x, body.position.y, body.position.z);
      mesh.quaternion.set(
        body.quaternion.x,
        body.quaternion.y,
        body.quaternion.z,
        body.quaternion.w,
      );
    }
  }

  dispose() {
    this.links.forEach((l) => this.world.removeBody(l.body));
    this.links.length = 0;
  }
}
