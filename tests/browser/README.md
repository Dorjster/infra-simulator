# Browser and desktop playtests (not part of `npm test`)

These drive the real client in Chrome through Playwright. They need `playwright-core` (install it outside the game, e.g. `npm i --no-save playwright-core`) and a Chrome/Chromium: set `CHROME=/path/to/chrome`, or install one with `npx playwright install chromium`. Each script takes the repository root and an output folder for screenshots.

| Script | What it plays |
| --- | --- |
| `start-flow.mjs <root> <out>` | Start screen → Solo Campaign → level HUD, Objective, Map and Inventory tabs |
| `level0-ui.mjs <root> <out>` | Level 0 through aim + E only: kiosk, boxes, carry the rack, place it, PDU A/B whips at the rear, rails |
| `level1-ui.mjs <root> <out>` | Level 1 through the UI: order, mount, PSU cords, equip and plug the console cable, FortiSwitch commands typed in the laptop, patch panel, port VLAN on the console |
| `campaign-lan-e2e.mjs <root> <out>` | Campaign 0→10 over LAN: the host starts it from **LAN Host Campaign**, a guest browser does every level through its LAN client (walking to the rack for reach-checked actions), a late guest joins before level 10; every client's level is compared after each level |
| `capture.mjs <root> <out> [players]` | Same 7 views (entrance, receiving, rack front/rear, cabling, office, device GUI) with FPS, frame-time percentiles, draw calls, triangles and heap; `players` adds simulated LAN engineers |
| `lan-load.mjs <root> [seconds]` | 12 players: pose posts/s, world and roster frames/s, bytes/s per client, server CPU |
| `desktop-app.mjs <app-binary> <out>` | The packaged desktop app over CDP: no Node in the page, Solo saves to the user folder, LAN Host reachable on the LAN IP, Stop hosting, clean quit. Unset `ELECTRON_RUN_AS_NODE` if your shell sets it. |
| `desktop-lan-e2e.mjs <app-binary> <out>` | The packaged desktop app hosts over LAN; Chrome guests on its LAN address play Campaign 0→10; then the app is quit and relaunched and the save is checked |
| `campaign-solo-e2e.mjs <root> <out>` | Campaign 0→10 in Solo in one browser page (local world, browser autosave) |
| `frame-pacing.mjs <root> <out> [solo|guest] [cpuThrottle] [seconds]` | 20 s walk: frame-time percentiles, long tasks and which subsystem dominated each slow frame |
| `clipboard-mac.mjs <app-binary>` | Packaged macOS app: text from `pbcopy`, Cmd+V/C/X/A, laptop CLI single-line and multi-line paste preview/cancel/confirm, masking |
| `lan-characters-video.mjs <root> <out>` | Records the 1 → 4 → 12 player LAN clip with varied characters, carrying, crouching, pointing and emotes |
| `desktop-smoke.mjs <app-binary> <report.json>` | CI smoke test for the packaged Windows/macOS app (start screen, Level 0, Free Build racks, Continue, OS clipboard paste, frame times, clean quit) |
