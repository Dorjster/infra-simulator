# Enterprise profile references

These references inform the training model names, representative interfaces and workflows. This project is independent of the vendors. Procurement pricing, telemetry, workloads and geometry are simulated. Port layouts are simplified; connector cages, shared-media exclusions, breakout, licensing and full CLI behavior are not implemented.

- [Cisco Nexus 9300-FX3 series data sheet](https://www.cisco.com/c/en/us/products/collateral/switches/nexus-9000-series-switches/datasheet-c78-744052.html): Nexus 93180YC-FX3 and 9348GC-FX3 front-panel interface groups.
- [Dell S5200-ON installation guide](https://www.dell.com/support/manuals/en-us/networking-s5212f-on/s5200-on_install_pub/introduction?guid=guid-a0e1656a-ceb0-4be8-a67c-bcc9e08125cd&lang=en-us): S5248F-ON interface groups, including 200GbE.
- [FortiAnalyzer](https://www.fortinet.com/products/management/fortianalyzer): centralized log analysis, represented here by management-network event collection.
- [FortiSIEM external systems guide](https://docs.fortinet.com/document/fortisiem/7.6.0/external-systems-configuration-guide/363785/fortinet-fortianalyzer): event integration; this game's three-events/60-second rule is an original training exercise, not a vendor default.

The FortiGate 200F/601F profiles use simplified Ethernet groups; copper versus SFP subtypes and factory port naming are not fully reproduced. Server and storage models retain the game's common NIC/HBA layout. FortiAnalyzer-VM and FortiSIEM are represented on rack servers and are not fictional physical Fortinet appliance SKUs. All CLI implementations are a supported subset described by the in-game help.

## Product setup references used for v16

Reviewed September 2026. The game uses the following documented workflows; overview panels link to vendor references. Read the guide for the precise firmware/model before configuring physical equipment.

- [Dell iDRAC9 and Lifecycle Controller network setup](https://www.dell.com/support/kbdoc/en-us/000177212/dell-poweredge-how-to-configure-the-idrac9-and-the-lifecycle-controller-network-ip): F2, iDRAC Settings, dedicated NIC and DHCP/static addressing; iDRAC management is distinct from host OS networking.
- [PowerStore initial configuration wizard](https://infohub.delltechnologies.com/en-nz/l/dell-powerstore-manager-overview-1/initial-configuration-wizard-6/): initial login, cluster identity, deployment/protection choices, management addresses and infrastructure services.
- [PowerStore service-port discovery](https://infohub.delltechnologies.com/en-nz/l/dell-powerstore-manager-overview-1/discovery-with-service-port-3/): workstation 128.221.1.249/24 and node B 128.221.1.251 on PowerStoreOS 3.0 and later. Older releases used node A; IPv6 options exist on newer firmware and are not emulated here.
- [PowerVault ME5 controller networks](https://www.dell.com/support/manuals/en-us/powervault-me5012/me5_series_ag/configuring-controller-network-ports?guid=guid-3afb2c97-ab2d-4fde-8ad2-bbca6a614f04&lang=en-us): controller A/B factory addressing and management network changes.
- [ME5 disk groups, pools and RAID](https://infohub.delltechnologies.com/l/dell-powervault-me5-series-microsoft-hyper-v-best-practices/disk-groups-pools-and-raid-configuration/): virtual/linear disk groups and ADAPT; physical drive-count requirements are outside this simulator.
- [Dell ME5 Fibre Channel host attachment](https://www.dell.com/support/contents/en-us/videos/videoplayer/how-to-attach-a-windows-host-to-a-fibre-channel-powervault-me5-system/6323002832112): host initiator registration, zoning and volume mapping.
- [ObjectScale planning](https://infohub.delltechnologies.com/en-us/l/dell-objectscale-best-practices/planning-documentation-and-tools-3/): site planning and multi-node network requirements. X560 in this catalog represents a node, not an entire valid cluster.
- [Dell OS10 basic switch management](https://www.dell.com/support/kbdoc/en-hk/000201924/dell-emc-networking-os10-basic-switch-management-configuration): dedicated mgmt 1/1/1, static addressing and management route.
- [Cisco Nexus 9000 management VRF](https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/103x/unicast-routing-configuration/cisco-nexus-9000-series-nx-os-unicast-routing-configuration-guide-release-103x/m_configuring_layer_3_virtualization.html): mgmt0 is in the management VRF; this is separate from production data interfaces.
- [Connectrix DS-6610B documentation](https://www.dell.com/support/product-details/en-us/product/connectrix-ds-6610b/docs): consult the applicable Fabric OS manual for complete serial setup, zoning and licensing; only the displayed command subset is emulated.
- [FortiGate 200F quick-start guide](https://docs.fortinet.com/document/fortigate/hardware/fortigate-200f-series-quickstart-guide): initial MGMT/HTTPS access. The game identifies the represented family; factory port assignment differs across models and releases.
- [FortiOS static routing](https://docs.fortinet.com/document/fortigate/8.0.0/administration-guide/804259/static-routing): default route and next-hop concepts. Procurement ISP contracts, assigned documentation-range addresses and connectivity probes are original training mechanics.

The new managers follow product setup concepts without copying vendor screenshots or claiming firmware equivalence. Factory credentials are explanatory only; local discovery, password changes, licensing and installation are simplified. Existing FortiAnalyzer/FortiSIEM event exercises remain training behavior rather than vendor defaults.

## Office profile additions

- [HPE iLO 6 User Guide](https://support.hpe.com/hpesc/public/docDisplay?docId=sd00002007en_us&docLocale=en_US): dedicated management addressing and server setup concepts.
- [FortiSwitch standalone administration](https://docs.fortinet.com/document/fortiswitch/7.2.0/administration-guide): console, management interface and switching configuration.
- [Aruba AOS-CX access control](https://arubanetworking.hpe.com/techdocs/AOS-CX/10.14/HTML/hardening/Content/Chp_hard-mgmt/access-ctrl.htm): administrator access and management configuration concepts.

Alletra, StoreOnce and PowerScale use distinct training block/NAS managers and procurement models. Supported configurations are bounded subsets, not verified physical installation recipes. Their dimensions, costs and common data-port geometry are game values. Use the linked product reference in each in-game overview for physical equipment documentation.

## Arena weapon models

- Guns, grenades and C4: ["Guns & Explosives" by 3dmodelscc0](https://3dmodelscc0.itch.io/) — CC0 (public domain). Converted by `tools/pack-weapons.mjs` to `dist/models/weapons/`.
- Karambit: ["Karambit" by Diamonddogkz](https://sketchfab.com/3d-models/karambit-dfd7606f189a413681305a39b8841ce8) — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changed: converted to the game's format, metal parts repainted in an original ruby finish, textures resized.
- First-person arms: "FPS Character Animation Pack Ak-47", "…Pistol" and "…Saps-12" by [Cristian David Duque Camacho (DuqueCD7)](https://sketchfab.com/DuqueCD7) — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) ([AK-47](https://sketchfab.com/3d-models/fps-character-animation-pack-ak-47-b95778a564094fc3a49d1d6a3b6a30ab), [Pistol](https://sketchfab.com/3d-models/e2815a5bea3a4e3895b3c29a2586e671), [Saps-12](https://sketchfab.com/3d-models/3e5ebbd4ace24f2e92eadb7252927b31)). Changed: textures reduced to 1024 px JPEG; other guns, knives, grenades and the bomb held in these arms; fingers curled for knives; left arm posed for one-handed items. In `dist/models/fp/`.
- 18 more guns (P250, USP-S, Five-SeveN, Desert Eagle, MP9, MP7, MAC-10, UMP-45, MP5, P90, AUG, FAMAS, SG 553, Galil AR, M4A1-S, M249, XM1014, SSG 08): ["Ultimate Gun Pack" by Quaternius](https://quaternius.com/) — CC0 (public domain). OBJ/MTL in `dist/models/qguns/`; suppressors, scopes and the box magazine are added in `dist/weapon-models.js`.
- Default knife and fallbacks: original procedural models (`dist/weapon-models.js`).
- Player models: original (the game's own character in T / CT gear, `dist/gd-soldiers.js`). Counter-Strike 1.6 characters are never shipped: they are Valve's, and only load from a copy the player imports on their own computer.

## Arena sounds (`dist/sounds/`, built by `tools/pack-gunshots.mjs`, `tools/pack-effects.mjs` and `tools/pack-sounds.mjs`)

- Gunshots: ["The Free Firearm Sound Library"](https://opengameart.org/content/the-free-firearm-sound-library) — CC0. Every weapon has its own real gun, recorded close up and from mid distance: Glock → Walther PPQ, USP-S → Bersa .380, P250 → S&W 642, Five-SeveN → Ruger Mark III, Desert Eagle → 1911, revolver → Ruger Single Six, MAC-10 / MP7 / MP5 → Carl Gustav M45, MP9 / P90 / UMP-45 → PPSh, Nova → Nova, XM1014 → Charles Daly, AK-47 / Galil → AK-47, SG 553 → SKS, FAMAS → AR-15, M4A4 → Savage .300 Blackout, M4A1-S → Model 1894, AUG → Marlin 336, SSG 08 → Tikka, AWP → Mosin-Nagant, M249 → Springfield 1917 (guns sharing a firearm use different takes).
- The shipped files are the project owner's enhanced versions of all of these (October 2026: "enhanced-sound-effects", "upgraded-sound-effects", "upgraded-footsteps"); running the pack tools again would replace them with the plain cuts.
- Reloads: ["Gun Reload Sounds" by SpringySpringo](https://opengameart.org/content/gun-reload-sounds) — CC0.
- Footsteps, breaking glass, grenade bounces, brass casings, bullet and body impacts: [Kenney "Impact Sounds"](https://kenney.nl/assets/impact-sounds) — CC0.
- Explosions (HE, flashbang, bomb) and the molotov burn: [Kenney "Sci-Fi Sounds"](https://kenney.nl/assets/sci-fi-sounds) — CC0.
- Epidemic Sound recordings (October 2026, `tools/pack-epidemic.mjs`): the project owner's Epidemic Sound downloads, cut into each gun's close, second, third and distant takes, the per-class reload sequences, knife, grenades, hits, death, footsteps, landing and the freeze-time jazz. **Licence for redistribution in a public repository or a downloadable app has not been confirmed**; the GitHub repository is public.

## Classic Defuse maps (`dist/cs-maps/`, built by `tools/maps/extract-nav.mjs`)

Full notices: `dist/cs-maps/LICENSES.md`.

- Heights, floors, place names and connections: [awpy](https://github.com/pnxenopoulos/awpy) navigation data, commit a5434abc06 — MIT, Peter Xenopoulos.
- Floor / wall / cover outline: radar overviews from Lexogrine's [csgo-react-hud](https://github.com/lexogrine/csgo-react-hud) (commit 2c6bbaa31e) — MIT, Lexogrine, all eight maps (earlier builds sampled boltobserv's GPL-3.0 copies for six maps; replaced).
- The layouts are Valve's Counter-Strike designs; the reference data is derived from Valve's game files.
