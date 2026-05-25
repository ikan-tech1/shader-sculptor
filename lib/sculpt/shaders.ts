import * as THREE from "three";

export const iridescentVertexShader = /* glsl */ `
uniform float uTime;
uniform vec3 uVortexCenter;
uniform float uVortexAngle;
uniform float uVortexStrength;
uniform float uRecallWave;
uniform vec3 uShockwaveOrigin;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
varying float vRecall;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);

  vec3 pos = position;

  if (uVortexStrength != 0.0) {
    vec3 offset = pos - uVortexCenter;
    float radius = max(length(offset), 0.001);
    float spiral = uVortexAngle * uVortexStrength / (radius * 0.55 + 0.45);
    float c = cos(spiral);
    float s = sin(spiral);
    vec3 twisted = vec3(
      offset.x * c - offset.z * s,
      offset.y + sin(spiral * 0.5) * 0.08 * uVortexStrength,
      offset.x * s + offset.z * c
    );
    pos = uVortexCenter + twisted;
  }

  if (uRecallWave > 0.0) {
    vec3 waveDir = normalize(pos - uShockwaveOrigin);
    pos += waveDir * uRecallWave * 0.12;
  }

  vec4 world = modelMatrix * vec4(pos, 1.0);
  vWorldPos = world.xyz;
  vRecall = uRecallWave;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const iridescentFragmentShader = /* glsl */ `
uniform float uTime;
uniform vec2 uRippleCenter;
uniform float uRippleTime;
uniform float uRippleStrength;
uniform float uSliceFlash;
uniform int uVariant;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
varying float vRecall;

vec3 iridescence(vec3 n, vec3 v, float t) {
  float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.8);
  float hue = fresnel * 3.2 + t * 0.15 + length(v) * 0.08;
  vec3 a = vec3(0.55, 0.15, 0.95);
  vec3 b = vec3(0.05, 0.85, 0.95);
  vec3 c = vec3(0.98, 0.45, 0.12);
  vec3 mixAB = mix(a, b, 0.5 + 0.5 * sin(hue * 6.283));
  return mix(mixAB, c, 0.35 + 0.35 * cos(hue * 4.5 + 1.2));
}

vec3 ribbonColor(vec3 n, vec3 v, float t) {
  // hue cycles along the ribbon length (vUv.x) — long iridescent ribbon
  float hue = vUv.x * 6.283 + t * 0.4;
  vec3 a = vec3(0.95, 0.25, 0.7);
  vec3 b = vec3(0.2, 0.8, 1.0);
  vec3 c = vec3(0.95, 0.85, 0.25);
  vec3 base = mix(mix(a, b, 0.5 + 0.5 * sin(hue)), c, 0.5 + 0.5 * cos(hue * 0.7 + 1.2));
  float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.0);
  return base + fresnel * 0.45;
}

vec3 glassRingColor(vec3 n, vec3 v, float t) {
  // liquid glass — high Fresnel, faint blue-cyan tint, strong specular
  float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.5);
  vec3 tint = mix(vec3(0.04, 0.10, 0.18), vec3(0.55, 0.85, 1.0), fresnel);
  vec3 refr = vec3(0.15, 0.25, 0.45) * (0.5 + 0.5 * sin(vUv.y * 12.0 + t));
  vec3 spec = vec3(pow(max(dot(reflect(-v, n), v), 0.0), 96.0)) * 1.2;
  return tint + refr * 0.4 + spec;
}

