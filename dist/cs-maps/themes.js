// How each classic map looks and which of its places are indoors. The geometry comes from its navigation areas and
// overview (cs-columns.js); this adds what those don't say: wall / floor / indoor materials, which named places have a
// ceiling (and how high, Hammer units above the floor), the sky. Reference versions: the CS:GO navigation meshes and
// overviews from awpy (2023, MIT) and Lexogrine (csgo-react-hud, MIT); see dist/cs-maps/LICENSES.md.
export const THEMES = {
  dust2: { name: 'Dust II', wall: 'adobe', floor: 'sand', indoorWall: 'tunnel', indoorFloor: 'tunnelfloor', sky: 0xbcd6ec, sun: 0xfff0d0,
    indoor: { UpperTunnel: 150, LowerTunnel: 130, TunnelStairs: 150, UnderA: 120, Hole: 120 } },
  mirage: { name: 'Mirage', wall: 'plaster', floor: 'stone', indoorWall: 'tunnel', indoorFloor: 'tunnelfloor', sky: 0xa9c7e0, sun: 0xffe7c2,
    indoor: { Apartments: 140, PalaceInterior: 150, House: 140, Shop: 150, Tunnel: 128, TunnelStairs: 140, Ladder: 160, SnipersNest: 128, Kitchen: 140 } },
  inferno: { name: 'Inferno', wall: 'plaster', floor: 'stone', indoorWall: 'tunnel', indoorFloor: 'tunnelfloor', sky: 0xc4d6e4, sun: 0xffe9c8,
    indoor: { Apartments: 140, Upstairs: 140, Kitchen: 140, Library: 150, Underpass: 128, Balcony: 0 } },
  nuke: { name: 'Nuke', wall: 'concrete', floor: 'concrete', indoorWall: 'concrete', indoorFloor: 'concrete', sky: 0xa7b6c4, sun: 0xfff2dc,
    indoor: { Lobby: 180, Hut: 140, Squeaky: 160, Ramp: 170, Decon: 150, Control: 150, Vending: 150, LockerRoom: 140, Admin: 150, Tunnels: 130, Secret: 140, Vents: 64, Hell: 150,
      BombsiteA: 420, Heaven: 120, Rafters: 120, Catwalk: 260, Trophy: 150, Mini: 160, Observation: 140, BombsiteB: 220 } },
  cache: { name: 'Cache', wall: 'concrete', floor: 'concrete', indoorWall: 'concrete', indoorFloor: 'concrete', sky: 0xb4c4d0, sun: 0xfff2dc,
    indoor: { Squeaky: 150, StorageRoom: 150, Ducts: 64, LongHall: 150, Garage: 170, Warehouse: 200, Window: 140 } },
  anubis: { name: 'Anubis', wall: 'sand', floor: 'stone', indoorWall: 'tunnel', indoorFloor: 'tunnelfloor', sky: 0xbfd8ea, sun: 0xfff1d6,
    indoor: { PalaceInterior: 160, Tunnel: 140, LowerTunnel: 130, TunnelStairs: 150, Connector: 150, Walkway: 0 } },
  ancient: { name: 'Ancient', wall: 'stone', floor: 'stone', indoorWall: 'tunnel', indoorFloor: 'tunnelfloor', sky: 0xb7cfc0, sun: 0xfff0d6,
    indoor: { House: 150, MainHall: 180, SideHall: 150, BackHall: 150, Tunnel: 140 } },
  // Only from a map file (Counter-Strike 2's, tools/maps/import-cs2-map.mjs): no built-in version — no CS:GO navigation
  // data; its places are CS2's own (bsp-map.js). Listed once the room has the file.
  overpass: { name: 'Overpass', fileOnly: true, wall: 'concrete', floor: 'concrete', indoorWall: 'concrete', indoorFloor: 'concrete', sky: 0xb2c6d6, sun: 0xfff2dc,
    indoor: { Tunnels: 130, Restroom: 140, StorageRoom: 140, Connector: 150, UnderA: 130, Pipe: 72 } },
};
// The look of the outdoor walls, from reference screenshots of each map: palette (each block of buildings takes one
// colour — a multiplier on the wall texture), band (a painted stripe, Hammer units above the wall's foot: Nuke's blue)
// and cap (the ledge along a wall's top: material, height and how far it sticks out, Hammer units; Inferno's roof tiles).
const LOOKS = {
  dust2: { crate: 'crate', palette: [[1, 1, 1], [1.04, .96, .86], [.9, .8, .66], [1.06, 1.02, .94]], cap: { h: 7, out: 3, shade: .8 } },
  mirage: { crate: 'crate', palette: [[1.04, 1.01, .95], [1, .94, .84], [.96, .88, .76], [1.06, 1.04, 1]], cap: { h: 6, out: 3, shade: .78 } },
  inferno: { crate: 'crate-dark', palette: [[1.04, 1, .92], [1.08, .76, .56], [1.06, .78, .74], [1.04, .9, .6], [.96, .92, .86]], cap: { mat: 'roof', h: 9, out: 6, shade: .95 } },
  nuke: { crate: 'crate-metal', palette: [[1.1, 1.1, 1.1], [1.02, 1.04, 1.06]], band: { from: 64, to: 80, color: [.42, .62, .92] }, cap: { h: 5, out: 2, shade: .85 } },
  cache: { crate: 'crate-blue', palette: [[1, 1, 1], [.9, .92, .9], [.96, 1, .94], [1.04, 1, .96]], cap: { h: 6, out: 2, shade: .78 } },
  anubis: { crate: 'stoneblock', palette: [[1, 1, 1], [1.04, .96, .84], [.92, .86, .74]], cap: { h: 8, out: 3, shade: .8 } },
  ancient: { crate: 'fieldblock', wall: 'fieldstone', palette: [[.92, .96, .86], [.86, .92, .8], [1, 1, .94]], cap: { h: 8, out: 2, shade: .74 } },
  overpass: { crate: 'crate-metal', palette: [[1, 1, 1], [.94, .96, .98], [1.02, 1, .96]], cap: { h: 5, out: 2, shade: .82 } },
};
for (const [id, L] of Object.entries(LOOKS)) Object.assign(THEMES[id], L);
// The classic maps built in (from their CS:GO navigation data), and every Defuse map a map file can bring (those and the
// file-only ones).
export const CS_MAP_IDS = Object.keys(THEMES).filter(id => !THEMES[id].fileOnly), FILE_MAP_IDS = Object.keys(THEMES);
// 'TopofMid' → 'Top of Mid', 'BombsiteA' → 'A Site', 'CTSpawn' → 'CT Spawn'.
export const calloutName = p => ({ BombsiteA: 'A Site', BombsiteB: 'B Site', TSpawn: 'T Spawn', CTSpawn: 'CT Spawn', TopofMid: 'Top of Mid', BackofA: 'Back of A', BackofB: 'Back of B', CTSideUpper: 'CT Upper', TSideUpper: 'T Upper', TSideLower: 'T Lower', SnipersNest: 'Window' }[p]
  || p.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2'));
