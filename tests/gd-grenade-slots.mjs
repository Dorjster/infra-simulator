// Global Defensive grenade slots and grenade items, as CS2: HE 6 · flashbang 7 · smoke 8 · decoy 9 · molotov (T) /
// incendiary (CT) 10, on keys 6 7 8 9 0; key 4 cycles the kinds you carry in that order (two flashbangs are one stop);
// a slot key picks exactly its own grenade or nothing (never another kind). Buying: CS2's prices (weapons.vdata
// m_nPrice), four grenades in all, two flashbangs, one of each other kind, one fire grenade (molotov and incendiary
// share AMMO_TYPE_MOLOTOV), each side its own fire grenade in Defuse; picking one up obeys the same limits; the LAN
// host streams how many of each you carry (two flashbangs arrive as two).
import assert from 'node:assert/strict'; import os from 'node:os'; import path from 'node:path'; import { mkdtempSync } from 'node:fs';
const store = {}; globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
globalThis.dispatchEvent ??= () => {}; globalThis.Event ??= class { constructor(t) { this.type = t; } };
const { GRENADES, NADE_ORDER, NADE_SLOT, weaponById, nadeInSlot, nextNade, nadeCounts, nadeRefusal } = await import('../dist/weapons-data.js');
const { legacyKey } = await import('../dist/input.js');
const { startArena, arenaApply, arenaTick, slotOf } = await import('../dist/arena-logic.js');
const { arenaArsenalOf } = await import('../dist/combat-logic.js');
const { PRICE } = await import('../dist/arena-defuse.js');
const { ARENA_MAPS } = await import('../dist/arena-maps.js'), { ARENA } = await import('../dist/facility-layout.js');
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d !== '' ? ' · ' + d : '')); };
const nadesOf = (g, who) => arenaArsenalOf(g, who).filter(id => slotOf(id) === 'nades');

// The grenades, their slots, prices (CS2 weapons.vdata m_nPrice) and sides (items_game used_by_classes).
ok('six grenades, in slot order', NADE_ORDER.join() === 'he,flash,smoke,decoy,molotov,incendiary', NADE_ORDER.join());
ok('slots 6 7 8 9 10 10', NADE_ORDER.map(id => NADE_SLOT[id]).join() === '6,7,8,9,10,10');
ok('CS2 prices: HE 300, flash 200, smoke 300, decoy 50, molotov 400, incendiary 500', GRENADES.map(g => g.price).join() === '300,200,300,50,400,500' && NADE_ORDER.every(id => PRICE[id] === weaponById(id).price), GRENADES.map(g => g.price).join());
ok('molotov: Terrorists · incendiary: Counter-Terrorists · the rest: both', weaponById('molotov').team === 't' && weaponById('incendiary').team === 'ct' && ['he', 'flash', 'smoke', 'decoy'].every(id => !weaponById(id).team));
ok('every grenade goes in the grenade slot (drops, pickups)', NADE_ORDER.every(id => slotOf(id) === 'nades'));

// Keys: 6 7 8 9 0 are slots 6–10 in Global Defensive; each picks exactly its own grenade among what you carry — for
// every combination of grenades (and two flashbangs) — or nothing; never another kind.
ok('keys 6 7 8 9 0 → slots 6 … 10; 4 → the cycle', ['Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Digit4'].map(c => legacyKey('arena', c)).join() === 'slot6,slot7,slot8,slot9,slot10,slot4');
let combos = 0;
for (let mask = 0; mask < 64; mask++) for (const twoFlash of [false, true]) {
  const carried = NADE_ORDER.filter((_, i) => mask & (1 << i)); if (twoFlash && !carried.includes('flash')) continue; const own = ['ak', 'usps', 'knife', ...carried]; combos++;
  for (const slot of [6, 7, 8, 9, 10]) { const pick = nadeInSlot(own, slot), want = carried.filter(id => NADE_SLOT[id] === slot);
    assert(want.length ? want.includes(pick) : pick === null, `slot ${slot} with [${carried}] picked ${pick}`); }
  // Key 4 from the knife: every kind carried once, in slot order, then round again; from a grenade, the next one.
  const seen = []; let held = 'knife'; for (let i = 0; i < carried.length + 1; i++) { held = nextNade(own, held); seen.push(held); }
  assert.deepEqual(seen, carried.length ? [...carried, carried[0]] : [null], `cycle over [${carried}]`);
}
ok('a slot key picks exactly its grenade or nothing; 4 cycles in slot order (all ' + combos + ' combinations)', true);
ok('with no decoy, 9 picks nothing (the game says so; nothing is thrown)', nadeInSlot(['knife', 'he', 'flash'], 9) === null);

