// Global Defensive · the master mix never clips (v53 HITS: open-B #8, the audio audit — spec 2.2): dist/spatial-audio.js
// gdFinalStage (CS2's FinalMixGlue — sounds/graphs/__main__.vmix: −6 dB, knee 3.125, 40:1 → Web Audio's 20:1, 4 ms attack,
// 458 ms release, no make-up gain) after the shared chain, turned on by gd-sounds.js gdAudio(true) only:
//  · the wiring, on a recording stand-in for Web Audio: GD on → limiter → glue → trim → ceiling → speakers; GD off → the
//    limiter to the speakers again (every other mode's chain exactly as before);
//  · the glue's trim takes back the make-up gain Web Audio adds (Chromium's DynamicsCompressorKernel formula,
//    compressorMakeup: the limiter's +0.57 dB the audit measured), and the ceiling's curve never passes −1 dBFS;
//  · an offline render (in this file: a model of Chromium's compressor — its static curve with the knee, peak detection,
//    6 ms look-ahead, attack / release, the make-up gain — and the WaveShaper's curve) of 8 world voices (gunshots at
//    full scale, stacked) and 4 UI voices (hit sounds at full scale) through the whole GD chain peaks ≤ −1 dBFS, where
//    the old chain (without the glue) went over; Chrome's own render of the same: tests/browser/gd-mix-peak.mjs;
//  · CS2's mix-group volumes (soundmixers.txt Default_Mix) in the GD bank: Weapons .6, Footsteps .8, BulletImpacts .3,
//    Foley 1, UI 1, Explosions .7, WeaponsDistant .6, VO .34 — each event's level × its group's.
//   node tests/gd-mix-peak.mjs
import assert from 'node:assert/strict';
let n = 0; const ok = (c, m) => { assert(c, m); n++; if (process.env.V) console.log('  ok ' + m); };
// ── a recording stand-in for Web Audio ──
class Param { constructor(v) { this.value = v; } setValueAtTime(v) { this.value = v; return this; } linearRampToValueAtTime() { return this; } exponentialRampToValueAtTime() { return this; } cancelScheduledValues() { return this; } setTargetAtTime() { return this; } }
class Node { constructor(c, kind) { this.ctx = c; this.kind = kind; this.out = []; } connect(d) { this.out.push(d); return d; } disconnect() { this.out.length = 0; } }
class FakeCtx { constructor() { this.currentTime = 0; this.sampleRate = 48000; this.state = 'running'; this.destination = new Node(this, 'dest'); const P = v => new Param(v); this.listener = { positionX: P(0), positionY: P(0), positionZ: P(0), forwardX: P(0), forwardY: P(0), forwardZ: P(-1), upX: P(0), upY: P(1), upZ: P(0) }; }
  resume() {} createGain() { const g = new Node(this, 'gain'); g.gain = new Param(1); return g; } createBiquadFilter() { const f = new Node(this, 'biquad'); f.frequency = new Param(350); f.Q = new Param(1); f.gain = new Param(0); return f; }
  createDynamicsCompressor() { const d = new Node(this, 'comp'); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) d[k] = new Param(0); return d; } createWaveShaper() { const w = new Node(this, 'shaper'); w.curve = null; w.oversample = 'none'; return w; }
  createConvolver() { return new Node(this, 'conv'); } createBuffer(ch, len, sr) { const d = Array.from({ length: ch }, () => new Float32Array(len)); return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: i => d[i] }; } createBufferSource() { const s = new Node(this, 'src'); s.playbackRate = new Param(1); s.start = () => {}; s.stop = () => {}; return s; } createPanner() { const p = new Node(this, 'panner'); p.positionX = new Param(0); p.positionY = new Param(0); p.positionZ = new Param(0); return p; } createDelay() { const d = new Node(this, 'delay'); d.delayTime = new Param(0); return d; } }
