// Game UI - User interface updates, achievements, and map systems
// COMPREHENSIVE REWRITE: Fixed all compatibility issues with game-controls.js and game-physics.js
// Enhanced with doubled world scale and proper system integration
// FIXED: Removed duplicate functions, integrated with tutorial system, improved performance
// COMPLETE: All original functionality preserved with enhanced compatibility

// =============================================================================
// CORE UI UPDATE SYSTEM - ENHANCED INTEGRATION
// =============================================================================

// DOM element cache — updateUI/related frame-called functions used to run
// 40+ getElementById lookups every frame. Cache the refs and re-resolve
// lazily if the element gets detached (hull overlay, etc).
const _uiElCache = Object.create(null);
// Reusable vector for event-horizon world-position queries (avoids
// per-frame allocation in updateEventHorizonWarnings).
const _ehwTmpVec = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
// Scratch vector for the galaxy-map wingman heading markers (20Hz × 3 allies)
const _allyMarkerFwd = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
function _uiEl(id) {
    const cached = _uiElCache[id];
    if (cached && cached.isConnected) return cached;
    const el = document.getElementById(id);
    if (el) _uiElCache[id] = el;
    else delete _uiElCache[id];
    return el;
}
// Expose cache invalidation for callers that delete/replace tracked elements
window._invalidateUiElCache = function(id) {
    if (id) delete _uiElCache[id];
    else for (const k in _uiElCache) delete _uiElCache[k];
};

// =============================================================================
// DOM WRITE COALESCING + FRAME BUDGET HELPERS
// -----------------------------------------------------------------------------
// Profiled cost of this file's per-frame path (live flight, paired A/B of ten
// alternating 45-frame windows): the DOM/CSS layer was costing 13.8 ms/frame
// against the 3D renderer's 12.4 ms/frame — the HUD was more expensive than
// the entire game world. Most of that is browser-side style/paint work the
// JS never sees, and the cheapest way to stop paying it is simply to STOP
// HANDING THE BROWSER WORK: an assignment to `style.width` or `className`
// with the value it already holds still marks the element dirty and still
// costs a style recalc + repaint, even though nothing changed on screen.
//
// `_setStyle` / `_setText` / `_setClass` below each remember the last value
// they actually committed per element and drop no-op writes on the floor.
// Several readouts in this file already hand-rolled this check inline; these
// helpers cover the ones that didn't (the energy/hull bars alone were
// re-writing six style properties unconditionally, twice a second-of-frames,
// forever).
// =============================================================================
const _lastWritten = new WeakMap();
function _writeCache(el) {
    let c = _lastWritten.get(el);
    if (!c) { c = Object.create(null); _lastWritten.set(el, c); }
    return c;
}
function _setStyle(el, prop, value) {
    if (!el) return;
    const c = _writeCache(el);
    const k = '$' + prop;
    if (c[k] === value) return;
    c[k] = value;
    el.style[prop] = value;
}
function _setText(el, value) {
    if (!el) return;
    const c = _writeCache(el);
    if (c.$text === value) return;
    c.$text = value;
    el.textContent = value;
}
function _setClass(el, value) {
    if (!el) return;
    const c = _writeCache(el);
    if (c.$class === value) return;
    c.$class = value;
    el.className = value;
}
function _setHTML(el, value) {
    if (!el) return;
    const c = _writeCache(el);
    if (c.$html === value) return;
    c.$html = value;
    el.innerHTML = value;
}

// Coarse frame-budget gate for HUD blocks that are informational rather than
// flight-critical. Reputation tiers, black-hole proximity banners, orbit/warp
// button captions and the region enemy scan do not need to be re-derived 30
// times a second — a player cannot perceive the difference between a 10Hz and
// a 30Hz update on a text label, but the browser certainly can. Gating happens
// at the CALL SITE inside the frame loop only, never inside the functions
// themselves, so every event-driven caller elsewhere in the codebase (a kill,
// a warp, a docking) still gets its immediate, un-throttled refresh.
const _uiThrottleT = Object.create(null);
function _uiThrottle(key, intervalMs) {
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const last = _uiThrottleT[key];
    if (last !== undefined && now - last < intervalMs) return false;
    _uiThrottleT[key] = now;
    return true;
}

// --- Cheap number tweening for HUD text readouts -----------------------
// CSS can't transition a textContent number, so velocity/distance (the
// two numbers a pilot's eye is on constantly) get a lightweight
// framerate-independent smoothing pass here instead of snapping every
// tick — reads like a cockpit odometer rolling rather than a digital
// counter jumping. Cheap: one Map lookup + one exp-smoothing lerp per
// tracked value per frame, no allocation, no extra RAF loop (rides the
// existing updateUI call).
const _uiTweens = Object.create(null);
// Hull hit/repair flash bookkeeping (module scope so it persists across
// updateUI() calls without polluting gameState).
let _updateUI_lastHullPct = null;
let _lastHullFxTime = 0;
function _tweenTowards(key, target, rate) {
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    let t = _uiTweens[key];
    if (!t) {
        t = _uiTweens[key] = { value: target, last: now };
        return target;
    }
    const dt = Math.min(0.1, Math.max(0, (now - t.last) / 1000));
    t.last = now;
    const alpha = 1 - Math.exp(-(rate || 10) * dt);
    t.value += (target - t.value) * alpha;
    // Snap once close enough so the display settles instead of creeping
    // toward the target forever with diminishing fractions.
    if (Math.abs(target - t.value) < Math.max(0.01, Math.abs(target) * 0.001)) {
        t.value = target;
    }
    return t.value;
}

// Briefly flashes a HUD stat well (the bordered bar container around
// #energyBar / #hullBar) red on damage or green on a repair/resupply
// jump, restarting the CSS animation even if it's already mid-flash.
// Restart a one-shot CSS animation without the classic `void el.offsetWidth`
// reflow trick. Reading offsetWidth forces the browser to flush style and lay
// out the WHOLE document synchronously, mid-frame — an enormous price for
// what is really just "please rewind this animation". Cancelling the running
// animations through the Web Animations API achieves the same restart with no
// layout at all, and degrades to the old behaviour on anything that somehow
// lacks getAnimations().
function _restartAnimation(el) {
    if (!el) return;
    if (typeof el.getAnimations === 'function') {
        const running = el.getAnimations();
        for (let i = 0; i < running.length; i++) running[i].cancel();
    } else {
        void el.offsetWidth;
    }
}

function _flashStatWell(el, kind) {
    if (!el) return;
    el.classList.add('stat-well');
    el.classList.remove('stat-hit', 'stat-boost');
    _restartAnimation(el);
    el.classList.add(kind === 'hit' ? 'stat-hit' : 'stat-boost');
}

// Briefly pulses a text readout (e.g. the emergency warp counter) when
// its displayed value changes, so a resupply/use registers as feedback
// beyond the number itself changing.
function _tickValue(el) {
    if (!el) return;
    el.classList.remove('value-tick');
    _restartAnimation(el);
    el.classList.add('value-tick');
}

// Mirror reputation + shield state into the SHIP STATUS panel. Replaces
// the standalone REP HUD widget and the standalone .shield-indicator
// pill — both of which floated over the existing UI panels.
function updateRepHud() {
    if (typeof gameState === 'undefined') return;

    // Reputation rows in SHIP STATUS
    const repVal  = document.getElementById('shipRepValue');
    const repNext = document.getElementById('shipRepNext');
    const repBar  = document.getElementById('shipRepBar');
    if (repVal || repNext || repBar) {
        const rep  = gameState.reputation || 0;
        const tier = gameState.repTier || 0;
        const REP_TIERS = window.REP_TIERS;
        const next = REP_TIERS && REP_TIERS[tier];
        if (repVal && repVal.textContent !== String(rep)) repVal.textContent = String(rep);
        if (repNext) {
            const nextText = next ? ('· ' + next.name + ' @ ' + next.threshold) : '· all tiers unlocked';
            if (repNext.textContent !== nextText) repNext.textContent = nextText;
        }
        if (repBar) {
            let pct = 1;
            if (next) {
                const prev = tier > 0 ? REP_TIERS[tier - 1].threshold : 0;
                pct = Math.max(0, Math.min(1, (rep - prev) / (next.threshold - prev)));
            }
            const w = (pct * 100).toFixed(0) + '%';
            if (repBar.style.width !== w) repBar.style.width = w;
        }
    }

    // Shield row in SHIP STATUS (replaces the floating .shield-indicator).
    // Source-of-truth is shieldSystem.active (game-shields.js); fall back
    // to the existing #shieldStatus span the shield system writes to.
    const shipShield = document.getElementById('shipShieldStatus');
    if (shipShield) {
        const active = (typeof shieldSystem !== 'undefined' && shieldSystem && shieldSystem.active);
        let label = 'OFFLINE';
        let color = '#888';
        if (active) {
            const critical = (gameState.energy || 0) < 15;
            label = critical ? 'CRITICAL' : 'ACTIVE';
            color = critical ? '#ff6600' : '#00d4ff';
        }
        if (shipShield.textContent !== label) shipShield.textContent = label;
        if (shipShield.style.color !== color) shipShield.style.color = color;
    }
}

function updateUI() {
    // Safety check for game state
    if (typeof gameState === 'undefined' || !gameState) return;
    // Reputation + shield rows are slow-moving status text, not instruments —
    // 10Hz is indistinguishable to the eye and saves two thirds of this
    // block's DOM traffic. Event-driven callers (a rep award, a shield toggle)
    // still call updateRepHud() directly and get an immediate refresh.
    if (_uiThrottle('repHud', 100)) updateRepHud();

    // Ease HUD chrome opacity down during slingshot/emergency-warp spectacle,
    // back up the instant it ends. Hooked here (not just updateAllUISystems)
    // because this is the function the real per-frame loop in game-core.js
    // actually calls.
    if (typeof updateHudSpectacleDim === 'function') updateHudSpectacleDim();

    // FIXED: Properly define all UI elements at the start
    const velocityEl = _uiEl('velocity');
    const distanceEl = _uiEl('distance');
    const energyBarEl = _uiEl('energyBar');
    const hullBarEl = _uiEl('hullBar');
    const locationEl = _uiEl('location');
    const targetInfo = _uiEl('targetInfo');
    const emergencyWarpEl = _uiEl('emergencyWarpCount');
    const weaponStatusEl = _uiEl('weaponStatus');
    const galaxiesClearedEl = _uiEl('galaxiesCleared');
    const targetLockStatusEl = _uiEl('targetLockStatus');
    
    // Basic stats updates — only touch the DOM when the displayed value changes.
    // Values are smoothed through _tweenTowards first (cockpit-odometer
    // roll instead of a digital snap); the underlying gameState numbers
    // driving flight/physics are untouched, this only affects the readout.
    const _velSmoothed = _tweenTowards('velocity', gameState.velocity * 1000, 12);
    const _velText = _velSmoothed.toFixed(0) + ' km/s';
    if (velocityEl && velocityEl.textContent !== _velText) velocityEl.textContent = _velText;
    const _distSmoothed = _tweenTowards('distance', gameState.distance, 12);
    const _distText = _distSmoothed.toFixed(1) + ' ly';
    if (distanceEl && distanceEl.textContent !== _distText) distanceEl.textContent = _distText;

    // Location text: the DOM element was being looked up but never
    // written, so the SHIP STATUS panel was stuck on the initial
    // "Earth Surface - Launch Pad" string from index.html no matter
    // where the player flew. Mirror gameState.location into the panel.
    if (locationEl && gameState.location && locationEl.textContent !== gameState.location) {
        locationEl.textContent = gameState.location;
    }

    // Emergency Warp count update
    if (emergencyWarpEl && gameState.emergencyWarp) {
        const _warpText = '' + gameState.emergencyWarp.available;
        if (emergencyWarpEl.textContent !== _warpText) {
            emergencyWarpEl.textContent = _warpText;
            _tickValue(emergencyWarpEl); // pulse feedback on use/resupply
        }
    }

    // Galaxies Cleared (Ship Status panel). Element was fetched at
    // init but never written, so the span sat at its HTML default "0"
    // even though gameState.galaxiesCleared was incrementing (the
    // achievement banner reads the same field correctly).
    if (galaxiesClearedEl) {
        const _galText = '' + (gameState.galaxiesCleared || 0);
        if (galaxiesClearedEl.textContent !== _galText) galaxiesClearedEl.textContent = _galText;
    }
    // Also update mobile warp count
    const mobileWarpEl = _uiEl('mobileWarpCount');
    if (mobileWarpEl && gameState.emergencyWarp) {
        const _mwText = '' + gameState.emergencyWarp.available;
        if (mobileWarpEl.textContent !== _mwText) mobileWarpEl.textContent = _mwText;
    }
    // ENERGY BAR — every write below goes through _setStyle, which drops it
    // if the property already holds that exact value. This block used to
    // assign width + background + box-shadow + opacity unconditionally on
    // every single call, so a ship sitting still at 100% energy was still
    // dirtying (and repainting, through a backdrop-filtered panel) four
    // properties ~30 times a second for a bar that had not moved a pixel.
    // Width is also quantised to 0.5% — sub-pixel width churn on a 128px bar
    // is invisible but each distinct value is a fresh layout + paint.
    if (energyBarEl) {
    // First, always update the width to match current energy
    const energyPercent = Math.max(0, Math.min(100, gameState.energy));
    _setStyle(energyBarEl, 'width', (Math.round(energyPercent * 2) / 2) + '%');

    // Then apply visual effects if boosts are active.
    // Resolve the FINAL background once (boost tint, then the low-energy
    // colour coding that used to overwrite it a few lines later) and commit
    // a single value — the old code wrote background twice per call whenever
    // energy was under 25%, guaranteeing a repaint even when nothing changed.
    let _eBg, _eShadow, _eOpacity;
    if (gameState.solarStormBoostActive || gameState.plasmaStormBoostActive) {
        if (gameState.plasmaStormBoostActive) {
            // Purple plasma storm boost
            _eBg = 'linear-gradient(90deg, #8866ff 0%, #6644ff 50%, #aa88ff 100%)';
            _eShadow = '0 0 20px rgba(136, 102, 255, 0.9)';
        } else {
            // Yellow solar storm boost
            _eBg = 'linear-gradient(90deg, #ffd700 0%, #ffff00 50%, #ffa500 100%)';
            _eShadow = '0 0 20px rgba(255, 215, 0, 0.8)';
        }

        // Animate the bar — quantised to 2% steps so the sine sweep commits
        // ~10 distinct opacity values per cycle instead of a fresh float
        // (and therefore a fresh composite) on literally every frame.
        const pulseTime = Date.now() * 0.003;
        const pulse = Math.sin(pulseTime) * 0.1 + 0.9;
        _eOpacity = (Math.round(pulse * 50) / 50).toFixed(2);
    } else {
        // Normal energy bar appearance
        _eBg = 'linear-gradient(90deg, #1e40af 0%, #3b82f6 50%, #60a5fa 100%)';
        _eShadow = 'none';
        _eOpacity = '1';
    }

    // Enhanced color coding based on energy level
    if (energyPercent < 10) {
        _eBg = 'linear-gradient(90deg, #dc2626 0%, #ef4444 100%)';
    } else if (energyPercent < 25) {
        _eBg = 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)';
    }
    _setStyle(energyBarEl, 'background', _eBg);
    _setStyle(energyBarEl, 'boxShadow', _eShadow);
    _setStyle(energyBarEl, 'opacity', _eOpacity);
}

// Show energy percentage text with boost indicator. The innerHTML template
// below reparses HTML and rebuilds a <span> subtree — by far the most
// expensive single write in this function — and the countdown inside it only
// changes once per second, so _setHTML makes 29 of every 30 calls free.
if (gameState.solarStormBoostActive || gameState.plasmaStormBoostActive) {
    const timeLeft = Math.ceil(
        (gameState.plasmaStormBoostActive ? gameState.plasmaStormBoostEndTime : gameState.solarStormBoostEndTime)
        - Date.now()
    ) / 1000;
    const boostType = gameState.plasmaStormBoostActive ? 'PLASMA' : 'SOLAR';
    const boostColor = gameState.plasmaStormBoostActive ? '#8866ff' : '#ffd700';

    const energyDisplay = energyBarEl && energyBarEl.parentElement ? energyBarEl.parentElement.previousElementSibling : null;
    if (energyDisplay) {
        _setHTML(energyDisplay, `Energy: <span style="color: ${boostColor}; font-weight: bold; text-shadow: 0 0 10px ${boostColor};">${Math.round(gameState.energy)}% ⚡ ${boostType} (${timeLeft}s)</span>`);
    }
}

    // Enhanced hull display with dynamic color coding
    if (hullBarEl) {
        const hullPercent = (gameState.hull / gameState.maxHull * 100);
        _setStyle(hullBarEl, 'width', (Math.round(hullPercent * 2) / 2) + '%');

        // Enhanced color coding for hull
        if (gameState.hull < 25) {
            _setStyle(hullBarEl, 'background', 'linear-gradient(90deg, #ff0066 0%, #ff3366 100%)');
        } else if (gameState.hull < 50) {
            _setStyle(hullBarEl, 'background', 'linear-gradient(90deg, #ff6600 0%, #ff9933 100%)');
        } else {
            _setStyle(hullBarEl, 'background', 'linear-gradient(90deg, #ff0066 0%, #ff6600 50%, #00ff66 100%)');
        }

        // Instrument-level hit/repair feedback: flash the bar's well red
        // on a sudden drop, green on a sudden jump (resupply/pickup).
        // Thresholded + rate-limited so it doesn't retrigger on every
        // tiny passive-regen tick (those happen in ~0.5-1 pt steps).
        if (typeof _updateUI_lastHullPct === 'number') {
            const _hullDelta = hullPercent - _updateUI_lastHullPct;
            const _now = Date.now();
            if (_hullDelta <= -3 && _now - _lastHullFxTime > 300) {
                _flashStatWell(hullBarEl.parentElement, 'hit');
                _lastHullFxTime = _now;
            } else if (_hullDelta >= 5 && _now - _lastHullFxTime > 300) {
                _flashStatWell(hullBarEl.parentElement, 'boost');
                _lastHullFxTime = _now;
            }
        }
        _updateUI_lastHullPct = hullPercent;
    }
    
    // ADDED: Cracked screen effect at 10% hull.
    // Suppress (and tear down) while the player is dying / game over —
    // hull is 0 then, so this CRT-flicker "heavy damage" overlay would
    // otherwise stay plastered over the death explosion.