// Deathmatch: four in all, two flashbangs, one of each other kind, one fire grenade; bought order doesn't matter: your
// grenades come in slot order, each kind once, the count beside it.
{ const g = { levels: {} }; let t = 5e9; startArena(g, { map: 'yard', bots: 0 }, t);
  for (const k of ['smoke', 'flash', 'he', 'flash']) assert.match(arenaApply(g, { type: 'buy-nade', kind: k }, 'Ann'), /Bought/);
  ok('carried in slot order, each kind once (bought smoke, flash, HE, flash)', nadesOf(g, 'Ann').join() === 'he,flash,smoke', nadesOf(g, 'Ann').join());
  ok('the count: two flashbangs', nadeCounts(g.arena.loadout.ann.nades).join() === 'he,1,flash,2,smoke,1', nadeCounts(g.arena.loadout.ann.nades).join());
  assert.throws(() => arenaApply(g, { type: 'buy-nade', kind: 'decoy' }, 'Ann'), /four grenades/); n++;
  ok('4 cycles HE → flash → smoke → HE (two flashbangs, one stop)', ['knife', 'he', 'flash', 'smoke'].map(h => nextNade(arenaArsenalOf(g, 'Ann'), h)).join() === 'he,flash,smoke,he');
  assert.match(arenaApply(g, { type: 'buy-nade', kind: 'decoy' }, 'Bo'), /Bought Decoy/); assert.throws(() => arenaApply(g, { type: 'buy-nade', kind: 'decoy' }, 'Bo'), /already have a Decoy/); n += 2;
  assert.match(arenaApply(g, { type: 'buy-nade', kind: 'molotov' }, 'Bo'), /Bought Molotov/); assert.throws(() => arenaApply(g, { type: 'buy-nade', kind: 'incendiary' }, 'Bo'), /One fire grenade/); n += 2;
  assert.match(arenaApply(g, { type: 'buy-nade', kind: 'incendiary' }, 'Cy'), /Bought Incendiary/); assert.throws(() => arenaApply(g, { type: 'buy-nade', kind: 'nuke' }, 'Cy'), /Unknown grenade/); n += 2;
  ok('slot 0 (10): Bo\'s molotov, Cy\'s incendiary', nadeInSlot(arenaArsenalOf(g, 'Bo'), 10) === 'molotov' && nadeInSlot(arenaArsenalOf(g, 'Cy'), 10) === 'incendiary');
  ok('refusal reasons match the host\'s', nadeRefusal(['he', 'flash', 'flash', 'smoke'], 'decoy') === 'You carry four grenades already' && nadeRefusal(['flash', 'flash'], 'flash') === 'Two flashbangs at most' && /One fire grenade/.test(nadeRefusal(['incendiary'], 'molotov')));
}

