// v53 RELOAD (spec addendum 4, "silent reload like CS2"): reload sounds heard as CS2 has them, against a recording
// stand-in for Web Audio (nothing is heard; Chrome is not involved):
//  · THE NUMBERS: every reload sound event of every GD gun's CS2 reload clip has its CS2 volume, distance curve,
//    occlusion, display_broadcast and suppression (suppression_enable, _volume_multiplier, _falloff_multiplier) in
//    dist/gd-reload-ref.js — and, on a computer with the user's CS2 install, they equal game_sounds_weapons.vsndevts
//    read again here; every reload clip's sounds fall inside its WPN_RELOAD_SILENT window.
//  · YOUR OWN reload: 2D at the event's own volume (the AK's Clipout 1.0, its AddAmmo 1.2: CS2's first-person level).
//  · SOMEONE ELSE'S: placed; inside the silent window × 0.07 and its distances × 0.2 — the AK's Clipout reaches 0 at
//    220 HU instead of 1100 (heard at 120 and 200 HU, silent at 230 HU and beyond, culled before any file); each take is the
//    gun's own event at its clip moment (shared files: the Deagle's Clipin 1.0, the AK's 0.3); an event CS2 does not
//    broadcast (the Nova's shell insert) is silent to others at any distance; the fallback stages (no CS2 import) are
//    suppressed the same way. Walking or crouching changes nothing (CS2's data has no such rule).
//   node tests/gd-reload-audio.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path'; import { homedir } from 'node:os';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d !== '' ? ' · ' + String(d).slice(0, 300) : '')); };
// ── A recording stand-in for Web Audio (as tests/gd-headshot-audio.mjs) and a room manifest with the clip takes ──
class Param { constructor(v) { this.value = v; } setValueAtTime(v) { this.value = v; return this; } linearRampToValueAtTime() { return this; } exponentialRampToValueAtTime() { return this; } cancelScheduledValues() { return this; } setTargetAtTime() { return this; } }
class Node { constructor(c, kind) { this.ctx = c; this.kind = kind; this.out = []; this.channelCount = 2; this.channelCountMode = 'max'; } connect(d) { this.out.push(d); return d; } disconnect() {} }
const fakeBuffer = (ch, len, sr) => { const data = Array.from({ length: ch }, () => new Float32Array(len)); return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: i => data[i], copyToChannel: (s, i) => data[i].set(s) }; };
class FakeCtx {
  constructor() { this.currentTime = 0; this.sampleRate = 48000; this.state = 'running'; this.started = []; this.destination = new Node(this, 'dest');
    const P = v => new Param(v); this.listener = { positionX: P(0), positionY: P(0), positionZ: P(0), forwardX: P(0), forwardY: P(0), forwardZ: P(-1), upX: P(0), upY: P(1), upZ: P(0) }; }
  resume() {}
  createBufferSource() { const s = new Node(this, 'src'); s.playbackRate = new Param(1); s.buffer = null; s.loop = false; s.start = t => { s.t0 = t; this.started.push(s); }; s.stop = () => { s.stopped = true; }; return s; }
  createGain() { const g = new Node(this, 'gain'); g.gain = new Param(1); return g; }
  createBiquadFilter() { const f = new Node(this, 'biquad'); f.type = 'lowpass'; f.frequency = new Param(350); f.Q = new Param(1); f.gain = new Param(0); return f; }
  createPanner() { const p = new Node(this, 'panner'); Object.assign(p, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 1, rolloffFactor: 1, maxDistance: 10000, positionX: new Param(0), positionY: new Param(0), positionZ: new Param(0) }); return p; }
  createDynamicsCompressor() { const d = new Node(this, 'comp'); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) d[k] = new Param(0); return d; }
  createConvolver() { const v = new Node(this, 'conv'); v.buffer = null; return v; }
  createDelay() { const d = new Node(this, 'delay'); d.delayTime = new Param(0); return d; }
  createBuffer(ch, len, sr) { return fakeBuffer(ch, len, sr); }
  decodeAudioData() { return Promise.resolve(fakeBuffer(1, 4800, 48000)); }
}
globalThis.AudioContext = FakeCtx; globalThis.location = { protocol: 'http:', href: 'http://room.test/' };
const { RELOAD_REF, RELOAD_SND } = await import('../dist/gd-reload-ref.js');
const TAKES = [...new Set(Object.values(RELOAD_SND).flatMap(e => e[10].map(f => 'fp-' + f)))];
globalThis.fetch = async url => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8), json: async () => (String(url).includes('/api/user-assets') ? { hash: 't', models: { sounds: Object.fromEntries(TAKES.map(t => [t, { file: 'sounds/' + t + '.ogg' }])) } } : {}) });
const SA = await import('../dist/spatial-audio.js');
const G = await import('../dist/gd-sounds.js');
const { want, ready } = await import('../dist/sound-bank.js');
const { WEAPONS, isFirearm } = await import('../dist/weapons-data.js');
const { curveGain, reloadLevel, reloadTake, inReloadSilent, gdClip, ROUTE, voiceStats, resetVoices, HU } = G;   // (G.reloadEvent: RELOAD final)
const c = SA.audioCtx(); const cam = { position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, parent: null }; SA.setListener(cam);
await want(TAKES); ok('the clip takes decoded (stand-in)', TAKES.every(ready));
const gain = s => s.out[0].gain.value;   // (the voice's own gain: CS2's level × curve × placement — the buses after it are the game's mix)
const panned = s => { let node = s; for (let i = 0; i < 12 && node; i++) { const nx = node.out[0]; if (!nx) break; if (nx.kind === 'panner') return true; node = nx; } return false; };

