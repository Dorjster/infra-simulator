# Infra Simulator v35

Build a working enterprise from an empty room: receive equipment, rack it, power it, cable it, configure it on real-looking consoles and GUIs, and prove every service works. Play solo, or with up to 12 engineers on your LAN.

Created by **Darja**.

**What's new: [UPDATE-v35.md](UPDATE-v35.md)** (a real casino: tables that show the live game in 3D, poker, slots, lotto, centre stage). Before that: [UPDATE-v34.md](UPDATE-v34.md) (Payday mode with the casino, wallets, salaries and loans; tidy colour-coded cabling; no more flashing racks; a clearer field laptop; Darja's pistol). Earlier: [UPDATE-v33.md](UPDATE-v33.md). The full game guide for Campaign levels 0–10, the start flow, prompts, graphics, desktop app and tests is [UPDATE-v32.md](UPDATE-v32.md).

## Play

- **Desktop app:** install the DMG (macOS) or `InfraSimulator-Setup.exe` (Windows) from the project's releases. No Node.js is needed. The first screen offers **Solo Campaign** (recommended), **LAN Host Campaign**, **Join LAN**, **Free Build** and **Challenges**.
- **Installing the desktop app.** The installers are not signed with a paid Apple or Microsoft certificate, so the first launch needs one extra step:
  - **macOS:** open the DMG and drag **Infra Simulator** to Applications, then open it. When macOS says it can't verify the app, click **Done**, open **System Settings → Privacy & Security**, scroll down and click **Open Anyway** next to Infra Simulator. On macOS 14 and earlier you can right-click the app and choose **Open** instead. If you still see "is damaged and can't be opened", that download is an older build: get the latest release, or run `xattr -cr "/Applications/Infra Simulator.app"` in Terminal.
  - **Windows:** run `InfraSimulator-Setup.exe`. If SmartScreen says "Windows protected your PC", click **More info → Run anyway**. Setup installs without asking any questions and starts the game. Later, start it from the **Infra Simulator** shortcut in the Start menu or on the desktop.
  - **Slow or frozen-looking game:** if a yellow "Graphics hardware acceleration is off" banner appears, your graphics driver isn't being used. Update the driver (or, on a laptop, give Infra Simulator the high-performance GPU in Windows Settings → System → Display → Graphics). Without a driver the game still runs, at reduced resolution.
- **Web package:** with Node.js 22+, run `node lan/server.mjs` in this folder and open the printed `http://localhost:…` address. Friends on the same network open the printed LAN address and join with the room code.
- **Tests:** `npm test`. Browser and desktop playtests are in [tests/browser](tests/browser/README.md).

## Controls

| Key | Action |
| --- | --- |
| W A S D · Shift · C/Ctrl · Q | Walk · run · crouch (low ports) · raise view (top of rack) |
| Mouse · Z / right mouse | Look · zoom to read ports and labels |
| E | The action shown under the crosshair (`E · …`); `✗` lines say why it is not possible and what to do |
| G · X | Put down what you carry · cancel a held cable or cord end (plug it back) |
| Ctrl/Cmd + C, V, X, A · right-click | Copy, paste, cut and select all in any text field; a multi-line paste into a console asks before running |
| R · F · V | Remove a device or optic · inspect · service action (clean fibre, provider ticket, re-mount) |
| L · 1 / 2 | Service laptop · console cable / service Ethernet (equip them once in J → Laptop) |
| J · I · M · H | Objective · Inventory & orders · Map · next hint |
| Enter / T · middle mouse · Esc | Team chat · ping · menu |
| Mouse wheel | Over the 3D view while walking: emote wheel · over any panel: scrolls the panel |
| E at a casino table (Payday) | Blackjack · roulette · lotto · cashier (wallet & loans) |
| 4 · left click | Darja only: draw / holster the pistol · fire (for fun, nothing is damaged) |

