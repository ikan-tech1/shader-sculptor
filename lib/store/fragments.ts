"use client";

import { create } from "zustand";
import * as THREE from "three";

export type FragmentTransform = {
  id: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  originalPosition: THREE.Vector3;
  originalRotation: THREE.Euler;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
};

export type RipplePulse = {
  x: number;
  y: number;
  startTime: number;
  strength: number;
};

export type VortexState = {
  active: boolean;
  center: THREE.Vector2;
  angle: number;
  strength: number;
};

export type RecallState = {
  phase: "idle" | "recalling" | "complete";
  startTime: number;
  shockwaveOrigin: THREE.Vector3;
  shockwaveStrength: number;
};

export type SculptPhase = "pristine" | "sliced" | "vortexed" | "rippling" | "recalling";

type FragmentStore = {
  phase: SculptPhase;
  fragments: FragmentTransform[];
  sliceCount: number;
  ripple: RipplePulse | null;
  vortex: VortexState;
  recall: RecallState;
  sliceFlash: number;

  setPhase: (phase: SculptPhase) => void;
  setFragments: (fragments: FragmentTransform[]) => void;
  updateFragment: (id: string, patch: Partial<FragmentTransform>) => void;
  incrementSliceCount: () => void;
  triggerRipple: (x: number, y: number) => void;
  clearRipple: () => void;
  setVortex: (patch: Partial<VortexState>) => void;
  resetVortex: () => void;
  startRecall: (origin: THREE.Vector3) => void;
  setRecallPhase: (phase: RecallState["phase"]) => void;
  triggerSliceFlash: () => void;
  reset: () => void;
};

const defaultVortex = (): VortexState => ({
  active: false,
  center: new THREE.Vector2(0.5, 0.5),
  angle: 0,
  strength: 0,
});

const defaultRecall = (): RecallState => ({
  phase: "idle",
  startTime: 0,
  shockwaveOrigin: new THREE.Vector3(),
  shockwaveStrength: 0,
});

export const useFragmentStore = create<FragmentStore>((set, get) => ({
  phase: "pristine",
  fragments: [],
  sliceCount: 0,
  ripple: null,
  vortex: defaultVortex(),
  recall: defaultRecall(),
  sliceFlash: 0,

  setPhase: (phase) => set({ phase }),

  setFragments: (fragments) => set({ fragments }),

  updateFragment: (id, patch) =>
    set((state) => ({
      fragments: state.fragments.map((f) =>
        f.id === id
          ? {
              ...f,
              ...patch,
              position: patch.position ?? f.position,
              rotation: patch.rotation ?? f.rotation,
              velocity: patch.velocity ?? f.velocity,
              angularVelocity: patch.angularVelocity ?? f.angularVelocity,
            }
          : f,
      ),
    })),

  incrementSliceCount: () => set((s) => ({ sliceCount: s.sliceCount + 1 })),

  triggerRipple: (x, y) =>
    set({
      ripple: { x, y, startTime: performance.now(), strength: 1 },
      phase: "rippling",
    }),

  clearRipple: () => set({ ripple: null }),

  setVortex: (patch) =>
    set((state) => ({
      vortex: { ...state.vortex, ...patch },
      phase: patch.active ? "vortexed" : state.phase,
    })),

  resetVortex: () => set({ vortex: defaultVortex() }),

  startRecall: (origin) =>
    set({
      recall: {
        phase: "recalling",
        startTime: performance.now(),
        shockwaveOrigin: origin.clone(),
        shockwaveStrength: 1.2,
      },
      phase: "recalling",
    }),

  setRecallPhase: (phase) =>
    set((state) => ({
      recall: { ...state.recall, phase },
      phase: phase === "complete" ? "pristine" : state.phase,
    })),

  triggerSliceFlash: () => set({ sliceFlash: performance.now() }),

  reset: () =>
    set({
      phase: "pristine",
      fragments: [],
      sliceCount: 0,
      ripple: null,
      vortex: defaultVortex(),
      recall: defaultRecall(),
      sliceFlash: 0,
    }),
}));

export function cloneFragmentTransform(
  id: string,
  position: THREE.Vector3,
  rotation: THREE.Euler,
): FragmentTransform {
  return {
    id,
    position: position.clone(),
    rotation: rotation.clone(),
    originalPosition: position.clone(),
    originalRotation: rotation.clone(),
    velocity: new THREE.Vector3(),
    angularVelocity: new THREE.Vector3(),
  };
}
