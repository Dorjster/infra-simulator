// Live step-by-step checklist for the current enterprise contract. Every step is read from the shared
// simulation state (installed devices, cables, configuration and live path tests), so the "next step"
// advances by itself as the team works, in solo play and in LAN co-op.
import { productProfile, configuredProduct } from './product-profiles.js';
import { physicalOffline } from './operations.js';
import { deviceRuntime } from './device-runtime.js';
import { OFFICE_GUIDANCE } from './office-guidance.js';

const live = (nodes, type) => nodes.filter(n => n.active !== false && n.spec && n.type === type);
const step = (label, ok, detail) => ({ label, ok: !!ok, detail });
const firstFail = r => r?.steps?.find(x => !x.ok);

export function contractSteps(office, network, nodes, only) {
  const s = office.state, chapter = only ?? s.chapter, obj = office.objectives()[chapter];
  if (!obj) return { chapter, title: 'All contracts complete', steps: [], ok: true };
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const fw = byId[s.bindings.firewall], sw = byId[s.bindings.access?.[1]], steps = [];
  if (chapter === 0) {
    const fws = live(nodes, 'firewall'), sws = live(nodes, 'switch'), sales = Object.values(s.pcs).find(p => p.department === 'sales');
    const r = sales ? office.evaluate(sales.id, 'https://example.test', s.users.sales) : null, fail = firstFail(r);
    const c = fw?.net.ispContract, cpe = c && nodes.find(n => n.type === 'isp' && n.active !== false && n.spec?.contract === c.id);
    const patched = cpe && fw.ports.some(p => p.link && !p.link.unplugged && !p.link.disabled && (p.link.a === cpe.id || p.link.b === cpe.id));
    const handoff = !c ? { ok: false, reason: 'Order the circuit first' } : !c.physical ? { ok: true, reason: 'Logical handoff' } : !cpe ? { ok: false, reason: 'Receive the provider router from receiving, rack it' } : physicalOffline(cpe) ? { ok: false, reason: cpe.id + ' needs power' } : !patched ? { ok: false, reason: 'Patch ' + cpe.id + ' LAN1 to a free FortiGate port' } : { ok: true, reason: cpe.id + ' patched' };
    steps.push(
      step('Order a FortiGate and an access switch', fws.length && sws.length, 'Procurement terminal · e.g. FortiGate 200F + FortiSwitch 148F'),
      step('Rack and power both', fws.some(n => !physicalOffline(n)) && sws.some(n => !physicalOffline(n)), 'Rails → mount → PSU cord to PDU A/B'),
      step('Initialize the switch on its serial console', sws.some(n => n.net.ip !== '0.0.0.0' && n.net.ssh), 'Console cable → management IP + SSH (see the device guide)'),
      step('Assign gateway and access switch', !!fw && !!sw, 'Office → Infrastructure / Patch panel (also cables the uplink and orders the ISP circuit)'),
      step('ISP circuit ordered', !!fw?.net.ispContract, 'Procurement → ISP services'),
      step('Provider router racked, powered and patched to WAN', handoff.ok, handoff.reason),
      step('WAN configured from the circuit sheet', !!fw && network.wanStatus(fw).ok, fw ? network.wanStatus(fw).reason : 'FortiGate → WAN / ISP'),
      step('VLAN 10 gateway interface and DHCP', s.vlans[10]?.enabled && s.dhcp[10]?.enabled, 'FortiGate → Interfaces & VLANs (10.10.10.1/24, DHCP .100–.199)'),
      step('Sales desk patched to an access port in VLAN 10', sales && sales.port >= 0 && office.access(sales).ok && office.access(sales).vlan === 10, sales ? office.access(sales).reason || 'Access VLAN ' + office.access(sales).vlan : ''),
      step('VLAN 10 carried to the FortiGate', r && !r.steps.find(x => x.name === 'VLAN switching path' && !x.ok) && r.steps.some(x => x.name === 'VLAN switching path'), r?.steps.find(x => x.name === 'VLAN switching path')?.detail || 'Trunk VLAN 10 on the switch uplink and the FortiGate port'),
      step('LAN → WAN policy with source NAT', Object.values(s.policies).some(p => p.enabled && p.dst === 'wan' && p.action === 'accept' && p.nat), 'FortiGate → Firewall policy: 10 → wan, accept, NAT'),
      step('Sales PC opens https://example.test', r?.ok, r?.ok ? 'Verified' : fail ? fail.name + ' · ' + fail.detail : 'Sign in on the Sales PC and browse'));
  } else if (chapter === 3) {
    const servers = nodes.filter(n => n.active !== false && ['server', 'gpu'].includes(n.type) && n.spec), srv = byId[s.bindings.server] || servers[0], r = srv?.net.runtime ? deviceRuntime(srv) : null;
    const vms = r ? Object.values(r.vms) : [], web = Object.values(s.services).filter(x => x.kind === 'web' && x.host === srv?.id), fin = Object.values(s.pcs).find(p => p.department === 'finance');
    const name = Object.values(s.dns).find(d => d.enabled && web.some(w => w.ip === d.ip))?.id, test = name && fin ? office.evaluate(fin.id, 'https://' + name, s.users.finance) : null, fail = firstFail(test);
    steps.push(
      step('Rack, power and boot a server', srv && !physicalOffline(srv), 'PowerEdge / ProLiant → front power button'),
      step('iDRAC / iLO management reachable', srv && srv.net.ip !== '0.0.0.0', 'MGMT UPLINK → management switch; iDRAC network'),
      step('OS or hypervisor installed', r?.os, r?.install?.state === 'installing' ? 'Installer running…' : r?.install?.state === 'failed' ? r.install.reason : 'Virtual media · Install OS'),
      step('Server data NIC in VLAN 50', r && (r.hostIP || Object.values(r.portgroups).some(p => p.vlan === 50)), 'Host network or port group VLAN 50 + switch trunk'),
      step('VM (or host) running the web service', web.some(w => w.running) && (!web[0]?.vm || vms.some(v => v.on)), 'Server services: web, Nginx/IIS, port 443'),
      step('DNS record for the site', !!name, 'FortiGate → DNS: name → service IP'),
      step('Employee opens the site by name', test?.ok, test?.ok ? 'Verified from Finance' : fail ? fail.name + ' · ' + fail.detail : 'Finance PC browser'),
      step('Finance and Engineering shares', obj.ok || !/share/.test(obj.detail), obj.ok ? 'Verified' : obj.detail));
  } else if (chapter === 4) {
    const dev = byId[s.storage.device] || live(nodes, 'storage')[0], p = dev ? configuredProduct(dev) : null, rt = dev?.net.runtime ? deviceRuntime(dev) : null, vols = dev ? network.arrayVolumes(dev).filter(v => v.host) : [];
    steps.push(
      step('Rack and power a storage array', dev && !physicalOffline(dev), 'PowerVault / PowerStore / Alletra'),
      step('Initial setup and management', p?.identity.passwordSet && dev.net.ip !== '0.0.0.0', 'Array GUI → System + management network'),
      step('Pool with protection', rt && Object.keys(rt.pools).length, 'Storage → Pools & volumes'),
      step('Data ports A/B and host initiator', p?.storage.protocol, 'Storage → Data ports; server → Lifecycle initiators'),
      step('Volume mapped to the server', vols.length > 0, 'Storage → Hosts & mapping'),
      step('Two independent healthy paths', vols.some(v => v.state === 'healthy'), vols[0]?.reason || 'Cable A and B through separate switches / SAN fabrics'),
      step('Bound in Data protection + snapshot', s.storage.device && s.snapshots.length > 0, 'Office → Storage / Data protection, then create a snapshot'));
  } else if (chapter === 1) {
    // Segmentation: VLAN interfaces are FortiGate checks; the isolation test is the live share test.
    const need = [10, 20, 30, 40, 70], fc = fw && network.logic ? network.logic.checks(fw) : [];
    for (const v of need) { const c = fc.find(x => x.id === 'vlan-' + v); steps.push(step('VLAN ' + v + ' gateway interface up', s.vlans[v]?.enabled && (!c || c.ok), c && !c.ok ? c.detail : s.vlans[v]?.enabled ? 'VLAN' + v + ' ' + s.vlans[v].ip + '/' + s.vlans[v].prefix : 'FortiGate → Interfaces & VLANs')); }
    steps.push(step('Sales cannot open the Finance share', obj.ok, obj.detail));
  } else if (chapter === 2) {
    // Wi-Fi: every step is a FortiAP check (PoE → CAPWAP → authorization → SSID VLAN) then a client test.
    const ap = Object.values(s.aps)[0], ac = ap && network.logic ? network.logic.ap(ap.id)?.checks || [] : [], get = id => ac.find(x => x.id === id || x.id.startsWith(id + '-'));
    steps.push(step('FortiAP installed at a ceiling drop', !!ap, 'Office → procurement → FortiAP → install at a drop'));
    for (const [id, label] of [['poe', 'AP powered by PoE'], ['capwap', 'AP reaches the FortiGate (CAPWAP)'], ['authorized', 'AP authorized on the FortiGate'], ['ssid', 'SSID VLANs carried on the AP port']]) { const c = get(id); steps.push(step(label, !!ap && (!c || c.ok), c && !c.ok ? c.detail : ap ? 'OK' : 'Install an AP first')); }
    steps.push(step('Isolated Guest SSID on VLAN 90', Object.values(s.ssids).some(x => x.vlan === 90 && x.isolation), 'Wi-Fi Controller → SSIDs'));
    steps.push(step('A Wi-Fi client reaches the Internet', obj.ok, obj.detail));
  } else if (chapter === 5) {
    steps.push(step('Monitoring enabled', s.monitoring.enabled, 'Operations → Monitoring settings'), step('Backup license installed and backup enabled', !!s.storage.backup, 'Procurement → backup license, Storage / Data protection → backup'), step('Backup run', s.backups.length > 0, 'Run a backup'), step('File restored from a recovery point', !!s.restored, 'Restore a file'));
  } else if (chapter === 6) {
    const fc = fw && network.logic ? network.logic.checks(fw) : [], hb = fc.find(x => x.id === 'ha-heartbeat'), hm = fc.find(x => x.id === 'ha-match'), sd = fw && network.logic ? network.logic.state(fw).wan : [];
    steps.push(step('HA enabled with a second FortiGate', s.ha.enabled && !!byId[s.ha.peer], 'System / High availability'), step('Identical model and firmware', !hm || hm.ok, hm?.detail || ''), step('Heartbeat cable ha ↔ ha', s.ha.enabled && (!hb || hb.ok) && (hb ? true : !!s.ha.heartbeat), hb?.detail || 'Patch the HA ports'), step('Configuration synchronized', !!s.ha.synced, 'System / High availability → synchronize'), step('Secondary ISP (SD-WAN member 2)', sd.length > 1, 'Office → procurement → secondary circuit'), step('Cluster and WAN healthy', obj.ok, obj.detail));
  } else if (chapter === 7) {
    steps.push(step('Second floor purchased', s.floorCount > 1, 'Office → procurement → floor'), step('Floor 2 access switch assigned', !!s.bindings.access[2], 'Office → Infrastructure: floor 2 switch'), step('Floor 2 workstation reaches the Internet', obj.ok, obj.detail));
  } else if (chapter === 8) {
    steps.push(step('Branch site purchased', !!s.branch, 'Office → procurement → branch'), step('IPsec enabled with matching keys and proposals', s.vpn.enabled && s.vpn.psk.length >= 8 && s.vpn.psk === s.vpn.peerPsk && s.vpn.phase1 === s.vpn.peerPhase1, 'VPN / IPsec'), step('Tunnel up', obj.ok, obj.detail));
  } else if (chapter === 9) {
    const crit = network.logic ? network.logic.alarms().filter(a => a.severity === 'critical') : [];
    steps.push(step('No critical device alarms', !crit.length, crit.length ? crit[0].device + ': ' + crit[0].message : 'All device checks pass'), step('Incident ticket resolved', !!s.incidentClosed, 'Office → tickets'), step('No active alerts', obj.ok, obj.detail));
  } else steps.push(step(obj.title, obj.ok, obj.detail));
  if (only === undefined) steps.push(step('Contract accepted', false, obj.ok ? 'All checks pass · the customer pays automatically' : 'Pays automatically when the live checks pass'));
  const guide = OFFICE_GUIDANCE[chapter]?.[0];
  return { chapter, title: obj.title, guide, steps, ok: obj.ok, detail: obj.detail, reward: obj.reward };
}
