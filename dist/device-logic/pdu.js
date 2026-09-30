// Rack PDU logic (metered 3-phase PDUs A and B in every rack). A PDU is not a rack node: it is
// addressed as { id: 'R04-PDU-A', type: 'pdu', rack, feed }.
//
// State machine: closed ──load > rating (11 040 W)──▶ tripped (every outlet dark; devices fed only
//   by this PDU lose power; the other feed may then trip too) ──reset at the rack (load must fit)──▶
//   closed. The breaker cannot be reset remotely. Loads come from each device's watt draw
//   (power-grid.js), split over its live PSUs.
import { chk, warn, ordered, firstFailure, led, table, physicalOffline } from './common.js';
import { rackLoad, rackIds, PDU_RATING_W, amps, grid, feedKey } from '../power-grid.js';

export const pdusOf = ctx => rackIds(ctx.nodes, ctx.game?.racks || []).flatMap(rack => ['A', 'B'].map(feed => ({ id: rack + '-PDU-' + feed, type: 'pdu', rack, feed })));
export function state(p, ctx) {
  const load = rackLoad(p.rack, ctx.nodes, physicalOffline), w = load[p.feed], other = load[p.feed === 'A' ? 'B' : 'A'], tripped = !!grid.tripped[feedKey(p.rack, p.feed)], rec = ctx.game?.pdus?.[feedKey(p.rack, p.feed)];
  const outlets = load.outlets[p.feed].map((o, i) => ({ outlet: i + 1, ...o, amps: amps(o.watts) }));
  return { id: p.id, rack: p.rack, feed: p.feed, tripped, trippedAt: rec?.at || null, peakW: rec?.peakW || null, watts: w, percent: Math.round(w / PDU_RATING_W * 100), amps: amps(w), rating: PDU_RATING_W, failoverW: w + other, outlets, health: tripped ? 'critical' : w > PDU_RATING_W * 0.8 || w + other > PDU_RATING_W ? 'warning' : 'ok' };
}
export function checks(p, ctx) {
  const st = state(p, ctx), dark = st.outlets.filter(o => !o.live).length;
  return ordered([
    chk('breaker', 'power', !st.tripped, 'PDU ' + p.rack + '-' + p.feed + ' breaker TRIPPED at ' + (st.peakW || st.watts) + ' W (rating ' + PDU_RATING_W + ' W) · ' + dark + ' outlet(s) dark', 'Move PSU cords so each feed carries less than ' + PDU_RATING_W + ' W, then reset the breaker at the rack', 'power'),
    warn('load', 'power', st.watts <= PDU_RATING_W * 0.8, 'PDU ' + p.rack + '-' + p.feed + ' at ' + st.percent + ' % of its breaker rating (' + st.watts + ' W / ' + PDU_RATING_W + ' W)', 'Spread the load across racks or feeds', 'power'),
    warn('n-plus-1', 'power', st.failoverW <= PDU_RATING_W || st.tripped, 'If PDU ' + p.rack + '-' + (p.feed === 'A' ? 'B' : 'A') + ' fails, ' + p.rack + '-' + p.feed + ' must carry ' + st.failoverW + ' W > ' + PDU_RATING_W + ' W and would trip (no N+1 capacity)', 'Reduce the rack load below one PDU rating', 'power'),
  ]);
}
export function leds(p, ctx) { const st = state(p, ctx); return { front: [led('breaker', st.tripped ? 'red' : 'green', st.tripped ? 'fast' : 'solid'), led('load', st.percent > 80 ? 'amber' : 'green')], psu: [], ports: st.outlets.map(o => led('Outlet ' + o.outlet, o.live ? 'green' : 'off')) }; }
export function alarms(ctx) { return pdusOf(ctx).flatMap(p => checks(p, ctx).filter(c => !c.ok).map(c => ({ id: p.id + ':' + c.id, device: p.id, severity: c.severity, kind: 'power', check: c.id, layer: c.layer, message: c.detail, fixHint: c.fixHint, where: c.where, rack: p.rack }))); }
export function cli(p, cmd, session, ctx) {
  const lower = cmd.trim().toLowerCase().replace(/\s+/g, ' '), st = state(p, ctx);
  if (lower === 'devreading power' || lower === 'show power') return 'E000: Success\n' + (st.watts / 1000).toFixed(2) + ' kW (' + st.percent + '% of ' + (PDU_RATING_W / 1000).toFixed(2) + ' kW)';
  if (lower === 'phreading all current' || lower === 'show current') return 'E000: Success\n' + [1, 2, 3].map(ph => '1:' + ph + ': ' + (st.tripped ? '0.0' : st.amps) + ' A').join('\n');
  if (lower === 'olstatus all' || lower === 'show outlets') return 'E000: Success\n' + (st.outlets.map(o => ' ' + o.outlet + ': ' + o.node + ' PSU ' + (o.psu + 1) + ': ' + (o.live ? 'On' : 'Off') + ' · ' + o.watts + ' W').join('\n') || ' (no outlets in use)');
  if (lower === 'prodinfo' || lower === 'show system') return 'E000: Success\nModel: Metered 3-phase rack PDU 16 A\nRack: ' + p.rack + ' feed ' + p.feed + '\nBreaker: ' + (st.tripped ? 'TRIPPED' : 'closed') + '\nLoad: ' + st.watts + ' W';
  if (lower === 'breaker reset' || lower === 'olon all') return 'E102: Parameter Error · breakers are reset by hand at the rack (Monitoring → Power → Reset at the rack)';
  if (lower === 'help' || lower === '?') return 'devReading power | phReading all current | olStatus all | prodInfo';
  return 'E101: Command Not Found';
}
export function gui(p, ctx) {
  const st = state(p, ctx);
  return { summary: [['Breaker', st.tripped ? 'TRIPPED' : 'closed', st.tripped ? 'crit' : 'ok'], ['Load', st.watts + ' W (' + st.percent + ' %)', st.percent > 80 ? 'warn' : 'ok'], ['If other feed fails', st.failoverW + ' W', st.failoverW > PDU_RATING_W ? 'warn' : 'ok']], blocking: firstFailure(checks(p, ctx)), pages: { outlets: { group: 'PDU', title: 'Outlets', tables: [{ title: p.id + ' outlets', heads: ['Outlet', 'Device', 'PSU', 'State', 'Watts', 'Amps'], rows: st.outlets.map(o => [o.outlet, o.node, o.psu + 1, o.live ? 'on' : 'off', o.watts, o.amps]) }] } } };
}
export const faults = [{ id: 'pdu-overload', label: 'Both GPU PSUs moved to PDU A (overload trip)', check: 'breaker', family: 'pdu' }];
// Commands this module answers (used by ? and Tab in the laptop terminal).
export const commands = ['devreading power', 'show power', 'phreading all current', 'show current', 'olstatus all', 'show outlets', 'prodinfo', 'show system', 'breaker reset', 'olon all'];
export default { family: 'pdu', match: n => n.type === 'pdu', state, checks, leds, cli, gui, faults, commands, alarms, pdusOf };
