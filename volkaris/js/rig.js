// ════════════════════════════════════════════════════════════════
// VOLKARIS — character rig system
//
// Sophisticated-but-procedural humanoids, Messenger-style fluidity
// without asset files:
//   · a real THREE.Skeleton (20+ bones) per character
//   · body parts skinned rigidly to bones and merged into TWO
//     SkinnedMeshes (armor + neon glow) → 2 draw calls per character
//   · a keyframe clip player (euler tracks + root bob) with
//     crossfades, time-scaling and one-shots
//   · procedural aim overlay: the right arm tracks the crosshair on
//     top of any locomotion clip, so the Captain shoots mid-flip
//   · props (blasters, wings, capes, cannons) ride bones directly
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { NEON, mulberry32, pick, clamp, lerp } from './config.js';

// ── skeleton layout: [name, parent, x, y, z] (bind pose, T-ish) ──
const BONE_DEFS = [
  ['hips', null, 0, 0.98, 0],
  ['spine', 'hips', 0, 0.14, 0],
  ['chest', 'spine', 0, 0.26, 0],
  ['neck', 'chest', 0, 0.24, 0],
  ['head', 'neck', 0, 0.13, 0],
  ['shoulderL', 'chest', -0.245, 0.165, 0],
  ['upperArmL', 'shoulderL', -0.075, 0, 0],
  ['foreArmL', 'upperArmL', 0, -0.30, 0],
  ['handL', 'foreArmL', 0, -0.27, 0],
  ['shoulderR', 'chest', 0.245, 0.165, 0],
  ['upperArmR', 'shoulderR', 0.075, 0, 0],
  ['foreArmR', 'upperArmR', 0, -0.30, 0],
  ['handR', 'foreArmR', 0, -0.27, 0],
  ['thighL', 'hips', -0.145, -0.05, 0],
  ['shinL', 'thighL', 0, -0.44, 0],
  ['footL', 'shinL', 0, -0.44, 0],
  ['thighR', 'hips', 0.145, -0.05, 0],
  ['shinR', 'thighR', 0, -0.44, 0],
  ['footR', 'shinR', 0, -0.44, 0],
  // optional extras (only meshed if the spec uses them)
  ['wingL', 'chest', -0.16, 0.12, -0.12],
  ['wingR', 'chest', 0.16, 0.12, -0.12],
  ['capeA', 'chest', 0, 0.18, -0.17],
  ['capeB', 'capeA', 0, -0.55, 0],
  ['capeC', 'capeB', 0, -0.55, 0],
];

