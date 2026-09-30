# v32: Campaign 0–10, simpler play, a real data hall, desktop app

v32 builds on v31 (per-family device logic, 43 challenges, LAN co-op). The device simulation is unchanged: every level below is graded by the same device logic, path evaluator and office checks that drive LEDs, GUIs, CLIs and alarms.

- [Install and run](#install-and-run)
- [What changed](#what-changed)
- [Campaign levels 0–10: acceptance](#campaign-levels-010-acceptance)
- [Saves and migration](#saves-and-migration)
- [Measurements](#measurements)
- [Tests and playtests run](#tests-and-playtests-run)
- [Limitations and not done](#limitations-and-not-done)

## Install and run

**Desktop app (no Node.js needed).** On macOS, open `Infra Simulator.dmg` and drag the app to Applications. On Windows, run `InfraSimulator-Setup.exe`. Builds come from `.github/workflows/desktop.yml`: every run uploads artifacts, and a `v*` tag publishes a GitHub release. Builds are **unsigned** unless signing secrets are configured, so macOS Gatekeeper asks you to confirm the first launch (right-click → Open) and Windows SmartScreen shows "More info → Run anyway".

**Web package.** With Node.js 22+, run `node lan/server.mjs` and open the printed `http://localhost:…` address. There is no `npm install`. `npm test` runs the regression suite.

**Build the desktop app yourself.** Run `cd desktop && npm ci && npm run make`. On macOS this builds a DMG and a zip; on Windows it builds a Squirrel `Setup.exe` and a zip. Forge copies `dist/` and `lan/` into the app, so the desktop app ships the same client and room server as the web package.

## What changed

### Start flow

The first screen offers five choices:

- **Solo Campaign** (recommended)
- **LAN Host Campaign**
- **Join LAN**
- **Free Build**
- **Challenges**

Only the host chooses the mode and the save. Guests join with the room code and can do every task.

- On the desktop, Solo uses the app's own room bound to this computer only, and autosaves to the user folder. **LAN Host** opens the same room (and the same save) to the network, shows the room code and addresses, and **Team → Stop hosting** closes it again.
- In the browser, Solo keeps a local world with browser autosave.
- The room code is kept next to the save, so guests can rejoin after a host restart.

### Campaign panel and HUD

- The level HUD (top-left) shows the level, checks passed, the **next physical action**, why it is blocked, and the distance to a green floor marker at the target.
- The panel has six tabs: **J** Objective, **I** Inventory & orders, **M** Map, **Laptop**, **Team** and **Settings**. The v31 engineering tabs (monitoring, power, NOC, documentation, saves) are under **Advanced**.
- The Objective tab shows:
  - why the level matters;
  - the next step, with a "Show me where" marker;
  - inline controls where a step happens at a patch panel or kiosk;
  - technical details on demand;
  - three hint tiers (**H** or buttons): where/what, connections/settings, specific diagnosis;
  - every live check;
  - repair objectives.

### One verb under the crosshair

The prompt is either `E · Plug CAT6 patch lead end A into SWITCH-… port5`, or a reason plus the next useful action:

- `✗ PSU A is at the rear · walk behind R01`
- `✗ Needs rails · install a 1U rail kit here first`
- `✗ This 10G SFP port needs a 10G DAC or fibre with SFP optics · CAT6 fits the 1G RJ45 ports`
- `✗ Port already occupied`
- `✗ Hands full · G puts it down first`

Device health appears on a separate `Status ·` line.

**X cancels a held end.** A pulled data cable or power cord is plugged back where it was, and the first end of a new cable is freed. **G** puts any item down. The carried-item card shows the name, the type and those keys.

### Empty site

A new campaign has no racks, internal network, firewall, servers, storage, APs or internal cabling. What is pre-provisioned is building power (overhead whips A/B at each rack bay), the office structured cabling (outlets to a patch panel) and the provider's street fibre. Racks are bought, carried and placed on bays R01–R06. Each rack's PDU A and B inputs must be plugged into the building whips at the top rear. Until then its outlets are dead, and so is everything in it.

### Movement and view

- **Z** or right mouse zooms to read ports and labels.
- Mouse-look deltas are clamped, so pointer-lock recovery no longer jumps.
- Invert-Y is available in Settings.
- A controls hint appears for the first entries (or always, via Settings) and changes while you carry something.
- A "Click to look around" hint shows when pointer lock is released.
- The player spawns in receiving at level 0.

### Data hall

- A real acoustic ceiling with recessed LED panels replaces the black starfield.
- The floor is raised tiles, with perforated cold-aisle tiles in front of the rows.
- Walls are neutral with a base band.
- Tone mapping is calibrated: exposure 1.65 → 1.08, balanced hemisphere, key and rear fill.
- The light switch gives visible emergency lighting rather than darkness.
- Receiving has a roll-up loading door, a hatched delivery zone, pallet shelving with cartons, a packing bench and a procurement kiosk with a screen.
- Chassis have a matte finish.
- Rear PSU modules show an IEC inlet and a live status LED: green = fed, amber = no input or breaker tripped.
- Decorative traffic particles and stars are hidden in gameplay.
- Cables use physical colours: copper data orange, management blue, OM4 fibre aqua, OS2 yellow, DAC/AOC grey, power black.

### LAN

- A client whose action races a host tick (HTTP 409) retries it with the newer world, instead of showing "World changed; retry".
- After a host restart, clients rejoin by themselves.
- Clients show the host's level evaluation: the host sees unredacted office data, so a guest never sees a false repair objective.

### Desktop app (`desktop/`)

The desktop app uses Electron and Forge.

- The room runs in the main process through `lan/room.mjs`, which is `startRoom()` refactored out of `lan/server.mjs`.
- The renderer has no Node access (`contextIsolation`, `sandbox`). A three-call preload bridge (`hostLan`, `stopHosting`, `info`) is the only interface.
- Navigation is limited to the local room and private LAN hosts.
- Only one instance runs at a time.
- **File → Import campaign save…** imports a web save: it backs up the current save and writes atomically.
- **File → Export hosted campaign save…** and **File → Show saves folder** are also available.

## Campaign levels 0–10: acceptance

Every check reads the live world. Ordering, UI clicks, documentation fields and stored flags never complete a level. The only recorded facts are the level **exercises** (data incident, fault drill, failover test, final incident). Each one changes the real world, and the live checks grade the repair.

An earned level stays earned. When its checks fail later, it appears as a **repair objective**.

| Level | Goal | Live acceptance (all must pass) | Kept open in tests by | Reward / unlock |
| --- | --- | --- | --- | --- |
| 0 · Empty site | Receive and build the first safe rack | Rack delivered and unboxed · rack on a marked bay · PDU A and B inputs plugged into the building feeds · no tripped breaker · rail kit in the rack | ordering only; rack not fed | $10k · Network |
| 1 · Management foundation | Build the management path | Management switch racked · powered (unplugging the rack feed drops it) · 10.10.70.x/24, VLAN 70 and SSH set on the serial console · factory admin password changed with the vendor syntax (FortiSwitchOS `config system admin`, NX-OS/OS10 `username admin password …`, AOS-CX `user admin password plaintext …`) · central PC patched with a real CAT6 lead · path from the central PC to the switch's management | no patch lead; PC port in VLAN 1 | $12k · Security, optics |
| 2 · Internet edge | First working WAN | Contract-1 chain (FortiGate + access switch racked and powered, switch initialized, ISP circuit, provider router racked/powered/patched, WAN from the circuit sheet, VLAN 10 + DHCP, desk patched, VLAN carried) · FortiGate admin password changed · FortiGate management on VLAN 70 · Sales PC resolves a public name and browses | no policy/NAT; factory FortiGate password | $20k · desktops |
| 3 · Segmented office | Separate users and protect data | VLAN 10/20/30/40/70 gateways up · Sales, Finance and Engineering desks browse · Sales → Finance desktop test **stops at the firewall policy** | a permissive staff → staff rule | $20k · APs |
| 4 · Wireless access | AP and guest network | AP installed, PoE, CAPWAP, authorized, SSID VLANs carried · secured employee SSID on a staff VLAN · isolated Guest VLAN 90 · a guest Wi-Fi client browses · the guest client is denied by policy toward Finance | AP not authorized | $22k · Compute |
| 5 · Compute and intranet | Server services | Server racked, powered and booted · iDRAC/iLO management · OS or hypervisor installed · data NIC or port group on VLAN 50 · web service running · DNS record · Finance opens the site **by name** | server powered off | $30k · Storage, SAN |
| 6 · Shared storage | Resilient data paths | Array racked and powered · setup and management · pool · data ports and host initiator · volume mapped · **two independent healthy paths** · bound in Office → Storage | only one fabric cabled | $45k · licences, spares |
| 7 · Protection and recovery | Protect business data | Finance share readable by Finance · sample data written · backup licence and backups enabled · a recovery point · guided data incident run (files really corrupted) · restored after the incident with the content intact · Sales still denied the share | incident not restored | $30k · monitoring |
| 8 · Observe and troubleshoot | Make operations visible | Monitoring with SNMP, syslog and alert e-mail · fault drill run (it breaks a real Sales path: cable, port, VLAN or both switch PSU cords) · repaired (detected from the live Sales test) · service healthy with no critical alarm | drill not repaired | $30k · secondary ISP |
| 9 · Resilience and expansion | Survive a planned failure | Every installed device on PDU A **and** B · secondary ISP (SD-WAN member 2) · storage still on two healthy paths · planned failover test: primary WAN down, Sales browses through member 2 | one switch on a single feed | $45k · GPU, branch |
| 10 · Full commissioning | Operate a complete enterprise | Levels 0–9 all pass **live** · every purchased device powered and managed (or removed) · no critical device alarm · final incident injected and repaired | incident running | $60k · campaign complete |

The levels-track start budget is $60,000. That covers the most expensive level-2 choice (FortiGate 601F) with no grinding. Rewards are paid as each level is accepted.

## Saves and migration

Save format **32** adds `operations.track = 'levels'`, `operations.levels` (current level, earned levels, exercises) and `operations.rackFeeds`.

- **v29–v31 contract campaigns** continue as levels:
  - Completed contracts map to earned levels: Internet ⇒ 0–2, segmentation ⇒ 3, Wi-Fi ⇒ 4, services ⇒ 5, storage ⇒ 6, monitoring/backup ⇒ 7.
  - A completed HA contract adds level 9.
  - The first unmet level becomes current.
  - The building racks stay installed, and equipment, money, credentials and office configuration are kept.
- **Legacy rack-project campaigns** keep their world. Project 1 or later marks levels 0–1.
- **LAN host:** before the first save of an older file, `campaign-save.json` is copied to `campaign-save.pre-v32-backup.json`.
- **Desktop:** File → Import backs up the current save and writes the imported one atomically.

## Measurements

All numbers were measured, not estimated. The rig was Chrome (headless) on an Apple M3 (ANGLE Metal) at 1920×1080, High preset, pixel ratio 1, in Free Build (the full facility), over 120 frames per view. The same script and the same views were used before (commit `61140f0`) and after. Frames are vsync-capped at 60 fps, so the median frame time is 16.6 ms in every view; the p95 column shows the occasional long frame.

| View | Draw calls v31 → v32 | Triangles v31 → v32 | p95 frame v31 → v32 | 12 players v32 (draws / p95) |
| --- | --- | --- | --- | --- |
| Entrance | 583 → 624 | 156k → 160k | 29.4 → 27.8 ms | 723 / 28.5 ms |
| Receiving | 21 → 26 | 51k → 52k | 28.8 → 33.7 ms | 26 / 24.4 ms |
| Rack front | 416 → 419 | 111k → 113k | 31.2 → 35.7 ms | 445 / 27.7 ms |
| Rack rear | 439 → 471 | 129k → 132k | 28.7 → 31.2 ms | 581 / 26.0 ms |
| Cabling | 383 → 404 | 108k → 111k | 30.7 → 29.0 ms | 515 / 26.1 ms |
| Office | 566 → 596 | 156k → 159k | 27.7 → 28.7 ms | 695 / 26.7 ms |

The p95 values vary by a few milliseconds from run to run in both versions (compare the 1- and 12-player columns). The ceiling, floor, receiving room and PSU modules cost about 7% more draw calls at the entrance. The new PSU parts are merged per device, with instanced LEDs and pick-only aim targets. The JS heap stays at 40–60 MB.

**LAN load (12 players, 30 s).** 11 walking players posted poses at the client rate and one did an action every 2 s:

| Metric | Value |
| --- | --- |
| Pose posts | 87/s |
| Roster frames | 8.2/s |
| World frames | 0.47/s |
| Download per client | 73 KB/s (≈ 7 Mbit/s for all 12) |
| Host CPU | 3.8% |
| World frame size, early campaign | ≈100 KB |
| World frame size, level 10 | 153 KB |

World frames are sent once per change, never per pose.

Before/after screenshots of the same views are in `docs/v32/before` and `docs/v32/after`. Play screenshots are in `docs/v32/play`.

## Tests and playtests run

`npm test` passes. It includes the v28–v31 suites and these new ones:

| Test | What it covers |
| --- | --- |
| `tests/campaign-levels.mjs` | Levels 0→10 from an empty site through world actions only: orders, carrying, rack feeds, console, GUIs, office. Each level is also held open by a real mistake (see the table). Also covers a regression shown as a repair objective, save/restore with all 11 levels passing live, the budget never going low, and the world frame size. |
| `tests/campaign-lan.mjs` | A v30 save is backed up and then migrated (level 3). A guest's mode and save requests are refused. A guest does the level-0 work and the host earns it. A late joiner and a host restart see the same level. |
| `tests/room-rebind.mjs` | The world tick survives local/LAN rebinds, and `close()` stops the room. |
| `tests/interaction.mjs` | Prompt wording and reasons, X cancel for a new cable, a pulled cable and a pulled cord, and title parity. |
| `tests/save-migration.mjs` | Now format 32, with contract → level mapping. |

Browser and desktop playtests are in `tests/browser/` (they need `playwright-core` and Chrome; see its README). These runs were played on this build:

- **Level 0 and Level 1 through the real 3D interaction path**: aim, read the prompt, press E. This included typing the FortiSwitch console commands into the laptop terminal.
- **Campaign 0→10 Solo** in the browser. The browser autosave reached level 11.
- **Campaign 0→10 over LAN** in browsers. The host started from the LAN Host screen, a guest browser did every level through its LAN client (walking to racks for reach-checked actions), and a late guest joined before level 10. All clients reported the same level after every level, with zero page errors.
- **The packaged macOS (Apple Silicon) app** loads with no Node in the page. Solo autosaves to the user folder, LAN Host is reachable on the LAN IP, Stop hosting closes it, and quitting stops the server.
- **The macOS app hosting Campaign 0→10 for Chrome guests** on its LAN address. The app was then quit and relaunched, and the campaign was still there.

These playtests fixed real bugs:

- The world tick stopped after the desktop rebound the room for LAN hosting.
- The Inventory tab collapsed open sections every 0.4 s.
- Laptop leads could not be equipped from the new panel.
- A device could show "Install" where rails were missing.
- Guest actions failed with "World changed".
- Clients showed a false repair objective from redacted data.

## Limitations and not done

- **No human playtest.** All play above was scripted (bots driving the real client). No one has played it with a mouse and keyboard, and nothing was run with 12 real people.
- **Windows was not built or run here.** The Windows installer is produced by the CI workflow on a Windows runner, which has not run until this branch is pushed. Neither the macOS Intel build nor a Windows ↔ macOS cross-OS LAN session was tested. The builds are unsigned unless the secrets in the workflow are set.
- **Graphics were done in part.**
  - Done: the environment, lighting and exposure, the receiving room, the kiosk, the chassis finish, rear PSU modules and cable colours.
  - Not done: new chassis silhouettes per model, drive/fan/handle detail beyond v31, LOD, shadows, and reworked cable routing (routing is still v31's lanes).
  - Performance was measured only on an Apple M3 with vsync. There is no number for a low-end laptop GPU yet.
- **Aim selection.** The prompt, reasons and cancel are new. The raycast pick order (`aiming.js`, `assistAim`) is v31's: ports win over the rack body on the same device, and there is a small aim cone for cables and optics.
- **Simulator limits** (clearly simplified):
  - The office structured cabling is represented: patching a desk uses one CAT6 lead from stock, not a modelled patch-panel strand.
  - The secondary ISP is an office item (SD-WAN member 2), not a second racked provider router.
  - The level-8 check cannot know which GUI or CLI a player used to find the fault; it grades the repair.
  - Rack PDUs are fed from two abstract building whips; there is no upstream switchgear or UPS model.
- **Legacy rack-project saves** may show level 1 as a repair objective after migration, because the v31 installation track never required switch admin passwords or the central PC patch.
