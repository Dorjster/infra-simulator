// Device-logic contract shared by every family module.
//
// Each family module exports the same shape:
//   state(n, ctx)  → { power, boot, mgmt, health, ports[], services[], alarms[] }
//   checks(n, ctx) → ordered [{ id, layer, ok, detail, fixHint, where, severity }]
//   leds(n, ctx)   → { front:[{id,color,blink}], psu:[...], ports:[...] } driven by state()
//   cli(n, cmd, session, ctx) → vendor-style text or null (not handled)
//   gui(n, ctx)    → { summary:[[label,value,tone]], pages:{ id:{ group,title,tables,notes } } }
//   faults         → [{ id, label, check, inject(target, ctx), repair }]
//
// Checks run in layer order and the first failing *critical* check is "what is blocking"; warnings
// (redundancy lost, unsaved config, STP blocking…) are reported but never stop the chain.
// Every function here is a pure read of the shared world state (n.physical, n.net, links, office
// state, game.pdus). Nothing is stored except by the actions in operations / network / office.
import { physicalOffline } from '../operations.js';
import { psuFeeds, livePSUs, hasPower, trippedFeeds, drawWatts } from '../power-grid.js';
import { mediaFault, errorCounters, rxPower, parseOptic, connector } from '../media.js';
import { productProfile, configuredProduct } from '../product-profiles.js';
import { lagProblem } from '../lag.js';

export const LAYERS = ['physical', 'power', 'boot', 'management', 'link', 'l2', 'l3', 'service', 'application'];
export const chk = (id, layer, ok, detail, fixHint = '', where = '', severity = 'critical') => ({ id, layer, ok: !!ok, detail, fixHint, where, severity });
export const warn = (id, layer, ok, detail, fixHint = '', where = '') => chk(id, layer, ok, detail, fixHint, where, 'warning');
export function ordered(list) { return list.map((c, i) => [c, i]).sort((a, b) => LAYERS.indexOf(a[0].layer) - LAYERS.indexOf(b[0].layer) || a[1] - b[1]).map(x => x[0]); }
export const firstFailure = checks => checks.find(c => !c.ok && c.severity !== 'warning') || checks.find(c => !c.ok) || null;
export const healthOf = checks => { const f = firstFailure(checks); return !f ? 'ok' : f.severity === 'warning' ? 'warning' : 'critical'; };

// Per-epoch memo: the host / client logic tick (every 400 ms) and every world action advance the
// epoch, so GUIs, LEDs and alarms read one cached result per device per tick, never per frame.
let epoch = 0, stamp = 0;
export const LOGIC_TICK_MS = 400;
export const invalidate = () => { epoch++; stamp = Date.now(); };
export const currentEpoch = () => epoch;
const memoStore = new WeakMap();
export function memo(obj, key, fn) {
  if (Date.now() - stamp > LOGIC_TICK_MS) invalidate();
  let m = memoStore.get(obj);
  if (!m || m.epoch !== epoch) { m = { epoch, v: new Map() }; memoStore.set(obj, m); }
  if (!m.v.has(key)) m.v.set(key, fn());
  return m.v.get(key);
}

export const peerOf = (n, p) => (p.link && !p.link.unplugged ? (p.link.a === n.id ? { id: p.link.b, port: p.link.pb } : { id: p.link.a, port: p.link.pa }) : null);
export const isMgmtPort = p => !!p && (p.service || /MGMT|SERVICE|management/i.test(p.name) || /^mgmt/i.test(p.alias || ''));
export const dataPorts = n => n.ports.filter(p => !p.service && p.medium !== 'Internal' && p.medium !== 'Console');
export const label = (n, p) => n.id + ' / ' + (p.alias || p.name);
export const mac = (n, i = 0) => { let h = 7; for (const c of n.id) h = (h * 31 + c.charCodeAt(0)) >>> 0; const b = [0x00, 0x09, 0x0f, (h >>> 16) & 255, (h >>> 8) & 255, (h + i) & 255]; return b.map(x => x.toString(16).padStart(2, '0')).join(':'); };

