# v48.1: Global Defensive, knives, smoke and spawns

## Knives
- **Everyone picks their own knife and its skin.** In the M menu's KNIFE & SKINS tab, any player chooses the Default knife, Butterfly Knife, Stiletto, M9 Bayonet or Karambit, and the skin on it. Darja can still put a knife or a skin on another player.
- **Skins go on knives.** One skin, worn by whichever knife you carry. Guns keep their own look.
- **Skins now show on the star knives.** The Butterfly, Stiletto, M9 and Karambit carry their own red finish, and it tinted every skin: Fade came out red and Gamma Emerald black. Now every finish shows true on the blade, and the handle stays black. With no skin, the blade is plain steel and the Karambit keeps its Ruby. Every finish was checked on every knife.
- **Knife fights work as in CS2.**
  - **Slash (left click):** every 0.4 s. It does 40, then 25 if it follows another attack, and 90 in the back.
  - **Stab (right click):** every 1.0 s. It does 65, or 180 in the back.
  - **Reach:** 64 units for the slash, 48 for the stab. The swing is wide, so a body near the crosshair counts.
  - **Backstab:** you have to be within 61.6° of the victim's back.
  - **Timing:** the hit counts the moment you click, and each attack locks both buttons for its time.
- **Keys 1–5 stay put, as in CS2:**
  - **1:** your main gun (rifle, SMG, shotgun, sniper or machine gun)
  - **2:** your pistol
  - **3:** your knife
  - **4:** grenades
  - **5:** the bomb

  Before, with a USP-S, P250, Five-SeveN, CZ75 or Tec-9, key 1 could pull out the pistol, a grenade or the bomb, and key 2 found nothing.

## Smoke
- **An HE clears smoke for about 2 seconds, as in CS2.**
  - **Where it clears:** in the middle of a cloud, the whole cloud goes; at its side, only the part near the blast, and the far side stays. It never clears through a wall.
  - **Timing:** the hole opens at once, stays open about a second, then smoke flows back in from its edge.
  - **Everyone sees the same hole:** sightlines, bots and every LAN screen. Before, the hole was too small to see from outside the cloud.

## LAN
- **Teams stay even.**
  - **Joining:** the room counted every bot twice when deciding a joiner's side, so a LAN room of 3 people and 7 bots could end up 6 vs 4. Now each joiner goes to the smaller side.
  - **Leaving:** when people left, nothing evened the sides again. Now, at each round start, bots move over whenever the sides are two or more apart, as in CS2's auto-balance. People are never moved.
  - **Map changes:** the new map's bots no longer unbalance the sides, so it's 5 vs 5 from round 1.
- **No ghost players.**
  - **Closing:** closing the window, reloading or quitting frees your seat at once.
  - **Dropped connection:** your seat is freed within 10 s.
  - **Before:** for 30 s your frozen body stayed in the match, still counted for the teams, and a quick rejoin could come back as a second copy.
- **Coming back mid-round follows CS2's rules.** Someone who leaves and returns during a live round, or arrives after a map change, watches until the next round, then plays with their money, the same as a first-time joiner. Before, a returning player could come back alive in the middle of a round.
- **What was tested:**
  - one player leaving and coming back 20 times;
  - five people joining at the same moment;
  - the host changing the map mid-match to all eight maps, with someone joining mid-round on each;
  - 5 vs 5 throughout;
  - the LAN Defuse round (plant, defuse, win) on two screens.

## Spawns
- **CS2 maps use their own spawn spots.** If a map's built-in version had been used earlier in the same session, its CS2 map reused the built-in map's spots. On a CS2 map, many of those are inside walls or under floors, so you could start under the map.
- **No spawn spot is in a crate, a wall or the map's own geometry.** Spots are at least a body's width apart, and every side has room for a full team. A full LAN round with 11 bots and 8 people puts everyone on a spot of their own. This was checked on every map, built-in and CS2.

## Smoothness
- A smoke's space is filled once when it lands, not twice.
- One more piece of grenade drawing no longer makes garbage every frame.