Field Engineer and Operations Engineer are cosmetic titles: both can do every task. Company credentials, physical reach and host-only controls are checked separately.

## Counts in this release

11 campaign levels (0–10) · 43 challenges (15 classic + 28 device-logic) · 24 purchasable rack models plus office items · 12 players per LAN room · save format 32 (v29–v31 saves migrate).

**Graphics settings:** Settings → Graphics (Low / Medium / High), resolution scale, frame-rate limit and Show FPS. If the game stutters, try Low, then send us Settings → Copy performance diagnostics.

---

## Earlier release notes (v19–v31)

The notes below describe earlier releases and are kept for reference. Where they differ from v32 (start flow, menus, the campaign), v32 applies. See [UPDATE-v31.md](UPDATE-v31.md), [UPDATE-v30.md](UPDATE-v30.md), [UPDATE-v29.md](UPDATE-v29.md), [UPDATE-v28.md](UPDATE-v28.md) and [OFFICE-UPDATE.md](OFFICE-UPDATE.md).

This package extends the existing Infrastructure // Alive simulator. It includes the brighter room, Dell/Fortinet-inspired rack models, first-person controls, service laptop and 12-player LAN room.

## Start

The compact top-left objective now tells you exactly what to do next, based on actual orders, delivery status, rails, installations, power and network state. J expands the requirement. At the kiosk, E orders the named item directly. In the room, E picks up rails and equipment and snaps them onto compatible highlighted rack positions. Configuration remains manual.

Field Engineer and Operations Engineer are cosmetic job-focus titles. Both can purchase, carry, install, cable, configure, monitor and troubleshoot every supported device. Tab changes your title without changing capabilities. Titles never override physical/network checks or enterprise policies.

The room has clearer aisle markings, staging labels, additional lighting and a flashlight. Walking is faster, stops more promptly, and has a smaller collision margin for navigating racks. Port status lights use batched rendering to reduce graphics work.

Team chat fades in the bottom-left; names use each engineer's color. Nearby teammate nameplates disappear at a distance. Middle mouse pings a device, port, rack or location for about six seconds.

For single-player or co-op with automatic campaign saving, install Node.js 22 or newer, open this folder in Terminal and run:

```sh
node lan/server.mjs
```

Open the printed localhost address. For multiplayer, each engineer opens the host's LAN address, chooses Multiplayer and enters the printed room code. The host also enters the private host key printed in Terminal; guests leave that field empty. Keep this key private. Only the authenticated host sees game creation, mode and save controls. The first player to join does not automatically become host. The host counts toward the 12-player limit. All players should use this same updated package. Allow the local server through the host firewall if prompted by your operating system.

Free Play and challenges also run on static hosting such as GitHub Pages. Upload the extracted files to the repository root, including index.html, all JavaScript modules and style.css. Keep Settings → Pages on main / root and leave Custom domain blank unless you own a domain. This download does not update an existing GitHub site automatically.

## Modes

- **Free Play:** the original populated, configured facility, with the engineer laptop connected to MGMT-SW. No automatic incidents. Orders and new installations are available.
- **Quick Challenges:** 15 independent scenarios. Select any one; the environment starts healthy. Begin starts the timer and injects a randomized fault or installation assignment. Diagnose through monitoring, interfaces, console and physical inspection. Validate to receive time, score, hints, mistakes, downtime and a root-cause summary. Retry resets the practice facility; it does not modify Campaign.
- **Campaign:** a named facility with rack positions, power infrastructure, receiving and unconfigured offices. No internal network devices are preinstalled. Start with $250,000 and an ISP handoff; complete the company contracts to earn money and reputation. Installed equipment and office configuration persist. Existing legacy campaigns retain their original project progression.

