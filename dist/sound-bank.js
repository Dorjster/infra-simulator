// Recorded sounds (dist/sounds/, CC0 — see tools/pack-sounds.mjs): gunshots per weapon, reload handling, footsteps
// per surface. Decoded once in the background when the sound engine starts; until then (or if a file is missing)
// play() returns false and callers fall back to their synthesized sounds.
import { audioCtx, outAt, reverb, listenerAt } from './spatial-audio.js';
import { weaponById } from './weapons-data.js';
const DIR = new URL('./sounds/', import.meta.url).href;
const NAMES = [...['ak', 'm4', 'shotgun', 'pistol', 'deagle', 'sniper', 'smg', 'lmg'].map(id => 'shot-' + id), 'reload-rifle-0', 'reload-rifle-1', 'reload-pistol-0', 'reload-pistol-1', 'reload-pump-0'];
const STEPS = ['concrete', 'wood', 'grass', 'carpet', 'metal'];
const buffers = new Map(); let loading = null;
export function loadSounds() {
  if (typeof fetch !== 'function' || typeof AudioContext === 'undefined') return Promise.resolve(0);
  return loading ??= (async () => { const c = audioCtx(), files = [...NAMES.map(n => n + '.wav'), ...STEPS.flatMap(s => [0, 1, 2, 3, 4].map(i => `step-${s}-${i}.ogg`))];
    await Promise.all(files.map(async f => { try { const r = await fetch(DIR + f); if (!r.ok) return; buffers.set(f.replace(/\.\w+$/, ''), await c.decodeAudioData(await r.arrayBuffer())); } catch {} }));
    return buffers.size; })();
}
// Play a sound; `at` = where it happens ({x, y, z}, 3D) or null for your own. Returns false if not loaded.
export function play(name, { at = null, volume = 1, rate = 1, kind = 'effect' } = {}) {
  const buf = buffers.get(name); if (!buf) { loadSounds(); return false; }
  try { const c = audioCtx(), src = c.createBufferSource(), g = c.createGain(); src.buffer = buf; src.playbackRate.value = rate; g.gain.value = volume; src.connect(g).connect(outAt(c, at, kind)); src.start(); return true; } catch { return false; }
}
// Gunshot per weapon: [recording, playback rate, suppressed]. Guns without their own recording use the closest one,
// pitched so each still sounds different; suppressed guns are muffled (low-pass) and quieter.
const SHOT = { ak: ['ak', 1], galil: ['ak', 1.07], sg553: ['ak', .94], m4: ['m4', 1], famas: ['m4', 1.09], aug: ['m4', .93], m4s: ['m4', 1.05, true], ssg08: ['sniper', 1.22], sniper: ['sniper', 1], mac10: ['smg', 1.14], mp9: ['smg', 1.08], mp7: ['smg', .95], smg: ['smg', 1, true], ump45: ['smg', .84], p90: ['smg', 1.18], shotgun: ['shotgun', 1], xm1014: ['shotgun', 1.12], pistol: ['pistol', 1], cannon: ['pistol', .9], usps: ['pistol', 1.04, true], p250: ['pistol', .9], fiveseven: ['pistol', 1.1], deagle: ['deagle', 1], lmg: ['lmg', 1] };
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
    const src = c.createBufferSource(), g = c.createGain(); src.buffer = buf; src.playbackRate.value = rate * (.97 + Math.random() * .06); g.gain.value = vol * 1.1;
    const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = quiet ? 1300 : Math.max(1100, 17000 * Math.exp(-dist / 120)); src.connect(tone).connect(g).connect(out); src.start(t);
    // Echo: more the further away; a late slap off distant walls; suppressed guns barely ring.
    const wet = c.createGain(); wet.gain.value = vol * (quiet ? .05 : L[3] + far * .45); g.connect(wet).connect(reverb(c));
    if (!quiet && dist > 90) { const d = c.createDelay(1); d.delayTime.value = .12 + far * .25; const dg = c.createGain(); dg.gain.value = vol * .28 * far; g.connect(d).connect(dg).connect(reverb(c)); }
    if (quiet) return true;
    // Body: a fast falling sine thump (felt more than heard), strongest on your own gun.
    const k = at ? .55 * (1 - far) : 1; if (L[0] * k > .02) { const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + .14); og.gain.setValueAtTime(vol * L[0] * k, t); og.gain.exponentialRampToValueAtTime(.0001, t + (L[0] > 1 ? .32 : .18)); o.connect(og).connect(out); o.start(t); o.stop(t + .36); }
    // Crack: supersonic rounds snap (close only); click: your own gun's action.
    if (L[1] && dist < 180) burst(c, t, out, { type: 'highpass', freq: 3800, dur: .018, gain: vol * L[1] * (1 - far) });
    if (!at) burst(c, t + .004, out, { type: 'bandpass', freq: 3200, q: 2.5, dur: .02, gain: vol * L[2] * .5 });
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
