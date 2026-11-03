# Infra Simulator 53.0.0 — Global Defensive: CS2 lineups, practice tools, kill emblems and headshot feedback

Global Defensive only. This note covers stages 1 to 3 of v53. Stages 4 to 7 (CS2 HUD, map graphics and physics, smooth without a graphics card, docs) are not done yet and will be added here.

Other modes are unchanged. A new test, `tests/gd-other-modes-untouched.mjs`, checks this in three ways:
- 69 modules that belong to the other modes (their scenes, HUD, settings and logic) are byte-identical to 52.0.5's.
- The other modes' key bindings, graphics settings and default preferences behave exactly as in 52.0.5.
- Every change since 52.0.5 in a shared file (lab.js, campaign-ui.js, lan/room.mjs and the others) sits inside a Global Defensive branch. This part needs the git history, so it is skipped on a shallow checkout.

## Stage 1: grenades that land the same way every time

Before this update, the same throw from the same place could land in different spots. We confirmed all six causes the spec listed:
- The host moved grenades in steps as long as its own tick (about 50 ms, and uneven). Mirage's window smoke landed up to 1.2 units apart and came to rest up to 5.8 ticks apart.
- The throw started from the drawn camera, so it picked up view bob, smoothing and view punch. That eye was 63.0 units high instead of CS2's 64.
- A "standing" throw still carried the walking speed while you slowed down. 50 ms after letting go of the key, it landed 27 units further.
- There was no jump-throw.
- The release was timed by frames. Running throws spread 7.1 units at 30 fps and 0.9 units at 240 fps.
- LAN precision was already fine. The throw was sent at full precision, and both sides built the same collision from the same map file.

