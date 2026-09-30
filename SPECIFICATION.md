> Implementation status: v19 adds the integrated office, networking, identity, file services, procurement and campaign systems described in OFFICE-UPDATE.md. That document maps verified behavior and remaining fidelity limits; the complete specification is not claimed as fully emulated. Section 22 and existing universal engineer capabilities are unchanged by this update.

You are continuing development of my existing “Data Center and Enterprise Office Simulator” game.

First, inspect the entire existing project, understand its architecture, preserve all current working features, and then implement this as a complete next-generation version. Do not remove, simplify away, or replace existing functionality unless it is genuinely broken. Integrate the new features into the existing game.

This is not only a visual demo. It must become a functional, realistic, expandable infrastructure simulation covering enterprise networking, cybersecurity, servers, storage, Wi-Fi, internal services, troubleshooting, procurement, deployment, and cooperative gameplay.

The finished version must be stable and fully playable. Do not leave placeholder buttons, fake configuration screens, disconnected menus, non-functional devices, dead-end objectives, or known minor bugs.

# 1. Main Concept

Expand the current data center simulator into a combined:

- Enterprise office simulator
- Data center infrastructure simulator
- Network engineering simulator
- Cybersecurity simulator
- Server and storage administration simulator
- IT procurement and deployment simulator
- Troubleshooting simulator
- Cooperative LAN multiplayer game

The environment should feel like a real, modern enterprise office connected to a data center or server room.

The gameplay must be easy to understand and smooth, but the configuration logic, device behavior, dependencies, failures, and network traffic must remain technically realistic.

# 2. Expandable Office Building

Create an open-world-style office environment that can expand to three or four floors.

The player must be able to walk naturally through:

- Open-office areas
- Sales department
- Finance department
- Engineering department
- CEO office
- Meeting rooms
- Reception
- IT operations room
- Network testing laboratory
- Server room
- Storage room
- Main distribution frame room
- Intermediate distribution frame rooms on additional floors
- Optional branch-office or remote-floor areas

The first building may start with one usable floor. Additional floors, departments, network closets, users, devices, and infrastructure should become purchasable as the business grows.

The building must feel active rather than like a static menu. Employees should use computers, access services, encounter network problems, submit support tickets, move between rooms, and generate realistic network activity.

# 3. Office Departments and Access Policies

Include at least these departments:

## Sales

Sales users should be able to:

- Access the internet
- Use the sales intranet page
- Access the sales shared folder
- Use approved cloud services
- Print to sales printers
- Join the corporate Wi-Fi
- Use wired LAN connections
- Access only the systems allowed by policy

Sales must not automatically have access to Finance, management, storage administration, server management, or infrastructure-management VLANs.

## Finance

Finance users should be able to:

- Access the internet through security policies
- Access the Finance intranet applications
- Access only the Finance shared folders
- Use Finance printers
- Connect through wired LAN or secured corporate Wi-Fi
- Access approved accounting or ERP services

Finance data must be protected from Sales and other unauthorized departments.

## Engineering

Engineering users should be able to:

- Access engineering shared folders
- Access approved development and testing services
- Reach the network testing laboratory
- Use monitoring tools when authorized
- Use wired and wireless networks
- Access selected server services
- Troubleshoot systems based on assigned permissions

Engineering users must not automatically receive full administrative access. Administrator privileges must depend on enterprise account permissions, never the player’s engineer title.

## CEO and Executive Office

The CEO should be able to access:

- Executive shared folders
- Approved Finance reports
- Sales reports
- Engineering reports
- Internal web applications
- Internet services
- Network printers
- Other business resources allowed by executive policy

The CEO may have broad business-data access, but must not automatically receive infrastructure configuration permissions unless explicitly assigned an IT administrator role.

## IT and Infrastructure Administrators

IT administrators should be able to:

- Manage FortiGate
- Manage FortiSwitch
- Manage FortiAP
- Configure VLANs, routing, DHCP, DNS and NTP
- Configure servers and storage
- Manage shared folders and permissions
- Monitor services and network health
- Manage backups
- Review logs
- Respond to incidents
- Configure internal and external security policies

# 4. Employee Computers

Each worker must have a usable computer.

The computers must support:

- Power state
- Boot process
- Login screen
- User accounts
- Department membership
- Desktop interface
- Web browser
- Wired Ethernet
- Wi-Fi
- DHCP or static IP configuration
- DNS configuration
- Default gateway
- VLAN assignment through the access network
- File shares
- Internal web applications
- Internet browsing
- Ping
- Traceroute
- DNS lookup
- Basic network diagnostics
- Application and authentication failures
- Visible link state
- Connection switching between LAN and Wi-Fi

The in-game browser must be functional. It should be capable of opening:

