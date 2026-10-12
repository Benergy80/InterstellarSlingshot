// =============================================================================
// HYBRID SWITCHBOARD — which build each system comes from.
//
// The hybrid = the star-explorer overhaul's WORLD and FEEL + the original game's
// vector-art CRAFT, ENEMIES, EFFECTS, HUD and INTRO (see HYBRID-BRIEF.md).
// Every system that was restored is gated on one entry here, so either version
// can be switched back on without touching code.
//
// Override for one session, from the URL:
//     index.html?hy=shields:blend,nebulaDensity:0.5
// Or from the console (persists in localStorage until cleared):
//     HYBRID.set('shields', 'blend')      HYBRID.reset()      HYBRID.show()
// Most switches are read when the world is built, so reload after changing one.
//
// Loaded first, before any other game script. Read a switch with:
//     HYBRID.is('playerShip', 'original')      HYBRID.num('nebulaDensity')
// =============================================================================
(function () {
    'use strict';

    // Defaults = Ben's decisions, 2026-09-26.  'original' | 'overhaul' unless noted.
    const DEFAULTS = {
        // — craft —
        playerShip:      'original',   // hull model, materials, textures (player + wingmen)
        thrusters:       'overhaul',   // engine plume animation           'overhaul' | 'original'
        shields:         'original',   // 'original' | 'blend' | 'overhaul'
        // — enemies —
        enemyLook:       'original',   // hostile + neutral ship models, glows, shells
        enemyThrusters:  'original',   // flat-colour exhaust cones, no textures  'original' | 'overhaul' (plume sprites)
        enemyPopulation: 'original',   // how many enemies you can see and fight
        enemyAI:         'overhaul',   // advanced behaviours (what enemies decide to do)
        enemyFlight:     'physical',   // how they move: momentum + nose + thrust  'physical' | 'overhaul'
        wingmanFlight:   'physical',   // Ben 2026-10-11: wingmen fly the enemies' flight model with per-wingman personalities (WINGMAN_FLIGHT, WINGMAN_PERSONALITIES)  'physical' | 'kinematic'
        // — deep space —
        blackHoles:      'original',   // black hole + galaxy-core look
        nebulae:         'combined',   // 'combined' | 'overhaul' | 'original'
        nebulaDensity:   0.45,         // 0 = none … 1 = overhaul's full density
        skyWash:         'off',        // the overhaul's full-frame colour wash  'off' | 'on'
        farPlanetFade:   'bySize',     // far planets dim by apparent size, so giants stay lit  'bySize' | 'overhaul'
        // Ben, 2026-09-27: "I don't just want some new asteroids, I want all of the
        // different asteroids from the original version."
        //   'original'  = ORIGINAL's asteroids: every kind, its own builder, look and behaviour
        //   'instanced' = the hybrid's rebuilt belts (HY_ROCKS: instanced rocks + spark clouds)
        //   'overhaul'  = the overhaul's (culled to dots at range)
        asteroids:       'original',
        // — effects and audio —
        explosions:      'original',   // 'combined' (old burst + new detonation) | 'original' | 'overhaul' — Ben 2026-10-10: newer effects PAUSED while testing ("so we can just see the original ones"); flip back to 'combined' when he says
        bossExplosion:   'epic',       // Ben 2026-10-11: "I want to improve the boss explosions." — death throe (hull blasts, tumble, flicker) → scaled final blast + shockwave + vector debris + hitstop + call-out (HY_BOSS_FX, hyBossDeath)  'epic' | 'original'
        weaponFx:        'original',
        sfx:             'original',
        music:           'original',
        // — interface —
        hud:             'original',
        notifications:   'original',   // also retires the wingman-message popup panel
        praiseText:      'original',
        intro:           'original',   // title screen, countdown, launch sequence
        hudArrows:       'original',   // Ben 2026-10-11: galaxy hostile countdown meter + nearest-enemy / boss edge arrows in the ORIGINAL SOS-arrow style  'original' | 'overhaul' (none)
        // — new in the hybrid —
        solScale:        'big',        // Sol planets + Sun sized like other systems  'big' | 'overhaul'
        openingVista:    'off',        // Ben, 2026-09-27: "the new starting view is bad, revert."  'on' | 'off'
        navWarp:         'on',         // O-warp with a nav target flies to it and parks facing it (demo-style arrival)  'on' | 'off'
        progression:     'campaign',   // Ben's campaign (Sol pirates → boss → Sgr A* → nebulae → 8 galaxies)  'campaign' | 'overhaul'
        warpTint:        'sector',     // warp streaks/tunnel coloured by where you are (nebula / Sol / galaxy)  'sector' | 'overhaul'
        slingshotFx:     'subtle',     // Ben 2026-10-10: tone the whip's flash/streaks/debris down so the swing round the planet reads  'subtle' | 'overhaul'
        warpHold:        'open',       // Ben 2026-10-11: emergency warps + slingshot glides last as long as needed; X or the nav destination ends them (HY_WARP_HOLD)  'open' | 'timed'
        warpFx:          'calm',       // Ben 2026-10-11: "Emergency Warp animation could be a little less intense" (HY_WARP_FX)  'calm' | 'overhaul'
        targetBracket:   'targeted',   // Ben 2026-10-11: the overhaul's bracket + tag, but only round the targeted enemy  'targeted' | 'overhaul' | 'off'
        demoSteering:    'steady',     // Ben 2026-10-11: the demo keeps its nose on the enemy — no showmanship look/roll nudges in combat  'steady' | 'overhaul'
        missionControl:  'alert',      // Ben 2026-10-11: campaign Mission Control lines through the big green MISSION COMMAND alert, as on the live branch  'alert' | 'channel'
        playerModel:     'XT-7small',  // Ben 2026-10-11: "keep both versions of the player ship as options, but use the new ship for now" — the player ship's GLB in models/ (file base name); ?hy=playerModel:Player flies the stock vector hull  'XT-7small' | 'Player' | '<file>'
        playerModelYaw:  90,           // degrees about Y baked into an alternate hull so its nose points +Z (the game's forward); the XT-7 needs 90, Player.glb 0
        bossModels:      'v2',         // Ben 2026-10-11: "These will need scaling and should replace the current boss models and UFO model. Keep the others in the github but use these instead" — models/Boss<n>-v2.glb baked to the stock Boss<n>.glb's size and nose (HY_MODEL_POSE, js/game-models.js)  'v2' | 'original'
        enemyModels:     'v2',         // Ben 2026-10-11: "Enemy1.glb … Enemy8.glb these will need scaling and the thruster plumes as well" + "and lights" — models/Enemy<n>-v2.glb baked to the stock fighters' median size (HY_MODEL_POSE._enemyRawLongest), plumes on the real nozzles + faction light elements (HY_HULL_POINTS)  'v2' | 'original'
        ufoModel:        'v2',         // same for models/UFO-v2.glb (laid flat, dome up)  'v2' | 'original'
        bossDifficulty:  'hard',       // Ben 2026-10-11: "bosses need to be 3x more difficult with evasive maneuvers and patterns of attack" — 2x health + shields, 1.5x damage, breaks under fire, a rotation of telegraphed attack patterns (HY_BOSS_AI, js/game-controls.js)  'hard' | 'original'
        startSide:       'farSide',    // Ben 2026-10-11: "the game should always start with somewhere on the opposite side of the sun from Sagittarius" — Earth's orbit phase is pinned at hand-off so the start sits across the Sun from Sgr A* (HY_START.FAR_SIDE_JITTER_DEG)  'farSide' | 'wherever'
        fillLight:       'on',         // Ben 2026-10-11: "some slight global illumination so we can see the ships" — a hemisphere fill + a touch more ambient on lit materials (HY_FILL, js/game-intro.js)  'on' | 'off'
        deathScreen:     'synthwave',  // Ben 2026-10-11: "keep the end screen from 8805" — MISSION FAILED as the arcade sequence with the alien beat-line landscape (js/synthwave-fx.js, css/synthwave.css)  'synthwave' | 'original'
        arcadeFeel:      'on',         // Ben 2026-10-12: "Can the game be made to be more arcade like?" + "better menu UI … modern … retro aesthetic but with modern polish" → package AK (js/arcade.js "ARCADE FEEL", css/synthwave.css): visible SCORE + COMBO ×N, kill-streak call-outs, "+points" pop-ups, high score (title / tally / pause), pause menu as the title's glass plate, 2 px kill shake (HY_ARCADE_FEEL)  'on' | 'off'
        titleScreen:     'original',   // Ben 2026-10-12: "I want the opening scene and take off sequence to be as they were for now" / "I do not like the 8803 and 8806 opening screen changes" — classic launch screen; the Earth-at-dawn title (package AH) stays selectable: ?hy=titleScreen:launch (chrome | landscape | poster are the AG sketches)
        haze:            'regional',   // distance haze varies by region: murky in nebulae, clear between galaxies (HY_HAZE)  'regional' | 'global'
        sun:             'burning',    // the local Sun as a burning star emitting light (HY_SUN)  'burning' | 'overhaul'
        outerSystems:    'frontier',   // outer systems rebuilt as the far frontier (HY_OUTER)  'frontier' | 'classic'
    };

    const KEY = 'hybridSwitches';
    const stored = (function () {
        try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
    })();
    const fromUrl = {};
    try {
        const raw = new URLSearchParams(location.search).get('hy');
        if (raw) raw.split(',').forEach(function (pair) {
            const i = pair.indexOf(':');
            if (i > 0) fromUrl[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
        });
    } catch (e) { /* no URL access — defaults apply */ }

    const coerce = function (k, v) {
        return typeof DEFAULTS[k] === 'number' ? (isFinite(parseFloat(v)) ? parseFloat(v) : DEFAULTS[k]) : String(v);
    };
    const values = Object.assign({}, DEFAULTS);
    [stored, fromUrl].forEach(function (src) {
        Object.keys(src).forEach(function (k) { if (k in DEFAULTS) values[k] = coerce(k, src[k]); });
    });

    window.HYBRID = {
        defaults: DEFAULTS,
        values: values,
        get: function (k) { return values[k]; },
        is: function (k, v) { return values[k] === v; },
        num: function (k) { return typeof values[k] === 'number' ? values[k] : parseFloat(values[k]); },
        set: function (k, v) {
            if (!(k in DEFAULTS)) { console.warn('HYBRID: no such switch', k); return; }
            values[k] = coerce(k, v);
            stored[k] = values[k];
            try { localStorage.setItem(KEY, JSON.stringify(stored)); } catch (e) { /* private mode */ }
            console.log('HYBRID: ' + k + ' = ' + values[k] + ' — reload to apply');
        },
        reset: function () {
            try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
            console.log('HYBRID: switches cleared — reload to apply defaults');
        },
        show: function () { console.table(values); return values; },
    };
})();
