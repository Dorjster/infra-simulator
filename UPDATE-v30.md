# v30 — Physical ISP, vendor-style GUIs, simple CLI, live contract chain, smoother rendering

v30 builds on the v29 simulation (firewall/server/storage dependencies) and changes what the player sees and touches: the ISP is now a real circuit with a provider router, device GUIs follow the vendor layouts, every device gets a small set of plain-language CLI commands, the contract HUD shows the next real step, and the 3D scene draws about half as many objects per frame.

## Install / run

Same as v29: stop the old server (Ctrl+C), extract into a new folder, copy your previous `lan/campaign-save.json` into the new `lan` folder to keep the campaign, run `node lan/server.mjs` (Node.js 22+, no npm install) and open http://localhost:8080. Solo play works from any static server on `dist/`. `npm test` runs the regression suite.

## 1. ISP as a real circuit

**Procurement → ISP services (Metro Fiber, training provider).** Choose a FortiGate and a plan:

| Plan | Setup | Addressing on the circuit sheet |
| --- | --- | --- |
| Business Fiber · static /30 | $500 | One public IPv4 (203.0.113.x/30), provider gateway, provider DNS 198.51.100.53 |
| Business Fiber · static /29 block | $900 | WAN address + four more public IPs (198.51.100.x/29) for VIPs / port forwarding |
| Business Broadband · DHCP | $300 | Public IPv4 leased by the provider DHCP server |
| Business Broadband · PPPoE | $300 | PPPoE username/password; address assigned after authentication (/32) |

Each order creates a circuit (`CKT-n`) and ships a **provider-owned handoff router** (`ISP fiber handoff router`, LAN1–4 1G, SFP1 10G) to receiving. It cannot be bought from the catalog. The WAN comes up only when all of these are true, in this order:

1. The circuit exists for that FortiGate.
2. The provider router is unboxed, racked and powered.
3. The provider router's LAN1 (or SFP1) is patched to a FortiGate port.
4. The link is up (no unplugged/disabled cable, both ends powered).
5. The FortiGate WAN interface matches the circuit sheet: mode (static / DHCP / PPPoE), address/prefix/gateway for static, username/password for PPPoE.
6. A default route to the provider gateway exists and the interface is enabled.

Each failure has its own message (for example `Provider router … has no power`, `WAN port port3 has no cable · patch it to … LAN1 (1G) or SFP1 (10G)`, `WAN port … is cabled to …, not the provider router`, `PPPoE authentication failed · use the username and password from the circuit sheet`, `WAN address no longer matches the circuit sheet`). The circuit sheet (circuit, firewall, plan, WAN address, gateway/DNS, extra IPs or login, provider router) is listed under Procurement, on the FortiGate WAN page and in `get system isp`.

In the enterprise campaign, assigning the gateway in Office → Infrastructure orders the default Business Fiber /30 circuit automatically (a plan can be chosen there). The provider router still has to be racked, powered and patched. Free Play keeps its pre-installed provider edge; the FortiGate dashboard labels it as such.

## 2. Vendor-style device GUIs

All device web GUIs use one shell with the vendor's structure: a vendor header (model, hostname, management IP, health, setup state), grouped left navigation, a **Status/Dashboard** page with a **setup checklist** that highlights the next step, and pages that save straight into the shared simulation. The skins are look-alikes (colors and layout only, no logos): Fortinet dark/red, Dell blue, HPE green, provider grey.

- **FortiGate** (Dashboard · Network · Policy & Objects · System · Log & Report). When the FortiGate is the office gateway, the GUI edits the office network model the employees use: the page asks for a **company administrator sign-in** (`itadmin`), then:
  - *Interfaces & VLANs* — physical port table plus VLAN interface form (ID, name, gateway/prefix, zone, parent port, DHCP range/DNS). Saving also adds the VLAN to the parent port's trunk.
  - *WAN / ISP* — circuit sheet next to the form; mode, address, gateway, DNS, PPPoE, enable, default route.
  - *DNS* — FortiGate DNS service, forwarding to the ISP resolver, local records.
  - *Static routes*, *Firewall policy* (ordered table with move/enable/delete and implicit deny), *Virtual IPs*.
  - *Diagnostics* — pick a PC and a URL and see every stage (VLAN path, DHCP, DNS, gateway, policy, NAT, WAN) with the first blocked stage named.
  - *Forward traffic / Events* — office log.
- **Servers** (iDRAC / iLO) — dashboard with next steps: management reachable → OS or hypervisor → data NIC / port group VLAN → VM running → service listening → employees reach the service (from live request counters). Existing lifecycle, virtual media, VM, networking and service pages are kept.
- **Storage** (PowerVault / PowerStore / Alletra / NAS) — dashboard with setup → pool → data ports → hosts → mapping → path state (healthy / degraded / unavailable) per volume and host.
- **Provider router** — read-only provider page with circuit, handoff port and link state.

## 3. Simple CLI layer

