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
console.log('PASS: controls · per-context bindings, guns only in Global Defensive, R reload/remove by situation, rebind + conflict swap, reserved Esc, mouse buttons, export/import with validation, reset, unbind');
