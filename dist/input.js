// Action-based input. Every gameplay key is an *action* in a *context*; each player can rebind actions, and the
// bindings live only on this computer (never sent over LAN: the network carries actions, not key codes).
//  · Contexts: infra (Campaign / Free Build / Challenges), payday (infra + guns), arena (shooting arena).
//    The same key may mean different things in different contexts.
//  · Keys are matched by KeyboardEvent.code (physical position), so rebinding works on any keyboard layout;
//    labels show the character the player's layout prints where the browser can tell.
//  · Escape (pause / close) is fixed so the menu can always be reached.
// `legacy` is the character the existing game code reacts to; a rebound key fires that legacy character.
export const ACTIONS = [
  // Movement and camera (shared by infra and payday).
  { id: 'forward', label: 'Move forward', legacy: 'w', def: ['KeyW'], ctx: ['infra', 'payday'], hold: true },
  { id: 'left', label: 'Move left', legacy: 'a', def: ['KeyA'], ctx: ['infra', 'payday'], hold: true },
  { id: 'back', label: 'Move back', legacy: 's', def: ['KeyS'], ctx: ['infra', 'payday'], hold: true },
  { id: 'right', label: 'Move right', legacy: 'd', def: ['KeyD'], ctx: ['infra', 'payday'], hold: true },
  { id: 'run', label: 'Run', legacy: 'shift', def: ['ShiftLeft', 'ShiftRight'], ctx: ['infra', 'payday'], hold: true },
  { id: 'crouch', label: 'Crouch (low ports)', legacy: 'c', def: ['KeyC', 'ControlLeft'], ctx: ['infra', 'payday'], hold: true },
  { id: 'raise', label: 'Raise view (top of rack)', legacy: 'q', def: ['KeyQ'], ctx: ['infra', 'payday'] },
  { id: 'zoom', label: 'Zoom', legacy: 'z', def: ['KeyZ'], ctx: ['infra', 'payday'], hold: true },
  { id: 'third', label: 'First / third person', legacy: 'p', def: ['KeyP'], ctx: ['infra', 'payday'] },
  // Work.
  { id: 'interact', label: 'Use / interact', legacy: 'e', def: ['KeyE'], ctx: ['infra', 'payday'] },
  { id: 'inspect', label: 'Inspect what you aim at', legacy: 'f', def: ['KeyF'], ctx: ['infra', 'payday'] },
  { id: 'drop', label: 'Put down what you carry', legacy: 'g', def: ['KeyG'], ctx: ['infra', 'payday'] },
  { id: 'cancel', label: 'Cancel loose cable / unplug laptop', legacy: 'x', def: ['KeyX'], ctx: ['infra', 'payday'] },
  { id: 'remove', label: 'Remove device or optic (hands empty)', legacy: 'r', def: ['KeyR'], ctx: ['infra', 'payday'] },
  { id: 'service', label: 'Service action', legacy: 'v', def: ['KeyV'], ctx: ['infra', 'payday'] },
  { id: 'laptop', label: 'Service laptop', legacy: 'l', def: ['KeyL'], ctx: ['infra', 'payday'] },
  { id: 'hands', label: 'Empty hands', legacy: '0', def: ['Digit0'], ctx: ['infra', 'payday'] },
  { id: 'console-cable', label: 'Console cable', legacy: '1', def: ['Digit1'], ctx: ['infra', 'payday'] },
  { id: 'service-cable', label: 'Service LAN cable', legacy: '2', def: ['Digit2'], ctx: ['infra', 'payday'] },
  // Menus.
  { id: 'objective', label: 'Objective', legacy: 'j', def: ['KeyJ'], ctx: ['infra', 'payday'] },
  { id: 'inventory', label: 'Inventory & orders', legacy: 'i', def: ['KeyI'], ctx: ['infra', 'payday'] },
  { id: 'menu', label: 'Main menu (Tab)', legacy: 'tab', def: ['Tab'], ctx: ['infra', 'payday'] },
  { id: 'map', label: 'Map', legacy: 'm', def: ['KeyM'], ctx: ['infra', 'payday'] },
  { id: 'hint', label: 'Hint', legacy: 'h', def: ['KeyH'], ctx: ['infra', 'payday'] },
  { id: 'chat', label: 'Chat', legacy: 't', def: ['KeyT'], ctx: ['infra', 'payday'] },
  { id: 'chat-enter', label: 'Chat (Enter)', legacy: 'enter', def: ['Enter'], ctx: ['infra', 'payday'] },
  // Payday only: guns (never in Campaign / Free Build / Challenges).
  // Shooting arena (its own context: the same keys mean different things here).
  { id: 'a-forward', label: 'Move forward', legacy: 'w', def: ['KeyW'], ctx: ['arena'], hold: true },
  { id: 'a-left', label: 'Move left', legacy: 'a', def: ['KeyA'], ctx: ['arena'], hold: true },
  { id: 'a-back', label: 'Move back', legacy: 's', def: ['KeyS'], ctx: ['arena'], hold: true },
  { id: 'a-right', label: 'Move right', legacy: 'd', def: ['KeyD'], ctx: ['arena'], hold: true },
  { id: 'a-walk', label: 'Walk quietly (hold)', legacy: 'walk', def: ['ShiftLeft'], ctx: ['arena'], hold: true },
  { id: 'a-jump', label: 'Jump', legacy: 'jump', def: ['Space', 'WheelDown'], ctx: ['arena'], hold: true },
  { id: 'a-crouch', label: 'Crouch / sit (hold)', legacy: 'c', def: ['ControlLeft', 'KeyC'], ctx: ['arena'], hold: true },
  { id: 'a-primary', label: 'Primary weapon (rifle, sniper, SMG, shotgun)', legacy: 'slot1', def: ['Digit1'], ctx: ['arena'] },
  { id: 'a-secondary', label: 'Pistol', legacy: 'slot2', def: ['Digit2'], ctx: ['arena'] },
  { id: 'a-knife', label: 'Knife', legacy: 'slot3', def: ['Digit3'], ctx: ['arena'] },
  { id: 'a-utility', label: 'Grenades (cycle: HE, flash, smoke, decoy, fire)', legacy: 'slot4', def: ['Digit4'], ctx: ['arena'] },
  { id: 'a-objective', label: 'Bomb (defuse matches)', legacy: 'slot5', def: ['Digit5'], ctx: ['arena'] },
  // CS2's grenade slots (slot6–slot10, keys 6 7 8 9 0): each picks exactly that grenade, never throws it.
  { id: 'a-he', label: 'HE grenade', legacy: 'slot6', def: ['Digit6'], ctx: ['arena'] },
  { id: 'a-flash', label: 'Flashbang', legacy: 'slot7', def: ['Digit7'], ctx: ['arena'] },
  { id: 'a-smoke', label: 'Smoke grenade', legacy: 'slot8', def: ['Digit8'], ctx: ['arena'] },
  { id: 'a-decoy', label: 'Decoy grenade', legacy: 'slot9', def: ['Digit9'], ctx: ['arena'] },
  { id: 'a-molotov', label: 'Molotov (T) / Incendiary (CT)', legacy: 'slot10', def: ['Digit0'], ctx: ['arena'] },
  { id: 'a-drop', label: 'Drop weapon', legacy: 'adrop', def: ['KeyG'], ctx: ['arena'] },
  { id: 'a-use', label: 'Pick up / swap weapon', legacy: 'ause', def: ['KeyE'], ctx: ['arena'] },
  { id: 'a-reload', label: 'Reload', legacy: 'reload', def: ['KeyR'], ctx: ['arena'] },
  { id: 'a-inspect', label: 'Inspect weapon', legacy: 'inspect', def: ['KeyF'], ctx: ['arena'] },
  { id: 'a-scores', label: 'Scoreboard (hold)', legacy: 'scores', def: ['Tab'], ctx: ['arena'], hold: true },
  { id: 'a-buy', label: 'Buy menu', legacy: 'buy', def: ['KeyB'], ctx: ['arena'] },
  { id: 'a-third', label: 'First / third person', legacy: 'p', def: ['KeyP'], ctx: ['arena'] },
  { id: 'a-team', label: 'Change team', legacy: 'team', def: ['KeyM'], ctx: ['arena'] },
  { id: 'a-radar', label: 'Radar: rotate / fixed', legacy: 'radar', def: ['KeyN'], ctx: ['arena'] },
  { id: 'a-voice', label: 'Team voice: push to talk (hold)', legacy: 'voice', def: ['KeyK'], ctx: ['arena'], hold: true },
  { id: 'a-chat', label: 'Chat: everyone', legacy: 't', def: ['KeyY'], ctx: ['arena'] },
  { id: 'a-teamchat', label: 'Chat: team only', legacy: 'teamchat', def: ['KeyU'], ctx: ['arena'] },
  { id: 'a-radio', label: 'Quick radio menu', legacy: 'radio', def: ['KeyZ'], ctx: ['arena'] },
];
export const CONTEXTS = { infra: 'Infrastructure (Campaign, Free Build, Challenges)', payday: 'Payday', arena: 'Global Defensive (arena)' };
const STORE = 'infra-bindings-v1';
const valid = c => typeof c === 'string' && /^(Key[A-Z]|Digit\d|Numpad\w+|F\d{1,2}|Arrow\w+|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Space|Tab|Enter|Backquote|Minus|Equal|Bracket(Left|Right)|Backslash|Semicolon|Quote|Comma|Period|Slash|CapsLock|Mouse[0-4]|Wheel(Up|Down))$/.test(c);
// The mouse wheel binds only Global Defensive's jump (CS2 players jump on the wheel; lab.js reads the wheel for that
// alone): elsewhere it zooms and scrolls, and no other action could be fired by it.
const wheelOk = (ctx, id) => ctx === 'arena' && id === 'a-jump';
const RESERVED = ['Escape', 'MetaLeft', 'MetaRight'];
// Pairs that may share a key on purpose: the game picks by situation (gun drawn → reload, else remove).
const SHARED = [['reload', 'remove']];

