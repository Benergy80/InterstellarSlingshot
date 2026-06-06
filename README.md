# Interstellar Slingshot

A gravitational space explorer built in the browser with Three.js. Fly through eight galactic cores, slingshot around stars and black holes for free delta‑v, battle hostile factions across nebulas and outer systems, recruit wingmen, and ride emergency warps from one end of the universe to the other.

Live at **[interstellarslingshot.com](https://interstellarslingshot.com)**.

## Play

Open `index.html` in any modern desktop or mobile browser. A simple static server works too:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

From the launch screen pick **Start**, **Demo** (autopilot plays the game), or **Skip Intro** to drop straight into the Sol system.

The compiled Tailwind stylesheet (`css/tailwind.css`) is checked into the repo, so no `npm install` is needed to run the game.

### Rebuilding the stylesheet

Only needed if you change a Tailwind class in `index.html` or any `js/` file:

```sh
npm install            # one-time
npm run build:css      # writes css/tailwind.css (minified)
npm run watch:css      # rebuild on every change while developing
```

Config lives in `tailwind.config.js`; the source file is `src/tailwind.css`.

## What's in the universe

- **Sol system** — your home. Sun, eight named planets (Mercury → Neptune) on AU‑proportional orbits, Jupiter and Saturn with moon systems, a local asteroid belt.
- **Sagittarius A\*** and **Companion Core** — the two local supermassive black holes that anchor the warp network.
- **Eight distant galactic cores** distributed 25,000–75,000 units from origin — each themed (Spiral, Elliptical, Irregular, Ring, Dwarf, Lenticular, Quasar, Ancient).
- **Twin nebula clusters** 20,000–45,000 units out — civilian/military/commerce fleets cruise their interiors.
- **Outer interstellar systems** — Dune‑inspired sectors orbiting a hidden local gateway black hole, plus exotic systems and Borg patrol regions 55,000–90,000 units out.
- **The Dune Gateway** — a black hole 32 km below the Sol plane that hub‑and‑spokes a cluster of desert/spice systems.
- **Wormholes → the Minus World** — pass through one and the world inverts. Only way out is through another wormhole.

## Factions

- **Martian Pirates** — opportunist raiders that spawn near Sol.
- **Vulcan High Command** — disciplined patrols around Sagittarius A\*. Defeating their boss unlocks the galaxy‑to‑galaxy warp network.
- **UFOs** — hostile contacts in the exotic outer systems.
- **The Borg Collective** — far‑outer‑rim cube patrols. End‑game threat.
- **Wingmen Alpha / Beta / Gamma** — three friendly fighters at game start: Alpha holds station with you in Sol; Beta and Gamma fight Vulcans at Sgr A\*.

## Mechanics

- **Gravitational slingshot.** Fly close to any massive body (planet, star, black hole) and press **Enter** to bend trajectory around it and exit at boosted speed. Each body has its own slingshot radius proportional to mass.
- **Emergency warp (O double‑tap).** Burns one warp charge for a ~15‑second velocity boost toward your nav target. Earned by defeating enemies — not refilled automatically.
- **Tactical jump (W double‑tap).** Short‑range warp burst, scaled by distance to your target. No charge cost, energy gated.
- **Black‑hole transit.** Cross a black hole's event horizon to teleport. Before the Vulcan boss in Sol is defeated, transits land you back at Sgr A\* or the Companion Core. After the boss falls, the network opens — transits can drop you in any of the eight galactic cores. A white dotted **liberation path** appears in the sky to mark the unlock.
- **Shields.** Tab toggles reactive shields (auto‑raise on hull damage, drop on demand). Enemy ships also have orange directional shields — break with two laser hits or one missile to expose their hull.
- **Targeting.** The nav system locks any hostile within 3,000u (10,000u for black‑hole guardians). Mouse auto‑aim within ~400u for lasers. Missiles reach a bit further.
- **Discovery paths.** Visit a nebula center and a faction may spawn a dotted line leading to a hidden enemy stronghold. Follow it, clear the fight, then ride a black hole to the next galaxy.
- **Boss spawns.** Each faction's flagship arrives — alongside elite guardians — once the majority of that faction has been eliminated. Kill the boss and the rest of the faction routs.
- **Demo mode.** Press **T** at any time to hand off the ship to the autopilot. It plays the full loop: clears local enemies → warps to nebulas → follows discovery paths → traverses black holes → eventually engages the Borg at the rim. **ESC** returns control.

## Controls

| Action | Key |
|---|---|
| Thrust forward | **W** |
| Strafe left / right | **A / D** |
| Reverse | **S** |
| Roll left / right | **Q / E** |
| Look around | **Arrow keys** / mouse |
| Brake | **X** |
| Boost | **B** |
| Tactical jump (short warp) | **W W** (double‑tap) |
| Emergency warp | **O O** (double‑tap) or **Enter** at low speed |
| Gravitational slingshot | **Enter** near a body |
| Toggle shields | **Tab** |
| Fire lasers | **Space** |
| Fire missile | **Z** |
| Cycle target | **C** |
| Toggle view (1st / 3rd person) | **V** |
| Pause | **P** |
| Demo mode (autopilot) | **T** |
| Exit demo mode | **Esc** |
| Restart | **Shift+R** |

Mobile uses touch joysticks and gesture buttons rendered by `js/mobile-controls.js`.

## Soundtrack

26 location‑aware tracks under `audio/soundtrack/`, switched by a context‑detection loop in `js/game-music.js`:

- **Menu / intro** — `Launch Screen`, `Intro`
- **Sol & galactic cores** — `Galaxy 1`–`Galaxy 8`
- **Nebulas** — `nebula1`–`nebula5`
- **Combat** — `Boss Fight`, `Elite Guardians`
- **Borg** — `Borg`, `Beware the Borg`, `Beware the Borg2`
- **Exotic / far outer space** — `Far Outer Galaxy1`–`3`
- **Default interstellar** — `Main Outer Space Theme`
- **Game over** — `GAMEOVER1`, `GAMEOVER2`

Volume ducks 15% when no enemies are within 1,500u and ramps back to full in combat. The Skip Track button cycles the playlist.

## Tech

- **Engine:** [Three.js](https://threejs.org/) r128 (CDN, with a fallback loader if the primary CDN fails).
- **UI:** Tailwind CSS (precompiled, ~16 KB minified) + custom CSS in `css/`.
- **No bundler.** Vanilla JS modules loaded directly by `index.html`. Tailwind is the only build step and its output is committed.
- **Mobile aware:** automatic render‑tier downgrade (`_isMobileRenderTier()`) tunes star counts, shield opacity, and effect density.

## Repository layout

```
index.html               # Entry point
CNAME                    # Custom domain mapping
package.json             # Tailwind build scripts
tailwind.config.js       # Tailwind content scan paths
src/tailwind.css         # Tailwind source (compiled to css/tailwind.css)
css/                     # Stylesheets (styles.css + compiled tailwind.css)
images/                  # UI art, OG previews, planet textures
models/                  # GLB models (ships, asteroids, UFOs)
audio/soundtrack/        # 26 music tracks
js/
  game-core.js           # Animate loop, startup, scene wiring
  game-intro.js          # Launch screen + intro cinematic
  game-objects.js        # Universe construction (stars, planets, BHs, nebulas, factions)
  game-physics.js        # Velocity, slingshot, warps, BH transit, discovery paths
  game-controls.js       # Keyboard/mouse, weapons, shields, wingmen, targeting
  game-shields.js        # Player + enemy shield rendering and FX
  game-models.js         # GLB loaders
  game-ui.js             # HUD, nav panel, target reticles, mini‑map
  game-music.js          # Location‑aware soundtrack engine
  camera-system.js       # 1st / 3rd person, transitions, thruster glow
  autopilot.js           # Demo‑mode AI (phase machine)
  mobile-controls.js     # Touch input + on‑screen joysticks
  outer-systems.js       # Exotic / Borg patrol systems
  cosmic-features.js     # Wormholes, comets, distant nebulas
  nebula-types.js        # Nebula visual presets
  interstellar-asteroids.js
  civilian-combat.js     # Faction fleets, caravans, military engagements
ASTEROID_SETTINGS.md     # Asteroid tuning notes
ASTEROID_TYPES.md
PROGRESSION_SYSTEM.md    # Mission / liberation flow design notes
REMAINING_WORK.md
```

## Browser support

Targets recent Chrome, Firefox, Safari, and Edge on both desktop and mobile. Requires WebGL2 and ES2017+. Performance scales down automatically on mobile devices.

## Credit

Built by ChiLab. Three.js by mrdoob and contributors.
