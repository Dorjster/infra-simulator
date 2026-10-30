// Recorded sounds (dist/sounds/: tools/pack-epidemic.mjs from the owner's Epidemic Sound library; the rest CC0 — see
// MODEL-SOURCES.md): gunshots per weapon, reloads and handling, grenades, knife, hits, footsteps per surface. Decoded in the background when the sound engine starts; until then (or if a file is missing)
// play() returns false and callers fall back to their synthesized sounds.
// Global Defensive plays through its own event bank (gd-sounds.js: every event's placeholder, the room's CS2 file,
// CS2's distance curve, voices); while it is on it routes the calls here to itself (setSoundRoute), so the shared
// callers (guns, footsteps) need no mode checks and the other modes keep exactly these sounds.
import { audioCtx, outAt, reverb, listenerAt, uiBus } from './spatial-audio.js';
import { weaponById, WEAPONS, isFirearm } from './weapons-data.js';
import { userAssets, userAssetURL } from './user-assets.js';
const DIR = new URL('./sounds/', import.meta.url).href;
const GUNS = [...WEAPONS.filter(isFirearm).map(w => w.id), 'cannon'];   // (every gun's own shots: shot-<id>[-b|-c|-far])
const NAMES = [...GUNS.flatMap(id => ['shot-' + id, 'shot-' + id + '-b', 'shot-' + id + '-c', 'shot-' + id + '-far']), ...['rifle', 'smg', 'lmg', 'pistol', 'bolt', 'pump'].flatMap(k => ['grab', 0, 1, 2].map(p => `reload-${k}-${p}`))];
const STEPS = ['concrete', 'wood', 'grass', 'carpet', 'metal'];
// Effects: name → number of takes (fx-<name>-<take>.wav, or .ogg for the older CC0 ones).
export const FX = { he: 3, low: 1, bomb: 1, bomblow: 1, flash: 1, fire: 1, glass: 3, bounce: 3, wall: 3, flesh: 3, casing: 4, smoke: 2, poof: 2, stab: 3, slash: 3, knifedraw: 1, kill: 2, death: 1, land: 2, draw: 2, pickup: 1, dry: 1, scope: 1, pin: 1 };
// Every shipped name (dist/sounds): what the other modes decode at start (the room's CS2 versions of these replace them).
export const SHIPPED = new Set([...NAMES, ...Object.entries(FX).flatMap(([n, k]) => Array.from({ length: k }, (_, i) => `fx-${n}-${i}`)), ...STEPS.flatMap(s => [0, 1, 2, 3, 4].map(i => `step-${s}-${i}`))]);
const buffers = new Map(), pending = new Map(), bySource = new Map(); let loading = null, room = null;
// The room's own sounds (CS2's, imported on the host's computer: user-assets/sounds, models.sounds — never shipped).
const roomSounds = () => room ??= (typeof fetch === 'function' ? userAssets().catch(() => null) : Promise.resolve(null)).then(ua => ({ ua, mine: ua?.models?.sounds || {} }));
// Fetches and decodes run a few at a time (not ~950 requests at once), in the order asked. (decodeAudioData decodes
// off the main thread; what the page pays is the fetch and the copy, spread out this way.)
const queue = []; let inFlight = 0; const MAX_FETCH = 6;
const pump = () => { while (inFlight < MAX_FETCH && queue.length) { const job = queue.shift(); inFlight++; job().finally(() => { inFlight--; pump(); }); } };
const fetchDecode = url => new Promise(res => { queue.push(async () => { try { const r = await fetch(url); res(r.ok ? await audioCtx().decodeAudioData(await r.arrayBuffer()) : null); } catch { res(null); } }); pump(); });
// One sound by name: the room's file (one decode per CS2 source: names sharing a `from` share the buffer — the four
// smoke_emit copies, a gun's repeated takes), else the shipped .wav / .ogg.
function decode(n) {
  let p = pending.get(n); if (p) return p;
  p = roomSounds().then(async ({ ua, mine }) => { let b = null; const m = mine[n];
    if (m?.file) { const key = m.from || m.file; let s = bySource.get(key); if (!s) { s = fetchDecode(userAssetURL(ua, m.file)); bySource.set(key, s); } b = await s; }
    if (!b && SHIPPED.has(n)) for (const ext of ['.wav', '.ogg']) if ((b = await fetchDecode(DIR + n + ext))) break;
    if (b) buffers.set(n, b); return b; });
  pending.set(n, p); return p;
}
const canDecode = () => typeof fetch === 'function' && typeof AudioContext !== 'undefined';
// Decode these names now (lazily: Global Defensive asks per need — its events on entering a match, a gun's set when
// it is first seen, a first-person set on equip); resolves once all have been tried.
export function want(names) { if (!canDecode() || !names) return Promise.resolve(0); const list = []; for (const n of names) if (n && !buffers.has(n)) list.push(decode(n)); return list.length ? Promise.all(list).then(() => buffers.size) : Promise.resolve(buffers.size); }
export const ready = name => buffers.has(name);
export const bufferOf = name => buffers.get(name) || null;
export const decodedCount = () => buffers.size;   // (tests)
// The CS2 source a name was imported from ('CS2: sounds/…'), or null (shipped / unknown); two names from one source.
let mineNow = {}; export const sourceOf = name => mineNow[name]?.from || null;
export const sameSource = (a, b) => a === b || (!!sourceOf(a) && sourceOf(a) === sourceOf(b));
export const roomSoundNames = () => roomSounds().then(({ mine }) => (mineNow = mine, mine));
// The shipped set (and the room's versions of it, and each gun's own CS2 reloads), decoded at start in every mode.
// The room's first-person clip sounds (fp-*) and Global Defensive's events are decoded on demand, not here.
export function loadSounds() {
  if (!canDecode()) return Promise.resolve(0);
  return loading ??= roomSounds().then(({ mine }) => { mineNow = mine; return want([...SHIPPED, ...Object.keys(mine).filter(n => /^reload-/.test(n))]); });
}
// Global Defensive's route (gd-sounds.js) while a match is on: { shot, fx, reload, step } each returning undefined to
// leave the call to this bank.
let route = null; export const setSoundRoute = r => { route = r || null; };
// Play a sound; `at` = where it happens ({x, y, z}, 3D) or null for your own. Returns false if not loaded.
// `delay`: seconds from now; `wet`: how much goes to the shared reverb; `loop`: seconds to loop for (returns a stop());
// `bus: 'ui'`: the Interface volume (hit markers, menus), never placed in the world.
export function play(name, { at = null, volume = 1, rate = 1, kind = 'effect', delay = 0, wet = 0, lowpass = 0, loop = 0, bus = null } = {}) {
  const buf = buffers.get(name); if (!buf) { if (SHIPPED.has(name)) loadSounds(); else decode(name); return false; }
  try { const c = audioCtx(), t = c.currentTime + delay, src = c.createBufferSource(), g = c.createGain(); src.buffer = buf; src.playbackRate.value = rate; g.gain.value = volume;
    let head = src; if (lowpass) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass; src.connect(f); head = f; } head.connect(g).connect(bus === 'ui' ? uiBus(c) : outAt(c, at, kind));
    if (wet) { const w = c.createGain(); w.gain.value = wet; g.connect(w).connect(reverb(c)); }
    if (loop) { src.loop = true; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(volume, t + .4); g.gain.setValueAtTime(volume, t + Math.max(.5, loop - 1)); g.gain.linearRampToValueAtTime(0, t + loop); src.start(t, Math.random() * buf.duration * .5); src.stop(t + loop + .05);
      return { stop() { try { const n = c.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + .35); src.stop(n + .4); } catch {} } }; }
    src.start(t); return true; } catch { return false; }
}
// A random take of an effect (FX): fx('he', { at }) …
export const fx = (name, opts) => { if (route) { const r = route.fx(name, opts); if (r !== undefined) return r; } return play(`fx-${name}-${Math.random() * (FX[name] || 1) | 0}`, opts); };
// Gunshot per weapon: every gun has its own real firearm recording (tools/pack-gunshots.mjs), close up and from mid
// distance: [recording, playback rate, suppressed]. Suppressed guns are muffled (low-pass) and quieter.
const SHOT = Object.fromEntries(GUNS.map(id => [id, [id, 1, ['m4s', 'usps', 'smg'].includes(id)]]));
// Each recording's loudness evened out (they're all peak-normalised, but their average level spreads over 10 dB: some
// guns sounded three times louder than others); the Negev's 800 rounds a minute a little further down. The Desert
// Eagle and the AWP keep their punch.
const SHOT_TRIM = { negev: .55, lmg: .85, ak: 1.1, m4: .92, m4s: .8, galil: 1.1, famas: .85, aug: .98, sg553: .8, pistol: .82, usps: .85, p250: .9, deagle: .85, sniper: 1, ssg08: .72, smg: 1, mac10: 1.1, mp9: 1.1, p90: 1.05, bizon: 1.05, ump45: .94, shotgun: .6, xm1014: .88 };
// A gunshot, mixed like a game: the recording, plus a low thump (body), a supersonic crack (rifles, snipers), the
// action's click for your own gun, and the shared reverb. Far shots lose their highs, gain more echo and a late slap
// off the walls, so you hear where and how far. Suppressed guns: muffled, no crack, almost no echo.
// Layers on top of the real recording: [thump, crack, click, reverb]. The recordings carry the body and the crack,
// so the synthesized thump / crack stay faint (a little punch on your own big guns); the click is your own action.
const LAYER_ID = { m4s: [0, 0, .4, .05], usps: [0, 0, .4, .05], smg: [0, 0, .4, .05] };
const LAYER = { pistol: [.08, 0, .35, .18], smg: [.06, 0, .3, .2], rifle: [.12, .05, .35, .24], lmg: [.14, .05, .3, .26], shotgun: [.18, 0, .4, .28], sniper: [.25, .1, .45, .4] };
let noise = null; const noiseBuf = c => { if (noise) return noise; noise = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return noise; };
function burst(c, t, out, { type, freq, q = .8, dur, gain }) { const n = c.createBufferSource(); n.buffer = noiseBuf(c); const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur); n.connect(f).connect(g).connect(out); n.start(t, Math.random() * .5); n.stop(t + dur + .02); }
export function shotSound(id, opts = {}) {
  if (route) { const r = route.shot(id, opts); if (r !== undefined) return r; }
  const { at = null, volume = 1 } = opts;
  const [file, rate, quiet] = SHOT[id] || ['pistol', 1], take = 'abc'[Math.random() * 3 | 0], buf = buffers.get('shot-' + file + (take === 'a' ? '' : '-' + take)) || buffers.get('shot-' + file); if (!buf) { loadSounds(); return false; }   // one of three real takes
  try {
    const c = audioCtx(), t = c.currentTime, L = LAYER_ID[id] || LAYER[weaponById(id)?.kind] || LAYER.pistol, out = outAt(c, at, 'gun'), vol = volume * (quiet ? .4 : 1) * (SHOT_TRIM[id] ?? 1);
    const me = listenerAt(), dist = at && me ? Math.hypot(at.x - me.x, at.y - me.y, at.z - me.z) : 0, far = Math.min(1, dist / 260);
    const g = c.createGain(), pr = rate * (.98 + Math.random() * .04);
    const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = quiet ? 1300 : Math.max(1100, 17000 * Math.exp(-dist / 160)); tone.connect(g).connect(out); g.gain.value = vol * 1.1;
    // Close up the near recording; from about 40 m the mid-distance one fades in (the real gun heard from afar).
    const farBuf = buffers.get('shot-' + file + '-far'), mix = farBuf && !quiet ? Math.min(1, Math.max(0, (dist - 40) / 110)) : 0;
    for (const [b, k] of [[buf, 1 - mix], [farBuf, mix]]) if (k > .01) { const src = c.createBufferSource(), sg = c.createGain(); src.buffer = b; src.playbackRate.value = pr; sg.gain.value = Math.sqrt(k); src.connect(sg).connect(tone); src.start(t); }
    // Echo: more the further away; a late slap off distant walls; suppressed guns barely ring.
    const wet = c.createGain(); wet.gain.value = vol * (quiet ? .05 : L[3] + far * .45); g.connect(wet).connect(reverb(c));
    if (!quiet && dist > 90) { const d = c.createDelay(1); d.delayTime.value = .12 + far * .25; const dg = c.createGain(); dg.gain.value = vol * .28 * far; g.connect(d).connect(dg).connect(reverb(c)); }
    if (quiet) return true;
    // Body: a fast falling sine thump (felt more than heard), strongest on your own gun.
    const k = at ? .55 * (1 - far) : 1; if (L[0] * k > .02) { const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + .14); og.gain.setValueAtTime(vol * L[0] * k, t); og.gain.exponentialRampToValueAtTime(.0001, t + (L[0] > 1 ? .32 : .18)); o.connect(og).connect(out); o.start(t); o.stop(t + .36); }
    // Crack: supersonic rounds snap (close only); click: your own gun's action.
    if (L[1] && dist < 180) burst(c, t, out, { type: 'highpass', freq: 3800, dur: .018, gain: vol * L[1] * (1 - far) });
    if (!at) burst(c, t + .004, out, { type: 'bandpass', freq: 3200, q: 2.5, dur: .02, gain: vol * L[2] * .5 });
    // The spent case hitting the floor (heard close by only; shotgun shells are duller).
    if (dist < 25 && Math.random() < .85) { const sg = weaponById(id)?.kind === 'shotgun'; fx('casing', { at: at || (me && { x: me.x + .4, y: me.y - 1.5, z: me.z }), volume: .16 * volume * (1 - dist / 25), rate: (sg ? 1.05 : 1.6) + Math.random() * .25, delay: .32 + Math.random() * .18, kind: 'handling' }); }
    return true;
  } catch { return false; }
}
export const isQuiet = id => !!SHOT[id]?.[2];
// Reload parts per weapon: magazine out, magazine in, bolt / slide / pump.
// Reload sets per weapon class: [mag out, mag in, bolt / slide / pump] — each gun's own when the room has them (CS2's:
// reload-<id>-<part>); the class's handling grab plays with the mag
// out, so a reload is heard as one sequence (grab, out, in, charge) over its whole CS2 length.
const kindOf = id => { const k = weaponById(id)?.kind; return ['pistol', 'deagle', 'cannon', 'usps', 'p250', 'fiveseven'].includes(id) ? 'pistol' : ['shotgun', 'xm1014'].includes(id) ? 'pump' : ['ssg08', 'sniper'].includes(id) ? 'bolt' : k === 'lmg' ? 'lmg' : k === 'smg' ? 'smg' : 'rifle'; };
export function reloadSound(part, id, at = null) { if (route) { const r = route.reload(part, id, at); if (r !== undefined) return r; } const k = kindOf(id), r = .97 + Math.random() * .06, own = `reload-${id}-${part}`; if (part === 0) play(`reload-${k}-grab`, { at, volume: .55, rate: r, kind: 'handling' }); return play(buffers.has(own) ? own : `reload-${k}-${part}`, { at, volume: .9, rate: r, delay: part === 0 ? .12 : 0, kind: 'handling' }); }
// Footstep on a surface (concrete, wood, grass, carpet, metal); a random take each step.
export const stepSound = (surface, at = null, volume = .6, src = null) => { if (route) { const r = route.step(surface, at, volume, src); if (r !== undefined) return r; } return play(`step-${STEPS.includes(surface) ? surface : 'concrete'}-${Math.random() * 5 | 0}`, { at, volume, rate: .94 + Math.random() * .12, kind: 'step' }); };
// (No freeze-time music: Global Defensive's freeze time is silent — the countdown is on screen only.)
