# v33: bug fixes, smoother play, new characters, Windows performance work

v33 is a stabilization release on top of v32 (commit `5579161`). Campaign levels 0–10, device logic, save migration and LAN host authority are unchanged, except where a fix below says otherwise.

## Reproduced issues and root causes

Each issue was reproduced before it was fixed. Where possible, a regression test that failed first now passes.

| # | Reported / found | Root cause | Fix (modules) |
| --- | --- | --- | --- |
| 1 | **Campaign → Free Build: working devices with no visible rack.** Reproduced in Chrome: all 30 Free Build devices were active while racks R01–R06 were hidden. Screenshots: `docs/v33/before-…` and `after-free-build-after-campaign.jpg`. | `engineering-ui.js` set the visibility of R01–R06 only while the empty-site campaign was active. After a campaign hid them, nothing showed them again. Hidden racks also lost walk collision. | Rack visibility is now computed from placement every frame, in both directions (`engineering-ui.js`). |
| 2 | Impossible states could exist, e.g. a device mounted in a rack that was never placed (malformed or hand-edited save). | No world invariant check. | New `operations.invariants()` (device in an unplaced rack, device running without a fed PDU, working link to an inactive device) and `operations.repair()` on every load: a ghost device goes back to receiving and its cables are unplugged (`operations.js`, `shared-world.js`). |
| 3 | Leftover 3D items across games. | Delivery boxes and carried/floor models were keyed by order or item id, and `ORDER-1` repeats in every new game. | Keyed per game; old meshes are removed on a world switch; temporary UI state is reset (`engineering-ui.js`). |
| 4 | Free Build on the desktop could touch the campaign. | Desktop Solo plays in the app's own room, and Free Build switched that room's mode. | Free Build and Challenges run as a local sandbox unless a LAN room with other players is in use. A LAN host can **Continue hosted campaign** after Free Build (`campaign-ui.js`, `operations.campaignSummary()`). |
| 5 | The game could start in old menus. | `engineering-ui.js` still had the old "Choose your game" menu (Continue/New project campaigns, Tutorial), and the LAN lobby still had "Start campaign" (legacy projects) and "Start enterprise office". | The Menu button, the old menu, the level campaign's Projects page and the laptop's "Apps / projects" route to the v32 start screen or Campaign panel. LAN lobby buttons start the levels track (`engineering-ui.js`, `multiplayer.js`, `lab.js`). |
| 6 | **Copy/paste does not work in the desktop app.** | No Edit menu: on macOS, Cmd+C/V/X/A reach text fields only through Edit-menu roles. There was no right-click menu. The backtick terminal shortcut swallowed ` in fields. A multi-line paste into the laptop CLI ran every line immediately. | Native Edit menu, right-click edit menu for fields and selections (`desktop/main.mjs`). The game ignores Ctrl/Cmd shortcuts (`lab.js`). Backtick is left alone in fields (`app.js`). CLI paste changes (`service-kit.js`): one line is inserted as text; several lines open a preview that needs **Run one at a time / Insert first line only / Cancel**; secrets are masked in the preview **and** in the terminal echo. |
| 7 | A new campaign's laptop said "connected to MGMT-SW 10.10.70.240". | The laptop always docked to the building management switch, which does not exist on an empty site. | The laptop starts unplugged and says how to connect (`service-kit.js`). |
| 8 | **Stutter** (reported on Windows). | Measured in Chrome with the CPU throttled to 4×: frames of 100–160 ms, 2–3 times a second. The CPU profile showed several causes: the device-logic cache flushed globally every 400 ms, and every device's LEDs were recomputed on the same frame; switch LEDs recomputed every port once per port (quadratic); office/network path searches scanned all links for every visited switch; the operations tick forced a full recompute every second; the NOC wall screen was redrawn and re-uploaded every second from anywhere; hidden particles were still simulated; the campaign HUD evaluated all 11 levels; shaders compiled on first sight; the resolution scaler oscillated. | Per-device cache expiry with round-robin, frame-budgeted LED/status refresh; `portsState` memoized; path searches index links once; no forced recompute; NOC only when near and changed; particles only when visible; per-level campaign evaluation (current level plus two earned levels per refresh), cleared on every world change; nearby-only aim raycast; frozen static matrices; shader pre-compile; resolution scaler with hysteresis that never drops below 1× on Medium/High (`device-logic/common.js`, `engineering-ui.js`, `office-sim.js`, `network-sim.js`, `operations.js`, `campaign-levels.js`, `lab.js`, `app.js`, `facility.js`, `hardware.js`). |
| 9 | The default preset was too heavy on scaled Windows displays. | Medium rendered at 1.5× density, i.e. native 1.5× on a 150 %-scaled laptop. | Low = 1×, Medium ≤ 1.25×, High ≤ 2×, plus a resolution scale (100/85/70 %) and a frame-rate limit (display/60/30). A first-run benchmark picks Low on slow machines. A software-rendering warning with recovery steps. The desktop app asks for the discrete GPU on dual-GPU laptops (`app.js`, `campaign-ui.js`, `desktop/main.mjs`). |
| 10 | LAN guests sometimes saw "World changed; retry your command". | A guest action can race a host tick (HTTP 409). The action is not applied in that case. | The client resends with backoff up to 8 times (`multiplayer.js`). |
| 11 | Quitting right after a level-up could lose it. | The browser autosave is throttled to every 4 s. | Saves immediately on level completion (`campaign-ui.js`, `engineering-ui.js`). |
| 12 | Toasts covered the Campaign panel tabs at 150 % scaling. | Fixed top-right position. | Toasts move to the bottom-right while a panel or the start screen is open. |

## Start flow and navigation

- The first screen shows **Continue Campaign · Level N · company · budget** when a save exists (desktop: the app's own room; browser: the browser save), then **New Campaign**, **LAN Host Campaign**, **Join LAN**, **Free Build** (a separate, fully built sandbox) and **Challenges**. A new campaign starts at Level 0 in the receiving room, facing the kiosk, with the objective HUD and marker visible and nothing else open.
- **Escape** closes the topmost panel (office GUI, laptop, engineering, Campaign panel) and returns to the game. Otherwise it opens the Campaign panel. One click re-captures the mouse.

## Clipboard matrix

- **Tested:** the packaged macOS (Apple Silicon) app.
  - Text was copied **outside the app** with `pbcopy` and read back with `pbpaste`.
  - Keys were sent as Cmd+key key events carrying Chromium's native editing command (the command the Edit-menu role runs).
- **Limit on macOS:** real OS keystrokes could not be sent from this session (macOS denied System Events keystrokes), so the step "Cmd key → Edit menu" was not exercised automatically. Please confirm it once by hand.
- **Windows is not verified here.** The CI smoke test runs a clipboard paste in the packaged Windows app and uploads the result.

| Case (packaged macOS app) | Result |
| --- | --- |
| Cmd+V into company name (text from another app) | Pass |
| Cmd+A, Cmd+C out of a field to the OS clipboard | Pass |
| Cmd+X cuts | Pass |
| Cmd+V host address `192.168.1.20:8080` | Pass |
| Cmd+V room code | Pass |
| Single-line paste into the laptop CLI: text only, not run | Pass |
| Three-line paste: preview, nothing run | Pass |
| Preview masks `password …` | Pass |
| Cancel runs nothing | Pass |
| Confirm runs each line in order with output | Pass (password masked in the echo too, after a fix) |

## Performance

All numbers were measured, not estimated.

**Windows was not available here, so no Windows numbers are claimed.** The CI job launches the packaged Windows app and records its frame times, but GitHub's Windows runners have no GPU (software rendering), so those numbers show correctness, not gaming-laptop performance.

What was measured: Chrome on an Apple M3 at 1920×1080, v32 (`5579161`) and v33 on the same 20-second walk through the entrance, rack fronts and rears, receiving and the office. "4× CPU" throttles the CPU to approximate a mainstream laptop CPU.

| Scenario | v32 median / p95 / p99 | v33 median / p95 / p99 | Frames > 100 ms (v32 → v33) | Long tasks (v32 → v33) |
| --- | --- | --- | --- | --- |
| Solo, 1× CPU | 16.7 / 36.9 / 74.1 ms | 16.7 / 18.7 / 20.6 ms | 7 → 0 | 26 → 0 |
| Solo, 4× CPU | 19.2 / 76.5 / 103.2 ms | 17.5 / 25.1 / 33.1 ms | 13 → 0 | 89 → 0 |
| LAN guest (host + 10 bots), 1× CPU | 16.6 / 30.3 / 45.7 ms | 16.6 / 19.4 / 23.5 ms | 0 → 0 | 4 → 0 |
| LAN guest, 4× CPU | 20.8 / 77.6 / 107.4 ms | 20.5 / 30.4 / 50.3 ms | 16 → 1 | 82 → 3 |

**Other measurements:**
- **12 LAN players in view:** median 16.6 ms, p95 20.9 ms, 753 draw calls.
- **Packaged macOS app smoke run:** 60 FPS, median 16.6 ms, p95 17.8 ms, p99 21.2 ms, 644 draw calls.
- **Remaining costs:** the render call itself (about 60 draw calls per view plus scene traversal) and a LAN guest's full world restore per host frame (about 6 ms at normal speed).

**What you can send us:**
- **Settings → Show FPS** shows FPS, p95, draw calls, render size and preset.
- **Settings → Copy performance diagnostics** copies the GPU, preset, frame percentiles, mode, level and player count. It contains no names, passwords, room codes or saves.

## Characters

The characters are an original compact engineer with a big round head and expressive face (the six face styles are kept):

- a team-colour work jacket with reflective bands, a hi-vis vest, or plain;
- charcoal work trousers, a utility belt with pouches, chunky boots and an ID badge on a lanyard;
- headwear: cap, bump helmet, beanie, headset, or hair.

Players choose their face, head colour, headwear and jacket in the character picker. Headwear shape and jacket style tell players apart without relying on colour, alongside the name tag.

The new poses are carrying a box or rack gear (a carton between the hands, a slight lean back), holding a cable (a coil in one hand), pointing (on a team ping) and stepping when turning on the spot. They travel in the LAN pose, and the host validates them. Remote avatars farther than 45 units animate at half rate.

Evidence: `docs/v33/characters-front.jpg`, `-back.jpg`, `-side.jpg`, `lan-12-players.jpg`, and the clip `lan-1-4-12-players.webm` (1, then 4, then 12 players walking, carrying, crouching, pointing and emoting over the LAN server).

## Tests and playtests

`npm test` passes. It adds:

| Test | What it covers |
| --- | --- |
| `tests/mode-transitions.mjs` | Empty Campaign → Free Build → Campaign; partially built Campaign → Free Build → Challenge → Free Build → Campaign; save/reload; malformed save repair. It asserts rack visibility, pick/collision geometry and invariants for every active device, not only the mode label. |
| `tests/engineer-ui.mjs` (updated) | The old menu now routes to the start screen. |
| `tests/campaign-levels.mjs` (updated) | Repair objectives with the new per-level evaluation. |

Browser and desktop runs on this build:

- **Level 0 and Level 1 through the real 3D UI:** pass.
- **Solo Campaign 0→10 in the browser:** pass.
- **LAN Campaign 0→10 (host + guest + late joiner):** pass. All three clients reached level 11 with zero page errors.
- **Packaged macOS app:** `tests/browser/desktop-smoke.mjs`, 10/10 checks pass (60 FPS, p95 18.4 ms), and the clipboard matrix passes 10/10.
- **CI:** runs the same smoke test on the packaged Windows and macOS builds (`.github/workflows/desktop.yml`) and uploads `desktop-smoke-<platform>.json`. The Intel Mac build moved from the retired `macos-13` runner to `macos-15-intel`, and a release now publishes whatever platforms built.

## Installer fixes (v33.0.1)

Players reported that the DMG and Setup.exe did not work.

| Problem | Root cause | Fix | How it is verified |
| --- | --- | --- | --- |
| macOS: a downloaded app was reported as "damaged and can't be opened", with no way to open it | Renaming Electron.app during packaging invalidated Electron's own ad-hoc signature. Apple's `syspolicy_check` reported a **fatal** error: "Code has no resources but signature indicates they must be present". | The `postPackage` hook in `desktop/forge.config.cjs` re-seals the whole bundle ad hoc (`codesign --force --deep --sign -`) and verifies it, unless Developer ID signing is configured. | `syspolicy_check` now reports only the expected "ad-hoc signed" warning. The rebuilt DMG passes all 10 smoke checks. CI now runs `codesign --verify --deep --strict` on the app inside the DMG and fails the build if it is broken. |
| Windows: Setup.exe created no shortcut, and the game started in the middle of installing and uninstalling | The app ignored Squirrel's `--squirrel-install / -updated / -uninstall` events, so Squirrel's launch opened a full game instead of creating shortcuts and quitting. | `desktop/main.mjs` handles these events: it runs `Update.exe --createShortcut` (or `--removeShortcut`) and exits before any window or room starts. | CI runs `Setup.exe --silent` on Windows. The build fails unless the app is installed under `%LOCALAPPDATA%\infra_simulator` and a shortcut exists. The smoke test then drives the **installed** copy. |
| No usable GPU driver (remote desktop, VM, old or blocked driver): the game ran at 4–5 FPS, with some frames taking up to 7 s, so it looked frozen. This is why the earlier Windows and Intel CI smoke runs failed. | Software WebGL drew a 1600×900 frame with MSAA on the CPU. | When software WebGL is detected: render at 0.5× resolution (scaler floor 0.35×) with no MSAA, and keep `enable-unsafe-swiftshader` so newer Chromium still falls back instead of failing. | Locally under SwiftShader: Level 0 runs at 16–20 FPS (was 5), and the full hall at about 7 FPS. The smoke test passes 10/10 under SwiftShader (was 2 passes and 3 failures). The smoke test now waits on game state, not on fixed delays. |

Still unverified: a Windows PC with a real GPU, run by a person. CI checks only the installer and software rendering.

## Not done / limits

- **No human playtest.** All play here was scripted through the real client. A person still needs to play Levels 0–10 with keyboard and mouse.
- **Windows:** performance and clipboard are **unverified** until the CI smoke report comes back, and fully only on a real Windows laptop with a GPU. Use Settings → Copy performance diagnostics on a Windows laptop to send numbers.
- **macOS:** the real Cmd-key → Edit-menu path needs a one-time manual check (automated keystrokes were blocked).
- **Characters:** a first playable draft. Tell me which headwear/outfit direction you like before more art time goes in. The first-person view still shows the carried item model, not hands.
- A Windows ↔ Mac LAN session was not run (only macOS hardware was available).