// Physical port state: exactly one reason per port, shared by LEDs, CLI, GUI and checks.
export function portState(n, p, ctx) {
  const l = p.link, cfg = p.cfg || {};
  if (p.service) return { state: 'service', led: 'off', reason: p.attached ? 'laptop attached' : 'service port' };
  if (p.medium === 'Internal') return { state: 'internal', led: 'off', reason: 'backplane' };
  if (p.fault === 'optic') return { state: 'err', led: 'amber', blink: 'slow', reason: 'transceiver failed (no tx power)', code: 'optic-failed' };
  if (p.optic && !l && parseOptic(p.optic) && (parseOptic(p.optic).speed !== p.speed || parseOptic(p.optic).medium !== p.medium)) return { state: 'err', led: 'amber', blink: 'slow', reason: 'unsupported transceiver ' + p.optic, code: 'transceiver' };
  if (!l || l.unplugged) return { state: 'down', led: 'off', reason: cfg.admin === false ? 'administratively down' : 'no cable', code: 'no-cable' };
  if (cfg.admin === false) return { state: 'down', led: 'off', reason: 'administratively down', code: 'admin' };
  const peer = ctx.byId[l.a === n.id ? l.b : l.a], far = l.pa === p ? l.pb : l.pa;
  if (physicalOffline(n)) return { state: 'down', led: 'off', reason: 'device not running', code: 'self-off' };
  if (!peer || physicalOffline(peer)) return { state: 'down', led: 'off', reason: 'no link · far end ' + (peer?.id || '?') + ' has no power / not running', code: 'peer-off' };
  if (far.cfg?.admin === false) return { state: 'down', led: 'off', reason: 'no link · far end ' + label(peer, far) + ' is shut down', code: 'peer-admin' };
  if (l.fault && !['dirty', 'cut'].includes(l.fault)) return { state: 'err', led: 'amber', reason: 'port / optic fault', code: 'fault' };
  const m = mediaFault(l);
  if (m) return { state: m.code === 'dirty' ? 'flapping' : 'err', led: m.led, blink: m.code === 'dirty' ? 'fast' : 'slow', reason: m.text.startsWith(p.name + ': ') ? m.text.slice(p.name.length + 2) : m.text, code: m.code };
  const x = cfg, y = far.cfg || {};
  if ((x.mtu || 1500) !== (y.mtu || 1500)) return { state: 'err', led: 'amber', reason: 'MTU mismatch ' + (x.mtu || 1500) + ' ≠ ' + (y.mtu || 1500) + ' with ' + label(peer, far), code: 'mtu' };
  const lp = lagProblem(n, p, ctx.byId) || lagProblem(peer, far, ctx.byId);
  if (lp) return { state: 'err', led: 'amber', blink: 'slow', reason: 'Po' + (cfg.lag || far.cfg?.lag) + ' member ' + lp, code: 'lacp' };
  if (l.disabled) { const vl = c => c.mode === 'trunk' ? 'trunk ' + (c.allowed || []).join(',') : 'access ' + c.access; return { state: 'down', led: 'amber', reason: p.medium === 'Fibre Channel' ? 'link down · zoning / fabric mismatch with ' + label(peer, far) : 'link down · VLAN mismatch ' + vl(x) + ' ↔ ' + vl(y) + ' with ' + label(peer, far), code: 'config' }; }
  return { state: 'up', led: 'green', blink: 'activity', reason: 'up ' + (Math.min(p.speed, far.speed) >= 1 ? Math.min(p.speed, far.speed) + 'G' : '') + ' → ' + label(peer, far), code: 'up', peer: peer.id, far };
}
export function portsState(n, ctx) { return n.ports.map((p, i) => ({ index: i, name: p.alias || p.name, ...portState(n, p, ctx), counters: errorCounters(p.link), rx: rxPower(p, p.link), optic: p.optic || null, connector: connector(p) })); }

