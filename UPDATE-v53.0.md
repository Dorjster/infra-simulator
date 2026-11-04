# Infra Simulator 53.0.0 — Global Defensive: CS2 lineups, practice tools, kill emblems and headshot feedback

Global Defensive only. This note covers stages 1 to 3 of v53 (batch A) and batch B: stage 4 (the CS2 HUD), stage 5 (map surfaces, wallbangs and impacts), and the user's addenda for molotovs, the death cam and ragdolls, reloads and five new knives. Stage 5's graphics part, stage 6 (smooth without a graphics card), the CS2 feel audit and the docs stage are not done yet and will be added here.

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

## Stage 4: the CS2 HUD (package HUD)

The HUD is laid out from CS2's own panorama style files in the user's install (`panorama/styles/*.vcss`, read as text)
and from the user's CS2 picture (`cs2-hud.png`, Dust II, 739 × 415). Where the two disagree, the picture wins, as the
spec's addendum 7 asks.

- **One layout table** (`dist/gd-hud-layout.js`). Every box is in CS2's own pixels for a 1080-pixel-high screen and
  scales with the view's height, as panorama does. The same table writes the CSS and the numbers the test checks, so
  the two can't drift apart. Some of the numbers:
  - radar: a round 250 px radar (`hudradar.vcss` Radar_VisSize_Round), its centre at (0.078, 0.135) of the picture;
  - team counter: timer 84 px wide and 28 px bold, scores 28 px bold in CT #B5D4EE and T #EAD18A, avatars 54 px wide,
    the C4 mark 16 px rgb(255,255,95), the kit 20 px rgb(119,221,255), dead players at opacity 0.2;
  - health and ammo: CS2's 72 px row 16 px above the bottom, 42 px numbers, a 65 × 8 px health bar, 200 px between the
    health group, the 64 px badge and the ammo (`hudhealthammocenter.vcss`);
  - money 38 px bold (`hudmoney.vcss`), chat 18 px (`hudchat.vcss`), weapon names and slot numbers 16 px, rows 300 px
    wide 6 px from the right (`hudweaponselection.vcss`).
- **Font:** Barlow Semi Condensed SemiBold and Bold (OFL 1.1, in `dist/fonts/` with its licence). It is our own
  stand-in for CS2's font, which we can't ship.
- **HUD settings** (Settings → Global Defensive → HUD), with CS2's names and colours from `csgo_english.txt` and
  `csgostyles.vcss`: HUD Scale 0.8–1.4 (`hud_scaling`; CS2's own slider range is in its binary, so the spec's range is
  kept), HUD Color 0–12 (`cl_hud_color`, default Team Color: T #eabe54, CT rgb(150,200,250)), colour-blind letters
  Y P G B O over the player colours (`cl_teammate_colors_show 2`), and "Reduce flashes" (ours).
- **Kill tally after review:** the cards have CS2's blurred dark backgrounds with dots, and older cards show only their
  pips. The card size, tilt and pivot were refit from CS2's SVG layout. The badge ring is **your player colour**
  (picture 1 matches color-player-blue rgb(136,206,245), the ace picture color-player-green rgb(29,162,132)), not
  always light blue.
- **Ammo:** CS2's per-weapon reserve icons (`ammo_reserve_*`), the clip bar hidden as in the picture, and CS2's reload
  cue: the reserve icon drops 50 px out and comes back in from above over 0.3 s ease-in (`hudhealthammocenter.vcss`
  `.HUD--on-reload`, keyframes `reload`).
- **Radar bomb** (addendum 8, from `hudradar.vcss`): the carrier mark on the dot, a dropped bomb with a 110 px #880000
  ring over 0.75 s, the planted bomb at 70 px #D10000 with CS2's PlantedBombAnimateRed blink, and CT sight of a dropped
  bomb. Team colours are CS2's color-player-* values.
- **Scoreboard:** CS2's PING column first (`scoreboard.vcss` `.sb-row__cell--ping`: 37 px, #888, 18 px); bots show a
  12 px BOT label there. The ping is the pose ping the room already sends, so there is no new net field.
- **Round end:** CS2's win-banner swoosh and team-colour flash, CS2's centre-top messages (`gd-hud-alerts.js`), and the
  round's damage report printed to the console in CS2's form ("Player: X - Damage Given", then "Damage Given to "Y" - n
  in h hit(s)").
- **Crosshair code:** Settings → Crosshair shows "Crosshair Code:" with Copy and Import, in CS2's words ("Share or
  import a crosshair code.", "Replace current crosshair?", "Invalid or old crosshair code").
- **The buy menu** was already CS2's grid (52.0.x). "Radial" was CS:GO's layout, so nothing changed there.
- **Partial:**
  - The crosshair code's byte layout is the one public share-code tools use, written from memory. CS2 builds the code
    in its binary, and no real CS2 code could be checked against it. Our own codes round-trip exactly. Gap +4 px,
    size = length and colours 0–4 as pure colours are our fits.
  - The console's "Damage Given to …" lines are CS2's console form from memory (the text files don't hold them). The
    report keeps each attacker's top 3 victims, so "taken from" can miss someone.
  - CS2 shows the reserve as magazine icons for guns with `m_bReserveAmmoAsClips` (`.show-mags`); we show numbers, as
    the user's picture does. See the reload section: this needs the user's decision.
- **Tests:** `tests/gd-hud-layout.mjs` (327 checks: every box at 16:9, 4:3 and 16:10, the 3 resolutions and scaling, the
  crosshair code), `tests/gd-hud-alerts.mjs` (20), `tests/gd-radar-bomb.mjs` (14, no allocation), `tests/gd-round-panel.mjs`
  (31: ping cell, console report), `tests/gd-kill-emblem.mjs` (84). Muted browser runs:
  - `tests/browser/gd-hud-shots.mjs`: 4 resolutions × 12 boxes at the picture's fractions, scale 1.4 / 0.8, the radar
    carrying, dropped, picked up and planted, and the blink extremes. Pictures: `~/Desktop/GD-v53-hud-vs-cs2.jpg`,
    `~/Desktop/GD-v53-radar-bomb.jpg`.
  - `tests/browser/gd-kill-emblem-video.mjs`: a real Defuse round on Dust II, 4 headshot kills and a body-shot ace,
    recorded by headless tab capture with the page's own sound. `~/Desktop/GD-v53-kill-emblem.mp4` is H.264 1920 × 1080
    at 60 fps, 16.1 s, with AAC sound (mean −19.8 dB, peak −0.3 dB). 967 of its 968 frames are distinct. Contact sheet:
    `~/Desktop/GD-v53-kill-emblem.jpg`.

## Stage 5: map surfaces, wallbangs and bullet impacts (package MAP)

- **Wallbangs** follow CS2's surface properties (`dist/gd-surface-props.js`, read from the install's
  `surfaceproperties_game.txt` and `surfaceproperties.vsurf`). Each gun's power is weapons.vdata `m_flPenetration`.
  The loss rule is CS:GO's `HandleBulletPenetration`, because CS2's server code is not in the install.
- **Doors and breakables** use their model's own surface: Nuke, Overpass and Cache doors are metal, Inferno's door is wood.
- **Converted CS2 maps** can now keep each bullet stretch's exact CS2 surface: chainlink, metalgrate, metal_barrel,
  metalrailing (vsurf hash 2838185980), plastic, carpet and so on. Before, these were lumped into metal, concrete or crate.
  The importer has a new mode that changes only those bytes and keeps a backup:
  `PENS_ONLY=1 node tools/maps/import-cs2-map.mjs <id> ~/CS2-extract/export/<id>`. It was checked on copies of all 8
  maps (only the bullet-surface bytes change). The user's own map files were **not** rewritten here, because the live
  LAN game reads them.
- **Bullet impacts** (`dist/gd-impacts.js`) use CS2's `particles/impact_fx/*.vpcf` numbers for each surface, plus
  CS2's bullet-hole sizes. There are three pools, each drawn once. Nothing is allocated per shot or per frame, and the
  pools are warmed behind the loading card.
  - Several impacts in one frame now all reach the screen: shotgun pellets, a wallbang's entry and exit, and replayed
    shots.
  - Last round's bullet holes are cleared properly.
- **Sparks and flecks land and bounce**, from CS2's `C_OP_WorldTraceConstraint`: bounce, slide and stop speed, read
  from each system's file. Only the floor under the hit is used, with one bounce. CS2 also traces walls.
- **Spark colour**: overbright sparks keep their hue instead of clipping to white. The bloom-pass glow is now shown at
  0.35 of its light (was 0.15). CS2's own colours are near-white cream cores with a cream-to-orange bloom. A deeper
  orange is not in the files.
- **Helmet headshots** add CS2's other helmet-impact children next to stage 3's dink sparks. A bare head shows blood only.
- **Physics props** are knocked the same way on every computer: seeded by the prop, other players' bullets count too,
  and at most 24 move at once. They are still each computer's own; the host does not send prop state.
- **Movement**: a body under a ceiling exactly 72 units up no longer freezes. `gd-map-sweep` now also reports
  floating spots and edge snags.
- **Not done in this stage** (left for batch C):
  - SSAO on High/Ultra, per-area reflection probes, PBR normal/roughness maps from CS2 materials, low-poly backdrops
    and the sharpen pass;
  - range falloff inside the wallbang loss;
  - impacts on walls bounced by the world trace.
- **Measured** (muted Chrome, Retina at 1920 × 1080 device pixels, High, Dust II, 9 bots, CPU 1×, same machine load):
  - 52.0.5: 60 fps, p95 18.6 ms, max 33.4 ms;
  - this tree: 60 fps, p95 18.6 ms, max 33.3 ms;
  - 0 programs linked during the fight in both.

## Reloads like CS2, with CS2's silent reload (package RELOAD)

All numbers come from the user's own install, read by a new importer, `tools/import-cs2-reloads.mjs`. It reads
weapons.vdata, each gun's first-person animgraph and reload clips, and `game_sounds_weapons.vsndevts`. It writes
numbers and names only to `dist/gd-reload-ref.js` (no audio, no Valve file).

- **The rounds go in when the new magazine is seated.** That moment is CS2's clip event `WPN_RELOAD_ADD_AMMO` for each
  gun. For example, the AK-47's comes at 1.1 s of its 2.4333 s clip, the AWP's at 2.0 s and the M249's at 3.733 s.
  - Pistols have a second clip for an empty magazine (CS2's graph picks it when `weapon_ammo` is 0). The Glock's
    comes at 0.933 s, or 1.267 s from empty.
  - The CZ75-Auto's first reload takes its spare front magazine (1.567 s); later reloads use `reload2` (1.233 s).
  - You can't shoot until `m_flDisallowAttackAfterReloadStartDuration` (the AK's 2.4667 s; this also fixes the AUG,
    which was 3.8 s and is 3.2 s).
  - Switch at any moment after the mag-in and the full magazine stays; switch before it and nothing changed. The
    moment counts, not the frame that noticed it.
- **Shotguns** load shell by shell at CS2's stages. The Nova's intro is 0.367 s, then one shell every 0.433 s,
  counted 0.3 s into each; the XM1014's are 0.7 s, 0.6 s and 0.333 s. These replace the old 500 ms guess. A click
  after 0.467 s with shells in fires and ends the reload, as before.
- **Magazine and reserve** use `m_iMaxClip1` and `m_nPrimaryReserveAmmoMax`. In this install every magazine gun has
  `m_bReserveAmmoAsClips = true`, so its reserve is counted in magazines:
  - AK-47 30 / 90, M4A4 30 / 120, M4A1-S 20 / 60;
  - Glock-18 20 / 60, USP-S 12 / 24, Desert Eagle 7 / 21;
  - AWP 5 / 10, SSG 08 10 / 20;
  - Nova and XM1014 8 / 32 and 7 / 32 (shells).

  This differs from the user's reference picture, which shows a Glock at 20 | 120 (an older CS2). A reload moves
  only the missing rounds from the reserve, as the spec asks. CS2 may now drop the rest of a half-empty magazine:
  its data has the reserve-as-magazines flag and a `WPN_DROP_MAG` event, but the rule itself is in the server's
  code, so this is not verified. CS2's HUD also has an icon mode for it (`.show-mags #HudReserveMagsContainer`,
  `ammo_reserve_magazine`) that we don't draw. **Needs the user's decision:** keep these install numbers, go back to
  the picture's pool (Glock 120), or move fully to CS2's magazines. Only `reloadOf`, `seatMag`, `takeReload` and
  `botSeat` change.
- **The host decides on its own clock.** Each reload's start is now numbered in the pose (`shot.rs`, a small new
  field; NET_PROTOCOL unchanged), and the host stamps it when it arrives. The completion counts only after CS2's
  mag-in time for that gun has passed on the host's clock, less 600 ms for the network. An earlier one is refused,
  and the client then takes the host's magazine.
  - The slack was 250 ms. Poses go one at a time, so a network spike on the pose in flight when R is pressed delays
    the start by up to the spike. A LAN simulation refused fair AK and Glock reloads after a single 350 ms spike.
    With 600 ms, spikes of 350, 450 and 550 ms pass. A modified client could seat a magazine at most 600 ms early.
  - In one pose the host now charges the shots the old magazine covers first, then a completion, then the rest. A
    shotgun's shell and the click that cuts its reload come in one frame, and the click used to be a dry shot on the
    host: the pellets were refused and the shell stayed in the host's tube.
  - A reload's start is now sent at once. Before, a pose that only changed `rs` was dropped as unchanged.
  - Other players and spectators see and hear the reload from its start, not from its mag-in.
  - Bots load their rounds at the mag-in too, every tick, whether or not they see an enemy. Before this fix a bot
    that lost sight while reloading kept an empty magazine. Bot shotguns load shell by shell: a Nova from empty takes
    0.367 + 8 × 0.433 + 0.833 = 4.67 s. Before this fix all 8 shells went in at once after 1.2 s.
