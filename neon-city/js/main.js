// ════════════════════════════════════════════════════════════════
// NEON CITY // NC-2287 — a special surface level for
// INTERSTELLAR SLINGSHOT (github.com/Benergy80/InterstellarSlingshot)
//
// Boot, renderer + ACES tone mapping, UnrealBloom composer,
// model preload (the game's GLB ships, with procedural fallback),
// main loop with adaptive quality.
// ════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { C } from './config.js';
import { buildWorld } from './world.js';
import { buildInteriors } from './interiors.js';
import { buildLandmarks } from './landmarks.js';
import { buildTraffic } from './traffic.js';
import { createPlayer } from './player.js';
import { createFX } from './fx.js';
import { createHUD } from './hud.js';
import { createAudio } from './audio.js';

// ── build stamp (so we can confirm which code is actually loaded) ──
const NC_BUILD = 'NC-2287 build 2026-06-13l · wilderness mountains + river with bridges';
console.log('%c' + NC_BUILD, 'color:#00f0ff;font-weight:bold;font-size:14px');

// ── renderer ──
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
let pixelRatio = Math.min(devicePixelRatio, C.QUALITY.maxPixelRatio);
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.FOG_COLOR);
scene.fog = new THREE.FogExp2(C.FOG_COLOR, C.FOG_DENSITY);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, C.CAM_FAR);
camera.position.set(6, 1.85, 42);

// ── composer: Render → UnrealBloom → Output (must be last) ──
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
let world, traffic, player, fx;
let paused = false;

function onPauseToggle() {
  paused = !paused;
  player.setPaused(paused);
  hud.showPause(paused);
  audio.sfx('ui');
}

async function loadModels() {
  const loader = new GLTFLoader();
  const names = ['Shuttle', 'Passenger', 'Passenger2', 'Rescue', 'Freighter', 'Tanker', 'UFO'];
  const out = {};
  const jobs = names.map(n =>
    new Promise((res) => {
      loader.load(
        `../models/${n}.glb`,
        (g) => { out[n] = g.scene; res(); },
        undefined,
        () => res()   // missing model → procedural fallback
      );
    })
  );
  await Promise.race([
    Promise.all(jobs),
    new Promise(res => setTimeout(res, 7000)),
  ]);
  return out;
}

async function boot() {
  hud.setProgress(0.08, 'CALIBRATING TONE MAPPING');
  try { await document.fonts.ready; } catch { /* canvas text falls back */ }
  try { await document.fonts.load('700 52px Orbitron'); } catch { /* ok */ }

  hud.setProgress(0.2, 'RAISING THE CITY GRID');
  await frame();
  world = buildWorld(scene, renderer);

  hud.setProgress(0.45, 'REQUESTING SHIPS FROM ORBIT');
  const models = await loadModels();

  hud.setProgress(0.5, 'FILLING LAKE MISHIGAMI');
  await frame();
  buildLandmarks(scene, world);

  hud.setProgress(0.55, 'FURNISHING THE INTERIORS');
  await frame();
  buildInteriors(scene, world);

  hud.setProgress(0.62, 'SPINNING UP TRAFFIC & RAIL');
  await frame();
  traffic = buildTraffic(scene, world, models);
  world._stations = [];
  const seen = new Set();
  for (const tr of traffic.trains) for (const st of tr.stations) {
    if (!seen.has(st.name)) { seen.add(st.name); world._stations.push(st); }
  }
  hud.initMap(world);

  // ramps, elevators and platforms now exist — clear any lamp poles the road
  // grid stamped into their doorways / footpaths so the player can get on them
  world.clearFurnitureUnderWalkables();

  hud.setProgress(0.78, 'CHARGING WEAPONS & WEATHER');
  await frame();
  fx = createFX(scene, camera, world, audio);
  fx._traffic = traffic;

  player = createPlayer({ camera, scene, world, traffic, fx, hud, audio, onPauseToggle });
  fx._player = player;
  fx._hud = hud;

  hud.setProgress(0.92, 'FINAL APPROACH');
  await frame();

  hud.ready(
    () => { audio.resume(); player.start(false); },
    () => { audio.resume(); player.start(true); },
  );

  // dev/debug handle (also handy for the mothergame's console-driven tinkering)
  window.NC = { player, world, traffic, fx, scene, camera, renderer, bloom };

  // initial nav target → the Spire deck (also seeds the marker UI)
  player.state.targetIdx = world.pois.findIndex(p => p.name.includes('SPIRE'));
  if (player.state.targetIdx < 0) player.state.targetIdx = 0;
  hud.setTarget(world.pois[player.state.targetIdx]);
  hud.setWeather(true);
}
const frame = () => new Promise(r => requestAnimationFrame(r));

// ── main loop ──
const clock = new THREE.Clock();
let elapsed = 0;
let fpsEMA = 60, fpsTimer = 0;
let qualityCooldown = 0;
let lowFpsTime = 0;   // rain only sheds after a sustained dip, not a teleport spike

function animate() {
  requestAnimationFrame(animate);
  const rawDt = clock.getDelta();
  const dt = Math.min(0.05, rawDt);   // clamp like the mothergame's fps example
  const fps = 1 / Math.max(rawDt, 1e-4);
  fpsEMA += (fps - fpsEMA) * 0.04;

  if (!paused && world) {
    elapsed += dt;
    world.uTime.value = elapsed;
    world.update(dt, elapsed, player.state.pos);
    traffic.update(dt, elapsed, player.state.pos);
    player.update(dt, elapsed);
    fx.update(dt, elapsed);
    hud.update(dt, elapsed, player, traffic, camera, fpsEMA, world);
  }

  // adaptive quality — shed pixel ratio first, then rain (skip warm-up frames)
  lowFpsTime = fpsEMA < 36 ? lowFpsTime + dt : 0;
  qualityCooldown -= dt;
  if (qualityCooldown <= 0 && world && elapsed > 6) {
    if (fpsEMA < 42 && pixelRatio > 1.0) {
      pixelRatio = Math.max(1.0, pixelRatio - 0.25);
      renderer.setPixelRatio(pixelRatio);
      composer.setSize(innerWidth, innerHeight);
      qualityCooldown = 3;
    } else if (fpsEMA < 34 && fx && fx.rainOn && lowFpsTime > 4) {
      fx.toggleRain();
      hud.setWeather(false);
      qualityCooldown = 5;
    } else if (fpsEMA > 57 && pixelRatio < Math.min(devicePixelRatio, C.QUALITY.maxPixelRatio)) {
      pixelRatio = Math.min(Math.min(devicePixelRatio, C.QUALITY.maxPixelRatio), pixelRatio + 0.25);
      renderer.setPixelRatio(pixelRatio);
      composer.setSize(innerWidth, innerHeight);
      qualityCooldown = 6;
    }
  }

  if (world) composer.render();
}

boot().then(() => animate()).catch(err => {
  console.error('NEON CITY boot failure:', err);
  const s = document.getElementById('launch-status');
  if (s) { s.textContent = `BOOT FAULT — ${err.message}`; s.style.color = '#ff3355'; }
});
