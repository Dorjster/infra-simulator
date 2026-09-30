// FortiAP logic: PoE from the switch budget (priority order), DHCP address in the management VLAN,
// CAPWAP to the FortiGate, authorization, SSID → VLAN carried on the AP port, clients join an SSID and
// get DHCP in that VLAN. Faults: AP not authorized, PoE budget exceeded, SSID VLAN missing on the
// trunk — each with a distinct message, LED state, alarm, Wi-Fi client impact, repair, persistence.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
import { helpers } from './build-helpers.mjs';
const h = helpers(a), { w, office, engineering, config, op } = h, o = w.office, s = () => o.state, net = a.lab.kit.network, L = net.logic;
engineering({ type: 'mode', mode: 'free' });
await office({ type: 'login', user: 'itadmin', password: 'OfficeLab19!' });
await office({ type: 'login', user: 'finance', pc: 'F1-finance-PC', password: 'OfficeLab19!' });
await office({ type: 'pc', id: 'F1-finance-PC', op: 'connect', mode: 'Wi-Fi', ssid: 'Corporate-finance', password: 'OfficeLab19!' });
const browse = () => office({ type: 'browse', pc: 'F1-finance-PC', url: 'https://example.test' }), ap = () => L.ap('F1-finance-AP');
{ const r = await browse(); assert(r.ok, r.reason); assert.equal(o.access(s().pcs['F1-finance-PC']).ap, 'F1-finance-AP'); }
let st = ap(); assert.equal(st.status, 'Online'); assert.match(st.ip, /^10\.10\.70\.2\d\d$/); assert(st.poe.powered); assert(st.ssids.some(x => x.id === 'Corporate-finance' && x.vlan === 20 && x.carried));
assert(st.clients.includes('F1-finance-PC')); assert.deepEqual(st.leds.front.map(x => x.color), ['green', 'green', 'green', 'green']);
assert.match(L.apCli('F1-finance-AP', 'cw_diag -c wtp-cfg'), /Connection state:=RUN[\s\S]*Corporate-finance\(vlan 20\)/);
const d = L.pc('F1-finance-PC').dhcp; assert.match(d.steps.at(-1), /DHCPACK 10\.10\.20\.\d+/, 'Wi-Fi client leases in the SSID VLAN');
const seen = new Set();
async function scenario(fault, check, pattern, repair, led) {
  engineering({ type: 'fault', fault, node: 'F1-finance-AP' }); L.invalidate();
  const c = ap().checks.find(x => x.id === check); assert(c && !c.ok, fault + ' · ' + JSON.stringify(ap().checks.filter(x => !x.ok)));
  assert.match(c.detail, pattern); assert(!seen.has(c.detail)); seen.add(c.detail);
  assert(L.alarms().some(x => x.device === 'F1-finance-AP' && x.check === check), fault + ' alarm');
  assert.deepEqual(ap().leds.front.find(x => x.id === led[0]).color, led[1], fault + ' LED');
  const r = await browse(); assert(!r.ok, fault + ' affects the Wi-Fi client'); assert.equal(h.failedStep(r).name, 'Physical and access network');
  const saved = w.snapshot(); w.restore(saved); L.invalidate(); assert(!ap().checks.find(x => x.id === check).ok, fault + ' persists');
  await repair(); L.invalidate(); assert(ap().checks.find(x => x.id === check).ok, fault + ' repaired'); assert((await browse()).ok, fault + ' client back');
  console.log('  ' + fault + ' → ' + c.detail);
}
await scenario('ap-unauthorized', 'authorized', /discovered by the FortiGate but NOT authorized/, () => office({ type: 'configure', page: 'aps', value: { ...s().aps['F1-finance-AP'], authorized: true } }), ['STATUS', 'amber']);
await scenario('poe-budget', 'poe', /has no PoE power · PoE budget exceeded · port powered off \(priority low\)/, async () => { const sw = a.byId[s().bindings.access[1]]; const port = sw.ports[s().aps['F1-finance-AP'].port]; config({ type: 'cli-state', node: sw.id, op: 'interface', index: sw.ports.indexOf(port), value: { poePriority: 'high' } }); }, ['PWR', 'off']);
assert(L.ap('F1-executive-AP').checks.find(x => x.id === 'poe' && !x.ok), 'priority moved the power cut to a low-priority AP');
config({ type: 'cli-state', node: s().bindings.access[1], op: 'global', value: { poeBudget: 120 } }); L.invalidate(); assert(L.ap('F1-executive-AP').poe.powered);
// SSID VLAN not carried on the AP trunk: warning on the AP, the client gets no service.
const sw = a.byId[s().bindings.access[1]], idx = s().aps['F1-finance-AP'].port, before = [...sw.ports[idx].cfg.allowed];
config({ type: 'port', node: sw.id, index: idx, value: { allowed: before.filter(v => v !== 20) } }); L.invalidate();
const miss = ap().checks.find(x => x.id === 'ssid-Corporate-finance'); assert(!miss.ok && miss.severity === 'warning'); assert.match(miss.detail, /maps to VLAN 20 but .* does not carry it/);
assert.match((await browse()).reason, /SSID VLAN missing on AP uplink/);
config({ type: 'port', node: sw.id, index: idx, value: { allowed: before } }); assert((await browse()).ok);
console.log('PASS: logic access point · PoE from the switch budget with priorities, management DHCP IP, CAPWAP/authorization, SSID→VLAN mapping and client DHCP, ' + seen.size + ' faults (not authorized, PoE budget) + SSID VLAN missing, with LED/alarm/client impact, repair and persistence.');
process.exit(0);
