#!/usr/bin/env node
// Imports the physics data of Counter-Strike 2's physics props (the maps' prop_physics_multiplayer / prop_physics:
// pots, cans, bottles, buckets, crates, stools…) from THIS computer's CS2 install into the game's git-ignored
// user-assets/gd-props/props.json — what dist/gd-props.js (the host's prop simulation, v53 PROPS) weighs and bounces
// them with. Nothing of Valve's is written into the repo; without this file the game uses its own estimates
// (gd-props.js FALLBACK: a mass from the prop's box, CS2's "default" surface).
//
// WHERE EACH VALUE COMES FROM (every one read from the files, nothing from memory):
//   which models     ~/CS2-extract/export/<map>/entities.json (export_ents.py: the map's entity lump — the same list
//                    tools/maps/import-cs2-map.mjs turns into the map file's props): kind 'phys'
//   mass             <model>.vmdl_c, block PHYS: m_parts[].m_flMass (kg), summed over the parts
//   volume, bounds   PHYS m_parts[].m_rnShape.m_hulls[].m_Hull: m_flVolume (HU³), m_Bounds (HU), m_vCentroid
//   surface          PHYS m_surfacePropertyHashes[0] → surfaceproperties.vsurf m_nameHash (tools/cs2-surfaceprops.mjs),
//                    with that surface's physics elasticity / friction resolved through its base chain
//   breaks, health   <model>.vmdl_c, block DATA m_keyValueText prop_data: its health (−1: not set) else its base's
//                    (scripts/propdata.vdata_c, e.g. "Glass.Small" 5, through _base; names as CS2 matches them, any
//                    case); health > 0 is a prop that takes damage and breaks when it runs out, 0 one that never breaks
//                    (Source's prop_data rule: a health of 0 takes no damage). The damage multipliers dmg.bullets /
//                    dmg.club / dmg.explosive the same way (−1: the base's). break_list (its pieces) kept as `pieces`.
//   density          surfaceproperties.vsurf physics.density (kg/m³) through the base chain: a model whose m_flMass is 0
//                    is weighed by it. v53 PROPS final: when that surface's physics.thickness (inches, through the base
//                    chain) is > 0 the model is a hollow shell — density × its hulls' surface area (m_Hull m_Faces /
//                    m_Edges / m_Vertices: each face's polygon) × the thickness; else (thickness ≤ 0, "default" −1:
//                    solid) density × m_flVolume (HU³ → m³, a Hammer unit an inch). The rule is Source's (vphysics: a
//                    surface with a thickness is a shell — the public SDK, from memory), NOT in the files
//   damping          PHYS m_flLinearDamping / m_flAngularDamping (0 on every prop read so far)
// The models are looked up in pak01_dir.vpk, else in the map's own VPK (maps/de_<map>.vpk).
//
// BACK-UP RULE: an existing props.json is copied to <cs2>/backup/gd-props-YYYYMMDD-HHMM.json first (the 3 newest kept).
// Usage: node tools/import-cs2-props.mjs [--cs2 <dir>] [--out <user-assets dir>] [--dry] [maps…]
//   (maps: export folder names, default every folder under <cs2>/export with an entities.json)
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { readInstall, kv3 } from './cs2-surfaceprops.mjs';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const CS2 = path.resolve(opt('--cs2', path.join(os.homedir(), 'CS2-extract')));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(opt('--out', path.join(ROOT, 'user-assets')), 'gd-props'), DRY = argv.includes('--dry');
const VPK = path.join(CS2, 'game', 'game', 'csgo', 'pak01_dir.vpk'), S2V = path.join(CS2, 'tools', 's2v', 'Source2Viewer-CLI');
const MAPVPK = id => path.join(CS2, 'game', 'game', 'csgo', 'maps', 'de_' + id + '.vpk');
if (!existsSync(VPK) || !existsSync(S2V)) { console.error('No CS2 install at ' + CS2 + ' (pak01_dir.vpk and tools/s2v/Source2Viewer-CLI)'); process.exit(1); }
const skip = new Set(['--cs2', '--out']); const named = argv.filter((a, i) => !a.startsWith('--') && !skip.has(argv[i - 1]));
const EXPORT = path.join(CS2, 'export');
const maps = (named.length ? named : readdirSync(EXPORT)).filter(m => existsSync(path.join(EXPORT, m, 'entities.json')));

// One block of one model, as text (null: not in that VPK).
function block(vpk, file, b) { try { const t = execFileSync(S2V, ['-i', vpk, '-f', file, '-b', b], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); return /--- Data for block/.test(t) ? t : null; } catch { return null; } }
const nums = (t, re) => [...t.matchAll(re)].map(m => +m[1]);
const vec = (t, key) => { const m = new RegExp(key + ' = \\[ ([-\\d.e]+), ([-\\d.e]+), ([-\\d.e]+) \\]').exec(t); return m ? [+m[1], +m[2], +m[3]] : null; };

