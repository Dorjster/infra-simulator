// Global Defensive fire (v53 FIRE, SPEC ADDENDUM 1): CS2's inferno — spread determinism (the same flames from the same
// state, whatever the host's tick, and from the state as a LAN client receives it), the spread's rules (16 flames, 150 HU,
// walls, stairs, a crate), smoke putting the flames out (each flame on its own, a smoke flying into the fire, fire never
// spreading into smoke, a molotov into smoke), damage per tick (the ramp, kevlar by weapons.vdata's m_flArmorRatio, the
// thrower's own fire), no allocation per frame in the fire's view, and smoke vs molotov never sharing an effect or a sound.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NADES, INFERNO, FIRE, FIRE_AP, infernoFlames, fireEnd, cellLit, inFire, nadesTick, clearFireCache, smokeDensity, holdNades, fireStamp, FL_X, FL_Z, FL_Y, FL_T, FL_END, FL_PARENT } from '../dist/arena-nades.js';
import { hpOf } from '../dist/combat-logic.js';
import { MAX_HP } from '../dist/weapons-data.js';
import { createFireView, INSTANCES, K, MAX_FIRES, LOOK, GRAD, BASE, FLY_PARTS } from '../dist/gd-fire-view.js';
import { EVENTS } from '../dist/gd-sounds.js';
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const HU = 2.54 / 16.5, T0 = 9e9;
const game = (nades, extra = {}) => ({ levels: {}, combat: { nades, hp: {}, down: {}, ...extra }, arena: { bots: [] } });
const fire = (id, x = 0, z = 0, y = 0, o = {}) => ({ id, kind: 'molotov', by: 'ann', phase: 'fire', x, y, z, at: T0 - 1000, firedAt: T0, bv: [12.5, -3], xm: 0, ...o });

// ── Spread: CS2's numbers, its rules ──
{ const F = infernoFlames([], 0, 0, 0, fire('a'));
  ok(F.length === INFERNO.max && INFERNO.max === 16, 'an inferno has CS2\'s 16 flames in the open · ' + F.length);
  ok(F.every(f => Math.hypot(f[FL_X], f[FL_Z]) <= INFERNO.range + 1e-6) && Math.abs(INFERNO.range - 150 * HU) < 1e-9, 'all within inferno_max_range 150 HU of the first');
  ok(F.slice(1).every(f => { const p = F[f[FL_PARENT]]; return Math.abs(Math.hypot(f[FL_X] - p[FL_X], f[FL_Z] - p[FL_Z]) - INFERNO.spacing) < .05; }), 'each flame inferno_flame_spacing (42 HU) from its parent');
  ok(F.every((f, i) => F.every((g, j) => i === j || Math.hypot(f[FL_X] - g[FL_X], f[FL_Z] - g[FL_Z]) >= INFERNO.spacing * .5 - .02)), 'never closer than half a spacing to another');
  ok(F.every(f => f[FL_END] - f[FL_T] === INFERNO.life && INFERNO.life === 7000), 'each flame burns inferno_flame_lifetime 7 s');
  const last = Math.max(...F.map(f => f[FL_T])); ok(last < 1500 && fireEnd(F) === last + 7000, 'the spread is done within 1.5 s (' + last + ' ms); the fire ends with its last flame');
  ok(F.slice(1).every(f => f[FL_PARENT] >= 0 && f[FL_PARENT] < F.indexOf(f) && f[FL_T] >= F[f[FL_PARENT]][FL_T]), 'every flame grows from an older one');
  const lean = infernoFlames([], 0, 0, 0, fire('a', 0, 0, 0, { bv: [90, 0] })), mx = lean.reduce((s, f) => s + f[FL_X], 0) / lean.length; ok(mx > 2, 'a molotov still moving when it burst leans its fire along its way (inferno_velocity_factor) · mean x ' + mx.toFixed(2)); }
{ const wall = [{ minX: 3, maxX: 4, minZ: -60, maxZ: 60, y0: 0, y1: 24 }], F = infernoFlames(wall, 0, 0, 0, fire('w', 0, 0, 0, { bv: [60, 0] }));
  ok(F.length >= 6 && F.every(f => f[FL_X] < 3), 'a wall stops the fire (never through it) · ' + F.length + ' flames');
  const crate = [{ minX: -6, maxX: 6, minZ: -6, maxZ: 6, y0: 0, y1: 6 }], C = infernoFlames(crate, 0, 0, 6, fire('c'));
  ok(C.length >= 1 && C.every(f => Math.abs(f[FL_X]) < 6.01 && Math.abs(f[FL_Z]) < 6.01 && f[FL_Y] === 6), 'a fire on a crate (39 HU) stays on it');
  // stairs down (+x): 8 HU steps every 12 HU — the fire runs down them; a ledge up of 40 HU (−x) it can't climb
  const steps = []; for (let i = 0; i < 12; i++) steps.push({ minX: 2 + i * 12 * HU, maxX: 2 + (i + 1) * 12 * HU, minZ: -40, maxZ: 40, y0: -40, y1: -(i + 1) * 8 * HU });
  steps.push({ minX: -40, maxX: 2, minZ: -40, maxZ: 40, y0: -40, y1: 0 }, { minX: -60, maxX: -6, minZ: -40, maxZ: 40, y0: -40, y1: 40 * HU });
  const S = infernoFlames(steps, 0, 0, 0, fire('s', 0, 0, 0, { bv: [40, 0] }));
  ok(S.some(f => f[FL_Y] < -3 * 8 * HU), 'down a flight of stairs · lowest ' + Math.min(...S.map(f => f[FL_Y])).toFixed(2));
  ok(S.every(f => f[FL_X] > -6 || f[FL_Y] <= 0), 'not up a 40 HU ledge'); }

