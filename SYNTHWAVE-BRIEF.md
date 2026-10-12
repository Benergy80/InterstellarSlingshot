# SYNTHWAVE — the retro-vector arcade pass (branch `claude/synthwave`)

Served for Ben at **http://localhost:8805/** (`node scripts/serve.mjs 8805 <this dir>`), watched in a
Claude-controlled Chrome tab that is reloaded after every wave. Worktree:
`~/InterstellarSlingshot/.claude/worktrees/synthwave`. Base: the hybrid branch
(`claude/star-explorer-hybrid`, merged in regularly — its gameplay fixes keep flowing here).

## Ben's goal (verbatim, 2026-10-11, `/goal`)
"The game is meant to be a Synthwave Retrowave Vaporwave Gravity Based Space Explorer with elements
reminiscent of the 3D Vector graphic arcade games of the late 80's and also the aesthetic of PewPew,
PewPew 2, and PewPew Live. I have these applications in my applications folder on this computer. Use
REI tools to investigate the PewPew applications and do additional research on the retrowave and
cyberpunk aesthetic to help me come up with better menu UI and Mission Failed screen ideas as well as
more effects that would blend this amazing space world with the neon aesthetic of classic vector
synthwave games. This amalgamated aesthetic is the heart of Interstellar Slingshot and it is already
very good. Research and show me ways we can improve and recreate any elements in the current game that
do not reflect this intention. Can the intro screens or launch sequence be improved? Can we choose from
multiple branches on the intro screen? Can the game be made to be more arcade like? Build this new
version in a new branch and open it in a new window so I can watch the game development. Explore if
you can improve character models and anything you like in this version, just make sure you update the
claude controlled tab often with the most recent changes. Keep waves small and check in's often, but
deploy other agents as needed."

### Ben's direction notes (verbatim)
- "research the best neon synthwave retrowave cyberpunk aesthetics on the internet and in gaming and
  add that info to the special branch goal research" → `research/aesthetics.md` (+ the canon section
  in `research/retrowave.md`).
- "PewPew series was a good example of effects but not UI so much, we need something modern that also
  has the retro aesthetic but with modern polish." → UI = modern polish (type hierarchy, easing, layered
  glass + neon accents, readable), PewPew only for effects (line debris, spawn-in, glow, grid).
- "I like the Mission failed screen in 8805 but it needs mountains being generated like beat lines
  horizontally so it makes crazy alien landscapes. It is a little too miami and needs to be otherworldly
  while matching the font look and feel of the rest of the game UI - which could evolve as well." →
  W1b (20261012g): `SW_LAND` landscape — 30 rows of horizontal beat lines displaced by 3-octave value
  noise (taller toward the viewer), drawn far-to-near with a dark fill below each ridge (occlusion), a
  centre valley (VALLEY 0.8 / VALLEY_W 0.2) so the tally and CONTINUE sit on a plain, an eclipsed black
  hole with a pulsing bright rim instead of the striped sun; palette violet (far) → cyan → mint (near),
  CONTINUE and the button moved off magenta. Fonts unchanged (Orbitron titles, Rajdhani body). Gotcha
  hit on the way: the rows must be painted far→near or the far rows' fills wipe the near ridges.

## Research (`research/`)
- `retrowave.md` — menu UI patterns, Mission Failed concepts, Three.js r128 effects (the bloom recipe:
  half-float target, neon ×3, threshold ≥ 1), fonts, arcade feel, vector ship ideas; section 7 = the
  aesthetic canon (Outrun / synthwave / cyberpunk / vaporwave split, film + game references, rules).
- `pewpew.md` — the PewPew apps' DNA from their own Lua/shaders (black ground, white meshes tinted per
  enemy with exact hex, line-quad glow + 4-tap bloom pyramid, CRT pass, spawn-in and line-debris
  explosion timings, spring grid, vector glyph text, death screens). Shots in `research/pewpew-shots/`.
- `aesthetics.md` — the canon + style rules + what to avoid + surface-by-surface mapping (agent report).

