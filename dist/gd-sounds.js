// Global Defensive's sound bank: every GD sound event → its shipped placeholder(s) (dist/sounds: CC0 and the owner's
// recordings — never CS2's), the room's optional CS2 override (the user's own CS2 install, imported on that computer by
// tools/import-cs2-sounds.mjs into user-assets/sounds + manifest models.gdSounds: never committed, never shipped), its
// category (ui: 2D on the Interface bus · own: 2D, yours · world: placed where it happens, 2D when it is yours), CS2's
// distance curve, priority and voice limits. Played by gdPlay(); the shared callers (guns, footsteps, handling) reach
// it through sound-bank's route while a match is on (gdAudio(true)); other modes never touch it.
// Units, once: 1 Hammer unit (HU, CS2's) = 1 inch = 2.54 cm; 1 game unit = 16.5 cm ≈ 6.5 HU (arena-move.js HU =
// 2.54 / 16.5 game units per HU). CS2's curves are in HU: a sound `d` game units away is read at d / HU.
// docs/GD-SOUNDS.md lists every event, its CS2 event and file, and what the local import covers.
import { surfaceOf } from './gd-surface-props.js';   // (v53: a bullet impact's CS2 sound by surface)
import { audioCtx, master, uiBus, musicBus, ringBus, reverb, duck, HU_UNITS, listenerFrame, setRanges } from './spatial-audio.js';
import { want, ready, bufferOf, setSoundRoute, roomSoundNames, sameSource, FX } from './sound-bank.js';
import { userAssets } from './user-assets.js';
import { WEAPONS, isFirearm } from './weapons-data.js';
import { REF } from './gd-sounds-ref.js';
import { RELOAD_REF, RELOAD_SND } from './gd-reload-ref.js';   // (v53 RELOAD: CS2's reload sound events, the silent reload)
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
// (v53 stage 5: each class's CS2 surface property's own audiosounds.bulletimpact, surfaceproperties.vsurf in the user's
// install — gd-surface-props.js: plaster's is Concrete.BulletImpact, a tiled roof's Tile.BulletImpact; any other name,
// a CS2 door's or breakable's own surface property, goes by its event's family: impactFamily)
export const IMPACT_OF = { wood: 'wood', crate: 'wood', door: 'wood', glass: 'glass', plaster: 'concrete', roof: 'tile', metal: 'metal', 'metal-blue': 'metal', 'metal-green': 'metal', 'metal-red': 'metal', sand: 'sand', adobe: 'concrete', brick: 'concrete', concrete: 'concrete', stone: 'concrete', flesh: 'flesh' };
const FAMILY = [[/^(SolidMetal|Metal|MetalVehicle|MetalBarrel|MetalGrate|ChainLink|Computer)/, 'metal'], [/^Wood/, 'wood'], [/^Glass/, 'glass'], [/^Sand/, 'sand'], [/^(Dirt|grass|Mud)/, 'dirt'], [/^Tile/, 'tile'], [/^drywall/, 'plaster'], [/^Flesh/, 'flesh']];
export const impactFamily = mat => { if (IMPACT_OF[mat]) return IMPACT_OF[mat]; const ev = surfaceOf(mat).sound || ''; for (const [re, f] of FAMILY) if (re.test(ev)) return f; return 'concrete'; };
// Voice categories ("mix"): how many may sound at once, and the whole bank's cap. Full: the quietest of the lowest
// priority goes (faded over CS2's 0.1 s fadetime), or the new one is dropped if everything sounding outranks it.
export const MIX = { gun: 14, far: 6, step: 8, impact: 6, foley: 8, boom: 6, bomb: 3, ui: 4, loop: 4, music: 1, radio: 2 };   // (music: one at a time — CS2's stop_music)
export const VOICES = 40;
// (v53 S3) Our own synthesized hit / headshot stand-ins (synthSamples below): the event's `syn` when no file is there.
export const SYNTH_KINDS = ['hit.body', 'hs.flesh', 'hs.helmet', 'hs.kill', 'hs.kill.helmet'];
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
E('nade.incendiary.ignite', 'IncGrenade.Start', [], { mix: 'boom', pr: 3, pv: 1, far: 'nade.incendiary.far', with: 'nade.incendiary.pop', syn: 'blast' }); E('nade.incendiary.far', 'IncGrenade.Distant', [], { mix: 'boom', pr: 1, layer: 1 }); E('nade.incendiary.pop', 'IncGrenade.Pop', [], { mix: 'boom', pr: 2, layer: 1 });
E('nade.molotov.air', 'Molotov.StartFailed', take('glass'), { mix: 'boom', pr: 2, pv: .8, far: 'nade.molotov.far' }); E('nade.incendiary.air', 'IncGrenade.StartFailed', [], { mix: 'boom', pr: 2, pv: .8, far: 'nade.incendiary.far' });   // (FIRE final: CS2's StartFailed events carry the distant layer as their soundevent_01 — Molotov.StartDistant / IncGrenade.Distant, game_sounds_weapons.vsndevts; the can's stand-in is no bottle's glass: arena-nades-view's own pop)
E('nade.fire.loop', 'Inferno.Loop', take('fire'), { mix: 'loop', pr: 2, pv: .55, prate: .8 }); E('nade.fire.crackle', 'Inferno.Fire.Ignite', [], { mix: 'foley', pr: 0, cap: 3, syn: 'crackle' });   // (FIRE final: played as each flame lights — arena-nades-view onFlame; instance_limit 3, volume 0.3: the vsndevts)
E('nade.fire.fade', 'Inferno.FadeOut', [], { mix: 'foley' }); E('nade.fire.out', 'Molotov.Extinguish', [], { mix: 'boom', pr: 2, syn: 'douse' });   // (FIRE final: its own stand-in id — never the smoke's 'hiss')
// (steps and landings: CS2's Base.Footstep / Base.Land — reverb_wet 1.0, distance_effect_mix 1.0 / 0.6, the sound 20 HU over the
// feet: position_offset [0, 0, 20] — STEP_UP)
for (const [s, M] of Object.entries(STEP_CS2)) { E(`step.${s}`, `CT_${M}.StepLeft`, steps(s), { mix: 'step', pr: 2, pv: .55, wet: 1, dm: 1 }); E(`land.${s}`, `Land_${M}.StepLeft`, take('land'), { mix: 'step', pr: 2, pv: .45, wet: 1, dm: .6 }); }
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
// ── Hit and headshot feedback (v53 S3, spec 2.2): the only sounds v53 adds. CS2's events, read in the local
// game_sounds_player.vsndevts (cs2ref): the helmet ("Armor") and bare-head variants of the attacker's feedback, the
// victim's and the onlookers' — Player.DamageHeadShotArmor.AttackerFeedback (headshot_armor_e1.vsnd, volume .5,
// block_other_name DeathHeadShotArmor), Player.DamageHeadShot.AttackerFeedback (headshot_noarmor_01…05),
// Player.DeathHeadShotArmor.AttackerFeedback (volume 0: its child events Player.DeathHeadShot.AttackerFeedback.Dink —
// headshot_armor_e1, volume .6, pitch 1.1 — and .Flesh — headshot_armor_flesh, volume .3),
// Player.DeathHeadShot.AttackerFeedback, Player.DamageHeadShot(Armor).Victim, Player.DamageHeadShot(Armor).Onlooker.
// cap: at most 2 voices of each at once (the oldest gives way); yours on the ui mix. syn: our own stand-in, synthesized
// once at the match's load (synthSamples below), played when no file of the event is there.
E('hurt.body', 'Player.DamageBody.Victim', [], { cat: 'own', mix: 'ui', pr: 3, cap: 2 }); E('hurt.head', 'Player.DamageHeadShot.Victim', [], { cat: 'own', mix: 'ui', pr: 3, cap: 2, pv: .5, syn: 'hs.flesh' });
E('hurt.head.helmet', 'Player.DamageHeadShotArmor.Victim', [], { cat: 'own', mix: 'ui', pr: 3, cap: 2, pv: .45, syn: 'hs.helmet' });
E('hurt.body.onlooker', 'Player.DamageBody.Onlooker', take('flesh'), { mix: 'impact', pr: 1, pv: .5 }); E('hurt.head.onlooker', 'Player.DamageHeadShot.Onlooker', take('flesh'), { mix: 'impact', pr: 1, pv: .5, cap: 2 });
E('hurt.head.helmet.onlooker', 'Player.DamageHeadShotArmor.Onlooker', [], { mix: 'impact', pr: 2, pv: .6, cap: 2, syn: 'hs.helmet' });   // (CS2's curve is the bare head's own — out to 1070 HU: the brighter ping is what carries)
// (v53 S3 fix) A headshot that KILLS: CS2's own Death* events for the victim and the onlookers (game_sounds_player.vsndevts:
// Player.DeathHeadShot.Victim line 4844 — vol .55, headshot_noarmor_02/04/05; Player.DeathHeadShotArmor.Victim 4844+210 —
// vol .7, player_damagebody_05–07, enable_child_events: soundevent_01 = Player.DeathHeadShot.Victim.Flesh (vol .2) and
// .Victim.Dink (vol .7); Player.DeathHeadShot.Onlooker 4917 — vol .5, headshot_noarmor_01–05; Player.DeathHeadShotArmor
// .Onlooker 4983 — vol .5, player_damagebody_05–07, children Player.DeathHeadShot.Flesh and .Dink). A parent with
// children plays its own files with both children as its layers (with: two ids).
E('hurt.head.kill', 'Player.DeathHeadShot.Victim', [], { cat: 'own', mix: 'ui', pr: 3, cap: 2, pv: .55, syn: 'hs.flesh' });
E('hurt.head.helmet.kill', 'Player.DeathHeadShotArmor.Victim', [], { cat: 'own', mix: 'ui', pr: 3, cap: 2, pv: .5, syn: 'hs.helmet', with: ['hurt.head.helmet.kill.dink', 'hurt.head.helmet.kill.flesh'] });
E('hurt.head.helmet.kill.dink', 'Player.DeathHeadShot.Victim.Dink', [], { cat: 'own', mix: 'ui', pr: 3, cap: 2, layer: 1 }); E('hurt.head.helmet.kill.flesh', 'Player.DeathHeadShot.Victim.Flesh', [], { cat: 'own', mix: 'ui', pr: 3, cap: 2, layer: 1 });
E('hurt.head.kill.onlooker', 'Player.DeathHeadShot.Onlooker', take('flesh'), { mix: 'impact', pr: 1, pv: .5, cap: 2 });
E('hurt.head.helmet.kill.onlooker', 'Player.DeathHeadShotArmor.Onlooker', [], { mix: 'impact', pr: 2, pv: .6, cap: 2, syn: 'hs.helmet', with: ['hurt.head.helmet.kill.onlooker.dink', 'hurt.head.helmet.kill.onlooker.flesh'] });
E('hurt.head.helmet.kill.onlooker.dink', 'Player.DeathHeadShot.Dink', [], { mix: 'impact', pr: 2, cap: 2, layer: 1 }); E('hurt.head.helmet.kill.onlooker.flesh', 'Player.DeathHeadShot.Flesh', [], { mix: 'impact', pr: 1, cap: 2, layer: 1 });
E('ui.hit', 'Player.DamageBody.AttackerFeedback', [], { cat: 'ui', mix: 'ui', pr: 3, cap: 2, pv: .4, syn: 'hit.body' }); E('ui.hit.head', 'Player.DamageHeadShot.AttackerFeedback', [], { cat: 'ui', mix: 'ui', pr: 3, cap: 2, pv: .5, syn: 'hs.flesh' });
E('ui.hit.helmet', 'Player.DamageHeadShotArmor.AttackerFeedback', [], { cat: 'ui', mix: 'ui', pr: 3, cap: 2, pv: .5, syn: 'hs.helmet' });
E('ui.kill', 'Player.DeathBody.AttackerFeedback', take('kill'), { cat: 'ui', mix: 'ui', pr: 3, pv: .55, cap: 2 }); E('ui.kill.head', 'Player.DeathHeadShot.AttackerFeedback', [], { cat: 'ui', mix: 'ui', pr: 3, pv: .6, cap: 2, syn: 'hs.kill' });
// (CS2's Player.DeathHeadShotArmor.AttackerFeedback has volume 0 itself and plays its child events — enable_child_events,
// soundevent_01 = .Flesh, .Dink: the helmet kill is those two here, the Dink with the Flesh as its layer.)
E('ui.kill.head.helmet', 'Player.DeathHeadShot.AttackerFeedback.Dink', [], { cat: 'ui', mix: 'ui', pr: 3, pv: .6, cap: 2, syn: 'hs.kill.helmet', with: 'ui.kill.head.helmet.flesh' });
E('ui.kill.head.helmet.flesh', 'Player.DeathHeadShot.AttackerFeedback.Flesh', [], { cat: 'ui', mix: 'ui', pr: 3, cap: 2, layer: 1 });
E('ui.buy', 'UIPanorama.buymenu_purchase', [], { cat: 'ui', mix: 'ui', pr: 2 }); E('ui.buy.fail', 'UIPanorama.buymenu_failure', [], { cat: 'ui', mix: 'ui', pr: 2 }); E('ui.menu', 'UIPanorama.buymenu_select', [], { cat: 'ui', mix: 'ui', pr: 1 });
E('ui.round.won', 'UIPanorama.round_report_round_won', [], { cat: 'ui', mix: 'ui', pr: 2 }); E('ui.round.lost', 'UIPanorama.round_report_round_lost', [], { cat: 'ui', mix: 'ui', pr: 2 });
E('world.glass.break', 'Glass.Break', take('glass'), { mix: 'impact', pr: 1, pv: 1 }); E('world.break', 'Wood.Break', take('wall'), { mix: 'impact', pr: 1, pv: .8 });
E('world.door.open', 'Door.wood_full_open', [], { pr: 1 }); E('world.door.close', 'Door.wood_full_close', [], { pr: 1 });
// The round's end: CS2's default music kit (soundevents/music/valve_cs2_01/game_sounds_music: Music.WonRound / LostRound —
// volume 1, snd_roundend_volume, priority 4, test_mvp_block; Music.MVPAnthem — volume .9, snd_mvp_volume, priority 5,
// block_won_lost, stop_music). 2D on the Music bus (Settings → Audio → Music). Which one: roundEndEvent below.
E('music.won', 'Music.WonRound.valve_cs2_01', [], { cat: 'music', mix: 'music', pr: 3 }); E('music.lost', 'Music.LostRound.valve_cs2_01', [], { cat: 'music', mix: 'music', pr: 3 });
E('music.mvp', 'Music.MVPAnthem.valve_cs2_01', [], { cat: 'music', mix: 'music', pr: 3 });
// The round's start: CS2's round start radio in a voice (talker: scripts/talker/<voice>.vrr, the lines of its four round
// start concepts — tools/import-cs2-sounds.mjs reads them from the install), 2D on the Interface bus, your team only.
// CS2's agents → their voice: items_game's vo_prefix where an agent has one, else the agent's own set (its model folder);
// the sides' defaults are CS2's map-based agents (ctm_sas, tm_phoenix). Valve's lines are never shipped: no placeholder.
export const VOICE_OF = { ctm_sas: 'sas', ctm_st6: 'seal', ctm_swat: 'swat', ctm_fbi: 'fbihrt', ctm_gendarmerie: 'gendarmerie_male', ctm_diver: 'seal_diver_01', tm_phoenix: 'phoenix', tm_leet: 'leet', tm_balkan: 'balkan', tm_professional: 'professional', tm_jungle_raider: 'jungle_male' };
export const VOICE_VARIANT = { ctm_diver_varianta: 'seal_fem', ctm_diver_variantb: 'seal_diver_01', ctm_diver_variantc: 'seal_diver_02', ctm_fbi_variantb: 'fbihrt_epic', ctm_gendarmerie_variantc: 'gendarmerie_fem_epic', ctm_st6_varianti: 'seal_epic', ctm_st6_variantk: 'gsg9', ctm_swat_variante: 'swat_epic', ctm_swat_variantf: 'swat_fem', ctm_swat_variantk: 'swat_fem',
  tm_balkan_varianth: 'balkan_epic', tm_jungle_raider_variantb: 'jungle_male_epic', tm_jungle_raider_variantb2: 'jungle_male_epic', tm_jungle_raider_variante: 'jungle_fem_epic', tm_jungle_raider_variantf: 'jungle_fem', tm_jungle_raider_variantf2: 'jungle_fem', tm_leet_variantf: 'leet_epic', tm_professional_varg: 'professional_fem', tm_professional_varj: 'professional_fem' };