// ── Determinism: the same flames from the same state; the host's tick doesn't matter; a LAN client's copy agrees ──
{ const throwAt = (tickMs) => { const g = game([{ id: 'n7', kind: 'molotov', by: 'ann', phase: 'air', x: 0, y: 6, z: 0, vx: 4, vy: -2, vz: 1.5, at: T0, n: 0, acc: 0, still: 0 }]);
    let t = T0; for (let i = 0; i < 400 && g.combat.nades[0]?.phase === 'air'; i++) { t += tickMs; nadesTick(g, [], tickMs / 1000, t, {}); } return g.combat.nades[0]; };
  const a = throwAt(15), b = throwAt(100); ok(a.phase === 'fire' && b.phase === 'fire', 'the molotov burst on the floor at both tick lengths');
  ok(a.firedAt === b.firedAt && JSON.stringify(a.bv) === JSON.stringify(b.bv) && a.x === b.x && a.z === b.z, 'the burst is the same at a 15 ms and a 100 ms host tick (64 Hz steps): ' + a.firedAt + ' ' + JSON.stringify(a.bv));
  const fa = JSON.stringify(infernoFlames([], a.x, a.z, a.y, a)); clearFireCache(); const fb = JSON.stringify(infernoFlames([], b.x, b.z, b.y, b));
  ok(fa === fb, 'the same 16 flames either way');
  const wire = JSON.parse(JSON.stringify(a)); clearFireCache(); const fc = JSON.stringify(infernoFlames([], wire.x, wire.z, wire.y, wire));
  ok(fc === fa, 'LAN parity: a client\'s copy of the host\'s state (JSON) grows the very same flames');
  const sent = Object.keys(wire).filter(k => !['id', 'kind', 'by', 'phase', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'at', 'n', 'acc', 'still', 'strength', 'firedAt', 'rest', 'grav', 'bt', 'void', 'bad', 'view', 'pastGlass', 'p', 'jt', 'stillT'].includes(k));
  ok(sent.every(k => ['bv', 'xm', 'mv', 'fe'].includes(k)) && a.mv === '', 'the new fields are small: ' + sent.join(', ') + ' (bv: 2 numbers, xm: a 16-bit mask, mv: the open doors near it — \'\' here, fe: one number)');
  const other = infernoFlames([], a.x, a.z, a.y, { ...wire, id: 'n8' }); ok(JSON.stringify(other) !== fa, 'another fire (its own id) spreads its own way'); }

