#!/usr/bin/env node
// =============================================================================
// FN-RESTORE — put ORIGINAL code back, one unit at a time, byte-exact.
//
//   node scripts/fn-restore.mjs js/game-controls.js createExplosionEffect _fxRing
//       replace those units in this build with ORIGINAL's version
//   node scripts/fn-restore.mjs js/x.js --insert removedFn --after someUnit
//       bring back a unit the overhaul deleted, placed after `someUnit`
//   node scripts/fn-restore.mjs js/x.js --show createExplosionEffect
//       print ORIGINAL's version and this build's version (no edit)
//   node scripts/fn-restore.mjs js/x.js --keep-as _new createExplosionEffect
//       restore ORIGINAL under the real name AND keep this build's version
//       renamed with the suffix (createExplosionEffect_new) — for flag-gated A/B.
//       Only valid for function declarations.
//   --dry     show what would change, write nothing
//   --orig    compare against another checkout
//
// Unit names are the ones scripts/fn-map.mjs prints. Runs `node --check` on the
// result and refuses to leave a file that does not parse.
// =============================================================================
import { writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { units, read, ORIGINAL } from './fnlib.mjs';

const argv = process.argv.slice(2);
const flag = (k) => argv.includes('--' + k);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const ORIG = resolve(opt('orig', ORIGINAL));
const DRY = flag('dry');
const SHOW = flag('show');
const INSERT = opt('insert', null);
const AFTER = opt('after', null);
const KEEP_AS = opt('keep-as', null);
const valued = ['orig', 'insert', 'after', 'keep-as'];
const skip = new Set();
valued.forEach((k) => { const i = argv.indexOf('--' + k); if (i >= 0) { skip.add(i); skip.add(i + 1); } });
const pos = argv.filter((a, i) => !skip.has(i) && !a.startsWith('--'));
const rel = pos[0];
const names = pos.slice(1);
if (!rel || (!names.length && !INSERT)) { console.error('usage: fn-restore.mjs <file> <unit…> | --insert <unit> --after <unit> | --show <unit>'); process.exit(2); }

const here = resolve(rel);
const origPath = join(ORIG, rel);
if (!existsSync(origPath)) { console.error(`no ${rel} in ORIGINAL`); process.exit(2); }
let src = read(here);
const O = new Map(units(read(origPath), 'ORIGINAL:' + rel).map((u) => [u.name, u]));
const H = new Map(units(src, rel).map((u) => [u.name, u]));

if (SHOW) {
    for (const n of names) {
        console.log(`\n──────── ORIGINAL ${n} ────────\n${O.get(n) ? O.get(n).src : '(absent)'}`);
        console.log(`\n──────── THIS BUILD ${n} ────────\n${H.get(n) ? H.get(n).src : '(absent)'}`);
    }
    process.exit(0);
}

const edits = [];
let bad = 0;
for (const n of names) {
    const o = O.get(n), h = H.get(n);
    if (!o) { console.error(`✗ ${n}: not in ORIGINAL (use fn-map to check the name)`); bad++; continue; }
    if (!h) { console.error(`✗ ${n}: not in this build — use --insert ${n} --after <unit>`); bad++; continue; }
    if (o.hash === h.hash) { console.log(`= ${n}: already identical`); continue; }
    let text = o.src;
    if (KEEP_AS) {
        if (h.kind !== 'function') { console.error(`✗ ${n}: --keep-as only works on function declarations`); bad++; continue; }
        const base = n.split('/').pop();
        const renamed = src.slice(h.start, h.end).replace(new RegExp(`(function\\s*\\*?\\s*)${base}\\b`), `$1${base}${KEEP_AS}`);
        text = `${o.src}\n\n// ── overhaul version of ${base}, kept for flag-gated comparison ──\n${renamed.slice(renamed.indexOf(src.slice(h.bodyStart, h.bodyStart + 8)))}`;
    }
    edits.push({ start: h.start, end: h.end, text, label: `${n} (${h.lines}L → ${o.lines}L)` });
}
if (INSERT) {
    const o = O.get(INSERT), a = H.get(AFTER);
    if (!o) { console.error(`✗ ${INSERT}: not in ORIGINAL`); bad++; }
    else if (H.get(INSERT)) { console.error(`✗ ${INSERT}: already exists here — restore it by name instead`); bad++; }
    else if (!a) { console.error(`✗ --after ${AFTER}: no such unit here`); bad++; }
    else edits.push({ start: a.end, end: a.end, text: `\n\n${o.src}`, label: `insert ${INSERT} (${o.lines}L) after ${AFTER}` });
}
if (bad) { console.error(`${bad} problem(s) — nothing written`); process.exit(1); }
if (!edits.length) { console.log('nothing to do'); process.exit(0); }

edits.sort((x, y) => y.start - x.start);
for (let i = 1; i < edits.length; i++) if (edits[i].end > edits[i - 1].start) { console.error('overlapping units — restore them separately'); process.exit(1); }
for (const e of edits) src = src.slice(0, e.start) + e.text + src.slice(e.end);
for (const e of [...edits].reverse()) console.log(`${DRY ? '~' : '✓'} ${e.label}`);
if (DRY) process.exit(0);

const before = read(here);
writeFileSync(here, src);
try {
    execFileSync(process.execPath, ['--check', here], { stdio: 'pipe' });
} catch (e) {
    writeFileSync(here, before);
    console.error(`✗ result does not parse — file left unchanged\n${String(e.stderr || e.message).split('\n').slice(0, 6).join('\n')}`);
    process.exit(1);
}
console.log(`wrote ${rel} — now run: node scripts/fn-undef.mjs`);
