#!/usr/bin/env node
// =============================================================================
// FN-UNDEF — find names that are used but defined nowhere (dangling references).
//
//   node scripts/fn-undef.mjs                 list every undefined name + where
//   node scripts/fn-undef.mjs --baseline      record the current set as known
//   node scripts/fn-undef.mjs --new           only names NOT in the baseline
//                                             (exit 1 if any) — run after edits
//   node scripts/fn-undef.mjs --root <dir>    check another checkout
//
// Name-based, not scope-exact: a name counts as defined if ANY script declares
// it anywhere (function, var/let/const, class, parameter, catch binding) or
// assigns `window.name` / `globalThis.name`. That is the right grain for this
// codebase (shared globals across <script> tags) and catches the real failure:
// a restored or removed function that something else still calls.
// Uses guarded by `typeof name` are reported as "guarded" — safe at runtime.
// =============================================================================
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, walk } from './fnlib.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const ROOT = resolve(opt('root', process.cwd()));
const BASE = join(fileURLToPath(new URL('.', import.meta.url)), 'fn-undef-baseline.json');

const BUILTIN = new Set(`window document navigator console location history screen performance localStorage sessionStorage
globalThis self top parent frames alert confirm prompt fetch XMLHttpRequest WebSocket Worker Image Audio AudioContext
webkitAudioContext OfflineAudioContext requestAnimationFrame cancelAnimationFrame requestIdleCallback cancelIdleCallback
setTimeout clearTimeout setInterval clearInterval queueMicrotask structuredClone getComputedStyle matchMedia
Object Array String Number Boolean Symbol BigInt Math JSON Date RegExp Error TypeError RangeError SyntaxError ReferenceError
Promise Map Set WeakMap WeakSet WeakRef Proxy Reflect Intl Function eval isNaN isFinite parseInt parseFloat
encodeURIComponent decodeURIComponent encodeURI decodeURI escape unescape undefined NaN Infinity arguments
Float32Array Float64Array Int8Array Int16Array Int32Array Uint8Array Uint8ClampedArray Uint16Array Uint32Array
ArrayBuffer DataView SharedArrayBuffer Atomics TextEncoder TextDecoder URL URLSearchParams Blob File FileReader FormData
Event CustomEvent KeyboardEvent MouseEvent TouchEvent PointerEvent WheelEvent EventTarget AbortController
Node Element HTMLElement HTMLCanvasElement HTMLImageElement HTMLAudioElement HTMLVideoElement HTMLInputElement
SVGElement DocumentFragment MutationObserver ResizeObserver IntersectionObserver PerformanceObserver
DOMParser XMLSerializer CSS OffscreenCanvas ImageData ImageBitmap createImageBitmap Path2D
WebGLRenderingContext WebGL2RenderingContext GainNode OscillatorNode AudioBuffer MediaRecorder MediaStream
THREE tailwind module exports require process Buffer global devicePixelRatio innerWidth innerHeight
scrollX scrollY pageXOffset pageYOffset outerWidth outerHeight crypto caches indexedDB speechSynthesis
addEventListener removeEventListener dispatchEvent open close focus blur print stop postMessage
DeviceOrientationEvent DeviceMotionEvent Notification visualViewport reportError name status length event origin`.split(/\s+/));

const files = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f).sort();
const defined = new Set();
const uses = new Map();      // name -> [{file, line}]
const guarded = new Set();

const declPattern = (p) => {
    if (!p) return;
    if (p.type === 'Identifier') defined.add(p.name);
    else if (p.type === 'ObjectPattern') p.properties.forEach((q) => declPattern(q.type === 'RestElement' ? q.argument : q.value));
    else if (p.type === 'ArrayPattern') p.elements.forEach(declPattern);
    else if (p.type === 'AssignmentPattern') declPattern(p.left);
    else if (p.type === 'RestElement') declPattern(p.argument);
};

// inline <script> blocks in index.html define globals too
const sources = files.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]);
if (existsSync(join(ROOT, 'index.html'))) {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    let i = 0;
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
        if (m[1].trim()) sources.push([`index.html#inline${++i}`, '\n'.repeat(html.slice(0, m.index).split('\n').length - 1) + m[1]]);
    }
}

for (const [file, src] of sources) {
    let ast;
    try { ast = parse(src, file); } catch (e) { console.error(String(e.message)); continue; }
    walk.fullAncestor(ast, (n, _s, anc) => {
        const parent = anc[anc.length - 2];
        switch (n.type) {
            case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression':
                if (n.id) defined.add(n.id.name);
                n.params.forEach(declPattern);
                break;
            case 'ClassDeclaration': case 'ClassExpression': if (n.id) defined.add(n.id.name); break;
            case 'VariableDeclarator': declPattern(n.id); break;
            case 'CatchClause': declPattern(n.param); break;
            case 'AssignmentExpression': {
                const l = n.left;
                if (l.type === 'MemberExpression' && !l.computed && l.object.type === 'Identifier' &&
                    /^(window|globalThis|self)$/.test(l.object.name)) defined.add(l.property.name);
                if (l.type === 'MemberExpression' && l.computed && l.property.type === 'Literal' && l.object.type === 'Identifier' &&
                    /^(window|globalThis|self)$/.test(l.object.name)) defined.add(String(l.property.value));
                break;
            }
            case 'UnaryExpression':
                if (n.operator === 'typeof' && n.argument.type === 'Identifier') guarded.add(n.argument.name);
                break;
            case 'Identifier': {
                if (!parent) break;
                if (parent.type === 'MemberExpression' && parent.property === n && !parent.computed) break;
                if ((parent.type === 'Property' || parent.type === 'PropertyDefinition' || parent.type === 'MethodDefinition') &&
                    parent.key === n && !parent.computed && !(parent.shorthand && parent.value === n)) break;
                if (parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') break;
                if (parent.type === 'UnaryExpression' && parent.operator === 'typeof') break;
                if (!uses.has(n.name)) uses.set(n.name, []);
                uses.get(n.name).push({ file, line: n.loc.start.line });
                break;
            }
            default:
        }
    });
}

const undef = [...uses.keys()].filter((k) => !defined.has(k) && !BUILTIN.has(k)).sort();
if (argv.includes('--baseline')) {
    writeFileSync(BASE, JSON.stringify(undef, null, 0) + '\n');
    console.log(`baseline: ${undef.length} names recorded in scripts/fn-undef-baseline.json`);
    process.exit(0);
}
const known = existsSync(BASE) ? new Set(JSON.parse(readFileSync(BASE, 'utf8'))) : new Set();
const onlyNew = argv.includes('--new');
const report = undef.filter((k) => !onlyNew || !known.has(k));
let hard = 0;
for (const k of report) {
    const u = uses.get(k);
    const g = guarded.has(k);
    if (!g) hard++;
    const where = u.slice(0, 4).map((x) => `${x.file}:${x.line}`).join(' ');
    console.log(`${g ? 'guarded ' : 'UNDEF   '} ${k.padEnd(38)} ${u.length}× ${where}${u.length > 4 ? ' …' : ''}`);
}
console.log(`\n${report.length} undefined name(s)${onlyNew ? ' not in baseline' : ''}; ${hard} unguarded`);
process.exit(onlyNew && hard ? 1 : 0);
