// Device management GUIs: one shell (vendor header, grouped navigation, live status) and
// vendor-structured pages. Data changes go through the same product / device / office actions as
// before, so solo play, LAN co-op and tests share one authoritative path.
import { productProfile, configuredProduct } from './product-profiles.js';
import { runtimePages, runtimeContent, bindRuntimeUI } from './runtime-ui.js';
import { hostIdentifiers } from './product-config.js';
import { deviceRuntime, resourceUse, installStatus, poolUsable } from './device-runtime.js';
import { esc, pill, okPill, input, select, check, button, grid, card, cards, kv, table, checklist, note, meter } from './gui-kit.js';
import { fortigateNav, fortigateDashboard, fortigateContent, bindFortigate } from './gui-fortigate.js';
import { bindGuards } from './gui-guards.js';

const VENDOR = { dell: 'dell', hpe: 'hpe', fortinet: 'fortinet', terminal: 'dell', isp: 'isp' };
const BRAND = { idrac: 'Integrated Remote Access · iDRAC9 (training)', ilo: 'HPE iLO 6 (training)', powerstore: 'PowerStore Manager (training)', powervault: 'PowerVault Manager (training)', alletra: 'Array management (training)', powerscale: 'OneFS web administration (training)', storeonce: 'StoreOnce management (training)', objectscale: 'ObjectScale portal (training)', fortigate: 'FortiOS 7.4 (training subset)', analyzer: 'FortiAnalyzer (training)', siem: 'FortiSIEM (training)', isp: 'Provider-managed equipment' };

