# PewPew / PewPew Live: aesthetic DNA (reverse-engineered 2026-10-11)

Targets: `/Applications/PewPew Live.app` (com.jyaif.pewpewlive v0.9.258, (c) J-F Geyelin 2024) and `/Applications/PewPew.app` (com.jyaif.PewPew v2.0.5, (c)2016, first released 2009). The installed "PewPew" is **PewPew 1**: its title screen shows a "3x the fun in PewPew 2!" banner (shot `pp2-01-launch.png`). PewPew 2 is not installed, so PewPew 2 evidence is limited to upsell strings ("PewPew 2 is about MORE ...").

**Evidence keys.** [L:path] = a Lua or GLSL file extracted from the PPL binary. [S] = a binary string (`strings`). [P1] = a PewPew 1 binary string. [shot] = a screenshot in `/tmp/pewpew-shots/` (temporary; move it to keep it).

**How the files were recovered.**
- PPL keeps its whole VFS (498 files: Lua meshes, levels, GLSL, jfxr sounds, replays) inside `__TEXT,__const`, **XOR-obfuscated with 0xAA**. The name table is a `char*` array at file offset 0x57d650; the {ptr,size} pairs start at 0x57e5e0. Only 4 KB of the Mach-O is FairPlay-encrypted. Extracted to `/tmp/ppl_extract/files/` by `/tmp/ppl_scripts/extract.py`.
- PewPew 1 stores its Lua 5.1 and GLSL as plain text in `__cstring`.
- REA: `open_binary` worked. `observe_native_ui` timed out three times (its xcrun Swift helper hits a 60 s limit). `search_strings` timed out (330 s). `inspect_asset_catalog` rejected the target. I fell back to otool, strings, assetutil and `screencapture -l`, and drove the apps with keystrokes and synthetic clicks.

