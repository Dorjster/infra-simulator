// Map changes don't leak (spec §18): a Defuse match goes through all seven maps three times by the host's map change; after
// each change the GPU geometry / texture counts and the JS heap (after a forced GC) are measured. The second lap must
// end where the first did, and the third hold what the second did, map by map (nothing left behind by the maps it
// unloaded); every change must finish.
//   node tests/browser/gd-mapchange-memory-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'MEM001', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'mm-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--js-flags=--expose-gc'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 400) : '')); };
await p.addInitScript(() => { localStorage.setItem('infra-name', 'Mem'); localStorage.setItem('infra-face-name', 'Mem'); localStorage.setItem('infra-face', 'smile'); });
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1000);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', 'dust2'); await p.selectOption('#ss-ar-bots', '2'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.map === 'dust2', null, { timeout: 40000 });
const MAPS = ['mirage', 'inferno', 'nuke', 'cache', 'anubis', 'ancient', 'dust2'];
const sample = () => p.evaluate(async () => { for (let i = 0; i < 3; i++) { globalThis.gc?.(); await new Promise(r => setTimeout(r, 120)); } const r = __infra.renderer.info; return { geo: r.memory.geometries, tex: r.memory.textures, heap: Math.round(performance.memory.usedJSHeapSize / 1048576), map: __infra.lab.arenaScene.map, boxes: __infra.lab.arenaScene.boxes.length }; });
const laps = [[], [], []];
for (let lap = 0; lap < 3; lap++) for (const id of MAPS) {
  await p.evaluate(id => __infra.lab.lan.send({ type: 'arena', action: { type: 'change-map', map: id } }), id);
  const done = await p.waitForFunction(id => __infra.lab.arenaScene?.map === id && __infra.lab.world.operations.game.arena.map === id, id, { timeout: 40000 }).then(() => true).catch(() => false);
  await p.waitForTimeout(1500); const s = await sample(); laps[lap].push({ id, done, ...s }); console.log('  lap', lap + 1, id, JSON.stringify(s)); }
check('every map change finished (geometry built, all seven maps, three times)', laps.flat().every(s => s.done && s.map === s.id && s.boxes > 100), JSON.stringify(laps.flat().filter(s => !s.done || s.boxes <= 100)));
const end = laps.map(l => l[l.length - 1]);
check('GPU geometries: the second lap ends where the first did (nothing left behind)', end[1].geo <= end[0].geo + 5, end[0].geo + ' → ' + end[1].geo);
check('GPU textures: the second lap ends where the first did', end[1].tex <= end[0].tex + 2, end[0].tex + ' → ' + end[1].tex);
check('JS heap: the second lap ends within 15% of the first (after GC)', end[1].heap <= end[0].heap * 1.15, end[0].heap + ' MB → ' + end[1].heap + ' MB');
const perMap = laps[0].map((s, i) => ({ id: s.id, geo: [s.geo, laps[1][i].geo], tex: [s.tex, laps[1][i].tex], heap: [s.heap, laps[1][i].heap] }));
// The first lap builds each map once and keeps it (map changes are then instant): the heap grows by about the size of
// the maps. From then on nothing may grow: each map costs the same on the third lap as on the second. (Maps differ
// from each other — Train's 1 300 collision boxes against Inferno's 9 000 — so the laps are compared map by map.)
const grow = laps[1].map((s, i) => [s.id, s.heap, laps[2][i].heap]);
// (after GC the heap still moves a few MB between samples: with CS2's looks in, ~1.2 GB, ±5–10 MB — five laps of three maps
// measured steady from the second on — so "the same" is within 1 % of it, at least 8 MB)
check('third lap: every map holds the same heap as on the second (nothing grows)', grow.every(([, a, b]) => b - a <= Math.max(8, a * .01)), JSON.stringify(grow));
check('second lap: GPU geometries per map are the same as on the first lap', perMap.every(m => Math.abs(m.geo[1] - m.geo[0]) <= 8), JSON.stringify(perMap.map(m => [m.id, ...m.geo])));
writeFileSync(path.join(out, 'memory.json'), JSON.stringify(laps, null, 1));
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
