# v49: Global Defensive, smoother play, maps, ladders and Nuke's vent

## Smoother movement
- **Other players and bots now move evenly on your screen.** The game already ran at 60 fps, but people moved in small jerks. Your own movement was already even.
  - **Bots:** a bot's position was stamped with the moment it was sent out, not the moment it moved. Between the room's updates, a standing bot got a later time, so on screen it stopped and then lurched. Each position now carries the moment it was made, and bots move by the time that really passed.
  - **Everyone:** other players are placed on your display's own frame beat. Their clock eases into step instead of jumping.
  - **Animations:** legs and arms move every frame out to about 1,000 units, across most fights. Before, anyone past about 450 units animated at 30 fps.
- **Measured:** bots' frame-to-frame speed changes dropped by 61% on average. For another person running over LAN, the worst 10% of frames went from 8–29% speed swings to under 2%.

## Maps
- **No invisible walls.** Two of the map converter's rules made solid blocks where CS2 has open floor:
  - **Dry land beside water** was filled in as if it were deep water. That was Ancient's T to B main; it also hit other spots on Ancient, Anubis, Nuke, Inferno and Overpass.
  - **Real floors** with nothing drawn under them (a roof, a ledge, a box) became pillars up to the sky.

  All eight CS2 maps are rebuilt. Every bot route was walked from both spawns to both sites on every map, and a walk over 27,500 spots found no holes, falls or stuck places.
- **Every ladder lets you off at the top.** At the top, walk forward over the lip, or step sideways or back where the ladder comes up through a shaft, as in CS2. Before, you bounced at the top of 8 of the 10 ladders:
  - the ledge you step onto had been cleared away with the ladder's rungs;
  - on Nuke's roof, a block stood on the landing;
  - CS2's clip over a ladder's top held you in place.
- **Nuke's doors open on screen.** Doors and breakables only updated while you were moving. If you were dead, spectating or in a menu, an open door stayed drawn shut, so you couldn't see through it. They now update every frame.

## Nuke's vent
- **The vent works both ways.**
  - **Down from A:** the slatted grille on A's vent box (where the vent ladder comes out) was a solid wall for good. Now it breaks: one knife hit, a couple of shots or an HE. Then walk in, take the ladder down to the duct and on to the tunnels.
  - **Up from the tunnels:** crouch-jump into the duct, walk to the ladder and climb out onto A through the broken grille.
  - **Grille whole:** it keeps you out, as in CS2.
- **Fixed on the way:**
  - The vent ladder's foot had a leftover stub of its rails, too high to step onto.
  - Its back wall was missing at duct level, so you could fall through under the map.

## LAN
- **No more ghosts.** While you're dead your camera follows others, but your body stays where you fell. At the next round everyone sees you at your new spawn, never where you ended the last round. This was tested on all eight maps.

## Sounds
- **Quieter overall:** the mix no longer pushes every sound up. Each gun recording is evened out, and the Negev is about half as loud.
- **Planting is heard around the bomb:** the case arming, then the keypad beeps, from where it's planted.
- **Defusing is heard close to the bomb:** its snips and clicks.
- **Footsteps come from where people are.** They're louder close and fade with distance, and you hear their direction. Walking with Shift is silent, as in CS2. Before, another player's walk was heard like a run.

## Smoke
- **Smokes are 30% bigger**, wider and taller.

## For hosts
- The CS2 maps changed. Import the new asset pack, **Infra Simulator Assets v49.zip**, on the computer that hosts; players who join get the maps from the host.
