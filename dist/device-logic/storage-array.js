// Block storage array logic (PowerVault ME5, PowerStore, HPE Alletra, factory NVMe enclosure).
//
// State machine:
//   no AC ──cord──▶ booting ──▶ "setup incomplete" (admin password, system name, controller A/B
//   management IPs, NTP) ──initial setup──▶ ready. Controllers A and B each own host ports; a failed
//   controller drops its paths and LUN ownership moves to the survivor (ALUA: optimized paths go
//   through the owning controller, the others are active/non-optimized).
// Pools / disk groups: RAID usable capacity from drive count, dedicated spare (distributed on ADAPT);
//   drive failure → degraded → rebuilding (progress each tick) → optimal; failures beyond the
//   protection level → pool FAILED (data lost). Thin volumes consume what is written, snapshots
//   consume pool space; a full pool turns its volumes read-only (with an alarm).
// Host access per volume (storage-access.js): masking, registration, CHAP, transport, paths.
import { chk, warn, ordered, firstFailure, healthOf, baseChecks, managementCheck, baseLeds, alarmsFrom, portsState, powerState, bootState, led, table, ERR, physicalOffline, productProfile, configuredProduct } from './common.js';
import { deviceRuntime } from '../device-runtime.js';
import { poolUse, controllerFailed, hostIdentifiers } from '../storage-access.js';
import { poolDrives, poolHealth } from '../raid.js';

