// Classic-flow Defuse maps (original geometry and names, laid out in the spirit of the Counter-Strike classics),
// written on a cell grid (arena-gridmap.js). Columns run west → east, rows north → south (north is up on the radar).
// Cell = 11 units (~72 Hammer units): a 3-cell lane is ~215 HU wide, a 2-cell door ~145 HU, close to CS proportions.
import { gridMap } from './arena-gridmap.js';

// Dune — the Dust-style map. T spawn south; B up the west tunnels; A at the end of long (east) or up short (catwalk)
// from mid; mid doors open sideways into CT mid; the CT spawn sits between CT mid and the A ramp.
export const DUNE = {
  name: 'Dune', cols: 48, rows: 48, cell: 11, wall: 'adobe', h: 26, floor: 'sand', sky: 0xbcd6ec, sun: 0xfff0d0,
  open: [
    [3, 3, 13, 12],                        // B site
    [5, 13, 7, 20],                        // B entrance from the tunnels
    [14, 7, 23, 9], [17, 10, 26, 13],      // B doors, CT mid
    [21, 3, 27, 8],                        // CT spawn
    [28, 4, 33, 6],                        // CT ramp (CT spawn → A)
    [34, 2, 44, 8],                        // A site and A ramp
    [20, 14, 22, 15],                      // mid doors
    [20, 16, 23, 29],                      // mid
    [15, 30, 28, 32],                      // upper mid
    [15, 33, 17, 39],                      // suicide
    [12, 40, 27, 45],                      // T spawn and titanic
    [28, 33, 31, 42],                      // outside long
    [33, 33, 35, 35],                      // long doors
    [36, 28, 43, 36],                      // pit / bottom of long
    [40, 9, 43, 27],                       // long
    [33, 9, 35, 22],                       // short (up to A)
    [25, 20, 32, 22],                      // catwalk (mid → short)
    [36, 23, 39, 25],                      // side of pit (short ↔ long)
    [13, 18, 19, 20], [7, 18, 12, 21],     // lower tunnels, tunnel stairs
    [4, 21, 6, 33],                        // upper tunnels
    [3, 34, 12, 41],                       // outside
  ],
  mat: [[24, 0, 47, 14, 'plaster', 26], [0, 0, 18, 14, 'adobe', 28]],
  cover: [
    [36, 4, 37, 5, 6, 'crate'], [38, 4, 38, 4, 12, 'crate'], [43, 2, 43, 3, 6, 'crate'],   // A: default box, stack, goose
    [9, 5, 10, 6, 6, 'crate'], [5, 9, 5, 10, 12, 'crate'], [12, 10, 12, 11, 6, 'crate'],  // B: boxes, back plat, door boxes
    [22, 17, 22, 17, 6, 'crate'],                                                        // mid: xbox
    [30, 36, 30, 36, 6, 'crate'], [42, 30, 42, 30, 6, 'crate'], [4, 28, 4, 28, 6, 'crate'], [8, 37, 9, 37, 6, 'crate'],
  ],
  props: [['car', 42, 13, 0, { color: 0x9a3b2a }], ['barrel', 26, 31], ['palm', 25, 41], ['palm', 13, 44], ['lamp', 20, 41, 0, { light: true }], ['lamp', 24, 4, 0, { light: true }], ['lamp', 21, 25, 0, { light: true }], ['lamp', 41, 22, 0, { light: true }],
    ['cart', 18, 42], ['barrels', 24, 45, 1], ['pallet', 30, 40], ['barrels', 39, 35], ['sandbags', 43, 25, 1], ['barrel', 20, 28], ['bench', 25, 12], ['planter', 18, 11], ['hay', 11, 4], ['barrels', 4, 4],
    ['pallet', 41, 7], ['barrel', 4, 24], ['barrel', 6, 31], ['palm', 4, 40], ['planter', 32, 21], ['cart', 37, 29, 1], ['bollard', 20, 15], ['bollard', 22, 15]],
  // Heights: the T outskirts climb to the tunnels; upper tunnels (roofed) lead to raised B; the stairs go down into the
  // roofed lower tunnels and out to mid; A sits up the ramps from long, short and the CT ramp.
  lift: [[3, 34, 9, 41, 5], [4, 21, 6, 33, 5], [5, 13, 7, 20, 5], [7, 18, 7, 21, 5], [3, 3, 13, 12, 5], [34, 2, 44, 8, 4], [33, 9, 35, 19, 4]],
  ramp: [[10, 34, 12, 41, 'w', 0, 5], [8, 18, 12, 21, 'w', 0, 5], [14, 7, 16, 9, 'w', 0, 5], [28, 4, 33, 6, 'e', 0, 4], [40, 9, 43, 12, 'n', 0, 4], [33, 20, 35, 22, 'n', 0, 4]],
  roof: [[4, 21, 6, 33, 21], [5, 14, 7, 20, 21], [8, 18, 12, 21, 21], [13, 18, 19, 20, 15], [33, 33, 35, 35, 16]],
  T: [14, 41, 26, 44], C: [21, 3, 27, 8], A: [35, 3, 43, 7], B: [4, 4, 12, 11], mid: [21, 22],
  callouts: [['B Site', 8, 7], ['B Doors', 16, 8], ['CT Mid', 21, 11], ['CT Spawn', 24, 5], ['Mid Doors', 21, 14], ['Xbox', 22, 18], ['Mid', 21, 24], ['Catwalk', 29, 21], ['Short', 34, 16],
    ['A Site', 39, 5], ['CT Ramp', 31, 5], ['Goose', 43, 2], ['Car', 42, 11], ['Long', 42, 19], ['Pit', 42, 34], ['Long Doors', 34, 34], ['Outside Long', 29, 37], ['Upper Mid', 22, 31],
    ['Suicide', 16, 36], ['T Spawn', 20, 43], ['Outside', 8, 37], ['Upper Tunnels', 5, 27], ['Lower Tunnels', 15, 19], ['Stairs', 10, 21], ['Side of Pit', 36, 24], ['Titanic', 13, 42]],
};

