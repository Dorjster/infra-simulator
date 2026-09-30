// NAS logic (PowerScale OneFS node, HPE StoreOnce NAS target).
//
// State machine: no AC ──cord──▶ booting ──▶ cluster/appliance setup (identity, management) ──▶
//   file service configured (access zone / NAS target on a data port, SMB or NFS) ──▶ serving.
// Shares come from the company file-service model (the office evaluator uses the same records):
// SMB share permissions from company users/groups, NFS export rules by client subnet, quotas.
// Clients reach a share only through the normal network path (VLAN, gateway, policy) and the rules.
import { chk, warn, ordered, firstFailure, healthOf, baseChecks, managementCheck, baseLeds, alarmsFrom, portsState, powerState, bootState, table, physicalOffline, configuredProduct, productProfile } from './common.js';

export function sharesOf(n, ctx) {
  const s = ctx.office?.state; if (!s) return [];
  const services = Object.values(s.services).filter(x => x.host === n.id);
  return Object.values(s.shares).filter(sh => services.some(x => x.id === sh.service)).map(sh => { const svc = s.services[sh.service], used = Object.values(s.files[sh.id] || {}).reduce((t, f) => t + f.size, 0); return { ...sh, ip: svc.ip, vlan: svc.vlan, running: svc.running, usedMB: used, quotaMB: sh.quota }; });
}
export function state(n, ctx) {
  const c = checks(n, ctx), p = configuredProduct(n);
  return { power: powerState(n), boot: bootState(n), mgmt: { ip: n.net.ip }, health: healthOf(c), ports: portsState(n, ctx), services: sharesOf(n, ctx).map(x => ({ id: x.id, protocol: x.protocol, running: x.running })), nas: p.nas || null, shares: sharesOf(n, ctx), alarms: alarmsFrom(n, c, 'nas') };
}
export function checks(n, ctx) {
  const out = baseChecks(n, ctx), p = configuredProduct(n), nas = p.nas;
  if (n.spec) { out.push(chk('identity', 'management', !!p.identity.passwordSet, 'Cluster / appliance setup incomplete (administrator and name)', 'System → identity', 'identity')); out.push(managementCheck(n, ctx)); }
  out.push(chk('nas-config', 'service', !!nas, 'No access zone / NAS target configured · nothing is served', productProfile(n).family === 'powerscale' ? 'Access zones: data IP, VLAN, SMB or NFS' : 'NAS targets: data IP, VLAN, protocol', 'nas'));
  if (nas) { const port = n.ports.find(x => x.name === nas.port); out.push(chk('nas-link', 'link', !!port?.link && !port.link.unplugged && !port.link.disabled, 'Data interface ' + (nas.port || '?') + ' (' + nas.ip + ', VLAN ' + nas.vlan + ') has no link', 'Cable the data port to a switch port in VLAN ' + nas.vlan, 'nas')); }
  for (const sh of sharesOf(n, ctx)) {
    if (sh.protocol === 'NFS') out.push(warn('export-' + sh.id, 'application', (sh.subnets || '').split(',').some(x => /^10\.10\./.test(x.trim()) || x.trim() === 'any'), 'NFS export ' + sh.id + ' allows only ' + sh.subnets + ' · no company client subnet can mount it', 'Add the client subnet (e.g. 10.10.0.0/16) to the export rule', 'nas-shares'));
    out.push(warn('quota-' + sh.id, 'application', !sh.quotaMB || sh.usedMB < sh.quotaMB, 'Share ' + sh.id + ' at quota (' + sh.usedMB + ' / ' + sh.quotaMB + ' MB) · writes fail', 'Raise the quota or delete files', 'nas-shares'));
  }
  return ordered(out);
}
export function leds(n, ctx) { return baseLeds(n, ctx, checks(n, ctx)); }
export function cli(n, cmd, session, ctx) {
  const lower = cmd.trim().toLowerCase().replace(/\s+/g, ' '), sh = sharesOf(n, ctx), onefs = productProfile(n).family === 'powerscale';
  if (lower === 'isi smb shares list' || lower === 'nas show shares' && !onefs) return table(['Share Name', 'Path', 'Read', 'Write'], sh.filter(x => x.protocol === 'SMB').map(x => [x.id, '/ifs/' + x.id, x.read, x.write]), [20, 22, 18, 18]);
  if (lower === 'isi nfs exports list') return table(['ID', 'Path', 'Clients', 'Access'], sh.filter(x => x.protocol === 'NFS').map((x, i) => [i + 1, '/ifs/' + x.id, x.subnets, x.write ? 'rw' : 'ro']), [4, 22, 26, 7]);
  if (lower === 'isi quota quotas list' || lower === 'nas show quotas') return table(['Path', 'Hard', 'Used'], sh.map(x => ['/ifs/' + x.id, x.quotaMB + ' MB', x.usedMB + ' MB']), [24, 12, 12]);
  if (lower === 'isi status' || lower === 'system show status') { const s = state(n, ctx); return 'Cluster Name: ' + (configuredProduct(n).identity.name || n.id) + '\nCluster Health: [ ' + (s.health === 'ok' ? 'OK' : 'ATTN') + ' ]\nData IP: ' + (s.nas ? s.nas.ip + ' VLAN ' + s.nas.vlan : 'not configured') + '\nShares: ' + sh.length; }
  return null;
}
export function unknown(n) { return productProfile(n).family === 'powerscale' ? "Unknown command. Run 'isi --help'" : 'ERROR: Unknown command'; }
export function gui(n, ctx) {
  const st = state(n, ctx), f = firstFailure(checks(n, ctx));
  return { summary: [['File service', st.nas ? st.nas.protocol + ' ' + st.nas.ip : 'not configured', st.nas ? 'ok' : 'warn'], ['Shares', String(st.shares.length), ''], ['Health', st.health, st.health === 'ok' ? 'ok' : st.health === 'warning' ? 'warn' : 'crit']], blocking: f, pages: { 'nas-shares': { group: 'File services', title: 'Shares, exports and quotas', tables: [{ title: 'SMB shares and NFS exports', heads: ['Share', 'Protocol', 'Read groups', 'Write groups', 'NFS clients', 'Quota'], rows: st.shares.map(x => [x.id, x.protocol, x.read, x.write, x.protocol === 'NFS' ? x.subnets : '—', x.usedMB + ' / ' + x.quotaMB + ' MB']) }] } } };
}
export const faults = [{ id: 'nfs-export', label: 'NFS export rule excludes the clients', check: 'export', family: 'nas' }];
// Commands this module answers (used by ? and Tab in the laptop terminal).
export const commands = ['isi smb shares list', 'nas show shares', 'isi nfs exports list', 'isi quota quotas list', 'nas show quotas', 'isi status', 'system show status'];
export default { family: 'nas', match: n => n.type === 'storage' && ['powerscale', 'storeonce'].includes(productProfile(n).family), state, checks, leds, cli, gui, faults, commands, unknown };
