// Task-focused status and diagnostic commands for every device type. Short, readable output that
// reads the same shared state the GUIs, monitoring and objectives use. Configuration commands stay
// in the vendor-inspired CLI subsets (FortiOS / OS10 / NX-OS / Fabric OS).
import { productProfile, configuredProduct } from './product-profiles.js';
import { deviceRuntime, installStatus, resourceUse, poolUsable } from './device-runtime.js';

const pad = (s, n) => String(s ?? '').padEnd(n);
const rows = (heads, list, widths) => [heads.map((h, i) => pad(h, widths[i])).join(' '), heads.map((h, i) => '-'.repeat(Math.max(3, widths[i] - 1)).padEnd(widths[i])).join(' '), ...list.map(r => r.map((c, i) => pad(c, widths[i])).join(' '))].join('\n');
const ok = b => (b ? 'OK ' : 'ERR');

export function plusHelp(n, ctx) {
  const f = productProfile(n).family;
  const common = '\n\n— Quick status (all devices) —\nstatus                 one-screen health and next step';
  if (f === 'fortigate') return common + '\nget system isp         circuit sheet, provider router and WAN state\nshow system interface  ports, VLAN interfaces and DHCP\nshow firewall policy   policy table (top-down)\nexecute ping HOST      ping from the firewall (name, IP or URL)\nexecute traceroute HOST';
  if (['idrac', 'ilo'].includes(f)) return common + '\nracadm getsysinfo      power, controller, OS/installer\nshow vms               virtual machines and why they run or not\nshow services          listeners, ports and state\nshow paths             block volumes seen by the host (A/B paths)';
  if (n.type === 'storage') return common + '\nshow pools             raw / usable / allocated capacity\nshow volumes           volumes, mapping and access\nshow hosts             registered initiators and host groups\nshow paths             per-host access: healthy / degraded / unavailable';
  if (f === 'isp') return common;
  return common + '\nshow interfaces status link, VLAN and neighbour per port';
}

