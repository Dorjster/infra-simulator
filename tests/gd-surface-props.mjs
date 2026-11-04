// Global Defensive · surface properties and wallbangs like CS2 (dist/gd-surface-props.js, arena-maps.js bulletPath,
// v53 stage 5):
//  · the table: every CS2 surface property the game uses, field by field (game material, penetration distance and
//    damage modifiers, impact effect, decal group, bullet-impact sound, elasticity, friction) against the user's own
//    install (tools/cs2-surfaceprops.mjs reads scripts/surfaceproperties_*.txt and surfaceproperties.vsurf_c) — when it
//    is on this computer; every gun's penetration against weapons.vdata's m_flPenetration (same);
//  · the material classes (the importer's PENS, the built-in maps' materials) → CS2 surface properties; doors and
//    breakables by their model's own (Nuke / Overpass / Cache doors metal, Inferno's wood — the models' physics);
//  · the wallbang TABLE: damage left per gun per material through 4, 8, 16 and 32 Hammer units, from CS2's rule
//    (penLoss: 16 % + 3.75 / pen · 3 / mod + T² / 24 / mod; < 1 left stops), and bulletPath through a real box giving
//    exactly that; hand-worked cases; the rule's limits (90-unit solids, 4 solids, the 3000-unit range, a pen-0 gun,
//    metal barrels / blockbullets, glass and grates' soft 5 % loss, hollow wood ×3);
//  · impact sounds per surface (gd-sounds.js impactFamily) from each property's bulletimpact event.
//   node tests/gd-surface-props.mjs [--table]   (--table prints the whole table)
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'; import { execFileSync } from 'node:child_process'; import os from 'node:os'; import path from 'node:path';
let n = 0, fails = 0; const ok = (c, m) => { n++; if (!c) { fails++; console.error('FAIL:', m); } else if (process.env.V) console.log('  ok', m); };
const SP = await import('../dist/gd-surface-props.js');
const { CS2_SURFACES, MAT_SURFACE, PEN, penLoss, penThrough, penMod, surfaceName, modelSurface } = SP;
const { bulletPath } = await import('../dist/arena-maps.js');
const { WEAPONS } = await import('../dist/weapons-data.js');
const { impactFamily } = await import('../dist/gd-sounds.js');
const HUg = 2.54 / 16.5, close = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

// ── CS2's rule, worked by hand ──
// AK-47 (36 damage, m_flPenetration 2) through 8 HU of concrete (dist .5): 36·.16 + 3/2·1.25·3/.5 + 8²/24/.5
ok(close(penLoss(36, 2, 'concrete', 8), 5.76 + 11.25 + 64 / 24 * 2), 'AK through 8 HU concrete loses 5.76 + 11.25 + 5.33 = ' + penLoss(36, 2, 'concrete', 8).toFixed(3));
// AWP (115, 2.5) through 16 HU of wood (Wood, both sides wood: mod 3): 18.4 + 1.5·1 + 256/24/3
ok(close(penLoss(115, 2.5, 'wood', 16), 18.4 + 1.5 + 256 / 72), 'AWP through 16 HU wood (hollow ×3) loses ' + penLoss(115, 2.5, 'wood', 16).toFixed(3));
// Glass entry: mod 3, 5 % (CS:GO: CHAR_TEX_GLASS)
ok(close(penLoss(30, 1, 'glass', 1), 1.5 + 3.75 + 1 / 72), 'a Glock through 1 HU of glass: 5 % + 3.75 + 1/72');
ok(penMod('metal') === .4 && penMod('sand') === .3 && penMod('crate') === 3 && penMod('glass') === 3 && close(penMod('concrete', 'wood'), (.5 + .9) / 2), 'modifiers: metal .4, sand .3, a crate ×3 (wood both sides), glass 3, mixed solids averaged');
ok(penLoss(1000, 2.5, 'wood', 91) === Infinity && penLoss(1000, 2.5, 'wood', 89) < Infinity, 'a solid over 90 HU stops every bullet (TraceToExit\'s MAX_PENETRATION_DISTANCE)');
ok(penLoss(500, 0, 'glass', 1) === Infinity, 'a gun of penetration 0 (the Zeus) stops at the first solid');
ok(penLoss(115, 2.5, 'metal_barrel', 1) === Infinity && penLoss(115, 2.5, 'blockbullets', 1) === Infinity, 'metal barrels and blockbullets (dist .01: under .1) stop every bullet');
ok(penLoss(115, 2.5, 'metal_barrel', 1, 'Wood') === Infinity && penLoss(115, 2.5, 'Wood', 1, 'metal_barrel') < Infinity, 'entered as a metal barrel it stops even when left as wood (CS:GO FireBullet: the entry surface\'s own modifier < .1); entered as wood it goes on');
ok(penThrough(115, 2.5, [['wood', 2], ['wood', 2], ['wood', 2], ['wood', 2]]) > 0 && penThrough(115, 2.5, [['wood', 2], ['wood', 2], ['wood', 2], ['wood', 2], ['wood', 2]]) === 0, 'at most 4 solids (nPenetrationCount 4)');
ok(penThrough(115, 2.5, [['wood', 2]], [3001]) === 0 && penThrough(115, 2.5, [['wood', 2]], [2999]) > 0, 'no wallbang past 3000 units of travel (flPenetrationDistance)');

