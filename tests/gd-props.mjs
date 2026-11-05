// v53 PROPS (openB-10): Global Defensive's physics props are the host's (dist/gd-props.js). Checks: the host's simulation
// is deterministic (the same knocks at the same steps give the same props bit for bit, whatever the room's tick does;
// no Math.random), heavier props move less (CS2's masses), walls / friction / tipping / breaking / blasts and the cap;
// the snapshot is small (only moving props, quantised integers); a guest drawing from 20 Hz snapshots with jitter is
// where the host's props were PROP_INTERP steps ago and never jumps; a new round puts everything back (host and guest);
// grenades bounce off props on the host and push them (never a copy of a flight); a pose's shot record knocks a prop on
// the host (propsTick), a knife hit too (the arena action 'prop'), and propsFrame carries it in the combat frame; the
// local look (arena-physprops.js) follows the host's word in net mode and no longer moves anything itself. And when CS2's
// data is on this computer (user-assets/gd-props/props.json): its masses are the model files'. v53 PROPS final (the
// review): a prop touching a wall never goes into it, nor tunnels through a thin one; CS2's prop_data health and damage
// multipliers; the host's shots are the bullets fired (spread) as far as the gun reaches; dead bodies push nothing; a
// restarted shot counter fires nothing; Source's blast and knife forces; a grenade breaks a pot and flies on; a guest
// joining mid-round sees no old breaks replayed; hollow props weigh as shells.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createPropSim, createPropView, propPhysics, setPropModels, propsTick, propsFrame, propsKnife, propsHost, propsNet, MAX_AWAKE, PROP_DT, PROP_HZ, PROP_INTERP, PROP_Q, BULLET_J } from '../dist/gd-props.js';
import { stepNade, setNadeProps, NADE_DT } from '../dist/arena-nades.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d ? ' · ' + d : '')); };
const U = 2.54 / 16.5, EYE_Y = 64 * U;
const box = (i, model, x, z, h, r, y = 0) => ({ i, model, mass: 1, breaks: /pot|bottle/.test(model), x, z, y, h, rx: r, rz: r });
const props = [box(0, 'metalbucket01a', 0, 0, 2.4, 1.3), box(1, 'chair_stool01a', 20, 0, 4, 1.2), box(2, 'garbage_glassbottle003a', 40, 0, 2.2, .3), box(3, 'claypot03', 60, 0, 2.2, 1.6), box(4, 'garbage_metalcan001a', 80, 0, 1, .4)];
setPropModels({ models: { metalbucket01a: { mass: 8, surface: 'metal', elasticity: .25, friction: .8, breaks: false }, chair_stool01a: { mass: 50, surface: 'metal', elasticity: .25, friction: .8, breaks: false },
  garbage_glassbottle003a: { mass: 1, surface: 'glassbottle', elasticity: .3, friction: .4, breaks: false }, claypot03: { mass: 20, surface: 'potterylarge', elasticity: .3, friction: .4, breaks: true }, garbage_metalcan001a: { mass: 1, surface: 'popcan', elasticity: .25, friction: .8, breaks: false } } });
ok('CS2 model data used when present', propPhysics(props[1]).kg === 50 && propPhysics(props[1]).src === 'cs2' && propPhysics(props[3]).breaks === true && propPhysics(props[2]).breaks === false);
const mk = (o = {}) => createPropSim(props, { floorAt: () => 0, ...o });

// 1. Determinism: the same knocks at the same steps, two different room tick patterns → identical, bit for bit.
{ const knocks = (Q, s) => { if (s === 3) Q.bullet(-5, 1.2, .3, 1, 0, 0, 30); if (s === 40) Q.blast(38, 0, 0, 20, 99); if (s === 90) Q.knife(4, 0, .2, .98, 65); if (s === 120) Q.bullet(15, 3.5, -.4, 1, 0, 0, 10); };
  const A = mk({ beforeStep: knocks }), B = mk({ beforeStep: knocks }), saved = Math.random; let r = 7; const jit = () => (r = (r * 16807) % 2147483647) / 2147483647;
  Math.random = () => 0; while (A.step < 400) A.advance(.05); Math.random = () => .999; while (B.step < 400) B.advance(.02 + jit() * .08); Math.random = saved;
  while (A.step < B.step) A.stepOnce(); while (B.step < A.step) B.stepOnce();
  let same = A.step === B.step, moved = 0; for (let k = 0; k < props.length; k++) { const a = A.at(k), b = B.at(k); for (let j = 0; j < 3; j++) if (a[j] !== b[j]) same = false; if (A.broken(k) !== B.broken(k) || A.lying(k) !== B.lying(k)) same = false; if (a[0] !== props[k].x || a[2] !== props[k].z) moved++; }
  ok('host simulation: the same knocks at the same 1/64 s steps give the same props bit for bit, whatever the tick (no Math.random)', same && moved >= 3, JSON.stringify([A.at(0), B.at(0), moved]));
  const C = mk(); C.advance(.2); ok('advance() runs whole 1/64 s steps only (the rest carried)', C.step === 12, 'steps ' + C.step); C.advance(.0125); ok('the carried rest makes the next step', C.step === 13, 'steps ' + C.step); }