// ════════════ CLIP LIBRARY ════════════
// tracks: bone → [[t, rx, ry, rz], …]  ·  bob: [[t, Δy]] on hips
// Untracked bones ease back to the bind pose, so clips stay terse.
const K = Math.PI / 180;
export const CLIPS = {
  idle: {
    dur: 4.2, loop: true,
    bob: [[0, 0], [2.1, 0.015], [4.2, 0]],
    tracks: {
      spine: [[0, 1.5 * K, 0, 0], [2.1, -1 * K, 0, 0], [4.2, 1.5 * K, 0, 0]],
      chest: [[0, 2 * K, 0, 0], [2.1, 0, 0, 0], [4.2, 2 * K, 0, 0]],
      head: [[0, 0, 0, 0], [1.4, 0, 6 * K, 0], [2.9, 0, -5 * K, 0], [4.2, 0, 0, 0]],
      upperArmL: [[0, 0, 0, 6 * K], [2.1, 0, 0, 8 * K], [4.2, 0, 0, 6 * K]],
      upperArmR: [[0, 0, 0, -6 * K], [2.1, 0, 0, -8 * K], [4.2, 0, 0, -6 * K]],
      foreArmL: [[0, -8 * K, 0, 0]], foreArmR: [[0, -8 * K, 0, 0]],
    },
  },
  walk: {
    dur: 0.92, loop: true,
    bob: [[0, 0.015], [0.23, -0.02], [0.46, 0.015], [0.69, -0.02], [0.92, 0.015]],
    tracks: {
      thighL: [[0, 28 * K, 0, 0], [0.46, -24 * K, 0, 0], [0.92, 28 * K, 0, 0]],
      thighR: [[0, -24 * K, 0, 0], [0.46, 28 * K, 0, 0], [0.92, -24 * K, 0, 0]],
      shinL: [[0, -4 * K, 0, 0], [0.23, 32 * K, 0, 0], [0.46, -2 * K, 0, 0], [0.69, 8 * K, 0, 0], [0.92, -4 * K, 0, 0]],
      shinR: [[0, -2 * K, 0, 0], [0.23, 8 * K, 0, 0], [0.46, -4 * K, 0, 0], [0.69, 32 * K, 0, 0], [0.92, -2 * K, 0, 0]],
      footL: [[0, -8 * K, 0, 0], [0.46, 6 * K, 0, 0], [0.92, -8 * K, 0, 0]],
      footR: [[0, 6 * K, 0, 0], [0.46, -8 * K, 0, 0], [0.92, 6 * K, 0, 0]],
      upperArmL: [[0, -22 * K, 0, 5 * K], [0.46, 25 * K, 0, 5 * K], [0.92, -22 * K, 0, 5 * K]],
      upperArmR: [[0, 25 * K, 0, -5 * K], [0.46, -22 * K, 0, -5 * K], [0.92, 25 * K, 0, -5 * K]],
      foreArmL: [[0, -20 * K, 0, 0]], foreArmR: [[0, -20 * K, 0, 0]],
      spine: [[0, 3 * K, 4 * K, 0], [0.46, 3 * K, -4 * K, 0], [0.92, 3 * K, 4 * K, 0]],
    },
  },
  run: {
    dur: 0.58, loop: true,
    bob: [[0, 0.03], [0.145, -0.045], [0.29, 0.03], [0.435, -0.045], [0.58, 0.03]],
    tracks: {
      thighL: [[0, 55 * K, 0, 0], [0.29, -45 * K, 0, 0], [0.58, 55 * K, 0, 0]],
      thighR: [[0, -45 * K, 0, 0], [0.29, 55 * K, 0, 0], [0.58, -45 * K, 0, 0]],
      shinL: [[0, -8 * K, 0, 0], [0.145, 80 * K, 0, 0], [0.29, -4 * K, 0, 0], [0.435, 30 * K, 0, 0], [0.58, -8 * K, 0, 0]],
      shinR: [[0, -4 * K, 0, 0], [0.145, 30 * K, 0, 0], [0.29, -8 * K, 0, 0], [0.435, 80 * K, 0, 0], [0.58, -4 * K, 0, 0]],
      footL: [[0, -14 * K, 0, 0], [0.29, 10 * K, 0, 0], [0.58, -14 * K, 0, 0]],
      footR: [[0, 10 * K, 0, 0], [0.29, -14 * K, 0, 0], [0.58, 10 * K, 0, 0]],
      upperArmL: [[0, -50 * K, 0, 8 * K], [0.29, 55 * K, 0, 8 * K], [0.58, -50 * K, 0, 8 * K]],
      upperArmR: [[0, 55 * K, 0, -8 * K], [0.29, -50 * K, 0, -8 * K], [0.58, 55 * K, 0, -8 * K]],
      foreArmL: [[0, -75 * K, 0, 0]], foreArmR: [[0, -75 * K, 0, 0]],
      chest: [[0, 12 * K, 0, 0]],
      spine: [[0, 6 * K, 7 * K, 0], [0.29, 6 * K, -7 * K, 0], [0.58, 6 * K, 7 * K, 0]],
    },
  },
  sprint: {
    dur: 0.44, loop: true,
    bob: [[0, 0.045], [0.11, -0.055], [0.22, 0.045], [0.33, -0.055], [0.44, 0.045]],
    tracks: {
      thighL: [[0, 72 * K, 0, 0], [0.22, -58 * K, 0, 0], [0.44, 72 * K, 0, 0]],
      thighR: [[0, -58 * K, 0, 0], [0.22, 72 * K, 0, 0], [0.44, -58 * K, 0, 0]],
      shinL: [[0, -10 * K, 0, 0], [0.11, 105 * K, 0, 0], [0.22, -6 * K, 0, 0], [0.33, 40 * K, 0, 0], [0.44, -10 * K, 0, 0]],
      shinR: [[0, -6 * K, 0, 0], [0.11, 40 * K, 0, 0], [0.22, -10 * K, 0, 0], [0.33, 105 * K, 0, 0], [0.44, -6 * K, 0, 0]],
      upperArmL: [[0, -70 * K, 0, 10 * K], [0.22, 75 * K, 0, 10 * K], [0.44, -70 * K, 0, 10 * K]],
      upperArmR: [[0, 75 * K, 0, -10 * K], [0.22, -70 * K, 0, -10 * K], [0.44, 75 * K, 0, -10 * K]],
      foreArmL: [[0, -95 * K, 0, 0]], foreArmR: [[0, -95 * K, 0, 0]],
      chest: [[0, 20 * K, 0, 0]],
      spine: [[0, 8 * K, 9 * K, 0], [0.22, 8 * K, -9 * K, 0], [0.44, 8 * K, 9 * K, 0]],
    },
  },
  jump: {
    dur: 0.55, loop: false,
    bob: [[0, -0.1], [0.16, 0.05], [0.55, 0.02]],
    tracks: {
      thighL: [[0, 40 * K, 0, 0], [0.2, -28 * K, 0, 0], [0.55, 18 * K, 0, 0]],
      thighR: [[0, 40 * K, 0, 0], [0.2, 12 * K, 0, 0], [0.55, -14 * K, 0, 0]],
      shinL: [[0, 60 * K, 0, 0], [0.2, 30 * K, 0, 0], [0.55, 30 * K, 0, 0]],
      shinR: [[0, 60 * K, 0, 0], [0.2, 55 * K, 0, 0], [0.55, 20 * K, 0, 0]],
      upperArmL: [[0, 30 * K, 0, 15 * K], [0.2, -140 * K, 0, 20 * K], [0.55, -30 * K, 0, 12 * K]],
      upperArmR: [[0, 30 * K, 0, -15 * K], [0.2, -140 * K, 0, -20 * K], [0.55, -30 * K, 0, -12 * K]],
      chest: [[0, 18 * K, 0, 0], [0.2, -8 * K, 0, 0], [0.55, 4 * K, 0, 0]],
    },
  },
  tuck: {   // used by the front-flip and the ground roll
    dur: 0.42, loop: false,
    bob: [[0, 0], [0.42, -0.12]],
    tracks: {
      thighL: [[0, 30 * K, 0, 0], [0.14, -105 * K, 0, 0], [0.42, -105 * K, 0, 0]],
      thighR: [[0, 30 * K, 0, 0], [0.14, -105 * K, 0, 0], [0.42, -105 * K, 0, 0]],
      shinL: [[0, 40 * K, 0, 0], [0.14, 130 * K, 0, 0], [0.42, 130 * K, 0, 0]],
      shinR: [[0, 40 * K, 0, 0], [0.14, 130 * K, 0, 0], [0.42, 130 * K, 0, 0]],
      chest: [[0, 20 * K, 0, 0], [0.14, 48 * K, 0, 0], [0.42, 48 * K, 0, 0]],
      spine: [[0, 10 * K, 0, 0], [0.14, 32 * K, 0, 0], [0.42, 32 * K, 0, 0]],
      head: [[0, 8 * K, 0, 0], [0.14, 28 * K, 0, 0], [0.42, 28 * K, 0, 0]],
      upperArmL: [[0, 0, 0, 10 * K], [0.14, -60 * K, 0, 40 * K], [0.42, -60 * K, 0, 40 * K]],
      upperArmR: [[0, 0, 0, -10 * K], [0.14, -60 * K, 0, -40 * K], [0.42, -60 * K, 0, -40 * K]],
      foreArmL: [[0, -100 * K, 0, 0]], foreArmR: [[0, -100 * K, 0, 0]],
    },
  },
  wallrunL: {
    dur: 0.5, loop: true,
    bob: [[0, 0.02], [0.25, -0.02], [0.5, 0.02]],
    tracks: {
      spine: [[0, 4 * K, 0, 16 * K]], chest: [[0, 8 * K, 0, 10 * K]],
      head: [[0, 0, -18 * K, -12 * K]],
      thighL: [[0, 48 * K, 0, 8 * K], [0.25, -40 * K, 0, 8 * K], [0.5, 48 * K, 0, 8 * K]],
      thighR: [[0, -40 * K, 0, -4 * K], [0.25, 48 * K, 0, -4 * K], [0.5, -40 * K, 0, -4 * K]],
      shinL: [[0, 0, 0, 0], [0.125, 70 * K, 0, 0], [0.375, 25 * K, 0, 0], [0.5, 0, 0, 0]],
      shinR: [[0, 25 * K, 0, 0], [0.125, 0, 0, 0], [0.375, 70 * K, 0, 0], [0.5, 25 * K, 0, 0]],
      upperArmL: [[0, -40 * K, 0, 30 * K], [0.25, 45 * K, 0, 30 * K], [0.5, -40 * K, 0, 30 * K]],
      upperArmR: [[0, 45 * K, 0, -20 * K], [0.25, -40 * K, 0, -20 * K], [0.5, 45 * K, 0, -20 * K]],
    },
  },
  wallrunR: {
    dur: 0.5, loop: true,
    bob: [[0, 0.02], [0.25, -0.02], [0.5, 0.02]],
    tracks: {
      spine: [[0, 4 * K, 0, -16 * K]], chest: [[0, 8 * K, 0, -10 * K]],
      head: [[0, 0, 18 * K, 12 * K]],
      thighL: [[0, -40 * K, 0, 4 * K], [0.25, 48 * K, 0, 4 * K], [0.5, -40 * K, 0, 4 * K]],
      thighR: [[0, 48 * K, 0, -8 * K], [0.25, -40 * K, 0, -8 * K], [0.5, 48 * K, 0, -8 * K]],
      shinL: [[0, 25 * K, 0, 0], [0.125, 0, 0, 0], [0.375, 70 * K, 0, 0], [0.5, 25 * K, 0, 0]],
      shinR: [[0, 0, 0, 0], [0.125, 70 * K, 0, 0], [0.375, 25 * K, 0, 0], [0.5, 0, 0, 0]],
      upperArmL: [[0, 45 * K, 0, 20 * K], [0.25, -40 * K, 0, 20 * K], [0.5, 45 * K, 0, 20 * K]],
      upperArmR: [[0, -40 * K, 0, -30 * K], [0.25, 45 * K, 0, -30 * K], [0.5, -40 * K, 0, -30 * K]],
    },
  },
  hover: {
    dur: 1.4, loop: true,
    bob: [[0, 0.02], [0.7, -0.02], [1.4, 0.02]],
    tracks: {
      thighL: [[0, -18 * K, 0, 6 * K], [0.7, -26 * K, 0, 6 * K], [1.4, -18 * K, 0, 6 * K]],
      thighR: [[0, -26 * K, 0, -6 * K], [0.7, -18 * K, 0, -6 * K], [1.4, -26 * K, 0, -6 * K]],
      shinL: [[0, 35 * K, 0, 0]], shinR: [[0, 42 * K, 0, 0]],
      upperArmL: [[0, -20 * K, 0, 45 * K], [0.7, -25 * K, 0, 52 * K], [1.4, -20 * K, 0, 45 * K]],
      upperArmR: [[0, -20 * K, 0, -45 * K], [0.7, -25 * K, 0, -52 * K], [1.4, -20 * K, 0, -45 * K]],
      chest: [[0, -6 * K, 0, 0]],
    },
  },
  fall: {
    dur: 0.8, loop: true,
    tracks: {
      thighL: [[0, 22 * K, 0, 8 * K], [0.4, 30 * K, 0, 8 * K], [0.8, 22 * K, 0, 8 * K]],
      thighR: [[0, 30 * K, 0, -8 * K], [0.4, 22 * K, 0, -8 * K], [0.8, 30 * K, 0, -8 * K]],
      shinL: [[0, 20 * K, 0, 0]], shinR: [[0, 28 * K, 0, 0]],
      upperArmL: [[0, -80 * K, 0, 55 * K]], upperArmR: [[0, -80 * K, 0, -55 * K]],
      foreArmL: [[0, -30 * K, 0, 0]], foreArmR: [[0, -30 * K, 0, 0]],
      chest: [[0, -8 * K, 0, 0]],
    },
  },
  die: {
    dur: 0.8, loop: false,
    bob: [[0, 0], [0.35, -0.3], [0.8, -0.72]],
    tracks: {
      chest: [[0, 0, 0, 0], [0.35, -30 * K, 0, 8 * K], [0.8, -70 * K, 0, 14 * K]],
      spine: [[0, 0, 0, 0], [0.8, -30 * K, 0, 0]],
      head: [[0, 0, 0, 0], [0.8, -40 * K, 0, 20 * K]],
      thighL: [[0, 10 * K, 0, 0], [0.8, -70 * K, 0, 14 * K]],
      thighR: [[0, 10 * K, 0, 0], [0.8, -50 * K, 0, -20 * K]],
      shinL: [[0, 10 * K, 0, 0], [0.8, 60 * K, 0, 0]],
      shinR: [[0, 10 * K, 0, 0], [0.8, 40 * K, 0, 0]],
      upperArmL: [[0, 0, 0, 10 * K], [0.8, -40 * K, 0, 70 * K]],
      upperArmR: [[0, 0, 0, -10 * K], [0.8, 30 * K, 0, -60 * K]],
    },
  },
  sit: {
    dur: 5, loop: true,
    bob: [[0, -0.34]],
    tracks: {
      thighL: [[0, -88 * K, 0, 6 * K]], thighR: [[0, -88 * K, 0, -6 * K]],
      shinL: [[0, 92 * K, 0, 0]], shinR: [[0, 92 * K, 0, 0]],
      upperArmL: [[0, -18 * K, 0, 14 * K]], upperArmR: [[0, -18 * K, 0, -14 * K]],
      foreArmL: [[0, -55 * K, 0, 0]], foreArmR: [[0, -55 * K, 0, 0]],
      chest: [[0, -4 * K, 0, 0], [2.5, 2 * K, 0, 0], [5, -4 * K, 0, 0]],
      head: [[0, 6 * K, 0, 0], [2.5, 6 * K, -10 * K, 0], [5, 6 * K, 0, 0]],
    },
  },
  wave: {
    dur: 1.3, loop: true,
    tracks: {
      upperArmR: [[0, -160 * K, 0, -20 * K], [0.65, -160 * K, 0, -38 * K], [1.3, -160 * K, 0, -20 * K]],
      foreArmR: [[0, -30 * K, 0, 0], [0.65, -10 * K, 0, 0], [1.3, -30 * K, 0, 0]],
      head: [[0, 0, 8 * K, 0]],
      upperArmL: [[0, 0, 0, 8 * K]],
    },
  },
  lean: {   // merchants leaning on the stall
    dur: 4.6, loop: true,
    tracks: {
      chest: [[0, 14 * K, 0, 0], [2.3, 16 * K, 4 * K, 0], [4.6, 14 * K, 0, 0]],
      spine: [[0, 8 * K, 0, 0]],
      upperArmL: [[0, 40 * K, 0, 20 * K]], upperArmR: [[0, 40 * K, 0, -20 * K]],
      foreArmL: [[0, -60 * K, 0, 0]], foreArmR: [[0, -60 * K, 0, 0]],
      head: [[0, -10 * K, 0, 0], [2.3, -10 * K, 14 * K, 0], [4.6, -10 * K, 0, 0]],
    },
  },
  stomp: {  // Brakkus — slow, heavy, terrifying
    dur: 1.5, loop: true,
    bob: [[0, 0.03], [0.375, -0.05], [0.75, 0.03], [1.125, -0.05], [1.5, 0.03]],
    tracks: {
      thighL: [[0, 34 * K, 0, 4 * K], [0.75, -30 * K, 0, 4 * K], [1.5, 34 * K, 0, 4 * K]],
      thighR: [[0, -30 * K, 0, -4 * K], [0.75, 34 * K, 0, -4 * K], [1.5, -30 * K, 0, -4 * K]],
      shinL: [[0, -4 * K, 0, 0], [0.375, 45 * K, 0, 0], [0.75, -2 * K, 0, 0], [1.5, -4 * K, 0, 0]],
      shinR: [[0, -2 * K, 0, 0], [1.125, 45 * K, 0, 0], [1.5, -2 * K, 0, 0]],
      chest: [[0, 6 * K, 5 * K, 3 * K], [0.75, 6 * K, -5 * K, -3 * K], [1.5, 6 * K, 5 * K, 3 * K]],
      upperArmL: [[0, -14 * K, 0, 24 * K], [0.75, 18 * K, 0, 24 * K], [1.5, -14 * K, 0, 24 * K]],
      upperArmR: [[0, 18 * K, 0, -24 * K], [0.75, -14 * K, 0, -24 * K], [1.5, 18 * K, 0, -24 * K]],
    },
  },
  fly: {    // Vultyr — wings beat, legs trail
    dur: 1.1, loop: true,
    bob: [[0, 0.05], [0.55, -0.06], [1.1, 0.05]],
    tracks: {
      wingL: [[0, 0, 0, 55 * K], [0.4, 0, 0, -35 * K], [0.75, 0, 0, -20 * K], [1.1, 0, 0, 55 * K]],
      wingR: [[0, 0, 0, -55 * K], [0.4, 0, 0, 35 * K], [0.75, 0, 0, 20 * K], [1.1, 0, 0, -55 * K]],
      thighL: [[0, -26 * K, 0, 4 * K]], thighR: [[0, -30 * K, 0, -4 * K]],
      shinL: [[0, 30 * K, 0, 0]], shinR: [[0, 36 * K, 0, 0]],
      chest: [[0, 22 * K, 0, 0]],
      upperArmL: [[0, -12 * K, 0, 30 * K]], upperArmR: [[0, -12 * K, 0, -30 * K]],
    },
  },
  throne: { // Vex rises from the throne — one-shot drama
    dur: 2.2, loop: false,
    bob: [[0, -0.34], [1.2, -0.1], [2.2, 0.02]],
    tracks: {
      thighL: [[0, -88 * K, 0, 6 * K], [1.4, -10 * K, 0, 2 * K], [2.2, 0, 0, 0]],
      thighR: [[0, -88 * K, 0, -6 * K], [1.4, -10 * K, 0, -2 * K], [2.2, 0, 0, 0]],
      shinL: [[0, 92 * K, 0, 0], [1.4, 14 * K, 0, 0], [2.2, 0, 0, 0]],
      shinR: [[0, 92 * K, 0, 0], [1.4, 14 * K, 0, 0], [2.2, 0, 0, 0]],
      chest: [[0, -4 * K, 0, 0], [1.6, 6 * K, 0, 0], [2.2, 2 * K, 0, 0]],
      upperArmL: [[0, -18 * K, 0, 14 * K], [1.8, -30 * K, 0, 30 * K], [2.2, -160 * K, 0, 30 * K]],
      upperArmR: [[0, -18 * K, 0, -14 * K], [2.2, -20 * K, 0, -14 * K]],
      head: [[0, 6 * K, 0, 0], [2.2, -4 * K, 0, 0]],
    },
  },
};

