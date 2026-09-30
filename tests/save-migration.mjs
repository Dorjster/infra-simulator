// Save format 31: a genuine v30 campaign save (tests/fixtures/v30-campaign.json, written by the v30
// code) and a v29-shaped variant (logical ISP handoff, no provider router) load, migrate and keep
// working; new v31 state (tripped PDU breaker, RAID failure, SEL, LACP/STP settings) survives
// save/load.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { a } from './app-harness.mjs';
import { helpers } from './build-helpers.mjs';
import { grid } from '../dist/power-grid.js';
import { deviceRuntime } from '../dist/device-runtime.js';
const h = helpers(a), { w, office, engineering, op } = h, o = w.office, net = a.lab.kit.network, L = net.logic;
const v30 = JSON.parse(fs.readFileSync(new URL('./fixtures/v30-campaign.json', import.meta.url)));
assert.equal(v30.format, undefined, 'fixture is a pre-v31 save');
w.restore(v30); L.invalidate();
assert.equal(w.migratedFrom, 30); assert.equal(op.game.mode, 'campaign'); assert.deepEqual(op.game.pdus, {});
assert.equal(o.state.chapter, 1, 'contract progress kept');
await office({ type: 'login', user: 'sales', pc: 'F1-sales-PC', password: 'OfficeLab19!' });
assert((await office({ type: 'browse', pc: 'F1-sales-PC', url: 'https://example.test' })).ok, 'v30 Internet path still works');
const devices = a.nodes.filter(n => n.active !== false && n.spec);
assert.equal(devices.length, 4);
for (const n of devices) { const st = L.state(n); assert(st.health, n.id + ' device logic runs on migrated state'); }
const fw = devices.find(n => n.type === 'firewall'), cpe = devices.find(n => n.type === 'isp'), srv = devices.find(n => n.type === 'server');
assert(!L.checks(fw).some(c => !c.ok && c.severity === 'critical' && !['mgmt-ip', 'mgmt-path', 'admin-password'].includes(c.id)), JSON.stringify(L.checks(fw).filter(c => !c.ok)));
{ const f = L.first(fw); assert.equal(f.id, 'admin-password', 'v31 rule on an old save: the next step is named'); assert.match(f.fixHint, /System → Settings/); }
assert.equal(L.leds(cpe).front.find(x => x.id === 'SERVICE').color, 'green');
assert.equal(L.state(srv).controller.boss.state, 'optimal', 'controller model created lazily for old servers');
assert.equal(deviceRuntime(srv).os, 'VMware ESXi');
assert.equal(w.snapshot().format, 31, 'next save uses format 31');
// v29-shaped save: logical ISP handoff, no provider router.
const v29 = structuredClone(v30); delete v29.format;
const cpeId = v29.devices.find(d => d.type === 'isp').id; v29.devices = v29.devices.filter(d => d.id !== cpeId); v29.cables = v29.cables.filter(c => c.a !== cpeId && c.b !== cpeId);
v29.operations.installed = v29.operations.installed.filter(id => id !== cpeId);
for (const row of v29.nets) if (row.net.ispContract) { row.net.ispContract.physical = false; delete row.net.ispContract.planName; }
w.restore(v29); L.invalidate(); assert.equal(w.migratedFrom, 30);
{ const f = a.byId[fw.id]; assert(net.wanStatus(f).ok, 'logical circuit keeps working: ' + net.wanStatus(f).reason); assert((await office({ type: 'browse', pc: 'F1-sales-PC', url: 'https://example.test' })).ok); }
// v31 state round trip.
w.restore(v30); L.invalidate();
engineering({ type: 'mode', mode: 'free' });
engineering({ type: 'fault', fault: 'pdu-overload', rack: 'R04' }); engineering({ type: 'fault', fault: 'raid-disk', node: 'SERVER-02' }); engineering({ type: 'fault', fault: 'stp-loop', node: 'CORE-A' });
op.tick(); L.invalidate();
const before = { pdu: !!grid.tripped['R04:A'], vd: L.checks(a.byId['SERVER-02']).find(c => c.id === 'vd-VD0').detail, storm: [...L.spanningTree().storm].sort().join(), sel: (a.byId['SERVER-02'].net.sel || []).length };
const saved = JSON.parse(JSON.stringify(w.snapshot())); assert.equal(saved.format, 31);
engineering({ type: 'mode', mode: 'free' }); assert(!grid.tripped['R04:A'], 'fresh world');
w.restore(saved); L.invalidate();
assert.deepEqual({ pdu: !!grid.tripped['R04:A'], vd: L.checks(a.byId['SERVER-02']).find(c => c.id === 'vd-VD0').detail, storm: [...L.spanningTree().storm].sort().join(), sel: (a.byId['SERVER-02'].net.sel || []).length }, before, 'v31 device state persists');
assert(before.pdu && before.sel > 0 && before.storm.length);
console.log('PASS: save migration · real v30 campaign save and a v29-shaped logical-handoff save load as format 31 and keep their contract progress, Internet path and device logic; v31 breaker/RAID/STP/SEL state survives save and load.');
process.exit(0);
