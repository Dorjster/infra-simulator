// Global Defensive weapon rules (host): CS2's head shots (4×; the helmet takes its share), armor on the body, finite ammo
// (shots, reloads, an empty magazine can't hit), buying a second gun drops the first with its rounds, pickups keep
// the rounds and can't go through walls or happen twice, new-round refills after a win and after a death, team guns,
// purchases never charge without delivering, first-shot accuracy.
import assert from 'node:assert/strict';
import { startArena, arenaApply, arenaTick, loadoutOf } from '../dist/arena-logic.js';
import { combatApply, ammoOf, takeShots, takeReload, poseAmmo, applyHit, hpOf, isDown, arenaArsenalOf, armorOf } from '../dist/combat-logic.js';
import { DEFUSE, newRound } from '../dist/arena-defuse.js';
import { WEAPONS, weaponById, hitDamage, isFirearm, fullAmmo, sprayAt, moveInaccuracy, pelletPattern, MAX_HP } from '../dist/weapons-data.js';
import { ARENA_MAPS, mapBoxes, segmentClear } from '../dist/arena-maps.js';
import { ARENA } from '../dist/facility-layout.js';
let seed = 77; Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let n = 0; const ok = (name, cond, detail = '') => { n++; assert(cond, name + (detail ? ' · ' + detail : '')); };

// ── Damage: head shots and armor ──
// CS2: one head shot through a helmet kills with these (close up), not with these; without a helmet the pistols kill too.
{ const H = (id, armor) => hitDamage(weaponById(id), 'head', 5, 1, armor).hp, helm = () => ({ kevlar: 100, helmet: true });
  for (const id of ['ak', 'deagle', 'sniper', 'ssg08', 'm4s']) ok(weaponById(id).name + ': one head shot kills through a helmet (CS2)', H(id, helm()) >= MAX_HP, H(id, helm()));
  for (const id of ['pistol', 'usps', 'm4', 'mp9', 'famas', 'galil', 'p250']) ok(weaponById(id).name + ': a head shot through a helmet does not kill (CS2)', H(id, helm()) < MAX_HP, H(id, helm()));
  for (const id of ['pistol', 'usps', 'p250', 'm4']) ok(weaponById(id).name + ': one head shot kills without a helmet (CS2)', H(id, { kevlar: 100, helmet: false }) >= MAX_HP, H(id, { kevlar: 100, helmet: false }));
  ok('no gun\'s head shot is an automatic kill (damage decides)', WEAPONS.every(w => !hitDamage(w, 'head', 5, 1, helm()).headKill)); }
for (const w of WEAPONS) ok(w.name + ': finite magazine and reserve', w.mag > 0 && w.reserve > 0 && Array.isArray(w.pattern) && w.pattern.length >= 1 && w.pattern[0][0] === 0 && w.pattern[0][1] === 0);
{ const ak = weaponById('ak'), bare = hitDamage(ak, 'chest', 0), armored = hitDamage(ak, 'chest', 0, 1, { kevlar: 100, helmet: false }), legs = hitDamage(ak, 'legs', 0, 1, { kevlar: 100 });
  ok('AK chest, no armor: 36', bare.hp === 36); ok('armor takes part of a body hit', armored.hp === Math.round(36 * .775) && armored.armor === Math.round((36 - armored.hp) * .5), JSON.stringify(armored));
  ok('legs are never armored', legs.hp === hitDamage(ak, 'legs', 0).hp && legs.armor === 0);
  const thin = hitDamage(ak, 'chest', 0, 1, { kevlar: 2 }); ok('worn-out armor lets the rest through', thin.armor === 2 && thin.hp === 36 - 4);
  const knife = hitDamage(weaponById('knife'), 'head', 0, 1, null, 40); ok('a knife to the head is not an automatic kill', !knife.headKill && knife.hp === 40); }

