// =============================================================================
// PROGRESSION — Ben's campaign (hybrid package O, switch `progression`)
//
//   SOL_PIRATES → SOL_BOSS → TO_SGR_A → SGR_VULCANS → SGR_LIBERATED →
//   NEBULA_VISIT → NEBULA_MISSION → NEBULA_SAVED → FACTION_GALAXY →
//   (next nebula …) → VICTORY when all 8 black-hole galaxies are cleared.
//
// A small explicit state machine that SEQUENCES systems the game already has:
// the Martian Pirate / Vulcan species bosses (checkSpeciesBossSpawn), the
// black-hole warp gate (isSolSystemLiberated), nebula deep discovery + lore +
// wingman recruiting (checkForNebulaDeepDiscovery), dotted mission lines
// (createDiscoveryPathToPosition / animateDiscoveryPaths: enemies → boss →
// line turns white), the boss spawner (spawnBossForArea) and the victory
// screen (showVictoryScreen). Voice: the bottom comms channel, 'lore'.
//
// Gravity tether: until the player leaves Sol on a slingshot, Sol's edge
// (_hySolLayout().edge from localSystemOffset) pulls the ship back — emergency
// warps included. A one-frame jump of > TELEPORT_U is a staged teleport (the
// keep guard, debug tools), not a flight, and never arms the tether. The demo
// autopilot is exempt (it is a showcase, not a campaign player), and
// window.__campaignTetherOff = true switches the tether off.
//
// Debug: window.__campaign = { state, phases, advance(), complete(phase),
// tetherOn, … } — a headless probe can walk the whole campaign.
// `?hy=progression:overhaul` = the game exactly as before this file.
// =============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined') return;

    // ── Guardians (kept outside the gate: package R may replace it) ──────────
    // spawnGuardians(galaxyId) → array of guardian ships at that galaxy's core.
    function _coreOf(galaxyId) {
        try {
            if (typeof findGalaxyCoreById === 'function') {
                const c = findGalaxyCoreById(galaxyId);
                if (c) return c;
            }
        } catch (e) { /* fall through */ }
        return null;
    }
    function _bodyR(o) {
        if (!o) return 0;
        let r = 0;
        const g = o.geometry;
        if (g) {
            if (g.parameters && g.parameters.radius) r = g.parameters.radius;
            else { if (!g.boundingSphere && g.computeBoundingSphere) g.computeBoundingSphere(); if (g.boundingSphere) r = g.boundingSphere.radius; }
        }
        const s = o.scale ? Math.max(o.scale.x, o.scale.y, o.scale.z) : 1;
        return Math.max(r * s, (o.userData && o.userData.radius) || 0);
    }
    // package R (enemies2) defines the real one in js/game-objects.js (roles,
    // size, escorts); this default only fills in if it is missing.
    if (typeof window.spawnGuardians !== 'function') window.spawnGuardians = function spawnGuardians(galaxyId) {
        const out = [];
        if (typeof spawnBossForArea !== 'function' || typeof THREE === 'undefined') return out;
        const core = _coreOf(galaxyId);
        let center = core ? core.position.clone() : null;
        if (!center && typeof getGalaxy3DPosition === 'function') { try { center = getGalaxy3DPosition(galaxyId); } catch (e) { center = null; } }
        if (!center) return out;
        const K = (window.HY_BH && window.HY_BH.CLEAR_RADII) || 6;
        const coreR = Math.max(_bodyR(core), 400);
        const ring = Math.max(K * coreR + 600, ((core && core.userData.warpThreshold) || 600) + 900);
        const gt = (typeof galaxyTypes !== 'undefined' && galaxyTypes[galaxyId]) || { faction: 'Hostile' };
        const n = 2 + (galaxyId % 2);                       // 2 or 3 guardians
        const a0 = Math.random() * Math.PI * 2;
        for (let i = 0; i < n; i++) {
            const a = a0 + i * (Math.PI * 2 / n);
            const pos = new THREE.Vector3(center.x + Math.cos(a) * ring, center.y + (i - 1) * 220, center.z + Math.sin(a) * ring);
            const key = galaxyId + '-campaign_guardian_' + i + '_' + Date.now();
            let b = null;
            try { b = spawnBossForArea(galaxyId, 'black_hole_guardian', key, pos, { factionLabel: gt.faction + ' Guardian' }); } catch (e) { b = null; }
            if (b && b.userData) {
                b.userData.isGuardian = true;
                b.userData.isCampaignGuardian = true;
                b.userData.name = 'Black Hole Guardian ' + (i + 1) + ' (' + gt.faction + ')';
                out.push(b);
            }
        }
        return out;
    };

    if (!window.HYBRID || !window.HYBRID.is('progression', 'campaign')) return;

    // ── constants ────────────────────────────────────────────────────────────
    const PHASES = ['SOL_PIRATES', 'SOL_BOSS', 'TO_SGR_A', 'SGR_VULCANS', 'SGR_LIBERATED',
        'NEBULA_VISIT', 'NEBULA_MISSION', 'NEBULA_SAVED', 'FACTION_GALAXY', 'VICTORY'];
    const P = {}; PHASES.forEach(function (p, i) { P[p] = i; });
    const GALAXIES = 8;
    const PIRATE_BOSS = '7-martianPirate_boss';
    const VULCAN_BOSS = '7-vulcanPatrol_boss';
    const SGR_ARRIVE = 9000;          // "at Sgr A*": within this of its centre
    const NEB_REVISIT = 1500;         // re-visit of an already charted nebula
    const GALAXY_ARRIVE = 18000;      // "in the faction galaxy": within this of its core
    const FORCE_SNAPSHOT_R = 40000;   // faction forces counted around the core
    const FORCE_MIN = 8, FORCE_MAX = 24;
    const TETHER_SOFT = 2500;         // pull zone beyond Sol's edge
    const TETHER_HARD = 3000;         // hard wall beyond Sol's edge
    const SLING_RECENT_MS = 30000;    // a slingshot this recent counts as "escape velocity"
    const TELEPORT_U = 8000;          // a one-frame jump bigger than this is a staged teleport
    const LORE = 'lore';

    // ── state ────────────────────────────────────────────────────────────────
    const C = {
        idx: 0, started: false, startedAt: 0, enteredAt: 0,
        cleared: {},                  // galaxyId → true (campaign-cleared)
        clearedOrder: [],
        usedNebulae: [],              // nebula objects whose mission has run
        nebula: null, nebulaGalaxy: -1, nebulaName: '', visitAt: 0, alliesAtVisit: 0,
        mission: null,                // { entry, site, kind, label }
        galaxy: null,                 // { g, step, forces, guardians, spawnedAt }
        grants: [],                   // [{ phase, label }]
        log: [],                      // [{ t, phase, how }]
        nebulaSaved: 0,
        perm: {},                     // permanent arcade weapon unlocks
        guideLabel: '',
    };
    const T = { escaped: false, lastSlingAt: 0, prevD: null, bound: false, lastMsgAt: 0, pulls: 0, clamps: 0, maxOver: 0, lastFlashAt: 0, warpCuts: 0 };

    const ie = function (name) { try { return (0, eval)(name); } catch (e) { return undefined; } };
    const gs = function () { return ie('gameState'); };
    const now = function () { return Date.now(); };
    const isDemo = function () { return !!(window.demoPilot && window.demoPilot.active); };

    // ── comms (one at a time, never over the tutorial) ───────────────────────
    const _q = []; let _lastSayAt = 0;
    function say(title, text) { _q.push({ title: title, text: text, at: now(), seq: C.log.length }); }
    function pumpComms() {
        if (!_q.length || typeof showIncomingTransmission !== 'function') return;
        const tut = ie('tutorialSystem');
        const head = _q[0];
        const tutBusy = tut && tut.active && !tut.completed && (now() - head.at) < 75000;
        if (tutBusy || now() - _lastSayAt < 9000) return;
        _q.shift(); _lastSayAt = now();
        try { showIncomingTransmission(head.title, head.text, LORE); } catch (e) { /* comms optional */ }
    }

    // ── world helpers ────────────────────────────────────────────────────────
    function cam() { return ie('camera'); }
    // localSystemOffset is a plain {x,y,z} (shifted in place by the floating
    // origin) — hand out a Vector3 copy
    const _solV = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
    function sol() { const o = window.localSystemOffset; return (o && _solV) ? _solV.set(o.x, o.y, o.z) : null; }
    function solEdge() {
        try {
            if (window.HYBRID && window.HYBRID.is('solScale', 'big') && typeof window._hySolLayout === 'function') {
                const e = window._hySolLayout().edge; if (e > 0) return e;
            }
        } catch (e) { /* fall through */ }
        // ORIGINAL scale: the farthest Sol planet + margin
        const s = sol(), pl = ie('planets') || [];
        let far = 0;
        if (s) for (let i = 0; i < pl.length; i++) {
            const p = pl[i]; if (!p || !p.userData) continue;
            if (!/^(Mercury|Venus|Earth|Mars|Jupiter|Saturn|Uranus|Neptune)$/.test(p.userData.name || '')) continue;
            far = Math.max(far, p.position.distanceTo(s) + _bodyR(p));
        }
        return (far || 5000) + 1500;
    }
    function sgrA() { const pl = ie('planets') || []; for (let i = 0; i < pl.length; i++) { const p = pl[i]; if (p && p.userData && p.userData.isSagittariusA) return p; } return null; }
    function aliveEnemies(pred) {
        const E = ie('enemies') || [], out = [];
        for (let i = 0; i < E.length; i++) { const e = E[i]; if (e && e.userData && e.userData.health > 0 && pred(e.userData, e)) out.push(e); }
        return out;
    }
    function isAlive(e) { const E = ie('enemies') || []; return !!(e && e.userData && e.userData.health > 0 && E.indexOf(e) !== -1); }
    function nearestTo(list, p) {
        let best = null, bd = Infinity;
        for (let i = 0; i < list.length; i++) { const d = list[i].position.distanceTo(p); if (d < bd) { bd = d; best = list[i]; } }
        return best;
    }
    const isPirate = function (u) { return u.isMartianPirate && !u.isVulcanPatrol && !u.isBoss && !u.isBossSupport; };
    const isVulcan = function (u) { return u.isVulcanPatrol && !u.isBoss && !u.isBossSupport; };
    function areaBoss(key) { const bs = ie('bossSystem'); return bs && bs.areaBosses ? bs.areaBosses[key] : null; }
    function galaxyName(g) { const gt = ie('galaxyTypes'); return gt && gt[g] ? gt[g].name + ' Galaxy' : 'Galaxy ' + g; }
    function factionOf(g) { const gt = ie('galaxyTypes'); return gt && gt[g] ? gt[g].faction : 'hostile'; }
    function loreOf(g) { const FL = window.FACTION_LORE || ie('FACTION_LORE'); const f = factionOf(g); return (FL && FL[f]) || null; }
    function factionColor(g) { const l = loreOf(g); if (l && l.color !== undefined) return l.color; const gt = ie('galaxyTypes'); return gt && gt[g] ? gt[g].color : 0xffffff; }
    function nebulaName(n) { return (n && n.userData && (n.userData.mythicalName || n.userData.name)) || 'the nebula'; }
    function nebulaGalaxy(n) {
        const NC = ie('nebulaClouds') || [];
        try { return resolveNebulaGalaxyId(n, classifyNebula(n), NC.indexOf(n)); } catch (e) { return -1; }
    }
    function eligibleNebulae() {
        const NC = ie('nebulaClouds') || [];
        return NC.filter(function (n) {
            if (!n || !n.userData || n.userData.isEscort) return false;
            if (C.usedNebulae.indexOf(n) !== -1) return false;
            const g = nebulaGalaxy(n);
            return g >= 0 && g < GALAXIES && !C.cleared[g];
        });
    }
    function pickTargetNebula() {
        const c = cam(); if (!c) return null;
        const el = eligibleNebulae(); if (!el.length) return null;
        const fresh = el.filter(function (n) { return !n.userData.deepDiscovered && !n.userData.isDistant && !n.userData.isExoticCore; });
        const fresh2 = el.filter(function (n) { return !n.userData.deepDiscovered; });
        return nearestTo(fresh.length ? fresh : (fresh2.length ? fresh2 : el), c.position);
    }

    // ── grants (power-ups through existing systems) ──────────────────────────
    function grant(phase, label, fn) {
        const g = gs(); if (!g) return;
        try { fn(g); } catch (e) { /* stat optional */ }
        if (typeof updateMissileUI === 'function') { try { updateMissileUI(); } catch (e) {} }
        C.grants.push({ phase: phase, label: label });
        if (window.arcade && window.arcade.flash) { try { window.arcade.flash('rgba(120,220,255,0.35)', 0.4); } catch (e) {} }
        if (typeof flashEventText === 'function') { try { flashEventText(label.toUpperCase(), '#66ffcc', 'CAMPAIGN REWARD'); } catch (e) {} }
    }
    // Permanent weapon unlocks ride the arcade power-up checks game-controls
    // already makes (hasPowerup('spread') = spread shot, 'overdrive' = fast cooldown).
    if (window.arcade && typeof window.arcade.hasPowerup === 'function' && !window.arcade.__campaignWrapped) {
        const _hp = window.arcade.hasPowerup;
        window.arcade.hasPowerup = function (t) { return !!C.perm[t] || _hp.apply(this, arguments); };
        window.arcade.__campaignWrapped = true;
    }

    // ── dotted guidance line (the discovery-path renderer, kept off the
    //    discoveryPaths list so the demo and the mission checker ignore it) ──
    const G = { targetFn: null, color: 0xffffff, label: '', entry: null, from: null, to: null, builtAt: 0, flowT: 0 };
    function disposeEntry(entry) {
        if (!entry) return;
        try { if (typeof _disposeDiscoveryPath === 'function') _disposeDiscoveryPath(entry); } catch (e) { /* ignore */ }
    }
    function buildLine(from, to, color, label) {
        if (typeof createDiscoveryPathToPosition !== 'function') return null;
        let line = null;
        try { line = createDiscoveryPathToPosition(from, to, color, label, 'core', -1); } catch (e) { return null; }
        if (!line) return null;
        const DP = window.discoveryPaths || ie('discoveryPaths') || [];
        for (let i = DP.length - 1; i >= 0; i--) {
            if (DP[i] && DP[i].line === line) {
                const e = DP.splice(i, 1)[0];
                line.userData.isCampaignGuide = true; line.userData.__dbTris = Infinity;
                // guidance must read at a glance: untone-mapped, brighter near end
                line.material.toneMapped = false; line.material.opacity = 0.95;
                const ca = line.geometry.attributes.color;
                if (ca) { for (let k = 0; k < ca.count; k++) { const b = 0.75 + 0.25 * (k / Math.max(1, ca.count - 1)); ca.setXYZ(k, b, b, b); } ca.needsUpdate = true; }
                if (e.particles) { e.particles.userData.__dbTris = Infinity; e.particles.material.toneMapped = false; }
                return e;
            }
        }
        return { line: line, particles: null };
    }
    function setGuide(targetFn, color, label) {
        G.targetFn = targetFn; G.color = color; G.label = label; C.guideLabel = label;
        disposeEntry(G.entry); G.entry = null; G.from = null; G.to = null; G.builtAt = 0;
        guideTick(true);
    }
    function clearGuide() { G.targetFn = null; C.guideLabel = ''; disposeEntry(G.entry); G.entry = null; }
    function guideTick(force) {
        const c = cam(); if (!G.targetFn || !c) return;
        let to = null; try { to = G.targetFn(); } catch (e) { to = null; }
        if (!to) { disposeEntry(G.entry); G.entry = null; return; }
        const d = c.position.distanceTo(to);
        const moved = G.from ? c.position.distanceTo(G.from) : Infinity;
        const tmoved = G.to ? to.distanceTo(G.to) : Infinity;
        const stale = moved > Math.max(1500, d * 0.12) || tmoved > 800;
        if (!force && G.entry && (!stale || now() - G.builtAt < 1500)) return;
        disposeEntry(G.entry);
        // start a little ahead of the ship so the line reads as leaving it
        const dir = to.clone().sub(c.position); const len = dir.length() || 1; dir.divideScalar(len);
        const from = c.position.clone().addScaledVector(dir, Math.min(300, len * 0.1));
        G.entry = buildLine(from, to, G.color, G.label);
        G.from = c.position.clone(); G.to = to.clone(); G.builtAt = now();
    }
    function flowGuide(dtF) {
        const p = G.entry && G.entry.particles; if (!p || !p.userData.flowPts) return;
        const ud = p.userData, pts = ud.flowPts, arr = p.geometry.attributes.position.array, n = ud.flowProg.length;
        for (let i = 0; i < n; i++) {
            ud.flowProg[i] = (ud.flowProg[i] + ud.flowSpd[i] * dtF) % 1;
            const f = ud.flowProg[i] * (pts.length - 1), k = Math.floor(f), a = pts[k], b = pts[Math.min(k + 1, pts.length - 1)], w = f - k;
            arr[i * 3] = a.x + (b.x - a.x) * w; arr[i * 3 + 1] = a.y + (b.y - a.y) * w; arr[i * 3 + 2] = a.z + (b.z - a.z) * w;
        }
        p.geometry.attributes.position.needsUpdate = true;
    }
    // rebuild guide + shift stored points on a floating-origin rebase
    window.__worldShiftHandlers = window.__worldShiftHandlers || [];
    window.__worldShiftHandlers.push(function (offset) {
        if (C.mission && C.mission.site) C.mission.site.sub(offset);
        if (G.from) G.from.sub(offset);
        if (G.to) G.to.sub(offset);
        if (G.entry) { disposeEntry(G.entry); G.entry = null; }
    });

    // ── phases ───────────────────────────────────────────────────────────────
    function enter(i, how) {
        C.idx = i; C.enteredAt = now();
        // briefings of phases already behind the player are stale
        for (let k = _q.length - 1; k >= 0; k--) if (_q[k].seq < C.log.length) _q.splice(k, 1);
        C.log.push({ t: Math.round((now() - C.startedAt) / 1000), phase: PHASES[i], how: how || 'event' });
        const fn = ENTER[PHASES[i]]; if (fn) { try { fn(); } catch (e) { console.warn('campaign enter ' + PHASES[i], e); } }
    }
    function next(how) {
        const cur = PHASES[C.idx];
        const done = DONE[cur]; if (done) { try { done(how); } catch (e) { console.warn('campaign done ' + cur, e); } }
        let n = C.idx + 1;
        if (cur === 'FACTION_GALAXY') n = (C.clearedOrder.length >= GALAXIES) ? P.VICTORY : P.NEBULA_VISIT;
        if (cur === 'VICTORY') return;
        enter(Math.min(n, P.VICTORY), how);
    }

    function piratePos() {
        const c = cam(); const pir = aliveEnemies(isPirate);
        const t = c ? nearestTo(pir, c.position) : null;
        if (t) return t.position.clone();
        const ab = areaBoss(PIRATE_BOSS); if (ab && ab.bossRef && isAlive(ab.bossRef)) return ab.bossRef.position.clone();
        return null;
    }

    const ENTER = {
        SOL_PIRATES: function () {
            const n = aliveEnemies(isPirate).length;
            say('Mission Control - Sol Under Attack',
                'Captain Bo, Martian pirates are raiding the Sol system' + (n ? ' — ' + n + ' raiders on scope' : '') +
                '. Destroy them and their flagship will show itself. Sol\'s gravity holds you here: only a gravitational slingshot can break you free.');
            // Ben, 2026-10-10: "what are the red dashed orbit lines? I don't
            // think we want them." No guide line in the Sol fight — his spec's
            // first dotted line appears after the flagship falls (TO_SGR_A).
            clearGuide();
        },
        SOL_BOSS: function () {
            say('Mission Control - Pirate Flagship',
                'The Martian Pirate flagship has committed to the fight. Take it down and Sol is ours.');
            clearGuide();
        },
        TO_SGR_A: function () {
            const s = sgrA(), c = cam();
            const d = s && c ? Math.round(s.position.distanceTo(c.position) / 1000) : null;
            say('Mission Control - Proceed to Sagittarius A*',
                'Sol is free. Sagittarius A*' + (d ? ', ' + d + ',000 u coreward,' : '') +
                ' is held by the Vulcan High Command. Slingshot around a planet to reach escape velocity, then follow the line to the black holes.');
            setGuide(function () { const q = sgrA(); return q ? q.position.clone() : null; }, 0xffffff, 'Sagittarius A*');
        },
        SGR_VULCANS: function () {
            const n = aliveEnemies(isVulcan).length;
            say('Mission Control - Vulcan Blockade',
                'Vulcan warships guard Sagittarius A*' + (n ? ' — ' + n + ' on scope' : '') +
                '. Destroy them and their flagship to liberate the core. Until then the black holes will only throw you back to this region.');
            setGuide(function () {
                const c = cam(); if (!c) return null;
                const v = nearestTo(aliveEnemies(isVulcan), c.position); if (v) return v.position.clone();
                const ab = areaBoss(VULCAN_BOSS); if (ab && ab.bossRef && isAlive(ab.bossRef)) return ab.bossRef.position.clone();
                return null;
            }, 0x66ccff, 'Vulcan High Command');
        },
        SGR_LIBERATED: function () {
            // the campaign draws its own line; the legacy white Sgr A* → twin line would be a second one
            if (!isDemo() && window.liberationNebulaPath) window.liberationNebulaPath.visible = false;
            say('Mission Control - Sagittarius A* Liberated',
                'The core is free, Captain. Every black hole is now open to you — they can carry you anywhere in the galaxy. A nebula lies close by: its people may lend you a wingman. Follow the line.');
            C._libTarget = pickTargetNebula();
            setGuide(function () { return C._libTarget ? C._libTarget.position.clone() : null; }, 0xffffff, 'Nearest Nebula');
        },
        NEBULA_VISIT: function () {
            C.nebula = null; C.nebulaGalaxy = -1; C.mission = null; C.galaxy = null;
            const t = (C._libTarget && eligibleNebulae().indexOf(C._libTarget) !== -1) ? C._libTarget : pickTargetNebula();
            C._target = t; C._libTarget = null;
            if (C.idx === P.NEBULA_VISIT && C.clearedOrder.length > 0 && t) {
                say('Mission Control - New Heading',
                    (GALAXIES - C.clearedOrder.length) + ' galaxies remain under occupation. ' + nebulaName(t) +
                    ' has not yet been charted — its people know the next faction. More nebulae, more wingmen for the hard fights ahead.');
            }
            setGuide(function () { return C._target ? C._target.position.clone() : null; }, 0xffffff, t ? nebulaName(t) : 'Nebula');
        },
        NEBULA_MISSION: function () {
            clearGuide();
            buildMission();
        },
        NEBULA_SAVED: function () {
            const g = C.nebulaGalaxy;
            say('Mission Control - ' + nebulaName(C.nebula) + ' Saved',
                'You saved ' + nebulaName(C.nebula) + ', Captain. Command orders you to the ' + galaxyName(g) +
                ' to finish the ' + factionOf(g) + ' at their black hole. Any black hole can take you there now — or follow the line.');
            setTimeout(function () { if (PHASES[C.idx] === 'NEBULA_SAVED') next('auto'); }, 4000);
        },
        FACTION_GALAXY: function () {
            const g = C.nebulaGalaxy >= 0 ? C.nebulaGalaxy : firstUnclearedGalaxy();
            C.galaxy = { g: g, step: 'travel', forces: [], guardians: [], spawnedAt: 0 };
            setGuide(function () { const c = _coreOf(g); return c ? c.position.clone() : null; }, factionColor(g), galaxyName(g) + ' Core');
        },
        VICTORY: function () {
            clearGuide();
            const g = gs(); if (g) g.galaxiesCleared = GALAXIES;
            say('Mission Control - Victory',
                'All eight black-hole galaxies are free. The occupation is broken, Captain Bo. Well flown.');
            // the game's own campaign-win beat: fireworks + victory music, then
            // the best-moments replay (victory-replay.js); the static victory
            // screen only when the replay system is missing
            try { if (typeof createFireworkCelebration === 'function') createFireworkCelebration(); } catch (e) {}
            try { if (typeof playVictoryMusic === 'function') playVictoryMusic(); } catch (e) {}
            setTimeout(function () {
                try {
                    if (window.replaySystem && typeof window.replaySystem.start === 'function') window.replaySystem.start();
                    else if (typeof showVictoryScreen === 'function') showVictoryScreen();
                } catch (e) {}
            }, 6000);
        },
    };

    const DONE = {
        SOL_PIRATES: function () {
            grant('SOL_PIRATES', 'Missiles restocked, warheads +1', function (g) { if (g.missiles) { g.missiles.current = g.missiles.capacity; g.missiles.damage = (g.missiles.damage || 3) + 1; } });
        },
        SOL_BOSS: function () {
            grant('SOL_BOSS', 'Hull plating +25', function (g) { g.maxHull = (g.maxHull || 100) + 25; g.hull = g.maxHull; });
            grant('SOL_BOSS', 'Emergency warp charge +1', function (g) { g.emergencyWarp.available = (g.emergencyWarp.available || 0) + 1; });
        },
        SGR_VULCANS: function () {
            grant('SGR_VULCANS', 'Spread shot unlocked', function () { C.perm.spread = true; });
        },
        NEBULA_MISSION: function () {
            C.nebulaSaved++;
            if (C.nebulaSaved === 1) grant('NEBULA_MISSION', 'Overdrive cannons (fire rate up)', function () { C.perm.overdrive = true; });
            else grant('NEBULA_MISSION', 'Energy core +15', function (g) { g.maxEnergy = (g.maxEnergy || 100) + 15; g.energy = g.maxEnergy; });
            grant('NEBULA_MISSION', 'Emergency warp charge +1', function (g) { g.emergencyWarp.available = (g.emergencyWarp.available || 0) + 1; });
        },
        FACTION_GALAXY: function () {
            const g = C.galaxy ? C.galaxy.g : -1;
            if (g >= 0 && !C.cleared[g]) { C.cleared[g] = true; C.clearedOrder.push(g); }
            const gsv = gs(); if (gsv) gsv.galaxiesCleared = C.clearedOrder.length;
            grant('FACTION_GALAXY', 'Hull +25, warp charges +2, missiles restocked', function (s) {
                s.maxHull = (s.maxHull || 100) + 25; s.hull = s.maxHull;
                s.emergencyWarp.available = (s.emergencyWarp.available || 0) + 2;
                if (s.missiles) s.missiles.current = s.missiles.capacity;
            });
            if (typeof refreshEnemyDifficulty === 'function') { try { refreshEnemyDifficulty(); } catch (e) {} }
            if (C.clearedOrder.length < GALAXIES) {
                say('Mission Control - ' + galaxyName(g) + ' Cleared',
                    'The ' + factionOf(g) + ' are broken and their guardians destroyed. ' + C.clearedOrder.length + ' of ' + GALAXIES + ' galaxies free.');
            }
        },
    };
    function firstUnclearedGalaxy() { for (let g = 0; g < GALAXIES; g++) if (!C.cleared[g]) return g; return 0; }

    // ── nebula mission: a remote host of the lore's faction, swarming a
    //    civilian convoy or harassing a planet ───────────────────────────────
    function openSite(p, clear) {
        const pl = ie('planets') || [];
        for (let i = 0; i < pl.length; i++) {
            const b = pl[i]; if (!b || !b.userData || b.userData.type === 'asteroid') continue;
            const d = b.position.distanceTo(p) - _bodyR(b);
            if (d < (b.userData.type === 'blackhole' ? clear * 2.5 : clear)) return false;
        }
        return true;
    }
    function pickMissionSite(nebula, kindWanted) {
        const np = nebula.position, s = sol(), edge = solEdge();
        const pl = ie('planets') || [];
        if (kindWanted === 'planet') {
            let best = null, bs = Infinity;
            for (let i = 0; i < pl.length; i++) {
                const b = pl[i]; if (!b || !b.userData || b.userData.type !== 'planet') continue;
                const d = b.position.distanceTo(np);
                if (d < 12000 || d > 45000) continue;
                if (s && b.position.distanceTo(s) < edge + 5000) continue;
                if (b.userData.nebulaId !== undefined && b.position.distanceTo(np) < 15000) continue;
                const sc = Math.abs(d - 22000); if (sc < bs) { bs = sc; best = b; }
            }
            if (best) {
                const R = _bodyR(best);
                const dir = np.clone().sub(best.position).normalize();
                return { kind: 'planet', site: best.position.clone().addScaledVector(dir, R * 2.2 + 900), label: best.userData.name || 'a colony world', body: best };
            }
        }
        for (let k = 0; k < 16; k++) {
            const a = Math.random() * Math.PI * 2, y = (Math.random() - 0.5) * 0.4;
            const dir = new THREE.Vector3(Math.cos(a), y, Math.sin(a)).normalize();
            const p = np.clone().addScaledVector(dir, 18000 + Math.random() * 6000);
            if (s && p.distanceTo(s) < edge + 5000) continue;
            if (openSite(p, 4000)) return { kind: 'convoy', site: p, label: nebulaName(nebula) + ' relief convoy' };
        }
        const dir = np.clone().normalize(); if (!dir.lengthSq()) dir.set(1, 0, 0);
        return { kind: 'convoy', site: np.clone().addScaledVector(dir, 20000), label: nebulaName(nebula) + ' relief convoy' };
    }
    function spawnConvoy(site, label) {
        if (typeof createTradingShip !== 'function') return 0;
        const fake = { position: site.clone(), userData: { name: label, size: 1400 } };
        let n = 0;
        for (let i = 0; i < 5; i++) { try { createTradingShip(fake, i); n++; } catch (e) { /* civilian optional */ } }
        return n;
    }
    function buildMission() {
        const neb = C.nebula, g = C.nebulaGalaxy; if (!neb || g < 0) return;
        const DP = window.discoveryPaths || ie('discoveryPaths') || [];
        const faction = factionOf(g), color = factionColor(g);
        // the discovery just opened its own path from this nebula; in play the
        // campaign re-aims it at the remote host, in the demo it adopts it as is
        let own = null;
        for (let i = DP.length - 1; i >= 0; i--) {
            const e = DP[i]; if (!e || !e.line || !e.line.userData || e.line.userData.missionComplete) continue;
            const sp = e.line.userData.startPosition;
            if (sp && sp.distanceTo(neb.position) < 60 && (e.line.userData.createdAt || 0) >= C.visitAt - 3000) { own = e; break; }
        }
        let site, entry = null;
        if (isDemo() && own) {
            entry = own; site = { kind: 'outpost', site: own.line.userData.endPosition.clone(), label: faction + ' forces' };
        } else {
            if (own) { DP.splice(DP.indexOf(own), 1); disposeEntry(own); }
            site = pickMissionSite(neb, (C.usedNebulae.length % 2 === 1) ? 'planet' : 'convoy');
            if (site.kind === 'convoy') site.civilians = spawnConvoy(site.site, site.label);
            // package R: the lore faction's host, swarming the convoy or harassing the planet
            if (typeof window.spawnMissionHost === 'function') {
                try { window.spawnMissionHost(site.kind === 'planet' ? 'planet' : 'civilian-fleet', site.site, faction, 9); } catch (e) { /* host optional */ }
            }
            try { createDiscoveryPathToPosition(neb.position, site.site, color, faction, 'core', g); } catch (e) { /* path optional */ }
            entry = DP[DP.length - 1] || null;
            // same legibility as the guide lines (the mission checker recolours
            // material.color to white on completion; that still works)
            if (entry && entry.line && entry.line.material) { entry.line.material.toneMapped = false; entry.line.material.opacity = 0.9; entry.line.userData.__dbTris = Infinity; }
        }
        C.mission = { entry: entry, site: site.site, kind: site.kind, label: site.label, civilians: site.civilians || 0, enemies: entry && entry.missionEnemies ? entry.missionEnemies.length : 0 };
        if (C.usedNebulae.indexOf(neb) === -1) C.usedNebulae.push(neb);
        const what = site.kind === 'planet' ? ('harassing ' + site.label)
            : site.kind === 'convoy' ? ('swarming the ' + site.label) : 'massing beyond the nebula';
        const lore = loreOf(g);
        say('Mission Control - ' + nebulaName(neb),
            nebulaName(neb) + ' reports ' + faction + ' warships ' + what + '. ' +
            (lore && lore.threat ? String(lore.threat).split('\n')[0].slice(0, 160) + ' ' : '') +
            'Follow the line from the nebula and drive them off.');
    }

    // ── per-tick phase checks ────────────────────────────────────────────────
    let _spawnedFallbackAt = 0;
    const _seenDiscovered = new Set();
    function checkPhase() {
        const c = cam(); if (!c) return;
        // a nebula charted outside the visit window is not "this visit"
        if (C.idx < P.SGR_LIBERATED || C.idx > P.NEBULA_VISIT) {
            const NC = ie('nebulaClouds') || [];
            for (let i = 0; i < NC.length; i++) { const n = NC[i]; if (n && n.userData && n.userData.deepDiscovered) _seenDiscovered.add(n); }
        }
        // the legacy white Sgr A* line fires off the same gate; the campaign line replaces it
        if (C.idx >= P.SGR_LIBERATED && !isDemo() && window.liberationNebulaPath && window.liberationNebulaPath.visible) window.liberationNebulaPath.visible = false;
        switch (PHASES[C.idx]) {
            case 'SOL_PIRATES': {
                const ab = areaBoss(PIRATE_BOSS);
                const bs = ie('bossSystem');
                const ever = bs && bs.speciesEverExisted && bs.speciesEverExisted.martianPirate;
                if (ab || (ever && aliveEnemies(isPirate).length === 0) || (!ever && now() - C.enteredAt > 20000 && aliveEnemies(isPirate).length === 0)) next();
                break;
            }
            case 'SOL_BOSS': {
                const ab = areaBoss(PIRATE_BOSS);
                if (ab && (ab.defeated || (ab.bossRef && !isAlive(ab.bossRef)))) { next(); break; }
                if (!ab && now() - C.enteredAt > 3000 && now() - _spawnedFallbackAt > 10000) {
                    _spawnedFallbackAt = now(); spawnSpeciesBoss('martianPirate', PIRATE_BOSS, sol(), 0, 'Martian Pirate');
                }
                break;
            }
            case 'TO_SGR_A': {
                const s = sgrA();
                if (s && c.position.distanceTo(s.position) < SGR_ARRIVE) next();
                break;
            }
            case 'SGR_VULCANS': {
                if (_origLiberated()) { next(); break; }
                const ab = areaBoss(VULCAN_BOSS);
                if (!ab && aliveEnemies(isVulcan).length === 0 && now() - C.enteredAt > 4000 && now() - _spawnedFallbackAt > 10000) {
                    _spawnedFallbackAt = now(); const s = sgrA();
                    spawnSpeciesBoss('vulcanPatrol', VULCAN_BOSS, s ? s.position.clone().add(new THREE.Vector3(2600, 200, 2600)) : null, 7, 'Vulcan High Command');
                }
                break;
            }
            case 'SGR_LIBERATED': {
                if (now() - C.enteredAt > 6000) next('auto');
                break;
            }
            case 'NEBULA_VISIT': {
                if (!C._target || eligibleNebulae().indexOf(C._target) === -1) { C._target = pickTargetNebula(); if (C._target) setGuide(function () { return C._target ? C._target.position.clone() : null; }, 0xffffff, nebulaName(C._target)); }
                if (!C.nebula) {
                    const v = detectVisit();
                    if (v) {
                        C.nebula = v.nebula; C.nebulaGalaxy = v.g; C.visitAt = now(); C.nebulaName = nebulaName(v.nebula);
                        const allies = ie('allyShips'); C.alliesAtVisit = allies ? allies.length : 0;
                        if (v.revisit && typeof recruitNebulaWingman === 'function') { try { recruitNebulaWingman(C.nebulaName); } catch (e) {} }
                        clearGuide();
                    }
                } else {
                    // the discovery recruits its wingman ~1.5 s later: wait for it (max 6 s)
                    const allies = ie('allyShips');
                    if ((allies && allies.length > C.alliesAtVisit) || now() - C.visitAt > 6000) {
                        C.wingmanJoined = !!(allies && allies.length > C.alliesAtVisit);
                        next();
                    }
                }
                break;
            }
            case 'NEBULA_MISSION': {
                const e = C.mission && C.mission.entry;
                if (e && e.line && e.line.userData && e.line.userData.missionComplete) next();
                break;
            }
            case 'FACTION_GALAXY': galaxyTick(c); break;
            default: break;
        }
    }
    function spawnSpeciesBoss(key, areaKey, pos, modelG, label) {
        if (typeof spawnBossForArea !== 'function' || !pos) return;
        const bs = ie('bossSystem'); if (bs) { bs.speciesBossSpawned = bs.speciesBossSpawned || {}; bs.speciesBossSpawned[key] = true; }
        try { spawnBossForArea(7, key + '_boss', areaKey, new THREE.Vector3(pos.x, pos.y, pos.z), { modelGalaxyId: modelG, factionLabel: label }); } catch (e) {}
    }
    function detectVisit() {
        const NC = ie('nebulaClouds') || [], c = cam();
        let hit = null;
        for (let i = 0; i < NC.length; i++) {
            const n = NC[i]; if (!n || !n.userData) continue;
            const fresh = n.userData.deepDiscovered && !_seenDiscovered.has(n);
            if (n.userData.deepDiscovered) _seenDiscovered.add(n);
            if (hit) continue;
            if (C.usedNebulae.indexOf(n) !== -1) continue;
            const g = nebulaGalaxy(n); if (g < 0 || g >= GALAXIES || C.cleared[g]) continue;
            if (fresh) hit = { nebula: n, g: g, revisit: false };
            else if (n.userData.deepDiscovered && c && n === C._target && c.position.distanceTo(n.position) < NEB_REVISIT) hit = { nebula: n, g: g, revisit: true };
        }
        return hit;
    }
    function galaxyTick(c) {
        const GX = C.galaxy; if (!GX) return;
        const core = _coreOf(GX.g);
        if (GX.step === 'travel') {
            if (core && c.position.distanceTo(core.position) < GALAXY_ARRIVE) {
                snapshotForces(GX, core);
                GX.step = 'forces';
                say('Mission Control - ' + galaxyName(GX.g),
                    'You are in ' + factionOf(GX.g) + ' space. ' + GX.forces.length + ' warships hold the ' + galaxyName(GX.g) +
                    '. Clear them all — the Black Hole Guardians will not show themselves until you do.');
                setGuide(function () { const t = nearestTo(GX.forces.filter(isAlive), cam().position); return t ? t.position.clone() : null; }, factionColor(GX.g), factionOf(GX.g) + ' forces');
            }
            return;
        }
        if (GX.step === 'forces') {
            if (GX.forces.filter(isAlive).length === 0) {
                GX.guardians = window.spawnGuardians(GX.g) || [];
                GX.spawnedAt = now(); GX.step = 'guardians';
                say('Mission Control - Black Hole Guardians',
                    'Forces cleared — and the core answers. ' + GX.guardians.length + ' Black Hole Guardians have emerged at the ' + galaxyName(GX.g) +
                    ' core. Only their destruction frees this galaxy. Bring your wingmen.');
                setGuide(function () { const t = nearestTo(GX.guardians.filter(isAlive), cam().position); return t ? t.position.clone() : null; }, 0xff2266, 'Black Hole Guardians');
            }
            return;
        }
        if (GX.step === 'guardians') {
            if (now() - GX.spawnedAt > 1500 && GX.guardians.filter(isAlive).length === 0) next();
        }
    }
    function snapshotForces(GX, core) {
        const cp = core.position;
        const list = aliveEnemies(function (u, e) {
            return u.galaxyId === GX.g && !u.isBoss && !u.isBossSupport && !u.isEliteGuardian && !u.isGuardian &&
                !u.isBlackHoleGuardian && !u.isMartianPirate && !u.isVulcanPatrol && e.position.distanceTo(cp) < FORCE_SNAPSHOT_R;
        }).sort(function (a, b) { return a.position.distanceTo(cp) - b.position.distanceTo(cp); }).slice(0, FORCE_MAX);
        if (list.length < FORCE_MIN && typeof spawnMissionEnemyAt === 'function') {
            const K = (window.HY_BH && window.HY_BH.CLEAR_RADII) || 6, ring = K * Math.max(_bodyR(core), 400) + 2500;
            for (let i = list.length; i < FORCE_MIN; i++) {
                const a = Math.random() * Math.PI * 2;
                const p = new THREE.Vector3(cp.x + Math.cos(a) * ring, cp.y + (Math.random() - 0.5) * 800, cp.z + Math.sin(a) * ring);
                try { const e = spawnMissionEnemyAt(GX.g, p); if (e) list.push(e); } catch (e) { break; }
            }
        }
        GX.forces = list;
    }
    function _forceClearGalaxy() {
        // debug only: everything the step is waiting on dies quietly
        const GX = C.galaxy; if (!GX) return;
        (GX.forces || []).concat(GX.guardians || []).forEach(function (e) { if (e && e.userData) e.userData.health = 0; });
    }

    // ── black-hole warp gate: the campaign decides when they open ────────────
    const _origLib = (typeof window.isSolSystemLiberated === 'function') ? window.isSolSystemLiberated : null;
    function _origLiberated() { try { return _origLib ? !!_origLib() : false; } catch (e) { return false; } }
    window.isSolSystemLiberated = function () {
        if (isDemo()) return _origLiberated() || C.idx >= P.SGR_LIBERATED;
        return C.idx >= P.SGR_LIBERATED;
    };
    // the twin-pair "final white path" is the overhaul's own next step — the
    // campaign's FACTION_GALAXY order replaces it (the demo keeps it)
    if (typeof window.checkTwinPairCampaign === 'function') {
        const _twin = window.checkTwinPairCampaign;
        window.checkTwinPairCampaign = function () { if (isDemo()) return _twin.apply(this, arguments); };
    }
    // campaign owns victory: the legacy counters can no longer end the game early
    if (typeof window.checkVictoryCondition === 'function') {
        window.checkVictoryCondition = function () { return C.idx === P.VICTORY; };
    }
    // tutorial: the opening lines become the Sol briefing
    (function () {
        const tut = ie('tutorialSystem'); if (!tut || !tut.messages) return;
        tut.messages.forEach(function (m) {
            if (m.title === 'Primary Objective') m.text = 'Martian pirates are raiding Sol. Destroy them, then their flagship. Left-click or Option fires; hold Space to lock.';
            if (m.title === 'Emergency Systems') m.text = 'Sol\'s gravity well holds you here — thrusters and emergency warps can\'t break it. A slingshot can.';
            if (m.title === 'Final Orders') m.text = 'Then make for Sagittarius A* and the Vulcan blockade. Free the core and the galaxy opens to you. Good luck, Captain.';
        });
    })();

    // ── gravity tether ───────────────────────────────────────────────────────
    function tetherOn() {
        const g = gs();
        return C.started && C.idx <= P.TO_SGR_A && !T.escaped && !window.__campaignTetherOff && !isDemo() &&
            !!g && g.gameStarted && !g.gameOver && !g.paused;
    }
    function tetherFrame(dtF) {
        const g = gs(), c = cam(), s = sol(); if (!g || !c || !s) return;
        if (g.slingshot && (g.slingshot.active || g.slingshotWhip || g.slingshotLaunchRamp)) T.lastSlingAt = now();
        const d = c.position.distanceTo(s);
        if (T.prevD !== null && Math.abs(d - T.prevD) > TELEPORT_U) { T.prevD = d; T.bound = false; return; }   // staged teleport
        const prev = T.prevD; T.prevD = d;
        if (!tetherOn()) { T.bound = false; return; }
        const edge = solEdge();
        if (d <= edge) { T.bound = false; return; }
        if (prev !== null && prev <= edge && !T.bound) {
            if (now() - T.lastSlingAt < SLING_RECENT_MS || g.isBlackHoleWarping) {
                T.escaped = true;
                say('Mission Control - Escape Velocity',
                    'Slingshot escape confirmed — you\'ve broken free of Sol\'s gravity well. Sagittarius A* awaits, Captain.');
                return;
            }
            T.bound = true; T.pulls++;
        }
        if (!T.bound) return;
        const over = d - edge; T.maxOver = Math.max(T.maxOver, over);
        const inward = s.clone().sub(c.position).divideScalar(d);
        const vv = g.velocityVector;
        const outward = -vv.dot(inward);
        // bleed the outward velocity (flight code re-aims velocity along the
        // nose every frame, so this alone cannot win) …
        if (outward > 0) vv.addScaledVector(inward, outward * Math.min(1, (1 - Math.pow(0.9, dtF)) * (1 + over / 800)));
        // … so the well also moves the ship itself: it cancels this frame's
        // outward progress (fully by 1,000 u past the edge) and reels it in
        const outRate = (prev !== null) ? Math.max(0, d - prev) : 0;
        const reel = outRate * Math.min(1, 0.35 + over / 1000) + dtF * (0.5 + over / 300);
        c.position.addScaledVector(inward, Math.min(reel, over + 50));
        const ew = g.emergencyWarp;
        if (ew && ew.active) { ew.timeRemaining = Math.min(ew.timeRemaining, 1); T.warpCuts++; }
        if (over > TETHER_HARD) {
            c.position.copy(s).addScaledVector(inward, -(edge + TETHER_HARD));
            const o2 = -vv.dot(inward); if (o2 > 0) vv.addScaledVector(inward, o2);
            T.clamps++;
        }
        if (now() - T.lastFlashAt > 1500 && window.arcade && window.arcade.flash) {
            T.lastFlashAt = now(); try { window.arcade.flash('rgba(90,160,255,0.22)', 0.35); } catch (e) {}
        }
        if (now() - T.lastMsgAt > 25000) {
            T.lastMsgAt = now();
            say('Mission Control - Sol Gravity Well',
                'Captain, Sol\'s gravity is dragging you back — no engine, warp drive included, can break it alone. Slingshot around a planet (press Enter near a world) to reach escape velocity.');
            pumpCommsNow();
        }
    }
    function pumpCommsNow() { _lastSayAt = 0; const tut = ie('tutorialSystem'); if (tut && tut.active && !tut.completed) { const m = _q.pop(); if (m) { try { showIncomingTransmission(m.title, m.text, LORE); } catch (e) {} _lastSayAt = now(); } } else pumpComms(); }

    // ── loop ─────────────────────────────────────────────────────────────────
    let _frame = 0;
    function loop() {
        requestAnimationFrame(loop);
        const g = gs(); if (!g) return;
        const dtF = Math.max(0.25, Math.min(3, g.dtFrames || 1));
        if (!C.started) {
            const pl = ie('planets');
            if (g.gameStarted && !g.gameOver && pl && pl.length > 50 && sol() && cam()) {
                C.started = true; C.startedAt = now(); enter(P.SOL_PIRATES, 'start');
            } else return;
        }
        try { tetherFrame(dtF); } catch (e) { /* never break the frame */ }
        flowGuide(dtF);
        if ((_frame++ % 15) === 0) {
            try { checkPhase(); } catch (e) { console.warn('campaign tick', e); }
            try { guideTick(false); } catch (e) { /* guide optional */ }
            if (C.idx < P.VICTORY) g.galaxiesCleared = C.clearedOrder.length;
            pumpComms();
        }
    }
    requestAnimationFrame(loop);

    // ── debug / verification hooks ───────────────────────────────────────────
    window.__campaign = {
        get state() { return PHASES[C.idx]; },
        phases: PHASES.slice(),
        get tetherOn() { return tetherOn(); },
        get tether() { return Object.assign({ edge: solEdge(), on: tetherOn() }, T); },
        get cleared() { return C.clearedOrder.slice(); },
        get grants() { return C.grants.slice(); },
        get log() { return C.log.slice(); },
        get guide() { return G.entry ? { label: G.label, from: G.from && G.from.toArray().map(Math.round), to: G.to && G.to.toArray().map(Math.round) } : null; },
        get mission() { return C.mission ? { kind: C.mission.kind, label: C.mission.label, site: C.mission.site.toArray().map(Math.round), enemies: C.mission.enemies, civilians: C.mission.civilians, complete: !!(C.mission.entry && C.mission.entry.line && C.mission.entry.line.userData.missionComplete) } : null; },
        get galaxy() { return C.galaxy ? { g: C.galaxy.g, name: galaxyName(C.galaxy.g), step: C.galaxy.step, forces: C.galaxy.forces.filter(isAlive).length, guardians: C.galaxy.guardians.filter(isAlive).length } : null; },
        get nebula() { return C.nebula ? { name: C.nebulaName, galaxy: C.nebulaGalaxy, faction: factionOf(C.nebulaGalaxy), wingman: !!C.wingmanJoined } : null; },
        get queue() { return _q.length; },
        // force the current phase complete (debug: skips the fight, keeps the
        // transition, briefing, line and reward)
        advance: function () {
            const cur = PHASES[C.idx];
            if (!C.started) { C.started = true; C.startedAt = now(); enter(P.SOL_PIRATES, 'debug'); return PHASES[C.idx]; }
            if (cur === 'VICTORY') return cur;
            if (cur === 'NEBULA_VISIT' && !C.nebula) {
                const t = C._target || pickTargetNebula(); if (!t) return cur;
                C.nebula = t; C.nebulaGalaxy = nebulaGalaxy(t); C.nebulaName = nebulaName(t); C.visitAt = now();
                const al = ie('allyShips'), n0 = al ? al.length : 0;
                if (typeof recruitNebulaWingman === 'function') { try { recruitNebulaWingman(C.nebulaName); } catch (e) {} }
                C.wingmanJoined = !!(al && al.length > n0);
            }
            if (cur === 'FACTION_GALAXY') {
                if (C.galaxy && C.galaxy.step === 'travel') { const core = _coreOf(C.galaxy.g); if (core) snapshotForces(C.galaxy, core); C.galaxy.step = 'forces'; }
                if (C.galaxy && C.galaxy.step === 'forces') { _forceClearGalaxy(); galaxyTick(cam()); return 'FACTION_GALAXY:' + C.galaxy.step; }
                _forceClearGalaxy();
            }
            next('debug');
            return PHASES[C.idx];
        },
        complete: function (phase) { if (phase && PHASES[C.idx] !== phase) return PHASES[C.idx]; return window.__campaign.advance(); },
        // jump straight to a phase (debug) without the intervening rewards
        go: function (phase) { const i = P[phase]; if (i === undefined) return null; enter(i, 'debug'); return PHASES[C.idx]; },
        say: function () { _lastSayAt = 0; pumpComms(); return _q.length; },
    };
})();