// Old City — the Inferno-style map. T spawn west; mid runs east to long A; second mid, the T apartments, boiler and
// balcony reach A short; banana climbs north to B; the CT spawn is east, with speedway and the arch down to A and the
// CT corridor along the north to B.
export const OLDCITY = {
  name: 'Old City', cols: 48, rows: 48, cell: 11, wall: 'plaster', h: 28, floor: 'stone', sky: 0xc4d6e4, sun: 0xffe9c8,
  open: [
    [2, 27, 7, 36],                        // T spawn
    [8, 29, 15, 32],                       // T ramp
    [16, 24, 20, 32],                      // logs / banana base
    [19, 30, 31, 33],                      // mid
    [20, 14, 23, 29],                      // banana
    [18, 12, 25, 13],                      // B entrance
    [17, 5, 27, 11],                       // B site
    [28, 5, 31, 9],                        // pool / coffins
    [28, 9, 40, 11],                       // CT corridor (north)
    [40, 9, 42, 12], [41, 12, 45, 19], [39, 13, 40, 16],   // CT spawn and its exits
    [36, 11, 38, 22],                      // speedway
    [36, 22, 44, 24],                      // arch / library
    [29, 25, 31, 30], [29, 25, 40, 27],    // long corner, long
    [36, 28, 42, 34],                      // A site
    [43, 30, 45, 38], [43, 25, 45, 29],    // pit, graveyard
    [8, 36, 16, 39],                       // T apartments
    [17, 36, 27, 38],                      // second mid
    [24, 34, 25, 35],                      // underpass (mid ↔ second mid)
    [28, 35, 31, 39],                      // boiler / bedroom
    [32, 35, 35, 37], [36, 35, 41, 36],    // balcony, A short (patio)
  ],
  mat: [[0, 0, 18, 47, 'adobe', 28], [32, 0, 47, 24, 'stone', 30]],
  cover: [
    [37, 29, 37, 30, 6, 'crate'], [41, 33, 41, 33, 12, 'crate'], [40, 30, 40, 30, 6, 'crate'],   // A: cubby, triple, default
    [24, 8, 25, 9, 4, 'stone'], [26, 5, 26, 6, 6, 'crate'], [18, 10, 18, 10, 6, 'crate'],     // B: fountain, coffins, first
    [22, 14, 23, 14, 4, 'sand'],                                                             // banana: sandbags (top)
    [26, 31, 26, 31, 6, 'crate'], [44, 34, 44, 34, 6, 'crate'],
  ],
  props: [['car', 21, 26, 0, { color: 0x6a7a52 }], ['palm', 4, 28], ['palm', 4, 35], ['barrels', 13, 38, 0], ['cart', 30, 37, 0], ['lamp', 6, 31, 0, { light: true }], ['lamp', 43, 16, 0, { light: true }], ['lamp', 22, 26, 0, { light: true }], ['lamp', 38, 26, 0, { light: true }]],
  props2: [['barrels', 30, 6], ['cart', 18, 28], ['planter', 27, 32], ['bench', 44, 27, 1], ['hay', 44, 37], ['planter', 38, 13], ['barrel', 9, 31], ['pallet', 12, 30], ['tree', 43, 26], ['barrel', 41, 36], ['planter', 19, 37]],
  // Heights (Inferno-style): banana climbs to raised B (and pool, coffins); the CT corridor steps down to the CT side;
  // the T apartments are upstairs under a roof; boiler, the underpass and the library are roofed.
  lift: [[20, 14, 23, 14, 4], [18, 12, 25, 13, 4], [17, 5, 27, 11, 4], [28, 5, 31, 11, 4], [11, 36, 13, 39, 4]],
  ramp: [[20, 15, 23, 23, 'n', 0, 4], [32, 9, 35, 11, 'w', 0, 4], [8, 36, 10, 39, 'e', 0, 4], [14, 36, 16, 39, 'w', 0, 4]],
  roof: [[8, 36, 16, 39, 21], [28, 35, 31, 39, 17], [24, 34, 25, 35, 15], [39, 22, 44, 24, 17]],
  T: [3, 28, 6, 35], C: [41, 12, 45, 19], A: [37, 29, 41, 33], B: [18, 6, 26, 10], mid: [27, 31],
  callouts: [['B Site', 22, 8], ['Fountain', 25, 10], ['Coffins', 27, 6], ['Pool', 30, 7], ['CT', 34, 10], ['Car', 21, 19], ['Banana', 21, 24], ['Sandbags', 23, 21], ['Logs', 17, 27],
    ['T Ramp', 11, 30], ['Mid', 24, 31], ['Long Corner', 30, 28], ['Long', 35, 26], ['Arch', 38, 23], ['Library', 43, 23], ['Speedway', 37, 16], ['CT Spawn', 43, 15],
    ['A Site', 39, 31], ['Pit', 44, 35], ['Graveyard', 44, 27], ['Short', 38, 35], ['Balcony', 33, 36], ['Boiler', 29, 37], ['Second Mid', 21, 37], ['T Apps', 11, 37], ['Underpass', 25, 34], ['T Spawn', 4, 31]],
};