// ── A deathmatch room: buying, ammo, drops, pickups ──
const map = ARENA_MAPS.yard, boxes = mapBoxes(map, ARENA.cx, ARENA.cz);
let t = 3e9; const g = { levels: {} }; startArena(g, { map: 'yard', bots: 0 }, t);
// Two players in the open, 30 units apart with a clear line between them.
const spot = (() => { for (let x = -120; x < 120; x += 4) for (let z = -120; z < 120; z += 4) { const a = { x: ARENA.cx + x, z: ARENA.cz + z }, b = { x: a.x + 30, z: a.z }; if ([a, b].every(p => !boxes.some(q => p.x > q.minX - 3 && p.x < q.maxX + 3 && p.z > q.minZ - 3 && p.z < q.maxZ + 3)) && segmentClear(boxes, a.x, 9.7, a.z, b.x, 7, b.z)) return a; } })();
const P = [{ id: 'a', name: 'Ann', pose: { x: spot.x, y: 9.7, z: spot.z, yaw: -Math.PI / 2 } }, { id: 'b', name: 'Bo', pose: { x: spot.x + 30, y: 9.7, z: spot.z, yaw: Math.PI / 2 } }];
arenaApply(g, { type: 'loadout', primary: 'ak' }, 'Ann', P, t);
ok('a bought AK starts full: 30 / 90', JSON.stringify(ammoOf(g, 'Ann', 'ak')) === '[30,90]');
takeShots(g, 'Ann', 100, 'ak'); takeShots(g, 'Ann', 105, 'ak'); ok('five shots take five rounds', JSON.stringify(ammoOf(g, 'Ann', 'ak')) === '[25,90]', JSON.stringify(ammoOf(g, 'Ann', 'ak')));
takeReload(g, 'Ann', 7, 'ak'); takeReload(g, 'Ann', 8, 'ak'); ok('a reload moves rounds from the reserve, never creates them', JSON.stringify(ammoOf(g, 'Ann', 'ak')) === '[30,85]');
takeReload(g, 'Ann', 9, 'ak'); ok('reloading a full magazine changes nothing', JSON.stringify(ammoOf(g, 'Ann', 'ak')) === '[30,85]');
takeReload(g, 'Ann', 9, 'ak'); ok('the same reload number twice counts once', JSON.stringify(ammoOf(g, 'Ann', 'ak')) === '[30,85]');
// A hit numbers its shot: it takes the round itself if it arrives before the pose.
let r = combatApply(g, { type: 'hit', target: 'b', weapon: 'ak', zone: 'chest', n: 106 }, 'Ann', P, 'a', t + 1000); ok('hit with shot 106 lands', r.dmg === 36 || r.dmg > 30, JSON.stringify(r));
ok('…and took its round', ammoOf(g, 'Ann', 'ak')[0] === 29); poseAmmo(g, 'Ann', { n: 106, r: 9 }, 'ak'); ok('the pose with the same shot number takes nothing more', ammoOf(g, 'Ann', 'ak')[0] === 29);
poseAmmo(g, 'Ann', { n: 140, r: 9 }, 'ak'); ok('an empty magazine stays at 0 (never negative)', ammoOf(g, 'Ann', 'ak')[0] === 0, JSON.stringify(ammoOf(g, 'Ann', 'ak')));
assert.throws(() => combatApply(g, { type: 'hit', target: 'b', weapon: 'ak', zone: 'chest', n: 138 }, 'Ann', P, 'a', t + 3000), /Out of ammo/); n++;
// Buying another rifle: the AK drops with its rounds where Ann stands; she holds the new one, full.
takeReload(g, 'Ann', 10, 'ak'); const before = ammoOf(g, 'Ann', 'ak');
let msg = arenaApply(g, { type: 'loadout', primary: 'm4' }, 'Ann', P, t + 4000); ok('buying a second rifle drops the first', /dropped your AK-47/.test(msg), msg);
const dropped = g.combat.ground.find(it => it.item === 'ak'); ok('the dropped AK lies at her feet with its rounds', dropped && JSON.stringify(dropped.ammo) === JSON.stringify(before) && Math.hypot(dropped.x - P[0].pose.x, dropped.z - P[0].pose.z) < 1, JSON.stringify(dropped));
ok('one primary only: the M4A4, full', loadoutOf(g, 'Ann').primary === 'm4' && JSON.stringify(ammoOf(g, 'Ann', 'm4')) === '[30,90]' && arenaArsenalOf(g, 'Ann').filter(id => weaponById(id)?.kind === 'rifle').length === 1);
arenaApply(g, { type: 'loadout', secondary: 'deagle' }, 'Ann', P, t + 4100); msg = arenaApply(g, { type: 'loadout', secondary: 'p250' }, 'Ann', P, t + 4200);
ok('buying a second pistol drops the first', /dropped your Desert Eagle/.test(msg) && g.combat.ground.some(it => it.item === 'deagle') && loadoutOf(g, 'Ann').secondary === 'p250');
ok('the first pistol (Glock) dropped too, not deleted', g.combat.ground.some(it => it.item === 'pistol'));
// Bo picks the AK up: same rounds; a second claim finds it gone.
P[1].pose.x = dropped.x + 2; P[1].pose.z = dropped.z;
msg = arenaApply(g, { type: 'pickup', id: dropped.id }, 'Bo', P, t + 5000); ok('pickup keeps the rounds', JSON.stringify(ammoOf(g, 'Bo', 'ak')) === JSON.stringify(before) && /AK-47/.test(msg), msg);
assert.throws(() => arenaApply(g, { type: 'pickup', id: dropped.id }, 'Ann', P, t + 5001), /Already taken/); n++;
// E with a full slot: Bo's AK drops where he stands, he takes the Deagle… (pistol slot) — and the AK swap back.
const dg = g.combat.ground.find(it => it.item === 'deagle'); P[1].pose.x = dg.x; P[1].pose.z = dg.z;
assert.throws(() => arenaApply(g, { type: 'pickup', id: dg.id }, 'Bo', P, t + 5100), /E to swap/); n++;
msg = arenaApply(g, { type: 'pickup', id: dg.id, swap: true }, 'Bo', P, t + 5200); ok('E swaps: the Glock drops, the Deagle is in hand', loadoutOf(g, 'Bo').secondary === 'deagle' && g.combat.ground.filter(it => it.item === 'pistol').length === 2, msg);
// Through a wall: an item on the far side of a wall can't be taken.
{ const wall = boxes.find(b => b.y1 - b.y0 >= 20 && b.maxX - b.minX < 4 && b.maxZ - b.minZ > 12) || boxes.find(b => b.y1 - b.y0 >= 20 && b.maxZ - b.minZ < 4 && b.maxX - b.minX > 12);
  const thinX = wall.maxX - wall.minX < 4, mid = { x: (wall.minX + wall.maxX) / 2, z: (wall.minZ + wall.maxZ) / 2 };
  const item = { id: 'gw', item: 'sniper', x: thinX ? wall.maxX + 2 : mid.x, z: thinX ? mid.z : wall.maxZ + 2, y: 0, yaw: 0, at: t, ammo: [5, 30] }; g.combat.ground.push(item);
  const pose = { x: thinX ? wall.minX - 2 : mid.x, y: 9.7, z: thinX ? mid.z : wall.minZ - 2 };
  assert.throws(() => arenaApply(g, { type: 'pickup', id: 'gw' }, 'Ann', [{ name: 'Ann', pose }, P[1]], t + 5300), /Behind a wall/); n++; }
