// Device-logic registry: picks the family module for a device, builds the shared context, caches one
// result per device per logic tick, collects alarms for monitoring and injects challenge faults.
// GUI, CLI, LEDs, monitoring, contracts and challenges all call through here, so they cannot disagree.
import { invalidate, memo, firstFailure, ordered, baseChecks, managementCheck, baseLeds, alarmsFrom, portsState, powerState, bootState, healthOf, physicalOffline } from './common.js';
import firewall from './firewall.js';
import switchLogic, { storming, spanningTree } from './switch.js';
import providerRouter from './provider-router.js';
import server from './server.js';
import gpuServer from './gpu-server.js';
import storageArray from './storage-array.js';
import nas from './nas.js';
import sanSwitch from './san-switch.js';
import { injectFault, FAULT_CATALOG } from './faults.js';
import pdu from './pdu.js';
import accessPoint, { poeFor } from './access-point.js';
import pc from './pc.js';

const generic = {
  family: 'generic', match: () => true,
  checks: (n, ctx) => ordered([...baseChecks(n, ctx), ...(n.spec ? [managementCheck(n, ctx)] : [])]),
  state(n, ctx) { const c = this.checks(n, ctx); return { power: powerState(n), boot: bootState(n), mgmt: { ip: n.net.ip }, health: healthOf(c), ports: portsState(n, ctx), services: [], alarms: alarmsFrom(n, c) }; },
  leds(n, ctx) { return baseLeds(n, ctx, this.checks(n, ctx)); },
  cli: () => null, gui(n, ctx) { return { summary: [], blocking: firstFailure(this.checks(n, ctx)), pages: {} }; }, faults: []
};
export const FAMILIES = [firewall, switchLogic, providerRouter, nas, storageArray, sanSwitch, gpuServer, server];
export function registerFamily(m, before = null) { if (FAMILIES.includes(m)) return; const i = before ? FAMILIES.indexOf(before) : -1; if (i >= 0) FAMILIES.splice(i, 0, m); else FAMILIES.push(m); }
export const familyOf = n => FAMILIES.find(m => m.match(n)) || generic;

export function createLogic({ nodes, links, byId, network }) {
  let world = null, worldCtx = null, pseudo = [];
  const ctx = () => ({ nodes, links, byId, network, office: world?.office || null, game: world?.operations?.game || null, reachable: network.reachable, localStatus: network.localStatus, now: Date.now(), connect: worldCtx?.connect, refreshFaults: worldCtx?.refreshFaults });
  const live = () => nodes.filter(n => n.active !== false && n.type !== 'cloud' && !n.controller);
  const api = {
    families: FAMILIES,
    setWorld(w, c) { world = w; worldCtx = c; },
    // World version: bumped by every applied action and every restored snapshot (LAN frames), so open
    // GUI pages know when to re-render.
    version: 0,
    touch() { api.version++; invalidate(); },
    addPseudo(fn) { pseudo.push(fn); },
    invalidate,
    ctx,
    module: familyOf,
    state: n => familyOf(n).state(n, ctx()),
    checks: n => familyOf(n).checks(n, ctx()),
    leds: n => familyOf(n).leds(n, ctx()),
    gui: n => familyOf(n).gui(n, ctx()),
    first: n => firstFailure(familyOf(n).checks(n, ctx())),
    // Cached per logic tick (for LEDs, tooltips, alarms and GUI refreshes).
    cached: (n, what = 'state') => memo(n, 'logic:' + what, () => familyOf(n)[what](n, ctx())),
    // Syntax this device answers (family module list), for ? and Tab completion.
    commands(n) { return n ? familyOf(n).commands || [] : []; },
    family(n) { return familyOf(n).family; },
    cli(n, cmd, session) { const m = familyOf(n); return m.cli ? m.cli(n, cmd, session || {}, ctx()) : null; },
    unknown(n, cmd) { const m = familyOf(n); return m.unknown ? m.unknown(n, cmd) : null; },
    storming: id => storming(ctx(), id),
    spanningTree: () => spanningTree(ctx()),
    // Every alarm shown in monitoring comes from a module's failing checks (never hand-written).
    alarms() {
      return memo(links, 'alarms', () => {
        const out = [];
        for (const n of live()) for (const a of api.cached(n, 'state').alarms || []) out.push({ ...a, family: familyOf(n).family });
        for (const fn of pseudo) out.push(...fn(ctx()));
        return out;
      });
    },
    // System event log: every alarm that asserts or clears is recorded once on the device (persisted
    // with the device configuration, shown by racadm getsel / the SEL pages / the switch log).
    tickLog(now = Date.now()) {
      let changed = false;
      for (const n of live()) {
        const cur = new Map((api.cached(n, 'state').alarms || []).map(a => [a.check, a])), prev = n.net.alarmKeys;
        const add = [...cur.keys()].filter(k => !(prev || []).includes(k)), gone = (prev || []).filter(k => !cur.has(k));
        if (!add.length && !gone.length) continue;
        n.net.sel ??= [];
        for (const k of add) n.net.sel.unshift({ at: now, severity: cur.get(k).severity, check: k, message: cur.get(k).message, state: 'asserted' });
        for (const k of gone) n.net.sel.unshift({ at: now, severity: 'ok', check: k, message: (n.net.sel.find(e => e.check === k)?.message || k), state: 'deasserted' });
        n.net.sel = n.net.sel.slice(0, 40); n.net.alarmKeys = [...cur.keys()]; changed = true;
      }
      return changed;
    },
    // Pseudo devices outside the rack node list: rack PDUs, FortiAPs and employee PCs.
    pdus: () => pdu.pdusOf(ctx()),
    pdu: id => { const p = pdu.pdusOf(ctx()).find(x => x.id === id); return p && { ...p, state: pdu.state(p, ctx()), checks: pdu.checks(p, ctx()), leds: pdu.leds(p, ctx()), gui: pdu.gui(p, ctx()) }; },
    pduCli: (id, cmd) => { const p = pdu.pdusOf(ctx()).find(x => x.id === id); return p ? pdu.cli(p, cmd, {}, ctx()) : 'Unknown PDU'; },
    ap: id => { const ap = world?.office?.state.aps[id]; return ap && { ...accessPoint.state(ap, ctx()), checks: accessPoint.checks(ap, ctx()), leds: accessPoint.leds(ap, ctx()) }; },
    apCli: (id, cmd) => { const ap = world?.office?.state.aps[id]; return ap ? accessPoint.cli(ap, cmd, {}, ctx()) : 'Unknown AP'; },
    poeFor: ap => poeFor(ap, ctx()),
    pc: (id, session) => { const p = world?.office?.state.pcs[id]; return p && { ...pc.state(p, ctx(), session), checks: pc.checks(p, ctx(), session), leds: pc.leds(p) }; },
    pcCli: (id, cmd, session) => { const p = world?.office?.state.pcs[id]; return p ? pc.cli(p, cmd, session || {}, ctx()) : 'Unknown PC'; },
    faults: () => FAULT_CATALOG,
    inject: (action, env) => injectFault(action, { ...ctx(), ...env })
  };
  api.addPseudo(c => pdu.alarms(c));
  api.addPseudo(c => accessPoint.alarms(c));
  api.addPseudo(c => pc.alarms(c));
  return api;
}
