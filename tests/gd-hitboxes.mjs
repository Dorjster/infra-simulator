// CS2's hit capsules on the Global Defensive bodies (v53 AGENTS, H8: dist/gd-hitboxes.js; the file from
// tools/import-cs2-sleeves.mjs, version 2). Part 1 needs no CS2 files (CI): without a file the hit test is exactly the
// built-in rayBody; a made-up capsule set (our numbers; the CT and T sides different) gives the right hit group per ray,
// turns with the body's yaw, crouches, bends with the look's pitch, rejects by its bounding cylinder exactly as a
// brute-force pass would (bent too); the hold, knife and side rules equal cs2-agents.js / gd-soldiers.js; the host's
// traceShot and the shooter's prediction agree through the one body rule both call (bodyFor), on both sides and in
// deathmatch, and lag-comp rewinds the target's pitch and item; no allocation per ray; the cost per ray measured.
// Part 2 (skipped without user-assets/hitboxes): the capsules against the agent model data — the raw set as
// Source2Viewer reads it from the vmdl (when the CS2 install is here), the bind pose against the vmdl's own
// m_invBindPose, items' poses re-made from the agents and clips, the pitch against the agent posed at that pitch, a ray
// through the drawn head at ±0.6 rad, each CS2 hit group reached, the heights, host = guest on CS2's set.
//   node --expose-gc tests/gd-hitboxes.mjs
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const H = await import('../dist/gd-hitboxes.js'), W = await import('../dist/weapons-data.js');
const { rayHit, useHitboxes, holdOf, heldId, bodySide, bodyFor, hitboxPose, capsuleAt, GROUP_ZONE } = H, { rayBody, HU, weaponById, WEAPON_IDS, shotBase, shotOffsets, offsetDir, accOf } = W;
let pass = 0, fail = 0; const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== '' ? ' · ' + info : '')); };
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
const unit = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
const src = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

// 1. Without a file: rayBody itself (the same distance and zone for any ray)
useHitboxes(null);
{ let same = 0, n = 0; const a = { zone: null }, b = { zone: null };
  for (let i = 0; i < 4000; i++) { const o = [rnd() * 40 - 20, rnd() * 14, rnd() * 40 - 20], d = unit(-o[0] + rnd() * 4 - 2, 5 + rnd() * 6 - o[1], -o[2] + rnd() * 4 - 2), cr = rnd() < .3;
    const t1 = rayBody(...o, ...d, 0, 0, 0, cr, .2, a), t2 = rayHit(...o, ...d, 0, 0, 0, rnd() * 6, cr, .2, b, 'ak', 't', rnd() - .5); n++; if (t1 === t2 && (t1 < 0 || a.zone === b.zone)) same++; }
  check('no hit box file: rayHit is rayBody (distance and zone, 4000 rays)', same === n, `${same}/${n}`); }

// 2. A made-up set (our numbers, not CS2's): head, neck, chest, stomach, two legs, one arm held forward — the CT's on its
// right (+x, group 5), the T's on its left (−x, group 4), so a side mix-up shows; each item its own arm length.
const LVL = [3, 3, 2, 0, 0, 0, 3];   // head, neck: spine_3; chest: spine_2; stomach, legs: none; the arm: spine_3
const HB = (dy, ax, ag, len) => [[0, 60 + dy, 0, 0, 66 + dy, 0, 4, 1], [0, 55 + dy, 0, 0, 59 + dy, 0, 3, 8], [0, 44 + dy, 0, 0, 50 + dy, 0, 6, 2], [0, 34 + dy, 0, 0, 42 + dy, 0, 6.5, 3], [-4, 2, 0, -4, 32 + dy, 0, 4, 6], [4, 2, 0, 4, 32 + dy, 0, 4, 7], [ax, 50 + dy, 0, ax, 50 + dy, -len, 2.5, ag]];
const PO = (dy, ax, ag, len) => ({ caps: HB(dy, ax, ag, len), piv: [0, 40 + dy, 0, 0, 46 + dy, 0, 0, 52 + dy, 0], axis: [1, 0, 0] });
const LEN = { ak: 18, pistol: 12, knife: 8, 'knife-t': 6, butterfly: 10, he: 4 };
const sideSet = (ax, ag) => ({ lvl: LVL, poses: Object.fromEntries(Object.entries(LEN).map(([k, l]) => [k, { stand: PO(0, ax, ag, l), crouch: PO(-14, ax, ag, l) }])), ids: { ak: 'ak', pistol: 'pistol', usps: 'pistol', knife: 'knife', 'knife-t': 'knife-t', butterfly: 'butterfly', he: 'he', flash: 'he' } });
const fake = { version: 2, from: 'test', agents: { ct: 'x', t: 'y' }, sides: { ct: sideSet(6, 5), t: sideSet(-6, 4) } };
check('a hit box file installs (and a bad one is refused: version 1, no rifle hold, a bad level)', useHitboxes(fake) === true && H.hitboxesOn() && !useHitboxes({ version: 1, poses: {} }) && !H.hitboxesOn()
  && !useHitboxes({ ...fake, sides: { ...fake.sides, t: { ...fake.sides.t, ids: { usps: 'pistol' }, poses: { pistol: fake.sides.t.poses.pistol } } } }) && !useHitboxes({ ...fake, sides: { ...fake.sides, ct: { ...fake.sides.ct, lvl: [3, 3, 2, 0, 0, 0, 4] } } }) && useHitboxes(fake));
