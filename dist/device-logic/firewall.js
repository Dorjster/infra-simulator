// FortiGate firewall logic.
//
// State machine (power / boot):   no input ──PSU cord──▶ booting (5 s: LEDs, console, then HTTPS) ──▶ running
//   running ──last feed lost / PDU trip──▶ no input      running ──hardware fault──▶ fault
// Configuration store: when the FortiGate is the office gateway (or its HA peer) the office network
// model *is* its configuration (VLAN interfaces, DHCP, DNS, routes, policies, VIPs). The GUI, the
// FortiOS CLI (`config …`, `show full-configuration`), the office path evaluator and the contract
// steps all read that one store. A standalone FortiGate uses its own n.net.enterprise store.
// Derived views (never stored): routing table (longest prefix, distance, inactive when the interface
// is down), DHCP lease table, session table, HA role, SD-WAN member health, `diagnose debug flow`.
import { chk, warn, ordered, firstFailure, healthOf, baseChecks, managementCheck, baseLeds, alarmsFrom, portsState, powerState, bootState, led, table, ERR, peerOf, physicalOffline, configuredProduct, mac, memo } from './common.js';
import { ispHandoff } from '../product-config.js';
const validIPv4 = s => /^\d{1,3}(\.\d{1,3}){3}$/.test(s || '') && s.split('.').every(x => +x <= 255);
const sameSubnet = (a, b, p = 24) => { const m = p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0; const v = x => x.split('.').reduce((n, y) => (n * 256 + Number(y)) >>> 0, 0); return ((v(a) & m) >>> 0) === ((v(b) & m) >>> 0); };

export const FORTIOS = 'v7.4.3,build2573,240208 (GA.F)';
const num = s => s.split('.').reduce((n, v) => (n * 256 + Number(v)) >>> 0, 0);
const ipOf = x => [x >>> 24, (x >>> 16) & 255, (x >>> 8) & 255, x & 255].join('.');
const network = (ip, p) => ipOf((num(ip) & (p ? (0xffffffff << (32 - p)) >>> 0 : 0)) >>> 0);
const inNet = (ip, net, p) => validIPv4(ip) && validIPv4(net) && (p === 0 || sameSubnet(ip, net, p));
const lanPorts = n => n.ports.filter(p => !p.service && p.medium === 'Ethernet' && p.name !== 'MGMT UPLINK');
const bound = (n, office) => { const s = office?.state; return !!s && (s.bindings.firewall === n.id || (s.ha?.enabled && s.ha.peer === n.id)); };
const portUp = (n, p, ctx) => !!p && p.cfg?.admin !== false && !!p.link && !p.link.unplugged && !p.link.disabled && !physicalOffline(n);

// Normalized configuration view of whichever store is active.
export function fwConfig(n, ctx) {
  const office = ctx.office, s = office?.state, isBound = bound(n, office), w = configuredProduct(n).wan, e = n.net.enterprise || { policies: [], routes: [], interfaces: [], addresses: {} };
  const ports = lanPorts(n);
  const carriers = v => ports.filter(p => p.cfg && (p.cfg.mode === 'trunk' ? (p.cfg.allowed || []).includes(+v) : p.cfg.access === +v));
  if (isBound) {
    const vlans = Object.values(s.vlans).sort((a, b) => a.id - b.id).map(v => { const parents = carriers(v.id); return { name: 'VLAN' + v.id, vlanid: v.id, alias: v.name || '', ip: v.ip, prefix: v.prefix, enabled: !!v.enabled, parents: parents.map(p => p.name), up: !!v.enabled && parents.some(p => portUp(n, p, ctx)), zone: v.zone || '', dhcp: s.dhcp[v.id] || null }; });
    const policies = Object.values(s.policies).map((p, i) => ({ seq: i + 1, id: p.id, name: p.id, srcintf: p.src, dstintf: p.dst, srcaddr: p.source || 'any', dstaddr: p.destination || 'any', service: p.service || 'any', action: p.action, nat: !!p.nat, enabled: !!p.enabled, schedule: (p.start ?? 0) === 0 && (p.end ?? 24) === 24 ? 'always' : (p.start ?? 0) + ':00-' + (p.end ?? 24) + ':00', profile: p.profile || '', hits: p.hits || 0, lastUsed: p.lastUsed || 0 }));
    const routes = Object.values(s.routes).map(r => ({ type: 'S', dst: r.destination, gateway: r.gateway, dev: r.interface === 'wan' ? (w.port || 'wan') : /^\d+$/.test(String(r.interface)) ? 'VLAN' + r.interface : r.interface, distance: +r.metric || 10, enabled: r.enabled !== false, name: r.id, blackhole: r.interface === 'blackhole' }));
    return { bound: true, store: 'office', vlans, policies, routes, dhcp: s.dhcp, dns: { service: s.dnsEnabled !== false && s.wan.dnsService !== false, forward: s.wan.dnsForward !== false, mode: s.wan.dnsMode || (s.wan.dnsForward === false ? 'non-recursive' : 'forward-only'), upstream: s.wan.dns || n.net.ispContract?.dns || '', records: Object.values(s.dns) }, vips: Object.values(s.vips), wanPort: w.port || '', sessions: s.sessions || [] };
  }
  const vlans = (e.interfaces || []).map(x => { const parent = n.ports.find(p => p.name === x.parent); return { name: x.name, vlanid: x.vlanid, alias: '', ip: x.ip, prefix: x.prefix, enabled: x.enabled !== false, parents: parent ? [parent.name] : [], up: x.enabled !== false && portUp(n, parent, ctx), zone: '', dhcp: null }; });
  for (const p of ports) if (p.cfg?.ip && p.name !== w.port) vlans.push({ name: p.name, vlanid: 0, alias: '', ip: p.cfg.ip, prefix: p.cfg.prefix, enabled: p.cfg.admin !== false, parents: [p.name], up: portUp(n, p, ctx), zone: '', dhcp: null });
  const policies = (e.policies || []).map((p, i) => ({ seq: i + 1, id: p.id, name: p.name, srcintf: p.srcintf, dstintf: p.dstintf, srcaddr: p.srcaddr || 'all', dstaddr: p.dstaddr || 'all', service: p.service || 'ALL', action: p.action, nat: !!p.nat, enabled: p.enabled !== false, schedule: 'always', profile: '', hits: p.hits || 0 }));
  const routes = (e.routes || []).filter(r => r.id !== 9999).map(r => ({ type: 'S', dst: r.dst, gateway: r.gateway, dev: r.device, distance: 10, enabled: true, name: String(r.id) }));
  return { bound: false, store: 'device', vlans, policies, routes, dhcp: {}, dns: { service: false, forward: false, mode: 'non-recursive', upstream: '', records: [] }, vips: [], wanPort: w.port || '', sessions: [] };
}

