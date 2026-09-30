// Physical ISP circuits: each plan ships a provider router; the WAN must match the circuit sheet.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
import { helpers } from './build-helpers.mjs';
const h = helpers(a), { engineering, product, install, op } = h, net = a.lab.kit.network;
engineering({ type: 'mode', mode: 'campaign', enterprise: true }); op.game.budget = 500000;
assert.throws(() => engineering({ type: 'order', sku: 'ispcpe', quantity: 1, length: 1 }), /supplied with an ISP circuit/);
const wan = (fw, value) => product(fw, 'wan', { port: 'port5', dns: '198.51.100.53', enabled: true, defaultRoute: true, ...value });
// PPPoE broadband.
const fw1 = install('fg200f', { racks: ['R01'] });
engineering({ type: 'isp-order', node: fw1.id, plan: 'pppoe' });
const c1 = fw1.net.ispContract; assert.equal(c1.mode, 'PPPoE'); assert(c1.pppoe.user && c1.pppoe.password);
assert.match(wan(fw1, { mode: 'Static', ip: c1.ip, prefix: 32, gateway: c1.gateway }), /circuit is PPPoE/);
assert.match(wan(fw1, { mode: 'PPPoE', pppoeUser: c1.pppoe.user, pppoePassword: 'wrong' }), /PPPoE authentication failed/);
assert.match(wan(fw1, { mode: 'PPPoE', pppoeUser: c1.pppoe.user, pppoePassword: c1.pppoe.password }), /^Applied/);
assert(!JSON.stringify(fw1.net.product.wan).includes(c1.pppoe.password), 'PPPoE password is not stored in the WAN config');
assert.match(net.wanStatus(fw1).reason, /not racked yet/);
const cpe1 = h.installISP(fw1, 'port5', { racks: ['R01', 'R02'] });
assert(net.wanStatus(fw1).ok, net.wanStatus(fw1).reason); assert.match(net.wanStatus(fw1).reason, /PPPoE .*\/32/);
// Static /29 block with extra public addresses.
const fw2 = install('fg200f', { racks: ['R02'] });
engineering({ type: 'isp-order', node: fw2.id, plan: 'fiber29' });
const c2 = fw2.net.ispContract; assert.equal(c2.prefix, 29); assert.equal(c2.block.usable.length, 4);
assert.match(wan(fw2, { mode: 'Static', ip: c2.ip, prefix: 30, gateway: c2.gateway }), /circuit sheet: .*\/29/);
assert.match(wan(fw2, { mode: 'Static', ip: c2.ip, prefix: 29, gateway: c2.gateway }), /^Applied/);
h.installISP(fw2, 'port5', { racks: ['R02', 'R03'] });
assert(net.wanStatus(fw2).ok, net.wanStatus(fw2).reason);
// The provider router of one circuit does not serve another firewall.
const l = fw2.ports.find(p => p.name === 'port5').link; h.unplug(l);
h.cable(cpe1, 'LAN2', fw2, 'port5', 'cat6', 30);
assert.match(net.wanStatus(fw2).reason, /not the provider router|cabled to/);
const saved = h.w.snapshot(); h.w.restore(saved); assert(net.wanStatus(a.byId[fw1.id]).ok, 'circuit and provider router persist');
console.log('PASS: ISP plans · provider router required, PPPoE authentication, /29 block addressing, per-circuit router, persistence.');
process.exit(0);