const O = { zone: null, group: 0, box: -1 }, U = HU;
{ const at = (y, x = 0, yaw = 0, cr = false, side = 'ct', held = 'ak') => { const t = rayHit(x * U, y * U, -100, 0, 0, 1, 0, 0, 0, yaw, cr, 0, O, held, side); return t > 0 ? O.group : 0; };
  // (the ray goes +z from z = −100: the body faces −z, so these come from the front)
  const rows = [[63, 1], [57, 8], [48, 2], [38, 3], [70.5, 0], [75, 0]], got = rows.map(([y]) => at(y)), want = rows.map(r => r[1]);
  check('made-up set: the hit group per ray from the front (head, neck, chest, stomach, just over the head, above it)', got.join() === want.join(), got.join(' '));
  check('…the left leg (−x) and the right leg (+x) apart', at(20, -4) === 6 && at(20, 4) === 7, `${at(20, -4)} ${at(20, 4)}`);
  check('…the arm held forward (−z) is met before the chest behind it: the CT\'s right arm, the T\'s left', at(50, 6) === 5 && at(50, -6, 0, false, 't') === 4 && ![4, 5].includes(at(50, -6.5)) && ![4, 5].includes(at(50, 6.5, 0, false, 't')), `${at(50, 6)} ${at(50, -6, 0, false, 't')} ${at(50, -6.5)} ${at(50, 6.5, 0, false, 't')}`);
  check('…crouched: the set drops 14 HU (the head at 49, nothing at 63)', at(49, 0, 0, true) === 1 && at(63, 0, 0, true) === 0);
  // the item's own hold: the arm's reach (a ray straight down in front of the chest)
  const down = (held, z, side = 'ct', x = 6) => { const t = rayHit(x * U, 60 * U, -z * U, 0, -1, 0, 0, 0, 0, 0, false, 0, O, held, side); return t > 0 ? O.group : 0; };
  check('…each item its own hold: the arm reaches 18 HU with the AK, 12 with a pistol (the USP-S shares it), 4 with a grenade; an unnamed rifle → the AK\'s', down('ak', 15) === 5 && down('pistol', 15) === 0 && down('usps', 11) === 5 && down('usps', 15) === 0 && down('flash', 7) === 0 && down('he', 3) === 5 && down('m4', 15) === 5);
  // yaw: the arm points along −z turned by yaw (forward (−sin yaw, −cos yaw)); the ray along +z at the arm's turned tip
  const yaw = Math.PI / 2, tipW = [-Math.sin(yaw) * 15 + Math.cos(yaw) * 6, 50, -Math.cos(yaw) * 15 - Math.sin(yaw) * 6];
  const t1 = rayHit((tipW[0]) * U, tipW[1] * U, (tipW[2] - 30) * U, 0, 0, 1, 0, 0, 0, yaw, false, 0, O); const g1 = O.group;
  const t0 = rayHit(6 * U, 50 * U, -30 * U, 0, 0, 1, 0, 0, 0, 0, false, 0, O);
  check('…turns with the body\'s yaw (the arm\'s tip found where the turn puts it)', t1 > 0 && g1 === 5 && t0 > 0 && O.group === 5, `${g1}`);
  // pitch: the head (on spine_3) moves with all three turns; the stomach and legs (no spine bone above) never move
  const P = hitboxPose('ak', false, 'ct'), E = new Float64Array(6), mid = (i, p) => { capsuleAt(P, i, p, E); return [(E[0] + E[3]) / 2 / U, (E[1] + E[4]) / 2 / U, (E[2] + E[5]) / 2 / U]; };
  const headAt = p => { const c = mid(0, p), t = rayHit((c[0] - 40) * U, c[1] * U, c[2] * U, 1, 0, 0, 0, 0, 0, 0, false, 0, O, 'ak', 'ct', p); return t > 0 ? O.group : 0; };   // (from the side: the pitch moves the head along z and y)
  const h0 = mid(0, 0), h9 = mid(0, .9), st9 = mid(3, .9), moved = Math.hypot(h9[0] - h0[0], h9[1] - h0[1], h9[2] - h0[2]);
  const old = rayHit(-40 * U, h0[1] * U, h0[2] * U, 1, 0, 0, 0, 0, 0, 0, false, 0, O, 'ak', 'ct', .9) > 0 ? O.group : 0;
  check('…bends with the look\'s pitch: the head found where the pitch puts it (±0.45, ±0.9, ±1.2), not where it stood, the stomach unmoved', [-1.2, -.9, -.45, .45, .9, 1.2].every(p => headAt(p) === 1) && moved > 6 && old !== 1 && Math.abs(st9[1] - 38) < 1e-9 && Math.abs(st9[2]) < 1e-9, `head moved ${moved.toFixed(1)} HU at 0.9 rad; the old head point → group ${old}`);
  const ca = src('dist/cs2-agents.js'), m15 = mid(0, 1.5), m12 = mid(0, 1.2);
  check('…the pitch clamps at ±1.2 rad, a third on each spine bone, as the drawn chest (cs2-agents.js)', m15.every((v, k) => Math.abs(v - m12[k]) < 1e-12) && H.PITCH_MAX === 1.2 && ca.includes('Math.max(-1.2, Math.min(1.2, s.pitch || 0))') && ca.includes('pitch / 3'));
  // the bounding cylinder never drops a ray a brute-force pass would hit (and the nearest capsule is the one reported), at pitch 0 and bent
  let agree = 0; const N = 1800;
  for (let i = 0; i < N; i++) { const p = [0, .7, -1.1][i % 3], caps = Array.from({ length: P.n }, (_, k) => { capsuleAt(P, k, p, E); return [...E, P.caps[k * 8 + 6], P.caps[k * 8 + 7]]; });
    const a = rnd() * 6.283, o0 = [Math.cos(a) * 12, rnd() * 14 - 2, Math.sin(a) * 12], aim = [(rnd() - .5) * 5, rnd() * 11.5 - .5, (rnd() - .5) * 5], d = unit(aim[0] - o0[0], aim[1] - o0[1], aim[2] - o0[2]), t = rayHit(...o0, ...d, 0, 0, 0, 0, false, 0, O, 'ak', 'ct', p);
    let bt = -1, bg = 0; for (const c of caps) { const tt = segRay(...o0, ...d, c); if (tt > 0 && (bt < 0 || tt < bt)) { bt = tt; bg = c[7]; } }
    if ((t < 0 && bt < 0) || (t > 0 && bt > 0 && Math.abs(t - bt) < 4e-3 && O.group === bg)) agree++; }
  check('…the bounding cylinder and the capsule test equal a brute-force sampled test (1800 rays from all round; pitch 0, 0.7, −1.1)', agree >= N - 3, `${agree}/${N}`);
}
// a brute force: march the ray, the first sample inside the capsule (distance to segment < r)
function segRay(ox, oy, oz, dx, dy, dz, c) { const [ax, ay, az, bx, by, bz, r] = c; for (let t = 0; t < 26; t += .002) { const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t, ex = bx - ax, ey = by - ay, ez = bz - az, ee = ex * ex + ey * ey + ez * ez;
  const k = ee > 0 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey + (pz - az) * ez) / ee)) : 0, qx = px - ax - ex * k, qy = py - ay - ey * k, qz = pz - az - ez * k; if (qx * qx + qy * qy + qz * qz < r * r) return t === 0 ? -1 : t; } return -1; }