// ── THE NUMBERS ──
const guns = WEAPONS.filter(isFirearm); let evs = 0, inside = 0, all = 0;
for (const w of guns) { const r = RELOAD_REF[w.id]; for (const cl of [r.reload, r.empty, r.alt, r.altEmpty]) if (cl) for (const [t, name] of cl.snd) { all++; if (RELOAD_SND[name]) evs++; if (cl.silent && t >= cl.silent[0] && t <= cl.silent[1]) inside++; } }
ok(`every reload clip sound of the ${guns.length} guns has its CS2 event's values (${all} sounds)`, evs === all, evs + '/' + all);
ok('every reload sound falls inside its clip\'s WPN_RELOAD_SILENT window (CS2: the whole reload is the silent part)', inside === all, inside + '/' + all);
ok('every reload sound event is suppressible: × 0.07 volume, distances × 0.2 (CS2\'s suppression_*_multiplier)', Object.values(RELOAD_SND).every(e => e[5] === 1 && e[6] === .07 && e[7] === .2));
ok('CS2\'s AK reload events: Clipout 1.0, Clipin 0.3, AddAmmo 1.2, BoltPull 1.0; Clipout 1 → 0 between 50.3 and 1100 HU, occlusion 0.4', J(RELOAD_SND['Weapon_AK47.Clipout'].slice(0, 3)) === J([1, [[50.3, 1], [267.1, .356], [1100, 0]], .4]) && RELOAD_SND['Weapon_AK47.Clipin'][0] === .3 && RELOAD_SND['Weapon_AK47.AddAmmo'][0] === 1.2 && RELOAD_SND['Weapon_AK47.BoltPull'][0] === 1);
ok('not broadcast to others (display_broadcast false): the Nova\'s and XM1014\'s shell inserts, the SSG 08\'s bolt', !RELOAD_SND['Weapon_Nova.Insertshell'][8] && !RELOAD_SND['Weapon_XM1014.InsertShell'][8] && !RELOAD_SND['Weapon_SSG08.BoltBack'][8] && RELOAD_SND['Weapon_AK47.Clipout'][8] === 1);
function J(x) { return JSON.stringify(x); }
{ const f = join(homedir(), 'CS2-extract', 'export', 'reloads', 'soundevents__game_sounds_weapons.vsndevts_c.dec.txt');
  if (existsSync(f)) { const { parseKV3 } = await import('../tools/cs2-soundevents.mjs'), EV = parseKV3(readFileSync(f, 'utf8')); let same = 0;
    for (const [name, e] of Object.entries(RELOAD_SND)) { const v = EV[name] || EV[Object.keys(EV).find(k => k.toLowerCase() === name.toLowerCase())]; if (!v) continue;
      const curve = (v.distance_volume_mapping_curve || []).filter(Array.isArray).map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 1e3) / 1e3]);
      if (Math.abs((v.volume ?? 1) - e[0]) < 1e-3 && J(curve) === J(e[1]) && Math.abs((v.occlusion_intensity ?? 0) - e[2]) < 1e-3 && (v.suppression_enable === true) === !!e[5] && Math.abs((v.suppression_volume_multiplier ?? 1) - e[6]) < 1e-3 && Math.abs((v.suppression_falloff_multiplier ?? 1) - e[7]) < 1e-3 && (v.display_broadcast === true) === !!e[8]) same++; }
    ok(`the install's game_sounds_weapons.vsndevts: all ${Object.keys(RELOAD_SND).length} reload events' volume, curve, occlusion, broadcast and suppression equal the reference`, same === Object.keys(RELOAD_SND).length, same);
  } else console.log('  (no CS2 install on this computer: checked against the committed reference only)'); }

