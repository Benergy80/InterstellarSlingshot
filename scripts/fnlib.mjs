// =============================================================================
// fnlib — shared parsing helpers for fn-map / fn-restore / fn-undef.
//
// A "unit" is one top-level statement of a game script: a function, a class, a
// const/let/var declaration, a `window.x = …` / `X.prototype.y = …` assignment,
// or an anonymous statement (IIFE, addEventListener call…). Files that wrap
// everything in one IIFE are descended into, so their inner functions are
// units too (named `iife/<name>`).
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const ROOTS = [
    join(HERE, 'node_modules'),
    '/Users/benstagl/InterstellarSlingshot/.claude/worktrees/hybrid/node_modules',
];
function load(name) {
    for (const r of ROOTS) {
        if (existsSync(join(r, name))) return createRequire(join(r, 'x.js'))(name);
    }
    throw new Error(`fnlib: ${name} not installed — run npm ci`);
}
export const acorn = load('acorn');
export const walk = load('acorn-walk');

export const ORIGINAL = '/Users/benstagl/InterstellarSlingshot/.claude/worktrees/main-baseline';

export function parse(src, file = '?') {
    try {
        return acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowReturnOutsideFunction: true });
    } catch (e) {
        throw new Error(`parse failed for ${file}: ${e.message}`);
    }
}

function memberName(n) {
    if (n.type === 'Identifier') return n.name;
    if (n.type === 'ThisExpression') return 'this';
    if (n.type === 'MemberExpression') {
        const o = memberName(n.object);
        const p = n.computed ? (n.property.type === 'Literal' ? String(n.property.value) : null) : n.property.name;
        return o && p ? `${o}.${p}` : null;
    }
    return null;
}

function isIIFE(stmt) {
    if (stmt.type !== 'ExpressionStatement') return null;
    let e = stmt.expression;
    if (e.type === 'UnaryExpression') e = e.argument;
    if (e.type !== 'CallExpression') return null;
    let c = e.callee;
    if (c.type === 'MemberExpression' && !c.computed && /^(call|apply)$/.test(c.property.name)) c = c.object;
    if (c.type === 'FunctionExpression' || c.type === 'ArrowFunctionExpression') {
        return c.body.type === 'BlockStatement' ? c.body.body : null;
    }
    return null;
}

/** A stable tag for an anonymous statement: the first thing it assigns to or calls. */
function tagOf(stmt) {
    let best = null;
    walk.full(stmt, (n) => {
        let nm = null;
        if (n.type === 'AssignmentExpression') nm = memberName(n.left) && memberName(n.left) + '=';
        else if (n.type === 'CallExpression') nm = memberName(n.callee) && memberName(n.callee) + '()';
        if (nm && (!best || n.start < best.start)) best = { start: n.start, nm };
    });
    return best ? best.nm : null;
}

const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const norm = (s) => s.replace(/\r/g, '').split('\n').map((l) => l.trimEnd()).join('\n').trim();

/** Extend a statement's start backwards over the comment block directly above it. */
function leadStart(src, start, floor) {
    let pos = start;
    for (;;) {
        // walk back over whitespace to the previous line end
        let i = pos;
        while (i > floor && /[ \t]/.test(src[i - 1])) i--;
        if (i <= floor || src[i - 1] !== '\n') break;
        const lineEnd = i - 1;
        let lineStart = src.lastIndexOf('\n', lineEnd - 1) + 1;
        if (lineStart < floor) break;
        const line = src.slice(lineStart, lineEnd).trim();
        if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*') || line.endsWith('*/')) {
            pos = lineStart;
            // a block comment: jump to its opening
            if (!line.startsWith('//') && !line.startsWith('/*')) {
                const open = src.lastIndexOf('/*', lineStart);
                if (open >= floor) pos = src.lastIndexOf('\n', open) + 1;
            }
        } else break;
    }
    return pos;
}

/** Return the units of a script: [{name, kind, start, end, line, endLine, lines, hash, src}] */
export function units(src, file = '?') {
    const ast = parse(src, file);
    const out = [];
    const seen = new Map();
    const push = (name, kind, node, floor) => {
        const n = seen.get(name) || 0;
        seen.set(name, n + 1);
        const uname = n ? `${name}#${n + 1}` : name;
        const start = leadStart(src, node.start, floor);
        const text = src.slice(start, node.end);
        out.push({
            name: uname, kind, start, end: node.end, bodyStart: node.start,
            line: src.slice(0, start).split('\n').length, endLine: node.loc.end.line,
            lines: text.split('\n').length, hash: hash(norm(src.slice(node.start, node.end))), src: text,
        });
    };
    const visit = (body, prefix, floor0) => {
        let floor = floor0;
        let anon = 0;
        for (const s of body) {
            const inner = isIIFE(s);
            if (inner && inner.length > 3) {
                visit(inner, prefix + 'iife/', inner[0] ? inner[0].start - 1 : s.start);
            } else if (s.type === 'FunctionDeclaration') push(prefix + s.id.name, 'function', s, floor);
            else if (s.type === 'ClassDeclaration') push(prefix + s.id.name, 'class', s, floor);
            else if (s.type === 'VariableDeclaration') {
                const names = s.declarations.map((d) => (d.id.type === 'Identifier' ? d.id.name : '{…}')).join(',');
                push(prefix + names, s.kind, s, floor);
            } else if (s.type === 'ExpressionStatement' && s.expression.type === 'AssignmentExpression') {
                const nm = memberName(s.expression.left);
                push(prefix + (nm || `assign@${++anon}`), 'assign', s, floor);
            } else if (s.type === 'ExpressionStatement' && s.expression.type === 'CallExpression') {
                const cal = memberName(s.expression.callee) || 'call';
                const a0 = s.expression.arguments[0];
                const tag = a0 && a0.type === 'Literal' ? `(${JSON.stringify(a0.value)})` : '';
                push(prefix + `~${cal}${tag}`, 'call', s, floor);
            } else if (s.type === 'EmptyStatement') { /* skip */ } else {
                const tag = tagOf(s);
                const short = s.type.replace('Statement', '').toLowerCase();
                push(prefix + (tag ? `~${short}:${tag}` : `~${short}@${++anon}`), 'stmt', s, floor);
            }
            floor = s.end;
        }
    };
    visit(ast.body, '', 0);
    return out;
}

export function read(path) { return readFileSync(path, 'utf8'); }

/** Line-level change size between two sources (lines only in a + lines only in b, multiset). */
export function changeSize(a, b) {
    const count = (s) => { const m = new Map(); for (const l of norm(s).split('\n')) { const k = l.trim(); if (k) m.set(k, (m.get(k) || 0) + 1); } return m; };
    const A = count(a), B = count(b);
    let del = 0, add = 0;
    for (const [k, v] of A) del += Math.max(0, v - (B.get(k) || 0));
    for (const [k, v] of B) add += Math.max(0, v - (A.get(k) || 0));
    return { del, add };
}
