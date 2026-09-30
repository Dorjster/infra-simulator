// PDU logic: per-outlet load from device watt draw, N+1 capacity warning, overload → breaker trip →
// devices fed only by that PDU go dark (cascade), reset refused while still overloaded, repair by
// moving a cord to PDU B, reset at the rack, servers boot again. GUI/CLI/LEDs/monitoring agree;
// persistence of the tripped breaker through save/load.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
import { helpers } from './build-helpers.mjs';
import { PDU_RATING_W, grid } from '../dist/power-grid.js';
const h = helpers(a), { w, engineering, op } = h, net = a.lab.kit.network, L = net.logic;
engineering({ type: 'mode', mode: 'free' });
const pdu = id => { L.invalidate(); return L.pdu(id); };
assert.equal(L.pdus().length, 12, 'six racks × PDU A/B');
let A = pdu('R04-PDU-A'); assert(!A.state.tripped); assert(A.state.outlets.some(o => o.node === 'GPU-01' && o.watts > 2500), 'GPU-01 outlet load');
assert.match(L.pduCli('R04-PDU-A', 'olStatus all'), /GPU-01 PSU 1: On · \d+ W/); assert.match(L.pduCli('R04-PDU-A', 'devReading power'), /kW \(\d+% of 11\.04 kW\)/);
assert.match(L.pduCli('R04-PDU-A', 'frob'), /E101: Command Not Found/);
const n1 = A.checks.find(c => c.id === 'n-plus-1'); assert(!n1.ok && n1.severity === 'warning', 'GPU rack has no N+1 power capacity');
// Overload: both GPU PSUs moved to PDU A → A trips → the GPUs go dark, the ToRs survive on B.
engineering({ type: 'fault', fault: 'pdu-overload', rack: 'R04' }); A = pdu('R04-PDU-A');
assert(A.state.tripped, 'breaker tripped'); assert(grid.tripped['R04:A']);
const br = A.checks.find(c => c.id === 'breaker'); assert(!br.ok); assert.match(br.detail, new RegExp('breaker TRIPPED at \\d+ W \\(rating ' + PDU_RATING_W + ' W\\) · \\d+ outlet\\(s\\) dark'));
assert.deepEqual(A.leds.front[0], { id: 'breaker', color: 'red', blink: 'fast' });
const gpu = a.byId['GPU-01']; assert.match(net.localStatus(gpu).reason, /NO POWER · PDU R04-A breaker tripped/); assert.equal(L.state(gpu).power.live, 0);
assert(net.localStatus(a.byId['TOR-03']).ok, 'ToR keeps running on PDU B');
assert(L.alarms().some(x => x.device === 'R04-PDU-A' && x.check === 'breaker'), 'PDU alarm'); assert(op.alerts().some(x => x.device === 'R04-PDU-A'), 'NOC critical');
assert.equal(A.gui.summary[0][1], 'TRIPPED'); assert.match(L.pduCli('R04-PDU-A', 'phReading all current'), /1:1: 0\.0 A/);
assert.match(op.game.history[0].message + op.game.history[1].message, /PDU R04-A breaker tripped at \d+ W/);
{ const saved = w.snapshot(); w.restore(saved); assert(grid.tripped['R04:A'], 'tripped breaker persists'); }
// Reset without fixing the load: trips again immediately with the reason.
assert.match(engineering({ type: 'pdu-reset', rack: 'R04', feed: 'A' }), /Breaker tripped again immediately: \d+ W on PDU R04-A exceeds 11040 W/);
// Repair: move PSU 2 of each GPU server to PDU B with a new cord, then reset at the rack.
for (const id of ['GPU-01', 'GPU-02']) { engineering({ type: 'power', node: id, psu: 1, feed: null }); engineering({ type: 'drop', id: op.game.stock.find(x => x.holders.includes('ENGINEER-01')).id, position: { x: -38, z: id === 'GPU-01' ? 4 : 8 } }); engineering({ type: 'power', id: h.buy('power').id, node: id, psu: 1, feed: 'B' }); }
assert.match(engineering({ type: 'pdu-reset', rack: 'R04', feed: 'A' }), /PDU R04-A breaker reset · \d+ W of 11040 W/); A = pdu('R04-PDU-A');
assert(!A.state.tripped); assert(A.checks.find(c => c.id === 'breaker').ok);
assert.equal(L.state(gpu).boot.phase, 'post', 'GPU server reboots after power returns'); gpu.physical.bootUntil = 1; op.tick(); L.invalidate(); assert.equal(L.state(gpu).boot.phase, 'running');
assert(!L.alarms().some(x => x.device === 'R04-PDU-A' && x.check === 'breaker'), 'alarm cleared');
console.log('PASS: logic pdu · per-outlet watts/amps, N+1 warning, overload trip with dark outlets and survivors on the other feed, CLI/GUI/LED/alarm/history agreement, persisted breaker state, reset refused while overloaded, cord move + reset + reboot.');
process.exit(0);
