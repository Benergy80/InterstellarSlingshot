// =============================================================================
// ARCADE LAYER — score, combo multiplier, HUD, hitstop, flash punch, slow-mo,
// grade pops, power-ups, asteroid-drop pickups, speed lines, SFX stingers.
// Self-contained; hooks are called from game-controls / game-objects.
// =============================================================================
(function () {
    function gs() { return (typeof gameState !== 'undefined') ? gameState : null; }

    // ── DOM HUD (score + combo + power-up timers) ────────────────────────────
    let _hud = null, _scoreEl = null, _comboEl = null, _puEl = null;
    function _ensureHud() {
        if (_hud) return;
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
        if (worldPos && typeof spawnKillText === 'function') {
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

    // Exports
    if (typeof window !== 'undefined') {
        window.arcade = {
            addKill, hitstop, slowmo, flash, grade, activatePowerup, hasPowerup, spawnPickup, update,
        };
    }
})();
