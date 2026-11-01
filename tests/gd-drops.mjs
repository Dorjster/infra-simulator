// Dropped weapons (host authority, arena-logic.js; resting pose, weapon-models.js groundRest): one item can never be
// taken twice (two claims, two players walking over it in one tick); nobody walks it up before it lands, nor a bot on
// another floor; the bomb tossed like a gun, on the carrier's side of a wall and on their own floor whatever height the
// client sends; a long gun dropped by a wall lies clear of it; no pickup without a known pose; every model rests on the
// floor by its own bounds (no sinking, no floating) at any yaw. Built-in maps and models: runs everywhere.
//   node tests/gd-drops.mjs
import assert from 'node:assert/strict';
import { startArena, arenaApply, arenaTick } from '../dist/arena-logic.js';
import { ARENA_MAPS, mapBoxes, segmentClear, walkable } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
import { WEAPONS, GRENADES } from '../dist/weapons-data.js';
import { teamOf } from '../dist/arena-defuse.js';
let seed = 7; Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let pass = 0, fail = 0; const ok = (name, c, info = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + name + (info !== '' ? ' · ' + info : '')); };
const cx = ARENA.cx, cz = ARENA.cz, EYE = 9.7;
// ── Exclusive pickup: two claims on one item, two players over it in the same tick ──
{ const g = { levels: {} }, t = 3e9; startArena(g, { map: 'yard', bots: 0 }, t); const z0 = cz + 100;
  const P = [{ name: 'Ann', pose: { x: cx, y: EYE, z: z0, yaw: 0 } }, { name: 'Bo', pose: { x: cx + 1, y: EYE, z: z0, yaw: 0 } }, { name: 'Cy', pose: { x: cx - 1, y: EYE, z: z0, yaw: 0 } }];
  arenaApply(g, { type: 'loadout', primary: 'ak' }, 'Ann', P, t); arenaApply(g, { type: 'drop', slot: 'primary' }, 'Ann', P, t); const it = g.combat.ground.find(x => x.item === 'ak');
  for (const p of P.slice(1)) { p.pose.x = it.x; p.pose.z = it.z + 2; }
  const r = []; for (const who of ['Bo', 'Cy']) { try { r.push(arenaApply(g, { type: 'pickup', id: it.id }, who, P, t + 5000)); } catch (e) { r.push('ERR ' + e.message); } }
  ok('two claims on one gun: one gets it, the other is told it\'s taken', /Picked up/.test(r[0]) && /Already taken/.test(r[1]) && g.arena.loadout.bo.primary === 'ak' && !g.arena.loadout.cy?.primary, r.join(' | '));
  // walking over: both stand on it with empty primaries in one tick
  arenaApply(g, { type: 'drop', slot: 'primary' }, 'Bo', P, t + 6000); const it2 = g.combat.ground.find(x => x.item === 'ak'); for (const p of P) { p.pose.x = it2.x; p.pose.z = it2.z; }
  arenaTick(g, P, .05, t + 6000 + (it2.fly?.ms || 0) + 2000); const holders = ['ann', 'bo', 'cy'].filter(k => g.arena.loadout[k]?.primary === 'ak');
  ok('two players walking over it in one tick: exactly one takes it, it leaves the ground', holders.length === 1 && !g.combat.ground.some(x => x.item === 'ak'), holders.join(','));
}
// ── Not taken before it lands (walk-over), bots: landed and on their own floor; no pose, no pickup ──
{ const g = { levels: {} }, t = 4e9; startArena(g, { map: 'yard', bots: 0 }, t); const z0 = cz + 100;
  const P = [{ name: 'Ann', pose: { x: cx, y: EYE + 10, z: z0, yaw: 0 } }, { name: 'Bo', pose: { x: cx + 40, y: EYE, z: z0, yaw: 0 } }];   // (Ann up high: a long flight)
  arenaApply(g, { type: 'loadout', primary: 'ak' }, 'Ann', P, t); arenaApply(g, { type: 'drop', slot: 'primary' }, 'Ann', P, t); const it = g.combat.ground.find(x => x.item === 'ak');
  P[1].pose.x = it.x; P[1].pose.z = it.z; P[1].pose.y = (it.y || 0) + EYE; const ms = it.fly?.ms || 0;
  arenaTick(g, P, .05, t + Math.max(350, ms - 100)); const early = g.combat.ground.some(x => x.id === it.id);
  arenaTick(g, P, .05, t + ms + 60); const late = !g.combat.ground.some(x => x.id === it.id) && g.arena.loadout.bo?.primary === 'ak';
  ok('a tossed gun is not walked up before it lands (flight ' + ms + ' ms)', ms > 450 && early, 'on the ground at ' + Math.max(350, ms - 100) + ' ms: ' + early);
  // the client's own walk-over (arena-ui autoPick sends {type:'pickup', walk: true} 6×/s): refused in the air; an E press may catch it (CS2's +use)
  { const P3 = [{ name: 'Ann', pose: { x: cx, y: EYE + 10, z: z0, yaw: 0 } }, { name: 'Bo', pose: { x: cx, y: EYE, z: z0, yaw: 0 } }, { name: 'Cy', pose: { x: cx, y: EYE, z: z0, yaw: 0 } }];
    arenaApply(g, { type: 'loadout', primary: 'm4' }, 'Ann', P3, t + 100); arenaApply(g, { type: 'drop', slot: 'primary' }, 'Ann', P3, t + 100); const f = g.combat.ground.find(x => x.item === 'm4'), fm = f?.fly?.ms || 0;
    for (const p of P3.slice(1)) { p.pose.x = f.x; p.pose.z = f.z; } if (g.arena.loadout.bo) g.arena.loadout.bo.primary = null; let w1 = '', w2 = '', e1 = '';
    try { w1 = arenaApply(g, { type: 'pickup', id: f.id, walk: true }, 'Bo', P3, t + 150); } catch (e) { w1 = 'ERR ' + e.message; }
    ok('the walk-over pickup a client sends is refused while the gun is in the air (50 ms into a ' + fm + ' ms flight)', fm > 450 && /not landed/i.test(w1) && g.combat.ground.includes(f), w1);
    try { w2 = arenaApply(g, { type: 'pickup', id: f.id, walk: true }, 'Bo', P3, t + 100 + Math.max(300, fm) + 10); } catch (e) { w2 = 'ERR ' + e.message; }
    ok('…and taken once it has landed', /Picked up/.test(w2) && g.arena.loadout.bo?.primary === 'm4', w2);
    arenaApply(g, { type: 'drop', slot: 'primary' }, 'Bo', P3, t + 3000); const f2 = g.combat.ground.find(x => x.item === 'm4'); P3[2].pose.x = f2.x; P3[2].pose.z = f2.z;
    try { e1 = arenaApply(g, { type: 'pickup', id: f2.id, swap: true }, 'Cy', P3, t + 3050); } catch (e) { e1 = 'ERR ' + e.message; }
    ok('…while an E press may still catch one in the air (as CS2)', /Picked up/.test(e1), e1); }
  ok('…and is, once it has', late);
  let why = ''; try { arenaApply(g, { type: 'pickup', id: 'g1' }, 'Nobody', P, t + 9000); } catch (e) { why = e.message; }
  g.combat.ground.push({ id: 'gz', item: 'm4', x: cx + 10, z: z0, y: 0, yaw: 0, at: t }); try { arenaApply(g, { type: 'pickup', id: 'gz' }, 'Ghost', P, t + 9000); } catch (e) { why = e.message; }
  ok('no pickup without a known pose (a player the host has no position for)', /Too far/.test(why) && g.combat.ground.some(x => x.id === 'gz'), why);
  // a bot under a raised floor at the same x, z does not take the rifle lying above it
  arenaApply(g, { type: 'add-bot' }, 'Ann', P, t + 9000); const bot = g.arena.bots[0]; bot.weapon = 'smg'; g.combat.ground.length = 0;
  g.combat.ground.push({ id: 'gu', item: 'sniper', x: bot.x, z: bot.z, y: (Number.isFinite(bot.y) ? bot.y : 0) + 20, yaw: 0, at: t });
  const P2 = []; delete g.combat.down?.ann; arenaTick(g, P2, .05, t + 9100);
  ok('a bot does not take a rifle lying on the floor above it', bot.weapon === 'smg' && g.combat.ground.some(x => x.id === 'gu'), bot.weapon);
  g.combat.ground.push({ id: 'gf', item: 'ak', x: bot.x, z: bot.z, y: Number.isFinite(bot.y) ? bot.y : 0, yaw: 0, at: t + 9100, fly: { ms: 900 } }); g.combat.ground = g.combat.ground.filter(x => x.id !== 'gu');
  arenaTick(g, P2, .05, t + 9300); const flying = bot.weapon === 'smg'; arenaTick(g, P2, .05, t + 10100);
  ok('…nor one still in the air; it does once it has landed', flying && bot.weapon === 'ak', bot.weapon);
}
// A position on a built-in map `d` units in front of a wall, facing it (the first wall found looking round from a spawn).
function facingWall(M, from, d) { const [sw, sd] = M.size, boxes = mapBoxes(M, cx, cz), bounds = { minX: cx - sw / 2, maxX: cx + sw / 2, minZ: cz - sd / 2, maxZ: cz + sd / 2 };
  for (let a = 0; a < 16; a++) { const yaw = a * Math.PI / 8, sx = -Math.sin(yaw), sz = -Math.cos(yaw);
    for (let s = 2; s < 120; s += .25) { const x = from.x + sx * s, z = from.z + sz * s; if (walkable(boxes, bounds, x, z, .3)) continue;
      const px = from.x + sx * (s - d), pz = from.z + sz * (s - d), y = from.y ?? EYE, tall = !segmentClear(boxes, px, y, pz, x + sx, y, z + sz) && !segmentClear(boxes, px, y - EYE + 1, pz, x + sx, y - EYE + 1, z + sz);   // (a wall: blocked at the eye and at the feet — not a step)
      if (s - d > 1 && tall && walkable(boxes, bounds, px, pz, 1)) return { x: px, z: pz, yaw, boxes, wall: { x, z } }; break; } }
  return null; }
