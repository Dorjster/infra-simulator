// Your own grenade leaves your hand the moment you let go (v51, NADE-8): in a real browser (solo deathmatch, the room on
// a local LAN server), the frame after the release already draws a grenade where the host will start it (arena-nades.js
// throwStart: 22 units ahead of the hand) — before the host's state has come back — and when the host's grenade arrives
// it takes over that same model: never two grenades for one throw, never a jump. A refused throw (none left) draws
// nothing that stays.   node tests/browser/gd-nade-spawn-e2e.mjs <repo> <out>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'NSPN01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'ns-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1200, height: 750 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
await p.addInitScript(() => { localStorage.setItem('infra-name', 'Spawner'); localStorage.setItem('infra-face-name', 'Spawner'); localStorage.setItem('infra-face', 'smile'); });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 30000 }); await p.waitForTimeout(800);
await p.keyboard.press('Escape');
// Every frame from the release: the grenade models drawn (the 'nades' group's children that aren't the preview's line /
// ring) and where; and the host's grenades in the state.
await p.evaluate(() => { globalThis.__rec = null; globalThis.__startRec = () => { const R = globalThis.__rec = { frames: [], cam: null };
  const c = __infra.camera, d = c.getWorldDirection(new c.position.constructor()); R.cam = { x: c.position.x, y: c.position.y, z: c.position.z, dx: d.x, dy: d.y, dz: d.z };
  const f = () => { const G = __infra.scene.getObjectByName('nades'), models = []; for (const o of G?.children || []) if (!o.isLine && o.geometry?.type !== 'RingGeometry' && o.visible) models.push([o.position.x, o.position.y, o.position.z]);
    R.frames.push({ t: performance.now(), models, host: (__infra.lab.world.operations.game.combat?.nades || []).filter(x => x.phase === 'air').map(x => x.id) }); if (R.frames.length < 50) requestAnimationFrame(f); }; requestAnimationFrame(f); }; });
const throwHE = async () => { await p.evaluate(() => __infra.lab.lan.act({ type: 'arena', action: { type: 'buy-nade', kind: 'he' } })); await p.waitForTimeout(250); await p.evaluate(() => __infra.lab.enter()); await p.keyboard.press('Digit4'); await p.waitForTimeout(800);
  await p.evaluate(() => { const c = __infra.camera.position; __infra.lab.look(c.x, c.z, c.x + 40, c.y + 6, c.z); }); await p.waitForTimeout(200);
  await p.evaluate(() => __infra.lab.pistol.button(0, true)); await p.waitForTimeout(600); await p.evaluate(() => { __startRec(); __infra.lab.pistol.button(0, false); }); await p.waitForTimeout(1400); return p.evaluate(() => __rec); };
// A LAN's round trip: the throw request held 150 ms on its way (the host's grenade comes back that much later).
await p.evaluate(() => { const L = __infra.lab.lan, act = L.act.bind(L); L.act = m => m?.action?.type === 'throw' ? new Promise(r => setTimeout(() => r(act(m)), 150)) : act(m); });
const rec = await throwHE();
// The path the host will fly from the release (throwStart + launch; standing still), its first 100 ms.
const path0 = await p.evaluate(async cam => { const { throwStart, launch, stepNade } = await import('./arena-nades.js'), S = __infra.lab.arenaScene, a = { ...cam, vx: 0, vy: 0, vz: 0, strength: 'long' }, b = S.boxes?.length ? S.boxes : null;
  const g = { ...throwStart(a, b, S.bounds), ...launch(a), still: 0, view: true }, pts = [[g.x, g.y, g.z]]; for (let i = 0; i < 100; i++) { stepNade(g, S.boxes, S.bounds, .001); pts.push([g.x, g.y, g.z]); } return pts; }, rec.cam);
const first = rec.frames.findIndex(f => f.models.length > 0), hostAt = rec.frames.findIndex(f => f.host.length > 0);
const d0 = first >= 0 ? Math.min(...rec.frames[first].models.flatMap(m => path0.map(q => Math.hypot(m[0] - q[0], m[1] - q[1], m[2] - q[2])))) : Infinity;
check('a grenade is drawn within 3 frames of the release, on the throw\'s path from its start — before the host\'s grenade is back', first >= 0 && first <= 3 && (hostAt < 0 || first < hostAt) && d0 < 1.5, `frame ${first} (the host's grenade first in the state at frame ${hostAt}) · ${d0.toFixed(2)} units off the path's first 100 ms`);
const most = Math.max(...rec.frames.map(f => f.models.length)); check('never two grenades drawn for one throw (the host\'s takes over the model)', most === 1, most);
let jump = 0; for (let i = 1; i < rec.frames.length; i++) { const a = rec.frames[i - 1].models[0], c = rec.frames[i].models[0]; if (a && c) jump = Math.max(jump, Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2])); }
check('no jump from frame to frame as the host takes over', jump < 3.5, jump.toFixed(2) + ' units at most');
// A throw the host refuses (no grenade left: the one bought is thrown): nothing stays drawn.
await p.waitForTimeout(3000);
// Watched frame by frame for 700 ms — well inside the view's 1.2 s give-up (MINE_MS), so it is the refusal itself
// (gd-throw-refused) that takes the copy away, not the timeout.
const ref = await p.evaluate(async () => { const count = () => { const G = __infra.scene.getObjectByName('nades'); let k = 0; for (const o of G?.children || []) if (!o.isLine && o.geometry?.type !== 'RingGeometry' && o.visible) k++; return k; };
  let at = null; addEventListener('gd-throw-refused', () => { at ??= performance.now(); }, { once: true }); const t0 = performance.now(), seen = []; __infra.lab.arenaUI?.throwNade?.('he', 'long');
  await new Promise(r => { const f = () => { seen.push([performance.now() - t0, count()]); if (performance.now() - t0 < 700) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
  return { seen, at: at === null ? null : at - t0 }; });
const drawn = ref.at !== null && ref.seen.some(([t, k]) => t < ref.at && k > 0), after = ref.at !== null ? ref.seen.filter(([t]) => t > ref.at + 40) : [];
check('a refused throw: its copy is drawn, then gone at the refusal (not the 1.2 s timeout)', drawn && after.length > 0 && after.every(([, k]) => k === 0), `refused at ${ref.at?.toFixed(0)} ms · drawn before it: ${drawn} · frames after it with a grenade: ${after.filter(([, k]) => k > 0).length}/${after.length}`);
await p.waitForTimeout(1000); const left = await p.evaluate(() => { const G = __infra.scene.getObjectByName('nades'); let k = 0; for (const o of G?.children || []) if (!o.isLine && o.geometry?.type !== 'RingGeometry' && o.visible) k++; return k; });
check('a refused throw leaves no grenade drawn', left === 0, left);
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
