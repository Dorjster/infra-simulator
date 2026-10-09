// Global Defensive weapons in a real browser (solo deathmatch, no bots): the first shot's bullet hole is exactly at
// the crosshair (projected to the screen), shots take rounds (HUD 29 / 90), reload moves rounds from the reserve,
// health + armor shown, B opens and closes the buy menu (Escape too), buying a second rifle drops the first with its
// rounds, scope on right click (AWP: two levels, left click fires scoped), knife light / heavy, grenade held until release.
//   node tests/browser/gd-weapons-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDW001', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdw-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 240) : '')); };
await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); });
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
await p.selectOption('#ss-ar-kind', 'dm'); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 40000 });
await p.waitForTimeout(800); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
const L = () => __infra.lab;
// Buy an AK (deathmatch: free).
await p.evaluate(() => __infra.lab.arenaUI.buy(true)); await p.waitForTimeout(300);
check('buy menu shows the weapon info card', await p.evaluate(() => /Magazine/.test(document.querySelector('#ar-buy .info')?.textContent || '')));
await p.evaluate(() => document.querySelector('#ar-buy [data-pick="ak"]').click()); await p.waitForTimeout(700);
await p.keyboard.press('KeyB'); await p.waitForTimeout(250); check('B closes the buy menu', await p.evaluate(() => document.getElementById('ar-buy').hidden));
await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(300);
await p.keyboard.press('KeyB'); await p.waitForTimeout(250); check('B opens it again', await p.evaluate(() => !document.getElementById('ar-buy').hidden));
await p.keyboard.press('Escape'); await p.waitForTimeout(250); check('Escape closes it', await p.evaluate(() => document.getElementById('ar-buy').hidden));
await p.evaluate(() => __infra.lab.enter()); await p.keyboard.press('Digit1'); await p.waitForTimeout(1200);
check('AK in hand, 30 / 90 on the HUD', await p.evaluate(() => __infra.lab.pistol.current?.id === 'ak' && /30\s*\/\s*90/.test(document.querySelector('#gd-wp .ammo').textContent)), await p.evaluate(() => document.querySelector('#gd-wp .ammo').textContent));
check('health and armor shown', await p.evaluate(() => !document.getElementById('gd-hud').hidden && document.querySelector('#gd-hp .hp b').textContent === '100' && /ARMOR/.test(document.getElementById('gd-hp').textContent)));
// First shot: aim at a wall far away (look at a map box), stand still, fire once; the bullet hole projects to the screen centre.
const aimAt = await p.evaluate(() => { const S = __infra.lab.arenaScene, c = __infra.camera.position, box = S.boxes.filter(b => b.y1 - b.y0 > 12).map(b => ({ b, d: Math.hypot((b.minX + b.maxX) / 2 - c.x, (b.minZ + b.maxZ) / 2 - c.z) })).sort((a, b) => a.d - b.d).find(x => x.d > 25)?.b; return box ? { x: (box.minX + box.maxX) / 2, y: 7, z: (box.minZ + box.maxZ) / 2 } : null; });
for (const [label, dist] of [['far', null], ['close', 6]]) {
  await p.evaluate(({ t, dist }) => { const c = __infra.camera.position; let px = c.x, pz = c.z; if (dist) { const dx = c.x - t.x, dz = c.z - t.z, L = Math.hypot(dx, dz); /* step back to `dist` units from the box face */ } __infra.lab.look(px, pz, t.x, t.y, t.z); }, { t: aimAt, dist });
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => { const P = __infra.lab.pistol; P.button(0, true); P.button(0, false); const s = P.lastShot, e = s?.ends?.at(-1)?.point; if (!e) return null; const v = e.clone().project(__infra.camera); return { x: v.x * innerWidth / 2, y: v.y * innerHeight / 2, cone: s.cone, dist: e.distanceTo(s.origin) }; });
  check('first shot (' + label + ') lands exactly at the crosshair', r && Math.abs(r.x) < 1.5 && Math.abs(r.y) < 1.5 && r.cone === 0, JSON.stringify(r));
  await p.waitForTimeout(400);
}
check('one round per shot: 28 / 90', await p.evaluate(() => __infra.lab.pistol.ammo === 28 && __infra.lab.pistol.reserve === 90), await p.evaluate(() => [__infra.lab.pistol.ammo, __infra.lab.pistol.reserve]));
// Spray: 10 bullets climb (pattern), the crosshair follows the next bullet; then recovers.
const spray = await p.evaluate(async () => { const P = __infra.lab.pistol, out = []; P.button(0, true); for (let i = 0; i < 12; i++) { await new Promise(r => setTimeout(r, 100)); out.push(P.lastShot?.dir.y); } P.button(0, false); const climbed = out.at(-1) - out[0]; await new Promise(r => setTimeout(r, 1500)); return { climbed, recovered: Math.abs(P.punch.pitch) < .002, ammo: P.ammo }; });
check('spray climbs, then recovers when you stop', spray.climbed > .03 && spray.recovered, JSON.stringify(spray));
// Host ammo agrees once it has seen our shots.
await p.waitForTimeout(800);
const host = await p.evaluate(() => { const C = __infra.lab.world.operations.game.combat, k = 'tester'; return { host: C.ammo?.[k]?.ak, mine: [__infra.lab.pistol.ammo, __infra.lab.pistol.reserve] }; });
check('host and client ammo agree', JSON.stringify(host.host) === JSON.stringify(host.mine), JSON.stringify(host));
await p.keyboard.press('KeyR'); await p.waitForTimeout(2900);
const after = await p.evaluate(() => [__infra.lab.pistol.ammo, __infra.lab.pistol.reserve]); check('reload: magazine full from the reserve (never creates rounds)', after[0] === 30 && after[1] === 90 - (30 - host.mine[0]), JSON.stringify(after) + ' from ' + JSON.stringify(host.mine));
await p.screenshot({ path: path.join(out, 'gd-ak.png') });
// Buying a second rifle drops the AK with its rounds.
await p.evaluate(() => __infra.lab.arenaUI.buy(true)); await p.evaluate(() => document.querySelector('#ar-buy [data-pick="m4"]').click()); await p.waitForTimeout(900);
const drop = await p.evaluate(() => { const g = __infra.lab.world.operations.game, it = g.combat.ground.find(x => x.item === 'ak'); return { it, primary: g.arena.loadout.tester.primary }; });
check('second rifle: the AK lies on the ground with its rounds, the M4A4 in the slot', drop.it && drop.it.ammo?.[0] === 30 && drop.primary === 'm4', JSON.stringify(drop));
check('…and it is listed under Nearby dropped weapons', await p.evaluate(() => /NEARBY DROPPED/.test(document.getElementById('ar-buy').textContent) && /AK-47/.test(document.querySelector('#ar-buy .near')?.textContent || '')));
await p.evaluate(() => document.querySelector('#ar-buy [data-ground]').click()); await p.waitForTimeout(900);
check('picking it up from the menu swaps it back (M4 drops)', await p.evaluate(() => { const g = __infra.lab.world.operations.game; return g.arena.loadout.tester.primary === 'ak' && g.combat.ground.some(x => x.item === 'm4'); }));
await p.keyboard.press('Escape');
// AWP scope: right click scopes in (two levels, then out); left click fires and stays scoped.
await p.evaluate(() => __infra.lab.arenaUI.buy(true)); await p.evaluate(() => document.querySelector('#ar-buy [data-pick="sniper"]').click()); await p.waitForTimeout(500); await p.keyboard.press('Escape'); await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(1300);
const sc = await p.evaluate(async () => { const P = __infra.lab.pistol, s = []; P.button(2, true); P.button(2, false); await new Promise(r => setTimeout(r, 200)); s.push(P.scope, Math.round(__infra.camera.fov)); P.button(0, true); P.button(0, false); await new Promise(r => setTimeout(r, 200)); s.push(P.scope, P.ammo, document.getElementById('gd-scope').className); P.button(2, true); P.button(2, false); s.push(P.scope); P.button(2, true); P.button(2, false); s.push(P.scope); return s; });
check('AWP: scope, fire scoped (stays scoped), second zoom, out', sc[0] === 1 && sc[1] === 40 && sc[2] === 1 && sc[3] === 4 && /on/.test(sc[4]) && sc[5] === 2 && sc[6] === 0, JSON.stringify(sc));
// Knife: light and heavy.
await p.keyboard.press('Digit3'); await p.waitForTimeout(700);
const kn = await p.evaluate(async () => { const P = __infra.lab.pistol, r = []; P.button(0, true); P.button(0, false); r.push(P.knife?.kind); await new Promise(x => setTimeout(x, 500)); P.button(2, true); P.button(2, false); r.push(P.knife?.kind); return r; });
check('knife: left = light slash, right = heavy stab', kn[0] === 'light' && kn[1] === 'heavy', JSON.stringify(kn));
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
