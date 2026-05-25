"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { useFragmentStore } from "@/lib/store/fragments";
import { createBaseSculptGeometry } from "@/lib/sculpt/slice";
import { createIridescentMaterial, cloneMaterialUniforms } from "@/lib/sculpt/shaders";
import { rippleStrengthAt, isRippleComplete } from "@/lib/sculpt/ripple";
import { recallProgress } from "@/lib/sculpt/recall";

export type FragmentMesh = {
  id: string;
  geometry: THREE.BufferGeometry;
};

type AbstractFormProps = {
  fragments: FragmentMesh[];
  onMaterialsReady?: (materials: Map<string, THREE.ShaderMaterial>) => void;
};

function FragmentPiece({
  id,
  geometry,
  material,
}: {
  id: string;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const fragment = useFragmentStore((s) => s.fragments.find((f) => f.id === id));
  const recall = useFragmentStore((s) => s.recall);
  const vortex = useFragmentStore((s) => s.vortex);
  const ripple = useFragmentStore((s) => s.ripple);
  const sliceFlash = useFragmentStore((s) => s.sliceFlash);

  useFrame(({ clock }) => {
    if (!meshRef.current || !fragment) return;

    meshRef.current.position.copy(fragment.position);
    meshRef.current.rotation.copy(fragment.rotation);

    const t = clock.getElapsedTime();
    material.uniforms.uTime.value = t;
    material.uniforms.uVortexCenter.value.set(vortex.center.x, vortex.center.y, 0);
    material.uniforms.uVortexAngle.value = vortex.angle;
    material.uniforms.uVortexStrength.value = vortex.active ? vortex.strength : 0;
    material.uniforms.uShockwaveOrigin.value.copy(recall.shockwaveOrigin);

    if (recall.phase === "recalling") {
      material.uniforms.uRecallWave.value = recall.shockwaveStrength * (1 - recallProgress(useFragmentStore.getState().fragments));
    } else {
      material.uniforms.uRecallWave.value = 0;
    }

    if (ripple) {
      material.uniforms.uRippleCenter.value.set(ripple.x, ripple.y);
      material.uniforms.uRippleTime.value = ripple.startTime / 1000;
      material.uniforms.uRippleStrength.value = rippleStrengthAt(performance.now(), ripple.startTime, ripple.strength);
      if (isRippleComplete(performance.now(), ripple.startTime)) {
        useFragmentStore.getState().clearRipple();
        if (useFragmentStore.getState().phase === "rippling") {
          useFragmentStore.getState().setPhase("pristine");
        }
      }
    } else {
      material.uniforms.uRippleStrength.value = 0;
    }

    if (sliceFlash > 0) {
      material.uniforms.uSliceFlash.value = sliceFlash / 1000;
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} castShadow receiveShadow />
  );
}

export function AbstractForm({ fragments, onMaterialsReady }: AbstractFormProps) {
  const baseMaterial = useMemo(() => createIridescentMaterial(), []);
  const materials = useMemo(() => {
    const map = new Map<string, THREE.ShaderMaterial>();
    for (const f of fragments) {
      map.set(f.id, cloneMaterialUniforms(baseMaterial));
    }
    return map;
  }, [fragments, baseMaterial]);

  useEffect(() => {
    onMaterialsReady?.(materials);
  }, [materials, onMaterialsReady]);

  return (
    <group>
      <Environment preset="city" environmentIntensity={0.35} />
      <ambientLight intensity={0.08} />
      <directionalLight position={[4, 6, 3]} intensity={0.55} color="#c8d4ff" />
      <pointLight position={[-3, -2, 4]} intensity={0.35} color="#ff6ec7" />

      {fragments.map((f) => {
        const mat = materials.get(f.id);
        if (!mat) return null;
        return <FragmentPiece key={f.id} id={f.id} geometry={f.geometry} material={mat} />;
      })}
    </group>
  );
}

export function createMonolithicFragment(): FragmentMesh[] {
  return [
    {
      id: "core",
      geometry: createBaseSculptGeometry(),
    },
  ];
}
