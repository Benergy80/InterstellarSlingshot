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

    // ── the alien landscape (2D canvas, drawn each frame) ───────────────────
    // Ben, 2026-10-11: "it needs mountains being generated like beat lines
    // horizontally so it makes crazy alien landscapes. It is a little too miami
    // and needs to be otherworldly." Rows of horizontal lines, each displaced by
    // layered value noise (taller as they near the viewer), drawn back to front
    // with a dark fill below each so nearer ridges occlude farther ones — a
    // wireframe range that scrolls toward you and never repeats — under an
    // eclipsed black hole instead of the striped sun.
    const SW_LAND = {
        ROWS: 30,            // beat lines from the horizon to the bottom edge
        SEGS: 120,           // samples per row
        SPEED: 0.16,         // rows per second toward the viewer
        DRIFT: 0.05,         // sideways drift of the range (noise units / s)
        AMP: 0.95,           // max ridge height, as a fraction of the floor height (near rows)
        SHARP: 1.35,         // peak sharpening (pow)
        FLOOR: 0.06,         // noise below this is flat ground
        OCTAVES: [[1.9, 0.5], [4.6, 0.32], [9.3, 0.18]],   // [frequency, weight] — several peaks across the width
        COLS: 14,            // faint converging verticals (0 = none)
        VALLEY: 0.8,         // how much the ranges drop toward the centre (0 = none)
        VALLEY_W: 0.2,       // half-width of the valley, fraction of the screen
        HOLE_R: 0.15         // eclipse radius, fraction of min(w,h)
    };
    if (typeof window !== 'undefined') window.SW_LAND = SW_LAND;
    function _hash(i) { let x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
    function _vnoise(x, y) {            // 2-D value noise, smooth, 0..1
        const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const h = (i, j) => _hash(i * 57 + j * 131);
        const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * sx;
        const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * sx;
        return a + (b - a) * sy;
    }
    function _terrain(u, d) {           // u: across, d: depth (0 far … 1 near)
        let v = 0, wsum = 0;
        for (let i = 0; i < SW_LAND.OCTAVES.length; i++) {
            const f = SW_LAND.OCTAVES[i][0], w = SW_LAND.OCTAVES[i][1];
            v += w * _vnoise(u * f, d * f * 2.2); wsum += w;
        }
        v /= wsum;
        return Math.pow(Math.max(0, v - SW_LAND.FLOOR) / (1 - SW_LAND.FLOOR), SW_LAND.SHARP);   // flats stay flat, peaks spike
    }
    // opts (all optional; omitted = the MISSION FAILED look, unchanged): the
    // title screen (js/title-screens.js, titleScreen: landscape) passes a dawn
    // palette, a slower scroll and a rising eclipse.
    //   sky: [[stop, css]…]  corona: [[stop, css]…]  ring, horizonLine, fill: css
    //   lines: [far, mid, near]  cols: css  speed: rows/s
    //   rise: { from, to, ms }  (eclipse centre, in hole radii above the horizon)
    //   onFrame(t): called after each paint
    function startGrid(canvas, opts) {
        const o = opts || {};
        const ctx = canvas.getContext('2d');
        let raf = 0, t0 = performance.now();
        const cyan = cssVar('--sw-cyan', '#19f0ff'), violet = cssVar('--sw-violet', '#7b2bff');
        const magenta = cssVar('--sw-magenta', '#ff2bd6'), mint = cssVar('--sw-mint', '#7bffb0');
        const SKY = o.sky || [[0, 'rgba(7,3,15,0)'], [0.7, 'rgba(26,11,58,0.35)'], [1, 'rgba(60,20,110,0.55)']];
        const CORONA = o.corona || [[0, 'rgba(123,43,255,0.55)'], [0.35, 'rgba(25,240,255,0.18)'], [1, 'rgba(7,3,15,0)']];
        const RING = o.ring || 'rgba(214,250,255,0.95)', RING_GLOW = o.ringGlow || cyan;
        const LINES = o.lines || [violet, cyan, mint], COLS = o.cols || violet;
        const FILL = o.fill || 'rgba(8,4,20,0.96)', HLINE = o.horizonLine || 'rgba(25,240,255,0.7)', HGLOW = o.horizonGlow || cyan;
        const SPEED = o.speed || SW_LAND.SPEED;
        // o.view (optional, mutable, read every frame — the launch title drives it):
        //   horizon  fraction of the height where the horizon sits (default 0.58)
        //   squash   floor height multiplier (1 = full range; < 1 foreshortens it)
        //   alpha    beat-line brightness multiplier (default 1)
        //   ground   opacity of everything but the sun (default 1)
        // and the renderer writes back view.sun = [x, y, r] in CSS px.
        // o.manual: no rAF of its own; the caller drives stop.frame(now).
        const V = o.view || null;
        const hs = new Float32Array(SW_LAND.SEGS + 1);
        function frame(now) {
            const pr = o.pixelRatio || window.devicePixelRatio || 1;
            const cw = Math.floor(canvas.clientWidth * pr), ch = Math.floor(canvas.clientHeight * pr);
            if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
            const w = cw, h = ch;
            const t = (now - t0) / 1000;
            ctx.clearRect(0, 0, w, h);
            const horizon = h * (V && V.horizon != null ? V.horizon : 0.58), floorH = (h * 0.42) * (V && V.squash != null ? V.squash : 1);
            const LG = V && V.ground != null ? V.ground : 1;                 // the ground (rows, fill, verticals, horizon line) — the sun stays
            const LA = (V && V.alpha != null ? V.alpha : 1) * LG;
            // sky: violet dusk down to the horizon
            const sky = ctx.createLinearGradient(0, 0, 0, horizon);
            SKY.forEach((c) => sky.addColorStop(c[0], c[1]));
            ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon);
            // the eclipsed hole on the horizon
            let lift = 0.35;
            if (o.rise) { const k = Math.min(1, (now - t0) / o.rise.ms), e = 1 - Math.pow(1 - k, 3); lift = o.rise.from + (o.rise.to - o.rise.from) * e; }
            const R = Math.min(w, h) * SW_LAND.HOLE_R, hx = w * 0.5, hy = horizon - R * lift;
            if (V) V.sun = [hx / pr, hy / pr, R / pr];
            const pulse = 0.5 + 0.5 * Math.sin(t * 1.3);
            const corona = ctx.createRadialGradient(hx, hy, R * 0.95, hx, hy, R * 2.6);
            CORONA.forEach((c) => corona.addColorStop(c[0], c[1]));
            ctx.fillStyle = corona; ctx.fillRect(hx - R * 2.6, hy - R * 2.6, R * 5.2, R * 5.2);
            ctx.fillStyle = '#030108'; ctx.beginPath(); ctx.arc(hx, hy, R, 0, Math.PI * 2); ctx.fill();
            ctx.save(); ctx.shadowColor = RING_GLOW; ctx.shadowBlur = (14 + 10 * pulse) * pr; ctx.strokeStyle = RING; ctx.lineWidth = 2 * pr;
            ctx.beginPath(); ctx.arc(hx, hy, R * 1.02, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
            // the range: rows from far to near, each a displaced beat line with a dark fill below
            const rows = SW_LAND.ROWS, segs = SW_LAND.SEGS;
            const phase = (t * SPEED) % 1, drift = t * SW_LAND.DRIFT;
            const base = Math.floor(t * SPEED);        // integer row index of the nearest row (new rows enter at the horizon)
            const vpX = w * 0.5;
            for (let r = 0; r < (LG > 0.01 ? rows : 0); r++) {                   // painter's order: far (horizon) first, near last
                const k = (r + phase) / rows;                  // 0 at the horizon … 1 at the bottom
                const kk = k * k;                              // perspective spacing
                const y0 = horizon + floorH * kk;
                const depthIdx = base + (rows - 1 - r);        // continuous identity as the row scrolls
                const amp = floorH * SW_LAND.AMP * (0.08 + 0.92 * kk);
                const spread = 1 + 2.2 * kk;                   // near rows span wider in world units
                if (y0 - amp > h + 4) continue;                // the whole row is below the frame (the launch drops the range away)
                ctx.beginPath();
                for (let i = 0; i <= segs; i++) {
                    const sx = i / segs;
                    const u = (sx - 0.5) * spread * 4 + drift;
                    const hgt = _terrain(u, depthIdx * 0.37 + kk * 0.6) * amp * (1 - SW_LAND.VALLEY * Math.exp(-Math.pow((sx - 0.5) / SW_LAND.VALLEY_W, 2)));   // a dark plain down the middle: the text sits on it
                    hs[i] = hgt;                               // the stroke pass below reuses the same heights
                    const x = vpX + (sx - 0.5) * w * (0.35 + 0.95 * k);   // converge toward the horizon
                    const y = y0 - hgt;
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                // occlusion: fill below the ridge to the bottom in the sky-dark
                ctx.lineTo(w * 1.2, h + 4); ctx.lineTo(-w * 0.2, h + 4); ctx.closePath();
                ctx.fillStyle = FILL; if (LG !== 1) { ctx.globalAlpha = LG; ctx.fill(); ctx.globalAlpha = 1; } else ctx.fill();
                // the beat line itself: violet far, teal near, brightest at the peaks
                const col = k < 0.5 ? LINES[0] : (k < 0.8 ? LINES[1] : LINES[2]);
                ctx.save(); ctx.globalAlpha = (0.28 + 0.72 * k) * LA; ctx.shadowColor = col; ctx.shadowBlur = (4 + 10 * k) * pr;
                ctx.strokeStyle = col; ctx.lineWidth = (0.8 + 1.4 * k) * pr;
                ctx.beginPath();
                for (let i = 0; i <= segs; i++) {
                    const sx = i / segs;
                    const x = vpX + (sx - 0.5) * w * (0.35 + 0.95 * k);
                    const y = y0 - hs[i];
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke(); ctx.restore();
            }
            // faint converging verticals over the floor, for depth
            if (SW_LAND.COLS > 0) {
                ctx.save(); ctx.globalAlpha = 0.16 * LG; ctx.strokeStyle = COLS; ctx.lineWidth = 1 * pr;
                for (let i = -SW_LAND.COLS; i <= SW_LAND.COLS; i++) {
                    const xb = w * 0.5 + i * (w * 0.08);
                    ctx.beginPath(); ctx.moveTo(vpX + (xb - vpX) * 0.35, horizon); ctx.lineTo(xb, h); ctx.stroke();
                }
                ctx.restore();
            }
            // horizon glow line
            ctx.save(); ctx.globalAlpha = LG; ctx.shadowColor = HGLOW; ctx.shadowBlur = 16 * pr; ctx.strokeStyle = HLINE; ctx.lineWidth = 1.5 * pr;
            ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(w, horizon); ctx.stroke(); ctx.restore();
            if (o.onFrame) o.onFrame(t);
            if (!o.manual) raf = requestAnimationFrame(frame);
        }
        if (!o.manual) raf = requestAnimationFrame(frame);
        const stop = function stop() { cancelAnimationFrame(raf); };
        stop.frame = frame;
        return stop;
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
    if (typeof window !== 'undefined') window.swLandscape = startGrid;   // the title screen reuses the range (js/title-screens.js)
})();
