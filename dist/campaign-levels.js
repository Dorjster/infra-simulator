// Campaign levels 0–10: from an empty internal site to an operational enterprise.
//
// Every check below reads the shared world: purchased and placed equipment, rack power feeds, PSU
// cords, cables, device configuration, path tests from real workstations, permissions and service
// health. Nothing is completed by a UI click, an order, a documentation field or a stored flag. The
// only recorded facts are the level exercises (a guided data incident, a fault drill, a planned
// failover test, a final incident). Each is a real world change, and a level passes only when the
// live checks show that the players repaired it.
//
// Progress (game.levels) = { current, earned: { n: { at, reward, summary } }, exercises: {...} }.
// The host earns the current level when all its checks pass, pays the reward and unlocks the next
// level. An earned level stays earned: if its checks fail later, it appears as a repair objective.
import {physicalOffline} from './operations.js';
import {usdMoney} from './money.js';
import {livePSUs, grid, feedKey, inputFed} from './power-grid.js';
import {configuredProduct, productProfile} from './product-profiles.js';
import {contractSteps} from './contract-steps.js';
import {sameSubnet, validIPv4} from './network-sim.js';
import {CREDENTIAL_SYNTAX} from './admin-credentials.js';

const step = (id, label, ok, detail, where, fix) => ({ id, label, ok: !!ok, detail: detail || '', where: where || 'rack-row', fix: fix || '' });
const MGMT_NET = '10.10.70.0';
const CORRUPT = '[encrypted by simulated incident]';

// Where each level's work happens (the Map panel and the floor marker use these ids).
export const PLACES = {
  receiving: { label: 'Receiving', x: -38, z: -2 },
  procurement: { label: 'Procurement kiosk', x: -38, z: 15 },
  'rack-row': { label: 'Rack row R01–R06', x: 0, z: 6 },
  'rack-rear': { label: 'Rack row · rear aisle', x: 0, z: -6 },
  office: { label: 'Office', x: 90, z: 10 },
  'admin-pc': { label: 'Central management PC', x: 80, z: 19 },
  isp: { label: 'ISP handoff (provider router)', x: -9, z: -6 },
  laptop: { label: 'Service laptop (L)', x: null, z: null }
};

// Procurement categories unlock with the levels (rewards). Everything a level needs is unlocked by
// the time that level starts.
export const CATEGORY_LEVEL = { Racks: 0, 'Rack accessories': 0, Power: 0, Cables: 0, Tools: 0, Network: 1, Security: 2, Optics: 2, Compute: 5, Storage: 6, SAN: 6, Spares: 7, 'Security operations': 8, GPU: 10 };
export const OFFICE_ITEM_LEVEL = { patch: 1, pc: 3, ap: 4, poe: 4, ups: 5, cooling: 5, ssd: 6, license: 7, printer: 3, wan: 9, floor: 9, branch: 10 };