- Simulated public websites when WAN access works
- Internal intranet sites
- Server-hosted web applications
- Monitoring dashboards
- FortiGate management
- Server management
- Storage management
- Other supported device GUIs

Browser access must depend on actual simulated conditions, including:

- Physical connectivity
- Device power
- Switch-port state
- VLAN assignment
- Trunk configuration
- IP address
- subnet mask
- gateway
- DNS
- routing
- firewall policy
- server availability
- service configuration
- user permissions

Do not make websites load merely because the player clicked them.

# 5. Wired LAN

Each office section must include realistic wired connectivity.

Include:

- Access switches
- Distribution or core switching
- Access ports
- Trunk ports
- VLAN tagging
- Native or untagged VLAN behavior
- Link aggregation
- Spanning Tree
- LLDP
- PoE
- Port security
- 802.1X as an advanced option
- DHCP snooping
- Dynamic ARP Inspection
- Storm control
- MAC address tables
- ARP tables
- Interface counters
- Link speed and duplex
- MTU
- SFP, SFP+, SFP28 and QSFP modules where appropriate
- Copper and fiber cabling
- Patch panels
- Floor uplinks
- Redundant uplinks
- Port-channel or LACP configuration
- Realistic port and transceiver compatibility

Incorrect physical or logical configuration must produce realistic symptoms.

Examples:

- Wrong VLAN causes inability to access departmental services.
- Missing trunk VLAN affects only that VLAN.
- Incorrect gateway blocks remote networks but not the local subnet.
- DNS failure permits direct IP access but prevents name resolution.
- Loop causes broadcast storm or Spanning Tree blocking.
- Bad cable causes errors or link flapping.
- Incorrect speed causes negotiation failure.
- Missing route prevents remote connectivity.
- Firewall policy blocks only matching traffic.

# 6. Enterprise Wi-Fi and FortiAP

Every main office section should have an installed FortiAP.

Important realism rule:

A real FortiAP requires Ethernet and usually PoE. Therefore, simulate the office building as having pre-installed ceiling Ethernet and PoE drops. When a player purchases and installs a FortiAP in a prepared location, the AP automatically connects to the assigned PoE switch port through the hidden ceiling cable.

The player should not have to manually drag a LAN cable across the office for every AP during normal gameplay.

However, the simulation must still track the real logical and physical uplink:

- FortiAP Ethernet uplink
- PoE availability
- Switch port
- Management VLAN
- CAPWAP discovery
- FortiGate authorization
- AP status
- Switch-port status
- Trunked SSID VLANs
- AP profile
- Radio configuration

Optionally allow an advanced construction mode where ceiling drops, patch panels and AP cabling can be manually designed.

All default office sections should begin with an AP position available. In Free Play, APs may already be installed and provisioned depending on the selected starting template.

FortiGate should manage FortiAP devices realistically.

Include:

- Discovered and unauthorized APs
- AP authorization
- AP profiles
- SSIDs
- WPA2/WPA3
- Corporate Wi-Fi
- Guest Wi-Fi
- Department-specific SSIDs
- VLAN assignment per SSID
- Captive portal
- RADIUS or local authentication
- Radio bands
- Channel selection
- Transmit power
- Client isolation
- Band steering
- AP health
- Interference
- Signal strength
- Coverage
- Roaming
- Connected-client list
- Rogue AP detection
- Security events

Wi-Fi coverage must be spatial. Walls, floors, distance, interference and AP placement should affect signal quality.

Changing FortiGate or FortiAP settings must dynamically change wireless access in the office.

Examples:

- Disabling an SSID disconnects its clients.
- Changing the Wi-Fi password requires users to reconnect.
- Missing VLAN on the AP uplink prevents clients from receiving the correct network.
- Missing DHCP causes Wi-Fi clients to self-assign an address or remain disconnected.
- Incorrect firewall policies block internet or internal resources.
- Weak signal reduces performance or causes disconnects.
- Guest Wi-Fi must not access internal services unless the player intentionally creates an unsafe policy.

# 7. FortiGate Simulation

FortiGate must have a detailed product-style GUI inspired by real FortiGate workflow without copying protected branding assets exactly.

Include functional pages for:

- Dashboard
- Interfaces
- VLAN interfaces
- Zones
- Static routing
- Policy routes
- SD-WAN
- DHCP server
- DNS
- Firewall policies
- NAT
- Virtual IPs
- Security profiles
- Web filtering
- Application control
- IPS
- Antivirus
- SSL inspection
- User groups
- Local users
- VPN
- Site-to-site IPsec VPN
- Remote-access VPN
- FortiSwitch Controller
- FortiAP Controller
- Wi-Fi and Switch Controller
- Logs and reports
- Traffic sessions
- System events
- Administrators
- Backup and restore
- Firmware status
- High availability

