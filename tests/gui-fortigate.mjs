// Drives the FortiGate GUI handlers (DOM stub) against the live office network model.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
await new Promise(r => setTimeout(r, 0));
const w = a.lab.world, o = w.office, kit = a.lab.kit, s = () => o.state;
w.apply({ type: 'engineering', action: { type: 'mode', mode: 'free' } }, 'ENGINEER-01');
const fw = a.byId[s().bindings.firewall];
const $ = id => document.getElementById(id), pg = page => { const b = $('product-gui').querySelectorAll('[data-pg-page]').find(b => b.dataset.pgPage === page); assert(b, 'nav ' + page); b.onclick(); };
const val = (id, v) => { $('pg-' + id).value = String(v); }, tick = (id, v) => { $('pg-' + id).checked = v; }, click = async id => { assert.equal(typeof $('pg-' + id).onclick, 'function', id); await $('pg-' + id).onclick(); };
const html = () => $('product-gui').innerHTML, msg = () => $('pg-message').textContent;
kit.interact({ node: fw, port: fw.ports.find(p => p.service && p.medium === 'Ethernet') });
assert.match(html(), /Setup progress/); assert.match(html(), /Firewall policy/);
pg('fg-policy'); assert.match(html(), /Administrator sign-in/, 'company admin login required');
val('fg-user', 'itadmin'); val('fg-pass', 'wrong'); await click('fg-login'); assert.match(msg(), /Invalid/);
pg('fg-policy'); val('fg-user', 'itadmin'); val('fg-pass', 'OfficeLab19!'); await click('fg-login'); assert.match(msg(), /Signed in as itadmin/);
pg('fg-policy'); assert.match(html(), /implicit deny/);
await w.apply({ type: 'office', action: { type: 'login', user: 'finance', pc: 'F1-finance-PC', password: 'OfficeLab19!' } }, 'ENGINEER-01');
const browse = url => w.apply({ type: 'office', action: { type: 'browse', pc: 'F1-finance-PC', url } }, 'ENGINEER-01');
assert((await browse('https://example.test')).ok);
val('fg-pmove', 'internet-20'); await click('fg-ptoggle'); assert.equal(s().policies['internet-20'].enabled, false);
assert.match((await browse('https://example.test')).reason, /implicit deny/);
pg('fg-policy'); val('fg-pmove', 'internet-20'); await click('fg-ptoggle'); assert((await browse('https://example.test')).ok, 'policy re-enabled from the GUI');
// VLAN interface with DHCP on a parent trunk port.
pg('fg-interfaces'); assert.match(html(), /Physical interfaces/);
const parent = [...html().matchAll(/<option value="([^"]+)"/g)].map(m => m[1]).find(n => fw.ports.find(p => p.name === n && p.link && !p.link.unplugged && p.cfg.mode === 'trunk'));
val('fg-vid', 60); val('fg-vname', 'LAB'); val('fg-vip', '10.10.60.1'); val('fg-vprefix', 24); val('fg-vzone', 'staff'); val('fg-vparent', parent); tick('fg-venabled', true); tick('fg-dhcp', true); val('fg-dstart', 100); val('fg-dend', 150); val('fg-ddns', '');
await click('fg-vlan-save'); assert.match(msg(), /VLAN 60 gateway 10\.10\.60\.1\/24 saved/, msg());
assert(s().vlans[60].enabled); assert.equal(s().dhcp[60].dns, '10.10.60.1'); assert(fw.ports.find(p => p.name === parent).cfg.allowed.includes(60)); assert.equal(fw.net.vlans[60], 'LAB');
// DNS forwarding from the GUI.
pg('fg-dns'); tick('fg-dnsService', true); tick('fg-dnsForward', false); await click('fg-dns-save');
assert.match((await browse('https://example.test')).reason, /DNS forwarding to the ISP resolver is disabled/);
pg('fg-dns'); tick('fg-dnsForward', true); await click('fg-dns-save'); assert((await browse('https://example.test')).ok);
pg('fg-dns'); val('fg-dnsName', 'wiki.company.test'); val('fg-dnsIP', '10.10.50.10'); await click('fg-dns-add'); assert(s().dns['wiki.company.test']?.enabled);
// Diagnostics shows each stage.
pg('fg-diag'); val('fg-dpc', 'F1-sales-PC'); val('fg-durl', 'https://intranet.company.test'); await click('fg-dtest'); assert.match(msg(), /Blocked at: Firewall policy/); assert.match(html(), /FAIL/);
pg('overview'); assert.match(html(), /Employee reaches the Internet/);
console.log('PASS: FortiGate GUI · company-directory sign-in, policy toggle changes employee Internet, VLAN interface + DHCP + parent trunk, DNS forwarding and records, path diagnostics, dashboard checklist.');
process.exit(0);
