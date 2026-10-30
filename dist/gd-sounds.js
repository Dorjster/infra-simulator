// Global Defensive's sound bank: every GD sound event → its shipped placeholder(s) (dist/sounds: CC0 and the owner's
// recordings — never CS2's), the room's optional CS2 override (the user's own CS2 install, imported on that computer by
// tools/import-cs2-sounds.mjs into user-assets/sounds + manifest models.gdSounds: never committed, never shipped), its
// category (ui: 2D on the Interface bus · own: 2D, yours · world: placed where it happens, 2D when it is yours), CS2's
// distance curve, priority and voice limits. Played by gdPlay(); the shared callers (guns, footsteps, handling) reach
// it through sound-bank's route while a match is on (gdAudio(true)); other modes never touch it.
// Units, once: 1 Hammer unit (HU, CS2's) = 1 inch = 2.54 cm; 1 game unit = 16.5 cm ≈ 6.5 HU (arena-move.js HU =
// 2.54 / 16.5 game units per HU). CS2's curves are in HU: a sound `d` game units away is read at d / HU.
// docs/GD-SOUNDS.md lists every event, its CS2 event and file, and what the local import covers.
import { audioCtx, master, uiBus, ringBus, reverb, duck, HU_UNITS } from './spatial-audio.js';
import { want, ready, bufferOf, setSoundRoute, roomSoundNames, sameSource, FX } from './sound-bank.js';
import { userAssets } from './user-assets.js';
import { WEAPONS, isFirearm } from './weapons-data.js';
import { REF } from './gd-sounds-ref.js';
export const HU = HU_UNITS;
const take = (n, k = FX[n] || 1) => Array.from({ length: k }, (_, i) => `fx-${n}-${i}`), steps = s => [0, 1, 2, 3, 4].map(i => `step-${s}-${i}`);
const reloadClass = id => { const w = WEAPONS.find(x => x.id === id), k = w?.kind; return ['pistol', 'deagle', 'usps', 'p250', 'fiveseven', 'cz75', 'tec9'].includes(id) ? 'pistol' : ['shotgun', 'xm1014'].includes(id) ? 'pump' : ['ssg08', 'sniper'].includes(id) ? 'bolt' : k === 'lmg' ? 'lmg' : k === 'smg' ? 'smg' : 'rifle'; };
// CS2's weapon names (weapons.vdata / game_sounds_weapons): this game's gun id → its sound events' prefix.
export const CS2_GUN = { pistol: 'Glock', usps: 'USP', p250: 'P250', fiveseven: 'FiveSeven', cz75: 'CZ75A', tec9: 'tec9', deagle: 'DEagle', mac10: 'MAC10', mp9: 'MP9', mp7: 'MP7', smg: 'MP5', bizon: 'bizon', ump45: 'UMP45', p90: 'P90', shotgun: 'Nova', xm1014: 'XM1014', galil: 'GalilAR', famas: 'FAMAS', ak: 'AK47', m4: 'M4A4', m4s: 'M4A1', sg553: 'sg556', aug: 'AUG', ssg08: 'SSG08', sniper: 'AWP', lmg: 'M249', negev: 'Negev' };
// (suppressed: their own events — the USP-S and M4A1-S fitted, the MP5-SD is suppressed itself — with no distant layer)
const FIRE_EV = { usps: 'Weapon_USP.SilencedShot', m4s: 'Weapon_M4A1.Silenced' }, NO_FAR = { usps: 1, m4s: 1, smg: 1 };
export const NADE_CS2 = { he: 'HEGrenade', flash: 'Flashbang', smoke: 'SmokeGrenade', decoy: 'Decoy', molotov: 'Molotov', incendiary: 'IncGrenade' };
// Surfaces (arena-scene surfaceAt / map-light SURFACES) → CS2's footstep material; a bullets' box material → CS2's
// bullet-impact family.
export const STEP_CS2 = { concrete: 'Concrete', metal: 'SolidMetal', wood: 'Wood', grass: 'Grass', carpet: 'Carpet' };
export const IMPACT_OF = { wood: 'wood', crate: 'wood', door: 'wood', glass: 'glass', plaster: 'plaster', roof: 'plaster', metal: 'metal', 'metal-blue': 'metal', 'metal-green': 'metal', 'metal-red': 'metal', sand: 'sand', adobe: 'concrete', brick: 'concrete', concrete: 'concrete', stone: 'concrete', flesh: 'flesh' };
// Voice categories ("mix"): how many may sound at once, and the whole bank's cap. Full: the quietest of the lowest
// priority goes (faded over CS2's 0.1 s fadetime), or the new one is dropped if everything sounding outranks it.
export const MIX = { gun: 14, far: 6, step: 8, impact: 6, foley: 8, boom: 6, bomb: 3, ui: 4, loop: 4 };
export const VOICES = 40;
// The events. cs: CS2's event (game_sounds_*.vsndevts); f: shipped placeholders; cat; mix; pr: priority (0 … 3);
// pv / prate: the placeholder's own level and rate (never applied to a CS2 file); clip: CS2's first-person clip that
// carries it (fp-sounds.js: models.fpSounds — CS2's clip events at their moments); far: the distant layer played with it;
// syn: a synthesized stand-in when neither file is there.
export const EVENTS = {};
const E = (id, cs, f, o = {}) => { EVENTS[id] = { id, cs, f, cat: 'world', mix: 'foley', pr: 1, ...o }; };
// (handling events under another name: the CZ75's are Weapon_CZ.*, the M4A4 shares the M4A1's; shells and boxes)
const HANDLE = { cz75: 'Weapon_CZ', m4: 'Weapon_M4A1' }, RELOAD_EV = { shotgun: '.Insertshell', xm1014: '.InsertShell', lmg: '.Boxout', negev: '.Boxout' }, ACTION_EV = { shotgun: '.Pump', ssg08: '.BoltBack', sniper: '.BoltBack' };
for (const w of WEAPONS.filter(isFirearm)) { const g = w.id, P = 'Weapon_' + CS2_GUN[g], H = HANDLE[g] || P, cls = reloadClass(g);
  E(`gun.${g}.fire`, FIRE_EV[g] || P + '.Single', ['shot-' + g, 'shot-' + g + '-b', 'shot-' + g + '-c'], { mix: 'gun', pr: 2, far: NO_FAR[g] ? null : `gun.${g}.far`, wet: 1 });
  if (!NO_FAR[g]) E(`gun.${g}.far`, P + '.SingleDistant', ['shot-' + g + '-far'], { mix: 'far', pr: 1, layer: 1 });
  E(`gun.${g}.reload`, H + (RELOAD_EV[g] || '.Clipout'), [`reload-${cls}-grab`, `reload-${cls}-0`, `reload-${cls}-1`, `reload-${cls}-2`], { clip: 'reload', pv: .9 });
  E(`gun.${g}.draw`, H + '.Draw', take('draw'), { clip: 'draw', pv: .7 });
  E(`gun.${g}.inspect`, null, [], { clip: 'inspect' });
  if (ACTION_EV[g]) E(`gun.${g}.action`, P + ACTION_EV[g], [`reload-${cls}-2`], { clip: 'fire', pv: .9 }); }