- **The silent reload.** CS2 marks every reload sound event `suppression_enable` (volume × 0.07, distances × 0.2),
  and every reload clip has a `WPN_RELOAD_SILENT` window from its start to just after its last sound. Our reading:
  inside that window, everyone except the reloading player hears the sounds suppressed. CS2's data doesn't contain
  the code that links the two.
  - Your own reload plays 2D at each event's own CS2 volume, for example Clipout 1.0 and AddAmmo 1.2. This is CS2's
    first-person level; the old × 0.9 is gone.
  - Each sound finds its event by gun and by its moment in the clip, not by file name alone. Several guns share CS2
    files with different events. `magazine_slide_01` is the AK's Clipin at 0.3, the Deagle's Clipin at 1.0, and the
    Galil's Clipin and MP9's slide at 0.5. Before this fix your own Deagle Clipin played at 0.3. All 155 reload takes
    of the room's clips now resolve to their own gun's event.
  - Someone else's reload is placed in the world, with the same occlusion and HRTF as other sounds. The AK's Clipout
    falls to 0 at 220 HU instead of 1100 HU. A suppressed sound is now cut at the bank's −34 dB × 0.07, so it fades
    on CS2's curve out to about 218 HU. Before this fix the plain cut stopped it at about 86 HU.
  - The fallback reload sounds (without CS2's clip sounds) are suppressed for every gun. Before this fix the P250's
    was not, because its event name differs in case (`Weapon_P250` vs CS2's `Weapon_p250`).
  - Events CS2 doesn't broadcast (`display_broadcast = false`) are never heard by others. These are the Nova and
    XM1014 shell inserts and the SSG 08's bolt. **Not verified:** this is our reading of the flag. The data sets it
    false on every Draw, WeaponMove and Inspect sound (363 events) and true on every gunshot, which fits "first-person
    only", but the code that uses it isn't in the install.
  - Walking or crouching changes nothing, because CS2's data has no such rule.
- **Partial:**
  - The first-person clip sounds come from the partial-magazine clip, so a pistol reloaded from empty plays its
    Clipin earlier than its (later) mag-in.
  - A shotgun's own clip sounds are stretched over all its shells instead of repeating per shell.
  - The R8 Revolver isn't in the game. Its CS2 reload adds ammo at 1.967 s of 2.267 s.
  - Other players and spectators see a shotgun reload as one shell cycle (1.63 s for the Nova), however many shells
    go in.
  - An in-eye spectator hears the watched player's reload as someone else's (suppressed). CS2's data doesn't say
    what an observer hears.
- **Tests:**
  - `tests/gd-reload.mjs` (295 checks): every gun type before and at its mag-in, the reserve arithmetic, shells and
    the fire interrupt, host and client agreeing under jitter and 350-550 ms spikes, a shell and a shot in one pose,
    bots' shells and their mag-in with no enemy in sight, forged completions refused, and the numbers matching the
    install's vdata and clips.
  - `tests/gd-reload-audio.mjs` (34 checks): every reload event's volume, curve and suppression against the install,
    every take resolving to its own gun's event, yours at CS2's level, others' suppressed (heard at 120 and 200 HU,
    silent from 230 HU), and every gun's fallback suppressed.
  - The muted browser check `tests/browser/gd-reload-hud.mjs` (9 checks) shows the HUD count changing in the first
    frame after the mag-in, the low colour clearing, and a switch before and after the mag-in, on the HUD and on the
    host. Picture: `~/Desktop/GD-v53-reload-hud.jpg`.

## New knives: Bayonet, Skeleton, Talon, Flip and Nomad (package KNIVES)

CS2's Bayonet, Skeleton Knife, Talon Knife, Flip Knife and Nomad Knife can now be picked beside the Default, Butterfly,
Stiletto, M9 Bayonet and Karambit (M menu → LOADOUT & SKINS → KNIFE). One table, `dist/gd-knives.js`, holds every knife
and is read by the M menu, the host, the room's save, the first-person and third-person models, the holds, the kill
feed and the finishes importer.

- **First person.** Each knife has its own set, built from the user's CS2 install with CS2's own clips: draw, idle,
  light and heavy attack, and inspect. The sets are made by `tools/cs2-fp/export_missing.py` with `build_set.py` and
  installed as `user-assets/fp/cs2_<knife>.glb`. They use the CS2 arms with the forearm-twist rule, and the glove swap
  works. The Skeleton, Talon and Nomad also carry CS2's second inspect (lookat02). CS2's view-model graph
  (`viewmodel_inspects.vnmgraph+knife_<name>`) gives the two inspects option weights 2 : 1, so the game plays lookat01
  twice as often as lookat02. Each knife plays its clips' own CS2 sounds, added by the new tool
  `tools/cs2-fp/fp_sounds_add.py` (55 new sound files).
- **The blade mask comes from CS2's own paint coverage.** This is the red channel of each knife's composite masks
  texture, the same channel the skins bake reads; the new tool is `tools/cs2-fp/knife_mask.py`. So the handle stays
  black only where CS2 leaves it unpainted. Before, three of the knives had no blade bone and their mask was a guess.
- **Third person.** Other players, spectators and the death cam see the knife you picked. Its model is baked from the
  set, as for the four star knives before. Each knife holds as CS2 does: `tools/export-cs2-holds.mjs` now exports its
  world model and its own idle, standing and crouched. The old holds files were kept in `user-assets/holds.bak-…`.
- **Skins.** `tools/import-cs2-skins.mjs` baked 122 finishes: 31 each on the Bayonet and Flip, 20 each on the Skeleton,
  Talon and Nomad. That is every finish CS2 lists for each knife, except the spray-painted styles, which the importer
  already left out for every knife. Each finish has its CS2 icon, and each knife has CS2's base maps. The new `--add`
  option merges a partial bake into the installed finishes, so the 425 older bakes were not baked again. The old folder
  was kept as `user-assets/skins.bak-20261104-0720`. The KNIFE row now shows CS2's equipment icon for each knife and how
  many finishes it has.
- **Kill feed.** These are the CS2 icon names in the install. The Bayonet's is `bayonet`; there is no `knife_bayonet`.
  The Talon's is `knife_widowmaker` and the Nomad's is `knife_outdoor`. The Skeleton's and Flip's are `knife_skeleton`
  and `knife_flip`.
- **Rules.** A pick only changes the look. weapons.vdata gives every CS2 knife identical numbers (m_nDamage 50,
  m_flCycleTime [0.15, 0.3], m_flDeployDuration 1.0, m_flMaxSpeed 250, m_nKillAward 1500). So every pick carries the
  game's one knife and its attacks. The host checks each pick, LAN messages carry the knife id, and a computer without
  the files draws the built-in knife.
- Tests: `tests/gd-knives.mjs` (29 checks, including the LAN round trip through the real room), and the knife lists of
  gd-fp-sets, gd-fp-forearm-twist, gd-agent-hold, gd-killfeed-icons and import-cs2-skins. The muted picture is
  `tests/browser/gd-new-knives-sheet.mjs` → `~/Desktop/GD-v53-new-knives.jpg`.
- **Not like CS2 yet.** CS2 draws an unpainted handle in its own material: the Talon's is ivory and the Bayonet's olive.
  The user's black-handle rule paints it black. Our knife draw time is 450 ms (the karambit's 500 ms), against CS2's
  m_flDeployDuration 1.0 for every knife. The knife attack numbers (40 / 25 / 90, 65 / 180, 0.4 s / 1.0 s) are not in
  the install's files: weapons.vdata's m_nDamage 50 and m_flCycleTime [0.15, 0.3] are not what CS2's knife code uses.

### After review (KNIVES final)

- **CS2's own attack clips.** The five sets now carry every clip CS2's knife graph (`viewmodel_knife.vnmgraph+<knife>`)
  plays: both light swings (light_miss1 / 2), the light hits (light_hit1 / 2), the light backstabs (light_backstab / 2),
  and the heavy miss, hit and backstab. The hit is known at the click, so the arms play the hit or backstab clip, with
  CS2's own hit sound from the clip. The light swings alternate. How CS2 sets `attack_variation` is game code and not in
  the files: alternating is how CS:GO's knife did it, from memory, not verified in CS2. A backstab clip uses the host's
  own rule (knifeCheck, dot > 0.475), with the target's facing as drawn. Sets made before v53 fall back to their one light
  and heavy clip, so the old knives look as before.
