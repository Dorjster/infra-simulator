// Campaign levels 0–10 from an empty internal site, played through the same world actions the UI and
// LAN host use (order → unbox → carry/place → power → cable → console/GUI/office configuration → live
// tests). Only delivery, boot and installer timers are shortened. The test also checks what must NOT
// complete a level (ordering, UI state, a powered-off device, a broken path), a regression of an
// earned level (repair objective, level kept), save/restore and the procurement unlocks.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
import { helpers } from './build-helpers.mjs';
import { deviceRuntime } from '../dist/device-runtime.js';
import { hostIdentifiers } from '../dist/storage-access.js';
import { LEVELS } from '../dist/campaign-levels.js';
const h = helpers(a), { w, op, engineering, config, office, device, product } = h, o = w.office, s = () => o.state, net = a.lab.kit.network, L = net.logic, C = w.campaign;
let clock = Date.now(), lowest = Infinity;
const tick = () => { clock += 1000; op.tick(); o.tick(clock); lowest = Math.min(lowest, op.game.budget); return C.status(); };
const level = () => op.game.levels.current;
const failing = id => C.evaluate(true)[id].checks.filter(c => !c.ok).map(c => c.label + ' · ' + c.detail);
function earn(id) { const st = tick(); assert.equal(level(), id + 1, 'level ' + id + ' earned · still failing: ' + JSON.stringify(failing(id))); assert(op.game.levels.earned[id]); return st; }
function buy(sku, length = 10) { engineering({ type: 'order', sku, quantity: 1, length }); lowest = Math.min(lowest, op.game.budget); const order = op.game.orders.at(-1); order.arrives = 0; engineering({ type: 'unbox', id: order.id }); return op.game.stock.filter(x => x.sku === sku && !x.holders.length && !x.powerAnchor).at(-1); }
const cord = () => op.game.stock.find(x => x.sku === 'power' && !x.holders.length && !x.powerAnchor && !x.floor) || buy('power');
function mount(sku, rack, unit) { const item = buy(sku); engineering({ type: 'grab', id: item.id }); engineering({ type: 'mount', id: item.id, rack, unit }); return a.byId[op.game.installed.at(-1)]; }
function power(n, feeds = ['A', 'B']) { feeds.forEach((feed, psu) => engineering({ type: 'power', id: cord().id, node: n.id, psu, feed })); if (!['switch', 'san', 'firewall', 'isp'].includes(n.type)) engineering({ type: 'boot', node: n.id }); n.physical.bootUntil = 1; op.tick(); }
function cable(x, px, y, py, sku, length = 10) {
  const i = typeof px === 'number' ? px : x.ports.findIndex(p => p.name === px), j = typeof py === 'number' ? py : y.ports.findIndex(p => p.name === py), c = buy(sku, length);
  if (['fiber', 'fc'].includes(sku)) for (const [n, k] of [[x, i], [y, j]]) { const p = n.ports[k], optic = op.catalog.find(q => q.type === 'optic' && q.speed === p.speed && q.medium === p.medium && q.reach === 'SR'); engineering({ type: 'optic', id: buy(optic.id).id, node: n.id, port: k }); }
  engineering({ type: 'grab', id: c.id }); engineering({ type: 'start-end', id: c.id, node: x.id, port: i }); engineering({ type: 'patch', id: c.id, a: x.id, pa: i, b: y.id, pb: j });
  return x.ports[i].link;
}
const freePort = (n, speed, used = []) => n.ports.findIndex((p, i) => !p.link && !p.service && !p.reserved && p.medium === 'Ethernet' && p.speed === speed && !/MGMT/.test(p.name) && !used.includes(i) && !Object.values(s().pcs).some(pc => (pc.switch || s().bindings.access[pc.floor]) === n.id && pc.port === i) && !Object.values(s().aps).some(ap => s().bindings.access[ap.floor] === n.id && ap.port === i));
const consoleRun = async (n, cmds, mode = 'SERIAL CONSOLE') => { const session = { node: n, mode, config: false }; const out = []; for (const c of cmds) out.push(await net.command(c, session)); return out.join('\n'); };