New Campaign creates a fresh campaign. Use Resume for the campaign retained in the current session, or Load for an exported campaign.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Walk |
| Shift | Sprint |
| C, held | Crouch |
| Q | Toggle upper inspection |
| Tab | Instantly switch Field / Ops at the same position |
| L | Open / close laptop (either title) |
| F | Flashlight |
| J | Expand / close objectives |
| I | Equipment |
| G | Put down carried equipment / cancel cable selection |
| R | Remove an optic or powered-off, disconnected device (either title) |
| Enter | Open team chat / send |
| T | Recent team chat; Escape closes |
| Middle mouse | Temporary team ping |
| E | Interact, unbox, or attach selected equipment |
| 0 / 1 / 2 | Hands / assigned console tool / assigned LAN tool; I equips tools into initially empty slots |
| X | Unplug laptop |
| M | Inspect / Gameplay |
| Escape | Close engineering panel or release mouse |
| Mouse / mouse drag | Look |
| Wheel in Inspect | Zoom |

Settings in the menu adjusts movement and look sensitivity. Tab changes your engineer title at the current position. L opens the laptop for either title. Switching titles keeps the current tools and session available.

## Legacy rack project workflow

New enterprise campaigns use the live company contracts described in OFFICE-UPDATE.md. The sequence below documents the retained legacy rack campaign.

1. Open Campaign → Projects. The first requirement is two commissioned switches, two compute servers, management access and redundant compute networking. Payment is $45,000.
2. Walk to the procurement kiosk at the far end of the separate receiving room. Press E. Order two 24-port switches and two 2U servers. Hardware includes rails and two power cords. Also order CAT6 leads, 25G DAC cables and cables as prompted. Every rack and device is installable by one engineer, including in multiplayer. Passive DAC leads must be 7 m or shorter.
3. Deliveries take 5–15 seconds. Approach a box and press E to open it. Choose the device, rails or power cords in any order. Nothing is picked automatically. I also opens Equipment.
4. With either title, select a rail kit, choose an empty rack and U position, set the span to the device's height and install rails while near the rack. The simulator rejects overlap and positions above U42.
5. Pick up the device, approach the rack front, aim at the desired U and press E. Available units are gray and your valid selection turns green; blocked positions are dark. Included rails are installed automatically if you take the device first. G sets equipment on clear floor in front of you; E picks it up again.
6. Select a power cord. At the rear PSU socket, E connects PSU A to PDU A or PSU B to PDU B. Equipment also offers explicit PSU/feed selection. Both PSUs on one feed allow operation but fail redundancy validation. Press the front power button or use Power on/off; boot takes four seconds.
7. Configure the new device. It starts at 0.0.0.0, VLAN 1, SSH disabled. Use a serial console on switches or the small front KVM on newly installed servers/storage/GPU devices. Create VLAN 70, set a unique 10.10.70.x/24 management address and enable SSH.
8. Connect each device's rear MGMT UPLINK to an unused MGMT-SW port using CAT6. Set both connected ports to access VLAN 70. Reconnect the laptop to MGMT-SW and check that the device is reachable.
9. Use one server NIC to each of two different production switches. Select a 25G DAC from Equipment, choose Equip selected data cable, close the panel, aim at a free port and press E for end A, then walk to end B and press E. Compatible ports have forgiving aim assistance and a visible target highlight. Default VLAN 1 data ports work together. Other topologies and port choices are accepted when they meet the same requirement.
10. Open Projects and Validate & submit. The customer pays only when every requirement passes.

## Devices, configuration and troubleshooting

Laptop Terminal supports basic training syntax, including configure terminal, interface portN, shutdown / no shutdown, VLAN creation/naming, access/trunk settings, management addresses and SSH enable/disable. Type help in the terminal. These are shared training commands, not complete Dell OS10 or FortiOS emulators.

The Configuration app adds hostname, gateway, DNS, MTU, SAN zone group, storage volume/host mapping, backup and replication settings. Since v29 the typed volume/mapping/zone values are documentation only: campaign projects 4 and 5 check real volume visibility and zoned FC paths (see UPDATE-v29.md). It requires a valid console, KVM or reachable laptop session for the selected device. Management IP/VLAN controls remain in the existing OS / Performance dashboard.