- **CS2's draws.** The Skeleton and Nomad have two draws. CS2's DeployOptions selector weights them [1, 8, 1] (draw,
  draw2, none), so draw2 is the usual one (1.0 s on the Nomad, as m_flDeployDuration). The rare one, the Nomad's 2.23 s
  flourish, now plays 1 time in 9. Before, it played every time.
- **Inspect while drawing.** The Bayonet and Flip have CS2's lookat01_draw. It plays when you inspect inside the draw
  clip's WPN_INSPECT_USE_DRAW_VERSION window: 0.333 s on the Bayonet (0.2857 of its 1.1667 s clip) and 0.4 s on the Flip.
- **Black handles only on the handle.** The mask's green channel is CS2's own handle region (the composite masks' green
  channel): the Bayonet's grip, the Talon's scales, the Flip's and Nomad's grips. Parts that are neither blade nor
  handle are bare steel. These are the Bayonet's crossguard, muzzle ring and pommel, the Talon's ring, and rivets. They
  keep CS2's base material, with no finish and no black, both with and without a CS2 finish (skin-render.js). The
  Skeleton has no green region.
- **Each knife offers only its own finishes.** The finish grid lists only the families CS2 makes for the star knife you
  carry. The Skeleton, Talon, Nomad and Stiletto have 20 of the 31 (no Lore, Autotronic, Gamma Doppler, Marked Up,
  Night, Bright Water, Emerald, Stonewash). The host refuses the others ("CS2 has no Lore for the Talon Knife"). It also
  says so when you switch to a knife that lacks your finish.
- **Back-ups and the pack.** A rebuild moves the old sets to `user-assets/fp.bak-<stamp>/`. The manifest is copied next
  to itself as `user-assets/manifest.bak-<stamp>.json`, including the three earlier copies that had been kept only in the
  temporary work folder. The asset pack and the app copy leave every `*.bak-*` back-up out (`tools/asset-pack-files.mjs`,
  shared with the tests). The pack test now checks the pack's real file list.
- **Other modes.** The five new sets wait until Global Defensive asks for them (its loading card, or a pick), so other
  modes load the same sets as before v53. The knife base-map cache line had been commented out by mistake; it is fixed.
- Tests: `tests/gd-knives.mjs` now has 36 checks.

## Molotov and incendiary like CS2, and never like the smoke (package FIRE)

- **CS2's inferno.** A fire is now up to 16 flames, each 42 units from the one it grew from, all within 150 units of where
  the bottle broke. They spread over the floor and down stairs and slopes, and stop at walls, doors and drops. Each flame
  burns 7 s from its own start. In the open, all 16 are there within about 0.6–0.9 s. Before this, the fire flooded a
  240-unit circle, about 3× CS2's area.
- **The same fire on every computer.** The host sends two small new fields: the bottle's speed when it broke (2 numbers)
  and a 16-bit mask of the flames put out. Every computer grows the same flames from the map, the spot and the grenade's id
  and throw time. This is checked over 15 ms and 100 ms host ticks and over a JSON copy of the host's state.
  `NET_PROTOCOL` is unchanged.
- **Smoke puts the fire out like CS2.** A smoke flying into burning flames pops there and then. The smoke's own volume (the
  same one the screen draws) puts out each flame it covers, and the rest burn on. A flame due to start inside smoke, or
  under a flame already out, never lights, so fire can't spread into smoke. A molotov that breaks inside smoke fizzles.
- **Damage:** a hit every 0.2 s that ramps from 1 to 8 (40 a second, CS2's `m_nDamage` 40). Kevlar now counts, by each
  grenade's own `m_flArmorRatio` in `weapons.vdata`: 1.8 for the molotov and 1.475 for the incendiary. So an armoured player
  takes less from an incendiary than from a molotov, and the vest wears down. You burn in your own fire. Team damage
  follows the existing rule.
- **The look**, from CS2's own particle files (`particles/inferno_fx` in your install). Each flame has a glow on the floor,
  fire over the floor, animated flames and (molotov) a thin dark plume — see FIRE final below. The molotov has embers and orange flames
  (`fire_small_sim_b`). The incendiary has brighter flames (`fire_small_sim_a_v02`, half blended) and CS2's spark filler
  instead of embers. A burst starts with CS2's fireball. A bottle in flight carries its burning rag, and an incendiary its
  sparks. A flame put out dies under CS2's dark swirl of smoke (colour 37,37,37, unlike the smoke grenade's light grey).
  Scorches stay on the floor for 45 s.
- **One draw for all fire.** Every flame, ember, plume, scorch, bottle and burst is one instanced mesh. It is compiled
  behind the loading card, and no shader was compiled during play in the picture run. Per frame only its clock, the bottles
  in flight and the lights change, and nothing is allocated (20 000 frames of two fires: 0 bytes). Each fire's light goes
  through the game's light pool. Low draws one flame and the glow per flame; Medium leaves out one flame and one ember.
- **Sound:** CS2's own events, when they are imported: `Molotov.Start` or `IncGrenade.Start` with `Molotov.Smash` /
  `IncGrenade.Pop` and the distant layer, `Inferno.Loop` while it burns, `Inferno.FadeOut` near the end,
  `Molotov.Extinguish` when it is put out, `Molotov.StartFailed` / `IncGrenade.StartFailed` for a burst in the air, and each
  grenade's own `*.Bounce`. All of them are placed, with walls and distance. The smoke now plays `BaseSmokeEffect.Sound`.
  Before this, the grenade view never reached these events: the molotov's burst played a window breaking. Without the
  import, our own sounds play. The put-out sound is a dull thud now, not the smoke's hiss.
- **Smoke vs molotov, everywhere they looked or sounded alike:**
  - The put-out puff used the smoke grenade's grey material, and its stand-in hiss sounded like the smoke's pop. Fixed.
  - The HUD slot and buy-menu fallback icons for the smoke and the incendiary had the same outline. The incendiary now has
    its own shape.
  - The kill feed showed the bottle or the can for a fire kill. CS2 shows its flame icon (`inferno`), and now so does ours.
  - In hand and in flight, each grenade already had its own CS2 model. The fire grenades now also burn in flight.
  - Bots avoid this fire's real flames, lit at the host's time. The radar draws neither smoke nor fire, as before.
- **Tests:** `tests/gd-fire.mjs` (48 checks, in `npm test`) covers the spread, determinism, LAN parity, putting out by
  smoke, damage per tick and kevlar, no allocation per frame, and that smoke and fire share no effect or sound event.
  `tests/arena-nades.mjs` now checks CS2's fire size. The muted browser run `tests/browser/gd-fire-shots.mjs` is on Dust II
  and made `~/Desktop/GD-v53-molotov.jpg`: smoke, molotov and incendiary side by side, the molotov's life, the incendiary,
  and a smoke thrown into a fire.
- **FIRE final (after review).**
  - *Determinism:* the spread's seed is now the fire's id and where it burst, not its throw time, which a pause moves on
    (a fire mid-spread through a pause grew a different fire with a stale end on clients). The doors and panes open or
    broken within its reach when it burst are stamped into the state (`g.mv`, as a smoke's), so a door opened later, or a
    late joiner, can't grow a different fire. More fires than the view's 10 slots no longer steal slots every frame (nine
    fires had restarted one fire a frame); a new fire waits for a free slot.
  - *The look, re-read from the files:* each flame is now two flame01a sprites reborn every 0.65–1.5 s with a random one
    of 4 flipbook sequences (CS2 picks a random sequence per sprite), radius 28–45 units, alpha 0.47–0.59, through CS2's 1D
    colour lookup gradient (half the texture, half the gradient), desaturation 0.15 / 0.3 and overbright 6 / 3. The
    incendiary keeps its own colour with its luminance as alpha (it used to be stretched to full colour), half blended,
    broken up by CS2's breakup texture at 0.1. So the two now share CS2's colours and sizes and differ by flipbook,
    gradient, blend and breakup, as the files do. A flame03a fire-gas sprite is drawn over each flame.
  - *The plume:* the earlier note was wrong. `molotov_child_flame03a` is an added fire-gas flame, not smoke, and the plain
    `molotov_groundfire` tree has no smoke at all. The thin dark plume now comes from `molotov_groundfire_00high`'s
    `molotov_smoking_ground_child02` (smokeloop_i_0, grey 36→8, alpha 0.39–0.78, 2–5 s, rising). It is drawn on every 4th
    flame of a molotov (about one puff a second) and can be seen in the picture. The incendiary's files have no smoke.
  - *Put out:* CS2's extinguish swirl puffs are now a colour between white and (37,37,37), alpha 0.16–0.24, life 0.2–1 s,
    growing 6→20× and rising fast, as `extinguish_fire_swirl_smoke` says. Before, it was one solid (37,37,37) puff at 0.75.
  - *Light:* both fires light in CS2's (242,211,147) (`*_groundfire_lighting`, the two files identical), not orange.
  - *In flight:* the molotov's rag (child1), its glow and its trail of small flames (child3: 0.25–0.5 s, rising). The
    incendiary has its white-hot desaturated flame, sparks and dark smoke trail (`weapon_incend_thrown`) and no glow.
  - *Sound:* air bursts carry their distant layer (`Molotov.StartDistant` / `IncGrenade.Distant`, StartFailed's child
    event). Each flame lighting plays `Inferno.Fire.Ignite` (instance limit 3). The can no longer uses the bottle's glass as
    its stand-in. The extinguish has its own stand-in id. An `Inferno.Loop` culled out of earshot is tried again twice a
    second, so you hear a fire as you walk up to it.
  - *Importer:* `tools/import-cs2-fire.mjs` takes 4 sequences × 4 frames per flame, the breakup and the plume, and runs
    only when run as a tool (importing it does nothing).
  - *Picture:* `~/Desktop/GD-v53-molotov.jpg` now shows the smoke alone on the clean spot beside the two fires, plus a
    second row with our own fallback art, which is what ships until the import is run.
  - The draw has 1728 instances (the earlier "1312" was wrong). `tests/gd-fire.mjs` has 63 checks.

## CS2's death cam and ragdolls (package DEATH)

- **Ragdolls** (`dist/gd-ragdoll.js`). A dying player now falls as linked rigid parts, as CS2's agents do. Before, the
  body tipped over its feet as one stiff piece, through walls and over ledges.
  - With CS2 imported (`tools/import-cs2-ragdoll.mjs` → `user-assets/ragdoll/cs2-ragdoll.json`), it is CS2's own ragdoll:
    the PHYS block of `agents/models/ctm_sas` and `tm_phoenix`. That is 15 bodies (pelvis, spine, head, upper and lower
    arms and legs, hands, ankles) with CS2's masses, capsules, damping and 14 joints: the knees are hinges, the rest are
    cone joints with CS2's swing and twist limits. Without the import, and on the built-in soldiers, our own ragdoll
    uses the same rules.
  - **Our reading, not verified:** the file names the limits but not their axes. We read "twist" as the bend about the
    joint frame's z axis, because that reading makes every joint bend the human way.
  - The physics are rigid bodies in fixed 1/64 s steps (CS2's tick), 8 substeps, on every preset. Gravity is CS2's
    800. The body collides with the map's own triangles, doors and breakables, but not with living players (as in
    CS2).
  - The push comes from the host's kill record: the killing hit's point, direction and hit group. So every computer
    pushes the same way. The impulse is Source's bullet impulse (2400 kg·u/s for 36 damage, **from memory**, CS2's
    files hold no force), scaled by the gun's damage. An HE or C4 pushes every part away from the blast. Fire and falls
    push nothing.
  - A body sleeps once every part moves slower than 0.8 u/s for 0.5 s, and is never simulated past 8 s. At most 10 move
    at once (4 on Low). A gap in a converted map's floor stops a body at the map's lowest surface.
  - The start pose is each computer's own drawn pose, so on stairs and ledges the final poses can differ a little.
