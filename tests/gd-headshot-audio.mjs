// Global Defensive · headshot and hit feedback sounds (v53 spec 2.2): dist/gd-sounds.js, dist/gd-hit-feedback.js and the
// host's hit records (dist/combat-logic.js), against a recording stand-in for Web Audio (nothing is heard):
//  · the event mapping, CS2's names (read in the local game_sounds_player.vsndevts, kept in gd-sounds-ref.js): body hit →
//    Player.DamageBody.AttackerFeedback; a headshot on a helmet → Player.DamageHeadShotArmor.AttackerFeedback, on a bare
//    head → Player.DamageHeadShot.AttackerFeedback; a headshot kill → the kill confirm layered under the headshot kill
//    (ours), or CS2's headshot death event alone when imported (its child events carry the layers — the helmet kill is
//    Player.DeathHeadShotArmor.AttackerFeedback's own children .Dink + .Flesh, its parent being volume 0);
//  · helmet / no helmet from the host: the hit's result and blood record say whether a helmet met the bullet (before
//    the hit took the armour), and who fired;
//  · our own stand-ins: helmet = a short bright ping, its energy in 2–4 kHz, decaying fast; no helmet = a low thud with a
//    click; the headshot kill = a ding over a low punch — synthesized once (the match's load), never per hit;
//  · voice limits: at most 2 of each event at once (the oldest gives way), on the ui mix (the Interface bus), the
//    layered kill ducked so the two never sum past the headroom;
//  · the victim hears theirs (2D) and sees CS2's damage indicator segment (huddamageindicator.vcss: 4 × 90°, 300 px,
//    #cc3300) on the side the shot came from; an onlooker hears a headshot placed where it happened (the occlusion line
//    asked, HRTF close by); the shooter does not hear it twice; a KILLING headshot is CS2's Death* event for the victim
//    and onlookers (Player.DeathHeadShot(Armor).Victim / .Onlooker, the armour ones with their .Dink / .Flesh children);
//  · the hit marker: white X, red for a kill, the extra tick for a headshot (prebuilt classes).
import assert from 'node:assert/strict';
let n = 0; const ok = (c, m) => { assert(c, m); n++; if (process.env.V) console.log('  ok ' + m); };

// ── A recording stand-in for Web Audio (as tests/gd-spatial-audio.mjs) ──
class Param { constructor(v) { this.value = v; } setValueAtTime(v) { this.value = v; return this; } linearRampToValueAtTime() { return this; } exponentialRampToValueAtTime() { return this; } cancelScheduledValues() { return this; } setTargetAtTime() { return this; } }
class Node { constructor(c, kind) { this.ctx = c; this.kind = kind; this.out = []; this.channelCount = 2; this.channelCountMode = 'max'; } connect(d) { this.out.push(d); return d; } disconnect() {} }
const fakeBuffer = (ch, len, sr) => { const data = Array.from({ length: ch }, () => new Float32Array(len)); return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: i => data[i], copyToChannel: (s, i) => data[i].set(s) }; };
class FakeCtx {
  constructor() { this.currentTime = 0; this.sampleRate = 48000; this.state = 'running'; this.started = []; this.made = 0; this.destination = new Node(this, 'dest');
    const P = v => new Param(v); this.listener = { positionX: P(0), positionY: P(0), positionZ: P(0), forwardX: P(0), forwardY: P(0), forwardZ: P(-1), upX: P(0), upY: P(1), upZ: P(0) }; }
  resume() {}
  createBufferSource() { const s = new Node(this, 'src'); s.playbackRate = new Param(1); s.buffer = null; s.loop = false; s.start = t => { s.t0 = t; this.started.push(s); }; s.stop = () => { s.stopped = true; }; return s; }
  createGain() { const g = new Node(this, 'gain'); g.gain = new Param(1); return g; }
  createBiquadFilter() { const f = new Node(this, 'biquad'); f.type = 'lowpass'; f.frequency = new Param(350); f.Q = new Param(1); f.gain = new Param(0); return f; }
  createPanner() { const p = new Node(this, 'panner'); Object.assign(p, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 1, rolloffFactor: 1, maxDistance: 10000, positionX: new Param(0), positionY: new Param(0), positionZ: new Param(0) }); return p; }
  createDynamicsCompressor() { const d = new Node(this, 'comp'); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) d[k] = new Param(0); return d; }
  createConvolver() { const v = new Node(this, 'conv'); v.buffer = null; return v; }
  createDelay() { const d = new Node(this, 'delay'); d.delayTime = new Param(0); return d; }
  createBuffer(ch, len, sr) { this.made++; return fakeBuffer(ch, len, sr); }
  decodeAudioData() { return Promise.resolve(fakeBuffer(1, 4800, 48000)); }
}
globalThis.AudioContext = FakeCtx;
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8), json: async () => ({}) });

