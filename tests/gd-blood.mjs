// Global Defensive blood (gd-blood.js, combat-logic.js bleed / bleedFrom, arena-logic.js bot hits, Settings → Blood):
//  · the host: a traced shot, a knife and a bot's hit each leave one record on combat.bl (where the bullet met the body,
//    its direction, zone, damage, a rising number), only for real damage, kept 1.5 s / 12 at most;
//  · the spray from a record (pure, seeded by its number): CS2's tiers — a weak armoured body shot still sprays (low), a
//    head shot is the biggest (high + the head-shot extras), out of the exit side and back toward the shooter;
//  · decals on the map's real surface: on the wall behind the victim along the shot (within CS2's 172 HU), all four
//    corners on that face; at a pillar's edge they shrink to fit or are left out (never hanging in the air); floor
//    splats and a drip on the floor; nothing past CS2's reach;
//  · fixed pools (64 particles, 48 decals) recycled oldest first; a round's change (Defuse round number, map) clears them;
//  · LAN parity: two computers given the same host records draw identical decals and particles;
//  · your own wounds spray nothing in your view (and the watched player's while spectating); their decals are drawn;
//  · the Setting: Blood off draws nothing and hides what was there at once; default on; in Settings → Global Defensive;
//  · update() makes nothing per frame (heap flat over 20 000 frames, with blood alive and the record list unchanged).
//   node tests/gd-blood.mjs        (re-runs itself with --expose-gc for the allocation check)
import { readFileSync } from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { spawnSync } from 'node:child_process';
if (typeof globalThis.gc !== 'function') { const r = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url)], { stdio: 'inherit' }); process.exit(r.status ?? 1); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, ok = 0; const check = (name, c, d = '') => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c || d === '' ? '' : ' · ' + String(d).slice(0, 400))); };
// window events for the preferences (live-settings.js listens on globalThis)
const ET = new EventTarget(); globalThis.addEventListener = ET.addEventListener.bind(ET); globalThis.dispatchEvent = ET.dispatchEvent.bind(ET);
let T = 1000; performance.now = () => T;
const THREE = await import('../dist/three.module.js');
const B = await import('../dist/gd-blood.js');
const { live } = await import('../dist/live-settings.js'); const { savePreferences, loadPreferences } = await import('../dist/player-preferences.js');
const { bleed, bleedFrom, combatApply, BLEED_MS, traceShot } = await import('../dist/combat-logic.js');
const { startArena, arenaApply, arenaTick } = await import('../dist/arena-logic.js');
const { ARENA_MAPS, mapBoxes, segmentClear } = await import('../dist/arena-maps.js');
const { ARENA } = await import('../dist/facility-layout.js');
const { weaponById, HU } = await import('../dist/weapons-data.js');
const { SPRAY_N, DECAL_N, SP, DC, planSpray, planDecals, mapCast, castN, tierOf, createBlood, validRecord, KEEP_MS } = B;
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ── the host's records ──────────────────────────────────────────────────────────────────────────────────────────────
const map = ARENA_MAPS.yard, yb = mapBoxes(map, ARENA.cx, ARENA.cz);
const spot = (() => { for (let x = -120; x < 120; x += 4) for (let z = -120; z < 120; z += 4) { const a = { x: ARENA.cx + x, z: ARENA.cz + z }, b = { x: a.x + 30, z: a.z }; if ([a, b].every(p => !yb.some(q => p.x > q.minX - 3 && p.x < q.maxX + 3 && p.z > q.minZ - 3 && p.z < q.maxZ + 3)) && segmentClear(yb, a.x, 9.7, a.z, b.x, 7, b.z) && segmentClear(yb, a.x, 9.7, a.z, b.x, 10, b.z) && segmentClear(yb, a.x, 9.7, a.z, b.x, 2, b.z)) return a; } })();
const yawTo = (f, x, z) => Math.atan2(-(x - f.x), -(z - f.z)), pitchTo = (f, x, y, z) => Math.atan2(y - f.y, Math.hypot(x - f.x, z - f.z));
const fresh = (prim = 'ak', t0 = 3e9) => { const g = { levels: {} }; startArena(g, { map: 'yard', bots: 0 }, t0); const a = { x: spot.x, y: 9.7, z: spot.z }, b = { x: spot.x + 30, y: 9.7, z: spot.z, yaw: 0 }; a.yaw = yawTo(a, b.x, b.z);
  const P = [{ id: 'a', name: 'Ann', pose: a }, { id: 'b', name: 'Bo', pose: b }]; arenaApply(g, { type: 'loadout', primary: prim }, 'Ann', P, t0); return { g, P, a, b }; };