- **Death cam** (`dist/gd-deathcam.js`). When you die, the view stays at your death spot. It eases back and up so your
  own body shows, turns to your killer and keeps them framed, then fades to black, and the first-person spectating of a
  team mate starts. The first-person-only spectating rule stays: this short look is CS2's one exception.
  - Verified from the install: the colour is `death_cam_phase1.vpost`, a colour table that keeps red and multiplies
    green and blue by 0.58, with its vignette (strength −0.0964, radius 0.0903, feather 0.4665, tint 0.533, 0.109, 0.109).
    `death_cam_phase2.vpost` is all black: the fade. Space skips ("[{s:bind_jump}] Skip",
    `Panorama_Death_Cancel_Start_Replay`). `Player.FreezeCam` has volume 0.0 in `game_sounds_ui.vsndevts`, so there is
    no shutter sound.
  - **Not verified:** the timings `spec_freeze_deathanim_time` 0.8 s, `spec_freeze_traveltime` 0.3 s, `spec_freeze_time`
    3.0 s, `spec_freeze_time_lock` 2.0 s and `mp_deathcam_skippable` 1. CS2 has these convars (they are listed in
    `scripts/workshop_cvar_whitelist.txt`), but their defaults are in its binary. These are the CS:GO defaults from
    memory, in one table (`CAM`). The fade lengths and the camera's step back (56 u) and up (22 u) are ours.
  - In respawn modes the cam ends before your respawn and fades out instead of being cut. A death while scoped uses your
    normal field of view.
  - Not done: the vpost's local-contrast block (it needs a blur-and-sharpen pass, a new shader).
- **Death panel** (`dist/gd-death-panel.js`), from `huddeathpanel.vcss`: 410 px wide, centred at the top, on
  rgba(0,0,0,.5) with the world blurred behind (no blur on Low), fading in over 0.3 s. It has the killer's avatar 66 px
  in an 80 px box with an 86 × 5 px #dee5c8 health bar, the name #cccccc bold 24 px, the line under it #c93121 bold 18 px,
  the weapon in a 150 px box, and "Damage taken" / "Damage given" with 3 px bars. The words are CS2's
  (`csgo_english.txt`): "killed you with their …", "… with your own …", "… with X's …", "YOU KILLED YOURSELF", "You
  burned to death", "You were killed by the C4 explosion". Names shrink to 14 px to fit, as CS2's `text-overflow: shrink`
  does. The host sends the damage between you and your killer this round (`dg` / `dt` on the down record) and drops it
  after 10 s. The avatar is our team-coloured silhouette (CS2 shows the Steam picture).
- **Cost:** every array is made with the rig at load. No new mesh, material or shader: the body's own skinned mesh is
  posed. Each kind of ragdoll is warmed at load behind the loading card on the match's map. The death cam and the
  spectating path allocate nothing per frame.
- **Tests:** `tests/gd-ragdoll.mjs` (48 checks: settling, sleep, the cap and the slowest-first eviction, the per-frame
  budget, catch-up, no allocation, the depenetration cap, stairs) and `tests/gd-deathcam.mjs` (54 checks: the phases,
  the skip lock, the respawn cap, the FOV, no allocation, mid-round joiners). The muted browser run
  `tests/browser/gd-death-shots.mjs` made `~/Desktop/GD-v53-deathcam.jpg` and `~/Desktop/GD-v53-ragdoll.jpg` (bodies on
  real stairs, a headshot, an HE).

## Batch B together (integration)

- All six packages were run together in one tree: `npm test` (every entry) and the packages' muted browser runs (see
  "Measured" below). No package's work was reverted.
- `tests/browser/gd-pacing-nades.mjs` is new: a 5 v 5 Defuse fight on Dust II on the High preset at Retina size
  (1920 × 1080 device pixels), with $16000 so you can buy and throw a smoke, your side's fire grenade, an HE and a flash
  while the bots fight. The same file runs on a 52.0.5 tree and on the batch A tree, for comparison.

## Stage 6: smooth without a graphics card (package PERF)

Global Defensive now has its own **Graphics preset** (Settings → Graphics preset, in a match): **Auto**, Ultra, High,
Medium, **Low** and **Very Low**. Other modes keep their Graphics mode exactly as before. (CS2's own presets are Low /
Medium / High / Very High, and CS2 also offers "your system's recommended defaults": `csgo_english.txt` 44492,
44614-44621. Ours has Auto plus five presets, as the spec asks.)

- **Auto, detected once per computer** (`dist/gd-preset.js`). The game reads the graphics chip's name
  (`WEBGL_debug_renderer_info`) and runs a 2-second test on a small canvas of its own. The test runs only while the
  Global Defensive start panel is open or, for a guest who joins straight in, behind a match's loading card. It never
  runs during play. A result that arrives during play waits for the next loading card. Before that, the chip's name
  alone places the computer. A graphics card → High; Intel Iris Xe, Arc, Radeon 680M/780M and Apple chips → Medium;
  Intel UHD / HD and Radeon Vega → Low; SwiftShader, llvmpipe or Microsoft Basic Render Driver (no graphics
  acceleration) → Very Low. A slow test moves the choice down, never up. A message says what was picked.
- **A computer that ran v52** keeps its Graphics mode as its GD preset only if it is **High or Ultra**, so your Mac keeps
  High. A saved "Medium" or "Low" is not kept, because v52 wrote those by itself: the default value was saved with any
  other setting, and its first-match test and software start-up saved them too. Those computers get Auto: a UHD 620
  laptop gets Low and a software PC gets Very Low (review fix). v52's own first-match test no longer runs in Global
  Defensive, so its "Graphics set to Performance/Balanced" message can't contradict the new one.
