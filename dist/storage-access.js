// Block-storage access model shared by the device GUI, host datastores, the office evaluator,
// monitoring and objectives. A volume is visible to a host only when every dependency holds:
// array powered → volume exists → masking (host / host-group mapping) → host registered with the
// initiator it really uses → transport and initiator enabled on the host → at least one physical
// data path (cables, switch VLAN/MTU for iSCSI/NVMe-TCP, zoning for FC). Two paths that share a
// switch are one failure domain. Training model: no SCSI/NVMe protocol or multipath driver runs.
import { productProfile, configuredProduct } from './product-profiles.js';
import { deviceRuntime, poolUsable } from './device-runtime.js';
import { physicalOffline } from './operations.js';
import { poolHealth } from './raid.js';
// A failed controller takes all of its host ports down; the other controller keeps serving (ALUA).
export const controllerFailed = (array, side) => !!array?.physical?.faults?.['ctrl' + side];

const ipv4 = s => /^\d{1,3}(\.\d{1,3}){3}$/.test(s || '') && s.split('.').every(v => +v <= 255);
const num = s => s.split('.').reduce((n, v) => (n * 256 + Number(v)) >>> 0, 0);
const subnet = (a, b, p) => ipv4(a) && ipv4(b) && (num(a) & (0xffffffff << (32 - p))) === (num(b) & (0xffffffff << (32 - p)));
const values = x => Object.values(x || {});
export const isMgmt = p => p.service || /MGMT|SERVICE|management/i.test(p.name) || p.alias?.startsWith('mgmt');
export const dataPort = (n, name) => n?.ports.find(p => p.name === name && !p.service && p.medium !== 'Internal');
export function hostIdentifiers(n) {
  let h = 0; for (const c of n.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const tail = h.toString(16).padStart(8, '0').match(/../g).join(':');
  return { iqn: 'iqn.2026-09.lab.infra:' + n.id.toLowerCase(), wwpnA: '10:00:00:01:' + tail, wwpnB: '10:00:00:02:' + tail };
}

// Pool protection → usable capacity (see device-runtime.js poolUsable / poolProtections).
export function poolUse(n, poolId) {
  const r = deviceRuntime(n), pool = r.pools[poolId], vols = values(r.volumes).filter(v => v.pool === poolId), allocated = vols.reduce((s, v) => s + v.sizeGiB, 0), usable = poolUsable(pool);
  // Consumed space: thick volumes reserve their size, thin volumes consume what was written, and
  // snapshots consume pool space too. A full pool turns its volumes read-only.
  const snaps = values(r.volSnaps).filter(x => vols.some(v => v.id === x.volume)).reduce((s, x) => s + x.sizeGiB, 0);
  const consumed = vols.reduce((s, v) => s + (v.thin === false ? v.sizeGiB : Math.min(v.sizeGiB, v.written || 0)), 0) + snaps;
  return { raw: pool?.sizeGiB || 0, usable, allocated, free: usable - allocated, percent: usable ? Math.round(allocated / usable * 100) : 0, snaps, consumed, full: !!usable && consumed >= usable, health: poolHealth(pool) };
}

export const good = (l, byId) => !!l && !l.retired && !l.unplugged && !l.disabled && !physicalOffline(byId[l.a]) && !physicalOffline(byId[l.b]) && l.pa.cfg?.admin !== false && l.pb.cfg?.admin !== false;
const carries = (p, v) => p.cfg && (p.cfg.mode === 'trunk' ? (p.cfg.allowed || []).includes(v) : p.cfg.access === v);

// Physical data paths from the array's configured data ports (A/B) to the host's ports (A/B).
export function pathsTo(array, host, ctx) {
  const s = configuredProduct(array).storage, h = configuredProduct(host).host, results = [];
  if (!host || !s.protocol || h.protocol !== s.protocol) return results;
  for (const side of ['A', 'B']) {
    const start = dataPort(array, s['port' + side]), goal = dataPort(host, h['port' + side]);
    if (!start || !goal || controllerFailed(array, side)) continue;
    if (['iSCSI', 'NVMe/TCP'].includes(s.protocol) && (+s['vlan' + side] !== +h['vlan' + side] || +s.mtu !== +h.mtu || !subnet(s['ip' + side], h['ip' + side], +s.prefix))) continue;
    const queue = [{ id: array.id, seen: new Set([array.id]), trace: [array.id] }];
    let found = null;
    while (queue.length && !found) {
      const current = queue.shift();
      for (const l of ctx.links) {
        if (!good(l, ctx.byId)) continue;
        const own = l.a === current.id ? l.pa : l.b === current.id ? l.pb : null;
        if (!own) continue;
        const other = l.a === current.id ? l.b : l.a, next = ctx.byId[other], end = l.a === current.id ? l.pb : l.pa;
        if ((current.id === array.id && own !== start) || (other === host.id && end !== goal) || current.seen.has(other)) continue;
        if (s.protocol === 'FC') {
          if (own.medium !== 'Fibre Channel' || end.medium !== 'Fibre Channel') continue;
          if (next.type === 'san') {
            const fabric = configuredProduct(next).fabric, pair = [h['wwpn' + side], hostIdentifiers(array)['wwpn' + side]];
            if (!fabric?.enabled || !fabric.members || !pair.every(x => fabric.members.includes(x))) continue;
          }
        } else {
          if (own.medium !== 'Ethernet' || end.medium !== 'Ethernet' || isMgmt(own) || isMgmt(end)) continue;
          const v = +s['vlan' + side];
          if (![own, end].every(p => carries(p, v) && (p.cfg.mtu || 1500) === +s.mtu)) continue;
        }
        const trace = current.trace.concat(other);
        if (other === host.id) { found = { side, path: trace.join(' → '), protocol: s.protocol, fabric: trace.slice(1, -1) }; break; }
        if (s.protocol === 'FC' ? next.type === 'san' : next.type === 'switch') queue.push({ id: other, seen: new Set([...current.seen, other]), trace });
      }
    }
    if (found) { const twin = results.find(r => r.fabric.some(id => found.fabric.includes(id))); if (twin) results.shared = { side, with: twin.side, fabric: found.fabric.filter(id => twin.fabric.includes(id)) }; else results.push(found); }
  }
  return results;
}

export function linkCause(l, byId) {
  const x = l.pa.cfg || {}, y = l.pb.cfg || {}, vl = c => c.mode === 'trunk' ? 'trunk ' + (c.allowed || []).join(',') : 'access ' + c.access;
  if (l.unplugged) return 'unplugged';
  if (x.admin === false || y.admin === false) return 'admin down on ' + (x.admin === false ? l.a + ' / ' + l.pa.name : l.b + ' / ' + l.pb.name);
  if (physicalOffline(byId[l.a]) || physicalOffline(byId[l.b])) return (physicalOffline(byId[l.a]) ? l.a : l.b) + ' powered off';
  if (l.fault || l.pa.fault || l.pb.fault) return 'port / optic fault';
  if ((x.mtu || 1500) !== (y.mtu || 1500)) return 'MTU ' + (x.mtu || 1500) + ' ≠ ' + (y.mtu || 1500);
  if (x.mode && y.mode && (x.mode === 'access' && y.mode === 'access' ? x.access !== y.access : x.mode === 'trunk' && y.mode === 'trunk' ? !(x.allowed || []).some(v => (y.allowed || []).includes(v)) : !(x.mode === 'trunk' ? x.allowed || [] : y.allowed || []).includes(x.mode === 'trunk' ? y.access : x.access))) return 'VLAN mismatch ' + vl(x) + ' ↔ ' + vl(y);
  return 'optic, speed or media mismatch';
}
// Explains why one side (A or B) has no working path, using the first failing dependency.
export function diagnoseSide(array, host, side, ctx, paths = pathsTo(array, host, ctx)) {
  const s = configuredProduct(array).storage, h = configuredProduct(host).host, P = 'Path ' + side + ': ';
  if (paths.shared?.side === side) return P + 'uses ' + paths.shared.fabric.join(', ') + ' like path ' + paths.shared.with + ' · one switch is one failure domain, not an independent fabric';
  const start = dataPort(array, s['port' + side]), goal = dataPort(host, h['port' + side]);
  if (controllerFailed(array, side)) return P + 'controller ' + side + ' has failed · all its host ports are down (LUN ownership moved to controller ' + (side === 'A' ? 'B' : 'A') + ')';
  if (!start) return P + 'array data port is not configured';
  if (!goal) return P + 'host data port is not configured';
  if (['iSCSI', 'NVMe/TCP'].includes(s.protocol)) {
    if (+s['vlan' + side] !== +h['vlan' + side]) return P + 'array VLAN ' + s['vlan' + side] + ' ≠ host VLAN ' + h['vlan' + side];
    if (+s.mtu !== +h.mtu) return P + 'path MTU mismatch · array MTU ' + s.mtu + ' ≠ host MTU ' + h.mtu;
    if (!subnet(s['ip' + side], h['ip' + side], +s.prefix)) return P + 'array ' + s['ip' + side] + ' and host ' + h['ip' + side] + ' are not in the same /' + s.prefix + ' subnet';
  }
  for (const [n, p, who] of [[array, start, 'array'], [host, goal, 'host']]) {
    if (!p.link) { const l = ctx.links.find(x => !x.retired && (x.pa === p || x.pb === p)); return P + (l ? 'cable ' + l.a + ' / ' + l.pa.name + ' ↔ ' + l.b + ' / ' + l.pb.name + ' is unplugged' : who + ' port ' + n.id + ' / ' + p.name + ' has no cable'); }
    if (!good(p.link, ctx.byId)) return P + 'link ' + p.link.a + ' / ' + p.link.pa.name + ' ↔ ' + p.link.b + ' / ' + p.link.pb.name + ' is down (' + linkCause(p.link, ctx.byId) + ')';
    const far = p.link.pa === p ? p.link.pb : p.link.pa, sw = ctx.byId[p.link.a === n.id ? p.link.b : p.link.a];
    if (s.protocol === 'FC') {
      if (far.medium !== 'Fibre Channel') return P + who + ' FC port is patched to a non-FC port';
      if (sw.type === 'san') {
        const fabric = configuredProduct(sw).fabric, pair = [h['wwpn' + side], hostIdentifiers(array)['wwpn' + side]];
        if (!fabric?.enabled) return P + 'fabric ' + sw.id + ' has no enabled zoning configuration';
        const missing = pair.filter(x => !(fabric.members || []).includes(x));
        if (missing.length) return P + 'zone on ' + sw.id + ' is missing ' + missing.join(', ');
      }
    } else if (sw.type === 'switch') {
      const v = +s['vlan' + side];
      if (!carries(far, v)) return P + sw.id + ' / ' + far.name + ' does not carry VLAN ' + v;
      if ((far.cfg.mtu || 1500) !== +s.mtu) return P + 'path MTU mismatch · ' + sw.id + ' / ' + far.name + ' MTU ' + (far.cfg.mtu || 1500) + ' ≠ ' + s.mtu + ' (jumbo frames must be end-to-end)';
    }
  }
  return P + 'no end-to-end route from ' + array.id + ' / ' + start.name + ' to ' + host.id + ' / ' + goal.name + ' through ' + (s.protocol === 'FC' ? 'zoned SAN switches' : 'switches carrying VLAN ' + s['vlan' + side]);
}

export function registration(array, host) {
  const r = deviceRuntime(array), s = configuredProduct(array).storage;
  return r.hosts[host.id] || (s.host === host.id && s.initiator ? { id: host.id, initiator: s.initiator } : null);
}
export const mappedTo = (array, vol, host) => vol.host === host.id || (!!vol.group && (deviceRuntime(array).hostGroups?.[vol.group]?.hosts || []).includes(host.id));

// Full dependency check for one volume as seen from one host.
export function volumeAccess(array, volumeId, host, ctx) {
  const steps = [], test = (name, ok, detail) => { steps.push({ name, ok, detail }); return ok; };
  const out = (state, reason, extra = {}) => ({ state, ok: state !== 'unavailable', reason, steps, paths: [], ...extra });
  if (!test('Array power', !!array && array.active !== false && !physicalOffline(array), (array?.id || 'Array') + ' is powered off, booting or has a controller fault')) return out('unavailable', steps.at(-1).detail);
  const r = deviceRuntime(array), vol = r.volumes[volumeId];
  if (!test('Volume', !!vol, 'Volume ' + volumeId + ' does not exist on ' + array.id)) return out('unavailable', steps.at(-1).detail);
  const use = poolUse(array, vol.pool);
  if (!test('Pool', use.health.state !== 'failed', 'Pool ' + vol.pool + ' FAILED (' + use.health.failed + ' drives lost, more than ' + vol.pool + ' protection tolerates) · volume data lost')) return out('unavailable', steps.at(-1).detail, { record: vol });
  if (!test('Controllers', !(controllerFailed(array, 'A') && controllerFailed(array, 'B')), 'Both controllers of ' + array.id + ' have failed')) return out('unavailable', steps.at(-1).detail, { record: vol });
  if (!test('Masking / mapping', !!host && mappedTo(array, vol, host), 'Volume ' + volumeId + ' is not mapped to ' + (host?.id || 'this host') + (vol.group ? ' (host group ' + vol.group + ' does not contain it)' : ''))) return out('unavailable', steps.at(-1).detail, { record: vol });
  const reg = registration(array, host);
  if (!test('Host registration', !!reg, host.id + ' is not registered on ' + array.id)) return out('unavailable', steps.at(-1).detail, { record: vol });
  const s = configuredProduct(array).storage, h = configuredProduct(host).host;
  if (!test('Array data ports', !!s.protocol, array.id + ' data ports (path A/B) are not configured')) return out('unavailable', steps.at(-1).detail, { record: vol });
  if (!test('Transport', s.protocol === vol.protocol, array.id + ' data ports use ' + s.protocol + ' but ' + volumeId + ' is ' + vol.protocol)) return out('unavailable', steps.at(-1).detail, { record: vol });
  if (!test('Host initiator', h.protocol === vol.protocol && !!h.initiatorEnabled, host.id + ' has no enabled ' + vol.protocol + ' initiator')) return out('unavailable', steps.at(-1).detail, { record: vol });
  const own = vol.protocol === 'FC' ? [h.wwpnA, h.wwpnB] : [h.iqn];
  if (!test('Initiator identity', own.includes(reg.initiator), 'Registered initiator ' + reg.initiator + ' does not match ' + host.id + ' (' + own.filter(Boolean).join(' / ') + ')')) return out('unavailable', steps.at(-1).detail, { record: vol });
  if (vol.protocol === 'iSCSI' && reg.chap && !test('iSCSI login (CHAP)', reg.chap === h.chapSecret, 'iSCSI login failed: CHAP authentication failure (target error 0x0201) · host CHAP secret ' + (h.chapSecret ? 'does not match' : 'is not set for') + ' the secret on ' + array.id)) return out('unavailable', steps.at(-1).detail, { record: vol });
  if (!test('Host power', !physicalOffline(host), host.id + ' is powered off or booting')) return out('unavailable', steps.at(-1).detail, { record: vol });
  const paths = pathsTo(array, host, ctx), missing = ['A', 'B'].filter(x => !paths.some(p => p.side === x));
  const reasons = missing.map(side => diagnoseSide(array, host, side, ctx, paths));
  const state = paths.length >= 2 ? 'healthy' : paths.length === 1 ? 'degraded' : 'unavailable';
  test('Data paths', paths.length > 0, state === 'healthy' ? 'Two independent paths' : reasons.join(' · '));
  const owner = controllerFailed(array, vol.owner || 'A') ? ((vol.owner || 'A') === 'A' ? 'B' : 'A') : (vol.owner || 'A');
  const annotated = paths.map(p => ({ ...p, alua: p.side === owner ? 'optimized' : 'non-optimized' }));
  const reason = state === 'healthy' ? 'Healthy · ' + paths.map(p => p.side + ': ' + p.path).join(' | ') : state === 'degraded' ? 'Degraded · 1 of 2 paths · ' + reasons.join(' · ') : 'Unavailable · ' + reasons.join(' · ');
  const ro = use.full ? 'read-only' : vol.access || 'read-write';
  return { state, ok: paths.length > 0, reason: use.full && paths.length ? reason + ' · pool ' + vol.pool + ' is FULL (' + use.consumed + ' / ' + use.usable + ' GiB) · volumes are read-only' : reason, steps, paths: annotated, record: vol, access: ro, owner, chap: !!reg.chap, poolFull: use.full, lun: vol.lun ?? 0 };
}

export function hostVolumes(host, ctx) {
  const out = [];
  for (const array of ctx.nodes.filter(n => n.type === 'storage' && n.active !== false && n.net?.runtime)) {
    for (const vol of values(deviceRuntime(array).volumes)) if (mappedTo(array, vol, host)) out.push({ array: array.id, volume: vol.id, sizeGiB: vol.sizeGiB, ...volumeAccess(array, vol.id, host, ctx) });
  }
  return out;
}
export function arrayVolumes(array, ctx) {
  const r = deviceRuntime(array), out = [];
  for (const vol of values(r.volumes)) {
    const hosts = vol.group ? (r.hostGroups?.[vol.group]?.hosts || []) : vol.host ? [vol.host] : [];
    if (!hosts.length) out.push({ volume: vol.id, host: '', state: 'unmapped', reason: 'Not mapped to any host', ok: false });
    for (const id of hosts) out.push({ volume: vol.id, host: id, ...volumeAccess(array, vol.id, ctx.byId[id], ctx) });
  }
  return out;
}
