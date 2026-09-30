// Storage array logic: setup incomplete → ready, controller A failure with ALUA failover and repair,
// pool drive failure → rebuild → optimal, failures beyond protection → failed pool, snapshots fill the
// pool → read-only volumes → VM down, CHAP mismatch, LUN IDs unique per host, multipath view on the
// host, performance under degradation. GUI/CLI/LEDs/monitoring agree; repair; persistence.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
import { helpers } from './build-helpers.mjs';
import { builder } from '../dist/scenarios.js';
import { deviceRuntime } from '../dist/device-runtime.js';
import { configuredProduct } from '../dist/product-profiles.js';
const h = helpers(a), { w, engineering, device, product, op } = h, net = a.lab.kit.network, L = net.logic;
engineering({ type: 'mode', mode: 'free' });
const b = builder(w, a.byId, 'ENGINEER-01'), cli = (n, c) => net.command(c, { node: n }), ticks = k => { for (let i = 0; i < k; i++) op.tick(); L.invalidate(); };
const inject = (fault, node) => { engineering({ type: 'fault', fault, node }); L.invalidate(); return op.game.lastFault; };
// Setup incomplete before the wizard.
const fresh = b.install('me5024fc'); L.invalidate();
assert.equal(L.first(fresh).id, 'mgmt-ip'); assert.match(L.checks(fresh).find(c => c.id === 'setup').detail, /Setup incomplete · Admin password and system name, Controller A management IP, Controller B management IP, Time \/ NTP/);
assert.match(await cli(fresh, 'show system'), /Setup: INCOMPLETE/);
const lab = b.iscsiLab(), { array, srv } = lab; L.invalidate();
const vis = () => net.volumeAccess(array, 'DATA-01', srv), vm = () => net.vmState(srv, deviceRuntime(srv).vms['APP-01']);
assert.equal(vis().state, 'healthy', vis().reason); assert(vm().ok, vm().reason);
assert(!L.checks(array).some(c => !c.ok && c.severity === 'critical'), JSON.stringify(L.checks(array).filter(c => !c.ok)));
assert.match(await cli(array, 'show system'), /Setup: complete/);
assert.equal(vis().owner, 'A'); assert.deepEqual(vis().paths.map(p => p.side + ':' + p.alua), ['A:optimized', 'B:non-optimized']);
assert.match(await cli(srv, 'esxcli storage nmp path list'), /path A: active \(I\/O\) · active\/optimized[\s\S]*path B: active · active\/non-optimized/);
assert.match(await cli(array, 'show maps'), /DATA-01\s+SERVER-\S+\s+0\s+read-write\s+healthy/);
// LUN IDs: auto-assigned and unique per host; a duplicate explicit LUN is refused.
assert.match(device(array, 'volume', { id: 'DATA-02', pool: 'POOL-A', sizeGiB: 100, protocol: 'iSCSI', host: srv.id }), /^Applied/); assert.equal(deviceRuntime(array).volumes['DATA-02'].lun, 1);
assert.match(device(array, 'volume', { id: 'DATA-03', pool: 'POOL-A', sizeGiB: 100, protocol: 'iSCSI', host: srv.id, lun: 1 }), /LUN 1 is already used by volume DATA-02 for host/);
const seen = new Set();
async function scenario(fault, cmd, pattern, repair, extra) {
  const info = inject(fault, array.id), c = L.checks(array).find(x => x.id === info.check || x.id.startsWith(info.check + '-')) , failing = L.checks(array).find(x => !x.ok && (x.id === info.check || x.id.startsWith(info.check)));
  const f = failing || c; assert(f && !f.ok, fault + ' → ' + info.check + ' · ' + JSON.stringify(L.checks(array).filter(x => !x.ok)));
  assert(!seen.has(f.detail), 'distinct ' + f.detail); seen.add(f.detail);
  assert.match(await cli(array, cmd), pattern, fault + ' CLI'); assert(L.alarms().some(x => x.device === array.id && x.check === f.id), fault + ' alarm');
  assert(L.gui(array).blocking, fault + ' GUI blocking');
  if (extra) await extra(f);
  const saved = w.snapshot(); w.restore(saved); L.invalidate(); assert(!L.checks(a.byId[array.id]).find(x => x.id === f.id)?.ok, fault + ' persists');
  await repair(f); L.invalidate(); const after = L.checks(array).find(x => x.id === f.id); assert(!after || after.ok, fault + ' repaired · ' + JSON.stringify(after));
  console.log('  ' + fault + ' → ' + f.detail);
}
await scenario('controller-a', 'show controllers', /Controller A\n  Health: Fault\n  Status: Failed/, () => engineering({ type: 'repair', id: h.buy('controller').id, node: array.id }), async () => {
  assert.equal(vis().state, 'degraded'); assert.match(vis().reason, /Path A: controller A has failed · all its host ports are down/); assert.equal(vis().owner, 'B', 'ALUA ownership moved to B'); assert.deepEqual(vis().paths.map(p => p.side + ':' + p.alua), ['B:optimized']);
  assert(vm().ok, 'VM keeps running on controller B'); assert.deepEqual(L.leds(array).front.find(x => x.id === 'CTRL-A'), { id: 'CTRL-A', color: 'amber', blink: 'fast' });
  const perf = L.state(array).perf.find(p => p.volume === 'DATA-01'); assert(perf.latency > 0.35, 'latency rises on a single path'); assert.match(perf.note, /single path/);
});
assert.equal(vis().state, 'healthy'); assert.equal(vis().owner, 'A', 'ownership fails back');
await scenario('pool-disk', 'show disk-groups', /POOL-A\s+RAID 6\s+10 drives\s+spares 0\s+status REBUILDING \(0%\)/, () => ticks(10), async f => { assert.equal(f.severity, 'warning'); assert.equal(vis().state, 'healthy', 'a rebuild keeps data online'); assert(L.state(array).perf.find(p => p.volume === 'DATA-01').note.includes('pool rebuilding')); });
assert.match(await cli(array, 'show disk-groups'), /POOL-A .* status OPTIMAL/);
// A second pool without a spare: drive failures beyond RAID 6 protection → pool failed (data lost).
assert.match(device(array, 'pool', { id: 'POOL-B', sizeGiB: 6000, protection: 'RAID 6' }), /^Applied/); deviceRuntime(array).pools['POOL-B'].spares = 0;
assert.match(device(array, 'volume', { id: 'SCRATCH', pool: 'POOL-B', sizeGiB: 100, protocol: 'iSCSI', host: srv.id }), /^Applied/);
engineering({ type: 'fault', fault: 'pool-second-disk', node: array.id, pool: 'POOL-B' });
L.invalidate(); const pb = L.checks(array).find(x => x.id === 'pool-POOL-B');
assert(!pb.ok && pb.severity === 'critical'); assert.match(pb.detail, /Pool POOL-B FAILED · 3 drives lost/); assert.match(net.volumeAccess(array, 'SCRATCH', srv).reason, /Pool POOL-B FAILED/);
assert.match(engineering({ type: 'repair', id: h.buy('disk').id, node: array.id }), /remains FAILED \(data lost\)/);
device(array, 'volume', { id: 'SCRATCH', pool: 'POOL-B', sizeGiB: 100, protocol: 'iSCSI' }); assert.match(device(array, 'delete', { table: 'volumes', id: 'SCRATCH' }), /^Applied/);
assert.match(device(array, 'delete', { table: 'pools', id: 'POOL-B' }), /^Applied/); assert.match(device(array, 'pool', { id: 'POOL-B', sizeGiB: 6000, protection: 'RAID 6' }), /^Applied/); L.invalidate();
assert(L.checks(array).find(x => x.id === 'pool-POOL-B').ok, 'recreated pool is optimal'); seen.add(pb.detail); console.log('  pool-second-disk → ' + pb.detail);
// Snapshots fill the pool → volumes read-only → the VM on the datastore stops.
await scenario('pool-full', 'show disk-groups', /POOL-A .*POOL FULL \(read-only\)/, f => device(array, 'delete', { table: 'volSnaps', id: Object.keys(deviceRuntime(array).volSnaps)[0] }), async () => { assert.equal(vis().access, 'read-only'); assert(!vm().ok); assert.match(vm().reason, /went read-only: pool POOL-A on .* is full/); assert(op.alerts().some(x => x.device === srv.id && /APP-01/.test(x.text)), 'VM alarm'); });
assert(vm().ok, 'VM resumes after snapshots are deleted');
// CHAP: secrets must match on both sides.
await scenario('chap-mismatch', 'show initiators', /CHAP\s*\n[\s\S]*enabled/, () => product(srv, 'host', { ...configuredProduct(srv).host, chapSecret: 'Array-CHAP-2026' }), async () => { assert.equal(vis().state, 'unavailable'); assert.match(vis().reason, /CHAP authentication failure/); assert.match(await cli(srv, 'esxcli storage nmp path list'), /unavailable/); });
assert.equal(vis().state, 'healthy'); assert(vm().ok);
assert.match(await cli(array, 'frobnicate'), /Error: The command is not recognized/);
console.log('PASS: logic storage array · setup incomplete → complete, ALUA owner/optimized paths, LUN IDs per host, ' + seen.size + ' faults (controller A failover + repair, pool drive rebuild, pool failure beyond protection → recreate, pool full → read-only → VM down, CHAP mismatch) with CLI/GUI/LED/alarm agreement + persistence, perf under degradation.');
process.exit(0);
