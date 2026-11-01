// The CS2 finishes manifest (user-assets/skins/skins.json) and the install step of tools/import-cs2-skins.mjs:
// reading image sizes from file headers, checking a manifest against its folder, picking a built-in fallback finish
// for a CS2 finish, and installing a baked folder as user-assets/skins/ under the back-up rule (never overwrite:
// an existing skins/ is renamed to skins.bak-YYYYMMDD-HHMM, at most the 2 newest backups are kept, and nothing
// else under user-assets is touched). Pure logic, no Valve data; the node tests import it without a CS2 install.
import { readFileSync, existsSync, statSync, readdirSync, renameSync, rmSync, mkdirSync, copyFileSync, openSync, readSync, closeSync, writeFileSync, realpathSync, constants as fsConst } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const MANIFEST = 'skins.json';
export const ICON_W = 192, ICON_H = 144;
export const KNIFE_MODELS = ['karambit', 'butterfly', 'm9', 'stiletto'];

// ---- image sizes from the first bytes of a file (PNG, JPEG, WebP), or null when it is none of them / truncated
export function imageSize(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf.readUInt32BE(0) === 0x89504e47 && buf.toString('latin1', 12, 16) === 'IHDR') return { type: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { type: 'jpeg', h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
    return null;
  }
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const c = buf.toString('latin1', 12, 16);
    if (c === 'VP8 ' && buf.length >= 30) return { type: 'webp', w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (c === 'VP8L' && buf.length >= 25) { const b = buf.readUInt32LE(21); return { type: 'webp', w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
    if (c === 'VP8X' && buf.length >= 30) return { type: 'webp', w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  }
  return null;
}

const head = (file, n = 65536) => { const fd = openSync(file, 'r'); try { const b = Buffer.alloc(n); const got = readSync(fd, b, 0, n, 0); return b.subarray(0, got); } finally { closeSync(fd); } };

// Every file a manifest names, with what it must be: [{ rel, role, w?, h?, square? }]
export function manifestFiles(m) {
  const out = [], res = m.res | 0;
  if (m.shared?.grunge) out.push({ rel: m.shared.grunge, role: 'grunge' });
  for (const [k, b] of Object.entries(m.base || {})) for (const [t, rel] of Object.entries(b || {})) if (rel) out.push({ rel, role: `base ${k} ${t}`, w: res, h: res });
  for (const [gid, g] of Object.entries(m.weapons || {})) for (const [kit, f] of Object.entries(g.finishes || {})) {
    out.push({ rel: f.paint, role: `${gid}/${kit} paint`, w: res, h: res }, { rel: f.mrw, role: `${gid}/${kit} mrw`, w: res, h: res });
    if (f.icon) out.push({ rel: f.icon, role: `${gid}/${kit} icon`, w: ICON_W, h: ICON_H });
  }
  for (const [fam, f] of Object.entries(m.knives || {})) {
    for (const [kn, e] of Object.entries(f.models || {})) {
      out.push({ rel: e.paint, role: `${fam}/${kn} paint`, w: res, h: res }, { rel: e.mrw, role: `${fam}/${kn} mrw`, w: res, h: res });
      if (e.paint2k) out.push({ rel: e.paint2k, role: `${fam}/${kn} paint2k`, w: res * 2, h: res * 2 });
      if (e.mrw2k) out.push({ rel: e.mrw2k, role: `${fam}/${kn} mrw2k`, w: res * 2, h: res * 2 });
    }
    for (const [kn, rel] of Object.entries(f.icon || {})) if (rel) out.push({ rel, role: `${fam}/${kn} icon`, w: ICON_W, h: ICON_H });
  }
  return out;
}

const ID = /^[a-z0-9_-]+$/i;   // (CS2 kit ids may hold "-": cu_p90-asiimov)
// Checks a manifest against its folder: schema, every listed file inside the folder, present, decodable and of the
// expected size. -> { ok, errors[], files, bytes, counts }
export function validateManifest(dir, { checkFiles = true } = {}) {
  const errors = [], err = s => { if (errors.length < 50) errors.push(s); };
  let m;
  try { m = JSON.parse(readFileSync(path.join(dir, MANIFEST), 'utf8')); } catch (e) { return { ok: false, errors: ['cannot read ' + MANIFEST + ': ' + e.message], files: 0, bytes: 0 }; }
  if (m.version !== 1) err('version must be 1');
  if (!(m.res >= 64 && m.res <= 4096 && (m.res & (m.res - 1)) === 0)) err('res must be a power of two');
  for (const k of ['weapons', 'knives', 'base', 'shared']) if (!m[k] || typeof m[k] !== 'object') err(k + ' missing');
  for (const [gid, g] of Object.entries(m.weapons || {})) {
    if (!ID.test(gid)) err('bad weapon id ' + gid);
    if (typeof g.model !== 'string' || g.uv !== 0 || !(g.len > 0)) err(gid + ': model / uv / len');
    for (const [kit, f] of Object.entries(g.finishes || {})) {
      if (!ID.test(kit)) err('bad kit id ' + kit);
      if (typeof f.name !== 'string' || !Number.isInteger(f.style) || !Array.isArray(f.wear) || f.wear.length !== 2 || !(f.wear[0] <= f.wear[1]) || typeof f.legacy !== 'boolean' || typeof f.fbId !== 'string' || typeof f.pearl !== 'number')
        err(`${gid}/${kit}: name / style / wear / legacy / pearl / fbId`);
    }
  }
  for (const [fam, f] of Object.entries(m.knives || {})) {
    if (!ID.test(fam)) err('bad family id ' + fam);
    if (typeof f.name !== 'string' || !Number.isInteger(f.style) || !Array.isArray(f.wear) || typeof f.fbId !== 'string' || typeof f.pearl !== 'number' || !f.models || !Object.keys(f.models).length) err(fam + ': name / style / wear / pearl / fbId / models');
    for (const kn of Object.keys(f.models || {})) if (!KNIFE_MODELS.includes(kn)) err(`${fam}: unknown knife ${kn}`);
  }
  const files = manifestFiles(m); let bytes = 0; const root = path.resolve(dir) + path.sep;
  for (const f of files) {
    if (typeof f.rel !== 'string' || !f.rel || path.isAbsolute(f.rel) || f.rel.includes('\\') || f.rel.split('/').includes('..')) { err(`${f.role}: bad path ${f.rel}`); continue; }
    const p = path.resolve(dir, f.rel);
    if (!p.startsWith(root)) { err(`${f.role}: outside the folder`); continue; }
    if (!checkFiles) continue;
    if (!existsSync(p)) { err(`${f.role}: missing ${f.rel}`); continue; }
    bytes += statSync(p).size;
    const s = imageSize(head(p));
    if (!s) { err(`${f.role}: not a PNG / JPEG / WebP image: ${f.rel}`); continue; }
    if (f.w && (s.w !== f.w || s.h !== f.h)) err(`${f.role}: ${s.w}×${s.h}, expected ${f.w}×${f.h}`);
    if (/mrw/.test(f.role) && s.type !== 'png') err(`${f.role}: must be PNG (data, no JPEG artefacts)`);
  }
  const counts = { weapons: Object.keys(m.weapons || {}).length, gunFinishes: Object.values(m.weapons || {}).reduce((n, g) => n + Object.keys(g.finishes || {}).length, 0),
    knifeFamilies: Object.keys(m.knives || {}).length, knifeBakes: Object.values(m.knives || {}).reduce((n, f) => n + Object.keys(f.models || {}).length, 0) };
  return { ok: !errors.length, errors, files: files.length, bytes, counts, manifest: m };
}

// ---- built-in fallback (fbId): the built-in finish drawn where a CS2 finish's textures are missing (host without
// assets, not loaded yet). Rule: the paint style picks the family (anodized, hydro/spray, paint), the bake's accent hue
// (its most colourful 5%) and the brightness of its body colour pick the member. Knife families map by the old ids.
const hex = h => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = c => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
function hsv([r, g, b]) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const h = !d ? 0 : mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4); return [(h + 360) % 360, mx ? d / mx : 0, mx]; }
export function hueName(c) { const [h, s, v] = hsv(c); if (s < 0.25 || v < 0.12) return 'grey'; return h < 20 || h >= 335 ? 'red' : h < 45 ? 'orange' : h < 70 ? 'yellow' : h < 170 ? 'green' : h < 200 ? 'cyan' : h < 260 ? 'blue' : h < 300 ? 'purple' : 'magenta'; }
const RULES = {
  anod: { red: 'doppler', orange: 'tiger', yellow: 'gold', green: 'emerald', cyan: 'sapphire', blue: 'sapphire', purple: 'sapphire', magenta: 'marble', grey: 'casehardened' },
  hydro: { red: 'web', orange: 'camo', yellow: 'camo', green: 'forest', cyan: 'camo', blue: 'camo', purple: 'camo', magenta: 'camo', grey: 'camo' },
  paint: { red: 'redline', orange: 'asiimov', yellow: 'gold', green: 'forest', cyan: 'hex', blue: 'sapphire', purple: 'hex', magenta: 'hex', grey: 'camo' },
};
const GROUP = { 1: 'paint', 2: 'hydro', 3: 'hydro', 4: 'anod', 5: 'anod', 7: 'paint', 9: 'paint' };
// builtins: { id: {…} } (dist/skins.js FINISHES); pal: the bake's three colours, dark to light; accent: '#rrggbb'
export function fbIdFor({ style, pal, accent, family }, builtins, familyFb = {}) {
  const ok = id => id && id !== 'none' && builtins[id];
  if (family && ok(familyFb[family])) return familyFb[family];
  if (style === 6 && ok('fade')) return 'fade';
  if (style === 8 && ok('casehardened')) return 'casehardened';
  const g = GROUP[style] || 'paint', body = pal?.length ? lum(hex(pal[1] || pal[0])) : 0.5, hue = accent ? hueName(hex(accent)) : pal?.length ? hueName(hex(pal[2] || pal[0])) : 'grey';
  let id = RULES[g][hue];
  if (g === 'paint' && hue === 'red' && body > 0.45) id = 'doppler';           // an all-red paint (Candy Apple): red metal, not black with red lines
  const light = pal?.length ? hex(pal[pal.length - 1]) : [128, 128, 128], whiteish = hsv(light)[1] < 0.25 && lum(light) > 0.5;   // the lightest third is white / pale grey
  if (g === 'paint' && hue === 'orange') id = body < 0.3 ? 'tiger' : whiteish ? 'asiimov' : 'gold';   // orange on dark: tiger; on white: Asiimov; on gold: gold
  if (g === 'paint' && hue === 'grey' && whiteish && body > 0.5) id = 'asiimov';   // mostly white (Printstream): the white built-in
  if (ok(id)) return id;
  return Object.keys(builtins).find(ok) || 'none';
}

// ---- the staging folder (--out): the tool bakes into it and, after a full run, deletes every file in it that the
// manifest does not list. So it must be a folder the tool owns: never user-assets itself, an ancestor of it, or anything
// inside it but skins.new (compared by real path, so a symlink or another spelling of the same folder is caught), and
// an existing non-empty folder only when it carries the tool's marker or holds nothing but what the tool makes.
export const STAGE_MARK = '.cs2-skins-stage';
const STAGE_NAMES = /^(skins\.json(\.tmp)?|base|icons|shared|[a-z0-9_]+)$/;   // (what a bake writes at the top: model folders are game ids)
function realish(p) {   // the real path of p, also when p (or its tail) does not exist yet
  const abs = path.resolve(p); let head = abs, tail = [];
  while (!existsSync(head)) { const up = path.dirname(head); if (up === head) break; tail.unshift(path.basename(head)); head = up; }
  try { head = realpathSync(head); } catch {}
  return path.join(head, ...tail);
}
const inside = (child, parent) => child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
// -> null when out may be used as the staging folder, else the reason it may not
export function stageProblem({ out, assets, knownModels = [] }) {
  const O = realish(out), A = realish(assets);
  if (inside(A, O)) return O === A ? `--out is the user-assets folder itself (${A})` : `--out ${O} holds the user-assets folder (${A})`;
  if (inside(O, A) && O !== path.join(A, 'skins.new')) return `--out ${O} is inside user-assets: only user-assets/skins.new may be used there`;
  if (!existsSync(O)) return null;
  if (!statSync(O).isDirectory()) return `--out ${O} is not a folder`;
  const names = readdirSync(O).filter(n => n !== '.DS_Store');
  if (!names.length || names.includes(STAGE_MARK)) return null;
  const known = new Set(knownModels), foreign = names.filter(n => !(STAGE_NAMES.test(n) && (known.size === 0 || known.has(n) || /^(skins\.json(\.tmp)?|base|icons|shared)$/.test(n))));
  return foreign.length ? `--out ${O} is a folder this tool did not make (it holds ${foreign.slice(0, 4).join(', ')}${foreign.length > 4 ? ', …' : ''}): use a new or empty folder` : null;
}
// marks out as the tool's staging folder (after stageProblem() said yes)
export function claimStage(out) { mkdirSync(out, { recursive: true }); const f = path.join(out, STAGE_MARK); if (!existsSync(f)) writeFileSync(f, 'Staging folder of tools/import-cs2-skins.mjs: a full run deletes files here that its skins.json does not list.\n'); }

// ---- install under the back-up rule
const stamp = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
export const BACKUP = /^skins\.bak-(\d{8})-(\d{4})(?:-(\d+))?$/;
// newest first: by stamp, then by the same-minute suffix as a number (…-0906-10 is newer than …-0906-2)
export const backupOrder = names => names.filter(n => BACKUP.test(n)).map(n => { const m = BACKUP.exec(n); return { n, k: m[1] + m[2], i: +(m[3] || 1) }; })
  .sort((a, b) => (a.k < b.k ? 1 : a.k > b.k ? -1 : b.i - a.i)).map(x => x.n);
// a fingerprint of a baked folder: its manifest without the time it was made, and every file it lists
export function bakeHash(dir) {
  const m = JSON.parse(readFileSync(path.join(dir, MANIFEST), 'utf8')); const h = createHash('sha1');
  h.update(JSON.stringify({ ...m, made: undefined }));
  for (const rel of [...new Set(manifestFiles(m).map(f => f.rel))].sort()) { const p = path.join(dir, rel); h.update(rel); h.update(existsSync(p) ? readFileSync(p) : 'missing'); }
  return h.digest('hex');
}
// assets: the user-assets folder; from: a baked folder (holding skins.json); only the files its manifest lists are
// copied. When the installed skins/ already holds exactly this bake, nothing changes (no backup is used up).
// -> { installed, backup, removed[], unchanged }
export function installSkins({ assets, from, now = new Date(), keep = 2, log = () => {} }) {
  const A = path.resolve(assets), src = path.resolve(from), dst = path.join(A, 'skins'), nw = path.join(A, 'skins.new');
  if (!existsSync(A) || !statSync(A).isDirectory()) throw Error('no user-assets folder at ' + A);
  const v = validateManifest(src); if (!v.ok) throw Error('the baked folder does not pass the check:\n  ' + v.errors.join('\n  '));
  if (src === dst) throw Error('already installed: ' + dst);
  if (src !== nw && existsSync(dst) && existsSync(path.join(dst, MANIFEST))) {
    let same = false; try { same = bakeHash(dst) === bakeHash(src); } catch {}
    if (same) { log('user-assets/skins already holds this bake: nothing changed'); return { installed: dst, backup: null, removed: [], unchanged: true }; }
  }
  if (src !== nw) {
    if (existsSync(nw)) throw Error(nw + ' is left from an earlier run: remove it, or install it with --out ' + nw);
    for (const rel of [MANIFEST, ...new Set(manifestFiles(v.manifest).map(f => f.rel))]) {   // exactly the files the manifest lists
      const t = path.join(nw, rel); mkdirSync(path.dirname(t), { recursive: true }); copyFileSync(path.join(src, rel), t, fsConst.COPYFILE_EXCL);
    }
    const v2 = validateManifest(nw); if (!v2.ok) { rmSync(nw, { recursive: true, force: true }); throw Error('copy check failed: ' + v2.errors.join('; ')); }
  } else rmSync(path.join(nw, STAGE_MARK), { force: true });   // (baked straight into skins.new: the marker stays behind)
  let backup = null;
  if (existsSync(dst)) {
    let b = path.join(A, 'skins.bak-' + stamp(now)); for (let i = 2; existsSync(b); i++) b = path.join(A, `skins.bak-${stamp(now)}-${i}`);
    renameSync(dst, b); backup = b; log('backed up the old finishes → ' + b);
  }
  try { renameSync(nw, dst); } catch (e) { if (backup) renameSync(backup, dst); throw e; }
  const removed = [];
  for (const n of backupOrder(readdirSync(A)).slice(keep)) { rmSync(path.join(A, n), { recursive: true, force: true }); removed.push(path.join(A, n)); log('removed old backup ' + n); }
  return { installed: dst, backup, removed, unchanged: false };
}