FortiGate must start with realistic factory defaults or with a campaign-specific base state.

Do not use a generic device setup wizard for FortiGate. It should use a realistic login and FortiGate-style GUI configuration workflow. A first-login password change or product-specific setup prompt is acceptable.

The firewall must enforce real simulated packet-flow logic. Policies must consider:

- Incoming interface or zone
- Outgoing interface or zone
- Source
- Destination
- Service and port
- Schedule
- NAT
- Security profiles
- Policy order
- Implicit deny

# 8. WAN and Internet Service

In Campaign mode, the building starts with only the ISP/WAN service provided.

The internal enterprise network starts from zero.

At the beginning, provide:

- Building
- Empty rooms or basic office layout
- Electrical power
- One ISP handoff
- WAN contract information
- Public or private WAN addressing, depending on the mission
- Basic employee and business requirements
- Starting money
- Procurement access

The player must build everything else.

WAN types may include:

- Static public IP
- DHCP
- PPPoE
- Dual ISP
- MPLS or private WAN
- Internet plus branch VPN
- LTE/5G backup
- Simulated cloud connection

The ISP handoff must clearly show:

- Media type
- Port type
- IP configuration
- Gateway
- DNS information
- Bandwidth
- SLA
- Monthly cost
- Link state

The player should connect the WAN to FortiGate and create the correct internal network, routing, NAT, DNS, DHCP and security policies.

# 9. Servers and Product-Specific Initial Configuration

Servers must behave like real enterprise servers.

Use realistic product families such as:

- Dell PowerEdge rack servers
- HPE ProLiant rack servers
- Virtualization hosts
- General-purpose application servers
- Backup servers

Server installation must include, where applicable:

- Rack installation
- Power supplies
- Network adapters
- Storage controllers
- Drives
- RAID
- Out-of-band management
- BIOS or UEFI
- Boot device
- Operating-system installation
- Hostname
- Management IP
- DNS
- Gateway
- NTP
- User creation
- Service installation
- Updates
- Reboot requirements

Servers should have product-specific initialization flows and GUIs. Do not use one generic configuration screen for every server.

Examples:

- Dell PowerEdge should expose an iDRAC-style management experience.
- HPE ProLiant should expose an iLO-style management experience.
- Virtualization hosts should have a hypervisor-style management interface.
- Windows and Linux servers should have different administration experiences.

# 10. Web Server and Intranet

Allow the player to install and configure a web server on a physical server or virtual machine.

Support at least:

- Windows IIS-style service
- Linux Apache-style service
- Linux Nginx-style service
- Static intranet page
- Department portal
- Monitoring dashboard
- DNS-based website name
- HTTP and HTTPS
- Certificate configuration
- Service ports
- Firewall rules
- Authentication
- Access logs
- Server resource usage
- Service start, stop and restart
- Website files and basic content editing

The web server must be connected to a dedicated server or application VLAN.

The intranet must not automatically be accessible from all departments. Access must be controlled through:

- VLAN segmentation
- Firewall policies
- Server firewall
- User identity
- Group permissions
- DNS
- Routing
- Service availability

Create a scenario where the intranet server VLAN is initially isolated from Sales and Engineering. The player must decide which departments require access and create only the necessary policies.

Include a monitoring function for the web server:

- Reachability
- HTTP/HTTPS health
- CPU
- memory
- storage usage
- response time
- active connections
- service state
- logs
- certificate expiration
- interface status

# 11. File Services, NFS and Shared Folders

The server environment must support real network file services.

Include:

- SMB shared folders
- NFS exports
- Department folders
- User folders
- Group permissions
- Read-only and read/write permissions
- Authentication
- Quotas
- File ownership
- Access logs
- Connection limits
- Storage capacity
- Snapshots
- Backup
- Restore
- Availability and service state

Create at least:

- Finance shared folder
- Sales shared folder
- Engineering shared folder
- Executive shared folder
- General company shared folder

Default access design:

- Finance users can access the Finance folder.
- Sales users cannot access the Finance folder.
- Sales users can access the Sales folder.
- Engineering users can access Engineering resources.
- CEO can access all approved business folders.
- IT administrators can manage services, but access to sensitive data should still depend on assigned permissions.
- Guest users cannot access internal file shares.

Do not implement permissions only as visual checkboxes. File access from employee computers must succeed or fail based on the configured permissions and network path.

Support scenarios such as:

- User has network reachability but lacks file permission.
- User has file permission but firewall blocks the service.
- DNS fails but direct IP access works.
- NFS client is not in the allowed subnet.
- SMB authentication fails.
- Storage is full.
- Share service is stopped.
- Snapshot can restore a deleted file.
- Backup can restore a lost folder.

