// Global Defensive fire in the real game (practice, the host's own rules and view) — the picture run for v53 FIRE (SPEC
// ADDENDUM 1) and FIRELOOK (SPEC ADDENDUM 14): a molotov and an incendiary thrown onto the same open spot, each seen at
// 0.1 s (the bottle-break fireball), 2 s (full) and 6.5 s (dying) from a player's eye 10 m away, and at 2 s from ground
// level; a smoke on the same spot for comparison; then the same throws with our own fallback art (what ships until
// tools/import-cs2-fire.mjs is run). Thrown through the game's own throw action (practice's rethrow), so the host's
// inferno, the LAN state and every client's view are the real ones. A labelled sheet goes to <out>/GD-v53-molotov.jpg
// (and ~/Desktop with DESKTOP=1). Muted Chrome (bt2.sh).
//   node tests/browser/gd-fire-shots.mjs <repo-root> <out-dir> [map=dust2] [dsf=1] [cs2-atlas.png]
// The CS2 atlas: the one installed in user-assets (models.fire, grid 16), or one served from a scratch build (the last
// argument: nothing in user-assets is written). Also checked: no shader compiled for the fire during play, the light
// count fixed from load, the fire's slots drawn.
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root = '.', out = path.join(os.tmpdir(), 'gd-fire-shots'), MAP = 'dust2', dsf = '1', ATLAS = ''] = process.argv.slice(2), PRESET = process.env.PRESET || 'High'; mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'GDFI01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'gdfi-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
let serr = ''; server.stderr.on('data', d => { serr += d; });
const base = await new Promise((r, j) => { const t = setTimeout(() => j(Error('no server: ' + serr.slice(-300))), 120000); server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); r('http://127.0.0.1:' + m[1]); } }); });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio'] });
const errs = [], report = {}; let failed = 0; const check = (name, c, d = '') => { if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c || d === '' ? '' : ' · ' + String(d).slice(0, 300))); };
const frames = [];
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: +dsf }); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && /shader|program|webgl|SyntaxError|does not provide/i.test(m.text())) errs.push(m.text().slice(0, 300)); }); p.on('dialog', d => d.accept());
  const cs2 = ATLAS && existsSync(ATLAS); report.atlas = cs2 ? ATLAS : 'fallback';
  if (cs2) { await p.route('**/api/user-assets*', async r => { const res = await r.fetch(); let m = {}; try { m = await res.json(); } catch {} m.models ??= {}; m.models.fire = { atlas: 'fire/atlas.png', grid: 16 }; await r.fulfill({ response: res, json: m }); });
    await p.route('**/user-assets/fire/atlas.png*', r => r.fulfill({ status: 200, contentType: 'image/png', body: readFileSync(ATLAS) })); }
  await p.addInitScript(PRESET => { localStorage.setItem('infra-name', 'Tester'); localStorage.setItem('infra-face-name', 'Tester'); localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: PRESET, gdPreset: PRESET })); }, PRESET);
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
  // framed on the effect itself (where the host's grenade went off: the same offset from it every time)
  const M10 = 394 * 2.54 / 16.5, EYE = 64 * 2.54 / 16.5;   // (10 m = 394 HU, Valve's 1 HU = 1 inch; a standing eye 64 HU)
  const aimAt = (kind, D = M10, up = EYE, look = 1.2) => p.evaluate(({ spot, kind, D, up, look }) => { const N = __infra.lab.world.operations.game.combat?.nades || [], g = kind && N.filter(n => n.kind === kind && n.phase !== 'air').pop(); const L = globalThis.__lastFx ??= {}; if (g) L[kind] = [g.x, g.y, g.z]; const to = g ? L[kind] : L[kind] || spot.to;
    const dx = spot.eye[0] - spot.to[0], dz = spot.eye[2] - spot.to[2], l = Math.hypot(dx, dz) || 1, eye = [to[0] + dx / l * D, to[1] + up, to[2] + dz / l * D];
    __infra.lab.look(eye[0], eye[2], to[0], to[1] + look, to[2], eye[1]); __infra.camera.position.set(eye[0], eye[1], eye[2]); __infra.camera.lookAt(to[0], to[1] + look, to[2]); }, { spot, kind, D, up, look });
  const shot = async (name, row, label, kind = null, view = 'eye') => { const v = view === 'ground' ? [M10 * .6, EYE, 0] : [M10, EYE, 1.2]; /* (close: a standing eye 3 m away, looking at the flames' foot — a camera at the floor itself is pushed out by the player's own collision) */ if (kind) { await aimAt(kind, ...v); await p.waitForTimeout(40); await aimAt(kind, ...v); } else await aim(1.5); await p.waitForTimeout(20); const f = path.join(out, name + '.jpg'); await p.screenshot({ path: f, type: 'jpeg', quality: 88 }); frames.push({ f, row, label }); };
  const clearAll = () => p.waitForFunction(() => !(__infra.lab.world.operations.game.combat?.nades || []).some(n => n.phase !== 'gone'), null, { timeout: 30000 }).catch(() => {});
  const at = async (t0, ms) => { const now = await p.evaluate(() => performance.now()); if (t0 + ms > now) await p.waitForTimeout(t0 + ms - now); };
  const lights0 = await p.evaluate(() => { let n = 0; __infra.scene.traverse(o => { if (o.isLight) n++; }); return n; });
  // one fire's life: 0.1 s, 2 s (eye, then ground level), 6.5 s; then cleared (scorch off: the next on a clean spot)
  const life = async (kind, row, tag) => { await p.waitForTimeout(300); const r = await throwAt(kind, 0, 0); check(`the ${kind} is thrown (practice rethrow) ${tag}`, !r?.error, JSON.stringify(r)); const t0 = await since(kind, 'fire');
    await at(t0, 100); await shot(kind + tag + '-0.1', row, '0.1 s · the burst · 10 m', kind);
    await at(t0, 2000); await shot(kind + tag + '-2', row, '2 s · full · 10 m', kind);
    await shot(kind + tag + '-2g', row, '2 s · close, at the flames\' foot · 6 m', kind, 'ground');
    if (!tag) report[kind] = await p.evaluate(k => { const f = __gdFire, g = (__infra.lab.world.operations.game.combat?.nades || []).find(n => n.kind === k && n.phase === 'fire'); let lit = 0; for (const l of f.lights) if (l.intensity > 0) lit++; return { drawn: f.mesh.geometry.instanceCount, lights: lit, phase: g?.phase }; }, kind);
    await at(t0, 6500); await shot(kind + tag + '-6.5', row, '6.5 s · dying · 10 m', kind);
    await clearAll(); await p.evaluate(() => __gdFire.clear()); };
  const ROW = { m: 'MOLOTOV — CS2\'s own pictures' + (cs2 ? ' (served atlas)' : ' (user-assets)'), i: 'INCENDIARY — CS2\'s own pictures', s: 'SMOKE · MOLOTOV · INCENDIARY at 2 s, 10 m (same spot, same view)', mf: 'MOLOTOV — our own fallback art (what ships)', if: 'INCENDIARY — our own fallback art' };
  await life('molotov', ROW.m, ''); await life('incendiary', ROW.i, '');
  { await throwAt('smoke', 0, 0); const t0 = await since('smoke', 'smoke', 6000); await at(t0, 2000); await shot('smoke-2', ROW.s, 'SMOKE', 'smoke'); await clearAll(); await p.evaluate(() => __gdFire.clear()); }
  for (const k of ['molotov', 'incendiary']) { const f = frames.find(x => x.label === '2 s · full · 10 m' && x.row === (k === 'molotov' ? ROW.m : ROW.i)); if (f) frames.push({ ...f, row: ROW.s, label: k.toUpperCase() }); }
  report.lights = [lights0, await p.evaluate(() => { let n = 0; __infra.scene.traverse(o => { if (o.isLight) n++; }); return n; })];
  check('the light count is fixed from load (the fire\'s lights made at load, never added)', report.lights[0] === report.lights[1], report.lights.join(' → '));
  check('the molotov lights its pooled light on this preset', (report.molotov?.lights ?? 0) >= 1 || /low/i.test(await p.evaluate(() => String(__infra.lab.graphics?.mode?.() || ''))), JSON.stringify(report.molotov));
  const prog = await p.evaluate(() => { const pr = __infra.renderer.properties.get(__gdFire.mesh.material)?.currentProgram; return pr ? { ok: pr.diagnostics ? pr.diagnostics.runnable : true, log: pr.diagnostics?.fragmentShader?.log || pr.diagnostics?.vertexShader?.log || '' } : null; });
  check('the fire\'s shader compiled and runs', !!prog?.ok, JSON.stringify(prog));
  const hasCS2 = await p.evaluate(() => __gdFire.source === 'cs2');
  if (hasCS2) { await p.evaluate(() => { globalThis.__cs2Atlas = __gdFire.atlas; __gdFire.setAtlas(__gdFire.fallback); }); await life('molotov', ROW.mf, '-fb'); await life('incendiary', ROW.if, '-fb'); await p.evaluate(() => __gdFire.setAtlas(globalThis.__cs2Atlas)); }
  else { for (const r of ['m', 'i']) for (const f of frames) if (f.row === ROW[r]) f.row = ROW[r + 'f']; }
  const progs1 = await p.evaluate(() => __infra.renderer?.info?.programs?.length ?? -1); report.programs = [progs0, progs1];
  check('no shader compiled for the fire during play (warmed behind the loading card)', progs0 < 0 || progs1 === progs0, progs0 + ' → ' + progs1);
  report.fire = await p.evaluate(() => ({ ...__gdFire.stats, source: __gdFire.source }));
  check('the fire view drew the fires', report.fire.fires >= 2, JSON.stringify(report.fire));
  if (cs2) check('CS2\'s own fire pictures (the served atlas) are drawn', report.fire.source === 'cs2', report.fire.source);
  // The sheet: rows of frames with their labels.
  const order = [ROW.m, ROW.i, ROW.s, ROW.mf, ROW.if].filter(r => frames.some(f => f.row === r)), sideOrder = ['SMOKE', 'MOLOTOV', 'INCENDIARY'];
  const rows = order.map(r => frames.filter(f => f.row === r)).map((L, i) => order[i] === ROW.s ? sideOrder.map(s => L.find(f => f.label === s)).filter(Boolean) : L);
  const imgs = rows.map(L => L.map(fr => ({ label: fr.label, row: fr.row, src: 'data:image/jpeg;base64,' + readFileSync(fr.f).toString('base64') })));
  const q = await b.newPage({ viewport: { width: 1600, height: 1200 } });
  const jpg = await q.evaluate(async ([rows, atlas]) => { const load = i => new Promise(r => { const im = new Image(); im.onload = () => r({ ...i, im }); im.src = i.src; }); const R = await Promise.all(rows.map(L => Promise.all(L.map(load))));
    const cols = Math.max(...R.map(L => L.length)), cw = 520, ch = 325, top = 76, lab = 34, c = document.createElement('canvas'); c.width = cw * cols; c.height = top + R.length * (ch + lab); const x = c.getContext('2d'); x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#fff'; x.font = 'bold 26px sans-serif'; x.fillText('Global Defensive v53 FIRELOOK — molotov and incendiary drawn from CS2\'s own inferno_fx particle systems', 16, 32);
    x.font = '17px sans-serif'; x.fillStyle = '#bbb'; x.fillText(`Practice, muted, High preset; rows 1–2: CS2\'s own particle pictures (tools/import-cs2-fire.mjs, local); last rows: our own fallback art; one instanced draw for all fire; the same spot in each row.`, 16, 60);
    R.forEach((L, ri) => { const oy = top + ri * (ch + lab); x.fillStyle = '#ffd76a'; x.font = 'bold 20px sans-serif'; x.fillText(L[0]?.row || '', 12, oy + 24);
      L.forEach((e, k) => { const ox = k * cw; x.drawImage(e.im, ox, oy + lab, cw, ch); x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(ox, oy + lab, Math.min(cw, 14 + e.label.length * 9.5), 28); x.fillStyle = '#fff'; x.font = 'bold 17px sans-serif'; x.fillText(e.label, ox + 8, oy + lab + 20); }); });
    return c.toDataURL('image/jpeg', .9); }, [imgs, report.atlas]);
  const sheet = path.join(out, 'GD-v53-molotov.jpg'); writeFileSync(sheet, Buffer.from(jpg.split(',')[1], 'base64')); console.log('sheet', sheet);
  if (process.env.DESKTOP === '1') { const d = path.join(os.homedir(), 'Desktop', 'GD-v53-molotov.jpg'); copyFileSync(sheet, d); console.log('→', d); }
  report.errs = errs; writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  check('no page errors', !errs.length, errs.slice(0, 5).join(' | '));
} catch (e) { console.log('FAIL run: ' + e.message + ' · page errors: ' + errs.slice(0, 4).join(' | ')); failed++; }
finally { await b.close(); server.kill(); }
console.log(failed ? `FAIL: gd-fire-shots · ${failed}` : 'PASS: gd-fire-shots'); process.exit(failed ? 1 : 0);
