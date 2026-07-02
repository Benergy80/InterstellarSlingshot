// ════════════════════════════════════════════════════════════════
// NEON CITY // NC-2287 — ink.js
// "INK MODE": hand-drawn outlines + cel posterization + toon clouds,
// reverse-engineered from Messenger (https://messenger.abeto.co).
//
// How Messenger renders its look (verified by live shader capture):
//   · scene → 2-target MRT: RT0 = color.rgb + surfaceId.a,
//     RT1 = depth + spheremap-normal.gb + outline-mask.a
//   · one fullscreen pass runs a 5-tap cross kernel over
//     id/depth/normal, maps each gradient through soft double
//     thresholds (fit∘fit), fades lines by view distance, then
//     grades with a tetrahedral 3D LUT. SMAA after. No bloom.
//   · cel = TWO tones: mix(hsvShift(base), base, smoothstep(cut))
//     where the shadow color is base with hue −0.02, value ×0.5
//   · clouds = step(0.27, scrollingNoise × staticNoise) on a
//     BackSide dome — hard posterize IS the drawn look
//
// This port keeps their kernel structure and constants but drops the
// MRT/surfaceId: view normals are reconstructed from the depth buffer,
// so not a single game material changes. The pass replaces the plain
// RenderPass and runs BEFORE UnrealBloom, so ink lines pick up the
// same neon bleed as the rest of the frame.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { makeCanvas, mulberry32 } from './config.js';

