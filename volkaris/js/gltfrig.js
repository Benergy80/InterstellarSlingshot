// ════════════════════════════════════════════════════════════════
// VOLKARIS — GLTF character rigs (KayKit Adventurers, CC0)
//
// Natural human motion, Messenger-grade: professionally keyframed
// clips (75 per character — walk/run/strafe/jumps/dodges/deaths/
// ranged combat) driven by THREE.AnimationMixer, wrapped in the
// SAME API as our procedural rigs so the player controller and the
// NPC AI don't know the difference:
//   { group, bones, play(name,{fade,timeScale,restart}), current(),
//     setAim(pitch, w), kickRecoil(), update(dt), blaster }
//
// Character GLBs: assets/*.glb, mirrored from
// github.com/KayKit-Game-Assets (Kay Lousberg, CC0 — thanks Kay!).
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { NEON } from './config.js';
import { makeBlaster } from './rig.js';

// our clip vocabulary → KayKit clip names (+ per-clip options)
const CLIP_MAP = {
  idle: { name: 'Idle' },
  walk: { name: 'Walking_A' },
  run: { name: 'Running_A' },
  sprint: { name: 'Running_B', timeScale: 1.15 },
  jump: { name: 'Jump_Start', once: true, next: 'Jump_Idle' },
  fall: { name: 'Jump_Idle' },
  land: { name: 'Jump_Land', once: true, next: 'idle' },
  tuck: { name: 'Dodge_Forward', once: true },
  wallrunL: { name: 'Running_A', timeScale: 1.1 },
  wallrunR: { name: 'Running_A', timeScale: 1.1 },
  hover: { name: 'Jump_Idle' },
  die: { name: 'Death_A', once: true, clamp: true },
  sit: { name: 'Sit_Chair_Idle' },
  wave: { name: 'Cheer', timeScale: 0.8 },
  lean: { name: 'Idle', timeScale: 0.6 },
  stomp: { name: 'Walking_C', timeScale: 0.62 },
  fly: { name: 'Jump_Idle' },
  throne: { name: 'Sit_Chair_StandUp', once: true, next: 'idle' },
  shoot: { name: '1H_Ranged_Shooting' },
  aimidle: { name: '1H_Ranged_Aiming' },
  strafeL: { name: 'Running_Strafe_Left' },
  strafeR: { name: 'Running_Strafe_Right' },
  runback: { name: 'Walking_Backwards', timeScale: 1.25 },
  punchL: { name: 'Unarmed_Melee_Attack_Punch_A', once: true },
  punchR: { name: 'Unarmed_Melee_Attack_Punch_B', once: true },
  kickL: { name: 'Unarmed_Melee_Attack_Kick', once: true },
  kickR: { name: 'Unarmed_Melee_Attack_Kick', once: true },
  hit: { name: 'Hit_A', once: true },
};

// Quaternius Astronaut (CC0) clip vocabulary — includes Run_Shoot
// (blaster fire at a dead sprint) and a real combat Roll
export const ASTRO_MAP = {
  idle: { name: 'Idle_Gun' },
  walk: { name: 'Walk' },
  run: { name: 'Run' },
  sprint: { name: 'Run', timeScale: 1.3 },
  jump: { name: 'Run', timeScale: 0.55 },
  fall: { name: 'Idle_Gun_Pointing' },
  tuck: { name: 'Roll', once: true },
  wallrunL: { name: 'Run_Left', timeScale: 1.1 },
  wallrunR: { name: 'Run_Right', timeScale: 1.1 },
  hover: { name: 'Idle_Gun_Pointing' },
  die: { name: 'Death', once: true, clamp: true },
  sit: { name: 'Idle_Neutral' },
  wave: { name: 'Wave' },
  lean: { name: 'Idle_Neutral', timeScale: 0.6 },
  stomp: { name: 'Walk', timeScale: 0.6 },
  fly: { name: 'Idle_Gun_Pointing' },
  throne: { name: 'Interact', once: true, next: 'idle' },
  shoot: { name: 'Idle_Gun_Shoot' },
  runshoot: { name: 'Run_Shoot' },
  aimidle: { name: 'Idle_Gun_Pointing' },
  strafeL: { name: 'Run_Left' },
  strafeR: { name: 'Run_Right' },
  strafeFL: { name: 'Run_Left' },
  strafeFR: { name: 'Run_Right' },
  runback: { name: 'Run_Back' },
  backL: { name: 'Run_Back' },
  backR: { name: 'Run_Back' },
  punchL: { name: 'Punch_Left', once: true },
  punchR: { name: 'Punch_Right', once: true },
  kickL: { name: 'Kick_Left', once: true },
  kickR: { name: 'Kick_Right', once: true },
  hit: { name: 'HitRecieve', once: true },
};

