// More Global Defensive maps (original layouts in the spirit of the classics) and the dressing for the older maps.
// Same rules as arena-maps.js: every solid is a box you collide with, shoot and see on the radar; props collide as
// their real footprint; signs, windows and awnings are decoration flush on a wall. Validated by tests/gd-maps.mjs.
import { B, wall, prop, sign, awning, assemble, windows } from './arena-mapkit.js';

const L = (x1, z1, x2, z2, h, m, ops) => wall(x1, z1, x2, z2, 2, h, m, ops);

// Old City: a dense old quarter of adobe and plaster houses. T spawn in the south market yard, CT spawn north.
// B (north-west): up the long "banana" lane along the west wall. A (north-east): up the east lane, or through the
// "apartments" alley that cuts the east block from mid. Mid: a narrow street straight north to CT.
export function oldCity() {
  const W = 'adobe', P = 'plaster', S = 'stone';
  const m = assemble(
    L(-140, -140, 140, -140, 34, S), L(-140, 140, 140, 140, 34, S), L(-140, -139, -140, 139, 34, S), L(140, -139, 140, 139, 34, S),
    // House blocks between the lanes.
    B(-60, 62, 100, 56, 28, P), B(-60, -15, 100, 70, 26, W), B(60, 62, 100, 56, 26, W), B(60, -29, 100, 22, 28, P), B(60, 9, 100, 22, 26, W),
    // Houses in the T yard and the CT houses that split the north band into B, CT mid and A.
    B(-80, 125, 30, 20, 22, P), B(80, 125, 30, 20, 22, W), B(-30, -95, 40, 30, 24, P), B(30, -95, 40, 30, 24, W),
    // A doorway across the west cross alley; arches over the lanes (above head height).
    L(-60, 20, -60, 34, 24, W, [{ at: 7, w: 10 }]), B(125, 30, 30, 3, 6, S, 18), B(-125, 10, 30, 3, 6, S, 18), B(0, -52, 20, 3, 6, S, 18),
    // ── B site: ruined walls, crates, a cart.
    B(-128, -112, 4, 24, 10, S), B(-116, -124, 24, 4, 10, S), prop('crate', -75, -70, 0), prop('crate2', -70, -126, 0), prop('cart', -132, -62, 0), prop('barrel', -100, -120), prop('sandbags', -82, -58, 0),
    // ── A site: crates, sandbags, a well, barrels.
    prop('crate2', 116, -116, 0), prop('crate', 122, -109, 0), prop('sandbags', 75, -65, 0), prop('well', 128, -60), prop('barrels', 70, -128, 0), prop('crate', 96, -100, 0),
    // ── Mid, lanes and the T yard.
    prop('crate', 6, 50, 0), prop('crate', -6, -20, 0), prop('barrel', 6, 70), prop('cart', -134, 70, 1), prop('barrels', 132, 60, 1),
    prop('stall', -45, 133, 0, { color: 0xb5651d }), prop('stall', 45, 133, 0, { color: 0x2f7d8c }), prop('palm', -120, 132), prop('palm', 120, 132), prop('palm', -50, 100), prop('palm', 50, 100), prop('well', -20, 104),
    prop('lamp', -12, 30, 0, { light: true }), prop('lamp', 12, -45, 0, { light: true }), prop('lamp', -112, -30, 0, { light: true }), prop('lamp', 112, -10, 0, { light: true }), prop('lamp', -60, -135, 0, { light: true }), prop('lamp', 60, -135, 0, { light: true }), prop('lamp', 0, 136, 0, { light: true }),
    // Callouts.
    sign('BANANA', -110.2, 14, -10, 'w', 3), sign('B', -100, 20, -138.9, 's', 8), sign('A', 100, 20, -138.9, 's', 8), sign('MID', 9.8, 16, 50, 'w', 3), sign('APPS', 9.8, 14, -24, 'w', 2.4),
    sign('CT', -9.8, 16, -95, 'e', 3), sign('A ⟶', 110.2, 14, 50, 'e', 2.4), sign('⟵ B', -110.2, 14, 60, 'w', 2.4),
    awning(-60, 90.6, 's', 22, 15, 0x9c3b2a), awning(60, 90.6, 's', 22, 15, 0x6c8a3a), awning(-80, 114.4, 'n', 16, 14, 0xc9a227), awning(80, 114.4, 'n', 16, 14, 0x2f7d8c), awning(-9.4, 70, 'e', 14, 15, 0xb5651d)
  );
  return { name: 'Old City', kind: 'defuse', size: [280, 280], floor: 'stone', sky: 0xc4d6e4, sun: 0xffe9c8,
    ...m, decor: [...m.decor, ...windows([[-60, 90.1, 's', 100], [60, 90.1, 's', 100], [-60, 33.9, 'n', 100], [60, 33.9, 'n', 100], [-60, 20.1, 's', 100], [60, 20.1, 's', 100], [-9.9, -15, 'e', 70], [9.9, -29, 'w', 22], [110.1, 62, 'e', 56], [-110.1, 62, 'w', 56], [-110.1, -15, 'w', 70], [110.1, -29, 'e', 22], [110.1, 9, 'e', 22], [-30, -110.1, 'n', 40], [30, -110.1, 'n', 40]], 16, 5)],
    t: [[0, 120], [-14, 116], [14, 116], [-26, 124], [26, 124]], ct: [[0, -122], [-14, -118], [14, -118], [-26, -126], [26, -126]],
    sites: { A: [95, -82, 22], B: [-95, -86, 22] },
    routes: { t: { A: [[60, 110], [125, 100], [125, -30], [100, -70], [95, -82]], B: [[-60, 110], [-125, 100], [-125, -40], [-100, -75], [-95, -86]], M: [[0, 100], [0, 40], [0, -40], [0, -70]] },
      ct: { A: [[30, -125], [70, -110], [95, -82]], B: [[-30, -125], [-70, -110], [-95, -86]] } } };
}

