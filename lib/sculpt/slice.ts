import * as THREE from "three";

export type SwipeSample = {
  x: number;
  y: number;
  time: number;
};

export type SlicePlane = {
  normal: THREE.Vector3;
  point: THREE.Vector3;
  swipeDirection: THREE.Vector2;
  speed: number;
};

const SWIPE_VELOCITY_THRESHOLD = 1.8;
const SWIPE_MIN_DISTANCE = 0.06;

export function computeSwipeVelocity(samples: SwipeSample[]): number {
  if (samples.length < 2) return 0;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = Math.max(0.001, (last.time - first.time) / 1000);
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  return Math.hypot(dx, dy) / dt;
}

export function detectFastSwipe(samples: SwipeSample[]): SlicePlane | null {
  if (samples.length < 2) return null;

  const first = samples[0];
  const last = samples[samples.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const distance = Math.hypot(dx, dy);

  if (distance < SWIPE_MIN_DISTANCE) return null;

  const velocity = computeSwipeVelocity(samples);
  if (velocity < SWIPE_VELOCITY_THRESHOLD) return null;

  const swipeDir = new THREE.Vector2(dx, dy).normalize();
  const normal = new THREE.Vector3(-swipeDir.y, swipeDir.x, 0.35).normalize();
  const midX = (first.x + last.x) * 0.5;
  const midY = (first.y + last.y) * 0.5;
  const point = new THREE.Vector3((midX - 0.5) * 3.2, (0.5 - midY) * 3.2, 0);

  return {
    normal,
    point,
    swipeDirection: swipeDir,
    speed: velocity,
  };
}

export function buildGeometryFromPositions(
  positions: Float32Array,
  normals: Float32Array,
  uvs: Float32Array,
  indices: Uint32Array,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export function splitGeometryByPlane(
  geometry: THREE.BufferGeometry,
  plane: THREE.Plane,
): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
  const normAttr = geometry.getAttribute("normal") as THREE.BufferAttribute;
  const uvAttr = geometry.getAttribute("uv") as THREE.BufferAttribute;
  const index = geometry.getIndex();

  const sideA = { positions: [] as number[], normals: [] as number[], uvs: [] as number[], indices: [] as number[] };
  const sideB = { positions: [] as number[], normals: [] as number[], uvs: [] as number[], indices: [] as number[] };
  const vertexMapA = new Map<number, number>();
  const vertexMapB = new Map<number, number>();

  const getSide = (i: number) => {
    const v = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    return plane.distanceToPoint(v) >= 0 ? "A" : "B";
  };

  const addVertex = (side: "A" | "B", vi: number) => {
    const map = side === "A" ? vertexMapA : vertexMapB;
    const bucket = side === "A" ? sideA : sideB;
    if (map.has(vi)) return map.get(vi)!;

    const idx = bucket.positions.length / 3;
    bucket.positions.push(posAttr.getX(vi), posAttr.getY(vi), posAttr.getZ(vi));
    bucket.normals.push(normAttr.getX(vi), normAttr.getY(vi), normAttr.getZ(vi));
    bucket.uvs.push(uvAttr.getX(vi), uvAttr.getY(vi));
    map.set(vi, idx);
    return idx;
  };

  const triCount = index ? index.count / 3 : posAttr.count / 3;

  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;

    const s0 = getSide(i0);
    const s1 = getSide(i1);
    const s2 = getSide(i2);

    let side: "A" | "B";
    if (s0 === s1 && s1 === s2) {
      side = s0;
    } else {
      const cx = (posAttr.getX(i0) + posAttr.getX(i1) + posAttr.getX(i2)) / 3;
      const cy = (posAttr.getY(i0) + posAttr.getY(i1) + posAttr.getY(i2)) / 3;
      const cz = (posAttr.getZ(i0) + posAttr.getZ(i1) + posAttr.getZ(i2)) / 3;
      side = plane.distanceToPoint(new THREE.Vector3(cx, cy, cz)) >= 0 ? "A" : "B";
    }

    const bucket = side === "A" ? sideA : sideB;
    const a = addVertex(side, i0);
    const b = addVertex(side, i1);
    const c = addVertex(side, i2);
    bucket.indices.push(a, b, c);
  }

  const toGeo = (bucket: typeof sideA) => {
    if (bucket.positions.length === 0) {
      return new THREE.BufferGeometry();
    }
    return buildGeometryFromPositions(
      new Float32Array(bucket.positions),
      new Float32Array(bucket.normals),
      new Float32Array(bucket.uvs),
      new Uint32Array(bucket.indices),
    );
  };

  return [toGeo(sideA), toGeo(sideB)];
}

export function applySliceImpulse(
  side: "A" | "B",
  plane: SlicePlane,
  speed: number,
): THREE.Vector3 {
  const sign = side === "A" ? 1 : -1;
  const impulse = plane.normal.clone().multiplyScalar(sign * Math.min(speed * 0.08, 0.65));
  impulse.add(new THREE.Vector3(plane.swipeDirection.x * 0.15, -plane.swipeDirection.y * 0.15, 0.1));
  return impulse;
}

export function createSlicePlaneFromGesture(plane: SlicePlane): THREE.Plane {
  return new THREE.Plane().setFromNormalAndCoplanarPoint(plane.normal, plane.point);
}

export type SculptVariant = "ribbon" | "glass-ring" | "metallic-cloth" | "neon-sphere";

function makeRibbon(): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  const SAMPLES = 120;
  for (let i = 0; i < SAMPLES; i++) {
    const a = (i / SAMPLES) * Math.PI * 2;
    points.push(
      new THREE.Vector3(
        Math.sin(a * 2) * 1.0 + Math.cos(a * 3) * 0.35,
        Math.cos(a * 2) * 1.0 + Math.sin(a * 5) * 0.3,
        Math.sin(a * 3) * 0.6,
      ),
    );
  }
  const curve = new THREE.CatmullRomCurve3(points, true, "centripetal");
  const tube = new THREE.TubeGeometry(curve, 240, 0.16, 24, true);
  tube.computeVertexNormals();
  return tube;
}

function makeGlassRing(): THREE.BufferGeometry {
  const geo = new THREE.TorusKnotGeometry(0.95, 0.32, 220, 28, 2, 3);
  geo.computeVertexNormals();
  return geo;
}

function makeMetallicCloth(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(2.4, 2.4, 96, 96);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const r = Math.hypot(x, y);
    const z =
      Math.sin(x * 1.6 + y * 0.8) * 0.35 +
      Math.cos(x * 0.7 - y * 1.4) * 0.28 +
      Math.sin(r * 2.3) * 0.12;
    pos.setZ(i, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  // angle it so we see depth and folds, not a head-on panel
  geo.rotateX(-0.45);
  geo.rotateY(0.35);
  return geo;
}

function makeNeonSphere(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1.25, 96, 64);
  geo.computeVertexNormals();
  return geo;
}

export function createBaseSculptGeometry(
  variant: SculptVariant = "ribbon",
): THREE.BufferGeometry {
  switch (variant) {
    case "ribbon":
      return makeRibbon();
    case "glass-ring":
      return makeGlassRing();
    case "metallic-cloth":
      return makeMetallicCloth();
    case "neon-sphere":
      return makeNeonSphere();
  }
}
