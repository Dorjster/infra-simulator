// FortiOS-structured GUI for a FortiGate. When the FortiGate is the office gateway, the Network and
// Policy pages edit the live company network model (the same one the office path test uses), so a
// change here immediately changes what employees can reach. Sign-in uses an enterprise admin account.
import { esc, pill, okPill, input, select, check, button, grid, card, cards, kv, table, checklist, note } from './gui-kit.js';
import { configuredProduct } from './product-profiles.js';
import { ispHandoff } from './product-config.js';
const diag = {};

const lanPorts = n => n.ports.filter(p => !p.service && p.medium === 'Ethernet' && p.name !== 'MGMT UPLINK' && p.alias !== 'mgmt');
const peerOf = (n, p) => p.link && !p.link.unplugged ? (p.link.a === n.id ? [p.link.b, p.link.pb] : [p.link.a, p.link.pa]) : null;
export const officeBound = (n, office) => { const s = office?.state; return !!s && (s.bindings.firewall === n.id || (s.ha?.enabled && s.ha.peer === n.id)); };

export function fortigateNav(n, bridge) {
  const bound = officeBound(n, bridge?.office);
  return [
    ['Dashboard', [['overview', 'Status']]],
    ['Network', bound ? [['fg-interfaces', 'Interfaces & VLANs'], ['wan', 'WAN / ISP'], ['fg-dns', 'DNS'], ['fg-routes', 'Static routes']] : [['wan', 'WAN / ISP'], ['fw-interfaces', 'Interfaces'], ['fw-routes', 'Static routes']]],
    ['Policy & Objects', bound ? [['fg-policy', 'Firewall policy'], ['fg-vip', 'Virtual IPs']] : [['fw-policies', 'Firewall policy'], ['fw-addresses', 'Addresses']]],
    ['System', [['identity', 'Settings'], ['management', 'Management interface']]],
    ['Log & Report', [['fg-logs', 'Forward traffic'], ['fg-diag', 'Diagnostics'], ['activity', 'Events']]],
  ];
}

function circuitSheet(n) {
  const c = n.net.ispContract;
  if (!c) return note('No ISP circuit. Order one in <b>Procurement → ISP services</b>; the provider ships a handoff router with it.', 'warn');
  return kv([['Circuit', esc(c.id) + ' · ' + esc(c.planName || 'Static /30')], ['Addressing', esc(c.mode || 'Static')], ['WAN IP', esc(c.ip + '/' + (c.prefix || 30))], ['Gateway', esc(c.gateway)], ['Provider DNS', esc(c.dns || '1.1.1.1')],
    ...(c.block ? [['Public block', esc(c.block.network) + '<br><small>usable for VIPs: ' + esc(c.block.usable.join(', ')) + '</small>']] : []),
    ...(c.pppoe ? [['PPPoE login', esc(c.pppoe.user) + '<br><small>password ' + esc(c.pppoe.password) + '</small>']] : []),
    ['Bandwidth', esc((c.bandwidth || 1000) + ' Mbps')]]);
}
function handoffState(n, nodes, byId) {
  const c = n.net.ispContract, w = configuredProduct(n).wan;
  if (!c) return { ok: false, reason: 'No circuit ordered' };
  if (!c.physical) return { ok: true, reason: 'Logical handoff (legacy circuit)' };
  const port = n.ports.find(p => p.name === w.port) || n.ports.find(p => { const peer = peerOf(n, p); return peer && byId[peer[0]]?.type === 'isp'; });
  return port ? ispHandoff(n, port, c, { nodes, byId }) : { ok: false, reason: 'Patch the provider router LAN1 to a free WAN port' };
}

