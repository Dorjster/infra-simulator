// Scopes under CS2 finishes (v52.0.5): CS2 composites a legacy finish on the old body_legacy mesh, whose scope lenses are
// a material CS2 never paints (shared_scope*), and the SSG 08's scope is a second material CS2 leaves black under artwork
// styles (anodized multicolour, custom, gunsmith: every such SSG 08 econ icon shows a plain black scope; hydrographic and
// patina finishes paint it). The bake (tools/cs2-skins/bake.py through legacy_lookup.py's 'plain' bits, lookup v4) leaves
// those texels at coverage 0 (the mrw alpha), so the game draws the gun's own base there: dark glass, a black scope.
// Reads this computer's installed bakes (user-assets/skins, or GD_SKINS_DIR); skipped with a message where there are none
// (CI: the finishes are Valve's and stay local). The sample points are texel positions in CS2's HD UV0 layout (1024²),
// picked well inside each region of the v4 lookup — numbers only, no Valve data.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs'; import { inflateSync } from 'node:zlib';
import path from 'node:path'; import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = process.env.GD_SKINS_DIR ? path.resolve(process.env.GD_SKINS_DIR) : path.join(root, 'user-assets', 'skins');
if (!existsSync(path.join(DIR, 'skins.json'))) { console.log('SKIP: gd-skin-scopes · no installed CS2 finishes at ' + DIR); process.exit(0); }
const man = JSON.parse(readFileSync(path.join(DIR, 'skins.json'), 'utf8'));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// a PNG's pixels (8-bit grey / RGB / RGBA, non-interlaced: what imglib.save writes)
function readPng(file) {
  const b = readFileSync(file); assert.equal(b.readUInt32BE(0), 0x89504e47, file + ': not a PNG');
  let o = 8, w = 0, h = 0, depth = 0, type = 0; const idat = [];
  while (o < b.length) { const len = b.readUInt32BE(o), t = b.toString('latin1', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + len);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; assert.equal(d[12], 0, 'interlaced PNG'); }
    else if (t === 'IDAT') idat.push(d); else if (t === 'IEND') break; o += 12 + len; }
  assert.equal(depth, 8, file + ': 8-bit PNG expected'); const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[type]; const raw = inflateSync(Buffer.concat(idat)), st = w * ch, px = Buffer.alloc(st * h);
  for (let y = 0; y < h; y++) { const f = raw[y * (st + 1)], s = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1)), r = px.subarray(y * st, (y + 1) * st), up = y ? px.subarray((y - 1) * st, y * st) : null;
    for (let i = 0; i < st; i++) { const a = i >= ch ? r[i - ch] : 0, u = up ? up[i] : 0, c = up && i >= ch ? up[i - ch] : 0;
      const p = f === 0 ? 0 : f === 1 ? a : f === 2 ? u : f === 3 ? (a + u) >> 1 : (() => { const q = a + u - c, pa = Math.abs(q - a), pb = Math.abs(q - u), pc = Math.abs(q - c); return pa <= pb && pa <= pc ? a : pb <= pc ? u : c; })();
      r[i] = (s[i] + p) & 255; } }
  return { w, h, ch, px };
}
const cover = (img, [x, y]) => { const X = Math.floor((x + 0.5) * img.w / 1024), Y = Math.floor((y + 0.5) * img.h / 1024); return img.ch === 4 ? img.px[(Y * img.w + X) * 4 + 3] / 255 : 1; };

const ART = new Set([5, 7, 9]);   // items_game paint styles: anodized multicolour, custom, gunsmith
const P = {
  sniper: { plain: [[244, 193], [265, 198], [268, 210], [241, 214], [262, 195], [262, 203], [246, 27], [212, 77]],   // the scope lenses
            body: [[139, 655], [860, 329], [808, 54], [880, 942], [585, 924], [766, 871]] },
  ssg08:  { plain: [[518, 471], [388, 395], [527, 412], [947, 899], [58, 649], [61, 727]],                            // the scope (and its rings)
            body: [[772, 899], [454, 843], [479, 789], [200, 1010], [410, 891], [564, 617]] },
  sg553:  { plain: [[529, 185], [712, 354], [719, 359], [535, 185], [526, 189], [710, 367]],                          // the sight's lenses
            body: [[132, 735], [535, 679], [293, 513], [579, 962], [646, 912], [449, 819]] },
};
const rule = (gid, f) => !f.legacy ? null : gid === 'ssg08' ? ART.has(f.style) : true;   // true: CS2 shows the base there; false: CS2 paints it; null: not checked

let checked = 0;
for (const [gid, pts] of Object.entries(P)) {
  const w = man.weapons?.[gid]; if (!w) { console.log(`  (${gid}: no finishes installed)`); continue; }
  for (const [kit, f] of Object.entries(w.finishes)) {
    const file = path.join(DIR, f.mrw); if (!existsSync(file)) continue;
    const img = readPng(file), plain = rule(gid, f);
    for (const p of pts.body) ok(cover(img, p) > 0.9, `${gid} ${kit}: the body is painted at ${p} (coverage ${cover(img, p)})`);
    if (plain === true) for (const p of pts.plain) ok(cover(img, p) === 0, `${gid} ${kit} (${f.legacy ? 'legacy' : 'HD'}, style ${f.style}): CS2 leaves the scope plain, but the paint covers ${p} (coverage ${cover(img, p).toFixed(2)})`);
    if (plain === false) for (const p of pts.plain) ok(cover(img, p) > 0.9, `${gid} ${kit} (style ${f.style}): CS2 paints the scope, coverage ${cover(img, p).toFixed(2)} at ${p}`);
    checked++;
  }
}
ok(checked > 0, 'no scoped-gun finishes installed to check');
console.log(`gd-skin-scopes: ${n} checks on ${checked} finishes passed (${DIR})`);