// 2. The body: masses, friction, walls, tipping, breaking, blasts, the cap.
{ const Q = mk(), steps = s => { for (let i = 0; i < s; i++) Q.stepOnce(); };
  Q.bullet(-5, 1.2, 0, 1, 0, 0, 30); Q.bullet(15, 2, 0, 1, 0, 0, 10); const v0 = Q.at(0)[0], v1 = Q.at(1)[0]; steps(4); const d0 = Q.at(0)[0] - v0, d1 = Q.at(1)[0] - v1;
  ok('a shot knocks a bucket along its line', d0 > 0); ok('the same shot moves a 50 kg stool far less than an 8 kg bucket (CS2 masses)', d1 < d0 * .25, `${d1.toFixed(3)} vs ${d0.toFixed(3)}`);
  steps(400); ok('friction stops it (asleep)', !Q.awake(0) && !Q.awake(1)); const slid = Q.at(0)[0]; ok('an AK bullet slides an 8 kg bucket a believable way (20–400 HU)', slid / U > 20 && slid / U < 400, (slid / U).toFixed(1) + ' HU');
  const k = Q.bullet(50, 1.2, 0, 1, 0, 0, 30); ok('a shot into a pottery pot shatters it', k === 3 && Q.broken(3)); ok('a shattered pot is no longer hit', Q.bullet(50, 1.2, 0, 1, 0, 0, 30) !== 3);
  Q.bullet(35, 1.9, 0, 1, 0, 0, 10); steps(200); ok('a tall bottle shot high tips over onto its side', Q.lying(2)); }
{ const W = mk({ blocked: (x, z, y, h, r) => x + r > 3 }), b = W.at(0); W.bullet(-5, 1.2, 0, 1, 0, 0, 30); for (let i = 0; i < 400; i++) W.stepOnce(); ok('a wall stops it', W.at(0)[0] + 1.3 <= 3.01, W.at(0)[0].toFixed(2)); }
{ const Q = mk(); Q.blast(38, 0, 0, 30, 99); for (let i = 0; i < 6; i++) Q.stepOnce(); const b = Q.at(2); ok('an HE blast throws a bottle away from it and up', b[0] > 40 && b[1] > 0, JSON.stringify(b)); ok('and the pot close to it shatters', Q.broken(3)); }
{ const many = Array.from({ length: 40 }, (_, i) => box(i, 'chair_stool01a', i * 6, 0, 4, 1.2)), Q = createPropSim(many, { floorAt: () => 0 }); Q.blast(120, 0, 0, 400, 99); let up = 0; for (let k = 0; k < 40; k++) up += Q.awake(k);
  ok(`at most MAX_AWAKE (${MAX_AWAKE}) props move at once`, up === MAX_AWAKE, up); }
{ const Q = mk(), pos = new Float64Array(3); let bx = 14; for (let t = 0; t < 40; t++) { bx += 250 * U * PROP_DT * 2; pos[0] = bx; Q.advance(PROP_DT * 2, pos, 1); }
  ok('a body walking into a stool pushes it ahead, never inside it', Q.at(1)[0] - bx >= 1.2 + 16 * U - 1e-6, `${Q.at(1)[0].toFixed(2)} vs ${bx.toFixed(2)}`); }

{ const two = [box(0, 'metalbucket01a', 0, 0, 2.4, 1.3), box(1, 'metalbucket01a', 4, 0, 2.4, 1.3), box(2, 'metalbucket01a', 20, 0, 2.4, 1.3), box(3, 'metalbucket01a', 21.5, 0, 2.4, 1.3)], Q = createPropSim(two, { floorAt: () => 0 });
  Q.impulse(0, 1200, 0, 0); for (let i = 0; i < 40; i++) Q.stepOnce(); ok('a prop knocked into another knocks it on (props against props, equal masses)', Q.awake(1) || Q.at(1)[0] > 4.05, JSON.stringify([Q.at(0)[0], Q.at(1)[0]]));
  ok('and two the map put touching are never pushed apart by themselves', Q.at(2)[0] === 20 && Q.at(3)[0] === 21.5 && !Q.awake(2) && !Q.awake(3)); }

