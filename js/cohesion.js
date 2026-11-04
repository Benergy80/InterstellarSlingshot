// =============================================================================
// COHESION — one continuous campaign experience (HYBRID switch `cohesion`)
//
// js/progression.js runs Ben's campaign as a state machine, but the player only
// ever learned what to do from Mission Control alerts that scroll away, and a
// single death reloaded the page — world-gen, intro and every chapter gone.
// This file ties the run together without touching the campaign's rules:
//
//   1. OBJECTIVE TRACKER — a slim glass strip under the score strip: the
//      chapter, what to do right now, live progress (raiders left, flagship
//      hull, distance to the line's end) and galaxies freed. Rewritten only
//      when its text changes.
//   2. CHAPTER CARDS — the original event-card slot announces each chapter
//      (Sol → Sgr A* → each galaxy campaign → epilogue), queued behind the
//      reward cards so nothing stacks.
//   3. CHECKPOINTS + CONTINUE — every campaign milestone records where the
//      player stood (true coords, so the floating origin cannot move it). The
//      MISSION FAILED sequence's arcade "CONTINUE? 9…0" now really continues:
//      ship repaired at the last checkpoint, same world, wingmen, rewards and
//      score, a few seconds of protection, hostiles cleared off the spawn.
//      After the count reaches GAME OVER it restarts exactly as before.
//   4. TALLY — the MISSION FAILED tally shows the chapter reached.
//
// Debug: window.__cohesion = { objective, checkpoint, continues, respawn() }.
// `?hy=cohesion:off` = the game exactly as before this file.
// =============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined') return;
    if (!window.HYBRID || !window.HYBRID.is('cohesion', 'on')) return;

    const HY_COHESION = {
        PROTECT_MS: 6000,          // hull held full this long after a continue
        CLEAR_R: 4500,             // hostiles inside this of the respawn point …
        PUSH_R: 7500,              // … are moved out to this distance
        BODY_CLEAR_K: 1.7,         // respawn point kept this many body radii (+600) off any world
        TICK_MS: 250,              // objective refresh
        CARD_DELAY_MS: 2600,       // chapter card waits for the phase's reward cards
        MAX_CONTINUES: Infinity,   // arcade continues allowed per run
        SAVE_KEY: 'is.hybrid.campaign.v1',
    };
    window.HY_COHESION = HY_COHESION;

    const ie = function (name) { try { return (0, eval)(name); } catch (e) { return undefined; } };
    const gs = function () { return ie('gameState'); };
    const cam = function () { return ie('camera'); };
    const camp = function () { return window.__campaign || null; };
    const now = function () { return Date.now(); };
    const isDemo = function () { return !!(window.demoPilot && window.demoPilot.active); };
    const isPhone = function () {
        return (window.innerWidth < 768) || (('ontouchstart' in window || navigator.maxTouchPoints > 0) && window.innerWidth < 1024);
    };
    const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    const roman = function (n) { return ROMAN[n] || String(n); };
    function fmtDist(d) {
        if (!isFinite(d)) return '';
        if (d >= 100000) return Math.round(d / 1000) + 'k u';
        if (d >= 10000) return (d / 1000).toFixed(1) + 'k u';
        return Math.round(d).toLocaleString() + ' u';
    }
    function trueOf(p) { const o = window.worldOriginOffset; const v = p.clone(); if (o) v.add(o); return v; }
    function localOf(t) { const o = window.worldOriginOffset; const v = t.clone(); if (o) v.sub(o); return v; }
    function hpPct(e) {
        const u = e && e.userData; if (!u) return null;
        const m = u.maxHealth || u.health || 1;
        return Math.max(0, Math.min(100, Math.round(100 * (u.health || 0) / m)));
    }
    function nearest(list, p) {
        let best = null, bd = Infinity;
        for (let i = 0; i < (list || []).length; i++) { const e = list[i]; if (!e || !e.position) continue; const d = e.position.distanceTo(p); if (d < bd) { bd = d; best = e; } }
        return best ? { e: best, d: bd } : null;
    }

    // ── run state ────────────────────────────────────────────────────────────
    const R = {
        lastState: null, lastKey: '', piratesMax: 0, vulcansMax: 0, forcesMax: 0, guardiansMax: 0, missionMax: 0, guardMax: 0,
        checkpoint: null, pendingCheckpoint: null, continues: 0, protectUntil: 0, protectHull: 0,
        objective: { chapter: '', text: '', detail: '' }, cardChapter: 0, chapter: 0,
    };

    // chapter number for the current state
    function chapterOf(state, cleared) {
        if (state === 'SOL_PIRATES' || state === 'SOL_BOSS') return 1;
        if (state === 'TO_SGR_A' || state === 'SGR_VULCANS') return 2;
        if (state === 'SGR_LIBERATED') return 2;
        if (state === 'VICTORY') return 0;                        // epilogue
        // one chapter per galaxy campaign: Sgr A* freed = 1 cleared → chapter III
        return Math.max(3, (cleared || 1) + 2);
    }
    function chapterTitle(state, D, cleared) {
        switch (state) {
            case 'SOL_PIRATES': case 'SOL_BOSS': return 'Sol Under Attack';
            case 'TO_SGR_A': case 'SGR_VULCANS': case 'SGR_LIBERATED': return 'The Vulcan Blockade';
            case 'VICTORY': return 'The Occupation Is Broken';
            default: {
                const GT = ie('galaxyTypes');
                if (D && D.galaxy && GT && GT[D.galaxy.g]) return GT[D.galaxy.g].faction + ' Space';
                let n = null; try { n = camp().nebula; } catch (e) { n = null; }
                if (n && n.faction) return n.faction + ' Space';
                return (8 - cleared) + ' Galaxies Occupied';
            }
        }
    }

    // ── 1. OBJECTIVE ─────────────────────────────────────────────────────────
    function nebName(n) { return (n && n.userData && (n.userData.mythicalName || n.userData.name)) || 'the nebula'; }
    function galName(g) { const GT = ie('galaxyTypes'); return GT && GT[g] ? GT[g].name + ' Galaxy' : 'Galaxy ' + g; }
    function computeObjective() {
        const C = camp(), c = cam(), g = gs(); if (!C || !c || !g) return null;
        let D = null; try { D = C.director; } catch (e) { return null; }
        const st = D.state, cleared = (C.cleared || []).length, here = c.position;
        const out = { state: st, chapter: chapterOf(st, cleared), title: chapterTitle(st, D, cleared), text: '', detail: '', freed: cleared };
        switch (st) {
            case 'SOL_PIRATES': {
                const n = D.pirates.length; R.piratesMax = Math.max(R.piratesMax, n);
                out.text = 'Destroy the Martian raiders';
                out.detail = (R.piratesMax - n) + ' / ' + R.piratesMax + ' down';
                const t = nearest(D.pirates, here); if (t) out.detail += ' · nearest ' + fmtDist(t.d);
                break;
            }
            case 'SOL_BOSS': {
                const b = D.pirateBoss;
                out.text = 'Destroy the Martian Pirate flagship';
                out.detail = b ? ('hull ' + hpPct(b) + '% · ' + fmtDist(b.position.distanceTo(here))) : 'flagship inbound';
                break;
            }
            case 'TO_SGR_A': {
                let esc = false; try { esc = !!C.tether.escaped || !C.tetherOn; } catch (e) { esc = true; }
                const s = D.sgrA;
                if (!esc && !isDemo()) {
                    out.text = 'Slingshot around a planet to escape Sol';
                    out.detail = isPhone() ? 'fly close to a world, tap SLING' : 'fly close to a world, press Enter';
                } else {
                    out.text = 'Follow the line to Sagittarius A*';
                    out.detail = s ? fmtDist(Math.max(0, s.position.distanceTo(here) - 9000)) + ' to the blockade' : '';
                }
                break;
            }
            case 'SGR_VULCANS': {
                const n = D.vulcans.length; R.vulcansMax = Math.max(R.vulcansMax, n);
                if (n > 0) {
                    out.text = 'Break the Vulcan blockade';
                    out.detail = (R.vulcansMax - n) + ' / ' + R.vulcansMax + ' down';
                    const t = nearest(D.vulcans, here); if (t) out.detail += ' · nearest ' + fmtDist(t.d);
                } else {
                    const b = D.vulcanBoss;
                    out.text = 'Destroy Vulcan High Command';
                    out.detail = b ? ('hull ' + hpPct(b) + '% · ' + fmtDist(b.position.distanceTo(here))) : 'flagship inbound';
                }
                break;
            }
            case 'SGR_LIBERATED':
                out.text = 'Sagittarius A* liberated';
                out.detail = 'every black hole is open to you';
                break;
            case 'NEBULA_VISIT': {
                const G = D.guard;
                if (D.nebula && G && !G.none && !G.cleared) {
                    const n = G.pirates.length; R.guardMax = Math.max(R.guardMax, n);
                    out.text = 'Clear the raiders at ' + nebName(D.nebula);
                    out.detail = (R.guardMax - n) + ' / ' + R.guardMax + ' down' + (G.defender ? ' · a local pilot is holding them off' : '');
                } else if (D.nebula) {
                    out.text = 'Harbour clear at ' + nebName(D.nebula);
                    out.detail = 'new orders incoming';
                } else if (D.target) {
                    out.text = 'Reach ' + nebName(D.target);
                    out.detail = fmtDist(D.target.position.distanceTo(here)) + ' · its people may lend you a wingman';
                } else {
                    out.text = 'Chart a nebula';
                    out.detail = 'follow the white line';
                }
                break;
            }
            case 'NEBULA_MISSION': {
                const M = D.mission;
                if (M) {
                    const n = M.enemies.length + (M.boss ? 1 : 0); R.missionMax = Math.max(R.missionMax, n);
                    let mi = null; try { mi = C.mission; } catch (e) { mi = null; }
                    const label = mi && mi.label ? String(mi.label).replace(/^the /i, '') : '';
                    out.text = !label ? 'Follow the line to the mission'
                        : (mi.kind === 'planet' ? 'Drive the raiders off ' + label : 'Protect the ' + label);
                    const d = M.site ? M.site.distanceTo(here) : Infinity;
                    out.detail = (d > 6000 ? fmtDist(d) + ' · ' : '') + (R.missionMax ? (R.missionMax - n) + ' / ' + R.missionMax + ' down' : '');
                } else { out.text = 'Follow the line from the nebula'; }
                break;
            }
            case 'NEBULA_SAVED':
                out.text = nebName(D.nebula) + ' saved';
                out.detail = 'orders: the faction\'s black hole';
                break;
            case 'FACTION_GALAXY': {
                const X = D.galaxy;
                if (!X) break;
                if (X.step === 'travel') {
                    out.text = 'Travel to the ' + galName(X.g) + ' core';
                    out.detail = (X.core ? fmtDist(Math.max(0, X.core.position.distanceTo(here) - 18000)) + ' · ' : '') + 'any black hole can take you';
                } else if (X.step === 'forces') {
                    const n = X.forces.length; R.forcesMax = Math.max(R.forcesMax, n);
                    out.text = 'Destroy the occupying forces';
                    out.detail = (R.forcesMax - n) + ' / ' + R.forcesMax + ' down';
                    const t = nearest(X.forces, here); if (t) out.detail += ' · nearest ' + fmtDist(t.d);
                } else {
                    const n = X.guardians.length; R.guardiansMax = Math.max(R.guardiansMax, n);
                    out.text = 'Destroy the Black Hole Guardians';
                    out.detail = (R.guardiansMax - n) + ' / ' + R.guardiansMax + ' down';
                    const t = nearest(X.guardians, here); if (t) out.detail += ' · ' + fmtDist(t.d);
                }
                break;
            }
            case 'VICTORY':
                out.text = 'All eight galaxies are free';
                out.detail = 'well flown, Captain';
                break;
            default: return null;
        }
        return out;
    }

    let hud = null, hudKey = '';
    function ensureHud() {
        if (hud) return hud;
        hud = document.createElement('div');
        hud.id = 'hyObjective';
        hud.setAttribute('role', 'status');
        hud.innerHTML = '<div class="hyob-ch"></div><div class="hyob-main"><span class="hyob-txt"></span><span class="hyob-det"></span></div><div class="hyob-pips" aria-label="galaxies freed"></div>';
        document.body.appendChild(hud);
        return hud;
    }
    // dock under the title header, or under the floating score strip when it shows there
    let dockAt = 0;
    function dock(h) {
        if (now() - dockAt < 2000) return; dockAt = now();
        let y = 0;
        if (isPhone()) {
            // under the hull / info / energy pills
            const fs = document.getElementById('mobileFloatingStatus');
            if (fs && getComputedStyle(fs).display !== 'none') { const r = fs.getBoundingClientRect(); if (r.height > 0) y = r.bottom; }
            h.style.top = y ? Math.round(y + 6) + 'px' : '';
            return;
        }
        const th = document.querySelector('.ui-panel.title-header');
        if (th && getComputedStyle(th).display !== 'none') y = Math.max(y, th.getBoundingClientRect().bottom);
        const af = document.getElementById('hyafHud');
        if (af && !af.classList.contains('hyaf-embedded') && !af.classList.contains('hyaf-off') && getComputedStyle(af).display !== 'none') {
            const r = af.getBoundingClientRect(); if (r.height > 0 && r.top < 260) y = Math.max(y, r.bottom);
        }
        h.style.top = Math.round((y || 100) + 10) + 'px';
    }
    function renderHud(o) {
        const h = ensureHud();
        h.classList.toggle('hyob-phone', isPhone());
        dock(h);
        const key = [o.chapter, o.title, o.text, o.detail, o.freed].join('|');
        if (key === hudKey) return;
        const first = !hudKey || hudKey.split('|')[2] !== o.text;
        hudKey = key;
        h.querySelector('.hyob-ch').textContent = o.chapter ? ('Ch. ' + roman(o.chapter) + ' · ' + o.title) : ('Epilogue · ' + o.title);
        h.querySelector('.hyob-txt').textContent = o.text;
        h.querySelector('.hyob-det').textContent = o.detail ? o.detail : '';
        let pips = '';
        for (let i = 0; i < 8; i++) pips += '<i class="' + (i < o.freed ? 'on' : '') + '"></i>';
        h.querySelector('.hyob-pips').innerHTML = pips;
        if (first) { h.classList.remove('hyob-new'); void h.offsetWidth; h.classList.add('hyob-new'); }
    }
    function setHudVisible(v) { if (hud) hud.classList.toggle('hyob-off', !v); }

    // ── 2. CHAPTER CARDS ─────────────────────────────────────────────────────
    const CARD_SUB = {
        1: 'Destroy the Martian raiders and their flagship',
        2: 'Escape Sol and free Sagittarius A*',
    };
    function chapterCard(ch, title) {
        if (typeof window.flashEventText !== 'function') return;
        const sub = CARD_SUB[ch] || (ch === 0 ? 'All eight galaxies are free' : 'Chart a nebula, win a wingman, free the galaxy');
        setTimeout(function () {
            try { window.flashEventText(ch ? 'CHAPTER ' + roman(ch) : 'EPILOGUE', '#7bffe0', title.toUpperCase() + ' · ' + sub); } catch (e) {}
        }, HY_COHESION.CARD_DELAY_MS);
    }

    // ── 3. CHECKPOINTS ───────────────────────────────────────────────────────
    function milestoneKey(D) {
        const parts = [D.state];
        if (D.nebula) parts.push('n:' + nebName(D.nebula));
        if (D.galaxy) parts.push('g:' + D.galaxy.g + ':' + (D.galaxy.step === 'travel' ? 'travel' : 'arrived'));
        return parts.join('|');
    }
    function inTransit(g) {
        return !!(g.isBlackHoleWarping || (g.emergencyWarp && g.emergencyWarp.active) || g.slingshotWhip || g.slingshotLaunchRamp ||
            (g.slingshot && g.slingshot.active) || (g._hyNavWarp && g._hyNavWarp.phase && g._hyNavWarp.phase !== 'hold'));
    }
    function solPhase(state, C) {
        if (state === 'SOL_PIRATES' || state === 'SOL_BOSS') return true;
        if (state === 'TO_SGR_A') { try { return !C.tether.escaped; } catch (e) { return true; } }
        return false;
    }
    function recordCheckpoint(D, label) {
        const c = cam(); if (!c) return;
        R.checkpoint = { state: D.state, key: milestoneKey(D), label: label, sol: solPhase(D.state, camp()), pos: trueOf(c.position), q: c.quaternion.clone(), at: now() };
    }
    function checkpointLabel(D) {
        switch (D.state) {
            case 'SOL_PIRATES': case 'SOL_BOSS': return 'Earth orbit';
            case 'TO_SGR_A': return 'the Sol system';
            case 'SGR_VULCANS': case 'SGR_LIBERATED': return 'the Sagittarius A* approach';
            case 'NEBULA_VISIT': {
                if (D.nebula) return nebName(D.nebula);
                let cl = []; try { cl = camp().cleared || []; } catch (e) { cl = []; }
                const last = cl[cl.length - 1];
                return (last === undefined || last === 7) ? 'the Sagittarius A* approach' : 'the ' + galName(last) + ' core';
            }
            case 'NEBULA_MISSION': case 'NEBULA_SAVED': return D.nebula ? nebName(D.nebula) : 'the nebula';
            case 'FACTION_GALAXY': return D.galaxy && D.galaxy.step !== 'travel' ? 'the ' + galName(D.galaxy.g) + ' approach' : (D.nebula ? nebName(D.nebula) : 'your last position');
            default: return 'your last position';
        }
    }
    // keep a respawn point clear of worlds and black holes that moved since it was recorded
    function clearOfBodies(p) {
        const P = ie('planets') || [];
        for (let pass = 0; pass < 3; pass++) {
            let moved = false;
            for (let i = 0; i < P.length; i++) {
                const b = P[i]; if (!b || !b.userData || !b.position || b.userData.type === 'asteroid' || b.isAsteroidProxy) continue;
                const r = (typeof window._hyBodyR === 'function') ? window._hyBodyR(b) : ((b.userData.radius) || (b.geometry && b.geometry.parameters && b.geometry.parameters.radius) || 100);
                const k = b.userData.type === 'blackhole' ? Math.max(r * 4, (b.userData.warpThreshold || 0) * 1.5) : r * HY_COHESION.BODY_CLEAR_K + 600;
                const d = p.distanceTo(b.position);
                if (d < k) {
                    const dir = p.clone().sub(b.position); if (dir.lengthSq() < 1) dir.set(0, 1, 0);
                    p.copy(b.position).addScaledVector(dir.normalize(), k + 50); moved = true;
                }
            }
            if (!moved) break;
        }
        return p;
    }

    // ── 3b. CONTINUE ─────────────────────────────────────────────────────────
    function available() {
        const C = camp(), g = gs();
        if (!C || !g || isDemo()) return false;
        let st = null; try { st = C.state; } catch (e) { return false; }
        if (!st || st === 'VICTORY') return false;
        if (R.continues >= HY_COHESION.MAX_CONTINUES) return false;
        return !!R.checkpoint || st === 'SOL_PIRATES' || st === 'SOL_BOSS';
    }
    function respawn() {
        const g = gs(), c = cam(), C = camp(); if (!g || !c || !C) return false;
        const cp = R.checkpoint;
        // where
        let pos = null, look = null;
        if (!cp || cp.sol) {
            let sp = null; try { sp = (typeof window._hyStartPoint === 'function') ? window._hyStartPoint({ pin: false }) : null; } catch (e) { sp = null; }
            if (!sp) { try { sp = ie('_hyStartPoint') ? ie('_hyStartPoint')({ pin: false }) : null; } catch (e) { sp = null; } }
            if (sp && sp.pos) { pos = sp.pos.clone(); look = sp.look ? sp.look.clone() : null; }
        }
        if (!pos && cp) pos = localOf(cp.pos);
        if (!pos) pos = c.position.clone();
        clearOfBodies(pos);

        // state: alive, repaired, still
        g.gameOver = false; g.gameStarted = true; g.gameOverScreenShown = false; g.playerDying = false; g.paused = false;
        g.hull = g.maxHull || 100; g.energy = g.maxEnergy || 100;
        if (g.velocityVector && g.velocityVector.set) g.velocityVector.set(0, 0, 0);
        g.slingshotWhip = null; g.slingshotLaunchRamp = null;
        if (g.slingshot) { g.slingshot.active = false; g.slingshot.postSlingshot = false; }
        if (g.emergencyWarp) { g.emergencyWarp.active = false; g.emergencyWarp.timeRemaining = 0; }
        g.isBlackHoleWarping = false; g.autoNavigating = false; g.warping = false;
        g._hyNavWarp = null; g._combo = 0; g._comboMult = 1;
        window.__whipLaunch = null; window.__whipDilation = 0; if (window.__whipFrame) window.__whipFrame.active = false;

        // place + face
        c.position.copy(pos);
        if (look) c.lookAt(look);
        else if (cp && cp.q) c.quaternion.copy(cp.q);
        try { const CR = ie('cameraRotation'); if (CR) { CR.x = c.rotation.x; CR.y = c.rotation.y; CR.z = c.rotation.z; } } catch (e) {}
        if (g.velocityVector && g.minVelocity) {
            const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
            g.velocityVector.copy(fwd.multiplyScalar(g.minVelocity));
        }

        // hostiles off the spawn (render interpolation glides from _iFrom → _iTo: re-seat both)
        const E = ie('enemies') || [];
        let pushed = 0;
        for (let i = 0; i < E.length; i++) {
            const e = E[i]; if (!e || !e.position || !e.userData || !(e.userData.health > 0)) continue;
            const d = e.position.distanceTo(pos);
            const r = e.userData.isBoss ? HY_COHESION.CLEAR_R * 1.6 : HY_COHESION.CLEAR_R;
            if (d >= r) continue;
            const dir = e.position.clone().sub(pos); if (dir.lengthSq() < 1) dir.set(1, 0, 0);
            e.position.copy(pos).addScaledVector(dir.normalize(), e.userData.isBoss ? HY_COHESION.PUSH_R * 1.4 : HY_COHESION.PUSH_R);
            const u = e.userData;
            if (u._iFrom && u._iFrom.copy) u._iFrom.copy(e.position);
            if (u._iTo && u._iTo.copy) u._iTo.copy(e.position);
            if (u.velocity && u.velocity.set) u.velocity.set(0, 0, 0);
            pushed++;
        }

        // ship, overlays, input
        try { const s = window.cameraState && window.cameraState.playerShipMesh; if (s) s.visible = true; } catch (e) {}
        const go = document.getElementById('gameOverScreen'); if (go) go.remove();
        const canvasEl = document.getElementById('gameCanvas'); if (canvasEl) canvasEl.style.pointerEvents = '';
        document.body.style.cursor = '';

        // audio back on: the synth context, the soundtrack's context pick, the ambient bed
        // (resumeAudioContext restarts the ambient bed once the context runs, as the original does)
        try { const ms = ie('musicSystem'); if (ms) ms.inBattle = false; } catch (e) {}
        try {
            const rac = ie('resumeAudioContext');
            if (typeof rac === 'function') rac();
            else { const ac = ie('audioContext'); if (ac && ac.state === 'suspended') ac.resume(); }
        } catch (e) {}
        try { if (window.soundtrack) { window.soundtrack.stopAll(); if (typeof window.soundtrack.update === 'function') window.soundtrack.update(); } } catch (e) {}

        // systems the game-over stopped
        try { if (window.hyArcadeFeel && window.hyArcadeFeel.resumeRun) window.hyArcadeFeel.resumeRun(); } catch (e) {}
        try { if (typeof window.startMobileUpdateLoop === 'function') window.startMobileUpdateLoop(); } catch (e) {}

        R.continues++;
        R.protectUntil = now() + HY_COHESION.PROTECT_MS; R.protectHull = g.hull;
        setHudVisible(true);
        hudKey = '';
        const where = cp ? cp.label : 'Earth orbit';
        try { if (typeof window.flashEventText === 'function') window.flashEventText('CONTINUE', '#7bffe0', 'REPAIRED AT ' + where.toUpperCase()); } catch (e) {}
        try {
            if (typeof showIncomingTransmission === 'function') {
                const o = computeObjective();
                showIncomingTransmission('Mission Control - Recovery', 'Recovery tug has you, Captain — hull rebuilt at ' + where + '. ' +
                    (o ? 'Orders stand: ' + o.text.charAt(0).toLowerCase() + o.text.slice(1) + '.' : 'Orders stand.'), 'lore');
            }
        } catch (e) {}
        console.log('🔁 CONTINUE #' + R.continues + ' at ' + where + ' (' + (cp ? cp.state : 'start') + '), ' + pushed + ' hostiles moved off the spawn');
        return true;
    }
    window.hyContinue = { available: available, run: respawn };

    // ── 3c. SAVE + RESUME across launches ───────────────────────────────────
    // A save is written at every chapter boundary (entering NEBULA_VISIT: Sgr A*
    // freed, or a galaxy cleared) and dropped at VICTORY. The title menu then offers
    // CONTINUE CAMPAIGN beside PRESS TO LAUNCH; it runs the normal launch and, once
    // the campaign starts, restores the run at its next chapter (progression.js
    // __campaign.restore — the world is new each launch, so mid-chapter state is not kept).
    function readSave() {
        try { const v = JSON.parse(localStorage.getItem(HY_COHESION.SAVE_KEY) || 'null'); return v && v.v === 1 && Array.isArray(v.cleared) && v.cleared.length ? v : null; } catch (e) { return null; }
    }
    function writeSave() {
        const C = camp(); if (!C || isDemo() || typeof C.saveData !== 'function') return;
        let d = null; try { d = C.saveData(); } catch (e) { d = null; }
        if (!d) return;
        try { localStorage.setItem(HY_COHESION.SAVE_KEY, JSON.stringify(d)); R.savedAt = now(); } catch (e) {}
    }
    function dropSave() { try { localStorage.removeItem(HY_COHESION.SAVE_KEY); } catch (e) {} }
    const startSave = readSave();
    let resumeRequested = false, resumeDone = false;
    function savedChapter(sv) { return Math.max(3, sv.cleared.length + 2); }
    function offerResume() {
        if (!startSave || resumeRequested) return;
        const g = gs(); if (g && g.gameStarted) return;
        const start = document.getElementById('introStartBtn');
        if (!start || !start.parentNode) { setTimeout(offerResume, 400); return; }
        let btn = document.getElementById('introResumeBtn');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'introResumeBtn';
            btn.type = 'button';
            btn.className = 'intro-start-btn';
            const ch = savedChapter(startSave);
            btn.innerHTML = '<div class="start-btn-content"><div class="start-btn-text">CONTINUE CAMPAIGN</div>' +
                '<div class="start-btn-subtext">CHAPTER ' + roman(ch) + ' · ' + startSave.cleared.length + ' OF 8 GALAXIES FREED</div></div>';
            btn.addEventListener('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                const s2 = document.getElementById('introStartBtn'); if (!s2) return;
                resumeRequested = true;
                btn.remove();
                s2.click();
            });
        }
        if (btn.parentNode !== start.parentNode || btn.previousSibling !== start) start.parentNode.insertBefore(btn, start.nextSibling);
        btn.classList.toggle('hyco-free', !document.getElementById('hyTitle') || !start.closest('#hyTitle'));
        setTimeout(offerResume, 400);    // the title adopts and moves the buttons; follow them until launch
    }
    if (startSave) setTimeout(offerResume, 300);
    function tryResume() {
        if (!resumeRequested || resumeDone) return;
        const C = camp(); if (!C || typeof C.restore !== 'function') return;
        let st = null, started = false; try { st = C.state; started = (C.log || []).length > 0; } catch (e) { return; }
        if (!started || st !== 'SOL_PIRATES') return;     // the campaign has not entered its first phase yet
        resumeDone = true;
        let ok = false; try { ok = C.restore(startSave); } catch (e) { console.warn('campaign restore failed', e); }
        if (!ok) return;
        // the Sol tutorial would brief the wrong war
        try {
            const tut = ie('tutorialSystem');
            if (tut && !tut.completed) {
                const ct = ie('completeTutorial');
                if (typeof ct === 'function') ct(); else { tut.active = false; tut.completed = true; tut.completionTime = now(); }
            }
            const al = document.getElementById('missionCommandAlert'); if (al) al.classList.add('hidden');
        } catch (e) {}
        R.cardChapter = 0; R.lastState = null; R.checkpoint = null; R.lastKey = '';
        console.log('💾 campaign resumed: chapter ' + roman(savedChapter(startSave)));
    }

    // ── 4. TALLY: chapter reached ────────────────────────────────────────────
    (function wrapTally() {
        const AF = window.hyArcadeFeel;
        if (!AF || typeof AF.tallyRows !== 'function' || AF.tallyRows.__hyco) return;
        const orig = AF.tallyRows;
        const w = function (rows, stat) {
            const out = orig.apply(this, arguments);
            try {
                if (!isDemo() && R.chapter >= 0 && camp()) {
                    const ch = R.chapter;
                    out.unshift(stat('Chapter', ch || 9, function (v) { return ch ? roman(Math.max(1, Math.round(v))) : 'Epilogue'; }));
                    if (R.continues) out.push(stat('Continues', R.continues));
                }
            } catch (e) {}
            return out;
        };
        w.__hyco = true;
        AF.tallyRows = w;
    })();

    // ── loop ─────────────────────────────────────────────────────────────────
    let lastTick = 0;
    function loop() {
        requestAnimationFrame(loop);
        const g = gs(); if (!g) return;
        // protection: any hull lost in the window comes straight back
        if (R.protectUntil) {
            if (now() > R.protectUntil || g.gameOver) R.protectUntil = 0;
            else if (g.hull < R.protectHull && !g.playerDying) g.hull = R.protectHull;
        }
        const t = now(); if (t - lastTick < HY_COHESION.TICK_MS) return; lastTick = t;
        const C = camp();
        if (!C || !g.gameStarted || g.gameOver) { if (g.gameOver) setHudVisible(false); return; }
        tryResume();
        let D = null; try { D = C.director; } catch (e) { return; }
        if (!D || !D.state) return;

        // phase change: chapter card, counters reset, chapter-boundary save
        if (D.state !== R.lastState) {
            const prev = R.lastState; R.lastState = D.state;
            if (D.state === 'NEBULA_VISIT' && !isDemo()) writeSave();
            if (D.state === 'VICTORY' && !isDemo()) dropSave();
            if (D.state === 'SGR_VULCANS') R.vulcansMax = 0;
            if (D.state === 'NEBULA_VISIT') { R.guardMax = 0; }
            if (D.state === 'NEBULA_MISSION') R.missionMax = 0;
            if (D.state === 'FACTION_GALAXY') { R.forcesMax = 0; R.guardiansMax = 0; }
            const ch = chapterOf(D.state, (C.cleared || []).length);
            if (ch !== R.cardChapter && (ch === 0 || ch > R.cardChapter)) {
                R.cardChapter = ch;
                if (!isDemo() || prev !== null) chapterCard(ch, chapterTitle(D.state, D, (C.cleared || []).length));
            }
            R.chapter = ch;
        }
        if (D.galaxy && D.galaxy.step === 'guardians' && R.guardiansMax === 0) R.forcesMax = R.forcesMax || 0;

        // milestones → checkpoints (recorded once the ship is not mid-transit)
        const key = milestoneKey(D);
        if (key !== R.lastKey) { R.lastKey = key; R.pendingCheckpoint = checkpointLabel(D); }
        if (R.pendingCheckpoint && !inTransit(g) && !g.playerDying && g.hull > 0) {
            recordCheckpoint(D, R.pendingCheckpoint); R.pendingCheckpoint = null;
        }

        const o = computeObjective();
        if (o) {
            R.objective = o;
            // phone: the opening tutorial speaks in the same band (and says the same thing)
            const tut = ie('tutorialSystem');
            const tutBusy = isPhone() && tut && tut.active && !tut.completed;
            setHudVisible(!document.getElementById('bossIntroCard') && !tutBusy);
            renderHud(o);
        }
    }
    requestAnimationFrame(loop);

    window.__cohesion = {
        get objective() { return R.objective; },
        get checkpoint() { const cp = R.checkpoint; return cp ? { state: cp.state, label: cp.label, sol: cp.sol, pos: cp.pos.toArray().map(Math.round) } : null; },
        get continues() { return R.continues; },
        get protectedFor() { return Math.max(0, R.protectUntil - now()); },
        get chapter() { return R.chapter; },
        available: available,
        respawn: respawn,
        cfg: HY_COHESION,
        get save() { return readSave(); },
        get resumed() { return resumeDone; },
        dropSave: dropSave,
        writeSave: writeSave,
        requestResume: function () { if (!startSave) return false; resumeRequested = true; return true; },
    };
})();
