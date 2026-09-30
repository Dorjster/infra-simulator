// Fibre Channel SAN switch logic (Connectrix B-Series / Fabric OS, factory SAN-A / SAN-B).
//
// State machine: no AC ──cord──▶ booting ──▶ online; management by serial console (ipaddrset).
// Fabric: every FC port with light and a peer logs in (FLOGI) and appears in the name server
// (nsshow) with its WWPN. Access needs zoning: aliases → zones → a configuration that is enabled
// (cfgenable). With no effective configuration, initiators see no targets. Fabric A and fabric B are
// separate switches that must never be cabled together (an ISL would merge the fabrics).
import { chk, warn, ordered, firstFailure, healthOf, baseChecks, managementCheck, baseLeds, alarmsFrom, portsState, powerState, bootState, led, table, peerOf, physicalOffline, configuredProduct } from './common.js';
import { hostIdentifiers } from '../storage-access.js';

export function fabric(n) { const f = configuredProduct(n).fabric; if (f) return f; return { aliases: {}, zones: {}, configs: {}, members: [], enabled: !n.spec && !n.net.zoneDisabled, legacy: !n.spec, active: !n.spec ? (n.net.zone || 'FACTORY-CFG') : '' }; }
export function logins(n, ctx) {
  const out = [];
  n.ports.forEach((p, i) => {
    if (p.medium !== 'Fibre Channel') return; const st = portsState(n, ctx)[i], peer = peerOf(n, p); if (!peer || st.state !== 'up') return;
    const other = ctx.byId[peer.id], ids = hostIdentifiers(other), side = /B$|-2$|FC-2|HBA-B/.test(peer.port.name) ? 'wwpnB' : 'wwpnA';
    out.push({ port: i, name: p.name, wwpn: ids[side], device: peer.id + ' / ' + peer.port.name, role: ['server', 'gpu'].includes(other.type) ? 'Initiator' : 'Target', speed: p.speed });
  });
  return out;
}
export function state(n, ctx) {
  const c = checks(n, ctx), f = fabric(n);
  return { power: powerState(n), boot: bootState(n), mgmt: { ip: n.net.ip, console: 'serial 9600 8N1' }, health: healthOf(c), ports: portsState(n, ctx), services: [{ id: 'name-server', running: !physicalOffline(n) }], fabric: { enabled: f.enabled, active: f.active || '', zones: Object.keys(f.zones || {}), members: f.members || [] }, logins: logins(n, ctx), alarms: alarmsFrom(n, c, 'san') };
}
export function checks(n, ctx) {
  const out = baseChecks(n, ctx), f = fabric(n), li = logins(n, ctx), ps = portsState(n, ctx);
  if (n.spec) out.push(managementCheck(n, ctx, 'console'));
  for (const code of ['transceiver', 'dirty', 'no-light', 'reach', 'fiber-type', 'length']) { const bad = ps.filter(p => p.code === code); out.push(chk('port-' + code, 'link', !bad.length, bad.map(p => n.id + ' / ' + p.name + ': ' + p.reason).join(' · '), 'Fix the optic / fiber on that port', 'console')); }
  const isl = n.ports.find(p => { const peer = peerOf(n, p); return peer && ctx.byId[peer.id]?.type === 'san'; });
  out.push(chk('fabric-separation', 'l2', !isl, 'ISL ' + n.id + ' ↔ ' + (isl ? peerOf(n, isl).id : '') + ' merges fabric A and fabric B into one failure domain', 'Remove the cable between the two SAN switches', 'console'));
  out.push(chk('zoning', 'l2', f.enabled || !li.length, 'No effective zoning configuration on ' + n.id + (f.legacy ? ' (cfgdisable)' : '') + ' · ' + li.length + ' logged-in device(s) cannot reach any target', 'cfgenable "<config>" (create aliases, zones and a config first)', 'console'));
  if (f.enabled && !f.legacy) { const missing = (f.members || []).filter(w => !li.some(l => l.wwpn === w)); out.push(warn('zone-members', 'l2', !missing.length, 'Zone member(s) not logged in to ' + n.id + ': ' + missing.join(', '), 'Check the cable / HBA of that member (nsshow)', 'console')); }
  return ordered(out);
}
export function leds(n, ctx) { return baseLeds(n, ctx, checks(n, ctx)); }
export function cli(n, cmd, session, ctx) {
  const text = cmd.trim(), lower = text.toLowerCase().replace(/\s+/g, ' '), f = fabric(n), li = logins(n, ctx);
  // cfgdisable asks for confirmation like Fabric OS; the next line answers it (y/yes applies).
  if (session.confirm) { const c = session.confirm; delete session.confirm; return /^(y|yes)$/.test(lower) ? { change: c.change, text: c.text + ' ' + lower } : c.text + ' ' + (lower || 'no') + '\nOperation cancelled · zoning configuration unchanged.'; }
  if (lower === 'switchshow') return ['switchName:     ' + (n.net.hostname || n.id), 'switchType:     170.3', 'switchState:    ' + (physicalOffline(n) ? 'Offline' : 'Online'), 'switchRole:     Principal', 'zoning:         ' + (f.enabled ? 'ON (' + (f.active || 'cfg') + ')' : 'OFF'), '', 'Index Port Speed  State       Proto', '==================================================', ...n.ports.filter(p => p.medium === 'Fibre Channel').map((p, i) => { const st = portsState(n, ctx)[n.ports.indexOf(p)], l = li.find(x => x.name === p.name); return String(i).padStart(4) + String(i).padStart(5) + '  N' + p.speed + '   ' + (p.cfg?.admin === false ? 'Disabled   ' : l ? 'Online     ' : st.code === 'transceiver' ? 'Mod_Inv    ' : 'No_Light   ') + ' FC  ' + (l ? 'F-Port  ' + l.wwpn : st.state !== 'up' && st.code !== 'no-cable' ? st.reason : ''); })].join('\n');
  if (lower === 'nsshow') return li.length ? '{\n Type Pid    COS     PortName                NodeName                 TTL(sec)\n' + li.map((l, i) => ' N    0' + (10 + i) + '00;    3;' + l.wwpn + ';' + l.wwpn.replace(/^10/, '20') + '; na\n    Device type: Physical ' + l.role + '\n    Port Index: ' + l.port + '\n    Connected: ' + l.device).join('\n') + '\nThe Local Name Server has ' + li.length + ' entries }' : 'There is no entry in the Local Name Server';
  if (lower === 'cfgshow' || lower === 'zoneshow') { if (f.legacy) return 'Defined configuration:\n cfg: ' + f.active + '\nEffective configuration:\n ' + (f.enabled ? 'cfg: ' + f.active : 'No Effective configuration: (No Access)'); return 'Defined configuration:\n' + Object.entries(f.configs || {}).map(([k, v]) => ' cfg:\t' + k + '\t' + v.join('; ')).join('\n') + '\n' + Object.entries(f.zones || {}).map(([k, v]) => ' zone:\t' + k + '\t' + v.join('; ')).join('\n') + '\n' + Object.entries(f.aliases || {}).map(([k, v]) => ' alias:\t' + k + '\t' + v.join('; ')).join('\n') + '\n\nEffective configuration:\n' + (f.enabled ? ' cfg:\t' + f.active + '\n' + (f.members || []).map(m => '\t\t' + m).join('\n') : ' No Effective configuration: (No Access)'); }
  if (lower === 'cfgdisable') { session.confirm = f.legacy ? { change: { type: 'zoning', node: n.id, enabled: false }, text: 'You are about to disable zoning configuration. Do you want to disable zoning configuration? (yes, y, no, n): [no]' } : { change: { type: 'product', node: n.id, op: 'fabric', value: { ...structuredClone(f), enabled: false, members: [] } }, text: 'You are about to disable zoning configuration. This action will disable any previous zoning configuration enabled.\nDo you want to disable zoning configuration? (yes, y, no, n): [no]' }; return session.confirm.text; }
  if (f.legacy && /^cfgenable/.test(lower)) return { change: { type: 'zoning', node: n.id, enabled: true }, text: 'You are about to enable a new zoning configuration. Do you want to enable \'' + f.active + '\' configuration (yes, y, no, n): [no] y' };
  if (lower === 'fabricshow') return ' Switch ID   Worldwide Name           Enet IP Addr    FC IP Addr      Name\n-------------------------------------------------------------------------\n  1: fffc01 10:00:c4:f5:7c:' + n.id.length.toString(16).padStart(2, '0') + ':00:01 ' + n.net.ip.padEnd(15) + ' 0.0.0.0        >"' + (n.net.hostname || n.id) + '"\n\nThe Fabric has 1 switch' + (checks(n, ctx).find(c => c.id === 'fabric-separation' && !c.ok) ? '\nWARNING: ISL to another fabric detected · fabrics merged' : '');
  if (lower === 'porterrshow') return '          frames      enc    crc    crc    too  too  bad  enc   disc  link  loss  loss  frjt  fbsy\n       tx     rx      in    err    g_eof  shrt long eof  out   c3    fail  sync  sig\n' + n.ports.filter(p => p.medium === 'Fibre Channel').map((p, i) => { const st = portsState(n, ctx)[n.ports.indexOf(p)]; return String(i).padStart(3) + ':  ' + (st.state === 'up' ? '1.2m   1.1m' : '0      0   ') + '   0    ' + String(st.counters.crc).padStart(5) + '  0      0    0    0    0     0     ' + st.counters.flaps + '     0     0'; }).join('\n');
  if (lower === 'sfpshow') return n.ports.filter(p => p.medium === 'Fibre Channel').map((p, i) => { const st = portsState(n, ctx)[n.ports.indexOf(p)]; return 'Port ' + i + ': id (sw) Vendor: BROCADE  ' + (p.optic ? 'Serial No: ' + p.optic + '  Speed: ' + p.speed + 'G  RX Power: ' + (st.rx ?? 'n/a') + ' dBm' : 'No SFP installed'); }).join('\n');
  return null;
}
export function unknown(n, cmd) { return 'rbash: ' + cmd.trim().split(/\s+/)[0] + ': command not found'; }
export function gui(n, ctx) {
  const st = state(n, ctx), f = firstFailure(checks(n, ctx));
  return { summary: [['Zoning', st.fabric.enabled ? 'effective: ' + (st.fabric.active || 'cfg') : 'OFF', st.fabric.enabled ? 'ok' : 'crit'], ['Logged in', String(st.logins.length), ''], ['Health', st.health, st.health === 'ok' ? 'ok' : st.health === 'warning' ? 'warn' : 'crit']], blocking: f, pages: { 'san-ns': { group: 'Fabric', title: 'Name server (FLOGI)', tables: [{ title: 'Logged-in devices', heads: ['Port', 'WWPN', 'Role', 'Device'], rows: st.logins.map(l => [l.name, l.wwpn, l.role, l.device]) }] }, 'san-zoning': { group: 'Fabric', title: 'Zoning', tables: [{ title: 'Effective configuration ' + (st.fabric.enabled ? st.fabric.active : '(none)'), heads: ['Member WWPN', 'Logged in'], rows: st.fabric.members.map(m => [m, st.logins.some(l => l.wwpn === m) ? 'yes' : 'no']) }] } } };
}
export const faults = [{ id: 'zoning-disabled', label: 'Zoning configuration disabled', check: 'zoning', family: 'san-switch' }];
// Commands this module answers (used by ? and Tab in the laptop terminal).
export const commands = ['switchshow', 'nsshow', 'cfgshow', 'zoneshow', 'cfgdisable', 'fabricshow', 'porterrshow', 'sfpshow', 'cfgenable <config>'];
export default { family: 'san-switch', match: n => n.type === 'san', state, checks, leds, cli, gui, faults, commands, unknown };