// Defuse: each side its own fire grenade, at CS2's price; the decoy for both. Picking up obeys the one-fire-grenade rule.
{ const g = { levels: {} }; const t = 9e9; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, t); const M = ARENA_MAPS.dust2;
  const at = ([x, z]) => ({ x: ARENA.cx + x, y: 9.7 + (M.nav?.floorAt?.(x, z) ?? 0), z: ARENA.cz + z, yaw: 0 }), P = [{ name: 'Ann', pose: at(M.t[0]) }, { name: 'Bo', pose: at(M.ct[0]) }];
  arenaTick(g, P, .05, t); const d = g.combat.d; Object.assign(d.teams, { ann: 't', bo: 'ct' }); d.money.ann = d.money.bo = 800;
  const buy = (who, kind) => arenaApply(g, { type: 'buy-nade', kind }, who, P, t + 10);
  assert.throws(() => buy('Ann', 'incendiary'), /Counter-Terrorist grenade/); assert.throws(() => buy('Bo', 'molotov'), /Terrorist grenade/); n += 2;
  ok('nothing charged for a refused buy', d.money.ann === 800 && d.money.bo === 800, JSON.stringify(d.money));
  assert.match(buy('Ann', 'molotov'), /Bought/); assert.match(buy('Bo', 'incendiary'), /Bought/); assert.match(buy('Bo', 'decoy'), /Bought/); n += 3;
  ok('molotov $400 (T), incendiary $500 + decoy $50 (CT)', d.money.ann === 400 && d.money.bo === 250, JSON.stringify(d.money));
  ok('Bo carries decoy, incendiary (slot order)', nadesOf(g, 'Bo').join() === 'decoy,incendiary', nadesOf(g, 'Bo').join());
  // A molotov on the ground at Bo's feet: he has an incendiary, so it stays there (walking over it, and pressing E).
  const C = g.combat, feet = P[1].pose.y - 9.7; C.ground ??= []; C.ground.push({ id: 'g1', item: 'molotov', x: P[1].pose.x + .5, z: P[1].pose.z, y: feet, at: t - 9000, by: 'Ann' }, { id: 'g2', item: 'he', x: P[1].pose.x - .5, z: P[1].pose.z, y: feet, at: t - 9000, by: 'Ann' });
  arenaTick(g, P, .05, t + 20); ok('walking over them: the HE is picked up…', !C.ground.some(it => it.id === 'g2') && g.arena.loadout.bo.nades.includes('he'), JSON.stringify(g.arena.loadout.bo.nades));
  ok('…the molotov stays (one fire grenade)', C.ground.some(it => it.id === 'g1') && !g.arena.loadout.bo.nades.includes('molotov'), JSON.stringify(g.arena.loadout.bo.nades));
  assert.throws(() => arenaApply(g, { type: 'pickup', id: 'g1' }, 'Bo', P, t + 30), /One fire grenade at a time/); n++;   // (E says why — not "no room" with a grenade slot still free)
}

// LAN: the host streams each player's grenades with how many (two flashbangs arrive as two), in what the guest gets.
{ const { startRoom } = await import('../lan/room.mjs');
  const room = await startRoom({ port: 0, bind: '127.0.0.1', savePath: path.join(mkdtempSync(path.join(os.tmpdir(), 'gs-')), 's.json'), roomCode: 'NADE06', hostKey: 'k', log: () => {}, error: () => {} });
  const base = 'http://127.0.0.1:' + room.port, post = (route, body, token) => fetch(base + '/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Player-Token': token } : {}) }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json() }));
  const join = async (name, hostKey) => (await post('join', { code: 'NADE06', name, ...(hostKey ? { hostKey } : {}) })).body;
  const ann = await join('Ann', 'k'), bo = await join('Bo'), ctl = new AbortController(), frames = [];
  fetch(base + '/api/events?token=' + bo.token, { signal: ctl.signal }).then(async r => { const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value); let i;
      while ((i = buf.indexOf('\n\n')) >= 0) { const msg = buf.slice(0, i); buf = buf.slice(i + 2); const data = /^data: (.*)$/m.exec(msg)?.[1]; if (data) try { frames.push(JSON.parse(data)); } catch {} } } }).catch(() => {});
  const wait = ms => new Promise(r => setTimeout(r, ms)); await wait(300);
  const g = room.world.operations.game, M = ARENA_MAPS.dust2; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0, freezeS: 15 }, Date.now()); await wait(400);
  Object.assign(g.combat.d.teams, { ann: 't', bo: 'ct' }); g.combat.d.money.ann = g.combat.d.money.bo = 3000;
  const pose = (p, [x, z]) => post('pose', { pose: { x: ARENA.cx + x, y: 9.7 + M.nav.floorAt(x, z), z: ARENA.cz + z, yaw: 0, active: true } }, p.token);
  await pose(ann, M.t[0]); await pose(bo, M.ct[0]); await wait(150);
  const act = (p, a) => post('action', { action: { type: 'arena', action: a } }, p.token);
  for (const k of ['flash', 'decoy', 'flash', 'molotov']) { const r = await act(ann, { type: 'buy-nade', kind: k }); assert.equal(r.status, 200, k + ': ' + JSON.stringify(r.body).slice(0, 200)); }
  const r = await act(bo, { type: 'buy-nade', kind: 'incendiary' }); assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200)); await wait(400);
  // Ann's grenades as the guest (Bo) last received them, wherever the frame carries the loadouts.
  const annNades = o => { if (!o || typeof o !== 'object') return null; if (Array.isArray(o.ann?.nades)) return o.ann.nades; for (const v of Object.values(o)) { const f = annNades(v); if (f) return f; } return null; };
  const got = frames.map(annNades).filter(Boolean).at(-1);
  ok('the guest received Ann\'s grenades', !!got, frames.length + ' frames');
  ok('…with the count: flashbang ×2, decoy, molotov (slot order)', nadeCounts(got).join() === 'flash,2,decoy,1,molotov,1', JSON.stringify(got));
  ok('the host\'s list is the same', nadeCounts(g.arena.loadout.ann.nades).join() === nadeCounts(got).join());
  ctl.abort(); await room.close();
}