Fiber needs compatible optics at both ends. Select an optic, approach its port, and use E or Insert selected optic. Speed, medium and reach-family mismatches prevent the link from coming up. A wrong access VLAN, shutdown port, incompatible trunk, MTU mismatch, disconnected cable or failed component changes the shared network state and port lights. SAN endpoint zone groups must agree. Keep the two SAN switches independent.

Monitoring shows symptoms. Equipment shows local hardware alarms and PSU state; select the matching replacement disk, DIMM, PSU, NIC or controller to repair a hardware fault. Replacement optics clear failed-transceiver faults. Workload sliders can reduce simulated storage overload. Procurement has spares and emergency deliveries (10–30 seconds).

Documentation generates rack elevation, inventory, cable/topology, IP, VLAN, power, SAN, storage mapping and history from the current world. It can be exported as JSON. A world-mounted NOC display shows current alerts; E opens detailed monitoring.

Campaign projects progress through compute, redundant power/network, cluster expansion, shared storage, dual SAN, backup, GPU, security and DR. Later projects alternate capacity expansion and production VLAN changes. Existing devices remain installed. Production incidents use the actual installed devices and links; repairs earn a service payment. Checkpoints offer recovery with a 10-point reputation penalty.

## Saves

- **LAN/local server:** campaign changes autosave atomically to `lan/campaign-save.json`. The host reloads this file on restart. Keep this file when upgrading the package. Player login tokens and connections are not stored in it. Carry handles are released on restart.
- **Static hosting:** use Saves → Enable autosave to a file where the browser supports it, or Export campaign save before closing the tab. File access must be reconnected after reloading. There is no silent browser-local-storage campaign.
- **Load:** single-player can import a campaign JSON in Saves. To restore a room from an exported save, stop the host, place it at `lan/campaign-save.json`, then restart. The host file is authoritative in multiplayer.
- **Known good:** save a checkpoint before changes. Project completion also records a checkpoint. Restore costs reputation and is disabled in Quick Challenges.

Campaign save files contain the money, orders, stock, installed equipment, rails, optic/cable/power state, device networking, project/incident history and checkpoint. Browser-only sessions without a save file are temporary.

## Simulation boundaries

This is a playable engineering simulation with simplified physical models, equipment handling and snap-to-port cabling. It does not run real vendor operating systems, hypervisors, storage firmware, DNS or routing protocols. Performance numbers and traffic are synthetic. Storage mapping, zoning, backup and replication are simulated configuration/validation states, not real storage services. The incident library currently covers representative cable, port, VLAN, optic, component, management and workload faults; it is not an exhaustive hardware failure model. LAN play is local only, without internet matchmaking.

Logic checks additionally cover guided objective transitions, one-button rail/device installation, equal title capabilities, walking distance, laptop toggling, and LAN chat/ping delivery. Logic checks cover campaign commissioning, mode isolation, all challenge start conditions, 12-player limits, shared changes, carrying, saves and restart recovery. Browser rendering and an actual twelve-person play session have not been visually verified in this update.

## Physical placement update

The expanded hall has 14 marked expansion rack bays across two rows. Carry a rack to a gray bay; it turns green in range. Aim and press E to place it. Delivery cartons use different sizes and colors for racks, devices, cables and optics, and remain until every device, rail and power cord has been taken out. A wall switch beside the receiving-room doorway toggles server-room lights; the receiving-room light stays on. Aim at connected ports and press E to disconnect; aim at an original free endpoint to reconnect. For a new cable, E selects end A, then end B.

## Simple cabling (v13)

Pick up one cable. Data is orange, management/UTP blue, and power black. For network cabling, aim at a free compatible port and press E for end A, then E at end B. The starting end stays attached. G places the loose end on the floor while the other end remains attached. Pick it up with E to continue. An occupied port is never unplugged while you are carrying a new cable. With empty hands, E on a connected data port disconnects its cable; Carry the loose end to any free compatible port and press E to reconnect it.

