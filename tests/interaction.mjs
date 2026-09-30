// One contextual verb per target, with the reason and the next useful action when it is not possible.
// Drives the real engineering-ui prompt/interact functions and world actions (no DOM rendering):
// delivery boxes, rack bays, rack PDU inputs (front/rear), rails, CAT6 vs SFP ports, end A / end B,
// occupied ports, X cancel for a new cable, a pulled cable and a pulled power cord, and title parity.
import assert from 'node:assert/strict';
import { a } from './app-harness.mjs';
const w = a.lab.world, op = w.operations, eng = a.lab.engineering, cam = a.camera, act = x => w.apply({ type: 'engineering', action: x }, 'ENGINEER-01');
const prompt = aim => eng.prompt(aim).split('\n')[0];
const at = (x, z) => cam.position.set(x, 9.7, z);
function buy(sku, length = 5) { act({ type: 'order', sku, quantity: 1, length }); const o = op.game.orders.at(-1); o.arrives = 0; return o; }
act({ type: 'mode', mode: 'campaign', track: 'levels', name: 'Prompt test' });

// Delivery box → open → take an item out.
const rackOrder = buy('rack');
at(-34, -4); assert.match(prompt({ delivery: rackOrder.id }), /^E · Open the delivery box \(1 × 42U rack/);
act({ type: 'unbox', id: rackOrder.id }); assert.match(prompt({ delivery: rackOrder.id }), /^E · Take an item out of the 42U rack/);
const rack = op.game.stock.find(s => s.sku === 'rack');
assert.match(prompt({ rackPad: 'PAD-R01' }), /^Rack bay R01 · carry a 42U rack here/);
act({ type: 'grab', id: rack.id });
assert.match(prompt({ rackPad: 'PAD-R01' }), /^E · Place rack R01 on this bay/);
assert.match(prompt({ delivery: rackOrder.id }), /^✗ Hands full · G puts it down first/, 'no unrelated actions while carrying');
act({ type: 'rack', id: rack.id, pad: 'PAD-R01' });

// PDU input whips are at the top rear.
at(-9, 8); assert.match(prompt({ rackFeed: { rack: 'R01', feed: 'A' } }), /^✗ PDU A input is at the rear · walk behind R01/);
at(-9, -8); assert.equal(prompt({ rackFeed: { rack: 'R01', feed: 'A' } }), 'E · Plug PDU A input into building feed A');
act({ type: 'rack-feed', rack: 'R01', feed: 'A' }); act({ type: 'rack-feed', rack: 'R01', feed: 'B' });
assert.equal(prompt({ rackFeed: { rack: 'R01', feed: 'A' } }), 'E · Unplug PDU A input from building feed A');

// Rails before devices: a switch without rails and without a spare kit is refused with the reason.
const railOrder = buy('rail'); act({ type: 'unbox', id: railOrder.id });
const rail = op.game.stock.find(s => s.sku === 'rail'); act({ type: 'grab', id: rail.id });
at(-9, 8);
assert.match(prompt({ rackTarget: 'R01', unit: 30 }), /^E · Install rail kit in R01 U30/);
act({ type: 'rails', id: rail.id, rack: 'R01', unit: 30, units: 1 });
w.campaign.tick(Date.now() + 5000); assert.equal(op.game.levels.current, 1);
const swOrder = buy('fs148f'); act({ type: 'unbox', id: swOrder.id });
const kits = op.game.stock.filter(s => s.sku === 'rail'); for (const k of kits) op.game.stock.splice(op.game.stock.indexOf(k), 1); // no spare kit on hand
const swItem = op.game.stock.find(s => s.sku === 'fs148f'); act({ type: 'grab', id: swItem.id });
assert.match(prompt({ rackTarget: 'R01', unit: 20 }), /^✗ Needs rails · install a 1U rail kit here first/);
assert.match(prompt({ rackTarget: 'R01', unit: 30 }), /^E · Install Fortinet FortiSwitch 148F-POE in R01 U30/);
act({ type: 'mount', id: swItem.id, rack: 'R01', unit: 30 });
const sw = a.byId[op.game.installed.at(-1)];
assert.match(prompt({ rackTarget: 'R01', unit: 30 }), /^R01 U30 · carry a rail kit or a device here/);

// Power: PSU sockets are at the rear; a cord in hand plugs to its PDU.
at(-9, 8); assert.match(prompt({ node: sw, powerPSU: 0 }), /^✗ PSU A is at the rear · walk behind R01/);
at(-9, -8); assert.match(prompt({ node: sw, powerPSU: 0 }), /^✗ PSU A has no power cord · take a cord from the device box/);
const cord = op.game.stock.find(s => s.sku === 'power'); act({ type: 'grab', id: cord.id });
assert.match(prompt({ node: sw, powerPSU: 0 }), /^E · Plug power cord into SWITCH-.* PSU A → PDU A/);
act({ type: 'power', id: cord.id, node: sw.id, psu: 0, feed: 'A' });
assert.match(prompt({ node: sw, powerPSU: 0 }), /^E · Unplug SWITCH-.* PSU A power cord \(PDU A\)/);
// Pull the cord, then X puts it back.
act({ type: 'power', node: sw.id, psu: 0, feed: null });
assert.equal(sw.physical.power[0], null); assert(eng.cancelHeld(), 'X offers a cancel for the pulled cord'); await new Promise(r => setTimeout(r, 0));
assert.equal(sw.physical.power[0], 'A', 'cord plugged back into PDU A'); assert(!op.game.stock.some(s => s.holders.includes('ENGINEER-01')), 'hands empty');

// Cables: CAT6 into an SFP+ cage is refused with the right hint; into an RJ45 port it is end A, then end B.
const sfp = sw.ports.findIndex(p => p.name === 'port49'), rj = sw.ports.findIndex(p => p.name === 'port5'), rj2 = sw.ports.findIndex(p => p.name === 'port6');
const leadOrder = buy('cat6'); act({ type: 'unbox', id: leadOrder.id }); const lead = op.game.stock.find(s => s.sku === 'cat6'); act({ type: 'grab', id: lead.id });
at(-9, 8);
assert.match(prompt({ node: sw, port: sw.ports[sfp] }), /^✗ This 10G SFP port needs a 10G DAC or fibre with SFP optics · CAT6 fits the 1G RJ45 ports/);
assert.match(prompt({ node: sw, port: sw.ports[rj] }), /^E · Plug CAT6 patch lead end A into SWITCH-.* port5/);
act({ type: 'start-end', id: lead.id, node: sw.id, port: rj });
assert.match(prompt({ node: sw, port: sw.ports[rj] }), /^✗ End A is plugged here · plug end B elsewhere, or X to cancel/);
assert.match(prompt({ node: sw, port: sw.ports[rj2] }), /^E · Plug CAT6 patch lead end B into SWITCH-.* port6/);
assert(eng.cancelHeld()); await new Promise(r => setTimeout(r, 0));
assert(!op.game.stock.find(s => s.id === lead.id).anchor, 'X frees end A; the cable stays in hand');
act({ type: 'drop', id: lead.id, position: { x: -30, z: 16 } });
const sw2Order = buy('fs148f'); act({ type: 'unbox', id: sw2Order.id }); const sw2Item = op.game.stock.find(s => s.sku === 'fs148f'); act({ type: 'grab', id: sw2Item.id });
{ const k = op.game.stock.find(s => s.sku === 'rail' && !s.holders.length); act({ type: 'drop', id: sw2Item.id, position: { x: -30, z: 10 } }); act({ type: 'grab', id: k.id }); act({ type: 'rails', id: k.id, rack: 'R01', unit: 28, units: 1 }); act({ type: 'grab', id: sw2Item.id }); act({ type: 'mount', id: sw2Item.id, rack: 'R01', unit: 28 }); }
const sw2 = a.byId[op.game.installed.at(-1)];
act({ type: 'grab', id: lead.id }); act({ type: 'start-end', id: lead.id, node: sw.id, port: rj }); act({ type: 'patch', id: lead.id, a: sw.id, pa: rj, b: sw2.id, pb: rj2 });
const l = sw.ports[rj].link; assert(l && !l.unplugged, 'patched switch to switch');
// Occupied port for a second cable, and unplug → X → back in place.
const lead2Order = buy('cat6'); act({ type: 'unbox', id: lead2Order.id }); const lead2 = op.game.stock.find(s => s.sku === 'cat6' && s.id !== lead.id); act({ type: 'grab', id: lead2.id });
assert.match(prompt({ node: sw, port: sw.ports[rj] }), /^✗ Port already occupied · choose a free port/);
act({ type: 'drop', id: lead2.id, position: { x: -30, z: 20 } });
assert.match(prompt({ node: sw, port: sw.ports[rj] }), /^E · Unplug the cable from SWITCH-.* port5 \(you hold its end\)/);
act({ type: 'unplug-end', node: sw.id, port: rj }); assert(!sw.ports[rj].link);
assert(eng.cancelHeld()); await new Promise(r => setTimeout(r, 0));
assert(sw.ports[rj].link && !sw.ports[rj].link.unplugged, 'X plugs the pulled end back where it was');

// Title parity: the same prompts for both titles.
const probe = [{ node: sw, powerPSU: 1 }, { node: sw, port: sw.ports[sfp] }, { rackFeed: { rack: 'R01', feed: 'B' } }, { rackTarget: 'R01', unit: 12 }];
eng.setRole('field'); const f = probe.map(prompt); eng.setRole('operations'); assert.deepEqual(probe.map(prompt), f, 'titles never change what you can do');
console.log('PASS: interaction · one verb per target with reasons (rear/front, hands full, needs rails, SFP vs RJ45, end A/B, occupied), X cancel for a new cable, a pulled cable and a pulled cord, title parity.');
process.exit(0);
