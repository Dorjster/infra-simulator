#!/usr/bin/env node
// CS2's own death ragdolls (v53 Addendum 3): the physics block (PHYS) of the agents' models in the host's Counter-Strike 2
// install — agents/models/ctm_sas/ctm_sas.vmdl_c (CT) and agents/models/tm_phoenix/tm_phoenix.vmdl_c (T), the agents
// tools/import-cs2-models.mjs imports — read with Source2Viewer-CLI (-b PHYS) and written as
// user-assets/ragdoll/cs2-ragdoll.json: Valve's numbers, local only, never committed (user-assets/ is git-ignored;
// tests/no-valve-data.mjs). dist/gd-ragdoll.js uses it for the CS2 agents when it is there, else our own human ragdoll.
//
// What a PHYS block holds (Rubikon, CS2's physics; the user's install, 2026-10):
//   m_boneNames — the 15 simulated bones (pelvis, spine_2, head_0, both upper / lower arms and legs, hands, ankles);
//   m_parts[i] — bone i's body: m_flMass (kg), m_rnShape (one capsule m_vCenter[2] + m_flRadius, or one sphere), in the
//                bone's own frame in Hammer units; m_flLinearDamping, m_flAngularDamping, m_flInertiaScale;
//   m_joints[] — m_nBody1 → m_nBody2, m_nType (3: a hinge — the knees; 4: a cone joint — swing limit and twist
//                limits), m_Frame1 / m_Frame2 (the joint's frame in each body: position, 1, quaternion x y z w),
//                m_SwingLimit.m_flMax, m_TwistLimit.m_flMin / m_flMax (radians), m_flFriction, m_bEnableCollision.
// The output keeps those numbers as they are (units: Hammer units, the bone's frame — the same frames as the agent's
// skeleton in user-assets/agents: checked, the hip joint's frame sits where leg_upper_l is in pelvis's frame to 0.06 HU).
//   node tools/import-cs2-ragdoll.mjs [--cs2 <dir>] [--out <dir>]
//     --cs2 <dir>   the CS2 extract (default ~/CS2-extract: game/game/csgo/pak01_dir.vpk, tools/s2v)
//     --out <dir>   where to install (default user-assets/ragdoll). An existing cs2-ragdoll.json is moved to
//                   cs2-ragdoll.json.bak-<stamp> first — nothing is overwritten.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseKV3 } from './cs2-ragdoll/kv3.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CS2 = path.resolve(arg('--cs2', path.join(os.homedir(), 'CS2-extract'))), OUT = path.resolve(arg('--out', path.join(ROOT, 'user-assets', 'ragdoll')));
const VPK = path.join(CS2, 'game', 'game', 'csgo', 'pak01_dir.vpk'), S2V = path.join(CS2, 'tools', 's2v', 'Source2Viewer-CLI');
for (const [what, p] of [['CS2 install (pak01_dir.vpk)', VPK], ['Source2Viewer-CLI', S2V]]) if (!existsSync(p)) { console.error(`No ${what} at ${p} (--cs2 <dir>)`); process.exit(1); }
const MODELS = { ct: 'agents/models/ctm_sas/ctm_sas.vmdl_c', t: 'agents/models/tm_phoenix/tm_phoenix.vmdl_c' };

// One model's ragdoll, from its PHYS block (Source2Viewer-CLI's text dump).
export function ragdollOf(dump, from) {
  const at = dump.indexOf('--- Data for block "PHYS"'); if (at < 0) throw Error(from + ': no PHYS block');
  const k = parseKV3(dump.slice(at)), B = k.m_boneNames; if (!Array.isArray(B) || !Array.isArray(k.m_parts) || B.length !== k.m_parts.length) throw Error(from + ': bones and parts differ');
  const r = v => Math.round(v * 1e5) / 1e5;
  const bodies = k.m_parts.map((p, i) => { const S = p.m_rnShape || {}, c = S.m_capsules?.[0]?.m_Capsule, s = S.m_spheres?.[0]?.m_Sphere;
    if (!c && !s) throw Error(from + ': ' + B[i] + ' has no capsule or sphere (hulls are not read)');
    const shape = c ? { a: c.m_vCenter[0].map(r), b: c.m_vCenter[1].map(r), r: r(c.m_flRadius) } : { a: s.m_vCenter.map(r), b: s.m_vCenter.map(r), r: r(s.m_flRadius) };
    return { bone: B[i], mass: p.m_flMass, shape, linDamp: p.m_flLinearDamping, angDamp: p.m_flAngularDamping, inertia: p.m_flInertiaScale ?? 1 }; });
  const frame = f => [f[0], f[1], f[2], f[4], f[5], f[6], f[7]].map(r);   // (position; f[3] is the 1 of a homogeneous point; quaternion x y z w)
  const joints = k.m_joints.map(j => ({ type: j.m_nType === 3 ? 'hinge' : j.m_nType === 4 ? 'cone' : 'type' + j.m_nType, a: j.m_nBody1, b: j.m_nBody2, f1: frame(j.m_Frame1), f2: frame(j.m_Frame2),
    swing: j.m_bEnableSwingLimit ? r(j.m_SwingLimit.m_flMax) : null, twist: j.m_bEnableTwistLimit ? [r(j.m_TwistLimit.m_flMin), r(j.m_TwistLimit.m_flMax)] : null, fric: r(j.m_flFriction), collide: !!j.m_bEnableCollision }));
  for (const j of joints) if (!/^(hinge|cone)$/.test(j.type)) throw Error(from + ': joint type not known (' + j.type + ')');
  return { from: 'CS2: ' + from.replace(/_c$/, '') + ' (PHYS block)', units: 'hu', bodies, joints };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'gd-ragdoll-'));
  try {
    const out = { version: 1, sides: {} };
    for (const [side, file] of Object.entries(MODELS)) {
      execFileSync(S2V, ['-i', VPK, '-f', file, '-o', tmp], { stdio: ['ignore', 'ignore', 'inherit'], maxBuffer: 64 << 20 });
      const local = path.join(tmp, file); if (!existsSync(local)) throw Error('Not in this CS2 install: ' + file);
      const dump = execFileSync(S2V, ['-i', local, '-b', 'PHYS'], { encoding: 'utf8', maxBuffer: 64 << 20 });
      out.sides[side] = ragdollOf(dump, file); console.log(`${side}: ${file} — ${out.sides[side].bodies.length} bodies, ${out.sides[side].joints.length} joints`);
    }
    mkdirSync(OUT, { recursive: true }); const dst = path.join(OUT, 'cs2-ragdoll.json');
    if (existsSync(dst)) { const bak = `${dst}.bak-${new Date().toISOString().replace(/\D/g, '').slice(0, 12)}`; renameSync(dst, bak); console.log('Backed up the old file to ' + bak); }
    writeFileSync(dst, JSON.stringify(out), { flag: 'wx' }); console.log('Wrote ' + dst + ' (local only: Valve\'s numbers, never committed)');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
