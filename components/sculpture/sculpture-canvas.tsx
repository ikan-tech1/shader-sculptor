"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom, ChromaticAberration } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { AbstractForm, createMonolithicFragment, type FragmentMesh } from "./abstract-form";
import { useFragmentStore, cloneFragmentTransform } from "@/lib/store/fragments";
import {
  detectPerformanceTier,
  getPerformanceProfile,
  type PerformanceProfile,
} from "@/lib/store/performance";
import {
  detectFastSwipe,
  splitGeometryByPlane,
  createSlicePlaneFromGesture,
  applySliceImpulse,
  type SwipeSample,
} from "@/lib/sculpt/slice";
import { computeVortexStrength } from "@/lib/sculpt/vortex";
import { stepRecallSpring, isRecallComplete } from "@/lib/sculpt/recall";
import { rippleStrengthAt } from "@/lib/sculpt/ripple";

const MAX_FRAGMENTS = 8;
const TAP_MAX_DURATION = 280;
const TAP_MAX_MOVE = 0.02;

type ActivePointer = {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
};

function PostEffects({ profile }: { profile: PerformanceProfile }) {
  const ripple = useFragmentStore((s) => s.ripple);
  const recall = useFragmentStore((s) => s.recall);
  const chromaOffset = useMemo(() => {
    if (ripple) {
      const s = rippleStrengthAt(performance.now(), ripple.startTime, ripple.strength);
      return new THREE.Vector2(s * 0.004, s * 0.003);
    }
    if (recall.phase === "recalling") {
      return new THREE.Vector2(0.0015, 0.001);
    }
    return new THREE.Vector2(0.0004, 0.0003);
  }, [ripple, recall.phase]);

  return (
    <EffectComposer multisampling={profile.tier === "mobile" ? 0 : 4}>
      <Bloom
        intensity={profile.enableBloom ? 0.45 : 0}
        luminanceThreshold={0.35}
        luminanceSmoothing={0.9}
        mipmapBlur
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={profile.postPassCount >= 2 ? chromaOffset : new THREE.Vector2(0, 0)}
        radialModulation
        modulationOffset={0.5}
      />
    </EffectComposer>
  );
}