const legacyCtrl = (n, ctx, side) => n.id === 'NVMe ENCLOSURE' && physicalOffline(ctx.byId['CONTROLLER-' + side]);
export const ctrlDown = (n, ctx, side) => controllerFailed(n, side) || legacyCtrl(n, ctx, side);
export function setupSteps(n) {
  const p = configuredProduct(n), m = p.management || {}, f = productProfile(n).family;
  return [['Admin password and system name', !!p.identity.passwordSet], ['Controller A management IP', n.net.ip !== '0.0.0.0'], ['Controller B management IP', !!m.nodeB || f === 'alletra'], ['Time / NTP', !!(m.ntp || n.net.ntp)]];
}
// IOPS / latency per volume from the VMs that use it; worse when degraded or rebuilding.
export function perf(n, ctx) {
  const r = deviceRuntime(n), out = [];
  for (const vol of Object.values(r.volumes)) {
    let vms = 0; for (const h of ctx.nodes) { const hr = h.net?.runtime; if (!hr) continue; for (const ds of Object.values(hr.datastores || {})) if (ds.array === n.id && ds.volume === vol.id) vms += Object.values(hr.vms || {}).filter(v => v.on && v.datastore === ds.id).length; }
    const acc = ctx.network.arrayVolumes(n).filter(x => x.volume === vol.id && x.host), degraded = acc.some(x => x.state === 'degraded'), use = poolUse(n, vol.pool), rebuilding = use.health.state === 'rebuilding';
    const iops = vms * 850 + (acc.some(x => x.ok) ? 40 : 0), lat = +(0.35 * (degraded ? 2.2 : 1) * (rebuilding ? 3 : 1) * (acc.some(x => x.paths?.every(p => p.alua === 'non-optimized')) ? 1.6 : 1)).toFixed(2);
    out.push({ volume: vol.id, iops, latency: lat, vms, note: [degraded && 'single path', rebuilding && 'pool rebuilding'].filter(Boolean).join(', ') });
  }
  return out;
}
export function state(n, ctx) {
  const r = deviceRuntime(n), c = checks(n, ctx), p = configuredProduct(n);
  return { power: powerState(n), boot: bootState(n), mgmt: { ip: n.net.ip, controllers: { A: n.net.ip, B: p.management?.nodeB || '' }, setup: setupSteps(n) }, health: healthOf(c), ports: portsState(n, ctx), services: [], controllers: ['A', 'B'].map(side => ({ id: 'Controller ' + side, state: ctrlDown(n, ctx, side) ? 'failed' : physicalOffline(n) ? 'down' : 'operational' })), pools: Object.values(r.pools).map(pl => ({ ...pl, drives: poolDrives(pl), ...poolUse(n, pl.id) })), volumes: ctx.network.arrayVolumes(n), perf: perf(n, ctx), alarms: alarmsFrom(n, c, 'storage') };
}
export function checks(n, ctx) {
  const out = baseChecks(n, ctx), r = deviceRuntime(n), f = productProfile(n).family;
  if (n.spec) { const missing = setupSteps(n).filter(x => !x[1]); out.push(warn('setup', 'management', !missing.length, 'Setup incomplete · ' + missing.map(x => x[0]).join(', '), 'Run the initial setup wizard (System / Controller network)', missing[0]?.[0].startsWith('Admin') ? 'identity' : 'management')); out.push(managementCheck(n, ctx, 'management')); }
  for (const side of ['A', 'B']) out.push(chk('ctrl-' + side, 'boot', !ctrlDown(n, ctx, side) || physicalOffline(n), 'Controller ' + side + ' FAILED · its host ports are down; LUN ownership failed over to controller ' + (side === 'A' ? 'B' : 'A') + ' (non-redundant)', 'Replace controller ' + side + ' (Equipment → Replace part → Storage controller)', 'st-controllers'));
  for (const pl of Object.values(r.pools)) {
    const use = poolUse(n, pl.id), h = use.health;
    if (h.state === 'failed') out.push(chk('pool-' + pl.id, 'service', false, 'Pool ' + pl.id + ' FAILED · ' + h.failed + ' drives lost (' + pl.protection + ' tolerates ' + (h.failed - 1) + ') · all volumes in the pool are offline, data lost', 'Replace the drives, delete and recreate the pool, restore from backup', 'st-pools'));
    else out.push(warn('pool-' + pl.id, 'service', h.state === 'optimal', 'Pool ' + pl.id + ' ' + h.state + (h.state === 'rebuilding' ? ' ' + h.progress + ' %' : '') + ' · ' + h.failed + ' failed drive(s)' + ((pl.spares ?? 1) <= 0 && h.state === 'degraded' ? ' · no spare left, rebuild waits for a replacement drive' : ''), h.state === 'rebuilding' ? 'Wait for the rebuild' : 'Replace the failed drive', 'st-pools'));
    out.push(chk('pool-full-' + pl.id, 'service', !use.full, 'Pool ' + pl.id + ' is FULL: ' + use.consumed + ' of ' + use.usable + ' GiB consumed (snapshots ' + use.snaps + ' GiB) · its volumes are read-only', 'Delete snapshots or add drives to the pool', 'st-snapshots'));
  }
  for (const v of ctx.network.arrayVolumes(n)) { if (!v.host) continue; if (v.state === 'unavailable') out.push(chk('access-' + v.volume + '-' + v.host, 'l3', false, 'Volume ' + v.volume + ' → ' + v.host + ' unavailable · ' + v.reason.replace(/^Unavailable · /, ''), 'Fix the step named in the reason (Hosts & mapping / data ports / fabric)', 'storage-hosts')); else if (v.state === 'degraded') out.push(warn('access-' + v.volume + '-' + v.host, 'l3', false, 'Volume ' + v.volume + ' → ' + v.host + ' degraded · ' + v.reason.replace(/^Degraded · 1 of 2 paths · /, ''), 'Restore the second independent path', 'storage-hosts')); }
  return ordered(out);
}
export function leds(n, ctx) {
  const c = checks(n, ctx), base = baseLeds(n, ctx, c), r = deviceRuntime(n);
  base.front.push(...['A', 'B'].map(side => led('CTRL-' + side, ctrlDown(n, ctx, side) ? 'amber' : powerState(n).live ? 'green' : 'off', ctrlDown(n, ctx, side) ? 'fast' : 'solid')));
  const drives = []; for (const pl of Object.values(r.pools)) { const h = poolHealth(pl), d = poolDrives(pl); for (let i = 0; i < Math.min(d, 24); i++) drives.push(led(pl.id + '-' + i, i < h.failed ? 'amber' : h.state === 'rebuilding' && i === h.failed ? 'green' : 'green', i < h.failed ? 'fast' : h.state === 'rebuilding' && i === h.failed ? 'slow' : 'solid')); }
  base.disks = drives; return base;
}
const errFor = n => productProfile(n).family === 'powervault' ? 'Error: The command is not recognized. (2026-09-29 00:00:00)' : productProfile(n).family === 'powerstore' ? 'Error: unknown command (pstcli)' : 'ERROR: Invalid command.';
export function cli(n, cmd, session, ctx) {
  const lower = cmd.trim().toLowerCase().replace(/\s+/g, ' '), r = deviceRuntime(n), st = () => state(n, ctx);
  if (lower === 'show controllers' || lower === 'show controller-statistics' || lower === 'pstcli node show') return 'Controllers\n-----------\n' + st().controllers.map(c => c.id + '\n  Health: ' + (c.state === 'operational' ? 'OK' : 'Fault') + '\n  Status: ' + (c.state === 'operational' ? 'Operational' : 'Failed') + '\n  Host ports: ' + (c.state === 'operational' ? 'up' : 'down')).join('\n') + '\n\nSuccess: Command completed successfully.';
  if (lower === 'show disk-groups' || lower === 'show pools detail' || lower === 'show disks') return st().pools.map(p => p.id + '  ' + p.protection + '  ' + p.drives + ' drives  spares ' + (p.spares ?? 1) + '  status ' + p.health.state.toUpperCase() + (p.health.state === 'rebuilding' ? ' (' + p.health.progress + '%)' : '') + '  usable ' + p.usable + ' GiB  consumed ' + p.consumed + ' GiB' + (p.full ? '  POOL FULL (read-only)' : '')).join('\n') || 'No disk groups.';
  if (lower === 'show snapshots') { const list = Object.values(r.volSnaps || {}); return list.length ? table(['Name', 'Base volume', 'Size', 'Created'], list.map(x => [x.id, x.volume, x.sizeGiB + ' GiB', new Date(x.at).toLocaleTimeString()]), [22, 16, 10, 12]) : 'No snapshots.'; }
  if (lower === 'show maps' || lower === 'show volume-maps') { const v = st().volumes.filter(x => x.host); return v.length ? table(['Volume', 'Host', 'LUN', 'Access', 'State'], v.map(x => [x.volume, x.host, x.record?.lun ?? x.lun ?? 0, x.access || '-', x.state]), [16, 22, 5, 11, 12]) : 'No mappings.'; }
  if (lower === 'show initiators' || lower === 'show host-groups') return table(['Host', 'Initiator', 'Transport', 'CHAP'], Object.values(r.hosts).map(h => [h.id, h.initiator, h.protocol || '-', h.chap ? 'enabled' : 'none']), [22, 44, 9, 8]);
  if (lower === 'show ports') { const s = configuredProduct(n).storage; return ['A', 'B'].map(side => 'Port ' + side + '0 (controller ' + side + ')  ' + (s['port' + side] || '-') + '  ' + (s.protocol || 'unconfigured') + (s['ip' + side] ? '  ' + s['ip' + side] + ':3260' : '') + '  ' + (ctrlDown(n, ctx, side) ? 'Disconnected (controller failed)' : portsState(n, ctx).find(p => p.name === s['port' + side])?.state === 'up' ? 'Up' : 'Disconnected')).join('\n') + (s.protocol === 'FC' ? '\nTarget WWPN A ' + hostIdentifiers(n).wwpnA + '\nTarget WWPN B ' + hostIdentifiers(n).wwpnB : ''); }
  if (lower === 'show host-paths' || lower === 'show iscsi-sessions' || lower === 'show sessions') { const v = st().volumes.filter(x => x.host); return v.map(x => x.volume + ' → ' + x.host + ' (' + x.state + ')' + (x.paths?.length ? '\n' + x.paths.map(p => '  path ' + p.side + ' ' + (p.alua === 'optimized' ? 'active/optimized' : 'active/non-optimized') + ' · ' + p.path).join('\n') : '') + (x.state !== 'healthy' ? '\n  ' + x.reason : '')).join('\n') || 'No host sessions.'; }
  if (lower === 'show volume-statistics' || lower === 'show perf') return table(['Volume', 'IOPS', 'Latency', 'VMs', 'Note'], perf(n, ctx).map(p => [p.volume, p.iops, p.latency + ' ms', p.vms, p.note]), [16, 8, 10, 5, 24]);
  if (lower === 'show system' || lower === 'pstcli appliance show') { const s = st(); return 'System Name: ' + (configuredProduct(n).identity.name || n.id) + '\nProduct: ' + n.model + '\nHealth: ' + s.health.toUpperCase() + '\nSetup: ' + (s.mgmt.setup.every(x => x[1]) ? 'complete' : 'INCOMPLETE · ' + s.mgmt.setup.filter(x => !x[1]).map(x => x[0]).join(', ')); }
  if (/^(show|set|create|delete|pstcli) /.test(lower)) return null;
  return null;
}
export function unknown(n) { return errFor(n); }
export function gui(n, ctx) {
  const st = state(n, ctx), r = deviceRuntime(n), f = firstFailure(checks(n, ctx));
  const pages = {
    'st-controllers': { group: 'System', title: 'Controllers & ports', tables: [{ title: 'Controllers (ALUA)', heads: ['Controller', 'State'], rows: st.controllers.map(c => [c.id, c.state]) }, { title: 'Initial setup', heads: ['Step', 'Done'], rows: st.mgmt.setup.map(([k, ok]) => [k, ok ? 'yes' : 'no']) }] },
    'st-pools': { group: 'Storage', title: 'Disk groups / pool health', tables: [{ title: 'Pools', heads: ['Pool', 'Protection', 'Drives', 'Spares', 'State', 'Usable', 'Consumed'], rows: st.pools.map(p => [p.id, p.protection, p.drives, p.spares ?? 1, p.health.state + (p.health.state === 'rebuilding' ? ' ' + p.health.progress + ' %' : ''), p.usable + ' GiB', p.consumed + ' GiB' + (p.full ? ' · FULL' : '')]) }] },
    'st-snapshots': { group: 'Storage', title: 'Snapshots', tables: [{ title: 'Volume snapshots (consume pool capacity)', heads: ['Snapshot', 'Volume', 'Size'], rows: Object.values(r.volSnaps || {}).map(x => [x.id, x.volume, x.sizeGiB + ' GiB']) }] },
    'st-perf': { group: 'Monitoring', title: 'Performance', tables: [{ title: 'Per-volume IOPS and latency (from VM load)', heads: ['Volume', 'IOPS', 'Latency', 'VMs', 'Note'], rows: st.perf.map(p => [p.volume, p.iops, p.latency + ' ms', p.vms, p.note || '—']) }] },
    'st-sessions': { group: 'Monitoring', title: 'Host sessions / paths', tables: [{ title: 'Paths per mapped volume', heads: ['Volume', 'Host', 'LUN', 'Path A', 'Path B'], rows: st.volumes.filter(v => v.host).map(v => [v.volume, v.host, v.record?.lun ?? 0, ...['A', 'B'].map(side => { const p = v.paths?.find(x => x.side === side); return p ? 'active/' + p.alua : 'dead'; })]) }] },
  };
  return { summary: [['Setup', st.mgmt.setup.every(x => x[1]) ? 'complete' : 'incomplete', st.mgmt.setup.every(x => x[1]) ? 'ok' : 'warn'], ['Controllers', st.controllers.map(c => c.id.slice(-1) + ' ' + c.state).join(' · '), st.controllers.some(c => c.state === 'failed') ? 'crit' : 'ok'], ['Pools', st.pools.map(p => p.id + ' ' + p.health.state).join(' · ') || 'none', st.pools.some(p => p.health.state !== 'optimal' || p.full) ? 'warn' : ''], ['Health', st.health, st.health === 'ok' ? 'ok' : st.health === 'warning' ? 'warn' : 'crit']], blocking: f, pages };
}
export const faults = [
  { id: 'controller-a', label: 'Controller A failure', check: 'ctrl-A', family: 'storage-array' },
  { id: 'pool-disk', label: 'Pool drive failure + rebuild', check: 'pool-POOL-A', family: 'storage-array' },
  { id: 'pool-second-disk', label: 'Second drive failure during rebuild', check: 'pool-POOL-A', family: 'storage-array' },
  { id: 'pool-full', label: 'Snapshots fill the pool (read-only)', check: 'pool-full-POOL-A', family: 'storage-array' },
  { id: 'chap-mismatch', label: 'CHAP secret mismatch', check: 'access-DATA-01', family: 'storage-array' },
];
// Commands this module answers (used by ? and Tab in the laptop terminal).
export const commands = ['show controllers', 'show controller-statistics', 'pstcli node show', 'show disk-groups', 'show pools detail', 'show disks', 'show snapshots', 'show maps', 'show volume-maps', 'show initiators', 'show host-groups', 'show ports', 'show host-paths', 'show iscsi-sessions', 'show sessions', 'show volume-statistics', 'show perf', 'show system', 'pstcli appliance show'];
export default { family: 'storage-array', match: n => n.type === 'storage' && !n.controller, state, checks, leds, cli, gui, faults, commands, unknown };