// 3. The snapshot: integers, only what moves, small.
{ const Q = mk(); for (let i = 0; i < 5; i++) Q.stepOnce(); const idle = Q.snapshot(); ok('nothing moving: the snapshot is just [epoch, step, 0]', idle.length === 3 && idle[2] === 0, JSON.stringify(idle));
  Q.bullet(-5, 1.2, 0, 1, 0, 0, 30); Q.stepOnce(); const one = Q.snapshot(); ok('one moving: one entry of 7 integers', one.length === 3 + 7 && one.every(Number.isInteger) && one[3] === 0, JSON.stringify(one));
  const many = Array.from({ length: 60 }, (_, i) => box(i, 'metalbucket01a', (i % 10) * 6, Math.floor(i / 10) * 6, 2.4, 1.3)), M = createPropSim(many, { floorAt: () => 0 }); M.blast(27, 0, 15, 400, 99); M.stepOnce();
  const s = M.snapshot(), bytes = JSON.stringify(s).length; ok(`${MAX_AWAKE} props moving at once: under 1.5 KB a frame (${bytes} B), only the moving ones`, bytes < 1500 && (s.length - 3) / 7 === MAX_AWAKE, `${bytes} B, ${(s.length - 3) / 7} props`);
  for (let i = 0; i < 600; i++) M.stepOnce(); const rest = M.snapshot(), full = M.snapshot(true); ok('all settled: a frame carries at most 4 resting ones in turn; a full frame every displaced one', (rest.length - 3) / 7 <= 4 && (full.length - 3) / 7 === MAX_AWAKE, `${(rest.length - 3) / 7} / ${(full.length - 3) / 7}`); }

// 4. The guest: 20 Hz snapshots with network jitter, drawn PROP_INTERP steps behind, smooth.
{ const Q = mk(), V = createPropView(props), out = new Float64Array(6), hist = new Map(); let t = 1000, r = 3; const jit = () => (r = (r * 48271) % 2147483647) / 2147483647;
  const arrivals = []; Q.bullet(-5, 1.2, .3, 1, 0, 0, 30);
  for (let f = 0; f < 30; f++) { for (let s = 0; s < 3 + (f % 3 === 0 ? 1 : 0); s++) { Q.stepOnce(); hist.set(Q.step, Q.at(0)); } arrivals.push({ at: f * 50 + 20 + jit() * 35, pp: Q.snapshot() }); }
  let maxErr = 0, maxJump = 0, last = null, ai = 0;
  for (let ms = 0; ms < 1500; ms += 4) { while (ai < arrivals.length && arrivals[ai].at <= ms) V.ingest(arrivals[ai++].pp, t + arrivals[ai - 1].at); if (ai < 2) continue;
    const rs = V.renderStep(t + ms); V.pose(0, rs, out); const s0 = Math.floor(rs), a = hist.get(s0), b = hist.get(s0 + 1);
    if (a && b && rs > 20) { const f = rs - s0, x = a[0] + (b[0] - a[0]) * f; maxErr = Math.max(maxErr, Math.abs(out[0] - x)); }
    if (last !== null) maxJump = Math.max(maxJump, Math.abs(out[0] - last)); last = out[0]; }
  ok('a guest draws the host\'s prop where it was PROP_INTERP steps ago (within 0.5 HU)', maxErr / U < .5, (maxErr / U).toFixed(3) + ' HU');
  ok('and it never jumps (at most a few HU between frames 4 ms apart)', maxJump / U < 6, (maxJump / U).toFixed(2) + ' HU');
  const ep = V.state.epoch; Q.reset(); Q.stepOnce(); ok('a new round: a new epoch resets the guest\'s view to the map\'s spots', V.ingest(Q.snapshot(), t + 2000) === 2 && V.state.epoch !== ep && (V.pose(0, V.renderStep(t + 2000), out), Math.abs(out[0] - props[0].x) < 1e-9)); }

// 5. Round reset on the host.
{ const Q = mk(); Q.bullet(-5, 1.2, 0, 1, 0, 0, 30); Q.bullet(50, 1.2, 0, 1, 0, 0, 30); for (let i = 0; i < 30; i++) Q.stepOnce(); const e0 = Q.epoch; Q.reset();
  ok('reset: every prop back where the map put it, whole and still', props.every((p, k) => { const a = Q.at(k); return a[0] === p.x && a[2] === p.z && a[1] === p.y && !Q.broken(k) && !Q.awake(k) && !Q.lying(k); }) && Q.epoch !== e0); }