// Meshy AI "Silver Sentinel" (Ben's custom character) clip vocabulary —
// it even ships a dedicated diagonal_wall_run and Run_and_Shoot
export const SENTINEL_MAP = {
  idle: { name: 'Walking', timeScale: 0.16 },
  walk: { name: 'Walking' },
  run: { name: 'Running' },
  sprint: { name: 'RunFast' },
  jump: { name: 'Regular_Jump', once: true, next: 'fall' },
  fall: { name: 'Regular_Jump', timeScale: 0.12 },
  tuck: { name: 'Run_Jump_and_Roll', once: true, timeScale: 4.2 },
  wallrunL: { name: 'diagonal_wall_run', timeScale: 1.15 },
  wallrunR: { name: 'diagonal_wall_run', timeScale: 1.15 },
  hover: { name: 'Regular_Jump', timeScale: 0.1 },
  die: { name: 'Ground_Flip_and_Sweep_Up', once: true, clamp: true, timeScale: 1.6 },
  sit: { name: 'Walking', timeScale: 0.1 },
  wave: { name: 'Agree_Gesture', timeScale: 1.6 },
  lean: { name: 'Walking', timeScale: 0.1 },
  stomp: { name: 'Walking', timeScale: 0.6 },
  fly: { name: 'Regular_Jump', timeScale: 0.1 },
  throne: { name: 'Ground_Flip_and_Sweep_Up', once: true, next: 'idle' },
  shoot: { name: 'Run_and_Shoot', timeScale: 0.8 },
  runshoot: { name: 'Run_and_Shoot' },
  aimidle: { name: 'Gun_Hold_Left_Turn', timeScale: 0.4 },
  strafeL: { name: 'diagonal_wall_run' },
  strafeR: { name: 'diagonal_wall_run' },
  runback: { name: 'Walking' },
  punchL: { name: 'Ground_Flip_and_Sweep_Up', once: true, timeScale: 2.2 },
  punchR: { name: 'Ground_Flip_and_Sweep_Up', once: true, timeScale: 2.2 },
  kickL: { name: 'Ground_Flip_and_Sweep_Up', once: true, timeScale: 1.8 },
  kickR: { name: 'Ground_Flip_and_Sweep_Up', once: true, timeScale: 1.8 },
  hit: { name: 'Walking', once: true, timeScale: 3 },
};

