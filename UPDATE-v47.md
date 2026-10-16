# v47: Global Defensive, the CS2 mechanics update

## LAN
- **Every player keeps their own name.** A second player who joins with a name already in the room becomes "Name 2". Before, two players with one name shared a team, a spawn and a wallet: they spawned on top of each other, sometimes on the wrong side, and one couldn't buy.
- **Reconnecting keeps your seat.** A reloaded page takes back its old seat. A guest who types the host's name never takes the host's seat.
- **The loading screen shows progress.** While a CS2 map downloads from the host it says which file and how far ("Downloading the map's look · 45%"), so a slow Wi-Fi download no longer looks like a frozen game.
- Buying, spawns and Darja's knife for another player were checked over LAN: each player spawns at their own spot on their own side, buys by the round's rules, and gets the knife Darja equips.

## Smoothness
- **No stutter at the start of a round.** The first-person arms for every weapon now load behind the map's loading screen. They used to load during freeze and buy time, which cost a 60–90 ms stall every half second. Every map now runs at 60 fps on a MacBook Air (Retina, High, 9 bots), with no frame over 19 ms.
- **No stutter the first time something is seen.** The first time you took out the C4, and when another player's model first came into the sun's shadows, the game built a shader on the spot (a 70–220 ms freeze). These are now built behind the loading screen or in the background just after it, for the lights, shadows and post-processing the match actually uses.
- **The sun shadows cost a sixth as much** of the processor's time. They are drawn 30 times a second instead of 60, and only from what moves (players, doors, props); the map's own shadows are CS2's baked ones. The game no longer works out every player's and gun's shaders again twice a frame.
- **Maps are drawn in far fewer pieces.** Every wall, floor and pot used to be drawn separately each frame (about 1,230 pieces on Inferno). Fixed surfaces are now merged by material, and props are merged while they stand still, so Inferno draws about 460 pieces and Overpass about 500. The maps look the same. A prop you push, shoot or break is drawn on its own until the next round.
- **The resolution stays sharp.** On Macs whose graphics chip stops reporting its timings, the automatic resolution used to drop and never come back. It now follows how many frames are late, comes back up when they aren't, and doesn't lower the resolution when the processor, not the picture, is what's slow.

## Other players
- **Their guns stay in their hands.** Walking, running and crouch-walking, another player's gun used to float off their hands, up to a body's width away at a run, and their chest could turn round while they walked. The gun now rides the right hand exactly as CS2's own hold animation has it, and the chest keeps the hold's pose over the walking legs. Checked for every gun, standing, walking, running, crouched and crouch-walking, facing every way: the muzzle points where the player faces (within 1.5°) and the grip never leaves the hand.
- **They cast sun shadows** on a CS2 map (from the Medium graphics mode up), and so do the pots, cans and doors you move. The map's own shadows stay CS2's baked ones.

## Rounds
- **Play goes on after a round is won**, as in CS2: until the next round you can shoot, stab and throw, and bots fight on. After the match ends, play stops.

## Maps (CS2's, converted on your computer)
- **Pots, cans, bottles, stools and cinder blocks no longer stop you.** They were solid blocks. Now you push them out of the way, shots and HE grenades knock them about, and pots and bottles shatter when shot. Each new round puts them back.
  - Mirage alone had 81 of them. Before, 77 blocked your way; now only those standing on ledges against a wall are in the way.
- **No more invisible walls from decoration.** Map pieces CS2 marks as never solid (some trim and frames on Mirage, Nuke, Inferno and Overpass) are now only seen. Pieces switched off for other modes stay out.
- **Mirage's sheet-metal vent covers and its shutter break** with one bullet, a knife or a grenade, as in CS2.
- **Bullets pass player clips and fences, as in CS2.** Walls made only to stop players (Mirage's mid window, smoothing round corners) and chain-link fences and grates let bullets, sight and smoke through.
- **Wallbangs depend on the material.** Every wall carries CS2's material: wood and crates are easy to shoot through, plaster and sheet metal less so, concrete and stone only when thin.
- **CS2's own colours and light on every map.** Each map now uses the grading CS2 gives it: its tone curve and its colour lookup table, taken from your CS2 download, at the exposure that matches CS2's own footage of that map (the tour and map videos in your Downloads). Sunlit walls are as bright and warm as in CS2. Mirage's brightest walls measure 216 of 255 against CS2's 213, Overpass 149 against 150, and Anubis matches CS2's pictures within a few levels in shade, middle tones and highlights.
- **CS2's overlays look like CS2's.** Graffiti, signs, logos, stains, tyre marks and road paint used to be drawn as solid sheets over walls and floors. Overpass's graffiti sat on a white board, Nuke's Cedar Creek logo was a dark rectangle, and two sheets flickered where they met. Now they're painted onto the surface as CS2 draws them: blended by their own transparency, cut out, or darkening and lightening the surface underneath (tyre marks, grime, stains).
- **CS2's skies.** Each map has its own CS2 sky (Dust II's sun glow, Inferno's clouds and hills, Cache's clouds), graded like the map, and the distance haze takes the sky's colour.
- **Inferno, Nuke and Cache keep every texture.** Their worlds had been taken from CS2 before your download was complete, so some walls had no texture: Inferno's white plaster facades were flat white. They are now taken again from the full download.
- **The sun comes from where CS2's does.** Each map's sun direction is fitted to CS2's own baked shadows. Before, it came from the wrong side and too high on every map.
- **No more thin white lines round shadows.** Every shadow's edge on walls and floors had a white outline (the light maps were saved wrongly at the shadow edges). The light maps are now also stored at CS2's full size, so props and edges no longer get blotchy light.
- **Ancient and Overpass have their CS2 look and light** like the other maps.
- **No falling out of the maps.** Every reachable spot of every map was walked again, with new checks: no drop of 400 units or more, and never off the map's CS2 radar.
  - Anubis: walking off the end of the canal bed dropped you 500 units under the map, and you could jump the boat at the CT canal and wander out over the river and the sand round the map. Both are closed. The play space is now bounded by CS2's own radar of each map, and water deeper than your eyes can't be waded into.
  - Mirage: a slanted wall in Side Alley could be walked through into the inside of a building. Thin slanted walls are now solid along their whole length on every map.
  - Collision floors with nothing drawn on or under them are filled, so the game never shows sky through a floor you can stand on.