// ════════════ RIG BUILDER ════════════
const _e = new THREE.Euler();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

function sampleTrack(track, t) {
  if (!track || track.length === 0) return null;
  if (track.length === 1) return track[0];
  let i = 0;
  while (i < track.length - 1 && track[i + 1][0] <= t) i++;
  if (i >= track.length - 1) return track[track.length - 1];
  const a = track[i], b = track[i + 1];
  const f = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
  return [t, lerp(a[1], b[1], f), lerp(a[2] ?? 0, b[2] ?? 0, f), lerp(a[3] ?? 0, b[3] ?? 0, f)];
}

export function buildRig(spec) {
  // spec: { parts: [{bone, type, size, pos, rot?, color, glow?, boost?}],
  //         scale, matOpts, useWings, useCape }
  const scale = spec.scale ?? 1;
  const bones = {};
  const boneList = [];
  for (const [name, parent, x, y, z] of BONE_DEFS) {
    if ((name.startsWith('wing') && !spec.useWings) || (name.startsWith('cape') && !spec.useCape)) continue;
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    bones[name] = b;
    boneList.push(b);
    if (parent) bones[parent].add(b);
  }
  // bake bind-pose world matrices BEFORE the skeleton snapshots its
  // inverses, or every bone inverse is identity and skinning doubles up
  bones.hips.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(boneList);

  // bind-pose world positions (all rotations zero → just summed offsets)
  const bindPos = {};
  for (const [name, parent, x, y, z] of BONE_DEFS) {
    if (!bones[name]) continue;
    const p = parent ? bindPos[parent].clone() : new THREE.Vector3();
    bindPos[name] = p.add(new THREE.Vector3(x, y, z));
  }

  // build merged, rigid-skinned geometry (solid + glow)
  const solids = [], glows = [];
  const _c = new THREE.Color();
  for (const part of spec.parts) {
    const bi = boneList.indexOf(bones[part.bone]);
    if (bi < 0) continue;
    let g;
    const s = part.size;
    switch (part.type) {
      case 'sphere': g = new THREE.SphereGeometry(s[0], 10, 8); if (s[1]) g.scale(1, s[1], s[2] ?? 1); break;
      case 'cyl': g = new THREE.CylinderGeometry(s[0], s[1], s[2], 8); break;
      case 'cone': g = new THREE.ConeGeometry(s[0], s[1], 6); break;
      default: g = new THREE.BoxGeometry(s[0], s[1], s[2]);
    }
    if (part.rot) g.rotateX(part.rot[0]), g.rotateY(part.rot[1]), g.rotateZ(part.rot[2]);
    const bp = bindPos[part.bone];
    g.translate(bp.x + (part.pos?.[0] ?? 0), bp.y + (part.pos?.[1] ?? 0), bp.z + (part.pos?.[2] ?? 0));
    g = g.toNonIndexed();
    const n = g.attributes.position.count;
    _c.set(part.color);
    if (part.glow) _c.multiplyScalar(part.boost ?? 1.25);
    const col = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      si[i * 4] = bi; sw[i * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    (part.glow ? glows : solids).push(g);
  }

  function mergeSkinned(list) {
    if (!list.length) return null;
    // manual merge (BufferGeometryUtils balks at mixed attr sets)
    let vtx = 0;
    for (const g of list) vtx += g.attributes.position.count;
    const pos = new Float32Array(vtx * 3), nor = new Float32Array(vtx * 3), col = new Float32Array(vtx * 3);
    const si = new Uint16Array(vtx * 4), sw = new Float32Array(vtx * 4);
    let o = 0;
    for (const g of list) {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      if (!g.attributes.normal) g.computeVertexNormals();
      nor.set(g.attributes.normal.array, o * 3);
      col.set(g.attributes.color.array, o * 3);
      si.set(g.attributes.skinIndex.array, o * 4);
      sw.set(g.attributes.skinWeight.array, o * 4);
      o += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    out.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    return out;
  }

  const group = new THREE.Group();
  const root = bones.hips;
  group.add(root);

  const solidGeo = mergeSkinned(solids);
  const solidMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: spec.matOpts?.roughness ?? 0.42,
    metalness: spec.matOpts?.metalness ?? 0.55,
  });
  const solidMesh = new THREE.SkinnedMesh(solidGeo, solidMat);
  solidMesh.castShadow = true;
  solidMesh.frustumCulled = false;   // animated bounds — cheaper to just draw
  group.add(solidMesh);
  solidMesh.bind(skeleton, new THREE.Matrix4());

  let glowMesh = null;
  if (glows.length) {
    const glowGeo = mergeSkinned(glows);
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    glowMesh = new THREE.SkinnedMesh(glowGeo, glowMat);
    glowMesh.frustumCulled = false;
    group.add(glowMesh);
    glowMesh.bind(skeleton, new THREE.Matrix4());
  }
  group.scale.setScalar(scale);

  // ── clip player ──
  const state = {
    a: 'idle', b: null, tA: 0, tB: 0, blend: 0, fade: 0.16,
    timeScale: 1, oneShot: null, aimW: 0, aimPitch: 0, recoil: 0,
  };
  const hipsBaseY = bones.hips.position.y;

  function play(name, { fade = 0.16, timeScale = 1, restart = false } = {}) {
    if (!CLIPS[name]) return;
    if (state.b === name && !restart) return;
    if (state.a === name && state.b === null && !restart) { state.timeScale = timeScale; return; }
    state.b = name; state.tB = 0; state.blend = 0; state.fade = fade; state.timeScale = timeScale;
  }
  function current() { return state.b ?? state.a; }

  function applyPose(dt) {
    state.tA += dt * state.timeScale;
    if (state.b !== null) {
      state.tB += dt * state.timeScale;
      state.blend = Math.min(1, state.blend + dt / state.fade);
      if (state.blend >= 1) { state.a = state.b; state.tA = state.tB; state.b = null; }
    }
    const clipA = CLIPS[state.a], clipB = state.b ? CLIPS[state.b] : null;
    const wrap = (clip, t) => clip.loop ? (t % clip.dur) : Math.min(t, clip.dur - 1e-4);
    const ta = wrap(clipA, state.tA), tb = clipB ? wrap(clipB, state.tB) : 0;
    const mix = state.b ? state.blend : 0;

    for (const name in bones) {
      if (name === 'hips') continue;
      const ka = sampleTrack(clipA.tracks[name], ta);
      const kb = clipB ? sampleTrack(clipB.tracks[name], tb) : null;
      const ax = ka ? ka[1] : 0, ay = ka ? ka[2] : 0, az = ka ? ka[3] : 0;
      const bx = kb ? kb[1] : 0, by = kb ? kb[2] : 0, bz = kb ? kb[3] : 0;
      const b = bones[name];
      if (mix > 0) {
        _q1.setFromEuler(_e.set(ax, ay, az));
        _q2.setFromEuler(_e.set(bx, by, bz));
        _q1.slerp(_q2, mix);
        b.quaternion.copy(_q1);
      } else {
        b.rotation.set(ax, ay, az);
      }
    }
    // root bob
    const bobA = sampleTrack(clipA.bob, ta), bobB = clipB ? sampleTrack(clipB.bob, tb) : null;
    const bob = lerp(bobA ? bobA[1] : 0, bobB ? bobB[1] : (bobA ? bobA[1] : 0), mix);
    bones.hips.position.y = hipsBaseY + bob;

    // ── aim overlay: right arm tracks the crosshair over any clip ──
    if (state.aimW > 0.001) {
      const w = state.aimW;
      const pitch = state.aimPitch + state.recoil * 0.5;
      _q1.copy(bones.upperArmR.quaternion);
      _q2.setFromEuler(_e.set(-Math.PI / 2 - pitch, -0.12, 0));
      bones.upperArmR.quaternion.copy(_q1.slerp(_q2, w));
      _q1.copy(bones.foreArmR.quaternion);
      _q2.setFromEuler(_e.set(-0.12 - state.recoil * 1.6, 0, 0));
      bones.foreArmR.quaternion.copy(_q1.slerp(_q2, w));
      // shoulders & head lean into the shot
      _q1.setFromEuler(_e.set(0, -0.18 * w, 0));
      bones.chest.quaternion.multiply(_q1);
    }
    state.recoil = Math.max(0, state.recoil - dt * 6);
  }

  return {
    group, bones, skeleton, solidMesh, glowMesh, spec,
    play, current,
    setAim(pitch, weight) { state.aimPitch = pitch; state.aimW = weight; },
    kickRecoil() { state.recoil = 1; },
    update(dt) { applyPose(dt); },
    state,
  };
}

