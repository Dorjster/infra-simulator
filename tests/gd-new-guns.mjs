// v53 GUNS8: CS2's eight guns the game lacked (Zeus x27, P2000, Dual Berettas, R8 Revolver, MAG-7, Sawed-Off, SCAR-20,
// G3SG1) and CS2's 5 loadout slots, on the host and through the real weapons.js on a fake clock.
//  · NUMBERS: each gun's price, kill award, damage, armour ratio, range modifier, range, cycle time, magazine, reserve,
//    speed, deploy, recoil seed, pellets, zoom FOVs equal weapons.vdata — the values read from the user's install
//    (2026-11-05, written here), and read again from the importer's cache when this computer has the install.
//  · TEAMS (items_game used_by_classes) and CS2's flexible LOADOUT (items_game flexible_loadout_slot / _default / _group:
//    the starting pistol s0, then 4 pistols, 5 Mid-Tier and 5 rifles, any gun of the category in any slot, the file's
//    defaults; checked against the install's items_game.txt when this computer has it). The host sells a player who
//    sent a loadout only its guns, keeps it across a rematch; the starting pistol follows slot s0.
//  · ZEUS: $200 in Defuse, after the knife in the arsenal, one charge (fired, it leaves the loadout), kills through a
//    helmet at arm's length, nothing past its 120 HU m_flRange.
//  · R8: the primary waits REVOLVER.prepMs for the hammer (let go before: no shot); the secondary fans at once and then
//    every 0.4 s (m_flCycleTime[1]); the host accepts the fan's rate.
//  · SHELLS: the Sawed-Off loads shell by shell at CS2's intro / loop; the MAG-7 (m_bReloadsSingleShells false) seats a
//    magazine; the first-person clip sounds repeat once per shell (fp-sounds shellSchedule, open-B#14).
//  · SOUNDS (G9–G11): each scoped gun's own zoom events (WEAPON_SOUND_ZOOM_IN/OUT), Default.NearlyEmpty, the Negev's
//    m_flInaccuracyPitchShift −50 / threshold 0.02 → Weapon_Negev.SingleFocused.
//   node tests/gd-new-guns.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path'; import { homedir } from 'node:os';
let T = 1000; globalThis.performance = { now: () => T, mark() {}, measure() {}, getEntriesByName: () => [] };
const THREE = await import('../dist/three.module.js');
const { createWeapons } = await import('../dist/weapons.js');
const W = await import('../dist/weapons-data.js');
const { weaponById, HU, LOADOUT_KEYS, LOADOUT_DEFAULT, CS2_LOADOUT_DEFAULT, slotChoices, withSlot, cleanSlots, slotGun, slotRefusal, defaultPistol, REVOLVER, ZEUS, WEAPONS } = W;
const { maxSpeed } = await import('../dist/arena-move.js');
const { startArena, arenaApply, arenaTick, rematch } = await import('../dist/arena-logic.js');
const { combatApply, ammoOf, hpOf, takeShots, arenaArsenalOf, teamPistol } = await import('../dist/combat-logic.js');
const { DEFUSE, PRICE } = await import('../dist/arena-defuse.js');
const { ARENA_MAPS, mapBoxes, segmentClear } = await import('../dist/arena-maps.js');
const { ARENA } = await import('../dist/facility-layout.js');
const { shellSchedule } = await import('../dist/fp-sounds.js');
const S = await import('../dist/gd-sounds.js');
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
const J = x => JSON.stringify(x);
const NEW = ['p2000', 'elite', 'revolver', 'mag7', 'sawedoff', 'scar20', 'g3sg1'];

// ── NUMBERS: weapons.vdata (the user's install, read 2026-11-05: m_nPrice, m_nKillAward, m_nDamage, m_flArmorRatio,
// m_flRangeModifier, m_flRange, m_flCycleTime[0], m_iMaxClip1, m_nPrimaryReserveAmmoMax (magazines when
// m_bReserveAmmoAsClips), m_flMaxSpeed[0], m_flDeployDuration, m_nRecoilSeed, m_nNumBullets, m_nZoomFOV1/2) ──
const VD = { p2000: ['weapon_hkp2000', 200, 300, 35, 1.01, .91, 4096, .17, 13, 4, true, 240, 1, 5426, 1, null],
  elite: ['weapon_elite', 300, 300, 38, 1.15, .79, 4096, .12, 30, 2, true, 240, 1, 24563, 1, null],
  revolver: ['weapon_revolver', 600, 300, 86, 1.864, .94, 4096, .5, 8, 2, true, 180, 1.166667, 12345, 1, null],
  mag7: ['weapon_mag7', 1300, 900, 30, 1.5, .45, 1400, .85, 5, 3, true, 225, 1, 12518, 8, null],
  sawedoff: ['weapon_sawedoff', 1100, 900, 32, 1.5, .45, 1400, .85, 7, 32, false, 210, 1, 1089, 8, null],
  scar20: ['weapon_scar20', 5000, 300, 80, 1.65, .98, 8192, .25, 20, 2, true, 215, 1, 19364, 1, [40, 15]],
  g3sg1: ['weapon_g3sg1', 5000, 300, 80, 1.65, .98, 8192, .25, 20, 2, true, 215, 1, 29908, 1, [40, 15]] };
