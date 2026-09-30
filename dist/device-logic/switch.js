// Ethernet switch logic (FortiSwitch, Dell PowerSwitch OS10, Cisco Nexus NX-OS, Aruba AOS-CX, factory
// switches).
//
// State machine: no input ──PSU cord──▶ booting (4 s) ──▶ running; running ──feed lost──▶ no input.
//   A factory switch has no management IP: initialization happens on the serial console.
//   OS10 / NX-OS / AOS-CX keep a separate startup-config: after a power cycle the running config is
//   replaced by the saved startup-config (unsaved changes are lost). FortiSwitchOS saves immediately.
// Derived (never stored): per-port physical state, VLAN database consistency, RSTP (root bridge,
// root/designated/alternate ports), broadcast storms (a loop made only of switches with STP
// disabled), LACP member state, native-VLAN mismatches, PoE allocation, the MAC address table
// learned from the endpoints that actually send traffic (PCs, APs, hosts, VMs, firewall interfaces).
import { chk, warn, ordered, firstFailure, healthOf, baseChecks, managementCheck, baseLeds, alarmsFrom, portsState, powerState, bootState, led, table, ERR, peerOf, isMgmtPort, label, physicalOffline, productProfile, mac, memo } from './common.js';
import { lagProblem, lagMembers } from '../lag.js';
import { errorCounters } from '../media.js';

const POE_BUDGET = { fs148f: 740, cx6200: 740 };
const SAVE_FAMILIES = ['os10', 'nxos', 'aoscx'];
const bridges = ctx => ctx.nodes.filter(n => n.type === 'switch' && n.active !== false);
const costOf = speed => Math.round(20000000 / Math.max(1, speed * 1000));
const bridgeId = n => (n.net.stpPriority ?? 32768) + '.' + mac(n);
const linkUp = l => !!l && !l.retired && !l.unplugged && !l.disabled;
// Logical inter-switch edges; bundled LACP members between the same two switches count once.
export function switchEdges(ctx) {
  return memo(ctx.links, 'sw-edges', () => {
    const out = [], seenLag = new Set();
    for (const l of ctx.links) {
      if (!linkUp(l)) continue;
      const a = ctx.byId[l.a], b = ctx.byId[l.b];
      if (a?.type !== 'switch' || b?.type !== 'switch' || a.active === false || b.active === false || isMgmtPort(l.pa) || isMgmtPort(l.pb)) continue;
      const lag = l.pa.cfg?.lag;
      if (lag !== undefined && lag !== null && lag !== '') { const key = [l.a, l.b].sort().join('|') + ':' + lag; if (seenLag.has(key)) continue; seenLag.add(key); out.push({ a: l.a, b: l.b, pa: l.pa, pb: l.pb, link: l, lag, speed: l.pa.speed * lagMembers(a, lag).length }); }
      else out.push({ a: l.a, b: l.b, pa: l.pa, pb: l.pb, link: l, speed: l.pa.speed });
    }
    return out;
  });
}
// RSTP over the switch graph. STP-disabled switches forward everything and send no BPDUs.
export function spanningTree(ctx) {
  return memo(ctx.links, 'stp', () => {
    const sw = bridges(ctx).filter(n => !physicalOffline(n)), edges = switchEdges(ctx), enabled = n => n.net.stp !== false;
    const ports = new Map(); // port object → role
    const root = sw.filter(enabled).sort((x, y) => bridgeId(x) < bridgeId(y) ? -1 : 1)[0];
    const dist = new Map(); if (root) dist.set(root.id, 0);
    // Dijkstra on path cost (small graphs).
    const q = root ? [root.id] : [];
    while (q.length) { q.sort((x, y) => dist.get(x) - dist.get(y)); const id = q.shift(); for (const e of edges) { const other = e.a === id ? e.b : e.b === id ? e.a : null; if (!other) continue; const d = dist.get(id) + costOf(e.speed); if (!dist.has(other) || d < dist.get(other)) { dist.set(other, d); q.push(other); } } }
    const rootPort = new Map();
    for (const n of sw) {
      if (!root || n === root || !dist.has(n.id) || !enabled(n)) continue;
      const cands = edges.filter(e => e.a === n.id || e.b === n.id).map(e => { const other = e.a === n.id ? e.b : e.a; return { e, other, own: e.a === n.id ? e.pa : e.pb, cost: (dist.get(other) ?? 1e9) + costOf(e.speed), bid: bridgeId(ctx.byId[other]) }; }).sort((x, y) => x.cost - y.cost || (x.bid < y.bid ? -1 : 1) || n.ports.indexOf(x.own) - n.ports.indexOf(y.own));
      if (cands[0]) rootPort.set(n.id, cands[0].own);
    }
    for (const e of edges) {
      const A = ctx.byId[e.a], B = ctx.byId[e.b];
      const isRootA = rootPort.get(e.a) === e.pa, isRootB = rootPort.get(e.b) === e.pb;
      if (!enabled(A) || !enabled(B)) { ports.set(e.pa, enabled(A) ? (isRootA ? 'root' : 'designated') : 'disabled'); ports.set(e.pb, enabled(B) ? (isRootB ? 'root' : 'designated') : 'disabled'); continue; }
      if (isRootA || isRootB) { ports.set(e.pa, isRootA ? 'root' : 'designated'); ports.set(e.pb, isRootB ? 'root' : 'designated'); continue; }
      const ka = [dist.get(e.a) ?? 1e9, bridgeId(A)], kb = [dist.get(e.b) ?? 1e9, bridgeId(B)];
      const aWins = ka[0] < kb[0] || (ka[0] === kb[0] && ka[1] < kb[1]);
      ports.set(e.pa, aWins ? 'designated' : 'alternate'); ports.set(e.pb, aWins ? 'alternate' : 'designated');
    }
    // Storm: a cycle made only of switches that run no STP (nothing can break it).
    const parent = new Map(), find = x => { while (parent.get(x) !== x) x = parent.get(x); return x; }, storm = new Set(), loops = [];
    for (const n of sw) if (!enabled(n)) parent.set(n.id, n.id);
    for (const e of edges) { if (!parent.has(e.a) || !parent.has(e.b)) continue; const ra = find(e.a), rb = find(e.b); if (ra === rb) loops.push(e); else parent.set(ra, rb); }
    for (const e of loops) { const r = find(e.a); for (const id of parent.keys()) if (find(id) === r) storm.add(id); }
    return { root: root?.id || null, rootId: root ? bridgeId(root) : null, ports, storm, loops: loops.map(e => e.a + ' / ' + (e.pa.alias || e.pa.name) + ' ↔ ' + e.b + ' / ' + (e.pb.alias || e.pb.name)), cost: dist };
  });
}
export const storming = (ctx, id) => spanningTree(ctx).storm.has(id);

