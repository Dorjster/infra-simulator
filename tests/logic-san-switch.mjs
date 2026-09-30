// SAN switch logic: FLOGI / name server from real FC links, zoning (alias → zone → cfg → cfgenable),
// no effective configuration = no access, zone members that are not logged in, fabric separation,
// Fabric OS CLI and errors. Fault: zoning disabled (legacy SAN-A and a Connectrix DS-6610 fabric),
// with CLI/GUI/LED/alarm agreement, host impact, repair and persistence.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
import { helpers } from './build-helpers.mjs';
import { builder } from '../dist/scenarios.js';
import { hostIdentifiers } from '../dist/storage-access.js';
const h = helpers(a), { w, engineering, product, device, op } = h, net = a.lab.kit.network, L = net.logic;
engineering({ type: 'mode', mode: 'free' });
const b = builder(w, a.byId, 'ENGINEER-01'), sanA = a.byId['SAN-A'], sess = new Map(), cli = (n, c) => { if (!sess.has(n.id)) sess.set(n.id, { node: n, mode: 'SERIAL CONSOLE' }); return net.command(c, sess.get(n.id)); };
const ns = await cli(sanA, 'nsshow'); assert.match(ns, /Device type: Physical Initiator\n    Port Index: 0\n    Connected: SERVER-01 \/ HBA-A/); assert.match(ns, new RegExp(hostIdentifiers(a.byId['SERVER-01']).wwpnA)); assert.match(ns, /Physical Target/, 'array controller ports log in as targets');
assert.match(await cli(sanA, 'switchshow'), /zoning:\s+ON \(FACTORY-CFG\)[\s\S]*Online\s+FC\s+F-Port/);
assert(L.checks(sanA).every(c => c.ok || c.severity === 'warning'));
// Legacy fabric: cfgdisable → logged-in devices lose access (links stay up, name server intact).
engineering({ type: 'fault', fault: 'zoning-disabled', node: 'SAN-A' }); L.invalidate();
const z = L.checks(sanA).find(c => c.id === 'zoning'); assert(!z.ok); assert.match(z.detail, /No effective zoning configuration on SAN-A \(cfgdisable\) · \d+ logged-in device\(s\) cannot reach any target/);
assert.match(await cli(sanA, 'cfgshow'), /No Effective configuration: \(No Access\)/); assert.match(await cli(sanA, 'switchshow'), /zoning:\s+OFF/);
assert(L.alarms().some(x => x.device === 'SAN-A' && x.check === 'zoning')); assert(op.alerts().some(x => x.device === 'SAN-A' && x.text === z.detail), 'NOC');
assert.equal(L.gui(sanA).blocking.id, 'zoning'); assert.equal(L.gui(sanA).summary[0][1], 'OFF');
assert.deepEqual(L.leds(sanA).front.find(x => x.id === 'status'), { id: 'status', color: 'amber', blink: 'fast' });
{ const saved = w.snapshot(); w.restore(saved); L.invalidate(); assert(!L.checks(a.byId['SAN-A']).find(c => c.id === 'zoning').ok, 'persists'); }
assert.match(await cli(sanA, 'cfgenable "FACTORY-CFG"'), /Applied · zoning enabled/); L.invalidate(); assert(L.checks(sanA).find(c => c.id === 'zoning').ok, 'repaired');
// Connectrix DS-6610 fabric with an FC array and host: zoning decides access.
const sw = b.install('ds6610'), arr = b.install('me5024fc'), host = b.install('r760');
product(arr, 'identity', { name: 'ME5-FC', passwordChanged: true });
const hid = hostIdentifiers(host), tid = hostIdentifiers(arr), fc = { os: 'Linux', raid: 'RAID 1 boot', protocol: 'FC', portA: 'HBA-A', portB: 'HBA-B', mtu: 1500, iqn: hid.iqn, wwpnA: hid.wwpnA, wwpnB: hid.wwpnB, initiatorEnabled: true };
assert.match(product(host, 'host', fc), /^Applied/);
assert.match(product(arr, 'storage', { ...fc, mode: 'Linear', raid: 'ADAPT', pool: 'FC-POOL', volume: 'FC-01', sizeGiB: 1000, host: host.id, initiator: hid.wwpnA }), /^Applied/);
b.cable(host, 'HBA-A', sw, 0, 'fc'); b.cable(arr, 'HBA-A', sw, 1, 'fc'); L.invalidate();
assert.equal(L.state(sw).logins.length, 2, 'both ends logged in'); assert.equal(L.first(sw).id, 'mgmt-ip', 'factory switch: console only');
const zoning = L.checks(sw).find(c => c.id === 'zoning'); assert(!zoning.ok, 'no effective config → no access');
const vol = () => net.volumeAccess(arr, 'FC-01', host); assert.match(vol().reason, /Path A: fabric .* has no enabled zoning configuration/);
for (const c of ['alicreate "host_a","' + hid.wwpnA + '"', 'alicreate "me5_a","' + tid.wwpnA + '"', 'zonecreate "z_host_me5","host_a;me5_a"', 'cfgcreate "cfg_a","z_host_me5"', 'cfgenable "cfg_a"']) assert.match(await cli(sw, c), /Applied/);
L.invalidate(); assert(L.checks(sw).find(c => c.id === 'zoning').ok); assert.equal(vol().state, 'degraded', 'fabric A path works (B not cabled)');
assert.match(await cli(sw, 'cfgshow'), /Effective configuration:\n cfg:\tcfg_a/);
// A zone member that is not logged in is reported.
const hl = host.ports.find(p => p.name === 'HBA-A').link; h.unplug(hl); L.invalidate();
assert.match(L.checks(sw).find(c => c.id === 'zone-members').detail, new RegExp('not logged in to .*' + hid.wwpnA)); assert.equal(vol().state, 'unavailable'); h.replug(hl); L.invalidate();
// cfgdisable on the Connectrix removes access; cfgenable restores it.
assert.match(await cli(sw, 'cfgdisable'), /Do you want to disable zoning configuration\? \(yes, y, no, n\): \[no\]$/); assert.match(await cli(sw, 'n'), /Operation cancelled/); L.invalidate(); assert.equal(vol().state === 'unavailable', false, 'answering no keeps zoning');
assert.match(await cli(sw, 'cfgdisable'), /\[no\]$/); assert.match(await cli(sw, 'y'), /disable zoning configuration[\s\S]*Applied/); L.invalidate();
assert.equal(vol().state, 'unavailable'); assert(!L.checks(sw).find(c => c.id === 'zoning').ok);
assert.match(await cli(sw, 'cfgenable "cfg_a"'), /Applied/); L.invalidate(); assert.equal(vol().state, 'degraded');
// Fabric A and B stay separate: an ISL between SAN switches is refused.
const s = h.buy('fc'); engineering({ type: 'grab', id: s.id }); engineering({ type: 'start-end', id: s.id, node: sw.id, port: 5 });
assert.throws(() => engineering({ type: 'patch', id: s.id, a: sw.id, pa: 5, b: 'SAN-B', pb: 20 }), /Keep SAN fabrics independent/);
engineering({ type: 'drop', id: s.id, position: { x: -38, z: 20 } });
assert.match(await cli(sw, 'fabricshow'), /The Fabric has 1 switch/); assert.match(await cli(sw, 'zonefoo'), /rbash: zonefoo: command not found|not supported/);
console.log('PASS: logic san switch · cfgdisable yes/no prompt, FLOGI/nsshow from real FC links, switchshow/cfgshow/fabricshow, zoning-disabled fault (legacy + DS-6610) with CLI/GUI/LED/alarm/NOC agreement, persistence, cfgenable repair, zone-member login check, host access follows the effective zoning, fabric separation.');
process.exit(0);