- After converting again with the full CS2 download, every map's look, collision, doors, ladders and breakables were re-checked.

## Grenades, exactly as CS2 throws them
- **Throw angles match CS2's,** so lineups land where they do in CS2. Looking down is scaled by 80/90 and looking up by 100/90 (before, these were swapped).
- Grenades leave **22 units in front of you**, as in CS2 (never through a wall in front of you).
- **CS2's fuses:**
  - HE and flashbang: 1.5 s after the throw.
  - Smoke: once it lies still, 1.5 s at the earliest.
  - Molotov: when it hits a floor, or after 2 s in the air. Higher than about 128 units above the ground it bursts there with no fire.
- **Glass:** a grenade thrown into a pane breaks it, loses its speed and drops through.
- **Smoke looks and sizes like CS2's.** The cloud is CS2's size again (144 units round, about 150 high; it had grown to twice as wide), a grey heap of round billows lit from above and dark inside and underneath, with no visible layers. It still pours along corridors and round corners the way it went.
- **Bullet tunnels in smoke:** every shot through a smoke (yours and everyone else's) clears a narrow tunnel along its path, which fills in again within about a second.

## Shooting and moving
- **Tagging:** a hit slows you to half your speed at once, and you're back to full about 1.25 s later, as in CS. Running across a sightline under fire is slow.
- **Dropped guns fly.** A gun you drop with G is tossed ahead with your run, bounces and settles; a fallen player's gun drops from their hands. Everyone sees the same flight, and it lies where it stopped.
- **Viewmodel lag:** when you turn, your weapon trails the view a touch and springs back, about 2° at most.

## Sound
- **Every weapon's own CS2 sounds, at the very moment CS2 plays them.** Reloads (magazine out, magazine slide, magazine in, bolt or slide), draws, inspects, knife swings, a grenade's pin and throw, and the AWP's and Nova's bolt and pump after a shot. They're taken from CS2's own animations (474 sounds for 38 weapons) and follow the animation if it plays longer or shorter. A reload broken off by switching weapons goes quiet.
  - Other players' reloads sound the same, from where they stand.
- **Sound takes time to travel** (343 m/s). A shot across the map is heard a moment after.
- **Walls muffle by what they're made of.** Wood barely; brick, concrete and steel more, and thicker walls more again.

## Gloves
- **Your Driver Gloves (Garden) on every weapon.** The first-person hands now wear the Driver Gloves you downloaded, on every gun, knife, grenade and the bomb, built on CS2's own Driver Gloves.
- **Both hands are painted.** CS2 paints one glove's picture and mirrors it onto the other hand; the other hand used to come out plain (the Sport Gloves' right hand was grey).
- When two downloads are the same kind of thing (two pairs of gloves, a gun downloaded twice), the newest one is used.

## Weapon skins
- Choose skins in the M menu (**SKINS**) for every gun and your knife:
  - **15 finishes:** Fade, Marble Fade, Doppler Ruby, Sapphire and Emerald, Case Hardened, Crimson Web, Tiger Tooth, Asiimov, Hex Neon, Desert and Forest Camo, Redline, Gold Arabesque.
  - **Wear float** from 0 (Factory New) to 1 (Battle-Scarred): scratches show the metal.
  - **Pattern seed** (1–1000): moves the pattern on the gun.
  - **StatTrak™:** the gun counts your kills with it.
  - **Name tag.**
  - **Stickers:** up to 5 on a rifle and 4 on a pistol, placed anywhere, sized, turned and worn.
- The HUD shows the skin's full name, as CS2 does ("STATTRAK™ AK-47 | FADE (FACTORY NEW) · 12 KILLS"). Other players see your skin on the gun in your hands.
- The host checks every skin it is sent and refuses impossible ones (a wear that isn't a number between 0 and 1, a seed outside 1–1000, two stickers in one slot, too many stickers). A StatTrak™ count can only be earned, never set.
- The finishes and stickers are this game's own; no Valve artwork is shipped.

## Known
- Ancient's sky is a plain gradient: CS2 draws Ancient's sky as part of its 3D skybox, which isn't converted.
- Palm and tree leaves are a little lighter and brighter green than in CS2 (CS2 shades foliage with its own darkening and translucency).