const close = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
for (const id of NEW) { const w = weaponById(id), [cls, pr, ka, dmg, ar, rm, rng, cyc, clip, res, asClips, spd, dep, seed, pellets, zoom] = VD[id];
  ok(`${w.name} (${cls}): $${pr}, kill award $${ka}, ${dmg} damage, armour ratio ${ar}, range modifier ${rm}, range ${rng} HU, a shot every ${cyc} s`,
    w.price === pr && w.reward === ka && w.dmg === dmg && close(w.ap, ar / 2) && w.rangeMod === rm && close(w.reach, rng / 6.5) && w.rateMs === Math.round(cyc * 1000), J([w.price, w.reward, w.dmg, w.ap, w.rangeMod, w.reach, w.rateMs]));
  ok(`${w.name}: ${clip} rounds, the reserve ${res}${asClips ? ' magazines' : ' shells'} (Magazines model ${asClips ? res * clip : res}), ${spd} u/s, deploy ${dep} s, recoil seed ${seed}${pellets > 1 ? ', ' + pellets + ' pellets' : ''}${zoom ? ', zoom ' + zoom.join(' / ') + '°' : ''}`,
    w.mag === clip && w.reserveMags === (asClips ? res * clip : res) && w.asClips === asClips && w.speed === spd && w.deployMs === Math.round(dep * 1000) && w.recoilSeed === seed && (w.pellets || 1) === pellets && J(w.zoom ?? null) === J(zoom),
    J([w.mag, w.reserveMags, w.speed, w.deployMs, w.recoilSeed, w.pellets, w.zoom])); }
ok('the R8\'s fan: m_flCycleTime[1] 0.4 s, its spread m_flSpread[1] 0.068 (the second mode)', weaponById('revolver').altRateMs === 400 && weaponById('revolver').accZ.spread === .068);
ok('the autosnipers: CS2\'s scoped speed 120 u/s (m_flMaxSpeed[1]) — movement\'s own cap, maxSpeed — and full-auto at 0.25 s', ['scar20', 'g3sg1'].every(id => close(maxSpeed(id, true) / HU, 120) && close(maxSpeed(id, false) / HU, 215) && weaponById(id).mode === 'auto'), J(['scar20', 'g3sg1'].map(id => maxSpeed(id, true) / HU)));
ok('the view model hides when zoomed (m_bHideViewModelWhenZoomed true: AWP, SSG 08, SCAR-20, G3SG1; not the AUG / SG 553)', ['sniper', 'ssg08', 'scar20', 'g3sg1'].every(id => weaponById(id).hideZoomed) && !weaponById('aug').hideZoomed && !weaponById('sg553').hideZoomed);
ok('the Zeus x27 (weapon_taser): $200, award $100, 500 damage, armour ratio 2 (armour takes nothing), 120 HU, 1 charge and no reserve, 230 u/s',
  ZEUS.price === 200 && ZEUS.reward === 100 && ZEUS.dmg === 500 && ZEUS.ap === 1 && close(ZEUS.reach, 120 / 6.5) && ZEUS.mag === 1 && ZEUS.reserve === 0 && ZEUS.speed === 230 && W.isFirearm(ZEUS) && weaponById('zeus') === ZEUS);
ok('teams (items_game used_by_classes): P2000, MAG-7, SCAR-20 CT; Sawed-Off, G3SG1 T; Dual Berettas, R8 both', J(NEW.map(id => weaponById(id).team ?? null)) === J(['ct', null, null, 'ct', 't', 'ct', 't']));
ok('the MAG-7 seats a magazine (m_bReloadsSingleShells false), the Sawed-Off loads shells', !weaponById('mag7').shellMs && weaponById('mag7').magInMs > 0 && weaponById('sawedoff').shellMs > 0);
// Against the user's own install, when this computer has it (tools/import-cs2-reloads.mjs's cache).
{ const vf = join(homedir(), 'CS2-extract', 'export', 'reloads', 'scripts__weapons.vdata_c.dec.txt');
  if (existsSync(vf)) { const { vdataPrefabs } = await import('../tools/import-cs2-reloads.mjs'), V = vdataPrefabs(readFileSync(vf, 'utf8')); const first = v => Array.isArray(v) ? v[0] : typeof v === 'string' ? +v.replace(/[[\]]/g, '').split(',')[0] : v; const second = v => Array.isArray(v) ? v[1] : typeof v === 'string' ? +v.replace(/[[\]]/g, '').split(',')[1] : NaN;
    let same = 0; for (const id of NEW) { const v = V[VD[id][0] + '_prefab'], e = VD[id]; if (v && v.m_nPrice === e[1] && v.m_nKillAward === e[2] && v.m_nDamage === e[3] && close(v.m_flArmorRatio, e[4]) && close(v.m_flRangeModifier, e[5]) && v.m_flRange === e[6] && close(first(v.m_flCycleTime), e[7]) && v.m_iMaxClip1 === e[8] && v.m_nPrimaryReserveAmmoMax === e[9] && first(v.m_flMaxSpeed) === e[11] && (id !== 'revolver' || second(v.m_flMaxSpeed) === 220) && v.m_nRecoilSeed === e[13] && v.m_nNumBullets === e[14]) same++; else console.log('  differs:', id); }
    const z = V.weapon_taser_prefab || V.weapon_taser; ok(`the install's weapons.vdata: all ${NEW.length} guns' numbers as written here`, same === NEW.length, same);
    const hides = v => v?.m_bHideViewModelWhenZoomed === true || v?.m_bHideViewModelWhenZoomed === 'true';
    ok('…the scoped speed (m_flMaxSpeed[1]) movement uses and the hidden view model (m_bHideViewModelWhenZoomed), from the file', ['scar20', 'g3sg1', 'sniper', 'ssg08', 'aug', 'sg553'].every(id => { const v = V[{ sniper: 'weapon_awp', sg553: 'weapon_sg556' }[id] || 'weapon_' + id] || V[({ sniper: 'weapon_awp', sg553: 'weapon_sg556' }[id] || 'weapon_' + id) + '_prefab'], p = V[({ sniper: 'weapon_awp', sg553: 'weapon_sg556' }[id] || 'weapon_' + id) + '_prefab'];
      return close(second(p?.m_flMaxSpeed ?? v?.m_flMaxSpeed), maxSpeed(id, true) / HU) && hides(p) === weaponById(id).hideZoomed; }), J(['scar20', 'g3sg1'].map(id => [second(V['weapon_' + id + '_prefab']?.m_flMaxSpeed), V['weapon_' + id + '_prefab']?.m_bHideViewModelWhenZoomed])));
    ok('…and the Zeus x27\'s', z && z.m_nPrice === 200 && z.m_nDamage === 500 && z.m_flRange === 120 && z.m_iMaxClip1 === 1 && z.m_nPrimaryReserveAmmoMax === 0 && z.m_flArmorRatio === 2);
  } else console.log('  (no CS2 install on this computer: checked against the values written here only)'); }

