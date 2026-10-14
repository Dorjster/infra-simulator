// Builds the game's sounds (dist/sounds/) from the owner's Epidemic Sound downloads (their subscription; check its
// terms before distributing): one clean take — or several — cut from each recording by its onsets, faded and
// normalised, saved under the game's own sound names. macOS (afconvert).
//   node tools/pack-epidemic.mjs <folder with the "ES_… - Epidemic Sound.wav" files>
import { execFileSync } from 'node:child_process'; import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const [dir] = process.argv.slice(2), out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'sounds'), tmp = mkdtempSync(path.join(os.tmpdir(), 'es-')), RATE = 44100; mkdirSync(out, { recursive: true });
const F = name => { const f = path.join(dir, 'ES_' + name + ' - Epidemic Sound.wav'); if (!existsSync(f)) throw Error('missing: ' + name); return f; };
const cache = new Map();
function load(file, rate = RATE, ch = 1) { const k = file + rate + ch; if (cache.has(k)) return cache.get(k); const t = path.join(tmp, 'x.wav'); execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@' + rate, '-c', String(ch), file, t]); const b = readFileSync(t); let o = 12; while (b.toString('ascii', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4);
  const n = b.readUInt32LE(o + 4) / 2, s = new Float32Array(n); for (let i = 0; i < n; i++) s[i] = b.readInt16LE(o + 8 + i * 2) / 32768; cache.set(k, s); return s; }
// ONLY=<prefix>[,<prefix>…] (env): write only the sounds whose names start with one (e.g. ONLY=shot- re-cuts the gunshots alone).
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);   // (several prefixes, comma separated)
function save(name, s, { gain = 1, rate = RATE, ch = 1 } = {}) { if (ONLY.length && !ONLY.some(o => name.startsWith(o))) return; let peak = 0; for (const v of s) peak = Math.max(peak, Math.abs(v)); const k = peak ? .92 * gain / peak : 1, b = Buffer.alloc(44 + s.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + s.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2 * ch, 28); b.writeUInt16LE(2 * ch, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(s.length * 2, 40);
  for (let i = 0; i < s.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s[i] * k * 32767))), 44 + i * 2); writeFileSync(path.join(out, name + '.wav'), b); console.log(name.padEnd(22), (s.length / rate / ch).toFixed(2) + ' s'); }
// Onsets: a 5 ms window jumping well above the quietest of the last 40 ms (splits bursts and footsteps too).
function onsets(s, thr = .3, ratio = 3) { const w = RATE * .005 | 0, env = []; for (let i = 0; i < s.length; i += w) { let m = 0; for (let j = i; j < Math.min(s.length, i + w); j++) m = Math.max(m, Math.abs(s[j])); env.push(m); }
  const top = Math.max(...env), on = []; let last = -99; for (let i = 1; i < env.length; i++) { let lo = env[i - 1]; for (let j = Math.max(0, i - 8); j < i; j++) lo = Math.min(lo, env[j]); if (env[i] > top * thr && env[i] > lo * ratio && i - last >= 9) { on.push(i * w); last = i; } } return { on, peak: top }; }
function cut(s, a, b, fade = .12) { const c = s.slice(Math.max(0, a), Math.min(s.length, b)), f = Math.min(c.length, fade * RATE | 0); for (let i = 0; i < f; i++) c[c.length - 1 - i] *= (i / f) ** 2; for (let i = 0; i < 48 && i < c.length; i++) c[i] *= i / 48; return c; }
// Up to `count` takes: the most isolated onsets (longest gap after), each at most `len` s, starting 3 ms before the hit.
function takes(file, { count = 1, len = 1, thr = .3, ratio = 3, pick = 'isolated' } = {}) { const s = load(file), { on, peak } = onsets(s, thr, ratio);
  const cand = on.map((o, i) => { const gap = (on[i + 1] ?? s.length) - o; let pk = 0; for (let j = o; j < o + RATE * .08 && j < s.length; j++) pk = Math.max(pk, Math.abs(s[j])); return { o, gap, pk }; }).filter(c => c.pk > peak * .25);
  cand.sort((a, b) => pick === 'loud' ? b.pk - a.pk : b.gap - a.gap); const got = [];
  for (const c of cand) { if (got.length >= count) break; let at = c.o; while (at < s.length && Math.abs(s[at]) < c.pk * .5) at++; let end = at + Math.min(c.gap - (at - c.o) - RATE * .006, len * RATE); for (let j = at + RATE * .1 | 0; j < end; j++) if (Math.abs(s[j]) > c.pk * .7) { end = j - RATE * .004; break; }   // stop before a following shot
    if (end - at < RATE * .05) continue; got.push(cut(s, at - RATE * .003, end, Math.min(.15, (end - at) / RATE * .3))); }
  if (!got.length) throw Error('no take in ' + path.basename(file)); return got; }
