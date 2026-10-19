// Global Defensive quick buys in a real browser (solo Defuse on Dust II): F in the buy menu buys the full set for your
// side (Kevlar + Helmet, rifle, smoke, flash) through the normal buy actions; after a restart (gear gone) R rebuys
// exactly last round's purchases; R again buys nothing you already have (grenades counted, not stacked). Money comes
// from the host's rules ($16,000 start), set with the real host actions.
//   node tests/browser/gd-quickbuy-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'QB0001', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'qb-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });   // (a test that throws never leaves its room running)
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 260) : '')); };
await p.addInitScript(() => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', 'Darja'); localStorage.setItem('infra-face-name', 'Darja'); });
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
await p.selectOption('#ss-ar-kind', 'defuse'); await p.selectOption('#ss-ar-map', 'dust2'); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) && __infra.lab.world.operations.game.combat?.d?.teams?.darja, null, { timeout: 30000 });
const S = () => p.evaluate(() => { const g = __infra.lab.world.operations.game, d = g.combat.d, l = g.arena.loadout?.darja || {}, a = g.combat.armor?.darja || {};
  return { n: d.n, phase: d.round.phase, team: d.teams.darja, money: d.money.darja, primary: l.primary || null, nades: [...(l.nades || [])].sort(), kevlar: a.kevlar || 0, helmet: !!a.helmet, bought: (d.bought?.darja || []).map(x => x.item), spent: (d.bought?.darja || []).reduce((s, x) => s + x.price, 0) }; });
const host = a => p.evaluate(a => __infra.lab.lan.send({ type: 'arena', action: a }), a);
const restart = async () => { const at = await p.evaluate(() => __infra.lab.world.operations.game.combat.d.round.at); await host({ type: 'restart' }); await p.waitForFunction(at => { const d = __infra.lab.world.operations.game.combat?.d; return d?.round && d.round.at !== at && d.money?.darja === 16000; }, at, { timeout: 15000 }); await p.waitForTimeout(600); };
const r0 = await host({ type: 'settings', rules: { start: 16000 } }); check('host rules: $16,000 start from the next match', /16000/.test(JSON.stringify(r0)), JSON.stringify(r0));
await restart();
await p.keyboard.press('KeyB'); await p.waitForTimeout(400);
check('the buy menu shows Rebuy (disabled: nothing bought before) and Full buy', await p.evaluate(() => { const r = document.querySelector('#ar-buy [data-act="rebuy"]'), f = document.querySelector('#ar-buy [data-act="full"]'); return !!r && r.disabled && !!f && !f.disabled; }));
await p.keyboard.press('KeyF'); await p.waitForFunction(() => (__infra.lab.world.operations.game.combat.d.bought?.darja || []).length >= 4, null, { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(400);
let s = await S(); const T = s.team;
check('F: full buy for your side — Kevlar + Helmet, ' + (T === 'ct' ? 'M4A4, kit' : 'AK-47') + ', smoke, flash', s.primary === (T === 'ct' ? 'm4' : 'ak') && s.kevlar >= 100 && s.helmet && s.nades.join() === 'flash,smoke', JSON.stringify(s));
check('…each paid for through the normal buy actions ($16,000 − what the log shows)', s.money === 16000 - s.spent && s.spent > 3000, JSON.stringify([s.money, s.spent, s.bought]));
const first = s.bought.join();
await p.screenshot({ path: path.join(out, 'quickbuy-menu.png') });
// The match restarts (gear gone, $16,000 again): R buys last round's purchases again.
await restart();
if (await p.evaluate(() => document.getElementById('ar-buy').hidden)) await p.keyboard.press('KeyB'); else await p.evaluate(() => __infra.lab.arenaUI.buy(true)); await p.waitForTimeout(300);
check('next round: Rebuy is available and lists last round’s items', await p.evaluate(() => { const r = document.querySelector('#ar-buy [data-act="rebuy"]'); return !!r && !r.disabled && /AK|M4/.test(r.title); }));
await p.keyboard.press('KeyR'); await p.waitForFunction(() => (__infra.lab.world.operations.game.combat.d.bought?.darja || []).length >= 4, null, { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(400);
s = await S(); check('R: rebuys exactly last round’s purchases', s.bought.join() === first && s.primary === (T === 'ct' ? 'm4' : 'ak') && s.helmet && s.nades.join() === 'flash,smoke', JSON.stringify([first, s]));
const m = s.money; await p.keyboard.press('KeyR'); await p.waitForTimeout(1200); s = await S();
check('R again: nothing bought (all owned; grenades are not stacked)', s.money === m && s.nades.join() === 'flash,smoke', JSON.stringify(s));
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
