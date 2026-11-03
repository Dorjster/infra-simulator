// Global Defensive · the developer console's practice commands (v53 S2, SPEC 1.3) — CS2's console, as far as Practice
// needs it. ` (Backquote, CS2's toggleconsole key) opens and closes it in Global Defensive; Enter runs a line; ↑ / ↓
// walk the history; the lines it prints can be selected and copied (getpos also goes to the clipboard).
// State machine: closed → open (the mouse let go, the line focused: the game hears no keys) → closed (the mouse taken
// back). Commands (runCommand: pure, given a context — the tests drive it without a page):
//   getpos                      → "setpos x y z;setang pitch yaw 0.000000" (CS2's form, 6 decimals; the eye — feet + 64.06
//                                  standing / 46.04 crouched, CS2's view offset — in CS2's coordinates on a CS2 map file)
//   setpos x y z [;setang p y]  → there (the eye, as getpos prints it: the feet go 64.06 / 46.04 under it) and that aim
//   setang pitch yaw [roll]     → that aim exactly (CS2's degrees: pitch down positive, yaw from +x)
//   noclip / god                → on / off (yours) · sv_infinite_ammo 0 / 1 / 2 (1: ammo and grenades never run out,
//                                  2: the reserve only — CS2's two modes as this game has them) · bot_kick [name]
//   mp_roundtime m / mp_freezetime s → the practice round's clock (0 = none) and the still time at its start
//   sv_rethrow_last_grenade     → your last grenade again, from the same spot, angles and strength
//   lineup_save [name] [left|right|both] [stand|crouch|jump|runjump|walk|run]
//                               → the grenade in hand thrown from where you stand now, kept in your lineups for this map
//                                  (the button / move as said, else your last throw's — v53 S2 review)
//   lineups / clear / help / echo
// Practice-only commands answer "practice only" outside a Practice session (CS2: sv_cheats). Nothing per frame: the
// console does work only on a key or a command. No per-frame allocation, no shader (plain DOM).
import { formatPos, parsePos, fromLook, toLook, EYE_HU } from './gd-lineups.js';

const PRACTICE_ONLY = new Set(['setpos', 'setpos_exact', 'setang', 'setang_exact', 'noclip', 'god', 'sv_infinite_ammo', 'bot_kick', 'mp_roundtime', 'mp_freezetime', 'sv_rethrow_last_grenade', 'lineup_save']);
export const COMMANDS = ['getpos', 'getpos_exact', ...PRACTICE_ONLY, 'lineups', 'clear', 'help', 'echo'];
const LIMITS = { mp_roundtime: [0, 60], mp_freezetime: [0, 60] };   // (minutes / seconds; CS2's own ranges are wider — a practice clock needs no more)

// The player's getpos, CS2's numbers: ctx.me() = { x, y (feet), z, duck (0…1), pitch, yaw (game radians) } and
// ctx.frame (gd-lineups.js mapFrame).
export function getpos(ctx) {
  const s = ctx.me(); if (!s) return null; const eye = eyeHU(s.duck), h = ctx.frame.toHammer(s.x, s.y, s.z), a = fromLook(s.pitch, s.yaw);
  return formatPos({ x: h[0], y: h[1], z: h[2] + eye, pitch: a.pitch, yaw: a.yaw, roll: 0 }); }
