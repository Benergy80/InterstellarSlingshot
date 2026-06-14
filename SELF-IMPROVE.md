# Continuous-Improvement Loop — Interstellar Slingshot

A runbook for a self-improving development loop, inspired by
[headroom](https://github.com/chopratejas/headroom)'s two core ideas:

1. **Failure mining → persisted corrections.** headroom's `headroom learn`
   mines failed sessions and writes corrections back into `CLAUDE.md` so the
   agent stops repeating mistakes. We do the same: every regression found gets
   encoded as (a) a permanent invariant in `js/playtest-probe.js` and (b) a
   one-line lesson in `CLAUDE.md` § "Self-improvement loop — learnings ledger".
2. **Context compression.** These dev sessions run to hundreds of thousands of
   tokens. Running the loop under headroom (`headroom wrap claude`, or its
   proxy) compresses tool output / logs 60–95% so the loop can run far longer
   per budget. Optional but recommended for long unattended runs.

The missing ingredient a game can't get for free is an **automated sensor**.
`js/playtest-probe.js` is that sensor: a passive, always-on (~0.5 Hz) checker
exposing `window.__selftest`, which encodes each past bug *class* as an
invariant. The loop reads it instead of a human watching the screen.

## The loop (one iteration)

```
1. SERVE      python3 -m http.server 8000   (once; persists)
2. OBSERVE    load localhost:8000, click DEMO MODE, let world-gen finish (~30s)
3. SENSE      poll window.__selftest.report() / .fails() every ~20-30s for a
              few minutes (let the demo cycle: locals → boss → nebula → warp)
4. TRIAGE     for each FAIL (and persistent WARN): read the detail string,
              locate the system in the CLAUDE.md codebase map, diagnose
5. FIX        edit; node --check the file(s); BUMP the cache-buster in
              index.html (all refs); reload with ignoreCache
6. VERIFY     re-poll the probe — the failing check must flip to PASS, and no
              new check may regress
7. LEARN      add/strengthen the matching invariant in playtest-probe.js, and
              append a one-line lesson to CLAUDE.md's learnings ledger
8. COMMIT     one focused commit per fix (Co-Authored-By trailer)
9. REPEAT     next iteration; periodically push + open/refresh a PR
```

## How to run it

**Self-paced (recommended):** `/loop` with no interval, prompt:
> "Run one continuous-improvement iteration per SELF-IMPROVE.md: poll
> window.__selftest, fix the highest-severity FAIL, verify, add its invariant,
> commit. If all checks PASS for a full demo cycle, pick one item from the
> 'improvement backlog' below instead."

**Scheduled (unattended):** `/schedule` a cloud agent on a cadence (e.g. nightly)
running the same prompt; it branches, fixes, and opens a PR for review.

**Caveat (chrome-devtools MCP):** it drives the *visible* browser. When the
user is watching, only `evaluate_script` (read `__selftest`) and screenshots —
never navigate/reload/click — unless they've stepped away or asked.

## Severity order for TRIAGE

`FAIL noErrors` / `FAIL finitePositions` (correctness, can hard-break) →
`FAIL noGiantBubbles` / `FAIL noStuckSpawnIn` (visual breakage) →
`FAIL notRecedingFromTarget` (demo unwatchable) →
`WARN fps` / `WARN effectBudget` (perf/leaks) →
`WARN wingmenForward` / `WARN demoLive` (polish).

## Invariants today (window.__selftest.checks)

| check | catches (bug class) |
|---|---|
| `noErrors` | any uncaught/logged console error |
| `finitePositions` | NaN positions (crystal/mining-ship class) |
| `fps` | dense-core & effect-leak slowdowns |
| `noGiantBubbles` | inflated shield / orange-wash (materialization-scale race) |
| `noStuckSpawnIn` | spawn-in left a ship frozen at 12% scale |
| `notRecedingFromTarget` | demo flying away from the boss it's "targeting" |
| `demoLive` | autopilot frozen / stuck phase |
| `effectBudget` | explosions/effects not disposing (Points+Sprites budget) |
| `wingmenForward` | ships facing 180° from travel |

When you fix a NEW bug class, ADD a row here and a check in the probe.

## Improvement backlog (when all checks pass — proactive work)

- Planet `InstancedMesh` for dense galaxy cores (the standing ~27fps issue).
- Wire `flashEventText` into more beats: Sol liberation, faction collapse,
  elite-guardian arrival, first whip of a run.
- Tune knobs surfaced this session: boss special cadence, atmosphere fade
  band, gravity-whip boost tiers, lightning frequency.
- Threshold-based difficulty scaling per galaxy cleared (PewPew pattern).
- Convert remaining "appear instantly" spawns to `materializeShip`.

## Why this converges

Each iteration either fixes a regression (and adds a guard that prevents its
return) or, when clean, advances the backlog — so the invariant set grows
monotonically and the game's floor only ever rises. That is the loop.