if (gameState.playerDying || gameState.gameOver || gameState.gameOverScreenShown) {
    const _cdo = document.getElementById('criticalDamageOverlay');
    if (_cdo) _cdo.remove();
} else if (gameState.hull <= 10 && !_uiEl('criticalDamageOverlay')) {
    const crackedOverlay = document.createElement('div');
    crackedOverlay.id = 'criticalDamageOverlay';
    crackedOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 35;
        background-image: 
            repeating-linear-gradient(
                0deg,
                transparent,
                transparent 2px,
                rgba(0, 255, 0, 0.03) 2px,
                rgba(0, 255, 0, 0.03) 4px
            ),
            repeating-linear-gradient(
                90deg,
                transparent,
                transparent 2px,
                rgba(255, 0, 0, 0.03) 2px,
                rgba(255, 0, 0, 0.03) 4px
            ),
            radial-gradient(circle at 30% 40%, transparent 20%, rgba(255,0,0,0.1) 50%),
            radial-gradient(circle at 70% 60%, transparent 20%, rgba(255,0,0,0.1) 50%),
            linear-gradient(45deg, transparent 40%, rgba(255,0,0,0.05) 41%, transparent 42%),
            linear-gradient(-45deg, transparent 40%, rgba(255,0,0,0.05) 41%, transparent 42%);
        animation: crtFlicker 0.15s infinite;
    `;
    document.body.appendChild(crackedOverlay);
    
    // Add CSS animation
    if (!document.getElementById('crtFlickerStyle')) {
        const style = document.createElement('style');
        style.id = 'crtFlickerStyle';
        style.textContent = `
            @keyframes crtFlicker {
                0% { opacity: 0.9; }
                50% { opacity: 1; }
                100% { opacity: 0.9; }
            }
        `;
        document.head.appendChild(style);
    }
} else if (gameState.hull > 10) {
    // Remove cracked screen effect when hull is repaired
    const overlay = document.getElementById('criticalDamageOverlay');
    if (overlay) overlay.remove();
}
    
    // Enhanced Target Lock status with tutorial awareness.
    // These two readouts change state a handful of times per FLIGHT, but the
    // old code re-assigned both textContent and className every call. A
    // className assignment is the single most expensive routine DOM write
    // available: it invalidates the element's whole style, its subtree's
    // inherited style, and — because `.pulse` toggles on and off here — its
    // compositing decision too.
    if (targetLockStatusEl) {
        if (gameState.targetLock && gameState.targetLock.active) {
            if (gameState.targetLock.target) {
                _setText(targetLockStatusEl, 'LOCKED ON TARGET');
                _setClass(targetLockStatusEl, 'text-yellow-400 pulse');
            } else {
                _setText(targetLockStatusEl, 'SEEKING TARGET');
                _setClass(targetLockStatusEl, 'text-orange-400 pulse');
            }
        } else {
            _setText(targetLockStatusEl, 'INACTIVE');
            _setClass(targetLockStatusEl, 'text-gray-400');
        }
    }

    // Enhanced weapon status with faster cooldown
    if (weaponStatusEl && gameState.weapons) {
        if (gameState.weapons.cooldownTime > 0) {
            _setText(weaponStatusEl, `RECHARGING (${(gameState.weapons.cooldownTime / 1000).toFixed(1)}s)`);
            _setClass(weaponStatusEl, 'text-orange-400');
        } else {
            _setText(weaponStatusEl, 'ARMED');
            _setClass(weaponStatusEl, 'text-green-400');
        }
    }
    
    // Enhanced target information display with special status indicators
    if (targetInfo) {
        // In demo mode the target + warp readout is already duplicated by the
        // bottom autopilot banner ("Pursuing X — Nu") and the floating
        // on-screen text, so hide this line. Manual play keeps it (it's the
        // player's only target readout).
        const _demoDriving = (typeof window !== 'undefined' && window.demoPilot && window.demoPilot.driving);
        if (_demoDriving) {
            _setStyle(targetInfo, 'display', 'none');
        } else {
            _setStyle(targetInfo, 'display', '');

        let targetInfoText = 'Target: None';
        let targetInfoClass = 'text-gray-400';

        if (gameState.currentTarget) {
            const target = gameState.currentTarget;
            const distance = typeof camera !== 'undefined' ? 
                camera.position.distanceTo(target.position).toFixed(0) : '?';
            
            // Enhanced target display with faction info
            let targetName = target.userData.name;
            if (target.userData.faction && target.userData.type === 'enemy') {
                targetName = `${target.userData.faction} Hostile`;
            }
            
            targetInfoText = `Target: ${targetName} (${distance} units)`;
            
            // Color coding based on target type
            if (target.userData.type === 'enemy') {
                targetInfoClass = target.userData.isBoss ? 'text-red-500' : 'text-red-400';
            } else if (target.userData.type === 'blackhole') {
                targetInfoClass = 'text-purple-400';
            } else if (target.userData.type === 'wormhole') {
                targetInfoClass = 'text-pink-400';
            } else if (target.userData.type === 'comet') {
                targetInfoClass = 'text-cyan-400';
            } else {
                targetInfoClass = 'text-blue-400';
            }
        }
        
        // Add special status indicators
        if (gameState.emergencyWarp && gameState.emergencyWarp.active) {
            const warpTime = (gameState.emergencyWarp.timeRemaining / 1000).toFixed(1);
            targetInfoText += ` | WARP: ${warpTime}s`;
            targetInfoClass = 'text-cyan-400 pulse';
        } else if (gameState.slingshot && gameState.slingshot.active) {
            const slingshotTime = (gameState.slingshot.timeRemaining / 1000).toFixed(1);
            targetInfoText += ` | SLINGSHOT: ${slingshotTime}s`;
            targetInfoClass = 'text-yellow-400 pulse';
        } else if (gameState.slingshot && gameState.slingshot.postSlingshot) {
            targetInfoText += ` | INERTIA: ${(gameState.velocity * 1000).toFixed(0)} km/s`;
            targetInfoClass = 'text-cyan-400';
        }
        
        // Apply the final text and class
        _setText(targetInfo, targetInfoText);
        _setClass(targetInfo, targetInfoClass + ' curved-element');
        } // end manual-play branch
    }

    // Update auto-navigate button with enhanced state tracking. A button
    // caption is not an instrument — 10Hz, same reasoning as the rep rows.
    if (_uiThrottle('autoNavBtn', 100)) updateAutoNavigateButton();
    
    // Enhanced velocity color coding with doubled scale
    if (velocityEl) {
        if (gameState.emergencyWarp && gameState.emergencyWarp.active) {
            _setClass(velocityEl, 'text-cyan-400 pulse font-mono');
        } else if (gameState.slingshot && gameState.slingshot.active) {
            _setClass(velocityEl, 'text-yellow-400 pulse font-mono');
        } else if (gameState.slingshot && gameState.slingshot.postSlingshot) {
            _setClass(velocityEl, 'text-cyan-400 font-mono');
        } else if (gameState.velocity >= 0.9) { // Doubled threshold
            _setClass(velocityEl, 'text-red-400 font-mono');
        } else if (gameState.velocity >= 0.6) { // Doubled threshold
            _setClass(velocityEl, 'text-yellow-400 font-mono');
        } else if (gameState.velocity >= 0.3) { // Doubled threshold
            _setClass(velocityEl, 'text-green-400 font-mono');
        } else {
            _setClass(velocityEl, 'text-blue-400 font-mono');
        }
    }
}

function updateCosmicEffectsUI() {
    // Navigation jamming indicator
    const navStatus = _uiEl('navigationStatus');
    if (navStatus && typeof gameState !== 'undefined') {
        if (gameState.navigationJammed) {
            navStatus.innerHTML = '<i class="fas fa-exclamation-triangle text-red-400"></i> Navigation Jammed!';
            navStatus.className = 'text-red-400 font-mono';
        } else {
            navStatus.innerHTML = '<i class="fas fa-compass text-green-400"></i> Navigation Clear';
            navStatus.className = 'text-green-400 font-mono';
        }
    }

    // Weapon power boost indicator
    const weaponStatus = _uiEl('weaponStatus');
    if (weaponStatus && typeof gameState !== 'undefined' && gameState.weaponPowerBoost > 1.0) {
        const boost = ((gameState.weaponPowerBoost - 1) * 100).toFixed(0);
        weaponStatus.innerHTML = `<i class="fas fa-bolt text-yellow-400"></i> Weapon Power +${boost}%`;
        weaponStatus.className = 'text-yellow-400 font-mono';
    }

    // Concealment indicator
    const concealmentStatus = _uiEl('concealmentStatus');
    if (concealmentStatus && typeof gameState !== 'undefined' && gameState.concealment > 0) {
        const concealment = (gameState.concealment * 100).toFixed(0);
        concealmentStatus.innerHTML = `<i class="fas fa-eye-slash text-blue-400"></i> Concealed ${concealment}%`;
        concealmentStatus.className = 'text-blue-400 font-mono';
    }
}

function updateAutoNavigateButton() {
    const autoNavBtn = _uiEl('autoNavigateBtn');
    if (!autoNavBtn || typeof gameState === 'undefined') return;
    
    if (gameState.currentTarget && !gameState.gameOver && gameState.energy > 10) {
        autoNavBtn.disabled = false;
        if (gameState.autoNavigating) {
            if (gameState.autoNavOrienting) {
                autoNavBtn.innerHTML = '<i class="fas fa-crosshairs mr-2"></i>Orienting to Target...';
            } else {
                autoNavBtn.innerHTML = '<i class="fas fa-pause mr-2"></i>Stop Auto-Navigate';
            }
        } else {
            autoNavBtn.innerHTML = '<i class="fas fa-crosshairs mr-2"></i>Auto-Navigate to Target';
        }
    } else {
        autoNavBtn.disabled = true;
        if (gameState.energy <= 10) {
            autoNavBtn.innerHTML = '<i class="fas fa-battery-empty mr-2"></i>Insufficient Energy for Auto-Nav';
        } else {
            autoNavBtn.innerHTML = '<i class="fas fa-crosshairs mr-2"></i>Auto-Navigate to Target';
        }
    }
}

// Update floating status displays
// NOTE: This function is duplicated later in this file (around line 2524)
// and will be overridden. Keeping this version for reference/fallback.
function updateMobileFloatingStatus() {
    if (typeof gameState === 'undefined') return;

    const hullEl = _uiEl('mobileFloatingHull');
    const energyEl = _uiEl('mobileFloatingEnergy');
    if (hullEl) hullEl.textContent = gameState.hull ? Math.round(gameState.hull) + '%' : '100%';
    if (energyEl) energyEl.textContent = gameState.energy ? Math.round(gameState.energy) + '%' : '100%';

    const warpBadge = _uiEl('mobileWarpCountBadge');
    if (warpBadge) warpBadge.textContent = gameState.emergencyWarp?.available ?? 5;
}

// =============================================================================
// ENHANCED TARGET SYSTEM - INTEGRATED WITH CONTROLS + COSMIC FEATURES
// =============================================================================

function populateTargets() {
    const container = document.getElementById('availableTargets');
    if (!container || typeof camera === 'undefined') return;
    
    container.innerHTML = '';

    // Enhanced targeting with better filtering - NO ASTEROIDS IN NAVIGATION (doubled ranges)
    const detectedWormholes = (typeof wormholes !== 'undefined') ? wormholes.filter(w => w.userData && w.userData.detected) : [];
    
    // FIXED: ADD COSMIC FEATURES TO TARGETING - Use world position for outer system features
    const cosmicTargets = [];
    if (typeof cosmicFeatures !== 'undefined') {
        // Helper function to get distance accounting for nested outer system objects
        const getCosmicDistance = (obj) => {
            if (obj.userData.isOuterSystem && obj.parent) {
                const worldPos = new THREE.Vector3();
                obj.getWorldPosition(worldPos);
                return camera.position.distanceTo(worldPos);
            }
            return camera.position.distanceTo(obj.position);
        };

        // Add nearby cosmic features within detection range (using world positions for outer systems)
        cosmicTargets.push(...cosmicFeatures.pulsars.filter(p => getCosmicDistance(p) < 2000));
        cosmicTargets.push(...cosmicFeatures.supernovas.filter(s => getCosmicDistance(s) < 3000));
        cosmicTargets.push(...cosmicFeatures.dysonSpheres.filter(d => getCosmicDistance(d) < 4000));
        cosmicTargets.push(...cosmicFeatures.ringworlds.filter(r => getCosmicDistance(r) < 4000));
        cosmicTargets.push(...cosmicFeatures.spaceWhales.filter(w => getCosmicDistance(w) < 2000));
        cosmicTargets.push(...cosmicFeatures.brownDwarfs.filter(bd => getCosmicDistance(bd) < 1500));
        cosmicTargets.push(...cosmicFeatures.solarStorms.filter(ss => getCosmicDistance(ss) < 2500));
        cosmicTargets.push(...cosmicFeatures.crystalFormations.filter(cf => getCosmicDistance(cf) < 1800));
        cosmicTargets.push(...cosmicFeatures.plasmaStorms.filter(ps => getCosmicDistance(ps) < 2200));
        cosmicTargets.push(...cosmicFeatures.roguePlanets.filter(rp => getCosmicDistance(rp) < 1600));

        // Dark matter nodes only show when very close (they're hard to detect)
        cosmicTargets.push(...cosmicFeatures.darkMatterNodes.filter(dm => getCosmicDistance(dm) < 400));

    }

    // ADD OUTER INTERSTELLAR SYSTEMS TO TARGETING
    const outerSystemTargets = [];
    if (typeof outerInterstellarSystems !== 'undefined') {
        outerInterstellarSystems.forEach(system => {
            if (!system || !system.userData) return;

            // Get system's world position
            const systemPos = new THREE.Vector3();
            system.getWorldPosition(systemPos);
            const systemDistance = camera.position.distanceTo(systemPos);

            // Add center object (always show if within 10,000 units)
            if (system.userData.centerObject && systemDistance < 10000) {
                const centerPos = new THREE.Vector3();
                system.userData.centerObject.getWorldPosition(centerPos);
                const centerDistance = camera.position.distanceTo(centerPos);

                if (centerDistance < 10000) {
                    outerSystemTargets.push(system.userData.centerObject);
                }
            }

            // Add planets and cosmic features from orbiters (show if within 8,000 units of system)
            if (system.userData.orbiters && systemDistance < 8000) {
                system.userData.orbiters.forEach(orbiter => {
                    // Skip asteroids and BORG drones from navigation
                    if (orbiter.userData.type === 'outer_asteroid' || orbiter.userData.type === 'borg_drone') return;

                    const orbiterPos = new THREE.Vector3();
                    orbiter.getWorldPosition(orbiterPos);
                    const distance = camera.position.distanceTo(orbiterPos);

                    if (distance < 8000) {
                        outerSystemTargets.push(orbiter);
                    }
                });
            }
        });
    }

    // Hostiles used to be spread into this text list too, but they now get
    // a world-anchored bracket/tag/HP-pip drawn directly on their ship by
    // updateTargetLayer() (see TARGET LAYER section below) — leaving them
    // here just duplicated combat info as a scrolling row the pilot had to
    // read instead of a marker on the actual ship. Compute the count for a
    // one-line banner and keep them OUT of the card list below.
    const nearbyHostiles = (typeof enemies !== 'undefined') ? enemies.filter(e => {
        if (!e.userData || e.userData.health <= 0) return false;
        const distance = camera.position.distanceTo(e.position);
        // ⭐ CRITICAL: Guardians have extended detection range
        const maxRange = e.userData.isBlackHoleGuardian ? 10000 : 3000;
        return distance < maxRange;
    }) : [];

    const allTargetableObjects = [
        ...(typeof planets !== 'undefined' ? planets.filter(p => p.userData && p.userData.type !== 'asteroid') : []),
        ...detectedWormholes,
        ...(typeof comets !== 'undefined' ? comets.filter(c => camera.position.distanceTo(c.position) < 4000) : []), // Doubled range
        ...cosmicTargets, // ADD COSMIC FEATURES HERE!
        ...outerSystemTargets // ADD OUTER SYSTEM OBJECTS HERE!
    ];

    if (nearbyHostiles.length > 0) {
        const banner = document.createElement('div');
        banner.className = 'text-xs text-red-400 font-mono mb-2 flex items-center justify-between';
        banner.style.cssText = 'letter-spacing:0.03em;';
        const bossCount = nearbyHostiles.filter(e => e.userData.isBoss).length;
        banner.innerHTML =
            `<span>&#9650; ${nearbyHostiles.length} HOSTILE${nearbyHostiles.length === 1 ? '' : 'S'} — tracked on tactical overlay${bossCount > 0 ? ' <span class="text-red-600 font-bold">(BOSS)</span>' : ''}</span>`;
        container.appendChild(banner);
    }

    // Helper to get distance for any object (handles nested outer system objects)
    const getObjectDistance = (obj) => {
        if (obj.userData.isOuterSystem && obj.parent) {
            const worldPos = new THREE.Vector3();
            obj.getWorldPosition(worldPos);
            return camera.position.distanceTo(worldPos);
        }
        return camera.position.distanceTo(obj.position);
    };

    const nearbyObjects = allTargetableObjects.filter(obj => {
        const distance = getObjectDistance(obj);
        return distance < 6000; // Doubled range
    }).sort((a, b) => {
        const distA = getObjectDistance(a);
        const distB = getObjectDistance(b);
        return distA - distB;
    });

    const targetObjects = nearbyObjects.slice(0, 15);

    targetObjects.forEach((obj, index) => {
        const distance = camera.position.distanceTo(obj.position);
        const energyCost = Math.ceil(distance / 50); // Adjusted for doubled scale
        
        let typeDisplay = obj.userData.type;
        let typeColor = 'text-gray-400';
        
        // Enhanced type display logic - INCLUDING COSMIC FEATURES
        if (obj.userData.type === 'blackhole') {
            typeDisplay = obj.userData.isGalacticCore ? 'Galactic Core' : 'Black Hole';
            typeColor = 'text-red-400';
        } else if (obj.userData.type === 'star') {
            typeColor = 'text-yellow-400';
        } else if (obj.userData.type === 'planet') {
            typeColor = 'text-blue-400';
        } else if (obj.userData.type === 'outer_planet') {
            typeDisplay = 'Outer Planet';
            typeColor = 'text-indigo-400';
        } else if (obj.userData.type === 'moon') {
            typeDisplay = 'Moon';
            typeColor = 'text-gray-300';
        } else if (obj.userData.type === 'enemy') {
            typeDisplay = `Hostile (${obj.userData.health}/${obj.userData.maxHealth} HP)`;
            typeColor = obj.userData.isBoss ? 'text-red-600' : 'text-red-500';
        } else if (obj.userData.type === 'comet') {
            typeDisplay = 'Comet';
            typeColor = 'text-cyan-400';
        } else if (obj.userData.type === 'wormhole') {
            typeDisplay = 'Spatial Whirlpool';
            typeColor = 'text-pink-400';
        } else if (obj.userData.type === 'asteroid') {
            typeDisplay = 'Asteroid';
            typeColor = 'text-yellow-600';
        }
        // NEW: Add cosmic feature type displays
        else if (obj.userData.type === 'pulsar') {
            typeDisplay = 'Pulsar';
            typeColor = 'text-cyan-300';
        } else if (obj.userData.type === 'supernova') {
            typeDisplay = 'Supernova Remnant';
            typeColor = 'text-orange-400';
        } else if (obj.userData.type === 'dyson_sphere') {
            typeDisplay = 'Dyson Sphere';
            typeColor = 'text-purple-400';
        } else if (obj.userData.type === 'ringworld') {
            typeDisplay = 'Ringworld';
            typeColor = 'text-purple-300';
        } else if (obj.userData.type === 'space_whale') {
            typeDisplay = 'Space Whale';
            typeColor = 'text-blue-300';
        } else if (obj.userData.type === 'brown_dwarf') {
            typeDisplay = 'Brown Dwarf';
            typeColor = 'text-amber-600';
        } else if (obj.userData.type === 'dark_matter') {
            typeDisplay = 'Dark Matter Node';
            typeColor = 'text-purple-600';
        } else if (obj.userData.type === 'solar_storm') {
            typeDisplay = 'Solar Storm';
            typeColor = 'text-red-300';
        } else if (obj.userData.type === 'crystal_formation') {
            typeDisplay = 'Crystal Formation';
            typeColor = 'text-emerald-400';
        } else if (obj.userData.type === 'plasma_storm') {
            typeDisplay = 'Plasma Storm';
            typeColor = 'text-fuchsia-400';
        } else if (obj.userData.type === 'rogue_planet') {
            typeDisplay = 'Rogue Planet';
            typeColor = 'text-slate-400';
        } else if (obj.userData.type === 'dust_cloud') {
            typeDisplay = 'Dust Cloud';
            typeColor = 'text-yellow-700';
        }
        
        // Enhanced faction display
        let factionIndicator = '';
        if (obj.userData.faction) {
            factionIndicator = ` (${obj.userData.faction})`;
        } else if (obj.userData.galaxyId !== undefined && obj.userData.galaxyId >= 0 && typeof galaxyTypes !== 'undefined') {
            const galaxyType = galaxyTypes[obj.userData.galaxyId];
            factionIndicator = ` (${galaxyType ? galaxyType.faction : 'G' + (obj.userData.galaxyId + 1)})`;
        } else if (obj.userData.isLocal) {
            factionIndicator = ' (Sol System)';
        }
        // NEW: Add cosmic feature specific indicators
        else if (obj.userData.type === 'dyson_sphere' || obj.userData.type === 'ringworld') {
            factionIndicator = ` (${obj.userData.ancientCivilization || obj.userData.species || 'Ancient'})`;
        } else if (obj.userData.type === 'space_whale') {
            factionIndicator = ' (Peaceful)';
        }
        // Outer system objects indicator
        else if (obj.userData.isOuterSystem || obj.userData.type === 'outer_planet' ||
                 obj.userData.type === 'supernova' || obj.userData.type === 'plasma_storm' ||
                 obj.userData.type === 'solar_storm') {
            factionIndicator = ' (Outer Systems)';
        }
        
        // Enhanced status indicators - INCLUDING COSMIC FEATURES (NO ICONS)
        let statusIndicator = '';
        if (obj.userData.type === 'wormhole' && obj.userData.isTemporary) {
            const timeLeft = ((obj.userData.lifeTime - obj.userData.age) / 1000).toFixed(0);
            statusIndicator = ` T-${timeLeft}s ◈`;
        } else if (obj.userData.type === 'enemy') {
            statusIndicator = obj.userData.isActive ? ' ◄' : ' ◄';
            if (obj.userData.isBoss) statusIndicator += ' 👑';
        } else if (obj.userData.type === 'comet') {
            statusIndicator = ' ◆';
        } else if (obj.userData.type === 'asteroid') {
            statusIndicator = ' ◇';
        }
        // NEW: Cosmic feature status indicators (no icons)
        else if (obj.userData.type === 'pulsar') {
            statusIndicator = '';
        } else if (obj.userData.type === 'supernova') {
            statusIndicator = '';
        } else if (obj.userData.type === 'dyson_sphere') {
            statusIndicator = obj.userData.operationalStatus === 'Active' ? ' (Active)' : ' (Dormant)';
        } else if (obj.userData.type === 'ringworld') {
            statusIndicator = '';
        } else if (obj.userData.type === 'space_whale') {
            statusIndicator = '';
        } else if (obj.userData.type === 'brown_dwarf') {
            statusIndicator = '';
        } else if (obj.userData.type === 'dark_matter') {
            statusIndicator = '';
        } else if (obj.userData.type === 'solar_storm') {
            statusIndicator = '';
        } else if (obj.userData.type === 'crystal_formation') {
            statusIndicator = '';
        } else if (obj.userData.type === 'plasma_storm') {
            statusIndicator = '';
        } else if (obj.userData.type === 'rogue_planet') {
            statusIndicator = '';
        } else if (obj.userData.type === 'dust_cloud') {
            statusIndicator = '';
        }
        
        // Add target lock indicator
        if (gameState.targetLock && gameState.targetLock.target === obj) {
            statusIndicator += ' 🎯';
        }
        
        const div = document.createElement('div');
        div.className = 'planet-card rounded-lg p-3 cursor-auto transition-all duration-300';
        if (gameState.currentTarget === obj) {
            div.classList.add('selected');
        }
        
        div.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-bold text-cyan-300 text-sm">${obj.userData.name}${factionIndicator}${statusIndicator}</h4>
                    <p class="text-xs ${typeColor}">${typeDisplay}</p>
                </div>
                <div class="text-right">
                    <div class="text-sm text-yellow-400">${distance.toFixed(0)} units</div>
                    <div class="text-xs text-gray-400">${energyCost} energy</div>
                </div>
            </div>
        `;

        // FIXED: Enhanced click handler with proper event handling
        div.addEventListener('click', (e) => {
            console.log('Planet card clicked:', obj.userData.name);
            
            // CRITICAL: Prevent event bubbling to global handler
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            // Ensure this element can receive focus
            div.style.cursor = 'auto';
            
            // Use the selectTarget function from game-controls.js if available
            if (typeof selectTarget === 'function') {
                console.log('Calling selectTarget with:', obj.userData.name);
                selectTarget(obj);
            } else {
                // Fallback implementation
                console.log('Using fallback selectTargetUI');
                selectTargetUI(obj);
            }
            
            console.log('After selection, currentTarget:', gameState.currentTarget?.userData?.name);
            
            // Force UI update
            if (typeof updateUI === 'function') {
                setTimeout(updateUI, 10);
            }
            if (typeof populateTargets === 'function') {
                setTimeout(populateTargets, 20); // Refresh the planet cards to show selection
            }
        });
        
        container.appendChild(div);
    });
    
    if (targetObjects.length === 0) {
        const div = document.createElement('div');
        div.className = 'text-center text-gray-400 text-sm p-3';
        div.textContent = 'No nearby objects detected...';
        container.appendChild(div);
    }

    // ── DESTINATIONS — far systems for gravity-whip aiming ──────────────
    // The nearby list caps at 6,000u, so galaxies and nebula clusters
    // (20k-45k+) could never be locked — which made the slingshot
    // unaimable at the places it exists to reach. These are listed
    // ALWAYS, sorted by distance: lock one, fly into any gravity well,
    // and the whip launches you toward it.
    try {
        const destinations = [];
        if (typeof planets !== 'undefined') {
            for (let i = 0; i < planets.length; i++) {
                const p = planets[i];
                if (p && p.userData && p.userData.type === 'blackhole' &&
                    p.userData.isGalacticCore && !p.userData.isCompanionCore &&
                    typeof p.userData.galaxyId === 'number' && p.userData.galaxyId !== 7) {
                    destinations.push(p);
                }
            }
        }
        // Nearest twin nebula cluster (stable synthetic target object)
        if (typeof findNearestTwinNebulaCenter === 'function' && typeof camera !== 'undefined') {
            const c = findNearestTwinNebulaCenter(camera.position);
            if (c) {
                if (!window._navTwinNebulaDest) {
                    window._navTwinNebulaDest = {
                        position: new THREE.Vector3(),
                        userData: { name: 'Twin Nebula Cluster', type: 'nebula_cluster' }
                    };
                }
                window._navTwinNebulaDest.position.copy(c);
                destinations.push(window._navTwinNebulaDest);
            }
        }
        if (destinations.length) {
            destinations.sort((a, b) =>
                camera.position.distanceTo(a.position) - camera.position.distanceTo(b.position));
            const header = document.createElement('div');
            header.className = 'text-xs text-purple-300 font-bold mt-2 mb-1 px-1';
            header.style.letterSpacing = '2px';
            header.textContent = '— DESTINATIONS · WHIP / WARP —';
            container.appendChild(header);
            destinations.slice(0, 9).forEach(obj => {
                const dist = camera.position.distanceTo(obj.position);
                const div = document.createElement('div');
                div.className = 'planet-card rounded-lg p-2 cursor-auto transition-all duration-300';
                if (gameState.currentTarget === obj) div.classList.add('selected');
                const label = obj.userData.type === 'nebula_cluster'
                    ? 'Nebula Cluster' : 'Galaxy Core';
                div.innerHTML =
                    '<div class="flex justify-between items-center">' +
                    '<div><h4 class="font-bold text-purple-300 text-xs">' + (obj.userData.name || 'Destination') + '</h4>' +
                    '<p class="text-xs text-gray-400">' + label + '</p></div>' +
                    '<div class="text-xs text-yellow-400">' + (dist / 1000).toFixed(1) + 'k u</div>' +
                    '</div>';
                div.addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                    if (typeof selectTarget === 'function') selectTarget(obj);
                    else selectTargetUI(obj);
                    if (typeof updateUI === 'function') updateUI();
                    setTimeout(populateTargets, 20);
                });
                container.appendChild(div);
            });
        }
    } catch (e) {}
}

// Local target selection for UI (fallback)
function selectTargetUI(obj) {
    document.querySelectorAll('.planet-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    if (typeof gameState !== 'undefined') {
        gameState.currentTarget = obj;
        updateUI();
        
        // Play sound if available
        if (typeof playSound === 'function') {
            playSound('navigation');
        }
    }
}

// =============================================================================
// ENEMY DETECTION SYSTEM - INTEGRATED WITH TUTORIAL
// =============================================================================

function detectEnemiesInRegion() {
    if (typeof camera === 'undefined' || typeof enemies === 'undefined') return;

    // game-core.js calls this EVERY frame ("high frequency ... for responsive
    // combat"), but everything it produces is a text banner and three inline
    // styles on one <div>. A hostile-count caption does not need 60Hz — it
    // needs to be right within a fraction of a second — while a full
    // distance-filter over every enemy in the region plus four unconditional
    // style writes 60 times a second is real, permanent frame cost. 10Hz keeps
    // the "hostiles detected" flash and its sound feeling instant (they fire on
    // the wasHidden edge, which is preserved) at a sixth of the price.
    if (!_uiThrottle('enemyDetect', 100)) return;

    const detectionRange = 3000; // Doubled range
    const nearbyEnemies = enemies.filter(enemy => 
        enemy.userData && enemy.userData.health > 0 && 
        camera.position.distanceTo(enemy.position) < detectionRange
    );
    
    const enemyDetector = document.getElementById('enemyDetector');
    const enemyCount = document.getElementById('enemyCount');
    
    if (!enemyDetector || !enemyCount) return;
    
    if (nearbyEnemies.length > 0) {
        const galaxyIds = [...new Set(nearbyEnemies.map(e => e.userData.galaxyId))];
        
        // Check tutorial status
        const tutorialActive = (typeof tutorialSystem !== 'undefined' && !tutorialSystem.completed);
        
        // Only play hostile contact sound if detector was previously hidden (prevents spam)
        const wasHidden = enemyDetector.classList.contains('hidden');
        
        enemyDetector.classList.remove('hidden');
        _setText(enemyCount, String(nearbyEnemies.length));
        
        // Update the detector text based on tutorial status
        const detectorTextNode = enemyDetector.firstChild;
        if (detectorTextNode && detectorTextNode.nodeType === Node.TEXT_NODE) {
            if (tutorialActive) {
                _setText(detectorTextNode, 'Hostiles Detected (TRAINING MODE): ');
                // Change color to indicate they're not active
                _setStyle(enemyDetector, 'color', 'rgba(255, 255, 0, 0.8)'); // Yellow for training
                _setStyle(enemyDetector, 'background', 'linear-gradient(45deg, rgba(255,255,0,0.2), rgba(255,200,0,0.2))');
                _setStyle(enemyDetector, 'border', '2px solid rgba(255,255,0,0.5)');
            } else {
                // Enemies are now active - show normal hostile indicators
                _setStyle(enemyDetector, 'color', 'rgba(255, 100, 100, 0.95)'); // Red for active
                _setStyle(enemyDetector, 'background', ''); // Reset to default
                _setStyle(enemyDetector, 'border', ''); // Reset to default
                
                // Play hostile contact sound with cooldown only when enemies become active
                if (wasHidden && typeof playSound === 'function') {
                    playSound('hostileContact');
                }
                
                // Enhanced faction display (only when enemies are active)
                if (galaxyIds.length === 1 && galaxyIds[0] >= 0 && typeof galaxyTypes !== 'undefined') {
                    const galaxyType = galaxyTypes[galaxyIds[0]];
                    _setText(detectorTextNode, `${galaxyType.faction} Hostiles: `);
                } else if (galaxyIds.includes(-1) || galaxyIds.includes(7)) {
                    _setText(detectorTextNode, 'Martian Pirates: ');
                } else {
                    _setText(detectorTextNode, 'Active Hostiles: ');
                }

                // First contact of this encounter -> prominent alert flash
                // (same style as the discovery / power-up flashes), naming the
                // faction (or the boss) that was detected.
                if (wasHidden && typeof flashEventText === 'function') {
                    let hostileName = 'UNKNOWN HOSTILES';
                    if (galaxyIds.length === 1 && galaxyIds[0] >= 0 && typeof galaxyTypes !== 'undefined' && galaxyTypes[galaxyIds[0]]) {
                        hostileName = String(galaxyTypes[galaxyIds[0]].faction || 'HOSTILES').toUpperCase();
                    } else if (galaxyIds.includes(-1) || galaxyIds.includes(7)) {
                        hostileName = 'MARTIAN PIRATES';
                    }
                    const bossContact = nearbyEnemies.find(e => e.userData && e.userData.isBoss);
                    const n = nearbyEnemies.length;
                    flashEventText(
                        bossContact ? 'BOSS DETECTED' : 'HOSTILES DETECTED',
                        bossContact ? '#ff3df0' : '#ff5555',
                        (bossContact && bossContact.userData.name ? String(bossContact.userData.name).toUpperCase() : hostileName)
                            + ' · ' + n + (n === 1 ? ' CONTACT' : ' CONTACTS')
                    );
                }
            }
        }
        
        // Check for boss presence (only if enemies are active)
        if (!tutorialActive) {
            const bossPresent = nearbyEnemies.some(e => e.userData.isBoss);
            if (bossPresent) {
                _setStyle(enemyDetector, 'background', 'linear-gradient(45deg, rgba(255,0,0,0.3), rgba(255,100,0,0.3))');
                _setStyle(enemyDetector, 'border', '2px solid rgba(255,50,50,0.8)');
            }
        }
    } else {
        enemyDetector.classList.add('hidden');
    }
}

// =============================================================================
// CROSSHAIR AND TARGETING SYSTEM - ENHANCED INTEGRATION
// =============================================================================

// Reused across calls — updateCrosshairTargeting runs at ~20Hz and used
// to allocate a fresh Raycaster + Vector2 every time.
const _chRaycaster = (typeof THREE !== 'undefined') ? new THREE.Raycaster() : null;
const _chMouseNDC = (typeof THREE !== 'undefined') ? new THREE.Vector2() : null;

function updateCrosshairTargeting() {
    const crosshair = document.getElementById('crosshair');
    if (!crosshair || typeof gameState === 'undefined' || typeof camera === 'undefined') return;

    // Check if enemy is in crosshairs (doubled range)
    let enemyInSights = false;
    const detectionRange = 400; // Doubled range
    
    // If target lock is active, use target lock position
    if (gameState.targetLock && gameState.targetLock.active) {
        crosshair.classList.add('target-locked');
        
        // Check if locked target is an enemy or asteroid
        if (gameState.targetLock.target && 
            (gameState.targetLock.target.userData.type === 'enemy' || 
             gameState.targetLock.target.userData.type === 'asteroid')) {
            enemyInSights = true;
        }
        
        // Update crosshair position when target lock is active
        crosshair.style.left = gameState.crosshairX + 'px';
        crosshair.style.top = gameState.crosshairY + 'px';
        
    } else {
        crosshair.classList.remove('target-locked');
        
        // Manual targeting mode - crosshair follows mouse directly
        if (gameState.mouseX !== undefined && gameState.mouseY !== undefined) {
            gameState.crosshairX = gameState.mouseX;
            gameState.crosshairY = gameState.mouseY;
        }
        
        // Check for enemies under crosshair. Reuse the raycaster/vector,
        // cap the ray distance, and break out the moment a hit is found —
        // the old version raycast EVERY enemy (300+) + asteroid every
        // call with fresh allocations and no early exit.
        if (_chRaycaster && _chMouseNDC) {
            _chMouseNDC.set(
                (gameState.crosshairX / window.innerWidth) * 2 - 1,
                -(gameState.crosshairY / window.innerHeight) * 2 + 1
            );
            _chRaycaster.setFromCamera(_chMouseNDC, camera);
            _chRaycaster.far = detectionRange;

            const camP = camera.position;
            const rangeSq = detectionRange * detectionRange;

            if (typeof enemies !== 'undefined') {
                for (let i = 0; i < enemies.length; i++) {
                    const e = enemies[i];
                    if (!e || !e.userData || e.userData.health <= 0) continue;
                    const dx = camP.x - e.position.x, dy = camP.y - e.position.y, dz = camP.z - e.position.z;
                    if (dx * dx + dy * dy + dz * dz > rangeSq) continue;   // cheap prefilter
                    if (_chRaycaster.intersectObject(e, true).length > 0) { enemyInSights = true; break; }
                }
            }
            if (!enemyInSights && typeof planets !== 'undefined') {
                for (let i = 0; i < planets.length; i++) {
                    const p = planets[i];
                    if (!p || !p.userData || p.userData.type !== 'asteroid' || p.userData.health <= 0) continue;
                    const dx = camP.x - p.position.x, dy = camP.y - p.position.y, dz = camP.z - p.position.z;
                    if (dx * dx + dy * dy + dz * dz > rangeSq) continue;
                    if (_chRaycaster.intersectObject(p, true).length > 0) { enemyInSights = true; break; }
                }
            }
        }

        // Update crosshair position (mousemove also writes this at native
        // rate; this keeps it correct when crosshairX changed without a move)
        crosshair.style.left = gameState.crosshairX + 'px';
        crosshair.style.top = gameState.crosshairY + 'px';
    }
    
    // Update crosshair color based on enemy detection
    crosshair.classList.toggle('enemy-target', enemyInSights);
    
    // UI detection. The crosshair is pointer-events:none, so
    // elementFromPoint already skips it — no need for the old
    // hide-then-restore visibility toggle (which forced a reflow
    // every call).
    const elementUnder = document.elementFromPoint(gameState.mouseX, gameState.mouseY);
    const isOverUI = elementUnder && elementUnder.closest('.ui-panel');

    // Only write these styles when the over-UI state actually flips —
    // avoids a style recalc on every 20Hz tick.
    const _overUI = !!isOverUI;
    if (_overUI !== updateCrosshairTargeting._lastOverUI) {
        updateCrosshairTargeting._lastOverUI = _overUI;
        if (_overUI) {
            crosshair.style.opacity = '0.1';
            crosshair.style.zIndex = '5';  // LOWER than UI panels (which are z-10 to z-20)
            document.body.style.cursor = 'auto';
        } else {
            crosshair.style.opacity = '1';
            crosshair.style.zIndex = '45';
            document.body.style.cursor = 'none';
        }
    }

    // WORLD-ANCHORED TARGET LAYER — runs off this same per-frame camera
    // state (see comment at the game-core.js call site for why crosshair
    // targeting was moved off a throttle: interpolated + cinematic camera
    // transforms are already applied here). Piggybacking here keeps the
    // bracket/tag/lead-pip projection perfectly in sync with what's
    // actually rendered, with no separate frame hook needed.
    if (typeof updateTargetLayer === 'function') {
        try { updateTargetLayer(); } catch (e) {}
    }
}

// =============================================================================
// WORLD-ANCHORED TARGET LAYER
// =============================================================================
// The crosshair is a single static reticle — it says nothing about WHAT is
// in frame. This layer projects every nearby hostile (plus the active nav
// target) through the camera each frame and draws directly on the ship:
//   • a corner-tick bracket that scales with apparent radius
//   • a two-line tag (name / distance + HP)
//   • colour-coded state: hostile red, neutral amber, locked cyan (with a
//     brief "closing" animation the instant a lock is acquired)
//   • a predictive lead pip when weapons are armed and the target is moving
//   • a clamped edge chevron, rotated to point at anything off-screen
// A single 2D canvas (not N DOM nodes) keeps this cheap even with a dozen
// contacts tracked at once — see HARD CONSTRAINTS on additive-blend/DOM
// overdraw.

const TARGET_LAYER_MAX_TRACKED = 10;      // cap drawn brackets — clarity over completeness
const TARGET_LAYER_HOSTILE_RANGE = 4500;
const TARGET_LAYER_GUARDIAN_RANGE = 11000; // guardians/bosses read from further out
const TARGET_LAYER_EDGE_MARGIN = 30;       // px inset for clamped edge chevrons
const TARGET_LAYER_LOCK_ANIM_MS = 380;
const TARGET_LAYER_COLORS = {
    hostile: { line: '255,64,80',  glow: 'rgba(255,64,80,0.85)' },
    neutral: { line: '255,178,60', glow: 'rgba(255,178,60,0.85)' },
    locked:  { line: '0,232,255',  glow: 'rgba(0,232,255,0.9)' }
};

let _targetLayerCanvas = null;
let _targetLayerCtx = null;
let _targetLayerResizeBound = false;
let _targetLayerLastLockedObj = null;
const _targetLayerWorldPos = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _targetLayerProjVec = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _targetLayerLeadVec = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _targetLayerVelocityCache = new Map(); // world object -> {px,py,pz,t,vx,vy,vz}
const _targetLayerLockCache = new Map();     // world object -> lock-acquired timestamp

function _ensureTargetLayer() {
    let canvas = _targetLayerCanvas;
    if (!canvas || !canvas.isConnected) {
        canvas = document.getElementById('targetLayerCanvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'targetLayerCanvas';
            canvas.style.cssText = [
                'position:fixed', 'left:0', 'top:0', 'width:100%', 'height:100%',
                'pointer-events:none',
                'z-index:40' // above the 3D canvas, below UI panels (z:10/20) only where they overlap
            ].join(';');
            document.body.appendChild(canvas);
        }
        _targetLayerCanvas = canvas;
        _targetLayerCtx = canvas.getContext('2d');
    }
    if (!_targetLayerResizeBound) {
        _targetLayerResizeBound = true;
        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = window.innerWidth, h = window.innerHeight;
            _targetLayerCanvas.width = Math.round(w * dpr);
            _targetLayerCanvas.height = Math.round(h * dpr);
            _targetLayerCanvas.style.width = w + 'px';
            _targetLayerCanvas.style.height = h + 'px';
            _targetLayerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        window.addEventListener('resize', resize);
        resize();
    }
}

function _tlTruncate(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// Screen-project a world position, correctly flipping into the "points the
// right way" direction when the target sits behind the camera (standard
// off-screen-indicator trick: project, and if z>1 negate x/y BEFORE
// converting to pixels so the vector from screen-centre still points
// toward the target rather than its mirror image).
function _tlProjectToScreen(worldPos, camera, w, h) {
    _targetLayerProjVec.copy(worldPos).project(camera);
    const behind = _targetLayerProjVec.z > 1;
    const nx = behind ? -_targetLayerProjVec.x : _targetLayerProjVec.x;
    const ny = behind ? -_targetLayerProjVec.y : _targetLayerProjVec.y;
    const x = (nx * 0.5 + 0.5) * w;
    const y = (1 - (ny * 0.5 + 0.5)) * h;
    return { x, y, behind, onScreen: !behind && x >= 0 && x <= w && y >= 0 && y <= h };
}

// -----------------------------------------------------------------------------
// HULL SIZE — measured from the actual geometry, not guessed from a table
//
// This was the root cause of "bracket labels cover the ships they annotate".
// The table below claims a rank-and-file enemy is 7 world units across. Its
// real hull is ~120. Measured live, in flight, on a contact at 241 units:
//
//     lookup radius 7   ->    17 px on screen
//     measured hull     ->   ~271 px on screen   (projected hull AABB)
//
// Everything downstream inherited that 13x error. The bracket drew a 17px
// reticle lost somewhere in the middle of a ship filling a quarter of the
// viewport, and the tag — anchored "just below the bracket" — was planted
// squarely on the fuselage. No amount of tag-placement tuning can fix a label
// that is being told the ship is a seventeenth of its real size, so the size
// itself is now measured.
//
// The measurement is a union of the object's hull-mesh bounding boxes in its
// OWN local space, cached per object in a WeakMap (geometry never changes, so
// this runs once per contact ever) and reduced to the mean of the three
// half-extents. Mean rather than the box diagonal because the diagonal of a
// wide flat saucer is dominated by a dimension the pilot is not looking at,
// and mean rather than a live projected AABB because mean is rotation-
// invariant: it costs one multiply per frame instead of eight projections,
// and it does not make the tag jitter outward every time the ship banks.
//
// Two child classes are excluded deliberately: `isHitbox` proxies (a generous
// collision sphere, 2-3x the visible hull — it would push labels into the next
// postcode) and `_isThrusterCone` flames, which are effects, not hull.
// -----------------------------------------------------------------------------
const _tlHullRadiusCache = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
const _tlHullBox = (typeof THREE !== 'undefined') ? new THREE.Box3() : null;
const _tlHullChildBox = (typeof THREE !== 'undefined') ? new THREE.Box3() : null;
const _tlHullSize = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
const _tlHullInv = (typeof THREE !== 'undefined') ? new THREE.Matrix4() : null;

function _tlMeasureHullRadius(obj) {
    if (!_tlHullBox || !obj || typeof obj.traverse !== 'function') return 0;
    try {
        obj.updateWorldMatrix(true, true);
        _tlHullInv.copy(obj.matrixWorld).invert();
        _tlHullBox.makeEmpty();
        obj.traverse(function (c) {
            if (!c.isMesh || !c.geometry) return;
            const cud = c.userData;
            if (cud && (cud.isHitbox || cud._isThrusterCone)) return;
            if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
            if (!c.geometry.boundingBox) return;
            _tlHullChildBox.copy(c.geometry.boundingBox);
            _tlHullChildBox.applyMatrix4(c.matrixWorld);   // -> world
            _tlHullChildBox.applyMatrix4(_tlHullInv);      // -> object-local
            _tlHullBox.union(_tlHullChildBox);
        });
        if (_tlHullBox.isEmpty()) return 0;
        _tlHullBox.getSize(_tlHullSize);
        const s = Math.max(Math.abs(obj.scale.x), Math.abs(obj.scale.y), Math.abs(obj.scale.z)) || 1;
        // Mean of the three half-extents — a rotation-invariant "typical
        // silhouette half-width" rather than a worst-case diagonal.
        return ((_tlHullSize.x + _tlHullSize.y + _tlHullSize.z) / 6) * s;
    } catch (e) {
        return 0;
    }
}

function _tlWorldRadius(obj) {
    const ud = obj && obj.userData;
    if (!ud) return 10;
    if (_tlHullRadiusCache && obj) {
        let r = _tlHullRadiusCache.get(obj);
        if (r === undefined) {
            r = _tlMeasureHullRadius(obj);
            _tlHullRadiusCache.set(obj, r);
        }
        if (r > 0) return r;
    }
    // Fallback for anything with no measurable mesh (procedural sprites,
    // billboards, objects not yet built) — the original hand-tuned table.
    if (ud.isBoss || ud.isBlackHoleGuardian) return 26;
    if (ud.isBossSupport || ud.isEliteGuardian) return 16;
    if (ud.type === 'enemy') return 7;
    return 12;
}

function _tlGatherHostiles(camPos) {
    if (typeof enemies === 'undefined') return [];
    const candidates = [];
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || !e.userData || !(e.userData.health > 0)) continue;
        const range = e.userData.isBlackHoleGuardian ? TARGET_LAYER_GUARDIAN_RANGE : TARGET_LAYER_HOSTILE_RANGE;
        const dx = e.position.x - camPos.x, dy = e.position.y - camPos.y, dz = e.position.z - camPos.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq > range * range) continue;
        candidates.push({ obj: e, distSq });
    }
    candidates.sort((a, b) => a.distSq - b.distSq);
    if (candidates.length > TARGET_LAYER_MAX_TRACKED) candidates.length = TARGET_LAYER_MAX_TRACKED;
    return candidates.map(c => c.obj);
}

// Finite-difference world velocity, lightly smoothed — enemies don't expose
// a velocity vector, so this is reconstructed frame-to-frame purely for the
// lead-pip affordance (not used for anything gameplay-affecting).
function _tlGetVelocity(obj, wp, now) {
    let c = _targetLayerVelocityCache.get(obj);
    if (!c) {
        c = { px: wp.x, py: wp.y, pz: wp.z, t: now, vx: 0, vy: 0, vz: 0 };
        _targetLayerVelocityCache.set(obj, c);
        return c;
    }
    const dt = (now - c.t) / 1000;
    if (dt > 0.02) {
        const nvx = (wp.x - c.px) / dt, nvy = (wp.y - c.py) / dt, nvz = (wp.z - c.pz) / dt;
        c.vx += (nvx - c.vx) * 0.35;
        c.vy += (nvy - c.vy) * 0.35;
        c.vz += (nvz - c.vz) * 0.35;
        c.px = wp.x; c.py = wp.y; c.pz = wp.z; c.t = now;
    }
    return c;
}

function _tlDrawBracket(ctx, x, y, r, scheme, alpha) {
    const tick = Math.max(6, r * 0.34);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = `rgba(${scheme.line},0.95)`;
    ctx.shadowColor = scheme.glow;
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    // top-left, top-right, bottom-left, bottom-right corner ticks
    ctx.moveTo(x - r, y - r + tick); ctx.lineTo(x - r, y - r); ctx.lineTo(x - r + tick, y - r);
    ctx.moveTo(x + r - tick, y - r); ctx.lineTo(x + r, y - r); ctx.lineTo(x + r, y - r + tick);
    ctx.moveTo(x - r, y + r - tick); ctx.lineTo(x - r, y + r); ctx.lineTo(x - r + tick, y + r);
    ctx.moveTo(x + r - tick, y + r); ctx.lineTo(x + r, y + r); ctx.lineTo(x + r, y + r - tick);
    ctx.stroke();
    ctx.restore();
}

// Angular beveled-corner plate path (chamfered, not rounded — matches the
// HUD's cut-corner chrome elsewhere) used as the tag's backing plate.
function _tlChamferRectPath(ctx, x, y, w, h, c) {
    ctx.beginPath();
    ctx.moveTo(x + c, y);
    ctx.lineTo(x + w - c, y);
    ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h - c);
    ctx.lineTo(x + w - c, y + h);
    ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c);
    ctx.lineTo(x, y + c);
    ctx.closePath();
}

// =============================================================================
// CONTACT TAG LAYOUT — the plate hangs OFF the hull, never across it
// -----------------------------------------------------------------------------
// The old layout centred the plate on the bracket's X and hung it one bracket-
// radius below the bracket's Y. That reads fine at range, and badly up close,
// for one reason: the drawn bracket radius is clamped to 70px (TARGET_LAYER
// apparentRadius), while the SHIP behind it keeps growing. Inside ~600 units a
// gunship's hull is several hundred pixels across, the bracket has shrunk to a
// small reticle sitting in the middle of it, and "one bracket-radius below the
// bracket centre" lands the name plate squarely on the fuselage of the ship it
// is annotating — the label covers its own subject exactly when the pilot most
// needs to see the subject.
//
// This rewrite fixes it three ways:
//   1. ANCHOR ON THE HULL, NOT THE BRACKET. The caller passes the true
//      (unclamped) apparent hull radius; the plate is placed clear of that box.
//   2. OFFSET DOWN AND RIGHT. The plate is left-aligned starting to the right
//      of the contact and below it, joined back by a short elbow leader, so the
//      silhouette stays clean and the eye still reads plate-belongs-to-bracket.
//      Centred labels have nowhere to go but on top of the thing they label.
//   3. SHRINK AT CLOSE RANGE. A contact that fills the screen does not need an
//      11px name plate to be findable, and a large plate at that distance is
//      pure occlusion — the whole tag scales down to 0.7 as the hull grows.
//
// Draw and measure share `_tlTagMetrics` so the declutter pass can never test
// a box that differs from what actually gets painted.
// =============================================================================

// How much the whole tag shrinks as its contact grows on screen. Full size out
// at range; eased down to 0.7 once the hull is filling a large part of the view.
function _tlTagScale(hullR) {
    return Math.max(0.7, Math.min(1, 1 - (hullR - 55) / 300));
}

function _tlTagMetrics(ctx, obj, anchorX, anchorY, distance, isHostile, scale) {
    const ud = obj.userData || {};
    const name = _tlTruncate(ud.name || (isHostile ? 'Hostile Contact' : 'Unknown Contact'), 26);
    let line2;
    if (isHostile) {
        const hp = Math.max(0, Math.round(ud.health || 0));
        const maxHp = Math.max(1, Math.round(ud.maxHealth || hp || 1));
        line2 = `${Math.round(distance)}u · HP ${hp}/${maxHp}`;
    } else {
        line2 = `${Math.round(distance)}u`;
    }
    const nameFont = `bold ${(11 * scale).toFixed(1)}px "Courier New", monospace`;
    const infoFont = `${(10 * scale).toFixed(1)}px "Courier New", monospace`;
    ctx.font = nameFont;
    const nameW = ctx.measureText(name).width;
    ctx.font = infoFont;
    const line2W = ctx.measureText(line2).width;

    const padX = 7 * scale;
    const plateW = Math.max(nameW, line2W) + padX * 2;
    const plateH = (isHostile ? 34 : 30) * scale; // hostiles carry an HP bar row
    // Left-aligned plate starting at the anchor: the anchor IS the plate's
    // top-left, which is what puts it down-and-right of the contact.
    return {
        name, line2, nameFont, infoFont, scale, padX,
        plateX: anchorX, plateY: anchorY, plateW, plateH,
        box: { left: anchorX - 2, right: anchorX + plateW + 2, top: anchorY - 2, bottom: anchorY + plateH + 2 }
    };
}

function _tlDrawTag(ctx, m, scheme, isHostile, obj, leaderFromX, leaderFromY) {
    ctx.save();

    // Elbow leader from the bracket out to the plate's top-left corner —
    // this is what keeps an offset plate legibly attached to its contact
    // instead of reading as a free-floating label.
    if (leaderFromX !== undefined) {
        ctx.strokeStyle = `rgba(${scheme.line},0.55)`;
        ctx.lineWidth = 1;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(leaderFromX, leaderFromY);
        ctx.lineTo(m.plateX, m.plateY + Math.min(10 * m.scale, m.plateH * 0.35));
        ctx.stroke();
    }

    // Backing plate behind the two text lines — canvas text with only a
    // drop shadow disappears over a bright explosion or a saturated nebula
    // cloud; a translucent plate keeps the readout legible over anything
    // the scene throws behind it, diegetic Star-Citizen-contact-tag style.
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(6,10,20,0.72)';
    _tlChamferRectPath(ctx, m.plateX, m.plateY, m.plateW, m.plateH, 4 * m.scale);
    ctx.fill();
    ctx.strokeStyle = `rgba(${scheme.line},0.8)`;
    ctx.lineWidth = 1;
    // Accent rule down the plate's leading edge — reads as the cut-corner
    // chrome elsewhere in the HUD and marks which side the contact is on.
    ctx.beginPath();
    ctx.moveTo(m.plateX + 0.5, m.plateY + 4 * m.scale);
    ctx.lineTo(m.plateX + 0.5, m.plateY + m.plateH - 4 * m.scale);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 3;
    const textX = m.plateX + m.padX;
    ctx.font = m.nameFont;
    ctx.fillStyle = `rgba(${scheme.line},1)`;
    ctx.fillText(m.name, textX, m.plateY + 12 * m.scale);
    ctx.font = m.infoFont;
    ctx.fillStyle = 'rgba(220,235,255,0.9)';
    ctx.fillText(m.line2, textX, m.plateY + 24 * m.scale);

    if (isHostile) {
        const ud = obj.userData || {};
        const hp = Math.max(0, ud.health || 0);
        const maxHp = Math.max(1, ud.maxHealth || hp || 1);
        const pct = Math.max(0, Math.min(1, hp / maxHp));
        // HP bar rides inside the plate's own bottom edge, so it can never
        // extend the tag's footprint past the box the declutter pass tested.
        const barH = Math.max(2, 3 * m.scale);
        const barX = m.plateX + m.padX;
        const barW = m.plateW - m.padX * 2;
        const barY = m.plateY + m.plateH - barH - 3 * m.scale;
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = pct > 0.5 ? 'rgba(80,255,140,0.9)' : (pct > 0.2 ? 'rgba(255,200,60,0.9)' : 'rgba(255,60,70,0.95)');
        ctx.fillRect(barX, barY, barW * pct, barH);
    }
    ctx.restore();
}

// Screen-space AABBs for the always-on HUD panel chrome.
//
// PERF: this used to run five getBoundingClientRect() calls per frame, and it
// is called from updateTargetLayer(), which runs EVERY frame — measured at
// 1875 rect reads over 375 frames, i.e. five forced synchronous layouts of the
// entire document, every frame, forever. getBoundingClientRect() is not a
// cheap accessor: it makes the browser flush all pending style and layout work
// before it can answer, which is exactly the read-after-write thrash this pass
// exists to eliminate.
//
// The panels are fixed HUD furniture. Their boxes only move on a viewport
// resize, on the flight-controls collapse, or when the spectacle yield slides
// them off screen — so the result is cached and recomputed on those events
// plus a slow 500ms safety refresh (covers font loading, a target list growing
// a row, anything else that quietly reflows a panel). Steady-state cost:
// zero forced layouts per frame instead of five.
let _tlPanelBoxes = null;
let _tlPanelBoxesT = 0;
const TL_PANEL_BOX_TTL_MS = 500;

function _tlInvalidatePanelBoxes() { _tlPanelBoxes = null; }
if (typeof window !== 'undefined') {
    window._tlInvalidatePanelBoxes = _tlInvalidatePanelBoxes;
    window.addEventListener('resize', _tlInvalidatePanelBoxes);
}

function _tlGetPanelBoxes() {
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    if (_tlPanelBoxes && (now - _tlPanelBoxesT) < TL_PANEL_BOX_TTL_MS) {
        // Copy: the caller pushes its own sentinel/tag boxes onto the array.
        return _tlPanelBoxes.slice();
    }
    const panels = _hudSpectacleGetPanels();
    const boxes = [];
    for (let i = 0; i < panels.length; i++) {
        const rect = panels[i].getBoundingClientRect();
        // Hidden panels (mobile's `display:none`) report a zero-size rect and
        // are skipped rather than seeded as a zero-area "always overlapping"
        // box. Panels translated off-screen by the spectacle yield report
        // real-but-offscreen rects, which is correct — tags may use that space.
        if (rect.width <= 0 || rect.height <= 0) continue;
        boxes.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
    }
    _tlPanelBoxes = boxes;
    _tlPanelBoxesT = now;
    return boxes.slice();
}

// Nudge a tag box fully inside the canvas (minus pad) on one axis, so a
// bracket sitting right at the viewport edge doesn't paint a tag that runs
// off-canvas top/right (or bottom/left). Returns the offset to apply, not a
// new box — callers shift both the box and the draw anchor by it.
function _tlClampAxis(minVal, maxVal, boundMin, boundMax) {
    if (minVal < boundMin) return boundMin - minVal;
    if (maxVal > boundMax) return boundMax - maxVal;
    return 0;
}

function _tlBoxesOverlap(a, b, pad) {
    return a.left - pad < b.right && a.right + pad > b.left &&
           a.top - pad < b.bottom && a.bottom + pad > b.top;
}

// Deprioritized contacts still get this instead of silently vanishing —
// a small pip at the tag's anchor point says "tracked, tag suppressed for
// room" without adding another readable line to a screen already packed
// with them.
function _tlDrawDeclutterDot(ctx, x, y, r, scheme) {
    ctx.save();
    ctx.fillStyle = `rgba(${scheme.line},0.85)`;
    ctx.shadowColor = scheme.glow;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(x, y + r + 12, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function _tlDrawLeadPip(ctx, obj, wp, distance, proj, camera, w, h, scheme) {
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const vel = _tlGetVelocity(obj, wp, now);
    const speedSq = vel.vx * vel.vx + vel.vy * vel.vy + vel.vz * vel.vz;
    if (speedSq < 4) return; // effectively stationary — a pip on top of the bracket is just noise

    // Reference "how fast does our fire reach it" off the missile system
    // (the one weapon with real travel time) so the pip reads as "aim
    // here, not where it is" rather than an arbitrary offset.
    const boltSpeed = ((typeof gameState !== 'undefined' && gameState.missiles && gameState.missiles.speed) || 7.5) * 60;
    const leadTime = Math.min(2.5, distance / Math.max(1, boltSpeed));
    _targetLayerLeadVec.set(wp.x + vel.vx * leadTime, wp.y + vel.vy * leadTime, wp.z + vel.vz * leadTime);
    const leadProj = _tlProjectToScreen(_targetLayerLeadVec, camera, w, h);
    if (leadProj.behind) return;
    const dpx = leadProj.x - proj.x, dpy = leadProj.y - proj.y;
    if (dpx * dpx + dpy * dpy < 25) return; // coincident with the bracket — nothing to show

    ctx.save();
    ctx.strokeStyle = `rgba(${scheme.line},0.9)`;
    ctx.shadowColor = scheme.glow;
    ctx.shadowBlur = 6;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(leadProj.x, leadProj.y, 5, 0, Math.PI * 2);
    ctx.moveTo(leadProj.x - 8, leadProj.y); ctx.lineTo(leadProj.x - 3, leadProj.y);
    ctx.moveTo(leadProj.x + 3, leadProj.y); ctx.lineTo(leadProj.x + 8, leadProj.y);
    ctx.moveTo(leadProj.x, leadProj.y - 8); ctx.lineTo(leadProj.x, leadProj.y - 3);
    ctx.moveTo(leadProj.x, leadProj.y + 3); ctx.lineTo(leadProj.x, leadProj.y + 8);
    ctx.stroke();
    ctx.restore();
}

function _tlDrawEdgeChevron(ctx, proj, w, h, scheme, distance) {
    const cx = w / 2, cy = h / 2;
    let ddx = proj.x - cx, ddy = proj.y - cy;
    if (ddx === 0 && ddy === 0) ddx = 0.0001;
    const maxX = w / 2 - TARGET_LAYER_EDGE_MARGIN;
    const maxY = h / 2 - TARGET_LAYER_EDGE_MARGIN;
    const scale = Math.min(Math.abs(maxX / ddx), Math.abs(maxY / ddy));
    const ex = cx + ddx * scale, ey = cy + ddy * scale;
    const angle = Math.atan2(ddy, ddx);

    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = `rgba(${scheme.line},0.9)`;
    ctx.shadowColor = scheme.glow;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(7, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.font = '10px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(${scheme.line},0.95)`;
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 3;
    ctx.fillText(`${Math.round(distance)}u`, cx + ddx * scale * 0.88, cy + ddy * scale * 0.88 + 16);
    ctx.restore();
}

function updateTargetLayer() {
    if (typeof camera === 'undefined' || typeof gameState === 'undefined' || typeof THREE === 'undefined') return;
    _ensureTargetLayer();
    const ctx = _targetLayerCtx;
    if (!ctx) return;
    const w = window.innerWidth, h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    // No combat layer while paused/over/pre-launch — nothing to target and
    // it would draw over menu/game-over overlays.
    if (gameState.paused || gameState.gameOver || !gameState.gameStarted) return;

    const camPos = camera.position;
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const lockActive = !!(gameState.targetLock && gameState.targetLock.active);
    const lockedObj = lockActive ? gameState.targetLock.target : null;
    const weaponsArmed = !!(gameState.weapons && gameState.weapons.armed);

    if (lockedObj !== _targetLayerLastLockedObj) {
        if (lockedObj) _targetLayerLockCache.set(lockedObj, now);
        _targetLayerLastLockedObj = lockedObj;
    }

    // Tag plates dim slightly during a full slingshot/emergency-warp
    // spectacle — reused from the same binary check driving the HUD panel
    // geometric yield, kept well clear of the "no sub-0.6" legibility floor.
    const _tlSpectacleTagAlpha = _hudSpectacleActive() ? 0.7 : 1;

    const hostiles = _tlGatherHostiles(camPos);
    const tracked = hostiles.slice();
    // Union in the active nav target (if any) so the pilot's selected
    // destination — hostile or not — also gets a marker/chevron.
    if (gameState.currentTarget && tracked.indexOf(gameState.currentTarget) === -1) {
        tracked.push(gameState.currentTarget);
    }
    // A combat lock always gets its bracket, even on a contact the normal
    // hostile-range gather missed (e.g. a boss/guardian locked from just
    // outside TARGET_LAYER_HOSTILE_RANGE) — an active lock with no visible
    // cyan marker anywhere is the exact "unmarked geometry" gap this layer
    // exists to close.
    if (lockedObj && tracked.indexOf(lockedObj) === -1) {
        tracked.push(lockedObj);
    }
    if (tracked.length === 0) return;

    const vFovTan = Math.max(0.0001, Math.tan(camera.fov * Math.PI / 360));

    // Resolve world position + distance once per target, then draw in
    // priority order (locked first, then nearest) so that when a tight
    // formation puts several ships within a tag's-width of each other on
    // screen, the ones that matter most keep their full name/HP tag and
    // the rest fall back to bracket-only instead of stacking illegible text.
    const records = [];
    for (let i = 0; i < tracked.length; i++) {
        const obj = tracked[i];
        if (!obj || !obj.position) continue;

        let wp = obj.position;
        if (obj.userData && obj.userData.isOuterSystem && obj.parent && typeof obj.getWorldPosition === 'function') {
            obj.getWorldPosition(_targetLayerWorldPos);
            wp = _targetLayerWorldPos.clone();
        }

        const dx = wp.x - camPos.x, dy = wp.y - camPos.y, dz = wp.z - camPos.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (distance < 1) continue;

        const isHostile = !!(obj.userData && obj.userData.type === 'enemy');
        const isLocked = lockActive && obj === lockedObj;
        const isCurrentTarget = obj === gameState.currentTarget;
        records.push({ obj, wp, distance, isHostile, isLocked, isCurrentTarget });
    }
    // Locked-on contact first, then the pilot's selected nav target, then
    // nearest-out — this is the priority order the declutter pass below
    // walks in, so when tags collide it's always the least-relevant one
    // that loses its text.
    records.sort((a, b) => {
        if (a.isLocked !== b.isLocked) return a.isLocked ? -1 : 1;
        if (a.isCurrentTarget !== b.isCurrentTarget) return a.isCurrentTarget ? -1 : 1;
        return a.distance - b.distance;
    });

    const TAG_DECLUTTER_PAD = 6;     // px gap required between neighboring tag boxes
    const TAG_VIEWPORT_PAD = 8;      // px kept clear between a tag plate and the canvas edge
    const BRACKET_DECLUTTER_PAD = 2; // px gap required between neighboring bracket boxes

    // Seed the tag-declutter pass with everything a tag must not be painted
    // on top of, before a single contact is drawn: the five always-on HUD
    // panels (so the nearest-contact tag doesn't render underneath the
    // top-left/bottom-right chrome, illegible) and a pair of off-viewport
    // sentinel strips along the left/right margins (a catch-all for a tag
    // whose plate is wider than the per-axis clamp below can fully absorb —
    // it falls back to a declutter pip instead of a plate hanging half off
    // the canvas). Brackets get their own, separate seed/pass: bracket
    // clutter is a bracket-vs-bracket problem, not a bracket-vs-panel one.
    const placedTagBoxes = _tlGetPanelBoxes();
    placedTagBoxes.push({ left: -100000, right: TAG_VIEWPORT_PAD, top: -100000, bottom: h + 100000 });
    placedTagBoxes.push({ left: w - TAG_VIEWPORT_PAD, right: 100000, top: -100000, bottom: h + 100000 });
    const placedBracketBoxes = []; // real screen-space AABBs of brackets already drawn this frame

    for (let i = 0; i < records.length; i++) {
        const { obj, wp, distance, isHostile, isLocked, isCurrentTarget } = records[i];
        const scheme = isLocked ? TARGET_LAYER_COLORS.locked : (isHostile ? TARGET_LAYER_COLORS.hostile : TARGET_LAYER_COLORS.neutral);

        const proj = _tlProjectToScreen(wp, camera, w, h);

        const worldRadius = _tlWorldRadius(obj);
        const pxPerUnit = (h / (2 * vFovTan)) / Math.max(1, distance);
        // TWO radii, deliberately. `apparentRadius` is clamped to 70px so the
        // bracket stays a readable reticle instead of growing into a giant box
        // the pilot has to look past. `hullRadiusPx` is the ship's REAL
        // on-screen half-extent, unclamped — that is what the name plate has to
        // clear so it never lands on the hull it labels (see _tlTagMetrics).
        const apparentRadius = Math.min(70, Math.max(14, worldRadius * pxPerUnit));
        const hullRadiusPx = Math.min(Math.max(w, h), Math.max(14, worldRadius * pxPerUnit));

        let drawRadius = apparentRadius;
        let alpha = 1;
        if (isLocked) {
            const lockStart = _targetLayerLockCache.get(obj) || now;
            const t = Math.min(1, (now - lockStart) / TARGET_LAYER_LOCK_ANIM_MS);
            const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic — brackets snap IN onto the lock
            drawRadius = apparentRadius + (1 - ease) * apparentRadius * 1.8;
            alpha = 0.45 + 0.55 * ease;
        }

        // Draw on-screen; anything within a generous margin still gets its
        // bracket (so it doesn't pop as it crosses the exact edge), further
        // out gets the clamped chevron instead.
        if (proj.x > -160 && proj.x < w + 160 && proj.y > -160 && proj.y < h + 160 && !proj.behind) {
            // Bracket declutter: records are walked in locked -> current
            // target -> nearest priority order, so anything already in
            // placedBracketBoxes outranks this contact. A lower-priority
            // bracket that would stack its corner ticks on top of one
            // already placed draws shrunk instead — still a distinct,
            // readable reticle, not a merged blob of overlapping ticks.
            let bracketRadius = drawRadius;
            let bracketAlpha = alpha;
            if (!isLocked && !isCurrentTarget) {
                const fullBox = { left: proj.x - drawRadius, right: proj.x + drawRadius, top: proj.y - drawRadius, bottom: proj.y + drawRadius };
                for (let j = 0; j < placedBracketBoxes.length; j++) {
                    if (_tlBoxesOverlap(fullBox, placedBracketBoxes[j], BRACKET_DECLUTTER_PAD)) {
                        bracketRadius = Math.max(9, drawRadius * 0.55);
                        bracketAlpha = alpha * 0.7;
                        break;
                    }
                }
            }
            _tlDrawBracket(ctx, proj.x, proj.y, bracketRadius, scheme, bracketAlpha);
            placedBracketBoxes.push({ left: proj.x - bracketRadius, right: proj.x + bracketRadius, top: proj.y - bracketRadius, bottom: proj.y + bracketRadius });

            // TAG PLACEMENT — down-and-right of the contact, outside its hull.
            //
            // The clearance radius is whichever is larger of the drawn bracket
            // and the ship's true on-screen half-extent, so a close-in gunship
            // that dwarfs its own 70px-clamped bracket still pushes its label
            // off the fuselage. The plate is then offset right by a fraction of
            // that radius and dropped below it, and joined back to the bracket
            // by an elbow leader.
            // Capped at ~35% of the shorter viewport axis: past that the
            // contact is filling the screen, there is no "off the hull" left
            // to aim for, and an uncapped clearance would fling the plate
            // clean off the canvas and cost the pilot the readout entirely.
            const clearCap = Math.min(w, h) * 0.35;
            const clearR = Math.min(clearCap, Math.max(bracketRadius, hullRadiusPx));
            const tagScale = _tlTagScale(hullRadiusPx);
            const hullBox = {
                left: proj.x - clearR, right: proj.x + clearR,
                top: proj.y - clearR, bottom: proj.y + clearR
            };

            // Candidate anchors, best first: below-right of the hull, then
            // above-right (for a contact hugging the bottom of the screen),
            // then below-LEFT (for one hugging the right edge). Each is the
            // plate's top-left corner.
            const offX = proj.x + clearR * 0.42 + 8;
            let placed = null;
            for (let cand = 0; cand < 3 && !placed; cand++) {
                let ax, ay;
                const probe = _tlTagMetrics(ctx, obj, 0, 0, distance, isHostile, tagScale);
                if (cand === 0)      { ax = offX;                     ay = proj.y + clearR + 10; }
                else if (cand === 1) { ax = offX;                     ay = proj.y - clearR - 10 - probe.plateH; }
                else                 { ax = proj.x - clearR * 0.42 - 8 - probe.plateW; ay = proj.y + clearR + 10; }

                const m = _tlTagMetrics(ctx, obj, ax, ay, distance, isHostile, tagScale);
                // Nudge fully onto the canvas, then move the plate with it.
                const dx = _tlClampAxis(m.box.left, m.box.right, TAG_VIEWPORT_PAD, w - TAG_VIEWPORT_PAD);
                const dy = _tlClampAxis(m.box.top, m.box.bottom, TAG_VIEWPORT_PAD, h - TAG_VIEWPORT_PAD);
                m.plateX += dx; m.plateY += dy;
                m.box = { left: m.box.left + dx, right: m.box.right + dx, top: m.box.top + dy, bottom: m.box.bottom + dy };

                // HARD RULE: a label may never be painted across the hull it
                // annotates. If the viewport clamp shoved it back onto the
                // ship, this candidate is rejected outright and the next
                // placement is tried.
                if (_tlBoxesOverlap(m.box, hullBox, 0)) continue;

                let blocked = false;
                for (let j = 0; j < placedTagBoxes.length; j++) {
                    if (_tlBoxesOverlap(m.box, placedTagBoxes[j], TAG_DECLUTTER_PAD)) { blocked = true; break; }
                }
                if (!blocked) placed = m;
            }

            if (placed) {
                // Leader starts on the bracket edge nearest the plate.
                const leadX = proj.x + (placed.plateX < proj.x ? -bracketRadius : bracketRadius) * 0.72;
                const leadY = proj.y + (placed.plateY < proj.y ? -bracketRadius : bracketRadius) * 0.72;
                // World-anchored layer stays otherwise untouched during the
                // slingshot/warp spectacle — only the name/HP tag plates
                // ease back a little (brackets, chevrons and lead pips are
                // left at full strength), per the HUD yield redesign.
                if (_tlSpectacleTagAlpha < 1) {
                    ctx.save();
                    ctx.globalAlpha = _tlSpectacleTagAlpha;
                    _tlDrawTag(ctx, placed, scheme, isHostile, obj, leadX, leadY);
                    ctx.restore();
                } else {
                    _tlDrawTag(ctx, placed, scheme, isHostile, obj, leadX, leadY);
                }
                placedTagBoxes.push(placed.box);
            } else {
                _tlDrawDeclutterDot(ctx, proj.x, proj.y, bracketRadius, scheme);
            }
            if (weaponsArmed && (isHostile || isLocked)) {
                _tlDrawLeadPip(ctx, obj, wp, distance, proj, camera, w, h, scheme);
            }
        } else {
            _tlDrawEdgeChevron(ctx, proj, w, h, scheme, distance);
        }
    }
}

if (typeof window !== 'undefined') {
    window.updateTargetLayer = updateTargetLayer;
}

// =============================================================================
// GALAXY MAP SYSTEM - ENHANCED WITH BOSS TRACKING
// =============================================================================

// =============================================================================
// HELPER FUNCTION - DETERMINE CURRENT GALAXY
// =============================================================================

function getCurrentGalaxyId() {
    if (typeof camera === 'undefined') return -1;
    
    // ⭐ IMPROVED: Check distance to actual black holes first (most accurate)
    if (typeof planets !== 'undefined') {
        const galaxyBlackHoles = planets.filter(p => 
            p.userData.type === 'blackhole' && 
            p.userData.isGalacticCore === true &&
            typeof p.userData.galaxyId === 'number'
        );
        
        // Check if we're near any galaxy black hole
        for (const blackHole of galaxyBlackHoles) {
            const distance = camera.position.distanceTo(blackHole.position);
            const detectionRadius = 20000; // Large radius around each black hole
                        
            if (distance < detectionRadius) {
                return blackHole.userData.galaxyId;
            }
        }
    }
    
    // Fallback: Use 3D galaxy center positions
    const universeRadius = 150000;  // Increased for wider map coverage (accommodates exotic/borg systems with larger margins)
    
    if (typeof getGalaxy3DPosition === 'function' && typeof galaxyTypes !== 'undefined') {
        let closestGalaxy = -1;
        let closestDistance = Infinity;
        
        for (let g = 0; g < 8; g++) {
            const galaxyCenter = getGalaxy3DPosition(g);
            const distance = camera.position.distanceTo(galaxyCenter);
            
            console.log(`Galaxy ${g} (${galaxyTypes[g]?.name}): distance=${distance.toFixed(0)}`);
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestGalaxy = g;
            }
        }
        
        const detectionThreshold = 20000; // Increased from 18000
        
        if (closestDistance < detectionThreshold) {
            console.log(`✅ Inside Galaxy ${closestGalaxy} (${galaxyTypes[closestGalaxy]?.name}) - ${closestDistance.toFixed(0)} units from center`);
            return closestGalaxy;
        }
    } 
    // Final fallback to 2D map positions
    else if (typeof galaxyMapPositions !== 'undefined') {
        let closestGalaxy = -1;
        let closestDistance = Infinity;
        
        for (let g = 0; g < 8; g++) {
            const mapPos = galaxyMapPositions[g];
            if (mapPos) {
                // TRUE coords from the map table → current rebased frame
                const _wooG = (typeof window !== 'undefined' && window.worldOriginOffset) || { x: 0, y: 0, z: 0 };
                const galaxyX = (mapPos.x - 0.5) * universeRadius * 2 - _wooG.x;
                const galaxyZ = (mapPos.y - 0.5) * universeRadius * 2 - _wooG.z;
                const galaxyY = 0 - _wooG.y;
                const galaxyCenter = new THREE.Vector3(galaxyX, galaxyY, galaxyZ);
                
                const distance = camera.position.distanceTo(galaxyCenter);
                
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestGalaxy = g;
                }
            }
        }
        
        const detectionThreshold = 20000;
        if (closestDistance < detectionThreshold) {
            return closestGalaxy;
        }
    }
    
    console.log('❌ Not in any galaxy - Unexplored Space');
    return -1;
}