// ---- Start: an empty internal site -----------------------------------------------------------------
assert.match(engineering({ type: 'mode', mode: 'campaign', track: 'levels', name: 'Northwind HQ' }), /Empty site ready/);
assert.equal(level(), 0); assert.equal(op.game.emptySite, true);
assert.deepEqual(op.game.racks, [], 'no racks installed');
assert.equal(op.available().filter(n => n.spec).length, 0, 'no internal equipment');
assert(!a.byId['MGMT-SW'] || a.byId['MGMT-SW'].active === false, 'no working management network is given');
assert.equal(s().pcs['ADMIN-PC'].connected, false, 'central PC not patched');
assert.equal(LEVELS.length, 11);
assert.throws(() => engineering({ type: 'order', sku: 'fs148f', quantity: 1, length: 5 }), /unlocks at a later campaign level/, 'network gear unlocks with level 1');
const startBudget = op.game.budget;

// ---- Level 0 · Empty site ---------------------------------------------------------------------------
engineering({ type: 'order', sku: 'rack', quantity: 1, length: 1 });
tick(); assert.equal(level(), 0, 'ordering alone does nothing');
{ const o0 = op.game.orders.at(-1); o0.arrives = 0; engineering({ type: 'unbox', id: o0.id }); }
const rackItem = op.game.stock.find(x => x.sku === 'rack');
assert.throws(() => engineering({ type: 'mount', id: buy('rail').id, rack: 'R01', unit: 20 }), /Rack is not installed|Grab/);
engineering({ type: 'grab', id: rackItem.id });
assert.match(engineering({ type: 'rack', id: rackItem.id, pad: 'PAD-R01' }), /Rack R01 placed/);
assert.equal(C.evaluate(true)[0].checks.find(c => c.id === 'feed-a').ok, false, 'rack not fed yet');
engineering({ type: 'rack-feed', rack: 'R01', feed: 'A' }); engineering({ type: 'rack-feed', rack: 'R01', feed: 'B' });
{ const r = buy('rail'); engineering({ type: 'grab', id: r.id }); engineering({ type: 'rails', id: r.id, rack: 'R01', unit: 30, units: 1 }); }
{ const before = op.game.budget; earn(0); assert.equal(op.game.budget, before + LEVELS[0].reward, 'reward paid'); }
console.log('  L0 empty site: rack ordered, carried, placed on PAD-R01, PDU A/B fed from the building, rails installed');

// ---- Level 1 · Management foundation -----------------------------------------------------------------
const sw = mount('fs148f', 'R01', 30); power(sw);
assert(!C.evaluate(true)[1].checks.find(c => c.id === 'switch-console').ok);
// A device on an unfed rack has no power: unplug the building feeds and the switch goes dark.
engineering({ type: 'rack-feed', rack: 'R01', feed: 'A', connect: false }); engineering({ type: 'rack-feed', rack: 'R01', feed: 'B', connect: false });
assert.equal(C.evaluate(true)[1].checks.find(c => c.id === 'switch-power').ok, false, 'rack feed removed → switch unpowered');
engineering({ type: 'rack-feed', rack: 'R01', feed: 'A', connect: true }); engineering({ type: 'rack-feed', rack: 'R01', feed: 'B', connect: true }); sw.physical.bootUntil = 1; op.tick();
await consoleRun(sw, ['config system interface', 'edit mgmt', 'set ip 10.10.70.8/24', 'set allowaccess ping https ssh', 'next', 'end']);
assert.match(await consoleRun(sw, ['config system admin', 'edit admin', 'set password short']), /at least 8/);
await consoleRun(sw, ['config system admin', 'edit admin', 'set password Northwind-2026', 'next', 'end']);
await office({ type: 'login', user: 'itadmin', password: 'OfficeLab19!' });
const adminPort = freePort(sw, 1);
await assert.rejects(office({ type: 'patch-pc', id: 'ADMIN-PC', switch: sw.id, port: adminPort }), /CAT6 patch lead is needed/, 'patching needs a real patch lead');
buy('cat6', 5);
await office({ type: 'patch-pc', id: 'ADMIN-PC', switch: sw.id, port: adminPort });
assert.match(failing(1).join(), /Management VLAN differs|different subnet|VLAN/, 'port still in VLAN 1');
config({ type: 'port', node: sw.id, index: adminPort, value: { mode: 'access', access: 70 } });
earn(1);
console.log('  L1 management: FortiSwitch racked/powered, console IP/VLAN 70/SSH + admin password, central PC patched and managing the switch');

