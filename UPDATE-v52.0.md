# Infra Simulator 52.0.0 — Global Defensive: shooting, holds, skins, radar, sounds, maps and smoothness

Global Defensive only; the other modes are unchanged. Everyone in a LAN game needs 52: a 51 page joining a 52 host is asked to reload.

Some looks and sounds come from **your own Counter-Strike 2 install** and are never shipped with the game: the CS2 agents and their holds, the CS2 guns and grenades (incendiary, decoy, AUG, molotov), CS2 gun and knife finishes, the CS2 radar pictures, the round-start radio and round-end music. Without them the game uses its built-in models, finishes, radar and sounds, as before.

## Shooting
- Guns fire at CS2's own rate at any frame rate. A quick click right after the gun is ready no longer fires early, and the host no longer throws such shots away as "too fast".
- Accuracy, spread, recovery and recoil come from CS2's weapon data: standing, crouching, moving, jumping and landing all behave as in CS2. Spray recovery goes back in a straight line. Scoped sensitivity and zoom match CS2.
- The host checks every shot the way you fired it (same spread, same recoil) against the bodies where you saw them, through the walls the bullet really crossed. A head is a head and a miss beside it is a miss. Each shotgun pellet counts on its own.
- Counter-strafing and flick shots are no longer refused. Your hits keep counting after a page reload or rejoin.
- Being shot punches your aim (less with armor). Shotguns reload shell by shell. An empty pistol clicks once per press.

## Models and how players hold them
- Other players hold every gun, knife and grenade the way CS2's agents do: the muzzle within 2 cm of where CS2 puts it, both hands on the gun. The AUG now sits in both fists (it hung about 14 cm off the hands), and star knives sit in the palm.
- New CS2 models: the incendiary, the decoy and the AUG in first and third person, and CS2's molotov bottle in third person. Landed fire grenades disappear when the fire starts.
- First-person muzzle flashes and tracers start at the barrel.
- Dropped guns lie flat on the floor and never in a wall. You pick up a thrown gun when it lands (E can still catch one in the air, as in CS2). A dropped bomb lands on your side of the wall, on your floor.

## Gloves and arms
- Your first-person arms are now lit and coloured like the gun next to them (same light, same map colour grading) and have their own reflections; the T forearm no longer burns out white.
- New tool for your own CS2 install: `tools/import-cs2-gloves.mjs` imports CS2's 8 glove types and their 94 finishes. **Gloves are not selectable in the game yet**; this release only prepares them.

