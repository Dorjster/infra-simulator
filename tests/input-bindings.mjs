// Action-based controls: per-context bindings, rebinding with conflicts/swap, reserved keys, import validation.
import assert from 'node:assert/strict';
const store = {}; globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
globalThis.dispatchEvent = () => {}; globalThis.Event = class { constructor(t) { this.type = t; } };
const I = await import('../dist/input.js');
// Defaults: the same physical key, different meaning per context; guns only in Global Defensive (arena).
assert.equal(I.legacyKey('infra', 'KeyE'), 'e'); assert.equal(I.legacyKey('infra', 'Digit4'), null, 'no guns in infrastructure'); assert.equal(I.legacyKey('payday', 'Digit4'), null, 'no guns in Payday'); assert.equal(I.legacyKey('arena', 'Digit4'), 'slot4');
assert.equal(I.legacyKey('payday', 'KeyR'), 'r', 'R removes devices'); assert.equal(I.legacyKey('arena', 'KeyR'), 'reload', 'R reloads in the arena');
assert.equal(I.legacyKey('infra', 'ShiftRight'), 'shift'); assert.equal(I.legacyKey('infra', 'KeyK'), null);
// Rebind: J → K for the objective; J now does nothing, K opens it.
assert.deepEqual(I.rebind('infra', 'objective', 'KeyK'), { ok: true }); assert.equal(I.legacyKey('infra', 'KeyK'), 'j'); assert.equal(I.legacyKey('infra', 'KeyJ'), null); assert.equal(I.labelOf('infra', 'objective'), 'K');
assert.equal(I.legacyKey('payday', 'KeyJ'), 'j', 'contexts are independent');
// Conflict: E is "use"; binding objective to E asks first, swap gives "use" the old key.
const c = I.rebind('infra', 'objective', 'KeyE'); assert.equal(c.conflict?.id, 'interact');
I.rebind('infra', 'objective', 'KeyE', { swap: true }); assert.equal(I.legacyKey('infra', 'KeyE'), 'j'); assert.equal(I.legacyKey('infra', 'KeyK'), 'e', 'swap moved use to K');
// Reload and remove may share a key without a conflict.
assert.deepEqual(I.rebind('arena', 'a-reload', 'KeyR'), { ok: true });
// Reserved and invalid keys.
assert.match(I.rebind('infra', 'map', 'Escape').error, /reserved/); assert.match(I.rebind('infra', 'map', 'NotAKey').error, /can’t/);
// Mouse buttons can be bound.
assert.match(I.rebind('infra', 'zoom', 'Mouse2').error, /side button/); assert.deepEqual(I.rebind('infra', 'zoom', 'Mouse3'), { ok: true }); assert.equal(I.labelOf('infra', 'zoom'), 'Mouse 4'); assert.equal(I.legacyKey('infra', 'Mouse3'), 'z');
// Persist, export / import, malformed import keeps the current profile.
const saved = JSON.parse(store['infra-bindings-v1']); assert.deepEqual(saved.infra.objective, ['KeyE']);
const ex = I.exportBindings(); I.resetAll(); assert.equal(I.legacyKey('infra', 'KeyJ'), 'j', 'reset all');
I.importBindings(ex); assert.equal(I.legacyKey('infra', 'KeyE'), 'j', 'import restores');
assert.throws(() => I.importBindings('{"kind":"nope"}'), /controls file/); assert.equal(I.legacyKey('infra', 'KeyE'), 'j', 'bad file keeps current controls');
I.importBindings(JSON.stringify({ kind: 'bindings', bindings: { infra: { objective: ['KeyJ', '<script>', 42], bogus: ['KeyA'] }, hacker: { x: ['KeyB'] } } }));
assert.deepEqual(I.bindingOf('infra', 'objective'), ['KeyJ'], 'junk codes dropped'); assert.equal(I.legacyKey('hacker', 'KeyB'), null);
I.resetContext('infra'); assert.equal(I.labelOf('infra', 'objective'), 'J');
// Unbind: the key does nothing.
I.unbind('infra', 'map'); assert.equal(I.legacyKey('infra', 'KeyM'), null); assert.equal(I.labelOf('infra', 'map'), 'unbound'); I.resetAll();
// Grenade slots (CS2): 6 HE · 7 flashbang · 8 smoke · 9 decoy · 0 molotov / incendiary (slot 10); 4 still cycles. Only in
// Global Defensive: Infra's 0 (empty hands) is untouched, Payday has no guns.
for (const [code, slot] of [['Digit6', 'slot6'], ['Digit7', 'slot7'], ['Digit8', 'slot8'], ['Digit9', 'slot9'], ['Digit0', 'slot10'], ['Digit4', 'slot4']]) assert.equal(I.legacyKey('arena', code), slot, code + ' → ' + slot);
assert.equal(I.legacyKey('infra', 'Digit0'), '0', 'infra: 0 empties your hands'); assert.equal(I.legacyKey('payday', 'Digit6'), null); assert.equal(I.legacyKey('infra', 'Digit7'), null);
assert.deepEqual(['a-he', 'a-flash', 'a-smoke', 'a-decoy', 'a-molotov'].map(id => I.labelOf('arena', id)), ['6', '7', '8', '9', '0']);
assert.deepEqual(I.actionsIn('arena').filter(a => /^slot(6|7|8|9|10)$/.test(a.legacy)).map(a => a.id), ['a-he', 'a-flash', 'a-smoke', 'a-decoy', 'a-molotov'], 'the controls screen lists them, in slot order');
{ const used = new Map(); for (const a of I.actionsIn('arena')) for (const c of a.def) { assert(!used.has(c), c + ' is the default of both ' + used.get(c) + ' and ' + a.id); used.set(c, a.id); } }   // no default key clash in the arena
// Mouse wheel: Global Defensive's jump only (CS2 jump on the wheel); kept across a reload; never for another action.
assert.equal(I.legacyKey('arena', 'WheelDown'), 'jump'); assert.deepEqual(I.rebind('arena', 'a-jump', 'WheelUp'), { ok: true }); assert.equal(I.labelOf('arena', 'a-jump'), 'Wheel up');
assert.match(I.rebind('infra', 'forward', 'WheelUp').error, /wheel/i, 'infra: the wheel zooms'); assert.match(I.rebind('arena', 'a-he', 'WheelDown').error, /Jump/);
I.resetAll(); assert.deepEqual(I.rebind('arena', 'a-crouch', 'Space', { swap: true }), { ok: true }); assert.deepEqual(I.bindingOf('arena', 'a-jump'), ['WheelDown', 'ControlLeft'], 'swap: jump keeps the wheel');
{ const W = await import('../dist/input.js?reload-wheel'); assert.deepEqual(W.bindingOf('arena', 'a-jump'), ['WheelDown', 'ControlLeft'], 'the wheel survives a reload'); assert.equal(W.legacyKey('arena', 'WheelDown'), 'jump'); }
I.resetAll(); I.rebind('arena', 'a-jump', 'Digit6', { swap: true }); assert.deepEqual(I.bindingOf('arena', 'a-he'), ['Space'], 'a swap never hands the wheel to the HE key'); I.resetAll();
// Saved controls from before the grenade keys (no version = v1): a key the player gave to another arena action keeps
// that meaning (the new grenade action starts unbound); the other new actions get their defaults; nothing else changes.
store['infra-bindings-v1'] = JSON.stringify({ infra: { objective: ['KeyK'] }, arena: { 'a-radio': ['Digit6'], 'a-voice': ['Digit0'], 'a-reload': ['KeyR'] } });
{ const M = await import('../dist/input.js?v1-save');
  assert.deepEqual(M.bindingOf('arena', 'a-he'), [], 'HE starts unbound: 6 was the player\'s radio'); assert.equal(M.legacyKey('arena', 'Digit6'), 'radio'); assert.equal(M.labelOf('arena', 'a-he'), 'unbound');
  assert.deepEqual(M.bindingOf('arena', 'a-molotov'), []); assert.equal(M.legacyKey('arena', 'Digit0'), 'voice', '0 stays push-to-talk');
  assert.equal(M.legacyKey('arena', 'Digit7'), 'slot7'); assert.equal(M.legacyKey('arena', 'Digit8'), 'slot8'); assert.equal(M.legacyKey('arena', 'Digit9'), 'slot9', 'free keys: the new defaults');
  assert.equal(M.legacyKey('infra', 'KeyK'), 'j', 'other controls kept'); assert.equal(M.legacyKey('infra', 'Digit0'), '0'); assert.equal(M.legacyKey('arena', 'KeyZ'), null, 'the radio moved to 6 stays moved');
  assert.equal(JSON.parse(store['infra-bindings-v1']).v, 2, 'migrated once (saved as v2)');
  M.rebind('arena', 'a-he', 'KeyH'); assert.equal(M.legacyKey('arena', 'KeyH'), 'slot6', 'and it can be bound afterwards'); }
{ const M2 = await import('../dist/input.js?v2-save'); assert.equal(M2.legacyKey('arena', 'KeyH'), 'slot6'); assert.equal(M2.legacyKey('arena', 'Digit6'), 'radio'); assert.deepEqual(M2.bindingOf('arena', 'a-molotov'), [], 'a v2 save is read as it is'); }
// Untouched players: the new defaults.
delete store['infra-bindings-v1']; { const F = await import('../dist/input.js?fresh'); assert.equal(F.legacyKey('arena', 'Digit6'), 'slot6'); assert.equal(F.legacyKey('arena', 'Digit0'), 'slot10'); assert.equal(store['infra-bindings-v1'], undefined, 'nothing written for a player with no saved controls'); }
// An old exported controls file (version 1) imports the same way; a v2 file as it is.
I.importBindings(JSON.stringify({ app: 'infra-simulator', kind: 'bindings', version: 1, bindings: { arena: { 'a-reload': ['Digit9'] } } }));
assert.deepEqual(I.bindingOf('arena', 'a-decoy'), [], 'decoy unbound: 9 reloads'); assert.equal(I.legacyKey('arena', 'Digit9'), 'reload', 'and R reloads no longer'); assert.equal(I.legacyKey('arena', 'Digit6'), 'slot6');
I.rebind('arena', 'a-decoy', 'KeyJ'); const ex2 = I.exportBindings(); assert.equal(JSON.parse(ex2).version, 2); I.resetAll(); I.importBindings(ex2); assert.equal(I.legacyKey('arena', 'KeyJ'), 'slot9'); assert.equal(I.legacyKey('arena', 'Digit9'), 'reload'); I.resetAll();
console.log('PASS: controls · per-context bindings, guns only in Global Defensive, R reload/remove by situation, rebind + conflict swap, reserved Esc, mouse buttons, export/import with validation, reset, unbind, grenade slots 6–0 (+ 4 cycles), wheel jump kept, v1 → v2 migration keeps custom keys');
