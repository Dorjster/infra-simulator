// Knives and their skins over LAN (two browsers, Defuse on Dust II, no bots): Darja hosts, Bob joins. Darja gives Bob a
// knife and a skin; Bob picks his own knife and his own skin; a gun takes no skin. On Bob's screen the knife in his
// hands is the chosen one and painted; on Darja's, Bob's knife wears his skin. No page errors.
//   node tests/browser/gd-knives-lan-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out_dir] = process.argv.slice(2); mkdirSync(out_dir, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDKNF1', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gk-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });   // (a test that throws never leaves its room running)
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const browsers = [], launch = () => chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 260) : '')); }; const errs = [];
async function open(who) { const bw = await launch(); browsers.push(bw); const p = await (await bw.newContext({ viewport: { width: 1100, height: 700 } })).newPage(); p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(n => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n); }, who);
  await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200); return p; }
try {
  const D = await open('Darja'), B = await open('Bob');
  await D.evaluate(() => document.querySelector('[data-start=arena]').click()); await D.waitForTimeout(400); await D.selectOption('#ss-ar-kind', 'defuse'); await D.selectOption('#ss-ar-map', 'dust2'); await D.selectOption('#ss-ar-bots', '0');
  await D.evaluate(() => document.getElementById('ss-ar-host').click()); await D.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d, null, { timeout: 120000 });
  const code = await D.evaluate(() => __infra.lab.lan.roomCode);
  await B.evaluate(() => document.querySelector('[data-start=join]').click()); await B.waitForSelector('#ss-code'); await B.fill('#ss-jname', 'Bob'); await B.fill('#ss-code', code); await B.evaluate(() => document.getElementById('ss-join').click());
  await B.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.world.operations.game.combat?.d?.teams?.bob, null, { timeout: 120000 }); await B.waitForTimeout(3000);
  const act = (p, a) => p.evaluate(a => __infra.lab.lan.act({ type: 'arena', action: a }).catch(e => ({ error: e.message })), a), say = r => JSON.stringify(r);
  const hands = () => B.evaluate(() => { const P = __infra.lab.pistol, v = P.viewInfo; return { holding: P.current?.id, set: v.set, authored: v.authored, painted: v.skinMats.filter(m => m.userData?.skinU?.uSkinOn.value).length }; });
  const toKnife = async () => { for (let i = 0; i < 20; i++) { if (await B.evaluate(() => { const P = __infra.lab.pistol; if (P.current?.id !== 'knife') P.equip('knife'); return P.current?.id === 'knife'; })) break; await B.waitForTimeout(500); }
    await B.waitForTimeout(600); await B.waitForFunction(() => __infra.lab.pistol.viewInfo.authored, null, { timeout: 60000 }).catch(() => {}); await B.waitForTimeout(1200); };
  const r1 = await act(D, { type: 'knife', knife: 'butterfly', for: 'Bob' }), r2 = await act(D, { type: 'skin', weapon: 'knife', for: 'Bob', skin: { finish: 'fade', wear: .02, seed: 7 } });
  check('Darja gives Bob a knife and a skin', /Butterfly Knife equipped on Bob/.test(say(r1)) && /given to Bob/.test(say(r2)), say([r1, r2]));
  await toKnife(); const h1 = await hands();
  check('Bob holds the butterfly Darja gave him, painted', h1.holding === 'knife' && h1.set === 'butterfly' && h1.painted > 0, say(h1)); await B.screenshot({ path: path.join(out_dir, 'bob-gift.png') });
  const r3 = await act(B, { type: 'knife', knife: 'm9' }); await B.waitForTimeout(800); await toKnife(); const h2 = await hands();
  check('Bob picks his own knife (an M9) and holds it, still painted', /M9 Bayonet equipped/.test(say(r3)) && h2.set === 'm9' && h2.painted > 0, say([r3, h2]));
  const r4 = await act(B, { type: 'skin', weapon: 'knife', skin: { finish: 'tiger', wear: .1, seed: 3 } }); await B.waitForTimeout(1200);
  check('Bob picks his own skin for it', /Tiger Tooth/.test(say(r4)) && (await hands()).painted > 0 && await B.evaluate(() => __infra.lab.world.operations.game.arena.skins.bob.knife.finish === 'tiger'), say(r4)); await B.screenshot({ path: path.join(out_dir, 'bob-own.png') });
  check('a gun takes no skin', /knives/.test(say(await act(B, { type: 'skin', weapon: 'ak', skin: { finish: 'fade' } }))));
  check('only Darja equips a knife on someone else', /Only Darja/.test(say(await act(B, { type: 'knife', knife: 'stiletto', for: 'Darja' }))));
  const bp = await B.evaluate(() => { const c = __infra.camera.position; return { x: c.x, y: c.y, z: c.z }; });
  await D.evaluate(b => __infra.lab.look(b.x + 6, b.z + 6, b.x, b.y - 2, b.z, b.y), bp); await D.waitForTimeout(2500);
  const seen = await D.evaluate(() => { const m = [...__infra.lab.lan.models.values()].find(x => /bob/i.test(x.name || x.pname || '')); if (!m?.cs) return null; let painted = 0; m.cs.g.traverse(o => { if (o.isMesh && o.material?.userData?.skinU?.uSkinOn.value) painted++; }); return { visible: m.g.visible, painted }; });
  check('Darja sees Bob\'s knife wearing his skin', !!seen && seen.painted > 0, say(seen)); await D.screenshot({ path: path.join(out_dir, 'darja-sees-bob.png') });
  check('no page errors', errs.length === 0, errs.slice(0, 4).join(' | '));
} finally { console.log((ok === n ? 'PASS' : 'FAIL') + ': knives over LAN · ' + ok + '/' + n); for (const b of browsers) await b.close(); server.kill(); process.exitCode = ok === n ? 0 : 1; }