// Run one console line. ctx: { practice: bool, me(), frame, teleport(feet x y z, pitch, yaw), look(pitch, yaw),
// toggle(name) → on, set(key, value) → Promise|void (host settings), kick(name) → Promise|void, rethrow() → string,
// saveLineup(name, posLine) → Promise<string>|string, lineups() → string[], copy(text) }. Returns { lines, error }.
export function runCommand(line, ctx) {
  const text = String(line ?? '').trim(); if (!text) return { lines: [] };
  // "setpos …;setang …" is two commands on one line (CS2's ;)
  if (/^setpos/i.test(text) && /;\s*setang/i.test(text)) { const p = parsePos(text); if (!p) return err('setpos: x y z'); return setposAng(ctx, p, true); }
  if (text.includes(';')) { const out = { lines: [] }; for (const part of text.split(';')) { const r = runCommand(part, ctx); out.lines.push(...r.lines); if (r.error) out.error = true; if (r.pending) (out.pending ??= []).push(r.pending); } if (out.pending) out.pending = Promise.all(out.pending); return out; }
  const [cmd0, ...args] = text.split(/\s+/), cmd = cmd0.toLowerCase();
  if (!COMMANDS.includes(cmd)) return err(`Unknown command "${cmd0}"`);
  if (PRACTICE_ONLY.has(cmd) && !ctx.practice) return err(`${cmd}: practice only (start a Practice session)`);
  switch (cmd) {
    case 'getpos': case 'getpos_exact': { const g = getpos(ctx); if (!g) return err('getpos: not in the map'); ctx.copy?.(g); return { lines: [g], copy: g }; }
    case 'setpos': case 'setpos_exact': { const p = parsePos('setpos ' + args.join(' ')); if (!p?.hasPos) return err('setpos: x y z'); return setposAng(ctx, p, false); }
    case 'setang': case 'setang_exact': { const p = parsePos('setang ' + args.join(' ')); if (!p?.hasAng) return err('setang: pitch yaw [roll]'); const l = toLook(p.pitch, p.yaw); ctx.look(l.pitch, l.yaw); return { lines: [] }; }
    case 'noclip': case 'god': { const on = ctx.toggle(cmd); return { lines: [`${cmd} ${on ? 'ON' : 'OFF'}`] }; }
    case 'sv_infinite_ammo': { const v = args.length ? +args[0] : NaN; if (![0, 1, 2].includes(v)) return err('sv_infinite_ammo 0 / 1 / 2'); return pend(ctx.set('ammo', v), `sv_infinite_ammo ${v}`); }
    case 'mp_roundtime': case 'mp_freezetime': { const v = +args[0], [lo, hi] = LIMITS[cmd]; if (!args.length || !Number.isFinite(v)) return err(`${cmd} ${lo}–${hi}`); const c = Math.max(lo, Math.min(hi, v)); return pend(ctx.set(cmd === 'mp_roundtime' ? 'roundtime' : 'freezetime', c), `${cmd} ${c}`); }
    case 'bot_kick': return pend(ctx.kick(args.join(' ') || null), args.length ? `bot_kick ${args.join(' ')}` : 'bot_kick: all bots');
    case 'sv_rethrow_last_grenade': { const r = ctx.rethrow(); return typeof r === 'string' && r ? { lines: [r] } : err('sv_rethrow_last_grenade: no grenade thrown yet'); }
    case 'lineup_save': { const g = getpos(ctx); if (!g) return err('lineup_save: not in the map'); return pend(ctx.saveLineup(args.join(' '), g), null); }
    case 'lineups': return { lines: ctx.lineups?.() || [] };
    case 'echo': return { lines: [args.join(' ')] };
    case 'clear': return { lines: [], clear: true };
    case 'help': return { lines: ['getpos · setpos x y z;setang pitch yaw · setang pitch yaw · noclip · god · sv_infinite_ammo 0/1/2 · bot_kick [name] · mp_roundtime min · mp_freezetime s · sv_rethrow_last_grenade · lineup_save [name] [left|right|both] [stand|crouch|jump|runjump|walk] · lineups · clear'] };
  }
  return err('?');
}
function setposAng(ctx, p, withAng) {
  const s = ctx.me(); if (!s) return err('setpos: not in the map'); const g = ctx.frame.toGame(p.x, p.y, p.z - eyeHU(s.duck));
  let pitch = s.pitch, yaw = s.yaw; if (withAng && p.hasAng) { const l = toLook(p.pitch, p.yaw); pitch = l.pitch; yaw = l.yaw; }
  ctx.teleport(g[0], g[1], g[2], pitch, yaw); return { lines: [] }; }
const err = m => ({ lines: [m], error: true });
const eyeHU = duck => EYE_HU.stand + (EYE_HU.duck - EYE_HU.stand) * Math.max(0, Math.min(1, +duck || 0));   // (as arena-nades.js throwEye)
const pend = (r, ok) => r && typeof r.then === 'function' ? { lines: ok ? [ok] : [], pending: r } : { lines: ok ? [ok] : typeof r === 'string' ? [r] : [] };