// Saved controls carry the version of the action list (v; a save without one is v1). A save from before an action
// existed is brought up to date once, when read or imported — the player's own keys are never changed or reset:
//  · v2 added the grenade slots (keys 6 7 8 9 0, Global Defensive). A key the player had already given to another
//    Global Defensive action keeps that meaning and the new grenade action starts unbound there (Settings → Controls
//    shows it so); every other new action gets its default key.
const VERSION = 2, ADDED = { 2: ['a-he', 'a-flash', 'a-smoke', 'a-decoy', 'a-molotov'] };
const versionOf = v => Number.isInteger(v) && v > 0 ? v : 1;
function migrate(map, from) {
  for (let v = from + 1; v <= VERSION; v++) for (const id of ADDED[v] || []) { const a = ACTIONS.find(x => x.id === id);
    for (const ctx of a.ctx) { const m = map[ctx]; if (!m || m[id]) continue; if (a.def.some(c => Object.entries(m).some(([o, codes]) => o !== id && codes.includes(c)))) m[id] = []; } }
  return map;
}
// Load with validation: anything malformed falls back to defaults (and the last good profile is kept).
function load() {
  try { const raw = JSON.parse(localStorage.getItem(STORE) || '{}'), from = versionOf(raw?.v), out = migrate(clean(raw), from);
    if (from < VERSION && Object.keys(out).length) try { localStorage.setItem(STORE, JSON.stringify({ v: VERSION, ...out })); } catch {}   // (migrated once)
    return out; } catch { return {}; }
}
function clean(raw) {
  const out = {}; if (!raw || typeof raw !== 'object') return out;
  for (const [ctx, map] of Object.entries(raw)) { if (!CONTEXTS[ctx] || !map || typeof map !== 'object') continue;
    for (const [id, codes] of Object.entries(map)) { if (!ACTIONS.some(a => a.id === id && a.ctx.includes(ctx)) || !Array.isArray(codes)) continue; (out[ctx] ??= {})[id] = codes.filter(c => valid(c) && (!/^Wheel/.test(c) || wheelOk(ctx, id))).slice(0, 3); } }
  return out;
}
let custom = load();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ v: VERSION, ...custom })); } catch {} dispatchEvent?.(new Event('infra-bindings')); };

