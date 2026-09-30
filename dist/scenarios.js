// Scenario builders for challenges and tests. Every step goes through the same world actions the UI
// and LAN host use (order → unbox → rails/mount → power → cable → configure); only delivery and boot
// timers are shortened. Nothing is written into derived state.
import { CATALOG } from './operations.js';
import { deviceRuntime } from './device-runtime.js';
import { hostIdentifiers } from './storage-access.js';

export function builder(world, byId, actor = 'SCENARIO') {
  const must = r => { if (typeof r === 'string' && !r.startsWith('Applied')) throw Error('Scenario step failed: ' + r); return r; };
  const op = world.operations, eng = action => world.apply({ type: 'engineering', action }, actor), cfg = action => must(world.apply({ type: 'config', action }, actor));
  const device = (n, o, value) => cfg({ type: 'device-op', node: n.id, op: o, value }), product = (n, o, value) => cfg({ type: 'product', node: n.id, op: o, value });
  function buy(sku, length = 30) { eng({ type: 'order', sku, quantity: 1, length }); const o = op.game.orders.at(-1); o.arrives = 0; eng({ type: 'unbox', id: o.id }); return op.game.stock.filter(s => s.sku === sku && !s.holders.length && !s.powerAnchor).at(-1); }
  function freeSlot(units, racks) {
    for (const rack of racks) for (let unit = 1; unit + units - 1 <= 42; unit++)
      if (!op.available().some(n => n.rack === rack && !n.controller && n.unit < unit + units && n.unit + n.units > unit) && !op.game.rails.some(r => r.rack === rack && r.unit < unit + units && r.unit + r.units > unit)) return { rack, unit };
    throw Error('No free rack position');
  }
  function install(sku, racks = ['R05', 'R06', 'R03', 'R04'], feeds = ['A', 'B']) {
    const item = buy(sku), c = CATALOG.find(x => x.id === sku), slot = freeSlot(c.units, racks);
    eng({ type: 'grab', id: item.id }); eng({ type: 'mount', id: item.id, ...slot });
    const n = byId[op.game.installed.at(-1)];
    feeds.forEach((feed, psu) => eng({ type: 'power', id: op.game.stock.find(s => s.sku === 'power' && !s.holders.length && !s.powerAnchor).id, node: n.id, psu, feed }));
    if (!['switch', 'san', 'firewall', 'isp'].includes(n.type)) eng({ type: 'boot', node: n.id });
    n.physical.bootUntil = 1; op.tick();
    return n;
  }
  const idx = (n, name) => typeof name === 'number' ? name : n.ports.findIndex(p => p.name === name);
  function cable(x, px, y, py, sku, length = 20) {
    const pa = idx(x, px), pb = idx(y, py), s = buy(sku, length);
    if (['fiber', 'fc'].includes(sku)) for (const [n, i] of [[x, pa], [y, pb]]) { const p = n.ports[i], o = CATALOG.find(c => c.type === 'optic' && c.speed === p.speed && c.medium === p.medium && c.reach === 'SR'); eng({ type: 'optic', id: buy(o.id).id, node: n.id, port: i }); }
    eng({ type: 'grab', id: s.id }); eng({ type: 'start-end', id: s.id, node: x.id, port: pa }); eng({ type: 'patch', id: s.id, a: x.id, pa, b: y.id, pb });
    return x.ports[pa].link;
  }
  // Management: MGMT UPLINK → a free MGMT-SW access port in VLAN 70 (not the central admin PC port).
  let mgmtHost = 200;
  function manage(n, ip) {
    const hub = byId['MGMT-SW'], office = world.office?.state;
    if (hub && hub.active !== false) { const hp = hub.ports.findIndex((p, i) => !p.link && !p.service && p.speed === 1 && !Object.values(office?.pcs || {}).some(pc => pc.switch === hub.id && pc.port === i)); cable(n, 'MGMT UPLINK', hub, hp, 'cat6', 40); cfg({ type: 'port', node: hub.id, index: hp, value: { access: 70 } }); }
    if (ip && n.net.ip === '0.0.0.0') { while (world.operations.available().some(x => x.net.ip === '10.10.70.' + mgmtHost)) mgmtHost++; product(n, 'management', { ip: '10.10.70.' + mgmtHost, prefix: 24, vlan: 70, gateway: '10.10.70.1', dns: '10.10.70.1', ntp: '10.10.70.1', ssh: true }); }
  }
  const free = (n, speed, medium = 'Ethernet') => n.ports.findIndex(p => !p.link && !p.service && !p.reserved && p.medium === medium && p.speed === speed && !/MGMT/.test(p.name));
  // iSCSI lab: ME5024 iSCSI + R660 (ESXi) + two PowerSwitches (fabric A VLAN 3000, B VLAN 3001, MTU
  // 9000), pool POOL-A (RAID 6), volume DATA-01 mapped to the host, datastore Shared-01 and VM APP-01.
  function iscsiLab(prefix = 190) {
    const array = install('me5024iscsi'), srv = install('r660'), swA = install('dells5248'), swB = install('dells5248');
    product(array, 'identity', { name: 'ME5-LAB', passwordChanged: true });
    product(array, 'management', { ip: '10.10.70.' + (prefix + 1), nodeA: '10.10.70.' + (prefix + 1), nodeB: '10.10.70.' + (prefix + 2), prefix: 24, vlan: 70, gateway: '10.10.70.1', ntp: '10.10.70.1', ssh: true });
    manage(array); manage(srv, true);
    const ids = hostIdentifiers(srv), hostCfg = { os: 'VMware ESXi', raid: 'RAID 1 boot', protocol: 'iSCSI', portA: 'NIC-1', portB: 'NIC-2', ipA: '172.16.10.10', ipB: '172.16.11.10', prefix: 24, vlanA: 3000, vlanB: 3001, mtu: 9000, iqn: ids.iqn, wwpnA: ids.wwpnA, wwpnB: ids.wwpnB, initiatorEnabled: true };
    product(srv, 'host', hostCfg);
    device(array, 'pool', { id: 'POOL-A', sizeGiB: 10000, protection: 'RAID 6' });
    product(array, 'storage', { ...hostCfg, ipA: '172.16.10.20', ipB: '172.16.11.20', mode: 'Virtual', raid: 'RAID 6', pool: 'POOL-A', volume: 'DATA-01', sizeGiB: 2000, host: srv.id, initiator: ids.iqn });
    const la = [cable(array, 'NIC-1', swA, free(swA, 25), 'fiber'), cable(srv, 'NIC-1', swA, free(swA, 25), 'fiber')], lb = [cable(array, 'NIC-2', swB, free(swB, 25), 'fiber'), cable(srv, 'NIC-2', swB, free(swB, 25), 'fiber')];
    for (const [sw, vlan, list] of [[swA, 3000, la], [swB, 3001, lb]]) { cfg({ type: 'vlan', node: sw.id, id: vlan, name: 'ISCSI' }); for (const l of list) cfg({ type: 'port', node: sw.id, index: sw.ports.indexOf(l.a === sw.id ? l.pa : l.pb), value: { mode: 'access', access: vlan, mtu: 9000 } }); }
    device(srv, 'os', { os: 'VMware ESXi', raid: 'RAID 1 boot' }); deviceRuntime(srv).install.until = 0; deviceRuntime(srv);
    const nic = srv.ports.findIndex(p => p.name === 'DATA-1'), tor = cable(srv, 'DATA-1', swA, free(swA, 100), 'fiber');
    cfg({ type: 'vlan', node: swA.id, id: 50, name: 'SERVERS' }); cfg({ type: 'port', node: swA.id, index: swA.ports.indexOf(tor.a === swA.id ? tor.pa : tor.pb), value: { mode: 'trunk', allowed: [50] } });
    device(srv, 'portgroup', { id: 'Servers', vlan: 50, uplinks: String(nic) });
    device(srv, 'datastore', { id: 'Shared-01', array: array.id, volume: 'DATA-01' });
    device(srv, 'vm', { id: 'APP-01', os: 'Linux', cpu: 2, memory: 4, disk: 100, datastore: 'Shared-01', network: 'Servers', ip: '10.10.50.41', prefix: 24, gateway: '10.10.50.1', dns: '10.10.70.1' });
    device(srv, 'vm-power', { id: 'APP-01', on: true });
    return { array, srv, swA, swB, la, lb };
  }
  // Spec FortiGate with a physical circuit (plan) and its provider router, WAN configured.
  function ispLab(plan = 'fiber30', racks = ['R05', 'R06']) {
    const fw = install('fg200f', racks); eng({ type: 'isp-order', node: fw.id, plan, free: true });
    const c = fw.net.ispContract, order = op.game.orders.find(o => o.contract === c.id); order.arrives = 0; eng({ type: 'unbox', id: order.id });
    const item = op.game.stock.find(s => s.sku === 'ispcpe' && s.contract === c.id), slot = freeSlot(1, racks);
    eng({ type: 'grab', id: item.id }); eng({ type: 'mount', id: item.id, ...slot });
    const cpe = byId[op.game.installed.at(-1)];
    eng({ type: 'power', id: op.game.stock.find(s => s.sku === 'power' && !s.holders.length && !s.powerAnchor).id, node: cpe.id, psu: 0, feed: 'A' }); cpe.physical.bootUntil = 1; op.tick();
    cable(cpe, 'LAN1', fw, 'port5', 'cat6');
    product(fw, 'identity', { name: 'FGT-EDGE', passwordChanged: true }); manage(fw, true);
    product(fw, 'wan', { port: 'port5', mode: c.mode, ip: c.ip, prefix: c.prefix, gateway: c.gateway, dns: c.dns, pppoeUser: c.pppoe?.user, pppoePassword: c.pppoe?.password, enabled: true, defaultRoute: true });
    return { fw, cpe, c };
  }
  // PowerScale NAS serving an NFS export to the engineering subnet on VLAN 50 behind the office core.
  function nasLab(core) {
    const nas = install('powerscale');
    product(nas, 'identity', { name: 'ONEFS-LAB', passwordChanged: true });
    manage(nas, true);
    const port = nas.ports.find(p => !p.service && p.medium === 'Ethernet' && !/MGMT/.test(p.name) && p.speed === 25) || nas.ports.find(p => !p.service && p.medium === 'Ethernet' && !/MGMT/.test(p.name));
    const cp = core.ports.findIndex(p => !p.link && !p.service && !p.reserved && p.speed === port.speed && p.medium === 'Ethernet');
    cable(nas, port.name, core, cp, port.speed === 1 ? 'cat6' : 'fiber', 30);
    cfg({ type: 'port', node: core.id, index: cp, value: { mode: 'access', access: 50 } });
    product(nas, 'nas', { name: 'eng', zone: 'engineering', protocol: 'NFS', ip: '10.10.50.60', prefix: 24, vlan: 50, port: port.name });
    return { nas, port };
  }
  return { manage, buy, install, cable, free, iscsiLab, ispLab, nasLab, eng, cfg, device, product };
}
