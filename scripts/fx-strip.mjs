// fxcheck — stage explosions (strip) or soak the demo logging sounds/music (soak).
//   node fxcheck.mjs strip <root> <outdir> <label> [query]
//   node fxcheck.mjs soak  <root> <outdir> <label> [query] [seconds]
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL('/Users/benstagl/InterstellarSlingshot/.claude/worktrees/hybrid/node_modules/playwright-core/index.mjs').href);
const [MODE, ROOT, OUT, LABEL, QUERY = '', SECS = '90'] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = await new Promise((done) => {
  const s = http.createServer(async (req, res) => {
    try {
      let rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\.])+/, '') || 'index.html';
      const data = await readFile(join(ROOT, rel));
      res.writeHead(200, { 'Content-Type': MIME[extname(rel).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  s.listen(0, '127.0.0.1', () => done(s));
});
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--use-angle=metal', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [], consoleErrs = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 200)); });
// Log every playSound + soundtrack track change from the start.
await page.addInitScript(() => {
  window.__sndLog = []; window.__t0 = performance.now();
  const stamp = () => ((performance.now() - window.__t0) / 1000).toFixed(1);
  const hook = () => {
    if (typeof window.playSound === 'function' && !window.playSound.__hooked) {
      const f = window.playSound;
      window.playSound = function (type) { window.__sndLog.push(stamp() + ' sfx ' + type); return f.apply(this, arguments); };
      window.playSound.__hooked = true;
    }
    try { const c = window.soundtrack && window.soundtrack.current; if (c !== window.__lastTrack) { window.__sndLog.push(stamp() + ' track ' + c); window.__lastTrack = c; } } catch (e) {}
  };
  setInterval(hook, 100);
});
let code = 0;
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html${QUERY}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#introDemoBtn', { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.click('#introDemoBtn');
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.gameStarted && gameState.frameCount > 60, null, { timeout: 120000 });
  if (MODE === 'strip') {
    await page.waitForTimeout(10000);
    const canvas = await page.$('#gameCanvas') || await page.$('canvas');
    const recipes = process.env.RECIPES === 'weapons' ? [
      ['laser', "createLaserBeam(cam.position.clone().add(fwd.clone().normalize().multiplyScalar(-60)).add(up.clone().multiplyScalar(-20)), p, '#00ff96', true); createLaserBeam(p.clone().add(up.clone().multiplyScalar(30)), cam.position.clone().add(fwd.clone().normalize().multiplyScalar(-40)), '#ff3333', false)"],
      ['missileexp', 'createMissileExplosion(p)'],
      ['sparks', "createHitSparks(p, 0x66ccff)"],
    ] : [
      ['faction', 'window.createFactionExplosion(p, 0, 1.0)'],
      ['kill', 'createExplosionEffect(p)'],
      ['pirate', "createPirateExplosionVariant(p, 'ember')"],
    ];
    // Freeze the world (render-only frames, no pause menu) and step the
    // explosion manager by hand so every build is sampled at identical ages.
    await page.evaluate(() => { gameState.paused = true; });
    await page.waitForTimeout(300);
    for (const [name, call] of recipes) {
      await page.evaluate(`(() => { const ie = eval, cam = ie('camera');
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
        const p = cam.position.clone().add(fwd.clone().multiplyScalar(80)).add(up.clone().multiplyScalar(14));
        window.__fxAge = 0; ${call}; })()`);
      for (const ms of [60, 150, 300, 600, 1200]) {
        await page.evaluate((target) => {
          const em = eval('explosionManager');
          while (window.__fxAge + 16.67 <= target) { em.update(16.67); window.__fxAge += 16.67; }
        }, ms);
        await page.waitForTimeout(120);
        const box = await canvas.boundingBox();
        await page.screenshot({ path: join(OUT, `${LABEL}-${name}-${String(ms).padStart(4, '0')}.png`),
          clip: { x: box.x + box.width / 2 - 240, y: box.y + box.height / 2 - 250, width: 480, height: 360 } });
      }
      // drain whatever is left (and the setTimeout second beats) before the next recipe
      await page.waitForTimeout(400);
      await page.evaluate(() => { const em = eval('explosionManager'); for (let i = 0; i < 400; i++) em.update(16.67); });
      await page.waitForTimeout(200);
    }
  } else {
    await page.waitForTimeout(Number(SECS) * 1000);
  }
  const log = await page.evaluate(() => window.__sndLog);
  const st = await page.evaluate(() => ({ frame: gameState.frameCount, tm: (window.renderer || eval('renderer')).toneMapping,
    music: window.HYBRID && HYBRID.get('music'), current: window.soundtrack && window.soundtrack.current,
    apiKeys: window.soundtrack ? Object.keys(window.soundtrack).length : 0,
    hasSetVolume: !!(window.soundtrack && window.soundtrack.setVolume), volume: window.soundtrack && window.soundtrack.volume }));
  await writeFile(join(OUT, `${LABEL}-soundlog.txt`), log.join('\n'));
  const counts = {};
  log.forEach((l) => { const k = l.split(' ').slice(1).join(' '); counts[k] = (counts[k] || 0) + 1; });
  console.log('state', JSON.stringify(st));
  console.log('sound counts', JSON.stringify(counts));
} catch (e) { console.error('FAILED', e.message); code = 1; }
finally {
  console.log('page errors', pageErrors.length, JSON.stringify(pageErrors.slice(0, 6)));
  console.log('console errors', consoleErrs.length, JSON.stringify(consoleErrs.slice(0, 6)));
  await browser.close(); server.close();
}
process.exit(code);
