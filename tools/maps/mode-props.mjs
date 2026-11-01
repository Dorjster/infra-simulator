// Counter-Strike 2's mode-only scenery in a map export (Source 2 Viewer: ents.txt, world2/world.glb): the entities a
// competitive match never shows — Wingman's and Retakes' walls and props (targetnames *2v2*, *blocker*, *retake*, …),
// anything that starts disabled (StartDisabled: Mirage's broken-shutter remains, shown only once a shutter breaks) — that
// the exported world still draws (the viewer exports every entity's model, on or off). Nuke's 2v2 silo doors on both
// sides of Ramp, its roll-up door across the way from Outside into Secret, a duct over the vent; Overpass's concrete
// walls and doors; Inferno's barricades, pallets, bins and cones. None is in the map's collision (export_ents.py and
// import-cs2-map.mjs leave them out), so they stood in the look as doors and walls you walked through.
// Each: its box (Hammer units, from its drawn meshes) and the materials it is drawn with (names without Blender's .001
// suffixes) — the game takes the look's triangles of those materials inside that box out (cs2-render.js).
//   modeProps(<export dir>) → [{ name, model, cls, mins, maxs, mats }] (none without world2/world.glb)
//   node tools/maps/mode-props.mjs [export root] [map ids…]   prints each map's list (default root ~/CS2-extract/export)
import { readFileSync, existsSync, openSync, readSync, closeSync } from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { fileURLToPath } from 'node:url';
export const MODE_ONLY = /2v2|1v1|retake|wingman|blocker|hostage|armsrace|arms_race|gungame|coop|guardian|deathmatch|dm_|tutorial|training|danger/i;
// (effect cards and the Retakes barrier's own material: convert_world.py already leaves them out of the look)
const FX = /(^|_)(dust_00\d|lightshaft|steam_|fog|godray|light_?beam|volum)|wrongway|retakes?_/i;
export const readEnts = file => readFileSync(file, 'utf8').split(/\n====\d+====\n/).map(b => { const kv = {}; for (const line of b.split('\n')) { const m = /^(\S+)\s+(.*)$/.exec(line.trim()); if (m && !(m[1].toLowerCase() in kv)) kv[m[1].toLowerCase()] = m[2].trim().replace(/^"(.*)"$/, '$1'); } return kv; }).filter(e => e.classname);
const vec = s => (String(s || '').match(/-?[\d.]+(e-?\d+)?/g) || []).slice(0, 3).map(Number);
// Off in a competitive match: a mode's name, starting disabled, or never drawn.
export const modeOnly = e => MODE_ONLY.test(e.targetname || '') || /^(true|1)$/i.test(e.startdisabled || '') || /^(false|0)$/i.test(e.enabled ?? 'true') || e.rendermode === 'kRenderNone' || e.rendermode === '10';
function glbJson(file) { const fd = openSync(file, 'r'), h = Buffer.alloc(20); readSync(fd, h, 0, 20, 0); const n = h.readUInt32LE(12), j = Buffer.alloc(n); readSync(fd, j, 0, n, 20); closeSync(fd); return JSON.parse(j.toString()); }
export function modeProps(dir) {
  const wf = path.join(dir, 'world2', 'world.glb'), ef = path.join(dir, 'ents.txt'); if (!existsSync(wf) || !existsSync(ef)) return [];
  const g = glbJson(wf), M = 39.3701, mul = (a, b) => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
  const trs = nd => { if (nd.matrix) return nd.matrix; const [x, y, z, w] = nd.rotation || [0, 0, 0, 1], [sx, sy, sz] = nd.scale || [1, 1, 1], [tx, ty, tz] = nd.translation || [0, 0, 0];
    return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0, 2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1]; };
  const world = new Array(g.nodes.length), walk = (i, P) => { const W = P ? mul(P, trs(g.nodes[i])) : trs(g.nodes[i]); world[i] = W; for (const c of g.nodes[i].children || []) walk(c, W); };
  for (const r of g.scenes[g.scene || 0].nodes) walk(r, null);
  // (glTF axes: x = Hammer y, y = Hammer z, z = Hammer x — metres)
  const nodes = []; g.nodes.forEach((nd, i) => { if (nd.mesh == null || !world[i]) return; const W = world[i], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], m = g.meshes[nd.mesh];
    for (const p of m.primitives) { const a = g.accessors[p.attributes.POSITION]; if (!a?.min) continue; for (const X of [a.min[0], a.max[0]]) for (const Y of [a.min[1], a.max[1]]) for (const Z of [a.min[2], a.max[2]]) { const gx = W[0] * X + W[4] * Y + W[8] * Z + W[12], gy = W[1] * X + W[5] * Y + W[9] * Z + W[13], gz = W[2] * X + W[6] * Y + W[10] * Z + W[14], H = [gz * M, gx * M, gy * M]; for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], H[k]); hi[k] = Math.max(hi[k], H[k]); } } }
    if (Number.isFinite(lo[0])) nodes.push({ name: nd.name || '', mats: m.primitives.map(p => String(g.materials[p.material]?.name || '').replace(/\.\d+$/, '')), lo, hi, t: [W[14] * M, W[12] * M, W[13] * M] }); });
  const out = [], E = readEnts(ef);
  // A competitive prop's own drawn meshes (its model at its origin): a mode entity wholly inside one drawn with one of its
  // materials stays — Mirage's left shutter remains (shown once the shutter breaks) lie in the intact breakable shutter,
  // whose top the cut would take with them (the look merges each material across the map: no telling them apart there).
  const real = []; for (const e of E) { if (modeOnly(e)) continue; const res = /resource_name:"?([^"]+?)"?$/.exec(e.model || '')?.[1]; if (!res || res.startsWith('maps/')) continue; const b = res.replace(/.*\//, '').replace(/\.vmdl$/, ''), o = vec(e.origin); for (const nd of nodes) if (nd.name.startsWith(b + '.') && Math.hypot(nd.t[0] - o[0], nd.t[1] - o[1], nd.t[2] - o[2]) < 4) real.push(nd); }
  for (const e of E) { if (!modeOnly(e)) continue; const res = /resource_name:"?([^"]+?)"?$/.exec(e.model || '')?.[1]; if (!res) continue;
    // Its drawn meshes: named after its model (a brush entity's model is its own; a prop's, shared — the one at its origin).
    const base = res.replace(/.*\//, '').replace(/\.vmdl$/, ''), o = vec(e.origin), own = res.startsWith('maps/');
    const hits = nodes.filter(nd => nd.name.startsWith(base + '.') && (own || Math.hypot(nd.t[0] - o[0], nd.t[1] - o[1], nd.t[2] - o[2]) < 4) && !nd.mats.every(m => FX.test(m)));
    if (!hits.length) continue; const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const nd of hits) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], nd.lo[k]); hi[k] = Math.max(hi[k], nd.hi[k]); }
    const mats = new Set(hits.flatMap(nd => nd.mats)); if (real.some(nd => nd.mats.some(m => mats.has(m)) && [0, 1, 2].every(k => nd.lo[k] <= lo[k] + 2 && nd.hi[k] >= hi[k] - 2))) continue;
    out.push({ name: e.targetname || '', model: base, cls: e.classname, mins: lo.map(v => +v.toFixed(1)), maxs: hi.map(v => +v.toFixed(1)), mats: [...new Set(hits.flatMap(nd => nd.mats).filter(m => m && !FX.test(m)))] }); }
  return out;
}
// CS2's competitive team spawns with their `priority` (CS2 fills the lower first — the five of a 5v5 are 0 on all eight
// maps): [Hammer x, y, z, priority, team 0 T / 1 CT] — map files imported before v52 carry no priority (bsp-map.js cs2Spawns).
export function spawnPriority(dir) { const ef = path.join(dir, 'ents.txt'); if (!existsSync(ef)) return [];
  return readEnts(ef).filter(e => /^info_player_(terrorist|counterterrorist)$/.test(e.classname) && !modeOnly(e)).map(e => [...vec(e.origin).map(v => +v.toFixed(1)), +e.priority || 0, e.classname === 'info_player_terrorist' ? 0 : 1]); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), js = args.includes('--js'), [root = path.join(os.homedir(), 'CS2-extract', 'export'), ...ids] = args.filter(a => !/^--/.test(a)), list = ids.length ? ids : ['ancient', 'anubis', 'cache', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass'];
  // --spawns: the table's SPAWN_PRIORITY (each map's competitive spawns and their priority)
  if (args.includes('--spawns')) { console.log(list.map(id => [id, spawnPriority(path.join(root, id))]).filter(([, L]) => L.length).map(([id, L]) => `  ${id}: [${L.map(s => `[${s.join(', ')}]`).join(', ')}],`).join('\n')); process.exit(0); }
  // --js: the table dist/cs-maps/cs2-mode-props.js keeps for map files imported before v52 (their header has no modeOff)
  if (js) { const rows = list.map(id => [id, modeProps(path.join(root, id))]).filter(([, L]) => L.length);
    console.log(rows.map(([id, L]) => `  ${id}: [\n${L.map(p => `    [${[...p.mins, ...p.maxs].join(', ')}, '${p.mats.join('|')}'],   // ${p.name || p.cls} ${p.model}`).join('\n')}\n  ],`).join('\n')); process.exit(0); }
  for (const id of list) { const L = modeProps(path.join(root, id)); console.log(`${id}: ${L.length} mode-only entities drawn`); for (const p of L) console.log(`  ${p.cls} ${p.name} ${p.model} [${p.mins.join(', ')}] → [${p.maxs.join(', ')}] ${p.mats.join(', ')}`); }
}