globalThis.AudioContext = FakeCtx; globalThis.localStorage = { getItem: () => null, setItem() {} };
const SA = await import('../dist/spatial-audio.js');
const { GD_GLUE, compressorMakeup, ceilingCurve, gdFinalStage, gdFinalStageOn, audioCtx, master, uiBus } = SA;
const c = audioCtx(); master(c); uiBus(c);
const db = x => 20 * Math.log10(Math.max(1e-12, x)), lin = d => Math.pow(10, d / 20);
// the limiter: the node feeding the speakers before GD
const feeds = () => { const out = []; const seen = new Set(); const walk = (nd, path) => { if (!nd || seen.has(nd) || path.length > 12) return; seen.add(nd); for (const x of nd.out) { if (x === c.destination) out.push(path.concat(nd)); walk(x, path.concat(nd)); } }; walk(master(c), []); return out; };
const before = feeds(); const lim = before[0]?.[before[0].length - 1];
ok(lim && lim.kind === 'comp' && lim.threshold.value === -1 && lim.ratio.value === 20, 'before a match: the shared chain ends in its −1 dBFS limiter, to the speakers');
ok(GD_GLUE.threshold === -6 && GD_GLUE.knee === 3.125 && GD_GLUE.ratio === 20 && GD_GLUE.attack === .004 && GD_GLUE.release === .458 && GD_GLUE.ceiling === -1, "the glue: CS2's FinalMixGlue (−6 dB, knee 3.125, 40:1 → Web Audio's top 20:1, 4 ms, 458 ms) and a −1 dBFS ceiling");
gdFinalStage(true, c); const on = feeds()[0], tail = on.slice(on.indexOf(lim) + 1).map(x => x.kind);
ok(gdFinalStageOn() && tail.join('>') === 'comp>gain>shaper', 'GD on: limiter → glue → trim → ceiling → speakers (' + tail.join(' → ') + ')');
const glue = on[on.indexOf(lim) + 1], trim = on[on.indexOf(lim) + 2], ws = on[on.indexOf(lim) + 3];
ok(glue.threshold.value === -6 && glue.knee.value === 3.125 && glue.ratio.value === 20 && glue.attack.value === .004 && glue.release.value === .458, 'the glue node holds CS2\'s numbers');
ok(Math.abs(db(compressorMakeup(-1, 0, 20)) - .57) < .02, `Web Audio's make-up gain (Chromium's formula): the limiter's ${db(compressorMakeup(-1, 0, 20)).toFixed(2)} dB — the audit's +0.57`);
ok(Math.abs(trim.gain.value * compressorMakeup(-6, 3.125, 20) - 1) < 1e-9 && db(trim.gain.value) < -2, `the trim takes the glue's own make-up back out (${db(trim.gain.value).toFixed(2)} dB): CS2's bAutoMakeupGain false`);
{ let mx = 0; for (const v of ws.curve) mx = Math.max(mx, Math.abs(v)); ok(ws.oversample === 'none' && mx <= lin(-1) + 1e-7 && ws.curve[(ws.curve.length - 1) / 2] === 0, `the ceiling's curve never passes −1 dBFS (${db(mx).toFixed(3)}), no oversampling filter to ring past it`); }
gdFinalStage(false, c); const off = feeds(); ok(!gdFinalStageOn() && off[0][off[0].length - 1] === lim, 'GD off: the limiter to the speakers again — the other modes\' chain as before');

// ── an offline render through a model of Chromium's DynamicsCompressor ──
const SR = 48000;
function compressor(x, { threshold, knee, ratio, attack, release }) {   // (Chromium: static curve, peak detector, 6 ms pre-delay, attack / release on the gain in dB, make-up gain)
  const mk = compressorMakeup(threshold, knee, ratio), lt = lin(threshold), kneeDb = threshold + knee, slope = 1 / ratio, out = new Float32Array(x.length), pre = Math.round(.006 * SR);
  const gainDb = e => { if (e <= lt) return 0; const ed = db(e); if (knee > 0 && ed < kneeDb) { const t = (ed - threshold) / knee; return -(1 - slope) * knee * t * t / 2; } const yk = knee > 0 ? threshold + knee - (1 - slope) * knee / 2 : threshold; return (yk + slope * (ed - kneeDb)) - ed; };
  const aC = Math.exp(-1 / (attack * SR)), rC = Math.exp(-1 / (release * SR)); let g = 0;
  for (let i = 0; i < x.length; i++) { const look = i + pre < x.length ? Math.abs(x[i + pre]) : 0, target = gainDb(look); g = target < g ? target + (g - target) * aC : target + (g - target) * rC; out[i] = x[i] * lin(g) * mk; }
  return out; }
