// P1 storage exercise: rack/power → array initial setup (management) → pool/protection → volume →
// host initiator → A/B data paths → masking → host sees the volume → datastore/VM/service →
// cut path A (degraded, still usable) → cut path B (unavailable) → restore (healthy).
// Also: management reachable while data path/mapping/VLAN/zoning is wrong; shared switch ≠ two
// fabrics; FC/iSCSI SKU transport limits; host groups, read-only, resize and delete rules.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
import { helpers } from './build-helpers.mjs';
import { deviceRuntime } from '../dist/device-runtime.js';
import { hostIdentifiers } from '../dist/product-config.js';
const h = helpers(a), { w, office, config, device, product, install, cable, engineering, op } = h, o = w.office, s = () => o.state, net = a.lab.kit.network;
engineering({ type: 'mode', mode: 'free' });
const hub = a.byId['MGMT-SW'];
const free = (n, speed, medium = 'Ethernet') => n.ports.findIndex(p => !p.link && !p.service && !p.reserved && p.medium === medium && p.speed === speed && !/MGMT/.test(p.name));
const hubPort = () => hub.ports.findIndex((p, i) => !p.link && !p.service && p.speed === 1 && !Object.values(s().pcs).some(pc => pc.switch === hub.id && pc.port === i));
function manage(n, ip) { const hp = hubPort(); cable(n, 'MGMT UPLINK', hub, hp, 'cat6', 40); config({ type: 'port', node: hub.id, index: hp, value: { access: 70 } }); return hp; }
await office({ type: 'login', user: 'itadmin', password: 'OfficeLab19!' });
const gui = async n => (await office({ type: 'admin-connect', node: n.id, method: 'HTTPS' })).ok;