// 6. Grenades bounce off props (the host's step only) and push them.
{ const Q = mk(), hook = (x, y, z, rr, g, o) => Q.nadeHit(x, y, z, rr, g.vx, g.vy, g.vz, o); setNadeProps(hook);
  const fly = (view) => { const g = { kind: 'he', x: -10, y: 1.2, z: 0, vx: 60, vy: 0, vz: 0, grav: 0, ...(view ? { view: true } : {}) }; for (let i = 0; i < 40; i++) stepNade(g, [], null, NADE_DT); return g; };
  const g = fly(false); ok('a grenade thrown at a bucket bounces back off it', g.vx < 0 && g.x < 0, `x ${g.x.toFixed(2)} vx ${g.vx.toFixed(2)}`); ok('at the world\'s 0.45 (Source: no player, full elasticity)', Math.abs(Math.abs(g.vx) - 60 * .45) < .5, g.vx.toFixed(2));
  ok('and pushes the bucket', Q.awake(0));
  { const Q2 = mk(); setNadeProps((x, y, z, rr, g, o) => Q2.nadeHit(x, y, z, rr, g.vx, g.vy, g.vz, o, !g.view)); const c = fly(true), still = !Q2.awake(0), h2 = fly(false);
    ok('a preview or a copy of a flight (view) bounces off the prop where the host\'s flight does, but never pushes it', still && c.vx < 0 && Math.abs(c.x - h2.x) < .05 && Math.abs(c.vx - h2.vx) < .5, JSON.stringify([c.x, h2.x, c.vx, h2.vx]));
    setNadeProps(hook); }
  const toss = { x: -10, y: 1.2, z: 0, vx: 60, vy: 0, vz: 0, grav: 0 }; for (let i = 0; i < 40; i++) stepNade(toss, [], null, NADE_DT); ok('nor a dropped gun\'s toss (no grenade kind)', toss.vx > 0);
  setNadeProps(null); const h = fly(false); ok('without the hook (no props) a grenade flies on', h.vx > 0); }

// 7. The host glue: a game, a pose's shot, a knife hit, the frame, a new round.
{ const { ARENA_MAPS } = await import('../dist/arena-maps.js'), { ARENA } = await import('../dist/facility-layout.js'), M = ARENA_MAPS.dust2, saved = M.physProps;
  M.physProps = [box(0, 'metalbucket01a', -115.8, 267.2 - 6, 2.4, 1.3), box(1, 'claypot03', -115.8 + 6, 267.2, 2.2, 1.6)];
  const game = { mode: 'arena', arena: { map: 'dust2', bots: [], match: 1 }, combat: { d: { round: { id: 'r1', phase: 'live' }, match: 1 } } };
  const eye = { x: ARENA.cx - 115.8, y: 64 * U, z: ARENA.cz + 267.2, yaw: 0 };   // looking down −z at the bucket 6 units away
  const SP = -Math.atan2(eye.y - 1.2, 6), players = [{ name: 'A', pose: { ...eye, weapon: 'ak', shot: { n: 10, sp: SP, yaw: 0, pu: [0, 0], w: 'ak' } } }];
  propsTick(game, players, .05); ok('propsTick: a map with props gets a host simulation', !!propsHost(game) && propsHost(game).count === 2);
  ok('nothing moving: the frame\'s pp is three numbers', JSON.stringify(propsFrame(game)).length < 20);
  players[0].pose.shot = { n: 11, sp: SP, yaw: 0, pu: [0, 0], w: 'ak' }; const moving = propsTick(game, players, .05); const S = propsHost(game);
  ok('a new shot in a pose record knocks the bucket on the host (its line from the eye)', moving && S.awake(0), JSON.stringify(S.at(0)));
  const pp = propsFrame(game); ok('the combat frame carries it (pp: the bucket, 7 integers)', Array.isArray(pp) && pp[2] === 0 && pp[3] === 0 && pp.length === 10, JSON.stringify(pp));
  ok('one array per step, shared by every frame of it', propsFrame(game) === pp);
  propsKnife(game, 'A', { type: 'prop', i: 1, dx: 1, dy: 0, dz: 0, attack: 'heavy' }, [{ name: 'A', pose: { ...eye, x: eye.x + 3 } }]); ok('a knife hit (the arena action) breaks the pot', S.broken(1));
  assert.throws(() => propsKnife(game, 'A', { type: 'prop', i: 0, dx: 1, dy: 0, dz: 0 }, [{ name: 'A', pose: { ...eye, x: eye.x + 200 } }]), /Too far/); ok('a knife hit from too far is refused', true);
  game.combat.d.round = { id: 'r2', phase: 'freeze' }; propsTick(game, players, .05); ok('a new round (its id): the host puts the props back, whole', !S.broken(1) && !S.awake(0) && Math.abs(S.at(0)[2] - (ARENA.cz + 267.2 - 6)) < 1e-9);
  // The guest: arena-physprops in net mode follows pp and moves nothing itself.
  const THREE = await import('../dist/three.module.js'), { createPhysProps } = await import('../dist/arena-physprops.js');
  const piv = new Map(M.physProps.map(p => { const g = new THREE.Group(); g.position.set(ARENA.cx + p.x, p.y, ARENA.cz + p.z); return [p.i, g]; })), woke = [];
  const L = createPhysProps(M.physProps, piv, { cx: ARENA.cx, cz: ARENA.cz, wake: k => woke.push(k) });
  players[0].pose.shot = { n: 12, sp: SP, yaw: 0, pu: [0, 0], w: 'ak' }; for (let i = 0; i < 8; i++) propsTick(game, players, .05);
  let t = 5000; for (let i = 0; i < 12; i++) { propsTick(game, players, .05); propsNet(L, M.physProps, propsFrame(game), t += 50); }
  ok('net mode: the look takes the host\'s pose (woken apart from the merged look)', L.net && woke.includes(0) && Math.abs(piv.get(0).position.z - (ARENA.cz + 267.2 - 6)) > .05, piv.get(0).position.z.toFixed(3));
  { const at = piv.get(0).position, g = { kind: 'smoke', x: at.x - 10, y: at.y + 1.2, z: at.z, vx: 60, vy: 0, vz: 0, grav: 0, view: true }, S0 = propsHost(game).at(0); for (let i = 0; i < 40; i++) stepNade(g, [], null, NADE_DT);
    ok('a page\'s grenade copies and previews bounce off the props where the host\'s word draws them (propsNet\'s read-only copy)', g.vx < 0 && g.x < at.x, JSON.stringify([g.x, g.vx, at.x]));
    ok('and never push the host\'s props', propsHost(game).at(0).every((q, j) => q === S0[j])); }
  const z0 = piv.get(0).position.z; L.shot(eye.x, eye.y, eye.z, 0, 0, -1, 30, 1); L.blast(piv.get(0).position.x, 0, z0, 20); L.update(.1, new Float32Array(0), 0); ok('net mode: its own shots, blasts and steps move nothing', piv.get(0).position.z === z0);
  M.physProps = saved; propsTick(game, players, .05); ok('a map without props: no host simulation (and the grenade hook removed)', !propsHost(game)); }