export const SIDE_VOICE = { ct: 'sas', t: 'phoenix' };
// An agent's CS2 model ('CS2: agents/models/ctm_sas/ctm_sas (Steam depot)', models.agents[side].from) → its voice, or null.
export const voiceOfModel = from => { const m = /agents\/models\/([a-z0-9_]+)\/([a-z0-9_]+)/i.exec(String(from || '')); if (!m) return null; const f = m[1].toLowerCase(), v = m[2].toLowerCase(); return VOICE_VARIANT[v] || (/^tm_professional_varf\d*$/.test(v) ? 'professional_epic' : VOICE_OF[f] || null); };
// The voices worth importing for a computer's agents (models.agents): theirs and the sides' defaults.
export const roundStartVoices = (agents = {}) => [...new Set([voiceOfModel(agents?.ct?.from), voiceOfModel(agents?.t?.from), SIDE_VOICE.ct, SIDE_VOICE.t].filter(Boolean))];
export const RADIO_VOICES = [...new Set([...Object.values(VOICE_OF), ...Object.values(VOICE_VARIANT), 'professional_epic'])];
for (const v of RADIO_VOICES) E(`radio.start.${v}`, null, [], { cat: 'radio', mix: 'radio', pr: 3, talker: v });
// (CS2's announcer — "Counter-Terrorists win", vo/announcer/cs2_classic ctwin / terwin — is in the install but not one of
// the round's three music sounds asked for: no event.)

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
// The round's music and radio, under CS2's own volume (this game's levels: CS2's files are mastered hot — the stingers and
// the radio lines measure about −11 LUFS, the radio already band-limited in the file — and the round end must not cover
// the bomb or the round's UI; the Music slider scales the music on top). Needs a person with headphones to settle.
export const CAT_LEVEL = { music: .5, radio: .7 };
function resolve(id) { const e = EVENTS[id], o = OV[id], R = e.cs ? REF[e.cs] : null, cs2 = !!o?.files?.length, pr = e.prate || 1;
  return { id, e, cs2, files: cs2 ? o.files : e.f, vol: cs2 ? (Number.isFinite(+o.vol) ? +o.vol : 1) * (CAT_LEVEL[e.cat] ?? 1) : (e.pv ?? 1), curve: (cs2 && o.curve?.length ? o.curve : R?.[1]) || null,
    limit: (cs2 ? o.limit : null) ?? R?.[2] ?? 0, occl: (cs2 ? o.occl : null) ?? R?.[3] ?? .5, plo: cs2 ? (o.pitch?.[0] ?? 1) : pr * .97, phi: cs2 ? (o.pitch?.[1] ?? 1) : pr * 1.03,
    delay: cs2 ? (+o.delay || 0) : 0, mi: MIX_I[e.mix], pr: e.pr, cat: e.cat, flat: e.cat === 'ui' || e.cat === 'music' || e.cat === 'radio', sets: cs2 && Array.isArray(o.sets) ? o.sets : null,
    far: e.far || null, with: e.with || null, wet: e.wet || 0, dm: e.dm ?? (e.layer && e.mix !== 'step' ? 0 : DMIX[e.mix] ?? .5),
    cap: e.cap || 0, syn: e.syn && SYNTH_KINDS.includes(e.syn) ? e.syn : null }; }   // (v53 S3: cap — voices of this event at once; syn — our synthesized stand-in, only the kinds synthSamples makes)