const INK_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec2  uResolution;
  uniform float uCameraNear, uCameraFar;
  uniform mat4  uProjInverse;

  uniform vec3  uOutlineColor;
  uniform float uThickness;        // Messenger: uOutlineThickness = 1
  uniform float uOutlineScale;     // Messenger: uOutlineScale = 1
  uniform vec3  uNormalRange;      // Messenger: (0.4, 0.5, 0.3)
  uniform vec3  uDepthRange;       // start/end/threshold on |d²z|/z
  uniform float uSmoothMargin;     // Messenger: 0.2
  uniform vec2  uOutlineFade;      // world-distance fade (Messenger: 50→300)
  uniform float uCel;              // 0..1 posterize mix
  uniform float uBands;

  // Messenger's remap helper (their fit()) — soft double threshold
  float fit(float x, float a1, float a2, float b1, float b2) {
    return mix(b1, b2, clamp((x - a1) / (a2 - a1), 0.0, 1.0));
  }

  vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  // depth buffer → view-space position (positive z = meters from camera)
  vec3 viewPos(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    vec4 clip = vec4(vec3(uv, d) * 2.0 - 1.0, 1.0);
    vec4 v = uProjInverse * clip;
    return v.xyz / v.w;
  }

  // screen-space normal from depth — pick the better-continuity side so
  // silhouette edges don't smear (stands in for Messenger's G-buffer normal)
  vec3 reconstructNormal(vec2 uv, vec3 C, vec2 px) {
    vec3 L = viewPos(uv - vec2(px.x, 0.0));
    vec3 R = viewPos(uv + vec2(px.x, 0.0));
    vec3 D = viewPos(uv - vec2(0.0, px.y));
    vec3 U = viewPos(uv + vec2(0.0, px.y));
    vec3 dx = (abs(L.z - C.z) < abs(R.z - C.z)) ? (C - L) : (R - C);
    vec3 dy = (abs(D.z - C.z) < abs(U.z - C.z)) ? (C - D) : (U - C);
    return normalize(cross(dx, dy));
  }

  void main() {
    vec2 px = 1.0 / uResolution;
    // Messenger compensates thickness against a 1300px reference height
    float resScale = min(1.0, uResolution.y / 1300.0) * uOutlineScale;
    vec2 offset = px * uThickness * max(resScale, 0.5);

    // ── 5-tap cross (Messenger's dirs[5]) ──
    vec3 pC = viewPos(vUv);
    vec3 pL = viewPos(vUv - vec2(offset.x, 0.0));
    vec3 pR = viewPos(vUv + vec2(offset.x, 0.0));
    vec3 pD = viewPos(vUv - vec2(0.0, offset.y));
    vec3 pU = viewPos(vUv + vec2(0.0, offset.y));
    float zC = -pC.z, zL = -pL.z, zR = -pR.z, zD = -pD.z, zU = -pU.z;

    vec3 nC = reconstructNormal(vUv, pC, px);
    vec3 nL = reconstructNormal(vUv - vec2(offset.x, 0.0), pL, px);
    vec3 nR = reconstructNormal(vUv + vec2(offset.x, 0.0), pR, px);
    vec3 nD = reconstructNormal(vUv - vec2(0.0, offset.y), pD, px);
    vec3 nU = reconstructNormal(vUv + vec2(0.0, offset.y), pU, px);

    // ── Messenger's gradient-of-differences (2nd derivative: flat slopes
    // cancel, creases and silhouettes don't). Depth is made relative to
    // zC because our far plane is 150000, not 300. ──
    vec2 depthVariation = vec2((zL - zC) - (zR - zC), (zD - zC) - (zU - zC));
    float depthVar = length(depthVariation) / max(zC, 1.0);

    vec2 normalVariation = vec2(
      distance(nL, nC) - distance(nR, nC),
      distance(nD, nC) - distance(nU, nC));
    float normalVar = length(normalVariation);

    // ── soft double thresholds, exactly Messenger's fit(fit(...)) form ──
    float normalContribution =
      fit(fit(normalVar, uNormalRange.x, uNormalRange.y, 0.0, 1.0),
          uNormalRange.z, uNormalRange.z + uSmoothMargin, 0.0, 1.0);

    // grazing-angle guard (theirs: depthLimit = range.z + 1 - normal.z)
    float depthLimit = uDepthRange.z + (1.0 - abs(nC.z)) * 0.35;
    float depthContribution =
      fit(fit(depthVar, uDepthRange.x, uDepthRange.y, 0.0, 1.0),
          depthLimit, depthLimit + uSmoothMargin, 0.0, 1.0);

    float line = clamp(normalContribution + depthContribution, 0.0, 1.0);

    // distance fade on the NEAREST of the 5 taps (front object owns the line)
    float zNear = min(min(min(zL, zR), min(zD, zU)), zC);
    line *= fit(zNear, uOutlineFade.x, uOutlineFade.y, 1.0, 0.0);

    // ── cel posterization (screen-space take on their 2-band HSV cut:
    // quantize value, hue-shift + enrich the darker bands) ──
    vec3 col = texture2D(tDiffuse, vUv).rgb;
    if (uCel > 0.001) {
      vec3 hsv = rgb2hsv(col);
      if (hsv.z <= 1.0) {   // leave HDR emissives alone — bloom needs them
        float scaled = hsv.z * uBands;
        float band = floor(scaled);
        float f = scaled - band;
        float vq = (band + smoothstep(0.38, 0.62, f)) / uBands;
        vec3 celHsv = hsv;
        celHsv.z = vq;
        float darkened = clamp((hsv.z - vq) * 4.0, 0.0, 1.0);
        celHsv.x = fract(celHsv.x - 0.02 * darkened);          // Messenger: hue −0.02 in shadow
        celHsv.y = min(1.0, celHsv.y * (1.0 + 0.30 * darkened)); // shadows go richer, not grey
        // neon guard: saturated pixels are the signage/tubes — posterizing
        // them starves bloom and kills the city's glow, so spare them
        float neon = smoothstep(0.55, 0.85, hsv.y);
        col = mix(col, hsv2rgb(celHsv), uCel * (1.0 - neon));
      }
    }

    col = mix(col, uOutlineColor, line);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const INK_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export class InkPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = true;

    this._rt = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      depthTexture: new THREE.DepthTexture(2, 2),
    });

    this.uniforms = {
      tDiffuse: { value: this._rt.texture },
      tDepth: { value: this._rt.depthTexture },
      uResolution: { value: new THREE.Vector2(2, 2) },
      uCameraNear: { value: 0.1 },
      uCameraFar: { value: 1000 },
      uProjInverse: { value: new THREE.Matrix4() },
      // ── tuning, transposed from Messenger's customUniforms.planet ──
      uOutlineColor: { value: new THREE.Color(0x0b1220) }, // theirs: #373f42 daylight slate
      uThickness: { value: 1.0 },
      uOutlineScale: { value: 1.0 },
      uNormalRange: { value: new THREE.Vector3(0.4, 0.5, 0.3) },   // verbatim
      uDepthRange: { value: new THREE.Vector3(0.004, 0.02, 0.25) }, // relative |d²z|/z
      uSmoothMargin: { value: 0.2 },                                // verbatim
      uOutlineFade: { value: new THREE.Vector2(120, 560) },         // theirs: 50→300
      uCel: { value: 0.30 },
      uBands: { value: 7.0 },
    };
    this._quad = new FullScreenQuad(new THREE.ShaderMaterial({
      vertexShader: INK_VERT,
      fragmentShader: INK_FRAG,
      uniforms: this.uniforms,
      depthWrite: false,
      depthTest: false,
    }));
    this._size = new THREE.Vector2();
  }

  render(renderer, writeBuffer /*, readBuffer */) {
    // lazy-size to the real drawing buffer (survives adaptive pixel-ratio)
    renderer.getDrawingBufferSize(this._size);
    if (this._rt.width !== this._size.x || this._rt.height !== this._size.y) {
      this._rt.setSize(this._size.x, this._size.y);
      this.uniforms.uResolution.value.copy(this._size);
    }

    const oldTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this._rt);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    this.uniforms.uCameraNear.value = this.camera.near;
    this.uniforms.uCameraFar.value = this.camera.far;
    this.uniforms.uProjInverse.value.copy(this.camera.projectionMatrixInverse);

    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this._quad.render(renderer);
    renderer.setRenderTarget(oldTarget);
  }

  dispose() {
    this._rt.dispose();
    this._quad.dispose();
  }
}

