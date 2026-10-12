// =============================================================================
// ARCADE LAYER — score, combo multiplier, HUD, hitstop, flash punch, slow-mo,
// grade pops, power-ups, asteroid-drop pickups, speed lines, SFX stingers.
// Self-contained; hooks are called from game-controls / game-objects.
// =============================================================================
(function () {
    function gs() { return (typeof gameState !== 'undefined') ? gameState : null; }

    // Feature toggles — these three overlapped the HUD, disabled for now.
    // Score/combo are still TRACKED internally; just not displayed.
    const HUD_ENABLED = false;     // center-top SCORE / ×N COMBO / power-up timers
    const FLOAT_SCORE = false;     // floating "+pts" numbers at the kill point
    const GRADE_ENABLED = false;   // "RANK S" stamp on sector clear

    // ── DOM HUD (score + combo + power-up timers) ────────────────────────────
    let _hud = null, _scoreEl = null, _comboEl = null, _puEl = null;
    function _ensureHud() {
        if (!HUD_ENABLED || _hud) return;
        _hud = document.createElement('div');
        _hud.id = 'arcadeHud';
        _hud.style.cssText = 'position:fixed;top:84px;left:50%;transform:translateX(-50%);z-index:58;' +
            'pointer-events:none;text-align:center;font-family:Orbitron,monospace;font-weight:800;';
        _scoreEl = document.createElement('div');
        _scoreEl.style.cssText = 'font-size:22px;color:#ffe066;text-shadow:0 0 12px rgba(255,200,40,.8);letter-spacing:3px';
        _comboEl = document.createElement('div');
        _comboEl.style.cssText = 'font-size:16px;color:#ff8844;text-shadow:0 0 10px rgba(255,120,40,.9);margin-top:2px;letter-spacing:2px;opacity:0;transition:opacity .2s';
        _puEl = document.createElement('div');
        _puEl.style.cssText = 'font-size:11px;color:#88ffcc;text-shadow:0 0 8px rgba(0,0,0,.8);margin-top:3px;letter-spacing:2px';
        _hud.appendChild(_scoreEl); _hud.appendChild(_comboEl); _hud.appendChild(_puEl);
        document.body.appendChild(_hud);
    }
    function _renderHud() {
        if (!HUD_ENABLED) return;
        const g = gs(); if (!g) return;
        _ensureHud();
        _scoreEl.textContent = 'SCORE ' + (g.score || 0).toLocaleString();
        const m = g._comboMult || 1;
        if (m > 1 && (g._comboUntil || 0) > Date.now()) {
            _comboEl.textContent = '×' + m + ' COMBO';
            _comboEl.style.opacity = '1';
        } else {
            _comboEl.style.opacity = '0';
        }
        // power-up timers
        const pu = g._powerups || {};
        const now = Date.now();
        const parts = [];
        for (const k in pu) {
            const rem = pu[k] - now;
            if (rem > 0) parts.push(k.toUpperCase() + ' ' + (rem / 1000).toFixed(1) + 's');
        }
        _puEl.textContent = parts.join('   ');
    }

    // ── SCORE + COMBO + floating numbers ─────────────────────────────────────
    function addKill(enemyUd, worldPos, isBoss) {
        const g = gs(); if (!g) return;
        const now = Date.now();
        if (now > (g._comboUntil || 0)) g._combo = 0;
        g._combo = (g._combo || 0) + 1;
        g._comboUntil = now + 4000;
        g._comboMult = Math.min(8, 1 + Math.floor((g._combo) / 3)); // ×1..×8
        const elite = enemyUd && enemyUd.isEliteGuardian;
        const base = isBoss ? 500 : (elite ? 300 : 100);
        const pts = base * g._comboMult;
        g.score = (g.score || 0) + pts;
        if (FLOAT_SCORE && worldPos && typeof spawnKillText === 'function') {
            spawnKillText(worldPos, '+' + pts + (isBoss ? ' BOSS' : (elite ? ' ELITE' : '')),
                isBoss ? '#ff66cc' : '#ffee66', isBoss ? 26 : 16);
        }
        // streak SFX stinger — rising pitch with the combo
        if (typeof playSound === 'function') {
            try { playSound('achievement', 600 + Math.min(8, g._comboMult) * 70, 0.18); } catch (e) {}
        }
        _renderHud();
    }

    // ── HITSTOP / SLOW-MO ────────────────────────────────────────────────────
    function hitstop(ms) { const g = gs(); if (g) g._hitstopUntil = performance.now() + (ms || 50); }
    function slowmo(ms) { const g = gs(); if (g) { g._slowmoUntil = performance.now() + (ms || 700); g._slowmoSkip = false; } }

    // ── FLASH PUNCH (full-screen color flash + chromatic edge) ───────────────
    let _flashEl = null;
    function flash(color, strength) {
        if (!_flashEl) {
            _flashEl = document.createElement('div');
            _flashEl.style.cssText = 'position:fixed;inset:0;z-index:62;pointer-events:none;opacity:0;mix-blend-mode:screen';
            document.body.appendChild(_flashEl);
        }
        const s = strength || 0.5;
        _flashEl.style.background = 'radial-gradient(ellipse at center, ' + (color || 'rgba(255,255,255,1)') +
            ' 0%, rgba(0,0,0,0) 70%)';
        _flashEl.style.transition = 'none';
        _flashEl.style.opacity = String(s);
        requestAnimationFrame(() => {
            _flashEl.style.transition = 'opacity .28s ease-out';
            _flashEl.style.opacity = '0';
        });
    }

    // ── GRADE POP (sector clear) ─────────────────────────────────────────────
    function grade(rank, subtitle) {
        if (!GRADE_ENABLED) return;
        try {
            if (!document.getElementById('arcadeGradeStyle')) {
                const st = document.createElement('style');
                st.id = 'arcadeGradeStyle';
                st.textContent = '@keyframes gradeStamp{0%{opacity:0;transform:translate(-50%,-50%) scale(3) rotate(-18deg)}' +
                    '20%{opacity:1;transform:translate(-50%,-50%) scale(0.9) rotate(-8deg)}' +
                    '30%{transform:translate(-50%,-50%) scale(1.05) rotate(-8deg)}40%{transform:translate(-50%,-50%) scale(1) rotate(-8deg)}' +
                    '82%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) scale(1.1) rotate(-8deg)}}';
                document.head.appendChild(st);
            }
            const colors = { S: '#ffdd33', A: '#66ff99', B: '#66ccff', C: '#cc99ff' };
            const col = colors[rank] || '#ffffff';
            const d = document.createElement('div');
            d.style.cssText = 'position:fixed;left:50%;top:42%;z-index:74;pointer-events:none;text-align:center;' +
                'font-family:Orbitron,monospace;font-weight:900;animation:gradeStamp 2.6s ease forwards;';
            d.innerHTML = '<div style="font-size:84px;color:' + col + ';text-shadow:0 0 30px ' + col + ',0 0 8px #000;border:5px solid ' + col + ';border-radius:14px;padding:6px 26px;display:inline-block">RANK ' + rank + '</div>' +
                (subtitle ? '<div style="font-size:16px;letter-spacing:5px;color:#fff;margin-top:10px;text-shadow:0 0 8px #000">' + subtitle + '</div>' : '');
            document.body.appendChild(d);
            setTimeout(() => d.remove(), 2700);
        } catch (e) {}
    }

    // ── POWER-UPS ────────────────────────────────────────────────────────────
    const PU_LABELS = { overdrive: 'OVERDRIVE', spread: 'SPREAD SHOT', shield: 'SHIELD' };
    function activatePowerup(type, ms) {
        const g = gs(); if (!g) return;
        if (!g._powerups) g._powerups = {};
        g._powerups[type] = Date.now() + (ms || 12000);
        if (typeof flashEventText === 'function') flashEventText((PU_LABELS[type] || type.toUpperCase()) + '!', '#66ffcc', 'POWER-UP ACQUIRED');
        if (typeof playSound === 'function') { try { playSound('achievement', 880, 0.25); } catch (e) {} }
        _renderHud();
    }
    function hasPowerup(type) { const g = gs(); return !!(g && g._powerups && g._powerups[type] > Date.now()); }

    // ── PICKUPS (spinning collectibles dropped by broken asteroids) ──────────
    const _pickups = [];
    const PICKUP_KINDS = [
        { kind: 'energy', color: 0x33ddff, apply: (g) => { g.energy = Math.min(g.maxEnergy || 100, (g.energy || 0) + 35); } },
        { kind: 'missile', color: 0xff66cc, apply: (g) => { if (g.missiles) g.missiles.current = Math.min(g.missiles.capacity || 10, g.missiles.current + 1); } },
        { kind: 'overdrive', color: 0xffcc33, apply: () => activatePowerup('overdrive', 10000) },
        { kind: 'spread', color: 0x99ff66, apply: () => activatePowerup('spread', 12000) },
        { kind: 'shield', color: 0x66ccff, apply: () => activatePowerup('shield', 12000) },
    ];
    function spawnPickup(position) {
        if (typeof scene === 'undefined' || typeof THREE === 'undefined' || !position) return;
        // weighted: energy/missile common, power-ups rarer
        const r = Math.random();
        const def = r < 0.45 ? PICKUP_KINDS[0] : r < 0.7 ? PICKUP_KINDS[1] : PICKUP_KINDS[2 + Math.floor(Math.random() * 3)];
        const geo = new THREE.OctahedronGeometry(22, 0);
        const mat = new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.9,
            blending: THREE.AdditiveBlending, depthWrite: false });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(position);
        mesh.frustumCulled = false;
        scene.add(mesh);
        _pickups.push({ mesh, mat, def, born: Date.now() });
    }
    function updatePickups() {
        if (!_pickups.length || typeof camera === 'undefined') return;
        const g = gs();
        for (let i = _pickups.length - 1; i >= 0; i--) {
            const p = _pickups[i];
            p.mesh.rotation.y += 0.06; p.mesh.rotation.x += 0.03;
            const d = camera.position.distanceTo(p.mesh.position);
            // magnet within 600u
            if (d < 600) {
                const dir = camera.position.clone().sub(p.mesh.position).normalize();
                p.mesh.position.addScaledVector(dir, Math.min(20, (600 - d) * 0.06));
            }
            const expired = Date.now() - p.born > 30000;
            if (d < 70 || expired) {
                if (d < 70 && g) {
                    try { p.def.apply(g); } catch (e) {}
                    if (typeof spawnKillText === 'function') spawnKillText(p.mesh.position, p.def.kind.toUpperCase(), '#' + p.mat.color.getHexString(), 16);
                    if (typeof playSound === 'function') { try { playSound('navigation'); } catch (e) {} }
                }
                scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mat.dispose();
                _pickups.splice(i, 1);
            }
        }
    }

    // ── Per-frame update (HUD + pickups) ─────────────────────────────────────
    function update() {
        const g = gs(); if (!g || !g.gameStarted) return;
        if ((g.frameCount || 0) % 6 === 0) _renderHud();
        try { updatePickups(); } catch (e) {}
    }

    // ── CALL-OUT SAFE AREA ───────────────────────────────────────────────────
    // flashArcadeText (visual-flair) drops its word at left:50% with
    // `white-space:nowrap` and a fixed tier font size. The band it lands in
    // (top 19%) is exactly the band the FLIGHT CONTROLS and NAVIGATION panels
    // occupy, so anything wider than the gap between them ran underneath and
    // clipped mid-word — at 1280x800 the free corridor is 540 px but
    // "ESCAPE VELOCITY!" measures 570 px and "GRAVITATIONAL SLINGSHOT
    // ENGAGED" measures 1135 px.
    //
    // We can't edit visual-flair, so wrap the global and re-fit the element it
    // just appended: measure the real corridor between the visible HUD panels,
    // shrink the type to fit, wrap onto a second line if it still won't, and
    // recentre on the corridor rather than the viewport. Runs before
    // anaglyph-3d clones #arcadeText, so its eye copies inherit the fit.

    const SAFE_PAD = 16;      // breathing room either side of a HUD panel
    const MIN_SCALE = 0.62;   // don't shrink a call-out into illegibility
    const WRAP_SCALE = 0.80;  // below this, wrap to 2 lines instead of shrinking
    const SWELL = 1.12;       // the settled pulse peak of the arcadePop keyframes

    // ── THE SWELL THE FIT WAS MISSING ────────────────────────────────────
    // Fitting to SWELL alone is only half the story: arcadePop does not
    // start at 1x. It opens at scale(2.6) while the opacity ramps 0 -> 0.82
    // over its first 220 ms, and grows again to 1.5x at 64% (still at 0.5
    // opacity) before dissolving at 2.4x. So the word is plainly VISIBLE at
    // 2.6x for the first fifth of its life, and the corridor fit — which
    // only ever budgeted for 1.12x — was blown wide open every single time.
    //
    // Measured live at 1600x900 (painted getBoundingClientRect, ~250 ms
    // after the call-out fires):
    //   "CHARGED BLAST!"     spanned x=6..1594  — 394 px under the NAV panel
    //   "TARGET ELIMINATED!" spanned x=-364..1856 — 657 px under NAV, and
    //                        overhanging BOTH screen edges
    //   "DOUBLE KILL!"       spanned x=316..1284 — 84 px under the NAV panel
    //
    // We can't touch the keyframes (visual-flair owns them), but we own the
    // element after it's built, so we re-point it at a corridor-clamped copy
    // of the same animation whose big scales come from CSS variables. Same
    // beats, same timing, same punch — just a peak that physically fits
    // between the HUD panels.
    const POP_OPEN = 2.6;     // arcadePop's opening scale
    const POP_GROW = 1.5;     // its 64% grow, still at 0.5 opacity
    const POP_OUT  = 2.4;     // its final dissolve scale (opacity 0)
    const POP_MIN  = 1.18;    // never flatten the pop into a fade

    function _ensureFitKeyframes() {
        if (document.getElementById('arcadeFitPopStyle')) return;
        const st = document.createElement('style');
        st.id = 'arcadeFitPopStyle';
        // Mirrors arcadePop exactly, with the three oversized scales driven
        // by --ap-open / --ap-grow / --ap-out so each call-out gets a peak
        // sized to the corridor it actually landed in.
        st.textContent = '@keyframes arcadeFitPop{' +
            '0%{opacity:0;transform:translateX(-50%) scale(var(--ap-open,2.6))}' +
            '11%{opacity:0.82;transform:translateX(-50%) scale(0.86)}' +
            '20%{transform:translateX(-50%) scale(1.10)}' +
            '29%{transform:translateX(-50%) scale(0.96)}' +
            '38%{opacity:0.8;transform:translateX(-50%) scale(1.06)}' +
            '48%{opacity:0.72;transform:translateX(-50%) scale(1.05)}' +
            '64%{opacity:0.5;transform:translateX(-50%) scale(var(--ap-grow,1.5))}' +
            '100%{opacity:0;transform:translateX(-50%) scale(var(--ap-out,2.4))}}';
        document.head.appendChild(st);
    }

    // Clamp the animation's scale envelope to the room the word actually
    // has, then swap it onto the element. Runs in the same task as the
    // element's creation, so no oversized frame is ever painted.
    function _clampSwell(el, band) {
        const w = el.offsetWidth || el.scrollWidth;
        const h = el.offsetHeight || 1;
        if (!w) return;
        const cx = parseFloat(el.style.left) || (window.innerWidth / 2);
        // Symmetric room around where the word is actually centred (it
        // grows from its centre), against the corridor AND the viewport.
        const halfRoom = Math.max(40, Math.min(
            cx - Math.max(band.left, SAFE_PAD),
            Math.min(band.right, window.innerWidth - SAFE_PAD) - cx));
        let peak = (halfRoom * 2) / w;
        // Vertical headroom too: the tall subtitled call-outs grew from
        // 180 px to 469 px and swallowed the whole upper third.
        const cy = (el.offsetTop || 0) + h / 2;
        const vPeak = (Math.min(cy, window.innerHeight - cy) * 2) / h;
        peak = Math.min(peak, vPeak);
        // If the word is so wide that even POP_MIN would overflow, don't
        // clamp UP into the panels — buy the room back from the type
        // instead. (Measured: "THREAT NEUTRALIZED!" was the one call-out
        // still poking 49 px under the NAV panel because it bottomed out
        // on the POP_MIN floor.) Shrinking a already-huge word by a few
        // per cent is invisible; overlapping the HUD is not.
        if (peak < POP_MIN) {
            const shrink = Math.max(MIN_SCALE, peak / POP_MIN);
            const px = Math.max(20, Math.round((parseFloat(getComputedStyle(el).fontSize) || 40) * shrink));
            el.style.fontSize = px + 'px';
            el.style.letterSpacing = Math.max(1, Math.round(px * 0.045)) + 'px';
            const kids = el.children;
            for (let i = 0; i < kids.length; i++) {
                const fs = parseFloat(kids[i].style.fontSize);
                if (fs) kids[i].style.fontSize = Math.max(11, Math.round(fs * shrink)) + 'px';
            }
            peak = POP_MIN;
        }
        peak = Math.min(POP_OPEN, peak);
        _ensureFitKeyframes();
        el.style.setProperty('--ap-open', peak.toFixed(3));
        el.style.setProperty('--ap-grow', Math.min(POP_GROW, peak).toFixed(3));
        el.style.setProperty('--ap-out', Math.min(POP_OUT, peak * 1.15).toFixed(3));
        // Same duration/easing/fill as the original.
        el.style.animation = 'arcadeFitPop 2s cubic-bezier(.2,.7,.3,1) forwards';
    }
    // Everything that can sit in the call-out band and must not be covered.
    const BLOCKERS = '.ui-panel, #achievementPopup, #missionCommandAlert, ' +
                     '#incomingTransmissionPrompt, #incomingTransmission';

    // Rects of HUD chrome that is genuinely on screen right now.
    function _liveHudRects() {
        const out = [];
        const nodes = document.querySelectorAll(BLOCKERS);
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            if (el.classList.contains('hidden')) continue;
            if (el.closest('#arcadeText')) continue;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' ||
                parseFloat(cs.opacity) < 0.06) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 60 || r.height < 30) continue;
            out.push(r);
        }
        return out;
    }

    // Widest uninterrupted horizontal span across the given vertical band,
    // plus how far down we'd have to move to clear anything sitting in the
    // MIDDLE of that band (which no amount of sideways nudging can dodge).
    function _corridor(bandTop, bandBottom) {
        const vw = window.innerWidth;
        const cx = vw / 2;
        let left = SAFE_PAD, right = vw - SAFE_PAD, clearBelow = 0;
        const rects = _liveHudRects();
        for (let i = 0; i < rects.length; i++) {
            const r = rects[i];
            if (r.bottom <= bandTop || r.top >= bandBottom) continue;  // misses the band
            const rcx = (r.left + r.right) / 2;
            // Straddles the middle: can't be dodged sideways, so remember how
            // far down the band would have to drop to clear it.
            if (Math.abs(rcx - cx) < vw * 0.22) { clearBelow = Math.max(clearBelow, r.bottom); continue; }
            if (rcx < cx) left = Math.max(left, r.right + SAFE_PAD);
            else right = Math.min(right, r.left - SAFE_PAD);
        }
        if (right - left < vw * 0.28) { left = SAFE_PAD; right = vw - SAFE_PAD; }
        return { left, right, width: right - left, center: (left + right) / 2, clearBelow };
    }

    function _fitArcadeText(el) {
        const basePx = parseFloat(getComputedStyle(el).fontSize) || 40;
        const vh = window.innerHeight;
        let top = el.offsetTop || Math.round(vh * 0.19);
        // Budget for up to two lines so the corridor accounts for a wrap.
        let band = _corridor(top, top + basePx * 2.7);

        // A centred toast (achievement / comms) is sitting in the band — slide
        // the call-out down under it rather than stacking on top. Capped so the
        // word never drifts onto the crosshair.
        if (band.clearBelow > top) {
            const moved = Math.min(Math.round(vh * 0.34), Math.round(band.clearBelow + 14));
            if (moved > top) {
                top = moved;
                el.style.top = top + 'px';
                band = _corridor(top, top + basePx * 2.7);
            }
        }

        // Intrinsic single-line width, measured transform-free.
        el.style.whiteSpace = 'nowrap';
        el.style.maxWidth = 'none';
        const natural = el.scrollWidth;
        const budget = band.width * 0.90;   // leave room for the SWELL peak

        let scale = 1, wrap = false;
        if (natural * SWELL > budget) {
            scale = budget / (natural * SWELL);
            if (scale < WRAP_SCALE) {
                // Two lines at a bold size beats one line of tiny type: a
                // wrapped line needs roughly half the width, so recover most
                // of the size and let it break.
                wrap = true;
                scale = Math.max(MIN_SCALE, Math.min(1, scale * 1.9));
            }
        }
        if (scale < 1) {
            const px = Math.max(20, Math.round(basePx * scale));
            el.style.fontSize = px + 'px';
            el.style.letterSpacing = Math.max(1, Math.round(px * 0.045)) + 'px';
            // The subtitle line carries its own inline px size — scale it too.
            const kids = el.children;
            for (let i = 0; i < kids.length; i++) {
                const fs = parseFloat(kids[i].style.fontSize);
                if (fs) kids[i].style.fontSize = Math.max(11, Math.round(fs * scale)) + 'px';
            }
        }

        // Hard-clamp the box to the corridor so a long string breaks inside it
        // instead of running off under the panels and clipping mid-word.
        el.style.maxWidth = Math.round(band.width) + 'px';
        el.style.whiteSpace = (wrap || el.scrollWidth > band.width) ? 'normal' : 'nowrap';
        el.style.overflowWrap = 'normal';
        el.style.lineHeight = '1.05';

        // Prefer TRUE viewport centre — off-centre praise reads as a bug.
        // The corridor centre sits left of screen centre because the
        // right-hand NAVIGATION stack is wider than FLIGHT CONTROLS, so
        // corridor-centring visibly shifted every call-out. Only fall back
        // to the corridor centre when the fitted text physically cannot sit
        // symmetric around the viewport centre without running under a
        // panel. (Keep translateX(-50%) — arcadePop animates transform.)
        const cvw = window.innerWidth;
        const ccx = cvw / 2;
        const fittedW = Math.min(el.scrollWidth, band.width) * SWELL;
        const symmetricRoom = Math.min(band.right - ccx, ccx - band.left) * 2;
        el.style.left = Math.round(fittedW + 8 <= symmetricRoom ? ccx : band.center) + 'px';

        // Finally: size the pop's scale envelope to the corridor the word
        // just landed in, so the opening 2.6x flare can't paint over the
        // NAVIGATION / SHIP STATUS panels or off the edges of the screen.
        _clampSwell(el, band);
    }

    function _wrapArcadeText() {
        if (typeof window === 'undefined') return false;
        if (typeof window.flashArcadeText !== 'function') return false;
        if (window.__arcadeTextFitted) return true;
        const orig = window.flashArcadeText;
        window.flashArcadeText = function (text, tier, subtitle) {
            orig(text, tier, subtitle);
            const el = document.getElementById('arcadeText');
            if (!el) return;   // praise was skipped (boss card / event alert up)
            try { _fitArcadeText(el); } catch (e) {}
        };
        window.__arcadeTextFitted = true;
        return true;
    }
    // visual-flair.js loads before this file, so this normally binds at once;
    // retry on DOM ready in case load order ever changes.
    // HYBRID: ORIGINAL praise text is not re-fitted (size, wrap, position and
    // pop are visual-flair's own). `?hy=praiseText:overhaul` re-enables the fit.
    if (!window.HYBRID || HYBRID.is('praiseText', 'overhaul')) {
        if (!_wrapArcadeText()) {
            document.addEventListener('DOMContentLoaded', _wrapArcadeText, { once: true });
        }
    }

    // Exports
    if (typeof window !== 'undefined') {
        window.arcade = {
            addKill, hitstop, slowmo, flash, grade, activatePowerup, hasPowerup, spawnPickup, update,
        };
    }
})();

