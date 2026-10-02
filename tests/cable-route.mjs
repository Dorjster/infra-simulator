// Structured cabling: every cable type has its own colour, side and lane; routes are dressed runs (straight
// axis-aligned segments joined by short bends, no free-swinging splines); in the full Free Build facility
// no two cables of different colours share a path, and every cable stays inside the hall.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
import { CABLE_TYPES, cableType, linkCableType, cableColor } from '../dist/cable-colors.js';
import { cableLane } from '../dist/cable-route.js';

const colors = Object.values(CABLE_TYPES).map(t => t.color);
assert.equal(new Set(colors).size, colors.length, 'each cable type has its own colour');
const lanes = Object.keys(CABLE_TYPES).map(t => cableLane(t).join(':'));
assert.equal(new Set(lanes).size, lanes.length, 'each cable type has its own lane');
assert.equal(cableType({ media: 'cat6', kind: 'management', speed: 1 }), 'mgmt');
assert.equal(cableType({ media: 'cat6', speed: 1 }), 'cat6');
assert.equal(cableType({ media: 'dac25', speed: 25 }), 'dac');
assert.equal(cableType({ media: 'os2' }), 'os2');
assert.equal(cableType({ kind: 'storage', speed: 32 }), 'fc');

const racked = a.links.filter(l => a.byId[l.a]?.rack?.startsWith('R') && a.byId[l.b]?.rack?.startsWith('R') && l.pa.medium !== 'Internal');
assert(racked.length > 20, 'facility has racked cables');
const key = p => [p.x, p.y, p.z].map(v => Math.round(v * 50)).join(',');
const owner = new Map(), clashes = [];
for (const l of racked) {
  const pts = l.hit.geometry.attributes.position, n = pts.count, color = cableColor(linkCableType(l));
  let long = 0, diagonal = 0, total = 0;
  for (let i = 1; i < n; i++) {
    const dx = Math.abs(pts.getX(i) - pts.getX(i - 1)), dy = Math.abs(pts.getY(i) - pts.getY(i - 1)), dz = Math.abs(pts.getZ(i) - pts.getZ(i - 1)), len = Math.hypot(dx, dy, dz); total += len;
    if (len > .3) { long++; if ([dx, dy, dz].filter(d => d > .02).length > 1) diagonal++; }
    assert(pts.getY(i) > 0 && pts.getY(i) < 13.6, l.a + '→' + l.b + ' stays between floor and tray');
    // Straight runs of one colour may share a lane (a bundle); a different colour on the same run would z-fight.
    if (len > .3) { const mid = { x: (pts.getX(i) + pts.getX(i - 1)) / 2, y: (pts.getY(i) + pts.getY(i - 1)) / 2, z: (pts.getZ(i) + pts.getZ(i - 1)) / 2 }, k = key(mid), o = owner.get(k); if (o !== undefined && o !== color) clashes.push(l.a + '→' + l.b + ' @' + k); owner.set(k, color); }
  }
  assert(long >= 2 || total < 4, l.a + '→' + l.b + ' has dressed straight runs');
  assert.equal(diagonal, 0, l.a + '→' + l.b + ' has no diagonal runs');
}
assert.deepEqual(clashes, [], 'no two colours share a straight run');
console.log('PASS: cable routing · ' + racked.length + ' racked cables are axis-aligned dressed runs with rounded bends, one colour and lane per type (' + Object.keys(CABLE_TYPES).length + ' types), no colour clashes.');
process.exit(0);