// Plaza — the Mirage-style map. T spawn east; the T apartments run along the north to B apartments and B; top mid
// opens into mid with short (to B) and window; connector and jungle drop to A; ramp and palace reach A from the
// T side; the CT spawn is south-west, between A (ticket booth side) and the market door to B.
export const PLAZA = {
  name: 'Plaza', cols: 48, rows: 48, cell: 11, wall: 'plaster', h: 28, floor: 'stone', sky: 0xa9c7e0, sun: 0xffe7c2,
  open: [
    [40, 9, 46, 15],                       // T spawn
    [41, 4, 44, 8], [26, 4, 44, 7],        // T stairs, T apartments
    [14, 5, 25, 8],                        // B apartments
    [12, 8, 15, 11],                       // B stairs (down to B)
    [4, 11, 14, 21],                       // B site
    [33, 16, 39, 20], [40, 16, 42, 20],    // top mid
    [19, 17, 32, 21],                      // mid (catwalk along its north side)
    [15, 12, 18, 18],                      // short (mid → B)
    [16, 19, 18, 22],                      // window room
    [21, 22, 24, 33],                      // connector
    [21, 33, 26, 35],                      // jungle / stairs
    [21, 36, 30, 43],                      // A site
    [40, 21, 43, 34], [31, 32, 39, 35],    // T ramp lane, ramp / tetris
    [40, 35, 44, 42], [32, 38, 39, 41],    // palace entrance, palace
    [4, 31, 10, 37],                       // CT spawn
    [11, 36, 20, 39],                      // CT / ticket (CT spawn → A)
    [6, 22, 9, 30], [10, 22, 12, 25],      // CT → market, market / kitchen (door to B)
  ],
  mat: [[25, 0, 47, 12, 'brick', 30], [30, 36, 47, 47, 'sand', 28]],
  cover: [
    [24, 38, 24, 39, 6, 'crate'], [28, 40, 29, 41, 6, 'crate'], [22, 41, 22, 41, 12, 'crate'],   // A: triple, firebox, ninja
    [7, 14, 8, 15, 6, 'crate'], [12, 18, 12, 18, 6, 'crate'], [5, 19, 5, 20, 12, 'crate'],       // B: bench boxes, van, corner
    [27, 18, 27, 18, 6, 'crate'], [36, 33, 37, 33, 6, 'crate'],                                  // mid box, tetris
  ],
  props: [['stall', 34, 40, 0, { color: 0x9c3b2a }], ['planter', 35, 17], ['bench', 15, 39, 0], ['lamp', 46, 9, 0, { light: true }], ['lamp', 5, 36, 0, { light: true }], ['lamp', 25, 19, 0, { light: true }], ['lamp', 8, 16, 0, { light: true }]],
  props2: [['planter', 44, 13], ['barrels', 45, 10], ['bench', 30, 20], ['planter', 6, 35], ['pallet', 11, 13], ['barrel', 20, 18], ['tree', 9, 32], ['bollard', 23, 22], ['barrels', 38, 41], ['planter', 27, 37], ['cart', 42, 26, 1]],
  // Heights (Mirage-style): the T and B apartments are upstairs (roofed), down the B stairs to B; the connector,
  // jungle, window room, market and palace are covered.
  lift: [[26, 4, 40, 7, 4], [14, 5, 25, 8, 4]],
  ramp: [[41, 4, 44, 8, 'w', 0, 4], [12, 9, 15, 11, 'n', 0, 4]],
  roof: [[26, 4, 40, 7, 21], [14, 5, 25, 8, 21], [16, 19, 18, 22, 17], [21, 22, 24, 32, 17], [21, 33, 26, 35, 17], [10, 22, 12, 25, 16], [32, 38, 39, 41, 17]],
  T: [41, 10, 45, 14], C: [5, 32, 9, 36], A: [22, 37, 29, 42], B: [5, 12, 13, 20], mid: [25, 19],
  callouts: [['T Spawn', 43, 12], ['T Apps', 33, 5], ['B Apps', 19, 6], ['B Stairs', 13, 10], ['B Site', 9, 16], ['Bench', 5, 13], ['Van', 12, 18], ['Short', 16, 14], ['Window', 17, 21],
    ['Top Mid', 36, 18], ['Mid', 26, 19], ['Connector', 22, 27], ['Jungle', 23, 34], ['A Site', 25, 39], ['Ninja', 22, 42], ['Firebox', 29, 42], ['Ramp', 35, 33], ['Tetris', 32, 33],
    ['Palace', 35, 39], ['CT Spawn', 7, 34], ['Ticket', 17, 37], ['Market', 7, 25], ['Kitchen', 11, 23]],
};