// Hits through a wall are refused by the host.
{ const wall = boxes.find(b => b.y1 - b.y0 >= 12 && b.y0 === 0 && b.maxX - b.minX > 10 && b.maxZ - b.minZ > 10); const a = { x: wall.minX - 3, y: 9.7, z: (wall.minZ + wall.maxZ) / 2, yaw: 0 }, b = { x: wall.maxX + 3, y: 9.7, z: a.z, yaw: 0 };
  assert.throws(() => combatApply(g, { type: 'hit', target: 'b', weapon: 'm4', zone: 'chest', n: 1 }, 'Ann', [{ id: 'a', name: 'Ann', pose: a }, { id: 'b', name: 'Bo', pose: b }], 'a', t + 9000), /wall/); n++; }

// ── Wallbangs: through crates and thin walls, not through containers or stone; less damage ──
{ const { bulletPath } = await import('../dist/arena-maps.js');
  const crate = [{ minX: 10, maxX: 16, minZ: -3, maxZ: 3, y0: 0, y1: 12, mat: 'crate' }], thin = [{ minX: 10, maxX: 12, minZ: -20, maxZ: 20, y0: 0, y1: 24, mat: 'plaster' }], box = [{ minX: 10, maxX: 25, minZ: -20, maxZ: 20, y0: 0, y1: 15, mat: 'metal-red' }], stone = [{ minX: 10, maxX: 11, minZ: -20, maxZ: 20, y0: 0, y1: 24, mat: 'stone' }];
  const thr = (bx, w) => bulletPath(bx, 0, 8, 0, 1, 0, 0, 40, weaponById(w).pen).factor(30);
  ok('an AK goes through a crate, weaker', thr(crate, 'ak') > .2 && thr(crate, 'ak') < 1, thr(crate, 'ak')); ok('the AWP through a crate keeps more', thr(crate, 'sniper') > thr(crate, 'ak'));
  ok('a Glock does not go through a crate', thr(crate, 'pistol') === 0); ok('a Glock goes through a thin plaster wall', thr(thin, 'pistol') > 0);
  ok('nothing goes through a shipping container', thr(box, 'sniper') === 0); ok('nothing goes through stone', thr(stone, 'sniper') === 0); ok('shotgun pellets stop in a crate', thr(crate, 'shotgun') === 0);
  // Host: a hit through a crate lands with less damage; through a container it is refused.
  // A crate on Dust II that hides a standing body: shooter and target on the floor either side of it (true-scale map: real floor heights).
  const D2 = ARENA_MAPS.dust2, dboxes = mapBoxes(D2, ARENA.cx, ARENA.cz), fl = (x, z) => D2.nav.floorAt(x - ARENA.cx, z - ARENA.cz);
  const cr = dboxes.find(b => { if (b.mat !== 'crate' || b.maxX - b.minX > 8 || b.maxZ - b.minZ > 8) return false; const z = (b.minZ + b.maxZ) / 2, fa = fl(b.minX - 4, z), fb = fl(b.maxX + 4, z); return Number.isFinite(fa) && Math.abs(fa - fb) < .5 && b.y1 - fa >= 10.8; });   // (taller than a standing body at its true size: the head too)
  assert(cr, 'a tall crate on Dust II'); { const z = (cr.minZ + cr.maxZ) / 2, f0 = fl(cr.minX - 4, z), a2 = { x: cr.minX - 4, y: f0 + 7, z, yaw: 0 }, b2 = { x: cr.maxX + 4, y: f0 + 9.7, z, yaw: 0, crouched: false };
    const gw = { levels: {} }; startArena(gw, { map: 'yard', bots: 0 }, 1e10); gw.arena.map = 'dust2'; /* deathmatch rules, Dust II's crates */ arenaApply(gw, { type: 'loadout', primary: 'ak' }, 'Ann', [], 1e10);
    const rr = combatApply(gw, { type: 'hit', target: 'b', weapon: 'ak', zone: 'stomach', n: 5 }, 'Ann', [{ id: 'a', name: 'Ann', pose: { ...a2, y: f0 + 9.7 } }, { id: 'b', name: 'Bo', pose: b2 }], 'a', 1e10 + 10);
    ok('host: a wallbang through a crate does less than an open shot', rr.dmg > 0 && rr.dmg < Math.round(36 * 1.25), JSON.stringify(rr)); } }

