// Recorded sounds (dist/sounds/, CC0 — see tools/pack-sounds.mjs and tools/pack-gunshots.mjs): gunshots per weapon, reload handling, footsteps
// per surface. Decoded once in the background when the sound engine starts; until then (or if a file is missing)
// play() returns false and callers fall back to their synthesized sounds.
import { audioCtx, outAt, reverb, listenerAt } from './spatial-audio.js';
import { weaponById } from './weapons-data.js';
const DIR = new URL('./sounds/', import.meta.url).href;
const GUNS = ['pistol', 'usps', 'p250', 'fiveseven', 'deagle', 'cannon', 'mac10', 'mp7', 'smg', 'mp9', 'p90', 'ump45', 'shotgun', 'xm1014', 'ak', 'galil', 'sg553', 'famas', 'm4', 'm4s', 'aug', 'ssg08', 'sniper', 'lmg'];
const NAMES = [...GUNS.flatMap(id => ['shot-' + id, 'shot-' + id + '-far']), 'reload-rifle-0', 'reload-rifle-1', 'reload-pistol-0', 'reload-pistol-1', 'reload-pump-0'];
const STEPS = ['concrete', 'wood', 'grass', 'carpet', 'metal'];
// Effects (tools/pack-effects.mjs): name → number of takes (fx-<name>-<take>.ogg).
const FX = { he: 3, low: 1, bomb: 1, bomblow: 1, flash: 1, fire: 1, glass: 3, bounce: 3, wall: 3, flesh: 3, casing: 4 };
const buffers = new Map(); let loading = null;
export function loadSounds() {
  if (typeof fetch !== 'function' || typeof AudioContext === 'undefined') return Promise.resolve(0);
  return loading ??= (async () => { const c = audioCtx(), files = [...NAMES.map(n => n + '.wav'), ...Object.entries(FX).flatMap(([n, k]) => Array.from({ length: k }, (_, i) => `fx-${n}-${i}.ogg`)), ...STEPS.flatMap(s => [0, 1, 2, 3, 4].map(i => `step-${s}-${i}.ogg`))];
    await Promise.all(files.map(async f => { try { const r = await fetch(DIR + f); if (!r.ok) return; buffers.set(f.replace(/\.\w+$/, ''), await c.decodeAudioData(await r.arrayBuffer())); } catch {} }));
    return buffers.size; })();
}
// Play a sound; `at` = where it happens ({x, y, z}, 3D) or null for your own. Returns false if not loaded.
// `delay`: seconds from now; `wet`: how much goes to the shared reverb; `loop`: seconds to loop for (returns a stop()).
export function play(name, { at = null, volume = 1, rate = 1, kind = 'effect', delay = 0, wet = 0, lowpass = 0, loop = 0 } = {}) {
  const buf = buffers.get(name); if (!buf) { loadSounds(); return false; }
  try { const c = audioCtx(), t = c.currentTime + delay, src = c.createBufferSource(), g = c.createGain(); src.buffer = buf; src.playbackRate.value = rate; g.gain.value = volume;
    let head = src; if (lowpass) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass; src.connect(f); head = f; } head.connect(g).connect(outAt(c, at, kind));
    if (wet) { const w = c.createGain(); w.gain.value = wet; g.connect(w).connect(reverb(c)); }
    if (loop) { src.loop = true; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(volume, t + .4); g.gain.setValueAtTime(volume, t + Math.max(.5, loop - 1)); g.gain.linearRampToValueAtTime(0, t + loop); src.start(t, Math.random() * buf.duration * .5); src.stop(t + loop + .05);
      return { stop() { try { const n = c.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + .35); src.stop(n + .4); } catch {} } }; }
    src.start(t); return true; } catch { return false; }
}
// A random take of an effect (FX): fx('he', { at }) …
export const fx = (name, opts) => play(`fx-${name}-${Math.random() * (FX[name] || 1) | 0}`, opts);
// Gunshot per weapon: every gun has its own real firearm recording (tools/pack-gunshots.mjs), close up and from mid
// distance: [recording, playback rate, suppressed]. Suppressed guns are muffled (low-pass) and quieter.
const SHOT = Object.fromEntries(GUNS.map(id => [id, [id, 1, ['m4s', 'usps', 'smg'].includes(id)]]));
// A gunshot, mixed like a game: the recording, plus a low thump (body), a supersonic crack (rifles, snipers), the
// action's click for your own gun, and the shared reverb. Far shots lose their highs, gain more echo and a late slap
// off the walls, so you hear where and how far. Suppressed guns: muffled, no crack, almost no echo.
const LAYER_ID = { ssg08: [.6, 1, .7, .4], deagle: [.75, .35, .55, .3], m4s: [0, 0, .5, .05], usps: [0, 0, .5, .05], smg: [0, 0, .5, .05] };   // guns with their own character (SSG: sharp crack, little boom; AWP keeps the heavy boom)
const LAYER = { pistol: [.45, 0, .5, .22], smg: [.4, .15, .45, .25], rifle: [.7, .45, .55, .3], lmg: [.75, .4, .5, .32], shotgun: [.95, 0, .6, .34], sniper: [1.15, .8, .65, .5] };   // [thump, crack, click, reverb]
let noise = null; const noiseBuf = c => { if (noise) return noise; noise = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return noise; };
function burst(c, t, out, { type, freq, q = .8, dur, gain }) { const n = c.createBufferSource(); n.buffer = noiseBuf(c); const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur); n.connect(f).connect(g).connect(out); n.start(t, Math.random() * .5); n.stop(t + dur + .02); }
export function shotSound(id, { at = null, volume = 1 } = {}) {
  const [file, rate, quiet] = SHOT[id] || ['pistol', 1], buf = buffers.get('shot-' + file); if (!buf) { loadSounds(); return false; }
  try {
    const c = audioCtx(), t = c.currentTime, L = LAYER_ID[id] || LAYER[weaponById(id)?.kind] || LAYER.pistol, out = outAt(c, at, 'gun'), vol = volume * (quiet ? .4 : 1);
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
const RELOAD = { rifle: ['reload-rifle-0', 'reload-rifle-1', 'reload-pistol-1'], pistol: ['reload-pistol-0', 'reload-pistol-1', 'reload-rifle-0'], shotgun: [null, 'reload-pistol-0', 'reload-pump-0'] };
const kindOf = id => ['pistol', 'deagle', 'cannon', 'usps', 'p250', 'fiveseven'].includes(id) ? 'pistol' : ['shotgun', 'xm1014'].includes(id) ? 'shotgun' : 'rifle';
export function reloadSound(part, id, at = null) { const name = RELOAD[kindOf(id)][part]; return name === null ? true : play(name, { at, volume: .9, rate: .96 + Math.random() * .08, kind: 'handling' }); }
// Footstep on a surface (concrete, wood, grass, carpet, metal); a random take each step.
export const stepSound = (surface, at = null, volume = .6) => play(`step-${STEPS.includes(surface) ? surface : 'concrete'}-${Math.random() * 5 | 0}`, { at, volume, rate: .94 + Math.random() * .12, kind: 'step' });