// CS2's distance_effect_mix (how much of its distance filtering an event takes): a gun's Single 1.0, its SingleDistant 0
// (the far layer is already the distant sound), BaseGrenade.Explode 0, bounces / clip-outs .5, footsteps 1.0, landings .6.
const DMIX = { gun: 1, far: 0, step: 1, impact: .5, foley: .5, boom: 0, bomb: .5, loop: 0 };
function rebuild(ov) { OV = ov || {}; for (const id in EVENTS) RES[id] = resolve(id); }
rebuild({});
export const gdEvent = id => RES[id] || null;
export const setGdOverrides = ov => rebuild(ov);   // (tests; the room's models.gdSounds otherwise)
let ovLoad = null;
export const loadGdOverrides = () => ovLoad ??= (typeof fetch === 'function' ? userAssets().catch(() => null) : Promise.resolve(null)).then(ua => { rebuild(ua?.models?.gdSounds || {}); setAgentVoices(ua?.models?.agents); return roomSoundNames().catch(() => null); });
// The voice each side's radio speaks in: the room's agent for that side (cs2-agents.js draws it), else the side's default.
const SIDE_NOW = { ...SIDE_VOICE };
export function setAgentVoices(agents) { for (const s of ['ct', 't']) SIDE_NOW[s] = voiceOfModel(agents?.[s]?.from) || SIDE_VOICE[s]; }
export const teamVoice = side => SIDE_NOW[side] || null;

// ── The ear: the listener's position read straight from the context (no object made); its forward / up as lab.js set
// them this frame (spatial-audio listenerFrame). ──
let ctx = null; const ear = { x: 0, y: 0, z: 0 }, LF = { fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0 };
const readEar = () => { const L = ctx.listener; if (L.positionX) { ear.x = L.positionX.value; ear.y = L.positionY.value; ear.z = L.positionZ.value; } listenerFrame(LF); return ear; };

// ── Where a placed sound seems to be, besides how loud (package U: "a player running in mid sounds next to me, and I can't
// tell where"). CS2 gives distance, walls and direction more than a level: Steam Audio's HRTF (here the PannerNode's
// 'HRTF'), its distance filtering (each event's distance_effect_mix), its occlusion (occlusion_intensity over baked
// occlusion). This game's approximation — one lowpass and one gain per voice, set when the sound starts (a step lasts
// ~0.3 s), numbers only (no object):
//  · walls: occ (0 … 1, lab.js: 1 − e^(−Σ density × thickness) over the CS2 sight boxes crossed) × √intensity → up to
//    −24 dB and a lowpass down to 500 Hz. A footstep (intensity .375) behind one 26 HU concrete wall (occ .65): −9.6 dB,
//    ~4.3 kHz; before, −1.2 dB and 14 kHz: no wall could be heard. Floors count the same (the line crosses them).
//  · distance: the highs fade with distance — 20 kHz close, 3 kHz at 2500 HU (a gun's last curve point) — × the event's
//    distance_effect_mix (footsteps 1.0: ~8.7 kHz at their 1100 HU edge); with the reverb send rising with distance
//    (gdPlay: CS2's reverb_wet), a far step sounds far, not just quiet.
//  · behind: equalpower voices (far, low-priority — no front / back of their own) lose their top behind the ear (to
//    5 kHz straight behind, the lowpass). HRTF voices already carry the head's front / back colour: only a gentle
//    high-shelf on top (−5 dB over 8 kHz straight behind, × the event's distance_effect_mix ×2, none for an explosion's
//    0) — a 5 kHz lowpass there made a close open enemy behind you as dull as one behind a wall (review U). Horizontal: a
//    sound right under or over you is neither in front nor behind (the HRTF's elevation and the floor's occlusion tell
//    those). The wall / distance / behind amounts (occDb, occHz, airHz, backHz, backDb) are this game's tuning, not CS2
//    data (CS2 gives the per-event occlusion_intensity and distance_effect_mix they scale) — a headphones check sets them.
export const CUE = { occDb: 24, occHz: 500, airHz: 3000, airHu: 2500, backHz: 5000, backDb: 5, shelfHz: 8000, open: 16000 };
export const cue = { gain: 1, hz: 20000, back: 0, shelf: 0 };
export function placeCue(dx, dy, dz, hu, occ, intensity, dmix, f, out = cue, hrtf = false) {
  const o = Math.max(0, Math.min(1, +occ || 0)) * Math.sqrt(Math.max(0, +intensity || 0)); out.gain = Math.pow(10, -CUE.occDb * o / 20);
  let hz = 20000 * Math.pow(CUE.occHz / 20000, o); const a = Math.min(1, hu / CUE.airHu) * (dmix || 0); if (a > 0) hz = Math.min(hz, 20000 * Math.pow(CUE.airHz / 20000, a));
  // (the way you face, level: forward's level part, plus up's when you look steeply down or up — up then leans the way you face)
  const hx = f.fx - f.fy * f.ux, hz2 = f.fz - f.fy * f.uz, hl = Math.hypot(hx, hz2), dl = Math.hypot(dx, dz), d = Math.hypot(dx, dy, dz);
  const b = hl > 1e-6 && dl > 1e-6 ? Math.max(0, -(dx * hx + dz * hz2) / (hl * dl)) * (dl / d) : 0; if (b > 0 && !hrtf) hz = Math.min(hz, 20000 * Math.pow(CUE.backHz / 20000, b));
  out.shelf = hrtf && b > 0 ? -CUE.backDb * b * Math.min(1, 2 * (dmix || 0)) : 0; out.hz = hz; out.back = b; return out; }

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
export const voiceStats = { started: 0, stolen: 0, dropped: 0, culled: 0, live: 0, peak: 0, nodes: 0, music: 0, radio: 0, capped: 0 };   // (music, radio: the round's sounds started — tests)
function release(v, t, fade) { v.busy = false; const s = v.s, g = v.g; v.s = v.g = null; if (!fade || !s) return; voiceStats.stolen++;
  try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + FADE); s.stop(t + FADE + .02); } catch {} }
