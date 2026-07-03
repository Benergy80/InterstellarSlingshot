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
import { buildSky } from './sky.js';
import { createFX } from './fx.js';
import { buildTransit } from './transit.js';
import { buildNPCs } from './npcs.js';
import { createPlayer } from './player.js';
import { createHUD } from './hud.js';
import { createAudio } from './audio.js';

const VK_BUILD = 'VOLKARIS build 2026-07-03g · closer chase camera';
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
let planet, sky, fx, npcs, player, transit;

async function loadModels() {
  const loader = new GLTFLoader();
  const out = { kay: {} };
  const shipJobs = ['Player', 'Freighter'].map(n => new Promise((res) => {
    loader.load(`../models/${n}.glb`, (g) => { out[n] = g.scene; res(); }, undefined, () => res());
  }));
  // KayKit Adventurers (CC0) — pro rigs + 75 animation clips each
  const kayJobs = ['Sentinel', 'Astronaut', 'Rogue_Hooded', 'Rogue', 'Mage', 'Barbarian'].map(n => new Promise((res) => {
    loader.load(`assets/${n}.glb`, (g) => { out.kay[n] = g; res(); }, undefined, () => res());
  }));
  await Promise.race([
    Promise.all([...shipJobs, ...kayJobs]),
    new Promise(res => setTimeout(res, 12000)),
  ]);
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

  hud.setProgress(0.55, 'IGNITING THE SUN');
  await frame();
  sky = buildSky(scene, renderer);

  hud.setProgress(0.7, 'CHARGING BLASTERS');
  await frame();
  fx = createFX(scene, camera, planet, audio, models);

  hud.setProgress(0.78, 'SPINNING UP THE ORBITAL LOOP');
  await frame();
  transit = buildTransit(scene, planet, audio);

  hud.setProgress(0.85, 'WAKING THE LOCALS');
  await frame();
  npcs = buildNPCs(scene, planet, fx, audio, hud, models);

  player = createPlayer({ scene, camera, planet, hud, audio, fx, transit, models });
  player.bindTargets(npcs);
  fx.bindCombat(npcs, player);

  hud.setProgress(0.95, 'DROP POD AWAY');
  await frame();

  hud.ready(() => { audio.resume(); player.start(); });

  window.VK = { planet, sky, fx, npcs, player, transit, scene, camera, renderer, bloom };
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
    const dayF = sky.update(elapsed, player.state.pos, bloom, planet.group.children[1]?.material);
    player.suitLamp.intensity = 0.15 + sky.night * 1.2;
    player.update(dt, elapsed);
    transit.update(dt, elapsed, player.state.pos);
    npcs.update(dt, elapsed, player);
    fx.update(dt, elapsed);
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