// Meshy AI "Captain 2" (Ben's hero model) — one GLB per animation, all
// sharing the rig; clips are renamed after their source file at load.
export const CAPTAIN2_MAP = {
  idle: { name: 'Walking', timeScale: 0.055 },   // near-still — breathing sway, not a treadmill
  walk: { name: 'Walking' },
  run: { name: 'Running' },
  sprint: { name: 'Running', timeScale: 1.25 },
  jump: { name: 'Run_and_Jump', once: true, timeScale: 1.15, next: 'fall' },   // chain: no T-pose gap
  fall: { name: 'Run_and_Jump', timeScale: 0.07 },
  tuck: { name: 'Run_Jump_and_Roll', once: true, timeScale: 1.5 },
  wallrunL: { name: 'diagonal_wall_run', timeScale: 1.1 },
  wallrunR: { name: 'diagonal_wall_run', timeScale: 1.1 },
  hover: { name: 'Run_and_Jump', timeScale: 0.1 },
  die: { name: 'slide_light', once: true, clamp: true },
  sit: { name: 'Walking', timeScale: 0.05 },
  wave: { name: 'Walking', timeScale: 0.5 },
  lean: { name: 'Walking', timeScale: 0.05 },
  stomp: { name: 'Walking', timeScale: 0.6 },
  fly: { name: 'Run_and_Jump', timeScale: 0.1 },
  throne: { name: 'Walking', once: true, next: 'idle' },
  shoot: { name: 'Walk_Forward_While_Shooting', timeScale: 0.6 },
  runshoot: { name: 'Run_and_Shoot' },
  backshoot: { name: 'Walk_Backward_While_Shooting' },   // firing while backpedaling
  aimidle: { name: 'Walk_Forward_While_Shooting', timeScale: 0.4 },
  // strafe/diagonal clips looked wrong in play (Ben) — standard
  // walk/run reads better for A/D and W+A/W+D
  strafeL: { name: 'Walking' },
  strafeR: { name: 'Walking' },
  strafeFL: { name: 'Running' },                  // W+A diagonal
  strafeFR: { name: 'Running' },                  // W+D diagonal
  backL: { name: 'BackLeft_run' },                // S+A diagonal retreat
  backR: { name: 'BackRight_Run' },               // S+D diagonal retreat
  runback: { name: 'BackRight_Run' },
  turnL: { name: 'Run_Turn_Left', timeScale: 0.65 },     // pivot in place
  turnR: { name: 'Run_Turn_Right', timeScale: 0.65 },
  punchL: { name: 'Punch_Combo', once: true, timeScale: 1.3 },
  punchR: { name: 'Punch_Combo_1', once: true, timeScale: 1.3 },
  kickL: { name: 'Roundhouse_Kick', once: true, timeScale: 1.15 },
  kickR: { name: 'Roundhouse_Kick', once: true, timeScale: 1.15 },
  hit: { name: 'Roll_Dodge_1', once: true, timeScale: 1.8 },
};

// NEW self-contained "Silver Sentinel" (Ben's SilverSentinel.glb) — one GLB
// with mesh, skeleton, textures + 15 named clips baked in:
//   idle, walk, run, strafe_left, strafe_right, jump, double_jump, fall,
//   land, roll, slide, wall_run, crouch_idle, crouch_walk, fire
export const SILVER_MAP = {
  idle: { name: 'idle' },
  walk: { name: 'walk' },
  run: { name: 'run' },
  sprint: { name: 'run', timeScale: 1.25 },        // no dedicated sprint clip
  jump: { name: 'jump', once: true, next: 'fall' },
  airjump: { name: 'double_jump', once: true, next: 'fall' },
  fall: { name: 'fall' },
  land: { name: 'land', once: true, next: 'idle' },
  tuck: { name: 'roll', once: true },              // combat roll / air flip
  wallrunL: { name: 'wall_run' },
  wallrunR: { name: 'wall_run' },
  hover: { name: 'fall', timeScale: 0.3 },         // jetpack hover → held fall pose
  die: { name: 'fall', once: true, clamp: true },  // no death clip
  sit: { name: 'crouch_idle' },
  wave: { name: 'idle', timeScale: 0.8 },
  lean: { name: 'crouch_idle' },
  stomp: { name: 'walk', timeScale: 0.6 },
  fly: { name: 'fall', timeScale: 0.2 },
  throne: { name: 'crouch_idle', once: true, next: 'idle' },
  shoot: { name: 'fire' },
  runshoot: { name: 'fire' },
  aimidle: { name: 'fire', timeScale: 0.3 },
  strafeL: { name: 'strafe_left' },
  strafeR: { name: 'strafe_right' },
  strafeFL: { name: 'strafe_left' },
  strafeFR: { name: 'strafe_right' },
  runback: { name: 'walk' },
  backL: { name: 'strafe_left' },
  backR: { name: 'strafe_right' },
  punchL: { name: 'fire', once: true },            // no melee clip → fire jab
  punchR: { name: 'fire', once: true },
  kickL: { name: 'slide', once: true },
  kickR: { name: 'slide', once: true },
  hit: { name: 'land', once: true, timeScale: 1.5 },
  crouch: { name: 'crouch_idle' },
  crouchwalk: { name: 'crouch_walk' },
};

