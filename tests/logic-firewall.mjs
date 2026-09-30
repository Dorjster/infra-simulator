// FortiGate device logic: one config store (GUI ↔ CLI ↔ office evaluator), routing table, DHCP,
// DNS, policies/NAT/VIP, hit counters and sessions, debug flow, SD-WAN, HA, first login, and for
// every injected fault: a distinct check message that GUI data, CLI output, LEDs and monitoring agree
// on, recovery after a real repair, and persistence through save/load.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
import { helpers } from './build-helpers.mjs';
const h = helpers(a), { w, office, config, engineering } = h, o = w.office, s = () => o.state, net = a.lab.kit.network, L = net.logic;
engineering({ type: 'mode', mode: 'free' });
const fw = a.byId[s().bindings.firewall], fwSession = { node: fw }, cli = cmd => net.command(cmd, fwSession), inject = (fault, extra = {}) => { engineering({ type: 'fault', fault, ...extra }); L.invalidate(); return h.op.game.lastFault; };
await office({ type: 'login', user: 'itadmin', password: 'OfficeLab19!' });
await office({ type: 'login', user: 'sales', pc: 'F1-sales-PC', password: 'OfficeLab19!' });
const browse = url => office({ type: 'browse', pc: 'F1-sales-PC', url: url || 'https://example.test' });
const critical = () => L.checks(fw).filter(c => !c.ok && c.severity === 'critical');
assert.deepEqual(critical().map(c => c.id), [], 'healthy baseline: ' + JSON.stringify(critical()));
assert((await browse()).ok, 'baseline Internet');

// Routing table: connected VLANs + default route, longest prefix, inactive when the interface is down.
let rib = await cli('get router info routing-table all');
assert.match(rib, /C\s+10\.10\.10\.0\/24 is directly connected, VLAN10/); assert.match(rib, /S\*\s+0\.0\.0\.0\/0 \[10\/0\] via 203\.0\.113\.5/);
await office({ type: 'configure', page: 'routes', value: { id: 'lab', destination: '10.10.10.128/25', gateway: '10.10.50.254', interface: '50', source: 'any', metric: 10, enabled: true } });
assert.match(await cli('get router info routing-table details 10.10.10.200'), /Routing entry for 10\.10\.10\.128\/25/, 'longest prefix /25 beats connected /24');
assert.match(await cli('get router info routing-table details 10.10.10.20'), /Routing entry for 10\.10\.10\.0\/24/);
const trunks = fw.ports.map((p, i) => [p, i]).filter(([p]) => p.cfg.mode === 'trunk' && p.cfg.allowed.includes(10)).map(([, i]) => i);
assert(trunks.length >= 2, 'legacy FortiGate has two LAN trunks'); config({ type: 'port', node: fw.id, index: trunks[0], value: { admin: false } });
assert.match(await cli('get router info routing-table all'), /C\s+10\.10\.10\.0\/24 is directly connected/, 'one trunk down: VLAN10 still up on the other');
config({ type: 'port', node: fw.id, index: trunks[1], value: { admin: false } });
rib = await cli('get router info routing-table all');
assert.match(rib, /Inactive[\s\S]*C 10\.10\.10\.0\/24 dev VLAN10 · parent port down/, 'connected route leaves the RIB when its interface is down');
assert.equal(L.first(fw).id, 'vlan-10'); assert.match(L.first(fw).detail, /VLAN10 .* is down · parent port/);
for (const i of trunks) config({ type: 'port', node: fw.id, index: i, value: { admin: true } });
await office({ type: 'delete-record', page: 'routes', id: 'lab' });

