# HYBRID BRIEF — Interstellar Slingshot

**Branch:** `claude/star-explorer-hybrid` (created 2026-09-26 from `claude/star-explorer` @ `29445f0`)
**This document governs the hybrid effort.** Where it disagrees with `CLAUDE.md`, `progress.html`
or `SELF-IMPROVE.md`, this document wins.

## What this is

Two builds exist:

| Name | Ref | Build tag | What it is |
|---|---|---|---|
| **ORIGINAL** | `origin/main` | 20260805i | The game Ben likes. Retro vector-art look, full HUD, lots of enemies. |
| **OVERHAUL** | `claude/star-explorer` | 20260814f | 46 commits of "Wave 1–9" agent rebuilds. Beautiful space and scale, but it replaced a lot Ben liked. |

The hybrid starts from the OVERHAUL and **restores ORIGINAL elements onto it**. Ben chose this
direction himself: *"Maybe we should just be restoring some of the original elements to the new
branch instead of trying to identify all the good parts to keep."*

The OVERHAUL contains every line of ORIGINAL history (main's only extra commits are merge
commits), so `git diff origin/main claude/star-explorer` is purely the overhaul.

## Art direction (Ben, verbatim)

> I want to keep the retro vector art feel but also make it fun for modern players

Read that as: **ships, enemies, shields, weapons, explosions, HUD and text keep the ORIGINAL's
flat, hard-edged, saturated neon vector look.** The *world* — sky, nebulae, planets, stars, scale,
lighting — and the *feel* — slingshot, warp, steering, enemy AI — get the OVERHAUL's modern depth.
Vector craft flying through a gorgeous universe.

## Requirements (Ben, verbatim, 2026-09-26)

> I want all of the atmospheric look of background space and the big beautiful scale of the
> planets from the star-explorer branch to be incorporated into the original with all the new
> lighting effects and I want to keep the new gravitational slingshot and the warp animations. The
> nebula clouds should also be used in combination with our original ones. I want the way in the
> star-explorer branch the demo player warps towards a planet and then stops when it is big and
> right in front of the player to persist. I want the advanced enemy behaviors to be brought over
> also. I want the Sol System planets and Sun to be as big as the other ones in the game. I want
> the control of steering during an emergency warp or slingshot to be kept. I do not want the sound
> effects or explosion effects brought over. I do not want the ship graphics upgrades and new
> textures, except I do want the thruster animations. Maybe we should just be restoring some of the
> original elements to the new branch instead of trying to identify all the good parts to keep. I
> do not like the new ship and want the old look of the ship to return and the old shields or maybe
> a combination of the old and new shields. The old look of enemies and the black holes are missing
> in the space-explorer but they are one of the best parts of the game so are lots of enemies. It
> is almost like there are too many nebula so we cannot see deep space the same. I want all the
> original UI and enemy notification effects from the older version as well as the praise text.
> There is a UI panel in the new version that is in the wrong place and these messages should
> revert back to the older UI where we removed this notification panel and rerouted its messages to
> a better place on the screen. It is the window in this image that says Wingman ETA

> Also the old intro screen and intro was better. I had hoped the view when the game started would
> be more like the view shown on the star-explorer intro screen, with the planets huge in
> perspective and amazing looking, but it misinterpreted what I was asking for and made that the
> intro screen background. I also don't think the star-explorer build ever made the Sol System
> planets as big as the rest in the game, with all that amazing detail but I wanted it to. I like
> the original countdown and launch sequence.

## Keep / restore ledger