export const LEVELS = [
  { id: 0, title: 'Empty site', goal: 'Learn receiving and build the first safe rack', where: 'receiving', reward: 10000, unlock: 'Network equipment in procurement',
    why: 'Every service in a data center depends on a rack that is placed on a load-rated bay and fed from two independent power feeds. If a rack is not safe, nothing built in it is safe.',
    hints: ['Walk to the procurement kiosk at the receiving room (left of the entrance) and order a 42U rack and a rail kit. Boxes arrive in the receiving room.', 'Open the rack box, pick up the rack and place it on a marked bay in the rack row (E). Plug the rack PDU A and PDU B inputs into the building power whips at the top rear of the rack. Then install a rail kit in the rack.'] },
  { id: 1, title: 'Management foundation', goal: 'Build the management path', where: 'rack-row', reward: 12000, unlock: 'Security (FortiGate) and optics',
    why: 'Engineers manage every device over a separate management network. You build it first, over a serial console, so that a later mistake on the production network cannot lock you out.',
    hints: ['Order a management switch (for example FortiSwitch 148F) and install it on your rails. Connect both PSU cords to PDU A and PDU B.', 'Press L, choose slot 1 (console) and plug it into the switch CONSOLE port. Give it a 10.10.70.x/24 management address with SSH, and change the admin password. Then patch the central management PC to a switch port in VLAN 70.'] },
  { id: 2, title: 'Internet edge', goal: 'Establish the first working WAN', where: 'rack-row', reward: 20000, unlock: 'Department desktops',
    why: 'The firewall is the only door between the office and the Internet. It must route, translate (NAT) and filter traffic, and the provider circuit must be installed exactly as the circuit sheet says.',
    hints: ['Order and install a FortiGate. In Office → Infrastructure, assign the firewall and access switch and choose an ISP plan. The provider router ships to receiving: rack it, power it and patch LAN1 to a FortiGate port.', 'In the FortiGate GUI, configure WAN from the circuit sheet with a default route. Create VLAN 10 with DHCP on the switch trunk, patch the Sales desk to VLAN 10, and add a 10 → wan accept policy with NAT. Test in the Sales PC browser.'] },
  { id: 3, title: 'Segmented office', goal: 'Separate users and protect data', where: 'office', reward: 20000, unlock: 'Wireless access points',
    why: 'Departments get their own VLANs, so a compromised Sales laptop cannot reach Finance. Allowed paths must work, and everything else must be denied by policy.',
    hints: ['Create VLAN interfaces with DHCP for Sales 10, Finance 20, Engineering 30, Executive 40 and Management 70. Carry them on the switch uplink trunk.', 'Patch the Finance and Engineering desks to access ports in their VLANs, and allow each department only to the Internet. Do not add a policy between staff VLANs: the Sales → Finance test must stop at the firewall policy.'] },
  { id: 4, title: 'Wireless access', goal: 'Commission the AP and guest network', where: 'office', reward: 22000, unlock: 'Compute servers',
    why: 'Wi-Fi extends the same VLAN rules to laptops and phones. Guests need the Internet, not your internal data.',
    hints: ['Buy a FortiAP in Office → procurement and install it at a ceiling drop. Allow management VLAN 70 and the SSID VLANs on its switch port, then authorize it on the FortiGate.', 'Create a secured employee SSID and an isolated Guest SSID on VLAN 90 with DHCP and an Internet-only policy. Switch one desktop adapter to Wi-Fi on Guest and test that it browses but cannot reach Finance.'] },
  { id: 5, title: 'Compute and intranet', goal: 'Bring up server services', where: 'rack-row', reward: 30000, unlock: 'Storage arrays and SAN switches',
    why: 'Business applications run on servers. You install one through its BMC (iDRAC/iLO), put it on the server VLAN and publish the intranet by name.',
    hints: ['Install a PowerEdge or ProLiant server with both PSU cords. Connect its MGMT (iDRAC/iLO) port to the management switch and set its address. Install an OS from virtual media.', 'Connect a data NIC to the switch on VLAN 50, run a web service (or a VM with it), add a DNS record and test https://<name> from the Finance PC.'] },
  { id: 6, title: 'Shared storage', goal: 'Provide resilient data paths', where: 'rack-row', reward: 45000, unlock: 'Backup licences and spares',
    why: 'Shared storage lets servers survive a disk or a controller failure. Two independent paths (A and B) keep the data reachable when one cable, switch or controller fails.',
    hints: ['Install a storage array and complete its setup wizard. Cable controller A and B data ports through separate switches or SAN fabrics.', 'Create a pool and a volume, register the server initiator (IQN/WWPN), map the volume and zone the fabrics (FC) or add the iSCSI target. Bind the array in Office → Storage.'] },
  { id: 7, title: 'Protection and recovery', goal: 'Protect business data', where: 'office', reward: 30000, unlock: 'Monitoring and security operations',
    why: 'Backups are only real when a restore has been proven. You create data, lose it in a controlled incident, and bring it back with its permissions intact.',
    hints: ['Create a Finance file share on the server with Finance read/write permission, and write a sample file from the Finance PC. Install the backup licence, enable backups and run one.', 'Start the guided data incident from the Objective panel, then restore the recovery point and read the file again from the Finance PC.'] },
  { id: 8, title: 'Observe and troubleshoot', goal: 'Make operations visible', where: 'laptop', reward: 30000, unlock: 'Secondary ISP and expansion',
    why: 'Operations teams find faults from alarms and logs before users call. You enable monitoring, then find and repair a real injected fault.',
    hints: ['Enable monitoring with SNMP, syslog and an alert e-mail in Office → Monitoring. Open Engineering → Monitoring to see the device alarms.', 'Start the fault drill from the Objective panel. Use the alarm list, the device GUI or CLI and the Sales PC diagnostics to find the fault, then repair it physically or in the configuration.'] },
  { id: 9, title: 'Resilience and expansion', goal: 'Survive a component or path fault', where: 'rack-rear', reward: 45000, unlock: 'GPU compute and branch expansion',
    why: 'A single PSU, feed or ISP should never take the office down. You add the redundant parts, then prove it with a planned failure.',
    hints: ['Give every installed device a second PSU cord on the other PDU. Buy the secondary ISP in Office → procurement and keep storage on two healthy paths.', 'Run the planned failover test from the Objective panel: the primary WAN is taken down and the Sales PC must still browse through SD-WAN member 2.'] },
  { id: 10, title: 'Full commissioning', goal: 'Operate a complete enterprise', where: 'laptop', reward: 60000, unlock: 'Campaign complete · Free Build keeps your facility',
    why: 'Commissioning is the customer acceptance test. Every purchased device and every service must work at once, and the team must repair a final incident under real conditions.',
    hints: ['Open the acceptance checklist: every earlier level must pass live, with no critical alarms. Commission or remove any purchased device that is not powered and managed.', 'Start the final incident from the Objective panel, diagnose it, repair it and watch the checklist turn green.'] }
];

function mgmtAddress(n) { return validIPv4(n.net.ip) && n.net.ip !== '0.0.0.0' && sameSubnet(n.net.ip, MGMT_NET, 24); }
function firstFail(steps) { return steps.find(s => !s.ok); }

