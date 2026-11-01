// Third-person holds over LAN (package T, v52; two browsers, Deathmatch on the built-in Yard, no bots): Darja hosts, Bob
// joins. Bob holds an AK, a Deagle and his knife in his own third-person view (P): his body there is the character the
// room dresses him in (his side's CS2 agent — before v52 the engineer avatar), and on Darja's screen Bob's agent holds each
// item exactly as Bob sees himself: the gun's muzzle within 2 cm, its barrel along the same line (dot > .98) and both hands
// within 3 cm, each in the agent's own frame. Needs the CS2 agents imported on this computer (user-assets): skipped without.
//   node tests/browser/gd-holds-lan-e2e.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out_dir = path.join(os.tmpdir(), 'gd-holds-lan')] = process.argv.slice(2); mkdirSync(out_dir, { recursive: true });
if (!existsSync(path.join(root, 'user-assets', 'agents', 'cs2_anims.glb'))) { console.log('SKIP: no CS2 agents imported on this computer'); process.exit(0); }
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDHLD1', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gh-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const browsers = [], launch = () => chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); }; const errs = [];
async function open(who) { const bw = await launch(); browsers.push(bw); const p = await (await bw.newContext({ viewport: { width: 1100, height: 700 } })).newPage(); p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('dialog', d => d.accept());
  await p.addInitScript(n => { localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-name', n); localStorage.setItem('infra-face-name', n); }, who);
  await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200); return p; }
// In a page: a body's hold in its own frame (g: game units, facing −z) — the muzzle point, the barrel, both hands. which: 'self' (the third-person view's body) or a player's name (their remote agent).
const measure = (p, which) => p.evaluate(async which => { const THREE = await import('/three.module.js'), L = __infra.lab;
  const body = which === 'self' ? L.thirdPerson.model : [...L.lan.models.values()].find(m => new RegExp(which, 'i').test(m.name || m.pname || ''))?.cs; if (!body?.g) return { missing: which };
  const g = body.g; g.updateMatrixWorld(true); const wpn = g.getObjectByName('wpn'); if (!wpn) return { notAgent: true };
  const turn = g.getObjectByName('wpn-turn'), gun = turn?.children[0]; if (!gun) return { noGun: true };
  const at = o => g.worldToLocal(o.getWorldPosition(new THREE.Vector3())).toArray(), q = gun.getWorldQuaternion(new THREE.Quaternion()), gq = g.getWorldQuaternion(new THREE.Quaternion()).invert();
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q).applyQuaternion(gq).toArray(), mz = g.worldToLocal(gun.localToWorld(new THREE.Vector3(0, 0, -4))).toArray();   // (a point 4 units down the barrel: the same model on both sides)
  let verts = 0; gun.traverse(o => { if (o.isMesh) verts += o.geometry.attributes.position.count; });
  return { fwd, mz, hR: at(g.getObjectByName('hand_R')), hL: at(g.getObjectByName('hand_L')), wpn: at(wpn), verts, visible: g.visible }; }, which);
try {
  const D = await open('Darja'), B = await open('Bob');
  await D.evaluate(() => document.querySelector('[data-start=arena]').click()); await D.waitForTimeout(400); await D.selectOption('#ss-ar-kind', 'dm'); await D.selectOption('#ss-ar-map', 'yard'); await D.selectOption('#ss-ar-bots', '0');
  await D.evaluate(() => document.getElementById('ss-ar-host').click()); await D.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 180000 });
  const code = await D.evaluate(() => __infra.lab.lan.roomCode);
  await B.evaluate(() => document.querySelector('[data-start=join]').click()); await B.waitForSelector('#ss-code'); await B.fill('#ss-jname', 'Bob'); await B.fill('#ss-code', code); await B.evaluate(() => document.getElementById('ss-join').click());
  await B.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 180000 }); await B.waitForTimeout(3000);
  for (const P of [D, B]) if (await P.evaluate(() => { const e = document.getElementById('start-screen'); return !!e && !e.hidden; })) await P.keyboard.press('Escape');
  const act = (p, a) => p.evaluate(a => __infra.lab.lan.act({ type: 'arena', action: a }).catch(e => ({ error: e.message })), a);
  await act(B, { type: 'loadout', primary: 'ak', secondary: 'deagle' }); await B.waitForTimeout(1500);
  await B.evaluate(() => { if (!__infra.lab.thirdPerson.on) __infra.lab.thirdPerson.toggle(); });
  const cm = x => (x * 16.5).toFixed(1) + ' cm', dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (const id of ['ak', 'deagle', 'knife']) {
    for (let i = 0; i < 20; i++) { if (await B.evaluate(id => { const P = __infra.lab.pistol; if (P.current?.id !== id) P.equip(id); return P.current?.id === id; }, id)) break; await B.waitForTimeout(400); }
    await B.waitForTimeout(2500);   // (the pose reaches the room and Darja; both bodies settle into the hold)
    const bp = await B.evaluate(() => { const c = __infra.camera.position; return { x: c.x, y: c.y, z: c.z }; }); await D.evaluate(b => __infra.lab.look(b.x + 5, b.z - 7, b.x, b.y - 2, b.z, b.y), bp); await D.waitForTimeout(2000);
    const mine = await measure(B, 'self'), seen = await measure(D, 'bob');
    if (id === 'ak') check('Bob\'s own third-person body is the character the room dresses him in (a CS2 agent, not the engineer avatar)', !mine.missing && !mine.notAgent && !mine.noGun, JSON.stringify(mine).slice(0, 200));
    const okBoth = mine.fwd && seen.fwd, dm = okBoth ? dist(mine.mz, seen.mz) : 9, dd = okBoth ? dot(mine.fwd, seen.fwd) : 0, dh = okBoth ? Math.max(dist(mine.hR, seen.hR), dist(mine.hL, seen.hL)) : 9;
    check(`${id}: Darja sees Bob hold it as Bob sees himself (barrel point < 2 cm, line dot > .98, hands < 3 cm, same model)`, okBoth && dm < .12 && dd > .98 && dh < .18 && mine.verts === seen.verts, okBoth ? `point ${cm(dm)} · dot ${dd.toFixed(4)} · hands ${cm(dh)} · verts ${mine.verts}/${seen.verts}` : JSON.stringify({ mine, seen }).slice(0, 240));
    await B.screenshot({ path: path.join(out_dir, `bob-self-${id}.png`) }); await D.screenshot({ path: path.join(out_dir, `darja-sees-bob-${id}.png`) }); }
  check('no page errors', errs.length === 0, errs.slice(0, 4).join(' | '));
} catch (e) { check('ran to the end', false, e.stack || e.message); }
finally { console.log((ok === n ? 'PASS' : 'FAIL') + ': holds over LAN · ' + ok + '/' + n); for (const b of browsers) await b.close(); server.kill(); process.exitCode = ok === n ? 0 : 1; }