// The console panel (DOM). ctx(): the context above, made when a line runs; isGD(): Global Defensive on; release() /
// capture(): the mouse (lab.js: pointer lock). One panel, made at the first open.
export function createConsole({ ctx, isGD, release = () => {}, capture = () => {} }) {
  let el = null, out = null, input = null, open = false; const hist = [], MAXLINES = 200; let hi = 0;
  const print = (t, cls = '') => { const d = document.createElement('div'); d.textContent = t; if (cls) d.className = cls; out.append(d); while (out.childElementCount > MAXLINES) out.firstElementChild.remove(); out.scrollTop = out.scrollHeight; };
  function build() {
    el = document.createElement('div'); el.id = 'gd-console'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Console');
    Object.assign(el.style, { position: 'fixed', left: '50%', top: '8%', transform: 'translateX(-50%)', width: 'min(760px, calc(100vw - 32px))', height: '42vh', zIndex: 60, background: '#14171bee', border: '1px solid #3a4048', borderRadius: '4px', display: 'flex', flexDirection: 'column', font: '13px/1.45 ui-monospace, Menlo, Consolas, monospace', color: '#d9dde2' });
    el.innerHTML = '<div style="padding:4px 10px;background:#22272d;color:#9aa3ad;font:12px system-ui,sans-serif;display:flex;justify-content:space-between"><span>Console</span><span>` to close · Enter to run</span></div><div class="gc-out" style="flex:1;overflow:auto;padding:6px 10px;user-select:text;white-space:pre-wrap;word-break:break-all"></div><input class="gc-in" spellcheck="false" autocomplete="off" aria-label="Command" style="margin:0;border:0;border-top:1px solid #3a4048;background:#0e1013;color:#fff;padding:7px 10px;font:inherit;outline:none">';
    document.body.append(el); out = el.querySelector('.gc-out'); input = el.querySelector('.gc-in');
    const st = document.createElement('style'); st.textContent = '#gd-console .gc-err{color:#ff8a7a}#gd-console .gc-cmd{color:#8fb7ff}'; el.append(st);
    input.addEventListener('keydown', e => {
      if (e.code === 'Backquote') { e.preventDefault(); e.stopPropagation(); toggle(false); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); toggle(false); return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); if (!hist.length) return; hi = Math.max(0, Math.min(hist.length, hi + (e.key === 'ArrowUp' ? -1 : 1))); input.value = hist[hi] ?? ''; return; }
      if (e.key !== 'Enter') return; e.preventDefault(); const line = input.value; input.value = ''; if (!line.trim()) return; hist.push(line); if (hist.length > 50) hist.shift(); hi = hist.length; run(line); });
    print('Practice console · help for its commands');
  }
  function run(line) {
    print('] ' + line, 'gc-cmd'); let r; try { r = runCommand(line, ctx()); } catch (e) { r = { lines: [String(e?.message || e)], error: true }; }
    if (r.clear) out.textContent = ''; for (const t of r.lines) print(t, r.error ? 'gc-err' : '');
    r.pending?.then?.(v => { for (const t of [].concat(v ?? [])) if (typeof t === 'string' && t) print(t); }, e => print(String(e?.message || e), 'gc-err')); return r; }
  function toggle(on = !open) { if (!el) build(); if (on === open) return; open = on; el.hidden = !on; if (on) { release(); input.focus(); } else { input.blur(); capture(); } }
  const onKey = e => { if (e.code !== 'Backquote' || e.repeat || !isGD() || open) return; if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) return; e.preventDefault(); e.stopImmediatePropagation(); toggle(true); };
  addEventListener('keydown', onKey, { capture: true });
  return { get open() { return open; }, toggle, run: line => { if (!el) build(); return run(line); }, print: t => { if (!el) build(); print(t); },
    dispose() { removeEventListener('keydown', onKey, { capture: true }); el?.remove(); el = null; open = false; } };
}