// ── Kill feed marks (CS2): no-scope / airborne / blind from the shooter, wallbang and distance from the host ──
{ const gk = { levels: {} }, T = 6e10; startArena(gk, { map: 'yard', bots: 0 }, T); arenaApply(gk, { type: 'loadout', primary: 'sniper' }, 'Ann', P, T); arenaApply(gk, { type: 'loadout', primary: 'ak' }, 'Bo', P, T);
  combatApply(gk, { type: 'hit', target: 'b', weapon: 'sniper', zone: 'head', head: true, n: 1, noscope: true, air: true }, 'Ann', P, 'a', T + 10);
  const f = gk.combat.feed[0]; ok('feed: the AWP head shot kill is marked no-scope + airborne, head shot, with its distance', f && f.wid === 'sniper' && f.head && f.how?.noscope && f.how?.air && !f.how?.wallbang && !f.how?.smoke && f.how?.far === Math.round(Math.hypot(P[0].pose.x - P[1].pose.x, P[0].pose.y - P[1].pose.y, P[0].pose.z - P[1].pose.z) * .165), JSON.stringify(f));
  for (let i = 0; i < 300; i++) arenaTick(gk, P, .05, T + 20 + i * 50);
  combatApply(gk, { type: 'hit', target: 'a', weapon: 'ak', zone: 'head', head: true, n: 1, noscope: true }, 'Bo', P, 'b', T + 20000);
  const f2 = gk.combat.feed[0]; ok('feed: a no-scope mark only for scoped guns', f2 && f2.wid === 'ak' && !f2.how?.noscope, JSON.stringify(f2)); }

