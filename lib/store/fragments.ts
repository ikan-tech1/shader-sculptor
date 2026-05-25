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

export const SCULPT_VARIANTS = [
  "ribbon",
  "glass-ring",
  "metallic-cloth",
  "neon-sphere",
] as const;
export type SculptVariant = (typeof SCULPT_VARIANTS)[number];

export const VARIANT_LABELS: Record<SculptVariant, string> = {
  ribbon: "Iridescent Ribbon",
  "glass-ring": "Liquid Glass Ring",
  "metallic-cloth": "Metallic Cloth",
  "neon-sphere": "Neon Gradient Sphere",
};

type FragmentStore = {
  phase: SculptPhase;
  fragments: FragmentTransform[];
  sliceCount: number;
  ripple: RipplePulse | null;
  vortex: VortexState;
  recall: RecallState;
  sliceFlash: number;
  variant: SculptVariant;

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
  setVariant: (variant: SculptVariant) => void;
  cycleVariant: (direction: 1 | -1) => void;
};

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* ignore */
    }
  }
}

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
  variant: "ribbon",

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

  triggerRipple: (x, y) => {
    set({
      ripple: { x, y, startTime: performance.now(), strength: 1 },
      phase: "rippling",
    });
    vibrate(8);
  },

  clearRipple: () => set({ ripple: null }),

  setVortex: (patch) =>
    set((state) => ({
      vortex: { ...state.vortex, ...patch },
      phase: patch.active ? "vortexed" : state.phase,
    })),

  resetVortex: () => set({ vortex: defaultVortex() }),

  startRecall: (origin) => {
    set({
      recall: {
        phase: "recalling",
        startTime: performance.now(),
        shockwaveOrigin: origin.clone(),
        shockwaveStrength: 1.2,
      },
      phase: "recalling",
    });
    vibrate([14, 30, 24]);
  },

  setRecallPhase: (phase) =>
    set((state) => ({
      recall: { ...state.recall, phase },
      phase: phase === "complete" ? "pristine" : state.phase,
    })),

  triggerSliceFlash: () => {
    set({ sliceFlash: performance.now() });
    vibrate([18, 22, 10]);
  },

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

  setVariant: (variant) =>
    set({
      variant,
      phase: "pristine",
      fragments: [],
      sliceCount: 0,
      ripple: null,
      vortex: defaultVortex(),
      recall: defaultRecall(),
      sliceFlash: 0,
    }),

  cycleVariant: (direction) => {
    const current = get().variant;
    const i = SCULPT_VARIANTS.indexOf(current);
    const next = SCULPT_VARIANTS[(i + direction + SCULPT_VARIANTS.length) % SCULPT_VARIANTS.length];
    get().setVariant(next);
  },
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