Every device answers a short set of plain commands in addition to its native CLI. `?` / `help` lists them.

| Device | Commands |
| --- | --- |
| All | `status` — one-screen health: power, management, links, setup state and the next step |
| FortiGate | `get system isp` / `diagnose isp` (circuit sheet + handoff check), `show system interface`, `show firewall policy` (office model when bound), `execute ping HOST`, `execute traceroute HOST` |
| Servers | `racadm getsysinfo` / `show server`, `show vms`, `show services`, `show paths` |
| Storage | `show pools`, `show volumes`, `show hosts`, `show paths` |
| Switches | `show interfaces status` |

## 4. Contracts and challenges: live next step

- The HUD shows `CONTRACT nn`, the contract title, `done/total` and **Next: step — where to do it**. The Projects page shows the whole checklist. Every step is read from live state (orders, racks, power, cables, console setup, GUI settings and real path tests), so it advances by itself in solo and LAN co-op.
- Contract 1 has 12 steps: order FortiGate + switch → rack and power → switch console → assign gateway/switch → ISP circuit → provider router racked/powered/patched → WAN from the circuit sheet → VLAN 10 + DHCP → Sales desk in VLAN 10 → VLAN carried to the FortiGate → LAN→WAN policy with NAT → Sales PC opens https://example.test.
- Contract 4 (server): server racked/booted → iDRAC/iLO → OS/hypervisor → data NIC in VLAN 50 → VM + web service → DNS record → Finance opens the site by name → shares.
- Contract 5 (storage): array → initial setup → pool → data ports A/B + initiator → volume mapped → two independent healthy paths → bound + snapshot.
- Other contracts show their live objective check as one step.
- **Automatic acceptance:** the host checks every 2 s; when the real test passes, the customer pays and the next contract appears. Challenges complete automatically when their check passes (no Validate click needed; the button still works).
- Critical service-health alerts (VM off, listener down, storage unavailable) now appear in the NOC alert list.

## 5. Graphics and smoothness

- Static geometry is merged per parent and material at build time (rack frames, rails, vents, blanking panels, overhead trays, office furniture, KVM carts, laptops). Interactive parts (ports, buttons, device bodies, PSUs, cables) are untouched, and merged rack/wall meshes keep their occluder flag for aiming.
- Measured in Chromium (SwiftShader, same camera): **draw calls per frame 1720 → 909 (inspect view), 1180 → 791 (walking)**.
- Small text plates are hidden beyond legible distance (scaled by plate size, checked every 8 frames).
- Office floor lights are two shared lights moved with the current floor, and the flashlight toggles intensity instead of visibility, so light counts stay constant and shaders do not recompile mid-game (no hitch when changing floors or using the flashlight).
- Invisible cable hit-lines are no longer drawn.
- Panels fade/scale in; buttons have hover/press feedback; `prefers-reduced-motion` disables animations.
- LAN avatars already use frame-rate-independent smoothing; unchanged.

## 6. LAN co-op (12 players)

No protocol change. Every GUI save, CLI command, ISP order, cable and power action goes through the host-authoritative world, so all engineers see the same circuit sheet, checklists and HUD next step. The ISP order and the provider router box are shared inventory; any engineer can carry and rack them.

## Tests

`npm test` runs 16 scripts (61 PASS lines, exit 0). New in v30:

| Test | Coverage |
| --- | --- |
| `tests/isp-plans.mjs` | Provider router required (no router / no power / not patched), PPPoE authentication, /29 block addressing, one router per circuit, persistence |
| `tests/gui-fortigate.mjs` | FortiGate GUI handlers against the office model: company-directory sign-in, policy toggle changes employee Internet, VLAN interface + DHCP + parent trunk, DNS forwarding and records, diagnostics, dashboard checklist |
| `tests/contract-chain.mjs` | Contract 1 from an empty facility: 10 live next-step transitions, automatic acceptance and payment, contract 2 shown |

Updated: `firewall-path` (circuit + provider router diagnoses), `office-campaign` (physical ISP), `engineer-ui` (provider-only items not orderable). `TEST_SEED=1/42/777 node tests/challenges.mjs` pass.

## Not simulated / limits

- No standalone router product; the FortiGate is the router. The provider router is not configurable (provider-managed).
- ISP addressing uses documentation ranges (203.0.113.0/24, 198.51.100.0/24). No BGP, IPv6, real DHCP/PPPoE packets or bandwidth shaping; plan bandwidth is informational.
- When a FortiGate is the office gateway, the GUI edits the office network model; the FortiOS `config …` CLI still edits the device's own configuration model. Both feed the same path tests, but they are two views and are not merged.
- Vendor GUIs are training look-alikes covering the pages listed above, not full product firmware.
- Physical-presence rules (carrying items, holding a power cord) are enforced in the client, as before.
- Performance figures come from a software renderer; real GPUs are much faster, but the relative reduction applies.
- No twelve-human playtest was run; LAN behavior is covered by the automated LAN suite.
