// Shooting arena in a real browser: start a solo deathmatch with bots from the start screen, pick an AK-47 in the buy
// menu, aim at a bot and shoot it down, kill feed + scoreboard, slots 1/2/3, bots fight back, leave cleanly.
//   node tests/browser/arena-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'ARN001', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'ar-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1400, height: 850 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
await p.addInitScript(() => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-skin', 'yellow'); localStorage.setItem('infra-name', 'Darja'); localStorage.setItem('infra-face-name', 'Darja');
  // Count 3D (panned) sounds: other players' / bots' shots, reloads and footsteps.
  globalThis.__panners = 0; const cp = AudioContext.prototype.createPanner; AudioContext.prototype.createPanner = function () { globalThis.__panners++; return cp.call(this); }; });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d ? ' · ' + String(d).slice(0, 220) : '')); };
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1500);
await p.click('[data-start=arena]'); await p.waitForTimeout(500); await p.selectOption('#ss-ar-bots', '3'); await p.click('#ss-ar-solo'); await p.waitForTimeout(3500);
const st = () => p.evaluate(() => { const g = __infra.lab.world.operations.game; return { mode: g.mode, map: g.arena?.map, bots: g.arena?.bots?.length, z: Math.round(__infra.camera.position.z), models: [...(__infra.lab.lan.models || new Map()).keys()].filter(k => k.startsWith('bot-')).length }; });
let s = await st(); check('Arena started from the start screen with 3 bots', s.mode === 'arena' && s.map === 'yard' && s.bots === 3, JSON.stringify(s));
check('Player is in the arena and bots are drawn', s.z < -240 && s.models === 3, JSON.stringify(s));
check('Campaign HUD and hotbar hidden in the arena', await p.evaluate(() => getComputedStyle(document.getElementById('inventory')).display === 'none' && getComputedStyle(document.getElementById('eng-objective') || document.body).display === 'none'));
check('Buy menu opens on entry (no primary yet)', await p.evaluate(() => !document.getElementById('ar-buy').hidden));
await p.screenshot({ path: path.join(out, 'buy-menu.png') });
await p.click('#ar-buy [data-pick="ak"]'); await p.waitForTimeout(600); await p.click('#ar-buy [data-act="close"]');
check('AK-47 in the loadout and in hand', await p.evaluate(() => __infra.lab.world.operations.game.arena.loadout.darja?.primary === 'ak' && __infra.lab.pistol.current?.id === 'ak'));
await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(400);
for (const [k, want] of [['3', 'karambit'], ['2', 'pistol'], ['1', 'ak']]) { await p.keyboard.press(k); await p.waitForTimeout(150); check('Key ' + k + ' selects ' + want, await p.evaluate(w => __infra.lab.pistol.current?.id === w, want)); }
await p.screenshot({ path: path.join(out, 'arena-view.png') });
for (let i = 0; i < 2; i++) await p.evaluate(() => __infra.lab.lan.send({ type: 'arena', action: { type: 'remove-bot' } })); await p.waitForTimeout(800);
check('Removing bots leaves one', await p.evaluate(() => __infra.lab.world.operations.game.arena.bots.length === 1 && [...__infra.lab.lan.models.keys()].filter(k => k.startsWith('bot-')).length === 1));
// Aim at the nearest bot and fire until it drops (bots move: re-aim every shot).
const killed = await p.evaluate(async () => { const AM = await import('./arena-maps.js'); const L = __infra.lab, cam = __infra.camera, G = () => L.world.operations.game, g0 = G(), sleep = t => new Promise(r => setTimeout(r, t));
  const bot = g0.arena.bots[0]; const name = bot.name, k0 = G().combat.kills?.darja || 0, log = [], dbg = { fired: 0, spot: 0, nospot: 0, nomodel: 0, down: 0 }; const c0 = L.lan.combat; L.lan.combat = a => c0(a).then(r => { log.push(r?.error || r?.result?.message || r?.result); return r; });
  for (let i = 0; i < 80; i++) { const m = L.lan.models.get(bot.id); if (!m) { dbg.nomodel++; await sleep(100); continue; } if (__infra.lab.combatHud?.down || G().combat.down?.darja) { dbg.down++; await sleep(300); continue; } const t = m.g.position, B = L.arenaScene?.boxes || AM.mapBoxes(AM.ARENA_MAPS[G().arena.map], 0, -400); let spot = null; for (let a = 0; a < 16 && !spot; a++) { const x = t.x + Math.sin(a * .3927) * 12, z = t.z + Math.cos(a * .3927) * 12; if (AM.walkable(B, { minX: -150, maxX: 150, minZ: -550, maxZ: -250 }, x, z) && AM.lineOfSight(B, x, z, t.x, t.z)) spot = [x, z]; } if (!spot) { dbg.nospot++; await sleep(100); continue; } dbg.spot++; cam.position.set(spot[0], 9.7, spot[1]); cam.lookAt(t.x, t.y + 7.5, t.z); cam.updateMatrixWorld(); if (L.pistol.ammo === 0) { L.pistol.reload(); await sleep(2700); } dbg.fired += L.pistol.fire() ? 1 : 0; dbg.tg = L.pistol && __infra.lab.lan.models.size; await sleep(140); if ((G().combat.kills?.darja || 0) > k0) return { ok: true, i, name }; }
  return { ok: false, kills: G().combat.kills, hp: G().combat.hp, log: log.slice(-6), dbg, cur: L.pistol.current?.id, ammo: L.pistol.ammo, down: L.combatHud?.down }; });