E('gun.dry.rifle', 'Default.ClipEmpty_Rifle', take('dry'), { pv: .7 }); E('gun.dry.pistol', 'Default.ClipEmpty_Pistol', take('dry'), { pv: .7 });
E('gun.scope', 'Weapon_AWP.Zoom', take('scope'), { pv: .5, prate: 1.2 });
E('gun.casing', 'Bounce.Shell', take('casing'), { mix: 'impact', pr: 0, pv: .16, prate: 1.6 }); E('gun.casing.shotgun', 'Bounce.ShotgunShell', take('casing'), { mix: 'impact', pr: 0, pv: .16, prate: 1.05 });
E('gun.move', 'Weapon.WeaponMove1', [], { pr: 0 });
E('knife.draw', 'Weapon_Knife.Deploy', take('knifedraw'), { clip: 'draw', pv: .5 });
E('knife.slash', 'Weapon_Knife.Slash', take('slash'), { clip: 'light', pv: .7, prate: 1.05 }); E('knife.slash.heavy', 'Weapon_Knife.Swish.Heavy', take('slash'), { clip: 'heavy', pv: .9, prate: .85 });
E('knife.hit', 'Weapon_Knife.Hit', take('stab'), { pv: .8 }); E('knife.stab', 'Weapon_Knife.Stab', take('stab'), { pv: 1, prate: .9 }); E('knife.hitwall', 'Weapon_Knife.HitWall', take('wall'), { pv: .5 });
E('knife.inspect', null, [], { clip: 'inspect' });
for (const [k, P] of Object.entries(NADE_CS2)) {
  E(`nade.${k}.draw`, P + '.Draw', [], { clip: 'draw' }); E(`nade.${k}.pin`, k === 'molotov' ? 'Molotov.PreThrow' : P + '.PullPin', take('pin'), { clip: 'prime', pv: .8 });
  E(`nade.${k}.throw`, P + '.Throw', [], { clip: 'throw', syn: 'whoosh' });
  E(`nade.${k}.bounce`, k === 'decoy' ? 'Grenade.ImpactHard' : P + '.Bounce', take('bounce'), { mix: 'impact', pr: 1, pv: .6, prate: k === 'molotov' ? .8 : 1 }); }
