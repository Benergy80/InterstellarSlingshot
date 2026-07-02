#!/usr/bin/env node
// =============================================================================
// SMOKE TEST — boots the real game in headless Chrome and asserts the basics:
//   1. the page loads with no uncaught errors,
//   2. world generation completes (launch screen appears),
//   3. demo mode starts and the game loop runs (frameCount advances),
//   4. the always-on regression probe (window.__selftest) reports no FAILs,
//   5. the perf meter (window.__perf) is producing samples.
//
// Run:  npm run test:smoke          (add SMOKE_SECONDS=60 for a longer soak)
// Uses playwright-core + the locally installed Chrome — no browser download.
// =============================================================================
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOAK_MS = (Number(process.env.SMOKE_SECONDS) || 30) * 1000;
const BOOT_TIMEOUT_MS = 120000; // world-gen takes 20-40s on a fast machine

const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
    '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.json': 'application/json',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

function serve() {
    return new Promise((resolve) => {
        const server = http.createServer(async (req, res) => {
            try {
                const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
                let rel = normalize(urlPath).replace(/^([/\\.])+/, '');
                if (rel === '') rel = 'index.html';
                const data = await readFile(join(ROOT, rel));
                res.writeHead(200, { 'Content-Type': MIME[extname(rel)] || 'application/octet-stream' });
                res.end(data);
            } catch {
                res.writeHead(404); res.end('not found');
            }
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

function fail(msg) {
    console.error(`\nSMOKE FAIL: ${msg}`);
    process.exitCode = 1;
}

const server = await serve();
const port = server.address().port;
console.log(`smoke: serving ${ROOT} on :${port}`);

const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));

try {
    console.log('smoke: loading page…');
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    console.log('smoke: waiting for world generation (launch screen)…');
    await page.waitForSelector('#introDemoBtn', { timeout: BOOT_TIMEOUT_MS });
    console.log('smoke: launch screen up — starting demo mode');
    await page.click('#introDemoBtn');

    await page.waitForFunction(
        () => typeof gameState !== 'undefined' && gameState.gameStarted && gameState.frameCount > 60,
        null, { timeout: BOOT_TIMEOUT_MS },
    );
    console.log(`smoke: game running — soaking ${SOAK_MS / 1000}s in demo mode…`);

    const fcBefore = await page.evaluate(() => gameState.frameCount);
    await page.waitForTimeout(SOAK_MS);
    const state = await page.evaluate(() => ({
        frameCount: gameState.frameCount,
        gameOver: gameState.gameOver,
        demoDriving: !!(window.demoPilot && window.demoPilot.driving),
        perf: window.__perf || null,
        quality: window.__quality ? {
            tier: window.__quality.TIERS[window.__quality.tier].name,
            pixelRatio: window.__quality.basePixelRatio,
        } : null,
        selftest: window.__selftest ? window.__selftest.report() : '(no probe)',
        selftestFails: window.__selftest
            ? window.__selftest.fails().filter((f) => f.level !== 'warn')
            : [],
    }));

    console.log('\n--- probe report ---\n' + state.selftest + '\n--------------------');
    console.log('perf:', JSON.stringify(state.perf));
    console.log('quality:', JSON.stringify(state.quality));

    const framesAdvanced = state.frameCount - fcBefore;
    if (framesAdvanced < SOAK_MS / 1000) {
        fail(`game loop barely advanced: ${framesAdvanced} frames in ${SOAK_MS / 1000}s`);
    }
    if (state.gameOver) fail('gameOver=true during demo soak');
    if (!state.demoDriving) fail('demo autopilot not driving after soak');
    if (state.selftestFails.length) {
        fail('probe FAILs: ' + JSON.stringify(state.selftestFails));
    }
    if (!state.perf || !state.perf.samples) fail('perf meter produced no samples');

    // ── FLOATING-ORIGIN REGRESSION ────────────────────────────────────────
    // Teleport the camera past the rebase threshold and verify: the world
    // rebases (camera snaps back near origin), and a static object's TRUE
    // position (current + worldOriginOffset) is preserved across the shift.
    console.log('smoke: floating-origin check — teleporting +60k units…');
    const foBefore = await page.evaluate(() => {
        const S = (typeof wormholes !== 'undefined' && wormholes[0]) || null;
        if (!S || !window.worldOriginOffset) return null;
        const woo = window.worldOriginOffset;
        const r = {
            trueX: S.position.x + woo.x, trueY: S.position.y + woo.y, trueZ: S.position.z + woo.z,
            offsetLen: woo.length(),
        };
        camera.position.x += 60000; // past WORLD_REBASE_DISTANCE
        return r;
    });
    if (!foBefore) {
        fail('floating-origin check could not run (no wormholes / worldOriginOffset)');
    } else {
        await page.waitForTimeout(5000); // several frames even at headless fps
        const foAfter = await page.evaluate(() => {
            const S = (typeof wormholes !== 'undefined' && wormholes[0]) || null;
            const woo = window.worldOriginOffset;
            return {
                trueX: S.position.x + woo.x, trueY: S.position.y + woo.y, trueZ: S.position.z + woo.z,
                offsetLen: woo.length(),
                camLen: camera.position.length(),
                fails: window.__selftest ? window.__selftest.fails().filter(f => f.level !== 'warn') : [],
            };
        });
        const drift = Math.max(
            Math.abs(foAfter.trueX - foBefore.trueX),
            Math.abs(foAfter.trueY - foBefore.trueY),
            Math.abs(foAfter.trueZ - foBefore.trueZ));
        if (foAfter.offsetLen <= foBefore.offsetLen) {
            fail(`floating origin did not rebase after 60k teleport (offset ${foAfter.offsetLen})`);
        } else if (foAfter.camLen > 30000) {
            fail(`camera still ${foAfter.camLen.toFixed(0)}u from origin after rebase`);
        } else if (drift > 1) {
            fail(`world rebase corrupted true coordinates (drift ${drift.toFixed(2)}u)`);
        } else if (foAfter.fails.length) {
            fail('probe FAILs after rebase: ' + JSON.stringify(foAfter.fails));
        } else {
            console.log(`smoke: floating-origin OK — rebased (offset ${foAfter.offsetLen.toFixed(0)}u), true-coord drift ${drift.toFixed(3)}u`);
        }
    }

    if (pageErrors.length) fail(`uncaught page errors:\n  ${pageErrors.join('\n  ')}`);

    if (process.exitCode !== 1) {
        console.log(`\nSMOKE PASS: ${framesAdvanced} frames, ${state.perf.fps} fps (headless), no errors, probe clean.`);
    }
} catch (e) {
    fail(e.message || String(e));
} finally {
    await browser.close().catch(() => {});
    server.close();
}