// ── THE RULE (pure) ──
const co = RELOAD_SND['Weapon_AK47.Clipout'];
{ const L = reloadLevel(co, true, true); ok('yours: the event\'s own volume, its own curve, no suppression', L[0] === 1 && L[1] === co[1] && L[2] === 1); }
{ const L = reloadLevel(co, false, true); ok('someone else\'s, inside the silent window: × 0.07, distances × 0.2', Math.abs(L[0] - .07) < 1e-9 && L[2] === .2); }
{ const L = reloadLevel(co, false, false); ok('someone else\'s outside the window (none of CS2\'s reload sounds are): the plain event', L[0] === 1 && L[2] === 1); }
ok('the effective reach of a suppressed AK Clipout: 1 to 10.1 HU, 0.356 at 53.4 HU, 0 at 220 HU (CS2: 50.3 / 267.1 / 1100)', Math.abs(curveGain(co[1], 10 / .2) - 1) < 1e-9 && Math.abs(curveGain(co[1], 53.42 / .2) - .356) < 1e-3 && curveGain(co[1], 220 / .2) === 0);
ok('the AK clip\'s silent window runs 0 … 1.9 s', inReloadSilent('ak', 0) && inReloadSilent('ak', 1.6) && !inReloadSilent('ak', 1.95));
ok('a take finds its own event (fp-ak47_clipout_01 → Weapon_AK47.Clipout)', reloadTake('fp-ak47_clipout_01') === co);