// ── Toon cloud dome — Messenger's sky trick at night ──
// Their recipe: scrolling noise × static noise, then step(0.27, n) so the
// clouds are FLAT — the hard posterize is what reads as "painted".
// Night adaptation: clouds are dark cutouts rim-lit from below by city glow.
export function makeToonClouds(scene, uTime) {
  const [c, ctx] = makeCanvas(256, 256);
  const rnd = mulberry32(2287);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 256);
  // layered value-noise blobs; MirroredRepeat hides the tile seam
  for (let i = 0; i < 210; i++) {
    const x = rnd() * 256, y = rnd() * 256, r = 10 + rnd() * 58;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.10 + rnd() * 0.20;
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  const noiseTex = new THREE.CanvasTexture(c);
  noiseTex.wrapS = noiseTex.wrapT = THREE.MirroredRepeatWrapping;

  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime,
      tNoise: { value: noiseTex },
      uCloudDark: { value: new THREE.Color(0x0e1524) },
      uCloudGlow: { value: new THREE.Color(0x381a42) },  // city magenta from below
      uOpacity: { value: 0.62 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float uTime, uOpacity;
      uniform sampler2D tNoise;
      uniform vec3 uCloudDark, uCloudGlow;
      void main() {
        vec2 uv = vUv * vec2(5.0, 2.6);
        float n1 = texture2D(tNoise, uv + vec2(uTime * 0.0016, 0.0)).r; // drift
        float n2 = texture2D(tNoise, uv).r;                             // anchor
        float n = n1 * n2;
        float blend = smoothstep(0.265, 0.275, n);   // Messenger: step(0.27, n)
        float horizon = smoothstep(0.02, 0.16, vUv.y - 0.5); // upper sky only
        float a = blend * horizon * uOpacity;
        if (a < 0.004) discard;
        vec3 col = mix(uCloudGlow, uCloudDark, smoothstep(0.52, 0.85, vUv.y));
        gl_FragColor = vec4(col, a);
      }
    `,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(118000, 32, 16), mat);
  dome.renderOrder = -8;   // after stars (-9) so cloud cutouts occlude them
  dome.frustumCulled = false;
  scene.add(dome);
  return dome;
}