// Hamlet — the original Dust-style map. T spawn south; the big courtyard west of it leads to the dark underpass and up
// to spot B (north-west); mid climbs to the clash below the CT spawn; the east lane climbs to spot A (north-east).
export const HAMLET = {
  name: 'Hamlet', cols: 44, rows: 44, cell: 11, wall: 'sand', h: 26, floor: 'sand', sky: 0xc9dbe8, sun: 0xfff0d0,
  open: [
    [17, 33, 30, 40],                      // T spawn
    [3, 26, 15, 40], [15, 34, 17, 38],     // courtyard, its gate to T spawn
    [3, 17, 6, 25], [7, 17, 13, 19],       // underpass (north from the courtyard), its side passage
    [4, 10, 7, 16],                        // stairs up to B
    [3, 2, 12, 9],                         // spot B
    [13, 4, 20, 7],                        // B corridor (CT spawn → B)
    [21, 3, 28, 8],                        // CT spawn
    [24, 9, 27, 10],                       // CT spawn → clash
    [16, 11, 31, 13],                      // clash (below the CT spawn)
    [17, 14, 20, 32],                      // mid
    [31, 28, 35, 38], [32, 10, 35, 27],    // east gate from T spawn, east lane
    [30, 2, 41, 9],                        // spot A
  ],
  mat: [[0, 0, 43, 12, 'adobe', 28], [0, 24, 16, 43, 'plaster', 24]],
  cover: [
    [34, 3, 35, 4, 6, 'crate'], [39, 6, 39, 7, 12, 'crate'], [32, 7, 32, 7, 6, 'crate'],   // A
    [9, 3, 10, 4, 6, 'crate'], [4, 6, 4, 7, 12, 'crate'], [11, 8, 11, 8, 6, 'crate'],      // B
    [19, 22, 19, 22, 6, 'crate'], [8, 30, 9, 31, 6, 'crate'], [12, 36, 12, 37, 6, 'crate'], [33, 19, 33, 19, 6, 'crate'], [27, 12, 27, 12, 6, 'crate'],
  ],
  props: [['palm', 5, 28], ['palm', 13, 28], ['well', 9, 35], ['cart', 25, 39, 1], ['lamp', 29, 34, 0, { light: true }], ['lamp', 22, 4, 0, { light: true }], ['lamp', 18, 24, 0, { light: true }], ['lamp', 34, 15, 0, { light: true }]],
  props2: [['barrels', 36, 33], ['hay', 14, 38], ['palm', 29, 39], ['pallet', 25, 5], ['planter', 18, 30], ['barrel', 34, 24], ['bench', 40, 8, 1], ['barrels', 4, 4], ['planter', 26, 12], ['cart', 10, 37]],
  // Heights (Dust-style): the roofed underpass runs north from the courtyard to the stairs up to raised B (also up the
  // B corridor from the CT side); A sits up the east lane.
  lift: [[3, 2, 12, 9, 5], [30, 2, 41, 9, 4]],
  ramp: [[4, 10, 7, 16, 'n', 0, 5], [13, 4, 17, 7, 'w', 0, 5], [32, 10, 35, 14, 'n', 0, 4]],
  roof: [[3, 17, 6, 25, 17]],
  T: [19, 34, 28, 39], C: [21, 3, 28, 8], A: [32, 3, 40, 8], B: [4, 3, 11, 8], mid: [18, 24],
  callouts: [['Spot B', 7, 5], ['Spot A', 36, 5], ['CT Spawn', 24, 5], ['Clash', 22, 12], ['B Corridor', 16, 5], ['Stairs', 5, 13], ['Underpass', 4, 21], ['Tunnel', 10, 18],
    ['Courtyard', 8, 33], ['Gate', 16, 36], ['Mid', 18, 24], ['T Spawn', 23, 36], ['East Gate', 33, 32], ['East Lane', 33, 18], ['Right Clash', 30, 12]],
};