E('nade.he.explode', 'BaseGrenade.Explode', take('he'), { mix: 'boom', pr: 3, pv: 1.5, far: 'nade.he.far', wet: 1, syn: 'blast' }); E('nade.he.far', 'BaseGrenade.ExplodeDistant', take('low'), { mix: 'boom', pr: 2, pv: 1.2, layer: 1 });
E('nade.flash.explode', 'Flashbang.Explode', take('flash'), { mix: 'boom', pr: 3, pv: 1.1, prate: 1.35, far: 'nade.flash.far', wet: .6, syn: 'pop' }); E('nade.flash.far', 'Flashbang.ExplodeDistant', [], { mix: 'boom', pr: 2, layer: 1 });
E('nade.flash.ring', 'Flashbang.Ring.Long', [], { cat: 'own', mix: 'ui', pr: 3, syn: 'ring' });
E('nade.smoke.emit', 'BaseSmokeEffect.Sound', take('poof'), { mix: 'boom', pr: 2, pv: .9, far: 'nade.smoke.far', syn: 'hiss' }); E('nade.smoke.far', 'BaseSmokeEffect.SoundDistant', [], { mix: 'boom', pr: 1, layer: 1 });
E('nade.smoke.clear', 'SmokeGrenade.Clear', [], { mix: 'foley' });
E('nade.decoy.pop', null, [], { mix: 'impact', syn: 'pop' });
E('nade.molotov.ignite', 'Molotov.Start', take('glass'), { mix: 'boom', pr: 3, pv: 1, far: 'nade.molotov.far', with: 'nade.molotov.smash', syn: 'blast' }); E('nade.molotov.far', 'Molotov.StartDistant', [], { mix: 'boom', pr: 1, layer: 1 }); E('nade.molotov.smash', 'Molotov.Smash', [], { mix: 'boom', pr: 2, layer: 1 });
E('nade.incendiary.ignite', 'IncGrenade.Start', take('glass'), { mix: 'boom', pr: 3, pv: 1, far: 'nade.incendiary.far', with: 'nade.incendiary.pop', syn: 'blast' }); E('nade.incendiary.far', 'IncGrenade.Distant', [], { mix: 'boom', pr: 1, layer: 1 }); E('nade.incendiary.pop', 'IncGrenade.Pop', [], { mix: 'boom', pr: 2, layer: 1 });
E('nade.molotov.air', 'Molotov.StartFailed', take('glass'), { mix: 'boom', pr: 2, pv: .8 }); E('nade.incendiary.air', 'IncGrenade.StartFailed', take('glass'), { mix: 'boom', pr: 2, pv: .8 });
E('nade.fire.loop', 'Inferno.Loop', take('fire'), { mix: 'loop', pr: 2, pv: .55, prate: .8 }); E('nade.fire.crackle', 'Inferno.Fire.Ignite', [], { mix: 'foley', pr: 0, syn: 'crackle' });
E('nade.fire.fade', 'Inferno.FadeOut', [], { mix: 'foley' }); E('nade.fire.out', 'Molotov.Extinguish', [], { mix: 'boom', pr: 2, syn: 'hiss' });
for (const [s, M] of Object.entries(STEP_CS2)) { E(`step.${s}`, `CT_${M}.StepLeft`, steps(s), { mix: 'step', pr: 2, pv: .55 }); E(`land.${s}`, `Land_${M}.StepLeft`, take('land'), { mix: 'step', pr: 2, pv: .45 }); }
E('step.ladder', 'CT_Ladder.StepLeft', steps('metal'), { mix: 'step', pr: 2, pv: .5 }); E('step.ladder.wood', 'CT_Wood_Ladder.StepLeft', steps('wood'), { mix: 'step', pr: 2, pv: .5 });
E('step.gear.ct', 'Gear.CT', [], { mix: 'step', pr: 1, layer: 1 }); E('step.gear.t', 'Gear.T', [], { mix: 'step', pr: 1, layer: 1 }); E('player.jump', 'Default.WalkJump', [], { mix: 'step', pr: 1 });
for (const [m, cs] of Object.entries({ concrete: 'Concrete', wood: 'Wood', metal: 'SolidMetal', glass: 'Glass', sand: 'Sand', dirt: 'Dirt', plaster: 'drywall', tile: 'Tile', flesh: 'Flesh' }))
  E(`impact.${m}`, cs + '.BulletImpact', take(m === 'flesh' ? 'flesh' : m === 'glass' ? 'glass' : 'wall'), { mix: 'impact', pr: m === 'flesh' ? 1 : 0, pv: m === 'flesh' ? .55 : .35 });
