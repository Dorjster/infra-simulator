// Employee PC logic: wall outlet → switch port link, DHCP DORA in ipconfig /all, APIPA on failure,
// nslookup / ping / tracert / net use built from the same path evaluator as the office and monitoring.
// Faults: wrong static gateway, unpatched outlet — distinct messages, command evidence, alarms,
// repair, persistence.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
import { helpers } from './build-helpers.mjs';
const h = helpers(a), { w, office, engineering, op } = h, o = w.office, s = () => o.state, net = a.lab.kit.network, L = net.logic;
engineering({ type: 'mode', mode: 'free' });
await office({ type: 'login', user: 'sales', pc: 'F1-sales-PC', password: 'OfficeLab19!' });
const cmd = async c => (await office({ type: 'probe', tool: 'cmd', pc: 'F1-sales-PC', command: c })).output;
let out = await cmd('ipconfig /all');
assert.match(out, /Ethernet adapter Ethernet:[\s\S]*DHCP Enabled\. \. \. \. \. \. \. \. \. \. \. : Yes[\s\S]*IPv4 Address\. .*: 10\.10\.10\.100\(Preferred\)[\s\S]*Subnet Mask .*: 255\.255\.255\.0[\s\S]*DHCP Server .*: 10\.10\.10\.1/);
assert.match(out, /DHCPDISCOVER broadcast on VLAN 10\n\s+DHCPOFFER 10\.10\.10\.100 from 10\.10\.10\.1\n\s+DHCPREQUEST 10\.10\.10\.100\n\s+DHCPACK/, 'DORA visible');
assert.match(await cmd('nslookup intranet.company.test'), /Name:\s+intranet\.company\.test\nAddress:\s+10\.10\.50\.10/);
assert.match(await cmd('nslookup example.test'), /Non-authoritative answer:[\s\S]*198\.51\.100\.20/);
assert.match(await cmd('ping example.test'), /Reply from 198\.51\.100\.20[\s\S]*Lost = 0 \(0% loss\)/);
assert.match(await cmd('tracert example.test'), /1\s+<1 ms\s+<1 ms\s+<1 ms\s+10\.10\.10\.1\n\s+2\s+4 ms .* 203\.0\.113\.5\n\s+3 .* 198\.51\.100\.20[\s\S]*Trace complete/);
assert.match(await cmd('net use'), /OK\s+\\\\files\\sales[\s\S]*Unavailable\s+\\\\files\\finance\s+\(Share permission denied\)/);
assert.match(await cmd('frob'), /'frob' is not recognized as an internal or external command/);
assert.equal(L.pc('F1-sales-PC').health, 'ok');
// DHCP scope disabled → APIPA and matching ipconfig/ping output.
s().dhcp[10].enabled = false; L.invalidate();
out = await cmd('ipconfig /all'); assert.match(out, /Autoconfiguration IPv4 Address\. \. : 169\.254\.\d+\.\d+\(Preferred\)/); assert.match(out, /no DHCPOFFER · No DHCP offer/);
assert.match(await cmd('ipconfig /renew'), /unable to contact your DHCP server/); assert.match(await cmd('ping 10.10.50.10'), /PING: transmit failed\. General failure\./);
s().dhcp[10].enabled = true;
const seen = new Set();
async function scenario(fault, pc, check, cmdText, pattern, repair) {
  engineering({ type: 'fault', fault, node: pc }); L.invalidate();
  const c = L.pc(pc).checks.find(x => x.id === check); assert(c && !c.ok, fault + ' · ' + JSON.stringify(L.pc(pc).checks.filter(x => !x.ok)));
  assert(!seen.has(c.detail)); seen.add(c.detail);
  const r = await office({ type: 'probe', tool: 'cmd', pc, command: cmdText }); assert.match(r.output, pattern, fault + ' command evidence');
  assert(L.alarms().some(x => x.device === pc && x.check === check), fault + ' alarm'); assert(o.alerts().some(x => x.id === pc), fault + ' office monitoring');
  const saved = w.snapshot(); w.restore(saved); L.invalidate(); assert(!L.pc(pc).checks.find(x => x.id === check).ok, fault + ' persists');
  await repair(); L.invalidate(); assert(L.pc(pc).checks.every(x => x.ok), fault + ' repaired · ' + JSON.stringify(L.pc(pc).checks.filter(x => !x.ok)));
  console.log('  ' + fault + ' → ' + c.detail);
}
await scenario('pc-static-gateway', 'F1-sales-PC', 'default-gateway', 'tracert example.test', /1\s+<1 ms .* 10\.10\.10\.254\n\s+2\s+\*\s+\*\s+\*\s+Request timed out\. \(Default gateway: Gateway 10\.10\.10\.254 must match the local VLAN interface\)/, () => office({ type: 'pc', id: 'F1-sales-PC', op: 'connect', dhcp: true }));
await office({ type: 'login', user: 'finance', pc: 'F1-finance-PC', password: 'OfficeLab19!' });
await scenario('pc-unpatched', 'F1-finance-PC', 'physical-and-access-network', 'ipconfig /all', /Media State .* Media disconnected \(Ethernet outlet disconnected\)/, () => office({ type: 'pc', id: 'F1-finance-PC', op: 'connect', connected: true }));
console.log('PASS: logic pc · DORA in ipconfig /all, APIPA on DHCP failure, nslookup/ping/tracert/net use from the path evaluator, ' + seen.size + ' faults (wrong static gateway, unpatched outlet) with command evidence, alarms, office monitoring, repair and persistence.');
process.exit(0);