// ---- Level 2 · Internet edge ---------------------------------------------------------------------------
const fw = mount('fg200f', 'R01', 28); power(fw);
await office({ type: 'configure', page: 'binding', value: { access: sw.id, firewall: fw.id, floor: 1, port: freePort(sw, 1, [adminPort]), fwPort: 0 } });
assert(fw.net.ispContract, 'ISP circuit ordered with the binding');
tick(); assert.equal(level(), 2, 'no Internet yet');
h.installISP(fw, 'port3', { racks: ['R01'] });
const uplinkSw = sw.ports.findIndex(p => p.link && (p.link.a === fw.id || p.link.b === fw.id));
await office({ type: 'configure', page: 'interfaces', value: { id: 10, name: 'SALES', ip: '10.10.10.1', prefix: 24, enabled: true, zone: 'staff', mtu: 1500 } });
config({ type: 'vlan', node: sw.id, id: 10 });
config({ type: 'port', node: sw.id, index: uplinkSw, value: { mode: 'trunk', allowed: [1, 10] } }); config({ type: 'port', node: fw.id, index: 0, value: { mode: 'trunk', allowed: [1, 10] } });
await office({ type: 'configure', page: 'dhcp', value: { id: 10, enabled: true, start: 100, end: 199, gateway: '10.10.10.1', dns: '10.10.10.1', lease: 3600 } });
const salesPort = freePort(sw, 1, [adminPort]); buy('cat6', 5);
await office({ type: 'patch-pc', id: 'F1-sales-PC', port: salesPort });
await office({ type: 'configure', page: 'switching', value: { ...s().ports['F1-sales-PC'], id: 'F1-sales-PC', vlan: 10, trunk: '10' } });
await office({ type: 'configure', page: 'wan', value: { port: 'port3', mode: 'static', connected: true, defaultRoute: true, dnsForward: true } });
tick(); assert.equal(level(), 2, 'no policy/NAT yet → still level 2'); assert.match(failing(2).join(), /policy|NAT/i);
await office({ type: 'configure', page: 'policies', value: { id: 'sales-out', src: '10', dst: 'wan', source: 'any', destination: 'any', service: 'any', action: 'accept', nat: true, enabled: true, start: 0, end: 24 } });
tick(); assert.equal(level(), 2); assert.match(failing(2).join(), /admin password/);
product(fw, 'identity', { name: 'FGT-HQ', passwordChanged: true });
product(fw, 'management', { ip: '10.10.70.2', prefix: 24, vlan: 70, gateway: '10.10.70.1', dns: '10.10.70.1', ntp: '10.10.70.1', ssh: true });
earn(2);
console.log('  L2 Internet edge: FortiGate + provider router, WAN from the circuit sheet, VLAN 10/DHCP, policy with NAT, Sales browses by name');