const SA = await import('../dist/spatial-audio.js');
const G = await import('../dist/gd-sounds.js');
const { REF } = await import('../dist/gd-sounds-ref.js');
const { EVENTS, gdEvent, hitEvents, gdHitSounds, hurtEvent, gdHurtSound, synthSamples, SYNTH_KINDS, gdSynthWarm, resetVoices, voiceStats, liveVoices, setGdOverrides, setGdOcclusion, UI_DUCK, MIX } = G;
const c = SA.audioCtx(), ui = SA.uiBus(c);
const cam = { position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, parent: null }; SA.setListener(cam);
// What a started voice is wired to: its gains, panner and bus.
function path(s) { let node = s, g = 1, p = null, bus = null; for (let i = 0; i < 12 && node; i++) { const nx = node.out[0]; if (!nx) break; if (nx.kind === 'gain' && !p && nx !== ui) g *= nx.gain.value; if (nx.kind === 'panner') p = nx; if (nx === ui) { bus = 'ui'; break; } node = nx; } return { g, p, bus }; }
const last = () => c.started[c.started.length - 1];

// ── 1. The events and CS2's names ──
const CS = { 'ui.hit': 'Player.DamageBody.AttackerFeedback', 'ui.hit.head': 'Player.DamageHeadShot.AttackerFeedback', 'ui.hit.helmet': 'Player.DamageHeadShotArmor.AttackerFeedback',
  'ui.kill': 'Player.DeathBody.AttackerFeedback', 'ui.kill.head': 'Player.DeathHeadShot.AttackerFeedback', 'ui.kill.head.helmet': 'Player.DeathHeadShot.AttackerFeedback.Dink', 'ui.kill.head.helmet.flesh': 'Player.DeathHeadShot.AttackerFeedback.Flesh',
  'hurt.head': 'Player.DamageHeadShot.Victim', 'hurt.head.helmet': 'Player.DamageHeadShotArmor.Victim', 'hurt.head.onlooker': 'Player.DamageHeadShot.Onlooker', 'hurt.head.helmet.onlooker': 'Player.DamageHeadShotArmor.Onlooker',
  'hurt.head.kill': 'Player.DeathHeadShot.Victim', 'hurt.head.helmet.kill': 'Player.DeathHeadShotArmor.Victim', 'hurt.head.helmet.kill.dink': 'Player.DeathHeadShot.Victim.Dink', 'hurt.head.helmet.kill.flesh': 'Player.DeathHeadShot.Victim.Flesh',
  'hurt.head.kill.onlooker': 'Player.DeathHeadShot.Onlooker', 'hurt.head.helmet.kill.onlooker': 'Player.DeathHeadShotArmor.Onlooker', 'hurt.head.helmet.kill.onlooker.dink': 'Player.DeathHeadShot.Dink', 'hurt.head.helmet.kill.onlooker.flesh': 'Player.DeathHeadShot.Flesh' };
