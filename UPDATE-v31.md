# v31 — Device logic: every device behaves like the real product

v31 builds on v30 (ISP circuits, vendor-style GUIs, live contracts). v30 made the devices look like the real products; v31 makes them behave like them. Each device family now has one logic module that decides its state. The front panel LEDs, the web GUI, the CLI, the NOC monitoring, the office path evaluator, the contract steps and the challenges all read that module. They cannot disagree, and a change made by any player appears for every LAN player at once.

## Install / run

Same as v30. Stop the old server (Ctrl+C), extract into a new folder, copy your previous `lan/campaign-save.json` into the new `lan` folder to keep the campaign, then run `node lan/server.mjs`. You need Node.js 22 or newer and no `npm install`. Open http://localhost:8080. v29 and v30 saves are migrated automatically to save format 31. `npm test` runs the regression suite.

## 1. How the logic works (all devices)

`dist/device-logic/` has one module per family: `firewall`, `switch`, `provider-router`, `server`, `gpu-server`, `storage-array`, `nas`, `san-switch`, `pdu`, `access-point`, `pc`. Every module exports the same functions:

| Export | What it gives |
| --- | --- |
| `state()` | power, boot phase, management, health, ports, services, alarms |
| `checks()` | ordered checks: `{ id, layer, ok, detail, fixHint, where, severity }` |
| `leds()` | front, PSU and port LEDs (colour + blink) derived from `state()` |
| `cli()` | vendor-style command output, or "not handled" |
| `gui()` | status summary, "what's blocking" box, extra vendor pages |
| `faults` | the faults this family can suffer (used by challenges) |
| `commands` | the syntax the device answers (used by `?` and Tab) |

Each module starts with a comment describing its state machine.

- **Layer order.** Checks run physical → power → boot/firmware → management → link → L2 → L3 → service → application. The first failing *critical* check is the one plain-language result, and it says what is wrong, where to fix it and what the real product would show. *Warnings* (lost redundancy, unsaved config, an STP-blocked port, throttling) are reported but never stop the chain.
- **One source of truth.** The modules only read the shared world state. Nothing is stored except by the normal actions: cabling, power, GUI saves, CLI commands, office configuration. There is no "broken" flag that the UI reads directly. A fault changes the real thing (a cable, a PSU cord, a port setting, a provider record) and the logic diagnoses it.
- **No hidden timers or random failures.** The only timed behaviours are visible and documented: boot (firewall 5 s, switches 4 s, server POST 4 s), RAID/pool rebuild (about 10 s, progress shown), and the PPPoE lockout (30 s, shown in the provider log). Faults happen only through challenges or host fault injection.
- **Cost.** Results are cached per device and recomputed on every world change and at most every 400 ms. LEDs and tooltips read the cache.

## 2. Per-device real-life logic