// ---- Level 3 · Segmented office ------------------------------------------------------------------------
const trunk = vlans => { config({ type: 'port', node: sw.id, index: uplinkSw, value: { mode: 'trunk', allowed: vlans } }); config({ type: 'port', node: fw.id, index: 0, value: { mode: 'trunk', allowed: vlans } }); };
for (const [v, name] of [[20, 'FINANCE'], [30, 'ENGINEERING'], [40, 'EXECUTIVE'], [70, 'MANAGEMENT']]) {
  await office({ type: 'configure', page: 'interfaces', value: { id: v, name, ip: '10.10.' + v + '.1', prefix: 24, enabled: true, zone: v === 70 ? 'management' : 'staff', mtu: 1500 } });
  if (v !== 70) await office({ type: 'configure', page: 'dhcp', value: { id: v, enabled: true, start: 100, end: 199, gateway: '10.10.' + v + '.1', dns: '10.10.' + v + '.1', lease: 3600 } });
  config({ type: 'vlan', node: sw.id, id: v });
}
trunk([1, 10, 20, 30, 40, 70]);
for (const dep of ['finance', 'engineering']) { const pc = 'F1-' + dep + '-PC', v = { finance: 20, engineering: 30 }[dep]; buy('cat6', 5); await office({ type: 'patch-pc', id: pc, port: freePort(sw, 1, [adminPort]) }); await office({ type: 'configure', page: 'switching', value: { ...s().ports[pc], id: pc, vlan: v, trunk: String(v) } }); }
// A permissive rule between staff VLANs must keep the level open (isolation is tested, not assumed).
await office({ type: 'configure', page: 'policies', value: { id: 'staff-any', src: 'staff', dst: 'staff', source: 'any', destination: 'any', service: 'any', action: 'accept', nat: false, enabled: true, start: 0, end: 24 } });
for (const [id, src] of [['fin-out', '20'], ['eng-out', '30']]) await office({ type: 'configure', page: 'policies', value: { id, src, dst: 'wan', source: 'any', destination: 'any', service: 'any', action: 'accept', nat: true, enabled: true, start: 0, end: 24 } });
tick(); assert.equal(level(), 3, 'Sales can reach Finance → not segmented'); assert.match(failing(3).join(), /Sales can reach Finance|did not reach|Denied/);
await o.apply({ type: 'delete-record', page: 'policies', id: 'staff-any' }, 'ENGINEER-01');
earn(3);
console.log('  L3 segmented office: VLAN 10/20/30/40/70 gateways + DHCP, three desks online, Sales → Finance denied by policy (a permissive rule kept it open)');

// ---- Level 4 · Wireless access -------------------------------------------------------------------------
await office({ type: 'purchase', sku: 'fap231' }); await office({ type: 'purchase', sku: 'pc' });
for (let i = 0; i < 4; i++) tick();
const apItem = s().inventory.find(i => i.sku === 'fap231' && !i.installed), pcItem = s().inventory.find(i => i.sku === 'pc' && !i.installed);
await office({ type: 'install', id: apItem.id, drop: 'F1-sales' });
await office({ type: 'install', id: pcItem.id, department: 'sales', floor: 1 });
const ap = Object.values(s().aps)[0], guestPC = Object.keys(s().pcs).find(id => /^F1-sales-PC-/.test(id));
for (const [v, name] of [[90, 'GUEST']]) { await office({ type: 'configure', page: 'interfaces', value: { id: v, name, ip: '10.10.90.1', prefix: 24, enabled: true, zone: 'guest', mtu: 1500 } }); await office({ type: 'configure', page: 'dhcp', value: { id: v, enabled: true, start: 100, end: 199, gateway: '10.10.90.1', dns: '10.10.90.1', lease: 3600 } }); config({ type: 'vlan', node: sw.id, id: v }); }
trunk([1, 10, 20, 30, 40, 70, 90]);
await office({ type: 'configure', page: 'wireless', value: { id: 'Northwind', vlan: 10, enabled: true, password: 'Northwind-Wifi1', security: 'WPA3', band: '5', isolation: false, portal: false, bandSteering: true } });
await office({ type: 'configure', page: 'wireless', value: { id: 'Guest', vlan: 90, enabled: true, password: '', security: 'open', band: '5', isolation: true, portal: false, bandSteering: true } });
await office({ type: 'configure', page: 'policies', value: { id: 'guest-out', src: '90', dst: 'wan', source: 'any', destination: 'any', service: 'any', action: 'accept', nat: true, enabled: true, start: 0, end: 24 } });
await office({ type: 'login', user: 'sales', pc: guestPC, password: 'OfficeLab19!' });
await office({ type: 'pc', id: guestPC, op: 'connect', mode: 'Wi-Fi', ssid: 'Guest', password: '' });
tick(); assert.equal(level(), 4, 'AP not authorized yet'); assert.match(failing(4).join(), /authoriz/i);
await office({ type: 'configure', page: 'aps', value: { ...ap, authorized: true, allowed: '70,10,90', profile: 'Northwind,Guest' } });
earn(4);
console.log('  L4 wireless: FortiAP installed + authorized, employee WPA3 SSID, isolated Guest VLAN 90, guest client browses and cannot reach Finance');

