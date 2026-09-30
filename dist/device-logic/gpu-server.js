// GPU server logic (PowerEdge XE9680 / XE8640 and the factory GPU chassis). Same management
// controller, boot, RAID and virtualization logic as the server family, plus:
//   GPU inventory (8× or 4× H100 SXM), per-GPU power from the workload, total draw checked against the
//   rack PDU budget (power-grid.js), and thermal throttling when airflow is wrong (mounted backwards):
//   inlet > 35 °C → "HW Slowdown: Active", clocks and throughput drop (a warning, no damage).
import server, { sensors } from './server.js';
import { warn, ordered, firstFailure, led, table, physicalOffline, powerState } from './common.js';
import { utilization, drawWatts, rackLoad, PDU_RATING_W } from '../power-grid.js';
import { deviceRuntime } from '../device-runtime.js';

export function gpus(n) {
  const count = n.spec?.sku === 'xe8640' ? 4 : 8, run = !physicalOffline(n), u = run ? utilization(n) : 0, s = sensors(n), thr = s.throttled;
  return Array.from({ length: count }, (_, i) => ({ index: i, name: 'NVIDIA H100 80GB HBM3', bus: '0000:' + (0x18 + i * 0x10).toString(16).padStart(2, '0') + ':00.0', util: Math.round(u * 100 * (thr ? 0.55 : 1)), mem: Math.round(u * 72000), memTotal: 81559, watts: run ? Math.round(70 + 630 * u * (thr ? 0.6 : 1)) : 0, cap: 700, temp: run ? Math.round((thr ? 84 : 38) + u * 22) : 0, clocks: thr ? 'HW Slowdown: Active (thermal)' : 'Not Active' }));
}
function checks(n, ctx) {
  const base = server.checks(n, ctx).filter(c => c.id !== 'thermal'), s = sensors(n), load = rackLoad(n.rack, ctx.nodes, physicalOffline);
  base.push(warn('gpu-thermal', 'physical', !s.throttled, 'GPU thermal throttling: inlet ' + s.inlet + ' °C, GPUs at ' + gpus(n)[0].temp + ' °C · HW Slowdown active, throughput −45 %', 'Power it off, then aim at it → [V] Re-mount front-to-back (cold aisle at the front)', 'gpu'));
  base.push(warn('gpu-n1', 'power', load.combined <= PDU_RATING_W || powerState(n).psus.filter(p => p.state === 'ok').length < 2, 'Rack ' + n.rack + ' draws ' + load.combined + ' W: if one PDU fails the other must carry more than its ' + PDU_RATING_W + ' W breaker (no N+1 power capacity)', 'Move load to another rack or lower the GPU workload', 'srv-sensors'));
  return ordered(base);
}
function state(n, ctx) { const st = server.state(n, ctx), c = checks(n, ctx); return { ...st, gpus: gpus(n), health: c.some(x => !x.ok && x.severity === 'critical') ? 'critical' : c.some(x => !x.ok) ? 'warning' : 'ok', alarms: c.filter(x => !x.ok).map(x => ({ id: n.id + ':' + x.id, device: n.id, severity: x.severity, kind: 'gpu', check: x.id, layer: x.layer, message: x.detail, fixHint: x.fixHint, where: x.where })) }; }
function leds(n, ctx) { const l = server.leds(n, ctx), c = checks(n, ctx), f = firstFailure(c); const st = l.front.find(x => x.id === 'status'); if (st && f && f.severity === 'warning' && st.color === 'green') Object.assign(st, { color: 'amber', blink: 'slow' }); l.gpus = gpus(n).map(g => led('GPU' + g.index, g.watts ? (g.clocks === 'Not Active' ? 'green' : 'amber') : 'off')); return l; }
function smi(n) {
  const list = gpus(n), r = deviceRuntime(n);
  if (physicalOffline(n)) return 'NVIDIA-SMI has failed because it couldn\'t communicate with the NVIDIA driver (host is off).';
  if (!r.os) return '-bash: nvidia-smi: command not found (install an OS with the NVIDIA driver)';
  const rows = list.map(g => '|   ' + g.index + '  ' + g.name.padEnd(24) + ' On  | ' + g.bus + ' Off |                    0 |\n| N/A   ' + String(g.temp).padStart(2) + 'C    P0   ' + String(g.watts).padStart(4) + 'W / ' + g.cap + 'W |  ' + String(g.mem).padStart(5) + 'MiB / ' + g.memTotal + 'MiB |  ' + String(g.util).padStart(3) + '%      Default |');
  return ['+-----------------------------------------------------------------------------+', '| NVIDIA-SMI 550.54.15    Driver Version: 550.54.15    CUDA Version: 12.4     |', '|-------------------------------+----------------------+----------------------+', '| GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC |', '| Fan  Temp  Perf  Pwr:Usage/Cap|         Memory-Usage | GPU-Util  Compute M. |', '|===============================+======================+======================|', ...rows, '+-----------------------------------------------------------------------------+', ...(list[0].clocks !== 'Not Active' ? ['Clocks Event Reasons: HW Slowdown: Active · HW Thermal Slowdown: Active'] : [])].join('\n');
}
function cli(n, cmd, session, ctx) {
  const lower = cmd.trim().toLowerCase().replace(/\s+/g, ' ');
  if (lower === 'nvidia-smi' || lower === 'nvidia-smi -l') return smi(n);
  if (lower === 'nvidia-smi -q -d performance' || lower === 'nvidia-smi -q -d temperature') return gpus(n).map(g => 'GPU ' + g.bus + '\n    Clocks Event Reasons\n        HW Slowdown                     : ' + (g.clocks === 'Not Active' ? 'Not Active' : 'Active') + '\n    Temperature\n        GPU Current Temp                : ' + g.temp + ' C').join('\n');
  return server.cli(n, cmd, session, ctx);
}
function gui(n, ctx) {
  const g = server.gui(n, ctx), list = gpus(n), f = firstFailure(checks(n, ctx));
  g.pages.gpu = { group: 'System', title: 'GPUs', tables: [{ title: list.length + ' × NVIDIA H100 SXM · ' + list.reduce((t, x) => t + x.watts, 0) + ' W on GPUs · system ' + drawWatts(n, physicalOffline(n)) + ' W', heads: ['GPU', 'Util', 'Memory', 'Power', 'Temp', 'Clocks'], rows: list.map(x => [x.index, x.util + ' %', x.mem + ' / ' + x.memTotal + ' MiB', x.watts + ' / ' + x.cap + ' W', x.temp + ' °C', x.clocks]) }] };
  g.blocking = f; return g;
}
export const faults = [
  { id: 'gpu-airflow', label: 'GPU server mounted backwards (thermal throttling)', check: 'gpu-thermal', family: 'gpu-server' },
];
// Commands this module answers (used by ? and Tab in the laptop terminal).
export const commands = ['nvidia-smi', 'nvidia-smi -l', 'nvidia-smi -q -d performance', 'nvidia-smi -q -d temperature'];
export default { family: 'gpu-server', match: n => n.type === 'gpu', state, checks, leds, cli, gui, faults, commands, unknown: server.unknown };
