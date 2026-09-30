// Shared scripted-engineer helpers for end-to-end exercises. Every step uses the same
// engineering/config/office actions as the game UI and LAN server; nothing writes state directly
// except delivery timers (arrives=0) and boot timers (bootUntil=0) to avoid real-time waits.
import assert from 'node:assert/strict';
export function helpers(a, actor = 'ENGINEER-01') {
  const w = a.lab.world, op = w.operations;
  const engineering = action => w.apply({ type: 'engineering', action }, actor);
  const config = action => w.apply({ type: 'config', action }, actor);
  const office = action => w.apply({ type: 'office', action }, actor, [], { isHost: true });
  const device = (n, op, value) => config({ type: 'device-op', node: n.id, op, value });
  const product = (n, op, value) => config({ type: 'product', node: n.id, op, value });
  function buy(sku, length = 7) {
    engineering({ type: 'order', sku, quantity: 1, length });
    const order = op.game.orders.at(-1); order.arrives = 0; engineering({ type: 'unbox', id: order.id });
    return op.game.stock.filter(s => s.sku === sku && !s.holders.length).at(-1);
  }
  function freeSlot(units, racks = ['R01', 'R02', 'R03', 'R04']) {
    for (const rack of racks) for (let unit = 1; unit + units - 1 <= 42; unit++)
      if (!op.available().some(n => n.rack === rack && !n.controller && n.unit < unit + units && n.unit + n.units > unit) && !op.game.rails.some(r => r.rack === rack && r.unit < unit + units && r.unit + r.units > unit)) return { rack, unit };
    throw Error('No free rack position');
  }
  function install(sku, { feeds = ['A', 'B'], racks } = {}) {
    const item = buy(sku), c = op.catalog.find(c => c.id === sku), slot = freeSlot(c.units, racks);
    engineering({ type: 'grab', id: item.id }); engineering({ type: 'mount', id: item.id, ...slot });
    const n = a.byId[op.game.installed.at(-1)];
    feeds.forEach((feed, psu) => engineering({ type: 'power', id: op.game.stock.find(s => s.sku === 'power' && !s.holders.length && !s.powerAnchor).id, node: n.id, psu, feed }));
    if (!['switch', 'san', 'firewall'].includes(n.type)) engineering({ type: 'boot', node: n.id });
    n.physical.bootUntil = 1; op.tick();
    return n;
  }
  const portIndex = (n, name) => { const i = n.ports.findIndex(p => p.name === name); assert(i >= 0, n.id + ' has no port ' + name); return i; };
  function cable(x, px, y, py, sku, length = 7) {
    const pa = typeof px === 'number' ? px : portIndex(x, px), pb = typeof py === 'number' ? py : portIndex(y, py);
    const s = buy(sku, length);
    if (sku === 'fiber' || sku === 'fc') for (const [n, i] of [[x, pa], [y, pb]]) {
      const port = n.ports[i], optic = op.catalog.find(o => o.type === 'optic' && o.speed === port.speed && o.medium === port.medium && o.reach === 'SR');
      engineering({ type: 'optic', id: buy(optic.id).id, node: n.id, port: i });
    }
    engineering({ type: 'grab', id: s.id }); engineering({ type: 'start-end', id: s.id, node: x.id, port: pa });
    engineering({ type: 'patch', id: s.id, a: x.id, pa, b: y.id, pb });
    return x.ports[pa].link;
  }
  const unplug = l => w.apply({ type: 'cable', id: cableKey(l), unplugged: true }, actor);
  const replug = l => w.apply({ type: 'cable', id: cableKey(l), unplugged: false }, actor);
  const cableKey = l => `${l.a}:${a.byId[l.a].ports.indexOf(l.pa)}>${l.b}:${a.byId[l.b].ports.indexOf(l.pb)}`;
  const failedStep = r => r.steps?.find(x => !x.ok);
  // Receive, rack, power and patch the provider router that ships with an ISP circuit order.
  function installISP(fw, wanPort = 'port3', { racks } = {}) {
    const contract = fw.net.ispContract, order = op.game.orders.find(o => o.contract === contract.id);
    assert(order, 'ISP order ships a provider router'); order.arrives = 0; engineering({ type: 'unbox', id: order.id });
    const item = op.game.stock.find(s => s.sku === 'ispcpe' && s.contract === contract.id), slot = freeSlot(1, racks);
    engineering({ type: 'grab', id: item.id }); engineering({ type: 'mount', id: item.id, ...slot });
    const cpe = a.byId[op.game.installed.at(-1)];
    engineering({ type: 'power', id: op.game.stock.find(s => s.sku === 'power' && !s.holders.length && !s.powerAnchor).id, node: cpe.id, psu: 0, feed: 'A' });
    cpe.physical.bootUntil = 1; op.tick();
    cable(cpe, 'LAN1', fw, wanPort, 'cat6', 30);
    return cpe;
  }
  return { installISP, w, op, engineering, config, office, device, product, buy, install, cable, unplug, replug, portIndex, failedStep };
}