| System | Decision | Notes |
|---|---|---|
| Background space: sky, starfield, distant galaxies, atmosphere | **KEEP overhaul** | But deep space must be *visible* — see nebula row |
| Planet/star scale + new lighting and shading | **KEEP overhaul** | |
| Sol System planets + Sun | **CHANGE** | As big and as detailed as bodies elsewhere in the game. Never done in the overhaul. |
| In-game opening view | **CHANGE** | When play begins, planets huge in perspective — the composition the overhaul wrongly put on the title screen |
| Gravitational slingshot | **KEEP overhaul** | |
| Warp animations | **KEEP overhaul** | |
| Demo warp → parks with the planet big and dead ahead | **KEEP overhaul** | |
| Steering control during emergency warp / slingshot | **KEEP overhaul** | |
| Advanced enemy behaviours (AI) | **KEEP overhaul** | Behaviour only — not the look |
| Thruster animations | **KEEP overhaul** | The only ship-graphics item kept |
| Nebula clouds | **COMBINE** | Overhaul volumetric clouds + ORIGINAL clouds together, thinned so deep space reads |
| Player ship model, materials, textures | **RESTORE original** | |
| Shields | **RESTORE original**, or blend | Ben: "the old shields or maybe a combination" |
| Enemy look | **RESTORE original** | "one of the best parts of the game" |
| Enemy population | **RESTORE original** | "so are lots of enemies" |
| Black holes | **RESTORE original look** | "one of the best parts of the game" |
| Sound effects | **RESTORE original** | |
| Explosion effects | **RESTORE original** | |
| All UI / HUD panels | **RESTORE original** | |
| Enemy notification effects | **RESTORE original** | |
| Praise text | **RESTORE original** | |
| Notification panel showing wingman messages | **REMOVE** | ORIGINAL had removed it and rerouted the messages; the overhaul resurrected it |
| Intro screen, intro, countdown, launch sequence | **RESTORE original** | |

### Not mentioned by Ben — orchestrator's default, flagged for his review
| System | Default | Why |
|---|---|---|
| Music system (adaptive layers, stingers, risers) | Restore original | He rejected the new audio effects; overhaul's combat bed is known to latch |
| Performance work (celestial culling, DOM-layer perf) | Keep overhaul | Invisible, and the big planets need it |
| Procedural galaxies (`js/proc-galaxies.js`) | Keep overhaul | Part of the bigger universe; self-contained |
| Camera (warp FOV, chase dolly) | Keep overhaul | Part of the warp/slingshot feel he is keeping |

## Ground rules for anyone editing this branch

1. **Vanilla JS, no build step.** Plain `<script>` tags in `index.html`, shared globals. Three.js r128.
2. **`node --check js/<file>.js` after every edit.**
3. **Do not bump cache-busters** (`?v=…`, `BUILD_TAG`) in a work-package branch — they collide on
   merge. The integrator bumps them once. Test with `scripts/shot.mjs`, which serves `no-store`.
4. **Restore by function, not by file**, unless the brief for your package says a whole file is
   safe. The overhaul added callers all over; a wholesale file restore leaves dangling references.
   After any restore: grep for every symbol you removed.
5. **Verify with your eyes.** Capture the ORIGINAL and your build staged identically and compare.
   A change that "should" look right is not done until a screenshot shows it.
6. **Never regress a KEEP row** to finish a RESTORE row. If the two genuinely conflict, stop and
   report the conflict.
7. One focused commit per logical change. Commit only the files you changed — never `git add -A`.

## How the overhaul is built — read this before you explore

Measured with `scripts/fn-map.mjs`: the overhaul **changed only 163 of the original's units in
place** and **added ~1,300 new ones**. The original builders (player ship, most enemy spawning, the
HUD functions) are largely untouched; the new look is bolted on afterwards by add-on code that
hooks itself in at load time:

- self-driving loops — e.g. `_runPlayerHullUpgradeLoop` swaps the ship's materials after the
  original builder has run;
- installers and wrappers — `_install…`, `_wrap…`, `const _orig = window.f; window.f = …`;
- top-level `if (typeof window !== 'undefined') …` statements that start them.

So a restore is usually one of two small moves, not a rewrite:

1. **Gate the hook** on the switchboard: `if (!window.HYBRID || HYBRID.is('playerShip','overhaul'))`.
   Preferred wherever the overhaul feature is an add-on with a clear entry point. The overhaul code
   stays in the file, dormant, and Ben can flip it back on to compare.
2. **Restore the unit** with `scripts/fn-restore.mjs` where the overhaul rewrote an original
   function in place. Byte-exact, no retyping.

## The switchboard — `js/hybrid-config.js`

One entry per restored system (`playerShip`, `shields`, `enemyLook`, `nebulaDensity`, `hud`, …),
defaults set to Ben's decisions. **Every switch already exists — read them, do not add or rename
them** (parallel packages would collide). If you need a new one, say so in your report.
`HYBRID.is(key, value)`, `HYBRID.num(key)`. Test the other side with `?hy=key:value`.

## Tools

