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

Each package lands on its own branch off the hybrid base and is merged by the integrator.