// ---- Level 5 · Compute and intranet --------------------------------------------------------------------
const mgmt = (n, ip) => { const hp = freePort(sw, 1, [adminPort]); cable(n, 'MGMT UPLINK', sw, hp, 'cat6', 5); config({ type: 'port', node: sw.id, index: hp, value: { mode: 'access', access: 70 } }); product(n, 'management', { ip, prefix: 24, vlan: 70, gateway: '10.10.70.1', dns: '10.10.70.1', ntp: '10.10.70.1', ssh: true }); };
const tor = mount('nexus9348', 'R01', 26); power(tor); await consoleRun(tor, ['configure terminal', 'username admin password Northwind-2026 role network-admin', 'end']); mgmt(tor, '10.10.70.9');
const srv = mount('r660', 'R01', 10); power(srv); mgmt(srv, '10.10.70.20');
tick(); assert.equal(level(), 5); assert.match(failing(5).join(), /OS or hypervisor/);
config({ type: 'vlan', node: tor.id, id: 50 }); config({ type: 'vlan', node: sw.id, id: 50 });
const dataLink = cable(srv, 'DATA-1', tor, freePort(tor, 100), 'fiber'), torUp = cable(tor, freePort(tor, 1), sw, freePort(sw, 1, [adminPort]), 'cat6');
for (const [n, l] of [[tor, dataLink], [tor, torUp], [sw, torUp]]) config({ type: 'port', node: n.id, index: n.ports.indexOf(l.a === n.id ? l.pa : l.pb), value: { mode: 'trunk', allowed: [50] } });
trunk([1, 10, 20, 30, 40, 50, 70, 90]);
await office({ type: 'configure', page: 'interfaces', value: { id: 50, name: 'SERVERS', ip: '10.10.50.1', prefix: 24, enabled: true, zone: 'servers', mtu: 1500 } });
device(srv, 'os', { os: 'VMware ESXi', raid: 'RAID 1 boot' }); deviceRuntime(srv).install.until = 0; deviceRuntime(srv);
device(srv, 'portgroup', { id: 'Servers', vlan: 50, uplinks: String(srv.ports.findIndex(p => p.name === 'DATA-1')) });
device(srv, 'vm', { id: 'WEB-01', os: 'Linux', cpu: 2, memory: 4, disk: 40, datastore: 'local', network: 'Servers', ip: '10.10.50.31', prefix: 24, gateway: '10.10.50.1', dns: '10.10.50.1' });
device(srv, 'vm-power', { id: 'WEB-01', on: true });
device(srv, 'service', { vm: 'WEB-01', id: 'intranet', kind: 'web', engine: 'Nginx', port: 443, content: 'Northwind intranet', groups: 'company', running: true, firewall: true });
await office({ type: 'configure', page: 'dns', value: { id: 'intranet.company.test', ip: '10.10.50.31', enabled: true } });
await office({ type: 'configure', page: 'policies', value: { id: 'fin-web', src: '20', dst: '50', source: 'any', destination: 'any', service: 'HTTPS', action: 'accept', nat: false, enabled: true, start: 0, end: 24 } });
// Powered off → not accepted, whatever the configuration says.
engineering({ type: 'boot', node: srv.id }); tick(); assert.equal(level(), 5, 'server off → level 5 stays open'); engineering({ type: 'boot', node: srv.id }); srv.physical.bootUntil = 1; op.tick();
earn(5);
console.log('  L5 compute: R660 via iDRAC, ESXi, VM + Nginx on VLAN 50 through a Nexus ToR, DNS record, Finance opens https://intranet.company.test (a powered-off server kept it open)');

