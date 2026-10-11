// =============================================================================
// SYNTHWAVE FX — Interstellar Slingshot (branch claude/synthwave)
// Arcade screens in the synthwave / retrowave / vector-arcade idiom. Wave 1:
// the MISSION FAILED sequence (window.synthwaveGameOver), called from
// showGameOverScreen (js/game-ui.js) under HYBRID deathScreen: synthwave.
// Pure DOM + 2D canvas: no WebGL post pass, so it costs nothing in play.
// Palette lives in css/synthwave.css (:root --sw-*).
// =============================================================================
(function () {
    'use strict';

    const SW_DEATH = {
        HOLD_MS: 380,          // freeze beat before the glitch and title
        TALLY_ROW_MS: 420,     // per stat row count-up
        TALLY_GAP_MS: 140,
        CONTINUE_FROM: 9,      // CONTINUE? 9 … 0
        CONTINUE_STEP_MS: 1000,
        GRID_SPEED: 0.55,      // grid scroll, rows per second
        SUN_STRIPES: 7
    };
    if (typeof window !== 'undefined') window.SW_DEATH = SW_DEATH;

    function cssVar(name, fallback) {
        try { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; } catch (e) { return fallback; }
    }

    // A short synth blip through the game's own AudioContext when it is live
    // (the game suspends it on death — resume for the tally, suspend after).
    function blip(freq, ms, gain) {
        try {
            const ac = (typeof audioContext !== 'undefined' && audioContext) ? audioContext : null;
            if (!ac) return;
            if (ac.state === 'suspended') ac.resume();
            const o = ac.createOscillator(), g = ac.createGain();
            o.type = 'square'; o.frequency.value = freq;
            g.gain.setValueAtTime(gain || 0.06, ac.currentTime);
            g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + (ms || 70) / 1000);
            o.connect(g); g.connect(ac.destination);
            o.start(); o.stop(ac.currentTime + (ms || 70) / 1000 + 0.02);
        } catch (e) { /* sound optional */ }
    }

    // ── the grid horizon + striped sun (2D canvas, drawn each frame) ───────
    function startGrid(canvas) {
        const ctx = canvas.getContext('2d');
        let raf = 0, t0 = performance.now();
        const magenta = cssVar('--sw-magenta', '#ff2bd6'), cyan = cssVar('--sw-cyan', '#19f0ff');
        const orange = cssVar('--sw-orange', '#ff8c3a'), yellow = cssVar('--sw-yellow', '#ffe066');
        function frame(now) {
            const w = canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
            const h = canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1);
            const t = (now - t0) / 1000;
            ctx.clearRect(0, 0, w, h);
            const horizon = h * 0.62;
            // sun with stripes, behind the horizon
            const sunR = Math.min(w, h) * 0.17, sx = w * 0.5, sy = horizon - sunR * 0.15;
            const g = ctx.createLinearGradient(0, sy - sunR, 0, sy + sunR);
            g.addColorStop(0, yellow); g.addColorStop(0.55, orange); g.addColorStop(1, magenta);
            ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, sunR, 0, Math.PI * 2); ctx.clip();
            ctx.fillStyle = g; ctx.globalAlpha = 0.9; ctx.fillRect(sx - sunR, sy - sunR, sunR * 2, sunR * 2);
            ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(7,3,15,0.95)';
            for (let i = 0; i < SW_DEATH.SUN_STRIPES; i++) {
                const y = sy + sunR * (0.05 + i * 0.13) + ((t * 18) % (sunR * 0.13));
                ctx.fillRect(sx - sunR, y, sunR * 2, Math.max(1, sunR * 0.02 + i * sunR * 0.012));
            }
            ctx.restore();
            ctx.save(); ctx.shadowColor = magenta; ctx.shadowBlur = 24 * (window.devicePixelRatio || 1);
            ctx.strokeStyle = 'rgba(255,43,214,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, sunR, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
            // floor
            ctx.fillStyle = 'rgba(11,6,32,0.92)'; ctx.fillRect(0, horizon, w, h - horizon);
            // horizon glow line
            ctx.save(); ctx.shadowColor = cyan; ctx.shadowBlur = 18; ctx.strokeStyle = cyan; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(w, horizon); ctx.stroke(); ctx.restore();
            // perspective grid: verticals converge on the vanishing point, horizontals scroll toward the viewer
            ctx.save(); ctx.shadowColor = magenta; ctx.shadowBlur = 8; ctx.strokeStyle = cssVar('--sw-grid', 'rgba(255,43,214,0.85)'); ctx.lineWidth = 1.5;
            const vpX = w * 0.5, vpY = horizon - h * 0.08;
            const cols = 18;
            for (let i = -cols; i <= cols; i++) {
                const xb = w * 0.5 + i * (w * 0.09);
                ctx.beginPath(); ctx.moveTo(vpX + (xb - vpX) * ((horizon - vpY) / (h - vpY)), horizon); ctx.lineTo(xb, h); ctx.stroke();
            }
            const rows = 14, phase = (t * SW_DEATH.GRID_SPEED) % 1;
            for (let r = 0; r < rows; r++) {
                const k = (r + phase) / rows;               // 0 = horizon … 1 = bottom
                const y = horizon + (h - horizon) * k * k;  // squared for perspective
                ctx.globalAlpha = 0.25 + 0.75 * k;
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
            }
            ctx.restore();
            raf = requestAnimationFrame(frame);
        }
        raf = requestAnimationFrame(frame);
        return function stop() { cancelAnimationFrame(raf); };
    }

    function stat(label, value, fmt) { return { label: label, value: value, fmt: fmt || ((v) => '' + Math.round(v)) }; }

    function gatherStats() {
        const gs = (typeof gameState !== 'undefined') ? gameState : {};
        const dp = (typeof window !== 'undefined') ? window.demoPilot : null;
        const kills = gs.enemiesKilled || gs.kills || gs.enemiesDestroyed || (dp && dp.enemiesKilled) || 0;
        const secs = gs.gameStartTime ? Math.max(0, (Date.now() - gs.gameStartTime) / 1000) : 0;
        const mm = Math.floor(secs / 60), ss = Math.floor(secs % 60);
        return [
            stat('Hostiles destroyed', kills),
            stat('Galaxies freed', gs.galaxiesCleared || 0, (v) => Math.round(v) + ' / 8'),
            stat('Distance', gs.distance || 0, (v) => v.toFixed(1) + ' ly'),
            stat('Reputation', gs.reputation || 0),
            stat('Time flown', secs, (v) => { const m = Math.floor(v / 60), s = Math.floor(v % 60); return m + ':' + (s < 10 ? '0' : '') + s; }),
            stat('Score', (kills * 150) + Math.round((gs.distance || 0) * 1000) + (gs.galaxiesCleared || 0) * 5000 + (gs.reputation || 0) * 10)
        ];
    }

    // ── the sequence ────────────────────────────────────────────────────────
    function synthwaveGameOver(title, message) {
        if (document.getElementById('swDeath')) return;
        const root = document.createElement('div');
        root.id = 'swDeath';
        root.innerHTML =
            '<canvas class="sw-grid"></canvas>' +
            '<div class="sw-vignette"></div>' +
            '<div class="sw-scan"></div>' +
            '<div class="sw-glitch">' + [12, 27, 41, 58, 73, 86].map((p, i) => '<span style="top:' + p + '%;height:' + (4 + (i % 3) * 5) + 'px;animation-delay:' + (i * 23) + 'ms"></span>').join('') + '</div>' +
            '<div class="sw-stage">' +
            '  <h1 class="sw-title" style="visibility:hidden">' + (title || 'MISSION FAILED') + '</h1>' +
            '  <div class="sw-sub" style="visibility:hidden">' + (message || 'Ship destroyed') + '</div>' +
            '  <div class="sw-tally"></div>' +
            '  <div class="sw-continue" style="visibility:hidden"><div class="q">Continue?</div><div class="n"></div></div>' +
            '  <button class="sw-btn" style="visibility:hidden">Restart Mission</button>' +
            '  <div class="sw-hint" style="visibility:hidden">any key · click · tap</div>' +
            '</div>';
        document.body.appendChild(root);
        document.body.style.cursor = 'auto';
        const canvasEl = document.getElementById('gameCanvas'); if (canvasEl) canvasEl.style.pointerEvents = 'none';
        const stopGrid = startGrid(root.querySelector('.sw-grid'));

        const titleEl = root.querySelector('.sw-title'), subEl = root.querySelector('.sw-sub');
        const tallyEl = root.querySelector('.sw-tally'), contEl = root.querySelector('.sw-continue');
        const numEl = contEl.querySelector('.n'), btn = root.querySelector('.sw-btn'), hint = root.querySelector('.sw-hint');
        let done = false;
        function restart() { if (done) return; done = true; stopGrid(); location.reload(); }
        btn.addEventListener('click', restart);
        btn.addEventListener('touchend', (e) => { e.preventDefault(); restart(); });

        // 1. freeze beat, then the glitch is already running (CSS); slam the title
        setTimeout(() => {
            titleEl.style.visibility = 'visible'; blip(110, 180, 0.08); setTimeout(() => blip(55, 320, 0.08), 90);
            subEl.style.visibility = 'visible';
        }, SW_DEATH.HOLD_MS);

        // 2. tally: rows count up one after another
        const stats = gatherStats();
        stats.forEach((s) => {
            const row = document.createElement('div'); row.className = 'row pending';
            row.innerHTML = '<div class="k">' + s.label + '</div><div class="v">' + s.fmt(0) + '</div>';
            tallyEl.appendChild(row); s.el = row;
        });
        let t = SW_DEATH.HOLD_MS + 650;
        stats.forEach((s, i) => {
            setTimeout(() => {
                const v = s.el.querySelector('.v'), t0 = performance.now();
                s.el.classList.remove('pending');
                (function step(now) {
                    const k = Math.min(1, (now - t0) / SW_DEATH.TALLY_ROW_MS);
                    const e = 1 - Math.pow(1 - k, 3);
                    v.textContent = s.fmt(s.value * e);
                    if (k < 1) requestAnimationFrame(step);
                    else { s.el.classList.add('done'); blip(660 + i * 90, 60, 0.05); }
                })(t0);
            }, t);
            t += SW_DEATH.TALLY_ROW_MS + SW_DEATH.TALLY_GAP_MS;
        });

        // 3. CONTINUE? 9 … 0, then GAME OVER + INSERT COIN; any input restarts
        setTimeout(() => {
            contEl.style.visibility = 'visible'; btn.style.visibility = 'visible'; hint.style.visibility = 'visible';
            let n = SW_DEATH.CONTINUE_FROM;
            numEl.textContent = n;
            const iv = setInterval(() => {
                n--;
                if (n < 0) {
                    clearInterval(iv);
                    root.classList.add('sw-over');
                    contEl.querySelector('.q').textContent = 'Game over';
                    numEl.textContent = '';
                    const coin = document.createElement('div'); coin.className = 'sw-coin'; coin.textContent = 'Insert coin';
                    contEl.appendChild(coin);
                    blip(80, 500, 0.08);
                    return;
                }
                numEl.textContent = n; numEl.classList.remove('tick'); void numEl.offsetWidth; numEl.classList.add('tick');
                blip(n > 3 ? 440 : 880, 50, 0.04);
            }, SW_DEATH.CONTINUE_STEP_MS);
            const any = (e) => { if (e && e.type === 'keydown' && (e.key === 'F5' || e.metaKey || e.ctrlKey)) return; restart(); };
            setTimeout(() => { window.addEventListener('keydown', any); root.addEventListener('click', any); }, 600);
        }, t + 200);
        return root;
    }

    if (typeof window !== 'undefined') window.synthwaveGameOver = synthwaveGameOver;
})();