// ── Defuse: purchases, team guns, new-round ammo ──
let td = 8e9; const d = { levels: {} }; startArena(d, { map: 'dust2', kind: 'defuse', bots: 0 }, td); const M = ARENA_MAPS.dust2, at = ([x, z]) => ({ x: ARENA.cx + x, y: 9.7 + (M.nav ? M.nav.floorAt(x, z) || 0 : 0), z: ARENA.cz + z, yaw: 0 });
const DP = [{ id: 't1', name: 'Tess', pose: at(M.t[0]) }, { id: 'c1', name: 'Cal', pose: at(M.ct[0]) }]; arenaTick(d, DP, .05, td += 50);
ok('starting pistols: Glock for T, USP-S for CT', arenaArsenalOf(d, 'Tess').includes('pistol') && arenaArsenalOf(d, 'Cal').includes('usps'));
assert.throws(() => arenaApply(d, { type: 'loadout', primary: 'm4' }, 'Tess', DP, td), /Counter-Terrorist weapon/); n++;
const money0 = d.combat.d.money.tess; assert.throws(() => arenaApply(d, { type: 'loadout', primary: 'ak', secondary: 'deagle' }, 'Tess', DP, td), /Not enough money/); n++;
ok('a refused purchase charges nothing and changes nothing', d.combat.d.money.tess === money0 && !loadoutOf(d, 'Tess').primary && loadoutOf(d, 'Tess').secondary === 'pistol');
d.combat.d.money.tess = 5000; d.combat.d.money.cal = 5000;
arenaApply(d, { type: 'loadout', primary: 'ak' }, 'Tess', DP, td); arenaApply(d, { type: 'buy-armor', kind: 'helmet' }, 'Tess', DP, td); arenaApply(d, { type: 'loadout', primary: 'm4s' }, 'Cal', DP, td); arenaApply(d, { type: 'buy-armor', kind: 'vest' }, 'Cal', DP, td); arenaApply(d, { type: 'buy-nade', kind: 'flash' }, 'Cal', DP, td);
ok('money paid once per item: AK 2700 + helmet 1000', d.combat.d.money.tess === 5000 - 2700 - 1000); ok('armor bought', armorOf(d, 'Tess').kevlar === 100 && armorOf(d, 'Tess').helmet);
// Undo a purchase (buy time, in spawn, unused): full price back; a gun brings back the one it replaced.
{ const m0 = d.combat.d.money.tess; arenaApply(d, { type: 'loadout', secondary: 'deagle' }, 'Tess', DP, td);
  ok('buying a Deagle drops the Glock', loadoutOf(d, 'Tess').secondary === 'deagle' && d.combat.ground.some(it => it.item === 'pistol') && d.combat.d.money.tess === m0 - 700);
  arenaApply(d, { type: 'refund', item: 'deagle' }, 'Tess', DP, td);
  ok('refund: $700 back, the Glock back in hand (off the ground), Deagle gone', d.combat.d.money.tess === m0 && loadoutOf(d, 'Tess').secondary === 'pistol' && !d.combat.ground.some(it => it.item === 'pistol' || it.item === 'deagle'), JSON.stringify(loadoutOf(d, 'Tess')));
  arenaApply(d, { type: 'buy-nade', kind: 'smoke' }, 'Tess', DP, td); const m1 = d.combat.d.money.tess; arenaApply(d, { type: 'refund' }, 'Tess', DP, td);
  ok('refund with no item undoes the last purchase (the smoke)', d.combat.d.money.tess === m1 + 300 && !loadoutOf(d, 'Tess').nades.includes('smoke'));
  arenaApply(d, { type: 'refund', item: 'helmet' }, 'Tess', DP, td); ok('armor refund: $1000 back, no armor', d.combat.d.money.tess === m1 + 1300 && armorOf(d, 'Tess').kevlar === 0);
  arenaApply(d, { type: 'buy-armor', kind: 'helmet' }, 'Tess', DP, td);
  assert.throws(() => arenaApply(d, { type: 'refund', item: 'm4s' }, 'Tess', DP, td), /Nothing to refund/); n++;
  poseAmmo(d, 'Tess', { n: 0, r: 0 }, 'ak'); poseAmmo(d, 'Tess', { n: 1, r: 0 }, 'ak'); assert.throws(() => arenaApply(d, { type: 'refund', item: 'ak' }, 'Tess', DP, td), /Already used/); n++;
  ok('a fired gun is not refunded (money unchanged)', loadoutOf(d, 'Tess').primary === 'ak'); d.combat.d.money.tess = 5000 - 2700 - 1000; d.combat.ammo.tess.ak = [30, 90]; delete d.combat.shots.tess; }