export function plusCLI(input, session, ctx) {
  const n = session?.node; if (!n) return null;
  const text = input.trim(), lower = text.toLowerCase().replace(/\s+/g, ' '), f = productProfile(n).family;
  if (lower === 'status') return status(n, ctx);
  if (f === 'fortigate') {
    const o = ctx.office, s = o?.state, bound = !!s && s.bindings.firewall === n.id;
    if (lower === 'get system isp' || lower === 'diagnose isp') {
      const c = n.net.ispContract, w = ctx.wanStatus(n);
      if (!c) return 'No ISP circuit. Order one in Procurement → ISP services.';
      return [`Circuit        ${c.id}  ${c.planName || 'Static /30'}`, `Addressing     ${c.mode || 'Static'}  ${c.ip}/${c.prefix || 30}  gw ${c.gateway}  dns ${c.dns || '1.1.1.1'}`, ...(c.block ? [`Public block   ${c.block.network}  usable ${c.block.usable.join(' ')}`] : []), ...(c.pppoe ? [`PPPoE          user ${c.pppoe.user}`] : []), `Provider CPE   ${c.physical ? (ctx.nodes.find(x => x.type === 'isp' && x.spec?.contract === c.id)?.id || 'not racked') : 'logical handoff'}`, `WAN            ${w.ok ? 'UP' : 'DOWN'}  ${w.reason}`].join('\n');
    }
    if (bound && lower === 'show system interface') {
      const ports = n.ports.filter(p => !p.service && p.medium === 'Ethernet');
      const phys = rows(['Port', 'Admin', 'Link', 'Mode', 'Address'], ports.map(p => [p.alias || p.name, p.cfg.admin === false ? 'down' : 'up', p.link && !p.link.unplugged ? (p.link.disabled ? 'down' : 'up→' + (p.link.a === n.id ? p.link.b : p.link.a)) : 'no cable', p.cfg.mode === 'trunk' ? 'trunk ' + p.cfg.allowed.join(',') : 'access ' + p.cfg.access, p.cfg.ip ? p.cfg.ip + '/' + p.cfg.prefix : '']), [10, 6, 26, 18, 18]);
      const vl = rows(['VLAN', 'Name', 'Gateway', 'Zone', 'DHCP', 'State'], Object.values(s.vlans).sort((a, b) => a.id - b.id).map(v => [v.id, v.name || '', v.ip + '/' + v.prefix, v.zone || '', s.dhcp[v.id]?.enabled ? '.' + s.dhcp[v.id].start + '-.' + s.dhcp[v.id].end : 'off', v.enabled ? 'up' : 'down']), [5, 12, 18, 12, 12, 6]);
      return phys + '\n\n' + vl;
    }
    if (bound && lower === 'show firewall policy' && !(n.net.enterprise?.policies || []).length)
      return rows(['#', 'ID', 'From', 'To', 'Service', 'Action', 'NAT', 'State'], Object.values(s.policies).map((p, i) => [i + 1, p.id, p.src, p.dst, p.service, p.action, p.nat ? 'SNAT' : '-', p.enabled ? 'on' : 'off']), [3, 14, 10, 10, 8, 7, 5, 5]) + '\n  implicit deny';
    let m;
    if ((m = /^execute (ping|traceroute) (\S+)$/i.exec(text))) {
      if (!bound || !o.firewallPing) return 'execute ' + m[1] + ': this FortiGate is not the office gateway (assign it in Office → Infrastructure).';
      const r = o.firewallPing(m[2]);
      if (m[1].toLowerCase() === 'traceroute') return `traceroute to ${m[2]}\n` + (r.hops.length ? r.hops.map(h => ` ${h.hop}  ${h.address}  ${h.state === 'reply' ? '1 ms' : '*  *  *'}`).join('\n') : ' 1  *  *  *') + '\n' + r.reason;
      return r.ok ? `PING ${m[2]}: 5 packets transmitted, 5 received, 0% loss\n${r.reason}` : `PING ${m[2]}: 5 packets transmitted, 0 received, 100% loss\n${r.reason}`;
    }
    return null;
  }
  if (['idrac', 'ilo'].includes(f)) {
    const r = deviceRuntime(n);
    if (lower === 'racadm getsysinfo' || lower === 'show server') {
      const i = installStatus(n), host = ctx.localStatus(n, true);
      return [`System        ${n.model} (${n.id})`, `Host power    ${host.ok ? 'ON' : 'OFF'}  ${host.ok ? '' : host.reason}`, `${f === 'ilo' ? 'iLO' : 'iDRAC'} IP      ${n.net.ip}/${n.net.prefix} VLAN ${n.net.vlan}`, `OS            ${r.os || 'none'}   installer: ${i.reason}`, `Hypervisor    ${r.hypervisor || 'none'}`, `Host data IP  ${r.hostIP || '-'}${r.hostIP ? '/' + r.hostPrefix + ' VLAN ' + r.hostVlan + ' gw ' + (r.gateway || '-') : ''}`, `Faults        ${n.physical?.fault || 'none'}`].join('\n');
    }
    if (lower === 'show vms') { const use = resourceUse(n); return rows(['VM', 'Power', 'IP', 'Port group', 'State'], Object.values(r.vms).map(v => { const s = ctx.vmState(n, v); return [v.id, v.on ? 'on' : 'off', v.ip ? v.ip + '/' + (v.prefix || 24) : '-', v.network, s.reason]; }), [12, 6, 17, 12, 50]) + `\nAllocated ${use.cpu}/${r.cpu} vCPU · ${use.memory}/${r.memory} GiB`; }
    if (lower === 'show services') return rows(['Service', 'Runs on', 'Listener', 'State', 'Host FW'], [r, ...Object.values(r.vms)].flatMap(t => Object.values(t.services || {}).map(s => [s.id, t.id || 'host OS', s.ip + ':' + s.port, s.running ? 'running' : 'stopped', s.firewall ? 'open' : 'closed'])), [12, 10, 20, 9, 8]);
    if (lower === 'show paths' || lower === 'esxcli storage core path list') { const v = ctx.hostVolumes(n); return v.length ? v.map(x => `${x.array}/${x.volume}  ${x.state.toUpperCase()}  (${x.access || '-'})\n  ${x.reason}`).join('\n') : 'No block volumes presented to this host.'; }
    return null;
  }
  if (n.type === 'storage') {
    const r = deviceRuntime(n);
    if (lower === 'show pools') return rows(['Pool', 'Protection', 'Raw', 'Usable', 'Allocated'], Object.values(r.pools).map(p => [p.id, p.protection, p.sizeGiB, poolUsable(p), Object.values(r.volumes).filter(v => v.pool === p.id).reduce((t, v) => t + v.sizeGiB, 0)]), [12, 15, 8, 8, 10]);
    if (lower === 'show volumes') return rows(['Volume', 'Pool', 'GiB', 'Proto', 'Mapped to', 'Access'], Object.values(r.volumes).map(v => [v.id, v.pool, v.sizeGiB, v.protocol, v.group ? 'group ' + v.group : v.host || '-', v.access || 'read-write']), [14, 10, 7, 9, 20, 11]);
    if (lower === 'show hosts') return rows(['Host', 'Initiator', 'Transport'], Object.values(r.hosts).map(h => [h.id, h.initiator, h.protocol || '-']), [22, 44, 9]) + (Object.keys(r.hostGroups || {}).length ? '\n\nHost groups:\n' + Object.values(r.hostGroups).map(g => `  ${g.id}: ${g.hosts.join(', ')}`).join('\n') : '');
    if (lower === 'show paths') { const v = ctx.arrayVolumes(n); return v.length ? v.map(x => `${x.volume} → ${x.host || 'unmapped'}  ${String(x.state).toUpperCase()}\n  ${x.reason}`).join('\n') : 'No volumes.'; }
    return null;
  }
  if (lower === 'show interfaces status' && ['switch', 'san'].includes(n.type))
    return rows(['Port', 'Admin', 'Link', 'VLAN', 'Neighbour'], n.ports.filter(p => !p.service && p.medium !== 'Internal').map(p => [p.alias || p.name, p.cfg.admin === false ? 'down' : 'up', p.link && !p.link.unplugged ? (p.link.disabled ? 'down' : 'up') : '-', p.cfg.mode === 'trunk' ? 'trk ' + p.cfg.allowed.join(',') : p.cfg.access, p.link && !p.link.unplugged ? (p.link.a === n.id ? p.link.b + '/' + p.link.pb.name : p.link.a + '/' + p.link.pa.name) : '']), [16, 6, 5, 14, 30]);
  return null;
}

