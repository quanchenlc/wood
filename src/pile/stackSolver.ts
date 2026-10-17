import * as THREE from "three";
import { Box, Polygon, Vec2, World, type Body } from "planck";
import { INCH } from "../config/constants";

const GRAVITY = -10;
const TIME_STEP = 1 / 60;
const MAX_STEPS = 400;
const SLOT_SPACING = 5 * INCH;
const SPAWN_SPACING = 5 * INCH;
const MAX_HULL_POINTS = 8;

export interface SlotLayout {
  piece: THREE.Mesh;
  slotX: number;
  slotGridY: number;
  physicalBaseY: number;
  thickness: number;
  isXThinner: boolean;
  tierLevel: number;
  startAngle: number;
}

export interface CrossSection {
  polygon: THREE.Vector2[];
  width: number;
  height: number;
  isXThinner: boolean;
}

export interface SettledShape {
  polygon: THREE.Vector2[];
  halfWidth: number;
  halfHeight: number;
  position: THREE.Vector2;
  angle: number;
}

export interface BatchPlacement {
  simX: number;
  simY: number;
  simAngle: number;
  crossSection: CrossSection;
  isXThinner: boolean;
  tierLevel: number;
  startAngle: number;
}

export function settleBatch(
  layouts: SlotLayout[],
  previouslySettled: SettledShape[],
): { placements: BatchPlacement[]; settled: SettledShape[] } {
  const world = new World({ gravity: Vec2(0, GRAVITY) });
  world
    .createBody({ type: "static" })
    .createFixture({ shape: Box(10, 0.01), friction: 1 });

  for (const shape of previouslySettled) {
    const body = world.createBody({
      type: "static",
      position: Vec2(shape.position.x, shape.position.y),
      angle: shape.angle,
    });
    try {
      body.createFixture({
        shape: Polygon(shape.polygon.map((point) => Vec2(point.x, point.y))),
        friction: 1,
      });
    } catch {
      body.createFixture({
        shape: Box(shape.halfWidth, shape.halfHeight),
        friction: 1,
      });
    }
  }

  const ordered = layouts
    .map((layout, originalIndex) => ({ layout, originalIndex }))
    .sort((a, b) => a.layout.physicalBaseY - b.layout.physicalBaseY);
  const bodies: Body[] = Array(layouts.length);
  const sections: CrossSection[] = Array(layouts.length);

  ordered.forEach(({ layout, originalIndex }, order) => {
    const section = getCrossSection2D(layout.piece);
    const x = layout.slotX * SLOT_SPACING;
    const y =
      layout.physicalBaseY +
      layout.thickness / 2 +
      SPAWN_SPACING * (order + 1);
    const body = world.createDynamicBody({
      position: Vec2(x, y),
      angle: (Math.random() - 0.5) * 0.08,
      linearDamping: 1,
      angularDamping: 2,
    });
    try {
      body.createFixture({
        shape: Polygon(section.polygon.map((point) => Vec2(point.x, point.y))),
        density: 1,
        friction: 0.9,
        restitution: 0.01,
      });
    } catch {
      body.createFixture({
        shape: Box(section.width / 2, section.height / 2),
        density: 1,
        friction: 0.9,
        restitution: 0.01,
      });
    }
    bodies[originalIndex] = body;
    sections[originalIndex] = section;
  });

  for (let i = 0; i < MAX_STEPS; i++) {
    world.step(TIME_STEP);
    for (const body of bodies) {
      const velocity = body.getLinearVelocity();
      body.setLinearVelocity(Vec2(velocity.x * 0.05, velocity.y));
    }
    if (i === 150) {
      for (const body of bodies) {
        body.setLinearDamping(3);
        body.setAngularDamping(5);
      }
    }
    if (i > 200 && bodies.every(isStill)) {
      break;
    }
  }

  const placements: BatchPlacement[] = [];
  const settled = previouslySettled.map((shape) => ({
    ...shape,
    polygon: shape.polygon.map((point) => point.clone()),
    position: shape.position.clone(),
  }));

  bodies.forEach((body, index) => {
    body.setLinearVelocity(Vec2());
    body.setAngularVelocity(0);
    const layout = layouts[index];
    const section = sections[index];
    const simulated = body.getPosition();
    // 与参考站一致：横向吸回槽位中心，竖直高度限制在支撑层附近，防止数值悬空。
    const simX = layout.slotX * SLOT_SPACING;
    const intendedCenter = layout.physicalBaseY + layout.thickness / 2;
    const simY = Math.max(
      section.height * 0.15,
      Math.min(simulated.y, intendedCenter + layout.thickness),
    );
    const angle = body.getAngle();
    placements.push({
      simX,
      simY,
      simAngle: angle,
      crossSection: section,
      isXThinner: layout.isXThinner,
      tierLevel: layout.tierLevel,
      startAngle: layout.startAngle,
    });
    settled.push({
      polygon: section.polygon.map((point) => point.clone()),
      halfWidth: section.width / 2,
      halfHeight: section.height / 2,
      position: new THREE.Vector2(simX, simY),
      angle,
    });
  });

  return { placements, settled };
}

function isStill(body: Body): boolean {
  return (
    Math.abs(body.getLinearVelocity().y) <= 0.005 &&
    Math.abs(body.getAngularVelocity()) <= 0.005
  );
}

function getCrossSection2D(mesh: THREE.Mesh): CrossSection {
  mesh.geometry.computeBoundingBox();
  const size = mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
  const isXThinner = size.x < size.z;
  const position = mesh.geometry.getAttribute("position");
  const points: THREE.Vector2[] = [];
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    points.push(
      isXThinner
        ? new THREE.Vector2(point.z, point.x)
        : new THREE.Vector2(-point.x, point.z),
    );
  }
  const hull = simplifyHull(convexHull(points), MAX_HULL_POINTS);
  if (hull.length < 3) {
    const width = Math.max(size.x, size.z);
    const height = Math.min(size.x, size.z);
    return {
      polygon: [
        new THREE.Vector2(-width / 2, -height / 2),
        new THREE.Vector2(width / 2, -height / 2),
        new THREE.Vector2(width / 2, height / 2),
        new THREE.Vector2(-width / 2, height / 2),
      ],
      width,
      height,
      isXThinner,
    };
  }

  const box = new THREE.Box2().setFromPoints(hull);
  const center = box.getCenter(new THREE.Vector2());
  const dimensions = box.getSize(new THREE.Vector2());
  return {
    polygon: hull.map((vertex) => vertex.sub(center)),
    width: dimensions.x,
    height: dimensions.y,
    isXThinner,
  };
}

function convexHull(points: THREE.Vector2[]): THREE.Vector2[] {
  const sorted = points
    .map((point) => point.clone())
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length <= 2) return sorted;
  const cross = (o: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: THREE.Vector2[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: THREE.Vector2[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i];
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function simplifyHull(hull: THREE.Vector2[], limit: number): THREE.Vector2[] {
  const result = hull.map((point) => point.clone());
  while (result.length > limit) {
    let smallestArea = Infinity;
    let removeIndex = -1;
    for (let i = 0; i < result.length; i++) {
      const prev = result[(i - 1 + result.length) % result.length];
      const current = result[i];
      const next = result[(i + 1) % result.length];
      const area = Math.abs(
        (current.x - prev.x) * (next.y - prev.y) -
          (next.x - prev.x) * (current.y - prev.y),
      );
      if (area < smallestArea) {
        smallestArea = area;
        removeIndex = i;
      }
    }
    result.splice(removeIndex, 1);
  }
  return result;
}
