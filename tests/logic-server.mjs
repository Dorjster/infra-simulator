// Server logic: standby iDRAC, POST → boot order → OS / "No boot device", racadm power control,
// virtual console, PSU redundancy (amber PSU LED), RAID degraded → rebuild → optimal, second failure
// during RAID 5 rebuild → failed VD → OS and office service down → recreate + reinstall, VM
// overcommit refusal at power-on, host firewall, airflow/thermal warning, power loss drops VMs until
// the next boot, SEL from state transitions. Each fault: distinct message; GUI/CLI/LEDs/monitoring
// agree; repair through real actions; persistence.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
import { helpers } from './build-helpers.mjs';
import { deviceRuntime } from '../dist/device-runtime.js';
const h = helpers(a), { w, office, engineering, device, config, op } = h, o = w.office, s = () => o.state, net = a.lab.kit.network, L = net.logic;
engineering({ type: 'mode', mode: 'free' });
const cli = (n, c) => net.command(c, { node: n }), inject = (fault, node) => { engineering({ type: 'fault', fault, node }); L.invalidate(); return op.game.lastFault; };
const ticks = k => { for (let i = 0; i < k; i++) op.tick(); L.invalidate(); };
await office({ type: 'login', user: 'itadmin', password: 'OfficeLab19!' });
await office({ type: 'login', user: 'finance', pc: 'F1-finance-PC', password: 'OfficeLab19!' });
const intranet = () => office({ type: 'browse', pc: 'F1-finance-PC', url: 'https://intranet.company.test' });
assert((await intranet()).ok, 'baseline intranet');

// A new PowerEdge: standby management, POST, no boot device, installer, OS.
const srv = h.install('r660', { racks: ['R05'] }); L.invalidate();
assert.equal(L.first(srv).id, 'mgmt-ip', 'critical first: iDRAC has no IP'); { const os = L.checks(srv).find(c => c.id === 'os'); assert(!os.ok && os.severity === 'warning'); assert.match(os.detail, /No boot device available · no operating system installed/); }
assert.match(await cli(srv, 'console'), /No boot device available\.[\s\S]*BOSS-N1/);
assert.match(await cli(srv, 'racadm serveraction powerdown'), /Applied · host power off/); L.invalidate();
assert.equal(L.state(srv).boot.phase, 'standby'); assert.equal(net.localStatus(srv).ok, true, 'iDRAC alive on standby power');
assert.match(await cli(srv, 'console'), /No signal/); assert.equal(L.first(srv).id, 'host-power', 'host off blocks before management');
assert.deepEqual(L.leds(srv).front.find(x => x.id === 'status'), { id: 'status', color: 'amber', blink: 'solid' });
assert.match(await cli(srv, 'racadm serveraction powerup'), /initiated successfully[\s\S]*Applied/); L.invalidate();
assert.equal(L.state(srv).boot.phase, 'post'); assert.match(await cli(srv, 'console'), /POST: memory 512 GB OK/);
srv.physical.bootUntil = 1; ticks(1);
assert.match(device(srv, 'os', { os: 'VMware ESXi', raid: 'RAID 1 boot' }), /^Applied/); L.invalidate();
assert.match(await cli(srv, 'console'), /Installing VMware ESXi/);
deviceRuntime(srv).install.until = 0; L.invalidate(); assert.match(await cli(srv, 'console'), /VMware ESXi 8\.0\.2 \(DCUI\)/); assert(L.checks(srv).find(c => c.id === 'os').ok);
assert.match(await cli(srv, 'racadm get idrac.nic'), /Default credentials \(pull-out tag\): root \/ [A-Z0-9]{8}/);
assert.match(await cli(srv, 'racadm storage get pdisks'), /Disk\.Bay\.9/, 'R660 has 10 drive bays');
assert.match(await cli(srv, 'racadm frobnicate'), /ERROR: Invalid subcommand specified\./);