// WAN / SD-WAN members. Member 1 is the physical circuit on the FortiGate WAN port; member 2 is the
// purchased secondary circuit (office). Each member's health check pings the provider gateway.
export function wanMembers(n, ctx) {
  const s = ctx.office?.state, c = n.net.ispContract, w = configuredProduct(n).wan, list = [];
  if (n.spec) { const st = ctx.network.wanStatus(n); list.push({ seq: 1, port: w.port || '(none)', gateway: c?.gateway || '-', ok: st.ok, reason: st.reason, latency: 4.5 }); }
  else { const edge = n.ports.find(p => { const peer = peerOf(n, p); return peer && ['CLOUD EDGE', 'INTERNET'].includes(peer.id); }); const up = !!edge && !edge.link.disabled && (s?.wan.up !== false); list.push({ seq: 1, port: edge?.name || 'wan1', gateway: s?.wan.gateway || '203.0.113.5', ok: up, reason: up ? 'Provider edge up' : s?.wan.up === false ? 'ISP link down' : 'No provider cable', latency: 4.5 }); }
  if (s?.wan.secondary && s.inventory.some(i => i.sku === 'wan2' && i.installed)) list.push({ seq: 2, port: 'wan2', gateway: '198.51.100.1', ok: s.wan.secondaryUp !== false, reason: s.wan.secondaryUp !== false ? 'Secondary circuit up' : 'Secondary circuit down', latency: 11.2 });
  return list;
}
export function haStatus(n, ctx) {
  const s = ctx.office?.state, byId = ctx.byId;
  if (!s?.ha?.enabled || !bound(n, ctx.office)) return { mode: 'standalone', members: [] };
  const a = byId[s.bindings.firewall], b = byId[s.ha.peer];
  const cable = a && b && a.ports.find(p => /^(ha|HA1|HA2)$/.test(p.name) && peerOf(a, p)?.id === b.id && /^(ha|HA1|HA2)$/.test(peerOf(a, p).port.name));
  const heartbeat = a?.spec && b?.spec ? !!cable && !cable.link.disabled : !!s.ha.heartbeat;
  const modelMatch = !a || !b || (a.spec?.sku || a.model) === (b.spec?.sku || b.model);
  const fwMatch = (a?.net.firmware || FORTIOS) === (b?.net.firmware || FORTIOS);
  const active = ctx.office.activeFirewall?.();
  return { mode: 'a-p', group: 'FGT-HA', heartbeat, cable: !!cable, modelMatch, fwMatch, synced: !!s.ha.synced, primary: active?.id || '-', members: [a, b].filter(Boolean).map(x => ({ id: x.id, role: active?.id === x.id ? 'primary' : 'secondary', online: !physicalOffline(x), firmware: x.net.firmware || FORTIOS })), sessionPickup: true };
}