for (const [id, cs] of Object.entries(CS)) { ok(EVENTS[id]?.cs === cs, `${id} → CS2's ${cs}`); ok(Array.isArray(REF[cs]), `${cs}: CS2's reference values (volume, curve) kept`); }
ok(REF['Player.DamageHeadShotArmor.AttackerFeedback'][0] === .5 && REF['Player.DeathHeadShot.AttackerFeedback.Dink'][0] === .6 && REF['Player.DeathHeadShot.AttackerFeedback.Dink'][4] === 1.1 && REF['Player.DeathHeadShot.AttackerFeedback.Flesh'][0] === .3, "CS2's own levels: helmet hit .5, the helmet kill's Dink .6 (pitch 1.1) and Flesh .3");
ok(EVENTS['ui.kill.head.helmet'].with === 'ui.kill.head.helmet.flesh', "the helmet kill plays CS2's two children together (Dink with Flesh)");
for (const id of ['ui.hit', 'ui.hit.head', 'ui.hit.helmet', 'ui.kill', 'ui.kill.head', 'ui.kill.head.helmet']) ok(EVENTS[id].cat === 'ui' && EVENTS[id].mix === 'ui' && EVENTS[id].cap === 2, `${id}: yours, on the ui mix, 2 voices at most`);
ok(REF['Player.DeathHeadShot.Victim'][0] === .55 && REF['Player.DeathHeadShotArmor.Victim'][0] === .7 && REF['Player.DeathHeadShot.Victim.Dink'][0] === .7 && REF['Player.DeathHeadShot.Victim.Flesh'][0] === .2 && REF['Player.DeathHeadShot.Onlooker'][0] === .5 && JSON.stringify(REF['Player.DeathHeadShot.Onlooker'][1]) === '[[22,1],[298.3,0.429],[1070,0]]', "CS2's headshot-death levels: victim .55 / armour .7 (Dink .7, Flesh .2), onlooker .5 out to 1070 HU");
ok(JSON.stringify(EVENTS['hurt.head.helmet.kill'].with) === JSON.stringify(['hurt.head.helmet.kill.dink', 'hurt.head.helmet.kill.flesh']) && JSON.stringify(EVENTS['hurt.head.helmet.kill.onlooker'].with) === JSON.stringify(['hurt.head.helmet.kill.onlooker.dink', 'hurt.head.helmet.kill.onlooker.flesh']), "the armour headshot deaths play their own files with CS2's two child events (enable_child_events)");
for (const id of ['hurt.head', 'hurt.head.helmet', 'hurt.head.kill', 'hurt.head.helmet.kill']) ok(EVENTS[id].cat === 'own' && EVENTS[id].mix === 'ui' && EVENTS[id].cap === 2, `${id}: the victim's, 2D, ui mix, 2 voices`);
for (const id of ['hurt.head.onlooker', 'hurt.head.helmet.onlooker', 'hurt.head.kill.onlooker', 'hurt.head.helmet.kill.onlooker']) ok(EVENTS[id].cat === 'world' && EVENTS[id].cap === 2, `${id}: placed in the world, 2 voices`);
// the shooter's mapping
const o = [null, null], map = (k, h, hm) => { const m = hitEvents(k, h, hm, o); return o.slice(0, m).join('+'); };
ok(map(false, false, false) === 'ui.hit' && map(false, false, true) === 'ui.hit', 'body hit: the body tick (helmet or not)');
ok(map(false, true, true) === 'ui.hit.helmet', 'headshot on a helmet: the metallic helmet hit');
ok(map(false, true, false) === 'ui.hit.head', 'headshot on a bare head: the dull flesh hit');
ok(map(true, false, false) === 'ui.kill', 'body kill: the kill confirm');
ok(map(true, true, true) === 'ui.kill+ui.kill.head.helmet' && map(true, true, false) === 'ui.kill+ui.kill.head', 'headshot kill (ours): the kill confirm layered with the heavier headshot kill');
setGdOverrides({ 'ui.kill.head.helmet': { files: ['cs2-hs-dink'], vol: .6 }, 'ui.kill.head': { files: ['cs2-hs'], vol: .4 } });
ok(map(true, true, true) === 'ui.kill.head.helmet' && map(true, true, false) === 'ui.kill.head', "CS2 imported: its headshot death event alone (CS2 plays one; its children layer it)");
setGdOverrides({});
// victim / onlookers
ok(hurtEvent('head', true, true) === 'hurt.head.helmet' && hurtEvent('head', false, true) === 'hurt.head' && hurtEvent('chest', false, true) === 'hurt.body', 'the victim: helmet / bare head / body');
ok(hurtEvent('head', true, false) === 'hurt.head.helmet.onlooker' && hurtEvent('head', false, false) === 'hurt.head.onlooker' && hurtEvent('legs', false, false) === 'hurt.body.onlooker', 'onlookers: a headshot (helmet ping or not); a body hit CS2\'s Player.DamageBody.Onlooker (v53 HITS final)');
ok(hurtEvent('head', true, true, true) === 'hurt.head.helmet.kill' && hurtEvent('head', false, true, true) === 'hurt.head.kill' && hurtEvent('chest', false, true, true) === 'hurt.body.kill', 'a killing headshot, the victim: CS2 Death* (armour / bare); a body kill CS2\'s Player.DeathBody.Victim (v53 HITS final)');
ok(hurtEvent('head', true, false, true) === 'hurt.head.helmet.kill.onlooker' && hurtEvent('head', false, false, true) === 'hurt.head.kill.onlooker' && hurtEvent('chest', false, false, true) === 'hurt.body.kill.onlooker', 'a killing headshot, onlookers: CS2 Death*.Onlooker; a body kill Player.DeathBody.Onlooker');

// ── 2. Our stand-ins (no CS2) ──
const power = (d, f, sr = 48000) => { let re = 0, im = 0; for (let i = 0; i < d.length; i++) { const a = 2 * Math.PI * f * i / sr; re += d[i] * Math.cos(a); im += d[i] * Math.sin(a); } return (re * re + im * im) / d.length; };
const band = (d, lo, hi, step = 50) => { let e = 0; for (let f = lo; f <= hi; f += step) e += power(d, f); return e; };
const rms = (d, a, b) => { let s = 0; for (let i = a; i < b; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, b - a)); };
{ const h = synthSamples('hs.helmet'), f = synthSamples('hs.flesh'), k = synthSamples('hs.kill'), kh = synthSamples('hs.kill.helmet'), b = synthSamples('hit.body');
  ok(SYNTH_KINDS.every(s => synthSamples(s) instanceof Float32Array), 'every stand-in is synthesized');
  ok(SYNTH_KINDS.every(s => { const d = synthSamples(s); let p = 0; for (const x of d) p = Math.max(p, Math.abs(x)); return p <= .9001 && p > .85; }), 'each peaks at .9 (no clipping)');
  const hBand = band(h, 2000, 4000), hLow = band(h, 100, 1000), hHigh = band(h, 6000, 9000);
  ok(hBand > 20 * hLow && hBand > 10 * hHigh, `helmet: a bright metallic ping, its energy in 2–4 kHz (×${(hBand / hLow).toFixed(0)} over 0.1–1 kHz)`);
  ok(h.length / 48000 <= .3 && rms(h, 0, 2400) > 8 * rms(h, 7200, 9600), 'helmet: fast decay (−18 dB by 150 ms, 260 ms long)');
  const fLow = band(f, 50, 500, 25), fBand = band(f, 2000, 4000);
  ok(fLow > 20 * fBand, `no helmet: a low thud (energy under 500 Hz ×${(fLow / fBand).toFixed(0)} over 2–4 kHz)`);
  { const hf = (d, a, b) => { let e = 0; for (let i = a + 1; i < b; i++) e += (d[i] - d[i - 1]) ** 2; return Math.sqrt(e / (b - a)); };
    ok(hf(f, 0, 72) > 5 * hf(f, 480, 960), `no helmet: a click in front (its high end ×${(hf(f, 0, 72) / hf(f, 480, 960)).toFixed(0)} the thud's)`); }
  ok(band(k, 40, 150, 10) > 0 && band(k, 1700, 3900) > 0 && power(k, 1870) > 50 * power(k, 1000), 'headshot kill: a ding (1.87 kHz partial) over a low punch');
  ok(band(kh, 2300, 2700, 20) > band(k, 2300, 2700, 20), 'helmet headshot kill: the helmet ping in front of the ding');
  ok(b.length / 48000 < .1, 'body hit: a short tick'); }