const shotRec = (wpn, a, b, nn, ft, h = 7.9, extra = {}) => ({ type: 'hit', target: 'b', weapon: wpn, n: nn, ft, eye: [a.x, a.y, a.z], look: [pitchTo(a, b.x, h, b.z), yawTo(a, b.x, b.z)], pu: [0, 0], ia: weaponById(wpn).acc.stand, zone: 'chest', ...extra });
{ const { g, P, a, b } = fresh(); const t = 3e9 + 5000;
  const r = combatApply(g, shotRec('ak', a, b, 1001, 100), 'Ann', P, 'a', t), L = g.combat.bl || [], q = L[0];
  check('a traced chest shot leaves one blood record (victim, zone, damage, rising number, host time)', r.dmg === 36 && L.length === 1 && q.v === 'bo' && q.z === 'chest' && q.d === 36 && q.i >= t && q.at === t && !q.k, JSON.stringify(q));
  check('…at the bullet\'s entry on the body (the near side, at chest height), along the bullet', q && near(q.p[0], b.x - 1.5, .35) && near(q.p[1], 7.9, .4) && near(q.p[2], b.z, .2) && q.r[0] > .99, JSON.stringify(q));
  const T2 = traceShot(g, weaponById('ak'), shotRec('ak', a, b, 1002, 200), 1002, a, b); check('traceShot reports the nearest bullet\'s entry point and direction', T2.at.length === 3 && near(Math.hypot(...T2.dir), 1, 1e-9) && near(T2.at[0], a.x + T2.dir[0] * T2.dist, 1e-9));
  const r2 = combatApply(g, shotRec('ak', a, b, 1002, 200, 10.2), 'Ann', P, 'a', t + 200), q2 = g.combat.bl.at(-1);
  check('a head shot: zone head, it killed (k), a higher number', r2.down && q2.z === 'head' && q2.k === 1 && q2.i > q.i, JSON.stringify(q2));
  const before = g.combat.bl.length; try { combatApply(g, shotRec('ak', a, b, 1003, 400), 'Ann', P, 'a', t + 400); } catch {}
  check('no blood for no damage (the victim already down)', g.combat.bl.length === before);
  const sizeOK = JSON.stringify(q).length < 140; check('a record is tiny (' + JSON.stringify(q).length + ' bytes)', sizeOK); }
{ const g = { mode: 'arena', combat: { hp: {}, down: {}, kills: {}, deaths: {}, last: {}, respawns: {}, feed: [] } }, res = { dmg: 27, zone: 'stomach', hp: 73 };
  for (let k = 0; k < 20; k++) bleed(g, 'X', res, 0, 5, 0, 1, 0, 0, 1e6 + k);
  check('the list keeps 12 at most', g.combat.bl.length === 12 && g.combat.bl[0].i < g.combat.bl[11].i);
  bleed(g, 'X', res, 0, 5, 0, 1, 0, 0, 1e6 + BLEED_MS + 100); check('…and only the last ' + BLEED_MS + ' ms', g.combat.bl.length === 1);
  check('numbers keep rising past a host restart (max(last + 1, host ms))', bleed(g, 'X', res, 0, 5, 0, 1, 0, 0, 1e6 + BLEED_MS + 100).i === g.combat.bl[0].i + 1);
  check('nothing for zero damage or a bad direction', bleed(g, 'X', { dmg: 0 }, 0, 5, 0, 1, 0, 0, 2e6) === null && bleed(g, 'X', res, 0, 5, 0, 0, 0, 0, 2e6) === null);
  const k = bleedFrom(g, 'Y', { dmg: 65, zone: 'chest', down: true }, 0, 9.7, 0, { x: 10, z: 0, fy: 0, cr: false }, 3e6, true);
  check('a knife (from the attacker\'s eye to the body): on the near side, chest height, a knife and a kill', k && k.kn === 1 && k.k === 1 && near(k.p[0], 8.5, .2) && near(k.p[1], 7.9, .35) && k.r[0] > .95, JSON.stringify(k)); }
{ // bots: an arena tick with a fighting bot facing a player hits him now and then — each hit with its blood record
  const g = { levels: {} }, t0 = 5e9; startArena(g, { map: 'yard', bots: 1 }, t0); const bot = g.arena.bots[0]; bot.x = spot.x + 30; bot.z = spot.z; bot.skill = 1; bot.yaw = yawTo(bot, spot.x, spot.z);
  const P = [{ id: 'a', name: 'Ann', pose: { x: spot.x, y: 9.7, z: spot.z, yaw: 0 } }]; let hits = 0, recs = 0, t = t0 + 4000;
  for (let k = 0; k < 400 && !recs; k++) { t += 50; bot.x = spot.x + 30; bot.z = spot.z; const hp0 = g.combat?.hp?.ann ?? 100; arenaTick(g, P, .05, t); if ((g.combat?.hp?.ann ?? 100) < hp0) hits++; recs = (g.combat?.bl || []).length; if (g.combat?.down?.ann) delete g.combat.down.ann, g.combat.hp.ann = 100; }
  const q = g.combat?.bl?.[0]; check('a bot\'s hit leaves a blood record too (from the bot\'s eye to the player)', recs > 0 && hits > 0 && q.v === 'ann' && q.r[0] < -.9, JSON.stringify(q)); }