export function fortigateDashboard(n, { network, nodes, byId, bridge }) {
  const p = configuredProduct(n), office = bridge?.office, s = office?.state, bound = officeBound(n, office), legacy = !n.spec && bound && office.firewallPing;
  // Pre-installed Free Play firewalls use the facility provider edge instead of an ordered circuit.
  const edge = legacy ? office.firewallPing('example.test') : null, wan = legacy ? { ok: edge.ok, reason: 'Provider edge (pre-installed) · ' + edge.reason } : network.wanStatus(n), h = legacy ? { ok: edge.ok, reason: 'Pre-installed provider edge' } : handoffState(n, nodes, byId);
  const vlans = s ? Object.values(s.vlans).filter(v => v.enabled) : [], dhcp = s ? Object.values(s.dhcp).filter(d => d.enabled) : [];
  const nat = s ? Object.values(s.policies).some(x => x.enabled && x.dst === 'wan' && x.action === 'accept' && x.nat) : false;
  const obj = bound ? office.objectives()[0] : null;
  const steps = [
    { label: 'Administrator and hostname', ok: !!p.identity.passwordSet, detail: 'System → Settings' },
    { label: 'Management interface address', ok: n.net.ip !== '0.0.0.0', detail: 'System → Management interface' },
    { label: 'ISP circuit ordered', ok: legacy || !!n.net.ispContract, detail: legacy ? 'Pre-installed provider edge' : 'Procurement → ISP services' },
    { label: 'Provider router racked, powered and patched', ok: h.ok, detail: h.reason },
    { label: 'WAN configured from the circuit sheet', ok: wan.ok, detail: wan.reason },
    { label: 'Assigned as the office gateway', ok: bound, detail: 'Office → Infrastructure / Patch panel' },
    { label: 'LAN VLAN interface with DHCP', ok: vlans.length > 0 && dhcp.length > 0, detail: vlans.length + ' VLAN interface(s), ' + dhcp.length + ' DHCP scope(s)' },
    { label: 'LAN → WAN policy with source NAT', ok: nat, detail: 'Policy & Objects → Firewall policy' },
    { label: 'Employee reaches the Internet', ok: !!obj?.ok, detail: obj ? obj.detail : 'Available once assigned as office gateway' },
  ];
  const alerts = bound ? office.alerts().filter(a => ['wan', 'gateway'].includes(a.id) || a.kind === 'network').slice(0, 4) : [];
  return cards(
    card('Setup progress', checklist(steps), { wide: true }),
    card('System', kv([['Model', esc(n.model)], ['Hostname', esc(n.net.hostname || n.id)], ['Firmware', 'FortiOS 7.4 (training subset)'], ['Management', esc(n.net.ip + '/' + n.net.prefix + ' · VLAN ' + n.net.vlan)], ['State', okPill(!!p.commissioned, 'Commissioned', 'Initial setup')]])),
    card('WAN', `<p>${okPill(wan.ok, 'Up', 'Down')} ${esc(wan.reason)}</p>` + (legacy ? '' : circuitSheet(n)), { tone: wan.ok ? 'ok' : 'crit' }),
    card('LAN', bound ? table(['VLAN', 'Gateway', 'DHCP'], vlans.map(v => [v.id + ' ' + (v.name || ''), v.ip + '/' + v.prefix, s.dhcp[v.id]?.enabled ? '.' + s.dhcp[v.id].start + '–.' + s.dhcp[v.id].end : 'off']), 'No VLAN interfaces') : note('Not the office gateway yet. Assign it in Office → Infrastructure to manage company VLANs from here.')),
    card('Alerts', alerts.length ? alerts.map(a => `<p>${pill('crit', a.id)} ${esc(a.message)}</p>`).join('') : `<p>${pill('ok', 'None')}</p>`),
  ) + `<pre id="pg-live-status" hidden></pre>` + button('commission', 'Validate initial configuration', 'primary');
}

function loginCard(bridge) {
  return card('Administrator sign-in', `<p>FortiGate administration uses the company directory. Sign in with an enterprise administrator account (training: itadmin).</p>${grid(input('fg-user', 'Username', 'itadmin'), input('fg-pass', 'Password', '', 'password'))}${button('fg-login', 'Log in', 'primary')}`, { wide: true });
}

