// Service-level monitoring derived from the shared simulation state (no separate "healthy" flags).
// Every alert names the device, the affected service/host and the cause, and disappears as soon as
// the underlying state is repaired. Used by the NOC panel, office monitoring/tickets and objectives.
import { deviceRuntime, installStatus, poolUsable } from './device-runtime.js';
import { arrayVolumes } from './storage-access.js';
import { physicalOffline } from './operations.js';

const values = x => Object.values(x || {});
export function serviceHealth({ nodes, links, byId }, vmState) {
  const out = [], ctx = { nodes, links, byId };
  const live = nodes.filter(n => n.active !== false && n.type !== 'cloud');
  // Who depends on a volume: datastores → VMs → services.
  const consumers = (arrayId, volumeId) => {
    const list = [];
    for (const h of live) {
      if (!h.net?.runtime) continue; const r = deviceRuntime(h);
      for (const ds of values(r.datastores)) if (ds.array === arrayId && ds.volume === volumeId) {
        list.push(h.id + ' datastore ' + ds.id);
        for (const vm of values(r.vms)) if (vm.datastore === ds.id) list.push('VM ' + vm.id + (Object.keys(vm.services || {}).length ? ' (' + Object.keys(vm.services).join(', ') + ')' : ''));
      }
    }
    return list.join(', ');
  };
  for (const n of live) {
    // Power redundancy: a dual-PSU device fed from one PDU.
    if (n.physical?.power && n.physical.power.length === 2 && n.physical.power.filter(Boolean).length === 1 && !physicalOffline(n))
      out.push({ id: n.id + ':psu', severity: 'warning', kind: 'power', device: n.id, message: 'Running on one PSU · PSU ' + (n.physical.power[0] ? 'B' : 'A') + ' has no PDU feed', impact: 'Power redundancy lost', cause: 'PSU cable' });
    if (!n.net?.runtime) continue;
    const r = deviceRuntime(n);
    if (['server', 'gpu'].includes(n.type)) {
      const st = installStatus(n);
      if (st.state === 'failed') out.push({ id: n.id + ':os', severity: 'warning', kind: 'os', device: n.id, message: st.reason, impact: 'Host OS / hypervisor unavailable', cause: 'Installer' });
      for (const vm of values(r.vms)) {
        if (!vm.on) continue;
        const s = vmState(n, vm);
        const services = Object.keys(vm.services || {}).join(', ');
        if (!s.ok) out.push({ id: n.id + ':vm:' + vm.id, severity: 'critical', kind: 'vm', device: n.id, message: 'VM ' + vm.id + ' is not running · ' + s.reason, impact: services ? 'Services ' + services : 'VM workload', cause: s.reason });
        else if (/degraded/.test(s.reason)) out.push({ id: n.id + ':vm:' + vm.id, severity: 'warning', kind: 'vm', device: n.id, message: 'VM ' + vm.id + ' · ' + s.reason, impact: services ? 'Services ' + services + ' at risk' : 'VM workload at risk', cause: 'Storage path redundancy' });
      }
    }
    if (n.type === 'storage') {
      for (const pool of values(r.pools)) {
        const usable = poolUsable(pool), used = values(r.volumes).filter(v => v.pool === pool.id).reduce((s, v) => s + v.sizeGiB, 0), pct = usable ? Math.round(used / usable * 100) : 0;
        if (pct >= 90) out.push({ id: n.id + ':pool:' + pool.id, severity: pct >= 100 ? 'critical' : 'warning', kind: 'capacity', device: n.id, message: 'Pool ' + pool.id + ' ' + pct + '% allocated (' + used + ' / ' + usable + ' GiB usable, ' + pool.protection + ')', impact: 'New volumes / expansion', cause: 'Pool capacity' });
      }
      for (const v of arrayVolumes(n, ctx)) {
        if (!v.host || v.state === 'healthy') continue;
        const who = consumers(n.id, v.volume);
        out.push({ id: n.id + ':vol:' + v.volume + ':' + v.host, severity: v.state === 'degraded' ? 'warning' : 'critical', kind: 'storage', device: n.id, message: 'Volume ' + v.volume + ' → ' + v.host + ' ' + v.state + ' · ' + v.reason.replace(/^(Degraded|Unavailable) · /, ''), impact: who || 'Host ' + v.host, cause: v.steps?.find(s => !s.ok)?.name || 'Data paths' });
      }
    }
  }
  return out;
}