What changed:
- **Fixed 64 Hz steps.** Every grenade now has its own clock and moves in whole 1/64 s steps, however long the host's tick is. The leftover time carries over to the next tick. Bounces, coming to rest and the fuses all count in these steps. The host, your own copy of the flight and the practice preview all run the same step function.
- **Throw from the simulated eye.** The throw now starts at your simulated feet plus CS2's eye height, aimed with the raw view angles (the ones `getpos` shows). Bob, smoothing, recoil and view punch no longer count. The Source start-point rules stay as they were.
- **Velocity at the moment of release.** Standing still now means a speed of exactly 0: the movement snaps to a stop at low speed, as Source does. CS2's 1.25 × carry-over of your speed stays. The old ±60 clamp on the carried speed is gone: CS2's grenade data has no such field.
- **Jump-throw.** There is a new bindable action "Jump-throw" under Settings → Controls. It is unbound by default, as in CS2. It jumps and lets go of the grenade on the same movement tick. It works with the left button (full throw), the right button (underhand) and both buttons (medium). There is also an optional setting, "Jump + release" (off by default): with it on, pressing Jump while holding a grenade does a jump-throw. A plain jump and a release less than one CS2 tick apart (1/64 s, either order) also counts as a jump-throw.
- **Sub-tick release.** The release uses the moment of the mouse or key event itself (the event's own timestamp), not the moment the game got around to handling it. The same input lands the same at 30, 60, 144 or 240 fps.
- **Both mouse buttons.** In 52.0.5 a medium throw with a real mouse was impossible: the browser reports the second button of a chord differently, and the game never saw it. Both buttons now give a medium throw. Pressing the other button while holding changes the strength, as in CS2.

How it was checked:
- `tests/gd-nade-determinism.mjs` (7380 checks) throws 200 random grenades: standing, running, crouched and jump-throws. Each one runs with host ticks of 15.6, 33, 50 and 100 ms (with jitter) and at 30, 60, 144 and 240 fps. The host, your copy and the preview agree to 0 units and 0 ticks. The spec allowed 0.5 units and 1 tick.
- `tests/gd-jumpthrow.mjs` (55 checks) covers the jump-throw window at 8 tick phases × 6 frame phases × 4 frame rates. A gap of 14 ms counts as a jump-throw and 16 ms does not. A release handled 23 ms late is still thrown at its event's moment.
- `tests/gd-lan-lineup.mjs` (34 checks) runs a real room. A guest page builds its throw the way a real page does, from its own map instance loaded from the room's served files. The guest and the host land 0.000000 units apart with the same tick counts: Dust II smoke 290, flash 96, Mirage window smoke 340.
- The browser test `tests/browser/gd-nade-chord.mjs` uses Chrome's real mouse and passes 12/12: left, right and both buttons in three release orders, a strength change while holding, and the throw at the release event's exact moment.

## Stage 2: CS2 practice tools and lineups

- **Preview while holding a grenade** (CS2's `sv_grenade_trajectory_prac_pipreview`): a line, a landing ring and a small picture of the landing spot. It updates live as you aim and change strength, using the same step function as the real throw.
- **After a throw:** the path stays for 8 s, now with bounce marks (yellow) and an end mark (green). `sv_rethrow_last_grenade` throws the last grenade again from the same spot, angles and strength.
- **Console** (the ` key):
  - `getpos` prints `setpos x y z;setang pitch yaw` at full precision; `setpos` and `setang` move and aim you exactly.
  - `noclip`: a `setpos` under noclip now leaves you in the air, as in CS2, instead of dropping you to the floor.
  - Also `god`, `bot_kick`, `mp_roundtime`, `mp_freezetime`, infinite grenades, and `sv_infinite_ammo`: 1 means the magazine never empties, 2 refills the reserve only.
  - All of these work in Practice only. The practice freeze time and clock run on the host's clock.
- **Lineup library.** Each map has shipped lineups with a floor mark where to stand and an aim target in the world that turns green within 0.1°. There are 92 lineups: 8 smokes and 6 flashes per map, but only 3 flashes on Nuke and Anubis. 27 of them are pop-flashes, at least one on every map. To count as a pop-flash, a flash must blind the thrower for at most 0.25 s when they turn away, and blind a player round the corner for at least 1 s. The lineups come from public `getpos` lines on www.cs2util.com, not from Valve files.
- **Your own lineups.** `lineup_save [name] [left|right|both] [stand|crouch|jump|runjump|walk|run]` saves your own lineup to `user-assets/lineups/<map>.json` on the host's computer. That folder is git-ignored. You can keep up to 200 lineups per map.
- **CS2's throw delay.** In CS2 the grenade leaves the hand about 0.1 s after the release. We measured 0.104 s (see the table below). The game now sends the throw that long after the release and moves your release position through the delay against the map. A jump-throw under a low ceiling now stays under the ceiling.
- **Flash pop moment.** A flash pops 1.609 s after it leaves the hand (step 103), not at 1.5 s: CS2 checks the fuse every 0.2 s.

How it was checked:
- `tests/gd-lineups.mjs` throws every shipped seed (95/95 land in place). It also throws all 366 public CS2 lineups that a `getpos` line alone can repeat. The hit rates are fixed as floors, so they cannot get worse without the test failing. It checks the pop moment on 55 flashes (54 match) and every pop-flash seed against the map (134/134).
- `tests/gd-practice-console.mjs` (31 checks) covers the `getpos`/`setpos` round trip, god mode and the ammo settings. `tests/gd-lineup-library.mjs` (47 checks) covers the library, the save command, a pop-flash on every map, and no memory allocated while you stand on a lineup spot.
- The browser test `tests/browser/gd-practice-lineups.mjs` runs on Mirage at Retina scale on the High preset and passes 12/12:
  - The console sets a lineup and `getpos` prints it back.
  - The aim target turns green, and holding the grenade shows the preview and its picture.
  - The smoke lands 10 units from CS2's recorded landing point.
  - The path, bounce marks and end mark are drawn.
  - No shader is compiled while you hold the grenade.
  - Picture: `~/Desktop/GD-v53-practice-lineups.jpg`.

## Stage 3: kill emblems and headshot feedback

- **Round kill tally, like CS2's** (from the user's two CS2 screenshots and CS2's own `hudhealthammocenter` layout file):
  - At the bottom centre is a round badge with the team logo inside a light-blue ring, on a thin gold line.
  - Behind the badge, one gold card per kill this round fans out like a hand of playing cards, using CS2's exact fan angles and offsets for each kill count. The newest card shows the kill number.
  - A headshot card shows the headshot pip. Knife, HE, fire and taser kills have their own pips.
  - Past 5 kills, as in CS2, the five cards stay and an extra card shows the count.
  - Wallbang, no-scope, through-smoke and blind kills add a small mark on the card.
  - Everything clears when the next round's freeze time starts.
- **On each kill** the new card pops in, a shine sweeps across it, a lightning burst flashes from its rim (gold and white for a headshot, blue and white for a body kill) and its glow fades down. The older cards pulse. CS2's own 0.7 s flash and spotlight play too. The 3rd, 4th and 5th kills burst bigger, and an ace adds a ring wave. The "Reduce flashes" setting tones all of this down.
- **Headshot sounds:**
  - You hear a different sound when you hit a helmet (a metallic ping) than a bare head (a dull hit).
  - A headshot kill plays a heavier sound layered on the kill sound.
  - The victim and nearby players hear headshots at the spot where they happened, with the usual walls and distance rules.
  - Each sound plays at most 2 copies at once.
  - With CS2 imported, these are CS2's own sound events. Without it, our own made-up sounds play.
- **Hit marker:** a white X, red for a kill, with extra ticks for a headshot.
- **Victim screen:** CS2's damage indicator, four segments around the screen centre showing where the hit came from. The red flash on losing health stays as before.
- **Death panel:** shows who killed you, with which weapon, and the headshot mark.
- **Helmet "dink" sparks:** a headshot on a helmet shows CS2's electric blue-white spark burst at the head. Everyone sees it, because it comes from the host's hit records. A headshot without a helmet shows blood instead.
- **Cost:** one set of page elements is built once and reused every round. A kill only switches prepared styles and allocates no memory. The animations only move and fade elements. In one burst in Chrome, the main thread did 1 layout and 11 ms of style and paint work, and its longest task took 1.4 ms.

How it was checked:
- `tests/gd-kill-emblem.mjs` (76 checks), `tests/gd-headshot-audio.mjs` (117 checks) and `tests/gd-dink.mjs` (23 checks).
- The browser test `tests/browser/gd-kill-emblem-shots.mjs` plays a real Defuse game against bots:
  - a body kill with three USP-S shots, then a headshot kill;
  - each kill pictured frame by frame from 0 to 950 ms, with the hit markers checked;
  - CS2's pictures served from an import;
  - the tally cleared at the next freeze time.
  - Picture: `~/Desktop/GD-v53-kill-emblems.jpg`.

## Numbers marked (verify) and where they came from

| number | value | source |
|---|---|---|
| Throw speed | 750 × 0.9 = 675 u/s | `m_flThrowVelocity` 750.0 for all 7 grenades in the user's `weapons.vdata` |
| Standing eye height | 64.06 units | measured: CS2 `getpos` lines on Mirage minus the floor in the user's `mirage.bsp` (64.062 and 64.063) |
| Crouched eye height | 46.045 units | **not verified**: CS:GO's value; not in the install's data files |
| Jump speed at take-off | 301.993 u/s | **not verified from a file**: worked out as √(2 · 800 · 57) from CS2's 800 gravity and 57-unit jump; the server code is not in the install |
| ±60 carry-over clamp | none | no such field in `weapons.vdata` or the cfg files; removed (it only mattered when falling faster than 390 u/s) |
| Grenade run speed | 245 u/s | `m_flMaxSpeed` for every grenade in `weapons.vdata` |
| Throw delay | 0.104 s | measured against cs2util's recorded CS2 landing points: the best fit from 0.08 to 0.125 s on 27 jump flashes and 217 jump smokes (0.104 s: 83 hits; 0.09 s: 25; 0.12 s: 36; none: 4) |
| Flash pop | 1.609 s after leaving the hand (step 103) | the same public data: median miss 5.4 units at 1.609 s, against 52 units at 1.5 s and 48 units at 1.72 s (54 of 55 flashes) |
| Helmet headshot events | `Player.DamageHeadShotArmor.AttackerFeedback`, `.Victim`, `.Onlooker`; `Player.DeathHeadShotArmor.*` with its `.Dink` / `.Flesh` child events | the user's `game_sounds_player.vsndevts` (decompiled), with their volumes, files and child events |
| Kill tally layout | 64 px badge, 3 px ring, the card fan per count, cards resting at 42 px and sliding in over 0.2 s, 0.7 s flash | `panorama/styles/hud/hudhealthammocenter.vcss` from the user's install |
| Damage indicator | 300 px, 4 segments, colour #cc3300 | `huddamageindicator.vcss` from the user's install |
| Helmet sparks | 15 trails, 2 streaks, 1 flare, with their lifetimes and colours | `particles/impact_fx/impact_helmet_headshot{,_spark,_glow}.vpcf` from the user's install |
| Flash blind amount and length | **not verified** | the install has no such fields and the server code is not there. Our numbers (amount / hold s / fade s) are unchanged: facing at 200 units 0.96 / 2.11 / 1.73, at 600 units 0.815 / 1.79 / 1.47, at 1200 units 0.511 / 1.12 / 0.92 |
| `sv_infinite_ammo` 1 and 2 | 1 = never reload, 2 = reserve only | **from memory of CS:GO**, not in the install |

## Partial, and what is not like CS2 yet

- **Smoke rolling and resting differ from CS2.** Of the 366 public CS2 lineups, 178 still end more than 32 units from CS2's spot. 50 of those pass within 32 units of CS2's spot and then roll or bounce away. Examples:
  - Mirage Apartments window smoke: passes 1 unit from CS2's spot, then stops 165 units away.
  - Inferno A Long smoke from Mid: bounces early and ends 502 units off.
  - Nuke T Roof flash: bounces at a spot where CS2's goes through.
  - The full list is in the stage 2 notes.
- **Jump smokes are very sensitive** to the launch: 3 % more or less upward speed halves the hits.
- **Run-jump and walk lineups** cannot be checked: the public data gives no running speed. Smoke air times are checked to ±0.3 s, not ±1 tick, because the public times are measured by hand.
- **Inputs during the throw delay:** a jump, stop or crouch in the 0.104 s after release is not applied.
- **A release before the pin is out** is thrown at the pin-out moment, but with the aim from up to one frame later.
- **Nuke and Anubis** have 3 flashes each, not 4. No more repeatable public CS2 flash lineups with landing points were found.
- **The camera eye is still 63.02 units**, while throws use CS2's 64.06. The camera, the hit model and shot origins belong to the HUD and shooting work.
- **View pitch** is limited to ±85.9°; CS2 allows ±89° (from memory).
- **Throw strength:** the first button you let go decides the throw. CS2 eases the strength toward the buttons held, at a rate not in any file.
- **Our body stands 0.79 units** from CS2's `setpos` spot at Mirage's cart, because of our collision.
- **The preview picture** draws the scene a second time every other frame. On High at Retina scale this costs 1.2 ms of processor time, with no missed frames (p95 18.6 ms holding against 17.5 ms standing still).
- **The jump-throw model** follows the spec (the grenade leaves at take-off, plus CS2's measured delay). It has not been checked against a CS2 jump-throw recorded on this computer, because no such recording exists yet.

## Needs CS2 imported on the computer

- CS2's kill-tally cards, pips and team logos, and the kill-feed mark icons: `node tools/import-cs2-killfeed.mjs`. It now picks up 65 icons. Without them, our own drawings in the same layout are used.
- CS2's headshot and helmet sounds: the existing CS2 sound import. Without it, our own made-up stand-ins play.
- The lineup tests and the practice browser test need the CS2 maps converted on this computer (`user-maps/`). They skip the maps that are missing.
- No Valve file is committed. `tests/no-valve-data.mjs` passes.

## Measured (on the MacBook, in muted Chrome)

- **Practice preview,** High preset at Retina scale (1440×810): standing still p95 17.7 ms, holding with the picture p95 18.0 ms, 60 fps, no shader compiled. On Low: 1.15 ms a frame for the picture, p95 17.5 ms.
- **Kill tally:** one burst took 1 layout, 39 paints and 11.4 ms of main-thread work in all; the longest task was 1.4 ms. An idle second took 0.
- **Full `npm test`:** passes.
