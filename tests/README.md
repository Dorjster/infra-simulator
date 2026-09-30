# Cooperative engineer regression coverage

Run from the extracted package or repository with Node.js 22+:

```sh
npm test
```

The UI test executes actual app, service-laptop, product GUI and engineering handlers with real Three.js scene objects and a lightweight DOM/renderer stub. It is a behavioral test, not browser rendering or a twelve-person playtest. LAN tests start an isolated local server, exercise HTTP authorization and persist a temporary campaign.

| Section 22 requirement | Coverage |
| --- | --- |
| 1. Field physical installation | LAN procurement, delivery, rails, carrying, mounting and power; all 24 model installations in UI fixture |
| 2. Field laptop and all devices | Empty slots/manual equip; Inspect terminal; local console or GUI configuration for all 24 models |
| 3. Field logical work | Switch CLI, product management, host initiators, storage mapping, firewall WAN; network-policy regression |
| 4. Operations configuration/monitoring | Same 24-model suite; configuration/monitoring menus accessible |
| 5. Operations physical work | Same purchase/install/power sequence; cable, replacement and removal tests |
| 6. No exclusive skills | Same test sequence runs as each title; title API rejects specialized classes |
| 7. Cosmetic specialties and assignments | They do not participate in action authorization; forged specialty/assignment metadata cannot grant host access |
| 8. Host controls | Guest mode/save menus absent, stale UI handlers denied, direct server mode/checkpoint/recovery/reset requests denied; first guest cannot become host |
| 9. Independent authorization | Room/host credentials enforced; physical power, management link loss, SSH, VLAN, MTU, FC zoning and firewall policy checks preserved |
| 10. Field empty slots | Keys 1/2 remain empty until manual inventory equip; both tools are selectable afterward; joins reset assignment |

## Enterprise office coverage

`tests/office.mjs` verifies 24 scenarios: actual LAN/Internet/intranet dependencies; department SMB/NFS access and client subnets; executive versus administrator permissions; Wi-Fi credentials, guest portal, AP authorization and PoE; trunk isolation; DNS versus direct IP; gateway and listener failure; policy order; read-only/full storage; recovery and persistence; expansion; redacted snapshots; distinct diagnostics; empty campaign; unique guest DHCP addresses; purchased secondary ISP failover; host company settings; migration of older office saves.

`tests/office-campaign.mjs` verifies the first enterprise campaign contract from an empty internal network through purchase, rack/power, serial FortiSwitch setup, ordered ISP circuit with a racked/powered/patched provider router, VLAN/DHCP/NAT, employee browsing and reward/save restoration.

The LAN suite also verifies private departmental file responses, redacted password/file snapshots, actor session isolation and enterprise configuration denial until administrator login. Device firmware password screens remain training workflows, not full vendor identity providers. See OFFICE-UPDATE.md for unimplemented protocol and product fidelity.

A Chromium WebGL/DOM smoke check covers Finance login, intranet browsing, office entry and WASD movement. The automated title and LAN suites do not constitute a twelve-human playtest or a full ten-contract campaign walkthrough.

## v29 end-to-end exercises

| Test | Coverage |
| --- | --- |
| `tests/firewall-path.mjs` | Empty enterprise campaign → ISP handoff, WAN, VLAN/DHCP/DNS, policy/NAT, Sales PC Internet; 14 injected faults each with a distinct failing step and detail; WAN alert, contract detail and paid validation; save/reload |
| `tests/server-service.mjs` | Free Play R660: iDRAC management, installer failure on power loss, ESXi, port-group trunk, VM guest network, web service, DNS; VM/host/listener/host-firewall/guest-gateway/VLAN/DNS/policy faults; iDRAC stays reachable; NOC VM alert; persistence |
| `tests/storage-paths.mjs` | ME5 iSCSI + two switches and ME5 FC + SAN-A/B: initial-setup gate, RAID usable capacity, SKU transport limits, masking/host groups/read-only/resize/delete, healthy → degraded → unavailable → healthy with datastore/VM/service impact, shared-switch detection, zoning, monitoring and contract 5, persistence |

`tests/build-helpers.mjs` drives these through the same engineering, config and office actions the UI and LAN server use. The legacy campaign test now configures real FC storage for projects 4 and 5, and the LAN test has a guest start the OS installer and checks host-side completion and restart persistence.

## v30 tests

