// P0 exercise: ISP handoff → WAN → LAN/VLAN/DHCP → route → policy/NAT → office PC Internet test,
// then break each dependency and require a distinct, specific diagnosis before repairing it.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
import { helpers } from './build-helpers.mjs';
const h = helpers(a), { w, office, config, install } = h, o = w.office, s = () => o.state;
h.engineering({ type: 'mode', mode: 'campaign', enterprise: true });
const sw = install('fs148f', { racks: ['R01'] }), fw = install('fg200f', { racks: ['R02'] });
const consoleSession = { node: sw, config: false };
for (const cmd of ['config system interface', 'edit mgmt', 'set ip 10.10.70.8/24', 'set allowaccess ping https ssh', 'next', 'end']) await a.lab.kit.network.command(cmd, consoleSession);
await office({ type: 'login', user: 'itadmin', password: 'OfficeLab19!' });
await office({ type: 'configure', page: 'binding', value: { access: sw.id, firewall: fw.id, floor: 1, port: 0, fwPort: 0 } });
assert(fw.net.ispContract?.physical, 'ISP circuit ordered for the purchased FortiGate');
await office({ type: 'configure', page: 'interfaces', value: { id: 10, name: 'SALES', ip: '10.10.10.1', prefix: 24, enabled: true, zone: 'staff', mtu: 1500 } });
config({ type: 'vlan', node: sw.id, id: 10 });
for (const n of [sw, fw]) config({ type: 'port', node: n.id, index: 0, value: { mode: 'trunk', allowed: [1, 10] } });
await office({ type: 'configure', page: 'dhcp', value: { id: 10, enabled: true, start: 100, end: 199, gateway: '10.10.10.1', dns: '10.10.10.1', lease: 3600 } });
await office({ type: 'patch-pc', id: 'F1-sales-PC', port: 1 });
await office({ type: 'configure', page: 'switching', value: { ...s().ports['F1-sales-PC'], id: 'F1-sales-PC', vlan: 10, trunk: '10' } });
await office({ type: 'configure', page: 'wan', value: { port: 'port3', mode: 'static', connected: true, defaultRoute: true, dnsForward: true } });
await office({ type: 'configure', page: 'policies', value: { id: 'sales-out', src: '10', dst: 'wan', source: 'any', destination: 'any', service: 'any', action: 'accept', nat: true, enabled: true, start: 0, end: 24 } });
await office({ type: 'configure', page: 'dns', value: { id: 'portal.company.test', ip: '10.10.10.50', enabled: true } });
await office({ type: 'login', user: 'sales', pc: 'F1-sales-PC', password: 'OfficeLab19!' });
const browse = (url = 'https://example.test') => office({ type: 'browse', pc: 'F1-sales-PC', url });
const ok = async (why) => { const r = await browse(); assert(r.ok, why + ': ' + r.reason); };
const broken = async (step, pattern, url) => { const r = await browse(url); assert(!r.ok, 'must fail: ' + step); const f = h.failedStep(r); assert.equal(f.name, step, JSON.stringify(f)); assert.match(f.detail, pattern); return f.detail; };
{ const r = await browse(); assert.equal(h.failedStep(r)?.name, 'DNS resolver'); assert.match(r.reason, /Provider router for CKT-\d+ is not racked yet/); console.log('  before the provider router is installed → ' + r.reason); }
const cpe = h.installISP(fw, 'port3', { racks: ['R03'] });
await ok('baseline Internet');
assert(o.objectives()[0].ok, 'contract 1 verified by the live Internet test');
const seen = new Set(), expect = async (step, pattern, url) => { const d = await broken(step, pattern, url); assert(!seen.has(d), 'diagnosis must be distinct: ' + d); seen.add(d); console.log('  diagnosed ' + step + ' → ' + d); };

