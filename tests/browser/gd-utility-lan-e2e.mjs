// Global Defensive utility over LAN (two browsers, Defuse on Dune, no bots): a molotov burns, a smoke on it puts it out on
// both screens, the smoke hides the host from the guest, an HE opens the same hole in the smoke on both screens at the
// same moment, and standing inside the smoke fills your view (clear again outside). No page errors.
//   node tests/browser/gd-utility-lan-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out_dir] = process.argv.slice(2); mkdirSync(out_dir, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDUTL1', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gu-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });   // (a test that throws never leaves its room running)
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const browsers = [], launch = () => chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 260) : '')); }; const errs = [];
async function open(who, w = 1280, h = 760) { const bw = await launch(); browsers.push(bw); const p = await (await bw.newContext({ viewport: { width: w, height: h } })).newPage(); p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(n => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n); }, who);
  await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200); return p; }
const host = await open('Host'), guest = await open('Guest', 1100, 700);
const G = p => p.evaluate(() => { const g = __infra.lab.world.operations.game, d = g.combat?.d; return { mode: g.mode, kind: g.arena?.kind, map: g.arena?.map, lobby: g.arena?.lobby, teams: d?.teams, phase: d?.round?.phase, n: d?.n, score: d?.score }; });
const act = (p, a) => p.evaluate(a => __infra.lab.lan.act({ type: 'arena', action: a }), a);
// Host: Defuse · Dune · no bots · Host on LAN; the guest joins; the host starts the match.
await host.evaluate(() => document.querySelector('[data-start=arena]').click()); await host.waitForTimeout(400); await host.selectOption('#ss-ar-kind', 'defuse'); await host.selectOption('#ss-ar-map', 'dust2'); await host.selectOption('#ss-ar-bots', '0');
await host.evaluate(() => document.getElementById('ss-ar-host').click());
await host.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d, null, { timeout: 30000 });
const code = await host.evaluate(() => __infra.lab.lan.roomCode);
await guest.evaluate(() => document.querySelector('[data-start=join]').click()); await guest.waitForSelector('#ss-code'); await guest.fill('#ss-jname', 'Guest'); await guest.fill('#ss-code', code); await guest.evaluate(() => document.getElementById('ss-join').click());
await guest.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d?.teams?.guest, null, { timeout: 30000 });
await act(host, { type: 'start-match' }); await host.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'freeze', null, { timeout: 8000 });
const buy = (p, kind) => p.evaluate(k => __infra.lab.lan.act({ type: 'arena', action: { type: 'buy-nade', kind: k } }), kind);
const b1 = await buy(host, 'smoke'), b2 = await buy(host, 'he'), b3 = await buy(guest, 'molotov'); check('bought a smoke and an HE (host) and a molotov (guest)', ![b1, b2, b3].some(r => r?.error), JSON.stringify([b1, b2, b3]));
await host.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.round?.phase === 'live', null, { timeout: 30000 });
// Both on Long A, 80 units apart along the street; utility lands between them.
const spot = await host.evaluate(async () => { const { ARENA } = await import('/facility-layout.js'), { ARENA_MAPS } = await import('/arena-maps.js'), M = ARENA_MAPS.dust2, c = M.callouts.find(x => x.name === 'Long A'); return { x: ARENA.cx + c.x, z: ARENA.cz + c.z, y: M.nav.floorAt(c.x, c.z) }; });   // Long A: a long straight street (true-scale Dust II)
const place = (p, dz) => p.evaluate(([s, dz]) => __infra.lab.look(s.x, s.z + dz, s.x, s.y + 9, s.z - dz), [spot, dz]);
await place(host, -40); await place(guest, 40); await host.waitForTimeout(800);
const thr = (p, kind) => p.evaluate(([k, s]) => __infra.lab.lan.act({ type: 'arena', action: { type: 'throw', kind: k, x: s.x, y: s.y + 3, z: s.z, dx: 0, dy: -1, dz: 0.001, strength: 'short' } }), [kind, spot]);
const state = p => p.evaluate(() => (__infra.lab.world.operations.game.combat.nades || []).map(n => ({ id: n.id, kind: n.kind, phase: n.phase, holes: (n.holes || []).map(h => h.at) })));
check('the guest’s molotov burns', !(await thr(guest, 'molotov'))?.error && await guest.waitForFunction(() => __infra.lab.world.operations.game.combat.nades?.some(n => n.kind === 'molotov' && n.phase === 'fire'), null, { timeout: 6000 }).then(() => true).catch(() => false));
await thr(host, 'smoke');
check('third person: the guest sees the host throw (arm swing)', await guest.waitForFunction(() => [...__infra.lab.lan.models.values()].some(m => /host/i.test(m.name || '') && m.act === 'throw' && performance.now() < m.actUntil), null, { timeout: 2000 }).then(() => true).catch(() => false));
const out = await Promise.all([host, guest].map(p => p.waitForFunction(() => { const n = __infra.lab.world.operations.game.combat.nades || []; return n.some(x => x.kind === 'smoke' && x.phase === 'smoke') && !n.some(x => x.kind === 'molotov' && x.phase === 'fire'); }, null, { timeout: 8000 }).then(() => true).catch(() => false)));
check('the smoke puts the fire out on both screens', out[0] && out[1], JSON.stringify(await state(guest)));
await host.waitForTimeout(2600);   // the smoke grows to full size
check('the guest cannot see the host through the smoke (model hidden on the guest’s screen)', await guest.evaluate(() => { const m = [...__infra.lab.lan.models.values()].find(x => /host/i.test(x.name || x.pname || '')); return !!m && m.g.visible === false; }));
await thr(host, 'he');
const holes = await Promise.all([host, guest].map(p => p.waitForFunction(() => (__infra.lab.world.operations.game.combat.nades || []).some(n => n.kind === 'smoke' && n.holes?.length), null, { timeout: 6000 }).then(() => p.evaluate(() => (__infra.lab.world.operations.game.combat.nades || []).find(n => n.kind === 'smoke').holes.map(h => [h.at, Math.round(h.x), Math.round(h.z)]))).catch(() => null)));
check('the HE opens the same hole in the smoke on both screens (same place, same moment)', holes[0] && holes[1] && JSON.stringify(holes[0]) === JSON.stringify(holes[1]), JSON.stringify(holes));
await host.waitForTimeout(3500);   // the hole closes
await guest.evaluate(s => __infra.lab.look(s.x, s.z, s.x, s.y + 9, s.z - 30), spot); await guest.waitForTimeout(900);
check('standing in the smoke fills the guest’s view', await guest.evaluate(() => +document.getElementById('gd-smokeveil').style.opacity > .8), await guest.evaluate(() => document.getElementById('gd-smokeveil').style.opacity));
await guest.screenshot({ path: path.join(out_dir, 'in-smoke.png') }); await place(guest, 70); await guest.waitForTimeout(900); await guest.screenshot({ path: path.join(out_dir, 'outside-smoke.png') });
check('outside the smoke the view is clear', await guest.evaluate(() => +document.getElementById('gd-smokeveil').style.opacity < .05));
await host.evaluate(() => { __infra.lab.pistol.equip(__infra.lab.pistol.fallback() || 'usps'); }); await host.waitForTimeout(900); await host.evaluate(() => { const P = __infra.lab.pistol; P.button(0, true); P.button(0, false); }); await host.waitForTimeout(300); await host.evaluate(() => __infra.lab.pistol.reload());
check('third person: the guest sees the host reload (gun dips for the reload time)', await guest.waitForFunction(() => [...__infra.lab.lan.models.values()].some(m => /host/i.test(m.name || '') && m.act === 'reload' && performance.now() < m.actUntil), null, { timeout: 3000 }).then(() => true).catch(() => false));
check('no page errors', errs.length === 0, errs.slice(0, 4).join(' | '));
console.log(ok + '/' + n); for (const b of browsers) await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