// ════════════ PROPS ════════════
export function makeBlaster(hex = NEON.cyan) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x232438, roughness: 0.35, metalness: 0.8 }));
  body.position.set(0, -0.05, 0.14);
  g.add(body);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09),
    body.material);
  grip.position.set(0, -0.16, 0.0);
  grip.rotation.x = 0.3;
  g.add(grip);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.16, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(1.3), toneMapped: false }));
  tip.rotation.x = Math.PI / 2;
  tip.position.set(0, -0.02, 0.4);
  g.add(tip);
  g.userData.muzzle = new THREE.Object3D();
  g.userData.muzzle.position.set(0, -0.02, 0.5);
  g.add(g.userData.muzzle);
  return g;
}

// ════════════ CHARACTER FACTORIES ════════════
const SKIN = 0xd9a066;

function humanoidParts({ suit, suit2, trim, visor, skin = SKIN, helmet = null, glowChest = null }) {
  return [
    { bone: 'hips', type: 'box', size: [0.34, 0.22, 0.22], pos: [0, 0.02, 0], color: suit2 },
    { bone: 'spine', type: 'box', size: [0.3, 0.2, 0.2], pos: [0, 0.08, 0], color: suit },
    { bone: 'chest', type: 'box', size: [0.42, 0.34, 0.26], pos: [0, 0.1, 0], color: suit },
    ...(glowChest ? [{ bone: 'chest', type: 'box', size: [0.16, 0.12, 0.05], pos: [0, 0.12, 0.14], color: glowChest, glow: true }] : []),
    { bone: 'neck', type: 'cyl', size: [0.06, 0.07, 0.12], pos: [0, 0.04, 0], color: skin },
    { bone: 'head', type: 'sphere', size: [0.155, 1.1, 1], pos: [0, 0.1, 0.01], color: helmet ?? skin },
    ...(visor ? [{ bone: 'head', type: 'box', size: [0.24, 0.09, 0.06], pos: [0, 0.1, 0.13], color: visor, glow: true, boost: 1.3 }] : []),
    { bone: 'shoulderL', type: 'sphere', size: [0.085, 1, 1], pos: [-0.02, 0, 0], color: trim },
    { bone: 'shoulderR', type: 'sphere', size: [0.085, 1, 1], pos: [0.02, 0, 0], color: trim },
    { bone: 'upperArmL', type: 'cyl', size: [0.055, 0.065, 0.3], pos: [0, -0.15, 0], color: suit },
    { bone: 'upperArmR', type: 'cyl', size: [0.055, 0.065, 0.3], pos: [0, -0.15, 0], color: suit },
    { bone: 'foreArmL', type: 'cyl', size: [0.045, 0.055, 0.27], pos: [0, -0.13, 0], color: suit2 },
    { bone: 'foreArmR', type: 'cyl', size: [0.045, 0.055, 0.27], pos: [0, -0.13, 0], color: suit2 },
    { bone: 'handL', type: 'sphere', size: [0.055, 1, 1], pos: [0, -0.03, 0], color: skin },
    { bone: 'handR', type: 'sphere', size: [0.055, 1, 1], pos: [0, -0.03, 0], color: skin },
    { bone: 'thighL', type: 'cyl', size: [0.075, 0.085, 0.42], pos: [0, -0.21, 0], color: suit },
    { bone: 'thighR', type: 'cyl', size: [0.075, 0.085, 0.42], pos: [0, -0.21, 0], color: suit },
    { bone: 'shinL', type: 'cyl', size: [0.055, 0.07, 0.42], pos: [0, -0.21, 0], color: suit2 },
    { bone: 'shinR', type: 'cyl', size: [0.055, 0.07, 0.42], pos: [0, -0.21, 0], color: suit2 },
    { bone: 'footL', type: 'box', size: [0.11, 0.08, 0.24], pos: [0, -0.02, 0.05], color: trim },
    { bone: 'footR', type: 'box', size: [0.11, 0.08, 0.24], pos: [0, -0.02, 0.05], color: trim },
  ];
}