const worse = (a, b) => !b || a.pr < b.pr || (a.pr === b.pr && (a.lvl < b.lvl || (a.lvl === b.lvl && a.t0 < b.t0)));
function acquire(r, src, lvl, t) { let free = null, inMix = 0, same = 0, oldSame = null, wMix = null, wAll = null, live = 0, ev = 0, oldEv = null;
  for (let i = 0; i < SLOTS.length; i++) { const v = SLOTS[i]; if (v.busy && v.end <= t) release(v, t, false);
    if (!v.busy) { free ??= v; continue; } live++;
    if (v.mi === r.mi) { inMix++; if (v.pr <= r.pr && worse(v, wMix)) wMix = v; }
    if (src !== null && v.src === src && v.id === r.id) { same++; if (!oldSame || v.t0 < oldSame.t0) oldSame = v; }
    if (r.cap > 0 && v.id === r.id) { ev++; if (!oldEv || v.t0 < oldEv.t0) oldEv = v; }   // (v53 S3: the event's own cap, whoever plays it)
    if (v.pr <= r.pr && worse(v, wAll)) wAll = v; }
  voiceStats.live = live;
  if (r.limit > 0 && same >= r.limit) { release(oldSame, t, true); return oldSame; }
  if (r.cap > 0 && ev >= r.cap) { release(oldEv, t, true); voiceStats.capped++; return oldEv; }
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
  let c; try { c = ctx ??= audioCtx(); } catch { return false; }
  const at = r.cat === 'world' ? o.at || null : null, t = c.currentTime + (o.delay || 0) + r.delay; readEar();
  const dx = at ? at.x - ear.x : 0, dy = at ? at.y - ear.y : 0, dz = at ? at.z - ear.z : 0, hu = at ? Math.hypot(dx, dy, dz) / HU : 0;
  let gain = (o.abs ? 1 : r.vol) * (o.gain ?? 1) * (r.flat ? 1 : curveGain(o.curve || r.curve, o.fall ? hu / o.fall : hu));   // (v53 RELOAD: o.curve — a reload take's own CS2 event; o.fall — CS2's suppression_falloff_multiplier, the distances shortened)   // (yours: the curve at 0 — CS2 hears your own steps at its first point, .45)
  // (out of earshot: silent on purpose, decided before any file — a far step whose file is still decoding used to return
  // false here and fall back to the shared bank's Web Audio law, which never reaches silence: heard across the map)
  const cull = o.cull ?? CULL;   // (RELOAD final: a suppressed reload is cut at CULL × its suppression_volume_multiplier — the same
  // relative cut as any event, so its curve is heard out to its own 0: the AK's Clipout to about 218 of CS2's 220 HU, not 86)
  if (gain < cull) { voiceStats.culled++; layers(r, o); return true; }
  const name = o.name ? (ready(o.name) ? o.name : (want([o.name]), null)) : pick(r), sb = name ? null : synthBuf(r, c); if (!name && !sb) return false;   // (sb: our synthesized stand-in — v53 S3)
  const occl = o.occl ?? r.occl, occ = at && occl > 0 ? occlusionAt(at.x, at.y, at.z, nowMs()) : 0, hrtf = r.pr >= 2 && hu < 1500; let hz = 20000, sh = 0;
  if (at) { placeCue(dx, dy, dz, hu, occ, occl, r.dm, LF, cue, hrtf); gain *= cue.gain; hz = cue.hz; sh = cue.shelf; if (gain < cull) { voiceStats.culled++; layers(r, o); return true; } }   // (walls, distance, behind: placeCue above)
  const v = acquire(r, o.src ?? (at ? null : 'me'), gain, c.currentTime); if (!v) { layers(r, o); return true; }
  const buf = sb || bufferOf(name); if (!buf) return false;
  try { const s = c.createBufferSource(), g = c.createGain(); s.buffer = buf; s.playbackRate.value = o.rate || (r.plo + Math.random() * (r.phi - r.plo)); g.gain.value = gain; s.connect(g); let head = g, nodes = 2;
    if (hz < CUE.open) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = hz; f.Q.value = -3.0103; head.connect(f); head = f; nodes++; }   // (Q −3.01 dB = 1/√2: Butterworth, flat to the cut — Web Audio's lowpass Q is in dB, 0 dB would peak +1.25 dB)
    if (sh < -.5) { const f = c.createBiquadFilter(); f.type = 'highshelf'; f.frequency.value = CUE.shelfHz; f.gain.value = sh; head.connect(f); head = f; nodes++; }   // (behind, on an HRTF voice: placeCue)
    if (at) { const p = c.createPanner(); p.panningModel = hrtf ? 'HRTF' : 'equalpower'; p.distanceModel = 'linear'; p.rolloffFactor = 0; p.refDistance = 1; p.maxDistance = 1e5;   // (the distance law is CS2's curve above, not Web Audio's: rolloff 0)
      p.channelCount = 1; p.channelCountMode = 'explicit';   // (a placed sound is a point: a stereo recording folded to mono first — GD-AUD-18)
      if (p.positionX) { p.positionX.value = at.x; p.positionY.value = at.y; p.positionZ.value = at.z; } else p.setPosition?.(at.x, at.y, at.z); head.connect(p); head = p; nodes++; }
    head.connect(r.cat === 'ui' || r.cat === 'radio' ? uiBus(c) : r.cat === 'music' ? musicBus(c) : o.ring ? ringBus(c) : master(c));   // (the radio: the Interface bus, as CS2's team radio is never in the world)
    if (r.wet) { const w = c.createGain(); w.gain.value = gain * r.wet * (.12 + .3 * Math.min(1, hu / 1500)); g.connect(w).connect(reverb(c)); nodes++; }   // (more room the further off; the amounts are this game's)
    const dur = buf.duration / s.playbackRate.value; v.busy = true; v.mi = r.mi; v.src = o.src ?? (at ? null : 'me'); v.id = r.id; v.pr = r.pr; v.lvl = gain; v.t0 = t; v.s = s; v.g = g;
    voiceStats.started++; voiceStats.nodes += nodes; let live = 0; for (const x of SLOTS) if (x.busy) live++; voiceStats.live = live; if (live > voiceStats.peak) voiceStats.peak = live;
    if (o.loop) { s.loop = true; v.end = t + o.loop + .1; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .4); g.gain.setValueAtTime(gain, t + Math.max(.5, o.loop - 1)); g.gain.linearRampToValueAtTime(0, t + o.loop); s.start(t, Math.random() * buf.duration * .5); s.stop(t + o.loop + .05);
      layers(r, o); return { stop() { try { const n = c.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + .35); s.stop(n + .4); v.end = n + .4; } catch {} } }; }
    v.end = t + dur + .02; s.start(t); if (r.cat === 'music') { musicV = v; voiceStats.music++; } else if (r.cat === 'radio') voiceStats.radio++;
  } catch { return false; }
  layers(r, o); return true; }
