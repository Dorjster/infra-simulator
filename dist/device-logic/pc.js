// Employee PC logic. PCs live in the company model (office state); the NIC is patched to a wall
// outlet → patch panel → access-switch port (or joins an SSID).
//
// State machine: off ──power──▶ booting (2 s) ──▶ link (outlet patched, switch port up) ──DHCP DORA──▶
//   IPv4 (lease or 169.254.x.x) ──▶ DNS / gateway / policy / service (office path evaluator).
// Every command output (ipconfig /all, ping, tracert, nslookup, net use) is built from the same path
// evaluation the office, monitoring and contracts use, so the answers cannot disagree.
import { chk, ordered, firstFailure, led } from './common.js';

const LAYER = { 'Physical and access network': 'link', 'VLAN switching path': 'l2', 'IPv4 / DHCP': 'l3', 'Power and cooling': 'physical', 'DNS resolver': 'service', 'DNS record': 'service', 'Default gateway': 'l3', 'Routing': 'l3' };
const userOf = (pc, ctx, session) => session?.user || ctx.office.state.users[pc.department === 'executive' ? 'ceo' : pc.department] || null;
export function dora(pc, ctx) {
  const o = ctx.office, a = o.access(pc);
  if (!a.ok) return { ok: false, steps: ['DHCPDISCOVER sent (no link: ' + a.reason + ')'], lease: null, reason: a.reason };
  const l = o.lease(pc, a), gw = ctx.office.state.vlans[a.vlan]?.ip || '?';
  if (!pc.dhcp) return { ok: l.ok, steps: ['Static IPv4 configuration (DHCP disabled)'], lease: l, vlan: a.vlan };
  if (!l.ok) return { ok: false, steps: ['DHCPDISCOVER broadcast on VLAN ' + a.vlan, 'no DHCPOFFER · ' + l.reason, 'APIPA: 169.254.' + (pc.mac.charCodeAt(12) % 250 + 1) + '.' + (pc.mac.charCodeAt(15) % 250 + 1)], lease: l, vlan: a.vlan, reason: l.reason };
  return { ok: true, steps: ['DHCPDISCOVER broadcast on VLAN ' + a.vlan, 'DHCPOFFER ' + l.ip + ' from ' + gw, 'DHCPREQUEST ' + l.ip, 'DHCPACK ' + l.ip + '/' + l.prefix + ' gw ' + l.gateway + ' dns ' + l.dns + (l.reserved ? ' (reservation)' : '')], lease: l, vlan: a.vlan, server: gw };
}
export function state(pc, ctx, session) {
  const r = ctx.office.evaluate(pc.id, 'https://example.test', userOf(pc, ctx, session)), d = dora(pc, ctx), c = checks(pc, ctx, session, r);
  return { id: pc.id, power: pc.power, mode: pc.mode, outlet: pc.port, dhcp: d, internet: r.ok, reason: r.reason, health: firstFailure(c) ? 'critical' : 'ok', alarms: c.filter(x => !x.ok).map(x => ({ id: pc.id + ':' + x.id, device: pc.id, severity: 'warning', kind: 'workstation', check: x.id, layer: x.layer, message: x.detail, fixHint: x.fixHint, where: x.where })) };
}
export function checks(pc, ctx, session, r = ctx.office.evaluate(pc.id, 'https://example.test', userOf(pc, ctx, session))) {
  const out = [chk('power', 'power', pc.power && !(pc.bootUntil > Date.now()), pc.id + ' is off or booting', 'Press the PC power button', 'desktop')];
  for (const s of r.steps || []) out.push(chk(s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), LAYER[s.name] || 'application', s.ok, pc.id + ' · ' + s.name + ': ' + s.detail, 'See the Diagnostics page for this stage', 'desktop'));
  return ordered(out);
}
export function leds(pc) { return { front: [led('power', pc.power ? 'green' : 'off')], psu: [], ports: [led('NIC', pc.connected && pc.mode === 'LAN' ? 'green' : 'off', 'activity')] }; }
const maskOf = p => [0, 1, 2, 3].map(i => 256 - 2 ** (8 - Math.max(0, Math.min(8, p - 8 * i)))).join('.');
const host = x => String(x || '').replace(/^\w+:\/\//, '').split(/[/:]/)[0];
export function cli(pc, cmd, session, ctx) {
  const o = ctx.office, s = o.state, text = cmd.trim(), lower = text.toLowerCase(), user = userOf(pc, ctx, session);
  if (!pc.power) return 'The PC is powered off.';
  let m;
  if (lower === 'ipconfig /all' || lower === 'ipconfig') {
    const d = dora(pc, ctx), a = o.access(pc), l = d.lease, apipa = d.steps.find(x => x.startsWith('APIPA'));
    const head = 'Windows IP Configuration\n\n   Host Name . . . . . . . . . . . . : ' + pc.id + '\n\n' + (pc.mode === 'Wi-Fi' ? 'Wireless LAN adapter Wi-Fi:' : 'Ethernet adapter Ethernet:') + '\n\n';
    if (!a.ok) return head + '   Media State . . . . . . . . . . . : Media disconnected (' + a.reason + ')\n   Physical Address. . . . . . . . . : ' + pc.mac.toUpperCase().replace(/:/g, '-');
    return head + '   Physical Address. . . . . . . . . : ' + pc.mac.toUpperCase().replace(/:/g, '-') + '\n   DHCP Enabled. . . . . . . . . . . : ' + (pc.dhcp ? 'Yes' : 'No') + '\n' + (l?.ok ? '   IPv4 Address. . . . . . . . . . . : ' + l.ip + '(Preferred)\n   Subnet Mask . . . . . . . . . . . : ' + maskOf(l.prefix) + '\n   Default Gateway . . . . . . . . . : ' + (l.gateway || '') + (pc.dhcp ? '\n   DHCP Server . . . . . . . . . . . : ' + d.server + '\n   Lease Obtained. . . . . . . . . . : DORA ' + d.steps.length + '/4 complete' : '') + '\n   DNS Servers . . . . . . . . . . . : ' + (l.dns || '') : '   Autoconfiguration IPv4 Address. . : ' + (apipa ? apipa.split(': ')[1] : '0.0.0.0') + '(Preferred)\n   Subnet Mask . . . . . . . . . . . : 255.255.0.0\n   Default Gateway . . . . . . . . . :\n   DHCP: ' + (d.reason || 'no offer')) + '\n\n   DHCP exchange:\n' + d.steps.map(x => '     ' + x).join('\n');
  }
  if (lower === 'ipconfig /renew') { const d = dora(pc, ctx); return d.steps.join('\n') + (d.ok ? '' : '\nAn error occurred while renewing interface Ethernet : unable to contact your DHCP server. Request has timed out.'); }
  if ((m = /^nslookup (\S+)$/i.exec(text))) {
    const d = dora(pc, ctx), r = o.evaluate(pc.id, 'https://' + m[1], user), dns = r.steps.find(x => x.name === 'DNS resolver'), rec = r.steps.find(x => x.name === 'DNS record');
    const server = d.lease?.dns || '0.0.0.0';
    if (!d.ok && !d.lease?.ok) return 'DNS request timed out.\n    timeout was 2 seconds.\nDefault Server:  UnKnown\nAddress:  ' + server + '\n*** Request to UnKnown timed-out (' + (d.reason || 'no IPv4 address') + ')';
    if (dns && !dns.ok) return 'Server:  UnKnown\nAddress:  ' + server + '\n\n*** UnKnown can\'t find ' + m[1] + ': ' + (/NXDOMAIN/.test(dns.detail) ? 'Non-existent domain' : 'Server failed') + '\n(' + dns.detail + ')';
    if (rec && !rec.ok) return 'Server:  ' + server + '\nAddress:  ' + server + '\n\n*** ' + server + ' can\'t find ' + m[1] + ': Non-existent domain';
    const ip = s.dns[m[1]]?.enabled ? s.dns[m[1]].ip : '198.51.100.20';
    return 'Server:  ' + server + '\nAddress:  ' + server + '\n\n' + (s.dns[m[1]] ? '' : 'Non-authoritative answer:\n') + 'Name:    ' + m[1] + '\nAddress:  ' + ip;
  }
  if ((m = /^ping (\S+)$/i.exec(text))) {
    const r = o.evaluate(pc.id, 'icmp://' + host(m[1]), user), f = r.steps?.find(x => !x.ok);
    const ip = /^\d/.test(m[1]) ? m[1] : s.dns[m[1]]?.ip || '198.51.100.20';
    if (f && ['DNS resolver', 'DNS record'].includes(f.name)) return 'Ping request could not find host ' + m[1] + '. Please check the name and try again.\n(' + f.detail + ')';
    return '\nPinging ' + m[1] + ' [' + ip + '] with 32 bytes of data:\n' + (r.ok ? Array(4).fill('Reply from ' + ip + ': bytes=32 time=' + (r.latency || 1) + 'ms TTL=' + (/^10\./.test(ip) ? 63 : 54)).join('\n') + '\n\nPing statistics for ' + ip + ':\n    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)' : Array(4).fill(f?.name === 'Physical and access network' || f?.name === 'IPv4 / DHCP' ? 'PING: transmit failed. General failure.' : 'Request timed out.').join('\n') + '\n\nPing statistics for ' + ip + ':\n    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),\n(' + (f ? f.name + ': ' + f.detail : r.reason) + ')');
  }
  if ((m = /^tracert (\S+)$/i.exec(text))) {
    const r = o.evaluate(pc.id, 'icmp://' + host(m[1]), user), d = dora(pc, ctx), ip = /^\d/.test(m[1]) ? m[1] : s.dns[m[1]]?.ip || '198.51.100.20', internal = /^10\./.test(ip), hops = [];
    const f = r.steps?.find(x => !x.ok), gw = d.lease?.gateway || '?';
    const passed = n => r.steps?.some(x => x.name === n && x.ok);
    if (!d.lease?.ok) hops.push('  1     *        *        *     Request timed out. (' + (f?.detail || 'no address') + ')');
    else {
      hops.push('  1    <1 ms    <1 ms    <1 ms  ' + gw);
      if (!internal) hops.push(r.ok || passed('ISP link state') || passed('SD-WAN') ? '  2     4 ms     4 ms     5 ms  ' + (s.wan.gateway || 'ISP gateway') : '  2     *        *        *     Request timed out. (' + (f ? f.name + ': ' + f.detail : '') + ')');
      if (r.ok) hops.push('  ' + (internal ? 2 : 3) + '    ' + (internal ? '1 ms' : '12 ms') + '    ' + (internal ? '1 ms' : '12 ms') + '    ' + (internal ? '1 ms' : '12 ms') + '  ' + ip);
      else if (internal) hops.push('  2     *        *        *     Request timed out. (' + (f ? f.name + ': ' + f.detail : r.reason) + ')');
    }
    return '\nTracing route to ' + m[1] + ' [' + ip + ']\nover a maximum of 30 hops:\n\n' + hops.join('\n') + '\n\n' + (r.ok ? 'Trace complete.' : 'Trace stopped: ' + (f ? f.name : r.reason));
  }
  if (lower === 'net use') { const rows = Object.values(s.shares).filter(sh => sh.protocol === 'SMB').map(sh => { const r = o.shareAccess(pc.id, sh.id, user); return (r.ok ? 'OK           ' : 'Unavailable  ') + '\\\\' + (s.services[sh.service]?.name || s.services[sh.service]?.ip || '?').split('.')[0] + '\\' + sh.id + (r.ok ? '' : '  (' + r.reason + ')'); }); return 'Status       Remote\n-------------------------------------------------------------------------------\n' + rows.join('\n') + '\nThe command completed successfully.'; }
  return '\'' + text.split(/\s+/)[0] + '\' is not recognized as an internal or external command,\noperable program or batch file.';
}
export function alarms(ctx) { if (!ctx.office) return []; return Object.values(ctx.office.state.pcs).filter(p => p.power && p.id !== 'ADMIN-PC').flatMap(p => state(p, ctx).alarms.slice(0, 1)); }
export const faults = [{ id: 'pc-static-gateway', label: 'Wrong static gateway on a PC', check: 'default-gateway', family: 'pc' }, { id: 'pc-unpatched', label: 'Wall outlet not patched', check: 'physical-and-access-network', family: 'pc' }];
// Commands this module answers (used by ? and Tab in the laptop terminal).
export const commands = ['ipconfig /all', 'ipconfig', 'ipconfig /renew', 'net use', 'ping <host>', 'tracert <host>', 'nslookup <name>'];
export default { family: 'pc', match: n => n.type === 'pc', state, checks, leds, cli, gui: (pc, ctx) => ({ summary: [], blocking: firstFailure(checks(pc, ctx)), pages: {} }), faults, commands, alarms };
