// LACP / link-aggregation rules for one physical member link (pure; used by link state and the switch
// and FortiGate logic). A port joins port-channel N with `channel-group N mode active|passive` (FortiOS:
// aggregate interface). The member is bundled only when the far end is also an LACP member, not both
// passive, and it has the same speed and VLAN configuration as the other members. Otherwise the member
// is suspended (s) and carries no traffic, exactly like `show port-channel summary` reports it.
const vlanSig = c => [c.mode || 'access', c.mode === 'trunk' ? (c.allowed || []).slice().sort((a, b) => a - b).join(',') : c.access, c.native || 1].join('|');
export function lagMembers(n, lag) { return n.ports.filter(p => p.cfg?.lag !== undefined && p.cfg?.lag !== null && p.cfg.lag !== '' && String(p.cfg.lag) === String(lag)); }
// Returns null when the member may forward, else a reason string.
export function lagProblem(n, p, byId) {
  const c = p.cfg || {}; if (c.lag === undefined || c.lag === null || c.lag === '') return null;
  const l = p.link; if (!l || l.unplugged) return null;
  const peer = byId[l.a === n.id ? l.b : l.a], far = l.pa === p ? l.pb : l.pa, fc = far.cfg || {};
  if (fc.lag === undefined || fc.lag === null || fc.lag === '') return 'suspended · no LACPDUs from ' + peer.id + ' / ' + (far.alias || far.name) + ' (far end is not in a port-channel)';
  if ((c.lacp || 'active') === 'passive' && (fc.lacp || 'active') === 'passive') return 'suspended · both ends are LACP passive, nobody starts negotiation';
  if ((c.lacp === 'on') !== (fc.lacp === 'on')) return 'suspended · static channel (mode on) facing an LACP port';
  const members = lagMembers(n, c.lag).filter(x => x.link && !x.link.unplugged), first = members[0];
  if (first && first !== p) {
    if (first.speed !== p.speed) return 'suspended · speed ' + p.speed + 'G differs from port-channel member ' + (first.alias || first.name) + ' (' + first.speed + 'G)';
    if (vlanSig(first.cfg) !== vlanSig(c)) return 'suspended · VLAN configuration differs from port-channel member ' + (first.alias || first.name);
    const peers = new Set(members.map(x => (x.link.a === n.id ? x.link.b : x.link.a)));
    if (peers.size > 1 && ![...peers].every(id => byId[id]?.net?.mclag && [...peers].includes(byId[id].net.mclag))) return 'suspended · members go to different switches (' + [...peers].join(', ') + ') without an MCLAG pair';
  }
  return null;
}