// Live: Tess sprays, Cal dies; the round ends (CT eliminated): Tess won with a half-empty AK → refilled; Cal dead → USP-S only, full.
td += DEFUSE.freezeMs + 100; arenaTick(d, DP, .05, td); poseAmmo(d, 'Tess', { n: 0, r: 0 }, 'ak'); poseAmmo(d, 'Tess', { n: 17, r: 0 }, 'ak'); ok('Tess fired 17', ammoOf(d, 'Tess', 'ak')[0] === 13);
applyHit(d, 'Tess', 'Cal', weaponById('ak'), 'head', 20, 1, td); ok('Cal is down', isDown(d, 'Cal', td)); arenaTick(d, DP, .05, td += 50);
ok('Cal dropped his M4A1-S with its rounds', d.combat.ground.some(it => it.item === 'm4s' && it.ammo?.[0] === 20));
ok('dead at once: nothing old left (no rifle, grenades, armor; starting pistol only)', !loadoutOf(d, 'Cal').primary && loadoutOf(d, 'Cal').secondary === 'usps' && !loadoutOf(d, 'Cal').nades.length && !armorOf(d, 'Cal').kevlar, JSON.stringify(loadoutOf(d, 'Cal')));
for (let i = 0; i < (DEFUSE.overMs + 500) / 50; i++) arenaTick(d, DP, .05, td += 50);
ok('new round', d.combat.d.n === 2 && d.combat.d.round.phase === 'freeze');
ok('winner keeps the AK, refilled to 30 / 90', loadoutOf(d, 'Tess').primary === 'ak' && JSON.stringify(ammoOf(d, 'Tess', 'ak')) === '[30,90]', JSON.stringify(ammoOf(d, 'Tess', 'ak')));
ok('the dead start again: USP-S full, no rifle, no armor', !loadoutOf(d, 'Cal').primary && loadoutOf(d, 'Cal').secondary === 'usps' && JSON.stringify(ammoOf(d, 'Cal', 'usps')) === '[12,24]' && armorOf(d, 'Cal').kevlar === 0);
ok('nobody is down at the new round', !isDown(d, 'Cal', td) && hpOf(d, 'Cal') === MAX_HP);
// Team-mate head shot: friendly fire, not an instant kill.
{ const f = { levels: {} }; startArena(f, { map: 'dust2', kind: 'defuse', bots: 0 }, 9e9); const FP = [{ name: 'T1', pose: at(M.t[0]) }, { name: 'C1', pose: at(M.ct[0]) }, { name: 'T2', pose: at(M.t[1]) }]; arenaTick(f, FP, .05, 9e9 + 50);
  const team = f.combat.d.teams; const [x, y] = Object.keys(team).filter(k => team[k] === team.t1); if (y) { applyHit(f, x, y, weaponById('ak'), 'head', 10, 1, 9e9 + DEFUSE.freezeMs + 200); ok('a team mate’s head shot does not kill', !isDown(f, y, 9e9 + DEFUSE.freezeMs + 300)); } }

