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
  const CALM_VOLUME_SCALE = 0.85;    // 85% of base when no combat (was 0.6)
  const DUCK_FADE_DURATION = 1.5;    // seconds

  // ═══════════════════════════════════════════════════════════════════════════
  // ADAPTIVE MIX — the layer that turns "a playlist" into "a score"
  // ═══════════════════════════════════════════════════════════════════════════
  // Four systems ride on top of the location-based track picker:
  //   1. COMBAT STATE MACHINE — proximity-driven crossfade into a battle
  //      track, with entry/exit hysteresis + a minimum hold so it can never
  //      thrash between ambient and battle while you strafe past a picket.
  //   2. STINGERS — short musical hits (discovery, boss spawn, mission
  //      complete, galaxy liberation) cut from the strongest onsets in the
  //      existing tracks, played on their own <audio> elements with real
  //      attack/hold/release envelopes and a sidechain duck on the bed.
  //   3. WARP RISER — a continuous gain+filter automation driven by the
  //      published whip/tunnel curves: bloom into the slingshot, pinch at
  //      periapsis slow-mo, muffle inside the tunnel, release on the exit.
  //   4. SPATIALIZATION — distance attenuation + stereo pan for every
  //      one-shot this module owns, plus helpers other systems can borrow.
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 1. Combat state machine ──────────────────────────────────────────────
  const COMBAT_ENGAGE_RADIUS  = 2500;   // hostiles this close = "engaged"
  const COMBAT_RELEASE_RADIUS = 3400;   // must ALL be beyond this to disengage
  const COMBAT_ENTER_DELAY    = 1100;   // ms of sustained contact before switching
  const COMBAT_EXIT_DELAY     = 5000;   // ms of clear space before falling back
  const COMBAT_MIN_HOLD       = 18000;  // ms minimum time on the battle track
  const COMBAT_REARM          = 4000;   // ms after leaving before combat re-arms
  const DAMAGE_ENGAGE_WINDOW  = 5000;   // ms — taking hull damage counts as combat
  const FIRING_ENGAGE_WINDOW  = 6000;   // ms since an enemy last pulled a trigger
  const COMBAT_LAUNCH_GRACE   = 12000;  // ms — the launch beat belongs to home

  // ─── 2. Stingers ──────────────────────────────────────────────────────────
  // Every stinger is a slice of a track we already ship, chosen by measuring
  // short-window RMS across the first 14 s of every MP3 and locking onto the
  // largest transient (silence → hit).  `at` is the measured onset in
  // seconds; starting even 200 ms late makes a stinger read as sloppy, so
  // these are tuned to the transient, not to a round number.
  // `hold` = how long the beat stays musically valid if the hit cannot fire
  // the instant it is asked for (slice still buffering, spacing gate closed).
  // A discovery bell still reads right a beat late; a warp-exit swell does
  // not, because the thing it is scoring is already over.
  const STINGER_LEVEL = 0.80;           // stingers relative to the music slider
  const STINGERS = {
    // 41 dB jump out of near-silence — the biggest fanfare in the library.
    liberation:      { file: 'Galaxy8.mp3',          at: 10.12, dur: 3.10, gain: 1.00, atk: 0.02, rel: 0.85, cool: 8000,  hold: 3000 },
    // Bright bell that rings out and decays to nothing — pure "you found it".
    discovery:       { file: 'Galaxy 1.mp3',         at: 0.08,  dur: 2.20, gain: 0.78, atk: 0.02, rel: 0.65, cool: 6000,  hold: 3500 },
    // Heroic sustained lift — reads as resolution, not as a new threat.
    missionComplete: { file: 'Elite Guardians.mp3',  at: 8.32,  dur: 2.60, gain: 0.90, atk: 0.02, rel: 0.70, cool: 6000,  hold: 2500 },
    // 24 dB stab out of silence, menacing pulse — deliberately NOT cut from
    // Boss Fight.mp3 so it doesn't smear into the boss track crossfading in.
    bossSpawn:       { file: 'Beware the Borg2.mp3', at: 7.22,  dur: 2.55, gain: 0.95, atk: 0.02, rel: 0.60, cool: 9000,  hold: 1800 },
    // Low driving hit for heavyweight contact (Borg / elite arrival).
    threat:          { file: 'Boss Fight.mp3',       at: 9.02,  dur: 2.00, gain: 0.82, atk: 0.03, rel: 0.55, cool: 15000, hold: 1000 },
    // Slow swell out of silence — the arrival breath on the far side of a
    // warp.  noDuck: this one IS the bloom, so it must not fight the bed it
    // is lifting; ducking here would flatten the exact moment of arrival.
    warpExit:        { file: 'nebula5.mp3',          at: 4.05,  dur: 2.40, gain: 0.58, atk: 0.05, rel: 0.80, cool: 6000,  hold: 900, noDuck: true },
  };
  const STINGER_SPACING = 900;          // ms minimum gap between ANY two hits
  const STINGER_DUCK    = 0.30;         // sidechain: bed drops 30% under a hit
  // How long a discovery keeps re-offering its bell to the mix if the hit
  // could not be delivered.  Past this the moment has gone and we stop.
  const DISCOVERY_HIT_WINDOW = 10000;

  // ─── 3. Warp riser / filter automation ────────────────────────────────────
  const FILTER_OPEN_HZ  = 20000;        // "no filter" resting position
  const FX_TAU_UP       = 0.10;         // s — fast to grab (ducks bite instantly)
  const FX_TAU_DOWN     = 0.32;         // s — slow to release (blooms breathe)

  // ─── 4. Spatialization ────────────────────────────────────────────────────
  const SPATIAL_NEAR = 600;             // full volume inside this radius
  const SPATIAL_REF  = 1800;            // half-ish volume around here
  const SPATIAL_MIN  = 0.10;            // never fully silent — it's still music
  const SPATIAL_PAN  = 0.80;            // max stereo offset (keep it musical)

  // Per-track volume multipliers (relative to st.volume).
  // Tracks not listed here default to 1.0.
  const TRACK_VOLUME = {
    launchScreen: 1.0,
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
    bewareBorg1:     'Beware the Borg.mp3',
    bewareBorg2:     'Beware the Borg2.mp3',
    farOuter1:       'Far Outer Galaxy1.mp3',
    farOuter2:       'Far Outer Galaxy2.mp3',
    farOuter3:       'Far Outer Galaxy3.mp3',
    gameOver1:       'GAMEOVER1.mp3',
    gameOver2:       'GAMEOVER2.mp3',
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
    fadingOutKey: null,   // its track key — so the duck can trim it while a
                          // switch is still waiting on the incoming track
    fadeTimer: null,      // the ONE interval allowed to write element volume
    fadePending: null,    // true = a switch is committed but not ramping yet
    context: 'none',      // logical context: 'launchScreen', 'intro', 'galaxy', etc.
    lastGalaxyId: -1,
    lastNebulaIdx: -1,
    muted: false,
    suppressIntro: false, // true when demo mode is active — skip Intro.mp3
    volumeScale: CALM_VOLUME_SCALE,  // current ducking multiplier (0..1)
    volumeScaleTimer: null,
    skipLockUntil: 0,     // while > Date.now(), skip-selected track is preserved
    _preloaded: false,    // guard for one-time preload

    // ── adaptive-mix state ──────────────────────────────────────────────────
    // Combat state machine (see updateCombatState).
    combat: {
      active: false,      // true = battle track owns the context
      key: null,          // which battle track
      subKey: null,       // playHealthy()-resolved substitute actually played
      subKeyFor: null,    // which `key` subKey was resolved against (cache guard)
      rank: 0,            // 1 grunt · 2 guardian · 3 borg · 4 boss
      contactSince: 0,    // ms timestamp of first sustained contact
      clearSince: 0,      // ms timestamp of "nothing in range"
      enteredAt: 0,
      leftAt: 0,
    },
    // Live threat readout, refreshed by scanThreats().
    threat: { near: 0, nearest: Infinity, engagedNearest: Infinity, rank: 0, lead: null },
    lastHull: null,
    lastDamageAt: 0,
    startedAt: 0,

    // FX automation (warp riser + tunnel duck + stinger sidechain).
    fx: {
      gain: 1, gainT: 1,        // current / target bus gain multiplier
      lp: FILTER_OPEN_HZ,       // current lowpass cutoff
      lpT: FILTER_OPEN_HZ,      // target lowpass cutoff
      bloomUntil: 0,            // ms — warp-exit bloom window
      tunnelPeak: 0,            // highest tunnel level seen this transit
      duckUntil: 0,             // ms — stinger sidechain window
      lastPushedGain: -1,
      lastPushedLp: -1,
    },

    // Stinger bank.
    stingerEls: {},       // { key: HTMLAudioElement }
    stingerNext: {},      // { key: nextAllowedTimestamp }
    stingerBroken: {},    // { key: true } — file failed to load
    stingerGateUntil: 0,  // global spacing gate
    stingerTimers: {},    // { key: intervalId }
    stingerLastFired: {}, // { key: ms of the last hit that actually sounded }
    // Hits that could not fire the instant they were asked for (element
    // still buffering, 900 ms spacing gate, a pause) wait here instead of
    // being thrown away.  Retried every frame until they land or their
    // musical window closes.  See deferStinger()/flushStingers().
    stingerPending: [],   // [{ key, pos, deadline }]
    stingerWarmed: false, // true once the bank has been asked to buffer
    _warmTries: {},       // { key: nudge count } — drives the straggler escalation
    _warmSweeps: 0,
    _warmSweepTimer: null,

    // Event-edge trackers (poll-based, so no other file needs editing).
    seenBosses: null,     // Set of boss uuids already stingered
    lastMissionsDone: -1,
    lastGalaxiesCleared: -1,

    lastTick: 0,

    // Playback liveness (see updateLiveness()) — is the decoder actually
    // advancing, not just "does the envelope math say it should be"?
    liveness: {
      lastSampleAt: 0,
      lastCurrentTime: -1,
      lastKeyWatched: null,
      stuckSince: 0,       // ms timestamp currentTime was first seen frozen
      stalled: false,      // true once frozen past LIVENESS_STALL_MS
      recovering: false,   // a same-element play() retry is in flight
      confirmed: false,    // true once lastKeyWatched has advanced at least once
      // Ring of recently-confirmed-healthy tracks: [{key, at}, ...], oldest
      // first, capped at 4. See pushGoodKey()/pickFallbackKey() below for
      // why this replaced a single lastGoodKey scalar.
      goodKeys: [],
      // { key: ms of last confirmed liveness failure }. A track lands here
      // the moment the watchdog gives up on it (demoteKey()) and is only
      // cleared again once it demonstrably produces samples (pushGoodKey()).
      // See LIVENESS_FAILED_COOLDOWN_MS.
      failed: {},
    },
  };

  // ─── Web Audio bus ────────────────────────────────────────────────────────
  // The MP3 elements are routed through a shared lowpass + gain so the warp
  // riser can do REAL filter automation instead of just yanking volume.
  // This is strictly an upgrade path: if the shared AudioContext never comes
  // up (no gesture yet, or a browser that refuses createMediaElementSource)
  // the mix falls back to element-volume automation and nothing is lost.
  const wa = {
    ok: false,
    failed: false,
    ctx: null,
    bus: null,
    filter: null,
    sources: new WeakMap(),   // music elements
    stingerNodes: new WeakMap(),
  };

  function waEnsure() {
    if (wa.ok) return true;
    if (wa.failed) return false;
    // Piggyback on game-controls' AudioContext — one context, one clock.
    const ctx = (typeof audioContext !== 'undefined' && audioContext) ? audioContext : null;
    if (!ctx) return false;                 // not created yet — retry next tick
    if (ctx.state !== 'running') return false;
    // file:// makes media-element sources opaque; the graph would output
    // silence.  Better to stay on plain <audio> playback.
    if (typeof location !== 'undefined' && location.protocol === 'file:') {
      wa.failed = true;
      return false;
    }
    try {
      wa.filter = ctx.createBiquadFilter();
      wa.filter.type = 'lowpass';
      wa.filter.frequency.setValueAtTime(FILTER_OPEN_HZ, ctx.currentTime);
      wa.filter.Q.setValueAtTime(0.5, ctx.currentTime);
      wa.bus = ctx.createGain();
      wa.bus.gain.setValueAtTime(1, ctx.currentTime);
      wa.filter.connect(wa.bus);
      // Straight to the destination, NOT through masterGain/musicGain — the
      // MP3 score has always been mixed independently of the synth layer and
      // routing it into the synth bus would silently halve its level.
      wa.bus.connect(ctx.destination);
      wa.ctx = ctx;
      wa.ok = true;
      Object.keys(st.loaded).forEach(k => waRoute(st.loaded[k]));
      console.log('🎛️ Soundtrack: adaptive bus online (filter + riser automation)');
      return true;
    } catch (e) {
      wa.failed = true;
      wa.ok = false;
      return false;
    }
  }

  function waRoute(el) {
    if (!wa.ok || !el) return null;
    let node = wa.sources.get(el);
    if (node) return node;
    try {
      node = wa.ctx.createMediaElementSource(el);
      node.connect(wa.filter);
      wa.sources.set(el, node);
    } catch (e) {
      node = null;
    }
    return node;
  }

  // Stingers get their own chain (gain + stereo pan) so a spatialized hit
  // can arrive from the side without dragging the music bed with it.
  function waRouteStinger(el) {
    if (!wa.ok || !el) return null;
    let chain = wa.stingerNodes.get(el);
    if (chain) return chain;
    try {
      const src = wa.ctx.createMediaElementSource(el);
      const gain = wa.ctx.createGain();
      gain.gain.setValueAtTime(1, wa.ctx.currentTime);
      let pan = null;
      if (typeof wa.ctx.createStereoPanner === 'function') {
        pan = wa.ctx.createStereoPanner();
        src.connect(pan); pan.connect(gain);
      } else {
        src.connect(gain);
      }
      gain.connect(wa.ctx.destination);
      chain = { src: src, gain: gain, pan: pan };
      wa.stingerNodes.set(el, chain);
    } catch (e) {
      chain = null;
    }
    return chain;
  }

  // GAME-OVER / SUSPEND WATCHDOG.  Once the elements are routed through the
  // AudioContext their sound dies with it — and showGameOver() suspends the
  // context immediately after asking us to play the game-over track.  If the
  // score is supposed to be audible and the game is not paused, wake it.
  function waWatchdog() {
    if (!wa.ok || !wa.ctx) return;
    if (wa.ctx.state !== 'suspended') return;
    if (typeof gameState !== 'undefined' && gameState && gameState.paused) return;
    if (!st.currentEl || st.currentEl.paused) return;
    try { wa.ctx.resume(); } catch (e) { /* ignore */ }
  }

  // ─── Preload ──────────────────────────────────────────────────────────────
  // Tracks that should play once, not loop.  When they finish naturally,
  // the next context-detection tick picks whatever track is appropriate.
  const NO_LOOP = new Set(['launchScreen', 'intro', 'gameOver1', 'gameOver2']);

  function preload() {
    // Idempotent — do not re-create Audio elements on repeat calls.
    // initAudio() has 5+ call sites and each re-preload would orphan
    // the currently-playing <audio>, making stopAll() ineffective
    // because the orphaned element is no longer in st.loaded.
    if (st._preloaded) return;
    st._preloaded = true;

    const keys = Object.keys(TRACKS);
    keys.forEach(key => {
      const audio = new Audio();
      // 'metadata' loads just duration/format info up front.  The full
      // audio data is fetched on demand when the track first plays.
      // Using 'auto' for 22 tracks was eagerly decoding ~120 MB of MP3
      // data in the background and competing with the main thread —
      // that caused visible cursor/crosshair stutter.
      audio.preload = 'metadata';
      audio.loop = !NO_LOOP.has(key);
      audio.volume = 0;
      audio.src = BASE_PATH + encodeURIComponent(TRACKS[key]);
      audio.addEventListener('error', () => {
        st.loadErrors.add(key);
      });
      st.loaded[key] = audio;
    });
    console.log('🎵 Soundtrack: registered ' + keys.length + ' tracks (metadata only)');

    // The stinger bank comes up WITH the tracks, not 18 s into the session.
    // Short delay so the track metadata requests get first crack at the
    // connection; the seeks themselves are then staggered inside the bank.
    setTimeout(() => warmStingerBank('preload'), 400);
  }

  // ─── Play / Crossfade ─────────────────────────────────────────────────────
  // When the adaptive bus is live the riser/duck lives on the bus gain, so
  // element volume stays exactly as the crossfade logic wrote it.  Without
  // the bus we fold the FX gain into element volume instead (clamped to a
  // gentler range, since crossfade targets are sampled once at fade start).
  function fxElementGain() {
    if (wa.ok) return 1;
    return Math.max(0.55, Math.min(1.05, st.fx.gain));
  }

  // Everything that is NOT per-track: slider × duck × (fallback FX gain).
  // Split out so a crossfade can follow the duck live instead of freezing
  // the mix at whatever it happened to be when the fade started.
  function mixGain() {
    return st.volume * st.volumeScale * fxElementGain();
  }

  function trackVolume(key) {
    return mixGain() * (TRACK_VOLUME[key] || 1.0);
  }

  function clamp01(v) {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  // ─── Fade ownership: element .volume has exactly ONE writer ───────────────
  // Three passive writers keep the playing track in trim — the duck ramp,
  // the no-WebAudio FX fallback, and the volume slider.  A fade (crossfade,
  // fade-in, fade-out) must own the volume for its WHOLE life, and that life
  // starts the moment play() commits to a switch — NOT when the crossfade
  // interval finally gets installed.  The gap between those two moments is
  // asynchronous (we wait for 'playing' on the incoming track so a slow MP3
  // fetch can't fade the old track into silence), and a duck tick landing in
  // that gap used to write full volume onto a track that is supposed to be
  // silent — the incoming half of the fade then started from the wrong
  // place, which is the non-monotonic 0.050 → 0.007 → 0.043 glitch.
  //
  // fadePending closes that gap: it is raised synchronously inside play()
  // and lowered only when the crossfade interval takes over.
  function beginFade(timer) {
    if (st.fadeTimer) clearInterval(st.fadeTimer);
    st.fadeTimer = timer;
  }

  function clearFadePending() {
    st.fadePending = false;
  }

  function endFade() {
    if (st.fadeTimer) { clearInterval(st.fadeTimer); st.fadeTimer = null; }
    clearFadePending();
  }

  // True when a switch is still waiting on its incoming track and the track
  // the player actually hears is the one parked in fadingOut.
  function hasAudibleOutgoing() {
    return !!(st.fadePending && st.fadingOut && st.fadingOut !== st.currentEl &&
              !st.fadingOut.paused && st.fadingOut.volume > 0.001);
  }

  // The ONE place a passive writer is allowed to touch element volume.
  // While a fade owns the ramp it does nothing.  While a switch is pending,
  // the element the player actually hears is the OUTGOING one, so the duck
  // follows it there and leaves the incoming track parked at silence.
  function applyLiveVolume() {
    if (st.fadeTimer) return;                       // a ramp owns the volume
    if (st.fadePending) {
      const out = st.fadingOut;
      if (out && st.fadingOutKey) {
        const pv = trackVolume(st.fadingOutKey);
        if (Math.abs(out.volume - pv) > 0.004) out.volume = clamp01(pv);
      }
      return;
    }
    if (!st.currentEl) return;
    const v = st.current ? trackVolume(st.current) : st.volume;
    if (Math.abs(st.currentEl.volume - v) > 0.004) st.currentEl.volume = clamp01(v);
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
      // Single writer — see applyLiveVolume().  Fades own their own ramp
      // (and pick the new scale up live), so we never fight them.
      applyLiveVolume();
      if (step >= steps) {
        clearInterval(st.volumeScaleTimer);
        st.volumeScaleTimer = null;
        st.volumeScale = target;
      }
    }, interval);
  }

  function updateDuckingForCombat() {
    // Any live enemy within COMBAT_VOLUME_RADIUS of the camera counts as
    // active engagement.  The threat readout is refreshed by the adaptive
    // tick, so this is now a pure read — no second O(enemies) sweep.
    const engaged = st.threat.nearest < COMBAT_VOLUME_RADIUS ||
                    st.combat.active ||
                    (Date.now() - st.lastDamageAt) < DAMAGE_ENGAGE_WINDOW;
    setVolumeScale(engaged ? 1.0 : CALM_VOLUME_SCALE);
  }

  function play(key) {
    if (!st.enabled || st.muted) return;
    // Already on this track: the context tick calls play() with the same key
    // every few seconds, so this must stay a cheap no-op.
    if (key === st.current) {
      if (!st.currentEl || !st.currentEl.paused) return;
      const p = st.currentEl.play();
      if (p) p.catch(() => {});
      // Unless a stalled switch left the PREVIOUS track still audible — a
      // bare fade-in would then stack two tracks at full volume.  Drop
      // through to the crossfade path so the old one is ramped out.
      if (!hasAudibleOutgoing()) {
        fadeIn(st.currentEl, key);
        return;
      }
      st.current = null;   // force the full crossfade path below
    }
    if (st.loadErrors.has(key)) return;

    const next = st.loaded[key];
    if (!next) return;

    // Pick what we are crossfading FROM before tearing anything down.
    // Normally that's the current element — but if a previous switch is
    // still waiting on its incoming track to make sound, the element the
    // player actually hears is the one parked in fadingOut.  Fading from
    // the silent placeholder instead would hard-cut real audio.
    const stalled = hasAudibleOutgoing();
    const audible = stalled ? st.fadingOut : st.currentEl;
    const prevKey = stalled ? st.fadingOutKey : st.current;
    const prev = audible && audible !== next ? audible : null;

    // Stop any in-progress fade and silence EVERY other loaded track.
    // This is defensive: if play() was called mid-crossfade before, the
    // previously-fading-out track could still be audible, and multiple
    // rapid play() calls could layer 3+ tracks.
    endFade();
    Object.keys(st.loaded).forEach(k => {
      if (k === key) return;
      const a = st.loaded[k];
      if (!a) return;
      // Don't pause prev yet — we'll crossfade it. But kill everything else.
      if (a !== prev) {
        a.pause();
        a.volume = 0;
      }
    });
    st.fadingOut = null;
    st.fadingOutKey = null;

    st.current = key;
    st.currentEl = next;

    // Route the incoming track through the adaptive bus (no-op if the bus
    // isn't up yet — waEnsure() retro-routes everything when it comes online).
    waEnsure();
    waRoute(next);

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

    // WAIT-FOR-AUDIO crossfade: don't start killing the old track until
    // the incoming one is actually producing sound. Tracks are preloaded
    // as metadata only, so the full MP3 (Boss Fight.mp3 is 6.4 MB) is
    // fetched the first time it plays — on mobile (worse in 3D mode,
    // whose doubled render load competes with the fetch) the old timed
    // fade used to complete while the new track was still buffering,
    // leaving SILENCE. Now the old track keeps playing until 'playing'
    // fires on the new one; if the new track never starts, the old one
    // simply keeps going.
    st.fadingOut = prev;
    st.fadingOutKey = prevKey;
    // Take ownership of element volume RIGHT NOW, synchronously, even though
    // the ramp itself starts later.  Nothing else may write volume from here
    // until endFade() — that is what keeps the duck timer off the incoming
    // track while it is still silent.
    st.fadePending = true;

    let _xfStarted = false;
    const _beginCrossfade = () => {
      if (_xfStarted) return;
      if (st.currentEl !== next) return; // superseded by a later play()
      _xfStarted = true;
      const steps = 40;                            // 50 ms per step over 2 s
      const interval = (FADE_DURATION * 1000) / steps;
      let step = 0;
      const startVol = prev.volume;                // wherever the duck left it
      const startMix = mixGain();

      // One tick body, driven both synchronously (step 0, below) and by the
      // interval (steps 1..steps).  Splitting it out matters: setInterval's
      // first callback doesn't fire until `interval` ms have elapsed, and in
      // that window `next.volume` was still sitting at the literal 0 play()
      // set it to before waiting on 'playing' — a real, measured gap where
      // prev carries the whole mix alone.  Running step 0 immediately closes
      // it: next gets its correct starting volume the instant ownership of
      // the ramp is taken, not 50 ms later.
      const tick = () => {
        const t = Math.min(1, step / steps);
        // EQUAL-POWER crossfade.  Two different pieces of music are
        // uncorrelated, so they sum in POWER, not amplitude: a linear pair
        // sits at √(0.5²+0.5²) = 0.707 through the middle — a guaranteed
        // -3 dB hole punched into the score on EVERY transition.  cos/sin
        // hold cos²+sin² = 1, so the level walks across dead flat.
        const ratio = startMix > 0.0001 ? mixGain() / startMix : 1;
        const prevRaw = startVol * ratio * Math.cos(t * Math.PI / 2);
        prev.volume = clamp01(prevRaw);
        // RE-ENTRANT GUARD: next is the POWER COMPLEMENT of prev, not a bare
        // sin(t) — sqrt(target² − prevRaw²) instead of target·sin(t·π/2).
        // When this fade started with prev at full strength (the ordinary
        // case), prevRaw ≈ target·cos(t·π/2) and the complement collapses
        // to exactly target·sin(t·π/2) — identical to before. But when THIS
        // play() call is itself interrupting a fade that hadn't finished —
        // a mashed Skip, two switches inside one FADE_DURATION — prev is
        // really the PREVIOUS incoming track caught partway up its own
        // ramp, so startVol < target.  A bare sin(t) would then start next
        // at 0 while prev resumes its decay from a partial value, and
        // cos²+sin² no longer sums to 1: exactly the transient hole two
        // Skip presses close together used to punch in the mix.  Deriving
        // next from the complement keeps prevRaw² + next² pinned to target²
        // — constant combined power — from the very first sample, including
        // the reset instant itself, for ANY number of chained retriggers.
        const target = trackVolume(key);
        const deficit = target * target - prevRaw * prevRaw;
        next.volume = clamp01(deficit > 0 ? Math.sqrt(deficit) : 0);
      };

      tick();   // step 0, synchronous — see comment above.

      // Hand ownership from "pending" to the live ramp in one move, so
      // there is never an instant where neither holds it.
      beginFade(setInterval(() => {
        step++;
        tick();
        if (step >= steps) {
          endFade();
          prev.pause();
          prev.volume = 0;
          st.fadingOut = null;
          st.fadingOutKey = null;
          next.volume = clamp01(trackVolume(key));  // land exactly on target
        }
      }, interval));
      clearFadePending();
    };
    next.addEventListener('playing', _beginCrossfade, { once: true });
    if (next.readyState >= 3 && !next.paused) _beginCrossfade();
  }

  // Fade in from wherever the element currently sits.  The handle goes into
  // st.fadeTimer like every other ramp — leaving it un-owned (as it used to
  // be) let the duck timer overwrite the ramp mid-flight, which is exactly
  // the "visibly non-monotonic fade-in" the mix meter caught.
  function fadeIn(el, key) {
    const k = key || st.current;
    const steps = 24;
    const interval = (FADE_DURATION * 1000) / steps;
    let step = 0;
    const startVol = el.volume || 0;
    beginFade(setInterval(() => {
      step++;
      const t = Math.min(1, step / steps);
      // Same equal-power law as the incoming half of a crossfade, so a cold
      // start and a transition sound like the same gesture.  trackVolume is
      // re-read every tick, so a duck landing mid-fade bends the curve
      // instead of stamping over it.
      const target = trackVolume(k);
      el.volume = clamp01(startVol * (1 - t) + target * Math.sin(t * Math.PI / 2));
      if (step >= steps) {
        endFade();
        el.volume = clamp01(target);
      }
    }, interval));
    clearFadePending();
  }

  function fadeOutCurrent() {
    const el = st.currentEl;
    if (!el) return;
    const steps = 24;
    const interval = (FADE_DURATION * 1000) / steps;
    let step = 0;
    const startVol = el.volume;
    st.current = null;
    st.currentEl = null;
    beginFade(setInterval(() => {
      step++;
      const t = Math.min(1, step / steps);
      // cos matches the outgoing half of a crossfade: constant-power decay,
      // no early cliff into the last half-second.
      el.volume = clamp01(startVol * Math.cos(t * Math.PI / 2));
      if (step >= steps) {
        endFade();
        el.pause();
        el.volume = 0;
      }
    }, interval));
    clearFadePending();
  }

  function stopAll() {
    endFade();
    Object.values(st.loaded).forEach(a => {
      a.pause();
      a.volume = 0;
      a.currentTime = 0;
    });
    st.current = null;
    st.currentEl = null;
    st.fadingOut = null;
    st.fadingOutKey = null;
    stopAllStingers();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADAPTIVE MIX — spatialization helpers
  // ═══════════════════════════════════════════════════════════════════════════
  // Distance attenuation + stereo pan for anything this module plays.  Kept
  // allocation-free (no THREE.Vector3 churn) because it runs on one-shots
  // fired from the combat loop.
  function spatialGain(pos) {
    if (!pos || typeof camera === 'undefined' || !camera) return 1;
    const cp = camera.position;
    const dx = pos.x - cp.x, dy = pos.y - cp.y, dz = pos.z - cp.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d <= SPATIAL_NEAR) return 1;
    // Gentle inverse falloff — a boss 4 km out should still register as a
    // musical event, just clearly further away.
    const g = 1 / (1 + Math.pow((d - SPATIAL_NEAR) / SPATIAL_REF, 1.6));
    return Math.max(SPATIAL_MIN, Math.min(1, g));
  }

  function spatialPan(pos) {
    if (!pos || typeof camera === 'undefined' || !camera || !camera.matrixWorld) return 0;
    const cp = camera.position;
    const dx = pos.x - cp.x, dy = pos.y - cp.y, dz = pos.z - cp.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 0.0001) return 0;
    // Camera-right basis vector straight out of the world matrix.
    const e = camera.matrixWorld.elements;
    const dot = (dx * e[0] + dy * e[1] + dz * e[2]) / d;
    return Math.max(-1, Math.min(1, dot)) * SPATIAL_PAN;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADAPTIVE MIX — stingers
  // ═══════════════════════════════════════════════════════════════════════════
  function stingerEl(key) {
    const spec = STINGERS[key];
    if (!spec) return null;
    if (st.stingerEls[key]) return st.stingerEls[key];
    const a = new Audio();
    a.preload = 'metadata';
    a.loop = false;
    a.volume = 0;
    a.src = BASE_PATH + encodeURIComponent(spec.file);
    // Park the playhead on the transient as soon as duration is known: the
    // seek is what makes the browser buffer THAT part of the file, so the
    // hit is ready to fire instantly instead of streaming from byte zero.
    // NOT once-only: an escalated warm calls load(), which resets the
    // playhead to 0 and fires loadedmetadata again — we have to re-park.
    a.addEventListener('loadedmetadata', () => {
      if (!a.paused) return;                    // never yank a hit mid-flight
      try { a.currentTime = spec.at; } catch (e) { /* ignore */ }
    });
    // The moment this hit actually has data, drain anything waiting on it.
    // This is what makes a cold-start discovery land instead of vanishing.
    a.addEventListener('canplaythrough', () => { flushStingers(Date.now()); });
    a.addEventListener('error', () => { st.stingerBroken[key] = true; }, { once: true });
    st.stingerEls[key] = a;
    return a;
  }

  // Is the TRANSIENT itself buffered?  readyState alone lies here: a file
  // parked at byte 0 reports HAVE_ENOUGH_DATA while the slice we actually
  // fire — nine seconds in, for some of these — is not resident at all, and
  // the seek at fire time then stalls and the hit lands late.
  function bufferedAt(el, t) {
    try {
      const b = el.buffered;
      for (let i = 0; i < b.length; i++) {
        if (t >= b.start(i) - 0.01 && t + 0.35 < b.end(i)) return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function stingerArmed(key) {
    const el = st.stingerEls[key];
    const spec = STINGERS[key];
    if (!el || !spec || st.stingerBroken[key]) return false;
    if (el.readyState < 3) return false;
    return bufferedAt(el, spec.at);
  }

  // Ask a hit to buffer.  Cheap and idempotent — safe to call on a timer.
  function warmStinger(key) {
    const spec = STINGERS[key];
    const el = stingerEl(key);
    if (!el || !spec || st.stingerBroken[key]) return;
    if (stingerArmed(key)) return;               // already loaded and aimed
    if (!el.paused) return;                      // mid-hit — do not disturb it
    try {
      if (el.readyState >= 1) {
        // Parking the playhead ON the transient is what nudges the media
        // engine into fetching that region; harmless if already there.
        if (Math.abs(el.currentTime - spec.at) > 0.02) el.currentTime = spec.at;
        // Escalation for stragglers only: a hit that is still short of
        // HAVE_FUTURE_DATA after a few polite nudges is allowed to fetch
        // ahead.  We never do this for the whole bank up front — 6 × ~5 MB
        // of eager decode is the documented cause of the cursor stutter
        // that metadata-only preloading fixed.  And it is preload ONLY:
        // load() here would throw away the buffer we just built.
        if (el.readyState < 3) {
          st._warmTries[key] = (st._warmTries[key] || 0) + 1;
          if (st._warmTries[key] >= 4) el.preload = 'auto';
        }
      } else {
        // readyState 0 = nothing loaded at all, so there is no buffer for
        // load() to destroy.  This is the only place we may call it.
        st._warmTries[key] = (st._warmTries[key] || 0) + 1;
        el.load();
      }
    } catch (e) { /* ignore — a seek can throw while one is already in flight */ }
  }

  // Bring the whole bank up.  Called at preload() and again on the first
  // user gesture, so the six hits are buffered long before the first
  // discovery instead of 18 s into the session (which is what used to
  // swallow the single most emotive beat of a playthrough).
  function warmStingerBank(reason) {
    if (st.stingerWarmed) return;
    st.stingerWarmed = true;
    const keys = Object.keys(STINGERS);
    keys.forEach((k, i) => {
      stingerEl(k);                                   // metadata starts flowing now
      setTimeout(() => warmStinger(k), 150 + i * 200); // staggered seeks
    });
    if (!st._warmLogged) {
      st._warmLogged = true;
      console.log('🎵 Stingers: warming ' + keys.length + ' hits at ' + reason);
    }
    stingerWarmSweep();
  }

  // Keep after any hit that has not reached HAVE_FUTURE_DATA yet.  Stops
  // as soon as the bank is hot (or after ~100 s, so a missing file cannot
  // leave a timer running for the session).
  function stingerWarmSweep() {
    if (st._warmSweepTimer) return;   // a chain is already running
    st._warmSweeps = 0;               // fresh chain, fresh budget
    const tick = () => {
      st._warmSweepTimer = null;
      let cold = 0;
      Object.keys(STINGERS).forEach(k => {
        if (st.stingerBroken[k]) return;
        if (!stingerArmed(k)) { cold++; warmStinger(k); }
      });
      st._warmSweeps++;
      if (cold > 0 && st._warmSweeps < 40) {
        st._warmSweepTimer = setTimeout(tick, 2500);
      }
    };
    st._warmSweepTimer = setTimeout(tick, 2500);
  }

  function stopStinger(key) {
    if (st.stingerTimers[key]) {
      clearInterval(st.stingerTimers[key]);
      st.stingerTimers[key] = null;
    }
    const el = st.stingerEls[key];
    const spec = STINGERS[key];
    if (el) {
      el.pause();
      el.volume = 0;
      if (spec) { try { el.currentTime = spec.at; } catch (e) { /* ignore */ } }
    }
  }

  function stopAllStingers() {
    Object.keys(STINGERS).forEach(stopStinger);
    st.stingerPending.length = 0;   // a queued hit must not survive a pause
    st.fx.duckUntil = 0;
  }

  // ─── Deferred hits ────────────────────────────────────────────────────────
  // A beat that cannot sound THIS instant (the slice is still buffering, the
  // 900 ms spacing gate is closed, the game is paused for a frame) used to be
  // dropped on the floor — and for discoveries the caller had already latched
  // its "seen" flag, so that nebula never got its bell again all session.
  // Now the request is parked and retried every frame until it lands or its
  // musical window closes.  `hold` is per-spec: a discovery bell is still
  // right a beat late, a warp-exit swell is not.
  const STINGER_HOLD_DEFAULT = 1500;
  const STINGER_MAX_PENDING  = 4;

  function deferStinger(key, pos, now) {
    const spec = STINGERS[key];
    if (!spec) return false;
    // One pending hit per key — the newest request wins.
    for (let i = st.stingerPending.length - 1; i >= 0; i--) {
      if (st.stingerPending[i].key === key) st.stingerPending.splice(i, 1);
    }
    if (st.stingerPending.length >= STINGER_MAX_PENDING) st.stingerPending.shift();
    st.stingerPending.push({
      key: key,
      // Snapshot the position — the cloud/ship we were handed can move (or
      // be disposed) before the hit actually fires.
      pos: pos ? { x: pos.x, y: pos.y, z: pos.z } : null,
      deadline: now + (spec.hold || STINGER_HOLD_DEFAULT),
    });
    warmStinger(key);
    stingerWarmSweep();   // something is waiting on this bank — keep after it
    return false;
  }

  function flushStingers(now) {
    const q = st.stingerPending;
    if (!q.length) return;
    if (!st.enabled || st.muted) { q.length = 0; return; }
    if (typeof gameState !== 'undefined' && gameState && gameState.paused) return;
    for (let i = 0; i < q.length; i++) {
      const p = q[i];
      if (now > p.deadline || playStinger(p.key, p.pos, true)) {
        q.splice(i, 1);
        i--;
      }
    }
  }

  // Fire a beat, or put it on the books.  Returns true when the hit is
  // either sounding now or guaranteed a retry — which is exactly the
  // condition a caller needs before it latches a once-per-session flag.
  function requestStinger(key, pos) {
    if (playStinger(key, pos)) return true;
    for (let i = 0; i < st.stingerPending.length; i++) {
      if (st.stingerPending[i].key === key) return true;
    }
    return false;
  }

  // Fire a stinger.  `pos` is optional — pass a world position and the hit
  // is attenuated and panned toward it.
  // `_retry` is set when the call comes from the pending queue — those must
  // never re-park themselves (the queue entry is already holding the beat).
  function playStinger(key, pos, _retry) {
    const spec = STINGERS[key];
    if (!spec) return false;
    // Hard no's: nothing is ever going to make these sound, so don't park.
    if (!st.enabled || st.muted) return false;
    if (st.stingerBroken[key]) return false;

    const now = Date.now();
    // Per-type cooldown is measured in whole seconds — far longer than any
    // hold window — so this really is "not this one", not "not yet".
    if (now < (st.stingerNext[key] || 0)) return false;

    // Soft no's: true right now, likely false a few frames from here.
    const paused = (typeof gameState !== 'undefined' && gameState && gameState.paused);
    if (paused) return _retry ? false : deferStinger(key, pos, now);
    if (now < st.stingerGateUntil) {                          // global spacing
      return _retry ? false : deferStinger(key, pos, now);
    }

    const el = stingerEl(key);
    if (!el) return false;
    // The transient must be buffered, otherwise the hit lands late — which
    // reads worse than not playing it at all.  Warm it and hold the beat:
    // canplaythrough drains the queue the instant the slice is playable.
    if (!stingerArmed(key)) {
      warmStinger(key);
      return _retry ? false : deferStinger(key, pos, now);
    }

    st.stingerGateUntil = now + STINGER_SPACING;
    st.stingerNext[key] = now + (spec.cool || 6000);
    // Timestamp of the last hit that ACTUALLY sounded.  Callers with a
    // once-per-session flag compare against this instead of trusting a
    // return value, so a beat is latched when it was heard — never when it
    // was merely attempted, and never twice.
    st.stingerLastFired[key] = now;

    const sg = spatialGain(pos);
    const peak = Math.max(0, Math.min(1, st.volume * STINGER_LEVEL * spec.gain * sg));

    // Stereo placement (Web Audio only — element volume still carries level).
    waEnsure();
    const chain = waRouteStinger(el);
    if (chain && chain.pan) {
      try { chain.pan.pan.setTargetAtTime(spatialPan(pos), wa.ctx.currentTime, 0.01); } catch (e) { /* ignore */ }
    }

    stopStinger(key);
    try { el.currentTime = spec.at; } catch (e) { /* ignore */ }
    el.volume = 0;
    const p = el.play();
    if (p && p.catch) p.catch(() => {});

    // Sidechain: the bed steps back under the hit and swells back after.
    if (!spec.noDuck) st.fx.duckUntil = now + spec.dur * 1000;

    // Attack → hold → release envelope, 40 ms resolution.
    const STEP = 40;
    const atkMs = Math.max(STEP, spec.atk * 1000);
    const relMs = Math.max(STEP, spec.rel * 1000);
    const totalMs = spec.dur * 1000;
    const t0 = now;
    st.stingerTimers[key] = setInterval(() => {
      const t = Date.now() - t0;
      let v;
      if (t < atkMs) v = peak * (t / atkMs);
      else if (t > totalMs - relMs) v = peak * Math.max(0, (totalMs - t) / relMs);
      else v = peak;
      // Follow the music slider live, and vanish instantly on mute.
      el.volume = (st.muted || !st.enabled) ? 0 : Math.max(0, Math.min(1, v));
      if (t >= totalMs) stopStinger(key);
    }, STEP);
    return true;
  }

  // Semantic entry point — what the GAME calls, rather than a file name.
  function notifyEvent(event, pos) {
    switch (event) {
      case 'discovery':
      case 'nebulaDiscovered':
      case 'galaxyDiscovered':   return playStinger('discovery', pos);
      case 'bossSpawn':
      case 'bossIncoming':       return playStinger('bossSpawn', pos);
      case 'missionComplete':    return playStinger('missionComplete', pos);
      case 'liberation':
      case 'galaxyLiberated':    return playStinger('liberation', pos);
      case 'warpExit':           return playStinger('warpExit', pos);
      case 'threat':             return playStinger('threat', pos);
      default:                   return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADAPTIVE MIX — combat proximity state machine
  // ═══════════════════════════════════════════════════════════════════════════
  function threatRank(ud) {
    if (!ud) return 1;
    if (ud.isBoss) return 4;
    if (ud.isBorgCube || ud.isBorg) return 3;
    if (ud.isEliteGuardian || ud.isBlackHoleGuardian) return 2;
    return 1;
  }

  const RANK_TRACK = { 4: 'bossFight', 3: 'borg', 2: 'eliteGuardians', 1: 'eliteGuardians' };

  // "Engaging" is not the same as "nearby".  Sol's Martian pirates sit
  // inside 2,500 u of the launch point on a lazy patrol — scoring that as a
  // firefight would slam battle music over the opening beat of the game.
  // An enemy counts as engaging when it has actually pulled a trigger
  // recently, when its own AI has gone active, when it's close enough that
  // its next shot is imminent, or when it is a heavyweight whose mere
  // presence IS the encounter (boss / Borg / guardian).
  function isEngaging(ud, d, now) {
    if (!ud) return false;
    if (ud.isBoss || ud.isBorgCube || ud.isBorg ||
        ud.isEliteGuardian || ud.isBlackHoleGuardian) return true;
    if (ud.lastAttack && (now - ud.lastAttack) < FIRING_ENGAGE_WINDOW) return true;
    if (ud.isActive === true) return true;
    if (d < (ud.firingRange || 400) * 1.6) return true;
    return false;
  }

  function scanThreats() {
    const t = st.threat;
    t.near = 0; t.nearest = Infinity; t.engagedNearest = Infinity;
    t.rank = 0; t.lead = null;
    if (typeof enemies === 'undefined' || !enemies ||
        typeof camera === 'undefined' || !camera) return t;
    const cp = camera.position;
    const now = Date.now();
    let best = -Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || !e.userData || !e.position) continue;
      if (typeof e.userData.health === 'number' && e.userData.health <= 0) continue;
      const d = cp.distanceTo(e.position);
      if (d > COMBAT_RELEASE_RADIUS) continue;
      if (d < t.nearest) t.nearest = d;
      if (!isEngaging(e.userData, d, now)) continue;
      if (d < COMBAT_ENGAGE_RADIUS) t.near++;
      if (d < t.engagedNearest) t.engagedNearest = d;
      // Rank dominates distance: a boss at 3 km outranks a fighter at 300 m.
      const r = threatRank(e.userData);
      const score = r * 100000 - d;
      if (score > best) { best = score; t.rank = r; t.lead = e; }
    }
    return t;
  }

  function updateCombatState(now) {
    const c = st.combat;
    const t = scanThreats();

    // Hull loss counts as engagement even if the shooter drifted out of
    // range — you are unambiguously in a fight when you're taking hits.
    if (typeof gameState !== 'undefined' && gameState && typeof gameState.hull === 'number') {
      if (st.lastHull !== null && gameState.hull < st.lastHull - 0.01) st.lastDamageAt = now;
      st.lastHull = gameState.hull;
    }
    const hurtRecently = (now - st.lastDamageAt) < DAMAGE_ENGAGE_WINDOW;

    // The legacy boss path (switchToBattleMusic) is authoritative: when the
    // synth layer says "boss", the score commits to the boss track and the
    // proximity machine holds it rather than fighting over it.
    const bossForced = (typeof musicSystem !== 'undefined' && musicSystem && musicSystem.inBattle);

    // Launch grace — the first seconds after "go" belong to the home theme,
    // not to whichever pirate happens to be loitering near the shipyard.
    if (typeof gameState !== 'undefined' && gameState && gameState.gameStarted && !st.startedAt) {
      st.startedAt = now;
    }
    const inGrace = st.startedAt && (now - st.startedAt) < COMBAT_LAUNCH_GRACE;

    if (!c.active) {
      const contact = !inGrace && (bossForced || t.near > 0 || hurtRecently);
      if (contact) { if (!c.contactSince) c.contactSince = now; }
      else c.contactSince = 0;

      const held = c.contactSince && (now - c.contactSince) >= (bossForced ? 0 : COMBAT_ENTER_DELAY);
      const rearmed = (now - c.leftAt) >= (bossForced ? 0 : COMBAT_REARM);
      if (held && rearmed) {
        c.active = true;
        c.enteredAt = now;
        c.clearSince = 0;
        c.rank = bossForced ? 4 : (t.rank || 1);
        c.key = RANK_TRACK[c.rank] || 'eliteGuardians';
        // Heavyweight contact gets a stab before the track lands.
        if (c.rank >= 3 && !bossForced) {
          playStinger('threat', t.lead ? t.lead.position : null);
        }
      }
    } else {
      // Escalate only — a boss arriving mid-skirmish upgrades the track; a
      // grunt surviving a boss never downgrades it.
      const r = bossForced ? 4 : t.rank;
      if (r > c.rank) {
        c.rank = r;
        c.key = RANK_TRACK[r] || c.key;
      }
      // Hysteresis: entry at 2500 u, release only past 3400 u.
      const stillEngaged = bossForced || t.engagedNearest < COMBAT_RELEASE_RADIUS || hurtRecently;
      if (stillEngaged) c.clearSince = 0;
      else if (!c.clearSince) c.clearSince = now;

      if (c.clearSince &&
          (now - c.clearSince) >= COMBAT_EXIT_DELAY &&
          (now - c.enteredAt) >= COMBAT_MIN_HOLD) {
        c.active = false;
        c.key = null;
        c.rank = 0;
        c.contactSince = 0;
        c.leftAt = now;
        // A cached substitute belongs to the engagement that produced it —
        // clearing key without clearing subKey/subKeyFor would leave the
        // sub-cache guard above believing the (now-gone) fight is still
        // pinned to it, so the NEXT engagement's first tick could read a
        // stale substitute for a combat.key that hasn't even resolved yet.
        c.subKey = null;
        c.subKeyFor = null;
        // Hand the context detector the wheel again immediately so the
        // ambient crossfade starts on the same beat the fight ends.
        updateMusicContext();
      }
    }
    return c;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADAPTIVE MIX — warp riser / tunnel duck / exit bloom
  // ═══════════════════════════════════════════════════════════════════════════
  function smoothstep(a, b, x) {
    if (b === a) return x >= b ? 1 : 0;
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function updateWarpFx(now, dt) {
    const fx = st.fx;
    let gain = 1.0;
    let lp = FILTER_OPEN_HZ;

    const W = (typeof window !== 'undefined') ? window : null;
    const wf = W ? W.__whipFrame : null;
    const dil = (W && typeof W.__whipDilation === 'number') ? W.__whipDilation : 0;
    const tun = (W && typeof W.__warpTunnelLevel === 'number') ? W.__warpTunnelLevel : 0;
    const gs = (typeof gameState !== 'undefined') ? gameState : null;
    const sling = gs && gs.slingshot ? gs.slingshot : null;
    const ewarp = gs && gs.emergencyWarp ? gs.emergencyWarp : null;

    // ── RISER: the gravity whip's own arc parameter drives the swell.
    // u runs 0 → 1 across the arc, so the music tightens on the approach
    // and blooms through periapsis exactly with the physics.
    if (wf && wf.active && typeof wf.u === 'number') {
      const u = Math.max(0, Math.min(1, wf.u));
      // Two bells, not a ramp.  A riser is a CONTRAST: pull the floor out
      // from under the mix on the approach (quieter AND darker), then bloom
      // through periapsis.  Both curves return to zero, so the mix is back
      // at unity by the time the arc releases — no lingering dip.
      const dip  = Math.exp(-Math.pow((u - 0.15) / 0.12, 2));
      const lift = Math.exp(-Math.pow((u - 0.48) / 0.22, 2));
      gain *= (1 - 0.14 * dip + 0.26 * lift);
      lp = Math.min(lp, FILTER_OPEN_HZ - (FILTER_OPEN_HZ - 4200) * dip);
    }

    // ── PERIAPSIS PINCH: __whipDilation is a bell centred on the slow-mo
    // moment.  Squeezing the band there gives the time-dilation beat an
    // audible counterpart instead of leaving it a purely visual trick.
    if (dil > 0.02) {
      const p = Math.max(0, Math.min(1, dil));
      gain *= (1 - 0.28 * p);
      lp = Math.min(lp, 900 + (FILTER_OPEN_HZ - 900) * (1 - p));
    }

    // ── TUNNEL: inside the warp tunnel the score goes distant and muffled.
    if (tun > 0.01) {
      const k = Math.max(0, Math.min(1, tun));
      gain *= (1 - 0.70 * k);
      lp = Math.min(lp, 520 + (FILTER_OPEN_HZ - 520) * (1 - k));
      if (k > fx.tunnelPeak) fx.tunnelPeak = k;
    } else if (fx.tunnelPeak > 0.45) {
      // ── EXIT BEAT: the tunnel just collapsed after a real transit.
      // Bloom the bed back with a little overshoot, breathe an arrival
      // swell over it, and re-pick the track for wherever we came out.
      fx.tunnelPeak = 0;
      fx.bloomUntil = now + 1100;
      playStinger('warpExit', null);
      updateMusicContext();
    } else {
      fx.tunnelPeak = 0;
    }

    // ── EMERGENCY WARP: same idea, gentler — it has no tunnel of its own.
    if (ewarp && ewarp.active) {
      gain *= 0.82;
      lp = Math.min(lp, 3600);
    }

    // ── POST-SLINGSHOT COAST: hold a touch of lift while you're still
    // screaming away from the well, then settle.
    if (sling && sling.postSlingshot && !(wf && wf.active)) {
      gain *= 1.06;
    }

    // ── BLOOM window (exit overshoot, decaying).
    if (now < fx.bloomUntil) {
      const b = (fx.bloomUntil - now) / 1100;
      gain *= (1 + 0.16 * b);
      lp = FILTER_OPEN_HZ;
    }

    // ── STINGER SIDECHAIN.
    if (now < fx.duckUntil) gain *= (1 - STINGER_DUCK);

    fx.gainT = Math.max(0.05, Math.min(1.5, gain));
    fx.lpT = Math.max(200, Math.min(FILTER_OPEN_HZ, lp));

    // Asymmetric smoothing: grabs fast, releases slow.
    const kg = 1 - Math.exp(-dt / (fx.gainT < fx.gain ? FX_TAU_UP : FX_TAU_DOWN));
    fx.gain += (fx.gainT - fx.gain) * kg;
    const kl = 1 - Math.exp(-dt / (fx.lpT < fx.lp ? FX_TAU_UP : FX_TAU_DOWN));
    fx.lp += (fx.lpT - fx.lp) * kl;

    applyFx();
  }

  function applyFx() {
    const fx = st.fx;
    if (wa.ok && wa.bus && wa.filter && wa.ctx) {
      // Only touch the audio param when it actually moved — scheduling a
      // ramp every frame for a static value is pure overhead.
      if (Math.abs(fx.gain - fx.lastPushedGain) > 0.004) {
        fx.lastPushedGain = fx.gain;
        try { wa.bus.gain.setTargetAtTime(fx.gain, wa.ctx.currentTime, 0.03); } catch (e) { /* ignore */ }
      }
      if (Math.abs(fx.lp - fx.lastPushedLp) > 25) {
        fx.lastPushedLp = fx.lp;
        try { wa.filter.frequency.setTargetAtTime(fx.lp, wa.ctx.currentTime, 0.03); } catch (e) { /* ignore */ }
      }
      return;
    }
    // Fallback: fold the gain into element volume, but never while a fade
    // owns it (same single-writer rule everything else plays by).
    applyLiveVolume();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADAPTIVE MIX — event polling (edge detection on shared game state)
  // ═══════════════════════════════════════════════════════════════════════════
  // Everything here is read-only observation of globals other files already
  // maintain, so the stingers land without a single call site being added
  // elsewhere.  If those files later call soundtrack.notify() directly, the
  // per-type cooldown keeps the hit from doubling.
  function pollEvents(now) {
    if (typeof gameState === 'undefined' || !gameState || !gameState.gameStarted) return;

    // BOSS SPAWN — a live boss we've never seen before.
    if (typeof enemies !== 'undefined' && enemies) {
      // First pass only records what already exists: a stinger announces an
      // ARRIVAL, so nothing that predates our first look counts as news.
      const baseline = !st.seenBosses;
      if (!st.seenBosses) st.seenBosses = new Set();
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || !e.userData || !e.userData.isBoss) continue;
        if (typeof e.userData.health === 'number' && e.userData.health <= 0) continue;
        const id = e.uuid || (e.userData.name + '_' + i);
        if (st.seenBosses.has(id)) continue;
        st.seenBosses.add(id);
        if (baseline) continue;
        // Only announce a boss that's actually in the player's world —
        // far-field housekeeping spawns shouldn't fire a stinger.
        if (typeof camera !== 'undefined' && camera &&
            camera.position.distanceTo(e.position) < 9000) {
          playStinger('bossSpawn', e.position);
        }
      }
    }

    // MISSION COMPLETE — dotted-line objectives flipping to complete.
    if (typeof discoveryPaths !== 'undefined' && discoveryPaths) {
      let done = 0, lastPos = null;
      for (let i = 0; i < discoveryPaths.length; i++) {
        const p = discoveryPaths[i];
        const ud = p && p.line && p.line.userData;
        if (ud && ud.missionComplete) { done++; lastPos = ud.endPosition || lastPos; }
      }
      if (st.lastMissionsDone >= 0 && done > st.lastMissionsDone) {
        playStinger('missionComplete', lastPos);
      }
      st.lastMissionsDone = done;
    }

    // GALAXY LIBERATION — the campaign's biggest beat gets the biggest hit.
    const cleared = gameState.galaxiesCleared || 0;
    if (st.lastGalaxiesCleared >= 0 && cleared > st.lastGalaxiesCleared) {
      // Non-spatial on purpose: liberation is a statement, not a location.
      st.stingerGateUntil = 0;
      playStinger('liberation', null);
    }
    st.lastGalaxiesCleared = cleared;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADAPTIVE MIX — playback liveness watchdog
  // ═══════════════════════════════════════════════════════════════════════════
  // The crossfade in play() is armed by a ONE-SHOT 'playing' listener (see
  // _beginCrossfade above) and is never re-verified after that.  'playing'
  // only proves the decoder produced a single frame at that instant — it
  // says nothing about whether the decoder keeps advancing.  If it stalls
  // right after — exactly what mashing Skip induces, by starting and then
  // abandoning multiple 4-6 MB MP3 range-fetches — the crossfade has
  // already hard-killed the outgoing track and parked the incoming one at
  // full element volume.  Every number this file tracks (element.volume,
  // fade.power, the duck scale) reads as a perfect mix in that state,
  // because they are all envelope math — none of them ask whether the
  // decoder is actually still moving.  This does: sample currentTime, and
  // if the track that's supposed to be audible right now hasn't moved in
  // LIVENESS_STALL_MS, that's dead air wearing a healthy mix.
  const LIVENESS_SAMPLE_MS = 1000;   // how often we look at currentTime
  const LIVENESS_STALL_MS  = 1500;   // no advance for this long = stalled
  // How long a track stays demoted after a confirmed liveness failure
  // before it's eligible to be picked as a fallback again. Without this,
  // a track that just failed sits in goodKeys forever (it WAS healthy once)
  // and the very next fallback walk can land right back on it — two dead
  // tracks then ping-pong the mix between each other indefinitely.
  const LIVENESS_FAILED_COOLDOWN_MS = 60000;
  // The always-loaded, never-combat, never-context-specific bed. When every
  // known-good candidate is itself cold or recently failed, this is the
  // known-safest layer to drop to rather than keep cycling dead tracks.
  const LIVENESS_SAFE_BASE_KEY = 'mainTheme';

  // "What's actually audible right now" mirrors applyLiveVolume()'s own
  // rule: while a switch is pending 'playing' on the incoming track, the
  // OUTGOING track is what the player hears, so that's what we watch —
  // otherwise the legitimate wait-for-buffer window (which can by design
  // run for many seconds on a slow connection) would read as a false
  // stall on every single crossfade.
  function livenessTarget() {
    if (st.fadePending && st.fadingOut && st.fadingOutKey) {
      return { el: st.fadingOut, key: st.fadingOutKey };
    }
    return { el: st.currentEl, key: st.current };
  }

  // NOTE on goodKeys: a single "lastGoodKey" scalar only ever remembers the
  // ONE track most recently left behind. That breaks the moment playback
  // cycles back onto that same key later (skip mash through a small pool,
  // a looped playlist, whatever) — the scalar becomes pinned to whatever
  // is CURRENTLY being watched, the fallback check (lastGoodKey !== key)
  // nulls itself out, and the second-failure rung ("switch to a track we
  // know produces sound") can never fire even though several other tracks
  // were confirmed healthy earlier in the same session.
  //
  // goodKeys is a small ring instead: every track that proves itself
  // (currentTime actually advancing while watched) gets pushed — see
  // pushGoodKey() — deduped and capped at 4. Fallback selection then
  // walks it most-recent-first and skips only the currently-watched key,
  // so any of the last few proven-healthy tracks remains reachable even
  // if the most recent one happens to be the one that's now stalling.
  function pushGoodKey(key, now) {
    const liv = st.liveness;
    const idx = liv.goodKeys.findIndex(e => e.key === key);
    if (idx !== -1) liv.goodKeys.splice(idx, 1);
    liv.goodKeys.push({ key: key, at: now });
    if (liv.goodKeys.length > 4) liv.goodKeys.shift();
    // Advancing IS "demonstrably produces samples again" — re-admit a
    // previously-demoted track the moment it proves itself, rather than
    // making it sit out the full cooldown once it's actually recovered.
    if (liv.failed[key]) delete liv.failed[key];
  }

  // A track that failed liveness within the last LIVENESS_FAILED_COOLDOWN_MS
  // stays ineligible as a fallback target — it was demoted precisely because
  // the ring couldn't otherwise tell "proved healthy a while ago" apart from
  // "just went dead", and picking it again is how two dead tracks ping-pong.
  function isRecentlyFailed(key, now) {
    const liv = st.liveness;
    const at = liv.failed[key];
    return typeof at === 'number' && (now - at) < LIVENESS_FAILED_COOLDOWN_MS;
  }

  // Marks a track as just-failed: pulled out of goodKeys (it is no longer
  // "recently confirmed healthy" — it's the opposite) and stamped in the
  // failed map so pickFallbackKey() won't hand it right back out while it's
  // still cold. Cleared again by pushGoodKey() once it actually plays.
  function demoteKey(key, now) {
    const liv = st.liveness;
    const idx = liv.goodKeys.findIndex(e => e.key === key);
    if (idx !== -1) liv.goodKeys.splice(idx, 1);
    liv.failed[key] = now;
  }

  // Most-recently-confirmed track that is NOT the one currently stalling,
  // hasn't since failed to load, and isn't itself sitting in a post-failure
  // cooldown. Walks newest-first.
  function pickFallbackKey(key, now) {
    const liv = st.liveness;
    for (let i = liv.goodKeys.length - 1; i >= 0; i--) {
      const k = liv.goodKeys[i].key;
      if (k === key) continue;
      if (!st.loaded[k] || st.loadErrors.has(k)) continue;
      if (isRecentlyFailed(k, now)) continue;
      return k;
    }
    return null;
  }

  function livenessRearm(now, key, t) {
    const liv = st.liveness;
    liv.lastKeyWatched = key;
    liv.lastSampleAt = now;
    liv.lastCurrentTime = t;
    liv.stuckSince = 0;
    liv.stalled = false;
    liv.recovering = false;
    liv.confirmed = false;
  }

  function updateLiveness(now) {
    const liv = st.liveness;
    const target = livenessTarget();
    const el = target.el, key = target.key;

    // Nothing to watch, or the mix is legitimately silent — a stall check
    // is meaningless there, so just re-arm the baseline.
    const shouldSound = !!(el && key && st.enabled && !st.muted &&
                            st.volume > 0 && !el.paused);
    if (!shouldSound) { livenessRearm(now, key, el ? el.currentTime : -1); return; }

    // The watched track (or which half of a fade is audible) changed under
    // us — the old currentTime baseline means nothing across that switch.
    if (liv.lastKeyWatched !== key) { livenessRearm(now, key, el.currentTime); return; }

    if (now - liv.lastSampleAt < LIVENESS_SAMPLE_MS) return;

    const t = el.currentTime;
    // A one-shot/looping track wrapping back toward 0 is real playback,
    // not a stall — only a genuinely FROZEN reading counts.
    const advanced = Math.abs(t - liv.lastCurrentTime) > 0.05;
    liv.lastSampleAt = now;
    liv.lastCurrentTime = t;

    if (advanced) {
      liv.stuckSince = 0;
      liv.stalled = false;
      liv.recovering = false;
      liv.confirmed = true;
      pushGoodKey(key, now);
      return;
    }

    if (!liv.stuckSince) liv.stuckSince = now;
    if (now - liv.stuckSince < LIVENESS_STALL_MS) return;

    liv.stalled = true;

    if (!liv.recovering) {
      // First failure: nudge the SAME element. Most stalls are a decoder
      // hiccup on a track that is otherwise correctly armed, not a dead
      // source — re-issuing play() is the cheapest fix.
      liv.recovering = true;
      console.warn('🎵 Soundtrack: liveness stall — "' + key + '" frozen at ' +
                    t.toFixed(2) + 's, re-issuing play()');
      try { const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
      liv.stuckSince = now;   // give the retry its own window before judging it
      return;
    }

    // Second failure in a row: the retry didn't take. This track is
    // confirmed dead — demote it BEFORE picking a fallback so a later
    // fallback walk (possibly triggered by the track we're about to switch
    // to also failing) can't land right back on it while it's still frozen.
    demoteKey(key, now);

    // Do not sit on indefinite silence — fall back to the last track we
    // KNOW was actually producing sound (and hasn't itself just failed).
    let fallbackTarget = pickFallbackKey(key, now);
    if (!fallbackTarget && key !== LIVENESS_SAFE_BASE_KEY &&
        st.loaded[LIVENESS_SAFE_BASE_KEY] && !st.loadErrors.has(LIVENESS_SAFE_BASE_KEY) &&
        !isRecentlyFailed(LIVENESS_SAFE_BASE_KEY, now)) {
      // Every proven-healthy candidate is itself cold or in cooldown —
      // rather than cycle dead tracks, drop to the known-safest base layer.
      fallbackTarget = LIVENESS_SAFE_BASE_KEY;
    }
    console.warn('🎵 Soundtrack: liveness recovery failed on "' + key + '" — ' +
                  (fallbackTarget ? 'falling back to "' + fallbackTarget + '"'
                          : 'no known-good track yet, forcing a hard reload'));
    liv.stuckSince = 0;
    liv.recovering = false;
    liv.stalled = false;
    if (fallbackTarget) {
      play(fallbackTarget);
    } else {
      // No known-good track yet (this stalled on the very first track of
      // the session, and the safe base layer is unavailable or itself
      // frozen) — hard-reload the element as a last resort.
      try {
        el.load();
        el.currentTime = 0;
        const p = el.play();
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* ignore */ }
    }
  }

  // updateMusicContext() below picks WHAT the player should be hearing
  // (combat/borg/boss/nebula/galaxy) purely from world state — it has no
  // idea a given key is currently cold. Left to call play(key) directly,
  // it re-asserts the context-appropriate key on every ~500ms tick
  // regardless of liveness, which drags the mix straight back onto a
  // track updateLiveness() just demoted (that demotion happens on its own
  // clock, mid-stall-detection, independent of this tick) — the watchdog
  // wins the escape for one tick and this tick immediately reopens it.
  // playHealthy() is the veto every context branch must call play()
  // through: honor the requested key only while it isn't in its post-
  // failure cooldown, otherwise walk an explicit same-genre chain for the
  // first still-healthy alternative, and only if the entire chain is cold
  // drop to the known-safest base layer. Returns the key actually played
  // so a caller can cache it (keeps a resolved substitute stable across
  // ticks instead of re-walking — and thus potentially re-crossfading to
  // a DIFFERENT alt — every single call).
  function playHealthy(key, chain) {
    const now = Date.now();
    function eligible(k) {
      return !!k && !!st.loaded[k] && !st.loadErrors.has(k) && !isRecentlyFailed(k, now);
    }
    if (eligible(key)) { play(key); return key; }
    for (let i = 0; i < (chain ? chain.length : 0); i++) {
      const alt = chain[i];
      if (eligible(alt)) { play(alt); return alt; }
    }
    // Whole chain is cold/failed too — drop to the safe base rather than
    // keep cycling dead tracks. Play it even if it's ALSO in cooldown
    // (nothing else is left); play() itself still no-ops safely on a
    // missing/errored element.
    play(LIVENESS_SAFE_BASE_KEY);
    return LIVENESS_SAFE_BASE_KEY;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADAPTIVE MIX — the tick
  // ═══════════════════════════════════════════════════════════════════════════
  // Own rAF loop: the FX automation has to run at frame rate to feel like
  // automation, while the game only calls soundtrack.update() twice a second.
  // The expensive parts (enemy sweep, event polling) are throttled inside.
  let _slowAccum = 0;
  function adaptiveTick() {
    requestAnimationFrame(adaptiveTick);
    const now = Date.now();
    const dt = st.lastTick ? Math.min(0.1, (now - st.lastTick) / 1000) : 0.016;
    st.lastTick = now;

    if (!st.enabled) return;

    // Defensive: this loop reads globals owned by half a dozen other files.
    // A soundtrack must never be the thing that kills the frame.
    try {
      waEnsure();
      waWatchdog();

      const paused = (typeof gameState !== 'undefined' && gameState && gameState.paused);
      if (!paused && !st.muted) {
        // Held beats get their shot every frame — a hit that was waiting on
        // a buffering slice lands the moment the data arrives, not 18 s in.
        flushStingers(now);
        updateWarpFx(now, dt);
        updateLiveness(now);
        _slowAccum += dt;
        if (_slowAccum >= 0.15) {
          _slowAccum = 0;
          updateCombatState(now);
          pollEvents(now);
        }
      }
    } catch (e) {
      if (!st._tickWarned) {
        st._tickWarned = true;
        console.warn('🎵 adaptive mix tick error (music continues):', e);
      }
    }
  }
  requestAnimationFrame(adaptiveTick);

  // The bank is warmed at preload() and again on the first user gesture, so
  // by the time anyone can trigger a beat the slices are already buffered.
  // A gesture is also the point where a browser that was withholding media
  // data will hand it over, so re-nudge anything still cold there.
  function firstGestureWarm() {
    warmStingerBank('first gesture');
    Object.keys(STINGERS).forEach(warmStinger);
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, firstGestureWarm, { once: true, passive: true });
  });

  // ─── Context detection ────────────────────────────────────────────────────
  // Called every ~500ms from the game loop to pick the right track based on
  // the player's current location and game state.
  function updateMusicContext() {
    if (!st.enabled || st.muted) return;

    // Skip lock — when the player just pressed Skip to pick a specific
    // track, don't let the context detector yank them back to the
    // location-appropriate track for a while.  Also bypass combat
    // ducking so the player-chosen track plays at full volume.
    // Lock auto-expires.
    if (Date.now() < st.skipLockUntil) return;

    // Dynamic ducking — swell during combat, soften in calm.
    updateDuckingForCombat();

    // 1) Launch screen (game not started)
    if (typeof gameState === 'undefined' || !gameState.gameStarted) {
      play('launchScreen');
      return;
    }

    // One-shot: warm the combat tracks in the background once the game is
    // running (they're metadata-only preloads) so the boss/borg music
    // switch doesn't fetch ~6 MB at the moment the fight starts.
    if (!st._combatWarmed) {
      st._combatWarmed = true;
      setTimeout(() => {
        ['bossFight', 'eliteGuardians', 'borg'].forEach(k => {
          const a = st.loaded[k];
          if (a && a !== st.currentEl && !st.loadErrors.has(k)) {
            a.preload = 'auto';
            try { a.load(); } catch (e) {}
          }
        });
      }, 12000);
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

    // 2c) COMBAT OVERRIDE — the proximity state machine owns the context
    // while a fight is live.  It has already applied its own entry delay,
    // exit delay and minimum hold, so by the time we get here the answer
    // is stable; play() just crossfades over FADE_DURATION as usual.
    if (st.combat.active && st.combat.key) {
      // Cache the resolved substitute per combat.key so a healthy pick
      // stays sticky across this 500ms tick instead of re-walking the
      // chain (and potentially landing on a different, also-healthy alt)
      // every call — re-resolve only when the requested key changes or
      // the cached substitute has itself since gone cold.
      const now = Date.now();
      // The cached substitute is only still valid while BOTH halves of the
      // swap hold: the substitute itself must still be healthy, AND the
      // key it was substituted FOR must still be the one that's demoted.
      // Checking only the former (as this used to) makes a substitution
      // outlive the failure that caused it — once eliteGuardians subs in
      // for a frozen bossFight, it stays cached even after bossFight
      // recovers, because nothing here ever re-asks "is bossFight still
      // bad?". Re-asking isRecentlyFailed(st.combat.key) on every tick is
      // what lets a recovered key reclaim its own slot immediately.
      if (st.combat.subKeyFor === st.combat.key && st.combat.subKey &&
          st.combat.subKey !== st.combat.key &&
          isRecentlyFailed(st.combat.key, now) &&
          st.loaded[st.combat.subKey] && !st.loadErrors.has(st.combat.subKey) &&
          !isRecentlyFailed(st.combat.subKey, now)) {
        play(st.combat.subKey);
        return;
      }
      const resolved = playHealthy(st.combat.key,
        ['eliteGuardians', 'borg', 'bossFight'].filter(k => k !== st.combat.key));
      st.combat.subKeyFor = st.combat.key;
      st.combat.subKey = resolved;
      return;
    }

    // 3) Borg encounter
    if (typeof gameState !== 'undefined' && gameState.currentTarget) {
      const tgt = gameState.currentTarget;
      if (tgt.userData && (tgt.userData.isBorgCube || tgt.userData.isBorg)) {
        const d = typeof camera !== 'undefined'
          ? camera.position.distanceTo(tgt.position) : Infinity;
        if (d < 5000) {
          playHealthy('borg', ['bossFight', 'eliteGuardians']);
          return;
        }
      }
    }

    // 4) Boss fight
    if (typeof musicSystem !== 'undefined' && musicSystem.inBattle) {
      playHealthy('bossFight', ['eliteGuardians', 'borg']);
      return;
    }

    // 5) Elite guardians — check if we're fighting a black hole guardian
    if (typeof gameState !== 'undefined' && gameState.targetLock &&
        gameState.targetLock.active && gameState.targetLock.target) {
      const tgt = gameState.targetLock.target;
      if (tgt.userData && tgt.userData.isBlackHoleGuardian) {
        playHealthy('eliteGuardians', ['bossFight', 'borg']);
        return;
      }
    }

    // 6) Nebula proximity — pick a nebula track based on index
    const nebulaIdx = detectNearbyNebula();
    if (nebulaIdx >= 0) {
      const nebulaKey = 'nebula' + (1 + (nebulaIdx % 5));
      playHealthy(nebulaKey,
        ['nebula1', 'nebula2', 'nebula3', 'nebula4', 'nebula5'].filter(k => k !== nebulaKey));
      st.lastNebulaIdx = nebulaIdx;
      // DISCOVERY FLASH — first time this nebula's music area is entered.
      // The banner and the bell latch SEPARATELY: showing the banner twice
      // is a bug, but a bell that could not sound must stay on the books
      // and be re-offered on the next tick.  Latching them together is what
      // used to lose the first discovery of a run permanently.
      if (!st._discoveredNebulas) st._discoveredNebulas = {};
      if (!st._stungNebulas) st._stungNebulas = {};
      if (!st._discoveredNebulas[nebulaIdx]) {
        st._discoveredNebulas[nebulaIdx] = Date.now();
        if (typeof window !== 'undefined' && typeof window.flashEventText === 'function') {
          const _n = (typeof nebulaClouds !== 'undefined' && nebulaClouds[nebulaIdx] && nebulaClouds[nebulaIdx].userData) ? nebulaClouds[nebulaIdx].userData : null;
          const _nm = _n ? (_n.mythicalName || _n.name || 'Unknown Nebula') : 'Unknown Nebula';
          window.flashEventText('NEBULA DISCOVERED', '#88ddff', String(_nm).toUpperCase());
        }
      }
      if (!st._stungNebulas[nebulaIdx]) {
        const _seen = st._discoveredNebulas[nebulaIdx] || 0;
        if ((st.stingerLastFired.discovery || 0) >= _seen) {
          st._stungNebulas[nebulaIdx] = true;      // heard — this beat is done
        } else if (Date.now() - _seen > DISCOVERY_HIT_WINDOW) {
          st._stungNebulas[nebulaIdx] = true;      // the moment has passed
        } else {
          // Musical hit on the same frame as the banner, panned toward the
          // cloud.  Re-offered every tick until it is actually heard.
          requestStinger('discovery',
            (typeof nebulaClouds !== 'undefined' && nebulaClouds[nebulaIdx])
              ? nebulaClouds[nebulaIdx].position : null);
        }
      }
      return;
    }

    // 7) Galaxy-specific music
    const gId = detectGalaxy();
    if (gId >= 0 && gId <= 7) {
      play('galaxy' + gId);
      st.lastGalaxyId = gId;
      // DISCOVERY FLASH — first entry of a DISTANT galaxy's music area
      // (gId 7 is the home Sgr A*/Sol region — never "discovered").
      if (gId !== 7) {
        if (!st._discoveredGalaxies) st._discoveredGalaxies = {};
        if (!st._stungGalaxies) st._stungGalaxies = {};
        if (!st._discoveredGalaxies[gId]) {
          st._discoveredGalaxies[gId] = Date.now();
          if (typeof window !== 'undefined' && typeof window.flashEventText === 'function') {
            const _gt = (typeof galaxyTypes !== 'undefined') ? galaxyTypes[gId] : null;
            const _gm = _gt ? ((_gt.name || 'Unknown') + ' GALAXY · ' + (_gt.faction || '')) : ('GALAXY ' + gId);
            window.flashEventText('GALAXY DISCOVERED', '#ffcc66', String(_gm).toUpperCase());
          }
        }
        // Same split latch as the nebula path — the bell keeps its own books.
        if (!st._stungGalaxies[gId]) {
          const _seen = st._discoveredGalaxies[gId] || 0;
          if ((st.stingerLastFired.discovery || 0) >= _seen ||
              Date.now() - _seen > DISCOVERY_HIT_WINDOW) {
            st._stungGalaxies[gId] = true;
          } else {
            requestStinger('discovery', null);
          }
        }
      }
      return;
    }

    // 7b) Outer interstellar systems — Borg patrol systems get one of
    // the 2 "Beware the Borg" tracks; exotic core systems get a Far
    // Outer Galaxy track.  Each system keeps its assignment permanently.
    const nearOuter = detectNearbyOuterSystem();
    if (nearOuter >= 0) {
      if (!st._outerTrackMap) st._outerTrackMap = {};
      if (!st._outerTrackMap[nearOuter]) {
        const isBorg = detectOuterSystemIsBorg(nearOuter);
        if (isBorg) {
          st._outerTrackMap[nearOuter] = Math.random() < 0.5 ? 'bewareBorg1' : 'bewareBorg2';
        } else {
          st._outerTrackMap[nearOuter] = 'farOuter' + (1 + Math.floor(Math.random() * 3));
        }
      }
      play(st._outerTrackMap[nearOuter]);
      return;
    }

    // 8) Sagittarius A* area — rotate through Far Outer Galaxy tracks
    if (gId === 8) {
      if (st.current !== 'farOuter1' && st.current !== 'farOuter2' &&
          st.current !== 'farOuter3') {
        const farKey = 'farOuter' + (1 + Math.floor(Math.random() * 3));
        play(farKey);
      }
      return;
    }

    // 8b) "Home space" guard. The Sol system now sits ~9.5k from Sgr A*,
    // so at game start the player is outside every galaxy's music
    // perimeter and steps 7/8 don't fire — without this it would cut
    // straight to interstellar travel music. Treat both the Sol local
    // system and the Sgr A* core region as home: keep the Sol galaxy
    // theme / Far Outer rotation until the player has actually left BOTH
    // (heading out toward another galaxy). The radii overlap along the
    // direct Sol↔Sgr A* route, so that whole corridor stays "home".
    if (typeof camera !== 'undefined' && typeof THREE !== 'undefined') {
      const SOL_AREA_RADIUS = 6000;
      const SGRA_AREA_RADIUS = 6000;
      const lso = (typeof window !== 'undefined' && window.localSystemOffset)
        ? window.localSystemOffset : { x: 8000, y: 0, z: 4800 };
      const dSol = camera.position.distanceTo(
        new THREE.Vector3(lso.x, lso.y, lso.z));
      const dSgrA = (window.trueDistanceFromOrigin) ? window.trueDistanceFromOrigin(camera.position) : camera.position.length(); // origin = Sagittarius A*
      if (dSol < SOL_AREA_RADIUS) {
        play('galaxy7'); // Sol / local system theme
        return;
      }
      if (dSgrA < SGRA_AREA_RADIUS) {
        if (st.current !== 'farOuter1' && st.current !== 'farOuter2' &&
            st.current !== 'farOuter3') {
          play('farOuter' + (1 + Math.floor(Math.random() * 3)));
        }
        return;
      }
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

  function detectNearbyOuterSystem() {
    if (typeof outerInterstellarSystems === 'undefined' || typeof camera === 'undefined') return -1;
    // 5,000u radius — matches original outer-system orbital envelope
    // (pulsar orbits up to 3k, Borg planet orbits up to ~2.4k).
    for (let i = 0; i < outerInterstellarSystems.length; i++) {
      const sys = outerInterstellarSystems[i];
      if (!sys || !sys.position) continue;
      const d = camera.position.distanceTo(sys.position);
      if (d < 5000) return i;
    }
    return -1;
  }

  function detectOuterSystemIsBorg(idx) {
    if (typeof outerInterstellarSystems === 'undefined') return false;
    const sys = outerInterstellarSystems[idx];
    return sys && sys.userData && (sys.userData.systemType === 'borg_patrol' || sys.userData.hasBorg);
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
    // Respect the adaptive scaling instead of stomping it — the slider sets
    // the ceiling, ducking and the riser still shape what sits under it.
    // A live fade picks the new ceiling up on its very next tick.
    applyLiveVolume();
  }

  // Force a specific context (e.g. autopilot forcing boss music)
  function forceTrack(key) {
    if (!TRACKS[key]) return;
    // A forced battle track registers with the combat machine so the
    // proximity logic holds it instead of racing to replace it on the next
    // context tick — this is what smooths switchToBattleMusic()'s hand-off.
    if (key === 'bossFight' || key === 'borg' || key === 'eliteGuardians') {
      const c = st.combat;
      const rank = key === 'bossFight' ? 4 : (key === 'borg' ? 3 : 2);
      if (!c.active || rank >= c.rank) {
        c.active = true;
        c.key = key;
        c.rank = rank;
        c.enteredAt = Date.now();
        c.clearSince = 0;
        c.contactSince = Date.now();
      }
    }
    play(key);
  }

  // Ordered rotation for the Skip button.  Intentionally excludes
  // launchScreen (half-volume) and intro (cinematic cue) so every Skip
  // advances to a normal-volume gameplay track.
  const SKIP_ORDER = [
    'mainTheme',
    'galaxy0', 'galaxy1', 'galaxy2', 'galaxy3',
    'galaxy4', 'galaxy5', 'galaxy6', 'galaxy7',
    'nebula1', 'nebula2', 'nebula3', 'nebula4', 'nebula5',
    'farOuter1', 'farOuter2', 'farOuter3',
    'bossFight', 'eliteGuardians', 'borg',
  ];

  function skipCurrentTrack() {
    // Force full volume for the skipped track — the player actively
    // picked it, so don't duck it with calm-volume scaling.
    if (st.volumeScaleTimer) { clearInterval(st.volumeScaleTimer); st.volumeScaleTimer = null; }
    st.volumeScale = 1.0;
    const idx = SKIP_ORDER.indexOf(st.current);
    const next = SKIP_ORDER[(idx < 0 ? 0 : (idx + 1) % SKIP_ORDER.length)];
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
  // GAME-PAUSE HOOKS: pause keeps the track position (unlike mute/stop),
  // resume picks up exactly where the score left off.
  let _pausedByGame = false;
  function pauseAll() {
    // Stingers are one-to-three seconds long — carrying one across a pause
    // screen would be noise, so they end rather than freeze.
    stopAllStingers();
    if (st.currentEl && !st.currentEl.paused) {
      _pausedByGame = true;
      st.currentEl.pause();
    }
  }
  function resumeAll() {
    if (_pausedByGame && st.currentEl) {
      const p = st.currentEl.play();
      if (p && p.catch) p.catch(() => {});
    }
    _pausedByGame = false;
  }

  window.soundtrack = {
    pauseAll:          pauseAll,
    resumeAll:         resumeAll,
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

    // ── Adaptive mix API ────────────────────────────────────────────────────
    // notify(event[, worldPosition]) — fire the musical hit for a game beat.
    // Events: discovery · bossSpawn · missionComplete · liberation ·
    //         warpExit · threat.  Position is optional; pass a THREE.Vector3
    //         (or any {x,y,z}) and the hit is distance-attenuated and panned.
    notify:            notifyEvent,
    stinger:           playStinger,
    // playSpatial(key, position) — same thing, named for SFX call sites.
    playSpatial:       function (key, pos) { return playStinger(key, pos); },
    // Reusable falloff/pan math for any system that wants to place a sound.
    spatialGain:       spatialGain,
    spatialPan:        spatialPan,
    // Read-only mix telemetry (handy for HUD debug / tuning).
    get combat()       { return { active: st.combat.active, track: st.combat.key, rank: st.combat.rank }; },
    get intensity()    { return st.threat.nearest === Infinity ? 0 : Math.max(0, 1 - st.threat.nearest / COMBAT_RELEASE_RADIUS); },
    get mix()          { return { gain: st.fx.gain, lowpass: st.fx.lp, webAudio: wa.ok }; },
    // debugLevel() — RMS of what the score is ACTUALLY putting out right now.
    // Lazily taps an analyser off the adaptive bus (costs nothing until the
    // first call); the honest answer to "is the music audible?".
    debugLevel:        function () {
      const sting = {};
      Object.keys(STINGERS).forEach(k => {
        const el = st.stingerEls[k];
        sting[k] = el
          ? { ready: el.readyState, t: +el.currentTime.toFixed(2), vol: +el.volume.toFixed(3),
              playing: !el.paused,
              // armed = the transient itself is buffered, which is the only
              // thing that decides whether the hit fires on time.
              armed: bufferedAt(el, STINGERS[k].at), pre: el.preload,
              tries: st._warmTries[k] || 0 }
          : 'cold';
      });
      sting._pending = st.stingerPending.map(p => p.key);
      // Who owns element volume right now, and what the outgoing half of a
      // transition is doing — poll this across a play() to see that the
      // combined level never sags.
      const fade = {
        owner: st.fadeTimer ? 'ramp' : (st.fadePending ? 'pending' : 'none'),
        out: st.fadingOutKey,
        outVol: st.fadingOut ? +st.fadingOut.volume.toFixed(4) : 0,
        inVol: st.currentEl ? +st.currentEl.volume.toFixed(4) : 0,
      };
      // Equal-power check: this stays flat across the whole crossfade —
      // and stays flat EVEN WHEN THE DECODER IS DEAD, since it's built
      // entirely from .volume, which a stalled track still reports
      // correctly. It is structurally incapable of catching this class of
      // failure. `liveness` is the actual answer: is currentTime moving?
      fade.power = +Math.sqrt(fade.outVol * fade.outVol + fade.inVol * fade.inVol).toFixed(4);
      const liv = st.liveness;
      const liveness = {
        watching: liv.lastKeyWatched,
        stalled: liv.stalled,
        recovering: liv.recovering,
        stuckMs: liv.stuckSince ? (Date.now() - liv.stuckSince) : 0,
        // Ring of recently-confirmed-healthy keys (newest last), plus what
        // the second-failure rung would actually pick right now.
        goodKeys: liv.goodKeys.map(e => e.key),
        // Keys currently sitting out a post-failure cooldown (demoted).
        failedKeys: Object.keys(liv.failed).filter(k => isRecentlyFailed(k, Date.now())),
        fallbackKey: pickFallbackKey(liv.lastKeyWatched, Date.now()),
        // What the combat-context healthy-key veto is actually playing
        // right now vs. what it was asked for — divergence here means
        // playHealthy() substituted a track for a demoted one.
        combatKey: st.combat.key,
        combatSubKey: st.combat.subKey,
        combatSubKeyFor: st.combat.subKeyFor,
      };
      // Invariant: a substitution may only be standing in for a key that's
      // actually demoted right now. If combatKey isn't in failedKeys, the
      // sub-cache must have already collapsed back to combatKey itself —
      // otherwise a recovered track is being permanently shadowed by a
      // stale substitute (the Wave-5 bug this fix closes).
      //
      // This ONLY applies once a substitution has actually been resolved
      // FOR the current combat.key (subKeyFor === combatKey) — i.e. the
      // combat branch of updateMusicContext() has run at least once since
      // combat.key last changed. Until then subKey is legitimately stale/
      // unset and that is not a bug: combat.key can be set or escalated by
      // updateCombatState() (proximity-driven, runs every tick regardless)
      // while updateMusicContext() itself is held off the wheel by the
      // Skip-button's skipLockUntil gate (see top of that function) — a
      // real, reachable state (player hits Skip mid-fight), not just a
      // test artifact. Checking the invariant during that window produced
      // console.assert false positives on every debugLevel() poll.
      if (liveness.combatKey && liveness.combatSubKeyFor === liveness.combatKey &&
          !liveness.failedKeys.includes(liveness.combatKey)) {
        console.assert(liveness.combatSubKey === liveness.combatKey,
          '🎵 stale combat substitute: combatKey=%s not failed but combatSubKey=%s',
          liveness.combatKey, liveness.combatSubKey);
      }
      if (!wa.ok) {
        return { bus: null, stingers: sting, fade: fade, liveness: liveness,
                 element: st.currentEl ? st.currentEl.volume : 0,
                 paused: st.currentEl ? st.currentEl.paused : true };
      }
      if (!wa.analyser) {
        try {
          wa.analyser = wa.ctx.createAnalyser();
          wa.analyser.fftSize = 1024;
          wa.bus.connect(wa.analyser);   // tap only — not routed to output
          wa.analyserBuf = new Float32Array(wa.analyser.fftSize);
        } catch (e) { return null; }
      }
      wa.analyser.getFloatTimeDomainData(wa.analyserBuf);
      let sum = 0;
      for (let i = 0; i < wa.analyserBuf.length; i++) sum += wa.analyserBuf[i] * wa.analyserBuf[i];
      const rms = Math.sqrt(sum / wa.analyserBuf.length);
      return {
        rms: rms,
        db: 20 * Math.log10(rms + 1e-9),
        element: st.currentEl ? st.currentEl.volume : 0,
        paused: st.currentEl ? st.currentEl.paused : true,
        track: st.current,
        busGain: st.fx.gain,
        lowpass: st.fx.lp,
        fade: fade,
        liveness: liveness,
        stingers: sting,
      };
    },

    get current()      { return st.current; },
    get volume()       { return st.volume; },
    get enabled()      { return st.enabled; },
    set enabled(v)     { st.enabled = !!v; if (!v) stopAll(); },
    get muted()        { return st.muted; },

    // TEST-ONLY fault injection for the liveness watchdog: pins a track's
    // <audio>.currentTime so it reads as a genuinely frozen decoder (the
    // exact symptom updateLiveness() is watching for) without needing a
    // corrupted media file on disk for every scenario. Does nothing to
    // normal playback unless called. Not wired to any UI.
    _debugFreezeTrack: function (key, frozen) {
      const el = st.loaded[key];
      if (!el) return false;
      if (frozen) {
        if (!el.__debugFrozen) {
          const stuckT = el.currentTime;
          Object.defineProperty(el, 'currentTime', {
            configurable: true,
            get: function () { return stuckT; },
            set: function () { /* swallow seeks while frozen */ },
          });
          el.__debugFrozen = true;
        }
      } else if (el.__debugFrozen) {
        delete el.currentTime;   // restores the native prototype accessor
        delete el.__debugFrozen;
      }
      return true;
    },

    // TEST-ONLY: hold the context detector off the wheel for `ms`, exactly
    // like the real Skip button does (see the click handler below), so a
    // fault-injection test can force a specific track and watch the
    // watchdog work on it without the location-driven context tick
    // (which runs on its own ~500ms cadence outside this module) immediately
    // re-asserting a different, healthy key over it.
    _debugSkipLock: function (ms) {
      st.skipLockUntil = Date.now() + (ms || 0);
    },
  };

  // ─── Button event delegation ──────────────────────────────────────────────
  document.addEventListener('click', function handleSoundtrackButtons(e) {
    const t = e.target;
    if (!t || !t.closest) return;

    const musicBtn = t.closest('#muteBtn, #mobileMusicBtn');
    if (musicBtn) {
      e.preventDefault();
      e.stopPropagation();
      st.muted = !st.muted;
      if (st.muted) {
        stopAll();
      } else {
        updateMusicContext();
      }
      try {
        if (typeof window.resumeAudioContext === 'function') window.resumeAudioContext();
        if (typeof window.toggleMusic === 'function') window.toggleMusic();
      } catch (err) { /* ignore */ }
      return;
    }

    const skipBtn = t.closest('#skipTrackBtn, #mobileSkipTrackBtn');
    if (skipBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (st.muted) st.muted = false;
      st.skipLockUntil = Date.now() + 120000;
      try {
        if (typeof window.resumeAudioContext === 'function') window.resumeAudioContext();
      } catch (err) { /* ignore */ }
      skipCurrentTrack();
      return;
    }

    const pauseBtn = t.closest('#pauseBtn, #mobilePauseBtn');
    if (pauseBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.togglePause === 'function') window.togglePause();
      return;
    }
  }, true);
})();