E('impact.ricochet', 'FX_RicochetSound.Ricochet', [], { mix: 'impact', pr: 0 });
E('item.drop', 'weapon.Rifle.Impact', take('bounce'), { mix: 'impact', pv: .5, prate: .7 }); E('item.drop.pistol', 'weapon.Pistol.Impact', take('bounce'), { mix: 'impact', pv: .45, prate: .8 });
E('item.pickup', 'Player.PickupWeapon', take('pickup'), { pv: .6 }); E('item.pickup.c4', 'Player.PickupC4', take('pickup'), { pv: .6 });
E('c4.initiate', 'c4.initiate', [], { mix: 'bomb', pr: 3, syn: 'beep' }); E('c4.key', 'c4.keypressquiet', [], { mix: 'bomb', pr: 3, syn: 'key' });
E('c4.beep', 'C4.PlantSound', [], { mix: 'bomb', pr: 3, syn: 'beep' }); E('c4.warn', 'C4.10Seconds', [], { mix: 'bomb', pr: 3 });
E('c4.disarm.start', 'c4.disarmstart', [], { mix: 'bomb', pr: 3 }); E('c4.disarm.finish', 'c4.disarmfinish', [], { mix: 'bomb', pr: 3 });
E('c4.explode', 'c4.explode', take('bomb'), { mix: 'boom', pr: 3, pv: 2, with: 'c4.explode.close', wet: 1.2, syn: 'blast' }); E('c4.explode.close', 'c4.explode.close', take('bomblow'), { mix: 'boom', pr: 3, pv: 2, layer: 1 });
E('c4.drop', 'weapon.C4.Impact', take('bounce'), { mix: 'impact', pv: .5, prate: .7 });
E('player.death', 'Player.Death', take('death'), { pr: 2, pv: .7 }); E('hurt.fall', 'Player.DamageFall', take('land'), { pr: 2, pv: .6 }); E('hurt.burn', 'Player.BurnDamage', [], { pr: 1 });
E('hurt.body', 'Player.DamageBody.Victim', [], { cat: 'own', pr: 3 }); E('hurt.head', 'Player.DamageHeadShot.Victim', [], { cat: 'own', pr: 3 });
E('hurt.body.onlooker', 'Player.DamageBody.Onlooker', take('flesh'), { mix: 'impact', pr: 1, pv: .5 }); E('hurt.head.onlooker', 'Player.DamageHeadShot.Onlooker', take('flesh'), { mix: 'impact', pr: 1, pv: .5 });
E('ui.hit', 'Player.DamageBody.AttackerFeedback', [], { cat: 'ui', mix: 'ui', pr: 3 }); E('ui.hit.head', 'Player.DamageHeadShot.AttackerFeedback', [], { cat: 'ui', mix: 'ui', pr: 3 });
E('ui.kill', 'Player.DeathBody.AttackerFeedback', take('kill'), { cat: 'ui', mix: 'ui', pr: 3, pv: .55 }); E('ui.kill.head', 'Player.DeathHeadShot.AttackerFeedback', take('kill'), { cat: 'ui', mix: 'ui', pr: 3, pv: .55 });
E('ui.buy', 'UIPanorama.buymenu_purchase', [], { cat: 'ui', mix: 'ui', pr: 2 }); E('ui.buy.fail', 'UIPanorama.buymenu_failure', [], { cat: 'ui', mix: 'ui', pr: 2 }); E('ui.menu', 'UIPanorama.buymenu_select', [], { cat: 'ui', mix: 'ui', pr: 1 });
E('ui.round.won', 'UIPanorama.round_report_round_won', [], { cat: 'ui', mix: 'ui', pr: 2 }); E('ui.round.lost', 'UIPanorama.round_report_round_lost', [], { cat: 'ui', mix: 'ui', pr: 2 });
E('world.glass.break', 'Glass.Break', take('glass'), { mix: 'impact', pr: 1, pv: 1 }); E('world.break', 'Wood.Break', take('wall'), { mix: 'impact', pr: 1, pv: .8 });
E('world.door.open', 'Door.wood_full_open', [], { pr: 1 }); E('world.door.close', 'Door.wood_full_close', [], { pr: 1 });
// (CS2's radio and announcer lines live in its game_sounds_vo_* events — not among the reference files read here; no
// event until they are: docs/GD-SOUNDS.md)

// CS2's reference values for each event above (gd-sounds-ref.js, generated from the local game_sounds_*.vsndevts by
// tools/import-cs2-sounds.mjs --ref): [volume, distance curve [[HU, gain]…], instance limit per source (0: none),
// occlusion intensity, pitch lo, pitch hi, delay s]. The curves' points are CS2's; between them this game interpolates
// linearly (CS2 draws a smooth spline through the same points: an approximation only between points). A placeholder
// plays with CS2's curve, limit and occlusion but its own level; a CS2 file with all of CS2's values.
export { REF };

const NO = {};
export const curveGain = (curve, hu) => { if (!curve || !curve.length) return 1; if (hu <= curve[0][0]) return curve[0][1]; for (let i = 1; i < curve.length; i++) { const p = curve[i], q = curve[i - 1]; if (hu <= p[0]) return q[1] + (p[1] - q[1]) * (hu - q[0]) / ((p[0] - q[0]) || 1); } return curve[curve.length - 1][1]; };
// (past its last point CS2 holds the last value; under CULL — about −34 dB — this game makes no voice at all)
export const CULL = .02;

