# Global Defensive upgrade: completion checklist

Tracks `Global_Defensive_Full_Upgrade_Claude_Prompt.md` (sections 0–20) and the classic-maps rebuild prompt. Status per item:

- **Verified:** built and covered by an automated test, a measurement, or an in-game capture (the evidence is named).
- **Existing:** was already in the game before this upgrade and still passes its tests.
- **Partial:** started, with a gap that is named.
- **Missing:** not built yet.

"Tested" here means automated tests and simulated clients on one Mac. Physical LAN machines and Windows have **not** been tested in this round unless noted.

Last updated: 2026-10-13.

## 0. Baseline

| Item | Status | Evidence / gap |
|---|---|---|
| Entry points, LAN host, map pipeline, movement, combat, UI, audio identified | Verified | `lab.js` (client), `lan/room.mjs` (authoritative host), `cs-mapbuild.js` / `cs-columns.js` (maps), `arena-move.js`, `combat-logic.js` / `arena-logic.js` / `arena-defuse.js`, `arena-ui.js`, `sound-bank.js` / `spatial-audio.js` |
| Baseline frame time | Verified | Dust II, Retina ×2, High preset, 9 bots + utility: avg 16.7 ms, p95 20.6, p99 24.5 (`stress.mjs`) |
| Asset sources tracked | Partial | `MODEL-SOURCES.md` lists models and CC0 sounds; the Epidemic Sound recordings are the owner's subscription (licence for public distribution **unconfirmed**; the GitHub repository is public, so pushing them publishes the files) |
| Map reference data licences | Verified | All eight maps from MIT sources only: awpy navigation data and Lexogrine's radar overviews (csgo-react-hud); notices in `dist/cs-maps/LICENSES.md`. The six overviews earlier sampled from boltobserv (GPL-3.0) are replaced. Layouts are Valve's designs |

## 1. Critical correctness

| Item | Status | Evidence / gap |
|---|---|---|
| LAN Defuse starts as Defuse first time | Verified | `gd-match.mjs` "no Defuse → Deathmatch fallback"; `gd-lan-e2e` |
| Upright, alive, valid spawn each round | Partial | Spawns validated per map (`gd-classic-maps.mjs`); ragdoll-clear check on the new maps not re-run in a browser yet |
| One-attempt plant / defuse | Verified | `gd-match.mjs`; plant needs the real site area on your own floor (`nav.site`) |
| HP / armor display | Existing | |
| Ammo / inventory reset | Verified | `gd-weapons.mjs` |
| Map change loads geometry, collision, sites, spawns, radar, nav for every client | Verified | `gd-lan-e2e`: host changes Dust II → Mirage, host and guest both build the same boxes, Defuse round 1 (simulated clients, one Mac) |
| No opposing-spawn sightlines | Verified | `gd-classic-maps.mjs` (all T × CT spawn pairs, 3D sight) |
| B opens / closes the buy menu | Verified | `gd-weapons-e2e` |
| Host panel doesn't overlap the HUD | Partial | Tab map moved beside the scoreboard (v44); the host panel is not re-checked at small window sizes |
| Corpses don't block | Verified | v43 |
| Missing geometry / camera clipping | Partial | Column renderer draws only exposed faces; no systematic clipping sweep yet |
| Dropped items on raised floors | Verified (bug fixed) | Bomb and guns dropped at height 0 inside raised floors: they now land on the floor where the player fell (`arena-defuse.mjs` bomb pickup) |
| Server clamped player height to 80 units (Nuke goes higher) | Verified (bug fixed) | `lan/room.mjs` allows 260 in the arena |

## 2. Match lifecycle

| Item | Status | Evidence / gap |
|---|---|---|
| Lobby → teams → warmup → freeze → live → result → halftime → final | Existing | `gd-match.mjs` |
| One authoritative round end, no double rewards | Existing | `gd-match.mjs` "one outcome" |
| Match ID / round ID / revision on events | Verified | Each match has an id and each round (restarts and warmup too) its own; buys, refunds, plant and defuse carry their round and the host refuses ones from a round that has ended; every combat state leaving the host (frames, world snapshots, replies) carries a rising revision and clients never step back to an older one (bug fixed: an action reply arriving after a newer frame could restore older combat state until the next change) · `gd-netstate.mjs` (real room, 11 checks). The client-side "ignore older" rule is covered only indirectly by the LAN browser suites |
| Late-joiner state | Partial | Joiners get mode, map, round and loadout on the combat stream; not audited field by field |
| Reconnect identity | Partial | Name-based identity |