// ── the table: guns × materials × thickness, rule vs bulletPath through a box ──
const GUNS = ['pistol', 'usps', 'p250', 'deagle', 'mp9', 'ump45', 'p90', 'shotgun', 'ak', 'm4', 'm4s', 'galil', 'famas', 'aug', 'sg553', 'ssg08', 'sniper', 'lmg', 'negev'];
const MATS = ['concrete', 'brick', 'stone', 'plaster', 'wood', 'crate', 'door', 'metal', 'sand', 'glass', 'adobe', 'roof'], THICK = [4, 8, 16, 32];
const rows = []; let agree = 0, cases = 0;
for (const id of GUNS) { const w = WEAPONS.find(x => x.id === id); if (!w) { ok(false, 'gun ' + id); continue; }
  const row = [id.padEnd(8), String(w.pen).padStart(4), String(w.dmg).padStart(4)];
  for (const m of MATS) for (const th of THICK) { const left = penThrough(w.dmg, w.pen, [[m, th]]), g = th * HUg;
    const P = bulletPath([{ minX: 10, maxX: 10 + g, minZ: -20, maxZ: 20, y0: 0, y1: 24, mat: m }], 0, 8, 0, 1, 0, 0, 60, w.pen, null, false, w.dmg), f = P.factor(40);
    cases++; if (close(f * w.dmg, left, 1e-6)) agree++; else if (agree + 5 > cases) console.error('  bulletPath', id, m, th, (f * w.dmg).toFixed(3), 'rule', left.toFixed(3));
    if (th === 8 || th === 16) row.push((m + th).padEnd(10) + left.toFixed(1).padStart(6)); }
  rows.push(row.join(' ')); }
ok(agree === cases, `bulletPath = CS2's rule for every gun, material and thickness (${agree}/${cases})`);
const left = (id, m, th) => { const w = WEAPONS.find(x => x.id === id); return penThrough(w.dmg, w.pen, [[m, th]]); };
ok(left('ak', 'wood', 16) > 0 && left('pistol', 'wood', 8) > 0 && left('pistol', 'concrete', 8) === 0, 'thin wood: every gun; 8 HU of concrete: not a Glock (' + left('pistol', 'concrete', 8).toFixed(1) + ')');
ok(left('ak', 'concrete', 8) > 0 && left('ak', 'concrete', 16) === 0 && left('sniper', 'concrete', 32) > 0, 'concrete: 8 HU an AK (' + left('ak', 'concrete', 8).toFixed(1) + ' left), 16 HU not; 32 HU only the AWP (' + left('sniper', 'concrete', 32).toFixed(1) + ')');
ok(left('sniper', 'metal', 16) > left('ak', 'metal', 16) && left('ak', 'metal', 16) >= 0, 'metal costs more than its thickness suggests (mod .4): AWP keeps more than the AK');
ok(WEAPONS.every(w => w.pen === (w.kind === 'sniper' ? 2.5 : w.kind === 'rifle' || w.kind === 'lmg' || w.id === 'deagle' ? 2 : 1) || w.id === 'ssg08' && w.pen === 2.5), "every gun's penetration: CS2's m_flPenetration (1 pistols / SMGs / shotguns, 2 rifles / LMGs / Deagle, 2.5 snipers)");