// Firewall policy missing / denied / no NAT.
s().policies['sales-out'].enabled = false; await expect('Firewall policy', /implicit deny/); s().policies['sales-out'].enabled = true; await ok('policy restored');
s().policies['sales-out'].nat = false; await expect('Source NAT', /NAT/); s().policies['sales-out'].nat = true; await ok('NAT restored');
// Client gateway misconfigured (static addressing).
await office({ type: 'pc', id: 'F1-sales-PC', op: 'connect', dhcp: false, ip: '10.10.10.80', prefix: 24, gateway: '10.10.10.254', dns: '10.10.10.1' });
await expect('Default gateway', /Gateway 10\.10\.10\.254/, 'https://198.51.100.20');
await office({ type: 'pc', id: 'F1-sales-PC', op: 'connect', dhcp: true }); await ok('DHCP restored');
// Provider/WAN side: link down, default route, WAN interface admin-down.
await office({ type: 'failure', kind: 'wan', enabled: true }); await expect('ISP link state', /ISP link down/, 'https://198.51.100.20');
assert(o.alerts().some(x => x.id === 'wan' && /ISP link state · ISP link down/.test(x.message)), 'monitoring names the WAN cause');
assert(!o.objectives()[0].ok); assert.match(o.objectives()[0].detail, /DNS resolver · DNS forwarder cannot reach the ISP resolver/); console.log('  objective · ' + o.objectives()[0].detail);
await assert.rejects(office({ type: 'validate' }), /Internet access · Sales PC → Internet · DNS resolver/);
await expect('DNS resolver', /forwarder cannot reach the ISP resolver · ISP link state/);
await office({ type: 'failure', kind: 'wan', enabled: false }); await ok('ISP link repaired');
await office({ type: 'configure', page: 'wan', value: { port: 'port3', defaultRoute: false } }); await expect('FortiGate WAN interface', /Default route/, 'https://198.51.100.20');
await office({ type: 'configure', page: 'wan', value: { port: 'port3', defaultRoute: true } }); await ok('default route restored');
const wanIndex = fw.ports.findIndex(p => p.name === 'port3');
const handoff = fw.ports[wanIndex].link; h.unplug(handoff); await expect('FortiGate WAN interface', /WAN port port3 has no cable · patch it to /, 'https://198.51.100.20'); h.replug(handoff); await ok('handoff cable replugged');
h.engineering({ type: 'power', node: cpe.id, psu: 0, feed: null }); const cord = h.op.game.stock.find(x => x.holders.includes('ENGINEER-01')); h.engineering({ type: 'drop', id: cord.id, position: { x: -38, z: 13 } });
await expect('FortiGate WAN interface', /Provider router .* has no power/, 'https://198.51.100.20');
h.engineering({ type: 'grab', id: cord.id }); h.engineering({ type: 'power', id: cord.id, node: cpe.id, psu: 0, feed: 'A' }); cpe.physical.bootUntil = 1; h.op.tick(); await ok('provider router powered');
config({ type: 'port', node: fw.id, index: wanIndex, value: { admin: false } }); await expect('FortiGate WAN interface', /administratively down/, 'https://198.51.100.20');
config({ type: 'port', node: fw.id, index: wanIndex, value: { admin: true } }); await ok('WAN interface enabled');
// LAN side: trunk VLAN, admin-down uplink and unplugged uplink name the exact port.
config({ type: 'port', node: sw.id, index: 0, value: { allowed: [1] } }); await expect('VLAN switching path', /does not carry VLAN 10/);
config({ type: 'port', node: sw.id, index: 0, value: { allowed: [1, 10] } }); await ok('trunk VLAN restored');
config({ type: 'port', node: fw.id, index: 0, value: { admin: false } }); await expect('VLAN switching path', /administratively down/);
config({ type: 'port', node: fw.id, index: 0, value: { admin: true } }); await ok('FortiGate LAN port enabled');
const uplink = sw.ports[0].link; h.unplug(uplink); await expect('VLAN switching path', /unplugged/); h.replug(uplink); await ok('uplink cable replugged');
s().dhcp[10].enabled = false; await expect('IPv4 / DHCP', /No DHCP offer/); s().dhcp[10].enabled = true; await ok('DHCP scope enabled');
// DNS: public resolver cannot answer the internal zone; FortiGate DNS without forwarding cannot answer public names.
s().dhcp[10].dns = '1.1.1.1'; await ok('public resolver through NAT');
await expect('DNS resolver', /cannot resolve the internal zone/, 'https://portal.company.test');
s().dhcp[10].dns = '10.10.70.1'; await expect('DNS resolver', /No DNS service answers at 10\.10\.70\.1/);
s().dhcp[10].dns = '10.10.10.1'; await office({ type: 'configure', page: 'wan', value: { dnsForward: false } }); await expect('DNS resolver', /forwarding to the ISP resolver is disabled/);
await office({ type: 'configure', page: 'wan', value: { dnsForward: true } }); await ok('forwarding restored');
// Persistence: the repaired topology survives save/reload with the same outcome.
assert(!o.alerts().some(x => x.id === 'wan'), 'WAN alert cleared after repairs');
const saved = w.snapshot(); w.restore(saved); await ok('after save/reload');
const budget = h.op.game.budget; await office({ type: 'validate' }); assert.equal(s().chapter, 1); assert.equal(h.op.game.budget, budget + 15000, 'contract paid only after live checks');
console.log('PASS: P0 firewall exercise · ' + seen.size + ' distinct diagnoses (policy, NAT, gateway, ISP link, DNS forwarder, default route, WAN admin-down, trunk VLAN, LAN admin-down, unplugged uplink, DHCP, public resolver, missing resolver, forwarding) and recovery after each repair.');
process.exit(0);