// CS2 starts an event's child events with it: the distant layer (its own curve: silent close by, so never rolled off
// twice) and any extra layer (a molotov's smash, the C4's close blast).
function layers(r, o) { if (o.layer) return; if (r.far) gdPlay(r.far, LAYER_OPTS(o)); const w = r.with; if (typeof w === 'string') gdPlay(w, LAYER_OPTS(o)); else if (w) for (let i = 0; i < w.length; i++) gdPlay(w[i], LAYER_OPTS(o)); }   // (with: one layer, or a CS2 parent's child events — v53 S3)
const LO = { at: null, src: null, delay: 0, gain: 1, layer: 1, ring: false }; const LAYER_OPTS = o => { LO.at = o.at || null; LO.src = o.src ?? null; LO.delay = o.delay || 0; LO.gain = o.gain ?? 1; LO.ring = !!o.ring; return LO; };

// ── Small synthesized stand-ins (no file of the event yet): the throw's whoosh. ──
let whooshBuf = null;
export function synthWhoosh(at = null) { try { const c = ctx ??= audioCtx(), t = c.currentTime; if (!whooshBuf) { const n = Math.ceil(c.sampleRate * .25); whooshBuf = c.createBuffer(1, n, c.sampleRate); const d = whooshBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.5); }
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = whooshBuf; f.type = 'bandpass'; f.frequency.value = 1800; g.gain.value = .25; s.connect(f).connect(g).connect(master(c)); s.start(t); return true; } catch { return false; } }

// ── (v53 S3, spec 2.2) Hit and headshot feedback: our own synthesized stand-ins, the shooter's event choice, the
// victim's and onlookers' headshot sounds. ──
// synthSamples(kind, sampleRate) → mono samples (peak .9), deterministic (a fixed-seed noise), made ONCE per kind at
// the match's load (gdPrewarm → gdSynthWarm) and kept as AudioBuffers; a hit never synthesizes anything:
//   hit.body        a body hit's short tick: a soft thud (noise under ~500 Hz), 170 Hz knock, a 1.3 kHz click (90 ms);
//   hs.flesh        no helmet — a low thud with a click: 1.5 ms click, 140 → 70 Hz knock, dull noise (180 ms);
//   hs.helmet       the helmet — a short bright metallic ping: inharmonic partials 2.48 / 3.13 / 3.71 / 3.99 kHz (and a
//                   faint 5.23 kHz), 20–55 ms decays, a 2 ms tick in front (260 ms);
//   hs.kill         a headshot kill — a ding (1.87 / 2.81 / 3.74 kHz bell partials) over a low punch (110 → 48 Hz) (450 ms);
//   hs.kill.helmet  the same with the helmet's ping in front.
export function synthSamples(kind, sr = 48000) {
  const len = { 'hit.body': .09, 'hs.flesh': .18, 'hs.helmet': .26, 'hs.kill': .45, 'hs.kill.helmet': .45 }[kind]; if (!len) return null;
  const n = Math.ceil(sr * len), d = new Float32Array(n); let seed = 0x2545f491; const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2147483648 - 1);
  const TAU = 2 * Math.PI, part = (f, a, tau, t0 = 0) => { for (let i = Math.floor(t0 * sr); i < n; i++) { const t = i / sr - t0; d[i] += a * Math.sin(TAU * f * t) * Math.exp(-t / tau); } };
  const sweep = (f0, f1, a, tau, att = .003) => { let ph = 0; for (let i = 0; i < n; i++) { const t = i / sr, f = f1 + (f0 - f1) * Math.exp(-t / .05); ph += TAU * f / sr; d[i] += a * Math.sin(ph) * Math.min(1, t / att) * Math.exp(-t / tau); } };
  const dull = (fc, a, tau) => { const k = 1 - Math.exp(-TAU * fc / sr); let y = 0; for (let i = 0; i < n; i++) { y += k * (noise() - y); d[i] += a * 4 * y * Math.exp(-i / sr / tau); } };   // (one-pole lowpassed noise)
  const click = (ms, a) => { let prev = 0; for (let i = 0; i < Math.min(n, Math.ceil(sr * ms / 1000)); i++) { const x = noise(); d[i] += a * (x - prev) * .5; prev = x; } };   // (a differenced noise burst: bright)
  const ping = a => { for (const [f, g, tau] of [[2480, 1, .055], [3130, .7, .045], [3710, .55, .038], [3990, .35, .03], [5230, .15, .02]]) part(f, a * g, tau); click(2, a * .5); };
  const ding = a => { for (const [f, g, tau] of [[1870, .6, .16], [2805, .45, .12], [3740, .25, .08]]) part(f, a * g, tau); };
  if (kind === 'hit.body') { dull(500, .6, .02); part(170, .35, .03); part(1300, .15, .008); }
  else if (kind === 'hs.flesh') { click(1.5, .7); sweep(140, 70, .7, .045); dull(350, .5, .03); }
  else if (kind === 'hs.helmet') ping(1);
  else { if (kind === 'hs.kill.helmet') ping(.8); ding(1); sweep(110, 48, .9, .07); dull(200, .3, .04); }
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i])); if (pk > 0) for (let i = 0; i < n; i++) d[i] *= .9 / pk;
  for (let i = Math.max(0, n - Math.ceil(sr * .006)); i < n; i++) d[i] *= (n - i) / (sr * .006);   // (a 6 ms fade at the end: no click)
  return d; }
const SYNB = {};   // kind → AudioBuffer (made once)
function synthBuf(r, c) { const k = r.syn; if (!k) return null; let b = SYNB[k]; if (b !== undefined) return b;
  try { const s = synthSamples(k, c.sampleRate); b = c.createBuffer(1, s.length, c.sampleRate); if (b.copyToChannel) b.copyToChannel(s, 0); else b.getChannelData(0).set(s); } catch { b = null; }
  return (SYNB[k] = b); }
export function gdSynthWarm() { let c; try { c = ctx ??= audioCtx(); } catch { return 0; } let k = 0; for (const id in RES) if (RES[id].syn && synthBuf(RES[id], c)) k++; return k; }   // (every event with a stand-in — the victim's and onlookers' too: none synthesized mid-round)
// The shooter's sounds for a hit the host confirmed (lab.js reportHit → gd-hud.js hit): kill, head (the host's hit
// group), helmet (the victim wore one when the bullet met the head — combat-logic.js result hm). Into `out`: the events,
// in order; returns how many. CS2's own headshot death event (imported) already layers its flesh and dink (child
// events .Flesh, .Dink): played alone. Ours: the kill confirm under the headshot kill, both ducked (UI_DUCK) so the two
// never sum past the bus's headroom.
export const HIT_OUT = [null, null];
export const UI_DUCK = .7;
export function hitEvents(kill, head, helmet, out = HIT_OUT) { out[0] = out[1] = null;
  if (!kill) { out[0] = head ? (helmet ? 'ui.hit.helmet' : 'ui.hit.head') : 'ui.hit'; return 1; }
  if (!head) { out[0] = 'ui.kill'; return 1; }
  const hk = helmet ? 'ui.kill.head.helmet' : 'ui.kill.head'; if (RES[hk]?.cs2) { out[0] = hk; return 1; }
  out[0] = 'ui.kill'; out[1] = hk; return 2; }