// ---- iSCSI array, two independent Ethernet fabrics, one ESXi host --------------------------------
const array = install('me5024iscsi', { racks: ['R04', 'R03'] }), srv = install('r660', { racks: ['R04', 'R03'] });
const swA = install('dells5248', { racks: ['R04', 'R03'] }), swB = install('dells5248', { racks: ['R04', 'R03'] });
manage(array); manage(srv);
assert.match(device(array, 'pool', { id: 'POOL-A', sizeGiB: 10000, protection: 'RAID 6' }), /initial setup/, 'data plane waits for the initial array setup');
assert.match(product(array, 'identity', { name: 'ME5-LAB', passwordChanged: true }), /^Applied/);
assert.match(product(array, 'management', { ip: '10.10.70.191', nodeA: '10.10.70.191', nodeB: '10.10.70.192', prefix: 24, vlan: 70, gateway: '10.10.70.1', ssh: true }), /^Applied/);
assert.match(product(srv, 'management', { ip: '10.10.70.193', prefix: 24, vlan: 70, gateway: '10.10.70.1', ssh: true }), /^Applied/);
assert(await gui(array), 'array management GUI reachable');
// Pool protection → usable capacity; family-specific protection choices.
assert.match(device(array, 'pool', { id: 'POOL-A', sizeGiB: 10000, protection: 'Double drive' }), /not offered/);
assert.match(device(array, 'pool', { id: 'POOL-A', sizeGiB: 10000, protection: 'RAID 10' }), /^Applied/);
assert.match(device(array, 'volume', { id: 'BIG', pool: 'POOL-A', sizeGiB: 6000, protocol: 'iSCSI' }), /Insufficient pool capacity \(RAID 10 usable 5000/);
assert.match(device(array, 'pool', { id: 'POOL-A', sizeGiB: 10000, protection: 'RAID 6' }), /^Applied/);
assert.match(device(array, 'volume', { id: 'FC-VOL', pool: 'POOL-A', sizeGiB: 100, protocol: 'FC' }), /not supported/, 'iSCSI controller SKU rejects FC volumes');
// Host initiator and array data ports (A: VLAN 3000, B: VLAN 3001, jumbo MTU).
const ids = hostIdentifiers(srv), hostCfg = { os: 'VMware ESXi', raid: 'RAID 1 boot', protocol: 'iSCSI', portA: 'NIC-1', portB: 'NIC-2', ipA: '172.16.10.10', ipB: '172.16.11.10', prefix: 24, vlanA: 3000, vlanB: 3001, mtu: 9000, iqn: ids.iqn, wwpnA: ids.wwpnA, wwpnB: ids.wwpnB, initiatorEnabled: true };
assert.match(product(srv, 'host', hostCfg), /^Applied/);
assert.match(device(array, 'host-register', { id: srv.id, initiator: ids.wwpnA }), /no FC host ports/, 'WWPN cannot register on an iSCSI-only array');
assert.match(product(array, 'storage', { ...hostCfg, ipA: '172.16.10.20', ipB: '172.16.11.20', mode: 'Virtual', raid: 'RAID 6', pool: 'POOL-A', volume: 'DATA-01', sizeGiB: 2000, host: srv.id, initiator: ids.iqn }), /^Applied/);
const vis = () => net.volumeAccess(array, 'DATA-01', srv);
assert.equal(vis().state, 'unavailable'); assert.match(vis().reason, /Path A: array port .* has no cable/);
// Physical A/B fabrics.
const la = [cable(array, 'NIC-1', swA, free(swA, 25), 'fiber', 40), cable(srv, 'NIC-1', swA, free(swA, 25), 'fiber', 40)];
const lb = [cable(array, 'NIC-2', swB, free(swB, 25), 'fiber', 40), cable(srv, 'NIC-2', swB, free(swB, 25), 'fiber', 40)];
assert.equal(vis().state, 'unavailable', 'cables alone are not enough'); assert.match(vis().reason, /does not carry VLAN 3000|MTU/);
assert(await gui(array), 'management reachable while the host cannot see the volume');
const fabric = (sw, vlan) => { config({ type: 'vlan', node: sw.id, id: vlan, name: 'ISCSI' }); for (const l of sw === swA ? la : lb) { const i = sw.ports.indexOf(l.a === sw.id ? l.pa : l.pb); config({ type: 'port', node: sw.id, index: i, value: { mode: 'access', access: vlan, mtu: 9000 } }); } };
fabric(swA, 3000); assert.equal(vis().state, 'degraded'); assert.match(vis().reason, /Path B/);
fabric(swB, 3001); assert.equal(vis().state, 'healthy', vis().reason);
assert.deepEqual(net.hostVolumes(srv).map(x => [x.volume, x.state]), [['DATA-01', 'healthy']]);
console.log('  host sees DATA-01 · ' + vis().reason);
// Hypervisor, shared datastore, VM and web service that depend on the volume.
assert.match(device(srv, 'os', { os: 'VMware ESXi', raid: 'RAID 1 boot' }), /^Applied/); deviceRuntime(srv).install.until = 0;
// VM traffic: host DATA-1 (100G) → ToR swA 100G port → swA 25G uplink → core switch, all trunking VLAN 50.
const core = a.byId[s().bindings.access[1]], officePorts = new Set(Object.values(s().pcs).filter(p => p.floor === 1).map(p => p.port)), cp = core.ports.findIndex((p, i) => !p.link && !p.service && !p.reserved && p.speed === 25 && p.medium === 'Ethernet' && !officePorts.has(i));
config({ type: 'vlan', node: swA.id, id: 50, name: 'SERVERS' });
const tor = cable(srv, 'DATA-1', swA, free(swA, 100), 'fiber', 40), up = cable(swA, free(swA, 25), core, cp, 'fiber', 40);
for (const [n, l] of [[swA, tor], [swA, up], [core, up]]) config({ type: 'port', node: n.id, index: n.ports.indexOf(l.a === n.id ? l.pa : l.pb), value: { mode: 'trunk', allowed: [50] } });
const uplink = String(srv.ports.findIndex(p => p.name === 'DATA-1'));
assert.match(device(srv, 'portgroup', { id: 'Servers', vlan: 50, uplinks: uplink }), /^Applied/);
assert.match(device(srv, 'datastore', { id: 'Shared-01', array: array.id, volume: 'DATA-01' }), /^Applied/);
assert.match(device(srv, 'vm', { id: 'APP-01', os: 'Linux', cpu: 2, memory: 4, disk: 100, datastore: 'Shared-01', network: 'Servers', ip: '10.10.50.41', prefix: 24, gateway: '10.10.50.1', dns: '10.10.70.1' }), /^Applied/);
device(srv, 'vm-power', { id: 'APP-01', action: 'start', on: true });
device(srv, 'service', { vm: 'APP-01', id: 'app', kind: 'web', engine: 'Nginx', port: 443, content: 'Storage-backed app', groups: 'company', running: true, firewall: true });
await office({ type: 'configure', page: 'dns', value: { id: 'app.company.test', ip: '10.10.50.41', enabled: true } });
await office({ type: 'login', user: 'finance', pc: 'F1-finance-PC', password: 'OfficeLab19!' });
const browse = () => office({ type: 'browse', pc: 'F1-finance-PC', url: 'https://app.company.test' });
assert((await browse()).ok, 'service on the SAN-backed VM');
// Objective 5 (storage contract) and monitoring read the same state.
await office({ type: 'configure', page: 'storage', value: { device: array.id, protocol: 'iSCSI', capacity: 100000, used: 0, snapshots: true } });
await office({ type: 'snapshot' });
const chapter5 = () => o.objectives()[4], health = () => net.serviceHealth(), opsAlerts = () => op.alerts(), officeAlerts = () => o.alerts();
assert(chapter5().ok, chapter5().detail); assert.match(chapter5().detail, /two independent paths/);
assert(!health().some(x => x.device === array.id), 'no storage alerts while healthy');
// Failover: one path down → degraded but usable; both down → unavailable; restore → healthy.
h.unplug(la[0]); await new Promise(r => setTimeout(r, 0));
assert.equal(vis().state, 'degraded'); assert.match(vis().reason, /Path A: cable .* is unplugged/); console.log('  path A cut · ' + vis().reason);
assert((await browse()).ok, 'service survives a single path failure'); assert.match(net.vmState(srv, deviceRuntime(srv).vms['APP-01']).reason, /degraded/);
{ const vol = health().find(x => x.kind === 'storage' && x.device === array.id); assert.equal(vol.severity, 'warning'); assert.match(vol.message, /DATA-01 .* degraded/); assert.match(vol.impact, /Shared-01.*APP-01/); console.log('  monitoring · ' + vol.severity + ' · ' + vol.message + ' · impact: ' + vol.impact);
  assert(!opsAlerts().some(x => /DATA-01/.test(x.text)), 'degraded is a warning, not an outage'); assert(officeAlerts().some(x => /DATA-01/.test(x.message)), 'office monitoring shows the degraded path');
  assert(!chapter5().ok); assert.match(chapter5().detail, /Degraded · .*Path A/); console.log('  objective · ' + chapter5().detail); }
h.unplug(lb[1]);
assert.equal(vis().state, 'unavailable');
assert(opsAlerts().some(x => x.device === array.id && /DATA-01 .* unavailable/.test(x.text)), 'critical storage alert in the NOC'); assert(opsAlerts().some(x => x.device === srv.id && /VM APP-01 is not running/.test(x.text)), 'dependent VM alert');
const down = await browse(); assert(!down.ok); assert.equal(h.failedStep(down).name, 'Virtual machine and datastore'); assert.match(down.reason, /Datastore Shared-01 unavailable/); console.log('  both paths cut · ' + down.reason);
h.replug(la[0]); h.replug(lb[1]); assert.equal(vis().state, 'healthy'); assert((await browse()).ok, 'recovered');
assert(!health().some(x => x.device === array.id || x.device === srv.id), 'alerts clear after repair'); assert(chapter5().ok, 'storage contract verified again');
// A wrong iSCSI VLAN on one fabric names the port; fixing it restores redundancy.
const swPort = swA.ports.indexOf(la[1].a === swA.id ? la[1].pa : la[1].pb);
config({ type: 'port', node: swA.id, index: swPort, value: { access: 3999 } }); config({ type: 'vlan', node: swA.id, id: 3999 });
assert.equal(vis().state, 'degraded'); assert.match(vis().reason, /Path A: link .* is down \(VLAN mismatch access 3000 ↔ access 3999\)/); console.log('  wrong VLAN · ' + vis().reason);
config({ type: 'port', node: swA.id, index: swPort, value: { access: 3000 } }); assert.equal(vis().state, 'healthy');
// Two paths through ONE switch are one failure domain.
h.unplug(lb[0]); h.unplug(lb[1]); config({ type: 'vlan', node: swA.id, id: 3001, name: 'ISCSI-B' });
const extra = [cable(array, 'NIC-2', swA, free(swA, 25), 'fiber', 40), cable(srv, 'NIC-2', swA, free(swA, 25), 'fiber', 40)];
for (const l of extra) config({ type: 'port', node: swA.id, index: swA.ports.indexOf(l.a === swA.id ? l.pa : l.pb), value: { mode: 'access', access: 3001, mtu: 9000 } });
assert.equal(vis().state, 'degraded'); assert.match(vis().reason, /one switch is one failure domain/); console.log('  shared switch · ' + vis().reason);
for (const l of extra) h.unplug(l); h.replug(lb[0]); h.replug(lb[1]); assert.equal(vis().state, 'healthy');
// Masking, host groups, read-only, resize and delete rules on a second volume.
assert.match(device(array, 'volume', { id: 'LOGS', pool: 'POOL-A', sizeGiB: 500, protocol: 'iSCSI' }), /^Applied/);
assert.equal(net.volumeAccess(array, 'LOGS', srv).state, 'unavailable'); assert.match(net.volumeAccess(array, 'LOGS', srv).reason, /not mapped/);
assert.match(device(array, 'host-group', { id: 'ESX-CLUSTER', hosts: srv.id }), /^Applied/);
assert.match(device(array, 'volume', { id: 'LOGS', pool: 'POOL-A', sizeGiB: 500, protocol: 'iSCSI', group: 'ESX-CLUSTER', access: 'read-only' }), /^Applied/);
assert.equal(net.volumeAccess(array, 'LOGS', srv).state, 'healthy'); assert.equal(net.volumeAccess(array, 'LOGS', srv).access, 'read-only');
assert.match(device(srv, 'datastore', { id: 'Logs-DS', array: array.id, volume: 'LOGS' }), /read-only/);
assert.match(device(array, 'volume', { id: 'LOGS', pool: 'POOL-A', sizeGiB: 400, protocol: 'iSCSI', group: 'ESX-CLUSTER' }), /cannot be shrunk/);
assert.match(device(array, 'volume-resize', { id: 'LOGS', sizeGiB: 750 }), /^Applied/); assert.equal(deviceRuntime(array).volumes.LOGS.sizeGiB, 750);
assert.match(device(array, 'volume-resize', { id: 'LOGS', sizeGiB: 60000 }), /Insufficient pool capacity/);
assert.match(device(array, 'delete', { table: 'volumes', id: 'LOGS' }), /Unmap the volume/);
assert.match(device(array, 'volume', { id: 'LOGS', pool: 'POOL-A', sizeGiB: 750, protocol: 'iSCSI' }), /^Applied/);
assert.match(device(array, 'delete', { table: 'volumes', id: 'LOGS' }), /^Applied/);
assert.match(device(array, 'delete', { table: 'volumes', id: 'DATA-01' }), /Detach the host datastore/);

// ---- FC array through the existing SAN-A / SAN-B fabrics: zoning and masking ------------------
const fcArray = install('me5024fc', { racks: ['R04', 'R03', 'R01'] }), fcHost = install('r760', { racks: ['R04', 'R03', 'R01'] });
assert.match(product(fcArray, 'identity', { name: 'ME5-FC', passwordChanged: true }), /^Applied/);
const fid = hostIdentifiers(fcHost), target = hostIdentifiers(fcArray), fcCfg = { os: 'Linux', raid: 'RAID 1 boot', protocol: 'FC', portA: 'HBA-A', portB: 'HBA-B', mtu: 1500, iqn: fid.iqn, wwpnA: fid.wwpnA, wwpnB: fid.wwpnB, initiatorEnabled: true };
assert.match(product(fcHost, 'host', fcCfg), /^Applied/);
assert.match(device(fcArray, 'host-register', { id: fcHost.id, initiator: fid.iqn }), /no iSCSI host ports/, 'IQN cannot register on an FC-only array');
assert.match(product(fcArray, 'storage', { ...fcCfg, mode: 'Linear', raid: 'ADAPT', pool: 'FC-POOL', volume: 'FC-01', sizeGiB: 1000, host: fcHost.id, initiator: fid.wwpnA }), /^Applied/);
const sanA = a.byId['SAN-A'], sanB = a.byId['SAN-B'], fvis = () => net.volumeAccess(fcArray, 'FC-01', fcHost);
for (const [san, side] of [[sanA, 'A'], [sanB, 'B']]) { cable(fcArray, 'HBA-' + side, san, free(san, 32, 'Fibre Channel'), 'fc', 40); cable(fcHost, 'HBA-' + side, san, free(san, 32, 'Fibre Channel'), 'fc', 40); }
assert.equal(fvis().state, 'unavailable'); assert.match(fvis().reason, /Path A: fabric SAN-A has no enabled zoning/); console.log('  FC without zoning · ' + fvis().reason);
const zone = (san, side, members) => product(san, 'fabric', { aliases: { host: [fid['wwpn' + side]], target: [target['wwpn' + side]] }, zones: { z: ['host', 'target'] }, configs: { prod: ['z'] }, members, enabled: true, active: 'prod' });
assert.match(zone(sanA, 'A', [fid.wwpnA]), /^Applied/); assert.match(fvis().reason, /zone on SAN-A is missing/);
assert.match(zone(sanA, 'A', [fid.wwpnA, target.wwpnA]), /^Applied/); assert.equal(fvis().state, 'degraded');
assert.match(zone(sanB, 'B', [fid.wwpnB, target.wwpnB]), /^Applied/); assert.equal(fvis().state, 'healthy', fvis().reason);
assert.match(device(fcArray, 'volume', { id: 'FC-01', pool: 'FC-POOL', sizeGiB: 1000, protocol: 'FC', host: '' }), /^Applied/);
assert.match(fvis().reason, /not mapped/, 'masking removed'); assert.match(device(fcArray, 'volume', { id: 'FC-01', pool: 'FC-POOL', sizeGiB: 1000, protocol: 'FC', host: fcHost.id }), /^Applied/); assert.equal(fvis().state, 'healthy');
// Persistence: volumes, mappings, host groups, datastores, VM and paths survive save/reload.
const saved = w.snapshot(); w.restore(saved);
assert.equal(net.volumeAccess(a.byId[array.id], 'DATA-01', a.byId[srv.id]).state, 'healthy'); assert.equal(net.volumeAccess(a.byId[fcArray.id], 'FC-01', a.byId[fcHost.id]).state, 'healthy');
assert((await browse()).ok, 'service after reload');
console.log('PASS: P1 storage exercise · initial setup gate, RAID usable capacity, SKU transport limits, iSCSI A/B VLAN/MTU fabrics, shared-switch detection, degraded→unavailable→healthy failover with VM/service impact, masking, host groups, read-only, resize/shrink/delete rules, FC zoning, persistence.');
process.exit(0);