// ── Each event resolved once (not per play): the room's CS2 override replaces files AND tuning (a placeholder's level or
// rate never reaches a CS2 file — GD-AUD-07); without one, the placeholder with CS2's curve, limit and occlusion. ──
const MIX_I = {}, CAP = []; for (const [k, n] of Object.entries(MIX)) { MIX_I[k] = CAP.length; CAP.push(n); }
let OV = {}; const RES = {};
function resolve(id) { const e = EVENTS[id], o = OV[id], R = e.cs ? REF[e.cs] : null, cs2 = !!o?.files?.length, pr = e.prate || 1;
  return { id, e, cs2, files: cs2 ? o.files : e.f, vol: cs2 ? (Number.isFinite(+o.vol) ? +o.vol : 1) : (e.pv ?? 1), curve: (cs2 && o.curve?.length ? o.curve : R?.[1]) || null,
    limit: (cs2 ? o.limit : null) ?? R?.[2] ?? 0, occl: (cs2 ? o.occl : null) ?? R?.[3] ?? .5, plo: cs2 ? (o.pitch?.[0] ?? 1) : pr * .97, phi: cs2 ? (o.pitch?.[1] ?? 1) : pr * 1.03,
    delay: cs2 ? (+o.delay || 0) : 0, mi: MIX_I[e.mix], pr: e.pr, cat: e.cat, far: e.far || null, with: e.with || null, wet: e.wet || 0 }; }
function rebuild(ov) { OV = ov || {}; for (const id in EVENTS) RES[id] = resolve(id); }
rebuild({});
export const gdEvent = id => RES[id] || null;
export const setGdOverrides = ov => rebuild(ov);   // (tests; the room's models.gdSounds otherwise)
let ovLoad = null;
export const loadGdOverrides = () => ovLoad ??= (typeof fetch === 'function' ? userAssets().catch(() => null) : Promise.resolve(null)).then(ua => { rebuild(ua?.models?.gdSounds || {}); return roomSoundNames().catch(() => null); });

// ── The ear: the listener's position read straight from the context (no object made). ──
let ctx = null; const ear = { x: 0, y: 0, z: 0 };
const readEar = () => { const L = ctx.listener; if (L.positionX) { ear.x = L.positionX.value; ear.y = L.positionY.value; ear.z = L.positionZ.value; } return ear; };

// ── Walls (GD-AUD-03): how blocked a point is (0 … 1, the game's hook: lab.js, a couple of bounded lines through the
// map's boxes), evaluated once when a sound starts, kept 250 ms for that spot and ear (a burst's shots, a run's steps
// reuse it), at most OCC_BUDGET new lines every 50 ms (a 5v5 fight: past it, the nearest cached answer or none). ──
let occFn = null; export const setGdOcclusion = fn => { occFn = typeof fn === 'function' ? fn : null; OCN = 0; };
const OCC_N = 32, OCC_MS = 250, OCC_BUDGET = 6, OC = new Float64Array(OCC_N * 7); let OCN = 0, OCI = 0, ocT = -1e9, ocUsed = 0;
export const occStats = { evaluated: 0, cached: 0, skipped: 0 };
function occlusionAt(x, y, z, now) { if (!occFn) return 0; let near = -1, nd = 1e9;
  for (let i = 0; i < OCN; i++) { const k = i * 7; if (now - OC[k + 3] > OCC_MS || Math.abs(OC[k + 4] - ear.x) > 1 || Math.abs(OC[k + 5] - ear.z) > 1 || Math.abs(OC[k + 6] - ear.y) > 1) continue;
    const d = Math.abs(OC[k] - x) + Math.abs(OC[k + 1] - y) + Math.abs(OC[k + 2] - z); if (d < 2) { occStats.cached++; return OCV[i]; } if (d < nd) { nd = d; near = i; } }
  if (now - ocT > 50) { ocT = now; ocUsed = 0; } if (++ocUsed > OCC_BUDGET) { occStats.skipped++; return near >= 0 && nd < 12 ? OCV[near] : 0; }
  let v = 0; try { v = Math.max(0, Math.min(1, +occFn(x, y, z) || 0)); } catch {} occStats.evaluated++;
  const i = OCI, k = i * 7; OCI = (OCI + 1) % OCC_N; if (OCN < OCC_N) OCN++; OC[k] = x; OC[k + 1] = y; OC[k + 2] = z; OC[k + 3] = now; OC[k + 4] = ear.x; OC[k + 5] = ear.z; OC[k + 6] = ear.y; OCV[i] = v; return v; }
const OCV = new Float64Array(OCC_N);

// ── Voices (GD-AUD-05): a fixed pool; CS2's instance limit per source and event (a gun's Single is 1: the next shot
// fades the last over CS2's 0.1 s fadetime), caps per mix and in all; a full mix gives up its lowest priority, quietest
// voice, or drops the newcomer when all outrank it (the bomb, a defuse, a close enemy's steps stay heard). ──
const FADE = .1;
const SLOTS = Array.from({ length: VOICES }, () => ({ busy: false, end: 0, mi: 0, src: null, id: null, pr: 0, lvl: 0, t0: 0, s: null, g: null }));
export const voiceStats = { started: 0, stolen: 0, dropped: 0, culled: 0, live: 0, peak: 0, nodes: 0 };
function release(v, t, fade) { v.busy = false; const s = v.s, g = v.g; v.s = v.g = null; if (!fade || !s) return; voiceStats.stolen++;
  try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + FADE); s.stop(t + FADE + .02); } catch {} }
