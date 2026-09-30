// Device-logic challenges: at least one per device family, each drawn from a module's fault list.
// Begin builds the lab the fault needs (same actions as players), injects the fault, and records the
// check it breaks. The challenge completes by itself when that check passes again after a real repair.
import { builder } from './scenarios.js';

export const LOGIC_CHALLENGES = [
  { name: 'PSU pulled (server)', family: 'server', fault: 'psu-pull', node: 'SERVER-01' },
  { name: 'PDU overload (GPU rack)', family: 'pdu', fault: 'pdu-overload', rack: 'R04' },
  { name: 'Wrong optic', family: 'switch', fault: 'wrong-optic', node: 'CORE-A' },
  { name: 'Dirty fiber connector', family: 'switch', fault: 'dirty-fiber', node: 'CORE-A' },
  { name: 'Loop without spanning tree', family: 'switch', fault: 'stp-loop', node: 'CORE-A' },
  { name: 'LACP member mismatch', family: 'switch', fault: 'lacp-mismatch', node: 'CORE-A' },
  { name: 'Native VLAN mismatch', family: 'switch', fault: 'native-vlan', node: 'CORE-A' },
  { name: 'MTU mismatch', family: 'switch', fault: 'mtu-mismatch', node: 'CORE-A' },
  { name: 'DHCP pool exhausted', family: 'firewall', fault: 'dhcp-exhausted' },
  { name: 'DNS forwarder off', family: 'firewall', fault: 'dns-forwarder-off' },
  { name: 'Firewall policy order', family: 'firewall', fault: 'policy-order' },
  { name: 'Missing source NAT', family: 'firewall', fault: 'missing-nat' },
  { name: 'VIP without a policy', family: 'firewall', fault: 'vip-no-policy' },
  { name: 'Provider router power', family: 'provider-router', fault: 'cpe-power', setup: 'isp-static' },
  { name: 'PPPoE password changed', family: 'provider-router', fault: 'pppoe-password', setup: 'isp-pppoe' },
  { name: 'ISP IP change', family: 'provider-router', fault: 'isp-ip-change', setup: 'isp-static' },
  { name: 'RAID disk failure + rebuild', family: 'server', fault: 'raid-disk', node: 'SERVER-02' },
  { name: 'Second disk fails during rebuild', family: 'server', fault: 'raid-second-disk', node: 'SERVER-01' },
  { name: 'Storage controller A failure', family: 'storage-array', fault: 'controller-a', setup: 'iscsi' },
  { name: 'Zoning disabled', family: 'san-switch', fault: 'zoning-disabled', node: 'SAN-A' },
  { name: 'iSCSI CHAP mismatch', family: 'storage-array', fault: 'chap-mismatch', setup: 'iscsi' },
  { name: 'Pool full → read-only', family: 'storage-array', fault: 'pool-full', setup: 'iscsi' },
  { name: 'VM overcommit', family: 'server', fault: 'vm-overcommit', node: 'SERVER-02' },
  { name: 'Host firewall blocks the intranet', family: 'server', fault: 'host-firewall' },
  { name: 'AP not authorized', family: 'access-point', fault: 'ap-unauthorized', node: 'F1-finance-AP' },
  { name: 'GPU thermal throttling', family: 'gpu-server', fault: 'gpu-airflow', node: 'GPU-01' },
  { name: 'NFS export rule', family: 'nas', fault: 'nfs-export', setup: 'nas' },
  { name: 'Workstation wrong gateway', family: 'pc', fault: 'pc-static-gateway', node: 'F1-sales-PC' },
];
// Builds the lab, injects the fault and returns the record the game keeps in challenge.logic.
export function beginLogicChallenge(def, world, network, byId) {
  const b = builder(world, byId, 'SCENARIO'), extra = {};
  if (def.setup === 'iscsi') { const lab = b.iscsiLab(); extra.node = lab.array.id; }
  if (def.setup === 'isp-static' || def.setup === 'isp-pppoe') { const lab = b.ispLab(def.setup === 'isp-pppoe' ? 'pppoe' : 'fiber30'); extra.node = def.fault === 'cpe-power' ? lab.cpe.id : lab.fw.id; }
  if (def.setup === 'nas') { const lab = b.nasLab(byId[world.office.state.bindings.access[1]]); b.product(lab.nas, 'commission', {}); world.office.tick(Date.now()); extra.node = lab.nas.id; }
  const g = world.operations.game;
  const r = network.logic.inject({ fault: def.fault, node: extra.node || def.node, rack: def.rack }, { game: g, history: () => {} });
  world.operations.settle?.();
  const rec = { ...r, fault: def.fault, family: def.family, device: r.device, check: r.check, label: r.message };
  if (!logicCheck(rec, network).some(c => !c.ok)) throw Error('Challenge setup did not break ' + rec.check + ' on ' + rec.device);
  return rec;
}
// The target check on the device (rack node, PDU, AP or PC) that the fault broke.
export function logicCheck(rec, network) {
  const L = network.logic; L.invalidate();
  const list = rec.family === 'pdu' ? L.pdu(rec.device)?.checks : rec.family === 'access-point' ? L.ap(rec.device)?.checks : rec.family === 'pc' ? L.pc(rec.device)?.checks : network.nodes?.[rec.device] ? null : null;
  const checks = list || (L.ctx().byId[rec.device] ? L.checks(L.ctx().byId[rec.device]) : []);
  return checks.filter(c => c.id === rec.check || c.id.startsWith(rec.check + '-'));
}
export function logicDone(rec, network) { const list = logicCheck(rec, network); return list.every(c => c.ok); }