// armor plate overlays for power suits
function armorParts(gold, dark) {
  return [
    { bone: 'chest', type: 'box', size: [0.46, 0.3, 0.3], pos: [0, 0.12, 0.01], color: gold },
    { bone: 'chest', type: 'box', size: [0.34, 0.12, 0.32], pos: [0, -0.04, 0.01], color: gold },
    { bone: 'hips', type: 'box', size: [0.38, 0.14, 0.26], pos: [0, -0.02, 0], color: gold },
    { bone: 'shoulderL', type: 'box', size: [0.16, 0.12, 0.2], pos: [-0.05, 0.05, 0], color: gold },
    { bone: 'shoulderR', type: 'box', size: [0.16, 0.12, 0.2], pos: [0.05, 0.05, 0], color: gold },
    { bone: 'thighL', type: 'box', size: [0.14, 0.24, 0.16], pos: [0, -0.14, 0.02], color: gold },
    { bone: 'thighR', type: 'box', size: [0.14, 0.24, 0.16], pos: [0, -0.14, 0.02], color: gold },
    { bone: 'shinL', type: 'box', size: [0.11, 0.3, 0.13], pos: [0, -0.24, 0.02], color: gold },
    { bone: 'shinR', type: 'box', size: [0.11, 0.3, 0.13], pos: [0, -0.24, 0.02], color: gold },
    { bone: 'foreArmL', type: 'box', size: [0.1, 0.2, 0.12], pos: [0, -0.13, 0], color: gold },
    { bone: 'foreArmR', type: 'box', size: [0.1, 0.2, 0.12], pos: [0, -0.13, 0], color: gold },
    { bone: 'head', type: 'box', size: [0.3, 0.16, 0.28], pos: [0, 0.2, 0], color: gold },      // helmet crown
    { bone: 'head', type: 'box', size: [0.06, 0.1, 0.2], pos: [0, 0.3, 0], color: dark },       // crest
  ];
}

