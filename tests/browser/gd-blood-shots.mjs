// Global Defensive blood in the real game (practice, one standing bot) — a picture run: the bot is shot from the side
// opposite a wall close behind it (two body shots, then a head shot) with the game's own gun (lab.pistol.fire, the host
// trace → combat.bl → gd-blood.js), pictures of the spray just after a shot and of the decals on the wall after.
// Uses GD_ASSETS_DIR when set (CS2's imported blood pictures), else the built-in ones.
//   node tests/browser/gd-blood-shots.mjs <repo-root> <out-dir> [map]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-blood-shots'), MAP = 'dust2'] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDBL01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdbl-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
let serr = ''; server.stderr.on('data', d => { serr += d; });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + serr.slice(-300))), 120000); server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio'] });
const errs = [], report = {}; let failed = 0; const check = (name, c, d = '') => { if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c || d === '' ? '' : ' · ' + String(d).slice(0, 300))); };
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', 'practice'); await p.selectOption('#ss-ar-map', MAP); await p.selectOption('#ss-ar-bots', '1'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 });
  await p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); }); await p.waitForTimeout(3000);
  // a spot: the bot's chest with a wall 4-14 units behind it and 22 clear units the other way (where we stand)
  const plan = await p.evaluate(async () => { const { bulletPath, BulletPath } = await import('/arena-maps.js'); const G = __infra.lab.world.operations.game, bot = G.arena.bots[0], bx = __infra.lab.arenaScene.boxes;
    // (its feet: bot.y when the nav set it, else the floor under it — straight down from above its head, then from high up)
    const down = y0 => { const P = bulletPath(bx, bot.x, y0, bot.z, 0, -1, 0, 400, 0, new BulletPath()); return Number.isFinite(P.stop) && P.stop < 400 ? y0 - P.stop : null; };
    const feet = Number.isFinite(bot.y) ? bot.y : down(14) ?? down(120) ?? 0, cy = feet + 7.9; let best = null, any = null;
    for (let k = 0; k < 32; k++) { const a = k / 32 * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      const back = bulletPath(bx, bot.x, cy, bot.z, dx, 0, dz, 60, 0, new BulletPath()).stop, front = bulletPath(bx, bot.x, cy + 1.8, bot.z, -dx, 0, -dz, 60, 0, new BulletPath()).stop;
      if (back > 3 && back < 20 && front > 16 && (!best || back < best.back)) best = { a, dx, dz, back, front };
      if (back > 2 && back < 26 && front > 10 && (!any || front - back > any.front - any.back)) any = { a, dx, dz, back, front }; }
    best = best || any;
    return { bot: { name: bot.name, x: bot.x, z: bot.z, feet }, best, blood: __gdBlood?.stats }; });
  report.plan = plan; console.log('plan', JSON.stringify(plan));
  check('a standing bot with a wall close behind it', !!plan.best, JSON.stringify(plan));
  if (plan.best) {
    const { bot, best } = plan, D = Math.min(18, best.front - 2), eye = [bot.x - best.dx * D, bot.feet + 9.7, bot.z - best.dz * D];
    const aim = (ty, side = 0) => p.evaluate(({ eye, bot, ty, side, best }) => { const tx = bot.x + best.dz * side, tz = bot.z - best.dx * side; __infra.lab.look(eye[0], eye[2], tx, ty, tz, eye[1]); __infra.camera.position.set(eye[0], eye[1], eye[2]); __infra.camera.lookAt(tx, ty, tz); }, { eye, bot, ty, side, best });
    const settle = async ty => { for (let k = 0; k < 3; k++) { await aim(ty); await p.waitForTimeout(250); } };
    const stats = () => p.evaluate(() => ({ ...__gdBlood.stats, bl: (__infra.lab.world.operations.game.combat?.bl || []).length, hp: __infra.lab.world.operations.game.combat?.hp }));
    await settle(bot.feet + 7.9); await p.screenshot({ path: path.join(out, '0-before.jpg'), type: 'jpeg', quality: 85 });
    const s0 = await stats();
    await p.evaluate(() => __infra.lab.pistol.fire()); await p.waitForTimeout(450); await aim(bot.feet + 7.9);
    await p.evaluate(() => __infra.lab.pistol.fire()); await p.waitForTimeout(90); await p.screenshot({ path: path.join(out, '1-body-spray.jpg'), type: 'jpeg', quality: 85 });
    const s1 = await stats(); await p.waitForTimeout(500); await settle(bot.feet + 10.2);
    await p.evaluate(() => __infra.lab.pistol.fire()); await p.waitForTimeout(90); await p.screenshot({ path: path.join(out, '2-head-spray.jpg'), type: 'jpeg', quality: 85 });
    const s2 = await stats(); await p.waitForTimeout(1800); await aim(bot.feet + 6); await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(out, '3-decals.jpg'), type: 'jpeg', quality: 85 });
    const s3 = await stats(); report.stats = { s0, s1, s2, s3 }; console.log('stats', JSON.stringify(report.stats));
    check('the body shots bled (host records drawn: spray + decals)', s1.hits > s0.hits && s1.sHead !== s0.sHead, JSON.stringify([s0, s1]));
    check('the head shot bled too', s2.hits > s1.hits, JSON.stringify([s1, s2]));
    check('decals placed', s3.decals > 0, JSON.stringify(s3));
    report.source = s3.source; console.log('pictures:', s3.source);
    // the wall behind: a close look at the decals
    const near = [bot.x - best.dx * 6, bot.feet + 8.5, bot.z - best.dz * 6], at = [bot.x + best.dx * best.back, bot.feet + 6, bot.z + best.dz * best.back];
    await p.evaluate(({ near, at }) => { __infra.lab.look(near[0], near[2], at[0], at[1], at[2], near[1]); __infra.camera.position.set(...near); __infra.camera.lookAt(...at); }, { near, at }); await p.waitForTimeout(300);
    await p.evaluate(({ near, at }) => { __infra.camera.position.set(...near); __infra.camera.lookAt(...at); }, { near, at });
    await p.screenshot({ path: path.join(out, '4-wall-close.jpg'), type: 'jpeg', quality: 85 });
  }
  report.errs = errs; writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  check('no page errors', !errs.length, errs.slice(0, 5).join(' | '));
} finally { await b.close(); server.kill(); }
console.log(failed ? `FAIL: ${failed}` : 'PASS: blood shots'); process.exit(failed ? 1 : 0);
