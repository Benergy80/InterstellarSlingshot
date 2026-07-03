// =============================================================================
// VICTORY REPLAY — "best moments" spectator playback.
//
// During play, a rolling 13-second buffer of the ship's state is sampled at
// 10Hz. Highlight events (boss kills, galaxy liberations, slingshots) snapshot
// that buffer with a label. When the campaign is won (all 8 galaxies
// liberated), the top moments replay in sequence: the PLAYER SHIP MODEL flies
// the recorded track while the camera sits at a slowly-orbiting spectator
// vantage watching it — an outside point of view the live game never has.
// World simulation is paused for the duration (same render-only pattern as
// the pause branch); ESC skips.
// =============================================================================
(function () {
    const SAMPLE_HZ = 10;
    const BUFFER_SECONDS = 13;
    const MAX_SAMPLES = SAMPLE_HZ * BUFFER_SECONDS;
    const MAX_HIGHLIGHTS = 10;
    const REPLAY_SECONDS_PER_CLIP = 9;   // trailing portion of each buffer
    const MAX_CLIPS = 5;

    const sys = {
        buffer: [],          // { t, p:Vector3, q:Quaternion }
        highlights: [],      // { label, priority, t, samples: [...] }
        active: false,
        _lastSample: 0,
        _clip: null,
        _clipIndex: 0,
        _clipStartMs: 0,
        _ui: null,
    };

    function _sample() {
        if (typeof camera === 'undefined' || typeof gameState === 'undefined') return;
        if (!gameState.gameStarted || gameState.gameOver || sys.active) return;
        const now = performance.now();
        if (now - sys._lastSample < 1000 / SAMPLE_HZ) return;
        sys._lastSample = now;
        sys.buffer.push({ t: now, p: camera.position.clone(), q: camera.quaternion.clone() });
        if (sys.buffer.length > MAX_SAMPLES) sys.buffer.shift();
    }

    // Snapshot the rolling buffer as a highlight. Higher priority wins when
    // the list is full. Dedup: ignore highlights within 4s of the previous.
    sys.record = function (label, priority) {
        if (sys.active || sys.buffer.length < SAMPLE_HZ * 3) return;
        const last = sys.highlights[sys.highlights.length - 1];
        if (last && performance.now() - last.t < 4000) {
            if ((priority || 1) > last.priority) { last.label = label; last.priority = priority || 1; }
            return;
        }
        sys.highlights.push({
            label: label || 'Highlight',
            priority: priority || 1,
            t: performance.now(),
            samples: sys.buffer.map(s => ({ t: s.t, p: s.p.clone(), q: s.q.clone() })),
        });
        if (sys.highlights.length > MAX_HIGHLIGHTS) {
            // drop the lowest-priority, oldest first
            let worst = 0;
            for (let i = 1; i < sys.highlights.length; i++) {
                if (sys.highlights[i].priority < sys.highlights[worst].priority) worst = i;
            }
            sys.highlights.splice(worst, 1);
        }
    };

    function _ensureUI() {
        if (sys._ui) return sys._ui;
        const wrap = document.createElement('div');
        wrap.id = 'victoryReplayUI';
        wrap.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:10050;display:none;';
        wrap.innerHTML =
            '<div style="position:absolute;top:0;left:0;right:0;height:11%;background:#000"></div>' +
            '<div style="position:absolute;bottom:0;left:0;right:0;height:11%;background:#000"></div>' +
            '<div id="vrLabel" style="position:absolute;bottom:12.5%;left:50%;transform:translateX(-50%);' +
            'font-family:Orbitron,monospace;font-size:1.05rem;letter-spacing:3px;color:#ffe066;' +
            'text-shadow:0 0 12px rgba(255,200,40,0.9)"></div>' +
            '<div style="position:absolute;top:12.5%;left:50%;transform:translateX(-50%);' +
            'font-family:Orbitron,monospace;font-size:0.8rem;letter-spacing:4px;color:#7fdcff;' +
            'text-shadow:0 0 8px rgba(0,180,255,0.8)">MISSION REPLAY · ESC TO SKIP</div>';
        document.body.appendChild(wrap);
        sys._ui = wrap;
        return wrap;
    }

    sys.start = function () {
        if (sys.active) return;
        // Best clips: sort by priority desc then recency, keep MAX_CLIPS in
        // chronological order so the montage reads as a story.
        const picked = sys.highlights.slice()
            .sort((a, b) => (b.priority - a.priority) || (b.t - a.t))
            .slice(0, MAX_CLIPS)
            .sort((a, b) => a.t - b.t);
        if (!picked.length) { sys.finish(); return; }
        sys._clips = picked;
        sys._clipIndex = -1;
        sys.active = true;
        _ensureUI().style.display = 'block';
        _nextClip();
    };

    function _nextClip() {
        sys._clipIndex++;
        if (sys._clipIndex >= sys._clips.length) { sys.finish(); return; }
        sys._clip = sys._clips[sys._clipIndex];
        sys._clipStartMs = performance.now();
        const lbl = document.getElementById('vrLabel');
        if (lbl) lbl.textContent = sys._clip.label.toUpperCase() +
            '   ·   ' + (sys._clipIndex + 1) + ' / ' + sys._clips.length;
    }

    // Called from animate() while active — owns the camera + ship for the
    // frame. Returns true so animate renders and skips game updates.
    const _vrTmp = { look: null, off: null };
    sys.tick = function () {
        if (!sys.active || typeof camera === 'undefined') return false;
        if (!_vrTmp.look) { _vrTmp.look = new THREE.Vector3(); _vrTmp.off = new THREE.Vector3(); }
        const clip = sys._clip;
        const samples = clip.samples;
        const clipLen = Math.min(REPLAY_SECONDS_PER_CLIP * 1000,
            samples[samples.length - 1].t - samples[0].t);
        const t0 = samples[samples.length - 1].t - clipLen;
        const elapsed = performance.now() - sys._clipStartMs;
        if (elapsed >= clipLen) { _nextClip(); return true; }
        const target = t0 + elapsed;
        // find bracketing samples (linear scan is fine at 130 samples)
        let i = 0;
        while (i < samples.length - 2 && samples[i + 1].t < target) i++;
        const a = samples[i], b = samples[i + 1];
        const f = Math.max(0, Math.min(1, (target - a.t) / Math.max(1, b.t - a.t)));

        const ship = window.cameraState && window.cameraState.playerShipMesh;
        if (ship) {
            ship.visible = true;
            ship.position.copy(a.p).lerp(b.p, f);
            ship.quaternion.copy(a.q).slerp(b.q, f);
        }
        // SPECTATOR CAMERA: anchored near the clip's midpoint path, offset
        // to the side and slowly orbiting, always looking at the ship — the
        // outside vantage the live game never shows.
        const mid = samples[Math.floor(samples.length / 2)].p;
        const ang = (elapsed / clipLen) * Math.PI * 0.5 + sys._clipIndex; // slow quarter-orbit per clip
        _vrTmp.off.set(Math.cos(ang) * 90, 34, Math.sin(ang) * 90);
        camera.position.copy(mid).add(_vrTmp.off);
        _vrTmp.look.copy(ship ? ship.position : mid);
        camera.lookAt(_vrTmp.look);
        return true;
    };

    sys.finish = function () {
        sys.active = false;
        if (sys._ui) sys._ui.style.display = 'none';
        if (typeof showAchievement === 'function') {
            showAchievement('UNIVERSE LIBERATED',
                'Every galaxy is free. Thank you for your service, Captain.', true);
        }
        if (typeof showMissionCommandAlert === 'function') {
            showMissionCommandAlert('Mission Control',
                'That is the whole campaign, Captain — every core liberated. Fly free; the deep-space anomalies (and the Borg) are still out there if you want them.',
                true);
        }
    };

    sys.update = _sample;

    // ESC skips the replay
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sys.active) sys.finish();
    });

    // Floating-origin rebase: recorded positions are current-frame coords —
    // shift the whole buffer + every highlight so replays stay valid.
    if (typeof window !== 'undefined') {
        window.__worldShiftHandlers = window.__worldShiftHandlers || [];
        window.__worldShiftHandlers.push(function (offset) {
            sys.buffer.forEach(s => s.p.sub(offset));
            sys.highlights.forEach(h => h.samples.forEach(s => s.p.sub(offset)));
        });
        window.replaySystem = sys;
    }
})();