For power, take a cord from the original delivery box, approach the rear of the device, aim at the highlighted PSU A or B, and press E. The other end routes automatically to the matching PDU. With empty hands, E on an occupied PSU unplugs the cord and picks it up for reuse. Remaining accessories keep the delivery box available. Finish or press G to put down the carried item before starting another task, or opening the laptop. The receiving-room doorway is taller, and carried items use chassis, rail, rack or coiled cable models.

## Precision and co-op update (v14)

The crosshair selects the nearest surface and cannot target through walls. Aim assistance stays on the device under the crosshair. Floor items have a selection outline and their names appear in the interaction prompt; cable coils lie flat and devices keep their chassis geometry. Power is black, data orange, and management/UTP blue on carried items, installed links and rack guides.

Disconnecting a network port leaves the other end attached and puts the loose end in your hand. The cable follows you. Only reconnecting or placing it down with G frees your hands for another task. Dropped ends retain their anchor through saving and can be picked up by a teammate. Power cords similarly remain attached to their rack PDU when unplugged from a PSU. The larger hall has two rows with ten rack positions per row (six original racks plus fourteen expansion bays). LAN co-op supports twelve players, with unique colors and laptop addresses. Resolution adjusts gradually to frame time; floor seams use one drawing batch.


## Enterprise workstations and commissioning (v15)

Newly mounted devices start without a management IP. Power and boot them, press E on the orange CONSOLE port for switches/firewalls, or the server's monitor for KVM. E automatically selects the appropriate service lead. The blue SERVICE LAN also offers a simulator-only local bootstrap session when the device has no IP. Console, local setup and KVM require power, but no management network. These local sessions can only control the attached device.

The enlarged laptop has an adjacent **Initial setup** checklist and device-specific commands. Select an unreachable device to view its missing steps, then walk near it and choose **Open nearby console / KVM**. Configure a unique IP/prefix, management VLAN 70 and SSH, then cable MGMT UPLINK to a VLAN 70 port on MGMT-SW. Use **Connect MGMT-SW** to return to the docked management connection. The sidebar becomes **Operations** when power, boot, addressing, management path and required SSH are ready; loss of a requirement brings back the checklist.

Procurement adds Cisco Nexus 93180YC-FX3 and 9348GC-FX3, Dell PowerSwitch S5248F-ON, FortiGate 200F and 601F, FortiAnalyzer-VM, FortiSIEM, PowerEdge R760 and XE9680, and PowerStore 3200T. FortiAnalyzer and FortiSIEM run as simulated server appliances, with KVM and their own management panels. A 200G DAC supports the S5248F-ON's 200G ports. Prices are game balance values, not purchase quotes.

- **Switches:** NX-OS/OS10-style interface names; VLAN creation, access/trunk membership, shutdown/no shutdown, management address and SSH. Type help for the supported subset.
- **FortiGate:** FortiOS-style system-interface contexts, interface IPv4, admin state, VLAN subinterfaces, policy ingress/egress, accept/deny, NAT flag, static route records and log target. In OS / Performance, the firewall panel also offers policy editing and a policy lookup test.
- **FortiAnalyzer:** enable its collector, then configure `logging host DEVICE-IP` on a source. Configuration and policy-test events arrive over the simulated management network.
- **FortiSIEM:** enable its collector and forward logs here. Three deny/down events from one source within sixty seconds create an incident; acknowledge it by ID.
- **Compute/GPU/storage:** local KVM or network dashboard provides workload controls and synthetic CPU, memory, GPU, I/O and latency readings. Storage also exposes volume and host mapping.