| Device | What behaves like the real product | Where you see it | Faults (challenge / injection) |
| --- | --- | --- | --- |
| **FortiGate** (200F, 601F, factory) | 5 s boot. Factory address 192.168.1.99 on mgmt. Forced first password change (`execute set-password`). One configuration store shared by the GUI, the FortiOS CLI (`config …/edit/set/next/end`, `show full-configuration`), the office evaluator and contracts. Routing table with longest prefix, distance, blackhole and routes inactive when their interface is down. DHCP lease table, exhaustion → clients fall back to 169.254.x.x, reservation conflicts. DNS recursive or forward-only. Policies evaluated top-down with implicit deny, NAT, schedules and objects. Hit counters and a session list from real employee traffic. VIPs from the /29 block, with an error when no policy allows them. `diagnose debug flow` gives the same verdict as GUI Diagnostics. HA active-passive (identical model and firmware, heartbeat cable, monitored ports). SD-WAN member health and failover. Licence status. | GUI pages Routing, DHCP leases, Sessions, HA, SD-WAN, Licence and the blocking box. CLI `get router info routing-table all`, `execute dhcp lease-list`, `diagnose sys session list`, `diagnose firewall policy hit-count`, `get system ha status`, `diagnose sys sdwan health-check`, `get license`. Status/alarm LEDs. | DHCP pool exhausted, DNS forwarder off, deny policy above the Internet policy, NAT removed, VIP without a policy |
| **Provider router (CPE)** | Read-only to the customer (`% Access denied`). LEDs PWR / FIBER / LOS / SERVICE / LAN. Static circuit: the provider gateway answers ARP only for the sheet IP. DHCP: lease to the MAC of the cabled FortiGate port. PPPoE: 3 wrong logins → 30 s lockout, written to the provider log. Provider events: maintenance / IP-change notice with a new circuit sheet, PPPoE password change. Link down → WAN down → SD-WAN failover → office impact. | Status page and provider log. LEDs. FortiGate WAN page. NOC. | CPE power pulled, fiber LOS (repair: provider ticket), PPPoE password changed, IP change |
| **Ethernet switches** (FortiSwitch, OS10, NX-OS, AOS-CX, factory) | 4 s boot. Factory switches are managed from the serial console only. VLAN database. Trunk allowed lists with a native-VLAN mismatch warning. MAC table learned from endpoints that really send traffic. RSTP root bridge and root/designated/alternate ports. Broadcast storm when a loop exists with STP disabled. LACP port-channel with suspended members. MTU checked end-to-end ("path MTU mismatch"). PoE budget: lowest priority loses power first. CRC/error counters. Running vs startup config: OS10/NX-OS/AOS-CX lose unsaved changes on a power cycle, while FortiSwitchOS saves immediately. | CLI `show spanning-tree`, `show mac address-table`, `show port-channel summary`, `show interface counters errors`, `show interfaces transceiver`, `show power inline`, `show running-config diff` (and FortiSwitch `diagnose …` forms). GUI pages. Port LEDs green / amber / off with blink. | Wrong optic, dirty fiber connector, loop without STP, LACP member mismatch, native VLAN mismatch, MTU mismatch |
| **Servers** (PowerEdge + iDRAC9, ProLiant + iLO 6, FortiAnalyzer/SIEM) | The BMC stays alive on standby power while the host is off. racadm / iLO CLI. Inventory, sensors, SEL written from real alarm transitions, lifecycle log, virtual console. POST, boot order and "No boot device available". PERC / Smart Array RAID: degraded → rebuilding → optimal, or failed when more members are lost than the level tolerates. BOSS boot. NIC MACs, WWPNs, IQNs. OS install from virtual media, which fails if power is lost. Virtualization: port groups, datastores, VMs refused at power-on above 4:1 vCPU / 125 % RAM, guest IPs, services and host-firewall ports. | iDRAC/iLO GUI pages. `racadm getsel`, `getsensorinfo`, `storage get vdisks`, `serveraction`, `vconsole`, `hwinventory nic`. iLO `show /system1/...`. `vim-cmd`, `esxcli`, `multipath -ll`. Health and drive LEDs. SEL. | PSU cord pulled (1+1 redundancy lost), RAID disk failure + rebuild, second disk during rebuild (data lost), VM overcommit, host firewall closed, mounted backwards |
| **GPU servers** (XE9680 8× H100, XE8640 4× H100) | Everything a server has, plus GPU inventory, per-GPU power from the workload and total draw on the rack PDUs. Backwards airflow → inlet over 35 °C → "HW Slowdown: Active" and a throughput drop (a warning, no damage). | `nvidia-smi`, `nvidia-smi -q -d temperature/performance`. GPU page. PDU load. | GPU thermal throttling (airflow) |
| **Block storage** (ME5 iSCSI/FC, PowerStore, Alletra, factory NVMe) | Setup wizard gate (admin, name, controller A/B IPs, NTP). Controllers A/B with ALUA: optimized paths go through the owning controller, and ownership moves to the survivor on failure. Pools/disk groups use the real RAID usable formula, spares and rebuild. Thin/thick volumes can only grow. Snapshots take pool space, and a full pool makes its volumes read-only. Hosts by IQN/WWPN, LUN IDs unique per host, read-only/read-write masking. iSCSI discovery with CHAP. A/B VLANs with jumbo frames end-to-end. FC zoning. Multipath active/standby/dead. IOPS/latency figures from the attached workload. | GUI pages Controllers, Pools, Hosts, Snapshots, Performance. CLI `show controllers`, `show disk-groups`, `show pools detail`, `show maps`, `show host-paths`, `show iscsi-sessions`, `show perf`, `pstcli …`. | Controller A failure (failover), pool drive failure + rebuild, second drive during rebuild, CHAP mismatch, pool full → read-only |
| **NAS** (PowerScale OneFS, StoreOnce NAS target) | Cluster setup, then access zone / NAS target on a data port. SMB shares with permissions from company users and groups. NFS exports by client subnet. Quotas. Clients reach a share only through the real network path and these rules. | `isi status`, `isi smb shares list`, `isi nfs exports list`, `isi quota quotas list`. GUI shares page. Office mapped drives. | NFS export rule excludes the clients |
| **FC SAN switches** (Connectrix / Fabric OS, factory SAN-A/B) | Serial-console setup (`ipaddrset`). FLOGI on every lit FC port with a peer. Name server (`nsshow`) with WWPNs. Aliases → zones → configuration → `cfgenable`, and with no effective config initiators see no targets. Fabrics A and B must never be joined. | `switchshow`, `nsshow`, `cfgshow`, `zoneshow`, `fabricshow`, `sfpshow`, `porterrshow`. GUI. Port LEDs. | Zoning configuration disabled |
| **Rack PDUs** (A and B per rack, 3-phase 11 040 W) | Load from each device's watt draw, split across its live PSUs. Load over the rating trips the breaker: outlets go dark and devices fed only by that PDU lose power, which can cascade to the other feed. The breaker can only be reset at the rack, and only when the load fits. | Engineering → Power page (per-outlet watts/amps, CLI box). `olStatus all`, `phReading all current`, `devReading power`. PDU alarms. | Overload (both GPU PSUs moved to PDU A) |
| **FortiAP** | PoE from the switch budget and priorities. DHCP in the management VLAN. CAPWAP discovery and authorization on the FortiGate. SSID → VLAN, which the switch port must carry. Clients get DHCP in the SSID's VLAN. | FortiGate Managed APs page. `cw_diag -c wtp-cfg`, `cfg -s`. AP LED. | AP not authorized, PoE budget exceeded |
| **Employee PCs** | Wall outlet → patch panel → access port (or SSID). DHCP DORA or 169.254.x.x on failure. Every command is built from the same path evaluation the office and contracts use. | Office desktop → Command Prompt: `ipconfig /all`, `ipconfig /renew`, `ping`, `tracert`, `nslookup`, `net use`. | Wrong static gateway, wall outlet not patched |