const worse = (a, b) => !b || a.pr < b.pr || (a.pr === b.pr && (a.lvl < b.lvl || (a.lvl === b.lvl && a.t0 < b.t0)));
function acquire(r, src, lvl, t) { let free = null, inMix = 0, same = 0, oldSame = null, wMix = null, wAll = null, live = 0;
  for (let i = 0; i < SLOTS.length; i++) { const v = SLOTS[i]; if (v.busy && v.end <= t) release(v, t, false);
    if (!v.busy) { free ??= v; continue; } live++;
    if (v.mi === r.mi) { inMix++; if (v.pr <= r.pr && worse(v, wMix)) wMix = v; }
    if (src !== null && v.src === src && v.id === r.id) { same++; if (!oldSame || v.t0 < oldSame.t0) oldSame = v; }
    if (v.pr <= r.pr && worse(v, wAll)) wAll = v; }
  voiceStats.live = live;
  if (r.limit > 0 && same >= r.limit) { release(oldSame, t, true); return oldSame; }
  const out = v => { if (!v || (v.pr === r.pr && v.lvl > lvl)) { voiceStats.dropped++; return null; } release(v, t, true); return v; };
  if (inMix >= CAP[r.mi]) return out(wMix);
  return free || out(wAll); }
export const liveVoices = (t = ctx?.currentTime ?? 0) => { let n = 0; for (const v of SLOTS) if (v.busy && v.end > t) n++; return n; };
export function resetVoices() { for (const v of SLOTS) { v.busy = false; v.s = v.g = null; } for (const k in voiceStats) voiceStats[k] = 0; }   // (tests)

// ── Dedupe (GD-AUD-07/12): an event that can arrive twice (your prediction and the host's echo, a snapshot replayed,
// a grenade's phase seen again after a hitch) carries a key; the same key within 1.5 s plays once. ──
const KEYS = new Array(48).fill(null), KEY_T = new Float64Array(48); let keyI = 0;
function seenKey(key, now) { for (let i = 0; i < KEYS.length; i++) if (KEYS[i] === key && now - KEY_T[i] < 1500) return true; KEYS[keyI] = key; KEY_T[keyI] = now; keyI = (keyI + 1) % KEYS.length; return false; }

// A file of the event that is decoded (a random take; else the first ready), or null — and the event's files asked for.
function pick(r) { const F = r.files, n = F.length; if (!n) return null; const s = Math.random() * n | 0; for (let i = 0; i < n; i++) { const f = F[(s + i) % n]; if (ready(f)) return f; } want(F); return null; }
let nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()); export const setGdNow = f => { nowMs = f; };   // (tests)
// Play one event. o: { at ({x, y, z} game units; null: yours), src (who makes it: a player id, 'me', 'decoy:7' — for CS2's
// instance limits), key (dedupe), delay (s), gain (× the event's level), abs (gain is the level: a clip event's own
// volume), rate, name (this file of the event: a reload stage, a clip's sound), loop (s: a loop, returns { stop }) }.
// Returns true when handled (played, or placed out of earshot / outranked — on purpose silent), false when none of its
// files is decoded yet (asked for now: the caller plays its stand-in).
export function gdPlay(id, o = NO) {
  const r = RES[id]; if (!r) return false; if (o.key && seenKey(o.key, nowMs())) return true;
  const name = o.name ? (ready(o.name) ? o.name : (want([o.name]), null)) : pick(r); if (!name) return false;
  let c; try { c = ctx ??= audioCtx(); } catch { return false; }
  const at = r.cat === 'world' ? o.at || null : null, t = c.currentTime + (o.delay || 0) + r.delay; readEar();
  const hu = at ? Math.hypot(at.x - ear.x, at.y - ear.y, at.z - ear.z) / HU : 0;
  let gain = (o.abs ? 1 : r.vol) * (o.gain ?? 1) * (r.cat === 'ui' ? 1 : curveGain(r.curve, hu));   // (yours: the curve at 0 — CS2 hears your own steps at its first point, .45)
  if (gain < CULL) { voiceStats.culled++; layers(r, o); return true; }
  const occ = at && r.occl > 0 ? occlusionAt(at.x, at.y, at.z, nowMs()) * r.occl : 0; gain *= 1 - .55 * occ;   // (CS2 scales occlusion by each event's intensity; the −5 dB and the lowpass at full are this game's approximation)
  const v = acquire(r, o.src ?? (at ? null : 'me'), gain, c.currentTime); if (!v) { layers(r, o); return true; }
  const buf = bufferOf(name); if (!buf) return false;
  try { const s = c.createBufferSource(), g = c.createGain(); s.buffer = buf; s.playbackRate.value = o.rate || (r.plo + Math.random() * (r.phi - r.plo)); g.gain.value = gain; s.connect(g); let head = g, nodes = 2;
    if (occ > .02) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 18000 - 16500 * occ; head.connect(f); head = f; nodes++; }
    if (at) { const p = c.createPanner(); p.panningModel = r.pr >= 2 && hu < 1500 ? 'HRTF' : 'equalpower'; p.distanceModel = 'linear'; p.rolloffFactor = 0; p.refDistance = 1; p.maxDistance = 1e5;   // (the distance law is CS2's curve above, not Web Audio's: rolloff 0)
      p.channelCount = 1; p.channelCountMode = 'explicit';   // (a placed sound is a point: a stereo recording folded to mono first — GD-AUD-18)
      if (p.positionX) { p.positionX.value = at.x; p.positionY.value = at.y; p.positionZ.value = at.z; } else p.setPosition?.(at.x, at.y, at.z); head.connect(p); head = p; nodes++; }
    head.connect(r.cat === 'ui' ? uiBus(c) : o.ring ? ringBus(c) : master(c));
    if (r.wet) { const w = c.createGain(); w.gain.value = gain * r.wet * (.12 + .3 * Math.min(1, hu / 1500)); g.connect(w).connect(reverb(c)); nodes++; }   // (more room the further off; the amounts are this game's)
    const dur = buf.duration / s.playbackRate.value; v.busy = true; v.mi = r.mi; v.src = o.src ?? (at ? null : 'me'); v.id = r.id; v.pr = r.pr; v.lvl = gain; v.t0 = t; v.s = s; v.g = g;
    voiceStats.started++; voiceStats.nodes += nodes; let live = 0; for (const x of SLOTS) if (x.busy) live++; voiceStats.live = live; if (live > voiceStats.peak) voiceStats.peak = live;
    if (o.loop) { s.loop = true; v.end = t + o.loop + .1; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .4); g.gain.setValueAtTime(gain, t + Math.max(.5, o.loop - 1)); g.gain.linearRampToValueAtTime(0, t + o.loop); s.start(t, Math.random() * buf.duration * .5); s.stop(t + o.loop + .05);
      layers(r, o); return { stop() { try { const n = c.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + .35); s.stop(n + .4); v.end = n + .4; } catch {} } }; }
    v.end = t + dur + .02; s.start(t);
  } catch { return false; }
  layers(r, o); return true; }
