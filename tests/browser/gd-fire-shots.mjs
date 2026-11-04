// Global Defensive fire in the real game (practice, the host's own rules and view) — the picture run for v53 FIRE (SPEC
// ADDENDUM 1): a smoke, a molotov and an incendiary thrown onto the same spot from the same view, side by side; the
// molotov's life (the bottle in flight with its burning rag, the burst, the spread, full, dying, the scorch left); the
// incendiary in flight and burning; a smoke thrown into a burning molotov (it pops in the flames, the flames it covers
// die under CS2's dark swirl, the rest burn on). Thrown through the game's own throw action (practice's rethrow: no
// loadout needed), so the host's inferno, the LAN state and every client's view are the real ones. A labelled sheet goes
// to <out>/GD-v53-molotov.jpg (and ~/Desktop with DESKTOP=1). Muted Chrome (bt2.sh).
//   node tests/browser/gd-fire-shots.mjs <repo-root> <out-dir> [map=dust2] [dsf=1] [cs2-atlas.png]
// With a CS2 atlas (tools/import-cs2-fire.mjs's atlas.png built to a scratch folder) the page is served it as the room's
// models.fire — nothing in user-assets is written; without, our own fallback art is drawn. (FIRE final: the side-by-side's
// smoke is thrown alone on the clean spot first; with a CS2 atlas a second row repeats the molotov and incendiary with
// our own fallback art — what ships until the import is run.)
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-fire-shots'), MAP = 'dust2', dsf = '1', ATLAS = ''] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDFI01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdfi-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
let serr = ''; server.stderr.on('data', d => { serr += d; });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + serr.slice(-300))), 120000); server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio'] });
const errs = [], report = {}; let failed = 0; const check = (name, c, d = '') => { if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c || d === '' ? '' : ' · ' + String(d).slice(0, 300))); };
const frames = [];
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: +dsf }); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && /shader|program|webgl/i.test(m.text())) errs.push(m.text().slice(0, 300)); }); p.on('dialog', d => d.accept());
  const cs2 = ATLAS && existsSync(ATLAS); report.atlas = cs2 ? ATLAS : 'fallback';
  if (cs2) { await p.route('**/api/user-assets*', async r => { const res = await r.fetch(); let m = {}; try { m = await res.json(); } catch {} m.models ??= {}; m.models.fire = { atlas: 'fire/atlas.png', grid: 8 }; await r.fulfill({ response: res, json: m }); });
    await p.route('**/user-assets/fire/atlas.png*', r => r.fulfill({ status: 200, contentType: 'image/png', body: readFileSync(ATLAS) })); }
  await p.addInitScript(() => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); });
  await p.goto(base + '/', { timeout: 120000 }); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 120000 }); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(400);
  await p.selectOption('#ss-ar-kind', 'practice'); await p.selectOption('#ss-ar-map', MAP); await p.selectOption('#ss-ar-bots', '1'); await p.evaluate(() => document.getElementById('ss-ar-solo').click());
  await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z), null, { timeout: 240000 });
  await p.evaluate(() => { document.querySelector('#ar-buy [data-act="close"]')?.click(); __infra.lab.campaignUI?.close?.(); __infra.lab.arenaUI?.buy?.(false); __infra.lab.enter(); }); await p.waitForTimeout(3000);
  for (let k = 0; k < 6; k++) { const open = await p.evaluate(() => { const el = document.getElementById('ar-buy'); return !!el && !el.hidden && getComputedStyle(el).display !== 'none'; }); if (!open) break; await p.evaluate(() => { __infra.lab.arenaUI?.buy?.(false); document.querySelector('#ar-buy [data-act="close"]')?.click(); }); await p.waitForTimeout(300); }
  await p.addStyleTag({ content: '#gd-recoil{display:none!important}' });   // (practice's recoil panel: not CS2's, not in these pictures)
  check('the fire view is in the game', await p.evaluate(() => !!globalThis.__gdFire?.mesh));
  // A spot: open, flat floor 30–60 units ahead of a spawn, nothing in between (the map's own nav floor).
  const spot = await p.evaluate(async () => { const { ARENA_MAPS } = await import('/arena-maps.js'), { ARENA } = await import('/facility-layout.js'), G = __infra.lab.world.operations.game, M = ARENA_MAPS[G.arena.map];
    const starts = [...(M.t || []), ...(M.ct || [])]; for (const s of starts) for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, ok = []; let good = true; const f0 = M.nav.floorAt(s[0], s[1]); if (!Number.isFinite(f0)) continue;
      for (let d = 4; d <= 52; d += 4) { const x = s[0] + Math.sin(a) * d, z = s[1] + Math.cos(a) * d, f = M.nav.floorAt(x, z); if (!Number.isFinite(f) || Math.abs(f - f0) > .4) { good = false; break; } }
      if (!good) continue; const tx = s[0] + Math.sin(a) * 40, tz = s[1] + Math.cos(a) * 40;
      let flat = true; for (let i = -4; i <= 4 && flat; i++) for (let j = -4; j <= 4; j++) { const f = M.nav.floorAt(tx + i * 4, tz + j * 4); if (!Number.isFinite(f) || Math.abs(f - f0) > .5) { flat = false; break; } } if (!flat) continue;
      return { to: [ARENA.cx + tx, f0, ARENA.cz + tz], eye: [ARENA.cx + s[0] + Math.sin(a) * 2, f0 + 9.7 + 4, ARENA.cz + s[1] + Math.cos(a) * 2], a }; } return null; });
  report.spot = spot; check('an open flat spot to throw onto', !!spot); if (!spot) throw Error('no spot');
  const aim = (up = 1.5) => p.evaluate(({ eye, to, up }) => { __infra.lab.look(eye[0], eye[2], to[0], to[1] + up, to[2], eye[1]); __infra.camera.position.set(eye[0], eye[1], eye[2]); __infra.camera.lookAt(to[0], to[1] + up, to[2]); }, { ...spot, up });
  for (let k = 0; k < 3; k++) { await aim(); await p.waitForTimeout(200); }
  const progs0 = await p.evaluate(() => __infra.renderer?.info?.programs?.length ?? -1);
  const throwAt = (kind, dx = 0, dz = 0, from = null, up = 3) => p.evaluate(([kind, to, dx, dz, from, up]) => { const [x, y, z] = from || [to[0] + dx, to[1] + up, to[2] + dz], d = from ? [to[0] + dx - from[0], to[1] - from[1], to[2] + dz - from[2]] : [0, -1, 0], l = Math.hypot(...d);
    return __infra.lab.lan.act({ type: 'arena', action: { type: 'throw', kind, x, y, z, dx: d[0] / l, dy: d[1] / l, dz: d[2] / l, strength: 'short', vx: 0, vy: 0, vz: 0, rethrow: true } }); }, [kind, spot.to, dx, dz, from, up]);
  const phaseOf = kind => p.evaluate(k => (__infra.lab.world.operations.game.combat?.nades || []).filter(n => n.kind === k).map(n => n.phase + ':' + n.id + ':' + (n.xm >>> 0)).join(','), kind);
  const waitPhase = (kind, ph, ms = 6000) => p.waitForFunction(([k, ph]) => (__infra.lab.world.operations.game.combat?.nades || []).some(n => n.kind === k && n.phase === ph), [kind, ph], { timeout: ms }).then(() => true).catch(() => false);
  const since = async (kind, ph) => { await waitPhase(kind, ph); return p.evaluate(() => performance.now()); };
  // framed on the effect itself (where the host's grenade went off: the same offset from it every time — the side-by-side
  // compares like with like), else on the spot
  const aimAt = kind => p.evaluate(({ spot, kind }) => { const N = __infra.lab.world.operations.game.combat?.nades || [], g = kind && N.filter(n => n.kind === kind && n.phase !== 'air').pop(); const L = globalThis.__lastFx ??= {}; if (g) L[kind] = [g.x, g.y, g.z]; const to = g ? L[kind] : L[kind] || spot.to;
    const dx = spot.eye[0] - spot.to[0], dz = spot.eye[2] - spot.to[2], l = Math.hypot(dx, dz) || 1, D = 34, eye = [to[0] + dx / l * D, to[1] + 9.7 + 5, to[2] + dz / l * D];
    __infra.lab.look(eye[0], eye[2], to[0], to[1] + 2, to[2], eye[1]); __infra.camera.position.set(eye[0], eye[1], eye[2]); __infra.camera.lookAt(to[0], to[1] + 2, to[2]); }, { spot, kind });
  const shot = async (name, row, label, kind = null, up = 1.5) => { if (kind) { await aimAt(kind); await p.waitForTimeout(60); await aimAt(kind); } else await aim(up); await p.waitForTimeout(30); const f = path.join(out, name + '.jpg'); await p.screenshot({ path: f, type: 'jpeg', quality: 88 }); frames.push({ f, row, label }); };
  const shotK = (kind, name, row, label) => shot(name, row, label);   // (the spot's own view: every grenade is dropped onto it)
  const clearAll = () => p.waitForFunction(() => !(__infra.lab.world.operations.game.combat?.nades || []).some(n => n.phase !== 'gone'), null, { timeout: 30000 }).catch(() => {});
  const at = async (t0, ms) => { const now = await p.evaluate(() => performance.now()); if (t0 + ms > now) await p.waitForTimeout(t0 + ms - now); };
  // 0. (FIRE final) the side-by-side's smoke first, on the clean spot (no scorch, no fire under it): at 2.5 s, then gone
  const smokeAlone = async () => { await throwAt('smoke', 0, 0); const t0 = await since('smoke', 'smoke', 6000); await at(t0, 2500); await shotK('smoke', 'smoke-2.5', 'SIDE BY SIDE at 2.5 s — smoke · molotov · incendiary (same spot, same view)', 'SMOKE'); };
  await smokeAlone(); await clearAll(); await p.evaluate(() => __gdFire.clear()); await p.waitForTimeout(300);
  // 1. the molotov's life: in flight (thrown across the view from the side), the burst, spreading, full, dying
  const side = [spot.to[0] + Math.cos(spot.a) * 22, spot.to[1] + 9, spot.to[2] - Math.sin(spot.a) * 22];
  await aim(16); await p.waitForTimeout(150); const r1 = await throwAt('molotov', 0, 0, null, 30); check('the molotov is thrown (practice rethrow)', !r1?.error, JSON.stringify(r1));
  await p.waitForTimeout(330); await shot('molotov-air', 'MOLOTOV — CS2 molotov: the burning rag in flight, the burst, the spread, full, dying', 'in flight (looking up)', null, 16);
  const tm = await since('molotov', 'fire'); report.molotov = await phaseOf('molotov');
  await at(tm, 120); await shotK('molotov', 'molotov-0.1', 'MOLOTOV — CS2 molotov: the burning rag in flight, the burst, the spread, full, dying', '0.1 s');
  await at(tm, 600); await shotK('molotov', 'molotov-0.6', 'MOLOTOV — CS2 molotov: the burning rag in flight, the burst, the spread, full, dying', '0.6 s');
  await at(tm, 2500); await shotK('molotov', 'molotov-2.5', 'SIDE BY SIDE at 2.5 s — smoke · molotov · incendiary (same spot, same view)', 'MOLOTOV');
  const fl = await p.evaluate(async () => { const { infernoFlames } = await import('/arena-nades.js'); const g = (__infra.lab.world.operations.game.combat?.nades || []).find(n => n.kind === 'molotov' && n.phase === 'fire'); return g ? infernoFlames(__infra.lab.arenaScene.boxes, g.x, g.z, g.y, g).length : 0; });
  check('the molotov burns as CS2\'s inferno (up to 16 flames)', fl >= 4 && fl <= 16, fl); report.flames = fl;
  report.debug = await p.evaluate(() => { const m = __gdFire.mesh, A = m.geometry.getAttribute('aA').array, B = m.geometry.getAttribute('aB').array, C = m.geometry.getAttribute('aC').array, u = m.material.uniforms.uTime.value, out = [];
    for (let i = 0; i < A.length / 4; i++) if (B[i * 4 + 2] > u && B[i * 4 + 1] < u && B[i * 4] > 0) { const v = new __infra.camera.position.constructor(A[i * 4], A[i * 4 + 1], A[i * 4 + 2]).project(__infra.camera); out.push([i, A[i * 4 + 3], +A[i * 4].toFixed(1), +A[i * 4 + 1].toFixed(1), +A[i * 4 + 2].toFixed(1), +B[i * 4].toFixed(2), +B[i * 4 + 1].toFixed(2), +B[i * 4 + 2].toFixed(2), +C[i * 4 + 2].toFixed(2), +v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(3)]); }
    const g = (__infra.lab.world.operations.game.combat?.nades || []).find(n => n.phase === 'fire'); return { u, vis: m.visible, parent: !!m.parent, cam: __infra.camera.position.toArray().map(x => +x.toFixed(1)), fire: g ? [g.x, g.y, g.z, g.firedAt] : null, live: out.length, sample: out.slice(0, 12), layers: m.layers.mask, ro: m.renderOrder }; });
  console.log('debug', JSON.stringify(report.debug));
  const prog = await p.evaluate(() => { const pr = __infra.renderer.properties.get(__gdFire.mesh.material)?.currentProgram; return pr ? { ok: pr.diagnostics ? pr.diagnostics.runnable : true, log: pr.diagnostics?.fragmentShader?.log || pr.diagnostics?.vertexShader?.log || '' } : null; });
  check('the fire\'s shader compiled and runs', !!prog?.ok, JSON.stringify(prog));
  await at(tm, 7000); await shotK('molotov', 'molotov-7.0', 'MOLOTOV — CS2 molotov: the burning rag in flight, the burst, the spread, full, dying', '7.0 s (dying)');
  await clearAll(); await p.waitForTimeout(600); await shotK('molotov', 'molotov-scorch', 'MOLOTOV — CS2 molotov: the burning rag in flight, the burst, the spread, full, dying', 'scorch after'); await p.evaluate(() => __gdFire.clear());   // (the scorch off again: the incendiary on a clean spot)
  // 2. the incendiary: in flight, then at 2.5 s
  await aim(16); await p.waitForTimeout(150); await throwAt('incendiary', 0, 0, null, 30); await p.waitForTimeout(330); await shot('incendiary-air', 'INCENDIARY — the can\'s sparks in flight, its own flames and sparks (incendiary_* particles)', 'in flight (looking up)', null, 16);
  const ti = await since('incendiary', 'fire'); await at(ti, 150); await shotK('incendiary', 'incendiary-0.15', 'INCENDIARY — the can\'s sparks in flight, its own flames and sparks (incendiary_* particles)', '0.15 s');
  await at(ti, 2500); await shotK('incendiary', 'incendiary-2.5', 'SIDE BY SIDE at 2.5 s — smoke · molotov · incendiary (same spot, same view)', 'INCENDIARY');
  await at(ti, 4000); await shotK('incendiary', 'incendiary-4.0', 'INCENDIARY — the can\'s sparks in flight, its own flames and sparks (incendiary_* particles)', '4.0 s');
  await clearAll(); await p.waitForTimeout(400);
  // 3. smoke into a burning molotov: it pops in the flames; the flames it covers die under CS2's dark swirl
  await throwAt('molotov', 0, 0); const tf = await since('molotov', 'fire'); await at(tf, 1800);
  const before = await phaseOf('molotov'); await throwAt('smoke', 3, 0); const ts = await since('smoke', 'smoke', 4000);
  await at(ts, 250); await shotK('smoke', 'ext-0.25', 'SMOKE INTO FIRE — it pops in the flames (CS2), the flames it covers go out, CS2\'s dark extinguish swirl', '0.25 s after the pop');
  await at(ts, 900); await shotK('smoke', 'ext-0.9', 'SMOKE INTO FIRE — it pops in the flames (CS2), the flames it covers go out, CS2\'s dark extinguish swirl', '0.9 s');
  const after = await phaseOf('molotov'); report.extinguish = { before, after };
  check('the smoke put flames out (the host\'s mask, or the whole fire out)', /:0$/.test(before) && (/^out:/.test(after) || !/:0$/.test(after) || after === ''), before + ' → ' + after);
  await at(ts, 3000); await shotK('smoke', 'ext-3.0', 'SMOKE INTO FIRE — it pops in the flames (CS2), the flames it covers go out, CS2\'s dark extinguish swirl', '3.0 s');
  // (FIRE final) our own fallback art, what ships: the same throws with the built-in atlas (the same program: a texture)
  if (cs2) { await clearAll(); await p.evaluate(() => { __gdFire.clear(); globalThis.__cs2Atlas = __gdFire.atlas; __gdFire.setAtlas(__gdFire.fallback); });
    for (const kind of ['molotov', 'incendiary']) { await p.waitForTimeout(300); await throwAt(kind, 0, 0); const t0 = await since(kind, 'fire'); await at(t0, 2500); await shotK(kind, kind + '-fb-2.5', 'OUR OWN FALLBACK ART at 2.5 s (what ships until tools/import-cs2-fire.mjs is run) — smoke · molotov · incendiary', kind.toUpperCase() + ' (ours)'); await clearAll(); await p.evaluate(() => __gdFire.clear()); }
    await p.evaluate(() => __gdFire.setAtlas(globalThis.__cs2Atlas)); }
  const progs1 = await p.evaluate(() => __infra.renderer?.info?.programs?.length ?? -1); report.programs = [progs0, progs1];
  check('no shader compiled for the fire during play (warmed behind the loading card)', progs0 < 0 || progs1 === progs0, progs0 + ' → ' + progs1);
  report.fire = await p.evaluate(() => ({ ...__gdFire.stats, source: __gdFire.source }));
  check('the fire view drew the fires', report.fire.fires >= 3, JSON.stringify(report.fire));
  if (cs2) check('CS2\'s own fire pictures (the served atlas) are drawn', report.fire.source === 'cs2', report.fire.source);
  // The sheet: rows of frames with their labels.
  const order = ['SIDE BY SIDE at 2.5 s — smoke · molotov · incendiary (same spot, same view)', ...(cs2 ? ['OUR OWN FALLBACK ART at 2.5 s (what ships until tools/import-cs2-fire.mjs is run) — smoke · molotov · incendiary'] : []), 'MOLOTOV — CS2 molotov: the burning rag in flight, the burst, the spread, full, dying', 'INCENDIARY — the can\'s sparks in flight, its own flames and sparks (incendiary_* particles)', 'SMOKE INTO FIRE — it pops in the flames (CS2), the flames it covers go out, CS2\'s dark extinguish swirl'];
  const sideOrder = ['SMOKE', 'MOLOTOV', 'INCENDIARY'], smokeFrame = frames.find(f => f.label === 'SMOKE');
  const rows = order.map(r => frames.filter(f => f.row === r)).map((L, i) => i === 0 ? sideOrder.map(s => L.find(f => f.label === s)).filter(Boolean) : order[i] === 'OUR OWN FALLBACK ART at 2.5 s (what ships until tools/import-cs2-fire.mjs is run) — smoke · molotov · incendiary' ? [{ ...smokeFrame, row: order[i] }, ...L] : L);
  const imgs = rows.map(L => L.map(fr => ({ label: fr.label, row: fr.row, src: 'data:image/jpeg;base64,' + readFileSync(fr.f).toString('base64') })));
  const q = await b.newPage({ viewport: { width: 1600, height: 1200 } });
  const jpg = await q.evaluate(async ([rows, atlas]) => { const load = i => new Promise(r => { const im = new Image(); im.onload = () => r({ ...i, im }); im.src = i.src; }); const R = await Promise.all(rows.map(L => Promise.all(L.map(load))));
    const cols = Math.max(...R.map(L => L.length)), cw = 520, ch = 325, top = 76, lab = 34, c = document.createElement('canvas'); c.width = cw * cols; c.height = top + R.length * (ch + lab); const x = c.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#fff'; x.font = 'bold 26px sans-serif'; x.fillText('Global Defensive v53 — molotov and incendiary like CS2, and never like the smoke (the host\'s inferno, the game\'s view)', 16, 32);
    x.font = '17px sans-serif'; x.fillStyle = '#bbb'; x.fillText(`Practice, muted; ${atlas === 'fallback' ? 'our own fallback fire pictures' : 'CS2\'s own particle pictures (tools/import-cs2-fire.mjs, local)'}; one instanced draw for all fire; the same spot and view in each row.`, 16, 60);
    R.forEach((L, ri) => { const oy = top + ri * (ch + lab); x.fillStyle = '#ffd76a'; x.font = 'bold 20px sans-serif'; x.fillText(L[0]?.row || '', 12, oy + 24);
      L.forEach((e, k) => { const ox = k * cw; x.drawImage(e.im, ox, oy + lab, cw, ch); x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(ox, oy + lab, Math.min(cw, 14 + e.label.length * 9.5), 28); x.fillStyle = '#fff'; x.font = 'bold 17px sans-serif'; x.fillText(e.label, ox + 8, oy + lab + 20); }); });
    return c.toDataURL('image/jpeg', .9); }, [imgs, report.atlas]);
  const sheet = path.join(out, 'GD-v53-molotov.jpg'); writeFileSync(sheet, Buffer.from(jpg.split(',')[1], 'base64')); console.log('sheet', sheet);
  if (process.env.DESKTOP === '1') { const d = path.join(os.homedir(), 'Desktop', 'GD-v53-molotov.jpg'); copyFileSync(sheet, d); console.log('→', d); }
  report.errs = errs; writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  check('no page errors', !errs.length, errs.slice(0, 5).join(' | '));
} catch (e) { console.log('FAIL run: ' + e.message); failed++; }
finally { await b.close(); server.kill(); }
console.log(failed ? `FAIL: gd-fire-shots · ${failed}` : 'PASS: gd-fire-shots'); process.exit(failed ? 1 : 0);