### Physical layer (all rack devices)

- **Power.** Each PSU cord plugs into PDU A or B. With 1+1 PSUs, one missing cord makes that PSU LED amber and raises a redundancy warning. Pulling the last cord drops the device at once: a running installer fails and VMs stop, and service returns only after boot/POST. Watts per model come from `power-grid.js`. For example, an XE9680 draws 1.8–7 kW depending on workload.
- **Cables and optics.** Speed and media must match (CAT6, OM4, OS2, FC, DAC, AOC). An unsupported transceiver lights the port amber. Maximum lengths apply (CAT6 100 m, DAC 7 m, AOC 30 m). A dirty fiber shows low rx power, flaps and raises CRC errors. A fiber cut shows LOS. Link LEDs are off, green or amber, and blink with activity.
- **Rack.** Rails and U positions, a weight limit (1 200 kg), and airflow direction. Backwards mounting raises inlet temperature and causes a throttling warning.

## 3. How to play the new parts

- **Hover** a device while walking. The prompt shows its health (✓ / ⚠ / ✗) and the first failing check.
- **[V] service key**, context-sensitive and validated on the host:
  - On a connected fiber port: inspect/clean the connector.
  - On the provider router: open a provider ticket, which repairs LOS.
  - On a device mounted backwards (powered off): re-mount it front-to-back.