# 12. Storage Systems

Use realistic storage product categories and models, including:

- Dell PowerStore
- Dell PowerVault ME5
- Dell ObjectScale
- Dell PowerScale where appropriate
- Dell Connectrix SAN switches
- HPE Alletra
- HPE StoreOnce
- NAS appliances
- SAN storage
- Object storage
- Backup storage

Storage configuration must be specific to the selected platform and storage type.

Include:

- Initial setup
- Management network
- Controller status
- Drive status
- Storage pools
- RAID or protection policy
- Volumes
- LUNs
- File systems
- NAS servers
- SMB shares
- NFS exports
- S3 buckets
- iSCSI
- Fibre Channel
- NVMe/TCP where supported
- Host registration
- Initiators
- Mappings
- Multipathing
- Snapshots
- Replication
- Capacity
- Performance
- Alerts
- Hardware failures

When configuring storage, the player must choose a realistic data path:

- NAS
- iSCSI SAN
- Fibre Channel SAN
- NVMe/TCP
- Object/S3

The selected storage type must change the required hardware, switches, adapters, protocols and configuration flow.

Examples:

- Fibre Channel requires HBAs, FC optics/cables, SAN switches, zoning and LUN masking.
- iSCSI requires Ethernet interfaces, IP subnets, VLANs, MTU design, initiators and multipathing.
- NAS requires IP connectivity, file protocols and permissions.
- Object storage requires S3 endpoints, buckets and access credentials.

# 13. Network and Storage Device Behavior

Switches must not have in-world power buttons. Network switches, routers and similar fixed infrastructure devices should boot automatically when installed in a powered rack and connected to power.

Servers and storage systems should have physical power buttons when the real product has them.

Switch configuration must be performed through a service-console connection initially. The switch should not use a generic initial setup wizard.

Switch workflow:

1. Install switch.
2. Connect power.
3. Device automatically boots.
4. Connect console cable.
5. Open service console.
6. Perform initial CLI configuration.
7. Configure management IP, user, hostname, VLANs and SSH.
8. Continue through CLI or supported management interface.

Fix the existing “path lost” console issue. Console access must remain connected when the player is correctly attached to the device.

Device configuration must affect the real simulation state. A command or GUI change must update:

- Interfaces
- VLANs
- routes
- DHCP
- DNS
- policies
- reachability
- services
- clients
- monitoring
- logs
- objective completion

Do not create disconnected visual configuration panels.

# 14. Realistic Product Configuration Interfaces

Servers, storage systems and FortiGate must provide product-specific GUI experiences.

Switches must primarily use a CLI service console for initial configuration.

Include:

- Realistic navigation
- Product-appropriate terminology
- Validation
- Required fields
- Dependency checks
- Commit or apply behavior
- Progress indicators
- Reboot warnings
- Error messages
- Event logs
- Health states
- Online documentation or contextual help
- Confirmation for destructive operations

Every supported device must have:

- A working initial state
- A working configuration path
- A usable management interface
- A persistent configuration
- A factory-reset state
- Saved startup configuration where appropriate
- Correct link and service dependencies

Avoid making every vendor product use the same cloned interface.

# 15. Procurement

Expand procurement to use realistic equipment families and compatibility requirements.

Include:

## Compute

- Dell PowerEdge servers
- HPE ProLiant servers
- CPU choices
- Memory DIMMs
- NICs
- HBAs
- RAID controllers
- disks
- PSUs
- rails
- licenses
- support contracts

## Storage

- Dell PowerStore
- Dell PowerVault
- Dell PowerScale
- Dell ObjectScale
- HPE Alletra
- backup appliances
- drive packs
- expansion enclosures
- data-protection licenses

## Network

- Dell PowerSwitch
- Aruba CX
- FortiSwitch
- FortiGate
- FortiAP
- Dell Connectrix
- Ethernet switches
- SAN switches
- optics
- DAC cables
- AOC cables
- copper cables
- fiber cables
- patch panels

## Infrastructure

- Racks
- PDUs
- UPS systems
- cooling
- cable managers
- console adapters
- laptops
- floor network cabinets
- access points
- licenses
- support services

Procurement must validate realistic compatibility, including:

- Port type
- link speed
- transceiver type
- fiber type
- cable length
- server slot
- NIC/HBA compatibility
- drive type
- drive count
- storage expansion support
- power capacity
- PoE budget
- rack space
- cooling
- license requirements

Products should have realistic prices, delivery times, warranty levels, licensing and operational costs without requiring exact live vendor pricing.

Purchased equipment must enter inventory before installation.

# 16. Network Testing Room

Create a separate network test laboratory.

The player should be able to:

- Build temporary topologies
- Test switches
- Test FortiGate policies
- Test FortiAP coverage
- Connect servers
- Test VLANs
- Test routing
- Test VPNs
- Test DNS
- Test DHCP
- Test storage connectivity
- Generate traffic
- Simulate failures
- Capture packets
- Compare working and broken configurations

Include tools such as:

- Ping
- traceroute
- nslookup or dig
- ipconfig or ifconfig
- route table
- ARP table
- port scanner for authorized lab use
- packet capture
- cable tester
- throughput test
- latency test
- DNS test
- HTTP test
- NFS/SMB access test
- iSCSI discovery test
- FC zoning validation
- Wi-Fi analyzer

# 17. Monitoring and Operations

Add centralized infrastructure monitoring.

Monitor:

- Servers
- storage
- switches
- FortiGate
- FortiAP
- WAN
- services
- VLANs
- interfaces
- UPS
- temperature
- capacity
- CPU
- memory
- latency
- packet loss
- throughput
- backups
- certificates
- security alerts

Include:

- Network map
- Device status
- Active alerts
- Historical graphs
- Event timeline
- Syslog
- SNMP
- email alerts
- thresholds
- incident tickets
- acknowledgement
- escalation
- maintenance windows

Alerts must be generated from actual simulated failures, not randomly displayed without an underlying cause.

# 18. Cybersecurity

Include realistic enterprise security capabilities and scenarios:

- Network segmentation
- Least-privilege access
- Guest isolation
- Firewall policy
- NAT
- IPS
- antivirus
- web filtering
- application control
- VPN
- administrator roles
- password policies
- MFA concepts
- 802.1X
- rogue AP detection
- endpoint isolation
- logging
- vulnerability alerts
- patching
- backup and recovery
- ransomware scenarios
- phishing-related incidents
- unauthorized device connection
- brute-force attempts
- suspicious traffic
- data exfiltration alerts
- denial-of-service conditions

Security events must be understandable and solvable through correct infrastructure configuration.

Do not make cybersecurity into unrealistic “hacking minigames.” Keep it focused on defensive enterprise operations, configuration and incident response.

# 19. Campaign Mode

Campaign mode must start from zero.

Initial conditions:

- The company has a building.
- WAN/ISP service is already delivered to the building.
- No internal enterprise network is configured.
- The player has limited starting money.
- Essential rooms exist, but infrastructure must be purchased and deployed.
- Employee and business requirements are provided.
- Objectives guide the player through building a complete enterprise environment.

Suggested campaign progression:

## Chapter 1: Internet Access

- Purchase FortiGate and access switch.
- Connect the ISP.
- Configure WAN.
- Configure LAN.
- Configure DHCP and DNS.
- Create NAT and firewall policy.
- Give the first users internet access.

## Chapter 2: Department Segmentation

- Create Sales, Finance, Engineering and Management VLANs.
- Assign switch ports.
- Configure DHCP scopes.
- Create routing and firewall rules.
- Verify department isolation.

## Chapter 3: Corporate Wi-Fi

- Purchase FortiAP devices.
- Install them at ceiling locations.
- Authorize them through FortiGate.
- Create corporate and guest SSIDs.
- Assign VLANs.
- Test coverage and roaming.
- Isolate guest users.

## Chapter 4: Internal Services

- Purchase a server.
- Configure server management.
- Install an operating system.
- Deploy DNS, web and file services.
- Publish the intranet.
- Create departmental shared folders.
- Apply correct access permissions.

## Chapter 5: Storage

- Purchase NAS, SAN or enterprise storage.
- Select a protocol.
- Configure host connectivity.
- Create storage resources.
- Connect servers.
- Configure multipathing where required.
- Protect data with snapshots.

## Chapter 6: Monitoring and Backup

- Deploy monitoring.
- Configure SNMP and syslog.
- Configure backup.
- Test a file restore.
- Respond to device and service alerts.

## Chapter 7: High Availability

- Add redundant switching.
- Add a second FortiGate.
- Configure HA.
- Add redundant server and storage paths.
- Add a second ISP.
- Test controlled failover.

## Chapter 8: Building Expansion

- Open new floors.
- Add IDF rooms and access switches.
- Add APs.
- Extend VLANs and routing.
- Maintain performance and security.
- Control the budget.

## Chapter 9: Branch Connectivity

- Add a branch office or remote site.
- Configure site-to-site VPN or private WAN.
- Replicate services.
- Enforce branch security policies.

## Chapter 10: Enterprise Incident

- Diagnose a multi-layer outage or security event.
- Use logs and monitoring.
- Restore services.
- Recover data.
- Submit an incident report.

Every completed objective should award money, experience, reputation, equipment unlocks or access to the next contract.

Objectives must be state-based. They should complete only when the required technical configuration genuinely works.

