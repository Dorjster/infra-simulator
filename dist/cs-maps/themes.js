// How each classic map looks and which of its places are indoors. The geometry comes from its navigation areas and
// overview (cs-columns.js); this adds what those don't say: wall / floor / indoor materials, which named places have a
// ceiling (and how high, Hammer units above the floor), the sky. Reference versions: the CS:GO navigation meshes and
// overviews used by awpy (2023) and boltobserv (radar v4); see MODEL-SOURCES.md.
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
  train: { name: 'Train', navFootprint: true, car: 'metal-blue', wall: 'concrete', floor: 'concrete', indoorWall: 'concrete', indoorFloor: 'concrete', sky: 0xa9b8c6, sun: 0xfff2dc,
    indoor: { Tunnels: 140, Tunnel1: 140, Tunnel2: 140, LockerRoom: 140, Kitchen: 140, LadderBottom: 140, PopDog: 140, Connector: 140 } },
};
export const CS_MAP_IDS = Object.keys(THEMES);
// 'TopofMid' → 'Top of Mid', 'BombsiteA' → 'A Site', 'CTSpawn' → 'CT Spawn'.
export const calloutName = p => ({ BombsiteA: 'A Site', BombsiteB: 'B Site', TSpawn: 'T Spawn', CTSpawn: 'CT Spawn', TopofMid: 'Top of Mid', BackofB: 'Back of B', CTSideUpper: 'CT Upper', TSideUpper: 'T Upper', TSideLower: 'T Lower', SnipersNest: 'Window' }[p]
  || p.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2'));