// made once, at the load
{ const before = c.made; const k1 = gdSynthWarm(); const mid = c.made; gdSynthWarm(); ok(k1 >= 5 && mid - before === G.SYNTH_KINDS.length && c.made === mid, 'the stand-ins are made once at the match\'s load (gdPrewarm → gdSynthWarm), never again');
  resetVoices(); const m0 = c.made; for (let i = 0; i < 20; i++) { c.currentTime += .5; gdHitSounds(i % 2 === 0, true, i % 3 === 0); } ok(c.made === m0, '20 hits: no buffer synthesized during play'); }

// ── 3. Playing: the ui bus, the ducked layers, 2 voices of each ──
{ const SB = await import('../dist/sound-bank.js'); await SB.want([...gdEvent('ui.kill').files, ...gdEvent('hurt.head.onlooker').files]); ok(gdEvent('ui.kill').files.every(SB.ready), 'the kill confirm\'s shipped placeholder decoded (as gdPrewarm does at the load)'); }
resetVoices(); c.currentTime = 100;
{ const k = c.started.length; ok(gdHitSounds(false, true, true) === true && c.started.length === k + 1, 'a helmet headshot: one voice (our ping)');
  const p = path(last()); ok(p.bus === 'ui' && !p.p, '… on the Interface (ui) bus, not placed');
  ok(Math.abs(p.g - EVENTS['ui.hit.helmet'].pv) < 1e-9, '… at its own level');
  const s = c.started.length; gdHitSounds(true, true, false); const a = c.started[s], b = c.started[s + 1];
  ok(c.started.length === s + 2, 'a headshot kill (ours): two voices, kill confirm + headshot kill');
  ok(Math.abs(path(a).g - EVENTS['ui.kill'].pv * UI_DUCK) < 1e-9 && Math.abs(path(b).g - EVENTS['ui.kill.head'].pv * UI_DUCK) < 1e-9 && path(a).g + path(b).g < 1, `… each ducked ×${UI_DUCK}: together under the headroom (${(path(a).g + path(b).g).toFixed(2)})`); }
resetVoices(); c.currentTime = 200;
{ for (let i = 0; i < 6; i++) gdHitSounds(false, true, true);   // six helmet dings in one instant
  ok(voiceStats.started === 6 && voiceStats.capped === 4 && liveVoices(c.currentTime) === 2, `six at once: 2 voices of the helmet hit sound (the oldest gave way 4 times; live ${liveVoices(c.currentTime)})`);
  resetVoices(); for (let i = 0; i < 6; i++) gdHitSounds(true, true, false);
  ok(liveVoices(c.currentTime) <= 4 && liveVoices(c.currentTime) <= MIX.ui, `six headshot kills at once: at most 2 of each (kill confirm, headshot kill) — ${liveVoices(c.currentTime)} live, the ui mix's ${MIX.ui}`); }
// victim (2D) and onlooker (placed, occlusion asked)
resetVoices(); c.currentTime = 300;
{ const k = c.started.length; ok(gdHurtSound('head', true, true) === true && c.started.length === k + 1 && !path(last()).p, "the victim's helmet hit: 2D, yours");
  let asked = null; setGdOcclusion((x, y, z) => { asked = [x, y, z]; return 0; });
  const at = { x: 6, y: 9, z: -40 }, k2 = c.started.length; ok(gdHurtSound('head', true, false, at, 'bo') === true && c.started.length === k2 + 1, 'an onlooker hears the helmet ping');
  const p = path(last()).p; ok(p && p.positionX.value === 6 && p.positionZ.value === -40, '… placed where it happened');
  ok(asked && asked[0] === 6 && asked[2] === -40, '… with the occlusion line asked (walls)'); ok(p.panningModel === 'HRTF', '… HRTF close by');
  // range: CS2 gives the helmet's and the bare head's onlooker events the same curve ([[22,1],[298.3,.429],[1070,0]] HU):
  // both are heard at 500 HU — the helmet's ping the louder — and neither past 1070 HU
  const gainAt = (hm, hu) => { c.currentTime += 1; const k = c.started.length; gdHurtSound('head', hm, false, { x: 0, y: 0, z: -hu * G.HU }, 'cy' + hu + hm); return c.started.length > k ? path(last()).g : 0; };
  const h500 = gainAt(true, 500), b500 = gainAt(false, 500), h1100 = gainAt(true, 1100), b1100 = gainAt(false, 1100);
  ok(h500 > 0 && b500 > 0 && h500 > b500, `at 500 HU an onlooker hears either, the helmet ping louder (${h500.toFixed(3)} vs ${b500.toFixed(3)})`);
  ok(h1100 === 0 && b1100 === 0, "past CS2's 1070 HU: silent"); ok(JSON.stringify(REF['Player.DamageHeadShotArmor.Onlooker'][1]) === JSON.stringify(REF['Player.DamageHeadShot.Onlooker'][1]), "(CS2's two onlooker curves are the same)"); setGdOcclusion(null); }

