// Global Defensive weapon rules (host): one confirmed head shot kills with every gun, armor on the body, finite ammo
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
for (const w of WEAPONS) { const r = hitDamage(w, 'head', 900, 1, { kevlar: 100, helmet: true }); ok(w.name + ': one head shot kills through a helmet at range', r.headKill && r.hp >= MAX_HP); }
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
  const dboxes = mapBoxes(ARENA_MAPS.dune, ARENA.cx, ARENA.cz), cr = dboxes.find(b => b.mat === 'crate' && b.maxX - b.minX <= 8 && b.y1 - b.y0 >= 11); assert(cr, 'a tall crate on Dune'); { const z = (cr.minZ + cr.maxZ) / 2, a2 = { x: cr.minX - 4, y: 7, z, yaw: 0 }, b2 = { x: cr.maxX + 4, y: 9.7, z, yaw: 0, crouched: false };
    const gw = { levels: {} }; startArena(gw, { map: 'yard', bots: 0 }, 1e10); gw.arena.map = 'dune'; /* deathmatch rules, Dune's crates */ arenaApply(gw, { type: 'loadout', primary: 'ak' }, 'Ann', [], 1e10);
    const rr = combatApply(gw, { type: 'hit', target: 'b', weapon: 'ak', zone: 'stomach', n: 5 }, 'Ann', [{ id: 'a', name: 'Ann', pose: { ...a2, y: 9.7 } }, { id: 'b', name: 'Bo', pose: b2 }], 'a', 1e10 + 10);
    ok('host: a wallbang through a crate does less than an open shot', rr.dmg > 0 && rr.dmg < Math.round(36 * 1.25), JSON.stringify(rr)); } }

// ── Defuse: purchases, team guns, new-round ammo ──
let td = 8e9; const d = { levels: {} }; startArena(d, { map: 'dune', kind: 'defuse', bots: 0 }, td); const M = ARENA_MAPS.dune, at = ([x, z]) => ({ x: ARENA.cx + x, y: 9.7, z: ARENA.cz + z, yaw: 0 });
const DP = [{ id: 't1', name: 'Tess', pose: at(M.t[0]) }, { id: 'c1', name: 'Cal', pose: at(M.ct[0]) }]; arenaTick(d, DP, .05, td += 50);
ok('starting pistols: Glock for T, USP-S for CT', arenaArsenalOf(d, 'Tess').includes('pistol') && arenaArsenalOf(d, 'Cal').includes('usps'));
assert.throws(() => arenaApply(d, { type: 'loadout', primary: 'm4' }, 'Tess', DP, td), /Counter-Terrorist weapon/); n++;
const money0 = d.combat.d.money.tess; assert.throws(() => arenaApply(d, { type: 'loadout', primary: 'ak', secondary: 'deagle' }, 'Tess', DP, td), /Not enough money/); n++;
ok('a refused purchase charges nothing and changes nothing', d.combat.d.money.tess === money0 && !loadoutOf(d, 'Tess').primary && loadoutOf(d, 'Tess').secondary === 'pistol');
d.combat.d.money.tess = 5000; d.combat.d.money.cal = 5000;
arenaApply(d, { type: 'loadout', primary: 'ak' }, 'Tess', DP, td); arenaApply(d, { type: 'buy-armor', kind: 'helmet' }, 'Tess', DP, td); arenaApply(d, { type: 'loadout', primary: 'm4s' }, 'Cal', DP, td);
ok('money paid once per item: AK 2700 + helmet 1000', d.combat.d.money.tess === 5000 - 2700 - 1000); ok('armor bought', armorOf(d, 'Tess').kevlar === 100 && armorOf(d, 'Tess').helmet);
// Live: Tess sprays, Cal dies; the round ends (CT eliminated): Tess won with a half-empty AK → refilled; Cal dead → USP-S only, full.
td += DEFUSE.freezeMs + 100; arenaTick(d, DP, .05, td); poseAmmo(d, 'Tess', { n: 0, r: 0 }, 'ak'); poseAmmo(d, 'Tess', { n: 17, r: 0 }, 'ak'); ok('Tess fired 17', ammoOf(d, 'Tess', 'ak')[0] === 13);
applyHit(d, 'Tess', 'Cal', weaponById('ak'), 'head', 20, 1, td); ok('Cal is down', isDown(d, 'Cal', td)); arenaTick(d, DP, .05, td += 50);
ok('Cal dropped his M4A1-S with its rounds', d.combat.ground.some(it => it.item === 'm4s' && it.ammo?.[0] === 20));
for (let i = 0; i < (DEFUSE.overMs + 500) / 50; i++) arenaTick(d, DP, .05, td += 50);
ok('new round', d.combat.d.n === 2 && d.combat.d.round.phase === 'freeze');
ok('winner keeps the AK, refilled to 30 / 90', loadoutOf(d, 'Tess').primary === 'ak' && JSON.stringify(ammoOf(d, 'Tess', 'ak')) === '[30,90]', JSON.stringify(ammoOf(d, 'Tess', 'ak')));
ok('the dead start again: USP-S full, no rifle, no armor', !loadoutOf(d, 'Cal').primary && loadoutOf(d, 'Cal').secondary === 'usps' && JSON.stringify(ammoOf(d, 'Cal', 'usps')) === '[12,24]' && armorOf(d, 'Cal').kevlar === 0);
ok('nobody is down at the new round', !isDown(d, 'Cal', td) && hpOf(d, 'Cal') === MAX_HP);
// Team-mate head shot: friendly fire, not an instant kill.
{ const f = { levels: {} }; startArena(f, { map: 'dune', kind: 'defuse', bots: 0 }, 9e9); const FP = [{ name: 'T1', pose: at(M.t[0]) }, { name: 'C1', pose: at(M.ct[0]) }, { name: 'T2', pose: at(M.t[1]) }]; arenaTick(f, FP, .05, 9e9 + 50);
  const team = f.combat.d.teams; const [x, y] = Object.keys(team).filter(k => team[k] === team.t1); if (y) { applyHit(f, x, y, weaponById('ak'), 'head', 10, 1, 9e9 + DEFUSE.freezeMs + 200); ok('a team mate’s head shot does not kill', !isDown(f, y, 9e9 + DEFUSE.freezeMs + 300)); } }

