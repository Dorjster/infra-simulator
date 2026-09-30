// Provider router (CPE) logic: read-only CPE with PWR/FIBER/LOS/LAN LEDs, static /30 ARP only for the
// sheet IP, DHCP lease bound to the cabled MAC, PPPoE with 3-attempt / 30 s lockout in the provider
// log, provider events (IP change, PPPoE password change), CPE power loss and fiber LOS. Every fault:
// distinct message, FortiGate WAN impact, LEDs, CLI/GUI, monitoring, repair, persistence.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
import { helpers } from './build-helpers.mjs';
const h = helpers(a), { engineering, product, install, op, w } = h, net = a.lab.kit.network, L = net.logic;
engineering({ type: 'mode', mode: 'campaign', enterprise: true }); op.game.budget = 900000;
const inject = (fault, node) => { engineering({ type: 'fault', fault, node, lab: true }); L.invalidate(); return op.game.lastFault; };
const wan = (fw, value) => product(fw, 'wan', { port: 'port5', dns: '198.51.100.53', enabled: true, defaultRoute: true, ...value });
const ledOf = (n, id) => L.leds(n).front.find(x => x.id === id);

// Static /30 circuit.
const fw1 = install('fg200f', { racks: ['R01'] }); engineering({ type: 'isp-order', node: fw1.id, plan: 'fiber30' });
const c1 = fw1.net.ispContract, cpe1 = h.installISP(fw1, 'port5', { racks: ['R01'] }); L.invalidate();
assert.equal(ledOf(cpe1, 'PWR').color, 'green'); assert.equal(ledOf(cpe1, 'FIBER').color, 'green'); assert.equal(ledOf(cpe1, 'LOS').color, 'off'); assert.equal(ledOf(cpe1, 'LAN1').color, 'green', 'LAN1 follows the link');
assert.match(await net.command('show running-config', { node: cpe1 }), /Access denied · provider-managed/, 'no customer CLI');
assert.match(wan(fw1, { mode: 'Static', ip: '203.0.113.99', prefix: 30, gateway: c1.gateway }), /circuit sheet/);
assert.match(wan(fw1, { mode: 'Static', ip: c1.ip, prefix: 30, gateway: c1.gateway }), /^Applied/);
assert(net.wanStatus(fw1).ok, net.wanStatus(fw1).reason);
assert(L.checks(cpe1).every(c => c.ok || c.severity === 'warning'), JSON.stringify(L.checks(cpe1).filter(c => !c.ok)));
const seen = new Set();
async function scenario(fault, cpe, fw, check, pattern, repair) {
  const info = inject(fault, fault === 'pppoe-password' || fault === 'isp-ip-change' ? fw.id : cpe.id); L.invalidate();
  const target = a.byId[info.device], f = [target, cpe, fw].map(n => L.checks(n).find(c => c.id === check && !c.ok)).find(Boolean);
  assert(f, fault + ' fails ' + check + ' · ' + JSON.stringify(L.checks(target).filter(c => !c.ok)));
  assert.match(f.detail, pattern); assert(!seen.has(f.detail), 'distinct ' + f.detail); seen.add(f.detail);
  const st = net.wanStatus(fw); assert(!st.ok, fault + ' takes the WAN down'); assert(L.alarms().some(x => x.message === f.detail), fault + ' alarm');
  const saved = w.snapshot(); w.restore(saved); L.invalidate(); assert(!net.wanStatus(a.byId[fw.id]).ok, fault + ' persists');
  await repair(); L.invalidate(); const after = net.wanStatus(a.byId[fw.id]); assert(after.ok, fault + ' repaired · ' + after.reason);
  console.log('  ' + fault + ' → ' + f.detail + ' · WAN: ' + st.reason);
}
// CPE power: PWR off, WAN names the provider router.
await scenario('cpe-power', cpe1, fw1, 'power-input', /No PSU has a power cord/, () => { const cord = h.buy('power'); engineering({ type: 'power', id: cord.id, node: cpe1.id, psu: 0, feed: 'A' }); cpe1.physical.bootUntil = 1; op.tick(); });
assert.equal(ledOf(cpe1, 'PWR').color, 'green');
// Fiber cut: FIBER/LOS red; the provider ticket repairs it.
inject('fiber-los', cpe1); L.invalidate(); assert.equal(ledOf(cpe1, 'LOS').color, 'red'); assert.equal(ledOf(cpe1, 'FIBER').color, 'red');
assert.match(L.gui(cpe1).summary.find(r => r[0] === 'Fiber')[1], /LOS/); assert.match(net.wanStatus(fw1).reason, /reports LOS/);
engineering({ type: 'provider-ticket', node: cpe1.id }); L.invalidate(); assert(net.wanStatus(fw1).ok);
await scenario('fiber-los', cpe1, fw1, 'los', /FIBER-IN: LOS/, () => engineering({ type: 'provider-ticket', node: cpe1.id }));
// Provider IP change: new sheet; the old address no longer answers ARP.
await scenario('isp-ip-change', cpe1, fw1, 'wan-l3', /no longer matches the circuit sheet · provider notice: Planned maintenance/, () => wan(fw1, { mode: 'Static', ip: fw1.net.ispContract.ip, prefix: 30, gateway: fw1.net.ispContract.gateway }));
assert.match(await net.command('get system isp', { node: fw1 }), new RegExp(fw1.net.ispContract.ip.replace(/\./g, '\\.')));

