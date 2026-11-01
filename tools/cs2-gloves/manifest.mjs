// The CS2 gloves manifest (user-assets/gloves/gloves.json) and the install step of tools/import-cs2-gloves.mjs:
// checking a manifest against its folder (schema, paths inside the folder, image / glb headers and sizes, each mesh's
// skeleton hash), the staging-folder rule, and installing a baked folder as user-assets/gloves/ under the back-up rule
// (never overwrite: an existing gloves/ is renamed to gloves.bak-YYYYMMDD-HHMM, the 2 newest backups are kept, nothing
// else under user-assets is touched). Pure logic, no Valve data: the node tests use it without a CS2 install.
// (The back-up / staging logic is tools/cs2-skins/manifest.mjs's, copied here for the gloves folder name.)
import { readFileSync, existsSync, statSync, readdirSync, renameSync, rmSync, mkdirSync, copyFileSync, openSync, readSync, closeSync, writeFileSync, realpathSync, constants as fsConst } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { imageSize } from '../cs2-skins/manifest.mjs';

export { imageSize };
export const MANIFEST = 'gloves.json', FOLDER = 'gloves', STAGE_MARK = '.cs2-gloves-stage';
export const ICON_W = 256, ICON_H = 192, WEAR_RES = 512;
export const TYPE_ORDER = ['sporty', 'slick', 'handwrap', 'motorcycle', 'specialist', 'bloodhound', 'hydra', 'brokenfang'];
export const BONES = 52;

const head = (file, n = 65536) => { const fd = openSync(file, 'r'); try { const b = Buffer.alloc(n); const got = readSync(fd, b, 0, n, 0); return b.subarray(0, got); } finally { closeSync(fd); } };

// glb: magic, version 2, its JSON chunk -> { json } or null
export function glbJson(buf) {
  if (!buf || buf.length < 20 || buf.toString('latin1', 0, 4) !== 'glTF' || buf.readUInt32LE(4) !== 2) return null;
  const n = buf.readUInt32LE(12); if (buf.readUInt32LE(16) !== 0x4e4f534a || 20 + n > buf.length) return null;
  try { return JSON.parse(buf.toString('utf8', 20, 20 + n)); } catch { return null; }
}
// a glb's skin: bone names + inverse bind matrices (Float32, 16 per bone, column-major)
export function glbSkeleton(buf) {
  const J = glbJson(buf); if (!J?.skins?.length) return null;
  const sk = J.skins[0], names = sk.joints.map(j => J.nodes[j].name), a = J.accessors[sk.inverseBindMatrices], bv = J.bufferViews[a.bufferView];
  const n = buf.readUInt32LE(12), binStart = 20 + n + 8, off = binStart + (bv.byteOffset || 0) + (a.byteOffset || 0);
  const ibm = new Float32Array(a.count * 16); for (let i = 0; i < ibm.length; i++) ibm[i] = buf.readFloatLE(off + i * 4);
  return { names, ibm, root: J.nodes[J.scenes?.[J.scene || 0]?.nodes?.[0] ?? 0], json: J };
}
// the same hash tools/cs2-gloves/export_mesh.py writes: names + IBMs rounded to 1e-4
export function skeletonHash(names, ibm) {
  const q = Array.from(ibm, x => Math.floor(x * 1e4 + 0.5));
  return createHash('sha1').update(names.join(',') + '|' + q.join(',')).digest('hex');
}
// largest difference of two skeletons' inverse bind matrices over the bones both have (Infinity when names differ)
export function skeletonDiff(a, b, only = null) {
  if (a.names.length !== b.names.length || a.names.some((n, i) => n !== b.names[i])) return Infinity;
  let d = 0; a.names.forEach((n, i) => { if (only && !only.has(n)) return; for (let k = 0; k < 16; k++) d = Math.max(d, Math.abs(a.ibm[i * 16 + k] - b.ibm[i * 16 + k])); });
  return d;
}

// Every file a manifest names, with what it must be: [{ rel, role, kind, w?, h?, type? }]
export function manifestFiles(m) {
  const out = [], res = m.res | 0;
  for (const [id, t] of Object.entries(m.types || {})) out.push({ rel: t.mesh, role: `${id} mesh`, kind: 'glb', skeleton: t.skeleton });
  for (const [kit, f] of Object.entries(m.finishes || {})) {
    out.push({ rel: f.color, role: `${kit} color`, kind: 'img', type: 'jpeg', w: res, h: res }, { rel: f.normal, role: `${kit} normal`, kind: 'img', type: 'png', w: res, h: res },
      { rel: f.orm, role: `${kit} orm`, kind: 'img', type: 'png', w: res, h: res });
    if (f.wear) out.push({ rel: f.wear, role: `${kit} wear`, kind: 'img', type: 'png', w: WEAR_RES, h: WEAR_RES });
    if (f.icon) out.push({ rel: f.icon, role: `${kit} icon`, kind: 'img', type: 'webp', w: ICON_W, h: ICON_H });
  }
  return out;
}

