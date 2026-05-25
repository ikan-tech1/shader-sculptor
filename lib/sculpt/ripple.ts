import * as THREE from "three";

export type RippleUniforms = {
  uRippleCenter: { value: THREE.Vector2 };
  uRippleTime: { value: number };
  uRippleStrength: { value: number };
};

export const RIPPLE_DURATION_MS = 1400;
export const RIPPLE_MAX_RADIUS = 1.35;

export function rippleStrengthAt(timeMs: number, startTime: number, strength: number): number {
  const elapsed = (timeMs - startTime) / 1000;
  if (elapsed < 0 || elapsed > RIPPLE_DURATION_MS / 1000) return 0;
  const t = elapsed / (RIPPLE_DURATION_MS / 1000);
  return strength * (1 - t) * Math.sin(t * Math.PI);
}

export function rippleRadiusAt(timeMs: number, startTime: number): number {
  const elapsed = (timeMs - startTime) / 1000;
  const t = THREE.MathUtils.clamp(elapsed / (RIPPLE_DURATION_MS / 1000), 0, 1);
  return t * RIPPLE_MAX_RADIUS;
}

export function isRippleComplete(timeMs: number, startTime: number): boolean {
  return timeMs - startTime > RIPPLE_DURATION_MS;
}

export function chromaticOffset(
  dist: number,
  rippleRadius: number,
  strength: number,
): number {
  const edge = Math.exp(-Math.abs(dist - rippleRadius) * 6);
  return edge * strength * 0.025;
}

export function createRippleUniforms(): RippleUniforms {
  return {
    uRippleCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uRippleTime: { value: -1 },
    uRippleStrength: { value: 0 },
  };
}