const shape = (x, curve) => { const N = curve.length, o = new Float32Array(x.length); for (let i = 0; i < x.length; i++) { const v = Math.max(-1, Math.min(1, x[i])), p = (v + 1) / 2 * (N - 1), k = Math.min(N - 2, Math.floor(p)), f = p - k; o[i] = curve[k] * (1 - f) + curve[k + 1] * f; } return o; };
const peak = x => { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); return m; };
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 * 2 - 1;
const len = Math.ceil(SR * 1.2), world = new Float32Array(len), ui = new Float32Array(len);
for (let v = 0; v < 8; v++) { const t0 = Math.floor(SR * .01 * v); for (let i = 0; i < SR * .35 && t0 + i < len; i++) { const e = i < SR * .002 ? i / (SR * .002) : Math.exp(-(i - SR * .002) / (SR * .06)); world[t0 + i] += rnd() * e; } }   // (8 gunshots at full scale, 10 ms apart)
for (let v = 0; v < 4; v++) { const t0 = Math.floor(SR * (.05 + .02 * v)); for (let i = 0; i < SR * .12 && t0 + i < len; i++) ui[t0 + i] += Math.sin(2 * Math.PI * 2480 * i / SR) * Math.exp(-i / (SR * .04)); }   // (4 hit sounds at full scale)
const chain = gd => { const w = compressor(world.map(v => v * .7), { threshold: -10, knee: 8, ratio: 3, attack: .003, release: .2 }), m = new Float32Array(len); for (let i = 0; i < len; i++) m[i] = w[i] + ui[i];
  let y = compressor(m, { threshold: -1, knee: 0, ratio: 20, attack: .001, release: .05 }); if (!gd) return y;
  y = compressor(y, GD_GLUE); const tg = 1 / compressorMakeup(GD_GLUE.threshold, GD_GLUE.knee, GD_GLUE.ratio); for (let i = 0; i < len; i++) y[i] *= tg; return shape(y, ceilingCurve()); };
const old = peak(chain(false)), gd = peak(chain(true));
ok(db(old) > -1, `the old chain alone (this model): 8 world + 4 UI voices peak at ${db(old).toFixed(2)} dBFS — over −1 (the audit's Chrome render: +1.03)`);
ok(db(gd) <= -1 + 1e-6, `through the GD chain: ${db(gd).toFixed(2)} dBFS — at or under −1 dBFS`);

// ── CS2's mix-group volumes in the GD bank ──
const G = await import('../dist/gd-sounds.js'); const { MIXGROUP_VOL: M, mixGroupOf, gdEvent, EVENTS } = G;
ok(M.Weapons === .6 && M.Footsteps === .8 && M.BulletImpacts === .3 && M.Foley === 1 && M.UI === 1 && M.Explosions === .7 && M.WeaponsDistant === .6 && M.VO === .34, "soundmixers.txt Default_Mix: Weapons .6, Footsteps .8, BulletImpacts .3, Foley 1, UI 1, Explosions .7, WeaponsDistant .6, VO .34");
const grp = id => mixGroupOf(EVENTS[id]);
ok(grp('gun.ak.fire') === 'Weapons' && grp('gun.ak.far') === 'WeaponsDistant' && grp('step.concrete') === 'Footsteps' && grp('impact.concrete') === 'BulletImpacts' && grp('nade.he.explode') === 'Explosions' && grp('ui.hit') === 'PlayerAttackerFeedback' && grp('gun.casing') === 'Physics' && grp('nade.he.bounce') === 'Foley' && grp('hurt.head.onlooker') === 'PlayerDamage' && grp('nade.he.far') === 'ExplosionsDistant', 'each event in its CS2 mix group (the .vsndevts mixgroup where it differs from its voice category)');
ok(Math.abs(gdEvent('gun.ak.fire').vol - EVENTS['gun.ak.fire'].pv * .6) < 1e-9 || Math.abs(gdEvent('gun.ak.fire').vol - (EVENTS['gun.ak.fire'].pv ?? 1) * .6) < 1e-9, 'a gun\'s level × .6 (Weapons)');
ok(Math.abs(gdEvent('impact.concrete').vol - (EVENTS['impact.concrete'].pv ?? 1) * .3) < 1e-9 && Math.abs(gdEvent('nade.he.explode').vol - EVENTS['nade.he.explode'].pv * .7) < 1e-9, 'a bullet impact × .3, an explosion × .7');
G.setGdOverrides({ 'gun.ak.fire': { files: ['cs2-ak'], vol: 1 } }); ok(Math.abs(gdEvent('gun.ak.fire').vol - .6) < 1e-9, 'CS2\'s own file: its event volume × its group\'s (1 × .6)'); G.setGdOverrides({});
console.log(`PASS: gd-mix-peak · ${n} checks (the GD glue after the limiter, its make-up gain taken out, a −1 dBFS ceiling: 8 world + 4 UI voices ${db(old).toFixed(1)} → ${db(gd).toFixed(1)} dBFS; CS2's mix-group volumes)`);
