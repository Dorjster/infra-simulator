# Infra Simulator 52.0.1 — Global Defensive: Nuke B, CS2 gloves, knife arms, blood, doors and glass

Global Defensive only. Everyone in a LAN game should update (52.0.0 and 52.0.1 can play together, but only 52.0.1 shows gloves).

## Nuke B site walkable
- About a third of Nuke's B site (the glass floor windows in the middle) had invisible pillars from the floor to the ceiling. It came from a mistake in the map importer. The game now repairs it when it loads the map, so nothing needs re-importing, and you can walk straight across B.
- Bots aim for B's real middle and come in by B's own ramp. CTs retaking a bomb planted on B go down to it instead of standing on A above it.
- The drop from the walkway at the foot of Ramp needs a small jump over the rail, as in CS2.
- All 8 maps were checked against CS2's own player collision. No other blocked spot was found in play.

## CS2 gloves you can pick
- New **Gloves** tab: press M → LOADOUT & SKINS → Gloves. It starts with Default (agent gloves), then Sport Gloves, then Driver, Hand Wraps, Moto, Specialist, Hydra, Bloodhound and Broken Fang (94 finishes), each with CS2's picture, name, rarity and wear.
- Your gloves show on your own first-person hands, with your agent's sleeves kept, and on your body for other players. Spectators see the gloves of the player they watch.
- The pick goes to everyone over LAN and is kept through rematches, map changes and reconnects. A pick made mid-round shows from the next freeze time.
- The tab appears when the host has the gloves from their own CS2 install (tools/import-cs2-gloves.mjs). The asset pack can carry them to other computers (import-cs2-models --with-gloves). Nothing from Valve ships with the game.
- About 22 finishes made with CS2's newer glove shader have approximate colours (for example Sport Gloves Blaze).

## First-person arms
- The forearm no longer twists like a wrung towel during knife slashes and stabs (mouse 1 / mouse 2), knife and gun inspects, gun reloads and grenade throws. CS2 turns the forearm's twist bones with the hand, and so does the game now. On CT, skin no longer shows through the sleeve; on T, the wrist no longer goes thin.

## Blood
- Blood like CS2: a hit sprays blood from the body, with a bigger burst on head shots. Splats land on the wall behind the player and drops on the floor under them.
- Every player in a LAN game sees the same blood in the same places. You don't see spray from your own wounds.
- Blood clears at the start of each round and on a map change.
- Settings → Global Defensive → Blood (on by default). Turn it off and it all disappears at once.
- The game uses CS2's own blood pictures when they are imported from your CS2 install (node tools/import-cs2-blood.mjs). Without that, every computer draws the game's own blood pictures.

## Doors and glass
- No more see-through gaps round doors. The duplicate-door clean-up used to cut away the door frame too. Now it removes only the copy of the door, so frames, jambs and trims stay. Fixed on Nuke (B doors, Decon, Hut) and Cache. Nuke Ramp silo doorways no longer have a thin slit.
- Cache door: its collision now stands where the door is drawn. Before, it was turned 90°, so you could walk through the closed door while an invisible plate swung beside it.
- Overpass door: if the door is drawn lying flat, it is turned upright onto its collision when the map loads. This one has not been checked in a live game yet.
- Glass is see-through with a light tint, like CS2, on every map (Nuke B floor glass included). Before, it was drawn solid white.
- Nuke B floor glass breaks from a shot, and the clip under it keeps everyone from falling. Window panes without their own look (Dust II door windows, Mirage van, Cache Long A strips) now break from shots and knives too.
- Cache Long A doorways can be walked through standing. The glass strips round them now block only where the glass is, not with one big box over the door.

## Still open
- Three small glass panels in the middle of Nuke B sit on metal and don't break. A shot stops on the metal, probably as in CS2. B's Observation windows don't break either.
- Bots' bullets don't break glass yet. Players' shots and knives do.