export const actionsIn = ctx => ACTIONS.filter(a => a.ctx.includes(ctx));
export const bindingOf = (ctx, id) => custom[ctx]?.[id] ?? ACTIONS.find(a => a.id === id)?.def ?? [];
// The action(s) a physical key triggers in a context (normally one).
export function actionsFor(ctx, code) { return actionsIn(ctx).filter(a => bindingOf(ctx, a.id).includes(code)); }
// Legacy character the game code understands for this key in this context, or null if the key is unbound here.
// A key that is bound to nothing returns null even if its letter used to mean something (that's what rebinding means).
// prefer: action ids to pick first when one key has several actions (e.g. R = reload while a gun is drawn).
export function legacyKey(ctx, code, prefer = []) { const a = actionsFor(ctx, code); if (!a.length) return null; return (a.find(x => prefer.includes(x.id)) || a.find(x => !prefer.length || !['reload'].includes(x.id)) || a[0]).legacy; }
export function isBoundKey(ctx, code) { return actionsFor(ctx, code).length > 0; }

// Rebind: returns { ok } or { conflict: action } so the screen can offer Swap / Cancel.
export function rebind(ctx, id, code, { swap = false } = {}) {
  if (RESERVED.includes(code)) return { error: 'That key is reserved' }; if (ctx !== 'arena' && /^Mouse[0-2]$/.test(code)) return { error: 'Left, right and middle mouse already click, zoom and ping here · use a side button (Mouse 4 / 5)' }; if (!valid(code)) return { error: 'That key can’t be used' };
  if (/^Wheel/.test(code) && !wheelOk(ctx, id)) return { error: ctx === 'arena' ? 'The mouse wheel can only be bound to Jump' : 'The mouse wheel zooms and scrolls here · use a key or a side button (Mouse 4 / 5)' };
  const clash = actionsIn(ctx).find(a => a.id !== id && bindingOf(ctx, a.id).includes(code) && !SHARED.some(pair => pair.includes(a.id) && pair.includes(id)));
  if (clash && !swap) return { conflict: clash };
  if (clash) { const mine = bindingOf(ctx, id); (custom[ctx] ??= {})[clash.id] = bindingOf(ctx, clash.id).filter(c => c !== code).concat(mine.filter(c => !bindingOf(ctx, clash.id).includes(c) && (!/^Wheel/.test(c) || wheelOk(ctx, clash.id)))).slice(0, 2); }   // (a swap never hands the wheel to an action it can't fire)
  (custom[ctx] ??= {})[id] = [code]; save(); return { ok: true };
}
export function unbind(ctx, id) { (custom[ctx] ??= {})[id] = []; save(); }
export function resetContext(ctx) { delete custom[ctx]; save(); }
export function resetAll() { custom = {}; save(); }
export const exportBindings = () => JSON.stringify({ app: 'infra-simulator', kind: 'bindings', version: VERSION, bindings: custom }, null, 1);
export function importBindings(text) { const d = JSON.parse(text); if (d?.kind !== 'bindings') throw Error('Not a controls file'); custom = migrate(clean(d.bindings), versionOf(d.version)); save(); return true; }   // (an older file: brought up to date as a saved profile is)

// Human-readable label for a code, using the keyboard layout where the browser exposes it.
let layout = null; try { navigator.keyboard?.getLayoutMap?.().then(m => { layout = m; }).catch(() => {}); } catch {}
const NAMES = { ShiftLeft: 'Shift', ShiftRight: 'Right Shift', ControlLeft: 'Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Alt', AltRight: 'Right Alt', Space: 'Space', Tab: 'Tab', Enter: 'Enter', CapsLock: 'Caps Lock', WheelUp: 'Wheel up', WheelDown: 'Wheel down', Mouse0: 'Left mouse', Mouse1: 'Middle mouse', Mouse2: 'Right mouse', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`' };
export function keyLabel(code) { if (NAMES[code]) return NAMES[code]; const l = layout?.get?.(code); if (l) return l.toUpperCase(); return code.replace(/^Key|^Digit|^Numpad/, m => m === 'Numpad' ? 'Num ' : ''); }
export const labelOf = (ctx, id) => bindingOf(ctx, id).map(keyLabel).join(' / ') || 'unbound';
