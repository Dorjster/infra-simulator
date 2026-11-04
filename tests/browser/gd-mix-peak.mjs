// Global Defensive · the master mix in Chrome's own Web Audio (v53 HITS, open-B #8): dist/spatial-audio.js's real chain —
// the shared buses, compressor and limiter, then gdFinalStage (CS2's FinalMixGlue, its make-up gain taken out, the −1
// dBFS ceiling) — rendered offline (an OfflineAudioContext in place of the page's AudioContext: nothing is heard; the
// browser is muted anyway) with 8 world voices (gunshots at full scale, 10 ms apart) and 4 UI voices (hit pings at full
// scale): the peak with the GD stage must be ≤ −1 dBFS (without it, the audit measured +1.03). Also the glue's own
// make-up gain as Chrome applies it, against spatial-audio.js compressorMakeup.
//   node tests/browser/gd-mix-peak.mjs <repo-root> <out-dir>
import { chromium } from 'playwright-core'; import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const [root = '.', out = path.join(os.tmpdir(), 'gd-mix-peak')] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
let failed = 0; const check = (name, c, d = '') => { if (!c) failed++; console.log((c ? 'PASS ' : 'FAIL ') + name + (d === '' ? '' : ' · ' + d)); };
try {
  const p = await b.newPage();
  await p.route('http://gd.test/**', r => { const f = path.join(root, 'dist', new URL(r.request().url()).pathname); try { r.fulfill({ body: readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : 'text/html' }); } catch { r.fulfill({ status: 404, body: '' }); } });
  await p.goto('http://gd.test/index.html').catch(() => {}); await p.setContent('<html><body>mix</body></html>');
  const res = await p.evaluate(async () => {
    const SR = 48000, LEN = Math.ceil(SR * 1.2), dB = x => 20 * Math.log10(Math.max(1e-9, x));
    async function run(gd) {
      let ctx = null; window.AudioContext = class extends OfflineAudioContext { constructor() { super(2, LEN, SR); ctx = this; } resume() { return Promise.resolve(); } };
      const SA = await import('http://gd.test/spatial-audio.js?' + (gd ? 'a' : 'b') + Math.random()), c = SA.audioCtx(), w = SA.master(c), u = SA.uiBus(c); if (gd) SA.gdFinalStage(true, c);
      let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 * 2 - 1;
      for (let v = 0; v < 8; v++) { const n = Math.ceil(SR * .35), bf = c.createBuffer(1, n, SR), d = bf.getChannelData(0); for (let i = 0; i < n; i++) { const e = i < SR * .002 ? i / (SR * .002) : Math.exp(-(i - SR * .002) / (SR * .06)); d[i] = rnd() * e; } let pk = 0; for (const x of d) pk = Math.max(pk, Math.abs(x)); for (let i = 0; i < n; i++) d[i] /= pk; const src = c.createBufferSource(); src.buffer = bf; src.connect(w); src.start(.01 * v); }
      for (let v = 0; v < 4; v++) { const n = Math.ceil(SR * .12), bf = c.createBuffer(1, n, SR), d = bf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.sin(2 * Math.PI * 2480 * i / SR) * Math.exp(-i / (SR * .04)); const src = c.createBufferSource(); src.buffer = bf; src.connect(u); src.start(.05 + .02 * v); }
      const r = await c.startRendering(); let pk = 0; for (let ch = 0; ch < r.numberOfChannels; ch++) for (const x of r.getChannelData(ch)) pk = Math.max(pk, Math.abs(x)); return dB(pk); }
    // Chrome's make-up gain of the glue alone: a 1 kHz sine at 0 dBFS through it, steady state, vs the static curve
    async function makeup() { const c = new OfflineAudioContext(1, SR, SR), o = c.createOscillator(), g = c.createDynamicsCompressor(); o.frequency.value = 1000; g.threshold.value = -6; g.knee.value = 3.125; g.ratio.value = 20; g.attack.value = .004; g.release.value = .458; o.connect(g).connect(c.destination); o.start(0); const r = await c.startRendering(), d = r.getChannelData(0); let pk = 0; for (let i = SR / 2; i < SR; i++) pk = Math.max(pk, Math.abs(d[i])); return dB(pk); }
    const SA = await import('http://gd.test/spatial-audio.js?m'); return { old: await run(false), gd: await run(true), glueOut: await makeup(), formula: 20 * Math.log10(SA.compressorMakeup(-6, 3.125, 20)) };
  });
  writeFileSync(path.join(out, 'report.json'), JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
  check(`the shared chain alone peaks at ${res.old.toFixed(2)} dBFS (8 world + 4 UI voices at full scale)`, true);
  check(`through the GD stage: ${res.gd.toFixed(2)} dBFS — at or under −1 dBFS`, res.gd <= -1 + 1e-3);
  check(`Chrome's glue on a 0 dBFS sine: ${res.glueOut.toFixed(2)} dBFS out (its static curve ≈ −5.85 dB, plus its make-up ${res.formula.toFixed(2)} dB — compressorMakeup)`, Math.abs(res.glueOut - (-6 + 6 / 20 * 0 + res.formula) ) < 1.5);
} catch (e) { failed++; console.log('FAIL run: ' + e.message); }
finally { await b.close(); }
console.log(failed ? `FAIL: gd-mix-peak (browser) · ${failed}` : 'PASS: gd-mix-peak (browser)'); process.exit(failed ? 1 : 0);