// ── 4. The host's records: helmet before the hit, the shooter ──
{ const CL = await import('../dist/combat-logic.js'); const { weaponById } = await import('../dist/weapons-data.js'); const ak = weaponById('ak');
  const game = { mode: 'arena', combat: { hp: {}, down: {}, kills: {}, deaths: {}, last: {}, respawns: {}, feed: [], armor: { bo: { kevlar: 100, helmet: true }, cy: { kevlar: 100, helmet: false } } } };
  const r1 = CL.applyHit(game, 'Ann', 'Bo', ak, 'chest', 10); ok(r1.sk === 'ann' && !r1.hm, 'a body hit: the shooter named, no helmet mark');
  game.combat.hp.bo = 100; const r2 = CL.applyHit(game, 'Ann', 'Bo', { ...ak, dmg: 20 }, 'head', 10); ok(r2.hm === 1 && r2.head, 'a head hit on a helmet: hm');
  const r3 = CL.applyHit(game, 'Ann', 'Cy', { ...ak, dmg: 20 }, 'head', 10); ok(!r3.hm, 'a bare head: no hm');
  game.combat.armor.di = { kevlar: 3, helmet: true }; const r4 = CL.applyHit(game, 'Ann', 'Di', { ...ak, dmg: 20 }, 'head', 10); ok(r4.hm === 1, 'the helmet as the bullet met it (taken by that same hit: still the helmet sound)');
  const b = CL.bleed(game, 'Bo', r2, 0, 10, 0, 0, 0, -1, Date.now()); ok(b && b.hm === 1 && b.s === 'ann' && b.z === 'head', 'the blood record carries hm and the shooter (s)');
  const b2 = CL.bleed(game, 'Cy', r3, 0, 10, 0, 0, 0, -1, Date.now()); ok(b2 && !('hm' in b2) && b2.s === 'ann', 'a bare-head record: no hm'); }