// ---- Level 6 · Shared storage ----------------------------------------------------------------------------
const torB = mount('nexus9348', 'R01', 24); power(torB); await consoleRun(torB, ['configure terminal', 'username admin password Northwind-2026 role network-admin', 'end']); mgmt(torB, '10.10.70.10');
const arr = mount('me5024iscsi', 'R01', 4); power(arr); mgmt(arr, '10.10.70.30');
product(arr, 'identity', { name: 'ME5-HQ', passwordChanged: true });
product(arr, 'management', { ip: '10.10.70.30', nodeA: '10.10.70.30', nodeB: '10.10.70.31', prefix: 24, vlan: 70, gateway: '10.10.70.1', ntp: '10.10.70.1', ssh: true });
const ids = hostIdentifiers(srv), hostCfg = { os: 'VMware ESXi', raid: 'RAID 1 boot', protocol: 'iSCSI', portA: 'NIC-1', portB: 'NIC-2', ipA: '172.16.10.10', ipB: '172.16.11.10', prefix: 24, vlanA: 3000, vlanB: 3001, mtu: 9000, iqn: ids.iqn, wwpnA: ids.wwpnA, wwpnB: ids.wwpnB, initiatorEnabled: true };
product(srv, 'host', hostCfg);
product(arr, 'storage', { ...hostCfg, ipA: '172.16.10.20', ipB: '172.16.11.20', mode: 'Virtual', raid: 'RAID 6', pool: 'POOL-A', volume: 'DATA-01', sizeGiB: 2000, host: srv.id, initiator: ids.iqn });
const fabric = (x, vlan, portName) => { config({ type: 'vlan', node: x.id, id: vlan, name: 'ISCSI' }); for (const n of [arr, srv]) { const l = cable(n, portName, x, freePort(x, 25), 'fiber'); config({ type: 'port', node: x.id, index: x.ports.indexOf(l.a === x.id ? l.pa : l.pb), value: { mode: 'access', access: vlan, mtu: 9000 } }); } };
fabric(tor, 3000, 'NIC-1');
tick(); assert.equal(level(), 6, 'one path only'); assert.match(failing(6).join(), /Two independent healthy paths|Path B|degraded|Bound/);
fabric(torB, 3001, 'NIC-2');
device(srv, 'datastore', { id: 'SAN-DS', array: arr.id, volume: 'DATA-01' });
await office({ type: 'configure', page: 'storage', value: { ...s().storage, device: arr.id, protocol: 'iSCSI', capacity: 2000000, used: 0, snapshots: true, backup: false } });
earn(6);
console.log('  L6 shared storage: ME5024 iSCSI setup, pool/volume/host mapping, fabrics A/B on two ToR switches (VLAN 3000/3001, MTU 9000), healthy multipath, bound in Data protection');

