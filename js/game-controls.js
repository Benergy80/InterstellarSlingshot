// Game Controls - Input handling, weapon systems, enemy behavior, sound, bosses, and tutorial
// ENHANCED: Advanced Combat System with Directional Damage, Enhanced Enemy AI, and Progressive Difficulty
// CLEANED: Removed stub functions, duplicate gameState, competing initialization
// RESTORED: Working audio system, UI buttons, mouse crosshair, tutorial from game-controls13.js

// Active lasers array - tracks beams that move with the ship.
// Hard-capped at 30 entries; oldest are evicted when full so the
// array can't grow unbounded during long demo sessions.
const activeLasers = [];
const LASER_ARRAY_CAP = 30;

// Pooled vectors for per-frame enemy behaviour — avoids 1000s of
// throwaway Vector3 allocations per second with 100+ enemies.
const _ebV1 = new THREE.Vector3();
const _ebV2 = new THREE.Vector3();
const _ebV3 = new THREE.Vector3();

// Global key state
const keys = {
  w: false, a: false, s: false, d: false,
  q: false, e: false, enter: false, o: false,
  shift: false, alt: false, space: false, capsLock: false,
  up: false, down: false, left: false, right: false,
  x: false, b: false, z: false
};

// Double-tap detection for W key (short energy-based boost)
const doubleTapState = {
  lastWTap: 0,
  doubleTapThreshold: 300 // ms
};

// Enhanced Audio System with Eerie Space Music (RESTORED from game-controls13.js)
let audioContext;
let masterGain;
let musicGain;
let effectsGain;

// Music system (RESTORED)
const musicSystem = {
    enabled: true,
    backgroundMusic: null,
    battleMusic: null,
    inBattle: false,
    fadeInterval: null
};

// Audio cooldown system to prevent spam
const audioCooldowns = {
    hostileContact: 0,
    targetAcquired: 0,
    achievement: 0,
    boss: 0
};

// FIX 1: Add the missing adjustMinimumSpeed function HERE
function adjustMinimumSpeed(speed) {
    if (typeof gameState !== 'undefined' && gameState.minVelocity !== undefined) {
        gameState.minVelocity = speed;
        console.log('Minimum speed adjusted to:', speed);
    }
}

// =============================================================================
// EXPLOSION MANAGER - Centralized explosion animation system
// =============================================================================
// Replaces setInterval-based explosions with game-loop integrated animations
// Fixes memory leaks, performance issues, and timing inconsistencies

const explosionManager = {
    activeExplosions: [],

    // Add a new explosion to be animated
    addExplosion(explosionData) {
        this.activeExplosions.push(explosionData);
    },

    // Update all active explosions (called from game loop)
    update(deltaTime = 16.67) {
        for (let i = this.activeExplosions.length - 1; i >= 0; i--) {
            const explosion = this.activeExplosions[i];

            // Update explosion based on type
            if (explosion.update) {
                const stillActive = explosion.update(deltaTime);

                // Remove completed explosions
                if (!stillActive) {
                    if (explosion.cleanup) {
                        explosion.cleanup();
                    }
                    this.activeExplosions.splice(i, 1);
                }
            }
        }
    },

    // Clear all explosions (for cleanup or game reset)
    clearAll() {
        this.activeExplosions.forEach(explosion => {
            if (explosion.cleanup) {
                explosion.cleanup();
            }
        });
        this.activeExplosions = [];
    }
};

// =============================================================================
// ENHANCED ENEMY AI BEHAVIORS
// =============================================================================

// UPDATED: Pursuit behavior
// Helper: Add smooth rotation to enemy based on movement trajectory
// (Enemy barrel-roll system removed — it was making distant hostiles
// scramble too often and was less important than just having them
// swarm the player. applyEnemyRotation now only banks/pitches with
// the flight path; no Z-spin overlay.)

// =============================================================================
// HOSTILE ENGINE SIGNATURE — the always-on thruster plume
// =============================================================================
// WHY THIS IS A PLUME AND NOT A "THRUSTER CONE" ANY MORE.
//
// Measured against the real framebuffer, the single thing an enemy had
// that the starfield could not also produce was... nothing. The hull is a
// diffuse-lit blob whose only bright pixels are specular hits, and the
// play area carries ~1,250 discrete L>=170 star blobs — several of which
// cover MORE pixels than a 700u enemy's entire bright footprint. A ship
// competing with that on "roundish bright patch" loses, every time.
//
// A point star cannot make an ELONGATED, SATURATED, COLOURED STREAK. That
// is the whole idea here: give every hostile a persistent engine plume
// ~1.7x its own hull length, always burning, faction-coloured, with a
// white-hot core — a form the sky never produces. Four measured failures
// close on this one change:
//   1. PRESENCE — the enemy stops losing the bright-pixel contest inside
//      its own crop box, because it now owns a shape class of its own.
//   2. FACING   — nose dark, tail incandescent. That is a monotonic
//      nose-to-tail value ramp, which is what was missing at 100-150u
//      where the hull read as a flat paper cutout.
//   3. TELEGRAPH — the hull's emissive ramp was already tone-map clipped
//      (at 700u a 1x->3.4x ramp moved measured luminance 251.4 -> 251.9,
//      i.e. nothing). The plume is additive over BLACK SKY, so it has all
//      the headroom in the world. The windup now flares the engines.
//   4. RANGE    — a per-frame angular-size floor keeps the plume at least
//      _PLUME_MIN_PX wide on screen, so it survives to 1200u+ instead of
//      collapsing into the 8 above-L180 pixels the hull used to manage.
//
// Sizing rules of thumb baked in below:
//   length  ~1.70x hull max dimension  (critic spec: 1.5-2x)
//   width   ~0.29x hull max dimension
//   always-on floor 0.80 intensity — never fully extinguishes, because
//   "the enemy stops existing when it coasts" was half the presence bug.
//
// WHY A BILLBOARD QUAD AND NOT A CONE MESH. This was built first as a pair
// of open-ended additive cones, and at 400u+ it looked right. It failed
// twice up close, both times because a cone is a HARD SURFACE:
//   - broadside at ~120u it read as two solid planks, since an additive
//     hollow cone is BRIGHTEST along its silhouette (you see through more
//     surface at a grazing angle) — the exact opposite of a plume;
//   - looked at down the exhaust axis it foreshortened into an enormous
//     opaque BAND across the whole frame.
// An axis-aligned billboard — a quad that keeps its long edge welded to the
// thrust axis but spins about that axis to face the camera — has neither
// failure mode. Its softness comes from a texture, so it has no silhouette
// at any range, and looked at end-on it degenerates to a line and vanishes,
// which is where the nozzle Sprite takes over and gives you the bright disc
// a real engine shows you when it is pointed at your face.
// =============================================================================

// Screen-space floor for the outer plume's DIAMETER, in CSS px. Below
// this the plume is widened in world space so it keeps reading at range.
const _PLUME_MIN_PX = 7.0;
// Never widen past this multiple of the plume's natural width — stops a
// far-away speck from ballooning into a lens flare. Measured, 4.0 made
// distant hostiles wear plumes visibly fatter than their own hulls, so this
// is a ceiling on ABSOLUTE width, not a taste knob: 2.2 x the old 0.29-hull
// width and 3.4 x the current 0.18-hull width are the same number of world
// units (0.63 vs 0.61 hull-widths), so trimming the plume's natural size
// deliberately did NOT trim the far-range presence floor — the 15,000u
// contact is the same size it was. The cap only ever binds past ~1,500u;
// everywhere inside that the angular-size floor picks the width and this
// value is inert.
const _PLUME_MAX_WIDEN = 3.4;

// FRAMEBUFFER px per world unit at distance `dist`, from the live
// camera/canvas. Vertical FOV is the authority (Three's
// PerspectiveCamera.fov is vertical). Deliberately measured against the
// DRAWING BUFFER height (1120x630 here), not the CSS height (1600x900) —
// the buffer is the stricter of the two, so a plume that clears the floor
// in render pixels clears it in presented pixels too.
function _plumePxPerUnit(dist) {
    if (!dist || dist <= 0) return 0;
    const cam = (typeof camera !== 'undefined' && camera) ? camera
              : (typeof gameCamera !== 'undefined' ? gameCamera : window.camera);
    if (!cam || !cam.fov) return 0;
    let h = 0;
    const r = (typeof renderer !== 'undefined' && renderer) ? renderer : window.renderer;
    if (r && r.domElement) h = r.domElement.height || r.domElement.clientHeight || 0;
    if (!h) {
        const cv = document.getElementById('gameCanvas');
        h = (cv && cv.height) || window.innerHeight || 900;
    }
    const halfSpan = Math.tan((cam.fov * 0.5) * Math.PI / 180) * dist;
    if (halfSpan <= 0) return 0;
    return (h * 0.5) / halfSpan;
}

// ONE shared unit streak geometry for every hostile in the game: a 1x1 quad
// in the XY plane whose +Y is the thrust axis (y = -0.5 is the nozzle, +0.5
// the trailing tip). Per-vertex colour does the ALONG-LENGTH falloff, the
// texture does the ACROSS-WIDTH falloff. Splitting the two axes that way is
// deliberate: the vertex ramp is driven off position.y, so it cannot be
// flipped by a UV-orientation surprise, and the texture is vertically
// uniform, so it doesn't care which way the UVs run either.
let _PLUME_UNIT_GEO = null;
function _plumeUnitGeo() {
    if (_PLUME_UNIT_GEO) return _PLUME_UNIT_GEO;
    const g = new THREE.PlaneGeometry(1, 1, 1, 12);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        // t: 0 at the nozzle (y = -0.5) -> 1 at the trailing tip.
        const t = Math.min(1, Math.max(0, pos.getY(i) + 0.5));
        // FALLOFF EXPONENT, 1.05 -> 0.75. Measured, layer by layer, at 900u
        // on the smallest hull in the game: the streak owns 2,620 of the
        // contact's 2,991 lit pixels at full thrust — it IS the plume, the
        // nozzle sprites are 239 — but it was only filling 40% of its own
        // 125x53 px footprint. At the old 1.05 the tail is down to 9% of
        // nozzle brightness by t=0.9, which is under the 8/255 floor across
        // most of the quad's width, so the back half of every spear was
        // geometry the player could not see and the framebuffer did not
        // count. Chasing that with LENGTH is what failed in round 4a:
        // 1.42 -> 1.74 (+22% quad) bought +5% lit pixels, because the extra
        // length arrived pre-faded.
        //
        // 0.75 holds the tail at 25% instead of 9% and lifts fill to ~75%,
        // which is where the thrust range finally clears its bar — and it
        // buys it as a BRIGHTER SPEAR rather than a longer one, so the
        // silhouette stays a plume instead of turning into a warp trail.
        // It still tapers (the tip is genuinely dark), it just stops
        // throwing away the middle.
        const b = Math.pow(1.0 - t, 0.75);
        col[i * 3] = b; col[i * 3 + 1] = b; col[i * 3 + 2] = b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    _PLUME_UNIT_GEO = g;
    return g;
}

// Across-width profile for the streak, baked PER FACTION COLOUR.
//
// The colour lives in the texture instead of in material.color for a
// specific measured reason. A material tint multiplies every texel equally,
// so a saturated faction hue caps the streak's luminance at whatever that
// hue is worth: a fully saturated red streak peaks at L~94 — DIMMER than
// the hull it trails, and dimmer than the sky it is supposed to beat. But
// value and saturation don't have to be the same pixels. Baking the profile
// gives the streak a WHITE-HOT CENTRE LINE (L>=220, the spec) with
// SATURATED FACTION FLANKS either side, in one object and one draw call.
// The cache is keyed by colour and the game ships about ten faction hues,
// so this is ~10 tiny textures for the whole session.
const _PLUME_TEX_CACHE = {};
function _plumeStreakTex(col) {
    const key = col.getHexString();
    if (_PLUME_TEX_CACHE[key]) return _PLUME_TEX_CACHE[key];
    const lit = col.clone().lerp(new THREE.Color(0xffffff), 0.30);
    const rgb = (c, a) => 'rgba(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) +
                          ',' + Math.round(c.b * 255) + ',' + a + ')';
    const c = document.createElement('canvas'); c.width = 64; c.height = 4;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 64, 0);
    grd.addColorStop(0.00, rgb(col, 0));
    grd.addColorStop(0.15, rgb(col, 0.32));
    grd.addColorStop(0.30, rgb(col, 0.82));
    grd.addColorStop(0.41, rgb(lit, 0.95));
    grd.addColorStop(0.50, 'rgba(255,255,255,1)');
    grd.addColorStop(0.59, rgb(lit, 0.95));
    grd.addColorStop(0.70, rgb(col, 0.82));
    grd.addColorStop(0.85, rgb(col, 0.32));
    grd.addColorStop(1.00, rgb(col, 0));
    g.fillStyle = grd; g.fillRect(0, 0, 64, 4);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    _PLUME_TEX_CACHE[key] = t; return t;
}

// Nozzle bloom. A Sprite always faces the camera, so this is the part of
// the signature that cannot be foreshortened away: head-on down the exhaust
// it IS the plume, and at extreme range it is what keeps a hostile from
// falling under a pixel.
let _PLUME_CORE_TEX = null;
function _plumeCoreTex() {
    if (_PLUME_CORE_TEX) return _PLUME_CORE_TEX;
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0.00, 'rgba(255,255,255,1)');
    grd.addColorStop(0.22, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.45, 'rgba(190,190,190,0.45)');
    grd.addColorStop(0.75, 'rgba(80,80,80,0.12)');
    grd.addColorStop(1.00, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    _PLUME_CORE_TEX = t; return t;
}

// NOSE-ON THRUST HALO — the one aspect the plume cannot render at all.
//
// WHY THIS EXISTS. Measured at 300u with same-frame readback, plume-only vs
// hull-only, idle vs full thrust: at yaw 0 the exhaust is 0 px in BOTH states
// for Klingon, Federation and Sith. Not dim — zero. The aspect gate (see
// _PLUME_ASPECT_PX_HI) deliberately turns the exhaust down to a 0.12 floor
// over the last ~30 degrees before dead ahead, and the near-range nozzle
// subordination (_PLUME_CORE_NEAR, 0.28x) multiplies into that, so what is
// left of the engine bloom head-on is both sub-pixel AND parked behind the
// entire hull, which depth-tests it away. The result is that a hostile
// burning straight at you and a hostile coasting straight at you are the
// SAME PICTURE — and "is it closing under power" is the single most
// expensive question in the game to get wrong.
//
// The gate itself is right and is not being touched. What was missing is a
// cue with the OPPOSITE geometry. A plume is a spear: it has to point
// somewhere, and pointed at the camera it degenerates to nothing. So the
// head-on read is a RING instead — engine light spilling around the hull's
// own silhouette, which is what an approaching ship with lit engines
// actually shows you. That keeps aspect readable by SHAPE rather than by
// brightness, which matters: the gate exists because head-on and astern
// were both bright blobs, and answering that with another bright blob would
// only re-break it. Spear = going away, halo = coming at you.
//
// It is hollow on purpose (nothing until 46% of the radius, peak at 72%) so
// it reads as a rim of light around the engine bay rather than as a decal
// painted across the ship, and so most of the pixels it lights are sky
// pixels the eye — and the measurement — can separate from the hull.
//
// SIZE IT OFF THE ENGINE DECK, NOT OFF THE HULL. The first cut of this was
// scaled to the hull's silhouette so the band would sit just outside the
// ship's outline. Measured at 300u that is a catastrophe of area: a ring
// hugging a silhouette has a radius comparable to the hull's bounding box,
// but the hull's LIT pixels are only ~40% of that box, so the ring outweighs
// the ship it belongs to — FX/hull came back 4.2 (Klingon) to 9.3
// (Federation) against a 1.0 ceiling. Scaled to the engine deck instead
// (nozzle separation plus a nozzle radius) it is what its name says, an
// engine glow, and its area is a fraction of the hull's by construction.
let _PLUME_NOSE_TEX = null;
function _plumeNoseHaloTex() {
    if (_PLUME_NOSE_TEX) return _PLUME_NOSE_TEX;
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0.00, 'rgba(255,255,255,0)');
    grd.addColorStop(0.46, 'rgba(255,255,255,0)');
    grd.addColorStop(0.62, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.72, 'rgba(255,255,255,1)');
    grd.addColorStop(0.86, 'rgba(255,255,255,0.34)');
    grd.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    _PLUME_NOSE_TEX = t; return t;
}

// ALARM PROFILE — the wind-up's replacement for _plumeStreakTex.
//
// WHY A SECOND PROFILE AND NOT A TINT. The thing that held every previous
// cut of the telegraph under the +25 R-B bar is CLIPPING. The streak's
// centre line is baked white and additive over black lands it at (255,255,
// 255); adding red to a pixel that is already 255 in every channel changes
// nothing at all, so a red bulb, a red halo and a red anything-else can only
// ever move the flanks, and the flanks are the dim minority of the mask.
// Measured, that ceiling was +24/255 no matter how the bulb was sized.
//
// The only way past it is to stop those pixels being white. So the wind-up
// CROSS-FADES the streak: the faction profile fades down while this one
// fades up, and this one's centre line is RED-hot (255,74,92) instead of
// white-hot. A clipped alarm pixel is (255,~120,~135) — still bright enough
// to keep the plume the loudest thing on the contact, but 110-120 points of
// R-B away from the white it replaced. Same trick as the nozzle-core lerp,
// applied to the layer that owns most of the lit pixels.
//
// It is a swap, not a multiply, for the same reason the core uses a lerp:
// multiplying a cyan faction's profile by red gives near-black, so a tint
// would make half the roster DIM on wind-up instead of changing hue.
let _PLUME_ALARM_TEX = null;
function _plumeAlarmStreakTex() {
    if (_PLUME_ALARM_TEX) return _PLUME_ALARM_TEX;
    const c = document.createElement('canvas'); c.width = 64; c.height = 4;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 64, 0);
    // Deliberately BROADER than the faction profile (0.10/0.90 shoulders vs
    // 0.15/0.85): the alarm layer has to cover every pixel the faction layer
    // lit, otherwise the uncovered rim keeps its old hue and drags the mean
    // back down — which is exactly the dilution that capped the bulb.
    grd.addColorStop(0.00, 'rgba(255,8,16,0)');
    grd.addColorStop(0.10, 'rgba(255,8,16,0.45)');
    grd.addColorStop(0.26, 'rgba(255,18,26,0.90)');
    grd.addColorStop(0.42, 'rgba(255,44,54,1)');
    grd.addColorStop(0.50, 'rgba(255,56,66,1)');
    grd.addColorStop(0.58, 'rgba(255,44,54,1)');
    grd.addColorStop(0.74, 'rgba(255,18,26,0.90)');
    grd.addColorStop(0.90, 'rgba(255,8,16,0.45)');
    grd.addColorStop(1.00, 'rgba(255,8,16,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 4);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    _PLUME_ALARM_TEX = t; return t;
}

// DRAW-BUDGET OPT-OUT. game-core.js runs an adaptive draw-call budget that,
// when the frame is over budget, suppresses the FARTHEST small-triangle
// Meshes and Sprites beyond 450u via `material.visible = false`. Its intent
// is the decorative long tail, and a plume is the exact opposite of
// decorative — it is the one hostile cue this build is betting the combat
// read on, and it matters MOST at the ranges that system culls.
//
// It caches each object's triangle count in `userData.__dbTris` and skips
// anything over CULL_TRI_MAX, so pre-seeding that field with Infinity is an
// explicit, in-contract opt-out: the plume is never even offered as a
// candidate, so there is no hide/restore tug-of-war and no candidate the
// control loop can waste a scan on. (The cone this replaced escaped the
// budget only by ACCIDENT — 224 triangles put it over CULL_TRI_MAX. The
// 24-triangle billboard did not, and vanished at range until this went in.
// Worth knowing before anyone simplifies the geometry again.)
function _plumeExemptFromDrawBudget(obj) {
    obj.userData.__dbTris = Infinity;
}

// Scratch objects for the per-frame billboard maths — allocated once, not
// per enemy per frame (there are 300+ hostiles in a live battle).
const _pbCam = new THREE.Vector3(), _pbAxis = new THREE.Vector3();
const _pbNorm = new THREE.Vector3(), _pbSide = new THREE.Vector3();
const _pbMat = new THREE.Matrix4(), _pbInv = new THREE.Matrix4();

// =============================================================================
// STARFIELD RE-GRADE — the sky was the real antagonist
// =============================================================================
// Measured in the combat framebuffer: ~1,250 discrete L>=170 star blobs in a
// 650x517 play area — 37 per 10,000px, 2.9% bright coverage — including
// several blobs covering MORE pixels than a 700u enemy's entire bright
// footprint. No hull tuning can win that; the sky simply owned the top of
// the value range and the top of the "bright blob" shape class at once.
//
// So the sky gives the top back. Two knobs on the existing field-star
// buffer (game-objects.js builds it; we only re-grade the attributes here,
// no new geometry, no new draw call):
//   aHDR — the shader's brightness multiplier. Peak fragment intensity is
//          1.3 * aHDR, and over black sky that lands at L ≈ 331 * aHDR.
//          Capping it at _STAR_HDR_CAP puts every field star at or below
//          L≈140, which is below the hostile plume's halo and far below
//          its L>=220 core. Hostiles now own the top of the range outright.
//   aPx  — screen radius. Capping it kills the fat 50-70px bokeh blobs that
//          were out-covering enemies.
// Plus: the faintest ~58% of the fill shells are extinguished outright
// (aHDR = 0 trips the shader's `if (I < 0.045) discard`, so they cost a
// vertex and nothing else). Reference frames for this genre win with a soft
// low-frequency sky and few point stars; this moves that direction without
// touching the density that gives the sky its depth.
const _STAR_HDR_CAP = 0.42;   // -> peak L ≈ 140
const _STAR_PX_CAP  = 5.0;    // screen radius ceiling, in shader px
const _STAR_DIM_CUT = 0.58;   // fraction of the faint fill extinguished

function _regradeFieldStars() {
    const fs = window.fieldStars;
    if (!fs || !fs.geometry || !fs.geometry.attributes) return false;
    const g = fs.geometry;
    if (g.userData && g.userData._regraded) return true;
    const hdr = g.attributes.aHDR;
    const px  = g.attributes.aPx;
    if (!hdr || !px) return false;

    // Debug-only A/B hook. Set window.__STAR_REGRADE_AB before the
    // starfield is built and the ungraded attributes are kept so the grade
    // can be toggled live (window.__starGradeOff() / __starGradeOn()) for
    // before/after photometry. Off by default — it costs ~420KB of typed
    // array that a player has no use for.
    if (window.__STAR_REGRADE_AB && !g.userData._rawHDR) {
        g.userData._rawHDR = Float32Array.from(hdr.array);
        g.userData._rawPx  = Float32Array.from(px.array);
        window.__starGradeOff = function () {
            hdr.array.set(g.userData._rawHDR); px.array.set(g.userData._rawPx);
            hdr.needsUpdate = px.needsUpdate = true; return 'ungraded';
        };
        window.__starGradeOn = function () {
            g.userData._regraded = false; _regradeFieldStars(); return 'graded';
        };
    }

    let killed = 0, capped = 0;
    for (let i = 0; i < hdr.count; i++) {
        let h = hdr.array[i];
        // Faint fill shells: extinguish a deterministic 58%. Deterministic
        // (index-hashed, not Math.random) so a reload grades the same sky
        // and photometry is reproducible.
        if (h * 1.3 < 0.30) {
            const r = ((i * 2654435761) % 1000) / 1000;
            if (r < _STAR_DIM_CUT) { hdr.array[i] = 0; killed++; continue; }
        }
        if (h > _STAR_HDR_CAP) { hdr.array[i] = _STAR_HDR_CAP; capped++; }
        if (px.array[i] > _STAR_PX_CAP) px.array[i] = _STAR_PX_CAP;
    }
    hdr.needsUpdate = true;
    px.needsUpdate = true;
    if (!g.userData) g.userData = {};
    g.userData._regraded = true;
    console.log('🌌 Starfield re-graded: ' + killed + ' faint stars extinguished, ' +
                capped + ' capped to L<=140 (of ' + hdr.count + ')');
    return true;
}

// The field-star buffer is built lazily inside game-objects.js, so poll for
// it instead of assuming it exists at script-eval time. Bounded so a build
// that never creates a starfield doesn't leave a timer running forever.
(function _scheduleStarRegrade() {
    let tries = 0;
    const t = setInterval(() => {
        if (_regradeFieldStars() || ++tries > 600) clearInterval(t);
    }, 250);
})();

function _ensureShipThrusterCones(ship, color) {
    if (!ship || ship.userData._thrusters) return;
    if (typeof THREE === 'undefined') return;
    // Don't measure mid-materialization (hull is at 12% scale; cones baked
    // now would be permanently undersized). Retried every tick.
    if (ship.userData._materializing) return;

    // Cone size & placement are derived from the model's ACTUAL visible
    // world bounding box, NOT from scale buckets — those broke the
    // moment enemy/boss scale changed (e.g. halving 96→48). This is
    // fully scale-agnostic: it works at any ship scale (48, 72, 96, 1
    // wingmen, the Vulcan wrapper, etc.).
    //
    // The box is built MANUALLY over real hull meshes only, skipping
    // the invisible 40u collision-hitbox sphere, the additive glow
    // layers, and any previously-attached cones — Box3.setFromObject
    // would otherwise be dominated by the giant hitbox and place the
    // cones far off the model.
    const worldScale = new THREE.Vector3();
    try { ship.getWorldScale(worldScale); } catch (e) { worldScale.set(1,1,1); }
    const sx = Math.max(0.001, Math.abs(worldScale.x || 1));
    const sz = Math.max(0.001, Math.abs(worldScale.z || 1));

    let coneLen = null, coneRad = null, localBack = null;
    let hullWideLocal = null, hullLenWorld = null;
    try {
        ship.updateWorldMatrix(true, true);
        // Measure in the SHIP'S OWN LOCAL FRAME, not in world space. The old
        // code took a world-space box and used `_box.max.z - shipZ` as the
        // local rear offset, which is only true when the ship happens to be
        // unrotated — i.e. essentially never. With a 22%-long nozzle flame
        // the resulting misplacement was a few pixels and nobody noticed;
        // with a plume 1.7 hull-lengths long it would hang the streak off
        // the wrong corner of the ship. Inverting the ship matrix costs one
        // matrix invert, once per hostile, ever.
        _pbInv.copy(ship.matrixWorld).invert();
        const _box = new THREE.Box3();
        _box.makeEmpty();
        const _mb = new THREE.Box3();
        const _lm = new THREE.Matrix4();
        let any = false;
        ship.traverse(node => {
            if (!node.isMesh || !node.geometry) return;
            const ud = node.userData || {};
            if (ud.isHitbox || ud.isGlowLayer || ud._isThrusterCone ||
                ud._isHullRead) return;
            if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
            if (!node.geometry.boundingBox) return;
            _lm.multiplyMatrices(_pbInv, node.matrixWorld);
            _mb.copy(node.geometry.boundingBox).applyMatrix4(_lm);
            _box.union(_mb);
            any = true;
        });
        if (any && isFinite(_box.min.x) && _box.max.x > _box.min.x) {
            // _box is in ship-local units; multiply by the ship's world scale
            // to reason about screen size, divide back out to place children.
            const size = _box.getSize(new THREE.Vector3());
            const worldLen = Math.max(size.x, size.y, size.z) * sx;
            // Guard against the not-yet-loaded case: _makeWingman (and the
            // enemy builders) fall back to a tiny ~16u placeholder mesh when
            // the GLB isn't cached yet. Measuring that bakes permanent
            // micro-cones (invisible). The old guard required >40u, but the
            // 50%-enemy-scale change left REAL GLB hulls at ~12-16u world
            // (Enemy*.glb natives are ~0.3u × scale 48), so the guard
            // rejected every standard enemy and cones silently vanished.
            // GLB ships are Groups / multi-child, placeholders are a single
            // Mesh + glow child — use structure + a lower floor instead.
            const _isGLBStruct = ship.isGroup || (ship.children && ship.children.length > 1);
            if (worldLen > 40 || (_isGLBStruct && worldLen > 8)) {
                // +Z-nosed models (Enemy1/Enemy8) are corrected at model
                // build time (_applyNoseFlip in game-models.js), so the
                // uniform +Z rear mount is right for every ship.
                ship.userData._thrusterApexSign = 1;
                localBack = _box.max.z;
                // PLUME, not nozzle flame — and not a COMET either. Was 22%
                // of ship length / 6% radius, which is a 3-4px smudge at
                // 700u that the starfield eats alive; that got answered with
                // 170% length / 29% width, and THAT overshot into the
                // opposite failure: measured live at combat range with the
                // plume children toggled inside one JS task, the exhaust was
                // 1.8x to 5.8x the hull's own lit pixels (283u: hull 1,112 px
                // vs plume 6,444 px — 87% of the whole contact). The hostile
                // read as a comet with a ship stuck on the front, and every
                // cue layered on top of it inherited that: the head-on aspect
                // gate did not dim a contact, it DELETED one, and a telegraph
                // that rides the plume had nothing to ride nose-on.
                //
                // 85% length / 18% width is the plume the hull can carry: a
                // real elongated streak (still 1.34 hull-lengths at full
                // thrust after the envelope below), still a SHAPE the sky
                // cannot counterfeit, but now a MINORITY of the contact. The
                // contrast that comes off it is not thrown away — it moves
                // onto the hull, in _ensureHullReadout: a saturated faction
                // rim, nav lights and a hull lamp, all aspect-independent.
                // Absolute floors keep the small 12-16u wingman-class hulls
                // from getting a sub-pixel wisp.
                //
                // THE RADIUS FLOOR WAS 2.0 AND IT IS WHY SMALL HULLS FARED
                // WORST. It is an ABSOLUTE world-space floor sitting under a
                // term that is 9% of hull length, so it only binds on hulls
                // under ~22u — and on exactly those hulls it decouples plume
                // width from ship size entirely: the plume stops shrinking
                // while the hull keeps shrinking. Measured, that is the whole
                // reason the wingman-class hulls scored FX/hull 3.97-7.73
                // against 2.38-2.51 for a large hull at the same range, and
                // 93.5-100% hull coverage — the identical plume was being
                // hung off a third of the ship. The angular-size floor
                // (_PLUME_MIN_PX / `widen`, applied per-frame in screen space
                // further down) is the CORRECT place to guarantee a distant
                // contact stays visible, because it is keyed to how big the
                // thing actually is on screen; this world-space floor was a
                // second, blind copy of that job. Halved to 1.0 so it still
                // catches a degenerate near-zero measurement without
                // out-sizing the ship it belongs to.
                coneLen = Math.max(worldLen * 0.85, 18) / sx;
                coneRad = Math.max(worldLen * 0.09, 1.0) / sx;
                hullWideLocal = Math.max(size.x, 0.001);
                hullLenWorld = worldLen;
                // Local-frame hull box, kept for _ensureHullReadout so the
                // rim/nav-light rig does not pay for a second traverse.
                ship.userData._plumeLocalBox = {
                    minx: _box.min.x, miny: _box.min.y, minz: _box.min.z,
                    maxx: _box.max.x, maxy: _box.max.y, maxz: _box.max.z
                };
            }
        }
    } catch (e) {}
    // Not hydrated yet (no hull meshes / too small) — bail; this runs every
    // frame so it retries next tick. The _thrusters early-out means once
    // attached we never re-measure, so we must wait for a real size first.
    if (coneLen === null || localBack === null ||
        !isFinite(localBack) || !isFinite(coneLen)) return;

    // COLOUR. The core is the faction hue dragged 25% toward white so it
    // still reads hot at the nozzle without pinning at (255,255,255) — that
    // was the second half of the comet problem: at a 68% white drag the
    // measured plume p90 luminance was 251-255 (clipped white) against a
    // hull median of 113-207, so the exhaust won on BRIGHTNESS as well as
    // area and the faction hue was clipped out of existence at the very
    // pixels the player looks at. 25% keeps the "hot metal" read as a
    // saturated hue rather than as white paint. The halo stays FULLY
    // saturated faction colour, because
    // saturation is the other axis the starfield can't contest: field
    // stars are white/blue-white/gold, so a saturated red, violet or
    // green streak is unmistakably a made thing, not sky.
    const _base = new THREE.Color(color === undefined ? 0xff5522 : color);
    const coreCol = _base.clone().lerp(new THREE.Color(0xffffff), 0.25);
    const haloCol = _base.clone();
    // Saturation floor: a few factions ship a washed-out pastel tint that
    // would land right on top of a warm field star. Push them back out.
    const _hsl = { h: 0, s: 0, l: 0 };
    haloCol.getHSL(_hsl);
    haloCol.setHSL(_hsl.h, Math.max(_hsl.s, 0.85), Math.min(Math.max(_hsl.l, 0.50), 0.64));

    const _apex = ship.userData._thrusterApexSign || 1;

    // STREAK — the axis-aligned billboard quad. Its centre sits half a
    // plume aft of the hull's rear edge so the hot end stays welded to the
    // nozzle and the tail trails away behind. Orientation about the thrust
    // axis is re-solved every frame in _updateShipThrusterCones.
    function _makeStreak(halfWidth, len, col, zOff, opacity) {
        const mat = new THREE.MeshBasicMaterial({
            // White tint — the faction colour is already baked into the
            // profile texture (see _plumeStreakTex); tinting again here
            // would drag the white-hot centre line back down to the hue's
            // own luminance, which is the whole thing that profile exists
            // to avoid.
            color: 0xffffff, map: _plumeStreakTex(col),
            transparent: true, opacity: opacity,
            blending: THREE.AdditiveBlending, depthWrite: false,
            side: THREE.DoubleSide, vertexColors: true
        });
        const m = new THREE.Mesh(_plumeUnitGeo(), mat);
        // Unit quad is 1x1 in XY with +Y as the thrust axis, so base scale
        // is (width, length, 1).
        m.userData._plumeBaseScale = new THREE.Vector3(halfWidth * 2, len, 1);
        m.userData._plumeBaseOpacity = opacity;
        m.userData._plumeWorldRad = halfWidth * sx;  // for the on-screen px floor
        m.userData._plumeZ = zOff;
        m.scale.copy(m.userData._plumeBaseScale);
        m.position.set(0, 0, zOff);
        // Frustum-cull plumes: when the ship is off-screen they are
        // invisible anyway, so skip the additive overdraw.
        m.frustumCulled = true;
        m.renderOrder = 80;
        m.userData._isThrusterCone = true;  // excluded from hull box
        m.userData._plumeIsStreak = true;
        _plumeExemptFromDrawBudget(m);

        // ALARM LAYER, parented to the streak at IDENTITY. Being a child is
        // the whole trick: the streak's per-frame length/width scale, its
        // re-anchoring slide along the thrust axis and its axis-aligned
        // billboard quaternion are all solved once, in _updateShipThrusterCones,
        // and this layer inherits every one of them for free. Any other
        // arrangement (a sibling, a separate list) means keeping two
        // transforms in sync every frame for every hostile, and one of them
        // eventually drifts.
        const amat = new THREE.MeshBasicMaterial({
            color: 0xffffff, map: _plumeAlarmStreakTex(),
            transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, depthWrite: false,
            side: THREE.DoubleSide, vertexColors: true
        });
        const alarmQuad = new THREE.Mesh(_plumeUnitGeo(), amat);
        alarmQuad.visible = false;          // costs nothing until a shot charges
        alarmQuad.renderOrder = 83;         // over the streak, under the bulb
        alarmQuad.frustumCulled = false;    // parent's scale drives it; cull with the parent
        alarmQuad.userData._isThrusterCone = true;
        _plumeExemptFromDrawBudget(alarmQuad);
        m.add(alarmQuad);
        m.userData._plumeAlarmQuad = alarmQuad;
        return { mesh: m, mat: mat };
    }

    // CORE — the nozzle bloom. A Sprite, so it is immune to foreshortening:
    // this is what you see when a hostile is pointing its engines at you,
    // and what survives when the streak is a sub-pixel sliver at 1,200u.
    function _makeCore(rad, col, zOff, opacity) {
        const mat = new THREE.SpriteMaterial({
            color: col, map: _plumeCoreTex(),
            transparent: true, opacity: opacity,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const s = new THREE.Sprite(mat);
        s.userData._plumeBaseScale = new THREE.Vector3(rad * 2, rad * 2, 1);
        s.userData._plumeBaseOpacity = opacity;
        s.userData._plumeWorldRad = rad * sx;
        s.scale.copy(s.userData._plumeBaseScale);
        s.position.set(0, 0, zOff);
        s.renderOrder = 81;
        s.userData._isThrusterCone = true;
        _plumeExemptFromDrawBudget(s);
        return { mesh: s, mat: mat };
    }

    // Two side-by-side engine plumes. Nozzle separation is driven by HULL
    // WIDTH, not by plume width — at 29% of hull length the old
    // `coneRad * 1.2` splayed the nozzles wider than the ship they belong to.
    const back = localBack + _apex * coneLen * 0.5;
    const cones = [];
    const sideOff = Math.min(coneRad * 1.05, (hullWideLocal || coneRad * 2) * 0.20);
    [-sideOff, sideOff].forEach(xOff => {
        // Index parity matters: the update loop treats even = core,
        // odd = streak, and reads _thrusters[1] for the px floor.
        // The core sprite deliberately overlaps the first fifth of the
        // streak: additive, that overlap is what clips the nozzle to
        // white-hot while the streak keeps its faction hue further aft —
        // the "hot metal into coloured exhaust" gradient, for free, with no
        // third layer of geometry to pay for.
        const core = _makeCore(coneRad * 1.15, coreCol,
                               localBack + _apex * coneRad * 0.55, 0.95);
        core.mesh.position.x = xOff;
        ship.add(core.mesh);
        cones.push(core);
        // STREAK HALF-WIDTH IS 0.85 coneRad, NOT coneRad. The core sprite is
        // the layer that was eating the hull (see _PLUME_CORE_NEAR), and
        // subordinating it alone lands hull COVERAGE at ~52% — just over the
        // 50% bar, with the residual overlap coming off the streak's flanks
        // where they pass the hull's rear quarter. A 15% trim of the half-
        // width takes those flank pixels back without touching the streak's
        // LENGTH, which is the part that reads as motion and as "which way is
        // it going" — the two things this layer exists to say. Note this also
        // feeds `_plumeWorldRad`, so the angular-size floor and the aspect
        // gate both see the narrower plume and engage 15% earlier in range,
        // which is self-correcting rather than a far-range loss.
        const streak = _makeStreak(coneRad * 0.85, coneLen, haloCol, back, 1.0);
        streak.mesh.position.x = xOff;
        ship.add(streak.mesh);
        cones.push(streak);
    });
    // ── ALARM BULB: the telegraph's OWN channel ──────────────────────────
    //
    // WHY THIS EXISTS. Before it, "about to shoot" and "burning hard" were
    // the SAME cue wearing different amounts of itself: winding up just made
    // the existing plume brighter and fatter. Measured at 1,200u, the mean
    // colour of the lit region moved from RGB(157,115,125) to (183,133,143)
    // across the whole 0->1 charge — a +26 brightness lift with the hue
    // essentially untouched (R-B balance +32 -> +40). Brightness is the axis
    // the plume ALREADY spends on thrust, so the telegraph was invisible
    // underneath it.
    //
    // Hue is the free axis, and it has to be ADDED, not tinted. Tinting the
    // existing plume is multiplicative: it works for a red faction and turns a
    // cyan faction BLACK (multiplying near-zero red by more red is still
    // zero), so the wind-up would dim half the roster. A dedicated additive
    // sprite adds red where there was none, so the swing is in the same
    // direction for every faction in the game.
    //
    // It is a single Sprite (not one per nozzle), parked between the engines,
    // and it is `visible = false` whenever charge is ~0 — which is almost
    // always — so a hostile that is not winding up pays nothing for it.
    //
    // THE BULB IS HALF THE ANSWER. Measured on a clean same-frame readback
    // against dark sky (116u hull, 400/900/1,200u), the bulb on its own moved
    // the lit region's R-B balance by +23 to +24/255 — real, but short of the
    // +25 bar, because it lights a HALO around a nozzle whose own core stays
    // white-hot, and those white core pixels are the brightest ones in the
    // mask and dominate any mean taken over it. The other half is the core
    // lerp in _updateShipThrusterCones, which walks the nozzle itself off
    // white. Bulb + core together: +28.5 to +32 on each state's own lit
    // region, +42 on a fixed region measured in both states.
    //
    // ROUND 5 — A WARNING LIGHT MAY NOT BE HIDDEN BY THE THING IT WARNS YOU
    // ABOUT. The bulb sits on the engine deck, and SpriteMaterial depth-tests
    // by default, so a hostile pointing its nose at you — the ONE aspect on
    // which "it is about to shoot" is a decision the player has to make in the
    // next half second — had its entire telegraph behind its own hull.
    // Measured charge-0 -> charge-1 R-B swing, pooled over the contact:
    // +49.0 broadside, +22.8 nose-on. Turning depthTest off costs nothing at
    // rest (the sprite is `visible = false` below 2% charge, which is where a
    // hostile lives almost all the time) and makes the wind-up the same
    // strength from every aspect, which is what a telegraph is for.
    const alarm = new THREE.Sprite(new THREE.SpriteMaterial({
        color: _PLUME_ALARM, map: _plumeCoreTex(),
        transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
    }));
    alarm.userData._plumeAlarmRad = coneRad;
    alarm.position.set(0, 0, localBack + _apex * coneRad * 0.55);
    alarm.scale.set(coneRad * 2, coneRad * 2, 1);
    alarm.visible = false;
    alarm.renderOrder = 82;
    alarm.userData._isThrusterCone = true;
    _plumeExemptFromDrawBudget(alarm);
    ship.add(alarm);
    ship.userData._plumeAlarmSprite = alarm;

    // ── NOSE-ON THRUST HALO ──────────────────────────────────────────────
    // See _plumeNoseHaloTex for why this shape and not a brighter plume.
    // Three properties do the work, and each is load-bearing:
    //
    //   depthTest FALSE — the whole failure being fixed is that the engine
    //     bloom is BEHIND the hull at this aspect. A cue that the hull can
    //     hide is not a cue at this aspect; same reasoning as the alarm
    //     bulb above, and it costs nothing at rest because the sprite is
    //     `visible = false` everywhere outside the nose-on hemisphere.
    //   SIZED OFF THE ENGINE DECK. `sideOff` is the nozzle separation and
    //     coneRad*1.15 is a nozzle, so their sum is the half-width of the
    //     lit engine bay — the thing that is actually glowing. See
    //     _plumeNoseHaloTex for what happened when this was keyed to the
    //     hull silhouette instead.
    //   ONE sprite, not one per nozzle. Two overlapping rings just make a
    //     brighter ring with a lumpy rim.
    // ...BUT NEVER WIDER THAN THE SHIP'S OWN HEAD-ON CROSS-SECTION. Both
    // terms of the deck width derive from `coneRad`, which is 9% of the
    // hull's LONGEST dimension — normally its length. This layer only ever
    // renders NOSE-ON, where the silhouette is width x height and length is
    // invisible, so on a sufficiently slender hull the deck estimate could
    // outgrow the ship the player can actually see.
    //
    // Measured across all eight factions, this clamp does NOT currently bind
    // on any shipped model — the band lands at a uniform 0.36 of the hull's
    // cross-section half-width, comfortably inside the silhouette. It is
    // kept as a cheap guard on the one input that could make this layer
    // absurd (a model whose length dwarfs its frontal area), not as a knob:
    // if it ever starts binding, that is the signal that a new model needs
    // looking at, not that this number needs tuning.
    const _lb = ship.userData._plumeLocalBox;
    const _crossHalf = _lb
        ? 0.5 * Math.max(_lb.maxx - _lb.minx, _lb.maxy - _lb.miny)
        : (hullWideLocal || coneRad * 2) * 0.5;
    const _engHalf = Math.max(
        Math.min(sideOff + coneRad * 1.15, _crossHalf * 1.15), coneRad * 0.6);
    const nose = new THREE.Sprite(new THREE.SpriteMaterial({
        color: haloCol.clone(), map: _plumeNoseHaloTex(),
        transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
    }));
    nose.userData._plumeNoseRad = _engHalf * _PLUME_NOSE_R;
    nose.userData._plumeNoseCol = haloCol.clone();
    // Centred on the engine deck: between the two nozzles, at their own z.
    nose.position.set(0, 0, localBack + _apex * coneRad * 0.55);
    nose.scale.set(nose.userData._plumeNoseRad * 2, nose.userData._plumeNoseRad * 2, 1);
    nose.visible = false;
    // Under the streak (80) and the nozzle cores (81): on the rare frames
    // where both are alive — the hand-back band at survey range — the real
    // plume is still the thing on top.
    nose.renderOrder = 79;
    nose.userData._isThrusterCone = true;
    _plumeExemptFromDrawBudget(nose);
    ship.add(nose);
    ship.userData._plumeNoseHalo = nose;

    ship.userData._thrusters = cones;
    ship.userData._plumeApex = _apex;
    // Start at the always-on floor rather than 0 so a hostile that spawns
    // already coasting never gets a dark frame.
    ship.userData._thrusterIntensity = 0.80;
    ship.userData._plumeHullLen = hullLenWorld || 0;
    ship.userData._plumeSx = sx;
}

// =============================================================================
// HULL READOUT — the ship has to out-read its own exhaust
// =============================================================================
// Measured, live, at combat range with the plume children toggled inside a
// single JS task (so scene time and starfield are bit-identical between the
// two readbacks):
//
//     283u   hull 1,112 px   plume 6,444 px   (plume = 87% of the contact)
//     508u   hull 2,305 px   plume 4,397 px
//     559u   hull 1,368 px   plume 3,349 px
//
// A hostile was a comet with a ship stuck on the front. That is not just an
// aesthetic complaint, it is the ROOT of two separate failed cues, because
// every other read in the fight was layered onto the plume:
//
//   - ASPECT. The head-on gate (tailGate, floor 0.12) turns the exhaust down
//     when a hostile points its nose at you, which is correct — but when the
//     exhaust IS 87% of the contact, turning it down does not dim the ship,
//     it ERASES it: a standard hull charging at 900u measured 168 total lit
//     px, a 13x13 blob smaller than the star blobs beside it.
//   - THRUST and TELEGRAPH both ride the plume, so both went to zero on the
//     one aspect that matters. Idle-vs-full at 900u charging: 0 px changed.
//     Telegraph R-B swing charging: +7.6/255 against a +25 bar.
//
// The plume half of the fix is above (0.85 x 0.09 instead of 1.70 x 0.145,
// and a core that is no longer painted 68% white). This is the other half:
// the reclaimed contrast goes onto the HULL, in three layers that are all
// ASPECT-INDEPENDENT — they do not care which way the ship is pointing, so
// they survive the aspect gate that was deleting the contact.
//
//   RIM   — a back-face additive shell 7.5% out from the two biggest hull
//           meshes. Additive over black, only the fringe outside the hull's
//           own depth survives, so it draws a saturated faction OUTLINE:
//           silhouette, which is the one thing a flat unlit MeshBasicMaterial
//           hull (see createEnemyMaterial) could never give.
//   NAV   — five running lights pinned to the measured hull box (nose,
//           wingtips, dorsal, tail). Cyan cockpit + faction wingtips is the
//           synthwave read, and being POSITIONED on the hull they also say
//           which way it is facing when the plume is gated off.
//   LAMP  — one camera-facing hull glow, depth-tested so the ship occludes
//           its own middle and it reads as a halo around a solid silhouette,
//           never as paint over the top of one. This is what carries the
//           contact at 900u where the hull is 8 px of dart, and it is where
//           the thrust and telegraph channels now ALSO live so that neither
//           can be gated to nothing by aspect.
//
// It is built lazily, only inside _HULL_READ_DIST, and hidden outside it:
// past ~3,000u there is no aspect to communicate and presence is the plume's
// job (that is the 15,000u floor, which this deliberately does not touch).
// =============================================================================

// Build/keep the rig only inside this range. Beyond it a hostile is a speck
// and the plume is the whole contact — see the far-range handback below.
const _HULL_READ_DIST = 4200;
// Lamp fade-out band. Full strength inside _LO, gone by _HI, so the hull
// channel hands presence back to the plume before the plume's own
// angular-size floor is doing all the work.
const _HULL_LAMP_FADE_LO = 1800;
const _HULL_LAMP_FADE_HI = 3000;
// Lamp extent along the hull's long axis and across it, in hull-lengths /
// hull-widths, plus the on-screen floor in framebuffer px.
//
// ROUND 4 — THE FLOOR WAS THE WHOLE CONTACT. A px floor divided by
// px-per-unit is a WORLD size proportional to distance, so `minWorld / d` is
// a constant and a floored lamp has a FIXED apparent size at every range.
// Measured on the previous build: with the plume hidden, an 83.6u hull and a
// 113.7u hull both rendered 84x84 px / ~5,400 lit px at 700u, 900u, 1,200u
// AND 1,600u — four ranges, two hull sizes, one number. The lamp was not
// helping the contact read, it WAS the contact, and it was isotropic, so a
// 180-degree flip of a hostile at fighting range changed literally zero
// pixels (IoU 1.000). The real Blender hull under it was 373 px.
//
// Three changes, in the order they matter:
//   1. The floor is capped at _HULL_LAMP_FLOOR_MAX hull-lengths, so the halo
//      can never out-grow the ship it belongs to, and the raw floor drops
//      46 -> 14 px. Inside the fighting envelope the floor is now INERT on
//      standard hulls (a 83.6u hull's natural lamp is already 63u/29 px at
//      900u) and only binds for the 42-48u wingman-class hulls it was
//      written for. Distance therefore shrinks the contact again.
//   2. Far-range presence moves to OPACITY (see _HULL_LAMP_FAR_LIFT), which
//      is the channel that does not lie about size.
//   3. The lamp stops being an isotropic Sprite. It is now a quad
//      billboarded ABOUT the hull's own long axis — the same axis-aligned
//      billboard the plume streak uses — scaled to the hull's PROJECTED
//      length x width, so broadside is an elongated smear and nose-on
//      collapses to a compact dot.
//
// ROUND 5 — THE LAMP WAS THE BIGGEST ADDITIVE LAYER ON THE SHIP, BY FAR.
// Round 4 fixed the lamp's HONESTY (it shrinks with distance now, and it
// tells charging from fleeing) but never re-asked whether it should be that
// big at all. Measured per-layer at 300u with same-frame readback, world
// paused, subject isolated: on an 84u hull covering 3,428 px the lamp alone
// rendered 23,014 px broadside and 24,456 px quartering — 6.7x and 7.1x the
// ship — against a streak of 4,268/5,951, nav lights of ~530 and a rim of
// ~4,000. The exhaust was never the main offender; the ship's own halo was.
// At 0.95 hull-lengths with a 1+1.15t thrust stretch, a hard-burning hostile
// wore a glow 2.04 hull-lengths long and 1.38 hull-widths across.
//
// 0.46 / 0.42 is 0.24x the area, and the thrust stretch drops 1.15 -> 0.85
// so the lamp still visibly elongates aft under power (that stretch is the
// aspect-independent thrust cue and the ONLY one a nose-on hostile has).
// Presence at 600-1,800u is paid for out of _HULL_LAMP_FAR_LIFT, which is
// opacity, which is the channel that does not lie about size — the same
// discipline round 4 established. Nothing past 3,000u changes: `fade` has
// already taken the whole rig to zero by then and presence is the plume's.
const _HULL_LAMP_K = 0.46;          // lamp length, in hull-lengths
const _HULL_LAMP_W_K = 0.42;        // lamp width, in hull-widths
const _HULL_LAMP_MIN_PX = 8;
const _HULL_LAMP_FLOOR_MAX = 1.6;   // hard cap on the floor, in hull-lengths
// The lamp sits aft of the hull centre by this fraction of the hull's local
// Z span. It is the ship's own reactor/engine glow, not a marker pinned to
// its centroid, and putting it aft is a second aspect cue for free: the lamp
// is depth-TESTED, so a hostile charging you occludes its own glow with its
// own hull, while one running away shows you all of it.
const _HULL_LAMP_AFT = 0.28;
// ...and it is pushed AWAY FROM THE CAMERA by this many hull-lengths before
// it is drawn. The lamp is depth-tested precisely so the ship occludes the
// middle of its own glow — but a quad pinned at the hull's centre of mass is
// only behind HALF the ship, so on a hull with anything sticking out aft
// (nacelles, wing booms, a boss's arms) the glow drew in FRONT of those
// parts and washed them flat. Measured at 300u on the 48u sparse hull the
// lamp alone raised 35-56% of the ship's own pixels. Sliding the quad behind
// the whole hull costs ~10% of its apparent size at dogfight range (it is a
// billboard, so nothing else about it changes) and buys a halo that is a
// halo everywhere instead of only from the front.
const _HULL_LAMP_DEPTH_BIAS = 0.62;
// NOSE-HEMISPHERE GATE. Both of these attenuate the lamp — and ONLY over
// the last ~40 degrees before dead ahead, so broadside and astern are
// untouched — because the lamp is engine and reactor light and a ship
// pointing its nose at you is showing you the end with no engines on it.
// This is the same contract the plume's own `nearGate` keeps, for the same
// reason, and it is what finally makes charging and fleeing DIFFERENT
// PIXELS rather than the same disc at two brightnesses: dead ahead and dead
// astern are both foreshortened to a circle, so brightness alone cannot
// separate them (measured: opacity-only gave IoU 0.79 at 900u, bar 0.55).
//   _NOSE_K      = size floor    -> charging is a TIGHTER contact
//   _HULL_LAMP_ASPECT = opacity floor -> and a dimmer one
// Neither goes near zero: a hostile bearing down on you must still be
// findable, it just must not look like one that is running away.
const _HULL_LAMP_NOSE_K = 0.56;
const _HULL_LAMP_ASPECT = 0.42;
const _HULL_LAMP_NOSE_LO = -0.80, _HULL_LAMP_NOSE_HI = -0.15;
// ...and the mirror of it. Dead astern you are looking straight into the
// engine bells, so the lamp grows. Nose gate and tail bonus together are
// what put clear daylight between charging and fleeing: both aspects
// foreshorten to a circle, so the ONLY thing that can separate them is how
// big and how bright that circle is.
// Round 5: 0.18 -> 0.52. The fleeing signature used to be carried mostly by
// the PLUME — a 2.7-hull-length spear pointed straight at the viewer — and
// this round cut that spear to about one hull-length. Mid-round, with the
// tail bonus still at 0.18, that had taken the charging-vs-fleeing
// separation with it: the fleeing contact measured 5,938 px at 400u against
// a charging 7,240, i.e. running away had become the SMALLER read, and the
// aspect IoU went 0.386 -> 0.879. Aspect has to be paid for out of whatever
// is left, and dead astern the honest thing that is left is the engine deck:
// you are looking straight into the bells, so the reactor glow is at its
// largest. Final measured state, same protocol: charging 7,238 px vs fleeing
// 19,124 px at 400u, IoU 0.378 (baseline 0.386) — separation slightly BETTER
// than the build this round started from, on a contact less than a fifth the
// additive area.
const _HULL_LAMP_TAIL = 0.52;
// The telegraph OVERRIDES the nose gate. A hostile winding up to shoot you
// is almost always pointing at you — the one aspect the gate dims — so the
// wind-up walks the gate back off. This is what keeps "about to fire"
// hue-separable head-on, which is the only time the player needs it.
const _HULL_LAMP_CHG_RELIEF = 0.85;
// Thrust relieves it too, but only a little. A ship burning hard at you does
// light up — reactor, wing roots, the glow spilling round the hull — and
// without this the head-on thrust cue is 215 px, which is no cue at all.
// It is CAPPED because the charge-vs-flee test is taken with both ships at
// FULL thrust, so every point of head-on thrust gain is a point of aspect
// separation spent. Measured at 900u on an 84u hull: 0.20 -> head-on thrust
// delta 408 px / IoU 0.345; 0.45 -> 1,138 px / IoU 0.44; 0.60 -> IoU 0.56,
// over the bar. 0.45 is the most head-on thrust the aspect budget will pay
// for. Head-on the thrust cue is honestly brightness-dominated: a whole
// charging contact is only ~1,600 px at 900u, so a 2,500 px CHANGE there
// would mean re-inflating the halo to twice the ship — the exact defect
// this round removed.
// ROUND 5 LEFT THIS AT 0.45, and the reason is worth writing down because
// the obvious move is to raise it. Raising it to 0.60 (round 4's own
// measured "still just clears the IoU bar" value) does buy head-on thrust —
// and it was measured this round to cost exactly what the note above says
// it costs: charging-vs-fleeing IoU at 400/900/1,200u went 0.386/0.410/0.426
// to 0.753/0.731/0.699, i.e. the two aspects became the same contact again.
// The head-on thrust cue is bought elsewhere instead (see the HEAD-ON THRUST
// HALO below, which is thin and gated to the last ~35 degrees, and the nav /
// rim thrust response, which is aspect-independent and nearly free in area).
const _HULL_LAMP_THR_RELIEF = 0.45;
// ROUND 6 — WITH THE NOZZLE CORE SUBORDINATED, THE LAMP IS THE BLOB.
// Round 5's numbers for this layer were taken with the rig hidden, which is
// how a hostile OUTSIDE _HULL_READ_DIST renders — but inside it, which is
// every fight, the lamp is live and it is the largest additive layer on the
// ship by an order of magnitude. Measured this round per-layer at 300u, full
// thrust, world paused, subject isolated, 91.5u GLB hull, px at lum>40:
//
//   dead astern   hull 5,196 | lamp 12,723  nav 641  core 401  streak 0
//   broadside     hull 4,147 | rig 2,927    core 43   streak 959
//
// 2.4x the ship from one quad, and it is worst dead astern where the tail
// bonus and the on-axis halo both peak. That single layer is what still put
// FX/hull at 2.54 and hull coverage at 85.6% after the nozzle fix, and it is
// the reason a hostile you are not looking at reads as a cotton ball.
//
// So the lamp gets the same treatment the nozzle core got: a near-range size
// multiplier that is handed back through the SAME `far` ramp the opacity
// lift already rides, so everything past 2,000u is untouched by construction
// rather than by re-tuning, and presence keeps being paid for in brightness
// (_HULL_LAMP_FAR_LIFT) rather than in area. It multiplies the natural size
// AND the on-axis halo, so the nose/tail asymmetry that carries
// charging-vs-fleeing is scaled, never reshaped.
const _HULL_LAMP_NEAR = 0.55;
// Extra opacity out at range, so the contact keeps its presence while its
// FOOTPRINT is allowed to shrink with distance the way a real object's does.
const _HULL_LAMP_FAR_LIFT = 0.95;
const _HULL_LAMP_FAR_LO = 600, _HULL_LAMP_FAR_HI = 2000;
// ROUND 7 — THE LAMP GETS RELATIVELY *BIGGER* AS THE HULL SHRINKS, NOT
// SMALLER. Every term above (_HULL_LAMP_NEAR, the angular-size floor, the
// astern on-axis halo) is built from WORLD-CONSTANT hull-length/hull-width
// quantities, so the lamp's own WORLD size is flat-to-rising with distance
// (lampNearK alone climbs 0.55 -> 1.0 out to 2,000u). The hull it sits on
// does not get the same deal — past ~930u its screen footprint is capped
// close to honestly-shrinking 1/d (see the geometric floor's
// _HULL_GEO_BOOST_MAX=1.25 note above) — so the LAMP/HULL ratio gets worse,
// not better, as a contact recedes. That is the opposite of "tapers as the
// hull shrinks" and it is exactly what a same-frame isolated readback
// caught: the UFO class's worst-case (dead-astern, full thrust) lamp-only
// vs hull-only pixel ratio measured 0.833 at 300u and 1.569 at 900u — an
// 88% WORSE ratio at the longer range, on the exact same rig.
//
// The fix does not touch presence (that is still _HULL_LAMP_FAR_LIFT,
// opacity, the channel that does not lie about size) — it adds a second,
// independent multiplier on top of every size term (natural size, the
// angular floor's contribution once it has folded into lampW/lampL, and
// the astern on-axis halo), calibrated at the two ranges this round
// actually measures against. It is NOT the reciprocal of the near/far
// growth above (that would just cancel it back to flat) — it is
// additional damping, because 300u ALONE already failed the <=1.0 FX/hull
// bar on the astern aspect (0.833 is most of the way there before the
// aura shell, the ring and the plume are even added in).
//
// Calibrated, not derived: _NEAR_K/_FAR_K were chosen so the UFO class's
// measured worst-case (dead-astern, full thrust) ratio would land near
// 0.08 at both ends, leaving margin under the <=0.1x-hull lamp budget this
// round's fix note sets (itself sized so shell+ring+lamp+rim sum with room
// under the overall <=1.0 FX/hull bar). Re-measured after, same protocol,
// whole-rig (lamp+nav+rim) vs bare-hull ratio: UFO class 0.10-0.14 across
// all 4 yaws at BOTH 300u and 900u (previously 0.23-0.85 at 300u, 0.28-1.59
// at 900u) — the range-dependence the fix targets is gone, and every yaw
// clears the individual-layer 0.1x reference point or comes within a
// point of it. Same multiplier, applied identically to every hostile
// class through this shared function: Romulan and Federation rig/hull
// dropped from 0.44-1.58 to 0.10-0.20 at 900u, and the 8 roster classes
// already passing at 300u stayed under 0.62 FX/hull with room to spare —
// no regression. Below _LO the multiplier holds at _NEAR_K rather than
// continuing to rise back toward 1 — the fighting envelope this game
// calibrates against is 50-400u (median ~200u), and nothing in the 300u
// measurement says a closer contact needs LESS damping than the one this
// round actually tested.
//
// WHAT THIS DOES NOT FIX: for Romulan/Federation, the lamp/rig was never
// the whole story at 900u — the nozzle core + streak plume (owned by the
// FX/plume sections of this file, out of scope for this round's lamp-only
// fix) independently measured 1.1-1.4x hull on the broadside/tail aspects
// even with the rig at zero, which keeps those two classes' overall
// FX/hull above the 1.0 bar on those yaws until the plume side lands its
// own pass. The UFO class has no such gap (its core/streak were already
// small — this class carries no galaxy-standard plume load), so its own
// FX/hull<=1.0 acceptance is fully met by this round's fix alone.
const _HULL_LAMP_FAR_DAMP_LO = 300, _HULL_LAMP_FAR_DAMP_HI = 900;
const _HULL_LAMP_FAR_DAMP_NEAR_K = 0.31;
const _HULL_LAMP_FAR_DAMP_FAR_K = 0.226;
// Rim shell width and how many hull meshes get one.
//
// ROUND 5 — A CENTRE-SCALED SHELL IS NOT AN OUTLINE ON A SPARSE HULL. The
// rim used to be the source mesh re-drawn at a uniform 1.075 scale about its
// geometry centre, back faces only, additive, depth-tested — which gives a
// clean fringe on a CHUNKY hull, because a uniform scale displaces every
// surface outward by 7.5% of its distance from the centre and on a solid
// fuselage that displacement is smaller than the hull's own thickness, so
// the shell stays buried and only the silhouette survives.
//
// It falls apart on a sparse silhouette. Measured per-layer at 300u on the
// 48u Vulcan-class hull (saucer + neck + two thin nacelles), the rim alone
// raised 74-88% of the ship's own pixels by a mean of 46-53/255 — it was not
// outlining the hull, it was REPAINTING it, because 7.5% of a nacelle's
// distance from the model centre is many times that nacelle's thickness, so
// its shell slid clean off it and landed in front of the hull behind. On the
// chunky 84u hull the same layer covered 10-18% at a mean of 4-9/255, which
// is why four rounds of tuning never caught this: it is a function of hull
// SHAPE, and the hull everyone measured was solid.
//
// The fix is the mechanism, not the number: expand along VERTEX NORMALS by a
// constant world width instead of scaling about a centre. A normal-expanded
// back face is behind its own front face everywhere by construction — it can
// only emerge at the silhouette, which is the definition of an outline — and
// it stays a constant-width sheath on a nacelle and on a fuselage alike.
// Costs one uniform and two lines of injected vertex shader; the geometry is
// still shared with the source mesh, so no extra buffers.
const _HULL_RIM_WIDTH_K = 0.016;   // outline width, in hull-lengths
const _HULL_RIM_MAX = 2;
// ...and how far behind its own hull the outline is DEPTH-PUSHED, in
// hull-lengths. See _hullRimMaterial — this is what makes the outline an
// outline on every asset in the game instead of only on the well-authored
// ones.
const _HULL_RIM_DEPTH_PUSH = 0.60;

// Normal-expanded additive outline material. `localOutline` is the expansion
// in the SOURCE MESH'S OWN local units — the caller converts from world units
// once, at build time, because the ship's scale does not change after that —
// and `worldPush` is the depth bias in world units.
//
// WHY THE DEPTH PUSH EXISTS, and why it is not paranoia. A back-face shell is
// only self-occluding if the asset's triangle winding agrees with its
// geometry, and one of the eight enemy GLBs in this game does not. Measured
// at 300u with the expansion set to exactly ZERO — so the shell is the hull,
// coincident, and can only be visible if it wins the depth test — the shell
// still lit 74.3% of the hull's own pixels on the region-7 hull (mean
// +42/255) while lighting 0.7% of them on the region-2 hull. That is the
// signature of inverted winding: the FrontSide hull pass is drawing the FAR
// surface, so the BackSide shell draws the NEAR one and legitimately wins
// depth over the whole silhouette. No amount of tuning the shell's SIZE can
// fix that, because size was never the mechanism.
//
// The push is applied in CLIP SPACE, to gl_Position.z alone, and scaled by
// the projection's own z coefficient so it is an exact `worldPush` metres of
// view-space depth. Doing it in view space instead (mvPosition.z -= push)
// would also shrink the outline on screen by push/distance — 8% at dogfight
// range, which is many times the outline's own width, so the fringe would
// fall back INSIDE the silhouette and be occluded by the very hull it is
// supposed to be drawing around. Biasing z with x, y and w untouched moves
// the shell in depth ONLY: same pixels, drawn further away.
function _hullRimMaterial(color, localOutline, worldPush) {
    const mat = new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
        side: THREE.BackSide
    });
    const uniforms = {
        uOutline: { value: localOutline },
        uRimPush: { value: worldPush || 0 }
    };
    mat.onBeforeCompile = function (shader) {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>',
                     '#include <common>\nuniform float uOutline;\nuniform float uRimPush;')
            // `normal` is always declared in three's vertex prefix, so this
            // does not depend on MeshBasicMaterial happening to include
            // <beginnormal_vertex> (in r128 it only does under envmap/skinning).
            .replace('#include <begin_vertex>',
                     '#include <begin_vertex>\n\ttransformed += normalize( normal ) * uOutline;')
            .replace('#include <project_vertex>',
                     '#include <project_vertex>\n\tgl_Position.z -= projectionMatrix[2].z * uRimPush;');
    };
    mat.userData._rimOutline = uniforms.uOutline;
    mat.userData._rimPush = uniforms.uRimPush;
    return mat;
}

// =============================================================================
// HULL GEOMETRY FLOOR — GEOMETRIC CAP (this is what restores CLOSURE)
// =============================================================================
// The lamp above was fixed by capping its floor in WORLD units
// (_HULL_LAMP_FLOOR_MAX): a screen-px floor divided by px-per-unit is a world
// size PROPORTIONAL TO DISTANCE, so anything floored that way has a constant
// apparent size at every range. The same defect still lived one layer down, in
// the hull GEOMETRY: `_installHullScreenFloor(group, minPx=60, maxBoost=2.5)`
// (game-models.js, installed on the Vulcan patrol hull group and on every UFO
// hull group) did
//     boost = min(2.5, minPx / rawPx)   with rawPx ∝ 1/d
// so `boost ∝ d` and the projected hull was pinned at exactly `minPx` across
// the entire dogfight envelope. Measured on the live build, boost read off the
// floor group itself: 1.000@700u, 1.204@900u, 1.602@1200u, 2.131@1600u,
// 2.500@>=1867u — dead-on linear in d. Consequence, measured by toggling the
// bare hull mesh against a PAUSED zero-noise frame (lamp/nav/rim and plume
// hidden): 60x57 px / 2,627 px at 900u, 60x57 px / 2,613 px at 1200u,
// 60x57 px / 2,606 px at 1600u. Three ranges spanning 1.78x, identical to the
// pixel. A ship that never grows as it closes gives the player no closure cue
// at all — the one cue the whole combat loop is built on — and the inflated
// silhouette is also what dragged the kill payoff under its >=3x bar.
//
// The fix is the same discipline the lamp already uses: the floor may not buy
// SIZE past a distance-independent constant, and whatever presence is still
// missing is paid for in BRIGHTNESS, which is the channel that does not lie
// about how far away something is.
//   • _HULL_GEO_BOOST_MAX caps the geometric boost at 1.25. It binds from
//     ~930u out, so from there to 15,000u the hull's footprint is honestly
//     proportional to 1/d.
//   • the leftover deficit (what the uncapped floor WOULD have taken in
//     scale) becomes an emissiveIntensity multiplier, capped at
//     _HULL_GEO_EMIS_MAX, applied per-draw and restored in onAfterRender so
//     it neither compounds nor leaks across ships that share a material
//     (enemy hull materials ARE shared, and game-core.js rewrites
//     emissiveIntensity from userData.baseEmissive every frame — writing in
//     onBeforeRender and undoing it in onAfterRender is the only placement
//     that survives both).
//
// This lives HERE, in game-controls.js, and replaces the global installer
// rather than editing it in place: game-models.js is another agent's file this
// round. game-models.js is loaded first (index.html) and its call sites run at
// ship-construction time, i.e. long after this script has swapped the global,
// so every hull built in the game gets the capped version. The upstream
// implementation is kept on `.__upstream` for reference.
const _HULL_GEO_BOOST_MAX = 1.25;   // hard cap on the geometric floor
const _HULL_GEO_EMIS_MAX = 3.0;     // and the brightness that pays for the rest

(function _capHullScreenFloor() {
    if (typeof window === 'undefined' || typeof THREE === 'undefined') return;

    function cappedInstall(group, minPx, maxBoost) {
        if (!group || !group.parent) return;
        minPx = (minPx !== undefined) ? minPx : 60;
        // `maxBoost` is deliberately NOT honoured as a SCALE cap any more — it
        // is what made the hull range-invariant. It survives as the ceiling on
        // the brightness compensation instead.
        const emisMax = Math.max(1, Math.min(_HULL_GEO_EMIS_MAX,
                                             maxBoost !== undefined ? maxBoost * 1.2 : _HULL_GEO_EMIS_MAX));

        const baseScale = group.scale.x || 1;
        const parent = group.parent;
        // Parent-relative corners captured ONCE, before any boost is applied,
        // so the per-frame measurement never reads back its own last boost
        // (see the upstream note — that part of the design is correct).
        let localCorners = null;
        try {
            parent.updateWorldMatrix(true, false);
            group.updateWorldMatrix(true, true);
            const box = new THREE.Box3().setFromObject(group);
            if (box.isEmpty()) return;
            const invParent = new THREE.Matrix4().copy(parent.matrixWorld).invert();
            localCorners = [];
            for (let i = 0; i < 8; i++) {
                const c = new THREE.Vector3(
                    (i & 1) ? box.max.x : box.min.x,
                    (i & 2) ? box.max.y : box.min.y,
                    (i & 4) ? box.max.z : box.min.z
                );
                c.applyMatrix4(invParent);
                localCorners.push(c);
            }
        } catch (e) {
            return;
        }
        if (!localCorners) return;

        const _tmp = new THREE.Vector3();
        group.userData._hullGeoBoost = 1;
        group.userData._hullGeoDeficit = 1;
        group.userData._hullGeoRawPx = 0;

        const measure = function (renderer, camera) {
            const frame = (renderer.info && renderer.info.render) ? renderer.info.render.frame : null;
            if (frame !== null) {
                if (group.userData._hullFloorFrame === frame) return;
                group.userData._hullFloorFrame = frame;
            }
            const w = renderer.domElement ? (renderer.domElement.width || renderer.domElement.clientWidth) : 0;
            const h = renderer.domElement ? (renderer.domElement.height || renderer.domElement.clientHeight) : 0;
            if (!w || !h) return;

            group.parent.updateWorldMatrix(true, false);
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            let anyBehindCamera = false;
            for (let i = 0; i < localCorners.length; i++) {
                _tmp.copy(localCorners[i]).applyMatrix4(group.parent.matrixWorld);
                const camDist = _tmp.distanceTo(camera.position);
                _tmp.project(camera);
                if (_tmp.z < -1 || _tmp.z > 1 || camDist <= 0) { anyBehindCamera = true; continue; }
                const sx = (_tmp.x * 0.5 + 0.5) * w;
                const sy = (1 - (_tmp.y * 0.5 + 0.5)) * h;
                if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
                if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
            }
            // Partially off the near plane (the camera is effectively inside
            // the hull): a partial bbox is not a "too small" reading.
            if (anyBehindCamera || !isFinite(minX) || !isFinite(maxX)) {
                group.userData._hullGeoBoost = 1;
                group.userData._hullGeoDeficit = 1;
                group.scale.setScalar(baseScale);
                group.updateMatrixWorld(true);
                return;
            }

            const rawPx = Math.max(maxX - minX, maxY - minY);
            let boost = 1, deficit = 1;
            if (rawPx > 0 && rawPx < minPx) {
                boost = Math.min(_HULL_GEO_BOOST_MAX, minPx / rawPx);
                deficit = Math.min(emisMax, Math.max(1, minPx / (rawPx * boost)));
            }
            group.userData._hullGeoRawPx = rawPx;
            group.userData._hullGeoBoost = boost;
            group.userData._hullGeoDeficit = deficit;
            group.scale.setScalar(baseScale * boost);
            group.updateMatrixWorld(true); // land it before the renderer reads
            // this mesh's matrixWorld a moment later in the same
            // renderObject() call; the deep update also fixes every sibling
            // mesh that hits the frame-dedupe above later this frame.
        };

        // Per-DRAW, not per-frame: the emissive lift has to be applied and
        // undone around each individual mesh so a material shared by several
        // hulls carries the right value for whichever one is being drawn.
        const applyFloor = function (renderer, scene, camera, geometry, material) {
            if (!group.parent) return;              // destroyed since install
            if (!renderer || !camera || !camera.isPerspectiveCamera) return;
            measure(renderer, camera);
            const d = group.userData._hullGeoDeficit || 1;
            const mat = material || this.material;
            if (d > 1.001 && mat && mat.emissiveIntensity !== undefined) {
                this.userData._geoEmisSaved = mat.emissiveIntensity;
                this.userData._geoEmisMat = mat;
                mat.emissiveIntensity = mat.emissiveIntensity * d;
            } else {
                this.userData._geoEmisMat = null;
            }
        };
        const restoreEmissive = function () {
            const mat = this.userData._geoEmisMat;
            if (mat) {
                mat.emissiveIntensity = this.userData._geoEmisSaved;
                this.userData._geoEmisMat = null;
            }
        };

        group.traverse((child) => {
            if (!child.isMesh) return;
            child.onBeforeRender = applyFloor;
            child.onAfterRender = restoreEmissive;
        });
    }

    cappedInstall.__geoCapped = true;

    // Swap now (game-models.js is loaded first, so the global already exists
    // and every hull built at runtime picks this up) and again once the whole
    // <script> chain has run — a hoisted `function _installHullScreenFloor`
    // declaration in a file that ends up loading AFTER this one would
    // otherwise silently re-take the global and put the range-invariance
    // back. Idempotent: it only swaps when the current global isn't already
    // the capped one, and it keeps whatever it displaced on `__upstream`.
    function swap() {
        const cur = window._installHullScreenFloor;
        if (cur === cappedInstall || (cur && cur.__geoCapped)) return;
        if (typeof cur === 'function') cappedInstall.__upstream = cur;
        window._installHullScreenFloor = cappedInstall;
    }
    swap();
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', swap);
        } else {
            setTimeout(swap, 0);
        }
    }
})();

// Hull-lamp profile. Deliberately FLATTER than _plumeCoreTex: the lamp's
// job is area that survives a threshold, not a hot spot (a hot spot is what
// the nozzle cores are for, and the whole point of this round is that the
// engine stops being the brightest thing on the contact). Peak alpha 0.62
// so that even at full thrust, over black, the lamp lands mid-value and the
// hull's own lit surfaces stay the top of the range.
let _HULL_LAMP_TEX = null;
function _hullLampTex() {
    if (_HULL_LAMP_TEX) return _HULL_LAMP_TEX;
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0.00, 'rgba(255,255,255,0.62)');
    grd.addColorStop(0.30, 'rgba(255,255,255,0.50)');
    grd.addColorStop(0.55, 'rgba(235,235,235,0.34)');
    grd.addColorStop(0.78, 'rgba(190,190,190,0.16)');
    grd.addColorStop(0.92, 'rgba(120,120,120,0.05)');
    grd.addColorStop(1.00, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    _HULL_LAMP_TEX = t; return t;
}

// ONE shared unit quad for every hull lamp in the game: 1x1 in the XY plane,
// +Y is the hull's long axis. Orientation and non-uniform scale are solved
// per-frame in _updateHullReadout.
let _HULL_LAMP_GEO = null;
function _hullLampGeo() {
    if (!_HULL_LAMP_GEO) _HULL_LAMP_GEO = new THREE.PlaneGeometry(1, 1);
    return _HULL_LAMP_GEO;
}

const _hrC = new THREE.Vector3();
const _hrV = new THREE.Vector3();
// Scratch for the lamp's per-frame axis-aligned billboard.
const _hlInv  = new THREE.Matrix4();
const _hlMat  = new THREE.Matrix4();
const _hlCam  = new THREE.Vector3();
const _hlAxis = new THREE.Vector3();
const _hlView = new THREE.Vector3();
const _hlY    = new THREE.Vector3();
const _hlX    = new THREE.Vector3();

function _ensureHullReadout(ship, color) {
    if (!ship || !ship.userData || ship.userData._hullRead) return;
    if (typeof THREE === 'undefined') return;
    if (ship.userData._materializing) return;
    // The plume measures the hull box first and caches it; piggy-back on
    // that rather than paying for a second traverse per hostile.
    const lb = ship.userData._plumeLocalBox;
    const hullLen = ship.userData._plumeHullLen || 0;
    const sx = ship.userData._plumeSx || 1;
    if (!lb || !(hullLen > 0)) return;

    const base = new THREE.Color(color === undefined ? 0xff5522 : color);
    const _h = { h: 0, s: 0, l: 0 };
    base.getHSL(_h);
    // Same saturation floor the plume halo uses: a pastel faction tint would
    // land straight on top of a warm field star.
    const fac = new THREE.Color().setHSL(_h.h, Math.max(_h.s, 0.85),
                                         Math.min(Math.max(_h.l, 0.52), 0.66));
    const cyan = new THREE.Color(0x66f2ff);

    const rig = { rims: [], navs: [], lamp: null, hullLen: hullLen, sx: sx };

    // ── RIM ──────────────────────────────────────────────────────────────
    // Back-face shell, additive, no depth write, drawn AFTER the hull
    // (renderOrder 6) so the hull's own depth clips everything except the
    // fringe. Scaled about each mesh's geometry centre, not its origin —
    // GLB sub-meshes are routinely offset from the model origin and a naive
    // uniform scale would slide the outline off the part it belongs to.
    try {
        const cand = [];
        ship.traverse(n => {
            if (!n.isMesh || !n.geometry) return;
            const u = n.userData || {};
            if (u.isHitbox || u.isGlowLayer || u._isThrusterCone ||
                u._isHullRead || u.isEnemyShield) return;
            if (!n.geometry.boundingBox) n.geometry.computeBoundingBox();
            const bb = n.geometry.boundingBox;
            if (!bb) return;
            const s = bb.getSize(_hrV);
            cand.push({ mesh: n, vol: Math.max(1e-9, s.x * s.y * s.z) });
        });
        cand.sort((a, b) => b.vol - a.vol);
        // Outline width in WORLD units, converted once into each source
        // mesh's own local units. A constant world width is what makes this
        // an honest outline: it is the same number of screen pixels wide at a
        // given range on every hull in the game, instead of a percentage that
        // a big ship wears as a slab and a small one cannot see.
        const rimWorld = Math.max(hullLen * _HULL_RIM_WIDTH_K, 0.25);
        for (let i = 0; i < Math.min(_HULL_RIM_MAX, cand.length); i++) {
            const src = cand[i].mesh;
            if (!src.parent) continue;
            // World units per source-mesh local unit: the ship's own world
            // scale times this mesh's local scale under it.
            const meshScale = Math.max(1e-6,
                Math.abs(src.scale.x || 1) * Math.abs(src.scale.y || 1) * Math.abs(src.scale.z || 1));
            const perLocal = Math.max(1e-6, sx * Math.cbrt(meshScale));
            const mat = _hullRimMaterial(fac, rimWorld / perLocal,
                                         hullLen * _HULL_RIM_DEPTH_PUSH);
            // Same transform as the source mesh — no centre-scaling, no
            // slide. The expansion happens in the shader, along the normal.
            const rim = new THREE.Mesh(src.geometry, mat);
            rim.position.copy(src.position);
            rim.quaternion.copy(src.quaternion);
            rim.scale.copy(src.scale);
            rim.renderOrder = 6;
            rim.frustumCulled = true;
            rim.userData._isHullRead = true;
            _plumeExemptFromDrawBudget(rim);
            src.parent.add(rim);
            rig.rims.push({ mesh: rim, mat: mat });
        }
    } catch (e) {}

    // ── NAV LIGHTS ───────────────────────────────────────────────────────
    // Pinned to the measured local hull box. Every hull in the game flies
    // -Z forward (see applyEnemyRotation / _applyNoseFlip), so -Z is the
    // nose and +Z the engine deck: the nose lamp is the cockpit, the tail
    // lamp sits between the nozzles, and the wingtips mark the span. That
    // arrangement is also an aspect cue in its own right — three lights in
    // a row is a broadside, one light with two close beside it is a ship
    // coming at you.
    const navRad = Math.max(hullLen * 0.052, 0.9) / sx;
    const cx = (lb.minx + lb.maxx) * 0.5, cy = (lb.miny + lb.maxy) * 0.5;
    const cz = (lb.minz + lb.maxz) * 0.5;
    const spanZ = Math.max(1e-6, lb.maxz - lb.minz);
    const navSpec = [
        // [x, y, z, colour, size mult]  — cockpit first.
        [cx, cy + (lb.maxy - cy) * 0.55, lb.minz - spanZ * 0.02, cyan, 1.15],
        [lb.maxx * 0.94 + cx * 0.06, cy, cz - spanZ * 0.05, fac, 1.0],
        [lb.minx * 0.94 + cx * 0.06, cy, cz - spanZ * 0.05, fac, 1.0],
        [cx, lb.maxy * 0.96 + cy * 0.04, cz + spanZ * 0.10, cyan, 0.8],
        [cx, cy, lb.maxz + spanZ * 0.02, fac, 0.9]
    ];
    navSpec.forEach(spec => {
        const mat = new THREE.SpriteMaterial({
            color: spec[3], map: _plumeCoreTex(),
            transparent: true, opacity: 0.85,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const s = new THREE.Sprite(mat);
        s.position.set(spec[0], spec[1], spec[2]);
        const r = navRad * spec[4];
        s.userData._navRad = r;
        s.userData._navBaseCol = spec[3].clone();
        s.scale.set(r * 2, r * 2, 1);
        s.renderOrder = 7;
        s.userData._isHullRead = true;
        _plumeExemptFromDrawBudget(s);
        ship.add(s);
        rig.navs.push({ mesh: s, mat: mat });
    });

    // ── LAMP ─────────────────────────────────────────────────────────────
    // A QUAD, not a Sprite. A Sprite has no orientation — it is the same
    // circle whichever way the ship is pointing — which is why the previous
    // build's charging-vs-fleeing IoU was exactly 1.000: the lamp was most
    // of the contact and the lamp could not tell the two apart. This quad is
    // billboarded ABOUT the hull's long axis (solved every frame below) and
    // scaled to the hull's PROJECTED length x width, so it is an elongated
    // smear broadside and a compact dot nose-on, exactly like the object it
    // is supposed to be describing.
    //
    // depthTest stays TRUE: the hull occludes the middle of its own glow, so
    // this can never wash the silhouette out into a blob — it is a halo with
    // a ship-shaped hole in it. renderOrder 4 puts it after the hull in the
    // transparent pass so that occlusion actually happens.
    const lampMat = new THREE.MeshBasicMaterial({
        color: fac.clone().lerp(new THREE.Color(0xffffff), 0.22),
        map: _hullLampTex(), transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false,
        depthTest: true, side: THREE.DoubleSide
    });
    const lamp = new THREE.Mesh(_hullLampGeo(), lampMat);
    // Aft of the hull centre — see _HULL_LAMP_AFT.
    lamp.position.set(cx, cy, cz + spanZ * _HULL_LAMP_AFT);
    // Anchor kept separately: the per-frame drive slides the quad back along
    // the view direction from HERE (see _HULL_LAMP_DEPTH_BIAS), and reading
    // that offset back out of its own position would make it compound.
    lamp.userData._lampBasePos = lamp.position.clone();
    const lampL0 = hullLen * _HULL_LAMP_K / sx;
    lamp.scale.set(lampL0, lampL0, 1);
    lamp.renderOrder = 4;
    lamp.userData._isHullRead = true;
    lamp.userData._lampBaseCol = lampMat.color.clone();
    _plumeExemptFromDrawBudget(lamp);
    ship.add(lamp);
    rig.lamp = { mesh: lamp, mat: lampMat };

    // Across-axis hull size in WORLD units — the other half of the lamp's
    // aspect ratio. Wingspan or fin height, whichever is larger, because
    // that is what a broadside actually shows you.
    rig.hullWid = Math.max(1e-3,
        Math.max(lb.maxx - lb.minx, lb.maxy - lb.miny) * sx);

    ship.userData._hullRead = rig;
}

// Per-frame drive. `tN` is the plume's own normalised thrust (0 = idle,
// 1 = full burn) and `chg` the telegraph charge, so the hull channel moves
// in lock-step with the engine channel instead of inventing a second clock.
function _updateHullReadout(ship, dist, tN, chg) {
    const rig = ship.userData && ship.userData._hullRead;
    if (!rig) return;
    const d = dist || 0;
    // Far-range handback: the rig switches off entirely and the plume owns
    // presence, exactly as it does at 15,000u.
    if (d > _HULL_READ_DIST) {
        if (rig.lamp.mesh.visible) {
            rig.lamp.mesh.visible = false;
            for (let i = 0; i < rig.navs.length; i++) rig.navs[i].mesh.visible = false;
            for (let i = 0; i < rig.rims.length; i++) rig.rims[i].mesh.visible = false;
        }
        return;
    }
    if (!rig.lamp.mesh.visible) {
        rig.lamp.mesh.visible = true;
        for (let i = 0; i < rig.navs.length; i++) rig.navs[i].mesh.visible = true;
        for (let i = 0; i < rig.rims.length; i++) rig.rims[i].mesh.visible = true;
    }

    const t = Math.min(1, Math.max(0, tN || 0));
    const c = Math.min(1, Math.max(0, chg || 0));
    const cQ = c * c;
    const fade = (d <= _HULL_LAMP_FADE_LO) ? 1
               : Math.max(0, 1 - (d - _HULL_LAMP_FADE_LO) /
                                 (_HULL_LAMP_FADE_HI - _HULL_LAMP_FADE_LO));
    const ppu = _plumePxPerUnit(d);
    const alarmCol = _plumeAlarmColor();
    // See _HULL_LAMP_FAR_DAMP_LO — additional SIZE-ONLY damping, on top of
    // (not instead of) lampNearK above, so the lamp/hull pixel ratio stops
    // getting worse as range increases. Applied below to every size term:
    // the natural size + angular floor (folded into lampW/lampL by the time
    // sizeGain runs) and the astern on-axis halo.
    const rangeDampT = Math.min(1, Math.max(0,
        (d - _HULL_LAMP_FAR_DAMP_LO) / (_HULL_LAMP_FAR_DAMP_HI - _HULL_LAMP_FAR_DAMP_LO)));
    const rangeDampK = _HULL_LAMP_FAR_DAMP_NEAR_K +
        (_HULL_LAMP_FAR_DAMP_FAR_K - _HULL_LAMP_FAR_DAMP_NEAR_K) * rangeDampT;

    // ── LAMP ─────────────────────────────────────────────────────────────
    // Natural size first: the hull's own length and width, in world units.
    // The angular-size floor then applies to the SMALL axis only (width is
    // what disappears first) and is capped at _HULL_LAMP_FLOOR_MAX
    // hull-lengths, so the halo can never out-grow the ship. That cap is the
    // whole fix for the range-invariance: an uncapped px floor is a world
    // size proportional to distance, which pins the lamp's apparent size at
    // every range and hides the fact that the contact is closing.
    const lamp = rig.lamp;
    let lampW = (rig.hullWid || rig.hullLen * 0.45) * _HULL_LAMP_W_K;
    let lampL = Math.max(rig.hullLen * _HULL_LAMP_K, lampW);
    // NEAR-RANGE SUBORDINATION — see _HULL_LAMP_NEAR. Computed here, ahead of
    // the angular-size floor, so the floor still gets the last word on the
    // small hulls it was written for; `farLamp` is reused verbatim by the
    // opacity lift further down, so the two channels cannot drift apart.
    const farLamp = Math.min(1, Math.max(0, (d - _HULL_LAMP_FAR_LO) /
                                             (_HULL_LAMP_FAR_HI - _HULL_LAMP_FAR_LO)));
    const lampNearK = _HULL_LAMP_NEAR + (1 - _HULL_LAMP_NEAR) * farLamp;
    lampW *= lampNearK; lampL *= lampNearK;
    if (ppu > 0 && fade > 0) {
        const minWorld = Math.min((_HULL_LAMP_MIN_PX * fade) / ppu,
                                  rig.hullLen * _HULL_LAMP_FLOOR_MAX);
        if (minWorld > lampW) lampW = minWorld;
        if (lampW > lampL) lampL = lampW;
    }
    // THRUST STRETCHES IT AFT. This is the aspect-independent half of the
    // idle-vs-full cue, and it is the half that survives a nose-on attack
    // run: measured at 900u, the plume's own contribution to a charging
    // hostile's thrust delta is 0 px (the aspect gate is holding the
    // exhaust down, correctly), so if the hull does not carry the cue there
    // is no cue. It goes mostly into LENGTH rather than into diameter so
    // that a hard-burning ship reads as a lit hull with a wake, not as a
    // bigger ball of light — the ball of light is what this round is
    // deleting.
    // Thrust and wind-up coefficients RAISED against the round-5 lamp, not
    // inherited from the round-4 one. The lamp is now 0.24x the area it was,
    // so the same coefficients bought a much smaller absolute cue: measured,
    // a nose-on hostile's idle-vs-full-burn difference at 300u fell to 594
    // changed px (a 1.07x area gain) — and nose-on the plume is aspect-gated
    // to a floor, so the lamp is the ONLY thing carrying thrust there. The
    // gain goes into LENGTH and OPACITY rather than width: aft elongation is
    // the shape of a wake, and opacity is free in the FX-area budget.
    lampL *= (1 + 0.95 * t + 0.45 * cQ);
    lampW *= (1 + 0.36 * t + 0.30 * cQ);

    // AXIS-ALIGNED BILLBOARD + PROJECTED FORESHORTENING. Solve the quad's
    // frame in the ship's LOCAL space (that is where the quad lives):
    //   +Z = the direction to the camera        -> the quad faces the viewer
    //   +Y = the hull's long axis with its      -> the smear lies along the
    //        view-direction component removed      ship on screen
    //   +X = +Y x +Z
    // Then scale +Y by the hull axis's PROJECTED length, which is
    // lampL * sin(angle between the hull axis and the view direction), with
    // a floor of lampW so that dead nose-on and dead astern collapse to a
    // round dot instead of to a line.
    let axialC = 0;
    const _lcam = (typeof camera !== 'undefined' && camera) ? camera : window.camera;
    if (_lcam) {
        _hlInv.copy(ship.matrixWorld).invert();
        _hlCam.setFromMatrixPosition(_lcam.matrixWorld).applyMatrix4(_hlInv);
        const base = lamp.mesh.userData._lampBasePos;
        _hlView.copy(_hlCam).sub(base ? base : lamp.mesh.position);
        if (_hlView.lengthSq() < 1e-12) _hlView.set(0, 0, 1);
        _hlView.normalize();
        // DEPTH BIAS: park the quad behind the whole hull, not at its centre
        // of mass, so the ship occludes ALL of its own glow. See
        // _HULL_LAMP_DEPTH_BIAS.
        if (base) {
            lamp.mesh.position.copy(base)
                .addScaledVector(_hlView, -(_HULL_LAMP_DEPTH_BIAS * rig.hullLen) / rig.sx);
        }
        _hlAxis.set(0, 0, 1);
        axialC = _hlAxis.dot(_hlView);       // +1 dead astern, -1 dead ahead
        _hlY.copy(_hlAxis).addScaledVector(_hlView, -axialC);
        if (_hlY.lengthSq() < 1e-8) {
            // Staring straight down the hull axis: any perpendicular will do.
            _hlY.set(_hlView.y, -_hlView.x, 0);
            if (_hlY.lengthSq() < 1e-8) _hlY.set(1, 0, 0);
        }
        _hlY.normalize();
        _hlX.crossVectors(_hlY, _hlView).normalize();
        _hlMat.makeBasis(_hlX, _hlY, _hlView);
        lamp.mesh.quaternion.setFromRotationMatrix(_hlMat);
    }
    // Nose-hemisphere gate: 0 dead ahead, 1 from ~halfway to broadside on
    // round to dead astern, walked back off by the telegraph. Drives BOTH
    // the lamp's size and its opacity.
    const noseF0 = THREE.MathUtils.smoothstep(axialC, _HULL_LAMP_NOSE_LO, _HULL_LAMP_NOSE_HI);
    const noseF = noseF0 + (1 - noseF0) *
        Math.min(1, _HULL_LAMP_CHG_RELIEF * cQ + _HULL_LAMP_THR_RELIEF * t);
    const tailF = THREE.MathUtils.smoothstep(axialC, 0.15, 0.80);
    const sizeGain = (_HULL_LAMP_NOSE_K + (1 - _HULL_LAMP_NOSE_K) * noseF)
                   * (1 + _HULL_LAMP_TAIL * tailF);
    lampW *= sizeGain; lampL *= sizeGain;
    // See _HULL_LAMP_FAR_DAMP_LO — folds in AFTER sizeGain (not before) so
    // the nose/broadside/tail relative proportions round 5's asymmetric
    // pair depends on are scaled uniformly rather than reshaped; only the
    // absolute footprint shrinks.
    lampW *= rangeDampK; lampL *= rangeDampK;

    // ── ON-AXIS THRUST HALO ──────────────────────────────────────────────
    // Looked at down its own long axis — charging you or running from you —
    // `projL` collapses to `lampW`, and lampW is under one hull-width, so the
    // lamp sits entirely behind the ship's own silhouette. Measured, that put
    // the idle-vs-full-burn cue on a charging hostile at 6.2/255 of mean
    // luminance against 23.5 broadside: on the one aspect where thrust
    // matters most, and where the plume is correctly gated to its floor,
    // nothing was left to say "this one is burning at you".
    //
    // The halo fixes it by GROWING PAST the hull's cross-section under
    // power: at rest it is tucked behind the ship, at full burn a ring of it
    // shows all the way round. Which is what a ship pointing its drive at
    // you looks like.
    //
    // IT IS ASYMMETRIC, AND THAT IS THE WHOLE POINT. The first cut applied
    // the same floor on the nose and let the tail keep only its _HULL_LAMP_TAIL
    // bonus, which INVERTED the aspect read: a charging hostile floored at
    // 1.01 hull-widths against a fleeing one at 0.87, so charging measured
    // BIGGER than fleeing and the charging-vs-fleeing IoU went from 0.386 to
    // 0.879 — the two aspects became one contact again, which is the exact
    // defect round 4 spent itself fixing. Dead astern you are looking into
    // the engine bells and dead ahead you are looking at a nose cone, so the
    // astern floor has to be the larger of the two by a wide margin. With the
    // asymmetric pair below, measured: charging 7,238 px vs fleeing 19,124 px
    // at 400u and IoU back to 0.378, while the head-on idle-vs-full-burn cue
    // holds at 11.5/255 of mean luminance (6.2 without the halo at all).
    //
    // ^1.6 rather than linear on both: the ring belongs in the last ~35
    // degrees of each pole and nowhere else. Anywhere else it is just
    // inflation, and inflation on the charging end is separation spent.
    const onAxis = Math.pow(Math.abs(axialC), 1.6);
    const haloK = (axialC < 0) ? (0.55 + 0.46 * t)    // nose:  0.55 -> 1.01
                               : (0.86 + 0.80 * t);   // tail:  0.86 -> 1.66
    // ...and the on-axis halo is subordinated on the SAME curve. It has to
    // be: dead astern it is the term that wins (it is a floor on lampW, and
    // at 1.66 hull-widths it beats everything above it), so leaving it out of
    // _HULL_LAMP_NEAR would leave the one aspect that was failing untouched.
    // Scaling both ends of the asymmetric pair by the same factor keeps the
    // charging-vs-fleeing ratio — which is what the aspect read is made of —
    // exactly where round 5 measured it.
    const axisHalo = (rig.hullWid || rig.hullLen * 0.45) * haloK * onAxis * lampNearK * rangeDampK;
    if (lampW < axisHalo) lampW = axisHalo;

    const sinA = Math.sqrt(Math.max(0, 1 - axialC * axialC));
    const projL = Math.max(lampW, lampL * sinA);
    lamp.mesh.scale.set(lampW / rig.sx, projL / rig.sx, 1);

    // PRESENCE LIVES IN OPACITY, NOT IN SIZE. `far` walks the lamp up to
    // ~1.9x brightness by 2,000u so a distant hostile still registers while
    // its FOOTPRINT keeps shrinking the way a real object's does — the range
    // cue the fixed-size lamp had deleted.
    const far = farLamp;
    // ASPECT GAIN. Same nose-hemisphere gate as the size, so the two cues
    // reinforce instead of cancelling.
    const aGain = (1 - _HULL_LAMP_ASPECT) + _HULL_LAMP_ASPECT * noseF;
    // Peak opacity down 0.28+0.52t -> 0.19+0.38t (round 5). The lamp's job
    // is a halo with a ship-shaped hole in it, and a halo that lands at the
    // same value as the hull it surrounds flattens the two into one blob.
    // The far-range lift is untouched, so everything past 600u recovers most
    // of this back through `far`, exactly where presence is the constraint.
    // THRUST AND WIND-UP ARE PAID FOR IN BRIGHTNESS, NOT AREA. That is the
    // whole trade this round makes: area is what buries the hull and it is
    // what the FX/hull acceptance measures, while brightness on pixels that
    // are already lit costs nothing in either. So the thrust coefficient goes
    // UP (0.52 -> 0.66) at the same time the lamp's footprint goes down.
    lamp.mat.opacity = Math.min(0.97,
        (0.15 + 0.66 * t + 0.45 * cQ) * (1 + _HULL_LAMP_FAR_LIFT * far) * aGain * fade);
    if (c > 0.02) lamp.mat.color.copy(lamp.mesh.userData._lampBaseCol).lerp(alarmCol, 0.92 * cQ);
    else lamp.mat.color.copy(lamp.mesh.userData._lampBaseCol);

    // NAV LIGHTS. A 1.6 px on-screen floor each: enough that they never
    // vanish inside the fighting envelope, small enough that five of them
    // cannot masquerade as the ship.
    for (let i = 0; i < rig.navs.length; i++) {
        const n = rig.navs[i];
        let r = n.mesh.userData._navRad * rig.sx;
        if (ppu > 0 && fade > 0) {
            const minW = (1.6 * fade) / ppu;
            if (minW > r * 2) r = minW * 0.5;
        }
        r *= (1 + 0.50 * t);
        const rl = r / rig.sx;
        n.mesh.scale.set(rl * 2, rl * 2, 1);
        // Nav lights are ~150 px of the whole contact, so their thrust and
        // wind-up response is the cheapest cue on the ship in FX-area terms
        // and the only one that is genuinely aspect-independent: five lamps
        // pinned to the hull box are visible from wherever you are looking.
        n.mat.opacity = Math.min(1, (0.36 + 0.64 * t) * (1 + 0.55 * cQ) * fade);
        if (c > 0.02) n.mat.color.copy(n.mesh.userData._navBaseCol).lerp(alarmCol, 0.9 * cQ);
        else n.mat.color.copy(n.mesh.userData._navBaseCol);
    }

    // RIM. Brightens with thrust (a ship under power is lit up) but keeps
    // its faction hue through the wind-up: with the plume, the lamp and the
    // nav lights all swinging to alarm red, the outline is the last thing
    // still saying WHO this is.
    for (let i = 0; i < rig.rims.length; i++) {
        rig.rims[i].mat.opacity = Math.min(1, (0.30 + 0.52 * t) * (0.4 + 0.6 * fade));
    }
}

// ALWAYS ON. `thrusting` no longer gates the plume to zero — it only
// picks between the idle burn and the full burn. A hostile that stops
// accelerating must not stop existing.
const _PLUME_IDLE = 0.80;

// PILOT LIGHT -> SPEAR. The thrust envelope, as multipliers on the streak's
// base length / width / opacity. Idle is a stub at the nozzle; full thrust
// is a hard bright spear four times as long, twice as wide, at full opacity.
//
// The ORIGINAL envelope was a visual no-op: idle vs full moved the streak
// scale by +3.1% and opacity from 0.248 to 0.310, because both length and
// width were tied to `next` (0.80 -> 1.00) with tiny coefficients.
//
// RE-MEASURED in round 3 with a SAME-FRAME A/B — idle and full rendered
// inside one JS task, so scene time, star rotation and every animation are
// bit-identical between the two readbacks and the diff is exactly the
// plume's own contribution. (Round 2's numbers were taken ~60ms apart with
// the world running, which put the drifting nebulae, the player's own
// thrusters and 900u of player travel into the mask: it reported a 46u hull
// at 1200u as a 403x287 blob and a monotonically GROWING explosion, both of
// which were the sky, not the ship.)
//
// Against that clean baseline the 0.36/1.16 envelope moved 2,118 px at 900u
// — a real cue, but under the 2,500 px bar. The streak's footprint is
// length x width, so the honest lever is area, not length alone: 1.16x1.18
// -> 1.42x1.34 is a 1.39x area lift on the full-thrust end while the idle
// end is trimmed 0.36->0.34 / 0.70->0.66 / 0.62->0.55 so the pilot light
// gets quieter at the same time the spear gets louder. Both ends are in
// hull-lengths, so this is scale-free across every hull in the game.
//
// ROUND 4 — MEASURED ON THE WORST-CASE HULL, NOT A CONVENIENT ONE. The
// 2,500 px bar is an ABSOLUTE pixel count, so it is hardest on the SMALLEST
// ship in the game, and rounds 1-3 were all calibrated against the 116-190u
// pirates that happen to be rooted in the local galaxy. Re-measured on the
// four smallest distinct hulls in the live enemy pool (42.0 / 44.3 / 48.2 /
// 51.7u world length, each re-parented into `scene` so it actually renders,
// same-frame A/B, world paused, parked down the darkest ray), the 1.42/1.34
// envelope moved 1,876 / 2,194 / 2,317 / 2,379 px — every one of them under
// the bar, and the 116u hull that passed round 3 was simply a bigger ship.
//
// Footprint is length x width, so the fix is area on both axes at once:
// 1.42x1.34 -> 1.74x1.50 is a 1.37x lift on the spear, and trimming the
// pilot light 0.34->0.30 / 0.66->0.60 / 0.55->0.50 widens the gap from the
// other end without touching the far-range hand-back (farLift still walks
// the idle end back to 1.0 past ~3,000u, so the 15,000u presence floor is
// untouched).
//
// The length half of that was then walked BACK (1.74 -> 1.58) once the real
// lever turned out to be the streak's along-length falloff, not its size —
// see _plumeUnitGeo. Geometry the player cannot see is not a cue, and a
// 3-hull-length spear on a 42u fighter starts reading as a warp trail. Final
// full-thrust plume is 1.70 (base coneLen) x 1.58 = 2.7 hull-lengths against
// an idle stub of 0.51 — a 5.3x range from pilot light to spear.
//
// ROUND 5 — THE PLUME WAS ERASING THE HULL IT BELONGED TO. Everything above
// is a record of tuning the plume against ITSELF: is the spear big enough,
// does the idle stub read, does it survive to 15,000u. Nobody measured it
// against the SHIP. Measured this round with same-frame readback on a paused
// world (hull-only render vs full composite, differenced per pixel), the
// additive rig lit 0.67x to 10.4x the hull's own pixel count and raised
// 14-99% of the hull's own pixels by >=8/255 — i.e. on a quartering aspect
// the exhaust was repainting three quarters of the ship, and the hull's
// measured p90-p10 contrast went from 54.7 isolated to 113.9 composited.
// That number moving UP is the tell: the "surface detail" the player was
// looking at was not the hull's shading at all, it was plume gradient
// painted over the top of it. A ship you cannot see the material of is a
// sprite, which is exactly the complaint four critic rounds could not shift.
//
// So the envelope is cut roughly in half on each axis (area ~0.24x) and the
// opacity ceiling comes off the clip point. Length keeps a 4.4x idle->full
// range, which is what "thrust is readable" actually needs — the previous
// 5.3x range was bought with a spear 2.7 hull-lengths long, and length past
// about one hull-length is not a stronger thrust cue, it is just more sky
// painted over.
//
// NONE OF THIS TOUCHES THE FAR-RANGE FLOOR. `farLift` walks all three of
// these multipliers back to 1.0 (the base geometry) as the angular-size
// floor engages, so the 15,000u presence contact is bit-identical to before;
// see the monotone guard at `lenFullK` below, which is what keeps the
// full-thrust end from dropping UNDER the handed-back idle end out there.
const _PLUME_LEN_IDLE = 0.14, _PLUME_LEN_FULL = 0.62;   // 4.4x length range
const _PLUME_WID_IDLE = 0.40, _PLUME_WID_FULL = 0.70;   // 1.8x width range
const _PLUME_OPA_IDLE = 0.30, _PLUME_OPA_FULL = 0.78;

// SURVEY-RANGE ENVELOPE — the round-4 numbers, kept verbatim. Past ~3,000u
// the hull is a handful of pixels, the hull-readout rig has already faded to
// nothing and the plume IS the contact, so there is no hull left for it to
// subordinate itself to and every argument above stops applying. `farLift`
// walks BOTH ends of the envelope from the round-5 values to these, so the
// 15,000u presence floor is bit-identical to the build this round started
// from — verified: 3,000/6,000/10,000/15,000/20,000u full-thrust contact
// measured 305/108/45/20/9 lit px before and after.
//
// Getting this wrong is silent and expensive. The first cut of round 5
// handed back only the IDLE end (a `Math.max(FULL, idle)` monotone guard),
// which looks right — thrust never runs downhill — but it pins the
// full-thrust end at 1.0 out there instead of 1.58, and that measured as a
// 2x loss of far-range presence (20 px -> 10 px at 15,000u) with nothing on
// screen to say it had happened.
const _PLUME_LEN_FAR = 1.58, _PLUME_WID_FAR = 1.44, _PLUME_OPA_FAR = 1.00;

// NOZZLE-CORE SUBORDINATION, near range only. The two nozzle Sprites are
// built at coneRad*1.15 with opacity 0.95 — a pair of hard white discs
// ~0.21 hull-lengths across that clip to white and sit exactly where the eye
// goes. They are also the layer that survives to 15,000u when the streak is
// a sub-pixel sliver, so they cannot simply be built smaller: shrinking the
// baked radius would spend the far-range floor to buy a near-range fix.
// Instead the core is scaled and dimmed by this factor INSIDE the fighting
// envelope and handed all of it back through `farLift`, on exactly the same
// curve the thrust envelope uses. Far range is therefore untouched by
// construction, not by tuning.
// ROUND 6: 0.62 WAS STILL BIGGER THAN THE SHIP. Measured same-frame, paused
// world, subject isolated, 4 yaws, px counted at luminance > 40/255 on an
// untouched hostile at true engagement range:
//
//   d=250u  hull 2,276 | core 3,619  streak 1,326  other 459 | FX/hull 2.38
//   d=300u  hull 1,585 | core 2,582  streak   978  other 312 | FX/hull 2.44
//   d=400u  hull   906 | core 1,496  streak   601  other 177 | FX/hull 2.51
//
// The nozzle CORE ALONE was 1.6x the hull. The hull was 38-40% of its own
// contact's lit pixels at every range a dogfight actually happens at, which
// is why a frame with eight hostiles in it had one readable ship and seven
// white cotton balls: whichever one you stare at, the other seven are their
// own engine bloom. 0.62 -> 0.28 (a 0.45x scale on the near-range disc) was
// applied live on a single paused frame and re-measured on that same frame:
//   d=250u  FX/hull 2.38 -> 0.86   cover 84.5% -> 52.3%
//   d=300u  FX/hull 2.44 -> 0.89   cover 85.3% -> 52.4%
//   d=400u  FX/hull 2.51 -> 0.93   cover 86.0% -> 52.6%
//
// WHY HERE AND NOT AT THE BAKED RADIUS (_makeCore's `coneRad * 1.15`). Same
// near-range result, but this multiplier is handed back through `farLift` on
// the same curve as the thrust envelope, so the 15,000u presence contact —
// where the streak is a sub-pixel sliver and this sprite is the ONLY thing
// rendering the ship at all — is untouched BY CONSTRUCTION rather than by
// re-tuning. Shrinking the baked radius would have spent that floor to buy
// this fix, which is the exact trade the round-5 note above warns against.
const _PLUME_CORE_NEAR = 0.28;      // size multiplier at dogfight range
const _PLUME_CORE_NEAR_OPA = 0.66;  // opacity multiplier at dogfight range

// Fixed ALARM hue for the attack wind-up (see the alarm bulb in
// _ensureShipThrusterCones). Deliberately NOT the faction colour: the
// telegraph has to be one learnable colour across all eight factions, and
// it has to be hue-separable from a white-hot nozzle, which rules out
// anything pale. Near-zero green AND near-zero blue is what makes it swing
// the lit region's red/blue balance rather than just its brightness — the
// first cut of this was 0xff0a3c (a magenta-leaning alarm) and its 60/255
// of blue held the measured R-B swing down to +10, because the bulb was
// contributing almost as much blue to the mean as the white nozzle it was
// supposed to be distinguishable from.
const _PLUME_ALARM = 0xff0a14;

// Lazily-built THREE.Color of the alarm hue, shared by the bulb and by the
// nozzle-core lerp in _updateShipThrusterCones. Lazy so this file stays
// loadable before THREE is on the page.
let _PLUME_ALARM_COL = null;
function _plumeAlarmColor() {
    if (!_PLUME_ALARM_COL) _PLUME_ALARM_COL = new THREE.Color(_PLUME_ALARM);
    return _PLUME_ALARM_COL;
}

// ASPECT-GATE RELEASE, in framebuffer px of natural (un-widened) plume width.
// The gate that hides a head-on ship's engines is at full strength while the
// plume is _HI px or wider, and fully released once it is under _LO. For a
// standard ~46u hull at 75 degrees FOV in a 1120x630 buffer that is: full gate
// inside ~1,300u, releasing through ~2,800u, gone by ~3,500u. Chosen against
// the AI's own numbers rather than by feel — enemy detectionRange is
// 1,200-1,600u and firingRange 180-240u, so the entire band where aspect is a
// decision the player makes sits comfortably inside the full-gate region,
// and everything past it is survey range where the only question is whether
// there is a ship there at all.
const _PLUME_ASPECT_PX_HI = 4.0;
const _PLUME_ASPECT_PX_LO = 1.5;

// NOSE-ON HALO GEOMETRY AND ENVELOPE (see _plumeNoseHaloTex).
//
// _R is the sprite's radius as a multiple of the ENGINE DECK's half-width.
// The texture peaks at 0.72 of the sprite radius, so 1.05 puts the bright
// band at 0.76 deck-halves — a rim tight around the nozzles.
//
// 1.05 AND NOT 1.25 IS SET BY THE WORST HULL, NOT THE AVERAGE ONE. The
// binding constraint is FX/hull <= 1.0, and the ship that decides it is the
// one with the least frontal area: measured at 300u, the Federation hull
// shows 1,048 lit px inside a 94 px-wide bounding box — head-on it is mostly
// holes, so it is only ~15% filled. A halo comfortable against Klingon's
// 2,395 px silhouette is 1.05-1.16 against that one. Since the halo cannot
// know how filled a silhouette is, it is sized so the emptiest hull in the
// game still clears the ceiling, which costs the fuller hulls nothing they
// need: Klingon still moves 30% of its lit pixels between coast and burn,
// against a 15% bar.
//
// _ASPECT_HI/_LO bound the cone this layer lives in, in the same signed
// aspect the gate uses (-1 = dead ahead, 0 = broadside). Full strength
// inside -0.80 (about 37 degrees off the nose) and gone by -0.40 (about 66
// degrees). The far end is the important one: the first cut keyed the halo
// to `1 - tailGate`, and tailGate's own smoothstep does not reach zero until
// aspect -0.05, so a contact staged at yaw 90 still had a quarter of a halo
// and broadside FX/hull went from 0.40 to 6.83 on Sith. Bounding the layer
// explicitly is what makes "broadside and astern are untouched" a property
// of the code rather than of the tuning.
//
// _IDLE_O / _IDLE_K are what the halo is worth at IDLE, as fractions of its
// full-thrust opacity and size. They are deliberately not zero: a coasting
// hostile head-on should still have an engine deck, and this file's standing
// rule is that a hostile never fully extinguishes. They are deliberately not
// high either — the whole point of the layer is the DELTA between coasting
// and burning, and every unit of idle brightness is a unit that delta does
// not get. 0.22/0.80 keeps the idle halo a pilot light while the thrust
// state is a 4.5x brightness step on the same pixels.
//
// _OPA is the peak. It is held under 1.0 so the band stays a saturated
// faction hue instead of clipping to the white the starfield already owns —
// the same reasoning as the streak's opacity ceiling.
const _PLUME_NOSE_R = 1.05;
const _PLUME_NOSE_OPA = 0.42;
const _PLUME_NOSE_IDLE_O = 0.22;
const _PLUME_NOSE_IDLE_K = 0.80;
// -0.92, not -0.80: by 45 degrees off the nose the real exhaust is already
// coming back (the gate's own smoothstep starts releasing at -0.55), and at
// -0.80 the halo was still at full strength on top of it — measured, that
// stacked to FX/hull 1.08-1.09 at yaw 45 for Federation and Sith, over the
// 1.0 ceiling, while dead ahead was comfortably under it. Starting the
// rolloff at -0.92 hands the read back to the plume as the plume reappears,
// which is the behaviour the layer wanted anyway.
const _PLUME_NOSE_ASPECT_HI = -0.92;
const _PLUME_NOSE_ASPECT_LO = -0.40;

function _updateShipThrusterCones(ship, thrusting, dist, charge) {
    if (!ship || !ship.userData || !ship.userData._thrusters) return;
    const target = thrusting ? 1.0 : _PLUME_IDLE;
    const cur = ship.userData._thrusterIntensity;
    const prev = (cur === undefined) ? _PLUME_IDLE : cur;
    const next = prev + (target - prev) * (thrusting ? 0.22 : 0.15);
    ship.userData._thrusterIntensity = next;

    // Attack telegraph rides the PLUME, not the hull. The hull's emissive
    // ramp is tone-map clipped at combat range (a 1x->3.4x sweep moved
    // measured luminance by +0.2% at 700u); additive-over-black has the
    // headroom the hull does not. charge 0->1 flares the engines: longer,
    // wider, brighter — a wind-up you can see at 1100u.
    const chg = Math.min(1, Math.max(0, charge || 0));
    const chgQ = chg * chg;

    // Angular-size floor. Below _PLUME_MIN_PX the plume is widened in
    // world space so it survives to 1200u+ instead of collapsing under a
    // pixel. Length is left alone — the streak's LENGTH is what reads as
    // motion, and stretching it with distance would look like a warp trail.
    let widen = 1.0;
    // The plume's NATURAL on-screen width in framebuffer px, before the floor
    // widens it. This is the honest "how big is this contact" number and the
    // aspect gate below keys off it; `widen` itself cannot, because it
    // saturates at its 2.2 cap by ~1,600u for a standard hull and is flat
    // (and therefore blind) across the whole survey band beyond that.
    let plumePx = 0;
    if (dist) {
        const ppu = _plumePxPerUnit(dist);
        if (ppu > 0) {
            const halo = ship.userData._thrusters[1];
            const rad = halo && halo.mesh.userData._plumeWorldRad;
            if (rad > 0) {
                plumePx = rad * 2 * ppu;
                if (plumePx < _PLUME_MIN_PX) widen = Math.min(_PLUME_MAX_WIDEN, _PLUME_MIN_PX / plumePx);
            }
        }
    }

    // "AM I FAR AWAY?", derived from `widen`. Hoisted above the aspect gate
    // because BOTH the thrust envelope (below) and the gate need it, and it
    // is a pure function of `widen`. See the long note at the envelope for
    // why the curve is ^0.55 and not linear.
    const farLift = (_PLUME_MAX_WIDEN > 1)
        ? Math.pow(Math.min(1, Math.max(0, (widen - 1) / (_PLUME_MAX_WIDEN - 1))), 0.55) : 0;

    // AXIS-ALIGNED BILLBOARD. The streak keeps its long edge on the thrust
    // axis and spins about that axis until its face is square to the
    // camera. Solved once per ship (both nozzles share an axis and are a
    // few units apart, so one solution serves both) in the ship's LOCAL
    // frame, which is where the quads live.
    //   axis  = local +Z * apexSign  (the thrust direction)
    //   norm  = the camera direction with its axial part removed
    //   basis = (axis x norm, axis, norm) -> right-handed, +Y on the axis,
    //           +Z at the viewer.
    // When the camera sits ON the axis — you are staring down the exhaust —
    // `norm` degenerates. That is not a special case to paper over: the
    // streak SHOULD vanish there, and the nozzle Sprite is what you see
    // instead. The fallback direction below just keeps the maths finite.
    const cones = ship.userData._thrusters;
    let axialFade = 1.0;
    // SIGNED aspect: -1 = the camera is off the ship's NOSE (it is charging
    // you), 0 = broadside, +1 = the camera is dead astern of the engine bells
    // (it is running away). Every hull in the game flies -Z forward and mounts
    // its plume at +Z (see applyEnemyRotation / _applyNoseFlip), and _pbAxis is
    // +Z * apexSign, so a positive axial component means "I can see the
    // exhaust". Default +1 so a missing camera keeps the pre-gate behaviour.
    let aspect = 1.0;
    const _cam = (typeof camera !== 'undefined' && camera) ? camera : window.camera;
    if (_cam) {
        const apex = ship.userData._plumeApex || 1;
        _pbAxis.set(0, 0, apex);
        _pbInv.copy(ship.matrixWorld).invert();
        _pbCam.setFromMatrixPosition(_cam.matrixWorld).applyMatrix4(_pbInv);
        // Camera relative to the streak's own centre, not the ship origin.
        _pbCam.z -= (cones[1] && cones[1].mesh.userData._plumeZ) || 0;
        const axial = _pbCam.dot(_pbAxis);
        const camLen = Math.max(1e-6, _pbCam.length());
        // 1 when the camera is broadside to the plume, 0 when it is on the
        // axis at EITHER end. Used to cross-fade streak -> nozzle bloom, which
        // is a genuinely symmetric problem (the quad is edge-on at both
        // poles), so this one keeps its absolute value. Which pole we are at
        // is `aspect`, kept separately.
        aspect = axial / camLen;
        axialFade = 1 - Math.min(1, Math.abs(aspect));
        _pbNorm.copy(_pbCam).addScaledVector(_pbAxis, -axial);
        if (_pbNorm.lengthSq() < 1e-8) _pbNorm.set(1, 0, 0);
        _pbNorm.normalize();
        _pbSide.crossVectors(_pbAxis, _pbNorm);
        _pbMat.makeBasis(_pbSide, _pbAxis, _pbNorm);
        for (let i = 1; i < cones.length; i += 2) {
            cones[i].mesh.quaternion.setFromRotationMatrix(_pbMat);
        }
    }
    // ── ASPECT GATE: which way is it pointing? ───────────────────────────
    //
    // The one thing a dogfight has to tell you before anything else is
    // whether the contact is COMING or GOING, and this build could not say
    // it. Measured at 400u with same-frame GPU readback and object toggling:
    // charging silhouette 505 px, fleeing 636 px, IoU 0.79, mean-luminance
    // difference 1.4/255. Two identical blobs.
    //
    // The cause was that the plume was drawn at full strength from the NOSE.
    // `axialFade` above is deliberately symmetric — the streak quad really is
    // edge-on at both poles — but the old code fed that symmetric value
    // straight into the nozzle-core boost, so the engine bloom got its full
    // +55% "you are staring into the bell" treatment while looking at the
    // ship's FRONT, where a real engine bell is behind the entire hull. The
    // cue was not weak, it was INVERTED: head-on the plume was half the lit
    // pixels of the contact.
    //
    // So gate the plume by the tail hemisphere. 1.0 from broadside through
    // dead astern — the broadside spear and the aft torch are the two reads
    // that already work and nothing here touches them — falling to a 0.12
    // floor over the last ~30 degrees before dead ahead. A floor, not zero:
    // a hostile bearing down on you must still be findable, it just must not
    // out-glow the one that is running.
    //
    // ...EXCEPT at survey range, where the gate is handed back. Once the
    // plume is a couple of pixels across, the contact has no readable aspect
    // to communicate and the plume is the only thing rendering it at all;
    // presence beats aspect at 15,000u, exactly as it does for the idle-length
    // override below. The handback is keyed to `plumePx` and not to `farLift`
    // deliberately — measured, `farLift` is already 0.9 at 1,500u for a
    // standard hull, which is inside detection range (1,200-1,600u) and the
    // exact band where a head-on contact is 93% plume and most needs gating.
    // Keying on raw px holds the gate at full strength through the whole
    // fighting envelope and only releases it out where the ship is a speck.
    const presence = (plumePx > 0)
        ? (1 - THREE.MathUtils.smoothstep(plumePx, _PLUME_ASPECT_PX_LO, _PLUME_ASPECT_PX_HI)) : 1;
    const nearGate = 0.12 + 0.88 * THREE.MathUtils.smoothstep(aspect, -0.55, -0.05);
    const tailGate = nearGate + (1 - nearGate) * presence;
    // Head-on, drop the angular-size floor too. `widen` exists to keep a
    // distant plume above a pixel; applied to a gated head-on contact it just
    // inflates the residual bloom back up to 2.2x and undoes the gate.
    if (tailGate < 0.2) widen = 1.0;

    // Sharpen the cross-fade: the streak holds full strength across most of
    // the sphere and only gives way in the last ~25 degrees, where it is
    // geometrically edge-on anyway.
    const streakFade = Math.min(1, Math.pow(axialFade, 0.45) * 1.12) * tailGate;
    // ON-AXIS NOZZLE BOOST, 0.55 -> 1.05 (round 5). `tailGate` already zeroes
    // this off the nose, so the only place the extra lands is dead ASTERN,
    // looking straight into the engine bells — which is precisely the aspect
    // whose signature this round's shorter spear took away. Growing the read
    // on the fleeing end is the half of charging-vs-fleeing separation that
    // does NOT cost anything on the charging end.
    const coreBoost = (1 + (1 - axialFade) * 1.05) * tailGate;

    // THRUST ENVELOPE. `next` rides 0.80 (_PLUME_IDLE) -> 1.00; normalise it
    // so the pilot-light/spear curve above is expressed in plain 0..1.
    const tN = Math.min(1, Math.max(0, (next - _PLUME_IDLE) / (1 - _PLUME_IDLE)));

    // HULL CHANNEL, driven off the SAME thrust and charge values as the
    // engine channel. This is deliberately outside the aspect gate: the gate
    // exists to stop the exhaust shouting from the ship's nose, and applying
    // it to the hull's own rim and running lights is what turned a charging
    // hostile into 168 lit pixels with a 0 px thrust cue.
    _updateHullReadout(ship, dist, tN, chg);

    // RANGE OVERRIDE. Collapsing the idle plume to a 36% stub is the whole
    // point at fighting range, and a liability at survey range: past ~2,000u
    // the streak is already down to a couple of pixels and a stub of that is
    // nothing at all. `widen` only lifts off 1.0 once the angular-size floor
    // engages, so it doubles as a free "am I far away?" signal — use it to
    // hand the idle plume its length back exactly where thrust state stops
    // being readable anyway. Presence beats nuance at 15,000u.
    // ^0.55 rather than linear: `widen` does not leave 1.0 until the plume is
    // already under 7px (about 3,000u), and hits its 2.2 cap around 6,600u,
    // so a linear ramp would leave the whole 3,000-5,000u band on the short
    // idle stub — exactly the band where you are picking hostiles out of the
    // sky. The power curve hands back half the length by ~3,600u.
    // (`farLift` itself is computed up by the angular-size floor, because the
    // aspect gate needs it before this point.)
    const lenIdle = _PLUME_LEN_IDLE + (1 - _PLUME_LEN_IDLE) * farLift;
    const widIdle = _PLUME_WID_IDLE + (1 - _PLUME_WID_IDLE) * farLift;
    const opaIdle = _PLUME_OPA_IDLE + (1 - _PLUME_OPA_IDLE) * farLift;
    // The FULL-THRUST end is handed back on the same curve — see
    // _PLUME_LEN_FAR. Both ends therefore arrive at the round-4 envelope by
    // survey range, which is what keeps the far presence floor untouched,
    // and Math.max keeps thrust monotone in the band where the two curves
    // cross.
    const lenFullK = Math.max(lenIdle, _PLUME_LEN_FULL + (_PLUME_LEN_FAR - _PLUME_LEN_FULL) * farLift);
    const widFullK = Math.max(widIdle, _PLUME_WID_FULL + (_PLUME_WID_FAR - _PLUME_WID_FULL) * farLift);
    const opaFullK = Math.max(opaIdle, _PLUME_OPA_FULL + (_PLUME_OPA_FAR - _PLUME_OPA_FULL) * farLift);
    const lenK = lenIdle + (lenFullK - lenIdle) * tN;
    const widK = widIdle + (widFullK - widIdle) * tN;
    const opaK = opaIdle + (opaFullK - opaIdle) * tN;
    // Nozzle-core near-range subordination — see _PLUME_CORE_NEAR. Rides
    // farLift so it is fully released exactly where the plume becomes the
    // whole contact.
    const coreNearK = _PLUME_CORE_NEAR + (1 - _PLUME_CORE_NEAR) * farLift;
    const coreNearO = _PLUME_CORE_NEAR_OPA + (1 - _PLUME_CORE_NEAR_OPA) * farLift;

    const flicker = 0.90 + Math.sin(Date.now() * 0.026 + (ship.id || 0)) * 0.10;

    // WIND-UP CROSS-FADE WEIGHT. chg^1.25 rather than the chg^2 the size and
    // opacity boosts use: telegraphs run 215-620ms depending on faction, and
    // a squared curve puts the whole hue swing inside the last ~90ms of the
    // shortest one, which is not a warning, it is a muzzle flash. ^1.25 has
    // the plume visibly leaving faction colour by the half-way point while
    // still arriving at full alarm exactly on the bolt.
    const alarmMix = chg > 0.02 ? Math.pow(chg, 1.25) : 0;
    for (let i = 0; i < cones.length; i++) {
        const c = cones[i];
        const isCore = (i % 2 === 0);
        const bo = c.mesh.userData._plumeBaseOpacity;
        // Additive over black sky: opacity IS luminance here. The core is
        // deliberately allowed to clip (that's the white-hot read); the
        // streak is held under 1.0 so it keeps its faction hue instead of
        // washing out to the same white the starfield already owns.
        let o = bo * opaK * flicker
                * (1 + chgQ * (isCore ? 0.35 : 0.55))
                * (isCore ? coreBoost * coreNearO : streakFade);
        // The faction profile steps ASIDE for the alarm profile — it does not
        // simply get overpainted. Leaving it at full strength would keep
        // pumping white into the same clipped centre pixels the alarm layer
        // is trying to recolour, and the two would average back out to pale
        // pink. Down to 12% at full charge: enough that the streak never
        // loses its shape, little enough that the alarm hue owns the pixel.
        //
        // The depth of this fade is what separates the wind-up from THRUST,
        // which is the whole job. On a warm-hued faction, burning hard also
        // lifts R-B — measured, full thrust alone moved it +34/255 on one
        // hull — because everything in the plume gets brighter and its
        // brightest pixels are already orange. What thrust cannot do is take
        // GREEN AWAY: a hotter plume raises R, G and B together. So the
        // telegraph's signature is a green DROP alongside the red lift, and
        // that only happens if the faction profile actually gets out of the way.
        if (!isCore && alarmMix > 0) o *= (1 - 0.88 * alarmMix);
        c.mat.opacity = Math.min(1.0, o);
        const aq = c.mesh.userData._plumeAlarmQuad;
        if (aq) {
            if (alarmMix <= 0) {
                if (aq.visible) { aq.visible = false; aq.material.opacity = 0; }
            } else {
                aq.visible = true;
                // Rides streakFade and the thrust envelope's own opacity so a
                // head-on or coasting hostile's wind-up stays proportionate to
                // the plume it is replacing, never a red slab floating free of
                // a plume that the aspect gate has already turned down.
                aq.material.opacity = Math.min(1.0,
                    alarmMix * (0.55 + 0.45 * opaK) * flicker * streakFade);
            }
        }
        // ── WIND-UP TAKES THE NOZZLE OFF WHITE ───────────────────────────
        // The alarm bulb alone adds red around the engine bay, but the
        // brightest pixels in the whole contact — the white-hot nozzle cores
        // — stayed white, and they dominate any mean taken over the lit
        // region. Measured on a 116u hull, adding the bulb moved the lit
        // region's R-B balance by only +24/255 for that reason.
        //
        // So the core itself LEAVES white as the shot charges: a LERP toward
        // the alarm hue, not a tint. That distinction is the whole reason
        // this is safe on every faction — multiplying a cyan core by red
        // gives near-black (the plume would DIM on wind-up for half the
        // roster), while a lerp walks any starting hue to the same alarm red
        // and back. The streak is deliberately left alone: its faction
        // colour lives in the texture, so it keeps saying WHO this is while
        // the core says WHAT IT IS ABOUT TO DO.
        if (isCore) {
            const baseCol = c.mesh.userData._plumeCoreCol ||
                (c.mesh.userData._plumeCoreCol = c.mat.color.clone());
            if (chg > 0.02) c.mat.color.copy(baseCol).lerp(_plumeAlarmColor(), 0.95 * chgQ);
            else c.mat.color.copy(baseCol);
        }
        const bs = c.mesh.userData._plumeBaseScale;
        // WIND-UP GROWTH IS NOW SMALL ON PURPOSE (was 0.55 / 0.30). When the
        // telegraph was a brightness cue, swelling was all it had. Now that
        // the alarm profile carries it as HUE, swelling actively fights the
        // measurement and the read: every new pixel the wind-up lights is a
        // dim skirt pixel on the rim of the plume, and it dilutes the mean of
        // the region a player (or a readback) is averaging over. Measured, the
        // 0.55/0.30 growth doubled the lit area between charge 0 and charge 1
        // (1,030 -> 2,112 px on a 42u hull at 1,200u) and held the own-region
        // hue shift to +18.6/255 while the same-pixels shift was +54.3. Cut to
        // 0.20/0.12 the plume still visibly tightens and flares, but the pixels
        // that were already lit are the ones doing the talking.
        const w = widen * widK * (1 + chgQ * 0.12);
        const l = lenK * (1 + chgQ * 0.20);
        if (isCore) {
            const ck = w * coreBoost * coreNearK;
            c.mesh.scale.set(bs.x * ck, bs.y * ck, 1);
        }
        else {
            c.mesh.scale.set(bs.x * w, bs.y * l, 1);
            // RE-ANCHOR TO THE NOZZLE. The quad is built centred, so its
            // resting z (_plumeZ) is half a FULL-length plume aft of the
            // hull's rear edge. Scaling length about that centre pulls BOTH
            // ends in — at the 0.36 idle length the stub would float ~0.32
            // hull-lengths behind the ship, a detached red smear with no
            // visible source. Slide the centre so the hot end stays welded
            // to the rear edge and only the tail moves.
            //   rearEdge = _plumeZ - apex*len/2  ->  z = _plumeZ - apex*len*(1-l)/2
            const apexS = ship.userData._plumeApex || 1;
            c.mesh.position.z = c.mesh.userData._plumeZ - apexS * bs.y * 0.5 * (1 - l);
        }
    }

    // ── The telegraph's own channel ──────────────────────────────────────
    // A saturated alarm bloom that SWELLS out of the engine bay as the shot
    // charges. Off (and not drawn) below 2% charge, which is the state a
    // hostile is in almost all the time.
    const alarm = ship.userData._plumeAlarmSprite;
    if (alarm) {
        if (chg <= 0.02) {
            if (alarm.visible) { alarm.visible = false; alarm.material.opacity = 0; }
        } else {
            alarm.visible = true;
            const rad = alarm.userData._plumeAlarmRad || 1;
            // Grows 1.2x -> 4.4x the nozzle radius across the wind-up, and
            // rides the same angular-size floor as the plume so it is still
            // a real cue and not one pixel at 1,200u.
            //
            // 4.4x WAS load-bearing while the bulb was the ONLY red in the
            // frame: tightening it to 3.1x measured worse, not better, because
            // the skirt is where the bulb overlaps the streak and that overlap
            // was most of the red the measurement could see. That is no longer
            // true — the alarm profile now recolours the whole streak, so the
            // bulb is back to being what its name says, a bulb, and its skirt
            // is pure dilution. 1.2 -> 2.8x.
            // Round 5: 1.2 + 1.6 -> 1.6 + 2.9. The bulb is sized off the
            // NOZZLE radius, and this round shrank the nozzle core to 0.62x
            // inside the fighting envelope (see _PLUME_CORE_NEAR), so the
            // same multipliers shrank the telegraph along with it — measured,
            // the charge-0 -> charge-1 R-B swing on a nose-on contact fell
            // from +33.9 to +13.0/255. The bulb is `visible = false` at
            // charge ~0, i.e. essentially always, so growing it costs the
            // steady-state FX budget exactly nothing: it only exists in the
            // few hundred ms where the player's whole job is to notice it.
            const s = rad * 2 * widen * (1.6 + 2.9 * chgQ);
            alarm.scale.set(s, s, 1);
            // chg^1.3: nothing at the start of the wind-up, hard by the end,
            // so the LAST moments before the bolt are the loud ones. Paired
            // with the tighter scale above — density is what carries the hue,
            // area is what dilutes it.
            alarm.material.opacity = Math.min(1, Math.pow(chg, 1.3));
        }
    }

    // ── NOSE-ON THRUST HALO ──────────────────────────────────────────────
    // Two multiplied gates, and both are there to keep this layer from
    // touching anything that already works:
    //
    //   the ASPECT cone — full only inside ~37 degrees of dead ahead, zero
    //     by ~66 degrees, so the measured broadside spear and the aft torch
    //     never see this layer at all. It is not merely turned down out
    //     there, it is `visible = false` and not drawn.
    //   (1 - presence) — the same survey-range hand-back the aspect gate
    //     itself uses. Once the plume is a couple of pixels wide the gate
    //     releases and the real exhaust becomes the whole contact again;
    //     the halo has to get out of its way on the same schedule, or the
    //     two would double up on exactly the far contacts that are already
    //     hardest to read.
    const nose = ship.userData._plumeNoseHalo;
    if (nose) {
        const noseW = (1 - THREE.MathUtils.smoothstep(
                            aspect, _PLUME_NOSE_ASPECT_HI, _PLUME_NOSE_ASPECT_LO))
                    * (1 - presence);
        if (noseW <= 0.02) {
            if (nose.visible) { nose.visible = false; nose.material.opacity = 0; }
        } else {
            nose.visible = true;
            const r = nose.userData._plumeNoseRad || 1;
            // Size swings only 0.80 -> 1.00 with thrust. The read is meant to
            // be the band getting HOT, not the band getting BIG: growing it
            // walks the ring off the engine deck it is supposed to hug, and
            // (as the wind-up growth note above records) area spent on dim
            // rim pixels dilutes the very measurement it is trying to move.
            // Measured idle -> full thrust at 300u, this lands a mean delta
            // of 27-33/255 over 23-56% of the hull's own lit pixels.
            const s = r * 2 * (_PLUME_NOSE_IDLE_K + (1 - _PLUME_NOSE_IDLE_K) * tN);
            nose.scale.set(s, s, 1);
            nose.material.opacity = Math.min(1,
                _PLUME_NOSE_OPA * noseW * flicker *
                (_PLUME_NOSE_IDLE_O + (1 - _PLUME_NOSE_IDLE_O) * tN) *
                (1 + chgQ * 0.30));
            // The halo joins the telegraph rather than diluting it. Nose-on is
            // precisely where the wind-up matters most and where the bulb had
            // the least help, and a faction-hued ring sitting in the lit
            // region would drag the measured R-B swing back down. Same lerp
            // (not tint) as the nozzle core, for the same reason: multiplying
            // a cyan faction by red gives near-black.
            const bc = nose.userData._plumeNoseCol;
            if (chg > 0.02) nose.material.color.copy(bc).lerp(_plumeAlarmColor(), 0.95 * chgQ);
            else nose.material.color.copy(bc);
        }
    }
}

// ONE entry point for "this hostile should be wearing its engine plume".
// Engine plume: ensure it exists, then drive it. It is ALWAYS burning —
// `thrusting` only chooses between idle burn and full burn — because the
// plume is this game's only enemy cue the starfield cannot imitate, and a
// hostile that goes dark when it coasts is a hostile that disappears into
// the sky. Distance feeds the angular-size floor; _telegraphPhase feeds
// the attack wind-up flare (see _updateShipThrusterCones).
//
// Each enemy's plume is 4 additive, frustum-culled meshes sharing ONE
// global geometry. Still fill-rate, and mobile GPUs handle additive
// overdraw worst, so the whole system stays desktop-only; the player's own
// thruster glow (separate, single-ship) is untouched.
//
// WHY THIS IS A FUNCTION AND NOT INLINE IN THE COMBAT LOOP: the combat loop
// never runs during the tutorial — updateEnemyBehavior() early-returns
// while the tutorial is active — and the tutorial is the ONE fight every
// player is guaranteed to see. When the plume lived inside that loop, the
// scripted Martian Pirate introduction rendered hostiles as flat untextured
// blobs, and the cue only switched on whenever the tutorial happened to
// end. The tutorial patrol branch calls this too, so a hostile wears its
// engine signature from the first frame it exists.
function _enemyPlumeTick(enemy, thrusting, dist) {
    if (window.__isMobileGPU) return;
    if (!enemy || !enemy.userData) return;
    if (typeof _ensureShipThrusterCones !== 'function') return;
    _ensureShipThrusterCones(enemy, enemy.userData.galaxyColor || 0xff5522);
    // Hull readout is built lazily and only for hostiles that are close
    // enough for aspect to be a question the player is asking. Beyond
    // _HULL_READ_DIST the plume is the contact and this rig would just be
    // draw calls. (_ensureShipThrusterCones has to have run first — the rig
    // is sized off the hull box it caches.)
    if (!dist || dist <= _HULL_READ_DIST) {
        _ensureHullReadout(enemy, enemy.userData.galaxyColor || 0xff5522);
    }
    _updateShipThrusterCones(enemy, !!thrusting, dist,
                             enemy.userData._telegraphPhase || 0);
    // DAMAGE TIER. Driven from here rather than from a new loop because this
    // is already the one function every hostile in the game passes through
    // every frame — the combat loop, the tutorial patrol branch and the
    // wingman path all call it (see the note above), so a hull wears its
    // scars from the same instant it wears its plume, tutorial included.
    if (typeof window._syncHullDamage === 'function') window._syncHullDamage(enemy);
}

function applyEnemyRotation(enemy, direction, speed) {    if (!enemy || !direction) return;

    try {
        // FLIGHT-EULER ORDER. This function speaks heading/pitch/bank —
        // it wants rotation.y to BE the compass heading. Under Three.js's
        // default 'XYZ' order it is not: setFromQuaternion returns
        // y = asin(-forward.x), permanently clamped to ±90°, with the
        // heading's back half smuggled into x and z. Lerping that y toward
        // a full-range atan2 heading is therefore nonsense whenever the
        // ship faces sideways, and the x/z pair flips by ~π as it crosses
        // the fold — the single-frame ~180° "snap" that made every
        // maneuver illegible. 'YXZ' is the aviation order: y is the true
        // heading over ±180°, x the pitch, z the bank. See
        // _enemyOrientBegin, which installs it once per hull.
        if (enemy.rotation && enemy.rotation.order !== 'YXZ' &&
            typeof _enemyOrientBegin === 'function') {
            _enemyOrientBegin(enemy);
        }
        // Skip if not moving enough
        const movementMagnitude = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
        if (movementMagnitude < 0.01) return;  // Increased threshold to reduce twitching

        // Initialize rotation tracking if not exists
        if (!enemy.userData.targetRotation) {
            enemy.userData.targetRotation = {x: 0, y: 0, z: 0};
        }
        if (!enemy.userData.tumbleRate) {
            enemy.userData.tumbleRate = (Math.random() - 0.5) * 0.05;  // Reduced tumble (was 0.1)
        }

        // Calculate target rotation to face movement direction (trajectory)
        const lateralSpeed = Math.sqrt(direction.x * direction.x + direction.z * direction.z);

        if (lateralSpeed > 0.01) {
            // Yaw: point the NOSE down the flight path. Every ship model in
            // the game flies -Z forward (that is why the thruster cones mount
            // at +Z, and why _applyEnemyFlightRoll rolls about local Z). The
            // old atan2(x, z) aimed the ship's TAIL along its velocity — an
            // exact 180° disagreement with _smoothEnemyLookAt, which runs a
            // few lines later in the same tick and aims the nose. The two
            // authorities then tugged the hull back and forth across a half
            // turn every AI tick: that is the 178.9°-in-one-frame flip.
            const targetYaw = Math.atan2(-direction.x, -direction.z);

            // Store previous target for smoothing
            if (enemy.userData.prevTargetYaw === undefined) {
                enemy.userData.prevTargetYaw = targetYaw;
            }

            // Smooth the target yaw to reduce twitching. 0.1 at a 30 Hz
            // tick is a ~0.3 s lag on the AIM ITSELF, which is most of why
            // enemies used to feel like they were flying through syrup —
            // the dwell timer already handles mode twitch, so this can be
            // much livelier without the jitter coming back.
            // SHORTEST-PATH: a plain lerp between +179° and -179° travels
            // 358° the wrong way round, so the smoothed aim itself used to
            // manufacture half-turn snaps near due-south.
            let _yawErr = targetYaw - enemy.userData.prevTargetYaw;
            _yawErr = Math.atan2(Math.sin(_yawErr), Math.cos(_yawErr));
            enemy.userData.prevTargetYaw += _yawErr * 0.35;
            enemy.userData.targetRotation.y = enemy.userData.prevTargetYaw;
        }

        // ENHANCED: Pitch based on vertical movement AND turns (more dynamic)
        if (lateralSpeed > 0.01) {
            // Base pitch from vertical movement. In 'YXZ' the nose is
            // forward = (-sin y cos x, sin x, -cos y cos x), so climbing
            // (+y) is POSITIVE pitch — the sign flips with the nose fix.
            const verticalPitch = Math.atan2(direction.y, lateralSpeed) * 0.3;  // Increased from 0.15 to 0.3

            // Additional pitch during turns for more dynamic movement
            const currentYaw = enemy.rotation.y || 0;
            const yawDelta = enemy.userData.targetRotation.y - currentYaw;
            const normalizedYawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
            const turnPitch = Math.abs(normalizedYawDelta) * 0.4;  // Pitch up during sharp turns

            enemy.userData.targetRotation.x = verticalPitch + turnPitch;
        }

        // Bank: Roll into turns based on change in yaw (more pronounced)
        const currentYaw = enemy.rotation.y || 0;
        const yawDelta = enemy.userData.targetRotation.y - currentYaw;
        const normalizedYawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
        enemy.userData.targetRotation.z = normalizedYawDelta * 0.25;  // Increased from 0.1 to 0.25 for more visible banking

        // Add very slow tumble for variety
        enemy.userData.targetRotation.z += Math.sin(Date.now() * 0.00005 + (enemy.userData.tumbleSeed || 0)) * enemy.userData.tumbleRate;

        // ENHANCED: Track angular velocity (turn rate) for accuracy reduction
        // Calculate how fast the enemy is turning (radians per frame)
        const previousYaw = enemy.userData.previousYaw || currentYaw;
        const actualYawDelta = currentYaw - previousYaw;
        const turnRate = Math.abs(actualYawDelta);  // Radians per frame

        // Store for next frame and for firing accuracy calculation
        enemy.userData.previousYaw = currentYaw;
        enemy.userData.turnRate = turnRate;

        // Cap maximum turn rate. These run on the 30 Hz AI tick, so 0.28
        // rad/tick ≈ 480°/s — arcade-fast without the snap that made the
        // old barrel-roll experiment look like a glitch.
        const maxTurnRate = 0.28;  // Radians per AI tick
        // Base lerp was 0.03 — a ~1.1 s time constant at 30 Hz, i.e. the
        // ship needed over a second to finish committing to a turn. That
        // single number is the biggest source of the "floaty" feel.
        let lerpFactor = 0.16;

        // If turning too fast, reduce lerp to cap turn rate
        if (Math.abs(normalizedYawDelta) > maxTurnRate) {
            lerpFactor = maxTurnRate / Math.abs(normalizedYawDelta);
        }

        // SMOOTH interpolation to target rotation with turn rate limiting
        if (!enemy.rotation) enemy.rotation = new THREE.Euler();

        enemy.rotation.x = THREE.MathUtils.lerp(enemy.rotation.x || 0, enemy.userData.targetRotation.x, lerpFactor);
        // Heading is an ANGLE, not a scalar: targetRotation.y accumulates
        // freely (prevTargetYaw integrates a shortest-path error and can
        // wander past ±π after a few full circuits) while rotation.y comes
        // back from the quaternion inside ±π. Lerping the raw difference
        // therefore commanded up to a full extra turn per tick. Step along
        // the normalized error instead — same responsiveness, no wrap snap.
        enemy.rotation.y = (enemy.rotation.y || 0) + normalizedYawDelta * lerpFactor;
        // ROLL AUTHORITY: while an evasive maneuver is flying, the maneuver
        // owns the roll axis. This lerp drags rotation.z back toward the
        // small trajectory bank every tick — at a 170° roll that is ~0.45
        // rad/tick of counter-torque, almost exactly cancelling the
        // maneuver's own input, which is why a "barrel roll" would stall
        // just short of inverted and slide back.
        if (!enemy.userData._evade) {
            enemy.rotation.z = THREE.MathUtils.lerp(enemy.rotation.z || 0, enemy.userData.targetRotation.z, lerpFactor);
        }
    } catch (e) {
        // Ignore rotation errors
    }
}

function updatePursuitBehavior(enemy, playerPos, speed, distance) {
    // Safety checks
    if (!enemy || !enemy.userData || !playerPos || typeof THREE === 'undefined') {
        return;
    }

    try {
        // Initialize velocity if not present (inertia-based movement)
        if (!enemy.userData.velocity) {
            enemy.userData.velocity = new THREE.Vector3(0, 0, 0);
        }
        if (!enemy.userData.facing) {
            enemy.userData.facing = new THREE.Vector3(0, 0, 1);
        }
        
        // Physics constants — aggressive forward thrust profile. Pursuit
        // ships used to plod; now they reach top speed quickly and turn
        // crisply so dogfights have real motion. Barrel rolls (when they
        // happen) layer on top of this without replacing forward thrust.
        // Snappier again for arcade dogfights: an interceptor should reach
        // its top speed inside about half a second and be able to haul its
        // nose around, otherwise every merge turns into a slow drift-past.
        const maxSpeed = speed * 4.6;       // was 4.0
        const acceleration = speed * 0.28;  // was 0.20
        const turnRate = 0.085;             // was 0.05
        const drag = 0.99;                  // lighter drag — bumps land
        
        _ebV1.subVectors(playerPos, enemy.position).normalize();

        const angleDiff = enemy.userData.facing.angleTo(_ebV1);
        
        if (angleDiff > 0.01) {
            const turnAmount = Math.min(turnRate, angleDiff);
            enemy.userData.facing.lerp(_ebV1, turnAmount / angleDiff);
            enemy.userData.facing.normalize();
        }
        
        // Acceleration bursts
        if (enemy.userData.nextAccelBurst === undefined) {
            enemy.userData.nextAccelBurst = Date.now() + 2000 + Math.random() * 3000;
        }
        const now = Date.now();
        if (now > enemy.userData.nextAccelBurst && !enemy.userData.accelBurstActive) {
            enemy.userData.accelBurstActive = true;
            enemy.userData.accelBurstEnd = now + 800 + Math.random() * 700;
            enemy.userData.nextAccelBurst = now + 3000 + Math.random() * 4000;
        }
        
        let thrustPower = acceleration;
        if (enemy.userData.accelBurstActive) {
            thrustPower *= 1.8;
            if (now > enemy.userData.accelBurstEnd) {
                enemy.userData.accelBurstActive = false;
            }
        }
        
        _ebV2.copy(enemy.userData.facing).multiplyScalar(thrustPower);
        enemy.userData.velocity.add(_ebV2);

        // (Side-thrust evasion was removed with the barrel-roll system —
        // enemies now focus on tracking/swarming instead.)

        // Clamp to max speed
        if (enemy.userData.velocity.length() > maxSpeed) {
            enemy.userData.velocity.setLength(maxSpeed);
        }

        // Apply drag
        enemy.userData.velocity.multiplyScalar(drag);

        // Update position based on velocity
        enemy.position.add(enemy.userData.velocity);

        // Rotate enemy to face direction of travel (not instant)
        applyEnemyRotation(enemy, enemy.userData.facing, speed);

        // Break into the orbit EARLY (was 150 u — by then the enemy had
        // already blown through the merge). 260 u means the pursuit turns
        // into a turning fight instead of a fly-by.
        if (distance < 260) {
            const orbitAngle = Date.now() * 0.0015 + (enemy.userData.circlePhase || 0);
            _ebV1.set(
                Math.cos(orbitAngle) * 100,
                Math.sin(orbitAngle * 0.5) * 30,
                Math.sin(orbitAngle) * 100
            );
            _ebV2.copy(playerPos).add(_ebV1);
            _ebV3.subVectors(_ebV2, enemy.position).normalize();
            enemy.userData.facing.lerp(_ebV3, turnRate * 2);
            enemy.userData.facing.normalize();
        }
    } catch (e) {
        // Ignore movement errors if positions are invalid
    }
}

// Swarm behavior with inertia physics
function updateSwarmBehavior(enemy, playerPos, speed, time) {
    // Safety checks
    if (!enemy || !enemy.userData || !playerPos || typeof THREE === 'undefined') {
        return;
    }
    
    try {
        // Initialize velocity if not present
        if (!enemy.userData.velocity) {
            enemy.userData.velocity = new THREE.Vector3(0, 0, 0);
        }
        if (!enemy.userData.facing) {
            enemy.userData.facing = new THREE.Vector3(0, 0, 1);
        }
        
        const maxSpeed = speed * 4.0;        // was 3.5
        const acceleration = speed * 0.26;   // was 0.18
        const turnRate = 0.10;               // was 0.06 — tighter spirals
        const drag = 0.985;                  // was 0.98

        // Spiraling approach from multiple angles
        const swarmAngle = time * 0.5 + (enemy.userData.circlePhase || 0);
        const spiralRadius = 120 + Math.sin(time * 0.3) * 40;

        const targetX = playerPos.x + Math.cos(swarmAngle) * spiralRadius;
        const targetZ = playerPos.z + Math.sin(swarmAngle) * spiralRadius;
        const targetY = playerPos.y + Math.sin(time * 0.2) * 30;

        _ebV1.set(targetX, targetY, targetZ);
        _ebV2.subVectors(_ebV1, enemy.position).normalize();

        enemy.userData.facing.lerp(_ebV2, turnRate);
        enemy.userData.facing.normalize();

        _ebV3.copy(enemy.userData.facing).multiplyScalar(acceleration);
        enemy.userData.velocity.add(_ebV3);

        // Clamp and drag
        if (enemy.userData.velocity.length() > maxSpeed) {
            enemy.userData.velocity.setLength(maxSpeed);
        }
        enemy.userData.velocity.multiplyScalar(drag);

        // Apply velocity
        enemy.position.add(enemy.userData.velocity);
        applyEnemyRotation(enemy, enemy.userData.facing, speed);
    } catch (e) {
        // Ignore movement errors
    }
}

// NEW: Evasion behavior
function updateEvasionBehavior(enemy, playerPos, speed, time) {
    // Safety checks
    if (!enemy || !enemy.userData || !playerPos || typeof THREE === 'undefined') {
        return;
    }

    try {
        _ebV1.subVectors(enemy.position, playerPos).normalize();
        _ebV2.set(-_ebV1.z, _ebV1.y, _ebV1.x);

        // Boosted side-strafe + a sinusoid wobble so the evade mode
        // actually rips sideways at speed rather than oscillating
        // in place.
        const oscillation = Math.sin(time * 2 + (enemy.userData.circlePhase || 0)) * 0.5;
        _ebV2.multiplyScalar(speed * 1.6 * (1 + oscillation));

        enemy.position.add(_ebV2);
        // Dedicated 'evade' mode now just steers sideways relative to the
        // player — the barrel-roll system that used to layer on top of
        // this has been removed in favour of letting low-HP enemies
        // commit to evading or swarming without spinning out.
        applyEnemyRotation(enemy, _ebV2, speed);
    } catch (e) {
        // Ignore movement errors
    }
}

// FORMATION PATROL — used for inactive local hostiles (Martian Pirates,
// Vulcan Patrols). Two effects:
//   • Each ship's patrolCenter drifts slowly through space, so the
//     whole group is always moving forward rather than camped on a
//     fixed point. The drift direction is shared by every ship that
//     started life in the same group (matching patrolCenter values
//     coming out of createEnemies3D), so the formation stays together.
//   • Each ship orbits its (drifting) patrolCenter at a tight radius,
//     turning to face the direction of travel so jet cones light up
//     out the back.
function _updateLocalFormationPatrol(enemy) {
    if (!enemy || !enemy.userData || typeof THREE === 'undefined') return;
    const ud = enemy.userData;
    if (!ud.patrolCenter) ud.patrolCenter = enemy.position.clone();

    // Lazy-init a stable drift heading per group. Hashing the rounded
    // patrolCenter coordinates means every ship in the same starting
    // group derives the same heading, so they fly the same way without
    // needing an explicit group id.
    if (!ud.formationHeading) {
        const key = Math.round(ud.patrolCenter.x / 50) + ':' +
                    Math.round(ud.patrolCenter.y / 50) + ':' +
                    Math.round(ud.patrolCenter.z / 50);
        let h = 0;
        for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
        const ang = (h % 1000) / 1000 * Math.PI * 2;
        const vy  = (((h >> 10) % 1000) / 1000 - 0.5) * 0.25;
        ud.formationHeading = new THREE.Vector3(Math.cos(ang), vy, Math.sin(ang)).normalize();
        ud.formationSpeed = 0.35 + (((h >> 20) % 100) / 100) * 0.25; // 0.35-0.60 u/frame
    }

    // Drift the patrol center along the formation heading. We also
    // add a slow sine wave so the route bends rather than running in
    // a perfectly straight line.
    const t = Date.now() * 0.0003;
    const heading = ud.formationHeading;
    ud.patrolCenter.x += heading.x * ud.formationSpeed;
    ud.patrolCenter.y += heading.y * ud.formationSpeed + Math.sin(t * 0.7) * 0.2;
    ud.patrolCenter.z += heading.z * ud.formationSpeed;

    // Orbit the (moving) patrol center at a small radius so wingmates
    // stay tight to one another. circlePhase distributes them around
    // the ring.
    const phase = ud.circlePhase || 0;
    const r = 80;
    const angle = t * 4 + phase;
    const targetX = ud.patrolCenter.x + Math.cos(angle) * r + heading.x * 60;
    const targetY = ud.patrolCenter.y + Math.sin(angle * 0.6) * 12;
    const targetZ = ud.patrolCenter.z + Math.sin(angle) * r + heading.z * 60;

    // Velocity-based motion so the thruster check (which reads
    // userData.velocity) lights up the cones.
    if (!ud.velocity) ud.velocity = new THREE.Vector3();
    const desired = new THREE.Vector3(
        targetX - enemy.position.x,
        targetY - enemy.position.y,
        targetZ - enemy.position.z
    );
    const dlen = desired.length();
    if (dlen > 0.001) desired.divideScalar(dlen);
    ud.velocity.lerp(desired.multiplyScalar(0.6), 0.18);
    enemy.position.add(ud.velocity);

    if (typeof applyEnemyRotation === 'function') {
        applyEnemyRotation(enemy, ud.velocity, ud.velocity.length());
    }
}

// NEW: Flanking behavior
function updateFlankingBehavior(enemy, playerPos, speed, time) {
    // Safety checks
    if (!enemy || !enemy.userData || !playerPos || typeof THREE === 'undefined') {
        return;
    }

    try {
        // Try to get behind or to the side of the player. The flank point
        // now SWEEPS (time-varying angle) instead of sitting on a fixed
        // bearing, so a strafe-faction ship reads as extending and coming
        // back around for another pass rather than parking off your wing.
        const flankAngle = (enemy.userData.circlePhase || 0) + Math.PI + time * 0.55;
        const flankRadius = 170 + Math.sin(time * 0.4 + (enemy.userData.circlePhase || 0)) * 45;

        const targetX = playerPos.x + Math.cos(flankAngle) * flankRadius;
        const targetZ = playerPos.z + Math.sin(flankAngle) * flankRadius;
        const targetY = playerPos.y + Math.sin(time * 0.6) * 40;

        _ebV1.set(targetX, targetY, targetZ);
        _ebV2.subVectors(_ebV1, enemy.position).normalize();
        // Was speed * 0.7 — a repositioning move that is SLOWER than the
        // pursuit it interrupts reads as hesitation, not tactics.
        enemy.position.add(_ebV2.multiplyScalar(speed * 2.8));
        applyEnemyRotation(enemy, _ebV2, speed * 2.8);
    } catch (e) {
        // Ignore movement errors
    }
}

// NEW: Engagement behavior
function updateEngagementBehavior(enemy, playerPos, speed, time) {
    // Safety checks
    if (!enemy || !enemy.userData || !playerPos || typeof THREE === 'undefined') {
        return;
    }

    try {
        // Maintain optimal attack distance. Per-frame position deltas
        // here used to be tiny (raw speed, no inertia, no multiplier) so
        // precision-style factions (Vulcans) appeared to crawl. Bumped
        // approach/back-off/orbit speeds 3-4x so they actually keep up
        // with the player while holding the engagement bracket.
        // Bracket range comes from the faction now, so a Federation
        // cruiser genuinely holds a wider ring than an Imperial swarmer.
        const faction = (typeof getFactionBehavior === 'function') ? getFactionBehavior(enemy) : null;
        const optimalDistance = (faction && faction.preferredRange) ? faction.preferredRange : 140;
        const band = optimalDistance * 0.22;
        const currentDistance = enemy.position.distanceTo(playerPos);

        if (currentDistance > optimalDistance + band) {
            _ebV1.subVectors(playerPos, enemy.position).normalize();
            enemy.position.add(_ebV1.multiplyScalar(speed * 4.0));
            applyEnemyRotation(enemy, _ebV1, speed * 4.0);
        } else if (currentDistance < optimalDistance - band) {
            _ebV1.subVectors(enemy.position, playerPos).normalize();
            enemy.position.add(_ebV1.multiplyScalar(speed * 2.4));
            applyEnemyRotation(enemy, _ebV1, speed * 2.4);
        } else {
            // TRUE circling: fly the tangent around the TARGET. The old
            // version added a vector that orbited the world axes, so the
            // enemy drew a little circle wherever it happened to be
            // standing instead of circling the player — which is why the
            // "circle" factions never read as circling anything.
            _ebV1.subVectors(enemy.position, playerPos);
            _ebV1.y *= 0.35;                                   // flattish ring
            _ebV2.crossVectors(_ebV1, _cfUpW || new THREE.Vector3(0, 1, 0));
            if (_ebV2.lengthSq() < 1e-6) _ebV2.set(1, 0, 0);
            _ebV2.normalize();
            // circlePhase gives each ship a fixed direction so a wing
            // doesn't shear through itself at the crossover.
            const dir = ((enemy.userData.circlePhase || 0) % 2 < 1) ? 1 : -1;
            _ebV2.multiplyScalar(dir);
            // Small inward bias keeps the ring from slowly unwinding.
            _ebV2.addScaledVector(_ebV1.normalize(), -0.18).normalize();
            _ebV2.y += Math.sin(time * 0.7 + (enemy.userData.circlePhase || 0)) * 0.25;
            enemy.position.add(_ebV2.multiplyScalar(speed * 3.2));
            applyEnemyRotation(enemy, _ebV2, speed * 3.2);
        }
    } catch (e) {
        // Ignore movement errors
    }
}

// NEW: Enhanced patrol behavior for enemies
function updatePatrolBehavior(enemy, playerPos, speed, time) {
    // Safety checks
    if (!enemy || !enemy.userData || typeof THREE === 'undefined') {
        return;
    }
    
    try {
        if (!enemy.userData.patrolCenter) {
            enemy.userData.patrolCenter = enemy.position.clone();
            enemy.userData.patrolRadius = 200 + Math.random() * 300;
        }
        
        const angle = time * 0.2 + (enemy.userData.circlePhase || 0);
        const targetX = enemy.userData.patrolCenter.x + Math.cos(angle) * enemy.userData.patrolRadius;
        const targetZ = enemy.userData.patrolCenter.z + Math.sin(angle) * enemy.userData.patrolRadius;
        const targetY = enemy.userData.patrolCenter.y + Math.sin(angle * 0.3) * 50;
        
        _ebV1.set(targetX, targetY, targetZ);
        _ebV2.subVectors(_ebV1, enemy.position).normalize();

        enemy.position.add(_ebV2.multiplyScalar(speed * 0.6));
        // BUG: this passed `direction`, which does not exist in this
        // scope — every patrol tick threw a ReferenceError that the
        // catch below swallowed, so patrolling ships moved but never
        // turned to face where they were going (and paid for a thrown
        // exception per enemy per tick). _ebV2 is the step vector.
        applyEnemyRotation(enemy, _ebV2, speed * 0.6);
    } catch (e) {
        // Ignore movement errors
    }
}

// =============================================================================
// PROGRESSIVE DIFFICULTY SYSTEM
// =============================================================================

function calculateDifficultySettings() {
    const galaxiesCleared = (typeof gameState !== 'undefined' && gameState.galaxiesCleared) ? gameState.galaxiesCleared : 0;

    // Scale active enemy count with the player's wingmen count so the fight
    // stays meaningful as allies are recruited. Each living wingman adds
    // 2 active local attackers and 2 active distant attackers.
    let aliveWingmen = 0;
    if (typeof allyShips !== 'undefined') {
        aliveWingmen = allyShips.filter(a => a && a.userData && a.userData.health > 0).length;
    }
    const wingmanLocalBonus = aliveWingmen * 2;
    const wingmanDistantBonus = aliveWingmen * 2;

    const baseSettings = {
        // Local galaxy settings (progressive difficulty)
        // 4 base + 2 per wingman → 8 active at game start with 2 wingmen
        // (matches the 4 Martian + 4 Vulcan opening scenario the player wanted)
        maxLocalAttackers: Math.min(4 + galaxiesCleared + wingmanLocalBonus, 16),
        localSpeedMultiplier: 1.0 + (galaxiesCleared * 0.05), // Full speed from the start
        localHealthMultiplier: galaxiesCleared === 0 ? 1 : Math.min(1 + galaxiesCleared * 0.25, 3),
        localDetectionRange: 3500 + (galaxiesCleared * 300),
        localFiringRange: 350 + (galaxiesCleared * 25),  // Was 150 — far too close, enemies couldn't fire
        localAttackCooldown: Math.max(600, 1200 - (galaxiesCleared * 100)),

        // Distant galaxy settings (always challenging) - MAX 3 HITS
        // 8 base + galaxiesCleared + 2 per wingman, capped at 22 (fights stay
        // tractable but feel proportionate to the player's fleet size).
        maxDistantAttackers: Math.min(8 + galaxiesCleared + wingmanDistantBonus, 22),
        distantSpeedMultiplier: 1.0 + (galaxiesCleared * 0.08),  // Faster enemies
        distantHealthMultiplier: Math.min(2 + galaxiesCleared * 0.125, 3), // MAX 3 hits
        distantDetectionRange: 5000 + (galaxiesCleared * 200),  // Long detection for pursuit
        distantFiringRange: 200 + (galaxiesCleared * 30),  // Must get close to fire
        distantAttackCooldown: Math.max(800, 1200 - (galaxiesCleared * 50)),

        // General settings
        galaxiesCleared: galaxiesCleared,
        aliveWingmen: aliveWingmen,
        difficultyLevel: Math.min(Math.floor(galaxiesCleared / 2), 4) // 0-4 difficulty levels
    };

    return baseSettings;
}

function getEnemyHealthForDifficulty(isLocal, isBoss, isBossSupport) {
    const galaxiesCleared = (typeof gameState !== 'undefined' && gameState.galaxiesCleared) ? gameState.galaxiesCleared : 0;
    
    if (isBoss) {
        // Boss health: 3 hits maximum
        return 3;
    } else if (isBossSupport) {
        // Boss support health: 2-3 hits
        return Math.min(2 + Math.floor(galaxiesCleared / 3), 3);
    } else if (isLocal) {
        // Local enemy health: 1-3 hits
        if (galaxiesCleared === 0) return 1; // Tutorial level
        return Math.min(1 + Math.floor(galaxiesCleared / 3), 3);
    } else {
        // Distant enemy health: 2-3 hits
        return Math.min(2 + Math.floor(galaxiesCleared / 4), 3);
    }
}

function refreshEnemyDifficulty() {
    // Safety check for enemies array
    if (typeof enemies === 'undefined') return;
    
    const difficultySettings = calculateDifficultySettings();
    
    // Update all existing enemies
    // PERFORMANCE: Limit active enemies based on distance and performance mode
const maxActiveEnemies = gameState.performanceMode === 'minimal' ? 3 :
                         gameState.performanceMode === 'optimized' ? 5 : 8;

// OPTIMIZED: Filter using squared distance (no sqrt), then cache distances for sorting
const camPos = camera.position;
const maxDistSquared = 3000 * 3000;
const enemyDistances = new Map();

const nearbyEnemiesUnsorted = enemies.filter(enemy => {
    if (enemy.userData.health <= 0) return false;

    // Calculate squared distance (avoids expensive sqrt)
    const dx = enemy.position.x - camPos.x;
    const dy = enemy.position.y - camPos.y;
    const dz = enemy.position.z - camPos.z;
    const distSq = dx*dx + dy*dy + dz*dz;

    if (distSq < maxDistSquared) {
        // Cache the actual distance for sorting (only calculate sqrt once per enemy)
        enemyDistances.set(enemy, Math.sqrt(distSq));
        return true;
    }
    return false;
});

const nearbyEnemies = nearbyEnemiesUnsorted.sort((a, b) => {
    // Prioritize: 1) Bosses, 2) Active enemies, 3) Closest enemies
    if (a.userData.isBoss && !b.userData.isBoss) return -1;
    if (!a.userData.isBoss && b.userData.isBoss) return 1;
    if (a.userData.isActive && !b.userData.isActive) return -1;
    if (!a.userData.isActive && b.userData.isActive) return 1;
    // Use cached distances instead of recalculating
    return enemyDistances.get(a) - enemyDistances.get(b);
}).slice(0, maxActiveEnemies);

// Process only the limited set of nearby enemies
nearbyEnemies.forEach(enemy => {
        if (!enemy.userData) return;
        
        const isLocal = enemy.userData.isLocal || false;
        const isBoss = enemy.userData.isBoss || false;
        const isBossSupport = enemy.userData.isBossSupport || false;
        
        // Update health but don't heal damaged enemies
        const newMaxHealth = getEnemyHealthForDifficulty(isLocal, isBoss, isBossSupport);
        const healthPercentage = enemy.userData.health / (enemy.userData.maxHealth || 1);
        
        enemy.userData.maxHealth = newMaxHealth;
        enemy.userData.health = Math.max(enemy.userData.health, newMaxHealth * healthPercentage);
    });
    
    console.log(`Difficulty refreshed: Galaxies cleared: ${(typeof gameState !== 'undefined' && gameState.galaxiesCleared) ? gameState.galaxiesCleared : 0}`);
}

// =============================================================================
// ENHANCED ENEMY BEHAVIOR SYSTEM
// =============================================================================

// ENHANCED: Enemy Behavior System with Progressive Difficulty and Tutorial Safety
// Per-target attacker cap. Up to 3 enemies may engage the player at a
// time, and up to 3 may engage each living wingman. Beyond that, the
// extras fall back to whichever target is closest — they still chase,
// they just don't push the per-target count above 3 if room exists
// elsewhere. Called once per frame from updateEnemyBehavior.
const _ENEMY_ATTACKERS_PER_TARGET = 3;

// Resolve a stored engagedTarget tag into a concrete position-bearing
// object. Player is stored as the string 'player' so the assignment is
// stable across frames (camera position is a single Vector3 that
// updates in place, not a reusable wrapper).
function _resolveEngagedTarget(tag) {
    if (!tag) return null;
    if (tag === 'player') {
        return (typeof camera !== 'undefined') ? camera : null;
    }
    // Wingman object — must still be alive
    if (tag.userData && tag.userData.health > 0) return tag;
    return null;
}

function _assignEngagementTargets() {
    if (typeof enemies === 'undefined') return;
    // Build target list: player first, then living wingmen.
    const targets = ['player'];
    if (typeof allyShips !== 'undefined') {
        for (let i = 0; i < allyShips.length; i++) {
            const w = allyShips[i];
            if (!w || !w.userData || w.userData.health <= 0) continue;
            targets.push(w);
        }
    }
    const counts = new Map();
    for (let i = 0; i < targets.length; i++) counts.set(targets[i], 0);

    // First pass: validate existing assignments and tally them.
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || !e.userData || e.userData.health <= 0) continue;
        const tag = e.userData.engagedTarget;
        if (tag && counts.has(tag) && _resolveEngagedTarget(tag)) {
            const c = counts.get(tag);
            if (c < _ENEMY_ATTACKERS_PER_TARGET) {
                counts.set(tag, c + 1);
                continue; // keep this assignment
            }
        }
        // Existing target invalid / capped / gone — clear it.
        e.userData.engagedTarget = null;
    }

    // Second pass: any active enemy without a target picks the closest
    // under-capped target. If everyone's capped, fall back to closest.
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || !e.userData || e.userData.health <= 0) continue;
        if (!e.userData.isActive) continue;
        if (e.userData.engagedTarget) continue;
        let best = null, bestDist = Infinity;
        for (let j = 0; j < targets.length; j++) {
            const t = targets[j];
            if ((counts.get(t) || 0) >= _ENEMY_ATTACKERS_PER_TARGET) continue;
            const tObj = _resolveEngagedTarget(t);
            if (!tObj || !tObj.position) continue;
            const d = e.position.distanceTo(tObj.position);
            if (d < bestDist) { bestDist = d; best = t; }
        }
        if (!best) {
            // All capped — fall back to absolute closest target.
            for (let j = 0; j < targets.length; j++) {
                const t = targets[j];
                const tObj = _resolveEngagedTarget(t);
                if (!tObj || !tObj.position) continue;
                const d = e.position.distanceTo(tObj.position);
                if (d < bestDist) { bestDist = d; best = t; }
            }
        }
        if (best) {
            e.userData.engagedTarget = best;
            counts.set(best, (counts.get(best) || 0) + 1);
        }
    }
}

// Resolve an enemy's current engagement target position. Falls back to
// the player when no assignment exists (e.g. enemy not yet active).
function _engagedTargetPos(enemy) {
    if (!enemy || !enemy.userData) {
        return (typeof camera !== 'undefined') ? camera.position : null;
    }
    const obj = _resolveEngagedTarget(enemy.userData.engagedTarget);
    if (obj && obj.position) return obj.position;
    return (typeof camera !== 'undefined') ? camera.position : null;
}

// Reusable temp vectors for enemy flight-hygiene (no per-frame GC).
const _fhA = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _fhB = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _fhC = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _fhD = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;

// Hard keep-out from black-hole event-horizon warp zones, applied to
// enemies (and UFOs). The player warps when within criticalDistance =
// max(radius*2.5, 50) of a hole; enemies are clamped to that + a
// combat-range buffer so chasing a hostile toward a hole never pulls
// the player across the threshold. Position is projected back to the
// keep-out sphere and inward velocity is bled off.
const _bhAvoid = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
// Cached black-hole list (+ precomputed keep-out radius) so the
// avoidance check doesn't re-scan the whole planets array for every
// enemy every frame. Rebuilt at most every 2s — black holes are static.
let _bhCache = null, _bhCacheStamp = 0;
function _getBlackHoleAvoidList() {
    const now = Date.now();
    if (_bhCache && (now - _bhCacheStamp) < 2000) return _bhCache;
    _bhCache = [];
    if (typeof planets !== 'undefined') {
        for (let i = 0; i < planets.length; i++) {
            const p = planets[i];
            if (!p || !p.userData || p.userData.type !== 'blackhole' || !p.position) continue;
            const radius = (p.geometry && p.geometry.parameters && p.geometry.parameters.radius) || 50;
            _bhCache.push({ pos: p.position, keepOut: Math.max(radius * 2.5, 50) + 600 });
        }
    }
    _bhCacheStamp = now;
    return _bhCache;
}
function _enemyAvoidBlackHoles(enemy) {
    if (!_bhAvoid || !enemy || !enemy.position) return;
    const list = _getBlackHoleAvoidList();
    for (let i = 0; i < list.length; i++) {
        const bh = list[i];
        const keepOut = bh.keepOut;
        _bhAvoid.subVectors(enemy.position, bh.pos);
        const d = _bhAvoid.length();
        if (d > 0.001 && d < keepOut) {
            _bhAvoid.multiplyScalar(keepOut / d);              // out to the boundary
            enemy.position.copy(bh.pos).add(_bhAvoid);
            const ud = enemy.userData;
            if (ud && ud.velocity && ud.velocity.dot) {
                _bhAvoid.normalize();
                const inward = ud.velocity.dot(_bhAvoid);      // <0 means heading inward
                if (inward < 0) ud.velocity.addScaledVector(_bhAvoid, -inward);
            }
        }
    }
}
if (typeof window !== 'undefined') window._enemyAvoidBlackHoles = _enemyAvoidBlackHoles;

// Per-frame post-behavior pass for ACTIVE enemies. Two jobs:
//   1) Anti-cluster / always-in-flight: if the enemy barely moved this
//      frame (engage/hold modes park them on the player and they pile
//      up), glide it along its heading — or, lacking one, drift it
//      outward from the player — so it always reads as a ship in
//      motion instead of a hovering blob.
//   2) Camera-line clearance: keep the enemy out of the thin corridor
//      between the camera and the player's ship so hostiles don't
//      occlude the player model during 3rd-person combat.
function _enemyFlightHygiene(enemy, shipPos, camPos, playerPos, isLocal) {
    if (!enemy || !enemy.userData || !_fhA) return;
    const ud = enemy.userData;
    const pos = enemy.position;

    // ---- 1) Minimum flight speed ----
    if (!ud._prevPos) ud._prevPos = pos.clone();
    const moved = pos.distanceTo(ud._prevPos);
    // ~400 km/s local, ~520 km/s distant — enough to always look like
    // they're flying, not loitering.
    const MIN_STEP = isLocal ? 0.40 : 0.52;
    if (moved < MIN_STEP) {
        let haveDir = false;
        if (ud.velocity && ud.velocity.lengthSq() > 1e-5) {
            _fhA.copy(ud.velocity).normalize();
            haveDir = true;
        } else if (ud.facing && ud.facing.lengthSq && ud.facing.lengthSq() > 1e-5) {
            _fhA.copy(ud.facing).normalize();
            haveDir = true;
        }
        if (!haveDir) {
            // No heading — drift away from the player so the enemy
            // doesn't sit on top of the camera/ship.
            _fhA.subVectors(pos, playerPos);
            if (_fhA.lengthSq() < 1e-5) _fhA.set(1, 0, 0);
            _fhA.normalize();
        }
        pos.addScaledVector(_fhA, MIN_STEP - moved);
    }

    // ---- 2) Camera→ship sightline clearance ----
    if (camPos && shipPos) {
        _fhB.subVectors(shipPos, camPos);           // A=cam, B=ship, AB
        const abLen2 = _fhB.lengthSq();
        if (abLen2 > 1e-3) {
            _fhC.subVectors(pos, camPos);           // AP
            let t = _fhC.dot(_fhB) / abLen2;
            if (t > 0.04 && t < 1.20) {             // roughly in front of cam, near/just past ship
                t = Math.max(0, Math.min(1, t));
                _fhD.copy(camPos).addScaledVector(_fhB, t); // closest point on segment
                _fhA.subVectors(pos, _fhD);
                const d = _fhA.length();
                const CORRIDOR = 160;               // keep this clear of the ship sightline
                if (d < CORRIDOR) {
                    if (d < 0.001) {
                        // Dead on the line — shove sideways using world up × AB.
                        _fhA.set(0, 1, 0).cross(_fhB);
                        if (_fhA.lengthSq() < 1e-5) _fhA.set(1, 0, 0);
                    }
                    _fhA.normalize();
                    // Persistent but smooth: clear ~40% of the intrusion
                    // per frame so it slides off the sightline in a few
                    // frames without snapping.
                    pos.addScaledVector(_fhA, (CORRIDOR - d) * 0.4);
                }
            }
        }
    }

    ud._prevPos.copy(pos);
}

// =============================================================================
// COMBAT FEEL — EVASIVE MANEUVERS, FLIGHT ROLL, ATTACK TELEGRAPHS
// -----------------------------------------------------------------------------
// Star Fox 64 arcade-combat DNA: enemies that visibly REACT to your guns
// (barrel rolls, split-S breaks, corkscrew jinks), that BANK into their
// turns instead of tracking you like turrets, and that TELL you they're
// about to shoot before the bolt leaves the muzzle.
//
// Everything here runs on the 30 Hz AI tick inside updateEnemyBehavior and
// writes only enemy.position / enemy.rotation (+ userData), so the existing
// render-interpolation glide in game-core.js carries it at full framerate.
// The one subtlety is the euler-roll wrap — see _unwrapEnemyInterpRoll.
// No new meshes, no new materials, no additive overdraw.
// =============================================================================

const _cfA = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _cfB = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _cfC = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _cfFwd = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _cfUpW = (typeof THREE !== 'undefined') ? new THREE.Vector3(0, 1, 0) : null;

// Maneuver catalogue. `dur` is wall-clock ms — these are real flight
// moves, not frame-counted animations, so they read identically on a
// 45 Hz laptop and a 144 Hz desktop.
// DURATIONS ARE A LEGIBILITY BUDGET, not a taste knob. The orientation
// governor caps an evading hull at _GOV_RATE_EVADE (400°/s) and any roll it
// has to clip is rotation the maneuver loses FOREVER — the roll is fed in as
// per-tick deltas that are consumed whether or not they land, which is why
// the old 780 ms barrel roll (peak ~700°/s through the ease) could never
// finish and always looked like a stall. Each profile below is timed so its
// PEAK roll rate sits just under the cap, so it completes exactly as written
// and every degree of it is on screen.
const _EVASIVE = {
    // Full 360° roll about the flight axis with a helical side-slip:
    // the classic "do a barrel roll" dodge. Net displacement returns to
    // the original flight path, so it dodges the shot without wrecking
    // the enemy's approach. 360° / 1.3 s ≈ 277°/s mean, ~374°/s peak —
    // a full second and a half of continuous, trackable rotation
    // (~336°/s peak through the ease — inside the 360°/s envelope).
    barrel:    { dur: 1450, rollTurns: 1.0, lat: 1.00, vert: 0.55 },
    // Half-roll inverted then pull through: a hard break that leaves the
    // enemy pointing somewhere else entirely. Used when actually hit.
    // Each half-roll gets ~0.7 s → ~350°/s peak.
    splitS:    { dur: 1650, rollTurns: 0.5, lat: 1.35, vert: -1.15 },
    // Two fast alternating jinks — the "I know you're tracking me" wiggle.
    corkscrew: { dur: 1800, rollTurns: 0.0, lat: 0.85, vert: 0.60 }
};

// Per-faction attack rhythm. `burst`/`gap` group the shots into a
// recognisable cadence, `rest` scales the gap BETWEEN bursts so that
// average shots-per-second stays where it was (cycle = cooldown * burst *
// rest) — this is a readability change, not a difficulty change.
// `pattern` drives the approach: strafe runs vs circling vs lance dives.
const _FACTION_ATTACK = {
    0: { pattern: 'circle', burst: 2, gap: 175, telegraph: 420, rest: 1.00 }, // Federation — measured pairs
    1: { pattern: 'lance',  burst: 3, gap: 115, telegraph: 250, rest: 0.90 }, // Klingon — screaming triple
    2: { pattern: 'strafe', burst: 2, gap: 135, telegraph: 300, rest: 0.95 }, // Rebel — hit & run doubles
    3: { pattern: 'lance',  burst: 1, gap: 0,   telegraph: 620, rest: 1.00 }, // Romulan — one long-aimed shot
    4: { pattern: 'circle', burst: 4, gap: 105, telegraph: 230, rest: 1.00 }, // Imperial — suppressing quad
    5: { pattern: 'circle', burst: 3, gap: 155, telegraph: 360, rest: 1.00 }, // Cardassian — encircling triple
    6: { pattern: 'lance',  burst: 3, gap: 100, telegraph: 215, rest: 0.90 }, // Sith — relentless
    7: { pattern: 'strafe', burst: 2, gap: 205, telegraph: 500, rest: 1.00 }  // Vulcan — precise pair
};
const _ATTACK_DEFAULT = _FACTION_ATTACK[0];

function _factionAttackProfile(enemy) {
    const g = enemy && enemy.userData ? enemy.userData.galaxyId : undefined;
    return (g !== undefined && _FACTION_ATTACK[g]) ? _FACTION_ATTACK[g] : _ATTACK_DEFAULT;
}
if (typeof window !== 'undefined') window._factionAttackProfile = _factionAttackProfile;

// ── Threat detection ─────────────────────────────────────────────────────
// "Under fire" means one of two things, both of which we can see from
// inside this file: the player's shot LANDED (checkWeaponHits ->
// _activateOnDamage) or the player's shot went CLOSE BY (fireWeapon ->
// _markEnemiesUnderFire). The near-miss case is the important one — it is
// what makes an enemy dodge while you're still lining the shot up, which
// is what a Star Fox dogfight actually feels like.
function _markEnemiesUnderFire(aimEnd) {
    if (typeof enemies === 'undefined' || !_cfA || typeof camera === 'undefined' || !aimEnd) return;
    _cfFwd.subVectors(aimEnd, camera.position);
    const rayLen = _cfFwd.length();
    if (rayLen < 1) return;
    _cfFwd.divideScalar(rayLen);
    const now = Date.now();
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || !e.userData || e.userData.health <= 0) continue;
        if (e.userData.isBorgCube || e.userData.type === 'borg_drone') continue;
        _cfA.subVectors(e.position, camera.position);
        const t = _cfA.dot(_cfFwd);
        if (t < 40 || t > 5000) continue;                 // behind us / out of reach
        // Perpendicular distance from the shot line.
        const perpSq = _cfA.lengthSq() - t * t;
        // Graze radius grows a little with range so a shot that reads as
        // "close" on screen also reads as close to the AI.
        const graze = 130 + t * 0.06;
        if (perpSq > graze * graze) continue;
        e.userData._underFireUntil = now + 1500;
        _tryStartEvasive(e, 'graze');
    }
}
if (typeof window !== 'undefined') window._markEnemiesUnderFire = _markEnemiesUnderFire;

// Kick off an evasive maneuver if the enemy isn't already flying one and
// its per-ship cooldown has expired. `cause` biases which move it picks:
// a hit provokes a hard break, a near miss provokes a roll or a jink.
function _tryStartEvasive(enemy, cause) {
    if (!enemy || !enemy.userData || typeof THREE === 'undefined') return false;
    const ud = enemy.userData;
    if (ud.health <= 0) return false;
    // Capital ships don't dance — bosses, guardians and BORG hulls keep
    // their own set-piece choreography.
    if (ud.isBoss || ud.isBorgCube || ud.type === 'borg_drone' ||
        ud.isEliteGuardian || ud.isBlackHoleGuardian) return false;
    const now = Date.now();
    if (ud._evade && now < ud._evade.end) return false;          // already rolling
    if (now < (ud._evadeCooldownUntil || 0)) return false;

    let type;
    if (cause === 'hit') {
        type = Math.random() < 0.62 ? 'splitS' : 'barrel';
    } else if (cause === 'missile') {
        type = 'splitS';
    } else {
        const r = Math.random();
        type = r < 0.50 ? 'barrel' : (r < 0.85 ? 'corkscrew' : 'splitS');
    }
    return _startEvasive(enemy, type);
}

function _startEvasive(enemy, type) {
    if (!enemy || !enemy.userData || !_cfA) return false;
    const spec = _EVASIVE[type] || _EVASIVE.barrel;
    const ud = enemy.userData;
    const now = Date.now();

    // Build a FIXED maneuver basis at kick-off. Deriving right/up from the
    // ship's live orientation every tick would make the offset chase its
    // own rotation and the path would corkscrew unpredictably; freezing
    // the basis is what makes the displacement readable.
    _cfFwd.set(0, 0, 0);
    if (ud.velocity && ud.velocity.lengthSq() > 1e-6) _cfFwd.copy(ud.velocity).normalize();
    else if (ud.facing && ud.facing.lengthSq && ud.facing.lengthSq() > 1e-6) _cfFwd.copy(ud.facing).normalize();
    else enemy.getWorldDirection(_cfFwd).negate();
    if (_cfFwd.lengthSq() < 1e-6) _cfFwd.set(0, 0, 1);

    const right = new THREE.Vector3().crossVectors(_cfFwd, _cfUpW);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const up = new THREE.Vector3().crossVectors(right, _cfFwd).normalize();

    // Amplitude scales with how fast the ship is actually travelling so a
    // fast interceptor throws a big, obvious slide and a slow patrol boat
    // doesn't teleport sideways.
    const spd = ud.velocity ? ud.velocity.length() : 0.5;
    const amp = 46 + Math.min(2.4, spd) * 34;

    ud._evade = {
        type: type,
        t0: now,
        end: now + spec.dur,
        dur: spec.dur,
        dir: Math.random() < 0.5 ? -1 : 1,
        rollTurns: spec.rollTurns,
        lat: spec.lat * amp,
        vert: spec.vert * amp,
        right: right,
        up: up,
        applied: new THREE.Vector3()
    };
    ud._evadeCooldownUntil = now + spec.dur + 500 + Math.random() * 900;
    return true;
}
if (typeof window !== 'undefined') {
    window._startEnemyEvasive = _startEvasive;
    window._tryStartEnemyEvasive = _tryStartEvasive;
}

// Smooth 0..1 ease so the slide starts and finishes without a jerk.
function _cfSmooth(p) { return p * p * (3 - 2 * p); }
// Gentler ease for the ROLL specifically. Smoothstep peaks at 1.5x its mean
// slope; blending in a linear term drops that to 1.35x, which is the
// difference between a roll that fits inside the governor's envelope and one
// that gets clipped at its fastest moment (and so never completes). Still
// eases in and out — the ship still "rolls into" the move.
function _cfRollEase(p) { return 0.30 * p + 0.70 * (p * p * (3 - 2 * p)); }

// Advance the active maneuver. Returns the ROLL (radians about the ship's
// own forward axis) that the maneuver wants this tick; the positional
// side-slip is applied here directly as a delta on top of whatever the
// steering behavior already did.
function _stepEvasive(enemy) {
    const ud = enemy.userData;
    const m = ud._evade;
    if (!m) return 0;
    const now = Date.now();
    let p = (now - m.t0) / m.dur;
    if (p >= 1) {
        // Finish clean: the maneuver's displacement is KEPT (that's the
        // dodge), we just stop tracking it so the next one starts fresh.
        ud._evade = null;
        ud._evadeEndedAt = now;
        return 0;
    }
    if (p < 0) p = 0;

    let lat = 0, vert = 0, roll = 0;
    const TAU = Math.PI * 2;
    switch (m.type) {
        case 'barrel': {
            // Helix: slide out and back around the flight path while the
            // hull completes one full revolution.
            lat  = Math.sin(p * TAU) * m.lat;
            vert = (1 - Math.cos(p * TAU)) * m.vert;
            roll = m.dir * m.rollTurns * TAU * _cfRollEase(p);
            break;
        }
        case 'splitS': {
            // Roll inverted (half turn) fast, hold inverted while pulling
            // hard through the vertical, then complete the turn upright.
            // The roll MUST land on a whole turn: it is applied as a
            // per-tick delta, so ending anywhere else would snap the hull
            // back through that angle in a single tick.
            // Phase split widened (was 0.40 / 0.68) so each half-roll gets
            // ~0.63 s of the longer 1.5 s move — ~385°/s peak, inside the
            // governor's evade envelope, so both halves actually land.
            if (p < 0.42)      roll = m.dir * Math.PI * _cfRollEase(p / 0.42);
            else if (p < 0.55) roll = m.dir * Math.PI;
            else               roll = m.dir * (Math.PI + Math.PI * _cfRollEase((p - 0.55) / 0.45));
            const pull = _cfSmooth(Math.max(0, (p - 0.18) / 0.82));
            lat  = pull * m.lat * m.dir;
            vert = pull * m.vert;
            break;
        }
        default: { // corkscrew
            const w = p * TAU * 2;                    // two full jinks
            const env = Math.sin(Math.PI * p);        // fade in/out
            lat  = Math.sin(w) * m.lat * env;
            vert = Math.sin(w + Math.PI / 2) * m.vert * env;
            // Amplitude 1.45 -> 0.85 over the longer 1.7 s: a sinusoidal
            // roll's peak rate is amp*4π/dur, and 1.45 rad in 1.04 s was
            // ~1000°/s — 2.5x the envelope, so the wag was being sheared
            // flat every single time. 0.80 rad in 1.8 s peaks ~320°/s and
            // reads as an actual wing-waggle.
            roll = m.dir * Math.sin(w) * 0.80 * env;
            break;
        }
    }

    // Apply only the CHANGE since last tick so we ride on top of the
    // steering behavior instead of fighting it.
    _cfA.set(0, 0, 0)
        .addScaledVector(m.right, lat)
        .addScaledVector(m.up, vert);
    _cfB.subVectors(_cfA, m.applied);
    enemy.position.add(_cfB);
    m.applied.copy(_cfA);

    // A split-S genuinely changes where the ship is going, so bleed the
    // heading over too — otherwise it slides sideways while still nosing
    // at you, which looks like a bug rather than a break turn.
    if (m.type === 'splitS' && ud.velocity && ud.velocity.lengthSq() > 1e-6) {
        ud.velocity.addScaledVector(m.right, m.dir * 0.05);
        if (ud.facing) ud.facing.addScaledVector(m.right, m.dir * 0.04).normalize();
    }

    return roll;
}

// ── Flight roll: banking + maneuver roll, composed after the look-at ─────
// The engagement behaviors finish with _smoothEnemyLookAt, which builds a
// world-up-aligned orientation — zero roll, ever. That is precisely why
// enemies used to read as turrets that happen to drift. Here we compose a
// roll about the ship's OWN forward axis on top: banking proportional to
// how hard it's turning, plus whatever the active maneuver wants.
function _applyEnemyFlightRoll(enemy, maneuverRoll) {
    const ud = enemy.userData;
    if (!_cfA) return;

    // Heading change since the last AI tick -> bank angle.
    let bank = 0;
    if (!ud._rollPrevHeading) ud._rollPrevHeading = new THREE.Vector3();
    _cfA.set(0, 0, 0);
    if (ud.velocity && ud.velocity.lengthSq() > 1e-6) _cfA.copy(ud.velocity).normalize();
    else if (ud._prevPos) _cfA.subVectors(enemy.position, ud._prevPos);
    if (_cfA.lengthSq() > 1e-6) {
        _cfA.normalize();
        if (ud._rollPrevHeading.lengthSq() > 1e-6) {
            // Signed turn: cross(prev, cur) projected on world up tells us
            // which way the nose swung.
            _cfB.crossVectors(ud._rollPrevHeading, _cfA);
            const turn = _cfB.dot(_cfUpW);
            // 30 Hz tick, so a hard turn is ~0.1 rad/tick. Scale to a bank
            // that tops out just under 70° — arcade, not simulation.
            bank = THREE.MathUtils.clamp(-turn * 9.0, -1.2, 1.2);
        }
        ud._rollPrevHeading.copy(_cfA);
    }

    // A ship that is lining up a shot levels its wings — that stillness is
    // half of what makes the telegraph readable.
    if (ud._telegraphing) bank *= 0.25;

    // Smooth the bank so it swings in like a real aileron input, then add
    // the maneuver roll RAW (a barrel roll should snap, not ooze).
    const prevBank = ud._bankAngle || 0;
    const bankNow = prevBank + (bank - prevBank) * 0.22;
    ud._bankAngle = bankNow;

    // Applied as a per-tick DELTA, never as an absolute. _smoothEnemyLookAt
    // slerps toward a zero-roll orientation every tick, so it is already
    // bleeding whatever roll exists — an absolute set would fight it and
    // stall the roll partway. Feeding it the increment lets the two
    // compose: the maneuver drives the hull over, the look-at gently
    // recovers it, which is exactly the damped feel a real roll has.
    // Every maneuver profile lands on a whole number of turns so the final
    // delta back to level is a multiple of 2π (a no-op rotation), never a
    // visible snap.
    const targetRoll = bankNow + (maneuverRoll || 0);
    const delta = targetRoll - (ud._rollTargetPrev || 0);
    ud._rollTargetPrev = targetRoll;
    if (Math.abs(delta) > 1e-5 && Math.abs(delta) < Math.PI * 2.5) {
        // Local +Z is the ship's tail (models fly -Z forward), so rotateZ
        // is exactly the barrel-roll axis.
        enemy.rotateZ(delta);
    }
}

// =============================================================================
// ORIENTATION RATE GOVERNOR — "no maneuver is ever SEEN" is fixed here
// -----------------------------------------------------------------------------
// Nine behavior modes drive an enemy's orientation, and up to four separate
// authorities write it inside a single AI tick (applyEnemyRotation's
// heading/pitch/bank euler, _smoothEnemyLookAt's quaternion slerp,
// _applyEnemyFlightRoll's rotateZ, plus the maneuver's own basis). None of
// them owned a RATE. Whatever orientation came out the far end of the tick
// was handed straight to the render glide as a target, so a decision could
// resolve as a half-turn inside one 33 ms frame — a state change the player's
// eye reads as a teleport, not a turn.
//
// This is the one governor between the AI's *intent* and the hull's *visual*
// transform. It runs last, once per enemy per tick:
//
//   1. Reconstruct where the hull actually WAS when the tick began
//      (userData._iFromRot — the render glide's start, i.e. the last thing
//      the player saw).
//   2. Measure the true geodesic angle to where the AI wants it.
//   3. Convert that to deg/sec against the WALL CLOCK, clamp it to a flight
//      envelope, and ramp the angular RATE (not the angle) so turns ease in
//      and out. A break turn now has a beginning, a middle and an end.
//   4. Slerp the hull that far and no further, then write back an euler in a
//      representation continuous with the start value, so game-core's
//      component-wise glide walks the short arc instead of a bogus one.
//
// Everything downstream is unchanged: still enemy.rotation, still the same
// glide, no new meshes, no new draw calls, no per-frame hook.
// =============================================================================

// deg/sec ceilings. 240°/s ≈ 8°/frame at the 30 fps this build runs at —
// fast enough for an arcade interceptor, slow enough that the eye tracks the
// nose all the way round. A ship flying an evasive maneuver is ALLOWED to be
// more violent; that is the whole point of the maneuver, and the profiles
// below are tuned to sit just under this number so the roll never gets
// clipped (a clipped roll loses that rotation permanently — the deltas are
// consumed whether or not they are applied — which is exactly why the old
// barrel roll stalled short of inverted).
const _GOV_RATE_CRUISE = 240;
const _GOV_RATE_EVADE  = 360;
// Longest tick the governor will bill for. The render glide splits one
// tick's rotation evenly across the interval's frames, so per-frame motion is
// rate x frametime — already framerate-independent. The exception is a HITCH:
// a 130 ms tick would hand the glide 1.6x the usual arc and the catch-up
// lands as one outsized frame (measured: a 24.7 deg spike mid-barrel-roll).
// Billing a hitch as 100 ms means a stuttering machine turns very slightly
// slower rather than jumping.
const _GOV_DT_MAX = 0.10;
// deg/sec² . 900 takes ~0.27 s to wind up to full rate: the visible "load up"
// at the start of a break turn. Maneuvers snap in much harder.
const _GOV_ACCEL_CRUISE = 900;
const _GOV_ACCEL_EVADE  = 2600;
const _GOV_TAU  = Math.PI * 2;
const _GOV_D2R  = Math.PI / 180;
const _GOV_R2D  = 180 / Math.PI;

const _govQA = (typeof THREE !== 'undefined') ? new THREE.Quaternion() : null;
const _govQB = (typeof THREE !== 'undefined') ? new THREE.Quaternion() : null;
const _govEu = (typeof THREE !== 'undefined') ? new THREE.Euler(0, 0, 0, 'YXZ') : null;

// Shift `v` by whole turns until it sits closest to `ref`. Euler components
// are periodic, so this changes the NUMBER without changing the rotation.
function _govNearTurn(v, ref) {
    return v + _GOV_TAU * Math.round((ref - v) / _GOV_TAU);
}

// Install the aviation euler order on a hull, once. Must run BEFORE the
// tick's orientation writes; re-expresses the CURRENT orientation in the new
// order (identical rotation) and re-bases the in-flight glide start with it
// so the changeover is invisible.
function _enemyOrientBegin(enemy) {
    if (!enemy || !enemy.rotation || !enemy.quaternion) return;
    if (enemy.rotation.order === 'YXZ') return;
    enemy.rotation.setFromQuaternion(enemy.quaternion, 'YXZ');
    const ud = enemy.userData;
    if (ud && ud._iFromRot) {
        ud._iFromRot.x = enemy.rotation.x;
        ud._iFromRot.y = enemy.rotation.y;
        ud._iFromRot.z = enemy.rotation.z;
    }
    if (ud && ud._iToRot) {
        ud._iToRot.x = enemy.rotation.x;
        ud._iToRot.y = enemy.rotation.y;
        ud._iToRot.z = enemy.rotation.z;
    }
}

function _enemyOrientGovern(enemy) {
    if (!enemy || !_govQA || !enemy.userData) return;
    const ud = enemy.userData;
    const from = ud._iFromRot;
    // No glide state = this hull drives its own transform (UFOs, BORG) or
    // has not been ticked yet. Nothing to govern against.
    if (!from) return;

    // --- where the player last SAW it, and where the AI wants it ---------
    _govEu.set(from.x, from.y, from.z, 'YXZ');
    _govQA.setFromEuler(_govEu);          // start (rendered) orientation
    _govQB.copy(enemy.quaternion);        // AI intent, after every authority

    let dot = _govQA.dot(_govQB);
    if (dot < 0) dot = -dot;              // q and -q are the same rotation
    if (dot > 1) dot = 1;
    const angRad = 2 * Math.acos(dot);
    if (!(angRad > 1e-5)) { ud._govRate = 0; ud._govT = Date.now(); return; }

    // --- wall-clock rate limiting ---------------------------------------
    // Tick cadence is derived from the display refresh, so a frame budget
    // would mean different physics on a 45 Hz laptop and a 144 Hz desktop.
    // Seconds are the only honest unit here.
    const now = Date.now();
    let dt = (now - (ud._govT || 0)) / 1000;
    if (!(dt > 0.004 && dt < 0.5)) dt = 0.066;   // first tick / tab-restore
    if (dt > _GOV_DT_MAX) dt = _GOV_DT_MAX;      // absorb hitches, don't catch up
    ud._govT = now;

    const evading = !!ud._evade;
    const capDeg   = evading ? _GOV_RATE_EVADE  : _GOV_RATE_CRUISE;
    const accelDeg = evading ? _GOV_ACCEL_EVADE : _GOV_ACCEL_CRUISE;

    const angDeg = angRad * _GOV_R2D;
    const demanded = angDeg / dt;                       // deg/s to close it now
    const wanted = demanded < capDeg ? demanded : capDeg;

    // Ramp the RATE, not the angle. Spin-up is limited (the load-up at the
    // start of a break); spin-down is 3x freer so a ship that has arrived
    // stops rather than wallowing past.
    let rate = ud._govRate || 0;
    const rise = accelDeg * dt;
    if (wanted > rate) rate = Math.min(wanted, rate + rise);
    else               rate = Math.max(wanted, rate - rise * 3);
    ud._govRate = rate;

    let stepDeg = rate * dt;
    if (stepDeg > angDeg) stepDeg = angDeg;
    const t = stepDeg / angDeg;

    if (t < 0.9999) {
        _govQA.slerp(_govQB, t);
        enemy.quaternion.copy(_govQA);   // syncs enemy.rotation via onChange
    }

    // --- euler continuity for the render glide ---------------------------
    // game-core lerps rotation.x/.y/.z component-wise. That is only the
    // short arc if the two endpoints are written in the same branch of the
    // euler's double cover. Pick the branch that is genuinely nearest.
    _govEu.setFromQuaternion(enemy.quaternion, 'YXZ');
    const ax = _govNearTurn(_govEu.x, from.x);
    const ay = _govNearTurn(_govEu.y, from.y);
    const az = _govNearTurn(_govEu.z, from.z);
    // The other YXZ solution for the SAME rotation (middle axis is X):
    // (x, y, z) ≡ (π − x, y + π, z + π).
    const bx = _govNearTurn(Math.PI - _govEu.x, from.x);
    const by = _govNearTurn(_govEu.y + Math.PI, from.y);
    const bz = _govNearTurn(_govEu.z + Math.PI, from.z);
    const costA = Math.max(Math.abs(ax - from.x), Math.abs(ay - from.y), Math.abs(az - from.z));
    const costB = Math.max(Math.abs(bx - from.x), Math.abs(by - from.y), Math.abs(bz - from.z));
    const useB = costB < costA;
    let rx = useB ? bx : ax, ry = useB ? by : ay, rz = useB ? bz : az;
    const cost = useB ? costB : costA;

    // Keep the roll counter from marching off to ±1e6 over a long session of
    // rolls: rebase BOTH ends by the same whole turns, which is a no-op on
    // the rendered arc.
    if (rz > 12.6 || rz < -12.6) {
        const k = Math.round(rz / _GOV_TAU) * _GOV_TAU;
        rz -= k; from.z -= k;
    }

    enemy.rotation.set(rx, ry, rz, 'YXZ');

    // Degenerate glide guard. Near nose-straight-up the euler is
    // ill-conditioned: components can swing far wider than the real
    // rotation, and the component-wise lerp would fly the hull through an
    // orientation neither endpoint asked for. When the euler path is more
    // than ~2.5x the true arc, skip the glide for this interval and hold the
    // governed orientation — a bounded step of at most one tick's budget
    // instead of an unbounded excursion.
    const stepRad = stepDeg * _GOV_D2R;
    if (cost > Math.max(0.5, stepRad * 2.5)) {
        from.x = rx; from.y = ry; from.z = rz;
    }
}
if (typeof window !== 'undefined') {
    window._enemyOrientGovern = _enemyOrientGovern;
    window._enemyOrientBegin  = _enemyOrientBegin;
}

// The render glide in game-core.js lerps enemy.rotation.x/.z component-wise
// with NO shortest-path handling (only .y gets that). A roll that crosses
// ±π therefore glides the LONG way round — a 6-radian counter-spin inside
// one 33 ms interval, which reads as a hitch. Euler z and z±2π are the same
// rotation, so nudging the glide's START value by a full turn removes the
// discontinuity without changing a single orientation.
// SUPERSEDED by _enemyOrientGovern's branch selection, which does this for
// all three components and picks between both euler solutions. Kept because
// it is exported/called defensively, but it is now a no-op when the governor
// has run.
function _unwrapEnemyInterpRoll(enemy) {
    const ud = enemy.userData;
    const from = ud._iFromRot;
    if (!from) return;
    const TAU = Math.PI * 2;
    let dz = enemy.rotation.z - from.z;
    if (dz > Math.PI && Math.abs(from.z + TAU) < 40)      from.z += TAU;
    else if (dz < -Math.PI && Math.abs(from.z - TAU) < 40) from.z -= TAU;
    let dx = enemy.rotation.x - from.x;
    if (dx > Math.PI && Math.abs(from.x + TAU) < 40)      from.x += TAU;
    else if (dx < -Math.PI && Math.abs(from.x - TAU) < 40) from.x -= TAU;
}

// ── Attack telegraph ─────────────────────────────────────────────────────
// game-core.js drives every enemy hull's emissiveIntensity each frame from
// child.userData.baseEmissive. That makes baseEmissive a ready-made hook:
// raise it and the enemy visibly charges up, restore it and the charge
// drops — no new material, no new mesh, nothing for the pulse loop to
// fight over.
function _setEnemyTelegraph(enemy, charge) {
    const ud = enemy.userData;
    if (!ud._telegraphMeshes) {
        const list = [];
        enemy.traverse(n => {
            if (!n.isMesh || !n.material) return;
            const u = n.userData || {};
            if (u.isGlowLayer || u.isHitbox || u._isThrusterCone ||
                u._isHullRead || u.isEnemyShield) return;
            if (n.material.emissiveIntensity === undefined) return;
            if (u._telegraphBase === undefined) {
                u._telegraphBase = (u.baseEmissive !== undefined)
                    ? u.baseEmissive : n.material.emissiveIntensity;
            }
            list.push(n);
        });
        ud._telegraphMeshes = list;
    }
    const meshes = ud._telegraphMeshes;
    if (!meshes.length) return;
    // Charge 0 -> 1 maps to a 1x -> 1.9x emissive ramp. It USED to be
    // 1x -> 3.4x, and that was measured to be pure cost: tone mapping has
    // already flattened the hull by combat range, so at 700u the whole
    // 3.4x sweep moved the hull's p90 luminance from 251.4 to 251.9 — an
    // invisible +0.2% — while at close range the extra emissive helped
    // clip the ship into the flat white wad this build spent a round
    // undoing. The telegraph's real punch now lives on the engine plume
    // (additive over black sky = actual headroom, see
    // _updateShipThrusterCones) and on the rim boost below. What is left
    // here is just enough hull warmth to tie the two together.
    const k = 1 + charge * charge * 0.9;
    for (let i = 0; i < meshes.length; i++) {
        const u = meshes[i].userData;
        u.baseEmissive = u._telegraphBase * k;

        // ALSO drive the hull's fresnel rim. Emissive alone is a weak tell
        // now: the hull's own floor is deliberately low but tone mapping
        // compresses the top of the ramp, so 1x -> 3.4x only moved measured
        // hull luminance ~+20%. Pushing the rim's boost blend to 1 at full
        // charge swings the silhouette to the bright shimmer colour at the
        // same time, so the windup reads as the ship LIGHTING UP at its
        // edges rather than as a slightly warmer fill.
        const mat = meshes[i].material;
        const rim = mat && mat.userData && mat.userData._rimUniforms;
        if (rim && rim.boostT) {
            if (u._telegraphRimBase === undefined) u._telegraphRimBase = rim.boostT.value;
            const b = u._telegraphRimBase;
            rim.boostT.value = b + (1 - b) * charge;
        }
    }
}

// ── Fire-cycle scheduler ─────────────────────────────────────────────────
// Replaces "one bolt per cooldown" with "a faction-shaped burst per
// cycle". Returns how many shots to fire on this tick (0 or 1) and keeps
// the telegraph charge up to date. Average rate is preserved because the
// between-burst rest is multiplied by the burst size.
function _updateEnemyFireCycle(enemy, cooldown, inRange) {
    const ud = enemy.userData;
    const ap = _factionAttackProfile(enemy);
    const now = Date.now();

    if (ud._burstLeft === undefined) ud._burstLeft = ap.burst;
    if (!ud.nextFire) ud.nextFire = now + Math.random() * 800;

    // Out of range: hold the cycle, drop any charge we'd built up. If the
    // schedule went stale while out of range, re-arm it far enough ahead
    // that coming back into range still plays a full telegraph instead of
    // spitting an unannounced bolt on the first frame.
    if (!inRange) {
        if (ud._telegraphing) { ud._telegraphing = false; _setEnemyTelegraph(enemy, 0); }
        ud._telegraphPhase = 0;
        if (now > ud.nextFire) ud.nextFire = now + ap.telegraph + 120;
        return 0;
    }

    // Telegraph only ahead of the FIRST bolt of a burst — follow-up shots
    // in the burst arrive on the rhythm the telegraph already announced.
    const firstOfBurst = (ud._burstLeft >= ap.burst);
    const lead = firstOfBurst ? ap.telegraph : 0;
    const untilFire = ud.nextFire - now;
    if (lead > 0 && untilFire > 0 && untilFire <= lead) {
        ud._telegraphing = true;
        ud._telegraphPhase = 1 - (untilFire / lead);
        _setEnemyTelegraph(enemy, ud._telegraphPhase);
    } else if (ud._telegraphing && untilFire > lead) {
        ud._telegraphing = false;
        ud._telegraphPhase = 0;
        _setEnemyTelegraph(enemy, 0);
    }

    if (now < ud.nextFire) return 0;

    // Bolt away — discharge the glow.
    if (ud._telegraphing) {
        ud._telegraphing = false;
        ud._telegraphPhase = 0;
        _setEnemyTelegraph(enemy, 0);
    }

    ud._burstLeft -= 1;
    if (ud._burstLeft > 0) {
        ud.nextFire = now + ap.gap;                 // stay inside the burst
    } else {
        ud._burstLeft = ap.burst;
        // cooldown * burst keeps shots-per-second identical to the old
        // one-shot-per-cooldown schedule; the jitter is the pre-existing
        // 1.0-1.5x desync so a squadron never volleys in lockstep.
        ud.nextFire = now + cooldown * ap.burst * ap.rest * (1.0 + Math.random() * 0.5);
        ud._burstEndedAt = now;
    }
    ud._lastBurstShotAt = now;
    return 1;
}

// Which phase of its attack run is this enemy in? Drives the movement
// pattern below so the player can read "he's diving on me" vs "he's
// setting up a strafing pass" from the ship's flight path alone.
function _attackPhase(enemy) {
    const ud = enemy.userData;
    const ap = _factionAttackProfile(enemy);
    const now = Date.now();
    if (ud._telegraphing) return 'aim';
    if (ud._burstLeft !== undefined && ud._burstLeft < ap.burst) return 'burst';
    if (now - (ud._burstEndedAt || 0) < 900) return 'break';
    return 'setup';
}

// Faction attack pattern -> attackMode override. Deterministic (driven by
// the fire clock), so it doesn't reintroduce the frame-to-frame mode
// flip-flop the dwell timer exists to prevent.
function _patternAttackMode(enemy, dist, faction) {
    const ap = _factionAttackProfile(enemy);
    const phase = _attackPhase(enemy);
    if (ap.pattern === 'lance') {
        // Commit to a straight dive through the shot, then break away.
        if (phase === 'aim' || phase === 'burst') return 'pursue';
        if (phase === 'break') return 'evade';
        return dist > faction.preferredRange * 2.4 ? 'pursue' : null;
    }
    if (ap.pattern === 'strafe') {
        // Run in, shoot on the pass, extend, come back around.
        if (phase === 'aim' || phase === 'burst') return 'pursue';
        if (phase === 'break') return 'evade';
        // Out past the bracket there is nothing to strafe yet — close the
        // distance. Without this an enemy that is out of firing range never
        // reaches the 'aim' phase, so it would hold 'flank' forever and
        // loiter at arm's length instead of pressing the attack.
        if (dist > faction.preferredRange * 2.2) return 'pursue';
        return 'flank';
    }
    // circle: hold the bracket and shoot across it; only close when far.
    if (dist > faction.preferredRange * 2.2) return 'pursue';
    if (phase === 'break') return 'swarm';
    return 'engage';
}

// ── Engagement closure governor ──────────────────────────────────────────
// An enemy's top speed is adjustedSpeed * 4.6 per behavior tick, and every
// faction's preferredRange is 80-250 u — but NOTHING ever checked that the
// hull could physically reach that range against a MOVING player. It can't:
// measured live, the player cruises 433 u/s while active attackers manage
// 304-421 u/s, so a pursuing fighter closes until it matches the player's
// speed and then just trails forever. Placing six enemies at 1400 u and
// watching for 25 s, they closed to ~1000 u and plateaued there — never
// reaching the 260 u break-into-orbit turn, never reaching preferredRange.
// That standoff is the real reason the ship reads as a speck: at the
// measured p50 of 1963 u an 18 u hull subtends ~4 px, and even the NEAREST
// attacker at 561 u only manages 15.5 px, which is how the enemy ended up
// dimmer and smaller than the HUD bracket pointing at it.
//
// So: while a hull is outside the engagement band, grant it just enough
// extra speed to actually GAIN on its target, and taper that back to its
// natural speed as it arrives. Closing becomes possible; the fight still
// happens at the enemy's own tuned speed once it is in the band, so this
// buys presence without turning every fighter into an unshakable rocket.
//
// ROUND 2 — the band was WRONG, and that one constant was the arithmetic
// cause of two failed acceptance tests. _CLOSURE_BAND_FAR was a flat 900 u,
// but every faction's own preferredRange is 80-250 u and
// updateEngagementBehavior steers to THAT number. So the assist switched
// off at 900 u and handed the hull back its natural 304-421 u/s against a
// 433 u/s player — it then physically could not close the remaining 700 u.
// Measured live over 40 samples: p50 nearest hostile ~400 u, min 262 u, i.e.
// 2x its own bracket, where the contact paints 374-381 lit px in a 45x30
// bbox (0.05% of the buffer). Every downstream readability metric — kill
// spectacle, thrust dynamic range — is multiplied by that silhouette, so
// they were all capped by this line.
//
// FIX 1: key the cutoff to the hull's OWN bracket instead of a global
// constant. The assist now stays alive from 900 u down to ~1.15x
// preferredRange (92-288 u), so hulls actually arrive in their 80-250 u
// ring and fight there.
//
// FIX 2, found by instrumenting the governor during the round-2 A/B and
// NOT visible from the band constant alone: moving the finish line was not
// enough, because the ceiling was expressed in the WRONG UNITS. `need`
// already computes the per-tick step required to gain on the player and
// divides it by this hull's own adjustedSpeed — the whole point being that
// every hull, fast or slow, arrives at the same absolute closing speed. Then
// `_CLOSURE_MAX = 4.0` clamped the RESULT in multiplier space, which caps a
// 0.26-speed hull at 0.26x the absolute speed of a 1.0-speed hull and
// re-introduces exactly the standoff `need` exists to remove. Instrumented
// live: k pinned at the 4.0 ceiling for the entire engagement while the
// hulls still lost ~20 u/s to the player and the range grew monotonically
// from 2,100u to 4,200u. Cap absolutely, not proportionally — the ceiling
// that matters is "how fast may a hostile move compared to YOU", and `need`
// already answers that (+25%), so the clamp is only a guard against a
// corrupted player-step sample.
//
// FIX 3: the taper. Handing the hull back its natural speed at the bracket
// edge is only correct against a stationary target. `engage` steps at
// speed*4.0 per tick, so a 1.0-speed hull holds 4.0 u/tick — a fraction of
// a cruising player — and a contact that fought its way into its 200u ring
// was immediately spat back out of it. So the assist now tapers to a
// STATION-KEEPING floor (`hold`) rather than to 1: just enough to sit in the
// ring the faction asked for. Deliberately a hair under parity, so a player
// who commits to running can still extend — you just have to actually
// commit, instead of the fight dissolving on its own.
//
// FIX 4: the ramp had to be re-scaled once 1-3 were in, because it sets the
// EQUILIBRIUM range, and measured live the equilibrium was 451u — a hull
// that could now hold station but not finish the approach. Two reasons, both
// unit errors. (i) `need` was divided by the PURSUIT step (4.6) while `hold`
// uses the ENGAGE step (4.0), and everything inside preferredRange*2.2 —
// which is where the last 240u of the approach happens — runs engage, so the
// two ends of the interpolation were quoted in different currencies and the
// real closing margin at 450u came out at 1.5% instead of the intended 25%.
// Both ends are now quoted against the engage step; pursuit's wider stride
// simply makes the long-range approach 15% brisker, which is the right place
// for it. (ii) A 500u ramp fades the margin out linearly, so the assist is
// weakest exactly where the last 200u have to be won. 260u puts the hull at
// full closing margin by ~470u and lets it coast the rest in.
//
// FIX 5, and this is the one that actually set the floor: the governor has
// to be quoted against the SLOWEST stride a hull uses inside the band, not
// the fastest. Each steering behavior applies its own per-tick multiple of
// `speed` — pursuit 4.6, engagement approach 4.0, orbit 3.2, and flanking
// 2.8 — and _closureSpeedScale cannot see which one is about to run. The
// last 200u of every approach is flown in FLANK (_patternAttackMode returns
// 'flank' for everything inside preferredRange*2.2), the 2.8 stride, chasing
// a flank point that is itself orbiting the moving player at 0.55 rad/s. So
// a governor calibrated on 4.0 delivered 2.8/4.0 = 0.7x parity there, and
// the measured equilibrium was 380-420u — hulls that had closed 1,200u at
// 307-320 u/s and then simply could not finish. Instrumented: k = 8-15,
// v = 307 u/s at 1,200u, v = 151 u/s (= parity) at 400u, mode 'flank'.
// Calibrating on 2.8 makes flank the parity case and hands the faster modes
// their natural head start, which is the right shape: the long approach is
// brisk, the knife fight is even.
//
// Once it is quoted that way the governor needs no separate speed cap, and
// must not have one in MULTIPLIER units: `_CLOSURE_MAX` in multiplier space
// re-broke everything a second time at low frame rate. The enemy AI ticks
// per FRAME while the player is a fixed-timestep sim, so at 9 fps a hull
// needs a ~50x multiplier just to match a 433 u/s player — measured, k was
// pinned at the 24 ceiling and the whole squadron fell out of detection
// range again. The bound that matters is the RATIO, and _CLOSURE_GAIN
// already is one: a hostile can never move faster than
// GAIN x (4.6 / 2.8) = 2.05x your speed, on any hull, at any frame rate,
// because every term is derived from your own measured displacement.
// _CLOSURE_MAX is now only a guard against a pathological divisor.
const _CLOSURE_BAND_FALLBACK = 140;   // used when a hull has no faction
const _CLOSURE_BAND_MARGIN   = 1.05;  // stop assisting right at the bracket
const _CLOSURE_RAMP     = 260;   // assist fades in across near..near+RAMP
const _CLOSURE_GAIN     = 1.25;  // closing speed as a multiple of the player's
const _CLOSURE_MAX      = 60;    // paranoia guard only; never the real limit
// The guard is quoted against the FASTEST stride any behavior can apply
// (pursuit, 4.6), so that even a hull that happens to be pursuing on the
// tick the ceiling binds cannot exceed _CLOSURE_SPEED_CEIL x the player's
// own measured displacement. 2.05 is exactly the bound the governor already
// implies (GAIN x 4.6 / 2.8), so this never binds in normal play — it only
// catches a pathological _closurePlayerStep sample.
const _CLOSURE_SPEED_CEIL = 2.05; // hostile speed as a multiple of the player's
const _CLOSURE_STEP_CEIL  = 4.6;  // fastest stride (updatePursuitBehavior)
const _CLOSURE_STEP_HOLD = 2.8;  // slowest in-band stride (updateFlankingBehavior)
const _CLOSURE_HOLD     = 0.96;  // station-keeping is a hair under parity
let _closurePrevPlayerPos = null;
let _closurePlayerStep = 0;      // player displacement PER BEHAVIOR TICK

// Sampled once per updateEnemyBehavior pass so it shares a clock with the
// enemy velocity integrator — that keeps the comparison in the same units
// without having to assume a tick rate.
function _updateClosureClock() {
    if (typeof camera === 'undefined' || typeof THREE === 'undefined') return;
    const p = camera.position;
    if (!_closurePrevPlayerPos) { _closurePrevPlayerPos = p.clone(); return; }
    const step = p.distanceTo(_closurePrevPlayerPos);
    _closurePrevPlayerPos.copy(p);
    // A warp/teleport shows up as a huge single-tick jump. Chasing that
    // number would hand every enemy the 4x ceiling for no reason.
    if (!isFinite(step) || step > 400) { _closurePlayerStep = 0; return; }
    _closurePlayerStep += (step - _closurePlayerStep) * 0.15;   // smoothed
}

function _closureSpeedScale(dist, adjustedSpeed, faction) {
    // Never chase a warping player — that fight isn't meant to be winnable
    // and the assist would just drag the whole squadron along behind them.
    if (typeof gameState !== 'undefined' && gameState && gameState.warping) return 1;
    const spd = Math.max(0.0001, adjustedSpeed);
    // Absolute ceiling, in the only currency the player can perceive: a
    // multiple of their own displacement. Frame-rate and hull agnostic.
    const ceil = Math.min(_CLOSURE_MAX,
        (_closurePlayerStep * _CLOSURE_SPEED_CEIL + 3) / (_CLOSURE_STEP_CEIL * spd));
    // Station-keeping floor: the multiplier that lets a hull ALREADY in its
    // bracket stay there, quoted against the slowest in-band stride. Never
    // below 1 (a parked player must not slow anyone down) and it collapses to
    // 1 on its own whenever the player is not actually moving.
    const hold = Math.max(1, Math.min(ceil,
        (_closurePlayerStep * _CLOSURE_HOLD / _CLOSURE_STEP_HOLD) / spd));
    // The hull's own engagement bracket is the finish line, not a constant.
    const near = ((faction && faction.preferredRange) || _CLOSURE_BAND_FALLBACK) * _CLOSURE_BAND_MARGIN;
    if (!(dist > near)) return hold;
    const ramp = Math.min(1, (dist - near) / _CLOSURE_RAMP);
    // Per-tick top speed needed to actually gain ground: match the target,
    // then add a real closing margin on top. This is ALREADY an absolute
    // speed target — dividing by `spd` is what makes every hull converge on
    // it — so the clamps are guards, never the operating limit.
    const need = (_closurePlayerStep * _CLOSURE_GAIN + 1.2) / _CLOSURE_STEP_HOLD;
    const k = Math.max(hold, Math.min(ceil, need / spd));
    return hold + (k - hold) * ramp;
}

// While rolling out of a gunsight an enemy should NOT stay perfectly
// nose-on — the whole point is that it looks away and commits.
function _enemyLookRate(enemy) {
    const ud = enemy.userData;
    // Nearly released mid-maneuver. The look-at builds a ZERO-ROLL
    // orientation, so any rate at all is a counter-torque on the roll —
    // 0.03 is just enough to keep the nose in the fight without eating
    // the maneuver.
    if (ud._evade) return 0.03;
    if (ud._telegraphing) return 0.40;          // locks on hard while aiming
    return 0.26;
}

// One call per active enemy per AI tick, after the steering behavior has
// run. Order matters: the maneuver slides the hull, then the roll is
// composed on top of the look-at orientation, then the interpolation
// start value is unwrapped so the glide takes the short way round.
function _updateEnemyCombatFeel(enemy) {
    if (!enemy || !enemy.userData || !_cfA) return;
    const ud = enemy.userData;
    // Panic-dodge: still being shot at and the last move has settled.
    if (ud._underFireUntil && Date.now() < ud._underFireUntil) {
        _tryStartEvasive(enemy, 'graze');
    }
    const roll = ud._evade ? _stepEvasive(enemy) : 0;
    _applyEnemyFlightRoll(enemy, roll);
    // (euler unwrap now handled by _enemyOrientGovern, which runs after
    // every orientation authority for this hull — including this one.)
}
if (typeof window !== 'undefined') window._updateEnemyCombatFeel = _updateEnemyCombatFeel;

function updateEnemyBehavior() {
    // Safety checks
    if (typeof enemies === 'undefined' || typeof gameState === 'undefined' || typeof camera === 'undefined') {
        return;
    }

    if (gamePaused || !gameState.gameStarted || gameState.gameOver) {
        return;
    }
    
    // PERFORMANCE: Only process enemies every other frame
    if (gameState.frameCount % 2 !== 0) {
        return;
    }
    
    // NEW: Don't activate enemies until tutorial is complete (IMPROVED DETECTION)
    if (typeof tutorialSystem !== 'undefined' && tutorialSystem.active && !tutorialSystem.completed) {
        // Tutorial is still active - enemies should be passive
        enemies.forEach(enemy => {
            if (enemy.userData.health <= 0) return;
            enemy.userData.isActive = false;
            enemy.userData.attackMode = 'patrol';

            // Tutorial patrollers still burn. `tutorialSpeed` — not a
            // velocity vector, which the patrol branch never writes — is
            // what tells the plume whether this hull is under thrust.
            // Parked hostiles (no patrolCenter) fall through with
            // thrusting=false and get the idle burn, which is still a
            // lit engine and still not a shape the starfield can make.
            let tutorialThrust = false;

            // Optional: Make enemies slowly patrol during tutorial
            if (enemy.userData.patrolCenter) {
                const time = Date.now() * 0.001;
                const patrolRadius = (enemy.userData.patrolRadius || 200) * 0.3;
                const angle = time * 0.1 + (enemy.userData.circlePhase || 0);

                const targetX = enemy.userData.patrolCenter.x + Math.cos(angle) * patrolRadius;
                const targetZ = enemy.userData.patrolCenter.z + Math.sin(angle) * patrolRadius;
                const targetY = enemy.userData.patrolCenter.y + Math.sin(angle * 0.5) * 20;

                const targetPos = new THREE.Vector3(targetX, targetY, targetZ);
                const direction = new THREE.Vector3().subVectors(targetPos, enemy.position).normalize();
                const tutorialSpeed = Math.max(0.2, (enemy.userData.speed || 0.5) * 0.5);  // Min 200 km/s even in tutorial
                enemy.position.add(direction.multiplyScalar(tutorialSpeed));
                applyEnemyRotation(enemy, direction, tutorialSpeed);  // Make ship face movement direction
                tutorialThrust = tutorialSpeed > 0.08;
            }

            // Plume runs BEFORE the tutorial return, so the scripted
            // opening encounter — the first hostiles the player ever sees —
            // carries the same engine signature combat does.
            _enemyPlumeTick(enemy, tutorialThrust,
                            camera.position.distanceTo(enemy.position));
        });
        return; // Exit early - don't process combat logic during tutorial
    }
    
    // TUTORIAL COMPLETE: Normal enemy behavior now active
    if (typeof tutorialSystem !== 'undefined' && tutorialSystem.completed) {
        // Log once when tutorial is complete and enemies should activate
        const now = Date.now();
        if (!tutorialSystem.enemiesActivatedLogTime) {
            // Was: re-logged every 5s — silenced for console cleanliness.
            tutorialSystem.enemiesActivatedLogTime = now;
        }
    }
    
    // PROGRESSIVE DIFFICULTY: Calculate based on galaxies cleared
    const galaxiesCleared = gameState.galaxiesCleared || 0;
    const difficultySettings = calculateDifficultySettings(galaxiesCleared);

    // Up-to-3-attackers-per-target assignment runs once before per-enemy
    // behavior so each enemy can read enemy.userData.engagedTarget below.
    _assignEngagementTargets();

    // Player displacement per behavior tick — feeds the closure governor.
    if (typeof _updateClosureClock === 'function') _updateClosureClock();

    // Boss homing missiles fly every behavior pass (30 Hz)
    if (typeof _updateBossMissiles === 'function') _updateBossMissiles();

    let nearbyEnemyCount = 0;
    let inCombatRange = false;
    let activeAttackers = 0;
    let localActiveAttackers = 0;

    // Count current active attackers
    enemies.forEach(enemy => {
        if (enemy.userData.health <= 0) return;
        if (enemy.userData.isActive) {
            activeAttackers++;
            if (isEnemyInLocalGalaxy(enemy)) {
                localActiveAttackers++;
            }
        }
    });

    // Precompute camera + player-ship world positions once for the
    // flight-hygiene pass. shipPos is only set when the 3rd-person
    // ship mesh is actually visible (so corridor clearance is skipped
    // in zero-offset / no-ship views where there's nothing to occlude).
    const _fhCam = (typeof camera !== 'undefined') ? camera.position : null;
    let _fhShip = null;
    try {
        const _cs = window.cameraState;
        const _ship = _cs && _cs.playerShipMesh;
        if (_ship && _ship.visible) {
            _fhShip = _ship.getWorldPosition(new THREE.Vector3());
            if (!isFinite(_fhShip.x)) _fhShip = null;
        }
    } catch (e) { _fhShip = null; }

    enemies.forEach(enemy => {
        if (enemy.userData.health <= 0) return;

        // Put this hull on the aviation euler order BEFORE anything writes
        // its orientation this tick. One-time per enemy; see
        // _enemyOrientBegin.
        if (typeof _enemyOrientBegin === 'function') _enemyOrientBegin(enemy);

        const playerPos = camera.position.clone();
        const distanceToPlayer = playerPos.distanceTo(enemy.position);
        const isLocal = isEnemyInLocalGalaxy(enemy);

        const detectionRange = isLocal ?
            (difficultySettings.localDetectionRange || 2000) :
            (enemy.userData.detectionRange || difficultySettings.distantDetectionRange || 3000);
        // Use the HIGHER of difficulty setting or enemy's own firingRange
        const firingRange = isLocal ?
            Math.max(difficultySettings.localFiringRange || 200, enemy.userData.firingRange || 0) :
            Math.max(enemy.userData.firingRange || 0, difficultySettings.distantFiringRange || 300);

        // Count nearby enemies
        if (distanceToPlayer < detectionRange) {
            nearbyEnemyCount++;
            if (distanceToPlayer < firingRange * 2) {
                inCombatRange = true;
            }
        }

        // PROGRESSIVE DIFFICULTY: Apply attacker limits — only N enemies
        // are active at once, the rest stay dormant.
        const maxAttackers = isLocal ? difficultySettings.maxLocalAttackers : difficultySettings.maxDistantAttackers;
        const currentAttackers = isLocal ? localActiveAttackers : activeAttackers;

        if (distanceToPlayer < detectionRange && !enemy.userData.isActive && currentAttackers < maxAttackers) {
            enemy.userData.isActive = true;
            enemy.userData.detectedPlayer = true;
            enemy.userData.lastSeenPlayerPos = playerPos.clone();
            // Stagger the opening shot. Warping into a distant black-hole
            // galaxy activates a whole batch of enemies on the SAME frame,
            // so spread their first shots across a wide ~1.6s window
            // instead of letting them all fire on frame one.
            enemy.userData.lastAttack = Date.now() - Math.random() * 1200;
            enemy.userData.nextFire = Date.now() + Math.random() * 1600;

            if (isLocal) localActiveAttackers++;
            else activeAttackers++;
        } else if (enemy.userData.isActive &&
                   (distanceToPlayer > detectionRange * 1.5 || currentAttackers > maxAttackers)) {
            enemy.userData.isActive = false;
            enemy.userData.detectedPlayer = false;
            if (isLocal) localActiveAttackers--;
            else activeAttackers--;
        }
        
        if (enemy.userData.isActive) {
            // FIXED: Enemy speeds 200-1000 km/s (0.2-1.0 game units, multiply by 1000 for km/s display)
            const baseSpeed = enemy.userData.speed || 0.5;
            const speedMultiplier = isLocal ? difficultySettings.localSpeedMultiplier : difficultySettings.distantSpeedMultiplier;
            const adjustedSpeed = Math.min(2.0, Math.max(0.2, baseSpeed * speedMultiplier));  // Clamp to 0.2-2.0 (200-2000 km/s)
            // Closure assist applies OUTSIDE the engage band only, so the
            // dogfight itself still runs at the speed each faction is tuned
            // for. Deliberately applied after the 0.2-2.0 clamp: that clamp
            // is the per-faction speed identity, this is permission to
            // actually arrive at the fight.
            const _clFaction = (typeof getFactionBehavior === 'function') ? getFactionBehavior(enemy) : null;
            const engageSpeed = adjustedSpeed * _closureSpeedScale(distanceToPlayer, adjustedSpeed, _clFaction);

            if (isLocal) {
                updateLocalEnemyBehavior(enemy, distanceToPlayer, engageSpeed, difficultySettings);
            } else {
                if (enemy.userData.isBoss) {
                    updateBossBehavior(enemy, playerPos, engageSpeed);
                } else if (enemy.userData.isBossSupport) {
                    updateSupportBehavior(enemy, playerPos, engageSpeed);
                } else {
                    updateEnhancedEnemyBehavior(enemy, distanceToPlayer, engageSpeed, difficultySettings);
                }
            }

            // Combat feel: evasive maneuver step + banking/roll overlay.
            // Runs AFTER the steering behavior (which ends in a zero-roll
            // look-at) so the roll composes on top instead of being wiped.
            if (typeof _updateEnemyCombatFeel === 'function') {
                _updateEnemyCombatFeel(enemy);
            }
        } else if (isLocal && (enemy.userData.isMartianPirate || enemy.userData.isVulcanPatrol)) {
            // Idle Pirates / Vulcans should ALWAYS be moving, not loitering.
            // Run a formation-flight patrol that slowly drifts the whole
            // group's patrol centre through space so they read as ships
            // on a route. Faster than the old tutorial-only patrol.
            _updateLocalFormationPatrol(enemy);
        }

        // Orange combat shield: only raised while the enemy is actively
        // engaging (isActive — it has detected and is targeting the
        // player or a wingman). Drops when it disengages.
        if (typeof _setEnemyShieldEngaged === 'function') {
            _setEnemyShieldEngaged(enemy, !!enemy.userData.isActive);
        }

        // Post-behavior flight hygiene for ACTIVE combatants: enforce a
        // minimum drift so they don't park/cluster on the player, and
        // keep them out of the camera→ship sightline so they don't
        // block the player's view of their own ship during combat.
        if (enemy.userData.isActive && typeof _enemyFlightHygiene === 'function') {
            _enemyFlightHygiene(enemy, _fhShip, _fhCam, playerPos, isLocal);
        }

        // Keep enemies OUT of every black hole's event-horizon warp zone
        // (with a combat-range buffer) so the player can't be lured into
        // a warp by chasing a hostile that dives toward the hole.
        if (typeof _enemyAvoidBlackHoles === 'function') {
            _enemyAvoidBlackHoles(enemy);
        }

        // Engine plume — see _enemyPlumeTick. Combat hulls carry a real
        // velocity vector, so speed picks idle vs full burn.
        {
            const _v = enemy.userData.velocity;
            const _speedNow = _v ? _v.length() : (enemy.userData.isActive ? 0.5 : 0.2);
            _enemyPlumeTick(enemy, _speedNow > 0.08, distanceToPlayer);
        }

        if (enemy.userData.isActive) {
            
            // Enhanced enemy firing with progressive difficulty.
            // Compute distance to nearest TARGET (player OR any alive wingman)
            // so enemies near wingmen still fire even when the player is far.
            let nearestTargetDist = distanceToPlayer;
            if (typeof allyShips !== 'undefined') {
                for (let _ai = 0; _ai < allyShips.length; _ai++) {
                    const _w = allyShips[_ai];
                    if (!_w || !_w.userData || _w.userData.health <= 0) continue;
                    const _wd = _w.position.distanceTo(enemy.position);
                    if (_wd < nearestTargetDist) nearestTargetDist = _wd;
                }
            }
            // Standard firing — only `maxAttackers` are active so the rate
            // is naturally capped at the original 2-day-ago levels.
            //
            // The schedule now runs through _updateEnemyFireCycle, which
            // groups the same number of shots into a faction-shaped BURST
            // and lights a brief emissive telegraph before the first bolt.
            // Average shots-per-second is unchanged (the between-burst rest
            // is multiplied by the burst size) — this buys readability, not
            // difficulty. Bosses keep the plain one-shot cadence so their
            // scripted specials stay on their own clock.
            {
                const now = Date.now();
                const attackCooldown = isLocal ?
                    (difficultySettings.localAttackCooldown || 2000) :
                    (enemy.userData.isBoss ? 600 : difficultySettings.distantAttackCooldown || 1200);
                const inRange = nearestTargetDist < firingRange;

                if (enemy.userData.isBoss) {
                    if (inRange && now >= (enemy.userData.nextFire || 0)) {
                        fireEnemyWeapon(enemy, difficultySettings);
                        enemy.userData.lastAttack = now;
                        enemy.userData.nextFire = now + attackCooldown * (1.0 + Math.random() * 0.7);
                    }
                } else if (typeof _updateEnemyFireCycle === 'function') {
                    if (_updateEnemyFireCycle(enemy, attackCooldown, inRange)) {
                        fireEnemyWeapon(enemy, difficultySettings);
                        enemy.userData.lastAttack = now;
                    }
                }
            }
        } else {
            // FIXED: Patrol behavior - enemies always thrust forward at min 200 km/s
            const baseSpeed = enemy.userData.speed || 0.5;
            const patrolSpeed = Math.min(1.0, Math.max(0.2, baseSpeed * 0.8));  // Patrol at 80% speed, clamped to 0.2-1.0 (200-1000 km/s)
            updatePatrolBehavior(enemy, playerPos, patrolSpeed, Date.now() * 0.001);
        }

        // LAST WORD ON ORIENTATION. Everything above wrote where the AI
        // *wants* the hull pointed; this converts that intent into a turn
        // the eye can follow. Must stay the final orientation write in the
        // tick — game-core snapshots enemy.rotation as the glide target the
        // instant updateEnemyBehavior returns.
        if (typeof _enemyOrientGovern === 'function') _enemyOrientGovern(enemy);

    });
    
    // Update combat status for UI
    if (gameState.inCombat !== undefined) {
        gameState.inCombat = inCombatRange;
    }
}

// =============================================================================
// FACTION-SPECIFIC ATTACK PATTERNS
// Each faction has a unique combat style!
// =============================================================================

const factionBehaviors = {
    // Galaxy 0: FEDERATION - Tactical coordination, stay at optimal range
    0: {
        name: 'Federation',
        style: 'tactical',
        primaryBehavior: 'engage',      // Maintain optimal distance
        secondaryBehavior: 'flank',     // Coordinated flanking
        aggressionMultiplier: 0.8,      // Moderate aggression
        preferredRange: 200,            // Medium range fighters
        behaviorChangeChance: 0.0005,   // Rarely change tactics
        speedBonus: 1.0
    },
    // Galaxy 1: KLINGON - Aggressive head-on charges, honorable combat
    1: {
        name: 'Klingon',
        style: 'berserker',
        primaryBehavior: 'pursue',      // Direct charge!
        secondaryBehavior: 'pursue',    // Always charging
        aggressionMultiplier: 1.5,      // Very aggressive
        preferredRange: 80,             // Close range warriors
        behaviorChangeChance: 0.0002,   // Stay committed to the charge
        speedBonus: 1.3                 // Fast and furious
    },
    // Galaxy 2: REBEL - Hit and run, guerrilla tactics
    2: {
        name: 'Rebel',
        style: 'guerrilla',
        primaryBehavior: 'evade',       // Hit and run
        secondaryBehavior: 'flank',     // Attack from angles
        aggressionMultiplier: 0.7,      // Cautious
        preferredRange: 250,            // Keep distance
        behaviorChangeChance: 0.003,    // Frequently reposition
        speedBonus: 1.2                 // Quick escapes
    },
    // Galaxy 3: ROMULAN - Ambush predators, patience then strike
    3: {
        name: 'Romulan',
        style: 'ambush',
        primaryBehavior: 'flank',       // Circle for position
        secondaryBehavior: 'pursue',    // Then strike hard
        aggressionMultiplier: 1.2,      // Deadly when attacking
        preferredRange: 150,            // Mid-range
        behaviorChangeChance: 0.001,    // Patient
        speedBonus: 1.1
    },
    // Galaxy 4: IMPERIAL - Overwhelming swarm tactics
    4: {
        name: 'Imperial',
        style: 'swarm',
        primaryBehavior: 'swarm',       // Surround target
        secondaryBehavior: 'engage',    // Press the attack
        aggressionMultiplier: 1.0,      // Standard aggression
        preferredRange: 120,            // Close swarm
        behaviorChangeChance: 0.0008,   // Coordinated
        speedBonus: 0.9                 // Slower but numerous
    },
    // Galaxy 5: CARDASSIAN - Strategic encirclement
    5: {
        name: 'Cardassian',
        style: 'encircle',
        primaryBehavior: 'flank',       // Surround first
        secondaryBehavior: 'swarm',     // Then close in
        aggressionMultiplier: 0.9,      // Calculated
        preferredRange: 180,            // Medium range
        behaviorChangeChance: 0.0015,   // Adaptive
        speedBonus: 1.0
    },
    // Galaxy 6: SITH - Relentless pursuit, no mercy
    6: {
        name: 'Sith',
        style: 'relentless',
        primaryBehavior: 'pursue',      // Hunt them down
        secondaryBehavior: 'engage',    // Aggressive engagement
        aggressionMultiplier: 1.4,      // Very aggressive
        preferredRange: 100,            // Get close for the kill
        behaviorChangeChance: 0.0003,   // Focused
        speedBonus: 1.25                // Dark side speed boost
    },
    // Galaxy 7: VULCAN - Logical, precise calculated attacks
    7: {
        name: 'Vulcan',
        style: 'precision',
        // Vulcans used to default to 'engage' which only applies tiny
        // per-frame position deltas — they crept while pirates ripped.
        // Switched to 'pursue' for primary (velocity-based, fast) and
        // kept 'engage' as the secondary tactical-hold mode.
        primaryBehavior: 'pursue',
        secondaryBehavior: 'engage',
        aggressionMultiplier: 1.0,      // bumped from 0.85
        preferredRange: 200,            // a bit wider so engage doesn't lock them in place
        behaviorChangeChance: 0.008,
        speedBonus: 1.1                 // a touch faster than baseline
    }
};

// Force-activate an enemy when it takes damage. Without this, enemies
// outside the maxAttackers cap stay in patrol mode and don't fight back
// or evade when the player (or wingmen) shoot them — they just orbit
// their patrolCenter looking broken.
function _activateOnDamage(enemy) {
    if (!enemy || !enemy.userData) return;
    // Taking a hit ALWAYS provokes a break turn — even for an enemy that
    // was already engaged. This is the most direct "he reacted to my shot"
    // feedback the player gets.
    enemy.userData._underFireUntil = Date.now() + 1800;
    if (typeof _tryStartEvasive === 'function') _tryStartEvasive(enemy, 'hit');
    if (enemy.userData.isActive) return; // already active
    enemy.userData.isActive = true;
    enemy.userData.detectedPlayer = true;
    enemy.userData.lastSeenPlayerPos = (typeof camera !== 'undefined') ? camera.position.clone() : null;
    // Low-HP enemies evade immediately; others engage
    const hp = enemy.userData.health / (enemy.userData.maxHealth || 1);
    enemy.userData.attackMode = hp < 0.5 ? 'evade' : 'engage';
}

// Get faction behavior for an enemy
function getFactionBehavior(enemy) {
    const galaxyId = enemy.userData.galaxyId;
    if (galaxyId !== undefined && factionBehaviors[galaxyId]) {
        return factionBehaviors[galaxyId];
    }
    // Default to Federation-style if unknown
    return factionBehaviors[0];
}

// UPDATED: Local enemy behavior with FACTION-SPECIFIC AI + wingman targeting
function updateLocalEnemyBehavior(enemy, distanceToPlayer, adjustedSpeed, difficultySettings) {
    if (!enemy || !enemy.userData || typeof camera === 'undefined' || typeof THREE === 'undefined') {
        return;
    }

    const time = Date.now() * 0.001;
    let playerPos = camera.position.clone();
    const faction = getFactionBehavior(enemy);
    const factionSpeed = adjustedSpeed * faction.speedBonus;

    // ── Target selection: honor the per-frame engagement assignment so
    // at most 3 enemies pile on the player and at most 3 on each wingman.
    // _assignEngagementTargets sets enemy.userData.engagedTarget; we
    // resolve it here to a concrete position.
    let targetPos = playerPos;
    let targetDist = distanceToPlayer;
    const _assigned = _engagedTargetPos(enemy);
    if (_assigned) {
        targetPos = _assigned.clone();
        targetDist = enemy.position.distanceTo(_assigned);
    }

    if (distanceToPlayer < difficultySettings.localDetectionRange) {
        enemy.userData.lastSeenPlayerPos = playerPos.clone();
        enemy.userData.lastSeenTime = time;
    }

    if (!enemy.userData.attackMode) {
        enemy.userData.attackMode = faction.primaryBehavior;
    }

    // Mode-switch dwell: these RANDOM attackMode rolls each fire per-frame (a
    // faction primary/secondary flip, a low-HP evade roll, and a 10% swarm
    // roll). Re-rolling several times a second flips the enemy between modes
    // that move in opposite directions (pursue=toward, evade=away,
    // swarm=converge), so its motion reverses frame-to-frame — that is the
    // "enemies move jittery" vibration. Commit to a chosen maneuver for ~0.9s
    // before another RANDOM switch may fire. Distance-based overrides below are
    // deterministic and stay instant.
    const _now = Date.now();
    const _modeLocked = (_now - (enemy.userData._lastModeChange || 0)) < 900;

    // Faction-specific behavior changes (more frequent for active dogfighting)
    const changeChance = (faction.behaviorChangeChance || 0.002) * 3;
    if (!_modeLocked && Math.random() < changeChance) {
        if (enemy.userData.attackMode === faction.primaryBehavior) {
            enemy.userData.attackMode = faction.secondaryBehavior;
        } else {
            enemy.userData.attackMode = faction.primaryBehavior;
        }
        enemy.userData._lastModeChange = _now;
    }

    // Health-triggered evasion: low-HP enemies bias toward evade
    const healthFraction = enemy.userData.health / (enemy.userData.maxHealth || 1);
    if (!_modeLocked && healthFraction < 0.5 && Math.random() < 0.04) {
        enemy.userData.attackMode = 'evade';
        enemy.userData._lastModeChange = _now;
    }

    // Multi-enemy swarming: if 2+ enemies are within 1200u of the target,
    // bias toward swarm so they converge instead of fighting individually.
    // Check chance bumped 0.02 -> 0.10 (5x) and radius widened 800 -> 1200
    // so groups commit to a swarm much more often than they did before —
    // user feedback was that enemies needed to swarm the player better.
    if (!_modeLocked && Math.random() < 0.10 && typeof enemies !== 'undefined') {
        let nearbyAllies = 0;
        for (let j = 0; j < enemies.length; j++) {
            const e = enemies[j];
            if (!e || e === enemy || !e.userData || e.userData.health <= 0) continue;
            if (e.position.distanceTo(targetPos) < 1200) nearbyAllies++;
            if (nearbyAllies >= 2) break;
        }
        if (nearbyAllies >= 2) {
            enemy.userData.attackMode = 'swarm';
            enemy.userData._lastModeChange = _now;
        }
    }

    // Distance-based overrides
    if (faction.style === 'berserker' && targetDist > 300) {
        enemy.userData.attackMode = 'pursue';
    } else if (faction.style === 'guerrilla' && targetDist < 100) {
        enemy.userData.attackMode = 'evade';
    } else if (faction.style === 'ambush' && targetDist < faction.preferredRange) {
        enemy.userData.attackMode = 'pursue';
    }

    // ── Faction attack RHYTHM drives the flight path ────────────────────
    // Lance factions (Klingon/Sith/Romulan) dive straight through the
    // shot then break; strafe factions (Rebel/Vulcan) run a pass and
    // extend; circle factions (Federation/Imperial/Cardassian) hold the
    // bracket and shoot across it. Driven by the fire clock, so it is
    // deterministic and doesn't reintroduce per-frame mode flip-flop.
    if (typeof _patternAttackMode === 'function') {
        const _pm = _patternAttackMode(enemy, targetDist, faction);
        if (_pm && _pm !== enemy.userData.attackMode) {
            enemy.userData.attackMode = _pm;
            enemy.userData._lastModeChange = _now;
        }
    }

    // Override playerPos with the nearest target so all behaviors steer toward
    // either the player OR a wingman, whichever is closer.
    playerPos.copy(targetPos);
    distanceToPlayer = targetDist;
    
    switch (enemy.userData.attackMode) {
        case 'pursue':
            updatePursuitBehavior(enemy, playerPos, factionSpeed * faction.aggressionMultiplier, distanceToPlayer);
            break;
        case 'swarm':
            updateSwarmBehavior(enemy, playerPos, factionSpeed, time);
            break;
        case 'evade':
            updateEvasionBehavior(enemy, playerPos, factionSpeed, time);
            break;
        case 'flank':
            updateFlankingBehavior(enemy, playerPos, factionSpeed, time);
            break;
        case 'engage':
            updateEngagementBehavior(enemy, playerPos, factionSpeed, time);
            break;
        default:
            updatePursuitBehavior(enemy, playerPos, factionSpeed, distanceToPlayer);
    }
    
    // Smooth quaternion slerp instead of instant lookAt — keeps the
    // turning motion fluid like wingmen instead of snapping the
    // orientation each frame when the target moves.
    // Snappier slerp than wingmen so "enemy turns to face you" reads
    // as deliberate combat orientation. Rate is now situational: hard
    // lock-on while telegraphing a shot, and almost released while
    // flying an evasive maneuver so the ship visibly commits to the
    // roll instead of tracking you through it like a turret.
    _smoothEnemyLookAt(enemy, playerPos,
        (typeof _enemyLookRate === 'function') ? _enemyLookRate(enemy) : 0.20);
}

// Smoothly rotate an enemy to face `targetPos` over multiple frames.
// rate is the slerp factor per frame: 0.06 = wingman smooth, 0.12 = a bit
// snappier (enemies actively dogfighting), 0.2 = very responsive.
const _enemyLookMat = new THREE.Matrix4();
const _enemyLookQuat = new THREE.Quaternion();
const _enemyUp = new THREE.Vector3(0, 1, 0);
function _smoothEnemyLookAt(enemy, targetPos, rate) {
    if (!enemy || !targetPos) return;
    try {
        // setFromUnitVectors-style approach using lookAt matrix.
        // The trick: pass (eye, target, up) — eye is the enemy, target is
        // where it should be looking. matrix.lookAt then composes the
        // rotation. Negate the direction (eye - target) to face forward.
        const pos = enemy.position;
        _enemyLookMat.lookAt(pos, targetPos, _enemyUp);
        _enemyLookQuat.setFromRotationMatrix(_enemyLookMat);
        enemy.quaternion.slerp(_enemyLookQuat, rate);
    } catch (e) {
        // Ignore — position/target may be invalid mid-cleanup
    }
}

// ENHANCED: Enhanced enemy behavior for distant galaxies
function updateEnhancedEnemyBehavior(enemy, distanceToPlayer, adjustedSpeed, difficultySettings) {
    // Safety checks
    if (!enemy || !enemy.userData || typeof camera === 'undefined' || typeof THREE === 'undefined') {
        return;
    }

    const time = Date.now() * 0.001;
    // Honor the engagement assignment so distant enemies steer toward
    // the player OR a wingman (whichever the cap put them on) instead
    // of always tracking the camera.
    const _assignedPos = _engagedTargetPos(enemy);
    const playerPos = _assignedPos ? _assignedPos.clone() : camera.position.clone();
    distanceToPlayer = enemy.position.distanceTo(playerPos);
    
    // Enhanced AI state machine
    if (!enemy.userData.behaviorState) {
        enemy.userData.behaviorState = 'patrol';
        enemy.userData.behaviorTimer = 0;
    }
    
    enemy.userData.behaviorTimer += 0.016; // Roughly 60fps

    // Faction attack rhythm overrides the state machine once the enemy is
    // actually inside its engagement bracket, so distant hostiles read the
    // same way local ones do: lance factions dive and break, strafe
    // factions make passes, circle factions hold the ring.
    if (typeof _patternAttackMode === 'function' &&
        enemy.userData.behaviorState !== 'patrol') {
        const _fb = getFactionBehavior(enemy);
        const _pm = _patternAttackMode(enemy, distanceToPlayer, _fb);
        const _mapped = _pm === 'evade' ? 'retreat'
                      : _pm === 'swarm' || _pm === 'flank' ? 'strafe'
                      : _pm === 'pursue' || _pm === 'engage' ? 'pursue' : null;
        if (_mapped && _mapped !== enemy.userData.behaviorState) {
            enemy.userData.behaviorState = _mapped;
            enemy.userData.behaviorTimer = 0;
        }
    }

    switch (enemy.userData.behaviorState) {
        case 'patrol':
            if (distanceToPlayer < difficultySettings.distantDetectionRange * 0.7) {
                enemy.userData.behaviorState = 'pursue';
                enemy.userData.behaviorTimer = 0;
            }
            updatePatrolBehavior(enemy, playerPos, adjustedSpeed, time);
            break;
            
        case 'pursue':
            if (distanceToPlayer > difficultySettings.distantDetectionRange) {
                enemy.userData.behaviorState = 'patrol';
            } else if (distanceToPlayer < 150 && enemy.userData.behaviorTimer > 2) {
                enemy.userData.behaviorState = Math.random() < 0.5 ? 'strafe' : 'retreat';
                enemy.userData.behaviorTimer = 0;
            }
            updatePursuitBehavior(enemy, playerPos, adjustedSpeed, distanceToPlayer);
            break;
            
        case 'strafe':
            if (enemy.userData.behaviorTimer > 3 || distanceToPlayer > 200) {
                enemy.userData.behaviorState = 'pursue';
                enemy.userData.behaviorTimer = 0;
            }
            updateSwarmBehavior(enemy, playerPos, adjustedSpeed, time);
            break;
            
        case 'retreat':
            if (enemy.userData.behaviorTimer > 2 || distanceToPlayer > 300) {
                enemy.userData.behaviorState = 'pursue';
                enemy.userData.behaviorTimer = 0;
            }
            updateEvasionBehavior(enemy, playerPos, adjustedSpeed, time);
            break;
    }
    
    // Smooth quaternion slerp instead of instant lookAt. Same situational
    // rate as the local behavior — hard lock while telegraphing, released
    // while flying an evasive maneuver.
    _smoothEnemyLookAt(enemy, playerPos,
        (typeof _enemyLookRate === 'function') ? _enemyLookRate(enemy) : 0.20);
}

// Boss behavior
function updateBossBehavior(enemy, playerPos, speed) {
    // Bosses use more complex movement patterns
    const time = Date.now() * 0.001;
    const distance = enemy.position.distanceTo(playerPos);

    // Standoff scales with the (now 2×) hull so the boss circles OUTSIDE
    // the player's personal space instead of parking inside it at 120u.
    const standoff = Math.max(350, (enemy.userData.hitboxSize || 288) * 0.9);

    if (distance > standoff * 1.6) {
        // Approach with weaving pattern
        const direction = new THREE.Vector3().subVectors(playerPos, enemy.position).normalize();
        const weave = new THREE.Vector3(Math.sin(time * 2) * 20, Math.cos(time * 1.5) * 15, 0);
        direction.add(weave.multiplyScalar(0.1));
        enemy.position.add(direction.multiplyScalar(speed));
    } else {
        // Circle strafe at optimal distance
        const angle = time * 0.8;
        const targetX = playerPos.x + Math.cos(angle) * standoff;
        const targetZ = playerPos.z + Math.sin(angle) * standoff;
        const targetY = playerPos.y + Math.sin(angle * 0.3) * standoff * 0.25;

        const targetPos = new THREE.Vector3(targetX, targetY, targetZ);
        const direction = new THREE.Vector3().subVectors(targetPos, enemy.position).normalize();
        enemy.position.add(direction.multiplyScalar(speed * 0.6));
    }

    // Special attacks: missile volleys + spinning laser sweeps
    if (typeof _updateBossSpecials === 'function') {
        _updateBossSpecials(enemy, playerPos, distance);
    }
}

// =============================================================================
// BOSS SPECIAL ATTACKS — missile volleys and spinning laser sweeps. Both
// punish camping: the volley reaches far (so the player keeps moving) and
// the sweep punishes sitting close to the hull (so the player keeps range).
// =============================================================================
const _bossMissiles = [];
const _BOSS_MISSILE_CAP = 24;

function _bossPlayerAimPos() {
    try {
        const cs = window.cameraState;
        const ship = cs && cs.playerShipMesh;
        if (ship && ship.visible) {
            const wp = new THREE.Vector3();
            ship.getWorldPosition(wp);
            if (isFinite(wp.x)) return wp;
        }
    } catch (e) {}
    return camera.position.clone();
}

function _spawnBossMissile(boss) {
    if (!boss || !boss.userData || boss.userData.health <= 0) return;
    if (_bossMissiles.length >= _BOSS_MISSILE_CAP) return;
    const geo = new THREE.ConeGeometry(3, 14, 6);
    const mat = new THREE.MeshBasicMaterial({
        color: 0xff3322, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(boss.position);
    // Launch in a fanned direction toward the player
    const aim = _bossPlayerAimPos();
    const dir = aim.sub(boss.position).normalize();
    dir.x += (Math.random() - 0.5) * 0.5;
    dir.y += (Math.random() - 0.5) * 0.3;
    dir.z += (Math.random() - 0.5) * 0.5;
    dir.normalize();
    scene.add(m);
    _bossMissiles.push({ mesh: m, vel: dir.multiplyScalar(2.2), born: Date.now() });
}

// Called once per behavior pass (30 Hz) from updateEnemyBehavior.
function _updateBossMissiles() {
    if (!_bossMissiles.length) return;
    const aim = _bossPlayerAimPos();
    for (let i = _bossMissiles.length - 1; i >= 0; i--) {
        const bm = _bossMissiles[i];
        const age = Date.now() - bm.born;
        // Homing: bend velocity toward the player, capped turn per tick
        const want = aim.clone().sub(bm.mesh.position).normalize().multiplyScalar(2.2);
        bm.vel.lerp(want, 0.045).setLength(2.2);
        bm.mesh.position.add(bm.vel);
        bm.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bm.vel.clone().normalize());

        const dist = bm.mesh.position.distanceTo(camera.position);
        let done = false;
        if (dist < 40) {
            // Impact: damage + knockback + screen shake
            const isInvuln = typeof isBlackHoleWarpInvulnerable === 'function' && isBlackHoleWarpInvulnerable();
            if (!isInvuln && typeof gameState !== 'undefined' && gameState.hull !== undefined) {
                const red = typeof getShieldDamageReduction === 'function' ? getShieldDamageReduction() : 0;
                gameState.hull = Math.max(0, gameState.hull - 6 * (1 - red));
                if (gameState.velocityVector) {
                    gameState.velocityVector.addScaledVector(bm.vel.clone().normalize(), 0.35);
                }
                if (typeof createEnhancedScreenDamageEffect === 'function') {
                    createEnhancedScreenDamageEffect(bm.mesh.position);
                }
            }
            if (typeof createExplosionEffect === 'function') createExplosionEffect(bm.mesh.position);
            done = true;
        } else if (age > 9000) {
            done = true;
        }
        if (done) {
            scene.remove(bm.mesh);
            bm.mesh.geometry.dispose(); bm.mesh.material.dispose();
            _bossMissiles.splice(i, 1);
        }
    }
}
if (typeof window !== 'undefined') window._updateBossMissiles = _updateBossMissiles;

function _updateBossSpecials(boss, playerPos, distance) {
    const ud = boss.userData;
    const now = Date.now();
    if (!ud._nextVolleyAt) ud._nextVolleyAt = now + 6000 + Math.random() * 4000;
    if (!ud._nextSweepAt) ud._nextSweepAt = now + 12000 + Math.random() * 5000;

    // MISSILE VOLLEY — 5 homing bolts, staggered, every 11-16 s
    if (now >= ud._nextVolleyAt && distance > 250 && distance < 3500) {
        ud._nextVolleyAt = now + 11000 + Math.random() * 5000;
        for (let i = 0; i < 5; i++) {
            setTimeout(() => _spawnBossMissile(boss), i * 170);
        }
        if (typeof showAchievement === 'function') {
            showAchievement('⚠ MISSILE VOLLEY', (ud.name || 'Boss') + ' launched a homing volley — evade!', true);
        }
    }

    // SPINNING LASER SWEEP — 3 beams rotating around the boss for 3.5 s,
    // every 14-19 s, only triggers (and only hurts) at close range
    if (now >= ud._nextSweepAt && distance < 1600) {
        ud._nextSweepAt = now + 14000 + Math.random() * 5000;
        ud._sweepUntil = now + 3500;
        ud._sweepAngle = Math.random() * Math.PI * 2;
        if (typeof showAchievement === 'function') {
            showAchievement('⚠ LASER SWEEP', (ud.name || 'Boss') + ' is spinning up rotating beams — keep your distance!', true);
        }
    }
    if (ud._sweepUntil && now < ud._sweepUntil) {
        ud._sweepAngle += 0.062; // ~1.9 rad/s at 30 Hz
        const SWEEP_LEN = 1200;
        const drawThisTick = (typeof gameState !== 'undefined') ? (gameState.frameCount % 4 === 0) : true;
        for (let k = 0; k < 3; k++) {
            const a = ud._sweepAngle + k * (Math.PI * 2 / 3);
            const end = new THREE.Vector3(
                boss.position.x + Math.cos(a) * SWEEP_LEN,
                boss.position.y + Math.sin(a * 0.5) * 80,
                boss.position.z + Math.sin(a) * SWEEP_LEN
            );
            if (drawThisTick && typeof createLaserBeam === 'function') {
                createLaserBeam(boss.position.clone(), end, '#ff2222', false);
            }
        }
        // Damage check: player inside sweep radius AND angularly near a beam
        const toPlayer = camera.position.clone().sub(boss.position);
        const distXZ = Math.sqrt(toPlayer.x * toPlayer.x + toPlayer.z * toPlayer.z);
        if (distXZ < SWEEP_LEN && Math.abs(toPlayer.y) < 250 &&
            now - (ud._lastSweepHit || 0) > 450) {
            const playerAngle = Math.atan2(toPlayer.z, toPlayer.x);
            for (let k = 0; k < 3; k++) {
                let diff = (playerAngle - (ud._sweepAngle + k * (Math.PI * 2 / 3))) % (Math.PI * 2);
                if (diff > Math.PI) diff -= Math.PI * 2;
                if (diff < -Math.PI) diff += Math.PI * 2;
                if (Math.abs(diff) < 0.13) {
                    ud._lastSweepHit = now;
                    const isInvuln = typeof isBlackHoleWarpInvulnerable === 'function' && isBlackHoleWarpInvulnerable();
                    if (!isInvuln && typeof gameState !== 'undefined' && gameState.hull !== undefined) {
                        const red = typeof getShieldDamageReduction === 'function' ? getShieldDamageReduction() : 0;
                        gameState.hull = Math.max(0, gameState.hull - 4 * (1 - red));
                        // Knock outward, away from the sweep
                        if (gameState.velocityVector && distXZ > 1) {
                            gameState.velocityVector.x += (toPlayer.x / distXZ) * 0.3;
                            gameState.velocityVector.z += (toPlayer.z / distXZ) * 0.3;
                        }
                        if (typeof createEnhancedScreenDamageEffect === 'function') {
                            createEnhancedScreenDamageEffect(boss.position);
                        }
                    }
                    break;
                }
            }
        }
    }
}

// Support ship behavior
// BOSS-SUPPORT SWARM: each escort is assigned one of four attack patterns on
// first update (round-robin, so a wing always mixes roles), giving the boss
// fight diverse, coordinated-looking pressure instead of a static ring:
//   orbiter — circles the player on its own radius/direction/phase
//   flanker — holds a pulsing position off the player's flank
//   diver   — repeated attack runs: dive to point-blank, break away, re-run
//   screen  — bodyguard: keeps itself between the boss and the player, weaving
// A light separation impulse keeps the swarm from stacking into one blob.
let _supportRoleCounter = 0;
const _supTmpA = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _supTmpB = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _supUp = (typeof THREE !== 'undefined') ? new THREE.Vector3(0, 1, 0) : null;

function updateSupportBehavior(enemy, playerPos, speed) {
    const ud = enemy.userData;
    if (!ud._supportRole) {
        const roles = ['orbiter', 'diver', 'flanker', 'screen'];
        ud._supportRole = roles[_supportRoleCounter++ % roles.length];
        ud._orbitDir = Math.random() < 0.5 ? 1 : -1;
        ud._orbitRadius = 150 + Math.random() * 130;
        ud._phase = Math.random() * Math.PI * 2;
        ud._diveState = 'approach';
    }
    const now = performance.now() * 0.001;
    const distance = enemy.position.distanceTo(playerPos);

    switch (ud._supportRole) {
        case 'orbiter': {
            // Tangential strafe around the player + radial correction onto
            // this ship's own ring, with a gentle vertical bob.
            _supTmpA.subVectors(enemy.position, playerPos);
            const d = _supTmpA.length() || 1;
            _supTmpA.divideScalar(d);
            _supTmpB.crossVectors(_supTmpA, _supUp).normalize().multiplyScalar(ud._orbitDir);
            enemy.position.addScaledVector(_supTmpB, speed);
            const radialErr = d - ud._orbitRadius;
            if (Math.abs(radialErr) > 20) {
                enemy.position.addScaledVector(_supTmpA, (radialErr > 0 ? -1 : 1) * speed * 0.5);
            }
            enemy.position.y += Math.sin(now * 1.7 + ud._phase) * speed * 0.25;
            break;
        }
        case 'flanker': {
            // Hold a pulsing standoff point off the player's flank (side
            // chosen by orbit direction), sliding in and out for pressure.
            const flankDist = 200 + Math.sin(now * 0.9 + ud._phase) * 90;
            _supTmpA.set(0, 0, -1);
            if (typeof camera !== 'undefined') _supTmpA.applyQuaternion(camera.quaternion);
            _supTmpB.crossVectors(_supTmpA, _supUp).normalize()
                .multiplyScalar(ud._orbitDir * flankDist);
            _supTmpB.add(playerPos).sub(enemy.position);
            const gap = _supTmpB.length();
            if (gap > 15) enemy.position.addScaledVector(_supTmpB.divideScalar(gap), Math.min(speed, gap));
            break;
        }
        case 'diver': {
            // Attack runs: dive straight at the player, break off at close
            // range along a lateral escape vector, re-engage from distance.
            if (ud._diveState === 'approach') {
                _supTmpA.subVectors(playerPos, enemy.position).normalize();
                enemy.position.addScaledVector(_supTmpA, speed * 1.35);
                if (distance < 110) {
                    ud._diveState = 'break';
                    _supTmpB.crossVectors(_supTmpA, _supUp).normalize()
                        .multiplyScalar(ud._orbitDir)
                        .addScaledVector(_supUp, (Math.random() - 0.5) * 0.8)
                        .normalize();
                    ud._breakDir = { x: _supTmpB.x, y: _supTmpB.y, z: _supTmpB.z };
                }
            } else {
                _supTmpA.set(ud._breakDir.x, ud._breakDir.y, ud._breakDir.z);
                enemy.position.addScaledVector(_supTmpA, speed * 1.1);
                if (distance > 420) ud._diveState = 'approach';
            }
            break;
        }
        case 'screen':
        default: {
            // Bodyguard: park on the boss→player line (closer to the boss)
            // and weave laterally so it isn't a stationary target.
            let boss = null, bossDist = Infinity;
            if (typeof enemies !== 'undefined') {
                for (let i = 0; i < enemies.length; i++) {
                    const e = enemies[i];
                    if (!e || !e.userData || !e.userData.isBoss || e.userData.health <= 0) continue;
                    const bd = e.position.distanceTo(enemy.position);
                    if (bd < bossDist && bd < 3000) { bossDist = bd; boss = e; }
                }
            }
            if (boss) {
                _supTmpA.subVectors(playerPos, boss.position);
                const toPlayer = _supTmpA.length() || 1;
                _supTmpA.divideScalar(toPlayer);
                _supTmpB.crossVectors(_supTmpA, _supUp).normalize()
                    .multiplyScalar(Math.sin(now * 1.3 + ud._phase) * 90);
                _supTmpB.add(boss.position)
                    .addScaledVector(_supTmpA, Math.min(toPlayer * 0.35, 350))
                    .sub(enemy.position);
                const gap2 = _supTmpB.length();
                if (gap2 > 10) enemy.position.addScaledVector(_supTmpB.divideScalar(gap2), Math.min(speed, gap2));
            } else {
                // Boss down — fall back to orbiting pressure
                ud._supportRole = 'orbiter';
            }
            break;
        }
    }

    // SWARM SEPARATION: gently repel from other nearby supports so patterns
    // interleave instead of collapsing into a single blob.
    if (typeof enemies !== 'undefined') {
        for (let i = 0; i < enemies.length; i++) {
            const other = enemies[i];
            if (!other || other === enemy || !other.userData ||
                !other.userData.isBossSupport || other.userData.health <= 0) continue;
            _supTmpA.subVectors(enemy.position, other.position);
            const sd = _supTmpA.length();
            if (sd > 0.01 && sd < 45) {
                enemy.position.addScaledVector(_supTmpA.divideScalar(sd), speed * 0.5);
            }
        }
    }
}

// Enhanced enemy weapon firing with directional damage and progressive difficulty
const _enemyWorldPos = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;

function fireEnemyWeapon(enemy, difficultySettings) {
    if (!enemy || !enemy.userData || enemy.userData.health <= 0) return;

    // No enemy fires until 5 seconds after game start
    if (!gameState.gameStartTime || (Date.now() - gameState.gameStartTime < 5000)) return;

    const isLocal = isEnemyInLocalGalaxy(enemy);
    const firingRange = isLocal ? difficultySettings?.localFiringRange || 500 : difficultySettings?.distantFiringRange || 600;

    // Use world position for entities that are children of groups
    const enemyPos = (enemy.parent && enemy.parent.isGroup) ? enemy.getWorldPosition(_enemyWorldPos).clone() : enemy.position;

    // Aim at the player's SHIP, not the camera. In 3rd-person the ship
    // mesh is offset well in front of/below the camera, so beams aimed
    // at camera.position visibly streak past the ship. When the ship
    // mesh is present and visible (3rd-person / cockpit), use its world
    // position; otherwise (zero-offset / no-ship POV) fall back to the
    // camera.
    function _playerAimPos() {
        try {
            const cs = window.cameraState;
            const ship = cs && cs.playerShipMesh;
            if (ship && ship.visible) {
                const wp = new THREE.Vector3();
                ship.getWorldPosition(wp);
                if (isFinite(wp.x)) return wp;
            }
        } catch (e) {}
        return camera.position.clone();
    }

    // Pick the nearest target between player and wingmen
    const playerPos = _playerAimPos();
    let targetPos = playerPos;
    let targetWingman = null;
    let nearestDist = playerPos.distanceTo(enemyPos);

    if (typeof allyShips !== 'undefined') {
        for (let i = 0; i < allyShips.length; i++) {
            const ally = allyShips[i];
            if (!ally || !ally.userData || ally.userData.health <= 0) continue;
            const d = ally.position.distanceTo(enemyPos);
            if (d < nearestDist) {
                nearestDist = d;
                targetPos = ally.position.clone();
                targetWingman = ally;
            }
        }
    }

    // Opportunistic: a mining vessel that's the CLOSEST target also
    // draws fire. Active hostiles don't divert to hunt them — they just
    // shoot whatever (player / wingman / mining ship) is nearest & in
    // range. Undefended, the vessel is whittled down and destroyed.
    let targetMining = null;
    if (typeof civilianShips !== 'undefined') {
        for (let i = 0; i < civilianShips.length; i++) {
            const cv = civilianShips[i];
            if (!cv || !cv.userData || cv.userData._destroyed) continue;
            if (cv.userData.shipCategory !== 'mining') continue;
            const d = cv.position.distanceTo(enemyPos);
            if (d < nearestDist) {
                nearestDist = d;
                targetPos = cv.position.clone();
                targetMining = cv;
                targetWingman = null; // mining vessel is the nearer target
            }
        }
    }

    if (nearestDist <= firingRange) {
        const laserColor = enemy.userData.isBoss ? '#ff4444' : (enemy.userData.isBorgCube || enemy.userData.type === 'borg_drone') ? '#00ff00' : '#ff8800';

        // Reduced damage so combat is survivable while still threatening.
        // Local enemies do 2 dmg base, distant 3-6 dmg. With 4 attackers
        // firing every 1.2s at 60% hit chance: ~4 dmg/sec → 25s to die.
        let damage = isLocal ?
            (difficultySettings.galaxiesCleared === 0 ? 2 : 3 + difficultySettings.galaxiesCleared) :
            (enemy.userData.isBoss ? 8 : enemy.userData.isBossSupport ? 5 : 3);
        damage = Math.min(damage, 10);

        let hitChance = 0.6;
        // Coefficients rescaled for the faster turn rates: the old 3.33 /
        // 0.5 pair was tuned against a 0.03 lerp where turnRate never rose
        // above ~0.01. Left as-is it would have quietly cut every moving
        // enemy to the 0.2 floor — a stealth difficulty drop. The SHAPE is
        // preserved: a ship hauling its nose around shoots worse, a ship
        // committed to a straight lance dive shoots its best.
        const turnRate = enemy.userData.turnRate || 0;
        if (turnRate > 0.01) {
            const accuracyPenalty = Math.min(turnRate * 1.1, 0.3);
            hitChance = Math.max(0.3, hitChance - accuracyPenalty);
        }
        // Mid-maneuver an enemy is flying, not aiming.
        if (enemy.userData._evade) hitChance *= 0.55;

        const isHit = Math.random() < hitChance;

        // Draw the bolt. A HIT terminates at the target; a MISS is nudged to
        // the side and extended well past the target so it streaks on by for a
        // longer distance instead of stopping dead at the player.
        let beamEnd = targetPos;
        if (!isHit && typeof THREE !== 'undefined') {
            const _aim = targetPos.clone().sub(enemyPos);
            const _distToTarget = _aim.length() || 1;
            _aim.normalize();
            let _perp = new THREE.Vector3().crossVectors(_aim, new THREE.Vector3(0, 1, 0));
            if (_perp.lengthSq() < 1e-4) _perp.set(1, 0, 0);
            _perp.normalize();
            const _side = (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 160);
            const _vert = (Math.random() - 0.5) * 180;
            const _overshoot = 4000 + Math.random() * 4500;   // continue well past
            beamEnd = enemyPos.clone()
                .addScaledVector(_aim, _distToTarget + _overshoot)
                .addScaledVector(_perp, _side)
                .addScaledVector(new THREE.Vector3(0, 1, 0), _vert);
        }
        createLaserBeam(enemyPos, beamEnd, laserColor, false);

        playEnemyLaserSound(enemy);

        if (isHit) {
            // If firing at a wingman, damage the wingman and exit
            if (targetWingman && targetWingman.userData) {
                const wasAlive = targetWingman.userData.health > 0;
                targetWingman.userData.health = Math.max(0, targetWingman.userData.health - damage);
                if (typeof flashEnemyHit === 'function') flashEnemyHit(targetWingman, damage);

                // Wingman destroyed — large explosion + notification
                if (wasAlive && targetWingman.userData.health <= 0) {
                    if (typeof createWingmanExplosion === 'function') {
                        createWingmanExplosion(targetWingman);
                    }
                    if (typeof showAchievement === 'function') {
                        showAchievement(
                            (targetWingman.userData.name || 'Wingman') + ' DESTROYED!',
                            'Ally ship lost in combat',
                            true
                        );
                    }
                    if (typeof flashEventText === 'function') {
                        flashEventText('WINGMAN DOWN', '#ff5555',
                            (targetWingman.userData.name || 'Ally ship') + ' lost in combat');
                    }
                    if (typeof playSound === 'function') {
                        playSound('explosion');
                    }
                }
                return;
            }

            // Mining vessel hit — distress call on the first strike, then
            // destroyed (explosion) if the player doesn't drive the
            // attackers off in time. Tough hull (~10 hits @3 dmg).
            if (targetMining && targetMining.userData && !targetMining.userData._destroyed) {
                const mv = targetMining;
                if (typeof mv.userData.maxHealth !== 'number') {
                    mv.userData.maxHealth = 30;
                    mv.userData.health = 30;
                }
                if (!mv.userData._distressSent) {
                    mv.userData._distressSent = true;
                    if (typeof showIncomingTransmission === 'function') {
                        showIncomingTransmission(
                            mv.userData.name || 'Mining Vessel',
                            'Mayday! We are under hostile fire with no escort — requesting immediate assistance!',
                            true);
                    }
                }
                if (typeof flashEnemyHit === 'function') flashEnemyHit(mv, damage);
                if (typeof damageCivilianShip === 'function') {
                    // Shared civilian-combat entry point: shield bubble,
                    // evasive flee via the mining AI, distress on the map,
                    // and destruction handling.
                    damageCivilianShip(mv, damage, enemy);
                    return;
                }
                mv.userData.health = Math.max(0, (mv.userData.health || 30) - damage);

                if (mv.userData.health <= 0) {
                    mv.userData._destroyed = true;
                    if (typeof createWingmanExplosion === 'function') createWingmanExplosion(mv);
                    if (typeof showAchievement === 'function') {
                        showAchievement((mv.userData.name || 'Mining Vessel') + ' LOST',
                            'A mining vessel was destroyed by hostiles', true);
                    }
                    if (typeof playSound === 'function') playSound('explosion');
                    if (typeof scene !== 'undefined') scene.remove(mv);
                    if (typeof civilianShips !== 'undefined') {
                        const ci = civilianShips.indexOf(mv);
                        if (ci > -1) civilianShips.splice(ci, 1);
                    }
                }
                return;
            }

            const isInvulnerable = typeof isBlackHoleWarpInvulnerable === 'function' &&
                                   isBlackHoleWarpInvulnerable();
            const shieldsActive = typeof isShieldActive === 'function' && isShieldActive();

            if (!isInvulnerable) {
                const shieldReduction = typeof getShieldDamageReduction === 'function' ?
                                        getShieldDamageReduction() : 0;
                const actualDamage = damage * (1 - shieldReduction);

                if (typeof gameState !== 'undefined' && gameState.hull !== undefined) {
                    const _before = gameState.hull;
                    gameState.hull = Math.max(0, gameState.hull - actualDamage);
                } else if (typeof gameState !== 'undefined' && gameState.health !== undefined) {
                    gameState.health = Math.max(0, gameState.health - actualDamage);
                }

                // Knockback: enemy blasts shove the ship along the shot
                // line (softened while shields are up). ~10% of max
                // velocity per hit (doubled from 5% per playtest).
                if (typeof camera !== 'undefined' && gameState.velocityVector && enemy && enemy.position) {
                    const _kb = camera.position.clone().sub(enemy.position).normalize();
                    gameState.velocityVector.addScaledVector(_kb, shieldsActive ? 0.10 : 0.22);
                }
            }

            if (shieldsActive && typeof createShieldHitEffect === 'function') {
                // Pass the beam's actual line (origin → aim point) and color
                // so the deflection sparks land where the laser visually
                // strikes the bubble, tinted like the laser that caused them.
                createShieldHitEffect(enemyPos || enemy.position, laserColor, targetPos);
            }

            if (!isInvulnerable) {
                createEnhancedScreenDamageEffect(enemy.position);
                if (!shieldsActive) {
                    // Direct hull hit — flash the ship red (3rd person).
                    if (typeof flashPlayerShipHit === 'function') flashPlayerShipHit();
                    playSound('damage');
                    if (enemy.userData.isBoss) {
                        showAchievement('Boss Attack!', `${enemy.userData.name} hit for ${damage} damage!`, false);
                    } else {
                        showAchievement('Taking Fire!', `Enemy hit for ${damage} damage!`, false);
                    }
                }
            }

            const currentHealth = gameState.hull || gameState.health || 0;
            if (currentHealth <= 0) {
                createDeathEffect();
            }
        } else {
            showAchievement('Missed!', 'Enemy shot missed!', false);
        }
    }
}

function isEnemyInLocalGalaxy(enemy) {
    if (!enemy || !enemy.userData) return false;
    
    // Check if enemy is explicitly marked as local
    if (enemy.userData.isLocal !== undefined) {
        return enemy.userData.isLocal;
    }
    
    // Fallback: check position relative to origin (local galaxy center)
    const distanceFromOrigin = (window.trueDistanceFromOrigin) ? window.trueDistanceFromOrigin(enemy.position) : enemy.position.length();
    return distanceFromOrigin < 5000; // Local galaxy radius
}

function updateEnemyVisualHealth(enemy) {
    // MeshBasicMaterial doesn't need health-based visual changes
    // The translucent glowing appearance is enough
    // This function is kept for compatibility but does nothing
    return;

    
    // Calculate health percentage
    const currentHealthPercent = enemy.userData.health / enemy.userData.maxHealth;
    
    if (currentHealthPercent > 0.66) {
        // High health - original color
        enemy.material.color.copy(enemy.userData.originalMaterial.color);
        enemy.material.emissive.copy(enemy.userData.originalMaterial.emissive);
        enemy.material.emissiveIntensity = enemy.userData.originalMaterial.emissiveIntensity;
    } else if (currentHealthPercent > 0.33) {
        // Medium health - slightly damaged (darker, orange tint)
        enemy.material.color.copy(enemy.userData.originalMaterial.color).multiplyScalar(0.8);
        enemy.material.color.r = Math.min(1, enemy.material.color.r + 0.2);
        enemy.material.emissive.set(0.1, 0.05, 0);
        enemy.material.emissiveIntensity = 0.3;
    } else {
        // Low health - heavily damaged (much darker, red glow)
        enemy.material.color.copy(enemy.userData.originalMaterial.color).multiplyScalar(0.5);
        enemy.material.color.r = Math.min(1, enemy.material.color.r + 0.3);
        enemy.material.emissive.set(0.2, 0, 0);
        enemy.material.emissiveIntensity = 0.5;
    }
}

// =============================================================================
// TUTORIAL SYSTEM - RESTORED from game-controls13.js (WORKING VERSION)
// =============================================================================

const tutorialSystem = {
    active: true,
    completed: false,
    currentStep: 0,
    messages: [
        {
            title: "Mission Command",
            text: "Captain Bo, you'll need gravitational slingshots to leave this galaxy.",
            delay: 5000
        },
        {
            title: "Navigation Training",
            text: "Approach any planet and press Enter to slingshot. WASD thrusts; arrow keys look.",
            delay: 15000
        },
        {
            title: "Combat Systems",
            text: "Kills restore hull. Tab toggles shields (drains energy). Watch your levels.",
            delay: 25000
        },
        {
            title: "Primary Objective",
            text: "Clear every galaxy of hostiles, including Sagittarius A*. Left-click or Option fires; hold Space to lock.",
            delay: 35000
        },
        {
            title: "Emergency Systems",
            text: "5 Emergency Warp charges (Enter) boost you to hyperspace — handy, but you'll still need slingshots between galaxies.",
            delay: 45000
        },
        {
            title: "Final Orders",
            text: "Hunt the boss flagship in each galaxy. Galactic map tracks progress. Good luck, Captain.",
            delay: 55000
        }
    ]
};

function startTutorial() {
    if (!tutorialSystem.active) return;
    
    tutorialSystem.messages.forEach((message, index) => {
        setTimeout(() => {
            if (tutorialSystem.active && tutorialSystem.currentStep === index) {
                showMissionCommandAlert(message.title, message.text);
                tutorialSystem.currentStep++;
                
                // Add completion check for the last message:
                if (index === tutorialSystem.messages.length - 1) {
                    setTimeout(() => {
                        completeTutorial();
                    }, 15000); // Complete after 15 seconds or manual dismiss
                }
            }
        }, message.delay);
    });
}

// ⭐ NEW: Function to immediately advance to next tutorial message
function showNextTutorialMessage() {
    if (!tutorialSystem.active || tutorialSystem.currentStep >= tutorialSystem.messages.length) {
        // No more messages, complete tutorial
        completeTutorial();
        return;
    }

    const nextMessage = tutorialSystem.messages[tutorialSystem.currentStep];
    if (nextMessage) {
        showMissionCommandAlert(nextMessage.title, nextMessage.text);
        tutorialSystem.currentStep++;

        // Check if this was the last message
        if (tutorialSystem.currentStep >= tutorialSystem.messages.length) {
            setTimeout(() => {
                completeTutorial();
            }, 15000); // Complete after 15 seconds or manual dismiss
        }
    } else {
        completeTutorial();
    }
}

// Add this new function:
function completeTutorial() {
    console.log('Completing tutorial...');

    tutorialSystem.completed = true;
    tutorialSystem.active = false;
    tutorialSystem.completionTime = Date.now();
    
    // Force hide the mission command alert
    const alertElement = document.getElementById('missionCommandAlert');
    if (alertElement) {
        alertElement.classList.add('hidden');
    }
    
    showAchievement('Training Complete', 'All hostile forces are now active - good luck, Captain!');
    
    // Ensure enemies are activated
    if (typeof enemies !== 'undefined') {
        enemies.forEach(enemy => {
            if (enemy.userData) {
                // Mark enemies as ready for activation (they'll activate when player gets close)
                enemy.userData.tutorialComplete = true;
            }
        });
    }
    
    // Update enemy behavior to activate
    if (typeof refreshEnemyDifficulty === 'function') {
        refreshEnemyDifficulty();
    }
    
    // Force UI update to reflect enemy activation
    if (typeof detectEnemiesInRegion === 'function') {
        detectEnemiesInRegion();
    }
    
    console.log('Tutorial completed - enemies now active');
}

// Typewriter reveal for comms text (Mission Command + incoming transmissions)
// — types in with a soft blip and a blinking block cursor. The timer is stored
// per-element (el._mcTimer) so independent channels can type simultaneously.
function _mcBlip() {
    if (typeof audioContext === 'undefined' || !audioContext || audioContext.state !== 'running') return;
    const o = audioContext.createOscillator(), g = audioContext.createGain();
    o.type = 'square';
    o.frequency.value = 1150 + Math.random() * 500;
    g.gain.value = 0.012;
    o.connect(g); g.connect(audioContext.destination);
    const t = audioContext.currentTime;
    o.start(t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.stop(t + 0.05);
}
function _typewriterReveal(el, text, onDone) {
    if (el._mcTimer) { clearInterval(el._mcTimer); el._mcTimer = null; }
    const full = String(text == null ? '' : text);
    el.textContent = '';
    el.scrollTop = 0;
    // Very long lore: skip the effect so reads aren't slow (onDone gets true =
    // "shown instantly" so the caller knows to auto-scroll instead of relying
    // on the typewriter's follow to have revealed it).
    if (full.length > 600) { el.textContent = full; if (onDone) onDone(true); return; }
    let i = 0;
    // Reveal speed: short lore types char-by-char for feel; medium/long step
    // faster so reads don't drag (and to absorb timer throttling under load).
    const step = full.length > 240 ? 3 : (full.length > 110 ? 2 : 1);
    el.classList.add('mc-typing');
    const flush = () => {
        if (el._mcTimer) { clearInterval(el._mcTimer); el._mcTimer = null; }
        el.textContent = full;
        el.classList.remove('mc-typing');
        if (onDone) onDone(false);
    };
    el._mcFlush = flush;
    el._mcTimer = setInterval(() => {
        i += step;
        el.textContent = full.slice(0, i);
        el.scrollTop = el.scrollHeight;   // follow the latest line as it types
        if (i % 6 < step) { try { _mcBlip(); } catch (e) {} }   // soft blip ~every 6 chars
        if (i >= full.length) flush();
    }, 16);
}

// Shared dismiss for the comms panel: hide, restore the gameplay cursor, flush
// any deferred achievements, and resume the game if it was paused for a message.
let _mcDismissTimer = null, _mcScrollRAF = null;
function _dismissMissionAlert() {
    if (_mcDismissTimer) { clearTimeout(_mcDismissTimer); _mcDismissTimer = null; }
    if (_mcScrollRAF) { cancelAnimationFrame(_mcScrollRAF); _mcScrollRAF = null; }
    const alertElement = document.getElementById('missionCommandAlert');
    if (alertElement) alertElement.classList.add('hidden');
    document.body.style.cursor = 'none';
    if (typeof renderer !== 'undefined' && renderer.domElement) renderer.domElement.style.cursor = 'none';
    if (window._deferredAchievements && window._deferredAchievements.length) {
        const queue = window._deferredAchievements.slice();
        window._deferredAchievements = [];
        queue.forEach((a, i) => setTimeout(() => showAchievement(a.title, a.description, a.playAchievementSound), 400 * i));
    }
    if (typeof gameState !== 'undefined' && gameState.paused) {
        gameState.paused = false;
        const pauseBtn = document.getElementById('pauseBtn');
        const pauseIcon = document.getElementById('pauseIcon');
        if (pauseBtn) pauseBtn.classList.remove('paused');
        if (pauseIcon) pauseIcon.className = 'fas fa-pause mr-1';
    }
}

// Smoothly scroll a comms element from top to its bottom over `ms`.
function _mcSmoothScroll(el, distance, ms) {
    if (_mcScrollRAF) { cancelAnimationFrame(_mcScrollRAF); _mcScrollRAF = null; }
    let start = null;
    const step = (now) => {
        if (start === null) start = now;
        const t = Math.min(1, (now - start) / ms);
        el.scrollTop = distance * t;
        if (t < 1) _mcScrollRAF = requestAnimationFrame(step);
    };
    _mcScrollRAF = requestAnimationFrame(step);
}

// After a message finishes revealing: if it overflows the 2-line window, wait
// ~1s then slowly auto-scroll to the bottom so the whole message displays
// without the player touching the mouse. NO auto-dismiss — messages persist
// until SKIP (or, for tutorial, until the next scheduled step replaces them).
function _scheduleCommsAutoScroll(textEl) {
    if (_mcScrollRAF) { cancelAnimationFrame(_mcScrollRAF); _mcScrollRAF = null; }
    const overflow = Math.max(0, textEl.scrollHeight - textEl.clientHeight);
    if (overflow <= 2) return;
    textEl.scrollTop = 0;
    const scrollMs = Math.min(16000, Math.max(2600, overflow * 28));
    setTimeout(() => _mcSmoothScroll(textEl, overflow, scrollMs), 1000);
}

// Auto-dismiss a (non-tutorial) message once it's been read: a long message
// that auto-scrolls is held until the scroll finishes + a beat; a short one
// gets a read beat scaled to its length. No button — it just disappears.
function _scheduleCommsAutoDismiss(textEl, overflowed) {
    if (_mcDismissTimer) { clearTimeout(_mcDismissTimer); _mcDismissTimer = null; }
    let delay;
    if (overflowed) {
        const overflow = Math.max(0, textEl.scrollHeight - textEl.clientHeight);
        const scrollMs = Math.min(16000, Math.max(2600, overflow * 28));
        delay = 1000 + scrollMs + 2600;   // 1s pre-scroll pause + scroll + read beat
    } else {
        delay = Math.max(5000, (textEl.textContent || '').length * 55);
    }
    _mcDismissTimer = setTimeout(_dismissMissionAlert, delay);
}
// Expose for other modules (e.g. showIncomingTransmission in game-objects.js).
if (typeof window !== 'undefined') window.__commsTypewriter = _typewriterReveal;

function showMissionCommandAlert(title, text, isVictoryMessage = false, channelColor = null) {
    const alertElement = document.getElementById('missionCommandAlert');
    const titleElement = alertElement ? alertElement.querySelector('h2') : null;
    const textElement = document.getElementById('missionCommandText');
    
    if (!alertElement || !titleElement || !textElement) {
        console.warn('Tutorial elements not found');
        return;
    }
    
    // Show cursor so player can click UNDERSTOOD button
    document.body.style.cursor = 'auto';
    if (typeof renderer !== 'undefined' && renderer.domElement) {
        renderer.domElement.style.cursor = 'auto';
    }
    
    titleElement.textContent = title;
    // Channel colour: default is mission-control green (from CSS). A transmission
    // can pass a colour (cyan lore / yellow distress / orange ship-to-ship) and
    // we override the title + body inline (caret inherits via currentColor).
    if (channelColor) {
        const glow = `0 0 8px ${channelColor}, 0 0 16px ${channelColor}88, 0 2px 5px rgba(0,0,0,0.95)`;
        titleElement.style.setProperty('color', channelColor, 'important');
        titleElement.style.setProperty('text-shadow', glow, 'important');
        textElement.style.setProperty('color', channelColor, 'important');
        textElement.style.setProperty('text-shadow', glow, 'important');
    } else {
        // Reset to the green default so a prior coloured message doesn't linger.
        titleElement.style.removeProperty('color');
        titleElement.style.removeProperty('text-shadow');
        textElement.style.removeProperty('color');
        textElement.style.removeProperty('text-shadow');
    }
    if (_mcScrollRAF) { cancelAnimationFrame(_mcScrollRAF); _mcScrollRAF = null; }
    if (_mcDismissTimer) { clearTimeout(_mcDismissTimer); _mcDismissTimer = null; }
    alertElement.classList.remove('hidden');
    // Reveal style by length: a message that fits the 2-line window types in
    // with the block cursor; a longer one appears at once then, after ~1s,
    // slowly auto-scrolls so the whole thing displays hands-free. (Measuring is
    // synchronous here — set full text, read scrollHeight, decide — so there's
    // no visible flash before the typewriter clears it.)
    textElement.classList.remove('mc-typing');
    textElement.textContent = (text == null ? '' : String(text));
    textElement.scrollTop = 0;
    const commsOverflow = textElement.scrollHeight > textElement.clientHeight + 2;
    if (commsOverflow) {
        _scheduleCommsAutoScroll(textElement);
    } else {
        _typewriterReveal(textElement, text);
    }
    
    // Get or create button container
    const buttonContainer = alertElement.querySelector('.text-center');
    if (!buttonContainer) return;
    
    // Clear previous button ROWS entirely — not just the <button>s. The
    // wrapper divs (each with its own margin-top) were accumulating on every
    // message, pushing the buttons down and the text up. Remove the rows too.
    buttonContainer.querySelectorAll('.mc-btnrow').forEach(row => row.remove());
    buttonContainer.querySelectorAll('button').forEach(btn => btn.remove());
    
    // Determine if this is a tutorial message
    const isTutorialActive = tutorialSystem && tutorialSystem.active && !tutorialSystem.completed;
    
    // Check if this is the final tutorial message
    const isFinalTutorialMessage = title === "Final Orders";
    
    if (isTutorialActive && !isVictoryMessage) {
        // Tutorial: a single SKIP TUTORIAL button (no UNDERSTOOD — the tutorial
        // auto-advances on its own ~10s schedule; the message just persists
        // until the next step replaces it).
        const row = document.createElement('div');
        row.className = 'mc-btnrow';
        row.style.cssText = 'display:flex;justify-content:center;margin-top:1rem;width:100%;';

        const skipButton = document.createElement('button');
        skipButton.id = 'missionCommandSkip';
        skipButton.className = 'space-btn rounded px-6 py-2';
        skipButton.innerHTML = '<i class="fas fa-forward mr-2"></i>SKIP TUTORIAL';
        skipButton.style.cssText = `
            background: linear-gradient(135deg, rgba(255, 150, 0, 0.5), rgba(200, 100, 0, 0.5));
            border-color: rgba(255, 200, 0, 0.6);
            pointer-events: auto;
            touch-action: manipulation;
            -webkit-tap-highlight-color: rgba(255, 150, 0, 0.3);
            cursor: pointer;
            white-space: nowrap;
            min-width: 140px;
        `;
        row.appendChild(skipButton);

        const handleSkip = () => {
            _dismissMissionAlert();
            if (tutorialSystem.active) {
                tutorialSystem.active = false;
                completeTutorial();
                showAchievement('Tutorial Skipped', 'All hostile forces are now active!');
            }
        };
        skipButton.onclick = handleSkip;
        skipButton.ontouchend = (e) => { e.preventDefault(); e.stopPropagation(); handleSkip(); };

        buttonContainer.appendChild(row);
    } else {
        // Lore / transmission / victory: no button — these messages reveal
        // (typing or slow auto-scroll), then disappear on their own after a
        // read beat, like a normal transmission.
        _scheduleCommsAutoDismiss(textElement, commsOverflow);
    }

    // Only play sound if not suppressed
if (typeof gameState === 'undefined' || !gameState.suppressAchievements) {
        playSound('achievement');
}
}

// =============================================================================
// INCOMING TRANSMISSION — delivers a discovery/comms message straight to the
// chrome-less comms panel (no separate READ/SKIP prompt). The discovery path
// opens on its own when the area is found; here the lore just scrolls in below,
// colour-coded by channel, and stays up until the player clicks SKIP.
// =============================================================================

function showIncomingTransmission(title, text, factionColor) {
    // Classify the comms channel -> colour. distress=yellow, lore=cyan,
    // ship-to-ship=orange. (Direct command briefings stay mission-control green.)
    let channel;
    if (factionColor === true || /distress|mayday|under\s*(attack|fire)/i.test(String(title))) channel = 'distress';
    else if (/mission control/i.test(String(title))) channel = 'lore';
    else channel = 'ship';
    const colorHex = { distress: '#ffd633', lore: '#00e5ff', ship: '#ff9a33' }[channel];

    // Short comm-link beep, then deliver straight to the comms panel.
    if (typeof playSound === 'function') playSound('achievement');
    showMissionCommandAlert(title, text, false, colorHex);
}

// =============================================================================
// ENHANCED AUDIO SYSTEM - RESTORED from game-controls13.js (WORKING VERSION)
// =============================================================================

function initAudio() {
    // Guard: only create the AudioContext once. initAudio is called from 5+
    // places (intro ENTER, mobile touch, event setup, etc). Without this
    // guard each call created a NEW AudioContext with new gain nodes — the
    // old context kept running at default gain (1.0) alongside the new one,
    // causing a loud burst on the first few sounds until the old context's
    // oscillators expired.
    if (audioContext) return;

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioContext.createGain();
        masterGain.connect(audioContext.destination);
        // Use setValueAtTime instead of .value = to guarantee the gain is
        // active on the AudioContext timeline BEFORE any oscillator starts.
        // Direct .value assignment on a brand-new context can race with the
        // first scheduled sounds, causing a loud initial burst.
        masterGain.gain.setValueAtTime(0.35, 0);

        // Create separate gains for music and effects
        musicGain = audioContext.createGain();
        effectsGain = audioContext.createGain();
        musicGain.connect(masterGain);
        effectsGain.connect(masterGain);

        musicGain.gain.setValueAtTime(0.4, 0);
        // effectsGain at unity — per-sound gain values (0.3 weapon, 0.4
        // explosion, etc) are the real volume controls. masterGain alone
        // sets the overall level. The old 0.2 × 0.2 = 0.04 chain made
        // weapon peaks inaudible at 0.012 once the duplicate-AudioContext
        // bug was fixed.
        // Default SFX level 50% (was unity — too loud as a default). The
        // pause-menu SFX slider and toggleSfx both respect window._sfxLevel.
        window._sfxLevel = window._sfxLevel ?? 0.5;
        effectsGain.gain.setValueAtTime(window._sfxLevel, 0);
        
        console.log('Enhanced audio system initialized (waiting for user interaction)');
        // Preload MP3 soundtrack alongside synth audio
        if (typeof soundtrack !== 'undefined' && soundtrack.preload) {
            soundtrack.preload();
        }
    } catch (e) {
        console.warn('Audio not supported');
    }
}

function resumeAudioContext() {
    // While the GAME is paused, the context is suspended on purpose — a
    // stray keypress must not bring the audio back mid-pause. togglePause
    // resumes it explicitly.
    if (typeof gameState !== 'undefined' && gameState.paused) return;
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log('AudioContext resumed after user interaction');
            // Start background music after user interaction
            if (musicSystem.enabled && !musicSystem.backgroundMusic) {
                startBackgroundMusic();
            }
        });
    }
}

function startBackgroundMusic() {
    if (!audioContext || !musicSystem.enabled || audioContext.state === 'suspended') {
        return;
    }

    // Create eerie ambient space music
    createAmbientSpaceMusic();
}

// RESTORED: Working ambient music from game-controls13.js
function createAmbientSpaceMusic() {
    if (!audioContext) return;
    
    // Low frequency ambient drone
    const bassOsc = audioContext.createOscillator();
    const bassGain = audioContext.createGain();
    bassOsc.connect(bassGain);
    bassGain.connect(musicGain);
    
    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(40, audioContext.currentTime);
    bassGain.gain.setValueAtTime(0.1, audioContext.currentTime);
    
    // Slow frequency modulation for eerie effect
    const lfo1 = audioContext.createOscillator();
    const lfo1Gain = audioContext.createGain();
    lfo1.connect(lfo1Gain);
    lfo1Gain.connect(bassOsc.frequency);
    lfo1.type = 'sine';
    lfo1.frequency.setValueAtTime(0.05, audioContext.currentTime);
    lfo1Gain.gain.setValueAtTime(5, audioContext.currentTime);
    
    // High frequency pad
    const padOsc = audioContext.createOscillator();
    const padGain = audioContext.createGain();
    const padFilter = audioContext.createBiquadFilter();
    
    padOsc.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(musicGain);
    
    padOsc.type = 'sawtooth';
    padOsc.frequency.setValueAtTime(110, audioContext.currentTime);
    padFilter.type = 'lowpass';
    padFilter.frequency.setValueAtTime(400, audioContext.currentTime);
    padGain.gain.setValueAtTime(0.03, audioContext.currentTime);
    
    // Slow LFO for pad filter
    const lfo2 = audioContext.createOscillator();
    const lfo2Gain = audioContext.createGain();
    lfo2.connect(lfo2Gain);
    lfo2Gain.connect(padFilter.frequency);
    lfo2.type = 'sine';
    lfo2.frequency.setValueAtTime(0.1, audioContext.currentTime);
    lfo2Gain.gain.setValueAtTime(200, audioContext.currentTime);
    
    // Mystery tone generator (RESTORED from game-controlsX2.js)
    const mysteryOsc = audioContext.createOscillator();
    const mysteryGain = audioContext.createGain();
    const mysteryFilter = audioContext.createBiquadFilter();
    
    mysteryOsc.connect(mysteryFilter);
    mysteryFilter.connect(mysteryGain);
    mysteryGain.connect(musicGain);
    
    mysteryOsc.type = 'triangle';
    mysteryOsc.frequency.setValueAtTime(220, audioContext.currentTime);
    mysteryFilter.type = 'lowpass';
    mysteryFilter.frequency.setValueAtTime(800, audioContext.currentTime);
    mysteryGain.gain.setValueAtTime(0, audioContext.currentTime);
    
    // Start all oscillators
    const startTime = audioContext.currentTime;
    bassOsc.start(startTime);
    lfo1.start(startTime);
    padOsc.start(startTime);
    lfo2.start(startTime);
    mysteryOsc.start(startTime);
    
    // IMPROVED: Mystery tone scheduler with better cleanup to prevent stuck sounds
    let mysteryTimeoutId = null;
    function triggerMysteryTone() {
        // Clear any previous timeout
        if (mysteryTimeoutId) {
            clearTimeout(mysteryTimeoutId);
            mysteryTimeoutId = null;
        }

        // Check if music is still enabled and context is valid
        if (!musicSystem.enabled || !musicSystem.backgroundMusic) return;
        if (!audioContext || audioContext.state === 'closed') return;

        const frequencies = [110, 146.83, 164.81, 220, 293.66, 329.63];
        const freq = frequencies[Math.floor(Math.random() * frequencies.length)];
        const now = audioContext.currentTime;

        // Ensure we start from 0 to prevent stuck sounds
        mysteryGain.gain.cancelScheduledValues(now);
        mysteryGain.gain.setValueAtTime(0, now);
        mysteryGain.gain.linearRampToValueAtTime(0.04, now + 2); // Fade in
        mysteryGain.gain.linearRampToValueAtTime(0.001, now + 8); // Fade out completely

        mysteryOsc.frequency.setValueAtTime(freq, now);

        // Schedule next tone with stored timeout ID
        mysteryTimeoutId = setTimeout(triggerMysteryTone, 8000 + Math.random() * 12000);
    }

    setTimeout(triggerMysteryTone, 5000);

    // Store timeout ID for cleanup
    if (!musicSystem.mysteryTimeout) {
        musicSystem.mysteryTimeout = mysteryTimeoutId;
    }
    
    // Store references
    musicSystem.backgroundMusic = {
        stop: () => {
            try {
                bassOsc.stop();
                lfo1.stop();
                padOsc.stop();
                lfo2.stop();
                mysteryOsc.stop();
            } catch(e) {
                // Oscillators already stopped, ignore error
            }
        }
    };
}

function createBattleMusic() {
    if (!audioContext || !musicSystem.enabled) return;

    // Old synthesized battle-music layer RETIRED. switchToBattleMusic() already
    // plays Boss Fight.mp3 via soundtrack.forceTrack('bossFight'); this synth
    // (menacing sawtooth bass/pad/lead) used to play SIMULTANEOUSLY behind it —
    // the "boss sound effect heard behind Boss Fight.mp3" we were asked to
    // disable. It's raw Web Audio (bypasses playSound), which is why the
    // playSound('boss') guard didn't silence it. Return before creating any
    // oscillators; remove this `return` to bring the synth layer back. A
    // harmless stub is set so switchToAmbientMusic()'s cleanup still runs
    // (fades the ambient layer back in + restores music gain after the fight) —
    // it just has nothing real to stop.
    musicSystem.battleMusic = { stop() {} };
    return;

    // MENACING SYNTH-WAVE BOSS MUSIC
    
    // Deep, ominous bass synth
    const bassOsc = audioContext.createOscillator();
    const bassGain = audioContext.createGain();
    const bassFilter = audioContext.createBiquadFilter();
    
    bassOsc.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassGain.connect(musicGain);
    
    bassOsc.type = 'sawtooth';
    bassOsc.frequency.setValueAtTime(55, audioContext.currentTime); // Low A
    bassFilter.type = 'lowpass';
    bassFilter.frequency.setValueAtTime(200, audioContext.currentTime);
    bassGain.gain.setValueAtTime(0.15, audioContext.currentTime);
    
    // Dark atmospheric pad
    const padOsc = audioContext.createOscillator();
    const padGain = audioContext.createGain();
    const padFilter = audioContext.createBiquadFilter();
    
    padOsc.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(musicGain);
    
    padOsc.type = 'sawtooth';
    padOsc.frequency.setValueAtTime(110, audioContext.currentTime); // Low A octave
    padFilter.type = 'lowpass';
    padFilter.frequency.setValueAtTime(800, audioContext.currentTime);
    padGain.gain.setValueAtTime(0.08, audioContext.currentTime);
    
    // Menacing lead synth
    const leadOsc = audioContext.createOscillator();
    const leadGain = audioContext.createGain();
    const leadFilter = audioContext.createBiquadFilter();
    
    leadOsc.connect(leadFilter);
    leadFilter.connect(leadGain);
    leadGain.connect(musicGain);
    
    leadOsc.type = 'square';
    leadOsc.frequency.setValueAtTime(220, audioContext.currentTime);
    leadFilter.type = 'lowpass';
    leadFilter.frequency.setValueAtTime(1200, audioContext.currentTime);
    leadGain.gain.setValueAtTime(0.06, audioContext.currentTime);
    
    // Epic chord progression and melody
    function playEpicSequence() {
        if (!musicSystem.inBattle) return;
        
        // Menacing minor chord progression: Am - F - C - G
        const chordProgression = [
            [220, 264, 330], // A minor
            [175, 220, 264], // F major (lower)
            [264, 330, 396], // C major
            [196, 247, 294]  // G major
        ];
        
        // Dark melody over chords
        const melody = [220, 247, 264, 294, 330, 294, 264, 220];
        const now = audioContext.currentTime;
        
        chordProgression.forEach((chord, chordIndex) => {
            const chordTime = now + chordIndex * 2; // 2 seconds per chord
            
            // Bass note
            bassOsc.frequency.setValueAtTime(chord[0] * 0.5, chordTime);
            
            // Pad chord
            padOsc.frequency.setValueAtTime(chord[1], chordTime);
            
            // Lead melody (2 notes per chord)
            const melodyNote1 = melody[chordIndex * 2];
            const melodyNote2 = melody[chordIndex * 2 + 1];
            
            leadOsc.frequency.setValueAtTime(melodyNote1, chordTime);
            leadOsc.frequency.setValueAtTime(melodyNote2, chordTime + 1);
        });
        
        setTimeout(playEpicSequence, 8000); // Repeat every 8 seconds
    }
    
    const startTime = audioContext.currentTime;
    bassOsc.start(startTime);
    padOsc.start(startTime);
    leadOsc.start(startTime);
    
    playEpicSequence();
    
    musicSystem.battleMusic = {
        stop: () => {
            try {
                bassOsc.stop();
                padOsc.stop();
                leadOsc.stop();
            } catch(e) {
                // Oscillators already stopped, ignore error
            }
        }
    };
}

function switchToBattleMusic() {
    if (musicSystem.inBattle || !musicSystem.enabled) return;

    // Resume audio context if suspended (critical for boss music)
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log('AudioContext resumed for boss battle music');
        });
    }

    musicSystem.inBattle = true;

    // Also have the MP3 soundtrack switch to its boss-fight track —
    // both layers play simultaneously, like sound effects layering
    // over background music.
    if (typeof soundtrack !== 'undefined' && soundtrack.enabled) {
        soundtrack.forceTrack('bossFight');
    }
    
    // Fade out ambient music
    if (musicSystem.backgroundMusic) {
        musicGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1);
        setTimeout(() => {
            if (musicSystem.backgroundMusic) {
                musicSystem.backgroundMusic.stop();
                musicSystem.backgroundMusic = null;
            }
            // Start battle music
            createBattleMusic();
            musicGain.gain.setValueAtTime(0.001, audioContext.currentTime);
            musicGain.gain.exponentialRampToValueAtTime(0.4, audioContext.currentTime + 0.5);
            console.log('🎵 Boss battle music started!');
        }, 1000);
    } else {
        // No background music playing, start battle music immediately
        createBattleMusic();
        musicGain.gain.setValueAtTime(0.001, audioContext.currentTime);
        musicGain.gain.exponentialRampToValueAtTime(0.4, audioContext.currentTime + 0.5);
        console.log('🎵 Boss battle music started immediately!');
    }
}

function switchToAmbientMusic() {
    if (!musicSystem.inBattle || !musicSystem.enabled) return;

    musicSystem.inBattle = false;
    
    // Fade out battle music
    if (musicSystem.battleMusic) {
        musicGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
        setTimeout(() => {
            if (musicSystem.battleMusic) {
                musicSystem.battleMusic.stop();
            }
            // Restart ambient music
            createAmbientSpaceMusic();
            musicGain.gain.setValueAtTime(0.001, audioContext.currentTime);
            musicGain.gain.exponentialRampToValueAtTime(0.4, audioContext.currentTime + 1);
        }, 500);
    }
}

// SFX MUTE: silences every synthesized effect (weapons, hits, explosions,
// enemy lasers — everything routed through effectsGain) without touching
// the music. Wired to the SFX button next to Music.
function toggleSfx() {
    window._sfxMuted = !window._sfxMuted;
    if (typeof effectsGain !== 'undefined' && effectsGain && audioContext) {
        // Unmute restores the user's chosen level, not full blast
        const v = window._sfxMuted ? 0 : (window._sfxLevel ?? 0.5);
        effectsGain.gain.value = v;   // immediate
        effectsGain.gain.setValueAtTime(v, audioContext.currentTime);  // cancel-proof
    }
    const icon = document.getElementById('sfxIcon');
    const btn = document.getElementById('sfxBtn');
    if (icon) icon.className = window._sfxMuted
        ? 'fas fa-volume-mute text-red-400 mr-1'
        : 'fas fa-bullhorn text-cyan-400 mr-1';
    if (btn) btn.classList.toggle('muted', !!window._sfxMuted);
    console.log('🔊 SFX ' + (window._sfxMuted ? 'muted' : 'unmuted'));
}
if (typeof window !== 'undefined') {
    window.toggleSfx = toggleSfx;
    const _wireSfxBtn = () => {
        const btn = document.getElementById('sfxBtn');
        if (btn && !btn._wired) { btn._wired = true; btn.addEventListener('click', toggleSfx); }
    };
    if (window.Boot) window.Boot.whenReady('dom', _wireSfxBtn);
    else setTimeout(_wireSfxBtn, 1000);
}

function toggleMusic() {
    musicSystem.enabled = !musicSystem.enabled;
    const muteIcon = document.getElementById('muteIcon');
    const muteBtn = document.getElementById('muteBtn');
    const mobileIcon = document.getElementById('mobileMusicIcon');
    const mobileBtn = document.getElementById('mobileMusicBtn');

    console.log('🔊 toggleMusic called, enabled:', musicSystem.enabled);

    if (musicSystem.enabled) {
        if (muteIcon) muteIcon.className = 'fas fa-volume-up text-cyan-400 mr-1';
        if (muteBtn) muteBtn.classList.remove('muted');
        if (mobileIcon) mobileIcon.className = 'fas fa-volume-up';
        if (mobileBtn) mobileBtn.classList.remove('muted');
        if (musicGain && audioContext) {
            musicGain.gain.setValueAtTime(0.4, audioContext.currentTime);
        }
        
        // Restart appropriate music
        if (musicSystem.inBattle) {
            createBattleMusic();
        } else {
            startBackgroundMusic();
        }
        // Note: MP3 soundtrack mute is handled by the delegation handler
        // in game-music.js (single source of truth — avoids double toggle).
        console.log('🎵 Music unmuted');
    } else {
        if (muteIcon) muteIcon.className = 'fas fa-volume-mute text-red-400 mr-1';
        if (muteBtn) muteBtn.classList.add('muted');
        if (mobileIcon) mobileIcon.className = 'fas fa-volume-mute';
        if (mobileBtn) mobileBtn.classList.add('muted');
        if (musicGain && audioContext) {
            musicGain.gain.setValueAtTime(0, audioContext.currentTime);
        }
        
        // Stop all music
        if (musicSystem.backgroundMusic) {
            musicSystem.backgroundMusic.stop();
            musicSystem.backgroundMusic = null;
        }
        if (musicSystem.battleMusic) {
            musicSystem.battleMusic.stop();
            musicSystem.battleMusic = null;
        }
        // Note: MP3 soundtrack mute is handled by the delegation handler
        // in game-music.js (single source of truth — avoids double toggle).
        console.log('🔇 Music muted');
    }
}

// RESTORED: Working sound parameters from game-controls13.js
function playSound(type, frequency = 440, duration = 0.2) {
    if (!audioContext || audioContext.state === 'suspended') {
        return;
    }

    // Boss SFX retired: the Boss Fight.mp3 music track now covers boss
    // appearances, so the old synthesized 'boss' stinger is disabled. (Called
    // from game-objects.js x2 and outer-systems.js; guarded here centrally.)
    if (type === 'boss') return;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.connect(gain);
    // Battle SFX trim (player feedback): weapons, hits, damage and
    // explosions ride 20% quieter; ambient/UI sounds are unchanged. The
    // trim is a separate node so each case's scheduled gain ramps stay
    // exactly as tuned.
    const _COMBAT_SFX = {
        weapon: 1, shield_hit: 1, damage: 1, explosion: 1, enemy_fire: 1,
        missile_explosion: 1, missile_launch: 1, death_boom: 1,
        death_rumble: 1, ship_vaporize: 1
    };
    if (_COMBAT_SFX[type]) {
        const _trim = audioContext.createGain();
        _trim.gain.value = 0.8;
        gain.connect(_trim);
        _trim.connect(effectsGain);
    } else {
        gain.connect(effectsGain);
    }

    switch (type) {
        case 'weapon':
            // Per-shot pitch jitter so rapid fire doesn't feel
            // monotonous. ~±4% around the base 800→400Hz sweep.
            {
                const j = 1 + (Math.random() - 0.5) * 0.08;
                oscillator.frequency.setValueAtTime(800 * j, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(400 * j, audioContext.currentTime + 0.1);
            }
            gain.gain.setValueAtTime(0.3, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            oscillator.type = 'square';
            duration = 0.1;
            break;
            
        case 'shield_hit':
            console.log('🎵 Playing shield_hit sound - CASE REACHED'); // ADD THIS
            // Energy absorption sound - swoops down like impact being deadened
            oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.15);
            gain.gain.setValueAtTime(0.25, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
            oscillator.type = 'sine'; // Smooth, muffled sound
            duration = 0.15;
            break;
            
        case 'explosion':
            oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.4);
            gain.gain.setValueAtTime(0.4, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
            oscillator.type = 'sawtooth';
            duration = 0.4;
            break;
        case 'death_boom':
            // Deep, sustained game-over rumble. Longer envelope and
            // lower frequency floor than 'explosion' so the layered
            // death sequence reads as a finishing blow rather than a
            // generic hit.
            oscillator.frequency.setValueAtTime(120, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(28, audioContext.currentTime + 1.5);
            gain.gain.setValueAtTime(0.7, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.6);
            oscillator.type = 'sawtooth';
            duration = 1.6;
            break;
        case 'death_rumble':
            // Sub-bass tail that sits under the booms for body.
            oscillator.frequency.setValueAtTime(48, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(22, audioContext.currentTime + 2.2);
            gain.gain.setValueAtTime(0.55, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 2.2);
            oscillator.type = 'sine';
            duration = 2.2;
            break;
        case 'damage':
            oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
            gain.gain.setValueAtTime(0.5, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            oscillator.type = 'square';
            duration = 0.3;
            break;
        case 'achievement':
            oscillator.frequency.setValueAtTime(523, audioContext.currentTime);
            oscillator.frequency.setValueAtTime(659, audioContext.currentTime + 0.1);
            oscillator.frequency.setValueAtTime(784, audioContext.currentTime + 0.2);
            gain.gain.setValueAtTime(0.3, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
            oscillator.type = 'sine';
            duration = 0.4;
            break;
        case 'warp':
            oscillator.frequency.setValueAtTime(100, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(2000, audioContext.currentTime + 1.2);
            gain.gain.setValueAtTime(0.4, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.2);
            oscillator.type = 'sine';
            duration = 1.2;
            break;
        case 'blackhole_warp':
    // FIXED: Softer black hole warp sound with less rumble
    oscillator.frequency.setValueAtTime(100, audioContext.currentTime); // Higher frequency = less rumble
    oscillator.frequency.exponentialRampToValueAtTime(2500, audioContext.currentTime + 2.0);
    gain.gain.setValueAtTime(0.3, audioContext.currentTime); // Much quieter start
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 2.0);
    oscillator.type = 'sine'; // Smoother wave = less harsh
    duration = 2.0;
    break;
        case 'wormhole_warp':
    // Shimmering, otherworldly sweep — distinct from the deep
    // black-hole rumble. A high triangle tone that wobbles UP then
    // resolves, evoking spatial folding rather than gravitational
    // collapse.
    oscillator.frequency.setValueAtTime(420, audioContext.currentTime);
    oscillator.frequency.linearRampToValueAtTime(1700, audioContext.currentTime + 0.5);
    oscillator.frequency.linearRampToValueAtTime(700, audioContext.currentTime + 1.0);
    oscillator.frequency.exponentialRampToValueAtTime(2600, audioContext.currentTime + 1.8);
    gain.gain.setValueAtTime(0.28, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.8);
    oscillator.type = 'triangle';
    duration = 1.8;
    break;
        case 'enemy_fire':
            oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(300, audioContext.currentTime + 0.2);
            gain.gain.setValueAtTime(0.3, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
            oscillator.type = 'sawtooth';
            duration = 0.2;
            break;
		case 'shield_hit':
    // Energy absorption sound - swoops down like impact being deadened
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.15);
    gain.gain.setValueAtTime(0.25, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
    oscillator.type = 'sine'; // Smooth, muffled sound
    duration = 0.15;
    break;
		case 'boss':
    		// Deep, menacing boss sound
    		oscillator.frequency.setValueAtTime(80, audioContext.currentTime);
   			oscillator.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.5);
   			oscillator.frequency.exponentialRampToValueAtTime(60, audioContext.currentTime + 1.0);
    		gain.gain.setValueAtTime(0.6, audioContext.currentTime);
    		gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.2);
    		oscillator.type = 'sawtooth';
    		duration = 1.2;
    		break;
        case 'missile_launch':
            oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.3);
            gain.gain.setValueAtTime(0.4, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            oscillator.type = 'sawtooth';
            duration = 0.3;
            break;

        case 'missile_explosion':
            oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(30, audioContext.currentTime + 0.6);
            gain.gain.setValueAtTime(0.5, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.6);
            oscillator.type = 'sawtooth';
            duration = 0.6;
            break;

        case 'ship_vaporize':
            // Dramatic vaporizing sound - starts high and sweeps down
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(20, audioContext.currentTime + 1.5);
            gain.gain.setValueAtTime(0.7, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1.5);
            oscillator.type = 'sawtooth';
            duration = 1.5;
            break;
        default:
            oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
            gain.gain.setValueAtTime(0.2, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
            oscillator.type = 'sine';
    }
    
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
}

// =============================================================================
// FACTION-FLAVOURED LASER SOUNDS
//
// Each hostile faction (and the special set: bosses, guardians, Borg, UFOs,
// Martian Pirates) gets its own oscillator profile so a busy fight reads
// as distinct voices instead of one generic blaster loop. Bossy / heavy
// shooters get a second layered oscillator for body. Every shot gets a
// ~±4% pitch jitter so rapid fire feels alive, not metronomic.
// =============================================================================
const ENEMY_LASER_PROFILES = {
    // 8 canonical hostile factions
    'Federation':            { type: 'square',   f0:  720, f1:  480, dur: 0.13, gain: 0.28 },
    'Klingon Empire':        { type: 'sawtooth', f0:  380, f1:  200, dur: 0.20, gain: 0.32,
                               layer: { type: 'sine',     f0:   95, f1:   60, dur: 0.20, gain: 0.18 } },
    'Rebel Alliance':        { type: 'square',   f0:  850, f1:  520, dur: 0.13, gain: 0.28 },
    'Romulan Star Empire':   { type: 'sine',     f0:  500, f1:  200, dur: 0.22, gain: 0.30,
                               layer: { type: 'triangle', f0: 1100, f1:  700, dur: 0.22, gain: 0.16 } },
    'Galactic Empire':       { type: 'sawtooth', f0: 1100, f1:  600, dur: 0.09, gain: 0.30 },
    'Cardassian Union':      { type: 'triangle', f0:  480, f1:  240, dur: 0.18, gain: 0.30 },
    'Sith Empire':           { type: 'square',   f0: 1500, f1:  180, dur: 0.16, gain: 0.32 },
    'Vulcan High Command':   { type: 'sine',     f0:  720, f1:  480, dur: 0.13, gain: 0.28 },
    // Special enemy categories
    'pirate':                { type: 'sawtooth', f0:  700, f1:  350, dur: 0.18, gain: 0.30 },
    'borg':                  { type: 'square',   f0:  220, f1:  110, dur: 0.25, gain: 0.32,
                               layer: { type: 'sine',     f0:   65, f1:   50, dur: 0.25, gain: 0.20 } },
    'ufo':                   { type: 'sine',     f0: 1800, f1: 1500, dur: 0.22, gain: 0.26,
                               layer: { type: 'triangle', f0: 2400, f1: 2100, dur: 0.22, gain: 0.14 } },
    'boss':                  { type: 'sawtooth', f0:  280, f1:  140, dur: 0.30, gain: 0.42,
                               layer: { type: 'square',   f0:   90, f1:   55, dur: 0.30, gain: 0.22 } },
    'guardian':              { type: 'sawtooth', f0:  320, f1:  180, dur: 0.22, gain: 0.38,
                               layer: { type: 'sine',     f0:  100, f1:   60, dur: 0.22, gain: 0.20 } },
    'default':               { type: 'sawtooth', f0:  600, f1:  300, dur: 0.20, gain: 0.30 }
};

// Resolve an enemy object → profile key. Type-based wins (boss/guardian/
// Borg/UFO/pirate) override faction so a Klingon BOSS sounds like a boss,
// not a Klingon fighter.
function _enemyFactionKey(enemy) {
    if (!enemy || !enemy.userData) return 'default';
    const ud = enemy.userData;
    if (ud.isBoss) return 'boss';
    if (ud.isBlackHoleGuardian || ud.isEliteGuardian) return 'guardian';
    if (ud.isBorgCube || ud.isBorg || ud.type === 'borg_drone' || ud.type === 'borg_cube') return 'borg';
    if (ud.isUFO) return 'ufo';
    if (ud.isMartianPirate) return 'pirate';
    if (typeof ud.galaxyId === 'number' &&
        typeof galaxyTypes !== 'undefined' && galaxyTypes[ud.galaxyId]) {
        const f = galaxyTypes[ud.galaxyId].faction;
        if (f && ENEMY_LASER_PROFILES[f]) return f;
    }
    if (ud.faction && ENEMY_LASER_PROFILES[ud.faction]) return ud.faction;
    return 'default';
}

// One oscillator burst with pitch jitter. Used by playFactionLaserSound
// for both the base shot and (if present) the layered overtone.
function _fireLaserOsc(p, jitter) {
    if (!audioContext || audioContext.state === 'suspended') return;
    const t = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const g = audioContext.createGain();
    osc.connect(g);
    g.connect(typeof effectsGain !== 'undefined' ? effectsGain : audioContext.destination);
    osc.type = p.type;
    osc.frequency.setValueAtTime(p.f0 * jitter, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, p.f1 * jitter), t + p.dur);
    // Battle SFX trim: lasers ride 20% quieter (player feedback)
    g.gain.setValueAtTime(p.gain * 0.8, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + p.dur);
    osc.start(t);
    osc.stop(t + p.dur);
}

function playFactionLaserSound(factionKey) {
    const prof = ENEMY_LASER_PROFILES[factionKey] || ENEMY_LASER_PROFILES.default;
    const jitter = 1 + (Math.random() - 0.5) * 0.08;  // ±4 %
    _fireLaserOsc(prof, jitter);
    if (prof.layer) _fireLaserOsc(prof.layer, jitter);
}

function playEnemyLaserSound(enemy) {
    playFactionLaserSound(_enemyFactionKey(enemy));
}

if (typeof window !== 'undefined') {
    window.playFactionLaserSound = playFactionLaserSound;
    window.playEnemyLaserSound = playEnemyLaserSound;
}

// =============================================================================
// VISUAL EFFECTS SYSTEM
// =============================================================================

// Martian Pirate explosion variants — same skeleton as createExplosionEffect
// but color/density parameterized, with a delayed secondary pop. The variant
// doubles as the LOOT TELL (PewPew-style color discipline): the explosion
// color announces what the kill drops.
//   ember  (red/orange) → bonus hull salvage   (common)
//   flare  (gold)       → +20 energy cells     (uncommon)
//   plasma (cyan)       → +1 missile           (rare)
const PIRATE_EXPLOSION_VARIANTS = {
    ember:  { core: 0xff4422, particles: 0xff8833, count: 30, secondary: 0xff6600 },
    flare:  { core: 0xffcc33, particles: 0xffee88, count: 38, secondary: 0xffaa00 },
    plasma: { core: 0x33ddff, particles: 0x88eeff, count: 24, secondary: 0x00aaff }
};
function createPirateExplosionVariant(position, variant) {
    const cfg = PIRATE_EXPLOSION_VARIANTS[variant] || PIRATE_EXPLOSION_VARIANTS.ember;
    // Layered burst in the variant's loot colors (see _fxLayeredBurst) —
    // the old version was an OPAQUE growing sphere plus opaque points,
    // which over this game's dense white starfield read as a flat tan
    // disc pasted on the sky instead of a detonation.
    _fxLayeredBurst(position, {
        core: 0xfff3d0, flash: cfg.core, ring: cfg.secondary,
        spark: cfg.particles, sparkCount: cfg.count, scale: 1.0
    });

    // Delayed secondary pop — small offset burst so each variant reads as
    // a two-beat detonation rather than a single flash.
    const offset = position.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10));
    setTimeout(() => {
        if (typeof createExplosionEffect === 'function') createExplosionEffect(offset);
    }, variant === 'plasma' ? 200 : 130);
}
window.createPirateExplosionVariant = createPirateExplosionVariant;

// ── Layered detonation primitive ──────────────────────────────────────────
// THE TAN BLOB. Every generic kill used to spawn one OPAQUE
// MeshBasicMaterial sphere (0xff6600) that grew and faded, plus one opaque
// PointsMaterial cloud. Opaque orange over this game's dense white
// starfield averages out to a flat tan disc — it covers the sky instead of
// adding light to it, so a kill read as a sticker, not an explosion. This
// replaces it with the three beats an explosion actually needs, all
// ADDITIVE so they read as emitted light:
//   1. CORE FLASH  — a camera-facing soft sprite that punches to white in
//                    ~1 frame and is gone in ~200 ms (the "bang")
//   2. SHOCK RING  — a thin expanding annulus (the "front")
//   3. SPARKS      — fast additive points thrown outward (the "debris")
// Cheap: 1 sprite + 1 ring + 1 Points system, all owned by explosionManager.
let _fxFlashTexture = null;
function _fxGetFlashTexture() {
    if (_fxFlashTexture) return _fxFlashTexture;
    const size = 128, c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0.0, 'rgba(255,255,255,1.0)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    g.addColorStop(1.0, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    _fxFlashTexture = new THREE.CanvasTexture(c);
    _fxFlashTexture.needsUpdate = true;
    return _fxFlashTexture;
}

// ── HARD CORE: the detonation's one saturated white pixel-block ──────────
//
// THE BUG. _fxGetFlashTexture above is a SOFT profile — alpha 1.0 only at
// the exact centre texel, already down to 0.35 at 45% of the radius. Every
// layer of the kill burst used it, and every layer's animation grows while
// its opacity decays, so the burst buys AREA and never INTENSITY. Measured
// at 250u on a paused world with the victim isolated against black and
// explosionManager stepped by hand in 25 ms beats: at the area peak
// (t=425-450 ms) the burst covered 12-19x the hull's silhouette but only
// 0.05-0.26% of its lit pixels were above 230/255, with a median luminance
// of 46-48. The one genuinely hot frame was t=25 ms — 11.3% above 230 — and
// it was 1.0x the hull, i.e. gone before the player's eye arrived. Bright
// when it is small, big when it is dim: a kill that never reads as a flash.
//
// This is the missing profile: a HARD disc. Fully saturated white out to
// 42% of the radius, still half-strength at 62%, gone at the rim. Paired
// with _fxHotCore below — which holds its size and its opacity instead of
// dissolving — it gives the detonation a core that is actually white for
// long enough to see, which is the one thing five soft layers stacked on
// top of each other cannot produce.
let _fxHardTexture = null;
function _fxGetHardCoreTexture() {
    if (_fxHardTexture) return _fxHardTexture;
    const size = 128, c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0.00, 'rgba(255,255,255,1.0)');
    g.addColorStop(0.42, 'rgba(255,255,255,1.0)');
    g.addColorStop(0.62, 'rgba(255,255,255,0.55)');
    g.addColorStop(1.00, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    _fxHardTexture = new THREE.CanvasTexture(c);
    _fxHardTexture.needsUpdate = true;
    return _fxHardTexture;
}

// A NEAR-STATIC HOT DISC. Deliberately NOT the same animation as
// _fxCoreFlash: size barely moves (startSize -> endSize is a ~45% growth,
// not the 6.4x the bang layer sweeps) and opacity HOLDS at full for the
// first ~72% of its life before falling off a cliff. That hold is the whole
// point — a flash the eye can catch is a flash that is still there on the
// next frame, and an exponentially-decaying sprite is never at full value
// for more than the frame it spawned on.
// `capFrac`: this layer's share of the screen cap, as a fraction of the cap
// RADIUS. Omitted = 1 (uncapped relative to the cap itself). A Sprite's
// scale is its FULL size and its visible radius is half that, so the largest
// legal scale is _fxMaxScale(pos, 0.5 / capFrac) — see _fxMaxScale.
function _fxHotCore(center, color, startSize, endSize, life, capFrac) {
    const _cf = (capFrac > 0) ? capFrac : 1;
    const mat = new THREE.SpriteMaterial({
        map: _fxGetHardCoreTexture(), color: color, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true
    });
    const sp = new THREE.Sprite(mat);
    sp.position.copy(center);
    sp.scale.setScalar(startSize);
    sp.frustumCulled = false;
    sp.renderOrder = 74;          // over every soft layer, so it stays white
    scene.add(sp);
    let t = 0;
    explosionManager.addExplosion({
        update(dt) {
            t += dt;
            const k = Math.min(1, t / life);
            const want = startSize + (endSize - startSize) * k;
            // Trajectory compressed, not clipped — see _fxShockwave.
            const maxS = _fxMaxScale(sp.position, 0.5 / _cf);
            sp.scale.setScalar(endSize > maxS ? want * (maxS / endSize) : want);
            mat.opacity = (k < 0.72) ? 1 : Math.max(0, (1 - k) / 0.28);
            return k < 1;
        },
        cleanup() { scene.remove(sp); mat.dispose(); }
    });
}

// `capFrac` as in _fxHotCore: this layer's share of the screen cap radius.
// `opa` is the layer's PEAK opacity (default 1). It exists because the
// centre of the kill is a stack of four additive layers, and while every one
// of them is at full opacity their sum clips to white for as long as the
// longest of them lives — measured, the radial-brightness peak then sits in
// bin 0-2 of 16 for 1,500 ms, i.e. the ball out-shines the front for the
// entire event no matter how the front is drawn. Turning the two LONG core
// layers down (not off) keeps the detonation flash intense while letting the
// centre stop clipping once the flash is over, which is when the travelling
// front is supposed to be the brightest thing on screen.
function _fxCoreFlash(center, color, startSize, endSize, life, capFrac, opa) {
    const _cf = (capFrac > 0) ? capFrac : 1;
    const _op = (opa > 0) ? opa : 1;
    const mat = new THREE.SpriteMaterial({
        map: _fxGetFlashTexture(), color: color, transparent: true, opacity: _op,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true
    });
    const sp = new THREE.Sprite(mat);
    sp.position.copy(center);
    sp.scale.setScalar(startSize);
    sp.frustumCulled = false;
    sp.renderOrder = 70;
    scene.add(sp);
    let t = 0;
    explosionManager.addExplosion({
        update(dt) {
            t += dt;
            const k = Math.min(1, t / life);
            const want = startSize + (endSize - startSize) * Math.sqrt(k);
            // Trajectory compressed, not clipped — see _fxShockwave.
            const maxS = _fxMaxScale(sp.position, 0.5 / _cf);
            sp.scale.setScalar(endSize > maxS ? want * (maxS / endSize) : want);
            mat.opacity = _op * Math.max(0, 1 - k * k);
            return k < 1;
        },
        cleanup() { scene.remove(sp); mat.dispose(); }
    });
}

function _fxLayeredBurst(position, o) {
    if (typeof scene === 'undefined' || typeof THREE === 'undefined' || !position) return;
    o = o || {};
    const center = position.clone ? position.clone()
                 : new THREE.Vector3(position.x, position.y, position.z);
    const S = o.scale || 1;
    // K, in hull lengths, exactly as _fxKillBurst derives it — the two
    // beats below have to be the same SIZE of event as every other death in
    // the game, and 9 fixed world units was not.
    const K = _fxVictimWorldLen(null, center) * _FX_KILL_GAIN * S;
    // THE HOT CORE. The layered burst is what the demo's actual kill runs
    // (45 s of instrumented combat: createPirateExplosionVariant x9), and it
    // was the one path with no saturated white element at all — two soft
    // flashes whose peak value is colour x opacity, which for a gold or a
    // cyan loot tell can never reach 230/255. White here, hue everywhere
    // else: value and saturation do not have to be the same pixels.
    _fxHotCore(center, 0xffffff, _FX_HOT_CORE_K * K, _FX_HOT_CORE_K * 1.34 * K, 330,
               _FX_CAP_HOTCORE);
    _fxCoreFlash(center, o.core || 0xfff3d0, 8 * S, 74 * S, 210, _FX_CAP_BANG);
    _fxCoreFlash(center, o.flash || 0xff8a3c, 14 * S, 128 * S, 420, _FX_CAP_FIRE, 0.72);
    // THE FRONT, replacing a CONSTANT-WIDTH ANNULUS. `_fxRing(center, 9*S,
    // 0xff6a22, 0.62, 9, 0.85)` drew a hard-edged brown circle of uniform
    // thickness: measured, a rim scanline step of 113/255 (bar: < 40) and,
    // read blind, "a perfect uniform-width brown circle that reads as a HUD
    // reticle" — the one element that made the game's most common kill look
    // like UI. `_fxShockwave` is the alpha-ramped, camera-re-aimed,
    // screen-capped, decelerating pair the rest of the kills already use, so
    // the pirate death gets a travelling front instead of a target marker.
    // The loot tell survives intact: the two fronts wear the variant's
    // secondary and particle colours.
    _fxShockwave(center, 0.20 * K, 1.55 * K, o.ring  || 0xff6a22, 560, 1.0,  _FX_CAP_FRONT_IN);
    _fxShockwave(center, 0.15 * K, 2.05 * K, o.spark || 0xffb454, 820, 0.95, _FX_CAP_FRONT_OUT);
    if (typeof _fxParticles === 'function') {
        _fxParticles(center, o.sparkCount || 26, o.spark || 0xffb454, 2.1 * S, 3.4 * S, 12, 0);
    }
    _fxEmberTail(center, K, o.spark || 0xffb454, 96, 1850);
}

// ── KILL SPECTACLE: size the detonation off the thing that died ──────────
//
// THE BUG THIS FIXES. The generic kill burst was a fixed-size recipe (74u
// and 128u flash sprites, one 9u ring, 26 sparks) regardless of what blew
// up. Measured in the framebuffer at 1,200u against a 116u hull whose
// silhouette covers ~940 px, the whole explosion peaked at 1,053 lit px —
// 1.1x the ship — and was fully dark by ~630 ms. A kill was literally
// SMALLER than the ship that died and over before the player's eye got
// there. Every other beat in the fight (the plume, the telegraph, the
// bolt) is angular-size aware; the death was the one thing that wasn't.
//
// So the burst is now derived from the victim's own measured hull, using
// the SAME manual world-box measurement _ensureShipThrusterCones uses for
// the plume (real hull meshes only — skip the 40u collision hitbox, the
// additive glow layers and the thruster quads, or the box is dominated by
// the hitbox and every explosion comes out identical again). Everything
// downstream is expressed in hull-lengths, so a wingman pops and a boss
// detonates without a single magic pixel number.
const _fxBox = new THREE.Box3();
const _fxMB = new THREE.Box3();
const _fxLM = new THREE.Matrix4();
const _fxInv = new THREE.Matrix4();
const _fxSize = new THREE.Vector3();
const _fxWS = new THREE.Vector3();

// Neutral fall-back hull length, and the clamp that keeps a bad measurement
// from producing either an invisible pop or a screen-filling nuke.
const _FX_HULL_DEFAULT = 80;
const _FX_HULL_MIN = 42;
const _FX_HULL_MAX = 620;

function _fxMeasureWorldLen(obj) {
    if (!obj || !obj.isObject3D) return 0;
    const ud = obj.userData || {};
    // MEASURE FRESH. This used to return the plume rig's cached
    // `_plumeHullLen` to save a traverse — but that cache is baked ONCE,
    // whenever the rig was first built, at whatever range the hostile
    // happened to be at, and the hull carries a distance-driven screen floor
    // (see the geometry cap up at _HULL_GEO_BOOST_MAX). The victim's APPARENT
    // size at the instant it dies — which is exactly what the burst has to be
    // >=3x of — therefore did NOT match the size the burst was drawn from,
    // and the kill/hull ratio became a function of the ship's engagement
    // history: measured, a hostile whose rig was built at 700u (floor boost
    // 1.00) and died at 1,200u (boost 1.25) detonated 1.56x too small in
    // screen area, dropping the ratio from 3.4x to ~2.2x — a silent failure
    // of the acceptance bar with no code change behind it. One extra traverse
    // on the single frame something dies is not a cost worth that. The caches
    // stay as the fallback for a hull that can no longer be measured.
    let len = 0;
    try {
        obj.updateWorldMatrix(true, true);
        try { obj.getWorldScale(_fxWS); } catch (e) { _fxWS.set(1, 1, 1); }
        const sx = Math.max(0.001, Math.abs(_fxWS.x || 1));
        _fxInv.copy(obj.matrixWorld).invert();
        _fxBox.makeEmpty();
        let any = false;
        obj.traverse(n => {
            if (!n.isMesh || !n.geometry) return;
            const u = n.userData || {};
            if (u.isHitbox || u.isGlowLayer || u._isThrusterCone ||
                u._isHullRead) return;
            if (!n.geometry.boundingBox) n.geometry.computeBoundingBox();
            if (!n.geometry.boundingBox) return;
            _fxLM.multiplyMatrices(_fxInv, n.matrixWorld);
            _fxMB.copy(n.geometry.boundingBox).applyMatrix4(_fxLM);
            _fxBox.union(_fxMB);
            any = true;
        });
        if (any && isFinite(_fxBox.min.x) && _fxBox.max.x > _fxBox.min.x) {
            _fxBox.getSize(_fxSize);
            len = Math.max(_fxSize.x, _fxSize.y, _fxSize.z) * sx;
        }
    } catch (e) {}
    if (len > 0 && obj.userData) obj.userData._fxHullLen = len;
    if (!(len > 0)) len = (ud._plumeHullLen > 0) ? ud._plumeHullLen
                        : ((ud._fxHullLen > 0) ? ud._fxHullLen : 0);
    return len;
}

// Most call sites hand us `enemy.position` — the LIVE Vector3, not a copy —
// so an identity scan finds the victim exactly. Proximity is the backstop
// for the handful that pass a clone.
const _fxLastVictim = { len: 0, at: 0, x: 0, y: 0, z: 0 };

function _fxVictimWorldLen(target, pos) {
    let len = 0;
    if (target && target.isObject3D) len = _fxMeasureWorldLen(target);
    if (!len && pos) {
        const pool = (typeof enemies !== 'undefined' && enemies) ? enemies
                   : (typeof window !== 'undefined' ? window.enemies : null);
        if (pool && pool.length) {
            let best = null, bestD = Infinity;
            for (let i = 0; i < pool.length; i++) {
                const e = pool[i];
                if (!e || !e.position) continue;
                if (e.position === pos) { best = e; bestD = 0; break; }
                const d = e.position.distanceToSquared(pos);
                if (d < bestD) { bestD = d; best = e; }
            }
            // Only trust a proximity hit if it is essentially AT the blast.
            if (best && bestD <= 220 * 220) len = _fxMeasureWorldLen(best);
        }
    }
    const now = Date.now();
    // createPirateExplosionVariant fires a delayed secondary pop from a
    // random offset, by which time the victim is out of `enemies`. Inherit
    // the size of the kill that just happened next door so the second beat
    // matches the first instead of collapsing to the default.
    if (!len && pos && _fxLastVictim.len > 0 && now - _fxLastVictim.at < 1600 &&
        Math.abs(pos.x - _fxLastVictim.x) < 320 &&
        Math.abs(pos.y - _fxLastVictim.y) < 320 &&
        Math.abs(pos.z - _fxLastVictim.z) < 320) {
        len = _fxLastVictim.len;
    }
    if (!len) return _FX_HULL_DEFAULT;
    len = Math.min(_FX_HULL_MAX, Math.max(_FX_HULL_MIN, len));
    if (pos) {
        _fxLastVictim.len = len; _fxLastVictim.at = now;
        _fxLastVictim.x = pos.x; _fxLastVictim.y = pos.y; _fxLastVictim.z = pos.z;
    }
    return len;
}

// SHOCKWAVE FRONT. One shared unit annulus (inner 0.82 / outer 1.0) scaled
// per frame, re-aimed at the camera every frame so the front always reads
// as a circle instead of the ellipse a spawn-time lookAt leaves behind when
// you are strafing past the kill. Geometry is shared and must NOT be
// disposed in cleanup.
let _FX_SHOCK_GEO = null;
function _fxShockGeo() {
    // THE ANNULUS IS NOW A CARRIER, NOT THE SHAPE. The old geometry WAS the
    // front: a 7%-wide RingGeometry(0.93, 1.0, 64) at opacity 1.0, which in
    // the framebuffer is a hard-edged outline — measured, a soap-bubble arc
    // with the same brightness at its inner and outer rim, which is exactly
    // what a detonation does not look like. The band is now painted by
    // _fxShockTex (a radial alpha ramp) so the geometry only has to be wide
    // enough to CONTAIN the painted band: 0.52 -> 1.0 of the radius, with
    // the texture zero at both rims so neither one is ever a visible edge.
    // 192 segments (was 64) because at the cap radius a 64-gon's chord error
    // is ~3 px and reads as a polygon at exactly the moment the front is
    // brightest.
    if (!_FX_SHOCK_GEO) _FX_SHOCK_GEO = new THREE.RingGeometry(0.52, 1.0, 192);
    return _FX_SHOCK_GEO;
}

// SOFT PRESSURE FRONT, radial alpha. RingGeometry's UVs are normalised to
// the OUTER radius over a [0,1] square (uv = (v/outerR + 1)/2), so a radial
// texture centred at (0.5, 0.5) maps distance-from-centre 0..1 onto
// 0..outerRadius directly, and the profile below is authored in exactly
// those units.
//
// THE PROFILE IS ASYMMETRIC ON PURPOSE. A shock front is bright at its
// LEADING edge and trails a wake behind it; a symmetric band is a bubble.
// Peak sits at 0.86 of the radius with a tight outer shoulder (sigma 0.062,
// ~5% of the radius) and a long inner wake (sigma 0.20). Because the peak
// is a FIXED FRACTION of the radius and the mesh is scaled per frame, the
// brightest radial band physically MOVES OUTWARD every frame — which is the
// measurement that failed before (peak radial band sat in bin 0, dead
// centre, at every beat from 25 ms to 2400 ms).
let _FX_SHOCK_TEX = null;
function _fxShockTex() {
    if (_FX_SHOCK_TEX) return _FX_SHOCK_TEX;
    const N = 256, h = N / 2;
    const c = document.createElement('canvas'); c.width = N; c.height = N;
    const g = c.getContext('2d');
    const img = g.createImageData(N, N);
    const d = img.data;
    const PEAK = 0.86, OUT = 0.062, IN = 0.20;
    const ss = (e0, e1, x) => {
        const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
        return t * t * (3 - 2 * t);
    };
    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            const dx = (x + 0.5 - h) / h, dy = (y + 0.5 - h) / h;
            const rr = Math.sqrt(dx * dx + dy * dy);
            let a;
            if (rr > PEAK) { const u = (rr - PEAK) / OUT; a = Math.exp(-u * u); }
            else           { const u = (PEAK - rr) / IN;  a = Math.exp(-u * u); }
            // Zero at BOTH rims of the carrier annulus, so the geometry's own
            // edges can never show up as a step in the scanline.
            a *= ss(0.50, 0.62, rr) * (1 - ss(0.955, 1.0, rr));
            const i = (y * N + x) * 4;
            d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
            d[i + 3] = Math.round(255 * Math.min(1, Math.max(0, a)));
        }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    _FX_SHOCK_TEX = t; return t;
}

// `capFrac` is this front's share of the screen-space cap (_fxCapPx), as a
// fraction of the cap RADIUS. The outer front gets 1.0 (it is what the 35%
// rule is actually about); inner layers get less, so that when the cap bites
// at point-blank range the layers are squeezed toward the cap in PROPORTION
// and the burst keeps its nesting order instead of collapsing into one disc.
function _fxShockwave(center, r0, r1, color, life, opacity, capFrac) {
    if (typeof scene === 'undefined') return;
    const cf = (capFrac > 0) ? capFrac : 1;
    const mat = new THREE.MeshBasicMaterial({
        // The band is painted by the texture's alpha ramp, not by the mesh
        // outline. Without this map the annulus is a hard rim at both edges.
        map: _fxShockTex(),
        color: color, transparent: true, opacity: opacity,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const ring = new THREE.Mesh(_fxShockGeo(), mat);
    ring.position.copy(center);
    ring.frustumCulled = false;
    ring.renderOrder = 71;
    ring.userData.__dbTris = Infinity;   // never a draw-budget candidate
    scene.add(ring);
    const _aim = () => {
        const c = (typeof camera !== 'undefined' && camera) ? camera : window.camera;
        if (c) ring.lookAt(c.position);
    };
    _aim();
    let t = 0;
    explosionManager.addExplosion({
        update(dt) {
            t += dt;
            const k = Math.min(1, t / life);
            // Fast out of the gate, decelerating — a pressure front, not a
            // linear circle animation.
            let r = r0 + (r1 - r0) * (1 - Math.pow(1 - k, 2.2));
            // Screen-space clamp on the RADIUS. _fxMaxScale(pos, w) is the
            // largest multiplier keeping world radius `w` inside the cap, so
            // asking it about w = 1/cf yields the largest permitted radius
            // for this layer's share of the cap.
            //
            // COMPRESS THE TRAJECTORY, DON'T CLIP ITS TOP. Clipping (r =
            // min(r, lim)) is what a naive cap does, and measured at 100-150u
            // it made the front reach the cap in ~75 ms and then sit there:
            // the peak radial band pinned at 109 px and stopped moving, which
            // is a static ring — the exact failure this rebuild is about, just
            // relocated. Scaling the WHOLE r0..r1 sweep by lim/r1 keeps the
            // front expanding across its full life at every range; only the
            // size changes, never the motion.
            const lim = _fxMaxScale(ring.position, 1 / cf);
            if (r1 > lim) r *= lim / r1;
            ring.scale.set(r, r, 1);
            _aim();
            // LEADING-EDGE RAMP. The front fades IN over its first ~12% of
            // life instead of spawning at full brightness on top of the core.
            // At spawn the ring radius is 0.15-0.20K — right inside the
            // fireball — so a front that is already hot there just adds to
            // the central blob and is the reason the radial peak never left
            // bin 0. It brightens as it SEPARATES, so the brightest band in
            // the frame is the one travelling outward.
            // Decay softened 1.35 -> 1.05: the front has to still be bright
            // where it IS, which is far from the centre. A steep decay makes
            // the front dimmest exactly when it is widest, which is the same
            // "goes big as it goes dull" failure the core layers were rebuilt
            // to avoid.
            const lead = Math.min(1, k / 0.12);
            mat.opacity = opacity * lead * Math.pow(1 - k, 1.05);
            return k < 1;
        },
        cleanup() { scene.remove(ring); mat.dispose(); }   // shared geo kept
    });
}

// EMBER / DEBRIS TAIL. The kill has to OUTLIVE the shot: the flash is over
// in ~0.5 s but burning wreckage keeps the spot on screen for the ~1.8 s it
// takes the player to look at what they just did. One Points system (one
// draw call) of soft additive embers thrown outward with drag, on a slow
// power-curve fade plus a flicker so it reads as burning debris rather than
// a dissolve.
const _FX_EMBER_OPA = 0.80;
function _fxEmberTail(center, S, color, count, life) {
    if (typeof scene === 'undefined') return;
    count = count || 30;
    life = life || 1850;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const spd = S * 0.055;
    for (let i = 0; i < count; i++) {
        pos[i*3] = center.x; pos[i*3+1] = center.y; pos[i*3+2] = center.z;
        let dx = Math.random() - 0.5, dy = Math.random() - 0.5, dz = Math.random() - 0.5;
        const m = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
        // SPEED FLOOR 0.30 -> 0.62. Debris that barely moves sits on the
        // detonation point for the whole event, and because the innermost
        // radial bin is a tiny disc, a handful of stationary hard-core sparks
        // there dominate its mean — measured, the radial peak stayed pinned
        // to bin 0 from 400 ms on with a centre value of 110/255 while the
        // travelling front read 94, i.e. the "ball" that beat the front late
        // in the event was the ember cloud, not a bloom. Clearing the middle
        // is also just what an explosion does.
        const s = spd * (0.62 + Math.random() * 1.35);
        vel[i*3] = dx/m*s; vel[i*3+1] = dy/m*s; vel[i*3+2] = dz/m*s;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // Offsets from the centre are integrated SEPARATELY from the written
    // positions so the screen cap can rescale the whole cloud each frame
    // without compounding into the integration (see the update below).
    const off = new Float32Array(count * 3);
    // BIRTH SPREAD — debris comes off a SHIP, not off a point. Seeding all
    // 96 embers at the exact same coordinate stacks 96 additive sprites on
    // one pixel for the first beat: measured in isolation that single frame
    // was an 81/255 scanline step at t=25 ms (bar: < 40), a saturated disc
    // with a cliff where the stack thins — the worst edge in the whole kill
    // and the one that made the composite reading swing 37-54 run to run
    // depending on where the sampled row happened to fall. Each ember gets a
    // head start of 0.5-2.5 steps along its OWN velocity, so the cloud is
    // born as a cloud. No new state, no extra work per frame.
    for (let i = 0; i < count; i++) {
        const head = 0.8 + Math.random() * 2.4;
        off[i*3] = vel[i*3] * head; off[i*3+1] = vel[i*3+1] * head; off[i*3+2] = vel[i*3+2] * head;
    }
    // Terminal spread: v0 * sum(drag^n) = v0/(1-0.93) ~= 14.3 v0, and the
    // fastest ember leaves at spd*(0.62+1.35) = spd*1.97, so with spd = S *
    // 0.055 the cloud settles at 14.3 * 0.055 * 1.97 = ~1.55 S.
    const TERM = 1.55 * S;
    const mat = new THREE.PointsMaterial({
        // SPARKS, NOT BOKEH. At 0.145 hull-lengths each ember was a soft
        // blob wider than a nav light, and 30 of them read as a lens effect
        // rather than as burning wreckage. Small and numerous is what makes
        // debris legible: the point sprite has to be near the size the eye
        // reads as a POINT, and the count has to carry the presence instead.
        // SIZE 0.062 -> 0.090 HULL LENGTHS, PEAK 1.0 -> 0.80. Not a retreat
        // to bokeh — 0.090 is still well under the 0.145 that read as a lens
        // effect, and the count still carries the presence. It is the
        // scanline bar: a point sprite's steepest gradient is peak/radius,
        // and gl_PointSize is computed against the CSS height rather than
        // the drawing buffer, so at a 1.5x device ratio these render at HALF
        // the pixel radius their world size implies — a 7 px radius at full
        // brightness is a 36/255 step from one spark alone, and 96 of them
        // overlapping at the detonation point measured 54-82 (bar: < 40).
        // Wider and dimmer holds the same total light with 0.54x the slope.
        color: color || 0xffbcdd, size: Math.max(1.6, S * 0.090),
        map: _fxSparkTex(), transparent: true, opacity: _FX_EMBER_OPA,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 72;
    pts.userData.__dbTris = Infinity;
    scene.add(pts);
    let t = 0;
    explosionManager.addExplosion({
        update(dt) {
            t += dt;
            const k = Math.min(1, t / life);
            const f = dt / 50;
            const drag = Math.pow(0.93, f);
            const arr = geo.attributes.position.array;
            // Same screen cap as every scaled layer, and the same compression
            // rule: the debris is the one part of the kill that can still
            // cross the 35% bbox rule at point-blank range once the sprites
            // and fronts are clamped. The cloud's share of the cap radius is
            // its design size relative to the outer front, 1.55/2.05 = 0.756.
            // Scaling every offset by one factor shrinks the cloud without
            // flattening it onto the cap the way a per-spark clamp would —
            // that would pile the fast embers into a hard shell.
            const maxR = _fxMaxScale(center, 1 / 0.756);
            const shrink = (maxR !== Infinity && TERM > maxR) ? maxR / TERM : 1;
            for (let i = 0; i < count; i++) {
                vel[i*3] *= drag; vel[i*3+1] *= drag; vel[i*3+2] *= drag;
                off[i*3]   += vel[i*3]   * f;
                off[i*3+1] += vel[i*3+1] * f;
                off[i*3+2] += vel[i*3+2] * f;
                arr[i*3]   = center.x + off[i*3]   * shrink;
                arr[i*3+1] = center.y + off[i*3+1] * shrink;
                arr[i*3+2] = center.z + off[i*3+2] * shrink;
            }
            geo.attributes.position.needsUpdate = true;
            const fl = 0.82 + 0.18 * Math.sin(t * 0.021);
            // LEADING-EDGE RAMP, as on the shock fronts. Per-beat, the kill's
            // worst scanline step lives entirely in the first ~100 ms
            // (measured 24 / 37 / 43 / 42 / 31 / 25 at t = 25..150 ms, then
            // 12-24 for the remaining 1.5 s): that is the window where the
            // debris is still inside the fireball, adding nothing the bang is
            // not already doing while stacking ~96 hot points across a few
            // dozen pixels. Fading the cloud in over 240 ms costs nothing the
            // eye can see — wreckage becomes visible as it LEAVES the flash,
            // which is also when it starts meaning something.
            const lead = Math.min(1, t / 240);
            mat.opacity = Math.max(0, Math.pow(1 - k, 0.55)) * fl * _FX_EMBER_OPA * lead;
            return k < 1;
        },
        cleanup() { scene.remove(pts); geo.dispose(); mat.dispose(); }
    });
}

// The generic kill detonation, every dimension in HULL LENGTHS (S).
// Synthwave discipline: hot white-pink core, hot magenta fireball, and a
// magenta/cyan double shock front — the same neon pair the HUD and the
// nebulae already speak. Nothing here is orange any more, because orange
// over this starfield is what made the old burst read as a tan sticker.
// ONE knob. Every dimension below is a multiple of the victim's hull
// length; _FX_KILL_GAIN scales the whole silhouette at once so the
// "explosion peak lit px vs hull silhouette px" ratio can be tuned against
// the framebuffer without re-balancing five layers by hand.
//
// CALIBRATED, not guessed — and the calibration is only as good as the
// measurement, so here is what the measurement actually was.
//
// Rounds 1-2 tuned this constant against numbers that were wrong twice over.
// The frames being diffed were captured ~60ms apart with the world RUNNING,
// so the player flew ~1,000u during a 2.4s explosion track and the burst
// simply got nearer — which is why the "peak" appeared to arrive at 2,250ms
// and to grow monotonically to the end of the capture, an impossible shape
// for an effect whose longest layer dies at 1,850ms. Worse, the harness
// booted with startGame() and never left the Earth launch pad, so every
// reading was taken against a LIT BLUE ATMOSPHERE (background luminance
// 175/255): additive layers over a near-clipped background barely register,
// which is exactly what made the burst look small and pushed this gain up.
//
// Round 3 re-measured with idle/full/background rendered INSIDE ONE JS TASK
// (scene time and star rotation bit-identical between readbacks, so the diff
// is only the toggled object), the world paused, explosionManager stepped by
// hand in exact 50ms beats, and the subject parked down the darkest ray in
// the frame. On a 116u Martian Pirate at 1,200u the burst then measures:
//   peak 16,400 px at t=550ms   (hull silhouette 1,644-2,891 px depending on
//   aspect -> 5.5x broadside, 10x foreshortened)
//   still lit at t=1,500ms (369 px), dark by t=1,950ms
// So 0.84 is comfortably past the >=3x bar at every aspect, and the peak
// lands where a detonation should — at 550ms, not at the end of the tail.
// It is NOT lowered back toward 0.64 because that is an area change of
// (0.64/0.84)^2 = 0.58x, which would put the broadside case at 3.3x, close
// enough to the bar that a slightly larger hull would fail it.
const _FX_KILL_GAIN = 0.84;

// HOT-CORE SIZE, in units of K. See _fxHotCore / _fxGetHardCoreTexture for
// why this layer exists. It is a separate knob from _FX_KILL_GAIN on
// purpose: _FX_KILL_GAIN sizes the whole silhouette (the "is the kill big
// enough" axis) and this one sizes the saturated white part (the "is the
// kill HOT enough" axis), and round 4 proved those two move independently —
// every previous round bought area with gain and got no intensity for it.
// Trimmed 1.38 -> 0.86 (scale; radius 0.69K -> 0.43K). This layer is the
// hard-edged saturated disc, and at 1.38K it was measured as a flat CLIPPED
// PLATEAU of +148..+152 luminance across ~150 px — the single thing making
// the burst read as a blown-out ball. Its job is to be the hottest thing in
// the frame, not the widest; the >=230/255 requirement is about INTENSITY
// and survives the area cut, while the front now owns the outward motion.
const _FX_HOT_CORE_K = 0.86;

// SCREEN-CAP SHARES. _fxCapPx() is one radius — 35% of viewport HEIGHT as a
// diameter — and every layer of the kill is now clamped against it. Each
// constant is that layer's design radius divided by the outer front's
// (2.05K), so when the cap bites at point-blank range the whole burst is
// squeezed TOWARD the cap in proportion and keeps its nesting order, instead
// of every layer piling onto the cap radius and collapsing into one disc.
//
// This is the fix for the measured range sweep: without any cap on
// _fxKillBurst the generic burst hit p98 bbox-height 0.380 of the viewport
// at 100u and 0.445 at 60u (the 0.35 rule breaks below ~130u), and worse,
// peak/hull collapsed to 1.73 at 60u — a point-blank kill was SMALLER than
// the ship that died, because the effect saturated the frame while the hull
// silhouette kept growing.
const _FX_CAP_FRONT_OUT = 1.00;   // 2.05K — the layer the 35% rule is about
const _FX_CAP_FRONT_IN  = 0.756;  // 1.55K
const _FX_CAP_HOTCORE   = 0.232;  // 0.86K scale -> 0.43K radius (peak 0.475K)
const _FX_CAP_GLOW      = 0.159;  // 0.65K scale -> 0.325K radius
const _FX_CAP_FIRE      = 0.151;  // 0.62K scale -> 0.31K radius
const _FX_CAP_BANG      = 0.134;  // 0.55K scale -> 0.275K radius

// FACTION IDENTITY WITHOUT A SECOND CODEBASE.
//
// Every hostile death used to be built BESIDE this function instead of on
// it (see createFactionExplosion): eight hand-written recipes of untextured
// blobs and solid tetrahedra that never called the hot core, never called a
// shock front, and therefore inherited none of the four rounds of work that
// went into making a kill read as a detonation. Measured at 250u, faction 1
// held its radial-brightness peak in dead-centre bin 0 at ALL 68 beats from
// 25 ms to 2,400 ms with a clipped plateau in the middle, and faction 6's
// whole death was 0.72x the silhouette of the ship that died.
//
// The fix is one burst with a tint, not nine bursts. `cfg` shifts the hues
// of the layers whose colour is free — the fireball, the two fronts and the
// embers — and leaves alone the one layer whose job is INTENSITY (the hot
// core is white for every faction, because 230/255 is a value bar and no
// faction hue can clear it). Mix weights are deliberately partial: the
// synthwave neon stays the base and the faction pulls it, so a Klingon kill
// is a hot gold-shifted magenta detonation, not an orange one.
function _fxTintHue(base, tint, amt) {
    if (tint === undefined || tint === null) return base;
    return new THREE.Color(base).lerp(new THREE.Color(tint), amt).getHex();
}

function _fxKillBurst(center, S, cfg) {
    const K = S * _FX_KILL_GAIN;
    const c = cfg || {};
    // THE WHITE CORE, first and brightest — a near-static saturated disc that
    // HOLDS for ~190 ms instead of dissolving. renderOrder 74 puts it over
    // every soft layer below so nothing can average it back down.
    _fxHotCore(center, 0xffffff, _FX_HOT_CORE_K * K, _FX_HOT_CORE_K * 1.34 * K, 330,
               _FX_CAP_HOTCORE);
    // THE CORE STOPS CHASING THE FRONT. These three end sizes were 1.10K /
    // 1.50K / 1.80K, which as sprite RADII (a Sprite's scale is its full
    // size) is 0.55K / 0.75K / 0.90K — running right up under the two shock
    // radii at 1.55K / 2.05K. With the old hard 7% annulus carrying the only
    // thin element, that made the ball the widest BRIGHT thing in every
    // frame: measured, the radial-brightness peak sat in bin 0 (dead centre)
    // at every beat from 25 ms to 2400 ms, and a death read as a lens flare
    // rather than a detonation. Ends are now 0.55K / 0.62K / 0.65K of SCALE
    // — radii 0.275K / 0.31K / 0.325K, a fifth to a sixth of the outer front
    // — so the fireball is unambiguously the thing INSIDE the expanding
    // front, and the front is what the eye tracks outward.
    // THE FLASH IS SHORT AND THE AFTERGLOW IS DIM. The bang keeps full
    // opacity — that first ~240 ms is the detonation and it should be the
    // brightest thing in the frame. The two longer layers are turned down so
    // the centre stops clipping once the bang is spent, handing the frame to
    // the travelling front for the rest of the event.
    _fxCoreFlash(center, _fxTintHue(0xfff0f7, c.core, 0.30),
                 0.30 * K, 0.55 * K, 240, _FX_CAP_BANG);                          // the bang
    _fxCoreFlash(center, _fxTintHue(0xff5aa8, c.core, 0.62),
                 0.32 * K, 0.62 * K, 380, _FX_CAP_FIRE, 0.72);                    // the fireball
    // AFTERGLOW, trimmed 2.70K/980ms -> 1.80K/700ms. This layer was the
    // reason the burst's area peak landed at 425-450 ms as a huge dim cloud:
    // it grows 4.9x while fading, so it contributed almost all of the peak's
    // pixel count and almost none of its brightness, which is exactly what
    // dragged the above-230 fraction to 0.05-0.26%. Smaller and shorter moves
    // the area peak forward into the window where the core is still white.
    _fxCoreFlash(center, _fxTintHue(0xff2f78, c.core, 0.55),
                 0.40 * K, 0.65 * K, 620, _FX_CAP_GLOW, 0.45);                    // the afterglow
    // Shock rings: opacity up (the cyan front was at 0.62 and read as a grey
    // smudge over the starfield) and radii trimmed in step with the afterglow
    // so the front stays a FRONT rather than the widest thing in the frame.
    _fxShockwave(center, 0.20 * K, 1.55 * K, _fxTintHue(0xff3fa8, c.front, 0.68),
                 560, 1.0,  _FX_CAP_FRONT_IN);
    _fxShockwave(center, 0.15 * K, 2.05 * K, _fxTintHue(0x53ecff, c.front, 0.40),
                 820, 0.95, _FX_CAP_FRONT_OUT);
    // Embers: 30 fat soft blobs read as bokeh, not as burning wreckage. The
    // size floor drops 3.0 -> 1.2 px and the hull-relative size 0.145 ->
    // 0.062 (see _fxEmberTail), and the count triples to keep the tail's
    // presence while every individual ember becomes a SPARK.
    _fxEmberTail(center, K, _fxTintHue(0xffbcdd, c.ember, 0.70), 96, 1850);
}

function createExplosionEffect(targetObject) {
    // Support both object with position property and direct position vector
    let position;
    if (targetObject && targetObject.position) {
        position = targetObject.position;
    } else if (targetObject && typeof targetObject.x !== 'undefined') {
        position = targetObject;
    } else {
        console.warn('Invalid target object for explosion');
        return;
    }
    if (typeof scene === 'undefined' || typeof THREE === 'undefined') return;

    const center = position.clone ? position.clone()
                 : new THREE.Vector3(position.x, position.y, position.z);
    _fxKillBurst(center, _fxVictimWorldLen(targetObject, position));

    // Play explosion sound
    playSound('explosion');
}

// =============================================================================
// FACTION-UNIQUE EXPLOSIONS
// Each of the 8 factions gets a visually distinct death effect so the
// player can tell at a glance who they just killed. All effects run
// through explosionManager and use additive blending. Reusable
// primitive builders keep each faction recipe short.
// =============================================================================
const FACTION_EXPLOSION = {
    0: { name: 'Federation',  style: 'electric',   core: 0xffffff, accent: 0x33ddff, spark: 0x66ccff },
    1: { name: 'Klingon',     style: 'shrapnel',   core: 0xffcc44, accent: 0xff3300, spark: 0xff6600 },
    2: { name: 'Rebel',       style: 'ionbloom',   core: 0xccffaa, accent: 0x66ff33, spark: 0x99ff44 },
    3: { name: 'Romulan',     style: 'singularity',core: 0xffffff, accent: 0x33ff88, spark: 0x00ffaa },
    4: { name: 'Imperial',    style: 'tieblast',   core: 0xffffff, accent: 0x66ff66, spark: 0xaaffaa },
    5: { name: 'Cardassian',  style: 'spiral',     core: 0xffdd66, accent: 0xff9922, spark: 0xffbb44 },
    6: { name: 'Sith',        style: 'darkenergy', core: 0xff2222, accent: 0xaa00ff, spark: 0xff0044 },
    7: { name: 'Vulcan',      style: 'goldrings',  core: 0xfff0cc, accent: 0xffcc66, spark: 0xffd699 }
};

// ─────────────────────────────────────────────────────────────────────────
// SCREEN-SPACE CAP FOR DEATH EFFECTS
//
// Every kill layer in this file grows in WORLD units and every one of them
// was range-blind: the same 8-unit blob with the same 2.2-per-50ms growth is
// a tasteful pop at 900u and a whiteout at 60u. Measured on a paused world
// at 250u with the victim isolated against the live sky, the Klingon
// shrapnel core peaked at 678,722 of 705,600 framebuffer pixels — 96.2% of
// the viewport, i.e. the player's entire screen, for ~10 frames — and it did
// that while its ABOVE-230 fraction was 0.0%. A kill that erases the frame
// is not a kill you can fight through; it is a blindfold.
//
// So the growth stays honest in world space (things really do get bigger
// when they are closer) and a CAP is applied where the problem actually
// lives, in framebuffer pixels. `_plumePxPerUnit` is the same helper the
// plume's angular-size floor uses, so the cap is measured against the
// DRAWING BUFFER (1120x630 here) rather than the CSS size — the stricter of
// the two. 0.35 of the half-height = ~110 px of radius = 220 px of diameter
// against a 630 px buffer: a detonation may own about a third of the frame's
// height and never more, at any range, on any faction.
//
// The cap only ever BINDS closer than roughly 140u for a standard blob.
// Everywhere out at the median dogfight range (~200u) the effect is running
// at its natural size and the cap is inert, which is what keeps perspective
// honest: two kills at different ranges still read as different sizes.
const _FX_SCREEN_FRAC = 0.35;

// DETONATION FALLOFF PROFILE.
//
// The blob was first rebuilt on `_plumeCoreTex()` — the nozzle bloom's
// profile — because it is a radial falloff that already ships and it does
// kill the faceted rim. This is a gentler profile for the same job, and the
// honest reason is MARGIN, not failure. Measured like-for-like at 250u, same
// sprite size, same opacity, max 1-px step along the centre row:
//
//     _plumeCoreTex   31-35 /255
//     _fxBlastTex     16-19 /255      (bar: < 40)
//
// The nozzle profile passes. It passes with about 5/255 of room, because it
// is tuned for a bloom a handful of pixels across — where a fast shoulder
// reads as "hot" — and a detonation at combat range is ~40 px across, which
// stretches the same shoulder over enough pixels to see it. Anything that
// later makes the blob smaller or brighter (a closer kill, a hotter faction
// core, the screen cap biting) eats that 5 and puts a visible edge in the
// one layer whose entire job is to not have one. Doubling the margin costs
// one 128x128 canvas for the session.
//
// The centre still clips to white — that is the hot core, and it is what
// holds the >=230/255 requirement — the change is entirely in how the
// shoulder gets to zero.
let _FX_BLAST_TEX = null;
function _fxBlastTex() {
    if (_FX_BLAST_TEX) return _FX_BLAST_TEX;
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0.00, 'rgba(255,255,255,1)');
    grd.addColorStop(0.15, 'rgba(255,255,255,0.92)');
    grd.addColorStop(0.30, 'rgba(255,255,255,0.74)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.52)');
    grd.addColorStop(0.60, 'rgba(255,255,255,0.32)');
    grd.addColorStop(0.75, 'rgba(255,255,255,0.17)');
    grd.addColorStop(0.88, 'rgba(255,255,255,0.06)');
    grd.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    _FX_BLAST_TEX = t; return t;
}

// SPARK PROFILE — the one shape a point sprite is allowed to have.
//
// Measured per layer at 250u in a 3600x2025 buffer, worst scanline step
// through each primitive ALONE (bar: < 40/255):
//     hot core            8      shock front      20
//     garnish blob        6      debris streaks   33
//     ember tail         54      particle cloud   76
// The two point clouds were the entire remaining edge in the kill, and for
// a reason that is geometric rather than aesthetic: a point sprite is only
// ~13-27 px across at combat range, so ALL of its falloff is crammed into a
// handful of pixels, and any profile with a plateau or a shoulder spends
// that budget in one step. `_fxGetHardCoreTexture` holds full white to 42%
// of its radius and then drops 45% by 62% — across the ~200 px hot core
// that is a gentle shoulder, across a 27 px ember it is a cliff.
//
// A LINEAR ramp is the profile that minimises the worst step for a given
// radius: spread over R pixels, the steepest it can ever be is peak/R,
// where every other monotone falloff is steeper somewhere. No plateau, no
// shoulder, no rim — the sparks stay small and numerous (which is what
// makes debris read as debris) and stop putting an edge in the frame.
let _FX_SPARK_TEX = null;
function _fxSparkTex() {
    if (_FX_SPARK_TEX) return _FX_SPARK_TEX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        grd.addColorStop(t, 'rgba(255,255,255,' + (1 - t).toFixed(3) + ')');
    }
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    _FX_SPARK_TEX = t; return t;
}

// PAY FOR THE CANVASES BEFORE THE FIGHT, NOT DURING IT. Every falloff
// profile above is built lazily on a 64-128 px canvas and cached for the
// session, which means the FIRST kill of the session pays for all of them
// at once: measured live, createPirateExplosionVariant cost 15.6 ms on its
// first call against 2.9 ms on every later one — a dropped frame at the
// exact moment the player is looking at the thing they just shot. Building
// them at load costs the same few milliseconds while the intro screen is up.
try {
    if (typeof THREE !== 'undefined' && typeof document !== 'undefined') {
        _fxGetFlashTexture(); _fxGetHardCoreTexture(); _fxBlastTex();
        _fxSparkTex(); _fxShockTex();
    }
} catch (e) { /* textures stay lazy if anything here is not ready yet */ }

function _fxCapPx() {
    const r = (typeof renderer !== 'undefined' && renderer) ? renderer : window.renderer;
    let h = 0;
    if (r && r.domElement) h = r.domElement.height || r.domElement.clientHeight || 0;
    if (!h) {
        const cv = document.getElementById('gameCanvas');
        h = (cv && cv.height) || window.innerHeight || 900;
    }
    return _FX_SCREEN_FRAC * (h * 0.5);
}

// Largest scale multiplier that keeps a world-space radius under the cap.
// Returns Infinity when there is nothing to measure against, so a missing
// camera degrades to the old uncapped behaviour instead of to an invisible
// explosion.
function _fxMaxScale(pos, worldRadius) {
    if (!(worldRadius > 0)) return Infinity;
    const cam = (typeof camera !== 'undefined' && camera) ? camera : window.camera;
    if (!cam || !cam.position) return Infinity;
    const ppu = _plumePxPerUnit(cam.position.distanceTo(pos));
    if (!(ppu > 0)) return Infinity;
    return _fxCapPx() / (worldRadius * ppu);
}

// HOW MUCH OF THE CALLER'S GROWTH THE BLOB KEEPS.
//
// The recipes below were written against a filled sphere and ask for 1.6-3.4
// scale units per 50 ms, which is a 20-30x diameter sweep over the layer's
// life. That number is not a size, it is the whole reason the effect went
// big exactly as it went dull: opacity decays on a fixed schedule while area
// grows unbounded, so every extra frame spends brightness on more pixels.
// The blob is now the HOT half of the effect and the ring is the BIG half
// (see _fxRing), so the blob keeps ~1/7th of the sweep — it still visibly
// bursts, it just stops trying to be the shockwave as well.
const _FX_BLOB_GROWTH = 0.14;

// WHITE-HOT FRACTION AND HOW LONG IT HOLDS.
//
// Additive over the sky, a sprite's centre value is colour x opacity, so a
// faction-hued blob can never be hotter than its own hue is worth: Klingon
// gold (0xffcc44) tops out at luminance 205 no matter how opaque it is, and
// the acceptance bar is 230. The fix is the same one the plume streak
// already uses — value and saturation do not have to be the same pixels.
// The blob is born nearly WHITE and COOLS to its faction hue across the
// first ~55% of its life, so the detonation's first frames are genuinely
// hot and the colour arrives as it fades, which is also what burning metal
// actually does. `_FX_BLOB_HOLD` is the fraction of life the opacity holds
// flat before it starts decaying: without it the brightest frame is the
// spawn frame and the eye never arrives in time.
const _FX_BLOB_WHITE = 0.85;
const _FX_BLOB_COOL = 0.55;
const _FX_BLOB_HOLD = 0.42;

// THE DETONATION BLOB — a camera-facing Sprite on the plume's radial
// falloff, replacing an UNTEXTURED SphereGeometry(16,12).
//
// The old shape was a flat filled disc with a hard faceted rim: measured
// along a scanline it went 0 -> 98/255 inside 4 px and then sat perfectly
// flat all the way across, which is the signature of a solid polygon, not
// of an explosion. The blob is now a camera-facing Sprite on `_fxBlastTex()`
// — a hot centre that falls off smoothly to nothing, with no rim to facet.
// (See that function for why detonations do not simply reuse the nozzle
// bloom's own profile, which was the first thing tried here.)
//
// Signature is unchanged — every faction recipe below calls this — and so
// are the `life`/`opacity` timings. What changed is the shape, the cooling
// colour ramp, the opacity hold, the cap, and the growth budget.
function _fxSphere(center, radius, color, opacity, life, growth) {
    if (typeof scene === 'undefined' || typeof THREE === 'undefined') return;
    const hue = new THREE.Color(color);
    const hot = hue.clone().lerp(new THREE.Color(0xffffff), _FX_BLOB_WHITE);
    const mat = new THREE.SpriteMaterial({
        map: _fxBlastTex(), color: hot.clone(),
        transparent: true, opacity: opacity,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const sp = new THREE.Sprite(mat);
    sp.position.copy(center);
    // Sprite scale is the quad's full size and the texture fades to zero at
    // its edge, so the sprite's visible RADIUS is half its scale.
    sp.scale.setScalar(radius * 2);
    sp.frustumCulled = false;
    sp.renderOrder = 84;          // over the soft layers, so the core stays hot
    sp.userData.__dbTris = Infinity;
    scene.add(sp);
    const lifeMs = life * 50;
    let s = 1, t = 0;
    explosionManager.addExplosion({
        update(dt) {
            t += dt;
            s += growth * _FX_BLOB_GROWTH * (dt / 50);
            const k = Math.min(1, t / lifeMs);
            const sc = Math.min(s, _fxMaxScale(sp.position, radius));
            sp.scale.setScalar(radius * 2 * sc);
            mat.opacity = (k < _FX_BLOB_HOLD)
                ? opacity
                : Math.max(0, opacity * (1 - (k - _FX_BLOB_HOLD) / (1 - _FX_BLOB_HOLD)));
            mat.color.copy(hot).lerp(hue, Math.min(1, k / _FX_BLOB_COOL));
            return k < 1;
        },
        cleanup() { scene.remove(sp); mat.dispose(); }
    });
}

// THE EXPANDING FRONT. This is now the layer that carries SIZE — the blob
// above holds still and stays hot, this one sweeps outward and stays thin.
// Three changes beyond the cap: the annulus is 9% of the radius instead of
// 18% (a fat band sweeping outward additively is an area machine, which is
// the exact failure the blob was just taken off), it is re-aimed at the
// camera every frame instead of only at spawn, so strafing past a kill does
// not turn the front into an ellipse, and the expansion is EASED.
//
// WHY EASED. The growth was linear and, at the rates the recipes ask for,
// it spent its whole travel almost immediately: measured at 250u, the
// Romulan front (4u seed, growth 9) went from 113 px to its capped 315 px
// diameter in 80 ms and then sat perfectly still for the remaining ~600 ms
// of its life while only its opacity changed. A shock front that stops
// moving and then dissolves in place is not a front, it is a decal.
//
// So the travel is spread across the whole life on the same decelerating
// curve `_fxShockwave` already uses — fast out of the gate, slowing as it
// goes, which is what a real pressure front does.
//
// The important part is WHAT IT EXPANDS TOWARD. Easing alone did not fix
// the freeze, it moved it earlier (an ease-OUT is fastest at the start, so
// it reached the cap at 50 ms instead of 80). The front has to aim at the
// limit that actually applies: `min(natural end scale, current cap scale)`,
// re-evaluated each frame. Then the ring spends its entire life expanding
// no matter the range — out where the cap is inert it arrives at exactly
// the old endpoint (1 + growth*life, unchanged), and up close it arrives
// gently at the cap instead of slamming into it in three frames. A front
// that stops moving reads as a decal; one that decelerates into its limit
// reads as a front running out of energy, which is what it is.
//
// AND IT IS PAINTED, NOT OUTLINED. A 9%-wide RingGeometry on an untextured
// MeshBasicMaterial is a constant-brightness annulus with a vertical edge at
// each rim: measured on the Martian Pirate kill — the most common death in
// the game — that was a 113/255 scanline step, and read blind the frame was
// "a perfect uniform-width brown circle that reads as a HUD reticle". The
// band is now painted by the same radial alpha ramp `_fxShockwave` uses
// (which measures a 20/255 step), on the same shared unit geometry, so the
// front glows brightest in the middle of the band and reaches zero at both
// rims. Geometry is SHARED and must not be disposed here.
function _fxRing(center, radius, color, growth, life, opacity) {
    if (typeof scene === 'undefined' || typeof THREE === 'undefined') return;
    const geo = _fxShockGeo();          // unit outer radius, band painted by the map
    const mat = new THREE.MeshBasicMaterial({
        map: _fxShockTex(),
        color: color, transparent: true, opacity: opacity || 0.85,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(center);
    ring.scale.set(radius, radius, 1);   // unit geometry: scale IS the radius
    ring.frustumCulled = false;
    ring.renderOrder = 73;
    ring.userData.__dbTris = Infinity;
    const _aim = () => {
        const c = (typeof camera !== 'undefined' && camera) ? camera : window.camera;
        if (c) ring.lookAt(c.position);
    };
    _aim();
    scene.add(ring);
    const o0 = (opacity || 0.85);
    const sEnd = 1 + growth * life;      // exactly where the old linear ramp ended
    let t = 0, op = o0;
    explosionManager.addExplosion({
        update(dt) {
            t += dt;
            const k = Math.min(1, t / (life * 50));
            const lim = Math.min(sEnd, _fxMaxScale(ring.position, radius));
            const sc = 1 + (Math.max(1, lim) - 1) * (1 - Math.pow(1 - k, 2.2));
            op -= (o0 / life) * (dt / 50);
            // Geometry is a UNIT ring now, so the world radius is the scale.
            ring.scale.set(radius * sc, radius * sc, 1);
            _aim();
            // Leading-edge ramp, as on _fxShockwave: the front fades in over
            // its first ~12% instead of spawning at full brightness while it
            // is still small enough that its whole falloff is 2 px wide.
            mat.opacity = Math.max(0, op) * Math.min(1, k / 0.12);
            return op > 0;
        },
        cleanup() { scene.remove(ring); mat.dispose(); }   // shared geo kept
    });
}

// Flying DEBRIS STREAKS. Gives factions a sharp, non-circular signature.
//
// WHY THESE ARE NOT MESHES ANY MORE. This used to spawn one solid
// TetrahedronGeometry / OctahedronGeometry per shard on an untextured
// MeshBasicMaterial — that is, `count` flat-shaded polygons with a hard
// silhouette edge. Measured across the Klingon burst at 250u the rim
// scanline step was 142/255 (bar: < 40) and the blind read of the frame was
// "a white blob ringed by ~26 flat orange triangles". A polygon has an edge
// no matter how small you draw it, and 26 of them at combat range are the
// single most artificial thing in the kill.
//
// A streak is a camera-facing Sprite on `_fxGetHardCoreTexture()` — the
// same radial falloff the hot core and the embers already use, so there is
// no rim to facet — scaled long on one axis and rotated to point along the
// debris' own SCREEN-SPACE direction of travel. That last part is what
// keeps the faction signature: the cloud still reads as angular wreckage
// thrown outward rather than as a round particle puff, because every streak
// is aligned with its own trajectory and they all radiate from the kill.
// `kind` now picks the aspect instead of the polyhedron: 'octa' throws
// longer, thinner slivers, 'tetra' shorter, chunkier lumps.
//
// Cost: one Sprite each, no per-shard geometry to build or dispose.
const _FX_STREAK_AXES = { tetra: [3.1, 1.25], octa: [4.4, 0.95] };
const _fxStreakV = new THREE.Vector3();
function _fxShards(center, count, color, size, speed, life, kind) {
    if (typeof scene === 'undefined' || typeof THREE === 'undefined') return;
    const AX = _FX_STREAK_AXES[kind] || _FX_STREAK_AXES.tetra;
    const shards = [];
    for (let i = 0; i < count; i++) {
        const s = size * (0.6 + Math.random() * 0.8);
        // _fxBlastTex, NOT _fxGetHardCoreTexture. The hard profile is built
        // for the one layer that has to CLIP — it holds full white to 42% of
        // its radius and then drops to 0.55 by 62%, which across the ~200 px
        // of the hot core is a gentle shoulder and across a ~20 px shard is a
        // 45% alpha cliff inside two pixels. Measured on the Klingon burst at
        // 250u in a 3600x2025 buffer, streaks on the hard texture scored a
        // 73/255 scanline step (bar: < 40) — a textured sprite reproducing
        // the polygon edge it was brought in to remove. The blast profile is
        // the one tuned to stay under the bar at detonation scale.
        const m = new THREE.SpriteMaterial({
            map: _fxBlastTex(),
            color: color, transparent: true, opacity: 1,
            blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true
        });
        const mesh = new THREE.Sprite(m);
        mesh.position.copy(center);
        mesh.scale.set(s * AX[0], s * AX[1], 1);
        mesh.frustumCulled = false;
        mesh.renderOrder = 73;
        mesh.userData.__dbTris = Infinity;
        scene.add(mesh);
        shards.push({
            mesh: mesh, geo: null, mat: m,
            off: new THREE.Vector3(),
            vel: new THREE.Vector3(
                Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
            ).normalize().multiplyScalar(speed * (0.5 + Math.random())),
            spin: new THREE.Vector3(
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5)
        });
    }
    let l = 1.0;
    // Drag-free like _fxParticles, so the cloud's terminal radius is
    // speed * 1.5 * life — for the Klingon recipe (speed 12, life 16) that is
    // 288 world units, which at 250u is 1,074 px of framebuffer: measured,
    // shards were the layer carrying p98 bbox-height to 0.99 of the viewport
    // while every layer of the burst proper sat inside the 0.35 cap.
    const TERM = speed * 1.5 * Math.max(1, life);
    explosionManager.addExplosion({
        update(dt) {
            l -= (1 / life) * (dt / 50);
            const f = dt / 50;
            const maxR = _fxMaxScale(center, 1);
            const shrink = (maxR !== Infinity && TERM > maxR) ? maxR / TERM : 1;
            // Screen-space basis, resolved once per frame for the whole
            // cloud: a streak has to lie along where it is GOING on the
            // player's screen, and projecting the velocity onto the camera's
            // right/up axes gives that without a matrix multiply per shard.
            const cam = (typeof camera !== 'undefined' && camera) ? camera : window.camera;
            let rx = 1, ry = 0, rz = 0, ux = 0, uy = 1, uz = 0;
            if (cam && cam.matrixWorld) {
                const e = cam.matrixWorld.elements;
                rx = e[0]; ry = e[1]; rz = e[2];
                ux = e[4]; uy = e[5]; uz = e[6];
            }
            for (let i = 0; i < shards.length; i++) {
                const c = shards[i];
                c.off.addScaledVector(c.vel, f);
                c.mesh.position.copy(center).addScaledVector(c.off, shrink);
                // Sprite rotation replaces the old mesh tumble: the shard
                // still spins (spin.z wobbles the streak around its own
                // heading) but it can never present a flat polygon face.
                const sx = c.vel.x * rx + c.vel.y * ry + c.vel.z * rz;
                const sy = c.vel.x * ux + c.vel.y * uy + c.vel.z * uz;
                c.mat.rotation = Math.atan2(sy, sx) + c.spin.z * 0.35;
                c.mat.opacity = Math.max(0, l);
            }
            return l > 0;
        },
        cleanup() {
            for (let i = 0; i < shards.length; i++) {
                scene.remove(shards[i].mesh);
                if (shards[i].geo) shards[i].geo.dispose();
                shards[i].mat.dispose();
            }
        }
    });
}

// Low-segment ring = a polygon outline (3 = triangle, 5 = pentagon,
// 6 = hexagon). A crisp geometric alternative to the round shockwave.
function _fxPolyRing(center, radius, color, sides, growth, life, opacity) {
    if (typeof scene === 'undefined' || typeof THREE === 'undefined') return;
    // Same 18% -> 10% thinning, the same screen cap and the same eased
    // travel as _fxRing: this is Federation's and Imperial's expanding
    // front, and an uncapped one of these reached 495 world units of radius
    // on a 5-unit seed.
    //
    // PAINTED BAND, VERTEX-SIDE. `_fxRing` and `_fxShockwave` soften their
    // rims with a radial alpha texture, and that trick cannot be used here:
    // RingGeometry's UVs are planar, so a circular ramp follows circles, and
    // on a TRIANGLE ring the middle of each straight edge sits at half the
    // radius of its corners — the texture would erase the edges and leave
    // three glowing corners. Measured untextured on the Federation kill at
    // 250u, this layer alone carried a 140/255 scanline step (bar: < 40): it
    // was the single hardest edge left in any death in the game.
    //
    // So the band is ramped along the GEOMETRY instead: three radial vertex
    // rows (phiSegments 2) coloured black -> hue -> black. Under additive
    // blending black contributes nothing, so a vertex-colour ramp is an
    // alpha ramp that follows the polygon's own shape whatever that shape
    // is, and the crisp triangle/hexagon silhouette the factions are named
    // for survives with a glow instead of a wireframe outline. The band also
    // widens from 10% of the radius to 38%: the steepest a ramp can be is
    // peak / half-width, and 10% of a 26 px seed radius is a 1.3 px ramp.
    const _sd = Math.max(3, sides);
    const geo = new THREE.RingGeometry(radius * 0.72, radius * 1.10, _sd, 2);
    const _pc = new THREE.Color(color);
    const _n = geo.attributes.position.count;
    const _row = _sd + 1;                    // vertices per radial row
    const _col = new Float32Array(_n * 3);
    for (let v = 0; v < _n; v++) {
        // Rows are emitted inner -> outer, so row 1 of 3 is the band centre.
        const w = (Math.floor(v / _row) === 1) ? 1 : 0;
        _col[v*3] = _pc.r * w; _col[v*3+1] = _pc.g * w; _col[v*3+2] = _pc.b * w;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(_col, 3));
    const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, vertexColors: true,
        transparent: true, opacity: opacity || 0.85,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(center);
    const _spin = Math.random() * Math.PI;
    const _aim = () => {
        const c = (typeof camera !== 'undefined' && camera) ? camera : window.camera;
        if (c) ring.lookAt(c.position);
    };
    _aim();
    ring.rotation.z = _spin;
    ring.frustumCulled = false;
    ring.renderOrder = 73;
    ring.userData.__dbTris = Infinity;
    scene.add(ring);
    const sEnd = 1 + growth * life;      // exactly where the old linear ramp ended
    let t = 0, op = (opacity || 0.85), spin = _spin;
    explosionManager.addExplosion({
        update(dt) {
            t += dt;
            const k = Math.min(1, t / (life * 50));
            const lim = Math.min(sEnd, _fxMaxScale(ring.position, radius * 1.10));
            const sc = 1 + (Math.max(1, lim) - 1) * (1 - Math.pow(1 - k, 2.2));
            op -= ((opacity || 0.85) / life) * (dt / 50);
            _aim();
            ring.scale.set(sc, sc, 1);
            spin += 0.03 * (dt / 50);
            ring.rotation.z = spin;
            // Leading-edge ramp, as on _fxShockwave and _fxRing.
            mat.opacity = Math.max(0, op) * Math.min(1, k / 0.12);
            return op > 0;
        },
        cleanup() { scene.remove(ring); geo.dispose(); mat.dispose(); }
    });
}

// PEAK SPARK BRIGHTNESS. These are the smallest sprites in the kill (2.4-3.0
// world units, ~13 px at combat range) and the steepest a linear ramp can be
// is peak/radius, so the last few points of scanline step have to come off
// the peak rather than off the profile. 1.35x the size and 0.78 of the
// opacity keeps the same total light in the cloud while dropping its worst
// step by ~45% — measured 76 -> under the 40 bar, with the cloud still the
// brightest small thing in the frame.
const _FX_PARTICLE_OPA = 0.54;
function _fxParticles(center, count, color, size, speed, life, swirl) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
        pos[i*3] = center.x; pos[i*3+1] = center.y; pos[i*3+2] = center.z;
        const dir = new THREE.Vector3(
            (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)
        ).normalize().multiplyScalar(speed * (0.5 + Math.random()));
        if (swirl) {
            // Add a tangential component for a spiral look
            const tang = new THREE.Vector3(-dir.z, dir.y * 0.3, dir.x).multiplyScalar(swirl);
            dir.add(tang);
        }
        vel.push(dir);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // Offsets integrated separately from the written positions so the screen
    // cap can rescale the cloud as one, exactly as _fxEmberTail does — and,
    // for the same reason as the embers, seeded with a head start along each
    // particle's own velocity so the cloud is not a single stacked point on
    // its first frame.
    const off = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const head = 0.4 + Math.random() * 1.4;
        off[i*3] = vel[i].x * head; off[i*3+1] = vel[i].y * head; off[i*3+2] = vel[i].z * head;
    }
    // UNLIKE THE EMBERS, THESE HAVE NO DRAG: every particle flies at a
    // constant velocity for the whole life, so the terminal spread is
    // |v| * life = speed * 1.5 * (1 + swirl) * life — with the faction
    // recipes' own numbers that is tens of hull lengths, and it is what the
    // shrapnel measurements keep catching. Measured on a staged faction kill
    // at 250u, lit pixels reached 1,112 px from the detonation and p98
    // bbox-height hit 0.913 of the viewport, against a 0.35 rule, while every
    // layer of the generic burst was already inside the cap.
    const TERM = speed * 1.5 * (1 + (swirl || 0)) * Math.max(1, life);
    const mat = new THREE.PointsMaterial({
        // A MAP, because an unmapped PointsMaterial is a HARD SQUARE. These
        // are 2.4-3.0 world units wide with size attenuation on, which at
        // combat range is a ~13 px filled square with a vertical edge on all
        // four sides — the same untextured-polygon artifact the shards were
        // just taken off, in the layer that carries four factions' identity.
        map: _fxSparkTex(),
        color: color, size: size * 1.75, transparent: true, opacity: _FX_PARTICLE_OPA,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 72;
    pts.userData.__dbTris = Infinity;
    scene.add(pts);
    let l = 1.0;
    explosionManager.addExplosion({
        update(dt) {
            l -= (1 / life) * (dt / 50);
            mat.opacity = Math.max(0, l) * _FX_PARTICLE_OPA;
            const arr = geo.attributes.position.array;
            const f = dt / 50;
            const maxR = _fxMaxScale(center, 1);
            const shrink = (maxR !== Infinity && TERM > maxR) ? maxR / TERM : 1;
            for (let i = 0; i < count; i++) {
                off[i*3]   += vel[i].x * f;
                off[i*3+1] += vel[i].y * f;
                off[i*3+2] += vel[i].z * f;
                arr[i*3]   = center.x + off[i*3]   * shrink;
                arr[i*3+1] = center.y + off[i*3+1] * shrink;
                arr[i*3+2] = center.z + off[i*3+2] * shrink;
            }
            geo.attributes.position.needsUpdate = true;
            return l > 0;
        },
        cleanup() { scene.remove(pts); geo.dispose(); mat.dispose(); }
    });
}

function _fxLightning(center, count, color, len) {
    // A bolt runs from the centre out to `len`, so `len` IS its radius on
    // screen. The Sith recipe asks for 80 units, which at 250u is ~300 px
    // against a 250 px cap. Bolts are struck once and do not expand, so the
    // clamp can be applied here rather than per frame.
    const _maxR = _fxMaxScale(center, 1);
    if (_maxR !== Infinity && len > _maxR) len = _maxR;
    // A BOLT IS A STREAK, NOT A SOLID CYLINDER. This used to be a
    // CylinderGeometry(0.6, 0.1, len, 5) per bolt on an untextured
    // MeshBasicMaterial: a 5-sided prism ~1.2 world units thick, which at
    // 250u is a ~6 px bar of constant brightness with a vertical edge down
    // both sides — the same flat-polygon artifact the shards and the poly
    // rings were just taken off, in the layer that IS the Sith kill. Now it
    // is the same camera-facing streak sprite `_fxShards` uses, stretched
    // along the bolt and rotated into its screen-space direction each frame
    // so it never turns edge-on or presents a facet, on the falloff profile
    // that measures a sub-40 scanline step.
    for (let i = 0; i < count; i++) {
        const mat = new THREE.SpriteMaterial({
            map: _fxBlastTex(),
            color: color, transparent: true, opacity: 0.9,
            blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true
        });
        const bolt = new THREE.Sprite(mat);
        const dir = new THREE.Vector3(
            Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        bolt.position.copy(center).addScaledVector(dir, len * 0.5);
        bolt.scale.set(len, len * 0.075, 1);
        bolt.frustumCulled = false;
        bolt.renderOrder = 73;
        bolt.userData.__dbTris = Infinity;
        scene.add(bolt);
        let op = 0.9;
        explosionManager.addExplosion({
            update(dt) {
                op -= 0.12 * (dt / 50);
                const cam = (typeof camera !== 'undefined' && camera) ? camera : window.camera;
                if (cam && cam.matrixWorld) {
                    const e = cam.matrixWorld.elements;
                    const sx = dir.x * e[0] + dir.y * e[1] + dir.z * e[2];
                    const sy = dir.x * e[4] + dir.y * e[5] + dir.z * e[6];
                    mat.rotation = Math.atan2(sy, sx);
                }
                mat.opacity = Math.max(0, op);
                return op > 0;
            },
            cleanup() { scene.remove(bolt); mat.dispose(); }
        });
    }
}

// TINT-ONLY GARNISH. The recipes below were written when the blob WAS the
// explosion — 7-12 world units of opaque core sitting at the detonation
// point for the whole event. Now that every faction death is built on
// `_fxKillBurst`, that same blob is a second, dimmer, dumber copy of the
// fireball parked on top of the real one: measured, it is exactly what
// pinned the radial-brightness peak in dead-centre bin 0 at all 68 beats
// and clipped the middle to a flat 243/255 plateau. It is not deleted,
// because the faction hue arriving as a visible puff of colour is a real
// part of the tell — it is DEMOTED to a garnish: 42% of the radius (18% of
// the area) at 40% of the opacity, so it colours the burst instead of
// out-shining it.
const _FX_GARNISH_R = 0.42;
const _FX_GARNISH_A = 0.40;
function _fxTintBlob(center, radius, color, opacity, life, growth) {
    _fxSphere(center, radius * _FX_GARNISH_R, color, opacity * _FX_GARNISH_A, life, growth);
}

// Public: faction-flavored regular-kill explosion. galaxyId picks the
// recipe; scale multiplies all sizes (defaults to 1).
//
// THE ROUTING BUG THIS FIXES. Four rounds of work went into making a kill
// read as a detonation — a hot white core that holds above 230/255, two
// travelling shock fronts, a screen-space cap so a point-blank kill cannot
// own the frame, an ember tail that outlives the bang — and all of it lived
// in `_fxKillBurst`, which is reachable ONLY through createExplosionEffect.
// Every faction hostile in the game dies through THIS function, and this
// function called none of it. 45 s of instrumented demo combat counted
// createExplosionEffect 13 times and createFactionExplosion 0 times through
// the enemy-death path — the rework had landed on the function almost no
// kill calls, and a Sith death measured 0.72x the silhouette of the Sith.
//
// So the faction recipe is now a GARNISH ON the fixed burst rather than a
// replacement FOR it: the burst fires first, sized off the victim's own
// measured hull exactly as the generic kill is, tinted with the faction's
// three colours, and the recipe adds only what makes that faction
// recognisable — its shard shape, its ring shape, its particle swirl.
function createFactionExplosion(position, galaxyId, scale) {
    if (!position || typeof scene === 'undefined' || typeof THREE === 'undefined') return;
    const center = position.clone ? position.clone()
                 : new THREE.Vector3(position.x, position.y, position.z);
    const S = scale || 1;
    const cfg = FACTION_EXPLOSION[galaxyId] || FACTION_EXPLOSION[0];

    // THE KILL ITSELF — same burst, same cap, same hull-relative sizing as
    // every other death in the game, wearing this faction's colours.
    _fxKillBurst(center, _fxVictimWorldLen(null, center) * S,
                 { core: cfg.core, front: cfg.accent, ember: cfg.spark });

    switch (cfg.style) {
        case 'electric': // Federation — white core + crisp TRIANGULAR ring + blue sparks
            _fxTintBlob(center, 7 * S, cfg.core, 1.0, 14, 2.6);
            _fxPolyRing(center, 5 * S, cfg.accent, 3, 7, 14, 0.9);  // triangle
            _fxParticles(center, 26, cfg.spark, 2.4 * S, 7 * S, 16, 0);
            break;
        case 'shrapnel': // Klingon — jagged TETRAHEDRON shrapnel double-burst
            _fxTintBlob(center, 8 * S, cfg.core, 0.95, 12, 2.2);
            _fxShards(center, 26, cfg.spark, 4 * S, 12 * S, 16, 'tetra');
            setTimeout(() => {
                _fxTintBlob(center, 11 * S, cfg.accent, 0.8, 14, 2.8);
                _fxShards(center, 18, cfg.core, 3 * S, 9 * S, 14, 'tetra');
            }, 140);
            break;
        case 'ionbloom': // Rebel — slow green bloom + lingering haze
            _fxTintBlob(center, 9 * S, cfg.accent, 0.75, 26, 1.6);
            _fxTintBlob(center, 5 * S, cfg.core, 0.9, 18, 2.0);
            _fxParticles(center, 30, cfg.spark, 3.0 * S, 4 * S, 28, 0);
            break;
        case 'singularity': // Romulan — implode then green outward flash
            _fxParticles(center, 30, cfg.accent, 2.4 * S, -6 * S, 10, 0); // inward
            setTimeout(() => {
                _fxTintBlob(center, 6 * S, cfg.core, 1.0, 12, 3.4);
                _fxRing(center, 4 * S, cfg.spark, 9, 14, 0.85);
            }, 220);
            break;
        case 'tieblast': // Imperial — white flash + HEXAGONAL twin rings
            _fxTintBlob(center, 9 * S, cfg.core, 1.0, 9, 3.0);
            _fxPolyRing(center, 6 * S, cfg.accent, 6, 11, 16, 0.8);  // hexagon
            _fxPolyRing(center, 6 * S, cfg.spark, 6, 6, 16, 0.5);
            break;
        case 'spiral': // Cardassian — swirling orange particles + spinning shards
            // 6 -> 8u. Cardassian was the only faction whose detonation did
            // not clear 3x its victim's own silhouette at 250u (measured
            // 2.49x): it carries its identity in particles and shards and
            // had the leanest core of the eight, while its hull presents the
            // widest broadside profile in the roster (3,856 lit px, against
            // 1,000-3,300 for the rest). 8u is simply its peers' figure
            // (Klingon 8, Imperial 9, Rebel 9) and does not touch the swirl
            // that makes it a Cardassian kill.
            _fxTintBlob(center, 8 * S, cfg.core, 0.9, 14, 2.2);
            _fxParticles(center, 36, cfg.accent, 2.6 * S, 6 * S, 22, 3.2);
            _fxShards(center, 12, cfg.spark, 3 * S, 5 * S, 20, 'tetra');
            break;
        case 'darkenergy': // Sith — red core + OCTAHEDRON shards + lightning + smoke
            _fxTintBlob(center, 7 * S, cfg.core, 1.0, 14, 2.4);
            _fxLightning(center, 8, cfg.spark, 80 * S);
            _fxShards(center, 16, cfg.accent, 4 * S, 8 * S, 18, 'octa');
            _fxTintBlob(center, 12 * S, cfg.accent, 0.45, 30, 2.0);
            break;
        case 'goldrings': // Vulcan — small concentric CIRCULAR gold rings
            // Halved per request: Vulcan kills are a compact pop, not a
            // big bloom. Initial radius AND expansion growth both x0.5.
            _fxTintBlob(center, 1.75 * S, cfg.core, 0.9, 14, 0.8);
            _fxRing(center, 1.5 * S, cfg.accent, 2, 16, 0.75);
            setTimeout(() => _fxRing(center, 1.5 * S, cfg.spark, 2.5, 16, 0.6), 130);
            setTimeout(() => _fxRing(center, 1.5 * S, cfg.accent, 3, 16, 0.5), 280);
            break;
        default:
            _fxTintBlob(center, 7 * S, cfg.core, 1.0, 14, 2.5);
            _fxParticles(center, 24, cfg.spark, 2.4 * S, 7 * S, 14, 0);
    }
    // BURNING WRECKAGE — the ~1.2 s of embers that outlive the bang, so the
    // spot where a ship used to be does not go black while the player is
    // still turning to look at it. This used to be a second Points system
    // bolted on here at a fixed 14 u; `_fxKillBurst` above now supplies it,
    // sized off the victim's hull and already tinted with cfg.spark, so the
    // faction path costs one draw call less than it did.
    try { playSound('explosion'); } catch (e) {}
}
if (typeof window !== 'undefined') window.createFactionExplosion = createFactionExplosion;

// =============================================================================
// HIT SPARKS — small impact burst when a laser/missile strikes a hostile
// that SURVIVES the hit (the destruction explosion is separate). Kept
// cheap because sustained fire calls this many times per second.
// =============================================================================
function createHitSparks(worldPos, tint, scale) {
    if (!worldPos || typeof scene === 'undefined' || typeof THREE === 'undefined') return;
    const center = worldPos.clone ? worldPos.clone()
                 : new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
    // Match the hit ship's size (regular enemies are halved via
    // ENEMY_SCALE_FACTOR; bosses pass 1). Defaults to 1 if unspecified.
    const S = (typeof scale === 'number' && scale > 0) ? scale : 1;

    // Bright short-lived flash at the impact point.
    const flashGeo = new THREE.SphereGeometry(3 * S, 8, 6);
    const flashMat = new THREE.MeshBasicMaterial({
        color: 0xffffcc, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.copy(center);
    flash.frustumCulled = false;
    scene.add(flash);
    let fs = 1, fop = 0.95;
    explosionManager.addExplosion({
        update(dt) {
            fs += 0.9 * (dt / 50);
            fop -= 0.18 * (dt / 50);
            flash.scale.set(fs, fs, fs);
            flashMat.opacity = Math.max(0, fop);
            return fop > 0;
        },
        cleanup() { scene.remove(flash); flashGeo.dispose(); flashMat.dispose(); }
    });

    // ~12 spark points spraying outward, faction-tinted.
    const N = 12;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const vel = [];
    for (let i = 0; i < N; i++) {
        pos[i*3] = center.x; pos[i*3+1] = center.y; pos[i*3+2] = center.z;
        vel.push(new THREE.Vector3(
            Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
        ).normalize().multiplyScalar((3 + Math.random() * 5) * S));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        color: tint || 0xffaa33, size: 2.4 * S, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    let life = 1.0;
    explosionManager.addExplosion({
        update(dt) {
            life -= 0.10 * (dt / 50);
            mat.opacity = Math.max(0, life);
            const arr = geo.attributes.position.array;
            const f = dt / 50;
            for (let i = 0; i < N; i++) {
                arr[i*3]   += vel[i].x * f;
                arr[i*3+1] += vel[i].y * f;
                arr[i*3+2] += vel[i].z * f;
            }
            geo.attributes.position.needsUpdate = true;
            return life > 0;
        },
        cleanup() { scene.remove(pts); geo.dispose(); mat.dispose(); }
    });
}
if (typeof window !== 'undefined') window.createHitSparks = createHitSparks;

// =============================================================================
// BOSS / GUARDIAN EXPLOSION
// A larger, multi-stage detonation reserved for boss and elite-guardian
// kills. Three escalating waves:
//   t=0     - core fireball + faction-colored shockwave ring
//   t=200ms - secondary detonation, ~50% larger
//   t=450ms - massive expanding plasma bubble + 250-particle burst
// The whole sequence lasts ~2.5s and uses additive blending so it
// reads brightly against any backdrop.
// =============================================================================
function createBossExplosion(position, options) {
    if (!position || typeof scene === 'undefined') return;
    options = options || {};
    const factionColor = options.color || 0xff5522;
    const scaleMul = options.scale || 1.0;
    const center = position.clone ? position.clone() : new THREE.Vector3(position.x, position.y, position.z);

    function _addAdditiveSphere(radius, color, opacity, life, growth) {
        const geo = new THREE.SphereGeometry(radius, 24, 16);
        const mat = new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: opacity,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(center);
        mesh.frustumCulled = false;
        scene.add(mesh);
        let scl = 1;
        let op = opacity;
        explosionManager.addExplosion({
            update(dt) {
                scl += growth * (dt / 50);
                op  -= (opacity / life) * (dt / 50);
                mesh.scale.set(scl, scl, scl);
                mat.opacity = Math.max(0, op);
                return op > 0;
            },
            cleanup() {
                scene.remove(mesh);
                geo.dispose();
                mat.dispose();
            }
        });
    }

    function _addShockRing(color, radius, growth, life) {
        const geo = new THREE.RingGeometry(radius, radius * 1.15, 48);
        const mat = new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: 0.85,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const ring = new THREE.Mesh(geo, mat);
        ring.position.copy(center);
        if (typeof camera !== 'undefined') ring.lookAt(camera.position);
        ring.frustumCulled = false;
        scene.add(ring);
        let scl = 1;
        let op = 0.85;
        explosionManager.addExplosion({
            update(dt) {
                scl += growth * (dt / 50);
                op  -= (0.85 / life) * (dt / 50);
                ring.scale.set(scl, scl, 1);
                mat.opacity = Math.max(0, op);
                return op > 0;
            },
            cleanup() {
                scene.remove(ring);
                geo.dispose();
                mat.dispose();
            }
        });
    }

    // Tumbling debris chunks — small lit boxes that fly out and spin,
    // for a "the ship is coming apart" read on top of the particle haze.
    function _addDebrisChunks(count, color, speed, life) {
        const chunks = [];
        for (let i = 0; i < count; i++) {
            const sz = (3 + Math.random() * 5) * scaleMul;
            const geo = new THREE.BoxGeometry(sz, sz * (0.5 + Math.random()), sz * (0.4 + Math.random()));
            const mat = new THREE.MeshBasicMaterial({
                color: color, transparent: true, opacity: 1,
                blending: THREE.AdditiveBlending, depthWrite: false
            });
            const m = new THREE.Mesh(geo, mat);
            m.position.copy(center);
            m.frustumCulled = false;
            scene.add(m);
            chunks.push({
                mesh: m, geo: geo, mat: mat,
                vel: new THREE.Vector3(
                    (Math.random() - 0.5) * speed,
                    (Math.random() - 0.5) * speed,
                    (Math.random() - 0.5) * speed),
                spin: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.4,
                    (Math.random() - 0.5) * 0.4,
                    (Math.random() - 0.5) * 0.4)
            });
        }
        let l = 1.0;
        explosionManager.addExplosion({
            update(dt) {
                l -= (1 / life) * (dt / 50);
                const f = dt / 50;
                for (let i = 0; i < chunks.length; i++) {
                    const c = chunks[i];
                    c.mesh.position.addScaledVector(c.vel, f);
                    c.mesh.rotation.x += c.spin.x * f;
                    c.mesh.rotation.y += c.spin.y * f;
                    c.mesh.rotation.z += c.spin.z * f;
                    c.mat.opacity = Math.max(0, l);
                }
                return l > 0;
            },
            cleanup() {
                for (let i = 0; i < chunks.length; i++) {
                    scene.remove(chunks[i].mesh);
                    chunks[i].geo.dispose();
                    chunks[i].mat.dispose();
                }
            }
        });
    }

    // ── WAVE 0 (t=0): blinding white flash ───────────────────────────
    // A huge, very brief white sphere that whites out the immediate
    // area — sells the "detonation" before the fireball blooms.
    _addAdditiveSphere(180 * scaleMul, 0xffffff, 1.0, 7, 1.4);

    // ── WAVE 1 (t=0): core fireball + triple shockwave + lightning ──
    _addAdditiveSphere(70 * scaleMul, 0xffeecc, 1.0, 18, 3.6);   // white-hot core
    _addAdditiveSphere(95 * scaleMul, 0xff7733, 0.95, 22, 3.0);  // orange shell
    _addShockRing(0xffffff,    26 * scaleMul, 9, 14);
    _addShockRing(factionColor, 34 * scaleMul, 6, 18);
    _addShockRing(0xffaa55,    20 * scaleMul, 12, 22);
    if (typeof _fxLightning === 'function') {
        _fxLightning(center, 10, factionColor, 120 * scaleMul);
    }
    _addDebrisChunks(22, 0xffcc88, 9 * scaleMul, 34);

    // ── WAVE 2 (t=180ms): secondary detonation, bigger ──────────────
    setTimeout(() => {
        _addAdditiveSphere(120 * scaleMul, factionColor, 0.85, 24, 3.4);
        _addAdditiveSphere(60 * scaleMul, 0xffffff, 0.9, 12, 3.0);
        _addShockRing(0xffaa55, 56 * scaleMul, 9, 22);
        _addShockRing(factionColor, 44 * scaleMul, 13, 24);
        if (typeof _fxLightning === 'function') {
            _fxLightning(center, 8, 0xffffff, 150 * scaleMul);
        }
        if (typeof playSound === 'function') {
            try { playSound('explosion'); } catch (e) {}
            try { playSound('death_boom'); } catch (e) {}
        }
    }, 180);

    // ── WAVE 3 (t=420ms): massive plasma bubble + 360-particle burst
    setTimeout(() => {
        _addAdditiveSphere(170 * scaleMul, 0xaa44ff, 0.55, 32, 4.2);
        _addAdditiveSphere(120 * scaleMul, factionColor, 0.4, 30, 4.6);

        const partCount = 360;
        const partGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(partCount * 3);
        const velocities = [];
        for (let i = 0; i < partCount; i++) {
            positions[i*3] = center.x;
            positions[i*3+1] = center.y;
            positions[i*3+2] = center.z;
            const d = new THREE.Vector3(
                Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
            ).normalize().multiplyScalar((4 + Math.random() * 9) * scaleMul);
            velocities.push(d);
        }
        partGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const partMat = new THREE.PointsMaterial({
            color: 0xffcc66, size: 7 * scaleMul, transparent: true, opacity: 1,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const particles = new THREE.Points(partGeo, partMat);
        particles.frustumCulled = false;
        scene.add(particles);
        _addDebrisChunks(18, factionColor, 7 * scaleMul, 40);

        let life = 1.0;
        explosionManager.addExplosion({
            update(dt) {
                life -= 0.02 * (dt / 50);
                partMat.opacity = Math.max(0, life);
                const arr = partGeo.attributes.position.array;
                const f = dt / 50;
                for (let i = 0; i < partCount; i++) {
                    arr[i*3]   += velocities[i].x * f;
                    arr[i*3+1] += velocities[i].y * f;
                    arr[i*3+2] += velocities[i].z * f;
                }
                partGeo.attributes.position.needsUpdate = true;
                return life > 0;
            },
            cleanup() {
                scene.remove(particles);
                partGeo.dispose();
                partMat.dispose();
            }
        });

        if (typeof playSound === 'function') {
            try { playSound('death_boom'); } catch (e) {}
            try { playSound('death_rumble'); } catch (e) {}
        }
    }, 420);

    // ── WAVE 4 (t=750ms): final expanding faction ring + afterglow ──
    setTimeout(() => {
        _addShockRing(factionColor, 70 * scaleMul, 16, 26);
        _addAdditiveSphere(220 * scaleMul, factionColor, 0.3, 34, 3.4);
        if (typeof playSound === 'function') {
            try { playSound('explosion'); } catch (e) {}
        }
    }, 750);

    // Layered launch audio
    if (typeof playSound === 'function') {
        try { playSound('explosion'); } catch (e) {}
        try { playSound('damage');    } catch (e) {}
        try { playSound('death_boom'); } catch (e) {}
    }
}

// =============================================================================
// MASSIVE BORG CUBE EXPLOSION - For 100 HP BORG destruction
// =============================================================================

function createMassiveBorgExplosion(position, cubeSize = 30) {
    console.log(`💥 MASSIVE BORG EXPLOSION at ${position}, cube size: ${cubeSize}`);

    // Scale explosion to cube size - MUCH LARGER explosions
    const explosionScale = cubeSize / 30; // Scale factor relative to standard drone
    const baseExplosionSize = 300 * explosionScale;  // 3x larger base
    const secondaryExplosionSize = 250 * explosionScale;  // 3x larger secondary

    // Create HUGE expanding sphere explosion
    const explosionGeo = new THREE.SphereGeometry(baseExplosionSize, 32, 32);
    const explosionMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00, // Green BORG color
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
    });
    const explosion = new THREE.Mesh(explosionGeo, explosionMat);
    explosion.position.copy(position);
    scene.add(explosion);

    // Secondary orange/red explosion sphere
    const explosionGeo2 = new THREE.SphereGeometry(secondaryExplosionSize, 32, 32);
    const explosionMat2 = new THREE.MeshBasicMaterial({
        color: 0xff4400,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    const explosion2 = new THREE.Mesh(explosionGeo2, explosionMat2);
    explosion2.position.copy(position);
    scene.add(explosion2);

    // MASSIVE particle burst (1000 particles scaled by cube size)
    const particleCount = Math.floor(1000 * explosionScale);
    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleVelocities = [];

    const particleSpeed = 100 * explosionScale;  // Faster particles
    for (let i = 0; i < particleCount; i++) {
        particlePositions[i * 3] = position.x;
        particlePositions[i * 3 + 1] = position.y;
        particlePositions[i * 3 + 2] = position.z;

        // Random velocity in all directions (scaled)
        particleVelocities.push({
            x: (Math.random() - 0.5) * particleSpeed,
            y: (Math.random() - 0.5) * particleSpeed,
            z: (Math.random() - 0.5) * particleSpeed
        });
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    const particleMaterial = new THREE.PointsMaterial({
        color: 0x00ff00,
        size: 15 * explosionScale,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    // Add main explosion to manager
    let scale = 1;
    let opacity1 = 0.9;
    let opacity2 = 0.8;
    let particleOpacity = 1.0;

    explosionManager.addExplosion({
        update(deltaTime) {
            // Update scales and opacities
            scale += 3.0 * (deltaTime / 50);
            opacity1 -= 0.03 * (deltaTime / 50);
            opacity2 -= 0.025 * (deltaTime / 50);
            particleOpacity -= 0.04 * (deltaTime / 50);

            explosion.scale.set(scale, scale, scale);
            explosion2.scale.set(scale * 1.2, scale * 1.2, scale * 1.2);
            explosionMat.opacity = Math.max(0, opacity1);
            explosionMat2.opacity = Math.max(0, opacity2);
            particleMaterial.opacity = Math.max(0, particleOpacity);

            // Update particle positions
            const positions = particleGeometry.attributes.position.array;
            const deltaFactor = deltaTime / 50;
            for (let i = 0; i < particleCount; i++) {
                positions[i * 3] += particleVelocities[i].x * deltaFactor;
                positions[i * 3 + 1] += particleVelocities[i].y * deltaFactor;
                positions[i * 3 + 2] += particleVelocities[i].z * deltaFactor;
            }
            particleGeometry.attributes.position.needsUpdate = true;

            return opacity1 > 0;
        },

        cleanup() {
            scene.remove(explosion);
            scene.remove(explosion2);
            scene.remove(particles);
            explosionGeo.dispose();
            explosionGeo2.dispose();
            explosionMat.dispose();
            explosionMat2.dispose();
            particleGeometry.dispose();
            particleMaterial.dispose();
        }
    });

    // Create shockwave rings with staggered timing
    for (let i = 0; i < 5; i++) {
        const ringDelay = i * 200;
        let ringCreated = false;
        let ringDelayElapsed = 0;

        explosionManager.addExplosion({
            update(deltaTime) {
                ringDelayElapsed += deltaTime;

                // Wait for delay before creating ring
                if (!ringCreated && ringDelayElapsed >= ringDelay) {
                    ringCreated = true;
                    const ringGeo = new THREE.TorusGeometry(100, 5, 16, 32);
                    const ringMat = new THREE.MeshBasicMaterial({
                        color: 0x00ff00,
                        transparent: true,
                        opacity: 0.7,
                        blending: THREE.AdditiveBlending
                    });
                    const ring = new THREE.Mesh(ringGeo, ringMat);
                    ring.position.copy(position);
                    ring.rotation.x = Math.random() * Math.PI;
                    ring.rotation.y = Math.random() * Math.PI;
                    scene.add(ring);

                    // Store ring data for animation
                    this.ring = ring;
                    this.ringGeo = ringGeo;
                    this.ringMat = ringMat;
                    this.ringScale = 1;
                    this.ringOpacity = 0.7;
                }

                // Animate ring
                if (ringCreated && this.ring) {
                    this.ringScale += 2 * (deltaTime / 50);
                    this.ringOpacity -= 0.05 * (deltaTime / 50);
                    this.ring.scale.set(this.ringScale, this.ringScale, this.ringScale);
                    this.ringMat.opacity = Math.max(0, this.ringOpacity);

                    return this.ringOpacity > 0;
                }

                return true; // Keep alive until ring is created
            },

            cleanup() {
                if (this.ring) {
                    scene.remove(this.ring);
                    this.ringGeo.dispose();
                    this.ringMat.dispose();
                }
            }
        });
    }

    playSound('explosion');
}

// =============================================================================
// FIREWORK CELEBRATION SYSTEM - Add this to game-controls.js
// =============================================================================

function createFireworkCelebration() {
    console.log('ðŸŽ† Boss defeated! Creating firework celebration!');
    
    // Create multiple firework bursts with delay
    for (let burst = 0; burst < 5; burst++) {
        setTimeout(() => {
            createFireworkBurst();
        }, burst * 300); // Stagger bursts every 300ms
    }
}

function createFireworkBurst() {
    const colors = [
        '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7',
        '#dda0dd', '#ffa500', '#ff69b4', '#00ced1', '#32cd32'
    ];
    
    // Random position for this burst (not too close to edges)
    const burstX = Math.random() * (window.innerWidth * 0.6) + (window.innerWidth * 0.2);
    const burstY = Math.random() * (window.innerHeight * 0.5) + (window.innerHeight * 0.2);
    
    // Create 15-25 particles per burst
    const particleCount = 15 + Math.floor(Math.random() * 10);
    
    for (let i = 0; i < particleCount; i++) {
        createFireworkParticle(burstX, burstY, colors[Math.floor(Math.random() * colors.length)]);
    }
}

function createFireworkParticle(startX, startY, color) {
    const particle = document.createElement('div');
    particle.className = 'firework-particle';
    
    // Random size between 4-8px
    const size = 4 + Math.random() * 4;
    
    // Random direction and speed
    const angle = Math.random() * Math.PI * 2;
    const speed = 100 + Math.random() * 150; // pixels to travel
    const duration = 1000 + Math.random() * 500; // animation duration
    
    // Calculate end position
    const endX = startX + Math.cos(angle) * speed;
    const endY = startY + Math.sin(angle) * speed;
    
    // Style the particle
    particle.style.cssText = `
        position: fixed !important;
        left: ${startX}px;
        top: ${startY}px;
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        border-radius: 50% !important;
        pointer-events: none !important;
        z-index: 1000 !important;
        box-shadow: 0 0 ${size * 2}px ${color};
        opacity: 1;
        transform: scale(1);
    `;
    
    document.body.appendChild(particle);
    
    // Animate the particle
    let startTime = null;
    function animateParticle(timestamp) {
        if (!startTime) startTime = timestamp;
        const progress = (timestamp - startTime) / duration;
        
        if (progress >= 1) {
            // Animation complete, remove particle
            if (particle.parentNode) {
                particle.parentNode.removeChild(particle);
            }
            return;
        }
        
        // Easing function for natural deceleration
        const easeOut = 1 - Math.pow(1 - progress, 3);
        
        // Update position
        const currentX = startX + (endX - startX) * easeOut;
        const currentY = startY + (endY - startY) * easeOut + (progress * progress * 50); // Add gravity
        
        // Update opacity and scale (fade and shrink over time)
        const opacity = 1 - progress;
        const scale = 1 - (progress * 0.3);
        
        particle.style.left = currentX + 'px';
        particle.style.top = currentY + 'px';
        particle.style.opacity = opacity;
        particle.style.transform = `scale(${scale})`;
        
        requestAnimationFrame(animateParticle);
    }
    
    requestAnimationFrame(animateParticle);
}

// Enhanced version with sound effect (if you want audio)
function createFireworkCelebrationWithSound() {
    // Play celebration sound if available
    if (typeof playSound === 'function') {
        playSound('achievement'); // or create a special 'celebration' sound
    }
    
    createFireworkCelebration();
}

// Shared fading-beam registry. Laser beams register here and fade on
// the main rAF loop (updateFadingBeams) instead of each spawning its
// own setInterval — in sustained combat the per-beam timers were the
// dominant off-frame cost. ~0.22 opacity/frame ≈ 75 ms at 60 fps.
const _fadingBeams = [];
function _registerFadingBeam(d) {
    if (d.opacity === undefined) d.opacity = (d.material && d.material.opacity) || 1.0;
    _fadingBeams.push(d);
}
function updateFadingBeams() {
    if (!_fadingBeams.length) return;
    for (let k = _fadingBeams.length - 1; k >= 0; k--) {
        const d = _fadingBeams[k];
        d.opacity -= 0.22;
        const o = Math.max(0, d.opacity);
        if (d.material) d.material.opacity = o;
        if (d.glowMaterial) d.glowMaterial.opacity = o * (d.glowFactor || 0.4);
        if (d.laserData) d.laserData.opacity = d.opacity;
        if (d.enemyLaserData) d.enemyLaserData.opacity = d.opacity;
        if (d.opacity <= 0) {
            if (d.enemyLaserData && typeof activeEnemyLasers !== 'undefined') {
                const i = activeEnemyLasers.indexOf(d.enemyLaserData);
                if (i > -1) activeEnemyLasers.splice(i, 1);
            }
            if (d.laserData && typeof activeLasers !== 'undefined') {
                const i = activeLasers.indexOf(d.laserData);
                if (i > -1) activeLasers.splice(i, 1);
            }
            if (d.beam) scene.remove(d.beam);
            if (d.extra) d.extra.forEach(m => scene.remove(m));
            if (d.geometry && d.geometry.dispose) d.geometry.dispose();
            if (d.material && d.material.dispose) d.material.dispose();
            if (d.glowGeometry && d.glowGeometry.dispose) d.glowGeometry.dispose();
            if (d.glowMaterial && d.glowMaterial.dispose) d.glowMaterial.dispose();
            if (d.disposeExtra) d.disposeExtra();
            _fadingBeams.splice(k, 1);
        }
    }
}
if (typeof window !== 'undefined') window.updateFadingBeams = updateFadingBeams;

// RESTORED: Working laser beam from game-controls13.js (FIXES POSITIONING)
// NOW TRACKS WITH SHIP for player lasers (1st person / cockpit view)
function createLaserBeam(startPos, endPos, color = '#00ff96', isPlayer = true) {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined') return;

    try {
        const direction = new THREE.Vector3().subVectors(endPos, startPos);
        const length = direction.length();

        // Enemy lasers get the same thick/bright treatment as wingman lasers
        // for visibility. Player lasers stay slim so they don't block the view.
        // Enemy beams slimmed toward the player's beam profile — still
        // a touch thicker so incoming fire reads, but no longer the
        // heavy 0.9/2.6 tube.
        const coreRadius = isPlayer ? 0.2 : 0.32;
        const glowRadius = isPlayer ? 0.4 : 0.85;
        const coreOpacity = isPlayer ? 0.8 : 1.0;
        const glowOpacity = isPlayer ? 0.3 : 0.5;

        const laserGeometry = new THREE.CylinderGeometry(coreRadius, coreRadius, length, 8);
        const laserMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: coreOpacity
        });

        const laserBeam = new THREE.Mesh(laserGeometry, laserMaterial);
        // Render enemy lasers in front of background nebulae / asteroid
        // belts / CMB starfields so beams from BH-galaxy hostiles aren't
        // hidden behind whatever cosmic feature happens to lie along the
        // line of sight. Player lasers render normally.
        if (!isPlayer) {
            laserBeam.renderOrder = 70;
            laserBeam.frustumCulled = false;
        }

        // Better positioning and orientation (RESTORED)
        laserBeam.position.copy(startPos);

        // BUGFIX: clone `direction` before normalizing. The old code
        // called direction.normalize() which mutates the vector to
        // unit length, so the later `direction.clone().multiplyScalar(
        // 0.5)` offset was only 0.5 units instead of half the beam
        // length. The cylinder (length = full start→end distance) then
        // sat centered on the enemy and extended HALF ITS LENGTH IN
        // BOTH DIRECTIONS — i.e. the beam appeared to fire backwards
        // out of the enemy too. _fireWingmanLaser does it correctly
        // with a clone; mirror that here so enemy beams travel only
        // from the enemy toward the target.
        const dirNorm = direction.clone().normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const axis = new THREE.Vector3().crossVectors(up, dirNorm);
        const angle = Math.acos(up.dot(dirNorm));

        if (axis.length() > 0.001) {
            axis.normalize();
            laserBeam.setRotationFromAxisAngle(axis, angle);
        } else if (direction.y < 0) {
            laserBeam.rotateX(Math.PI);
        }

        // Offset by HALF the full-length direction so the cylinder's
        // center lands at the midpoint between start and end.
        const offset = direction.clone().multiplyScalar(0.5);
        laserBeam.position.add(offset);

        // Add glow effect
        const glowGeometry = new THREE.CylinderGeometry(glowRadius, glowRadius, length, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: glowOpacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        laserBeam.add(glow);
        
        scene.add(laserBeam);
        
        // Track lasers.  Player beams go into activeLasers (they follow
        // ship movement), enemy beams go into activeEnemyLasers (just for
        // cleanup visibility tracking).
        let laserData = null;
        let enemyLaserData = null;
        if (isPlayer && typeof camera !== 'undefined') {
            laserData = {
                beam: laserBeam,
                geometry: laserGeometry,
                material: laserMaterial,
                glowGeometry: glowGeometry,
                glowMaterial: glowMaterial,
                lastCameraPos: camera.position.clone(),
                opacity: 0.8
            };
            if (activeLasers.length >= LASER_ARRAY_CAP) {
                const old = activeLasers.shift();
                if (old && old.beam) { old.beam.visible = false; }
            }
            activeLasers.push(laserData);
        } else {
            enemyLaserData = {
                beam: laserBeam,
                geometry: laserGeometry,
                material: laserMaterial,
                glowGeometry: glowGeometry,
                glowMaterial: glowMaterial,
                opacity: 0.8,
                createdAt: Date.now()
            };
            if (activeEnemyLasers.length >= LASER_ARRAY_CAP) {
                const old = activeEnemyLasers.shift();
                if (old && old.beam) { old.beam.visible = false; }
            }
            activeEnemyLasers.push(enemyLaserData);
        }

        // Fade. Both player AND enemy beams vanish fast (~75 ms) — just
        // a muzzle flash. Driven by the shared rAF updater
        // (updateFadingBeams) instead of a per-beam setInterval — every
        // shot used to spawn its own timer, which stacked up badly in
        // sustained combat.
        const startOpacity = isPlayer ? 0.8 : 1.0;
        laserMaterial.opacity = startOpacity;
        glowMaterial.opacity = startOpacity * (isPlayer ? 0.4 : 0.55);
        _registerFadingBeam({
            beam: laserBeam, geometry: laserGeometry, material: laserMaterial,
            glowGeometry: glowGeometry, glowMaterial: glowMaterial,
            glowFactor: isPlayer ? 0.4 : 0.55,
            laserData: laserData, enemyLaserData: enemyLaserData,
            opacity: startOpacity
        });

    } catch (error) {
        console.warn('Failed to create laser beam:', error);
    }
}

// 3RD PERSON LASER: Fire from ship wing tips with full-length beam to target
// WING GUNS — canonical ship-local weapon anchor points, transformed through
// the ship's RENDERED transform (position, model attitude, scale). One source
// of truth for laser origins, muzzle flashes and the charge glow, so they all
// stay glued to the wings across every view state: cinematic camera lag,
// fixed-step interpolation, warp framing pull-back (ship drawn smaller), and
// any model scale. Local offsets are derived ONCE from the model's local
// bounds; +Z is the model's nose.
function getPlayerWingGuns() {
    const ship = window.cameraState && window.cameraState.playerShipMesh;
    if (!ship || typeof THREE === 'undefined') return null;
    const ud = ship.userData;
    if (!ud._wingGunsLocal) {
        const box = new THREE.Box3().setFromObject(ship);
        const size = box.getSize(new THREE.Vector3());
        const s = ship.scale.x || 1;
        if (!(size.x > 0.001)) return null;   // model not hydrated yet
        ud._wingGunsLocal = {
            spread: (size.x * 0.35) / s,      // ± along local X (wingtips)
            up: -2 / s,                       // slightly under the hull
            fwd: (size.z * 0.15) / s,         // toward the +Z nose
        };
    }
    // Rendered transform when fresh (≤1 frame old), live mesh otherwise
    const fresh = typeof window.__renderedShipFrame === 'number' &&
        (gameState.frameCount - window.__renderedShipFrame) <= 1 && window.__renderedShipPos;
    const pos = fresh ? window.__renderedShipPos : ship.position;
    const att = fresh ? window.__renderedShipAtt : ship.quaternion;
    const s = (fresh && window.__renderedShipScale) ? window.__renderedShipScale : (ship.scale.x || 1);
    const g = ud._wingGunsLocal;
    const mk = (side) => new THREE.Vector3(side * g.spread * s, g.up * s, g.fwd * s)
        .applyQuaternion(att).add(pos);
    return { left: mk(-1), right: mk(1) };
}
if (typeof window !== 'undefined') window.getPlayerWingGuns = getPlayerWingGuns;

function createThirdPersonLasers(playerShip, targetPosition) {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined') return;
    
    try {
        // Beam origins come from the canonical ship-local WING GUNS,
        // transformed through the ship's RENDERED transform (position,
        // model attitude, scale) — see getPlayerWingGuns(). This keeps the
        // beams on the drawn wingtips through cinematic camera lag, the
        // warp framing pull-back (ship rendered smaller/farther), banks,
        // and any model scale — instead of view-space constants that only
        // matched the default chase framing.
        const guns = getPlayerWingGuns();
        let leftWing, rightWing;
        if (guns) {
            leftWing = guns.left;
            rightWing = guns.right;
        } else {
            // Model not hydrated yet — legacy camera-space fallback
            const camQuat = camera.quaternion;
            const liveOffset = (typeof cameraState !== 'undefined' &&
                                cameraState.normalThirdPersonOffset)
                ? cameraState.normalThirdPersonOffset
                : new THREE.Vector3(0, -4, -14);
            const shipPos = camera.position.clone().add(liveOffset.clone().applyQuaternion(camQuat));
            leftWing = shipPos.clone().add(new THREE.Vector3(-5, -2, -2).applyQuaternion(camQuat));
            rightWing = shipPos.clone().add(new THREE.Vector3(5, -2, -2).applyQuaternion(camQuat));
        }
        
        // Create muzzle flash at wing tips
        createMuzzleFlash(leftWing.clone());
        createMuzzleFlash(rightWing.clone());

        // Charged blast = YELLOW beams from the wings + bright bolts from the
        // CHARGE CENTER (between the two wing glows), scaled by charge power.
        const _charged = (typeof gameState !== 'undefined' && gameState._chargedShot);
        const _beamCol = _charged ? '#ffdd33' : '#00ff96';
        createThirdPersonBeam(leftWing, targetPosition, _beamCol);
        createThirdPersonBeam(rightWing, targetPosition, _beamCol);
        if (_charged) {
            const _center = leftWing.clone().add(rightWing).multiplyScalar(0.5);
            createMuzzleFlash(_center.clone());
            const _bolts = 1 + Math.round((gameState._chargedPower || 0.5) * 3);
            for (let _b = 0; _b < _bolts; _b++) createThirdPersonBeam(_center, targetPosition, '#ffee66');
        }
        
    } catch (error) {
        console.warn('Failed to create third-person lasers:', error);
    }
}

// Full-length laser beam for 3rd person - NOW TRACKS WITH SHIP MOVEMENT
function createThirdPersonBeam(startPos, endPos, color) {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined') return;
    
    try {
        const direction = new THREE.Vector3().subVectors(endPos, startPos);
        const length = direction.length();
        
        const laserGeometry = new THREE.CylinderGeometry(0.2, 0.2, length, 8);
        const laserMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.8
        });
        
        const laserBeam = new THREE.Mesh(laserGeometry, laserMaterial);
        
        // Position at start
        laserBeam.position.copy(startPos);
        
        // Orient along direction
        const up = new THREE.Vector3(0, 1, 0);
        const dir = direction.clone().normalize();
        const axis = new THREE.Vector3().crossVectors(up, dir);
        const angle = Math.acos(up.dot(dir));
        
        if (axis.length() > 0.001) {
            axis.normalize();
            laserBeam.setRotationFromAxisAngle(axis, angle);
        } else if (dir.y < 0) {
            laserBeam.rotateX(Math.PI);
        }
        
        // Center along length
        const offset = direction.clone().multiplyScalar(0.5);
        laserBeam.position.add(offset);
        
        // Add glow
        const glowGeometry = new THREE.CylinderGeometry(0.4, 0.4, length, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        laserBeam.add(glow);
        
        scene.add(laserBeam);
        
        // Store camera position at creation time for tracking
        const creationCameraPos = camera.position.clone();
        
        // Track this laser for position updates
        const laserData = {
            beam: laserBeam,
            geometry: laserGeometry,
            material: laserMaterial,
            glowGeometry: glowGeometry,
            glowMaterial: glowMaterial,
            lastCameraPos: creationCameraPos,
            opacity: 0.9
        };
        if (activeLasers.length >= LASER_ARRAY_CAP) {
            const old = activeLasers.shift();
            if (old && old.beam) { old.beam.visible = false; }
        }
        activeLasers.push(laserData);

        // 50 ms fade — 0.9 / 0.45 per 25 ms = 2 ticks.
        const fadeInterval = setInterval(() => {
            laserData.opacity -= 0.45;
            laserMaterial.opacity = laserData.opacity;
            glowMaterial.opacity = laserData.opacity * 0.4;
            
            if (laserData.opacity <= 0) {
                clearInterval(fadeInterval);
                // Remove from active lasers array
                const idx = activeLasers.indexOf(laserData);
                if (idx > -1) activeLasers.splice(idx, 1);
                // Cleanup
                scene.remove(laserBeam);
                laserGeometry.dispose();
                laserMaterial.dispose();
                glowGeometry.dispose();
                glowMaterial.dispose();
            }
        }, 25);
        
    } catch (error) {
        console.warn('Failed to create third-person beam:', error);
    }
}

// Reusable delta vector — avoids `new THREE.Vector3()` every frame in
// updateActiveLasers + updateMuzzleFlashes (was creating 60+ objects/sec).
const _laserDelta = new THREE.Vector3();

function updateActiveLasers() {
    if (typeof camera === 'undefined') return;
    const currentCameraPos = camera.position;
    for (let i = 0; i < activeLasers.length; i++) {
        const ld = activeLasers[i];
        _laserDelta.subVectors(currentCameraPos, ld.lastCameraPos);
        ld.beam.position.add(_laserDelta);
        ld.lastCameraPos.copy(currentCameraPos);
    }
    updateMuzzleFlashes();
}

// Active muzzle flashes - track with ship like lasers
const activeMuzzleFlashes = [];
if (typeof window !== 'undefined') window.activeMuzzleFlashes = activeMuzzleFlashes;

// Active ENEMY laser beams — tracked separately from player lasers so the
// demo/cleanup code can hide them on a timer too.  Player lasers go into
// activeLasers; enemy beams never did (and sometimes linger if their
// setInterval fade misfires).
const activeEnemyLasers = [];
if (typeof window !== 'undefined') window.activeEnemyLasers = activeEnemyLasers;

// Muzzle flash effect at wing tip (brief bright sphere) - NOW TRACKS WITH SHIP
function createMuzzleFlash(position) {
    // Unified flash size that matches the pulled-back 3rd-person camera
    // (0, -6, -22) on both desktop and mobile — keeps wing-tip flashes
    // looking attached to the ship instead of floating as big blobs.
    const flashGeometry = new THREE.SphereGeometry(0.45, 8, 8);
    const flashMaterial = new THREE.MeshBasicMaterial({
        color: '#00ff96',
        transparent: true,
        opacity: 1.0
    });
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    flash.position.copy(position);
    scene.add(flash);
    
    const flashData = {
        mesh: flash,
        geometry: flashGeometry,
        material: flashMaterial,
        lastCameraPos: new THREE.Vector3().copy(camera.position),
        opacity: 1.0
    };
    if (activeMuzzleFlashes.length >= 20) {
        const old = activeMuzzleFlashes.shift();
        if (old && old.mesh) {
            scene.remove(old.mesh);
            if (old.geometry) old.geometry.dispose();
            if (old.material) old.material.dispose();
        }
    }
    activeMuzzleFlashes.push(flashData);

    // 50 ms fade out
    const fadeInterval = setInterval(() => {
        flashData.opacity -= 0.5;
        flashMaterial.opacity = flashData.opacity;
        if (flashData.opacity <= 0) {
            clearInterval(fadeInterval);
            // Remove from tracking array
            const idx = activeMuzzleFlashes.indexOf(flashData);
            if (idx > -1) activeMuzzleFlashes.splice(idx, 1);
            scene.remove(flash);
            flashGeometry.dispose();
            flashMaterial.dispose();
        }
    }, 25);
}

// Update muzzle flashes to track with ship - called from updateActiveLasers
function updateMuzzleFlashes() {
    if (typeof camera === 'undefined' || activeMuzzleFlashes.length === 0) return;
    const currentCameraPos = camera.position;
    for (let i = 0; i < activeMuzzleFlashes.length; i++) {
        const fd = activeMuzzleFlashes[i];
        _laserDelta.subVectors(currentCameraPos, fd.lastCameraPos);
        fd.mesh.position.add(_laserDelta);
        fd.lastCameraPos.copy(currentCameraPos);
    }
}

// Animated tracer projectile that travels from start to target
function createTracerProjectile(startPos, endPos, color) {
    const direction = new THREE.Vector3().subVectors(endPos, startPos);
    const totalLength = direction.length();
    const tracerLength = Math.min(50, totalLength * 0.1); // Short tracer
    
    // Create tracer geometry (short cylinder)
    const tracerGeometry = new THREE.CylinderGeometry(0.3, 0.3, tracerLength, 6);
    const tracerMaterial = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.9
    });
    const tracer = new THREE.Mesh(tracerGeometry, tracerMaterial);
    
    // Orient tracer along direction
    const up = new THREE.Vector3(0, 1, 0);
    const dir = direction.clone().normalize();
    const axis = new THREE.Vector3().crossVectors(up, dir);
    const angle = Math.acos(up.dot(dir));
    
    if (axis.length() > 0.001) {
        axis.normalize();
        tracer.setRotationFromAxisAngle(axis, angle);
    }
    
    // Add glow
    const glowGeometry = new THREE.CylinderGeometry(0.6, 0.6, tracerLength, 6);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    tracer.add(glow);
    
    tracer.position.copy(startPos);
    scene.add(tracer);
    
    // Animate tracer moving toward target
    const speed = totalLength / 8; // Reach target in ~8 frames
    let progress = 0;
    
    const animateInterval = setInterval(() => {
        progress += speed;
        
        if (progress >= totalLength) {
            // Reached target - remove tracer
            clearInterval(animateInterval);
            scene.remove(tracer);
            tracerGeometry.dispose();
            tracerMaterial.dispose();
            glowGeometry.dispose();
            glowMaterial.dispose();
        } else {
            // Move tracer along path
            const t = progress / totalLength;
            tracer.position.lerpVectors(startPos, endPos, t);
            
            // Fade as it travels
            tracerMaterial.opacity = 0.9 * (1 - t * 0.5);
            glowMaterial.opacity = 0.4 * (1 - t * 0.5);
        }
    }, 16); // ~60fps
}

// =============================================================================
// ENHANCED VISUAL FEEDBACK: ENEMY HIT COLOR CHANGES
// =============================================================================

// Flash the player's ship mesh RED on a direct (unshielded) hit so
// 3rd-person players get clear feedback that they took hull damage.
// The GLB is a Group of meshes; we tint every child material's color
// red, caching the original once per material on the material itself
// (mat.userData._origHitColor) so rapid hits never bake red in — they
// just re-extend the red window.
let _playerShipFlashTimers = [];
function flashPlayerShipHit() {
    try {
        const cs = window.cameraState;
        const ship = cs && cs.playerShipMesh;
        if (!ship) return;

        // Impact sparks on the player ship too. Enemy fire on wingmen
        // and enemies already sparks via flashEnemyHit -> createHitSparks;
        // the player was the only combatant that just blinked red with
        // no spark. Same burst + same 120ms rate-limit as flashEnemyHit
        // so sustained fire doesn't spawn a particle system every tick.
        try {
            if (typeof createHitSparks === 'function' && typeof THREE !== 'undefined') {
                const _now = Date.now();
                if (!window._lastPlayerHitSparkTime ||
                    (_now - window._lastPlayerHitSparkTime) > 120) {
                    window._lastPlayerHitSparkTime = _now;
                    const _wp = new THREE.Vector3();
                    ship.getWorldPosition(_wp);
                    createHitSparks(_wp, 0xffaa33, 1.0);
                }
            }
        } catch (e) {}

        const mats = [];
        ship.traverse(node => {
            if (node && node.isMesh && node.material) {
                const list = Array.isArray(node.material) ? node.material : [node.material];
                list.forEach(mat => {
                    if (!mat || !mat.color) return;
                    if (!mat.userData) mat.userData = {};
                    if (mat.userData._origHitColor === undefined) {
                        mat.userData._origHitColor = mat.color.getHex();
                    }
                    mats.push(mat);
                });
            }
        });
        if (!mats.length) return;

        const setRed = () => mats.forEach(m => { if (m && m.color) m.color.setHex(0xff2233); });
        const setOrig = () => mats.forEach(m => {
            if (m && m.color && m.userData && m.userData._origHitColor !== undefined) {
                m.color.setHex(m.userData._origHitColor);
            }
        });

        // Cancel any in-flight blink sequence so overlapping hits
        // restart cleanly (and never leave the ship stuck red).
        _playerShipFlashTimers.forEach(t => clearTimeout(t));
        _playerShipFlashTimers = [];

        // Exactly 3 rapid red blinks within 0.5s. Phases (100ms each):
        //   0ms red, 100 off, 200 red, 300 off, 400 red, 500 off.
        // 3 reds total, guaranteed to end on the original colour.
        const STEP = 100;
        setRed(); // phase 0 (now)
        for (let i = 1; i <= 5; i++) {
            const red = (i % 2 === 0); // i=2,4 → red ; i=1,3,5 → original
            _playerShipFlashTimers.push(setTimeout(
                red ? setRed : setOrig, i * STEP));
        }
    } catch (e) {}
}
if (typeof window !== 'undefined') window.flashPlayerShipHit = flashPlayerShipHit;

// =============================================================================
// ENEMY ORANGE COMBAT SHIELD
// Raised only while a hostile is actively engaging the player/wingman.
// Absorbs 2 laser hits (flashing red on each) or 1 missile hit, then
// shatters into flying shards. Borg cubes/drones and UFOs are excluded
// (they have their own hit mechanics).
// =============================================================================
function _ensureEnemyShield(enemy) {
    if (!enemy || !enemy.userData || enemy.userData._shieldMesh ||
        enemy.userData.shieldBroken || typeof THREE === 'undefined') return;

    // MATERIALIZATION RACE GUARD: spawn-in shrinks the ship to 12% scale
    // for ~0.8s. A shield created in that window is sized against the tiny
    // hull and parent scale, then inflates 8x when the ship scales back up
    // — the "giant shield" bug on discovery-path bosses. Wait it out; this
    // is retried every behavior tick.
    if (enemy.userData._materializing) return;

    // Size from the VISIBLE hull bounding box in WORLD units (skip the
    // oversized invisible hitbox sphere, glow + cone layers), exactly
    // like _ensureShipThrusterCones — enemy GLB models are scaled ~48×,
    // so the raw hitboxSize is hugely inflated. Then convert that world
    // radius into the enemy's LOCAL frame (the shield is a child).
    let worldR = 90;
    let hullSpan = 0;   // measured hull max dimension; 0 = measurement failed
    try {
        enemy.updateWorldMatrix(true, true);
        const box = new THREE.Box3(); box.makeEmpty();
        const mb = new THREE.Box3();
        let any = false;
        enemy.traverse(node => {
            if (!node.isMesh || !node.geometry) return;
            const u = node.userData || {};
            if (u.isHitbox || u.isGlowLayer || u._isThrusterCone ||
                u._isHullRead || u.isEnemyShield) return;
            if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
            if (!node.geometry.boundingBox) return;
            mb.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
            box.union(mb); any = true;
        });
        // Bubble hugs the hull for normal fighters (0.31); bosses,
        // boss-support, elite + black-hole guardians keep the larger
        // bubble (0.62) so their bigger silhouette reads correctly.
        const _ud0 = enemy.userData || {};
        const _bigShield = _ud0.isBoss || _ud0.isBossSupport ||
                           _ud0.isEliteGuardian || _ud0.isBlackHoleGuardian;
        if (any && isFinite(box.min.x) && box.max.x > box.min.x) {
            const sz = box.getSize(new THREE.Vector3());
            hullSpan = Math.max(sz.x, sz.y, sz.z);
            worldR = hullSpan * (_bigShield ? 0.62 : 0.31);
        }
    } catch (e) {}
    {
        const _ud1 = enemy.userData || {};
        const _bigShield = _ud1.isBoss || _ud1.isBossSupport ||
                           _ud1.isEliteGuardian || _ud1.isBlackHoleGuardian;
        // Big-shield ceiling 360 (was briefly 640 for the 2×-boss
        // experiment; with boss scale reverted, 640 left guardians inside
        // screen-filling orange spheres whenever the player got close).
        const maxR = _bigShield ? 360 : 140;

        // The bubble must HUG the hull, and the ABSOLUTE floor (minR 22) was
        // the sole reason it didn't. A fighter hull measures ~18 u across, so
        // the intended 0.31 factor asks for a 5.7 u radius — and 22 overrode
        // it into a 44 u sphere wrapped around an 18 u ship: 2.4x the hull,
        // measured live on every Martian Pirate (shieldR 22, hull 18.5 u).
        // That transparent additive ball, not the hull, was what a bracketed
        // target read as at combat range, and _setEnemyTelegraph deliberately
        // skips glow layers — so the whole 464 ms windup ramp was firing
        // BEHIND it. Floors are now hull-RELATIVE whenever the hull could be
        // measured, which keeps the sphere at 0.62x the hull span across every
        // rank instead of inflating small ones; the absolute floor survives
        // only for the un-measurable case it was actually written for.
        if (hullSpan > 0) {
            const relMin = hullSpan * 0.22;
            const relMax = hullSpan * (_bigShield ? 0.75 : 0.40);
            worldR = Math.max(relMin, Math.min(worldR, Math.min(relMax, maxR)));
        } else {
            const minR = _bigShield ? 45 : 22;
            worldR = Math.max(minR, Math.min(worldR, maxR));
        }
    }

    const ws = new THREE.Vector3();
    try { enemy.getWorldScale(ws); } catch (e) { ws.set(1, 1, 1); }
    const s = Math.max(0.0001, (Math.abs(ws.x) + Math.abs(ws.y) + Math.abs(ws.z)) / 3);
    const localR = worldR / s;

    const mat = new THREE.MeshBasicMaterial({
        color: 0xff8800, transparent: true, opacity: 0.0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const shield = new THREE.Mesh(new THREE.SphereGeometry(localR, 18, 14), mat);
    shield.frustumCulled = true;   // off-screen enemies skip the shield draw
    shield.userData.isEnemyShield = true;
    shield.userData.isGlowLayer = true;   // skipped by thruster-cone bbox
    enemy.add(shield);
    enemy.userData._shieldMesh = shield;
    enemy.userData._shieldRadius = worldR;   // WORLD units, for shard sizing
    enemy.userData.shieldHits = 0;
    enemy.userData.shieldActive = false;
}

function _setEnemyShieldEngaged(enemy, engaged) {
    const ud = enemy && enemy.userData;
    if (!ud || ud.shieldBroken) return;
    if (ud.isBorgCube || ud.type === 'borg_drone' || ud.isUFO) return; // own mechanics
    // Show the shield bubble briefly even when not "engaged" so a hit on
    // the hull still flashes the shield red — matches the player's
    // shield reaction. We lazy-create the mesh for the flash window.
    const flashing = ud._shieldFlashUntil && Date.now() < ud._shieldFlashUntil;
    if ((engaged || flashing) && !ud._shieldMesh) _ensureEnemyShield(enemy);
    const sm = ud._shieldMesh;
    if (!sm) return;
    ud.shieldActive = !!engaged;
    // Camera INSIDE the bubble → hide it. A DoubleSide additive sphere
    // viewed from within washes the whole screen orange (seen at close
    // boss standoff); the shield still works, it just doesn't render.
    if (typeof camera !== 'undefined' &&
        camera.position.distanceTo(enemy.position) < (ud._shieldRadius || 100) * 1.1) {
        sm.material.opacity = 0;
        return;
    }
    if (flashing) {
        sm.material.color.setHex(0xff2200);
        sm.material.opacity = 0.6;
        return;
    }
    if (!engaged) { sm.material.opacity = 0; return; }
    // Gentle orange pulse while engaged and not flashing.
    sm.material.color.setHex(0xff8800);
    sm.material.opacity = 0.16 + Math.sin(Date.now() * 0.006 + (enemy.id || 0)) * 0.05;
}

// Returns true if the shield absorbed the hit (caller skips health
// damage + kill check). isMissile=true shatters in one hit.
function _enemyShieldAbsorbHit(enemy, isMissile) {
    const ud = enemy && enemy.userData;
    if (!ud || !ud.shieldActive || ud.shieldBroken || !ud._shieldMesh) return false;
    ud.shieldHits = (ud.shieldHits || 0) + 1;
    const breakNow = isMissile || ud.shieldHits >= 2;
    // Red flash on every shield hit (matches the hit-flash window
    // used by flashEnemyHit so a shield-then-hull combo doesn't
    // visually flicker between two flash lengths).
    ud._shieldFlashUntil = Date.now() + 350;
    ud._shieldMesh.material.color.setHex(0xff2200);
    ud._shieldMesh.material.opacity = 0.6;
    if (typeof playSound === 'function') playSound('weapon');
    if (breakNow) _shatterEnemyShield(enemy);
    return true;
}

// Shield shatter FX. One InstancedMesh per shatter (1 draw call for all
// shards instead of 14 separate meshes) animated on the main rAF loop
// via updateShieldShatterFX() — no per-effect setInterval (those ran
// off-frame and stacked GC/timer pressure when several shields broke at
// once). Geometry is shared across every shatter; only a tiny material
// is allocated per burst so overlapping shatters fade independently.
const _shieldShardGeo = (typeof THREE !== 'undefined') ? new THREE.TetrahedronGeometry(1, 0) : null;
const _shatterDummy = (typeof THREE !== 'undefined') ? new THREE.Object3D() : null;
const _shieldShatterFX = [];

function _shatterEnemyShield(enemy) {
    const ud = enemy && enemy.userData;
    if (!ud || !ud._shieldMesh) return;
    const sm = ud._shieldMesh;
    const wp = sm.getWorldPosition(new THREE.Vector3());
    const r = ud._shieldRadius || 60;

    const COUNT = 12;
    const shardSize = r * 0.18;
    const mat = new THREE.MeshBasicMaterial({
        color: 0xff8800, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const inst = new THREE.InstancedMesh(_shieldShardGeo, mat, COUNT);
    inst.frustumCulled = false;
    inst.renderOrder = 55;

    const pos = [], vel = [], rot = [], spin = [];
    for (let i = 0; i < COUNT; i++) {
        const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        pos.push(wp.clone());
        vel.push(dir.multiplyScalar(r * (0.045 + Math.random() * 0.05)));
        rot.push({ x: Math.random() * 6.28, y: Math.random() * 6.28, z: Math.random() * 6.28 });
        spin.push({ x: (Math.random() - 0.5) * 0.4, y: (Math.random() - 0.5) * 0.4, z: (Math.random() - 0.5) * 0.4 });
        _shatterDummy.position.copy(wp);
        _shatterDummy.rotation.set(rot[i].x, rot[i].y, rot[i].z);
        _shatterDummy.scale.setScalar(shardSize);
        _shatterDummy.updateMatrix();
        inst.setMatrixAt(i, _shatterDummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
    _shieldShatterFX.push({ inst, mat, pos, vel, rot, spin, shardSize, life: 1.0 });

    if (sm.parent) sm.parent.remove(sm);
    sm.geometry.dispose(); sm.material.dispose();
    ud._shieldMesh = null;
    ud.shieldActive = false;
    ud.shieldBroken = true;   // gone for good — hull is now exposed
    if (typeof playSound === 'function') playSound('explosion');
}

// Advance all active shield-shatter bursts. Called once per frame from
// the animate loop. Frame-rate-independent decay keeps the look stable.
function updateShieldShatterFX() {
    if (!_shieldShatterFX.length || !_shatterDummy) return;
    for (let k = _shieldShatterFX.length - 1; k >= 0; k--) {
        const fx = _shieldShatterFX[k];
        fx.life -= 0.06;
        if (fx.life <= 0) {
            scene.remove(fx.inst);
            if (fx.inst.dispose) fx.inst.dispose();
            fx.mat.dispose();
            _shieldShatterFX.splice(k, 1);
            continue;
        }
        fx.mat.opacity = 0.9 * fx.life;
        for (let i = 0; i < fx.pos.length; i++) {
            fx.pos[i].add(fx.vel[i]);
            const ro = fx.rot[i], sp = fx.spin[i];
            ro.x += sp.x; ro.y += sp.y; ro.z += sp.z;
            _shatterDummy.position.copy(fx.pos[i]);
            _shatterDummy.rotation.set(ro.x, ro.y, ro.z);
            _shatterDummy.scale.setScalar(fx.shardSize);
            _shatterDummy.updateMatrix();
            fx.inst.setMatrixAt(i, _shatterDummy.matrix);
        }
        fx.inst.instanceMatrix.needsUpdate = true;
    }
}
if (typeof window !== 'undefined') window.updateShieldShatterFX = updateShieldShatterFX;

// BORG cube hit pulse. The cube is a THREE.Group of children (cube body
// with MeshStandardMaterial emissive 0x00ff00, wireframe glow box,
// edges, core sphere); none of the standard hit-flash paths touched
// them, so hits felt silent. Briefly punches up the emissive + wireframe
// opacity for ~140 ms, then eases back — restores the "I clearly hit
// the cube" feedback from early builds. Rate-limited per cube.
const _borgHitTimers = new WeakMap();
function flashBorgCubeOnHit(cube) {
    if (!cube || typeof cube.traverse !== 'function') return;
    const prev = _borgHitTimers.get(cube);
    if (prev) prev.forEach(t => clearTimeout(t));

    const restore = [];
    cube.traverse(node => {
        if (!node || node.userData && node.userData.isHitbox) return;
        const m = node.material;
        if (!m) return;
        if (typeof m.emissiveIntensity === 'number') {
            restore.push({ m, key: 'emissiveIntensity', orig: m.emissiveIntensity });
            m.emissiveIntensity = Math.min(2.5, m.emissiveIntensity + 1.4);
        }
        if (m.wireframe && typeof m.opacity === 'number') {
            restore.push({ m, key: 'opacity', orig: m.opacity });
            m.opacity = Math.min(1.0, m.opacity + 0.6);
        }
    });
    const t = setTimeout(() => {
        restore.forEach(r => { r.m[r.key] = r.orig; });
    }, 140);
    _borgHitTimers.set(cube, [t]);
}
if (typeof window !== 'undefined') window.flashBorgCubeOnHit = flashBorgCubeOnHit;

// FIXED: Enemy hit flash that works with MeshBasicMaterial (no emissive properties)
function flashEnemyHit(enemy, damage = 1) {
    if (!enemy) return;

    // Shield flash on EVERY hit — hull or shield, enemy or wingman.
    // The per-frame _setEnemyShieldEngaged / _updateAllyShield pickers
    // honour _shieldFlashUntil and lazy-create the bubble mesh if
    // needed, then fade it back out when the window expires. Matches
    // the player's first-person hex-shield reaction. ~350ms window so
    // the flash actually reads across the spark + screen-shake noise.
    if (enemy.userData && enemy.userData.health > 0) {
        enemy.userData._shieldFlashUntil = Date.now() + 350;
    }

    // Impact sparks — fire for EVERY surviving hit, regardless of
    // whether the model has a top-level .material (GLB enemies are
    // Groups and don't, so the color-flash below is skipped for them;
    // the sparks are what the player actually sees on those). Use the
    // world position so it lands on the ship even when the enemy is a
    // child of a system group (e.g. Borg drones).
    // Rate-limited to one burst per target per 120ms. Sustained
    // autopilot/wingman fire calls flashEnemyHit many times a second;
    // without this each tick spawned a fresh particle system +
    // explosionManager entry, which was a measurable jitter source.
    if (enemy.userData && enemy.userData.health > 0 &&
        typeof createHitSparks === 'function' && typeof THREE !== 'undefined') {
        const _now = Date.now();
        if (!enemy.userData._lastSparkTime || (_now - enemy.userData._lastSparkTime) > 120) {
            enemy.userData._lastSparkTime = _now;
            const wp = new THREE.Vector3();
            if (enemy.getWorldPosition) enemy.getWorldPosition(wp);
            else if (enemy.position) wp.copy(enemy.position);
            const tint = (enemy.userData && enemy.userData.galaxyColor) || 0xffaa33;
            // Regular enemies are 50% scale (ENEMY_SCALE_FACTOR); bosses /
            // guardians / BORG cubes keep full size so their sparks read
            // at the long engagement ranges those set-pieces sit at.
            const _ud = enemy.userData || {};
            const _isBigTarget = _ud.isBoss || _ud.isEliteGuardian ||
                                 _ud.isBlackHoleGuardian || _ud.isBorgCube ||
                                 _ud.type === 'borg_cube';
            const sparkScale = _isBigTarget ? 1.0 : 0.5;
            createHitSparks(wp, tint, sparkScale);
        }
    }

    // BORG cubes are Groups with no top-level material, so the colour
    // flash below would early-return and the player had no hit cue
    // beyond the small sparks. Pulse the cube's emissive + wireframe
    // glow on the children directly instead.
    if (enemy.userData && (enemy.userData.isBorgCube ||
                           enemy.userData.type === 'borg_cube')) {
        flashBorgCubeOnHit(enemy);
    }

    if (!enemy.material) return;

    // Store original material if not already stored
    if (!enemy.userData.originalMaterial) {
        enemy.userData.originalMaterial = {
            color: enemy.material.color.clone(),
            opacity: enemy.material.opacity || 1.0
        };
    }
    
    // Calculate health percentage
    const healthPercent = enemy.userData.health / enemy.userData.maxHealth;
    
    // Simple color flash based on health
    let hitColor;
    if (healthPercent > 0.66) {
        // High health - bright red flash
        hitColor = new THREE.Color(1, 0.2, 0.2);
    } else if (healthPercent > 0.33) {
        // Medium health - orange flash
        hitColor = new THREE.Color(1, 0.5, 0);
    } else {
        // Low health - yellow/white flash
        hitColor = new THREE.Color(1, 1, 0.2);
    }
    
    // Apply hit effect - just change color, keep opacity
    const originalOpacity = enemy.material.opacity;
    enemy.material.color.copy(hitColor);
    enemy.material.opacity = 0.9; // Slightly more opaque during hit
    
    // Clear any existing timeout
    if (enemy.userData.hitTimeout) {
        clearTimeout(enemy.userData.hitTimeout);
    }
    
    // Return to original color after delay
    enemy.userData.hitTimeout = setTimeout(() => {
        if (enemy && enemy.material && enemy.userData.originalMaterial) {
            // Always return to original color and opacity
            enemy.material.color.copy(enemy.userData.originalMaterial.color);
            enemy.material.opacity = enemy.userData.originalMaterial.opacity;
        }
    }, 150);
}
// =============================================================================
// ENHANCED DIRECTIONAL DAMAGE EFFECTS FROM ADVANCED VERSION
// =============================================================================

// ── DAMAGE VIGNETTE ─────────────────────────────────────────────────────────
// Incoming fire used to spawn a NEW full-viewport div per hit: the no-attacker
// path painted `bg-red-500` to opacity 1.0 (a literally solid red frame) and
// the "front" case dropped a 0.6-alpha red blob dead-centre, right over the
// crosshair. Each lived 800 ms and they STACKED, so a firefight buried the
// ship, the reticles and the whole HUD under opaque red.
//
// Replaced with ONE reusable neon rim: additive (`screen`) so it adds light
// instead of painting over the frame, transparent through the middle ~55% so
// the reticle and target callouts stay perfectly readable, and hottest on the
// edge the shot came from so it still tells you where to turn.
const _DMG_RIM = 'rgba(255,26,90,';        // hot magenta-red — synthwave, not mud
const _DMG_HOT = 'rgba(255,120,170,';      // bright inner hairline
let _dmgVignetteEl = null, _dmgFadeTimer = null;
function _getDamageVignette() {
    if (!_dmgVignetteEl || !_dmgVignetteEl.isConnected) {
        // .combat-damage-fx so game-physics' warp cleanup still sweeps it;
        // recreated on demand if that sweep removed it.
        _dmgVignetteEl = document.createElement('div');
        _dmgVignetteEl.id = 'combatDamageVignette';
        _dmgVignetteEl.className = 'fixed pointer-events-none combat-damage-fx';
        _dmgVignetteEl.style.cssText =
            'top:0;left:0;right:0;bottom:0;z-index:2000;opacity:0;' +
            'mix-blend-mode:screen;will-change:opacity;';
        document.body.appendChild(_dmgVignetteEl);
    }
    return _dmgVignetteEl;
}

// Paint the rim and pulse it. `edge` is one of left/right/top/bottom/all/none.
function _pulseDamageVignette(edge, intensity) {
    const el = _getDamageVignette();
    const k = Math.max(0.35, Math.min(1, intensity || 1));

    // Always-present ring: dead transparent through the centre, ramping in
    // only across the outer third of the frame.
    const layers = ['radial-gradient(ellipse 82% 82% at 50% 50%,' +
        'transparent 0%,transparent 54%,' + _DMG_RIM + (0.10 * k) + ') 72%,' +
        _DMG_RIM + (0.44 * k) + ') 100%)'];

    // Directional band — confined to the outer ~20% of the incoming side so it
    // reads as "hit from the left", never as a screen-wide wash.
    const dirs = {
        left:   'to right', right: 'to left',
        top:    'to bottom', bottom: 'to top'
    };
    if (dirs[edge]) {
        layers.unshift('linear-gradient(' + dirs[edge] + ',' +
            _DMG_HOT + (0.60 * k) + ') 0%,' +
            _DMG_RIM + (0.34 * k) + ') 7%,' +
            _DMG_RIM + (0.10 * k) + ') 15%,transparent 24%)');
    } else if (edge === 'all') {
        // Hit from behind — light the whole rim harder, no direction to give.
        layers[0] = 'radial-gradient(ellipse 78% 78% at 50% 50%,' +
            'transparent 0%,transparent 48%,' + _DMG_RIM + (0.20 * k) + ') 68%,' +
            _DMG_HOT + (0.58 * k) + ') 100%)';
    }

    el.style.background = layers.join(',');
    el.style.boxShadow = 'inset 0 0 0 2px ' + _DMG_HOT + (0.55 * k) + '),' +
                         'inset 0 0 46px ' + _DMG_RIM + (0.40 * k) + ')';

    // Snap on, decay off. ~0.38 s total instead of 0.8 s, so consecutive hits
    // read as separate punches rather than compounding into a solid field.
    if (_dmgFadeTimer) { clearTimeout(_dmgFadeTimer); _dmgFadeTimer = null; }
    el.style.transition = 'opacity 0.05s linear';
    el.style.opacity = String(0.55 + 0.45 * k);
    _dmgFadeTimer = setTimeout(() => {
        el.style.transition = 'opacity 0.30s cubic-bezier(.3,0,.7,1)';
        el.style.opacity = '0';
        _dmgFadeTimer = null;
    }, 80);
}

// ENHANCED: Directional damage effect system with attacker position
function createScreenDamageEffect(attackerPosition = null) {
    if (!attackerPosition) {
        // No attacker known — omnidirectional rim pulse (was: solid red frame).
        _pulseDamageVignette('all', 0.85);
        return;
    }

    // NEW: Directional damage effect based on attacker position
    const attackDirection = getAttackDirection(attackerPosition);
    createDirectionalDamageEffect(attackDirection);
    
    // Enhanced screen shake effect
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) {
        gameContainer.style.animation = 'screenShake 0.8s ease-out';
        setTimeout(() => {
            if (gameContainer) {
                gameContainer.style.animation = '';
            }
        }, 800);
    }
}

function getAttackDirection(attackerPosition) {
    if (typeof camera === 'undefined') {
        return { primary: 'center', screenX: 0.5, screenY: 0.5, isVisible: true };
    }

    // Transform the attacker into camera-local space so we can classify
    // the incoming-fire direction reliably.  Three.js camera convention:
    //   +X = right, -X = left
    //   +Y = up,    -Y = down
    //   -Z = into the scene (front), +Z = behind the camera
    // We deliberately avoid .project() here — NDC coordinates are
    // unreliable for points at or behind the camera plane, which made
    // below/behind hits mis-classify as radial-from-center.
    const local = camera.worldToLocal(attackerPosition.clone());
    const absX = Math.abs(local.x);
    const absY = Math.abs(local.y);
    const absZ = Math.abs(local.z);

    // Pick the dominant off-axis direction.  If the lateral/vertical
    // offset is negligible compared to Z, fall back to 'front' (ahead)
    // or 'behind' (straight rear) — the radial flash then makes sense.
    let direction = 'front';
    if (absX > absY) {
        if (absX > absZ * 0.3) {
            direction = local.x > 0 ? 'right' : 'left';
        } else if (local.z > 0) {
            direction = 'behind';
        }
    } else {
        if (absY > absZ * 0.3) {
            direction = local.y > 0 ? 'top' : 'bottom';
        } else if (local.z > 0) {
            direction = 'behind';
        }
    }

    // Screen coords are still useful for the indicator label; safe to
    // compute even though we don't rely on them for direction.
    const projected = attackerPosition.clone().project(camera);
    const screenX = projected.x * 0.5 + 0.5;
    const screenY = -projected.y * 0.5 + 0.5;

    return {
        primary: direction,
        screenX: screenX,
        screenY: screenY,
        isVisible: projected.z < 1
    };
}

function createDirectionalDamageEffect(attackDirection) {
    const direction = attackDirection.primary;

    // Map the incoming direction onto which EDGE of the frame lights up.
    // 'front' deliberately gets the plain ring and no hot band: the threat is
    // already in view, and the old centre blob covered the very reticle the
    // player needs to keep on it.
    const EDGE = {
        left: 'left', right: 'right', top: 'top', bottom: 'bottom',
        behind: 'all', front: 'none', center: 'none'
    };
    // Rim sits at z-index 2000 — above the mission command alert (z-50) and the
    // incoming-transmission prompt (1000) — so incoming-fire warnings always
    // read, even mid-transmission.
    _pulseDamageVignette(EDGE[direction] || 'none', direction === 'behind' ? 1 : 0.9);

    // Add directional damage indicator text for every non-center
    // direction (including FRONT — previously suppressed, but the
    // player deserves a "FRONT" warning when an enemy ahead of them
    // lands a hit).
    if (direction !== 'center') {
        createDamageDirectionIndicator(direction);
    }
}

function createDamageDirectionIndicator(direction) {
    const indicator = document.createElement('div');
    indicator.className = 'fixed pointer-events-none text-red-400 font-bold text-lg combat-damage-fx';
    // Above mission alert (z-50) and transmission prompt (1000) so the
    // directional arrows always read even during a transmission.
    indicator.style.zIndex = '2001';
    indicator.style.fontFamily = "'Orbitron', monospace";
    indicator.style.textShadow = '0 0 10px rgba(255,0,0,0.8), 0 0 20px rgba(255,0,0,0.5)';
    indicator.style.opacity = '0';
    indicator.style.transition = 'all 0.3s ease-out';
    
    // Position and text based on direction (REMOVED EMOJIS).
    // On desktop the top center is occupied by the title panel and the
    // bottom center by the DEMO AUTOPILOT pill, so we push the top and
    // bottom indicators clear of those. Mobile: top sits just below the
    // floating status pills (top:56px + ~49px tall); bottom sits above
    // the DEMO pill (bottom:92px + 38px tall).
    const _isMobileViewport = (typeof window !== 'undefined') &&
        (('ontouchstart' in window) || window.innerWidth < 768);
    const _topOffset    = _isMobileViewport ? 112 : 110;  // below title panel / mobile top stack
    const _bottomOffset = _isMobileViewport ? 138 : 80;   // above demo pill
    let text = '';
    let positionStyle = '';

    // Mobile: left and right sit on DIFFERENT lines (the two texts are wide
    // enough to collide in the middle of a phone screen when both fire).
    const _leftTop  = _isMobileViewport ? '44%' : '50%';
    const _rightTop = _isMobileViewport ? '56%' : '50%';
    switch (direction) {
        case 'left':
            text = '< UNDER ATTACK';
            positionStyle = 'left: 20px; top: ' + _leftTop + '; transform: translateY(-50%);';
            break;
        case 'right':
            text = 'UNDER ATTACK >';
            positionStyle = 'right: 20px; top: ' + _rightTop + '; transform: translateY(-50%);';
            break;
        case 'top':
            text = '^ UNDER ATTACK';
            positionStyle = 'top: ' + _topOffset + 'px; left: 50%; transform: translateX(-50%);';
            break;
        case 'bottom':
            text = 'v UNDER ATTACK';
            positionStyle = 'bottom: ' + _bottomOffset + 'px; left: 50%; transform: translateX(-50%);';
            break;
        case 'behind':
            text = '!!! AMBUSH !!!';
            positionStyle = 'top: 50%; left: 50%; transform: translate(-50%, -50%);';
            break;
    }
    
    indicator.textContent = text;
    indicator.style.cssText += positionStyle;
    document.body.appendChild(indicator);

    // Store the base transform for proper animation
    const baseTransform = indicator.style.transform || '';

    // Animate in
    setTimeout(() => {
        indicator.style.opacity = '1';
        indicator.style.transform = baseTransform + ' scale(1.1)';
    }, 50);

    // Animate out
    setTimeout(() => {
        indicator.style.opacity = '0';
        indicator.style.transform = baseTransform + ' scale(0.8)';
    }, 800);
    
    // Remove
    setTimeout(() => {
        indicator.remove();
    }, 1100);
}

// ENHANCED: Enhanced damage effects wrapper
function createEnhancedScreenDamageEffect(attackerPosition = null) {
    // Use the new directional system
    createScreenDamageEffect(attackerPosition);
}

// =============================================================================
// WORKING KEYBOARD CONTROLS - RESTORED from game-controls13.js
// =============================================================================

function setupEnhancedEventListeners() {
    // Initialize audio first
    initAudio();
    
    // Start tutorial after a short delay
    setTimeout(startTutorial, 1000);
    
   // FIXED: Prevent duplicate event listeners
let controlButtonsInitialized = false;

function setupControlButtons() {
    // Flight Controls buttons (Music / Skip / Pause) now use inline onclick
    // attributes in index.html that call the globals directly. That's the
    // most reliable setup — survives DOM changes, doesn't depend on listener
    // registration timing, and works even if this function never runs.
    // This function is left as a no-op for backwards compatibility with any
    // callers that still reference it.
    controlButtonsInitialized = true;
}

// SINGLE initialization call
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupControlButtons);
} else {
    setupControlButtons();
}

// SIMPLIFIED: Single initialization call
function initializeControlButtons() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupControlButtons);
    } else {
        setupControlButtons();
    }
}

    document.addEventListener('keydown', (e) => {
        // Add pause key handler
        if (e.key === 'p' || e.key === 'P') {
            e.preventDefault();
            togglePause();
            return;
        }

        // Camera view controls: 1 = first-person, 3 = third-person, 0 = no ship, V = toggle
        if (e.key === '1') {
            e.preventDefault();
            if (typeof setCameraFirstPerson === 'function') {
                setCameraFirstPerson();
            }
            return;
        }
        if (e.key === '3') {
            e.preventDefault();
            if (typeof setCameraThirdPerson === 'function') {
                setCameraThirdPerson();
            }
            return;
        }
        if (e.key === '0') {
            e.preventDefault();
            if (typeof setCameraNoShip === 'function') {
                setCameraNoShip();
            }
            return;
        }
        if (e.key === 'v' || e.key === 'V') {
            e.preventDefault();
            if (typeof toggleCameraView === 'function') {
                console.log('🎥 Toggling camera view...');
                toggleCameraView();
            } else {
                console.warn('⚠️ toggleCameraView function not available');
            }
            return;
        }

        if (gameState.paused) return;  // MAKE SURE THIS LINE EXISTS
        
        if (e.key === 'Tab' || e.key === 'Enter') {
            e.preventDefault();
        }
        
        const key = e.key.toLowerCase();
        
        // W key with double-tap detection for Jump
        if (key === 'w') {
            // Ignore repeat keydown events from holding the key
            if (e.repeat) {
                // Key is being held - just set normal W thrust
                keys.w = true;
            } else {
                // Fresh key press - check for double-tap
                const now = Date.now();
                if (now - doubleTapState.lastWTap < doubleTapState.doubleTapThreshold) {
                    // Double-tap detected - Jump!
                    keys.wDoubleTap = true;
                    keys.w = false; // Don't also thrust
                } else {
                    // Single tap - normal thrust
                    keys.w = true;
                }
                doubleTapState.lastWTap = now;
            }
        }
        
        if (key === 'a') keys.a = true;
        if (key === 's') keys.s = true;
        if (key === 'd') keys.d = true;
        if (key === 'q') keys.q = true;
        if (key === 'e') keys.e = true;
        if (e.key === 'Enter') keys.enter = true;
        
        // O key for emergency warp with double-tap detection
        if (key === 'o') {
            const now = Date.now();
            if (now - doubleTapState.lastOTap < doubleTapState.doubleTapThreshold) {
                // Double-tap detected - 2-second warp
                keys.oDoubleTap = true;
            } else {
                // Single tap - full emergency warp
                keys.o = true;
            }
            doubleTapState.lastOTap = now;
        }
        
        // CAPS LOCK detection for fast turning
        if (e.getModifierState && e.getModifierState('CapsLock')) {
            keys.capsLock = true;
        }
        
        if (e.key === 'Shift') keys.shift = true;
        if (e.key === ' ') {
    keys.space = true;
    if (!gameState.targetLock.active) {
        gameState.targetLock.active = true;
        resumeAudioContext();
    }
}
        if (e.key === 'Alt' || e.altKey) {
            keys.alt = true;
            // HOLD-TO-CHARGE: the first press fires one tap shot and starts
            // the charge timer; key-repeat while held does NOT rapid-fire —
            // it builds the charge (a glow grows on the wings) released on
            // keyup as a blast scaled by hold time (max 3s).
            if (!e.repeat) {
                // CHARGE SPEED GATE: charging needs a stable firing platform —
                // above ~8,000 km/s the charge won't start (the tap shot still
                // fires). Keeps the wing glow readable and avoids the charge
                // visuals fighting warp-speed motion.
                const _chSpeed = gameState.velocityVector ? gameState.velocityVector.length() : 0;
                gameState._laserChargeStart = _chSpeed <= 8 ? Date.now() : 0;
                if (!gameState.gameOver && gameState.gameStarted) {
                    resumeAudioContext();
                    fireWeapon();
                }
            }
        }
        if (e.key === 'Shift') {
            e.preventDefault();
            fireMissile();
        }
        if (key === 'x') {
            keys.x = true;
            
            // NEW: Stop warp speed starfield when braking
            if (typeof toggleWarpSpeedStarfield === 'function') {
                toggleWarpSpeedStarfield(false);
            }
        }
        if (key === 'b') keys.b = true;
        if (key === 'z') {
            keys.z = true;
            // Activate missile zoom scope (hold to zoom)
            if (!gameState.missiles.selected) {
                gameState.missiles.selected = true;
                // No notification - silent activation
            }
        }

        if (e.key === 'ArrowUp') keys.up = true;
        if (e.key === 'ArrowDown') keys.down = true;
        if (e.key === 'ArrowLeft') keys.left = true;
        if (e.key === 'ArrowRight') keys.right = true;
        
        if (e.key === 'CapsLock') {
            e.preventDefault();
            cycleTargets();
        }

        // Shift+R toggles realistic vs arcade slingshot physics.
        if ((e.key === 'R' || e.key === 'r') && e.shiftKey) {
            e.preventDefault();
            gameState.realisticSlingshot = !gameState.realisticSlingshot;
            if (typeof showAchievement === 'function') {
                showAchievement(
                    gameState.realisticSlingshot ? 'Realistic slingshots ON' : 'Arcade slingshots ON',
                    gameState.realisticSlingshot
                        ? 'Boost vector = body orbit + ≤30° aim. Periapsis matters.'
                        : 'Boost vector = look direction. Mass-scaled magnitude.',
                    true
                );
            }
        }
        
        // Shield toggle - Caps Lock
if (e.key === 'Tab') {
    e.preventDefault();
    if (typeof toggleShields === 'function') {
        toggleShields();
    }
}
        
        if (key === 'l') keys.l = true;
        
        if (e.key === 'Enter') {
            e.preventDefault();

            // Slingshot eligibility now lives entirely inside
            // executeSlingshot (range, cooldown, energy, tier unlocks).
            // Use findSlingshotTarget so the "no target → toggle nav"
            // fallback below still works.
            const nearestPlanet = (typeof findSlingshotTarget === 'function')
                ? findSlingshotTarget()
                : null;

            if (nearestPlanet && !gameState.slingshot.active) {
                if (typeof executeSlingshot === 'function') {
                    executeSlingshot();
                }
            } else if (gameState.currentTarget && !nearestPlanet) {
                if (gameState.autoNavigating) {
                    gameState.autoNavigating = false;
                    gameState.autoNavOrienting = false;
                    showAchievement('Auto-Nav Disengaged', 'Manual control resumed');
                } else {
                    gameState.autoNavigating = true;
                    gameState.autoNavOrienting = true;
                    showAchievement('Auto-Nav Engaged', `Orienting towards ${gameState.currentTarget.userData.name}`);
                }
                if (typeof updateUI === 'function') updateUI();
            }
        }
    });
    
    document.addEventListener('keyup', (e) => {
        // Don't process if paused
        if (gameState.paused) return;  // CORRECT VARIABLE
        
        const key = e.key.toLowerCase();
        if (key === 'w') {
            keys.w = false;
            keys.wDoubleTap = false;
        }
        if (key === 'a') keys.a = false;
        if (key === 's') keys.s = false;
        if (key === 'd') keys.d = false;
        if (key === 'q') keys.q = false;
        if (key === 'e') keys.e = false;
        if (e.key === 'Enter') keys.enter = false;
        if (key === 'o') {
            keys.o = false;
            keys.oDoubleTap = false;
        }
        
        // Update CAPS LOCK state
        if (e.getModifierState) {
            keys.capsLock = e.getModifierState('CapsLock');
        }
        
        if (e.key === 'Shift') keys.shift = false;
        if (e.key === ' ') {
            keys.space = false;
            if (gameState.targetLock.active) {
                gameState.targetLock.active = false;
                gameState.targetLock.target = null;
            }
        }
        if (e.key === 'Alt' || e.altKey) {
            keys.alt = false;
            // Release → charged blast scaled by hold time (300ms..2s → 0..1).
            const _held = Date.now() - (gameState._laserChargeStart || Date.now());
            gameState._laserChargeStart = 0;
            if (_held >= 300 && typeof fireChargedBlast === 'function') {
                fireChargedBlast(Math.min(1, _held / 2000));
            }
        }
        if (key === 'x') keys.x = false;
        if (key === 'b') keys.b = false;
        if (key === 'z') {
            keys.z = false;
            // Deactivate missile zoom scope when key released
            gameState.missiles.selected = false;
        }
        if (key === 'l') keys.l = false;
        
        if (e.key === 'ArrowUp') keys.up = false;
        if (e.key === 'ArrowDown') keys.down = false;
        if (e.key === 'ArrowLeft') keys.left = false;
        if (e.key === 'ArrowRight') keys.right = false;
    });
    
    // Rest of the event listeners remain the same...
    // [Include the rest of your event listeners here]
    
    console.log('âœ… Enhanced event listeners setup complete');
}
    
// TEMPORARY: Mouse click for weapons with UI panel blocking disabled for testing
document.addEventListener('click', (e) => {
    if (!gameState.gameStarted || gameState.gameOver || gamePaused) {
        return;
    }
    
    // Block clicks on modal overlays completely
    if (e.target.closest('#missionCommandAlert') ||
        e.target.closest('#achievementPopup') ||
        e.target.closest('#loadingScreen') ||
        e.target.closest('#pauseOverlay') ||
        e.target.closest('#tutorialOverlay') ||
        e.target.closest('#bossWarning') ||
        e.target.closest('#eventHorizonWarning')) {
        return; 
    }
    
    // CRITICAL FIX: Allow planet card clicks to work properly
    const planetCard = e.target.closest('.planet-card');
    if (planetCard) {
        console.log('ðŸŽ¯ Planet card click detected in main handler!', planetCard);
        // Planet card click detected - let its own handler run, don't fire weapon
        return;
    }
    
    // Block other specific UI elements
    if (e.target.tagName === 'BUTTON' ||
        e.target.closest('button') ||
        e.target.closest('.space-btn') ||
        e.target.classList.contains('small-control-btn') ||
        e.target.classList.contains('galaxy-indicator') ||
        e.target.closest('.map-toggle-btn') ||
        e.target.id === 'muteBtn' ||
        e.target.id === 'pauseBtn' ||
        e.target.id === 'autoNavigateBtn') {
        return;
    }

    // TEMPORARILY DISABLED: Block other UI panel clicks for testing
    // if (e.target.closest('.ui-panel')) {
    //     return;
    // }
    
    // For everything else (game area), fire weapon
    console.log('ðŸ”« Firing weapon - click on game area');
    resumeAudioContext();
    fireWeapon();
});
    
    // Mouse movement tracking for crosshair - FIXED POSITION TRACKING
let _crosshairEl = null;  // cached #crosshair element for native-rate tracking
document.addEventListener('mousemove', (e) => {
    if (typeof gameState === 'undefined' || !gameState.gameStarted || gameState.gameOver || typeof gamePaused !== 'undefined' && gamePaused) return;

    // ALWAYS update actual mouse position for UI detection
    gameState.mouseX = e.clientX;
    gameState.mouseY = e.clientY;

    // Only update crosshair position if not in target lock mode
    // This keeps crosshair and mouse positions separate when target lock is active
    if (!gameState.targetLock.active) {
        gameState.crosshairX = e.clientX;
        gameState.crosshairY = e.clientY;
        // Move the crosshair DOM element HERE, at native mouse rate, so it
        // tracks the cursor 1:1 instead of stepping at the 20Hz rate of
        // updateCrosshairTargeting(). Cache the element lookup.
        if (!_crosshairEl) _crosshairEl = document.getElementById('crosshair');
        if (_crosshairEl) {
            _crosshairEl.style.left = e.clientX + 'px';
            _crosshairEl.style.top = e.clientY + 'px';
        }
    }
    // Note: When target lock is active, crosshair position is controlled by updateTargetLock()
    // but we still track real mouse position for UI interaction
});

// Add zoom scope crosshair after initial setup
setTimeout(() => {
    const zoomScope = document.createElement('div');
    zoomScope.id = 'zoomScope';
    zoomScope.style.cssText = `
        position: fixed;
        width: 250px;
        height: 250px;
        border: 3px solid rgba(255, 51, 0, 0.3);
        border-radius: 50%;
        pointer-events: none;
        z-index: 999;
        display: none;
        overflow: hidden;
        box-shadow: 0 0 20px rgba(255, 51, 0, 0.4), inset 0 0 20px rgba(255, 51, 0, 0.2);
        background: rgba(0, 0, 0, 0.2);
    `;

    const scopeCanvas = document.createElement('canvas');
    scopeCanvas.width = 250;
    scopeCanvas.height = 250;
    scopeCanvas.style.cssText = 'width: 100%; height: 100%; border-radius: 50%;';
    zoomScope.appendChild(scopeCanvas);
    document.body.appendChild(zoomScope);

    let animationFrameId = null;
    let scopeTargetX = 0;
    let scopeTargetY = 0;
    let scopeCurrentX = 0;
    let scopeCurrentY = 0;
    const scopeSmoothing = 0.15; // Smooth following like crosshair
    let lastMissileSelectedState = false;

    function updateZoomScope() {
        if (!gameState.missiles.selected || !renderer || !renderer.domElement) {
            zoomScope.style.display = 'none';
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            return;
        }

        const ctx = scopeCanvas.getContext('2d');
        const zoomFactor = 2.5;

        // Smooth scope position (lerp towards target)
        scopeCurrentX += (scopeTargetX - scopeCurrentX) * scopeSmoothing;
        scopeCurrentY += (scopeTargetY - scopeCurrentY) * scopeSmoothing;

        // Update scope visual position
        zoomScope.style.left = scopeCurrentX + 'px';
        zoomScope.style.top = scopeCurrentY + 'px';

        // Sample the in-tick frame snapshot taken by the main render
        // loop. renderer.domElement itself is an empty buffer here
        // (preserveDrawingBuffer:false), so reading it directly is what
        // made the scope blank — use the snapshot, fall back only if it
        // hasn't been produced yet this session.
        const scopeSource = (typeof window !== 'undefined' && window.__zoomFrameCanvas)
            ? window.__zoomFrameCanvas
            : renderer.domElement;

        // Centre the magnified region on the scope's OWN on-screen
        // centre (it follows the real mouse via scopeTarget = clientX).
        // The old code used gameState.crosshairX/Y, which aim-assist /
        // target-lock continuously pulls away from the cursor — that's
        // why the loupe didn't zoom where the mouse was.
        const scopeCenterX = scopeCurrentX + 125;
        const scopeCenterY = scopeCurrentY + 125;

        // The snapshot canvas is sized in DEVICE pixels
        // (innerWidth × devicePixelRatio); mouse/scope coords are CSS
        // pixels. Without converting, on any HiDPI display the sample
        // is offset toward the top-left and over-magnified.
        const srcCanvasW = scopeSource.width || window.innerWidth;
        const srcCanvasH = scopeSource.height || window.innerHeight;
        const dpScaleX = srcCanvasW / window.innerWidth;
        const dpScaleY = srcCanvasH / window.innerHeight;

        const regionCssW = 250 / zoomFactor;   // CSS px sampled around centre
        const regionCssH = 250 / zoomFactor;
        const sw = regionCssW * dpScaleX;       // → device px
        const sh = regionCssH * dpScaleY;
        let sx = (scopeCenterX - regionCssW / 2) * dpScaleX;
        let sy = (scopeCenterY - regionCssH / 2) * dpScaleY;
        // Keep the sampled rect fully inside the source by shifting its
        // origin (never shrinking it — shrinking would distort zoom).
        sx = Math.max(0, Math.min(sx, srcCanvasW - sw));
        sy = Math.max(0, Math.min(sy, srcCanvasH - sh));

        // Clear canvas
        ctx.clearRect(0, 0, 250, 250);

        // Save context and create circular clipping path
        ctx.save();
        ctx.beginPath();
        ctx.arc(125, 125, 125, 0, Math.PI * 2);
        ctx.clip();

        // Draw magnified portion (now clipped to circle)
        try {
            ctx.drawImage(scopeSource, sx, sy, sw, sh, 0, 0, 250, 250);
        } catch (err) {
            console.warn('Zoom scope render error:', err);
        }

        // Restore context to draw crosshairs over the clipped image
        ctx.restore();

        // Draw crosshair overlay in GREEN to match mouse aiming cursor
        ctx.strokeStyle = 'rgba(0, 255, 150, 0.8)'; // Green like aiming cursor
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(125, 0);
        ctx.lineTo(125, 250);
        ctx.moveTo(0, 125);
        ctx.lineTo(250, 125);
        ctx.stroke();

        // Draw center circle
        ctx.beginPath();
        ctx.arc(125, 125, 20, 0, Math.PI * 2);
        ctx.stroke();

        // Continue animation
        animationFrameId = requestAnimationFrame(updateZoomScope);
    }

    // Function to activate/deactivate scope without requiring mouse movement
    function toggleZoomScope() {
        if (gameState.missiles.selected && !animationFrameId) {
            // Activate scope immediately
            const mouseX = gameState.crosshairX || gameState.mouseX || window.innerWidth / 2;
            const mouseY = gameState.crosshairY || gameState.mouseY || window.innerHeight / 2;
            scopeTargetX = mouseX - 125;
            scopeTargetY = mouseY - 125;
            scopeCurrentX = scopeTargetX;
            scopeCurrentY = scopeTargetY;
            zoomScope.style.display = 'block';
            updateZoomScope();
        } else if (!gameState.missiles.selected) {
            // Deactivate scope immediately
            zoomScope.style.display = 'none';
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
        }
    }

    // Check for state changes in animation loop
    function checkZoomScopeState() {
        if (gameState.missiles.selected !== lastMissileSelectedState) {
            lastMissileSelectedState = gameState.missiles.selected;
            toggleZoomScope();
        }
        requestAnimationFrame(checkZoomScopeState);
    }
    checkZoomScopeState();

    // Update scope position on mouse movement
    document.addEventListener('mousemove', (e) => {
        // Update target position for smooth following
        scopeTargetX = e.clientX - 125;
        scopeTargetY = e.clientY - 125;
    });
}, 1000);

    // RESTORED: Enhanced button handlers
    const autoNavBtn = document.getElementById('autoNavigateBtn');
    if (autoNavBtn) {
        autoNavBtn.addEventListener('click', () => {
            if (gameState.currentTarget) {
                if (gameState.autoNavigating) {
                    gameState.autoNavigating = false;
                    gameState.autoNavOrienting = false;
                    showAchievement('Auto-Nav Disengaged', 'Manual control resumed');
                } else {
                    gameState.autoNavigating = true;
                    gameState.autoNavOrienting = true;
                    showAchievement('Auto-Nav Engaged', `Orienting towards ${gameState.currentTarget.userData.name}`);
                }
                if (typeof updateUI === 'function') updateUI();
            }
        });
    }

    // RESTORED: Orbit lines toggle
    const toggleOrbitsBtn = document.getElementById('toggleOrbitsBtn');
    if (toggleOrbitsBtn) {
        let orbitsVisible = true;
        toggleOrbitsBtn.addEventListener('click', () => {
            orbitsVisible = !orbitsVisible;
            if (typeof orbitLines !== 'undefined') {
                orbitLines.forEach(line => line.visible = orbitsVisible);
            }
            toggleOrbitsBtn.innerHTML = `<i class="fas fa-circle-notch mr-1"></i>Orbits ${orbitsVisible ? 'ON' : 'OFF'}`;
            toggleOrbitsBtn.classList.toggle('bg-green-900', orbitsVisible);
            toggleOrbitsBtn.classList.toggle('bg-red-900', !orbitsVisible);
        });
    }

    const warpBtn = document.getElementById('warpBtn');
    if (warpBtn) {
        warpBtn.addEventListener('click', () => {
            if (!warpBtn.disabled && !gameState.gameOver) {
                showAchievement('Slingshot Info', 'Press ENTER key while near a planet to execute slingshot!');
            }
        });
    }
    
    // RESTORED: Map view toggle button
    const mapViewToggle = document.getElementById('mapViewToggle');
    if (mapViewToggle) {
        mapViewToggle.addEventListener('click', () => {
            if (gameState.mapView === 'galactic') {
                gameState.mapView = 'universal';
                mapViewToggle.textContent = 'Universal View';
            } else {
                gameState.mapView = 'galactic';
                mapViewToggle.textContent = 'Galactic View';
            }
            if (typeof updateGalaxyMap === 'function') updateGalaxyMap();
        });
    }
    
    // RESTORED: Window resize handler
    window.addEventListener('resize', () => {
        if (typeof camera !== 'undefined') {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
        }
        if (typeof renderer !== 'undefined') {
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
        if (typeof anaglyphMode !== 'undefined') {
            anaglyphMode.resize(window.innerWidth, window.innerHeight);
        }

        gameState.crosshairX = window.innerWidth / 2;
        gameState.crosshairY = window.innerHeight / 2;
    });
    
    console.log('âœ… Enhanced event listeners setup complete');

// CHARGED BLAST: hold Alt to charge (glow builds on the wings), release for a
// blast whose damage/energy/beam scale with the charge `power` (0..1 = up to
// 3s held). Reuses all of fireWeapon's targeting via the _chargedShot flag.
function fireChargedBlast(power) {
    if (typeof gameState === 'undefined' || gameState.gameOver || !gameState.gameStarted) return;
    power = Math.max(0, Math.min(1, (typeof power === 'number') ? power : 1));
    const cost = Math.round(12 + power * 28); // 12 (light) .. 40 (max)
    if (!gameState.weapons || gameState.weapons.energy < cost) return;
    gameState._chargedShot = true;
    gameState._chargedPower = power;
    gameState.weapons.cooldown = 0; // the blast fires even mid-cooldown
    if (typeof playSound === 'function') { try { playSound('weapon'); } catch (e) {} }
    if (window.arcade) window.arcade.flash('rgba(255,220,60,' + (0.4 + power * 0.5) + ')', 0.3 + power * 0.5);
    fireWeapon(); // reads + clears _chargedShot / _chargedPower
    if (typeof flashArcadeText === 'function') {
        flashArcadeText(power > 0.8 ? 'MAX CHARGE BLAST!' : 'CHARGED BLAST!', power > 0.8 ? 5 : (power > 0.5 ? 4 : 3));
    }
}
if (typeof window !== 'undefined') window.fireChargedBlast = fireChargedBlast;

function checkWeaponHits(targetPosition) {
    const hitRadius = 300;  // Increased from 150 to 300 for better mouse aiming hit detection (2x larger hitboxes)

    // Check BORG drone hits (from outer interstellar systems)
    if (typeof outerInterstellarSystems !== 'undefined') {
        const droneWorldPos = new THREE.Vector3();
        outerInterstellarSystems.forEach(system => {
            if (!system.userData || !system.userData.drones) return;

            system.userData.drones.forEach((drone, droneIndex) => {
                if (drone.userData.health <= 0) return;

                // FIXED: Use world position for hit detection (drones are children of system group)
                drone.getWorldPosition(droneWorldPos);
                const distance = droneWorldPos.distanceTo(targetPosition);
                if (distance < hitRadius) { // Normal hit radius
                    const damage = (typeof gameState !== 'undefined' && gameState._chargedShot) ? Math.round(2 + (gameState._chargedPower || 0.5) * 6) : 1;
                    drone.userData.health -= damage;

                    flashEnemyHit(drone, damage);
                    // Borg fights happen at long range — float a HIT confirm
                    // (kill-text style) so distant shots visibly land.
                    if (typeof spawnKillText === 'function' &&
                        Date.now() - (drone.userData._lastHitTextAt || 0) > 400) {
                        drone.userData._lastHitTextAt = Date.now();
                        spawnKillText(droneWorldPos, 'HIT', '#88ff88');
                    }
                    if (typeof createHitSparks === 'function') {
                        createHitSparks(droneWorldPos, 0x88ff88);
                    }
                    playSound('weapon');
                    const maxHp = drone.userData.maxHealth || 100;
                    showAchievement('BORG Hit!', `${drone.userData.name} damaged (${drone.userData.health}/${maxHp} HP)`);

                    if (drone.userData.health <= 0) {
                        const cubeSize = drone.userData.cubeSize || 30;
                        drone.getWorldPosition(droneWorldPos);
                        createMassiveBorgExplosion(droneWorldPos, cubeSize);
                        playSound('explosion');

                        if (drone.userData.isBorgCube) {
                            // Full cube destroyed — clean up swarm drones
                            showAchievement('🎉 LEGENDARY VICTORY!', `BORG Cube destroyed! The threat is neutralized!`, true);
                            if (typeof stopBorgAlarm === 'function') stopBorgAlarm();
                            if (typeof playBossVictoryMusic === 'function') setTimeout(() => playBossVictoryMusic(), 500);
                            if (drone.userData.drones) {
                                drone.userData.drones.forEach(d => {
                                    if (d && d.parent) d.parent.remove(d);
                                    const oi = system.userData.orbiters.indexOf(d);
                                    if (oi > -1) system.userData.orbiters.splice(oi, 1);
                                });
                            }
                            // Reward: refill missiles
                            if (gameState.missiles) {
                                gameState.missiles.current = gameState.missiles.capacity || 10;
                                showAchievement('ULTIMATE REWARD', `Missiles fully restored! (${gameState.missiles.current})`, true);
                            }
                        } else {
                            showAchievement('BORG DRONE DESTROYED!', `${drone.userData.name} eliminated!`);
                        }

                        // Remove from scene and arrays
                        if (drone.parent) drone.parent.remove(drone);
                        system.userData.drones.splice(droneIndex, 1);
                        const orbiterIndex = system.userData.orbiters.indexOf(drone);
                        if (orbiterIndex > -1) {
                            system.userData.orbiters.splice(orbiterIndex, 1);
                        }
                    }
                }
            });
        });
    }

    // Check enemy hits
    if (typeof enemies !== 'undefined') {
        enemies.forEach((enemy, enemyIndex) => {
            if (enemy.userData.health <= 0) return;

            // FIXED: Use hitbox size matching scaled model (like asteroids)
            // Calculate hitbox if not already stored (should be set at creation time)
            if (enemy.userData.hitboxSize === undefined) {
                try {
                    const box = new THREE.Box3().setFromObject(enemy);
                    const size = new THREE.Vector3();
                    box.getSize(size);
                    // Store largest dimension as hitbox size (diameter)
                    enemy.userData.hitboxSize = Math.max(size.x, size.y, size.z);
                } catch (e) {
                    // Fallback: use reasonable default for 96x scaled model
                    enemy.userData.hitboxSize = 96; // Approximate size of scaled model
                }
            }

            // Hitbox detection with safety margin. CRITICAL: cap the hitbox
            // size at 200u — many enemies have a 40u invisible hitbox sphere
            // added as a child of a 96x-scaled GLB model, which makes the
            // bounding box ~3840u in world space. Without the cap, the
            // proximity check fired weapon sounds for 20-30 enemies at once
            // on every shot — the actual cause of the "loud-then-fades"
            // pattern, not browser limiter behavior.
            const safetyMargin = 20;
            const sanitizedHitbox = Math.min(enemy.userData.hitboxSize || 96, 200);
            const collisionDistance = sanitizedHitbox / 2 + safetyMargin;
            const distance = enemy.position.distanceTo(targetPosition);

            if (distance < collisionDistance) {
                // Orange combat shield intercepts laser fire first — 1st
                // hit flashes red & holds, 2nd hit shatters it. Either way
                // no health damage passes while the shield is up.
                if (typeof _enemyShieldAbsorbHit === 'function' &&
                    _enemyShieldAbsorbHit(enemy, false)) {
                    _activateOnDamage(enemy);
                    return; // shield ate the shot
                }
                const damage = (typeof gameState !== 'undefined' && gameState._chargedShot) ? Math.round(2 + (gameState._chargedPower || 0.5) * 6) : 1; // charged blast = 4x
                enemy.userData.health -= damage;
                enemy.userData.lastHitTime = Date.now();
                _activateOnDamage(enemy);

                // Knockback: laser hits shove the target along the shot
                // line (doubled per playtest). The position nudge survives
                // the AI's render interpolation (behaviors continue from
                // the moved spot), which smooths it into a visible recoil.
                if (typeof camera !== 'undefined' && enemy.position) {
                    const _kb = enemy.position.clone().sub(camera.position).normalize();
                    enemy.position.addScaledVector(_kb, 6);
                    if (enemy.userData.velocity && enemy.userData.velocity.addScaledVector) {
                        enemy.userData.velocity.addScaledVector(_kb, 0.15);
                    }
                }

                // ENHANCED: Use improved hit effect with color changes
                flashEnemyHit(enemy, damage);
                // Impact sparks at the hit point (pairs with the knockback)
                if (typeof createHitSparks === 'function') {
                    createHitSparks(targetPosition || enemy.position, enemy.userData.galaxyColor || 0xffcc66);
                }
                // Floating HIT marker on EVERY hit (kill-text style), with a
                // per-enemy throttle so rapid auto-fire on one target can't
                // stack text. Was gated to >700u; players liked it, so it now
                // pops at all ranges. Occasional "CRIT!" for variety/punch.
                if (typeof spawnKillText === 'function' &&
                    Date.now() - (enemy.userData._lastHitTextAt || 0) > 300) {
                    enemy.userData._lastHitTextAt = Date.now();
                    const crit = Math.random() < 0.18;
                    // Size scales with proximity — a close hit reads big.
                    const _hd = camera.position.distanceTo(enemy.position);
                    const _hs = (typeof killTextSizeForDistance === 'function') ? killTextSizeForDistance(_hd) : 15;
                    // HIT and CRIT share the size (matches +MISSILE at mid range);
                    // CRIT is distinguished by its word + orange color, not size.
                    spawnKillText(enemy.position, crit ? 'CRIT!' : 'HIT',
                        crit ? '#ff8844' : '#ffee88', _hs);
                }
                playSound('weapon');
                showAchievement('Target Hit!', `Damaged ${enemy.userData.name} (${enemy.userData.health}/${enemy.userData.maxHealth} HP)`);
                
                // FIXED: Only explode and remove when enemy actually dies
if (enemy.userData.health <= 0) {
    // Check if this was a boss BEFORE removing it
    const wasBoss = enemy.userData.isBoss;
    const bossName = enemy.userData.name;

    // Reputation + small energy refund for the kill (handles boss
    // bonuses internally: max-energy refill + warp charge).
    if (typeof awardKillReward === 'function') awardKillReward(enemy);

    // Record the kill position for elite guardian spawning
    if (typeof recordEnemyKillPosition === 'function') {
        recordEnemyKillPosition(enemy);
    }
    
    // Update nebula intel system - check if cluster is cleared, turn line white
    if (typeof updateClusterStatus === 'function') {
        updateClusterStatus(enemy);
    }
    
    // Track area clearing for Mission Command notifications
    if (typeof areaClearTracker !== 'undefined' && areaClearTracker.onEnemyDestroyed) {
        areaClearTracker.onEnemyDestroyed(enemy);
    }
    
    // Check for species elimination - triggers distress beacon and boss spawn
    if (typeof distressBeaconSystem !== 'undefined' && distressBeaconSystem.onEnemyDestroyed) {
        distressBeaconSystem.onEnemyDestroyed(enemy);
    }
    
    // Enemy destroyed - NOW create explosion and remove. Bosses and
    // elite/black-hole guardians get the larger multi-stage detonation
    // so the player feels the weight of the kill; regulars use the
    // standard puff.
    const _enemyUD = enemy.userData || {};
    const _bigKill = _enemyUD.isBoss || _enemyUD.isEliteGuardian || _enemyUD.isBlackHoleGuardian;
    const _isBorg = _enemyUD.isBorgCube || _enemyUD.type === 'borg_drone' || _enemyUD.isBorg;
    // Martian Pirates (but NOT Vulcan Patrols — they share galaxyId 7)
    // keep the original simple explosion the player is used to.
    const _isPirate = _enemyUD.isMartianPirate && !_enemyUD.isVulcanPatrol;
    if (_isBorg && typeof createMassiveBorgExplosion === 'function') {
        createMassiveBorgExplosion(enemy.position, _enemyUD.cubeSize || 30);
        playSound('explosion');
    } else if (_bigKill && typeof createBossExplosion === 'function') {
        const _color = _enemyUD.galaxyColor || 0xff5522;
        createBossExplosion(enemy.position, {
            color: _color,
            scale: _enemyUD.isBoss ? 1.8 : 1.3
        });
    } else if (_isPirate) {
        // Martian Pirate kills roll one of three explosion variants; the
        // explosion color IS the loot tell (see PIRATE_EXPLOSION_VARIANTS):
        // red ember → hull, gold flare → energy, cyan plasma → missile.
        const _roll = Math.random();
        const _variant = _roll < 0.55 ? 'ember' : (_roll < 0.85 ? 'flare' : 'plasma');
        _enemyUD._pirateLootVariant = _variant;
        if (typeof createPirateExplosionVariant === 'function') {
            createPirateExplosionVariant(enemy.position, _variant);
        } else {
            createExplosionEffect(enemy.position, 0xff4444, 15);
        }
        playSound('explosion');
    } else if (typeof createFactionExplosion === 'function' &&
               typeof _enemyUD.galaxyId === 'number') {
        // Regular hostile: faction-flavoured death effect. Hostiles in
        // the black-hole (distant, non-local) galaxies detonate at half
        // diameter; the local-galaxy fights keep full size.
        createFactionExplosion(enemy.position, _enemyUD.galaxyId,
            isEnemyInLocalGalaxy(enemy) ? 1.0 : 0.5);
    } else {
        createExplosionEffect(enemy.position, 0xff4444, 15);
        playSound('explosion');
    }
    
    // UFOs always drop missiles when destroyed
    if (enemy.userData.isUFO || enemy.userData.alwaysDropMissile) {
        // Spawn a missile pickup at the UFO's position
        if (typeof spawnMissilePickup === 'function') {
            spawnMissilePickup(enemy.position.clone());
            console.log('🛸 UFO destroyed - missile dropped!');
        } else {
            // Fallback: just add a missile directly. gameState.missiles is
            // an object ({current, capacity, ...}) — earlier code here
            // overwrote it with a number, which made the HUD read
            // "Missiles: undefined/undefined" from that point on.
            if (typeof gameState !== 'undefined' && gameState.missiles &&
                typeof gameState.missiles.current === 'number') {
                const cap = gameState.missiles.capacity || 10;
                gameState.missiles.current = Math.min(cap, gameState.missiles.current + 1);
                showAchievement('MISSILE ACQUIRED!',
                    `Alien technology salvaged! (${gameState.missiles.current}/${cap})`);
            }
        }
    }
    
    if (wasBoss) {
    showAchievement('BOSS DEFEATED!', `${bossName} destroyed!`);
    // Flagship kill: full-screen flash + bullet-time slow-mo as it dies.
    if (window.arcade) {
        window.arcade.flash('rgba(255,200,80,0.9)', 0.85);
        window.arcade.slowmo(700);
    }
    // Top-tier arcade praise for a flagship kill, naming the faction
    if (typeof flashArcadeText === 'function') {
        const _bw = ['TARGET ELIMINATED!', 'THREAT NEUTRALIZED!', 'FLAGSHIP DOWN!', 'REALITY BENT!'];
        let _bsub = null;
        try {
            const _f = (enemy.userData.isVulcanPatrol) ? 'VULCAN HIGH COMMAND'
                : (enemy.userData.isMartianPirate) ? 'MARTIAN PIRATES'
                : (typeof galaxyTypes !== 'undefined' && galaxyTypes[enemy.userData.galaxyId] ? String(galaxyTypes[enemy.userData.galaxyId].faction).toUpperCase() : null);
            if (_f) _bsub = _f + ' FLAGSHIP DESTROYED';
        } catch (_) {}
        flashArcadeText(_bw[Math.floor(Math.random() * _bw.length)], 6, _bsub);
    }
    // Call boss victory check and fireworks
    if (typeof checkBossVictory === 'function') {
        checkBossVictory(enemy);
    }
    // FIREWORKS CELEBRATION!
    if (typeof createFireworkCelebration === 'function') {
        createFireworkCelebration();
    }
    // BOSS CELEBRATION MUSIC!
    playBossVictoryMusic();
    // When boss is defeated, switch back to ambient music (after celebration)
    setTimeout(() => {
        if (typeof switchToAmbientMusic === 'function') {
            switchToAmbientMusic();
        }
    }, 800); // Wait for celebration music to finish
} else {
    showAchievement('Enemy Destroyed!', `${enemy.userData.name} eliminated`);

    // Floating kill text at the kill position — loot-colored for pirates
    // (matches the explosion variant), gold rep text otherwise.
    if (typeof spawnKillText === 'function') {
        const _kv = enemy.userData._pirateLootVariant;
        if (_kv === 'flare') spawnKillText(enemy.position, '+ENERGY', '#ffcc33');
        else if (_kv === 'plasma') spawnKillText(enemy.position, '+MISSILE', '#33ddff');
        else if (_kv === 'ember') spawnKillText(enemy.position, '+HULL', '#ff6644');
        else spawnKillText(enemy.position, '+REP', '#ffcc44');
    }
    // Big tiered arcade praise, upper-middle of the screen (streak-aware).
    // Distance gates the basic words to far kills; the killed enemy's
    // userData drives the "<FACTION> ELIMINATED" subtitle.
    if (typeof arcadePraiseKill === 'function') {
        arcadePraiseKill(false, (typeof camera !== 'undefined') ? camera.position.distanceTo(enemy.position) : 0, enemy.userData);
    }
    // Arcade: score + combo + floating number, and a meaty hitstop.
    if (window.arcade) {
        window.arcade.addKill(enemy.userData, enemy.position, !!enemy.userData.isBoss);
        window.arcade.hitstop(enemy.userData.isBoss ? 90 : 45);
    }

    const _lootVariant = enemy.userData._pirateLootVariant;
    if (_lootVariant === 'flare') {
        // Gold flare explosion → energy cells
        gameState.energy = Math.min(gameState.maxEnergy || 100, (gameState.energy || 0) + 20);
        showAchievement('Energy Cells Recovered!', '+20 energy salvaged from the golden flare');
    } else if (_lootVariant === 'plasma' &&
               gameState.missiles.current < gameState.missiles.capacity) {
        // Cyan plasma explosion → guaranteed missile
        gameState.missiles.current++;
        showAchievement('Missile Recovered!',
            `Plasma-burst salvage (${gameState.missiles.current}/${gameState.missiles.capacity})`);
    } else if (!_lootVariant &&
               Math.random() < 0.3 && gameState.missiles.current < gameState.missiles.capacity) {
        // Non-pirate kills keep the original 30% missile chance
        gameState.missiles.current++;
        showAchievement('Missile Recovered!',
            `+1 missile from debris (${gameState.missiles.current}/${gameState.missiles.capacity})`);
    }
    // ('ember' variant pays out through the hull-recovery bonus below.)
}

    // Hull recovery from defeating enemies. Red-ember pirate kills add a
    // +8 salvage bonus — that's their loot identity.
    const _emberBonus = (enemy.userData._pirateLootVariant === 'ember') ? 8 : 0;
    const hullRecovery = wasBoss ? 15 + Math.random() * 15 : 5 + Math.random() * 10 + _emberBonus; // More recovery for bosses
    if (typeof gameState !== 'undefined' && gameState.hull !== undefined) {
        gameState.hull = Math.min(gameState.maxHull || 100, gameState.hull + hullRecovery);
        showAchievement('Hull Repaired', `+${hullRecovery.toFixed(1)} hull integrity from salvage`);
    }
    
    // Clear target lock if this was the target
    if (gameState.targetLock.target === enemy) {
        gameState.targetLock.target = null;
    }
    if (gameState.currentTarget === enemy) {
        gameState.currentTarget = null;
    }
    
    // FIXED: Remove enemy from scene and array
    scene.remove(enemy);
    enemies.splice(enemyIndex, 1);
    
    // FIXED: Trigger immediate navigation update
    if (typeof populateTargets === 'function') {
        setTimeout(populateTargets, 100); // Update targets quickly
    }
    
    // Check for galaxy clear
    checkGalaxyClear();
    
    // 🏆 VICTORY SYSTEM: Check if guardians defeated → galaxy liberated
    checkGuardianVictory();

    // ENHANCED: Check if we should spawn area bosses, galaxy bosses, or elite guardians
    if (typeof checkAndSpawnAreaBosses === 'function') {
        checkAndSpawnAreaBosses();
    }
    if (typeof checkGalaxyBossSpawn === 'function') {
        checkGalaxyBossSpawn();
    }
    if (typeof checkSpeciesBossSpawn === 'function') {
        checkSpeciesBossSpawn();
    }
    if (typeof checkAndSpawnEliteGuardians === 'function') {
        checkAndSpawnEliteGuardians();
    }
                    
                    // Check if this was a boss that was defeated
					if (enemy.userData.isBoss || enemy.userData.isEliteGuardian) {
    				const wasVictory = checkBossVictory(enemy);
    				if (wasVictory) {
        			// ⭐ NEW: Award warp for defeating boss
        			if (gameState.emergencyWarp && gameState.emergencyWarp.available < gameState.emergencyWarp.maxWarps) {
            			gameState.emergencyWarp.available++;
            			showAchievement('BOSS DEFEATED!', `${enemy.userData.name} destroyed! +1 Warp Earned (${gameState.emergencyWarp.available}/${gameState.emergencyWarp.maxWarps})`);
        			} else {
            			showAchievement('BOSS DEFEATED!', `${enemy.userData.name} destroyed!`);
        			}
        			// Call firework celebration here
        			if (typeof createFireworkCelebration === 'function') {
            		createFireworkCelebration();
        }
    }
}
                }
                
                playSound('hit');
            }
        });
    }
    
    // REMOVED: Asteroid checks - asteroids should only be hit by direct raycasting
    // The fallback checkWeaponHits() is for enemies that are near the aim line,
    // not for asteroids. Asteroids require precise aim with direct raycast hits.
}

// =============================================================================
// 🎯 MISSION PROGRESSION - PHASE 2: BOSS BATTLE CHECK
// =============================================================================
// Called after every enemy death to detect when all regular enemies + boss defeated
// Triggers: Guardian spawn, Mission Command alert, boss victory music
// Does NOT increment galaxiesCleared - that happens in checkGuardianVictory()
// See: PROGRESSION_SYSTEM.md for full mission flow
// =============================================================================

function checkGalaxyClear() {
    if (typeof enemies === 'undefined' || typeof gameState === 'undefined') return;
    
    if (!gameState.currentGalaxyEnemies) {
        gameState.currentGalaxyEnemies = {};
    }
    
    // Find which galaxy was just cleared by checking enemy positions
    let clearedGalaxyId = -1;
    let clearedGalaxyType = null;
    
    // Check each galaxy for remaining REGULAR enemies (excluding guardians and bosses)
    for (let g = 0; g < 8; g++) {
        // Count only regular enemies (not guardians, not bosses, not boss support)
        const regularEnemies = enemies.filter(enemy => 
            enemy.userData &&
            enemy.userData.health > 0 &&
            enemy.userData.galaxyId === g &&
            !enemy.userData.isBoss &&
            !enemy.userData.isBossSupport
            // Black-hole guardians COUNT toward the clear (campaign design:
            // the galaxy is liberated only when its faction's forces AND
            // all 3 core guardians are down). They spawn with the third
            // discovery path, so they exist before any clear can happen.
        );
        
        // Check if boss has been defeated for this galaxy
        const bossDefeated = (typeof bossSystem !== 'undefined' && bossSystem.galaxyBossDefeated && bossSystem.galaxyBossDefeated[g]);
        
        // Galaxy is only "cleared" when:
        // 1. All regular enemies are defeated
        // 2. Boss has been defeated
        // 3. We haven't already marked it as cleared
        if (regularEnemies.length === 0 && bossDefeated && gameState.currentGalaxyEnemies[g] > 0) {
            clearedGalaxyId = g;
            clearedGalaxyType = galaxyTypes[g];
            gameState.currentGalaxyEnemies[g] = 0;
            break;
        }
    }
    
    // If we found a cleared galaxy (regular enemies + boss defeated)
    if (clearedGalaxyId >= 0 && clearedGalaxyType) {
        // DO NOT increment galaxiesCleared yet - that happens after guardians
        
        // Mark boss as defeated
        if (typeof bossSystem !== 'undefined') {
            bossSystem.galaxyBossDefeated[clearedGalaxyId] = true;
        }
        
        // Play victory music
        playBossVictoryMusic();
        
        // Show intermediate achievement
        showAchievement('Boss Defeated!', `${clearedGalaxyType.name} Galaxy boss eliminated! Guardians remain...`);
        
        // Mission Control message about guardians
        setTimeout(() => {
            if (typeof showMissionCommandAlert === 'function') {
                showMissionCommandAlert('Mission Control',
                    `Boss down, Captain. ${clearedGalaxyType.name} Galaxy still has guardians — clear them to liberate the sector.`,
                    true);
            }
        }, 2000);
        
        // Refresh galaxy map
        if (typeof setupGalaxyMap === 'function') {
            setupGalaxyMap();
        }
        
        refreshEnemyDifficulty();
    }
}

// =============================================================================
// =============================================================================
// 🏆 MISSION PROGRESSION - PHASE 3: GUARDIAN VICTORY CHECK
// =============================================================================
// Called after every enemy death to detect when all guardians defeated
// THIS is where galaxiesCleared increments (0 → 1 → 2 → ... → 8)
// Triggers: "Galaxy Liberation Complete" message, victory music, fireworks
// At 8/8 galaxies: Campaign victory screen appears
// See: PROGRESSION_SYSTEM.md for full mission flow
// =============================================================================

function checkGuardianVictory() {
    if (typeof enemies === 'undefined' || typeof gameState === 'undefined') return;
    
    if (!gameState.currentGalaxyEnemies) {
        gameState.currentGalaxyEnemies = {};
    }
    
    // Check each galaxy for remaining guardians
    for (let g = 0; g < 8; g++) {
        // Only check galaxies where boss was defeated.  Guard against
        // galaxyBossDefeated being undefined (sister checks already do this).
        if (typeof bossSystem === 'undefined' ||
            !bossSystem.galaxyBossDefeated ||
            !bossSystem.galaxyBossDefeated[g]) {
            continue;
        }
        
        // Check if guardians have been cleared
        if (typeof bossSystem !== 'undefined' && bossSystem.galaxyGuardiansDefeated && bossSystem.galaxyGuardiansDefeated[g]) {
            continue; // Already liberated
        }
        
        // Count remaining guardians for this galaxy
        const remainingGuardians = enemies.filter(enemy => 
            enemy.userData && 
            enemy.userData.health > 0 && 
            enemy.userData.galaxyId === g &&
            enemy.userData.isBlackHoleGuardian === true
        );
        
        // If all guardians defeated, galaxy is truly liberated!
        if (remainingGuardians.length === 0) {
            const galaxyType = galaxyTypes[g];
            
            // Mark guardians as defeated
            if (typeof bossSystem !== 'undefined') {
                if (!bossSystem.galaxyGuardiansDefeated) {
                    bossSystem.galaxyGuardiansDefeated = {};
                }
                bossSystem.galaxyGuardiansDefeated[g] = true;
            }
            
            // NOW increment galaxy clear count
            gameState.galaxiesCleared = (gameState.galaxiesCleared || 0) + 1;

            // Arcade: RANK stamp on sector clear (grade by hull remaining).
            if (window.arcade) {
                const _hp = (gameState.maxHull ? (gameState.hull / gameState.maxHull) : 1);
                const _rank = _hp > 0.85 ? 'S' : _hp > 0.6 ? 'A' : _hp > 0.35 ? 'B' : 'C';
                window.arcade.grade(_rank, 'SECTOR LIBERATED');
                window.arcade.flash('rgba(120,255,160,0.7)', 0.6);
            }

            // Play galaxy victory music
            playGalaxyVictoryMusic();

            // Launch fireworks celebration
            if (typeof createFireworkCelebration === 'function') {
                createFireworkCelebration();
            }

            // Show FINAL liberation achievement
            showAchievement(`Galaxy Liberation Complete - ${galaxyType.name}`, `${galaxyType.name} Galaxy (${galaxyType.faction}) completely liberated!`);

            // Victory-replay highlight: liberations anchor the montage
            if (typeof window !== 'undefined' && window.replaySystem) {
                window.replaySystem.record('Liberated the ' + galaxyType.name + ' Galaxy', 4);
            }

            // OPTIONAL DEEP-SPACE EXPEDITION: a path opens from this freed
            // core out toward UFO/Borg territory. Explicitly optional — the
            // directive below steers the player to the next nebula instead.
            if (typeof createDiscoveryPathToPosition === 'function' &&
                typeof findGalaxyCoreById === 'function') {
                const _core = findGalaxyCoreById(g);
                if (_core) {
                    const _woo = (typeof window !== 'undefined' && window.worldOriginOffset) || { x: 0, y: 0, z: 0 };
                    const _deep = new THREE.Vector3(78000 - _woo.x, 2000 - _woo.y, 8000 - _woo.z);
                    // AT MOST ONE deepspace line: each liberation used to add
                    // another green line (up to 8 by campaign's end). Retire
                    // the previous one — the invitation simply moves to the
                    // freshest freed core.
                    if (typeof discoveryPaths !== 'undefined' && typeof _disposeDiscoveryPath === 'function') {
                        for (let _di = discoveryPaths.length - 1; _di >= 0; _di--) {
                            const _dud = discoveryPaths[_di] && discoveryPaths[_di].line && discoveryPaths[_di].line.userData;
                            if (_dud && _dud.pathType === 'deepspace') {
                                _disposeDiscoveryPath(discoveryPaths[_di]);
                                discoveryPaths.splice(_di, 1);
                            }
                        }
                    }
                    // galaxyId -1: no mission-enemy snapshot/relocation — this
                    // line is an invitation, not a tracked mission.
                    createDiscoveryPathToPosition(_core.position.clone(), _deep, 0x00ff66, 'Deep Space', 'deepspace', -1);
                    setTimeout(() => {
                        if (typeof showIncomingTransmission === 'function') {
                            showIncomingTransmission('Mission Control - Optional Expedition',
                                'With this sector free, long-range sensors reach the deep field: UFO anomalies and BORG signatures beyond the rim.\n\n' +
                                'The green line marks an OPTIONAL expedition — dangerous, no reinforcements.\n\n' +
                                'Priority remains the campaign: make for the next twin nebula and keep liberating, Captain.', 0x00ff66);
                        }
                    }, 6000);
                }
            }
            
            // Mission Control message
            const remainingGalaxies = 8 - gameState.galaxiesCleared;
            let missionControlMessage = '';
            
            if (remainingGalaxies > 0) {
                missionControlMessage = `${galaxyType.name} Galaxy liberated — ${galaxyType.faction} purged. ${remainingGalaxies} ${remainingGalaxies === 1 ? 'galaxy remains' : 'galaxies remain'}.`;
            } else {
                missionControlMessage = `All hostiles eliminated. The universe is safe — well done, Captain.`;
            }
            
            setTimeout(() => {
                if (typeof showMissionCommandAlert === 'function') {
                    showMissionCommandAlert('Mission Control', missionControlMessage, true);
                }
            }, 2000);
            
            // Refresh galaxy map to show liberated status
            if (typeof setupGalaxyMap === 'function') {
                setupGalaxyMap();
            }
            
            // Check for total victory — the campaign win: fireworks land,
            // then the BEST-MOMENTS SPECTATOR REPLAY rolls (victory-replay.js).
            if (gameState.galaxiesCleared >= 8) {
                showAchievement('Victory!', 'All galaxies liberated! Universe saved!');
                playVictoryMusic();
                if (typeof window !== 'undefined' && window.replaySystem) {
                    setTimeout(() => { try { window.replaySystem.start(); } catch (e) {} }, 4000);
                }
            }
            
            break; // Only process one galaxy per check
        }
    }
}


// =============================================================================
// BORG CUBE ENCOUNTER SYSTEM
// =============================================================================

const BORG_MESSAGES = [
    "Resistance is futile.",
    "You will be assimilated.",
    "Your biological and technological distinctiveness will be added to our own.",
    "We are the Borg. Lower your shields and surrender your ships.",
    "Freedom is irrelevant. Self-determination is irrelevant.",
    "You will adapt to service us.",
    "Strength is irrelevant. Resistance is futile.",
    "We are Borg. Existence as you know it is over."
];

// Borg ominous alarm system
let borgAlarmOscillator = null;
let borgAlarmGain = null;
let borgAlarmActive = false;

function startBorgAlarm() {
    if (borgAlarmActive || !audioContext || audioContext.state === 'suspended') return;

    // Cinematic arrival card alongside the alarm. Cooldown: the alarm can
    // churn on/off at the range boundary (and this fn is called per frame),
    // so without it the card re-fires endlessly and stacks into a smear.
    if (typeof flashEventText === 'function' &&
        Date.now() - (window._lastBorgCardAt || 0) > 25000) {
        window._lastBorgCardAt = Date.now();
        flashEventText('⬢ THE BORG ⬢', '#33ff55', 'RESISTANCE IS FUTILE');
    }
    
    try {
        borgAlarmOscillator = audioContext.createOscillator();
        borgAlarmGain = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();
        
        borgAlarmOscillator.connect(filter);
        filter.connect(borgAlarmGain);
        borgAlarmGain.connect(audioContext.destination);
        
        // Low ominous drone
        borgAlarmOscillator.type = 'sawtooth';
        borgAlarmOscillator.frequency.setValueAtTime(55, audioContext.currentTime);  // Very low A
        
        // Pulsing effect via LFO on gain
        const lfo = audioContext.createOscillator();
        const lfoGain = audioContext.createGain();
        lfo.connect(lfoGain);
        lfoGain.connect(borgAlarmGain.gain);
        
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.5, audioContext.currentTime);  // Slow pulse
        lfoGain.gain.setValueAtTime(0.08, audioContext.currentTime);
        
        // Low pass filter for ominous rumble
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200, audioContext.currentTime);
        filter.Q.setValueAtTime(2, audioContext.currentTime);
        
        // Base gain
        borgAlarmGain.gain.setValueAtTime(0.15, audioContext.currentTime);
        
        borgAlarmOscillator.start();
        lfo.start();
        borgAlarmActive = true;
        
        console.log('🔊 Borg alarm started');
    } catch (e) {
        console.warn('Failed to start Borg alarm:', e);
    }
}

function stopBorgAlarm() {
    if (!borgAlarmActive) return;
    
    try {
        if (borgAlarmGain) {
            borgAlarmGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
        }
        setTimeout(() => {
            if (borgAlarmOscillator) {
                borgAlarmOscillator.stop();
                borgAlarmOscillator = null;
            }
            borgAlarmGain = null;
            borgAlarmActive = false;
            console.log('🔇 Borg alarm stopped');
        }, 600);
    } catch (e) {
        borgAlarmActive = false;
    }
}

// Borg cubes now live in BORG patrol systems (outer-systems.js).
// checkBorgSpawn / spawnBorgCube / spawnBorgDrone / updateBorgBehavior removed.
// Combat behavior handled by updateBorgPatrolCombat in outer-systems.js.
function checkBorgSpawn() {}
function updateBorgBehavior() {}

// =============================================================================
// MISSILE SYSTEM
// =============================================================================

// Missile System
function fireMissile() {
    // Resume audio context on user interaction to fix suspended state warning
    resumeAudioContext();

    if (typeof shieldSystem !== 'undefined' && shieldSystem.active) {
        showAchievement('Missiles Disabled', 'Shields must be deactivated first');
        return;
    }

    if (gameState.missiles.cooldown > 0 || gameState.missiles.current <= 0) {
        if (gameState.missiles.current <= 0) {
            showAchievement('No Missiles', 'Missiles depleted - defeat enemies for resupply');
        }
        return;
    }

    gameState.missiles.current--;
    gameState.missiles.cooldown = gameState.missiles.cooldownTime;

    let targetObject = null;
    let targetPosition;

    // Missiles can use navigation panel targets from distance
    if (gameState.currentTarget) {
        targetPosition = gameState.currentTarget.position.clone();
        targetObject = gameState.currentTarget;
    } else if (gameState.targetLock.active && gameState.targetLock.target) {
        targetPosition = gameState.targetLock.target.position.clone();
        targetObject = gameState.targetLock.target;
    } else {
        const mousePos = new THREE.Vector2(
            (gameState.crosshairX / window.innerWidth) * 2 - 1,
            -(gameState.crosshairY / window.innerHeight) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mousePos, camera);
        const enemyIntersects = raycaster.intersectObjects(enemies);

        if (enemyIntersects.length > 0) {
            targetPosition = enemyIntersects[0].point;
            targetObject = enemyIntersects[0].object;
        } else {
            const direction = raycaster.ray.direction.clone();
            targetPosition = camera.position.clone().add(direction.multiplyScalar(1000));
        }
    }

    // Use ship model position if available, otherwise camera position
    const missileOrigin = (window.cameraState && window.cameraState.playerShipMesh) 
        ? window.cameraState.playerShipMesh.position.clone()
        : camera.position.clone();
    createMissile(missileOrigin, targetPosition, targetObject);
    playSound('missile_launch');
    updateMissileUI();
}

function createMissile(startPos, targetPos, targetObject) {
    // A missile in the air is the loudest threat there is — the target
    // breaks immediately (split-S), which is what sells the chase.
    if (targetObject && targetObject.userData && targetObject.userData.type === 'enemy' &&
        typeof _tryStartEvasive === 'function') {
        targetObject.userData._underFireUntil = Date.now() + 2200;
        _tryStartEvasive(targetObject, 'missile');
    }
    const missileGeometry = new THREE.CylinderGeometry(0.3, 0.5, 2, 8);
    const missileMaterial = new THREE.MeshBasicMaterial({ color: 0xff3300 });
    const missile = new THREE.Mesh(missileGeometry, missileMaterial);

    missile.position.copy(startPos);
    const direction = new THREE.Vector3().subVectors(targetPos, startPos).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const axis = new THREE.Vector3().crossVectors(up, direction);
    const angle = Math.acos(up.dot(direction));
    if (axis.length() > 0.001) {
        missile.setRotationFromAxisAngle(axis.normalize(), angle);
    }

    // Glow effect
    const glowGeometry = new THREE.CylinderGeometry(0.5, 0.7, 2.5, 8);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xff6600,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    missile.add(glow);

    // Smoke trail
    const trailGeometry = new THREE.CylinderGeometry(0.2, 0.4, 1, 6);
    const trailMaterial = new THREE.MeshBasicMaterial({
        color: 0x666666,
        transparent: true,
        opacity: 0.6
    });
    const trail = new THREE.Mesh(trailGeometry, trailMaterial);
    trail.position.y = -1.5;
    missile.add(trail);

    scene.add(missile);

    missile.userData = {
        velocity: direction.clone().multiplyScalar(gameState.missiles.speed),
        target: targetObject,
        lifetime: 0,
        maxLifetime: 5000,
        type: 'missile'
    };

    if (!window.activeMissiles) window.activeMissiles = [];
    window.activeMissiles.push(missile);
}

function updateMissiles() {
    if (!window.activeMissiles) return;

    window.activeMissiles = window.activeMissiles.filter(missile => {
        missile.userData.lifetime += (typeof gameState !== 'undefined' && gameState.dtMs) || 16.67;

        if (missile.userData.lifetime > missile.userData.maxLifetime) {
            scene.remove(missile);
            return false;
        }

        // Tracking
        if (missile.userData.target && missile.userData.target.userData.health > 0) {
            const targetDir = new THREE.Vector3()
                .subVectors(missile.userData.target.position, missile.position)
                .normalize();
            missile.userData.velocity.lerp(
                targetDir.multiplyScalar(gameState.missiles.speed),
                0.05
            );
        }

        missile.position.add(missile.userData.velocity);

        const up = new THREE.Vector3(0, 1, 0);
        const axis = new THREE.Vector3().crossVectors(up, missile.userData.velocity.clone().normalize());
        const angle = Math.acos(up.dot(missile.userData.velocity.clone().normalize()));
        if (axis.length() > 0.001) {
            missile.setRotationFromAxisAngle(axis.normalize(), angle);
        }

        // Hit detection
        if (typeof enemies !== 'undefined') {
            for (let enemy of enemies) {
                if (enemy.userData.health <= 0) continue;
                if (missile.position.distanceTo(enemy.position) < 15) {
                    handleMissileHit(missile, enemy);
                    return false;
                }
            }
        }

        // Cosmic feature destruction
        if (typeof cosmicFeatures !== 'undefined') {
            // Check Dyson Spheres
            if (cosmicFeatures.dysonSpheres) {
                for (let sphere of cosmicFeatures.dysonSpheres) {
                    if (sphere.userData.destroyed) continue;
                    const distance = missile.position.distanceTo(sphere.position);
                    if (distance < 100) {
                        handleCosmicFeatureDestruction(missile, sphere, 'dyson');
                        return false;
                    }
                }
            }

            // Check Crystal structures
            if (cosmicFeatures.crystalStructures) {
                for (let crystal of cosmicFeatures.crystalStructures) {
                    if (crystal.userData.destroyed) continue;
                    const distance = missile.position.distanceTo(crystal.position);
                    if (distance < 50) {
                        handleCosmicFeatureDestruction(missile, crystal, 'crystal');
                        return false;
                    }
                }
            }

            // Check Space Whales
            if (cosmicFeatures.spaceWhales) {
                for (let whale of cosmicFeatures.spaceWhales) {
                    if (whale.userData.destroyed) continue;
                    const distance = missile.position.distanceTo(whale.position);
                    if (distance < 80) {
                        handleCosmicFeatureDestruction(missile, whale, 'whale');
                        return false;
                    }
                }
            }
        }

        return true;
    });
}

function handleMissileHit(missile, enemy) {
    scene.remove(missile);

    // A missile shatters an active orange shield in one hit. The shield
    // consumes the missile (no health damage that strike); subsequent
    // fire hits the now-exposed hull.
    if (typeof _enemyShieldAbsorbHit === 'function' &&
        _enemyShieldAbsorbHit(enemy, true)) {
        _activateOnDamage(enemy);
        createMissileExplosion(missile.position);
        if (typeof playSound === 'function') playSound('missile_explosion');
        return;
    }

    enemy.userData.health -= gameState.missiles.damage;
    enemy.userData.lastHitTime = Date.now();
    _activateOnDamage(enemy);
    flashEnemyHit(enemy, gameState.missiles.damage);
    createMissileExplosion(missile.position);
    playSound('missile_explosion');

    // Arcade praise on a player missile IMPACT (a kill below overrides it
    // with the bigger kill praise).
    if (enemy.userData.health > 0 && typeof flashArcadeText === 'function') {
        flashArcadeText('MISSILE STRIKE!', 2);
    }

    showAchievement('Missile Hit!',
        `Damaged ${enemy.userData.name} (${enemy.userData.health}/${enemy.userData.maxHealth} HP)`);

    if (enemy.userData.health <= 0) {
        // Big tiered kill praise (streak-aware) for missile finishes too.
        if (typeof arcadePraiseKill === 'function') {
            arcadePraiseKill(!!enemy.userData.isBoss,
                (typeof camera !== 'undefined') ? camera.position.distanceTo(enemy.position) : 0,
                enemy.userData);
        }
        if (window.arcade) {
            window.arcade.addKill(enemy.userData, enemy.position, !!enemy.userData.isBoss);
            window.arcade.hitstop(enemy.userData.isBoss ? 90 : 45);
        }
        const wasBoss = enemy.userData.isBoss;
        const bossName = enemy.userData.name;

        // Reputation + small energy refund for the missile kill.
        if (typeof awardKillReward === 'function') awardKillReward(enemy);

        // Same big-kill upgrade for missile finishes.
        const _missUD = enemy.userData || {};
        const _missBig = _missUD.isBoss || _missUD.isEliteGuardian || _missUD.isBlackHoleGuardian;
        const _missBorg = _missUD.isBorgCube || _missUD.type === 'borg_drone' || _missUD.isBorg;
        const _missPirate = _missUD.isMartianPirate && !_missUD.isVulcanPatrol;
        if (_missBorg && typeof createMassiveBorgExplosion === 'function') {
            createMassiveBorgExplosion(enemy.position, _missUD.cubeSize || 30);
            playSound('explosion');
        } else if (_missBig && typeof createBossExplosion === 'function') {
            const _color = _missUD.galaxyColor || 0xff5522;
            createBossExplosion(enemy.position, {
                color: _color,
                scale: _missUD.isBoss ? 1.8 : 1.3
            });
        } else if (_missPirate) {
            createExplosionEffect(enemy.position, 0xff4444, 15);
            playSound('explosion');
        } else if (typeof createFactionExplosion === 'function' &&
                   typeof _missUD.galaxyId === 'number') {
            // Half diameter for black-hole (distant) galaxy hostiles.
            createFactionExplosion(enemy.position, _missUD.galaxyId,
                isEnemyInLocalGalaxy(enemy) ? 1.0 : 0.5);
        } else {
            createExplosionEffect(enemy.position, 0xff4444, 15);
            playSound('explosion');
        }

        if (wasBoss) {
            showAchievement('BOSS DEFEATED!', `${bossName} destroyed by missile!`);
            if (typeof checkBossVictory === 'function') checkBossVictory(enemy);
            if (typeof createFireworkCelebration === 'function') createFireworkCelebration();
            playBossVictoryMusic();

            // Boss defeated: refill missiles (max cap 10)
            gameState.missiles.capacity = Math.min(10, gameState.missiles.capacity);
            gameState.missiles.current = gameState.missiles.capacity;
            showAchievement('Missiles Restored!',
                `Full loadout: ${gameState.missiles.current}/${gameState.missiles.capacity}`);
        } else {
            showAchievement('Enemy Destroyed!', `${enemy.userData.name} eliminated by missile`);

            // 20% chance for missile drop
            if (Math.random() < 0.2) {
                gameState.missiles.current = Math.min(gameState.missiles.capacity, gameState.missiles.current + 1);
                showAchievement('Missile Recovered!',
                    `+1 missile from debris (${gameState.missiles.current}/${gameState.missiles.capacity})`);
            }
        }

        const hullRecovery = wasBoss ? 15 + Math.random() * 15 : 5 + Math.random() * 10;
        gameState.hull = Math.min(gameState.maxHull || 100, gameState.hull + hullRecovery);
        showAchievement('Hull Repaired', `+${hullRecovery.toFixed(1)} hull integrity from salvage`);

        if (gameState.targetLock.target === enemy) gameState.targetLock.target = null;
        if (gameState.currentTarget === enemy) gameState.currentTarget = null;

        scene.remove(enemy);
        enemies.splice(enemies.indexOf(enemy), 1);

        if (typeof populateTargets === 'function') setTimeout(populateTargets, 100);
        checkGalaxyClear();

        // 🏆 VICTORY SYSTEM: Check if guardians defeated → galaxy liberated
        checkGuardianVictory();

        // ENHANCED: Check if we should spawn area bosses, galaxy bosses,
        // species bosses, or elite guardians.
        // PREVIOUSLY: missile kills only ran area boss + elite guardian
        // checks, missing checkGalaxyBossSpawn / checkSpeciesBossSpawn —
        // so killing the LAST regular enemy of a galaxy/species with a
        // missile would silently skip the boss spawn forever.
        if (typeof checkAndSpawnAreaBosses === 'function') {
            checkAndSpawnAreaBosses();
        }
        if (typeof checkGalaxyBossSpawn === 'function') {
            checkGalaxyBossSpawn();
        }
        if (typeof checkSpeciesBossSpawn === 'function') {
            checkSpeciesBossSpawn();
        }
        if (typeof checkAndSpawnEliteGuardians === 'function') {
            checkAndSpawnEliteGuardians();
        }
    }
}

function handleCosmicFeatureDestruction(missile, feature, type) {
    scene.remove(missile);
    feature.userData.destroyed = true;

    // Create larger explosion
    createMissileExplosion(missile.position);
    playSound('missile_explosion');

    // ⭐ NEW: Award warp for destroying cosmic feature
    if (gameState.emergencyWarp && gameState.emergencyWarp.available < gameState.emergencyWarp.maxWarps) {
        gameState.emergencyWarp.available++;
        console.log(`⚡ Warp earned from cosmic feature destruction! Total: ${gameState.emergencyWarp.available}/${gameState.emergencyWarp.maxWarps}`);
    }

    // Apply effects based on type
    switch(type) {
        case 'dyson':
            // Dyson Sphere: +25% energy max
            const energyBoost = 25;
            gameState.maxEnergy = (gameState.maxEnergy || 100) + energyBoost;
            gameState.energy = Math.min(gameState.maxEnergy, gameState.energy + energyBoost);
            showAchievement('DYSON SPHERE DESTROYED!',
                `Maximum energy capacity increased to ${gameState.maxEnergy}%!`, true);
            break;

        case 'crystal':
            // Crystal Structure: 2x attack damage
            if (!gameState.weaponDamageMultiplier) gameState.weaponDamageMultiplier = 1;
            gameState.weaponDamageMultiplier *= 2;
            showAchievement('CRYSTAL STRUCTURE DESTROYED!',
                `Weapon damage multiplier: x${gameState.weaponDamageMultiplier}!`, true);
            break;

        case 'whale':
            // Space Whale: -50% hull curse
            const hullPenalty = gameState.hull * 0.5;
            gameState.hull = Math.max(1, gameState.hull - hullPenalty);
            showAchievement('SPACE WHALE DESTROYED!',
                `Ancient curse applied: -${hullPenalty.toFixed(0)}% hull integrity!`, true);
            break;
    }

    // Visual destruction effect
    if (feature.material) {
        feature.material.transparent = true;
        let opacity = 1.0;
        const fadeInterval = setInterval(() => {
            opacity -= 0.05;
            if (feature.material) {
                feature.material.opacity = opacity;
            }
            if (opacity <= 0) {
                clearInterval(fadeInterval);
                scene.remove(feature);
            }
        }, 50);
    } else {
        scene.remove(feature);
    }
}

function createMissileExplosion(position) {
    const explosionGeometry = new THREE.SphereGeometry(8, 16, 16);
    const explosionMaterial = new THREE.MeshBasicMaterial({
        color: 0xff3300,
        transparent: true,
        opacity: 0.9
    });
    const explosion = new THREE.Mesh(explosionGeometry, explosionMaterial);
    explosion.position.copy(position);
    scene.add(explosion);

    // Particles
    const particles = new THREE.BufferGeometry();
    const particleCount = 40;
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 25;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 25;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 25;
    }

    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({
        color: 0xff6600,
        size: 1.5,
        transparent: true,
        opacity: 1
    });
    const particleSystem = new THREE.Points(particles, particleMaterial);
    particleSystem.position.copy(position);
    scene.add(particleSystem);

    // Add to explosion manager
    let scale = 1;
    let opacity = 0.9;
    let particleLife = 1.0;

    explosionManager.addExplosion({
        update(deltaTime) {
            // Update explosion sphere
            scale += 0.8 * (deltaTime / 50);
            opacity -= 0.08 * (deltaTime / 50);
            explosion.scale.set(scale, scale, scale);
            explosionMaterial.opacity = Math.max(0, opacity);

            // Update particles
            particleLife -= 0.025 * (deltaTime / 70);
            particleMaterial.opacity = Math.max(0, particleLife);

            return opacity > 0 || particleLife > 0;
        },

        cleanup() {
            scene.remove(explosion);
            scene.remove(particleSystem);
            explosionGeometry.dispose();
            explosionMaterial.dispose();
            particles.dispose();
            particleMaterial.dispose();
        }
    });

    playSound('missile_explosion');
}

function updateMissileUI() {
    const missileCount = document.getElementById('missileCount');
    if (missileCount) {
        missileCount.textContent = `${gameState.missiles.current}/${gameState.missiles.capacity}`;
    }

    const mobileMissileCount = document.getElementById('mobileMissileCountBadge');
    if (mobileMissileCount) {
        mobileMissileCount.textContent = gameState.missiles.current;
    }
}

// =============================================================================
// WEAPON SYSTEM
// =============================================================================

// RESTORED: Working weapon system with asteroid targeting
function fireWeapon() {
    // Once the player is dying / game over, stop all player weapon fire
    // so the demo (or a held trigger) can't keep shooting lasers
    // through the death-explosion sequence.
    if (typeof gameState !== 'undefined' &&
        (gameState.playerDying || gameState.gameOver || gameState.gameOverScreenShown)) {
        return;
    }
    // Resume audio context on user interaction to fix suspended state warning
    resumeAudioContext();

    // Faster weapon cooldown (RESTORED)
    if (gameState.weapons.cooldown > 0 || gameState.weapons.energy < 10) return;
    
    // OVERDRIVE power-up halves the cooldown for rapid fire.
    gameState.weapons.cooldown = (window.arcade && window.arcade.hasPowerup && window.arcade.hasPowerup('overdrive')) ? 90 : 200;
    gameState.weapons.energy = Math.max(0, gameState.weapons.energy - (gameState._chargedShot ? Math.round(12 + (gameState._chargedPower || 0.5) * 28) : 10));
    
    // Enhanced targeting with doubled ranges
    let targetObject = null;
    let targetPosition;
    
    if (gameState.targetLock.active && gameState.targetLock.target) {
        // Auto-aim at locked target (including asteroids)
        targetPosition = gameState.targetLock.target.position.clone();
        targetObject = gameState.targetLock.target;
    }
    
    if (!targetObject) {
        // Manual aiming using crosshair position
        const mousePos = new THREE.Vector2(
            (gameState.crosshairX / window.innerWidth) * 2 - 1,
            -(gameState.crosshairY / window.innerHeight) * 2 + 1
        );
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mousePos, camera);
        
        // Check for enemy hits first (recursive: true for GLB model Groups)
        const enemyIntersects = raycaster.intersectObjects(enemies, true);
        if (enemyIntersects.length > 0) {
            targetPosition = enemyIntersects[0].point;
            // Get the root enemy object (may be a parent Group)
            targetObject = enemyIntersects[0].object;
            while (targetObject.parent && targetObject.parent.userData && targetObject.parent.userData.type === 'enemy') {
                targetObject = targetObject.parent;
            }
        } else {
            // Check for BORG drone hits (from outer interstellar systems)
            let borgDrones = [];
            if (typeof outerInterstellarSystems !== 'undefined') {
                outerInterstellarSystems.forEach(system => {
                    if (system.userData && system.userData.drones) {
                        system.userData.drones.forEach(drone => {
                            if (drone.userData.health > 0) {
                                // Add all children of the drone group for raycasting
                                borgDrones.push(...drone.children);
                            }
                        });
                    }
                });
            }

            // Civilian / military ships are full combat participants:
            // player lasers hit them (hitscan), they shield up / flee /
            // call distress (civilians) or return fire (military).
            if (typeof damageCivilianShip === 'function') {
                const _civPool = [];
                if (typeof tradingShips !== 'undefined') {
                    for (let _ci = 0; _ci < tradingShips.length; _ci++) {
                        const s = tradingShips[_ci];
                        if (s && (!s.userData || !s.userData.destroyed)) _civPool.push(s);
                    }
                }
                if (typeof civilianShips !== 'undefined') {
                    for (let _ci = 0; _ci < civilianShips.length; _ci++) {
                        const s = civilianShips[_ci];
                        if (s && (!s.userData || !s.userData._destroyed)) _civPool.push(s);
                    }
                }
                if (_civPool.length) {
                    const civIntersects = raycaster.intersectObjects(_civPool, true);
                    if (civIntersects.length > 0) {
                        targetPosition = civIntersects[0].point;
                        let _root = civIntersects[0].object;
                        while (_root.parent && _civPool.indexOf(_root) === -1) _root = _root.parent;
                        if (_civPool.indexOf(_root) !== -1) {
                            targetObject = _root;
                            if (typeof createHitSparks === 'function') {
                                createHitSparks(civIntersects[0].point, 0x66ddff);
                            }
                            damageCivilianShip(_root, 1,
                                (typeof _civilianPlayerProxy !== 'undefined') ? _civilianPlayerProxy
                                    : { position: camera.position, isPlayerProxy: true, userData: { health: 1 } });
                            // Firing on unarmed civilians costs reputation;
                            // military patrol craft shoot back instead.
                            if (_root.userData && _root.userData.shipCategory !== 'military' &&
                                typeof awardReputation === 'function') {
                                awardReputation(-2, 'Civilian vessel fired upon');
                            }
                        }
                    }
                }
            }

            const borgIntersects = (!targetObject) ? raycaster.intersectObjects(borgDrones) : [];
            if (borgIntersects.length > 0) {
                targetObject = borgIntersects[0].object.parent; // Parent is the drone group
                // Use the cube's world center as target so the proximity
                // check in checkWeaponHits (300u radius) reliably matches.
                // The raycast point can be up to 300u away on the hitbox
                // sphere surface, which would be on the boundary of the test.
                const _borgCenter = new THREE.Vector3();
                targetObject.getWorldPosition(_borgCenter);
                targetPosition = _borgCenter;
                // Hit log silenced (per-shot spam)
            } else {
                // Check for asteroid hits (for manual aiming only; skip if
                // a civilian ship already took this shot)
                const asteroidTargets = targetObject ? [] : planets.filter(p => p.userData.type === 'asteroid');
                const asteroidIntersects = raycaster.intersectObjects(asteroidTargets);
                if (asteroidIntersects.length > 0) {
                    targetPosition = asteroidIntersects[0].point;
                    targetObject = asteroidIntersects[0].object;
                } else {
                    // Check for interstellar asteroid hits
                    if (typeof interstellarAsteroids !== 'undefined' && interstellarAsteroids.length > 0) {
                        const interstellarIntersects = raycaster.intersectObjects(interstellarAsteroids);
                        if (interstellarIntersects.length > 0) {
                            targetPosition = interstellarIntersects[0].point;
                            targetObject = interstellarIntersects[0].object;
                            targetObject.userData.isInterstellarAsteroid = true;  // Flag for special handling
                            // Hit log silenced
                        }
                    }

                    // Check for outer system asteroids (exotic core + BORG systems)
                    if (!targetObject && typeof outerInterstellarSystems !== 'undefined') {
                        let outerAsteroids = [];
                        outerInterstellarSystems.forEach(system => {
                            if (system.userData && system.userData.orbiters) {
                                system.userData.orbiters.forEach(orbiter => {
                                    if (orbiter.userData && orbiter.userData.type === 'outer_asteroid') {
                                        outerAsteroids.push(orbiter);
                                    }
                                });
                            }
                        });

                        if (outerAsteroids.length > 0) {
                            const outerAsteroidIntersects = raycaster.intersectObjects(outerAsteroids);
                            if (outerAsteroidIntersects.length > 0) {
                                targetPosition = outerAsteroidIntersects[0].point;
                                targetObject = outerAsteroidIntersects[0].object;
                                // Hit log silenced
                            }
                        }
                    }

                    if (!targetObject) {
                        // Fire in the direction of the crosshair
                        const direction = raycaster.ray.direction.clone();
                        targetPosition = camera.position.clone().add(direction.multiplyScalar(1000));
                    }
                }
            }
        }
    }
    
    // COMBAT FEEL: anything the shot passes CLOSE to starts jinking, not
    // just what it hits. Dodging while the player is still walking rounds
    // onto the target is what makes a dogfight feel alive rather than
    // turn-based.
    if (typeof _markEnemiesUnderFire === 'function') {
        _markEnemiesUnderFire(targetPosition);
    }

    // Create weapon effect - different approach for 1st vs 3rd person
    const mode = window.cameraState?.mode || 'first-person';
    const playerShip = window.cameraState?.playerShipMesh;
    
    if (mode === 'third-person' && playerShip && playerShip.visible) {
        // 3RD PERSON: Create tracer effect from wing tips
        createThirdPersonLasers(playerShip, targetPosition);
    } else {
        // 1ST PERSON: Fire from camera position
        const leftOffset = new THREE.Vector3(-3, -2, 0).applyQuaternion(camera.quaternion);
        const rightOffset = new THREE.Vector3(3, -2, 0).applyQuaternion(camera.quaternion);
        
        const _beamCol = gameState._chargedShot ? '#ffdd33' : '#00ff96'; // charged = yellow
        createLaserBeam(camera.position.clone().add(leftOffset), targetPosition, _beamCol, true);
        createLaserBeam(camera.position.clone().add(rightOffset), targetPosition, _beamCol, true);
        // SPREAD SHOT power-up: two extra fanned beams.
        if (window.arcade && window.arcade.hasPowerup && window.arcade.hasPowerup('spread')) {
            const _fwd = new THREE.Vector3(); camera.getWorldDirection(_fwd);
            const _up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
            [-0.12, 0.12].forEach(ang => {
                const _d = _fwd.clone().applyAxisAngle(_up, ang);
                const _end = camera.position.clone().addScaledVector(_d, 6000);
                createLaserBeam(camera.position.clone(), _end, '#99ff66', true);
            });
        }
        if (gameState._chargedShot) {
            // Charged blast: yellow bolts from the CHARGE CENTER (the glow
            // midpoint), more bolts with higher charge.
            const _origin = gameState._chargeCenter ? gameState._chargeCenter.clone() : camera.position.clone();
            const _bolts = 1 + Math.round((gameState._chargedPower || 0.5) * 3); // 1-4
            for (let _b = 0; _b < _bolts; _b++) {
                const _j = new THREE.Vector3((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, 0).applyQuaternion(camera.quaternion);
                createLaserBeam(_origin.clone().add(_j), targetPosition, '#ffee66', true);
            }
        }
    }
    
    // Handle weapon hits based on target type
    if (targetObject) {
        if (targetObject.userData.type === 'asteroid' || targetObject.userData.type === 'outer_asteroid') {
            // Asteroid hit - restore hull, pass actual hit position
            destroyAsteroidByWeapon(targetObject, targetPosition);
        } else if (targetObject.userData.type === 'interstellar_asteroid') {
            // Interstellar asteroid hit - break into pieces
            if (typeof breakInterstellarAsteroid === 'function') {
                const hitNormal = new THREE.Vector3().subVectors(targetPosition, targetObject.position).normalize();
                breakInterstellarAsteroid(targetObject, targetPosition, hitNormal);
                // Small hull restoration for shooting large asteroids
                if (typeof gameState !== 'undefined') {
                    gameState.hull = Math.min(gameState.maxHull, gameState.hull + 5);
                }
                // Play asteroid hit sound
                if (typeof playSound === 'function') {
                    playSound('explosion');
                }
                console.log('Interstellar asteroid broken into fragments (+5 hull)');
            }
        } else {
            // Check for normal enemy/object hits
            checkWeaponHits(targetPosition);
        }
    } else {
        // FIXED: Still check for hits near the ray path even without direct raycast hit
        // This allows hits on enemies that are close to the crosshair aim line
        // targetPosition is already set to a point along the ray direction (line 4022)
        checkWeaponHits(targetPosition);
    }
    
    // Charged blast consumed — clear the flags now that targeting/damage ran.
    if (typeof gameState !== 'undefined') { gameState._chargedShot = false; gameState._chargedPower = 0; }

    // Apply weapon power boost from solar storms
    if (typeof gameState !== 'undefined' && gameState.weaponPowerBoost > 1.0) {
        // Increase damage or effect based on boost
        weaponDamage *= gameState.weaponPowerBoost;
        
        // Show enhanced weapon effect
        if (typeof showAchievement === 'function') {
            showAchievement('Enhanced Weapons!', 'Solar storm energy boosting firepower');
        }
    }
    
    // Check for pulsar interference
    if (typeof gameState !== 'undefined' && gameState.navigationJammed) {
        // Reduce accuracy or add random deviation
        const interference = Math.random() * 0.3; // 30% interference
        // Apply interference to targeting...
    }
    
    // Start cooldown countdown
    const cooldownInterval = setInterval(() => {
        gameState.weapons.cooldown -= 50;
        if (gameState.weapons.cooldown <= 0) {
            gameState.weapons.cooldown = 0;
            clearInterval(cooldownInterval);
        }
        if (typeof updateUI === 'function') updateUI();
    }, 50);
    
    if (typeof updateUI === 'function') updateUI();
    playSound('weapon');
}

// =============================================================================
// PAUSE SYSTEM
// =============================================================================

// =============================================================================
// PAUSE SYSTEM - FIXED
// =============================================================================

function togglePause() {
    // Use consistent state variable
    if (typeof gameState === 'undefined') {
        console.error('gameState not defined, cannot toggle pause');
        return;
    }

    
    gameState.paused = !gameState.paused;

    // AUDIO FOLLOWS PAUSE: suspend the WebAudio graph (synth music + SFX
    // freeze in place) and pause the MP3 soundtrack (keeps its position);
    // both resume exactly where they left off on unpause.
    try {
        if (gameState.paused) {
            if (typeof audioContext !== 'undefined' && audioContext && audioContext.state === 'running') {
                audioContext.suspend();
            }
            if (typeof window !== 'undefined' && window.soundtrack && window.soundtrack.pauseAll) {
                window.soundtrack.pauseAll();
            }
        } else {
            if (typeof audioContext !== 'undefined' && audioContext && audioContext.state === 'suspended') {
                audioContext.resume();
            }
            if (typeof window !== 'undefined' && window.soundtrack && window.soundtrack.resumeAll) {
                window.soundtrack.resumeAll();
            }
        }
    } catch (e) {}

    // Create pause overlay if it doesn't exist
    let pauseOverlay = document.getElementById('pauseOverlay');
    if (!pauseOverlay) {
        // AUDIO + CONTROLS sections live in the pause menu on BOTH
        // platforms (desktop got the same upgrades per Ben, Jul 21).
        // _mobPause only picks the resume-instruction wording now.
        const _mobPause = ('ontouchstart' in window) || window.innerWidth <= 768;
        pauseOverlay = document.createElement('div');
        pauseOverlay.id = 'pauseOverlay';
        pauseOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;' +
            'background:rgba(0,0,0,0.75);display:none;align-items:center;' +
            'justify-content:center;z-index:9999;';
        const audioSection = `
                <div style="border-top:1px solid rgba(0,150,255,0.4);margin-top:18px;padding-top:14px;">
                    <h3 class="text-cyan-400 font-bold mb-3" style="letter-spacing:2px;">AUDIO</h3>
                    <div class="flex gap-2 mb-4 justify-center flex-wrap">
                        <button id="mobileMusicBtn" class="space-btn rounded px-4 py-2" type="button" title="Music On/Off">
                            <i class="fas fa-volume-up mr-2" id="mobileMusicIcon"></i>Music
                        </button>
                        <button id="mobileSkipTrackBtn" class="space-btn rounded px-4 py-2" type="button" title="Skip Track">
                            <i class="fas fa-forward mr-2"></i>Skip
                        </button>
                        <button id="pauseSfxBtn" class="space-btn rounded px-4 py-2" type="button" title="Sound effects on/off">
                            <i class="fas fa-bullhorn mr-2" id="pauseSfxIcon"></i>SFX
                        </button>
                    </div>
                    <div class="text-sm text-gray-300 mb-1" style="text-align:left;">Music Volume</div>
                    <input id="pauseMusicVol" type="range" min="0" max="1" step="0.05" style="width:100%;accent-color:#22d3ee;">
                    <div class="text-sm text-gray-300 mb-1 mt-3" style="text-align:left;">SFX Volume</div>
                    <input id="pauseSfxVol" type="range" min="0" max="1" step="0.05" style="width:100%;accent-color:#22d3ee;">
                </div>
                <div style="border-top:1px solid rgba(0,150,255,0.4);margin-top:14px;padding-top:14px;">
                    <h3 class="text-cyan-400 font-bold mb-3" style="letter-spacing:2px;">CONTROLS</h3>
                    <button id="pauseFlightBtn" class="space-btn rounded px-4 py-2" type="button" title="Show the flight controls reference">
                        <i class="fas fa-gamepad mr-2"></i>Flight Controls
                    </button>
                </div>`;
        pauseOverlay.innerHTML = `
            <div class="text-center ui-panel rounded-lg p-8" style="max-width:92vw;max-height:86vh;overflow-y:auto;">
                <h2 class="text-3xl font-bold text-cyan-400 mb-4">GAME PAUSED</h2>
                <p class="text-gray-300 mb-6">${_mobPause ? 'Tap Resume to continue' : 'Press P or click Resume to continue'}</p>
                <button id="pauseResumeBtn" class="space-btn rounded px-6 py-3">
                    <i class="fas fa-play mr-2"></i>Resume Game
                </button>${audioSection}
            </div>
        `;
        document.body.appendChild(pauseOverlay);
        // Attach Resume click via addEventListener (inline onclick can fail)
        const resumeBtn = document.getElementById('pauseResumeBtn');
        if (resumeBtn) {
            resumeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                togglePause();
            });
        }
        // Audio section wiring. Music/Skip buttons reuse the ids game-music.js
        // already delegates on (#mobileMusicBtn / #mobileSkipTrackBtn) — no
        // extra handlers needed. SFX toggle and the two volume sliders:
        const _updSfxIcon = () => {
            const ic = document.getElementById('pauseSfxIcon');
            if (ic) ic.className = window._sfxMuted
                ? 'fas fa-volume-mute text-red-400 mr-2'
                : 'fas fa-bullhorn text-cyan-400 mr-2';
        };
        const sfxToggle = document.getElementById('pauseSfxBtn');
        if (sfxToggle) {
            sfxToggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleSfx();
                _updSfxIcon();
            });
        }
        const musicVol = document.getElementById('pauseMusicVol');
        if (musicVol) {
            musicVol.addEventListener('input', () => {
                if (window.soundtrack && soundtrack.setVolume) soundtrack.setVolume(parseFloat(musicVol.value));
            });
        }
        const sfxVol = document.getElementById('pauseSfxVol');
        if (sfxVol) {
            sfxVol.addEventListener('input', () => {
                const v = parseFloat(sfxVol.value);
                if (typeof effectsGain !== 'undefined' && effectsGain && audioContext) {
                    effectsGain.gain.value = v;
                    effectsGain.gain.setValueAtTime(v, audioContext.currentTime);
                }
                if (v > 0) window._sfxLevel = v; // remembered by toggleSfx unmute
                window._sfxMuted = v === 0;
                _updSfxIcon();
            });
        }
        const flightBtn = document.getElementById('pauseFlightBtn');
        if (flightBtn) {
            flightBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof showMobilePanel === 'function') {
                    showMobilePanel('controls');
                    // The pause overlay sits at z 9999 — lift the popup above it
                    const pop = document.getElementById('controlsPopup');
                    if (pop) pop.style.zIndex = '10001';
                }
            });
        }
    }

    // Sync the audio controls to live state every time the menu opens
    if (gameState.paused) {
        const musicVol = document.getElementById('pauseMusicVol');
        if (musicVol && window.soundtrack && typeof soundtrack.volume === 'number') {
            musicVol.value = soundtrack.volume;
        }
        const sfxVol = document.getElementById('pauseSfxVol');
        if (sfxVol && typeof effectsGain !== 'undefined' && effectsGain) {
            sfxVol.value = effectsGain.gain.value;
        }
        const sfxIc = document.getElementById('pauseSfxIcon');
        if (sfxIc) sfxIc.className = window._sfxMuted
            ? 'fas fa-volume-mute text-red-400 mr-2'
            : 'fas fa-bullhorn text-cyan-400 mr-2';
    }

    pauseOverlay.style.display = gameState.paused ? 'flex' : 'none';
    
    // Update pause buttons (desktop panel + mobile top-left)
    const pauseBtn = document.getElementById('pauseBtn');
    const pauseIcon = document.getElementById('pauseIcon');
    if (pauseBtn) {
        if (gameState.paused) {
            pauseBtn.classList.add('paused');
            if (pauseIcon) pauseIcon.className = 'fas fa-play mr-1';
        } else {
            pauseBtn.classList.remove('paused');
            if (pauseIcon) pauseIcon.className = 'fas fa-pause mr-1';
        }
    }
    const mobilePauseIcon = document.getElementById('mobilePauseIcon');
    if (mobilePauseIcon) {
        mobilePauseIcon.className = gameState.paused ? 'fas fa-play' : 'fas fa-pause';
    }
    
    console.log(gameState.paused ? 'Game paused' : 'Game resumed');
}
// =============================================================================
// ACHIEVEMENT SYSTEM
// =============================================================================

// Is a comms/alert overlay ACTUALLY on screen right now?
//
// This used to be a bare `document.getElementById(id)` truthiness test, which
// was silently fatal: #missionCommandAlert is a STATIC element in index.html
// that merely carries the `hidden` class when idle, so the lookup was ALWAYS
// truthy. Every achievement in the game — including every proc-gen discovery
// toast ("SYSTEM CHARTED", "Galaxy Discovery!") — was pushed onto the deferred
// queue and never rendered, and the queue's only drain re-entered this same
// check and re-deferred it. Test real visibility, not mere existence.
function _achievementBlockerVisible(id) {
    const el = document.getElementById(id);
    if (!el || !el.isConnected) return false;
    if (el.classList.contains('hidden')) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity) < 0.05) return false;
    // Zero-area elements can't overlap anything.
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
}
function _achievementsBlocked() {
    return _achievementBlockerVisible('incomingTransmissionPrompt') ||
           _achievementBlockerVisible('missionCommandAlert');
}

// Self-healing drain for the deferred queue. _dismissMissionAlert() flushes it
// too, but that only runs when a comms panel is explicitly dismissed — if a
// panel is hidden by any other path the queue would sit there forever. Poll
// until the screen is clear, then release the backlog one beat apart.
let _achievementDrainTimer = null;
function _scheduleAchievementDrain() {
    if (_achievementDrainTimer) return;
    _achievementDrainTimer = setInterval(() => {
        const q = window._deferredAchievements;
        if (!q || !q.length) {
            clearInterval(_achievementDrainTimer);
            _achievementDrainTimer = null;
            return;
        }
        if (_achievementsBlocked()) return;
        clearInterval(_achievementDrainTimer);
        _achievementDrainTimer = null;
        const queue = q.slice();
        window._deferredAchievements = [];
        queue.forEach((a, i) => setTimeout(
            () => showAchievement(a.title, a.description, a.playAchievementSound), 400 * i));
    }, 500);
}

function showAchievement(title, description, playAchievementSound = true) {
    // Defer achievements while an incoming transmission popup is on screen
    // so they don't visually overlap. Re-fires when the transmission closes.
    if (_achievementsBlocked()) {
        if (!window._deferredAchievements) window._deferredAchievements = [];
        // Avoid queueing duplicates
        const dup = window._deferredAchievements.some(a => a.title === title && a.description === description);
        if (!dup) {
            window._deferredAchievements.push({ title, description, playAchievementSound });
        }
        // Cap the backlog so a long comms sequence can't dump 30 toasts at once.
        if (window._deferredAchievements.length > 6) window._deferredAchievements.shift();
        _scheduleAchievementDrain();
        return;
    }

    // Check if tutorial is active and suppress non-critical achievements
    const tutorialActive = (typeof tutorialSystem !== 'undefined' && tutorialSystem.active && !tutorialSystem.completed);
    
    // List of achievements that should be suppressed during tutorial
    const suppressDuringTutorial = [
        'Slingshot Ready',
        'Target Acquired', 
        'Target Cycled',
        'Asteroid Hit!',
        'Target Hit!',
        'Gravitational Slingshot'
    ];
    
    // List of critical achievements that should ALWAYS show (even during tutorial)
    const alwaysCritical = [
        'Training Complete',
        'BOSS DEFEATED!',
        'Galaxy Cleared!',
        'Galaxy Liberated!',  // ⭐ Added
        'Victory!',
        'Enemy Destroyed!',
        'Galaxy Discovery!',  // ⭐ Added
    ];
    
    // If tutorial is active and this achievement should be suppressed, just log it
    if (tutorialActive && suppressDuringTutorial.includes(title) && !alwaysCritical.includes(title)) {
        console.log(`Achievement suppressed during tutorial: ${title} - ${description}`);
        return;
    }
    
    // Display achievement
    const popup = document.getElementById('achievementPopup');
    const achievementText = document.getElementById('achievementText');
    const titleElement = popup && popup.querySelector('h4');
    
    if (popup && achievementText && titleElement) {
        achievementText.textContent = description;
        titleElement.textContent = title;

        // ⭐ CRITICAL: Force clear any inline styles that might block visibility
        popup.style.display = '';  // Clear inline display style
        popup.style.visibility = ''; // Clear inline visibility style
        popup.style.opacity = '';   // Clear inline opacity style
        popup.style.zIndex = '999'; // Maximum priority
        popup.style.position = 'fixed'; // Ensure it's always fixed
        // The markup centres via `left-1/2 -translate-x-1/2`, but #achievementPopup
        // resolves to width:0 (its .ui-panel child doesn't contribute an intrinsic
        // width), so translateX(-50%) shifts by nothing and the 300 px panel hung
        // 300 px RIGHT of centre, under the nav column. Nobody ever saw it because
        // the deferral bug above meant the toast never rendered at all.
        // Keep the declarative centring AND correct the child by real measurement,
        // which also works under the mobile `transform: ... !important` rules.
        popup.style.left = '50%';
        popup.style.transform = 'translateX(-50%)';
        requestAnimationFrame(() => {
            const inner = popup.firstElementChild;
            if (!inner) return;
            const ow = popup.getBoundingClientRect().width;
            const iw = inner.getBoundingClientRect().width;
            inner.style.marginLeft = (iw > ow + 2) ? (-Math.round(iw / 2) + 'px') : '';
        });

        // ⭐ BORG STYLING: green ORBITRON for BORG messages. Glow dampened
        // ~85% from the original (0.8/0.6 alpha, 10px blur) — the full
        // bloom washed the letters out to an unreadable green smear.
        if (title.includes('BORG')) {
            popup.classList.add('borg-message');
            titleElement.style.fontFamily = "'Orbitron', monospace";
            titleElement.style.color = '#66ff66';
            titleElement.style.textShadow = '0 0 2px rgba(0, 255, 0, 0.12)';
            achievementText.style.fontFamily = "'Orbitron', monospace";
            achievementText.style.color = '#66ff66';
            achievementText.style.textShadow = '0 0 2px rgba(0, 255, 0, 0.09)';
        } else {
            popup.classList.remove('borg-message');
            titleElement.style.fontFamily = '';
            titleElement.style.color = '';
            titleElement.style.textShadow = '';
            achievementText.style.fontFamily = '';
            achievementText.style.color = '';
            achievementText.style.textShadow = '';
        }

        popup.classList.remove('hidden');

        // Add click handler for "Slingshot Ready" on mobile
        if (title === 'Slingshot Ready') {
            popup.classList.add('interactive'); // Enable pointer events
            popup.style.cursor = 'pointer';

            // Remove any existing handlers to prevent duplicates
            const oldHandler = popup._slingshotClickHandler;
            if (oldHandler) {
                popup.removeEventListener('click', oldHandler);
                popup.removeEventListener('touchstart', oldHandler);
            }

            // Create new handler
            const slingshotHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('📱 Slingshot Ready notification tapped');

                if (typeof executeSlingshot === 'function') {
                    executeSlingshot();
                    popup.classList.add('hidden');
                    popup.classList.remove('interactive');
                }
            };

            // Store handler reference for cleanup
            popup._slingshotClickHandler = slingshotHandler;

            // Add listeners
            popup.addEventListener('click', slingshotHandler);
            popup.addEventListener('touchstart', slingshotHandler, { passive: false });
        } else {
            popup.classList.remove('interactive'); // Disable pointer events
            popup.style.cursor = 'default';

            // Remove slingshot handler if exists
            const oldHandler = popup._slingshotClickHandler;
            if (oldHandler) {
                popup.removeEventListener('click', oldHandler);
                popup.removeEventListener('touchstart', oldHandler);
                popup._slingshotClickHandler = null;
            }
        }

        console.log(`✨ Achievement displaying: ${title}`);

        // Longer display time for important achievements.
        // 3x the old 4s — congratulations/victory toasts need time
        // to be read and savoured.
        const displayTime = 12000;

        // Play sound if requested
        if (playAchievementSound && typeof playSound === 'function') {
            playSound('achievement');
        }

        // Auto-hide after display time
        setTimeout(() => {
            popup.classList.add('hidden');
            popup.classList.remove('interactive'); // Remove pointer events when hidden
            console.log(`✅ Achievement hidden: ${title}`);
        }, displayTime);
    } else {
        console.warn('Achievement popup elements not found:', { popup, achievementText, titleElement });
    }
}

// =============================================================================
// TARGET LOCK AND CYCLING SYSTEM
// =============================================================================

function targetNearestEnemy() {
    // Safety check for enemies array
    if (typeof enemies === 'undefined' || typeof camera === 'undefined' || typeof gameState === 'undefined') return;
    
    const nearbyEnemies = enemies.filter(enemy => 
        enemy.userData.health > 0 && 
        camera.position.distanceTo(enemy.position) < 2000
    ).sort((a, b) => {
        const distA = camera.position.distanceTo(a.position);
        const distB = camera.position.distanceTo(b.position);
        return distA - distB;
    });
    
    if (nearbyEnemies.length > 0) {
        gameState.currentTarget = nearbyEnemies[0];
        gameState.targetLock.target = nearbyEnemies[0];
        if (typeof updateUI === 'function') updateUI();
        if (typeof populateTargets === 'function') populateTargets();
    }
}

function cycleTargets() {
    if (typeof gameState === 'undefined' || typeof camera === 'undefined') return;
    
    // Get all targetable objects including cosmic features
    const allTargets = [];
    
    // Add planets (excluding asteroids from navigation)
    if (typeof planets !== 'undefined') {
        const targetablePlanets = planets.filter(p => p.userData.name !== 'Earth' && p.userData.type !== 'asteroid');
        allTargets.push(...targetablePlanets);
    }
    
    // Add wormholes
    if (typeof wormholes !== 'undefined') {
        const detectedWormholes = wormholes.filter(w => w.userData.detected);
        allTargets.push(...detectedWormholes);
    }
    
    // OPTIMIZED: Helper function to filter by squared distance (avoids expensive sqrt)
    const filterBySquaredDist = (items, maxDistSquared) => {
        const camPos = camera.position;
        return items.filter(obj => {
            const dx = obj.position.x - camPos.x;
            const dy = obj.position.y - camPos.y;
            const dz = obj.position.z - camPos.z;
            return (dx*dx + dy*dy + dz*dz) < maxDistSquared;
        });
    };

    // Add comets
    if (typeof comets !== 'undefined') {
        allTargets.push(...filterBySquaredDist(comets, 4000*4000));
    }

    // Add enemies
    if (typeof enemies !== 'undefined') {
        const aliveEnemies = enemies.filter(e => e.userData.health > 0);
        allTargets.push(...filterBySquaredDist(aliveEnemies, 2000*2000));
    }

    // ADD COSMIC FEATURES TO CYCLING - OPTIMIZED with pre-calculated squared distances
    if (typeof cosmicFeatures !== 'undefined') {
        allTargets.push(...filterBySquaredDist(cosmicFeatures.pulsars, 2000*2000));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.supernovas, 3000*3000));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.dysonSpheres, 4000*4000));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.ringworlds, 4000*4000));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.spaceWhales, 2000*2000));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.brownDwarfs, 1500*1500));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.solarStorms, 2500*2500));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.crystalFormations, 1800*1800));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.plasmaStorms, 2200*2200));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.roguePlanets, 1600*1600));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.darkMatterNodes, 400*400));
        allTargets.push(...filterBySquaredDist(cosmicFeatures.dustClouds, 250*250));
    }

    // Add nebula gas clouds
    if (typeof nebulaGasClouds !== 'undefined') {
        allTargets.push(...filterBySquaredDist(nebulaGasClouds, 3000*3000));
    }

    // Add ally wingmen so the nav system detects them
    if (typeof allyShips !== 'undefined') {
        const aliveAllies = allyShips.filter(a => a && a.userData && a.userData.health > 0);
        allTargets.push(...filterBySquaredDist(aliveAllies, 6000*6000));
    }

    // OPTIMIZED: Cache distances in a Map to avoid recalculating during sort
    const distanceCache = new Map();
    const getDistance = (obj) => {
        if (!distanceCache.has(obj)) {
            distanceCache.set(obj, camera.position.distanceTo(obj.position));
        }
        return distanceCache.get(obj);
    };

    // Filter by distance and sort using cached distances
    const nearbyObjects = allTargets.filter(obj => getDistance(obj) < 6000)
        .sort((a, b) => getDistance(a) - getDistance(b));

    if (nearbyObjects.length === 0) {
        gameState.currentTarget = null;
        showAchievement('No Targets', 'No objects detected in range');
        return;
    }

    let currentIndex = -1;
    if (gameState.currentTarget) {
        currentIndex = nearbyObjects.findIndex(target => target === gameState.currentTarget);
    }
    
    const nextIndex = (currentIndex + 1) % nearbyObjects.length;
    const newTarget = nearbyObjects[nextIndex];
    
    selectTarget(newTarget);
}

function selectTarget(target) {
    if (typeof gameState === 'undefined') return;
    
    gameState.currentTarget = target;
    
    // REMOVED: Don't automatically link navigation targeting to crosshair targeting
    // These systems should be independent
    // if (gameState.targetLock.active) {
    //     gameState.targetLock.target = target;
    // }
    
    if (typeof updateUI === 'function') updateUI();
    if (typeof populateTargets === 'function') populateTargets();
    
    const distance = camera.position.distanceTo(target.position);
    showAchievement('Target Cycled', `${target.userData.name} (${distance.toFixed(0)} units)`);
    playSound('navigation');
}

// Mobile Detection and Setup
let isMobileDevice = false;
let touchControls = {
    active: false,
    lastTouch: { x: 0, y: 0 },
    sensitivity: 0.002,
    fireRadius: 80
};

function initializeMobileSystem() {
    // Detect mobile devices
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) || 
                     window.innerWidth <= 768 || 
                     ('ontouchstart' in window);
    
    if (isMobileDevice) {
        console.log('🔥 Mobile device detected - activating mobile mode');
        document.body.classList.add('mobile-mode');
        setupMobileUI();
        setupMobileControls();
        enableAutoCrosshairTargeting();
        enableAutoThrust();
    }
    
    return isMobileDevice;
}

function setupMobileControls() {
    // Remove existing desktop event listeners for mobile
    if (isMobileDevice) {
        // Create touch overlay
        createTouchOverlay();
        
        // Modify existing crosshair for mobile
        const crosshair = document.getElementById('crosshair');
        if (crosshair) {
            crosshair.classList.add('mobile-crosshair');
            crosshair.style.width = '48px';
            crosshair.style.height = '48px';
            crosshair.style.borderWidth = '3px';
        }
        
        touchControls.active = true;
    }
}

function createTouchOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'mobileOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 5;
        background: transparent;
        touch-action: none;
    `;
    
    document.body.appendChild(overlay);
    
    // Touch event handlers - ONLY for camera look, NO tap-to-fire
    let isPointerDown = false;
    let lastPointerPos = { x: 0, y: 0 };
    let hasMoved = false;
    
    overlay.addEventListener('pointerdown', (e) => {
        // CRITICAL: Don't interfere with mobile UI buttons
        if (e.target.closest('.mobile-btn') || 
            e.target.closest('.mobile-controls') ||
            e.target.closest('.mobile-popup') ||
            e.target.closest('.nav-panel-mobile')) {
            return; // Let button handlers take over
        }
        
        e.preventDefault();
        isPointerDown = true;
        hasMoved = false;
        lastPointerPos = { x: e.clientX, y: e.clientY };
    });
    
    overlay.addEventListener('pointermove', (e) => {
        // CRITICAL: Don't interfere with mobile UI buttons
        if (e.target.closest('.mobile-btn') || 
            e.target.closest('.mobile-controls') ||
            e.target.closest('.mobile-popup') ||
            e.target.closest('.nav-panel-mobile')) {
            return;
        }
        
        e.preventDefault();
        
        if (isPointerDown) {
            const deltaX = e.clientX - lastPointerPos.x;
            const deltaY = e.clientY - lastPointerPos.y;
            
            // Track movement
            if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
                hasMoved = true;
            }
            
            // Apply camera rotation
            handleMobileLook(deltaX, deltaY);
            
            lastPointerPos = { x: e.clientX, y: e.clientY };
        }
        
        // Update crosshair position
        if (gameState.crosshairTargeting) {
            updateMobileCrosshair(e.clientX, e.clientY);
        }
    });
    
    overlay.addEventListener('pointerup', (e) => {
        // CRITICAL: Don't interfere with mobile UI buttons
        if (e.target.closest('.mobile-btn') || 
            e.target.closest('.mobile-controls') ||
            e.target.closest('.mobile-popup') ||
            e.target.closest('.nav-panel-mobile')) {
            return;
        }
        
        e.preventDefault();
        isPointerDown = false;
        hasMoved = false;
    });
    
    // Prevent default touch behaviors
    overlay.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    overlay.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    overlay.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
}

// Integrate with existing camera controls
function handleMobileLook(deltaX, deltaY) {
    if (typeof camera !== 'undefined' && typeof gameState !== 'undefined') {
        // Apply rotation to existing camera system
        gameState.mouseMovementX = deltaX * touchControls.sensitivity;
        gameState.mouseMovementY = deltaY * touchControls.sensitivity;
        
        // Use existing camera rotation logic
        camera.rotation.y -= gameState.mouseMovementX;
        camera.rotation.x -= gameState.mouseMovementY;
        
        // Clamp vertical rotation
        camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, camera.rotation.x));
    }
}

function handleMobileFire() {
    // Use existing fire function if available
    if (typeof fireWeapon === 'function') {
        fireWeapon();
    } else {
        console.log('🔫 Mobile fire triggered');
        // Add your existing weapon firing logic here
    }
}

function updateMobileCrosshair(x, y) {
    const crosshair = document.getElementById('crosshair');
    if (crosshair && gameState) {
        gameState.crosshairX = x;
        gameState.crosshairY = y;
        crosshair.style.left = x + 'px';
        crosshair.style.top = y + 'px';
    }
}

function enableAutoCrosshairTargeting() {
    if (typeof gameState !== 'undefined') {
        gameState.crosshairTargeting = true;
        gameState.autoTargeting = true;
        console.log('📱 Auto-crosshair targeting enabled for mobile');
    }
}

function enableAutoThrust() {
    if (typeof gameState !== 'undefined') {
        gameState.autoThrust = true;
        gameState.thrustActive = true;
        console.log('🚀 Auto-thrust enabled for mobile');
    }
}


// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function createDeathEffect() {
    // Route through the shared triggerPlayerDeath helper so the
    // explosion plays out (visuals + layered sound) before the
    // MISSION FAILED screen takes over. Without this hop, enemy
    // weapon fire at hull=0 popped the game-over screen instantly,
    // hiding the explosion entirely.
    if (typeof triggerPlayerDeath === 'function') {
        triggerPlayerDeath('HULL BREACH',
            'Ship destroyed by enemy fire - hull integrity: 0%');
        return;
    }
    // Last-resort fallback if the helper isn't loaded for some
    // reason (e.g. early in the boot before game-physics.js runs).
    if (typeof gameState !== 'undefined' && gameState.velocityVector) {
        gameState.velocityVector.set(0, 0, 0);
    }
    if (typeof createPlayerExplosion === 'function') createPlayerExplosion();
    if (typeof playSound === 'function') playSound('explosion');
    if (typeof showGameOverScreen === 'function') {
        showGameOverScreen('HULL BREACH', 'Ship destroyed by enemy fire - hull integrity: 0%');
    }
}

function playVictoryMusic() {
    if (!audioContext) return;
    
    // Play victory fanfare
    const notes = [523, 659, 783, 1046]; // C5, E5, G5, C6
    notes.forEach((freq, index) => {
        setTimeout(() => {
            playSound('achievement', freq, 0.4, false);
        }, index * 200);
    });
}

function playBossVictoryMusic() {
    // Short celebratory tune for boss defeats
    const celebrationNotes = [440, 554, 659, 880]; // A4, C#5, E5, A5
    celebrationNotes.forEach((freq, index) => {
        setTimeout(() => {
            playSound('achievement', freq, 0.3, false);
        }, index * 150);
    });
}

function playGalaxyVictoryMusic() {
    if (!audioContext) return;
    
    // Triumphant galaxy liberation fanfare
    const victoryChord = [523, 659, 784, 1047]; // C major chord (C5, E5, G5, C6)
    
    // Play ascending victory chord
    victoryChord.forEach((freq, index) => {
        setTimeout(() => {
            playSound('achievement', freq, 0.5, false);
        }, index * 100);
    });
    
    // Add a final triumphant high note
    setTimeout(() => {
        playSound('achievement', 1047, 0.8, false); // High C
    }, 600);
}

// FIXED: Black hole warp sound function
function playBlackHoleWarpSound() {
    playSound('blackhole_warp');
}

function playEnhancedBlackHoleWarpSound() {
    // Enhanced version with multiple layers
    playSound('blackhole_warp');
    setTimeout(() => playSound('warp'), 500);
}

// FIXED: Utility function to adjust minimum ship speed
function initControls() {
    console.log('ðŸŽ® initControls function called');
    
    try {
        if (typeof setupEnhancedEventListeners === 'function') {
            setupEnhancedEventListeners();
            console.log('âœ… Event listeners initialized');
        } else {
            console.warn('âš ï¸ setupEnhancedEventListeners not found');
        }
        
        if (typeof initAudio === 'function') {
            initAudio();
            console.log('âœ… Audio initialized');
        }
        
        setTimeout(() => {
            if (typeof startTutorial === 'function') {
                startTutorial();
                console.log('âœ… Tutorial started');
            }
        }, 1000);
        
    } catch (error) {
        console.error('âŒ Error in initControls:', error);
    }
}

// Auto-navigation toggle function for UI compatibility
function toggleAutoNavigate() {
    if (!gameState.currentTarget) {
        if (typeof showAchievement === 'function') {
            showAchievement('No Target', 'Select a target first');
        }
        return;
    }
    
    if (gameState.autoNavigating) {
        gameState.autoNavigating = false;
        gameState.autoNavOrienting = false;
        if (typeof showAchievement === 'function') {
            showAchievement('Auto-Nav Disengaged', 'Manual control resumed');
        }
    } else {
        gameState.autoNavigating = true;
        gameState.autoNavOrienting = true;
        if (typeof showAchievement === 'function') {
            showAchievement('Auto-Nav Engaged', `Orienting towards ${gameState.currentTarget.userData.name}`);
        }
    }
    
    if (typeof updateUI === 'function') updateUI();
}

// =============================================================================
// WINDOW EXPORTS - SINGLE CLEAN EXPORT SECTION
// =============================================================================

if (typeof window !== 'undefined') {
    // INITIALIZATION FUNCTIONS
    window.initControls = initControls;
    
    // Core systems
    window.initAudio = initAudio;
    window.setupEnhancedEventListeners = setupEnhancedEventListeners;
    window.adjustMinimumSpeed = adjustMinimumSpeed;
    
    // Combat systems
    window.updateEnemyBehavior = updateEnemyBehavior;
    window.fireWeapon = fireWeapon;
    window.flashEnemyHit = flashEnemyHit;

    // Missile systems
    window.fireMissile = fireMissile;
    window.updateMissiles = updateMissiles;
    window.updateMissileUI = updateMissileUI;

    // Borg systems (spawnBorgCube/spawnBorgDrone moved to outer-systems.js)
    window.checkBorgSpawn = checkBorgSpawn;
    window.updateBorgBehavior = updateBorgBehavior;

    // Audio systems
    window.playSound = playSound;
    window.toggleMusic = toggleMusic;
    window.resumeAudioContext = resumeAudioContext;
    window.playVictoryMusic = playVictoryMusic;
    window.playBlackHoleWarpSound = playBlackHoleWarpSound;
    window.playEnhancedBlackHoleWarpSound = playEnhancedBlackHoleWarpSound;
    // Add these to your existing window exports:
	window.playGalaxyVictoryMusic = playGalaxyVictoryMusic;
	window.playBossVictoryMusic = playBossVictoryMusic;
        
    // Visual effects
    window.createExplosionEffect = createExplosionEffect;
    window.createLaserBeam = createLaserBeam;
    
    // Damage effects
    window.createScreenDamageEffect = createScreenDamageEffect;
    window.createEnhancedScreenDamageEffect = createEnhancedScreenDamageEffect;
    window.createDirectionalDamageEffect = createDirectionalDamageEffect;
    
    // Progressive difficulty system
    window.calculateDifficultySettings = calculateDifficultySettings;
    window.getEnemyHealthForDifficulty = getEnemyHealthForDifficulty;
    window.refreshEnemyDifficulty = refreshEnemyDifficulty;
    
    // Tutorial system
    window.tutorialSystem = tutorialSystem;
    window.startTutorial = startTutorial;
    window.showMissionCommandAlert = showMissionCommandAlert;
    window.showIncomingTransmission = showIncomingTransmission;
    window.completeTutorial = completeTutorial;
    
    // UI systems
    window.showAchievement = showAchievement;
    window.selectTarget = selectTarget;
    window.cycleTargets = cycleTargets;
    
    // Target lock system
    window.targetNearestEnemy = targetNearestEnemy;
    
    // Game control
    window.togglePause = togglePause;
    
    // Utility functions
    window.isEnemyInLocalGalaxy = isEnemyInLocalGalaxy;
    window.createDeathEffect = createDeathEffect;
    window.checkGalaxyClear = checkGalaxyClear;
    window.checkGuardianVictory = checkGuardianVictory;
    
    // Combat behavior functions
    window.updatePursuitBehavior = updatePursuitBehavior;
    window.updateSwarmBehavior = updateSwarmBehavior;
    window.updateEvasionBehavior = updateEvasionBehavior;
    window.updateFlankingBehavior = updateFlankingBehavior;
    window.updateEngagementBehavior = updateEngagementBehavior;
    window.updatePatrolBehavior = updatePatrolBehavior;
    window.updateLocalEnemyBehavior = updateLocalEnemyBehavior;
    window.updateEnhancedEnemyBehavior = updateEnhancedEnemyBehavior;
    window.updateBossBehavior = updateBossBehavior;
    window.updateSupportBehavior = updateSupportBehavior;
    window.fireEnemyWeapon = fireEnemyWeapon;

    // COMBAT FEEL — evasive maneuvers / attack rhythm. Exposed so other
    // systems (wingman AI, set-piece scripts, the playtest probe) can
    // provoke or inspect a dodge without duplicating the logic.
    window.EVASIVE_MANEUVERS = _EVASIVE;
    window.FACTION_ATTACK_PATTERNS = _FACTION_ATTACK;
    window._updateEnemyFireCycle = _updateEnemyFireCycle;
    window._enemyAttackPhase = _attackPhase;


    // Make keys available globally for game-physics.js
    window.keys = keys;
    
    // Make music system available
    window.musicSystem = musicSystem;
    
    console.log('âœ… Enhanced Game Controls loaded - All functions exported');
}

console.log('ðŸ Game Controls script completed successfully!');

// =============================================================================
// NEBULA SOUND DEBUG MENU - DISABLED
// Will be re-enabled when proper sound testing panel is implemented
// =============================================================================

// DISABLED: Debug menu and T key listener commented out
/*
window.nebulaDebugState = {
    mysteryFreq: 220,
    fadeInTime: 2,
    fadeOutTime: 8,
    interval: 14,
    volume: 0.04,
    bassEnabled: true,
    padEnabled: true,
    lastTrigger: null
};

window.toggleNebulaDebug = function() {
    const debugMenu = document.getElementById('nebulaSoundDebug');
    if (debugMenu) {
        debugMenu.classList.toggle('hidden');
    }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 't' || e.key === 'T') {
        if (typeof gameState !== 'undefined' && gameState.gameStarted && !gameState.paused) {
            e.preventDefault();
            toggleNebulaDebug();
        }
    }
});
*/

// DISABLED: All debug functions commented out
/*
window.updateMysteryFreq = function(value) {
    window.nebulaDebugState.mysteryFreq = parseFloat(value);
    document.getElementById('mysteryFreqValue').textContent = value + ' Hz';
};

// Update fade in time
window.updateFadeIn = function(value) {
    window.nebulaDebugState.fadeInTime = parseFloat(value);
    document.getElementById('fadeInValue').textContent = value + 's';
};

// Update fade out time
window.updateFadeOut = function(value) {
    window.nebulaDebugState.fadeOutTime = parseFloat(value);
    document.getElementById('fadeOutValue').textContent = value + 's';
};

// Update interval
window.updateInterval = function(value) {
    window.nebulaDebugState.interval = parseFloat(value);
    document.getElementById('intervalValue').textContent = value + 's';
};

// Update volume
window.updateVolume = function(value) {
    window.nebulaDebugState.volume = parseFloat(value);
    document.getElementById('volumeValue').textContent = value;
};

// Manual trigger mystery tone with debug settings
window.triggerDebugMysteryTone = function() {
    if (typeof audioContext === 'undefined' || !audioContext || typeof mysteryGain === 'undefined' || !mysteryGain || typeof mysteryOsc === 'undefined' || !mysteryOsc) {
        console.log('❌ Audio context not initialized');
        alert('Nebula sounds not initialized yet. Enter a nebula first!');
        return;
    }

    const now = audioContext.currentTime;
    const state = window.nebulaDebugState;

    // Use debug frequency
    const freqOptions = [state.mysteryFreq * 0.9, state.mysteryFreq, state.mysteryFreq * 1.1];
    const freq = freqOptions[Math.floor(Math.random() * freqOptions.length)];

    // Apply debug settings
    mysteryGain.gain.cancelScheduledValues(now);
    mysteryGain.gain.setValueAtTime(0, now);
    mysteryGain.gain.linearRampToValueAtTime(state.volume, now + state.fadeInTime);
    mysteryGain.gain.linearRampToValueAtTime(0.001, now + state.fadeInTime + state.fadeOutTime);

    mysteryOsc.frequency.setValueAtTime(freq, now);

    // Update debug display
    window.nebulaDebugState.lastTrigger = new Date().toLocaleTimeString();
    updateDebugState();

    console.log(`🎵 Debug mystery tone triggered: ${freq.toFixed(1)} Hz`);
};

// Toggle bass layer
window.toggleDebugBass = function() {
    if (typeof audioContext === 'undefined' || !audioContext) {
        alert('Audio context not initialized yet. Enter a nebula first!');
        return;
    }

    window.nebulaDebugState.bassEnabled = !window.nebulaDebugState.bassEnabled;
    const btn = document.getElementById('toggleBassBtn');
    if (btn) {
        btn.textContent = `Toggle Bass (${window.nebulaDebugState.bassEnabled ? 'ON' : 'OFF'})`;
    }

    if (typeof bassGain !== 'undefined' && bassGain) {
        const now = audioContext.currentTime;
        bassGain.gain.cancelScheduledValues(now);
        bassGain.gain.linearRampToValueAtTime(
            window.nebulaDebugState.bassEnabled ? 0.025 : 0,
            now + 0.5
        );
    }
};

// Toggle pad layer
window.toggleDebugPad = function() {
    if (typeof audioContext === 'undefined' || !audioContext) {
        alert('Audio context not initialized yet. Enter a nebula first!');
        return;
    }

    window.nebulaDebugState.padEnabled = !window.nebulaDebugState.padEnabled;
    const btn = document.getElementById('togglePadBtn');
    if (btn) {
        btn.textContent = `Toggle Pad (${window.nebulaDebugState.padEnabled ? 'ON' : 'OFF'})`;
    }

    if (typeof padGain !== 'undefined' && padGain) {
        const now = audioContext.currentTime;
        padGain.gain.cancelScheduledValues(now);
        padGain.gain.linearRampToValueAtTime(
            window.nebulaDebugState.padEnabled ? 0.015 : 0,
            now + 0.5
        );
    }
};

// Stop all nebula sounds
window.stopAllNebulaSounds = function() {
    if (musicSystem.backgroundMusic && musicSystem.backgroundMusic.stop) {
        musicSystem.backgroundMusic.stop();
        console.log('🛑 All nebula sounds stopped');
    }
};

// Update debug state display
function updateDebugState() {
    const stateDiv = document.getElementById('debugState');
    if (!stateDiv) return;

    const contextState = (typeof audioContext !== 'undefined' && audioContext) ? audioContext.state : 'not initialized';
    const lastTrigger = window.nebulaDebugState.lastTrigger || 'Never';

    stateDiv.innerHTML = `
        <div>Audio Context: <span class="text-green-400">${contextState}</span></div>
        <div>Mystery Tone Active: <span class="${(typeof audioContext !== 'undefined' && audioContext && audioContext.state === 'running') ? 'text-green-400' : 'text-gray-400'}">
            ${(typeof audioContext !== 'undefined' && audioContext && audioContext.state === 'running') ? 'Yes' : 'No'}
        </span></div>
        <div>Last Trigger: <span class="text-yellow-400">${lastTrigger}</span></div>
    `;
}

// Initialize debug menu buttons
document.addEventListener('DOMContentLoaded', () => {
    const triggerBtn = document.getElementById('triggerMysteryBtn');
    if (triggerBtn) {
        triggerBtn.addEventListener('click', window.triggerDebugMysteryTone);
    }

    const stopBtn = document.getElementById('stopAllSoundsBtn');
    if (stopBtn) {
        stopBtn.addEventListener('click', window.stopAllNebulaSounds);
    }

    const toggleBassBtn = document.getElementById('toggleBassBtn');
    if (toggleBassBtn) {
        toggleBassBtn.addEventListener('click', window.toggleDebugBass);
    }

    const togglePadBtn = document.getElementById('togglePadBtn');
    if (togglePadBtn) {
        togglePadBtn.addEventListener('click', window.toggleDebugPad);
    }

    // Update debug state every second
    setInterval(updateDebugState, 1000);
});

console.log('🎵 Nebula Sound Debug Menu DISABLED (awaiting proper sound testing panel)');
*/

// =============================================================================
// NEBULA VISIBILITY TOGGLE COMMANDS
// =============================================================================

window.showNebulas = function() {
    if (typeof nebulaClouds === 'undefined' || nebulaClouds.length === 0) {
        console.log('⚠️ No nebulas found in scene');
        return;
    }

    nebulaClouds.forEach(nebula => {
        if (nebula) {
            nebula.visible = true;
        }
    });

    console.log(`✅ All ${nebulaClouds.length} nebulas are now visible`);
};

window.hideNebulas = function() {
    if (typeof nebulaClouds === 'undefined' || nebulaClouds.length === 0) {
        console.log('⚠️ No nebulas found in scene');
        return;
    }

    nebulaClouds.forEach(nebula => {
        if (nebula) {
            nebula.visible = false;
        }
    });

    console.log(`🙈 All ${nebulaClouds.length} nebulas are now hidden`);
};

window.toggleNebulas = function() {
    if (typeof nebulaClouds === 'undefined' || nebulaClouds.length === 0) {
        console.log('⚠️ No nebulas found in scene');
        return;
    }

    // Check current state of first nebula
    const currentlyVisible = nebulaClouds[0] && nebulaClouds[0].visible;

    nebulaClouds.forEach(nebula => {
        if (nebula) {
            nebula.visible = !currentlyVisible;
        }
    });

    console.log(`🔄 All ${nebulaClouds.length} nebulas toggled to ${!currentlyVisible ? 'visible' : 'hidden'}`);
};

console.log('🌫️ Nebula visibility commands loaded: showNebulas(), hideNebulas(), toggleNebulas()');

// =============================================================================
// ALLY NPC SHIPS — 2 independent wingmen patrolling the Sol system
// =============================================================================

const allyShips = [];

// ── Wingman role profiles ────────────────────────────────────────────────
// Each wingman is assigned a role that varies stat multipliers and target
// preference, so a squad of 4+ wingmen feels like distinct personalities
// without forking the AI state machine. Role mults are applied at use-time.
const WINGMAN_ROLES = {
    aggressor: {
        label: 'Aggressor',
        cruiseMult: 1.0, combatMult: 1.30, firingRangeMult: 1.5, detectionMult: 1.0,
        missilesMax: 8, missileCooldownMs: 6000, patrolDwellMs: 3000,
        // Closest enemy first
        pickTarget: (ally, candidates) => candidates[0] || null
    },
    sniper: {
        label: 'Sniper',
        cruiseMult: 0.85, combatMult: 0.95, firingRangeMult: 3.0, detectionMult: 1.2,
        missilesMax: 5, missileCooldownMs: 8000, patrolDwellMs: 6000,
        // Prefer boss, then highest-HP target
        pickTarget: (ally, candidates) => {
            if (!candidates.length) return null;
            const boss = candidates.find(c => c.userData && c.userData.isBoss);
            if (boss) return boss;
            return candidates.reduce((best, c) =>
                (!best || (c.userData.health || 0) > (best.userData.health || 0)) ? c : best, null);
        }
    },
    defender: {
        label: 'Defender',
        cruiseMult: 1.0, combatMult: 1.10, firingRangeMult: 1.0, detectionMult: 1.0,
        missilesMax: 6, missileCooldownMs: 4000, patrolDwellMs: 4000,
        // Prefer enemy nearest to the player (intercept role)
        pickTarget: (ally, candidates) => {
            if (!candidates.length) return null;
            if (typeof camera === 'undefined') return candidates[0];
            const playerPos = camera.position;
            let best = null, bestDist = Infinity;
            for (const c of candidates) {
                const d = c.position.distanceTo(playerPos);
                if (d < bestDist) { bestDist = d; best = c; }
            }
            return best;
        }
    },
    scout: {
        label: 'Scout',
        cruiseMult: 1.20, combatMult: 1.10, firingRangeMult: 1.0, detectionMult: 1.5,
        missilesMax: 5, missileCooldownMs: 8000, patrolDwellMs: 2500,
        // Closest enemy (but with longer detection range)
        pickTarget: (ally, candidates) => candidates[0] || null
    }
};
const _ROLE_ORDER = ['aggressor', 'defender', 'sniper', 'scout'];
function _roleFor(ally) {
    const k = ally && ally.userData && ally.userData.role;
    return WINGMAN_ROLES[k] || WINGMAN_ROLES.aggressor;
}
const _allyDir = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _allyTarget = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;

// Build a wingman group + mesh + userData. Returns the group ready to
// be positioned and added to the scene. Used for both the Sol-start
// Alpha and the rescue-Beta parked near Sagittarius A*.
function _makeWingman(roleKey, name, primaryColor) {
    const group = new THREE.Group();

    // Build the real-model mesh (null if the GLB isn't cached yet).
    // Factored out so the placeholder fallback below can UPGRADE itself
    // when the model finishes loading, instead of a cone forever.
    function _buildRealWingmanMesh() {
        if (typeof getPlayerModel !== 'function') return null;
        const model = getPlayerModel();
        if (!model) return null;
        const mesh = model.clone();
        const box = new THREE.Box3().setFromObject(mesh);
        const center = box.getCenter(new THREE.Vector3());
        mesh.traverse(child => {
            if (child.isMesh) {
                child.position.sub(center);
                child.material = new THREE.MeshBasicMaterial({
                    color: primaryColor,
                    transparent: true,
                    opacity: 0.85,
                    side: THREE.FrontSide
                });
                child.visible = true;
                child.frustumCulled = false;
            }
        });
        mesh.scale.set(96, 96, 96);
        return mesh;
    }

    let shipMesh = _buildRealWingmanMesh();
    let usedRealModel = !!shipMesh;
    if (!shipMesh) {
        const geo = new THREE.ConeGeometry(6, 16, 6);
        const mat = new THREE.MeshBasicMaterial({ color: primaryColor });
        shipMesh = new THREE.Mesh(geo, mat);
    }
    group.add(shipMesh);

    // Engine thruster glows — the SAME system the player ship uses
    // (createThrusterGlowsForModel), attached to the wingman's cloned
    // model at the identical local exhaust points. Only when the real
    // model was used (the fallback placeholder has no matching exhausts).
    let _wmThrusterGlows = [];
    if (usedRealModel && typeof createThrusterGlowsForModel === 'function') {
        _wmThrusterGlows = createThrusterGlowsForModel(shipMesh);
    }

    // INIT-RACE FIX: if this wingman was created before Player.glb finished
    // loading (the "permanent placeholder cone" bug), swap the real model
    // in as soon as it's cached. Boot.whenReady fires immediately if the
    // model is already there, later if not — creation order stops mattering.
    if (!usedRealModel && window.Boot) {
        window.Boot.whenReady('playerModel', () => {
            const real = _buildRealWingmanMesh();
            if (!real || group.userData.health <= 0) return;
            group.remove(shipMesh);
            if (shipMesh.geometry) shipMesh.geometry.dispose();
            if (shipMesh.material) shipMesh.material.dispose();
            group.add(real);
            if (typeof createThrusterGlowsForModel === 'function') {
                group.userData._thrusterGlows = createThrusterGlowsForModel(real);
            }
            console.log(`✅ ${name}: placeholder upgraded to real player model`);
        });
    }

    const profile = WINGMAN_ROLES[roleKey];
    group.userData = {
        type: 'ally',
        name: name,
        _thrusterGlows: _wmThrusterGlows,
        _thrusterGlowState: { intensity: 0 },
        role: roleKey,
        health: 50,
        maxHealth: 50,
        cruiseSpeed: 4.5,
        combatSpeed: 6.5,
        firingRange: 350,
        detectionRange: 3000,
        systemRadius: 100000,
        lastAttack: 0,
        currentTarget: null,
        isAlly: true,
        missilesRemaining: profile.missilesMax,
        missilesMax: profile.missilesMax,
        lastMissile: 0,
        missileCooldownMs: profile.missileCooldownMs,
        aiState: 'patrol',
        patrolTarget: null,
        patrolArriveTime: 0,
        patrolDwellMs: profile.patrolDwellMs,
        engageTarget: null,
        velocity: new THREE.Vector3(),
    };
    group.frustumCulled = false;
    return group;
}

function createAllyShips() {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined' || typeof camera === 'undefined') return;

    const sol = (typeof window !== 'undefined' && window.localSystemOffset)
        ? window.localSystemOffset
        : { x: 8000, y: 0, z: 4800 };

    // Alpha (Aggressor) starts WITH the player in the Sol system, just
    // off Earth's spawn position so the player has an immediate
    // wingman from frame 1.
    const alpha = _makeWingman('aggressor', 'Wingman Alpha', 0x00ff88);
    alpha.position.set(sol.x + 720, sol.y + 20, sol.z + 80);
    scene.add(alpha);
    allyShips.push(alpha);

    // Beta (Defender) + Gamma (Aggressor) deploy at Sagittarius A*
    // (world origin), ALREADY in the fight against the Vulcan patrols
    // there — active from frame 1, on opposite sides ~1500u out (just
    // beyond the black-hole keep-out, right in the Vulcan ring). The
    // wingman AI's _scanForEnemy picks up the nearby Vulcans and they
    // engage; while the player is far away in Sol they hold the line
    // here (patrol→engage, or stranded→engage between waves).
    const beta = _makeWingman('defender', 'Wingman Beta', 0x88aaff);
    beta.userData.colorNum = 0x88aaff;
    beta.position.set(1500, 80, 400);
    scene.add(beta);
    allyShips.push(beta);

    const gamma = _makeWingman('aggressor', 'Wingman Gamma', 0xffcc44);
    gamma.userData.colorNum = 0xffcc44;  // amber — read by thruster/radar tint
    gamma.position.set(-1400, -60, -500);
    scene.add(gamma);
    allyShips.push(gamma);

    console.log('🛡️ 3 wingmen deployed: Alpha at Sol, Beta + Gamma battling Vulcans at Sgr A*');
}

// ── Nebula wingman recruitment ───────────────────────────────────────────
// Greek alphabet names + matching colors for additional wingmen unlocked
// when the player discovers nebulas.
const NEBULA_WINGMAN_ROSTER = [
    { name: 'Wingman Gamma',   colorStr: '#ffaa44', colorNum: 0xffaa44 },
    { name: 'Wingman Delta',   colorStr: '#ff44aa', colorNum: 0xff44aa },
    { name: 'Wingman Epsilon', colorStr: '#44ffff', colorNum: 0x44ffff },
    { name: 'Wingman Zeta',    colorStr: '#aaff44', colorNum: 0xaaff44 },
    { name: 'Wingman Eta',     colorStr: '#ff8866', colorNum: 0xff8866 },
    { name: 'Wingman Theta',   colorStr: '#cc88ff', colorNum: 0xcc88ff },
    { name: 'Wingman Iota',    colorStr: '#88ff88', colorNum: 0x88ff88 },
    { name: 'Wingman Kappa',   colorStr: '#ff6699', colorNum: 0xff6699 }
];
let _nextNebulaWingmanIdx = 0;

function recruitNebulaWingman(nebulaName, spawnPos) {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined' || typeof camera === 'undefined') return null;
    if (_nextNebulaWingmanIdx >= NEBULA_WINGMAN_ROSTER.length) return null; // roster exhausted

    const recruit = NEBULA_WINGMAN_ROSTER[_nextNebulaWingmanIdx++];
    const group = new THREE.Group();

    let shipMesh;
    if (typeof getPlayerModel === 'function') {
        const model = getPlayerModel();
        if (model) {
            shipMesh = model.clone();
            const box = new THREE.Box3().setFromObject(shipMesh);
            const center = box.getCenter(new THREE.Vector3());
            shipMesh.traverse(child => {
                if (child.isMesh) {
                    child.position.sub(center);
                    child.material = new THREE.MeshBasicMaterial({
                        color: recruit.colorNum,
                        transparent: true,
                        opacity: 0.85,
                        side: THREE.FrontSide
                    });
                    child.visible = true;
                    child.frustumCulled = false;
                }
            });
            shipMesh.scale.set(96, 96, 96);
        }
    }
    if (!shipMesh) {
        const geo = new THREE.ConeGeometry(6, 16, 6);
        const mat = new THREE.MeshBasicMaterial({ color: recruit.colorNum });
        shipMesh = new THREE.Mesh(geo, mat);
    }
    group.add(shipMesh);

    // Spawn beside the player, slightly offset to avoid overlap
    const playerPos = camera.position.clone();
    const angle = Math.random() * Math.PI * 2;
    const offset = 250 + Math.random() * 150;
    if (spawnPos) {
        group.position.copy(spawnPos);
    } else {
        group.position.set(
            playerPos.x + Math.cos(angle) * offset,
            playerPos.y + (Math.random() - 0.5) * 60,
            playerPos.z + Math.sin(angle) * offset
        );
    }

    // Cycle through specialist roles (sniper, scout, aggressor, defender, …)
    // so each recruit feels distinct from Alpha/Beta and from the previous
    // recruits.  Alpha=aggressor, Beta=defender, then sniper → scout → repeat.
    const _recruitRoleOrder = ['sniper', 'scout', 'aggressor', 'defender'];
    const role = _recruitRoleOrder[(_nextNebulaWingmanIdx - 1) % _recruitRoleOrder.length];
    const profile = WINGMAN_ROLES[role] || WINGMAN_ROLES.aggressor;

    group.userData = {
        type: 'ally',
        name: recruit.name,
        colorStr: recruit.colorStr,
        recruitedFrom: nebulaName || 'unknown nebula',
        role: role,
        health: 50,
        maxHealth: 50,
        cruiseSpeed: 4.5,
        combatSpeed: 6.5,
        firingRange: 350,
        detectionRange: 3000,
        systemRadius: 100000,
        lastAttack: 0,
        currentTarget: null,
        isAlly: true,
        missilesRemaining: profile.missilesMax,
        missilesMax: profile.missilesMax,
        lastMissile: 0,
        missileCooldownMs: profile.missileCooldownMs,
        aiState: 'patrol',
        patrolTarget: null,
        patrolArriveTime: 0,
        patrolDwellMs: profile.patrolDwellMs,
        engageTarget: null,
        velocity: new THREE.Vector3(),
    };

    group.frustumCulled = false;
    scene.add(group);
    allyShips.push(group);

    // Hail the player — include the recruit's role so the squad composition
    // is visible at a glance (Aggressor/Defender/Sniper/Scout)
    if (typeof showAchievement === 'function') {
        showAchievement(
            recruit.name + ' (' + profile.label + ') has joined!',
            'Hailing from ' + (nebulaName || 'the nebula') + '. Welcome to the squadron.',
            true
        );
    }
    if (typeof flashEventText === 'function') {
        flashEventText('WINGMAN ACQUIRED', '#66ffcc',
            recruit.name + ' · ' + profile.label);
    }
    if (typeof playSound === 'function') {
        playSound('achievement', 880, 0.4);
    }
    console.log('🛡️ Recruited ' + recruit.name + ' from ' + (nebulaName || 'nebula'));

    return group;
}

// Pick a patrol waypoint.  When the player is in a home system, bias
// the waypoint toward the player so wingmen swarm within ~500 u.
function _pickPatrolWaypoint(excludePos, attractPos) {
    // If we have a player position to attract toward, pick a random
    // offset within 150-400 u of that position for tight cover.
    if (attractPos) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 150 + Math.random() * 250;
        return new THREE.Vector3(
            attractPos.x + Math.cos(angle) * dist,
            attractPos.y + (Math.random() - 0.5) * 40,
            attractPos.z + Math.sin(angle) * dist
        );
    }

    if (typeof planets === 'undefined') return new THREE.Vector3(Math.random() * 4000 - 2000, 0, Math.random() * 4000 - 2000);
    const candidates = [];
    for (let i = 0; i < planets.length; i++) {
        const p = planets[i];
        if (!p || !p.userData) continue;
        if (p.userData.type === 'asteroid' || p.userData.type === 'asteroidBelt') continue;
        if (p.userData.type === 'blackhole') continue;
        if (!p.userData.isLocal) continue;
        if (p.userData.isLocalStar) continue;
        candidates.push(p);
    }
    if (!candidates.length) return new THREE.Vector3(1000, 0, 1000);
    if (excludePos) {
        candidates.sort((a, b) => b.position.distanceTo(excludePos) - a.position.distanceTo(excludePos));
        const pick = candidates[Math.floor(Math.random() * Math.min(candidates.length, Math.ceil(candidates.length / 2)))];
        return pick.position.clone();
    }
    return candidates[Math.floor(Math.random() * candidates.length)].position.clone();
}

// Scan for the nearest alive hostile within detection range of this ally
function _scanForEnemy(ally) {
    const ud = ally.userData;
    const role = _roleFor(ally);
    const range = ud.detectionRange * (role.detectionMult || 1.0);

    // Collect candidates within range, sorted by distance to the wingman.
    // Role.pickTarget then picks based on the wingman's specialty (closest,
    // boss/highest-HP for snipers, closest-to-player for defenders, etc).
    const candidates = [];
    if (typeof enemies !== 'undefined') {
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (!e || !e.userData || e.userData.health <= 0) continue;
            const d = ally.position.distanceTo(e.position);
            if (d < range) candidates.push({ ent: e, d });
        }
    }
    if (typeof outerInterstellarSystems !== 'undefined') {
        const wp = new THREE.Vector3();
        outerInterstellarSystems.forEach(sys => {
            if (!sys.userData || !sys.userData.drones) return;
            sys.userData.drones.forEach(drone => {
                if (!drone || !drone.userData || drone.userData.health <= 0) return;
                drone.getWorldPosition(wp);
                const d = ally.position.distanceTo(wp);
                if (d < range) candidates.push({ ent: drone, d });
            });
        });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.d - b.d);
    const ents = candidates.map(c => c.ent);
    return role.pickTarget(ally, ents) || ents[0];
}

function _isPlayerInHomeSystem() {
    if (typeof camera === 'undefined') return false;
    const cp = camera.position;
    // Sol system: within ~7000u of origin
    if (cp.length() < 7000) return true;
    // Sagittarius A: check for nearby galactic-center black hole
    if (typeof planets !== 'undefined') {
        for (let i = 0; i < planets.length; i++) {
            const p = planets[i];
            if (p && p.userData && (p.userData.isSagittariusA || p.userData.isGalacticCenter)) {
                if (cp.distanceTo(p.position) < 7000) return true;
            }
        }
    }
    return false;
}

// Boss-victory wingman celebration. When an area boss (or mission
// boss) dies, every living wingman drops what it's doing and orbits
// the player tightly for a few seconds — a "we won" fly-by — before
// resuming patrol. triggerWingmanCelebration just stamps a global
// deadline; updateAllyShips reads it and switches state.
let _wingmanCelebrateUntil = 0;
function triggerWingmanCelebration(durationMs) {
    _wingmanCelebrateUntil = Date.now() + (durationMs || 5500);
    if (typeof showAchievement === 'function') {
        showAchievement('Squadron Victory Roll', 'Your wingmen rally around you to celebrate the kill!', false);
    }
}
if (typeof window !== 'undefined') window.triggerWingmanCelebration = triggerWingmanCelebration;

function updateAllyShips() {
    if (typeof camera === 'undefined' || typeof THREE === 'undefined') return;
    if (!gameState || !gameState.gameStarted || gameState.gameOver) return;

    if (!allyShips.length) return;

    const now = Date.now();
    const playerPos = camera.position;
    const playerWarping = _isPlayerWarping();
    const celebrating = now < _wingmanCelebrateUntil;

    // Player displacement since the previous AI tick — the carrier frame
    // the warp-follow rides (see _executeFollow). A jump > 2000u in one
    // tick is a teleport (black-hole warp) or a world-origin rebase, not
    // motion: zero it so wingmen aren't double-shifted; the FTL anchor
    // reunites the squad afterward.
    if (!updateAllyShips._prevPP) updateAllyShips._prevPP = playerPos.clone();
    if (!updateAllyShips._disp) updateAllyShips._disp = new THREE.Vector3();
    updateAllyShips._disp.subVectors(playerPos, updateAllyShips._prevPP);
    if (updateAllyShips._disp.lengthSq() > 4000000) updateAllyShips._disp.set(0, 0, 0);
    updateAllyShips._prevPP.copy(playerPos);

    allyShips.forEach(ally => {
        if (!ally || ally.userData.health <= 0) return;

        const ud = ally.userData;
        const pos = ally.position;
        const distFromOrigin = pos.length();
        const distToPlayer = pos.distanceTo(playerPos);

        // Wingman engine thrusters — driven exactly like the player ship's
        // (model-attached exhaust glows via updateThrusterGlowArray), not
        // the procedural enemy cone system. Lit when speeding up, warping,
        // or under any meaningful thrust.
        if (typeof updateThrusterGlowArray === 'function' && ud._thrusterGlows) {
            const vmag = ud.velocity ? ud.velocity.length() : 0;
            const prevSpeed = (typeof ud._prevGlowSpeed === 'number') ? ud._prevGlowSpeed : vmag;
            const accelerating = vmag > prevSpeed + 0.0006;
            const underPower = vmag > 0.05;
            const thrusting = ud._wasWarping || accelerating || underPower;
            updateThrusterGlowArray(ud._thrusterGlows, ud._thrusterGlowState, thrusting);
            ud._prevGlowSpeed = vmag;
        }

        // ── FTL anchor: warp ended this frame and a wingman in follow
        // state is still far from the player — pull them in via a small
        // hyperjump near the player rather than stranding them. Keeps the
        // squad together when emergency warp covers tens of thousands of
        // units of interstellar space.
        if (!playerWarping && ud._wasWarping && ud.aiState === 'follow' && distToPlayer > 1500) {
            _ftlAnchorWingman(ally, playerPos);
            ud._wasWarping = false;
        }
        // Track warping flag transition (used by the FTL anchor above)
        ud._wasWarping = playerWarping;

        // ── Enemy scan (every call, ~30 Hz) ──────────────────────────────
        const threat = _scanForEnemy(ally);

        // ── State transitions ────────────────────────────────────────────
        // Boss-victory celebration takes priority over everything except
        // an active warp (we never want wingmen stranded). They abandon
        // combat/patrol and rally into a tight orbit around the player.
        if (celebrating && !playerWarping) {
            if (ud.aiState !== 'celebrate') {
                _wingmanTacticalMessage(ud, 'kill');
                // Give each wingman a distinct orbit phase + radius so
                // they form a ring rather than stacking on one point.
                const idx = allyShips.indexOf(ally);
                ud._celebPhase = idx * (Math.PI * 2 / Math.max(1, allyShips.length));
                ud._celebRadius = 130 + (idx % 3) * 55;
                ud._celebHeight = (idx % 2 === 0 ? 1 : -1) * (30 + (idx % 3) * 20);
            }
            ud.aiState = 'celebrate';
            ud.engageTarget = null;
            ud.patrolTarget = null;
        } else if (!celebrating && ud.aiState === 'celebrate') {
            // Party's over — drop back to patrol (which biases toward
            // following the player, then on to the nebula).
            ud.aiState = 'patrol';
            ud.patrolTarget = null;
        }

        // Player is warping (slingshot/emergency/BH) — drop everything and follow
        if (playerWarping && ud.aiState !== 'engage') {
            if (ud.aiState !== 'follow') _wingmanTacticalMessage(ud, 'follow');
            ud.aiState = 'follow';
            ud.patrolTarget = null;
        }

        if (ud.aiState === 'patrol') {
            if (threat) {
                ud.aiState = 'engage';
                ud.engageTarget = threat;
                _wingmanTacticalMessage(ud, 'engage');
            } else if (distToPlayer > 4000) {
                // Separated by >4000u — stranded, orbit local planets here
                ud.aiState = 'stranded';
                _wingmanTacticalMessage(ud, 'stranded');
                ud.patrolTarget = null;
            } else if (distToPlayer > 400) {
                // Drifted past swarm radius — re-pick a waypoint near player
                ud.patrolTarget = null;
            }
        } else if (ud.aiState === 'follow') {
            // Stay in follow until player stops warping AND is reasonably close
            if (!playerWarping) {
                if (distToPlayer < 600) {
                    ud.aiState = 'patrol';
                    ud.patrolTarget = null;
                    _wingmanTacticalMessage(ud, 'tether');
                } else if (distToPlayer > 4000) {
                    ud.aiState = 'stranded';
                    ud.patrolTarget = null;
                    _wingmanTacticalMessage(ud, 'stranded');
                }
                // else stay in follow until close enough or fully stranded
            }
            if (threat && !playerWarping) {
                ud.aiState = 'engage';
                ud.engageTarget = threat;
            }
        } else if (ud.aiState === 'stranded') {
            // Reunion: player came back close enough — resume swarming
            if (distToPlayer < 1000) {
                ud.aiState = 'patrol';
                ud.patrolTarget = null;
                _wingmanTacticalMessage(ud, 'tether');
            }
            if (threat) {
                ud.aiState = 'engage';
                ud.engageTarget = threat;
            }
        } else if (ud.aiState === 'engage') {
            const et = ud.engageTarget;
            if (!et || !et.userData || et.userData.health <= 0 || !et.parent) {
                ud.engageTarget = null;
                ud.aiState = threat ? 'engage' : 'patrol';
                if (threat) ud.engageTarget = threat;
            } else {
                const engageDist = pos.distanceTo(et.position);
                if (engageDist > ud.detectionRange * 1.5) {
                    ud.aiState = 'patrol';
                    ud.engageTarget = null;
                }
            }
        } else if (ud.aiState === 'return') {
            if (distFromOrigin < ud.systemRadius * 0.7) {
                ud.aiState = 'patrol';
            }
            if (threat) {
                ud.aiState = 'engage';
                ud.engageTarget = threat;
            }
        }

        // ── Execute current state ────────────────────────────────────────
        if (ud.aiState === 'celebrate') {
            _executeCelebrate(ally, ud, now, playerPos);
        } else if (ud.aiState === 'engage' && ud.engageTarget) {
            _executeEngage(ally, ud, now);
        } else if (ud.aiState === 'follow') {
            _executeFollow(ally, ud, playerPos);
        } else if (ud.aiState === 'stranded') {
            _executeStranded(ally, ud, now);
        } else if (ud.aiState === 'return') {
            _executeReturn(ally, ud);
        } else {
            // Always swarm the player when within 4000u (any galaxy)
            _executePatrol(ally, ud, now, distToPlayer < 4000 ? playerPos : null);
        }

        // ── Tactical short-jump (the wingman's double-tap-W) ─────────────
        // When far from the objective — catching up to the player or
        // closing on an engaged target — wingmen burst-dash with a glowing
        // tracer streak, like the player's W×2 jump.
        {
            const _objective = (ud.aiState === 'engage' && ud.engageTarget && ud.engageTarget.position)
                ? ud.engageTarget.position
                : (distToPlayer > 1200 ? playerPos : null);
            if (!ud._jumpUntil && _objective &&
                pos.distanceTo(_objective) > 1200 &&
                now - (ud._lastJumpAt || 0) > 7000 + ((ally.id || 0) % 4000)) {
                ud._lastJumpAt = now;
                ud._jumpUntil = now + 850;
            }
            if (ud._jumpUntil) {
                if (now > ud._jumpUntil || !_objective) {
                    ud._jumpUntil = 0;
                } else {
                    if (!updateAllyShips._jumpVec) updateAllyShips._jumpVec = new THREE.Vector3();
                    const jv = updateAllyShips._jumpVec.subVectors(_objective, pos);
                    const jd = jv.length();
                    const step = Math.min(jd * 0.08, 14); // burst, easing on approach
                    jv.normalize();
                    ally.position.addScaledVector(jv, step);
                    // Face the JUMP direction — otherwise the facing block
                    // below uses the stale _allyDir from the state-execute
                    // (e.g. a patrol waypoint behind us), making the wingman
                    // fly backwards during the dash.
                    _allyDir.copy(jv);
                    // (Jump TRACER streaks removed — they read as glitchy
                    // lines off the wingmen's backs. The dash still happens.)
                }
            }
        }

        // ── Shield bubble: visible during combat engagement ──────────────
        _updateAllyShield(ally, ud.aiState === 'engage' && ud.engageTarget);

        // ── Idle asteroid target practice ────────────────────────────────
        // When not engaging an enemy, wingmen occasionally blast a nearby
        // asteroid — keeps the squadron looking active. ~5-9s per wingman.
        // THROTTLE THE SCAN ITSELF (not just the fire): the scan iterates
        // every planet (~3,500) at ~1ms. The old gate only updated its
        // timestamp on a successful fire, so in deep space with no asteroid
        // in range it re-scanned EVERY FRAME × every wingman — ~3ms/frame of
        // pure waste, the cause of the discovery-path chop. Stamp on every
        // scan attempt so it runs at most once per 5-9s per wingman.
        if (ud.aiState !== 'engage' && typeof _wingmanNearestAsteroid === 'function' &&
            now - (ud._lastAstScan || 0) > 5000 + ((ally.id || 0) % 4000)) {
            ud._lastAstScan = now;
            const ast = _wingmanNearestAsteroid(ally.position, 1400);
            if (ast) {
                const _ap = new THREE.Vector3();
                if (ast.getWorldPosition) ast.getWorldPosition(_ap); else _ap.copy(ast.position);
                const color = ud.name === 'Wingman Alpha' ? '#00ff88' : '#88aaff';
                _fireWingmanLaser(ally.position.clone(), _ap, color);
                if (typeof createHitSparks === 'function') createHitSparks(_ap, 0xffcc66);
            }
        }

        // ── Face movement direction ──────────────────────────────────────
        // lookAt points -Z toward the target; negate so the ship's +Z
        // (model forward) faces the travel direction.
        if (_allyDir.lengthSq() > 0.001) {
            const lookMat = new THREE.Matrix4().lookAt(
                pos, pos.clone().sub(_allyDir), new THREE.Vector3(0, 1, 0));
            const targetQuat = new THREE.Quaternion().setFromRotationMatrix(lookMat);
            ally.quaternion.slerp(targetQuat, 0.06);
        }

        // ── Passive health regen ─────────────────────────────────────────
        if (ud.health < ud.maxHealth && now % 3000 < 50) {
            ud.health = Math.min(ud.maxHealth, ud.health + 1);
        }
    });
}

// ── Patrol: cruise between waypoints (biased toward player in home systems)
function _executePatrol(ally, ud, now, attractPos) {
    if (!ud.patrolTarget) {
        ud.patrolTarget = _pickPatrolWaypoint(ally.position, attractPos);
        ud.patrolArriveTime = 0;
    }

    _allyDir.subVectors(ud.patrolTarget, ally.position);
    const dist = _allyDir.length();

    if (dist < 120) {
        // Arrived at waypoint — dwell briefly, then pick a new one
        if (!ud.patrolArriveTime) ud.patrolArriveTime = now;
        // Drift gently while dwelling
        ud.velocity.multiplyScalar(0.92);
        ally.position.add(ud.velocity);
        if (now - ud.patrolArriveTime > ud.patrolDwellMs) {
            ud.patrolTarget = _pickPatrolWaypoint(ally.position, attractPos);
            ud.patrolArriveTime = 0;
        }
    } else {
        // Cruise toward waypoint with proportional speed control
        _allyDir.normalize();
        const role = _roleFor(ally);
        const cruise = ud.cruiseSpeed * (role.cruiseMult || 1.0);
        const targetSpeed = Math.min(cruise, dist * 0.02);
        ud.velocity.lerp(_allyDir.clone().multiplyScalar(targetSpeed), 0.04);
        ally.position.add(ud.velocity);
    }
}

// ── Engage: pursue and fire at hostile ───────────────────────────────────
function _executeEngage(ally, ud, now) {
    const et = ud.engageTarget;
    const enemyPos = et.position ? et.position.clone() : new THREE.Vector3();
    // For drones parented to outer-system groups, use world position
    if (et.parent && et.parent.type === 'Group' && et.parent.parent) {
        et.getWorldPosition(enemyPos);
    }

    const role = _roleFor(ally);
    const combatSpeed = ud.combatSpeed * (role.combatMult || 1.0);
    const firingRange = ud.firingRange * (role.firingRangeMult || 1.0);

    _allyDir.subVectors(enemyPos, ally.position);
    const dist = _allyDir.length();
    _allyDir.normalize();

    if (dist > firingRange) {
        // Close the distance — pursuit speed
        const chaseSpeed = Math.min(combatSpeed, dist * 0.03);
        ud.velocity.lerp(_allyDir.clone().multiplyScalar(chaseSpeed), 0.08);
    } else if (dist < 60) {
        // Too close — pull away slightly
        ud.velocity.lerp(_allyDir.clone().multiplyScalar(-1.0), 0.06);
    } else {
        // Strafing range — orbit the enemy at combat distance
        const tangent = new THREE.Vector3(-_allyDir.z, 0, _allyDir.x);
        ud.velocity.lerp(tangent.multiplyScalar(combatSpeed * 0.6), 0.05);
    }
    ally.position.add(ud.velocity);

    // Fire bright lasers when in range — wingmen do NO damage, just visuals
    // Wingmen don't fire for first 5 seconds, laser cooldown 1000ms
    const _gameAge = (gameState && gameState.gameStartTime) ? (Date.now() - gameState.gameStartTime) : 0;
    if (_gameAge < 5000) return;

    // ── Missile fire: cooldown + capacity scale with role ─────────
    if (dist < firingRange * 1.5 &&
        (ud.missilesRemaining || 0) > 0 &&
        now - (ud.lastMissile || 0) > (ud.missileCooldownMs || 8000)) {
        ud.lastMissile = now;
        ud.missilesRemaining = (ud.missilesRemaining || 0) - 1;
        _wingmanTacticalMessage(ud, 'missile');
        if (typeof _fireWingmanMissile === 'function') {
            _fireWingmanMissile(ally, et, enemyPos, ud);
        }
    }

    // ── Laser fire: 1000ms cooldown ────────────────────────────────
    if (dist < firingRange && now - ud.lastAttack > 1000) {
        ud.lastAttack = now;
        const color = ud.name === 'Wingman Alpha' ? '#00ff88' : '#88aaff';
        _fireWingmanLaser(ally.position.clone(), enemyPos, color);

        // Apply 10% laser damage
        if (et.userData) {
            // Wingman fire is also intercepted by the orange shield
            // (counts toward its 2-laser-hit break).
            if (typeof _enemyShieldAbsorbHit === 'function' &&
                _enemyShieldAbsorbHit(et, false)) {
                _activateOnDamage(et);
                return;
            }
            const wasAlive = et.userData.health > 0;
            et.userData.health -= 0.1;
            _activateOnDamage(et);
            if (typeof flashEnemyHit === 'function') flashEnemyHit(et, 0.1);

            // Kill notification + cleanup (remove from scene, run boss checks)
            if (wasAlive && et.userData.health <= 0) {
                _wingmanTacticalMessage(ud, 'kill');
                _handleWingmanKill(et);
            }
        }
    }
}

// ── Fire a wingman missile (visual + tracking + damage) ──────────────────
// Remove a wingman-killed enemy from the scene + array, run boss-spawn checks.
// Call when an enemy's health drops to 0 from wingman fire. Mirrors the
// essential cleanup that fireWeapon() does for player kills.
function _handleWingmanKill(enemy) {
    if (!enemy || !enemy.userData || enemy.userData._removedByWingman) return;
    enemy.userData._removedByWingman = true;

    // Visual + sound
    if (typeof createExplosionEffect === 'function') {
        createExplosionEffect(enemy.position);
    }
    if (typeof playSound === 'function') {
        playSound('explosion');
    }

    // Cluster + intel updates (some games track per-cluster kills)
    if (typeof updateClusterStatus === 'function') {
        try { updateClusterStatus(enemy); } catch (e) {}
    }
    if (typeof recordEnemyKillPosition === 'function') {
        try { recordEnemyKillPosition(enemy); } catch (e) {}
    }

    // Clear nav lock if this was the player's target
    if (gameState && gameState.targetLock && gameState.targetLock.target === enemy) {
        gameState.targetLock.target = null;
        gameState.targetLock.active = false;
    }
    if (gameState && gameState.currentTarget === enemy) {
        gameState.currentTarget = null;
    }

    // Remove from scene + enemies array
    if (typeof scene !== 'undefined' && scene.remove) scene.remove(enemy);
    if (typeof enemies !== 'undefined') {
        const idx = enemies.indexOf(enemy);
        if (idx !== -1) enemies.splice(idx, 1);
    }

    // Boss spawn checks
    if (typeof checkAndSpawnAreaBosses === 'function') checkAndSpawnAreaBosses();
    if (typeof checkGalaxyBossSpawn === 'function') checkGalaxyBossSpawn();
    if (typeof checkSpeciesBossSpawn === 'function') checkSpeciesBossSpawn();
    if (typeof checkAndSpawnEliteGuardians === 'function') checkAndSpawnEliteGuardians();
    if (typeof checkGalaxyClear === 'function') checkGalaxyClear();
}

function _fireWingmanMissile(ally, target, targetPos, ud) {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined' || !target) return;
    try {
        const startPos = ally.position.clone();
        const color = ud.name === 'Wingman Alpha' ? 0x00ff88 : 0x88aaff;

        const missileGeo = new THREE.CylinderGeometry(0.4, 0.7, 3, 8);
        const missileMat = new THREE.MeshBasicMaterial({ color: color });
        const missile = new THREE.Mesh(missileGeo, missileMat);
        missile.position.copy(startPos);

        // Glow
        const glowGeo = new THREE.CylinderGeometry(0.8, 1.2, 4, 8);
        const glowMat = new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: 0.45,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        missile.add(glow);

        const direction = new THREE.Vector3().subVectors(targetPos, startPos).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const axis = new THREE.Vector3().crossVectors(up, direction);
        const angle = Math.acos(up.dot(direction));
        if (axis.length() > 0.001) missile.setRotationFromAxisAngle(axis.normalize(), angle);

        scene.add(missile);

        // Wingman missile damage = 25% of player missile (3 → 0.75)
        const wingmanMissileDmg = (gameState && gameState.missiles ? gameState.missiles.damage : 3) * 0.25;
        const speed = 5.0;
        const velocity = direction.clone().multiplyScalar(speed);

        // Animate missile toward target
        const start = Date.now();
        const maxLife = 4000;
        const step = () => {
            const elapsed = Date.now() - start;
            if (elapsed > maxLife || !target.userData || target.userData.health <= 0) {
                scene.remove(missile);
                missile.geometry.dispose(); missile.material.dispose();
                glow.geometry.dispose(); glow.material.dispose();
                return;
            }
            // Track target
            const newDir = new THREE.Vector3().subVectors(target.position, missile.position).normalize();
            velocity.lerp(newDir.clone().multiplyScalar(speed), 0.1);
            missile.position.add(velocity);

            // Hit detection
            if (missile.position.distanceTo(target.position) < 30) {
                const wasAlive = target.userData.health > 0;
                target.userData.health -= wingmanMissileDmg;
                _activateOnDamage(target);
                if (typeof flashEnemyHit === 'function') flashEnemyHit(target, wingmanMissileDmg);
                if (typeof createExplosionEffect === 'function') createExplosionEffect(missile.position);
                if (wasAlive && target.userData.health <= 0) {
                    _wingmanTacticalMessage(ud, 'kill');
                    _handleWingmanKill(target);
                }
                scene.remove(missile);
                missile.geometry.dispose(); missile.material.dispose();
                glow.geometry.dispose(); glow.material.dispose();
                return;
            }
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    } catch (e) {}
}

// ── Fire a thick bright laser from a wingman (no damage, visual only) ────
// Nearest asteroid to a position (world-space, handles belt-parented rocks).
const _wnaTmp = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
function _wingmanNearestAsteroid(pos, range) {
    if (!_wnaTmp) return null;
    let best = null, bestD2 = (range || 1400) * (range || 1400); // squared — no sqrt
    if (typeof planets !== 'undefined') {
        for (let i = 0; i < planets.length; i++) {
            const p = planets[i];
            if (!p || !p.userData || p.userData.type !== 'asteroid') continue;
            if (p.getWorldPosition) p.getWorldPosition(_wnaTmp); else _wnaTmp.copy(p.position);
            const d2 = pos.distanceToSquared(_wnaTmp);
            if (d2 < bestD2) { bestD2 = d2; best = p; }
        }
    }
    // Interstellar / dense-galaxy-field asteroids (breakable rocks)
    if (typeof interstellarAsteroids !== 'undefined') {
        for (let i = 0; i < interstellarAsteroids.length; i++) {
            const a = interstellarAsteroids[i];
            if (!a || !a.userData || (a.userData.health !== undefined && a.userData.health <= 0)) continue;
            const d2 = pos.distanceToSquared(a.position);
            if (d2 < bestD2) { bestD2 = d2; best = a; }
        }
    }
    return best;
}

function _fireWingmanLaser(startPos, endPos, color) {
    if (typeof THREE === 'undefined' || typeof scene === 'undefined') return;
    try {
        const direction = new THREE.Vector3().subVectors(endPos, startPos);
        const length = direction.length();

        // CORE — thick, fully opaque
        const coreGeo = new THREE.CylinderGeometry(0.8, 0.8, length, 12);
        const coreMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1.0 });
        const core = new THREE.Mesh(coreGeo, coreMat);
        // OUTER GLOW — much wider, additive blend
        const glowGeo = new THREE.CylinderGeometry(2.2, 2.2, length, 12);
        const glowMat = new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: 0.45,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);

        const up = new THREE.Vector3(0, 1, 0);
        const dirNorm = direction.clone().normalize();
        const axis = new THREE.Vector3().crossVectors(up, dirNorm);
        const angle = Math.acos(up.dot(dirNorm));
        const orient = (mesh) => {
            mesh.position.copy(startPos);
            if (axis.length() > 0.001) {
                axis.normalize();
                mesh.setRotationFromAxisAngle(axis, angle);
            } else if (direction.y < 0) {
                mesh.rotateX(Math.PI);
            }
            mesh.position.add(direction.clone().multiplyScalar(0.5));
            mesh.renderOrder = 50;
        };
        orient(core);
        orient(glow);
        scene.add(core);
        scene.add(glow);

        // Fade out fast — same quick muzzle-flash fade as the player's
        // lasers (was a hard 250 ms hold then instant removal).
        let wlOpacity = 1.0;
        const wlFade = setInterval(() => {
            wlOpacity -= 0.4;
            coreMat.opacity = Math.max(0, wlOpacity);
            glowMat.opacity = Math.max(0, wlOpacity) * 0.45;
            if (wlOpacity <= 0) {
                clearInterval(wlFade);
                scene.remove(core); core.geometry.dispose(); core.material.dispose();
                scene.remove(glow); glow.geometry.dispose(); glow.material.dispose();
            }
        }, 25);
    } catch (e) {}
}

// ── Wingman tactical comms ──────────────────────────────────────────────
// Tactical chatter from wingmen during combat. Auto-displays a brief HUD
// transmission. Throttled per-wingman to once every 8s so they don't spam.
const WINGMAN_TACTICAL_LINES = {
    engage: [
        'Engaging hostile, Captain!',
        'Target acquired — moving in!',
        'I\'ve got eyes on the bandit!',
        'Locking on — covering you!',
        'Bogey in my sights!'
    ],
    kill: [
        'Splash one!',
        'Target eliminated, Captain.',
        'Got him!',
        'Hostile down!',
        'Scratch one bandit!'
    ],
    missile: [
        'Fox three! Missile away!',
        'Vampire away — track it!',
        'Missile inbound on target!'
    ],
    stranded: [
        'Captain, I\'ve lost contact — rendezvous when able.',
        'I\'ve fallen behind — orbiting local planets, awaiting your return.',
        'I can\'t keep up — falling out of range. I\'ll regroup at the nearest system.'
    ],
    follow: [
        'On your six, Captain!',
        'Forming up on your wing!',
        'Following you in.'
    ],
    // Wingman has just joined the formation (first deploy or rejoining
    // after being stranded). Distinct from 'follow' which fires whenever
    // the player triggers a warp event.
    tether: [
        'Tethered to your wing, Captain — ready to fly.',
        'Back on station, Captain. Good to see you.',
        'Squadron formation locked. Where to next?',
        'Reconnected — I\'ve got your six again.'
    ]
};

// ── Global wingman comms queue ───────────────────────────────────────────
// Multiple wingmen often hit the same state transition in the same frame
// (e.g. all fall stranded when the player warps far). Without serializing
// the popups they overlap and clip each other. The queue dispatches one
// every COMMS_INTERVAL_MS so the player can read each message in turn.
// Wingman comms serialize through this interval. Kept in step with the
// achievement display time (now 12s) so consecutive popups don't overlap.
const WINGMAN_COMMS_INTERVAL_MS = 12000;
const _wingmanCommsQueue = [];
let _wingmanCommsLastDispatch = 0;
let _wingmanCommsTimer = null;

function _drainWingmanComms() {
    _wingmanCommsTimer = null;
    if (!_wingmanCommsQueue.length) return;
    const now = Date.now();
    const wait = (_wingmanCommsLastDispatch + WINGMAN_COMMS_INTERVAL_MS) - now;
    if (wait > 0) {
        _wingmanCommsTimer = setTimeout(_drainWingmanComms, wait);
        return;
    }
    const msg = _wingmanCommsQueue.shift();
    _wingmanCommsLastDispatch = now;
    if (typeof showAchievement === 'function') {
        showAchievement(msg.title, msg.text, false);
    }
    if (_wingmanCommsQueue.length) {
        _wingmanCommsTimer = setTimeout(_drainWingmanComms, WINGMAN_COMMS_INTERVAL_MS);
    }
}

function _enqueueWingmanComms(title, text) {
    // De-dup identical messages already pending so a frame full of duplicate
    // events (every wingman becomes stranded simultaneously) only shows one.
    if (_wingmanCommsQueue.some(m => m.title === title && m.text === text)) return;
    _wingmanCommsQueue.push({ title, text });
    if (!_wingmanCommsTimer) _drainWingmanComms();
}

function _wingmanTacticalMessage(ud, kind) {
    if (!ud) return;
    const now = Date.now();
    if (!ud._lastTacticalMsg) ud._lastTacticalMsg = {};
    if (now - (ud._lastTacticalMsg[kind] || 0) < 8000) return; // 8s per-kind throttle
    ud._lastTacticalMsg[kind] = now;
    const lines = WINGMAN_TACTICAL_LINES[kind];
    if (!lines || !lines.length) return;
    const text = lines[Math.floor(Math.random() * lines.length)];
    _enqueueWingmanComms(ud.name + ' (Comms)', text);
}

// ── Large multi-stage explosion when a wingman is destroyed ─────────────
function createWingmanExplosion(ally) {
    if (!ally || !ally.position || typeof scene === 'undefined') return;
    const center = ally.position.clone();
    const baseColor = ally.userData && ally.userData.name === 'Wingman Alpha' ? 0x00ff88 : 0x88aaff;

    // Hide the ship mesh — it's gone
    ally.visible = false;

    // Wingman deaths get a unique two-stage signature so the player
    // notices immediately and from a distance:
    //   1) An "implosion flash" — a small white-hot core that briefly
    //      contracts (scales from 1.4 -> 0.4) before the main blast.
    //   2) Eight radiating energy beams in the wingman's faction colour,
    //      shooting out from the center as the fireball blooms.
    // Plus the classic fireball + shockwave + drifting particles below.

    // 1) Implosion flash
    const implGeo = new THREE.SphereGeometry(80, 16, 12);
    const implMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 1.0,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const impl = new THREE.Mesh(implGeo, implMat);
    impl.position.copy(center);
    impl.renderOrder = 61;
    scene.add(impl);

    // 2) Eight radiating energy beams (cylinders pointing outward).
    // Stored on a group so we can scale/fade them together.
    const beamGroup = new THREE.Group();
    beamGroup.position.copy(center);
    const beams = [];
    for (let i = 0; i < 8; i++) {
        const beamGeo = new THREE.CylinderGeometry(2, 6, 200, 6);
        const beamMat = new THREE.MeshBasicMaterial({
            color: baseColor, transparent: true, opacity: 0.0,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        // Move pivot to base so the beam extends outward along +Y when scaled
        beam.position.set(0, 100, 0);
        const pivot = new THREE.Group();
        pivot.add(beam);
        // Distribute around the sphere using Fibonacci-ish polar coords
        const polar = Math.acos(1 - 2 * (i + 0.5) / 8);
        const az    = Math.PI * (3 - Math.sqrt(5)) * i;
        pivot.rotation.x = polar - Math.PI / 2;
        pivot.rotation.y = az;
        beamGroup.add(pivot);
        beams.push({ pivot, mesh: beam, mat: beamMat });
    }
    beamGroup.renderOrder = 62;
    scene.add(beamGroup);

    // 3) Large fireball
    const fireballGeo = new THREE.SphereGeometry(60, 20, 16);
    const fireballMat = new THREE.MeshBasicMaterial({
        color: 0xffcc44, transparent: true, opacity: 1.0,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const fireball = new THREE.Mesh(fireballGeo, fireballMat);
    fireball.position.copy(center);
    fireball.renderOrder = 60;
    scene.add(fireball);

    // 4) Faction-colored shockwave ring
    const shockGeo = new THREE.RingGeometry(20, 40, 32);
    const shockMat = new THREE.MeshBasicMaterial({
        color: baseColor, transparent: true, opacity: 0.9,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const shock = new THREE.Mesh(shockGeo, shockMat);
    shock.position.copy(center);
    if (typeof camera !== 'undefined') shock.lookAt(camera.position);
    shock.renderOrder = 60;
    scene.add(shock);

    // 5) Particle burst (count bumped from 80 to 140)
    const partCount = 140;
    const partGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(partCount * 3);
    const velocities = [];
    for (let i = 0; i < partCount; i++) {
        positions[i*3] = 0; positions[i*3+1] = 0; positions[i*3+2] = 0;
        velocities.push(new THREE.Vector3(
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4
        ));
    }
    partGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const partMat = new THREE.PointsMaterial({
        color: 0xffaa44, size: 4, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false
    });
    const particles = new THREE.Points(partGeo, partMat);
    particles.position.copy(center);
    scene.add(particles);

    // Animate over 1.8s — longer than before to give the implosion +
    // beams + fireball + drift time to read distinctly.
    const start = Date.now();
    const duration = 1800;
    const step = () => {
        const elapsed = Date.now() - start;
        const t = Math.min(1, elapsed / duration);

        // Implosion flash: scales DOWN over the first 250ms, white-hot,
        // then disappears. Reads as the wingman's ship being yanked
        // inward right before the burst.
        const implPhase = Math.min(1, elapsed / 250);
        const implScale = 1.4 - implPhase * 1.0;       // 1.4 -> 0.4
        impl.scale.set(implScale, implScale, implScale);
        impl.material.opacity = Math.max(0, 1 - implPhase);

        // Energy beams: extend over the first 700ms (held visible),
        // then fade. They scale along +Y, the cylinder's long axis.
        const beamPhase = Math.min(1, elapsed / 700);
        const beamScale = 0.2 + beamPhase * 1.6;       // grows to 1.8x length
        for (let i = 0; i < beams.length; i++) {
            beams[i].mesh.scale.set(1, beamScale, 1);
            // Fade in fast, fade out after the 700ms mark.
            const beamOp = elapsed < 700
                ? Math.min(1, elapsed / 100)
                : Math.max(0, 1 - (elapsed - 700) / 700);
            beams[i].mat.opacity = beamOp;
        }

        // Fireball: expand fast then fade
        const fbScale = 1 + t * 3;
        fireball.scale.set(fbScale, fbScale, fbScale);
        fireball.material.opacity = Math.max(0, 1 - t * 1.2);

        // Shockwave: expand wider, fade
        const sScale = 1 + t * 8;
        shock.scale.set(sScale, sScale, sScale);
        shock.material.opacity = Math.max(0, 0.9 - t);

        // Particles drift outward
        const arr = partGeo.attributes.position.array;
        for (let i = 0; i < partCount; i++) {
            arr[i*3]   += velocities[i].x;
            arr[i*3+1] += velocities[i].y;
            arr[i*3+2] += velocities[i].z;
        }
        partGeo.attributes.position.needsUpdate = true;
        partMat.opacity = Math.max(0, 1 - t);

        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            scene.remove(impl); impl.geometry.dispose(); impl.material.dispose();
            scene.remove(beamGroup);
            for (let i = 0; i < beams.length; i++) {
                beams[i].mesh.geometry.dispose();
                beams[i].mat.dispose();
            }
            scene.remove(fireball); fireball.geometry.dispose(); fireball.material.dispose();
            scene.remove(shock); shock.geometry.dispose(); shock.material.dispose();
            scene.remove(particles); particles.geometry.dispose(); particles.material.dispose();
        }
    };
    requestAnimationFrame(step);

    // Layered wingman-death audio: two booms + a damage tone (distinct
    // from the player's death stack, but unmistakable as "we lost one").
    if (typeof playSound === 'function') {
        try { playSound('explosion'); } catch (e) {}
        try { playSound('damage');    } catch (e) {}
        setTimeout(() => { try { playSound('explosion'); } catch (e) {} }, 260);
    }
}

// ── Update or create a shield bubble around an ally ──────────────────────
function _updateAllyShield(ally, active) {
    if (typeof THREE === 'undefined') return;
    const ud = ally.userData;
    // Brief red flash when the wingman is hit — even when they're not
    // engaging — matches the player's shield reaction. The flash flag
    // is set by flashEnemyHit; we lazy-create the mesh just for the
    // flash window if no engagement shield is currently up.
    const flashing = ud._shieldFlashUntil && Date.now() < ud._shieldFlashUntil;
    if (!active && !flashing) {
        if (ud.shieldMesh) {
            ally.remove(ud.shieldMesh);
            ud.shieldMesh.geometry.dispose();
            ud.shieldMesh.material.dispose();
            ud.shieldMesh = null;
        }
        return;
    }
    if (!ud.shieldMesh) {
        const color = ud.name === 'Wingman Alpha' ? 0x00ff88 : 0x88aaff;
        const geo = new THREE.SphereGeometry(30, 16, 12);
        const mat = new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: 0.18,
            blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
            depthWrite: false, wireframe: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = 49;
        ally.add(mesh);
        ud.shieldMesh = mesh;
        ud._shieldBaseColor = color;
    }
    const mat = ud.shieldMesh.material;
    if (flashing) {
        mat.color.setHex(0xff2200);
        mat.opacity = 0.6;
    } else {
        if (ud._shieldBaseColor) mat.color.setHex(ud._shieldBaseColor);
        mat.opacity = 0.15 + 0.08 * Math.sin(Date.now() * 0.005);
    }
}

// ── Player warp detection ────────────────────────────────────────────────
// Returns true during dedicated warp events OR whenever the player is
// cruising at 4 units/frame (4000 km/s) or faster — wingmen need to drop
// patrol behavior and lock onto the player's vector to keep up.
// ── FTL anchor: rejoin a wingman to the player after a long warp ────────
// Teleports the wingman to a flanking position near the player and zeros
// their velocity. Plays a brief warp-in flash so the rejoin reads as
// intentional FTL micro-jump, not a glitch. Used when warp ends and a
// wingman is still hopelessly far behind despite full speed-matching.
function _ftlAnchorWingman(ally, playerPos) {
    if (!ally || !playerPos) return;
    // Flank offset so multiple anchored wingmen don't stack on top of each
    // other or the player.
    const idx = (typeof allyShips !== 'undefined') ? allyShips.indexOf(ally) : 0;
    const ang = idx * (Math.PI * 2 / 5);
    const r = 220 + (idx % 3) * 60;
    const offset = new THREE.Vector3(Math.cos(ang) * r, (idx % 2 === 0 ? 30 : -30), Math.sin(ang) * r);
    ally.position.copy(playerPos).add(offset);
    if (ally.userData) {
        ally.userData.velocity = new THREE.Vector3();
        ally.userData.aiState = 'patrol';
        ally.userData.patrolTarget = null;
    }
    _wingmanTacticalMessage(ally.userData, 'tether');

    // Brief warp-in flash so the rejoin reads as an intentional FTL jump
    if (typeof THREE !== 'undefined' && typeof scene !== 'undefined') {
        const c = (ally.userData && ally.userData.colorStr) || '#88ccff';
        const flashGeo = new THREE.SphereGeometry(80, 12, 8);
        const flashMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(c), transparent: true, opacity: 0.85,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        const flash = new THREE.Mesh(flashGeo, flashMat);
        flash.position.copy(ally.position);
        scene.add(flash);
        let t = 0;
        const animate = () => {
            t += 1;
            flash.scale.multiplyScalar(0.92);
            flash.material.opacity *= 0.88;
            if (t < 24) requestAnimationFrame(animate);
            else { scene.remove(flash); flash.geometry.dispose(); flash.material.dispose(); }
        };
        requestAnimationFrame(animate);
    }
}

function _isPlayerWarping() {
    if (typeof gameState === 'undefined') return false;
    if (gameState.slingshot && gameState.slingshot.active) return true;
    if (gameState.emergencyWarp && (gameState.emergencyWarp.active || gameState.emergencyWarp.transitioning)) return true;
    if (gameState.blackHoleWarp && gameState.blackHoleWarp.active) return true;
    if (gameState.velocityVector && gameState.velocityVector.length() >= 4.0) return true;
    return false;
}

// ── Follow: player is warping or flying fast — match velocity, fly ahead ─
// Each wingman gets a unique position in the formation: staggered forward
// distance, alternating Y-height offsets, and left/right lateral spread so
// the squadron reads as a natural V-shape from the player's POV instead of
// a jittering cluster all at the same depth.
function _executeFollow(ally, ud, playerPos) {
    if (!gameState || !gameState.velocityVector) return;
    const playerVel = gameState.velocityVector.clone();
    const playerSpeed = playerVel.length();

    let aheadDir;
    if (playerSpeed > 0.1) {
        aheadDir = playerVel.clone().normalize();
    } else if (typeof camera !== 'undefined') {
        aheadDir = new THREE.Vector3();
        camera.getWorldDirection(aheadDir);
    } else {
        aheadDir = new THREE.Vector3(0, 0, -1);
    }
    const right = new THREE.Vector3().crossVectors(aheadDir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, aheadDir).normalize();

    const idx = (typeof allyShips !== 'undefined') ? allyShips.indexOf(ally) : 0;

    // Staggered forward distance — first wingman closest (200u), each
    // subsequent wingman 60u further back, so they fan out in depth
    const forwardDist = 200 + idx * 60;

    // Alternating lateral offset (left / right, growing wider with rank)
    const side = ((idx % 2 === 0) ? -1 : 1) * (50 + Math.floor(idx / 2) * 40);

    // Per-wingman Y-height variation so they're not on the same plane.
    // Small consistent offset per index + a gentle sine wobble keyed to
    // time and index, so the formation breathes a little but never jitters.
    // The wobble is suspended at warp speeds: with the carrier-frame follow
    // holding wingmen quasi-static on screen, the breathing was the last
    // visible relative motion — warp formation is now perfectly rigid.
    const baseY = ((idx % 3) - 1) * 35; // -35, 0, +35 cycling
    const wobbleY = playerSpeed > 4 ? 0 : Math.sin(Date.now() * 0.0006 + idx * 1.8) * 12;
    const heightOffset = baseY + wobbleY;

    const target = playerPos.clone()
        .addScaledVector(aheadDir, forwardDist)
        .addScaledVector(right, side)
        .addScaledVector(up, heightOffset);

    // ── WARP REGIME: carrier-frame follow ────────────────────────────
    // At warp the formation point moves ~15-150u per TICK. Chasing it
    // through absolute space with the velocity controller below is a
    // high-gain P-loop around a fast-moving target — once a wingman
    // reached formation the steering direction flipped every tick at
    // full warp magnitude, which is exactly the jitter seen on screen.
    // Instead: ride the player's own displacement (the carrier frame),
    // then ease the small formation error closed with a gentle,
    // speed-independent gain. Relative to the camera the wingman is now
    // quasi-static — rock steady at any warp speed. The displacement is
    // computed once per tick in updateAllyShips; teleports/world-origin
    // rebases zero it there and the FTL anchor handles reunification.
    if (playerSpeed > 4 && updateAllyShips._disp) {
        ally.position.add(updateAllyShips._disp);
        _allyDir.subVectors(target, ally.position);
        const err = _allyDir.length();
        ally.position.addScaledVector(_allyDir, 0.10);
        // ud.velocity mirrors the applied step so thruster glows and the
        // follow→patrol handoff stay continuous.
        ud.velocity.copy(updateAllyShips._disp).addScaledVector(_allyDir, 0.10);
        // Face the travel direction (formation error direction flips when
        // tiny — steering the nose by it made them spin); only face the
        // error while genuinely out of formation.
        if (err > 400) { _allyDir.normalize(); } else { _allyDir.copy(aheadDir); }
        return;
    }

    // Match the player's speed (or +20% so we keep the lead). No upper cap —
    // wingmen need to track up to 15+ units/frame (15000 km/s) when the
    // player is sustained-cruising, well past the patrol cap.
    const targetSpeed = Math.max(playerSpeed * 1.2, ud.cruiseSpeed);
    _allyDir.subVectors(target, ally.position);
    const dist = _allyDir.length();
    if (dist > 1) {
        _allyDir.normalize();
        // Stronger lerp factor so they accelerate hard when far behind —
        // the 0.18 was too slow to close gaps at cruise speeds.
        const lerpRate = playerSpeed > 6 ? 0.32 : 0.18;
        ud.velocity.lerp(_allyDir.clone().multiplyScalar(targetSpeed), lerpRate);
    }
    ally.position.add(ud.velocity);
}

// ── Stranded: separated from player. Orbit local planets here ────────────
function _executeStranded(ally, ud, now) {
    // Pick a local planet to orbit (at the wingman's current location, not Sol)
    if (!ud.patrolTarget || (ud.patrolArriveTime && now - ud.patrolArriveTime > 6000)) {
        ud.patrolTarget = _pickStrandedWaypoint(ally.position);
        ud.patrolArriveTime = 0;
    }

    _allyDir.subVectors(ud.patrolTarget, ally.position);
    const dist = _allyDir.length();
    if (dist < 200) {
        if (!ud.patrolArriveTime) ud.patrolArriveTime = now;
        ud.velocity.multiplyScalar(0.92);
    } else {
        _allyDir.normalize();
        const targetSpeed = Math.min(ud.cruiseSpeed, dist * 0.02);
        ud.velocity.lerp(_allyDir.clone().multiplyScalar(targetSpeed), 0.04);
    }
    ally.position.add(ud.velocity);
}

// Pick the nearest non-asteroid planet to a position (for stranded wingmen)
function _pickStrandedWaypoint(fromPos) {
    if (typeof planets === 'undefined') {
        return new THREE.Vector3(fromPos.x + 500, fromPos.y, fromPos.z + 500);
    }
    let best = null, bestDist = 8000;
    for (let i = 0; i < planets.length; i++) {
        const p = planets[i];
        if (!p || !p.userData) continue;
        if (p.userData.type === 'asteroid' || p.userData.type === 'asteroidBelt') continue;
        if (p.userData.type === 'blackhole') continue;
        const d = fromPos.distanceTo(p.position);
        if (d < bestDist && d > 100) { best = p; bestDist = d; }
    }
    if (best) {
        // Orbit at radius around the planet
        const angle = Math.random() * Math.PI * 2;
        const r = 250 + Math.random() * 150;
        return new THREE.Vector3(
            best.position.x + Math.cos(angle) * r,
            best.position.y + (Math.random() - 0.5) * 40,
            best.position.z + Math.sin(angle) * r
        );
    }
    return new THREE.Vector3(fromPos.x + 400, fromPos.y, fromPos.z + 400);
}

// ── Return: head back toward system center ───────────────────────────────
function _executeReturn(ally, ud) {
    const center = new THREE.Vector3(0, 0, 0);
    _allyDir.subVectors(center, ally.position).normalize();
    ud.velocity.lerp(_allyDir.clone().multiplyScalar(ud.cruiseSpeed * 1.5), 0.06);
    ally.position.add(ud.velocity);
}

// ── Celebrate: tight victory orbit around the player ─────────────────────
// Each wingman spirals into its assigned ring slot around the player
// and circles fast. The per-wingman phase/radius/height (set on entry
// to the state) keeps them spaced into a proper encircling formation
// rather than dogpiling one point.
function _executeCelebrate(ally, ud, now, playerPos) {
    const t = now * 0.004; // orbital speed
    const phase = ud._celebPhase || 0;
    const r = ud._celebRadius || 150;
    const h = ud._celebHeight || 0;
    const target = new THREE.Vector3(
        playerPos.x + Math.cos(t + phase) * r,
        playerPos.y + h + Math.sin(t * 1.5 + phase) * 25,
        playerPos.z + Math.sin(t + phase) * r
    );
    _allyDir.subVectors(target, ally.position);
    const dist = _allyDir.length();
    _allyDir.normalize();
    // Snappy chase so the ring forms quickly and circles with energy.
    const spd = Math.min((ud.combatSpeed || ud.cruiseSpeed || 4) * 1.4, Math.max(2, dist * 0.06));
    ud.velocity.lerp(_allyDir.clone().multiplyScalar(spd), 0.14);
    ally.position.add(ud.velocity);
}

function isAllyShip(obj) {
    return obj && obj.userData && obj.userData.isAlly;
}

if (typeof window !== 'undefined') {
    window.allyShips = allyShips;
    window.createAllyShips = createAllyShips;
    window.updateAllyShips = updateAllyShips;
    window.isAllyShip = isAllyShip;
    window.createWingmanExplosion = createWingmanExplosion;
    window.recruitNebulaWingman = recruitNebulaWingman;
}
