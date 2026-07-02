// =============================================================================
// BOOT — minimal init-order registry for a script-tag codebase.
//
// The game is 20+ plain <script> files sharing globals, with implicit init
// ordering. That produced a whole class of "sometimes it works" races:
// getPlayerModel() null → wingman stuck on a placeholder cone, "Shield
// system not initialized", spawn latches, etc. Every function defensively
// checks `typeof X !== 'undefined'` because nothing can trust load order.
//
// Boot gives the missing primitive: systems SIGNAL readiness by name, and
// consumers register callbacks on the names they need. Callbacks run
// immediately if the dependency is already ready, so registration order no
// longer matters — which is exactly the property script-tag loading lacks.
//
//   Boot.signal('playerModel');            // producer, once ready
//   Boot.whenReady('playerModel', cb);     // consumer; cb runs now or later
//   Boot.whenReady(['scene','models'], cb) // multiple dependencies
//   Boot.isReady('scene')                  // sync check
//
// This file MUST be the first game script in index.html. Everything is
// defensive: a consumer script can still run standalone if Boot is absent
// (`window.Boot && Boot.whenReady(...)`).
// =============================================================================
(function () {
    const _ready = new Set();
    const _waiters = [];   // { deps: string[], cb: fn }

    function isReady(name) { return _ready.has(name); }

    function _satisfied(deps) {
        for (let i = 0; i < deps.length; i++) {
            if (!_ready.has(deps[i])) return false;
        }
        return true;
    }

    function signal(name) {
        if (_ready.has(name)) return;
        _ready.add(name);
        // Flush any waiters this unblocks. Callbacks are try-guarded so one
        // bad consumer can't block the others.
        for (let i = _waiters.length - 1; i >= 0; i--) {
            if (_satisfied(_waiters[i].deps)) {
                const w = _waiters.splice(i, 1)[0];
                try { w.cb(); } catch (e) {
                    console.error('Boot.whenReady callback failed for [' + w.deps.join(',') + ']:', e);
                }
            }
        }
    }

    function whenReady(deps, cb) {
        if (typeof deps === 'string') deps = [deps];
        if (_satisfied(deps)) {
            try { cb(); } catch (e) {
                console.error('Boot.whenReady callback failed for [' + deps.join(',') + ']:', e);
            }
            return;
        }
        _waiters.push({ deps: deps, cb: cb });
    }

    // 'dom' is signaled by Boot itself — the one dependency nearly every
    // late initializer actually wants (replaces setTimeout-and-hope).
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { signal('dom'); });
    } else {
        signal('dom');
    }

    window.Boot = {
        signal: signal,
        whenReady: whenReady,
        isReady: isReady,
        // Introspection for debugging: Boot.state() → { ready, waiting }
        state: function () {
            return {
                ready: Array.from(_ready),
                waiting: _waiters.map(w => w.deps.join('+')),
            };
        },
    };
})();
