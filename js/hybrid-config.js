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
        enemyPopulation: 'original',   // how many enemies you can see and fight
        enemyAI:         'overhaul',   // advanced behaviours (what enemies decide to do)
        enemyFlight:     'physical',   // how they move: momentum + nose + thrust  'physical' | 'overhaul'
        // — deep space —
        blackHoles:      'original',   // black hole + galaxy-core look
        nebulae:         'combined',   // 'combined' | 'overhaul' | 'original'
        nebulaDensity:   0.45,         // 0 = none … 1 = overhaul's full density
        skyWash:         'off',        // the overhaul's full-frame colour wash  'off' | 'on'
        farPlanetFade:   'bySize',     // far planets dim by apparent size, so giants stay lit  'bySize' | 'overhaul'
        // — effects and audio —
        explosions:      'original',
        weaponFx:        'original',
        sfx:             'original',
        music:           'original',
        // — interface —
        hud:             'original',
        notifications:   'original',   // also retires the wingman-message popup panel
        praiseText:      'original',
        intro:           'original',   // title screen, countdown, launch sequence
        // — new in the hybrid —
        solScale:        'big',        // Sol planets + Sun sized like other systems  'big' | 'overhaul'
        openingVista:    'on',         // start play with planets huge in frame       'on' | 'off'
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
