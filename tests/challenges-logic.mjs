// Device-logic challenges (one or more per family). For each: Begin builds the lab and injects the
// fault; the diagnosis is distinct and visible in the device checks, the GUI "what's blocking" data,
// a CLI command, the LEDs and monitoring; a real repair makes the challenge complete automatically on
// the next tick. Deterministic: TEST_SEED only changes the legacy randomizer, which these do not use.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
import { helpers } from './build-helpers.mjs';
import { CHALLENGES, LEGACY_CHALLENGES, CATALOG } from '../dist/operations.js';
import { LOGIC_CHALLENGES } from '../dist/challenges-logic.js';
import { deviceRuntime } from '../dist/device-runtime.js';
import { configuredProduct } from '../dist/product-profiles.js';
let seed = Number(process.env.TEST_SEED || 12345); Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const h = helpers(a), { w, office, engineering, config, device, product, op } = h, o = w.office, s = () => o.state, net = a.lab.kit.network, L = net.logic;
const sessions = new Map(), cli = (id, c) => { const n = a.byId[id]; if (!sessions.has(id)) sessions.set(id, { node: n, mode: 'SERIAL CONSOLE', config: false }); return net.command(c, sessions.get(id)); };
const floorCord = () => op.game.stock.find(x => x.sku === 'power' && x.powerAnchor && !x.holders.length);
const ticks = k => { for (let i = 0; i < k; i++) op.tick(); L.invalidate(); };
const lastRec = () => op.game.challenge.logic;
// Per fault: CLI evidence (device, command, pattern) and the repair.
const recipes = {
  'psu-pull': { cli: r => [r.device, 'racadm getsensorinfo', /PS Redundancy\s+Lost/], fix: r => { const c = floorCord(); engineering({ type: 'grab', id: c.id }); engineering({ type: 'power', id: c.id, node: r.device, psu: 1, feed: c.powerAnchor.feed }); } },
  'pdu-overload': { pdu: true, cli: () => null, fix: () => { for (const id of ['GPU-01', 'GPU-02']) { engineering({ type: 'power', node: id, psu: 1, feed: null }); engineering({ type: 'drop', id: op.game.stock.find(x => x.holders.includes('ENGINEER-01')).id, position: { x: -38, z: id === 'GPU-01' ? 3 : 9 } }); engineering({ type: 'power', id: h.buy('power').id, node: id, psu: 1, feed: 'B' }); } engineering({ type: 'pdu-reset', rack: 'R04', feed: 'A' }); for (const id of ['GPU-01', 'GPU-02']) a.byId[id].physical.bootUntil = 1; } },
  'wrong-optic': { cli: r => [r.device, 'show interfaces transceiver', /unsupported transceiver/], fix: r => { const n = a.byId[r.device], p = n.ports[r.portIndex], o2 = CATALOG.find(c => c.type === 'optic' && c.speed === p.speed && c.medium === p.medium && c.reach === 'SR'); engineering({ type: 'optic', id: h.buy(o2.id).id, node: n.id, port: r.portIndex }); } },
  'dirty-fiber': { cli: r => [r.device, 'show interfaces transceiver', /Rx power low · link flaps/], fix: r => engineering({ type: 'clean', node: r.device, port: r.portIndex }) },
  'stp-loop': { cli: r => [r.device, 'show spanning-tree', /broadcast storm detected/], fix: async r => { for (const id of [r.device, r.peer]) { await cli(id, 'configure terminal'); await cli(id, 'spanning-tree enable'); await cli(id, 'end'); } } },
  'lacp-mismatch': { cli: r => [r.device, 'show port-channel summary', /\(s\) suspended/], fix: r => { const n = a.byId[r.device], bad = n.ports.find(p => p.name === r.port), good = n.ports.find(p => p.cfg.lag === 1 && p !== bad); config({ type: 'port', node: n.id, index: n.ports.indexOf(bad), value: { mode: good.cfg.mode, access: good.cfg.access, allowed: [...good.cfg.allowed] } }); } },
  'native-vlan': { cli: r => [r.device, 'show interfaces status', /trunk/], fix: async r => { await cli(r.device, 'configure terminal'); await cli(r.device, 'interface ' + r.port); await cli(r.device, 'switchport trunk native vlan 1'); await cli(r.device, 'end'); } },
  'mtu-mismatch': { cli: r => [r.device, 'show interfaces status', /MTU mismatch 9216 ≠ 1500/], fix: r => { const n = a.byId[r.device]; config({ type: 'port', node: n.id, index: n.ports.findIndex(p => p.name === r.port), value: { mtu: 1500 } }); } },
  'dhcp-exhausted': { cli: r => [r.device, 'execute dhcp lease-list', /no lease \(DHCP scope exhausted/], fix: () => office({ type: 'configure', page: 'dhcp', value: { ...s().dhcp[10], end: 199, reservations: '' } }) },
  'dns-forwarder-off': { cli: r => [r.device, 'get system dns', /forward-to-ISP\s+: disable/], fix: () => office({ type: 'configure', page: 'wan', value: { dnsForward: true } }) },
  'policy-order': { cli: r => [r.device, 'show full-configuration', /edit "block-10"[\s\S]*edit "internet-10"/], fix: () => office({ type: 'move-policy', id: 'block-10', direction: 1 }).then(() => office({ type: 'move-policy', id: 'block-10', direction: 1 })).then(() => office({ type: 'delete-record', page: 'policies', id: 'block-10' })) },
  'missing-nat': { cli: r => [r.device, 'diagnose debug flow F1-sales-PC https://example.test', /no SNAT for private source/], fix: r => office({ type: 'configure', page: 'policies', value: { ...s().policies[r.policy], nat: true } }) },
  'vip-no-policy': { cli: r => [r.device, 'show firewall vip', /edit "web-publish"/], fix: () => office({ type: 'configure', page: 'policies', value: { id: 'publish-web', src: 'wan', dst: '50', source: 'any', destination: '10.10.50.10/32', service: 'HTTPS', action: 'accept', nat: false, enabled: true, start: 0, end: 24 } }) },
  'cpe-power': { cli: r => [r.device, 'status', /NO POWER/], fix: r => { engineering({ type: 'power', id: h.buy('power').id, node: r.device, psu: 0, feed: 'A' }); a.byId[r.device].physical.bootUntil = 1; } },
  'pppoe-password': { cli: r => [r.firewall, 'get system isp', /PPPoE authentication failed · the provider changed the password/], fix: r => { const fw = a.byId[r.firewall], c = fw.net.ispContract; product(fw, 'wan', { ...fw.net.product.wan, pppoeUser: c.pppoe.user, pppoePassword: c.pppoe.password }); } },
  'isp-ip-change': { cli: r => [r.device, 'get system isp', /provider notice: Planned maintenance/], fix: r => { const fw = a.byId[r.device], c = fw.net.ispContract; product(fw, 'wan', { ...fw.net.product.wan, ip: c.ip, gateway: c.gateway, prefix: c.prefix }); } },
  'raid-disk': { cli: r => [r.device, 'racadm storage get vdisks', /State = Degraded/], fix: r => { engineering({ type: 'repair', id: h.buy('disk').id, node: r.device }); ticks(10); } },
  'raid-second-disk': { cli: r => [r.device, 'console', /No boot device available/], fix: r => { const n = a.byId[r.device]; for (let i = 0; i < 2; i++) engineering({ type: 'repair', id: h.buy('disk').id, node: n.id }); device(n, 'raid', { action: 'delete', id: 'VD1' }); device(n, 'os', { os: 'Linux', raid: 'RAID 1 boot' }); deviceRuntime(n).install.until = 0; deviceRuntime(n); } },
  'controller-a': { cli: r => [r.device, 'show controllers', /Controller A\n  Health: Fault/], fix: r => engineering({ type: 'repair', id: h.buy('controller').id, node: r.device }) },
  'zoning-disabled': { cli: r => [r.device, 'cfgshow', /No Effective configuration/], fix: r => cli(r.device, 'cfgenable "FACTORY-CFG"') },
  'chap-mismatch': { cli: r => [r.device, 'show initiators', /enabled/], fix: r => { const host = Object.values(deviceRuntime(a.byId[r.device]).hosts).find(x => x.chap); const hn = a.byId[host.id]; product(hn, 'host', { ...configuredProduct(hn).host, chapSecret: host.chap }); } },
  'pool-full': { cli: r => [r.device, 'show disk-groups', /POOL FULL \(read-only\)/], fix: r => device(a.byId[r.device], 'delete', { table: 'volSnaps', id: r.snapshot }) },
  'vm-overcommit': { cli: r => [r.device, 'vim-cmd vmsvc/getallvms', /APP-02 .* poweredOff/], fix: r => { const n = a.byId[r.device]; device(n, 'vm-power', { id: 'BIG-01', on: false }); device(n, 'vm-power', { id: 'APP-02', on: true }); } },
  'host-firewall': { cli: r => [r.device, 'status', /SERVER-01/], fix: () => office({ type: 'configure', page: 'services', value: { ...s().services.intranet, serverFirewall: '443,445,2049,8443' } }) },
  'ap-unauthorized': { ap: true, cli: () => null, fix: r => office({ type: 'configure', page: 'aps', value: { ...s().aps[r.device], authorized: true } }) },
  'gpu-airflow': { cli: r => [r.device, 'nvidia-smi', /HW Slowdown: Active/], fix: r => { engineering({ type: 'boot', node: r.device }); engineering({ type: 'reseat', node: r.device }); engineering({ type: 'boot', node: r.device }); a.byId[r.device].physical.bootUntil = 1; } },
  'nfs-export': { cli: r => [r.device, 'isi nfs exports list', /10\.99\.0\.0\/24/], fix: r => office({ type: 'configure', page: 'shares', value: { ...s().shares[r.share], subnets: '10.10.0.0/16' } }) },
  'pc-static-gateway': { pc: true, cli: r => null, fix: async r => { await office({ type: 'login', user: 'sales', pc: r.device, password: 'OfficeLab19!' }); await office({ type: 'pc', id: r.device, op: 'connect', dhcp: true }); } },
};
const nonGreen = leds => [...(leds.front || []), ...(leds.psu || []), ...(leds.ports || []), ...(leds.disks || []), ...(leds.gpus || [])].some(x => x.color !== 'green' && !(x.id === 'ALARM' && x.color === 'off') && x.color !== 'off' || ['PWR', 'power', 'NIC', 'breaker'].includes(x.id) && x.color !== 'green');
const seen = new Set(); let count = 0;
assert.equal(CHALLENGES.length, LEGACY_CHALLENGES + LOGIC_CHALLENGES.length);
const families = new Set(LOGIC_CHALLENGES.map(c => c.family)); for (const f of ['firewall', 'switch', 'provider-router', 'server', 'gpu-server', 'storage-array', 'nas', 'san-switch', 'pdu', 'access-point', 'pc']) assert(families.has(f), 'challenge for family ' + f);
for (let i = 0; i < LOGIC_CHALLENGES.length; i++) {
  const def = LOGIC_CHALLENGES[i], index = LEGACY_CHALLENGES + i;
  engineering({ type: 'mode', mode: 'challenge', index }); sessions.clear();
  await office({ type: 'login', user: 'itadmin', password: 'OfficeLab19!' });
  assert.equal(op.alerts().length, 0, 'healthy baseline ' + def.name + ' ' + JSON.stringify(op.alerts()));
  engineering({ type: 'begin' }); L.invalidate();
  const r = lastRec(), recipe = recipes[def.fault]; assert(recipe, 'recipe for ' + def.fault);
  assert.notEqual(engineering({ type: 'validate' }), 'Challenge complete', def.name + ' must fail before repair');
  // Diagnosis in checks, monitoring, GUI, LEDs and CLI.
  const pseudo = def.family === 'pdu' ? L.pdu(r.device) : def.family === 'access-point' ? L.ap(r.device) : def.family === 'pc' ? L.pc(r.device) : null;
  const checks = pseudo ? pseudo.checks : L.checks(a.byId[r.device]), f = checks.find(c => !c.ok && (c.id === r.check || c.id.startsWith(r.check + '-')));
  assert(f, def.name + ' failing check ' + r.check + ' on ' + r.device + ' · ' + JSON.stringify(checks.filter(c => !c.ok)));
  assert(!seen.has(f.detail), 'distinct diagnosis: ' + f.detail); seen.add(f.detail);
  assert(L.alarms().some(x => x.device === r.device && x.message === f.detail), def.name + ' monitoring alarm');
  const gui = pseudo ? (pseudo.gui || L.pdu(r.device)?.gui) : L.gui(a.byId[r.device]); if (gui) assert(gui.blocking, def.name + ' GUI blocking box');
  if (!recipe.pc) { const leds = pseudo ? pseudo.leds : L.leds(a.byId[def.family === 'provider-router' && def.fault !== 'cpe-power' ? r.device : r.device]); assert(nonGreen(leds), def.name + ' LEDs show the fault ' + JSON.stringify(leds.front)); }
  const ev = recipe.cli(r); if (ev) assert.match(await cli(ev[0], ev[1]), ev[2], def.name + ' CLI evidence');
  // Hints: three ticket clues first (never naming the cause), then the precise pointer naming the device.
  const clues = [1, 2, 3].map(() => engineering({ type: 'hint' })); assert(clues.every((c, k) => c.startsWith('Clue ' + (k + 1) + '/3')), def.name + ' clues first ' + clues[0]);
  const hint = engineering({ type: 'hint' }); assert.match(hint, new RegExp(r.device.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'hint names the device');
  await recipe.fix(r); ticks(1);
  op.game.challenge.started -= 2000; op.tick();
  assert(op.game.challenge.finished && op.game.challenge.auto, def.name + ' auto-completes after the repair · ' + JSON.stringify((pseudo ? (def.family === 'pdu' ? L.pdu(r.device) : def.family === 'access-point' ? L.ap(r.device) : L.pc(r.device)).checks : L.checks(a.byId[r.device])).filter(c => !c.ok && c.id.startsWith(r.check))));
  count++; console.log('PASS logic challenge ' + (index + 1) + ': ' + def.name + ' · ' + f.detail.slice(0, 110));
}
console.log('PASS: ' + count + ' device-logic challenges (all 11 families) · distinct diagnoses in checks/GUI/CLI/LEDs/monitoring, repair, automatic completion (seed ' + (process.env.TEST_SEED || 'default') + ').');
process.exit(0);