- **Device GUIs** open with a status strip and a **"What's blocking"** box that links to the page where you fix it.
  - **Inline validation.** IPv4 addresses, prefixes, VLAN IDs, MTU and sizes are checked as you type. A Save with an invalid field is stopped and the field is highlighted.
  - **Confirmations.** Destructive actions first show their impact and run only when you click **Confirm**. These are: deleting a volume, pool, host or host group; powering off or deleting a VM; restoring a checkpoint; reinstalling the OS; entering maintenance mode; deleting a FortiGate VLAN, policy or DNS record; disabling a policy.
  - On the SAN switch CLI, `cfgdisable` asks `(yes, y, no, n): [no]` like Fabric OS.
- **Laptop terminal.** `?` lists the device's commands, `show sp?` filters them, and **Tab** completes. Unknown commands return the vendor's error text.
- **Engineering → Monitoring → Device alarms** lists alarms generated from the modules. Click an alarm to open the device GUI on the right page, with an arrow and floor waypoint over the device in 3D.
- **Engineering → NOC map** shows the topology with device health colours and failed links.
- **Engineering → Power** shows per-rack PDU loads and outlets, the PDU CLI and the breaker reset. The reset only works when you are standing at the rack.
- **Challenges 16–43** are device-logic challenges covering every family. Each one builds the lab it needs, injects one fault, and completes automatically when the broken check passes again after a real repair. They pass with `TEST_SEED=1`, `42` and `777`.
- **Contracts** show a step chain built from the same checks and are accepted automatically on the host.

## 4. LAN, saves, performance

- **LAN.** All changes go through `world.apply` on the host. Presence/reach checks (for example "Too far from … walk to rack R04") and fault injection are validated on the host, and injection is host-only. Guests receive every change live, including open GUI pages, which re-render when not being edited.
- **Saves.** Format 31 adds PDU breaker state, RAID/pool state, STP/SEL data and alarm memory. v29 and v30 saves migrate on load; `tests/save-migration.mjs` uses a real v30 campaign save.
- **Performance.** Draw calls per frame measured in Chromium (SwiftShader, 1440×900, default scene), v30 → v31:

  | View | v30 | v31 |
  | --- | --- | --- |
  | Walking, entrance | 825 | 450 |
  | Walking, at the racks | 638 | 357 |
  | Orbit overview | 909 | 512 |

  How the reduction was made:
  - Static instanced parts and port/PSU housings are merged per device. Pickable parts stay raycastable on a pick-only layer.
  - All data cables are one vertex-coloured mesh and all power cords are another. A focused cable is still drawn on its own.
  - Static text labels share an atlas and are merged per device.
  - Port and status LEDs are coloured from the cached logic LED state.
  - No shaders are recompiled at runtime.

## 5. Engineer avatars, faces and emotes (LAN co-op)

The blocky co-op figures are replaced by a round-headed cartoon scout engineer:
- a big round head with shiny eyes, freckles and a small toothy smile;
- a cream scout cap, khaki uniform, blue collar, and a navy sash with badges;
- mitten hands.

Your engineer colour is on the cap band, the neckerchief, the laptop lid and your name tag.

**Choose your engineer.** The first time you walk into the facility, a picker opens with:
- your name (up to 20 letters or digits, Cyrillic included; shown on your name tag, in chat and in the LAN roster);
- 6 faces: Cute, Smile, Big eyes, Grumpy, Angry and Sleepy;
- 6 head colours: yellow, red, blue, green, pink and mint.

Change them any time with the **🙂 name** button (top right). Your choice is remembered in your browser and every other engineer on the LAN sees it.