const one = (name, src, o) => save(name, takes(F(src), o)[0], o);
const many = (base, src, n, o) => takes(F(src), { ...o, count: n }).forEach((s, i) => save(base + '-' + i, s, o));

// ── Gunshots: each weapon's real counterpart close up; from afar, the same gun's tail / distant recording. ──
const GUNS = {
  ak: ['Guns, Automatic, Assault Rifle, AK47, Single Shots', 'Guns, Automatic, Assault Rifle, AK47, Long Bursts', 1.1],
  galil: ['Guns, Automatic, AK-74, Shots, Short Bursts 02, Perspective 1, High Frequency Details', 'Guns, Automatic, AK-47, Shots, Bursts', 1.1],
  sg553: ['Guns, Automatic, AR-15, Shots, Singles, Combo', 'Guns, Automatic, Assault Rifle, Burst Fire, Distant, Reverberant', 1],
  m4: ['Guns, Automatic, Assault Rifle, M4A1, Various Shots, Single, Bursts 02', 'Guns, Automatic, Assault Rifle, M4A1, Various Shots, Single, Bursts 01', 1.1],
  famas: ['Guns, Automatic, Assault Rifle, HK G36, Single Shots', 'Guns, Automatic, Assault Rifle, HK G36, Long Bursts', 1],
  aug: ['Guns, Automatic, Assault Rifle, HK416, Single Shots', 'Guns, Automatic, Assault Rifle, HK416, Long Bursts', 1],
  m4s: ['Guns, Suppressed, Silenced Pistol, Silencer, Shot, Long Tail', 'Guns, Suppressed, Pistol, Silenced, Shots x4', .7],
  ssg08: ['Guns, Rifle, Sniper, Shot, Short Tail', 'Guns, Rifle, Sniper, Shot, Long Tail', 1.5],
  sniper: ['Guns, Rifle, Big Sniper Rifle, Fire, Shoot, Singular Shots, Reverberant 01', 'Guns, Rifle, Heavy Sniper Rifle, Fire, Shoot, Singular Shots, Very Reverberant', 1.8],
  lmg: ['Guns, Automatic, Machine Gun, M249, Auto-Bridge', 'Guns, Automatic, Machine Gun, M249, Distant, Long Bursts', 1.1],
  negev: ['Guns, Automatic, Machine Gun, MAC-58, Shots, Bursts, Combo', 'Guns, Artillery, Shooting Range, Distant Heavy Machine Gun, Fire, Intense 02', .9],
  mac10: ['Guns, Automatic, Submachine Gun, Uzi, Various Shots, Single, Bursts, Reload 01', 'Guns, Automatic, Submachine Gun, Uzi, Various Shots, Single, Bursts, Reload 03', .8],
  mp9: ['Guns, Automatic, Submachine Gun, HK MP5, Shots, Short Bursts 02, Perspective 1, High Frequency Details', 'Guns, Automatic, Gunshots, Machine Gun, Burst, Distant', .8],
  mp7: ['Guns, Automatic, Submachine Gun, HK MP7, Single Shots', 'Guns, Automatic, Gunshots, Machine Gun, Burst, Distant', .7],
  smg: ['Guns, Suppressed, MP9 Suppressed, Silencer, Single Shots, Dry', 'Guns, Suppressed, Silenced Pistol, Silencer, Shot, Long Tail', .6],
  ump45: ['Guns, Automatic, Submachine Gun, USGI M3 Grease Gun, Shots, Short Bursts, Combo', 'Guns, Automatic, Gunshots, Machine Gun, Burst, Distant', .8],
  p90: ['Guns, Automatic, Submachine Gun, FN P90, Various Shots, Single Bursts 02', 'Guns, Automatic, Gunshots, Machine Gun, Burst, Distant', .7],
  shotgun: ['Guns, Shotgun, Pump Shotgun, Shot, Short Tail', 'Guns, Shotgun, Pump Shotgun, Shot, Long Tail', 1.4],
  xm1014: ['Guns, Shotgun, Benelli M4, Various Shots 02', 'Guns, Shotgun, Benelli M4, Various Shots 01', 1.3],
  pistol: ['Guns, Pistol, Handgun, Glock, Shots, Singles, Combo', 'Guns, Pistol, Shooting Range, Outdoor, Distant Shots', .9],
  usps: ['Guns, Suppressed, Silenced Pistol, Silencer, Shot, Short Tail', 'Guns, Suppressed, Silenced Pistol, Silencer, Shot, Long Tail', .8],
  p250: ['Guns, Pistol, Handgun, Shot, Short Tail', 'Guns, Pistol, Gunshot, Exterior 03', .9],
  fiveseven: ['Guns, Pistol, Handgun, Walther P99 9MM, Various Shots', 'Guns, Pistol, Gunshot, Exterior 02', .8],
  deagle: ['Guns, Pistol, Heavy Pistol, Single Fire, Reverberant 01', 'Guns, Pistol, Long Distance Pistol, Single Fire, Reverberant', 1.2],
  cannon: ['Guns, Pistol, Revolver, Shot, Short Tail', 'Guns, Pistol, Revolver, Shot, Long Tail', 1],
  cz75: ['Guns, Pistol, Handgun, Glock 19, Various Shots 02', 'Guns, Pistol, Distant Shooting Range, Windy 01', .7],
  tec9: ['Guns, Pistol, Handgun, Beretta M9, Various Shots 01', 'Guns, Rifle, Distant Shooting Range, Windy 02', .8],
  bizon: ['Guns, Automatic, Submachine Gun, HK MP5, Shots, Short Bursts 01, Combo', 'Guns, Rifle, Distant Shooting Range, Windy 03', .7],
};
// Three takes close up (each shot of a spray differs, as real ones do), one from afar. Every gun's files are its own:
// a recording with fewer clean takes gets the missing ones as slightly faster / slower versions (not a copy), and
// guns sharing a distant recording each get a different take of it (tests/gd-assets.mjs checks no two files match).
// A take played a little faster or slower (f > 1: shorter and higher), linear interpolation.
const vary = (s, f) => { const out = new Float32Array(Math.floor(s.length / f)); for (let j = 0; j < out.length; j++) { const x = j * f, i = x | 0, k = x - i; out[j] = (s[i] || 0) * (1 - k) + (s[i + 1] || 0) * k; } return out; };
const farUse = new Map();
for (const [id, [near, far, len]] of Object.entries(GUNS)) { const all = takes(F(near), { count: 4, len }), t = (all.some(x => x.length > RATE * .25) ? all.filter(x => x.length > RATE * .25) : all).slice(0, 3);   /* (a recording of quick shots: its shorter takes) */ t.forEach((s, i) => save('shot-' + id + (i ? '-' + 'abc'[i] : ''), s)); for (let i = t.length; i < 3; i++) save('shot-' + id + '-' + 'abc'[i], vary(t[i % t.length], i % 2 ? 1.04 : .96));
  const k = farUse.get(far) || 0; farUse.set(far, k + 1); const ft = takes(F(far), { count: k + 1, len: len * 1.4 }); save('shot-' + id + '-far', k < ft.length ? ft[k] : vary(ft[k % ft.length], 1 + .035 * (1 + (k - ft.length))), { gain: .85 }); }