The device profiles are procedural training representations. They do not contain or emulate complete vendor firmware. Policy tests match an ingress/egress pair against ordered rules; they do not execute packet forwarding or real NAT. Static routes are saved configuration records, not a routing engine. Policy addresses/services are limited to all/ALL. The blue zero-IP bootstrap is a gameplay aid, not a claim about a vendor's physical service-port capabilities. Configuration is stored with the game world; the save command records a training flag, not a separate running/startup configuration subsystem. See MODEL-SOURCES.md for model references and limits.

Verification for this update: real laptop handlers exercised six new models through installation, zero-IP console/local setup, management configuration and remote access; vendor commands, firewall policy lookup, reachable log forwarding, SIEM incidents, KVM controls, saves and console ray selection passed. The local host checks cover twelve clients, shared cabling, Nexus port parity and restart persistence. Rendering was checked structurally, not with browser visual QA.

## v16 — Product configuration and procurement

This update changes configuration and procurement. Room layout, movement, rack placement, physical cabling controls and the 12-player limit retain their existing behavior.

### First-time access

- **Switches, SAN switches and firewalls:** connect either PSU to its rack PDU. These network devices have no front-panel power button in the game and begin their normal boot sequence automatically. Removing their last PSU feed powers them off.
- **PowerSwitch / Nexus / Connectrix:** connect power and wait for boot. Connect the laptop to the orange **CONSOLE** port. Serial access requires no IP, VLAN or management cable path. The side guide supplies OS10, NX-OS or Fabric OS commands. Initial switch setup cannot be done through the blue service LAN. After assigning an IP, connect the management uplink to the matching MGMT-SW access VLAN and dock the laptop for remote access.
- **PowerEdge / XE:** connect PSU power. iDRAC is available on standby even when the host is off; KVM requires the host to be on. Open the local product GUI, set System settings and iDRAC network, then use Lifecycle / Host OS for the simulated boot storage, OS image and initiator setup.
- **PowerStore:** local service discovery opens PowerStore Manager. Set cluster name, deployment mode and protection, then cluster/node A/node B management addresses, DNS and NTP. Validate initial configuration. Storage / Hosts / Volumes handles the data transport and host mapping separately.
- **PowerVault ME5:** create the management identity, set controller A/B addresses, then select storage type, disk-group protection, transport, host and volume. The purchased FC or iSCSI controller SKU determines the supported data protocol.
- **FortiGate:** use the local management GUI for System and Management network, then Network / WAN and the firewall policy controls. HTTPS management does not depend on enabling SSH.
- **ObjectScale:** configure site identity and management services, then the storage-pool/replication-group record, namespace, object user, bucket and HTTPS S3 endpoint. It represents a node in a multi-node deployment, not a complete supported cluster.
- **FortiAnalyzer / FortiSIEM:** product pages represent the initial VM network/identity inputs; the overview identifies the real console/bootstrap and licensing stages. Existing log collection and incident controls remain available.

The local setup connection represents an isolated service session; documented factory addressing is shown in each overview. A new device has no production management address until you apply it. Explicit messages distinguish missing PSU power, powered-off state, booting, management subnet/VLAN mismatch and a missing cable path. Select **Validate initial configuration** to complete GUI commissioning; operations retain editable settings.

### Storage data path exercise

1. On the PowerEdge/XE host, choose FC or iSCSI, two data ports and enable the initiator. iSCSI also needs path IPs, VLANs, MTU and an IQN; FC uses two HBA WWPNs.
2. On the array, choose the purchased transport and matching data ports. Register the host initiator and create/map a volume. Management Ethernet alone does not make a data path.
3. For FC, cable fabric A and B separately. On each Connectrix console use `alicreate`, `zonecreate`, `cfgcreate` and `cfgenable` with that path's host and target WWPNs. The GUI displays target WWPNs.
4. For iSCSI, cable the data Ethernet paths through separate switches. Match host/target subnets and fabric VLANs; ensure every hop carries the VLAN and uses the selected MTU.
5. The array displays actual simulated paths. One lost link or invalid fabric setting produces a degraded path count. Two routes through the same switch do not count as independent fabrics.
6. (v29) Each volume has its own host access state — **healthy** (two independent paths), **degraded** (one path or a shared switch) or **unavailable** — shown under Host access on the array, Datastores on the server and `show storage` in the laptop terminal, with the failing dependency named (masking, registration, initiator, transport, cable, VLAN/MTU, zoning). Pools have protection-dependent usable capacity; volumes support host groups, read-only access, grow-only resize and unmap-before-delete. Provisioning requires the array initial setup first.