console.log('Reading CS2 surface properties…');
const SURF = readInstall(CS2) || {}, BY_HASH = {}; for (const [n, s] of Object.entries(SURF)) if (s.hash != null) BY_HASH[s.hash >>> 0] = n;
// Density (kg/m³) of each surface, through its base chain (surfaceproperties.vsurf physics.density; readInstall leaves it out).
const DENS = (() => { const tmp = path.join(os.tmpdir(), 'cs2-props-' + process.pid); try { execFileSync(S2V, ['-i', VPK, '-f', 'surfaceproperties/surfaceproperties.vsurf_c', '-o', tmp, '-d'], { stdio: 'ignore' });
  const f = [path.join(tmp, 'surfaceproperties', 'surfaceproperties.vsurf'), path.join(tmp)].find(q => { try { return readFileSync(q, 'utf8').length > 0; } catch { return false; } });
  const V = {}; for (const e of kv3(readFileSync(f, 'utf8')).SurfacePropertiesList || []) if (e.surfacePropertyName) V[e.surfacePropertyName] = e;
  const field = key => n => { for (let k = n, g = 0; k && g < 16; g++) { const d = V[k]?.physics?.[key]; if (Number.isFinite(d)) return d; k = V[k]?.base || (k === 'default' ? null : 'default'); } return null; };
  return Object.assign(field('density'), { thickness: field('thickness') });
  } catch { return Object.assign(() => null, { thickness: () => null }); } finally { rmSync(tmp, { recursive: true, force: true }); } })();
// v53 PROPS final: CS2's prop types (scripts/propdata.vdata_c: "Glass.Small" health 5, dmg.bullets 1…, _base) by lower-case name.
const PROPDATA = (() => { try { const t = block(VPK, 'scripts/propdata.vdata_c', 'DATA'), T = kv3(t.slice(t.indexOf('<!--'))), out = {}; for (const [k, v] of Object.entries(T)) if (v && typeof v === 'object') out[k.toLowerCase()] = v; return out; }
  catch { console.log('  (scripts/propdata.vdata_c not read: prop types unknown)'); return {}; } })();
// A prop_data key through the model's own block (−1 or missing: not set) and then its base chain.
const propKey = (own, key) => { const v = own?.[key]; if (Number.isFinite(v) && v >= 0) return v; for (let b = own?.base, g = 0; b && g < 8; g++) { const t = PROPDATA[String(b).toLowerCase()]; if (!t) return null; if (Number.isFinite(t[key]) && t[key] >= 0) return t[key]; b = t._base; } return null; };
// The hulls' surface area (HU²): each face of each m_Hull, its polygon round its half-edges (m_Edges: next, twin, origin,
// face — a byte each; m_Faces: a face's first edge; m_Vertices: the corners, 3 floats each — or m_VertexPositions).
const blob = (t, key) => { const m = new RegExp(key + ' = \\s*#\\[([\\s0-9A-Fa-f]*)\\]').exec(t); return m ? Buffer.from(m[1].replace(/\s+/g, ''), 'hex') : null; };
function hullArea(P) { let area = 0; const parts = P.split(/m_Hull = /).slice(1);
  for (const h of parts) { const E = blob(h, 'm_Edges'), F = blob(h, 'm_Faces'), V = blob(h, 'm_VertexPositions') || blob(h, 'm_Vertices'); if (!E || !F || !V || V.length % 12) continue;
    const pt = i => [V.readFloatLE(i * 12), V.readFloatLE(i * 12 + 4), V.readFloatLE(i * 12 + 8)];
    for (let f = 0; f < F.length; f++) { const e0 = F[f], ring = []; let e = e0; for (let g = 0; g < 256; g++) { ring.push(pt(E[e * 4 + 2])); e = E[e * 4]; if (e === e0) break; }
      const a = ring[0]; let cx = 0, cy = 0, cz = 0; for (let i = 1; i + 1 < ring.length; i++) { const b = ring[i], c = ring[i + 1], u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        cx += u[1] * v[2] - u[2] * v[1]; cy += u[2] * v[0] - u[0] * v[2]; cz += u[0] * v[1] - u[1] * v[0]; } area += Math.hypot(cx, cy, cz) / 2; } }
  return area; }
