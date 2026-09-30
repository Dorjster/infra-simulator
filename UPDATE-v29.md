# v29 — Firewall, server and storage dependency training

This update deepens the technical simulation behind the existing GUIs and terminals. It adds no new menus, rooms, graphics or 3D models. Procurement → box → rack/rails → power → cabling → switch console, Free Play, Challenges, both campaigns, the office and 12-player LAN co-op keep their existing workflows.

## Install / run

Same as v28: stop the old server (Ctrl+C), extract this package into a new folder, copy your previous `lan/campaign-save.json` into the new `lan` folder if you want to keep the campaign, run `node lan/server.mjs` (Node.js 22+, no npm install) and hard-refresh every browser. Upgrade `dist` and `lan/server.mjs` together. Run the regression suite with `npm test`.

## Behavior changes that affect existing saves

- **DNS is now a real dependency.** A client's DNS server must be an enabled FortiGate VLAN interface address (FortiGate DNS), a running internal DNS service, or a public resolver reachable through policy + NAT + WAN. Public resolvers cannot answer `*.company.test`. Public names through the FortiGate need **DNS forwarding** (Network / WAN, on by default) and a working WAN. Campaign saves that followed the old chapter-1 text (`DNS 10.10.70.1` without a VLAN 70 interface) now fail with *"No DNS service answers at 10.10.70.1"* — set the DHCP DNS to the VLAN gateway (e.g. 10.10.10.1) or create VLAN 70.
- **Network / WAN no longer offers "ISP link up" / "Second ISP up" checkboxes.** Provider link state is changed only by the Network test lab `wan` fault (and secondary-circuit purchase). The handoff patch at the ISP demarc remains a simulated checkbox.
- **Server OS installation takes time.** *Install OS* starts an installer (~8 s). The host must stay powered; switching it off or pulling its last PSU fails the install. The office *System / Host OS* page can no longer mark an OS as installed — it only records patch / clock / reboot state.
- **Storage provisioning requires the array's initial setup** (system identity / administrator step) before pools, volumes, host registration or the storage wizard.
- **Office Storage page:** the *Path A / Path B enabled* checkboxes were removed. Block storage behind a file service is evaluated from real volume access.
- **Legacy rack campaign projects 4 and 5** no longer accept typed `volume` / `mapping` / `zone` settings. Project 4 needs a volume actually visible to a compute host; project 5 needs an FC volume that is healthy over two independent zoned SAN switches. (Projects 6 and 9 still check the typed `backup` / `replication` settings — see *Not implemented*.)

## P0 — Firewall/router: office Internet end to end

State used: installed FortiGate ports and cables, switch VLAN databases and port configs, office VLAN interfaces/DHCP/DNS/policies, FortiGate WAN product config, ISP contract, default route, fault state.

Each dependency is a separate evaluator step with its own message:

| Step | Example failure |
| --- | --- |
| VLAN switching path | `SWITCH-… / port1 does not carry VLAN 10 (trunk 1)` · `FIREWALL-… / port1 is administratively down` · `Cable … ↔ … is unplugged` · `VLAN 50 is not defined on CORE-A` |
| IPv4 / DHCP | `No DHCP offer; client uses 169.254.x.x` |
| DNS resolver | `No DNS service answers at 10.10.70.1` · `Public resolver 1.1.1.1 cannot resolve the internal zone (NXDOMAIN)` · `DNS forwarding to the ISP resolver is disabled` · `DNS forwarder cannot reach the ISP resolver · ISP link state: ISP link down` |
| Default gateway | `Gateway 10.10.10.254 must match the local VLAN interface` |
| Firewall policy / Source NAT | `Firewall implicit deny` · `Private source requires NAT` |
| FortiGate WAN interface | `Default route to ISP gateway is missing` · `WAN interface is administratively down` · `WAN address no longer matches the ISP handoff` |
| ISP handoff cable / ISP link state / WAN addressing / Default route | `ISP link down (no secondary circuit)` |

The failing Layer-2 hop is found by walking the working VLAN path from the client switch and reporting the blocked link or VLAN database closest to the destination, so redundant cabling does not produce misleading messages.