## 3. Host settings and lobby

| Item | Status | Evidence / gap |
|---|---|---|
| Mode / map choice, bots, difficulty | Existing | |
| Warmup and freeze in seconds, 0 allowed | Existing | v43 |
| Two-minute lobby with ready state | Existing | `gd-match.mjs` |
| Pause, restart round, move to spectator, next map | Existing | v43 |
| Round count, halftime / overtime presets | Verified | Presets Competitive / Short / Casual; first to 2–16; at a tie: sudden death, draw or MR3 overtime ($10,000 blocks of six, sides swap after three, 4 of 6 wins) · `gd-rules.mjs` |
| Starting money / economy preset | Verified | Start $0–16,000, maximum $1,000–16,000 · `gd-rules.mjs` (bug fixed: new players got $800 whatever the host set) |
| Round time | Verified | 60–300 s · `gd-rules.mjs` |
| Friendly fire / spectator policy toggles | Partial | Friendly fire on / off verified (`gd-rules.mjs`); spectator policy toggle missing |
| Changes during a match apply from the next match | Verified | Also when the same map restarts by itself (bug fixed: queued rules were dropped then) · `gd-rules.mjs`, `gd-lan-e2e` (rules panel, guest sees the queued rules) |
| End warmup now | Existing | The lobby's start button ("End warmup now") |

## 4. Movement

