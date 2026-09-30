// NAS logic: PowerScale node setup → access zone on a data port → NFS export published into the
// company file service; clients reach it only through the normal network path and the export rules.
// Faults: NFS export excluding the client subnets (warning + client impact) and data-port link loss
// (critical); OneFS CLI (isi …), GUI data, alarms, repair and persistence agree.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
import { helpers } from './build-helpers.mjs';
import { builder } from '../dist/scenarios.js';
const h = helpers(a), { w, office, engineering, product, op } = h, o = w.office, s = () => o.state, net = a.lab.kit.network, L = net.logic;
engineering({ type: 'mode', mode: 'free' });
const b = builder(w, a.byId, 'ENGINEER-01'), core = a.byId[s().bindings.access[1]], { nas, port } = b.nasLab(core), cli = c => net.command(c, { node: nas });
L.invalidate(); assert.equal(L.module(nas).family, 'nas');
assert.equal(L.checks(nas).find(c => c.id === 'nas-config').ok, true);
assert.match(product(nas, 'commission', {}), /^Applied/); o.tick(Date.now());
const share = Object.values(s().shares).find(x => s().services[x.service]?.host === nas.id); assert(share, 'export published to the company file service');
await office({ type: 'login', user: 'itadmin', password: 'OfficeLab19!' });
await office({ type: 'login', user: 'engineering', pc: 'F1-engineering-PC', password: 'OfficeLab19!' });
const access = () => o.shareAccess('F1-engineering-PC', share.id, s().users.engineering);
assert(access().ok, 'engineering mounts the export: ' + access().reason);
assert.match(await cli('isi nfs exports list'), /\/ifs\/.*10\.10\.0\.0\/16\s+rw/); assert.match(await cli('isi status'), /Cluster Health: \[ OK \]/);
// Fault 1: export rule excludes the client subnets.
engineering({ type: 'fault', fault: 'nfs-export', node: nas.id }); L.invalidate();
const f = L.checks(nas).find(c => c.id === 'export-' + share.id); assert(!f.ok && f.severity === 'warning'); assert.match(f.detail, /NFS export .* allows only 10\.99\.0\.0\/24 · no company client subnet can mount it/);
assert.equal(access().ok, false); assert.match(access().reason, /NFS client subnet not allowed/);
assert.match(await cli('isi nfs exports list'), /10\.99\.0\.0\/24/); assert(L.gui(nas).pages['nas-shares'].tables[0].rows.some(r => r[4] === '10.99.0.0/24'));
assert(L.alarms().some(x => x.device === nas.id && x.check === f.id));
{ const saved = w.snapshot(); w.restore(saved); L.invalidate(); assert(!L.checks(a.byId[nas.id]).find(c => c.id === f.id).ok, 'persists'); }
await office({ type: 'configure', page: 'shares', value: { ...s().shares[share.id], subnets: '10.10.30.0/24' } }); L.invalidate();
assert(L.checks(nas).find(c => c.id === f.id).ok); assert(access().ok, 'repaired export');
// Fault 2: the NAS data port loses its link.
const l = nas.ports.find(p => p.name === port.name).link; h.unplug(l); L.invalidate();
const d = L.checks(nas).find(c => c.id === 'nas-link'); assert(!d.ok && d.severity === 'critical'); assert.match(d.detail, /Data interface .* \(10\.10\.50\.60, VLAN 50\) has no link/);
assert.equal(L.first(nas).id, 'nas-link'); assert(op.alerts().some(x => x.device === nas.id)); assert.equal(access().ok, false);
h.replug(l); L.invalidate(); assert(access().ok); assert.match(await cli('isi frob'), /Unknown command/);
console.log('PASS: logic nas · OneFS setup → access zone → NFS export in the company file service, NFS export-rule fault (warning + client denied) and data-link fault (critical) with CLI/GUI/alarm agreement, repair and persistence.');
process.exit(0);
