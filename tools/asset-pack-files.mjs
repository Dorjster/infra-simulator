// Which files of user-assets/ go into the manifest hash, the desktop app's copy and the asset pack
// (tools/import-cs2-models.mjs) — one rule, shared with the tests (tests/gd-knives.mjs checks the new knives are in it).
//   · skins/ (and skins.new / skins.bak-*) belong to tools/import-cs2-skins.mjs, gloves/ (and gloves.new / .bak-*) to
//     tools/import-cs2-gloves.mjs: hundreds of MB the room serves on its own, packed only with --with-skins / --with-gloves.
//   · (v53 KNIVES final) every back-up an importer keeps under the back-up rule — a name with '.bak-' anywhere in the
//     path: holds.bak-<stamp>/, fp.bak-<stamp>/, icons/killfeed.bak-<stamp>/, manifest.bak-<stamp>.json — stays on this
//     computer: it is the user's own earlier copy, never shipped to other computers.
import { readdirSync, existsSync } from 'node:fs'; import path from 'node:path';
export const SKINS = /^skins($|[.])/, GLOVES = /^gloves($|[.])/, BAK = /\.bak-/;
function walk(dir) { const res = []; for (const e of readdirSync(dir, { withFileTypes: true })) { if (BAK.test(e.name)) continue; const p = path.join(dir, e.name); if (e.isDirectory()) res.push(...walk(p)); else res.push(p); } return res; }
export const packFiles = dir => existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap(e => SKINS.test(e.name) || GLOVES.test(e.name) || BAK.test(e.name) ? [] : e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]) : [];
