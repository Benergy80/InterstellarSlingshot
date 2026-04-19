// =============================================================================
// SOUNDTRACK SYSTEM — MP3-based location-aware music with crossfading
// =============================================================================
// Replaces the procedural oscillator music with pre-produced MP3 tracks.
// Each track is mapped to a game context (galaxy, nebula, boss, etc.) and
// crossfades smoothly as the player moves through the universe.
//
// Track mapping (audio/soundtrack/):
//   Launch Screen.mp3       — title/launch screen
//   Intro.mp3               — intro cinematic sequence
//   Main Outer Space Theme.mp3 — default ambient (interstellar travel)
//   Galaxy 1.mp3–Galaxy8.mp3 — per-galaxy themes (galaxies 0–7)
//   nebula1.mp3–nebula5.mp3 — nebula proximity
//   Boss Fight.mp3          — boss encounters
//   Elite Guardians.mp3     — elite guardian encounters
//   Borg.mp3                — Borg encounters
//   Far Outer Galaxy1–3.mp3 — far outer space / Sagittarius A* area
// =============================================================================

(function () {
  'use strict';

  const FADE_DURATION = 2.0;   // seconds for crossfade
  const BASE_PATH = 'audio/soundtrack/';

  // Dynamic-volume ducking: when no enemies are actively engaging, music
  // sits a bit quieter so the world reads calmer.  When a hostile is
  // within COMBAT_VOLUME_RADIUS of the camera, volume rises back to the
  // base level within DUCK_FADE_DURATION seconds.
  const COMBAT_VOLUME_RADIUS = 1500;
  const CALM_VOLUME_SCALE = 0.6;     // 60% of base when no combat
  const DUCK_FADE_DURATION = 1.5;    // seconds

  // Per-track volume multipliers (relative to st.volume).
  // Tracks not listed here default to 1.0.
  const TRACK_VOLUME = {
    launchScreen: 0.5,   // quieter on the title screen
  };

  // Track registry — keys are logical names, values are file paths.
  const TRACKS = {
    launchScreen:    'Launch Screen.mp3',
    intro:           'Intro.mp3',
    mainTheme:       'Main Outer Space Theme.mp3',
    galaxy0:         'Galaxy 1.mp3',
    galaxy1:         'Galaxy2.mp3',
    galaxy2:         'Galaxy3.mp3',
    galaxy3:         'Galaxy4.mp3',
    galaxy4:         'Galaxy5.mp3',
    galaxy5:         'Galaxy6.mp3',
    galaxy6:         'Galaxy7.mp3',
    galaxy7:         'Galaxy8.mp3',
    nebula1:         'nebula1.mp3',
    nebula2:         'nebula2.mp3',
    nebula3:         'nebula3.mp3',
    nebula4:         'nebula4.mp3',
    nebula5:         'nebula5.mp3',
    bossFight:       'Boss Fight.mp3',
    eliteGuardians:  'Elite Guardians.mp3',
    borg:            'Borg.mp3',
    farOuter1:       'Far Outer Galaxy1.mp3',
    farOuter2:       'Far Outer Galaxy2.mp3',
    farOuter3:       'Far Outer Galaxy3.mp3',
  };

  // ─── State ────────────────────────────────────────────────────────────────
  const st = {
    enabled: true,
    volume: 0.25,
    loaded: {},           // { trackKey: HTMLAudioElement }
    loadErrors: new Set(),
    current: null,        // key of currently playing/fading-in track
    currentEl: null,      // HTMLAudioElement currently playing
    fadingOut: null,      // HTMLAudioElement fading out (crossfade)
    fadeTimer: null,
    context: 'none',      // logical context: 'launchScreen', 'intro', 'galaxy', etc.
    lastGalaxyId: -1,
    lastNebulaIdx: -1,
    muted: false,
    suppressIntro: false, // true when demo mode is active — skip Intro.mp3
    volumeScale: CALM_VOLUME_SCALE,  // current ducking multiplier (0..1)
    volumeScaleTimer: null,
  };

  // ─── Preload ──────────────────────────────────────────────────────────────
  // Tracks that should play once, not loop.  When they finish naturally,
  // the next context-detection tick picks whatever track is appropriate.
  const NO_LOOP = new Set(['launchScreen', 'intro']);

  function preload() {
    const keys = Object.keys(TRACKS);
    let loadedCount = 0;
    keys.forEach(key => {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.loop = !NO_LOOP.has(key);
      audio.volume = 0;
      audio.src = BASE_PATH + encodeURIComponent(TRACKS[key]);
      audio.addEventListener('canplaythrough', () => {
        loadedCount++;
        if (loadedCount === keys.length) {
          console.log('🎵 Soundtrack: all ' + keys.length + ' tracks preloaded');
        }
      }, { once: true });
      audio.addEventListener('error', () => {
        st.loadErrors.add(key);
      });
      st.loaded[key] = audio;
    });
    console.log('🎵 Soundtrack: preloading ' + keys.length + ' tracks…');
  }

  // ─── Play / Crossfade ─────────────────────────────────────────────────────
  function trackVolume(key) {
    return st.volume * (TRACK_VOLUME[key] || 1.0) * st.volumeScale;
  }

  // Ramp the global volumeScale toward a target.  Applied continuously
  // to the currently playing track so we don't fight with crossfades.
  function setVolumeScale(target) {
    target = Math.max(0, Math.min(1, target));
    if (Math.abs(target - st.volumeScale) < 0.01) return;
    if (st.volumeScaleTimer) { clearInterval(st.volumeScaleTimer); st.volumeScaleTimer = null; }

    const steps = 30;
    const interval = (DUCK_FADE_DURATION * 1000) / steps;
    const start = st.volumeScale;
    let step = 0;
    st.volumeScaleTimer = setInterval(() => {
      step++;
      const t = step / steps;
      st.volumeScale = start + (target - start) * t;
      // Apply to the currently playing track only — crossfades manage
      // their own ramps, and we don't want to override those.
      if (st.currentEl && !st.fadeTimer && st.current) {
        st.currentEl.volume = trackVolume(st.current);
      }
      if (step >= steps) {
        clearInterval(st.volumeScaleTimer);
        st.volumeScaleTimer = null;
        st.volumeScale = target;
      }
    }, interval);
  }

  function updateDuckingForCombat() {
    // Any live enemy within COMBAT_VOLUME_RADIUS of the camera counts as
    // active engagement.  Also count the targeted enemy if it's within
    // weapons range, so the swell lines up with actual combat moments.
    let engaged = false;
    if (typeof enemies !== 'undefined' && typeof camera !== 'undefined') {
      const cp = camera.position;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || !e.userData || e.userData.health <= 0) continue;
        if (cp.distanceTo(e.position) < COMBAT_VOLUME_RADIUS) { engaged = true; break; }
      }
    }
    setVolumeScale(engaged ? 1.0 : CALM_VOLUME_SCALE);
  }

  function play(key) {
    if (!st.enabled || st.muted) return;
    if (key === st.current) return;
    if (st.loadErrors.has(key)) return;

    const next = st.loaded[key];
    if (!next) return;

    // Abort any in-progress fade
    if (st.fadeTimer) { clearInterval(st.fadeTimer); st.fadeTimer = null; }

    const prev = st.currentEl;
    const prevKey = st.current;

    st.current = key;
    st.currentEl = next;

    // Resume where the track left off for looping context tracks (galaxy,
    // nebula, main theme).  Only reset to the beginning for one-shot
    // tracks (intro, launchScreen) or if the track has ended.
    next.volume = 0;
    if (NO_LOOP.has(key) || next.ended) {
      next.currentTime = 0;
    }
    const playPromise = next.play();
    if (playPromise) playPromise.catch(() => {});

    if (!prev) {
      fadeIn(next, key);
      return;
    }

    // Crossfade: fade out old + fade in new simultaneously
    const steps = 30;
    const interval = (FADE_DURATION * 1000) / steps;
    let step = 0;
    const startVol = prev.volume;
    const targetVol = trackVolume(key);

    st.fadingOut = prev;

    st.fadeTimer = setInterval(() => {
      step++;
      const t = step / steps;
      prev.volume = Math.max(0, startVol * (1 - t));
      next.volume = Math.min(targetVol, targetVol * t);

      if (step >= steps) {
        clearInterval(st.fadeTimer);
        st.fadeTimer = null;
        prev.pause();
        prev.volume = 0;
        // Don't reset currentTime — track resumes where it left off
        // when the player returns to that context.
        st.fadingOut = null;
      }
    }, interval);
  }

  function fadeIn(el, key) {
    const steps = 20;
    const interval = (FADE_DURATION * 1000) / steps;
    let step = 0;
    const target = trackVolume(key || st.current);
    const timer = setInterval(() => {
      step++;
      el.volume = Math.min(target, target * (step / steps));
      if (step >= steps) clearInterval(timer);
    }, interval);
  }

  function fadeOutCurrent() {
    const el = st.currentEl;
    if (!el) return;
    const steps = 20;
    const interval = (FADE_DURATION * 1000) / steps;
    let step = 0;
    const startVol = el.volume;
    st.current = null;
    st.currentEl = null;
    const timer = setInterval(() => {
      step++;
      el.volume = Math.max(0, startVol * (1 - step / steps));
      if (step >= steps) {
        clearInterval(timer);
        el.pause();
      }
    }, interval);
  }

  function stopAll() {
    if (st.fadeTimer) { clearInterval(st.fadeTimer); st.fadeTimer = null; }
    Object.values(st.loaded).forEach(a => {
      a.pause();
      a.volume = 0;
      a.currentTime = 0;
    });
    st.current = null;
    st.currentEl = null;
    st.fadingOut = null;
  }

  // ─── Context detection ────────────────────────────────────────────────────
  // Called every ~500ms from the game loop to pick the right track based on
  // the player's current location and game state.
  function updateMusicContext() {
    if (!st.enabled || st.muted) return;

    // Dynamic ducking — swell during combat, soften in calm.
    updateDuckingForCombat();

    // 1) Launch screen (game not started)
    if (typeof gameState === 'undefined' || !gameState.gameStarted) {
      play('launchScreen');
      return;
    }

    // 2) Intro sequence — Intro.mp3 is deliberately NOT played during the
    //    intro cinematic.  The cinematic is short and has its own audio
    //    feel; skipping it avoids an awkward start-cut-off-restart when
    //    the player lands in their galaxy a moment later.  Intro.mp3 is
    //    still available via the Skip button rotation.

    // 2b) Legacy: let any leftover intro audio finish naturally.
    if (st.current === 'intro' && st.currentEl) {
      const el = st.currentEl;
      const remaining = el.duration - el.currentTime;
      if (remaining > FADE_DURATION && !el.paused && !el.ended) {
        return;
      }
    }

    // 3) Borg encounter
    if (typeof gameState !== 'undefined' && gameState.currentTarget) {
      const tgt = gameState.currentTarget;
      if (tgt.userData && (tgt.userData.isBorgCube || tgt.userData.isBorg)) {
        const d = typeof camera !== 'undefined'
          ? camera.position.distanceTo(tgt.position) : Infinity;
        if (d < 5000) {
          play('borg');
          return;
        }
      }
    }

    // 4) Boss fight
    if (typeof musicSystem !== 'undefined' && musicSystem.inBattle) {
      play('bossFight');
      return;
    }

    // 5) Elite guardians — check if we're fighting a black hole guardian
    if (typeof gameState !== 'undefined' && gameState.targetLock &&
        gameState.targetLock.active && gameState.targetLock.target) {
      const tgt = gameState.targetLock.target;
      if (tgt.userData && tgt.userData.isBlackHoleGuardian) {
        play('eliteGuardians');
        return;
      }
    }

    // 6) Nebula proximity — pick a nebula track based on index
    const nebulaIdx = detectNearbyNebula();
    if (nebulaIdx >= 0) {
      const nebulaKey = 'nebula' + (1 + (nebulaIdx % 5));
      play(nebulaKey);
      st.lastNebulaIdx = nebulaIdx;
      return;
    }

    // 7) Galaxy-specific music
    const gId = detectGalaxy();
    if (gId >= 0 && gId <= 7) {
      play('galaxy' + gId);
      st.lastGalaxyId = gId;
      return;
    }

    // 8) Sagittarius A* area — rotate through Far Outer Galaxy tracks
    if (gId === 8) {
      if (st.current !== 'farOuter1' && st.current !== 'farOuter2' &&
          st.current !== 'farOuter3') {
        const farKey = 'farOuter' + (1 + Math.abs((typeof gameState !== 'undefined'
          ? (gameState.frameCount || 0) : 0) % 3));
        play(farKey);
      }
      return;
    }

    // 9) Interstellar space — not inside any galaxy's 20,000u perimeter
    play('mainTheme');
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  // Music-specific galaxy detection: only switch to a galaxy's theme when
  // the player is within 4,000 units of its galactic core (the large
  // accretion disc's outer diameter is ~5,600–5,800u, so 4,000u keeps the
  // theme active while you're inside the visible galaxy halo but not yet
  // at the core).  This is intentionally tighter than the UI's 20,000u
  // detection so the music only kicks in when the player is clearly
  // "inside" the galaxy, not just vaguely near it.
  const GALAXY_MUSIC_RADIUS = 4000;

  function detectGalaxy() {
    if (typeof camera === 'undefined' || typeof planets === 'undefined') return -1;

    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      if (!p || !p.userData) continue;
      if (p.userData.type !== 'blackhole') continue;
      if (p.userData.isGalacticCore !== true) continue;
      if (typeof p.userData.galaxyId !== 'number') continue;

      const d = camera.position.distanceTo(p.position);
      if (d < GALAXY_MUSIC_RADIUS) {
        return p.userData.galaxyId;
      }
    }
    // Fall back to the UI detector so Sagittarius A* (galaxy 8) still
    // registers — its "galaxy" isn't a normal galactic-core black hole.
    if (typeof getCurrentGalaxyId === 'function') {
      const g = getCurrentGalaxyId();
      if (g === 8) return 8;
    }
    return -1;
  }

  function detectNearbyNebula() {
    if (typeof nebulaClouds === 'undefined' || typeof camera === 'undefined') return -1;
    for (let i = 0; i < nebulaClouds.length; i++) {
      const n = nebulaClouds[i];
      if (!n || !n.position) continue;
      const d = camera.position.distanceTo(n.position);
      if (d < 3000) return i;
    }
    return -1;
  }

  // ─── Integration hooks ────────────────────────────────────────────────────
  // Called from the existing toggleMusic to sync mute state.
  function setMuted(muted) {
    st.muted = muted;
    if (muted) {
      stopAll();
    }
  }

  function setVolume(v) {
    st.volume = Math.max(0, Math.min(1, v));
    if (st.currentEl) st.currentEl.volume = st.volume;
  }

  // Force a specific context (e.g. autopilot forcing boss music)
  function forceTrack(key) {
    if (TRACKS[key]) play(key);
  }

  // Skip the current track → fade in a random different track.
  function skipCurrentTrack() {
    const keys = Object.keys(TRACKS).filter(k => k !== st.current);
    if (!keys.length) return;
    const next = keys[Math.floor(Math.random() * keys.length)];
    play(next);
  }

  // Suppress Intro.mp3 (used by demo mode — jump straight to gameplay music).
  function setSuppressIntro(v) {
    st.suppressIntro = !!v;
    if (v && st.current === 'intro') {
      // Already playing the intro — crossfade to whatever the context
      // wants right now instead.
      stopAll();
      updateMusicContext();
    }
  }

  // ─── Preload on load ──────────────────────────────────────────────────────
  // Just preload tracks so they're ready to play.  We no longer auto-start
  // any track on touch/pointer/key events — the user now explicitly starts
  // music by clicking a button (Start game, Demo, Music, Skip).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', preload, { once: true });
  } else {
    preload();
  }

  // Launch-screen music now starts when the user clicks the Start or Demo
  // button (those handlers call soundtrack.forceTrack or rely on the
  // context-detection loop).  Expose a helper for the Start button path.
  function startLaunchScreen() {
    const gameNotStarted =
      typeof gameState === 'undefined' || !gameState.gameStarted;
    if (gameNotStarted && !st.current) {
      play('launchScreen');
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  window.soundtrack = {
    preload:           preload,
    update:            updateMusicContext,
    forceTrack:        forceTrack,
    skip:              skipCurrentTrack,
    setMuted:          setMuted,
    setVolume:         setVolume,
    setSuppressIntro:  setSuppressIntro,
    stopAll:           stopAll,
    fadeOutCurrent:    fadeOutCurrent,
    startLaunchScreen: startLaunchScreen,
    get current()      { return st.current; },
    get enabled()      { return st.enabled; },
    set enabled(v)     { st.enabled = !!v; if (!v) stopAll(); },
    get muted()        { return st.muted; },
  };

  // ─── Button event delegation ──────────────────────────────────────────────
  document.addEventListener('click', function handleSoundtrackButtons(e) {
    const t = e.target;
    if (!t || !t.closest) return;

    const musicBtn = t.closest('#muteBtn, #mobileMusicBtn');
    if (musicBtn) {
      e.preventDefault();
      e.stopPropagation();
      // Toggle the synth music system (icon updates happen inside)
      try {
        if (typeof window.resumeAudioContext === 'function') window.resumeAudioContext();
        if (typeof window.toggleMusic === 'function') window.toggleMusic();
      } catch (err) { console.warn('toggleMusic error:', err); }
      // Also toggle the MP3 soundtrack directly — don't rely on
      // toggleMusic's internal call because scoping issues may
      // prevent it from reaching window.soundtrack.
      st.muted = !st.muted;
      if (st.muted) {
        stopAll();
      }
      return;
    }

    const skipBtn = t.closest('#skipTrackBtn, #mobileSkipTrackBtn');
    if (skipBtn) {
      e.preventDefault();
      e.stopPropagation();
      try {
        if (typeof window.resumeAudioContext === 'function') window.resumeAudioContext();
      } catch (err) { /* ignore */ }
      skipCurrentTrack();
      return;
    }

    const pauseBtn = t.closest('#pauseBtn');
    if (pauseBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.togglePause === 'function') window.togglePause();
      return;
    }
  }, true);   // capture phase — beats any later listener that stops propagation
})();