// Routing table: connected (interface up), static (enabled, interface up) and the WAN default route.
export function routingTable(n, ctx) {
  return memo(n, 'fw-rib', () => {
    const cfg = fwConfig(n, ctx), w = configuredProduct(n).wan, c = n.net.ispContract, rows = [], wanPort = n.ports.find(p => p.name === w.port);
    for (const v of cfg.vlans) if (validIPv4(v.ip)) rows.push({ type: 'C', dst: network(v.ip, v.prefix) + '/' + v.prefix, dev: v.name, distance: 0, active: v.up, reason: v.up ? '' : v.enabled ? 'parent port down' : 'interface disabled' });
    const members = wanMembers(n, ctx);
    if (n.spec && c && w.ip) rows.push({ type: 'C', dst: network(w.ip, c.prefix || 30) + '/' + (c.prefix || 30), dev: w.port, distance: 0, active: portUp(n, wanPort, ctx) || members[0]?.ok, reason: 'WAN link down' });
    const dflt = (n.net.enterprise?.routes || []).find(r => r.dst === '0.0.0.0/0') || (!n.spec && ctx.office?.state.wan.defaultRoute ? { gateway: ctx.office.state.wan.gateway, device: members[0]?.port } : null);
    if (dflt) rows.push({ type: 'S', dst: '0.0.0.0/0', gateway: dflt.gateway, dev: dflt.device, distance: 10, active: !!members[0]?.ok, reason: members[0]?.reason || '' });
    if (members[1]) rows.push({ type: 'S', dst: '0.0.0.0/0', gateway: members[1].gateway, dev: members[1].port, distance: 10, active: members[1].ok, reason: members[1].reason });
    for (const r of cfg.routes) { const dev = r.dev, vlan = cfg.vlans.find(v => v.name === dev), up = r.blackhole || (vlan ? vlan.up : dev === w.port ? !!members[0]?.ok : dev === 'vpn' ? !!ctx.office?.vpnStatus?.().ok : true); rows.push({ ...r, type: r.blackhole ? 'B' : 'S', active: r.enabled && up, reason: !r.enabled ? 'disabled' : up ? '' : dev + ' down' }); }
    return rows;
  });
}
export function routeLookup(n, ctx, dest) {
  const rows = routingTable(n, ctx).filter(r => r.active && r.dst).map(r => ({ ...r, len: +r.dst.split('/')[1] })).filter(r => inNet(dest, r.dst.split('/')[0], r.len));
  rows.sort((a, b) => b.len - a.len || a.distance - b.distance);
  return rows[0] || null;
}
// DHCP lease table derived from the office DHCP server and the clients that reach it.
export function dhcpLeases(n, ctx) {
  const o = ctx.office, s = o?.state; if (!s || !bound(n, o)) return [];
  const out = [];
  for (const pc of Object.values(s.pcs)) { if (!pc.dhcp || !pc.power) continue; const a = o.access(pc); if (!a.ok) continue; const l = o.lease(pc, a); out.push({ ip: l.ok ? l.ip : '169.254.' + (pc.id.length * 7 % 254) + '.' + (pc.mac.slice(-2).charCodeAt(0) % 254), mac: pc.mac, host: pc.id, vlan: a.vlan, ok: !!l.ok, reason: l.reason || 'bound', expiry: l.ok ? (s.dhcp[a.vlan]?.lease || 3600) + ' s' : '-' }); }
  for (const ap of Object.values(s.aps)) { const st = o.apStatus(ap); if (/PoE|power/.test(st)) continue; const v = s.vlans[ap.mgmtVlan]; if (v?.enabled && s.dhcp[ap.mgmtVlan]?.enabled) out.push({ ip: v.ip.split('.').slice(0, 3).join('.') + '.' + (200 + Object.keys(s.aps).indexOf(ap.id)), mac: '04:d5:90:' + ap.id.length.toString(16).padStart(2, '0') + ':00:' + (Object.keys(s.aps).indexOf(ap.id) + 1).toString(16).padStart(2, '0'), host: ap.id, vlan: ap.mgmtVlan, ok: true, reason: 'bound', expiry: '3600 s' }); }
  return out;
}
// `diagnose debug flow` for one test packet, using the same evaluator as the GUI Diagnostics page.
export function debugFlow(n, ctx, pcId, url) {
  const o = ctx.office, s = o?.state; if (!s || !bound(n, o)) return { ok: false, stages: [], text: 'debug flow: this FortiGate is not the office gateway' };
  const pc = s.pcs[pcId] || Object.values(s.pcs).find(p => { const a = o.access(p); return a.ok && o.lease(p, a).ip === pcId; });
  if (!pc) return { ok: false, stages: [], text: 'debug flow: unknown source ' + pcId + ' (use a workstation ID or its IP)' };
  const r = o.evaluate(pc.id, url, s.users[pc.department === 'executive' ? 'ceo' : pc.department] || null), f = r.flow || {}, stages = [];
  const a = o.access(pc), ip = a.ok ? o.lease(pc, a) : null, src = ip?.ok ? ip.ip : '0.0.0.0', dst = f.dst || '198.51.100.20', port = f.port || 443;
  const trace = [], id = 'id=65308 trace_id=' + ((pc.id.length * 13 + String(url).length) % 97 + 1);
  const line = (fn, msg) => trace.push(id + ' func=' + fn + ' msg="' + msg + '"');
  const fail = r.steps.find(x => !x.ok);
  stages.push({ stage: 'Ingress', ok: !!ip?.ok, detail: ip?.ok ? 'received from VLAN' + a.vlan + ' (' + src + ')' : (fail?.detail || 'no IPv4 lease') });
  line('print_pkt_detail', 'vd-root:0 received a packet(proto=6, ' + src + ':51234->' + dst + ':' + port + ') from VLAN' + (a.vlan ?? '?') + '. flag [S]');
  if (!ip?.ok) { line('print_pkt_detail', 'packet dropped: ' + (fail?.detail || 'no source address')); return { ok: false, stages, text: trace.join('\n'), evaluation: r }; }
  line('init_ip_session_common', 'allocate a new session-000' + (1000 + (s.sessions?.length || 0)).toString(16));
  const route = routeLookup(n, ctx, dst);
  stages.push({ stage: 'Route lookup', ok: !!route, detail: route ? route.dst + ' via ' + (route.gateway || 'connected') + ' dev ' + route.dev : 'no route to ' + dst + ' (inactive or missing)' });
  line('vf_ip_route_input_common', route ? 'find a route: flag=04000000 gw-' + (route.gateway || dst) + ' via ' + route.dev : 'no matching route to ' + dst + ', drop');
  if (!route) return { ok: false, stages, text: trace.join('\n'), evaluation: r };
  const pol = r.steps.find(x => x.name === 'Firewall policy');
  if (pol) {
    stages.push({ stage: 'Policy match', ok: pol.ok, detail: pol.ok ? 'policy ' + (f.policy || '?') + ' accept' : pol.detail });
    line(pol.ok ? 'fw_forward_handler' : 'fw_forward_handler', pol.ok ? 'Allowed by Policy-' + f.policy + ':' + (f.nat ? ' SNAT' : '') : 'Denied by forward policy check (policy ' + (f.policy === 'implicit' ? 0 : f.policy) + ')');
    if (!pol.ok) return { ok: false, stages, text: trace.join('\n'), evaluation: r };
  } else stages.push({ stage: 'Policy match', ok: true, detail: 'same subnet · not forwarded by the firewall' });
  const natStep = r.steps.find(x => x.name === 'Source NAT'), wanIP = configuredProduct(n).wan.ip || s.wan.ip;
  if (natStep) { stages.push({ stage: 'NAT', ok: natStep.ok, detail: natStep.ok ? 'SNAT ' + src + ' → ' + wanIP : natStep.detail }); line('__ip_session_run_tuple', natStep.ok ? 'SNAT ' + src + '->' + wanIP + ':62464' : 'no SNAT for private source; reply cannot return'); if (!natStep.ok) return { ok: false, stages, text: trace.join('\n'), evaluation: r }; }
  else stages.push({ stage: 'NAT', ok: true, detail: 'no NAT (internal destination)' });
  stages.push({ stage: 'Egress', ok: r.ok, detail: r.ok ? 'sent out ' + route.dev : (fail ? fail.name + ' · ' + fail.detail : r.reason) });
  line('ipv4_fast_cb', r.ok ? 'enter fast path · egress ' + route.dev : 'egress failed: ' + (fail ? fail.name + ' · ' + fail.detail : r.reason));
  return { ok: r.ok, stages, text: trace.join('\n'), evaluation: r };
}