// Depot — the Nuke-style map (on one level). T spawn south-west; lobby and the hut doors lead into the A building;
// the outside yard runs along the south to main (A) and the CT garage; B is north-west, reached by the T tunnels or
// from A through the ramp room; the CT spawn is east, through lockers into A.
export const DEPOT = {
  name: 'Depot', cols: 52, rows: 44, cell: 11, wall: 'concrete', h: 30, floor: 'concrete', sky: 0xa7b6c4, sun: 0xfff2dc,
  open: [
    [2, 33, 9, 41],                        // T spawn
    [4, 22, 7, 32],                        // T path north (to lobby and tunnels)
    [8, 20, 19, 25],                       // lobby
    [20, 23, 24, 24],                      // hut doors (squeaky) into A
    [25, 16, 38, 26],                      // A building (site)
    [39, 17, 43, 19],                      // lockers
    [44, 15, 50, 24],                      // CT spawn
    [10, 33, 18, 37], [19, 29, 43, 38],    // T outside, the outside yard
    [30, 27, 32, 28],                      // main (outside → A)
    [44, 25, 47, 31],                      // garage (CT → outside)
    [12, 10, 15, 19],                      // tunnels (lobby → B)
    [12, 4, 17, 9],                        // B west entrance
    [18, 2, 30, 9],                        // B site
    [31, 4, 34, 15],                       // ramp room (B ↔ A)
  ],
  mat: [[20, 13, 40, 27, 'metal-blue', 32], [0, 0, 30, 10, 'brick', 30]],
  cover: [
    [29, 18, 30, 19, 12, 'crate'], [35, 22, 35, 23, 6, 'crate'], [36, 18, 36, 18, 6, 'crate'],   // A: big box, mini, stack
    [21, 3, 22, 4, 6, 'crate'], [27, 7, 28, 7, 12, 'crate'], [19, 8, 19, 8, 6, 'crate'],          // B
    [30, 32, 31, 33, 15, 'metal-red'], [36, 35, 37, 35, 6, 'crate'], [22, 36, 23, 36, 6, 'crate'],   // outside: silo / containers
  ],
  props: [['forklift', 40, 31, 0], ['truck', 24, 32, 1, { color: 0x3c5a78 }], ['barrels', 13, 24, 0], ['lamp', 3, 34, 0, { light: true }], ['lamp', 49, 16, 0, { light: true }], ['lamp', 34, 30, 0, { light: true }], ['lamp', 29, 3, 0, { light: true }]],
  props2: [['barrels', 9, 23], ['pallet', 16, 21], ['crate2', 41, 36], ['barrels', 26, 37], ['pallet', 33, 25], ['barrels', 37, 17], ['bollard', 46, 26], ['barrels', 22, 8], ['pallet', 14, 6], ['crate', 8, 39]],
  // Heights (Nuke-style): the A building stands raised and roofed, reached up the hut ramp, the lockers, main and the
  // long ramp room from B; the tunnels and the garage are roofed.
  lift: [[25, 16, 38, 26, 5]],
  ramp: [[20, 23, 24, 24, 'e', 0, 5], [39, 17, 43, 19, 'w', 0, 5], [30, 27, 32, 28, 'n', 0, 5], [31, 4, 34, 15, 's', 0, 5]],
  roof: [[25, 16, 38, 26, 23], [12, 10, 15, 19, 16], [44, 25, 47, 31, 17]],
  T: [3, 34, 8, 40], C: [44, 15, 50, 23], A: [26, 17, 37, 25], B: [19, 3, 29, 8], mid: [30, 34],
  callouts: [['T Spawn', 5, 37], ['Lobby', 13, 22], ['Squeaky', 22, 24], ['A Site', 31, 21], ['Heaven', 37, 17], ['Lockers', 41, 18], ['CT Spawn', 47, 19], ['Outside', 28, 34],
    ['T Outside', 14, 35], ['Main', 31, 27], ['Garage', 45, 28], ['Silo', 30, 31], ['Tunnels', 13, 14], ['B Site', 24, 5], ['Vents', 14, 6], ['Ramp', 32, 10], ['Secret', 41, 37]],
};

