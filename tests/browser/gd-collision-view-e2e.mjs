// The collision view and shots at a wall, in a real browser (Global Defensive practice; a CS2 map file when this computer
// has one — user-maps/mirage.bsp — else built-in Dust II): off, nothing of it is made; Practice menu → Collision shapes
// draws the player boxes, the bullets' boxes and (CS2 maps) CS2's own triangles round you; no hitch while it is on;
// the console switch works; leaving practice switches it off. Pressed to a wall by the movement, a shot into it leaves
// its impact on the wall's own surface, facing back out (CS2 maps: within 1 Hammer unit of a sight triangle).
//   node tests/browser/gd-collision-view-e2e.mjs <repo-root> <out-dir> [map]
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, existsSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out, want] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const map = want || (existsSync(path.join(root, 'user-maps', 'mirage.bsp')) ? 'mirage' : 'dust2');
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'COLV01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'cv-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });   // (a test that throws never leaves its room running)
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1200, height: 750 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
let ok = 0, n = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
await p.addInitScript(() => { localStorage.setItem('infra-name', 'Surveyor'); localStorage.setItem('infra-face-name', 'Surveyor'); localStorage.setItem('infra-face', 'smile'); });
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(800);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForSelector('#ss-ar-kind');
await p.selectOption('#ss-ar-kind', 'practice'); await p.waitForTimeout(200); await p.selectOption('#ss-ar-map', map); await p.selectOption('#ss-ar-bots', '0'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(m => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.map === m, map, { timeout: 120000 });
await p.evaluate(() => { __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy(false); __infra.lab.enter(); }); await p.waitForTimeout(1200);
const cs2 = await p.evaluate(() => !!__infra.lab.arenaScene.boxes.bullets?.fine); console.log('map', map, cs2 ? '(a CS2 file: the fine phase is on)' : '(no triangles: boxes only)');
// The view's line layers (gd-collision-view.js: drawn last, over everything).
const layers = () => p.evaluate(async () => { const { COLLISION_VIEW } = await import('/gd-collision-view.js'), L = []; __infra.scene.traverse(o => { let v = true; for (let q = o; q; q = q.parent) v &&= q.visible;   /* (drawn: it and every parent shown) */ if (o.isLineSegments && o.renderOrder === 999 && o.userData.gd) L.push({ visible: v, n: o.geometry.drawRange.count / 2, color: o.material.color.getHexString() }); }); return { on: COLLISION_VIEW.on, L }; });
const off0 = await layers(); check('off: nothing of the view is made', !off0.on && off0.L.length === 0, JSON.stringify(off0));
// Pressed to a wall: walked into the nearest one from the spawn with the game's own movement.
const spot = await p.evaluate(async () => { const { createMoveState, moveFor } = await import('/arena-move.js'), sc = __infra.lab.arenaScene, boxes = sc.boxes, M = boxes.nadeMesh, c = __infra.camera.position, HU = 2.54 / 16.5, world = { boxes, bounds: sc.bounds, ladders: [] };
  let best = null; for (let a = 0; a < 16; a++) { const yaw = a * Math.PI / 8, wish = [Math.cos(yaw), Math.sin(yaw)], st = createMoveState(c.y - 9.7); st.x = c.x; st.z = c.z; let lx = st.x, lz = st.z, still = 0, walked = 0;
    for (let k = 0; k < 300 && still < 6; k++) { moveFor(st, { wish, weapon: 'ak', look: wish, pitch: 0 }, world, 1 / 64); const d = Math.hypot(st.x - lx, st.z - lz); walked += d; if (d < .002) still++; else still = 0; lx = st.x; lz = st.z; }
    if (still < 6 || !st.onGround || walked < 3) continue; const e = [st.x, st.y + 9.7, st.z], w = M?.first ? M.first(...e, e[0] + wish[0] * 60 * HU, e[1], e[2] + wish[1] * 60 * HU, true, null) : 0;
    if (Number.isFinite(w) && (!best || walked < best.walked)) best = { x: st.x, z: st.z, y: e[1], wish, walked, standoff: M?.first ? +(w * 60).toFixed(1) : null }; }
  return best; });
check('a spot pressed to a wall (the movement walked into it)', !!spot, JSON.stringify(spot));
if (spot) {
  // A shot straight into it: the impact on the wall's surface, its mark facing back out.
  await p.evaluate(async () => { await __infra.lab.lan.act({ type: 'arena', action: { type: 'loadout', primary: 'ak' } }); __infra.lab.arenaUI?.buy(false); __infra.lab.pistol.equip('ak'); }); await p.waitForTimeout(1300);
  await p.evaluate(s => __infra.lab.look(s.x, s.z, s.x + s.wish[0] * 20, s.y, s.z + s.wish[1] * 20, s.y), spot); await p.waitForTimeout(300);
  // (ends[0]: where the bullet met the wall — its stop, or the entry hole when the AK went through thin plaster)
  const hit = await p.evaluate(() => { __infra.lab.pistol.fire(); const L = __infra.lab.pistol.lastShot, e = L?.ends?.[0], M = __infra.lab.arenaScene.boxes.nadeMesh, HU = 2.54 / 16.5; if (!e?.normal) return null; const d = L.dir, q = e.point;
    const on = M?.first ? M.first(q.x - d.x * HU, q.y - d.y * HU, q.z - d.z * HU, q.x + d.x * HU, q.y + d.y * HU, q.z + d.z * HU, true, null) < Infinity : null;
    return { dist: +q.distanceTo(L.origin).toFixed(2), onMesh: on, facing: +(e.normal.x * d.x + e.normal.y * d.y + e.normal.z * d.z).toFixed(3) }; });
  check('a shot into the wall you stand at: its impact on the wall' + (cs2 ? ' (within 1 Hammer unit of CS2\'s surface)' : '') + ', facing back out', !!hit && hit.facing < -.2 && (cs2 ? hit.onMesh === true : true) && hit.dist < 6, JSON.stringify(hit));
  await p.evaluate(s => { const a = Math.atan2(s.wish[1], s.wish[0]) + .75; __infra.lab.look(s.x, s.z, s.x + Math.cos(a) * 20, s.y - 2, s.z + Math.sin(a) * 20, s.y); }, spot); await p.waitForTimeout(300);   // (along the wall, a little down: boxes and triangles in view)
}
// On from the Practice menu (Esc).
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
const btn = await p.evaluate(() => document.querySelector('#gd-menu .gm-practice [data-gm=collision]')?.textContent || null); check('Esc: the practice menu offers the collision shapes (off)', /Collision shapes: off/.test(btn || ''), btn);
await p.evaluate(() => document.querySelector('#gd-menu .gm-practice [data-gm=collision]').click()); await p.waitForTimeout(300);
const btn2 = await p.evaluate(() => document.querySelector('#gd-menu .gm-practice [data-gm=collision]')?.textContent || null); check('…clicked: on', /Collision shapes: on/.test(btn2 || ''), btn2);
await p.evaluate(() => document.querySelector('#gd-menu [data-gm=resume]')?.click()); await p.waitForTimeout(800);
const on1 = await layers(), lay = c => on1.L.find(l => l.color === c) || { n: 0, visible: false };
check('on: the player boxes round you are drawn', on1.on && lay('3dff6a').visible && lay('3dff6a').n > 12, JSON.stringify(on1.L));
if (cs2) check('…and the bullets\' boxes and CS2\'s triangles (white: sight and bullets)', lay('ff9a2a').n > 12 && lay('ffffff').n > 30, JSON.stringify(on1.L.map(l => l.color + ':' + l.n)));
await p.screenshot({ path: path.join(out, 'collision-view.jpg'), type: 'jpeg', quality: 85 });
const frames = await p.evaluate(() => new Promise(res => { const ts = []; let last = performance.now(); const f = t => { ts.push(t - last); last = t; if (ts.length < 150) requestAnimationFrame(f); else res(ts.slice(5)); }; requestAnimationFrame(f); }));
check('no hitch with it on (no frame over 50 ms)', Math.max(...frames) < 50, 'max ' + Math.max(...frames).toFixed(1));
// A map rebuilt (another map, then this one again — as when a map file arrives for the map in play): still drawn (review A-4: clearMap dropped the layers).
const other = map === 'yard' ? 'town' : 'yard'; await p.evaluate(o => __infra.lab.arenaScene.show(o), other); await p.waitForTimeout(1200); await p.evaluate(m => __infra.lab.arenaScene.show(m), map); await p.waitForTimeout(2000);
const re = await layers(), relay = c => re.L.find(l => l.color === c) || { n: 0, visible: false }; check('…a map rebuilt: the view still draws it', re.on && relay('3dff6a').visible && relay('3dff6a').n > 12, JSON.stringify(re.L.map(l => l.color + ':' + l.n + (l.visible ? '' : ' hidden'))));
// The console switch (development: __infra.lab.arenaScene.debugCollision).
await p.evaluate(() => __infra.lab.arenaScene.debugCollision(false)); await p.waitForTimeout(300);
const off1 = await layers(); check('the console switch turns it off: every layer hidden', !off1.on && off1.L.every(l => !l.visible), JSON.stringify(off1.L.map(l => l.visible)));
// On again from the menu, then leave practice: it goes off with the session (never into a match).
await p.keyboard.press('Escape'); await p.waitForTimeout(400); await p.evaluate(() => document.querySelector('#gd-menu .gm-practice [data-gm=collision]').click()); await p.waitForTimeout(300);
const on2 = (await layers()).on; await p.evaluate(() => document.querySelector('#gd-menu [data-gm=leave]')?.click()); await p.waitForTimeout(2500);
const left = await layers(); check('leaving practice switches it off', on2 && !left.on && left.L.every(l => !l.visible), JSON.stringify({ on2, on: left.on, shown: left.L.filter(l => l.visible).length }));
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(ok + '/' + n); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