```bash
# WHAT did the overhaul change?  (parser-based, exact)
node scripts/fn-map.mjs                        # every file: counts
node scripts/fn-map.mjs js/game-models.js      # one file: every CHANGED / ADDED / REMOVED unit
node scripts/fn-map.mjs js/x.js --grep ship    # filter by name

# PUT ORIGINAL CODE BACK, byte-exact
node scripts/fn-restore.mjs js/x.js --show  fnName          # read both versions side by side
node scripts/fn-restore.mjs js/x.js fnA fnB                 # restore units from ORIGINAL
node scripts/fn-restore.mjs js/x.js --keep-as _overhaul fn  # restore, keep overhaul copy for a switch
node scripts/fn-restore.mjs js/x.js --insert fn --after g   # bring back a deleted unit

# DID I BREAK A REFERENCE?  run after every restore — exits 1 on a new unguarded dangling name
node scripts/fn-undef.mjs --new

# screenshot any build, staged, on the real GPU
node scripts/shot.mjs --root <build dir> --out .critic/<pkg> --name <label> \
     --mode demo --shots 8,30,60 [--eval stage.js] [--canvas]

# reference checkouts (read-only — do not edit)
#   ORIGINAL  /Users/benstagl/InterstellarSlingshot/.claude/worktrees/main-baseline
#   OVERHAUL  /Users/benstagl/InterstellarSlingshot/.claude/worktrees/nebula-path-fix
# baseline shots of both:  <hybrid>/.critic/base/{main,star}-{008,030,060}s.png

npm run test:syntax      # node --check over js/*.js
npm run test:smoke       # boots the game headless, asserts the regression probe is clean
```

`--eval` takes a JS file run in the page before each capture (`t` = seconds in scope). Globals are
reachable with indirect eval: `const ie = eval; const cam = ie('camera'), scn = ie('scene');`.

`progress.html` holds the overhaul's per-piece scoreboard and a wave log listing known bugs with
file and line. Read the entry for your system before touching it.

## Work packages

| # | Package | Branch |
|---|---|---|
| A | Player craft — original ship look, keep thrusters, shields | `hybrid/craft` |
| B | Enemies — original look and population, keep advanced AI | `hybrid/enemies` |
| C | Deep space — original black holes, combined + thinned nebulae | `hybrid/deepspace` |
| D | Effects and audio — original explosions, SFX, music | `hybrid/fx-audio` |
| E | UI — original HUD, notifications, praise text, remove the wingman panel | `hybrid/ui` |
| F | Intro — original title screen, intro, countdown, launch | `hybrid/intro` |
| G | Sol scale and the opening vista | `hybrid/sol` |
| H | Keep guard — `scripts/keep-check.mjs` | `hybrid/keepguard` |
| I | Enemy flight model — momentum, nose, thrust | `hybrid/enemyflight` |

Each package lands on its own branch off the hybrid base and is merged by the integrator.

## Status (2026-09-27)

| Build | Contents |
|---|---|
| 20260927a | Wave 1 — A craft, E UI, H keep guard |
| 20260927b | Wave 2 — B enemies, D effects and audio |
| 20260927c | Orbit lines steady; giant planets keep their colour (`farPlanetFade`) |
| 20260927d | Asteroids drawn again (`asteroids`); enemies wear original flat exhaust cones (`enemyThrusters`) |
| 20260927e | Explosions combined: ORIGINAL burst + overhaul detonation (`explosions: combined`) |
| 20260927f | I enemy flight model (`enemyFlight: physical`, table `ENEMY_FLIGHT`); enemy cones follow throttle |
| 20260927g | Wave 3 — C deep space: ORIGINAL black holes visible, nebulae combined and thinned; orbit rings exempt from the draw budget; asteroids lit (`HY_ROCK_ALBEDO`) |
| 20260927h | K demo pilot safety: keep-out spheres in radii (`KEEPOUT_K`), 0 deaths in 11 soak runs |
| 20260927i | Wave 4 — F ORIGINAL intro; J black holes bigger (`HY_BH.SIZE` 900) with lensed disc ramping on approach |
| 20260927j | Black holes: no outer circle, no grid (`HY_BH.OUTER_RING`, `HY_BH.GRID` off); ORIGINAL glow, disk and hoop stay on approach (`HY_BH.ORIG_YIELD` 0) |
| 20260927k | Wave 5 — G scale and placement: one size ladder, one spacing rule (`solScale: big`; `HY_SCALE`, `HY_SOL`, `HY_LADDER`). Sol at (9919, 0, 21701); nebulae 28-60k out |
| 20260927l | Wave 6 — G2 the opening view over Earth's limb (`OPENING_VISTA`, `openingVista`); L asteroids rebuilt and scaled (`HY_ROCKS`, `HY_ROAM`) |