// 3. The zones: CS2's groups scored with our multipliers (head ×hs, stomach ×1.25, legs ×0.75, the rest ×1 and armoured)
check('hit group → damage zone: 1 head, 2 chest, 3 stomach, 4/5 arms → chest, 6/7 legs, 8 neck → chest', GROUP_ZONE.slice(1).join() === 'head,chest,stomach,chest,chest,legs,legs,chest');

// 4. The hold, knife and side rules: as cs2-agents.js setGun / weapon-models knifeFor / gd-soldiers.js sideOf
{ const ca = src('dist/cs2-agents.js'), kre = /KNIFE_ID = (\/[^\n]*?\/)[;,]/.exec(ca)?.[1], nades = /const NADE_IDS = new Set\((\[[^\]]*\])\)/.exec(ca)?.[1], mine = src('dist/gd-hitboxes.js');
  check('holdOf: cs2-agents\' own KNIFE_ID and grenade list (NADE_IDS)', !!kre && mine.includes('KNIFE_ID = ' + kre) && !!nades && mine.includes('NADES = ' + nades), kre + ' ' + nades);
  useHitboxes(fake);
  const want = [['ak', 'ak'], ['m4', 'ak'], [null, 'ak'], ['usps', 'pistol'], ['p250', 'pistol'], ['knife', 'knife'], ['karambit', 'knife'], ['butterfly', 'butterfly'], ['he', 'he'], ['decoy', 'he'], ['c4', 'ak']], got = want.map(([id]) => holdOf(id, 'ct'));
  check('holdOf: the file\'s pose per item; an item it does not name: a knife the side\'s knife, a grenade CS2\'s grenade hold, a pistol the pistol\'s, else the AK\'s', got.join() === want.map(w => w[1]).join() && holdOf('karambit', 't') === 'knife-t', got.join(' '));
  check('heldId: the chosen knife as drawn (when the file poses it), the T knife on a T, any other item as is', heldId('knife', 'butterfly', 'ct') === 'butterfly' && heldId('knife', 'butterfly', 't') === 'butterfly' && heldId('knife', null, 't') === 'knife-t' && heldId('knife', 'default', 'ct') === 'knife' && heldId('knife', 'm9', 'ct') === 'knife' && heldId('ak', 'butterfly', 'ct') === 'ak' && heldId(null) === null);
  globalThis.self ??= globalThis; const had = 'document' in globalThis; if (!had) globalThis.document = { createElement: () => ({ width: 64, height: 64, style: {}, getContext: () => new Proxy({}, { get: () => () => ({ data: new Uint8ClampedArray(4), width: 1, addColorStop() {} }) }), toDataURL: () => '' }), createElementNS: () => ({ style: {} }) };
  const { sideOf } = await import('../dist/gd-soldiers.js'); if (!had) delete globalThis.document;
  const names = Array.from({ length: 300 }, (_, i) => ['Bot ' + i, ' Player' + i, 'ÖZ' + i][i % 3]); let ok = 0;
  for (const n of names) for (const t of [null, 't', 'ct', 'spec']) if (bodySide(n, t) === sideOf(n, t)) ok++;
  check('bodySide = gd-soldiers sideOf (300 names × 4 teams)', ok === names.length * 4, `${ok}/${names.length * 4}`);
  const { teamOf } = await import('../dist/arena-defuse.js'), g = { combat: { d: { teams: { bob: 't', ann: 'ct' } } }, arena: { knives: { ann: 'butterfly' } } }, b = {};
  check('bodyFor: the team as arena-defuse teamOf reads it (else the deathmatch pick), the chosen knife, the pitch', ['Bob', ' ANN ', 'Zed'].every(n => bodyFor(g, n, 'ak', .3, b).side === bodySide(n, teamOf(g, n))) && bodyFor(g, ' Ann', 'knife', NaN, b).held === 'butterfly' && b.side === 'ct' && b.pitch === 0 && bodyFor(g, 'Bob', 'knife', .4, b).held === 'knife-t' && b.pitch === .4);
  const { POSE_IDS } = await import('../tools/import-cs2-sleeves.mjs'), { KNIFE_MODEL_RE } = await import('../dist/gd-knives.js'), ids = await POSE_IDS(), knives = ['knife', 'knife-t', 'karambit', 'butterfly', 'stiletto', 'm9', 'bayonet', 'skeleton', 'talon', 'flip', 'nomad'];
  check('the importer poses every gun, every knife model, every grenade, the bomb and the Zeus (holdOf\'s fallback is for newer items only)', ids[0] === 'ak' && WEAPON_IDS.every(i => ids.includes(i)) && knives.every(k => KNIFE_MODEL_RE.test(k) && ids.includes(k)) && ['he', 'flash', 'smoke', 'molotov', 'incendiary', 'decoy', 'c4', 'zeus'].every(i => ids.includes(i)), `${ids.length} items`); }

