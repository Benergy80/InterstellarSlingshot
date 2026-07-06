// ════════════════════════════════════════════════════════════════
// VOLKARIS // ESCAPE VELOCITY — boot + main loop
// A planetside special level for INTERSTELLAR SLINGSHOT.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { C } from './config.js';
import { buildPlanet } from './planet.js';
import { buildDetails } from './details.js';
import { buildSky } from './sky.js';
import { createFX } from './fx.js';
import { buildTransit } from './transit.js';
import { buildNPCs } from './npcs.js';
import { createPlayer } from './player.js';
import { createDemo } from './demo.js';
import { createHUD } from './hud.js';
import { createAudio } from './audio.js';

const VK_BUILD = 'VOLKARIS build 2026-07-06l · station lift delivers rider onto platform (no fall-back)';
console.log('%c' + VK_BUILD, 'color:#ff2fd6;font-weight:bold;font-size:14px');

// ── renderer ──
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
let pixelRatio = Math.min(devicePixelRatio, C.QUALITY.maxPixelRatio);
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0618);
// metal suits need something to reflect — cheap studio env for Standard mats
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();
}

const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.1, C.CAM_FAR);
camera.position.set(0, C.R + 6, 12);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  C.BLOOM.strength, C.BLOOM.radius, C.BLOOM.threshold
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ── boot ──
const hud = createHUD();
const audio = createAudio();
let planet, sky, fx, npcs, player, transit, details, demo;

// Meshy Captain 2 — one GLB per animation. Each file's clips are renamed
// after the file (Meshy per-animation exports reuse one generic clip name,
// which would collide in the mixer's action table).
const CAPTAIN2_ANIMS = [
  'Running', 'Walking', 'Run_and_Jump', 'Run_and_Shoot', 'Run_Jump_and_Roll',
  'diagonal_wall_run', 'Roll_Dodge_1', 'Roundhouse_Kick', 'Punch_Combo', 'Punch_Combo_1',
  'slide_light', 'Walk_Forward_While_Shooting', 'Walk_Backward_While_Shooting',
  'Walk_Left_with_Gun', 'ForwardRight_Run_Fight', 'ForwardLeft_Run_Fight',
  'BackLeft_run', 'BackRight_Run', 'Run_Turn_Left', 'Run_Turn_Right',
];

async function loadModels() {
  const loader = new GLTFLoader();
  const out = { kay: {}, captain2: null };
  const shipJobs = ['Player', 'Freighter'].map(n => new Promise((res) => {
    loader.load(`../models/${n}.glb`, (g) => { out[n] = g.scene; res(); }, undefined, () => res());
  }));
  // KayKit Adventurers (CC0) — pro rigs + 75 animation clips each
  const kayJobs = ['Sentinel', 'Astronaut', 'Rogue_Hooded', 'Rogue', 'Mage', 'Barbarian'].map(n => new Promise((res) => {
    loader.load(`assets/${n}.glb`, (g) => { out.kay[n] = g; res(); }, undefined, () => res());
  }));
  // Captain 2 (optional — falls back to the Astronaut when absent)
  const cap = { base: null, anims: [] };
  const capJobs = CAPTAIN2_ANIMS.map((n, i) => new Promise((res) => {
    loader.load(`assets/captain2/${n}.glb`, (g) => {
      for (const c of g.animations) c.name = n;   // filename IS the clip name
      if (i === 0) cap.base = g;
      else cap.anims.push(g);
      res();
    }, undefined, () => res());
  }));
  await Promise.race([
    Promise.all([...shipJobs, ...kayJobs, ...capJobs]),
    new Promise(res => setTimeout(res, 15000)),
  ]);
  if (cap.base) out.captain2 = cap;
  return out;
}
const frame = () => new Promise(r => requestAnimationFrame(r));

async function boot() {
  hud.setProgress(0.1, 'REQUESTING SHIP TELEMETRY');
  try { await document.fonts.ready; } catch { /* ok */ }
  const models = await loadModels();

  hud.setProgress(0.3, 'TERRAFORMING VOLKARIS');
  await frame();
  planet = buildPlanet(scene, models);

  hud.setProgress(0.5, 'LIGHTING THE STREETS');
  await frame();
  details = buildDetails(scene, planet, audio, hud);
  if (details.colliders) planet.addColliders(details.colliders);   // street props are SOLID

  hud.setProgress(0.55, 'IGNITING THE SUN');
  await frame();
  sky = buildSky(scene, renderer);

  hud.setProgress(0.7, 'CHARGING BLASTERS');
  await frame();
  fx = createFX(scene, camera, planet, audio, models);

  hud.setProgress(0.78, 'SPINNING UP THE ORBITAL LOOP');
  await frame();
  transit = buildTransit(scene, planet, audio);
  hud.bindTransit(transit);   // feed the monorail map

  hud.setProgress(0.85, 'WAKING THE LOCALS');
  await frame();
  npcs = buildNPCs(scene, planet, fx, audio, hud, models);

  player = createPlayer({ scene, camera, planet, hud, audio, fx, transit, models });
  player.bindTargets(npcs);
  fx.bindCombat(npcs, player);
  demo = createDemo({ player, planet, transit, npcs, fx, hud, camera });

  hud.setProgress(0.95, 'DROP POD AWAY');
  await frame();

  hud.ready(() => {
    audio.resume();
    player.start();
    // ?demo=1 boots straight into the demo pilot (playtest harness)
    if (new URLSearchParams(location.search).get('demo')) setTimeout(() => demo.start(), 800);
  });

  window.VK = { planet, sky, fx, npcs, player, transit, details, demo, scene, camera, renderer, bloom };
}