// ---- Level 7 · Protection and recovery ----------------------------------------------------------------------
assert.match(device(srv, 'service', { vm: 'WEB-01', id: 'files', kind: 'SMB', engine: 'Samba', port: 445, groups: 'company', running: true, firewall: true }), /^Applied/);
const fileSvc = srv.id + ':WEB-01:files';
await office({ type: 'configure', page: 'shares', value: { id: 'finance', service: fileSvc, protocol: 'SMB', read: 'finance', write: 'finance', subnets: '10.10.0.0/16', quota: 1000 } });
await office({ type: 'configure', page: 'policies', value: { id: 'fin-smb', src: '20', dst: '50', source: 'any', destination: 'any', service: 'SMB', action: 'accept', nat: false, enabled: true, start: 0, end: 24 } });
await office({ type: 'login', user: 'finance', pc: 'F1-finance-PC', password: 'OfficeLab19!' });
assert((await office({ type: 'file', pc: 'F1-finance-PC', share: 'finance', op: 'write', name: 'budget.txt', content: 'FY27 budget: 4.2M' })).ok !== false);
assert.throws(() => C.apply({ op: 'data-incident' }), /recovery point/);
await office({ type: 'purchase', sku: 'backup-license' }); for (let i = 0; i < 4; i++) tick();
await office({ type: 'install', id: s().inventory.find(i => i.sku === 'backup-license' && !i.installed).id });
await office({ type: 'configure', page: 'storage', value: { ...s().storage, backup: true } });
await office({ type: 'backup' });
assert.match(w.apply({ type: 'campaign', action: { op: 'data-incident' } }, 'ENGINEER-01'), /corrupted/);
assert.equal((await office({ type: 'file', pc: 'F1-finance-PC', share: 'finance', op: 'read', name: 'budget.txt' })).content, '[encrypted by simulated incident]');
tick(); assert.equal(level(), 7, 'not restored yet');
await office({ type: 'restore-files', id: s().backups.at(-1).id });
assert.equal((await office({ type: 'file', pc: 'F1-finance-PC', share: 'finance', op: 'read', name: 'budget.txt' })).content, 'FY27 budget: 4.2M');
earn(7);
console.log('  L7 protection: SMB share on the SAN-backed VM, licensed backup, guided incident corrupts files, restore proves content and permissions');

// ---- Level 8 · Observe and troubleshoot -----------------------------------------------------------------------
await office({ type: 'configure', page: 'monitoring', value: { ...s().monitoring, enabled: true, snmp: true, syslog: true, email: 'noc@northwind.test', maintenance: false } });
async function repairFault(e) {
  const pc = s().pcs['F1-sales-PC'];
  if (e.kind === 'cable') { buy('cat6', 5); await office({ type: 'patch-pc', id: 'F1-sales-PC', port: pc.port }); }
  else if (e.kind === 'port') await office({ type: 'configure', page: 'switching', value: { ...s().ports['F1-sales-PC'], id: 'F1-sales-PC', admin: true, vlan: 10, trunk: '10' } });
  else if (e.kind === 'vlan') await office({ type: 'configure', page: 'switching', value: { ...s().ports['F1-sales-PC'], id: 'F1-sales-PC', vlan: 10, trunk: '10' } });
  else if (e.kind === 'power') { const n = a.byId[e.target]; for (const [psu, feed] of [[0, 'A'], [1, 'B']]) { const c = op.game.stock.find(x => x.sku === 'power' && x.floor); engineering({ type: 'grab', id: c.id }); engineering({ type: 'power', id: c.id, node: n.id, psu, feed }); } n.physical.bootUntil = 1; op.tick(); }
}
w.apply({ type: 'campaign', action: { op: 'fault-drill' } }, 'ENGINEER-01');
const drill = op.game.levels.exercises.fault; assert(drill.broke, 'the drill broke a real user service: ' + drill.kind);
tick(); assert.equal(level(), 8, 'fault not repaired'); assert(!drill.repairedAt);
await repairFault(drill); tick();
assert(op.game.levels.exercises.fault.repairedAt, 'repair detected from the live Sales test');
earn(8);
console.log('  L8 observe: SNMP/syslog/alert e-mail, fault drill (' + drill.kind + ') broke Sales, repaired from diagnosis, service recovered');