// (FIRE final, review R1) a pause (holdNades moves g.at and g.firedAt on) never changes the flames or their end
{ const f = fire('p1'), g = game([f], { clock: T0 + 500 }), A = JSON.stringify(infernoFlames([], f.x, f.z, f.y, f)); f.fe = fireEnd(infernoFlames([], f.x, f.z, f.y, f));
  holdNades(g, T0 + 5500); clearFireCache(); const B = JSON.stringify(infernoFlames([], f.x, f.z, f.y, f));
  ok(A === B && fireEnd(JSON.parse(B)) === f.fe && f.firedAt === T0 + 5000, 'a 5 s pause mid-spread: the same flames, the same end (the seed is the id and the spot, not g.at)'); }
// (FIRE final, review R2) the doors as they were when it burst (g.mv), not as they are when a client works the flames out
{ const door = { minX: 3, maxX: 3.6, minZ: -60, maxZ: 60, y0: 0, y1: 16, mat: 'door', mover: 4, role: 'shut', off: false }, boxes = [door]; boxes.movers = [door];   // (a door as wide as the room)
  const f = fire('door1', 0, 0, 0, { bv: [40, 0] }); f.mv = fireStamp(boxes, f.x, f.z, f.y); const shut = JSON.stringify(infernoFlames(boxes, 0, 0, 0, f));
  door.off = true; clearFireCache(); const later = JSON.stringify(infernoFlames(boxes, 0, 0, 0, f)), live = infernoFlames(boxes, 0, 0, 0, { ...f, mv: undefined });
  ok(f.mv === '' && later === shut && JSON.parse(shut).every(c => c[FL_X] < 3.6) && live.some(c => c[FL_X] > 3.6), 'the door shut at the burst stays shut for the fire on every computer (g.mv), though it opened later · past it: ' + live.filter(c => c[FL_X] > 3.6).length + ' flames only without the stamp');
  const g2 = fire('door2', 0, 0, 0, { bv: [40, 0] }); g2.mv = fireStamp(boxes, 0, 0, 0); door.off = false; clearFireCache();
  ok(g2.mv === '4:shut' && infernoFlames(boxes, 0, 0, 0, g2).some(c => c[FL_X] > 3.6), 'a door open at the burst: the fire goes through though it shut since · stamp ' + g2.mv); }