// ── The bomb: tossed like a gun — on the carrier's side of a wall, on their own floor (never the client's height) ──
{ const M = ARENA_MAPS.dust2, g = { levels: {} }; let t = 5e9; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, t);
  const at = ([x, z]) => ({ x: cx + x, y: EYE + (M.nav ? M.nav.floorAt(x, z) || 0 : 0), z: cz + z, yaw: 0 });
  const P = [{ name: 'Ann', pose: at(M.t[0]) }, { name: 'Cy', pose: at(M.ct[0]) }]; arenaTick(g, P, .05, t += 50); P[0].pose = at(M.t[0]); P[1].pose = at(M.ct[0]);
  const carrier = P.find(p => p.name.toLowerCase() === g.combat.d.bomb.carrier); const w = facingWall(M, carrier.pose, 2);
  if (!w) ok('found a wall by the T spawn', false); else {
    carrier.pose = { ...carrier.pose, x: w.x, z: w.z, y: EYE + (M.nav ? M.nav.floorAt(w.x - cx, w.z - cz) || 0 : 0), yaw: w.yaw }; const floor = carrier.pose.y - EYE;   // (standing on the floor there)
    arenaApply(g, { type: 'drop', slot: 'bomb', y: 200 }, carrier.name, P, t += 50); const b = g.combat.ground.find(x => x.item === 'c4');
    ok('the bomb lies on the carrier\'s side of the wall (seen from their eye)', b && segmentClear(w.boxes, w.x, carrier.pose.y, w.z, b.x, Math.min(b.y, floor + 4) + 1, b.z) && segmentClear(w.boxes, w.x, floor + 1, w.z, b.x, Math.min(b.y, floor + 4) + 1, b.z),   /* (near their floor: over the wall's top proves nothing) */ b && JSON.stringify({ x: +(b.x - w.x).toFixed(2), z: +(b.z - w.z).toFixed(2), y: b.y }));
    ok('…on their own floor, not the height the client sent (200)', b && Math.abs(b.y - floor) < 3, b && b.y.toFixed(2) + ' vs floor ' + floor.toFixed(2));
    ok('…tossed from their hands (it flies, as a gun does)', b?.fly?.ms > 0, b?.fly?.ms);
    ok('…with a quiet landing (fly.q: a dropped bomb made no sound in v51; sound is closed)', b?.fly?.q === 1, b?.fly && JSON.stringify(b.fly));
    { const g2 = { levels: {} }; let t2 = 6e9; startArena(g2, { map: 'dust2', kind: 'defuse', bots: 0 }, t2); const P2 = [{ name: 'Ann', pose: at(M.t[0]) }, { name: 'Cy', pose: at(M.ct[0]) }]; arenaTick(g2, P2, .05, t2 += 50);
      const c2 = P2.find(p => p.name.toLowerCase() === g2.combat.d.bomb.carrier), noPose = P2.map(p => p === c2 ? { name: p.name } : p); let err = '';
      try { arenaApply(g2, { type: 'drop', slot: 'bomb', x: c2.pose.x, z: c2.pose.z, y: 200 }, c2.name, noPose, t2 += 50); } catch (e) { err = e.message; }
      ok('…and with no host pose for the carrier the drop is refused (never the client\'s place and height)', /not in position/i.test(err) && g2.combat.d.bomb.carrier === c2.name.toLowerCase() && !(g2.combat.ground || []).some(x => x.item === 'c4'), err || 'dropped'); }
  }
  // ── A long gun dropped facing a wall lies clear of it: the model's own footprint as drawn (weapon-models groundRest at
  // the item's yaw — muzzle, butt, and the scope / magazine sideways), from several walls (every spawn of both sides) ──
  { const THREE = await import('../dist/three.module.js'), { weaponModel, groundRest } = await import('../dist/weapon-models.js'), bx = new THREE.Box3();
    const ct = P.find(p => teamOf(g, p.name) === 'ct') || P[1]; let clear = 0, bore = 0, tries = 0; const bad = []; seed = 7;   // (the start yaws are random: the same draws whatever ran before)
    for (const id of ['sniper', 'lmg', 'ak']) { const r = groundRest(id), m = weaponModel(id, 1); m.rotation.set(r.x, 0, r.z, 'YXZ'); m.updateMatrixWorld(true); bx.setFromObject(m, true);   // (the rested model at yaw 0: −z the muzzle)
      const pts = []; for (const lx of [bx.min.x, 0, bx.max.x]) for (const lz of [bx.min.z, 0, bx.max.z]) if (lx || lz) pts.push([lx, lz]);
      for (const sp of [...M.ct, ...M.t]) { const w2 = facingWall(M, at(sp), 2.2); if (!w2) continue;
        for (let k = 0; k < 2; k++) { ct.pose = { ...ct.pose, x: w2.x, z: w2.z, y: EYE + (M.nav ? M.nav.floorAt(w2.x - cx, w2.z - cz) || 0 : 0), yaw: w2.yaw }; (g.arena.loadout[ct.name.toLowerCase()] ??= { primary: null, secondary: 'usps', nades: [] }).primary = id;
          arenaApply(g, { type: 'drop', slot: 'primary' }, ct.name, P, t += 50); const it = g.combat.ground.filter(x => x.item === id).pop(); tries++;
          const h = it.y + .35, c = Math.cos(it.yaw), s = Math.sin(it.yaw), free = ([lx, lz]) => segmentClear(w2.boxes, it.x, h, it.z, it.x + lx * c + lz * s, h, it.z - lx * s + lz * c);   // (three's turn about y)
          if (free([0, bx.min.z]) && free([0, bx.max.z])) bore++; if (pts.every(free)) clear++; else bad.push(id);
          g.combat.ground = g.combat.ground.filter(x => x !== it); } } }
    ok('a long gun (AWP, Negev, AK) dropped facing a wall: its drawn barrel and stock never in the wall', tries >= 12 && bore === tries, bore + '/' + tries);
    ok('…and its whole drawn footprint (scope, magazine sideways) clear in ≥ 90 % of drops (only where no turn fits: the side the magazine lies on is the model\'s; 112–115 of 120 depending on the random start yaws)', clear >= tries * .9, clear + '/' + tries + (bad.length ? ' · ' + bad.join(',') : '')); }
}
// ── A T bot takes a dropped bomb only once it has landed, and only on its own floor (the bomb flies since DROP-4) ──
{ const M = ARENA_MAPS.dust2, g = { levels: {} }; let t = 7e9; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, t);
  const P = [{ name: 'Ann', pose: { x: cx + M.ct[0][0], y: EYE, z: cz + M.ct[0][1], yaw: 0 } }]; arenaApply(g, { type: 'team', team: 'ct' }, 'Ann', P, t);
  for (let i = 0; i < 3; i++) try { arenaApply(g, { type: 'add-bot' }, 'Ann', P, t); } catch {}
  for (let i = 0; i < 400 && g.combat.d?.round?.phase !== 'live'; i++) arenaTick(g, P, .05, t += 50);
  const d = g.combat.d, tb = g.arena.bots.find(b => teamOf(g, b.name) === 't'), has = () => !!d.bomb.carrier;   // (any T bot: none may take it early)
  if (!tb || d.round?.phase !== 'live') ok('a live Defuse round with a T bot', false, d?.round?.phase); else {
    const lay = (id, up, fly, ago = 0) => { const fy = Number.isFinite(tb.y) ? tb.y : 0; d.bomb.carrier = null; g.combat.ground = (g.combat.ground || []).filter(x => x.item !== 'c4'); g.combat.ground.push({ id, item: 'c4', x: tb.x + 1, z: tb.z, y: fy + up, yaw: 0, at: t - ago, by: 'ann', ...(fly ? { fly: { ms: fly } } : {}) }); };
    lay('ca', 30, 0); arenaTick(g, P, .05, t += 50); const above = !has();
    lay('cb', 0, 2500); arenaTick(g, P, .05, t += 50); const inAir = !has();
    lay('cc', 0, 2500, 2600); arenaTick(g, P, .05, t += 50); const landedOk = has();   // (the same toss, landed: at its feet)
    ok('a T bot does not take a bomb lying on the floor above it, nor one still in the air; it does once it has landed', above && inAir && landedOk, [above, inAir, landedOk].join(',')); } }