const seen = new Set();
async function scenario(fault, node, check, cmd, pattern, repair, extra) {
  const info = inject(fault, node), n = a.byId[info.device], c = L.checks(n).find(x => x.id === (info.check || check));
  assert(c && !c.ok, fault + ' → ' + check + ' · ' + JSON.stringify(L.checks(n).filter(x => !x.ok)));
  assert(!seen.has(c.detail), 'distinct: ' + c.detail); seen.add(c.detail);
  assert.match(await cli(n, cmd), pattern, fault + ' CLI');
  assert(L.alarms().some(x => x.device === n.id && x.check === c.id), fault + ' alarm');
  if (c.severity === 'critical') assert(op.alerts().some(x => x.device === n.id && x.text === c.detail), fault + ' NOC');
  const gui = L.gui(n); assert(gui.blocking, fault + ' GUI blocking box');
  ticks(1); assert((n.net.sel || []).some(e => e.check === c.id && e.state === 'asserted'), fault + ' SEL entry');
  if (extra) await extra(n, info, c);
  const saved = w.snapshot(); w.restore(saved); L.invalidate(); assert(!L.checks(a.byId[n.id]).find(x => x.id === c.id)?.ok, fault + ' persists');
  await repair(a.byId[n.id], info); L.invalidate();
  const after = L.checks(a.byId[n.id]).find(x => x.id === c.id); assert(!after || after.ok, fault + ' repaired · ' + JSON.stringify(after));
  ticks(1); assert((a.byId[n.id].net.sel || []).some(e => e.check === c.id && e.state === 'deasserted'), fault + ' SEL cleared entry');
  console.log('  ' + fault + ' → ' + c.detail);
}
const floorCord = () => op.game.stock.find(x => x.sku === 'power' && x.powerAnchor && !x.holders.length);
await scenario('psu-pull', 'SERVER-01', 'psu-redundancy', 'racadm getsensorinfo', /PS Redundancy\s+Lost/, n => { const cord = floorCord(); engineering({ type: 'grab', id: cord.id }); engineering({ type: 'power', id: cord.id, node: n.id, psu: 1, feed: cord.powerAnchor.feed }); }, async n => { const psu = L.leds(n).psu; assert.deepEqual([psu[0].color, psu[1].color], ['green', 'amber'], 'PSU 2 LED amber, PSU 1 carries the load'); assert((await intranet()).ok, 'service stays up on one PSU'); });
await scenario('raid-disk', 'SERVER-01', 'vd-VD0', 'racadm storage get vdisks', /State = Degraded/, n => { const d = h.buy('disk'); assert.match(engineering({ type: 'repair', id: d.id, node: n.id }), /rebuild started/); L.invalidate(); assert.match(L.checks(n).find(x => x.id === 'vd-VD0').detail, /rebuilding \d+ %/); assert.equal(L.leds(n).disks[1].blink, 'slow', 'rebuilding disk LED blinks green'); ticks(10); }, async n => { assert.deepEqual([L.leds(n).disks[1].color, L.leds(n).disks[1].blink], ['amber', 'fast']); assert((await intranet()).ok, 'degraded RAID 1 keeps the OS running'); });
await scenario('raid-second-disk', 'SERVER-01', 'vd-VD1', 'console', /No boot device available\.\nVirtual disk VD1 \(RAID 5\) failed/, async n => {
  for (let i = 0; i < 2; i++) engineering({ type: 'repair', id: h.buy('disk').id, node: n.id });
  assert.match(device(n, 'raid', { action: 'delete', id: 'VD1' }), /^Applied/); L.invalidate();
  assert.match(L.first(n).detail, /Boot virtual disk VD1 no longer exists|no operating system/);
  assert.match(device(n, 'os', { os: 'Linux', raid: 'RAID 1 boot' }), /^Applied/); deviceRuntime(n).install.until = 0; L.invalidate();
}, async () => { const r = await intranet(); assert(!r.ok); assert.equal(h.failedStep(r).name, 'Host operating system'); assert.match(r.reason, /Virtual disk VD1 \(RAID 5\) failed/); });
assert((await intranet()).ok, 'intranet back after recreate + reinstall');
await scenario('vm-overcommit', 'SERVER-02', 'vm-APP-02', 'vim-cmd vmsvc/getallvms', /APP-02\s+\[local\]\s+Linux\s+poweredOff/, n => { assert.match(device(n, 'vm-power', { id: 'APP-02', on: true }), /Cannot power on APP-02: 144 vCPU would run on 32 cores \(overcommit limit 4:1 = 128 vCPU\)/); device(n, 'vm-power', { id: 'BIG-01', on: false }); assert.match(device(n, 'vm-power', { id: 'APP-02', on: true }), /^Applied/); });
await scenario('host-firewall', 'SERVER-01', 'fw-intranet', 'status', /SERVER-01/, () => office({ type: 'configure', page: 'services', value: { ...s().services.intranet, serverFirewall: '443,445,2049,8443' } }), async () => { const r = await intranet(); assert.match(r.reason, /Host firewall on SERVER-01 does not allow TCP 443/); });
await scenario('airflow', 'SERVER-03', 'airflow', 'racadm getsensorinfo', /System Board Inlet\s+Warning\s+41C/, n => { engineering({ type: 'boot', node: n.id }); engineering({ type: 'reseat', node: n.id }); engineering({ type: 'boot', node: n.id }); n.physical.bootUntil = 1; ticks(1); }, async n => { assert(L.checks(n).find(x => x.id === 'thermal' && !x.ok), 'thermal throttling reported'); assert.throws(() => engineering({ type: 'reseat', node: n.id }), /Power the device off/); });

// Power loss: VMs stop and come back only after the next POST.
const s2 = a.byId['SERVER-02'], vm = () => net.vmState(s2, deviceRuntime(s2).vms['APP-02']);
assert(vm().ok, 'APP-02 running: ' + vm().reason);
for (const psu of [0, 1]) { engineering({ type: 'power', node: s2.id, psu, feed: null }); engineering({ type: 'drop', id: op.game.stock.find(x => x.holders.includes('ENGINEER-01')).id, position: { x: -38, z: 6 + psu * 3 } }); }
assert.match(vm().reason, /Host powered off or booting/);
const cord = op.game.stock.find(x => x.powerAnchor?.rack === s2.rack && !x.holders.length); engineering({ type: 'grab', id: cord.id }); engineering({ type: 'power', id: cord.id, node: s2.id, psu: 0, feed: cord.powerAnchor.feed });
assert.match(vm().reason, /Host powered off or booting/, 'power back but still in POST'); assert.equal(L.state(s2).boot.phase, 'post');
s2.physical.bootUntil = 1; ticks(1); assert(vm().ok, 'VM back after boot');
assert.match(await cli(a.byId['SERVER-01'], 'racadm getsel'), /Severity:\s+(Critical|Non-Critical)[\s\S]*Deasserted/);
console.log('PASS: logic server · standby iDRAC, racadm power, POST/boot order/No boot device, installer + console, ' + seen.size + ' faults (PSU redundancy, RAID degraded→rebuild, RAID 5 double failure → OS down → recreate/reinstall, VM overcommit, host firewall, airflow) with CLI/GUI/LED/alarm/SEL agreement + repair + persistence, VMs down until boot after power loss.');
process.exit(0);
