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

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 n = normalize(vNormal);
  vec3 base = iridescence(n, viewDir, uTime);

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

  float spec = pow(max(dot(reflect(-viewDir, n), viewDir), 0.0), 48.0);
  col += vec3(spec * 0.55);

  gl_FragColor = vec4(col, 0.98);
}
`;

export function createIridescentMaterial(): THREE.ShaderMaterial {
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