**Exercise (enterprise campaign):** order FortiSwitch 148F + FortiGate 200F → rack/power → switch serial setup → Office → Infrastructure: bind firewall/switch and uplink (ISP handoff is provisioned) → VLAN 10 interface 10.10.10.1/24 → switch VLAN 10 + uplink trunk → DHCP 100–199, gateway and DNS 10.10.10.1 → patch the Sales outlet, access VLAN 10 → Network / WAN: port3, DHCP, handoff connected, default route, DNS forwarding → policy 10 → wan accept + NAT → sign in as sales, browse `https://example.test` → inject faults in Network test lab (or change ports/policies) and read the failing step → repair → Validate contract 1 (paid only after the live test passes).

## P1 — Server: management separate from service

- iDRAC/iLO reachability (standby power, MGMT UPLINK, management VLAN) is independent of the host OS, VMs and services. Management ports are excluded from data paths and cannot be port-group uplinks.
- Installer states: `installing → completed | failed` (power loss or failed boot disk). Hypervisor, port groups, VMs and services wait for completion.
- Port groups (and *Host network*, which now selects the host data NIC) turn the physical uplink into an 802.1Q trunk carrying the port-group VLANs; the switch port must carry the same VLAN or the link/VM uplink is down.
- VM guest IP/prefix/gateway/DNS are validated (gateway inside the guest subnet). From a client in another subnet, the service test checks that the guest IP is in the VLAN interface subnet and its gateway is that interface.
- The office service test now shows separate *Host power* (with an iDRAC/iLO standby note), *Host operating system* (installer state), *Virtual machine and datastore*, *Guest / host network*, *Server switching path*, *Service listener* (stopped vs host firewall) steps.

**Exercise (Free Play):** order a PowerEdge R660 → rack/power → MGMT UPLINK → MGMT-SW (VLAN 70), iDRAC network 10.10.70.x → reach it from Central administration → NIC-1 → CORE-A 25G port, trunk VLAN 50 → Install OS: VMware ESXi (try powering the host off mid-install) → port group *Servers* VLAN 50 on NIC-1 → VM with 10.10.50.31/24, gateway 10.10.50.1 → power on → web service (Nginx 443) on the VM → DNS record `portal.company.test` → Finance PC opens `https://portal.company.test` → stop the VM / power off the host / stop the service / close the host firewall / wrong guest gateway / wrong port-group VLAN / delete VLAN 50 on the core → repair each.

## P1 — Storage: volume access and data paths

New shared model (`dist/storage-access.js`). A volume is visible to a host only when: array powered → volume exists → masking (host or host-group mapping) → host registered → array data ports configured with the volume's transport → host initiator enabled for that transport → registered initiator equals the host's IQN/NQN/WWPN → host powered → at least one data path.

- Path state: **healthy** (two independent paths), **degraded** (one path, or two paths sharing a switch = one failure domain), **unavailable** (none). Each missing side names its cause: unplugged cable, admin-down, VLAN/MTU/subnet mismatch, missing zone member, no enabled zoning, shared switch.
- Pools have raw capacity + protection; usable capacity = raw × protection efficiency (training approximations: RAID 10/1 50%, RAID 6/5/ADAPT/Double drive 80%, Single drive 88%, Triple+ parity 75%). Protection choices follow the family (PowerVault ADAPT/RAID; PowerStore Single/Double drive; Alletra Triple+ parity).
- Volumes: host or host-group mapping, read-write / read-only access, grow-only resize (*Expand volume*), no shrink, no pool move, unmap before delete, no unmap while a host datastore uses it. Host registration rejects initiators the SKU cannot use (WWPN on an iSCSI-only ME5, IQN on an FC-only ME5).
- Host datastores rescan through the same access check; read-only volumes cannot hold VM datastores; a degraded datastore keeps VMs running (flagged), an unavailable one stops them and the service test reports it.
- The storage GUI shows pool usable/allocated, per-volume host access state and reasons; the server *Datastores* page lists devices the host can see; laptop `show storage` lists volume states on arrays and hosts.