// CS2 starts an event's child events with it: the distant layer (its own curve: silent close by, so never rolled off
// twice) and any extra layer (a molotov's smash, the C4's close blast).
function layers(r, o) { if (o.layer) return; if (r.far) gdPlay(r.far, LAYER_OPTS(o)); if (r.with) gdPlay(r.with, LAYER_OPTS(o)); }
const LO = { at: null, src: null, delay: 0, gain: 1, layer: 1, ring: false }; const LAYER_OPTS = o => { LO.at = o.at || null; LO.src = o.src ?? null; LO.delay = o.delay || 0; LO.gain = o.gain ?? 1; LO.ring = !!o.ring; return LO; };

// ── Small synthesized stand-ins (no file of the event yet): the throw's whoosh. ──
let whooshBuf = null;
export function synthWhoosh(at = null) { try { const c = ctx ??= audioCtx(), t = c.currentTime; if (!whooshBuf) { const n = Math.ceil(c.sampleRate * .25); whooshBuf = c.createBuffer(1, n, c.sampleRate); const d = whooshBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.5); }
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = whooshBuf; f.type = 'bandpass'; f.frequency.value = 1800; g.gain.value = .25; s.connect(f).connect(g).connect(master(c)); s.start(t); return true; } catch { return false; } }

// ── The routes from the shared bank (sound-bank.js) while a match is on: undefined leaves a call to the bank (its
// files, the other modes' tuning) — also while GD's own copy is still decoding. ──
const gunHas = id => !!RES[`gun.${id}.fire`];
const CASING = { delay: 0, gain: 1 };
export function gdShot(id, o = NO) { if (!gunHas(id)) return undefined; const at = o.at || null, src = o.src ?? (at ? null : 'me');
  const ok = gdPlay(`gun.${id}.fire`, SHOT_OPTS(at, src, o.delay || 0)); if (!ok) return undefined;
  if (!at && Math.random() < .85) { CASING.delay = (o.delay || 0) + .32 + Math.random() * .18; gdPlay(WEAPONS.find(w => w.id === id)?.kind === 'shotgun' ? 'gun.casing.shotgun' : 'gun.casing', CASING); }   // (your own spent case: unplaced, never off along a world axis — GD-AUD-17)
  return true; }