check('Shooting a bot with the AK-47 kills it (host-checked)', killed.ok, JSON.stringify(killed));
await p.waitForTimeout(400);
check('Kill feed shows Darja ⟶ the bot', await p.evaluate(n => [...document.querySelectorAll('#ar-feed p')].some(x => x.innerText.includes('Darja') && x.innerText.includes(n)), killed.name));
await p.keyboard.down('Tab'); await p.waitForTimeout(400); await p.screenshot({ path: path.join(out, 'scoreboard.png') });
check('Tab shows the scoreboard with kills', await p.evaluate(() => !document.getElementById('ar-board').hidden && /Darja/.test(document.getElementById('ar-board').innerText)));
await p.keyboard.up('Tab'); await p.waitForTimeout(200); check('Releasing Tab hides it', await p.evaluate(() => document.getElementById('ar-board').hidden));
await p.evaluate(() => __infra.lab.lan.send({ type: 'arena', action: { type: 'add-bot', count: 3 } })); await p.waitForTimeout(500);
// Bots keep fighting for 20 s (each other and the player).
await p.waitForTimeout(20000); const fight = await p.evaluate(() => { const c = __infra.lab.world.operations.game.combat; return { kills: Object.values(c.kills || {}).reduce((a, b) => a + b, 0), feed: c.feed.length }; });
check('Bots fight (kills keep coming)', fight.kills >= 2, JSON.stringify(fight));
const pan = await p.evaluate(() => globalThis.__panners); check('Bots are heard in 3D (shots, reloads, footsteps through panners)', pan > 20, pan);
check('Scoreboard shows real names (no lowercase keys)', await p.evaluate(() => { document.getElementById('ar-board').hidden = false; return true; }) && !/\bbot [a-z]/.test(await p.evaluate(() => document.getElementById('ar-top').innerText + document.getElementById('ar-board').innerText)));
const fr = await p.evaluate(() => new Promise(r => { const t = []; let last = performance.now(); const t0 = last; const f = now => { t.push(now - last); last = now; if (now - t0 < 3000) requestAnimationFrame(f); else { t.sort((a, b) => a - b); r({ fps: Math.round(1000 / (t.reduce((a, b) => a + b, 0) / t.length)), p95: +t[Math.floor(t.length * .95)].toFixed(1), max: Math.round(t.at(-1)) }); } }; requestAnimationFrame(f); }));
check('Smooth in the arena (60 fps, no long frames)', fr.fps >= 55 && fr.max < 100, JSON.stringify(fr));
check('No page errors', !errs.length, errs.join(' | '));
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
