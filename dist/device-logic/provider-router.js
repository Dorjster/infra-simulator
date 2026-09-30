// ISP provider router (CPE), provider-owned and read-only to the customer.
//
// State machine: no input ──cord──▶ booting (4 s) ──▶ running ── FIBER-IN light? ──▶ LOS (red) / in sync.
// The provider side runs the circuit logic:
//   static /30 or /29 → the provider gateway answers ARP only for the WAN address on the circuit sheet;
//   DHCP              → the lease is given to the MAC of the FortiGate port cabled to LAN1/SFP1;
//   PPPoE             → the session comes up only with the sheet credentials; 3 wrong attempts lock
//                       the account for 30 s (shown in the provider log).
// Provider events (challenge only): maintenance / IP change notice with a new circuit sheet, PPPoE
// password change. LAN LEDs follow link state; LOS is red on a fiber fault.
import { chk, ordered, firstFailure, healthOf, baseChecks, alarmsFrom, portsState, powerState, bootState, led, peerOf, physicalOffline, configuredProduct } from './common.js';

export function circuitOf(n, ctx) { const list = ctx.nodes.filter(x => x.active !== false && x.net?.ispContract?.id === n.spec?.contract), fw = list.find(x => x.net.ispContract.cpe === n.id) || list[0]; return { fw, c: fw?.net.ispContract }; }
const handoffPorts = n => n.ports.filter(p => /^(LAN\d|SFP1)$/.test(p.name));
export function state(n, ctx) {
  const c = checks(n, ctx), { fw, c: circuit } = circuitOf(n, ctx), los = !!n.physical?.faults?.los;
  return { power: powerState(n), boot: bootState(n), mgmt: { ip: 'provider managed', customerLogin: false }, health: healthOf(c), ports: portsState(n, ctx), services: circuit ? [{ id: circuit.mode || 'Static', running: !!fw && ctx.network.wanStatus(fw).ok }] : [], fiber: los ? 'LOS' : 'in sync', circuit, firewall: fw?.id || null, alarms: alarmsFrom(n, c, 'isp') };
}
export function checks(n, ctx) {
  const out = baseChecks(n, ctx), { fw, c } = circuitOf(n, ctx), los = !!n.physical?.faults?.los;
  out.push(chk('los', 'link', !los, 'FIBER-IN: LOS (no light from the provider network) · the provider must repair the fiber', 'Open a provider ticket: aim at the provider router → [V] Provider ticket', 'overview'));
  const patched = handoffPorts(n).find(p => p.link && !p.link.unplugged);
  out.push(chk('handoff', 'link', !!patched && !patched.link.disabled, !patched ? 'LAN1 / SFP1 handoff is not patched to the customer firewall' : 'Handoff ' + patched.name + ' link is down (' + (physicalOffline(ctx.byId[peerOf(n, patched).id]) ? 'firewall off' : 'port down on the far end') + ')', 'Patch LAN1 (1G) or SFP1 (10G) to a free FortiGate WAN port', 'overview'));
  if (fw && c) {
    const w = configuredProduct(fw).wan, st = ctx.network.wanStatus(fw);
    if (c.mode === 'PPPoE') { const locked = c.pppoe?.lockedUntil > Date.now(); out.push(chk('pppoe', 'l3', !locked && (st.ok || !/PPPoE/.test(st.reason)), locked ? 'PPPoE account ' + c.pppoe.user + ' locked for ' + Math.ceil((c.pppoe.lockedUntil - Date.now()) / 1000) + ' s after 3 failed logins' : st.reason, 'Enter the PPPoE username/password from the circuit sheet on the FortiGate WAN page', 'overview')); }
    else if (c.mode === 'DHCP') out.push(chk('dhcp', 'l3', st.ok || !/DHCP/.test(st.reason), st.reason, 'Configure the FortiGate WAN for DHCP on the cabled port', 'overview'));
    else out.push(chk('arp', 'l3', !w.ip || w.ip === c.ip || !patched, 'Provider gateway ' + c.gateway + ' does not answer ARP for ' + w.ip + ' · it only serves ' + c.ip + ' (circuit sheet)', 'Use the WAN address from the circuit sheet', 'overview'));
  }
  return ordered(out);
}
export function leds(n, ctx) {
  const pw = powerState(n), up = !physicalOffline(n), los = !!n.physical?.faults?.los;
  const { fw } = circuitOf(n, ctx), patched = handoffPorts(n).some(p => p.link && !p.link.unplugged && !p.link.disabled), svc = !up || los || !fw || !patched ? 'off' : ctx.network.wanStatus(fw).ok ? 'green' : 'red';
  return { front: [led('PWR', pw.live ? 'green' : 'off'), led('FIBER', !up ? 'off' : los ? 'red' : 'green', los ? 'slow' : 'solid'), led('LOS', up && los ? 'red' : 'off'), led('SERVICE', svc, svc === 'red' ? 'slow' : 'solid'), ...handoffPorts(n).map(p => led(p.name, up && p.link && !p.link.unplugged && !p.link.disabled ? 'green' : 'off', 'activity'))], psu: pw.psus.map(x => led(x.id, x.led)), ports: portsState(n, ctx).map(p => led(p.name, p.led, p.blink || 'solid')) };
}
export function cli(n, cmd) {
  const lower = cmd.trim().toLowerCase();
  if (lower === 'status' || lower === 'help' || lower === '?') return null;
  return '% Access denied · provider-managed equipment (no customer login). Use the status page and the circuit sheet.';
}
export function gui(n, ctx) {
  const st = state(n, ctx), c = st.circuit, f = firstFailure(checks(n, ctx));
  return {
    summary: [['Circuit', c ? c.id + ' · ' + (c.planName || '') : 'unassigned', ''], ['Fiber', st.fiber, st.fiber === 'LOS' ? 'crit' : 'ok'], ['Customer firewall', st.firewall || '—', ''], ['Health', st.health, st.health === 'ok' ? 'ok' : 'crit']],
    blocking: f,
    pages: { 'isp-log': { group: 'Provider router', title: 'Provider log', tables: [{ title: 'Circuit events', heads: ['Time', 'Event'], rows: (c?.log || []).map(x => [new Date(x.at).toLocaleTimeString(), x.text]) }], notes: c?.notice ? ['Provider notice: ' + c.notice] : [] } }
  };
}
export const faults = [
  { id: 'cpe-power', label: 'Provider router power cord pulled', check: 'power-input', family: 'provider-router' },
  { id: 'fiber-los', label: 'Provider fiber cut (LOS)', check: 'los', family: 'provider-router' },
  { id: 'pppoe-password', label: 'Provider changed the PPPoE password', check: 'pppoe', family: 'provider-router' },
  { id: 'isp-ip-change', label: 'Provider IP change (new circuit sheet)', check: 'wan-l3', family: 'provider-router' },
];
export default { family: 'provider-router', match: n => n.type === 'isp', state, checks, leds, cli, gui, faults };
