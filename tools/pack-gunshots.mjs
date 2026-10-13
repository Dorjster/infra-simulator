// Builds one real gunshot per Global Defensive weapon (dist/sounds/shot-<id>.wav, heard up close, and
// shot-<id>-far.wav, the same gun recorded from mid distance for shots heard from afar) from "The Free Firearm Sound
// Library" (OpenGameArt, CC0): https://opengameart.org/content/the-free-firearm-sound-library — the "Prepared SFX
// Library" folder. One clean shot with its natural echo is cut from each recording (macOS: uses afconvert).
//   node tools/pack-gunshots.mjs "<…>/Prepared SFX Library"
import { execFileSync } from 'node:child_process'; import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const [lib] = process.argv.slice(2), out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'sounds'), tmp = mkdtempSync(path.join(os.tmpdir(), 'gs-')), RATE = 44100;
mkdirSync(out, { recursive: true });
function load(file) { const t = path.join(tmp, 'x.wav'); execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@' + RATE, '-c', '1', file, t]); const b = readFileSync(t); let o = 12; while (b.toString('ascii', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4); const n = b.readUInt32LE(o + 4) / 2, s = new Float32Array(n); for (let i = 0; i < n; i++) s[i] = b.readInt16LE(o + 8 + i * 2) / 32768; return s; }
function save(name, s, gain = 1) { let peak = 0; for (const v of s) peak = Math.max(peak, Math.abs(v)); const k = peak ? .9 * gain / peak : 1, b = Buffer.alloc(44 + s.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + s.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(s.length * 2, 40);
  for (let i = 0; i < s.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s[i] * k * 32767))), 44 + i * 2); writeFileSync(path.join(out, name + '.wav'), b); console.log(name, (s.length / RATE).toFixed(2) + ' s'); }
// Shot onsets: a loud 5 ms window that jumps well above the quietest of the last 40 ms (also splits full-auto bursts).
function onsets(s) { const w = RATE * .005 | 0, env = []; for (let i = 0; i < s.length; i += w) { let m = 0; for (let j = i; j < Math.min(s.length, i + w); j++) m = Math.max(m, Math.abs(s[j])); env.push(m); }
  const top = Math.max(...env), on = []; let last = -99; for (let i = 1; i < env.length; i++) { let lo = env[i - 1]; for (let j = Math.max(0, i - 8); j < i; j++) lo = Math.min(lo, env[j]); if (env[i] > top * .3 && env[i] > lo * 3 && i - last >= 9) { on.push(i * w); last = i; } } return on; }
function cut(s, a, b, fade = .15) { const c = s.slice(Math.max(0, a), Math.min(s.length, b)), f = Math.min(c.length, fade * RATE | 0); for (let i = 0; i < f; i++) c[c.length - 1 - i] *= (i / f) ** 2; for (let i = 0; i < 64 && i < c.length; i++) c[i] *= i / 64; return c; }
// One shot: the onset with the longest gap after it (at most `len` s), from 3 ms before the bang.
function shot(file, len) { const s = load(file), on = onsets(s); let best = 0, gap = -1; on.forEach((o, i) => { const g = (on[i + 1] ?? s.length) - o; if (g > gap) { gap = g; best = o; } });
  let pk = 0; for (let i = best; i < best + RATE * .08 && i < s.length; i++) pk = Math.max(pk, Math.abs(s[i])); let at = best; while (at < s.length && Math.abs(s[at]) < pk * .5) at++;
  return cut(s, at - RATE * .003, at + Math.min(gap - (at - best) - RATE * .006, len * RATE), Math.min(.15, gap / RATE * .3)); }
// [library folder, near file, mid-distance file, length s] per weapon — each gun its own real firearm where the library has one.
const G = {
  pistol: ['Walther PPQ', 'X_39P', 'X_31P', .9], usps: ['Bersa', 'F_47P', 'F_41P', .8], p250: ['Smith & Wesson 642', 'V_27P', 'V_22P', .9], fiveseven: ['Ruger Mark III', 'R_35P', 'R_30P', .8], deagle: ['1911', 'A_42P', 'A_34P', 1.2], cannon: ['Ruger Single Six', 'S_14P', 'S_11P', .9],
  mac10: ['Carl Gustav M45', 'G_31P', 'G_20P', .8], mp7: ['Carl Gustav M45', 'G_33P', 'G_22P', .7], smg: ['Carl Gustav M45', 'G_35P', 'G_24P', .6], mp9: ['PPSh', 'P_30P', 'P_16P', .8], p90: ['PPSh', 'P_32P', 'P_18P', .7], ump45: ['PPSh', 'P_34P', 'P_22P', .8],
  shotgun: ['Nova', 'O_21P', 'O_17P', 1.4], xm1014: ['CD', 'H_21P', 'H_16P', 1.3],
  ak: ['AK-47', 'C_28P', 'C_31P', 1.1], galil: ['AK-47', 'C_29P', 'C_34P', 1.1], sg553: ['SKS', 'U_14P', 'U_19P', 1.1], famas: ['AR-15', 'D_32P', 'D_24P', 1], m4: ['Savage 10 .300 Blackout', 'T_27P', 'T_17P', 1.1], m4s: ['Model 1894', 'L_23P', 'L_17P', .7], aug: ['Marlin 336', 'I_22P', 'I_17P', 1.1],
  ssg08: ['Tikka', 'W_29P', 'W_24P', 1.5], sniper: ['Mosin Nagant', 'M_21P', 'M_26P', 1.8], lmg: ['1917', 'B_24P', 'B_16P', 1.2],
};
for (const [id, [dir, near, far, len]] of Object.entries(G)) { const f = path.join(lib, dir); save('shot-' + id, shot(path.join(f, near + '.wav'), len)); save('shot-' + id + '-far', shot(path.join(f, far + '.wav'), len * 1.3), .8); }
