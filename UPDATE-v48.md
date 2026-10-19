# v48: Global Defensive, utility and skins

## Grenades fly like CS2's
- **Grenades bounce off CS2's own surfaces.** Each CS2 map now carries its real grenade collision: walls, roofs, rails, ledges, window frames and corners as CS2 has them. Before, grenades met a rough 8-unit grid: thin walls could be missing, slanted roofs became steps, and a bounce went whichever way the steps pointed. Thrown from every spawn and bomb site in 80 directions and 3 strengths, 6–35 % of throws went through a wall or roof somewhere, depending on the map. Now none do, on any map.
- **Throw angles fixed.** v47 had the aim's up and down scaling backwards, so every throw aimed above or below level went off course: aiming 45° up threw 60° up, and straight up threw over your head behind you. Now it's Source's, as CS2 keeps it: 45° up throws 50° up, 45° down throws 40° down, and straight up or down throws straight up or down. A level aim still throws 10° up.
- **Lineups land where they do in CS2.** CS2's throw angles and speeds, now off the same surfaces, with Source's exact arc under gravity whatever the frame rate. A bounce leaves at the angle it came in with 45 % of its speed, and a grenade stops on a floor below 30 units a second, as in CS2.
- **Grenades bounce off players** at a third of their usual bounce, teammates too, never off whoever threw them.
- **Pop flashes work as in CS2.** A flash counts as seen when the line from it to your eyes is clear of CS2's real surfaces (its light passes fences, grates and glass). If not, light off points above and beside it can still catch you a little, as CS works it out. How much you're blinded depends on where you look: CS's own limits (looking at it, to the side, away).
- **Smooth grenades for every player.** On LAN, each computer now flies every grenade itself with the same physics, from the host's latest word on it. It's no longer drawn trailing the host's updates, and bounces happen where they happen. Measured: every screen within about 2 units of the host's grenade on average.
- **Pots, cans and crates stop at CS2's real walls** too, not the rough grid.

## Skins
- **Other players see your skin.** The skin was only ever on your own gun: everyone else saw the plain one. Now your finish, wear, pattern and stickers are on the gun in your hands for everyone, and change when you change them.
- **Darja gives skins.** In the M menu's KNIFE & SKINS tab, Darja can put the skin she's made on any player's gun ("Give this skin", or "Give the default look"). The room checks it's her. A StatTrak™ count stays the player's own.
- **The M menu has tabs**: TEAM, KNIFE & SKINS and (for the host) HOST. It used to be taller than the window, so the bottom of it (the host's match rules) couldn't be reached. Every tab now fits, and scrolls if a window is very small.

## Settings
- **Sun light** (Settings → Graphics, 30–150 %): how strongly the sun shines on a CS2 map. Sunlit walls and floors get dimmer or brighter; the shade stays as it is. Brightness still sets the whole picture.

## Smoothness
- **No stutter the first time something is seen.** A knocked crate, the first explosion's sparks and shockwave, a name tag: each used to build its shader on the spot. Now every shader the match uses is built behind the loading screen, for the lights, fog, shadows and post-processing the match actually has.

## Smaller downloads
- **The imported CS2 assets take a third less space**, with nothing lost: 1.8 GB down to 1.2 GB. The map looks are packed with meshopt compression, which keeps every vertex exactly and is unpacked in a moment when a map loads. Each light map is stored as lossless WebP, with the sun's reach as its own small picture. Pixel for pixel, every map looks exactly as before.
- **Asset packs are smaller too**: map looks and first-person models are compressed inside the pack. The pack size limit for importing went from 2 GB to 3.5 GB.
- The CS2 map files grew (21–57 MB each) with their grenade collision. A new asset pack carries everything to your other computers.