**Exercise (Free Play):** PowerVault ME5024 iSCSI + R660 + two PowerSwitch S5248F → management for both → array identity/controllers → pool (RAID 6) → host iSCSI initiator (NIC-1/NIC-2, 172.16.10/11.x, VLAN 3000/3001, MTU 9000) → storage wizard: data ports, volume, host → cable A through switch 1 and B through switch 2 → VLAN 3000/3001 + MTU 9000 on the switch ports → host sees the volume **healthy** → ESXi, datastore, VM, service → unplug path A (**degraded**, service still works) → unplug path B (**unavailable**, VM/service down) → replug (**healthy**). An FC variant uses ME5024 FC through SAN-A/SAN-B with Connectrix zoning.

## P2 — Monitoring, alerts and objectives

- `dist/service-health.js` derives alerts from shared state: VMs that are on but not running (with the services affected), degraded/unavailable volume access (with datastores/VMs affected), pool ≥ 90 % allocated, failed OS installs, dual-PSU devices on one feed. The office adds a WAN alert naming the failing WAN step, and workstation alerts include the failing step. Critical alerts also appear in the NOC alert list used by Challenges and legacy Campaign validation; warnings are shown but do not block.
- The NOC panel has a *Service dependencies* table (severity, device, condition, impact, cause). Office tickets open and close with the same alerts.
- Office contracts show the first missing dependency for the current contract, and *Validate* repeats it. Contract 4 now requires an employee to open a web service by DNS name; contract 5 requires, for block transports, a volume from the bound storage that is **healthy** on a host (two independent paths).

## Not implemented / consciously simplified

- No packet-level TCP, real DHCP exchange, STP/LACP negotiation, dynamic routing, IPsec crypto, SCSI/NVMe protocol, multipath driver, guest OS or real installer. 802.1Q tagging is simplified (a trunk carrying a VLAN matches an access port in that VLAN).
- No standalone router product exists; L3/NAT is modeled on FortiGate. Nexus/OS10 `ip route` remains configuration-only.
- One array has one data-port transport configuration (A/B); a host has one storage initiator transport. Thin provisioning does not overcommit. Snapshot/backup/replication and ObjectScale S3 remain the v28 record-level models; legacy projects 6/9 still check typed `backup` / `replication` settings.
- DNS served by a server DNS service uses the office DNS record table. FortiGate device-GUI policies (when any exist) replace office policies for the path test, as in v28.
- Physical-session checks for device configuration (console/laptop anchor) are enforced in the client; the LAN server enforces host/admin/enterprise permissions and physical power, not the laptop anchor. This is a trusted-LAN game.
- The installer duration uses real time on the host; LAN guests see completion on the next host tick.

## Verification

`npm test` (Node 22) — all suites pass, including three new exercises:

- `tests/firewall-path.mjs`: the P0 exercise from an empty enterprise campaign, 14 distinct diagnoses (policy, NAT, gateway, ISP link, DNS forwarder, default route, WAN admin-down, trunk VLAN, LAN admin-down, unplugged uplink, DHCP, public resolver, missing resolver, forwarding), monitoring/objective detail, repair, save/reload, paid contract.
- `tests/server-service.mjs`: the P1 server exercise; iDRAC reachable while the host is off / VM off; installer failure on power loss; VM/listener/firewall/guest gateway/port-group VLAN/switch VLAN/DNS/policy failures and repairs; NOC VM alert; persistence.
- `tests/storage-paths.mjs`: the P1 storage exercise; RAID usable capacity; SKU transport limits; iSCSI A/B VLAN/MTU; healthy → degraded → unavailable → healthy with VM/service impact; shared switch; masking, host groups, read-only, resize/shrink/delete; FC zoning; monitoring and contract 5; persistence.
- Updated: legacy campaign projects 4/5 configure real FC storage (direct attach, then moved onto SAN-A/B with zoning); the LAN test has a guest start the OS installer and checks host-side completion and persistence after a server restart; unit tests cover the initial-setup gate and installer phases.

Challenge repairs also pass with `TEST_SEED=1` and `42`. A Chromium check (static hosting, solo) loaded the game without script errors, opened the office, signed in as `itadmin`, injected the WAN fault, read the DNS-forwarder/ISP diagnosis and WAN alert, repaired it and opened a server's iDRAC GUI Install OS / Datastores pages. The three exercises were run end to end by the automated scripts through the same actions the UI sends, not by hand with mouse and keyboard in the 3D room. These checks are not a twelve-person LAN performance test.