// ── LOADOUT (CS2's flexible loadout) ──
const CT = { s0: 'p2000', s1: 'elite', s2: 'p250', s3: 'fiveseven', s4: 'deagle', m0: 'shotgun', m1: 'xm1014', m2: 'smg', m3: 'p90', m4: 'mp9', r0: 'famas', r1: 'm4s', r2: 'ssg08', r3: 'aug', r4: 'sniper' };
const TT = { s0: 'pistol', s1: 'elite', s2: 'p250', s3: 'tec9', s4: 'deagle', m0: 'shotgun', m1: 'xm1014', m2: 'smg', m3: 'p90', m4: 'mac10', r0: 'galil', r1: 'ak', r2: 'ssg08', r3: 'sg553', r4: 'sniper' };
ok('15 slots a side: the starting pistol, 4 pistols, 5 Mid-Tier, 5 rifles', J(LOADOUT_KEYS) === J(['s0', 's1', 's2', 's3', 's4', 'm0', 'm1', 'm2', 'm3', 'm4', 'r0', 'r1', 'r2', 'r3', 'r4']));
ok('CS2\'s file defaults (flexible_loadout_default 1 per slot)', J(CS2_LOADOUT_DEFAULT) === J({ ct: CT, t: TT }));
ok('ours: the CT\'s default starting pistol stays the USP-S (notCS2: the file\'s is the P2000); every other slot CS2\'s', J(LOADOUT_DEFAULT.ct) === J({ ...CT, s0: 'usps' }) && J(LOADOUT_DEFAULT.t) === J(TT));
ok('s0 holds only the starting pistols (flexible_loadout_group secondary0)', J(slotChoices('s0', 'ct')) === J(['usps', 'p2000']) && J(slotChoices('s0', 't')) === J(['pistol']) && !slotChoices('s2', 'ct').includes('usps') && !slotChoices('s1', 't').includes('pistol'));
ok('any pistol in any pistol slot, any Mid-Tier gun in any Mid-Tier slot, any rifle in any rifle slot — the side\'s own', ['s1', 's2', 's3', 's4'].every(k => slotChoices(k, 'ct').includes('revolver') && slotChoices(k, 'ct').includes('cz75') && !slotChoices(k, 'ct').includes('tec9'))
  && ['m0', 'm4'].every(k => slotChoices(k, 'ct').includes('mag7') && !slotChoices(k, 'ct').includes('sawedoff') && slotChoices(k, 't').includes('negev')) && ['r0', 'r4'].every(k => slotChoices(k, 'ct').includes('m4') && slotChoices(k, 'ct').includes('scar20') && !slotChoices(k, 'ct').includes('ak')));
ok('a loadout is cleaned: complete, the side\'s guns only, never one gun twice', (() => { const c = cleanSlots({ ct: { r0: 'm4', r1: 'ak', r2: 'm4', s0: 'glock' }, x: 1 }).ct; return !cleanSlots({ x: 1 }).ct && LOADOUT_KEYS.every(k => slotChoices(k, 'ct').includes(c[k])) && new Set(Object.values(c)).size === 15 && c.r0 === 'm4' && c.r1 === 'm4s' && c.s0 === 'usps'; })());
ok('putting a gun another slot holds swaps the two (CS2)', (() => { const l = withSlot({}, 'ct', 'r0', 'm4s'); return l.r0 === 'm4s' && l.r1 === 'famas'; })() && withSlot({}, 'ct', 'r1', 'm4').r1 === 'm4');
ok('the CT starting pistol is slot s0\'s (USP-S until a P2000 is chosen); the T\'s the Glock', defaultPistol('ct') === 'usps' && defaultPistol('ct', { ct: { s0: 'p2000' } }) === 'p2000' && defaultPistol('t', { ct: { s0: 'p2000' } }) === 'pistol');
{ const sl = { ct: withSlot({}, 'ct', 's0', 'p2000') };
  ok('choosing only the starting pistol leaves the other 14 slots at CS2\'s defaults (the M4A1-S, Five-SeveN, MP9 … sold)', ['m4s', 'fiveseven', 'mp9', 'deagle', 'famas'].every(id => slotRefusal(id, 'ct', sl) === ''));
  ok('…and what CS2\'s default CT loadout lacks is refused (M4A4, MP7, CZ75-Auto, R8)', ['m4', 'mp7', 'cz75', 'revolver'].every(id => /not in your loadout/.test(slotRefusal(id, 'ct', sl))));
  ok('no loadout sent (bots, scripts): nothing refused; the other side\'s loadout unaffected', slotRefusal('m4', 'ct', {}) === '' && slotRefusal('m4', 'ct', null) === '' && slotRefusal('cz75', 't', sl) === '' && slotRefusal('zeus', 'ct', sl) === ''); }