// ── Every model rests on the floor by its own bounds, at any yaw (DROP-2) ──
{ const THREE = await import('../dist/three.module.js'), { weaponModel, groundRest } = await import('../dist/weapon-models.js'), box = new THREE.Box3();
  const ids = [...WEAPONS.map(w => w.id), 'knife', 'karambit', ...GRENADES.map(g => g.id), 'c4']; let worst = 0, worstId = '';
  for (const id of ids) for (const yaw of [0, 1.1, 2.7, 4.4]) { const r = groundRest(id), m = weaponModel(id, 1); m.rotation.set(r.x, yaw, r.z, 'YXZ'); m.position.set(3, 7 + r.lift, -2); m.updateMatrixWorld(true); box.setFromObject(m, true);
    const e = Math.abs(box.min.y - 7); if (e > worst) { worst = e; worstId = id; } }
  ok('every gun, knife, grenade and the bomb rests on the floor (lowest point within 1 cm), at any yaw', worst < .06, worst.toFixed(4) + ' (' + worstId + ')');
  const g = groundRest('ak'), m = weaponModel('ak', 1); m.rotation.set(g.x, 0, g.z, 'YXZ'); m.updateMatrixWorld(true); box.setFromObject(m, true); const s = box.getSize(new THREE.Vector3());
  ok('a rifle lies on its side (its lowest extent up: the thin one)', s.y < s.x && s.y < s.z, s.toArray().map(v => v.toFixed(2)).join(' × '));
}
console.log(`${fail ? 'FAIL' : 'PASS'}: dropped weapons · ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