Do not complete an objective only because the player opened a menu or clicked a button.

Campaign progress must persist for the host.

# 20. Free Play Mode

Preserve and improve the existing Free Play mode.

Free Play should allow:

- Unlimited or configurable budget
- Full device catalog
- Custom building size
- One to four floors
- Department selection
- Optional preconfigured infrastructure
- Optional failures
- Adjustable realism
- Custom WAN
- Custom IP scheme
- Sandbox networking
- Server and storage deployment
- Network laboratory
- Cooperative play

Allow the host to select:

- Starting money
- available products
- floor count
- office size
- failure frequency
- employee count
- company type
- security difficulty
- configuration difficulty
- whether cabling is simplified or advanced
- whether equipment is preinstalled
- whether the environment begins configured or empty

# 21. LAN Cooperative Play

The host must create or load a game and then choose which mode the session will use:

- Campaign
- Free Play

Joining players should enter the host’s selected session. They must not receive a separate campaign selection, save selection or world-creation interface.

Only the host controls:

- Game creation
- Save selection
- Campaign selection
- Free Play configuration
- World settings
- Session start
- Save operations

All co-op engineers have the same gameplay capabilities, subject to independent enterprise authorization, inventory and physical constraints. Titles and task assignments do not restrict:

- Inventory
- Procurement when authorized
- Available tools
- Device interfaces permitted by enterprise credentials
- Team chat
- Objectives
- Task list

Campaign progress and saving belong to the host. Joining co-op players do not create separate saves.

Synchronize:

- Player movement
- inventory
- procurement
- installed devices
- cables
- rack equipment
- device power state
- configuration
- network state
- alerts
- objectives
- money
- incidents
- chat
- task assignments

Prevent duplication, desynchronization and conflicting device configuration.

If two players attempt to configure the same device, use a lock, session ownership or conflict-resolution system.

# 22. Cooperative Engineer Roles and Titles

The only selectable engineer titles are **Field Engineer** and **Operations Engineer**. They describe a suggested job focus, never a class, skill tree or permission boundary. Both titles are general-purpose infrastructure engineers.

## Universal Engineer Capabilities

Every engineer, regardless of title, can perform every infrastructure task supported by the simulation:

- Purchase equipment, use inventory, carry equipment, install rails, rack and remove devices, connect/disconnect power, and install/replace hardware.
- Connect copper, fiber, DAC, console, storage and power cables; label and trace cables.
- Use the service laptop, serial console and SSH.
- Configure switches, routers, FortiGate, FortiSwitch and FortiAP.
- Configure VLANs, routing, DHCP, DNS, NTP, firewall policies, VPNs and security profiles.
- Configure servers, install operating systems and configure virtualization.
- Configure storage, SAN zoning, NAS, SMB, NFS, iSCSI, Fibre Channel and NVMe/TCP.
- Deploy web servers and intranet services, configure monitoring, manage backups and restore data.
- Troubleshoot physical and logical faults, review logs and alerts, respond to security incidents and complete any campaign objective.

This capability rule also applies when roadmap features become available; it does not claim every listed service is already implemented.

Network, security, server, storage and infrastructure specialties may appear only as character backgrounds, cosmetic titles, experience, achievements, recommended responsibilities, campaign dialogue or optional assignments. They must never hide or lock actions, menus, tools, devices or configuration. A Security specialist can rack servers and configure storage; a Network specialist can administer servers, backups and shared folders.

## Field Engineer

Suggested focus: deliveries, racks, rails, mounting, power and network cabling, hardware replacement, inspection, labeling and initial onsite configuration. Field Engineers can also perform all logical, network, security, server and storage work.

On joining, hand slots 1 and 2 are empty. Console and LAN tools remain available in inventory and can be equipped manually. Empty hands are presentation only, not a skill restriction, and do not prevent using the laptop or a local device service connection.

## Operations Engineer

Suggested focus: configuration, monitoring, incident response, services, troubleshooting, server/storage administration, security operations, backup and recovery. Operations Engineers can also carry equipment, install rails, rack devices, connect cables and replace components.

## Authorization Model

Engineer titles must never be an input to enterprise authorization. Access restrictions may depend on user accounts, administrator credentials, assigned device permissions, host approval, campaign objective state, purchased licenses, available tools, physical room access and device login credentials.

For example, obtaining a FortiGate administrator password may be required; selecting Field instead of Operations must not deny access. Neither title bypasses departmental data permissions or company authentication. Enterprise IT administrator account roles are distinct from selectable engineer titles.

## Cooperative Task Assignment

The host may assign network configuration, security configuration, server deployment, storage deployment, physical installation, monitoring or troubleshooting responsibilities. Assignments coordinate teamwork only; another engineer can always help or complete the task when the enterprise environment permits it.