// — THE CAPTAIN — gold power suit, cyan visor, jetpack, blaster
export function makeCaptain() {
  const gold = 0xd8a72c, dark = 0x1c2244;
  const rig = buildRig({
    scale: 1,
    matOpts: { roughness: 0.3, metalness: 0.75 },
    parts: [
      ...humanoidParts({ suit: dark, suit2: 0x141a36, trim: gold, visor: NEON.cyan, helmet: 0x232a4e, glowChest: NEON.cyan }),
      ...armorParts(gold, dark),
      // jetpack
      { bone: 'chest', type: 'box', size: [0.3, 0.34, 0.14], pos: [0, 0.08, -0.2], color: 0x2a3055 },
      { bone: 'chest', type: 'cyl', size: [0.05, 0.06, 0.18], pos: [-0.09, -0.1, -0.22], color: gold },
      { bone: 'chest', type: 'cyl', size: [0.05, 0.06, 0.18], pos: [0.09, -0.1, -0.22], color: gold },
      { bone: 'chest', type: 'box', size: [0.08, 0.04, 0.04], pos: [-0.09, -0.21, -0.22], color: NEON.cyan, glow: true },
      { bone: 'chest', type: 'box', size: [0.08, 0.04, 0.04], pos: [0.09, -0.21, -0.22], color: NEON.cyan, glow: true },
      // belt light
      { bone: 'hips', type: 'box', size: [0.4, 0.05, 0.05], pos: [0, 0.08, 0.12], color: NEON.amber, glow: true, boost: 1.1 },
    ],
  });
  const blaster = makeBlaster(NEON.cyan);
  blaster.position.set(0, -0.06, 0.04);
  rig.bones.handR.add(blaster);
  rig.blaster = blaster;
  return rig;
}

// — CIVILIAN — hooded scavengers, bright jackets
export function makeCivilian(rnd = Math.random) {
  const jackets = [0xff2fd6, 0x00c8ff, 0xffc400, 0x5dffb2, 0xa74bff, 0xff7a1a];
  const jacket = pick(rnd, jackets);
  const rig = buildRig({
    scale: 0.92 + rnd() * 0.14,
    matOpts: { roughness: 0.7, metalness: 0.1 },
    parts: [
      ...humanoidParts({
        suit: jacket, suit2: 0x232038, trim: 0x33304e,
        visor: rnd() < 0.4 ? pick(rnd, [NEON.cyan, NEON.amber]) : null,
        skin: pick(rnd, [0xd9a066, 0x9c6b44, 0xe8c39e, 0x74513a]),
      }),
      // hood
      { bone: 'head', type: 'sphere', size: [0.19, 1.05, 1], pos: [0, 0.12, -0.04], color: 0x232038 },
    ],
  });
  return rig;
}