// Depot: a rail freight depot. T spawn west, CT spawn east. A (north) and B (south) are loading yards beside the
// CT control buildings; the T side reaches them through the back alleys behind the warehouses, or across the rail
// yard where two staggered rows of freight cars make a long middle lane with gaps to cross through.
export function depot() {
  const C = 'concrete';
  const car = (x, z, m) => B(x, z, 36, 12, 14, m);
  const m = assemble(
    L(-150, -150, 150, -150, 32, C), L(-150, 150, 150, 150, 32, C), L(-150, -149, -150, 149, 32, C), L(150, -149, 150, 149, 32, C),
    // Freight cars in two staggered rows.
    car(-90, -14, 'metal-red'), car(-42, -14, 'metal-blue'), car(6, -14, 'metal-green'), car(54, -14, 'metal-red'),
    car(-66, 14, 'metal-blue'), car(-18, 14, 'metal-red'), car(30, 14, 'metal-blue'), car(78, 14, 'metal-green'),
    // Warehouses and the CT control buildings.
    B(-30, -92.5, 60, 65, 30, 'brick'), B(-30, 92.5, 60, 65, 30, C), B(115, -95, 30, 40, 22, C), B(115, 95, 30, 40, 22, 'brick'),
    // ── A (north loading yard).
    prop('crate2', 28, -140, 0), prop('crate', 40, -128, 0), prop('forklift', 75, -120, 0), prop('barrels', 30, -75, 0), prop('sandbags', 60, -70, 0), prop('crate', 80, -55, 0),
    // ── B (south loading yard).
    prop('crate2', 28, 140, 0), prop('crate', 40, 128, 0), prop('dumpster', 75, 120, 0), prop('barrels', 30, 75, 0), prop('sandbags', 60, 70, 0), prop('crate', 80, 55, 0),
    // ── T side, alleys and the yard.
    prop('pallet', -125, -60, 0), prop('pallet', -125, 60, 0), prop('crate', -100, -100, 0), prop('crate', -100, 100, 0), prop('barrels', -40, -145, 0), prop('barrels', -40, 145, 0), prop('crate', 100, -30, 0), prop('crate', 100, 30, 0),
    prop('lamp', -110, -30, 0, { light: true }), prop('lamp', -110, 30, 0, { light: true }), prop('lamp', 10, -45, 0, { light: true }), prop('lamp', 10, 45, 0, { light: true }), prop('lamp', 140, -40, 0, { light: true }), prop('lamp', 140, 40, 0, { light: true }), prop('lamp', -80, -145, 0, { light: true }), prop('lamp', -80, 145, 0, { light: true }),
    sign('A', 99.8, 14, -95, 'w', 6), sign('B', 99.8, 14, 95, 'w', 6), sign('WAREHOUSE', .2, 18, -92, 'e', 2.4), sign('WAREHOUSE', .2, 18, 92, 'e', 2.4), sign('YARD', -108.2, 10, -14, 'w', 2.4), sign('⟵ A', -60.2, 14, -70, 'w', 2.4), sign('⟵ B', -60.2, 14, 70, 'w', 2.4),
    sign('A', 100, 20, -148.9, 's', 8), sign('B', 100, 20, 148.9, 'n', 8)
  );
  return { name: 'Depot', kind: 'defuse', size: [300, 300], floor: 'concrete', sky: 0xa7b6c4, sun: 0xfff2dc,
    ...m, decor: [...m.decor, ...windows([[-30, -59.9, 's', 60], [-30, 59.9, 'n', 60], [-60.1, -92.5, 'w', 65], [-60.1, 92.5, 'w', 65], [99.9, -95, 'w', 40], [99.9, 95, 'w', 40], [115, -74.9, 's', 30], [115, 74.9, 'n', 30]], 16, 5)],
    t: [[-128, 0], [-124, -14], [-124, 14], [-132, -26], [-132, 26]], ct: [[128, 0], [124, -14], [124, 14], [132, -26], [132, 26]],
    sites: { A: [60, -95, 24], B: [60, 95, 24] },
    routes: { t: { A: [[-110, -40], [-80, -137], [10, -137], [60, -95]], B: [[-110, 40], [-80, 137], [10, 137], [60, 95]], M: [[-100, 0], [-30, 0], [40, 0]] },
      ct: { A: [[110, -40], [80, -80], [60, -95]], B: [[110, 40], [80, 80], [60, 95]] } } };
}

