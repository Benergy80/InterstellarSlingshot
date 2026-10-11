# HYBRID BRIEF — Interstellar Slingshot

**Branch:** `claude/star-explorer-hybrid` (created 2026-09-26 from `claude/star-explorer` @ `29445f0`)
**This document governs the hybrid effort.** Where it disagrees with `CLAUDE.md`, `progress.html`
or `SELF-IMPROVE.md`, this document wins.

## RESUME HERE (updated 2026-10-11)

**State:** everything is committed and pushed. Latest build **20261010p** on
`claude/star-explorer-hybrid`. All packages A–M (Sep) and N–X (Oct 10-11) merged: planet scale +
universe spacing, the campaign (js/progression.js), player nav-warp, black-hole galaxy placement,
enemies by region + guardians + mission hosts, ORIGINAL nebula swirls + harbours, sector warp tint +
Sol orbit rings + regional haze, the burning Sun, the frontier outer systems, the Universal View
chart, and the slingshot-exit fix. Guard 9/9 at 60 fps; demo soak 0 deaths. Ben's round-3 asks
(items 1-25 under "Requirements, round 3") are all landed or merged. Nothing is running.

**Open after this round** (see the status table + "Open items"): the opening fight is hot (idle
player dies ~55 s — HY_ENEMIES.SOL_START_AHEAD / start stations); the demo showcase's Sol budget
(HY_DEMO) covers combat and boss-engage — soak twice if touching the pilot; the frontier (313-360k)
is beyond the demo's scaled boundary (259k); nebula junk cannot be shot; guard row 9 noseLeads is
marginal (~15°); the campaign has not been played end to end with real fights.

**Where the work lives**
- Hybrid checkout: `~/InterstellarSlingshot/.claude/worktrees/hybrid` (a git worktree; the main
  checkout `~/InterstellarSlingshot` is on `claude/slingshot-assist` and must stay there — it is
  the reference for the working asteroids).
- Comparison checkouts: `.claude/worktrees/main-baseline` (origin/main), `.claude/worktrees/nebula-path-fix`
  (the star-explorer overhaul).

**Restart in a new Terminal**
```bash
cd ~/InterstellarSlingshot/.claude/worktrees/hybrid
sh scripts/serve-all.sh          # :8803 hybrid · :8804 slingshot-assist · :8801 main · :8802 overhaul
open http://localhost:8803/
```
Then either resume the Claude Code session that built this (it was started from `~`):
```bash
cd ~ && claude --resume 11c47e80-cf27-4d2b-82a7-c734ae4d1be6
```
or start fresh in the hybrid worktree and say: "read HYBRID-BRIEF.md, RESUME HERE, and continue".
Claude's memory index also points here (`star-explorer-branch.md`).

**How a package is run** (one Opus agent per package, isolated worktree, precise brief):
`scripts/hybrid-wave.workflow.js` is the saved Workflow script. Launch with the Workflow tool,
`scriptPath` = that file, `args` = `{"base": "<commit sha>", "packages": ["<key>"]}`. The base
MUST be a commit sha (never `HEAD`). Package keys: ui craft keepguard enemies fx-audio deepspace
intro enemyflight sol vista blackholes asteroids asteroids-original demopilot scale2 progression
navwarp bhplace enemies2 nebula2 warpfx sun outer map2 guardflake (all run; re-running one replays
its brief on a new base). Keep ≤3 agents at a time. After it finishes:
`git merge --no-edit hybrid/<key>`, run `npm run test:syntax`, `node scripts/fn-undef.mjs --new`,
`node scripts/keep-check.mjs --root . --out .critic/keepcheck`, then `node scripts/bump-build.mjs
YYYYMMDDx`, commit, push. Never SendMessage a running workflow agent (it forks a second copy).

**Next up, in order**
1. Ben plays the campaign end to end (Sol pirates → flagship → Sgr A* → nebula → mission → faction
   galaxy → guardians) and reports; tune the opening-fight heat if asked.
2. The decisions listed per package in the status table ("decisionsForBen" in each agent report are
   summarised there) and "Open questions for Ben" below.