## Switches (js/hybrid-config.js, this branch)
`deathScreen: synthwave | original` · `postFx: bloom | off` · `vectorShips: edges | off`
(the hybrid's switches all still apply; `?hy=key:value` overrides for a session).

## Refreshed from the hybrid (2026-10-12, build 20261012y, HEAD b3e7a34)

Ben moved the day's work to the hybrid branch (8803: "8803 is so perfect"); this branch now carries all of it, merged in
on top of W1 + W2: the arcade MISSION FAILED (its own), the AAA launch title as the DEFAULT (`titleScreen: launch`,
js/title-launch.js: Earth at dawn, legible glass menu, countdown + lift-off inside the scene) with an ON-SCREEN CHOOSER
for the intro branches (menu row TITLE SCREEN ‹ › and a pill on the chrome / landscape / poster sketches — ← → cycles,
persists, reloads), Ben's new player / boss / fighter / UFO hulls (slimmed, posed, lit by the hull light rig, plumes on
their nozzles, faction light elements), bosses 3x harder with evades and telegraphed attack patterns
(`bossDifficulty: hard`), the far-side start across the Sun from Sgr A*, the fill light, plus this branch's own
`postFx: bloom` and `vectorShips: edges` kept on, and the arcade layer (`arcadeFeel: on`: score / combo strip, streak
call-outs with stings, pooled pop-ups, high score on the title / pause / tally, the pause menu in the title's glass
family). Served on :8806 (detached: `nohup node scripts/serve.mjs 8806 <this dir> &`); the Claude-controlled tab opens
here. W3-W5 are closed by that work (see the table) — the hybrid's HYBRID-BRIEF.md Round 5 is the detailed ledger.

## Waves
| Wave | What | Status |
|---|---|---|
| W1 | MISSION FAILED as an arcade sequence: freeze-through overlay, RGB-split glitch, scanlines, scrolling neon grid + striped sun (2D canvas), chrome title slam, stat tally with blips, CONTINUE? 9→0, GAME OVER + INSERT COIN, any key restarts (`js/synthwave-fx.js`, `css/synthwave.css`) | done 20261011p |
| W2 | EffectComposer with HDR-threshold bloom (only emissive > threshold glows: ship edge lines, lasers ×3); vector edge lines (EdgesGeometry → LineSegments2) on the player, wingmen and the nearest enemies in faction colours (`js/synthwave-post.js`) | done 20261012a, retuned 20261012b (see below) |
| W3 | Intro / launch: neon grid + striped sun behind the title, chrome title, modern-polish menu with BRANCHES (Campaign · Arcade · Free flight · Daily run · Galaxy select), attract loop | DONE via the hybrid (20261012v/x): the launch title IS the modern-polish menu (glass plate, 42 px items, focus bar, keyboard/touch) with BRANCHES on screen — PRESS TO LAUNCH / DEMO MODE / SKIP INTRO plus the TITLE SCREEN chooser (Earth at dawn · chrome · landscape · poster); the striped sun became the rising eclipse over the beat-line range; the attract loop is the 30 s idle drift. Not built: Campaign / Arcade / Free-flight / Daily-run / Galaxy-select as separate game modes (the game has one campaign). |
| W4 | Arcade feel in play: combo + grade display (js/arcade.js already tracks it), kill call-outs, boss WARNING card, high-score initials | DONE via the hybrid (20261012x, package AK): combo + score strip, kill call-outs with stings, pop-ups, high score (no initials entry; the boss WARNING card exists from the boss set-piece / name card). |
| W5 | Vector ship models: fresnel rim via onBeforeCompile, faction style grammar, vector break-apart death | SUPERSEDED: Ben supplied his own textured hulls (player, 8 bosses, 8 fighters, UFO), now lit by the per-pixel hull light rig with a faction fresnel rim; this branch keeps `vectorShips: edges` (W2) over them; the vector break-apart death exists as the boss set-piece's wire-shard debris. |

## Measurements
- W1: headless death at 6 s → overlay at 11 s (after the ship's own death animation), tally, CONTINUE 7 at 16 s,
  GAME OVER + INSERT COIN at 27 s, 0 errors (`.critic/probe-gameover.js`).
- W2 first cut (strength 0.8, threshold 1.0, half-res mips): composer on, half-float OK, player + 3 wingmen
  edged (4 line materials), but the whole frame went grey. Root cause (20261012c): the renderer runs ACES
  filmic tone mapping inside the materials, so the buffer is already tone-mapped and the bloom pass's screen
  blit (a MeshBasicMaterial) tone-mapped it AGAIN — a double ACES is a grey wash; not the bloom, not the
  encoding (the renderer's output is linear). Fix: `bloom.basic.toneMapped = false`; the neon materials (edge
  LineMaterial, lasers) are `toneMapped = false` so their ×3 colour stays over the threshold. Sweep of
  (0.5/0.35/1.35, 0.45/0.3/2.2, 0.35/0.3/3.0) → 0.45 / 0.3 / 2.2: plain-render contrast back, neon edges glow,
  stars do not. Quarter-res mips; composer only in the `normal` quality tier with a 60 s cool-down after a tier
  drop. Cost on this headless GPU is unreadable while agent Chromes share it (30 fps either way in those
  windows; one clean window read 60 fps / 16.7 ms with the composer on) — re-measure alone.
- Ben, 2026-10-11, on :8805: "so far the new branch is not looking great and we will likely abandon it
  because 8803 is so perfect. however we will give it some time". Plan: finish this W2 tune, then pause;
  W1 (Mission Failed) and the edge lines are switchable and cherry-pick cleanly to the hybrid if wanted.