// ── 5. gd-hit-feedback: shooter, victim arc, onlookers ──
{ class El { constructor() { this.className = ''; this.style = {}; this.innerHTML = ''; this.kids = []; } append(...k) { this.kids.push(...k); } }
  globalThis.document = { createElement: () => new El(), getElementById: () => null, head: new El(), body: new El() };
  const { createHitFeedback, arcAngle, segmentOf, SEGMENTS, HIT_ARC_CSS } = await import('../dist/gd-hit-feedback.js');
  const { HIT_MARKER_CLASS } = await import('../dist/gd-crosshair.js');
  const shot = [], hurt = []; let view = { fx: 0, fz: -1 };
  const root = new El(), F = createHitFeedback({ parent: root, hit: (...a) => shot.push(a), hurt: (...a) => hurt.push([a[0], a[1], a[2], a[3] ? { ...a[3] } : null, a[4], a[5]]), frame: out => { out.fx = view.fx; out.fz = view.fz; return out; } });
  F.hit(false, true, true); ok(shot[0].slice(0, 3).join() === 'false,true,true' && (F.marker.el.className === HIT_MARKER_CLASS[2] || F.marker.el.className === HIT_MARKER_CLASS[3]), 'a hit of yours: its sounds and the white marker with the headshot tick');
  F.hit(true, false, false); ok(/\bk\b/.test(F.marker.el.className) && !/\bh\b/.test(F.marker.el.className), 'a kill: the red marker');
  F.hit(false, false, false); const m1 = F.marker.el.className; F.hit(false, false, false); ok(m1 !== F.marker.el.className && m1.replace(/ [ab]$/, '') === F.marker.el.className.replace(/ [ab]$/, ''), 'the same marker twice: the animation restarts (a / b)');
  ok(HIT_MARKER_CLASS.length === 8 && HIT_MARKER_CLASS.every(s => s.startsWith('gd-hm')), 'the hit marker\'s looks: 8 prebuilt classes (kill × head × restart)');
  // arc angles: looking along −z, a shot from the right (travelling −x) shows on the right
  ok(Math.abs(arcAngle(-1, 0, 0, -1) - 90) < 1e-6 && Math.abs(arcAngle(1, 0, 0, -1) - 270) < 1e-6 && Math.abs(arcAngle(0, 1, 0, -1)) < 1e-6 && Math.abs(arcAngle(0, -1, 0, -1) - 180) < 1e-6, 'hit-direction arc: right 90°, left 270°, ahead 0°, behind 180°');
  ok(Math.abs(arcAngle(-1, 0, 1, 0) - 0) < 1e-6, '… turned to face the shooter: ahead');
  ok(segmentOf(359) === 0 && segmentOf(44) === 0 && segmentOf(46) === 1 && segmentOf(180) === 2 && segmentOf(271) === 3 && SEGMENTS.length === 4, "… snapped to CS2's four segments (top / right / bottom / left)");
  ok(/--gd-di:calc\(var\(--gd-view-h,100vh\) \* 300 \/ 1080\)/.test(HIT_ARC_CSS) && /#cc3300 86\.2%,#cc3300 88\.9%/.test(HIT_ARC_CSS) && /#cc3300 92%,#cc3300 99\.9%/.test(HIT_ARC_CSS) && /clip-path:polygon\(50% 50%,0 0,100% 0\)/.test(HIT_ARC_CSS) && /\.s1\{transform:translate3d\(0,calc\(var\(--gd-di\) \* -5 \/ 300\),0\) rotate\(90deg\)\}/.test(HIT_ARC_CSS), "CS2's damage indicator: 300 px at 1080 p, the two bands (.862–.889, .920–.999), a 90° wedge, #cc3300, −5 px then turned");
  const me = 'ann', bl = [], Gm = { combat: { bl } }; let i = 100;
  const rec = (v, z, o = {}) => { bl.push({ i: ++i, at: 5000, v, z, d: 20, p: [1, 2, 3], r: [-1, 0, 0], ...o }); };
  rec('ann', 'head', { hm: 1, s: 'cy' }); F.update(Gm, me, 5000); ok(hurt.length === 0, 'first look: records already there are old news');
  rec('ann', 'head', { hm: 1, s: 'cy' }); F.update(Gm, me, 5000);
  ok(hurt.length === 1 && hurt[0][0] === 'head' && hurt[0][1] === true && hurt[0][2] === true, 'hit in the head (helmet): the victim\'s own sound');
  const di = root.kids.find(k => k.className === 'gd-da'), segCls = () => di.kids.map(k => k.className).join('|');
  ok(di && di.kids.length === 4 && /^s0\|s1 [ab]\|s2\|s3$/.test(segCls()) && F.stats.seg === 1 && hurt[0][5] === false, "and CS2's damage indicator lights its right segment (the shot came from the right): " + segCls());
  rec('bo', 'head', { s: 'cy' }); F.update(Gm, me, 5000); ok(hurt.length === 2 && hurt[1][2] === false && hurt[1][3].x === 1 && hurt[1][3].z === 3 && hurt[1][1] === false, 'someone else\'s headshot: placed where it happened (bare head)');
  rec('bo', 'head', { s: 'ann', hm: 1 }); F.update(Gm, me, 5000); ok(hurt.length === 2, 'your own headshot on someone: not heard twice (your feedback has it)');
  rec('bo', 'chest', { s: 'cy' }); F.update(Gm, me, 5000); ok(hurt.length === 3 && hurt[2][0] === 'chest' && hurt[2][2] === false && hurt[2][3].x === 1, 'a body hit on someone else: placed, CS2\'s DamageBody.Onlooker (v53 HITS final — it was silent)'); hurt.pop();
  rec('ann', 'head', { s: 'cy', at: 1000 }); F.update(Gm, me, 5000); ok(hurt.length === 2, 'an old record arriving late: no sound');
  F.update(Gm, me, 5000); F.update(Gm, me, 5000); ok(hurt.length === 2, 'records are taken once');
  rec('ann', 'head', { s: 'cy', k: 1, hm: 1, r: [0, 0, -1] }); F.update(Gm, me, 5000); ok(hurt.length === 3 && hurt[2][5] === true && /s2 [ab]/.test(segCls()), 'killed by a headshot from behind: the Death* sound (kill flag) and the bottom segment');
  rec('bo', 'head', { s: 'cy', k: 1 }); F.update(Gm, me, 5000); ok(hurt.length === 4 && hurt[3][2] === false && hurt[3][5] === true, "an onlooker of a killing headshot: CS2's Death*.Onlooker (kill flag)"); }

// ── 6. (v53 HITS, H2) Body armour and the knife: CS2's *BodyArmor* events, the knife's silent attacker feedback ──
{ const ARM = { 'ui.hit.armor': 'Player.DamageBodyArmor.AttackerFeedback', 'ui.hit.armor.flesh': 'Player.DamageBodyArmor.AttackerFeedbackFlesh', 'hurt.body.armor': 'Player.DamageBodyArmor.Victim', 'hurt.body.armor.onlooker': 'Player.DamageBodyArmor.Onlooker',
    'ui.kill.armor': 'Player.DeathBodyArmor.AttackerFeedback', 'ui.kill.armor.flesh': 'Player.DeathBodyArmor.AttackerFeedbackFlesh', 'hurt.body.armor.kill': 'Player.DeathBodyArmor.Victim', 'hurt.body.armor.kill.onlooker': 'Player.DeathBodyArmor.Onlooker', 'ui.hit.knife': 'Player.DamageBody.Knife.AttackerFeedback' };
  for (const [id, cs] of Object.entries(ARM)) { ok(EVENTS[id]?.cs === cs, `${id} → CS2's ${cs}`); ok(Array.isArray(REF[cs]), `${cs}: CS2's reference values kept`); }
  const R = REF; ok(R['Player.DamageBodyArmor.AttackerFeedback'][0] === 1.2 && R['Player.DamageBodyArmor.AttackerFeedback'][4] === 1.3 && R['Player.DamageBodyArmor.AttackerFeedback'][2] === 3 && R['Player.DamageBodyArmor.AttackerFeedbackFlesh'][0] === .3 && R['Player.DamageBodyArmor.AttackerFeedbackFlesh'][6] === .1 && R['Player.DamageBodyArmor.Victim'][0] === 1.5 && R['Player.DamageBodyArmor.Onlooker'][0] === .7 && R['Player.DamageBodyArmor.Onlooker'][4] === 1.3 && R['Player.DeathBodyArmor.AttackerFeedback'][0] === 1 && R['Player.DeathBodyArmor.AttackerFeedbackFlesh'][0] === .5,
    "CS2's armour numbers (game_sounds_player.vsndevts): attacker 1.2 at pitch 1.3, instance limit 3, its flesh child .3 after .1 s; victim 1.5; onlooker .7 at 1.3; the kill 1 with its flesh child .5");
  ok(EVENTS['ui.hit.armor'].with === 'ui.hit.armor.flesh' && EVENTS['ui.kill.armor'].with === 'ui.kill.armor.flesh' && EVENTS['hurt.body.armor.onlooker'].with === 'hurt.body.armor.onlooker.flesh', 'the armour events play their CS2 child events with them (soundevent_01)');
  for (const id of ['ui.hit.armor', 'ui.kill.armor', 'hurt.body.armor', 'hurt.body.armor.kill']) ok(EVENTS[id].mix === 'ui' && EVENTS[id].cap === 2 && EVENTS[id].cat !== 'world', `${id}: 2D on the ui mix, 2 voices at most`);
  for (const id of ['hurt.body.armor.onlooker', 'hurt.body.armor.kill.onlooker']) ok(EVENTS[id].cat === 'world' && EVENTS[id].cap === 2, `${id}: placed, 2 voices at most`);
  const o2 = [null, null], mp = (k, h, hm, ar, kn) => { const m = hitEvents(k, h, hm, o2, ar, kn); return o2.slice(0, m).join('+'); };
  ok(mp(false, false, false, true) === 'ui.hit.armor' && mp(false, false, false, false) === 'ui.hit', 'a body hit on kevlar: the kevlar tick (DamageBodyArmor); on flesh: the body tick');
  ok(mp(true, false, false, true) === 'ui.kill.armor' && mp(true, false, false, false) === 'ui.kill', 'a body kill on kevlar: DeathBodyArmor; on flesh: DeathBody');
  ok(mp(false, true, true, true) === 'ui.hit.helmet' && mp(false, true, false, true) === 'ui.hit.head', 'a headshot is the head\'s events whatever the vest');
  ok(mp(false, false, false, true, true) === 'ui.hit.knife' && EVENTS['ui.hit.knife'].silent, "a knife's hit: CS2's Knife.AttackerFeedback — sounds/common/null.vsnd, silent (ours too)");
  ok(hurtEvent('chest', false, true, false, true) === 'hurt.body.armor' && hurtEvent('stomach', false, true, true, true) === 'hurt.body.armor.kill' && hurtEvent('chest', false, false, false, true) === 'hurt.body.armor.onlooker' && hurtEvent('chest', false, false, true, true) === 'hurt.body.armor.kill.onlooker' && hurtEvent('head', true, true, false, true) === 'hurt.head.helmet', 'the victim and onlookers: the armour events for a body hit on kevlar');
  ok(synthSamples('hit.armor') instanceof Float32Array && synthSamples('hit.armor').length / 48000 <= .13 && EVENTS['ui.hit.armor'].syn === 'hit.armor', 'our own kevlar tick without CS2 (hit.armor, 120 ms), synthesized once with the others');
  // voices: a burst of armour hits keeps 2 at most; the knife plays none
  resetVoices(); const s0 = c.started.length; for (let k = 0; k < 6; k++) gdHitSounds(false, false, false, true); let live = 0; for (const s of c.started.slice(s0)) if (!s.stopped) live++;
  ok(c.started.length - s0 === 6 && voiceStats.capped >= 4, `6 armour hits in a row: each heard, the 3rd on fading the oldest — at most 2 at once (${voiceStats.capped} given way)`);
  const s1 = c.started.length; gdHitSounds(false, false, false, false, true); ok(c.started.length === s1, 'a knife hit starts no voice');
  // the host: ar on the result and the record; w the attacker's gun
  const CL = await import('../dist/combat-logic.js'), { weaponById } = await import('../dist/weapons-data.js');
  const g = { mode: 'arena', combat: { hp: { cy: 100, bo: 100 }, down: {}, kills: {}, deaths: {}, feed: [], armor: { cy: { kevlar: 100, helmet: false } } } };
  const ra = CL.applyHit(g, 'Ann', 'Cy', weaponById('ak'), 'chest', 100), rb = CL.applyHit(g, 'Ann', 'Bo', weaponById('ak'), 'chest', 100), rl = CL.applyHit(g, 'Ann', 'Cy', weaponById('ak'), 'legs', 100);
  ok(ra.ar === 1 && !('ar' in rb) && !('ar' in rl) && ra.w === 'ak', 'the host: ar 1 for a chest hit on kevlar, none on flesh or the legs; w the attacker\'s gun');
  const bR = CL.bleed(g, 'Cy', ra, 0, 10, 0, 0, 0, -1, Date.now()); ok(bR && bR.ar === 1 && bR.w === 'ak', 'the blood record carries ar and w (every computer hears the armour)');
  { const bl = [], Gm = { combat: { bl } }, heard = [], shots = []; class El { constructor() { this.className = ''; this.kids = []; this.style = {}; } append(...k) { this.kids.push(...k); } }
    globalThis.document = { createElement: () => new El(), getElementById: () => null, head: new El(), body: new El() };
    const { createHitFeedback } = await import('../dist/gd-hit-feedback.js'); const F = createHitFeedback({ parent: new El(), hit: (...a) => shots.push(a), hurt: (...a) => heard.push(a), frame: out => { out.fx = 0; out.fz = -1; return out; } });
    F.update(Gm, 'ann', 5000); let i = 900; bl.push({ i: ++i, at: 5000, v: 'cy', z: 'chest', d: 27, p: [1, 2, 3], r: [1, 0, 0], s: 'ann', ar: 1, w: 'ak' }); F.update(Gm, 'ann', 5000); F.hit(false, false, false);
    ok(shots[0][3] === true && shots[0][4] === false && heard.length === 0, 'your hit on a vest: the shooter\'s sound picks the armour event from your newest record (not heard twice)');
    F.hit(false, false, false, 1, 'm4a1s'); F.hit(false, false, false, 0, 'knife'); ok(shots[1][3] === true && shots[1][4] === false && shots[2][3] === false && shots[2][4] === true, '(v53 HITS final) the hit result\'s own ar / w, when passed, pick the sound — no record search'); shots.splice(1, 2);
    bl.push({ i: ++i, at: 5000, v: 'cy', z: 'chest', d: 40, p: [1, 2, 3], r: [1, 0, 0], s: 'ann', w: 'knife' }); F.update(Gm, 'ann', 5000); F.hit(false, false, false); ok(shots[1][4] === true, '…a knife\'s: the knife feedback');
    bl.push({ i: ++i, at: 5000, v: 'bo', z: 'stomach', d: 25, p: [4, 2, 3], r: [1, 0, 0], s: 'cy', ar: 1 }); F.update(Gm, 'ann', 5000); ok(heard.length === 1 && heard[0][0] === 'stomach' && heard[0][2] === false && heard[0][6] === true, 'someone else\'s body hit on kevlar: placed, the onlooker\'s armour event');
    bl.push({ i: ++i, at: 5000, v: 'ann', z: 'chest', d: 25, p: [4, 2, 3], r: [1, 0, 0], s: 'cy', ar: 1 }); F.update(Gm, 'ann', 5000); ok(heard.length === 2 && heard[1][2] === true && heard[1][6] === true, 'your own vest hit: the victim\'s armour event'); } }

// (v53 HITS final) CS2's child events: the armour / bare body kills carry Player.DeathBody.Flesh; BaseGrenade.Explode both of its
{ const ch = { 'hurt.body.kill': ['Player.DeathBody.Victim', 'hurt.body.kill.flesh'], 'hurt.body.armor.kill': ['Player.DeathBodyArmor.Victim', 'hurt.body.kill.flesh'], 'hurt.body.kill.onlooker': ['Player.DeathBody.Onlooker', 'hurt.body.kill.onlooker.flesh'], 'hurt.body.armor.kill.onlooker': ['Player.DeathBodyArmor.Onlooker', 'hurt.body.kill.onlooker.flesh'] };
  for (const [id, [cs, w]] of Object.entries(ch)) ok(EVENTS[id]?.cs === cs && EVENTS[id].with === w && EVENTS[w]?.cs === 'Player.DeathBody.Flesh' && EVENTS[w].layer && EVENTS[id].cap === 2, `${id}: ${cs} with its child Player.DeathBody.Flesh (enable_child_events), 2 voices`);
  ok(EVENTS['hurt.body.onlooker'].cs === 'Player.DamageBody.Onlooker' && EVENTS['hurt.body.onlooker'].cap === 2 && EVENTS['hurt.body.onlooker'].cat === 'world', 'the onlookers\' body hit: Player.DamageBody.Onlooker, placed, 2 voices');
  ok(EVENTS['nade.he.explode'].far === 'nade.he.far' && EVENTS['nade.he.far']?.cs === 'BaseGrenade.ExplodeDistant' && EVENTS['nade.he.explode'].with === 'nade.he.effect' && EVENTS['nade.he.effect'].cs === 'BaseExplosionEffect.Sound' && EVENTS['nade.he.effect'].layer, 'the HE: BaseGrenade.Explode with both its children (.ExplodeDistant and BaseExplosionEffect.Sound)');
  for (const c of ['Player.DeathBody.Victim', 'Player.DeathBody.Onlooker', 'Player.DeathBody.Flesh']) ok(REF[c], c + ' in CS2\'s reference values (gd-sounds-ref.js)');
  ok(REF['Player.DeathBody.Victim']?.[0] === 2 && REF['Player.DeathBody.Flesh']?.[0] === 2 && REF['Player.DeathBody.Flesh']?.[6] === .1 && REF['Player.DeathBody.Onlooker']?.[0] === 2, 'their CS2 numbers: DeathBody.Victim / .Onlooker vol 2, .Flesh vol 2 after .1 s (lines 4558 / 4634 / 3851)'); }
console.log(`PASS: gd-headshot-audio · ${n} checks (CS2 event mapping, helmet / bare head, our ping / thud / ding stand-ins made once, 2 voices of each on the ui mix, ducked layers, victim arc, placed onlooker headshots, host records; v53 HITS: body armour and the knife)`);