// Hit counters and sessions increase only with real traffic.
const hits = () => s().policies['internet-10'].hits || 0, before = hits();
o.evaluate('F1-sales-PC', 'https://example.test', s().users.sales); assert.equal(hits(), before, 'a path test is not traffic');
assert((await browse()).ok); assert.equal(hits(), before + 1, 'browse increments the hit counter');
assert.match(await cli('diagnose firewall policy hit-count'), /internet-10\s+10 → wan\s+accept\s+\d+/);
assert.match(await cli('diagnose sys session list'), /policy_id=internet-10 SNAT[\s\S]*10\.10\.10\.100:\d+->198\.51\.100\.20:443\(203\.0\.113\.6/);
// debug flow matches the GUI diagnostics stages.
const flow = await cli('diagnose debug flow F1-sales-PC https://example.test');
assert.match(flow, /find a route: .* via 17/); assert.match(flow, /Allowed by Policy-internet-10: SNAT/); assert.match(flow, /✓ Egress/);
const gui = L.gui(fw); assert(gui.pages['fg-routing'] && gui.pages['fg-sessions'] && gui.pages['fg-dhcp-leases'], 'GUI pages come from gui()');
assert(gui.pages['fg-sessions'].tables[0].rows.some(r => r[2] === 'internet-10'), 'GUI session table = CLI session list');

// One config store: CLI edits show up in the GUI/office model in the same order, and back.
for (const line of ['config firewall policy', 'edit "cli-block"', 'set srcintf VLAN90', 'set dstintf port17', 'set srcaddr all', 'set dstaddr all', 'set service HTTPS', 'set action deny', 'next', 'end']) await cli(line);
assert.equal(s().policies['cli-block']?.action, 'deny', 'CLI policy stored in the office model'); assert.equal(s().policies['cli-block'].dst, 'wan'); assert.equal(s().policies['cli-block'].src, '90');
for (const line of ['config firewall policy', 'move "cli-block" before "internet-10"', 'end']) await cli(line);
const order = Object.keys(s().policies); assert(order.indexOf('cli-block') < order.indexOf('internet-10'), 'CLI move changes GUI order');
const full = await cli('show full-configuration'); assert(full.indexOf('edit "cli-block"') < full.indexOf('edit "internet-10"'), 'show full-configuration uses the same order');
assert.match(await cli('config firewall policy'), /\(policy\) #/); assert.match(await cli('edit "x"') + await cli('set srcintf VLAN999') + await cli('next'), /node_check_object fail! for srcintf VLAN999[\s\S]*Command fail\. Return code -3/, 'FortiOS-style validation error'); await cli('end');
await office({ type: 'configure', page: 'policies', value: { ...s().policies['cli-block'], action: 'accept' } });
assert.match(await cli('show full-configuration'), /edit "cli-block"[\s\S]*?set action accept/, 'GUI edit visible in the CLI');
await office({ type: 'delete-record', page: 'policies', id: 'cli-block' }); delete s().policies.x;
// DHCP reservation outside the range is rejected with a clear message.
await assert.rejects(office({ type: 'configure', page: 'dhcp', value: { ...s().dhcp[10], reservations: '02:19:01:00:00:10=10.10.10.50' } }), /Reserved address 10\.10\.10\.50 .* outside the DHCP range \.100–\.199/);
// DNS modes: non-recursive answers only local records.
await office({ type: 'configure', page: 'wan', value: { dnsMode: 'non-recursive' } });
{ const r = await browse(); assert.equal(h.failedStep(r).name, 'DNS resolver'); assert.match(r.reason, /non-recursive/); }
await office({ type: 'configure', page: 'wan', value: { dnsMode: 'recursive', dnsForward: false } }); assert((await browse()).ok, 'recursive DNS needs no forwarder');
await office({ type: 'configure', page: 'wan', value: { dnsMode: 'forward-only', dnsForward: true } });

// Faults: distinct diagnosis in checks = GUI blocking box = CLI evidence = LEDs = monitoring; repair; persistence.
const seen = new Set();
async function scenario(fault, cliCmd, cliPattern, repair, extra) {
  const info = inject(fault); const f = L.first(fw);
  assert.equal(f?.id, info.check, fault + ' breaks ' + info.check + ' (got ' + JSON.stringify(f) + ')');
  assert(!seen.has(f.detail), 'distinct message: ' + f.detail); seen.add(f.detail);
  assert.equal(L.gui(fw).blocking?.detail, f.detail, 'GUI what-is-blocking = check');
  assert.match(await cli(cliCmd), cliPattern, fault + ' CLI evidence');
  const status = L.leds(fw).front.find(x => x.id === 'status'); assert.deepEqual([status.color, status.blink], ['amber', 'fast'], fault + ' status LED');
  assert(L.alarms().some(x => x.device === fw.id && x.check === info.check && x.message === f.detail), fault + ' monitoring alarm from the module');
  assert(h.op.alerts().some(x => x.device === fw.id), fault + ' in the NOC alert list');
  if (extra) await extra(info);
  const saved = w.snapshot(); w.restore(saved); L.invalidate(); assert.equal(L.first(a.byId[fw.id])?.id, info.check, fault + ' persists through save/load');
  await repair(info); L.invalidate();
  assert(!L.checks(fw).some(c => c.id === info.check && !c.ok), fault + ' repaired');
  assert(!L.alarms().some(x => x.device === fw.id && x.check === info.check), fault + ' alarm cleared');
  console.log('  ' + fault + ' → ' + f.detail);
}
await scenario('dns-forwarder-off', 'get system dns', /forward-to-ISP\s+: disable/, () => office({ type: 'configure', page: 'wan', value: { dnsForward: true } }), async () => { const r = await browse(); assert.match(r.reason, /forwarding to the ISP resolver is disabled/); });
await scenario('policy-order', 'show full-configuration', /edit "block-10"[\s\S]*set action deny[\s\S]*edit "internet-10"/, async () => { for (const l of ['config firewall policy', 'move "internet-10" before "block-10"', 'end']) await cli(l); }, async () => { const r = await browse(); assert.equal(h.failedStep(r).name, 'Firewall policy'); assert.match(r.reason, /block-10: deny/); });
await scenario('missing-nat', 'diagnose debug flow F1-sales-PC https://example.test', /no SNAT for private source/, async info => { await office({ type: 'configure', page: 'policies', value: { ...s().policies[info.policy], nat: true } }); });
await scenario('dhcp-exhausted', 'execute dhcp lease-list', /F1-sales-PC\s+VLAN10\s+no lease \(DHCP scope exhausted/, () => office({ type: 'configure', page: 'dhcp', value: { ...s().dhcp[10], end: 199, reservations: '' } }), async () => { const r = await browse(); assert.match(r.reason, /DHCP scope exhausted: all 0 addresses of \.100–\.100/); });
await scenario('vip-no-policy', 'show firewall vip', /edit "web-publish"[\s\S]*set mappedip "10\.10\.50\.10"/, () => office({ type: 'configure', page: 'policies', value: { id: 'publish-web', src: 'wan', dst: '50', source: 'any', destination: '10.10.50.10/32', service: 'HTTPS', action: 'accept', nat: false, enabled: true, start: 0, end: 24 } }), async info => { const r = await office({ type: 'probe', tool: 'WAN inbound', url: info.url }); assert.match(r.reason, /no wan → VLAN 50 accept policy exists/); });
assert((await browse()).ok, 'Internet works after all repairs');

// SD-WAN: a second member takes over within one tick; the health check shows both members.
await office({ type: 'purchase', sku: 'wan2' }); s().orders.at(-1).arrives = 0; o.tick(Date.now() + 5000);
await office({ type: 'install', id: s().inventory.find(i => i.sku === 'wan2').id });
await office({ type: 'failure', kind: 'wan', enabled: true }); L.invalidate();
assert.match(await cli('diagnose sys sdwan health-check'), /Seq\(1 17\): state\(dead\)[\s\S]*Seq\(2 wan2\): state\(alive\)[\s\S]*Active member: wan2/);
{ const r = await browse(); assert(r.ok, 'SD-WAN failover keeps the Internet up: ' + r.reason); assert(r.steps.some(x => x.name === 'SD-WAN' && /failed over to member 2/.test(x.detail))); }
assert.equal(L.checks(fw).find(c => c.id === 'sdwan').ok, false); assert.equal(L.checks(fw).find(c => c.id === 'sdwan').severity, 'warning');
await office({ type: 'failure', kind: 'wan', enabled: false });
// HA A-P: failover on power loss; `get system ha status` names the new primary.
const peer = a.byId['FIREWALL-B'];
await office({ type: 'configure', page: 'ha', value: { enabled: true, peer: peer.id, heartbeat: true, synced: true } });
assert.match(await cli('get system ha status'), /Mode: HA A-P[\s\S]*FIREWALL-A is selected as the primary/);
for (const psu of [0, 1]) { engineering({ type: 'power', node: fw.id, psu, feed: null }); const cord = h.op.game.stock.find(x => x.holders.includes('ENGINEER-01')); engineering({ type: 'drop', id: cord.id, position: { x: -38, z: 10 + psu * 4 } }); }
L.invalidate(); assert.equal(o.activeFirewall().id, peer.id, 'secondary takes over');
assert.match(await net.command('get system ha status', { node: peer }), /FIREWALL-B is selected as the primary/);
assert.equal(L.leds(fw).front.find(x => x.id === 'power').color, 'off');

// First login on a factory FortiGate forces the password change (console), then management.
const fg = h.install('fg200f', { racks: ['R05'] }), console1 = { node: fg, mode: 'SERIAL CONSOLE' };
assert.equal(L.first(fg).id, 'admin-password'); assert.match(L.first(fg).detail, /factory default \(blank\)/);
assert.match(await net.command('get system status', console1), /You are forced to change your password/);
assert.match(await net.command('execute set-password short', console1), /at least 8 characters/);
assert.match(await net.command('execute set-password Fortinet#2026', console1), /Password changed[\s\S]*Applied/);
L.invalidate(); assert.equal(L.first(fg).id, 'mgmt-ip', 'next blocking step: management IP');
assert.match(await net.command('get system status', console1), /Version: FortiGate-200F v7\.4\.3/);
console.log('PASS: logic firewall · routing table (longest prefix, inactive routes), hit counters + sessions from real traffic, debug flow, CLI ↔ GUI one store, DHCP reservations, DNS modes, ' + seen.size + ' faults with distinct GUI/CLI/LED/alarm diagnoses + repair + persistence, SD-WAN failover, HA failover, forced first-login password change.');
process.exit(0);
