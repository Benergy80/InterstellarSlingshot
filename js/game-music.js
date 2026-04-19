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
    return st.volume * (TRACK_VOLUME[key] || 1.0);
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

    // Reset the new track
    next.volume = 0;
    next.currentTime = 0;
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
        prev.currentTime = 0;
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
        el.currentTime = 0;
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

    // 1) Launch screen (game not started)
    if (typeof gameState === 'undefined' || !gameState.gameStarted) {
      play('launchScreen');
      return;
    }

    // 1b) Let the launch-screen track finish naturally before switching.
    if (st.current === 'launchScreen' && st.currentEl) {
      const el = st.currentEl;
      const remaining = el.duration - el.currentTime;
      if (remaining > FADE_DURATION && !el.paused && !el.ended) {
        return;
      }
    }

    // 2) Intro sequence running
    if (typeof introSequence !== 'undefined' && introSequence.active &&
        introSequence.phase !== 'complete') {
      play('intro');
      return;
    }

    // 2b) Let the intro track finish naturally before switching.
    // The intro sequence can end (active=false) well before the MP3 is
    // done.  If the intro audio is still playing, don't cut it — wait
    // until the last few seconds, then let the next context-detection
    // tick crossfade into the galaxy track.
    if (st.current === 'intro' && st.currentEl) {
      const el = st.currentEl;
      const remaining = el.duration - el.currentTime;
      if (remaining > FADE_DURATION && !el.paused && !el.ended) {
        return;  // intro still playing — hold off
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

    // 8) Far outer space (beyond galaxy perimeters or near Sagittarius A*)
    if (gId === 8 || gId < 0) {
      const farKey = 'farOuter' + (1 + Math.abs((typeof gameState !== 'undefined'
        ? (gameState.frameCount || 0) : 0) % 3));
      // Only switch far-outer track if we weren't already playing one
      if (st.current !== 'farOuter1' && st.current !== 'farOuter2' &&
          st.current !== 'farOuter3') {
        play(farKey);
      }
      return;
    }

    // 9) Default — main theme
    play('mainTheme');
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function detectGalaxy() {
    if (typeof getCurrentGalaxyId === 'function') {
      return getCurrentGalaxyId();
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

  // ─── Launch-screen autoplay ───────────────────────────────────────────────
  // The game loop (which drives updateMusicContext) doesn't start until the
  // intro sequence begins, so launch-screen music won't trigger through the
  // normal context-detection path.  Browsers also block <audio>.play() until
  // the user has interacted with the page.  Solution: preload immediately,
  // then start the launch-screen track on the first user interaction (click,
  // key press, touch) anywhere on the page.
  function armLaunchScreen() {
    preload();

    let fired = false;
    const trigger = () => {
      if (fired) return;
      fired = true;
      // Only auto-start if the game hasn't started yet AND nothing else is
      // already playing.  After the intro kicks off, updateMusicContext
      // takes over and cross-fades to the right track.
      const gameNotStarted =
        typeof gameState === 'undefined' || !gameState.gameStarted;
      if (gameNotStarted && !st.current) {
        play('launchScreen');
      }
      document.removeEventListener('pointerdown', trigger, true);
      document.removeEventListener('keydown', trigger, true);
      document.removeEventListener('touchstart', trigger, true);
    };

    // Capture-phase so we catch the interaction even if the click handler
    // on a button calls stopPropagation/preventDefault.
    document.addEventListener('pointerdown', trigger, true);
    document.addEventListener('keydown', trigger, true);
    document.addEventListener('touchstart', trigger, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', armLaunchScreen, { once: true });
  } else {
    armLaunchScreen();
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  window.soundtrack = {
    preload:       preload,
    update:        updateMusicContext,
    forceTrack:    forceTrack,
    setMuted:      setMuted,
    setVolume:     setVolume,
    stopAll:       stopAll,
    fadeOutCurrent: fadeOutCurrent,
    get current()  { return st.current; },
    get enabled()  { return st.enabled; },
    set enabled(v) { st.enabled = !!v; if (!v) stopAll(); },
  };
})();
