// P1 server exercise: rack/power → iDRAC management → OS/hypervisor installer → datastore → VM →
// port group / VLAN → web service → DNS → office client test, then break and repair dependencies.
// Management reachability must stay independent from the host OS, VM and service state.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
import { helpers } from './build-helpers.mjs';
import { deviceRuntime } from '../dist/device-runtime.js';
const h = helpers(a), { w, office, config, device, product, install, cable, engineering, op } = h, o = w.office, s = () => o.state;
engineering({ type: 'mode', mode: 'free' });
const hub = a.byId['MGMT-SW'], core = a.byId[s().bindings.access[1]], fw = a.byId[s().bindings.firewall];
const officePorts = new Set([...Object.values(s().pcs).filter(p => p.floor === 1).map(p => p.port), ...Object.values(s().aps).map(x => x.port)]);
const freePort = (n, speed) => n.ports.findIndex((p, i) => !p.link && !p.service && !p.reserved && p.medium === 'Ethernet' && p.speed === speed && !(n === core && officePorts.has(i)));
const srv = install('r660', { racks: ['R04', 'R03'] });
// Management: dedicated iDRAC port to the out-of-band switch, VLAN 70.
const hp = freePort(hub, 1); cable(srv, 'MGMT UPLINK', hub, hp, 'cat6', 40); config({ type: 'port', node: hub.id, index: hp, value: { access: 70 } });
assert.match(product(srv, 'management', { ip: '10.10.70.181', prefix: 24, vlan: 70, gateway: '10.10.70.1', ssh: true }), /^Applied/);
await office({ type: 'login', user: 'itadmin', password: 'OfficeLab19!' });
const idrac = async () => (await office({ type: 'admin-connect', node: srv.id, method: 'HTTPS' })).ok;
assert(await idrac(), 'iDRAC reachable over the management network');
// Host data NIC to the core switch, 802.1Q trunk carrying VLAN 50.
const nic = srv.ports.findIndex(p => p.name === 'NIC-1'), cp = freePort(core, 25);
cable(srv, nic, core, cp, 'fiber', 40); config({ type: 'port', node: core.id, index: cp, value: { mode: 'trunk', allowed: [50] } });
// Installer: power loss during installation fails it; a completed install enables the hypervisor.
assert.match(device(srv, 'os', { os: 'VMware ESXi', raid: 'RAID 1 boot' }), /^Applied/);
assert.equal(deviceRuntime(srv).install.state, 'installing');
engineering({ type: 'boot', node: srv.id }); // host powered off mid-install
assert.equal(deviceRuntime(srv).install.state, 'failed', 'power loss fails the installer');
assert(await idrac(), 'iDRAC standby stays reachable with the host off');
engineering({ type: 'boot', node: srv.id }); srv.physical.bootUntil = 1; op.tick();
assert.match(device(srv, 'portgroup', { id: 'Servers', vlan: 50, uplinks: String(nic) }), /hypervisor/, 'no hypervisor after failed install');
assert.match(device(srv, 'os', { os: 'VMware ESXi', raid: 'RAID 1 boot' }), /^Applied/); deviceRuntime(srv).install.until = 0;
assert.equal(deviceRuntime(srv).install.state, 'completed'); assert.equal(deviceRuntime(srv).hypervisor, 'VMware ESXi');
assert.match(device(srv, 'portgroup', { id: 'Servers', vlan: 50, uplinks: String(nic) }), /^Applied/);
assert.deepEqual(srv.ports[nic].cfg.allowed, [50], 'port group turns the host uplink into a VLAN 50 trunk');
assert.match(device(srv, 'portgroup', { id: 'Bad', vlan: 50, uplinks: String(srv.ports.findIndex(p => p.name === 'MGMT UPLINK')) }), /management/, 'iDRAC port cannot carry VM traffic');
assert.match(device(srv, 'vm', { id: 'WEB-02', os: 'Linux', cpu: 2, memory: 4, disk: 40, datastore: 'local', network: 'Servers', ip: '10.10.50.31', prefix: 24, gateway: '10.10.60.1', dns: '10.10.70.1' }), /gateway/, 'guest gateway outside the subnet is rejected');
assert.match(device(srv, 'vm', { id: 'WEB-02', os: 'Linux', cpu: 2, memory: 4, disk: 40, datastore: 'local', network: 'Servers', ip: '10.10.50.31', prefix: 24, gateway: '10.10.50.1', dns: '10.10.70.1' }), /^Applied/);
assert.match(device(srv, 'vm-power', { id: 'WEB-02', action: 'start', on: true }), /^Applied/);
assert.match(device(srv, 'service', { vm: 'WEB-02', id: 'portal', kind: 'web', engine: 'Nginx', port: 443, name: 'portal.company.test', content: 'Northstar portal', groups: 'company', running: true, firewall: true }), /^Applied/);
await office({ type: 'configure', page: 'dns', value: { id: 'portal.company.test', ip: '10.10.50.31', enabled: true } });
await office({ type: 'login', user: 'finance', pc: 'F1-finance-PC', password: 'OfficeLab19!' });
const browse = () => office({ type: 'browse', pc: 'F1-finance-PC', url: 'https://portal.company.test' });
const ok = async why => { const r = await browse(); assert(r.ok, why + ': ' + r.reason); assert.match(r.content, /Northstar portal/); };
const expect = async (step, pattern) => { const r = await browse(); assert(!r.ok, step); const f = h.failedStep(r); assert.equal(f.name, step, JSON.stringify(f)); assert.match(f.detail, pattern); console.log('  diagnosed ' + step + ' → ' + f.detail); };
await ok('baseline web service from Finance');
const vm = () => deviceRuntime(srv).vms['WEB-02'];
device(srv, 'vm-power', { id: 'WEB-02', action: 'stop', on: false }); await expect('Virtual machine and datastore', /powered off/); assert(await idrac(), 'iDRAC reachable while the VM is off');
device(srv, 'vm-power', { id: 'WEB-02', action: 'start', on: true }); await ok('VM started');
engineering({ type: 'boot', node: srv.id }); await expect('Host power', /iDRAC\/iLO standby/); assert(await idrac(), 'iDRAC reachable while the host is off');
engineering({ type: 'boot', node: srv.id }); srv.physical.bootUntil = 1; op.tick(); await ok('host powered on');
device(srv, 'service', { vm: 'WEB-02', id: 'portal', kind: 'web', engine: 'Nginx', port: 443, name: 'portal.company.test', content: 'Northstar portal', groups: 'company', running: false, firewall: true }); await expect('Service listener', /is stopped/);
device(srv, 'service', { vm: 'WEB-02', id: 'portal', kind: 'web', engine: 'Nginx', port: 443, name: 'portal.company.test', content: 'Northstar portal', groups: 'company', running: true, firewall: true }); await ok('service started');
device(srv, 'service', { vm: 'WEB-02', id: 'portal', kind: 'web', engine: 'Nginx', port: 443, name: 'portal.company.test', content: 'Northstar portal', groups: 'company', running: true, firewall: false }); await expect('Service listener', /does not allow TCP 443/);
device(srv, 'service', { vm: 'WEB-02', id: 'portal', kind: 'web', engine: 'Nginx', port: 443, name: 'portal.company.test', content: 'Northstar portal', groups: 'company', running: true, firewall: true }); await ok('host firewall opened');
vm().gateway = '10.10.50.254'; await expect('Guest / host network', /default gateway 10\.10\.50\.254/); vm().gateway = '10.10.50.1'; await ok('guest gateway fixed');
device(srv, 'portgroup', { id: 'Servers', vlan: 51, uplinks: String(nic) }); await expect('Virtual machine and datastore', /VLAN 51/);
{ const al = h.op.alerts().find(x => x.device === srv.id && /VM WEB-02/.test(x.text)); assert(al, 'NOC shows the VM outage'); assert.match(al.impact, /portal/); assert(o.alerts().some(x => /VM WEB-02/.test(x.message)), 'office monitoring shows it'); console.log('  monitoring · ' + al.text + ' · impact: ' + al.impact); }
device(srv, 'portgroup', { id: 'Servers', vlan: 50, uplinks: String(nic) }); await ok('port group VLAN fixed');
assert(!h.op.alerts().some(x => x.device === srv.id), 'VM alert clears after the fix');
config({ type: 'vlan', node: core.id, id: 50, remove: true }); await expect('Server switching path', /VLAN 50 is not defined on /);
config({ type: 'vlan', node: core.id, id: 50, name: 'SERVERS' }); await ok('VLAN 50 recreated on the core switch');
s().dns['portal.company.test'].enabled = false; await expect('DNS record', /No enabled record/); s().dns['portal.company.test'].enabled = true; await ok('DNS record enabled');
s().policies.web20.enabled = false; await expect('Firewall policy', /deny/); s().policies.web20.enabled = true; await ok('policy enabled');
const saved = w.snapshot(); w.restore(saved); await ok('after save/reload');
assert.equal(deviceRuntime(a.byId[srv.id]).vms['WEB-02'].on, true);
console.log('PASS: P1 server exercise · iDRAC separate from host OS/VM/service; installer failure on power loss; hypervisor, port group trunk, VM guest IP/gateway, web listener, DNS, VLAN and policy dependencies; persistence.');
process.exit(0);