// Dressing for the older maps: props, windows, callouts and lamps added to their layouts (the layouts and bot
// routes stay as they were). Each returns { solids, decor, props } to append.
export const DRESS = {
  yard: () => assemble(
    prop('forklift', -24, -8, 0), prop('barrels', -85, -40, 0), prop('barrels', 85, 40, 0), prop('dumpster', -40, 100, 0), prop('dumpster', 40, -100, 0), prop('pallet', -60, -100, 0), prop('pallet', 60, 100, 0),
    prop('truck', 50, -105, 1, { color: 0x3c5a78 }), prop('lamp', -60, -112, 0, { light: true }), prop('lamp', 60, 112, 0, { light: true }), prop('lamp', -112, 60, 0, { light: true }), prop('lamp', 112, -60, 0, { light: true }),
    sign('WAREHOUSE', 0, 20, -26.2, 'n', 3), sign('DOCK 2', 0, 20, 26.2, 's', 3), sign('YARD A', -117.9, 16, -60, 'e', 3), sign('YARD B', 117.9, 16, 60, 'w', 3)),
  town: () => assemble(
    prop('palm', -40, -95), prop('palm', 40, 95), prop('stall', -40, 30, 0, { color: 0xb5651d }), prop('stall', 40, -30, 0, { color: 0x2f7d8c }), prop('bench', 0, 20, 0), prop('bench', 0, -20, 0), prop('planter', -14, 35), prop('planter', 14, -35),
    prop('lamp', -30, 0, 0, { light: true }), prop('lamp', 30, 0, 0, { light: true }), prop('lamp', 0, -100, 0, { light: true }), prop('lamp', 0, 100, 0, { light: true }), prop('cart', -100, -60, 1), prop('cart', 100, 60, 1),
    awning(-70, -47, 's', 18, 14, 0x9c3b2a), awning(70, 47, 'n', 18, 14, 0x6c8a3a), sign('PLAZA', 0, 18, -47.2, 'n', 3), sign('FOUNTAIN', 0, 18, 47.2, 's', 2.4)),
  plaza: () => assemble(
    prop('lamp', 60, -26, 0, { light: true }), prop('lamp', -10, 26, 0, { light: true }), prop('bench', 60, 26, 0), prop('tree', -10, -26), prop('palm', 40, 140), prop('palm', -20, 140), prop('stall', 80, 140, 0, { color: 0x9c3b2a }),
    prop('planter', 90, -26), prop('planter', 90, 26), prop('lamp', 100, 140, 0, { light: true }), prop('lamp', 100, -140, 0, { light: true }), prop('bench', -20, -140, 0),
    sign('A', -90, 20, 147.9, 'n', 8), sign('B', -90, 20, -147.9, 's', 8), sign('MID', 80, 18, -29.9, 's', 4), sign('APPS', 12.2, 12, -105, 'e', 2.4), sign('PALACE', 32.2, 18, 108, 'e', 2.4),
    awning(0, 60.6, 's', 20, 15, 0x9c3b2a), awning(60, 60.6, 's', 20, 15, 0x2f7d8c), awning(-20, -60.6, 'n', 20, 15, 0xc9a227),
    windows([[20, -60.1, 'n', 160], [20, -29.9, 's', 160], [20, 29.9, 'n', 160], [20, 60.1, 's', 160]], 15, 6)),
  hamlet: () => assemble(
    prop('tree', -125, -125), prop('tree', 125, 125), prop('tree', -125, 125), prop('lamp', -20, -35, 0, { light: true }), prop('bench', 20, -35, 0), prop('stall', -115, -100, 0, { color: 0xb5651d }), prop('cart', -50, -125, 1),
    prop('barrels', 110, -35, 0), prop('lamp', 0, 125, 0, { light: true }), prop('lamp', -60, 100, 0, { light: true }), prop('lamp', 60, 100, 0, { light: true }), prop('well', 62, -132),
    sign('A', 88, 26, -92.9, 's', 6), sign('CHURCH', 88, 20, -92.9, 's', 2.4), sign('B', -66.2, 25, -10, 'w', 4), sign('MARKET', -66.2, 20.5, -10, 'w', 2),
    awning(-90, 71, 's', 16, 14, 0x9c3b2a), awning(90, 71, 's', 16, 14, 0x2f7d8c), awning(0, 74, 's', 16, 14, 0xc9a227),
    windows([[-90, 29, 'n', 50], [-90, 71, 's', 50], [0, 36, 'n', 46], [0, 74, 's', 46], [90, 29, 'n', 50], [90, 71, 's', 50], [-45, -28, 'n', 40], [45, -28, 'n', 40], [-45, 8, 's', 40], [45, 8, 's', 40]], 18, 5)),
};