export function makeGLTFRig(gltf, { tint = null, tints = null, scale = 0.75, blasterHex = NEON.cyan, withBlaster = false, clipMap = CLIP_MAP, faceFlip = false, extraAnims = null } = {}) {
  const root = skeletonClone(gltf.scene);
  const group = new THREE.Group();
  group.add(root);
  root.scale.setScalar(scale);
  if (faceFlip) root.rotation.y = Math.PI;   // for rigs authored facing -Z (Quaternius Astronaut faces +Z — no flip)

  // clone + tint materials (KayKit uses one gradient atlas)
  root.traverse(o => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
      if (o.material) {
        o.material = o.material.clone();
        const byName = tints && tints[o.material.name];
        if (byName) {
          if (byName.color !== undefined) o.material.color = new THREE.Color(byName.color);
          if (byName.emissive !== undefined && o.material.emissive) {
            o.material.emissive = new THREE.Color(byName.emissive);
            o.material.emissiveIntensity = byName.emissiveIntensity ?? 1;
          }
          o.material.metalness = byName.metalness ?? 0.35;
          o.material.roughness = byName.roughness ?? 0.5;
        } else {
          if (tint) o.material.color = new THREE.Color(tint);
          o.material.roughness = 0.6;
          o.material.metalness = 0.25;
          // Meshy exports often bake hot emissives — calm them or the
          // whole character blooms into a white silhouette
          if (o.material.emissive && (o.material.emissiveMap || o.material.emissive.getHex() !== 0)) {
            o.material.emissiveIntensity = Math.min(o.material.emissiveIntensity ?? 1, 0.22);
          }
        }
      }
    }
  });

  // bone lookup (KayKit names: hips, spine, head, handr, handslotr…)
  const boneByName = {};
  root.traverse(o => { if (o.isBone) boneByName[o.name.toLowerCase()] = o; });
  const bones = {
    hips: boneByName.hips,
    chest: boneByName.chest ?? boneByName.spine ?? boneByName.torso ?? boneByName.hips,
    head: boneByName.head,
    handR: boneByName.handslotr ?? boneByName.wristr ?? boneByName.handr ?? boneByName.righthand,
    handL: boneByName.handslotl ?? boneByName.wristl ?? boneByName.handl ?? boneByName.lefthand,
  };

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  // base clips + any shared animation-library GLBs (KayKit Character
  // Animations Rig_Medium files share the Adventurers' deform skeleton,
  // so their clips bind to this rig directly)
  const allClips = [...gltf.animations];
  if (extraAnims) for (const g of extraAnims) if (g?.animations) allClips.push(...g.animations);
  for (const clip of allClips) {
    const key = clip.name.includes('|') ? clip.name.split('|').pop() : clip.name;
    if (!actions[key]) actions[key] = mixer.clipAction(clip);
  }

  let currentKey = 'idle';
  let currentAction = null;
  let queuedNext = null;
  const state = { aimW: 0, aimPitch: 0, recoil: 0 };

  function playRaw(kayName, { fade = 0.18, timeScale = 1, once = false, clamp = false, restart = false } = {}) {
    const next = actions[kayName];
    if (!next) return;
    if (currentAction === next && !restart) { next.timeScale = timeScale; return; }
    next.reset();
    next.timeScale = timeScale;
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = clamp;
    next.enabled = true;
    if (currentAction) {
      next.crossFadeFrom(currentAction, fade, false);
    }
    next.play();
    currentAction = next;
  }

  function play(name, { fade = 0.18, timeScale, restart = false } = {}) {
    // shooting overlay: swap locomotion for the armed variants
    if (state.aimW > 0.5) {
      if (name === 'idle' || name === 'walk') name = 'shoot';
      else if ((name === 'run' || name === 'sprint') && clipMap.runshoot) name = 'runshoot';
      else if ((name === 'runback' || name === 'backL' || name === 'backR') && clipMap.backshoot) name = 'backshoot';
    }
    const def = clipMap[name];
    if (!def) return;
    if (currentKey === name && !restart && !def.once) {
      // same clip, new rate — foot-speed matching updates every frame
      if (timeScale !== undefined && currentAction) currentAction.timeScale = timeScale;
      return;
    }
    currentKey = name;
    queuedNext = def.next ?? null;
    playRaw(def.name, {
      fade,
      timeScale: timeScale ?? def.timeScale ?? 1,
      once: !!def.once,
      clamp: !!def.clamp,
      restart,
    });
  }

  mixer.addEventListener('finished', () => {
    if (queuedNext) {
      const n = queuedNext;
      queuedNext = null;
      play(n, { fade: 0.12 });
    }
  });

  // optional sidearm. NOT parented to the hand bone: armatures bake odd
  // unit scales AND animation clips can carry bone-scale tracks, which
  // turn a parented prop into a glowing surfboard. Instead the gun is a
  // sibling of the rig that COPIES the hand's world position/rotation
  // every frame at a locked scale of 1.
  let blaster = null;
  let blasterScale = 1;   // Brakkus carries an ARM CANNON, not a pistol
  const _bm = new THREE.Matrix4(), _bp = new THREE.Vector3(), _bq = new THREE.Quaternion(), _bs = new THREE.Vector3();
  const gunRot = new THREE.Quaternion();
  if (withBlaster && bones.handR) {
    blaster = makeBlaster(blasterHex);
    group.add(blaster);
  }
  function syncBlaster() {
    if (!blaster) return;
    bones.handR.updateWorldMatrix(true, false);
    _bm.copy(group.matrixWorld).invert().multiply(bones.handR.matrixWorld);
    _bm.decompose(_bp, _bq, _bs);
    blaster.position.copy(_bp);
    blaster.quaternion.copy(_bq).multiply(gunRot);
    blaster.scale.setScalar(blasterScale);
  }

  return {
    group, bones, blaster, isGLTF: true,
    play,
    current() { return currentKey; },
    setAim(pitch, w) {
      const was = state.aimW;
      state.aimW = w;
      state.aimPitch = pitch;
      // entering/leaving aim while idling re-picks the clip
      if ((w > 0.5) !== (was > 0.5) && (currentKey === 'idle' || currentKey === 'walk' || currentKey === 'shoot')) {
        play(w > 0.5 ? 'shoot' : 'idle', { fade: 0.14, restart: true });
      }
    },
    kickRecoil() { state.recoil = 1; },
    setGunRot(x, y, z) { gunRot.setFromEuler(new THREE.Euler(x, y, z)); },
    setBlasterScale(s) { blasterScale = s; },
    update(dt) {
      mixer.update(dt);
      // aim overlay FIRST (the gun must sync to the post-lean pose)
      if (state.aimW > 0.01 && bones.chest) {
        const lean = state.aimPitch * 0.5 * state.aimW;
        bones.chest.rotation.x += -lean;
        if (bones.head) bones.head.rotation.x += -state.aimPitch * 0.3 * state.aimW;
      }
      syncBlaster();
      state.recoil = Math.max(0, state.recoil - dt * 6);
    },
    state,
  };
}