export function createCampaign(world, network, ctx) {
  const { nodes, byId } = ctx;
  const ops = () => world.operations, g = () => world.operations.game, office = () => world.office;
  const active = () => g().mode === 'campaign' && g().track === 'levels';
  const installed = type => ops().available().filter(n => n.spec && (!type || n.type === type));
  const pcOf = dep => Object.values(office().state.pcs).find(p => p.department === dep && p.id !== 'ADMIN-PC');
  const userOf = dep => office().state.users[dep === 'executive' ? 'ceo' : dep];
  const test = (dep, url) => { const pc = pcOf(dep); return pc ? office().evaluate(pc.id, url, userOf(dep)) : { ok: false, reason: 'No ' + dep + ' desk', steps: [] }; };
  const why = r => { const f = r?.steps?.find(x => !x.ok); return f ? f.name + ' · ' + f.detail : r?.reason || 'not tested'; };
  const pcIP = dep => { const pc = pcOf(dep); if (!pc) return null; const a = office().access(pc); if (!a.ok) return null; const l = office().lease(pc, a); return l.ok ? l.ip : null; };
  const blockedByPolicy = r => { const f = r?.steps?.find(x => !x.ok); return !!f && f.name === 'Firewall policy'; };
  const salesTest = () => test('sales', 'https://example.test');
  const fromContract = (chapter, drop = []) => contractSteps(office(), network, nodes, chapter).steps.filter(x => !drop.includes(x.label)).map((x, i) => step('c' + chapter + '-' + i, x.label, x.ok, x.detail, 'rack-row'));

  function level0() {
    const G = g(), racks = G.emptySite ? G.racks : [{ id: 'R01', building: true }], r = racks[0];
    const received = G.orders.some(o => o.sku === 'rack' && o.opened) || !G.emptySite || racks.length > 0;
    const feed = f => !!r && (r.building || inputFed(r.id, f));
    const tripped = !!r && ['A', 'B'].some(f => grid.tripped[feedKey(r.id, f)]);
    const rails = !!r && (r.building ? G.rails.length > 0 || installed().length > 0 : G.rails.some(x => x.rack === r.id));
    return [
      step('rack-received', 'Rack delivered and unboxed in receiving', received, received ? 'Rack box opened' : 'Order a 42U rack at the procurement kiosk, then open its box in receiving', 'procurement', 'Procurement kiosk → Racks → 42U rack with A/B PDUs'),
      step('rack-placed', 'Rack placed on a marked bay', !!r, r ? (r.building ? 'Building rack row (pre-v32 save)' : r.id + ' on ' + r.pad) : 'Pick up the rack and press E on a marked floor bay in the rack row', 'rack-row'),
      step('feed-a', 'PDU A input plugged into building feed A', feed('A'), feed('A') ? 'PDU A energized' : r ? 'Walk behind ' + r.id + ' and press E on the PDU A input whip (top rear, left)' : 'Place a rack first', 'rack-rear'),
      step('feed-b', 'PDU B input plugged into building feed B', feed('B'), feed('B') ? 'PDU B energized' : r ? 'Walk behind ' + r.id + ' and press E on the PDU B input whip (top rear, right)' : 'Place a rack first', 'rack-rear'),
      step('breakers', 'Rack power checks pass (no tripped breaker)', !!r && !tripped, tripped ? 'A PDU breaker is tripped · move load and reset it at the rack' : r ? 'Breakers closed' : 'Place a rack first', 'rack-rear'),
      step('rails', 'Rail kit installed in the rack', rails, rails ? 'Rails mounted' : 'Carry a rail kit to the rack front and press E on a free U position', 'rack-row')
    ];
  }
  function mgmtSwitch() { const sws = installed('switch'); return sws.find(mgmtAddress) || sws[0] || null; }
  function level1() {
    const sw = mgmtSwitch(), s = office().state, pc = s.pcs['ADMIN-PC'], hub = pc && byId[pc.switch];
    const setup = !!sw && mgmtAddress(sw) && sw.net.ssh && sw.net.vlan === 70;
    const password = !!sw && !!configuredProduct(sw).identity?.passwordSet;
    const patched = !!pc && pc.connected && !!hub && hub.active !== false && pc.port >= 0;
    let path = { ok: false, reason: 'Patch the central management PC first' };
    if (patched && sw) {
      const a = office().access(pc);
      if (!a.ok) path = { ok: false, reason: a.reason };
      else { path = network.accessStatus({ node: hub, port: hub.ports[pc.port], mode: 'DIRECT SERVICE LAN', laptopIP: pc.ip, laptopPrefix: pc.prefix }, sw); if (!path.ok && /VLAN differs/.test(path.reason)) path = { ok: false, reason: hub.id + ' ' + hub.ports[pc.port].name + ' (central PC) is not in VLAN 70 · make it an access port in VLAN 70 on the console' }; else if (!path.ok && /different subnet/.test(path.reason)) path = { ok: false, reason: 'The switch management address must be in 10.10.70.0/24 like the central PC (10.10.70.239)' }; }
    }
    const fam = sw ? productProfile(sw).family : 'fortiswitch', syntax = (CREDENTIAL_SYNTAX[fam] || CREDENTIAL_SYNTAX.fortiswitch).join(' · ');
    return [
      step('switch-racked', 'Management switch installed in the rack', !!sw, sw ? sw.id + ' · ' + sw.model + ' at ' + sw.rack + ' U' + sw.unit : 'Order a management switch (Network) and mount it on your rails', 'rack-row'),
      step('switch-power', 'Management switch powered', !!sw && !physicalOffline(sw), !sw ? 'Install the switch first' : physicalOffline(sw) ? 'Plug a power cord from its rear PSU socket into PDU A or B (and check the rack feeds)' : 'Running', 'rack-rear'),
      step('switch-console', 'Initial IP, VLAN 70 and SSH set on the serial console', setup, !sw ? 'Install the switch first' : setup ? sw.net.ip + '/' + sw.net.prefix + ' · VLAN 70 · SSH' : 'Laptop slot 1 (console) → CONSOLE port. Set a 10.10.70.x/24 management address, VLAN 70 and SSH', 'rack-row', 'config system interface · edit mgmt · set ip 10.10.70.8/24 · set allowaccess ping https ssh · end'),
      step('switch-password', 'Factory admin password changed', password, password ? 'Administrator credentials set' : 'On the console: ' + syntax, 'rack-row', syntax),
      step('admin-pc-patched', 'Central management PC patched to the switch', patched, patched ? 'ADMIN-PC → ' + hub.id + ' / ' + (hub.ports[pc.port]?.name || '') : 'At the central PC, patch its outlet to a free switch port (uses one CAT6 patch lead)', 'admin-pc'),
      step('admin-pc-path', 'Central PC reaches the switch management over the cable', path.ok, path.ok ? 'MANAGEMENT CONNECTED · 10.10.70.239 → ' + sw.net.ip : path.reason, 'admin-pc', 'The PC port must be an access port in VLAN 70 and the PC is 10.10.70.239/24')
    ];
  }
  function level2() {
    const r = salesTest(), dns = r.steps?.find(x => x.name === 'DNS resolver'), fw = byId[office().state.bindings.firewall] || installed('firewall')[0];
    const fwPass = !!fw && !!configuredProduct(fw).identity?.passwordSet, fwMgmt = !!fw && mgmtAddress(fw);
    return [...fromContract(0, ['Sales PC opens https://example.test']),
      step('fw-password', 'FortiGate admin password changed at first login', fwPass, !fw ? 'Install a FortiGate first' : fwPass ? 'Administrator password set' : 'Console login prompt, or FortiGate GUI → System → Settings', 'rack-row', 'Console: log in as admin with a blank password; FortiOS asks for a new one'),
      step('fw-mgmt', 'FortiGate management address on VLAN 70', fwMgmt, !fw ? 'Install a FortiGate first' : fwMgmt ? fw.net.ip + '/' + fw.net.prefix : 'FortiGate GUI → management network: 10.10.70.x/24, VLAN 70', 'laptop'),
      step('dns', 'Public names resolve through the FortiGate DNS', !!dns?.ok, dns ? dns.detail : 'Sales PC has no DNS path yet', 'office'),
      step('browse', 'Sales PC browses https://example.test', r.ok, r.ok ? 'Verified from the Sales desktop' : why(r), 'office')];
  }
  function level3() {
    const out = fromContract(1, ['Sales cannot open the Finance share']).map(x => ({ ...x, where: 'laptop' }));
    for (const [dep, v] of [['sales', 10], ['finance', 20], ['engineering', 30]]) { const r = test(dep, 'https://example.test'); out.push(step('net-' + dep, dep[0].toUpperCase() + dep.slice(1) + ' desk (VLAN ' + v + ') reaches the Internet', r.ok, r.ok ? 'Authorized path works' : why(r), 'office')); }
    const fin = pcIP('finance'), r = fin ? test('sales', 'icmp://' + fin) : null;
    out.push(step('isolation', 'Sales → Finance desktops is denied by firewall policy', !!r && blockedByPolicy(r), !fin ? 'Finance desk needs an address first' : blockedByPolicy(r) ? 'Denied at the firewall policy (implicit deny)' : r.ok ? 'Sales can reach Finance · remove the policy that allows 10 → 20' : 'The test did not reach the firewall policy · ' + why(r), 'laptop'));
    return out;
  }
  function level4() {
    const s = office().state, out = fromContract(2, ['A Wi-Fi client reaches the Internet']).map(x => ({ ...x, where: 'office' }));
    const staffSSID = Object.values(s.ssids).find(x => x.enabled && x.security !== 'open' && [10, 20, 30, 40].includes(+x.vlan));
    out.push(step('employee-ssid', 'Secured employee SSID on a staff VLAN', !!staffSSID, staffSSID ? staffSSID.id + ' · ' + staffSSID.security + ' · VLAN ' + staffSSID.vlan : 'Wi-Fi Controller → SSIDs: WPA2/WPA3 SSID on VLAN 10–40', 'laptop'));
    const guestPC = Object.values(s.pcs).find(p => p.mode === 'Wi-Fi' && +s.ssids[p.ssid]?.vlan === 90), user = guestPC && s.users[guestPC.department === 'executive' ? 'ceo' : guestPC.department];
    const r = guestPC ? office().evaluate(guestPC.id, 'https://example.test', user) : null, fin = pcIP('finance'), b = guestPC && fin ? office().evaluate(guestPC.id, 'icmp://' + fin, user) : null;
    out.push(step('guest-client', 'A guest Wi-Fi client authenticates, gets an address and browses', !!r?.ok, !guestPC ? 'Switch a desktop adapter to Wi-Fi on the Guest SSID (VLAN 90)' : r.ok ? guestPC.id + ' on Guest reached the Internet' : why(r), 'office'));
    out.push(step('guest-blocked', 'Guest client cannot reach internal Finance data', !!b && blockedByPolicy(b), !guestPC ? 'Needs a guest client first' : !fin ? 'Finance desk needs an address first' : blockedByPolicy(b) ? 'Denied at the firewall policy' : b.ok ? 'Guest reaches Finance · remove the policy that allows 90 → internal' : why(b), 'laptop'));
    return out;
  }
  const level5 = () => fromContract(3, ['Finance and Engineering shares']);
  function level6() { const s = office().state; return [...fromContract(4, ['Bound in Data protection + snapshot']), step('bound', 'Array bound in Office → Storage / Data protection', !!s.storage.device && byId[s.storage.device]?.type === 'storage', s.storage.device ? s.storage.device + ' · ' + s.storage.protocol : 'Office → Storage: select the array and its transport', 'laptop')]; }
  function level7() {
    const s = office().state, ex = g().levels?.exercises || {}, finPC = pcOf('finance'), salesPC = pcOf('sales');
    const share = s.shares.finance ? 'finance' : Object.keys(s.shares).find(k => s.shares[k].read === 'finance');
    const read = share && finPC ? office().shareAccess(finPC.id, share, s.users.finance) : null, deny = share && salesPC ? office().shareAccess(salesPC.id, share, s.users.sales) : null;
    const files = share ? Object.values(s.files[share] || {}) : [], corrupt = files.some(f => f.content === CORRUPT);
    const licensed = s.inventory.some(i => i.sku === 'backup-license' && i.installed) && !!s.storage.backup, points = s.backups.length + s.snapshots.length;
    const restored = !!ex.data && (s.restoredAt || 0) > ex.data.at;
    return [
      step('share', 'Finance file share readable by Finance', !!read?.ok, !share ? 'Create a file service and a Finance share (Office → Services / Shares)' : read.ok ? share + ' · ' + read.reason : why(read), 'laptop'),
      step('sample', 'Sample business data written to the share', files.length > 0, files.length ? files.length + ' file(s) in ' + share : 'From the Finance PC, write a file to the share', 'office'),
      step('backup', 'Backup licence installed and backups enabled', licensed, licensed ? 'Licensed backups on ' + (s.storage.device || 'company storage') : 'Office → procurement → backup licence, install it, then Office → Storage → backup', 'laptop'),
      step('recovery-point', 'A recovery point exists', points > 0, points ? points + ' recovery point(s)' : 'Run a backup (or snapshot)', 'laptop'),
      step('incident', 'Guided data incident started', !!ex.data, ex.data ? 'Files were corrupted at ' + new Date(ex.data.at).toLocaleTimeString() : 'Objective panel → Start guided data incident', 'laptop'),
      step('restored', 'Data restored from a recovery point after the incident', restored && !corrupt, !ex.data ? 'Start the incident first' : !restored ? 'Restore the recovery point (Office → Storage → recovery points)' : corrupt ? 'A file is still corrupted · restore a recovery point taken before the incident' : 'Restored', 'laptop'),
      step('permissions', 'Permissions survived: Sales is still denied the Finance share', !!deny && !deny.ok, !deny ? 'Needs the Finance share' : deny.ok ? 'Sales can open Finance data · fix the share permissions' : 'Denied · ' + (deny.steps?.find(x => !x.ok)?.name || deny.reason) + (deny.reason ? ' · ' + deny.reason : ''), 'office')
    ];
  }
  function level8() {
    const s = office().state, m = s.monitoring, ex = g().levels?.exercises || {}, r = salesTest();
    const crit = network.logic ? network.logic.alarms().filter(a => a.severity === 'critical').length : 0;
    return [
      step('monitoring', 'Monitoring with SNMP, syslog and alert e-mail', m.enabled && m.snmp && m.syslog && /@/.test(m.email || '') && !m.maintenance, m.enabled && m.snmp && m.syslog && !m.maintenance ? 'Telemetry on · alerts to ' + m.email : 'Office → Monitoring: enable monitoring, SNMP, syslog and an alert e-mail; maintenance mode off', 'laptop'),
      step('drill', 'Fault drill started', !!ex.fault, ex.fault ? 'Injected at ' + new Date(ex.fault.at).toLocaleTimeString() + ' · find it from the alarms' : 'Objective panel → Start the fault drill', 'laptop'),
      step('diagnosed', 'The fault broke a real service and was repaired', !!ex.fault?.repairedAt, !ex.fault ? 'Start the drill first' : ex.fault.repairedAt ? 'Service recovered ' + Math.round((ex.fault.repairedAt - ex.fault.at) / 1000) + ' s after the fault' : 'Sales PC → Internet · ' + why(r), 'laptop'),
      step('recovered', 'End-user service healthy and no critical alarm', r.ok && !crit, r.ok ? (crit ? crit + ' critical alarm(s) remain' : 'Sales browses · alarms clear') : why(r), 'office')
    ];
  }
  function level9() {
    const s = office().state, ex = g().levels?.exercises || {};
    const single = installed().filter(n => n.type !== 'isp' && n.physical && (new Set(n.physical.power.filter(Boolean)).size < 2 || livePSUs(n).length < 2));
    const secondary = !!(s.wan.secondary && s.wan.secondaryUp !== false && s.inventory.some(i => i.sku === 'wan2' && i.installed));
    const dev = byId[s.storage.device], vols = dev ? network.arrayVolumes(dev).filter(v => v.host) : [], healthy = vols.some(v => v.state === 'healthy');
    return [
      step('dual-power', 'Every installed device fed from PDU A and PDU B', installed().length > 0 && !single.length, single.length ? single.slice(0, 3).map(n => n.id).join(', ') + (single.length > 3 ? ' +' + (single.length - 3) : '') + ' on one feed · add the second PSU cord' : 'All PSUs redundant', 'rack-rear'),
      step('secondary-isp', 'Secondary ISP installed (SD-WAN member 2)', secondary, secondary ? 'Member 2 healthy' : 'Office → procurement → Secondary ISP, then install it', 'laptop'),
      step('multipath', 'Storage keeps two healthy paths', healthy, healthy ? 'Volume paths A and B healthy' : vols[0] ? vols[0].volume + ' · ' + vols[0].reason : 'Map a volume over two paths (level 6)', 'rack-row'),
      step('failover-test', 'Planned failover test: Sales browses with the primary WAN down', !!ex.failover?.ok, !ex.failover ? 'Objective panel → Run the planned failover test' : ex.failover.ok ? 'Passed · ' + ex.failover.reason : 'Last test failed · ' + ex.failover.reason, 'laptop')
    ];
  }
  function level10(all) {
    const ex = g().levels?.exercises || {}, crit = network.logic ? network.logic.alarms().filter(a => a.severity === 'critical') : [];
    const out = all.slice(0, 10).map(l => { const f = firstFail(l.checks); return step('level-' + l.id, 'Level ' + l.id + ' · ' + LEVELS[l.id].title + ' passes live', !f, f ? f.label + ' · ' + f.detail : 'Pass', f?.where); });
    const idle = installed().filter(n => physicalOffline(n) || (n.type !== 'isp' && n.net.ip === '0.0.0.0'));
    out.push(step('devices', 'Every purchased device powered and managed', !idle.length, idle.length ? idle.slice(0, 3).map(n => n.id).join(', ') + ' · power and manage it, or remove it' : installed().length + ' devices commissioned', 'rack-row'));
    out.push(step('alarms', 'No critical device alarms', !crit.length, crit.length ? crit[0].device + ': ' + crit[0].message : 'All device checks pass', 'laptop'));
    out.push(step('final', 'Final incident diagnosed and repaired', !!ex.final?.repairedAt, !ex.final ? 'Objective panel → Start the final incident' : ex.final.repairedAt ? 'Recovered in ' + Math.round((ex.final.repairedAt - ex.final.at) / 1000) + ' s' : 'Service impacted · diagnose from the alarms', 'laptop'));
    return out;
  }
  const builders = [level0, level1, level2, level3, level4, level5, level6, level7, level8, level9];
  // Each level is evaluated on demand and cached briefly (700 ms): the HUD and the host tick need only the
  // current level (plus one earned level per call for repair objectives), so a campaign never pays for all
  // eleven levels' path tests in one frame.
  const levelCache = new Map(); let repairCursor = 0;
  function levelChecks(id, force = false) {
    const G = g(), hit = levelCache.get(id);
    if (!force && hit && hit.game === G && Date.now() - hit.at < 700) return hit.checks;
    let checks; try { checks = id === 10 ? level10(Array.from({ length: 10 }, (_, k) => ({ id: k, checks: levelChecks(k, force) }))) : builders[id](); } catch (e) { checks = [step('error', 'Check unavailable', false, e.message)]; }
    levelCache.set(id, { at: Date.now(), game: G, checks }); return checks;
  }
  const decorate = (id, checks) => { const G = g(); return { id, checks, ...LEVELS[id], ok: checks.length > 0 && checks.every(c => c.ok), earned: !!G.levels.earned[id], current: G.levels.current === id, locked: id > G.levels.current }; };
  function levelStatus(id, force) { const G = g(); if (world.remoteCampaign) { const r = world.remoteCampaign[id]; return r ? { ...r, earned: !!G.levels.earned[id], current: G.levels.current === id, locked: id > G.levels.current } : null; } return decorate(id, levelChecks(id, force)); }
  function evaluate(force = false) {
    const G = g(); if (!G.levels) return [];
    if (world.remoteCampaign) return world.remoteCampaign.map(l => ({ ...l, earned: !!G.levels.earned[l.id], current: G.levels.current === l.id, locked: l.id > G.levels.current }));
    return LEVELS.map(l => decorate(l.id, levelChecks(l.id, force)));
  }
  let repairs = new Map();
  function status() {
    const G = g(); if (!G.levels) return null;
    const curId = Math.min(G.levels.current, 10), cur = levelStatus(curId), next = cur.checks.find(c => !c.ok) || null, done = cur.checks.filter(c => c.ok).length;
    // Earned levels are re-checked one per call; failures stay listed until that level passes again.
    const earned = Object.keys(G.levels.earned).map(Number).filter(id => id !== 10 && id !== curId);
    for (let k = 0; k < Math.min(2, earned.length); k++) { const id = earned[repairCursor++ % earned.length], l = levelStatus(id); if (l.ok) repairs.delete(id); else repairs.set(id, { id, title: l.title, check: l.checks.find(c => !c.ok) }); }
    for (const id of repairs.keys()) if (!G.levels.earned[id]) repairs.delete(id);
    return { level: cur, next, done, total: cur.checks.length, complete: G.levels.current > 10, repairs: [...repairs.values()], get all() { return evaluate(); } };
  }
  // Tick on the host (solo: the local world). Tracks exercise repairs and earns the current level.
  let lastTick = 0;
  function tick(now = Date.now()) {
    const G = g(); if (!active() || !G.levels || now - lastTick < 900) return false; lastTick = now;
    const ex = G.levels.exercises;let changed = false;
    for (const key of ['fault', 'final']) { const e = ex[key]; if (e && !e.repairedAt && salesTest().ok && now - e.at > 1500) { e.repairedAt = now; changed = true; ops().history?.('Campaign: ' + (key === 'fault' ? 'fault drill' : 'final incident') + ' repaired · service restored'); } }
    const cur = G.levels.current; if (cur > 10) return changed;
    const lvl = decorate(cur, levelChecks(cur, true));
    if (lvl?.ok) {
      const def = LEVELS[cur]; G.levels.earned[cur] = { at: now, reward: def.reward, summary: lvl.checks.map(c => c.label) };
      G.budget += def.reward; G.reputation = Math.min(100, (G.reputation || 50) + 3); G.levels.current = cur + 1;
      G.history.unshift({ at: now, actor: 'customer', message: 'Level ' + cur + ' · ' + def.title + ' accepted · ' + usdMoney(def.reward) + ' · unlocked: ' + def.unlock }); G.history = G.history.slice(0, 300);
      levelCache.clear(); changed = true;
    }
    return changed;
  }
  // Level exercises. Each one changes the real world; the level checks grade the repair.
  function faultPool() { const pc = pcOf('sales'), s = office().state, sw = byId[s.bindings.access?.[pc?.floor]]; const pool = []; if (pc?.connected && pc.port >= 0) pool.push('cable', 'port', 'vlan'); if (sw?.physical && sw.physical.power.some(Boolean)) pool.push('power'); return { pool, pc, sw }; }
  function injectFault(label) {
    const { pool, pc, sw } = faultPool(); if (!salesTest().ok) throw Error('The Sales PC must browse the Internet before the ' + label + ' starts (level 2 path)');
    if (!pool.length) throw Error('No suitable path to fault yet');
    const kind = pool[(g().counter + (g().levels.exercises.fault ? 1 : 0)) % pool.length], s = office().state;
    if (kind === 'power') { const feeds = sw.physical.power.slice(); sw.physical.power = [null, null]; for (const f of feeds.filter(Boolean)) g().stock.push({ id: 'ITEM-' + (++g().counter), sku: 'power', holders: [], stage: 'unboxed', floor: { x: sw.pos.x + 1.5, z: (sw.pos.z || 0) - 7 } }); ops().settle(); }
    else if (kind === 'cable') pc.connected = false;
    else if (kind === 'port') s.ports[pc.id].admin = false;
    else if (kind === 'vlan') { s.ports[pc.id].vlan = 4093; sw.ports[pc.port].cfg.access = 4093; }
    ctx.refreshFaults?.(); network.logic?.touch?.(); levelCache.clear();
    const broke = !salesTest().ok; return { kind, target: kind === 'power' ? sw.id : pc.id, at: Date.now(), broke };
  }
  function apply(a, actor = 'ENGINEER-01') {
    const G = g(); if (!active() || !G.levels) throw Error('Campaign levels are not active');
    const ex = G.levels.exercises, cur = G.levels.current, hist = m => ops().history?.(m, actor);
    if (a.op === 'data-incident') {
      if (![7, 10].includes(cur)) throw Error('The data incident belongs to level 7');
      const s = office().state, share = s.shares.finance ? 'finance' : Object.keys(s.shares).find(k => s.shares[k].read === 'finance');
      if (!share || !Object.keys(s.files[share] || {}).length) throw Error('Write sample data to the Finance share first');
      if (!s.backups.length && !s.snapshots.length) throw Error('Create a recovery point before the incident');
      for (const files of Object.values(s.files)) for (const f of Object.values(files)) f.content = CORRUPT;
      s.incidentClosed = false; ex.data = { at: Date.now() }; levelCache.clear(); hist('Campaign: guided data incident · company files corrupted');
      return 'Incident: company files were corrupted. Restore them from a recovery point.';
    }
    if (a.op === 'fault-drill' || a.op === 'final-incident') {
      const key = a.op === 'fault-drill' ? 'fault' : 'final'; if (key === 'fault' && cur !== 8 || key === 'final' && cur !== 10) throw Error('This exercise belongs to level ' + (key === 'fault' ? 8 : 10));
      if (ex[key] && !ex[key].repairedAt) throw Error('An exercise is already running · repair it first');
      const r = injectFault(key === 'fault' ? 'fault drill' : 'final incident'); ex[key] = r; hist('Campaign: ' + (key === 'fault' ? 'fault drill' : 'final incident') + ' injected (' + r.kind + ')');
      return (key === 'fault' ? 'Fault drill started' : 'Final incident started') + ' · a user service is down. Find the cause from the alarms, the device GUIs and the Sales PC diagnostics.';
    }
    if (a.op === 'failover-test') {
      if (cur !== 9 && cur !== 10) throw Error('The failover test belongs to level 9');
      const s = office().state; if (!s.wan.secondary) throw Error('Install the secondary ISP first');
      const before = s.wan.up; s.wan.up = false; let r; try { r = salesTest(); } finally { s.wan.up = before; }
      const via = r.steps?.find(x => x.name === 'SD-WAN');
      ex.failover = { at: Date.now(), ok: r.ok, reason: r.ok ? (via ? via.detail : 'Service stayed up') : why(r) }; levelCache.clear(); hist('Campaign: planned failover test ' + (r.ok ? 'passed' : 'failed'));
      return r.ok ? 'Failover test passed · primary WAN down, the Sales PC browsed through member 2' : 'Failover test failed · ' + ex.failover.reason;
    }
    throw Error('Unknown campaign action');
  }
  function summary() {
    const G = g(), s = office().state; if (!G.levels) return null;
    return { name: G.name, levels: Object.keys(G.levels.earned).length, budget: G.budget, devices: installed().length, racks: G.racks.length, vlans: Object.values(s.vlans).filter(v => v.enabled).length, services: Object.values(s.services).filter(x => x.running).length, backups: s.backups.length, alarms: network.logic ? network.logic.alarms().length : 0, history: G.history.slice(0, 12) };
  }
  function categoryUnlocked(category) { const G = g(); if (!active() || !G.levels) return true; return (CATEGORY_LEVEL[category] ?? 0) <= G.levels.current; }
  function officeItemUnlocked(kind) { const G = g(); if (!active() || !G.levels) return true; return (OFFICE_ITEM_LEVEL[kind] ?? 0) <= G.levels.current; }
  return { evaluate, status, tick, apply, summary, active, categoryUnlocked, officeItemUnlocked, invalidate() { levelCache.clear(); } };
}