ok('slotGun: the player\'s gun in a slot, else the default; null for no such slot', slotGun('s4', 't', { t: { s4: 'revolver' } }) === 'revolver' && slotGun('s4', 't') === 'deagle' && slotGun('rifle', 't') === null && slotGun('r1', 'spec') === null);
// Against the install's items_game.txt, when this computer has it (~/CS2-extract/export/guns8: the GUNS8 export).
{ const f = join(homedir(), 'CS2-extract', 'export', 'guns8', 'scripts', 'items', 'items_game.txt');
  if (existsSync(f)) { const txt = readFileSync(f, 'utf8'), lines = txt.split('\n'), it = {}; let cur = null;
    for (const ln of lines) { let m = /^\s*"name"\s+"(weapon_[a-z0-9_]+)"/.exec(ln); if (m) { cur = it[m[1]] ??= {}; continue; } m = /^\s*"(flexible_loadout_(?:slot|default|group))"\s+"([^"]*)"/.exec(ln); if (m && cur && !(m[1] in cur)) cur[m[1]] = m[2]; }
    const CLS = { pistol: 'glock', usps: 'usp_silencer', p2000: 'hkp2000', elite: 'elite', p250: 'p250', fiveseven: 'fiveseven', tec9: 'tec9', cz75: 'cz75a', deagle: 'deagle', revolver: 'revolver', shotgun: 'nova', xm1014: 'xm1014', smg: 'mp5sd', p90: 'p90', mp9: 'mp9', mac10: 'mac10', famas: 'famas', galil: 'galilar', m4s: 'm4a1_silencer', m4: 'm4a1', ak: 'ak47', ssg08: 'ssg08', aug: 'aug', sg553: 'sg556', sniper: 'awp' };
    const slotOf = { s: 'secondary', m: 'smg', r: 'rifle' }, bad = [];
    for (const t of ['ct', 't']) for (const [k, id] of Object.entries(CS2_LOADOUT_DEFAULT[t])) { const e = it['weapon_' + CLS[id]]; if (!e || e.flexible_loadout_slot !== slotOf[k[0]] + k[1] || (e.flexible_loadout_default !== '1' && !(id === 'usps'))) bad.push(t + ':' + k + ':' + id + ':' + J(e)); }
    ok('the install\'s items_game.txt: every default in its flexible_loadout_slot with flexible_loadout_default 1', !bad.length, bad.join(' '));
    ok('…only the Glock, P2000 and USP-S are in group secondary0; the CZ75-Auto and R8 sit in secondary1 with no default (no pair with the Five-SeveN / Deagle)', ['glock', 'hkp2000', 'usp_silencer'].every(c => it['weapon_' + c]?.flexible_loadout_group === 'secondary0') && it.weapon_cz75a?.flexible_loadout_slot === 'secondary1' && it.weapon_revolver?.flexible_loadout_slot === 'secondary1' && !it.weapon_revolver?.flexible_loadout_default && Object.entries(it).filter(([, e]) => e.flexible_loadout_group === 'secondary0').length === 3);
  } else console.log('  (no items_game.txt export on this computer: the loadout checked against the values written here only)'); }

