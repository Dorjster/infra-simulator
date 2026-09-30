// GPU server logic: inventory and nvidia-smi from the running workload, power draw counted on the rack
// PDUs (N+1 warning when one feed could not carry the rack), thermal throttling when mounted backwards
// (GUI/CLI/LED/alarm agree), repair by re-mounting, persistence, no-OS and host-off CLI behaviour.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
import { helpers } from './build-helpers.mjs';
import { rackLoad, drawWatts, PDU_RATING_W } from '../dist/power-grid.js';
import { physicalOffline } from '../dist/operations.js';
const h = helpers(a), { w, engineering, op } = h, net = a.lab.kit.network, L = net.logic;
engineering({ type: 'mode', mode: 'free' });
const gpu = a.byId['GPU-01'], cli = c => net.command(c, { node: gpu });
const smi = await cli('nvidia-smi'); assert.match(smi, /NVIDIA-SMI 550/); assert.equal((smi.match(/NVIDIA H100 80GB HBM3/g) || []).length, 8, '8 GPUs');
assert.match(smi, /574W \/ 700W/, 'GPU power from the 80 % workload');
const load = rackLoad('R04', a.nodes, physicalOffline); assert(load.A > 5000 && load.B > 5000, 'GPU rack draw split over both PDUs');
assert.equal(drawWatts(gpu, false), 1800 + Math.round(5200 * 0.8));
const n1 = L.checks(gpu).find(c => c.id === 'gpu-n1'); assert(!n1.ok && n1.severity === 'warning'); assert.match(n1.detail, new RegExp('draws ' + load.combined + ' W: if one PDU fails .* ' + PDU_RATING_W + ' W breaker'));
// Workload changes draw (no randomness): stopping the workload drops it to idle.
net.apply({ type: 'workload', node: gpu.id, state: 'stopped' }); assert.equal(drawWatts(gpu, false), 1800 + Math.round(5200 * 0.05)); net.apply({ type: 'workload', node: gpu.id, state: 'running' });
// Airflow fault → thermal throttling.
engineering({ type: 'fault', fault: 'gpu-airflow', node: gpu.id }); L.invalidate();
const t = L.checks(gpu).find(c => c.id === 'gpu-thermal'); assert(!t.ok); assert.match(t.detail, /GPU thermal throttling: inlet 41 °C, GPUs at \d+ °C · HW Slowdown active/);
assert.match(await cli('nvidia-smi'), /Clocks Event Reasons: HW Slowdown: Active/); assert.match(await cli('nvidia-smi -q -d performance'), /HW Slowdown\s+: Active/);
assert(L.state(gpu).gpus.every(g => g.util < 80), 'throughput reduced'); assert(L.leds(gpu).gpus.every(x => x.color === 'amber'));
assert.deepEqual(L.leds(gpu).front.find(x => x.id === 'status'), { id: 'status', color: 'amber', blink: 'slow' }, 'warning LED');
assert(L.alarms().some(x => x.device === gpu.id && x.check === 'gpu-thermal')); assert(L.gui(gpu).pages.gpu.tables[0].rows.every(r => /HW Slowdown/.test(r[5])));
const saved = w.snapshot(); w.restore(saved); L.invalidate(); assert(!L.checks(gpu).find(c => c.id === 'gpu-thermal').ok, 'persists');
engineering({ type: 'boot', node: gpu.id }); assert.match(await cli('nvidia-smi'), /couldn't communicate with the NVIDIA driver/);
engineering({ type: 'reseat', node: gpu.id }); engineering({ type: 'boot', node: gpu.id }); gpu.physical.bootUntil = 1; op.tick(); L.invalidate();
assert(L.checks(gpu).find(c => c.id === 'gpu-thermal').ok, 'repaired'); assert.doesNotMatch(await cli('nvidia-smi'), /HW Slowdown: Active/);
const xe = h.install('xe8640', { racks: ['R05'] }); L.invalidate(); assert.match(await net.command('nvidia-smi', { node: xe }), /command not found/, 'no OS → no driver'); assert.equal(L.state(xe).gpus.length, 4);
console.log('PASS: logic gpu server · 8×/4× H100 inventory, nvidia-smi from the workload, draw on the rack PDUs + N+1 warning, workload-driven watts, thermal throttling fault with CLI/GUI/LED/alarm agreement + persistence + re-mount repair, driver/host-off states.');
process.exit(0);