- **Low and Very Low** (spec 5.2):
  - the picture at 80 % (Low) or 60 % (Very Low) of the screen's pixels, never more than a 1080p screen's and never a
    higher pixel ratio than Medium's (review fix: in a small window on a 2× screen Low drew more pixels than Medium),
    with a new **sharpen pass** (`dist/gd-sharpen.js`: 5 samples, clamped so edges never ring, folded into the last
    pass). On 1920 × 1080 at 150 % Windows scaling, Low draws 1536 × 864; in your MacBook's window (1470 × 956 at 2×),
    1428 × 929;
  - the dynamic resolution steps down from there to 60 % (Low) / 50 % (Very Low) and holds 60 fps. On a software
    renderer its target is 30 fps, but no measured run reached it (see below);
  - baked map light only: no real-time shadows, no glow, no anti-aliasing; on a software renderer no post-processing at
    all (not even the sharpen);
  - the smoke marched at a third of the resolution or less, CS2's lowest particle detail, one flame per fire, 4 ragdolls,
    fewer bullet holes (64 on Low, 32 on Very Low, of 128);
  - **textures capped with mip-maps**: guns (also the first-person gun's own 2048 px pictures), agents, gloves and skins
    at 1024 (Low) / 512 (Very Low). On Very Low the map's own pictures are also capped at 512, and its baked light map
    and sun mask (8192 px on Dust II) are drawn at 4096 (review fix). The baked light is softer, but it is still CS2's.
    Measured texture memory on Dust II (the overlay's estimate): High and Medium 1121 MB, Low 1089 MB, Very Low
    634 MB (it was 938 MB before the map and light-map caps);
  - players farther than 15 m animate every other frame (their meshes and materials stay the same: see Partial);
  - at most 24 sounds at once (40 otherwise);
  - the radar redrawn 15 times a second;
  - **no blurred HUD backgrounds**: the kill tally's badge and cards, the alerts and the round banner get CS2's dark fill
    without the blur (batch B measured the always-on blur at about 4 fps at 4× CPU). Medium and up keep CS2's blur.
- **For every preset:** the radar's letters and numbers are drawn from small pictures made once and looked up per site
  and per player slot, so no font is set on the radar in a frame and no text is built for it (batch B's profile: 2.2 ms
  a frame at 4× CPU in "set font"; now 0). `#emote-preview-tag` is no longer written every frame (only when it changes).
- **Performance overlay (F9):** also shows the preset in use (whether it is Auto, set or kept from v52, the chip's class
  and the test time), the textures' video memory (an estimate, worked out a slice per frame so the overlay adds no
  spike of its own; review fix: the whole walk took 1.2–8.4 ms in one frame every 2 s), and, in the tests, a clear
  "EMULATION … not a Windows measurement" label.
- **Desktop app** (`desktop/main.mjs`, spec 5.3): already asked for the high-performance GPU, left ANGLE on Direct3D 11,
  ignored the GPU blocklist and turned background throttling off (since v51, in every mode). Nothing was changed for other
  modes. The flags are now documented in place and checked by a new test. Shaders stay compiled behind the loading card,
  and a preset changed in a match now warms its own shader variants straight away.
- **Frame pacing** (spec 5.4): the 60 fps cap is the existing "Frame rate limit → 60 FPS". No shader was linked during any
  measured fight on any preset.
- **New tests:** `tests/gd-low-preset.mjs` (116 checks: the preset by chip name for 20 real renderer strings, the
  test's rule, the setting and the v52 rule, the spec 5.2 table, the render scale in pixels, the 24-voice cap played
  through a recording Web Audio, the texture / LOD / radar / decal caps, the HUD rule, the wiring, and the draw-call
  budget, read back from the browser run's recorded result with its date) and `tests/desktop-flags.mjs` (27 checks).
  `tests/gd-perf-overlay.mjs` now also checks the texture-memory sum, the walk in slices, the preset text and the
  EMULATION label. `tests/browser/gd-presets.mjs` measures every preset in a real match at your MacBook's window size,
  including a **staged 10-player fight**: all 9 bots held in view 4–15 m away, shooting, with you firing and throwing an
  HE. It also makes the comparison picture. `tests/gd-other-modes-untouched.mjs` audits `dist/app.js` as a shared file
  (every change in a Global Defensive branch) instead of requiring it byte-identical.

### Measured — EMULATION on the MacBook (Apple M3), never on Windows

There is no Windows laptop here. Every number below is from this Mac, in muted Chrome, labelled as emulation. Solo
Defuse on Dust II, 10 players. "Fight": you strafe, fire and throw grenades from the spawn view for 16 s. "Staged": all
9 bots held in view, as above, for 8 s.

| preset | how | picture drawn | fps | p95 | p99 | max | draw calls p95 (max) | staged fight: draws p95 (max), fps | programs linked |
|---|---|---|---|---|---|---|---|---|---|
| High | M3, 1× CPU, 1470×956 at 2× | 2074×1349 | 60.1 | 17.1 ms | 17.6 ms | 33.3 ms | 423 (426) | 450 (464), 60.0 | 0 |
| Medium | M3, 1× CPU, 1470×956 at 2× | 1617×1051 | 56.7 | 17.2 ms | 49.9 ms | 217 ms | 408 (415) | 435 (446), 60.0 | 0 |
| Low | M3, 1× CPU, 1470×956 at 2× | 1428×929 | 60.1 | 17.0 ms | 17.4 ms | 17.7 ms | 359 (361) | **380 (383)**, 60.0 | 0 |
| Very Low | M3, 1× CPU, 1470×956 at 2× | 1071×696 | 59.9 | 16.9 ms | 17.5 ms | 50.8 ms | 359 (361) | 365 (366), 60.0 | 0 |
| Medium | CPU ×4, 1920×1080 at 150 % | 1920×1080 | 53.0 | 33.4 ms | 34.2 ms | 50.9 ms | 412 | — | 0 |
| Low | CPU ×4, 1920×1080 at 150 % | 1280×720 (stepped down) | 59.1 | 17.6 ms | 33.3 ms | 49 ms | 367 | — | 0 |
| Very Low (Auto) | SwiftShader on the M3's CPU, 1280×720 | 768×432 | **2.9** | 933 ms | 4.6 s | 4.6 s | 365 | — | 0 |

In the 1× runs, Medium had one hitch (217 ms) and Very Low one 51 ms frame. In the run before it, with the same code
apart from the Very Low texture caps, Medium was 60.1 fps (max 17.8 ms) and Very Low 60.1 fps (max 17.7 ms).
Other agents' test runs were loading this Mac at the same time. The two 4× rows and the software row are from earlier
runs (the 4× ones at 1920×1080 at 150 %, before the review fixes). The picture
`~/Desktop/GD-v53-presets.jpg` shows the same spawn view on the four presets, with the overlay.

- **Low stays under 400 draw calls** in a full 10-player fight: in the staged fight, with all 9 bots in view and shooting, at most 383 draw calls
  (p95 380). CS2's agents are always drawn, whether or
  not they are in view (`cs2-agents.js` sets `frustumCulled = false`), so the spawn-view fight already pays for all
  ten of them. Medium and High draw more (the players' own sun shadows on a baked map, from Medium up).
- **Medium misses spec 5.5's Iris Xe target in the 4× CPU emulation**: 53.0 fps against the target of 60, p95 33.4 ms,
  and 1 frame over 50 ms in about 1060 frames against the target of under 1 in 1000. It is CPU-bound. Medium has no
  render scale of its own, so a smaller picture won't fix it. It needs less main-thread work per frame: the agents'
  animation, the HUD and the effects.
- **The software renderer is not playable yet.** Auto picked Very Low by itself (chip "SwiftShader", test about 680 ms)
  and drew 768 × 432 with no post-processing, but reached **2.9 fps** (p95 933 ms). SwiftShader works out every vertex on
  the CPU, and a Dust II fight is about 1.9 million triangles a frame (the map 1.5 M, the ten CS2 agents 0.5 M). The
  pixels are not the problem, and the dynamic resolution cannot help: it never stepped below the preset's start, and
  it does not move during a live round. Reaching the 30 fps target needs a lighter copy of the map and the agents, made
  when they are imported (not done). A real Microsoft Basic Render Driver was not measured.
- **Your High preset at your MacBook's real window size** (1470 × 956 at 2×, drawn at 2074 × 1349;
  `gd-pacing-nades.mjs`, 4× CPU, 20 s, the trees run in turn, 3 rounds):

  | tree | round 1 | round 2 | round 3 | mean |
  |---|---|---|---|---|
  | this worktree (stage 6 plus other packages' work in progress, such as the C4 on the back) | 48.8 | 48.5 | 48.3 | 48.5 fps |
  | batch B (HEAD) | 49.5 | 49.9 | 48.6 | 49.3 fps |
  | 52.0.5 | 52.3 | 52.7 | 51.7 | 52.2 fps |
  | stage 6 alone on batch B (no other package's work in progress), a second set under heavier load | 44.6 | 46.5 | 41.8 | 44.3 fps |
  | batch B, the same second set | 44.8 | 41.6 | 45.9 | 44.1 fps |

  Stage 6 alone is the same as batch B within the noise. The worktree as a whole is about 0.8 fps (1.6 %) behind batch
  B in every round, and that tree also holds other packages' unfinished work. **High is still about 3 fps behind
  52.0.5 at 4× CPU** (open-after-B #33: mostly CS2's HUD blur, which High keeps). This stays open.
- **The 2-second test** read 0.25–0.43 ms on the M3 (six runs) and 680 ms on SwiftShader. Its limits for the other
  chips (Iris Xe, UHD 620, Vega 8) are worked out from their published speed, not measured on them.

### Partial in stage 6

- Normal maps are not dropped past 10 m, and the agents and guns have no lighter models past 15 m: only their animation
  is halved there. Both need new shader variants warmed behind the loading card (or lighter meshes from the importer).
- The software renderer reaches about 3 fps, not 30, and the dynamic resolution's 30 fps target is not shown working
  (see above).
- Medium at 4× CPU (the Iris Xe emulation): 53 fps, not the 60 the spec asks for (see above).
- Your High preset is not faster than batch B, and it is about 3 fps behind 52.0.5 at 4× CPU (see above).
- Real Windows laptops (Iris Xe, UHD 620, Vega 8) were not measured; the table's targets for them are not confirmed.
- No SSAO exists on any preset (spec 4.1 asks for it on High / Ultra). (Package LOOK below adds it on High / Ultra.)

## Map look and the HUD's look like the CS2 pictures (package LOOK)

Every map's look settings now come from the CS2 install on this computer. `node tools/import-cs2-look.mjs` reads them
into `user-assets/look/look.json`. It backed up first, to `~/CS2-extract/backup/look-*`, and added only `models.look` to
the manifest. Without the import, each map keeps the old fixed look.

- **Auto exposure like CS2's** (`dist/gd-exposure.js`). Each map's exposure now moves inside the range set in that map's
  `post_processing_volume` entity (`minexposure` / `maxexposure`, `exposurespeedup` / `exposurespeeddown`):
  Dust II 0.925–1.1, Mirage 0.8–1.0, Inferno 0.8–1.1, Nuke 1.0 / 0.85, Anubis 0.7–1.8, Ancient 1.0–1.7,
  Overpass 0.8–1.2. Before, every map used one fixed value.
  - **Nuke's range is reversed in its own entity** (minexposure 1.0, maxexposure 0.85, hammeruniqueid 2:61814:38404). CS2's
    clamp then holds Nuke at 0.85, and so does ours. The CS2 footage fit gave the same 0.85.
  - **How it works:** the frame's brightness is measured on the graphics card (the picture is shrunk to 32 × 32, then to
    1 × 1, between two tiny targets). The game never reads pixels back to the processor. The exposure moves at the same
    speed at any frame rate. Both shaders are built behind the loading card.
  - **Not in CS2's files:** the brightness the exposure aims for, and exactly what the two speeds mean (we treat them as
    rates per second).
  - **The brightness it aims for is set per map** (after review). One value for every map (0.205, the 3D view of
    `cs2-hud.png`) pushed several maps to the wrong end of their range compared with CS2's own footage: Dust II 1.10
    instead of 0.925, Inferno 1.10 instead of 0.8, Anubis 0.80 instead of 1.8. We measure the picture after each map's
    colour grade, and the grades differ, so one value cannot fit all. Each map's value is now the brightness our game
    shows at CS2's footage exposure (`~/CS2-extract/build/exposure_fit.json`) in its two spawn views: Dust II 0.129,
    Mirage 0.240, Inferno 0.0875, Nuke 0.0995, Anubis 0.341, Ancient 0.0886, Overpass 0.0309. These are our own
    calibration, not CS2 data. A map without a footage fit keeps 0.205.
  - **Nuke's washout is not fixed by this.** Nuke's reversed range holds it at 0.85, which is the same value as before.
    The bright white walls in the Nuke pictures come from elsewhere (the curve, the colour table or the bloom) and are
    still open.
  - **Measured at real size (2940 × 1912), first view → second view:** Dust II 1.092 → 1.099; Mirage 0.809 → 0.989;
    Inferno 1.083 → 1.1; Nuke 0.85 → 0.85; Anubis 1.58 → 0.798; Ancient 1.7 → 1.7; Overpass 1.192 → 1.2 (High).
    Each stays inside its map's range on High and on Low. Ancient and Overpass sit at the top of their ranges in these views.
- **Screen bloom from each map's `.vpost` CBloomLayer**, on Medium and up only. Low and Very Low have none.
  - **Medium's edges** (fixed after review). Before LOOK, Medium drew straight to the screen with the browser's 4×
    anti-aliasing. The bloom and the exposure now need a post-processing buffer on Medium, and that buffer had none.
    We first gave the buffer 4× anti-aliasing. A Medium A/B at 2940 × 1912 then measured 25.5 and 27.3 fps (staged fight
    32 fps) with it, 53.6 fps (staged 59) with the buffer and no anti-aliasing, and 40.8 fps (staged 33) with no buffer
    at all (Medium as it was before LOOK). So Medium now smooths its edges in the last pass instead (`dist/gd-fxaa.js`).
    CS2 has a post-process option like this too: CMAA2, in its anti-aliasing list (`csgo_english.txt`). **Not CS2:** ours
    is FXAA, not CMAA2. With FXAA, Medium measured 57.3 and 51.0 fps (staged fight 57 and 38). With the look turned
    off on Medium, it measured 53.6 fps (staged 60). These are the same within this Mac's run-to-run spread.
  - The map's `m_vBlurTint` is now really applied. Before the fix, the bloom pass reset it to white every frame. Every
    map's tint is white today, so nothing looks different.
  - SCREEN blend: Dust II 0.184, Mirage and Overpass 0.1261, Anubis 0.0301, Nuke 0.0112.
  - ADD blend: Inferno 0.12, Ancient 0.163. Their screen strength is 0, but their files use the ADD blend, so they do bloom.
  - The bloom's thresholds come from the same files. **Conflict:** spec 4.1 asks for "bloom on lights and fire only".
    CS2's files bloom the whole screen, and the standing rule ("all things should be like CS2") wins.
- **Fire and muzzle light on the baked map.** The baked map materials ignored three.js lights. They now have a fixed set
  of 6 point-light slots. The set is built at load and its size never changes, so no shader is built during a round.
  A molotov lights the floor around it: one slot is filled in the picture test, and 0 shaders were built.
- **SSAO** (`dist/gd-ssao.js`) on High and Ultra only, at half resolution, 8 samples. It is built at load and is off on
  Medium and below.
  - **Fixed after review:** the first version drew into the composer's other buffer and cleared its depth, so on High a
    smoke behind a wall showed through the wall, and a smoke covered a player standing in front of it. SSAO now darkens
    the scene's own buffer in place (a multiply blend, no clear, no swap), so the smoke reads this frame's depth. A unit
    test runs the real composer in the game's pass order. The picture test also samples the depth the smoke receives on
    the graphics card: on High with SSAO, 58 of 64 samples are nearer than the far plane (before the fix, none would be). **Not CS2:** CS2's "Ambient Occlusion" setting is soft occluder shapes on characters and props, not a
  screen-space pass. We added the screen-space pass because spec 4.1 asks for it.
- **Easier to see players:** a small saturation lift (× 1.12) on agents, and the darkest shade an agent can get raised from
  0.30 to 0.36. Both apply to agents in GD only. CS2's "Boost Player Contrast" is built into its program; its exact shading
  is not in the files.
- **Fixes found on the way:**
  - Ancient on High showed a white square. The water material reflected the global environment, and the High glow was
    brightening one of the map's own untextured materials. The water is now a Lambert material, and map materials are
    excluded from the glow.
  - SSAO no longer produces NaN on the sky.
  - The bloom input is clamped, so one very bright pixel no longer blooms.
- **Kill cards** (`dist/gd-kill-emblem.js`). Measured against `cs2-kill-emblem.png` and `-ace.png`:
  - The cards are drawn 1.126 × CS2's stylesheet size and sit 44 px above the badge. The first LOOK version used 1.103 and
    45 px, and reported a height of 0.790. That number was the module's own constant, not a measurement. Measured from
    the pixels, it was 0.78.
  - The sizes are now measured from pixels (`tests/browser/gd-emblem-hud-shots.mjs`): 1920 × 1080 drawn at 3×, with the
    badge hidden, and the card outlines' rows and columns counted. A card is 0.802 badge diameters tall (CS2 0.79). The
    3-kill fan tops 0.620 above the badge (CS2 0.62) and is 1.094 badges wide (CS2 1.06–1.10). Measuring at 1× was too
    coarse: two runs differed by 0.015.
  - Every kill shows its card from the first one.
  - The number and the skulls are CS2's own `kill_N` and `kill_pip` images, scaled with the card. They come out at about
    13 px and 9.3 px tall, against the 14.5 px and 10.5 px measured in CS2's picture. The difference is 1–1.5 px, about
    what a glyph measurement on a 12 px number can miss. We did not resize CS2's images separately from their card.
  - The dot grid on the card is at 0.05 opacity, so it is nearly invisible.
- **HUD colours, from `cs2-hud.png` and the install's stylesheets:**
  - The money is white: `hudmoney.vcss` gives `defaultColor #ffffff`, and green #8fff6f appears only on its + animation.
  - Health, armour, ammo and their bars keep CS2's HUD colour. The default is Team Color, which is gold #eabe54 on T.
  - **This differs from the package brief,** which asked for white health and ammo and green money. The picture measures
    the money at (240, 215, 160), like the white chat text under its warm cast. It measures "100" at (235, 205, 119),
    which is the T team colour.
- **The HUD's per-frame object** in `gd-hud.js` is now reused, so the HUD allocates nothing per frame.

**Performance at real size** (`tests/browser/gd-presets.mjs`, 2940 × 1912, re-run after the review fixes on 2026-11-04,
0 shaders built during fights; other agents' tests were loading this Mac at the same time):

| preset | fps | p95 | staged fight fps | staged draws max | first LOOK run | stage 6 (PERF) fps |
|---|---|---|---|---|---|---|
| High | 56.8 | 17.7 ms | 60.0 | 470 | 55.7 | 60.1 |
| Medium | 53.2 | 33.4 ms | 56.1 | 433 | 54.3 | 56.7 |
| Low | 60.1 | 17.4 ms | 60.0 | **384** | 60.1 | 60.1 |
| Very Low | 60.1 | 17.1 ms | 59.0 | 384 | 60.1 | 59.9 |

Low stays under 400 draw calls. In a High A/B in the first LOOK run, with SSAO and exposure on, both runs reached 60.1 fps
(p95 16.8 and 17.0 ms). With SSAO off they reached 55.1 fps, and with SSAO and exposure off 57.1 fps. That spread is
machine noise, not the passes. The Medium A/B is above, under bloom.

**Partial (LOOK):**
- PBR normal and roughness maps, the close-up detail normal, and per-area cube maps are not done.
  - The converted map files (`user-maps/*.glb`) hold no normal or metal/roughness textures.
  - The map's env_cubemap and light-probe entities are imported and listed in `look.json`, but their cube-map arrays
    (`env_cubemap_array.vtex`) are not converted yet. Metal and glass still use the global environment.
- The exposure's target brightness and the meaning of its speeds are ours (see above). CS2's files do not hold them.

**Not like CS2 yet (LOOK, listed after review):**
- **Sky bloom:** each `.vpost` has `m_flSkyboxBloomStrength` (Inferno 0.1557, Dust II 0.9994, Nuke and Ancient 1.0). It
  is imported but not used, so our sky blooms at the full strength. On Inferno, CS2 blooms its sky at about 0.16 × the
  scene's strength.
- **Bloom thresholds are approximate.** CS2 thresholds the HDR scene. We threshold the graded picture, and cap the start
  at 0.92. On Anubis (threshold 9.999 and width 9.999), where CS2 blooms little more than the sun, our near-white pixels
  bloom at its very small strength of 0.0301.
- **SCREEN blend above white:** the blend runs on the HDR buffer. Where a pixel is brighter than 1 (High's glowing lamps,
  fire and muzzle sprites), the blend takes a little off it. The bloom's own value is at most its strength (≤ 0.184), so
  such a pixel never drops below 1. It still shows as white with the default "off" tone mapping. With filmic or AgX tone
  mapping, the very brightest highlights come out slightly dimmer.
- **SSAO** is a screen-space pass. CS2 uses AO proxies (see above).

## Smoke and flash lineups: bounce, roll and rest like CS2 (package LINEUPS)

What a grenade does after it first touches something was checked rule by rule against Source's grenade code, which CS2's
grenades inherited (`CBaseCSGrenadeProjectile::ResolveFlyCollisionCustom` in the public Source SDK: these are Source
rules, not in the CS2 files), and every change was measured on all 366 public CS2 lineups.

- **One full bounce a tick, as in Source.** A grenade keeps 45 % of its speed when it hits something (0.45 × the
  surface's 1.0, or 0.3 off a player, at most 0.9). Source traces a grenade's move once a tick (1/64 s) and handles that
  one hit; the rest of that tick it is only pushed along, which stops at whatever it meets without changing its speed.
  Ours now does the same: a second touch in the same tick only pushes it out of the surface, and the next tick bounces
  it again. The old rule let that second touch slide it along the surface, so grenades rolled on along ledges and off
  them. A rolling grenade now loses 55 % a tick and stops in as many ticks as in Source (3 ticks from 300 units/s).
  An earlier draft of this package bounced on every touch within a tick too (209 lineups); that is not Source's rule,
  and Source's rule lands 208 of them on its own.
- **A grenade that hits a player** now goes through the same rule: 0.45 × 0.3, and stopped (never at rest: a player is
  not a floor) when slower than 30 units/s. Before, a slow grenade on a head kept bouncing.
- **Edges and corners answer like a box.** Source's grenade is a small box (±2 units), so at an edge or a corner it
  bounces off a flat plane: the face it met, or a straight axis. Ours used a rounded direction there, which threw
  grenades sideways off ledges, window frames and door edges. Which plane is picked at an edge is our own rule, fitted
  to the public lineups. (+12, −2.)
- **CS2's window panes now break.** CS2 gives its Nuke and Anubis window props the collision property "window": "Solid
  but does not block light or LOS", with nothing excluded, so solid to grenades (`scripts/collision_properties.txt`).
  The props break in CS2 (their break pieces, such as `models/props/de_nuke/windows/nuke_window_84x68/piece.vmdl_c`, are
  in the install). The importer had left them as plain world, so grenades bounced off them. Now each one becomes a
  breakable glass pane when the map loads (8 on Nuke, 15 on Anubis): a grenade or a bullet breaks it for everyone, the
  host decides, and it is whole again next round. A grenade flies on through at full speed. CS2's own lineups through
  these windows pop where an unslowed grenade does (Nuke T Roof → A flash and the silo yard flash: 557 and 513 units off
  before, 4 and 6 now); slowed to Source's 0.4 they pop short and miss, so "full speed" is fitted. The map file has no
  per-triangle layer, so the panes are found by shape (thin see-through boxes, at most 0.7 units thick, 20 to 100 units
  across; also fitted). The map files are not changed.
- **Other breakable glass** now keeps 0.4 of the grenade's whole velocity, Source's rule for breakable glass ("slow our
  flight a little bit", in the same function as the 0.45). It used to keep 0.15 of the run and no upward speed, which
  was ours. No public lineup goes through such glass, so the hit count does not change.
- **Checked and kept as they were:** the elasticity of 0.45 (the hit count drops on either side of it), the 30 units/s
  floor stop (Source: speed² < 30²), the 0.3 bounce off players, and the grenade's size. Our 2.27 units is close to
  Source's 2; 2.0 and 3.0 both land fewer lineups.
- **The smoke's detonation was checked and left as it was. It is not like Source.** Source looks again every 0.2 s while
  a smoke still moves faster than 0.1 units/s. Ours goes off on the tick it comes to rest. Against the public air times
  (139 smokes, rounded to 0.1 s) the two are equally good: 0.308 s off on average now, 0.317 s with the 0.2 s clock.
  Where it comes to rest is the same either way.
- **The test now counts flashes that come to rest before 1.6 s.** In the test, a flash that came to rest before its pop
  used to count as a miss. It now counts where it lies, which is where the game pops it.

Hits within 32 units of CS2's spot for smokes, or within 16 units at the 1.6 s pop for flashes, measured the same way
before and after (`tests/gd-lineups.mjs`):

| | before | after | median miss, units (before → after) |
|---|---|---|---|
| all | 189 / 366 | **209 / 366** | 29.0 → 13.5 |
| smoke, standing | 48 / 77 | 52 / 77 | 11.5 → 11.0 |
| smoke, crouched | 2 / 3 | 2 / 3 | 29.0 → 29.0 |
| smoke, jump-throw | 83 / 217 | 94 / 217 | 63.6 → 47.5 |
| flash, standing | 31 / 37 | 32 / 37 | 5.6 → 5.5 |
| flash, crouched | 0 / 1 | 0 / 1 | 368.5 → 368.5 |
| flash, jump-throw | 25 / 31 | 29 / 31 | 5.7 → 5.4 |
| Mirage (smokes / flashes) | 21 / 11 | 22 / 12 | |
| Dust II | 29 / 17 | 33 / 19 | |
| Inferno | 19 / 5 | 20 / 5 | |
| Nuke | 11 / 3 | 15 / 5 | |
| Anubis | 20 / 3 | 21 / 3 | |
| Ancient | 23 / 9 | 27 / 9 | |
| Overpass | 10 / 8 | 10 / 8 | |

21 lineups were gained and 1 was lost (Inferno balcony / mini pit smoke from A Long: 30 → 111 units, lost to Source's
one-bounce-a-tick rule). Of the lineups that still miss, 10 end more than 50 units further off than before and 5 more
than 50 units nearer. The flashes that already popped on CS2's spot still do, 5.24 units off on average before and
after (56 flashes). Sources: the bounce rules and the 0.4 glass rule are Source SDK rules, not in the CS2 files. The
window layer is from CS2's `collision_properties.txt`. "Windows let a grenade through at full speed", the window shape
rule and the edge rule are fitted to the public lineups (`tests/fixtures/cs2-lineups-public.json`, which players
publish; they are not CS2 files).

**What is left (157 misses).** 52 of them pass within 32 units of CS2's spot, 59 within 33 to 128 units, and 46 never
come within 128 units. 24 of the 52 near misses end more than 32 units past CS2's spot along the throw (33 to 184
units), so some of our smokes still travel too far after landing. None of the Source rules above explains it. Of the 46
far misses, 38 are jump-throws whose first touch is already far from CS2's path. Two named cases:
- Anubis Top Mid smoke from T spawn (1920 units off, before and after): CS2's spot is 2270 units across the map from the
  throw. A standing full throw reaches about 1400 to 1500 units at most (675 units/s at 0.4 × 800 gravity), so the lineup
  as published cannot land there. Our flight hits the overhang 270 units above the thrower at step 35 and drops back.
- CS2's railings let grenades through (`csgo_railing`: "Solid but exclude bullets & grenades"); ours are still solid.
  See "Partial" below.

- Tests: `tests/gd-nade-bounce.mjs` (new, 14 checks: the 45 % reflection, one full bounce a tick in a corner, the roll
  losing 55 % a tick, the 30 units/s stop, the 0.3 off a player and the stop on a head, the box edge, window panes found
  and turned into breakable glass on Nuke and Anubis, the 0.4 through other glass and full speed through a window, the
  smoke going off at rest), `tests/arena-nades.mjs` (glass: 0.4) and `tests/gd-lineups.mjs` (the new totals, which may
  not drop on any map).
- Picture: `~/Desktop/GD-v53-lineups-bounce.jpg`.

## Hits: blood, impacts, hit sounds, tagging, the mix and money (package HITS)

Every number below is from the user's CS2 install (`particles/blood_impact/*.vpcf`, `particles/impact_fx/*.vpcf`,
`game_sounds_player.vsndevts`, `weapons.vdata`, `scripts/soundmixers.txt`, `sounds/graphs/__main__.vmix`) unless it
says **ours** or **CS:GO**.

- **Headshot blood no longer covers the screen** (`dist/gd-blood.js`). Each emitter now has CS2's screen-size cap and
  fade (`m_flMaxSize`, `m_flStartFadeSize` / `m_flEndFadeSize`), its own FadeOut window, and InterpolateRadius with
  Source's `Bias()`. A headshot is `blood_impact_headshot.vpcf`'s real children: 01b, 01c (8 wisps drawn with a new
  wispy spray cell, not the opaque chunk), 01d, 01e, `red_01_chunk` ×2 and `red_01_backspray`. `red_01_mist` and
  `drops1` are no longer on headshots. Which system CS2's code fires for each hit is not in the files.
- **Your own wounds** show CS2's local-player splatter: `blood_impact_localfrontenemy` (`_splatter_lft` / `_rgt`, 5 to
  10 splats by damage), `localrearhit` from behind, and `lp_spray` on every hit. It is one pooled draw, warmed at load.
  A front hit always draws both children, the left and the right edge, each laid in order down its own path, as the
  file lists both and places each child's path (x ±100, y 100 to −50). **How that path maps onto the screen, and how
  big, is ours.** CS2's code places those control points, and that code is not in the files.
- **Bullet impacts** (`dist/gd-impacts.js`):
  - Concrete's `ricochet_sparks_sparse` is drawn at its full 1 HU width with the soft `spark.vtex` profile and the warm
    (195,184,166) tint, as short glints with a 0.1 s length fade-in and a 20 HU cap. These were the two long white streaks.
  - The **radius curves**: a `C_OP_SetFloat` on the radius with a curve over the particle's age. Several emitters used
    to keep their starting size. Now concrete, plaster and glass `*_base` add up to +10.9 HU at 0.164 s and +19.15 HU at
    1 s. `impact_glass_dust` and `impact_plaster_smoke` add up to +44.7 HU at 2 s, and `impact_dirt_child_smoke_puff`
    does the same. `impact_concrete_child_smoke` grows ×1 → ×4 over its life (this was misread as "grows from nothing").
    `impact_dirt_child_smoke` follows its curve from ×0.1 to ×3 at 0.5 s. **Ours:** the keys are joined in straight
    lines (CS2's tangents are not modelled), and the op's output field is not written in the file, so we read it as the
    radius (the default). The concrete smoke's `flOpStrength` rnd(1..2) scales its radius.
  - **Control point 6 comes from the files** (it was our guess before, and it ran the wrong way). Each surface's parent
    system sets it itself with `C_OP_DistanceBetweenCPsToCP`, from the hit to control point 5, which `impact_dirt.vpcf`
    notes is "the start of the Shot". `impact_concrete`, `impact_glass` and `impact_plaster_high`: 100 to 800 HU gives
    1 to 0. `impact_dirt`: 1 to 0.1. Metal, tile and wood set none. `impact_fx_hit_darken` sets its own from the local
    player (50 to 1200 HU).
  - The children read CP6 through their own **curves**, not as a straight multiplier: the count remaps (concrete smoke
    4 to 1, glass dust 3 to 2, plaster smoke 1 to 2, dirt puff 2 to 1, darken 2 to 1) and the alpha, life and radius
    curves on concrete, plaster, glass, dirt, the darkening and `impact_generic_burst_2`. Every curve's keys and slopes
    are read back from the vpcf by `tests/gd-impacts.mjs`.
  - What it looks like now: a concrete hit within 100 HU gives one bright puff (alpha × 0.86, life × 0.69) and
    `generic_burst_2` at its longest life. At 800 HU or more it gives four faint short puffs, and `generic_burst_2` is
    twice as wide.
  - **Ours:** the curves are evaluated as cubic Hermite through the stored slopes (the editor's tangent modes are not
    modelled). An unset control point 6 (metal, tile, wood) is 0. The darkening's output range is not in its file, so it
    uses Source 1's default (0 to 1), and its count's `REMAP_BIASED` uses Source's `Bias` at (p + 1) / 2. For another
    player's shot the distance is measured from your eye, not the shooter's (the impact pool takes the shot's length as
    an optional `len` when a caller has it).
  - The spark cores on metal, wood and the other surfaces are cream, as the files say, not "deeper orange" (open-B #17).
- **Armour hit and kill sounds** (`dist/gd-sounds.js`, `dist/gd-hit-feedback.js`). The host adds a 1-bit `ar` to the
  hit and to the blood record: a chest or stomach hit while the victim had kevlar before the hit.
  - Hits on armour play `Player.DamageBodyArmor.AttackerFeedback` (with `.AttackerFeedbackFlesh`), `.Victim` and
    `.Onlooker`.
  - Kills on armour play `Player.DeathBodyArmor.*`.
  - `Player.DamageBody.Knife.AttackerFeedback` is `null.vsnd` in CS2, so the knife's attacker hears nothing here too.
  - Without CS2 imported, a kevlar tick we synthesise stands in. The 2-voice and UI-mix limits of spec 2.2 still apply.
  - The kills also carry CS2's child event `Player.DeathBody.Flesh` (armour or not): `Player.DeathBody.Victim` and
    `.Onlooker`, and `Player.DeathBodyArmor.Victim` and `.Onlooker`. Onlookers now hear every body hit they see
    (`Player.DamageBody.Onlooker`), not only headshots and armour hits. The HE plays both of `BaseGrenade.Explode`'s
    children, `.ExplodeDistant` and `BaseExplosionEffect.Sound`.
  - The shooter's hit feedback can take the hit result's own `ar` and `w` (`hit(kill, head, helmet, ar, w)`); without
    them it still reads your newest blood record. `lab.js` reportHit (package GUNS) can pass them.
- **Tagging by the attacker's weapon** (`dist/combat-logic.js` `hitTag` / `flinchTag`, called from `lab.js` onHurt).
  The blood record now carries the weapon id `w`. The amounts come from `weapons.vdata`
  `m_flFlinchVelocityModifierLarge` / `Small`; the HE uses 0.3 / 0.1 and the knife 0.3 / 0.3.
  - **The rule is CS:GO's, unverified for CS2:** the first hit at full speed takes you to Large, and a hit while still
    slowed takes you to min(v, v × Small).
  - Every SMG's 0.0 is not explained by the files. We treat it as "no value" and use 0.5 (**ours**).
  - The recovery of 0.4 a second is CS:GO's and is not in the files.
  - An HE hit now stamps `hx` with the host's clock instead of a count, and `hitTag` ignores a record or stamp older
    than 1.5 s. So a page that has just joined never takes an old one, and an HE read together with a bullet is not read
    again by the next fall or bomb hurt.
  - `DUCK_EYE` is now 46.045 HU, the same as the GUNS package's crouched eye. `lan/room.mjs` relays `combat.bl` whole,
    so it needed no change.
- **The mix no longer clips** (`dist/spatial-audio.js`, GD only). A last stage modelled on CS2's FinalMixGlue: −6 dB,
  knee 3.125 dB, 4 ms attack, 458 ms release, no make-up gain. Web Audio stops at 20:1 where CS2 uses 40:1.
  - Chrome's compressor adds its own make-up gain, so we take that gain back out (same formula), then put a −1 dBFS
    ceiling after it.
  - In muted Chrome, 8 world + 4 UI voices peaked at +0.56 dBFS before and −6.02 dBFS now.
  - `soundmixers.txt` Default_Mix group volumes now apply in the GD bank (Weapons .6, Footsteps .8, BulletImpacts .3,
    Explosions .7, VO .34, …).
  - The HE and flash sounds go through CS2's events: `BaseGrenade.Explode`, `Flashbang.Explode`, and
    `Flashbang.Ring.Long` / `.Medium` / `.Short`. **Which ring goes with how long you are blinded is ours** (3.5 s / 2.5 s).
- **Money and alerts** (`dist/arena-defuse.js`, `dist/gd-hud-alerts.js`):
  - Terrorists still alive when time runs out unplanted get $0 (`Team_Cash_Award_no_income`).
  - The defuser gets $300 (`Player_Cash_Award_Bomb_Defused`). The value of `cash_player_bomb_defused` is not in the
    files, so this is CS:GO's 300.
  - The overtime MATCH POINT alert is right: MR3 overtime shows it at 15-14 and not at 12-12.
- **The practice recoil-dots panel `#gd-recoil` is gone.** CS2 has none; it was ADDENDUM 11's "stray dark square".
  Its two toggles (the setup form's "Show my recoil" and the practice menu's "My recoil") are gone too.
- Tests: `tests/gd-blood.mjs`, `tests/gd-impacts.mjs` (now also the radius curves, read back from the vpcf),
  `tests/gd-headshot-audio.mjs`, `tests/gd-hud-alerts.mjs`, and the new `tests/gd-tagging.mjs`, `tests/gd-mix-peak.mjs`,
  `tests/gd-money-rules.mjs`, `tests/browser/gd-mix-peak.mjs`. `tests/browser/gd-impacts-shots.mjs` now aims at a
  stopped bot and fires up to 3 shots (open-B #34). The 600 HU camera no longer ends up inside a wall.
- Picture: `~/Desktop/GD-v53-impacts.jpg`, with 1:1 crops at 0, 8, 60 and 200 ms, concrete at 50, 300 and 800 HU,
  practice's impact boxes off, and the blood frames held from each record's own start.
- **Not like CS2 yet:** CS2's dust sprites cast particle shadows (`m_bParticleShadows`, `m_flShadowDensity` 2), and ours
  do not. So a grey concrete puff on a light wall is real but faint (low contrast).

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
| Fire damage | 40 a second, ramping from 1 | `m_nDamage` 40 for `weapon_molotov` and `weapon_incgrenade` in `weapons.vdata`; **the ramp and the 0.2 s beat are ours** (the damage code is in the server binary) |
| Fire through kevlar | molotov 0.9, incendiary 0.7375 of the damage | `m_flArmorRatio` 1.8 / 1.475 in `weapons.vdata`, halved as for every gun; **that burns use it is our reading** |
| Flame box | 60 wide, 80 high | the preview control point 3 = [12, 60, 80] in `particles/inferno_fx/molotov_groundfire.vpcf` |
| Burn time | 7 s per flame | `molotov_groundfire_main_center.vpcf`'s emitter runs 7.0 s; `inferno_flame_lifetime` 7 |
| Inferno spread: 16 flames, 42 apart, within 150, gaps 0.02 s × 1.1 up to 0.5 s, children for 3 s, 20 up, 45° lean | | **not in the install**: CS2's server convars (`inferno_*`) are compiled into its server binary. These are CS:GO's published defaults. 150 matches `fire_core.vsnap`'s radius |
| Smoke into fire, fire into smoke | pops on touching flames; the volume puts out what it covers | **CS2 behaviour as known, not in a file** |
| Molotov slope and fuse | 30°, 2 s | `weapon_molotov_maxdetonateslope` 30 and `molotov_throw_detonate_time` 2.0 are CS:GO's; **not in the install** |

## Partial, and what is not like CS2 yet

- **Smoke rolling and resting differ from CS2.** After package LINEUPS, 157 of the 366 public CS2 lineups still miss
  (177 before). 24 of the 52 smokes that pass within 32 units of CS2's spot end more than 32 units past it along the
  throw: they travel too far after landing (see package LINEUPS).
  - Mirage Apartments window smoke: passes CS2's spot, then stops 176 units away and 144 units lower.
  - Inferno A Long smoke from Mid: its first touch is on a railing, and it ends 764 units off.
- **CS2's railings stop our grenades.** CS2's file says thrown grenades pass `csgo_railing`, `csgo_railing_no_players`
  and two other excluded layers. The map file has no per-triangle layer. CS2's world physics (`world_physics.vmdl_c`)
  lists the shapes (Nuke 870, Overpass 69, Anubis 43, Inferno 20). Taking out only the small ones measured +1 lineup.
  The rest are large mesh shapes, so the fix needs a new importer that reads their triangles, a side file in
  `user-assets/` that the room sends to every player, and a grenade-only mask (ragdolls and dropped guns must still hit
  railings). Not done yet.
- **Smoke detonation**: ours goes off on the tick it rests; Source checks every 0.2 s (equal against the public air
  times).
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

- **Fire:** there is no heat shimmer yet on High and above. The molotov in first person has no lit wick. Flames are not
  drawn on walls (CS2's climbing flames). The fire's loop starts silent if you are out of earshot when it starts. The CS2
  fire textures and sounds are not imported on this computer yet (see below). The air-burst height (128 units) and the
  inferno numbers are not verified from files.
- **Fire size changed** from v41's "about 4× the area" to CS2's. If the bigger fire was wanted, `INFERNO` in
  `dist/arena-nades.js` holds the numbers.

## Needs CS2 imported on the computer

- CS2's kill-tally cards, pips and team logos, and the kill-feed mark icons: `node tools/import-cs2-killfeed.mjs`. It now picks up 65 icons. Without them, our own drawings in the same layout are used.
- CS2's headshot and helmet sounds: the existing CS2 sound import. Without it, our own made-up stand-ins play.
- The lineup tests and the practice browser test need the CS2 maps converted on this computer (`user-maps/`). They skip the maps that are missing.
- CS2's fire pictures: `node tools/import-cs2-fire.mjs` (it backs up first, then writes `user-assets/fire/atlas.png` and
  `models.fire`). It was tested into a scratch folder. Without it, our own drawn fire is used, in the same layout.
- CS2's fire sounds: `node tools/import-cs2-sounds.mjs --only nade.molotov.ignite,nade.molotov.smash,nade.molotov.far,nade.incendiary.ignite,nade.incendiary.pop,nade.incendiary.far,nade.molotov.air,nade.incendiary.air,nade.fire.loop,nade.fire.crackle,nade.fire.fade,nade.fire.out,nade.smoke.emit,nade.smoke.far`
- The kill feed's `inferno` flame icon is in `user-assets/icons/killfeed`. The kill-feed import ran again and added it.
- CS2's HUD icons (per-weapon reserve icons, square agent portraits, the cards' dots, the radar's C4 marks):
  `node tools/import-cs2-hud.mjs` → `user-assets/icons/hud/`. It was tested into a scratch folder and **not run on this
  computer yet**; without it our own drawings are used in the same places.
- CS2's ragdoll: `node tools/import-cs2-ragdoll.mjs` → `user-assets/ragdoll/cs2-ragdoll.json` (installed on this computer).
  Without it our own ragdoll with the same rules is used.
- CS2's reload numbers are read once by `node tools/import-cs2-reloads.mjs` into `dist/gd-reload-ref.js` (numbers and
  names only, committed; no Valve file). CS2's reload sounds come with the existing first-person sound import.
- The five new knives: `tools/cs2-fp/export_missing.py` + `build_set.py`, `tools/cs2-fp/fp_sounds_add.py`,
  `tools/export-cs2-holds.mjs`, `tools/import-cs2-skins.mjs --add --keep 3` and `tools/import-cs2-killfeed.mjs`
  (all run on this computer; back-ups kept as `user-assets/*.bak-*`). Without them the built-in knife is drawn.
- Exact CS2 bullet surfaces on the converted maps: `PENS_ONLY=1 node tools/maps/import-cs2-map.mjs <id>
  ~/CS2-extract/export/<id>` for each map (backs up first). **Not run on the user's maps yet.**
- No Valve file is committed. `tests/no-valve-data.mjs` passes.

## Measured (on the MacBook, in muted Chrome)

- **Practice preview,** High preset at Retina scale (1440×810): standing still p95 17.7 ms, holding with the picture p95 18.0 ms, 60 fps, no shader compiled. On Low: 1.15 ms a frame for the picture, p95 17.5 ms.
- **Kill tally:** one burst took 1 layout, 39 paints and 11.4 ms of main-thread work in all; the longest task was 1.4 ms. An idle second took 0.
- **Fire (package FIRE):** working out a fire's flames on CS2 Mirage takes 1.1–2.3 ms (cold) in node; the old flood of
  cells took 40–100 ms cold. 20 new fires take 5.9 ms in all. The fire's view allocates nothing per frame (0 bytes over
  20 000 frames of two fires). No shader was compiled during play in the muted picture run on Dust II.
- **A 5 v 5 fight with grenades, batch B** (`tests/browser/gd-pacing-nades.mjs`: muted Chrome, the High preset, Retina
  size 1920 × 1080 device pixels, solo Defuse on Dust II with 9 bots, you strafing, firing and throwing a smoke, your
  side's fire grenade, an HE and a flash; 24 s; the same file on each tree):

  | tree | CPU | fps | p95 | p99 | max | programs linked |
  |---|---|---|---|---|---|---|
  | 52.0.5 | 1× | 60 | 17.4 ms | 18.5 ms | 33.4 ms | 0 |
  | batch A (stages 1–3) | 1× | 60 | 18.1 ms | 18.4 ms | 33.0 ms | 0 |
  | batch B (this tree), 2 runs | 1× | 60 | 17.5 / 18.6 ms | 18.5 / 18.7 ms | 34.4 / 33.3 ms | 0 |
  | 52.0.5, 2 runs | 4× | 56.5 / 57.0 | 31.7 / 31.3 ms | 34.8 / 34.5 ms | 66.6 / 68.6 ms | 0 |
  | batch A | 4× | 56.4 | 31.9 ms | 34.4 ms | 66.4 ms | 0 |
  | batch B, 2 runs | 4× | 52.1 / 52.9 | 33.5 / 33.4 ms | 35.1 / 35.1 ms | 68.6 / 67.8 ms | 0 |

  (In batch A's 1× run and 52.0.5's first 4× run you were killed before the flash, so 3 grenades went out, not 4.)
  At full speed every tree holds 60 fps with no shader compiled during the fight. With the CPU slowed 4× (a slower
  laptop), batch B draws about 4 fewer frames a second than 52.0.5 and batch A. A CPU profile and an experiment found
  the main cause: the stage 4 HUD's blurred backgrounds (`backdrop-filter`, CS2's world blur behind the kill-tally badge,
  which is always on screen, and the cards). With every backdrop filter switched off, batch B drew 55.2 and 54.6 fps at 4×.
  The look was **not** changed here, because CS2 does blur there; the presets for computers without a graphics card are
  stage 6's work, and this measurement is left for it.
- The kill-emblem video passes its checks again: H.264 1920 × 1080 at 60 fps, 16.1 s, 968 frames (967 distinct), AAC
  sound at mean −19.8 dB, peak −0.3 dB.
- **Full `npm test`:** passes (every entry, all 140).