const SO = { at: null, src: null, delay: 0 }; const SHOT_OPTS = (at, src, delay) => { SO.at = at; SO.src = src; SO.delay = delay; return SO; };
const FX_ROUTE = { flesh: 'impact.flesh', knifedraw: 'knife.draw', scope: 'gun.scope', pin: 'nade.he.pin', land: 'land.concrete', death: 'player.death', kill: 'ui.kill', pickup: 'item.pickup', dry: 'gun.dry.rifle' };
function fxEvent(name, o) { if (name === 'wall') return 'impact.' + (IMPACT_OF[o?.mat] || 'concrete'); if (name === 'slash') return (o?.rate ?? 1) < 1 ? 'knife.slash.heavy' : 'knife.slash'; if (name === 'stab') return (o?.rate ?? 1) < 1 ? 'knife.stab' : 'knife.hit';
  if (name === 'draw') return o?.gid && RES[`gun.${o.gid}.draw`] ? `gun.${o.gid}.draw` : 'gun.ak.draw';
  if (name === 'nadedraw' || name === 'toss' || name === 'pin') { const k = RES[`nade.${o?.gid}.pin`] ? o.gid : 'he'; return `nade.${k}.${name === 'nadedraw' ? 'draw' : name === 'toss' ? 'throw' : 'pin'}`; }
  if (name === 'dry') return WEAPONS.find(w => w.id === o?.gid)?.kind === 'pistol' ? 'gun.dry.pistol' : 'gun.dry.rifle'; if (name === 'glass') return o?.at ? 'world.glass.break' : null; if (name === 'casing') return o?.at ? 'gun.casing' : null; return FX_ROUTE[name] || null; }
const FXO = { at: null, src: null, delay: 0, mat: null };
export const ROUTE = {
  shot: (id, o) => gdShot(id, o),
  fx(name, o = NO) { const ev = fxEvent(name, o); if (!ev) return undefined; FXO.at = o.at || null; FXO.src = o.src ?? null; FXO.delay = o.delay || 0; return gdPlay(ev, FXO) || undefined; },
  // (a reload's stages, tied to its moments by weapons.js / multiplayer.js — magazine out, in, bolt: the gun's own CS2
  // stage when the room has it, else its class's; the event's curve and voices, the bank's stage levels)
  reload(part, id, at) { const r = RES[`gun.${id}.reload`]; if (!r) return undefined; const cls = reloadClass(id), own = `reload-${id}-${part}`;
    if (part === 0) gdPlay(r.id, RL(at, `reload-${cls}-grab`, .55, 0));
    return gdPlay(r.id, RL(at, ready(own) ? own : `reload-${cls}-${part}`, .9, part === 0 ? .12 : 0)) || undefined; },
  step(surface, at, volume, src) { return gdStep(surface, at, src) || undefined; },
};
const RLO = { at: null, name: null, gain: 1, delay: 0, src: null, abs: true }; const RL = (at, name, gain, delay) => { RLO.at = at; RLO.name = name; RLO.gain = gain; RLO.delay = delay; RLO.src = at ? null : 'me'; return RLO; };
const STO = { at: null, src: null };
export function gdStep(surface, at = null, src = null) { STO.at = at; STO.src = src; return gdPlay(RES[`step.${surface}`] ? `step.${surface}` : 'step.concrete', STO); }
// A first-person clip's sound (fp-sounds.js: CS2's clip event — its own volume and pitch) as the set's event: placed,
// limited and curved like the rest. The set → the event whose curve carries it.
const CLIP_EV = s => RES[`gun.${s}.reload`] ? `gun.${s}.reload` : RES[`nade.${s}.pin`] ? `nade.${s}.pin` : s === 'c4' ? 'c4.key' : 'knife.slash';
const CLO = { at: null, name: null, gain: 1, abs: true, rate: 1, src: null };
export function gdClip(set, name, vol, rate, at, src = null) { CLO.at = at; CLO.name = name; CLO.gain = vol; CLO.rate = rate; CLO.src = src ?? (at ? null : 'me'); return gdPlay(CLIP_EV(set), CLO); }

// ── On / off (lab.js, every frame: cheap), and decoding ahead (GD-AUD-13): on entering a match the events of grenades,
// the bomb, steps, impacts, hits and the UI; a gun's own when it is first seen (yours or someone else's). ──
let on = false; export const gdOn = () => on;
export function gdAudio(v) { v = !!v; if (v === on) return; on = v; setSoundRoute(on ? ROUTE : null); if (on) { loadGdOverrides().then(() => { if (on) gdPrewarm(); }); } }
const PREWARM = /^(nade|c4|step|land|impact|item|ui|hurt|player|world|knife|gun\.(dry|scope|casing))/;
export function gdPrewarm() { const names = []; for (const id in RES) if (PREWARM.test(id)) names.push(...RES[id].files); return want(names); }
const gunsWanted = new Set();
export function gdWantGun(id) { if (!id || gunsWanted.has(id)) return; gunsWanted.add(id); loadGdOverrides().then(() => { const n = []; for (const k of ['fire', 'far', 'reload', 'action']) if (RES[`gun.${id}.${k}`]) n.push(...RES[`gun.${id}.${k}`].files); want(n); }); }
// A flash (GD-AUD-10): CS2's ring (or the caller's tone) on the Effects bus after the duck, and the world dulled.
export function gdFlashed(amount, secs) { duck(amount, secs); return gdPlay('nade.flash.ring', { ring: true, gain: Math.min(1, amount), key: null }); }
export { sameSource };