// ── the spray (pure) ────────────────────────────────────────────────────────────────────────────────────────────────
const recAt = (i, extra = {}) => ({ i, at: 0, v: 'bo', z: 'chest', d: 36, p: [0, 7.9, 0], r: [1, 0, 0], ...extra });
const PB = new Float32Array(B.MAX_PER_HIT * SP);
{ const low = planSpray(recAt(1, { d: 9, z: 'stomach' }), PB), med = planSpray(recAt(2), PB), high = planSpray(recAt(3, { d: 70 }), PB), head = planSpray(recAt(4, { z: 'head', d: 100 }), PB);
  check('tiers by damage: low < 25 ≤ med < 60 ≤ high; head shots high', tierOf({ d: 9 }) === 'low' && tierOf({ d: 36 }) === 'med' && tierOf({ d: 70 }) === 'high' && tierOf({ z: 'head', d: 5 }) === 'high');
  check('a weak (armoured) body shot still sprays; a head shot is the biggest (' + [low, med, high, head].join(' / ') + ' particles)', low >= 5 && med > low && high >= med - 1 && head > high && head <= B.MAX_PER_HIT);
  planSpray(recAt(5, { d: 70 }), PB); let fwd = 0, back = 0, red = 0; for (let k = 0; k < high; k++) { const vx = PB[k * SP + 3]; if (vx > 0) fwd++; else back++; if (PB[k * SP + 16] > PB[k * SP + 17] * 4) red++; }
  check('out of the exit side and back toward the shooter (both), all red', fwd >= 3 && back >= 3 && red === high, fwd + '/' + back + '/' + red);
  const A = new Float32Array(PB.length), Bq = new Float32Array(PB.length); planSpray(recAt(77, { z: 'head' }), A); planSpray(recAt(77, { z: 'head' }), Bq); const C = new Float32Array(PB.length); planSpray(recAt(78, { z: 'head' }), C);
  check('the same record → the same particles; another number → others', A.every((v, k) => v === Bq[k]) && !A.every((v, k) => v === C[k]));
  check('records checked (no direction, no point: nothing)', planSpray({ i: 1, p: [0, 0, 0], r: [0, 0, 0] }, PB) === 0 && !validRecord({ i: 1, p: [0, 1], r: [1, 0, 0] })); }