// ── Smoke puts the flames out ──
const smoke = (id, x, z, firedAt, y = 0) => ({ id, kind: 'smoke', phase: 'smoke', x, y, z, at: firedAt - 2000, firedAt });
{ // a smoke popping beside a fully grown fire: the flames its volume reaches go out one by one, the others burn on
  const f = fire('f1'); const F = infernoFlames([], f.x, f.z, f.y, f), g = game([f]); let t = T0 + 1600; nadesTick(g, [], .05, t, {});
  g.combat.nades.push(smoke('s1', F[0][FL_X] + 30, F[0][FL_Z], t));
  for (let i = 0; i < 60; i++) { t += 50; nadesTick(g, [], .05, t, {}); }
  const m = f.xm >>> 0, outN = F.filter((_, i) => (m >>> i) & 1).length;
  ok(outN > 0 && f.phase === 'fire', 'a smoke beside the fire puts out the flames it covers, the fire burns on · ' + outN + ' of ' + F.length + ' out');
  ok(F.every((c, i) => !((m >>> i) & 1) || smokeDensity(g, c[FL_X], c[FL_Y] + 2, c[FL_Z], t) > .35), 'only flames under the smoke are out');
  ok(F.every((c, i) => ((m >>> i) & 1) === (cellLit(f, c, t) ? 0 : 1) || t >= T0 + c[FL_END]), 'an out flame is not lit (every client reads the mask)'); }
{ // a smoke landing in the middle of a young fire: out at once, whole (its children never light), heard as put out
  const f = fire('f2'), g = game([f, { id: 's2', kind: 'smoke', phase: 'air', x: 0, y: .3, z: 0, vx: 0, vy: -1, vz: 0, at: T0 - 1600, still: 1 }]);
  for (let i = 0; i < 4; i++) nadesTick(g, [], .05, T0 + 50 * i, {}); ok(f.phase === 'out' && f.ext === 1, 'a smoke landing on a young fire puts it all out (g.ext: the extinguish sound and look)'); }
{ // a smoke flying into burning flames goes off there and then (before its 1.5 s fuse)
  const f = fire('f3'), F = infernoFlames([], f.x, f.z, f.y, f), g = game([f, { id: 's3', kind: 'smoke', phase: 'air', x: F[0][FL_X] - 3, y: 1, z: F[0][FL_Z], vx: 10, vy: 0, vz: 0, at: T0 + 400, n: 0, acc: 0, still: 0 }]);
  let t = T0 + 400; for (let i = 0; i < 10; i++) { t += 16; nadesTick(g, [], .016, t, {}); } const s = g.combat.nades.find(q => q.id === 's3');
  ok(s.phase === 'smoke' && s.firedAt - s.at < 1500, 'a smoke flying into the flames pops at once · after ' + (s.firedAt - s.at) + ' ms'); }
{ // fire never spreads into smoke: a smoke already up where the fire would grow — those flames never light
  const f0 = fire('f4', 0, 0, 0, { firedAt: T0 + 5000 }), F = infernoFlames([], 0, 0, 0, f0), far = F.reduce((a, c) => Math.hypot(c[FL_X], c[FL_Z]) > Math.hypot(a[FL_X], a[FL_Z]) ? c : a, F[0]);
  const s = smoke('s4', far[FL_X] * 1.6, far[FL_Z] * 1.6, T0), f = { ...f0, phase: 'air', x: 0, y: .5, z: 0, vx: 0, vy: -3, vz: 0, at: T0 + 4990, n: 0, acc: 0, still: 0 };
  const g = game([s, f]); let t = T0 + 4990, lit = 0, smokedLit = 0; for (let i = 0; i < 20 && g.combat.nades.find(q => q.id === 'f4').phase === 'air'; i++) { t += 16; nadesTick(g, [], .016, t, {}); }
  const fr = g.combat.nades.find(q => q.id === 'f4'); ok(fr.phase === 'fire', 'the molotov burst outside the smoke');
  const G = infernoFlames([], fr.x, fr.z, fr.y, fr);
  const t1 = t; for (let i = 0; i < 40; i++) { t = t1 + 50 * i; nadesTick(g, [], .05, t, {}); for (let j = 0; j < G.length; j++) if (cellLit(fr, G[j], t)) { lit++; if (smokeDensity(g, G[j][FL_X], G[j][FL_Y] + 2, G[j][FL_Z], t) > .35) smokedLit++; } }
  ok(lit > 0 && smokedLit === 0, 'fire can\'t spread into smoke: no flame ever lit inside it (' + lit + ' lit flame-ticks, ' + smokedLit + ' in smoke)'); }
{ const g = game([smoke('s5', 0, 0, T0), { id: 'm5', kind: 'molotov', by: 'ann', phase: 'air', x: 2, y: .3, z: 0, vx: 0, vy: -3, vz: 0, at: T0 + 1000, still: 0 }]);
  for (let i = 0; i < 6; i++) nadesTick(g, [], .05, T0 + 2000 + 50 * i, {}); const m = g.combat.nades.find(q => q.id === 'm5'); ok(m.phase === 'out' && m.ext === 1, 'a molotov breaking inside smoke fizzles (put out)'); }

