# Infra Simulator 51.0.0 — Global Defensive: walls, movement, grenades, smoke, LAN and smoothness

Global Defensive only; the other modes are unchanged.

## Shooting near walls
- On CS2 map files, bullets, knife strikes, sight lines, HE and flash checks now find the real wall surface (CS2's own triangles) instead of a 16-unit collision grid that stood up to 16 units in front of the walls. Shots past a corner or from a player pressed against a wall hit what you see; real walls still stop them. Wallbangs follow the wall's real thickness.
- You stand about CS2's 16 units from a wall (was 8–34). Doors switch collision halfway through their swing and never shut on a player. Impact marks lie on the wall.
- Developer collision view (practice): player boxes, bullet boxes, doors and CS2's triangles drawn round you.

## Movement
- A fixed 128 Hz simulation: the same keys give the same movement at 30, 60, 144 or 240 fps.
- CS2 speeds for every weapon, a fresh press for each jump, crouch-jump lift, no stepping up in mid-air, smooth sliding along slanted walls, fall damage.
- Teammate boosting: stand on a teammate (crouched or standing), get lifted when they stand up, three-player stacks.

## Grenades
- Keys 6 HE, 7 flashbang, 8 smoke, 9 decoy, 0 molotov / incendiary; 4 cycles them in that order. Old custom key bindings are kept.
- New: decoy ($50) and incendiary (CT, $500); molotov is T-only. Carry limits as CS2: 4 grenades, 2 flashbangs.
- Grenades no longer pass through thin walls or floors or fall into the void; smokes and fires go off on the floor they land on.
- Flashbangs are stopped by shut doors; bots get flashed; a weaker second flash never shortens a stronger one. HE counts armor. Fire damage ticks at a steady rate and no longer slows you to half speed every tick.

## Smoke
- All smokes drawn in one pass: overlapping smokes no longer reveal each other or what's behind them, and inside a smoke you see smoke, not a blurred world. Bots and the radar follow the same rule as the screen.

## Rematch and LAN
- A rematch resets every gun, grenade, armor, kit and the money; knives and skins are kept. Packets from an old round or match are refused.
- Grenade throws, buys and other actions no longer send the whole ~120 KB world to every player. A player still loading a new map can't be shot.
- Smoother remote players over Wi-Fi: the drawing delay covers the network's real lateness (not a player's pauses), and one hitch no longer delays everyone for seconds. Reconnects keep your team without ghosts.
- Bot route planning that stalled the host up to 0.8 s on CS2 maps now takes at most ~50 ms.
- The host's lobby shows the address friends type. Guide: docs/GD-LAN-TONIGHT.md.

## Smoothness (Windows and Mac)
- No shader builds during a fight (the main cause of Windows stutter: first use is slow there): grenade and fire effects are prepared at each freeze time.
- Resolution changes wait for a quiet moment instead of freezing the game mid-fight; when the CPU is the limit, resolution is no longer lowered for nothing.
- 60 fps on 75 / 100 / 144 / 165 Hz screens (144 Hz used to get 48 fps).
- Work from the other game modes no longer runs every frame in a match (60 → 2 a second); CS2 agents share one skeleton (4× less animation work); the HUD writes only what changed.
- The first-run Auto preset now measures the game, not the loading screen.
- Performance overlay: F9 in a match, or Settings → Global Defensive (frame times, GPU, hardware acceleration, ping, jitter, delay, host tick).

## Sounds
- No freeze-time music.
- CS2's defuse sound and bomb beep (from your own CS2 install, imported on your computer); the beep speeds up as CS does (1 s apart → 0.15 s).

## Measured (MacBook Air M3, Dust II, you + 9 bots, smokes, fire, gunfire)
| | 50.0.0 | 51.0.0 |
|---|---|---|
| frames over 50 ms in the fight | 6 (worst 1.3 s) | 0 |
| CPU slowed 2× (a mid laptop): p99 / worst frame | 32.6 / 99.7 ms | 17.7 / 33.6 ms |
| shader builds mid-fight | 1–2 | 0 |
| hall updates in a match (laptop kit, engineering) | 60 a second | 2 a second |

Not verified on real Windows hardware (none here): Windows smoothness was worked on through emulation (slowed CPU, heavier GPU load). LAN was tested with two browsers on one Mac (simulated clients, simulated Wi-Fi), not separate computers.