// PPPoE: three wrong logins lock the account for 30 s; the provider log shows it.
const fw2 = install('fg200f', { racks: ['R02'] }); engineering({ type: 'isp-order', node: fw2.id, plan: 'pppoe' });
const c2 = fw2.net.ispContract, cpe2 = h.installISP(fw2, 'port5', { racks: ['R02'] });
for (let i = 1; i <= 2; i++) assert.match(wan(fw2, { mode: 'PPPoE', pppoeUser: c2.pppoe.user, pppoePassword: 'wrong' + i }), new RegExp('\\(' + i + '/3 attempts\\)'));
assert.match(wan(fw2, { mode: 'PPPoE', pppoeUser: c2.pppoe.user, pppoePassword: 'wrong3' }), /account now locked for 30 s/);
assert.match(wan(fw2, { mode: 'PPPoE', pppoeUser: c2.pppoe.user, pppoePassword: c2.pppoe.password }), /locked by the provider after 3 failed attempts · retry in \d+ s/, 'correct password refused while locked');
L.invalidate(); assert.match(L.checks(cpe2).find(c => c.id === 'pppoe').detail, /locked for \d+ s after 3 failed logins/);
assert(L.gui(cpe2).pages['isp-log'].tables[0].rows.some(r => /locked for 30 s/.test(r[1])), 'provider log shows the lockout');
c2.pppoe.lockedUntil = Date.now() - 1; // the 30 s provider timer elapses (test does not wait)
assert.match(wan(fw2, { mode: 'PPPoE', pppoeUser: c2.pppoe.user, pppoePassword: c2.pppoe.password }), /^Applied/); assert(net.wanStatus(fw2).ok, net.wanStatus(fw2).reason);
await scenario('pppoe-password', cpe2, fw2, 'pppoe', /provider changed the password/, () => wan(fw2, { mode: 'PPPoE', pppoeUser: c2.pppoe.user, pppoePassword: c2.pppoe.password }));

// DHCP: the provider leases to the MAC of the cabled FortiGate port only.
const fw3 = install('fg200f', { racks: ['R03'] }); engineering({ type: 'isp-order', node: fw3.id, plan: 'dhcp' });
const cpe3 = h.installISP(fw3, 'port5', { racks: ['R03'] });
assert.match(wan(fw3, { mode: 'DHCP' }), /^Applied/); assert(net.wanStatus(fw3).ok);
const leaseMac = fw3.net.ispContract.leaseMac; assert.match(leaseMac, /^00:09:0f:/);
const l = fw3.ports.find(p => p.name === 'port5').link; h.unplug(l); h.cable(cpe3, 'LAN2', fw3, 'port6', 'cat6', 30);
assert.match(wan(fw3, { mode: 'DHCP', port: 'port6' }), /^Applied/); assert(net.wanStatus(fw3).ok, 'new port gets a fresh lease'); assert.notEqual(fw3.net.ispContract.leaseMac, leaseMac);
product(fw3, 'wan', { ...fw3.net.product.wan, port: 'port6' });
console.log('PASS: logic provider router · LEDs PWR/FIBER/LOS/LAN, read-only CLI, static sheet ARP, ' + seen.size + ' faults (CPE power, fiber LOS, IP change, PPPoE password) with distinct diagnosis + WAN impact + alarm + repair + persistence, PPPoE 3-attempt lockout with provider log, DHCP lease bound to the cabled MAC.');
process.exit(0);