// ── Aim: first shot exact, spray learnable ──
for (const w of WEAPONS) { const [p, y] = sprayAt(w, 0); ok(w.name + ': first bullet exactly at the crosshair', p === 0 && y === 0); ok(w.name + ': standing still is exact', moveInaccuracy(w, { speed: 0, max: 100, onGround: true, landedAgo: 9, scoped: !!w.zoom }) === 0 || !!w.unscoped); }
ok('the AK climbs, then pulls sideways', sprayAt(weaponById('ak'), 9)[0] > 4 && Math.abs(sprayAt(weaponById('ak'), 15)[1]) > 1.5);
ok('patterns differ between guns', JSON.stringify(weaponById('ak').pattern) !== JSON.stringify(weaponById('m4').pattern) && JSON.stringify(weaponById('m4').pattern) !== JSON.stringify(weaponById('famas').pattern));
ok('running and jumping cost accuracy', moveInaccuracy(weaponById('ak'), { speed: 200, max: 200, onGround: true, landedAgo: 9 }) > .03 && moveInaccuracy(weaponById('ak'), { speed: 0, max: 200, onGround: false, landedAgo: 9 }) > .15);
ok('counter-strafed (slow) is exact again', moveInaccuracy(weaponById('ak'), { speed: 60, max: 200, onGround: true, landedAgo: 9 }) === 0);
ok('landing costs accuracy for a moment', moveInaccuracy(weaponById('ak'), { speed: 0, max: 200, onGround: true, landedAgo: .05 }) > 0 && moveInaccuracy(weaponById('ak'), { speed: 0, max: 200, onGround: true, landedAgo: .5 }) === 0);
ok('an unscoped AWP is inaccurate, scoped exact', moveInaccuracy(weaponById('sniper'), { speed: 0, max: 100, onGround: true, landedAgo: 9, scoped: false }) > .05 && moveInaccuracy(weaponById('sniper'), { speed: 0, max: 100, onGround: true, landedAgo: 9, scoped: true }) === 0);
ok('shotgun pellets: a fixed pattern with one in the centre', JSON.stringify(pelletPattern(weaponById('shotgun'))) === JSON.stringify(pelletPattern(weaponById('shotgun'))) && pelletPattern(weaponById('shotgun'))[0][0] === 0 && pelletPattern(weaponById('shotgun')).length === 9);
console.log('PASS: Global Defensive weapons · ' + n + ' checks (head shots kill through armor with all ' + WEAPONS.length + ' guns, armor, finite ammo + reloads, buy drops the old gun with its rounds, pickups keep rounds, no pickup through walls or twice, no hits through walls, new-round refill after a win and a death, team guns, all-or-nothing purchases, first-shot accuracy, spray patterns)');