function SculptureLogic({
  fragments,
  setFragments,
}: {
  fragments: FragmentMesh[];
  setFragments: React.Dispatch<React.SetStateAction<FragmentMesh[]>>;
}) {
  const pointersRef = useRef<Map<number, ActivePointer>>(new Map());
  const swipeSamplesRef = useRef<SwipeSample[]>([]);
  const lastPinchAngleRef = useRef<number | null>(null);
  const tapCandidateRef = useRef<ActivePointer | null>(null);

  const {
    fragments: fragmentTransforms,
    setFragments: setFragmentTransforms,
    phase,
    setPhase,
    incrementSliceCount,
    triggerRipple,
    setVortex,
    resetVortex,
    startRecall,
    setRecallPhase,
    triggerSliceFlash,
    recall,
    vortex,
    sliceCount,
  } = useFragmentStore();

  const { gl } = useThree();

  useEffect(() => {
    if (fragmentTransforms.length === 0 && fragments.length > 0) {
      setFragmentTransforms(
        fragments.map((f) => cloneFragmentTransform(f.id, new THREE.Vector3(), new THREE.Euler())),
      );
    }
  }, [fragments, fragmentTransforms.length, setFragmentTransforms]);

  const performSlice = useCallback(
    (planeGesture: NonNullable<ReturnType<typeof detectFastSwipe>>) => {
      if (fragments.length === 0 || sliceCount >= MAX_FRAGMENTS - 1) return;

      const target = fragments.reduce((largest, f) => {
        const lv = largest.geometry.getAttribute("position").count;
        const cv = f.geometry.getAttribute("position").count;
        return cv > lv ? f : largest;
      }, fragments[0]);

      const plane = createSlicePlaneFromGesture(planeGesture);
      const [geoA, geoB] = splitGeometryByPlane(target.geometry, plane);

      if (geoA.getAttribute("position").count < 9 || geoB.getAttribute("position").count < 9) {
        return;
      }

      const idA = `${target.id}-a-${sliceCount}`;
      const idB = `${target.id}-b-${sliceCount}`;
      const impulseA = applySliceImpulse("A", planeGesture, planeGesture.speed);
      const impulseB = applySliceImpulse("B", planeGesture, planeGesture.speed);

      const newFragments = fragments.filter((f) => f.id !== target.id);
      newFragments.push({ id: idA, geometry: geoA }, { id: idB, geometry: geoB });
      setFragments(newFragments);

      const existing = fragmentTransforms.filter((f) => f.id !== target.id);
      const base = fragmentTransforms.find((f) => f.id === target.id);
      const origin = base?.position ?? new THREE.Vector3();
      const rot = base?.rotation ?? new THREE.Euler();

      const fragA = cloneFragmentTransform(idA, origin.clone().add(impulseA), rot.clone());
      const fragB = cloneFragmentTransform(idB, origin.clone().add(impulseB), rot.clone());
      fragA.velocity.copy(impulseA.multiplyScalar(0.35));
      fragB.velocity.copy(impulseB.multiplyScalar(0.35));

      setFragmentTransforms([...existing, fragA, fragB]);
      incrementSliceCount();
      triggerSliceFlash();
      setPhase("sliced");
    },
    [
      fragments,
      fragmentTransforms,
      incrementSliceCount,
      setFragmentTransforms,
      setFragments,
      setPhase,
      sliceCount,
      triggerSliceFlash,
    ],
  );

  useFrame((_, delta) => {
    const state = useFragmentStore.getState();

    if (state.recall.phase === "recalling" && state.fragments.length > 0) {
      const next = state.fragments.map((f) => {
        const copy = {
          ...f,
          position: f.position.clone(),
          rotation: f.rotation.clone(),
          velocity: f.velocity.clone(),
          angularVelocity: f.angularVelocity.clone(),
          originalPosition: f.originalPosition.clone(),
          originalRotation: f.originalRotation.clone(),
        };
        return stepRecallSpring(copy, state.recall, delta);
      });
      setFragmentTransforms(next);

      if (isRecallComplete(next)) {
        setRecallPhase("complete");
        resetVortex();
        setPhase("pristine");
      }
    }
  });

  useEffect(() => {
    const dom = gl.domElement;

    const norm = (e: PointerEvent) => ({
      x: e.clientX / window.innerWidth,
      y: e.clientY / window.innerHeight,
    });

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      dom.setPointerCapture(e.pointerId);
      const n = norm(e);
      const entry: ActivePointer = {
        id: e.pointerId,
        x: n.x,
        y: n.y,
        startX: n.x,
        startY: n.y,
        startTime: performance.now(),
      };
      pointersRef.current.set(e.pointerId, entry);
      if (pointersRef.current.size === 1) {
        swipeSamplesRef.current = [{ x: n.x, y: n.y, time: performance.now() }];
        tapCandidateRef.current = entry;
      }
    };

    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      const ptr = pointersRef.current.get(e.pointerId);
      if (!ptr) return;
      const n = norm(e);
      ptr.x = n.x;
      ptr.y = n.y;
      pointersRef.current.set(e.pointerId, ptr);

      if (pointersRef.current.size === 1) {
        swipeSamplesRef.current.push({ x: n.x, y: n.y, time: performance.now() });
        if (swipeSamplesRef.current.length > 12) swipeSamplesRef.current.shift();

        const tap = tapCandidateRef.current;
        if (tap && Math.hypot(n.x - tap.startX, n.y - tap.startY) > TAP_MAX_MOVE) {
          tapCandidateRef.current = null;
        }
      }

      if (pointersRef.current.size >= 2) {
        tapCandidateRef.current = null;
        const pts = Array.from(pointersRef.current.values());
        const cx = (pts[0].x + pts[1].x) * 0.5;
        const cy = (pts[0].y + pts[1].y) * 0.5;
        const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);

        if (lastPinchAngleRef.current !== null) {
          const deltaAngle = angle - lastPinchAngleRef.current;
          const strength = computeVortexStrength({
            centerX: cx,
            centerY: cy,
            deltaAngle,
            pointerCount: 2,
          });
          setVortex({
            active: true,
            center: new THREE.Vector2((cx - 0.5) * 3.2, (0.5 - cy) * 3.2),
            angle: angle * 2,
            strength,
          });
        }
        lastPinchAngleRef.current = angle;
      }
    };

    const onUp = (e: PointerEvent) => {
      e.preventDefault();
      if (dom.hasPointerCapture(e.pointerId)) {
        dom.releasePointerCapture(e.pointerId);
      }

      const wasSingle = pointersRef.current.size === 1;
      const ptr = pointersRef.current.get(e.pointerId);

      if (wasSingle && ptr) {
        const plane = detectFastSwipe(swipeSamplesRef.current);
        if (plane) {
          performSlice(plane);
        } else {
          const tap = tapCandidateRef.current;
          const duration = performance.now() - ptr.startTime;
          const moved = Math.hypot(ptr.x - ptr.startX, ptr.y - ptr.startY);
          if (tap && duration < TAP_MAX_DURATION && moved < TAP_MAX_MOVE) {
            triggerRipple(ptr.x, 1 - ptr.y);
          } else if (phase !== "pristine" || fragmentTransforms.length > 1) {
            startRecall(new THREE.Vector3(0, 0, 0));
          }
        }
      }

      pointersRef.current.delete(e.pointerId);
      swipeSamplesRef.current = [];
      tapCandidateRef.current = null;

      if (pointersRef.current.size < 2) {
        lastPinchAngleRef.current = null;
        if (vortex.active && pointersRef.current.size === 0) {
          resetVortex();
          if (phase === "vortexed") {
            startRecall(new THREE.Vector3(0, 0, 0));
          }
        }
      }
    };

    dom.addEventListener("pointerdown", onDown, { passive: false });
    dom.addEventListener("pointermove", onMove, { passive: false });
    dom.addEventListener("pointerup", onUp, { passive: false });
    dom.addEventListener("pointercancel", onUp, { passive: false });

    return () => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointercancel", onUp);
    };
  }, [
    gl.domElement,
    performSlice,
    phase,
    fragmentTransforms.length,
    triggerRipple,
    startRecall,
    setVortex,
    resetVortex,
    vortex.active,
  ]);

  return <AbstractForm fragments={fragments} />;
}