// ── THROUGH THE BANK (gdClip / gdPlay with the stand-in) ──
const AT = hu => ({ x: hu * HU, y: 0, z: 0 });
function playRemote(take, hu, t = .3667, set = 'ak') { resetVoices(); const before = c.started.length; gdClip(set, take, .9, 1, AT(hu), 'bob', 'reload', t); return c.started.length > before ? c.started[c.started.length - 1] : null; }
{ resetVoices(); const k0 = c.started.length; gdClip('ak', 'fp-ak47_clipout_01', .9, 1, null, null, 'reload', .3667); const s = c.started[c.started.length - 1];
  ok('your own AK Clipout: 2D at CS2\'s volume 1.0 (not the old × 0.9)', c.started.length === k0 + 1 && !panned(s) && Math.abs(gain(s) - 1) < 1e-6, gain(s));
  gdClip('ak', 'fp-ak47_addammo_02', .9, 1, null, null, 'reload', 1.1); ok('your own AddAmmo at CS2\'s 1.2', Math.abs(gain(c.started[c.started.length - 1]) - 1.2) < 1e-6); }
{ const s = playRemote('fp-ak47_clipout_01', 5); ok('someone 5 HU away reloading: placed, CS2\'s 0.07 (suppressed)', s && panned(s) && Math.abs(gain(s) - .07) < .01, s && gain(s)); }
{ const s = playRemote('fp-ak47_clipout_01', 60); const want = .07 * curveGain(co[1], 60 / .2); ok(`someone 60 HU away: heard faintly, ${want.toFixed(4)} (CS2's suppressed curve)`, s && Math.abs(gain(s) - want) < .002, s && gain(s)); }
// (RELOAD final: a suppressed reload is cut at CULL × 0.07, the same relative cut as any event — heard out to its own
// curve's 0 at 220 HU; before, the bank's plain CULL stopped it at about 86 HU)
for (const hu of [120, 200]) { const s = playRemote('fp-ak47_clipout_01', hu), want = .07 * curveGain(co[1], hu / .2); ok(`someone ${hu} HU away: still heard on CS2's suppressed curve, ${want.toFixed(4)}`, s && Math.abs(gain(s) - want) < .002, s && gain(s)); }
for (const hu of [230, 400, 1000, 3000]) { const cul = (resetVoices(), voiceStats.culled); const s = playRemote('fp-ak47_clipout_01', hu); ok(`someone ${hu} HU away reloading: silent (culled before any file)`, !s && voiceStats.culled === cul + 1); }
{ let heard = 0; for (const hu of [5, 50, 150]) if (playRemote('fp-nova_insertshell_01', hu, .3667, 'shotgun')) heard++; ok('the Nova\'s shell insert is never heard by others (not broadcast)', heard === 0); }
{ const L = reloadLevel(RELOAD_SND['Weapon_AWP.BoltBack'], false, true); ok('the AWP\'s bolt by another: × 0.07, reaches 0 at 220 HU (1100 × 0.2)', Math.abs(L[0] - .07) < 1e-9 && curveGain(L[1], 221 / L[2]) === 0 && curveGain(L[1], 100 / L[2]) > 0); }
// RELOAD final: a take is the GUN's own event at its clip moment — files shared between guns keep each gun's level.
{ const own = (set, take, t) => { resetVoices(); gdClip(set, take, .9, 1, null, null, 'reload', t); return gain(c.started[c.started.length - 1]); };
  ok('your own Desert Eagle Clipin (magazine_slide_01, shared with the AK at 0.3): CS2\'s Weapon_DEagle.Clipin 1.0', Math.abs(own('deagle', 'fp-magazine_slide_01', .7) - 1) < 1e-6);
  ok('your own Desert Eagle Clipout (de_clipout, shared with the CZ75\'s Clipout2 at 1.0): CS2\'s 0.9', Math.abs(own('deagle', 'fp-de_clipout', .3333) - .9) < 1e-6);
  ok('your own Galil AR Clipin and MP9 Clip.Slide (magazine_slide_01): CS2\'s 0.5', Math.abs(own('galil', 'fp-magazine_slide_01', 1.1667) - .5) < 1e-6 && Math.abs(own('mp9', 'fp-magazine_slide_01', .8) - .5) < 1e-6);
  ok('the AK\'s own Clipin is still CS2\'s 0.3', Math.abs(own('ak', 'fp-magazine_slide_01', 1.0667) - .3) < 1e-6);
  ok('reloadTake by gun and moment: deagle → Weapon_DEagle.Clipin, ak → Weapon_AK47.Clipin', reloadTake('fp-magazine_slide_01', 'deagle', .7) === RELOAD_SND['Weapon_DEagle.Clipin'] && reloadTake('fp-magazine_slide_01', 'ak', 1.0667) === RELOAD_SND['Weapon_AK47.Clipin']);
  // every take of every gun's reload clip (the clip's [moment, takes] as the room's fp table has them: the gun's own snd) finds that gun's own event
  let all = 0, same = 0; for (const [set, r] of Object.entries(RELOAD_REF)) for (const cl of [r.reload, r.empty, r.alt, r.altEmpty]) if (cl) for (const [t, name] of cl.snd) { const ev = G.reloadEvent(name); for (const f of ev[10]) { all++; if (reloadTake('fp-' + f, set, t) === ev || reloadTake('fp-' + f, set, t)[0] === ev[0] && J(reloadTake('fp-' + f, set, t)[1]) === J(ev[1])) same++; } }
  ok(`every take of every gun's reload clips resolves to that gun's event at that moment (${all} takes)`, same === all, same + '/' + all); }
// The fallback stages (no CS2 clip sounds on this computer): someone else's suppressed the same way.
{ resetVoices(); const cul = voiceStats.culled; ROUTE.reload(1, 'ak', AT(400)); ok('the fallback reload stage of someone 400 HU away: silent too', voiceStats.culled > cul); }
// RELOAD final: for EVERY gun (the P250's fallback event is named Weapon_P250.*, CS2's Weapon_p250.*: found without case)
{ let sup = 0, all = 0; for (const w of guns) { const id = `gun.${w.id}.reload`; all++; resetVoices(); const k0 = c.started.length; ROUTE.reload(1, w.id, AT(5)); const s = c.started.length > k0 ? c.started[c.started.length - 1] : null;
    resetVoices(); const cul = voiceStats.culled; ROUTE.reload(1, w.id, AT(400)); if ((!s || gain(s) < .9 * .07 + .01) && voiceStats.culled > cul) sup++; else console.log('  not suppressed:', id, s && gain(s)); }
  ok(`the fallback reload stage of every gun (${all}) is suppressed for others (× 0.07 near, silent at 400 HU) — the P250 too`, sup === all, sup + '/' + all); }
// Walking / crouching: the rule takes neither (CS2's data has no such switch for reload sounds).
ok('reloadLevel takes no movement state (walking or crouching changes nothing)', reloadLevel.length === 3);
console.log(`PASS: gd-reload-audio · ${n} checks (CS2's reload sound events per gun, the silent window, yours at CS2's level, others' suppressed × 0.07 / range × 0.2 — silent past 220 HU — not-broadcast events never heard, fallback stages too)`);