const HU_M = .0254;   // (a Hammer unit is an inch: the volume's HU³ in m³ — for a model whose m_flMass is 0)
const models = {}, perMap = {};
for (const id of maps) {
  const ents = JSON.parse(readFileSync(path.join(EXPORT, id, 'entities.json'), 'utf8')).filter(e => e.kind === 'phys' && e.model);
  perMap[id] = { props: ents.length, classes: [...new Set(ents.map(e => e.class))] };
  for (const e of ents) {
    const name = path.basename(e.model).replace(/\.vmdl$/, ''); if (models[name]) { models[name].maps.includes(id) || models[name].maps.push(id); continue; }
    const file = e.model.replace(/\.vmdl$/, '.vmdl_c'); let vpk = VPK, P = block(vpk, file, 'PHYS'); if (!P && existsSync(MAPVPK(id))) { vpk = MAPVPK(id); P = block(vpk, file, 'PHYS'); }
    if (!P) { models[name] = { path: e.model, maps: [id], missing: true }; console.log('  ' + name + ': no PHYS block found'); continue; }
    const D = block(vpk, file, 'DATA') || '';
    const mass = nums(P, /m_flMass = ([-\d.e]+)/g).reduce((a, b) => a + b, 0), vol = nums(P, /m_flVolume = ([-\d.e]+)/g).reduce((a, b) => a + b, 0);
    const lo = vec(P, 'm_vMinBounds'), hi = vec(P, 'm_vMaxBounds'), cen = vec(P, 'm_vCentroid');
    const hm = /m_surfacePropertyHashes = \[ (\d+)/.exec(P), hash = hm ? +hm[1] : null, surface = hash != null ? BY_HASH[hash] || null : null, S = surface ? SURF[surface] : null;
    const bl = /break_list = \s*\[\s*\{/.test(D), kvt = /m_keyValueText = """([\s\S]*?)"""/.exec(D)?.[1] || '';
    let pd = null; try { pd = kvt ? kv3(kvt)?.prop_data || null : null; } catch { pd = null; }   // (v53 PROPS final: the model's own prop_data block — the old regex ran past it into the next block's health)
    const base = pd?.base ?? null, hp = propKey(pd, 'health'), mult = k => { const v = propKey(pd, k); return Number.isFinite(v) ? v : 1; };
    models[name] = { path: e.model, maps: [id], mass: +mass.toFixed(3), volume: +vol.toFixed(1), bounds: lo && hi ? [lo.map(v => +v.toFixed(2)), hi.map(v => +v.toFixed(2))] : null, centroid: cen ? cen.map(v => +v.toFixed(2)) : null,
      density: surface ? DENS(surface) : null, surface, hash, elasticity: S?.elasticity ?? null, friction: S?.friction ?? null, breaks: hp > 0, pieces: bl, propBase: base, health: hp ?? 0, ownHealth: Number.isFinite(pd?.health) ? pd.health : null, dmg: { bullets: mult('dmg.bullets'), club: mult('dmg.club'), explosive: mult('dmg.explosive') },
      linearDamping: nums(P, /m_flLinearDamping = ([-\d.e]+)/g)[0] ?? null, angularDamping: nums(P, /m_flAngularDamping = ([-\d.e]+)/g)[0] ?? null };
    { const M = models[name], th = surface ? DENS.thickness(surface) : null; M.thickness = th; M.area = +hullArea(P).toFixed(1);
      if (!(M.mass > 0) && M.density > 0 && M.volume > 0) { const shell = th > 0 && M.area > 0, v = shell ? Math.min(M.volume, M.area * th) : M.volume; M.massFromDensity = +(M.density * v * HU_M ** 3).toFixed(3); M.massRule = shell ? 'shell' : 'solid'; } }   // (m_flMass 0: weighed by its surface — a hollow shell when the surface has a thickness, else solid; the rule Source's, not in the files)
    console.log(`  ${name}: ${mass || models[name].massFromDensity + ' (' + models[name].massRule + ')'} kg, ${surface || 'hash ' + hash}${hp > 0 ? ', breaks at ' + hp + ' hp' : ''}`);
  }
}
const out = { v: 1, made: new Date().toISOString(), from: 'CS2 install: <model>.vmdl_c PHYS (m_flMass, m_Hull, m_surfacePropertyHashes) and DATA (break_list, prop_data); scripts/propdata.vdata (health, dmg.*); surfaceproperties.vsurf (elasticity, friction, density, thickness)', v53final: true, maps: perMap, models };
console.log(`${Object.keys(models).length} models over ${maps.length} maps (${Object.values(models).filter(m => m.missing).length} without physics data)`);
if (DRY) process.exit(0);
mkdirSync(OUT, { recursive: true }); const dst = path.join(OUT, 'props.json');
if (existsSync(dst)) { const backups = path.join(CS2, 'backup'); mkdirSync(backups, { recursive: true }); const d = new Date(), p2 = n => String(n).padStart(2, '0');
  const bak = path.join(backups, `gd-props-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json`); copyFileSync(dst, bak); console.log('backup ' + bak);
  for (const old of readdirSync(backups).filter(n => /^gd-props-\d{8}-\d{4}\.json$/.test(n)).sort().reverse().slice(3)) rmSync(path.join(backups, old), { force: true }); }
writeFileSync(dst + '.tmp', JSON.stringify(out, null, 1)); renameSync(dst + '.tmp', dst); console.log('→ ' + dst);