function getCurrentGalaxyName() {
    const galaxyId = getCurrentGalaxyId();
    
    if (galaxyId === -1) {
        return 'Unexplored Space';
    } else if (galaxyId === 7) {
        return 'Local Galaxy - Sol System'; // Special case for starting galaxy
    } else if (typeof galaxyTypes !== 'undefined' && galaxyTypes[galaxyId]) {
        // ⭐ Use galaxy TYPE names with faction
        const galaxy = galaxyTypes[galaxyId];
        return `${galaxy.name} Galaxy - ${galaxy.faction}`;
    }
    
    return 'Deep Space';
}

function setupGalaxyMap() {
    const galaxyMap = document.getElementById('galaxyMap');
    if (!galaxyMap || typeof galaxyTypes === 'undefined') return;
    
    // Create grid overlay
    createMapGrid();
    
    // Clear existing galaxy indicators
    const existingGalaxies = galaxyMap.querySelectorAll('.galaxy-indicator');
    existingGalaxies.forEach(el => el.remove());
    // Fresh indicators default to visible — re-arm the galactic view's
    // one-shot hide so the radar mode still suppresses them.
    _galacticChromeHidden = false;

    // Create enhanced galaxy indicators with boss system integration
    galaxyTypes.forEach((galaxy, index) => {
        // Convert 3D spherical position to 2D map position (same logic as universe view)
        let mapPos;
        if (typeof galaxy3DPositions !== 'undefined' && galaxy3DPositions[index]) {
            const galaxy3D = galaxy3DPositions[index];
            const phi = galaxy3D.phi;
            const theta = galaxy3D.theta;
            const distance = galaxy3D.distance;

            // Project spherical coordinates onto 2D map
            let x = (phi / (Math.PI * 2)) % 1.0;
            let y = theta / Math.PI;

            // Apply distance factor for depth
            const centerX = 0.5;
            const centerY = 0.5;
            x = centerX + (x - centerX) * distance;
            y = centerY + (y - centerY) * distance;

            mapPos = { x, y };
        } else if (typeof galaxyMapPositions !== 'undefined' && galaxyMapPositions[index]) {
            // Fallback to old hardcoded positions
            mapPos = galaxyMapPositions[index];
        } else {
            console.warn(`No map position for galaxy index ${index} ("${galaxy.name}"), skipping.`);
            return;
        }

        // Compute enemy count safely
        let enemyCount = 0;
        if (typeof gameState !== 'undefined' && gameState.currentGalaxyEnemies) {
            enemyCount = gameState.currentGalaxyEnemies[index] || 0;
        }

        // Read boss flags safely from bossSystem in game-objects.js
        let bossDefeated = false;
        let bossSpawned = false;
        if (typeof bossSystem !== 'undefined') {
            bossDefeated = Array.isArray(bossSystem.galaxyBossDefeated) ? 
                !!bossSystem.galaxyBossDefeated[index] : false;
            bossSpawned = Array.isArray(bossSystem.galaxyBossSpawned) ? 
                !!bossSystem.galaxyBossSpawned[index] : false;
        }

        // Build the galaxy indicator
        // Slightly larger footprint (w-4 vs the old w-3) plus the CSS
        // ::after hit-area pad in styles.css — bigger mouse/touch target
        // without the dot itself looking oversized on the round map.
        const galaxyEl = document.createElement('div');
        galaxyEl.className = 'galaxy-indicator absolute w-4 h-4 rounded-full opacity-80 flex items-center justify-center text-xs text-white font-bold';
        const galaxyHex = `#${galaxy.color.toString(16).padStart(6, '0')}`;
        galaxyEl.style.backgroundColor = galaxyHex;
        // Drives the CSS glow (box-shadow: var(--dot-color)) so each
        // faction's minimap dot reads clearly in its own neon color,
        // including on :hover, without hardcoding colors in CSS.
        galaxyEl.style.setProperty('--dot-color', galaxyHex);
        galaxyEl.style.left = `${mapPos.x * 100}%`;
        galaxyEl.style.top = `${mapPos.y * 100}%`;
        // NOTE: no inline transform here — .galaxy-indicator owns the
        // translate(-50%,-50%) centering in CSS so :hover can layer a
        // scale() on top of it. Setting it inline here used to fight the
        // :hover rule (inline style always wins ties over a stylesheet
        // selector), silently killing the hover scale-up.
        galaxyEl.textContent = (index + 1).toString();
        galaxyEl.title = `${galaxy.name} Galaxy (${galaxy.faction})`;

        // Mark cleared galaxies with green dot
		if (bossDefeated || (typeof gameState !== 'undefined' && gameState.currentGalaxyEnemies && gameState.currentGalaxyEnemies[index] === 0)) {
		galaxyEl.style.backgroundColor = '#22c55e'; // Green for cleared
		galaxyEl.style.setProperty('--dot-color', '#22c55e');
    	galaxyEl.style.border = '2px solid #86efac';
    	galaxyEl.textContent = '';
    	galaxyEl.title = `${galaxy.name} Galaxy (${galaxy.faction}) - LIBERATED`;
		}

        galaxyMap.appendChild(galaxyEl);
    });
    
    // Add Sagittarius A* indicator
    const sgrAEl = document.createElement('div');
    sgrAEl.className = 'absolute w-4 h-4 bg-yellow-600 rounded-full flex items-center justify-center text-xs text-white font-bold';
    sgrAEl.style.left = '50%';
    sgrAEl.style.top = '50%';
    sgrAEl.style.transform = 'translate(-50%, -50%)';
    sgrAEl.style.boxShadow = '0 0 8px #ca8a04';
    sgrAEl.textContent = '';
    sgrAEl.title = 'Sagittarius A* - Galactic Center';
    galaxyMap.appendChild(sgrAEl);
    const existingGalaxyIndicator = document.getElementById('currentGalaxyIndicator');
    if (existingGalaxyIndicator) {
        existingGalaxyIndicator.remove();
    }
}