// ── main loop ──
const clock = new THREE.Clock();
let elapsed = 0;
let fpsEMA = 60, qualityCooldown = 0;

function animate() {
  requestAnimationFrame(animate);
  const rawDt = clock.getDelta();
  const dt = Math.min(0.05, rawDt);
  fpsEMA += (1 / Math.max(rawDt, 1e-4) - fpsEMA) * 0.04;

  if (planet && player && !player.state.paused) {
    if (player.state.started) elapsed += dt;   // dawn holds until you deploy
    planet.uTime.value = elapsed;
    planet.update(dt, elapsed);
    if (player.state.started) demo.update(dt, elapsed, fpsEMA);   // pilot steers before physics
    // move the trains/lift discs BEFORE the player reads them — a
    // one-frame car/player desync was the source of the ride jitter
    transit.update(dt, elapsed, player.state.pos);
    planet.carryRiders(player.state, dt);   // elevators lift whoever stands on them
    transit.carryRiders(player.state, dt);  // station lifts carry riders up to the deck
    const dayF = sky.update(elapsed, player.state.pos, bloom, planet.group.children[1]?.material);
    player.suitLamp.intensity = 0.15 + sky.night * 1.2;
    player.update(dt, elapsed);             // ride/camera read the fresh car positions
    npcs.update(dt, elapsed, player);
    // dynamic car collision — players + NPCs BUMP the moving cars instead of
    // clipping through them (cars aren't in the static BVH). Skipped while
    // riding/boarding so the monorail hand-off isn't disturbed.
    if (transit.pushOutOfCars && !(player.state.mode === 'ride' || player.state.boarding)) {
      transit.pushOutOfCars(player.state.pos, C.PLAYER.radius);
      for (const n of npcs.list) {
        if (n.state !== 'dead' && n.pos && transit.pushOutOfCars(n.pos, n.radius || 0.7)) n.rig.group.position.copy(n.pos);
      }
    }
    fx.update(dt, elapsed);
    details.update(dt, elapsed, player.state.pos, camera);
    // lightning kicks the bloom for a beat (sky.update rewrites the base each frame)
    if (details.flash.value > 0.02) bloom.strength += details.flash.value * 1.6;
    // storm fronts THICKEN the atmosphere — the NEON CITY-style haze
    // responds to weather (sky.update only retints fog.color; we ease the
    // density up during rain for a moody, deeper aerial perspective)
    if (scene.fog) {
      const fogTarget = details.raining() ? 0.019 : C.FOG_DENSITY;
      scene.fog.density += (fogTarget - scene.fog.density) * (1 - Math.pow(0.2, dt));
    }
    if (player.state.started) {
      hud.update(player, planet, dayF, elapsed);
      let prompt = null;
      if (!player.state.boarding) {
        if (player.state.mode === 'ride') prompt = transit.dwelling() ? 'PRESS E — DISEMBARK' : null;
        else if (player.state.mode === 'pilot') prompt = 'PRESS E — LAND / PARK';
        else if (fx.canBoard(player.state.pos)) prompt = 'PRESS E — BOARD YOUR SHIP';
        else if (transit.vehicleNear(player.state.pos)) prompt = 'PRESS E — TAKE THE VEHICLE';
        else if (transit.boardableStation(player.state.pos)) prompt = 'PRESS E — BOARD THE LOOP';
      }
      hud.setPrompt(prompt);
    }
  }

  // adaptive pixel ratio
  qualityCooldown -= dt;
  if (qualityCooldown <= 0 && elapsed > 6) {
    if (fpsEMA < 40 && pixelRatio > 1.0) {
      pixelRatio = Math.max(1.0, pixelRatio - 0.25);
      renderer.setPixelRatio(pixelRatio);
      composer.setSize(innerWidth, innerHeight);
      qualityCooldown = 3;
    } else if (fpsEMA > 57 && pixelRatio < Math.min(devicePixelRatio, C.QUALITY.maxPixelRatio)) {
      pixelRatio = Math.min(Math.min(devicePixelRatio, C.QUALITY.maxPixelRatio), pixelRatio + 0.25);
      renderer.setPixelRatio(pixelRatio);
      composer.setSize(innerWidth, innerHeight);
      qualityCooldown = 6;
    }
  }

  if (planet) composer.render();
}

boot().then(() => animate()).catch(err => {
  console.error('VOLKARIS boot failure:', err);
  const s = document.getElementById('launch-status');
  if (s) { s.textContent = `BOOT FAULT — ${err.message}`; s.style.color = '#ff3355'; }
});