export function state(n, ctx) {
  const pw = powerState(n), boot = bootState(n), c = checks(n, ctx), cfg = fwConfig(n, ctx);
  return { power: pw, boot, mgmt: { ip: n.net.ip, factory: '192.168.1.99/24 on mgmt (HTTPS/SSH/ping)', passwordChanged: !!configuredProduct(n).identity.passwordSet, firmware: n.net.firmware || FORTIOS }, health: healthOf(c), ports: portsState(n, ctx), services: [{ id: 'dns', running: cfg.dns.service }, { id: 'dhcp', running: Object.values(cfg.dhcp).some(d => d?.enabled) }], wan: wanMembers(n, ctx), ha: haStatus(n, ctx), alarms: alarmsFrom(n, c, 'firewall'), config: cfg };
}
export function checks(n, ctx) {
  const out = baseChecks(n, ctx), p = configuredProduct(n), office = ctx.office, s = office?.state, isBound = bound(n, office);
  const fortigate = /^fg\d/.test(n.spec?.sku || '');
  if (fortigate) out.push(chk('admin-password', 'management', !!p.identity.passwordSet, 'First login: the admin password is still the factory default (blank) · FortiOS forces a change', 'System → Settings (or the console login prompt)', 'identity'));
  if (n.spec) out.push(managementCheck(n, ctx));
  if (n.spec && n.net.ispContract) {
    const c = n.net.ispContract, w = p.wan, iface = n.ports.find(x => x.name === w.port);
    if (!w.port) out.push(chk('wan-config', 'l3', false, 'WAN interface not configured from circuit sheet ' + c.id, 'Network → WAN / ISP', 'wan'));
    else {
      if (c.physical) { const h = ispHandoff(n, iface, c, ctx); out.push(chk('wan-link', 'link', h.ok, h.reason, 'Rack/power the provider router and patch its LAN1 or SFP1 to ' + w.port, 'wan')); }
      const st = ctx.network.wanStatus(n);
      out.push(chk('wan-l3', 'l3', st.ok || /cable|provider router|Link|has no power|LOS/.test(st.reason), st.reason, 'Network → WAN / ISP: match the circuit sheet, enable the interface, add the default route', 'wan'));
    }
  }
  if (isBound) {
    const cfg = fwConfig(n, ctx);
    for (const v of cfg.vlans.filter(v => v.enabled)) out.push(chk('vlan-' + v.vlanid, 'l2', v.up, v.name + ' (' + v.ip + '/' + v.prefix + ') is down · ' + (v.parents.length ? 'parent port ' + v.parents.join(', ') + ' has no link' : 'no port carries VLAN ' + v.vlanid), 'Carry VLAN ' + v.vlanid + ' on a LAN trunk port with a live cable', 'fg-interfaces'));
    const dflt = routingTable(n, ctx).find(r => r.dst === '0.0.0.0/0' && r.active);
    out.push(chk('default-route', 'l3', !!dflt, 'No active default route · Internet-bound traffic has no path (' + (routingTable(n, ctx).find(r => r.dst === '0.0.0.0/0')?.reason || 'route missing') + ')', 'Network → WAN / ISP: default route via the provider gateway', 'fg-routing'));
    const ha = haStatus(n, ctx);
    if (ha.mode === 'a-p') { out.push(chk('ha-heartbeat', 'l2', ha.heartbeat, 'HA heartbeat down · no cable between the two FortiGate HA ports', 'Patch ha ↔ ha between both FortiGates', 'fg-ha')); out.push(chk('ha-match', 'service', ha.modelMatch && ha.fwMatch, 'HA cluster cannot form: ' + (!ha.modelMatch ? 'models differ' : 'firmware differs (' + ha.members.map(m => m.firmware.split(',')[0]).join(' vs ') + ')'), 'Use two identical FortiGate models on the same firmware', 'fg-ha')); }
    const members = wanMembers(n, ctx);
    if (members.length > 1) out.push(warn('sdwan', 'l3', members.every(m => m.ok), 'SD-WAN member ' + members.filter(m => !m.ok).map(m => m.seq + ' (' + m.port + ') ' + m.reason).join(', ') + ' failed its health check · traffic moved to the surviving member', 'Restore the failed WAN member', 'fg-sdwan'));
    out.push(chk('dns-service', 'service', cfg.dns.service, 'FortiGate DNS service is disabled on its interfaces · clients using a gateway as DNS get no answer', 'Network → DNS: enable the DNS service', 'fg-dns'));
    out.push(chk('dns-forward', 'service', !cfg.dns.service || cfg.dns.mode !== 'forward-only' || cfg.dns.forward, 'DNS is forward-only but forwarding to the ISP resolver is off · public names fail', 'Network → DNS: forward to the ISP resolver (or recursive mode)', 'fg-dns'));
    for (const [id, d] of Object.entries(cfg.dhcp)) if (d?.enabled && s.vlans[id]) { const used = dhcpLeases(n, ctx).filter(l => l.vlan === +id), res = (office.dhcpReservations?.(d) || []).filter(r => +r.ip.split('.')[3] >= d.start && +r.ip.split('.')[3] <= d.end).length, size = Math.max(0, d.end - d.start + 1 - res); out.push(chk('dhcp-' + id, 'service', used.every(l => l.ok), 'DHCP scope VLAN ' + id + ' exhausted: ' + used.length + ' client(s), ' + size + ' free address(es) in .' + d.start + '–.' + d.end + (res ? ' (' + res + ' reserved)' : '') + ' · clients without a lease self-assign 169.254.x.x', 'Network → Interfaces & VLANs: widen the DHCP range', 'fg-interfaces')); }
    const lanOut = cfg.policies.filter(x => x.enabled && x.dstintf === 'wan' && x.srcintf !== 'wan');
    const shadow = lanOut.find(x => x.action === 'deny' && cfg.policies.some(y => y.enabled && y.seq > x.seq && y.action === 'accept' && y.dstintf === 'wan' && (y.srcintf === x.srcintf || x.srcintf === 'any') && x.service === 'any' && x.srcaddr === 'any'));
    out.push(chk('policy-order', 'application', !shadow, shadow ? 'Policy ' + shadow.id + ' (deny ' + shadow.srcintf + ' → wan) sits above an accept policy and matches first · the accept is never used' : '', 'Policy & Objects: move the accept policy above the deny', 'fg-policy'));
    const noNat = lanOut.find(x => x.action === 'accept' && !x.nat);
    out.push(chk('policy-nat', 'application', !noNat, noNat ? 'Policy ' + noNat.id + ' accepts ' + noNat.srcintf + ' → wan without source NAT · private addresses cannot return from the Internet' : '', 'Enable NAT on the LAN → WAN policy', 'fg-policy'));
    for (const v of cfg.vips.filter(v => v.enabled)) { const target = Object.values(s.services).find(t => t.ip === v.internal), has = cfg.policies.some(x => x.enabled && x.srcintf === 'wan' && x.action === 'accept' && (x.dstintf === String(target?.vlan) || x.dstintf === 'any' || x.dstintf === s.vlans[target?.vlan]?.zone)); out.push(chk('vip-' + v.id, 'application', has, 'VIP ' + v.id + ' (' + v.external + ':' + v.externalPort + ' → ' + v.internal + ':' + v.internalPort + ') has no wan → ' + (target ? 'VLAN ' + target.vlan : 'server') + ' accept policy · inbound sessions hit the implicit deny', 'Policy & Objects: add a wan → server VLAN accept policy for the VIP', 'fg-policy')); }
  }
  return ordered(out);
}
export function leds(n, ctx) {
  const c = checks(n, ctx), base = baseLeds(n, ctx, c), ha = haStatus(n, ctx), boot = bootState(n);
  base.front.push(led('HA', ha.mode === 'standalone' ? 'off' : 'green', ha.mode === 'standalone' ? 'solid' : ha.primary === n.id ? 'solid' : 'slow'));
  base.front.push(led('ALARM', boot.phase === 'running' && firstFailure(c) && firstFailure(c).severity !== 'warning' ? 'amber' : 'off'));
  return base;
}