function status(n, ctx) {
  const f = productProfile(n).family, p = configuredProduct(n), local = ctx.localStatus(n);
  const lines = [`${n.model} · ${n.net.hostname || n.id}`, `Power/access  ${local.reason}`, `Management    ${n.net.ip === '0.0.0.0' ? 'not configured' : n.net.ip + '/' + n.net.prefix + ' VLAN ' + n.net.vlan}  SSH ${n.net.ssh ? 'on' : 'off'}`];
  let next = '';
  if (f === 'fortigate') { const legacy = !n.spec && ctx.office?.state.bindings.firewall === n.id, r = legacy ? ctx.office.firewallPing('example.test') : null, w = legacy ? { ok: r.ok, reason: 'provider edge (pre-installed) · ' + r.reason } : ctx.wanStatus(n); lines.push(`WAN           ${w.ok ? 'UP' : 'DOWN'} · ${w.reason}`); if (!w.ok) next = w.reason; }
  else if (['idrac', 'ilo'].includes(f)) { const r = deviceRuntime(n), i = installStatus(n), vms = Object.values(r.vms); lines.push(`OS            ${i.reason}`, `VMs           ${vms.filter(v => v.on && ctx.vmState(n, v).ok).length}/${vms.length} running`); next = !r.os ? 'Install an OS (Virtual media · Install OS)' : vms.find(v => v.on && !ctx.vmState(n, v).ok) ? 'VM problem: ' + ctx.vmState(n, vms.find(v => v.on && !ctx.vmState(n, v).ok)).reason : ''; }
  else if (n.type === 'storage') { const v = ctx.arrayVolumes(n); lines.push(`Volumes       ${v.filter(x => x.state === 'healthy').length} healthy · ${v.filter(x => x.state === 'degraded').length} degraded · ${v.filter(x => x.state === 'unavailable').length} unavailable`); const bad = v.find(x => x.host && x.state !== 'healthy'); if (bad) next = bad.volume + ' → ' + bad.host + ': ' + bad.reason; if (!p.identity.passwordSet) next = 'Complete the initial setup (system identity)'; }
  else if (['switch', 'san'].includes(n.type)) { const up = n.ports.filter(x => x.link && !x.link.unplugged && !x.link.disabled).length, down = n.ports.filter(x => x.link && (x.link.unplugged || x.link.disabled)).length; lines.push(`Ports         ${up} up · ${down} down`); if (down) next = 'Check down links: show interfaces status'; }
  if (!next && n.net.ip === '0.0.0.0') next = 'Assign a management address';
  lines.push(`Next step     ${next || 'none — healthy'}`);
  return lines.join('\n');
}