const ID = /^[a-z0-9_-]+$/i, HEX = /^#[0-9a-f]{6}$/i;
// -> { ok, errors[], files, bytes, counts, manifest }
export function validateManifest(dir, { checkFiles = true } = {}) {
  const errors = [], err = s => { if (errors.length < 50) errors.push(s); };
  let m;
  try { m = JSON.parse(readFileSync(path.join(dir, MANIFEST), 'utf8')); } catch (e) { return { ok: false, errors: ['cannot read ' + MANIFEST + ': ' + e.message], files: 0, bytes: 0 }; }
  if (m.version !== 1) err('version must be 1');
  if (!(m.res >= 64 && m.res <= 4096 && (m.res & (m.res - 1)) === 0)) err('res must be a power of two');
  if (!m.source || typeof m.source !== 'object') err('source missing');
  if (!m.skeleton || typeof m.skeleton.hash !== 'string' || m.skeleton.bones !== BONES) err('skeleton: hash / bones');
  for (const k of ['types', 'finishes']) if (!m[k] || typeof m[k] !== 'object') err(k + ' missing');
  for (const [id, t] of Object.entries(m.types || {})) {
    if (!ID.test(id) || t.id !== id) err('bad type id ' + id);
    if (typeof t.name !== 'string' || typeof t.mesh !== 'string' || typeof t.skeleton !== 'string' || !Array.isArray(t.finishes)) err(`${id}: name / mesh / skeleton / finishes`);
    if (m.skeleton && t.skeleton !== m.skeleton.hash) err(`${id}: skeleton ${t.skeleton} is not the arms skeleton ${m.skeleton.hash}`);
    if (t.default !== null && t.default !== undefined && !(m.finishes || {})[t.default]) err(`${id}: default ${t.default} is not a finish`);
    for (const k of t.finishes || []) if (!(m.finishes || {})[k] || m.finishes[k].type !== id) err(`${id}: lists ${k}, which is not one of its finishes`);
  }
  for (const [kit, f] of Object.entries(m.finishes || {})) {
    if (!ID.test(kit) || f.id !== kit) err('bad finish id ' + kit);
    if (!(m.types || {})[f.type]) err(`${kit}: unknown type ${f.type}`);
    if (typeof f.name !== 'string' || typeof f.rarity !== 'string' || !Number.isInteger(f.paintKit)) err(`${kit}: name / rarity / paintKit`);
    if (!Array.isArray(f.wearRange) || f.wearRange.length !== 2 || !(f.wearRange[0] >= 0 && f.wearRange[0] <= f.wearRange[1] && f.wearRange[1] <= 1)) err(`${kit}: wearRange`);
    if (!HEX.test(f.fallback || '')) err(`${kit}: fallback must be #rrggbb`);
  }
  const files = manifestFiles(m); let bytes = 0; const root = path.resolve(dir) + path.sep;
  for (const f of files) {
    if (typeof f.rel !== 'string' || !f.rel || path.isAbsolute(f.rel) || f.rel.includes('\\') || f.rel.split('/').includes('..')) { err(`${f.role}: bad path ${f.rel}`); continue; }
    const p = path.resolve(dir, f.rel);
    if (!p.startsWith(root)) { err(`${f.role}: outside the folder`); continue; }
    if (!checkFiles) continue;
    if (!existsSync(p)) { err(`${f.role}: missing ${f.rel}`); continue; }
    bytes += statSync(p).size;
    if (f.kind === 'glb') {
      const buf = readFileSync(p), sk = glbSkeleton(buf);
      if (!sk) { err(`${f.role}: not a glb with a skin: ${f.rel}`); continue; }
      if (sk.names.length !== BONES) err(`${f.role}: ${sk.names.length} bones, expected ${BONES}`);
      const h = skeletonHash(sk.names, sk.ibm); if (h !== f.skeleton) err(`${f.role}: skeleton hash ${h} ≠ manifest ${f.skeleton}`);
      continue;
    }
    const s = imageSize(head(p));
    if (!s) { err(`${f.role}: not a PNG / JPEG / WebP image: ${f.rel}`); continue; }
    if (f.type && s.type !== f.type) err(`${f.role}: ${s.type}, expected ${f.type}`);
    if (f.w && (s.w !== f.w || s.h !== f.h)) err(`${f.role}: ${s.w}×${s.h}, expected ${f.w}×${f.h}`);
  }
  const counts = { types: Object.keys(m.types || {}).length, finishes: Object.keys(m.finishes || {}).length };
  return { ok: !errors.length, errors, files: files.length, bytes, counts, manifest: m };
}