// ── classes and models → CS2 surface properties ──
ok(surfaceName('concrete') === 'concrete' && surfaceName('crate') === 'Wood_Crate' && surfaceName('stone') === 'rock' && surfaceName('adobe') === 'stucco' && surfaceName('roof') === 'tile' && surfaceName('metal-red') === 'metal' && surfaceName('door') === 'Wood_Panel' && surfaceName('wood_crate') === 'Wood_Crate' && surfaceName('??') === 'default', 'the game\'s classes → CS2 surface properties');
ok(modelSurface('models/props/de_nuke/hr_nuke/metal_door_001/metal_door_001_br.vmdl') === 'metal' && modelSurface('models/breakable_props/break_wooden_door_01/break_wooden_door_01.vmdl') === 'Wood' && modelSurface('models/props/de_mirage/wall_hole_cover_sheetmetal.vmdl') === 'metal_sheetmetal' && modelSurface('models/props/de_mirage/shutter_window_l_breakable.vmdl') === 'Wood_Furniture', 'doors and breakables: their model\'s own surface property');
ok(['concrete', 'wood', 'crate', 'metal', 'plaster', 'brick', 'sand', 'stone', 'glass'].every(k => MAT_SURFACE[k] && CS2_SURFACES[MAT_SURFACE[k]]), 'every class the CS2 map importer writes (PENS) has its CS2 surface property');
ok(impactFamily('metal') === 'metal' && impactFamily('metal_sheetmetal') === 'metal' && impactFamily('Wood_Furniture') === 'wood' && impactFamily('plaster') === 'concrete' && impactFamily('roof') === 'tile' && impactFamily('sand') === 'sand', 'impact sounds per surface: CS2\'s bulletimpact events (plaster: Concrete.BulletImpact, tiles: Tile.BulletImpact)');

// ── the CS2 maps' doors (when converted on this computer) ──
const MAPS = new URL('../user-maps/', import.meta.url); let mapsSeen = 0;
if (existsSync(new URL('nuke.bsp', MAPS))) { const { ARENA_MAPS, useMapFile, mapBoxes } = await import('../dist/arena-maps.js');
  for (const [id, want] of [['nuke', 'metal'], ['inferno', 'Wood'], ['overpass', 'metal'], ['cache', 'metal']]) { if (!existsSync(new URL(id + '.bsp', MAPS))) continue; mapsSeen++;
    const b = readFileSync(new URL(id + '.bsp', MAPS)); useMapFile(id, b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); const M = ARENA_MAPS[id], doors = (M.movers || []).filter(m => m.kind === 'rotdoor');
    const bx = mapBoxes(M, 0, 0).filter(x => x.mover != null && M.movers[x.mover].kind === 'rotdoor');
    const { bulletPath } = await import('../dist/arena-maps.js'), d = bx.find(x => !x.off) || bx[0], my = (d.y0 + d.y1) / 2, mz = (d.minZ + d.maxZ) / 2, mx = (d.minX + d.maxX) / 2, alongX = d.maxX - d.minX < d.maxZ - d.minZ;
    const P = alongX ? bulletPath([d], d.minX - 5, my, mz, 1, 0, 0, 20, 2.5, null, false, 115) : bulletPath([d], mx, my, d.minZ - 5, 0, 0, 1, 20, 2.5, null, false, 115), m0 = P.crossed[0]?.mat || P.stopBox?.surf || P.stopBox?.mat;
    ok(doors.length > 0 && doors.every(m => m.surf === want) && bx.every(x => x.surf === want && x.mat === 'door') && m0 === want, `${id}: its ${doors.length} doors are ${want} (their CS2 model's physics) for bullets and impacts, still doors ('door') for everything else · a shot meets ${m0}`); } }