// Temple — the Ancient-style map. T spawn south; jungle and stairs climb to A main and A (plateau and the temple
// beside it); mid opens north with donut (to A) and red (to the CT side); the CT spawn is north, with the alley east
// to short and long down to B; the tunnel and water run along the south to ruins and the ramp up to B.
export const TEMPLE = {
  name: 'Temple', cols: 48, rows: 48, cell: 11, wall: 'stone', h: 30, floor: 'stone', sky: 0xb7cfc0, sun: 0xfff0d6,
  open: [
    [20, 38, 27, 44],                      // T spawn
    [12, 32, 19, 37], [20, 34, 23, 37],    // jungle, its link to T spawn
    [8, 26, 12, 33],                       // stairs
    [5, 14, 10, 25],                       // A main
    [6, 8, 10, 13],                        // plateau
    [11, 10, 19, 15],                      // A site
    [13, 4, 17, 9], [18, 5, 20, 8],        // temple, temple → CT
    [21, 3, 28, 9],                        // CT spawn
    [25, 10, 28, 12], [25, 13, 27, 18],    // sniper nest, red
    [19, 19, 26, 31], [16, 27, 18, 31],    // mid, lower mid
    [21, 32, 24, 33],                      // mid → T side
    [13, 18, 18, 23], [14, 16, 16, 17], [18, 20, 18, 22],   // donut, donut → A, donut → mid
    [29, 5, 43, 8],                        // alley / back alley
    [32, 9, 34, 17],                       // short
    [40, 9, 43, 22],                       // long
    [33, 18, 40, 24],                      // B site
    [30, 19, 32, 23],                      // cave
    [27, 25, 33, 27], [33, 25, 35, 26],    // lamproom / construction, double door to B
    [40, 23, 43, 30], [38, 30, 42, 33],    // ramp, ruins
    [28, 34, 39, 36], [28, 37, 33, 39],    // water, tunnel to T spawn
  ],
  mat: [[0, 0, 47, 12, 'sand', 32], [28, 28, 47, 47, 'adobe', 28]],
  cover: [
    [12, 11, 12, 12, 12, 'stone'], [17, 13, 18, 14, 6, 'crate'], [15, 10, 15, 10, 6, 'crate'],   // A: big box, triple, temple box
    [34, 19, 35, 20, 6, 'crate'], [39, 22, 39, 23, 12, 'stone'], [37, 19, 37, 19, 6, 'crate'],  // B
    [23, 21, 26, 22, 26, 'stone'], [21, 25, 21, 25, 6, 'crate'], [41, 14, 41, 14, 6, 'crate'], [9, 20, 9, 20, 6, 'stone'], [35, 35, 36, 35, 4, 'stone'],
  ],
  props: [['tree', 7, 9], ['tree', 14, 34], ['palm', 31, 36], ['well', 16, 20], ['lamp', 26, 41, 0, { light: true }], ['lamp', 22, 4, 0, { light: true }], ['lamp', 20, 27, 0, { light: true }], ['lamp', 42, 18, 0, { light: true }],
    ['pillar', 13, 4, 0, { size: [3, 3, 17] }], ['pillar', 17, 4, 0, { size: [3, 3, 17] }], ['tree', 18, 36], ['tree', 27, 39], ['planter', 24, 30], ['planter', 19, 19], ['barrels', 42, 6], ['bench', 24, 8, 1],
    ['pillar', 35, 36, 0, { size: [3, 3, 9] }], ['pillar', 41, 32, 0, { size: [3, 3, 7] }], ['tree', 6, 22], ['pallet', 31, 26], ['tree', 9, 27], ['planter', 42, 10]],
  // Heights (Ancient-style): the jungle stairs climb to A main, A and the roofed temple; donut (roofed) steps up to A;
  // B stands raised over short, long and the ruins ramp, with the roofed cave beside it; the lamproom and the tunnel to
  // T spawn are roofed.
  lift: [[5, 14, 10, 25, 5], [6, 8, 10, 13, 5], [11, 10, 19, 15, 5], [13, 4, 17, 9, 5], [33, 18, 39, 24, 4], [40, 18, 43, 22, 4], [30, 19, 32, 23, 4]],
  ramp: [[8, 26, 12, 33, 'n', 0, 5], [18, 5, 20, 8, 'w', 0, 5], [14, 16, 16, 17, 'n', 0, 5], [32, 15, 34, 17, 's', 0, 4], [40, 13, 43, 17, 's', 0, 4], [40, 23, 43, 30, 'n', 0, 4], [33, 25, 35, 26, 'n', 0, 4]],
  roof: [[13, 4, 17, 9, 22], [13, 18, 18, 23, 17], [30, 19, 32, 23, 20], [27, 25, 32, 27, 17], [28, 37, 33, 39, 16]],
  T: [21, 39, 26, 43], C: [21, 3, 28, 9], A: [12, 11, 18, 14], B: [34, 19, 39, 23], mid: [22, 25],
  callouts: [['T Spawn', 23, 41], ['Jungle', 15, 34], ['Stairs', 10, 29], ['A Main', 7, 19], ['Plateau', 8, 10], ['A Site', 15, 12], ['Temple', 15, 6], ['CT Spawn', 24, 5], ['Sniper Nest', 26, 11],
    ['Red', 26, 15], ['Mid', 22, 24], ['Lower Mid', 17, 29], ['Donut', 15, 20], ['Alley', 31, 6], ['Back Alley', 40, 6], ['Short', 33, 13], ['Long', 41, 15], ['B Site', 36, 21], ['Cave', 31, 21],
    ['Lamproom', 29, 26], ['Double Door', 34, 25], ['Ramp', 41, 26], ['Ruins', 40, 31], ['Water', 33, 35], ['Tunnel', 30, 38]],
};

