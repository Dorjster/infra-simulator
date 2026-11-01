# Global Defensive radar: what it shows and why

Code: `dist/gd-radar.js` (dots, spotting), `dist/gd-radar-art.js` (the map picture), `dist/gd-radar-prefs.js` (the
options), `dist/arena-spectate.js` (`watched`, used while dead), `tools/export-cs2-radar.mjs` (CS2's pictures). Tests:
`tests/gd-radar.mjs` (node, DOM stub), `tests/browser/gd-radar-e2e.mjs`; pictures `tests/browser/gd-radar-shots.mjs`.

## Who is shown

| What | Shown to | Rule |
|---|---|---|
| You | you | centre arrow (rotating mode) or on the map (fixed mode, N) |
| Team mates | your team | always; dead ones as a cross; the bomb carrier ringed red |
| Enemies | the other team | only while **revealed** (below) |
| Planted bomb | everyone, as soon as it is planted (as in v51) | CS:GO's C4 "spotted" rule (CTs only once one of them has seen it) is built but off (`CT_BOMB_SPOTTED`, createRadar's `ctBombSpotted`) until CS2's behaviour is confirmed: the plant banner names no site, so hiding it would change round information |
| Dropped bomb | Terrorists | always |
| Enemy decoys | the thrower's enemies | while the decoy fires (`decoyBlip`) |