const HFO = { gain: 1, src: 'me' };
export function gdHitSounds(kill, head, helmet) { const k = hitEvents(kill, head, helmet); let ok = false; HFO.gain = k > 1 ? UI_DUCK : 1; for (let i = 0; i < k; i++) if (gdPlay(HIT_OUT[i], HFO)) ok = true; return ok; }
// A hit the room's blood record shows (combat.bl: victim, zone, helmet — gd-hit-feedback.js): the victim hears theirs
// (2D, yours: Player.DamageHeadShot(Armor).Victim / DamageBody.Victim); everyone else a headshot where it happened —
// placed, with the occlusion and HRTF rules every world sound has (placeCue, gdPlay): the helmet's ping carries.
// kill: the hit killed (the record's k) — a killing headshot is CS2's Death* event, a wounding one its Damage* event.
const HURT_EV = ['hurt.body', 'hurt.head', 'hurt.head.helmet', 'hurt.body', 'hurt.head.kill', 'hurt.head.helmet.kill', null, 'hurt.head.onlooker', 'hurt.head.helmet.onlooker', null, 'hurt.head.kill.onlooker', 'hurt.head.helmet.kill.onlooker'];
export const hurtEvent = (zone, helmet, victim, kill = false) => HURT_EV[(victim ? 0 : 6) + (kill ? 3 : 0) + (zone === 'head' ? (helmet ? 2 : 1) : 0)];
const HUO = { at: null, src: null };
export function gdHurtSound(zone, helmet, victim, at = null, src = null, kill = false) { const id = hurtEvent(zone, helmet, victim, kill); if (!id) return false; HUO.at = victim ? null : at; HUO.src = victim ? 'me' : src; return gdPlay(id, HUO); }

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
function fxEvent(name, o) { if (name === 'wall') return 'impact.' + impactFamily(o?.mat); if (name === 'slash') return (o?.rate ?? 1) < 1 ? 'knife.slash.heavy' : 'knife.slash'; if (name === 'stab') return (o?.rate ?? 1) < 1 ? 'knife.stab' : 'knife.hit';
  if (name === 'draw') return o?.gid && RES[`gun.${o.gid}.draw`] ? `gun.${o.gid}.draw` : 'gun.ak.draw';
  if (name === 'nadedraw' || name === 'toss' || name === 'pin') { const k = RES[`nade.${o?.gid}.pin`] ? o.gid : 'he'; return `nade.${k}.${name === 'nadedraw' ? 'draw' : name === 'toss' ? 'throw' : 'pin'}`; }
  if (name === 'dry') return WEAPONS.find(w => w.id === o?.gid)?.kind === 'pistol' ? 'gun.dry.pistol' : 'gun.dry.rifle'; if (name === 'glass') return o?.at ? 'world.glass.break' : null; if (name === 'casing') return o?.at ? 'gun.casing' : null; return FX_ROUTE[name] || null; }
const FXO = { at: null, src: null, delay: 0, mat: null };
export const ROUTE = {
  shot: (id, o) => gdShot(id, o),
  fx(name, o = NO) { const ev = fxEvent(name, o); if (!ev) return undefined; FXO.at = o.at || null; FXO.src = o.src ?? null; FXO.delay = o.delay || 0; return gdPlay(ev, FXO) || undefined; },
  // (a reload's stages, tied to its moments by weapons.js / multiplayer.js — magazine out, in, bolt: the gun's own CS2
  // stage when the room has it, else its class's; the event's curve and voices, the bank's stage levels)
  // (v53 RELOAD: someone else's — every stage falls inside CS2's WPN_RELOAD_SILENT window — is suppressed as the gun's
  // CS2 event is: × suppression_volume_multiplier, distances × suppression_falloff_multiplier)
  reload(part, id, at) { const r = RES[`gun.${id}.reload`]; if (!r) return undefined; const cls = reloadClass(id), own = `reload-${id}-${part}`, sup = at ? reloadEvent(r.e.cs) : null, k = sup?.[5] ? sup[6] : 1, fall = sup?.[5] ? sup[7] : 1;   // (RELOAD final: without case — the P250's Weapon_P250.Clipout is CS2's Weapon_p250.Clipout)
    RLO.cull = sup?.[5] ? CULL * k : CULL; if (part === 0) gdPlay(r.id, RL(at, `reload-${cls}-grab`, .55 * k, 0, fall));
    return gdPlay(r.id, RL(at, ready(own) ? own : `reload-${cls}-${part}`, .9 * k, part === 0 ? .12 : 0, fall)) || undefined; },
  step(surface, at, volume, src) { return gdStep(surface, at, src) || undefined; },
};
const RLO = { at: null, name: null, gain: 1, delay: 0, src: null, abs: true, fall: 1, cull: CULL }; const RL = (at, name, gain, delay, fall = 1) => { RLO.at = at; RLO.name = name; RLO.gain = gain; RLO.delay = delay; RLO.src = at ? null : 'me'; RLO.fall = fall; return RLO; };
const STO = { at: null, src: null };
export function gdStep(surface, at = null, src = null) { STO.at = at; STO.src = src; return gdPlay(RES[`step.${surface}`] ? `step.${surface}` : 'step.concrete', STO); }
// Someone else's footsteps (multiplayer.js, each remote body each frame — numbers on the body, no object). CS2: a step only
// over 135 HU/s on the ground — a Shift walk (knife 250 × .52 = 130 HU/s) and a crouch (× .34 = 85) are silent to everyone.
// Walking or running is judged on the body's own clock — `vs`, its speed over the 0.25 s of snapshots up to the moment
// drawn (bufSpeed: the sender's timestamps) — not on the per-frame drawn motion, which this computer's interpolation
// bends (a late packet's catch-up, the adaptive delay easing: ±10 % for a few hundred ms) and frame jitter shakes: the
// old per-frame test of a 130 HU/s walk against 135 — a 4 % margin — let a Shift-walker through as running (package U).
// A peek must be heard as it starts (CS2: the step timer is at 0 standing — the first step the moment speed passes
// 135): `vq`, the snapshot speed over the last 125 ms, starts a run early when clearly past any walk (> 160 HU/s: a 130
// walk + 23 %, beyond timestamp jitter); the 250 ms `vs` decides the rest (a steady 135–160 run, a walk's silence — no
// hysteresis below 135: a runner who Shift-walks at 130 must go quiet). The drawn body must be moving too (its per-frame
// speed smoothed over ~80 ms > 60 HU/s — a stop is heard within ~0.1 s, though the last snapshots before it still say
// "running"); with no snapshot speed (vs NaN: a body just in, under 100 ms of snapshots) the smoothed drawn speed decides,
// but only a clear run (> 160: interpolation swings a walk ±12 %). A teleport (> 60 u/s) is not running.
// Steps every 0.3 s while running, the first on the frame running starts (after a landing 0.1 s on: the landing is its own).
export const STEP_RUN = 135 * HU, STEP_EVERY = .3, STEP_WIN = .25, STEP_UP = 20 * HU, STEP_MOVING = 60 * HU, STEP_PEEK = 160 * HU, STEP_TAU = .08;   // (STEP_UP: CS2's position_offset — a step is heard 20 HU over the feet)
export function stepDue(m, dt, x, z, crouched, ground, vs = NaN, vq = NaN) {
  if (m.swT === undefined) { m.swT = 0; m.swX = x; m.swZ = z; m.swV = 0; m.stepT = STEP_EVERY; }
  if (dt > 0) { const u = Math.hypot(x - m.swX, z - m.swZ) / dt; m.swX = x; m.swZ = z; if (u > 60) m.swV = 0; else m.swV += (u - m.swV) * (1 - Math.exp(-dt / STEP_TAU)); }
  const v = Number.isFinite(vs) ? (vs > 60 ? 0 : vs) : m.swV * STEP_RUN / STEP_PEEK, q = Number.isFinite(vq) && vq <= 60 ? vq : 0;
  if (!ground || crouched || !(m.swV > STEP_MOVING) || !(v > STEP_RUN || q > STEP_PEEK)) { m.stepT = ground ? STEP_EVERY : STEP_EVERY - .1; return false; }
  m.stepT += dt; if (m.stepT >= STEP_EVERY) { m.stepT = 0; return true; } return false; }