| Test | Coverage |
| --- | --- |
| `tests/isp-plans.mjs` | ISP circuits: provider router required (missing / unpowered / unpatched), PPPoE authentication, /29 block addressing, one provider router per circuit, persistence |
| `tests/gui-fortigate.mjs` | FortiGate GUI handlers (DOM stub) against the office network: company admin sign-in, policy toggle, VLAN interface + DHCP + parent trunk, DNS forwarding/records, diagnostics, dashboard checklist |
| `tests/contract-chain.mjs` | Contract 1 from an empty facility: each real action advances the live next step; host tick accepts and pays automatically; contract 2 shown |

`firewall-path` now also covers the circuit/provider-router diagnoses. Browser checks (Chromium, SwiftShader) were run manually for the GUIs, ISP procurement, contract HUD and draw-call counts; they are not part of `npm test`.

## v31 device-logic tests

Every device family module (`dist/device-logic/`) has its own test. Each test covers:
- state transitions;
- distinct plain-language messages;
- agreement between GUI, CLI, LEDs and monitoring;
- repair through real actions;
- persistence through save and load.

| Test | Coverage |
| --- | --- |
| `tests/logic-firewall.mjs` | FortiGate routing table, hit counters/sessions from real traffic, debug flow = GUI diagnostics, one config store for CLI and GUI, DHCP reservations/exhaustion, DNS modes, HA, SD-WAN, 5 faults |
| `tests/logic-switch.mjs` | `?`/prefix help, RSTP, MAC learning, VLAN DB, PoE priority/budget, startup-config loss, 6 faults (storm, LACP, native VLAN, MTU, optic, dirty fiber) |
| `tests/logic-provider-router.mjs` | CPE LEDs, read-only CLI, sheet ARP, DHCP lease MAC, PPPoE lockout, 4 faults with WAN/SD-WAN impact |
| `tests/logic-server.mjs` | Standby BMC, racadm, POST/boot order, RAID rebuild/double failure, BOSS, overcommit, host firewall, SEL, 6 faults |
| `tests/logic-gpu-server.mjs` | H100 inventory, `nvidia-smi`, PDU draw, thermal throttling fault and re-mount repair |
| `tests/logic-storage-array.mjs` | Setup gate, ALUA, LUN IDs, controller failover, pool rebuild/failure, pool full → read-only, CHAP, snapshots |
| `tests/logic-nas.mjs` | OneFS setup, access zone, NFS export rule and data-link faults |
| `tests/logic-san-switch.mjs` | `cfgdisable` yes/no prompt, FLOGI/nsshow, zoning fault and cfgenable repair, fabric separation |
| `tests/logic-pdu.mjs` | Per-outlet load, N+1 warning, overload trip, reset refused while overloaded, persisted breaker |
| `tests/logic-access-point.mjs` | PoE budget/priorities, CAPWAP/authorization, SSID → VLAN, client DHCP, 2 faults |
| `tests/logic-pc.mjs` | `ipconfig /all` DORA/APIPA, `ping`/`tracert`/`nslookup`/`net use` from the path evaluator, 2 faults |
| `tests/challenges-logic.mjs` | 28 device-logic challenges (challenges 16–43, all 11 families) with automatic completion. Also run with `TEST_SEED=1`, `42`, `777` |
| `tests/e2e-cross-device.mjs` | Internet, web service, SAN with controller failover, Wi-Fi: each chain end to end across devices |
| `tests/save-migration.mjs` | Real v30 save (`tests/fixtures/v30-campaign.json`) and a v29-shaped save migrate to format 31 |
| `tests/lan-logic.mjs` | Guest CLI/GUI changes seen live by the host and a second guest; fault injection host-only; walking reach on the host; avatar emote/face/head colour/laptop relayed and sanitised by the host; rename shown to every player |

`tests/engineer-ui.mjs` also checks the `[V]` fiber-clean service action through the real UI handler.

### Browser smoke test (optional, not in `npm test`)

`node tests/browser-smoke.mjs <screenshot-dir>` needs Playwright with Chromium. It prints `SKIP` when Playwright is not installed. It starts a LAN server with two browser clients and checks:
- the face picker (6 faces × 6 head colours) and the emote wheel (scroll opens it on Salute, a click plays it);
- every vendor GUI;
- inline validation and confirm-before-destroy;
- CLI sessions;
- alarm click-through to the device page with the 3D arrow;
- the NOC map and the Power page;
- the guest client;
- zero page errors;
- the draw-call budget (under 500 per frame while walking).

External resource failures such as web fonts behind a proxy are listed separately as `networkWarnings`.