// ── Walk-over pickups: an empty slot fills itself, an occupied one never; one claim; your own drop waits ──
{ const g = { levels: {} }, T0 = 7e10; startArena(g, { map: 'yard', bots: 0 }, T0); const P = n => ({ name: n, pose: { x: ARENA.cx + 40, y: 9.7, z: ARENA.cz + 40, yaw: 0 } });
  const ann = P('Ann'), bo = P('Bo'); arenaTick(g, [ann, bo], .05, T0 + 10); loadoutOf(g, 'Ann').primary = null; loadoutOf(g, 'Bo').primary = 'm4';
  g.combat.ground = [{ id: 'gx', item: 'ak', x: ann.pose.x + 1, z: ann.pose.z, y: 0, at: T0 - 5000, by: 'Cal', ammo: [17, 40] }]; arenaTick(g, [ann, bo], .05, T0 + 60);
  ok('walking over a rifle with the primary slot empty picks it up, with its rounds', loadoutOf(g, 'Ann').primary === 'ak' && JSON.stringify(ammoOf(g, 'Ann', 'ak')) === '[17,40]' && !g.combat.ground.length, JSON.stringify(loadoutOf(g, 'Ann')));
  ok('…only one player gets it (Bo, standing there too, keeps his M4)', loadoutOf(g, 'Bo').primary === 'm4');
  g.combat.ground = [{ id: 'gy', item: 'famas', x: ann.pose.x, z: ann.pose.z, y: 0, at: T0 - 5000, by: 'Cal', ammo: [25, 90] }]; arenaTick(g, [ann, bo], .05, T0 + 110);
  ok('an occupied slot is never replaced by walking over a gun', loadoutOf(g, 'Ann').primary === 'ak' && loadoutOf(g, 'Bo').primary === 'm4' && g.combat.ground.length === 1);
  g.combat.ground = [{ id: 'gz', item: 'p250', x: ann.pose.x, z: ann.pose.z, y: 0, at: T0 + 100, by: 'Ann', ammo: [13, 26] }]; loadoutOf(g, 'Ann').secondary = null; arenaTick(g, [ann], .05, T0 + 600);
  ok('your own drop is not picked straight back up', loadoutOf(g, 'Ann').secondary === null); arenaTick(g, [ann], .05, T0 + 1700); ok('…a moment later it is (empty pistol slot)', loadoutOf(g, 'Ann').secondary === 'p250'); }