export function createProductUI({ container, network, nodes, submit }) {
  let current = null, page = 'overview', key = '', bridge = null;
  const $ = id => document.getElementById('pg-' + id), value = id => $(id)?.value || '', checked = id => !!$(id)?.checked;
  const byId = () => Object.fromEntries(nodes.map(x => [x.id, x]));
  // What a destructive action will break, shown before it runs (the second click confirms).
  const dangerImpact = (el, v) => {
    const n = current; if (!n) return '';
    const op = el.dataset?.runtimeForm, r = op ? deviceRuntime(n) : null, office = bridge?.office?.state;
    if (op === 'delete') return ({ volumes: 'Volume ' + v.id + ' is deleted permanently · its data is lost and mapped hosts lose the LUN', pools: 'Pool ' + v.id + ' and its disk group are removed', hosts: 'Host ' + v.id + ' loses access to every volume mapped to it', hostGroups: 'Host group ' + v.id + ' is removed · its members lose group mappings' })[v.table] || '';
    if (op === 'vm-power' && v.action === 'stop') return 'VM ' + v.id + ' powers off · its services stop for every user';
    if (op === 'vm-power' && v.action === 'delete') return 'VM ' + v.id + ' is deleted permanently (disk and configuration)';
    if (op === 'restore') return 'The device configuration is replaced by the last checkpoint · changes made since then are lost';
    if (op === 'os' && (r?.os || n.net.os)) return 'Reinstalling erases the boot volume · the running OS, its VMs and services stop';
    if (op === 'maintenance' && v.enabled && !r?.maintenance) return 'Maintenance mode powers off the running VMs on this host · their services stop';
    if (el.id === 'pg-fg-vlan-delete') return 'VLAN interface ' + value('fg-vid') + ' and its DHCP scope are deleted · clients in that VLAN lose their gateway and addresses';
    if (el.id === 'pg-fg-pdelete') return 'Policy ' + value('fg-pmove') + ' is deleted · traffic it matched falls to the next policy or the implicit deny';
    if (el.id === 'pg-fg-dns-remove') return value('fg-dnsDel') ? 'DNS record ' + value('fg-dnsDel') + ' is removed · clients can no longer resolve it' : '';
    if (el.id === 'pg-fg-ptoggle') { const p = office?.policies?.[value('fg-pmove')]; return p?.enabled ? 'Policy ' + value('fg-pmove') + ' is disabled · traffic it ' + (p.action === 'deny' ? 'blocks is no longer blocked by it' : 'allows is dropped') : ''; }
    if (el.classList?.contains('gv-danger')) return 'This change cannot be undone';
    return '';
  };
  bindGuards(container, { impact: dangerImpact });
  const ctx = () => ({ network, nodes, byId: byId(), bridge });
  // Pages generated from the family module's gui() data (no logic in the UI layer).
  const logicGui = n => { try { return network.logic?.cached(n, 'gui') || { pages: {}, summary: [] }; } catch (e) { return { pages: {}, summary: [], error: e.message }; } };
  function withLogicPages(n, base) {
    const out = base.map(([g, items]) => [g, [...items]]), pages = logicGui(n).pages || {};
    for (const [id, pg] of Object.entries(pages)) { let group = out.find(([g]) => g === pg.group); if (!group) { group = [pg.group, []]; out.push(group); } if (!group[1].some(([x]) => x === id)) group[1].push([id, pg.title]); }
    return out;
  }
  function nav(n) { return withLogicPages(n, baseNav(n)); }
  function baseNav(n) {
    const f = productProfile(n).family, rt = Object.fromEntries(runtimePages(n)), R = id => [id, rt[id]];
    if (f === 'fortigate') return fortigateNav(n, bridge);
    if (f === 'isp') return [['Provider router', [['overview', 'Status']]]];
    if (productProfile(n).serial) return [['Dashboard', [['overview', 'Status']]]];
    if (['idrac', 'ilo'].includes(f)) return [
      ['Dashboard', [['overview', 'Status & next steps']]],
      ['Server', [['os-install', 'Virtual media · Install OS'], ['host', f === 'ilo' ? 'Intelligent Provisioning · initiators' : 'Lifecycle · storage initiators'], R('hardware')]],
      ['Host / hypervisor', [R('host-network'), R('virtual-network'), R('virtualization'), R('datastores'), R('services')]],
      [f === 'ilo' ? 'iLO settings' : 'iDRAC settings', [['identity', 'System settings'], ['management', f === 'ilo' ? 'iLO dedicated network' : 'iDRAC network']]],
      ['Maintenance', [R('activity'), R('maintenance')]]];
    if (['powerstore', 'powervault', 'alletra'].includes(f)) return [
      ['Dashboard', [['overview', 'Status & next steps']]],
      ['Storage', [['volumes', 'Pools & volumes'], ['storage-hosts', 'Hosts & mapping'], ['storage', 'Data ports & primary host'], ...(rt.shares ? [R('shares')] : [])]],
      ['Settings', [['identity', f === 'powerstore' ? 'Cluster details' : 'System'], ['management', f === 'powervault' ? 'Controller network' : 'Management network']]],
      ['Monitoring', [R('hardware'), R('activity'), R('maintenance')]]];
    const extra = ['powerscale', 'storeonce'].includes(f) ? [['nas', f === 'powerscale' ? 'Access zones' : 'NAS targets']] : f === 'objectscale' ? [['object', 'Object stores / S3']] : [];
    return [['Dashboard', [['overview', 'Status']]], ['Configuration', [['identity', 'System'], ['management', 'Management network'], ...extra]], ['Operations', runtimePages(n).filter(([id]) => !id.startsWith('fw-'))]];
  }
  const pages = n => nav(n).flatMap(([, items]) => items);
  function render(n, allowed, reason, force = false) {
    current = n;
    const f = productProfile(n), p = configuredProduct(n);
    container.hidden = false;
    // Re-render when the page or the shared world changes (LAN frames included), but never while the
    // engineer is typing in a field of this page.
    const editing = typeof document !== 'undefined' && document.activeElement && container.contains?.(document.activeElement) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
    const next = n.id + ':' + page + ':' + p.commissioned + ':' + (network.logic?.version || 0);
    if (force || (next !== key && (!editing || !key.startsWith(n.id + ':' + page + ':')))) {
      key = next;
      if (!pages(n).some(x => x[0] === page)) page = 'overview';
      container.dataset.vendor = VENDOR[f.color] || 'dell';
      const health = healthOf(n), label = pages(n).find(x => x[0] === page)?.[1] || 'Status';
      container.innerHTML = `<div class="gv"><div class="gv-top"><div class="gv-brand"><b>${esc(n.model)}</b><span>${esc(BRAND[f.family] || f.title)}</span></div><div class="gv-meta"><code>${esc(n.net.hostname || n.id)}</code><code>${esc(n.net.ip === '0.0.0.0' ? 'no mgmt IP' : n.net.ip)}</code>${pill(health[0], health[1])}${pill(p.commissioned ? 'ok' : 'warn', p.commissioned ? 'Operations' : 'Initial setup')}</div></div><div class="gv-body"><nav class="gv-nav">${nav(n).map(([group, items]) => `<h6>${esc(group)}</h6>` + items.filter(x => x[1]).map(([id, text]) => `<button data-pg-page="${id}" aria-pressed="${page === id}">${esc(text)}</button>`).join('')).join('')}</nav><div class="gv-main"><div id="pg-access" class="gv-access" role="status"></div>${statusStrip(n)}<fieldset id="pg-fields"><legend>${esc(label)}</legend>${content(n, page)}</fieldset>${blockingBox(n)}<output id="pg-message" role="status"></output></div></div></div>`;
      container.querySelectorAll('[data-pg-page]').forEach(b => (b.onclick = () => { page = b.dataset.pgPage; render(n, allowed, reason, true); }));
      bind(n, allowed, reason);
    }
    $('access').textContent = reason || '';
    $('fields').disabled = !allowed;
    const status = $('live-status'); if (status) status.textContent = network.productChecks(n).map(c => (c.ok ? '✓ ' : '○ ') + c.label).join('\n');
    const paths = $('live-paths');
    if (paths) { const list = network.storagePaths(n), vols = network.arrayVolumes?.(n) || []; paths.textContent = (list.length ? list.map(x => 'Path ' + x.side + ': ' + x.path).join('\n') + (list.length < 2 ? '\nDEGRADED · configure a second independent path' : '\nREDUNDANT · both paths available') : 'NO DATA PATH · management access alone does not present a volume') + (vols.length ? '\n\nHost access per volume:\n' + vols.map(v => v.volume + ' → ' + (v.host || 'unmapped') + ': ' + String(v.state).toUpperCase() + ' · ' + v.reason).join('\n') : ''); }
    const wan = $('wan-status'); if (wan) wan.textContent = network.wanStatus(n).reason;
  }
  // Every page: status summary at the top and the first failing check ("what's blocking") with its
  // fix hint and a link to the page where it is fixed.
  function statusStrip(n) { const g = logicGui(n), rows = g.summary || []; return rows.length ? `<div class="gv-strip" id="pg-strip">${rows.map(([k, v, tone]) => `<span class="gv-chip"><small>${esc(k)}</small> ${tone ? pill(tone, v) : esc(v)}</span>`).join('')}</div>` : ''; }
  function blockingBox(n) {
    let f = null; try { f = network.logic?.first(n); } catch { f = null; }
    if (!f) return `<aside class="gv-blocking gv-blocking-ok" id="pg-blocking">${pill('ok', 'Nothing blocking')} All checks pass for ${esc(n.id)}.</aside>`;
    const target = pages(n).find(([id]) => id === f.where);
    return `<aside class="gv-blocking ${f.severity === 'warning' ? 'gv-blocking-warn' : ''}" id="pg-blocking"><b>What's blocking</b> ${pill(f.severity === 'warning' ? 'warn' : 'crit', f.layer)} <span id="pg-blocking-text">${esc(f.detail)}</span>${f.fixHint ? `<small>Fix: ${esc(f.fixHint)}</small>` : ''}${target && target[0] !== page ? `<button type="button" data-pg-page="${esc(target[0])}">Go to ${esc(target[1])}</button>` : ''}</aside>`;
  }
  function logicPage(n, tab) {
    const pg = (logicGui(n).pages || {})[tab]; if (!pg) return null;
    return (pg.notes || []).map(t => note(esc(t))).join('') + (pg.tables || []).map(t => `<h3>${esc(t.title)}</h3>` + table(t.heads, t.rows.map(r => r.map(c => String(c ?? '—'))))).join('');
  }
  function logicOverview(n) {
    let checks = []; try { checks = network.logic?.checks(n) || []; } catch { checks = []; }
    return cards(card('Checks in layer order', checklist(checks.filter(c => c.detail || !c.ok).map(c => ({ label: c.layer + ' · ' + c.id, ok: c.ok, detail: c.ok ? '' : c.detail }))), { wide: true }), card('About this device', `<p>${esc(productProfile(n).factory)}</p>`, { wide: true }));
  }
  function healthOf(n) {
    const f = productProfile(n).family, st = network.localStatus(n);
    if (!st.ok) return ['crit', st.reason.split('·')[0].trim()];
    if (n.physical?.fault) return ['crit', 'Fault: ' + n.physical.fault];
    if (f === 'fortigate') { const legacy = !n.spec && bridge?.office?.state.bindings.firewall === n.id, up = legacy ? bridge.office.firewallPing('example.test').ok : network.wanStatus(n).ok; return up ? ['ok', 'WAN up'] : ['warn', 'WAN down']; }
    if (n.type === 'storage') { const v = network.arrayVolumes?.(n) || [], bad = v.filter(x => x.host && x.state !== 'healthy'); return bad.length ? [bad.some(x => x.state === 'unavailable') ? 'crit' : 'warn', bad.length + ' volume path issue(s)'] : ['ok', 'Healthy']; }
    if (['server', 'gpu'].includes(n.type)) { const i = installStatus(n); if (i.state === 'failed') return ['crit', 'OS install failed']; if (!n.physical?.on && n.physical) return ['warn', 'Host off']; return ['ok', i.state === 'installing' ? 'Installing' : 'Healthy']; }
    return ['ok', 'Healthy'];
  }
  function serverDashboard(n) {
    const r = deviceRuntime(n), use = resourceUse(n), p = configuredProduct(n), inst = installStatus(n), vms = Object.values(r.vms), vols = network.hostVolumes?.(n) || [];
    const services = [r, ...vms].flatMap(t => Object.values(t.services || {}).map(s => ({ ...s, on: t.id || 'host OS' })));
    for (const x of Object.values(bridge?.office?.state.services || {})) if (x.host === n.id && !x.managedBy) services.push({ id: x.id, on: 'host OS (office role)', running: x.running, requests: x.running ? 1 : 0 });
    const vmRows = vms.map(v => { const s = network.vmState(n, v); return [v.id, v.ip ? v.ip + '/' + (v.prefix || 24) : '—', v.network, { html: v.on ? okPill(s.ok, 'running', 'problem') : pill('off', 'off') }, s.ok ? s.reason : v.on ? s.reason : '']; });
    const steps = [
      { label: 'Power on the host (front button)', ok: !n.physical || (n.physical.on && !(n.physical.bootUntil > Date.now())), detail: network.localStatus(n, true).reason },
      { label: 'Management controller network', ok: n.net.ip !== '0.0.0.0', detail: 'iDRAC/iLO settings → network, cable MGMT UPLINK to the management switch' },
      { label: 'Operating system / hypervisor', ok: !!r.os, detail: inst.reason },
      { label: 'Host data network or port group', ok: !!r.hostIP || Object.keys(r.portgroups).length > 0, detail: 'Host / hypervisor → Host network or Virtual networking (trunk the switch port)' },
      { label: 'Virtual machine running', ok: vms.some(v => v.on && network.vmState(n, v).ok), detail: vms.length ? vms.length + ' VM(s)' : 'Host / hypervisor → Virtual machines' },
      { label: 'Service listening', ok: services.some(s => s.running), detail: services.length ? services.map(s => s.id + ' on ' + s.on).join(', ') : 'Host / hypervisor → Server services' },
      { label: 'Employees reach the service', ok: services.some(s => s.requests > 0), detail: services.some(s => s.requests > 0) ? services.map(s => s.id + ': ' + (s.requests || 0) + ' request(s)').join(', ') : 'Open it from an office workstation (DNS record + firewall policy required)' },
    ];
    return cards(
      card('Next steps', checklist(steps), { wide: true }),
      card('Power & health', kv([['Host power', network.localStatus(n, true).ok ? pill('ok', 'On') : pill('off', network.localStatus(n, true).reason)], ['Management', esc(network.localStatus(n).reason)], ['PSU A / B', esc((n.physical?.power?.[0] || '—') + ' / ' + (n.physical?.power?.[1] || '—'))], ['Hardware', n.physical?.fault ? pill('crit', n.physical.fault) : pill('ok', 'No faults')]])),
      card('Operating system', kv([['OS', esc(r.os || 'Not installed')], ['Installer', esc(inst.reason)], ['Hypervisor', r.hypervisor ? pill('ok', r.hypervisor) : pill('off', 'none')], ['Boot', esc(r.raid || '—')]]), { tone: inst.state === 'failed' ? 'crit' : '' }),
      card('Resources', meter(use.cpu, r.cpu, 'vCPU ' + use.cpu + ' / ' + r.cpu) + meter(use.memory, r.memory, 'RAM ' + use.memory + ' / ' + r.memory + ' GiB') + meter(use.disk, r.datastores.local?.sizeGiB || 4096, 'Local disk ' + use.disk + ' GiB')),
      card('Virtual machines', table(['VM', 'IP', 'Port group', 'State', 'Detail'], vmRows, 'No VMs'), { wide: true }),
      card('Block storage seen by this host', table(['Array / volume', 'Access', 'State'], vols.map(v => [v.array + ' / ' + v.volume, v.access || '—', { html: pill(v.state === 'healthy' ? 'ok' : v.state === 'degraded' ? 'warn' : 'crit', v.state) }])) + (vols.find(v => v.state !== 'healthy') ? note(esc(vols.find(v => v.state !== 'healthy').reason), 'warn') : ''), { wide: true }),
    ) + `<pre id="pg-live-status" hidden></pre>` + button('commission', 'Validate initial configuration', 'primary');
  }
  function storageDashboard(n) {
    const r = deviceRuntime(n), p = configuredProduct(n), vols = network.arrayVolumes?.(n) || [], s = p.storage;
    const steps = [
      { label: 'System identity and administrator', ok: !!p.identity.passwordSet, detail: 'Settings → System / Cluster details' },
      { label: 'Management and controller addresses', ok: n.net.ip !== '0.0.0.0', detail: 'Settings → management network' },
      { label: 'Pool with protection', ok: Object.keys(r.pools).length > 0, detail: 'Storage → Pools & volumes' },
      { label: 'Data ports A/B and transport', ok: !!s.protocol, detail: s.protocol ? s.protocol + ' · ' + s.portA + ' / ' + s.portB : 'Storage → Data ports & primary host' },
      { label: 'Host registered with its initiator', ok: Object.keys(r.hosts).length > 0, detail: 'Storage → Hosts & mapping' },
      { label: 'Volume mapped to a host / host group', ok: Object.values(r.volumes).some(v => v.host || v.group), detail: 'Storage → Pools & volumes' },
      { label: 'Host sees the volume on two independent paths', ok: vols.some(v => v.state === 'healthy'), detail: vols.find(v => v.host)?.reason || 'Cable A/B through separate switches or fabrics' },
    ];
    return cards(
      card('Next steps', checklist(steps), { wide: true }),
      card('Capacity', Object.values(r.pools).map(x => { const used = Object.values(r.volumes).filter(v => v.pool === x.id).reduce((t, v) => t + v.sizeGiB, 0), u = poolUsable(x); return `<b>${esc(x.id)}</b> <small>${esc(x.protection)} · raw ${x.sizeGiB} GiB</small>` + meter(used, u, used + ' / ' + u + ' GiB usable'); }).join('') || note('No pools yet')),
      card('Data ports', kv([['Transport', esc(s.protocol || 'not configured')], ['Path A', esc(s.portA ? s.portA + (s.ipA ? ' · ' + s.ipA + ' VLAN ' + s.vlanA : '') : '—')], ['Path B', esc(s.portB ? s.portB + (s.ipB ? ' · ' + s.ipB + ' VLAN ' + s.vlanB : '') : '—')], ['Supported', esc(productProfile(n).protocols.join(' / '))]])),
      card('Host access', table(['Volume', 'Host', 'Access', 'State', 'Reason'], vols.map(v => [v.volume, v.host || '—', v.access || '—', { html: pill(v.state === 'healthy' ? 'ok' : v.state === 'degraded' ? 'warn' : v.state === 'unmapped' ? 'off' : 'crit', v.state) }, v.state === 'healthy' ? 'A+B independent' : v.reason])), { wide: true }),
    ) + `<pre id="pg-live-status" hidden></pre>` + button('commission', 'Validate initial configuration', 'primary');
  }
  function ispDashboard(n) {
    const fw = nodes.find(x => x.active !== false && x.net?.ispContract?.id === n.spec?.contract), c = fw?.net.ispContract;
    const handoff = n.ports.filter(p => /^(LAN\d|SFP1)$/.test(p.name)).map(p => [p.name, p.speed + 'G', { html: p.link && !p.link.unplugged ? (p.link.disabled ? pill('crit', 'down') : pill('ok', 'link')) + ' ' + esc(p.link.a === n.id ? p.link.b : p.link.a) : pill('off', 'free') }]);
    return cards(card('Provider router', kv([['Circuit', esc(c ? c.id + ' · ' + (c.planName || '') : 'Not assigned')], ['Customer firewall', esc(fw?.id || '—')], ['Fiber', pill('ok', 'Terminated by provider')], ['Power', network.localStatus(n).ok ? pill('ok', 'On') : pill('crit', network.localStatus(n).reason)]])), card('Handoff ports', table(['Port', 'Speed', 'Link'], handoff), { wide: true })) + note('Provider-managed: no customer login. Patch LAN1 (1G) or SFP1 (10G) to your FortiGate WAN port and configure the FortiGate from the circuit sheet.');
  }
  function content(n, tab) {
    const f = productProfile(n), p = configuredProduct(n), m = p.management, ids = hostIdentifiers(n);
    if (f.family === 'fortigate') { if (tab === 'overview') return fortigateDashboard(n, ctx()); const fg = fortigateContent(n, tab, ctx()); if (fg !== null) return fg; }
    const lp = logicPage(n, tab); if (lp !== null) return lp;
    if (f.serial && tab === 'overview') return logicOverview(n);
    const extended = runtimeContent(n, tab, nodes, network);
    if (extended !== null) return extended;
    if (tab === 'overview') {
      if (f.family === 'isp') return ispDashboard(n);
      if (['idrac', 'ilo'].includes(f.family)) return serverDashboard(n);
      if (['powerstore', 'powervault', 'alletra'].includes(f.family)) return storageDashboard(n);
      return cards(card('Setup', checklist(network.productChecks(n).map(c => ({ label: c.label, ok: c.ok }))), { wide: true }), card('About this device', `<p>${esc(f.factory)}</p><a href="${esc(f.doc)}" target="_blank" rel="noopener noreferrer">Vendor setup reference</a>`, { wide: true })) + `<pre id="pg-live-status" hidden></pre>` + button('commission', 'Validate initial configuration', 'primary');
    }
    if (tab === 'identity') return note(p.identity.passwordSet ? 'Administrator password already changed. Leave it blank to keep it.' : 'First login: set the system name and change the default administrator password (training value only, it is not stored).', p.identity.passwordSet ? 'ok' : 'warn') + grid(input('name', f.family === 'powerstore' ? 'Cluster name' : 'Hostname / system name', p.identity.name || n.net.hostname || ''), input('password', 'New administrator password', '', 'password', '8+ characters'), ...(f.family === 'powerstore' ? [select('mode', 'Deployment mode', ['Unified', 'Block Optimized'], p.identity.mode || 'Unified'), select('protection', 'Drive fault tolerance', ['Single drive', 'Double drive'], p.identity.protection || 'Double drive')] : []), input('timezone', 'Time zone', p.identity.timeZone || 'UTC')) + button('identity-save', 'Apply', 'primary');
    if (tab === 'management') return note(esc(f.entry) + '. Management traffic uses the dedicated MGMT port and is separate from data traffic. Put the management switch port in the same VLAN.') + grid(input('ip', f.family === 'powerstore' ? 'Cluster management IP' : f.family === 'powervault' ? 'Controller A IP' : 'Management IPv4', m.ip || (n.net.ip !== '0.0.0.0' ? n.net.ip : '')), input('prefix', 'Prefix length', m.prefix || 24, 'number'), ...(['powerstore', 'powervault'].includes(f.family) ? [input('nodeA', f.family === 'powervault' ? 'Controller A (same as GUI IP)' : 'Node A IP', m.nodeA || ''), input('nodeB', f.family === 'powervault' ? 'Controller B IP' : 'Node B IP', m.nodeB || '')] : []), input('gateway', 'Gateway', m.gateway || n.net.gateway || ''), input('dns', 'DNS server', m.dns || n.net.dns || ''), input('ntp', 'NTP server', m.ntp || n.net.ntp || ''), input('vlan', 'Management VLAN (switch port)', m.vlan || 70, 'number'), check('ssh', 'Allow SSH', m.ssh ?? n.net.ssh)) + button('management-save', 'Apply network settings', 'primary');
    if (tab === 'host') { const h = p.host; return note('Storage initiators live on the host data ports, never on the iDRAC/iLO port. iSCSI/NVMe-TCP need an IP, VLAN and MTU per path; FC uses the two HBA WWPNs. OS installation itself is on <b>Virtual media · Install OS</b>.') + grid(select('os', 'OS profile for drivers', ['VMware ESXi', 'Linux', 'Windows Server'], h.os), select('raid', 'Boot storage', ['RAID 1 boot', 'RAID 10', 'HBA / passthrough'], h.raid), dataFields(n, h, ['FC', 'iSCSI', 'NVMe/TCP']), input('iqn', 'iSCSI IQN / NVMe host NQN', h.iqn || ids.iqn), input('wwpnA', 'HBA A WWPN', h.wwpnA || ids.wwpnA), input('wwpnB', 'HBA B WWPN', h.wwpnB || ids.wwpnB), check('initiatorEnabled', 'Enable the storage initiator', h.initiatorEnabled)) + button('host-save', 'Apply initiator settings', 'primary'); }
    if (tab === 'storage') { const s = p.storage; return note('Step 1: choose the purchased transport and the two array data ports (path A and B). Step 2: pick the primary host and paste its initiator. Management access alone never presents a volume.') + grid(...(f.family === 'powervault' ? [select('mode', 'Storage type', ['Virtual', 'Linear'], s.mode), select('raid', 'Disk-group protection', ['ADAPT', 'RAID 1', 'RAID 5', 'RAID 6', 'RAID 10'], s.raid)] : []), input('pool', f.family === 'powervault' ? 'Pool / disk group' : 'Storage pool', s.pool || 'POOL-A'), input('volume', 'Volume name', s.volume || 'DATASTORE-01'), input('sizeGiB', 'Size (GiB)', s.sizeGiB || 1024, 'number'), dataFields(n, s, f.protocols), select('host', 'Register / map host', nodes.filter(x => x.active !== false && ['idrac', 'ilo'].includes(productProfile(x).family) && x.type !== 'cloud').map(x => [x.id, (x.net.hostname || x.id) + ' · ' + x.model]), s.host), input('initiator', 'Host initiator (IQN / WWPN)', s.initiator || '')) + `<div class="gv-row">${button('copy-initiator', 'Use host initiator')}${button('storage-save', 'Create / update volume and mapping', 'primary')}</div>` + note(`FC target WWPNs · A <code>${ids.wwpnA}</code> · B <code>${ids.wwpnB}</code>. Zone each with the matching host HBA on its own fabric.`) + `<pre id="pg-live-paths"></pre>`; }
    if (tab === 'nas') { const v = p.nas || {}; return note(f.family === 'powerscale' ? 'OneFS access zone and external data network. Client permissions are set in File services.' : 'StoreOnce NAS target for backups.') + grid(input('nas-name', 'Target / share name', v.name || 'company'), input('nas-zone', 'Access zone', v.zone || 'System'), select('nas-protocol', 'File protocol', ['SMB', 'NFS'], v.protocol), input('nas-ip', 'Data IP', v.ip || '10.10.50.20'), input('nas-prefix', 'Prefix', v.prefix || 24, 'number'), input('nas-vlan', 'Data VLAN', v.vlan || 50, 'number'), select('nas-port', 'Data interface', n.ports.filter(x => !x.service && !/MGMT/.test(x.name) && x.medium === 'Ethernet').map(x => x.name), v.port)) + button('nas-save', 'Apply file target', 'primary'); }
    if (tab === 'object') { const o = p.object; return note('Object storage over Ethernet (S3), not LUNs. Single-node training record.') + grid(input('pool', 'Storage pool', o.pool || 'POOL-01'), input('replicationGroup', 'Replication group', o.replicationGroup || 'RG-01'), input('namespace', 'Namespace', o.namespace || 'tenant01'), input('user', 'Object user', o.user || 'app01'), input('bucket', 'S3 bucket', o.bucket || 'data-lake'), input('endpoint', 'HTTPS S3 endpoint', o.endpoint || 'https://s3.lab.example')) + button('object-save', 'Apply', 'primary'); }
    return '';
  }
  function dataFields(n, v, protocols) {
    const ports = n.ports.filter(p => !p.service && p.medium !== 'Internal' && !/MGMT/.test(p.name)), selected = v.protocol || protocols[0], defaults = ports.filter(p => p.medium === (selected === 'FC' ? 'Fibre Channel' : 'Ethernet'));
    return select('protocol', 'Transport', protocols, selected) + select('portA', 'Path A port', ports.map(p => [p.name, p.name + ' · ' + p.medium + ' ' + p.speed + 'G']), v.portA || defaults[0]?.name) + select('portB', 'Path B port', ports.map(p => [p.name, p.name + ' · ' + p.medium + ' ' + p.speed + 'G']), v.portB || defaults[1]?.name) + input('ipA', 'Path A IPv4 (iSCSI)', v.ipA || '') + input('ipB', 'Path B IPv4 (iSCSI)', v.ipB || '') + input('dataPrefix', 'Prefix', v.prefix || 24, 'number') + input('vlanA', 'Fabric A VLAN', v.vlanA || 3000, 'number') + input('vlanB', 'Fabric B VLAN', v.vlanB || 3001, 'number') + select('mtu', 'MTU', [1500, 9000, 9216], v.mtu || 1500);
  }
  function bind(n, allowed, reason) {
    const done = message => { render(n, allowed, reason, true); $('message').textContent = message || 'Completed'; };
    bindRuntimeUI(container, n, submit, done);
    const on = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };
    const send = async (op, v = {}) => { try { const result = await submit({ type: 'product', op, value: v }); if (result?.startsWith('Applied')) render(n, allowed, reason, true); $('message').textContent = result || 'No active configuration session'; } catch (e) { $('message').textContent = e.message; } };
    if (productProfile(n).family === 'fortigate' && bridge) bindFortigate(n, page, { bridge, submit, value, checked, done, $ });
    const transport = $('protocol');
    if (transport && ['host', 'storage'].includes(page)) {
      const update = () => { const fc = value('protocol') === 'FC'; for (const id of ['ipA', 'ipB', 'dataPrefix', 'vlanA', 'vlanB', 'mtu', 'iqn']) if ($(id)) $(id).disabled = fc; for (const id of ['wwpnA', 'wwpnB']) if ($(id)) $(id).disabled = !fc; };
      transport.onchange = () => { const ports = n.ports.filter(p => !p.service && !/MGMT/.test(p.name) && p.medium === (value('protocol') === 'FC' ? 'Fibre Channel' : 'Ethernet')); for (const [i, id] of ['portA', 'portB'].entries()) $(id).value = ports[i]?.name || ''; update(); };
      update();
    }
    const data = () => ({ protocol: value('protocol'), portA: value('portA'), portB: value('portB'), ipA: value('ipA'), ipB: value('ipB'), prefix: +value('dataPrefix'), vlanA: +value('vlanA'), vlanB: +value('vlanB'), mtu: +value('mtu') });
    on('identity-save', () => { const pass = value('password'); if (pass && (pass.length < 8 || (productProfile(n).family === 'powerstore' && (pass.length > 40 || !/[A-Z]/.test(pass) || !/[a-z]/.test(pass) || !/[0-9]/.test(pass) || !/[!,@#$%^~?_]/.test(pass) || /[ '&]/.test(pass))))) { $('message').textContent = 'Use 8+ characters. PowerStore requires 8–40, upper/lowercase, a number and special character; no spaces, quotes or &'; return; } return send('identity', { name: value('name'), passwordChanged: pass.length >= 8, mode: value('mode'), protection: value('protection'), timeZone: value('timezone') }); });
    on('management-save', () => send('management', { ip: value('ip'), prefix: +value('prefix'), nodeA: value('nodeA'), nodeB: value('nodeB'), gateway: value('gateway'), dns: value('dns'), ntp: value('ntp'), vlan: +value('vlan'), ssh: checked('ssh') }));
    on('host-save', () => send('host', { ...data(), os: value('os'), raid: value('raid'), iqn: value('iqn'), wwpnA: value('wwpnA'), wwpnB: value('wwpnB'), initiatorEnabled: checked('initiatorEnabled') }));
    on('copy-initiator', () => { const h = nodes.find(x => x.id === value('host')); if (h) $('initiator').value = configuredProduct(h).host[value('protocol') === 'FC' ? 'wwpnA' : 'iqn'] || ''; });
    on('nas-save', () => send('nas', { name: value('nas-name'), zone: value('nas-zone'), protocol: value('nas-protocol'), ip: value('nas-ip'), prefix: +value('nas-prefix'), vlan: +value('nas-vlan'), port: value('nas-port') }));
    on('storage-save', () => send('storage', { ...data(), mode: value('mode'), raid: value('raid'), pool: value('pool'), volume: value('volume'), sizeGiB: +value('sizeGiB'), host: value('host'), initiator: value('initiator') }));
    on('object-save', () => send('object', Object.fromEntries(['pool', 'replicationGroup', 'namespace', 'user', 'bucket', 'endpoint'].map(k => [k, value(k)]))));
    on('wan-save', async () => {
      const bound = bridge && (bridge.office?.state.bindings.firewall === n.id);
      const v = { port: value('port'), mode: value('wanMode'), ip: value('wanIP'), prefix: +value('wanPrefix'), gateway: value('wanGateway'), dns: value('wanDNS'), pppoeUser: value('pppoeUser'), pppoePassword: value('pppoePassword'), enabled: checked('wanEnabled'), defaultRoute: checked('defaultRoute') };
      if (!bound) return send('wan', v);
      const r = await bridge.send({ type: 'configure', page: 'wan', value: { port: v.port, mode: v.mode === 'Static' ? 'static' : v.mode, ip: v.ip, gateway: v.gateway, dns: v.dns, pppoeUser: v.pppoeUser, pppoePassword: v.pppoePassword, connected: true, defaultRoute: v.defaultRoute, dnsForward: checked('dnsForward') } });
      done((r?.message || r?.reason || 'Done') + ' · ' + network.wanStatus(n).reason);
    });
    on('lan-save', async () => { const p = n.ports.find(p => p.name === value('lanTest')); $('message').textContent = await submit({ type: 'enterprise', op: 'interface-address', index: n.ports.indexOf(p), ip: value('lanIP'), prefix: +value('lanPrefix') }); });
    on('internet-test', async () => { $('message').textContent = await submit({ type: 'product', op: 'internet-test', value: { lan: value('lanTest') } }); });
    on('commission', () => send('commission'));
  }
  return { render, setPage(p) { page = p || 'overview'; key = ''; }, reset() { key = ''; page = 'overview'; }, get page() { return page; }, setBridge(b) { bridge = b; key = ''; } };
}
