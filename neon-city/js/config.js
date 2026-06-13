// ════════════════════════════════════════════════════════════════
// NEON CITY // NC-2287 — shared constants + deterministic helpers
// Control-feel constants mirror Interstellar Slingshot
// (js/game-physics.js rotationalInertia, game-controls.js doubleTap).
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// A merged humanoid body (head, torso, arms, legs) ~1.8m tall, feet at y=0.
// Shared by the player avatar and the city's pedestrians.
export function humanoidGeo() {
  const P = [];
  const torso = new THREE.BoxGeometry(0.5, 0.66, 0.28); torso.translate(0, 1.18, 0); P.push(torso);
  const hips = new THREE.BoxGeometry(0.46, 0.3, 0.26); hips.translate(0, 0.82, 0); P.push(hips);
  const neck = new THREE.CylinderGeometry(0.08, 0.08, 0.12, 6); neck.translate(0, 1.58, 0); P.push(neck);
  const head = new THREE.SphereGeometry(0.17, 10, 8); head.translate(0, 1.74, 0); P.push(head);
  for (const s of [-1, 1]) {
    const sh = new THREE.SphereGeometry(0.1, 6, 5); sh.translate(s * 0.33, 1.44, 0); P.push(sh);
    const up = new THREE.CapsuleGeometry(0.08, 0.3, 3, 6); up.translate(s * 0.33, 1.22, 0); P.push(up);
    const lo = new THREE.CapsuleGeometry(0.07, 0.3, 3, 6); lo.translate(s * 0.33, 0.88, 0.03); P.push(lo);
    const th = new THREE.CapsuleGeometry(0.1, 0.34, 3, 6); th.translate(s * 0.13, 0.52, 0); P.push(th);
    const sk = new THREE.CapsuleGeometry(0.09, 0.34, 3, 6); sk.translate(s * 0.13, 0.16, 0.02); P.push(sk);
    const ft = new THREE.BoxGeometry(0.13, 0.09, 0.27); ft.translate(s * 0.13, -0.02, 0.06); P.push(ft);
  }
  const g = BufferGeometryUtils.mergeGeometries(P);
  g.translate(0, 0.06, 0);   // lift so the soles sit at y=0
  return g;
}

export const C = {
  SEED: 22870,

  // ── City grid ──
  GRID: 11,            // blocks per side
  BLOCK: 64,           // block footprint (u)
  ROAD: 18,            // road width between blocks (u)
  get CELL() { return this.BLOCK + this.ROAD; },
  get SPAN() { return this.GRID * this.CELL; },        // full city width
  get HALF() { return this.SPAN / 2; },

  // ── Atmosphere ──
  FOG_COLOR: 0x0a0618,
  FOG_DENSITY: 0.0036,
  CAM_FAR: 150000,   // mothergame scale — Hubble dome sits at 140k

  // ── Bloom (UnrealBloomPass) ──
  BLOOM: { strength: 0.72, radius: 0.44, threshold: 0.48 },

  // ── Player (Interstellar Slingshot scheme, gravity-adapted) ──
  PLAYER: {
    eye: 1.75,            // standing eye height
    radius: 0.55,         // collision radius
    gravity: 26,          // u/s² downward
    jumpVel: 9.2,         // W-W tactical hop
    walk: 7.0,            // m/s
    boost: 15.5,          // B sprint m/s
    accel: 38,            // ground acceleration
    airAccel: 9,
    damping: 10.0,        // matches mothergame: velocity -= velocity*10*dt
    brakeDamping: 26.0,   // X key hard brake
    doubleTapMs: 300,     // game-controls.js doubleTapThreshold
    // Arrow-key look — EXACT values from game-physics.js rotationalInertia.
    // Default = fast turning; CapsLock = slow/precision (inverted, like the game).
    rot: {
      accel: 0.0030,         // fastAcceleration
      maxSpeed: 0.022,       // fastMaxSpeed
      precAccel: 0.0020,     // acceleration (CapsLock precision)
      precMaxSpeed: 0.015,   // maxSpeed (CapsLock precision)
      decel: 0.93,           // deceleration multiplier per frame
    },
    strafeBank: 0.10,     // A/D lean, echoes the ship's strafe banking
    leanAngle: 0.22,      // Q/E peek roll (rad)
    energyMax: 100,
    boostDrain: 14,       // energy/s while boosting
    laserCost: 1.6,
    missileCost: 18,
    shieldDrain: 3.5,
    energyRegen: 9,
  },

  // ── Monorail ──
  RAIL: {
    height: 16,
    speed: 26,           // u/s cruise
    dwell: 9.0,          // station stop seconds
    carLen: 11,
    carGap: 12.2,
    cars: 5,
  },

  // ── Traffic ──
  CARS: 176,
  AIR_LANES: [46, 72, 100, 128],
  AIR_COUNT: 64,

  QUALITY: { maxPixelRatio: 1.75 },
};

// ── Neon palette ──
export const NEON = {
  cyan: 0x00f0ff, magenta: 0xff2bd6, purple: 0x9d4cff,
  amber: 0xffb300, red: 0xff3355, lime: 0x53ffe9,
  blue: 0x3d7bff, white: 0xeaf6ff,
};
export const NEON_LIST = [NEON.cyan, NEON.magenta, NEON.purple, NEON.amber, NEON.lime, NEON.blue];

// ── Deterministic RNG (mulberry32) — whole city reproducible from SEED ──
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (rnd, arr) => arr[(rnd() * arr.length) | 0];
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Canvas helpers ──
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

export function canvasTexture(canvas, { srgb = true, repeat = null, nearest = false } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (nearest) { tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestMipmapLinearFilter; }
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
  tex.anisotropy = 4;
  return tex;
}

// Soft radial glow sprite texture (street-light pools, headlights, engine glow).
export function glowTexture(size = 128, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const [c, ctx] = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.55)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvasTexture(c);
}

// Vertical streak texture for rain points.
export function streakTexture() {
  const [c, ctx] = makeCanvas(32, 64);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(160,220,255,0)');
  g.addColorStop(0.5, 'rgba(190,235,255,0.9)');
  g.addColorStop(1, 'rgba(160,220,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(13, 0, 6, 64);
  return canvasTexture(c);
}

export function hexCss(hex, a = 1) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  return `rgba(${r},${g},${b},${a})`;
}