An enemy is **revealed** when a living eye on your side (yours, or a team mate's) can see him:

- within reach (500 units on map files and nav maps, 220 on the small classic maps),
- in any direction (eyes see all round: a view cone, `SPOT_CONE` in gd-radar.js, is written but off — CS2's spotting
  cone is not in its data files, so it would be a guess),
- along a clear line to his eye or his chest (`radarSight`): on CS2 map files CS2's own triangles that stop sight
  (glass, fences and grenade clips let sight through — the same rule as the flash's light) plus the live doors and
  breakables (a shut door blocks, an open one doesn't, glass never does); built maps with a nav use its sight columns
  plus the same doors; classic maps use their boxes at eye height,
- not hidden by smoke (`smokeHides`, the rule the screen draws).

He is also revealed when he fires an unsuppressed gun within 90 units of where you are (heard).

While dead, your own camera is nobody's eyes: only living team mates spot for you.

## Where he is drawn

- Seen at the latest look (15 times a second): where he is now.
- Lost: faded, with a dashed ring, at the spot where he was last seen or heard, for 2 s. He is never followed
  behind cover.
- A new round, a side swap, a map change or a new match (rematch) forgets every known enemy at once.

## While dead

The radar centres on the player you watch and turns with the way they face (`spectator.watched`), not with your
frozen death view or the chase camera's position. The callout and floor under the radar are theirs.

## The picture

Drawn once per map, with every floor (Nuke's lower level too), while the radar is still hidden (the loading card,
the lobby), never mid-round. The floors are stacked and a floor change only shows the other one. Only the current
map's pictures are kept, so a night's map rotation doesn't pile up canvases (about 14–19 MB each). "Current" means
the map's full identity (name, size, built-in or CS2 file): when the CS2 file arrives under a built-in map's name, the
built-in's pictures are dropped too.

The dots canvas is drawn at the screen's own pixels (CSS size × devicePixelRatio), so icons stay sharp at display
scaling 1–2. Icons are 1.3× v51's on the small radar (0.65 CSS px per radar unit) and never smaller than v51's on the
big map (one unit = 1/420 of the map's width). Opening the big map (Tab) draws at the new size from the very next frame. Tab doesn't open the big map
while the buy or team menu is open.

## v52: CS2's look (package Q)

**CS2's own pictures.** `node tools/export-cs2-radar.mjs` decodes, from the CS2 install on this computer
(`~/CS2-extract`, Source 2 Viewer), each map's overview picture (`panorama/images/overheadmaps/de_<map>_radar_psd`,
plus `_lower_` for Nuke / Train / Vertigo) and its overview data (`resource/overviews/de_<map>.txt`) into
`user-assets/radar/` (`radar.json` + PNGs). Local only: git-ignored, never shipped; the room serves them to its own
players at `/user-assets/radar/`. Without them (CI, a computer without CS2) the built-in picture stays.

**Placement.** Only a CS2 map file can line up (it carries its Hammer → game transform, `m.hammer`: x0, y1, W, D, zLow,
U). CS2 places a Hammer point at picture pixel `u = (x − pos_x) / scale`, `v = (pos_y − y) / scale` (1024-px picture).
`overviewFit` turns that into the radar's own map → picture transform plus a corner offset, so every dot lines up with
no other change. Checked: every spawn of 8 maps lands on drawn pixels of CS2's picture, every bomb site's centre inside
CS2's own bomb-zone outline, 95–100 % of the walkable floor on drawn pixels (31 px off: 74–89 %); in the browser the
image layer and the dots agree to 0.00001 px.

**Floors.** With CS2's pictures the lower picture shows while your feet are below CS2's own split (Nuke: the default
section's AltitudeMin, −495 Hammer units); the built-in picture keeps the map's `grid.lowerY`. Bomb-site letters show on
their own floor's picture.

**When it is drawn.** The index is asked for when the radar is made; a map's pictures are decoded (`img.decode()`, off
the main thread) while it loads, with the radar hidden; the radar waits for them (up to 4 s) instead of drawing the
built-in picture first. If the radar is already showing (a late decode), the built-in picture stays until the radar is
hidden or the round is between rounds (warmup, freeze, round over) — never swapped mid-round. Only the current map's
pictures are kept. The map layer's transform is written only when it changes.

**What is drawn.** Team mates in CS2's colours — yellow, purple, green, blue, orange (`TEAM_COLORS`, CS2's cl_color
order) — the n-th player of each side in the host's join order (`d.teams` order, the same on every client), with a tick
the way they face and their number on the big map; your own arrow in your colour with a faint view cone (CS2's 106°
horizontal at 16:9); dead team mates as a ✕ in their colour, killed enemies as a red ✕; enemies red, a ring when first
spotted, a faded dashed ghost at the last known spot; the bomb as a C4 — planted (flashing), dropped (Terrorists), beside
its carrier (Terrorists); A / B upright over the sites on CS2's picture; ▲ / ▼ beside a dot on another floor. The panel is
square, top left inside the game view (`--gd-view-left/top/h` from the video settings' black bars, when set), on a dark
see-through backing.

## v52: CS2's options

Settings → Global Defensive → Radar (`gd-radar-prefs.js`), saved on this computer (`localStorage gd-radar`), applied at
once (a `gd-radar-prefs` event), with a preview. Labels and defaults are CS2's (labels from CS2's
`resource/csgo_english.txt`; defaults are the cvar defaults — they live in CS2's client binary, not its data files):

| Option | CS2 cvar | Default | Range | Here |
|---|---|---|---|---|
| Radar centers the player | cl_radar_always_centered | Yes | | No = best fit: the view held inside the map's walkable bounds |
| Radar is rotating | cl_radar_rotate | Yes | | No = north up, your arrow turns; N switches it in game |
| Radar HUD size | cl_hud_radar_scale | 1.00 | 0.80 – 1.30 | the panel: 25 % of the game view's height (150–270 px) × size; published as `--gd-radar-h` (the lobby and the perf overlay sit under it) |
| Radar map zoom | cl_radar_scale | 0.70 | 0.25 – 1.00 | the radar shows 0.35 / zoom of the overview's width (0.7: half of CS2's picture) |
| Toggle radar shape with scoreboard | cl_radar_square_with_scoreboard | Yes | | Yes = holding Tab shows the whole map (framed on the walkable part) beside the scoreboard |

v51's running zoom is gone (CS2's radar doesn't do it); v51's N choice (`gd-radar-mode`) is carried over once.
