// FortiAP logic. APs live in the company model (office state) and are addressed by their AP record.
//
// State machine: no PoE ──PoE budget / injector──▶ booting ──DHCP in the management VLAN──▶
//   discovering the FortiGate (CAPWAP over the management VLAN) ──authorize on the FortiGate──▶
//   online, broadcasting its SSIDs; each SSID maps to a VLAN that the switch port must carry.
// Clients join an SSID → DHCP in that SSID's VLAN → normal path evaluation.
import { chk, warn, ordered, firstFailure, led, table } from './common.js';
import { poeState } from './switch.js';

const switchOf = (ap, ctx) => ctx.byId[ctx.office.state.bindings.access[ap.floor]];
export function poeFor(ap, ctx) { const sw = switchOf(ap, ctx); if (!sw) return { powered: false, reason: 'no access switch' }; const d = poeState(sw, ctx).devices.find(x => x.device === ap.id); return d ? { powered: d.powered, reason: d.reason || 'PoE ' + d.watts + ' W on ' + sw.id + ' / ' + d.name, watts: d.watts } : { powered: false, reason: ap.poe === false || ctx.office.state.ports[ap.id]?.poe === false ? 'PoE disabled on the switch port' : 'no PoE on this port' }; }
export function state(ap, ctx) {
  const o = ctx.office, s = o.state, st = o.apStatus(ap), sw = switchOf(ap, ctx), port = sw?.ports[ap.port], poe = poeFor(ap, ctx), ssids = String(ap.profile || '').split(',').map(x => x.trim()).filter(Boolean).map(id => ({ id, vlan: s.ssids[id]?.vlan, enabled: !!s.ssids[id]?.enabled, carried: !!port && (port.cfg.mode === 'trunk' ? port.cfg.allowed.includes(s.ssids[id]?.vlan) : port.cfg.access === s.ssids[id]?.vlan) }));
  const clients = Object.values(s.pcs).filter(p => p.mode === 'Wi-Fi' && o.access(p).ap === ap.id).map(p => p.id);
  const v = s.vlans[ap.mgmtVlan], ip = v?.enabled && s.dhcp[ap.mgmtVlan]?.enabled ? v.ip.split('.').slice(0, 3).join('.') + '.' + (200 + Object.keys(s.aps).indexOf(ap.id)) : null;
  const c = checks(ap, ctx);
  return { id: ap.id, model: ap.model, status: st, poe, ip, ssids, clients, channel: ap.channel, tx: ap.tx, switch: sw?.id, port: port?.name, health: firstFailure(c) ? (firstFailure(c).severity === 'warning' ? 'warning' : 'critical') : 'ok', alarms: c.filter(x => !x.ok).map(x => ({ id: ap.id + ':' + x.id, device: ap.id, severity: x.severity, kind: 'wireless', check: x.id, layer: x.layer, message: x.detail, fixHint: x.fixHint, where: x.where })) };
}
export function checks(ap, ctx) {
  const o = ctx.office, s = o.state, sw = switchOf(ap, ctx), port = sw?.ports[ap.port], poe = poeFor(ap, ctx), status = o.apStatus(ap);
  const out = [chk('poe', 'power', poe.powered, ap.id + ' has no PoE power · ' + poe.reason, 'Enable PoE on the port / raise the PoE budget / use an injector', 'fg-aps')];
  out.push(chk('uplink', 'link', !!port && port.cfg.admin !== false, ap.id + ' uplink ' + (sw?.id || '?') + ' / ' + (port?.name || '?') + ' is ' + (!port ? 'missing' : 'shut down'), 'Enable the switch port', 'fg-aps'));
  out.push(chk('capwap', 'l3', !/CAPWAP/.test(status) , ap.id + ' cannot reach the FortiGate controller (CAPWAP) on management VLAN ' + ap.mgmtVlan + ' · no DHCP address / no path', 'Carry VLAN ' + ap.mgmtVlan + ' on the AP port and enable DHCP on VLAN ' + ap.mgmtVlan, 'fg-aps'));
  out.push(chk('authorized', 'service', ap.authorized, ap.id + ' discovered by the FortiGate but NOT authorized · no SSIDs are broadcast', 'WiFi & Switch Controller → Managed FortiAPs → Authorize', 'fg-aps'));
  out.push(chk('radio', 'service', ap.enabled, ap.id + ' radio disabled', 'Enable the radio', 'fg-aps'));
  for (const x of String(ap.profile || '').split(',').map(y => y.trim()).filter(Boolean)) { const ss = s.ssids[x]; if (!ss) continue; out.push(warn('ssid-' + x, 'l2', !port || (port.cfg.mode === 'trunk' ? port.cfg.allowed.includes(ss.vlan) : port.cfg.access === ss.vlan), 'SSID ' + x + ' maps to VLAN ' + ss.vlan + ' but ' + (sw?.id || '') + ' / ' + (port?.name || '') + ' does not carry it · clients get no DHCP', 'Add VLAN ' + ss.vlan + ' to the AP trunk', 'fg-aps')); }
  out.push(warn('interference', 'application', (ap.interference || 0) < 60, ap.id + ' channel ' + ap.channel + ' has ' + ap.interference + ' % interference · clients drop', 'Change the channel or reduce the interference', 'fg-aps'));
  return ordered(out);
}
export function leds(ap, ctx) { const st = state(ap, ctx); return { front: [led('PWR', st.poe.powered ? 'green' : 'off'), led('STATUS', !st.poe.powered ? 'off' : st.status === 'Online' ? 'green' : 'amber', st.status === 'Online' ? 'solid' : 'slow'), led('2.4G', st.status === 'Online' ? 'green' : 'off', 'activity'), led('5G', st.status === 'Online' ? 'green' : 'off', 'activity')], psu: [], ports: [] }; }
export function alarms(ctx) { if (!ctx.office) return []; return Object.values(ctx.office.state.aps).flatMap(ap => state(ap, ctx).alarms); }
export function cli(ap, cmd, session, ctx) {
  const lower = cmd.trim().toLowerCase(), st = state(ap, ctx);
  if (lower === 'cw_diag -c wtp-cfg' || lower === 'cfg -s') return 'WTP_NAME:=' + ap.id + '\nAC_DISCOVERY_TYPE:=DHCP\nWTP MGMT VLAN:=' + ap.mgmtVlan + '\nAddress:=' + (st.ip || '0.0.0.0') + '\nConnection state:=' + (st.status === 'Online' ? 'RUN' : st.status) + '\nSSIDs:=' + st.ssids.map(x => x.id + '(vlan ' + x.vlan + ')').join(' ');
  return 'Unknown action 0';
}
export function gui(ap, ctx) { const st = state(ap, ctx); return { summary: [['Status', st.status, st.status === 'Online' ? 'ok' : 'crit'], ['PoE', st.poe.powered ? 'powered' : 'off', st.poe.powered ? 'ok' : 'crit'], ['IP', st.ip || '—', '']], blocking: firstFailure(checks(ap, ctx)), pages: {} }; }
export const faults = [{ id: 'ap-unauthorized', label: 'AP not authorized', check: 'authorized', family: 'access-point' }, { id: 'poe-budget', label: 'PoE budget exceeded', check: 'poe', family: 'access-point' }];
// Commands this module answers (used by ? and Tab in the laptop terminal).
export const commands = ['cw_diag -c wtp-cfg', 'cfg -s'];
export default { family: 'access-point', match: n => n.type === 'ap', state, checks, leds, cli, gui, faults, commands, alarms };
