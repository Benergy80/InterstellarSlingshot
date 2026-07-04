import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = process.cwd();
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.glb':'model/gltf-binary','.mp3':'audio/mpeg','.json':'application/json','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{try{const u=decodeURIComponent(new URL(req.url,'http://x').pathname);let rel=normalize(u).replace(/^([/\\.])+/,'');if(rel==='')rel='index.html';const d=await readFile(join(ROOT,rel));res.writeHead(200,{'Content-Type':MIME[extname(rel)]||'application/octet-stream'});res.end(d);}catch{res.writeHead(404);res.end('nf');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
const log=(...a)=>console.log(new Date().toISOString().slice(11,19),...a);
const b=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--use-angle=swiftshader','--enable-unsafe-swiftshader','--window-size=1280,800']});
const p=await b.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,200)));
await p.goto(`http://127.0.0.1:${port}/?perf=1`,{waitUntil:'domcontentloaded'});
let t0=Date.now();
while(Date.now()-t0<80000){const ok=await p.evaluate(()=>!!document.getElementById('introDemoBtn'));if(ok)break;await p.waitForTimeout(2000);}
log('launch screen:',await p.evaluate(()=>!!document.getElementById('introDemoBtn')));
await p.click('#introDemoBtn').catch(()=>{});
for(let i=0;i<20;i++){
  await p.waitForTimeout(6000);
  const s=await p.evaluate(()=>({started:typeof gameState!=='undefined'&&gameState.gameStarted,fc:typeof gameState!=='undefined'?gameState.frameCount:-1,ast:window.asteroidInstancer?window.asteroidInstancer.count():null}));
  log(`+${(i+1)*6}s started=${s.started} fc=${s.fc} ast=${s.ast}`);
  if(s.fc>60){log('REACHED 60');break;}
}
log('errors:',JSON.stringify(errs.slice(0,5)));
await b.close(); server.close();