| 20260927m | Opening view OFF by default (Ben rejected it) |
| in progress | M — the ORIGINAL asteroids: every kind, ORIGINAL builders, shootable by real input |

**All twelve packages (A-L) are merged as of 20260927l.** Guard 9/9 at 60 fps; final demo soak
3 x 150 s, 0 deaths.

**Ben on build l, verbatim (2026-09-27):** "1 the asteroids used to be able to be shot. 2 the new
starting view is bad, revert. I don't just want some new asteroids, I want all of the different
asteroids from the original version."

Two packages were rejected:
- **G2 opening view** — reverted to ORIGINAL's start in 20260927m (`openingVista: off`).
- **L asteroids** — it REPLACED ORIGINAL's asteroids with a new instanced builder. Ben wanted the
  originals. Package M restores them; L's builder moves behind `asteroids: instanced`.
  Lesson: "bring X back" means restore ORIGINAL's X, not build a better X.

### ⚠ "ORIGINAL" (origin/main) is NOT the source for asteroids

**Ben, verbatim:** "now there are double the asteroid belts than needed. can you see the
ASTEROID_SETTINGS.md and ASTEROID_TYPES.md in the files?" and "One of the most recent branches
before the anaglyph-3d branch should have our working asteroids".

The working asteroids are on **`claude/slingshot-assist`** (tip 53aa0aa, 2026-07-04, PR #25,
never merged). It forks from main at 2f0ccbe, the same point anaglyph-3d forked from, so neither
origin/main nor the overhaul ever received it. Commit **7269c47** "Asteroids → InstancedMesh
(GPU)": `js/asteroid-instancer.js`, proxy objects in `planets`, and the weapon and mining raycasts
rewritten to hit the instanced meshes (one-hit destroy verified at the time).
Reference checkout: `/Users/benstagl/InterstellarSlingshot` (read-only); served at
http://localhost:8804/ for comparison.

Belts measured (demo, t=10 s):

| Build | Belts | Rocks per belt | Local "Ancient" belts |
|---|---|---|---|
| slingshot-assist | 11, 1-2 per galaxy | instanced | ONE, ring 5,604 |
| origin/main | 10, 1-2 per galaxy | 85-111 | two, lift -628 and +817 |
| hybrid 20260927m (package L) | 13 | 280-557 | two, BOTH at ring 4,916 — the doubling |

