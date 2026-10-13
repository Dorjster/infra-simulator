// Dressing for the deathmatch maps (props, callouts, lamps).
// Same rules as arena-maps.js: every solid is a box you collide with, shoot and see on the radar; props collide as
// their real footprint; signs, windows and awnings are decoration flush on a wall. Validated by tests/gd-maps.mjs.
import { prop, sign, awning, assemble } from './arena-mapkit.js';


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
    awning(-70, -47, 's', 18, 14, 0x9c3b2a), awning(70, 47, 'n', 18, 14, 0x6c8a3a), sign('PLAZA', 0, 18, -47.2, 'n', 3), sign('FOUNTAIN', 0, 18, 47.2, 's', 2.4))
};