| Item | Status | Evidence / gap |
|---|---|---|
| CS2 movement rules | Existing | `arena-move.mjs` tests |
| Not slippery, prompt stops, measured | Verified | `gd-movement-feel.mjs`. Bug fixed: one movement step per frame made the slide depend on the frame rate (33 HU at 30 fps, 39.5 at 240). Now steps of at most 1/128 s: let go at full knife speed → stop in 0.41 s after 39 HU (6 game units) at 30–240 fps; counter-strafe accurate in 75–100 ms (one frame of rounding); full reversal 0.57 s. Matches the closed-form Source rules with CS2's default cvars (sv_friction 5.2, sv_stopspeed 80, sv_accelerate 5.5) within 6% |
| Stairs and ramps smooth | Partial | True-scale maps use 4-unit steps and a smoothed render; walk tests pass on all routes |
| Sensitivity, scoped sensitivity | Existing | Settings |
| View-model sway / bob toggle | Partial | Settings → Global Defensive → "Gun bob while moving" (on by default; off also with the system's reduced-motion setting). Not covered by a browser test |
| Per-frame allocation in `moveStep` with players nearby | Verified (fixed) | Other players' hulls are a reused pool checked beside the map's boxes (no copy of 2,000–5,300 boxes per tick); `arena-move.mjs` covers blocking and standing on a player |

## 5. Physics

| Item | Status | Evidence / gap |
|---|---|---|
| One player hull, standing / crouched heights | Existing | |
| Ladders, vents | Missing | Ladder places exist in the reference data (Nuke, Mirage); no ladder movement yet |
| Body-sized passages and drops | Verified | Routes refuse gaps and holes narrower than a body; drops off ledges allowed |
| Grenade bounce and settling | Existing | |

## 6. Aiming, scopes, weapons

| Item | Status | Evidence / gap |
|---|---|---|
| Shooting and recoil preserved | Verified | `gd-weapons.mjs`, `gd-weapons-e2e` |
| AWP scope, auto re-scope setting | Existing | |
| Crosshair editor with live preview | Existing | `gd-crosshair.js` |

## 7. Inventory and economy

| Item | Status | Evidence / gap |
|---|---|---|
| Two slots, finite ammo, buy drops old gun, pickups | Existing / Verified | `gd-weapons.mjs` |
| Undo buy | Verified | v44 |
| Quick-buy / previous loadout | Verified | Buy menu: Rebuy (R) buys last round's purchases again, Full buy (F) buys Kevlar + Helmet, your side's rifle, kit (CT), smoke, flash; each through the normal host-checked buy actions, owned items and kept grenades skipped · `gd-quickbuy-e2e` (8/8) |
| Buy menu fits small windows | Verified | Done, Undo, Rebuy and Full buy visible at 1920×1080, 1280×800, 1280×720 and 1024×700 (it was cut off at 1280×800) |

## 8. Models and icons

| Item | Status | Evidence / gap |
|---|---|---|
| A distinct model per gun | Verified | v44 icons rendered from the models; the USP-S, Five-SeveN and Deagle fallback bug was fixed |
| Duplicate-mapping test | Verified | `gd-assets.mjs` (401 checks): every gun, knife, grenade and the bomb has a model source of its own (never the generic fallback), no two guns look the same, AWP ≠ SSG 08, an icon of its own, four gunshot files of its own and not the same take as another gun's, a first-person rig. Found and fixed: UMP-45 / MP9 and P90 / MP7 shared a distant gunshot file, the SG 553's third take was a copy of its first, and the USP-S's distant take was the MP5-SD's |
| Developer gallery | Verified | `dist/gd-gallery.html` (open /gd-gallery.html on a running game): every weapon's model (drawn by the game's loader with the game's reflections), buy / HUD icon, first-person rig, model source, gunshots (playable) and stats side by side · `gd-gallery-e2e` (30 cards, 30 different models, no fallback). Seen there: the Glock-18 uses the detailed pistol model, which looks like a Makarov (brown grip), not CS2's polymer Glock; the MAC-10 and MP9 are different models with similar compact silhouettes |
| Karambit hand rig | Verified (imported) | With an imported CS:GO karambit view model (arms, sport gloves, knife): its own first-person rig (fp-view.js), Fade blade painted, forearms shortened, the inspect spins it on the ring. Without one, the pistol arms in a fist |
| CS 1.6 imported assets | Existing | Optional, imported on the player's own computer only |

## 9. Audio

| Item | Status | Evidence / gap |
|---|---|---|
| Downloaded sounds inventoried and mapped by name | Verified | `tools/pack-epidemic.mjs`: 460 Epidemic files; each gun gets its real counterpart (3 takes + a distant take), class reload sequences, knife, grenades, hits, death, footsteps, landing |
| Every sound decodes in Chrome / Electron | Verified | `sndcheck.mjs`: 192 / 192 load |
| Freeze-time jazz, soft, music bus | Verified | Plays only in freeze time, fades in and out |
| Volume buses | Existing | |
| Headphone near / far / floor listening test | Missing | Needs a person listening |

## 10. Utilities

Existing (v43–v44): throw strengths, smoke volume, HE holes in smoke, molotov put out by smoke, flash by facing and sight. Re-checked on the new Dust II (Long A, on the real floor height): `gd-utility-lan-e2e` 10/10, `gd-nades-e2e` 16/16.

## 11. HUD and radar

| Item | Status | Evidence / gap |
|---|---|---|
| Radar from the map's own grid | Verified | Classic maps draw from their columns |
| Floors on the radar | Verified | Team mates and spotted enemies a floor above or below you carry ▲ / ▼; Nuke has a separate lower-level layer shown while you are down there ("LOWER · B SITE"); callouts know their floor, so the location label and radio callouts name the right one (bug fixed: standing at B on Nuke said "Hut") · `gd-classic-maps.mjs` (every callout names its own spot on all 8 maps), `gd-radar-e2e` 11/11 |
| Spotting with real 3D sight | Verified | `gd-radar.js` uses the map's sight test |
| Bomb carried / dropped / planted | Existing | |

## 12. Voice, radio, chat

Existing (v43): team-only WebRTC with HTTPS twin, push-to-talk, devices, mutes, radio, team / all chat. Physical-machine voice test: **not done**.

## 13. Maps

Seven maps (Train removed on request, 2026-10-14) are rebuilt at true scale from the CS:GO navigation meshes (awpy, MIT) and radar overviews (Lexogrine, MIT): real heights, stacked levels (Nuke upper/lower, underpasses, bridges), crates, railcars.

| Map | Routes walkable (player physics) | Spawns fair | Sites plantable | Bot matches | Gaps |
|---|---|---|---|---|---|
| Dust II | Verified | Verified | Verified | Verified | Architectural detail; doors |
| Mirage | Verified | Verified | Verified | Verified | Ladder room ladder |
| Inferno | Verified | Verified | Verified | Verified | Detail |
| Nuke | Verified | Verified | Verified | Verified | Vents (too narrow to drop through standing: routes avoid them), ladders. Fixed: a ceiling inherited from Outside made Secret's entrance too low to walk into |
| Cache | Verified | Verified | Verified | Verified | Vents |
| Anubis | Verified | Verified | Verified | Verified | Water look |
| Ancient | Verified | Verified | Verified | Verified | Vegetation |

Thin walls (fixed this round): an overview wall line between two same-height areas the navigation mesh does not join there was turned into floor, so you saw, shot and could walk through it — 127 wall cells restored on Nuke (A hall ↔ Outside), 56 on Cache, 43 Anubis, 21 Train, 16 Ancient, 15 Inferno, 7 Mirage, 6 Dust II. Sight lines now also stop at a top floor's ceiling (they passed through solid ground over lower corridors). Bots that make no progress for 3 s re-plan round the spot. Nuke plants after the fix: 13 / 11 / 8 (were 1 / 0 / 0).

Evidence: `tests/gd-classic-maps.mjs` (298 checks), `tests/gd-bots.mjs` (24 full bot matches, 112 checks). Geometry rules changed this round: a tight gap between floors leaves a body plus a step of room; ceilings are only borrowed from a neighbouring level when they leave a body plus two steps; a route may drop only where a body fits past the edge. First-person walkthrough captures are partial (Dust II only).

### Maps and models from files (this computer only, never shipped)

| Item | Status | Evidence / gap |
|---|---|---|
| Counter-Strike 1.6 map files (.bsp 30) | Verified | `user-maps/<id>.bsp` replaces the built-in map: its own faces, textures and baked light (bsp-mesh.js), collision columns from its brushes (bsp-map.js). `gd-classic-maps --files` 298 checks, `gd-bots --files` 24 matches |
| Source map files (VBSP 19–21: CS:S / CS:GO ports) | Partial | Read (vbsp.js: brushes and player clips, displacements, static props and the packed models, vbsp-props.js); collision columns from brushes, terrain and the props' own shapes (vbsp-solids.js); slopes steeper than 45° unwalkable. The new Ancient (de_ancient_csgo_dev_04): 37 checks, 3 bot matches. Not yet drawn: its own textures (VTF), lightmaps and props |
| CS2 guns, knives, bomb, defuse kit | Verified | `tools/import-cs2-models.mjs` → `user-assets/weapons` (the game's own compact format, pose baked, 1024 px pictures); grips measured per gun (CS2_FIT); each side its default knife. 13 weapons imported |
| CS2 agents (T and CT) | Verified | `cs2-agents.js`: posed from the soldiers' state (walk, crouch, rifle and pistol holds by two-hand IK, hands laid on the grip, fingers curled, reload, throw, death), scaled to the hit capsule (head at HEAD_Y, crouch drop 18 HU); warmed with the arena (no compile in play) |
| One asset pack for other computers | Verified | The importer writes ~/Desktop/Infra Simulator Assets.zip (models and maps); Settings → Models and maps → Import asset pack installs it through the room (`gd-asset-pack.mjs`, 10 checks) |

## 14. Graphics

Partial. Done this round, from reference screenshots of each map: CC0 photo textures for every surface (sand, plaster, stone tiles, concrete, fieldstone, brick, planks, roof tiles, metal); baked shade in the geometry (corners, wall feet, lit undersides); flat floors no longer creased; diagonal walls cut straight; per-map wall colours by block, Nuke's blue band, ledges along wall tops (Inferno's roof tiles); crates of different heights (48 / 64 / 80 / 128) and a material per map (planks, dark planks, painted metal, blue containers, sandstone and fieldstone blocks); per-map sunlight, sky dome and fill light; sun shadows across the streets around you (90 units, snapped so they don't crawl). All eight maps still 60 fps on High (p99 19.5–21.6 ms). Before/after captures from identical viewpoints: scratchpad only. Missing: normal maps, decals and props (doors, windows, trims).

## 15. Bots and practice

| Item | Status | Evidence / gap |
|---|---|---|
| Bots walk stacked maps, plant, defuse, use cover | Verified | `gd-bots.mjs`: 21 full matches (7 maps × 3 difficulties): no Terrorist stands still 10 s on the way (fighting, planting and arriving excepted), bots plant on every map. Bugs fixed: bots could not walk off a ledge (the edge counted as a wall; now the body rests on the highest floor under it, like players); a bot that skipped its last waypoint while stuck never re-planned; waypoints counted as reached from the ledge above them (route points now carry their floor height); Terrorists on Nuke took the walk to B across A (now routes keep 160 units clear of the other site: Secret) |
| Bot balance | Partial | Nuke: Terrorists win mostly by fighting (plants 2 / 2 / 0 on easy / normal / hard); Ancient hard 0–13. No grouping before an execute yet |
| Practice mode | Missing | |

## 16. Scoreboard, spectators, results

Existing (v43): scoreboard, spectate, match report.

## 17. Network and input

| Item | Status | Evidence / gap |
|---|---|---|
| Host-validated combat, inventory, objectives | Existing | |
| Lower LAN latency | Verified | v44 |
| Ctrl+W kept in the game (desktop) | Existing | |
| Binding editor | Existing | `controls-rebind` |

## 18. Performance

| Item | Status | Evidence / gap |
|---|---|---|
| Dust II stress (Retina, High, 9 bots) | Verified | avg 16.7 ms, p99 24.5 ms after removing an aim raycast over the map mesh and per-frame box copies in the radar |
| Every map measured | Verified | Retina ×2, High, 9 bots, smoke / HE / flash / molotov, 12 s of fire: avg 16.7–16.9 ms (60 fps) on all eight (before Train was removed); p99 20.4–24.2 ms. Found and fixed: one 45–52 ms frame on Ancient (and once on Inferno) — the Infra world (racks, cables, labels, casino) was still drawn behind the arena and its shaders compiled mid-match; GD now draws only its own objects (re-measured: no frame over 33 ms in 6 runs) |
| GD separate from Infra / Payday (interface) | Verified | In a match: no face picker, Face button, emote preview, field laptop, console (`) or campaign panel; Esc opens GD's own menu (Resume · Settings · Leave match); Settings shows only settings with GD controls (no campaign tabs, ₮ money, walking pace or guidance); your name is set on the GD start screen; Leave match ends a solo match · `gd-separation-e2e` 11/11. Also fixed: the start screen said v36.9 (now the app's own version) |
| Deathmatch spawn protection | Verified | 2 s after a (re)spawn, or until you fire — our own value, not a CS number (you could be shot while still choosing a gun at your spawn; `arena-e2e` failed 1 run in 4 on it) · `gd-match.mjs` |
| Intermittent slow frame | Partial | `gd-nades-e2e` showed one 83 ms frame in about 4 of 30 runs on this Mac, not tied to any code change (old commits failed and passed alike, mostly under background indexing load); not reproduced in the last 12 runs |
| GD separate from the Infra world (3D) | Verified | In a match the frame's draw keeps only lights, the camera and GD objects (452 Infra objects skipped); leaving brings the hall back · `arena-e2e` 21/21 |
| Map-change memory | Verified | `gd-mapchange-memory-e2e` 7/7: all seven maps three times by the host's map change; the third lap holds each map's heap to within 2 MB of the second (map files: ~280 MB in all). Each map is built once and kept (first lap: heap 138 → 201 MB, about 8 MB a map; map changes are then instant); the second lap stays flat (198–202 MB after GC), GPU geometries the same per map, textures 266 → 266 |
| Shaders compiled mid-match | Partial | A handful still compile on first sight (bot skins and post effects not in the warm-up); none caused a slow frame in the measured runs |

## Test runs (2026-10-13, one Mac, Chrome 141 via Playwright, simulated LAN clients on 127.0.0.1)

| Suite | Result |
|---|---|
| `npm test` (all unit and logic suites, incl. `gd-classic-maps`, `gd-rules`, `gd-movement-feel`) | Pass (exit 0) |
| `arena-e2e` | 18/18 |
| `arena-defuse-e2e` | 22/22 |
| `arena-defuse-lan-e2e` | 11/11 |
| `gd-lan-e2e` (host + guest, map change, rules panel) | 26/26 |
| `gd-utility-lan-e2e` | 10/10 |
| `gd-weapons-e2e` | 18/18 |
| `gd-nades-e2e` | 16/16 |
| `gd-radar-e2e` | 9/9 |
| `gd-voice-e2e` | 16/16 |
| `gd-quickbuy-e2e` | 8/8 |

Not done: physical LAN machines, Windows, real voice between two computers, a person listening on headphones.