// A remote body's speed (units/s) on its own clock: its snapshots ({t: the sender's ms, x, z}, oldest first — multiplayer
// model.buf) over the `win` ms ending at `t` (the moment drawn, m.seen), interpolated at both ends. NaN when they span
// under 100 ms or 80 % of `win` (a body just in: a short span magnifies a stamp's few ms). A loop over the buffer, no object.
export function bufSpeed(buf, t, win = 250) { const n = buf?.length || 0; if (n < 2 || !Number.isFinite(t)) return NaN;
  const t1 = Math.min(buf[n - 1].t, t), t0 = Math.max(buf[0].t, t1 - win); if (t1 - t0 < Math.max(100, .8 * win)) return NaN; let x1 = NaN, z1 = NaN;
  for (let i = n - 1; i > 0; i--) { const a = buf[i - 1], b = buf[i], s = Math.max(1, b.t - a.t);
    if (x1 !== x1 && a.t <= t1) { const k = Math.min(1, (t1 - a.t) / s); x1 = a.x + (b.x - a.x) * k; z1 = a.z + (b.z - a.z) * k; }
    if (a.t <= t0) { const k = Math.min(1, (t0 - a.t) / s); return Math.hypot(x1 - (a.x + (b.x - a.x) * k), z1 - (a.z + (b.z - a.z) * k)) / ((t1 - t0) / 1000); } }
  return NaN; }
// A first-person clip's sound (fp-sounds.js: CS2's clip event — its own volume and pitch) as the set's event: placed,
// limited and curved like the rest. The set → the event whose curve carries it.
const CLIP_EV = s => RES[`gun.${s}.reload`] ? `gun.${s}.reload` : RES[`nade.${s}.pin`] ? `nade.${s}.pin` : s === 'c4' ? 'c4.key' : 'knife.slash';
const CLO = { at: null, name: null, gain: 1, abs: true, rate: 1, src: null, curve: null, occl: undefined, fall: 1, cull: CULL };
// ── v53 RELOAD: reloads heard as CS2 (spec addendum 4, "silent reload like CS2"). Each first-person reload clip's take is
// its own CS2 sound event (gd-reload-ref.js RELOAD_SND, found by its files' base names: TAKE): its volume, distance curve
// and occlusion_intensity, exactly — your own at the event's volume, 2D (its curve at 0 HU is 1: CS2's first-person
// level). Someone else's: placed, through the same occlusion and HRTF as every world sound, and only events CS2 marks
// display_broadcast (the Nova's and XM1014's shell inserts, the SSG 08's bolt are not: others never hear them — our
// reading, not verified: the data sets it false on every Draw / WeaponMove / Inspect foley and true on every shot). Every
// reload sound event has suppression_enable (× 0.07 volume, distances × 0.2: the AK's Clipout, 1 → 0 between 50.3 and
// 1100 HU, becomes 0.07 → 0 between 10.1 and 220 HU) and every reload clip has CS2's WPN_RELOAD_SILENT window from its
// start to past its last sound: a reload heard by others inside that window is suppressed — CS2's silent reload (our
// reading: the code that joins the two is not in CS2's data files). Walking or crouching changes nothing (no such rule
// in the data). Nothing allocated per sound: TAKE is built once. ──
// (RELOAD final: a take is found per GUN and per MOMENT, not by its file alone — several guns share CS2 files with
// different events: magazine_slide_01 is Weapon_AK47.Clipin at 0.3, Weapon_DEagle.Clipin at 1.0, Weapon_GalilAR.Clipin
// and Weapon_MP9.Clip.Slide at 0.5; de_clipout is Weapon_DEagle.Clipout 0.9 and Weapon_CZ.Clipout2 1.0. TAKES[set]
// [take] lists [moment s, event] from the gun's own clips' snd (RELOAD_REF[set].reload / empty / alt / altEmpty); the
// clip's own moment picks among them (nearest). TAKE — the first event in name order — only for a take no clip of the
// gun lists. Event names are looked up without case: the clips say Weapon_P250.AddAmmo, the vsndevts Weapon_p250.*.)
const SND_LC = new Map(); for (const [k, ev] of Object.entries(RELOAD_SND)) SND_LC.set(k.toLowerCase(), ev);
export const reloadEvent = name => (name && (RELOAD_SND[name] || SND_LC.get(String(name).toLowerCase()))) || null;
const TAKE = new Map(); for (const ev of Object.values(RELOAD_SND)) for (const f of ev[10]) if (!TAKE.has('fp-' + f)) TAKE.set('fp-' + f, ev);
const TAKES = new Map(); for (const [set, r] of Object.entries(RELOAD_REF)) { const m = new Map(); TAKES.set(set, m);
  for (const cl of [r.reload, r.empty, r.alt, r.altEmpty]) if (cl) for (const [t, name] of cl.snd) { const ev = reloadEvent(name); if (!ev) continue; for (const f of ev[10]) { const k = 'fp-' + f; if (!m.has(k)) m.set(k, []); m.get(k).push([t, ev]); } } }
export function reloadTake(name, set = null, t = NaN) { const L = set ? TAKES.get(set)?.get(name) : null; if (!L) return TAKE.get(name) || null; if (L.length === 1 || !Number.isFinite(t)) return L[0][1];
  let best = L[0], d = Math.abs(L[0][0] - t); for (let i = 1; i < L.length; i++) { const e = Math.abs(L[i][0] - t); if (e < d) { d = e; best = L[i]; } } return best[1]; }
// A reload sound's level and reach for a listener: [gain, curve, falloff multiplier] — own (heard: true) or someone
// else's; silent: inside the clip's WPN_RELOAD_SILENT window. null: not a reload event (the caller's own tuning).
const RLV = [1, null, 1];
export function reloadLevel(ev, own, silent) { if (!ev) return null; if (!own && !ev[8]) { RLV[0] = 0; RLV[1] = ev[1]; RLV[2] = 1; return RLV; } const sup = !own && silent && ev[5]; RLV[0] = ev[0] * (sup ? ev[6] : 1); RLV[1] = ev[1]; RLV[2] = sup ? ev[7] : 1; return RLV; }
export const inReloadSilent = (set, t) => { const w = RELOAD_REF[set]?.reload?.silent; return !!w && t >= w[0] && t <= w[1]; };
export function gdClip(set, name, vol, rate, at, src = null, clip = null, t = 0) { CLO.at = at; CLO.name = name; CLO.gain = vol; CLO.rate = rate; CLO.src = src ?? (at ? null : 'me'); CLO.curve = null; CLO.occl = undefined; CLO.fall = 1; CLO.cull = CULL;
  const ev = clip === 'reload' ? reloadTake(name, set, t) : null, L = ev ? reloadLevel(ev, !at, inReloadSilent(set, t)) : null;
  if (L) { if (L[0] <= 0) return true; CLO.gain = L[0]; CLO.curve = L[1]; CLO.fall = L[2]; CLO.occl = ev[2]; CLO.cull = L[2] < 1 ? CULL * ev[6] : CULL; }   // (not broadcast: silent to others on purpose — never the caller's fallback)
  return gdPlay(CLIP_EV(set), CLO); }

