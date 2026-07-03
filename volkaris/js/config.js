// ════════════════════════════════════════════════════════════════
// VOLKARIS // ESCAPE VELOCITY — shared constants + helpers
//
// A special planetside level for INTERSTELLAR SLINGSHOT
// (github.com/Benergy80/InterstellarSlingshot).
//
// A tiny fortress world in the original synthwave palette. The
// horizon curves away just out of view (Messenger-style scale), the
// districts wrap the sphere like a maze, and the only way home is
// finding the spaceport where your ship is impounded.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';

export const C = {
  SEED: 8709,

  // ── Planet ──
  R: 60,                // planet radius (u) — Messenger-small: the
                        // horizon is ~14u away, a street corner ahead
  TERRAIN_AMP: 9,       // tall features — streets thread canyons between them
  TERRAIN_DETAIL: 96,   // sphere segments (96×96 lat-lon grid)

  // ── Atmosphere / camera ──
  CAM_FAR: 4000,
  FOG_DAY: 0xff9e6a,    // sunset haze (fog is re-tinted live by sky.js)
  FOG_NIGHT: 0x180a30,
  FOG_DENSITY: 0.011,   // dense enough that the horizon melts away

  // ── Day / night ──
  SUN_PERIOD: 240,      // seconds per full orbit of the sun
  SUN_TILT: 0.42,       // orbital tilt (rad) so shadows sweep, not strobe

  // ── Bloom ──
  BLOOM: { strength: 0.85, radius: 0.5, threshold: 0.52 },

  // ── Captain (acrobatic power-suit movement) ──
  PLAYER: {
    eye: 1.62,
    radius: 0.5,
    height: 1.8,
    gravity: 30,         // u/s² toward planet center
    walk: 6.2,
    sprint: 9.6,         // W-W double-tap sprint (no energy cost)
    boost: 12.5,         // B sprint (NC scheme)
    boostDrain: 14,      // energy/s while boosting
    brakeDamping: 26.0,  // X hard brake
    doubleTapMs: 300,    // W-W sprint window
    camPitchHome: -0.08, // pitch the camera springs back to when the arrows let go
    strafeBank: 0.10,    // A/D lean, echoes the ship's banking
    // Arrow-key look — EXACT values from game-physics.js rotationalInertia
    rot: {
      accel: 0.0030,
      maxSpeed: 0.022,
      precAccel: 0.0020,     // CapsLock precision
      precMaxSpeed: 0.015,
      decel: 0.93,           // per-frame decay (60 fps reference)
    },
    accel: 46,
    airAccel: 14,
    damping: 11,
    jumpVel: 10.5,
    flipVel: 11.5,       // double-jump front-flip
    rollBoost: 5.5,      // burst of speed when rolling
    wallRunSpeed: 12.5,  // min speed maintained during a wall run
    wallRunGrav: 6,      // reduced gravity while wall-running
    wallRunMax: 1.6,     // seconds a wall run can last
    wallJumpKick: 9,     // push-off velocity leaving a wall
    hoverThrust: 22,     // Q jets — brief hover
    hoverMax: 1.1,       // seconds of hover fuel
    energyMax: 100,
    boltCost: 2.0,
    energyRegen: 16,
    hpMax: 100,
  },

  QUALITY: { maxPixelRatio: 1.75 },
};

// ── Bright synthwave palette (no muted tones — this world glows) ──
export const NEON = {
  cyan: 0x00f6ff, magenta: 0xff2fd6, purple: 0xa74bff,
  orange: 0xff7a1a, amber: 0xffc400, red: 0xff2e4d,
  lime: 0x5dffb2, blue: 0x3f8cff, pink: 0xff6ec7, white: 0xf2fbff,
};
export const NEON_LIST = [NEON.cyan, NEON.magenta, NEON.purple, NEON.orange, NEON.amber, NEON.lime, NEON.pink, NEON.blue];

// district ground-glow tints (bright, saturated — the "circuit board" look)
export const GROUND = {
  rockHi: new THREE.Color(0xa465ea),   // sunset-lit violet rock
  rockLo: new THREE.Color(0x45217d),   // shadowed purple
  pad: new THREE.Color(0x2a1660),      // district pad base
  sand: new THREE.Color(0xe07cab),     // pink dust flats
};

// ── Deterministic RNG (mulberry32, same as the rest of the game) ──
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
export const smooth = (t) => t * t * (3 - 2 * t);

// ── Spherical helpers ──
// latLon → unit direction. lat 0 = equator, +90 = north pole. Degrees.
export function sphDir(latDeg, lonDeg, out = new THREE.Vector3()) {
  const lat = latDeg * Math.PI / 180, lon = lonDeg * Math.PI / 180;
  const c = Math.cos(lat);
  return out.set(c * Math.cos(lon), Math.sin(lat), c * Math.sin(lon));
}

// Local tangent frame at a surface direction: returns {up, east, north}.
// Basis (x=east, y=up, z=north) is right-handed BY CONSTRUCTION:
// north = east × up, so east × up = north ⇒ det = +1 always.
export function tangentFrame(dir) {
  const up = dir.clone().normalize();
  const east = new THREE.Vector3(-up.z, 0, up.x);
  if (east.lengthSq() < 1e-6) east.set(1, 0, 0);   // at the poles
  east.normalize();
  const north = new THREE.Vector3().crossVectors(east, up).normalize();
  return { up, east, north };
}

// Matrix mapping local space (x=east, y=up, z=north) onto the planet
// surface at `dir`, standing at radius r, twisted by yawDeg around up.
export function surfaceMatrix(dir, r, yawDeg = 0) {
  const { up, east, north } = tangentFrame(dir);
  const m = new THREE.Matrix4().makeBasis(east, up, north);
  if (yawDeg) {
    const q = new THREE.Quaternion().setFromAxisAngle(up, yawDeg * Math.PI / 180);
    m.premultiply(new THREE.Matrix4().makeRotationFromQuaternion(q));
  }
  m.setPosition(up.clone().multiplyScalar(r));
  return m;
}

// ── 3D value noise on the sphere (deterministic, seedless trig hash) ──
function vhash(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise3(v) {
  const xi = Math.floor(v.x), yi = Math.floor(v.y), zi = Math.floor(v.z);
  const xf = v.x - xi, yf = v.y - yi, zf = v.z - zi;
  const u = smooth(xf), w = smooth(yf), q = smooth(zf);
  let acc = 0;
  for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) for (let dz = 0; dz <= 1; dz++) {
    const h = vhash(xi + dx, yi + dy, zi + dz);
    acc += h * (dx ? u : 1 - u) * (dy ? w : 1 - w) * (dz ? q : 1 - q);
  }
  return acc;   // 0..1
}
export function fbm3(v, octaves = 4) {
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  const t = new THREE.Vector3();
  for (let i = 0; i < octaves; i++) {
    t.copy(v).multiplyScalar(f);
    sum += noise3(t) * amp;
    norm += amp;
    amp *= 0.5; f *= 2.03;
  }
  return sum / norm;   // 0..1
}

// ── Canvas helpers (signs, textures) ──
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
export function canvasTexture(canvas, { srgb = true, repeat = null } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
  tex.anisotropy = 4;
  return tex;
}
export function hexCss(hex, a = 1) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  return `rgba(${r},${g},${b},${a})`;
}