// 5. Host and shooter agree. The shooter's body comes from the one rule both call (bodyFor: lab.js shootTargets, checked
// below in its source; combat-logic traceShot), so a side, knife or pitch mix-up shows here: the T's arm is on the other
// side, the knives and the pitch move capsules. Then the moment: lag-comp rewinds the target's pitch and item.
{ const lab = src('dist/lab.js'), wp = src('dist/weapons.js'), mp = src('dist/multiplayer.js');
  const st = /function shootTargets\(\)\{[\s\S]*?return out;\}/.exec(lab)?.[0] || '';
  check('lab.js shootTargets builds the guest\'s body with bodyFor(g, name, the pose\'s weapon, the pitch multiplayer.js draws it with) and the drawn turn; weapons.js, traceRemote pass held / side / pitch',
    st.includes('turn:m.g.rotation.y') && st.includes('bodyFor(g,p.name,p.pose?.weapon,Number.isFinite(m.ipitch)?m.ipitch:+p.pose?.shot?.pitch,out[out.length-1])') && mp.includes('pitch:Number.isFinite(m.ipitch)?m.ipitch:m.csPitch') && mp.includes('m.csPitch=+p.pose.shot?.pitch||0')
    && wp.includes('tgt.held ?? tgt.weapon, tgt.side, tgt.pitch)') && lab.includes('rayHit(ex,ey,ez,d.x,d.y,d.z,f.x,f.y,f.z,tg.turn,!!tg.crouched,0,null,tg.held,tg.side,tg.pitch)') && !/rayBody\(ex,ey,ez/.test(lab));
  const cl = src('dist/combat-logic.js');
  check('combat-logic traceShot builds the target\'s body with bodyFor(game, who, the rewound item / pitch, else the live pose\'s)', cl.includes('bodyFor(game, who, to.hbWeapon || to.weapon, Number.isFinite(to.hbPitch) ? to.hbPitch : +to.shot?.pitch, TB)')); }
const { traceShot, poseFeet } = await import('../dist/combat-logic.js');
function agreement(label, minTried) {
  const wpn = weaponById('ak'), o = { zone: null, group: 0, box: -1 }, game = { mode: 'arena', combat: { d: { teams: { bob: 't', ann: 'ct' } } }, arena: { knives: { ann: 'butterfly' } } }, SB = [0, 0, 0], SD = [0, 0, 0], SO = new Float64Array(32), gb = {};
  let agree = 0, tried = 0, hostOnly = 0, wrongSide = 0;
  for (let i = 0; i < 900; i++) { const who = ['Bob', 'Ann', 'Zed'][i % 3], yaw = rnd() * 6.28, cr = rnd() < .3, to = { x: 3 + rnd() * 2, y: 9.8, z: -40 + rnd() * 2, yaw, crouched: cr, weapon: ['ak', 'usps', 'knife', 'he', 'negev', 'c4'][i % 6], shot: { pitch: (rnd() - .5) * 2.4 } }, eye = [0, 9.8, 0], fy = poseFeet(to);
    const fx = to.x, fz = to.z, ty = (rnd() * 70 + 2) * HU * (to.crouched ? .76 : 1), dx = fx - eye[0] + (rnd() - .5) * 3, dz = fz - eye[2] + (rnd() - .5) * 3, dy = fy + ty - eye[1], pitch = Math.atan2(dy, Math.hypot(dx, dz)), lookYaw = Math.atan2(-dx, -dz);
    const acc = accOf(wpn, false), ia = Math.min(acc.stand, acc.crouch) * 1.01, a = { eye, look: [pitch, lookYaw], pu: [0, 0], ia, n: i };   // (ia: at least the host's floor, so both use the same spread)
    let host = null; try { host = traceShot(game, wpn, a, i, null, to, who).hits[0].zone; } catch { host = null; }
    shotBase(pitch, lookYaw, 0, 0, SB); shotOffsets(wpn, i, ia, acc.spread, SO); offsetDir(SB, SO[0], SO[1], SD);
    bodyFor(game, who, to.weapon, to.shot.pitch, gb);   // (the guest: lab.js shootTargets' call)
    const t0 = rayHit(eye[0], eye[1], eye[2], SD[0], SD[1], SD[2], fx, fy, fz, yaw, to.crouched, 0, o, gb.held, gb.side, gb.pitch), t = SD[1] < -1e-6 && -eye[1] / SD[1] < t0 ? -1 : t0, guest = t > 0 ? o.zone : null, gGroup = o.group;   // (the floor first, as weapons.js' own trace: an ankle below the floor plane is not hit)
    const tw = rayHit(eye[0], eye[1], eye[2], SD[0], SD[1], SD[2], fx, fy, fz, yaw, to.crouched, 0, o, gb.held, gb.side === 't' ? 'ct' : 't', gb.pitch), other = tw > 0 ? o.group : 0;
    if (guest) { tried++; if (host === guest) agree++; else if (process.env.HB_DEBUG) console.log('disagree', who, to.weapon, to.crouched, to.shot.pitch.toFixed(2), 'host', host, 'guest', guest, gGroup, 't', t.toFixed(3), 'SD', SD.map(v => v.toFixed(3)).join(','), 'floor', (SD[1] < 0 ? -eye[1] / SD[1] : Infinity).toFixed(3)); if (other !== gGroup) wrongSide++; } else if (host) hostOnly++; }
  check(`host traceShot = the shooter's own rayHit (${label}): the same zone for every predicted hit (900 shots, T / CT / deathmatch, 6 items, any turn and pitch)`, tried > minTried && agree === tried, `${agree}/${tried} agree; ${hostOnly} more only within the host's pad; the other side's agent would differ on ${wrongSide}`);
}
useHitboxes(fake); agreement('made-up set', 150);
{ const { createPoseHistory, rewound } = await import('../dist/lag-comp.js'), h = createPoseHistory(), P0 = { x: 1, y: 9.8, z: 1, yaw: 0, crouched: false, weapon: 'ak', shot: { pitch: 0 } }, P1 = { ...P0, weapon: 'knife', shot: { pitch: .9 } };
  h.record('b', 1000, P0); h.record('b', 1100, P1); const roster = [{ id: 'b', name: 'Bob', pose: P1 }];
  const r0 = rewound(h, roster, { type: 'hit', target: 'b', seen: 1000 }, 'x')[0].pose, r5 = rewound(h, roster, { type: 'hit', target: 'b', seen: 1050 }, 'x')[0].pose, r8 = rewound(h, roster, { type: 'hit', target: 'b', seen: 1080 }, 'x')[0].pose;
  check('lag-comp rewinds the target\'s look pitch and item to the moment seen (pose.weapon stays the live one)', r0.hbPitch === 0 && r0.hbWeapon === 'ak' && r0.weapon === 'knife' && Math.abs(r5.hbPitch - .45) < 1e-9 && r8.hbWeapon === 'knife', `${r0.hbPitch}/${r0.hbWeapon} ${r5.hbPitch}/${r5.hbWeapon} ${r8.hbWeapon}`); }

// 6. Cost and allocation: one ray against a body (the bounding cylinder first), bent and not, against rayBody's. Run in
// a fresh Node with only gd-hitboxes.js loaded: with three.js and the game's modules loaded first (above) V8 inlines
// differently, and the doubles a caller passes to — and gets back from — a call it does not inline are boxed by the
// CALLER (16 bytes each), which is not rayHit's own allocation. (An object a ray inside rayHit would be 16+ bytes a
// ray in any process.)
{ const kid = `
const H = await import(${JSON.stringify(new URL('../dist/gd-hitboxes.js', import.meta.url).href)}), W = await import(${JSON.stringify(new URL('../dist/weapons-data.js', import.meta.url).href)});
H.useHitboxes(${JSON.stringify(fake)}); let seed = 777; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
const o = { zone: null, group: 0, box: -1 }, R = new Float64Array(6 * 4096), PI = new Float64Array(8); for (let i = 0; i < 8; i++) PI[i] = i * .1 - .35;
for (let i = 0; i < 4096; i++) { let x = rnd() * 2 - 1, y = rnd() * .3 - .15, z = rnd() * 2 - 1; const l = Math.hypot(x, y, z); R[i * 6] = rnd() * 20 - 10; R[i * 6 + 1] = rnd() * 3 + 7; R[i * 6 + 2] = rnd() * 20 - 10; R[i * 6 + 3] = x / l; R[i * 6 + 4] = y / l; R[i * 6 + 5] = z / l; }
const runHit = n => { let h = 0; for (let i = 0; i < n; i++) { const k = (i & 4095) * 6; if (H.rayHit(R[k], R[k + 1], R[k + 2], R[k + 3], R[k + 4], R[k + 5], 0, 0, 0, .7, false, .35, o, 'ak', 'ct', PI[i & 7]) > 0) h++; } return h; };
const runBody = n => { let h = 0; for (let i = 0; i < n; i++) { const k = (i & 4095) * 6; if (W.rayBody(R[k], R[k + 1], R[k + 2], R[k + 3], R[k + 4], R[k + 5], 0, 0, 0, false, .35, o) > 0) h++; } return h; };
runHit(1e6); runBody(2e5);
let grow = Infinity, hits = 0; for (let k = 0; k < 3; k++) { gc(); const m0 = process.memoryUsage().heapUsed; hits = runHit(1e6); grow = Math.min(grow, process.memoryUsage().heapUsed - m0); }
let t0 = process.hrtime.bigint(); runHit(1e6); const nsHit = Number(process.hrtime.bigint() - t0) / 1e6; t0 = process.hrtime.bigint(); runBody(1e6); const nsBody = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(JSON.stringify({ grow, hits, nsHit, nsBody }));`;
  let r = null; try { r = JSON.parse(execFileSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', kid], { encoding: 'utf8' }).trim().split('\n').pop()); } catch (e) { console.log(String(e.stdout || e.message).slice(0, 400)); }
  // (the distance a hit returns is a double: when the caller does not inline rayHit V8 boxes it, 16 bytes a HIT — checked:
  // returning 1 instead leaves 0.66 bytes a ray, the heap's noise. A miss returns −1, a small integer: nothing.)
  check('rayHit: no allocation per ray (heap growth over 1e6 rays under 1 byte a ray beyond the returned distance\'s 16-byte box a hit; the least of 3 passes, gd-hitboxes alone — one object a ray would be 16+ every ray)', !!r && r.grow < 1e6 + r.hits * 16, r ? `${(r.grow / 1024).toFixed(1)} KB, ${r.hits} hits: ${((r.grow - r.hits * 16) / 1e6).toFixed(2)} bytes a ray beyond them` : 'the measuring Node failed');
  check('rayHit cost per ray (7 capsules, bent by a pitch) under 2 µs', !!r && r.nsHit < 2000, r ? `${r.nsHit.toFixed(0)} ns a ray · rayBody ${r.nsBody.toFixed(0)} ns` : ''); }

// ── Part 2: the imported file (CS2's own numbers, local only) ──
const root = new URL('..', import.meta.url).pathname, assets = path.join(root, 'user-assets'), man = existsSync(path.join(assets, 'manifest.json')) ? JSON.parse(readFileSync(path.join(assets, 'manifest.json'), 'utf8')) : null;
const file = man?.models?.agents && man?.models?.hitboxes?.file && path.join(assets, man.models.hitboxes.file);
if (!file || !existsSync(file)) { console.log(`SKIP (CS2 hit boxes): none imported on this computer (tools/import-cs2-sleeves.mjs) · ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
const J = JSON.parse(readFileSync(file, 'utf8'));
if (J.version !== 2) { check('the imported file is version 2 (per-item holds and the pitch: re-run tools/import-cs2-sleeves.mjs --hitboxes-only)', false, 'version ' + J.version); process.exit(1); }
check('the file installs', useHitboxes(J) === true, H.hitboxInfo()?.count + ' capsules, ' + H.hitboxInfo()?.poses + ' holds (both sides)');
const raw = J.raw.ct.boxes;
check('the set: 19 capsules (m_nShapeType 2), hit groups 1–8 each present, every box on its own bone; the T agent\'s set the same', raw.length === 19 && raw.every(b => b.shape === 2) && [1, 2, 3, 4, 5, 6, 7, 8].every(g => raw.some(b => b.group === g)) && new Set(raw.map(b => b.bone)).size === 19 && JSON.stringify(J.raw.t.boxes) === JSON.stringify(raw), raw.map(b => b.name + ':' + b.group).join(' '));
check('the set is the same in every agent read', J.differIn.length === 0 && J.sameIn.length >= 2, J.sameIn.join(', '));
// against the model data: the raw set re-read from the vmdl now (when this computer has the CS2 install)
{ const CS2 = path.join(os.homedir(), 'CS2-extract'), VPK = path.join(CS2, 'game/game/csgo/pak01_dir.vpk'), S2V = path.join(CS2, 'tools/s2v/Source2Viewer-CLI');
  if (existsSync(VPK) && existsSync(S2V)) { const { hitboxSetOf, vmdlOf } = await import('../tools/import-cs2-sleeves.mjs');
    for (const side of ['ct', 't']) { const tmp = path.join(os.tmpdir(), `gd-hb-test-${process.pid}-${side}.vmdl_c`);
      execFileSync(S2V, ['-i', VPK, '-f', vmdlOf(J.agents[side]), '-o', tmp], { stdio: 'ignore' }); const s = hitboxSetOf(execFileSync(S2V, ['-i', tmp, '-b', 'MDAT'], { encoding: 'utf8', maxBuffer: 256 << 20 }), J.agents[side]);
      check(`the file's raw ${side} set = ${J.agents[side]}.vmdl's m_hitboxsets read again now (bones, end points, radii, groups)`, JSON.stringify(s.boxes) === JSON.stringify(J.raw[side].boxes), `${s.boxes.length} boxes, ${s.blocks} MDAT blocks`);
      try { execFileSync('rm', ['-f', tmp]); } catch {} } }
  else console.log('SKIP (vmdl re-read): no CS2 install here'); }
// the bind pose: each capsule hung on the agent glb's bone (no animation) equals the vmdl's own m_invBindPose⁻¹ · end point
const { nodeAgents, hangBoxes, poseAll, poseOne } = await import('../tools/import-cs2-sleeves.mjs'), NA = await nodeAgents(assets), THREE = NA.THREE;
{ const { gltfLoader } = await import('../dist/gltf-loader.js'), b = readFileSync(path.join(assets, man.models.agents.ct.file)), g = await new Promise((res, rej) => gltfLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej));
  const UU = 2.54 / 16.5, agent = { g: new THREE.Group() }; agent.g.add(g.scene); g.scene.scale.setScalar(1 / .0254 * UU);   // (metres → game units: hangBoxes' frame)
  const bind = hangBoxes(THREE, agent, raw), inv = J.raw.ct.bind; let worst = 0, M = null;
  // CS2's model space (z up) → the glb's (y up): found from the pelvis, then held for all 38 end points
  const cs = (bx, p) => { const m = inv[bx.bone], R = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]], t = [m[3], m[7], m[11]], q = [p[0] - t[0], p[1] - t[1], p[2] - t[2]]; return [0, 1, 2].map(c => R[0][c] * q[0] + R[1][c] * q[1] + R[2][c] * q[2]); };   // (m_invBindPose: 3×4 rows, model → bone; its inverse)
  const maps = [[1, 2, 0, 1, 1, 1], [1, 2, 0, -1, 1, -1], [1, 2, 0, -1, 1, 1], [1, 2, 0, 1, 1, -1]];
  for (const [ix, iy, iz, sx, sy, sz] of maps) { let w = 0; raw.forEach((bx, i) => { for (const [o, e] of [[0, bx.a], [3, bx.b]]) { const p = cs(bx, e), q = [sx * p[ix], sy * p[iy], sz * p[iz]]; w = Math.max(w, Math.hypot(q[0] - bind[i][o], q[1] - bind[i][o + 1], q[2] - bind[i][o + 2])); } }); if (!M || w < worst) { worst = w; M = [ix, iy, iz, sx, sy, sz]; } }
  check('bind pose: every capsule end on the agent glb\'s bone = the vmdl\'s m_invBindPose⁻¹ · its end point (≤ 0.05 HU, one axis change for all)', worst < .05, `worst ${worst.toFixed(4)} HU`); }
// the file names every item the importer poses; each item's pose re-made now from the agents and clips (both sides)
const SOME = ['ak', 'pistol', 'usps', 'negev', 'ssg08', 'c4', 'knife', 'knife-t', 'butterfly', 'he', 'molotov'];
{ const { POSE_IDS } = await import('../tools/import-cs2-sleeves.mjs'), all = await POSE_IDS();
  check('the file names every item the importer poses, on both sides', ['ct', 't'].every(s => all.every(i => Object.hasOwn(J.sides[s].ids, i))), `${Object.keys(J.sides.ct.ids).length} items · ${Object.keys(J.sides.ct.poses).length} / ${Object.keys(J.sides.t.poses).length} distinct holds`);
  let worst = 0; for (const side of ['ct', 't']) { const again = await poseAll(THREE, NA.CA, side, J.raw[side].boxes, SOME);
    for (const id of SOME) for (const st of ['stand', 'crouch']) { const f = J.sides[side].poses[J.sides[side].ids[id]][st], a = again.poses[again.ids[id]][st];
      f.caps.forEach((c, i) => { for (let k = 0; k < 6; k++) worst = Math.max(worst, Math.abs(c[k] - a.caps[i][k])); }); for (let k = 0; k < 9; k++) worst = Math.max(worst, Math.abs(f.piv[k] - a.piv[k])); } }
  check(`each item's capsules and spine pivots re-made from the agents and clips match the file (${SOME.length} items × 2 sides × standing / crouched, ≤ 0.01 HU)`, worst <= .01, `worst ${worst.toFixed(4)} HU`);
  const gap = (s, a, b) => Math.max(...J.sides[s].poses[J.sides[s].ids[a]].stand.caps.flatMap((c, i) => [0, 3].map(e => Math.hypot(...[0, 1, 2].map(k => c[e + k] - J.sides[s].poses[J.sides[s].ids[b]].stand.caps[i][e + k])))));
  check('…and the holds really differ where cs2-agents draws them differently (the T Glock vs the USP-S, the T bomb vs the grenade, the Negev vs the AK: some capsule end > 2 HU apart)', gap('t', 'pistol', 'usps') > 2 && gap('t', 'c4', 'he') > 2 && gap('ct', 'negev', 'ak') > 2, `${gap('t', 'pistol', 'usps').toFixed(1)} ${gap('t', 'c4', 'he').toFixed(1)} ${gap('ct', 'negev', 'ak').toFixed(1)} HU`); }
// the pitch: the agent posed at that pitch (cs2-agents' own bend) vs the file's pose bent by gd-hitboxes (capsuleAt)
{ let worst = 0, n = 0; const E = new Float64Array(6);
  for (const [side, id] of [['ct', 'ak'], ['t', 'pistol'], ['ct', 'knife'], ['t', 'c4']]) for (const cr of [0, 1]) for (const p of [-1.0, -.6, -.3, .3, .6, 1.2]) {
    const drawn = poseOne(THREE, NA.CA, side, J.raw[side].boxes, id, cr, weaponById, p), P = hitboxPose(id, !!cr, side);
    for (let i = 0; i < P.n; i++) { capsuleAt(P, i, p, E); for (let k = 0; k < 6; k++) worst = Math.max(worst, Math.abs(E[k] / HU - drawn.caps[i][k])); } n++; }
  check(`the look's pitch: the capsules bent by gd-hitboxes = the agent drawn at that pitch (${n} poses: 4 items, both sides, standing / crouched, −1.0 … +1.2 rad; ≤ 0.05 HU)`, worst <= .05, `worst ${worst.toFixed(4)} HU`); }
// a ray through the drawn head of an agent looking 0.6 rad up or down is a head shot (the reviewers' case: ~10.7 HU off before)
{ const o = { zone: null, group: 0, box: -1 }, res = [], hi = raw.findIndex(b => b.name === 'head_0');
  for (const side of ['ct', 't']) for (const p of [-.6, .6]) { const id = side === 't' ? 'ak' : 'm4', drawn = poseOne(THREE, NA.CA, side, J.raw[side].boxes, id, 0, weaponById, p), h = drawn.caps[hi], c = [(h[0] + h[3]) / 2, (h[1] + h[4]) / 2, (h[2] + h[5]) / 2];
    // a ray at the drawn head's centre from the first of 26 directions that reaches it unblocked (in front of the face
    // the gun and hands come first, as in CS2; behind a lowered head the back): the head; the same ray unbent: not
    const dirs = []; for (let a = 0; a < 8; a++) for (const el of [0, .7, -.7]) dirs.push(unit(Math.cos(a * Math.PI / 4), el, Math.sin(a * Math.PI / 4))); dirs.push([0, -1, 0], [0, 1, 0]);
    let bent = 0, flat = 0, seg = Infinity; for (const d of dirs) { if (rayHit((c[0] - d[0] * 40) * HU, (c[1] - d[1] * 40) * HU, (c[2] - d[2] * 40) * HU, ...d, 0, 0, 0, 0, false, 0, o, id, side, p) > 0 && o.box === hi) { bent = 1; flat = rayHit((c[0] - d[0] * 40) * HU, (c[1] - d[1] * 40) * HU, (c[2] - d[2] * 40) * HU, ...d, 0, 0, 0, 0, false, 0, o, id, side, 0) > 0 ? o.group : 0; break; } }
    { const P = hitboxPose(id, false, side), k = hi * 8, A = [0, 1, 2].map(j => P.caps[k + j] / HU), B = [0, 1, 2].map(j => P.caps[k + 3 + j] / HU), e = B.map((v, j) => v - A[j]), ee = e.reduce((s2, v) => s2 + v * v, 0), w = Math.max(0, Math.min(1, c.reduce((s2, v, j) => s2 + (v - A[j]) * e[j], 0) / ee)); seg = Math.hypot(...c.map((v, j) => v - A[j] - e[j] * w)); }
    res.push(`${side}${p}: ${bent ? 'head' : 'MISS'} (unbent ${flat || 'miss'}, centre ${seg.toFixed(1)} HU from the unbent head's axis, r ${raw[hi].r})`); if (!bent || seg <= raw[hi].r) res.ok = false; }
  check('a ray at the drawn head of an agent looking 0.6 rad down or up → head (group 1), on both sides; that centre lies outside the unbent head capsule', res.ok !== false, res.join(' · ')); }
{ const tops = SOME.map(id => [false, true].map(cr => { const P = J.sides.ct.poses[J.sides.ct.ids[id]][cr ? 'crouch' : 'stand']; return Math.max(...P.caps.flatMap(c => [c[1] + c[6], c[4] + c[6]])); })), feet = Math.min(...J.sides.ct.poses.ak.stand.caps.flatMap(c => [c[1] - c[6], c[4] - c[6]]));
  check('standing the head\'s top within 3 HU of CS2\'s 72 HU hull, crouched of its 54 HU hull; the feet at the floor', tops.every(([s, c]) => Math.abs(s - 72) < 3 && Math.abs(c - 54) < 3) && Math.abs(feet) < 3, tops.map(t => t.map(x => x.toFixed(1)).join('/')).join(' ') + ` · feet ${feet.toFixed(1)}`); }
// every CS2 hit group reached by a ray at its own capsule (from one of 8 directions), standing and crouched, both sides
{ const o = { zone: null, group: 0, box: -1 }; let missing = [], tried = 0;
  for (const side of ['ct', 't']) for (const id of ['ak', 'pistol', 'knife', 'he', 'c4']) for (const cr of [false, true]) { const P = hitboxPose(id, cr, side); for (let i = 0; i < P.n; i++) { const C = P.caps, k = i * 8, cx = (C[k] + C[k + 3]) / 2, cy = (C[k + 1] + C[k + 4]) / 2, cz = (C[k + 2] + C[k + 5]) / 2; let got = false; tried++;
    for (let a = 0; a < 8 && !got; a++) for (const el of [0, .6, -.6]) { const d = unit(Math.cos(a * Math.PI / 4), el, Math.sin(a * Math.PI / 4)), t = rayHit(cx - d[0] * 20, cy - d[1] * 20, cz - d[2] * 20, ...d, 0, 0, 0, 0, cr, 0, o, id, side); if (t > 0 && o.box === i) { got = true; break; } }
    if (!got) missing.push(`${side}/${id}${cr ? '/c' : ''}:${raw[i].name}`); } }
  check('each of the 19 capsules is the first one hit by a ray at its centre from some side (5 items × both sides × standing / crouched)', !missing.length, missing.join(' ') || `${tried} of ${tried}`); }
// the head from the front, the chest from behind, the legs from the side: CS2's groups → our zones
{ const o = { zone: null, group: 0, box: -1 }, P = hitboxPose('ak', false, 'ct'), C = P.caps, mid = n => { const i = raw.findIndex(b => b.name === n), k = i * 8; return [(C[k] + C[k + 3]) / 2, (C[k + 1] + C[k + 4]) / 2, (C[k + 2] + C[k + 5]) / 2]; };
  const shot = (p, d) => { const t = rayHit(p[0] - d[0] * 30, p[1] - d[1] * 30, p[2] - d[2] * 30, ...d, 0, 0, 0, 0, false, 0, o, 'ak'); return t > 0 ? o.zone + '/' + o.group : '-'; };
  const r = [shot(mid('head_0'), [0, 0, 1]), shot(mid('spine_2'), [0, 0, -1]), shot(mid('pelvis'), [0, 0, -1]), shot(mid('leg_lower_l'), [1, 0, 0]), shot(mid('leg_lower_r'), [-1, 0, 0])];
  check('rifle, standing: head from the front → head/1; chest and stomach from behind → chest/2, stomach/3; shins from the side → legs/6, legs/7', r.join(' ') === 'head/1 chest/2 stomach/3 legs/6 legs/7', r.join(' ')); }
// host = guest on CS2's own set (both sides, deathmatch, the items and pitches above)
agreement('CS2\'s set', 150);
// the cost with CS2's 19 capsules (the host traces every pellet of every hit against one body: a Nova's 9 pellets = 9 rays), bent by a pitch
{ const o = { zone: null, group: 0, box: -1 }; let h = 0; const t0 = process.hrtime.bigint(), n = 1e6;
  for (let i = 0; i < n; i++) { const a = (i * 2.399963) % 6.283, el = ((i * .618034) % 1 - .5) * .6, d0 = Math.cos(el); if (rayHit(Math.cos(a) * 15, 7 - Math.sin(el) * 15, Math.sin(a) * 15, -Math.cos(a) * d0, Math.sin(el), -Math.sin(a) * d0, 0, 0, 0, .3, false, .35, o, 'ak', 'ct', (i & 7) * .1 - .35) > 0) h++; }
  const ns = Number(process.hrtime.bigint() - t0) / n; check('CS2\'s 19 capsules: a ray at the body costs under 3 µs (cylinder first, then the capsules; bent by a pitch)', ns < 3000, `${ns.toFixed(0)} ns a ray, ${(h / n * 100).toFixed(0)}% hit — a 10-player round's hits are a few hundred rays a second: < 1 ms`); }
console.log(`${fail ? 'FAIL' : 'PASS'}: gd-hitboxes · ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