function fullConfiguration(n, ctx) {
  const cfg = fwConfig(n, ctx), p = configuredProduct(n), w = p.wan, lines = ['#config-version=FG200F-7.4.3-FW-build2573-240208:opmode=0:vdom=0', 'config system global', '    set hostname "' + (n.net.hostname || n.id) + '"', '    set timezone "UTC"', 'end', 'config system interface'];
  lines.push('    edit "mgmt"', '        set ip ' + (n.net.ip === '0.0.0.0' ? '192.168.1.99 255.255.255.0' : n.net.ip + '/' + n.net.prefix), '        set allowaccess ping https ssh', '    next');
  if (w.port) lines.push('    edit "' + w.port + '"', '        set mode ' + (w.mode === 'DHCP' ? 'dhcp' : w.mode === 'PPPoE' ? 'pppoe' : 'static'), ...(w.mode === 'Static' || !w.mode ? ['        set ip ' + w.ip + '/' + w.prefix] : []), '        set role wan', '        set status ' + (w.enabled ? 'up' : 'down'), '    next');
  for (const v of cfg.vlans.filter(v => v.vlanid)) lines.push('    edit "' + v.name + '"', '        set vdom "root"', '        set ip ' + v.ip + '/' + v.prefix, '        set allowaccess ping', '        set role lan', '        set interface "' + (v.parents[0] || 'port1') + '"', '        set vlanid ' + v.vlanid, ...(v.enabled ? [] : ['        set status down']), '    next');
  lines.push('end');
  if (cfg.bound) {
    lines.push('config system dhcp server'); for (const [id, d] of Object.entries(cfg.dhcp)) if (d) lines.push('    edit ' + id, '        set status ' + (d.enabled ? 'enable' : 'disable'), '        set default-gateway ' + d.gateway, '        set dns-server1 ' + d.dns, '        set interface "VLAN' + id + '"', '        config ip-range', '            edit 1', '                set start-ip ' + String(cfg.vlans.find(v => v.vlanid === +id)?.ip || '0.0.0.0').split('.').slice(0, 3).join('.') + '.' + d.start, '                set end-ip ' + String(cfg.vlans.find(v => v.vlanid === +id)?.ip || '0.0.0.0').split('.').slice(0, 3).join('.') + '.' + d.end, '            next', '        end', ...((d.reservations || []).length ? ['        config reserved-address', ...d.reservations.flatMap((r, i) => ['            edit ' + (i + 1), '                set ip ' + r.ip, '                set mac ' + r.mac, '            next']), '        end'] : []), '    next'); lines.push('end');
    lines.push('config system dns-server'); for (const v of cfg.vlans.filter(v => v.vlanid)) lines.push('    edit "' + v.name + '"', '        set mode ' + (cfg.dns.service ? cfg.dns.mode : 'disabled'), '    next'); lines.push('end');
    lines.push('config system dns-database', '    edit "company.test"', '        set domain "company.test"', '        config dns-entry'); cfg.dns.records.forEach((r, i) => lines.push('            edit ' + (i + 1), '                set hostname "' + r.id.replace(/\.company\.test$/, '') + '"', '                set ip ' + r.ip, ...(r.enabled ? [] : ['                set status disable']), '            next')); lines.push('        end', '    next', 'end');
    lines.push('config firewall vip'); for (const v of cfg.vips) lines.push('    edit "' + v.id + '"', '        set extip ' + v.external, '        set mappedip "' + v.internal + '"', '        set extintf "' + (w.port || 'wan') + '"', '        set portforward enable', '        set extport ' + v.externalPort, '        set mappedport ' + v.internalPort, '    next'); lines.push('end');
  }
  lines.push('config firewall policy'); for (const x of cfg.policies) lines.push('    edit ' + (cfg.bound ? '"' + x.id + '"' : x.id), '        set name "' + x.name + '"', '        set srcintf "' + (/^\d+$/.test(String(x.srcintf)) ? 'VLAN' + x.srcintf : x.srcintf) + '"', '        set dstintf "' + (/^\d+$/.test(String(x.dstintf)) ? 'VLAN' + x.dstintf : x.dstintf === 'wan' && w.port ? w.port : x.dstintf) + '"', '        set action ' + x.action, '        set srcaddr "' + (x.srcaddr === 'any' ? 'all' : x.srcaddr) + '"', '        set dstaddr "' + (x.dstaddr === 'any' ? 'all' : x.dstaddr) + '"', '        set schedule "' + x.schedule + '"', '        set service "' + (x.service === 'any' ? 'ALL' : x.service) + '"', ...(x.nat ? ['        set nat enable'] : []), ...(x.enabled ? [] : ['        set status disable']), '    next'); lines.push('end');
  lines.push('config router static'); routingTable(n, ctx).filter(r => r.type !== 'C').forEach((r, i) => lines.push('    edit ' + (i + 1), '        set dst ' + r.dst, ...(r.gateway ? ['        set gateway ' + r.gateway] : []), '        set device "' + r.dev + '"', ...(r.type === 'B' ? ['        set blackhole enable'] : []), '    next')); lines.push('end');
  return lines.join('\n');
}
function ribText(n, ctx) {
  const rows = routingTable(n, ctx);
  return ['Codes: K - kernel, C - connected, S - static, R - RIP, B - BGP, O - OSPF,', '       * - candidate default', '', 'Routing table for VRF=0', ...rows.filter(r => r.active).map(r => r.type === 'C' ? 'C       ' + r.dst + ' is directly connected, ' + r.dev : (r.dst === '0.0.0.0/0' ? 'S*      ' : 'S       ') + r.dst + ' [' + r.distance + '/0] ' + (r.type === 'B' ? 'is a blackhole route' : 'via ' + r.gateway + ', ' + r.dev + ', [1/0]')), ...(rows.some(r => !r.active) ? ['', 'Inactive (not in the RIB):', ...rows.filter(r => !r.active).map(r => '  ' + r.type + ' ' + r.dst + ' dev ' + r.dev + ' · ' + r.reason)] : [])].join('\n');
}
export function cli(n, cmd, session, ctx) {
  const text = cmd.trim(), lower = text.toLowerCase().replace(/\s+/g, ' '), p = configuredProduct(n), cfg = () => fwConfig(n, ctx);
  // First console login on a factory FortiGate forces the admin password change.
  if (/^fg\d/.test(n.spec?.sku || '') && !p.identity.passwordSet && session?.mode === 'SERIAL CONSOLE' && !session.fgPasswordOffered) { session.fgPasswordOffered = true; return (n.net.hostname || 'FortiGate-' + (n.spec.sku || '').slice(2).toUpperCase()) + ' login: admin\nPassword:\nYou are forced to change your password. Please input a new password.\nUse: execute set-password <new-password> (8+ characters)'; }
  let m;
  if ((m = /^execute set-password (\S+)$/i.exec(text))) { if (m[1].length < 8) return 'New password must be at least 8 characters.\nCommand fail. Return code -1'; return { change: { type: 'product', node: n.id, op: 'identity', value: { name: n.net.hostname || n.id, passwordChanged: true } }, text: 'New Password:\nConfirm Password:\nPassword changed. Welcome !' }; }
  if (lower === 'get system status') { const ha = haStatus(n, ctx), lic = licenseState(n, ctx); return ['Version: FortiGate-' + (n.spec?.sku === 'fg601f' ? '601F' : n.spec?.sku === 'fg200f' ? '200F' : '4401F') + ' ' + (n.net.firmware || FORTIOS), 'Virus-DB: ' + (lic.valid ? '92.01234(2026-09-28 16:24)' : '1.00000(2018-04-09 18:07) · license expired'), 'Serial-Number: FG2HFTB' + mac(n).replace(/:/g, '').slice(-8).toUpperCase(), 'BIOS version: 05000014', 'Log hard disk: Available', 'Hostname: ' + (n.net.hostname || n.id), 'Operation Mode: NAT', 'Current virtual domain: root', 'Max number of virtual domains: 10', 'Virtual domains status: 1 in NAT mode, 0 in TP mode', 'Virtual domain configuration: disable', 'FIPS-CC mode: disable', 'Current HA mode: ' + (ha.mode === 'a-p' ? 'a-p, ' + (ha.primary === n.id ? 'primary' : 'secondary') : 'standalone'), 'Branch point: 2573', 'Release Version Information: GA', 'System time: ' + new Date().toUTCString(), 'Security profiles license: ' + (lic.valid ? 'valid until ' + lic.until : 'EXPIRED · security profiles disabled (routing and policies unaffected)')].join('\n'); }
  if (lower === 'get router info routing-table all' || lower === 'get router info routing-table database') return ribText(n, ctx);
  if ((m = /^get router info routing-table details (\S+)$/i.exec(text))) { const r = routeLookup(n, ctx, m[1]); return r ? 'Routing table for VRF=0\nRouting entry for ' + r.dst + '\n  Known via "' + (r.type === 'C' ? 'connected' : 'static') + '", distance ' + r.distance + ', metric 0, best\n  * ' + (r.gateway ? r.gateway + ', via ' : 'directly connected, ') + r.dev : '% Network not in table'; }
  if (lower === 'show full-configuration' || lower === 'show') return fullConfiguration(n, ctx);
  if (lower === 'get system interface physical') return lanPorts(n).map(x => { const st = portsState(n, ctx).find(y => y.name === (x.alias || x.name)); return '        ==[' + x.name + ']\n                mode: static\n                ip: ' + (x.cfg.ip ? x.cfg.ip + ' ' + x.cfg.prefix : '0.0.0.0 0.0.0.0') + '\n                status: ' + (st.state === 'up' ? 'up' : 'down') + '\n                speed: ' + (st.state === 'up' ? x.speed * 1000 + 'Mbps (Duplex: full)' : 'n/a') + (st.state === 'up' ? '' : '\n                reason: ' + st.reason); }).join('\n');
  if (lower === 'get system interface transceiver' || lower === 'get system interface transceiver all') return portsState(n, ctx).filter(x => x.connector !== 'RJ45' && x.connector !== 'RJ45 console').map(x => 'Interface ' + x.name + ' - ' + (x.optic ? 'SFP/SFP+/SFP28\n  Vendor Name: FORTINET\n  Part No.: ' + x.optic + '\n  Rx power: ' + (x.rx ?? 'n/a') + ' dBm' + (x.code === 'transceiver' ? '\n  Status: unsupported transceiver (port disabled)' : x.code === 'dirty' ? '\n  Status: rx power LOW alarm · link flapping' : '') : 'Transceiver is not detected.')).join('\n\n') || 'No SFP ports on this model.';
  if (lower === 'diagnose sys session list' || lower === 'diagnose sys session list all') { const list = cfg().sessions.slice(0, 20); return list.length ? list.map((x, i) => 'session info: proto=6 proto_state=01 duration=' + Math.max(1, Math.round((Date.now() - x.at) / 1000)) + ' expire=3597 timeout=3600 flags=00000000\n  policy_id=' + x.policy + ' ' + (x.nat ? 'SNAT' : 'no-nat') + '\n  orgin->sink: org pre->post, reply pre->post dev=' + x.ingress + '->' + x.egress + '\n  hook=post dir=org act=' + (x.nat ? 'snat' : 'noop') + ' ' + x.src + ':' + (51000 + i) + '->' + x.dst + ':' + x.port + (x.nat ? '(' + x.natIP + ':' + (62000 + i) + ')' : '')).join('\n\n') + '\ntotal session ' + cfg().sessions.length : 'total session 0'; }
  if ((m = /^diagnose debug flow (?:trace start )?(\S+) (\S+)$/i.exec(text))) { const r = debugFlow(n, ctx, m[1], m[2]); return r.text + '\n' + (r.stages.length ? r.stages.map(x => (x.ok ? '  ✓ ' : '  ✗ ') + x.stage + ' · ' + x.detail).join('\n') : ''); }
  if (lower.startsWith('diagnose debug flow')) return 'Usage (training): diagnose debug flow <workstation-ID|IP> <url>\n  e.g. diagnose debug flow F1-sales-PC https://example.test';
  if (lower === 'get system ha status') { const ha = haStatus(n, ctx); if (ha.mode === 'standalone') return 'HA Health Status: OK\nMode: standalone'; return ['HA Health Status: ' + (ha.heartbeat && ha.modelMatch && ha.fwMatch ? 'OK' : 'ERROR · ' + (!ha.heartbeat ? 'heartbeat link down' : !ha.modelMatch ? 'model mismatch' : 'firmware mismatch')), 'Model: FortiGate-' + (n.spec?.sku || n.model), 'Mode: HA A-P', 'Group Name: ' + ha.group, 'Debug: 0', 'Session Pickup: enable (sessions survive failover)', 'Configuration Status:', ...ha.members.map(x => '    ' + x.id + '(updated 1 seconds ago): ' + (ha.synced && ha.heartbeat ? 'in-sync' : 'out-of-sync')), 'Primary selected using: <' + new Date().toISOString().slice(0, 19) + '> ' + ha.primary + ' is selected as the primary because it has the highest uptime / monitored ports up.', 'Heartbeat interface: ha · ' + (ha.heartbeat ? 'up' : 'down'), ...ha.members.map(x => (x.role === 'primary' ? 'Primary' : 'Secondary') + ': ' + x.id + ', ' + (x.online ? 'online' : 'OFFLINE') + ', ' + x.firmware.split(',')[0])].join('\n'); }
  if (lower === 'diagnose sys sdwan health-check' || lower === 'diagnose sys virtual-wan-link health-check') { const ms = wanMembers(n, ctx); return 'Health Check(ISP_ping):\n' + ms.map(x => 'Seq(' + x.seq + ' ' + x.port + '): state(' + (x.ok ? 'alive' : 'dead') + '), packet-loss(' + (x.ok ? '0.000' : '100.000') + '%)' + (x.ok ? ' latency(' + x.latency.toFixed(3) + '), jitter(0.214), sla_map=0x1' : ' sla_map=0x0') + ' · target ' + x.gateway + (x.ok ? '' : ' · ' + x.reason)).join('\n') + (ms.length > 1 ? '\nActive member: ' + (ms.find(x => x.ok)?.port || 'none') : '\n(single WAN member · order a secondary circuit for SD-WAN failover)'); }
  if (lower === 'execute dhcp lease-list' || lower === 'execute dhcp lease-list all') { const l = dhcpLeases(n, ctx); return l.length ? table(['IP', 'MAC-Address', 'Hostname', 'VCI', 'Expiry'], l.map(x => [x.ip, x.mac, x.host, 'VLAN' + x.vlan, x.ok ? x.expiry : 'no lease (' + x.reason + ')']), [16, 18, 18, 8, 30]) : 'No DHCP leases (no DHCP clients reach this FortiGate).'; }
  if (lower === 'get system dns' || lower === 'show system dns-server') { const d = cfg().dns; return 'primary             : ' + (d.upstream || '0.0.0.0') + '\nmode                : ' + (d.service ? d.mode : 'disabled on interfaces') + '\nforward-to-ISP      : ' + (d.forward ? 'enable' : 'disable'); }
  if (lower === 'show system dns-database') return fullConfiguration(n, ctx).split('\n').filter((l, i, a) => { const s = a.indexOf('config system dns-database'); const e = a.indexOf('end', a.indexOf('        end', s) + 1); return i >= s && i <= e; }).join('\n');
  if (lower === 'show firewall vip') { const v = cfg().vips; return v.length ? v.map(x => 'edit "' + x.id + '"\n    set extip ' + x.external + '\n    set mappedip "' + x.internal + '"\n    set extport ' + x.externalPort + '\n    set mappedport ' + x.internalPort + '\nnext').join('\n') : 'No virtual IPs configured.'; }
  if (lower === 'diagnose firewall iprope show 100004' || lower === 'diagnose firewall policy hit-count' || lower === 'get firewall policy hit-count') return table(['Seq', 'Policy', 'From → To', 'Action', 'Hits', 'Last used'], cfg().policies.map(x => [x.seq, x.id, x.srcintf + ' → ' + x.dstintf, x.action, x.hits, x.lastUsed ? new Date(x.lastUsed).toLocaleTimeString() : '-']), [4, 14, 16, 7, 6, 12]);
  if (lower === 'get system fortiguard-service status' || lower === 'get license') { const lic = licenseState(n, ctx); return 'FortiGuard Security Services: ' + (lic.valid ? 'licensed until ' + lic.until : 'expired') + '\nIPS/AV/Web filter: ' + (lic.valid ? 'enabled' : 'disabled (license)') + '\nFirewall / routing / VPN: not license dependent'; }
  // Office-bound CLI edits go to the office store (one configuration store).
  if (cfg().bound) { const r = boundConfigCLI(n, text, lower, session); if (r !== null) return r; }
  return null;
}
// FortiOS `config …` editing of the office-bound store. Returns text, a { change } request, or null.
function boundConfigCLI(n, text, lower, s) {
  let m;
  if ((m = /^config (firewall policy|router static|system dhcp server|system dns-database|firewall vip)$/i.exec(text))) { s.fos = m[1].toLowerCase(); s.fosDraft = null; s.config = true; return (n.net.hostname || n.id) + ' (' + s.fos.split(' ').pop() + ') #'; }
  if (!s.fos) return null;
  const store = s.fos;
  if ((m = /^edit "?([^"]+)"?$/i.exec(text))) { s.fosDraft = { id: m[1] }; return (n.net.hostname || n.id) + ' (' + m[1] + ') #'; }
  if ((m = /^delete "?([^"]+)"?$/i.exec(text))) return { change: { type: 'fortios', node: n.id, op: 'delete', store, value: { id: m[1] } } };
  if ((m = /^move "?([^"]+)"? (before|after) "?([^"]+)"?$/i.exec(text))) { if (store !== 'firewall policy') return 'Command fail. Return code -61'; return { change: { type: 'fortios', node: n.id, op: 'move', store, value: { id: m[1], where: m[2].toLowerCase(), ref: m[3] } } }; }
  if ((m = /^set (\S+) (.+)$/i.exec(text))) { if (!s.fosDraft) return 'Command fail. Return code -61 (use edit first)'; s.fosDraft[m[1].toLowerCase()] = m[2].replace(/"/g, '').trim(); return ''; }
  if ((m = /^unset (\S+)$/i.exec(text))) { if (s.fosDraft) s.fosDraft[m[1].toLowerCase()] = null; return ''; }
  if (lower === 'next' || lower === 'end') { const draft = s.fosDraft; s.fosDraft = null; if (lower === 'end') { s.fos = null; s.config = false; } return draft ? { change: { type: 'fortios', node: n.id, op: 'edit', store, value: draft } } : ''; }
  if (lower === 'abort') { s.fosDraft = null; s.fos = null; return ''; }
  return null;
}
export function licenseState(n, ctx) { const s = ctx.office?.state, has = !!s?.inventory?.some(i => i.sku === 'security-license' && i.installed); return { valid: has || s?.mode !== 'campaign', until: has || s?.mode !== 'campaign' ? '2027-09-30' : '' }; }

export function gui(n, ctx) {
  const st = state(n, ctx), cfg = st.config, rib = routingTable(n, ctx), ha = st.ha, lic = licenseState(n, ctx), f = firstFailure(checks(n, ctx));
  const pages = {
    'fg-routing': { group: 'Network', title: 'Routing monitor', tables: [{ title: 'Routing table (active and inactive)', heads: ['Type', 'Destination', 'Gateway', 'Interface', 'Distance', 'State'], rows: rib.map(r => [r.type === 'C' ? 'Connected' : r.type === 'B' ? 'Blackhole' : 'Static', r.dst, r.gateway || '—', r.dev, r.distance, r.active ? 'active' : 'inactive · ' + r.reason]) }], notes: ['Longest prefix wins; ties use the lower distance. Routes via a down interface leave the RIB.'] },
    'fg-dhcp-leases': { group: 'Network', title: 'DHCP monitor', tables: [{ title: 'Lease table', heads: ['IP', 'MAC', 'Hostname', 'Interface', 'Expiry'], rows: dhcpLeases(n, ctx).map(x => [x.ip, x.mac, x.host, 'VLAN' + x.vlan, x.ok ? x.expiry : 'no lease · ' + x.reason]) }] },
    'fg-sdwan': { group: 'Network', title: 'SD-WAN', tables: [{ title: 'Members and health check (ping provider gateway)', heads: ['Seq', 'Interface', 'Target', 'State', 'Latency', 'SLA'], rows: st.wan.map(x => [x.seq, x.port, x.gateway, x.ok ? 'alive' : 'dead · ' + x.reason, x.ok ? x.latency + ' ms' : '—', x.ok ? 'pass' : 'fail']) }], notes: [st.wan.length > 1 ? 'Traffic uses the first healthy member; failover happens within one health-check tick.' : 'Only one WAN member. Buy the secondary circuit (Office → Procurement) to enable SD-WAN failover.'] },
    'fg-sessions': { group: 'Log & Report', title: 'Session table', tables: [{ title: 'Active sessions (most recent first)', heads: ['Source', 'Destination', 'Policy', 'NAT', 'Ingress → egress'], rows: cfg.sessions.slice(0, 30).map(x => [x.src, x.dst + ':' + x.port, x.policy, x.nat ? x.natIP : '—', x.ingress + ' → ' + x.egress]) }] },
    'fg-ha': { group: 'System', title: 'HA', tables: [{ title: 'Cluster members', heads: ['Member', 'Role', 'State', 'Firmware'], rows: ha.members.map(x => [x.id, x.role, x.online ? 'online' : 'offline', x.firmware.split(',')[0]]) }], notes: [ha.mode === 'standalone' ? 'Standalone. Enable HA (Office → System / High availability) with a second identical FortiGate and cable ha ↔ ha.' : 'A-P cluster · heartbeat ' + (ha.heartbeat ? 'up' : 'DOWN') + ' · models ' + (ha.modelMatch ? 'match' : 'DIFFER') + ' · firmware ' + (ha.fwMatch ? 'match' : 'DIFFERS') + ' · session pickup enabled'] },
    'fg-fortiguard': { group: 'System', title: 'FortiGuard / licenses', tables: [{ title: 'Entitlements', heads: ['Service', 'Status'], rows: [['Firmware', n.net.firmware || FORTIOS], ['FortiCare support', 'Registered'], ['IPS / AV / Web filtering', lic.valid ? 'Licensed until ' + lic.until : 'Expired · security profiles view disabled'], ['Routing, NAT, VPN, policies', 'Not license dependent']] }] },
  };
  return { summary: [['Firmware', (n.net.firmware || FORTIOS).split(',')[0], ''], ['WAN', st.wan.map(x => x.port + ' ' + (x.ok ? 'up' : 'down')).join(' · ') || '—', st.wan.every(x => x.ok) ? 'ok' : 'crit'], ['HA', ha.mode === 'standalone' ? 'standalone' : ha.primary + ' primary', ''], ['Sessions', String(cfg.sessions.length), ''], ['Health', st.health, st.health === 'ok' ? 'ok' : st.health === 'warning' ? 'warn' : 'crit']], blocking: f, pages };
}

export const faults = [
  { id: 'dns-forwarder-off', label: 'DNS forwarder disabled', check: 'dns-forward', family: 'firewall', repair: 'Network → DNS: forward to the ISP resolver' },
  { id: 'policy-order', label: 'Deny policy moved above the Internet policy', check: 'policy-order', family: 'firewall', repair: 'Move the accept policy above the deny policy' },
  { id: 'missing-nat', label: 'NAT removed from the Internet policy', check: 'policy-nat', family: 'firewall', repair: 'Enable NAT on the LAN → WAN policy' },
  { id: 'dhcp-exhausted', label: 'DHCP scope shrunk to one address', check: 'dhcp-10', family: 'firewall', repair: 'Widen the DHCP range for VLAN 10' },
  { id: 'vip-no-policy', label: 'VIP published without a policy', check: 'vip-web-publish', family: 'firewall', repair: 'Add a wan → VLAN 50 accept policy' },
];
// Commands this module answers (used by ? and Tab in the laptop terminal).
export const commands = ['get system status', 'get router info routing-table all', 'get router info routing-table database', 'show full-configuration', 'get system interface physical', 'get system interface transceiver', 'get system interface transceiver all', 'diagnose sys session list', 'diagnose sys session list all', 'get system ha status', 'diagnose sys sdwan health-check', 'diagnose sys virtual-wan-link health-check', 'execute dhcp lease-list', 'execute dhcp lease-list all', 'get system dns', 'show system dns-server', 'show system dns-database', 'show firewall vip', 'diagnose firewall iprope show 100004', 'diagnose firewall policy hit-count', 'get firewall policy hit-count', 'get system fortiguard-service status', 'get license', 'diagnose debug flow', 'diagnose debug flow <src-ip> <dst-ip>', 'get router info routing-table details <ip>', 'config firewall policy', 'config router static', 'config system dhcp server', 'config system dns-database', 'config firewall vip', 'edit <id>', 'set <field> <value>', 'unset <field>', 'move <id> before <id>', 'delete <id>', 'execute set-password <new>'];
export default { family: 'firewall', match: n => n.type === 'firewall', state, checks, leds, cli, gui, faults, commands };