### Obtaining a WAN circuit

1. Install and power a FortiGate.
2. In **Procurement → ISP services**, select that firewall and order a handoff. The game assigns a circuit, a documentation-range public IPv4 address, /30 prefix and gateway. The fee and bandwidth are game values.
3. In its product GUI, open **Network / WAN**, choose a free Ethernet data port, select Static using the assigned address or DHCP, enable it and add the default route. The provider handoff is logical; it does not add a physical provider to the room.
4. Configure and cable a separate LAN interface. In firewall policy controls create an enabled LAN → WAN accept policy with source NAT.
5. Run the Internet test. It checks the LAN cable, policy, NAT, WAN interface and default route. This is a simulated probe, not live Internet transit.

Procurement now groups 18 named enterprise profiles, including PowerEdge R660/R760/R760xs, XE8640/XE9680, PowerStore 500T/3200T, PowerVault ME5024 FC/iSCSI, Connectrix DS-6610B and ObjectScale X560. Existing generic orders are retained for campaign/save compatibility but hidden from the new hardware catalog. Model details describe the represented interfaces, setup method, included rails/power cords and simulated price.

### Fidelity and validation

These are vendor-informed training workflows, not pixel-identical firmware GUIs or full vendor operating systems. Firmware screens, licenses, physical drive counts/capacities and adapter options vary. Server/storage geometry and NIC/HBA layouts remain the game's simplified models. Passwords are not stored; the exercise records completion of the password-change step. Real OS installation (v29 runs a timed simulated installer that fails on power loss), S3 service, cluster deployment, routing/NAT packets, DHCP servers, CHAP and a full SAN login database are not run. Switch management addressing, VLAN/port administration and basic FC zoning are implemented; routed data interfaces/SVIs and routing protocols are outside the supported CLI subset.

Validation covered all 18 order/install/local-setup flows through the actual GUI handlers, console boot recovery, management access after configuration, standby iDRAC and cable loss, state restoration, dual FC/iSCSI path checks, WAN policy/NAT checks, and the 12-player LAN protocol. The product backend regression can be run with `node tests/product-config.mjs` from the downloadable package. No browser-rendered visual comparison against vendor firmware was performed.

## Cooperative titles update

Only Field Engineer and Operations Engineer are selectable. Both start with empty hand slots and can equip console/LAN tools with **I → Equip console tool / Equip LAN tool**. After assignment, keys 1 and 2 select them. L opens the laptop for either title. Local service-port interaction also equips the appropriate tool manually. Tab changes a cosmetic title, not your access.

The LAN host uses the private host key, separately from the shared room code. Restart the server with the same updated files on all computers. Guests enter Gameplay in the current session; they cannot create/reset worlds, choose modes or use campaign save/checkpoint/recovery controls. Campaign autosaving is performed by the host server after shared actions. To select a saved LAN campaign, stop the server and set CAMPAIGN_SAVE to the chosen file before starting it (or use lan/campaign-save.json). Do not share that file or host key publicly. This trusted-LAN simulator is not hardened for internet exposure.

Physical constraints, busy-hands task locks, network reachability, SSH state, VLAN/MTU checks, storage mappings and firewall policy validation remain independent of title. In v18, full company accounts and departmental file permissions were roadmap work. v19 adds actor-scoped training accounts, departmental SMB/NFS permissions and private file responses; see OFFICE-UPDATE.md for their limits.

The broader specification is in SPECIFICATION.md; current test coverage and known gaps are in tests/README.md.
