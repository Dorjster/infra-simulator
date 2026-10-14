// Footsteps on maps from files sound like the floor (map-light.js): texture names and Source $surfaceprop values give
// the right surface — hard floors named for their stone over the ground they lie in, dirt and sand soft — and, when the
// map files are here (user-maps/, from tools/import-cs2-models.mjs), the built maps answer by spot: Dust II's sand among
// the paving at the Counter-Terrorist spawn, its paving at the Terrorist spawn, Nuke's asphalt (a grey "ground"), and every floor of
// each map known except a few under props.
import { existsSync, readFileSync } from 'node:fs';
import { SURFACES, surfaceOf } from '../dist/map-light.js';
let n = 0, bad = 0; const fail = []; const check = (name, c, d = '') => { n++; if (!c) { bad++; fail.push(name + (d !== '' ? ' (' + d + ')' : '')); } };
const want = { cugroundb: 'grass', groundsand: 'grass', sand_ground01: 'grass', train_dirtfloor: 'grass', grass03: 'grass', nature_dirt: 'grass',
  dust_floor02: 'concrete', stone_ground04: 'concrete', ground_tilec: 'concrete', sandstone01: 'concrete', tileroof01: 'concrete', marble_01: 'concrete', hrcp001: 'concrete',
  metalroof05a: 'metal', '{metalsteps': 'metal', duct_flr02a: 'metal', truck_bed: 'metal', woodsteps001: 'wood', pi_floorwd2: 'wood', plywood: 'wood', lrgcrttp: 'wood', dust_caja12: 'wood',
  rock: 'concrete', concrete: 'concrete', tile: 'concrete', Wood_Plank: 'wood', wood_crate: 'wood', metalgrate: 'metal', metalvent: 'metal', chainlink: 'metal', dirt: 'grass', mud: 'grass', gravel: 'grass', carpet: 'carpet' };
for (const [name, s] of Object.entries(want)) check(name + ' → ' + s, SURFACES[surfaceOf(name)] === s, SURFACES[surfaceOf(name)]);
const files = new URL('../user-maps/', import.meta.url); let maps = 0;
if (existsSync(new URL('dust2.bsp', files))) {
  const { ARENA_MAPS, useMapFile } = await import('../dist/arena-maps.js');
  for (const id of ['dust2', 'nuke', 'mirage', 'inferno', 'cache', 'anubis']) { if (!existsSync(new URL(id + '.bsp', files))) continue; maps++;
    const b = readFileSync(new URL(id + '.bsp', files)); useMapFile(id, b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); const M = ARENA_MAPS[id], at = p => M.surfaceAt(p[0], p[1], M.nav.floorAt(p[0], p[1]));
    check(id + ': surfaceAt', typeof M.surfaceAt === 'function');
    if (id === 'dust2') { check('Dust II CT spawn: sand among the paving', M.ct.some(p => at(p) === 'grass') && M.ct.some(p => at(p) === 'concrete'), M.ct.map(at)); check('Dust II T spawn: paving', M.t.slice(0, 5).every(p => at(p) === 'concrete'), M.t.slice(0, 5).map(at)); }
    // Floors lit by a switchable light (CS 1.6 light styles 32+) keep that light: Nuke's spawns were black.
    { const spots = [...M.t.slice(0, 5), ...M.ct.slice(0, 5)], lit = spots.map(p => +M.lightAt(p[0], p[1], M.nav.floorAt(p[0], p[1])).toFixed(2)); check(id + ': spawn floors lit (not black)', lit.every(v => v > .15), lit.join(' ')); }
    if (id === 'nuke') check('Nuke spawns: asphalt (grey ground is hard)', [...M.t.slice(0, 3), ...M.ct.slice(0, 3)].every(p => at(p) === 'concrete'), [...M.t.slice(0, 3), ...M.ct.slice(0, 3)].map(at));
    const [W, D] = M.size; let seed = 3, known = 0, all = 0; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 4000; i++) { const x = (rnd() - .5) * W, z = (rnd() - .5) * D, f = M.nav.floorAt(x, z); if (!Number.isFinite(f)) continue; all++; if (M.surfaceAt(x, z, f)) known++; }
    check(id + ': floors known', known / all > .95, known + '/' + all); }
}
if (bad) { console.error('FAIL: map surfaces · ' + bad + '/' + n + ': ' + fail.join(' | ')); process.exit(1); }
console.log('PASS: map surfaces · ' + n + ' checks' + (maps ? ' (' + maps + ' map files)' : ' (names only: no map files in user-maps/)'));
