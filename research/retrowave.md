# Retrowave × Vector-Arcade: research for Interstellar Slingshot
_2026-10-11, for the `synthwave` worktree. Items are ranked within each section (1 = do first) and each one is meant to be implementable in Three.js r128 with no bundler. Every pass and line file named here exists as a non-module script at `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/<dir>/<File>.js` (all checked, HTTP 200)._

**What's already in the build (extend it, don't duplicate it).**
- `js/arcade.js` tracks score, `_comboMult`, hitstop, slow-mo and `grade()`. Its `HUD_ENABLED`, `FLOAT_SCORE` and `GRADE_ENABLED` flags are all `false` because they overlapped the HUD.
- `js/visual-flair.js` already has a warp tunnel (#8), a boss letterbox and name card (#10), planet rim shells (#12) and kill text (#13).
- `js/victory-replay.js` keeps a rolling 13 s buffer of ship pose sampled at 10 Hz.
- Death is `triggerPlayerDeath()` in `js/game-physics.js` (~881). It plays booms at 0–1300 ms, waits 2500 ms, then calls `showGameOverScreen()` in `js/game-ui.js` (~6240). That screen is a 0.97-black card with six stat lines and a "Restart Mission" button.
- There's no EffectComposer yet. Fonts loaded today: Orbitron, Rajdhani, Share Tech Mono. The main renderer uses `logarithmicDepthBuffer`.

## 1. Main menu UI patterns
1. **Live 3D backdrop, not a flat panel.** Render the menu over a perspective grid floor plus a striped sun, with the camera on a slow dolly (0.15 units/s is the scroll rate Heckel uses). Blood Dragon and Neon Drive both sell their mood before you press anything. *Why:* the menu becomes your first effects showcase. [Heckel vaporwave scene](https://blog.maximeheckel.com/posts/vaporwave-3d-scene-with-threejs)
2. **Chrome title over a neon script.** Set INTERSTELLAR in Orbitron 900 with a chrome gradient (§4 has the CSS), with "Slingshot" over it in Mr Dafoe, hot pink, rotated −8°, flickering at about 0.3 Hz. *Why:* this is the canonical Outrun/Kung Fury title lockup. [Retro CSS text](https://dev.to/juhanakristian/create-a-retro-text-effect-with-css-4a1j)
3. **Left-aligned vertical list with one huge selected row.** Unselected items: 40% opacity, outline text. Selected item: 1.3× scale, filled bar behind it, chevron `▶`, and a 2 px pink/cyan offset shadow. Let the whole list sway ±2° at 0.5 Hz. *Why:* Hotline Miami's menu reads at a glance over a busy, flickering neon background. [Destructoid HM preview](https://destructoid.com/?p=133589) · [HM logo FX](https://madegooddesigns.com/?p=10818)
4. **Modes as arcade cabinets.** Neon Drive presents each level as its own arcade machine. Use one cabinet per launch branch (§5.10), drawn as wireframe boxes with a CRT screen texture playing that mode's attract loop. [Neon Drive menus](https://cleberg.net/blog/neon-drive.html)
5. **Hover glitch.** On focus, RGB-split the label 2–3 px for 120 ms, then snap clean. Cyberpunk 2077 pairs a scan-line, chromatic-aberration UI with Rajdhani, plus Orbitron as the secondary face, and both are already loaded here. [Fonts In Use: CP2077](https://www.fontsinuse.com/uses/60926/cyberpunk-2077-video-game) · [CP2077 UI critique](https://interfaceingame.com/articles/cyberpunk-2077-ux-ui-critique)
6. **VHS on-screen-display chrome** for pause and load screens: a `PLAY ▶` / `PAUSE ‖` corner, a `SP 0:04:17` timecode, and tracking bars that roll for 400 ms on transitions. Blood Dragon's 4:3 loading screens fake tracking bars and analogue noise. [The Sixth Axis review](https://www.thesixthaxis.com/2013/04/30/far-cry-3-blood-dragon-review-xbla-psn-pc/)
7. **Sound cues through the existing `playSound` synth.** Move = 30 ms square blip at ~1.2 kHz. Confirm = a rising 3-note arpeggio (e.g. C5-E5-G5 at 50 ms each). Back = the same falling. Add a sampled or vocoded "EXCELLENT!" on launch, as Tempest 2000 does on a cheat entry. *Why:* every input gets an audible answer, which is half of the arcade feel. [TCRF Tempest 2000](https://new.tcrf.net/Tempest_2000_(Jaguar))
8. **Headphones card.** Rez's title screen tells you to wear headphones, and Area X is picked straight from the main menu instead of being unlocked. Do the same: one card at boot, plus a direct "secret mode" row. [GodIsAGeek: Rez Infinite](https://godisageek.com/reviews/rez-infinite-review/)
9. **Motion grammar.** Rows enter staggered 40 ms apart, 220 ms each, with `cubic-bezier(.34,1.56,.64,1)` (ease-out-back). The selection bar slides in 120 ms, and the screen exits on a 150 ms glitch. Honour `prefers-reduced-motion` and keep flashes to 3/s or fewer. [WCAG 2.3.1](https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold.html)
10. **Glyph footer:** `◄ ► SELECT · ● LAUNCH · ✕ BACK`, in Share Tech Mono at 12 px with 0.2 em tracking, swapped for touch, keyboard or gamepad glyphs. Polybius and the Minter canon keep the chrome minimal and let the effects carry the screen. [Polybius (2017)](https://en.wikipedia.org/wiki/Polybius_(2017_video_game))

## 2. MISSION FAILED: 8 concepts with timing (t = 0 is the fatal hit)
**Today:** 2.5 s of explosion, then a static black card. Recommended stack: **A → F → E → D**, with **G** as a settings toggle.
- **A. Freeze → slow-mo → tear.** t0: 80 ms hitstop with a 1-frame white flash (`arcade.hitstop`/`flash`). Then time ×0.25 for 900 ms while the camera orbits the wreck. At t0.9 s, ramp RGBShift `amount` from 0 to 0.006 and burst a GlitchPass for 250 ms. At t1.2 s, slam "MISSION FAILED" in (scale 1.6→1.0 over 120 ms, 6 px shake). [Juice it or lose it](https://www.youtube.com/watch?v=Fy0aCDmgnxg) · [Why your death animation sucks](https://www.youtube.com/watch?v=pmSAG51BybY)
- **B. CRT power-down.** Collapse the canvas vertically to a line (175 ms), shrink the line toward the centre (125 ms), turn it into a 6 px glowing dot (100 ms), then hold black (100 ms). Then "SIGNAL LOST" fades in with the Sixtyfour `SCAN` axis animating from −53 to 0. The 500 ms phase split comes from a documented component. [Gamelord CRT animation](https://mintlify.wiki/ryanmagoon/gamelord/components/animations/crt-animation)
- **C. VHS rewind death-cam.** Put up a `◄◄ REWIND` OSD and play the last 3 s of `victory-replay.js`'s buffer backwards at 2× with tracking noise, then freeze on the impact frame and stamp the card on it. Katana Zero wraps death and pause in VHS grain and puts you back almost at once with no load screen. [GamesBeat: Katana Zero](https://gamesbeat.com/katana-zero-is-more-than-swords-and-style/) · [GameGeeker review](https://gamegeeker.com/games/katana-zero-460950/review?market=US)
- **D. Continue countdown 9 → 0.** Huge digits at 1 s each; any press knocks off 1 s. "INSERT COIN" = spend an Emergency Warp or a credit to respawn in place. SNK's *Fantasy* (1981) said "insert coin and press start button within 10 seconds". [Den of Geek: continues](https://www.denofgeek.com/games/the-origins-of-the-video-game-continue-screen) · [TV Tropes](https://www.tvtropes.org/pmwiki/pmwiki.php/Main/ContinueCountdown)
- **E. Score tally plus a rank letter.** Hotline Miami grades on killings, boldness, combo, time, flexibility and mobility. Map those to KILLS / SLINGSHOTS / NEAR-MISSES / MAX COMBO / TIME ALIVE / LY TRAVELLED. Each row counts up over 400 ms with a tick, then the rank stamp lands (scale 3→1, 150 ms, thud). Re-enable `arcade.grade()` here, where it can't overlap the HUD. [HM review](https://www.liverpoolsoundandvision.co.uk/2014/08/26/hotline-miami-ps4-game-review/)
- **F. Vector autopsy.** Swap the ship mesh for its `EdgesGeometry` (§6.1) and blow the segments apart, each moving along its midpoint normal at 40–120 u/s and spinning, with AfterimagePass `damp` 0.88 for phosphor trails. Add a cause-of-death line, "DESTROYED BY: GRAVITY WELL — ELYSIUM", plus TIME SURVIVED, Devil Daggers style. [Devil Daggers review](https://godisageek.com/reviews/devil-daggers-review/) · [Battlezone](https://en.wikipedia.org/wiki/Battlezone_(1980_video_game))
- **G. Instant retry.** R or ● restarts within 300 ms with no card. Super Hexagon's voice says "begin", which sounds like "again", and Hotline Miami's one-button restart is why its deaths don't sting. [Super Hexagon essay](https://waltoriouswritesaboutgames.com/2014/11/12/six-sided-sadism-super-hexagon/) · [Stevivor: HM](https://stevivor.com/reviews/hotline-miami/)
- **H. Tagline ticker keyed to cause.** One of ~30 lines types out at 25 ms/char under the title: "GRAVITY ALWAYS WINS", "SLINGSHOT, DON'T SPLAT", "THE PIRATES SEND THEIR REGARDS". Alternate jabs with encouragement, e.g. "NEW BEST DISTANCE" whenever a stat beats the player's record.

## 3. Effects that fuse the textured world with neon vectors
1. **One EffectComposer, loaded as plain scripts:** `postprocessing/{EffectComposer,RenderPass,ShaderPass,UnrealBloomPass,AfterimagePass,GlitchPass}` + `shaders/{CopyShader,LuminosityHighPassShader,RGBShiftShader,FilmShader,DigitalGlitch}`. Order: RenderPass → UnrealBloom → (Afterimage, situational) → CRT ShaderPass → (Glitch, transitions only). In the `minimal` quality tier, bypass the composer and call `renderer.render` directly. [three.js r128 examples/js](https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/)
2. **Bloom only the vectors, using an HDR threshold (the key trick).** `LuminosityHighPassShader` uses luma (0.299, 0.587, 0.114), so pure #FF00FF scores 0.41 and #00FFFF scores 0.70. A typical 0.85 threshold therefore never blooms saturated neon, and a low threshold blooms the planets. The fix:
   - Pass `new THREE.WebGLRenderTarget(w,h,{type:THREE.HalfFloatType})` to `new THREE.EffectComposer(renderer, rt)`. The default target is 8-bit and clamps at 1.0.
   - Give neon materials `toneMapped:false` and `color.multiplyScalar(3)`.
   - Use `UnrealBloomPass(new Vector2(w/2,h/2), 0.8, 0.4, 1.0)` (strength, radius, threshold). The pass already runs at half res with 5 mips.

   Textured planets stay at or below 1.0 and stay crisp. This costs one scene render, where the official selective-bloom example's layer swap (`BLOOM_SCENE = 1`, `darkenNonBloomed`) costs two. [Selective bloom r128](https://raw.githubusercontent.com/mrdoob/three.js/r128/examples/webgl_postprocessing_unreal_bloom_selective.html) · [UnrealBloomPass docs](https://threejs.org/docs/pages/UnrealBloomPass.html)
3. **Fat glowing lines.** r128's `lines/{LineSegments2,LineSegmentsGeometry,LineMaterial}` gives real pixel widths, which matters because WebGL lines are otherwise 1 px. Its shaders include the `logdepthbuf` and `fog` chunks, so they work with this renderer. Set `linewidth` 1.5–2.5 px and call `material.resolution.set(innerWidth, innerHeight)` on every resize. r128 has no `worldUnits` option. [webgl_lines_fat_wireframe r128](https://raw.githubusercontent.com/mrdoob/three.js/r128/examples/webgl_lines_fat_wireframe.html)
4. **Single-pass CRT ShaderPass**, used at full strength on menus and death and at about 30% in flight. Values: barrel k 0.04–0.08, aberration a ≈ 0.0015 (Heckel's RGBShift amount), 8% scanlines, 0.3 vignette. CRTFilter's sample config uses curvature 0.002 and aberration 0.0005 for a subtler look. [CRTFilter](https://redinvader.itch.io/crtfilter)
```glsl
vec2 c = vUv*2.-1.; c *= 1. + k*dot(c,c); vec2 uv = c*.5+.5;
vec3 col = vec3(texture2D(tDiffuse,uv+vec2(a,0.)).r, texture2D(tDiffuse,uv).g, texture2D(tDiffuse,uv-vec2(a,0.)).b);
col *= .92 + .08*sin(uv.y*uRes.y*3.14159);  col *= 1. - .3*dot(c,c);  gl_FragColor = vec4(col,1.);
```
5. **The DOM HUD gets matching scanlines in CSS, not in the shader:** a full-screen `pointer-events:none` div with `repeating-linear-gradient(rgba(0,0,0,.3) 0 1px, transparent 1px 4px)` and `mix-blend-mode:multiply`. It costs nothing on the GPU and keeps HUD text legible. Uses the same 4 px tile as Gamelord.
6. **Phosphor persistence.** `AfterimagePass(damp)` defaults to 0.96. Enable it only during warp, boss kills and death, at damp 0.82–0.90, so vector bullets leave Asteroids-style trails without smearing the starfield. Behind-Asteroids fakes vector intensity with a blur plus channel boosts. [r128 afterimage example](https://raw.githubusercontent.com/mrdoob/three.js/r128/examples/webgl_postprocessing_afterimage.html) · [vector-CRT notes](https://handmade.network/snippet/3903)
7. **Perspective grid floor** for the menu, intro and launch pad, and optionally as a faint galactic-plane grid near the Sol system. It's a ShaderMaterial (`extensions:{derivatives:true}` covers WebGL1). Scroll it endlessly with Heckel's two planes (`z = (t*0.15)%2`, the second at −2) plus `THREE.Fog('#000000',1,2.5)` to hide the seam.
```glsl
vec2 g = vUv*vec2(40.,80.) + vec2(0.,-uTime*.6);  vec2 d = abs(fract(g-.5)-.5)/fwidth(g);
float line = 1. - min(min(d.x,d.y),1.);  gl_FragColor = vec4(mix(uBg,uLine,line)*(1.-smoothstep(.55,1.,vUv.y)),1.);
```
8. **Striped sun disc** on a camera-facing plane: a vertical gradient from #FFB845 (top) through #F97698 to #712275, with bands cut out of the lower half that thicken toward the horizon: `if (vUv.y<.5 && fract(vUv.y*14.+uTime*.3) < (.5-vUv.y)*1.6) discard;`. Put it behind the hero planet at launch. [Franky Hung synthwave repo](https://github.com/franky-adl/threejs-synthwave-scene)
9. **Laser-grid warp tunnel.** `TubeGeometry(curve, 70, r, 50)` on a CatmullRom path with `side:BackSide` and the grid shader above, UVs scrolling about 2/s. Layer it under visual-flair's existing chromatic rings (#8) so a warp reads as entering a grid. [Codrops Infinite Tubes](https://tympanus.net/codrops/2017/05/09/infinite-tubes-with-three-js/)
10. **Glitch transitions.** Construct GlitchPass as `new THREE.GlitchPass()` and leave `goWild` false. Enable it for 200–400 ms on launch→space, warp exit, galaxy title cards and death, and disable it between bursts. [r128 glitch example](https://raw.githubusercontent.com/mrdoob/three.js/r128/examples/webgl_postprocessing_glitch.html)
11. **Edge overlays on textured meshes** (stations, big ships, asteroids near the camera): `new THREE.EdgesGeometry(geo, 25)` (default `thresholdAngle` is 1°, which draws every triangle) → `LineSegmentsGeometry().fromEdgesGeometry()`. Put `polygonOffset` (factor 1, units 1) on the base mesh to stop z-fighting. Build this in §6 too.
12. **Palettes.** All hex values are taken from the linked sources:
   - Neon on void: #FF6EC7 pink, #7DF9FF electric cyan, #BC13FE purple, base #0D0D0D. [Made Good Designs](https://madegooddesigns.com/?p=6895)
   - Synthwave sunset: #FF1493, #00F5FF, #3F3D56, #FF7F11, #05030F. Retro HUD: #FF6EC7, #00FFF7, #9D7CD8, #0F0F0F. [Design Your Way](https://www.designyourway.net/blog/neon-color-palettes/)
   - Outrun: #362FBB, #712275, #F97698, #FFB845. [ColorsWall](https://colorswall.com/palette/558166)
   - Vaporwave pastel: #F569C4, #03CAFC, #06FC9E, #B768FC, #FFFB8D. [Eggradients](https://eggradients.com/blog/vaporwave-color-palette)
   - SynthWave '84 text: #FF7EDB, #03EDF9, #FEDE5D, #72F1B8. [synthwave-vscode](https://github.com/robb0wen/synthwave-vscode)
13. **Proposed house palette by role** (built from the sets above):

   | Role | Hex |
   |---|---|
   | Void / background | #05030F |
   | Menu fog | `FogExp2(0x1a0b2e, 0.035)` |
   | Player / friendly vectors | #00F5FF |
   | Wingmen | #72F1B8 |
   | Hostiles | #FF1493 |
   | Bosses / warnings | #FF7F11 |
   | Pickups / score text | #FFFB8D |
   | Grid | #FF6EC7 on #0D0D0D |
   | Sky gradient (CSS) | `linear-gradient(#05030F 0%,#362FBB 40%,#712275 65%,#F97698 85%,#FFB845 100%)` |

   Keep fog off in deep space, because it kills the starfield. Use it only in menu and launch scenes and nebula interiors.

## 4. Typography
All of these are verified on Google Fonts (css2 API returned 200):
- Orbitron (variable 400–900), Audiowide, Monoton, Press Start 2P, Major Mono Display, Michroma, Syncopate, Zen Dots, Tektur, Rajdhani, Share Tech Mono, VT323, Kode Mono.
- Script accents: Mr Dafoe, Yellowtail.
- Shaded and outlined: Bungee Outline, Bungee Shade, Bungee Hairline.
- **Tilt Neon**, with `XROT`/`YROT` axes, gives free 3D tilt.
- **Sixtyfour** and **Workbench**, with `BLED`/`SCAN` axes, let you animate scanlines and bleed through `font-variation-settings`. They're ideal for "SIGNAL LOST" and boot text.

Lazer84 and Streamster are the classic outrun faces, but they are **not** on Google Fonts. Self-host them only with a licence.

[Orbitron](https://fonts.google.com/specimen/Orbitron) · [Monoton](https://fonts.google.com/specimen/Monoton) · [Sixtyfour](https://fonts.google.com/specimen/Sixtyfour) · [Mr Dafoe](https://fonts.google.com/specimen/Mr+Dafoe) · [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P)

**Pairing rules**
- Use at most 3 families per screen: one display face (Orbitron 900 or Monoton for titles, Audiowide for call-outs), one UI face (Rajdhani 500/600), and one number face (Share Tech Mono for HUD numbers, Press Start 2P for initials and high scores).
- A script accent (Mr Dafoe) appears at most once per screen.
- Display text: uppercase, 0.12–0.2 em tracking. Monoton only at 48 px and up, since its inline strokes vanish when smaller. Press Start 2P only at multiples of 8 px (8, 16, 24), or it blurs.
- Scores use `font-variant-numeric: tabular-nums` so digits don't jitter while counting.

**Chrome CSS**
```css
background:linear-gradient(180deg,#fff 0%,#9ec9ff 42%,#1b1e3c 50%,#ff6ec7 52%,#ffe 100%);
-webkit-background-clip:text;color:transparent;-webkit-text-stroke:1px #fff;
filter:drop-shadow(0 0 6px #bc13fe);
```
The hard break at 50% is the "horizon" glint. Neon text uses stacked shadows: `0 0 4px #fff, 0 0 10px #FF6EC7, 0 0 24px #FF6EC7, 0 0 48px #BC13FE`. [Typekit hard-stop gradients](https://blog.typekit.com/2014/04/04/high-impact-typography-with-background-clip-text/) · [CSS-Tricks neon](https://css-tricks.com/?p=340420)

## 5. Arcade feel
1. **Show the multiplier that `arcade.js` already tracks.** Put it in a fixed slot inside the top-centre corridor that `_corridor()` already computes. Geometry Wars 2 raises the multiplier only by collecting Geoms, with no cap (Galaxies caps at 150). Here, each clean gravity-whip slingshot adds +1, kills drop "flux shards" worth +1, and the multiplier decays after 4 s idle. [GW: RE2](https://en.wikipedia.org/wiki/Geometry_Wars:_Retro_Evolved_2)
2. **Kill call-outs.** Use the UT ladder: double 2, multi 3, ultra 4, monster 5 kills inside ~2 s; sprees at 5/10/15/20/25 without dying. Re-skin the names in Audiowide: DOUBLE TAP, TRIPLE VECTOR, ULTRAVIOLET, SUPERNOVA, then KILLING ORBIT, RAMPAGE, SINGULARITY. For the voice, `speechSynthesis` with `pitch 0.5, rate 0.85` run through a Web Audio ring-mod is a cheap robot. [UT announcer](https://www.ludo.guide/guide/unreal-tournament/unreal-tournament-part-28)
3. **Attract loop:** title (30 s idle) → existing DEMO autopilot (45 s) → HIGH SCORES (8 s) → HOW TO PLAY (8 s) → repeat. "PRESS START" blinks at 1 Hz, with `CREDITS 00` in the corner. Asteroids introduced the high-score table, which then became standard. [TV Tropes: Attract Mode](https://tvtropes.org/pmwiki/pmwiki.php/Main/AttractMode) · [Coding Horror](https://blog.codinghorror.com/the-high-score-table/)
4. **High-score initials.** 3 slots; up/down cycles A–Z, 0–9, ␣ and ⌫; a 20 s timer; top 10 kept in `localStorage`, wrapped in try/catch. Star Fire (Exidy, 1979) was the first game to take initials. [Star Fire](https://en.wikipedia.org/wiki/Star_Fire)
5. **Lives and continues in an Arcade mode.** 3 ships, with an extra ship every 50 k points (Tempest awards lives at score intervals), and a continue countdown (§2D) that keeps your score but halves the multiplier.
6. **Sector title cards** (1.6 s total): a horizontal line wipe (200 ms), "SECTOR 03 — ANDROMEDA DRIFT" typed at 30 ms/char, an objective subtitle, an 800 ms hold, then a glitch out (150 ms). Hotline Miami frames every level as a numbered chapter. [Giant Bomb: HM](https://giantbomb.com/wiki/Games/Hotline_Miami)
7. **Boss warning card.** Add Darius's "WARNING! A HUGE BATTLESHIP … IS APPROACHING FAST" to visual-flair's existing letterbox: diagonal #FF7F11/#000 hazard bars scrolling at 120 px/s, two klaxon pulses, the boss name, 2.5 s total. [Hardcore Gaming 101: Darius](https://www.hardcoregaming101.net/darius/)
8. **Mission rank letters** D/C/B/A/S/SS, from score against par per sector. Show them on both the mission-complete and the death tallies (§2E).
9. **Daily Run.** One attempt per day, the same seed for everyone. Seed = `YYYYMMDD` hashed into mulberry32 and fed to `proc-galaxies.js`. Lock any random rewards (Spelunky locks its gambling wheel). [Spelunky daily](https://spelunky.fandom.com/wiki/Daily_Challenge_Mode_(HD)) · [bryc PRNGs](https://github.com/bryc/code/blob/master/jshash/PRNGs.md) · [Daily-run design](https://www.gamedeveloper.com/design/the-24-hour-ticket-examining-daily-runs-)
10. **Intro branches as a diegetic fork.** The precedents:
   - In Star Wars (1983) you "Select a Death Star": Easy (wave 1), Medium (wave 3, +400 000) or Hard (wave 5, +800 000).
   - Tempest's SkillStep pioneered picking your start level.
   - OutRun forks at the end of every stage toward 5 goals, and you pick a radio track (Passing Breeze / Splash Wave / Magical Sound Shower) before driving.

   **Proposal:** from the launch pad, the player flies into one of five neon gates laid out on the grid like OutRun's route tree:
   - CAMPAIGN (story, saves)
   - ARCADE (3 lives, score attack)
   - FREE FLIGHT (no hostiles)
   - DAILY RUN
   - GALAXY SELECT: start at galaxy 1/3/5 for a 0/40 k/80 k bonus, Star Wars style.

   Then add a RADIO strip that picks the `game-music.js` track. DEMO MODE becomes a sixth, auto-flown gate. [Arcade History: Star Wars](https://www.arcade-history.com/game/2623/) · [Tempest](https://en.wikipedia.org/wiki/Tempest_(video_game)) · [OutRun](https://en.wikipedia.org/wiki/Out_Run)
11. **Juice budget per kill:** 50 ms hitstop, 4–8 px shake decaying over 180 ms, 1-frame additive flash, +score pop rising 30 px over 600 ms, 2-note stinger. [The Art of Screenshake](https://www.youtube.com/watch?v=AJdEqssNZ-U)

## 6. Upgrading the GLB ships to vector style, no modeller needed
1. **Edge extraction at load time.** Traverse the GLB → `EdgesGeometry(mesh.geometry, 20–30°)` → `new THREE.LineSegmentsGeometry().fromEdgesGeometry(e)` → `LineSegments2` with `LineMaterial({color, linewidth:1.8})`, parented to the mesh. Cache the result per model URL. These are the Star Wars and Battlezone wireframe silhouettes for free. [Battlezone](https://en.wikipedia.org/wiki/Battlezone_(1980_video_game)) · [Star Wars 1983](https://en.wikipedia.org/wiki/Star_Wars_(1983_video_game))
2. **Fresnel rim via `onBeforeCompile`** on the GLB's MeshStandardMaterial. In r128, `totalEmissiveRadiance` is declared before `#include <emissivemap_fragment>`, and `vViewPosition` is a varying, so append after that include: `float rim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0); totalEmissiveRadiance += uRim * rim * 3.0;`. The ×3 pushes the rim over the HDR bloom threshold (§3.2). [r128 meshphysical_frag](https://raw.githubusercontent.com/mrdoob/three.js/r128/src/renderers/shaders/ShaderLib/meshphysical_frag.glsl.js)
3. **Inverted-hull outline.** Clone the mesh with `MeshBasicMaterial({color, side:THREE.BackSide})` and push it along the normals by 2–4% in `onBeforeCompile` (`transformed += normal * uThick;`). It's one extra draw call, so use it only on the player, wingmen and bosses. Hide it inside ~1.1× radius (the CLAUDE.md DoubleSide rule).
4. **Hologram / "vector mode" toggle.** Darken `map` to 25%, add 6% scanline banding in the emissive term, and leave the edges at full strength. One key flips the whole fleet between textured and vector looks, which works as a "Battlezone mode" cheat or an Arcade-mode default.
5. **Faction colour coding** from §3.13, applied to edges and rims: cyan player, mint wingmen, magenta hostiles, orange bosses, yellow civilians. Tempest changes colour per level, so faction colours can also shift per galaxy.
6. **PewPew-style procedural line ships** for drones, pickups and new enemy types. Format: `vertexes {x,y,z}`, `segments {{0,1,2,3,0}}` (index paths), one colour per vertex, ~32×32 units, centred on the origin, facing +X. Extrude to 3D as two outlines plus connecting struts, then feed `LineSegmentsGeometry.setPositions`/`setColors` with `vertexColors:true`. [ppl-ships](https://github.com/pewpewlive/ppl-ships) · [PewPew Live](https://jyaif.itch.io/pewpew-live)
7. **Vector explosion.** Each edge segment becomes a particle with its own velocity and spin, fading over 900 ms under Afterimage. Make short segments and bullets brighter (×1.5), as on a real vector CRT, where short strokes look brightest. [MAME vector intensity #399](https://github.com/mamedev/mame/issues/399)
8. **Optional:** add conditional lines for curved hulls, where EdgesGeometry misses silhouettes. [three.js forum: LDraw-like edges](https://discourse.threejs.org/t/ldraw-like-edges/17100)

## 7. The aesthetic canon: the best neon / synthwave / retrowave / cyberpunk looks, and what each one teaches
_Added 2026-10-11. This section is about which looks are worth copying and why, so the branch picks one coherent target instead of blending everything. The implementation recipes are in §3–§6. Where a source is a fan blog or a retailer page, it says so._

### 7.1 Four looks that are easy to confuse. Pick one as the base.
| Look | What it is | Signature motifs | Palette | Fit for this game |
|---|---|---|---|---|
| **Outrun** | The driving branch of synthwave, named after Sega's 1986 *Out Run* | A car or bike heading toward a sunset, a neon grid floor, chrome | Very dark ground, deep orange / blue / purple, **red edges on objects** | **Use for menus, the launch pad and the death screen.** The "ship heading into the striped sun" shot is our car shot. |
| **Synthwave / retrowave** | The broader 1980s-retrofuturism look: "nostalgia for the future the 80s imagined" | Laser grids, wireframe polygon mountains, neon sunsets, reflections, **space travel**, AI | Dark tones with bright neon accents | **The base look for flight.** Space travel is already one of its motifs, so no other style fits a space game as naturally. |
| **Cyberpunk** | A dystopian, urban, high-tech/low-life look | Rain, signage, holograms, layered cities, cyberware | Neon as *motivated light* on dark, wet surfaces | Use it for **places**: stations, harbours, NEON CITY. Not for open space. |
| **Vaporwave** | A look built on the 1990s internet and consumer culture | Greek busts, Windows 95 windows, glitch, Japanese text, tropical imagery; **no** cars, chrome or orange/purple | Pastel pink, teal, lavender | **Avoid it** except for one joke, such as a "lost signal" Easter egg. It is ironic and slow, which works against arcade speed. |

[Wikipedia: Synthwave](https://en.wikipedia.org/wiki/Synthwave) · [Vaporwave vs Outrun](https://cleberg.net/blog/vaporwave-vs-outrun.html) · [AesDes: 80s/90s retro](https://www.aesdes.org/?p=26074) (blog-grade sources; treat the details as approximate)

**Recommendation:** use **synthwave as the base in flight**, **Outrun for the set pieces** (menu, launch, death, victory) and **cyberpunk for the inhabited places**. Leave vaporwave out.

### 7.2 Film and screen references, and the rule each one gives us
1. **Tron: Legacy (2010).** One dominant hue does most of the work. GMUNK's team: the main colour was "glowing light blue", and pinks were rarely approved. The costume designer gave the code: **white light = good, orange = evil**, and "the light is another character". They also "took out a lot of greeble" so each graphic "was understood quickly", and kept the 3D "tame and tasteful". Holograms were treated as **light sources on the actors**. *For us:* cyan for player and friends, orange for bosses (this matches §3.13). Strip decoration from HUD vectors. Let the big neon objects (warp gates, boss shields) cast real `PointLight`s, within the light budget. [GMUNK interview](https://www.pushing-pixels.org/2011/06/01/visual-effects-of-tron-legacy-and-beyond-conversation-with-gmunk.html) · [GMUNK: TRON Legacy](https://gmunk.com/TRON-Legacy) · [THR: costumes](https://www.hollywoodreporter.com//news/thr-costumes-tron-35081)
2. **Blade Runner 2049 (2017).** Neon is **motivated light**: K is lit pink by a 100-foot Joi hologram and green by the billboards outside his window. Each sequence has **its own palette**: the opening farm is naturalistic whites and browns, and Las Vegas is an orange haze shot in camera through amber/orange gels (Lee 105, 134, 020, plus 790 Moroccan Pink). *For us:* give each region one dominant tint and change it at boundaries, which `hyHazeAt()` and `warpTint: sector` already support, rather than making everything magenta. A heart world or giant should take its rim colour from the nearest neon source. [ASC: BR2049](https://theasc.com/article/blade-runner-2049-designing-the-future/) · [ECG: BR2049 lighting](https://www.ecgprod.com/lighting-design-blade-runner-2049/)
3. **Drive (2011).** Hot magenta script on black is a whole identity. The title is in Mistral or close to it (Excoffon, 1953); the exact cut isn't officially confirmed. The credits are reported as a widely spaced, clinical sans in the **same pink**. *For us:* this backs §4's "one script accent per screen", with the plain UI face in the same colour as the script. [Wikipedia: Mistral](https://en.wikipedia.org/wiki/Mistral_(typeface)) · [Made Good Designs: Drive font](https://madegooddesigns.com/drive-movie-font/)
4. **Akira (1988).** The tail-light trail is an afterimage that lags the moving light source. It is hand-drawn cel animation; the long-exposure-photo comparison is a fan reading, not a production account. *For us:* this is the reference for **engine and missile trails at speed**: a ribbon that lags the ship and fades, with `AfterimagePass` (§3.6) only during boosts. [Kinejapan thread](https://mailman.yale.edu/pipermail/kinejapan/2007-October/054258.html) · [SoraNews24 stop-motion remake](https://soranews24.com/2021/09/08/amazing-stop-motion-artist-recreates-akira-animes-most-famous-sequence-with-figures%E3%80%90video%E3%80%91/amp/)
5. **Synthwave album art (Gunship, Perturbator, Kavinsky).** This is the genre's own visual canon. Gunship's debut cover is praised for doing the neon grid unusually well. Perturbator's covers, by Ariel ZB, use deliberately **overexposed, Kodak-stock colour** with a giallo-horror edge, which is the darker "darksynth" variant. *For us:* the overexposed-film look is a cheap grade for the death and boss screens: lift blacks to #05030F, push highlights past white, add slight grain. [NewRetroWave: top 2015 covers](https://newretrowave.com/2015/12/31/top-10-synthwave-album-covers-of-2015/) · [Electricity Club](https://www.electricityclub.co.uk/?p=52318)

### 7.3 Games: the best-executed examples and the one trick worth taking from each
1. **Geometry Wars 2/3: the warping grid.** This is the most important single effect for a neon space shooter. According to Bizarre Creations, the background is about 60,000 points, each pushing on its neighbour, tuned to sit "on the edge of stability" so a small push makes it ripple. It reportedly had its own CPU core. Clones use spring-mass grids: masses at the intersections, pull-only springs, a pinned border, damping and symplectic Euler. Explosions push the grid outward and black holes pull it in. *For us:* a 64×64 grid (4k points, CPU-cheap) drawn as additive `LineSegments` on the **galactic plane under the player**, at about 15% opacity, visible only within ~3k u. Explosions, slingshots and black-hole wells deform it, so gravity becomes *visible*. That fits a game named after gravity slingshots. [GameDev.net thread](https://www.gamedev.net/forums/topic/555317-fluid-grid-aka-geometry-wars-background/4569783/) · [Tuts+ warping grid](https://code.tutsplus.com/make-a-neon-vector-shooter-in-xna-the-warping-grid--gamedev-9904t)
2. **Far Cry 3: Blood Dragon (2013).** The best-known synthwave game; the look goes back to *Out Run* (1986). It proves the look survives full 3D open worlds if you commit to it (§1.6 and §2 already take its VHS chrome). [Raindrops: synthwave artwork](https://raindrops-insider.beehiiv.com/p/incredible-retro-80s-inspired-synthwave-outrun-artwork)
3. **Sayonara Wild Hearts (Simogo, 2019).** Simogo's own write-up: saturated, **purple and pink**, and **only the characters get traditional lighting**. The environments are unlit and read through **depth fog**. The look followed the music when the score changed from dark to bright. *For us:* this answers the "textured world vs neon" problem from the other side. Keep lighting on ships (player, wingmen, enemies) and render far scenery unlit and fogged, which the haze system already does. It also suggests switching the palette with the music cue (`game-music.js`). [Simogo: SWH](https://www.simogo.com/sayonara-wild-hearts/) · [DualShockers interview](https://www.dualshockers.com/wild-hearts-never-die-an-interview-with-sayonara-wild-hearts-developer-simogo/)
4. **Thumper (Drool, 2016).** Two people made it without advanced shaders, particle systems or sophisticated lighting, using strong art direction and simplicity (GDC 2017 postmortem). Brian Gibson cites *2001* and "stripping out any visual information that is not essential to the gameplay". Speed is sold by **camera shake, radial blur, motion streaks and making the beetle itself vibrate**. *For us:* during a slingshot or warp burn, vibrate the player hull model by 0.5–1 % of its size, add a radial blur ShaderPass and streaks. That is cheaper than more particles. [GDC Vault: Seven Years in Alpha](https://gdcvault.com/play/1024291/Seven-Years-in-Alpha-Thumper) · [GamingBolt interview](https://gamingbolt.com/thumper-interview-inside-rhythmic-violence)
5. **Rez Infinite / Tetris Effect (Mizuguchi, Enhance).** The principle is **synaesthesia**: every visual event is also a sound event, and the reverse. Area X was built as the "prologue" to the next game. *For us:* quantise kill flashes, lock-on pulses and grid ripples to the music's beat when `game-music.js` knows the BPM, so the neon pulses with the soundtrack. [VGC: Mizuguchi](https://videogameschronicle.com/news/mizuguchi-confirms-next-gen-project-and-says-rez-infinite-was-a-prologue) · [Wccftech interview](https://wccftech.com/interview-tetsuya-mizuguchi-synesthesia-tetris-effect-rez-lumines/amp/)
6. **Resogun / Nex Machina (Housemarque).** Each level is built from about 200 million voxels, chosen so the world "could break down into tiny pieces". Enemies are voxels too, so every kill is a burst of debris, and Nex Machina keeps "a visual aesthetic of chaos with readability". *For us:* boss and station deaths should **break into glowing cubes or segments that persist and tumble** (the vector-explosion idea in §6.7, with cubes as an alternative to line segments). Readability rule: debris is never the player's or a hostile's colour. [Wikipedia: Resogun](https://en.wikipedia.org/wiki/Resogun) · [PS Blog: Resogun explosions](https://blog.playstation.com/?p=120470) · [Engadget: Nex Machina](https://www.engadget.com/2016-12-03-nex-machina-housemarque-resogun-sequel-interview-preview.html)
7. **Cyberpunk 2077: four named styles for four social layers.** **Kitsch** (neon hair, glowing tattoos, chrome, bright pink and yellow, round shapes), **Entropism** (scavenged, function over form), **Neomilitarism** (corporate, matte, muted) and **Neokitsch** (the rich: Kitsch restrained, gold and leather). *For us:* the factions get a style grammar, not just a colour. Pirates are Entropism (patched hulls, mismatched lights). Corporate and Vulcan fleets are Neomilitarism (matte, one thin accent line). Harbour civilians are Kitsch. Bosses are Neokitsch (gold trim on matte). [VGC: Night City's four styles](https://videogameschronicle.com/news/new-cyberpunk-2077-trailers-showcase-the-games-vehicles-and-night-citys-four-visual-styles) · [GameLuster: Elements of Style](https://gameluster.com/cyberpunk-2077-night-city-wire-elements-of-style/)
8. **Neon White (2022).** Its heaven is a garish, utopian, Y2K-inspired look, chosen partly to flip the brown retro-FPS revival. *For us:* when every rival is dark and gritty, a **bright, clean, white-and-neon** zone stands out. One sector (for example the liberated Sgr A* region after SGR_LIBERATED) could switch to a white-void, neon-trim palette as the reward look. [Game Developer: Neon White](https://www.gamedeveloper.com/road-to-igf-2023/-neon-white-and-designing-for-player-creativity)
9. **Furi, Ruiner, Hotline Miami 2, Katana Zero, Cloudpunk.** These are the dark-ground, burst-of-neon school (darksynth). Furi's look is dark, gritty environments broken by bursts of vibrant neon. *For us:* neon is an **accent on 5–10 % of the screen**, not a fill. The rest stays near #05030F. (Source is a retailer listicle, so it supports only the general description.) [PremiumCDKeys list](https://www.premiumcdkeys.com/blogs/game-news/top-5-best-games-similar-to-retrowave-dive-into-neon-drenched-nostalgia)
10. **Asteroids-likes in vector neon (Drift Vector, Nova Drift).** These are the closest genre neighbours to us. Drift Vector advertises "retina-burning neon vector graphics" with a synthwave score. One review of Nova Drift found its 8-bit look "a little bland" despite bright enemies on black. **Lesson:** flat vectors on a black void read as dated unless there is glow, depth and a moving grid. Our textured world is the advantage, so keep it under the vectors. A CC0 set of Asteroids-style glowing vector sprites exists for prototyping. [Drift Vector](https://www.vgdb.co/games/drift-vector) · [Nova Drift review](https://indiegamereviewer.com/nova-drift-preview-an-updated-asteroids-homage-early-access/) · [OpenGameArt vector sprites](https://opengameart.org/content/asteroids-vector-style-sprites)

### 7.4 Rules distilled from all of the above
1. **One dominant hue per region, one accent per faction.** Tron's cyan-good / orange-evil, plus BR2049's palette that changes per sequence.
2. **Neon is light, not paint.** Big glowing objects cast light (Tron holograms, BR2049 billboards). Small ones only bloom (§3.2).
3. **Neon on ≤10 % of the frame.** Dark ground, bright accents: darksynth, Furi, Outrun's very dark palette.
4. **Light the actors, fog the scenery.** Sayonara Wild Hearts.
5. **Make gravity visible.** The Geometry Wars spring grid on the galactic plane.
6. **Speed by vibration, blur and streaks, not by particles.** Thumper.
7. **Things break into pieces that persist.** Resogun.
8. **Sound and light move together.** Rez and Tetris Effect.
9. **Strip greeble and keep 3D tasteful.** GMUNK: readable at a glance beats busy.
10. **Factions get a style grammar, not just a colour.** Cyberpunk 2077's Kitsch / Entropism / Neomilitarism / Neokitsch.

### 7.5 Added to the backlog (ranked)
1. **Gravity grid**: a spring-mass grid on the galactic plane near the player, deformed by black holes, slingshots and explosions (7.3.1).
2. **Thumper speed kit** for slingshots and warp burns: hull vibration, radial blur and motion streaks (7.3.4).
3. **Faction style grammar** applied to enemy edge and rim colours and trim (7.3.7, with §6.5).
4. **Beat-locked neon pulses** whenever a track's BPM is known (7.3.5).
5. **Persistent voxel or segment wreckage** for boss and station deaths (7.3.6, §6.7).
6. **A per-region palette shift** on sector change (BR2049) and a bright "liberated" palette as a reward (Neon White).

## Top ten for Interstellar Slingshot
1. Add the r128 EffectComposer with **HDR-threshold bloom** (HalfFloat target, neon ×3, threshold 1.0): neon glows and planets stay crisp, for one scene render.
2. **Edge-extract every GLB** into `LineSegments2` plus a **fresnel rim** to turn the existing fleet into vector ships.
3. **Rebuild MISSION FAILED** as freeze/slow-mo → vector autopsy → score tally plus rank letter → 9-second continue (A → F → E → D), with instant retry as an option.
4. **Five-gate diegetic launch fork** (Campaign / Arcade / Free Flight / Daily Run / Galaxy Select at 1/3/5 for a bonus), plus an OutRun-style radio track pick.
5. **Perspective grid and striped sun** behind the title and launch pad; chrome Orbitron title with a Mr Dafoe script overlay.
6. **Single-pass CRT shader** (barrel, aberration 0.0015, scanlines) at full strength on menus and death, light in flight; CSS scanlines over the DOM HUD.
7. **Surface `arcade.js`'s hidden combo and grade** in a non-overlapping slot, with UT-ladder kill call-outs and a robot voice.
8. **Attract loop** (title → demo → high scores → how to play) with blinking PRESS START and 3-letter initials entry.
9. **Glitch and VHS transitions** (GlitchPass bursts of 200–400 ms, tracking-bar OSD) for launch, warp exit, sector cards and the Darius-style boss WARNING.
10. **Lock the house palette** (#05030F / #00F5FF / #FF1493 / #FF7F11 / #72F1B8 / #FFFB8D) and three font roles (Orbitron, Rajdhani, Share Tech Mono / Press Start 2P), and apply them everywhere.