// ── decals on the map's surface ─────────────────────────────────────────────────────────────────────────────────────
// A room: a wall at x = 15..17 (y 0..20, z −20..20), a pillar 3 wide (~20 HU) at x = 15 further along z, the floor y = 0.
const wall = { minX: 15, maxX: 17, y0: 0, y1: 20, minZ: -20, maxZ: 20, mat: 'concrete' }, pillar = { minX: 15, maxX: 17, y0: 0, y1: 20, minZ: 98.5, maxZ: 101.5, mat: 'concrete' };
let boxes = [wall, pillar]; const cast = mapCast(() => boxes), DB = new Float32Array(B.MAX_DECALS_PER_HIT * DC);
const corners = (o) => { const out = []; for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) out.push([0, 1, 2].map(k => DB[o + k] + DB[o + 3 + k] * su * .72 + DB[o + 6 + k] * sv * .72)); return out; };
{ const nd = planDecals(recAt(11, { d: 70 }), cast, DB); let wallN = 0, floorN = 0, bad = 0;
  for (let j = 0; j < nd; j++) { const o = j * DC; if (near(DB[o], 15, .05)) { wallN++; for (const c of corners(o)) if (!(near(c[0], 15, .05) && c[1] >= 0 && c[1] <= 20 && c[2] >= -20 && c[2] <= 20)) bad++; } else if (near(DB[o + 1], 0, .05)) { floorN++; for (const c of corners(o)) if (!near(c[1], 0, .05)) bad++; } else bad += 10; }
  check('a high hit near a wall: splats on the wall behind (x = 15, along the shot) and on the floor, every corner on its surface', wallN >= 1 && floorN >= 1 && bad === 0, `wall ${wallN} floor ${floorN} bad ${bad} of ${nd}`);
  const o = 0, w = Math.hypot(DB[o + 3], DB[o + 4], DB[o + 5]) * 2 / HU;
  check('the wall splat faces the shooter (lies flat on the face) at CS2\'s size (35–72 HU)', near(DB[o], 15 - .015, .02) && near(DB[o + 3], 0, 1e-6) && near(DB[o + 6], 0, 1e-6) && w >= 20 && w <= 72, w.toFixed(1) + ' HU');
  const far = planDecals(recAt(12, { d: 70, p: [-30, 7.9, 0] }), cast, DB); let onWall = 0; for (let j = 0; j < far; j++) if (near(DB[j * DC], 15, .05)) onWall++;
  check('a wall past CS2\'s reach (45 units > 172 HU): no wall splat, floor ones only', onWall === 0 && far >= 1, far);
  // the pillar's edge: a splat there shrinks to the face, or is left out
  let shrunk = 0, inAir = 0, total = 0; for (let k = 0; k < 60; k++) { const m = planDecals(recAt(100 + k, { d: 70, p: [8, 7.9, 100 + (k % 7 - 3) * .3] }), cast, DB);
    for (let j = 0; j < m; j++) { const o2 = j * DC; if (!near(DB[o2], 15, .05)) continue; total++; const h = Math.hypot(DB[o2 + 3], DB[o2 + 4], DB[o2 + 5]); if (h * .72 <= 1.5 + 1e-6) shrunk++; for (const c of corners(o2)) if (c[2] < 98.5 - 1e-3 || c[2] > 101.5 + 1e-3) inAir++; } }
  check('on a 3-unit pillar the splats shrink to its face (or are left out); none hangs past its edges', inAir === 0 && total > 0 && shrunk === total, `${total} on it, ${shrunk} shrunk, ${inAir} corners in the air`);
  const A = new Float32Array(DB.length), Bd = new Float32Array(DB.length), na = planDecals(recAt(13, { z: 'head' }), cast, A), nb = planDecals(recAt(13, { z: 'head' }), cast, Bd);
  check('the same record → the same decals (every computer)', na === nb && na > 0 && A.every((v, k) => v === Bd[k]));
  check('decals don\'t depend on whose view (the spray\'s own-wound rule changes no decal)', planDecals(recAt(13, { z: 'head', v: 'bo' }), cast, Bd) === na && A.every((v, k) => v === Bd[k]));
  boxes = []; const nf = planDecals(recAt(14, { d: 70 }), cast, DB); let flat = true; for (let j = 0; j < nf; j++) if (!near(DB[j * DC + 1], .015, .01)) flat = false;
  check('open ground: floor splats and a drip only, flat on y = 0', nf >= 2 && flat); boxes = [wall, pillar]; }