function createMapGrid() {
    const mapGrid = document.getElementById('mapGrid');
    if (!mapGrid) return;
    
    // Clear existing grid
    mapGrid.innerHTML = '';
    
    // Create vertical lines
    for (let i = 1; i < 8; i++) {
        const line = document.createElement('div');
        line.className = 'map-grid-line vertical';
        line.style.left = `${(i / 8) * 100}%`;
        mapGrid.appendChild(line);
    }
    
    // Create horizontal lines
    for (let i = 1; i < 8; i++) {
        const line = document.createElement('div');
        line.className = 'map-grid-line horizontal';
        line.style.top = `${(i / 8) * 100}%`;
        mapGrid.appendChild(line);
    }
}

// =============================================================================
// NAVIGATION AND COMPASS SYSTEMS - ENHANCED
// =============================================================================

function updateCompass() {
    if (typeof camera === 'undefined' || typeof planets === 'undefined') return;
    
    // Compass functionality - points to the LARGEST black hole (Sagittarius A*)
    const playerPos = camera.position;
    let sgrAPos = new THREE.Vector3(0, 0, 0); // Default to origin
    
    // Find the LARGEST black hole in the local area
    const localBlackHoles = planets.filter(p => 
        p.userData && 
        p.userData.type === 'blackhole' &&
        (p.userData.isGalacticCenter === true || p.userData.isCompanionCore === true)
    );
    
    if (localBlackHoles.length > 0) {
        // Find the largest by mass (Sagittarius A* should be largest)
        const largestBlackHole = localBlackHoles.reduce((largest, current) => {
            const largestMass = largest.userData.mass || 0;
            const currentMass = current.userData.mass || 0;
            return currentMass > largestMass ? current : largest;
        });
        
        sgrAPos = largestBlackHole.position.clone();
        // console.log(`Compass pointing to: ${largestBlackHole.userData.name}`);
    }
}

// ── Radar dot pool (persistent, never detached) ──────────────────────
// PERF CONTRACT — the radar refreshes at 20 Hz with up to ~350 blips in a
// dense fight. The old pool tore the whole minimap down every refresh:
// remove() + className='' + style.cssText='' + innerHTML='' on every dot,
// then 10 individual style writes and an appendChild() back into the LIVE
// #galaxyMap. That measured ~356 DOM mutations per refresh (~3,000/sec)
// and was the dominant source of forced style recalculation.
//
// The pool below fixes that shape:
//   • dots are created ONCE and stay attached to #galaxyMap forever,
//   • a refresh CLAIMS dots by identity instead of allocating,
//   • look (class, position:absolute, border-radius…) lives in CSS, so
//     className / cssText / innerHTML are never touched again,
//   • position is a single compositor-friendly `transform: translate()`
//     instead of left/top percentages,
//   • every write is guarded by a per-dot cache (`dot._s`), so a dot that
//     did not visually change costs ZERO mutations,
//   • surplus dots are hidden with `visibility`, then recycled.
// Arrows (ally ▲ markers) get their own sub-pool so a dot never has to
// morph between "round blip" and "glyph" shapes.
//
// IDENTITY (the reason this pool is keyed and not a cursor):
// the earlier version handed out slots positionally — dots[cursor++] — so
// the DOM element a contact owned depended on where it happened to land in
// the scan order. The instant that order changed (a fighter dies, a rock
// crosses the 3000u rim) every contact after the gap shifted down one slot
// and its blip JUMPED across the radar — up to 72% of the map width — or
// silently repainted in place, turning a red hostile into a beige planet
// without moving. Roughly once a second in a fight the radar lied about
// which contact was which.
// Now each contact owns a dot keyed by its object id: `claimed` holds the
// slots this refresh took, `prev` the ones last refresh held. A contact
// that is still there gets the SAME element back, so its blip only ever
// moves the distance the ship actually moved. Slots left in `prev` at
// end() are genuinely dead contacts; they go to a `free` LIFO for reuse,
// which also caps the pool at the peak concurrent contact count instead
// of letting it creep (it used to reach 636 nodes to show 15 blips).
const mapDotPool = {
    dots: [],            // every live element, for re-parenting only
    claimed: new Map(),  // key -> dot, taken during THIS refresh
    prev: new Map(),     // key -> dot, held by the PREVIOUS refresh
    free: [],            // released dots, oldest first (LIFO reuse, FIFO retire)
    arrows: [],
    arrowsClaimed: new Map(),
    arrowsPrev: new Map(),
    arrowsFree: [],
    container: null,
    // Radar box size in px, used to turn 0-100 map coords into translate()
    // pixels. Re-measured at most once a second — never per dot.
    w: 220,
    h: 220,
    _measuredAt: 0,
    _overSince: 0,       // when the free list first went over budget

    _fresh(cls) {
        const el = document.createElement('div');
        el.className = cls;
        // Mirrors the CSS defaults so the cache and the element agree.
        el._s = { size: '', bg: '', shadow: '', tf: '', vis: 'hidden',
                  color: '', title: '', distress: false, glyph: false,
                  z: '', aggregate: false, opacity: '', outline: '', stalk: '' };
        // Permanent elevation "drop-line" child — ONE per dot, created once
        // and only ever restyled (height/position/colour), never
        // added/removed. Ally arrows don't get one: they render as a
        // glyph, not a dot, and el.textContent below would wipe it anyway.
        if (cls === 'galactic-target-dot') {
            const stalk = document.createElement('i');
            stalk.className = 'map-dot-stalk';
            el.appendChild(stalk);
        }
        if (this.container) this.container.appendChild(el);
        return el;
    },

    // Start a refresh: last refresh's claims become the lookup table, and
    // (rarely) re-measure the box.
    begin(container) {
        // Swap, don't allocate: claimed becomes prev, and the old prev map
        // (already drained by end()) is reused as the new claimed map.
        let t = this.prev; this.prev = this.claimed; this.claimed = t; t.clear();
        t = this.arrowsPrev; this.arrowsPrev = this.arrowsClaimed; this.arrowsClaimed = t; t.clear();
        if (container && container !== this.container) {
            this.container = container;
            // Only happens if the map element itself was replaced.
            for (let i = 0; i < this.dots.length; i++) container.appendChild(this.dots[i]);
            for (let i = 0; i < this.arrows.length; i++) container.appendChild(this.arrows[i]);
            this._measuredAt = 0;
        }
        if (this.container) {
            const now = Date.now();
            if (now - this._measuredAt > 1000) {
                this._measuredAt = now;
                const w = this.container.clientWidth, h = this.container.clientHeight;
                if (w > 0 && h > 0) { this.w = w; this.h = h; }
            }
        }
    },

    // Claim the dot belonging to `key` (a stable per-world-object id).
    // Same key next refresh ⇒ same element ⇒ the blip cannot teleport.
    get(key) {
        // Two contacts resolving to the same key (only possible on the
        // name fallback) get suffixed deterministically, so the pairing
        // still repeats frame to frame.
        while (this.claimed.has(key)) key = key + '~';
        let dot = this.prev.get(key);
        if (dot !== undefined) {
            this.prev.delete(key);
        } else {
            // A retired slot, or a brand-new one. pop() takes the most
            // recently freed dot; the stale tail ages out via _trim().
            dot = this.free.pop();
            if (dot === undefined) {
                dot = this._fresh('galactic-target-dot');
                this.dots.push(dot);
            }
        }
        this.claimed.set(key, dot);
        return dot;
    },

    getArrow(key) {
        while (this.arrowsClaimed.has(key)) key = key + '~';
        let a = this.arrowsPrev.get(key);
        if (a !== undefined) {
            this.arrowsPrev.delete(key);
        } else {
            a = this.arrowsFree.pop();
            if (a === undefined) {
                a = this._fresh('galactic-ally-marker');
                a.textContent = '▲';
                a._s.glyph = true;
                this.arrows.push(a);
            }
        }
        this.arrowsClaimed.set(key, a);
        return a;
    },

    // Hide whatever this refresh did not claim and hand those slots back.
    // No detaching here, and a dot that was already hidden is untouched.
    end() {
        const f = this.free;
        this.prev.forEach(function (d) {
            const s = d._s;
            if (s.vis !== 'hidden') { d.style.visibility = 'hidden'; s.vis = 'hidden'; }
            f.push(d);
        });
        this.prev.clear();
        const af = this.arrowsFree;
        this.arrowsPrev.forEach(function (a) {
            const s = a._s;
            if (s.vis !== 'hidden') { a.style.visibility = 'hidden'; s.vis = 'hidden'; }
            af.push(a);
        });
        this.arrowsPrev.clear();
        this._trim();
    },

    // A hidden node still costs style-recalc time, so a pool that ballooned
    // during one dense dogfight must not stay ballooned. Keep a cushion of
    // spares, and only after the surplus has sat unused for 3 s retire the
    // oldest of them — hysteresis so normal contact churn never detaches
    // anything (steady state = zero added/removed nodes).
    _trim() {
        const keep = Math.max(24, this.claimed.size);
        if (this.free.length <= keep) { this._overSince = 0; return; }
        const now = Date.now();
        if (!this._overSince) { this._overSince = now; return; }
        if (now - this._overSince < 3000) return;
        let n = Math.min(48, this.free.length - keep);
        while (n-- > 0) {
            const d = this.free.shift();   // front = least recently used
            if (d.parentNode) d.parentNode.removeChild(d);
            const i = this.dots.indexOf(d);
            if (i >= 0) this.dots.splice(i, 1);
        }
        if (this.free.length <= keep) this._overSince = 0;
    },

    // Legacy entry point (universal view): hide every blip and hand the
    // whole pool back, so a long stay on the galaxy map lets _trim() give
    // the nodes up entirely. Identities are deliberately NOT preserved
    // across the excursion: coming back re-pairs contacts to slots once,
    // on a frame where the player just repainted the entire map anyway.
    releaseAll() {
        this.prev.forEach((d, k) => { this.claimed.set(k, d); });
        this.prev.clear();
        this.arrowsPrev.forEach((a, k) => { this.arrowsClaimed.set(k, a); });
        this.arrowsPrev.clear();
        // Everything currently claimed is now stale: flip it into prev and
        // let end() hide + recycle the lot.
        let t = this.prev; this.prev = this.claimed; this.claimed = t; t.clear();
        t = this.arrowsPrev; this.arrowsPrev = this.arrowsClaimed; this.arrowsClaimed = t; t.clear();
        this.end();
    }
};

// Radar blips only need a fresh tooltip a couple of times a second —
// rewriting 350 title strings at 20 Hz was pure allocation churn for text
// nobody can read until the cursor has rested on a dot for ~1s.
let _mapTitleStamp = 0;
let _mapTitleTick = false;

// View-switch latches. The galactic and universal radar modes each own a
// set of DOM chrome (galaxy indicators, ally ▲ markers, nebula dots, path
// lines). Showing/hiding that chrome is a ONE-SHOT on the switch — doing
// it every refresh re-invalidated dozens of already-correct elements.
let _galacticChromeHidden = false;   // galactic view has hidden universal chrome
let _universeDecorLive = false;      // nebula dots / path lines are attached

// ── Radar declutter: bucket candidate blips, render individuals or one
// aggregate per crowded cell ────────────────────────────────────────────
// Cell size in radar px — matches the ~4-6px grid a dense clump was
// observed stacking into (a screen-space cell, not a world-space one, so
// it scales with however zoomed-in the radar currently is).
const MAP_CLUSTER_CELL_PX = 5;
// Hard ceiling on DOM nodes the WHOLE radar refresh may claim — VIPs,
// hostiles, objectives, allies AND scenery all draw from this ONE pool now,
// spent in strict priority order (current target > hostiles > objectives >
// allies > scenery). It used to look like a budget but wasn't one: scenery
// had its own separate, ADDITIVE allowance (MAP_SCENERY_NODE_BUDGET) that
// sat entirely outside this ceiling, and ally arrows bypassed the whole
// system — rendered individually, every frame, with no cap at all. Total
// nodes could exceed MAP_CLUSTER_NODE_BUDGET by scenery's 24 plus however
// many allies were in play. Fixed with one running remainder (`remaining`
// in renderClusteredMapDots), debited by each tier in priority order
// before the next tier gets to see it.
const MAP_CLUSTER_NODE_BUDGET = 250;
// Scenery (dotPriority <= 60: planets, asteroids, dysons, whales,
// ringworlds, storms, quiet civilian traffic) already gets visually
// demoted to near-invisible ink by renderIndividualMapDot — 3px, no glow,
// 45% opacity — yet an untouched asteroid field was still spending one
// full DOM node (plus a permanent stalk child) per rock. Scenery gets its
// own small, fixed-grid CEILING instead: coarser than the tactical/hostile
// cells (so a scattered field collapses hard), never widened by how
// crowded the frame is, AND — being last in priority order — further
// clamped to whatever's left of the shared budget once every
// higher-priority tier has taken its share (see renderClusteredMapDots).
// This ceiling only stops scenery from HOGGING a quiet frame's surplus
// budget; it is not itself a separate allowance on top of the total.
const MAP_SCENERY_CELL_PX = 14;
const MAP_SCENERY_NODE_BUDGET = 24;
// The "must-tier" (hostile / boss / distress / current-target / active-lock)
// used to render EVERY member individually, unbucketed — which is not a
// budget at all: a 200+ hostile swarm just blew straight through the 250
// node ceiling wearing full tactical grammar, and the O(n^2) separation
// pass that used to sit here (pushing overlapping pairs apart one at a
// time) cannot converge on a dense clump — nudging A off B pushes it onto
// C. Only a genuinely unmissable handful renders unbucketed now (see
// MAP_MUST_VIP_CAP below); everything else in the must-tier gets bucketed
// exactly like `tactical`, just on a coarser grid so a swarm still reads
// distinctly "hostile" rather than fading into scenery-grade aggregates.
// (No separate node-count ceiling for this tier: as tier #2 in priority
// order — current target > HOSTILES > objectives > allies > scenery — it
// is entitled to as much of the shared budget as it needs, same as
// objectives get whatever hostiles leave behind. Only scenery, dead last,
// gets an extra ceiling so it can't eat a quiet frame's whole surplus.)
const MAP_MUST_CELL_PX = 6;
// Hard cap on contacts that bypass bucketing entirely. Current target /
// active lock / boss / distress call are non-negotiable — a player mid-fight
// can't have their lock target vanish into an aggregate — so those are
// always included even if that pushes slightly past the cap; remaining
// slots (usually all 12) fill with the nearest-by-distance must-tier
// contacts, since proximity is the best available proxy for "about to
// matter" without a real threat score.
const MAP_MUST_VIP_CAP = 12;
// The VIP list bypasses the must-tier's own bucketing, so nothing else
// stops its optional ("nearest by distance") members from landing on top
// of each other — a boss with several nearest escorts can genuinely be
// this close together on screen. Cap how many VIPs may occupy the same
// audit-grid cell (4px, matching the "no cell holds > 3 individual nodes"
// rule this whole pass exists to satisfy); a candidate that would push a
// cell over the cap is simply left out of VIP and falls through to the
// must-tier's bucketed overflow instead, where it renders as part of that
// cell's aggregate — still visible, just not itemized. Forced VIPs
// (current target / active lock / boss / distress) are never dropped by
// this cap, only counted against it for later optional fills.
const MAP_VIP_CELL_PX = 4;
const MAP_VIP_CELL_CAP = 3;

// #rrggbb -> 'rgba(r,g,b,alpha)', for the 35%-alpha elevation stalks (which
// reuse each blip's own dotColor rather than a fixed palette entry).
function _mapStalkRgba(hex, alpha) {
    if (typeof hex !== 'string' || hex.charCodeAt(0) !== 35 /* '#' */) {
        return 'rgba(200,220,255,' + alpha + ')';
    }
    let h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const r = parseInt(h.substring(0, 2), 16) || 0;
    const g = parseInt(h.substring(2, 4), 16) || 0;
    const b = parseInt(h.substring(4, 6), 16) || 0;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

// Applies the shared elevation "drop-line" treatment to a claimed dot: the
// dot itself shifts vertically by `dy` px (elevated contacts render higher
// on the disc, contacts below render lower), and its permanent stalk child
// (added once in mapDotPool._fresh) is sized to bridge back down/up to the
// contact's true flat-plane position. Returns dy so the caller can fold it
// into the dot's own translate(). Fully compare-and-set: an unmoved blip
// (same dy + colour) writes nothing.
function _applyMapDotStalk(dot, s, relY, dotColor) {
    const dyRaw = (relY || 0) * mapDotPool.h * 0.30;
    const dy = Math.round(dyRaw * 10) / 10;
    const stalk = dot.firstElementChild;
    if (stalk) {
        const stalkKey = dy + '|' + dotColor;
        if (s.stalk !== stalkKey) {
            const h = Math.abs(dy);
            stalk.style.height = h + 'px';
            if (h >= 0.5) {
                stalk.style.background = _mapStalkRgba(dotColor, 0.35);
                if (dy > 0) { stalk.style.top = '100%'; stalk.style.bottom = 'auto'; }
                else { stalk.style.bottom = '100%'; stalk.style.top = 'auto'; }
            }
            s.stalk = stalkKey;
        }
    }
    return dy;
}

// Shared #mapDepthBar / #mapDepthTick creation, used by BOTH map views so
// there is exactly one build path (and one DOM structure) for the element
// regardless of which view the player opens first. Universal view drives
// the tick from the player's absolute Y; galactic view (radar) pins it to
// the centre line, since every contact's own elevation is already shown
// relative to the player via its stalk (see _applyMapDotStalk) — the bar
// there is a static px-to-units scale reference, not a live gauge.
function _ensureMapDepthBar(galaxyMap) {
    let depthBar = document.getElementById('mapDepthBar');
    if (depthBar || !galaxyMap) return depthBar;
    depthBar = document.createElement('div');
    depthBar.id = 'mapDepthBar';
    // Depth bar placed inside the round-map clip area (circle has
    // ~85% inner radius at the edges) — keep it short and inset so it
    // doesn't get clipped by border-radius:50%.
    depthBar.style.cssText = 'position:absolute;right:18%;top:30%;width:4px;height:40%;background:linear-gradient(to bottom,rgba(100,180,255,0.15),rgba(40,40,80,0.25),rgba(100,180,255,0.15));border:1px solid rgba(100,180,255,0.4);border-radius:3px;pointer-events:none;z-index:9;';
    const tick = document.createElement('div');
    tick.id = 'mapDepthTick';
    tick.style.cssText = 'position:absolute;left:-4px;width:14px;height:3px;background:#00ff96;box-shadow:0 0 4px #00ff96;border-radius:2px;top:50%;';
    depthBar.appendChild(tick);
    const lblTop = document.createElement('div');
    lblTop.textContent = '+Y';
    lblTop.style.cssText = 'position:absolute;left:-22px;top:-12px;font-size:8px;color:#88ccff;';
    depthBar.appendChild(lblTop);
    const lblMid = document.createElement('div');
    lblMid.textContent = '0';
    lblMid.style.cssText = 'position:absolute;left:-12px;top:50%;font-size:8px;color:#88ccff;';
    depthBar.appendChild(lblMid);
    const lblBot = document.createElement('div');
    lblBot.textContent = '−Y';
    lblBot.style.cssText = 'position:absolute;left:-22px;bottom:-12px;font-size:8px;color:#88ccff;';
    depthBar.appendChild(lblBot);
    galaxyMap.appendChild(depthBar);
    return depthBar;
}

// Buckets `items` onto a screen-space grid (same declutter idea the old
// per-tier loops used), widening the cell up to 4x if the natural
// bucketing still produces more nodes than `target`. Unlike the old
// per-tier FIXED constants, `target` here is today's REMAINING shared
// budget (see renderClusteredMapDots) — so this is the one place that has
// to make good on "the cap is a cap" even in a case the geometric widening
// alone can't reach (a higher-priority tier already spent nearly
// everything, so this tier's target is tiny). If widening still leaves the
// tier over target, the lowest-salience cells are folded into ONE final
// "+overflow" aggregate so the tier's real emitted node count can never
// exceed target — a hard guarantee, not a best-effort one (the old
// widening loop just gave up after 4 attempts and rendered whatever it
// had, which is how a class of blip could blow straight through the
// declared budget).
// individualMax: cells with <= this many members render as individual
// dots (0 disables that entirely — every surviving cell is an aggregate,
// which is how scenery always wants it).
function _bucketWithBudget(items, cellPxStart, target, individualMax, keyPrefix) {
    if (target <= 0 || items.length === 0) return { entries: [], nodeCount: 0 };

    const cost = g => (individualMax > 0 && g.length <= individualMax) ? g.length : 1;

    let cellPx = cellPxStart;
    let groups;
    let total = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
        groups = new Map(); // cellKey -> array of candidates
        for (let i = 0; i < items.length; i++) {
            const c = items[i];
            const ck = Math.floor(c.px / cellPx) + '_' + Math.floor(c.py / cellPx);
            let g = groups.get(ck);
            if (!g) { g = []; groups.set(ck, g); }
            g.push(c);
        }
        total = 0;
        groups.forEach(g => { total += cost(g); });
        if (total <= target || attempt === 3) break;
        cellPx *= 1.7;
    }

    if (total <= target) {
        const entries = [];
        groups.forEach((g, ck) => entries.push({ cellKey: keyPrefix + ck, group: g, forceAggregate: false }));
        return { entries, nodeCount: total };
    }

    // Widening alone didn't converge (target is smaller than this tier's
    // natural spread even at max cell size) — guarantee the cap anyway:
    // rank cells by salience (highest member priority, then size), keep
    // rendering the top ones normally until one slot is left, then fold
    // every remaining cell's members into a single synthetic overflow
    // aggregate. Still "many" reads as one blip, it's just the whole
    // remainder instead of one cell's worth.
    const ranked = [];
    groups.forEach((g, ck) => ranked.push({ cellKey: keyPrefix + ck, group: g }));
    ranked.sort((a, b) => {
        let pa = -Infinity, pb = -Infinity;
        for (let i = 0; i < a.group.length; i++) if (a.group[i].dotPriority > pa) pa = a.group[i].dotPriority;
        for (let i = 0; i < b.group.length; i++) if (b.group[i].dotPriority > pb) pb = b.group[i].dotPriority;
        if (pb !== pa) return pb - pa;
        return b.group.length - a.group.length;
    });

    const entries = [];
    const overflow = [];
    let node = 0;
    const reserve = 1; // last slot held for the overflow aggregate, if needed
    for (let i = 0; i < ranked.length; i++) {
        const g = ranked[i].group;
        const c = cost(g);
        if (node + c <= target - reserve) {
            entries.push({ cellKey: ranked[i].cellKey, group: g, forceAggregate: false });
            node += c;
        } else {
            for (let j = 0; j < g.length; j++) overflow.push(g[j]);
        }
    }
    if (overflow.length) {
        entries.push({ cellKey: keyPrefix + 'overflow', group: overflow, forceAggregate: true });
        node += 1;
    }
    return { entries, nodeCount: node };
}

// Renders the entries _bucketWithBudget returned: a cell within
// individualMax renders its members as individual dots (today's look,
// unchanged), everything else — including any forced overflow fold —
// renders as one aggregate.
function _renderBudgetedEntries(entries, individualMax) {
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (!e.forceAggregate && individualMax > 0 && e.group.length <= individualMax) {
            for (let j = 0; j < e.group.length; j++) renderIndividualMapDot(e.group[j], false);
        } else {
            renderAggregateMapDot(e.cellKey, e.group);
        }
    }
}