// Migration: older campaign saves (v29–v31) get a levels record mapped from the enterprise chapters
// or the legacy rack projects. Nothing in the world is reset; the nearest completed prerequisites are
// marked and the first unmet level becomes current.
export function levelsFromLegacy(operations, office) {
  const earned = {}, at = Date.now(), mark = n => { for (let i = 0; i <= n; i++) earned[i] ??= { at, reward: 0, summary: ['Migrated from an earlier save'], migrated: true }; };
  if (operations.enterprise) {
    const ch = office?.chapter || 0;
    // Contracts 0–9 → levels: Internet (0) ⇒ 0–2, segmentation (1) ⇒ 3, Wi-Fi (2) ⇒ 4, services (3) ⇒ 5,
    // storage (4) ⇒ 6, monitoring + backup (5) ⇒ 7, HA (6) ⇒ 9 (8 still needs its drill).
    const map = [2, 3, 4, 5, 6, 7, 7, 7, 7, 7];
    if (ch > 0) mark(map[Math.min(ch, 10) - 1]);
    if (ch >= 7) earned[9] = { at, reward: 0, summary: ['Migrated: HA and secondary ISP contract'], migrated: true };
  } else {
    const p = operations.project || 0;
    if (p >= 1) mark(1);
  }
  let current = 0; while (earned[current]) current++;
  return { current, earned, exercises: {}, migrated: true };
}
