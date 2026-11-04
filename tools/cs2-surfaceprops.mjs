#!/usr/bin/env node
// Reads Counter-Strike 2's surface properties from THIS computer's CS2 install and prints the resolved values that
// dist/gd-surface-props.js carries (v53 stage 5): for each surface property its base (inheritance), game material letter,
// bullet penetration distance / damage modifiers, the impact particle and decal group, the bullet-impact sound event, and
// the physics elasticity / friction — every field resolved through its `base` chain the way CS2's surface system does
// (a field a property leaves out comes from its base, then from "default").
// Sources (decompiled with Source2Viewer-CLI, nothing written into the repo):
//   scripts/surfaceproperties_game.txt            gamematerial, bulletPenetrationDistanceModifier / DamageModifier
//   scripts/surfaceproperties_impact_effects.txt  effect (particles/impact_fx/*.vpcf), impactDecalName
//   surfaceproperties/surfaceproperties.vsurf_c   base, physics (elasticity, friction), audiosounds.bulletimpact
// Usage:
//   node tools/cs2-surfaceprops.mjs [--cs2 <dir>] [--json] [names…]
//     --cs2 <dir>  the CS2 extract (default ~/CS2-extract: game/game/csgo/pak01_dir.vpk, tools/s2v/Source2Viewer-CLI)
//     --json       the whole resolved table as JSON (else a table of the names given, or of gd-surface-props' names)
// tests/gd-surface-props.mjs runs this (when the install is here) to check the module's numbers against the files.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const CS2 = path.resolve(opt('--cs2', path.join(os.homedir(), 'CS2-extract')));
const VPK = path.join(CS2, 'game', 'game', 'csgo', 'pak01_dir.vpk'), S2V = path.join(CS2, 'tools', 's2v', 'Source2Viewer-CLI');

// KV3 text → plain objects (the subset these files use).
export function kv3(txt) {
  txt = txt.replace(/<!--[\s\S]*?-->/, ''); let i = 0;
  const ws = () => { for (;;) { while (i < txt.length && /\s/.test(txt[i])) i++; if (txt.startsWith('//', i)) { while (i < txt.length && txt[i] !== '\n') i++; continue; } break; } };
  const val = () => { ws(); const c = txt[i];
    if (c === '{') { i++; const o = {}; for (;;) { ws(); if (txt[i] === '}') { i++; return o; } const km = /^("[^"]*"|[^\s=]+)/.exec(txt.slice(i, i + 200)); const k = km[0].replace(/^"|"$/g, ''); i += km[0].length; ws(); if (txt[i] === '=') i++; o[k] = val(); ws(); if (txt[i] === ',') i++; } }
    if (c === '[') { i++; const a = []; for (;;) { ws(); if (txt[i] === ']') { i++; return a; } a.push(val()); ws(); if (txt[i] === ',') i++; } }
    if (c === '"') { const j = txt.indexOf('"', i + 1); const s = txt.slice(i + 1, j); i = j + 1; return s; }
    const m = /^(resource_name:|resource:|soundevent:|panorama:)?"([^"]*)"/.exec(txt.slice(i, i + 400)); if (m) { i += m[0].length; return m[2]; }
    const n = /^[^\s,\]}]+/.exec(txt.slice(i, i + 100))[0]; i += n.length; if (n === 'true') return true; if (n === 'false') return false; const f = +n; return Number.isFinite(f) ? f : n; };
  return val();
}

// The three files → { name: resolved record }.
export function resolveSurfaces({ game, effects, vsurf }) {
  const byName = (list) => { const o = {}; for (const e of list?.SurfacePropertiesList || []) if (e.surfacePropertyName) o[e.surfacePropertyName] = e; return o; };
  const G = byName(game), E = byName(effects), V = byName(vsurf), names = new Set([...Object.keys(V), ...Object.keys(G), ...Object.keys(E)]), out = {};
  const chain = n => { const c = []; for (let k = n, g = 0; k && g < 16; g++) { c.push(k); k = V[k]?.base || (k === 'default' ? null : 'default'); if (c.includes(k)) break; } return c; };
  const pick = (n, f) => { for (const k of chain(n)) { const v = f(k); if (v !== undefined && v !== '') return v; } return undefined; };
  for (const n of names) out[n] = {
    base: V[n]?.base || null, hash: V[n]?.m_nameHash ?? null, gm: pick(n, k => G[k]?.gamematerial),
    dist: pick(n, k => G[k]?.bulletPenetrationDistanceModifier), dmg: pick(n, k => G[k]?.bulletPenetrationDamageModifier),
    effect: (pick(n, k => E[k]?.effect) || '').replace(/^particles\/(impact_fx\/)?/, '').replace(/\.vpcf$/, '') || null,
    decal: pick(n, k => E[k] && 'impactDecalName' in E[k] ? E[k].impactDecalName : undefined) ?? null,
    sound: pick(n, k => V[k]?.audiosounds?.bulletimpact) || null,
    elasticity: pick(n, k => V[k]?.physics?.elasticity), friction: pick(n, k => V[k]?.physics?.friction) };
  return out;
}

export function readInstall(cs2 = CS2) {
  const vpk = path.join(cs2, 'game', 'game', 'csgo', 'pak01_dir.vpk'), s2v = path.join(cs2, 'tools', 's2v', 'Source2Viewer-CLI');
  if (!existsSync(vpk) || !existsSync(s2v)) return null;
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'cs2-surf-'));
  try {
    const get = f => { execFileSync(s2v, ['-i', vpk, '-f', f, '-o', tmp, '-d'], { stdio: 'ignore' }); return kv3(readFileSync(path.join(tmp, f.replace(/_c$/, '')), 'utf8')); };
    return resolveSurfaces({ game: get('scripts/surfaceproperties_game.txt'), effects: get('scripts/surfaceproperties_impact_effects.txt'), vsurf: get('surfaceproperties/surfaceproperties.vsurf_c') });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const T = readInstall(); if (!T) { console.error(`No CS2 install at ${VPK} / ${S2V} (--cs2 <dir>)`); process.exit(1); }
  if (argv.includes('--json')) { console.log(JSON.stringify(T, null, 1)); process.exit(0); }
  let names = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--cs2');
  if (!names.length) { const { CS2_SURFACES } = await import(pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'gd-surface-props.js')).href); names = Object.keys(CS2_SURFACES); }
  for (const n of names) { const r = T[n]; console.log(n.padEnd(20), r ? `base ${String(r.base).padEnd(12)} gm ${String(r.gm).padEnd(3)} dist ${r.dist} dmg ${r.dmg} effect ${r.effect} decal ${r.decal} sound ${r.sound} e ${r.elasticity} f ${r.friction}` : '(not in the files)'); }
}
