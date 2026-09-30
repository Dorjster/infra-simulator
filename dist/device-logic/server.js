// Server logic (Dell PowerEdge + iDRAC9, HPE ProLiant + iLO 6, FortiAnalyzer/FortiSIEM appliances).
//
// State machine:
//   no AC ──PSU cord──▶ standby (iDRAC/iLO alive on standby power, host off)
//   standby ──power button / racadm serveraction powerup──▶ POST (memory/CPU check, 4 s)
//   POST ──boot order: boot device healthy + OS installed──▶ OS running
//   POST ──no OS or failed boot device──▶ "No boot device available" on the virtual console
//   OS running ──last feed lost──▶ no AC (running installer fails, VMs stop; back only after POST)
// Storage controller: see raid.js (degraded → rebuilding → optimal; failed = data lost).
// Virtualization: port groups on NIC uplinks, datastores (local or SAN), VMs with overcommit limits
// (4:1 vCPU, 125 % RAM) checked at power-on, services with host-firewall ports.
import { chk, warn, ordered, firstFailure, healthOf, baseChecks, managementCheck, baseLeds, alarmsFrom, portsState, powerState, bootState, led, table, ERR, peerOf, isMgmtPort, physicalOffline, productProfile, configuredProduct, mac, memo } from './common.js';
import { deviceRuntime, installStatus, resourceUse, bootHealth, VCPU_RATIO, RAM_RATIO } from '../device-runtime.js';
import { controller, vdState, bootDevice, vdUsableGB } from '../raid.js';
import { hostIdentifiers } from '../storage-access.js';