// — MERCHANT — aproned, big hat, waves you over
export function makeMerchant(rnd = Math.random) {
  const rig = buildRig({
    scale: 0.98,
    matOpts: { roughness: 0.65, metalness: 0.15 },
    parts: [
      ...humanoidParts({ suit: 0x8a5c2a, suit2: 0x4e3418, trim: 0xffc400, skin: pick(rnd, [0xd9a066, 0x9c6b44]) }),
      { bone: 'chest', type: 'box', size: [0.4, 0.5, 0.06], pos: [0, -0.08, 0.15], color: pick(rnd, [0xff2fd6, 0x00c8ff, 0x5dffb2]) }, // apron
      { bone: 'head', type: 'cyl', size: [0.26, 0.3, 0.06], pos: [0, 0.22, 0], color: 0x4e3418 }, // hat brim
      { bone: 'head', type: 'cyl', size: [0.13, 0.15, 0.14], pos: [0, 0.3, 0], color: 0x4e3418 },
    ],
  });
  return rig;
}

// — TROOPER — Vex's soldiers: gunmetal, red visor, shoots back
export function makeTrooper() {
  const rig = buildRig({
    scale: 1.0,
    matOpts: { roughness: 0.35, metalness: 0.7 },
    parts: [
      ...humanoidParts({ suit: 0x2e3242, suit2: 0x1c2030, trim: 0x454c66, visor: NEON.red, helmet: 0x262b3d, glowChest: NEON.red }),
      { bone: 'head', type: 'box', size: [0.3, 0.14, 0.26], pos: [0, 0.2, 0], color: 0x2e3242 },
      { bone: 'shoulderL', type: 'box', size: [0.18, 0.1, 0.22], pos: [-0.05, 0.06, 0], color: 0x1c2030 },
      { bone: 'shoulderR', type: 'box', size: [0.18, 0.1, 0.22], pos: [0.05, 0.06, 0], color: 0x1c2030 },
    ],
  });
  const blaster = makeBlaster(NEON.red);
  blaster.position.set(0, -0.06, 0.04);
  rig.bones.handR.add(blaster);
  rig.blaster = blaster;
  return rig;
}

// — SERVICE ROBOT — boxy, antenna, amber cyclops eye
export function makeRobot(rnd = Math.random) {
  const body = pick(rnd, [0x4e5a78, 0x5c4e78, 0x4e786a]);
  const rig = buildRig({
    scale: 0.9,
    matOpts: { roughness: 0.3, metalness: 0.85 },
    parts: [
      { bone: 'hips', type: 'box', size: [0.4, 0.28, 0.3], pos: [0, 0.02, 0], color: body },
      { bone: 'chest', type: 'box', size: [0.5, 0.44, 0.36], pos: [0, 0.08, 0], color: body },
      { bone: 'chest', type: 'box', size: [0.2, 0.1, 0.04], pos: [0, 0.06, 0.19], color: NEON.amber, glow: true },
      { bone: 'head', type: 'box', size: [0.3, 0.24, 0.3], pos: [0, 0.08, 0], color: body },
      { bone: 'head', type: 'sphere', size: [0.06, 1, 1], pos: [0, 0.08, 0.16], color: NEON.amber, glow: true, boost: 1.35 },
      { bone: 'head', type: 'cyl', size: [0.015, 0.015, 0.3], pos: [0.08, 0.3, 0], color: 0x222233 },
      { bone: 'head', type: 'sphere', size: [0.03, 1, 1], pos: [0.08, 0.46, 0], color: NEON.red, glow: true },
      { bone: 'upperArmL', type: 'box', size: [0.09, 0.32, 0.09], pos: [0, -0.16, 0], color: 0x333a55 },
      { bone: 'upperArmR', type: 'box', size: [0.09, 0.32, 0.09], pos: [0, -0.16, 0], color: 0x333a55 },
      { bone: 'foreArmL', type: 'box', size: [0.08, 0.28, 0.08], pos: [0, -0.13, 0], color: body },
      { bone: 'foreArmR', type: 'box', size: [0.08, 0.28, 0.08], pos: [0, -0.13, 0], color: body },
      { bone: 'handL', type: 'box', size: [0.09, 0.1, 0.06], pos: [0, -0.04, 0], color: 0x222233 },
      { bone: 'handR', type: 'box', size: [0.09, 0.1, 0.06], pos: [0, -0.04, 0], color: 0x222233 },
      { bone: 'thighL', type: 'box', size: [0.12, 0.4, 0.12], pos: [0, -0.2, 0], color: 0x333a55 },
      { bone: 'thighR', type: 'box', size: [0.12, 0.4, 0.12], pos: [0, -0.2, 0], color: 0x333a55 },
      { bone: 'shinL', type: 'box', size: [0.1, 0.4, 0.1], pos: [0, -0.2, 0], color: body },
      { bone: 'shinR', type: 'box', size: [0.1, 0.4, 0.1], pos: [0, -0.2, 0], color: body },
      { bone: 'footL', type: 'box', size: [0.14, 0.08, 0.26], pos: [0, -0.02, 0.05], color: 0x222233 },
      { bone: 'footR', type: 'box', size: [0.14, 0.08, 0.26], pos: [0, -0.02, 0.05], color: 0x222233 },
    ],
  });
  return rig;
}

// — VULTYR — the flying general: chrome, angular wings, pink sigil
export function makeVultyr() {
  const chrome = 0xb8c0d6, dark = 0x6a7288;
  const wing = (side) => ([
    { bone: side > 0 ? 'wingR' : 'wingL', type: 'box', size: [0.9, 0.05, 0.42], pos: [side * 0.48, 0.1, -0.06], rot: [0, side * -0.25, side * 0.35], color: chrome },
    { bone: side > 0 ? 'wingR' : 'wingL', type: 'box', size: [0.62, 0.04, 0.3], pos: [side * 0.55, -0.16, -0.02], rot: [0, side * -0.4, side * 0.1], color: dark },
    { bone: side > 0 ? 'wingR' : 'wingL', type: 'box', size: [0.4, 0.03, 0.2], pos: [side * 0.5, -0.34, 0.02], rot: [0, side * -0.5, side * -0.12], color: chrome },
  ]);
  const rig = buildRig({
    scale: 1.18,
    useWings: true,
    matOpts: { roughness: 0.2, metalness: 0.95 },
    parts: [
      ...humanoidParts({ suit: chrome, suit2: dark, trim: 0xe6ebf7, visor: NEON.magenta, helmet: chrome }),
      // pink chest sigil
      { bone: 'chest', type: 'box', size: [0.24, 0.2, 0.04], pos: [0, 0.1, 0.15], color: 0x14060f },
      { bone: 'chest', type: 'box', size: [0.14, 0.12, 0.05], pos: [0, 0.1, 0.155], color: NEON.pink, glow: true, boost: 1.3 },
      // crest + jaw
      { bone: 'head', type: 'cone', size: [0.09, 0.34], pos: [0, 0.3, -0.05], rot: [-0.4, 0, 0], color: chrome },
      { bone: 'head', type: 'box', size: [0.2, 0.08, 0.1], pos: [0, -0.02, 0.1], color: dark },
      ...wing(-1), ...wing(1),
      // talon feet
      { bone: 'footL', type: 'cone', size: [0.05, 0.16], pos: [0, -0.04, 0.16], rot: [1.4, 0, 0], color: dark },
      { bone: 'footR', type: 'cone', size: [0.05, 0.16], pos: [0, -0.04, 0.16], rot: [1.4, 0, 0], color: dark },
    ],
  });
  const cannon = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x8a92a8, roughness: 0.25, metalness: 0.9 }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.24;
  cannon.add(barrel);
  const glowTip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON.pink).multiplyScalar(1.3), toneMapped: false }));
  glowTip.position.z = 0.56;
  cannon.add(glowTip);
  cannon.position.set(0, -0.05, 0.05);
  rig.bones.handR.add(cannon);
  rig.blaster = cannon;
  cannon.userData.muzzle = glowTip;
  return rig;
}