// ── THE HOST: buying in Defuse ──
const M = ARENA_MAPS.dust2, at = ([x, z]) => ({ x: ARENA.cx + x, y: 9.7 + (M.nav ? M.nav.floorAt(x, z) || 0 : 0), z: ARENA.cz + z, yaw: 0 });
function defuse() { let t = 7e9; const g = { levels: {} }; startArena(g, { map: 'dust2', kind: 'defuse', bots: 0 }, t);
  const players = [{ name: 'Ann', pose: at(M.t[0]) }, { name: 'Bo', pose: at(M.ct[0]) }];
  const tick = ms => { for (let i = 0; i < ms / 50; i++) { t += 50; arenaTick(g, players, .05, t); } }; tick(50);
  const d = g.combat.d, tk = Object.keys(d.teams).find(k => d.teams[k] === 't'), ck = Object.keys(d.teams).find(k => d.teams[k] === 'ct');
  const T_ = players.find(p => p.name.toLowerCase() === tk), C_ = players.find(p => p.name.toLowerCase() === ck); T_.pose = at(M.t[0]); C_.pose = at(M.ct[0]);
  d.money[tk] = d.money[ck] = 16000; return { g, d, players, tick, now: () => t, Tn: T_.name, Cn: C_.name, tk, ck }; }
{ const { g, d, players, now, Tn, Cn, tk, ck } = defuse(); const L = k => g.arena.loadout[k], buy = (who, o) => arenaApply(g, { type: 'buy', ...o }, who, players, now());
  ok('a CT starts with the USP-S (no choice sent)', arenaArsenalOf(g, Cn).includes('usps') && teamPistol(g, Cn) === 'usps');
  assert.throws(() => buy(Tn, { primary: 'mag7' }), /Counter-Terrorist weapon/); n++; assert.throws(() => buy(Tn, { primary: 'scar20' }), /Counter-Terrorist weapon/); n++;
  assert.throws(() => buy(Cn, { primary: 'sawedoff' }), /Terrorist weapon/); n++; assert.throws(() => buy(Cn, { primary: 'g3sg1' }), /Terrorist weapon/); n++;
  ok('the side guns are refused to the other side (MAG-7 / SCAR-20 CT, Sawed-Off / G3SG1 T)', true);
  let m0 = d.money[tk]; buy(Tn, { primary: 'g3sg1' }); ok('a Terrorist buys the G3SG1 for $5,000: full magazine', d.money[tk] === m0 - 5000 && L(tk).primary === 'g3sg1' && ammoOf(g, Tn, 'g3sg1')[0] === 20, J([d.money[tk], ammoOf(g, Tn, 'g3sg1')]));
  m0 = d.money[tk]; buy(Tn, { secondary: 'elite' }); ok('…and the Dual Berettas ($300, 30 rounds) — both sides may', d.money[tk] === m0 - 300 && L(tk).secondary === 'elite' && ammoOf(g, Tn, 'elite')[0] === 30);
  m0 = d.money[ck]; buy(Cn, { primary: 'mag7', secondary: 'revolver' }); ok('a CT buys the MAG-7 and the R8 ($1,300 + $600)', d.money[ck] === m0 - 1900 && L(ck).primary === 'mag7' && L(ck).secondary === 'revolver');
  // the loadout: the host sells a player who sent one only its guns
  arenaApply(g, { type: 'slots', slots: { ct: { s0: 'p2000', r1: 'm4s', bogus: 1 }, x: 2 } }, Cn, players, now());
  ok('the host keeps the loadouts, cleaned and complete (arena.slots: host only)', J(g.arena.slots[ck]) === J({ ct: { ...CT } }));
  assert.throws(() => buy(Cn, { primary: 'm4' }), /not in your loadout/); n++; assert.throws(() => buy(Cn, { secondary: 'revolver' }), /not in your loadout/); n++;
  ok('…the M4A4 and the R8 refused now (not in CS2\'s default CT loadout); the M4A1-S sold', (buy(Cn, { primary: 'm4s' }), L(ck).primary === 'm4s'));
  arenaApply(g, { type: 'slots', slots: { ct: withSlot(g.arena.slots[ck], 'ct', 'r1', 'm4') } }, Cn, players, now()); ok('a swap: the M4A4 in rifle 2 — sold; the M4A1-S out — refused', (buy(Cn, { primary: 'm4' }), L(ck).primary === 'm4') && /not in your loadout/.test(slotRefusal('m4s', 'ct', g.arena.slots[ck])));
  ok('slot s0 P2000: the CT\'s starting pistol is the P2000', teamPistol(g, Cn) === 'p2000');
  { const { arenaView } = await import('../dist/arena-logic.js'); ok('the loadouts are not sent to the clients (arenaView)', !('slots' in arenaView(g)));
    // (GUNS8 final, review: every page builds the same hands as the host — the CT's P2000 rides arenaView's s0)
    for (const k of Object.keys(g.arena.loadout)) delete g.arena.loadout[k];   // (as at a match start: no loadout records yet)
    const guest = { mode: 'arena', arena: JSON.parse(JSON.stringify(arenaView(g))), combat: JSON.parse(JSON.stringify(g.combat)) };
    ok('a page\'s arsenal from arenaView (a JSON copy) equals the host\'s for both players: the CT\'s P2000 on every page', [Cn, Tn].every(nm => J(arenaArsenalOf(guest, nm)) === J(arenaArsenalOf(g, nm))) && arenaArsenalOf(guest, Cn).includes('p2000') && J(guest.arena.s0) === J({ [ck]: 'p2000' }), J([arenaArsenalOf(guest, Cn), arenaArsenalOf(g, Cn), guest.arena.s0])); }
  // the Zeus x27
  m0 = d.money[tk]; arenaApply(g, { type: 'buy-zeus' }, Tn, players, now()); ok('the Zeus x27: $200, after the knife in the arsenal, one charge', d.money[tk] === m0 - 200 && arenaArsenalOf(g, Tn).indexOf('zeus') === arenaArsenalOf(g, Tn).indexOf('knife') + 1 && J(ammoOf(g, Tn, 'zeus')) === '[1,0]', J(arenaArsenalOf(g, Tn)));
  assert.throws(() => arenaApply(g, { type: 'buy-zeus' }, Tn, players, now()), /already have/); n++;
  m0 = d.money[tk]; arenaApply(g, { type: 'refund', item: 'zeus' }, Tn, players, now()); ok('…an unfired Zeus refunds', d.money[tk] === m0 + 200 && !arenaArsenalOf(g, Tn).includes('zeus'));
  ok('PRICE (the buy menu\'s and the host\'s) has every new gun\'s vdata price', ['zeus', ...NEW].every(id => PRICE[id] === (id === 'zeus' ? 200 : VD[id][1]))); }