## Skins
- CS2 gun and knife finishes from your own CS2 install, on all 27 guns and the star knives, in first person, on other players and on dropped guns (a dropped gun keeps its owner's skin, as in CS2). Without the install the built-in finishes are used.
- New LOADOUT & SKINS tab in the M menu: every weapon in a list, finishes as cards with rarity colours, search and rarity filter, and a detail panel with wear, pattern seed, StatTrak, name tag, Equip / Clear / Clear all. A pick made during a live round applies from the next round.
- Knife handles stay black. With no skin on, the karambit is plain steel and is now called "★ Karambit"; the Ruby is a Doppler finish in the menu.
- Skin pictures are loaded and sent to the graphics card only outside the fight (freeze time, buy time, warmup, while dead), never mid-round.
- Skins have their own small LAN message instead of riding in every world update (1.5 KB with 10 fully skinned players).
- An asset pack made with CS2 finishes now installs them in the desktop app too.

## Radar and interface
- The radar uses CS2's own overview pictures for each map and looks like CS2's: square panel, CS2 teammate colours and numbers, your view cone. Nuke, Train and Vertigo show their lower floors.
- CS2's five radar options in Settings → Global Defensive: always centred, rotate, HUD size, map zoom and the Tab map's size.
- The radar shows enemies only while you or a living teammate can see them (shut doors block, glass doesn't), then their last seen spot for 2 seconds.
- Spectating while dead is first person only, as CS2's in-eye view: you see your teammate's own view model, his aim and his crouch. Left and right click switch teammates; Space does nothing.
- The Esc menu stops your keys behind it; resuming always closes it. Alt/Cmd+Tab lets go of the trigger, defuse and plant. Push-to-talk keeps working while you buy. "Connection lost · Reconnecting" banner; warmup shows its countdown.

## Maps
- Other modes' walls, doors and props (Wingman, Retakes) are gone from the competitive maps: **Nuke's Ramp and the Outside → Secret way are open again** (they looked shut behind doors that weren't there), Overpass's 2v2 walls and Inferno's barricades are gone. Mirage's intact shutter keeps its top.
- Spawns follow CS2's own priority order: the first five of each team spawn where CS2 puts them, and nobody spawns in Nuke's Secret or on mid any more.

## Jump and crouch
- Jumping off a landing is lower and repeated jumps tire you, as in CS2 (stamina). Crouch-walking from a stop gets up to speed at once (it took about 2.5 s with the knife).
- Checked against 30 famous jump spots on all 8 maps (Dust II B box, Mirage window box, Inferno A boxes, Nuke CT box, …): a plain jump or a crouch-jump gets on exactly where it does in CS2, and low ceilings keep you crouched.

## Sounds
- Round start: each team hears one CS2 radio line in its own agents' voice ("Let's go", "Lock and load", …).
- Round end: CS2's three sounds — the MVP anthem when there is an MVP (the defuser, the planter, or the winning side's top fragger), otherwise the round-won or round-lost music. The host picks the MVP.
- Footsteps and gunshots now tell distance and direction like CS2: walls muffle sounds strongly, far sounds lose their highs and gain room echo, sounds behind you are a little duller, and other players' footsteps start within about 0.2 s of them running (walkers stay silent).

## Smooth physics
- Grenades in flight are drawn smoothly between the host's updates: no stutter, no catch-up spurts, no pop on landing, no lurch when the host takes over your throw.
- Dropped guns and the bomb glide every frame instead of moving in steps; physics props move the same at any frame rate; a dying player topples over in about half a second.

## Aspect ratio and resolution
- New Settings → Global Defensive → Video: aspect ratio (Native, 4:3, 16:9, 16:10) with CS2's field of view per ratio, CS2's resolution lists, black bars or stretched, and display mode (fullscreen, fullscreen windowed, windowed). Menus and the radar stay inside the black-bar picture; the crosshair stretches with a stretched picture.

## Smoothness (Windows and Mac)
- In a match, the other modes' work no longer runs, the map's static parts and shadows are not recomputed every frame, and the fog colour is cached.
- The automatic resolution no longer lowers the picture on a slow processor just because a quiet moment was slow.
- The first-run Auto preset no longer puts a MacBook on Performance by mistake: it picks Balanced unless the graphics chip really can't keep up.

## Measured
MacBook Air M3 on AC power, Dust II, you + 9 bots, smokes, fire, gunfire (75 s fights, 51 and 52 run in turn):

| | 51.0.0 | 52.0.0 |
|---|---|---|
| frames over 50 ms in the fight (1920×1080 / 1470×956 Retina) | 0 / 0 | 0 / 0 |
| longest frame in the fight | 18.7 ms | 18.7 ms |
| shader builds mid-fight | 0 | 0 |
| CPU slowed 4× (a weak laptop): frames per second | 53.7 / 56.9 | 57.4 / 57.5 |
| other players' guns in CS2's hold (43 items, muzzle within 2 cm) | 6 of 43 | 43 of 43 |
| AUG muzzle off CS2's (third person) | 14.5 cm | under 2 cm |
| grenade in flight on a guest: teleports / landing pop | up to 21 / 2.6 units | 0 / under 0.01 |
| dropped gun frames that repeat the last position (144 Hz) | about 610 of 800 | 0 |
| footstep behind a concrete wall | 1.2 dB quieter | up to 24 dB quieter, muffled |
| LAN world update with 10 players skinned on every gun | 139 KB if skins rode inside it | 1.5 KB |
| GPU textures after 5 rounds of skin switching | +10 a round | flat |

Not verified: no real Windows computer was used (Windows smoothness was checked by slowing the CPU), and LAN ran as two browsers on one Mac, not separate computers. Nobody has listened with headphones yet to the new sound mix (walls, behind, distance, round music and radio levels). Smoothness with 10 players all wearing CS2 skins was not measured. The skins menu's Esc close and the arms switching side at halftime were not checked in a real match.