// — BRAKKUS — the ground general: massive, jade-gunmetal, arm cannon
export function makeBrakkus() {
  const hull = 0x3a5c50, dark = 0x22362e, glow = NEON.orange;
  const rig = buildRig({
    scale: 1.5,
    matOpts: { roughness: 0.3, metalness: 0.85 },
    parts: [
      { bone: 'hips', type: 'box', size: [0.5, 0.28, 0.34], pos: [0, 0.02, 0], color: dark },
      { bone: 'chest', type: 'box', size: [0.66, 0.46, 0.42], pos: [0, 0.1, 0], color: hull },
      { bone: 'chest', type: 'box', size: [0.2, 0.2, 0.06], pos: [0, 0.1, 0.22], color: glow, glow: true },
      { bone: 'chest', type: 'box', size: [0.7, 0.12, 0.46], pos: [0, 0.34, 0], color: dark },
      { bone: 'head', type: 'box', size: [0.26, 0.22, 0.26], pos: [0, 0.06, 0.02], color: dark },
      { bone: 'head', type: 'box', size: [0.28, 0.06, 0.06], pos: [0, 0.08, 0.14], color: NEON.red, glow: true, boost: 1.3 },
      { bone: 'shoulderL', type: 'box', size: [0.3, 0.24, 0.3], pos: [-0.1, 0.1, 0], color: hull },
      { bone: 'shoulderR', type: 'box', size: [0.3, 0.24, 0.3], pos: [0.1, 0.1, 0], color: hull },
      { bone: 'upperArmL', type: 'box', size: [0.16, 0.34, 0.16], pos: [0, -0.16, 0], color: dark },
      { bone: 'upperArmR', type: 'box', size: [0.16, 0.34, 0.16], pos: [0, -0.16, 0], color: dark },
      { bone: 'foreArmL', type: 'box', size: [0.14, 0.3, 0.14], pos: [0, -0.14, 0], color: hull },
      // right forearm IS the cannon
      { bone: 'foreArmR', type: 'cyl', size: [0.1, 0.13, 0.36], pos: [0, -0.16, 0], color: 0x2a2f3a },
      { bone: 'foreArmR', type: 'cyl', size: [0.06, 0.06, 0.1], pos: [0, -0.34, 0], color: glow, glow: true, boost: 1.3 },
      { bone: 'handL', type: 'box', size: [0.14, 0.14, 0.1], pos: [0, -0.05, 0], color: dark },
      { bone: 'thighL', type: 'box', size: [0.2, 0.42, 0.2], pos: [0, -0.2, 0], color: hull },
      { bone: 'thighR', type: 'box', size: [0.2, 0.42, 0.2], pos: [0, -0.2, 0], color: hull },
      { bone: 'shinL', type: 'box', size: [0.17, 0.42, 0.18], pos: [0, -0.2, 0], color: dark },
      { bone: 'shinR', type: 'box', size: [0.17, 0.42, 0.18], pos: [0, -0.2, 0], color: dark },
      { bone: 'footL', type: 'box', size: [0.22, 0.12, 0.34], pos: [0, -0.03, 0.06], color: hull },
      { bone: 'footR', type: 'box', size: [0.22, 0.12, 0.34], pos: [0, -0.03, 0.06], color: hull },
    ],
  });
  return rig;
}

// — OVERLORD VEX — half-machine tyrant, red eye, dark cape
export function makeVex() {
  const armor = 0x16141f, chrome = 0x9aa2b8, capeC = 0x571626;
  const rig = buildRig({
    scale: 1.22,
    useCape: true,
    matOpts: { roughness: 0.25, metalness: 0.8 },
    parts: [
      ...humanoidParts({ suit: armor, suit2: 0x0e0c16, trim: chrome, skin: 0xc79b7a }),
      // half-chrome skull + red machine eye
      { bone: 'head', type: 'sphere', size: [0.16, 1.08, 1], pos: [0.05, 0.1, 0], color: chrome },
      { bone: 'head', type: 'sphere', size: [0.045, 1, 1], pos: [0.07, 0.12, 0.13], color: NEON.red, glow: true, boost: 1.35 },
      // chest machinery
      { bone: 'chest', type: 'box', size: [0.3, 0.26, 0.06], pos: [0, 0.08, 0.14], color: 0x2a2436 },
      { bone: 'chest', type: 'box', size: [0.08, 0.06, 0.05], pos: [-0.07, 0.14, 0.17], color: NEON.red, glow: true },
      { bone: 'chest', type: 'box', size: [0.08, 0.06, 0.05], pos: [0.07, 0.02, 0.17], color: NEON.blue, glow: true },
      // mechanical left arm — exposed chrome
      { bone: 'upperArmL', type: 'cyl', size: [0.07, 0.08, 0.32], pos: [0, -0.15, 0], color: chrome },
      { bone: 'foreArmL', type: 'cyl', size: [0.06, 0.07, 0.28], pos: [0, -0.13, 0], color: chrome },
      // high collar + pauldrons
      { bone: 'chest', type: 'box', size: [0.5, 0.14, 0.3], pos: [0, 0.26, -0.02], color: armor },
      { bone: 'shoulderL', type: 'box', size: [0.2, 0.16, 0.24], pos: [-0.06, 0.08, 0], color: chrome },
      { bone: 'shoulderR', type: 'box', size: [0.2, 0.16, 0.24], pos: [0.06, 0.08, 0], color: armor },
      // cape — three swinging panels
      { bone: 'capeA', type: 'box', size: [0.52, 0.55, 0.03], pos: [0, -0.24, 0], color: capeC },
      { bone: 'capeB', type: 'box', size: [0.56, 0.55, 0.03], pos: [0, -0.24, 0], color: capeC },
      { bone: 'capeC', type: 'box', size: [0.6, 0.5, 0.03], pos: [0, -0.2, 0], color: 0x3d0f1c },
    ],
  });
  return rig;
}
