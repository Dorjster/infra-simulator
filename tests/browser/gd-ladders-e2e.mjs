// Ladders in play (needs the map files: user-maps/nuke.bsp, from tools/import-cs2-models.mjs): on Nuke, standing at
// the foot of a ladder and facing it, holding W climbs it (no gravity), letting go holds on, S climbs back down.
//   node tests/browser/gd-ladders-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'LADR01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'ld-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1200, height: 750 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
await p.addInitScript(() => { localStorage.setItem('infra-name', 'Climber'); localStorage.setItem('infra-face-name', 'Climber'); localStorage.setItem('infra-face', 'smile'); });
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(800);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', 'nuke'); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.map === 'nuke', null, { timeout: 120000 });
await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy(false); });
const ladders = await p.evaluate(() => __infra.lab.arenaScene.ladders.length); check('Nuke has its ladders from the map file', ladders >= 5, ladders);
await p.waitForFunction(() => __infra.lab.world.operations.game.combat?.d?.phase && __infra.lab.world.operations.game.combat.d.phase !== 'freeze', null, { timeout: 60000 }).catch(() => {});
// The foot of a ladder: its open side (floor at its bottom), facing it.
const spot = await p.evaluate(async () => { const { ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js'), M = ARENA_MAPS.nuke, nav = M.nav;
  for (const L of __infra.lab.arenaScene.ladders) { const thinX = L.maxX - L.minX < L.maxZ - L.minZ, cx = (L.minX + L.maxX) / 2, cz = (L.minZ + L.maxZ) / 2;
    for (const sd of [-1, 1]) { const x = thinX ? (sd < 0 ? L.minX - .75 : L.maxX + .75) : cx, z = thinX ? cz : (sd < 0 ? L.minZ - .75 : L.maxZ + .75), f = nav.floorAt(x - ARENA.cx, z - ARENA.cz, L.y0 + 9.7);
      if (Number.isFinite(f) && Math.abs(f - L.y0) < 1.5) return { x: x, z: z, y: f, cx, cz, top: L.y1 }; } } return null; });
check('a ladder with floor at its foot', !!spot, JSON.stringify(spot));
if (spot) {
  await p.evaluate(s => { __infra.lab.look(s.x, s.z, s.cx, s.y + 9.7, s.cz, s.y + 9.7); }, spot); await p.waitForTimeout(400);   // standing at its foot, eyes level, facing it
  const feet = () => p.evaluate(() => __infra.camera.position.y);
  const y0 = await feet(); await p.keyboard.down('KeyW'); await p.waitForTimeout(900); const y1 = await feet();
  check('holding W at a ladder climbs it', y1 - y0 > 6, (y1 - y0).toFixed(1) + ' units up');
  await p.keyboard.up('KeyW'); await p.waitForTimeout(600); const y2 = await feet(); check('letting go holds on (no fall)', Math.abs(y2 - y1) < 1.2, (y2 - y1).toFixed(2));
  await p.keyboard.down('KeyS'); await p.waitForTimeout(900); await p.keyboard.up('KeyS'); const y3 = await feet(); check('S climbs back down', y3 < y2 - 4, (y3 - y2).toFixed(1));
  await p.screenshot({ path: path.join(out, 'ladder.jpg'), type: 'jpeg', quality: 80 });
}
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
