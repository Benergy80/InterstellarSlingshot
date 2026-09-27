#!/usr/bin/env node
// =============================================================================
// FN-MAP — what differs between the ORIGINAL build and this one, unit by unit.
//
//   node scripts/fn-map.mjs                      every js/*.js file, summary
//   node scripts/fn-map.mjs js/game-models.js    one file, every differing unit
//   node scripts/fn-map.mjs js/a.js --grep ship  only units whose name matches
//   node scripts/fn-map.mjs --json out.json      machine-readable, all files
//   node scripts/fn-map.mjs --orig <dir>         compare against another checkout
//
// Status:  CHANGED  exists in both, body differs   (-removed/+added lines)
//          ADDED    only in this build (the overhaul added it)
//          REMOVED  only in ORIGINAL (the overhaul deleted it)
// Units that are identical are counted, not listed.
// =============================================================================
import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { units, read, changeSize, ORIGINAL } from './fnlib.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const ORIG = resolve(opt('orig', ORIGINAL));
const ROOT = resolve(opt('root', process.cwd()));
const GREP = opt('grep', null);
const JSON_OUT = opt('json', null);
const skip = new Set();
['orig', 'root', 'grep', 'json'].forEach((k) => { const i = argv.indexOf('--' + k); if (i >= 0) { skip.add(i); skip.add(i + 1); } });
const files = argv.filter((a, i) => !skip.has(i) && !a.startsWith('--'));

const list = files.length ? files : [...new Set([
    ...readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f),
    ...readdirSync(join(ORIG, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f),
])].sort();

export function mapFile(rel) {
    const a = existsSync(join(ORIG, rel)) ? units(read(join(ORIG, rel)), 'ORIGINAL:' + rel) : [];
    const b = existsSync(join(ROOT, rel)) ? units(read(join(ROOT, rel)), rel) : [];
    const A = new Map(a.map((u) => [u.name, u]));
    const B = new Map(b.map((u) => [u.name, u]));
    const rows = [];
    let same = 0;
    for (const u of b) {
        const o = A.get(u.name);
        if (!o) rows.push({ status: 'ADDED', name: u.name, kind: u.kind, line: u.line, lines: u.lines, origLine: null, origLines: 0, del: 0, add: u.lines });
        else if (o.hash === u.hash) same++;
        else { const c = changeSize(o.src, u.src); rows.push({ status: 'CHANGED', name: u.name, kind: u.kind, line: u.line, lines: u.lines, origLine: o.line, origLines: o.lines, ...c }); }
    }
    for (const o of a) if (!B.has(o.name)) rows.push({ status: 'REMOVED', name: o.name, kind: o.kind, line: null, lines: 0, origLine: o.line, origLines: o.lines, del: o.lines, add: 0 });
    return { file: rel, same, total: b.length, origTotal: a.length, rows };
}

const all = [];
for (const rel of list) {
    let m;
    try { m = mapFile(rel); } catch (e) { console.log(`${rel}: ${e.message}`); continue; }
    all.push(m);
    const n = (s) => m.rows.filter((r) => r.status === s).length;
    if (!files.length) {
        if (m.rows.length) console.log(`${rel.padEnd(34)} units ${String(m.total).padStart(4)}  same ${String(m.same).padStart(4)}  CHANGED ${String(n('CHANGED')).padStart(3)}  ADDED ${String(n('ADDED')).padStart(3)}  REMOVED ${String(n('REMOVED')).padStart(3)}`);
        continue;
    }
    console.log(`\n=== ${rel}  (${m.total} units here, ${m.origTotal} in ORIGINAL, ${m.same} identical)`);
    const rows = m.rows.filter((r) => !GREP || new RegExp(GREP, 'i').test(r.name))
        .sort((x, y) => (x.line ?? 1e9) - (y.line ?? 1e9) || (x.origLine ?? 0) - (y.origLine ?? 0));
    for (const r of rows) {
        const where = r.status === 'REMOVED' ? `orig:${r.origLine}` : `:${r.line}`;
        const size = r.status === 'CHANGED' ? `${r.origLines}→${r.lines}L  -${r.del}/+${r.add}` : `${r.status === 'ADDED' ? r.lines : r.origLines}L`;
        console.log(`  ${r.status.padEnd(8)} ${r.kind.padEnd(9)} ${where.padEnd(11)} ${size.padEnd(22)} ${r.name}`);
    }
}
if (JSON_OUT) { writeFileSync(resolve(JSON_OUT), JSON.stringify(all, null, 1)); console.log(`\nwrote ${JSON_OUT}`); }
