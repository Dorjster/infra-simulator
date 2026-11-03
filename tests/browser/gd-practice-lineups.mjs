// Global Defensive · a lineup thrown in Practice with the preview (v53 S2, SPEC 1.3 / §6 browser checks). A solo
// Practice on CS2 Mirage (needs user-maps/mirage.bsp converted on this computer; skipped without it), through the page's
// own controls: the console (` key, typed lines) sets the lineup's getpos line, getpos prints it back; the floor mark's
// card names the lineup and its aim target is green (within 0.1°); holding the left button shows the preview line,
// ring and the picture of the landing spot; letting go throws; the host's smoke lands where CS2's does (within 32 HU
// of CS2's recorded landing point) and the path stays with its bounce marks and end mark (checked, and a frame from
// above the landing spot, noclip + setpos, where they show). v53 S2 review: run at Retina scale (device pixel ratio 2) on
// the High preset, with the frame pacing while holding (the picture on) against standing still, and no shader linked
// while holding. Frames: out/*.png and a sheet on the Desktop (~/Desktop/GD-v53-practice-lineups.jpg). Muted Chrome
// (scratchpad bt2.sh). Writes no lineup file.
//   node tests/browser/gd-practice-lineups.mjs <repo> <out>
import { chromium } from 'playwright-core'; import { spawn } from 'node:child_process'; import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [root, out, PRESET = 'High'] = process.argv.slice(2);   // (PRESET: the graphics preset — High (the sheet), or Low for the no-post-processing path's pacing) mkdirSync(out, { recursive: true });
const MF = path.join(root, 'user-maps/mirage.bsp'); if (!existsSync(MF) || readFileSync(MF).subarray(0, 4).toString() !== 'CS2M') { console.log('SKIP: no converted CS2 Mirage'); process.exit(0); }
const server = spawn(process.execPath, ['lan/server.mjs'], { cwd: root, env: { ...process.env, PORT: '0', BIND: '127.0.0.1', ROOM_CODE: 'PRAC01', HOST_KEY: 'k', CAMPAIGN_SAVE: path.join(mkdtempSync(path.join(os.tmpdir(), 'pl-')), 's.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { server.kill(); } catch {} });
const base = await new Promise(r => server.stdout.on('data', d => { const m = /localhost:(\d+)/.exec(String(d)); if (m) r('http://127.0.0.1:' + m[1]); }));
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const W = 1440, H = 810, p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 }); /* (Retina, as the user plays) */ const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
await p.addInitScript(PRESET => { localStorage.setItem('infra-name', 'Lineup'); localStorage.setItem('infra-face-name', 'Lineup'); localStorage.setItem('infra-face', 'smile'); localStorage.setItem('infra-player-preferences', JSON.stringify({ graphics: PRESET })); const L = globalThis.__links = []; const lp = WebGL2RenderingContext.prototype.linkProgram; WebGL2RenderingContext.prototype.linkProgram = function (x) { L.push(performance.now()); return lp.call(this, x); }; globalThis.__thr = []; addEventListener('gd-throw', e => __thr.push(e.detail)); }, PRESET);
let ok = 0, n = 0; const lines = []; const check = (name, c, d = '') => { n++; if (c) ok++; const l = (c ? 'PASS ' : 'FAIL ') + name + (d !== '' ? ' · ' + String(d).slice(0, 300) : ''); lines.push(l); console.log(l); };
const shots = []; const shot = async (label) => { const f = path.join(out, 'f' + shots.length + '.png'); await p.screenshot({ path: f }); shots.push({ f, label }); };
// Frame pacing for `ms` (rAF intervals) and the picture's own CPU time a frame (practice.afterRender), plus shaders linked meanwhile.
const pace = ms => p.evaluate(ms => new Promise(res => { const P = __infra.lab.practice, f = P.afterRender, cpu = [], dt = [], l0 = __links.length; P.afterRender = function () { const t = performance.now(); f.call(this); cpu.push(performance.now() - t); }; let last = performance.now(); const t0 = last;
  const tick = () => { const now = performance.now(); dt.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(tick); else { P.afterRender = f; const q = (a, x) => { const v = [...a].sort((m, n) => m - n); return v.length ? +v[Math.min(v.length - 1, Math.floor(v.length * x))].toFixed(2) : 0; }, ev = cpu.filter((_, i) => i % 2 === 0), od = cpu.filter((_, i) => i % 2 === 1), mean = a => a.length ? +(a.reduce((m, n) => m + n, 0) / a.length).toFixed(2) : 0;
    res({ frames: dt.length, fps: Math.round(dt.length / (ms / 1000)), p50: q(dt, .5), p95: q(dt, .95), p99: q(dt, .99), max: q(dt, 1), cpuEven: mean(ev), cpuOdd: mean(od), cpuMax: q(cpu, 1), links: __links.length - l0, dpr: devicePixelRatio, w: innerWidth }); } }; requestAnimationFrame(tick); }), ms);
await p.goto(base + '/'); await p.waitForFunction(() => globalThis.__infra?.lab, null, { timeout: 60000 }); await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('[data-start=arena]').click()); await p.waitForTimeout(500);
await p.selectOption('#ss-ar-kind', 'practice'); await p.waitForTimeout(300); await p.selectOption('#ss-ar-map', 'mirage'); await p.selectOption('#ss-ar-bots', '0');
await p.evaluate(() => document.getElementById('ss-ar-solo').click());
await p.waitForFunction(() => document.getElementById('ar-load')?.hidden !== false && __infra.lab.arenaScene?.inArena(__infra.camera.position.z) && __infra.lab.world?.operations?.game?.arena?.map === 'mirage' && __infra.lab.practice, null, { timeout: 180000 });
await p.waitForTimeout(4000);   // (the CS2 look settles)
await p.keyboard.press('Escape'); await p.evaluate(() => __infra.lab.enter()); await p.mouse.move(W / 2, H / 2);
// The lineup: Mirage's "Window Smoke From Cart"-style standing left-click smoke from the shipped seeds.
const L = await p.evaluate(() => { const ls = __infra.lab.practice.lineups; return ls.find(l => l.kind === 'smoke' && l.move === 'stand' && l.button === 'left' && l.place) || ls[0]; });
check('the map\'s lineups are loaded (seeds for Mirage)', !!L && L.land?.length === 3, L ? L.name + ' · ' + L.pos : 'none');
await p.evaluate(() => __infra.lab.lan.act({ type: 'arena', action: { type: 'buy-nade', kind: 'smoke' } })); await p.keyboard.press('Digit8'); await p.waitForTimeout(1200);
// The console, typed: setpos;setang of the lineup, then getpos.
await p.keyboard.press('Backquote'); await p.waitForTimeout(200); check('` opens the console (the line focused)', await p.evaluate(() => document.activeElement?.classList.contains('gc-in') && !document.getElementById('gd-console').hidden));
await p.keyboard.type(L.pos); await p.keyboard.press('Enter'); await p.waitForTimeout(500); await p.keyboard.type('getpos'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
const lastPos = () => p.evaluate(() => [...document.querySelectorAll('#gd-console .gc-out div')].map(d => d.textContent).filter(t => t.startsWith('setpos')).pop());
const printed = await lastPos(), a = printed?.match(/[-\d.]+/g)?.map(Number) || [], w = L.pos.match(/[-\d.]+/g).map(Number);
check('getpos after setpos: the angles exactly the lineup\'s; the spot where the game\'s body stands (within 1 HU of CS2\'s: our collision\'s floor and walls — notCS2, the 16-HU collision columns)', a.length >= 5 && a[3] === w[3] && a[4] === w[4] && Math.hypot(a[0] - w[0], a[1] - w[1], a[2] - w[2]) <= 1, printed + ' vs ' + L.pos + ' · ' + Math.hypot(a[0] - w[0], a[1] - w[1], a[2] - w[2]).toFixed(2) + ' HU');
await p.keyboard.type(printed); await p.keyboard.press('Enter'); await p.waitForTimeout(500); await p.keyboard.type('getpos'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
check('setpos of that line → getpos: the same line again (the round trip in the page)', (await lastPos()) === printed, await lastPos());
await shot('Console: setpos;setang of the lineup, getpos back');
await p.keyboard.press('Backquote'); await p.waitForTimeout(300); await p.evaluate(() => __infra.lab.enter()); await p.waitForTimeout(1200);
const st = await p.evaluate(() => ({ here: __infra.lab.practice.here?.name, card: document.getElementById('gd-lineup-card')?.textContent, shown: document.getElementById('gd-lineup-card')?.style.display, color: __infra.lab.practice.aimColor }));
check('standing on the lineup\'s floor mark: its card shows', st.here === L.name && st.shown === 'block' && st.card.includes(L.name), JSON.stringify(st));
check('…and its aim target is green (angles within 0.1°)', st.color === '3cff6a' || st.color === '#3cff6a', st.color);
// Frame pacing standing still on the spot (the baseline), then holding (below).
const still = await pace(3000); check('standing on the spot: frame pacing (the baseline)', still.frames > 30, JSON.stringify(still));
// Hold the left button: the preview (line, ring, picture of the landing spot).
await p.mouse.down({ button: 'left' }); await p.waitForTimeout(900);
const pv = await p.evaluate(() => ({ pip: __infra.lab.practice.pip, box: document.getElementById('gd-pip')?.style.display, nade: __infra.lab.pistol.nade?.state }));
check('holding: the preview and its picture of the landing spot are up', pv.pip === true && pv.box === 'block', JSON.stringify(pv));
await shot('Holding the smoke: preview line, landing ring, picture of the landing spot (bottom right)');
const held = await pace(3000); check('holding with the picture: no shader linked, no frame over 100 ms, p95 within 4 ms of standing still', held.links === 0 && held.max < 100 && held.p95 <= still.p95 + 4, JSON.stringify(held));
await p.mouse.up({ button: 'left' }); await p.waitForTimeout(1300); await shot('Thrown: the path stays 8 s');
const lp = await p.evaluate(() => __infra.lab.practice.lastPath);
check('after the throw: its path is drawn, with bounce marks and an end mark', lp.on && lp.points > 2 && lp.bounces >= 1 && Array.isArray(lp.end), JSON.stringify(lp));
// From above the landing spot (noclip, setpos;setang through the console): the path, its bounce marks and end mark in view.
const view = await p.evaluate(() => import('/gd-lineups.js').then(m => import('/arena-maps.js').then(am => import('/facility-layout.js').then(fl => { const P = __infra.lab.practice, e = P.lastPath.end, me = __infra.camera.position, fr = m.mapFrame(am.ARENA_MAPS.mirage, fl.ARENA.cx, fl.ARENA.cz), E = fr.toHammer(e[0], e[1], e[2]), S = fr.toHammer(me.x, me.y, me.z), dx = E[0] - S[0], dy = E[1] - S[1], l = Math.hypot(dx, dy) || 1, V = [E[0] - dx / l * 520 - dy / l * 260, E[1] - dy / l * 520 + dx / l * 260, E[2] + 420], hx = E[0] - V[0], hy = E[1] - V[1];
  return m.formatPos({ x: V[0], y: V[1], z: V[2], pitch: Math.atan2(V[2] - E[2], Math.hypot(hx, hy)) * 180 / Math.PI, yaw: Math.atan2(hy, hx) * 180 / Math.PI }); }))));
await p.keyboard.press('Backquote'); await p.waitForTimeout(200); await p.keyboard.type('noclip'); await p.keyboard.press('Enter'); await p.keyboard.type(view); await p.keyboard.press('Enter'); await p.waitForTimeout(200); await p.keyboard.press('Backquote'); await p.waitForTimeout(700);
await shot('From above the landing spot (noclip): the path, bounce marks (yellow) and end mark (green)');
await p.waitForTimeout(3400);
const land = await p.evaluate(L => { const g = __infra.lab.world.operations.game, s = (g.combat?.nades || []).find(x => x.kind === 'smoke'); if (!s) return null; const M = __infra.lab.arenaScene, H = null; return { x: s.x, y: s.y, z: s.z, phase: s.phase, thr: __thr.length }; }, L);
const miss = await p.evaluate(({ L, land }) => import('/gd-lineups.js').then(m => import('/arena-maps.js').then(am => import('/facility-layout.js').then(fl => { const fr = m.mapFrame(am.ARENA_MAPS.mirage, fl.ARENA.cx, fl.ARENA.cz), h = fr.toHammer(land.x, land.y, land.z); return { h, d: Math.hypot(h[0] - L.land[0], h[1] - L.land[1], h[2] - L.land[2]) }; }))), { L, land }).catch(e => ({ err: String(e) }));
check('the host\'s smoke landed and popped where CS2\'s does (within 32 HU of CS2\'s recorded landing point)', land && land.phase === 'smoke' && miss.d <= 32, JSON.stringify({ land, miss }));
await shot('Popped where CS2\'s lands: path, bounce marks, end mark');
check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
// The sheet.
const imgs = shots.map(s => ({ label: s.label, src: 'data:image/png;base64,' + readFileSync(s.f).toString('base64') }));
const sheet = await b.newPage({ viewport: { width: 2 * 960 + 30, height: 2 * (540 + 34) + 70 } });
await sheet.setContent(`<html><body style="margin:0;background:#15181c;color:#e8eaed;font:600 15px system-ui,sans-serif"><div style="padding:10px 14px">Global Defensive v53 · Practice: a lineup (${L.name.replace(/</g, '')}) thrown with the preview · ${ok}/${n} checks</div><div style="display:grid;grid-template-columns:960px 960px;gap:10px;padding:0 10px">${imgs.map(i => `<figure style="margin:0"><img src="${i.src}" style="width:960px;height:540px;display:block"><figcaption style="padding:6px 2px 8px;font-weight:500">${i.label}</figcaption></figure>`).join('')}</div></body></html>`);
await sheet.waitForTimeout(300); const desk = PRESET === 'High' ? path.join(os.homedir(), 'Desktop', 'GD-v53-practice-lineups.jpg') : path.join(out, 'sheet-' + PRESET + '.jpg'); await sheet.screenshot({ path: desk, type: 'jpeg', quality: 88, fullPage: true });
writeFileSync(path.join(out, PRESET === 'High' ? 'practice.txt' : 'practice-' + PRESET + '.txt'), lines.join('\n') + '\n' + ok + '/' + n + '\nsheet: ' + desk + '\n');
console.log(ok + '/' + n + ' · sheet ' + desk); await b.close(); server.kill(); process.exit(ok === n ? 0 : 1);
