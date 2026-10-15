# v46: Global Defensive, the CS2 maps, mechanics and smoothness update

## CS2's own maps (on a computer that has Counter-Strike 2's files)
- Dust II, Mirage, Inferno, Nuke, Cache, Anubis, Ancient and Overpass can be converted from your own Counter-Strike 2 files (Steam depot) into the game. Their walls, floors and props are CS2's, and their collision is CS2's own.
  - Nothing of Valve's is shipped. The converted maps stay on the computer that made them (`user-maps/`, `user-assets/`), and the room sends them to the players in it.
- **CS2's baked lighting:** Dust II, Mirage, Inferno, Nuke, Cache and Anubis are lit by CS2's own light, with its sun shadows, bounce light and corner shading. Props, signs and carpets sit in their shadows instead of floating.
  - Ancient and Overpass get their CS2 look once the rest of their files are downloaded. Until then they are drawn plainly, with their CS2 collision.
- **Doors:** open and close them with E. An HE grenade breaks them.
- **Breakables:** glass, vents and grates break.
- **Ladders:** every ladder can be climbed from its foot to its top.
- **Walls and map edges:** you can't walk into a wall or out of the map, and you can't see into the map from inside a wall.
- **Footsteps:** they sound like the floor you walk on (concrete, sand, metal, wood or carpet), going by the materials CS2 draws.
- **Water:** Anubis's canal and coast have water.
- **Bots:** they play every map, open doors in their way, and plant and defuse.

## Smoothness
- Much less work for the GPU on the CS2 maps. A Dust II match with 9 bots runs at about 125 fps on High at full Retina size, with no stutters.
- The automatic resolution now follows the GPU's real load and changes rarely. Before, it resized the picture every half second, and each resize caused a stutter.
- Shaders and first-person models load during menus, loading screens and buy time, never in the middle of play.

## Grenades (CS2 style)
- **Smoke:** a volume that fills the space it pops in. It spreads along the floor, pours round corners and down corridors, never passes through walls, and billows. An HE blast opens a hole in it for a moment.
- **Molotov:** the fire spreads out from where it breaks, flows down stairs and slopes, and dies out patch by patch.
  - Damage is CS2's: 1 on the first hit, one more each hit up to 8 (40 a second). Armor doesn't help, and two fires overlapping both burn.
  - A smoke reaching the flames puts the whole fire out. A molotov thrown into smoke fizzles.
- **Bounces:** grenades bounce off walls and floors like CS2's. There is no path line in a match (practice mode still shows it).

## Knives
- Choose your knife in the M menu: Default, ★ Butterfly Knife, ★ Stiletto Knife or ★ M9 Bayonet. Darja keeps her ★ Karambit | Ruby.
- **Darja** can also equip any knife, the Karambit included, on any player in the room, from the M menu.
- Every chosen knife is a red Doppler Ruby with a black handle.
- Each knife is CS2's own model with CS2's own first-person animations: draw, idle, swings and inspect. The Butterfly flips open.

## Players and HUD
- Players and bots are CS2's agents at their true size, with CS2's third-person animations.
- **Buy menu:** CS2's layout and icons, with undo. It can't be opened after buy time or outside your spawn.
- **Bomb:** only "Bomb has been planted" is shown, as in CS2. The bomb's plant animation plays only on a site.
- **Field of view:** CS2's own (90° across a 4:3 screen) unless you choose your own in Settings.
