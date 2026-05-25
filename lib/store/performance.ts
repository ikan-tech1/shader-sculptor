"use client";

export type PerformanceTier = "mobile" | "desktop";

export type PerformanceProfile = {
  tier: PerformanceTier;
  dpr: [number, number];
  postPassCount: number;
  enableBloom: boolean;
};

export function detectPerformanceTier(): PerformanceTier {
  if (typeof window === "undefined") return "desktop";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const small = window.matchMedia("(max-width: 768px)").matches;
  return coarse || small ? "mobile" : "desktop";
}

export function getPerformanceProfile(tier: PerformanceTier): PerformanceProfile {
  if (tier === "mobile") {
    return {
      tier: "mobile",
      dpr: [1, 1.5],
      postPassCount: 2,
      enableBloom: true,
    };
  }
  return {
    tier: "desktop",
    dpr: [1, 2],
    postPassCount: 3,
    enableBloom: true,
  };
}