// Canal — the Anubis-style map. T spawn south; alley and upper climb the east side to A main and A (boat links the
// canal to it); ruins and long run up the west to B; top mid crosses the water on the bridge to mid, with palace
// across to B; the CT spawn is north, the beach behind it, the street down to B and heaven over to A.
export const CANAL = {
  name: 'Canal', cols: 48, rows: 48, cell: 11, wall: 'sand', h: 28, floor: 'sand', sky: 0xbfd8ea, sun: 0xfff1d6,
  open: [
    [18, 40, 29, 45],                      // T spawn
    [27, 34, 33, 38], [30, 39, 33, 41],    // alley, T spawn → alley
    [36, 24, 39, 38], [34, 35, 35, 37],    // upper, alley → upper
    [36, 16, 40, 23],                      // A main
    [32, 9, 41, 15],                       // A site (heaven / plateau)
    [30, 21, 35, 27],                      // boat
    [10, 36, 17, 40], [7, 26, 11, 35],     // ruins, long
    [8, 21, 12, 25],                       // B entrance (gate)
    [12, 18, 19, 24],                      // B site
    [20, 32, 26, 35], [22, 36, 24, 39],    // top mid, its link to T spawn
    [22, 25, 23, 31],                      // bridge
    [16, 26, 29, 28],                      // the canal (water, wades across)
    [26, 14, 29, 24],                      // mid
    [15, 15, 25, 17],                      // palace (mid → B)
    [18, 6, 25, 11], [26, 11, 27, 13],     // CT spawn, its mid exit
    [17, 2, 30, 5],                        // beach
    [26, 7, 31, 9],                        // heaven tunnel (CT → A)
    [13, 6, 17, 17],                       // street (CT → B)
  ],
  mat: [[14, 24, 31, 30, 'stone', 26], [0, 0, 47, 12, 'adobe', 30]],
  cover: [
    [34, 10, 35, 11, 6, 'crate'], [39, 13, 40, 14, 12, 'stone'], [37, 10, 37, 10, 6, 'crate'],   // A
    [13, 19, 14, 20, 6, 'crate'], [18, 22, 18, 23, 12, 'stone'], [16, 19, 16, 19, 6, 'crate'],  // B
    [32, 24, 33, 25, 15, 'wood'], [9, 30, 9, 30, 6, 'crate'], [24, 33, 24, 33, 6, 'crate'], [27, 19, 27, 19, 6, 'crate'],
  ],
  props: [['palm', 19, 3], ['palm', 28, 3], ['palm', 12, 38], ['lamp', 28, 42, 0, { light: true }], ['lamp', 21, 7, 0, { light: true }], ['lamp', 24, 33, 0, { light: true }], ['lamp', 38, 20, 0, { light: true }],
    ['pillar', 21, 15, 0, { size: [3, 3, 15] }], ['pillar', 24, 17, 0, { size: [3, 3, 15] }], ['palm', 29, 44], ['palm', 18, 45], ['cart', 32, 37], ['barrels', 38, 33], ['planter', 9, 33], ['pallet', 15, 39],
    ['bench', 22, 10, 1], ['planter', 41, 9], ['barrels', 29, 24], ['palm', 17, 2], ['bollard', 26, 13], ['hay', 11, 29]],
  // Heights (Anubis-style): the bridge and top mid stand over the canal; the roofed palace climbs from mid to raised B,
  // the gate and the street step up to it; the roofed heaven tunnel climbs from the CT spawn to raised A (heaven), and
  // A main steps up to it from the boat.
  lift: [[22, 25, 23, 31, 2.5], [20, 32, 26, 35, 2.5], [12, 18, 19, 24, 4], [15, 15, 19, 17, 4], [13, 15, 14, 17, 4], [32, 9, 41, 15, 5]],
  ramp: [[22, 36, 24, 39, 'n', 0, 2.5], [8, 21, 11, 25, 'e', 0, 4], [20, 15, 25, 17, 'w', 0, 4], [13, 11, 17, 14, 's', 0, 4], [27, 7, 31, 9, 'e', 0, 5], [36, 16, 40, 19, 'n', 0, 5]],
  roof: [[18, 15, 25, 17, 20], [26, 7, 31, 9, 21]],
  T: [19, 41, 28, 44], C: [18, 6, 25, 11], A: [33, 10, 40, 14], B: [13, 19, 18, 23], mid: [27, 19],
  callouts: [['T Spawn', 23, 42], ['Alley', 30, 36], ['Upper', 37, 31], ['A Main', 38, 19], ['A Site', 36, 12], ['Heaven', 29, 8], ['Boat', 32, 23], ['Ruins', 13, 38], ['Long', 9, 31],
    ['Gate', 10, 23], ['B Site', 15, 21], ['Top Mid', 23, 33], ['Bridge', 22, 29], ['Water', 18, 27], ['Mid', 27, 18], ['Palace', 20, 16], ['CT Spawn', 21, 8], ['Beach', 23, 3], ['Street', 15, 11]],
};

