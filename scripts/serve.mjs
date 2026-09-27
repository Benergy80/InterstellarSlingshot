#!/usr/bin/env node
// =============================================================================
// SERVE — play this build locally, never cached.
//   node scripts/serve.mjs [port=8803] [dir=repo root]
// Every response is sent `Cache-Control: no-store`, so a plain reload always
// shows the current code (no cache-buster or hard-refresh needed while testing).
// =============================================================================
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2]) || 8803;
const ROOT = resolve(process.argv[3] || fileURLToPath(new URL('..', import.meta.url)));
const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.json': 'application/json',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

http.createServer(async (req, res) => {
    try {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        let rel = normalize(urlPath).replace(/^([/\\.])+/, '');
        if (rel === '') rel = 'index.html';
        const data = await readFile(join(ROOT, rel));
        const headers = {
            'Content-Type': MIME[extname(rel).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store, max-age=0',
            'Accept-Ranges': 'bytes',
        };
        // Range support so <audio> can seek in the MP3 soundtrack.
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
        if (m && (m[1] || m[2])) {
            const start = m[1] ? Number(m[1]) : Math.max(0, data.length - Number(m[2]));
            const end = m[1] && m[2] ? Math.min(Number(m[2]), data.length - 1) : data.length - 1;
            if (start <= end && start < data.length) {
                res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${data.length}` });
                res.end(data.subarray(start, end + 1));
                return;
            }
        }
        res.writeHead(200, headers);
        res.end(data);
    } catch {
        res.writeHead(404); res.end('not found');
    }
}).listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} at http://localhost:${PORT}/`));
