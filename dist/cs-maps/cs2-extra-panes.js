// Glass the importer left unbreakable (Counter-Strike 2 map files; the files stay as they are — the loader adds these):
// on Nuke's B, the floor panels it judged "backed" (metal 4.8 units under them, or a metal plate's collision just over
// them: tools/maps/import-cs2-map.mjs glass decisions) and so made part of the world, and the Observation windows over B
// (glass in the look, no glass collision at all: bullets went through them, nothing broke). In CS2 every one of them
// breaks; the v52.0.1 report asked for B's glass to break like the vent grille. Each becomes a breakable glass pane
// (cs2-map.js: a func_breakable with a box, health 1, its look the look's glass in its box — cs2-render.js pane claims).
// Each: [minX minY minZ maxX maxY maxZ] (Hammer units) — a floor panel's box sits on its glass, a half unit thick (the
// world's own stretch under it stays: the floor holds, broken or not), a panel under a metal plate's collision reaches
// over the plate (a shot at the glass there meets the pane first), a window stands in its glass.
export default {
  nuke: [
    // B's floor panels over metal (17)
    [-293, -980, -772, -233, -918, -771.5], [-293, -916, -772, -233, -854, -771.5], [-293, -852, -772, -233, -790, -771.5], [-293, -788, -772, -233, -726, -771.5],
    [-293, -724, -772, -233, -696, -771.5], [-229, -892, -772, -169, -830, -771.5], [-229, -764, -772, -169, -702, -771.5], [-229, -828, -772, -169, -766, -771.5],
    [-101, -732, -772, -41, -696, -771.5], [-165, -732, -772, -105, -696, -771.5], [-38, -724, -772, 20, -696, -771.5], [67, -780, -772, 127, -718, -771.5],
    [67, -716, -772, 127, -696, -771.5], [131, -780, -772, 191, -718, -771.5], [131, -716, -772, 191, -696, -771.5], [259, -740, -772, 319, -696, -771.5],
    [195, -748, -772, 255, -696, -771.5],
    // B's floor panels under a metal plate's collision (3 panels: the first two layers of glass, one pane)
    [579, -764, -774.5, 606, -744, -763.5], [643, -828, -772.5, 703, -783.3, -765],
    // B's Observation windows (x 1038, over B)
    [1037.5, -511, -598, 1039.5, -418, -522], [1037.5, -606, -598, 1039.5, -513, -522],
  ],
};