3. Done, for the record: enemy density (48 pirates at Sol's planets) and the guard flake (whip exit
   through the body) — both root-caused and fixed on Oct 10-11.

**Switches** (`?hy=key:value` on the URL, or `HYBRID.set()` in the console): see
`js/hybrid-config.js`. Current defaults are Ben's choices as of 2026-09-27.

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
| 20261010a | Black holes: spark streaks off (`HY_BH.SPARKS_ON` false) — Ben: "spinning straight line segment shaped particles ... not needed"; everything else kept |
| 20260927n | M — the original asteroids from `claude/slingshot-assist` (instancer 7269c47 + ORIGINAL builders for every kind; `HY_ASTEROIDS`); L's rebuild behind `asteroids: instanced`; CapsLock target cycling no longer throws |

Shooting test, real input: `node scripts/rock-shoot.mjs --root . --out .critic/rock-shoot` →
4 of 4 rocks hit for each of the 7 kinds on 20260927n.

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

## Requirements, round 3 (Ben, verbatim, 2026-10-10)

Sent while testing build 20261010a. Each is a package (N–T below) or already landed in 20261010b.

1. "in the old game you could see nebulas clearly. in the new game it is harder to tell how can we bring back the old while keeping the new." → package S (nebula2)
2. "in the new game the demo player warps to nebulas and stops in front of a big awesome planet. how can we give the human player the ability to do that also so it looks cool when they warp also?" → package P (navwarp)
3. "How can we fix the way the wingmen look when warping?" → LANDED 20261010b (every wingman, dogfighting ones included, drops into follow formation on a real warp burn; far ones FTL-hop into formation once per warp; FTL re-anchor at warp end). Measured before: an engaged wingman fell from 700 u ahead to 3,300 u behind in 6 s of O-warp.
4. "We still want the communication texts, they should come in through the same interface as the other incoming messages at the bottom of the screen. Civilians signals in a different color. I think an earlier build had that." → LANDED 20261010b (`showIncomingTransmission` channels: wingman `#8fd3ff`, civilian `#d08cff`, distress yellow, lore cyan, ship orange; wingman comms and civilian-combat notices route through it).
5. "The warp effects should change colors depending on where you are in the universe and not just be in the purple and pink spectrum." → package T (warpfx)
6. "Orbit lines are not working in the local Sol system from the get go but we need them to work." → package T (warpfx). Measured: Sol's 8 rings exist (r 1,394–14,675, opacity 0.3) but are ±2 u thick — sub-pixel at that scale — and `createOrbitLines()` re-runs on galaxy load and can rebuild the list without them (one run: 422 lines, 0 for Sol).
7. "Asteroid fields should behave and be placed as they were in versions of the game from earlier this year. these are too fast. Look at branches from Feb" → LANDED 20261010b for pace: Feb 2026 (`feature/gameplay-improvements` a44151c, in main) orbited belt rocks at 0.0005–0.0015 rad/frame on 1,600–2,600 u rings (~2 u/frame); the hybrid's Sol belt measured 17.8 u/frame. Now `PACE_REF 2100 / r`. Placement: Feb put Sol's belt at 1,600–2,600 from Sol = between Mars (973) and Jupiter (3,328) of that build; the hybrid's Sol belt sits in the same Mars–Jupiter lane of the scaled system (4,666–5,166). Galaxy belts: Feb 1,600–2,600 from the core; hybrid 6.4–7.6 core radii (the core is 900 now). Kept proportional.
9. "the martian pirate explosions need the newer effects put on pause so we can just see the original ones while I test" → LANDED 20261010c (`explosions: original` default; `combined` stays selectable — flip back when he says).
10. "There should be no optional expedition when the first galaxy is liberated. this needs to be removed." → LANDED 20261010d: the overhaul's "Mission Control - Optional Expedition" offer + its green deep-space discovery path (galaxy-liberation block in js/game-controls.js) is gated off under `progression: campaign`. **Package O (progression) must not reintroduce it**: after Sgr A* is liberated the only guidance is the dotted line to the nearest nebula.
11. "wingmen should say different things depending on where we are in the universe and what their nebula's lore was. They should give tips for fighting and should exlain game mechanics and reward system tips for gaining in speed and m weapons and warps" → LANDED 20261010e: `WINGMAN_CONTEXT_LINES` (js/game-controls.js) — banks combat / sol / core / nebula / home / deep, filled from NEBULA_LORE (the nebula we are in, the wingman's `recruitedFrom` home) and the galaxy faction at the core; every third line is home lore or a mechanics tip; first line ~25 s in, then every 45-80 s per wingman, staggered, through the wingman comms channel. Tips state the real rules (REP_TIERS, applyNebulaShipUpgrade, awardKillReward, reward pockets, caravan resupply, storms) — keep them true when package O/R change rewards.
12. "the lasers need to appear as though they are coming from the guns on the players ship no matter what size or position of the ship" → LANDED 20261010f: `getPlayerWingGuns` (js/game-controls.js) now reads the gun points off the hull's own LOCAL-space box (effects/shields/glows excluded, re-measured on hydration or rescale, nose end chosen by where the ship points; `_HY_GUN` = 85% of half-width out, 10% of height down, 75% of the way to the nose) and first person uses them too (camera offsets only in zero-offset POV). Before: a world-space box measured once (a pitched first shot baked in a swollen box) and first person ignored the ship.
13. "Wingmen should be fighting with player and should shield up when enemies are in detection range. There should be way more enemies. enemies are too close to the black holes now that the black holes are so big." → INTERIM in 20261010g (integrator): wingmen shield up on any threat in detection range (`_updateAllyShield(ally, threat || engaged)`); an enemy within `WINGMAN_JOIN_FIGHT_RANGE` 2,500 of the player is a target for every wingman; wingmen may engage at fast cruise (only a real warp burn keeps formation — before, ≥4 u/frame counted as "warping" and blocked every engagement); `HY_ENEMIES` = { COUNT_K 2.0 on every galaxy's limit, KEEPOUT_RADII 6.6 core radii for every enemy spawn via `getEnemyPlacementPosition` }. **Package R (enemies2) owns the thorough version** — density by region, placement by faction, bosses/guardians clear of the discs.
14. "nebulas need more space traffic and space junk so they feel more crowded." → package S (nebula2), added to its body.
15. "The players starting position should be 150 units above the orbit plane at the beginning of the game." → LANDED 20261010g (`HY_START_HEIGHT` 150 in `resetCameraToGamePosition`, js/game-intro.js; was 120).
16. "The local sun needs to look more like it is a bright burning star emitting light." → package U (sun).
17. "Some distance blurring for further universes may be good or some areas of the universe it is harder to see far and other places it is very clear" → package T (warpfx) gains this as its third item (regional haze).
18. "Outer Systems need a makeover and should be much further away." → package V (outer).
19. "Wingmen should only say things that are conexturally relevant to what is happening right then in the game, they should not say things like "moving in" unless we are engaging battle. not in nebulas." → LANDED 20261010h: the 'engage' line fires on a wingman's FIRST SHOT at a target (in `_executeEngage`), not when a contact appears; 'follow' only on a real warp burn; combat tips only while a wingman is attacking a target inside 1.5× firing range or fired in the last 6 s; home lore only in a nebula (alternating with nebula lines); Sol / core / deep banks only in their places.
20. "can we tone down the effects when the Gravitational Slingshot is engaged so we can see the swinging around the planet better?" → LANDED 20261010h: `slingshotFx: subtle` (default) scales every release effect by `HY_SLING_FX` (visual-flair.js: streak 0.30, debris 0, pulse 0.35, shockwave 0.5, shake 0.35, FOV 0.4; no hyperspace lines, no warp starfield) and keeps the streak/debris fields at that fraction for the whole whip + glide; `?hy=slingshotFx:overhaul` = the full show. The whip's arc and speed are untouched.
21. "enemy shields should be relative to their model size galactic empire support shields seem oversized currently" → LANDED 20261010i: `_ensureEnemyShield` sizes every class by one proportion, `HY_ENEMY_SHIELD.K` 0.36 × the hull's longest dimension measured in the ship's LOCAL frame (boss-support used to take the boss factor 0.62 and a 360 ceiling); clamps MIN 12 / MAX 600 world units only.
22. "outer systems planets and asteroids are broken and ened to be fixed, they are jumping- could use a complete recreate and stars should emit light" → package V (outer), body updated. Integrator's measurements (`.critic/probe-outer-shift.js`, `.critic/probe-outer-jump.js`): the floating-origin rebase is NOT the cause (orbiters are children of a group at the system position with a local `orbitCenter` (0,0,0); true positions survived a forced 86,900 u rebase); parked 3,500 u from "Void's Edge Nexus" headless at 30 fps, four brown dwarfs moved a constant 1.6-4.0 u/frame for 286 frames, no spikes; the interstellar rocks were culled invisible at that range. Still to find in Ben's browser: visibility popping at the fade/cull thresholds, instancer record vs proxy divergence for rocks. LANDED 20261010j: every motion step in js/outer-systems.js and js/interstellar-asteroids.js is now dt-scaled (`_osDt()`); they stepped per frame while Sol's planets are dt-scaled, so under uneven frame times only these hopped — the likeliest cause of what Ben sees.
23. "The SOS signal arrow was good. we can bring that back." → LANDED 20261010l (integrator): the DISTRESS edge arrow + reticle (`updateDistressIndicator`, js/game-ui.js) still exist in every build but only tracked trading ships with `distressActive` within `DISTRESS_DETECTION_RANGE` 5,000 — tiny in the 1.85× universe (Sol alone is 26k across) and blind to civilian-combat distress calls, caravans under attack and the campaign's relief convoy. Now one picker over every distress source within `HY_SOS.RANGE` (12,000 × `_hyU()`).
24. "The Universal view should show more relevant information" → package W (map2), wave 3.
25. "what are the red dashed orbit lines? I don't think we want them" → they were the campaign's guide lines to the nearest Martian pirate (0xff5533) and to the pirate flagship (0xff3311), drawn by package O with the discovery-path dashed renderer. REMOVED 20261010m: no guide line during SOL_PIRATES / SOL_BOSS (Mission Control text only); the first dotted line is the white one to Sgr A* after the flagship, as the spec says.
8. "deloy sub agents to work on 1 Building Game Progression 2 Black Hole Systems placements 3 Enemies and Bosses placement and behavior 4 Planet Scales and placements (all planets should be similar in size to nebula planets) universe may need to be bigger to space things out." → packages O, Q, R, N. "deploy subagents for all original tasks also."

### Ben's campaign spec (verbatim, 2026-10-10) — package O (progression)

> Okay, when the game starts, you are battling Martian pirates in the local Sol galaxy system, which has Earth and Jupiter and Mars, etc. And after defeating the Martian enemies in your local system you fight their boss. If you defeat their boss a dotted line appears pointing to Sagittarius A and the player should be instructed to then proceed to the black holes where the Vulcan enemies are and defeat them as well. Once those enemies are defeated you have liberated that system and a dotted line appears leading to a nearby nebula for the player to follow. At this point the black holes open for warping anywhere in the game (until then it just warps back to the Sagittarius A region). After visiting a nebula and acquiring a wingman a mission for the player opens up and a dotted line leading from that nebula to a remote location where a host of enemies awaits. The enemies could be swarming a civilian fleet or harassing a planet. The enemies should be the same ones being spoken about in the lore of the nebula where you unlocked the mission. Upon defeating these enemies you save the nebula. You are then ordered to take out the rest of that faction's forces at one of the other Black Hole galaxies. Black Hole Guardians appear once all the standard enemies are cleared, and only after defeating the guardians is that galaxy cleared. Players should receive progressive power ups and incentives as well as additional weapons. Once all 8 black hole galaxies are cleared the player wins the game. Optional missions include fighting the Borg and saving trading vessels. The more nebulas you visit the more wingmen you can get, which is important for taking on some of the harder Black Hole enemies. Gravitational Slingshots should play a big role in getting from the Sol System to Sagittarius A. Player should be bound by gravity to SOL and should not be able to fly to Sag A without using slingshot.

### Packages N–T (2026-10-10)

| key | package | wave |
|---|---|---|
| scale2 | N — planet scale: every planet sized like the nebula planets; universe spaced out — **MERGED 20261010k** (band 240-620, Sun 650, Sol edge 26,451, UNIVERSE_K 1.85, guard 9/9) | 1 |
| progression | O — the campaign above (`progression: campaign`) — **MERGED 20261010k** (js/progression.js; walked to VICTORY; tether + warp gate driven live; not yet played end to end with real fights) | 1 |
| navwarp | P — player O-warp arrives and parks like the demo (`navWarp: on`) — **MERGED 20261010k** (parks 1.0× stand on planet/giant/star, 5.67 R on Sgr A*, 10-15 s) | 1 |
| bhplace | Q — black hole system placements — **MERGED 20261010m** (galaxies as compact places, cores 152-184k from Sgr A*, table = real cores, radius-aware warp exits) | 2 |
| enemies2 | R — enemies and bosses: placement and behaviour — **MERGED 20261010m** (48 Sol pirates at stations, Vulcans ringing Sgr A*, bosses clear of bodies, real guardians + mission hosts, telegraphs; opening fight is hot: idle player dies ~55 s — tune HY_ENEMIES.SOL_START_AHEAD / start stations) | 2 |
| nebula2 | S — nebulae clearly visible (ORIGINAL swirl inside the overhaul cloud) — **MERGED 20261010m** (+ harbours: traffic and ~626 junk pieces per nebula) | 2 |

Guard flake, root-caused (integrator, 20261010m): keep-check rows 1-4 failed together about 1 run in 2 after wave 2. The slingshot check staged its whip 0.6 × range from the SMALLEST nebula world; since package N that world's moons (40-150 u) orbit through the arc, so some runs whipped into a moon (velocity 80 → 0.4 in a second) and every later check failed on the stunned ship. keep-check now picks the smallest world with no other body inside 2.5 × its slingshot range, and sets `window.__campaignTetherOff` (the guard tests KEEP physics independent of the campaign).

Demo showcase (integrator, 20261010m): with 48 pirates at Sol the demo never left Sol (150 s soaks: 0 O-warps, 0 parks). `HY_DEMO` in js/autopilot.js caps the opening fight at 6 kills or 75 s, then the showcase makes for the nebulae.
| warpfx | T — warp colours by sector (`warpTint: sector`) + Sol orbit lines from the start + regional haze (`haze: regional`) — **MERGED 20261010n** (Sol gold/lime, nebula/galaxy hues, black holes violet; 8 Sol rings from frame one, wider + 1-px edge; HY_HAZE recolours only, cull unchanged) | 3 |
| sun | U — the local Sun as a bright burning star emitting light (`sun: burning`) — **MERGED 20261010n** (HY_SUN: white-gold disc, corona, glare, streak, light to Sol's edge ×1.65; foreign Dune star lights capped — they were lighting Sol's night sides) | 3 |
| outer | V — outer systems makeover, much further away (`outerSystems: frontier`) — **MERGED 20261010n** (HY_OUTER: 28 frontier systems 313-360k from Sgr A*, themed, stars emit light, dt-scaled, Borg cube no longer teleports; nav DESTINATIONS list the two nearest; map shows them on the rim until map2 raises universeRadius) | 3 |
| map2 | W — the map's Universal View shows relevant information — **MERGED 20261010o** (tactical chart: objective marker + dotted line + distance, cores in faction colour with cleared state, nebulae charted ticks, frontier/Borg glyphs, SOS dots, wingmen, hostile ticks, labelled range rings 50k/150k/350k, zone caption; `HY_UNIMAP`) | 3b |
| guardflake | X — the keep-check slingshot flake — **MERGED 20261010o, ROOT-CAUSED**: a full-sweep release launched along 0.65×aim + 0.35×tangent, which on 240-620 u worlds passes 0.58 R from the centre → PLANETARY IMPACT 120 ms into the ramp (on the old ~70 u worlds it grazed at ~1.0 R). `_whipClearLaunch` (HY_WHIP_EXIT.CLEAR_K) bends the launch the least that clears the periapsis floor. Second cause under it: the demo's universe boundary was a fixed 140k (now × _hyU) and braked the park check. Guard: rows 1/2/4 13/13, park 7/7 after; visuals threshold lowered to 6 under subtle fx | 3b |

**All packages N–X are merged (20261010o).**

## Round 4 (Ben, verbatim, 2026-10-11) — after the N–X merge

1. "what happened to all the other planets and black hole systems? All the beautiful large planets are gone. The Sun looks great but some extra graphical errors. Outer systems are so large but with no planets. How is the universe organized?" / "look at all the orbit lines without planets" / "if the rings can fade as well perhaps that would work. We can keep them visible and not use distance culling" → LANDED 20261010q: measured 1 of 567 big bodies drawn from the start; `AERIAL_SIZE_FADE/FULL` 0.012/0.045 → 0.003/0.010 rad (162 drawn); fog 101-240k → 222-435k so the relaid galaxies (140-210k) read; non-Sol orbit rings fade with their planet's aerial factor (`HY_ORBIT_FADE`), never culled; frontier systems 4-6 planets, corona 2.0×. The frontier's giant dim ball is the supernova-remnant shell (theme signature) — still to shrink.
2. "what are all these giant white dots?" → the distance cull's IMPOSTOR tier (one soft sprite per culled world, sized by its pixel radius): with 566 big worlds culled and worlds 3× larger the sky filled with 10-25 px dots. Most are real planets again since 20261010q; the rest are far bodies below 0.003 rad. Confirm on build r.
3. "found a distant system and did like the distance culling, but needs warps to last longer to reach them. the wingmen animation still jumps like crazy during a warp use" → LANDED 20261010r: nav-warp burns up to 60 s at 60 u/frame (`HY_NAVWARP.BURN_MAX_MS / SPEED_MAX`, was 25 s / 45); the plain O-warp stays 8 s / 15 u/frame (the guard's warp row expects it to end within 12 s). Wingmen: the ally tick runs before the physics moves the camera, so riding last frame's displacement left each wingman one frame of carrier motion behind, and every change of frame length showed as a 15 u hop (measured: camera-space z toggling by exactly v × dtF); they now ride this frame's velocity × dt and are drawn where the tick put them (no one-tick-behind glide at warp). Measured through a warp: median 0.5 u/frame relative motion, max 2.6 (was 13.9 / 29).
4. "still seeing a lot of green orbit lines with no planets around" → LANDED 20261010r: green = the gateway's "local" systems (Arrakis, Giedi Prime, Caladan), which were exempt from the fade with Sol's; now only Sol's own rings are exempt.
5. "blue orbit lines and planets look great - local orbit lines look great" (on 20261010q).
6. "black holes need to be visible from far away. they can be black from a distance and the glowing effects around them can fade up on approach" → LANDED 20261010s: galactic cores are never range-culled (the HY_BH ramp keeps disc and aurora dark beyond RAMP_FAR 40 radii); also fixed `_aerialFactor` leaving a stale cull score on non-planets. Measured: the nearest foreign core visible from 140k (was `_distCulled` at 142-208k).
8. "Player starting position should be in orbit above earth, facing Sagittarius A." → LANDED 20261010t: `_hyStartPoint()` (HY_START, js/game-objects.js) — 2.3 Earth radii above Earth's orbital plane, 0.6 radii toward Sgr A*, nose on Sgr A*, carrying Earth's orbital velocity (1.15 u/frame; the ship's coast decays it to the 0.4 floor, so Earth slowly drifts off, as in ORIGINAL). Earth's position is computed from the orbit clock, because at hand-off the mesh may still be at its build position (measured 8,700 u off). Wingman Alpha, the pirate opening groups and the vista camera read the same point. Measured: 2.33 R, 922 above, Sgr A* 0.2° off the nose. HY_SOL.START stays as the LAYOUT's reserved start radius only.
9. "can mercury and venus be smaller and can the local system orbits be 2x what they currently are? Sag A may need to be located out a little further from Sol? make sure all the moons are orbiting their planets, and that all planets are following their orbit rings and have glowing stars at their centers. Make sure enemies are present at all black hole galaxies and nebula mission sites. Make sure the path of discovery makes dotted lines that lead to enemies to engage." → LANDED 20261010t: Mercury 170 / Venus 290 (were 250 / 380); `HY_SOL.ORBIT_MULT` 2.0 (orbits, belt lane and edge ×2: edge 52,118; Sol sits 73k from Sgr A*, was 39k — `HY_SCALE.SOL_SGR_GAP` 6000); every system star gets an additive glow sprite (`HY_STAR_GLOW`, 10 of 40 sampled stars had any glow). Verified by `.critic/probe-verify.js` + `probe-mission.js`: 615/615 moons orbiting their planets (0 static, 0 off-orbit), 421/421 planets on their rings, 76/76 system centres have a star, enemies at every core (12-59 within 40 radii), the nebula mission's host (7-9 raiders) sits 506 u from the end of its dotted line.
10. "lets put pirates in each of the nebula systems that are harassing the locals when you arrive so you have to clear them as well. the wingman you acquire should be there already fighting the pirates when you arrive and he joins you once you eliminate the pirates. there should only be about 5 pirates per nebula." + "the nebula mission path of discovery opens up once the enemies are defeated as well. It should lead from that nebula to the location of the remaining patrolling enemies of that faction somewhere out in space." → LANDED 20261010u: `guardTick` in js/progression.js (NEB_GUARD: 6 asked ≈ 5 spawned, ARRIVE_K 2.2): on first arrival a nebula spawns raiders of its lore faction beside its biggest world (`spawnMissionHost('planet')`) and its recruit as a PENDING wingman (`recruitNebulaWingman(name, pos, {pending:true})` — holds its post, engages threats, never follows or reunites until released); when the raiders are dead the recruit joins (hail, flash) and NEBULA_VISIT completes → NEBULA_MISSION draws the line from that nebula to the faction's host out in space (unchanged). Discovery no longer recruits under the campaign; the roster starts at index 1 (no second "Wingman Gamma"); proximity (0.6 × size for 2 s) counts as a visit. Measured: 5 raiders, pending recruit engaged 373 u from the cloud centre, released to patrol after the kills.
11. "Can we target a destination before a whip? Can the demo player do that?" → yes, already: the whip's release aims at the selected nav target (`_aim` in executeSlingshot; the nose only when none is set), and the demo sets `gameState.currentTarget` to its destination before `triggerSlingshot()`.
12. "The demo player needs to clear the SOL system and then use a gravitational slingshot to get to Sagittarius A before proceeding with Nebula missions and clearing other black hole galaxies." → IN PROGRESS (package Y `democampaign`, scripts/hybrid-wave.workflow.js): the demo follows `window.__campaign.state` instead of the HY_DEMO Sol budget (Sol pirates → flagship → gravity whip to Sgr A* → Vulcans → the campaign's nebula with its guards → mission line → faction galaxy + guardians); showcase sequence kept as the fallback without the campaign.
7. "get rid of space junk it is not as cool as we hoped. Use asteroids instead" → LANDED 20261010s: `_hyNebAsteroids` (HY_NEB_ROCKS) — ORIGINAL belt rocks via the instancer (shootable proxies): two rings round the nebula's biggest worlds (2.4-3.6 R, 26-40 rocks each, built once the worlds exist) + one loose field across the cloud (30-44); `_hyNebJunk` kept, unused. The frontier's supernova remnant shell shrunk (filaments 1.5-2.6 R, shock R × 1.9; was 2.4-5 / 3.2) — it swallowed the system from 9k.

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