function renderClusteredMapDots(candidates, allyCandidates) {
    // `mustTier` (hostile/current-target/lock/boss/distress), `tactical`
    // (the "objectives" tier — anything salient that isn't hostile-grade,
    // dotPriority 61-89) and `scenery` are the same three-way split as
    // before. Ally arrows arrive pre-split via `allyCandidates` (they
    // never dot-cluster — no aggregate form for a glyph — but now DO count
    // against the shared budget, closing the class of blip that used to
    // render completely outside it).
    const mustTier = [];
    const tactical = [];
    const scenery = [];
    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (c.mustIndividual || c.dotPriority >= 90) mustTier.push(c);
        else if (c.dotPriority > 60) tactical.push(c);
        else scenery.push(c);
    }

    // ── Must-tier VIPs: the only contacts that bypass bucketing entirely.
    // Current target / active lock / boss / distress are always in (never
    // let the one blip combat depends on reading correctly vanish into an
    // aggregate); once those are placed, fill remaining slots up to the
    // cap with the nearest-by-distance remainder of the must-tier.
    const vip = [];
    const vipKeys = new Set();
    const vipCellCounts = new Map();
    const vipCellKey = c => Math.floor(c.px / MAP_VIP_CELL_PX) + '_' + Math.floor(c.py / MAP_VIP_CELL_PX);
    for (let i = 0; i < mustTier.length; i++) {
        const c = mustTier[i];
        if (c.mustIndividual || c.dotPriority >= 110 || c.distress) {
            vip.push(c);
            vipKeys.add(c.key);
            const ck = vipCellKey(c);
            vipCellCounts.set(ck, (vipCellCounts.get(ck) || 0) + 1);
        }
    }
    if (vip.length < MAP_MUST_VIP_CAP) {
        const rest = [];
        for (let i = 0; i < mustTier.length; i++) {
            if (!vipKeys.has(mustTier[i].key)) rest.push(mustTier[i]);
        }
        rest.sort((a, b) => a.distance - b.distance);
        for (let i = 0; i < rest.length && vip.length < MAP_MUST_VIP_CAP; i++) {
            const c = rest[i];
            const ck = vipCellKey(c);
            const cnt = vipCellCounts.get(ck) || 0;
            if (cnt >= MAP_VIP_CELL_CAP) continue; // let mustOverflow's bucketing handle this cell instead
            vip.push(c);
            vipKeys.add(c.key);
            vipCellCounts.set(ck, cnt + 1);
        }
    }
    // Everything else in the must-tier (the bulk of a hostile swarm) is
    // bucketed exactly like `tactical` below, just on its own coarser grid
    // — this is what structurally guarantees no cell holds more than a
    // handful of individual nodes; the O(n^2) separation pass this
    // replaced could not (pushing A off B pushes it onto C).
    const mustOverflow = [];
    for (let i = 0; i < mustTier.length; i++) {
        if (!vipKeys.has(mustTier[i].key)) mustOverflow.push(mustTier[i]);
    }

    // ── Shared budget, spent in strict priority order ───────────────────
    // current target > hostiles > objectives > allies > scenery. VIPs
    // (tier #1) already spent their share unconditionally, above — it's
    // non-negotiable. Every tier below debits the SAME running remainder
    // before the next tier gets to see it, which is what makes
    // MAP_CLUSTER_NODE_BUDGET an actual TOTAL ceiling instead of several
    // tiers each quietly assuming they had the whole budget to themselves
    // (the old bug: scenery had its own separate additive allowance, and
    // ally arrows had no budget check at all).
    let remaining = Math.max(0, MAP_CLUSTER_NODE_BUDGET - vip.length);

    // Tier #2: hostiles. No ceiling below `remaining` — hostiles outrank
    // objectives, allies and scenery, so they're entitled to whatever's
    // left of the shared pool, same as objectives get whatever hostiles
    // don't need.
    const hostiles = _bucketWithBudget(mustOverflow, MAP_MUST_CELL_PX, remaining, 2, 'must:');
    remaining = Math.max(0, remaining - hostiles.nodeCount);

    // Tier #3: objectives (everything else salient, dotPriority 61-89).
    const objectives = _bucketWithBudget(tactical, MAP_CLUSTER_CELL_PX, remaining, 2, '');
    remaining = Math.max(0, remaining - objectives.nodeCount);

    // Tier #4: allies. Sorted nearest-first so, if the roster ever did
    // outgrow the remaining budget, the wingmen actually near the action
    // are the ones that stay visible. Whatever doesn't fit is simply never
    // claimed this frame — mapDotPool hides any arrow slot a previous
    // frame held that this frame didn't reclaim, so an over-budget ally
    // just fades out rather than leaking a node past the cap.
    const allySorted = (allyCandidates || []).slice().sort((a, b) => a.distance - b.distance);
    const allyRenderCount = Math.min(allySorted.length, remaining);
    for (let i = 0; i < allyRenderCount; i++) renderAllyMarker(allySorted[i]);
    remaining = Math.max(0, remaining - allyRenderCount);

    // Tier #5: scenery, dead last — gets whatever's left, further capped
    // by its own small ceiling (MAP_SCENERY_NODE_BUDGET) so it can't hog
    // an otherwise-quiet frame's surplus just because nothing else needed
    // it. Always renders as an aggregate (individualMax 0) — even a lone
    // rock in a cell — matching scenery's "never gets full individual-dot
    // treatment" rule from before.
    const sceneryTarget = Math.min(MAP_SCENERY_NODE_BUDGET, remaining);
    const sceneryResult = _bucketWithBudget(scenery, MAP_SCENERY_CELL_PX, sceneryTarget, 0, 'scenery:');

    // ── Render, in the same priority order the budget was spent in ──────
    for (let i = 0; i < vip.length; i++) renderIndividualMapDot(vip[i], true);
    _renderBudgetedEntries(hostiles.entries, 2);
    _renderBudgetedEntries(objectives.entries, 2);
    _renderBudgetedEntries(sceneryResult.entries, 0);
}

// Every write below is compare-and-set against the dot's own cache: a
// blip that kept its colour/size/position costs nothing.
function renderIndividualMapDot(c, raised) {
    const dot = mapDotPool.get(c.key);
    const s = dot._s;

    // ── Salience tier ───────────────────────────────────────────────────
    // The per-type size/colour table above was tuned for "does this look
    // nice alone", not "can you find the enemy in a field of Dyson
    // spheres". Blind-tested against a reference HUD, scenery (dotPriority
    // < 60: planets, asteroids, dysons, whales, ringworlds, storms) was
    // outsizing and outglowing the hostiles the radar exists to show.
    // Force scenery to recede into quiet background noise, and force
    // hostiles/critical contacts (dotPriority >= 90: enemy, boss,
    // borg_drone, distress civilian) to stay unmistakably salient
    // regardless of what the type table gave them.
    let dotSize = c.dotSize;
    let shadow = c.distress
        ? '0 0 8px ' + c.dotColor + ', 0 0 14px rgba(255,170,0,0.6)'
        : '0 0 4px ' + c.dotColor;
    let opacity = '1';
    let outline = 'none';
    if (c.dotPriority <= 60) {
        dotSize = '3px';
        shadow = 'none';
        opacity = '0.45';
    } else if (c.dotPriority >= 90) {
        dotSize = c.dotPriority >= 110 ? '9px' : '7px';
        outline = '1px solid rgba(255,255,255,0.9)';
    }
    // The player's actual locked/selected target — renderClusteredMapDots
    // passes raised=true for the WHOLE vip list, so "raised" alone can't
    // tell this blip apart from a same-tier hostile neighbour sitting
    // right next to it (identical colour/outline/glow/z-index otherwise).
    // c.mustIndividual is true ONLY for gameState.currentTarget / the
    // active lock target (see where _clusterCandidates is built), so a
    // cyan reticle ring here always singles out the one contact combat
    // depends on reading correctly, never a generic nearby VIP.
    if (c.mustIndividual) {
        outline = '2px solid #00fff9';
        shadow = (shadow === 'none') ? '0 0 6px #00fff9' : shadow + ', 0 0 8px #00fff9';
    }

    if (s.size !== dotSize) { dot.style.width = dotSize; dot.style.height = dotSize; s.size = dotSize; }
    if (s.bg !== c.dotColor) { dot.style.backgroundColor = c.dotColor; s.bg = c.dotColor; }
    if (s.shadow !== shadow) { dot.style.boxShadow = shadow; s.shadow = shadow; }
    if (s.opacity !== opacity) { dot.style.opacity = opacity; s.opacity = opacity; }
    if (s.outline !== outline) { dot.style.outline = outline; s.outline = outline; }
    if (s.distress !== c.distress) {
        if (c.distress) dot.classList.add('distress-map-dot');
        else dot.classList.remove('distress-map-dot');
        s.distress = c.distress;
    }
    if (s.aggregate) { dot.classList.remove('aggregate-map-dot'); s.aggregate = false; }
    // Elevation cue: shift the dot itself by dy and grow its stalk to
    // bridge back to the true flat-plane point (see _applyMapDotStalk).
    const dy = _applyMapDotStalk(dot, s, c.relY, c.dotColor);
    const py2 = Math.round((c.py - dy) * 10) / 10;
    const tf = 'translate(' + c.px + 'px,' + py2 + 'px) translate(-50%,-50%)';
    if (s.tf !== tf) { dot.style.transform = tf; s.tf = tf; }
    if (s.vis !== 'visible') { dot.style.visibility = 'visible'; s.vis = 'visible'; }
    // Raised dots (current target / active lock) sit above a same-cell
    // aggregate; everything else shares the CSS class's base z-index. The
    // actual locked/current target goes one higher still, above every
    // other raised VIP, so its cyan reticle ring never gets edge-clipped
    // by a neighbour's own outline.
    const z = c.mustIndividual ? '6' : (raised ? '5' : '');
    if (s.z !== z) { dot.style.zIndex = z; s.z = z; }
    if (_mapTitleTick) {
        const t = `${c.name} (${c.distance.toFixed(0)} units)`;
        if (s.title !== t) { dot.title = t; s.title = t; }
    }
}

// One dot standing in for every contact bucketed into `cellKey` this
// refresh. Keyed on the CELL, not the members, so the element a crowded
// spot on the radar owns stays stable while its membership churns.
function renderAggregateMapDot(cellKey, group) {
    const dot = mapDotPool.get('agg:' + cellKey);
    const s = dot._s;

    // Dominant category wins colour/size (hostiles outrank neutral traffic
    // outranks scenery); position is the group's centroid.
    let dominant = group[0], sumPx = 0, sumPy = 0, sumRelY = 0, anyDistress = false;
    for (let i = 0; i < group.length; i++) {
        const c = group[i];
        sumPx += c.px; sumPy += c.py; sumRelY += (c.relY || 0);
        if (c.dotPriority > dominant.dotPriority) dominant = c;
        if (c.distress) anyDistress = true;
    }
    const n = group.length;
    const px = Math.round((sumPx / n) * 10) / 10;
    const py = Math.round((sumPy / n) * 10) / 10;
    const meanRelY = sumRelY / n;

    // ── Density encoding ─────────────────────────────────────────────────
    // An aggregate used to be sized/glowed almost independently of how many
    // contacts it stood for: size was clamped to `Math.min(cellPx, ...)`,
    // and cellPx (5-6px for hostiles/objectives) is SMALLER than even the
    // 2-member step of the old growth curve — so the clamp won every time
    // and a 190-ship wolfpack rendered pixel-identical to a 3-ship patrol.
    // Worse, this function never applied renderIndividualMapDot's own
    // salience tier (a lone hostile gets 7-9px + a strong white outline),
    // so BOTH clusters were also less salient than one unclustered enemy.
    // Fixed by starting from the same salience baseline a lone contact of
    // this class would get, then adding count-weighted growth on top —
    // capped in absolute px, decoupled from the bucketing cell's pitch.
    // Dropping that clamp is not a new risk: box-shadow glow already bled
    // past a cell's own footprint before this change (that's what made the
    // glow read as "many" at all), so letting the solid dot grow a
    // comparable, capped amount is the same order of spill already
    // accepted, not a fresh one — and it's what actually makes "190" look
    // bigger than "3" instead of both losing to the min().
    const scaleN = Math.min(n, 199);
    const growth = Math.sqrt(scaleN); // n=3 → ~1.7, n=40 → ~6.3, n=190 → ~13.8

    const isScenery = dominant.dotPriority <= 60;
    const isHostile = dominant.dotPriority >= 90;
    let size, shadow, opacity, outline;

    if (isScenery) {
        // Scenery aggregates stay quiet regardless of n — a huge debris
        // field must never out-ink a real contact just because it's huge.
        size = '3px';
        shadow = 'none';
        opacity = '0.45';
        outline = '';
    } else {
        const baseSize = isHostile ? (dominant.dotPriority >= 110 ? 9 : 7) : (parseFloat(dominant.dotSize) || 4);
        // Hostiles get the most growth headroom (they outrank objectives),
        // capped well short of "blob that swallows the radar" — the
        // tooltip still shows the true member count once it stops growing.
        const maxGrow = isHostile ? 10 : 6;
        size = Math.round(baseSize + Math.min(maxGrow, growth * 1.15)) + 'px';

        // Brightness ramp: blur radius AND the outer halo's alpha both
        // climb with n. Blur alone plateaus too early to read as "hotter"
        // in a flat screenshot average — alpha is what actually raises
        // luminance, so it carries most of the signal for big n.
        const glowPx = Math.round(4 + Math.min(10, growth * 1.3));
        const haloAlpha = Math.min(1, 0.55 + growth * 0.045);
        shadow = '0 0 ' + glowPx + 'px ' + dominant.dotColor +
                 ', 0 0 ' + (glowPx + 6) + 'px ' + _mapStalkRgba(dominant.dotColor, haloAlpha);
        opacity = '1';
        // Same 1px / 90%-white ring a lone salient contact gets at
        // minimum (n=3, the smallest possible aggregate, floors right at
        // that — an aggregate is never quieter than the individual it
        // stands in for), widening only once a cluster is genuinely huge.
        const outlineWidth = 1 + Math.min(2, Math.floor(growth / 4));
        outline = outlineWidth + 'px solid rgba(255,255,255,0.9)';
    }

    if (s.size !== size) { dot.style.width = size; dot.style.height = size; s.size = size; }
    if (s.bg !== dominant.dotColor) { dot.style.backgroundColor = dominant.dotColor; s.bg = dominant.dotColor; }
    if (s.shadow !== shadow) { dot.style.boxShadow = shadow; s.shadow = shadow; }
    // This element may be a recycled node that was, last refresh, a
    // dimmed scenery individual (opacity 0.45) or an outlined hostile
    // (1px white outline) — the salience tier in renderIndividualMapDot.
    // Reset opacity explicitly so a fused-cell aggregate doesn't inherit
    // dimming from whatever this node used to represent.
    if (s.opacity !== opacity) { dot.style.opacity = opacity; s.opacity = opacity; }
    // Scenery clears outline back to '' so the faint constant "many
    // contacts" ring from .aggregate-map-dot's CSS shows through instead;
    // anything salient sets its own scaled inline outline above, which
    // wins over that CSS rule (outline-offset still comes from the class).
    if (s.outline !== outline) { dot.style.outline = outline; s.outline = outline; }
    if (s.distress !== anyDistress) {
        if (anyDistress) dot.classList.add('distress-map-dot');
        else dot.classList.remove('distress-map-dot');
        s.distress = anyDistress;
    }
    if (!s.aggregate) { dot.classList.add('aggregate-map-dot'); s.aggregate = true; }
    // Elevation cue uses the GROUP's mean relY — same stalk treatment as a
    // lone contact, so a crowded cell still tells you roughly how high/low
    // its members sit as a whole.
    const dy = _applyMapDotStalk(dot, s, meanRelY, dominant.dotColor);
    const py2 = Math.round((py - dy) * 10) / 10;
    const tf = 'translate(' + px + 'px,' + py2 + 'px) translate(-50%,-50%)';
    if (s.tf !== tf) { dot.style.transform = tf; s.tf = tf; }
    if (s.vis !== 'visible') { dot.style.visibility = 'visible'; s.vis = 'visible'; }
    if (s.z !== '') { dot.style.zIndex = ''; s.z = ''; }
    if (_mapTitleTick) {
        const t = n + ' contacts (' + (dominant.name || 'mixed') + ' + more)';
        if (s.title !== t) { dot.title = t; s.title = t; }
    }
}

// Ally ▲ glyph for one wingman. Pulled out of the nearbyObjects loop so
// allies can be collected first and rendered later, in priority order,
// against the SAME shared radar budget as everything else (see
// renderClusteredMapDots) — they used to claim an arrow unconditionally,
// with no cap at all, regardless of how much budget hostiles/objectives
// had already spent.
function renderAllyMarker(c) {
    const arrow = mapDotPool.getArrow(c.key);
    const as = arrow._s;
    if (as.color !== c.dotColor) {
        arrow.style.color = c.dotColor;
        arrow.style.filter = 'drop-shadow(0 0 3px ' + c.dotColor + ')';
        as.color = c.dotColor;
    }
    const atf = 'translate(' + c.px + 'px,' + c.py + 'px) translate(-50%,-50%) rotate(' + c.angle + 'rad)';
    if (as.tf !== atf) { arrow.style.transform = atf; as.tf = atf; }
    if (as.vis !== 'visible') { arrow.style.visibility = 'visible'; as.vis = 'visible'; }
    if (_mapTitleTick) {
        const at = (c.name || 'Wingman') + ' (' + c.distance.toFixed(0) + 'u)';
        if (as.title !== at) { arrow.title = at; as.title = at; }
    }
}

// ── Auto radar range (round 2 fix) ───────────────────────────────────────
// A fixed 3000u range put the whole 200-400u dogfight band inside a ~7px
// annulus hugging the player glyph — 5 hostiles spanning a 2:1 range
// spread rendered as a fused rosette glued to the "you" icon. Contract the
// range toward the nearest hostile so the combat band actually uses the
// disc, and relax back to the full 3000u scan once nothing hostile is
// close. Snapped onto a coarse ladder with a dwell timer so the range
// STEPS between states instead of continuously breathing as the nearest
// hostile's distance fluctuates frame to frame.
const RADAR_RANGE_LADDER = [500, 750, 1000, 1500, 3000];
const RADAR_RANGE_DWELL_MS = 2500;

function nearestHostileDistance() {
    if (typeof camera === 'undefined' || typeof enemies === 'undefined') return Infinity;
    let best = Infinity;
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || !e.position || !e.userData || e.userData.health <= 0) continue;
        const d = camera.position.distanceTo(e.position);
        if (d < best) best = d;
    }
    return best;
}

// Hysteretic snap: takes the CURRENT rung so the ladder has separate
// thresholds for stepping out (to a coarser rung) vs stepping in (to a
// finer rung), instead of one boundary tested in both directions. Without
// this a `want` value oscillating a few % around a rung edge (e.g. a
// bandit closing/opening across 227u, right on the old 500/750 split)
// flips the whole-map scale every frame it crosses the line. With it,
// `want` has to clear 1.25x the current rung to widen, or drop under 0.8x
// the rung below current to narrow — a >25%/<20% move, not a rounding
// error.
function _snapRadarRange(want, currentRung) {
    let idx = RADAR_RANGE_LADDER.indexOf(currentRung);
    if (idx === -1) {
        // No known current rung (first call) — plain snap to seed state.
        for (let i = 0; i < RADAR_RANGE_LADDER.length; i++) {
            if (want <= RADAR_RANGE_LADDER[i]) return RADAR_RANGE_LADDER[i];
        }
        return RADAR_RANGE_LADDER[RADAR_RANGE_LADDER.length - 1];
    }
    // Step OUT (coarser) only once want clears 1.25x the current rung.
    while (idx < RADAR_RANGE_LADDER.length - 1 && want > RADAR_RANGE_LADDER[idx] * 1.25) {
        idx++;
    }
    // Step IN (finer) only once want drops under 0.8x the next rung down.
    // Exception: the bottom rung (500) is also `want`'s own hard floor
    // (`_currentRadarRange` clamps with `Math.max(500, ...)` below), so
    // "under 0.8x of 500 = 400" can never be true — that would make the
    // single most important rung for the 200-400u dogfight band
    // permanently unreachable once the state had stepped away from it.
    // Entering the floor rung uses the plain (undiscounted) boundary
    // instead; the 226<->229u flip this fix targets lives entirely on the
    // EXIT side (625u, well clear of the ~500-504u band), so this doesn't
    // reopen it.
    while (idx > 0) {
        const belowRung = RADAR_RANGE_LADDER[idx - 1];
        const threshold = (idx - 1 === 0) ? belowRung : belowRung * 0.8;
        if (want < threshold || (idx - 1 === 0 && want <= belowRung)) {
            idx--;
        } else {
            break;
        }
    }
    return RADAR_RANGE_LADDER[idx];
}

// State lives on the function itself (same pattern as
// updateGalaxyMap._pathDots below) rather than a fresh module-level
// global. Dwell is a MINIMUM TIME BETWEEN CHANGES, not a delay before the
// first reaction — a closing hostile snaps the range in immediately, then
// the range can't flip again for RADAR_RANGE_DWELL_MS.
function _currentRadarRange(nowMs) {
    let st = _currentRadarRange._state;
    if (!st) st = _currentRadarRange._state = { value: 3000, shown: 3000, lastChangeAt: -Infinity };
    const _near = nearestHostileDistance();
    const _want = _near < 900 ? Math.max(500, Math.min(1200, _near * 2.2)) : 3000;
    const snapped = _snapRadarRange(_want, st.value);
    if (snapped !== st.value && (nowMs - st.lastChangeAt) >= RADAR_RANGE_DWELL_MS) {
        st.value = snapped;
        st.lastChangeAt = nowMs;
    }
    // st.value is the TARGET rung (steps instantly, gated by hysteresis +
    // dwell above). st.shown is what actually renders — eased toward the
    // target every refresh instead of jumping, so a rung change slides the
    // scale (and every blip on it) over ~300ms instead of teleporting the
    // whole radar picture in one frame.
    st.shown += (st.value - st.shown) * 0.12;
    return st.shown;
}

