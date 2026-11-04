// Global Defensive · tagging by the attacker's weapon (v53 HITS, H3 / mv-tagging-per-weapon): dist/combat-logic.js
// flinchTag / hitTag and the host's small new fields on a hit (hitMarks: w the attacker's weapon, ar body armour met; hx an
// HE's count per victim). Being hit slows you (arena-move.js tag → velMod, back by 0.4 a second); how much is the
// attacker's gun's weapons.vdata m_flFlinchVelocityModifierLarge / Small (weapons-data.js flinch):
//  · the rule (CS:GO's, UNVERIFIED for CS2 — its code is not in the install): the first hit while velMod ≈ 1 → Large;
//    a hit while still slowed → min(velMod, velMod × Small);
//  · the AK 0.4 then 0.4 × 0.55; the AWP 0.35 (then × 0.4); the M4A1-S 0.4 / 0.4; a knife 0.3 (weapon_knife); an HE 0.3
//    (weapon_hegrenade, then × 0.1); every SMG's vdata 0.0 / 0.0 is read as "no value": our TAG_FALLBACK 0.5 (labelled);
//  · your newest record is used once (seen.i), an HE by its host-clock stamp (seen.hx; old ones are no news); none: null (the caller's own rule);
//  · the records' new fields are small (w ≤ 16 characters, ar 1) and only in Global Defensive; lan/room.mjs relays the
//    combat state whole (no field list to add them to);
//  · the duck eye: 46.045 HU (arena-move.js EYE_GD.duck, the GUNS package's).
//   node tests/gd-tagging.mjs
import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0; const ok = (c, m) => { assert(c, m); n++; if (process.env.V) console.log('  ok ' + m); };
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
const CL = await import('../dist/combat-logic.js');
const { weaponById, HU } = await import('../dist/weapons-data.js');
const { EYE_GD, TAG, createMoveState, tag } = await import('../dist/arena-move.js');
const { flinchTag, hitTag, FLINCH_HE, FLINCH_KNIFE, TAG_FALLBACK, HIT_FRESH, applyHit, bleed, poseFeet } = CL;

// ── the rule, weapon by weapon (weapons.vdata via weapons-data.js) ──
const fl = id => weaponById(id).flinch;
ok(fl('ak').join() === '0.4,0.55' && fl('sniper').join() === '0.35,0.4' && fl('m4s').join() === '0.4,0.4' && fl('mac10').join() === '0,0', 'weapons.vdata: AK .4 / .55, AWP .35 / .4, M4A1-S .4 / .4, MAC-10 0 / 0');
ok(near(flinchTag(1, fl('ak')), .4) && near(flinchTag(.4, fl('ak')), .4 * .55), 'the AK: .4 on the first hit, then .4 × .55');
ok(near(flinchTag(1, fl('sniper')), .35) && near(flinchTag(.35, fl('sniper')), .35 * .4), 'the AWP: .35 (then × .4)');
ok(near(flinchTag(1, fl('m4s')), .4) && near(flinchTag(.4, fl('m4s')), .16), 'the M4A1-S: .4 / .4');
for (const id of ['mac10', 'mp9', 'mp7', 'smg', 'bizon', 'ump45', 'p90']) ok(near(flinchTag(1, fl(id)), TAG_FALLBACK) && TAG_FALLBACK === .5 && TAG.hit === .5, `${id}: vdata 0 / 0 — "no value", the fallback .5 (labelled)`);
ok(FLINCH_HE.join() === '0.3,0.1' && near(flinchTag(1, FLINCH_HE), .3) && near(flinchTag(.3, FLINCH_HE), .03), 'an HE: .3 (weapon_hegrenade), then × .1');
ok(FLINCH_KNIFE.join() === '0.3,0.3' && near(flinchTag(1, FLINCH_KNIFE), .3), 'a knife: .3 (weapon_knife)');
ok(flinchTag(.2, fl('ak')) <= .2 && flinchTag(.995, fl('ak')) < .995, 'never faster than you already are');
ok(TAG.recover === .4, 'the recovery stays .4 a second (CS:GO\'s; not in CS2\'s files)');

