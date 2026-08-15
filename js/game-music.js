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
  const STINGER_LEVEL = 0.80;           // legacy fallback level (no Web Audio
                                         // chain available — see playStinger)
  // Real punctuation target: +10 dB over the bed's OWN running RMS, read live
  // off wa.bedAnalyser at the instant a hit fires. This is what makes a hit
  // land above the mix instead of being mixed under it as a fraction of the
  // same slider that sets the bed (the 20260810c bug) — chain.gain.gain
  // carries this, unclamped, separate from el.volume's 0..1 envelope shape.
  // Was 4: measured live (20260812 audit) that a +4dB PRE-duck target nets
  // out to a median +0.06dB (max +1.27dB) POST-duck residual — 16x below the
  // ~1dB JND, because the sidechain duck removes 1.4-3.1dB of bed on every
  // hit, and the pre-fix slice-peak divisor (see measureStingerSlice) was
  // itself landing the sustained hit 5.7-9.8dB (mean 7.8) UNDER its +4dB
  // aim. +10 is sized so the RESIDUAL — master step minus bed step, the only
  // number a listener's ear actually integrates — clears the duck AND the
  // crest-factor shortfall with room to spare, not so the pre-duck peak
  // merely looks correct on a meter.
  const STINGER_OVER_BED_DB   = 10;
  const STINGER_OVER_BED_GAIN = Math.pow(10, STINGER_OVER_BED_DB / 20);   // ≈1.585
  const STINGER_FLOOR_RMS     = 0.006;  // the game's own documented "healthy
                                         // audible" floor — target at least
                                         // this much over even when the bed
                                         // is momentarily near-silent.
  // Sane bounds on the makeup multiplier — a genuine last-resort clamp, NOT
  // a musical floor. In real play the bed sits ~0.01-0.03 RMS (st.volume is
  // 0.25 by default) while a mastered slice's own raw RMS is ~0.1-0.3, so
  // the CORRECT makeup to land +4 dB over the bed is almost always a
  // fraction well under 1 (e.g. ~0.35-0.6) — that's attenuation, not
  // amplification, because the raw slice already outweighs the target.
  // MIN used to be 0.5: higher than every realistic computed makeup, so it
  // clamped EVERY stinger to a flat 0.5 on every single fire (confirmed live
  // — see the 20260811 stinger-gain audit) regardless of the bed's measured
  // level. That is exactly the open-loop bug this file exists to close: the
  // delivered level rode each slice's own raw loudness times a constant,
  // not the bed. MIN now only guards the pathological case (bedRms misread
  // as ~0 from an analyser glitch, or a mismeasured slice) — well below the
  // realistic operating range so the closed-loop math is never overridden
  // in ordinary play.
  const STINGER_MAKEUP_MIN = 0.02;
  const STINGER_MAKEUP_MAX = 8;         // so a mismeasured slice can't clip
                                         // or vanish
  // A hit that fires before its offline slice measurement has landed (fetch
  // + decodeAudioData of the WHOLE mp3 can take a second or more; in real
  // play this window is brief — the bank starts measuring the moment the
  // Web Audio bus comes up, long before e.g. `liberation` has any chance to
  // fire — but it must still degrade gracefully) uses this as a stand-in for
  // "typical mastered-music RMS" instead of skipping the makeup gain
  // entirely, which was indistinguishable from the pre-fix under-mix.
  const STINGER_ASSUMED_RAW_RMS = 0.15; // ≈ -16.5 dBFS, a conservative guess
                                         // for mastered content
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
    // warp.  This one IS the bloom, so a full-depth duck would flatten the
    // exact moment of arrival — but going fully un-ducked (the old noDuck)
    // was measured mixing 6.1 dB UNDER the bed, i.e. not landing as a hit at
    // all. Shallow/short duck instead: enough to carve space, not enough to
    // fight the bloom it's lifting.
    warpExit:        { file: 'nebula5.mp3',          at: 4.05,  dur: 2.40, gain: 0.58, atk: 0.05, rel: 0.80, cool: 6000,  hold: 900, duck: { depth: 0.15, ms: 250 } },
    // The single most frequent beat in the game (score climbs on every
    // kill, arcade.js addKill()) gets its own light punctuation — but
    // "frequent" means small and short, not another fanfare: quiet gain,
    // a ~0.5s envelope-forced stab (the underlying file keeps playing
    // under it; the envelope just cuts it off), a short cooldown so a
    // real dogfight's kill cadence still gets punctuated per-kill instead
    // of once every several seconds. A full-depth duck at this frequency
    // would be constant pumping, not a moment — but going fully un-ducked
    // (the old noDuck) was the single largest contributor to the -12.1 dB
    // median measured on kill hits, so it gets the same shallow/short duck
    // as warpExit: just enough to carve space for THIS hit, gone before the
    // next one can turn it into pumping. Cut from a Galaxy exploration
    // track (never a combat bed — bossFight/borg/eliteGuardians — so a kill
    // hit never smears into the track that's actively crossfading under it,
    // same reasoning as bossSpawn avoiding Boss Fight.mp3) — measured the
    // largest early silence-to-hit jump (76 dB) same methodology as every
    // other slice.
    kill:            { file: 'Galaxy3.mp3',          at: 0.40,  dur: 0.50, gain: 0.55, atk: 0.02, rel: 0.28, cool: 350,   hold: 250, duck: { depth: 0.15, ms: 250 } },
  };
  const STINGER_SPACING = 900;          // ms minimum gap between ANY two hits
  // Default sidechain depth/duration: bed drops 30% for the hit's full
  // duration.  A spec may override with its own `duck: { depth, ms }` (see
  // kill / warpExit above) for a shallower, shorter carve instead of none —
  // every stinger now ducks SOMETHING; the old noDuck escape hatch is gone.
  const STINGER_DUCK    = 0.30;
  // How long a discovery keeps re-offering its bell to the mix if the hit
  // could not be delivered.  Past this the moment has gone and we stop.
  const DISCOVERY_HIT_WINDOW = 10000;

  // ─── 3. Warp riser / filter automation ────────────────────────────────────
  const FILTER_OPEN_HZ  = 20000;        // "no filter" resting position
  const FX_TAU_UP       = 0.10;         // s — fast to grab (ducks bite instantly)
  const FX_TAU_DOWN     = 0.32;         // s — slow to release (blooms breathe)
  // Reference level for the bed that a stinger's makeup gain targets (see
  // STINGER_OVER_BED_DB / currentBedRMS above). This used to be a single
  // ~350ms MEAN-tracking smoother — which aims every hit at the bed's
  // AVERAGE level, not its peaks, so a punctuation hit landed statistically
  // indistinguishable from the bed's own loudest bars (the 20260811a audit
  // measured a kill hit's peak sitting -0.26 dB UNDER the bed's own P99).
  // That was then "fixed" by swapping in a fast-attack(10ms)/slow-release
  // (400ms) PEAK follower — but a peak-hold is not an RMS reference: on real
  // mastered music (percussive, moving 10-20 dB bar to bar) the 400ms release
  // means the follower spends most of its time sitting on a stale HIGH
  // reading from the last transient, not the bed's current level. The
  // 20260811b audit measured this directly against the bed's own
  // instantaneous RMS: mean bias +4.48 dB, p90 +12.48 dB, max +55.83 dB — and
  // worse, +6.07 dB in the first 600ms after a hit fires (exactly when the
  // sidechain duck has just pulled the bed DOWN, so the follower is holding a
  // pre-duck peak against a post-duck bed). Every stinger's makeup gain was
  // being computed against a reference that could be 12-55 dB hotter than
  // what the bed actually measured at fire time, which is why the delivered
  // level scattered across a 41 dB spread instead of landing in the 4-6 dB
  // band. Fix (superseded below): no follower — currentBedRMS() read fresh,
  // directly off wa.bedAnalyser, no peak-hold, no lag, every time a
  // stinger's level was (re)computed.
  //
  // That instantaneous read was ITSELF the next bug (20260812 audit): a
  // single wa.bedAnalyser read is one ~23ms window (1024 samples), and real
  // mastered music swings ~8dB window-to-window on that timescale (measured
  // live: p50 0.025, p99 0.065 RMS). Aiming the makeup gain at whatever
  // instant computeLevel() happens to sample means the TARGET moves with the
  // bed's own fast transients, not just the delivered level — over 8 live
  // stinger onsets the master's step tracked the bed's own step at r=0.9960
  // (residuals of essentially zero: 1.27, -0.46, 0.06, 0.98, 0.81, 0.03,
  // -0.12, 0.02 dB). A hit that rides the bed's own noise floor up and down
  // in lockstep is not punctuation, it's the bed being measured twice. Fix:
  // BED_RUNNING_TAU below smooths currentBedRMS() in the POWER domain
  // (mean of RMS², since averaging the amplitude itself biases low) with a
  // ~1s time constant — long enough to average out bar-to-bar transients and
  // track the bed's SECTION-level loudness instead of its instantaneous one,
  // so a stinger's target holds still against the moment it fires instead of
  // chasing the same beat the bed just played. currentBedRMS() itself is
  // untouched (still instantaneous) and stays available as an emergency
  // fallback when the running mean hasn't primed yet (fx.bedPowerRunning < 0).
  const BED_RUNNING_TAU = 1.0;          // s — see fx.bedPowerRunning below

  // fx.bedPowerHold below (20260814 audit): BED_RUNNING_TAU's 1s SYMMETRIC
  // window is exactly what makes combat-entry stingers miss — at the instant
  // updateCombatState sets combat.key and starts the bed crossfade, the
  // running mean still describes the OUTGOING bed for another ~1s, so a
  // stinger fired on that same tick gets sized against a bed level that's
  // about to disappear. Measured live: identical stinger slice fired into a
  // bed dip vs a settled bed produced a 10.9dB sizing error from timing
  // alone. Fix is a second, ASYMMETRIC follower alongside the symmetric one:
  // fast attack (grabs a loud bed almost immediately) but slow release (a
  // bed that's merely dipped for a moment doesn't get to drag the target
  // down with it). max(running, hold) then means a stinger is always sized
  // against whichever bed — outgoing or incoming — is actually the LOUDER
  // one right now, which is the one a listener's ear is still anchored to
  // through a crossfade. A bed that's genuinely quieter for good still
  // decays the hold down to match within BED_HOLD_RELEASE_TAU.
  const BED_HOLD_ATTACK_TAU  = 0.15;    // s — fast: catch the incoming bed
  const BED_HOLD_RELEASE_TAU = 3.0;     // s — slow: don't chase a mere dip

  // fx.bedPowerFast/bedRmsFast (20260814c audit): a THIRD follower, needed
  // once live measurement showed neither of the two above is right for
  // FLOOR detection specifically. bedRmsRunning's ~1s symmetric tau takes
  // ~3s to fully recognize a step drop (too slow for the 33 documented
  // sub-second holes). bedRmsHold is actively WRONG for this: its whole
  // job is to stay latched to the LOUDEST recent moment (fast attack, 3s
  // release) so a stinger never under-sizes against a stale-quiet outgoing
  // bed — but that same latch means max(bedRmsHold, bedRmsRunning) stays
  // pinned above the floor for up to 3s of real silence after every
  // transient, which measured live as the bed-floor makeup never engaging
  // AT ALL for a full 10s sustained duck (busGain pinned at the raw duck
  // level the entire time — a total miss, not a slow one). Floor detection
  // needs the opposite bias from stinger sizing: fast in BOTH directions,
  // symmetric, no latch. BED_FAST_TAU matches FX_TAU_UP's order of
  // magnitude so the measurement isn't the bottleneck once the correction
  // fires.
  const BED_FAST_TAU = 0.15;            // s — symmetric fast EMA, floor-only

  // TIME CONSTANT NOTE: currentBedRMS() taps `wa.bus` DOWNSTREAM of the
  // gain node all three followers above ultimately feed correction logic
  // for — the "raw bed" any of them reconstructs (measured / fx.gain) is
  // only as accurate as the assumption that fx.gain was constant across the
  // follower's own memory window. A 3s-release follower reconstructs badly
  // for ~3s after any gain change (the bedRmsHold failure above); a 1s
  // follower for ~1-3s (still too slow for a sub-second hole); a 0.15s
  // follower is accurate within ~0.3-0.45s, which is the actual target.

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
    lastSwitchAt: 0,      // ms timestamp of the last real (non-no-op) play() switch

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
      duckDepth: STINGER_DUCK,  // how deep the CURRENT duck window is — per-
                                 // spec now (kill/warpExit duck shallower than
                                 // the default), so this can't be a constant.
      bedRmsRunning: -1,        // the bed's ~1s RUNNING-MEAN RMS (-1 = not
                                 // primed yet) — sqrt(bedPowerRunning),
                                 // refreshed every frame in updateWarpFx.
                                 // NOT instantaneous, and not a peak-hold
                                 // either: this went mean(350ms) → peak
                                 // follower(10ms/400ms) → raw instantaneous
                                 // read, each fixing the last approach's
                                 // failure mode and introducing the next.
                                 // Peak follower measured +4.5dB (p90 +12.5,
                                 // max +55.8) hotter than the bed's true
                                 // level (20260811b audit) because a 400ms
                                 // release just holds the last transient.
                                 // Raw instantaneous then measured the
                                 // OPPOSITE failure (20260812 audit): a
                                 // single ~23ms analyser window swings ~8dB
                                 // bar-to-bar, so the makeup-gain TARGET
                                 // chased the bed's own fast transients and
                                 // the delivered master tracked the bed's
                                 // step at r=0.9960 — no punctuation, just
                                 // the bed measured twice. bedPowerRunning
                                 // below is what breaks that lock: a ~1s
                                 // time constant is slow relative to a single
                                 // bar but fast relative to a musical
                                 // section, so the target holds still against
                                 // the moment a hit fires. What a stinger's
                                 // makeup gain actually targets N dB over.
      bedPowerRunning: -1,      // ~1s EMA of bedRms² (power, not amplitude —
                                 // averaging RMS values directly biases low).
                                 // -1 = not primed; primes directly off the
                                 // first instantaneous read instead of
                                 // ramping up from zero on cold start.
      bedPowerHold: -1,          // asymmetric fast-attack/slow-release power
                                 // follower run ALONGSIDE bedPowerRunning —
                                 // see the BED_HOLD_ATTACK_TAU/RELEASE_TAU
                                 // comment above. Exists so a stinger fired
                                 // on the SAME TICK a bed crossfade starts
                                 // (updateCombatState setting combat.key) is
                                 // sized against the incoming bed, not a
                                 // 1s-stale outgoing one. -1 = not primed.
      bedRmsHold: -1,            // sqrt(bedPowerHold); computeLevel() reads
                                 // max(bedRmsRunning, bedRmsHold).
      bedPowerFast: -1,          // ~0.15s SYMMETRIC power EMA — see the
                                 // BED_FAST_TAU comment above. Floor-makeup
                                 // reads bedRmsFast, NOT bedRmsRunning or
                                 // bedRmsHold: this is the one follower with
                                 // no bias toward the loudest recent moment,
                                 // so it doesn't mask a genuine hole.
      bedRmsFast: -1,            // sqrt(bedPowerFast).
      floorBoosting: false,      // true this frame iff the bed-floor makeup
                                 // below is actively raising gain — lets the
                                 // smoother borrow FX_TAU_UP (fast) for a
                                 // floor CORRECTION even though it's a gain
                                 // increase, which the plain "rising = fast"
                                 // rule (kg below) would otherwise route
                                 // through the slow release tau.
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
    // { key: linear RMS of that slice's [at, at+dur] window (offline-measured,
    // once), 'pending' mid-measurement, null if measurement failed }. Feeds
    // the makeup gain in playStinger() — see measureStingerSlice().
    stingerSliceRMS: {},
    // { key: AudioBuffer } — the SAME decode measureStingerSlice() already
    // does for the RMS pass, kept instead of thrown away. This is what lets
    // playStinger() fire from an AudioBufferSourceNode (sample-accurate
    // start on the Web Audio clock) instead of seeking a shared <audio>
    // element (async — currentTime often reads back 0 at play() time, so
    // the transient arrived hundreds of ms after the envelope had already
    // opened; see the 20260813 gap audit). Populated by measureStingerSlice(),
    // never populated = fall back to the <audio>-element path below.
    stingerBuf: {},
    // { key: seconds } — where inside the file the ONSET actually is, as
    // opposed to `spec.at` (the top of the whole slice window measured
    // offline). For a slice that is cut right on its transient (kill) these
    // are the same instant; for a slice cut a beat early so its attack has
    // room to breathe (warpExit, discovery) the transient can sit 0.6-0.7s
    // INTO the slice, behind a fade-in with no attack of its own — see the
    // measureStingerSlice() comment above the onset-window walk. Populated
    // there, alongside stingerSliceRMS; playStinger() starts playback from
    // THIS offset instead of spec.at so the hit actually lands on the beat
    // instead of firing at the top of a fade nobody hears as a hit.
    stingerOnsetAt: {},
    // { key: AudioBufferSourceNode } — the currently-sounding one-shot buffer
    // source for that key, if the buffer path fired it. stopStinger() halts
    // and disconnects it; a fresh node is created per fire (one-shot nodes
    // cannot be restarted).
    stingerBufSrc: {},
    // { key: { bedRms, sliceRMS, makeup, level } } from the most recent fire
    // of that key — TEST-ONLY window into the closed-loop math (debugLevel()
    // exposes it), so a live/harness readout can catch the servo silently
    // saturating at STINGER_MAKEUP_MIN/MAX instead of only seeing the
    // symptom (wrong dB-over-bed) downstream.
    stingerLastServo: {},
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
    lastScore: -1,         // gameState.score edge — see pollEvents' KILLS block

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
      escaping: false,     // true from the moment we hand off to a fallback
                            // key until THAT key proves itself — shortens the
                            // sample/stall windows so a track we just landed
                            // on as an escape hop doesn't sit through the
                            // full slow baseline before we notice it's dead
                            // too. Cleared on success (the `advanced` branch)
                            // — NOT in livenessRearm(), which runs on every
                            // ordinary key switch and would wipe it before
                            // the escape hop ever gets sampled.
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
    bus: null,        // music bed only — riser/duck automation lives here
    filter: null,
    master: null,      // bus + stinger chains summed here, then through the
                        // limiter to destination — the ONE node debugLevel()'s
                        // analyser is allowed to tap (see the 20260810c
                        // postmortem: an analyser on `bus` alone is
                        // structurally blind to stingers). Pre-limiter, so it
                        // reads the same "what did the mix ASK for" number it
                        // always has; the limiter downstream is what keeps
                        // that number from actually reaching the speakers hot.
    limiter: null,     // safety net between master and destination — measured
                        // +1.26 dBFS sample peak on master with nothing here
                        // at music volume 1.0 (bed + a +10dB-over-bed stinger
                        // sum past 0dBFS). Never relied on for the mix's
                        // actual loudness target — that's still the
                        // bed/stinger gain staging above it — this only
                        // catches the sum. Smooth gain-reduction stage; see
                        // hardClip below for the actual ceiling guarantee.
    hardClip: null,    // exact per-sample clamp after the limiter — a
                        // DynamicsCompressor alone has no lookahead, so a
                        // fast transient can still punch through its
                        // threshold before the envelope follower reacts
                        // (measured live). This is what makes "peak <=
                        // -1dBFS" an actual guarantee instead of "usually".
    bedAnalyser: null,  // small tap on `bus` ONLY, used to read the bed's live
                        // level so a stinger's makeup gain can target N dB
                        // over whatever the bed is actually doing right now.
    bedAnalyserBuf: null,
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
      // `master` sums the bed (`bus`, riser/duck automation applied) with the
      // stinger chains (their own gain, NOT subject to the bed's own duck —
      // a stinger ducking itself would be self-cancelling) and is the single
      // point that reaches the speakers. NOT through masterGain/musicGain —
      // the MP3 score has always been mixed independently of the synth layer
      // and routing it into the synth bus would silently halve its level.
      wa.master = ctx.createGain();
      wa.master.gain.setValueAtTime(1, ctx.currentTime);
      wa.bus.connect(wa.master);
      // Limiter: master's sum (bed + any stinger currently sounding, the
      // stinger unclamped by design so it can genuinely sit N dB over the
      // bed — see STINGER_OVER_BED_DB) can exceed 0dBFS. Fast attack so it
      // actually catches a stinger's own attack transient, moderate release
      // so it doesn't audibly pump the bed once the transient has passed.
      wa.limiter = ctx.createDynamicsCompressor();
      wa.limiter.threshold.setValueAtTime(-3, ctx.currentTime);
      wa.limiter.knee.setValueAtTime(0, ctx.currentTime);
      wa.limiter.ratio.setValueAtTime(20, ctx.currentTime);
      wa.limiter.attack.setValueAtTime(0.003, ctx.currentTime);
      wa.limiter.release.setValueAtTime(0.25, ctx.currentTime);
      // DynamicsCompressorNode has no lookahead, so a fast transient can
      // still punch through its threshold before the envelope follower
      // reacts — measured +0.57 dBFS sample peak live with the compressor
      // alone. A hard clip after it is the actual brick wall: exact
      // per-sample clamp (oversample 'none' — a '4x' curve can ring back
      // over the ceiling on reconstruction, defeating the guarantee this
      // exists for), floored a couple dB under the -1dBFS acceptance target
      // for margin.
      wa.hardClip = ctx.createWaveShaper();
      wa.hardClip.oversample = 'none';
      (function () {
        const ceil = Math.pow(10, -1.5 / 20);   // ≈0.841, a hair under -1dBFS
        const n = 1024;
        const curve = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * 2 - 1;
          curve[i] = Math.max(-ceil, Math.min(ceil, x));
        }
        wa.hardClip.curve = curve;
      })();
      wa.master.connect(wa.limiter);
      wa.limiter.connect(wa.hardClip);
      wa.hardClip.connect(ctx.destination);
      // TEST-ONLY: a tap on the TRUE final output (post-hardClip, exactly
      // what reaches the speakers) so a harness verifying "no clipping" can
      // measure the actual guarantee instead of trusting the pre-limiter
      // `master` tap above (which reads hotter by design — see wa.master's
      // own comment). Never used by normal playback.
      wa.outAnalyser = ctx.createAnalyser();
      wa.outAnalyser.fftSize = 1024;
      wa.hardClip.connect(wa.outAnalyser);
      wa.outAnalyserBuf = new Float32Array(wa.outAnalyser.fftSize);
      wa.ctx = ctx;
      wa.ok = true;
      Object.keys(st.loaded).forEach(k => waRoute(st.loaded[k]));
      // One-time offline RMS measurement of every stinger slice — the basis
      // for the makeup gain that lets a hit actually land above the bed
      // instead of being mixed under it as a fraction of the same slider.
      Object.keys(STINGERS).forEach(measureStingerSlice);
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
      // Into `master`, not straight to destination: that's what makes a
      // stinger visible to debugLevel()'s analyser (tapped on `master`) and
      // what lets the bed's OWN duck automation (on `bus`, upstream of here)
      // leave the stinger alone instead of self-cancelling it.
      gain.connect(wa.master || wa.ctx.destination);
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
  // Combat beds must always be allowed to cut in immediately — a fight
  // starting is never something the dwell gate below should delay. Every
  // other context switch (nebula/galaxy/outer-system/mainTheme) obeys it.
  const COMBAT_KEYS = new Set(['bossFight', 'borg', 'eliteGuardians']);
  // Minimum time a non-combat bed must have been playing before another
  // non-combat context switch is allowed to replace it. The location
  // detectors (nebula/galaxy/outer-system) re-evaluate every ~500ms and,
  // near a boundary, can flip their pick tick to tick; every flip used to
  // start a fresh 2s crossfade, so a ship clipping a boundary at speed
  // could restart the "score" every few seconds and it would never read as
  // continuous. This bounds context churn to at most one switch per
  // MIN_CONTEXT_DWELL_MS regardless of how often the detector's answer
  // changes underneath it.
  const MIN_CONTEXT_DWELL_MS = 20000;

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
    // Captured BEFORE the no-op block below can null out st.current (the
    // stalled-resume case at :877) — the dwell gate needs to know whether
    // THIS CALL is actually asking for a different track than what's
    // playing, not what st.current happens to read after that mutation.
    const isRealSwitch = key !== st.current;
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
    // Dwell gate — bounds non-combat context churn to at most one switch
    // per MIN_CONTEXT_DWELL_MS. Combat beds always cut in immediately;
    // everything else (nebula/galaxy/outer-system/mainTheme) has to wait
    // out the dwell once a real switch has happened, no matter how often
    // the location detectors flip their answer underneath it.
    if (isRealSwitch && !COMBAT_KEYS.has(key) &&
        Date.now() - st.lastSwitchAt < MIN_CONTEXT_DWELL_MS) {
      return;
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
    if (isRealSwitch) st.lastSwitchAt = Date.now();

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

  // Live level of the music BED alone (never includes a stinger, since this
  // taps `bus` — upstream of where stinger chains join at `master`). Read at
  // the instant a hit fires so its makeup gain targets "N dB over whatever
  // is actually playing right now", not a guess baked in ahead of time.
  function currentBedRMS() {
    if (!wa.ok || !wa.bus || !wa.ctx) return 0;
    if (!wa.bedAnalyser) {
      try {
        wa.bedAnalyser = wa.ctx.createAnalyser();
        // Matches debugLevel()'s master analyser fftSize (1024) on purpose —
        // an AnalyserNode's internal delay line is ~fftSize samples, so a
        // mismatched size here would read the bed and the master at two
        // subtly different instants and make short, fast stingers (kill:
        // 20ms attack) look mistimed against the bed when they are not.
        wa.bedAnalyser.fftSize = 1024;
        wa.bus.connect(wa.bedAnalyser);        // tap only — not routed to output
        wa.bedAnalyserBuf = new Float32Array(wa.bedAnalyser.fftSize);
      } catch (e) { return 0; }
    }
    try {
      wa.bedAnalyser.getFloatTimeDomainData(wa.bedAnalyserBuf);
    } catch (e) { return 0; }
    let sum = 0;
    for (let i = 0; i < wa.bedAnalyserBuf.length; i++) sum += wa.bedAnalyserBuf[i] * wa.bedAnalyserBuf[i];
    return Math.sqrt(sum / wa.bedAnalyserBuf.length);
  }

  // Same idea as currentBedRMS() but on `master` (bed + stingers summed) —
  // factored out so debugAudioTrace() below doesn't have to duplicate
  // debugLevel()'s inline analyser read.
  function currentMasterRMS() {
    if (!wa.ok || !wa.master || !wa.ctx) return 0;
    if (!wa.analyser) {
      try {
        wa.analyser = wa.ctx.createAnalyser();
        wa.analyser.fftSize = 1024;
        wa.master.connect(wa.analyser);   // tap only — not routed to output
        wa.analyserBuf = new Float32Array(wa.analyser.fftSize);
      } catch (e) { return 0; }
    }
    try {
      wa.analyser.getFloatTimeDomainData(wa.analyserBuf);
    } catch (e) { return 0; }
    let sum = 0;
    for (let i = 0; i < wa.analyserBuf.length; i++) sum += wa.analyserBuf[i] * wa.analyserBuf[i];
    return Math.sqrt(sum / wa.analyserBuf.length);
  }

  // TEST-ONLY. Not called anywhere in normal play — exists purely so an
  // external harness can get a high-resolution, jitter-free bed-vs-master RMS
  // trace across a stinger's life for gain-servo verification. Every other
  // sampling path available to a harness (repeated debugLevel() polls driven
  // by requestAnimationFrame or setInterval/setTimeout) rides the MAIN
  // thread's scheduler, which browsers throttle hard the instant a window
  // isn't the frontmost, focused, actively-compositing tab — exactly the
  // condition an automated verification browser is usually in. A
  // ScriptProcessorNode's onaudioprocess, by contrast, is driven by the audio
  // RENDERING thread, which browsers deliberately do NOT throttle in the
  // background (that's what stops audio glitching in an unfocused tab), so
  // this keeps ticking at its real block rate regardless of window focus.
  // Silently muted (routed through a zero-gain node) so it never affects
  // what's actually heard.
  function debugAudioTrace(durationMs) {
    return new Promise((resolve) => {
      if (!wa.ok || !wa.ctx || !wa.bus || !wa.master) { resolve([]); return; }
      currentBedRMS(); currentMasterRMS();   // ensure both analysers exist
      let node;
      try {
        node = wa.ctx.createScriptProcessor(1024, 1, 1);
      } catch (e) { resolve([]); return; }
      const sink = wa.ctx.createGain();
      sink.gain.setValueAtTime(0, wa.ctx.currentTime);   // silent — diagnostic only
      // Needs a REAL input feeding it, or Chrome starves onaudioprocess of
      // callbacks (observed: ~4/sec instead of ~43/sec at this bufferSize
      // with no input connected) — tap `master` in, same "connect but the
      // downstream path is silenced" pattern as the rest of this file's
      // analyser taps, so this never audibly affects the mix.
      wa.master.connect(node);
      node.connect(sink);
      sink.connect(wa.ctx.destination);
      const samples = [];
      const t0 = wa.ctx.currentTime;
      node.onaudioprocess = function () {
        const tMs = (wa.ctx.currentTime - t0) * 1000;
        let truePeak = 0;
        if (wa.outAnalyser) {
          wa.outAnalyser.getFloatTimeDomainData(wa.outAnalyserBuf);
          for (let i = 0; i < wa.outAnalyserBuf.length; i++) {
            const av = Math.abs(wa.outAnalyserBuf[i]);
            if (av > truePeak) truePeak = av;
          }
        }
        samples.push({ t: tMs, bedRms: currentBedRMS(), rms: currentMasterRMS(), gain: st.fx.gain, peak: wa.analyser ? (function(){ wa.analyser.getFloatTimeDomainData(wa.analyserBuf); let p=0; for (let i=0;i<wa.analyserBuf.length;i++){const av=Math.abs(wa.analyserBuf[i]); if(av>p)p=av;} return p; })() : 0, truePeak: truePeak });
        if (tMs >= durationMs) {
          node.onaudioprocess = null;
          try { wa.master.disconnect(node); node.disconnect(); sink.disconnect(); } catch (e) { /* ignore */ }
          resolve(samples);
        }
      };
    });
  }

  // One-time OFFLINE measurement of a stinger slice's own raw loudness across
  // exactly the [at, at+dur] window that plays, not the whole file — but as
  // its SUSTAINED envelope, not a single instantaneous peak and not its
  // whole-slice mean either. A whole-slice MEAN RMS used to be the divisor
  // here, which is wrong: what a listener hears as "the hit" is its
  // sustained body, and the mean-to-body gap (crest factor) differs per
  // slice — 4.7 dB for missionComplete, 11.7 dB for discovery, measured — so
  // normalizing to the mean let every hit overshoot by its OWN slice's crest
  // factor, an amount that scrambled the authored gain hierarchy between
  // event types instead of preserving it. A later fix swapped in a
  // 1024-sample/256-hop sliding-window MAX (matching the analyser's own
  // fftSize) — but 1024 samples is ~23ms, and the max of a 23ms window is
  // the slice's single loudest INSTANT, not what a listener integrates as
  // its loudness. Measured live (20260812 audit): that instant-peak divisor
  // sits 5.68-9.83 dB (mean 7.8) HOTTER than the slice's actual delivered
  // crest, so the servo aimed makeup gain at the loudest 23ms window while
  // the SUSTAINED hit — the part a listener actually hears land — came in
  // ~4dB UNDER the bed even though the peak read on target. Fix: measure the
  // max RMS of a ~300ms window instead of a ~23ms one. 300ms is long enough
  // to span a real transient's sustain (not just its attack spike) while
  // still short enough to find the slice's genuine loud passage rather than
  // averaging over its quiet ones — the max over that window walked across
  // [at, at+dur] is the slice's own SUSTAINED loudness, and dividing THAT
  // out of the makeup gain (see playStinger) lands the hit a listener
  // actually hears on target instead of a 23ms instant nobody perceives in
  // isolation.
  // This is what a makeup gain has to divide out: two slices at the same
  // `spec.gain` can differ by several dB in raw content, which is the "~5 dB
  // more" the 20260810c critique measured on top of the slider-fraction bug.
  //
  // The 300ms-sustained-MAX fix above still has one hole (20260813b gap
  // audit): "the slice's loudest 300ms window" is not always where the hit
  // ARRIVES. Three of these slices (warpExit, discovery, weakly bossSpawn)
  // are cut on a fade-in with no transient at the cut point at all — the
  // first 300ms measures 17.7-27.5 dB below the eventual max, and that max
  // sits 0.6-0.7s deep into the slice. Dividing by the global max is still
  // the right SIZE of makeup gain, but playing the slice from `spec.at` and
  // aiming that makeup at the LATE max means the loud, on-target part is the
  // swell tail — the moment of arrival itself plays ~17dB under target and
  // the "hit" shows up 600-700ms late. Live: warpExit measured -11.6dB in
  // the first 450ms and only caught up (+5.4dB) 450-1200ms after the fact.
  // kill is the control that shows the mechanism: its slice starts ON the
  // transient (first-300ms == max, 0.0dB), and it lands +7.4dB on-beat.
  // Fix: also record the ONSET window during the walk below — the first
  // window that gets within ONSET_WITHIN_DB of the eventual max, i.e. the
  // point the slice first becomes "the loud part" rather than a lead-in to
  // it. For a slice already cut on its transient (kill) this is window 0,
  // same as before. For a fade-in (warpExit, discovery) this walks forward
  // to just before the swell peaks, which is what actually starts sounding
  // like a hit. playStinger() then starts playback from THAT position
  // (st.stingerOnsetAt[key], not spec.at) and the servo divides by THAT
  // window's own RMS (not the global max) — so the makeup gain is now sized
  // for, and aimed at, the same instant that's actually playing first.
  // Fire-and-forget, cached in st.stingerSliceRMS[key]: 'pending' while the
  // fetch/decode is in flight, a number once measured, null if it failed (in
  // which case playStinger() falls back to the legacy el.volume-only path
  // for that key rather than dividing by an unknown).
  // ~300ms sustained window, not a ~23ms instantaneous one — see the fix
  // note above measureStingerSlice(). Expressed in seconds and converted to
  // samples per-file (below) against that file's OWN sampleRate, since a
  // fixed sample count (the old 1024/256) silently changes duration if any
  // source asset's sample rate ever differs from the analyser's assumed
  // 44.1/48kHz.
  const SLICE_SUSTAIN_WINDOW_S = 0.30;   // seconds — the body of a real hit
  const SLICE_SUSTAIN_HOP_S    = 0.075;  // seconds between window starts —
                                          // 4 windows/sec, plenty to find the
                                          // loudest sustained passage without
                                          // costing much compute
  // A window counts as "the onset" once it's within this many dB of the
  // slice's own eventual max — see the fade-in fix note above. Close enough
  // to catch a real transient's rise (kill lands on window 0, 0dB down),
  // loose enough that a slow swell's onset doesn't collapse back onto its
  // single loudest instant (which would just re-create the bug this fixes).
  const ONSET_WITHIN_DB = 3;
  const ONSET_TOLERANCE = Math.pow(10, -ONSET_WITHIN_DB / 20);

  function measureStingerSlice(key) {
    if (st.stingerSliceRMS[key] !== undefined) return;   // already going
    const spec = STINGERS[key];
    if (!spec || !wa.ctx) { st.stingerSliceRMS[key] = null; return; }
    st.stingerSliceRMS[key] = 'pending';
    const url = BASE_PATH + encodeURIComponent(spec.file);
    fetch(url)
      .then(r => r.arrayBuffer())
      .then(buf => wa.ctx.decodeAudioData(buf))
      .then(audioBuf => {
        // Cache the decode itself — this used to be thrown away the instant
        // the RMS pass below finished. Keeping it is what lets playStinger()
        // fire from an AudioBufferSourceNode instead of seeking a shared
        // <audio> element (see st.stingerBuf comment at its declaration).
        st.stingerBuf[key] = audioBuf;
        const sr = audioBuf.sampleRate;
        const startSample = Math.max(0, Math.floor(spec.at * sr));
        const endSample = Math.min(audioBuf.length, Math.floor((spec.at + spec.dur) * sr));
        const nCh = audioBuf.numberOfChannels;
        const chans = [];
        for (let c = 0; c < nCh; c++) chans.push(audioBuf.getChannelData(c));

        let maxRms = 0;
        const win = Math.max(1, Math.round(sr * SLICE_SUSTAIN_WINDOW_S));
        const hop = Math.max(1, Math.round(sr * SLICE_SUSTAIN_HOP_S));
        // Every window's own {start sample, rms} — kept (not just the
        // running max) so the onset pass below can walk them in order once
        // the eventual max is known. Cheap: at 4 windows/sec even the
        // longest slice (liberation, 3.10s) is ~12 entries.
        const windows = [];
        for (let w = startSample; w + win <= endSample; w += hop) {
          let sumSq = 0;
          for (let c = 0; c < nCh; c++) {
            const data = chans[c];
            for (let i = w; i < w + win; i++) sumSq += data[i] * data[i];
          }
          const rms = Math.sqrt(sumSq / (win * nCh));
          windows.push({ w: w, rms: rms });
          if (rms > maxRms) maxRms = rms;
        }
        let onsetSample = startSample;
        let onsetRms = maxRms;
        // Slice shorter than one whole 300ms window — every real stinger's
        // `dur` is >= 0.50s (kill, the shortest) so this shouldn't trigger
        // in practice, but guard the pathological case with a single
        // whole-slice window rather than measuring nothing. Onset collapses
        // to the slice start here — there's no room to walk forward in.
        if (maxRms === 0 && endSample > startSample) {
          let sumSq = 0, n = 0;
          for (let c = 0; c < nCh; c++) {
            const data = chans[c];
            for (let i = startSample; i < endSample; i++) { sumSq += data[i] * data[i]; n++; }
          }
          maxRms = (n > 0) ? Math.sqrt(sumSq / n) : 0;
          onsetSample = startSample;
          onsetRms = maxRms;
        } else if (windows.length > 0) {
          // Onset = the FIRST window that's already within ONSET_WITHIN_DB
          // of the eventual max — see the fade-in fix note above
          // measureStingerSlice(). For kill (transient at the cut) that's
          // windows[0] itself. For a fade-in (warpExit, discovery) this
          // walks forward past the quiet lead-in to just before the swell
          // peaks — the point that first actually sounds like the hit.
          const threshold = maxRms * ONSET_TOLERANCE;
          for (let i = 0; i < windows.length; i++) {
            if (windows[i].rms >= threshold) {
              onsetSample = windows[i].w;
              onsetRms = windows[i].rms;
              break;
            }
          }
        }
        // Servo divisor is the ONSET window's own RMS, not the global max —
        // the makeup gain now targets the same instant that plays first
        // (see st.stingerOnsetAt below), not a swell tail that hasn't
        // arrived yet when the hit is supposed to land.
        st.stingerSliceRMS[key] = (onsetRms > 0) ? onsetRms : null;
        st.stingerOnsetAt[key] = spec.at + (onsetSample - startSample) / sr;
      })
      .catch(() => { st.stingerSliceRMS[key] = null; st.stingerOnsetAt[key] = null; });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADAPTIVE MIX — stingers
  // ═══════════════════════════════════════════════════════════════════════════
  // Best known seek/start target for this key's slice: the measured ONSET
  // (st.stingerOnsetAt[key], from measureStingerSlice's fade-in fix — see
  // the comment above that function) once it has landed, spec.at otherwise
  // (before that measurement lands, or if it failed). Shared by every place
  // that seeks or checks buffering on the <audio>-element fallback path, so
  // the arm-check, the warm-park, and the actual fire-time seek all target
  // the SAME instant instead of the arm-check clearing a point upstream of
  // where fire time actually seeks to.
  function stingerFireAt(key) {
    const spec = STINGERS[key];
    if (!spec) return 0;
    const onset = st.stingerOnsetAt[key];
    return (typeof onset === 'number') ? onset : spec.at;
  }

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
      try { a.currentTime = stingerFireAt(key); } catch (e) { /* ignore */ }
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
    return bufferedAt(el, stingerFireAt(key));
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
        const fireAt = stingerFireAt(key);
        if (Math.abs(el.currentTime - fireAt) > 0.02) el.currentTime = fireAt;
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
    if (st.stingerBufSrc[key]) {
      const src = st.stingerBufSrc[key];
      try { src.stop(); } catch (e) { /* already ended — fine */ }
      try { src.disconnect(); } catch (e) { /* ignore */ }
      st.stingerBufSrc[key] = null;
    }
    const el = st.stingerEls[key];
    const spec = STINGERS[key];
    if (el) {
      el.pause();
      el.volume = 0;
      if (spec) { try { el.currentTime = stingerFireAt(key); } catch (e) { /* ignore */ } }
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
  function playStinger(key, pos, _retry, gainMul) {
    const spec = STINGERS[key];
    if (!spec) return false;
    // Hard no's: nothing is ever going to make these sound, so don't park.
    if (!st.enabled || st.muted) return false;
    if (st.stingerBroken[key]) return false;

    // Where playback actually starts. measureStingerSlice() has (by the time
    // this fires, for any key that's ever been asked for) already walked the
    // slice and found the ONSET window — the point the transient itself
    // begins, which for a slice cut on a fade-in (warpExit, discovery) can
    // sit 0.6-0.7s AFTER spec.at. Starting from spec.at there plays a silent
    // lead-in the servo (aimed at the onset's own RMS — see
    // measureStingerSlice) then over-amplifies, and the actual hit doesn't
    // arrive until the fade-in has already been running for most of a
    // second. Falls back to spec.at itself when the onset hasn't been
    // measured yet (not a number) — same as before this fix.
    const onsetAt = (typeof st.stingerOnsetAt[key] === 'number') ? st.stingerOnsetAt[key] : spec.at;

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

    // Routing. Two paths:
    //   BUFFER (primary) — measureStingerSlice() already fetches+decodes the
    //   whole file for its RMS pass; st.stingerBuf[key] is that same decode,
    //   kept instead of thrown away. Firing from it via an
    //   AudioBufferSourceNode.start(t, onsetAt, spec.dur) is sample-accurate
    //   on the Web Audio clock — no seek, so no async gap between "the
    //   envelope opens" and "the transient actually arrives". The 20260813
    //   gap audit measured 6 of 7 slices still reporting currentTime===0 at
    //   play()-time on the old <audio>-seek path — the media seek is async,
    //   so the transient landed hundreds of ms late, sometimes (kill,
    //   dur=0.50s) after the envelope had already closed. One in three live
    //   onsets carried zero stinger energy for exactly this reason.
    //   ELEMENT (fallback) — used only until the decode lands, or if it
    //   never does (decode failure, Web Audio never came up, file://). Same
    //   <audio>-element + seek path as before this fix; every liveness/
    //   fallback behavior on it is unchanged.
    waEnsure();
    const buf = st.stingerBuf[key];
    const bufReady = wa.ok && buf && typeof buf === 'object';

    let el = null;
    if (!bufReady) {
      el = stingerEl(key);
      if (!el) return false;
      // The transient must be buffered, otherwise the hit lands late — which
      // reads worse than not playing it at all.  Warm it and hold the beat:
      // canplaythrough drains the queue the instant the slice is playable.
      if (!stingerArmed(key)) {
        warmStinger(key);
        return _retry ? false : deferStinger(key, pos, now);
      }
    }

    st.stingerGateUntil = now + STINGER_SPACING;
    st.stingerNext[key] = now + (spec.cool || 6000);
    // Timestamp of the last hit that ACTUALLY sounded.  Callers with a
    // once-per-session flag compare against this instead of trusting a
    // return value, so a beat is latched when it was heard — never when it
    // was merely attempted, and never twice.
    st.stingerLastFired[key] = now;

    const sg = spatialGain(pos);
    const gm = (typeof gainMul === 'number') ? gainMul : 1;

    // The chain that will carry the makeup gain. Buffer path builds its own
    // fresh gain (+ pan) node here, since the AudioBufferSourceNode itself is
    // one-shot and gets a fresh node every fire; element path reuses the
    // persistent per-key MediaElementSource chain from waRouteStinger().
    let chain = null;
    let bufSrc = null;
    if (bufReady) {
      try {
        bufSrc = wa.ctx.createBufferSource();
        bufSrc.buffer = buf;
        const gainNode = wa.ctx.createGain();
        gainNode.gain.setValueAtTime(0, wa.ctx.currentTime);
        let panNode = null;
        if (typeof wa.ctx.createStereoPanner === 'function') {
          panNode = wa.ctx.createStereoPanner();
          panNode.pan.setValueAtTime(spatialPan(pos), wa.ctx.currentTime);
          bufSrc.connect(panNode);
          panNode.connect(gainNode);
        } else {
          bufSrc.connect(gainNode);
        }
        gainNode.connect(wa.master);
        chain = { gain: gainNode, pan: panNode };
      } catch (e) { chain = null; bufSrc = null; }
    }
    if (!chain && el) {
      chain = waRouteStinger(el);
      if (chain && chain.pan) {
        try { chain.pan.pan.setTargetAtTime(spatialPan(pos), wa.ctx.currentTime, 0.01); } catch (e) { /* ignore */ }
      }
    }

    // LEVEL.
    //  - Web Audio chain available (the normal path, either routing): el.volume
    //    (element path) or the shape×level product written straight onto
    //    chain.gain.gain (buffer path — see the envelope below) carries the
    //    0..1 attack/hold/release SHAPE. The actual output level itself is
    //    NOT capped at 1.0, so it can genuinely exceed the bed instead of
    //    being a fraction of the same slider that sets it (the 20260810c
    //    bug). Its makeup gain is `target RMS ÷ this slice's own
    //    offline-measured RMS`, where target RMS tracks the bed's LIVE
    //    running RMS (read fresh off wa.bedAnalyser, not a snapshot) at
    //    STINGER_OVER_BED_DB(+4dB), with a small per-spec offset (relDb) so
    //    relative prominence across event types (liberation > bossSpawn >
    //    kill) survives WITHOUT ever letting a low-`gain` spec (kill=0.55)
    //    get crushed back under the bed the way a straight `* spec.gain`
    //    multiply on the target would.
    //  - No Web Audio (file://, context never came up): fall back to the
    //    legacy el.volume-only peak — still capped at 1.0, unchanged from
    //    before this fix, since chain.gain doesn't exist to carry the level.
    //
    // RE-TRACKED FOR THE HIT'S WHOLE LIFE, not just at fire time. A single
    // snapshot-and-forget here was the reason an earlier version of this fix
    // (sliding-window PEAK slice measurement alone — see measureStingerSlice()
    // above) still failed live verification: a bed can move 10-20 dB within a
    // single stinger's 0.5-3.1 s life (this is real mastered music, not a
    // tone — crescendos and quiet passages happen on a beat-to-beat
    // timescale well inside that window), so a makeup gain computed once at
    // t=0 and never revisited drifts wildly out of the target band by the
    // time the hit is actually heard — measured live: -12.6 dB to +18.8 dB
    // swings on the SAME key across independent fires, undershooting under
    // the bed as often as overshooting over it. computeLevel() below is the
    // one true source of the makeup math; it's called once immediately (so
    // the attack still grabs fast) and then again every envelope tick for
    // the rest of the hit's life, each time reading the CURRENT
    // st.fx.bedRmsRunning — which updateWarpFx refreshes every frame to a
    // ~1s running-mean of the bed's level (BED_RUNNING_TAU — see the
    // constants-section comment above) — so the delivered level chases the
    // bed's SECTION-level movement instead of aiming at where the bed
    // happened to be standing when the trigger was pulled, or at a stale
    // peak-hold from before it, or at whichever 23ms window the bed's own
    // last transient happened to land on.
    let legacyPeak = 0;
    const relDb = (spec.gain - 0.75) * 4;   // ≈ -0.8..+1.0 dB — keeps every
                                             // event type inside the AAA
                                             // ~9..+11 dB punctuation band
    const targetOverBed = Math.pow(10, (STINGER_OVER_BED_DB + relDb) / 20);
    function computeLevel() {
      const sliceRMS = st.stingerSliceRMS[key];
      // max(running, hold): the running mean is right except in the first
      // ~1s after a bed crossfade starts, where it still describes the
      // OUTGOING bed. The hold follower (fast attack / slow release, see
      // BED_HOLD_ATTACK_TAU above) catches whichever bed is louder RIGHT
      // NOW, so a combat-entry stinger fired the same tick the crossfade
      // begins is sized against the bed it's actually about to play over,
      // not a stale pre-crossfade reading. A bed that's genuinely gone
      // quiet for good still pulls the hold down within ~3s.
      const bedRms = st.fx.bedRmsRunning >= 0 || st.fx.bedRmsHold >= 0
        ? Math.max(st.fx.bedRmsRunning >= 0 ? st.fx.bedRmsRunning : 0,
                   st.fx.bedRmsHold >= 0 ? st.fx.bedRmsHold : 0)
        : currentBedRMS();
      let makeup;
      if (typeof sliceRMS === 'number' && sliceRMS > 0) {
        const targetRMS = Math.max(bedRms, STINGER_FLOOR_RMS) * targetOverBed;
        makeup = targetRMS / sliceRMS;
      } else {
        // Offline measurement not ready yet (or failed) — kick it off if it
        // hasn't started, and use STINGER_ASSUMED_RAW_RMS as the divisor
        // meanwhile so the hit still lands roughly on target instead of
        // reverting to the pre-fix under-mix (targetOverBed alone, with no
        // normalization for the slice's own raw loudness, was measured
        // landing BELOW the bed for exactly this reason).
        measureStingerSlice(key);
        const targetRMS = Math.max(bedRms, STINGER_FLOOR_RMS) * targetOverBed;
        makeup = targetRMS / STINGER_ASSUMED_RAW_RMS;
      }
      const level = Math.max(STINGER_MAKEUP_MIN, Math.min(STINGER_MAKEUP_MAX, makeup)) * sg * gm;
      st.stingerLastServo[key] = {
        bedRms: +bedRms.toFixed(5),
        sliceRMS: (typeof sliceRMS === 'number') ? +sliceRMS.toFixed(5) : sliceRMS,
        makeup: +makeup.toFixed(4), level: +level.toFixed(4),
      };
      return level;
    }
    const level0 = chain ? computeLevel() : 0;
    if (chain && bufSrc) {
      // Buffer path: schedule the ATTACK as a real AudioParam ramp on the
      // Web Audio clock, right now, before the source even starts — sample-
      // accurate and immune to the main-thread stalls that hit the old
      // setInterval envelope (tickMax measured at 1629ms live). The sustain
      // and release are still driven by the 40ms tick below (so the level
      // keeps chasing the bed for the hit's whole life — see the big
      // comment above), but the attack no longer waits on that tick to even
      // begin.
      try {
        chain.gain.gain.setValueAtTime(0, wa.ctx.currentTime);
        chain.gain.gain.linearRampToValueAtTime(level0, wa.ctx.currentTime + Math.max(0.005, spec.atk));
      } catch (e) { /* ignore */ }
    } else if (chain) {
      try { chain.gain.gain.setTargetAtTime(level0, wa.ctx.currentTime, 0.01); } catch (e) { /* ignore */ }
    } else {
      legacyPeak = Math.max(0, Math.min(1, st.volume * STINGER_LEVEL * spec.gain * sg * gm));
    }

    stopStinger(key);
    if (bufSrc) {
      st.stingerBufSrc[key] = bufSrc;
      try { bufSrc.start(wa.ctx.currentTime, onsetAt, spec.dur); } catch (e) { /* ignore */ }
      // Release whatever this fire's nodes are holding once the source
      // itself has genuinely finished — stopStinger() already tears them
      // down on the envelope's own clock, this is just the backstop for a
      // node that outlives its envelope for any reason.
      bufSrc.onended = function () {
        if (st.stingerBufSrc[key] === bufSrc) st.stingerBufSrc[key] = null;
        try { bufSrc.disconnect(); } catch (e) { /* ignore */ }
        if (chain) {
          try { chain.gain.disconnect(); } catch (e) { /* ignore */ }
          if (chain.pan) { try { chain.pan.disconnect(); } catch (e) { /* ignore */ } }
        }
      };
    } else if (el) {
      try { el.currentTime = onsetAt; } catch (e) { /* ignore */ }
      el.volume = 0;
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
    }

    // Sidechain: the bed steps back under the hit and swells back after.
    // Every stinger ducks something now — `spec.duck` overrides depth/ms for
    // a shallow, short carve (kill/warpExit); anything else gets the default
    // full-duration/full-depth duck.
    {
      const duckSpec = spec.duck || { depth: STINGER_DUCK, ms: spec.dur * 1000 };
      st.fx.duckUntil = now + duckSpec.ms;
      st.fx.duckDepth = duckSpec.depth;
    }

    // Attack → hold → release envelope, 40 ms resolution.
    const STEP = 40;
    const atkMs = Math.max(STEP, spec.atk * 1000);
    const relMs = Math.max(STEP, spec.rel * 1000);
    const totalMs = spec.dur * 1000;
    const t0 = now;
    let releaseScheduled = false;   // buffer path only — schedule the release
                                     // ramp exactly once, not every tick
    st.stingerTimers[key] = setInterval(() => {
      const t = Date.now() - t0;
      let shape;   // 0..1 attack/hold/release SHAPE only
      if (t < atkMs) shape = t / atkMs;
      else if (t > totalMs - relMs) shape = Math.max(0, (totalMs - t) / relMs);
      else shape = 1;
      if (st.muted || !st.enabled) {
        if (el) el.volume = 0;
        if (bufSrc && chain) { try { chain.gain.gain.setTargetAtTime(0, wa.ctx.currentTime, 0.02); } catch (e) { /* ignore */ } }
      } else if (bufSrc && chain) {
        // Buffer path: no el.volume to hold the shape separately, so this
        // one node has to carry shape × level combined — the same product
        // the element path gets acoustically for free from el.volume(shape)
        // sitting in series with chain.gain.gain(level) in the signal chain.
        if (t < atkMs) {
          // Attack is already running as a precise ramp scheduled above —
          // don't fight it with a coarser 40ms step target.
        } else if (t <= totalMs - relMs) {
          // Sustain: keep chasing the bed's own movement for the rest of
          // this hit's life (see the big RE-TRACKED comment above) — a
          // fast-ish 80ms time constant, same as the element path.
          try { chain.gain.gain.setTargetAtTime(computeLevel(), wa.ctx.currentTime, 0.08); } catch (e) { /* ignore */ }
        } else if (!releaseScheduled) {
          releaseScheduled = true;
          const relEndS = Math.max(0.01, (totalMs - t) / 1000);
          try {
            const now2 = wa.ctx.currentTime;
            chain.gain.gain.cancelScheduledValues(now2);
            chain.gain.gain.setValueAtTime(chain.gain.gain.value, now2);
            chain.gain.gain.linearRampToValueAtTime(0, now2 + relEndS);
          } catch (e) { /* ignore */ }
        }
      } else if (chain) {
        el.volume = Math.max(0, Math.min(1, shape));
        // 80ms time constant: fast enough to follow a real phrase-to-phrase
        // swing within a couple of ticks, slow enough (vs. the 10ms initial
        // grab) that this per-tick re-aim doesn't itself become an audible
        // 25Hz zipper riding on top of the bed's own smoothing.
        try { chain.gain.gain.setTargetAtTime(computeLevel(), wa.ctx.currentTime, 0.08); } catch (e) { /* ignore */ }
      }
      else if (el) el.volume = Math.max(0, Math.min(1, legacyPeak * shape));
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
        // Fire the entry stinger BEFORE combat.key is assigned below —
        // assigning combat.key is what starts the bed crossfade (see the
        // COMBAT OVERRIDE section further down, which crossfades to
        // combat.key on its next tick), so firing first keeps the servo's
        // bed read strictly pre-crossfade. Belt-and-braces on top of the
        // bedRmsHold fast-attack/slow-release follower above, which is what
        // actually corrects the sizing once the crossfade is under way
        // (20260814 audit — combat-entry stingers were the one event class
        // measurably failing to land, sized against a bed reading that was
        // up to 1s stale exactly at the moment it mattered most).
        const entryRank = bossForced ? 4 : (t.rank || 1);
        // Every combat entry gets a transient ahead of the crossfade — the
        // score should audibly NOTICE contact, not just dissolve into a new
        // bed 2.5s later.  Severity scales the hit: a boss gets its own
        // stinger, a serious threat gets the full 'threat' stab, and a lone
        // skirmish still gets one, just pulled back so it doesn't read as
        // loud as a Borg cube.
        if (entryRank >= 4) {
          playStinger('bossSpawn', t.lead ? t.lead.position : null);
        } else if (entryRank >= 3) {
          playStinger('threat', t.lead ? t.lead.position : null);
        } else if (entryRank >= 1) {
          playStinger('threat', t.lead ? t.lead.position : null, false, 0.55);
        }
        c.active = true;
        c.enteredAt = now;
        c.clearSince = 0;
        c.rank = entryRank;
        c.key = RANK_TRACK[c.rank] || 'eliteGuardians';
      }
    } else {
      // Escalate only — a boss arriving mid-skirmish upgrades the track; a
      // grunt surviving a boss never downgrades it.
      const r = bossForced ? 4 : t.rank;
      if (r > c.rank) {
        c.rank = r;
        c.key = RANK_TRACK[r] || c.key;
        // Mark the escalation itself, not just the track swap — this is the
        // most dramatic beat in the game (grunts → BOSS) and a bare
        // crossfade buries it.
        if (r >= 4) playStinger('bossSpawn', t.lead ? t.lead.position : null);
        else if (r > 2) playStinger('threat', t.lead ? t.lead.position : null);
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

    // ── STINGER SIDECHAIN.  Depth is per-window (fx.duckDepth, set when the
    // stinger fired) — not a flat constant — so kill/warpExit's shallow
    // carve doesn't get the full-depth treatment.
    if (now < fx.duckUntil) gain *= (1 - fx.duckDepth);

    // ── BED FLOOR MAKEUP.  The stinger servo already closes this loop
    // against fx.bedRmsRunning (BED_RUNNING_TAU block, ~15 lines below —
    // one frame stale here, which is fine for a ~1s-constant follower).
    // Without this term the multiplier stack above (emergency-warp *0.82,
    // tunnel duck, stinger sidechain, bloom) has NO reference to how loud
    // the bed actually is, so it can and does mix the bed down into
    // silence on its own. Apply the same closed-loop idea to the bed
    // itself: when the bed is genuinely below the game's documented
    // "healthy audible" floor, make up the difference (capped at 4x /
    // ~12dB so a truly-silent bed doesn't get amplified into a hiss).
    //
    // 20260814b measured this half-fixed: bedRmsRunning/bedRmsHold are read
    // from currentBedRMS(), which taps `wa.bus` DOWNSTREAM of the very
    // gain node this block drives (applyFx() below). So "the bed's level"
    // as measured here is ALREADY carrying last frame's correction —
    // dividing STINGER_FLOOR_RMS by that post-gain number only ever closes
    // half the deficit per pass (equilibrium is the geometric mean of the
    // raw bed and the floor, never the floor itself), and because a rising
    // correction fed through the "rising ⇒ fast tau" rule below actually
    // picked the SLOW release tau (fx.gainT ends up < fx.gain mid-ramp on
    // a symmetric power EMA), the whole thing took ~4.5s to half-converge.
    // Fix: undo the currently-applied gain to recover the RAW bed level,
    // project it through THIS frame's target gain before comparing to the
    // floor, and size the correction against that — a one-shot fix instead
    // of a slow asymptote. fx.gain (not fx.gainT) is the multiplier that
    // was actually pushed to the audio param last frame, so it's the right
    // thing to divide out.
    //
    // Deliberately bedRmsFast here, not max(bedRmsHold, bedRmsRunning) the
    // way the stinger servo reads it (:~1710 below), and not bedRmsRunning
    // alone either. Verified live in two stages (w9r2d/w9r2e-deephole
    // probes, sustained tunnel+emergencyWarp duck ~0.246x over a genuinely
    // quiet raw bed, held 10s):
    //   1. max(bedRmsHold, bedRmsRunning) — bedRmsHold's fast-attack/SLOW-
    //      release (3s) latch, built so a stinger never under-sizes against
    //      a stale-quiet outgoing bed through a crossfade, does the OPPOSITE
    //      of what floor detection needs: it kept bedMeasured pinned above
    //      the floor for the full 10s of real silence, so the makeup NEVER
    //      engaged — busGain flat at the raw duck level the entire window.
    //      A total miss, not a slow one.
    //   2. bedRmsRunning alone (1s symmetric tau) — this DOES engage, but a
    //      1s EMA needs ~3-5s to recognize and correct a step drop, so it
    //      converged to within ~1dB of target only around the 5s mark. Real
    //      correction, but too slow for the documented 33 SUB-SECOND holes.
    //   3. bedRmsFast (0.15s symmetric tau, BED_FAST_TAU below) — same
    //      one-shot reconstruction math, but the measurement itself is no
    //      longer the bottleneck.
    const bedMeasured = fx.bedRmsFast;
    const rawBed = bedMeasured / Math.max(0.05, fx.gain);
    const projectedBed = rawBed * gain;
    const bedFloor = (rawBed > 1e-4 && projectedBed < STINGER_FLOOR_RMS)
      ? Math.min(STINGER_FLOOR_RMS / projectedBed, 4) : 1;
    gain *= bedFloor;
    fx.floorBoosting = bedFloor > 1;

    fx.gainT = Math.max(0.05, Math.min(4.0, gain));   // 1.5 cap raised to 4.0 — the bed-floor path needs headroom or it clamps away
    fx.lpT = Math.max(200, Math.min(FILTER_OPEN_HZ, lp));

    // Asymmetric smoothing: grabs fast, releases slow. A floor CORRECTION
    // also gets the fast tau even on ticks where the symmetric power EMA
    // makes fx.gainT read as not-yet-above fx.gain (floorBoosting forces
    // it) — this is the "let the boost use the fast tau" half of the fix;
    // without it the one-shot target above still arrives over 1s+ instead
    // of the ~0.1s FX_TAU_UP was already built for.
    const kg = 1 - Math.exp(-dt / ((fx.gainT < fx.gain || fx.floorBoosting) ? FX_TAU_UP : FX_TAU_DOWN));
    fx.gain += (fx.gainT - fx.gain) * kg;
    const kl = 1 - Math.exp(-dt / (fx.lpT < fx.lp ? FX_TAU_UP : FX_TAU_DOWN));
    fx.lp += (fx.lpT - fx.lp) * kl;

    // Track the bed's ~1s RUNNING-MEAN RMS — see the constants-section
    // comment above BED_RUNNING_TAU and the fx.bedRmsRunning/bedPowerRunning
    // field comments for the two failure modes this supersedes (peak
    // follower: +4.5..+55.8dB hot; raw instantaneous: makeup-gain target
    // chasing the bed's own ~23ms transients, master step correlating with
    // the bed's own step at r=0.9960). Smoothed in the POWER domain (mean of
    // RMS²) because that's what "RMS over the last second" means — averaging
    // amplitude directly instead of power biases the estimate low. First
    // read primes bedPowerRunning directly (no ramp-up-from-zero click on
    // cold start); every read after that is an exponential moving average
    // with time constant BED_RUNNING_TAU, correctly dt-scaled so this stays
    // a ~1s window regardless of the actual frame rate.
    if (wa.ok) {
      const instPower = Math.pow(currentBedRMS(), 2);
      if (fx.bedPowerRunning < 0) {
        fx.bedPowerRunning = instPower;
      } else {
        const kb = 1 - Math.exp(-dt / BED_RUNNING_TAU);
        fx.bedPowerRunning += (instPower - fx.bedPowerRunning) * kb;
      }
      fx.bedRmsRunning = Math.sqrt(Math.max(0, fx.bedPowerRunning));

      // Asymmetric hold follower — see BED_HOLD_ATTACK_TAU/RELEASE_TAU
      // comment above. Same instPower reading, different (faster-attack,
      // slower-release) time constant, so it tracks whichever bed — the one
      // crossfading OUT or the one crossfading IN — is currently the louder
      // one, instead of the running mean's 1s-stale blend of both.
      if (fx.bedPowerHold < 0) {
        fx.bedPowerHold = instPower;
      } else {
        const kh = 1 - Math.exp(-dt / (instPower > fx.bedPowerHold ? BED_HOLD_ATTACK_TAU : BED_HOLD_RELEASE_TAU));
        fx.bedPowerHold += (instPower - fx.bedPowerHold) * kh;
      }
      fx.bedRmsHold = Math.sqrt(Math.max(0, fx.bedPowerHold));

      // Fast SYMMETRIC follower — see BED_FAST_TAU / fx.bedPowerFast field
      // comments. Deliberately the same tau up and down: unlike the hold
      // follower above, this one must forget a loud moment exactly as
      // quickly as it forgets a quiet one, or it inherits the same latch
      // that made floor detection miss a sustained hole entirely.
      if (fx.bedPowerFast < 0) {
        fx.bedPowerFast = instPower;
      } else {
        const kf = 1 - Math.exp(-dt / BED_FAST_TAU);
        fx.bedPowerFast += (instPower - fx.bedPowerFast) * kf;
      }
      fx.bedRmsFast = Math.sqrt(Math.max(0, fx.bedPowerFast));
    }

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

    // KILLS — score climbs on every kill (arcade.js addKill()), and until
    // now that was the single most frequent beat in the game to get zero
    // musical acknowledgment. A raw score delta is a strictly WIDER trigger
    // than "a kill happened" (the rare megastructure-discovery bonus in
    // game-core.js also nudges score), but that bonus already fires its own
    // 'discovery' cue and is rare enough that an extra quiet stab under it
    // is not a false positive worth a second observation channel for.
    if (typeof gameState.score === 'number') {
      const score = gameState.score;
      if (st.lastScore >= 0 && score > st.lastScore) {
        playStinger('kill', null);
      }
      st.lastScore = score;
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
  const LIVENESS_SAMPLE_MS = 250;    // how often we look at currentTime
  const LIVENESS_STALL_MS  = 1500;   // no advance for this long = stalled
  // A key that has never once proven itself advancing in its CURRENT watch
  // window (liv.confirmed === false) is watched on a far tighter clock than
  // the steady-state baseline above. That baseline exists to tolerate
  // ordinary decoder jitter on a track that's already proven it plays —
  // there's no jitter history to protect on one that hasn't, so nothing is
  // lost by confirming fast. Two consecutive frozen reads ~150ms apart
  // (300ms worst case) is enough to call it dead. Before this, EVERY first
  // stall of a watch window — the literal first track of a session, or any
  // freshly-switched-to track that never gets going — sat through the full
  // 1000ms sample / 1500ms stall baseline before anything even noticed.
  // Measured: that wait alone was 82.8% of all dead-air time.
  const LIVENESS_CONFIRM_SAMPLE_MS = 150;
  const LIVENESS_CONFIRM_STALL_MS  = 150;
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

  // Shared "give up on this track, hand off to the best known-good
  // alternative" step. Used by BOTH the fast first-confirm path (a track
  // that has never once proven itself gets no same-element retry — see
  // updateLiveness) and the ordinary two-retry watchdog's second-failure
  // branch, so the demotion/fallback/hard-reload mechanics are identical
  // no matter which rung triggered the escape. Demotes BEFORE picking a
  // fallback so a later fallback walk can't land right back on the track
  // that's still frozen.
  function escapeFrom(el, key, now, reason) {
    const liv = st.liveness;
    demoteKey(key, now);
    let fallbackTarget = pickFallbackKey(key, now);
    if (!fallbackTarget && key !== LIVENESS_SAFE_BASE_KEY &&
        st.loaded[LIVENESS_SAFE_BASE_KEY] && !st.loadErrors.has(LIVENESS_SAFE_BASE_KEY) &&
        !isRecentlyFailed(LIVENESS_SAFE_BASE_KEY, now)) {
      // Every proven-healthy candidate is itself cold or in cooldown —
      // rather than cycle dead tracks, drop to the known-safest base layer.
      fallbackTarget = LIVENESS_SAFE_BASE_KEY;
    }
    console.warn('🎵 Soundtrack: ' + reason + ' "' + key + '" — ' +
                  (fallbackTarget ? 'falling back to "' + fallbackTarget + '"'
                          : 'no known-good track yet, forcing a hard reload'));
    liv.stuckSince = 0;
    liv.recovering = false;
    liv.stalled = false;
    if (fallbackTarget) {
      liv.escaping = true;
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
    // While escaping (we just handed off to a fallback track), watch it on
    // a fast clock instead of the normal slow baseline — that baseline
    // exists to tolerate ordinary decoder jitter on a track we're settled
    // on, but a track we just landed on AS an escape needs to prove itself
    // quickly so a second dead track doesn't cost a full extra cycle.
    // Same logic applies to `recovering` (we've already proven the decoder
    // is frozen and are just giving the re-issued play() its chance — no
    // reason to judge THAT on the slow baseline either) and to the moment
    // stuckSince first gets set (the sample that flags a suspected stall) —
    // once we suspect a freeze, confirming it fast beats paying the full
    // LIVENESS_SAMPLE_MS sample-granularity tax on a track already under
    // suspicion. `urgent` gates BOTH the sample cadence (sampleMs below)
    // and the judging threshold (stallMs below) — a track already under
    // suspicion must be judged on the same fast clock it's being sampled
    // on, or suspicion starts on the fast clock and then gets judged on the
    // slow one, which is its own (subtler) version of the same bug.
    const urgent = liv.escaping || liv.recovering || !!liv.stuckSince;
    // A key that has never once proven itself advancing THIS watch window
    // (liv.confirmed still false) gets the fastest clock of all — see
    // LIVENESS_CONFIRM_* above — for BOTH the pre-suspicion sample cadence
    // AND the stall threshold once suspicion is flagged. This must NOT be
    // gated on `!urgent`: the moment the fast path takes its own first
    // suspicious read, it sets stuckSince, which flips `urgent` true on
    // the very next tick — gating on `!urgent` here would silently hand
    // the stall threshold back to the 1500ms baseline one sample after
    // suspicion starts, undoing the entire point of confirming fast.
    // (`recovering` and `escaping` can only be true on a key that already
    // proved itself at some point THIS session — recovering is only ever
    // set below, after this branch has already deferred to it once
    // liv.confirmed is true; escaping is cleared the moment any key
    // proves an advance — so neither can coexist with confirmed===false
    // and there is no case this steals from the escaping/recovering path.)
    const firstConfirm = !liv.confirmed;
    const sampleMs = firstConfirm ? LIVENESS_CONFIRM_SAMPLE_MS
                    : (urgent ? 350 : LIVENESS_SAMPLE_MS);
    const stallMs = firstConfirm ? LIVENESS_CONFIRM_STALL_MS
                   : (urgent ? 500 : LIVENESS_STALL_MS);

    // Nothing to watch, or the mix is legitimately silent — a stall check
    // is meaningless there, so just re-arm the baseline.
    const shouldSound = !!(el && key && st.enabled && !st.muted &&
                            st.volume > 0 && !el.paused);
    if (!shouldSound) { livenessRearm(now, key, el ? el.currentTime : -1); return; }

    // The watched track (or which half of a fade is audible) changed under
    // us — the old currentTime baseline means nothing across that switch.
    if (liv.lastKeyWatched !== key) { livenessRearm(now, key, el.currentTime); return; }

    if (now - liv.lastSampleAt < sampleMs) return;

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
      liv.escaping = false;
      liv.confirmed = true;
      pushGoodKey(key, now);
      return;
    }

    if (!liv.stuckSince) liv.stuckSince = now;
    if (now - liv.stuckSince < stallMs) return;

    liv.stalled = true;

    if (firstConfirm) {
      // Never-confirmed track, two frozen reads ~150ms apart: that's
      // confirmed dead WITHOUT a same-element retry hop. A track that
      // hasn't proven it can produce even one sample isn't helped by
      // nudging the same element — that's what the recovering branch below
      // is for (an ESTABLISHED decoder having a hiccup). Retrying here
      // would just spend another 150-500ms re-confirming what two fast
      // reads already confirmed — this is the rung that used to be 82.8%
      // of all dead air (the slow 1000ms/1500ms baseline below, paid in
      // full before anything even noticed).
      escapeFrom(el, key, now, 'liveness stall (never confirmed) —');
      return;
    }

    if (!liv.recovering && !liv.escaping) {
      // First failure: nudge the SAME element. Most stalls are a decoder
      // hiccup on a track that is otherwise correctly armed, not a dead
      // source — re-issuing play() is the cheapest fix. Skipped entirely
      // while escaping: this element is a fallback we JUST called play()
      // on as an escape hop, so a same-element retry can never help — go
      // straight to demoting it and walking to the next candidate instead.
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
    escapeFrom(el, key, now, 'liveness recovery failed on');
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

  // Entry radius 3000u / exit radius 4200u — a Schmitt trigger.  Two clouds
  // both inside the entry radius used to resolve by ARRAY ORDER (first
  // match wins), so crossing the seam between two overlapping clouds could
  // flip the winner every tick with no distance change at all; picking the
  // NEAREST cloud instead removes that source of chatter.  The sticky exit
  // band removes the other source: riding the 3000u boundary of a single
  // cloud used to retrigger play() on every tiny in/out wobble.  Together
  // they kill the boundary-flicker class of context churn (see play()'s
  // dwell gate for the companion fix — this stops the SELECTION from
  // flapping, that stops a stable selection from restarting the bed).
  const NEBULA_ENTER_RADIUS = 3000;
  const NEBULA_EXIT_RADIUS  = 4200;
  function detectNearbyNebula() {
    if (typeof nebulaClouds === 'undefined' || typeof camera === 'undefined') return -1;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < nebulaClouds.length; i++) {
      const n = nebulaClouds[i];
      if (!n || !n.position) continue;
      const d = camera.position.distanceTo(n.position);
      if (d < bestD) { bestD = d; best = i; }
    }
    // Stay on the previously-selected cloud as long as it's still within
    // the wider exit radius, even if a different cloud is now nominally
    // nearer — that's what makes the choice sticky instead of flipping on
    // array order or a marginal distance delta.
    if (st.lastNebulaIdx >= 0) {
      const prev = nebulaClouds[st.lastNebulaIdx];
      if (prev && prev.position) {
        const dPrev = camera.position.distanceTo(prev.position);
        if (dPrev < NEBULA_EXIT_RADIUS) return st.lastNebulaIdx;
      }
    }
    return bestD < NEBULA_ENTER_RADIUS ? best : -1;
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
    // TEST-ONLY: see debugAudioTrace() above — audio-thread-driven bed/master
    // RMS trace, immune to main-thread throttling in an unfocused automation
    // window. Never called by the game itself.
    debugAudioTrace:   debugAudioTrace,
    // debugLevel() — RMS of what the score is ACTUALLY putting out right now.
    // Lazily taps an analyser off the adaptive bus (costs nothing until the
    // first call); the honest answer to "is the music audible?".
    debugLevel:        function () {
      const sting = {};
      Object.keys(STINGERS).forEach(k => {
        const el = st.stingerEls[k];
        const buf = st.stingerBuf[k];
        // servo: the closed-loop gain math from this key's last fire
        // (bedRms it targeted against, this slice's own measured RMS, the
        // resulting makeup multiplier, and the final level pushed to
        // chain.gain.gain) — makes a servo that's silently pinned at
        // STINGER_MAKEUP_MIN/MAX visible from outside the closure instead of
        // only showing up as a wrong dB-over-bed several steps downstream.
        // Populated by computeLevel() on EITHER routing path.
        const servo = st.stingerLastServo[k] || null;
        // Buffer readiness gates the route the SAME way playStinger() itself
        // decides it (bufReady checked before ever touching `el`) — an
        // <audio> element existing here does NOT mean the element path is
        // what actually fires next: warmStingerBank() creates one for every
        // key unconditionally (the fallback path's own low-latency
        // preloading), regardless of whether the buffer decode has already
        // made that element moot. Checking `el` first would report
        // 'element' for a key that's really firing sample-accurately off
        // its buffer, which is exactly backwards for what this exists to
        // show a harness.
        // onsetAt/specAt: TEST-ONLY window into the fade-in fix (see the
        // comment above measureStingerSlice()) — a harness can diff these
        // directly instead of inferring the onset shift from playback
        // timing. onsetAt is what actually gets used as the play offset;
        // specAt is the raw authored cut point it may have walked forward
        // from.
        const onsetAtDbg = st.stingerOnsetAt[k];
        const onsetDbg = (typeof onsetAtDbg === 'number') ? +onsetAtDbg.toFixed(3) : onsetAtDbg;
        if (buf && typeof buf === 'object') {
          // Buffer path (the normal case post-fix): fires sample-accurately
          // off the cached decode; `playing` reflects the live one-shot
          // AudioBufferSourceNode, if any. An <audio> element may ALSO
          // exist (warmed as a fallback that's simply unused) — irrelevant
          // to what actually sounds.
          sting[k] = { route: 'buffer', armed: true, playing: !!st.stingerBufSrc[k], servo: servo,
            onsetAt: onsetDbg, specAt: STINGERS[k].at };
        } else if (el) {
          sting[k] = { route: 'element', ready: el.readyState, t: +el.currentTime.toFixed(2), vol: +el.volume.toFixed(3),
            playing: !el.paused,
            // armed = the transient itself is buffered, which is the only
            // thing that decides whether the hit fires on time on this path.
            // Checked at the SAME offset playStinger() will actually seek
            // to (stingerFireAt) — checking spec.at here while fire time
            // seeks to the onset would report "armed" for a point upstream
            // of where playback really starts.
            armed: bufferedAt(el, stingerFireAt(k)), pre: el.preload,
            tries: st._warmTries[k] || 0,
            servo: servo, onsetAt: onsetDbg, specAt: STINGERS[k].at };
        } else {
          sting[k] = (buf === 'pending') ? 'decoding' : 'cold';
        }
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
        escaping: liv.escaping,
        // False until the watched key has advanced at least once THIS
        // watch window — gates the fast first-confirm cadence (see
        // LIVENESS_CONFIRM_* / updateLiveness). Exposed for debug/tuning
        // alongside the other rungs above.
        confirmed: liv.confirmed,
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
          // Tap `master` (bed + stingers summed), NOT `bus` (bed only) — an
          // analyser on `bus` alone is structurally blind to stingers, which
          // is exactly how a mix with zero audible hits read as "healthy"
          // for multiple rounds. See wa.master above.
          wa.master.connect(wa.analyser);   // tap only — not routed to output
          wa.analyserBuf = new Float32Array(wa.analyser.fftSize);
        } catch (e) { return null; }
      }
      wa.analyser.getFloatTimeDomainData(wa.analyserBuf);
      let sum = 0, peak = 0;
      for (let i = 0; i < wa.analyserBuf.length; i++) {
        const v = wa.analyserBuf[i];
        sum += v * v;
        const av = Math.abs(v);
        if (av > peak) peak = av;
      }
      const rms = Math.sqrt(sum / wa.analyserBuf.length);
      return {
        rms: rms,
        peak: peak,                               // TEST-ONLY: sample-peak on
                                                    // `master`, so a live
                                                    // clipping check (>= 1.0 =
                                                    // the destination is
                                                    // hard-clipping) doesn't
                                                    // need its own analyser tap
        bedRms: currentBedRMS(),                  // instantaneous
        bedRmsRunning: st.fx.bedRmsRunning,       // ~1s running-mean read —
                                                   // what a stinger's makeup
                                                   // gain actually targets
        bedRmsHold: st.fx.bedRmsHold,             // TEST-ONLY: fast-attack/
                                                   // slow-release follower —
                                                   // computeLevel() targets
                                                   // max(bedRmsRunning,
                                                   // bedRmsHold), see the
                                                   // BED_HOLD_ATTACK_TAU
                                                   // comment. Exposed so a
                                                   // harness can catch the
                                                   // crossfade-coincident
                                                   // case directly instead of
                                                   // only inferring it from
                                                   // the servo's bedRms.
        bedRmsFast: st.fx.bedRmsFast,             // TEST-ONLY: the 0.15s
                                                   // symmetric follower the
                                                   // BED FLOOR MAKEUP block
                                                   // reads — see BED_FAST_TAU.
        floorBoosting: st.fx.floorBoosting,       // TEST-ONLY: true this
                                                   // frame iff the bed-floor
                                                   // makeup is actively
                                                   // raising gain.
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