// Park — the Overpass-style map. T spawn north-east; the big park mid opens north-west, down the sidewalk and mid ramp
// to long A and A; the halls run down the middle to B yard (skyfall); the garden and stairs lead into B main on the
// east; the CT spawn is south, right beside A, with the CT ramp up to the window room and connector across to B.
export const PARK = {
  name: 'Park', cols: 48, rows: 48, cell: 11, wall: 'concrete', h: 30, floor: 'concrete', sky: 0xa9c1d6, sun: 0xfff2dc,
  open: [
    [26, 3, 40, 8],                        // T spawn
    [12, 3, 25, 7], [9, 8, 22, 16],        // T → mid, mid (the park)
    [9, 17, 12, 21], [12, 18, 18, 21],     // sidewalk, mid ramp
    [3, 21, 8, 33], [5, 34, 8, 35],        // long A, cubby
    [5, 36, 13, 44],                       // A site
    [13, 22, 18, 25], [15, 26, 18, 37],    // window / ladder room, CT ramp
    [14, 38, 24, 45],                      // CT spawn
    [27, 9, 30, 13], [24, 14, 28, 20], [24, 21, 28, 25], [25, 26, 28, 29],   // halls: T side, upper, lower, skyfall
    [36, 9, 40, 16], [33, 17, 37, 28],     // garden / stairs, B main
    [27, 29, 41, 38], [42, 30, 45, 38],    // B yard, back / toilets
    [21, 33, 26, 36], [22, 37, 24, 37],    // connector, its link to the CT spawn
  ],
  mat: [[0, 0, 23, 20, 'brick', 30], [26, 26, 47, 47, 'plaster', 28]],
  cover: [
    [8, 38, 9, 39, 6, 'crate'], [11, 42, 12, 42, 12, 'crate'], [6, 41, 6, 41, 6, 'crate'],        // A
    [38, 33, 39, 34, 12, 'stone'], [36, 36, 36, 37, 6, 'crate'], [40, 31, 40, 31, 6, 'crate'],     // B
    [15, 11, 17, 12, 4, 'stone'], [20, 14, 20, 14, 6, 'crate'], [30, 31, 31, 31, 6, 'crate'], [5, 27, 5, 27, 6, 'crate'],
  ],
  props: [['tree', 11, 9], ['tree', 19, 9], ['tree', 38, 11], ['fountain', 33, 34], ['bench', 31, 37, 0], ['lamp', 39, 4, 0, { light: true }], ['lamp', 22, 41, 0, { light: true }], ['lamp', 14, 14, 0, { light: true }], ['lamp', 35, 25, 0, { light: true }]],
  props2: [['bench', 15, 15], ['barrels', 38, 6], ['planter', 30, 4], ['pallet', 6, 30], ['bench', 20, 42, 1], ['tree', 6, 25], ['barrel', 26, 11], ['planter', 34, 20], ['tree', 44, 36], ['barrels', 29, 36]],
  // Heights (Overpass-style): the halls and the toilets are roofed; the ladder room stands raised between the mid
  // ramp and the CT ramp.
  lift: [[13, 22, 18, 25, 4]],
  ramp: [[12, 18, 18, 21, 's', 0, 4], [15, 26, 18, 30, 'n', 0, 4]],
  roof: [[27, 9, 30, 13, 17], [24, 14, 28, 25, 17], [42, 30, 45, 38, 17], [13, 22, 18, 25, 20]],
  T: [27, 4, 39, 7], C: [15, 39, 23, 44], A: [6, 37, 12, 43], B: [37, 33, 41, 37], mid: [15, 13],
  callouts: [['T Spawn', 33, 5], ['Mid', 15, 12], ['Sidewalk', 10, 19], ['Mid Ramp', 15, 19], ['Long A', 5, 27], ['Cubby', 6, 34], ['A Site', 9, 40], ['Window Room', 15, 23], ['CT Ramp', 16, 31],
    ['CT Spawn', 19, 41], ['Upper Halls', 26, 17], ['Lower Halls', 26, 23], ['Skyfall', 26, 28], ['Garden', 38, 12], ['B Main', 35, 22], ['B Yard', 32, 32], ['B Site', 39, 35], ['Toilets', 43, 33], ['Connector', 23, 34]],
};

export const CLASSIC = { dune: () => gridMap(DUNE), oldcity: () => gridMap(OLDCITY), plaza: () => gridMap(PLAZA), hamlet: () => gridMap(HAMLET), depot: () => gridMap(DEPOT), temple: () => gridMap(TEMPLE), canal: () => gridMap(CANAL), park: () => gridMap(PARK) };
