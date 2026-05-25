# Shader Sculptor

Touch-driven iridescent 3D sculpture in a pitch-black void. Part of the [sensory-lab](https://github.com) series.

## Stack

- Next.js 16 (static export)
- React 19 + TypeScript + Tailwind 4
- React Three Fiber + custom GLSL
- Zustand fragment state
- Post-processing: Bloom + Chromatic Aberration

## Gestures

| Gesture | Effect |
|---------|--------|
| Fast swipe | Slice mesh along gesture plane; fragments fly apart |
| Two-finger twist | Vortex spiral in vertex shader |
| Tap | Chromatic ripple pulse in fragment shader |
| Release (after slice/vortex) | Elastic recall with shockwave reassembly |

## Development

```bash
npm install
npm run dev   # http://localhost:3013
npm run build
```

## Structure

```
app/page.tsx                 # thin shell
app/sculptor-client.tsx      # dynamic R3F loader (ssr: false)
components/sculpture/        # abstract form + canvas
lib/sculpt/                  # slice, vortex, recall, ripple, shaders
lib/store/fragments.ts       # Zustand fragment + gesture state
```