function updateGalaxyMap() {
    if (typeof gameState === 'undefined' || typeof camera === 'undefined') return;
    
    const playerMapPos = document.getElementById('playerMapPosition');
    const targetMapPos = document.getElementById('targetMapPosition');
    const mapDirectionArrow = document.getElementById('mapDirectionArrow');
    const universeRadius = 150000;  // Increased for wider map coverage (accommodates exotic/borg systems with larger margins)
    
    if (!playerMapPos) return;
    
    if (gameState.mapView === 'galactic') {
    // ========== GALACTIC VIEW ==========
    // Show nearby targets as dots (radar-style)
    
    // Hide player and ally triangles (allies show as dots in galactic view)
    playerMapPos.style.display = 'none';
    const _zoneLabel = document.getElementById('mapZoneLabel');
    if (_zoneLabel) _zoneLabel.style.display = 'none';
    const _galaxyMap = document.getElementById('galaxyMap');
    // Re-mount the elevation depth bar in THIS view too — it used to only
    // ever get created/shown on the universal (galaxy-scale) branch, so it
    // was permanently absent while flying the radar you actually fly in.
    // Here it's a static px-to-units scale reference (every contact's own
    // elevation is already on the dot via its stalk — see
    // _applyMapDotStalk), so the tick just pins to the centre/"0" line.
    const _depthBar = _ensureMapDepthBar(_galaxyMap);
    if (_depthBar) {
        _depthBar.style.display = 'block';
        const _dTick = document.getElementById('mapDepthTick');
        if (_dTick && _dTick.style.top !== '50%') _dTick.style.top = '50%';
    }
    let _rimLabel = document.getElementById('mapRadarRimLabel');
    if (!_rimLabel && _galaxyMap) {
        _rimLabel = document.createElement('div');
        _rimLabel.id = 'mapRadarRimLabel';
        _rimLabel.style.cssText = 'position:absolute;left:50%;bottom:4%;transform:translateX(-50%);font-size:8px;color:#88ccff;background:rgba(0,0,40,0.7);padding:1px 6px;border-radius:3px;border:1px solid rgba(100,180,255,0.4);pointer-events:none;z-index:10;white-space:nowrap;';
        // Text is set below, every refresh, from the live (auto-ranging)
        // radarRange — compare-and-set so a steady range writes nothing.
        _galaxyMap.appendChild(_rimLabel);
    }
    if (_rimLabel) _rimLabel.style.display = 'block';
    if (_galaxyMap && _universeDecorLive) {
        // NOTE: .galactic-path-dot is intentionally NOT purged here — those
        // dots are POOLED (created once, repositioned/hidden) and refreshed
        // on a throttle, not rebuilt every frame. Destroying them per-frame
        // was ~2-3k DOM create/remove ops per second in demo mode.
        // The nebula dots / path lines only exist while the UNIVERSAL view
        // is up, so this purge runs once on the switch back — not 20x/sec.
        _galaxyMap.querySelectorAll('.universe-nebula-dot, .universe-path-line').forEach(d => d.remove());
        _universeDecorLive = false;
    }
    // The per-ally ▲ markers and galaxy indicators belong to the universal
    // view. Hiding them is a one-shot on the view switch — re-writing
    // display:none onto elements that are already hidden, every refresh,
    // was ~40 pointless style invalidations a second.
    if (!_galacticChromeHidden) {
        _galacticChromeHidden = true;
        for (let _i = 0; _i < 10; _i++) {
            const m = document.getElementById('allyMapMarker' + _i);
            if (m) m.style.display = 'none';
        }
        document.querySelectorAll('.galaxy-indicator').forEach(el => el.style.display = 'none');
        const _sgrHide = document.querySelector('[title="Sagittarius A* - Galactic Center"]');
        if (_sgrHide) _sgrHide.style.display = 'none';
    }
    if (mapDirectionArrow) {
        mapDirectionArrow.style.display = 'block';
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const angle = Math.atan2(forward.x, -forward.z);
        mapDirectionArrow.style.setProperty('--direction', `${angle}rad`);
    }
    
    // Show nearby objects as dots (enemies, planets, etc.)
    const galaxyMap = document.getElementById('galaxyMap');
    // Auto-ranging (round 2 fix): contracts toward the nearest hostile so
    // the 200-400u dogfight band isn't crushed into a sliver around the
    // player glyph, snapped to a ladder + dwell so it steps, not breathes.
    // See _currentRadarRange / nearestHostileDistance above.
    const radarRange = _currentRadarRange(Date.now());
    if (_rimLabel) {
        // Label reads the TARGET rung (st.value), not the eased render
        // scale (st.shown) — so it snaps straight to a clean "500u" /
        // "750u" instead of crawling through fractional values while the
        // disc eases toward it.
        const _rimTarget = Math.round(_currentRadarRange._state.value);
        const _rimText = _rimTarget + 'u / ±ELEV';
        if (_rimLabel.textContent !== _rimText) _rimLabel.textContent = _rimText;
    }

    // Rewind the persistent blip pool for this refresh (no teardown).
    mapDotPool.begin(galaxyMap);
    // Tooltips refresh at ~3 Hz instead of 20 Hz — see _mapTitleTick.
    const _nowTitle = Date.now();
    _mapTitleTick = (_nowTitle - _mapTitleStamp) > 300;
    if (_mapTitleTick) _mapTitleStamp = _nowTitle;

    if (galaxyMap && typeof planets !== 'undefined' && typeof enemies !== 'undefined') {
        // Collect all nearby targetable objects
        const nearbyObjects = [];
        
        // Add nearby planets - OPTIMIZED for asteroids
planets.forEach(planet => {
    if (!planet || !planet.position) return;
    
    // OPTIMIZED: For asteroids, check belt group distance first (much faster)
    if (planet.userData.type === 'asteroid') {
        // Get parent belt group position (already in world space)
        if (!planet.userData.beltGroup || !planet.userData.beltGroup.position) return;
        
        // Quick check: Is the entire belt too far?
        const beltDistance = camera.position.distanceTo(planet.userData.beltGroup.position);
        if (beltDistance > radarRange + 2000) return; // Belt + radius buffer
        
        // Belt is nearby, now get asteroid's world position
        const worldPos = new THREE.Vector3();
        planet.getWorldPosition(worldPos);
        const distance = camera.position.distanceTo(worldPos);
        
        if (distance < radarRange && distance > 10) {
            nearbyObjects.push({
                position: worldPos,
                type: planet.userData.type,
                name: planet.userData.name,
                distance: distance,
                src: planet
            });
        }
    } else {
        // Non-asteroids use direct position (fast)
        const distance = camera.position.distanceTo(planet.position);
        if (distance < radarRange && distance > 10) {
            nearbyObjects.push({
                position: planet.position,
                type: planet.userData.type,
                name: planet.userData.name,
                distance: distance,
                src: planet
            });
        }
    }
});
        
        // Add nearby outer system objects
if (typeof outerInterstellarSystems !== 'undefined') {
    outerInterstellarSystems.forEach(system => {
        if (!system.userData.orbiters) return;

        // Check if system is in radar range
        const systemDistance = camera.position.distanceTo(system.position);
        if (systemDistance < radarRange + 2000) {

            // Add all orbiters from this system
            system.userData.orbiters.forEach(orbiter => {
                // Get world position for nested objects
                const orbiterWorldPos = new THREE.Vector3();
                orbiter.getWorldPosition(orbiterWorldPos);

                const distance = camera.position.distanceTo(orbiterWorldPos);
                if (distance < radarRange) {
                    nearbyObjects.push({
                        position: orbiterWorldPos,
                        type: orbiter.userData.type,
                        name: orbiter.userData.name,
                        distance: distance,
                        isOuterSystem: true,
                        src: orbiter
                    });
                }
            });

            // Add center object
            if (system.userData.centerObject) {
                // Get world position for nested center object
                const centerWorldPos = new THREE.Vector3();
                system.userData.centerObject.getWorldPosition(centerWorldPos);

                const centerDist = camera.position.distanceTo(centerWorldPos);
                if (centerDist < radarRange) {
                    nearbyObjects.push({
                        position: centerWorldPos,
                        type: system.userData.centerType,
                        name: system.userData.name + ' Core',
                        distance: centerDist,
                        isOuterSystem: true,
                        src: system.userData.centerObject
                    });
                }
            }
        }
    });
}

        // Add nearby interstellar asteroids
        if (typeof interstellarAsteroids !== 'undefined') {
            interstellarAsteroids.forEach(asteroid => {
                if (!asteroid || !asteroid.position) return;
                const distance = camera.position.distanceTo(asteroid.position);
                if (distance < radarRange) {
                    nearbyObjects.push({
                        position: asteroid.position,
                        type: 'interstellar_asteroid',
                        name: asteroid.userData.name,
                        distance: distance,
                        src: asteroid
                    });
                }
            });
        }

        // Add nearby enemies
        enemies.forEach(enemy => {
            if (!enemy || !enemy.position || !enemy.userData || enemy.userData.health <= 0) return;
            const distance = camera.position.distanceTo(enemy.position);
            if (distance < radarRange) {
                nearbyObjects.push({
                    position: enemy.position,
                    type: 'enemy',
                    name: enemy.userData.name,
                    distance: distance,
                    isBoss: enemy.userData.isBoss,
                    src: enemy
                });
            }
        });
        
        // Add ally wingmen
        if (typeof allyShips !== 'undefined') {
            allyShips.forEach((ally, idx) => {
                if (!ally || !ally.position || !ally.userData || ally.userData.health <= 0) return;
                const distance = camera.position.distanceTo(ally.position);
                if (distance < radarRange) {
                    nearbyObjects.push({
                        position: ally.position,
                        type: 'ally',
                        name: ally.userData.name,
                        colorStr: ally.userData.colorStr,
                        distance: distance,
                        ship: ally
                    });
                }
            });
        }

        // Add nearby civilian ships (trade/mining vessels)
        if (typeof tradingShips !== 'undefined') {
            tradingShips.forEach(ship => {
                if (!ship || !ship.position || !ship.userData || ship.userData.destroyed) return;
                // Only show if marked as visible on map (within 3000 units)
                if (ship.userData.showOnMap) {
                    const distance = camera.position.distanceTo(ship.position);
                    nearbyObjects.push({
                        position: ship.position,
                        type: 'civilian_ship',
                        name: ship.userData.name || 'Civilian Vessel',
                        distance: distance,
                        underAttack: ship.userData.distressActive || false,
                        src: ship
                    });
                }
            });
        }

        // Add cosmic features (if available)
        if (typeof cosmicFeatures !== 'undefined') {
            // Dyson Spheres
            if (cosmicFeatures.dysonSpheres) {
                cosmicFeatures.dysonSpheres.forEach(sphere => {
                    if (!sphere || !sphere.position || sphere.userData.destroyed) return;
                    const distance = camera.position.distanceTo(sphere.position);
                    if (distance < radarRange) {
                        nearbyObjects.push({
                            position: sphere.position,
                            type: 'dyson_sphere',
                            name: 'Dyson Sphere',
                            distance: distance,
                            src: sphere
                        });
                    }
                });
            }

            // Crystal Structures
            if (cosmicFeatures.crystalStructures) {
                cosmicFeatures.crystalStructures.forEach(crystal => {
                    if (!crystal || !crystal.position || crystal.userData.destroyed) return;
                    const distance = camera.position.distanceTo(crystal.position);
                    if (distance < radarRange) {
                        nearbyObjects.push({
                            position: crystal.position,
                            type: 'crystal_structure',
                            name: 'Crystal Structure',
                            distance: distance,
                            src: crystal
                        });
                    }
                });
            }

            // Space Whales
            if (cosmicFeatures.spaceWhales) {
                cosmicFeatures.spaceWhales.forEach(whale => {
                    if (!whale || !whale.position || whale.userData.destroyed) return;
                    const distance = camera.position.distanceTo(whale.position);
                    if (distance < radarRange) {
                        nearbyObjects.push({
                            position: whale.position,
                            type: 'space_whale',
                            name: 'Space Whale',
                            distance: distance,
                            src: whale
                        });
                    }
                });
            }

            // Ringworlds
            if (cosmicFeatures.ringworlds) {
                cosmicFeatures.ringworlds.forEach(ringworld => {
                    if (!ringworld || !ringworld.position) return;
                    const distance = camera.position.distanceTo(ringworld.position);
                    if (distance < radarRange) {
                        nearbyObjects.push({
                            position: ringworld.position,
                            type: 'ringworld',
                            name: 'Ringworld',
                            distance: distance,
                            src: ringworld
                        });
                    }
                });
            }
        }

        // Display objects as dots on map
        // Candidates collected here, THEN bucketed/rendered below — see
        // renderClusteredMapDots(). Allies are collected into their own
        // array (they never dot-cluster — no aggregate form for a glyph —
        // but still spend from the same shared radar budget).
        const _clusterCandidates = [];
        const _allyCandidates = [];
        nearbyObjects.forEach(obj => {
            // The blip's identity. THREE.Object3D.id is unique and stable
            // for the object's whole life, so the same ship keeps the same
            // DOM element every refresh no matter how the scan order shifts
            // around it. Anything without a mesh falls back to type+name.
            const _src = obj.src || obj.ship;
            const _key = (_src && _src.id !== undefined)
                ? _src.id
                : (obj.type + '|' + obj.name);
            const relativeX = (obj.position.x - camera.position.x) / radarRange;
            const relativeZ = (obj.position.z - camera.position.z) / radarRange;
            // Elevation relative to the player, normalized to the radar
            // range and clamped so a contact far above/below still just
            // pins to a max-length stalk instead of an absurd offset.
            const relativeY = (obj.position.y - camera.position.y) / radarRange;

            const screenX = 50 + relativeX * 50; // Scale to fit map
            const screenZ = 50 + relativeZ * 50;
            
            // Only show if within map bounds
            if (screenX >= 5 && screenX <= 95 && screenZ >= 5 && screenZ <= 95) {
                // 0-100 map coords → pixels inside the radar disc, snapped to
                // 0.1px. Position is ONE transform (no left/top layout pass),
                // and a blip that hasn't visibly moved writes nothing at all.
                const px = Math.round(screenX * mapDotPool.w / 10) / 10;
                const py = Math.round(screenZ * mapDotPool.h / 10) / 10;

                // Color based on type
let dotColor = '#4488ff'; // Default blue for planets
let dotSize = '4px';
// Radar-cell aggregation (below): when a crowded cell collapses to one
// blip, the highest-priority member supplies its colour/size — hostiles
// outrank neutral traffic outranks scenery, so a firefight buried inside
// a debris field still reads red, not beige.
let dotPriority = 20;

if (obj.type === 'ally') {
    // Allies render as arrow markers, not dots — but rendering is deferred
    // to renderClusteredMapDots() now (see _allyCandidates below), so they
    // count against the SAME shared radar budget as everything else
    // instead of claiming a node unconditionally, with no cap, every frame
    // regardless of how much budget hostiles/objectives had already spent.
    // Use the wingman's stored color (Greek-named recruits have distinct hues)
    dotColor = (obj.colorStr) || (obj.name === 'Wingman Alpha' ? '#00ff88' : (obj.name === 'Wingman Beta' ? '#88aaff' : '#ffaa44'));
    // Point the ▲ along the wingman's NOSE (they're clones of the
    // +Z-forward player model) — same screen convention as the player
    // marker: angle = atan2(fwd.x, -fwd.z). Untransformed, the glyph
    // always pointed "north" regardless of heading (read as backwards).
    let _allyAng = 0;
    if (obj.ship && obj.ship.quaternion && _allyMarkerFwd) {
        _allyMarkerFwd.set(0, 0, 1).applyQuaternion(obj.ship.quaternion);
        _allyAng = Math.round(Math.atan2(_allyMarkerFwd.x, -_allyMarkerFwd.z) * 100) / 100;
    }
    _allyCandidates.push({ key: _key, px, py, angle: _allyAng, dotColor, name: obj.name, distance: obj.distance });
    return; // skip normal dot styling below
} else if (obj.type === 'enemy') {
    dotColor = obj.isBoss ? '#ff00ff' : '#ff4444';
    dotSize = obj.isBoss ? '8px' : '6px';
    dotPriority = obj.isBoss ? 110 : 100;
} else if (obj.type === 'civilian_ship') {
    dotColor = obj.underAttack ? '#ffaa00' : '#00ff88';  // Orange if under attack, green otherwise
    dotSize = '5px';
    dotPriority = obj.underAttack ? 90 : 60;
} else if (obj.type === 'blackhole') {
    dotColor = '#000000';
    dotSize = '6px';
    dotPriority = 45;
} else if (obj.type === 'star') {
    dotColor = '#ffff44';
    dotSize = '5px';
    dotPriority = 35;
} else if (obj.type === 'brown_dwarf') {
    dotColor = '#8b4513';
    dotSize = '5px';
    dotPriority = 30;
} else if (obj.type === 'pulsar') {
    dotColor = '#44eeff';
    dotSize = '6px';
    dotPriority = 40;
} else if (obj.type === 'supernova') {
    dotColor = '#ff6600';
    dotSize = '7px';
    dotPriority = 42;
} else if (obj.type === 'plasma_storm') {
    dotColor = '#aa44ff';
    dotSize = '7px';
    dotPriority = 42;
} else if (obj.type === 'solar_storm') {
    dotColor = '#ffff00';
    dotSize = '7px';
    dotPriority = 42;
} else if (obj.type === 'dyson_sphere') {
    dotColor = '#00ffaa';
    dotSize = '8px';
    dotPriority = 50;
} else if (obj.type === 'crystal_structure') {
    dotColor = '#aa00ff';
    dotSize = '7px';
    dotPriority = 50;
} else if (obj.type === 'space_whale') {
    dotColor = '#0088ff';
    dotSize = '9px';
    dotPriority = 50;
} else if (obj.type === 'ringworld') {
    dotColor = '#ffaa00';
    dotSize = '8px';
    dotPriority = 50;
} else if (obj.type === 'interstellar_asteroid') {
    dotColor = '#998877';
    dotSize = '5px';
    dotPriority = 15;
} else if (obj.type === 'asteroid') {
    dotColor = '#887766';
    dotSize = '3px';
    dotPriority = 10;
} else if (obj.type === 'outer_asteroid') {
    dotColor = '#887766';
    dotSize = '3px';
    dotPriority = 10;
} else if (obj.type === 'outer_planet') {
    dotColor = '#6688ff';
    dotSize = '5px';
    dotPriority = 22;
} else if (obj.type === 'borg_drone') {
    dotColor = '#00ff00';
    dotSize = '5px';
    dotPriority = 95;
}

                // Pulse civilians under attack so the distress signal reads
                // distinctly from regular civilian traffic on the map.
                const distress = (obj.type === 'civilian_ship' && obj.underAttack);

                // A contact the player is actively locked onto or has
                // selected as the current target must never disappear into
                // an aggregate — it's the one blip combat depends on
                // reading correctly every single frame.
                const mustIndividual = !!(_src && (
                    _src === gameState.currentTarget ||
                    (gameState.targetLock && gameState.targetLock.active && _src === gameState.targetLock.target)
                ));

                // Defer claiming a dot: bucket first, then render, so a
                // crowded radar cell can collapse to one aggregate blip
                // instead of stacking dozens of nodes on top of each other.
                const relY = Math.max(-1, Math.min(1, relativeY));
                _clusterCandidates.push({
                    key: _key, px, py, relY, dotColor, dotSize, dotPriority, distress,
                    name: obj.name, distance: obj.distance, mustIndividual
                });
            }
        });

        // ── Radar-space decluttering ─────────────────────────────────────
        // A dense clump (asteroid field, debris ring, wreckage after a
        // fight) can drop hundreds of contacts inside a handful of 4-6px
        // cells — that many overlapping DOM nodes reads as one fuzzy smear
        // anyway, and claiming a node per contact was the dominant cost of
        // this function. Bucket candidates by screen-space cell instead: a
        // lightly-occupied cell still renders its members individually
        // (today's look, unchanged); a crowded one collapses to ONE
        // aggregate blip sized/coloured by its contents. The aggregate's
        // pool key is the CELL's coordinates, not its membership, so a
        // contact drifting in or out of an otherwise-stable cell just
        // restyles the same DOM element — no churn, no flicker.
        renderClusteredMapDots(_clusterCandidates, _allyCandidates);
    }
    // Park every blip this refresh didn't claim (visibility only) — also
    // covers the case where the world arrays aren't loaded yet.
    mapDotPool.end();

    // ── Unlocked nebula mission (dotted-line) paths ──────────────────
    // Each discovery path is an UNLOCKED objective and shows on the
    // radar. The in-world line spans tens of thousands of units (far
    // past the 3000u radar) so we sample along start→end and plot the
    // in-range points as small dots in the path's current colour.
    //
    // PERFORMANCE: the dot elements are POOLED (created once, then
    // repositioned/hidden) and only refreshed on a ~6 Hz throttle
    // rather than rebuilt at the map's 20 Hz. Demo mode discovers many
    // paths; the old create/destroy-every-frame approach was ~2-3k DOM
    // ops/sec and a real jitter source. Samples also cut 28 → 14.
    if (galaxyMap && typeof window !== 'undefined') {
        if (!updateGalaxyMap._pathDots) updateGalaxyMap._pathDots = [];
        const pool = updateGalaxyMap._pathDots;
        const nowMs = Date.now();
        if (!updateGalaxyMap._lastPathUpdate ||
            (nowMs - updateGalaxyMap._lastPathUpdate) > 170) {
            updateGalaxyMap._lastPathUpdate = nowMs;
            const SAMPLES = 14;
            const paths = Array.isArray(window.discoveryPaths) ? window.discoveryPaths : [];
            let used = 0;
            for (let pi = 0; pi < paths.length; pi++) {
                const path = paths[pi];
                if (!path || !path.line || !path.line.userData) continue;
                const ud = path.line.userData;
                const a = ud.startPosition, b = ud.endPosition;
                if (!a || !b) continue;
                let colHex = '#7fd5ff';
                try {
                    if (path.line.material && path.line.material.color) {
                        colHex = '#' + path.line.material.color.getHexString();
                    }
                } catch (e) {}
                const complete = !!ud.missionComplete;
                const sizePx = complete ? 3 : 2.5;
                const op = complete ? '0.55' : '0.85';
                for (let s = 0; s <= SAMPLES; s++) {
                    const t = s / SAMPLES;
                    const wx = a.x + (b.x - a.x) * t;
                    const wz = a.z + (b.z - a.z) * t;
                    const sx = 50 + ((wx - camera.position.x) / radarRange) * 50;
                    const sz = 50 + ((wz - camera.position.z) / radarRange) * 50;
                    if (sx < 2 || sx > 98 || sz < 2 || sz > 98) continue;
                    let d = pool[used];
                    if (!d) {
                        d = document.createElement('div');
                        // Shape/position rules live in CSS (.galactic-path-dot)
                        // so a path dot never needs className or cssText again.
                        d.className = 'galactic-path-dot';
                        d._s = { size: '', bg: '', tf: '', op: '', vis: 'hidden' };
                        galaxyMap.appendChild(d);
                        pool[used] = d;
                    }
                    // Same compare-and-set discipline as the blips: one
                    // transform for position, and nothing at all when a
                    // sample landed on the pixel it already occupied.
                    const ps = d._s;
                    const pw = sizePx + 'px';
                    if (ps.size !== pw) { d.style.width = pw; d.style.height = pw; ps.size = pw; }
                    if (ps.bg !== colHex) {
                        d.style.background = colHex;
                        d.style.boxShadow = '0 0 3px ' + colHex;
                        ps.bg = colHex;
                    }
                    const ptf = 'translate(' + (Math.round(sx * mapDotPool.w / 10) / 10) + 'px,' +
                                (Math.round(sz * mapDotPool.h / 10) / 10) + 'px) translate(-50%,-50%)';
                    if (ps.tf !== ptf) { d.style.transform = ptf; ps.tf = ptf; }
                    if (ps.op !== op) { d.style.opacity = op; ps.op = op; }
                    if (ps.vis !== 'visible') { d.style.visibility = 'visible'; ps.vis = 'visible'; }
                    used++;
                }
            }
            for (let k = used; k < pool.length; k++) {
                const pd = pool[k];
                if (pd && pd._s.vis !== 'hidden') { pd.style.visibility = 'hidden'; pd._s.vis = 'hidden'; }
            }
        }
    }

    // Update current target indicator
    if (gameState.currentTarget && targetMapPos) {
        const targetRelativeX = (gameState.currentTarget.position.x - camera.position.x) / radarRange;
        const targetRelativeZ = (gameState.currentTarget.position.z - camera.position.z) / radarRange;
        const targetScreenX = 50 + targetRelativeX * 50;
        const targetScreenZ = 50 + targetRelativeZ * 50;
        
        if (targetScreenX >= 0 && targetScreenX <= 100 && targetScreenZ >= 0 && targetScreenZ <= 100) {
            targetMapPos.style.left = `${targetScreenX}%`;
            targetMapPos.style.top = `${targetScreenZ}%`;
            targetMapPos.classList.remove('hidden');
        } else {
            targetMapPos.classList.add('hidden');
        }
    } else if (targetMapPos) {
        targetMapPos.classList.add('hidden');
    }
        
    } else {
    // ========== UNIVERSAL VIEW ==========

    // Re-arm the galactic view's one-shot chrome hide for the next switch.
    _galacticChromeHidden = false;
    // The radar-range rim label is galactic-view-only chrome (the
    // universal view has its own live mapZoneLabel further down).
    const _rimLabelHide = document.getElementById('mapRadarRimLabel');
    if (_rimLabelHide) _rimLabelHide.style.display = 'none';

    // Hide the pooled galactic-view mission-path dots so they don't
    // linger on the universal map (they're radar-relative).
    if (updateGalaxyMap._pathDots) {
        for (let k = 0; k < updateGalaxyMap._pathDots.length; k++) {
            const pd = updateGalaxyMap._pathDots[k];
            if (pd && pd._s.vis !== 'hidden') { pd.style.visibility = 'hidden'; pd._s.vis = 'hidden'; }
        }
    }

    // Single galaxyMap binding shared across all universal-view rendering
    // (asteroid fields, depth bar, ally markers, nebula dots, paths, zone label).
    // Declared at the top of the else block to avoid TDZ when nested forEachs
    // reference it before later const declarations.
    const galaxyMap = document.getElementById('galaxyMap');

    // Use pooling instead
mapDotPool.releaseAll();
    
    // **DISABLED: Display major cosmic features on map**
    // if (typeof cosmicFeatures !== 'undefined') {
    //     // Function to add cosmic feature dot
    //     const addCosmicFeatureDot = (feature, color, size) => {
    //         if (!feature || !feature.position) return;

    //         const featureMapX = (feature.position.x / universeRadius) + 0.5;
    //         const featureMapZ = (feature.position.z / universeRadius) + 0.5;

    //         // Only show if within map bounds
    //         if (featureMapX >= 0 && featureMapX <= 1 && featureMapZ >= 0 && featureMapZ <= 1) {
    //             const dot = mapDotPool.get('cosmic-feature');
    //             dot.className = 'cosmic-feature-dot absolute';
    //             dot.style.width = size;
    //             dot.style.height = size;
    //             dot.style.backgroundColor = color;
    //             dot.style.borderRadius = '50%';
    //             dot.style.border = `1px solid ${color}`;
    //             dot.style.left = `${featureMapX * 100}%`;
    //             dot.style.top = `${featureMapZ * 100}%`;
    //             dot.style.transform = 'translate(-50%, -50%)';
    //             dot.style.boxShadow = `0 0 8px ${color}`;
    //             dot.style.pointerEvents = 'none';
    //             dot.style.zIndex = '5';
    //             dot.innerHTML = '';
    //             dot.title = feature.userData.name || 'Cosmic Feature';

    //             galaxyMap.appendChild(dot);
    //         }
    //     };

    //     // Add Dyson Spheres (legendary - large purple)
    //     if (cosmicFeatures.dysonSpheres) {
    //         cosmicFeatures.dysonSpheres.forEach(dyson => {
    //             addCosmicFeatureDot(dyson, '#aa44ff', '10px');
    //         });
    //     }

    //     // Add Supernovas (rare - large orange)
    //     if (cosmicFeatures.supernovas) {
    //         cosmicFeatures.supernovas.forEach(supernova => {
    //             addCosmicFeatureDot(supernova, '#ff6600', '9px');
    //         });
    //     }

    //     // Add Pulsars (rare - medium cyan)
    //     if (cosmicFeatures.pulsars) {
    //         cosmicFeatures.pulsars.forEach(pulsar => {
    //             addCosmicFeatureDot(pulsar, '#44eeff', '7px');
    //         });
    //     }

    //     // Add Plasma Storms (rare - medium purple)
    //     if (cosmicFeatures.plasmaStorms) {
    //         cosmicFeatures.plasmaStorms.forEach(storm => {
    //             addCosmicFeatureDot(storm, '#cc44ff', '7px');
    //         });
    //     }

    //     // Add Crystal Formations (rare - medium emerald)
    //     if (cosmicFeatures.crystalFormations) {
    //         cosmicFeatures.crystalFormations.forEach(crystal => {
    //             addCosmicFeatureDot(crystal, '#44ff88', '7px');
    //         });
    //     }
    // }

// DISABLED: Add Nebulas with region names (large, with text labels)
        // if (typeof nebulaClouds !== 'undefined' && nebulaClouds.length > 0) {
        //     nebulaClouds.forEach(nebula => {
        //         if (!nebula || !nebula.position || !nebula.userData) return;
        //
        //         const nebulaMapX = (nebula.position.x / universeRadius) + 0.5;
        //         const nebulaMapZ = (nebula.position.z / universeRadius) + 0.5;
        //
        //         // Only show if within map bounds
        //         if (nebulaMapX >= 0 && nebulaMapX <= 1 && nebulaMapZ >= 0 && nebulaMapZ <= 1) {
        //             const nebulaDot = mapDotPool.get('cosmic-feature');
        //             nebulaDot.className = 'cosmic-feature-dot nebula-indicator absolute';
        //
        //             // Larger size for nebulas
        //             nebulaDot.style.width = '14px';
        //             nebulaDot.style.height = '14px';
        //             nebulaDot.style.backgroundColor = '#' + (nebula.userData.color ? nebula.userData.color.getHexString() : 'ff88cc');
        //             nebulaDot.style.borderRadius = '50%';
        //             nebulaDot.style.border = '2px solid rgba(255, 136, 204, 0.8)';
        //             nebulaDot.style.left = `${nebulaMapX * 100}%`;
        //             nebulaDot.style.top = `${nebulaMapZ * 100}%`;
        //             nebulaDot.style.transform = 'translate(-50%, -50%)';
        //             nebulaDot.style.boxShadow = `0 0 12px ${nebulaDot.style.backgroundColor}`;
        //             nebulaDot.style.pointerEvents = 'none';
        //             nebulaDot.style.zIndex = '6';
        //             nebulaDot.innerHTML = '';
        //             nebulaDot.title = nebula.userData.mythicalName || nebula.userData.name || 'Nebula';
        //
        //             galaxyMap.appendChild(nebulaDot);
        //         }
        //     });
        // }

    // DISABLED: Add Outer Interstellar Systems (28 total: 16 exotic + 12 BORG)
    // if (typeof outerInterstellarSystems !== 'undefined') {
    //     outerInterstellarSystems.forEach(system => {
    //         if (!system || !system.position || !system.userData) return;

    //         const systemMapX = (system.position.x / universeRadius) + 0.5;
    //         const systemMapZ = (system.position.z / universeRadius) + 0.5;

    //         // Only show if within map bounds (outer systems should always be visible)
    //         if (systemMapX >= 0 && systemMapX <= 1 && systemMapZ >= 0 && systemMapZ <= 1) {
    //             const systemDot = mapDotPool.get('cosmic-feature');
    //             systemDot.className = 'cosmic-feature-dot outer-system-indicator absolute';

    //             // Determine color based on system type
    //             let color = '#ffff88';  // Default: bright yellow for unknown systems
    //             let size = '8px';

    //             if (system.userData.centerType === 'supernova') {
    //                 color = '#ff6600';
    //                 size = '10px';
    //             } else if (system.userData.centerType === 'plasma_storm') {
    //                 color = '#aa44ff';
    //                 size = '10px';
    //             } else if (system.userData.centerType === 'solar_storm') {
    //                 color = '#ffff00';
    //                 size = '10px';
    //             } else if (system.userData.hasBorg) {
    //                 // BORG patrol systems
    //                 color = '#00ff00';
    //                 size = '9px';
    //             }

    //             systemDot.style.width = size;
    //             systemDot.style.height = size;
    //             systemDot.style.backgroundColor = color;
    //             systemDot.style.borderRadius = '50%';
    //             systemDot.style.border = `2px solid ${color}`;
    //             systemDot.style.left = `${systemMapX * 100}%`;
    //             systemDot.style.top = `${systemMapZ * 100}%`;
    //             systemDot.style.transform = 'translate(-50%, -50%)';
    //             systemDot.style.boxShadow = `0 0 10px ${color}`;
    //             systemDot.style.pointerEvents = 'none';
    //             systemDot.style.zIndex = '7';  // Above nebulas
    //             systemDot.innerHTML = '';
    //             systemDot.title = system.userData.name + ' - ' + system.userData.location;

    //             galaxyMap.appendChild(systemDot);
    //         }
    //     });
    // }

    // Asteroid fields are intentionally NOT rendered on the universal view —
    // they are short-range navigation hazards better suited to galactic view.

    // Show player triangle, hide direction arrow
    playerMapPos.style.display = 'block';
    if (mapDirectionArrow) {
        mapDirectionArrow.style.display = 'none';
    }
    
    // TOP-DOWN PROJECTION: X axis = map left/right, Z axis = map up/down,
    // Y axis = depth (shown on the depth bar). Much more intuitive than the
    // spherical projection — flying north/south on the X/Z plane moves the
    // marker linearly, and elevation is its own dedicated indicator.
    // FLOATING ORIGIN: the map's fixed features (galaxy dots) live in TRUE
    // coordinates, so every moving marker must be projected in true coords
    // too (current + worldOriginOffset).
    const _woo = (typeof window !== 'undefined' && window.worldOriginOffset) || { x: 0, y: 0, z: 0 };
    const playerX = camera.position.x + _woo.x;
    const playerY = camera.position.y + _woo.y;
    const playerZ = camera.position.z + _woo.z;

    // Linear projection: ±universeRadius maps to 0..100% of the map area
    const projectXZ = (x, z) => ({
        mx: 50 + (x / universeRadius) * 50,
        my: 50 + (z / universeRadius) * 50
    });
    const playerProj = projectXZ(playerX, playerZ);
    const clampedX = Math.max(5, Math.min(95, playerProj.mx));
    const clampedZ = Math.max(5, Math.min(95, playerProj.my));

    playerMapPos.style.left = `${clampedX}%`;
    playerMapPos.style.top = `${clampedZ}%`;

    // 3D depth indicators:
    //   1) scale the player marker by Y elevation (above plane = larger,
    //      below plane = smaller) so depth pops visually
    //   2) maintain a vertical depth bar on the right edge of the map
    const yNorm = Math.max(-1, Math.min(1, playerY / 50000));
    const playerScale = 0.7 + yNorm * 0.6; // 0.1 (deep) to 1.3 (high)
    playerMapPos.style.fontSize = (1.0 + yNorm * 0.4) + 'rem';

    // Vertical depth bar on the right edge of the galaxy map container
    if (galaxyMap) {
        const depthBar = _ensureMapDepthBar(galaxyMap);
        if (depthBar) depthBar.style.display = 'block';
        const tick = document.getElementById('mapDepthTick');
        if (tick) {
            // Tick at 50% = on plane; lower = above plane (positive Y)
            const tickY = 50 - (yNorm * 50);
            tick.style.top = Math.max(0, Math.min(100, tickY)) + '%';
        }
    }

    // Rotate triangle to show direction
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const angle = Math.atan2(forward.x, -forward.z);
    playerMapPos.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;

    // ── Ally wingmen markers (same ▲ shape, in their faction colors) ──
    if (typeof allyShips !== 'undefined') {
        if (galaxyMap) {
            // Create/reuse wingman markers
            allyShips.forEach((ally, idx) => {
                if (!ally || !ally.userData || ally.userData.health <= 0) return;
                let marker = document.getElementById('allyMapMarker' + idx);
                if (!marker) {
                    marker = document.createElement('div');
                    marker.id = 'allyMapMarker' + idx;
                    marker.style.cssText = 'position:absolute;font-size:12px;font-weight:bold;transform:translate(-50%,-50%);pointer-events:none;z-index:3;';
                    marker.textContent = '▲';
                    galaxyMap.appendChild(marker);
                }
                const color = (ally.userData && ally.userData.colorStr) ||
                              (idx === 0 ? '#00ff88' : (idx === 1 ? '#88aaff' : '#ffaa44'));
                marker.style.color = color;
                marker.style.filter = `drop-shadow(0 0 3px ${color})`;
                // Top-down X/Z projection — same as player marker
                const amx = 50 + ((ally.position.x + _woo.x) / universeRadius) * 50;
                const amy = 50 + ((ally.position.z + _woo.z) / universeRadius) * 50;
                marker.style.left = Math.max(5, Math.min(95, amx)) + '%';
                marker.style.top = Math.max(5, Math.min(95, amy)) + '%';
                // Point the ▲ along the wingman's NOSE (they're clones of
                // the +Z-forward player model) — same screen convention as
                // the player marker: angle = atan2(fwd.x, -fwd.z).
                if (ally.quaternion) {
                    _allyMarkerFwd.set(0, 0, 1).applyQuaternion(ally.quaternion);
                    const aAng = Math.atan2(_allyMarkerFwd.x, -_allyMarkerFwd.z);
                    marker.style.transform = `translate(-50%, -50%) rotate(${aAng}rad)`;
                }
                marker.style.display = 'block';
            });
        }
    }

    // ── Render nebulas as colored dots (universe view) ───────────────
    if (galaxyMap && typeof nebulaClouds !== 'undefined') {
        // Clear previous nebula dots
        const oldNebDots = galaxyMap.querySelectorAll('.universe-nebula-dot');
        oldNebDots.forEach(d => d.remove());

        nebulaClouds.forEach((nebula) => {
            if (!nebula || !nebula.position) return;
            // Only show nebulas the player has deep-discovered — undiscovered
            // nebulas should remain hidden so the universe map reflects the
            // player's actual knowledge of charted regions.
            const discovered = nebula.userData && nebula.userData.deepDiscovered;
            if (!discovered) return;
            const nx = 50 + ((nebula.position.x + _woo.x) / universeRadius) * 50;
            const nz = 50 + ((nebula.position.z + _woo.z) / universeRadius) * 50;
            if (nx < 2 || nx > 98 || nz < 2 || nz > 98) return;
            const dot = document.createElement('div');
            dot.className = 'universe-nebula-dot';
            const color = '#88ff88';
            dot.style.cssText = 'position:absolute;width:6px;height:6px;border-radius:50%;background:' + color +
                ';box-shadow:0 0 6px ' + color +
                ';transform:translate(-50%,-50%);pointer-events:none;z-index:4;opacity:0.85;';
            dot.style.left = nx + '%';
            dot.style.top = nz + '%';
            dot.title = (nebula.userData && (nebula.userData.mythicalName || nebula.userData.name)) || 'Nebula';
            galaxyMap.appendChild(dot);
            _universeDecorLive = true;
        });
    }

    // ── Render discovery paths as dashed lines ───────────────────────
    if (galaxyMap && typeof window.discoveryPaths !== 'undefined') {
        const oldPathLines = galaxyMap.querySelectorAll('.universe-path-line');
        oldPathLines.forEach(d => d.remove());

        window.discoveryPaths.forEach(path => {
            if (!path || !path.line || !path.line.userData) return;
            const start = path.line.userData.startPosition;
            const end = path.line.userData.endPosition;
            if (!start || !end) return;
            const x1 = 50 + ((start.x + _woo.x) / universeRadius) * 50;
            const y1 = 50 + ((start.z + _woo.z) / universeRadius) * 50;
            const x2 = 50 + ((end.x + _woo.x) / universeRadius) * 50;
            const y2 = 50 + ((end.z + _woo.z) / universeRadius) * 50;
            const dx = x2 - x1, dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const line = document.createElement('div');
            line.className = 'universe-path-line';
            line.style.cssText = 'position:absolute;height:1px;background:repeating-linear-gradient(to right, rgba(255,200,100,0.7) 0 4px, transparent 4px 8px);transform-origin:0 0;pointer-events:none;z-index:3;';
            line.style.left = x1 + '%';
            line.style.top = y1 + '%';
            line.style.width = len + '%';
            line.style.transform = 'rotate(' + angle + 'deg)';
            galaxyMap.appendChild(line);
            _universeDecorLive = true;
        });
    }

    // ── Current zone label ───────────────────────────────────────────
    // Positioned at the bottom-center of the circular map so it stays inside
    // the visible round area (round-map clips with overflow:hidden).
    let zoneLabel = document.getElementById('mapZoneLabel');
    if (!zoneLabel && galaxyMap) {
        zoneLabel = document.createElement('div');
        zoneLabel.id = 'mapZoneLabel';
        zoneLabel.style.cssText = 'position:absolute;left:50%;bottom:8%;transform:translateX(-50%);font-size:9px;color:#88ccff;background:rgba(0,0,40,0.7);padding:2px 6px;border-radius:3px;border:1px solid rgba(100,180,255,0.4);pointer-events:none;z-index:10;white-space:nowrap;max-width:80%;text-align:center;';
        galaxyMap.appendChild(zoneLabel);
    }
    if (zoneLabel) {
        const dist = Math.sqrt(playerX*playerX + playerY*playerY + playerZ*playerZ);
        let zone = 'Deep Space';
        if (dist < 7000) zone = 'Sol System';
        else if (dist < 25000) zone = 'Outer Sol';
        else if (dist < 60000) zone = 'Interstellar';
        else if (dist < 100000) zone = 'Distant Galaxy';
        else zone = 'Cosmic Edge';
        zoneLabel.textContent = zone + ' · ' + (dist|0) + 'u';
        zoneLabel.style.display = 'block';
    }

    // Show all galaxy indicators
    const galaxyIndicators = document.querySelectorAll('.galaxy-indicator');
    galaxyIndicators.forEach((el, index) => {
        if (index < galaxyTypes.length) {
            // Top-down X/Z projection — convert 3D spherical → cartesian → linear map
            let mapPos;
            if (typeof galaxy3DPositions !== 'undefined' && galaxy3DPositions[index]) {
                const galaxy3D = galaxy3DPositions[index];
                // Spherical → cartesian using full universe radius scale
                const r = galaxy3D.distance * universeRadius;
                const wx = r * Math.sin(galaxy3D.theta) * Math.cos(galaxy3D.phi);
                const wz = r * Math.sin(galaxy3D.theta) * Math.sin(galaxy3D.phi);
                mapPos = {
                    x: 0.5 + (wx / universeRadius) * 0.5,
                    y: 0.5 + (wz / universeRadius) * 0.5
                };
            } else {
                mapPos = galaxyMapPositions[index] || { x: 0.5, y: 0.5 };
            }
            
            el.style.left = `${mapPos.x * 100}%`;
            el.style.top = `${mapPos.y * 100}%`;
            el.style.display = 'flex';
        }
    });
    
    // Show Sagittarius A* at center
    const sgrAEl = document.querySelector('[title="Sagittarius A* - Galactic Center"]');
    if (sgrAEl) {
        sgrAEl.style.left = '50%';
        sgrAEl.style.top = '50%';
        sgrAEl.style.display = 'flex';
    }
    
    // Hide target indicator in universal view
    if (targetMapPos) {
        targetMapPos.classList.add('hidden');
    }
}
    
    // Update view status display
    const viewStatusEl = document.getElementById('mapViewStatus');
    if (viewStatusEl) {
        viewStatusEl.textContent = gameState.mapView === 'galactic' ? 'Galaxy View' : 'Universal View';
    }
    
    // ✅ FIXED: Update current galaxy region display
    const currentRegionEl = document.getElementById('currentGalaxyRegion');
    if (currentRegionEl && typeof galaxyTypes !== 'undefined') {
        // Determine which galaxy the player is currently in
        let currentGalaxyName = 'Sagittarius A'; // ✅ Default to starting location
        
        // First check gameState.location if available
        if (typeof gameState !== 'undefined' && gameState.location) {
            // If we have a location set, use it to determine galaxy
            if (gameState.location.includes('Spiral') || gameState.location.includes('Federation')) {
                currentGalaxyName = 'Spiral Galaxy';
            } else if (gameState.location.includes('Elliptical') || gameState.location.includes('Klingon')) {
                currentGalaxyName = 'Elliptical Galaxy';
            } else if (gameState.location.includes('Irregular') || gameState.location.includes('Rebel')) {
                currentGalaxyName = 'Irregular Galaxy';
            } else if (gameState.location.includes('Ring') || gameState.location.includes('Romulan')) {
                currentGalaxyName = 'Ring Galaxy';
            } else if (gameState.location.includes('Dwarf') || gameState.location.includes('Galactic Empire')) {
                currentGalaxyName = 'Dwarf Galaxy';
            } else if (gameState.location.includes('Lenticular') || gameState.location.includes('Cardassian')) {
                currentGalaxyName = 'Lenticular Galaxy';
            } else if (gameState.location.includes('Quasar') || gameState.location.includes('Sith')) {
                currentGalaxyName = 'Quasar Galaxy';
            } else if (gameState.location.includes('Sagittarius') || gameState.location.includes('Local') || gameState.location.includes('Vulcan') || gameState.location.includes('Sol')) {
                currentGalaxyName = 'Sagittarius A';
            }
        }
        
        // ✅ Fallback: Check proximity to galactic cores (only if we have planets loaded)
        if (typeof planets !== 'undefined' && planets.length > 0) {
            const blackHoles = planets.filter(p => p.userData.type === 'blackhole' && p.userData.isGalacticCore);
            if (blackHoles.length > 0) {
                let closestGalaxyId = -1;
                let closestDistance = Infinity;
                
                blackHoles.forEach(bh => {
                    if (bh.userData.galaxyId !== undefined) {
                        const distance = camera.position.distanceTo(bh.position);
                        if (distance < closestDistance) {
                            closestDistance = distance;
                            closestGalaxyId = bh.userData.galaxyId;
                        }
                    }
                });
                
                // Use galaxy type name for current region
                if (closestGalaxyId >= 0 && closestGalaxyId < galaxyTypes.length) {
                    const galaxyType = galaxyTypes[closestGalaxyId];
                    // Special case for galaxy 7 (Ancient/Local)
                    if (closestGalaxyId === 7) {
                        currentGalaxyName = 'Sagittarius A';
                    } else {
                        currentGalaxyName = `${galaxyType.name} Galaxy`;
                    }
                }
            }
        }
        
        // NEW: Check if player is inside a nebula
        let nebulaName = null;
        if (typeof nebulaClouds !== 'undefined' && nebulaClouds.length > 0) {
            const nebulaDetectionRange = 3000; // Distance to consider "inside" nebula
            
            nebulaClouds.forEach(nebula => {
                if (!nebula || !nebula.userData) return;
                const distance = camera.position.distanceTo(nebula.position);
                
                if (distance < nebulaDetectionRange) {
                    nebulaName = nebula.userData.mythicalName || nebula.userData.name || 'Nebula';
                }
            });
        }
        
        // Display nebula name if inside one, otherwise show galaxy name
        if (nebulaName) {
            currentRegionEl.textContent = `${nebulaName} - ${currentGalaxyName}`;
            currentRegionEl.className = 'text-xs text-pink-300 font-semibold'; // Pink for nebula
        } else {
            currentRegionEl.textContent = currentGalaxyName;
            currentRegionEl.className = 'text-xs text-cyan-300 font-semibold'; // Cyan for galaxy
        }
    }
    
    // ⭐ NEW: Update current galaxy name display
    const currentGalaxyNameEl = document.getElementById('currentGalaxyName');
    if (currentGalaxyNameEl && typeof getCurrentGalaxyName === 'function') {
        const galaxyName = getCurrentGalaxyName();
        currentGalaxyNameEl.textContent = galaxyName;
        
        // Color coding based on galaxy status
        const galaxyId = getCurrentGalaxyId();
        if (galaxyId >= 0 && galaxyId < 8) {
            // Check if galaxy is cleared
            const isCleared = (typeof bossSystem !== 'undefined' && 
                             bossSystem.galaxyBossDefeated && 
                             bossSystem.galaxyBossDefeated[galaxyId]) ||
                            (typeof gameState !== 'undefined' && 
                             gameState.currentGalaxyEnemies && 
                             gameState.currentGalaxyEnemies[galaxyId] === 0);
            
            if (isCleared) {
                currentGalaxyNameEl.className = 'text-green-400'; // Cleared galaxy
            } else {
                currentGalaxyNameEl.className = 'text-red-400'; // Hostile galaxy
            }
        } else {
            // Unexplored space
            currentGalaxyNameEl.className = 'text-cyan-400';
        }
    }
}  // ⭐ This should be the closing brace of updateGalaxyMap()

