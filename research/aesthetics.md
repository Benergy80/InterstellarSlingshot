# Neon / Synthwave / Retrowave / Cyberpunk: visual reference and style rules
_2026-10-11, for the `synthwave` worktree. This file covers how things should look and what to steal from where. `retrowave.md` already covers menu patterns, the Mission Failed timings, the r128 pass stack, CRT shader code, fonts and the arcade loop, so this file points to it (§n) instead of repeating it. `pewpew.md` covers line-ship DNA. **The live tokens are `--sw-*` in `css/synthwave.css`.** Every palette below is written as overrides of those tokens. Where a number is a house rule rather than a sourced fact, it says so._

## 1. The canon: what each source contributes
**Artists, studios, film and TV**
| Source | What it contributes (specific) | Steal for IS |
|---|---|---|
| James White / Signalnoise | "Lasers, chrome text, rainbows, brush letters". His FM-84 *Atlas* cover is minimalist, shape-based, with sliced forms and restrained hues. [Threadless](https://blog.threadless.com/artist-shop-spotlight-the-80s-vibes-of-signalnoise/) · [NRW 2016](https://newretrowave.com/2016/12/19/top-ten-retrowave-album-covers-of-2016/) | Title lockups built from 2–3 sliced geometric shapes, not clip-art palms |
| Kilian Eng | Retro-futurist environments where light and colour lead. Works fully digitally and adds the analogue anachronisms on purpose. Influences: Mead, Moebius. [Cook & Becker](https://www.cookandbecker.com/en/artist/4/kilian-eng.html) | Big quiet megastructures lit by **one** coloured source, plus added print grain |
| Josan Gonzalez (Deathburger) | Pencil and ink over a "densely urban" world. He wants colour "as close to traditional as possible, never digital". He also drew the Cyberpunk 2077 steelbooks. [Vice](https://develop.vice.com/en/article/cyberpunk-art-book-gonzales/) · [VidaExtra](https://www.vidaextra.com/rpg/death-burger-artista-sabadell-que-ha-disenado-cuatro-ilustraciones-para-cajas-metalicas-cyberpunk-2077) | Comms portraits and codex cards as inked line plus flat fills |
| Syd Mead | Credited as "visual futurist". Designed the Tron cycles and Blade Runner's vehicles, a new super light cycle for Tron 2.0, and BR2049's Las Vegas. [Wikipedia](https://en.wikipedia.org/wiki/Syd_Mead) · [Tron 2.0 postmortem](https://www.gamedeveloper.com/business/postmortem-monolith-s-i-tron-2-0-i-) | Ships read as believable industrial hardware first, with neon second |
| Beeple (early Everydays, 2007→) | A daily Cinema 4D render practice. His VJ loops (2009–19) were released under Creative Commons, "free for any use". [Wikipedia](https://en.wikipedia.org/wiki/Mike_Winkelmann) | Reference for abstract tunnels and pulses; check each loop's licence before using it as a menu backdrop |
| Josef Bsharah | Hyper-real C4D/Octane environments with "surreal and abstract elements" and "environmental storytelling". *Jade* draws on Ghost in the Shell and Akira. [Maxon](https://www.maxon.net/en/article/a-thousand-words) | **The fusion recipe:** a photoreal textured set piece plus exactly one impossible neon element |
| Dan Mumford | Bold ink line with gradients and shading drawn from screen-printing; saturated and psychedelic. [GoMedia](https://gomedia.com/insights/interview-with-illustrator-dan-mumford/) | Loading and sector cards as posterised 3–5-ink gradients |
| *Tron: Legacy* art dept | The grid world is "very desaturated metallic light blue", with saturated orange "to create and maintain visual conflict", and post-processing stripped eye and lip colour ([Pushing Pixels](https://www.pushing-pixels.org/2010/12/28/the-colors-of-tron-legacy.html)). In costume, white = good and orange = evil ([THR](https://www.hollywoodreporter.com/news/thr-costumes-tron-35081)). GMUNK: "tame and tasteful", "take out a lot of greeble" for a quick read, and "lay down your grid… that grid becomes your bible" ([Pushing Pixels](https://www.pushing-pixels.org/2011/06/01/visual-effects-of-tron-legacy-and-beyond-conversation-with-gmunk.html) · [Board Room](https://gmunk.com/TRON-Board-Room)) | Desaturate the world, keep one hostile hue rare, cut greeble from the HUD |
| *Blade Runner 2049* | Territory made 100+ screens and moved toward optical and organic interfaces ([Territory](https://territorystudio.com/project/blade-runner-2049/)). Vegas is orange, from 2009 dust-storm photos, with haze for depth separation. Wallace HQ is gold; LA is fluorescent blue/green ([Oseman](https://neiloseman.com/roger-deakins-oscar-winning-cinematography-blade-runner-2049/)) | One dominant hue per location, plus volumetric haze when a scene goes near-monochrome |
| *Drive* (2011) titles | Hot-pink Mistral script over night footage. [Wikipedia: Mistral](https://en.wikipedia.org/wiki/Mistral_(typeface)) | The script accent, used once per screen (Mr Dafoe stands in; retrowave §4) |
| *Kung Fury* | Every shot got the "thrift store VHS look": oversaturated colour and tracking artefacts, added as a filter **after** compositing. [AWN](https://www.awn.com/news/vfx-awesomeness-kung-fury-relies-ftrack) | VHS is a final grade pass on menus and replay. Never bake it into textures |
| *Stranger Things* titles (Imaginary Forces) | ITC Benguiat glowing red on the **outline**, not the fill, so it reads as light passing through film. Type-only, in Richard Greenberg's lineage. [TDC](https://archive.tdc.org/news/view-la-reflections-stranger-things-emmy-winning-titles/) · [Typeroom](https://www.typeroom.eu/stranger-things-the-inspiration-the-alternatives-and-the-final-homage-to-designs-iconic-legendsin-a-single-logo) | Glow the stroke and keep the fill dark (MISSION FAILED, boss names) |
| *Miami Vice* | Michael Mann's "no earth tones" rule, and "three colors become thematic, two colors don't". [Wikipedia](https://en.wikipedia.org/wiki/Miami_Vice) · [THR](https://www.hollywoodreporter.com/lifestyle/style/miami-vice-michael-mann-costume-designers-interview-menswear-1235961920/) | **Three hues per scene. Browns are graded out of the neon band** |

**Album-art conventions**
- **Kavinsky, *OutRun*.** A persona myth: a 1986 Testarossa crash victim returns as a zombie producer. The cover is "nighttime-in-'80s-Miami". [Wikipedia](https://en.wikipedia.org/wiki/OutRun_(album)) · [PopMatters](https://www.popmatters.com/169712-kavinksy-outrun-2495768664.html)
- **Perturbator.** Ariel Zucker-Brull's comic-figure art (Jim Lee, Madureira), with a "futuristic church" on *Dangerous Days*. *The Uncanny Valley* uses "harsh, sharp lines and hard edges". [V13](https://v13.net/2016/07/interview-with-perturbator-the-band-s-artistic-director-and-artist-ariel-zucker-brull/)
- **Carpenter Brut, *Trilogy*.** Dark metal mixed with retro: a skull beside pizza and roller blades. [NRW 2015](https://newretrowave.com/2015/12/31/top-10-synthwave-album-covers-of-2015/)
- **Gunship.** The debut carried a sun design. On *Dark All Day* that sun is "ominously eclipsed", exploding out of a VHS case. [Press release](https://www.prescriptionmusicpruk.com/press-releases/2018/7/13/gunship-new-album-out-5-october-2018) **This is the black-hole motif.**
- **FM-84, *Atlas*.** James White's sliced shapes (above).
- **Com Truise.** A designer-musician. *Galactic Melt* has been compared to Unknown Pleasures' line plot, and *Silicon Tare* uses a "limited color palette and simple shapes". [Exclaim](https://exclaim.ca/music/article/com_truise-galactic_melt) · [NRW 2016](https://newretrowave.com/2016/12/19/top-ten-retrowave-album-covers-of-2016/)
- **The Midnight, *Endless Summer*.** "Careless Whisper"-style sax plus beach marimba: sunset melancholy, not party. [NRW](https://newretrowave.com/2016/08/29/the-midnight-endless-summer/)
- **Timecop1983.** A "murky alley dotted with pastels", the dreamwave register. [Pure Honey](https://purehoneymagazine.com/timecop-1983/)
- **Dance With the Dead.** Vintage-horror covers ("Creepshow-meets-Christine"); "transformed humans emanating dark energy". [Teeth of the Divine](https://www.teethofthedivine.com/?p=58335) · [Bloody Disgusting](https://bloody-disgusting.com/music/3546175/horror-dance-dead-qa-one-beloved-bands-synthwave/)
- **Lazerhawk** (Austin; *Skull & Shark*) plus Kavinsky and College on the *Drive* soundtrack: the founding outrun canon. [Bloody Disgusting](https://bloody-disgusting.com/tag/lazerhawk/) · [Wikipedia: Synthwave](https://en.wikipedia.org/wiki/Synthwave)

**Sub-styles.** Use them as scene registers; don't mix two in one shot. Sources: [Synthwave](https://en.wikipedia.org/wiki/Synthwave) · [Audio Network](https://blog.audionetwork.com/the-edit/music/synthwavevsvaporwave) · [Vaporwave](https://en.wikipedia.org/wiki/Vaporwave)
| Register | Mood | Motifs | Palette (§3) | IS use |
|---|---|---|---|---|
| Outrun | Sincere, warm, speed | Sunset, grid, chrome, the car (here: the ship) | A | Title, launch pad, slingshot success |
| Retrowave / dreamwave | Wistful night drive | City glow, pastels in murk, sax | B | HUD, cruising, comms |
| Vaporwave | Ironic and consumerist; Sims-like CG, Times New Roman, statues | Win95 windows, malls | retrowave §3.12 pastel | One easter-egg shop or ad billboard only |
| Darksynth | Horror: Carpenter, Goblin, industrial, EBM | Red-on-black, skulls, eclipsed sun | C | Mission Failed, bosses, black holes |
| Cyberpunk neo-noir | Grime under neon | Rain, haze, signage, off-red UI | B + C accents | Stations, pirate space |
| Vector arcade / Tron | Clean, cold, legible | Wireframes, beams, grids | D | Warp, vector ships, nav overlays |

## 2. Games that nail it, and the one element to steal from each
| Game | Steal this |
|---|---|
| Far Cry 3 Blood Dragon | It **re-tints an existing textured game** ("FC3 mechanics + neon-washed '80s trappings") under a permanent night grade. That is IS's exact job. [GamesBeat](https://gamesbeat.com/far-cry-3-blood-dragon-is-80s-stupid-awesome-preview/) · [Game Informer](https://gameinformer.com/b/features/archive/2013/07/26/the-80s-strike-back-the-complete-story-behind-blood-dragon) |
| Hotline Miami 1–2 | Swaying, colour-cycling menus. HM2 adds VHS "establishing screens for time and place" and a VHS pause distortion. [Cliqist](https://cliqist.com/2015/03/30/aesthetic-excellence-hotline-miami-2/) |
| Neon Drive | Obstacles timed to the synthwave track across 8 levels: the visual beat is the music's beat. [PS Blog](https://blog.playstation.com/2017/08/03/neon-drive-launches-august-8-on-ps4/) |
| Power Drive 2000 | A car that "glows into the night", plus a talking AI car companion: a comms persona. [Hardcore Gamer](https://hardcoregamer.com/previews/power-drive-2000-looks-as-awesome-as-nostalgia-pretends-the-80s-were/150371/) · [Automaton](https://automaton-media.com/articles/newsjp/iotw-099-power-drive-2000/) |
| Slipstream | User-selectable screen filters (CRT, pixelate) plus rewind. Make filters opt-in. [GodisaGeek](https://godisageek.com/reviews/slipstream-review/) |
| Horizon Chase Turbo | "Cleaner, brighter", with each track carrying marks of its real location: a per-galaxy colour identity. [TSA](https://www.thesixthaxis.com/2018/05/31/horizon-chase-turbo-review/) |
| Cyberpunk 2077 (UI) | Off-red "low-fi" HUD, "thick square" dash fonts, and a beige/eggshell monochrome menu. The same UI framework renders the city billboards. [HUDs+GUIs](https://www.hudsandguis.com/home/2019/cyberpunk-2077) · [GDC](https://expo.gdconline.com/news/learn-how-cyberpunk-2077-built-its-impressive-ui-gdc-showcase-session) |
| Ghostrunner | "Run-down, rugged" post-apocalyptic cyberpunk with neon on decay. Neon earns its place against grime. [Checkpoint](https://checkpointgaming.net/features/2020/06/we-want-them-to-feel-the-rush-creating-the-intense-world-of-ghostrunner) · [Unreal](https://www.unrealengine.com/en-US/developer-interviews/ghostrunner-is-one-of-the-best-looking-coolest-cyberpunk-games-on-the-market) |
| Katana ZERO | Sprite shading that "changes color depending on ambient lighting": ships take the local neon tint. [Nintendo Everything](https://nintendoeverything.com/review-katana-zero/) · [Gamereactor](https://www.gamereactor.eu/news/748453/Katana+Zero+was+inspired+by+Korean+revengethrillers/) |
| Narita Boy | The Techno-Sword leaves a red/blue/yellow "Trichroma" afterimage. Its default CRT filter gave a reviewer headaches, so ship it off by default. [MP1st](https://mp1st.com/reviews/narita-boy-review-in-that-trichroma-rain) |
| Cloudpunk | MagicaVoxel facades read as "hundreds of tiny boxes of light". The Switch port lost its reflections and much of its atmosphere. [GOG](https://www.gog.com/news/interview_bcloudpunks_creators_b) · [TSA](https://www.thesixthaxis.com/2020/11/05/cloudpunk-review/) |
| VirtuaVerse | Master Boot Record's score "changes as you progress": one music layer per region. [Gamepressure](https://www.gamepressure.com/editorials/reviews/virtuaverse-review-perfect-cyberpunk-is-pixel-art-mixed-with-synt/z92a6) |
| The Last Night | Pixel-art textures in a 3D space where "the lighting creates the drama": low-fi assets under modern light. [TechRaptor](https://techraptor.net/content/e3-2017-the-last-night-presentation-details) |
| Tron: Identity | A "distinctly monochrome colour scheme with bright lines of neon colour", plus rain. [Checkpoint](https://checkpointgaming.net/reviews/2023/04/tron-identity-review-neo-noir-greatness/) |
| Tron 2.0 | Glow baked into additive textures was slow and uneven, so Monolith/Nvidia built a **2nd-pass blur glow**. Glow belongs in post, not in the art. [Postmortem](https://www.gamedeveloper.com/business/postmortem-monolith-s-i-tron-2-0-i-) |
| Tron RUN/r | Counter-example: the lightcycle stage flooded white lost the black arena. [GameSkinny](https://www.gameskinny.com/reviews/tron-runr-review/) |
| Rez Infinite | Area X is "built almost entirely of particles, fizzing in and out" against black, with Kandinsky-style colour formalism. [GamesBeat](https://gamesbeat.com/watch-rez-infinites-area-x-how-vr-finally-got-me-into-the-classic-trip/) · [Everyeye](https://www.everyeye.it/articoli/recensione-rez-infinite-31174.html) |
| Thumper | Speed is FOV plus "camera shake, radial blur, motion streaks and making the beetle itself vibrate". [GamingBolt](https://gamingbolt.com/thumper-interview-inside-rhythmic-violence) |
| Polybius | A "hypervelocity neon trancespace" with colour-cycling towers on a cylinder, at 120 fps on PSVR. [Wikipedia](https://en.wikipedia.org/wiki/Polybius_(2017_video_game)) · [Destructoid](https://destructoid.com/?p=199420) |
| Tempest 4000 | Warning: "busy backdrops and acid-trip effects" hide the playfield. Cap background energy during combat. [GamesBeat](https://gamesbeat.com/tempest-4000-review-ataris-wireframe-shooter-glows-and-shrinks-in-4k/) |
| TxK | Minter the visualiser: screen-warp transitions as a reward. [GameSpot](https://www.gamespot.com/reviews/txk-review/1900-6415666/) |
| Geometry Wars | A spring-mass grid (~60,000 points) that "swings" when pushed: **draw gravity wells as grid dents**. [Tuts+](https://code.tutsplus.com/make-a-neon-vector-shooter-in-xna-the-warping-grid--gamedev-9904t) · [GameDev.net](https://gamedev.net/forums/topic/555317-fluid-grid-aka-geometry-wars-background/4569783/) |
| Resogun | Everything is voxels, and explosions shatter into lit cubes. [PS Blog](https://blog.playstation.com/?p=120470) |
| Nex Machina | In the chaos, enemy shots "stand out" and humans are "bright beacons". Readability comes before spectacle. [Twinfinite](https://twinfinite.net/2017/06/nex-machina-review/) |
| Furi | Each boss's composer got a brief on the boss, its personality **and its arena**: one track plus one palette per boss. [Wikipedia](https://en.wikipedia.org/wiki/Furi) · [Artbook](https://www.thegamebakers.com/furi-collector-artbook-available-now/) |
| Desert Child | "Really bright, colorful pixel art", grown from a single drawing of a guy on his hoverbike. [80.lv](https://80.lv/articles/desert-child-racing-rpg-development) |
| Sayonara Wild Hearts | Purple/pink at high saturation. "Only the characters use traditional lighting, while the environments are not lit at all… depth fog." [Simogo](https://simogo.com/work/sayonara-wild-hearts/) |
| Jet Set Radio | Attitude: characters drawn as icons and symbols, bright colour against an era of murk. [Segabits](https://segabits.com/blog/2014/04/28/over-the-hood-through-the-streets-and-right-into-your-brain-its-jet-set-radio-week/) |
| Beat Saber | Colour = role (red left, blue right) on dark sets, to keep clutter low at tempo. [Wikipedia](https://en.wikipedia.org/wiki/Beat_Saber) |
| Synth Riders | Giant low-poly faces and monoliths, "pulsing lights and immense voids that rush past". [Cubed3](https://www.cubed3.com/games/reviews/pc/synth-riders) |
| OutRun 2006 / OutRun | Daylight counter-palette, and a route that forks at every stage with new scenery. [Wikipedia](https://en.wikipedia.org/wiki/Out_Run) · [GamesRadar](https://gamesradar.com/outrun-2006-coast-2-coast-13) |
| Fast RMX | Orange/blue phase switching that must match the boost strips: **colour is a mechanic**. [TSA](https://www.thesixthaxis.com/2017/03/09/fast-rmx-review/) |
| Redout | "Low-polygon structure" with modern shading, lighting and FX; "kaleidoscopic" at speed. [PC Gamer](https://www.pcgamer.com/redout-review/) |
| BallisticNG | Deliberate PS1 emulation: low-res textures, "wobbly vertices", primitive lighting. A retro mode is a toggle, not a downgrade. [RAWG](https://rawg.io/games/ballisticng) |
| Wipeout 2097 / Omega | The Designers Republic made each team "a mini branding exercise", carried onto trackside ads: **brand the factions**. [Creative Boom](https://www.creativeboom.com/books/wipeout-futurism-is-the-definitive-illustrated-history-of-the-cult-videogame/) · [Creative Review](https://www.creativereview.co.uk/an-oral-history-of-wipeout/) |
| Star Wars (1983) | Colour vectors plus digitised film speech, in a 3-stage structure (dogfight → surface → trench). [Film Stories](https://filmstories.co.uk/features/atari-star-wars-1983-coin-op-a-masterpiece-of-arcade-tech/) |
| Tempest (1981) | The first Color-QuadraScan game; colour came from gels before it. [Wikipedia](https://en.wikipedia.org/wiki/Tempest_(video_game)) |
| Battlezone | A B/W vector screen under an overlay: green on the lower ⅘ and red on the top ⅕, where score and radar live. **Colour by screen zone.** [Wikipedia](https://en.wikipedia.org/wiki/Battlezone_(1980_video_game)) |
| Major Havoc | "The most colorful active X-Y graphics since Tempest", with genre shifts between shooter, landing and maze. [Arcade History](https://www.arcade-history.com/game/1543/) |
| Vectrex games | White beams under per-game translucent overlays fake colour per region. [Vintage Computing](https://www.vintagecomputing.com/index.php/archives/265/retro-scan-of-the-week-the-art-of-the-vectrex-overlay) |
| PewPew Live | Pure line-art ships with one colour per vertex (see `pewpew.md`). [itch.io](https://jyaif.itch.io/pewpew-live) |

## 3. Style rules (apply literally)
**R1. Palettes.** Each palette is a set of overrides of `--sw-*`, and a scene uses one palette. A and B are from retrowave §3.12 ([ColorsWall](https://colorswall.com/palette/558166)) and the Miami Vice logo ([Brand Palettes](https://brandpalettes.com/miami-vice-logo-colors/)). D comes from ggsci's Tron: Legacy set ([source](https://github.com/nanxstats/ggsci/blob/master/R/palettes.R)). **C is house-defined**: no sourced darksynth palette exists.
| Palette | Void | Flat mid-tones (never glow) | Glow carriers | Hot accent (≤2% of screen) | Text |
|---|---|---|---|---|---|
| A Outrun sunset | #07030F | #362FBB indigo, #712275 plum | #FF2BD6 grid, #F97698 | #FFB845 / #FFE066 sun | #F4F7FF |
| B Miami night | #07030F | #0B0620 floor, #1A0B2E fog | #19F0FF cyan, #F990E8 pink | #0BD2D3 | #F4F7FF |
| C Darksynth | #050005 | #3A0010 ember, #1A0008 | #FF3B5C red | #FF2BD6 (one element) | #E8E0D8 bone |
| D Tron grid | #000000 | #748AA6 steel, #D0DFE6 | #6EE2FF blue | #FF410D (hostile), #F7C530 | #D0DFE6 |

Faction roles are constant across palettes (retrowave §3.13 roles, re-pointed at the shipped tokens): player `--sw-cyan` #19F0FF · wingmen mint #72F1B8 (add `--sw-mint`) · hostiles `--sw-magenta` #FF2BD6 · bosses/warnings `--sw-orange` #FF8C3A · death/danger `--sw-red` #FF3B5C · score/pickups `--sw-yellow` #FFE066.

**R2. Light/dark ratio (house rule).** In flight, keep at least 80% of pixels below 10% luma. Emissive neon covers 5% of the frame or less (8% at combat peaks). Menus may reach 15%. Pure white #FFF only appears as the core of a beam. Max 3 glowing hues per scene (Miami Vice).

**R3. What glows.** Only lines, beams, engine cores, rims, the sun and grid lines glow: `toneMapped:false` ×3, which puts them over the HDR threshold (retrowave §3.2). Planet albedo, nebula fills, HUD panel fills, body text and the flat mid-tones stay flat. If something is not emissive in the fiction, it does not bloom.

**R4. Line weights** (`LineMaterial` px): player and wingmen 2.0 · enemies 1.8 · bosses 2.5 · grid 1.0 · HUD frames 1.0 at 40% alpha · corner brackets 2.0 · bullets and debris 1.2 at ×1.5 brightness (short strokes read brightest on vector CRTs, retrowave §6.7). Bloom halo radius: no more than 4× the core width on gameplay vectors, up to 12× on title text (CSS shadow stack, retrowave §4).

**R5. Grid and horizon** (matches `startGrid()` in `synthwave-fx.js`): horizon at **62% of screen height from the top**, vanishing point 8% of height above it · 18 converging columns spaced 0.09·w at the bottom edge, 14 rows on k² spacing · line alpha 0.85 near, 0.2 at the horizon, fading to 0 over the top 15% of the floor · scroll 0.55 rows/s idle, 2.0 rows/s on launch. In space, only a "galactic plane" grid: 1,000 u cells at alpha 0.06–0.12, faded out beyond 20,000 u. Never a full-brightness floor in deep space.

**R6. Sun:** radius 0.17·min(w,h), centre 0.15 r above the horizon · vertical gradient #FFE066 → #FF8C3A at 55% → #FF2BD6 · exactly 7 stripes, lower half only, cut thickness growing linearly from 2% to 10% of the diameter, scrolling down at 18 px/s. Black-hole variant (Gunship, *Dark All Day*): the same disc eclipsed by a #000 disc at 0.92 r with a 2 px #FF2BD6 photon ring.

**R7. Chrome and gradient text.** Use the retrowave §4 gradient with its hard 50% "horizon" stop. Allowed only at 48 px or larger, on 3 words or fewer, once per screen. Gradient text never carries information (no scores or labels).

**R8. Scanlines and CRT.** CSS scanline overlay (1 px dark per 3–4 px): 0–0.10 in flight, 0.25–0.35 on menus, 0.55 on death/attract (today's `#swDeath .sw-scan`, and the ceiling). Never above 0.15 over HUD numerals. Barrel k (retrowave §3.4): 0 in flight, 0.04 on menus, 0.06–0.08 on death/attract.

**R9. Chromatic aberration** (RGBShift `amount`, UV): 0 in steady flight · 0.003 for 120 ms on a damage hit · 0.004 for 200 ms on warp entry and exit · 0.0015 on menus · ramp to 0.006 on death. r128's default of 0.005 is burst strength, not a steady state. [RGBShiftShader r128](https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/RGBShiftShader.js)

**R10. Grain and vignette.** FilmShader: `nIntensity` 0.12–0.2 (default 0.5), `sIntensity` 0 (CSS scanlines already do this job), and **`grayscale` set to 0**; its default of 1 desaturates every neon colour ([FilmShader r128](https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/FilmShader.js)). VignetteShader: `offset` 1.0 with `darkness` 0.7 in flight and 1.2 on menus; the default is 1.0/1.0 ([VignetteShader r128](https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/VignetteShader.js)). Kilian Eng-style print grain is for menus only.

**R11. Motion.** Entrances use retrowave §1.9's ease-out-back over 220 ms; exits are linear, 120 ms; state changes are hard cuts, with no crossfade longer than 150 ms. Counters tick linearly with tabular-nums. Neon flicker on idle titles only: one dropout every 4–7 s (random), 2–3 frames at 30–50% brightness, with a 15% chance of a double-blink. Never flicker gameplay information, and keep to 3 flashes per second or fewer (WCAG). Camera sway (±2°, HM) only on menus. Speed cues (Thumper): FOV +12°, radial blur, streaks, 1–2 px ship jitter.

**R12. Typography pairs** (max 3 families per screen, retrowave §4): A = Orbitron 900 chrome with a Mr Dafoe accent · B = Rajdhani 600 with Share Tech Mono · C = Orbitron 900 with **stroke-only red glow** (Stranger Things) and Share Tech Mono stats · D = Michroma or Orbitron 500 at 0.2 em tracking, with Share Tech Mono · comms = VT323 or Share Tech Mono.

**R13. UI chrome:** L-shaped corner brackets with 12 px arms at 2 px · tick rulers with 1 px ticks every 8 px and a major tick every 40 px · hairline frames at 40% alpha · 45° hazard stripes (10 px bands, orange/black, 120 px/s) **only** on warnings · one emblem per enemy faction (tDR) · off-red "system" text reserved for hostile or corrupted UI (CP2077). **No full chamfered or bevelled panel frames:** Ben rejected that look on `claude/hud-chrome-restyle`.

**R14. Sound pairing:** A = major-key arpeggios and gated snare · B = sax or pad (The Midnight) · C = distorted bass in a minor key, Carpenter-style pulses · D = clean square leads with pitch-bend bloops. Vector-arcade moments get a digitised voice line (Star Wars 1983). Big visual hits quantise to the music's beat (Neon Drive, Thumper).

## 4. What to avoid
Clichés that make it look cheap (critics call the style "derivative… superficial… caricature": [UMSU](https://umsu.unimelb.edu.au/news/article/7797/Purple-Skies-Cyan-Grids-The-Synthwave-Aesthetic/)):
1. The palm + Testarossa + sunset stack on every screen. The sun belongs to title, launch and slingshot only.
2. Bloom with a low threshold, so planets and text glow. Glow is post-only, on emissives (Tron 2.0, R3).
3. Full-saturation #FF00FF / #00FFFF on large fills. Fills stay flat mid-tones; saturation lives on lines.
4. Constant glitch, aberration or VHS during play. Use them as bursts or menu-only effects (Narita Boy's headaches).
5. More than 3 glowing hues in one scene, or rainbow trims.
6. Greeble-dense HUD panels. GMUNK cut greeble so the read is instant.
7. Chrome or script type on small or functional text. More than one script per screen.
8. Lens flares on every light. Allow one flare per scene, on the star or sun.
9. A full grid floor in deep space. Space grids are faint and local (R5).
10. Flooding a vector scene with white or pastel light. Tron RUN/r lost its black arena that way.

Keeping the textured 3D world from fighting the neon:
- **Grade, don't repaint (Blood Dragon).** Planet and asteroid textures: saturation ×0.6, value ×0.75, and hue-shift browns toward mauve or teal (Mann's no-earth-tones rule). Showcase planets are exempt.
- **Desaturated base, rare saturated accent (Tron: Legacy).** Metal surfaces sit near #748AA6. Saturated colour appears only on emissives.
- **Lit actors, graded sets (Sayonara).** Ships get a key light plus a coloured rim. Distant bodies are fog-graded toward #0B0620, not lit to full PBR.
- **Haze for separation (BR2049).** Inside nebulae, use `FogExp2` in the nebula's palette colour (never grey), density at most 0.035 in menus (retrowave §3.13). In open space, no fog.
- **Contrast floor (house rule).** A neon line keeps at least 3:1 luminance against what's behind it. Where it can't, add a 2 px #07030F under-stroke.

## 5. Mapping to Interstellar Slingshot surfaces
- **Title / launch:** palette A. Grid and sun per R5/R6; chrome Orbitron with a Mr Dafoe accent; a Kavinsky-style pilot persona line under the logo; flicker per R11; scanlines 0.3, barrel 0.04.
- **HUD panels:** palette B. Brackets, ticks and hairlines only (R13); numerals in Share Tech Mono, unglowed; Battlezone zoning, with the radar/threat band tinted `--sw-orange` and the flight data `--sw-cyan`. Scanlines 0.10 or less.
- **Mission Failed (`synthwave-fx.js`):** switch the screen to palette C. The title glows red on its stroke with a dark fill; the sun becomes R6's eclipsed sun; the tally stays bone #E8E0D8; aberration ramps per R9; Darksynth sound cue.
- **Warp tunnel (visual-flair #8):** palette D. A Tron grid tube (retrowave §3.9); Thumper speed cues (R11); aberration 0.004 on entry and exit; AfterimagePass only while warping.
- **Slingshot:** a Geometry Wars spring grid dented around the gravity body during the whip, at alpha 0.12. On a clean release, flash palette A's sun gradient along the trajectory line for 300 ms.
- **Enemies and wingmen:** edge-extracted vectors (retrowave §6) at R4 widths, in faction colours (R1). Each faction gets a tDR-style emblem on its ships and its comms header. Katana Zero-style ambient tint: rims take the local nebula colour at 30%.
- **Nebulae and black holes:** nebulae as Rez Area X particle fields, flat fills plus emissive filaments, with fog in the nebula's own hue. Black holes in palette C, with the eclipsed-sun disc and a magenta photon ring; no bloom on the accretion fill.
- **Planets:** grade per §4 (sat ×0.6, val ×0.75, browns → mauve); keep the existing rim shells (visual-flair #12) as the only glowing part, in the galaxy's palette hue; per-galaxy hue identity (Horizon Chase).
- **Explosions:** Resogun cube and segment shatter in the victim's faction colour, a white-hot core for 1 frame, then 900 ms segment decay (retrowave §6.7). No orange fireball sprites on vector ships.
- **Comms text:** a Josan-style inked portrait card, VT323 typed at 25 ms/char, and a Power Drive-style ship-AI persona. Off-red text only for pirate or corrupted transmissions.

## 6. Art bible in brief (pin this)
1. **Every pixel has one job:** flat world, glowing signal. Only emissives bloom.
2. **Three glowing hues per scene, max.** Faction colours never change: cyan for you, mint for wingmen, magenta for hostiles, orange for bosses.
3. **At least 80% of the frame is dark.** Neon covers 5% or less in flight.
4. **Grade the textured world, don't repaint it:** saturation ×0.6, value ×0.75, no earth tones.
5. **One register per scene:** Outrun (launch), Miami night (HUD), Darksynth (death/boss/black hole), Tron (warp/vector).
6. **The sun is a reward.** Title, launch and slingshot only. Its eclipsed version marks death and black holes.
7. **Lines:** ships 1.8–2.5 px, grid 1 px. Halos no wider than 4× the line in play.
8. **Grid:** horizon at 62% from the top, 18 columns, 14 k² rows. Faint and local in space.
9. **CRT, VHS and glitch are punctuation:** bursts of 120–400 ms in play, full strength only on menus and death.
10. **Type:** Orbitron for display, Rajdhani for UI, Share Tech Mono for numbers. One script accent per screen. Chrome at 48 px or larger.
11. **UI chrome is brackets, ticks and hairlines.** No chamfered panels, no greeble, hazard stripes only on warnings.
12. **The music sets the beat:** visual hits on the beat, one palette and track per boss, a voice line for big moments.
