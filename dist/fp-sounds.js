// CS2's own first-person sounds at the very moments its clips play them: every set's draw, reload, inspect, a knife's
// swings, a grenade's pin and throw — magazine out, magazine slide, magazine in, bolt pull, the foley between — from
// the room's assets (models.fpSounds, made by fp_sounds.py from CS2's clip events: [seconds into the clip, sound
// names (takes), volume, pitch, pitch spread]). A clip played faster or slower (a reload stretched to the gun's time)
// moves its sounds with it. Without them (no imported assets) the callers fall back to their own sounds.
import { userAssets } from './user-assets.js';
import { play } from './sound-bank.js';

let table = null;
if (typeof fetch === 'function') userAssets().then(ua => { table = ua?.models?.fpSounds || null; }).catch(() => {});
export const clipSounds = (set, clip) => table?.[set]?.[clip] || null;
export const setClipSounds = t => { table = t; };   // (tests: a table of their own)
function fire(e, at) { const names = e[1], n = names.length > 1 ? names[Math.random() * names.length | 0] : names[0];
  play(n, { at, volume: Math.min(1.4, e[2]) * .9, rate: e[3] * (1 + (Math.random() * 2 - 1) * e[4]), kind: 'handling' }); }
// Your own weapon: one clip's sounds at a time, stepped every frame (no allocation); a new clip or stop() cuts the rest
// (a reload broken off by a weapon switch goes quiet, as in CS2).
export function createClipChannel(sound = fire) {
  let c = null, t0 = 0, k = 1, i = 0;
  return {
    // set (a first-person set: 'ak', 'butterfly'…), clip ('reload'…), ms: how long the clip plays here (0: its own
    // length); t: now (ms). True when the room has its sounds.
    start(set, clip, ms = 0, t = performance.now()) { c = clipSounds(set, clip); if (!c) return false; t0 = t; k = ms > 0 ? ms / 1000 / c.dur : 1; i = 0; return true; },
    stop() { c = null; },
    get playing() { return !!c; },
    step(t = performance.now()) { if (!c) return; const s = (t - t0) / 1000 / k; while (i < c.ev.length && c.ev[i][0] <= s) sound(c.ev[i++], null); if (i >= c.ev.length) c = null; },
  };
}
// Someone else's (another player's, a bot's): the clip's sounds where they stand, each while still() holds.
export function playClipAt(set, clip, ms, at, still = () => true) { const c = clipSounds(set, clip); if (!c) return false; const k = ms > 0 ? ms / 1000 / c.dur : 1, where = at ? { x: at.x, y: at.y, z: at.z } : null;
  for (const e of c.ev) setTimeout(() => { if (still()) fire(e, where); }, e[0] * k * 1000); return true; }