// Radar (gd-radar.js): an enemy's decoy shows as an enemy dot at its shots and not between them, timed on the running
// host clock (host-clock.js, the clock its shots are heard on) — not on G.combat.clock, the last combat frame's stamp,
// which stands still in a quiet game (the host sends a frame only when something changes; a firing decoy alone changes
// nothing): here the landing frame is the only one. The page's DOM and canvases are stand-ins; red fills are counted.
{ let mono = 5000, wall = 1.8e12; const realDate = Date.now, realPerf = performance.now; Date.now = () => wall; performance.now = () => mono;
  const canvas = () => { const c = { red: 0 }, ctx = new Proxy(c, { get: (o, k) => k in o ? o[k] : k === 'fill' ? () => { if (o.fillStyle === '#ff4040') o.red++; } : k === 'measureText' ? () => ({ width: 0 }) : () => {}, set: (o, k, v) => { o[k] = v; return true; } }); return { width: 420, height: 420, style: {}, ctx, getContext: () => ctx }; };
  const cv = canvas(), el = { hidden: true, clientWidth: 210, style: {}, classList: { toggle() {} }, querySelector: s => s === 'canvas' ? cv : s === 'small' ? { textContent: '' } : { style: {}, replaceChildren() {} } };
  globalThis.document = { createElement: t => t === 'canvas' ? canvas() : { textContent: '' }, head: { append() {} }, body: { insertAdjacentHTML() {}, classList: { toggle() {} } }, getElementById: () => el };
  const { createRadar } = await import('../dist/gd-radar.js'), H = await import('../dist/host-clock.js'), { decoyBlip } = await import('../dist/arena-nades.js');
  // The host's computer runs 7 s ahead of this one; its decoy (Bo's) landed and began at host time C0, stamped on the
  // last combat frame this screen got, and that frame's send time set this screen's host clock.
  H.resetHostClock(); const C0 = wall + 7000, me = { x: ARENA.cx, y: 9.7, z: ARENA.cz }; H.hostClockSample(C0);
  const dec = { id: 'dq1', kind: 'decoy', by: 'Bo', phase: 'decoy', x: ARENA.cx + 8, y: 0, z: ARENA.cz, seed: 11, gun: 'ak', firedAt: C0 };
  const G = { mode: 'arena', arena: { map: 'yard' }, combat: { clock: C0, nades: [dec] } };
  const R = createRadar({ world: { operations: { game: G } }, lan: { players: [] }, name: () => 'Ann', yaw: () => 0, where: () => me, active: () => true });
  let on = 0, off = 0, agree = 0, s = 0, mine = 0;
  for (let t = 0; t <= 9000; t += 50, mono += 50, wall += 50) { cv.ctx.red = 0; R.update(); const want = decoyBlip(dec, C0 + t) ? 1 : 0; s++; if (want) on++; else off++; if (cv.ctx.red === want) agree++;
    if (want) { dec.by = 'Ann'; cv.ctx.red = 0; R.update(); mine += cv.ctx.red; dec.by = 'Bo'; } }
  ok('radar: an enemy decoy shows at its shots and not between them, on the running host clock (one frame, then quiet)', on > 10 && off > 10 && agree === s, `${agree}/${s} frames right, it fires in ${on}`);
  ok('…your own decoy never', mine === 0, mine);
  delete globalThis.document; Date.now = realDate; performance.now = realPerf; H.resetHostClock(); }
console.log('PASS: grenade slots · ' + n + ' checks (slots 6–10 on keys 6–0, exact pick, key 4 cycle in slot order, CS2 prices and limits, side fire grenades, one fire grenade on pickup, counts over LAN, the radar\'s decoy dot on the host clock)');
process.exit(0);