// ── Reloads (CS2: the whole sequence is heard): a handling grab at the start, mag out, mag in, bolt / slide / pump,
// each a full take with its rattle, per weapon class. ──
const R = (name, src, len, o = {}) => one(name, src, { len, thr: .2, ratio: 2.5, ...o });
R('reload-rifle-grab', 'Guns, Handle, Automatic Rifle, Reload, Handling 03', 1, { gain: .7 });
R('reload-rifle-0', 'Guns, Handle, Rifle, Magazine, Unload', 1.1); R('reload-rifle-1', 'Guns, Handle, Rifle, Magazine, Load', 1.1); R('reload-rifle-2', 'Guns, Mechanism, Assault Rifle, Reload', .9);
R('reload-smg-grab', 'Guns, Handle, Automatic Rifle, Reload, Handling 05', .9, { gain: .7 });
R('reload-smg-0', 'Guns, Handle, Semi-Automatic Rifle, Magazine, Unload', 1); R('reload-smg-1', 'Guns, Handle, Submachine, Auto, Magazine, Load 01', .6); R('reload-smg-2', 'Guns, Mechanism, Submachine, Auto, Cock, Reload', .9);
R('reload-lmg-grab', 'Guns, Handle, Automatic Rifle, Reload, Handling 06', 1.2, { gain: .8 });
R('reload-lmg-0', 'Guns, Mechanism, Machinegun, Auto, Heavy Reload 01', 1.2); R('reload-lmg-1', 'Guns, Handle, Semi-Automatic Rifle, Magazine, Load', 1.2); R('reload-lmg-2', 'Guns, Mechanism, Rifle, Cock, Reload', 1);
R('reload-pistol-grab', 'Guns, Handle, Reload, Pistol Foley', .8, { gain: .7 });
R('reload-pistol-0', 'Guns, Mechanism, Pistol, Remove Magazine', .8); R('reload-pistol-1', 'Guns, Mechanism, Pistol, Insert Magazine', .8); R('reload-pistol-2', 'Guns, Mechanism, Pistol, Slide, Slow', .8);
R('reload-bolt-grab', 'Guns, Handle, Automatic Rifle, Reload, Handling 09', 1, { gain: .7 });
{ const t = takes(F('Guns, Rifle, Sniper, Reload, Mag Out, Mag In, Bolt Action'), { count: 3, len: 1.1, thr: .2, ratio: 2.5 }); save('reload-bolt-0', t[0]); save('reload-bolt-1', t[1] || t[0]); save('reload-bolt-2', t[2] || t[0]); }
R('reload-pump-grab', 'Guns, Handle, Shotgun, Pick Up', .8, { gain: .7 });
R('reload-pump-0', 'Guns, Mechanism, Shotgun, Load Bullet, Reload', .7); R('reload-pump-1', 'Guns, Shotgun, Pump Shotgun, Reload, Cartridge Insert Shell, Pump Action', .8, { pick: 'loud' }); R('reload-pump-2', "Guns, Mechanism, Shotgun, Cock, Reload, Lock 'n Load", .9);
one('fx-draw-0', 'Guns, Handle, Colt Pistol, WW2, Holster, Pull Out, Fast 01', { len: .6 });
one('fx-draw-1', 'Guns, Handle, Item Pick Up, Gun, Rifle, Gameplay', { len: .7 });
one('fx-pickup-0', 'Guns, Handle, Item Pick Up, Gun, Pistol, 9mm, Gameplay', { len: .6 });
one('fx-dry-0', 'Guns, Pistol, Handgun, Dry Fire, Out Of Ammo', { len: .3 });
one('fx-scope-0', 'Guns, Rifle, Sniper, Scope, Zoom In, Zoom Out', { len: .4 });
one('fx-pin-0', 'Guns, Misc, Hand Grenade, Pin Pull', { len: .8 });