// ── Damage per tick ──
const pl = (name, x, z, y = 9.7) => ({ name, pose: { x, y, z, yaw: 0, pitch: 0 } });
const burn = (kind, armor, who = 'Di', by = 'ann', secs = 2) => { const f = fire('d' + kind + who + (armor ? 'a' : ''), 0, 0, 0, { kind, by }), g = game([f], armor ? { armor: { [who.toLowerCase()]: { kevlar: 100, helmet: false } } } : {}); const hits = []; let t = T0 + 1000, last = MAX_HP;
  for (let i = 0; i < secs * 20; i++) { t += 50; nadesTick(g, [pl(who, 0, 0)], .05, t, {}); const h = hpOf(g, who); if (h !== last) { hits.push(last - h); last = h; } } return { hits, hp: last, kev: g.combat.armor?.[who.toLowerCase()]?.kevlar }; };
{ const b = burn('molotov', false); ok(b.hits.slice(0, 8).join() === '1,2,3,4,5,6,7,8' && b.hits.slice(8).every(h => h === 8), 'a hit every 200 ms ramping 1 → 8 (then 40 a second: weapons.vdata m_nDamage 40) · ' + b.hits.join());
  ok(FIRE.hit === 200 && NADES.molotov.dps === 40 && NADES.incendiary.dps === 40, 'the beat and CS2\'s 40 a second');
  const ma = burn('molotov', true), ia = burn('incendiary', true), ib = burn('incendiary', false);
  ok(Math.abs(FIRE_AP.molotov - 1.8 / 2) < 1e-9 && Math.abs(FIRE_AP.incendiary - 1.475 / 2) < 1e-9, 'kevlar by weapons.vdata m_flArmorRatio: molotov 1.8, incendiary 1.475 (half reaches the body)');
  ok(MAX_HP - ma.hp < MAX_HP - b.hp && MAX_HP - ia.hp < MAX_HP - ma.hp && ib.hp === b.hp, 'with kevlar the molotov burns less, the incendiary less still; bare they burn alike · ' + [MAX_HP - b.hp, MAX_HP - ma.hp, MAX_HP - ia.hp].join(' / '));
  ok(ma.kev < 100 && ia.kev < ma.kev, 'the vest wears down as it stops the fire · ' + ma.kev + ' / ' + ia.kev);
  const self = burn('molotov', false, 'Ann', 'Ann'); ok(self.hp < MAX_HP, 'the thrower burns in his own fire'); }
{ const f = fire('edge'), F = infernoFlames([], 0, 0, 0, f), c = F[0], r = INFERNO.half + INFERNO.body;
  ok(inFire(F, c[FL_X] + r - .05, c[FL_Z], 0, f, T0 + 100) && !inFire([c], c[FL_X] + r + .05, c[FL_Z], 0, f, T0 + 100), 'the burn reaches as far as a flame\'s 60-wide box meets a 32-wide body');
  ok(!inFire([c], c[FL_X], c[FL_Z], INFERNO.height + .1, f, T0 + 100), 'not someone standing above the flame\'s 80 HU'); }

// ── The view: one draw, no allocation per frame ──
{ const v = createFireView({ hostNow: () => 0, boxes: () => [] }); ok(v.mesh.isMesh && v.mesh.geometry.instanceCount === INSTANCES && !Array.isArray(v.mesh.material), 'every fire is ONE instanced mesh, one material (' + INSTANCES + ' parts)');
  const list = [fire('v1'), { ...fire('v2', 40, 0, 0), kind: 'incendiary' }], clearRanges = () => { for (const k of ['aA', 'aB', 'aC']) v.mesh.geometry.getAttribute(k).clearUpdateRanges(); };
  let t = T0; for (let i = 0; i < 300; i++) { t += 16; v.update(list, t); clearRanges(); }
  ok(v.stats.fires === 2 && v.mesh.visible, 'two fires drawn');
  const inspector = await import('node:inspector'), S = new inspector.Session(); S.connect(); const post = (m, p) => new Promise((res, rej) => S.post(m, p, (e, r) => e ? rej(e) : res(r)));
  const own = async f => { await post('HeapProfiler.startSampling', { samplingInterval: 64 }); f(); const { profile } = await post('HeapProfiler.stopSampling'); let b = 0; const w = nd => { if (/gd-fire-view\.js$|arena-nades\.js$/.test(nd.callFrame.url)) b += nd.selfSize; for (const c of nd.children) w(c); }; w(profile.head); return b; };
  const frames = N => { for (let i = 0; i < N; i++) { t += 16; v.update(list, t); clearRanges(); } };
  frames(2000); const bytes = await own(() => frames(20000)); ok(bytes / 20000 < 4, 'no allocation per frame: 20 000 frames of two fires, ' + bytes + ' bytes in all (' + (bytes / 20000).toFixed(2) + ' B a frame)');
  list[0].xm = 0b1011; const w0 = v.stats.writes; frames(1); ok(v.stats.writes === w0, 'a flame put out changes its numbers only (no new parts)');
  const fl = { id: 'v3', kind: 'molotov', phase: 'air', x: 0, y: 5, z: 0 }, ic = { id: 'v4', kind: 'incendiary', phase: 'air', x: 0, y: 5, z: 0 }, v2 = createFireView({ hostNow: () => 0, drawnAt: id => id === 'v3' || id === 'v4' ? { x: 1, y: 5, z: 2 } : null });
  let tf = T0; for (let i = 0; i < 20; i++) { tf += 16; v2.update([fl, ic], tf); } ok(v2.mesh.visible, 'a bottle in flight burns');
  const kinds = j => { const A = v2.mesh.geometry.getAttribute('aA').array, o = []; for (let i = 0; i < FLY_PARTS; i++) o.push(A[(BASE.fly + j * FLY_PARTS + i) * 4 + 3]); return o; }, km = kinds(0), ki = kinds(1);
  ok(km[0] === K.rag && km[1] === K.ragGlow && km.slice(2).every(k => k === K.trail || k === 0) && km.includes(K.trail), 'the molotov in flight: its rag, its glow, child3\'s trail of small flames · ' + km.join());
  ok(ki[0] === K.rag && ki[1] === K.spark && ki.slice(2).every(k => k === K.smokeTrail || k === 0) && ki.includes(K.smokeTrail) && !ki.includes(K.ragGlow), 'the incendiary in flight: its white-hot flame, its sparks, its dark smoke trail, no glow (weapon_incend_thrown) · ' + ki.join());
  // (FIRE final, review R3) more fires than slots: those drawn stay drawn; the rest wait — no fire restarted every frame
  const v3 = createFireView({ hostNow: () => 0, boxes: () => [] }), many = Array.from({ length: MAX_FIRES + 2 }, (_, i) => fire('m' + i, i * 40, 0, 0)); let tm = T0 + 100; v3.update(many, tm); const f0 = v3.stats.fires, w0b = v3.stats.writes;
  for (let i = 0; i < 60; i++) { tm += 16; v3.update(many, tm); } ok(f0 === MAX_FIRES && v3.stats.fires === f0 && v3.stats.writes === w0b && v3.stats.waiting === 2, MAX_FIRES + 2 + ' fires, ' + MAX_FIRES + ' slots: no restart, no rewrite over 60 frames, 2 waiting · ' + [v3.stats.fires - f0, v3.stats.writes - w0b, v3.stats.waiting].join(' / '));
  many.splice(0, 1); tm += 16; v3.update(many, tm); ok(v3.stats.fires === f0 + 1 && v3.stats.waiting === 1, 'a fire gone: a waiting one takes its slot');
  ok(v.lights.every(l => l.color.getHex() === 0xf2d393), 'the fire\'s light in CS2\'s colour (242,211,147: molotov_ / incendiary_groundfire_lighting)');
  S.disconnect(); }