// =============================================================================
// DISTRESS SIGNAL INDICATOR
// =============================================================================
// Hybrid screen indicator for active civilian distress signals:
//   • Off-screen edge arrow points toward the nearest distressed civilian
//   • On-screen waypoint reticle floats at their projected screen position
//     when they enter the camera frustum
//   • The map dot pulses (handled in updateGalaxyMap via underAttack flag)
// Only the nearest active distress drives the indicator — additional
// distress signals stay map-only to avoid corner-stacking.

const _distressTmpVec = new THREE.Vector3();

function _ensureDistressUI() {
    let arrow = document.getElementById('distressEdgeArrow');
    if (!arrow) {
        arrow = document.createElement('div');
        arrow.id = 'distressEdgeArrow';
        arrow.style.cssText = [
            'position:fixed','left:50%','top:50%',
            'width:64px','height:64px','margin:-32px 0 0 -32px',
            'pointer-events:none','z-index:60','display:none',
            'transform-origin:center center',
            'color:#ffaa00','opacity:0.8',
            'filter:drop-shadow(0 0 8px rgba(255,170,0,0.9))',
            'font-family:monospace','font-size:11px','text-align:center',
            'line-height:1','user-select:none'
        ].join(';');
        arrow.innerHTML =
            '<div style="font-size:48px;line-height:48px">▲</div>' +
            '<div id="distressArrowLabel" style="margin-top:2px;text-shadow:0 0 4px rgba(0,0,0,0.9)">DISTRESS</div>';
        document.body.appendChild(arrow);
    }
    let reticle = document.getElementById('distressReticle');
    if (!reticle) {
        reticle = document.createElement('div');
        reticle.id = 'distressReticle';
        reticle.style.cssText = [
            'position:fixed','left:0','top:0',
            'width:48px','height:48px','margin:-24px 0 0 -24px',
            'pointer-events:none','z-index:60','display:none',
            'border:2px solid #ffaa00','border-radius:50%',
            'box-shadow:0 0 12px rgba(255,170,0,0.8), inset 0 0 8px rgba(255,170,0,0.5)',
            'font-family:monospace','font-size:10px','color:#ffcc66',
            'animation:distressPulse 1s ease-in-out infinite',
            'text-align:center','user-select:none'
        ].join(';');
        reticle.innerHTML = '<div id="distressReticleLabel" style="position:absolute;top:50px;left:50%;transform:translateX(-50%);white-space:nowrap;text-shadow:0 0 4px rgba(0,0,0,0.9);font-weight:bold">SOS</div>';
        document.body.appendChild(reticle);
    }
    if (!document.getElementById('distressIndicatorStyle')) {
        const style = document.createElement('style');
        style.id = 'distressIndicatorStyle';
        style.textContent =
            // Pulse peaks at 0.8 — SOS indicators sit at 80% opacity max
            '@keyframes distressPulse { 0%,100% { transform:scale(1); opacity:0.65 } 50% { transform:scale(1.18); opacity:0.8 } }' +
            '.distress-map-dot { animation: distressPulse 0.8s ease-in-out infinite }';
        document.head.appendChild(style);
    }
    return { arrow, reticle };
}

function updateDistressIndicator() {
    if (typeof tradingShips === 'undefined' || typeof camera === 'undefined') return;
    const { arrow, reticle } = _ensureDistressUI();

    // Pick the nearest active distress signal — that's what the on-screen
    // pointer will track. Other distresses still appear on the map.
    // SOS signals have a MAXIMUM RANGE (shared with the detection toast in
    // civilian-combat.js): a ship under attack across the universe must not
    // drive a permanent DISTRESS arrow.
    const _sosRange = (typeof window !== 'undefined' && window.DISTRESS_DETECTION_RANGE) || 5000;
    let nearest = null;
    let nearestDist = Infinity;
    const camPos = camera.position;
    for (let i = 0; i < tradingShips.length; i++) {
        const s = tradingShips[i];
        if (!s || !s.userData || s.userData.destroyed) continue;
        if (!s.userData.distressActive) continue;
        const d = camPos.distanceTo(s.position);
        if (d > _sosRange) continue;
        if (d < nearestDist) { nearestDist = d; nearest = s; }
    }
    if (!nearest) {
        arrow.style.display = 'none';
        reticle.style.display = 'none';
        return;
    }

    // Project to clip space — w<=0 means behind the camera
    _distressTmpVec.copy(nearest.position).project(camera);
    const w = _distressTmpVec.z; // already in [-1,1] post-projection (z is depth)
    const inFront = (() => {
        // A reliable behind-camera check: dot(forward, target-cam) > 0
        const fwd = new THREE.Vector3();
        camera.getWorldDirection(fwd);
        const toTarget = new THREE.Vector3().subVectors(nearest.position, camPos);
        return fwd.dot(toTarget) > 0;
    })();
    const onScreen = inFront &&
        _distressTmpVec.x > -1 && _distressTmpVec.x < 1 &&
        _distressTmpVec.y > -1 && _distressTmpVec.y < 1;

    const distLabel = nearestDist < 1000
        ? Math.round(nearestDist) + 'u'
        : (nearestDist / 1000).toFixed(1) + 'k u';

    if (onScreen) {
        // Show the pulsing reticle at the projected screen position
        const sx = (_distressTmpVec.x * 0.5 + 0.5) * window.innerWidth;
        const sy = (-_distressTmpVec.y * 0.5 + 0.5) * window.innerHeight;
        reticle.style.left = sx + 'px';
        reticle.style.top = sy + 'px';
        reticle.style.display = 'block';
        const lbl = document.getElementById('distressReticleLabel');
        if (lbl) lbl.textContent = 'SOS · ' + distLabel;
        arrow.style.display = 'none';
    } else {
        // Off-screen — show the edge arrow rotated toward the target.
        // Compute a 2D direction from screen center, clamped to a margin
        // ellipse so the arrow rides the edge nicely.
        let dx, dy;
        if (inFront) {
            dx = _distressTmpVec.x;
            dy = -_distressTmpVec.y;
        } else {
            // Behind camera — flip into a clamped offscreen direction.
            // Use the camera-local right/up vectors to compute a 2D direction.
            const fwd = new THREE.Vector3();
            camera.getWorldDirection(fwd);
            const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0,1,0)).normalize();
            const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
            const toTarget = new THREE.Vector3().subVectors(nearest.position, camPos);
            dx = toTarget.dot(right);
            dy = -toTarget.dot(up);
            const m = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
            dx /= m; dy /= m;
        }
        const halfW = window.innerWidth * 0.5;
        const halfH = window.innerHeight * 0.5;
        const marginX = Math.min(halfW - 60, 0.42 * window.innerWidth);
        const marginY = Math.min(halfH - 60, 0.42 * window.innerHeight);
        // Scale (dx,dy) so it touches the margin rectangle
        const sx = marginX / Math.max(Math.abs(dx) || 1e-3, 1e-3);
        const sy = marginY / Math.max(Math.abs(dy) || 1e-3, 1e-3);
        const scale = Math.min(sx, sy);
        const px = halfW + dx * scale;
        const py = halfH + dy * scale;
        const angleRad = Math.atan2(dy, dx) + Math.PI / 2; // ▲ points up by default
        arrow.style.left = px + 'px';
        arrow.style.top = py + 'px';
        arrow.style.transform = 'rotate(' + angleRad + 'rad)';
        arrow.style.display = 'block';
        const lbl = document.getElementById('distressArrowLabel');
        if (lbl) lbl.textContent = 'SOS · ' + distLabel;
        reticle.style.display = 'none';
    }
}

if (typeof window !== 'undefined') {
    window.updateDistressIndicator = updateDistressIndicator;
}

// =============================================================================
// ORBIT LINES VISIBILITY CONTROL - INTEGRATED WITH CORE SYSTEM
// =============================================================================

function updateOrbitLinesButton() {
    const toggleOrbitsBtn = document.getElementById('toggleOrbitsBtn');
    if (!toggleOrbitsBtn) return;
    
    // Get orbit lines visibility from the core system
    const orbitsVisible = (typeof orbitLinesVisible !== 'undefined') ? orbitLinesVisible : true;
    
    toggleOrbitsBtn.innerHTML = `<i class="fas fa-circle-notch mr-1"></i>Orbits ${orbitsVisible ? 'ON' : 'OFF'}`;
    toggleOrbitsBtn.classList.toggle('active', orbitsVisible);
    
    // Update button click handler to use the core system function
    toggleOrbitsBtn.onclick = () => {
        if (typeof toggleOrbitLines === 'function') {
            const newState = toggleOrbitLines();
            toggleOrbitsBtn.innerHTML = `<i class="fas fa-circle-notch mr-1"></i>Orbits ${newState ? 'ON' : 'OFF'}`;
            toggleOrbitsBtn.classList.toggle('active', newState);
        }
    };
}

// =============================================================================
// WARP STATUS AND SLINGSHOT SYSTEM - UI INTEGRATION
// =============================================================================

function updateWarpButton() {
    const warpBtn = document.getElementById('warpBtn');
    if (!warpBtn || typeof gameState === 'undefined') return;
    
    // Check for nearby planets for slingshot availability (range scales with planet size)
    let nearestAssistPlanet = null;
    let nearestAssistDistance = Infinity;

    if (typeof activePlanets !== 'undefined' && typeof camera !== 'undefined') {
        activePlanets.forEach(planet => {
            const distance = camera.position.distanceTo(planet.position);
            const radius = planet.geometry ? planet.geometry.parameters.radius : 5;
            const slingshotRange = Math.max(60, radius + 25);
            if (distance < slingshotRange && distance < nearestAssistDistance) {
                nearestAssistPlanet = planet;
                nearestAssistDistance = distance;
            }
        });
    }
    
    // Update warp button based on slingshot availability
    if (nearestAssistPlanet && gameState.energy >= 20 && (!gameState.slingshot || !gameState.slingshot.active)) {
        warpBtn.disabled = false;
        warpBtn.classList.add('space-btn', 'pulse');
        // Show the launch destination: locked nav target wins, else "your aim"
        const _whipDest = (gameState.currentTarget && gameState.currentTarget.userData &&
                           gameState.currentTarget.userData.name)
            ? gameState.currentTarget.userData.name : 'your aim';
        warpBtn.innerHTML = `<i class="fas fa-rocket mr-2"></i>GRAVITY WHIP READY - ENTER (${nearestAssistPlanet.userData.name} → ${_whipDest})`;
        
        if (!warpBtn.classList.contains('assist-ready')) {
            warpBtn.classList.add('assist-ready');
        }
    } else {
        warpBtn.disabled = true;
        warpBtn.classList.remove('space-btn', 'pulse', 'assist-ready');
        if (gameState.slingshot && gameState.slingshot.active) {
            const timeLeft = (gameState.slingshot.timeRemaining / 1000).toFixed(1);
            warpBtn.innerHTML = `<i class="fas fa-rocket mr-2"></i>SLINGSHOT ACTIVE - ${timeLeft}s`;
        } else {
            warpBtn.innerHTML = `<i class="fas fa-search mr-2"></i>Searching for gravitational assist...`;
        }
    }
}

// =============================================================================
// EVENT HORIZON AND BLACK HOLE WARNING SYSTEM
// =============================================================================

function updateEventHorizonWarnings() {
    const eventHorizonWarning = _uiEl('eventHorizonWarning');
    const blackHoleWarningHUD = _uiEl('blackHoleWarningHUD');
    const blackHoleDistanceHUD = _uiEl('blackHoleDistanceHUD');
    const gameTitle = _uiEl('gameTitle');

    if (typeof gameState === 'undefined' || !gameState.eventHorizonWarning) return;

    const ehw = gameState.eventHorizonWarning;

    // Self-validate every frame regardless of what the gravity loop did.
    // Several scenarios leave the warning stuck (e.g. player warps to
    // another galaxy and the tracked black hole is no longer in the
    // active-planets iteration).  Clear the flag if ANY of these hold:
    //   • active is set but blackHole reference is null
    //   • blackHole is no longer in the scene (parent === null)
    //   • blackHole userData lost its type
    //   • world-space distance from camera exceeds warningDistance
    if (ehw.active) {
        const bh = ehw.blackHole;
        const warningDistance = ehw.warningDistance || 400;

        let shouldClear = false;
        if (!bh) {
            shouldClear = true;
        } else if (!bh.parent || !bh.userData || bh.userData.type !== 'blackhole') {
            shouldClear = true;
        } else if (typeof camera !== 'undefined' && _ehwTmpVec) {
            bh.getWorldPosition(_ehwTmpVec);
            const distance = camera.position.distanceTo(_ehwTmpVec);
            if (distance > warningDistance) shouldClear = true;
        }

        if (shouldClear) {
            ehw.active = false;
            ehw.blackHole = null;
            // Immediately hide the DOM so there's no one-frame delay
            if (eventHorizonWarning) eventHorizonWarning.classList.add('hidden');
            if (blackHoleWarningHUD) blackHoleWarningHUD.classList.add('hidden');
            if (gameTitle) gameTitle.classList.remove('title-flash');
        }
    }

    if (ehw.active && ehw.blackHole) {
        const blackHole = ehw.blackHole;

        // Old centered "EVENT HORIZON APPROACHING" emoji panel is retired — the
        // amber flashEventText on approach replaces it. Keep it hidden; the HUD
        // readout + title-flash below remain the persistent proximity cues.
        if (eventHorizonWarning) eventHorizonWarning.classList.add('hidden');

        if (blackHoleWarningHUD && blackHoleDistanceHUD && typeof camera !== 'undefined') {
            blackHoleWarningHUD.classList.remove('hidden');
            const distance = camera.position.distanceTo(blackHole.position);
            blackHoleDistanceHUD.textContent = `Distance: ${distance.toFixed(1)} units`;
        }

        if (gameTitle) gameTitle.classList.add('title-flash');
    } else {
        if (eventHorizonWarning) eventHorizonWarning.classList.add('hidden');
        if (blackHoleWarningHUD) blackHoleWarningHUD.classList.add('hidden');
        if (gameTitle) gameTitle.classList.remove('title-flash');
    }
}

// =============================================================================
// GAME STATE AND VICTORY CONDITIONS
// =============================================================================

function checkVictoryCondition() {
    if (typeof gameState === 'undefined' || typeof galaxyTypes === 'undefined') return false;
    
    // Check if all galaxies are cleared
    if (gameState.galaxiesCleared >= 8) {
        showVictoryScreen();
        return true;
    }
    
    return false;
}