// ── against the user's install ──
let install = 'no CS2 install on this computer: the shipped table only';
// (v53 MAP fix) the exact surfaces the importer now keeps (import-cs2-map.mjs exactSurface): a grate or chain-link
// fence is CS2's game material G — an AK keeps 32.3 of 36 through 2 HU of metalgrate (5 % + its constants), not metal's 15.8
ok(Math.abs(SP.penThrough(36, 2, [['metalgrate', 2]]) - 32.3) < .1 && Math.abs(SP.penThrough(36, 2, [['metal', 2]]) - 15.8) < .1, `AK through 2 HU: metalgrate ${SP.penThrough(36, 2, [['metalgrate', 2]]).toFixed(1)}, metal ${SP.penThrough(36, 2, [['metal', 2]]).toFixed(1)}`);
ok(SP.surfaceOf('chainlink').gm === 'G' && SP.penThrough(36, 2, [['metal_barrel', 2]]) === 0 && SP.surfaceOf('metalrailing').effect === 'impact_metal' && SP.surfaceName('vrf_unknown_key_2838185980') === 'default' && SP.SURFACE_HASH[2838185980] === 'metalrailing', 'chainlink G, metal barrels stop bullets, metalrailing sparks; an unknown hash resolves through SURFACE_HASH');
ok(SP.surfaceOf('plastic').gm === 'L' && SP.surfaceOf('carpet').gm === '7' && SP.surfaceOf('rubber').gm === '4', 'plastic, carpet and rubber keep their own game materials (not Wood_Crate\'s W, which triples hollow wood)');
const CS2 = path.join(os.homedir(), 'CS2-extract');
if (existsSync(path.join(CS2, 'game', 'game', 'csgo', 'pak01_dir.vpk')) && existsSync(path.join(CS2, 'tools', 's2v', 'Source2Viewer-CLI'))) {
  const { readInstall, kv3 } = await import('../tools/cs2-surfaceprops.mjs'); const T = readInstall(CS2); let fields = 0;
  for (const [name, r] of Object.entries(CS2_SURFACES)) { const f = T?.[name]; if (!f) { ok(false, name + ' in the install'); continue; }
    for (const [k, fk] of [['gm', 'gm'], ['dist', 'dist'], ['dmg', 'dmg'], ['effect', 'effect'], ['decal', 'decal'], ['sound', 'sound'], ['e', 'elasticity'], ['f', 'friction']]) { fields++; ok(r[k] === f[fk], `${name}.${k}: ${r[k]} = CS2 ${f[fk]}`); } }
  // (v53 MAP fix) the surface hashes the importer resolves (vrf_unknown_key_<hash>): each vsurf m_nameHash's surfacePropertyName
  for (const [h, name] of Object.entries(SP.SURFACE_HASH)) ok(String(T?.[name]?.hash) === h, `vsurf m_nameHash ${h} = ${name} (${T?.[name]?.hash})`);
  // weapons.vdata m_flPenetration per gun
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'gd-surf-')); try {
    execFileSync(path.join(CS2, 'tools', 's2v', 'Source2Viewer-CLI'), ['-i', path.join(CS2, 'game', 'game', 'csgo', 'pak01_dir.vpk'), '-f', 'scripts/weapons.vdata_c', '-o', tmp, '-d'], { stdio: 'ignore' });
    const V = kv3(readFileSync(path.join(tmp, 'scripts', 'weapons.vdata'), 'utf8')), CLASS = { pistol: 'glock', usps: 'usp_silencer', p250: 'p250', fiveseven: 'fiveseven', cz75: 'cz75a', tec9: 'tec9', deagle: 'deagle', mac10: 'mac10', mp9: 'mp9', mp7: 'mp7', smg: 'mp5sd', bizon: 'bizon', ump45: 'ump45', p90: 'p90', shotgun: 'nova', xm1014: 'xm1014', galil: 'galilar', famas: 'famas', ak: 'ak47', m4: 'm4a1', m4s: 'm4a1_silencer', sg553: 'sg556', aug: 'aug', ssg08: 'ssg08', sniper: 'awp', lmg: 'm249', negev: 'negev' };
    const penOf = c => { for (let k = 'weapon_' + c, g = 0; k && g < 6; g++) { const e = V[k]; if (!e) return undefined; if (e.m_flPenetration !== undefined) return e.m_flPenetration; k = e._base || e.m_sBase || null; } return undefined; };
    let guns = 0; for (const w of WEAPONS) { const c = CLASS[w.id]; if (!c) continue; const p = penOf(c); if (p === undefined) continue; guns++; ok(w.pen === p, `${w.id}: penetration ${w.pen} = weapons.vdata weapon_${c} m_flPenetration ${p}`); }
    install = `${Object.keys(CS2_SURFACES).length} surface properties (${fields} fields) and ${guns} guns' penetration checked against the user's CS2 install`;
  } finally { rmSync(tmp, { recursive: true, force: true }); } }

if (process.argv.includes('--table')) { console.log('gun       pen  dmg  damage left (HU thick)'); for (const r of rows) console.log(r); }
if (fails) { console.error(`FAIL: gd-surface-props · ${fails} of ${n}`); process.exit(1); }
console.log(`PASS: gd-surface-props · ${n} checks (CS2's wallbang rule by hand and its limits; bulletPath = the rule for ${cases} gun × material × thickness cases; classes, doors${mapsSeen ? ' on ' + mapsSeen + ' converted maps' : ''} and impact sounds by CS2 surface; ${install})`);