// ---- the staging folder (--out): a full run deletes every file there its manifest does not list, so it must be the
// tool's own folder: never user-assets itself or an ancestor, inside it only gloves.new (compared by real path)
const STAGE_NAMES = /^(gloves\.json(\.tmp)?|meshes|icons|[a-z0-9_]+)$/;
function realish(p) {
  const abs = path.resolve(p); let h = abs; const tail = [];
  while (!existsSync(h)) { const up = path.dirname(h); if (up === h) break; tail.unshift(path.basename(h)); h = up; }
  try { h = realpathSync(h); } catch {}
  return path.join(h, ...tail);
}
const inside = (child, parent) => child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
export function stageProblem({ out, assets, knownTypes = TYPE_ORDER }) {
  const O = realish(out), A = realish(assets);
  if (inside(A, O)) return O === A ? `--out is the user-assets folder itself (${A})` : `--out ${O} holds the user-assets folder (${A})`;
  if (inside(O, A) && O !== path.join(A, FOLDER + '.new')) return `--out ${O} is inside user-assets: use --install (only user-assets/${FOLDER}.new may be used there)`;
  if (!existsSync(O)) return null;
  if (!statSync(O).isDirectory()) return `--out ${O} is not a folder`;
  const names = readdirSync(O).filter(n => n !== '.DS_Store');
  if (!names.length || names.includes(STAGE_MARK)) return null;
  const known = new Set(knownTypes), foreign = names.filter(n => !(STAGE_NAMES.test(n) && (known.has(n) || /^(gloves\.json(\.tmp)?|meshes|icons)$/.test(n))));
  return foreign.length ? `--out ${O} is a folder this tool did not make (it holds ${foreign.slice(0, 4).join(', ')}${foreign.length > 4 ? ', …' : ''}): use a new or empty folder` : null;
}
export function claimStage(out) { mkdirSync(out, { recursive: true }); const f = path.join(out, STAGE_MARK); if (!existsSync(f)) writeFileSync(f, 'Staging folder of tools/import-cs2-gloves.mjs: a full run deletes files here that its gloves.json does not list.\n'); }

// ---- install under the back-up rule
const stamp = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
export const BACKUP = /^gloves\.bak-(\d{8})-(\d{4})(?:-(\d+))?$/;
export const backupOrder = names => names.filter(n => BACKUP.test(n)).map(n => { const m = BACKUP.exec(n); return { n, k: m[1] + m[2], i: +(m[3] || 1) }; })
  .sort((a, b) => (a.k < b.k ? 1 : a.k > b.k ? -1 : b.i - a.i)).map(x => x.n);
export function bakeHash(dir) {
  const m = JSON.parse(readFileSync(path.join(dir, MANIFEST), 'utf8')); const h = createHash('sha1');
  h.update(JSON.stringify({ ...m, made: undefined }));
  for (const rel of [...new Set(manifestFiles(m).map(f => f.rel))].sort()) { const p = path.join(dir, rel); h.update(rel); h.update(existsSync(p) ? readFileSync(p) : 'missing'); }
  return h.digest('hex');
}
// -> { installed, backup, removed[], unchanged }
export function installGloves({ assets, from, now = new Date(), keep = 2, log = () => {} }) {
  const A = path.resolve(assets), src = path.resolve(from), dst = path.join(A, FOLDER), nw = path.join(A, FOLDER + '.new');
  if (!existsSync(A) || !statSync(A).isDirectory()) throw Error('no user-assets folder at ' + A);
  const v = validateManifest(src); if (!v.ok) throw Error('the baked folder does not pass the check:\n  ' + v.errors.join('\n  '));
  if (src === dst) throw Error('already installed: ' + dst);
  if (src !== nw && existsSync(dst) && existsSync(path.join(dst, MANIFEST))) {
    let same = false; try { same = bakeHash(dst) === bakeHash(src); } catch {}
    if (same) { log(`user-assets/${FOLDER} already holds this bake: nothing changed`); return { installed: dst, backup: null, removed: [], unchanged: true }; }
  }
  if (src !== nw) {
    if (existsSync(nw)) throw Error(nw + ' is left from an earlier run: remove it, or install it with --out ' + nw);
    for (const rel of [MANIFEST, ...new Set(manifestFiles(v.manifest).map(f => f.rel))]) {
      const t = path.join(nw, rel); mkdirSync(path.dirname(t), { recursive: true }); copyFileSync(path.join(src, rel), t, fsConst.COPYFILE_EXCL);
    }
    const v2 = validateManifest(nw); if (!v2.ok) { rmSync(nw, { recursive: true, force: true }); throw Error('copy check failed: ' + v2.errors.join('; ')); }
  } else rmSync(path.join(nw, STAGE_MARK), { force: true });
  let backup = null;
  if (existsSync(dst)) {
    let b = path.join(A, `${FOLDER}.bak-` + stamp(now)); for (let i = 2; existsSync(b); i++) b = path.join(A, `${FOLDER}.bak-${stamp(now)}-${i}`);
    renameSync(dst, b); backup = b; log('backed up the old gloves → ' + b);
  }
  try { renameSync(nw, dst); } catch (e) { if (backup) renameSync(backup, dst); throw e; }
  const removed = [];
  for (const n of backupOrder(readdirSync(A)).slice(keep)) { rmSync(path.join(A, n), { recursive: true, force: true }); removed.push(path.join(A, n)); log('removed old backup ' + n); }
  return { installed: dst, backup, removed, unchanged: false };
}