**Animation that other players see:**
- walking and sprinting (stride follows speed), crouching and idle breathing;
- blinking;
- carrying the laptop in both hands while the laptop or a service lead is out.

**Emotes.** In walk mode, scroll the mouse wheel to open the emote wheel. It opens on Salute, and each further notch moves the highlight. Click to play, or press 1–6. Right-click or Esc closes the wheel. Walking away cancels an emote, except Dead.

| Emote | What it does |
| --- | --- |
| 1 · Salute | Hand to the cap brim, head tilted, "o7" bubble |
| 2 · Wave | Arm up, forearm waving, "Hi!" |
| 3 · Wait! | Palm forward "stop" hand, other hand on hip |
| 4 · I don't know | Shrug: palms up, shoulders up, head tilt, "???" |
| 5 · Crisis! | Hands on head, shaking, spiral eyes, sweat drop, "!!!" |
| 6 · Dead | Staggers and falls flat on the back with blank white eyes and tongue out, "x_x"; gets back up after ~5 s |

While you choose or play an emote, a small preview in the bottom-right corner shows your own engineer.

Emotes, face, head colour and laptop state ride in the normal LAN pose, about 8 updates per second. The host only accepts known emote, face and colour names. Each avatar is about 8 draw calls; avatars more than 90 units away skip animation.

## Tests

`npm test` runs everything below plus the v28–v30 suites (exit 0).

| Test | Coverage |
| --- | --- |
| `tests/logic-firewall.mjs` | Routing table (longest prefix, inactive routes), hit counters and sessions from real traffic, debug flow = GUI diagnostics, CLI ↔ GUI single store, DHCP reservations/exhaustion, DNS modes, HA, SD-WAN, 5 faults with GUI/CLI/LED/alarm agreement, repair, persistence |
| `tests/logic-switch.mjs` | `?`/prefix help, RSTP root/alternate, MAC learning, VLAN DB, PoE priority/budget, startup-config loss on power cycle, 6 faults with GUI/CLI/LED/alarm agreement, repair, persistence |
| `tests/logic-provider-router.mjs` | LEDs, read-only CLI, sheet ARP, DHCP lease MAC, PPPoE 3 attempts → 30 s lockout, 4 faults with WAN impact, alarms, repair, persistence |
| `tests/logic-server.mjs` | Standby BMC, racadm power, POST/boot order/No boot device, installer + console, RAID degraded → rebuild → optimal and double failure, BOSS, overcommit refusal, host firewall, SEL, 6 faults |
| `tests/logic-gpu-server.mjs` | 8×/4× H100 inventory, `nvidia-smi` from the workload, PDU draw and N+1 warning, thermal throttling fault + re-mount repair |
| `tests/logic-storage-array.mjs` | Setup gate, ALUA owner/optimized paths, LUN IDs per host, controller failover, pool rebuild/failure, pool full → read-only, CHAP, snapshots |
| `tests/logic-nas.mjs` | OneFS setup → access zone → NFS export in the company file service, export-rule and data-link faults |
| `tests/logic-san-switch.mjs` | `cfgdisable` yes/no prompt, FLOGI/nsshow from real FC links, switchshow/cfgshow/fabricshow, zoning fault with CLI/GUI/LED/alarm/NOC agreement, cfgenable repair |
| `tests/logic-pdu.mjs` | Per-outlet watts/amps, N+1 warning, overload trip with dark outlets, reset refused while overloaded, persisted breaker state |
| `tests/logic-access-point.mjs` | PoE budget/priorities, management DHCP, CAPWAP/authorization, SSID → VLAN, client DHCP, 2 faults |
| `tests/logic-pc.mjs` | DORA in `ipconfig /all`, APIPA, `nslookup`/`ping`/`tracert`/`net use` from the path evaluator, 2 faults |
| `tests/challenges-logic.mjs` | All 28 device-logic challenges (11 families): distinct diagnosis, repair, automatic completion. `npm test` uses the default seed; also verified with `TEST_SEED=1`, `42`, `777` |
| `tests/e2e-cross-device.mjs` | Internet (CPE → FortiGate → switch → PC), web service (server → VM → web → DNS → PC), SAN (array → SAN-A/B → host → datastore → VM, with controller failover), Wi-Fi (AP → SSID → VLAN → client) |
| `tests/save-migration.mjs` | Real v30 save and a v29-shaped save load as format 31 and keep contract progress, Internet path and device logic; v31 state survives save/load |
| `tests/lan-logic.mjs` | A guest's FortiOS-CLI policy, FortiGate GUI DNS record and switch CLI change reach the host and a second guest live; fault injection host-only; walking reach checked on the host; emote/face/head colour/laptop relayed to other players and sanitised by the host; renaming shown to every player |
| `tests/engineer-ui.mjs` | (extended) `[V]` fiber-clean service action through the real UI handler |
| `tests/browser-smoke.mjs` | **Not in `npm test`** (needs Playwright + Chromium). Face picker (6 faces × 6 colours), emote wheel (scroll → Salute → click plays it), every vendor GUI, inline validation + confirm-before-destroy, CLI sessions, alarm click-through, NOC map, Power page, 2-client LAN, zero page errors, screenshots, draw-call budget (< 500 walking). Run: `node tests/browser-smoke.mjs <screenshot-dir>` |

