# Enterprise office update — v19

Maintenance update v19.1 automatically unlocks host controls on the machine running the LAN server, migrates older office saves, prevents blank workspace pages and gives Monitoring a useful healthy/empty explanation.

This update applies the office expansion from the September 15 specification while preserving the existing section 22 engineer-title behavior. Both titles retain all implemented capabilities; host authority and enterprise account permissions remain separate.

## Start playing

1. Choose Free Play to inspect a working office, or New Campaign for an empty internal network and a provided ISP handoff.
2. Click **Office / company**, then **Walk to office**. WASD walks, Shift runs, C crouches, Q raises inspection height. E uses monitors, the lift and ceiling AP drops.
3. Choose a workstation. Training accounts are `sales`, `finance`, `engineering`, `ceo`, `itadmin` and `guest`; initial password: `OfficeLab19!`. The workstation sign-in suggests its department account.
4. On the Finance PC, browse `https://intranet.company.test`. On Sales, try the same address to see the policy denial. Both can browse `https://example.test` when their network works. Connection details explain the path and failed dependency.
5. Sign in as `itadmin` under Infrastructure management to change VLANs, DHCP, DNS, policies, Wi-Fi, services, shares, storage protection and monitoring. Being an engineer or the host does not grant Finance file access.
6. Campaign's company overview gives the next contract and live technical checks. Use existing rack procurement for rack devices, and Office procurement for PCs, APs, floors and facility equipment. New switches still require their serial console for initial management setup.

## Implemented in this release

| Area | Working behavior |
| --- | --- |
| Office | Up to four purchasable floors; Sales, Finance, Engineering and Executive departments; PCs, ceiling AP drops, lift, IT and test terminals; walking and collision |
| Network | Actual installed switch/firewall/server bindings and rack links; VLAN and port checks; DHCP/static addressing; DNS; routes; ordered firewall policy, NAT, schedules and controlled security filtering |
| Wi-Fi | PoE budget, AP discovery/authorization, management reachability, SSID VLANs, passwords/RADIUS identity, captive portal, isolation and distance/wall/floor signal selection |
| Workstations | Account sign-in, simulated web browsing, adapter settings, shared-file operations, department printers and actionable path diagnostics |
| Server/storage | OS/service state and listener/firewall dependencies; SMB/NFS groups and NFS client subnets; quota/capacity; file snapshots and backup/restore; FC, iSCSI and NVMe/TCP rack path checks |
| Procurement | Six additional rack profiles: FortiSwitch 148F-POE, Aruba CX 6200F, ProLiant DL380 Gen11, Alletra, StoreOnce and PowerScale; 24 rack profiles total; office orders share the budget |
| Operations | Live employee requests, monitoring history and support tickets; controlled network, power, service, identity and security incidents; backup ISP, HA peer and VPN condition checks |
| Campaign | Ten contracts from Internet access through segmentation, Wi-Fi, services, storage, recovery, redundancy, floors, branch VPN and incident recovery; payment requires technical checks |
| Co-op | Shared office state, serialized host mutations, actor-scoped enterprise sessions, private file responses and redacted client snapshots; 12-player limit and host save controls retained |

The first campaign contract is verified from an empty world through purchase, rack installation, power, serial switch setup, ISP assignment, VLAN/DHCP/NAT, employee browsing and payment. The complete ten-chapter campaign has not received a full human playthrough.

## Simulation limits and remaining specification work

This remains a browser training simulator. Device managers follow product-specific concepts and supported command subsets; they are not vendor firmware or pixel-identical factory GUIs. Public websites are simulated responses, not external Internet browsing. Company login is a local training identity system, not AD/LDAP, Kerberos or an external RADIUS service.

The office path evaluator checks infrastructure state; it does not implement packet-level TCP, real DHCP exchanges, full STP/LACP negotiation, radio propagation, dynamic routing protocols or cryptographic IPsec. Since v29 DNS resolution is a dependency check (FortiGate interface DNS, internal DNS service or a public resolver through policy/NAT/WAN; forwarding to the ISP resolver), failed Layer-2 paths name the blocking hop, server services check host power, installer state, VM, guest network and listener separately, and block storage behind a service uses the volume access model. See UPDATE-v29.md. LACP group, band steering, monitoring integration and replication fields retain planning metadata where there is no full protocol engine. WAN modes beyond the installed product's Static/DHCP interface are abstract circuit checks. HA requires a configured live peer and a usable physical path; shared policies represent synchronized configuration.

The illustrated company floors use simplified furniture, characters and IDF representations. APs and desk outlets are installed/patched through office controls; they do not yet share every hand-carried cable animation of rack equipment. Meeting/reception/test areas are represented, not complete interactive rooms. Additional employee desks are limited to four per department per floor. Branch offices are simulated remote endpoints, not another walkable building.

NAS shares and recovery operate on training text files. ObjectScale supports product provisioning and service-path checks, but not a complete S3 API/object browser, distributed cluster or cloud replication. Hypervisor fields model host resources and VM counts, not runnable guest operating systems. SNMP/syslog/email settings do not contact real external systems; security incidents use controlled scenarios, not malware execution.

Enterprise passwords, file contents and recovery contents are excluded from public office snapshots; actions recheck server-side sessions and permissions. Infrastructure topology remains visible to the team. This is a trusted-LAN game, not a hardened production multi-tenant platform. Keep campaign saves private because they contain the authoritative simulated company state.

## Verification

`npm test` runs both title suites for all 24 rack profiles, FC/iSCSI/NVMe-TCP and WAN dependencies, 12-client LAN authority/persistence, 23 office scenarios and the first enterprise campaign contract. Chromium verification covers Finance sign-in, intranet browsing, visible diagnostics, office entry and WASD movement. No twelve-human performance playtest has been performed.