// ── THE HOST: the loadout survives a rematch (its pistol round is set up before any client sends it again) ──
{ const { g, players, now, Cn, ck } = defuse(); arenaApply(g, { type: 'slots', slots: { ct: { s0: 'p2000' } } }, Cn, players, now());
  rematch(g, players, now() + 1000); const d2 = g.combat.d;
  ok('a rematch keeps the loadouts: the CT\'s pistol round starts with the P2000 and the host still refuses the M4A4', g.arena.slots?.[ck]?.ct?.s0 === 'p2000' && d2.teams[ck] === 'ct' && teamPistol(g, Cn) === 'p2000' && arenaArsenalOf(g, Cn).includes('p2000') && !arenaArsenalOf(g, Cn).includes('usps') && /not in your loadout/.test(slotRefusal('m4', 'ct', g.arena.slots[ck])), J([g.arena.slots?.[ck]?.ct?.s0, d2.teams[ck], teamPistol(g, Cn), arenaArsenalOf(g, Cn)])); }

// ── THE HOST: the Zeus x27's shot (yard, deathmatch: the trace is the host's) ──
const map = ARENA_MAPS.yard, boxes = mapBoxes(map, ARENA.cx, ARENA.cz);
const spot = (() => { for (let x = -120; x < 120; x += 4) for (let z = -120; z < 120; z += 4) { const a = { x: ARENA.cx + x, z: ARENA.cz + z }, b = { x: a.x + 30, z: a.z }; if ([a, b].every(p => !boxes.some(q => p.x > q.minX - 3 && p.x < q.maxX + 3 && p.z > q.minZ - 3 && p.z < q.maxZ + 3)) && segmentClear(boxes, a.x, 9.7, a.z, b.x, 7, b.z) && segmentClear(boxes, a.x, 9.7, a.z, b.x, 10, b.z) && segmentClear(boxes, a.x, 9.7, a.z, b.x, 2, b.z)) return a; } })();
const yawTo = (f, x, z) => Math.atan2(-(x - f.x), -(z - f.z)), pitchTo = (f, x, y, z) => Math.atan2(y - f.y, Math.hypot(x - f.x, z - f.z));
const zeusAt = (dist, t0) => { const g = { levels: {} }; startArena(g, { map: 'yard', bots: 0 }, t0); const a = { x: spot.x, y: 9.7, z: spot.z }, b = { x: spot.x + dist, y: 9.7, z: spot.z, yaw: 0 }; a.yaw = yawTo(a, b.x, b.z);
  const P = [{ id: 'a', name: 'Ann', pose: a }, { id: 'b', name: 'Bo', pose: b }]; arenaApply(g, { type: 'buy-zeus' }, 'Ann', P, t0); (g.combat.armor ??= {}).bo = { kevlar: 100, helmet: true }; return { g, P, a, b }; };
const rec = (a, b, nn, ft, h = 7.9) => ({ type: 'hit', target: 'b', weapon: 'zeus', n: nn, ft, eye: [a.x, a.y, a.z], look: [pitchTo(a, b.x, h, b.z), yawTo(a, b.x, b.z)], pu: [0, 0], ia: 0, zone: 'chest' });
{ const t0 = 3e9, { g, P, a, b } = zeusAt(10, t0); takeShots(g, 'Ann', 4e6, 'zeus');   // (the pose stream's numbering)
  const r = combatApply(g, rec(a, b, 4e6 + 1, 100), 'Ann', P, 'a', t0 + 5000);
  ok('the Zeus at 65 HU (10 units) kills through a helmet and a vest in one shot (500, armour ratio 2)', hpOf(g, 'Bo') === 0 && r.dmg >= 100, J(r));
  ok('…and its one charge is gone: out of the loadout (ITEM_FLAG_EXHAUSTIBLE)', !g.arena.loadout.ann.zeus && !arenaArsenalOf(g, 'Ann').includes('zeus') && ammoOf(g, 'Ann', 'zeus')[0] === 0); }
{ const t0 = 3.1e9, { g, P, a, b } = zeusAt(25, t0); takeShots(g, 'Ann', 4e6, 'zeus');
  assert.throws(() => combatApply(g, rec(a, b, 4e6 + 1, 100), 'Ann', P, 'a', t0 + 5000), /range|Missed|reach/i); n++;
  ok('the Zeus at 162 HU (25 units, past m_flRange 120): no hit', hpOf(g, 'Bo') === 100); }
{ const t0 = 3.2e9, { g, P, a, b } = zeusAt(17, t0); takeShots(g, 'Ann', 4e6, 'zeus'); combatApply(g, rec(a, b, 4e6 + 1, 100), 'Ann', P, 'a', t0 + 5000);
  ok('the Zeus at 110 HU (17 units, inside 120 counting the body\'s radius): a kill', hpOf(g, 'Bo') === 0); }

// ── weapons.js: the R8's hammer and fan ──
function rig(ids) { const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(74, 1.6, .1, 1000); scene.add(camera); const reports = [];
  const P = createWeapons({ scene, camera, effects: { shoot() {}, shootAt() {} }, arsenal: () => [...ids, 'knife'], report: a => reports.push(a), canFire: () => true, targets: () => [], move: () => ({ speed: 0, max: 215 * HU, onGround: true, landedAgo: 9 }) });
  P.equip(ids[0]); T += (weaponById(ids[0]).deployMs || 1000) + 50; P.update(.016); return P; }