// ── the host's records and hitTag (what lab.js onHurt calls) ──
const now = Date.now(), g = { mode: 'arena', combat: { hp: { ann: 100, cy: 100 }, down: {}, kills: {}, deaths: {}, feed: [], armor: { ann: { kevlar: 100, helmet: true } } } };
const r1 = applyHit(g, 'Cy', 'Ann', weaponById('ak'), 'chest', 100, 1, now);
ok(r1.w === 'ak' && r1.ar === 1 && r1.sk === 'cy', 'the hit result: w (the attacker\'s gun) and ar (kevlar met on the chest)');
const b1 = bleed(g, 'Ann', r1, 0, 10, 0, 0, 0, -1, now);
ok(b1.w === 'ak' && b1.ar === 1 && b1.s === 'cy', 'the blood record carries w and ar');
const seen = { d: 0 }, mv = createMoveState(); mv.velMod = 1;
const t1 = hitTag(g, 'Ann', mv.velMod, seen); tag(mv, t1); ok(near(t1, .4) && near(mv.velMod, .4), 'your first AK hit: velMod .4');
ok(hitTag(g, 'Ann', mv.velMod, seen) === null, 'the same record is used once');
const r2 = applyHit(g, 'Cy', 'Ann', weaponById('ak'), 'stomach', 100, 1, now + 100); bleed(g, 'Ann', r2, 0, 10, 0, 0, 0, -1, now + 100);
const t2 = hitTag(g, 'Ann', mv.velMod, seen); tag(mv, t2); ok(near(t2, .4 * .55) && near(mv.velMod, .22), 'a second AK hit while slowed: .4 × .55');
const r3 = applyHit(g, 'Cy', 'Ann', weaponById('mp9'), 'legs', 100, 1, now + 200); bleed(g, 'Ann', r3, 0, 3, 0, 0, 0, -1, now + 200);
ok(near(hitTag(g, 'Ann', 1, seen), .5), 'an SMG\'s hit: the .5 fallback');
// an HE: no blood record — its count on hx
const before = hitTag(g, 'Ann', 1, seen); applyHit(g, 'Cy', 'Ann', { id: 'he', name: 'HE Grenade', ap: .6 }, 'chest', 50, 1, now + 300, 40);
ok(before === null && g.combat.hx?.ann === now + 300 && near(hitTag(g, 'Ann', 1, seen, now + 310), .3) && hitTag(g, 'Ann', 1, seen, now + 320) === null, 'an HE: stamped on hx (the host\'s clock), .3 once');
// a knife
{ g.combat.hp.ann = 100; delete g.combat.down.ann; const rk = applyHit(g, 'Cy', 'Ann', weaponById('knife'), 'chest', 0, 1, now + 400, 40); bleed(g, 'Ann', rk, 0, 10, 0, 0, 0, -1, now + 400, true); ok(near(hitTag(g, 'Ann', 1, seen), .3), 'a knife: .3'); }
// (v53 HITS final) a page that just joined (fresh seen) never takes an old HE stamp or an old record; an HE and a bullet in
// one HP drop: both, and the HE is not read again by the next, unrelated hurt
{ const s2 = {}; ok(hitTag(g, 'Ann', 1, s2, now + 400 + HIT_FRESH + 1) === null && s2.hx === now + 300, 'a fresh page: the HE stamp from earlier is old news (and remembered)');
  g.combat.hp.ann = 100; delete g.combat.down.ann; const r5 = applyHit(g, 'Cy', 'Ann', weaponById('ak'), 'chest', 100, 1, now + 5000); bleed(g, 'Ann', r5, 0, 10, 0, 0, 0, -1, now + 5000); applyHit(g, 'Cy', 'Ann', { id: 'he', name: 'HE Grenade', ap: .6 }, 'chest', 50, 1, now + 5000, 20);
  const both = hitTag(g, 'Ann', 1, s2, now + 5010); ok(near(both, .4 * .1), `a bullet and an HE in one drop: the AK's .4, then the HE's Small .1 (${both?.toFixed(3)})`);
  ok(hitTag(g, 'Ann', 1, s2, now + 5020) === null, 'the next unrelated hurt (fall, the bomb): null — the caller\'s own rule, not the HE again'); }
// nothing of yours: null (fall damage, the bomb, fire keep the caller's rule)
ok(hitTag({ mode: 'arena', combat: { bl: [] } }, 'Ann', 1, {}) === null, 'no record of yours: null (the caller\'s rule)');
// other modes: no new fields
{ const gp = { mode: 'payday', combat: { hp: { a: 100, b: 100 }, down: {}, kills: {}, deaths: {}, feed: [], armor: { b: { kevlar: 100 } } } }; const r = applyHit(gp, 'A', 'B', weaponById('ak'), 'chest', 100);
  ok(!('w' in r) && !('ar' in r) && !('sk' in r) && !gp.combat.hx, 'other modes: the hit result as before (no w, ar, hx)'); }
// sizes
{ const { w, ar, ...rest } = b1, extra = JSON.stringify(b1).length - JSON.stringify(rest).length; ok(extra <= 24 && String(w).length <= 16 && ar === 1, `the record grows by ${extra} bytes (w, ar) — the gun's id ≤ 16 characters`); }
// the room relays the combat state whole: nothing to add there
{ const room = readFileSync(path.join(root, 'lan/room.mjs'), 'utf8'); ok(/const gdFrame=\(g,[^)]*\)=>\{const f=\{\.\.\.g\.combat,/.test(room) && /broadcast\('combat',game\.combat\)/.test(room) && !/\bbl\s*:\s*[^,}]*\.map\(/.test(room), 'lan/room.mjs sends combat (bl included) whole — no field list to filter w / ar'); }
// the duck eye (combat-logic.js poseFeet) as the movement's
ok(near(EYE_GD.duck, 46.045 * HU, 1e-12) && near(poseFeet({ y: 20, crouched: true }), 20 - 46.045 * HU, 1e-9), 'a crouched body\'s feet: the eye less 46.045 HU (arena-move.js EYE_GD.duck)');
// lab.js: the onHurt line asks hitTag
{ const lab = readFileSync(path.join(root, 'dist/lab.js'), 'utf8'), line = lab.split('\n').find(l => l.includes('onHurt:(seen=>'));
  ok(!!line && /HT\.f=m\.hitTag/.test(line) && /tag\(am,ht\?\?undefined\)/.test(line), 'lab.js onHurt: the hit\'s tag from hitTag (the weapon\'s flinch), else the old .5'); }
console.log(`PASS: gd-tagging · ${n} checks (weapons.vdata flinch by the attacker's weapon: AK .4 → .22, AWP .35, M4A1-S .4 / .4, SMGs .5 fallback, HE .3, knife .3; once per record; w / ar small and GD only; the room relays them; duck eye 46.045 HU)`);
