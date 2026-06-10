# Interstellar Slingshot — working notes for Claude

A 3D browser space game (vanilla JS + Three.js r128, no build step). Files are
plain `<script>` tags in `index.html`; globals are shared across `js/*.js`.

## Repo / GitHub / current work
- **Local:** `/Users/benstagl/InterstellarSlingshot`
- **GitHub:** https://github.com/Benergy80/InterstellarSlingshot (owner `Benergy80`)
- **Active branch:** `claude/fps-drawcall-culling` (based on `claude/fix-missiles-undefined-hud`)
- **Open PR:** #16 (`fps-drawcall-culling` → `fix-missiles-undefined-hud`) — perf/integrity + demo-feel work
- Feature/demo work generally lands on `claude/fix-missiles-undefined-hud` and its descendants, NOT `main`.

## How to run / observe it
- **Local server:** `python3 -m http.server 8000` serving the repo dir. Check: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000`.
- The page auto-starts at a launch screen with **"PRESS TO LAUNCH"** and **"DEMO MODE / AUTOPILOT SHOWCASE"** buttons. World-gen takes ~20–40 s (3,000+ planets).
- **chrome-devtools MCP drives the user's VISIBLE browser.** `navigate`/`reload`/`click` disrupt what they're watching — only do them when asked. To *observe*, use read-only `evaluate_script` + `take_screenshot`.

## ⚠️ Gotchas that wasted hours last session
- **CACHE:** JS is loaded with a STATIC `?v=20260607-perfbranch` cache-buster, so a normal reload (Cmd+R) can serve **stale JS** — your edit won't take effect. Use a **hard reload** (`ignoreCache`/Cmd+Shift+R) or DevTools ▸ Network ▸ "Disable cache". If "the fix didn't work," suspect cache first; verify with `someFn.toString()` in the page.
- **Git identity:** the machine hostname can be `(none)`, which breaks commit auto-identity. Set locally: `git config user.name "Benjamin Stagl"` / `git config user.email benjaminstagl@gmail.com`.
- **Push:** repo owner is `Benergy80`, but the active `gh` account may be `maxdavis3` (→ 403). Fix: `gh auth switch --hostname github.com --user Benergy80`, then push with `git -c credential.helper='!gh auth git-credential' push`.
- Always `node --check js/<file>.js` after editing, before reloading.

## Codebase map — where the elusive things live
(Line numbers are approximate; search by the function name.)

**Main loop / lifecycle**
- `animate()` — `js/game-core.js` (~1439). Self-perpetuates via rAF; guarded against duplicate kickoffs. Calls every per-frame system.
- Kickoffs of `animate()` also live in `js/game-intro.js` (`startNormalGameplay` ~2664) and game-core init.
- `gameState` (global): `frameCount, velocityVector, gameStarted, paused, gameOver, energy, hull, currentTarget, autoNavigating, warping, emergencyWarp, slingshot`.

**Demo autopilot**
- `js/autopilot.js`. Public API: `window.demoPilot` (`start/stop/toggleTakeover/active/driving/paused/update`). Internal state object `ap` is **closure-private** (`const ap = {…}` ~line 10) — not on `window`. Phases: `findLocalEnemies, combat, followDiscoveryPath, warpToNebulaCluster, gotoBlackHoleGalaxy, …`.
- Steering is delegated to `window.orientTowardsTarget` (see below), called every frame from the active phase.
- `swarmEnemiesNearPlayer()` (~3118) pulls nearby enemies toward the player at `fc%3`.
- W-jump gate `speed < 4` (~1563); O-key emergency warp for long pursuits.

**Steering (the "how fast does it turn" code)**
- `orientTowardsTarget(target)` — **`js/game-physics.js` (~182)**, NOT autopilot.js (which only *calls* it). Now a closed-form exponential step: `1 - e^(-rotationSpeedPerFrame·frames)` of remaining angle/frame. Knobs: `rotationSpeedPerFrame` (0.12, approach rate) and `maxRotationPerFrame` (0.045 = max turn speed ~155°/s).

**Enemies**
- Dispatcher `updateEnemyBehavior()` — `js/game-controls.js` (~1027); per-enemy `updateLocalEnemyBehavior` (~1406) → behavior fns: `updateEngagementBehavior` (~612), `updatePursuitBehavior`, `updateEvasionBehavior`, `updateSwarmBehavior`, `updateBossBehavior` (~1617), `updateSupportBehavior` (~1642). Facing: `applyEnemyRotation` (~263).
- Called from `js/game-core.js` (~2206) at **30 Hz (`fc%2`)**, wrapped in **render interpolation** (glide rendered transform to AI target every frame; uses `userData._iFrom/_iTo/_iTick/_interp`). Bosses/support are regular `enemies` entries and ride this. **UFOs are excluded** (own movement).
- Global arrays: `enemies` (incl. bosses/support), `ufoEnemies`, `allyShips`, `tradingShips`.

**Wingmen**
- `allyShips` array (`js/game-controls.js` ~8058); `updateAllyShips()` (~8457). 30 Hz (60 Hz while warping) + render interpolation in `game-core.js` (~2320).

**UFOs**
- `ufoEnemies` array; `updateUFOMovement()` — `js/game-objects.js` (~8961). Runs every frame, `dt`-scaled easing. Beam weapon `_fireUFORayBeam`.

**Audio (TWO systems — easy to confuse)**
- **Synth SFX/music** (Web Audio oscillators) — `js/game-controls.js`: `playSound(type)` (~2809, switch on `type`; `'boss'` is guarded off), `createAmbientSpaceMusic` (~2484), `createBattleMusic` (~2605, the synth "boss music" — disabled), `switchToBattleMusic` (~2711), `switchToAmbientMusic` (~2762). `playNebulaMusic` is in `js/game-physics.js` (~3092).
- **MP3 soundtrack** — `js/game-music.js`: `window.soundtrack`, `play('bossFight'|'borg'|…)`, track→file map (~line 58). `Boss Fight.mp3` is the boss music. Files in `audio/soundtrack/`.
- Boss spawn (`game-objects.js` ~1449) calls `switchToBattleMusic()` which fires both the MP3 track AND (formerly) the synth layer.

**Rendering / perf**
- `updateDistanceCulling()` — `js/game-objects.js` (~5486); toggles `.visible` by distance; called in `animate()` after orbit-line visibility. Camera far plane = 250,000.
- Map/radar: `updateGalaxyMap()` — `js/game-ui.js` (~1250); `radarRange` const (~1302) = detection+plot range; `setupGalaxyMap` (~1057). Map widget is `.round-map` 220px (`css/styles.css` ~511).

**World generation**
- Planets/stars/ships/bosses: `js/game-objects.js` (huge). `createAsteroidBelts()` (~11226) — **galaxy index 7 = the local Sol system**. `spawnBoss` (~1400s; `enemies.push(boss)` ~1424).
- Cosmic features (pulsars, crystals, plasma storms, space whales): `js/cosmic-features.js` — `createCrystalFormations` (~1065), `updateCosmicFeatures` (~1373, animates `cosmicFeatures.*` arrays).
- Outer interstellar systems: `js/outer-systems.js` (also pushes crystal_structure features into `cosmicFeatures.crystalFormations`).

**HUD**
- Panels are HTML in `index.html` (`.ui-panel.{top-left,bottom-left,top-right,bottom-right,title-header}`), styled in `css/styles.css`. Build banner + console-gate + cache-buster are in `index.html` `<head>`.

## Deferred / known issues (see memory too)
- Autopilot can fly into a planet on long warp transits (root-caused; on-rails evade + unvalidated warp exit). See `~/.claude/projects/-Users-benstagl-InterstellarSlingshot/memory/autopilot-warp-planet-collision.md`.
- Dense galaxy cores drop to ~27 fps from in-view planet count — needs planet `InstancedMesh` (culling can't help in-view).

## Branch landscape (snapshot 2026-06-10 — re-derive with `git fetch` + the commands below)
`main` was last advanced 2026-06-06 by merging `fix-missiles-undefined-hud` (PR #17).
To refresh: `git for-each-ref --sort=-committerdate refs/remotes/origin --format='%(committerdate:short) %(refname:short) :: %(subject)'`
and per-branch `git rev-list --count origin/main..origin/<branch>` (0 = merged/contained in main).

**Active**
- `claude/fps-drawcall-culling` — **+12 vs main, PR #16.** This session's work: perf/integrity (draw-call culling, loop dedup, console gate, GLB caching, 2 NaN fixes) + demo feel (closed-form steering, enemy/wingman/boss render-interpolation, UFO dt-easing, enemy mode-dwell, boss-SFX/synth-music retire, larger Sol belt) + this CLAUDE.md. **PR #16 now targets `main`** (its old base `fix-missiles-undefined-hud` is already merged into main).

**Open / unmerged (has work NOT in main)**
- `claude/hud-chrome-restyle` (+8) — HUD chamfered-panel + cockpit-frame prototype (CSS-only). **User rejected the look — parked.** Also carries the perf commits it was branched from.
- `claude/rewards-energy-slingshot` (+4, behind 32) — shield-bubble sizing, **Tailwind CDN → precompiled stylesheet (fixes the prod console warning)**, startup shield-warning silence. Worth cherry-picking the Tailwind fix.
- `claude/hud-rebuild` (+3, behind 112) — an earlier "ornate-bezel" HUD rebuild, **incomplete (1–3 of 4)**. Stale.
- `claude/check-browser-tools-3DhDS` (+1, behind 112) — a local Claude Code setup-guide doc. Stale.
- `test/5x-cosmic-scale` (+4, behind 536) — experiment scaling cosmic features 5×. Very stale.
- `claude/analyze-fps-bottlenecks-*` (2025, +2) — plasma-storm geometry/animation reductions on a stale 2025 base. **Superseded by fps-drawcall-culling** (main already has a different/better plasma optimization).

**Merged / contained in main (done — no action)**
- 2026: `fix-missiles-undefined-hud`, `fix-missing-enemies-*`, `add-autopilot-demo-mode-*`, `revert-camera-merge-rebind-warp-*`, `fix-mobile-camera-ui-*`, `define-nebula-types-*`, `feature/gameplay-improvements`, `feature/mission-system-improvements`.
- 2025: `implement-game-models-*`, `style-mobile-indicators-*`, `implement-gravity-mechanics-*`, `nebula-visibility-atmosphere-test-*`, `minimize-exotic-systems-visibility-*`, `add-outer-interstellar-systems-*`, `add-missile-system-*`.
