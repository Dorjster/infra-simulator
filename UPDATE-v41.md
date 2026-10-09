# v41: Global Defensive, competitive update

## Shooting
- The first shot goes exactly through the crosshair: hits and bullet holes use the eye ray; tracers start at the gun.
- Each automatic gun has its own learnable spray pattern. The recoil crosshair shows where the next bullet goes, and the view recovers when you stop firing.
- Moving, jumping and landing cost accuracy. Standing still or counter-strafing is exact.
- 23 guns with CS2-style stats, team guns and prices. New: USP-S, P250, Five-SeveN, MAC-10, MP9, MP7, UMP-45, P90, XM1014, Galil AR, FAMAS, M4A1-S, SG 553, AUG, SSG 08.
- One headshot from any gun kills, even through a helmet. Kevlar and helmets reduce body damage.
- Wallbangs: bullets go through crates and thin walls, with less damage. The host recalculates it.
- Finite ammo checked by the host: magazine plus reserve. A reload only moves rounds. Guns refill at each new round and respawn.
- Right click scopes (AWP and SSG 08 have two levels; AUG and SG 553 have one). Left click fires while scoped.
- Knife: left click is a quick slash, right click a heavy stab. Backstabs do more damage. Range, facing and walls are checked.

## Buying, drops, HUD
- Buying a second gun drops the first, with its rounds.
- The B menu shows weapon info and a "Nearby dropped weapons" list. E picks up the gun you look at.
- B opens and closes the buy menu, and Escape closes it.
- New HUD: health, armor, magazine and reserve, fire mode, grenades.
- Radar: rotating or fixed (N). Enemies appear only when seen or heard.
- Two-team scoreboard (Tab) with ping, kills, deaths, assists and money.
- No name tags over enemies, and none in Deathmatch.

## Grenades
- Hold to pull the pin and release to throw. Left click alone is a full throw, right click alone a short underhand throw, both together a medium throw. A preview arc shows where it will land.
- Full throws cross the map. Smoke covers about 4× the area and blocks sight. Molotov fire covers about 4× the area and stops at walls. Flashbangs check line of sight in 3D and are blocked by smoke.

## Rounds and LAN
- Fixed: Defuse sometimes started as Deathmatch when hosting. The start screen now waits for the reconnect and confirms the mode and map.
- Hosting opens a 2-minute lobby with a ready flag and team choice. The host can start early or change the map, bots and difficulty.
- M opens the team menu. Changes apply at the next round, or at once in the lobby.
- Every player gets their own spawn spot. Nobody lies dead at the start of a round.
- Plant and defuse finish on the first attempt.
- The whole map is drawn: the draw distance is longer and the haze lighter.
- Windows: Ctrl+W and Ctrl+R no longer close or reload the game. Closing the window during a match asks first.

## Look
- Reloads stay on screen. Every gun sits in the hands at the right size.
- The left hand rests at the bottom-left corner.
- Dune is rebuilt as a sandstone town with tunnels, mid doors, a catwalk, long doors, windows, awnings, signs, lamps, palms and props.

## Not finished / known
- Plaza, Hamlet, Freight Yard and Old Town keep their layouts. They have no new props yet.
- Bots are deadlier, rarely defuse, and still need a pass.
- Some new guns reuse a base model with a different look: SMGs on the GreaseGun and Suomi, rifles on the AK and M4.
- CS 1.6 player models stay local imports. They aren't shipped.
- There are occasional single frames of 60–130 ms when an effect first appears.
- Not tested on Windows.