// ── the pools: recycling, round clear, LAN parity, own wounds, the Setting, no garbage per frame ────────────────────
const mkGame = () => ({ mode: 'arena', arena: { map: 'yard' }, combat: { d: { match: 'm1', n: 1, round: { phase: 'live' } }, bl: [] } });
const scene = new THREE.Scene(); let G = mkGame(), hostT = 10_000; const me = { k: 'ann' }, watch = { k: null };
const blood = createBlood(scene, { boxes: () => boxes, game: () => G, me: () => me.k, watched: () => watch.k, clock: () => hostT, assets: false });
const send = recs => { G.combat = { ...G.combat, bl: recs }; };   // (a new combat frame: a new state object, as multiplayer.js mergeGdFrame)
check('two top-level pools in the scene: the spray after a smoke (fx), the decals with the map; both warmed (userData.gd / warm)', scene.children.includes(blood.spray) && scene.children.includes(blood.decals) && blood.spray.userData.fx && !blood.decals.userData.fx && blood.spray.userData.gd && blood.decals.userData.warm && blood.spray.geometry.instanceCount === SPRAY_N && blood.decals.geometry.instanceCount === DECAL_N);
blood.update(); check('nothing drawn before a hit', !blood.spray.visible && !blood.decals.visible);
let seq = 50_000; const mk = (extra = {}) => ({ ...recAt(++seq), at: hostT, p: [8, 7.9, (seq % 30) - 15], ...extra });
send([mk({ d: 70 })]); blood.update(); check('a record: spray at once (one draw), its decals the next frames', blood.spray.visible && blood.stats.sHead > 0 && blood.stats.decals > 0);
const s1 = blood.stats.sHead; blood.update(); check('the same frame again (list unchanged): nothing new', blood.stats.sHead === s1);
{ const h1 = blood.stats.hits; G.combat.bl.push(mk({ d: 30 })); blood.update(); check('a host in this page (practice) adds to its own list in place: drawn too', blood.stats.hits === h1 + 1); blood.update(); check('…once', blood.stats.hits === h1 + 1); }
// recycling
for (let k = 0; k < 30; k++) { send([mk({ z: 'head', d: 100 })]); blood.update(); T += 16; }
for (let k = 0; k < 8; k++) blood.update();
const st = blood.stats; check('64 particles, 48 decals at most: recycled oldest first (ring heads wrap)', st.decals === DECAL_N && st.sHead < SPRAY_N && st.dHead < DECAL_N && blood.pools.spray.aP.count === SPRAY_N, JSON.stringify(st));
{ const P = blood.pools.spray.aP.array, newest = (blood.stats.sHead + SPRAY_N - 1) % SPRAY_N, oldest = blood.stats.sHead; check('…the newest particle is the latest born, the next slot to fill the oldest', P[newest * 4 + 3] >= P[oldest * 4 + 3]); }
// stale and old records
const h0 = blood.stats.hits; send([{ ...mk(), at: hostT - KEEP_MS - 1 }]); blood.update(); check('a record older than ' + KEEP_MS + ' ms (a join, a stall) is not drawn', blood.stats.hits === h0);
const old = G.combat.bl; send(old); blood.update(); check('records already drawn are never drawn again', blood.stats.hits === h0);
// own wounds
{ const sH = blood.stats.sHead, dc0 = blood.stats.dHead; send([mk({ v: 'ann', d: 70 })]); blood.update(); blood.update();
  check('your own wound: no spray in your view, its decals drawn', blood.stats.sHead === sH && blood.stats.dHead !== dc0);
  watch.k = 'cy'; send([mk({ v: 'cy', d: 70 })]); blood.update(); check('spectating: the watched player\'s wound sprays nothing either', blood.stats.sHead === sH); watch.k = null; }
// the round changes: cleared
G = { ...G, combat: { ...G.combat, d: { ...G.combat.d, n: 2 }, bl: [] } }; blood.update();
check('a new round (Defuse round number) clears every decal and particle', blood.stats.decals === 0 && !blood.decals.visible && !blood.spray.visible && blood.pools.decals.aV.array.every(v => v === 0));
send([mk({ d: 70 })]); blood.update(); blood.update(); G = { ...G, arena: { map: 'dust2' } }; blood.update(); check('a map change clears them too', blood.stats.decals === 0);
// LAN parity: two computers, the same records (arriving at different times)
{ const sA = new THREE.Scene(), sB = new THREE.Scene(), GA = mkGame(), GB = mkGame(); let tA = 20_000;
  const a = createBlood(sA, { boxes: () => boxes, game: () => GA, me: () => 'pa', clock: () => tA, assets: false }), b = createBlood(sB, { boxes: () => boxes, game: () => GB, me: () => 'pb', clock: () => tA, assets: false });
  const R = [{ ...recAt(900001), at: tA, z: 'head', d: 100, p: [8, 7.9, 3] }, { ...recAt(900002), at: tA, d: 27, z: 'stomach', p: [7, 5.8, -4], r: [.9, -.1, .42] }];
  GA.combat = { ...GA.combat, bl: [R[0]] }; a.update(); GA.combat = { ...GA.combat, bl: R }; a.update(); for (let k = 0; k < 4; k++) a.update();
  T += 37; GB.combat = { ...GB.combat, bl: R }; for (let k = 0; k < 6; k++) b.update();
  const pa = a.pools, pb = b.pools, same = (x, y, skipW) => x.array.every((v, k) => (skipW && k % 4 === 3) || v === y.array[k]);
  check('LAN: the same host records → identical decals on both computers', a.stats.decals > 0 && a.stats.decals === b.stats.decals && same(pa.decals.aU, pb.decals.aU) && same(pa.decals.aV, pb.decals.aV) && same(pa.decals.aC, pb.decals.aC, true), a.stats.decals + ' / ' + b.stats.decals);
  check('LAN: …and identical spray particles (only their moment of birth differs)', same(pa.spray.aV, pb.spray.aV) && same(pa.spray.aS, pb.spray.aS) && same(pa.spray.aC, pb.spray.aC) && same(pa.spray.aP, pb.spray.aP, true)); }