const isHPE = n => productProfile(n).family === 'ilo';
export const bmcName = n => isHPE(n) ? 'iLO 6' : 'iDRAC9';
export function tagPassword(n) { let h = 11; for (const c of n.id) h = (h * 37 + c.charCodeAt(0)) >>> 0; return h.toString(36).toUpperCase().padStart(8, 'X').slice(0, 8); }
export function virtualConsole(n) {
  const b = bootState(n), r = deviceRuntime(n), boot = bootHealth(n), inst = installStatus(n);
  if (b.phase === 'off' || b.phase === 'standby') return 'No signal (host powered off)';
  if (b.phase === 'post') return (isHPE(n) ? 'HPE ProLiant System BIOS · ' : 'Dell PowerEdge · Lifecycle Controller · ') + 'POST: memory 512 GB OK · 2 CPUs OK · ' + b.text;
  if (b.phase === 'fault') return 'POST halted: ' + b.text;
  if (inst.state === 'installing') return 'Installing ' + r.install.os + ' from virtual media… (' + inst.reason + ')';
  if (!boot.ok) return 'No boot device available.\n' + boot.reason + '\nPress F1 to retry boot, F2 for System Setup, F11 for Boot Manager';
  if (!r.os) return 'No boot device available.\nNo operating system found on ' + (controller(n, r).boss.model) + '\nPress F1 to retry boot, F2 for System Setup, F11 for Boot Manager';
  return r.hypervisor === 'VMware ESXi' ? 'VMware ESXi 8.0.2 (DCUI)\n' + (n.net.hostname || n.id) + ' · http://' + (r.hostIP || '0.0.0.0') + '/ · <F2> Customize System' : (r.os + ' · ' + (n.net.hostname || n.id).toLowerCase() + ' login: _');
}
export function sensors(n) {
  const p = n.physical || {}, pw = powerState(n), running = bootState(n).phase === 'running', reversed = !!p.reversed;
  const inlet = reversed ? 41 : 22, cpu = running ? (reversed ? 88 : 54) : 30;
  return { inlet, exhaust: running ? inlet + 14 : inlet + 2, cpu, fans: running ? (reversed ? 'max (18 000 rpm)' : '7 200 rpm') : pw.live ? '1 800 rpm (standby)' : 'stopped', watts: pw.watts, throttled: reversed && running };
}
function vmRows(n, ctx) { const r = deviceRuntime(n); return Object.values(r.vms).map(v => ({ vm: v, st: v.on ? ctx.network.vmState(n, v) : { ok: false, reason: 'powered off' } })); }
export function state(n, ctx) {
  const r = deviceRuntime(n), c = checks(n, ctx), ctrl = controller(n, r);
  return { power: powerState(n), boot: { ...bootState(n), console: virtualConsole(n), bootOrder: r.bootOrder || ['Hard drive (' + (r.bootTarget || 'BOSS') + ')', 'PXE NIC-1', 'Virtual media'] }, mgmt: { ip: n.net.ip, bmc: bmcName(n), standby: true, defaultUser: isHPE(n) ? 'Administrator' : 'root', tagPassword: tagPassword(n) }, health: healthOf(c), ports: portsState(n, ctx).map((p, i) => ({ ...p, mac: mac(n, i) })), services: [r, ...Object.values(r.vms)].flatMap(t => Object.values(t.services || {}).map(s => ({ id: s.id, on: t.id || 'host', running: s.running, port: s.port, firewall: s.firewall }))), controller: { model: ctrl.model, vds: ctrl.vds.map(vd => ({ ...vd, ...vdState(ctrl, vd) })), disks: ctrl.disks, boss: { ...ctrl.boss, state: bootDevice(ctrl) } }, sensors: sensors(n), sel: n.net.sel || [], alarms: alarmsFrom(n, c, n.type) };
}
export function checks(n, ctx) {
  const out = baseChecks(n, ctx, { standbyManagement: true }), r = deviceRuntime(n), ctrl = controller(n, r), s = sensors(n);
  if (n.spec) out.push(managementCheck(n, ctx, 'management'));
  const running = !physicalOffline(n);
  if (!n.spec && n.physical?.fault === 'disk') out.push(warn('vd-legacy', 'boot', false, 'Virtual disk VD0 degraded · physical disk 1 failed', 'Replace the failed drive (Equipment → Replace part → drive)', 'srv-storage'));
  for (const vd of ctrl.vds) { const st = vdState(ctrl, vd); if (st.state === 'failed') out.push(chk('vd-' + vd.id, 'boot', false, 'Virtual disk ' + vd.id + ' (' + vd.level + ') FAILED · ' + (st.missing || st.failed).length + ' member disks lost (' + st.failed.length + ' failed, ' + ((st.missing || st.failed).length - st.failed.length) + ' still rebuilding) · data lost', 'Replace the disks, delete and recreate ' + vd.id + ', then reinstall / restore', 'srv-storage')); else out.push(warn('vd-' + vd.id, 'boot', st.state === 'optimal', 'Virtual disk ' + vd.id + ' (' + vd.level + ') ' + st.state + (st.state === 'rebuilding' ? ' ' + st.progress + ' %' : '') + ' · failed disk ' + st.failed.join(', '), st.state === 'rebuilding' ? 'Wait for the rebuild; do not pull another disk' : 'Replace failed disk ' + st.failed.join(', ') + ' (a hot spare rebuilds automatically)', 'srv-storage')); }
  const bd = bootDevice(ctrl); if (bd !== 'optimal') out.push(bd === 'failed' ? chk('boss', 'boot', false, ctrl.boss.model + ' failed · both M.2 disks lost', 'Replace the M.2 disks and reinstall the OS', 'srv-storage') : warn('boss', 'boot', false, ctrl.boss.model + ' ' + bd, 'Replace the failed M.2 disk', 'srv-storage'));
  if (running) {
    const i = installStatus(n), boot = bootHealth(n);
    out.push(chk('install', 'boot', i.state !== 'failed', i.reason, 'Virtual media → run the installer again (keep the host powered)', 'os-install'));
    out.push(chk('boot-device', 'boot', boot.ok, 'POST: No boot device available · ' + boot.reason, 'Repair the boot device and reinstall the OS', 'srv-console'));
    if (n.spec) out.push(warn('os', 'boot', !!r.os || i.state === 'installing', 'POST: No boot device available · no operating system installed', 'Virtual media → Install OS (ESXi / Linux / Windows)', 'os-install'));
  }
  out.push(warn('thermal', 'physical', !s.throttled, 'Inlet ' + s.inlet + ' °C above 35 °C warning · CPUs throttled (PROCHOT)', 'Re-mount front-to-back so the inlet faces the cold aisle', 'srv-sensors'));
  // Data NIC teams / port-group uplinks.
  for (const pg of Object.values(r.portgroups)) { const ups = (pg.uplinks || []).map(i => n.ports[i]).filter(Boolean), live = ups.filter(p => p.link && !p.link.unplugged && !p.link.disabled); if (!ups.length) continue; if (!live.length) out.push(chk('uplink-' + pg.id, 'link', false, 'Port group ' + pg.id + ' (VLAN ' + pg.vlan + '): no live uplink (' + ups.map(p => p.name + ' ' + (p.link ? p.link.unplugged ? 'unplugged' : 'down' : 'no cable')).join(', ') + ')', 'Cable the uplink to a switch port that carries VLAN ' + pg.vlan, 'virtual-network')); else out.push(warn('uplink-' + pg.id, 'link', live.length === ups.length, 'Port group ' + pg.id + ' team degraded: ' + ups.filter(p => !live.includes(p)).map(p => p.name).join(', ') + ' down', 'Restore the second uplink for redundancy', 'virtual-network')); }
  for (const v of ctx.network.hostVolumes(n)) out.push(v.state === 'unavailable' ? chk('lun-' + v.volume, 'l3', false, 'LUN ' + v.array + '/' + v.volume + ' dead on all paths · ' + v.reason.replace(/^Unavailable · /, ''), 'Restore the storage paths (see Datastores)', 'datastores') : warn('lun-' + v.volume, 'l3', v.state === 'healthy', 'LUN ' + v.array + '/' + v.volume + ' ' + v.state + ' · ' + v.reason.replace(/^Degraded · /, ''), 'Restore the second storage path', 'datastores'));
  for (const { vm, st } of vmRows(n, ctx)) { if (vm.on) out.push(chk('vm-' + vm.id, 'service', st.ok, 'VM ' + vm.id + ' is not running · ' + st.reason, 'Fix the dependency named in the reason', 'virtualization')); else if (vm.autostart) out.push(chk('vm-' + vm.id, 'service', false, 'VM ' + vm.id + ' (autostart) is powered off' + (vm.lastError ? ' · ' + vm.lastError : ''), 'Power it on; free vCPU/RAM first if the host is overcommitted', 'virtualization')); }
  for (const t of [r, ...Object.values(r.vms)]) for (const sv of Object.values(t.services || {})) { if (t !== r && !t.on) continue; out.push(chk('svc-' + sv.id, 'application', sv.running, 'Service ' + sv.id + ' on ' + (t.id || n.id) + ' is stopped · nothing listens on ' + sv.ip + ':' + sv.port, 'Start the service', 'services')); out.push(chk('fw-' + sv.id, 'application', sv.firewall !== false, 'Host firewall on ' + (t.id || n.id) + ' blocks TCP ' + sv.port + ' for ' + sv.id, 'Open the port in the host firewall (Server services)', 'services')); }
  // Company services installed directly on this host (office roles) use the same listener / host-firewall rules.
  for (const x of Object.values(ctx.office?.state.services || {})) { if (x.host !== n.id || x.managedBy) continue; out.push(chk('svc-' + x.id, 'application', x.running, 'Service ' + x.id + ' on ' + n.id + ' is stopped · nothing listens on ' + x.ip + ':' + x.port, 'Start the service', 'services')); out.push(chk('fw-' + x.id, 'application', String(x.serverFirewall || '').split(',').map(v => v.trim()).includes(String(x.port)), 'Host firewall on ' + n.id + ' blocks TCP ' + x.port + ' for ' + x.id + ' (allowed: ' + (x.serverFirewall || 'none') + ')', 'Open TCP ' + x.port + ' in the host firewall (Server / Roles and services)', 'services')); }
  return ordered(out);
}
export function leds(n, ctx) {
  const c = checks(n, ctx), base = baseLeds(n, ctx, c), r = deviceRuntime(n), ctrl = controller(n, r);
  base.disks = ctrl.disks.map(d => led('Disk ' + d.slot, d.state === 'failed' ? 'amber' : d.state === 'rebuilding' ? 'green' : d.state === 'online' || d.state === 'hotspare' ? 'green' : 'off', d.state === 'failed' ? 'fast' : d.state === 'rebuilding' ? 'slow' : 'solid'));
  base.front.push(led('iDRAC', powerState(n).live ? 'green' : 'off'));
  return base;
}
const racadmSel = n => (n.net.sel || []).map((e, i) => 'Record:      ' + (i + 1) + '\nDate/Time:   ' + new Date(e.at).toISOString().replace('T', ' ').slice(0, 19) + '\nSeverity:    ' + (e.severity === 'critical' ? 'Critical' : e.severity === 'warning' ? 'Non-Critical' : 'Ok') + '\nDescription: ' + (e.state === 'deasserted' ? 'Deasserted: ' : '') + e.message).join('\n-------------------------------------------------------------------------------\n') || 'No SEL records.';
export function cli(n, cmd, session, ctx) {
  const text = cmd.trim(), lower = text.toLowerCase().replace(/\s+/g, ' '), r = deviceRuntime(n), ctrl = controller(n, r), hpe = isHPE(n);
  let m;
  if (lower === 'racadm getsel' || lower === 'show /system1/log1' || lower === 'show /system1/log1/record') return racadmSel(n);
  if (lower === 'racadm clrsel') return { change: { type: 'bmc', node: n.id, op: 'clear-sel' }, text: 'The SEL was cleared successfully.' };
  if (lower === 'racadm lclog view') return (r.jobs || []).slice(0, 20).map(j => 'SeqNumber = ' + j.at + '\nMessage = ' + j.message + '\nStatus = ' + j.state).join('\n\n') || 'No Lifecycle Log entries.';
  if (lower === 'racadm getsensorinfo' || lower === 'show /system1/sensor1' || lower === 'show /system1/sensors') { const s = sensors(n), pw = powerState(n); return ['Sensor Type : TEMPERATURE', '<Sensor Name>        <Status>   <Reading>  <Critical>', 'System Board Inlet   ' + (s.inlet > 35 ? 'Warning ' : 'Ok      ') + '   ' + s.inlet + 'C        42C', 'System Board Exhaust Ok         ' + s.exhaust + 'C        75C', 'CPU1 Temp            ' + (s.throttled ? 'Warning ' : 'Ok      ') + '   ' + s.cpu + 'C        95C', '', 'Sensor Type : FAN', 'System Board Fan1    Ok         ' + s.fans, '', 'Sensor Type : POWER', ...pw.psus.map(p => p.id + ' Status          ' + (p.state === 'ok' ? 'Present, Ok' : p.state)), 'System Board Pwr Consumption ' + s.watts + ' W', 'PS Redundancy        ' + (pw.redundant ? 'Full Redundant' : 'Lost')].join('\n'); }
  if (lower === 'racadm serveraction powerstatus' || lower === 'power') return 'Server power status: ' + (n.physical?.on === false ? 'OFF' : 'ON');
  if ((m = /^racadm serveraction (powerup|powerdown|hardreset|powercycle|graceshutdown)$/i.exec(text)) || (m = /^power (on|off|reset)$/i.exec(text))) { const op = { powerup: 'on', on: 'on', powerdown: 'off', off: 'off', graceshutdown: 'off', hardreset: 'cycle', powercycle: 'cycle', reset: 'cycle' }[m[1].toLowerCase()]; return { change: { type: 'bmc', node: n.id, op: 'power', value: op }, text: hpe ? 'status=0\nstatus_tag=COMMAND COMPLETED' : 'Server power operation initiated successfully' }; }
  if (lower === 'racadm storage get controllers' || lower === 'racadm raid get controllers') return 'RAID.SL.1-1\n   Name = ' + ctrl.model + '\n   Status = ' + (ctrl.vds.some(v => vdState(ctrl, v).state !== 'optimal') ? 'Degraded' : 'Ok') + '\nAHCI.Slot.1-1\n   Name = ' + ctrl.boss.model + '\n   Status = ' + (bootDevice(ctrl) === 'optimal' ? 'Ok' : bootDevice(ctrl));
  if (lower === 'racadm storage get pdisks' || lower === 'racadm raid get pdisks -o' || lower === 'racadm storage get pdisks -o') return ctrl.disks.map(d => 'Disk.Bay.' + d.slot + ':Enclosure.Internal.0-1:RAID.SL.1-1\n   Status = ' + (d.state === 'failed' ? 'Critical' : 'Ok') + '\n   State = ' + { online: 'Online', ready: 'Ready', failed: 'Failed', hotspare: 'Hot Spare', rebuilding: 'Rebuilding' }[d.state] + '\n   Size = ' + d.sizeGB + ' GB').join('\n') + '\n' + ctrl.boss.disks.map(d => 'Disk.Direct.' + d.slot + ':AHCI.Slot.1-1\n   State = ' + d.state).join('\n');
  if (lower === 'racadm storage get vdisks' || lower === 'racadm raid get vdisks -o' || lower === 'racadm storage get vdisks -o') return [...ctrl.vds.map(vd => { const st = vdState(ctrl, vd); return 'Disk.Virtual.' + vd.id.slice(2) + ':RAID.SL.1-1\n   Name = ' + vd.name + '\n   Layout = ' + vd.level.replace(' ', '-') + '\n   Status = ' + (st.state === 'optimal' ? 'Ok' : st.state === 'failed' ? 'Critical' : 'Degraded') + '\n   State = ' + st.state[0].toUpperCase() + st.state.slice(1) + (st.state === 'rebuilding' ? ' (' + st.progress + '%)' : '') + '\n   Size = ' + vdUsableGB(vd.level, vd.disks.length, ctrl.disks[vd.disks[0]]?.sizeGB || 1920) + ' GB\n   PhysicalDisks = ' + vd.disks.map(s => 'Disk.Bay.' + s).join(','); }), 'Disk.Virtual.0:AHCI.Slot.1-1 (BOSS)\n   Layout = RAID-1\n   State = ' + bootDevice(ctrl)].join('\n');
  if (lower === 'racadm get idrac.nic' || lower === 'show /map1/enetport1') return (hpe ? 'iLO dedicated network port\n' : '[Key=iDRAC.Embedded.1#NIC.1]\n') + 'Enable=Enabled\nMACAddress=' + mac(n, 99) + '\nIPv4.Address=' + n.net.ip + '\nIPv4.Netmask=' + n.net.prefix + '\nIPv4.DHCPEnable=' + (n.net.ip === '0.0.0.0' ? 'Enabled' : 'Disabled') + '\nDefault credentials (pull-out tag): ' + (hpe ? 'Administrator' : 'root') + ' / ' + tagPassword(n);
  if (lower === 'racadm hwinventory nic' || lower === 'esxcli network nic list') return table(['Name', 'MAC Address', 'Link', 'Speed', 'Peer'], n.ports.filter(p => !p.service && !isMgmtPort(p)).map(p => { const i = n.ports.indexOf(p), st = portsState(n, ctx)[i]; return [p.name, p.medium === 'Fibre Channel' ? 'WWPN ' + hostIdentifiers(n)[p.name === 'HBA-B' ? 'wwpnB' : 'wwpnA'] : mac(n, i), st.state === 'up' ? 'Up' : 'Down', st.state === 'up' ? p.speed * 1000 + ' Mbps' : '-', st.state === 'up' ? st.reason.replace(/^up \S+ → /, '') : st.reason]; }), [8, 28, 5, 10, 40]);
  if (lower === 'racadm get bios.biosbootsettings.bootseq' || lower === 'show /system1/bootconfig1') return 'BootSeq=' + (r.bootOrder || ['HardDisk.List.1-1', 'NIC.PxeDevice.1-1', 'Optical.iDRACVirtual.1-1']).join(',');
  if (lower === 'console' || lower === 'racadm vconsole' || lower === 'vsp') return virtualConsole(n);
  if (lower === 'vim-cmd vmsvc/getallvms') return r.hypervisor ? table(['Vmid', 'Name', 'Datastore', 'Guest OS', 'Power'], Object.values(r.vms).map((v, i) => [i + 1, v.id, '[' + v.datastore + ']', v.os, v.on ? 'poweredOn' : 'poweredOff']), [5, 12, 14, 16, 11]) : '-sh: vim-cmd: not found';
  if (lower === 'esxcli iscsi session list') { const h = configuredProduct(n).host, vols = ctx.network.hostVolumes(n).filter(v => v.paths?.length); return h.protocol !== 'iSCSI' ? 'No iSCSI adapter enabled.' : vols.flatMap(v => v.paths.map(p => 'vmhba64,' + h.iqn + ',' + p.side + '\n   Adapter: vmhba64\n   Target: ' + v.array + ':' + v.volume + '\n   ISID: 00023d00000' + (p.side === 'A' ? 1 : 2) + '\n   TargetPortalGroupTag: ' + (p.side === 'A' ? 1 : 2) + '\n   AuthenticationMethod: ' + (v.chap ? 'chap' : 'none'))).join('\n') || 'No iSCSI sessions.'; }
  if (lower === 'esxcli storage nmp path list' || lower === 'multipath -ll') { const vols = ctx.network.hostVolumes(n); return vols.length ? vols.map(v => v.array + '/' + v.volume + ' (' + v.state + ')\n' + ['A', 'B'].map(side => { const p = (v.paths || []).find(x => x.side === side); return '  path ' + side + ': ' + (p ? (p.alua === 'optimized' ? 'active (I/O) · active/optimized' : 'active · active/non-optimized') + ' · ' + p.path : 'dead · ' + (v.reason.match(new RegExp('Path ' + side + ': [^·]+'))?.[0] || 'no path')); }).join('\n')).join('\n') : 'No multipath devices.'; }
  if (/^racadm /.test(lower)) return ERR.racadm;
  if (hpe && /^(show|set|power|reset) \//.test(lower)) return ERR.ilo;
  return null;
}
export function unknown(n, cmd) { return isHPE(n) ? ERR.ilo : ERR.racadm; }
export function gui(n, ctx) {
  const st = state(n, ctx), c = st.controller, s = st.sensors, f = firstFailure(checks(n, ctx)), r = deviceRuntime(n), use = resourceUse(n);
  const pages = {
    'srv-storage': { group: 'Storage', title: isHPE(n) ? 'Smart Array / NS204i' : 'Storage controller (PERC / BOSS)', tables: [{ title: c.model + ' · virtual disks', heads: ['VD', 'Name', 'Layout', 'State', 'Disks'], rows: c.vds.map(v => [v.id, v.name, v.level, v.state + (v.state === 'rebuilding' ? ' ' + v.progress + ' %' : ''), v.disks.join(', ')]) }, { title: 'Physical disks', heads: ['Bay', 'Size', 'State'], rows: c.disks.map(d => [d.slot, d.sizeGB + ' GB', d.state]) }, { title: c.boss.model + ' (boot mirror)', heads: ['Disk', 'State'], rows: c.boss.disks.map(d => [d.slot, d.state]) }], notes: ['Boot target: ' + (r.bootTarget || 'BOSS') + ' · usable per VD from the real RAID formula'] },
    'srv-sensors': { group: 'System', title: 'Sensors & power', tables: [{ title: 'Temperatures and fans', heads: ['Sensor', 'Reading', 'State'], rows: [['Inlet', s.inlet + ' °C', s.inlet > 35 ? 'warning' : 'ok'], ['Exhaust', s.exhaust + ' °C', 'ok'], ['CPU', s.cpu + ' °C', s.throttled ? 'throttled' : 'ok'], ['Fans', s.fans, 'ok']] }, { title: 'Power supplies · ' + s.watts + ' W', heads: ['PSU', 'Feed', 'State'], rows: st.power.psus.map(p => [p.id, p.feed || '—', p.state]) }] },
    'srv-logs': { group: 'Maintenance', title: 'System Event Log', tables: [{ title: 'SEL (from state transitions)', heads: ['Time', 'Severity', 'Event'], rows: st.sel.slice(0, 40).map(e => [new Date(e.at).toLocaleTimeString(), e.severity, (e.state === 'deasserted' ? 'Cleared · ' : '') + e.message]) }, { title: 'Lifecycle log', heads: ['Time', 'Job', 'State'], rows: (r.jobs || []).slice(0, 20).map(j => [new Date(j.at).toLocaleTimeString(), j.message, j.state]) }] },
    'srv-console': { group: 'Dashboard', title: 'Virtual console', tables: [], notes: [st.boot.console, 'Boot order: ' + st.boot.bootOrder.join(' → ')] },
    'srv-nics': { group: 'System', title: 'Network devices', tables: [{ title: 'NICs, HBAs and identifiers', heads: ['Port', 'MAC / WWPN', 'Link', 'Detail'], rows: n.ports.filter(p => !p.service).map(p => { const i = n.ports.indexOf(p), ps = st.ports[i]; return [p.name, p.medium === 'Fibre Channel' ? hostIdentifiers(n)[p.name === 'HBA-B' ? 'wwpnB' : 'wwpnA'] : ps.mac, ps.state, ps.reason]; }) }], notes: ['iSCSI IQN: ' + hostIdentifiers(n).iqn, 'Default ' + bmcName(n) + ' credentials on the pull-out tag: ' + st.mgmt.defaultUser + ' / ' + st.mgmt.tagPassword] },
  };
  return { summary: [['Host', st.boot.phase === 'running' ? 'on' : st.boot.phase, st.boot.phase === 'running' ? 'ok' : 'warn'], [bmcName(n), n.net.ip === '0.0.0.0' ? 'no IP' : n.net.ip, n.net.ip === '0.0.0.0' ? 'warn' : 'ok'], ['OS', r.os || 'none', r.os ? 'ok' : 'warn'], ['vCPU', use.cpu + ' / ' + r.cpu * VCPU_RATIO + ' (4:1)', ''], ['Power', s.watts + ' W', ''], ['Health', st.health, st.health === 'ok' ? 'ok' : st.health === 'warning' ? 'warn' : 'crit']], blocking: f, pages };
}
export const faults = [
  { id: 'psu-pull', label: 'PSU cord pulled', check: 'psu-redundancy', family: 'server' },
  { id: 'raid-disk', label: 'RAID member disk failed', check: 'vd-VD0', family: 'server' },
  { id: 'raid-second-disk', label: 'Second disk failed during rebuild', check: 'vd-VD1', family: 'server' },
  { id: 'vm-overcommit', label: 'VM cannot power on (overcommit)', check: 'vm-APP-02', family: 'server' },
  { id: 'host-firewall', label: 'Host firewall closed', check: 'fw-intranet', family: 'server' },
  { id: 'airflow', label: 'Mounted backwards (airflow)', check: 'airflow', family: 'server' },
];
// Commands this module answers (used by ? and Tab in the laptop terminal).
export const commands = ['racadm getsel', 'show /system1/log1', 'show /system1/log1/record', 'racadm clrsel', 'racadm lclog view', 'racadm getsensorinfo', 'show /system1/sensor1', 'show /system1/sensors', 'racadm serveraction powerstatus', 'racadm storage get controllers', 'racadm raid get controllers', 'racadm storage get pdisks', 'racadm raid get pdisks -o', 'racadm storage get pdisks -o', 'racadm storage get vdisks', 'racadm raid get vdisks -o', 'racadm storage get vdisks -o', 'racadm get idrac.nic', 'show /map1/enetport1', 'racadm hwinventory nic', 'esxcli network nic list', 'racadm get bios.biosbootsettings.bootseq', 'show /system1/bootconfig1', 'racadm vconsole', 'vim-cmd vmsvc/getallvms', 'esxcli iscsi session list', 'esxcli storage nmp path list', 'multipath -ll', 'racadm serveraction powerup', 'racadm serveraction powerdown', 'racadm serveraction powercycle', 'racadm serveraction hardreset', 'racadm serveraction graceshutdown', 'power on', 'power off', 'power reset'];
export default { family: 'server', match: n => n.type === 'server', state, checks, leds, cli, gui, faults, commands, unknown };