// ── Aim: first shot exact, spray learnable ──
for (const w of WEAPONS) { const [p, y] = sprayAt(w, 0); ok(w.name + ': first bullet exactly at the crosshair', p === 0 && y === 0); ok(w.name + ': standing still is exact', moveInaccuracy(w, { speed: 0, max: 100, onGround: true, landedAgo: 9, scoped: !!w.zoom }) === 0 || !!w.unscoped); }
ok('the AK climbs, then pulls sideways', sprayAt(weaponById('ak'), 9)[0] > 4 && Math.abs(sprayAt(weaponById('ak'), 15)[1]) > 1.5);
{ const autos = WEAPONS.filter(w => w.mode === 'auto' && !w.pellets), shape = w => Array.from({ length: 12 }, (_, i) => sprayAt(w, Math.round(i * (w.mag - 1) / 11))), diff = (a, b) => { const A = shape(a), B = shape(b); return Math.max(...A.map((p, i) => Math.hypot(p[0] - B[i][0], p[1] - B[i][1]))); };
  let worst = 9, pair = ''; for (let i = 0; i < autos.length; i++) for (let j = i + 1; j < autos.length; j++) { const d = diff(autos[i], autos[j]); if (d < worst) { worst = d; pair = autos[i].name + ' / ' + autos[j].name; } }
  ok('every automatic gun has its own spray (no two within 0.8° all the way)', worst > .8, pair + ' ' + worst.toFixed(2)); }
ok('patterns differ between guns', JSON.stringify(weaponById('ak').pattern) !== JSON.stringify(weaponById('m4').pattern) && JSON.stringify(weaponById('m4').pattern) !== JSON.stringify(weaponById('famas').pattern));
ok('running and jumping cost accuracy', moveInaccuracy(weaponById('ak'), { speed: 200, max: 200, onGround: true, landedAgo: 9 }) > .03 && moveInaccuracy(weaponById('ak'), { speed: 0, max: 200, onGround: false, landedAgo: 9 }) > .15);
ok('counter-strafed (slow) is exact again', moveInaccuracy(weaponById('ak'), { speed: 60, max: 200, onGround: true, landedAgo: 9 }) === 0);
ok('landing costs accuracy for a moment', moveInaccuracy(weaponById('ak'), { speed: 0, max: 200, onGround: true, landedAgo: .05 }) > 0 && moveInaccuracy(weaponById('ak'), { speed: 0, max: 200, onGround: true, landedAgo: .5 }) === 0);
ok('an unscoped AWP is inaccurate, scoped exact', moveInaccuracy(weaponById('sniper'), { speed: 0, max: 100, onGround: true, landedAgo: 9, scoped: false }) > .05 && moveInaccuracy(weaponById('sniper'), { speed: 0, max: 100, onGround: true, landedAgo: 9, scoped: true }) === 0);
ok('shotgun pellets: a fixed pattern with one in the centre', JSON.stringify(pelletPattern(weaponById('shotgun'))) === JSON.stringify(pelletPattern(weaponById('shotgun'))) && pelletPattern(weaponById('shotgun'))[0][0] === 0 && pelletPattern(weaponById('shotgun')).length === 9);
console.log('PASS: Global Defensive weapons · ' + n + ' checks (CS2 head shots: a helmet stops some guns from one-tapping, armor, finite ammo + reloads, buy drops the old gun with its rounds, pickups keep rounds, no pickup through walls or twice, no hits through walls, new-round refill after a win and a death, team guns, all-or-nothing purchases, first-shot accuracy, spray patterns)');
