// Builds the arena's sound files in dist/sounds/ from CC0 recordings (macOS: uses afconvert):
//   · "The Free Firearm Sound Library" (OpenGameArt, CC0) — long multi-shot field recordings; one clean shot with
//     its natural echo tail is cut out of each (the most isolated onset), trimmed, faded and normalised.
//   · "Gun Reload Sounds" by SpringySpringo (OpenGameArt, CC0) — magazine / pump handling, cut into parts.
//   · Kenney "Impact Sounds" (kenney.nl, CC0) — footsteps (copied as .ogg).
// node tools/pack-sounds.mjs <firearm library>/"Prepared SFX Library" <reload wav folder> <kenney Audio folder>
import { execFileSync } from 'node:child_process'; import { readFileSync, writeFileSync, mkdirSync, copyFileSync, mkdtempSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const [lib, reloads, kenney] = process.argv.slice(2), out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'sounds'), tmp = mkdtempSync(path.join(os.tmpdir(), 'snd-'));
mkdirSync(out, { recursive: true }); const RATE = 44100;
// 16-bit mono 44.1 kHz samples (Float32Array) of any file afconvert can read.
function load(file) { const t = path.join(tmp, 'x.wav'); execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@' + RATE, '-c', '1', file, t]); const b = readFileSync(t); let o = 12; while (b.toString('ascii', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4); const n = b.readUInt32LE(o + 4) / 2, s = new Float32Array(n); for (let i = 0; i < n; i++) s[i] = b.readInt16LE(o + 8 + i * 2) / 32768; return s; }
function save(name, s) { let peak = 0; for (const v of s) peak = Math.max(peak, Math.abs(v)); const k = peak ? .9 / peak : 1, b = Buffer.alloc(44 + s.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + s.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(s.length * 2, 40);
  for (let i = 0; i < s.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s[i] * k * 32767))), 44 + i * 2); writeFileSync(path.join(out, name + '.wav'), b); console.log(name, (s.length / RATE).toFixed(2) + ' s'); }
// Onsets: 5 ms envelope crossing 35% of the loudest peak after ≥ 60 ms below 12%.
function onsets(s) { const w = RATE * .005 | 0, env = []; for (let i = 0; i < s.length; i += w) { let m = 0; for (let j = i; j < Math.min(s.length, i + w); j++) m = Math.max(m, Math.abs(s[j])); env.push(m); }
  const top = Math.max(...env), on = []; let quiet = 99; for (let i = 0; i < env.length; i++) { if (env[i] > top * .35 && quiet >= 12) on.push(i * w); quiet = env[i] < top * .12 ? quiet + 1 : 0; } return on; }
function cut(s, a, b, fade = .15) { const c = s.slice(Math.max(0, a), Math.min(s.length, b)), f = Math.min(c.length, fade * RATE | 0); for (let i = 0; i < f; i++) c[c.length - 1 - i] *= (i / f) ** 2; for (let i = 0; i < 64 && i < c.length; i++) c[i] *= i / 64; return c; }
// One shot: the onset with the longest gap after it (max `len` s), from 3 ms before it.
function shot(file, len = 1.1) { const s = load(file), on = onsets(s); let best = 0, gap = -1; on.forEach((o, i) => { const g = (on[i + 1] ?? s.length) - o; if (g > gap) { gap = g; best = o; } });
  // Start right at the bang: 3 ms before the first sample over half the peak in the next 80 ms.
  let pk = 0; for (let i = best; i < best + RATE * .08 && i < s.length; i++) pk = Math.max(pk, Math.abs(s[i]));
  let at = best; while (at < s.length && Math.abs(s[at]) < pk * .5) at++;
  return cut(s, at - RATE * .003, at + Math.min(gap - (at - best) - RATE * .01, len * RATE)); }
const L = (dir, f) => path.join(lib, dir, f);
const SHOTS = { ak: ['AK-47', 'C_27P.wav'], m4: ['AR-15', 'D_24P.wav'], shotgun: ['Nova', 'O_17P.wav', 1.4], pistol: ['Walther PPQ', 'X_31P.wav', .9], deagle: ['1911', 'A_34P.wav', 1.1], sniper: ['Savage 10 .300 Blackout', 'T_17P.wav', 1.6], smg: ['Walther PPQ', 'X_39P.wav', .8],   /* MP5: 9 mm */ lmg: ['AR-15', 'D_32P.wav'] };
for (const [id, [dir, f, len]] of Object.entries(SHOTS)) save('shot-' + id, shot(L(dir, f), len));
// Reloads: split each handling recording at its onsets into separate clicks (mag out, mag in, bolt / pump).
for (const [id, f] of [['rifle', 'assaultriflereload1_0.wav'], ['pistol', 'gunreload1.wav'], ['pump', 'shotguncock_0.wav']]) {
  const s = load(path.join(reloads, f)), w = RATE * .005 | 0, env = []; for (let i = 0; i < s.length; i += w) { let m = 0; for (let j = i; j < Math.min(s.length, i + w); j++) m = Math.max(m, Math.abs(s[j])); env.push(m); }
  const top = Math.max(...env), parts = []; let i = 0; while (i < env.length) { if (env[i] > top * .25) { const a = i; let q = 0; while (i < env.length && q < 16) { q = env[i] < top * .06 ? q + 1 : 0; i++; } parts.push([a * w, i * w]); } else i++; }
  parts.forEach(([a, b], k) => save(`reload-${id}-${k}`, cut(s, a - RATE * .004, b, .04)));
}
for (const surf of ['concrete', 'wood', 'grass', 'carpet']) for (let i = 0; i < 5; i++) copyFileSync(path.join(kenney, `footstep_${surf}_00${i}.ogg`), path.join(out, `step-${surf}-${i}.ogg`));
for (let i = 0; i < 5; i++) copyFileSync(path.join(kenney, `impactMetal_light_00${i}.ogg`), path.join(out, `step-metal-${i}.ogg`));
