// Switch device logic: factory default (console only), VLAN database, RSTP root/blocked ports, storm
// on a loop without STP, LACP member suspension, native VLAN mismatch, MTU mismatch, wrong optic,
// dirty fiber with rx power and CRC counters, MAC table learned from real endpoints, PoE budget,
// running vs startup config lost on power cycle. For every fault: distinct check message, CLI/GUI/LED
// and monitoring agree, office impact where real, repair through real actions, persistence.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
import { helpers } from './build-helpers.mjs';
import { CATALOG } from '../dist/operations.js';
const h = helpers(a), { w, office, config, engineering } = h, o = w.office, s = () => o.state, net = a.lab.kit.network, L = net.logic;
engineering({ type: 'mode', mode: 'free' });
const core = a.byId['CORE-A'], sessions = new Map(), cli = (n, cmd) => { if (!sessions.has(n.id)) sessions.set(n.id, { node: n, config: false }); return net.command(cmd, sessions.get(n.id)); };
const inject = (fault, extra = {}) => { engineering({ type: 'fault', fault, ...extra }); L.invalidate(); return h.op.game.lastFault; };
await office({ type: 'login', user: 'sales', pc: 'F1-sales-PC', password: 'OfficeLab19!' });
const browse = () => office({ type: 'browse', pc: 'F1-sales-PC', url: 'https://example.test' });
for (const n of a.nodes.filter(n => n.type === 'switch' && n.active !== false)) assert(!L.checks(n).some(c => !c.ok && c.severity === 'critical'), n.id + ' healthy baseline');

