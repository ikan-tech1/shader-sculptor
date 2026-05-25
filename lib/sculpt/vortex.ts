import * as THREE from "three";

export type VortexInput = {
  centerX: number;
  centerY: number;
  deltaAngle: number;
  pointerCount: number;
};

const VORTEX_STRENGTH = 2.4;

export function computeVortexStrength(input: VortexInput): number {
  if (input.pointerCount < 2) return 0;
  return THREE.MathUtils.clamp(input.deltaAngle * VORTEX_STRENGTH, -3.5, 3.5);
}

export function screenToNdc(x: number, y: number): THREE.Vector2 {
  return new THREE.Vector2(x * 2 - 1, -(y * 2 - 1));
}

export function applyVortexToVertex(
  localPos: THREE.Vector3,
  worldCenter: THREE.Vector3,
  angle: number,
  strength: number,
): THREE.Vector3 {
  if (Math.abs(strength) < 0.001) return localPos;

  const offset = localPos.clone().sub(worldCenter);
  const radius = Math.max(offset.length(), 0.001);
  const spiral = angle * strength * (1 / (radius * 0.6 + 0.4));
  const cos = Math.cos(spiral);
  const sin = Math.sin(spiral);

  const rotated = new THREE.Vector3(
    offset.x * cos - offset.z * sin,
    offset.y + Math.sin(spiral * 0.5) * 0.08 * strength,
    offset.x * sin + offset.z * cos,
  );

  return worldCenter.clone().add(rotated);
}

export const vortexUniforms = {
  uVortexCenter: { value: new THREE.Vector3() },
  uVortexAngle: { value: 0 },
  uVortexStrength: { value: 0 },
};