// =============================================================================
// ARCADE FEEL — HYBRID arcadeFeel: on (package AK). Ben 2026-10-12: "Can the
// game be made to be more arcade like?" + "better menu UI … something modern
// that also has the retro aesthetic but with modern polish".
//
// Surfaces what the layer above already TRACKS (gameState.score, _combo,
// _comboMult, _comboUntil) — points are untouched:
//   • SCORE + COMBO ×N block (rolls up, drains, tiers), docked under the
//     title header (desktop) or top-left (phone) — never over a HUD panel
//   • kill-streak call-outs at 3 / 5 / 8 / 12 kills inside the combo window
//     through flashArcadeText, each with a generated sting + chromatic pulse
//   • "+points" pop-ups at each kill (pooled, ≤ 8 live), boss + wingman variants
//   • 2 px shake on each player-landed kill (the 45 ms kill hitstop above stays)
//   • high score (localStorage hyHighScore) on the launch title, the MISSION
//     FAILED tally and the pause menu, NEW RECORD slam when beaten
//   • pause menu restyled as the title's glass plate + keyboard navigation
// `?hy=arcadeFeel:off` skips this whole block: today's game, byte-identical.
// Styles: css/synthwave.css, section "ARCADE FEEL".
// =============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined' || !window.arcade) return;
    if (!window.HYBRID || !HYBRID.is('arcadeFeel', 'on')) return;

    const AF = {
        ROLL_MS: 400,          // score roll-up
        POP_MS: 900,           // "+points" rise + fade
        POP_POOL: 8,           // live pop-ups, oldest recycled
        POP_RISE_PX: 36,
        POP_START_DY: 28,      // starts just under the kill point (the kill text rises from it)
        STREAK: [              // kills inside the combo window → call-out (flashArcadeText tier)
            { n: 3, word: 'TRIPLE VECTOR!', tier: 4, hz: 660 },
            { n: 5, word: 'SUPERNOVA!', tier: 5, hz: 784 },
            { n: 8, word: 'KILLING ORBIT!', tier: 6, hz: 880 },   // the praise ladder already says RAMPAGE! at 7
            { n: 12, word: 'SINGULARITY!', tier: 6, hz: 1046 },
        ],
        STING_MS: 110,         // ≤ 120 ms
        SHAKE_PX: 2,
        SHAKE_MS: 120,
        LS_KEY: 'hyHighScore', // {"score": n, "date": "YYYY-MM-DD"}
        // combo tiers: ×2 … ×8 → colour + scale (wingman mint → hostile magenta)
        COMBO_TIERS: { 2: ['#19f0ff', 1.0], 3: ['#7bffb0', 1.06], 4: ['#ffe066', 1.12], 5: ['#ff8c3a', 1.18], 6: ['#ff8c3a', 1.2], 7: ['#ff2bd6', 1.24], 8: ['#ff2bd6', 1.28] },
    };
    window.HY_ARCADE_FEEL = AF;

    const gs = () => (typeof gameState !== 'undefined' ? gameState : null);
    const fmt = (n) => Math.max(0, Math.round(n || 0)).toLocaleString('en-US');
    const isDemo = () => { try { return !!(window.demoPilot && window.demoPilot.active); } catch (e) { return false; } };
    const isPhone = () => window.innerWidth <= 768 || ('ontouchstart' in window && window.innerWidth <= 1024);

    // ── HIGH SCORE ──────────────────────────────────────────────────────────
    function readBest() {
        try {
            const v = JSON.parse(localStorage.getItem(AF.LS_KEY) || 'null');
            if (v && isFinite(v.score)) return { score: Math.max(0, Math.round(v.score)), date: String(v.date || '') };
        } catch (e) { /* storage blocked */ }
        return { score: 0, date: '' };
    }
    const bestAtStart = readBest();          // the record this run has to beat
    let best = { score: bestAtStart.score, date: bestAtStart.date };
    function commitBest(score) {
        if (!(score > best.score) || isDemo()) return;
        best = { score: Math.round(score), date: new Date().toISOString().slice(0, 10) };
        try { localStorage.setItem(AF.LS_KEY, JSON.stringify(best)); } catch (e) { /* private mode */ }
    }

    // ── AUDIO: a short generated sting through the SFX bus ──────────────────
    function sting(hz, ms, gain) {
        try {
            const ac = (typeof audioContext !== 'undefined' && audioContext) ? audioContext : null;
            if (!ac || window._sfxMuted) return;
            if (ac.state === 'suspended') ac.resume();
            const out = (typeof effectsGain !== 'undefined' && effectsGain) ? effectsGain : ac.destination;
            const t0 = ac.currentTime, dur = Math.min(120, ms || AF.STING_MS) / 1000;
            [[hz, 'square', 0], [hz * 1.5, 'sawtooth', dur * 0.45]].forEach((n) => {
                const o = ac.createOscillator(), g = ac.createGain();
                o.type = n[1]; o.frequency.setValueAtTime(n[0], t0 + n[2]);
                g.gain.setValueAtTime(0.0001, t0);
                g.gain.setValueAtTime(gain || 0.07, t0 + n[2]);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
                o.connect(g); g.connect(out);
                o.start(t0 + n[2]); o.stop(t0 + dur + 0.01);
            });
        } catch (e) { /* sound optional */ }
    }

    // ── SCORE + COMBO HUD ───────────────────────────────────────────────────
    let hud = null, numEl = null, comboEl = null, xEl = null, barEl = null;
    let shown = 0, target = 0, rollFrom = 0, rollT0 = 0, rolling = false, comboHideT = 0, comboMultShown = 0;
    let placedFor = '';
    function ensureHud() {
        if (hud) return hud;
        hud = document.createElement('div');
        hud.id = 'hyafHud';
        hud.setAttribute('aria-hidden', 'true');
        hud.innerHTML = '<div class="hyaf-score"><span class="hyaf-lbl">Score</span><span class="hyaf-num">0</span></div>' +
            '<div class="hyaf-combo"><span class="hyaf-x"></span><span class="hyaf-bar"><i></i></span></div>';
        numEl = hud.querySelector('.hyaf-num'); comboEl = hud.querySelector('.hyaf-combo');
        xEl = hud.querySelector('.hyaf-x'); barEl = hud.querySelector('.hyaf-bar i');
        document.body.appendChild(hud);
        place();
        window.addEventListener('resize', place);
        return hud;
    }
    // Dock under the title header when it is on screen (desktop), else top-left (phone).
    function place() {
        if (!hud) return;
        const th = document.querySelector('.ui-panel.title-header');
        let r = null;
        if (th && !isPhone()) {
            const cs = getComputedStyle(th);
            if (cs.display !== 'none' && cs.visibility !== 'hidden') r = th.getBoundingClientRect();
        }
        const key = r ? 'top:' + Math.round(r.bottom) : 'phone';
        if (key === placedFor) return;
        placedFor = key;
        hud.classList.toggle('hyaf-phone', !r);
        hud.style.top = r ? Math.round(r.bottom + 4) + 'px' : '';
    }
    function setNum(v) {
        const s = fmt(v);
        if (numEl.textContent !== s) numEl.textContent = s;
    }
    function rollStep(now) {
        if (!rolling) return;
        const k = Math.min(1, (now - rollT0) / AF.ROLL_MS);   // linear tick (art bible R11)
        shown = rollFrom + (target - rollFrom) * k;
        setNum(shown);
        if (k < 1) requestAnimationFrame(rollStep); else rolling = false;
    }
    function scoreTo(v) {
        ensureHud();
        if (v === target) return;
        target = v; rollFrom = shown; rollT0 = performance.now();
        if (!rolling) { rolling = true; requestAnimationFrame(rollStep); }
    }
    function showCombo(g) {
        ensureHud();
        const m = g._comboMult || 1, until = g._comboUntil || 0, left = until - Date.now();
        clearTimeout(comboHideT);
        if (m < 2 || left <= 0) { comboEl.classList.remove('on'); comboMultShown = 0; return; }
        if (m !== comboMultShown) {
            const t = AF.COMBO_TIERS[Math.min(8, m)] || AF.COMBO_TIERS[8];
            xEl.textContent = '×' + m;
            comboEl.style.setProperty('--hyaf-c', t[0]);
            comboEl.style.setProperty('--hyaf-s', String(t[1]));
            if (comboMultShown) xEl.animate([{ transform: 'scale(' + (t[1] * 1.35) + ')' }, { transform: 'scale(' + t[1] + ')' }], { duration: 220, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
            comboMultShown = m;
        }
        comboEl.classList.add('on');
        barEl.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: left, fill: 'forwards' });
        comboHideT = setTimeout(() => { comboEl.classList.remove('on'); comboMultShown = 0; }, left);
    }

    // ── POP-UPS (pooled) ────────────────────────────────────────────────────
    let popLayer = null;
    const pool = [];
    const _v = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
    function ensurePops() {
        if (popLayer) return;
        popLayer = document.createElement('div');
        popLayer.id = 'hyafPops';
        popLayer.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < AF.POP_POOL; i++) {
            const el = document.createElement('div'); el.className = 'hyaf-pop';
            const sp = document.createElement('span'); el.appendChild(sp);
            popLayer.appendChild(el);
            pool.push({ el, sp, pos: (typeof THREE !== 'undefined') ? new THREE.Vector3() : null, born: 0, live: false, x: -1e4, y: -1e4, anim: null, kind: '' });
        }
        document.body.appendChild(popLayer);
    }
    function popAt(worldPos, text, kind, color) {
        if (!worldPos || !_v || typeof camera === 'undefined') return;
        ensurePops();
        let p = null;
        for (let i = 0; i < pool.length; i++) if (!pool[i].live) { p = pool[i]; break; }
        if (!p) p = pool.reduce((a, b) => (a.born <= b.born ? a : b));   // recycle the oldest
        p.pos.copy(worldPos);
        p.born = performance.now(); p.live = true;
        if (p.kind !== kind) { p.el.className = 'hyaf-pop hyaf-pop-' + kind; p.kind = kind; }
        p.sp.textContent = text;
        p.sp.style.color = color || '';
        if (p.anim) p.anim.cancel();
        p.anim = p.sp.animate([
            { transform: 'translate(-50%,0) scale(1.5)', opacity: 0 },
            { transform: 'translate(-50%,-6px) scale(1)', opacity: 1, offset: 0.14 },
            { transform: 'translate(-50%,-' + Math.round(AF.POP_RISE_PX * 0.7) + 'px) scale(1)', opacity: 1, offset: 0.7 },
            { transform: 'translate(-50%,-' + AF.POP_RISE_PX + 'px) scale(0.96)', opacity: 0 },
        ], { duration: AF.POP_MS, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
        p.x = p.y = -1e4;
        p.el.style.visibility = 'visible';
        placePop(p);
    }
    function placePop(p) {
        _v.copy(p.pos).project(camera);
        if (_v.z > 1 || _v.x < -1.1 || _v.x > 1.1 || _v.y < -1.1 || _v.y > 1.1) {
            if (p.x !== -1e4) { p.el.style.transform = 'translate3d(-1000px,-1000px,0)'; p.x = p.y = -1e4; }
            return;
        }
        const x = Math.round((_v.x + 1) / 2 * window.innerWidth);
        const y = Math.round((1 - _v.y) / 2 * window.innerHeight) + AF.POP_START_DY;
        if (x === p.x && y === p.y) return;
        p.x = x; p.y = y;
        p.el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    }
    function tickPops() {
        if (!popLayer) return;
        const now = performance.now();
        for (let i = 0; i < pool.length; i++) {
            const p = pool[i];
            if (!p.live) continue;
            if (now - p.born > AF.POP_MS) { p.live = false; p.el.style.visibility = 'hidden'; continue; }
            placePop(p);
        }
    }
    function clearPops() {
        for (let i = 0; i < pool.length; i++) {
            const p = pool[i];
            if (p.anim) { p.anim.cancel(); p.anim = null; }
            if (p.live) { p.live = false; p.el.style.visibility = 'hidden'; }
        }
    }
    function cssHex(n, lift) {
        if (typeof n !== 'number' || typeof THREE === 'undefined') return null;
        const c = new THREE.Color(n);
        const hsl = {}; c.getHSL(hsl);
        c.setHSL(hsl.h, Math.max(0.75, hsl.s), Math.max(lift || 0.62, hsl.l));   // bright enough to read on black
        return '#' + c.getHexString();
    }

    // ── SHAKE (2 px on a kill, compositor-only) ─────────────────────────────
    function shake() {
        const c = document.getElementById('gameCanvas') || ((typeof renderer !== 'undefined' && renderer) ? renderer.domElement : null);
        if (!c || !c.animate) return;
        const d = AF.SHAKE_PX;
        c.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(' + d + 'px,' + (-d / 2) + 'px)' },
            { transform: 'translate(' + (-d) + 'px,' + (d / 2) + 'px)' }, { transform: 'translate(' + (d / 2) + 'px,' + (d / 2) + 'px)' },
            { transform: 'translate(0,0)' }], { duration: AF.SHAKE_MS, easing: 'linear' });
    }

    // A streak call-out must not run under the HUD panels beside it: shrink it to
    // the free corridor of its band (one write per call-out, never per frame).
    function fitCallout() {
        const el = document.getElementById('arcadeText');
        if (!el) return;
        const r = el.getBoundingClientRect(), vw = window.innerWidth, cx = vw / 2;
        let left = 12, right = vw - 12;
        document.querySelectorAll('.ui-panel').forEach((p) => {
            const cs = getComputedStyle(p);
            if (cs.display === 'none' || cs.visibility === 'hidden' || p.closest('#pauseOverlay')) return;
            const q = p.getBoundingClientRect();
            if (q.width < 60 || q.bottom <= r.top || q.top >= r.bottom) return;
            const qc = (q.left + q.right) / 2;
            if (Math.abs(qc - cx) < vw * 0.22) return;           // the title header sits above, not beside
            if (qc < cx) left = Math.max(left, q.right + 12); else right = Math.min(right, q.left - 12);
        });
        const room = Math.min(cx - left, right - cx) * 2;       // centred on the viewport, as the praise is
        const w = el.scrollWidth;
        if (w > room && room > 120) {
            const fs = parseFloat(getComputedStyle(el).fontSize) || 40;
            const k = room / w;
            el.style.fontSize = Math.max(24, Math.floor(fs * k)) + 'px';
            const sub = el.children[1];
            if (sub) sub.style.fontSize = Math.max(16, Math.round(parseFloat(sub.style.fontSize || '16') * k)) + 'px';
        }
    }

    // ── KILL HOOKS ──────────────────────────────────────────────────────────
    let lastStreakN = 0;
    const _addKill = window.arcade.addKill;
    window.arcade.addKill = function (enemyUd, worldPos, isBoss) {
        const g = gs();
        const before = g ? (g.score || 0) : 0;
        _addKill.apply(this, arguments);
        if (!g || g.gameOver) return;
        const pts = (g.score || 0) - before;
        const m = g._comboMult || 1;
        try {
            if (isBoss) popAt(worldPos, '+' + fmt(pts), 'boss', cssHex(enemyUd && enemyUd.galaxyColor, 0.6) || '#ff8c3a');
            else popAt(worldPos, '+' + fmt(pts) + (m > 1 ? ' ×' + m : ''), m > 1 ? 'combo' : 'kill');
            scoreTo(g.score || 0);
            showCombo(g);
            commitBest(g.score || 0);
            shake();
            // streak call-outs: once per rung per combo chain; never over a flagship's own call-out
            const n = g._combo || 0;
            if (n < lastStreakN) lastStreakN = 0;
            const rung = AF.STREAK.find((s) => s.n === n);
            if (rung && !isBoss && n > lastStreakN) {
                lastStreakN = n;
                if (typeof window.flashArcadeText === 'function') {
                    window.flashArcadeText(rung.word, rung.tier, isPhone() ? null : (n + '-KILL STREAK · ×' + m));
                    fitCallout();
                }
                sting(rung.hz, AF.STING_MS, 0.08);
                const pulse = window.whipScreenPulse;
                if (typeof pulse === 'function') { try { pulse(0xff2bd6, 0.26 + rung.tier * 0.02); } catch (e) {} }
            }
        } catch (e) { /* the feel layer must never break a kill */ }
    };
    // Wingman kills don't score: a smaller, dimmer mint tag.
    function wrapWingmanKill() {
        const orig = window._handleWingmanKill;
        if (typeof orig !== 'function' || orig.__hyaf) return;
        const w = function (enemy) {
            const fresh = enemy && enemy.userData && !enemy.userData._removedByWingman;
            const pos = fresh && enemy.position ? enemy.position.clone() : null;
            const r = orig.apply(this, arguments);
            if (pos) { try { const g = gs(); if (g && g.gameStarted && !g.gameOver) popAt(pos, 'WING KILL', 'wing'); } catch (e) {} }
            return r;
        };
        w.__hyaf = true;
        window._handleWingmanKill = w;
    }
    wrapWingmanKill();

    // ── PER-FRAME: pop-up positions only (nothing else writes per frame) ────
    let ended = false, lastScore = -1, yielded = false;
    const _update = window.arcade.update;
    window.arcade.update = function () {
        _update.apply(this, arguments);
        const g = gs(); if (!g) return;
        if (g.gameOver) { endRun(); return; }
        if (!g.gameStarted) return;
        if (!hud) { ensureHud(); shown = target = g.score || 0; setNum(shown); }
        if ((g.score || 0) !== lastScore) {          // score from any source (e.g. discoveries)
            lastScore = g.score || 0;
            if (lastScore !== target) scoreTo(lastScore);
            commitBest(lastScore);
        }
        // The boss intro card and the event alert cards own the band under the
        // title header: the strip steps out of their way (class flip on change only).
        if (((g.frameCount || 0) % 6) === 0) {
            const busy = !!(document.getElementById('bossIntroCard') || document.querySelector('.event-text-flash'));
            if (busy !== yielded) { yielded = busy; hud.classList.toggle('hyaf-yield', busy); }
        }
        tickPops();
    };

    // ── END OF RUN: tear down, keep the record ──────────────────────────────
    function endRun() {
        if (ended) return;
        ended = true;
        const g = gs();
        if (g) commitBest(g.score || 0);
        rolling = false; clearTimeout(comboHideT);
        clearPops();
        if (hud) hud.classList.add('hyaf-off');
        if (popLayer) popLayer.classList.add('hyaf-off');
    }
    function wrapGameOver() {
        const sgo = window.synthwaveGameOver;
        if (typeof sgo === 'function' && !sgo.__hyaf) {
            const w = function () {
                endRun();
                const root = sgo.apply(this, arguments);
                try { if (root) recordSlam(root); } catch (e) {}
                return root;
            };
            w.__hyaf = true;
            window.synthwaveGameOver = w;
        }
        const sos = window.showGameOverScreen;
        if (typeof sos === 'function' && !sos.__hyaf) {
            const w2 = function () { endRun(); return sos.apply(this, arguments); };
            w2.__hyaf = true;
            window.showGameOverScreen = w2;
        }
    }
    // MISSION FAILED tally (js/synthwave-fx.js gatherStats asks for these):
    // Score = the arcade score the HUD showed, plus a Best row.
    function tallyRows(rows, stat) {
        const g = gs() || {};
        const score = Math.round(g.score || 0);
        const out = rows.filter((r) => r.label !== 'Score');
        out.push(stat('Score', score, fmt));
        out.push(stat('Best', Math.max(bestAtStart.score, score), fmt));
        return out;
    }
    function isNewRecord() {
        const g = gs() || {};
        return !isDemo() && (g.score || 0) > bestAtStart.score && (g.score || 0) > 0;
    }
    function recordSlam(root) {
        if (!isNewRecord()) return;
        const D = window.SW_DEATH || { HOLD_MS: 380, TALLY_ROW_MS: 420, TALLY_GAP_MS: 140 };
        const rows = root.querySelectorAll('.sw-tally .row').length || 7;
        const at = D.HOLD_MS + 650 + rows * (D.TALLY_ROW_MS + D.TALLY_GAP_MS);
        setTimeout(() => {
            if (!root.parentNode) return;
            const bestRow = Array.from(root.querySelectorAll('.sw-tally .row')).find((r) => /best/i.test(r.textContent));
            if (bestRow) bestRow.classList.add('hyaf-record');
            const tally = root.querySelector('.sw-tally');
            const slam = document.createElement('div');
            slam.className = 'hyaf-newrecord';
            slam.textContent = 'New record';
            if (tally && tally.parentNode) tally.parentNode.insertBefore(slam, tally.nextSibling);
            sting(1046, 110, 0.09); setTimeout(() => sting(1568, 110, 0.07), 120);
        }, at);
    }
    window.hyArcadeFeel = { tallyRows, best: () => best, bestAtStart, isNewRecord, AF };

    // ── LAUNCH TITLE: BEST under the menu plate ─────────────────────────────
    function titleBest() {
        if (!(bestAtStart.score > 0)) return;
        const menu = document.querySelector('#hyTitle .hyl-menu');
        if (!menu || menu.querySelector('.hyaf-best')) return;
        const b = document.createElement('div');
        b.className = 'hyaf-best';
        b.innerHTML = '<span class="k">Best</span><span class="v">' + fmt(bestAtStart.score) + '</span>' +
            (bestAtStart.date ? '<span class="d">' + bestAtStart.date + '</span>' : '');
        menu.appendChild(b);
    }

    // ── PAUSE MENU: the title's glass plate, keyboard first ─────────────────
    const NAV_IDS = ['pauseResumeBtn', 'mobileMusicBtn', 'mobileSkipTrackBtn', 'pauseSfxBtn', 'pauseMusicVol', 'pauseSfxVol', 'pauseFlightBtn'];
    let navIdx = 0;
    function navItems() {
        const ov = document.getElementById('pauseOverlay'); if (!ov) return [];
        return NAV_IDS.map((id) => document.getElementById(id)).filter((el) => el && ov.contains(el) && el.offsetParent !== null);
    }
    function setFocus(i) {
        const items = navItems(); if (!items.length) return;
        navIdx = (i + items.length) % items.length;
        items.forEach((el, k) => {
            const host = el.tagName === 'INPUT' ? el.closest('.hyaf-slider') || el : el;
            host.classList.toggle('hyaf-focus', k === navIdx);
        });
    }
    function decoratePause() {
        const ov = document.getElementById('pauseOverlay'); if (!ov) return;
        if (!ov.classList.contains('hyaf-pause')) {
            ov.classList.add('hyaf-pause');
            const panel = ov.firstElementChild;
            const h2 = panel && panel.querySelector('h2');
            if (h2) {
                const stats = document.createElement('div');
                stats.className = 'hyaf-pstats';
                stats.innerHTML = '<div><span class="k">Score</span><span class="v" data-k="score">0</span></div>' +
                    '<div><span class="k">Best</span><span class="v" data-k="best">0</span></div>' +
                    '<div><span class="k">Time</span><span class="v" data-k="time">0:00</span></div>';
                h2.parentNode.insertBefore(stats, h2.nextSibling);
            }
            // each slider gets its label inside one focusable row
            ['pauseMusicVol', 'pauseSfxVol'].forEach((id) => {
                const inp = document.getElementById(id); if (!inp) return;
                const lbl = inp.previousElementSibling;
                const row = document.createElement('div'); row.className = 'hyaf-slider';
                inp.parentNode.insertBefore(row, inp);
                if (lbl && !lbl.matches('input,button')) row.appendChild(lbl);
                row.appendChild(inp);
            });
            if (!isPhone()) {
                const keys = document.createElement('div'); keys.className = 'hyaf-pkeys';
                keys.innerHTML = '<span>↑ ↓ Select</span><span>← → Adjust</span><span>Enter Confirm</span><span>Esc Resume</span>';
                panel.appendChild(keys);
            }
            panel.addEventListener('mousemove', (e) => {
                const items = navItems();
                const k = items.findIndex((el) => el.contains(e.target) || (el.closest('.hyaf-slider') && el.closest('.hyaf-slider').contains(e.target)));
                if (k >= 0 && k !== navIdx) setFocus(k);
            });
        }
        const g = gs() || {};
        const secs = g.gameStartTime ? Math.max(0, (Date.now() - g.gameStartTime) / 1000) : 0;
        const set = (k, v) => { const el = ov.querySelector('.hyaf-pstats [data-k="' + k + '"]'); if (el && el.textContent !== v) el.textContent = v; };
        set('score', fmt(g.score || 0));
        set('best', fmt(Math.max(best.score, g.score || 0)));
        set('time', Math.floor(secs / 60) + ':' + String(Math.floor(secs % 60)).padStart(2, '0'));
        setFocus(0);
    }
    function wrapPause() {
        const tp = window.togglePause;
        if (typeof tp !== 'function' || tp.__hyaf) return;
        const w = function () {
            const r = tp.apply(this, arguments);
            try { const g = gs(); if (g && g.paused) decoratePause(); } catch (e) {}
            return r;
        };
        w.__hyaf = true;
        window.togglePause = w;
    }
    wrapPause();
    function pauseOpen() {
        const g = gs(), ov = document.getElementById('pauseOverlay');
        return !!(g && g.paused && ov && ov.classList.contains('hyaf-pause') && ov.style.display !== 'none');
    }
    window.addEventListener('keydown', (e) => {
        if (!pauseOpen()) return;
        const pop = document.getElementById('controlsPopup');
        if (pop && pop.offsetParent !== null && getComputedStyle(pop).display !== 'none') return;   // the reference card has the keys
        const k = e.key;
        if (k !== 'ArrowUp' && k !== 'ArrowDown' && k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'Enter' && k !== ' ' && k !== 'Escape') return;
        e.preventDefault(); e.stopPropagation();
        const items = navItems(); const el = items[navIdx];
        if (k === 'ArrowUp') setFocus(navIdx - 1);
        else if (k === 'ArrowDown') setFocus(navIdx + 1);
        else if (k === 'Escape') window.togglePause();
        else if (el && el.tagName === 'INPUT' && (k === 'ArrowLeft' || k === 'ArrowRight')) {
            const step = parseFloat(el.step) || 0.05;
            const v = Math.max(parseFloat(el.min) || 0, Math.min(parseFloat(el.max) || 1, parseFloat(el.value) + (k === 'ArrowRight' ? step : -step)));
            el.value = String(Math.round(v * 100) / 100);
            el.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (el && el.tagName !== 'INPUT' && (k === 'Enter' || k === ' ')) el.click();
        else if (k === 'ArrowLeft' || k === 'ArrowRight') {
            // the Music / Skip / SFX row reads left-right too
            const row = ['mobileMusicBtn', 'mobileSkipTrackBtn', 'pauseSfxBtn'];
            if (el && row.indexOf(el.id) >= 0) setFocus(navIdx + (k === 'ArrowRight' ? 1 : -1));
        }
    }, true);

    function lateBind() { wrapGameOver(); wrapWingmanKill(); wrapPause(); titleBest(); }
    lateBind();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lateBind, { once: true });
    else setTimeout(lateBind, 0);
})();
