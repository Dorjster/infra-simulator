// Hop-by-hop explanation of a failed Layer-2 path.
// The office evaluator decides reachability; this module only explains *where* a failed path
// breaks so the learner gets a concrete port / cable / VLAN to fix. It reads the same shared link,
// port and power state. No packets are simulated.
import { physicalOffline, physicalLinkDown } from './operations.js';

export const managementPort = p => !!p && (p.service || /MGMT|SERVICE|management/i.test(p.name) || /^mgmt/i.test(p.alias || ''));
const carries = (p, v) => { const c = p.cfg; return !c || (c.admin !== false && (c.mode === 'trunk' ? (c.allowed || []).includes(v) : c.access === v)); };
const vlanText = p => { const c = p.cfg || {}; return c.mode === 'trunk' ? 'trunk ' + (c.allowed || []).join(',') : 'access ' + c.access; };
const label = (n, p) => n.id + ' / ' + (p.alias || p.name);
const forwards = n => ['switch', 'firewall'].includes(n?.type);

// Returns a sentence naming the blocking hop closest to the destination, or null if the path works.
// options.online(id) decides power/site availability. options.dataOnly excludes b's management /
// service ports (an iDRAC or iLO link is never a host data path).
export function explainL2({ links, byId }, a, b, v, { online = id => !physicalOffline(byId[id]), dataOnly = false } = {}) {
  if (!byId[a]) return 'Source device is not assigned';
  if (!byId[b]) return 'Destination device is not assigned';
  if (!online(a)) return a + ' is powered off, booting or has a hardware fault';
  if (!online(b)) return b + ' is powered off, booting or has a hardware fault';
  const ends = (l, id) => l.a === id ? [l.b, l.pa, l.pb] : l.b === id ? [l.a, l.pb, l.pa] : null;
  const ethernet = l => !l.retired && l.pa && l.pb && l.pa.medium === 'Ethernet' && l.pb.medium === 'Ethernet';
  const skip = (next, far) => next === b && dataOnly && managementPort(far);
  // 1. Physical distance to b over every cable (plugged or not) through forwarding devices.
  const dist = new Map([[b, 0]]), q = [b];
  while (q.length) { const id = q.shift(); for (const l of links) { if (!ethernet(l)) continue; const e = ends(l, id); if (!e) continue; const [next, own] = e; if (id === b && skip(b, own)) continue; if (dist.has(next) || !byId[next] || byId[next].active === false) continue; if (next !== a && !forwards(byId[next])) continue; dist.set(next, dist.get(id) + 1); q.push(next); } }
  if (!dist.has(a)) return 'No Ethernet cable path from ' + a + ' to ' + b + (dataOnly ? ' (management / iDRAC / iLO ports do not carry data VLANs)' : '');
  // 2. Working reach from a, exactly like the evaluator (link up, both ends carry v, VLAN defined).
  const reach = new Set([a]), work = [a], blocked = [];
  while (work.length) {
    const id = work.shift(), n = byId[id];
    if (id !== a && !forwards(n)) continue;
    if (!n.net?.vlans?.[v]) { blocked.push({ d: dist.get(id) ?? 1e9, text: 'VLAN ' + v + ' is not defined on ' + id, node: true }); continue; }
    for (const l of links) {
      if (!ethernet(l)) continue; const e = ends(l, id); if (!e) continue; const [next, near, far] = e;
      if (reach.has(next) || !dist.has(next) || skip(next, far)) continue;
      const nt = byId[next], d = dist.get(next);
      const why = l.unplugged ? 'Cable ' + label(n, near) + ' ↔ ' + label(nt, far) + ' is unplugged'
        : !online(next) ? next + ' is powered off, booting or has a hardware fault'
        : l.fault || near.fault || far.fault ? 'Link fault on ' + label(n, near) + ' ↔ ' + label(nt, far) + ' (' + (near.fault || far.fault || l.fault) + ')'
        : near.cfg?.admin === false ? label(n, near) + ' is administratively down'
        : far.cfg?.admin === false ? label(nt, far) + ' is administratively down'
        : (near.cfg?.mtu || 1500) !== (far.cfg?.mtu || 1500) ? 'MTU mismatch ' + label(n, near) + ' (' + (near.cfg?.mtu || 1500) + ') ↔ ' + label(nt, far) + ' (' + (far.cfg?.mtu || 1500) + ')'
        : !carries(near, v) ? label(n, near) + ' does not carry VLAN ' + v + ' (' + vlanText(near) + ')'
        : !carries(far, v) ? label(nt, far) + ' does not carry VLAN ' + v + ' (' + vlanText(far) + ')'
        : physicalLinkDown(l, byId) ? 'Link ' + label(n, near) + ' ↔ ' + label(nt, far) + ' is down (optic, speed or VLAN mode mismatch)'
        : null;
      if (why) { blocked.push({ d, text: why, to: next }); continue; }
      reach.add(next); work.push(next);
    }
  }
  if (reach.has(b)) return null;
  const open = blocked.filter(x => x.node || !reach.has(x.to)).sort((x, y) => x.d - y.d);
  return open[0]?.text || 'VLAN ' + v + ' cannot reach ' + b + ' from ' + a;
}
