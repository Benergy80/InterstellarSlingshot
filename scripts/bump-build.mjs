#!/usr/bin/env node
// =============================================================================
// BUMP-BUILD — stamp one new version on every cache-buster in index.html.
//   node scripts/bump-build.mjs 20260927a
// Rewrites every `?v=…` on a local js/ or css/ reference, adds one to local
// references that have none, and sets window.BUILD_TAG / BUILD_ID. Run once
// per integration, never inside a work-package branch (they would collide).
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const tag = process.argv[2];
if (!/^\d{8}[a-z]$/.test(tag || '')) { console.error('usage: bump-build.mjs YYYYMMDDx   e.g. 20260927a'); process.exit(2); }
const file = join(fileURLToPath(new URL('..', import.meta.url)), 'index.html');
let html = readFileSync(file, 'utf8');
let n = 0;
html = html.replace(/((?:src|href)=")((?:js|css)\/[^"?]+)(?:\?v=[^"]*)?(")/g, (_m, a, path, z) => { n++; return `${a}${path}?v=${tag}${z}`; });
html = html.replace(/(window\.BUILD_TAG\s*=\s*')[^']*(')/, `$1${tag}$2`);
html = html.replace(/(window\.BUILD_ID\s*=\s*')[^']*(')/, `$1claude/star-explorer-hybrid$2`);
writeFileSync(file, html);
console.log(`stamped ${n} references + BUILD_TAG = ${tag}`);