// PSU view: cord, live input and LED colour for each supply.
export function psus(n) {
  const feeds = psuFeeds(n).slice(0, n.type === 'isp' ? 1 : 2), live = livePSUs(n);
  return feeds.map((f, i) => {
    const failed = n.physical?.fault === 'psu' && i === 1;
    const state = failed ? 'failed' : !f ? 'no cord' : !live.includes(i) ? 'no input (PDU ' + n.rack + '-' + f + ' tripped)' : 'ok';
    return { id: 'PSU ' + (i + 1), feed: f, state, led: state === 'ok' ? 'green' : live.length ? 'amber' : 'off', blink: failed ? 'slow' : 'solid' };
  });
}
export function powerState(n) {
  const list = psus(n), live = list.filter(p => p.state === 'ok').length;
  return { psus: list, live, redundant: live >= 2 && new Set(list.filter(p => p.state === 'ok').map(p => p.feed)).size >= 2, on: hasPower(n) && (!n.physical || !!n.physical.on), watts: drawWatts(n, physicalOffline(n)), tripped: trippedFeeds(n) };
}
export function bootState(n) {
  const p = n.physical, now = Date.now();
  if (!hasPower(n)) return { phase: 'off', text: 'No AC input' };
  if (p && !p.on) return { phase: 'standby', text: 'Standby power (management controller alive, host off)' };
  if (p?.bootUntil > now) return { phase: 'post', text: 'Booting · ' + Math.ceil((p.bootUntil - now) / 1000) + ' s' };
  if (['dimm', 'controller', 'nic'].includes(p?.fault)) return { phase: 'fault', text: 'Hardware fault · ' + p.fault };
  return { phase: 'running', text: 'Running' };
}
// Common physical → power → boot → management checks for every rack device.
export function baseChecks(n, ctx, { standbyManagement = false, where = { power: 'power', mgmt: 'management' } } = {}) {
  const out = [], pw = powerState(n), boot = bootState(n), p = n.physical || {};
  out.push(chk('installed', 'physical', n.active !== false, n.id + ' is not installed in a rack', 'Mount it on rails in a free rack position', 'rack'));
  out.push(warn('airflow', 'physical', !p.reversed, n.id + ' is mounted backwards · hot exhaust feeds the inlet (inlet 41 °C > 35 °C warning) · performance throttled', 'Power it off, then aim at it → [V] Re-mount front-to-back', 'rack'));
  const cords = pw.psus.filter(x => x.feed).length;
  out.push(chk('power-input', 'power', pw.live > 0, !cords ? 'No PSU has a power cord · device has no AC input' : pw.tripped.length ? 'All PSUs are on tripped PDU breaker(s) ' + [...new Set(pw.tripped)].map(f => n.rack + '-' + f).join(', ') + ' · no AC input' : 'PSU cords present but no live input', pw.tripped.length ? 'Reduce the rack load, then reset the PDU breaker (Monitoring → Power / PDUs)' : 'Connect a PSU cord to rack PDU A or B', where.power));
  if (pw.psus.length >= 2) out.push(warn('psu-redundancy', 'power', pw.redundant, pw.psus.map(x => x.id + ' ' + x.state).join(' · ') + ' · 1+1 redundancy lost', 'Connect PSU 1 to PDU A and PSU 2 to PDU B (different feeds)', where.power));
  if (standbyManagement) out.push(chk('host-power', 'boot', pw.live === 0 || !n.physical || p.on, n.id + ' host is off (standby: management controller only)', 'Press the front power button or use Power control in the management GUI', 'overview'));
  out.push(chk('boot', 'boot', pw.live === 0 || boot.phase === 'running' || boot.phase === 'standby', boot.phase === 'post' ? n.id + ' is booting (' + boot.text + ')' : n.id + ' ' + boot.text, boot.phase === 'fault' ? 'Replace the failed ' + p.fault + ' (Equipment → Replace part)' : 'Wait for the boot to finish', 'overview'));
  return out;
}
export function managementCheck(n, ctx, where = 'management') {
  const hub = ctx.byId['MGMT-SW'], ip = n.net.ip !== '0.0.0.0';
  if (!ip) return chk('mgmt-ip', 'management', false, n.id + ' has no management IP (factory default)', productProfile(n).serial ? 'Connect the serial console and assign the management IP' : 'Open the local setup GUI → management network', where);
  const reach = !hub || hub.active === false || !ctx.reachable ? true : ctx.reachable(hub, n, n.net.vlan);
  return chk('mgmt-path', 'management', reach, n.id + ' management ' + n.net.ip + ' is not reachable from MGMT-SW on VLAN ' + n.net.vlan, 'Cable MGMT UPLINK to a MGMT-SW port in access VLAN ' + n.net.vlan, where);
}
// LED helpers.
export const led = (id, color, blink = 'solid') => ({ id, color, blink });
export function baseLeds(n, ctx, checks) {
  const pw = powerState(n), boot = bootState(n), f = firstFailure(checks);
  const status = !pw.live ? led('power', 'off') : boot.phase === 'post' ? led('status', 'green', 'slow') : boot.phase === 'standby' ? led('status', 'amber', 'solid') : !f ? led('status', 'green') : f.severity === 'warning' ? led('status', 'amber', 'slow') : led('status', 'amber', 'fast');
  return { front: [led('power', pw.live ? 'green' : 'off'), status], psu: pw.psus.map(x => led(x.id, x.led, x.blink)), ports: portsState(n, ctx).map(p => led(p.name, p.led === 'green' ? 'green' : p.led, p.blink || 'solid')) };
}
// Alarm rows derived from failing checks (monitoring never hand-writes alarms).
export function alarmsFrom(n, checks, kind = n.type) {
  return checks.filter(c => !c.ok).map(c => ({ id: n.id + ':' + c.id, device: n.id, severity: c.severity, kind, check: c.id, layer: c.layer, message: c.detail, fixHint: c.fixHint, where: c.where }));
}
// Vendor-style CLI helpers.
export const ERR = {
  fortios: 'Command fail. Return code -61',
  fortiosParse: 'command parse error before \'%s\'\nCommand fail. Return code -61',
  cisco: '% Invalid input detected at \'^\' marker.',
  os10: '% Error: Unrecognized command.',
  aoscx: 'Invalid input: %s',
  fabric: '%s: command not found',
  racadm: 'ERROR: Invalid subcommand specified.',
  ilo: 'status=2\nstatus_tag=COMMAND PROCESSING FAILED\nerror_tag=COMMAND ERROR-UNSPECIFIED',
};
export const pad = (s, n) => String(s ?? '').padEnd(n);
export const table = (heads, rows, widths) => [heads.map((h, i) => pad(h, widths[i])).join(' '), heads.map((h, i) => '-'.repeat(Math.max(3, widths[i] - 1)).padEnd(widths[i])).join(' '), ...rows.map(r => r.map((c, i) => pad(c, widths[i])).join(' '))].join('\n');
export const summaryRow = (k, v, tone = '') => [k, String(v), tone];
export { physicalOffline, configuredProduct, productProfile, hasPower };
