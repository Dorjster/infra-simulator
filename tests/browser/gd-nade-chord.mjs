// Global Defensive grenade buttons from a REAL mouse (v53, SPEC 1.2.4 / 1.2.5 / 1.2.7): Chrome's own input (CDP mouse
// events through Playwright's page.mouse), not calls into weapons.js. Under Pointer Events a second button pressed while
// one is held, and one let go while the other still is, arrive as a pointermove (a "chord"), never as pointerdown /
// pointerup — lab.js passes those changes to the grenade too. Checks, in a solo deathmatch with a smoke in hand:
//   · left alone = full ('long'), right alone = underhand ('short');
//   · left held, right pressed: the strength the preview shows changes to medium while holding (CS2: the other button);
//   · both, let go in either order = medium (CS2 m_flThrowStrength 0.5), one throw each;
//   · the throw carries the release event's own moment (e.timeStamp, s) — the sub-tick release — not the handler's;
//   · no page errors.   node tests/browser/gd-nade-chord.mjs <repo> <out>   (run through scratchpad bt2.sh: muted Chrome)
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'CHRD01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'ch-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1200, height: 750 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
await p.addInitScript(() => { localStorage.setItem('infra-name', 'Chorder'); localStorage.setItem('infra-face-name', 'Chorder'); localStorage.setItem('infra-face', 'smile');
  // what the page saw: every grenade throw started (its strength and release moment) and the last button events' moments
  globalThis.__thr = []; globalThis.__ev = []; addEventListener('gd-throw-start', e => __thr.push({ s: e.detail.a?.strength, t: e.detail.t }));
  for (const ty of ['pointerdown', 'pointerup', 'pointermove']) addEventListener(ty, e => { if (e.button === 0 || e.button === 2) __ev.push({ ty, b: e.button, bs: e.buttons, ts: e.timeStamp }); }, { capture: true }); });
let ok = 0, n = 0; const lines = []; const check = (name, c, d = '') => { n++; if (c) ok++; const l = (c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 260) : ''); lines.push(l); console.log(l); };
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 30000 }); await p.waitForTimeout(800);
await p.keyboard.press('Escape'); await p.evaluate(() => __infra.lab.enter());
const cx = 600, cy = 375; await p.mouse.move(cx, cy);
const L = { button: 'left' }, R = { button: 'right' };
// One grenade: buy a smoke, draw it (slot 4), look up a little (a short flight), then the steps; wait for the throw.
async function throwWith(name, steps, want) {
  await p.evaluate(() => __infra.lab.lan.act({ type: 'arena', action: { type: 'buy-nade', kind: 'smoke' } })); await p.keyboard.press('Digit4'); await p.waitForTimeout(900);
  const k0 = await p.evaluate(() => (__ev.length = 0, __thr.length));
  const seen = {}; for (const s of steps) { if (typeof s === 'number') await p.waitForTimeout(s); else if (s === 'strength') seen.strength = await p.evaluate(() => __infra.lab.pistol.nade?.strength); else await p.mouse[s[0]](s[1]); }
  await p.waitForTimeout(500); const r = await p.evaluate(k => ({ thr: __thr.slice(k), ev: __ev.slice() }), k0);
  check(`${name}: one throw, ${want}`, r.thr.length === 1 && r.thr[0].s === want, JSON.stringify(r.thr) + ' events ' + r.ev.map(e => e.ty[7] + e.b + ':' + e.bs).join(' '));
  // the release: the first event that let a button go while a grenade was held (a pointerup, or a chord's pointermove)
  const rel = r.ev.find(e => e.ty === 'pointerup' || (e.ty === 'pointermove' && !(e.bs & (e.b === 0 ? 1 : 2))));
  check(`${name}: thrown at the release event's own moment (e.timeStamp)`, rel && r.thr[0] && Number.isFinite(r.thr[0].t) && Math.abs(r.thr[0].t * 1000 - rel.ts) < 1e-6, JSON.stringify([rel?.ts, r.thr[0]?.t * 1000]));
  await p.waitForTimeout(700); return seen;
}
await throwWith('left alone', [['down', L], 700, ['up', L]], 'long');
await throwWith('right alone', [['down', R], 700, ['up', R]], 'short');
const s = await throwWith('left held, right pressed, let go left then right', [['down', L], 500, ['down', R], 200, 'strength', ['up', L], 30, ['up', R]], 'medium');
check('…while holding, pressing the other button changes the strength to medium (the preview\'s)', s.strength === 'medium', s.strength);
await throwWith('both, let go right then left', [['down', L], 60, ['down', R], 600, ['up', R], 20, ['up', L]], 'medium');
await throwWith('right first, then left; let go together', [['down', R], 60, ['down', L], 600, ['up', L], ['up', R]], 'medium');
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
writeFileSync(path.join(out, 'chord.txt'), lines.join('\n') + '\n' + ok + '/' + n + '\n');
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