// ── On / off (lab.js, every frame: cheap), and decoding ahead (GD-AUD-13): on entering a match the events of grenades,
// the bomb, steps, impacts, hits and the UI; a gun's own when it is first seen (yours or someone else's). ──
let on = false; export const gdOn = () => on;
// The shared fallbacks' ranges while a match is on (spatial-audio outAt: a sound GD's bank could not play yet): linear to
// silence at the family's last CS2 curve point — footsteps (CT_Concrete.StepLeft) 1 at 116.6 → 0 at 1100 HU, handling
// (Weapon_AK47.Clipout) 50.3 → 1100, a gun's Single 175.7 → 2500, a bounce (HEGrenade.Bounce) 28.3 → 1700, an explosion
// (BaseGrenade.Explode) 231.4 → 2700 — in game units. [model, ref, rolloff, max] as spatial-audio's RANGE. The bomb's
// beep / plant / defuse stand-ins keep the game's own reach (spatial-audio RANGE) but linear: silent at its edge, not
// Web Audio's 'inverse' floor heard everywhere.
export const GD_RANGE = { step: ['linear', 116.6 * HU, 1, 1100 * HU], handling: ['linear', 50.3 * HU, 1, 1100 * HU], gun: ['linear', 175.7 * HU, 1, 2500 * HU], effect: ['linear', 28.3 * HU, 1, 1700 * HU], explosion: ['linear', 231.4 * HU, 1, 2700 * HU], beep: ['linear', 10, 1, 320], plant: ['linear', 8, 1, 330], defuse: ['linear', 5, 1, 140] };
export function gdAudio(v) { v = !!v; if (v === on) return; on = v; setSoundRoute(on ? ROUTE : null); setRanges(on ? GD_RANGE : null); if (on) { loadGdOverrides().then(() => { if (on) gdPrewarm(); }); } else { gdStopMusic(.3); roundSounds.reset(); } }   // (leaving the match: its music stops, its round memory goes)
const PREWARM = /^(nade|c4|step|land|impact|item|ui|hurt|player|world|knife|music|radio|gun\.(dry|scope|casing))/;   // (music, radio: only what this computer imported — a couple of voices)
export function gdPrewarm() { const names = []; for (const id in RES) if (PREWARM.test(id)) names.push(...RES[id].files); try { reverb(ctx ??= audioCtx()); } catch {} gdSynthWarm(); return want(names); }   // (the shared reverb built now, at the match's load: steps send to it from the first one — never its impulse made mid-round)
const gunsWanted = new Set();
export function gdWantGun(id) { if (!id || gunsWanted.has(id)) return; gunsWanted.add(id); loadGdOverrides().then(() => { const n = []; for (const k of ['fire', 'far', 'reload', 'action']) if (RES[`gun.${id}.${k}`]) n.push(...RES[`gun.${id}.${k}`].files); want(n); }); }
// A flash (GD-AUD-10): CS2's ring (or the caller's tone) on the Effects bus after the duck, and the world dulled.
export function gdFlashed(amount, secs) { duck(amount, secs); return gdPlay('nade.flash.ring', { ring: true, gain: Math.min(1, amount), key: null }); }
export { sameSource };

// ── The round's sounds: CS2's round start radio and its round-end music (arena-ui.js calls gdRoundSounds with the
// host's round state and clock on every HUD update — a string compare when nothing changed). ──
// The round's end (CS2's music kit events, game_sounds_music): the MVP's anthem when the round has an MVP — heard by
// everyone, both sides (Music.MVPAnthem: priority 5, block_won_lost, stop_music) — else WonRound to the winners and
// LostRound to the losers (test_mvp_block: skipped under an anthem). Spectators: the anthem only. Every player here
// has CS2's default kit (valve_cs2_01), so its anthem is the MVP's. The MVP: the host's (arena-defuse.js roundMvp).
export const roundEndEvent = (winner, team, mvp) => mvp ? 'music.mvp' : team !== 't' && team !== 'ct' ? null : team === winner ? 'music.won' : 'music.lost';
// A string → a 32-bit seed (FNV-1a): the round and side pick the same radio line on every computer of that team.
export const seedOf = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
// The line of a voice's round start radio: one of the four concepts (as CS2's FreezePeriodEnd picks one), then one of its
// lines (sets: the indices per concept, from the import). Concepts with no line (a few of CS2's rules name events its
// sets lack, e.g. leet_epic's radio.letsgo) are skipped. -1: none.
export function radioLine(files, sets, seed) { const n = files?.length || 0; if (!n) return -1; let k = 0; if (sets) for (const s of sets) if (s?.length) k++; if (!k) return seed % n;
  let c = seed % k; for (const s of sets) { if (!s?.length) continue; if (c-- === 0) { const i = s[Math.floor(seed / 4) % s.length]; return i >= 0 && i < n ? i : seed % n; } } return seed % n; }
// The round-end music sounding (one at a time). Stopped faded over CS2's fade-out (its volume_fade_out_input_max, 1.6 s):
// at the next freeze (CS2's round start music stops the music), a new match, leaving the match.
let musicV = null;
export function gdStopMusic(fade = 1.6) { const v = musicV; musicV = null; if (!v || !v.busy || !v.s || !ctx || !String(v.id).startsWith('music.')) return false; const t = ctx.currentTime;
  try { v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.linearRampToValueAtTime(0, t + fade); v.s.stop(t + fade + .02); } catch {} v.end = t + fade + .02; return true; }
// The round sounds' memory: each round's start radio and end sound once (per computer: its own team's radio), timed by
// the host's round state (phase changes, its clock: hostNow) — never this computer's prediction, so no second copy.
// The epoch tag is the round id (match.seq, arena-defuse.js): a late frame of an earlier round or match is refused, and
// a cue more than `fresh` ms after its moment (a page that stalled, a frame queued behind a reconnect) is not played.
// Without this computer's import of an event nothing plays (no placeholder of Valve's lines is shipped); the round end
// falls back to CS2's round-report cue (ui.round.won / lost — the win panel itself plays only its graph sounds) when
// the music is not imported. One sound per round end, never two.
export function createRoundSounds({ play = gdPlay, has = id => (RES[id]?.files?.length || 0) > 0, event = gdEvent, stop = gdStopMusic, voice = teamVoice, fresh = 2500 } = {}) {
  let rid = null, phase = null, match = null, seq = -1, endFor = null, radioFor = null; const past = [], stats = { end: 0, radio: 0, stale: 0, stops: 0, last: null };
  const first = (a, b, c) => has(a) ? a : b && has(b) ? b : c && has(c) ? c : null;
  function update(d, team, now) { const r = d?.round; if (!r || typeof r.id !== 'string') return null;
    if (r.id === rid && r.phase === phase) return null;   // (nothing new: the every-frame case)
    if (r.id !== rid) { const i = r.id.lastIndexOf('.'), m = i < 0 ? r.id : r.id.slice(0, i), s = i < 0 ? 0 : +r.id.slice(i + 1) || 0;
      if ((m === match && s < seq) || past.includes(m)) { stats.stale++; return null; }   // (a late frame of an earlier round or match: never heard again)
      if (m !== match) { if (match !== null) { past.push(match); if (past.length > 4) past.shift(); } match = m; } seq = s; rid = r.id; }
    phase = r.phase;
    if (r.phase === 'freeze' || r.phase === 'warmup') { if (stop()) stats.stops++; return null; }
    if (r.phase === 'live' && radioFor !== r.id && (team === 't' || team === 'ct') && now - (r.freezeUntil ?? now) < fresh) { radioFor = r.id;
      const ev = first('radio.start.' + voice(team), 'radio.start.' + SIDE_VOICE[team]), R = ev && event(ev), i = R ? radioLine(R.files, R.sets, seedOf(r.id + ':' + team)) : -1; if (i < 0) return null;
      play(ev, { name: R.files[i], key: 'radio:' + r.id + ':' + team }); stats.radio++; return stats.last = ev; }
    if (r.phase === 'over' && endFor !== r.id && now - (r.overAt ?? now) < fresh) { endFor = r.id; const mine = team === 't' || team === 'ct', won = mine && team === r.winner;
      const ev = first(roundEndEvent(r.winner, team, r.mvp), r.mvp && mine ? (won ? 'music.won' : 'music.lost') : null, mine ? (won ? 'ui.round.won' : 'ui.round.lost') : null); if (!ev) return null;
      play(ev, { key: 'round:' + r.id }); stats.end++; return stats.last = ev; }
    return null; }
  return { update, stats, reset() { rid = phase = match = endFor = radioFor = null; seq = -1; past.length = 0; } };
}
export const roundSounds = createRoundSounds();
export const gdRoundSounds = (d, team, now) => roundSounds.update(d, team, now);