// ── The molotov and the incendiary: CS2's same colours and sizes, its different flipbook, gradient, blend and breakup ──
{ ok(LOOK.molotov.half === 0 && LOOK.incendiary.half === 1 && LOOK.molotov.ob === 6 && LOOK.incendiary.ob === 3 && LOOK.molotov.desat === .15 && LOOK.incendiary.desat === .3 && LOOK.incendiary.breakup === .1, 'the renderers\' numbers: ADD vs HALF_BLEND_ADD, overbright 6 / 3, desaturation 0.15 / 0.3, the breakup 0.1');
  ok(GRAD.molotov[3][0] === .258398 && GRAD.incendiary[3][0] === .669251 && GRAD.incendiary.at(-1).slice(1).join() === '9,0,0', 'CS2\'s two colour lookup gradients (the molotov orange early, the incendiary late)');
  const VS = readFileSync(new URL('../dist/gd-fire-view.js', import.meta.url), 'utf8'); ok(/0\.470588 \+ 0\.117647/.test(VS) && /28\.0 \+ 17\.0/.test(VS), 'flame alpha 0.47–0.59 and radius 28–45 HU (flame01a InitFloat)'); }

// ── Smoke and molotov are different things (SPEC ADDENDUM 1): no shared effect, no shared sound ──
{ const smokeEv = Object.values(EVENTS).filter(e => /^nade\.smoke\./.test(e.id)), fireEv = Object.values(EVENTS).filter(e => /^nade\.(molotov|incendiary|fire)\./.test(e.id));
  ok(smokeEv.length >= 3 && fireEv.length >= 10, 'both have their own sound events · ' + smokeEv.length + ' / ' + fireEv.length);
  const cs = e => e.cs, sm = new Set(smokeEv.map(cs).filter(Boolean)); ok(fireEv.every(e => !sm.has(e.cs)), 'no CS2 sound event is both a smoke\'s and a fire\'s');
  const FXR = /\.(emit|far|clear|ignite|smash|pop|air|loop|crackle|fade|out)$/, ss = new Set(smokeEv.filter(e => FXR.test(e.id)).map(e => e.syn).filter(Boolean)); ok(fireEv.filter(e => FXR.test(e.id)).every(e => !e.syn || !ss.has(e.syn)), 'nor any effect\'s synthesized stand-in id (the smoke\'s hiss, the extinguish\'s douse; the throw\'s whoosh is handling, as the pin) · ' + [...ss].join());
  ok(EVENTS['nade.molotov.air'].far === 'nade.molotov.far' && EVENTS['nade.incendiary.air'].far === 'nade.incendiary.far', 'an air burst carries its distant layer (Molotov.StartDistant / IncGrenade.Distant: StartFailed\'s soundevent_01)');
  ok(!(EVENTS['nade.incendiary.ignite'].f || []).some(x => /glass/.test(x)) && !(EVENTS['nade.incendiary.air'].f || []).some(x => /glass/.test(x)), 'the can never breaks like a bottle (no glass stand-in: IncGrenade.Start is inc_grenade_detonate)');
  const nv = readFileSync(new URL('../dist/arena-nades-view.js', import.meta.url), 'utf8'); ok(/snd\('nade\.fire\.crackle'/.test(nv) && /onFlame/.test(nv), 'each flame lighting plays CS2\'s Inferno.Fire.Ignite');
  ok(EVENTS['nade.fire.out'].cs === 'Molotov.Extinguish' && EVENTS['nade.fire.loop'].cs === 'Inferno.Loop' && EVENTS['nade.molotov.ignite'].cs === 'Molotov.Start' && EVENTS['nade.incendiary.ignite'].cs === 'IncGrenade.Start' && EVENTS['nade.fire.crackle'].cs === 'Inferno.Fire.Ignite' && EVENTS['nade.fire.fade'].cs === 'Inferno.FadeOut', 'the fire\'s CS2 events by their names in game_sounds_weapons.vsndevts');
  ok(EVENTS['nade.smoke.emit'].cs === 'BaseSmokeEffect.Sound', 'the smoke\'s own (BaseSmokeEffect.Sound)');
  // (the handling sounds — pulling the pin, a bounce — share the shipped generic takes until CS2's are imported: their CS2
  // events differ, Molotov.Bounce vs SmokeGrenade.Bounce; the effects' own placeholders never do)
  const EFFECT = /\.(emit|far|clear|ignite|smash|pop|air|loop|crackle|fade|out)$/, sf = new Set(smokeEv.filter(e => EFFECT.test(e.id)).flatMap(e => e.f || []));
  ok(fireEv.filter(e => EFFECT.test(e.id)).every(e => !(e.f || []).some(x => sf.has(x))), 'nor any shipped placeholder file of an effect (burst, burn, put out vs the smoke\'s pop)');
  const view = readFileSync(new URL('../dist/arena-nades-view.js', import.meta.url), 'utf8'), body = view.slice(view.indexOf('function effect(g)'), view.indexOf('return { fx, parts, start'));
  const fireBranch = body.slice(body.indexOf("if (g.phase === 'fire')"), body.length), smokeBranch = body.slice(body.indexOf("if (g.phase === 'smoke')"), body.indexOf("if (g.phase === 'fire')"));
  ok(!/MAT\.smoke|MAT\.core|smokes\(\)|'poof'|'smoke'\s*,/.test(fireBranch), 'the fire / extinguish effects use nothing of the smoke\'s (its material, its pass, its sounds)');
  ok(!/fire\.|'fire'|'glass'|MAT\.flame|MAT\.glow/.test(smokeBranch), 'the smoke uses nothing of the fire\'s');
  const fv = readFileSync(new URL('../dist/gd-fire-view.js', import.meta.url), 'utf8'); ok(!/arena-smoke-pass|smokeVoxels|SMOKE\b/.test(fv), 'the fire\'s renderer is its own (not the smoke pass)');
  ok(Object.values(K).length === new Set(Object.values(K)).size, 'each fire part has its own kind'); }

console.log(`PASS gd-fire · ${n} checks (CS2's inferno: 16 flames / 42 HU / 150 HU / 7 s, walls, stairs, a crate; deterministic over tick lengths and over LAN; smoke puts out flames one by one, a smoke flying in pops, no spread into smoke, a molotov in smoke fizzles; burn ramp, kevlar by vdata, own fire; one draw, no allocation per frame; smoke and fire share no effect or sound)`);