## Not simulated / simplified (honest list)

- **Spanning tree.** Root and port roles are computed and shown, and a loop with STP disabled causes a storm. When STP blocks a redundant link, traffic is not re-routed hop by hop; the path evaluator still treats the switched network as one L2 domain per VLAN.
- **MCLAG/VLT/vPC.** Port-channels with LACP member suspension are simulated; multi-chassis LAG pairs are not.
- **FortiGate.** HA is active-passive role selection only: no session sync, config sync or failover timers. SD-WAN member health follows link and WAN state; there are no latency/jitter/loss SLA probes. Firmware versions are shown and checked for HA, but firmware upgrades are not simulated. Licences are a status, not a FortiCare workflow. UTM profiles are not simulated.
- **Provider router.** The provider network behind the CPE is abstract. Provider events happen only in challenges.
- **Power.** PDUs are 3-phase 11 040 W units without per-phase balancing. There is no UPS or battery runtime. Watts are linear between idle and max by workload.
- **Optics and cables.** Rx power and CRC values are representative figures, not optical budgets computed from length and loss.
- **Servers.** POST and boot are short scripted phases. There is no BIOS setup UI, no firmware update, no live migration, no HA restart of VMs and no DRS. The virtual console shows the state text, not a real OS screen.
- **Storage.** Pools use 1 TB training drives. Rebuild takes about 10 s of play time. Performance figures come from the attached workload model, not I/O simulation. Replication is not in the block-array module.
- **NAS.** SMB/NFS permissions are evaluated from company users, groups and client subnets. There is no Kerberos/AD, ACL inheritance or snapshot restore.
- **SAN.** Single-switch fabrics per side. No ISL trunking, NPIV or port speed negotiation beyond the media rules.
- **Wi-Fi.** No RF model (channels, interference, roaming). Association succeeds when the AP is online and the SSID maps to a carried VLAN.
- **Reach checks.** Physical actions (breaker reset, cleaning, cabling) check distance only while the engineer is walking in 3D. Panel actions from the laptop are not distance-limited.
- **3D LEDs.** Port lights and the chassis status LED reflect logic state on every rack device. PSU LEDs and small front-panel LEDs are shown in the GUI and CLI and are not individually modelled in 3D.
- **Avatars.** Animation is procedural (no motion capture), so the arms are two-segment rigs and hands are mittens. Emote timing follows each client's frame rate, and animation slows below 20 fps. Remote avatars are smoothed between pose updates, so on a busy LAN they can trail real movement by about 0.2 s.
- **Testing.** The automated suites are behavioural tests with a DOM/renderer stub, plus an optional headless Chromium smoke run. They are not a 12-person playtest.