function RotatingGroup({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.getElapsedTime() * 0.12;
      ref.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.08) * 0.08;
    }
  });
  return <group ref={ref}>{children}</group>;
}

export function SculptureCanvas() {
  const [profile] = useState(() => getPerformanceProfile(detectPerformanceTier()));
  const [fragments, setFragments] = useState<FragmentMesh[]>(() => createMonolithicFragment());
  const [started, setStarted] = useState(false);

  return (
    <div className="fixed inset-0 bg-black touch-none select-none">
      <Canvas
        dpr={profile.dpr}
        camera={{ position: [0, 0, 4.8], fov: 42, near: 0.1, far: 100 }}
        gl={{
          antialias: profile.tier !== "mobile",
          alpha: false,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.setClearColor("#000000");
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
        style={{ touchAction: "none" }}
      >
        <color attach="background" args={["#000000"]} />
        <Suspense fallback={null}>
          <RotatingGroup>
            <SculptureLogic fragments={fragments} setFragments={setFragments} />
          </RotatingGroup>
          <PostEffects profile={profile} />
        </Suspense>
      </Canvas>

      {!started && (
        <button
          type="button"
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setStarted(true)}
          aria-label="Touch to begin"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.45em] text-white/50 animate-pulse">
            Touch to begin
          </span>
        </button>
      )}
    </div>
  );
}