const frames = (P, ms, fps = 60) => { let left = ms; while (left > 0) { const dt = Math.min(left, 1000 / fps); T += dt; left -= dt; P.update(dt / 1000); } };
{ T = 1e6; const P = rig(['revolver']); const s0 = P.shots; P.button(0, true); frames(P, REVOLVER.prepMs - 10); ok(`R8 primary: no shot before the hammer is back (${REVOLVER.prepMs} ms)`, P.shots === s0);
  frames(P, 30); ok('…the shot leaves once it is', P.shots === s0 + 1 && P.ammo === 7); P.button(0, false);
  frames(P, 1000); const s1 = P.shots; P.button(0, true); frames(P, 150); P.button(0, false); frames(P, 600); ok('R8: let go before the hammer is back — no shot', P.shots === s1 && P.ammo === 7); }
{ T = 2e6; const P = rig(['revolver']); const s0 = P.shots; P.button(2, true); ok('R8 secondary: the fan fires at once', P.shots === s0 + 1);
  frames(P, 390); ok('…not again before 0.4 s (m_flCycleTime[1])', P.shots === s0 + 1); frames(P, 30); ok('…and again at 0.4 s while held (full auto)', P.shots === s0 + 2); P.button(2, false);
  const ps = P.poseShot(0, 0); ok('…a fanned shot is the second mode (sc 1: its spread and recoil on the host too)', ps.sc === 1 && ps.w === 'revolver');
  ok('R8 speed by mode (m_flMaxSpeed [180, 220]): 220 u/s after a fan, 180 in the primary mode', P.altMode === true && close(maxSpeed('revolver', true) / HU, 220) && close(maxSpeed('revolver', false) / HU, 180));
  frames(P, 800); P.button(0, true); frames(P, REVOLVER.prepMs + 40); P.button(0, false); ok('…a primary shot puts it back in its primary mode (180)', P.altMode === false); }
{ T = 2.5e6; const P = rig(['revolver']); P.button(2, true); frames(P, 100); P.equip('knife'); frames(P, 1300); P.button(2, false); frames(P, 100); P.equip('revolver'); frames(P, 1300);
  const s0 = P.shots, a0 = P.ammo; frames(P, 3000); ok('R8: right held over a switch, let go with the knife out — no fan when the R8 comes back (review)', P.shots === s0 && P.ammo === a0 && !P.altMode, J([P.shots - s0, P.ammo])); }
{ const t0 = 3.3e9, g = { levels: {} }; startArena(g, { map: 'yard', bots: 0 }, t0); const a = { x: spot.x, y: 9.7, z: spot.z }, b = { x: spot.x + 30, y: 9.7, z: spot.z, yaw: 0 }; a.yaw = yawTo(a, b.x, b.z);
  const P = [{ id: 'a', name: 'Ann', pose: a }, { id: 'b', name: 'Bo', pose: b }]; arenaApply(g, { type: 'loadout', secondary: 'revolver' }, 'Ann', P, t0);
  const r8 = (nn, ft) => ({ type: 'hit', target: 'b', weapon: 'revolver', n: nn, ft, eye: [a.x, a.y, a.z], look: [pitchTo(a, b.x, 7.9, b.z), yawTo(a, b.x, b.z)], pu: [0, 0], ia: weaponById('revolver').accZ.stand, sc: 1, zone: 'chest' });
  takeShots(g, 'Ann', 5e6, 'revolver'); combatApply(g, r8(5e6 + 1, 0), 'Ann', P, 'a', t0 + 5000); combatApply(g, r8(5e6 + 2, 400), 'Ann', P, 'a', t0 + 5400);
  ok('the host: two fanned R8 shots 0.4 s apart both count', ammoOf(g, 'Ann', 'revolver')[0] === 6, J(ammoOf(g, 'Ann', 'revolver')));
  if (g.combat.down) delete g.combat.down.bo; g.combat.hp.bo = 100;   // (Bo up again: two R8 chest hits kill)
  assert.throws(() => combatApply(g, r8(5e6 + 3, 500), 'Ann', P, 'a', t0 + 5500), /Too fast/); n++; ok('…one 0.1 s later is too fast (no damage)', hpOf(g, 'Bo') === 100);
  // A primary (sc 0) shot waits for the hammer: the shortest cycle 0.4 s + REVOLVER.prepMs; at the fan's 0.4 s it is refused.
  const p8 = (nn, ft) => ({ ...r8(nn, ft), sc: 0, ia: weaponById('revolver').acc.stand });
  assert.throws(() => combatApply(g, p8(5e6 + 3, 800), 'Ann', P, 'a', t0 + 5800), /Too fast/); n++; ok('…a primary (hammer) shot 0.4 s after a fan is too fast too', hpOf(g, 'Bo') === 100);
  combatApply(g, p8(5e6 + 4, 400 + 2 * (400 + REVOLVER.prepMs)), 'Ann', P, 'a', t0 + 7000); ok('…one a hammer cycle later counts', hpOf(g, 'Bo') < 100, hpOf(g, 'Bo')); }

