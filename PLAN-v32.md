# v32 implementation plan: simpler play, better 3D, Campaign 0–10, desktop

Baseline: `61140f0` (v31). All 31 suites in `npm test` pass on it. This file maps each part of the request to the modules that change. Work lands in small commits, in the order below. Each phase keeps `npm test` green.

## How the current code is organised (what this plan builds on)

| Concern | Module(s) | Notes |
| --- | --- | --- |
| Shared world, save format, migration | `dist/shared-world.js` | `snapshot()/restore()/migrate()`, format 31. LAN host and solo use the same code. |
| Orders, stock, racks, rails, mount, power, cables, modes | `dist/operations.js` | `apply(action, actor, players)` is the only mutator. `game` is persisted. |
| Rack power | `dist/power-grid.js` | PDU A/B per rack, breaker trips. Racks R01–R06 are always powered today. |
| Office, ten contracts (0–9), path evaluator | `dist/office-sim.js`, `dist/contract-steps.js`, `dist/office-schema.js` | `objectives()` + host `tick()` auto-accepts contracts. |
| Legacy rack projects | `PROJECTS` in `operations.js`, `dist/guided-play.js` | Nine installation projects with `validate`. |
| Device behaviour | `dist/device-logic/*` | One module per family; checks/LEDs/CLI/GUI agree. |
| 3D interaction | `dist/lab.js` (walk, keys, raycast), `dist/aiming.js`, `dist/engineering-ui.js` (prompts, interact, menus, carried models) | Several `interact()` layers compete; E has five fallbacks. |
| Rendering | `dist/app.js` (renderer, lights), `dist/hardware.js` (racks, chassis), `dist/facility.js` (room), `dist/render-optimizer.js` | ACES, exposure 1.65, hemisphere + 2 directional lights, adaptive pixel ratio. |
| LAN | `lan/server.mjs`, `dist/multiplayer.js` | SSE full-world broadcast per revision; host key; save at `lan/campaign-save.json`. |

## Phase A: Campaign 0–10 engine (P1, done first because the UI and tests hang off it)

- New `dist/campaign-levels.js`: `LEVELS` (11 entries: id, title, goal, why, where, hint tiers, reward, unlock) and `evaluateLevels(world, network)`. It returns the live checks for every level. Each check reads the shared world: devices, power, cables, configuration, path tests and permissions. No check reads a UI flag.
- `operations.js`: a new `game.levels` state `{ current, earned: {n: {at, reward}}, incidents }` and a `levels` campaign track (`mode:'campaign', track:'levels'`). The track starts with an **empty site**: R01–R06 are not installed, racks are bought, carried and placed on pads, and each rack PDU input must be plugged into the building power whip (new `rack-feed` action, host-validated with reach). The host tick earns the current level when its checks pass, pays the reward and unlocks the next. Earned levels stay earned; when their checks later fail they show as repair objectives.
- `power-grid.js`: a feed is live only if the rack's PDU input is fed (empty-site track only; other modes are unchanged).
- Level 7/8/9 exercises (`campaign-incident`, `failover-test`) are real world changes (corrupt files, fault injection through `network.logic.inject`, a primary WAN outage). They are recorded and graded by the same live checks.
- Contract chapters: in the levels track `office.tick()` no longer auto-accepts contracts. Levels 2–9 reuse the contract steps and objectives, so one progress indicator is shown.
- Migration: `shared-world.migrate()` → format 32. Older enterprise saves get `levels` with earned levels mapped from completed chapters (and live checks). Racks R01–R06 count as building infrastructure for migrated saves, so levels 0/1 are marked when their prerequisites exist. Legacy installation-project saves keep their equipment, money and history; the nearest prerequisites are marked. The LAN server writes `campaign-save.json.v31.bak` before the first save of a migrated file.
- Tests: `tests/campaign-levels.mjs` (a solo walk 0→10 through real actions, blocked and failure paths, regression → repair objective without un-earning, save/restore), `tests/campaign-migration.mjs`, and a LAN part (a guest performs a level step; the host earns the level; guests cannot reset or select saves).

## Phase B: start flow and the task-centred panel (P0)

- Start screen: **Solo Campaign** (recommended), **LAN Host Campaign**, **Join LAN**, **Free Build**, **Challenges**. The host chooses the mode and save; guests go to the lobby only.
- The Campaign panel replaces the ten-tab menu for players: **Objective** (level card, why it matters, stage, next physical action, target, block reason, three hint tiers, technical details on demand), **Inventory/Orders**, **Map** (receiving, procurement, rack rows, office, ISP handoff, player dots and objective marker), **Laptop**, **Team**, **Settings**. The old tabs (monitoring, power, NOC, documentation, saves) stay reachable under "Advanced".
- Title parity (Field/Operations) is unchanged; the title picker lives in Team/Settings.

## Phase C: one-verb targeting and cable/carry flow (P0)

- `aiming.js` becomes the single resolver: nearest unobstructed valid target, a small aim cone, ports beat rack bodies, and front/rear plus reach are respected. `engineering-ui.prompt()` returns one verb, target and reason (`E · Plug CAT6 into MGMT` / `Needs rails` / `Walk behind the rack` / `Port already occupied`).
- Cable colours: power black, data orange, management copper blue, fiber aqua with LC plugs, DAC with a silver twinax head, console light blue with RJ45/USB. The carried item shows its name and type. Put down (G) / Cancel (X) are always offered while carrying.
- Box rule: a box is removed only when every item from it has been taken out.

## Phase D: movement and camera (P0)

- Acceleration/deceleration curves, a walk/run/crouch/raise-view HUD shown on demand, and pointer-lock recovery with a click-to-resume overlay. Sensitivity/FOV sliders already exist; zoom limits and smooth room travel are added.

## Phase E: graphics with measured frame time (P0)

- Calibrated exposure (lower ACES exposure, balanced hemisphere and fill), ceiling light fixtures with a light-switch-driven fill, and the room kept readable with lights off. Rack frames get U numbers, rails and blanking panels; chassis get drive bays, vents, handles and PSU modules on shared instanced materials. LEDs stay logic-driven (already true).
- Measured before/after in headless Chromium (Playwright, SwiftShader and GPU if available): FPS, frame time, draw calls and memory at the entrance, rack front, rack rear and office, with 1 and 12 simulated players. Screenshots of the same views.

## Phase F: desktop builds (P1)

- `desktop/` Electron app (Electron Forge): the main process imports the existing `lan/server.mjs` logic in-process (refactored into `lan/room.mjs` with `startRoom({port, bind, savePath})`). Saves go under `app.getPath('userData')`. Solo binds to 127.0.0.1 on a free port; LAN Host binds 0.0.0.0 and shows the room code and IP with a Stop Hosting button. Join opens a host URL. Preload bridge, context isolation, no Node in the renderer, navigation locked to the local origin.
- `.github/workflows/desktop.yml`: macOS runner → DMG (arm64, and x64 if it builds), Windows runner → Squirrel `Setup.exe`. Runs `npm test` first; publishes on tag. Unsigned unless signing secrets are present, and documented as such.

## Phase G: documentation and verification

- README, in-game controls/help, a v32 changelog, a level-by-level acceptance table, and an honest list of limitations (including anything not playtested by humans on clean Windows/macOS machines).
