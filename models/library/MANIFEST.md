# Asset Library — CC0 model packs for building out the universe

Downloaded 2026-06-13. All **CC0** (public domain, no attribution required) —
safe for commercial/public release. Originals: [Kenney](https://kenney.nl).

These are a *staging library*, NOT auto-loaded. The game loads ships by fixed
name (`models/Enemy1.glb` … `Enemy8.glb`, `Boss1-8.glb`, `Player.glb`, and the
civilian `Freighter/Military/Mining/...`). To put a library model in-game, copy
it up to `models/` under the expected name (or add a new slot — see below).

## Packs

### `kenney-space-kit/` — 153 models (flat-shaded low-poly, matches our style)
**Ships / craft** (drop-in enemy or civilian candidates):
- `craft_speederA/B/C/D.glb` — small fighters → new **Enemy** variants
- `craft_racer.glb` — sleek interceptor → fast enemy / scout
- `craft_cargoA/B.glb` — bulk haulers → **Freighter** / civilian variants
- `craft_miner.glb` — → **Mining** vessel variant
- `rocket_*` (base/fins/fuel/sides/top A/B) — modular rocket parts → boss builds / set-dressing
- `satelliteDish*.glb`, `machine_wireless*.glb` — → **Satellite** variants, nav beacons

**Universe set-dressing** (stations, ground features, props): pipes, platforms,
terrain ramps, craters, monorail, structures, desks/computers, astronauts,
weapons. Useful for landmark POIs (like the NEON CITY architecture garden).

### `kenney-station-kit/` — 97 models (interior/station modules)
Walls, doors, windows, floors, balconies, containers, computers, beds,
pipes, structures. Best for **buildable stations / derelicts / interiors** the
player can fly to or that decorate inhabited systems.

## Integration checklist (per the CLAUDE.md learnings)
1. **Copy** the chosen GLB into `models/` (e.g. `cp library/kenney-space-kit/craft_speederA.glb ../Enemy9.glb`).
2. **Register** it: extend the `modelCache.enemies`/`bosses` load loop in
   `js/game-models.js` (bump the model count) or add a civilian category.
3. **Nose axis** — Kenney craft are authored **−Z forward** (standard), so they
   should NOT need a `_enemyModelNoseFlip` entry — but verify in-game (cones on
   the rear). If backwards, add the regionId to `_enemyModelNoseFlip`.
4. **Scale** — these are ~1-unit models; the existing 48/96/144 scale factors
   apply. If one imports oversized/undersized, add a `_enemyModelScaleCorrection`
   entry.
5. **Material** — irrelevant; `createEnemyMeshWithModel` overrides to flat
   faction colors on load. You're buying silhouette only.
6. **Poly budget** — all of these are low-poly (hundreds of tris); safe at scale.

## Not pulled (and why)
- **Quaternius Ultimate Spaceships** (also CC0, 10 ships ×5 colors) — the
  download is JS-gated and the GitHub mirror is a Godot port (`.tscn`/`.blend`,
  no GLB). Grab manually from quaternius.com if more hero-ship variety is wanted;
  `.blend` → GLB via Blender export.
- **Cannon.js / physics-mesh packs** — our collision is sphere/distance; no need.