export function fortigateContent(n, page, ctx) {
  const { bridge, network, nodes, byId } = ctx, office = bridge?.office, s = office?.state, bound = officeBound(n, office);
  if (!page.startsWith('fg-') && page !== 'wan') return null;
  // Monitor pages generated by the FortiGate device logic (routing, DHCP, SD-WAN, sessions, HA, FortiGuard).
  if (['fg-routing', 'fg-dhcp-leases', 'fg-sdwan', 'fg-sessions', 'fg-ha', 'fg-fortiguard'].includes(page)) return bound && !bridge?.isAdmin?.() ? loginCard(bridge) : null;
  if (bound && page !== 'fg-logs' && !bridge.isAdmin()) return loginCard(bridge);
  if (page === 'wan') {
    const c = n.net.ispContract, w = configuredProduct(n).wan, wan = network.wanStatus(n), h = handoffState(n, nodes, byId);
    const ports = lanPorts(n), cpePort = ports.find(p => { const peer = peerOf(n, p); return peer && byId[peer[0]]?.type === 'isp'; });
    const portItems = ports.filter(p => !p.link || p === cpePort || p.name === w.port).map(p => [p.name, p.name + (p === cpePort ? ' · ISP router ' + peerOf(n, p)[1].name : p.link ? ' · cabled' : ' · free')]);
    const mode = w.mode || c?.mode || 'Static';
    return cards(card('Circuit sheet', circuitSheet(n)), card('Status', `<p>${okPill(wan.ok, 'WAN up', 'WAN down')}</p><p>${esc(wan.reason)}</p><p>${okPill(h.ok, 'Handoff up', 'Handoff')} ${esc(h.reason)}</p>`, { tone: wan.ok ? 'ok' : 'crit' }))
      + `<h3>WAN interface</h3>` + grid(select('port', 'Interface (patched to the ISP router)', portItems.length ? portItems : [['', 'No free port']], w.port || cpePort?.name),
        select('wanMode', 'Addressing mode', c?.physical ? [c.mode] : ['Static', 'DHCP'], mode, 'Must match the circuit sheet'),
        input('wanIP', 'IP address', w.ip || c?.ip || ''), input('wanPrefix', 'Prefix', w.prefix || c?.prefix || 30, 'number'), input('wanGateway', 'ISP gateway', w.gateway || c?.gateway || ''), input('wanDNS', 'DNS server', w.dns || c?.dns || '1.1.1.1'),
        ...(c?.mode === 'PPPoE' ? [input('pppoeUser', 'PPPoE username', w.pppoeUser || ''), input('pppoePassword', 'PPPoE password', '', 'password')] : []),
        check('wanEnabled', 'Interface enabled', w.enabled ?? true), check('defaultRoute', 'Default route 0.0.0.0/0 via ISP gateway', w.defaultRoute ?? true),
        ...(bound ? [check('dnsForward', 'Forward DNS to the ISP resolver', s.wan.dnsForward !== false)] : []))
      + button('wan-save', 'Apply WAN', 'primary') + `<pre id="pg-wan-status" hidden></pre>`
      + (bound ? '' : `<h3>Quick LAN → Internet check (standalone)</h3>${grid(select('lanTest', 'LAN interface', ports.map(p => p.name)), input('lanIP', 'LAN IPv4', '192.168.10.1'), input('lanPrefix', 'Prefix', 24, 'number'))}${button('lan-save', 'Apply LAN address')}${button('internet-test', 'Test LAN → Internet')}`);
  }
  if (!bound) return note('Assign this FortiGate as the office gateway in <b>Office → Infrastructure / Patch panel</b> to manage company VLANs, DHCP, DNS and policies here.', 'warn');
  if (page === 'fg-interfaces') {
    const ports = lanPorts(n), vlanRows = Object.values(s.vlans).sort((a, b) => a.id - b.id);
    const parentOf = v => ports.filter(p => p.cfg.mode === 'trunk' ? p.cfg.allowed.includes(+v.id) : p.cfg.access === +v.id).map(p => p.name).join(', ') || '—';
    return `<h3>Physical interfaces</h3>` + table(['Port', 'Role', 'Address', 'VLANs', 'Admin', 'Link'], ports.map(p => { const peer = peerOf(n, p), role = p.name === configuredProduct(n).wan.port ? 'WAN' : p.cfg.mode === 'trunk' && p.cfg.allowed.some(v => v > 1) ? 'LAN trunk' : p.cfg.role || 'LAN';
      return [p.name, role, p.cfg.ip ? p.cfg.ip + '/' + p.cfg.prefix : '—', p.cfg.mode === 'trunk' ? p.cfg.allowed.join(',') : 'access ' + p.cfg.access, { html: okPill(p.cfg.admin !== false, 'up', 'down') }, { html: peer ? (p.link.disabled ? pill('crit', 'down') : pill('ok', 'link')) + ' ' + esc(peer[0] + ' / ' + peer[1].name) : pill('off', 'no cable') }]; }))
      + grid(select('fg-port', 'Port', ports.map(p => p.name)), select('fg-port-admin', 'Administrative status', [['up', 'Up'], ['down', 'Down']]))
      + button('fg-port-save', 'Apply port status')
      + `<h3>VLAN interfaces (gateways)</h3>` + table(['VLAN', 'Name', 'Gateway IP', 'Zone', 'Carried on', 'DHCP server', 'State'], vlanRows.map(v => [v.id, v.name || '', v.ip + '/' + v.prefix, v.zone || '', parentOf(v), s.dhcp[v.id]?.enabled ? '.' + s.dhcp[v.id].start + '–.' + s.dhcp[v.id].end + ' · DNS ' + s.dhcp[v.id].dns : 'off', { html: okPill(v.enabled, 'enabled', 'disabled') }]), 'No VLAN interfaces yet')
      + `<h3>Create or edit a VLAN interface</h3>` + grid(input('fg-vid', 'VLAN ID', 10, 'number'), input('fg-vname', 'Name', 'SALES'), input('fg-vip', 'Gateway IP', '10.10.10.1'), input('fg-vprefix', 'Prefix', 24, 'number'), select('fg-vzone', 'Zone', ['staff', 'servers', 'management', 'guest', 'dmz']), select('fg-vparent', 'Parent (LAN trunk) port', ports.filter(p => p.name !== configuredProduct(n).wan.port).map(p => p.name)), check('fg-venabled', 'Enabled', true))
      + grid(check('fg-dhcp', 'DHCP server on this VLAN', true), input('fg-dstart', 'First host', 100, 'number'), input('fg-dend', 'Last host', 199, 'number'), input('fg-ddns', 'DNS given to clients (blank = gateway)', ''))
      + button('fg-vlan-save', 'Save VLAN interface', 'primary') + button('fg-vlan-delete', 'Delete this VLAN', 'danger')
      + note('The switch port at the other end of the parent port must carry the same VLAN (trunk allowed list).');
  }
  if (page === 'fg-dns') {
    return cards(card('DNS service', grid(check('fg-dnsService', 'DNS service on VLAN interfaces', s.dnsEnabled !== false && s.wan.dnsService !== false), check('fg-dnsForward', 'Forward unknown names to upstream', s.wan.dnsForward !== false), input('fg-dnsUp', 'Upstream (ISP) DNS', s.wan.dns || n.net.ispContract?.dns || '')) + button('fg-dns-save', 'Apply DNS settings', 'primary') + note('Clients use a VLAN gateway address as their DNS server. Public resolvers cannot answer the internal company.test zone.'), { wide: true }))
      + `<h3>DNS database</h3>` + table(['Name', 'Address', 'State'], Object.values(s.dns).map(d => [d.id, d.ip, { html: okPill(d.enabled, 'enabled', 'disabled') }]))
      + grid(input('fg-dnsName', 'Host name', 'portal.company.test'), input('fg-dnsIP', 'IPv4 address', '10.10.50.10'), select('fg-dnsDel', 'Delete record', ['', ...Object.keys(s.dns)]))
      + button('fg-dns-add', 'Add / update record', 'primary') + button('fg-dns-remove', 'Delete selected', 'danger');
  }
  if (page === 'fg-routes') {
    const dflt = (n.net.enterprise?.routes || []).find(r => r.dst === '0.0.0.0/0');
    return `<p>${okPill(!!dflt, 'Default route', 'No default route')} ${dflt ? esc('0.0.0.0/0 via ' + dflt.gateway + ' dev ' + dflt.device) : 'Set it on WAN / ISP.'}</p>` + `<h3>Connected</h3>` + table(['Destination', 'Interface'], Object.values(s.vlans).filter(v => v.enabled).map(v => [v.ip.split('.').slice(0, 3).join('.') + '.0/' + v.prefix, 'VLAN ' + v.id]))
      + `<h3>Static routes</h3>` + table(['Name', 'Destination', 'Gateway', 'Interface', 'State'], Object.values(s.routes).map(r => [r.id, r.destination, r.gateway, r.interface, { html: okPill(r.enabled, 'enabled', 'disabled') }]))
      + grid(input('fg-rid', 'Name', 'branch'), input('fg-rdst', 'Destination CIDR', '10.20.0.0/24'), input('fg-rgw', 'Next hop', '203.0.113.10'), input('fg-rif', 'Interface (VLAN id, wan or vpn)', 'vpn'), check('fg-ren', 'Enabled', true)) + button('fg-route-save', 'Save route', 'primary');
  }
  if (page === 'fg-policy') {
    const list = Object.values(s.policies), zones = [...new Set(Object.values(s.vlans).map(v => v.zone).filter(Boolean))], ends = [['any', 'any'], ...Object.values(s.vlans).map(v => [String(v.id), 'VLAN ' + v.id + ' ' + (v.name || '')]), ...zones.map(z => [z, 'zone ' + z]), ['wan', 'wan (Internet)'], ['vpn', 'vpn']];
    return `<p>Policies are evaluated top-down; the first match wins. Unmatched traffic hits the implicit deny.</p>` + table(['#', 'ID', 'From → To', 'Source → Destination', 'Service', 'Action', 'NAT', 'State'], list.map((x, i) => [i + 1, x.id, x.src + ' → ' + x.dst, (x.source || 'any') + ' → ' + (x.destination || 'any'), x.service, { html: pill(x.action === 'accept' ? 'ok' : 'crit', x.action.toUpperCase()) }, x.nat ? 'SNAT' : '—', { html: okPill(x.enabled, 'on', 'off') }]))
      + `<p>${pill('crit', 'DENY')} implicit deny · all</p>`
      + grid(select('fg-pmove', 'Policy', list.map(x => x.id))) + `<div class="gv-row">${button('fg-pup', 'Move up')}${button('fg-pdown', 'Move down')}${button('fg-ptoggle', 'Enable / disable')}${button('fg-pdelete', 'Delete', 'danger')}</div>`
      + `<h3>Create or edit a policy</h3>` + grid(input('fg-pid', 'Policy ID', 'lan-out'), select('fg-psrc', 'Incoming', ends, '10'), select('fg-pdst', 'Outgoing', ends, 'wan'), input('fg-psource', 'Source CIDR', 'any'), input('fg-pdest', 'Destination CIDR', 'any'), select('fg-psvc', 'Service', ['any', 'HTTP', 'HTTPS', 'DNS', 'SMB', 'NFS', 'ICMP', 'SSH', 'S3']), select('fg-pact', 'Action', ['accept', 'deny']), check('fg-pnat', 'Source NAT (to WAN IP)', true), check('fg-pen', 'Enabled', true))
      + button('fg-policy-save', 'Save policy', 'primary');
  }
  if (page === 'fg-vip') {
    const c = n.net.ispContract, pubs = [c?.ip, ...(c?.block?.usable || [])].filter(Boolean);
    return `<p>Virtual IPs publish an internal server on a public address (destination NAT). Also add a wan → server-VLAN accept policy.</p>` + table(['Name', 'External', 'Internal', 'State'], Object.values(s.vips).map(v => [v.id, v.external + ':' + v.externalPort, v.internal + ':' + v.internalPort, { html: okPill(v.enabled, 'on', 'off') }]))
      + grid(input('fg-vipid', 'Name', 'web-publish'), select('fg-vipext', 'External IP', pubs.length ? pubs : [['', 'No public IP (order a circuit)']]), input('fg-vipextp', 'External port', 443, 'number'), input('fg-vipint', 'Internal IP', '10.10.50.10'), input('fg-vipintp', 'Internal port', 443, 'number'), check('fg-vipen', 'Enabled', true)) + button('fg-vip-save', 'Save virtual IP', 'primary');
  }
  if (page === 'fg-logs') {
    const logs = (n.net.enterprise?.logs || []).slice(0, 40);
    return table(['Time', 'Source', 'Event'], logs.map(l => [new Date(l.at).toLocaleTimeString(), l.source, l.message]), 'No traffic logged yet');
  }
  if (page === 'fg-diag') {
    return `<p>Run a real path test from an employee workstation through this FortiGate. Each stage shows pass or the exact failing dependency.</p>` + grid(select('fg-dpc', 'Source workstation', Object.keys(s.pcs)), input('fg-durl', 'Destination (URL, name or IP)', 'https://example.test')) + button('fg-dtest', 'Run test', 'primary') + `<div id="pg-fg-result">${diag[n.id] || ''}</div>`;
  }
  return null;
}