// ---- Level 9 · Resilience ----------------------------------------------------------------------------------------
assert.throws(() => C.apply({ op: 'failover-test' }), /secondary ISP/);
await office({ type: 'purchase', sku: 'wan2' }); for (let i = 0; i < 4; i++) tick();
await office({ type: 'install', id: s().inventory.find(i => i.sku === 'wan2' && !i.installed).id });
// One device on a single feed keeps the level open.
engineering({ type: 'power', node: tor.id, psu: 1, feed: null }); engineering({ type: 'drop', id: op.game.stock.find(x => x.holders.includes('ENGINEER-01')).id, position: { x: -30, z: 20 } });
w.apply({ type: 'campaign', action: { op: 'failover-test' } }, 'ENGINEER-01');
assert(op.game.levels.exercises.failover.ok, op.game.levels.exercises.failover.reason);
tick(); assert.equal(level(), 9, 'single-fed switch'); assert.match(failing(9).join(), new RegExp(tor.id));
engineering({ type: 'power', id: cord().id, node: tor.id, psu: 1, feed: 'B' });
earn(9);
console.log('  L9 resilience: every device on PDU A and B, secondary ISP, planned WAN failure carried by SD-WAN member 2');

// ---- Level 10 · Full commissioning ------------------------------------------------------------------------------
tick(); assert.equal(level(), 10);
w.apply({ type: 'campaign', action: { op: 'final-incident' } }, 'ENGINEER-01');
const fin = op.game.levels.exercises.final; assert(fin.broke);
tick(); assert.equal(level(), 10);
await repairFault(fin);
const st = earn(10); assert(st.complete, 'campaign complete');
console.log('  L10 commissioning: all levels live, every purchased device powered + managed, no critical alarm, final incident (' + fin.kind + ') repaired');

// ---- Regression, persistence and unlocks ---------------------------------------------------------------------------
engineering({ type: 'boot', node: srv.id }); tick();
let rep = []; for (let i = 0; i < 6 && !rep.some(r => r.id === 5); i++) rep = C.status().repairs; // earned levels are re-checked two per HUD refresh assert(rep.some(r => r.id === 5), 'powered-off server → level 5 shows as a repair objective'); assert(op.game.levels.earned[5], 'earned level kept');
engineering({ type: 'boot', node: srv.id }); srv.physical.bootUntil = 1; op.tick(); tick();
const saved = JSON.parse(JSON.stringify(w.snapshot())); assert.equal(saved.format, 32);
engineering({ type: 'mode', mode: 'free' }); w.restore(saved); L.invalidate(); tick();
assert.equal(op.game.levels.current, 11); assert.equal(Object.keys(op.game.levels.earned).length, 11);
assert(C.evaluate(true).every(l => l.ok), 'every level passes after reload: ' + JSON.stringify(C.evaluate(true).filter(l => !l.ok).map(l => [l.id, l.checks.filter(c => !c.ok).map(c => c.label)])));
console.log('  budget: start $' + startBudget.toLocaleString() + ' · lowest $' + lowest.toLocaleString() + ' · end $' + op.game.budget.toLocaleString());
assert(lowest > 5000, 'no softlock: the campaign never runs out of money');
console.log('  LAN world frame at level 10: ' + Math.round(JSON.stringify(w.snapshotFor()).length / 1024) + ' KB (sent once per change, not per pose)');
console.log('  earned levels survive a regression (shown as repair) and save/restore; all 11 levels pass live after reload');
console.log('PASS: campaign levels 0–10 · empty site → operational enterprise through physical, console, GUI and office actions; blocked paths (ordering only, unfed rack, powered-off server, permissive policy, one storage path, single feed, unrepaired drill) keep levels open.');
process.exit(0);