// Endpoints that send traffic: office PCs and APs, server host NICs and VMs, firewall interfaces.
function endpoints(ctx) {
  const out = [], o = ctx.office, s = o?.state;
  if (s) {
    for (const pc of Object.values(s.pcs)) { if (!pc.power || pc.mode !== 'LAN') continue; const a = o.access(pc); const sw = ctx.byId[pc.switch || s.bindings.access[pc.floor]]; if (a.ok && sw) out.push({ mac: pc.mac, vlan: a.vlan, node: sw, port: sw.ports[pc.port], who: pc.id }); }
    for (const ap of Object.values(s.aps)) { const sw = ctx.byId[s.bindings.access[ap.floor]]; if (sw?.ports[ap.port] && !o.apStatus(ap).startsWith('PoE unavailable')) out.push({ mac: '04:d5:90:00:' + String(Object.keys(s.aps).indexOf(ap.id) + 1).padStart(2, '0') + ':01', vlan: ap.mgmtVlan, node: sw, port: sw.ports[ap.port], who: ap.id }); }
  }
  for (const n of ctx.nodes) {
    if (n.active === false || physicalOffline(n) || !['server', 'gpu', 'firewall', 'storage'].includes(n.type)) continue;
    n.ports.forEach((p, i) => {
      const peer = peerOf(n, p); if (!peer || isMgmtPort(p) || p.medium !== 'Ethernet' || !linkUp(p.link)) return;
      const sw = ctx.byId[peer.id]; if (sw?.type !== 'switch') return;
      const vlans = p.cfg?.mode === 'trunk' ? (p.cfg.allowed || []) : [p.cfg?.access ?? 1];
      for (const v of vlans.slice(0, 6)) out.push({ mac: mac(n, i * 16 + v % 16), vlan: v, node: sw, port: peer.port, who: n.id + ' / ' + (p.alias || p.name) });
      const r = n.net.runtime; if (r) for (const vm of Object.values(r.vms || {})) { const pg = r.portgroups?.[vm.network]; if (vm.on && pg && (pg.uplinks || []).includes(i)) out.push({ mac: '00:50:56:' + mac(n).slice(9, 14) + ':' + (vm.id.length * 7 % 255).toString(16).padStart(2, '0'), vlan: pg.vlan, node: sw, port: peer.port, who: 'VM ' + vm.id }); }
    });
  }
  return out;
}
// MAC table of one switch: learned on the port toward each endpoint over links carrying its VLAN.
export function macTable(sw, ctx) {
  return memo(sw, 'mac-table', () => {
    const rows = [], carries = (p, v) => p.cfg && p.cfg.admin !== false && (p.cfg.mode === 'trunk' ? (p.cfg.allowed || []).includes(v) : p.cfg.access === v);
    for (const e of endpoints(ctx)) {
      if (!carries(e.port, e.vlan)) continue;
      if (e.node === sw) { rows.push({ vlan: e.vlan, mac: e.mac, port: e.port.alias || e.port.name, type: 'dynamic', who: e.who }); continue; }
      const seen = new Set([e.node.id]), q = [e.node.id];
      while (q.length) {
        const id = q.shift(), n = ctx.byId[id]; if (!n.net.vlans?.[e.vlan]) continue;
        for (const l of ctx.links) {
          if (!linkUp(l)) continue; const own = l.a === id ? l.pa : l.b === id ? l.pb : null; if (!own || isMgmtPort(own)) continue;
          const other = l.a === id ? l.b : l.a, far = l.a === id ? l.pb : l.pa, next = ctx.byId[other];
          if (next?.type !== 'switch' || seen.has(other) || !carries(own, e.vlan) || !carries(far, e.vlan)) continue;
          seen.add(other); if (other === sw.id) { rows.push({ vlan: e.vlan, mac: e.mac, port: far.alias || far.name, type: 'dynamic', who: e.who }); q.length = 0; break; } q.push(other);
        }
      }
    }
    const seen = new Set();
    return rows.filter(r => { const k = r.vlan + r.mac; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.vlan - b.vlan || (a.mac < b.mac ? -1 : 1));
  });
}
// PoE allocation: highest priority first, then lowest port number, until the budget is used.
export function poeState(sw, ctx) {
  const s = ctx.office?.state, budget = sw.net.poeBudget ?? POE_BUDGET[sw.spec?.sku] ?? (s ? s.environment.poeBudget : 0), rank = { critical: 0, high: 1, low: 2 };
  const pds = [];
  if (s) for (const ap of Object.values(s.aps)) if (s.bindings.access[ap.floor] === sw.id && ap.poe && s.ports[ap.id]?.poe !== false && sw.ports[ap.port]) pds.push({ port: ap.port, name: sw.ports[ap.port].alias || sw.ports[ap.port].name, device: ap.id, watts: 25.5, priority: sw.ports[ap.port].cfg?.poePriority || 'low' });
  pds.sort((a, b) => rank[a.priority] - rank[b.priority] || a.port - b.port);
  let used = 0; for (const d of pds) { if (used + d.watts <= budget) { d.powered = true; used += d.watts; } else { d.powered = false; d.reason = 'PoE budget exceeded · port powered off (priority ' + d.priority + ')'; } }
  return { budget, used, devices: pds, injector: !POE_BUDGET[sw.spec?.sku] && sw.net.poeBudget === undefined };
}
export function unsaved(n) {
  if (!SAVE_FAMILIES.includes(productProfile(n).family) || !n.spec) return null;
  if (!n.net.startup) return 'no startup-config saved · every change is lost at the next reload or power cycle';
  const strip = x => { delete x.startup; delete x.runtime; delete x.cliCheckpoint; delete x.sel; delete x.alarmKeys; if (x.enterprise) { delete x.enterprise.logs; delete x.enterprise.incidents; } return x; };
  const a = strip(structuredClone(n.net)), b = strip(structuredClone(n.net.startup));
  return JSON.stringify(a) === JSON.stringify(b) ? null : 'running-config has unsaved changes · they are lost at the next reload or power cycle';
}
function vlanProblems(n) {
  const out = [];
  for (const p of n.ports) { if (p.service || isMgmtPort(p) || !p.cfg || !p.link || p.link.unplugged) continue; const list = p.cfg.mode === 'trunk' ? (p.cfg.allowed || []) : [p.cfg.access]; const missing = list.filter(v => !n.net.vlans?.[v]); if (missing.length) out.push({ port: p.alias || p.name, missing }); }
  return out;
}
function nativeMismatch(n) {
  const out = [];
  for (const p of n.ports) { const l = p.link; if (!linkUp(l) || p.cfg?.mode !== 'trunk') continue; const far = l.pa === p ? l.pb : l.pa, peer = peerOf(n, p); if (far.cfg?.mode !== 'trunk') continue; if ((p.cfg.native || 1) !== (far.cfg.native || 1)) out.push(label(n, p) + ' native ' + (p.cfg.native || 1) + ' ↔ ' + label({ id: peer.id }, far) + ' native ' + (far.cfg.native || 1)); }
  return out;
}

export function state(n, ctx) {
  const c = checks(n, ctx), stp = spanningTree(ctx);
  return { power: powerState(n), boot: bootState(n), mgmt: { ip: n.net.ip, ssh: !!n.net.ssh, console: 'serial 9600 8N1' }, health: healthOf(c), ports: portsState(n, ctx).map(p => ({ ...p, stp: stp.ports.get(n.ports[p.index]) || (p.state === 'up' && !isMgmtPort(n.ports[p.index]) ? 'designated' : '') })), services: [], stp: { enabled: n.net.stp !== false, root: stp.root, isRoot: stp.root === n.id, storm: stp.storm.has(n.id) }, poe: poeState(n, ctx), unsaved: unsaved(n), alarms: alarmsFrom(n, c, 'switch') };
}
export function checks(n, ctx) {
  const out = baseChecks(n, ctx), stp = spanningTree(ctx);
  if (n.spec) out.push(managementCheck(n, ctx, 'console'));
  const ps = portsState(n, ctx);
  for (const code of ['transceiver', 'optic-failed', 'reach', 'fiber-type', 'length', 'dirty', 'no-light', 'speed', 'mtu']) { const bad = ps.filter(p => p.code === code); out.push(chk('port-' + code, 'link', !bad.length, bad.map(p => n.id + ' / ' + p.name + ': ' + p.reason).join(' · '), { transceiver: 'Insert an optic that matches the port speed and medium', 'optic-failed': 'Replace the failed optic', reach: 'Use SR on both ends (or LR on both ends)', 'fiber-type': 'SR needs OM4 multimode, LR needs OS2 single-mode fiber', length: 'Use a shorter cable or a longer-reach optic', dirty: 'Clean the connector: aim at the port → [V] Inspect / clean fiber', 'no-light': 'Replace the cut fiber', speed: 'Set both ends to the same speed (or auto)', mtu: 'Set the same MTU on both ends' }[code], 'ports')); }
  const lagBad = n.ports.map(p => [p, lagProblem(n, p, ctx.byId)]).filter(x => x[1]);
  out.push(warn('lacp', 'l2', !lagBad.length, lagBad.map(([p, why]) => 'Po' + p.cfg.lag + ' member ' + label(n, p) + ' ' + why).join(' · '), 'Match speed/VLANs on all members and configure LACP on the far end', 'ports'));
  const vp = vlanProblems(n);
  out.push(chk('vlan-db', 'l2', !vp.length, vp.map(x => x.port + ' carries VLAN ' + x.missing.join(',') + ' but it is not in the VLAN database · those frames are dropped').join(' · '), 'Create the VLAN (vlan N) before assigning it to a port', 'vlans'));
  const nm = nativeMismatch(n);
  out.push(warn('native-vlan', 'l2', !nm.length, 'Native VLAN mismatch: ' + nm.join(' · ') + ' (untagged traffic leaks between VLANs)', 'Set the same native VLAN on both ends of the trunk', 'ports'));
  out.push(chk('stp-storm', 'l2', !stp.storm.has(n.id), 'Broadcast storm: switching loop ' + stp.loops.join(', ') + ' with spanning tree disabled · all VLANs saturated', 'Enable spanning tree (spanning-tree enable) or remove the extra cable / bundle it with LACP', 'stp'));
  const blocked = n.ports.filter(p => stp.ports.get(p) === 'alternate');
  out.push({ ...warn('stp-blocked', 'l2', true, ''), info: blocked.length ? blocked.map(p => (p.alias || p.name) + ' alternate/blocking (RSTP)').join(' · ') : '' });
  const poe = poeState(n, ctx), off = poe.devices.filter(d => !d.powered);
  out.push(warn('poe-budget', 'power', !off.length, 'PoE budget exceeded: ' + poe.devices.reduce((t, d) => t + d.watts, 0) + ' W requested, ' + poe.budget + ' W available · ' + off.map(d => d.name + ' (' + d.device + ')').join(', ') + ' powered off', 'Raise the PoE budget / add a PSU, lower other ports’ priority or move devices', 'poe'));
  const u = unsaved(n);
  out.push(warn('unsaved', 'management', !u, (n.net.hostname || n.id) + ': ' + u, productProfile(n).family === 'nxos' ? 'copy running-config startup-config' : 'write memory', 'console'));
  return ordered(out);
}
export function leds(n, ctx) {
  const c = checks(n, ctx), base = baseLeds(n, ctx, c), stp = spanningTree(ctx);
  base.ports = n.ports.map((p, i) => { const st = portsState(n, ctx)[i]; if (stp.storm.has(n.id) && st.state === 'up') return led(st.name, 'green', 'fast'); if (stp.ports.get(p) === 'alternate') return led(st.name, 'amber', 'solid'); if (lagProblem(n, p, ctx.byId)) return led(st.name, 'amber', 'slow'); return led(st.name, st.led, st.blink || 'solid'); });
  const poe = poeState(n, ctx); if (poe.devices.length) base.front.push(led('PoE', poe.devices.some(d => !d.powered) ? 'amber' : 'green', poe.devices.some(d => !d.powered) ? 'slow' : 'solid'));
  return base;
}
const errFor = (f, word) => f === 'fortiswitch' ? ERR.fortios : f === 'nxos' ? ERR.cisco : f === 'aoscx' ? ERR.aoscx.replace('%s', word) : ERR.os10;
export function cli(n, cmd, session, ctx) {
  const text = cmd.trim(), lower = text.toLowerCase().replace(/\s+/g, ' '), f = productProfile(n).family, stp = spanningTree(ctx);
  if (lower === 'show spanning-tree' || lower === 'show spanning-tree brief' || lower === 'diagnose stp instance list' || lower === 'get switch stp settings' || lower === 'show spanning-tree summary') {
    if (n.net.stp === false) return 'Spanning tree is disabled on ' + (n.net.hostname || n.id) + (stp.storm.has(n.id) ? '\n%STP-2-LOOP: broadcast storm detected on ' + stp.loops.join(', ') : '');
    const rows = n.ports.filter(p => stp.ports.has(p)).map(p => [p.alias || p.name, stp.ports.get(p) === 'root' ? 'Root' : stp.ports.get(p) === 'alternate' ? 'Altn' : 'Desg', stp.ports.get(p) === 'alternate' ? 'BLK' : 'FWD', costOf(p.speed), p.cfg?.lag ? 'Po' + p.cfg.lag : 'P2p']);
    return ['VLAN0001 (RSTP, instance 0)', '  Root ID    Priority ' + (stp.rootId?.split('.')[0] || '-'), '             Address  ' + (stp.rootId?.split('.')[1] || '-') + (stp.root === n.id ? '\n             This bridge is the root' : ' (' + stp.root + ')'), '  Bridge ID  Priority ' + (n.net.stpPriority ?? 32768), '             Address  ' + mac(n), '', table(['Interface', 'Role', 'Sts', 'Cost', 'Type'], rows, [16, 5, 4, 8, 5])].join('\n');
  }
  if (lower === 'show mac address-table' || lower === 'show mac-address-table' || lower === 'diagnose switch mac-address list' || lower === 'show mac-address-table dynamic') { const rows = macTable(n, ctx); return rows.length ? table(['VLAN', 'MAC Address', 'Type', 'Port'], rows.map(r => [r.vlan, r.mac, r.type.toUpperCase(), r.port]), [6, 19, 9, 18]) + '\nTotal MAC addresses: ' + rows.length : 'No MAC addresses learned (no endpoint traffic reaches this switch).'; }
  if (lower === 'show interfaces status' || lower === 'show interface status' || lower === 'show interface brief' || lower === 'diagnose switch physical-ports summary') {
    const ps = portsState(n, ctx);
    return table(['Port', 'Status', 'VLAN', 'Speed', 'Reason'], n.ports.filter(p => !p.service && p.medium !== 'Internal').map(p => { const st = ps[n.ports.indexOf(p)], lp = lagProblem(n, p, ctx.byId); return [p.alias || p.name, p.cfg?.admin === false ? 'disabled' : st.state === 'up' && !lp ? (stp.ports.get(p) === 'alternate' ? 'blocking' : 'connected') : st.state === 'flapping' ? 'flapping' : st.state === 'err' || lp ? 'err-disabled' : 'notconnect', p.cfg?.mode === 'trunk' ? 'trunk' : p.cfg?.access ?? '-', st.state === 'up' ? p.speed + 'G' : 'auto', lp || (st.state === 'up' ? '' : st.reason)]; }), [16, 13, 6, 6, 60]);
  }
  if (lower === 'show interfaces transceiver' || lower === 'show interface transceiver details' || lower === 'show interfaces transceiver details' || lower === 'show transceiver') return portsState(n, ctx).filter(p => p.connector !== 'RJ45' && p.connector !== 'RJ45 console').map(p => p.name + '\n    transceiver ' + (p.optic || 'not present') + (p.optic ? '\n    Rx power ' + (p.rx ?? 'n/a') + ' dBm (low alarm −11.1)' + (p.code === 'transceiver' ? '\n    %ETHPORT-5-IF_SFP_UNSUPPORTED: unsupported transceiver, port err-disabled' : p.code === 'dirty' ? '\n    ALARM: Rx power low · link flaps' : '') : '')).join('\n') || 'No SFP/QSFP cages populated.';
  if (lower === 'show interfaces counters errors' || lower === 'show interface counters errors' || lower === 'diagnose switch physical-ports stats') { const ps = portsState(n, ctx); return table(['Port', 'Align-Err', 'FCS-Err', 'Rcv-Err', 'Flaps'], n.ports.filter(p => !p.service && p.link).map(p => { const c = errorCounters(p.link); return [p.alias || p.name, 0, c.crc, c.crc, c.flaps]; }), [16, 10, 10, 10, 6]); }
  if (lower === 'show port-channel summary' || lower === 'show lacp neighbor' || lower === 'show lacp interface' || lower === 'diagnose switch trunk list' || lower === 'show interface port-channel') { const lags = [...new Set(n.ports.map(p => p.cfg?.lag).filter(x => x !== undefined && x !== null && x !== ''))]; if (!lags.length) return 'No port-channels configured.'; return 'Flags: P - bundled in port-channel, s - suspended, D - down\n' + lags.map(g => 'Po' + g + '  ' + lagMembers(n, g).map(p => { const why = lagProblem(n, p, ctx.byId); return (p.alias || p.name) + '(' + (!p.link || p.link.unplugged ? 'D' : why ? 's' : 'P') + ')' + (why ? ' ' + why : ''); }).join('\n       ')).join('\n'); }
  if (lower === 'show power inline' || lower === 'get switch poe inline-status' || lower === 'show poe') { const poe = poeState(n, ctx); return 'Available: ' + poe.budget + ' W  Used: ' + poe.used.toFixed(1) + ' W  Remaining: ' + (poe.budget - poe.used).toFixed(1) + ' W' + (poe.injector ? '  (PoE injectors / facility budget)' : '') + '\n' + table(['Port', 'Device', 'Priority', 'Power', 'State'], poe.devices.map(d => [d.name, d.device, d.priority, d.powered ? d.watts + ' W' : '0 W', d.powered ? 'on' : 'off · budget exceeded']), [16, 16, 9, 8, 24]); }
  if (lower === 'show configuration status' || lower === 'show running-config diff' || lower === 'show running-config | diff') { const u = unsaved(n); return u ? '%% ' + u : 'Running configuration is saved.'; }
  let m;
  if (lower === 'spanning-tree disable' || lower === 'no spanning-tree' || lower === 'no spanning-tree vlan 1-4094' || lower === 'set status disable' && session?.fortiSection === 'config switch stp settings') { if (!session?.config && f !== 'fortiswitch') return errFor(f, 'spanning-tree') + '\n(enter configure terminal first)'; return { change: { type: 'cli-state', node: n.id, op: 'global', value: { stp: false } } }; }
  if (lower === 'spanning-tree enable' || lower === 'spanning-tree mode rstp' || lower === 'spanning-tree mode rapid-pvst' || lower === 'set status enable' && session?.fortiSection === 'config switch stp settings') { if (!session?.config && f !== 'fortiswitch') return errFor(f, 'spanning-tree') + '\n(enter configure terminal first)'; return { change: { type: 'cli-state', node: n.id, op: 'global', value: { stp: true } } }; }
  if (lower === 'config switch stp settings') { session.config = true; session.fortiSection = lower; return (n.net.hostname || n.id) + ' (settings) #'; }
  if ((m = /^spanning-tree priority (\d+)$/i.exec(text)) || (m = /^spanning-tree vlan 1-4094 priority (\d+)$/i.exec(text))) { if (+m[1] % 4096) return '% Bridge priority must be in increments of 4096.'; return { change: { type: 'cli-state', node: n.id, op: 'global', value: { stpPriority: +m[1] } } }; }
  if ((m = /^(?:power inline budget|set poe-power-budget) (\d+)$/i.exec(text))) return { change: { type: 'cli-state', node: n.id, op: 'global', value: { poeBudget: +m[1] } } };
  if (Number.isInteger(session?.interface) && session.interface >= 0) {
    if ((m = /^channel-group (\d+) mode (active|passive|on)$/i.exec(text))) return { change: { type: 'cli-state', node: n.id, op: 'interface', index: session.interface, value: { lag: +m[1], lacp: m[2].toLowerCase() } } };
    if (lower === 'no channel-group') return { change: { type: 'cli-state', node: n.id, op: 'interface', index: session.interface, value: { lag: '', lacp: '' } } };
    if ((m = /^speed (auto|\d+)$/i.exec(text))) return { change: { type: 'cli-state', node: n.id, op: 'interface', index: session.interface, value: { speed: m[1] === 'auto' ? '' : +m[1] } } };
    if ((m = /^power inline priority (low|high|critical)$/i.exec(text))) return { change: { type: 'cli-state', node: n.id, op: 'interface', index: session.interface, value: { poePriority: m[1].toLowerCase() } } };
  }
  return null;
}
export function unknown(n, cmd) { const f = productProfile(n).family; return errFor(f, cmd.trim().split(/\s+/)[0]); }
export function gui(n, ctx) {
  const st = state(n, ctx), stp = spanningTree(ctx), f = firstFailure(checks(n, ctx)), mt = macTable(n, ctx), poe = st.poe;
  const pages = {
    'sw-ports': { group: 'Switch', title: 'Ports', tables: [{ title: 'Physical ports', heads: ['Port', 'Link', 'VLAN', 'STP', 'LACP', 'Reason'], rows: n.ports.filter(p => !p.service && p.medium !== 'Internal').map(p => { const s2 = st.ports[n.ports.indexOf(p)]; return [p.alias || p.name, s2.state, p.cfg?.mode === 'trunk' ? 'trunk ' + (p.cfg.allowed || []).join(',') + ' native ' + (p.cfg.native || 1) : 'access ' + (p.cfg?.access ?? '-'), stp.ports.get(p) || '—', p.cfg?.lag ? 'Po' + p.cfg.lag + ' ' + (lagProblem(n, p, ctx.byId) ? 'suspended' : 'bundled') : '—', lagProblem(n, p, ctx.byId) || (s2.state === 'up' ? '' : s2.reason)]; }) }] },
    'sw-vlans': { group: 'Switch', title: 'VLANs', tables: [{ title: 'VLAN database', heads: ['VLAN', 'Name', 'Ports'], rows: Object.entries(n.net.vlans || {}).map(([id, name]) => [id, name, n.ports.filter(p => p.cfg && !p.service && (p.cfg.mode === 'trunk' ? (p.cfg.allowed || []).includes(+id) : p.cfg.access === +id)).map(p => p.alias || p.name).slice(0, 8).join(', ')]) }] },
    'sw-stp': { group: 'Switch', title: 'Spanning tree', tables: [{ title: 'RSTP · root bridge ' + (stp.root || 'none') + (st.stp.isRoot ? ' (this switch)' : ''), heads: ['Port', 'Role', 'State'], rows: n.ports.filter(p => stp.ports.has(p)).map(p => [p.alias || p.name, stp.ports.get(p), stp.ports.get(p) === 'alternate' ? 'blocking' : 'forwarding']) }], notes: [n.net.stp === false ? 'Spanning tree DISABLED on this switch' + (stp.storm.has(n.id) ? ' · BROADCAST STORM on ' + stp.loops.join(', ') : '') : 'RSTP enabled · priority ' + (n.net.stpPriority ?? 32768)] },
    'sw-mac': { group: 'Monitor', title: 'MAC address table', tables: [{ title: mt.length + ' learned addresses', heads: ['VLAN', 'MAC', 'Port', 'Learned from'], rows: mt.map(r => [r.vlan, r.mac, r.port, r.who]) }] },
    'sw-poe': { group: 'Monitor', title: 'PoE', tables: [{ title: 'Budget ' + poe.budget + ' W · used ' + poe.used.toFixed(1) + ' W', heads: ['Port', 'Device', 'Priority', 'Power', 'State'], rows: poe.devices.map(d => [d.name, d.device, d.priority, d.watts + ' W', d.powered ? 'delivering' : 'OFF · budget exceeded']) }] },
  };
  return { summary: [['Management', n.net.ip === '0.0.0.0' ? 'console only' : n.net.ip, n.net.ip === '0.0.0.0' ? 'warn' : 'ok'], ['STP', n.net.stp === false ? 'disabled' : st.stp.isRoot ? 'root bridge' : 'root ' + (stp.root || '-'), stp.storm.has(n.id) ? 'crit' : ''], ['Config', st.unsaved ? 'unsaved changes' : 'saved', st.unsaved ? 'warn' : 'ok'], ['Health', st.health, st.health === 'ok' ? 'ok' : st.health === 'warning' ? 'warn' : 'crit']], blocking: f, pages };
}
export const faults = [
  { id: 'stp-loop', label: 'Loop with spanning tree disabled', check: 'stp-storm', family: 'switch' },
  { id: 'lacp-mismatch', label: 'Port-channel member VLAN mismatch', check: 'lacp', family: 'switch' },
  { id: 'native-vlan', label: 'Native VLAN mismatch on a trunk', check: 'native-vlan', family: 'switch' },
  { id: 'mtu-mismatch', label: 'MTU mismatch on an inter-switch link', check: 'port-mtu', family: 'switch' },
  { id: 'wrong-optic', label: 'Wrong optic in a fiber port', check: 'port-transceiver', family: 'switch' },
  { id: 'dirty-fiber', label: 'Dirty fiber connector', check: 'port-dirty', family: 'switch' },
];
// Commands this module answers (used by ? and Tab in the laptop terminal).
export const commands = ['show spanning-tree', 'show spanning-tree brief', 'diagnose stp instance list', 'get switch stp settings', 'show spanning-tree summary', 'show mac address-table', 'show mac-address-table', 'diagnose switch mac-address list', 'show mac-address-table dynamic', 'show interfaces status', 'show interface status', 'show interface brief', 'diagnose switch physical-ports summary', 'show interfaces transceiver', 'show interface transceiver details', 'show interfaces transceiver details', 'show transceiver', 'show interfaces counters errors', 'show interface counters errors', 'diagnose switch physical-ports stats', 'show port-channel summary', 'show lacp neighbor', 'show lacp interface', 'diagnose switch trunk list', 'show interface port-channel', 'show power inline', 'get switch poe inline-status', 'show poe', 'show configuration status', 'show running-config diff', 'show running-config | diff', 'spanning-tree disable', 'no spanning-tree', 'no spanning-tree vlan 1-4094', 'set status disable', 'spanning-tree enable', 'spanning-tree mode rstp', 'spanning-tree mode rapid-pvst', 'set status enable', 'config switch stp settings', 'no channel-group', 'channel-group <n> mode active', 'power inline priority low|high|critical', 'power inline budget <watts>', 'spanning-tree priority <n>', 'spanning-tree vlan 1-4094 priority <n>', 'speed auto|<mbps>'];
export default { family: 'switch', match: n => n.type === 'switch', state, checks, leds, cli, gui, faults, commands, unknown };
