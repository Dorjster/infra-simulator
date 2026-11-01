// Counter-Strike 2 map entities in their competitive state (v52, package N). Another game mode's walls and props
// (Wingman's 2v2 doors and walls, Retakes' barriers…) are no part of a Defuse match: no brush entity of theirs is a solid
// part (any map file), and on a CS2 map file the scenery its look still draws (Nuke's silo doors on both sides of Ramp,
// its roll-up door across Outside → Secret) is listed to come out of the look (map.modeOff, cs2-render.js) — where no
// collision stands; the real doors stay doors. Then each of the eight CS2 map files (user-maps, skipped without them):
// the standard routes walkable — a bot route over the map's floors from each place to the next, and no collision box
// across the walk at chest height (the doors that open excepted) — Nuke's Ramp and Secret on both sides of the doors
// that were drawn there, its mode-only scenery listed for the look, its four real doors kept as doors.
//   node tests/gd-map-entities.mjs [map ids…]
import { readFileSync, existsSync } from 'node:fs';
import { ARENA_MAPS, useMapFile, mapBoxes } from '../dist/arena-maps.js';
import { MODE_ONLY, cs2Spawns, modeOffHit } from '../dist/bsp-map.js';
let pass = 0, fail = 0; const check = (name, ok, info = '') => { ok ? pass++ : fail++; if (!ok || process.env.VERBOSE) console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' · ' + info : '')); };
// The rules (no map files needed).
check('mode names: Wingman / Retakes / hostage walls and spawns are another mode\'s', ['[PR#]brush.blocker.2v2', 'spawnpoints.2v2', '[PR#]retake.bsite', 'wingman_wall', 'hostage_rescue_block'].every(n => MODE_ONLY.test(n)) && !['[PR#]door_01', 'spawnpoints.standard', 'longdoors', ''].some(n => MODE_ONLY.test(n)));
{ const W = [{ lo: [0, 0, 0], hi: [100, 5, 120] }];   // (a 5-unit 2v2 wall)
  check('modeOffHit: a triangle wholly in the entity\'s box goes, even touching the floor; one reaching 8+ units out stays', modeOffHit(W, [0, 2, 0, 100, 2, 0, 100, 2, 120]) && !modeOffHit(W, [0, -40, 10, 0, 40, 10, 0, 40, 100]) && !modeOffHit(W, [10, 2, 10, 90, 2, 10, 90, 2, 130])); }
