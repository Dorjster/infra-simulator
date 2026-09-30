// 12-player LAN load: 11 bots post poses at the client rate (8/s) and walk; one bot acts every 2 s; a
// measuring client reads the SSE stream. Reports frame counts, bytes/s per client and server CPU.
import { spawn } from 'node:child_process';
const root = process.argv[2], seconds = +(process.argv[3] || 30);
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'LOAD12', HOST_KEY: 'k', CAMPAIGN_SAVE: '/tmp/load-' + Date.now() + '.json', DELIVERY_SCALE: '0.05' }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const post = (route, body, token) => fetch(base + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Token': token } : {}) }, body: JSON.stringify(body) }).then(r => r.json());
const host = await post('join', { code: 'LOAD12', name: 'Host', hostKey: 'k' }); let revision = host.revision;
const act = async (a, t) => { let r = await post('action', { revision, action: a }, t); if (r.revision !== undefined) revision = r.revision; else if (r.world) { revision = r.revision; } return r; };
await act({ type: 'engineering', action: { type: 'mode', mode: 'campaign', track: 'levels', name: 'Load' } }, host.token);
const bots = []; for (let i = 0; i < 10; i++) bots.push(await post('join', { code: 'LOAD12', name: 'Bot' + i }));
// measuring client
const meter = await post('join', { code: 'LOAD12', name: 'Meter' }); let bytes = 0, worldFrames = 0, playerFrames = 0, maxFrame = 0;
const ac = new AbortController(); (async () => { const r = await fetch(base + '/api/events?token=' + meter.token, { signal: ac.signal }); const reader = r.body.getReader(); let buf = ''; try { for (;;) { const { value, done } = await reader.read(); if (done) break; bytes += value.length; buf += new TextDecoder().decode(value); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); if (chunk.startsWith('event: world')) { worldFrames++; maxFrame = Math.max(maxFrame, chunk.length); } else if (chunk.startsWith('event: players')) playerFrames++; } } } catch {} })();
const all = [host, ...bots, meter]; let poses = 0, t0 = Date.now(), cpu0 = null;
const cpu = () => { try { return Number(require('node:child_process')); } catch { return 0; } };
const poseTimer = setInterval(() => { const t = (Date.now() - t0) / 1000; all.slice(0, 11).forEach((p, i) => { poses++; post('pose', { pose: { x: -10 + i * 2 + Math.sin(t + i) * 3, y: 9.7, z: 8 + Math.cos(t * .7 + i) * 4, yaw: t + i, active: true } }, p.token).catch(() => {}); }); }, 125);
const actTimer = setInterval(() => { act({ type: 'engineering', action: { type: 'order', sku: 'cat6', quantity: 1, length: 5 } }, bots[0].token).catch(() => {}); }, 2000);
const psStart = await import('node:child_process').then(m => m.execSync('ps -o time= -p ' + server.pid).toString().trim());
await new Promise(r => setTimeout(r, seconds * 1000));
const psEnd = await import('node:child_process').then(m => m.execSync('ps -o time= -p ' + server.pid).toString().trim());
clearInterval(poseTimer); clearInterval(actTimer); ac.abort();
const secs = (Date.now() - t0) / 1000, toSec = t => { const [m, s] = t.split(':'); return +m * 60 + +s; };
console.log(JSON.stringify({ players: all.length, seconds: Math.round(secs), posePostsPerSec: Math.round(poses / secs), worldFramesPerSec: +(worldFrames / secs).toFixed(2), playerFramesPerSec: +(playerFrames / secs).toFixed(1), sseKBps_perClient: +(bytes / secs / 1024).toFixed(1), largestWorldFrameKB: +(maxFrame / 1024).toFixed(1), serverCpuPercent: +((toSec(psEnd) - toSec(psStart)) / secs * 100).toFixed(1) }, null, 1));
server.kill(); process.exit(0);