// RSTP: the core is root; redundant ToR uplinks leave exactly one alternate (blocking) port per ToR.
const tree = L.spanningTree(); assert.equal(tree.root, 'CORE-A'); assert.equal(tree.storm.size, 0);
const tor = a.byId['TOR-01'], stpOut = await cli(tor, 'show spanning-tree');
assert.match(stpOut, /Root ID[\s\S]*\(CORE-A\)/); assert.match(stpOut, /1\/1\/49\s+Root\s+FWD/); assert.match(stpOut, /1\/1\/50\s+Altn\s+BLK/);
assert.deepEqual(L.leds(tor).ports[tor.ports.findIndex(p => p.name === '1/1/50')], { id: '1/1/50', color: 'amber', blink: 'solid' }, 'blocked port LED amber');
assert(L.gui(tor).pages['sw-stp'].tables[0].rows.some(r => r[0] === '1/1/50' && r[2] === 'blocking'), 'GUI shows the blocked port');
// MAC table learns the Sales PC (it sends traffic) on the access port.
assert((await browse()).ok);
const pc = s().pcs['F1-sales-PC'], macOut = await cli(core, 'show mac address-table');
assert(macOut.includes(pc.mac) && new RegExp('10\\s+' + pc.mac + '\\s+DYNAMIC\\s+' + core.ports[pc.port].name.replace(/\//g, '\\/')).test(macOut), 'PC MAC learned on its port');

const seen = new Set();
async function scenario(fault, target, cmd, pattern, repair, extra) {
  const info = inject(fault, target ? { node: target } : {}), n = a.byId[info.device], f = L.checks(n).find(c => c.id === info.check);
  assert(f && !f.ok, fault + ' breaks ' + info.check + ' on ' + n.id + ' · ' + JSON.stringify(L.checks(n).filter(c => !c.ok)));
  assert(!seen.has(f.detail), 'distinct message: ' + f.detail); seen.add(f.detail);
  assert.match(await cli(n, cmd), pattern, fault + ' CLI evidence');
  assert(L.alarms().some(x => x.device === n.id && x.check === info.check && x.message === f.detail), fault + ' alarm');
  const blocking = L.gui(n).blocking; if (f.severity === 'critical') assert.equal(blocking.id, info.check, fault + ' GUI blocking box');
  if (extra) await extra(info, n);
  const saved = w.snapshot(); w.restore(saved); L.invalidate(); assert(!L.checks(a.byId[n.id]).find(c => c.id === info.check).ok, fault + ' persists');
  await repair(info, a.byId[n.id]); L.invalidate();
  assert(L.checks(a.byId[n.id]).find(c => c.id === info.check).ok, fault + ' repaired · ' + JSON.stringify(L.checks(a.byId[n.id]).find(c => c.id === info.check)));
  assert(!L.alarms().some(x => x.device === n.id && x.check === info.check), fault + ' alarm cleared');
  console.log('  ' + fault + ' → ' + f.detail);
}
const portOf = (n, name) => n.ports.findIndex(p => p.name === name);
// Loop without STP → broadcast storm takes the office down; enabling STP breaks the loop.
await scenario('stp-loop', 'CORE-A', 'show spanning-tree', /Spanning tree is disabled[\s\S]*broadcast storm detected/, async info => { for (const id of [info.device, info.peer]) { const n = a.byId[id]; await cli(n, 'configure terminal'); await cli(n, 'spanning-tree enable'); await cli(n, 'end'); } }, async (info, n) => {
  const r = await browse(); assert(!r.ok); assert.equal(h.failedStep(r).name, 'Physical and access network'); assert.match(r.reason, /Broadcast storm on CORE-A/);
  assert.equal(L.leds(n).ports.find(x => x.color === 'green')?.blink, 'fast', 'storm: port LEDs blink fast');
});
{ const r = await browse(); if(!r.ok)console.log('DBG', JSON.stringify(o.activeFirewall()?.net.vlans), JSON.stringify(r.steps).slice(0,400)); assert(r.ok, 'office recovers after STP is enabled: ' + r.reason); }
assert.match(await cli(a.byId['CORE-B'], 'show spanning-tree'), /Altn\s+BLK/, 'the extra cable now blocks on the non-root side instead of looping');
// LACP: second member with a different VLAN list is suspended.
await scenario('lacp-mismatch', 'CORE-A', 'show port-channel summary', /Po1\s+.*\(P\)[\s\S]*\(s\) suspended · VLAN configuration differs/, async (info, n) => { const p = n.ports[portOf(n, info.port)], good = n.ports.find(x => x.cfg.lag === 1 && x !== p); config({ type: 'port', node: n.id, index: n.ports.indexOf(p), value: { mode: good.cfg.mode, access: good.cfg.access, allowed: [...good.cfg.allowed] } }); });
assert.match(await cli(core, 'show port-channel summary'), /Po1\s+\S+\(P\)\n\s+\S+\(P\)/, 'both members bundled');
// Native VLAN mismatch (warning, traffic still flows).
await scenario('native-vlan', 'CORE-A', 'show interfaces status', /trunk/, async (info, n) => { const i = portOf(n, info.port); await cli(n, 'configure terminal'); await cli(n, 'interface ' + info.port); await cli(n, 'switchport trunk native vlan 1'); await cli(n, 'end'); }, async () => assert((await browse()).ok, 'native mismatch is a warning, not an outage'));
// MTU mismatch takes the link down with an explicit reason.
await scenario('mtu-mismatch', 'CORE-A', 'show interfaces status', /err-disabled\s+.*MTU mismatch 9216 ≠ 1500/, (info, n) => config({ type: 'port', node: n.id, index: portOf(n, info.port), value: { mtu: 1500 } }));
// Wrong optic → unsupported transceiver; the right optic from stock fixes it.
await scenario('wrong-optic', 'CORE-A', 'show interfaces transceiver', /unsupported transceiver/, (info, n) => { const p = n.ports[info.portIndex], optic = CATALOG.find(c => c.type === 'optic' && c.speed === p.speed && c.medium === p.medium && c.reach === 'SR'); const st = h.buy(optic.id); return engineering({ type: 'optic', id: st.id, node: n.id, port: info.portIndex }); }, async (info, n) => { assert.equal(L.leds(n).ports[info.portIndex].color, 'amber'); });
// Dirty fiber: rx low, flapping, CRC counters rise; cleaning restores it.
await scenario('dirty-fiber', 'CORE-A', 'show interfaces transceiver', /Rx power -14\.2 dBm[\s\S]*Rx power low · link flaps/, (info, n) => engineering({ type: 'clean', node: n.id, port: info.portIndex }), async (info, n) => { await new Promise(r => setTimeout(r, 1100)); assert.match(await cli(n, 'show interfaces counters errors'), new RegExp(n.ports[info.portIndex].name.replace(/\//g, '\\/') + '\\s+0\\s+[1-9]\\d*')); assert.equal(L.leds(n).ports[info.portIndex].blink, 'fast'); });

// VLAN database: a port in a VLAN that does not exist drops its frames.
const free = core.ports.findIndex(p => !p.link && !p.service && p.medium === 'Ethernet' && !Object.values(s().pcs).some(x => x.port === core.ports.indexOf(p)));
const srv = a.byId['SERVER-06'], sp = srv.ports.findIndex(p => p.name === 'NIC-1'), l6 = srv.ports[sp].link; h.unplug(l6);
h.cable(srv, sp, core, free, 'dac25'); config({ type: 'port', node: core.id, index: free, value: { mode: 'access', access: 333 } }); L.invalidate();
assert.match(L.checks(core).find(c => c.id === 'vlan-db').detail, /carries VLAN 333 but it is not in the VLAN database/);
assert.match(await cli(core, 'configure terminal') + await cli(core, 'interface ' + core.ports[free].name) + await cli(core, 'switchport access vlan 334'), /Create that VLAN first|Create the VLAN/i);
await cli(core, 'end'); config({ type: 'vlan', node: core.id, id: 333, name: 'LAB' }); L.invalidate(); assert(L.checks(core).find(c => c.id === 'vlan-db').ok);
// PoE budget: lowering the budget powers off the lowest-priority port first.
await cli(core, 'configure terminal'); await cli(core, 'power inline budget 60'); await cli(core, 'end'); L.invalidate();
const poe = await cli(core, 'show power inline'); assert.match(poe, /Available: 60 W/); assert.match(poe, /F1-engineering-AP\s+low\s+0 W\s+off · budget exceeded/);
assert.match(L.checks(core).find(c => c.id === 'poe-budget').detail, /PoE budget exceeded: 102 W requested, 60 W available/);
await cli(core, 'configure terminal'); await cli(core, 'interface ' + core.ports[s().aps['F1-executive-AP'].port].name); await cli(core, 'power inline priority high'); await cli(core, 'end'); L.invalidate();
assert.match(await cli(core, 'show power inline'), /F1-executive-AP\s+high\s+25\.5 W\s+on/, 'high priority port keeps power');
config({ type: 'cli-state', node: core.id, op: 'global', value: { poeBudget: 120 } });

// A factory OS10 switch: console only, then running vs startup config across a power cycle.
const os10 = h.install('dells5248', { racks: ['R05'] }); L.invalidate();
assert.equal(L.first(os10).id, 'mgmt-ip'); assert.match(L.first(os10).detail, /no management IP \(factory default\)/);
const con = { node: os10, mode: 'SERIAL CONSOLE', config: false };
for (const c of ['configure terminal', 'interface mgmt 1/1/1', 'ip address 10.10.70.61/24', 'exit', 'end']) await net.command(c, con);
{ const hub = a.byId['MGMT-SW'], hp = hub.ports.findIndex((p, i) => !p.link && !p.service && p.speed === 1 && !Object.values(s().pcs).some(pc => pc.switch === hub.id && pc.port === i)); h.cable(os10, 'MGMT UPLINK', hub, hp, 'cat6', 40); config({ type: 'port', node: hub.id, index: hp, value: { access: os10.net.vlan } }); }
L.invalidate(); assert.match(L.checks(os10).find(c => c.id === 'unsaved').detail, /no startup-config saved/);
await net.command('write memory', con); L.invalidate(); assert(L.checks(os10).find(c => c.id === 'unsaved').ok, 'saved');
await net.command('configure terminal', con); await net.command('vlan 444', con); await net.command('end', con); L.invalidate();
assert.match(L.checks(os10).find(c => c.id === 'unsaved').detail, /running-config has unsaved changes/); assert.match(await net.command('show configuration status', con), /unsaved changes/);
assert.equal(L.leds(os10).front.find(x => x.id === 'status').blink, 'slow', 'warning LED · ' + JSON.stringify(L.first(os10)));
for (const psu of [0, 1]) { engineering({ type: 'power', node: os10.id, psu, feed: null }); const cord = h.op.game.stock.find(x => x.holders.includes('ENGINEER-01')); engineering({ type: 'drop', id: cord.id, position: { x: -38, z: 8 + psu * 4 } }); }
assert.equal(L.state(os10).boot.phase, 'off');
const cord = h.op.game.stock.find(x => x.powerAnchor && !x.holders.length && x.powerAnchor.rack === os10.rack); engineering({ type: 'grab', id: cord.id }); engineering({ type: 'power', id: cord.id, node: os10.id, psu: 0, feed: cord.powerAnchor.feed });
assert.equal(L.state(os10).boot.phase, 'post', 'booting after power returns');
assert(!os10.net.vlans[444], 'unsaved VLAN lost at power cycle'); assert.equal(os10.net.ip, '10.10.70.61', 'saved management IP kept');
assert.match(await net.command('frobnicate', con), /% Error: Unrecognized command\./, 'OS10-style error');
assert.match(await cli(a.byId['CORE-A'], 'show interfaces status'), /Port\s+Status/);
// ? and prefix? list the device's own commands (the ones this module answers) next to the base CLI help.
{ const help = await cli(core, '?'), pre = await cli(core, 'show spanning?');
  assert.match(help, /CORE-A · switch commands:[\s\S]*show spanning-tree/); assert.match(help, /show interface/);
  assert.match(pre, /show spanning-tree brief/); assert(!/show mac address-table/.test(pre), 'prefix filters the list'); }
console.log('PASS: logic switch · ? / prefix? help, RSTP root/alternate, MAC learning, ' + seen.size + ' faults (storm, LACP, native VLAN, MTU, optic, dirty fiber) with distinct CLI/GUI/LED/alarm diagnoses + repair + persistence, VLAN database, PoE priority/budget, factory console-only, startup-config lost changes on power cycle, vendor errors.');
process.exit(0);
