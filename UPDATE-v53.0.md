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