## 1. Colour palette
- **Background:** pure black. Launch colour is sRGB (0,0,0,1) [assetutil Assets.car `SplashScreenColor`]. PPL measures ~#010101 because of ±1/256 animated dither noise [L:shaders/opengl_es_2/texture/space_dither.inc]. Optional `BACKGROUND_COLOR_R/G/B` and a "Background hue" setting [S]. PewPew 1 measures #000000 [shot pp2-01].
- **Lines are white by default and tinted at runtime.** 849 of about 1,300 colour literals in the mesh Lua are `0xffffffff`. The final colour is vertex colour × `u_color` (`v_color = a_color.abgr * u_color.abgr`) [L:mesh/regular_line.vsh]. Colours are `0xRRGGBBAA`.
- **Depth and secondary detail use white at low alpha:** `ffffff54/80/40/20/10`. The background grid is `0xffffff15` (8%) [L:graphics/background/grid_plane.lua]. Menu squares are `0xFFFFFF10` (6%) [L:graphics/background/square.lua].
- **Saturated primaries**, by count: `ff0000` 51, `ffff00` 34, `00ffff` 26, `00ff00` 22, `ffaa00` 19, `ff8000` 11, then `0000ff 0080ff ff00ff ff0080 22ffaa 11aaff aa10ff` [grep over L:graphics, L:levels].
- **PPL logo (synthwave core):** per-vertex colours `#ff0030` red, `#ff5080` pink, `#00aaaa` teal, `#00ffff` cyan, `#ffffff` [L:graphics/ui/logo.lua]. Rendered as outline letters running cyan at the top to pink-red at the bottom, with white cores. Many stacked copies recede in z toward a vanishing point (a chrome-extrusion look). Measured: top #7efbfd, bottom bloom #f3b3eb [shot ppl-07-logo.png].
- **Enemy colours** (the game's own inline-colour strings, which are exact) [S]:

  | Enemy | Colour |
  |---|---|
  | BAF red / blue | #ff0000 / #40a0ff |
  | Brownian, Inertiac | #ee7615 |
  | Dodger | #184aff |
  | Exploder small / normal / large | #ff5010 / #ff2020 / #ff1060 |
  | Kamikaze | #00ffff |
  | Mothership pink / red / orange / green / cyan | #ff2986 / #ff0000 / #ff6000 / #00ff00 / #00ffc8 |
  | Rolling Sphere, UFO | #ff0000 |
  | Splitter | #f00033 |
  | Wary | #880088 |
  | Rolling Cube | #ffff00 in one list, #ee7615 in the other |
  | Crowder (rainbow, per letter) | #ff0000 #7c007c #621bfe #02ebea #00e804 #f1f200 #f77701 |

  Asteroids are white. The yellow BAF is described as a "yellow, arrow-shaped drone" [S] and appears yellow in [shot ppl-13].
- **Medals / difficulty:** Bronze `#ff8000`, Silver `#ffffff` at alpha `aa`, Gold `#ffff00`. "hard" `#ffff00`, "delirious" `#ff0000` [S].
- **Player ship "alpha":** yellow `ffff00` hull with orange `ffaa00` wings. Variants are white/red and green/`00ff80` [L:graphics/player_ships/alpha.lua]. The default ship renders yellow in play [shot ppl-13].
- **UI chrome:** outline colour comes from the "UI Color" setting (Black, Blue, Cyan, DarkBlue, Gray, Green, Pink, Red, Teal, Yellow, Lime, LimeGreen, Orange, Purple, White) [S]; it is red on this install [shots]. The selected item turns white. Taglines are green, written as code comments `/* ... */` [shot ppl-05]. The Game-Over band lines measure #eb493c over a #160605 fill [shot ppl-04].
- **PewPew 1:** HUD labels magenta (measured #ea33ff) with white values [shot pp2-10]. Title logo yellow (#ffff54) [shot pp2-01]. Buttons are white; the primary button pulses yellow. Mode buttons are green [shot pp2-08]. Source colours: `getColor(255,255,255)` 33×, `(255,255,0)` 22×, `(0,255,0)` 20×, `(255,0,0)` 11×, plus (0,255,230), (0,155,255), (253,183,20) [P1].
- **Glow and bloom, PPL:** lines are expanded into quads with miter joins [L:mesh/compute_offset.vsh] and get a soft alpha edge (`a *= 4*(1-|dir|)` beyond 0.75) [L:mesh/fragment_shader_for_lines_with_aa.fsh]; the binary imports no `glLineWidth` [nm]. Bloom is a dual-filter pyramid: 4-tap diagonal downsample, then 4-tap upsample at offset 0.5. The resolve pass adds `bloom * 0.6 * BLOOM_INTENSITY`, optionally multiplied by a lens-dirt texture [L:texture/bloom_*.fsh].
- **Glow, PewPew 1:** GL_LINES (`glLineWidth`), then a separable 5-tap Gaussian (weights .204164/.304005/.093913 at 0, ±1.4073, ±3.2942 texels) composited as `scene*0.88 + blur` (`TWO_TEXTURES_ADDITIVE_BLENDING`) [P1 shaders].
- **Optional screen filters** (PPL `set_color_filter` mutators [S]): C64 palette (#3e31a2 #555555 #9b51a5 #8a7bce #68ae5c #79c1c8 #a3e599); Game Boy dither (v0 15,40,5 + n×35,40,13); posterize; luma invert; and a **sunset gradient map**: `vec3(1,0.5,(1-|y|)*0.8) - gray` and `vec3(y*0.8,0.05,(1-y)*0.2) + gray`.

## 2. Line-art conventions
- **Mesh format:** `{vertexes={{x,y[,z]}}, segments={{i0,i1,...}}, colors={per-vertex}}`. A segment is a polyline of 0-based indices, closed by repeating the first index [L:graphics/player_ships/alpha.lua, L:helpers/mesh_helpers.lua]. Helpers: `add_line_to_mesh`, `add_horizontal_regular_polygon_to_mesh`, `add_computed_segments_to_mesh`.
- **Scale:** the player ship is about 28×36 units. Vertices carry small z offsets (3–4) so ships look faintly 3D under camera tilt [alpha.lua].
- **Enemies are geometric primitives:** n-gons, tetrahedron, octahedron and icosahedron wireframes, a rolling cube, and stars. The Exploder is 8 rotated arrows plus a 20-gon, with 50-gon rings at r = 110/120 [L:enemies/exploder.lua]. Waves uses a Delaunay-triangulated level mesh [L:helpers/delauney.lua; shot ppl-13].
- **Animation:** a file holds several meshes, used as frames; the mothership pre-bakes 80–160 rotation frames for each 3- to 7-gon [L:enemies/mothership.lua]. Runtime hooks: `add_rotation_to_mesh`, `set_mesh_angle`, `set_mesh_scale`, flipping meshes, interpolation [S]. Music response: `scale_z` 1→7/6 and colour lerp `0xff8080ff`→`0x80ffffff`, used on the Waves border [L:levels/endless/waves/level.lua].
- **Spawn-in:** each segment starts 50 units out along its spawn direction and snaps in at t ≈ 0.5–0.6 s. Alpha ramps 0→1 over 0.5 s while a white-hot additive colour decays [L:mesh/spawning_mesh.vsh]. When a level loads, its lines rush in as long streaks [shot ppl-11].
- **Explosion = line debris (yes):**
  - Segments fly out `(1-(t-1)²)*120` units (ease-out), each spins at its own rate, and alpha fades on `1-smoothstep(.2,1,t)` [L:mesh/exploding_mesh.vsh].
  - Particle bursts are streaks running from head = step·t to tail = step·(4+0.9t) [L:mesh/particle_explosion.vsh].
  - API: `create_explosion(x,y,0xffff00ff,1fx,40)` (colour, scale, count) [L:levels_for_ui/intro/level.lua]. The player-death mesh is a subdivided geodesic hemisphere of radius 300 [L:player_ships/player_explosion.lua]. PewPew 1 adds a radial starburst sprite [data/textures/explode_large.png 256²; shot pp2-burst-17].

## 3. Typography
- **No font files in either bundle.** PPL text is vector glyph meshes drawn by the line shader, so text gets bloom too. Glyph sets: `graphics/characters/{latin,cyrillic,greek,japanese,chinese_simplified,georgian,numbers,symbols,medals}.lua`, plus a precompiled `characters.lua.pplmesh` (216 KB).
- **Glyph geometry:** cell about 16 wide × 19 tall, monoline. Corners are cut with 5-unit 45° chamfers (A = `{0,-1},{0,14},{5,19},{16,19},{16,-1}` plus a bar at y=10). Digits are squared 15×19 boxes in a 7-segment idiom [L:latin.lua, L:numbers.lua].
- **Case and spacing:** mixed case, not all-caps ("Game Over", "Play again"). Letter-spacing is wide, about 0.3 em (estimate from [shot ppl-04]). Titles are about 2× body size [shots ppl-21, ppl-22].
- **Inline colour markup:** `#RRGGBBAA` inside strings, e.g. `#ff8000ffBRONZE#ffffffff` [S].
- **PewPew 1:** vector font from `/data/graphics/fontGraphic.lua` [P1]. Quake-style caret colour codes: `^7` = white/reset; `^x` = green (observed on "You scored"); `^3` = magenta (inferred from the HUD format match).

## 4. UI / menu structure and feel
- **PPL main menu** [shot ppl-07]:
  - Extruded neon logo in the centre, with stacked chamfered buttons "Single Player" / "Multiplayer" and live "Blitz waiting/playing" and "Online rooms" counters below.
  - Icon columns. Left: social, ship config, stats, and "NEW!", whose colour cycles green→magenta→blue [shots ppl-07, ppl-19, ppl-20]. Right: info, feed, account, settings.
  - Background: a faint field of 6%-white squares that drifts and rotates [shots ppl-07 vs ppl-08].
- **Level select** [shot ppl-06]: Official/Community tabs (the active tab has a yellow outline) above a 3×2 card grid. Each card shows the level name in its own colour (Asteroids white, Hexagon cyan, Eskiv green, Waves yellow, Fury orange) plus a dice card for random.
- **Level page** [shots ppl-05, ppl-10]: title in the level colour, a green `/* Euclidean space is overrated */` tagline, a big Play button, "play count / time played / average score", gold/silver/bronze score thresholds, ⚡ speedrun times, a podium (leaderboard) button, local best and world record.
- **Settings** [shots ppl-21, ppl-22, ppl-24]:
  - Top level: Graphics, Controls, Audio, Language, UI, Vibration, Start tutorial, **Launch intro**, Manage local data.
  - Graphics presets: Minimal / Compression friendly / High / Highest.
  - Graphics knobs: Bloom %, Lens dirt, Scanlines (horizontal/grid), Chromatic aberration, Curved monitor %, Vignette %, Resolution, Background deformation.
  - UI page: UI scale and inset, in-game score, floating text, quick pause, UI transition animation.
- **Selection highlight:** red outline turns white, bloom glow appears, and an offset second outline makes a "lifted" bevel. Buttons are chamfered hexagon/trapezoid frames with dark fills and "»" chevrons in the UI colour.
- **Input:** arrows / Return / Esc; mouse hover also selects.
- **Arcade hooks** [S]:
  - Attract intro replays (`replays/intro.replay`, `intro2.replay`). The intro level is 6000×400 with 4 ships and a camera dolly.
  - Medals plus speedrun medals, leaderboards, XP, quests, achievements, 32-player "Blitz".
  - "Insert coin to continue", "Continuing in %s seconds".
- **PewPew 1 flow** [shots pp2-07 → pp2-16]:
  - Title: wobbly yellow logo with a white diagonal shine band sweeping across the letters (`distance=abs(v_color.r-x+y*.5); white if <10`) [P1; shot pp2-04]. Buttons: About / Play / Settings / Tutorial / Music On.
  - Then a tutorial nag, then Select Game Mode / Select Ship (with medal counts), then a green-framed mode grid (Pandemonium, Dodge this, Assault, Asteroids, Chromatic Conflict).
  - Mode page: thresholds, Go online / Start / Upload, and a local-score table whose rows squash in perspective, each with a ▷ replay button.
  - Loading quips: "reticulating splines", "charging flux capacitor", "SENTIENT PROCESS DISCOVERED" [P1].

## 5. Death / game-over presentation
- **PPL death:** the ship bursts into yellow-orange line shards, and **"Ouch x2"** is stamped in giant red vector type at the death point. What the count means is a guess (deaths in a row) [shot ppl-02]. The world keeps simulating underneath, the HUD stays up, and "Shield: 0" turns red.
- **PPL Game Over overlay** [shots ppl-02, ppl-04, ppl-15]:
  - A full-width band between two red rule lines, with "Game Over" in white.
  - Buttons: **Play again** (preselected), a replay icon button, and **Exit**. Esc does nothing here.
  - A bottom stats band: `Total score: 1231  Duration: 0:10.16` / `Pointonium: 256  Accuracy: 74.26% (75/101)`.
  - Death to overlay took no more than about 4 s (sampling interval; not measured exactly).
  - Other result strings [S]: "You died. Again.", "You tried", "It's okay, you were never going to win anyway.", "New personal best! %s", "New World Record", "New gold medal", "Improved speed run! %s", "Quick Restart: %s".
- **PewPew 1:**
  - Each hit shows a big cyan **"OUCH"**, the camera tilts (grid rotates in perspective), and a life is lost [shots pp2-burst-24, pp2-burst-26]. Strings also include "OUCH x4/x5" and "YIKES" [P1].
  - The final death cuts to a full-screen results page [shot pp2-13]: "You scored : 420" (big, green), `Scored saved as " PewPew fan "` (name in yellow), and buttons Edit name / **Play again!** (large, green) / Back. Medal note: "PS: You got the bronze medal!" [P1].

## 6. HUD during play
- **PPL:**
  - Top-left: "Shield: N", colour-coded green at 3 (measured #387d25), olive/yellow at 1, red at 0 [shots ppl-11, ppl-01, ppl-02].
  - Top-centre: a pause button (UI-colour square with ‖).
  - Top-right: `<name>: <score> △x<n>`, white text plus the green △xN kill-rate indicator for Pointonium [S "...as shown by the %s indicator"].
  - Green floating "+20" popups at kills [shot ppl-14]. Touch-joystick rings in yellow `0xffff00aa` [L:waves/level.lua].
  - Levels can add a line with `configure_player_hud{top_left_line=...}` [L:world/world.lua].
- **PewPew 1:** `setHudString1` top-left "Score:" + value; `setHudString2` top-right "Shield:N  Lives:N"; magenta labels with white values [P1; shot pp2-10]. Floating texts: "Shield +1" (245,255,0), "Got it!" cyan, "Good" red [P1].

## 7. Effects
- **CRT stack** (PPL resolve shader) [L:texture/bloom_resolve.fsh]:
  - Scanlines dim every 4th row to 66%, or a grid variant.
  - Vignette `(25·uv.x(1-uv.x)uv.y(1-uv.y))^(0.3·I)`. Barrel curve with curvature x = I/8, y = I/4.
  - Chromatic aberration at 0.0045·(uv-.5), or a 4-tap spectral variant.
  - Row-band UV glitch: 20 px bands jump sideways when rnd < 0.1. Plus dither.
- **Background deformation (Geometry-Wars style):** a GPU spring field. Force splats push it; springs pull toward neighbours with weight 0.23, damping 0.9025, step 0.821. Deformable line meshes sample the displacement [L:deformation/spring.fsh, force_splat.fsh, mesh/regular_line_deformable.vsh].
- **Grid:** `grid_plane.lua` (±1000, 100-unit pitch, 8% white). Grid lines scatter in when a level starts [L:mesh/regular_line_with_grid.vsh].
- **Trails:** cool_s, heart, peace, plus, radioactive, smiley, square, star; line, double line, diamond particles, fracture [L:graphics/player_ships/trails, L:graphics/ui/trail_*].
- **Camera:** `camera_distance` per level (Waves −40, intro animates 990→), `camera_x/y_override`, and `camera_rotation_x_axis` to tilt the playfield [L, S].
- **No screen shake in PPL:** no "shake" string exists. PewPew 1 uses haptics (`pewpew.vibrate`) and the hit-tilt [P1; shot].
- **PewPew 1 renderers:** 1 Glow, 2 Standard, 3 "1989" (Game Boy LCD: palette #193e0a→#95b632 in 5 steps, plus a pixel grid), 4 Side-by-Side stereo, 5 **Anaglyph 3D** (red/blue), 6 chunky-pixel CRT. The CRT label is inferred from the string list [shots pp2-renderer-2, pp2-renderer-6, pp2-renderer-5of6, pp2-renderer-6of6].

## 8. Sound character
- **PPL SFX are all procedural jfxr presets** (sfxr-like; URLs `https://pewpew.live/jfxr/index.html#{json}`) [L:sounds/*.lua].
  - Waveforms: whistle, sine, square, sawtooth, triangle, tangent, breaker, brown and pink noise. bitCrush 16.
  - Player shot "Laser/shoot 4": sine, 3222 Hz, sweep −1900, sustain 0.07 s, decay 0.034 s.
  - Death "Explosion 1": tangent, 4000 Hz, sustain 0.18 s, decay 0.26 s, 24 Hz tremolo, high-pass 2800.
- **Music:** PPL ships three CAF/AAC tracks (`0.aac`/`1.aac`/`2.aac`, 0.5–0.8 MB each; afinfo could not open them). PewPew 1 has `data/music/pewpew2ost.mp3` (167 s, stereo 44.1 kHz). I did not listen to the music, so its genre is unverified.
- **PewPew 1 SFX:** 68 sampled `.caf` files, 16-bit mono 44.1 kHz (e.g. `fire_jf.caf` 0.118 s). They include voice and joke samples (wilhelm, woohoo, gogogo, over_here, yes, danger), kalimba1–4, gong, drum roll [data/sounds; SoundMapEnum.txt].

## 9. Asset files found
- **PPL bundle** (`Wrapper/pewpew-live.app/`): `pewpew-live` (arm64), `0.aac 1.aac 2.aac`, `Assets.car` (AppIcon, SplashScreenColor, SplashScreenShip), `Info.plist`. The embedded VFS (extracted) holds:
  - `graphics/` – 37 player ships, about 35 enemies, UI icons, backgrounds, weapons, characters.
  - `levels/endless/` – amalgam, asteroids, ceasefire, eskiv, fury, hexagon, oasis, pandemonium, partition, rave1, symbiosis1, torque, waves.
  - `levels/world/` (deviation bosses) and `levels/levels_for_ui/` (intro, tutorials, sandbox, encyclopedia, blitz).
  - `shaders/opengl_es_2/{mesh,texture,deformation}/*.vsh|.fsh` plus `space_dither.inc` (28 files).
  - `sounds/*.lua` (49 jfxr), `replays/intro*.replay`, `levels/world/world_data.bin`, two `.pplmesh`.
- **PewPew 1 bundle** (`Wrapper/PewPew.app/`): `PewPew`, `data/music/pewpew2ost.mp3`, `data/sounds/*.caf` (68), `data/textures/explode_large.png` (256²), `explode_small.png`/`.pgm` (128²), `generateCFileFromImage.py`, `SoundMapEnum.txt`, `SoundMapFilenames.txt`, plus 234 embedded `/data/...` Lua paths (`fontGraphic.lua`, `shipGraphic.lua`, `grid.lua`, `levels/infinity/*`, `campaign0-2/*`) and inline GLSL.
- **Screenshots** (`/tmp/pewpew-shots/`):
  - PPL: `ppl-07.png` + `ppl-07-logo.png` (title/menu), `ppl-06.png` + `ppl-09.png` (level select), `ppl-05.png` + `ppl-10-waves-detail.png` (level page), `ppl-01-launch.png` / `ppl-11-waves-t0.png` / `ppl-13-waves-t4.png` / `ppl-14-waves-t10.png` (play), `ppl-02.png` / `ppl-04.png` / `ppl-15-waves.png` (death and game over), `ppl-21-settings.png` / `ppl-22-graphics.png` / `ppl-24-ui-settings.png`.
  - PewPew 1: `pp2-01-launch.png` / `pp2-04.png` (title, shine sweep), `pp2-08-modeselect.png`, `pp2-09.png`, `pp2-10-play-t0.png` / `pp2-12-play-t9.png` (play), `pp2-burst-17/24/26.png` (hit, OUCH), `pp2-13.png` (results), `pp2-18-settings.png`, `pp2-renderer-*.png`.

## 10. What Interstellar Slingshot should borrow
1. Render every line as a screen-space expanded quad (miter join, ~1.5 pt core, soft AA fringe); keep geometry white and tint it per entity.
2. Bloom as a 4-tap down/up pyramid added at 0.6×intensity, plus lens dirt × bloom; expose a settings slider (PPL default 100%).
3. CRT post pass: every-4th-row scanline at 66%, a vignette, a mild barrel curve and ±1/256 dither, each one toggleable like PPL.
4. Palette: pure black base, 6–8% white grids, saturated primaries, one fixed colour per enemy type (use the PPL table above).
5. Synthwave logo: outline letters with a cyan→pink vertical gradient (#00ffff→#ff0030), white core, z-stacked echo copies.
6. Vector font: 16×19 monoline glyphs with 5-unit 45° chamfers, squared 7-seg digits, wide tracking, inline `#RRGGBBAA` colour.
7. Spawn-in: segments fly 50 u from their spawn direction, white-hot to colour over 0.5 s. Death: segments fly 120 u with ease-out, spin and fade by 1 s.
8. Deformable spring-grid background, kicked by explosions and thrust (0.23 neighbour pull, 0.9025 damping).
9. Death beat: a huge "Ouch xN" stamped in-world, a red Game Over band over the still-running world, Play again preselected, a one-line stats strip.
10. Arcade loop: medal tiers (#ff8000/#ffffffaa/#ffff00), a code-comment tagline per level, attract-mode intro replay, jfxr procedural SFX (it is JS).