// ── SHELLS: the Sawed-Off shell by shell, the MAG-7 a magazine ──
{ const w = weaponById('sawedoff'), first = w.shellIntroMs + w.shellAddMs; T = 4e6; const P = rig(['sawedoff']); P.setAmmo('sawedoff', [2, 32]); P.reload();
  frames(P, first - 5); ok(`Sawed-Off: no shell before CS2's first shell moment (${first} ms)`, P.ammo === 2); frames(P, 10); ok('…the first shell then', P.ammo === 3);
  frames(P, w.shellMs); ok(`…the next one loop later (${w.shellMs} ms)`, P.ammo === 4); frames(P, w.shellMs * 3 + 50); ok('…until the tube is full (7)', P.ammo === 7 && P.reserve === 27, J([P.ammo, P.reserve])); }
{ const w = weaponById('mag7'); T = 5e6; const P = rig(['mag7']); P.setAmmo('mag7', [1, 32]); P.reload(); const atMs = P.magInAt - T;
  ok(`MAG-7: one magazine seated at its clip's mag-in (${w.magInMs} ms)`, atMs === w.magInMs || atMs === w.magInEmptyMs, atMs); frames(P, atMs + 20); ok('…5 rounds at once (Bullets: the missing 4 from the reserve)', P.ammo === 5 && P.reserve === 28, J([P.ammo, P.reserve])); }
{ const c = { dur: 2.3, ev: [[.1, ['intro']], [.5, ['insert']], [.7, ['add']], [1.2, ['pump']]] }, sch = shellSchedule(c, { intro: .4, loop: .5, n: 3 });
  ok('open-B#14: the loop\'s sounds once per shell, the intro\'s before, the outro\'s after the last', J(sch.map(([s, e]) => [+s.toFixed(3), e[1][0]])) === J([[.1, 'intro'], [.5, 'insert'], [.7, 'add'], [1, 'insert'], [1.2, 'add'], [1.5, 'insert'], [1.7, 'add'], [2.2, 'pump']]), J(sch));
  const out = []; ok('…into the caller\'s array (no allocation per reload but the pairs)', shellSchedule(c, { intro: .4, loop: .5, n: 1 }, out) === out && out.length === 4); }

// ── The Zeus's own tracer (weapon_tracers_taser: blue, the whole path at once, 0.4 s) — GUNS8 final, review ──
{ const { createTracers, TASER } = await import('../dist/gd-tracers.js'); const cam = new THREE.PerspectiveCamera(74, 1.6, .1, 1000); cam.position.set(0, 9, 5);
  const Z = createTracers(new THREE.Scene(), { camera: () => cam }), o = new THREE.Vector3(0, 9, 0), e = [{ point: new THREE.Vector3(0, 9, -15) }];
  Z.shot(o, e, 'zeus', 1); Z.update(.016); const c = Z.buffers.col, p = Z.buffers.pos;
  ok('the Zeus: its own blue streak (CS2 weapon_tracers_taser_wire2 [149, 218–232, 255]), the whole path at once', Z.drawn === 1 && c[2] > c[0] * 2 && Math.abs(p[8] - -15) < .01, J([Z.drawn, c[0], c[2], p[8]]));
  Z.update(TASER.life); ok('…gone after its 0.4 s life', Z.drawn === 0 && Z.active === 0);
  Z.shot(o, e, 'ak', 1); Z.update(.016); ok('…a gun\'s streak keeps CS2\'s orange bullet look', Z.drawn === 1 && Z.buffers.col[0] > Z.buffers.col[2]); }

// ── SOUNDS: G9–G11 ──
ok('G9: each scoped gun\'s own zoom events (weapons.vdata WEAPON_SOUND_ZOOM_IN / _OUT)', J(S.ZOOM_EV.scar20) === J(['Weapon_SCAR20.Zoom', 'Weapon_SCAR20.Zoom']) && J(S.ZOOM_EV.g3sg1) === J(['Weapon_G3SG1.Zoom', 'Weapon_G3SG1.ZoomOut']) && J(S.ZOOM_EV.aug) === J(['Weapon_AUG.ZoomIn', 'Weapon_AUG.ZoomOut']) && J(S.ZOOM_EV.sniper) === J(['Weapon_AWP.Zoom', 'Weapon_AWP.ZoomOut']));
ok('G9/G10: the events exist (gun.<id>.zoom / zoomout, gun.nearlyempty → Default.NearlyEmpty)', ['scar20', 'g3sg1', 'aug', 'sg553', 'sniper', 'ssg08'].every(g => S.EVENTS[`gun.${g}.zoom`] && S.EVENTS[`gun.${g}.zoomout`]) && S.EVENTS['gun.nearlyempty'] && S.NEARLY_EMPTY === .2);
{ const lo = S.shotTone('negev', .01), hi = S.shotTone('negev', .2);
  ok('G11: the Negev — under m_flInaccuracyAltSoundThreshold 0.02 its focused shot, the pitch 1 + (−50 × inaccuracy) / 100', lo.ev === 'gun.negev.focused' && hi.ev === null && close(hi.rate, .9) && close(lo.rate, .995) && S.shotTone('ak', .2) === null, J([lo, hi])); }
ok('every new gun and the Zeus has its CS2 fire event (game_sounds_weapons spelling)', [...NEW, 'zeus'].every(g => S.EVENTS[`gun.${g}.fire`]), [...NEW, 'zeus'].filter(g => !S.EVENTS[`gun.${g}.fire`]));
ok('the 7 guns are in WEAPONS, the Zeus beside them (not a primary or a pistol)', NEW.every(id => WEAPONS.some(w => w.id === id)) && !WEAPONS.some(w => w.id === 'zeus'));
console.log(`PASS: gd-new-guns · ${n} checks (vdata numbers of the 8 guns, teams, CS2's flexible loadout (items_game), buying, the slot swap and a rematch on the host, the autosnipers' scoped speed and hidden view model, the Zeus's one charge and 120 HU, the R8's hammer and fan, shells and the MAG-7's magazine, G9–G11)`);