// ── Grenades, knife, hits, death, footsteps. ──
many('fx-he', 'Explosions, Designed, Hand Grenade, Frag Grenade', 3, { len: 3, thr: .4, ratio: 4 });
many('fx-smoke', 'Explosions, Designed, Smoke Grenade', 2, { len: 3.5, thr: .35, ratio: 3 });
many('fx-poof', 'Explosions, Designed, Weapon, Stink Bomb, Poof, Haze, Variations 01', 2, { len: 1.5 });
many('fx-glass', 'Glass, Break, Smash, Small', 1, { len: .9 }); save('fx-glass-1', load(F('Glass, Break, Smash, Small')).slice(0, RATE * .9)); save('fx-glass-2', load(F('Glass, Break, Smash, Small')).slice(0, RATE * .9), { gain: .8 });
many('fx-stab', 'Weapons, Knife, Dagger, Stab, Attack, Hit, Impact', 3, { len: .7 });
many('fx-slash', 'Gore, Stab, Knife, Blade, Slash 03', 3, { len: .6 });
one('fx-knifedraw-0', 'Weapons, Knife, Sharpen Blade, Single', { len: .8 });
many('fx-flesh', 'Weapons, Arrow, Impact Flesh, Hit Body, Kill, Blood', 3, { len: .45 });
many('fx-kill', 'Weapons, Arrow, Impact Flesh, Hit Body, Kill, Blood, Whistle', 2, { len: .8, pick: 'loud' });
one('fx-death-0', 'Gore, Bone, Arm, Leg, Break, Male Scream 02', { len: .8 });
for (const [surf, src] of [['concrete', 'Footsteps, Human, Boots, Concrete, Sprint, Distant'], ['grass', 'Footsteps, Human, Boots, Running, Gravel'], ['wood', 'Footsteps, Human, Sneakers Footsteps, Linoleum, Running 02'], ['carpet', 'Footsteps, Human, Forest Footsteps, Heavy, Running'], ['metal', 'Footsteps, Human, Slippers, Old Car, Sprint, Distant']])
  takes(F(src), { count: 5, len: .32, thr: .25, ratio: 2.5 }).forEach((s, i) => save(`step-${surf}-${i}`, s));
many('fx-land', 'Footsteps, Human, Boots, Tile, Jump, Land, Distant', 2, { len: .5, pick: 'loud' });
// ── Freeze-time music: the jazz loop, mono 32 kHz (small), looped softly while everyone waits at spawn. ──
{ const s = load(F('Musical, Loop, Jazz, Trumpet, Cool, Calm'), 32000, 1); save('music-freeze', s, { rate: 32000, gain: .9 }); }