export function bindFortigate(n, page, { bridge, submit, value, checked, done, $ }) {
  const s = () => bridge.office.state, send = a => bridge.send(a), on = (id, fn) => { const e = $(id); if (e) e.onclick = async () => { try { done(await fn()); } catch (err) { done(err.message); } }; };
  const cfg = (pageName, v) => send({ type: 'configure', page: pageName, value: v });
  const msg = r => r?.message || r?.reason || (typeof r === 'string' ? r : 'Done');
  on('fg-login', async () => { const r = await send({ type: 'login', user: value('fg-user'), password: value('fg-pass') }); if (r?.user) bridge.markAdmin(r.user); return r?.user ? 'Signed in as ' + r.user.id : msg(r); });
  on('fg-port-save', async () => { const i = n.ports.findIndex(p => p.name === value('fg-port')); return submit({ type: 'port', index: i, value: { admin: value('fg-port-admin') === 'up' } }); });
  on('fg-vlan-save', async () => {
    const id = +value('fg-vid'), ip = value('fg-vip'), prefix = +value('fg-vprefix');
    let r = await cfg('interfaces', { id, name: value('fg-vname'), ip, prefix, enabled: checked('fg-venabled'), zone: value('fg-vzone'), mtu: 1500 }); if (r?.ok === false) return msg(r);
    r = await cfg('dhcp', { id, enabled: checked('fg-dhcp'), start: +value('fg-dstart'), end: +value('fg-dend'), gateway: ip, dns: value('fg-ddns') || ip, lease: 3600 }); if (r?.ok === false) return msg(r);
    const i = n.ports.findIndex(p => p.name === value('fg-vparent')), p = n.ports[i];
    const allowed = [...new Set([...(p.cfg.mode === 'trunk' ? p.cfg.allowed : [1]), id])].sort((a, b) => a - b);
    const t = await submit({ type: 'port', index: i, value: { mode: 'trunk', allowed, admin: true } });
    return 'VLAN ' + id + ' gateway ' + ip + '/' + prefix + ' saved · DHCP ' + (checked('fg-dhcp') ? 'on' : 'off') + ' · ' + value('fg-vparent') + ' trunk carries ' + allowed.join(',') + (String(t).startsWith('Applied') ? '' : ' · ' + t);
  });
  on('fg-vlan-delete', async () => { const id = value('fg-vid'); await send({ type: 'delete-record', page: 'dhcp', id }); return msg(await send({ type: 'delete-record', page: 'interfaces', id })); });
  on('fg-dns-save', async () => msg(await cfg('wan', { dnsService: checked('fg-dnsService'), dnsForward: checked('fg-dnsForward'), dns: value('fg-dnsUp') })));
  on('fg-dns-add', async () => msg(await cfg('dns', { id: value('fg-dnsName'), ip: value('fg-dnsIP'), enabled: true })));
  on('fg-dns-remove', async () => value('fg-dnsDel') ? msg(await send({ type: 'delete-record', page: 'dns', id: value('fg-dnsDel') })) : 'Choose a record');
  on('fg-route-save', async () => msg(await cfg('routes', { id: value('fg-rid'), destination: value('fg-rdst'), gateway: value('fg-rgw'), interface: value('fg-rif'), source: 'any', metric: 10, enabled: checked('fg-ren') })));
  on('fg-policy-save', async () => msg(await cfg('policies', { id: value('fg-pid'), src: value('fg-psrc'), dst: value('fg-pdst'), source: value('fg-psource') || 'any', destination: value('fg-pdest') || 'any', service: value('fg-psvc'), action: value('fg-pact'), nat: checked('fg-pnat'), enabled: checked('fg-pen'), start: 0, end: 24 })));
  on('fg-pup', async () => msg(await send({ type: 'move-policy', id: value('fg-pmove'), direction: -1 })));
  on('fg-pdown', async () => msg(await send({ type: 'move-policy', id: value('fg-pmove'), direction: 1 })));
  on('fg-ptoggle', async () => { const p = s().policies[value('fg-pmove')]; return p ? msg(await cfg('policies', { ...p, enabled: !p.enabled })) : 'Choose a policy'; });
  on('fg-pdelete', async () => msg(await send({ type: 'delete-record', page: 'policies', id: value('fg-pmove') })));
  on('fg-vip-save', async () => msg(await cfg('vip', { id: value('fg-vipid'), external: value('fg-vipext'), externalPort: +value('fg-vipextp'), internal: value('fg-vipint'), internalPort: +value('fg-vipintp'), enabled: checked('fg-vipen') })));
  on('fg-dtest', async () => {
    const r = await send({ type: 'probe', tool: 'HTTP', pc: value('fg-dpc'), url: value('fg-durl') });
    diag[n.id] = table(['Stage', 'Result', 'Detail'], (r.steps || []).map(x => [x.name, { html: okPill(x.ok, 'pass', 'FAIL') }, x.detail])) + `<p>${okPill(!!r.ok, 'Reachable', 'Blocked')} ${esc(r.reason || '')}</p>`; const el = $('fg-result'); if (el) el.innerHTML = diag[n.id];
    return r.ok ? 'Destination reachable' : 'Blocked at: ' + (r.steps?.find(x => !x.ok)?.name || r.reason);
  });
}
