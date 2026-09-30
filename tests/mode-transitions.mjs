// Mode transitions switch a complete world: logical state, racks, nodes, pick/collision geometry and
// temporary interaction state. After every transition, each active rack device must sit in a visible,
// pickable rack cabinet, and no invariant may be violated. Campaign progress survives Free Build and
// Challenges untouched.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
const w = a.lab.world, op = w.operations, act = x => w.apply({ type: 'engineering', action: x }, 'ENGINEER-01');
const frames = (n = 3) => { for (let i = 0; i < n; i++) a.lab.update(.1); };
const shown = o => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };
function check(label) {
  frames();
  const racks = a.lab.rackList, errors = [];
  for (const n of a.nodes) {
    if (n.active === false || !n.rack || n.type === 'cloud' || n.controller) continue;
    const r = racks.find(r => r.id === n.rack);
    if (!r) { errors.push(n.id + ' in unknown rack ' + n.rack); continue; }
    if (!shown(r.g)) errors.push(n.id + ' is active but rack ' + r.id + ' is invisible');
    if (n.group && !shown(n.group)) errors.push(n.id + ' is active but not drawn');
  }
  for (const r of racks) { const used = a.nodes.some(n => n.active !== false && n.rack === r.id); const placed = op.game.racks.some(x => x.id === r.id) || !op.game.emptySite && +r.id.slice(1) <= 6; if (placed !== shown(r.g)) errors.push(r.id + (placed ? ' placed but hidden' : ' not placed but visible') + (used ? ' (has devices)' : '')); }
  // Occluders of visible racks must be raycastable (walk collision uses the same visibility).
  for (const r of racks) if (shown(r.g) && !a.pickables.some(p => p.userData?.occluder && shown(p) && isChild(p, r.g))) errors.push(r.id + ' visible without pick/collision geometry');
  errors.push(...(op.invariants?.() ?? ['operations.invariants() missing']).map(v => 'invariant: ' + v));
  assert.deepEqual(errors, [], label + ': ' + errors.join(' | '));
}
function isChild(o, g) { for (let p = o; p; p = p.parent) if (p === g) return true; return false; }
function buy(sku) { act({ type: 'order', sku, quantity: 1, length: 5 }); const o = op.game.orders.at(-1); o.arrives = 0; act({ type: 'unbox', id: o.id }); return op.game.stock.filter(s => s.sku === sku).at(-1); }

check('initial Free Build');
// 1. Empty Campaign → Free Build → Campaign.
act({ type: 'mode', mode: 'campaign', track: 'levels', name: 'Transitions' }); check('empty campaign');
act({ type: 'mode', mode: 'free' }); check('free after empty campaign');
assert.match(act({ type: 'mode', mode: 'campaign', resume: true }), /resumed/); check('campaign resumed (empty)');
assert.equal(op.game.track, 'levels'); assert.equal(op.game.levels.current, 0);
// 2. Partially built Campaign (rack R02 placed, fed, rails, device carried) → Free Build → Campaign.
{ const r = buy('rack'); act({ type: 'grab', id: r.id }); act({ type: 'rack', id: r.id, pad: 'PAD-R02' }); act({ type: 'rack-feed', rack: 'R02', feed: 'A' }); }
const rail = buy('rail'); act({ type: 'grab', id: rail.id }); act({ type: 'rails', id: rail.id, rack: 'R02', unit: 30, units: 1 });
const lead = buy('cat6'); act({ type: 'grab', id: lead.id });
check('campaign with R02');
const before = JSON.stringify({ racks: op.game.racks, feeds: op.game.rackFeeds, rails: op.game.rails, budget: op.game.budget, levels: op.game.levels });
act({ type: 'drop', id: lead.id, position: { x: -30, z: 20 } }); // G before leaving: nothing is lost
act({ type: 'mode', mode: 'free' }); check('free after partial campaign');
assert(!op.game.stock.some(s => s.holders.length), 'no carried item leaks into Free Build');
act({ type: 'mode', mode: 'challenge', index: 3 }); check('challenge'); act({ type: 'mode', mode: 'free' }); check('free after challenge');
act({ type: 'mode', mode: 'campaign', resume: true }); check('campaign resumed (partial)');
assert.equal(JSON.stringify({ racks: op.game.racks, feeds: op.game.rackFeeds, rails: op.game.rails, budget: op.game.budget, levels: op.game.levels }), before, 'campaign progress unchanged by Free Build and Challenge');
assert(op.game.stock.some(s => s.id === lead.id && s.floor), 'the put-down cable is still on the floor');
// 3. Save / reload keeps the invariant.
const saved = JSON.parse(JSON.stringify(w.snapshot())); act({ type: 'mode', mode: 'free' }); w.restore(saved); check('reloaded campaign');
// 4. A malformed save (device mounted in a rack that was never placed) is repaired on load, not trusted.
const bad = structuredClone(saved); bad.devices.push({ id: 'SWITCH-ghost-1', sku: 'fs148f', type: 'switch', model: 'Fortinet FortiSwitch 148F-POE', rack: 'R05', unit: 20, units: 1 }); bad.operations.installed.push('SWITCH-ghost-1');
w.restore(bad); check('malformed save repaired');
assert(!op.game.installed.includes('SWITCH-ghost-1') && op.game.stock.some(s => s.sku === 'fs148f'), 'ghost device returned to receiving stock');
console.log('PASS: mode transitions · Campaign ↔ Free Build ↔ Challenge keep racks visible and pickable for every active device, campaign progress intact, carried items not leaked, malformed saves repaired, invariants hold.');
process.exit(0);