vec3 metallicClothColor(vec3 n, vec3 v, float t) {
  // anisotropic brushed-metal cloth — highlight stretched along U
  vec3 tangent = normalize(vec3(1.0, 0.0, 0.0) - n * dot(n, vec3(1.0, 0.0, 0.0)));
  vec3 l = normalize(vec3(0.4, 0.85, 0.7));
  vec3 h = normalize(l + v);
  float tDotH = dot(tangent, h);
  float aniso = sqrt(max(1.0 - tDotH * tDotH, 0.0));
  float aspec = pow(aniso, 96.0) * 0.4;

  // dark gunmetal base with cool→warm shift based on fresnel
  float fresnel = pow(1.0 - max(dot(n, v), 0.0), 1.5);
  vec3 cool = vec3(0.10, 0.12, 0.18);
  vec3 warm = vec3(0.32, 0.28, 0.34);
  vec3 base = mix(cool, warm, fresnel);

  // brushed metal striations
  float brush = sin(vUv.x * 220.0 + sin(vUv.y * 4.0) * 1.5) * 0.5 + 0.5;
  base += vec3(brush * 0.08);

  // gentle directional shimmer
  base += vec3(0.35, 0.45, 0.55) * aspec;

  return base;
}

vec3 neonSphereColor(vec3 n, vec3 v, float t) {
  // emissive neon gradient — bottom magenta → top cyan, with breathing pulse
  float lat = (n.y + 1.0) * 0.5;
  vec3 bot = vec3(1.0, 0.15, 0.65);
  vec3 mid = vec3(0.85, 0.25, 1.0);
  vec3 top = vec3(0.15, 0.85, 1.0);
  vec3 grad = mix(mix(bot, mid, smoothstep(0.0, 0.55, lat)), top, smoothstep(0.45, 1.0, lat));
  float pulse = 0.5 + 0.5 * sin(t * 2.0);
  float fresnel = pow(1.0 - max(dot(n, v), 0.0), 1.6);
  return grad * (0.8 + pulse * 0.25) + fresnel * vec3(0.4, 0.5, 0.9);
}

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 n = normalize(vNormal);

  vec3 base;
  if (uVariant == 0) {
    base = ribbonColor(n, viewDir, uTime);
  } else if (uVariant == 1) {
    base = glassRingColor(n, viewDir, uTime);
  } else if (uVariant == 2) {
    base = metallicClothColor(n, viewDir, uTime);
  } else if (uVariant == 3) {
    base = neonSphereColor(n, viewDir, uTime);
  } else {
    base = iridescence(n, viewDir, uTime);
  }

  float rippleDist = length(vUv - uRippleCenter);
  float rippleActive = 0.0;
  float chroma = 0.0;

  if (uRippleTime >= 0.0 && uRippleStrength > 0.0) {
    float elapsed = uTime - uRippleTime;
    float dur = 1.4;
    if (elapsed >= 0.0 && elapsed < dur) {
      float t = elapsed / dur;
      rippleActive = (1.0 - t) * sin(t * 3.14159) * uRippleStrength;
      float radius = t * 1.35;
      chroma = exp(-abs(rippleDist - radius) * 6.0) * rippleActive;
    }
  }

  vec3 col = base;
  col.r += chroma * 0.35;
  col.b -= chroma * 0.25;
  col += vec3(0.08, 0.12, 0.22) * rippleActive * 0.6;

  float flash = exp(-max(uTime - uSliceFlash, 0.0) * 12.0);
  col += vec3(0.9, 0.95, 1.0) * flash * 0.35;

  // glass-ring gets transparency, everything else fully opaque
  float alpha = (uVariant == 1) ? 0.85 : 0.98;

  gl_FragColor = vec4(col, alpha);
}
`;

export type SculptVariantId = 0 | 1 | 2 | 3;

export function createIridescentMaterial(variant: SculptVariantId = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: iridescentVertexShader,
    fragmentShader: iridescentFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uVortexCenter: { value: new THREE.Vector3() },
      uVortexAngle: { value: 0 },
      uVortexStrength: { value: 0 },
      uRecallWave: { value: 0 },
      uShockwaveOrigin: { value: new THREE.Vector3() },
      uRippleCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uRippleTime: { value: -1 },
      uRippleStrength: { value: 0 },
      uSliceFlash: { value: -1 },
      uVariant: { value: variant },
    },
    transparent: true,
    side: THREE.DoubleSide,
  });
}

export function cloneMaterialUniforms(
  source: THREE.ShaderMaterial,
): THREE.ShaderMaterial {
  const mat = source.clone();
  mat.uniforms = THREE.UniformsUtils.clone(source.uniforms);
  return mat;
}