## Required Related Changes

- Remove title-based skill restrictions and separate Network, Security, Server, Storage and Infrastructure classes.
- Keep only Field Engineer and Operations Engineer selectable, with identical physical and logical capabilities.
- Never hide configuration or block equipment handling because of title.
- Preserve host-only game creation, mode selection, save selection and campaign save controls. Joining players enter the host's session without these screens.
- Preserve independent enterprise authentication and departmental access policies.
- Keep physical and task constraints (power, compatible ports, available inventory, occupied rack units and finishing/grounding a carried item) identical for both titles.

## Regression Tests

1. Field Engineer can complete physical installation.
2. Field Engineer can use a laptop and configure every supported device.
3. Field Engineer can perform network, security, server and storage tasks.
4. Operations Engineer can configure and monitor every supported device.
5. Operations Engineer can carry, rack, cable and replace equipment.
6. Neither title has exclusive skills.
7. Specialties and task assignments do not lock gameplay actions.
8. Host-only game and save controls remain protected.
9. Enterprise authentication and data-access policies remain enforced independently of engineer title.
10. Field Engineer's empty hand slots 1 and 2 do not prevent manually equipping tools from inventory.

# 23. Physical Interaction and User Experience

Keep physical actions simple, smooth and satisfying.

Examples:

- Rails should snap into compatible rack positions.
- Servers should align and slide into rails.
- Network devices should snap into rack units.
- Cables should highlight compatible ports.
- Cable routing should be visually clean.
- Incorrect cable types should be rejected with a clear explanation.
- Devices should be easy to pick up and place.
- Players should not struggle with tiny interaction points.
- Installation animations should be smooth.
- Text must never overlap panels, borders or other UI elements.
- Long text must wrap or scroll correctly.
- Tooltips must remain inside the screen.
- The laptop and device screens should be large enough to read comfortably.
- Allow UI scaling and screen zoom.
- Menus must be simple and clearly grouped.

Display non-blocking warnings in a consistent notification area, preferably the upper-right corner.

Do not fill the center of the screen with excessive instructional text.

# 24. In-Game Laptop and Service Console

Improve the in-game laptop:

- Larger readable screen
- Full-screen option
- Browser
- terminal
- SSH client
- serial console
- network settings
- Wi-Fi selector
- file-share client
- monitoring portal
- documentation
- ticket system

The service console should work only when the correct console cable and device are selected.

Fix:

- “Path lost” errors
- console detachment
- invisible device selection
- broken focus
- lost keyboard input
- wrong device terminal
- overlapping terminal text
- unresponsive terminal
- console sessions that reset without reason

# 25. Dynamic Simulation Engine

Use one authoritative simulation state for:

- Physical topology
- Link state
- VLANs
- IP networks
- routing
- DNS
- DHCP
- NAT
- firewall policies
- Wi-Fi
- authentication
- services
- storage mappings
- permissions
- monitoring
- objectives

All user interfaces must read and update this shared state.

Create a packet-path or connectivity evaluator that can explain why a connection succeeds or fails.

For each test, evaluate:

1. Source device state
2. Source interface state
3. Wired or wireless association
4. IP configuration
5. VLAN membership
6. Switching path
7. Gateway
8. Routing
9. Firewall policy
10. NAT if required
11. DNS if a hostname is used
12. Destination interface
13. Destination service state
14. Service port
15. User authentication
16. File or application permission

The troubleshooting view should give evidence without instantly revealing the complete answer. Beginner mode may provide more hints; expert mode should require reading logs and configuration.

# 26. Realistic Failures

Include controlled, diagnosable failures such as:

- Cable disconnected
- Wrong cable
- Bad transceiver
- Unsupported speed
- Duplex mismatch
- Switch port disabled
- Wrong access VLAN
- Missing trunk VLAN
- Spanning Tree block
- DHCP unavailable
- Wrong DHCP scope
- Duplicate IP
- Wrong subnet mask
- Missing default gateway
- DNS timeout
- Missing DNS record
- NTP mismatch
- Firewall implicit deny
- Incorrect NAT
- Expired certificate
- Server service stopped
- Full disk
- Storage path failure
- Failed drive
- Failed controller
- Incorrect SAN zoning
- Missing host mapping
- NFS client not allowed
- SMB permission denied
- AP unauthorized
- AP without PoE
- SSID mapped to the wrong VLAN
- Wi-Fi interference
- ISP outage
- UPS overload
- Cooling problem
- Backup failure

Failures must have a root cause and corresponding evidence in logs, interfaces, counters, monitoring or configuration.

# 27. Persistence

Persist:

- Building layout
- floor expansion
- racks
- installed equipment
- cabling
- configurations
- employee computers
- VLANs
- firewall policies
- services
- storage
- permissions
- procurement
- money
- objectives
- alerts
- campaign progress

Restoring a game must recreate the complete network state without broken references.

Use versioned save data and provide safe migration from existing saves where possible.

# 28. Quality and Regression Requirements

Before considering the work complete:

- Audit the existing project.
- Identify all current systems and dependencies.
- Preserve existing working functionality.
- Repair existing broken interactions.
- Implement the new office and infrastructure systems.
- Connect every GUI and configuration screen to the simulation.
- Verify Campaign mode from a completely empty internal network.
- Verify Free Play.
- Verify LAN co-op joining, equal engineer capabilities and independent host/enterprise authorization.
- Verify host-only saving and game selection.
- Verify worker PCs through wired LAN.
- Verify worker PCs through Wi-Fi.
- Verify internet browsing.
- Verify internal website access.
- Verify denied cross-department access.
- Verify SMB and NFS access rules.
- Verify CEO business-resource access.
- Verify guest isolation.
- Verify server monitoring.
- Verify FortiGate policy order and implicit deny.
- Verify AP authorization and VLAN mapping.
- Verify switch service-console configuration.
- Verify storage protocol dependencies.
- Verify persistence after save and reload.
- Verify no UI text overlaps.
- Verify there are no dead buttons or placeholder panels.
- Verify no major or minor known gameplay blockers remain.

Add automated tests for core simulation logic where the current technology supports them.

Test at least these end-to-end scenarios:

1. Sales PC receives DHCP through LAN and reaches the internet.
2. Sales PC joins corporate Wi-Fi and reaches approved services.
3. Guest Wi-Fi reaches the internet but cannot reach internal networks.
4. Finance PC accesses the Finance share.
5. Sales PC is denied access to the Finance share.
6. CEO accesses approved business folders.
7. Engineering accesses the Engineering share but not restricted Finance data.
8. Internal website works only for permitted VLANs.
9. Removing a firewall policy breaks only the affected traffic.
10. Restoring the policy restores connectivity.
11. A missing trunk VLAN breaks the related SSID or department.
12. A stopped web service produces a monitoring alert.
13. NFS access is limited to authorized clients.
14. Storage multipathing survives one path failure.
15. Campaign objectives recognize real working configuration.
16. A co-op player cannot access host-only save controls.
17. Field Engineer joins with empty hand slots 1 and 2 and can manually equip console and LAN tools from inventory.
18. Switch console remains usable during initial configuration.
19. Save and reload preserve the complete topology and configuration.
20. Adding a new office floor correctly extends the network.

# 29. Development Approach

Work in deliberate phases, but continue until the implementation is complete:

1. Inspect and understand the existing project.
2. Run the current project and document existing behavior internally.
3. Identify reusable systems and existing defects.
4. Design the unified simulation state and dependency model.
5. Repair foundational issues before building on them.
6. Implement the office environment and departments.
7. Implement employee PCs, LAN, Wi-Fi and browser behavior.
8. Implement FortiGate, FortiSwitch and FortiAP management.
9. Implement servers, web services and intranet.
10. Implement SMB, NFS and access permissions.
11. Implement realistic storage systems and protocols.
12. Expand procurement.
13. Implement Campaign progression and economy.
14. Implement LAN co-op host authority and universal engineer capabilities; keep enterprise account/data policies independent of engineer title.
15. Add monitoring, security events and troubleshooting.
16. Add expandable floors and dynamic business growth.
17. Complete regression testing and polish.

Do not stop after producing only a plan, mockup or partial prototype. Implement the functionality in the existing project.

If the project architecture makes a requested feature impossible in its exact form, implement the closest technically correct solution and clearly document the specific limitation. Do not silently omit features.

# 30. Final Product Goal

The final game should allow players to experience the complete lifecycle of building and operating a realistic enterprise office and data center:

- Receive an ISP WAN handoff
- Plan the network
- Purchase equipment
- Install racks and devices
- Connect cabling
- Configure switching
- Configure FortiGate
- Deploy FortiAP Wi-Fi
- Segment departments
- Configure employee computers
- Deploy servers
- Publish an intranet
- Configure SMB and NFS shares
- Apply access permissions
- Deploy SAN, NAS or object storage
- Monitor infrastructure
- Troubleshoot outages
- Respond to security incidents
- Add redundancy
- Expand to multiple floors
- Connect branch offices
- Cooperate with other players
- Complete campaign objectives
- Grow the company through successful projects

The gameplay should be approachable and smooth, while the underlying infrastructure behavior should closely follow real-world enterprise networking, security, server and storage principles.

This must feel like a true next version of the existing game—not a separate small demo.\\