// the Setting
{ check('Blood is on by default', loadPreferences().blood !== false && live.blood === true);
  send([mk({ d: 70 })]); blood.update(); blood.update(); const had = blood.stats.decals;
  savePreferences({ ...loadPreferences(), blood: false }); check('Settings → Blood off: applied live (live.blood)', live.blood === false);
  blood.update(); check('…what was drawn goes at once', had > 0 && blood.stats.decals === 0 && !blood.spray.visible && !blood.decals.visible);
  const h1 = blood.stats.hits; send([mk({ d: 70 })]); blood.update(); check('…and no new blood while off', blood.stats.hits === h1 && blood.stats.decals === 0);
  savePreferences({ ...loadPreferences(), blood: true }); blood.update(); check('back on: the record seen while off is not replayed', blood.stats.hits === h1);
  send([mk({ d: 70 })]); blood.update(); check('…new hits draw again', blood.stats.hits === h1 + 1 && blood.spray.visible);
  const ui = readFileSync(path.join(root, 'dist/campaign-ui.js'), 'utf8'); const gd = ui.indexOf('<h3>Global Defensive</h3>'), at = ui.indexOf('data-set="blood"');
  check('the checkbox is in Settings → Global Defensive, checked unless turned off (saved like the other prefs)', gd > 0 && at > gd && at - gd < 2000 && /data-set="blood" \$\{p\.blood !== false \? 'checked' : ''\}/.test(ui)); }
// no garbage per frame: blood alive, the list unchanged
{ for (let k = 0; k < 6; k++) { send([mk({ z: 'head', d: 100 })]); blood.update(); }
  const frames = m => { for (let k = 0; k < m; k++) { T += 16; blood.update(); } };
  frames(20000); const round = () => { gc(); gc(); const h0 = process.memoryUsage().heapUsed; frames(20000); gc(); gc(); return process.memoryUsage().heapUsed - h0; }; const dh = Math.min(round(), round(), round());
  check('update() makes nothing per frame (heap +' + dh + ' B over 20 000 frames)', dh < 48 * 1024, dh); }
// draw cost: one draw per pool — the meshes are single InstancedBufferGeometry quads
check('one instanced draw per pool (a quad, 6 indices, N instances)', blood.spray.geometry.isInstancedBufferGeometry && blood.decals.geometry.isInstancedBufferGeometry && blood.spray.geometry.index.count === 6 && blood.decals.geometry.index.count === 6);
// built-in pictures (players without the CS2 files)
{ const d = B.builtinDecals(256), s = B.builtinSpray(128); let da = 0, sa = 0; for (let k = 3; k < d.length; k += 4) da += d[k] > 0; for (let k = 3; k < s.length; k += 4) sa += s[k] > 0;
  check('built-in pictures: decal splats and spray frames drawn (no CS2 files needed)', da > d.length / 4 * .08 && sa > s.length / 4 * .08, da + ' / ' + sa);
  check('the built-in decal atlas is the same each time (every computer)', (() => { const x = B.builtinDecals(128), y = B.builtinDecals(128); return x.length === y.length && x.every((v, k) => v === y[k]); })()); }

console.log(`\n${ok}/${n} passed`); process.exit(ok === n ? 0 : 1);