check('cs2Spawns keeps a team with no keys whole',cs2Spawns([0, 64, 128].map(x => ({ origin: x + ' 0 0' }))).length === 3);
const ROUTES = {   // CS2's place names (the callouts): each route walked place to place
  nuke: [['TSpawn', 'Outside', 'Secret', 'BombsiteB'], ['Lobby', 'Ramp', 'BombsiteB'], ['TSpawn', 'Lobby', 'Hut', 'BombsiteA'], ['CTSpawn', 'Hell', 'BombsiteA'],['BombsiteA', 'Vents', 'BombsiteB'], ['CTSpawn', 'Garage', 'Secret'], ['CTSpawn', 'BombsiteA'], ['Control', 'Ramp'], ['Admin', 'Ramp']],
  inferno: [['TSpawn', 'Banana', 'BombsiteB'], ['TSpawn', 'Apartments', 'Balcony', 'BombsiteA'], ['CTSpawn', 'BombsiteB'], ['TSpawn', 'Middle', 'BombsiteA'], ['CTSpawn', 'BombsiteA']],
  overpass: [['TSpawn', 'Connector', 'BombsiteB'], ['TSpawn', 'Pipe', 'BombsiteB'], ['TSpawn', 'Water', 'BombsiteB'], ['TSpawn', 'Playground', 'BombsiteA'], ['TSpawn', 'UpperPark', 'BombsiteA'], ['BombsiteA', 'Connector', 'BombsiteB']],   // (no CTSpawn place: CT spawn is at A)
  mirage: [['TSpawn', 'PalaceInterior', 'BombsiteA'], ['TSpawn', 'Middle', 'Connector', 'BombsiteA'], ['TSpawn', 'Apartments', 'BombsiteB'], ['CTSpawn', 'BombsiteA'], ['CTSpawn', 'BombsiteB']],
  dust2: [['TSpawn', 'LongDoors', 'LongA', 'BombsiteA'], ['TSpawn', 'UpperTunnel', 'BombsiteB'], ['TSpawn', 'Middle', 'Catwalk', 'BombsiteA'], ['CTSpawn', 'BombsiteB'], ['CTSpawn', 'BombsiteA']],
  ancient: [['TSpawn', 'Middle', 'BombsiteA'], ['TSpawn', 'BombsiteB'], ['TSpawn', 'BombsiteA'], ['CTSpawn', 'BombsiteA'], ['CTSpawn', 'BombsiteB']],
  anubis: [['TSpawn', 'Middle', 'Connector'], ['TSpawn', 'BombsiteA'], ['TSpawn', 'BombsiteB'], ['CTSpawn', 'BombsiteA'], ['CTSpawn', 'BombsiteB']],
  cache: [['TSpawn', 'Squeaky', 'BombsiteA'], ['TSpawn', 'Middle', 'BombsiteB'], ['CTSpawn', 'BombsiteA'], ['CTSpawn', 'BombsiteB']],
};
const only = process.argv.slice(2), HU = 2.54 / 16.5, CHEST = 40 * HU;
for (const id of Object.keys(ROUTES)) { const f = 'user-maps/' + id + '.bsp'; if ((only.length && !only.includes(id)) || !existsSync(f)) continue; const buf = readFileSync(f); if (buf.subarray(0, 4).toString() !== 'CS2M') continue;
  useMapFile(id, buf); const M = ARENA_MAPS[id], Hm = M.hammer, boxes = mapBoxes(M, 0, 0), solid = boxes.filter(b => b.mover == null && !b.off);
  const hammer = (x, z) => [Math.round((x + Hm.W / 2) / Hm.U + Hm.x0), Math.round(Hm.y1 - (z + Hm.D / 2) / Hm.U)];
  // A place's spot: of its floors with standing room and floor all round at the same height, the one nearest its middle
  // (one under no other floor first — a walk to a stacked column may end on the other floor); a bomb site's: the bots' goal.
  const G = M.columns.G, cw = M.columns.cell, gxz = i => [-M.size[0] / 2 + (i % G.cols + .5) * cw, -M.size[1] / 2 + (((i / G.cols) | 0) + .5) * cw], gy = h => (h - Hm.zLow) * Hm.U;
  const placeAt = name => { const L = /^Bombsite([AB])$/.exec(name)?.[1]; if (L && M.siteGoals?.[L]?.length === 3) { const [x, z, y] = M.siteGoals[L]; return { x, z, y }; }
    const cells = []; for (let i = 0; i < G.n.length; i++) for (let k = 0; k < G.n[i]; k++) { const v = i * 3 + k; if (G.places[G.place[v]] !== name || G.ceil[v] - G.z[v] < 72) continue; const h = G.z[v];
      const flat = [1, -1, G.cols, -G.cols].every(d => { const j = i + d; if (j < 0 || j >= G.n.length) return false; for (let q = 0; q < G.n[j]; q++) if (Math.abs(G.z[j * 3 + q] - h) <= 18) return true; return false; }); if (flat) cells.push([i, h, G.n[i] === 1]); }
    if (!cells.length) return null; const pool = cells.some(c => c[2]) ? cells.filter(c => c[2]) : cells; let cx = 0, cz = 0; for (const [i] of pool) { const [x, z] = gxz(i); cx += x / pool.length; cz += z / pool.length; }
    const [i, h] = pool.reduce((a, c) => { const [x, z] = gxz(c[0]), [ax, az] = gxz(a[0]); return Math.hypot(x - cx, z - cz) < Math.hypot(ax - cx, az - cz) ? c : a; }); const [x, z] = gxz(i); return { x, z, y: gy(h) }; };
  // A box across the walk: chest high over the floor the walk is on (followed step by step as a body walks: up a step,
  // down off a ledge), sampled every half unit (the doors that open excepted).
  const across = P => { let f = P[0][2]; for (let i = 1; i < P.length; i++) { const [ax, az] = P[i - 1], [bx, bz, by] = P[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / .5));
      for (let s = 0; s <= n; s++) { const t = s / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, g = M.nav.floorAt(x, z, f + .1); if (Number.isFinite(g)) f = g; const y = f + CHEST; for (const b of solid) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && y > b.y0 && y < b.y1) return [x, z, y]; }
      if (Number.isFinite(by)) f = by; } return null; };
  const walks = {};
  for (const route of ROUTES[id]) { const name = `${id}: ${route.join(' → ')}`, pts = route.map(placeAt); if (pts.some(p => !p)) { check(name + ' (places on the map)', false, 'no place ' + route.filter((p, i) => !pts[i]).join(', ')); continue; }
    let all = [[pts[0].x, pts[0].z, pts[0].y]], why = '';
    for (let i = 1; i < pts.length && !why; i++) { const a = all[all.length - 1], b = pts[i], p = M.nav.route(a[0], a[1], a[2], b.x, b.z, null, b.y); if (!p.length) { why = 'no way from ' + route[i - 1] + ' to ' + route[i]; break; } const last = p[p.length - 1];
      if (Math.abs((last[2] ?? b.y) - b.y) > 4) why = route[i] + ': the walk ends on another floor (' + (last[2] - b.y).toFixed(1) + ')'; all = all.concat(p); }
    const hit = why ? null : across(all); walks[route.join('>')] = all;
    check(name + ': walkable (a bot route), no collision box across it', !why && !hit, why || (hit ? 'a box at Hammer ' + hammer(hit[0], hit[1]).join(', ') : `${all.length} points`)); }
  // Mode-only scenery listed for the look: where it stands nothing stops a player, a bullet or a grenade.
  const nm = M.nadeMesh, open = []; for (const o of M.modeOff || []) { let c = 0; for (const v of o.open) c += v; open.push(c); }
  check(`${id}: another mode's scenery the look draws is listed to come out of it, open cells only`, (M.modeOff || []).every((o, i) => open[i] > 0 && o.mats.length), (M.modeOff || []).length + ' listed');
  // Only the entity's own triangles go (cs2-render.js → modeOffHit: all corners in its own box), not the real wall beside
  // it of the same material — Overpass's doorway jamb next to 2v2 wall 62151 (plane x −2032, y −1248…−1184; the old
  // middle-in-padded-columns cut took it: a see-through hole), Mirage's intact breakable shutter's top under its remains.
  const L = M.modeOff || [], hitM = (mat, ...p) => modeOffHit(L.filter(o => o.mats.includes(mat)), p.flat());
  if (id === 'overpass') check('overpass: the doorway jamb beside 2v2 wall 62151 stays; the wall\'s own face goes', L.length && !hitM('concrete_12_blend_3', [-2032, -1248, 250], [-2032, -1184, 250], [-2032, -1184, 360]) && hitM('concrete_12_blend_3', [-2000, -1207, 250], [-1900, -1207, 250], [-1900, -1207, 360]));
  if (id === 'mirage') check('mirage: the intact breakable shutter keeps its top (its remains are shown only once it breaks)', !hitM('shutter_window_diffuse', [-1915, -272, -46], [-1890, -272, -46], [-1890, -272, -18]));
  if (id === 'nuke') {
    // The doors on both sides of Ramp (silo doors, metal_door_001) and across Outside → Secret (roll-up door) are listed,
    // and the walks through them cross their boxes — nothing in the way there (no box, no grenade surface).
    const box = o => [o.a[0], o.a[1], o.a[0] + o.n[0] * o.c, o.a[1] + o.n[1] * o.c], crosses = (P, o) => { const [x0, y0, x1, y1] = box(o); return P.some(([x, z]) => { const [hx, hy] = hammer(x, z); return hx >= x0 && hx <= x1 && hy >= y0 && hy <= y1; }); };
    const silo = (M.modeOff || []).filter(o => o.mats.includes('metal_door_001')), roll = (M.modeOff || []).filter(o => o.mats.includes('rollup_door_001'));
    check('nuke: the 2v2 silo doors on both sides of Ramp are listed to come out of the look', silo.length === 2 && silo.some(o => o.a[0] < 300) && silo.some(o => o.a[0] > 970), JSON.stringify(silo.map(o => o.a)));
    check('nuke: the 2v2 roll-up door across Outside → Secret is listed to come out of the look', roll.length >= 1 && roll.every(o => o.a[0] > 1220 && o.a[0] < 1250), JSON.stringify(roll.map(o => o.a)));
    const ramp = [...(walks['Control>Ramp'] || []), ...(walks['Admin>Ramp'] || [])], sec = walks['TSpawn>Outside>Secret>BombsiteB'] || [];
    check('nuke: the walks into Ramp go through both doorways the silo doors stood in', silo.length === 2 && silo.every(o => crosses(ramp, o)));
    check('nuke: the walk Outside → Secret goes through the roll-up door\'s doorway', roll.length && roll.some(o => crosses(sec, o)));
    const G = (hx, hy, hz) => [(hx - Hm.x0) * Hm.U - Hm.W / 2, (hz - Hm.zLow) * Hm.U, (Hm.y1 - hy) * Hm.U - Hm.D / 2], line = (a, b) => nm && (nm.blocked(...G(...a), ...G(...b), false));
    check('nuke: through the doorways nothing stops a grenade or a bullet (Ramp both sides, Secret)', nm && !line([220, 80, -360], [360, 80, -360]) && !line([920, 80, -360], [1060, 80, -360]) && !line([1180, -2367, -370], [1320, -2367, -370]));
    // The real doors stay doors: B's double doors to Secret, Decon's, the Hut's — CS2's prop_door_rotating, closed at the start.
    const doors = M.movers.filter(m => m.kind === 'rotdoor').map(m => hammer(m.hinge[0], m.hinge[2]));
    check('nuke: its four real doors are doors (they open with E), not scenery taken out', doors.length === 4 && [[1047, -920], [1047, -1040], [305, -1350], [257, -1310]].every(([x, y]) => doors.some(d => Math.hypot(d[0] - x, d[1] - y) < 4)), JSON.stringify(doors)); }
}
console.log((fail ? 'FAIL' : 'PASS') + ': CS2 map entities in their competitive state — mode blockers out, real doors kept, standard routes walkable · ' + pass + '/' + (pass + fail)); if (fail) process.exitCode = 1;