function showVictoryScreen() {
    if (typeof gameState !== 'undefined') {
        gameState.gameOver = true;
        gameState.gameStarted = false;
    }
    
    // Stop all music
    if (typeof musicSystem !== 'undefined') {
        if (musicSystem.backgroundMusic) {
            musicSystem.backgroundMusic.stop();
            musicSystem.backgroundMusic = null;
        }
        if (musicSystem.battleMusic) {
            musicSystem.battleMusic.stop();
            musicSystem.battleMusic = null;
        }
    }
    
    // Create victory overlay
    const victoryOverlay = document.createElement('div');
    victoryOverlay.className = 'absolute inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 cyberpunk-bg';
    victoryOverlay.style.cursor = 'auto';
    victoryOverlay.innerHTML = `
        <div class="text-center ui-panel rounded-lg p-8" style="cursor: auto;">
            <div class="text-6xl mb-4">🏆</div>
            <h1 class="text-4xl font-bold text-green-400 mb-4 glow-text cyber-title">VICTORY!</h1>
            <p class="text-gray-300 mb-6">All hostile forces have been eliminated! The universe is safe!</p>
            <div class="space-y-4">
                <div class="text-lg text-cyan-400 glow-text">Mission Complete Statistics:</div>
                <div class="text-sm text-gray-300 space-y-1">
                    <div>Distance Traveled: ${gameState ? gameState.distance.toFixed(1) : '0'} light years</div>
                    <div>Final Velocity: ${gameState ? (gameState.velocity * 1000).toFixed(0) : '0'} km/s</div>
                    <div>Energy Remaining: ${gameState ? gameState.energy.toFixed(0) : '100'}%</div>
                    <div>Hull Integrity: ${gameState ? gameState.hull.toFixed(0) : '100'}%</div>
                    <div>All Galaxies Liberated: 8/8</div>
                    <div>Emergency Warps: ${gameState ? `${gameState.emergencyWarp.available}/${gameState.emergencyWarp.maxWarps}` : '1/10'}</div>
                </div>
                <button onclick="location.reload()" class="mt-6 space-btn rounded px-6 py-3" style="cursor: pointer;">
                    <i class="fas fa-redo mr-2"></i>New Mission
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(victoryOverlay);
    
    // Make mouse visible
    document.body.style.cursor = 'auto';
    victoryOverlay.style.pointerEvents = 'all';
    
    // Play victory music
    if (typeof playVictoryMusic === 'function') {
        playVictoryMusic();
    }
}

function gameOver(reason) {
    // Delegate to the main game over screen with full inline styles
    showGameOverScreen('MISSION FAILED', reason || 'Ship destroyed');
}

// HULL ZERO GAME OVER - Dramatic full screen explosion effect
function showGameOverScreen(title, message) {
    // Prevent duplicate game over screens
    if (typeof gameState !== 'undefined') {
        if (gameState.gameOverScreenShown) {
            console.log('⚠️ Game over screen already shown, ignoring duplicate call');
            return;
        }
        gameState.gameOver = true;
        gameState.gameStarted = false;
        gameState.gameOverScreenShown = true;
    }

    console.log('💀 GAME OVER - Stopping all systems');

    // Stop all music
    if (typeof musicSystem !== 'undefined') {
        if (musicSystem.backgroundMusic) {
            musicSystem.backgroundMusic.stop();
            musicSystem.backgroundMusic = null;
        }
        if (musicSystem.battleMusic) {
            musicSystem.battleMusic.stop();
            musicSystem.battleMusic = null;
        }
    }

    if (typeof soundtrack !== 'undefined') {
        soundtrack.stopAll();
        soundtrack.forceTrack(Math.random() < 0.5 ? 'gameOver1' : 'gameOver2');
    }

    if (typeof audioContext !== 'undefined' && audioContext) {
        audioContext.suspend();
    }

    if (typeof cleanupEventHorizonEffects === 'function') {
        cleanupEventHorizonEffects();
    }

    if (typeof clearAllGameIntervals === 'function') clearAllGameIntervals();

    // Remove any existing game over screen first
    const existing = document.getElementById('gameOverScreen');
    if (existing) existing.remove();

    const isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || window.innerWidth < 768;

    const gameOverOverlay = document.createElement('div');
    gameOverOverlay.id = 'gameOverScreen';
    gameOverOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.97);display:flex;align-items:center;justify-content:center;cursor:auto;z-index:99999;pointer-events:auto;';

    if (isMobile) {
        // Mobile: 100% inline styles so it renders even if Tailwind fails
        const dist = gameState ? gameState.distance.toFixed(1) : '0';
        const vel = gameState ? (gameState.velocity * 1000).toFixed(0) : '0';
        const nrg = gameState ? gameState.energy.toFixed(0) : '0';
        const hull = gameState ? gameState.hull.toFixed(0) : '0';
        const gal = gameState ? gameState.galaxiesCleared : 0;
        const warps = gameState ? gameState.emergencyWarp.available : '0';

        // Mobile uses fully inline styles (so it renders even if the
        // Tailwind CDN fails) but now mirrors the DESKTOP look exactly:
        // Orbitron cyber-title, the blue glow-text shadow, ui-panel
        // gradient/border, cyan "Final Stats", and a space-btn button.
        const _glow = '0 0 8px rgba(0,150,255,0.9),0 0 16px rgba(0,150,255,0.7),0 0 24px rgba(0,150,255,0.5)';
        gameOverOverlay.innerHTML = `
            <div style="text-align:center;max-width:90vw;max-height:90vh;overflow-y:auto;
                        background:linear-gradient(135deg,rgba(15,23,42,0.97) 0%,rgba(30,41,59,0.97) 100%);
                        border:1px solid rgba(0,150,255,0.5);border-radius:12px;padding:24px;
                        box-shadow:0 12px 40px rgba(0,150,255,0.3),inset 0 1px 0 rgba(0,150,255,0.4);
                        color:#fff;font-family:'Rajdhani',sans-serif;">
                <h1 style="font-family:'Orbitron',monospace;font-weight:900;letter-spacing:3px;
                           font-size:2.25rem;color:#f87171;margin:0 0 16px;text-shadow:${_glow};">MISSION FAILED</h1>
                <p style="color:#d1d5db;margin:0 0 24px;font-size:1rem;">${message || 'Ship destroyed'}</p>
                <div style="font-family:'Orbitron',monospace;letter-spacing:2px;color:#22d3ee;
                            font-size:1.125rem;margin-bottom:12px;text-shadow:${_glow};">Final Stats:</div>
                <div style="color:#d1d5db;font-size:0.9rem;line-height:1.85;">
                    <div>Distance Traveled: ${dist} light years</div>
                    <div>Final Velocity: ${vel} km/s</div>
                    <div>Energy Remaining: ${nrg}%</div>
                    <div>Hull Integrity: ${hull}%</div>
                    <div>Galaxies Cleared: ${gal}/8</div>
                    <div>Emergency Warps Remaining: ${warps}</div>
                </div>
                <button id="gameOverRestartBtn" style="margin-top:24px;padding:14px 28px;font-size:1rem;
                        font-weight:700;font-family:'Orbitron',monospace;letter-spacing:1px;
                        color:rgba(0,255,255,0.95);
                        background:linear-gradient(135deg,rgba(0,150,255,0.25),rgba(0,100,200,0.35));
                        border:1px solid rgba(0,150,255,0.6);border-radius:8px;
                        box-shadow:0 4px 15px rgba(0,150,255,0.25),inset 0 1px 0 rgba(0,150,255,0.3);
                        min-height:52px;width:100%;max-width:280px;">
                    Restart Mission
                </button>
            </div>
        `;
    } else {
        // Desktop: original Tailwind-styled version with cyber-title glow
        gameOverOverlay.innerHTML = `
            <div class="text-center ui-panel rounded-lg p-6" style="cursor:auto;max-width:90vw;max-height:90vh;overflow-y:auto;background:rgba(10,15,30,0.98);border:1px solid rgba(0,150,255,0.5);border-radius:12px;padding:24px;">
                <h1 class="text-4xl font-bold text-red-400 mb-4 glow-text cyber-title">MISSION FAILED</h1>
                <p class="text-gray-300 mb-6">${message || 'Ship destroyed'}</p>
                <div class="space-y-4">
                    <div class="text-lg text-cyan-400 glow-text">Final Stats:</div>
                    <div class="text-sm text-gray-300 space-y-1">
                        <div>Distance Traveled: ${gameState ? gameState.distance.toFixed(1) : '0'} light years</div>
                        <div>Final Velocity: ${gameState ? (gameState.velocity * 1000).toFixed(0) : '0'} km/s</div>
                        <div>Energy Remaining: ${gameState ? gameState.energy.toFixed(0) : '0'}%</div>
                        <div>Hull Integrity: ${gameState ? gameState.hull.toFixed(0) : '0'}%</div>
                        <div>Galaxies Cleared: ${gameState ? gameState.galaxiesCleared : 0}/8</div>
                        <div>Emergency Warps Remaining: ${gameState ? gameState.emergencyWarp.available : '0'}</div>
                    </div>
                    <button id="gameOverRestartBtn" class="mt-6 space-btn rounded px-6 py-3" style="cursor:pointer;min-height:48px;">
                        <i class="fas fa-redo mr-2"></i>Restart Mission
                    </button>
                </div>
            </div>
        `;
    }

    document.body.appendChild(gameOverOverlay);
    document.body.style.cursor = 'auto';

    // Disable canvas so taps/clicks reach the overlay
    const _goCanvas = document.getElementById('gameCanvas');
    if (_goCanvas) _goCanvas.style.pointerEvents = 'none';

    // Restart button — handle both click and touch
    const _goBtn = document.getElementById('gameOverRestartBtn');
    if (_goBtn) {
        _goBtn.addEventListener('click', function() { location.reload(); });
        _goBtn.addEventListener('touchend', function(e) { e.preventDefault(); location.reload(); });
    }

    console.log('✅ Game over screen displayed - all systems stopped');
}

// The four corner panels + title header — the always-on desktop HUD chrome
// that would otherwise sit fully opaque over the slingshot/emergency-warp
// spectacle. Queried once and cached; mobile hides these via CSS entirely
// (`.ui-panel { display:none }` under the mobile media query) so toggling
// a class on them there is a harmless no-op.
let _hudSpectaclePanels = null;
function _hudSpectacleGetPanels() {
    if (!_hudSpectaclePanels) {
        _hudSpectaclePanels = Array.prototype.slice.call(document.querySelectorAll(
            '.ui-panel.title-header, .ui-panel.top-left, .ui-panel.bottom-left, .ui-panel.top-right, .ui-panel.bottom-right'
        ));
    }
    return _hudSpectaclePanels;
}

// Continuous 0..1 "how hard is the moment asking the chrome to get out of
// the way" factor, smoothed frame-to-frame. Written to the --hud-yield CSS
// var (css/styles.css: `.ui-panel { opacity: calc(1 - 0.6*var(--hud-yield)) }`)
// instead of flipping a binary dim class, so a 45s boost hold reads as a
// continuous fade instead of never moving at all.
let _hudYield = 0;
let _hudYieldLastT = null;
// Last-committed state of the binary geometric-yield class (below) so the
// per-frame loop only ever touches classList on an actual transition, not
// every single frame.
let _hudGeoYieldLast = false;

// Binary "is this exact frame a full slingshot/emergency-warp spectacle"
// check — the single source of truth shared by the geometric panel yield
// below (css/styles.css `:root.hud-geo-yield`) and by the world-anchored
// target-layer tag dimming (updateTargetLayer), so the two effects can
// never drift out of sync with two separate copies of this condition.
function _hudSpectacleActive() {
    if (typeof gameState === 'undefined') return false;
    return !!((gameState.slingshot && gameState.slingshot.active) ||
               (gameState.emergencyWarp && gameState.emergencyWarp.active));
}
if (typeof window !== 'undefined') {
    window._hudSpectacleActive = _hudSpectacleActive;
}

// Slingshot charge/release and emergency warp are full-spectacle set pieces
// — pin straight to 1 the instant they're active. Boost is continuous:
// speedRatio climbs toward 1 as gameState.velocityVector approaches
// maxVelocity over the whole hold, so the chrome yields exactly as fast as
// the ship actually feels fast, plus a small immediate nudge the moment the
// B key goes down so the very first frame of a boost isn't visually inert
// while thrust is still ramping up.
function _hudComputeSpectacleTarget() {
    if (typeof gameState === 'undefined') return 0;
    let target = _hudSpectacleActive() ? 1 : 0;

    const v = gameState.velocityVector ? gameState.velocityVector.length() :
              (gameState.velocity || 0);
    const maxV = gameState.maxVelocity || 4.0;
    if (maxV > 0) {
        const speedRatio = Math.max(0, Math.min(1, v / maxV));
        // Only start yielding chrome once the ship is meaningfully fast
        // (30% of top speed) so ordinary cruising never dims the HUD.
        const boostSpectacle = Math.max(0, (speedRatio - 0.3) / 0.7);
        target = Math.max(target, boostSpectacle);
    }

    if (typeof keys !== 'undefined' && keys.b) {
        target = Math.max(target, 0.2);
    }

    return target;
}

// Ease the HUD panel chrome down toward that target while the slingshot,
// emergency-warp, or a sustained boost hold makes the ship the show instead
// of the readouts, and straight back to fully readable the instant every
// contributor drops to zero. The JS-side critically-damped lerp (not a
// plain CSS class transition) is what makes this continuous rather than
// binary — it settles in ~0.3-0.4s but tracks a moving target the whole
// time, so it keeps easing for as long as velocity keeps climbing.
function updateHudSpectacleDim() {
    if (typeof gameState === 'undefined') return;

    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const dt = (_hudYieldLastT === null) ? 0 : Math.min(0.25, (now - _hudYieldLastT) / 1000);
    _hudYieldLastT = now;

    const target = _hudComputeSpectacleTarget();
    const rate = 4.5; // ~0.3-0.4s to settle — responsive, never a hard cut
    _hudYield += (target - _hudYield) * Math.min(1, dt * rate);
    if (Math.abs(target - _hudYield) < 0.002) _hudYield = target;
    _hudYield = Math.max(0, Math.min(1, _hudYield));

    if (document.documentElement) {
        document.documentElement.style.setProperty('--hud-yield', _hudYield.toFixed(3));
    }

    // Geometric yield — binary, not eased in JS. The slingshot/emergency-
    // warp spectacle itself is a hard on/off event (gameState.slingshot
    // .active, gameState.emergencyWarp.active), so the class toggle IS the
    // trigger; the slide/scale/collapse easing lives entirely in CSS via
    // `.ui-panel`'s own 250ms `transition: transform` (css/styles.css
    // `:root.hud-geo-yield`), which is what actually produces the "panels
    // slide toward their screen edge" motion on both entry and restore.
    const _geoYieldOn = _hudSpectacleActive();
    if (_geoYieldOn !== _hudGeoYieldLast) {
        _hudGeoYieldLast = _geoYieldOn;
        if (document.documentElement) {
            document.documentElement.classList.toggle('hud-geo-yield', _geoYieldOn);
        }
        // The panels are about to translate off (or back on) screen over
        // 250ms — the target layer's cached panel AABBs are stale for the
        // duration, so drop them and let the next frame re-measure once.
        if (typeof _tlInvalidatePanelBoxes === 'function') _tlInvalidatePanelBoxes();
    }

    _updateFlightControlsCollapse();
}
if (typeof window !== 'undefined') {
    window.updateHudSpectacleDim = updateHudSpectacleDim;
}

// Flight Controls (top-left) auto-collapse — the 13-line keybind
// cheat-sheet is only useful for the first few seconds of a run; left up
// permanently it eats ~1/5 of the viewport for the rest of the flight,
// including straight through the boost/slingshot money shots the yield
// system above is easing everything else for. ~8s after gameState.gameStarted
// flips true, collapse the title + key list to a one-line "? for controls"
// hint (css/styles.css .controls-collapsed); the Music/SFX/Pause button row
// is left alone since those are live controls, not reference text. Either
// the hint or the title toggles it back, and a manual toggle permanently
// opts the player out of further auto-collapsing this run.
let _hudControlsPanel = null;
let _hudControlsHintEl = null;
let _hudControlsLaunchT = null;
let _hudControlsManual = false;

function _updateFlightControlsCollapse() {
    if (!_hudControlsPanel) {
        _hudControlsPanel = document.querySelector('.ui-panel.top-left');
        if (!_hudControlsPanel) return;

        const title = _hudControlsPanel.querySelector('h3.cyber-title');
        _hudControlsHintEl = document.createElement('div');
        _hudControlsHintEl.className = 'hud-controls-hint';
        _hudControlsHintEl.textContent = '? for controls';
        _hudControlsHintEl.title = 'Click to show flight controls';
        _hudControlsPanel.insertBefore(_hudControlsHintEl, _hudControlsPanel.firstChild);

        const collapse = () => {
            _hudControlsManual = true;
            _hudControlsPanel.classList.add('controls-collapsed');
        };
        const expand = () => {
            _hudControlsManual = true;
            _hudControlsPanel.classList.remove('controls-collapsed');
        };
        _hudControlsHintEl.addEventListener('click', expand);
        if (title) {
            title.addEventListener('click', collapse);
        }
    }

    if (typeof gameState === 'undefined' || !gameState.gameStarted) {
        _hudControlsLaunchT = null;
        return;
    }
    if (_hudControlsLaunchT === null) {
        _hudControlsLaunchT = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        return;
    }
    if (_hudControlsManual) return;

    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    if (now - _hudControlsLaunchT >= 8000) {
        _hudControlsPanel.classList.add('controls-collapsed');
    }
}

// =============================================================================
// INTEGRATED UPDATE LOOP FOR UI SYSTEMS
// =============================================================================

// Two tiers, by what the pilot's eye is actually tracking.
//   INSTRUMENTS run every call: velocity/hull/energy, the crosshair, the
//   world-anchored target layer, the compass, the map — anything that is
//   spatially coupled to the ship and would visibly stutter if it lagged.
//   PANELS run at 10Hz: button captions, warning banners, the target list.
//   These are text that changes a handful of times per flight; refreshing
//   them 30-60 times a second buys nothing a player can see and costs a
//   style recalc + repaint of a backdrop-filtered glass panel every time.
function updateAllUISystems() {
    // Core UI updates
    updateUI();

    // Navigation and targeting systems
    if (_uiThrottle('populateTargets', 100)) populateTargets();
    updateCrosshairTargeting();
    detectEnemiesInRegion(); // self-throttled to 10Hz internally

    // Map and navigation systems
    updateCompass();
    updateGalaxyMap();

    // Control button states
    if (_uiThrottle('orbitBtn', 100)) updateOrbitLinesButton();
    if (_uiThrottle('warpBtn', 100)) updateWarpButton();

    // Warning systems
    if (_uiThrottle('ehWarn', 100)) updateEventHorizonWarnings();

    // Ease HUD chrome opacity down during slingshot/emergency-warp spectacle
    updateHudSpectacleDim();

    // Victory condition check
    checkVictoryCondition();

    // Mobile UI updates
    if (typeof updateMobileFloatingStatus === 'function') {
        updateMobileFloatingStatus();
    }
}

// =============================================================================
// INITIALIZATION AND COMPATIBILITY FUNCTIONS
// =============================================================================

function initializeUISystem() {
    console.log('🖥️ Initializing enhanced UI system...');
    
    // Setup galaxy map
    setupGalaxyMap();
    
    // Initialize orbit lines button
    updateOrbitLinesButton();
    
    // Set up initial UI state
    if (typeof gameState !== 'undefined') {
        // Ensure mouse and crosshair positions are synchronized
        gameState.mouseX = gameState.mouseX || window.innerWidth / 2;
        gameState.mouseY = gameState.mouseY || window.innerHeight / 2;
        gameState.crosshairX = gameState.mouseX;
        gameState.crosshairY = gameState.mouseY;
        
        // Initialize map view if not set
        if (!gameState.mapView) gameState.mapView = 'galactic';
    }
    
    // Bind event listeners for UI elements that aren't handled by game-controls.js
    bindUIEventListeners();
    
    console.log('UI system initialized successfully');
}

function bindUIEventListeners() {
    // Map view toggle button
    const mapViewToggle = document.getElementById('mapViewToggle');
    if (mapViewToggle) {
        mapViewToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof toggleMapView === 'function') {
                toggleMapView();
            } else {
                // Fallback implementation
                if (typeof gameState !== 'undefined') {
                    gameState.mapView = gameState.mapView === 'galactic' ? 'universal' : 'galactic';
                    mapViewToggle.textContent = gameState.mapView === 'galactic' ? 'Universal View' : 'Galactic View';
                }
            }
        });
    }
    
    // Auto-navigate button - fixed implementation
const autoNavigateBtn = document.getElementById('autoNavigateBtn');
if (autoNavigateBtn) {
    autoNavigateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (gameState.currentTarget) {
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
        
        // FIXED: Remove focus from button so space bar doesn't accidentally trigger it
        autoNavigateBtn.blur();
    });
}
    
    // Warp button for slingshot execution
    const warpBtn = document.getElementById('warpBtn');
    if (warpBtn && typeof executeSlingshot === 'function') {
        warpBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            executeSlingshot();
        });
    }
}

// =============================================================================
// COMPATIBILITY BRIDGE FUNCTIONS - FOR INTEGRATION WITH OTHER SYSTEMS
// =============================================================================

// Bridge function to show achievements (integrates with game-controls.js)
function displayAchievement(title, description, playSound = true) {
    // Use the enhanced achievement system from game-controls.js if available
    if (typeof showAchievement === 'function') {
        showAchievement(title, description, playSound);
    } else {
        // Fallback UI-only achievement display
        const popup = document.getElementById('achievementPopup');
        const text = document.getElementById('achievementText');
        const titleEl = popup && popup.querySelector('h4');
        
        if (popup && text && titleEl) {
            titleEl.textContent = title;
            text.textContent = description;
            popup.classList.remove('hidden');
            
            // Auto-hide after 4 seconds
            setTimeout(() => popup.classList.add('hidden'), 4000);
        }
    }
}

// Bridge function for target cycling (integrates with game-controls.js)
function cycleToNextTarget() {
    if (typeof cycleTargets === 'function') {
        cycleTargets();
    } else {
        // Fallback implementation
        console.warn('cycleTargets function not available - using fallback');
        // Implement basic target cycling here if needed
    }
}

// Bridge function for UI updates from other systems
function updateUIFromExternal(updateType, data) {
    switch (updateType) {
        case 'enemy_defeated':
            if (data && data.enemy) {
                // Update galaxy enemy counts
                const galaxyId = data.enemy.userData && data.enemy.userData.galaxyId;
                if (typeof gameState !== 'undefined' && gameState.currentGalaxyEnemies && galaxyId >= 0) {
                    gameState.currentGalaxyEnemies[galaxyId] = Math.max(0, (gameState.currentGalaxyEnemies[galaxyId] || 0) - 1);
                    setupGalaxyMap(); // Refresh galaxy map
                }
            }
            break;
            
        case 'boss_spawned':
            if (data && data.galaxyId >= 0) {
                setupGalaxyMap(); // Refresh galaxy map to show boss status
            }
            break;
            
        case 'galaxy_cleared':
            if (data && data.galaxyId >= 0) {
                setupGalaxyMap(); // Refresh galaxy map to show cleared status
                if (typeof gameState !== 'undefined') {
                    gameState.galaxiesCleared++;
                }
                if (typeof awardReputation === 'function') {
                    awardReputation(100, 'Galaxy liberated');
                }
            }
            break;
            
        case 'tutorial_completed':
            // Update UI to reflect that enemies are now active
            detectEnemiesInRegion();
            break;
            
        default:
            console.warn('Unknown UI update type:', updateType);
            break;
    }
}

function setupMobileUI() {
    // Hide desktop panels on mobile
    const desktopPanels = document.querySelectorAll('.ui-panel');
    desktopPanels.forEach(panel => {
        panel.classList.add('desktop-only');
    });
    
    // Create mobile UI container
    createMobileUIContainer();
    createMobileTopBar();
    createMobileControls();
    createMobileFloatingStatus(); // ADD THIS LINE
    createMobilePopups();
}

function createMobileUIContainer() {
    const mobileUI = document.createElement('div');
    mobileUI.className = 'mobile-ui';
    mobileUI.id = 'mobileUI';
    mobileUI.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 10;
        display: none;
    `;
    
    document.body.appendChild(mobileUI);
    
    // Show mobile UI only after game starts
    const checkGameStarted = trackInterval(setInterval(() => {
        if (typeof gameState !== 'undefined' && gameState.gameStarted && !document.body.classList.contains('intro-active')) {
            mobileUI.style.display = 'block';
            console.log('📱 Mobile UI now visible - game started');
            clearInterval(checkGameStarted);
        }
    }, 500));
}

function createMobileTopBar() {
    const topBar = document.createElement('div');
    topBar.className = 'mobile-top-bar';
    topBar.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        right: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 25;
        pointer-events: auto;
    `;
    
    topBar.innerHTML = `
        <div class="mobile-info" style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.3), rgba(30, 41, 59, 0.3)); backdrop-filter: blur(10px); border: 1px solid rgba(0,150,255,0.4); border-radius: 20px; padding: 8px 16px; color: white; font-size: 14px; font-weight: 600;">
            <div id="mobileVelocity">0.0 km/s</div>
        </div>
        <div class="mobile-info" style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.3), rgba(30, 41, 59, 0.3)); backdrop-filter: blur(10px); border: 1px solid rgba(0,150,255,0.4); border-radius: 20px; padding: 8px 16px; color: white; font-size: 14px; font-weight: 600;">
            <div id="mobileEnergy">100%</div>
        </div>
        <button class="mobile-menu-btn" onclick="openMobilePopup('navigation')" style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, rgba(0, 150, 255, 0.3), rgba(0, 100, 200, 0.3)); border: 2px solid rgba(0, 200, 255, 0.4); color: white; display: flex; align-items: center; justify-content: center; font-size: 20px; cursor: pointer; box-shadow: 0 4px 15px rgba(0, 150, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1);">
            <i class="fas fa-map"></i>
        </button>
    `;
    
    document.getElementById('mobileUI').appendChild(topBar);
}

function createMobileControls() {
    const controls = document.createElement('div');
    controls.className = 'mobile-controls';
    controls.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 15px;
        z-index: 30;
        pointer-events: auto;
    `;
    
    const buttonStyle = `width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, rgba(0, 150, 255, 0.3), rgba(0, 100, 200, 0.3)); border: 2px solid rgba(0, 200, 255, 0.4); color: white; display: flex; align-items: center; justify-content: center; font-size: 24px; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 4px 15px rgba(0, 150, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1);`;
    
    controls.innerHTML = `
    <button class="mobile-btn" onclick="mobileCycleTarget()" style="${buttonStyle}" title="Cycle Targets">
        <i class="fas fa-bullseye"></i>
    </button>
    <button class="mobile-btn primary"
    ontouchstart="handleMobileFire(event); return false;"
    style="${buttonStyle} width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, rgba(255, 50, 50, 0.3), rgba(200, 0, 0, 0.3)); border-color: rgba(255, 100, 100, 0.4); box-shadow: 0 4px 15px rgba(255, 50, 50, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1); opacity: 1;"
    title="Fire Weapons">
    <i class="fas fa-crosshairs"></i>
</button>
    <button class="mobile-btn emergency" onclick="mobileEmergencyWarp()" style="${buttonStyle} background: linear-gradient(135deg, rgba(255, 150, 0, 0.3), rgba(200, 100, 0, 0.3)); border-color: rgba(255, 200, 0, 0.4); box-shadow: 0 4px 15px rgba(255, 150, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1);" title="Emergency Warp">
        <i class="fas fa-rocket"></i>
    </button>
    <button class="mobile-btn" onclick="openMobilePopup('controls')" style="${buttonStyle}" title="Controls">
        <i class="fas fa-cog"></i>
    </button>
`;

    
    document.getElementById('mobileUI').appendChild(controls);
}

function createMobileFloatingStatus() {
    // Remove existing if present
    const existing = document.getElementById('mobileFloatingStatus');
    if (existing) {
        existing.remove();
    }
    
    const floatingStatus = document.createElement('div');
    floatingStatus.className = 'mobile-floating-status';
    floatingStatus.id = 'mobileFloatingStatus';
    floatingStatus.style.cssText = `
        position: fixed;
        top: 56px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 10px;
        z-index: 20;
        pointer-events: none;
        font-family: 'Orbitron', monospace;
    `;
    
    // Hull pill — info button — Energy pill (info sits between the two meters)
    floatingStatus.innerHTML = `
        <div class="mobile-stat-pill" style="background: rgba(0, 0, 0, 0.7); border: 1px solid rgba(248, 113, 113, 0.6); border-radius: 4px; padding: 4px 14px; font-size: 13px; font-weight: 600; color: #f87171; text-shadow: 0 0 8px rgba(248, 113, 113, 0.8); box-shadow: 0 0 10px rgba(248, 113, 113, 0.3), inset 0 0 10px rgba(248, 113, 113, 0.1); opacity: 0.7;">
            <i class="fas fa-shield-alt" style="margin-right: 6px;"></i>
            <span id="mobileFloatingHull">100%</span>
        </div>
        <button onclick="if(typeof showMobilePanel==='function')showMobilePanel('status')" style="pointer-events:auto; width:36px; height:36px; border-radius:6px; background:rgba(0,0,0,0.6); border:1px solid rgba(0,150,255,0.5); color:#60a5fa; font-size:14px; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 0 8px rgba(0,150,255,0.3); opacity:0.7; -webkit-tap-highlight-color:transparent; touch-action:manipulation;">
            <i class="fas fa-info-circle"></i>
        </button>
        <div class="mobile-stat-pill" style="background: rgba(0, 0, 0, 0.7); border: 1px solid rgba(96, 165, 250, 0.6); border-radius: 4px; padding: 4px 14px; font-size: 13px; font-weight: 600; color: #60a5fa; text-shadow: 0 0 8px rgba(96, 165, 250, 0.8); box-shadow: 0 0 10px rgba(96, 165, 250, 0.3), inset 0 0 10px rgba(96, 165, 250, 0.1); opacity: 0.7;">
            <i class="fas fa-bolt" style="margin-right: 6px;"></i>
            <span id="mobileFloatingEnergy">100%</span>
        </div>
    `;
    
    const mobileUI = document.getElementById('mobileUI');
    if (mobileUI) {
        mobileUI.appendChild(floatingStatus);
        console.log('📱 Mobile floating status created and appended');
    } else {
        // Fallback: append to body if mobileUI doesn't exist
        document.body.appendChild(floatingStatus);
        console.log('📱 Mobile floating status created (fallback to body)');
    }
    
    // Initial update
    setTimeout(() => {
        updateMobileFloatingStatus();
    }, 100);
}

function updateMobileFloatingStatus() {
    if (typeof gameState === 'undefined') return;

    const hullEl = _uiEl('mobileFloatingHull');
    const energyEl = _uiEl('mobileFloatingEnergy');
    if (hullEl) hullEl.textContent = gameState.hull ? Math.round(gameState.hull) + '%' : '100%';
    if (energyEl) energyEl.textContent = gameState.energy ? Math.round(gameState.energy) + '%' : '100%';

    const warpBadge = _uiEl('mobileWarpCountBadge');
    if (warpBadge) warpBadge.textContent = gameState.emergencyWarp?.available ?? 5;
}

function createMobilePopups() {
    const mobileUI = document.getElementById('mobileUI');
    if (!mobileUI) return;
    
    // Create controls popup
    const controlsPopup = document.createElement('div');
    controlsPopup.className = 'mobile-popup';
    controlsPopup.id = 'controlsPopup';
    controlsPopup.innerHTML = `
        <div class="mobile-popup-content">
            <button class="mobile-popup-close" onclick="document.getElementById('controlsPopup').classList.remove('active')">&times;</button>
            <h3>FLIGHT CONTROLS</h3>
            <div style="font-size: 12px; line-height: 1.6;">
                <strong>TOUCH CONTROLS:</strong><br>
                • Drag screen: Look around<br>
                • Tap fire button: Shoot<br>
                • Use navigation panel for targets<br><br>
                <strong>BUTTONS:</strong><br>
                • 🎯 Cycle Targets<br>
                • 🔥 Fire Weapons<br>
                • 🚀 Emergency Warp<br>
                • ⚙️ This Menu
            </div>
        </div>
    `;
    mobileUI.appendChild(controlsPopup);
    
    // Create status popup
    const statusPopup = document.createElement('div');
    statusPopup.className = 'mobile-popup';
    statusPopup.id = 'statusPopup';
    statusPopup.innerHTML = `
        <div class="mobile-popup-content">
            <button class="mobile-popup-close" onclick="document.getElementById('statusPopup').classList.remove('active')">&times;</button>
            <h3>SHIP STATUS</h3>
            <div style="font-size: 12px;">
                <div style="margin-bottom: 8px;">Velocity: <span id="mobileStatusVelocity">0.0 km/s</span></div>
                <div style="margin-bottom: 8px;">Distance: <span id="mobileStatusDistance">0.0 ly</span></div>
                <div style="margin-bottom: 8px;">Energy: <span id="mobileStatusEnergy">100%</span></div>
                <div style="margin-bottom: 8px;">Hull: <span id="mobileStatusHull">100%</span></div>
                <div style="margin-bottom: 8px;">Location: <span id="mobileStatusLocation">Local Galaxy</span></div>
            </div>
        </div>
    `;
    mobileUI.appendChild(statusPopup);
    
    // Create navigation panel
    const navPanel = document.createElement('div');
    navPanel.className = 'nav-panel-mobile';
    navPanel.id = 'navPanelMobile';
    navPanel.innerHTML = `
        <button class="mobile-popup-close" onclick="document.getElementById('navPanelMobile').classList.remove('active')" style="position: absolute; top: 10px; right: 10px; background: transparent; border: none; color: white; font-size: 30px; cursor: pointer;">&times;</button>
        <h3>Navigation System</h3>
        <div id="mobileAvailableTargets" style="max-height: 50%; overflow-y: auto; margin-bottom: 15px;"></div>
        <button id="mobileAutoNavigateBtn" onclick="if(typeof mobileAutoNavigate === 'function') mobileAutoNavigate()" class="w-full mt-2 space-btn rounded px-4 py-2 mb-2">
            <i class="fas fa-crosshairs mr-2"></i>Auto-Navigate to Target
        </button>
    `;
    mobileUI.appendChild(navPanel);
    
    console.log('📱 Mobile popups created');
}

// Mobile button functions that interface with existing game functions
function mobileCycleTarget() {
    // Use existing tab targeting system
    if (typeof cycleTarget === 'function') {
        cycleTarget();
    } else if (typeof gameState !== 'undefined' && typeof populateTargets === 'function') {
        // Fallback target cycling
        const targets = document.querySelectorAll('#availableTargets .target-btn');
        if (targets.length > 0) {
            targets[0].click();
        }
    }
    
    // Visual feedback
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
        crosshair.style.boxShadow = '0 0 20px rgba(255, 255, 0, 0.8)';
        setTimeout(() => {
            crosshair.style.boxShadow = '0 0 20px rgba(0, 255, 0, 0.6), inset 0 0 20px rgba(0, 255, 0, 0.3)';
        }, 300);
    }
}

// Use window object to avoid variable conflicts
if (!window.mobileFireState) {
    window.mobileFireState = {
        lastFireTime: 0,
        fireDebounceTime: 200 // 200ms cooldown
    };
}

function handleMobileFire(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    // Debounce to prevent double-firing
    const now = Date.now();
    if (now - window.mobileFireState.lastFireTime < window.mobileFireState.fireDebounceTime) {
        console.log('Fire blocked - too soon after last fire');
        return;
    }
    window.mobileFireState.lastFireTime = now;
    
    console.log('📱 Mobile fire button pressed');
    
    // Ensure game is active
    if (typeof gameState === 'undefined' || !gameState.gameStarted || gameState.gameOver) {
        console.log('Fire blocked - game not active');
        return;
    }
    
    // Resume audio context if needed
    if (typeof resumeAudioContext === 'function') {
        resumeAudioContext();
    }
    
    // Call the main fire weapon function
    if (typeof fireWeapon === 'function') {
        fireWeapon();
        console.log('✅ Fire weapon called successfully');
    } else if (typeof keys !== 'undefined') {
        // Fallback: simulate spacebar press
        keys.space = true;
        setTimeout(() => keys.space = false, 100);
        console.log('✅ Fire weapon via keys.space');
    }
    
    // Visual feedback - transform only, no opacity change
    const fireBtn = document.querySelector('.mobile-btn.primary, .mobile-btn.fire');
    if (fireBtn) {
        fireBtn.style.transform = 'scale(0.85)';
        setTimeout(() => {
            fireBtn.style.transform = 'scale(1)';
        }, 150);
    }
}

function openMobilePopup(popupType) {
    console.log(`📱 Opening mobile popup: ${popupType}`);
    
    // Don't open popups during intro
    if (document.body.classList.contains('intro-active')) {
        console.log('Popup blocked - intro active');
        return;
    }
    
    if (popupType === 'controls') {
        const popup = document.getElementById('controlsPopup');
        if (popup) {
            popup.classList.add('active');
            if (typeof playSound === 'function') {
                playSound('ui_open', 1200, 0.1);
            }
        }
    } else if (popupType === 'status') {
        const popup = document.getElementById('statusPopup');
        if (popup) {
            if (typeof updateMobileStatus === 'function') {
                updateMobileStatus();
            }
            popup.classList.add('active');
            if (typeof playSound === 'function') {
                playSound('ui_open', 1200, 0.1);
            }
        }
    } else if (popupType === 'navigation') {
        const navPanel = document.getElementById('navPanelMobile');
        if (navPanel) {
            if (typeof updateMobileNavigation === 'function') {
                updateMobileNavigation();
            }
            navPanel.classList.add('active');
            if (typeof playSound === 'function') {
                playSound('ui_open', 1200, 0.1);
            }
        }
    }
}

// =============================================================================
// EXPORT FUNCTIONS FOR GLOBAL ACCESS
// =============================================================================

if (typeof window !== 'undefined') {
    // Core UI functions
    window.updateUI = updateUI;
    window.updateAllUISystems = updateAllUISystems;
    window.initializeUISystem = initializeUISystem;
    
    // Target and navigation systems
    window.populateTargets = populateTargets;
    window.selectTargetUI = selectTargetUI;
    window.detectEnemiesInRegion = detectEnemiesInRegion;
    window.updateCrosshairTargeting = updateCrosshairTargeting;
    
    // Map and compass systems
    window.setupGalaxyMap = setupGalaxyMap;
    window.createMapGrid = createMapGrid;
    window.updateCompass = updateCompass;
    window.updateGalaxyMap = updateGalaxyMap;
    
    // Control and status systems
    window.updateAutoNavigateButton = updateAutoNavigateButton;
    window.updateOrbitLinesButton = updateOrbitLinesButton;
    window.updateWarpButton = updateWarpButton;
    window.updateEventHorizonWarnings = updateEventHorizonWarnings;
    
    // Game state functions
    window.checkVictoryCondition = checkVictoryCondition;
    window.showVictoryScreen = showVictoryScreen;
    window.gameOver = gameOver;
    window.showGameOverScreen = showGameOverScreen;
    
    // Bridge functions for integration
    window.displayAchievement = displayAchievement;
    window.cycleToNextTarget = cycleToNextTarget;
    window.updateUIFromExternal = updateUIFromExternal;
    
    // Utility functions
    window.bindUIEventListeners = bindUIEventListeners;
    
    // Mobile UI functions
    window.setupMobileUI = setupMobileUI;
    window.createMobileUIContainer = createMobileUIContainer;
    window.createMobileTopBar = createMobileTopBar;
    window.createMobileControls = createMobileControls;
    window.createMobileFloatingStatus = createMobileFloatingStatus;
    window.createMobilePopups = createMobilePopups;
    window.updateMobileFloatingStatus = updateMobileFloatingStatus;
    window.mobileCycleTarget = mobileCycleTarget;
    window.handleMobileFire = handleMobileFire;
    window.openMobilePopup = openMobilePopup;
    
    console.log('Enhanced Game UI loaded - All compatibility issues resolved!');
}

console.log('Game UI system loaded successfully');