// 8. CS2's data on this computer: the model files' masses (tools/import-cs2-props.mjs).
{ const f = new URL('../user-assets/gd-props/props.json', import.meta.url);
  if (existsSync(f)) { const j = JSON.parse(readFileSync(f, 'utf8')); setPropModels(j); const m = j.models;
    ok('props.json: claypot03 20 kg potterylarge, breaks (claypot03.vmdl_c PHYS m_flMass, DATA break_list)', m.claypot03?.mass === 20 && m.claypot03.surface === 'potterylarge' && m.claypot03.breaks === true);
    ok('props.json: chair_stool01a 50 kg, metalbucket01a 8 kg, plasticcrate01a 10 kg', m.chair_stool01a?.mass === 50 && m.metalbucket01a?.mass === 8 && m.plasticcrate01a?.mass === 10);
    ok('propPhysics takes them', propPhysics({ model: 'chair_stool01a', mass: 1, rx: 1, rz: 1, h: 4 }).kg === 50); }
  else console.log('(no user-assets/gd-props/props.json on this computer: the CS2 data checks skipped)'); }
// 9. v53 PROPS final (the review): walls, tunnelling, CS2's prop health, the shot's own bullets, reach, dead bodies,
// a restarted shot counter, the blast's and the knife's force, grenades breaking pots, a mid-round join, the shell mass.
{ const { createPhysProps } = await import('../dist/arena-physprops.js'), { shotOffsets, offsetDir, shotBase, weaponById, accOf } = await import('../dist/weapons-data.js');
  setPropModels({ models: { metalbucket01a: { mass: 8, surface: 'metal', elasticity: .25, friction: .8, health: 0 }, claypot03: { mass: 20, surface: 'potterylarge', elasticity: .3, friction: .4, health: 20, dmg: { bullets: 1, club: 1.25, explosive: 1.5 } },
    garbage_sodacup01a: { mass: 1, surface: 'paper', health: 15, dmg: { bullets: .5, club: 1.25, explosive: 1.5 } }, garbage_metalcan001a: { mass: 1, surface: 'popcan', elasticity: .25, friction: .8, health: 0 } } });
  // (a) a can the map put with its side 0.15 units inside a wall face (x = 3), knocked into the wall: it never goes in.
  { const can = [box(0, 'garbage_metalcan001a', 3 - .4 + .15, 0, 1, .4)], W = createPropSim(can, { floorAt: () => 0, blocked: (x, z, y, h, r) => x + r > 3 }); let far = -1e9;
    W.impulse(0, BULLET_J, 0, 0); for (let i = 0; i < 400; i++) { W.stepOnce(); far = Math.max(far, W.at(0)[0]); }
    ok('a prop the map put touching a wall, knocked into it, never goes into it (the reviewer\'s can: 1671 HU through)', far <= 3 - .4 + .15 + 1e-6, far.toFixed(3));
    const W2 = createPropSim(can, { floorAt: () => 0, blocked: (x, z, y, h, r) => x + r > 3 }); W2.impulse(0, -BULLET_J, 0, 0); for (let i = 0; i < 400; i++) W2.stepOnce(); ok('and knocked away from it, it leaves the wall', W2.at(0)[0] < 0, W2.at(0)[0].toFixed(2)); }
  // (b) a thin wall (a sheet: no body test sees it — only the way through) stops a fast can.
  { const can = [box(0, 'garbage_metalcan001a', 0, 0, 1, .4)], wall = 5, W = createPropSim(can, { floorAt: () => 0, crosses: (ax, ay, az, bx) => (ax - wall) * (bx - wall) <= 0 });
    W.impulse(0, BULLET_J, 0, 0); let far = -1e9; for (let i = 0; i < 400; i++) { W.stepOnce(); far = Math.max(far, W.at(0)[0]); } ok('a fast can does not tunnel through a thin wall (the way a → b is tested, not only b)', far < wall, far.toFixed(2)); }
  // (c) CS2's prop_data health: a pot of 20 takes damage and breaks when it runs out; a health of 0 never breaks.
  { const P = [box(0, 'claypot03', 0, 0, 2.2, 1.6), box(1, 'metalbucket01a', 20, 0, 2.4, 1.3), box(2, 'garbage_sodacup01a', 40, 0, 1.6, .4)], Q = createPropSim(P, { floorAt: () => 0 });
    ok('propPhysics: CS2\'s health and multipliers (pot 20 hp, club 1.25; bucket 0 hp: never breaks)', propPhysics(P[0]).hp === 20 && propPhysics(P[0]).dmg.club === 1.25 && !propPhysics(P[1]).breaks);
    Q.bullet(-5, 1.1, 0, 1, 0, 0, 30, BULLET_J, 12, 1); ok('a 12-damage bullet leaves a 20-hp pot whole (and knocks it)', !Q.broken(0) && Q.hp(0) === 8 && Q.awake(0));
    Q.bullet(-5, 1.1, 0, 1, 0, 0, 30, BULLET_J, 12, 1); ok('the next one breaks it', Q.broken(0));
    for (let i = 0; i < 5; i++) Q.bullet(15, 1.2, 0, 1, 0, 0, 30, BULLET_J, 300, 1); ok('a bucket (health 0) is never broken, only knocked', !Q.broken(1));
    Q.bullet(35, .8, 0, 1, 0, 0, 30, BULLET_J, 29, 1); ok('dmg.bullets 0.5: a 29-damage bullet leaves a 15-hp paper cup whole', !Q.broken(2)); Q.bullet(Q.at(2)[0] - 5, .8, Q.at(2)[2], 1, 0, 0, 30, BULLET_J, 29, 1); ok('the second breaks it', Q.broken(2));
    Q.reset(); ok('a new round: its health back', Q.hp(0) === 20 && !Q.broken(0)); }
  // (d) the blast's force is the base damage's, the same for every prop in the radius (Source); the knife's a fixed 24000.
  { const P = [box(0, 'metalbucket01a', 5, 0, 2.4, 1.3), box(1, 'metalbucket01a', 0, 40, 2.4, 1.3)], Q = createPropSim(P, { floorAt: () => 0 }); Q.blast(0, 1.2, 0, 60, 98); Q.stepOnce();
    const v = k => { const a = Q.at(k), h = P[k]; return Math.hypot(a[0] - h.x, a[2] - h.z); }, r = v(0) / v(1); ok('an HE pushes a bucket near it and one at its edge alike (Source: the base damage, ×0.85–1.15)', r > .7 && r < 1.45, r.toFixed(3));
    const K = createPropSim(P, { floorAt: () => 0 }); K.knife(0, 1, 0, 0, 40); K.stepOnce(); const a = K.at(0)[0] - 5; const K2 = createPropSim(P, { floorAt: () => 0 }); K2.knife(0, 1, 0, 0, 65); K2.stepOnce(); ok('a light and a heavy knife swing push alike (CalculateMeleeDamageForce × 80 / damage)', Math.abs(a - (K2.at(0)[0] - 5)) < 1e-9 && a > 0); }
  // (e) the host's shots: the bullets the shooter fired (spread), as far as the gun reaches; dead bodies; a restarted counter.
  { const { ARENA_MAPS } = await import('../dist/arena-maps.js'), { ARENA } = await import('../dist/facility-layout.js'), M = ARENA_MAPS.dust2, saved = M.physProps, w = weaponById('ak');
    const { mapBoxes, rayBoxes } = await import('../dist/arena-maps.js'), MB = mapBoxes(M, ARENA.cx, ARENA.cz);
    // A clear lane on the map: an eye whose bullet lines to the floor 30 and 600 units ahead (yaw 0: −z) meet no wall.
    let ex = null; for (let gx = -400; gx <= 400 && !ex; gx += 25) for (let gz = -400; gz <= 600 && !ex; gz += 25) { const x = ARENA.cx + gx, z = ARENA.cz + gz, y = EYE_Y;
      if ([30, 600].every(L => { const a = -Math.atan2(y - 1.2, L), d = Math.hypot(L, y - 1.2); return rayBoxes(MB, x, y, z, 0, Math.sin(a), -Math.cos(a), d + 5) >= d - .01 && rayBoxes(MB, x, 1.2, z, 0, 0, -1, L + 5) >= L; })) ex = [gx, gz]; }
    ok('(test setup: a clear 600-unit lane on the map)', !!ex);
    const eye = { x: ARENA.cx + ex[0], y: EYE_Y, z: ARENA.cz + ex[1], yaw: 0 }, mk2 = (props, id) => ({ mode: 'arena', arena: { map: 'dust2', bots: [], match: id }, combat: { d: { round: { id: 'r' + id, phase: 'live' }, match: id } } });
    // A shot number whose bullet, with a big inaccuracy, passes well wide of a bucket 30 units ahead — and the control.
    const SP = -Math.atan2(eye.y - 1.2, 30), base = shotBase(SP, 0, 0, 0, [0, 0, 0]), O = new Float64Array(64), D = [0, 0, 0]; let miss = -1;
    for (let nn = 20; nn < 400 && miss < 0; nn++) { shotOffsets(w, nn, .5, accOf(w).spread, O); offsetDir(base, O[0], O[1], D); const t = 30 / -D[2], dx = D[0] * t, dy = eye.y + D[1] * t - 1.2; if (Math.hypot(dx, dy) > 4) miss = nn; }
    M.physProps = [box(0, 'metalbucket01a', ex[0], ex[1] - 30, 2.4, 1.3)]; let g = mk2(M.physProps, 'sp'); const fire = (n, ia, o = {}) => propsTick(g, [{ name: 'A', pose: { ...eye, weapon: 'ak', ...o, shot: { n, sp: SP, yaw: 0, pu: [0, 0], ia, w: 'ak' } } }], .05);
    fire(miss - 1, .5); fire(miss, .5); ok('a shot whose bullet (its spread) passes wide of a prop does not knock it', !propsHost(g).awake(0), 'shot ' + miss);
    fire(miss + 100, 0); fire(miss + 101, 0); ok('a shot whose bullet hits it does', propsHost(g).awake(0));
    M.physProps = [box(0, 'metalbucket01a', ex[0], ex[1] - 600, 2.4, 1.3)]; g = mk2(M.physProps, 'far'); const SPf = -Math.atan2(eye.y - 1.2, 600);
    const fireF = n => propsTick(g, [{ name: 'A', pose: { ...eye, weapon: 'ak', shot: { n, sp: SPf, yaw: 0, pu: [0, 0], ia: 0, w: 'ak' } } }], .05); fireF(1); fireF(2);
    ok(`an AK knocks a prop 600 units (3900 HU) away — its reach, m_flRange 8192 HU (${w.reach.toFixed(0)} units), not 400`, propsHost(g).awake(0));
    M.physProps = [box(0, 'metalbucket01a', ex[0], ex[1] - 30, 2.4, 1.3)]; g = mk2(M.physProps, 'jump'); fire(5000, 0); fire(5000 + 9, 0); ok('a shot counter that jumps by more than MAX_SHOT_GAP (a reloaded page) fires no bullets', !propsHost(g).awake(0));
    const P2 = [box(0, 'metalbucket01a', ex[0], ex[1] - 100, 2.4, 1.3), box(1, 'metalbucket01a', ex[0], ex[1] - 200, 2.4, 1.3)]; M.physProps = P2; g = mk2(P2, 'dead');
    g.combat.down = { 'bot alex': { until: Date.now() + 60000 } };
    const at = k => ({ x: ARENA.cx + P2[k].x + .5, y: EYE_Y, z: ARENA.cz + P2[k].z });
    for (let i = 0; i < 4; i++) propsTick(g, [{ name: 'Dead', pose: { ...at(0), active: false } }, { name: 'BOT Alex', bot: true, pose: { ...at(1) } }], .05);
    ok('dead players and bots push no props (pose.active false, combat down)', !propsHost(g).awake(0) && !propsHost(g).awake(1), JSON.stringify([propsHost(g).at(0), propsHost(g).at(1)]));
    propsTick(g, [{ name: 'Alive', pose: { ...at(0) } }], .05); ok('a living one does', propsHost(g).awake(0));
    // (f) a grenade striking a breakable pot: 10 club damage; broken, it flies on at 0.4 × its speed (CS:GO).
    const P3 = [box(0, 'garbage_sodacup01a', ex[0], ex[1] - 300, 1.6, .4)]; setPropModels({ models: { garbage_sodacup01a: { mass: 1, surface: 'paper', health: 5, dmg: { bullets: .5, club: 1.25, explosive: 1.5 } } } }); M.physProps = P3; g = mk2(P3, 'nade'); propsTick(g, [], .05);
    const gr = { kind: 'he', x: ARENA.cx + ex[0], y: .8, z: ARENA.cz + ex[1] - 300 + 6, vx: 0, vy: 0, vz: -60, grav: 0 }; for (let i = 0; i < 20; i++) stepNade(gr, [], null, NADE_DT);
    ok('a grenade breaks a 5-hp paper cup (10 × club 1.25) and flies on through it at 0.4 × its speed', propsHost(g).broken(0) && gr.vz < 0 && Math.abs(gr.vz + 24) < 1, gr.vz.toFixed(2));
    setNadeProps(null); M.physProps = saved; propsTick(g, [], .05); }
  // (g) a guest joining mid-round: what broke before goes quietly (no break effects replayed); a break it sees, with them.
  { const P = [box(0, 'claypot03', 0, 0, 2.2, 1.6), box(1, 'claypot03', 10, 0, 2.2, 1.6)], Q = createPropSim(P, { floorAt: () => 0 }), THREE = await import('../dist/three.module.js');
    const piv = new Map(P.map(p => [p.i, new THREE.Group()])); let fx = 0; const L = createPhysProps(P, piv, { onBreak: () => fx++ });
    Q.knife(0, 1, 0, 0, 1e4); Q.stepOnce(); propsNet(L, P, Q.snapshot(), 1000, { cx: 0, cz: 0 }); ok('a guest joining after a pot broke: it is gone, without its break effects again', L.broken(0) && fx === 0);
    Q.knife(1, 1, 0, 0, 1e4); Q.stepOnce(); propsNet(L, P, Q.snapshot(), 1050, { cx: 0, cz: 0 }); ok('a pot that breaks while it watches: with them', L.broken(1) && fx === 1); setNadeProps(null); }
  // (h) the shell mass (a model with m_flMass 0 on a surface with a thickness): in the range of the authored ones.
  { const f = new URL('../user-assets/gd-props/props.json', import.meta.url); if (existsSync(f)) { const m = JSON.parse(readFileSync(f, 'utf8')).models, a = m.metal_bucket_01_a, b = m.wine_bottle_01_a_breakable, c = m.watering_can_01;
      if (a?.massRule) ok('props.json: density-weighed hollow props (vsurf thickness) weigh like the authored ones — not 103 kg cans and 25 kg bottles', a.massFromDensity > 1 && a.massFromDensity < 20 && b.massFromDensity < 10 && c.massFromDensity < 20, JSON.stringify([a.massFromDensity, b.massFromDensity, c.massFromDensity]));
      if (m.garbage_glassbottle003a?.dmg) ok('props.json: Mirage\'s glass bottle, mug and soda cup break (prop_data base health 5 / 5 / 15, scripts/propdata.vdata); the cinder block never', m.garbage_glassbottle003a.health === 5 && m.garbage_coffeemug001a_fullsheet.health === 5 && m.garbage_sodacup01a.health === 15 && m.cinderblock01a.health === 0); } }
  setPropModels(null); }
console.log(`PASS: gd-props · ${n} checks (host determinism, masses, friction / walls / tipping / breaking / blasts / cap, snapshot size, guest interpolation, round reset, grenade bounce, host glue, net mode; walls, tunnelling, health, spread, reach, dead bodies, forces, quiet joins, shell masses)`);
