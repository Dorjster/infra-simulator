// CS2's own first-person sounds at the very moments its clips play them: every set's draw, reload, inspect, a knife's
// swings, a grenade's pin and throw — magazine out, magazine slide, magazine in, bolt pull, the foley between — from
// the room's assets (models.fpSounds, made by fp_sounds.py from CS2's clip events: [seconds into the clip, sound
// names (takes), volume, pitch, pitch spread]). A clip played faster or slower (a reload stretched to the gun's time)
// moves its sounds with it. Without them (no imported assets) the callers fall back to their own sounds.
// A clip counts as there only once every one of its sounds has a decoded take (GD-AUD-06: before, a clip in the table
// but still decoding — or a file that never decoded — went silent AND skipped the caller's fallback). Asking for a clip
// asks for its whole set to be decoded (sets decode on demand, not all 38 at start); until then the caller's own sound.
// In Global Defensive each sound goes through its event bank (gd-sounds.js): placed, limited and curved like the rest.
import { userAssets } from './user-assets.js';
import { play, ready as bankReady, want } from './sound-bank.js';
import { gdOn, gdClip } from './gd-sounds.js';

let table = null;
if (typeof fetch === 'function') userAssets().then(ua => { table = ua?.models?.fpSounds || null; }).catch(() => {});
export const clipSounds = (set, clip) => table?.[set]?.[clip] || null;
export const setClipSounds = t => { table = t; wanted.clear(); };   // (tests: a table of their own)
let isReady = bankReady; export const setClipReady = f => { isReady = f || bankReady; };   // (tests: what counts as decoded)
const wanted = new Set();
// Every sound of a set decoded (once asked; the set's names gathered then, not per call).
export function wantSet(set) { if (!table?.[set] || wanted.has(set)) return; wanted.add(set); const names = new Set(); for (const c of Object.values(table[set])) for (const e of c.ev || []) for (const n of e[1]) names.add(n); want([...names]); }
// Each event has a decoded take (no allocation: a walk over the clip's few events).
export function clipReady(c) { for (let i = 0; i < c.ev.length; i++) { const N = c.ev[i][1]; let ok = false; for (let j = 0; j < N.length; j++) if (isReady(N[j])) { ok = true; break; } if (!ok) return false; } return true; }
const readyClip = (set, clip) => { const c = clipSounds(set, clip); if (!c) return null; if (clipReady(c)) return c; wantSet(set); return null; };
function fire(e, at, set = null, src = null) { const names = e[1], n = names.length > 1 ? names[Math.random() * names.length | 0] : names[0], vol = Math.min(1.4, e[2]) * .9, rate = e[3] * (1 + (Math.random() * 2 - 1) * e[4]);
  if (gdOn() && gdClip(set, n, vol, rate, at, src)) return;
  play(n, { at, volume: vol, rate, kind: 'handling' }); }
// Your own weapon: one clip's sounds at a time, stepped every frame (no allocation); a new clip or stop() cuts the rest
// (a reload broken off by a weapon switch goes quiet, as in CS2).
export function createClipChannel(sound = fire) {
  let c = null, t0 = 0, k = 1, i = 0, cs = null;
  return {
    // set (a first-person set: 'ak', 'butterfly'…), clip ('reload'…), ms: how long the clip plays here (0: its own
    // length); t: now (ms). True when the room has its sounds, decoded; else false (and the set asked for).
    start(set, clip, ms = 0, t = performance.now()) { c = readyClip(set, clip); if (!c) return false; cs = set; t0 = t; k = ms > 0 ? ms / 1000 / c.dur : 1; i = 0; return true; },
    stop() { c = null; },
    get playing() { return !!c; },
    step(t = performance.now()) { if (!c) return; const s = (t - t0) / 1000 / k; while (i < c.ev.length && c.ev[i][0] <= s) sound(c.ev[i++], null, cs, 'me'); if (i >= c.ev.length) c = null; },
  };
}
// Someone else's (another player's, a bot's): the clip's sounds where they stand, each while still() holds (a reload
// cut short leaves no stage behind). src: who (CS2's per-source limits).
export function playClipAt(set, clip, ms, at, still = () => true, src = null) { const c = readyClip(set, clip); if (!c) return false; const k = ms > 0 ? ms / 1000 / c.dur : 1, where = at ? { x: at.x, y: at.y, z: at.z } : null;
  for (const e of c.ev) setTimeout(() => { if (still()) fire(e, where, set, src); }, e[0] * k * 1000); return true; }