**Whenever Ben remembers something working that origin/main does not do, check the unmerged
branches first**: `claude/slingshot-assist` (PR #25), `claude/volkaris-level` (PR #23),
`claude/neon-city-level` (PR #19), `claude/hud-chrome-restyle`.

### Open items
1. **Enemies near the player thinned** with the wider spacing: within 15,000 of the start, 21
   against ORIGINAL's 57. Ben wants "lots of enemies". Not addressed.
2. **The guard fails intermittently**, about 1 run in 6-8: slingshot, warp and steering fail
   together (the warp never engages), with 0 page errors, then pass on re-run. Seen on every build
   including the overhaul base. Cause not established; could be a real occasional fault in the warp.
3. **After the opening view releases**, about half of boots roll the camera slowly by up to
   70-90 degrees as the flight model's roll-leveller corrects it.
4. **The Sun reads as an orange marbled planet** with only a faint glow.
5. **The launch hand-off freezes** about 3.2 s then 1.3 s (ORIGINAL ~1 s) while the heavier world
   generates.
6. Not re-checked at the new scale: map/radar, trader routes, galaxy-core enemy spawn radii.
   Galaxy and Alpha/Beta/Gamma planets are resized but still flat Lambert.
7. Audio (ORIGINAL sound effects and music) was verified by code and logs only, never by ear.
8. No Sol asteroid belt in the orbital plane: ORIGINAL lifts it 600-1,000 off the plane. One line
   to drop the lift (`_yOff` for galaxy 7); costs ~310 rocks and 4 draw calls. Ben's call.
9. Flying through a rock gives no bump: the collision threshold is ORIGINAL's 6 units and rocks
   are now radius 9-64.

Ben, 2026-09-27, on build i: "The big circles around the black holes are not necessary. Probably
inspired by one of the images I uploaded. Can the other black hole effects come back alongside the
current ones. Can asteroids come back?" and "get rid of the grid lines around black holes too."
Asteroids asked for a third time → package L. Measured: belt rocks drawn 784 (ORIGINAL) vs 411;
roaming asteroids within 30,000 of the player 262-280 vs 3-4; ORIGINAL belts sit 1,600-2,600 from a
hole, now inside the radius-900 holes' discs.

Guard on 20260927i: `node scripts/keep-check.mjs --root . --out .critic/keepcheck` → 9/9 PASS, 60 fps.
Demo soak: `node scripts/demo-soak.mjs --root . --out .critic/soak --runs 5 --secs 180`.

Play the hybrid: `node scripts/serve.mjs 8803` → http://localhost:8803/

## Feedback from Ben while testing (verbatim, 2026-09-27)

> Sol system orbit lines load late and are unstable. What are the nearby large dark planets and
> what is their light source currently?

Resolved in 20260927c. Orbit lines: the overhaul culled and faded them by distance (9-10 of ~210
shown, opacity wandering 0.07-0.29); ORIGINAL behaviour restored. Dark planets: the "heart worlds"
(one `<Nebula> Prime` per nebula, radius 620), lit only by their own shader's `uSun` (their
nebula's nearest star), were dimmed to 7-50 % by the distance-haze pass `_aerialFactor`; it now
fades by apparent size.

> enemy movement is a little too erratic with the main enemies. We want to emulate the physics of
> space flight so maneuvers should be effected by momentum and ship nose direction and thrust.
> Maybe comparing to Star Wars games as well as Starfox.

Package I. Keep what the AI decides; replace how it moves: persistent velocity, thrust along the
nose, rate- and acceleration-limited turns, velocity lagging the nose, banking. Switch `enemyFlight`.

> Shouldn't those giant planets be further away from SOL and each other. There placement needs to
> scale with their size

Package G, Part 0. Measured: ORIGINAL keeps its nebulae 28,000-41,000 from Sol; the overhaul
pulled five in to 4,000-5,300, so five radius-620 giants sit between Jupiter's and Saturn's
orbits, 6-10 of their own radii from Sol and ~4 radii from each other. One placement rule in
radii for every large body.

> Where are the asteroids? Black holes need more of the original event horizon effects and the
> original color influence. They need to scale along with all the other giant planets. Enemies
> should not have textures at this time and should look like they originally did.

Asteroids and enemy textures resolved in 20260927d (`asteroids`, `enemyThrusters`). Black-hole
look: package C, then J.

> we should combine the old explosions with the new ones

Resolved in 20260927e: `explosions: combined` is the default.

> demo player keeps colliding with planets. Outer system planets and stars should be increased in
> scale as well. Black holes should be increased in scale and should get more intense aurora and
> accretion disc effect as the player approaches them

With two reference images, kept at `.critic/refs/blackhole-ref-gargantua.jpg` (the Interstellar
look: shadow, photon ring, disc across the front, lensed arch above and below) and
`.critic/refs/blackhole-ref-stylised.png` (hot inner ring, swirling disc, sparks, warped grid).
Package K: demo pilot keep-out spheres in radii, legs validated before committing, on-rails
manoeuvres that look ahead. Package J: black holes bigger, ORIGINAL effects kept, lensed disc
added, intensity ramping with proximity. Package G, Part 2: outer systems and every star join one
size ladder.

## Open questions for Ben

1. **Invisible messages.** In ORIGINAL, `showAchievement` messages (wingman comms, "Target Hit!",
   "Hull Repaired") are never displayed — they are always deferred. The hybrid matches that. If he
   wants them visible, where?
2. **Slingshot steering** turns the camera but not the flight path (warp steering bends the path
   by 100+ degrees). Is bending the path during a slingshot wanted?
3. ~~Enemy engine plumes~~ — answered 2026-09-27: no textures on enemies; ORIGINAL cones restored.
   Side effect: the AI's attack wind-up flare was drawn by the plume system, so it is not visible
   now. A flat, vector-style telegraph (a glow-shell flash) would bring it back if he wants it.
4. **Heart-world colours** are saturated now that they are lit. Too candy-coloured?
5. **Music** reverted to ORIGINAL by the integrator's default, not his word (`music`).

## Known issues

- Intermittent, predates the hybrid: "Cannot read properties of undefined (reading 'value')" from
  three.js `refreshMaterialUniforms`, which then throws every frame (picture freezes). Seen in 2 of
  12 guard runs, both under machine load; not reproduced since. `keep-check` prints the offending
  object and material under "draw calls that threw" when it recurs.
- `keep-check` is slightly flaky: 1 in 12 runs the warp did not engage, 1 in 12 the arrival park
  was missed, with no page errors. Cause not established.
