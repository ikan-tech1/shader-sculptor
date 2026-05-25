"use client";

import dynamic from "next/dynamic";

const SculptureCanvas = dynamic(
  () => import("@/components/sculpture/sculpture-canvas").then((m) => m.SculptureCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-white/40" />
      </div>
    ),
  },
);

export default function SculptorClient() {
  return <SculptureCanvas />;
}
