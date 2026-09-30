// Cross-device end-to-end chains, each read through the device logic of every hop:
//   1. Internet: provider router → FortiGate → switch → PC (plus a CPE outage seen at every hop)
//   2. Web service: server → VM → web service → DNS → Finance PC (listener fault seen on server + PC)
//   3. SAN: array → SAN-A / SAN-B → host → datastore → VM, with controller A failover
//   4. Wi-Fi: AP → SSID → VLAN → Internet
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
import { helpers } from './build-helpers.mjs';
import { builder } from '../dist/scenarios.js';
import { deviceRuntime } from '../dist/device-runtime.js';
import { hostIdentifiers } from '../dist/storage-access.js';
const h = helpers(a), { w, office, config, install, engineering, device, product, op } = h, o = w.office, s = () => o.state, net = a.lab.kit.network, L = net.logic;
const noCritical = n => !L.checks(n).some(c => !c.ok && c.severity === 'critical');

// ---- 1. Internet from an empty enterprise campaign --------------------------------------------
engineering({ type: 'mode', mode: 'campaign', enterprise: true });
const sw = install('fs148f', { racks: ['R01'] }), fw = install('fg200f', { racks: ['R02'] });
for (const cmd of ['config system interface', 'edit mgmt', 'set ip 10.10.70.8/24', 'set allowaccess ping https ssh', 'next', 'end']) await net.command(cmd, { node: sw, config: false });
await office({ type: 'login', user: 'itadmin', password: 'OfficeLab19!' });
await office({ type: 'configure', page: 'binding', value: { access: sw.id, firewall: fw.id, floor: 1, port: 0, fwPort: 0 } });
await office({ type: 'configure', page: 'interfaces', value: { id: 10, name: 'SALES', ip: '10.10.10.1', prefix: 24, enabled: true, zone: 'staff', mtu: 1500 } });
config({ type: 'vlan', node: sw.id, id: 10 }); for (const n of [sw, fw]) config({ type: 'port', node: n.id, index: 0, value: { mode: 'trunk', allowed: [1, 10] } });
await office({ type: 'configure', page: 'dhcp', value: { id: 10, enabled: true, start: 100, end: 199, gateway: '10.10.10.1', dns: '10.10.10.1', lease: 3600 } });
await office({ type: 'patch-pc', id: 'F1-sales-PC', port: 1 }); await office({ type: 'configure', page: 'switching', value: { ...s().ports['F1-sales-PC'], id: 'F1-sales-PC', vlan: 10, trunk: '10' } });
await office({ type: 'configure', page: 'wan', value: { port: 'port3', mode: 'static', connected: true, defaultRoute: true, dnsForward: true } });
await office({ type: 'configure', page: 'policies', value: { id: 'sales-out', src: '10', dst: 'wan', source: 'any', destination: 'any', service: 'any', action: 'accept', nat: true, enabled: true, start: 0, end: 24 } });
product(fw, 'identity', { name: 'FGT-HQ', passwordChanged: true });
const cpe = h.installISP(fw, 'port3', { racks: ['R03'] }); L.invalidate();
await office({ type: 'login', user: 'sales', pc: 'F1-sales-PC', password: 'OfficeLab19!' });
const cmd = async c => (await office({ type: 'probe', tool: 'cmd', pc: 'F1-sales-PC', command: c })).output;
assert((await office({ type: 'browse', pc: 'F1-sales-PC', url: 'https://example.test' })).ok, 'Sales PC on the Internet');
assert(L.checks(cpe).every(c => c.ok), 'CPE healthy'); assert.equal(L.leds(cpe).front.find(x => x.id === 'SERVICE').color, 'green');
assert(!L.checks(fw).some(c => !c.ok && c.severity === 'critical' && c.layer !== 'management'), 'FortiGate path checks pass'); assert(noCritical(sw) || L.first(sw).layer === 'management');
assert(net.logic.state(sw).ports.some(p => p.state === 'up'), 'switch uplink up');
assert.match(await cmd('tracert example.test'), /10\.10\.10\.1\n\s+2\s+4 ms .*203\.0\.113\.\d+\n\s+3 .*198\.51\.100\.20/);
assert.match(await net.command('diagnose debug flow F1-sales-PC https://example.test', { node: fw }), /Allowed by Policy-sales-out: SNAT/);
// Provider router loses power: every hop shows its own view of the same fault.
engineering({ type: 'power', node: cpe.id, psu: 0, feed: null }); engineering({ type: 'drop', id: op.game.stock.find(x => x.holders.includes('ENGINEER-01')).id, position: { x: -38, z: 14 } }); L.invalidate();
assert.equal(L.first(cpe).id, 'power-input'); assert.equal(L.leds(cpe).front.find(x => x.id === 'PWR').color, 'off');
assert.match(L.checks(fw).find(c => c.id === 'wan-link').detail, /Provider router .* has no power/);
assert.match(await cmd('tracert example.test'), /2\s+\*\s+\*\s+\*\s+Request timed out\. \(DNS resolver: DNS forwarder cannot reach the ISP resolver · FortiGate WAN interface: Provider router/);
assert(L.alarms().some(x => x.device === cpe.id) && L.alarms().some(x => x.device === fw.id && x.check === 'wan-link'));
engineering({ type: 'power', id: h.buy('power').id, node: cpe.id, psu: 0, feed: 'A' }); cpe.physical.bootUntil = 1; op.tick(); L.invalidate();
assert((await office({ type: 'browse', pc: 'F1-sales-PC', url: 'https://example.test' })).ok, 'Internet back');
console.log('  1 Internet: CPE → FortiGate → switch → PC · outage visible on CPE LEDs, FortiGate checks, PC tracert and alarms');

// ---- 2. Web service in Free Play: server → VM → service → DNS → Finance PC -----------------------
engineering({ type: 'mode', mode: 'free' }); L.invalidate();
const b = builder(w, a.byId, 'ENGINEER-01'), core = a.byId[s().bindings.access[1]];
const srv = b.install('r660'); b.manage(srv, true);
const cp = core.ports.findIndex((p, i) => !p.link && !p.service && !p.reserved && p.speed === 25 && !Object.values(s().pcs).some(x => x.port === i) && !Object.values(s().aps).some(x => x.port === i));
b.cable(srv, 'NIC-1', core, cp, 'fiber'); config({ type: 'port', node: core.id, index: cp, value: { mode: 'trunk', allowed: [50] } });
device(srv, 'os', { os: 'VMware ESXi', raid: 'RAID 1 boot' }); deviceRuntime(srv).install.until = 0; deviceRuntime(srv);
device(srv, 'portgroup', { id: 'Servers', vlan: 50, uplinks: String(srv.ports.findIndex(p => p.name === 'NIC-1')) });
device(srv, 'vm', { id: 'WEB-02', os: 'Linux', cpu: 2, memory: 4, disk: 40, datastore: 'local', network: 'Servers', ip: '10.10.50.31', prefix: 24, gateway: '10.10.50.1', dns: '10.10.70.1' });
device(srv, 'vm-power', { id: 'WEB-02', on: true });
device(srv, 'service', { vm: 'WEB-02', id: 'portal', kind: 'web', engine: 'Nginx', port: 443, content: 'Portal', groups: 'company', running: true, firewall: true });
await office({ type: 'login', user: 'itadmin', password: 'OfficeLab19!' }); await office({ type: 'configure', page: 'dns', value: { id: 'portal.company.test', ip: '10.10.50.31', enabled: true } });
await office({ type: 'login', user: 'finance', pc: 'F1-finance-PC', password: 'OfficeLab19!' });
const fin = async c => (await office({ type: 'probe', tool: 'cmd', pc: 'F1-finance-PC', command: c })).output;
{ const r = await office({ type: 'browse', pc: 'F1-finance-PC', url: 'https://portal.company.test' }); assert(r.ok, r.reason); }
L.invalidate(); assert(noCritical(srv), JSON.stringify(L.checks(srv).filter(c => !c.ok)));
assert.match(await fin('nslookup portal.company.test'), /Address:\s+10\.10\.50\.31/); assert.match(await fin('ping portal.company.test'), /Lost = 4 \(100% loss\),\n\(Firewall policy: Firewall implicit deny\)/, 'policy web20 allows HTTPS only: ICMP is denied, consistent with the evaluator');
assert(L.state(core).ports.length && (await net.command('show mac address-table', { node: core })).includes('00:50:56:'), 'VM MAC learned on the core');
device(srv, 'service', { vm: 'WEB-02', id: 'portal', kind: 'web', engine: 'Nginx', port: 443, content: 'Portal', groups: 'company', running: false, firewall: true }); L.invalidate();
assert.equal(L.first(srv).id, 'svc-portal'); assert.match((await office({ type: 'browse', pc: 'F1-finance-PC', url: 'https://portal.company.test' })).reason, /Service portal on WEB-02 is stopped/);
assert(L.alarms().some(x => x.device === srv.id && x.check === 'svc-portal'));
device(srv, 'service', { vm: 'WEB-02', id: 'portal', kind: 'web', engine: 'Nginx', port: 443, content: 'Portal', groups: 'company', running: true, firewall: true });
assert((await office({ type: 'browse', pc: 'F1-finance-PC', url: 'https://portal.company.test' })).ok);
console.log('  2 Web: server → VM → web → DNS → Finance PC · stopped listener seen on the server checks, alarm and the PC');

// ---- 3. SAN: FC array → SAN-A/SAN-B → host → datastore → VM, controller A failover -------------
const arr = b.install('me5024fc'), host = b.install('r760'); b.manage(arr); b.manage(host, true);
product(arr, 'identity', { name: 'ME5-FC', passwordChanged: true });
const hid = hostIdentifiers(host), tid = hostIdentifiers(arr), fc = { os: 'Linux', raid: 'RAID 1 boot', protocol: 'FC', portA: 'HBA-A', portB: 'HBA-B', mtu: 1500, iqn: hid.iqn, wwpnA: hid.wwpnA, wwpnB: hid.wwpnB, initiatorEnabled: true };
product(host, 'host', fc); product(arr, 'storage', { ...fc, mode: 'Linear', raid: 'ADAPT', pool: 'FC-POOL', volume: 'FC-01', sizeGiB: 1000, host: host.id, initiator: hid.wwpnA });
for (const side of ['A', 'B']) { const sanSw = a.byId['SAN-' + side], free = sanSw.ports.map((p, i) => i).filter(i => !sanSw.ports[i].link && sanSw.ports[i].medium === 'Fibre Channel'); b.cable(host, 'HBA-' + side, sanSw, free[0], 'fc'); b.cable(arr, 'HBA-' + side, sanSw, free[1], 'fc'); const c = { node: sanSw, mode: 'SERIAL CONSOLE' }; for (const x of ['alicreate "h_' + side + '","' + hid['wwpn' + side] + '"', 'alicreate "t_' + side + '","' + tid['wwpn' + side] + '"', 'zonecreate "z_' + side + '","h_' + side + ';t_' + side + '"', 'cfgcreate "cfg_' + side + '","z_' + side + '"', 'cfgenable "cfg_' + side + '"']) await net.command(x, c); }
const vol = () => net.volumeAccess(arr, 'FC-01', host); assert.equal(vol().state, 'healthy', vol().reason);
device(host, 'os', { os: 'VMware ESXi', raid: 'RAID 1 boot' }); deviceRuntime(host).install.until = 0; deviceRuntime(host);
device(host, 'portgroup', { id: 'Lab', vlan: 1, uplinks: String(host.ports.findIndex(p => p.name === 'NIC-1')) });
device(host, 'datastore', { id: 'SAN-DS', array: arr.id, volume: 'FC-01' });
device(host, 'vm', { id: 'DB-01', os: 'Linux', cpu: 4, memory: 16, disk: 200, datastore: 'SAN-DS', network: 'Lab' }); device(host, 'vm-power', { id: 'DB-01', on: true });
assert.match(net.vmState(host, deviceRuntime(host).vms['DB-01']).reason, /No live uplink|Running/);
assert.match(await net.command('esxcli storage nmp path list', { node: host }), /path A: active \(I\/O\) · active\/optimized[\s\S]*path B: active · active\/non-optimized/);
engineering({ type: 'fault', fault: 'controller-a', node: arr.id }); L.invalidate();
assert.equal(vol().state, 'degraded'); assert.equal(vol().owner, 'B'); assert.match(vol().reason, /controller A has failed/);
assert.match(await net.command('esxcli storage nmp path list', { node: host }), /path A: dead[\s\S]*path B: active \(I\/O\) · active\/optimized/, 'host multipath fails over to controller B');
assert(L.checks(host).find(c => c.id === 'lun-FC-01' && !c.ok && c.severity === 'warning'), 'host reports the degraded LUN');
assert.match(await net.command('nsshow', { node: a.byId['SAN-B'] }), new RegExp(tid.wwpnB), 'fabric B still sees the array');
engineering({ type: 'repair', id: h.buy('controller').id, node: arr.id }); L.invalidate(); assert.equal(vol().state, 'healthy'); assert.equal(vol().owner, 'A');
console.log('  3 SAN: array → SAN-A/B → host → datastore → VM · controller A failover to B and back');

// ---- 4. Wi-Fi: AP → SSID → VLAN → Internet ---------------------------------------------------------
await office({ type: 'login', user: 'engineering', pc: 'F1-engineering-PC', password: 'OfficeLab19!' });
await office({ type: 'pc', id: 'F1-engineering-PC', op: 'connect', mode: 'Wi-Fi', ssid: 'Corporate-engineering', password: 'OfficeLab19!' });
const eng = async c => (await office({ type: 'probe', tool: 'cmd', pc: 'F1-engineering-PC', command: c })).output;
assert((await office({ type: 'browse', pc: 'F1-engineering-PC', url: 'https://example.test' })).ok);
const ap = L.ap(o.access(s().pcs['F1-engineering-PC']).ap); assert.equal(ap.status, 'Online'); assert(ap.clients.includes('F1-engineering-PC'));
assert.match(await eng('ipconfig /all'), /Wireless LAN adapter Wi-Fi:[\s\S]*IPv4 Address.*10\.10\.30\.\d+/, 'client DHCP in the SSID VLAN 30');
assert.match(await net.command('execute dhcp lease-list', { node: a.byId[s().bindings.firewall] }), /F1-engineering-PC\s+VLAN30/);
assert.match(await eng('tracert example.test'), /Trace complete/);
console.log('PASS: e2e cross-device · Internet (CPE → FortiGate → switch → PC), web service (server → VM → web → DNS → Finance PC), SAN (array → SAN-A/B → host → datastore → VM with controller failover), Wi-Fi (AP → SSID → VLAN → Internet), each hop read through its device logic.');
process.exit(0);
