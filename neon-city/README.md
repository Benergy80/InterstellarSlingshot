# NEON CITY // NC-2287 — special surface level

A fully simulated neon-cyberpunk city for **Interstellar Slingshot**: the same
flight control scheme, adapted to a world where gravity keeps you tethered to
the ground — with the exception of jumping.

**Play it:** serve the repo root and open `/neon-city/`
(`python3 -m http.server 8000` → http://localhost:8000/neon-city/).
It is fully standalone — no changes to the main game. On GitHub Pages it works
at `https://<domain>/neon-city/` automatically.

## What's simulated

- **Six districts** — UPTOWN CORE (center 3×3 super-talls) ringed by five 72°
  wedges: NEON MARKET, THE FOUNDRY (spaceport side), RESIDENTIAL STACKS,
  CORPORATE PLAZA, OLD TOWN. Each district drives its own building heights,
  window density/palette/flicker (per-instance `aTuning` shader attribute),
  curb-circuit color, sign pool, and storefront rate. Gateway arches name the
  border crossings; the HUD SECTOR readout and tinted minimap zones track
  where you are; each district has a nav POI.
- **Procedural city** — 11×11 block grid, ~800 instanced buildings with
  GPU-shader window cells (hashed lit/dark/color/flicker per pane, constant
  ~3 u pane size at any building scale), an arcade alley, neon curb circuits,
  wet-asphalt env reflections, canvas-drawn neon signage (PRINTWIRE / DMLS-3D /
  MAXCNC / SLINGSHOT TRANSIT…), animated hero billboards, a scrolling LED news
  ticker wrapping the Spire.
- **Enterable interiors** — 14 buildings (2–3 per district, lit door frames
  mark them; amber squares on the map) open up: sliding-door vestibules,
  multi-floor slabs with stairwell + shaft voids, switchback stairs, a gated
  interior lift (ENTER to ride floor to floor; roof stop on shorter towers),
  seeded per-floor layouts (open plan / room dividers) and props. Interior
  colliders/surfaces are scoped to the active building, so the citywide
  physics cost stays flat.
- **Gated elevators everywhere** — a reusable cab-with-floor-stops system:
  sliding door panels per stop and per-stop gate colliders, so a cab can never
  carry you through a slab or drop you into a shaft. Used by the Spire (docks
  outside the deck rim at a railed bridge), three district SKYLIFT flagships
  with walkable rooftop decks, and every interior lift.
- **Ground traffic** — instanced cars on right-hand lane loops with headlight /
  taillight quads and neon underglow (3 draw calls for the whole fleet).
- **Air traffic** — spinners flying the street canyons in four altitude bands,
  banking into turns.
- **Monorail** — two ring lines (LINE A — KESSLER LOOP, LINE B — RIM CIRCLE,
  whose stations are named for the districts they serve), pylons, glowing
  track, four stations per line with platforms + walkable ramps. Trains
  decelerate, dwell ~9 s, and depart; station holo-signs show a **live arrival
  countdown** ("NEXT 0:42 / ARRIVING / BOARDING 0:07"). Stand anywhere on the
  platform while a train dwells and press ENTER to board the nearest car; the
  view turns with the track while you ride; ENTER again at any stop to step off.
- **Gagarin Spaceport** — apron, six landing pads with pulsing edge studs,
  control tower with rotating dish + sweeping searchlights, hangars, runway
  with chasing approach lights. Ships (the game's own GLB models — Shuttle,
  Passenger, Freighter, Tanker… loaded from `../models/`, procedural fallback
  if missing) spool up, lift off, cruise out, and land on a schedule. Patrol
  jets circle; a UFO makes occasional high-altitude passes.
- **The Spire** — central landmark with a glass elevator to a walkable
  observation deck 110 u up.
- **Weather & FX** — acid rain (camera-following streak points), lightning
  with delayed thunder, steam vents, patrol drones with searchlight cones,
  holographic plaza fountain, a gas giant + starfield + skyline silhouette
  ring beyond the fog.
- **Audio** — fully synthesized Web Audio (city drone, wind, rain bed, laser /
  missile / chime / thunder SFX). No audio assets.

## Controls (the Slingshot scheme, planetside)

| Action | Key | Notes |
|---|---|---|
| Walk / reverse | **W / S** | |
| Strafe | **A / D** | banks the camera like the ship |
| **Jump (tactical hop)** | **W W** double-tap | same 300 ms window as the ship's tactical jump |
| Boost sprint | **B** | drains energy |
| Brake | **X** | |
| Look around | **Arrow keys** | the ship's exact rotational inertia (accel 0.0030, decel 0.93, max 0.022); **CapsLock** = precision mode |
| Aim | **Mouse** | free crosshair, like the mothergame |
| Fire lasers | **Click / Space** | |
| Missile | **Z** | |
| Shields | **Tab** | |
| Interact / auto-nav | **Enter** | board/leave monorail · ride Spire elevator · toggle auto-nav to the current nav target |
| Cycle nav target | **C** | plaza, stations, spaceport, deck… |
| 1st / 3rd person | **V** | |
| Lean | **Q / E** | |
| Demo autopilot tour | **T** (exit **Esc**) | 7-shot cinematic city tour |
| Pause | **P** | |
| Mute / Rain | **M / R** | |

## Tech notes

- Three.js **0.170** via import map (jsDelivr CDN), ES modules — no build step,
  consistent with the repo's static-files philosophy. The main game's r128
  globals are untouched; the level is its own page.
- ACESFilmic tone mapping + `UnrealBloomPass` (strength 0.62 / radius 0.42 /
  threshold 0.52) + `OutputPass`.
- Instancing everywhere (buildings, trims, signs, street lights, cars, lights,
  spinners, pylons, studs); whole-fleet matrix updates per frame; ~150 draw
  calls; 60+ fps on an M-series MacBook, with adaptive pixel-ratio/rain
  shedding if it dips.
- Deterministic: the entire city regenerates identically from `C.SEED`
  (`js/config.js`).
- Player physics: AABB push-out vs. building/prop colliders, walkable surface
  stack (ground, platforms, ramps as `y(x,z)` functions, moving elevator pad),
  gravity 26 u/s², fall-impact hull damage.

Module map: `js/config.js` (constants/seeded RNG) · `js/world.js` (city gen,
districts, gated-elevator factory) · `js/interiors.js` (enterable buildings)
· `js/traffic.js` (cars/air/monorail/spaceport) · `js/player.js` (controls)
· `js/fx.js` (weapons/weather) · `js/audio.js` (synth) · `js/hud.js` (UI)
· `js/main.js` (boot/composer/loop).
