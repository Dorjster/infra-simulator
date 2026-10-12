# v42: Global Defensive, maps and feel update

## Maps
- New Defuse map **Old City**: a dense old quarter. B is up the long "banana" lane, A is up the east lane or through the apartments alley. Mid is a narrow street to the CT side.
- New Defuse map **Depot**: a rail freight yard. Two staggered rows of freight cars make a long middle lane with gaps to cross through. Warehouses have back alleys to the A and B loading yards.
- Freight Yard, Old Town, Plaza and Hamlet now have props, windows, callouts and street lamps.
- Every map is checked for walkable bot routes, reachable sites, room for 10 per side and nothing floating. Bots play full matches on all of them.
- At most 4 lamp lights per map, so every map runs at the same cost.

## Players
- Terrorists wear a tan jacket, chest rig and balaclava. Counter-Terrorists wear a navy jacket, plate carrier and combat helmet. Hit boxes don't change with the look.
- Counter-Strike 1.6 characters are not included: they belong to Valve. If you import your own copy, it still replaces the models on your computer.

## Weapons and view
- 18 guns have their own models: P250, USP-S, Five-SeveN, Desert Eagle, MP9, MP7, MAC-10, UMP-45, MP5, P90, AUG, FAMAS, SG 553, Galil AR, M4A1-S, M249, XM1014 and SSG 08.
- The crosshair stays fixed at the centre. Recoil moves the view, and bullets go where the centre points.
- Crosshair editor in Settings with a live preview: style, size, thickness, gap, outline, colour, opacity, dot and dynamic spread. It is saved on your computer.
- AWP and SSG 08: the shot unscopes for the bolt.
  - **Auto re-scope** (Settings, on by default) scopes you back in afterwards. When off, right click re-scopes.
  - There is no crosshair while unscoped.
- Grenades:
  - Hold left for a long throw, right for a short underhand, or both for medium. Release to throw.
  - A quick click, switching weapons, opening a menu or leaving the window never throws.
- Inspect your weapon with **F**. The karambit twirls.
- Knife: clearer light slash and heavy stab, a slow idle sway, and no stray left hand.
- The bomb rests on your palm at the lower right and lowers to the ground while you plant.
- Moving no longer plays a lowered-gun run animation, just a small bob, like CS2.
- The gun is never cut off by a wall you stand next to.
- The buy menu shows damage per weapon (body, head, with armor) and effective range.

## Fixes
- Dying drops your best gun and clears the rest of your loadout at once: no old pistol, grenades, armor or kit on screen until the next round. Loadout changes reach every LAN player immediately.
- Bodies stand up at the start of a round without waiting for the player to move.
- The left arm comes back after switching from a knife or grenade.

## Known issues
- A single short stutter (about 60–80 ms) can still happen the first time some effects appear in a match.
