#!/usr/bin/env node
// Third-person fit check for the imported CS2 gloves (for the runtime track).
// CS2 draws a chosen glove on a third-person agent with the glove model's own ".worldmodel" meshes (world_L / world_R
// in user-assets/gloves/meshes/glove-<type>.glb), in place of the agent's "thirdperson_default_gloves" mesh. This
// checks, by bone NAME, that every bone of a glove glb's skin exists in each skin of an agent glb with the same
// inverse bind matrix, so world_L / world_R can be bound straight onto the agent's bones (no retarget, no offsets).
//   node tools/cs2-gloves/tp-check.mjs [--gloves user-assets/gloves] [--agents user-assets/agents] [--match cs2_] [--tol 1e-3]
// (--match: only agent glbs whose name starts with it; GD's older ct.glb / t.glb use a different, non-CS2 rig.)
// Exit 1 when a bone is missing or differs by more than --tol. Reads only; works on any glb pair (no Valve data here).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { glbJson } from './manifest.mjs';

export function glbSkins(buf) {   // every skin: Map(boneName -> Float32Array(16) inverse bind)
  const J = glbJson(buf); if (!J?.skins?.length) return [];
  const n = buf.readUInt32LE(12), bin = 20 + n + 8;
  return J.skins.map(sk => {
    const a = J.accessors[sk.inverseBindMatrices], bv = J.bufferViews[a.bufferView], off = bin + (bv.byteOffset || 0) + (a.byteOffset || 0), m = new Map();
    sk.joints.forEach((j, k) => { const f = new Float32Array(16); for (let i = 0; i < 16; i++) f[i] = buf.readFloatLE(off + (k * 16 + i) * 4); m.set(J.nodes[j].name, f); });
    return m;
  });
}
// glove skin vs one agent skin, by name -> { missing: [names], diff, worst }
export function fitByName(glove, agent) {
  const missing = []; let diff = 0, worst = '';
  for (const [name, g] of glove) { const t = agent.get(name); if (!t) { missing.push(name); continue; } for (let i = 0; i < 16; i++) { const d = Math.abs(g[i] - t[i]); if (d > diff) { diff = d; worst = name; } } }
  return { missing, diff, worst };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const gdir = arg('--gloves', 'user-assets/gloves'), adir = arg('--agents', 'user-assets/agents'), tol = +arg('--tol', '1e-3'), match = arg('--match', 'cs2_');
  const meshes = path.join(gdir, 'meshes'); if (!existsSync(meshes) || !existsSync(adir)) { console.log('SKIP: no', existsSync(meshes) ? adir : meshes); process.exit(0); }
  const agents = readdirSync(adir).filter(f => f.endsWith('.glb') && f.startsWith(match)).map(f => ({ f, skins: glbSkins(readFileSync(path.join(adir, f))) })).filter(a => a.skins.length);
  let bad = 0;
  for (const gf of readdirSync(meshes).filter(f => f.endsWith('.glb')).sort()) {
    const [g] = glbSkins(readFileSync(path.join(meshes, gf)));
    for (const a of agents) a.skins.forEach((s, i) => {
      const r = fitByName(g, s), ok = !r.missing.length && r.diff <= tol; if (!ok) bad++;
      console.log(`${ok ? 'ok  ' : 'BAD '} ${gf} on ${a.f} skin ${i}: ${g.size} bones, missing ${r.missing.length}${r.missing.length ? ' (' + r.missing.slice(0, 4).join(',') + ')' : ''}, max inverse-bind diff ${r.diff.toExponential(2)}${r.worst ? ' at ' + r.worst : ''}`);
    });
  }
  if (!agents.length) console.log('SKIP: no skinned agent glb in', adir);
  process.exit(bad ? 1 : 0);
}
