// Recorded sounds (dist/sounds/, CC0 — see tools/pack-sounds.mjs): gunshots per weapon, reload handling, footsteps
// per surface. Decoded once in the background when the sound engine starts; until then (or if a file is missing)
// play() returns false and callers fall back to their synthesized sounds.
import { audioCtx, outAt } from './spatial-audio.js';
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
export function play(name, { at = null, volume = 1, rate = 1 } = {}) {
  const buf = buffers.get(name); if (!buf) { loadSounds(); return false; }
  try { const c = audioCtx(), src = c.createBufferSource(), g = c.createGain(); src.buffer = buf; src.playbackRate.value = rate; g.gain.value = volume; src.connect(g).connect(outAt(c, at)); src.start(); return true; } catch { return false; }
}
// Gunshot for a weapon id (the cannon sounds like the pistol), slightly varied every shot.
export const shotSound = (id, { at = null, volume = 1 } = {}) => play('shot-' + (id === 'cannon' ? 'pistol' : id), { at, volume, rate: .97 + Math.random() * .06 });
// Reload parts per weapon: magazine out, magazine in, bolt / slide / pump.
const RELOAD = { rifle: ['reload-rifle-0', 'reload-rifle-1', 'reload-pistol-1'], pistol: ['reload-pistol-0', 'reload-pistol-1', 'reload-rifle-0'], shotgun: [null, 'reload-pistol-0', 'reload-pump-0'] };
const kindOf = id => ['pistol', 'deagle', 'cannon'].includes(id) ? 'pistol' : id === 'shotgun' ? 'shotgun' : 'rifle';
export function reloadSound(part, id, at = null) { const name = RELOAD[kindOf(id)][part]; return name === null ? true : play(name, { at, volume: .9, rate: .96 + Math.random() * .08 }); }
// Footstep on a surface (concrete, wood, grass, carpet, metal); a random take each step.
export const stepSound = (surface, at = null, volume = .6) => play(`step-${STEPS.includes(surface) ? surface : 'concrete'}-${Math.random() * 5 | 0}`, { at, volume, rate: .94 + Math.random() * .12 });
