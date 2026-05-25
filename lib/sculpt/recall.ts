import * as THREE from "three";
import type { FragmentTransform, RecallState } from "@/lib/store/fragments";

export type SpringConfig = {
  stiffness: number;
  damping: number;
  shockwaveSpeed: number;
  shockwaveDecay: number;
};

export const DEFAULT_SPRING: SpringConfig = {
  stiffness: 14,
  damping: 0.82,
  shockwaveSpeed: 4.5,
  shockwaveDecay: 2.2,
};

export function stepRecallSpring(
  fragment: FragmentTransform,
  recall: RecallState,
  dt: number,
  config: SpringConfig = DEFAULT_SPRING,
): FragmentTransform {
  const toOrigin = fragment.originalPosition.clone().sub(fragment.position);
  const springForce = toOrigin.multiplyScalar(config.stiffness * dt);
  fragment.velocity.add(springForce);

  const rotDiff = new THREE.Vector3(
    fragment.originalRotation.x - fragment.rotation.x,
    fragment.originalRotation.y - fragment.rotation.y,
    fragment.originalRotation.z - fragment.rotation.z,
  );
  fragment.angularVelocity.add(rotDiff.multiplyScalar(config.stiffness * 0.5 * dt));

  if (recall.phase === "recalling") {
    const elapsed = (performance.now() - recall.startTime) / 1000;
    const waveRadius = elapsed * config.shockwaveSpeed;
    const dist = fragment.position.distanceTo(recall.shockwaveOrigin);
    const wave = Math.exp(-Math.abs(dist - waveRadius) * config.shockwaveDecay);
    const push = fragment.position
      .clone()
      .sub(recall.shockwaveOrigin)
      .normalize()
      .multiplyScalar(wave * recall.shockwaveStrength * dt * 2.5);
    fragment.velocity.add(push);
  }

  fragment.velocity.multiplyScalar(config.damping);
  fragment.angularVelocity.multiplyScalar(config.damping);
  fragment.position.add(fragment.velocity.clone().multiplyScalar(dt));
  fragment.rotation.x += fragment.angularVelocity.x * dt;
  fragment.rotation.y += fragment.angularVelocity.y * dt;
  fragment.rotation.z += fragment.angularVelocity.z * dt;

  return fragment;
}

export function isRecallComplete(fragments: FragmentTransform[], epsilon = 0.015): boolean {
  return fragments.every(
    (f) =>
      f.position.distanceTo(f.originalPosition) < epsilon &&
      f.velocity.length() < 0.02,
  );
}

export function recallProgress(fragments: FragmentTransform[]): number {
  if (fragments.length === 0) return 1;
  let sum = 0;
  for (const f of fragments) {
    const maxDist = Math.max(f.originalPosition.length(), 0.001);
    sum += 1 - THREE.MathUtils.clamp(f.position.distanceTo(f.originalPosition) / maxDist, 0, 1);
  }
  return sum / fragments.length;
}
