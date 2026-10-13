// Global Defensive comms on screen: the message feed (bottom left, CS style), the chat box (Y: everyone, U: team —
// it says who will read it before you send), the quick-radio menu (Z, then 1–9) and radar pings. Recipients are
// decided by the room (gd-radio.js); this only shows and sends. Text from muted players is hidden (separate from
// voice mute).
import { RADIO } from './gd-radio.js';

const TKEY = 'gd-textmute', key = n => String(n || '').trim().toLowerCase().slice(0, 40);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export function createComms({ lan, world, name, notify = () => {} }) {
  const css = document.createElement('style'); css.textContent = `
#gd-feed{position:fixed;left:18px;bottom:96px;z-index:37;width:min(440px,46vw);display:flex;flex-direction:column;gap:3px;pointer-events:none;font:600 13px system-ui;text-shadow:0 1px 2px #000,0 0 3px #000}
#gd-feed div{background:#0008;padding:3px 8px;border-radius:4px;color:#e9eef0;transition:opacity .4s}#gd-feed .t b{color:#e8b25b}#gd-feed .ct b{color:#6fb1ef}#gd-feed .radio{color:#c9f3c9}#gd-feed small{color:#9fb2bb;font-weight:600}
#gd-chat{position:fixed;left:18px;bottom:60px;z-index:46;display:flex;gap:6px;align-items:center;background:#0b1118ee;border:1px solid #ffffff33;border-radius:6px;padding:6px 8px;font:600 13px system-ui;color:#fff}#gd-chat[hidden]{display:none}
#gd-chat span{font:800 11px system-ui;letter-spacing:.08em;padding:2px 6px;border-radius:3px;background:#ffffff22}#gd-chat span.team{background:#2e6b8f}#gd-chat input{width:min(340px,40vw);background:transparent;border:0;outline:0;color:#fff;font:600 14px system-ui}
#gd-radio{position:fixed;left:18px;top:50%;transform:translateY(-50%);z-index:46;background:#0b1118ee;border:1px solid #ffffff33;border-radius:6px;padding:10px 14px;font:600 13px system-ui;color:#fff;min-width:210px}#gd-radio[hidden]{display:none}#gd-radio h4{margin:0 0 6px;font:800 11px system-ui;letter-spacing:.12em;color:#9fd8ff}#gd-radio div{padding:2px 0}#gd-radio kbd{display:inline-block;min-width:16px;text-align:center;background:#ffffff22;border-radius:3px;margin-right:8px}`;
  (document.head || document.body).append?.(css);
  document.body.insertAdjacentHTML('beforeend', '<div id="gd-feed"></div><form id="gd-chat" hidden><span></span><input maxlength="120" autocomplete="off" aria-label="Message"></form><div id="gd-radio" hidden></div>');
  const feed = document.getElementById('gd-feed'), form = document.getElementById('gd-chat'), input = form.querySelector('input'), to = form.querySelector('span'), radioBox = document.getElementById('gd-radio');
  let muted = (() => { try { return JSON.parse(localStorage.getItem(TKEY) || '[]'); } catch { return []; } })(), toTeam = false, radioOpen = false, onClose = () => {};
  const pings = [], lines = [];
  const game = () => world.operations.game, myTeam = () => game().combat?.d?.teams?.[key(name())] || null;
  const teamLabel = t => t === 't' ? 'TERRORISTS' : t === 'ct' ? 'COUNTER-TERRORISTS' : t === 'spec' ? 'SPECTATORS' : 'TEAM';
  function show(m) {
    if (muted.includes(key(m.name)) && m.kind !== 'radio') return;
    const div = document.createElement('div'); div.className = (m.team || '') + (m.kind === 'radio' ? ' radio' : '');
    div.innerHTML = `${m.dead ? '<small>*DEAD* </small>' : ''}${m.toTeam && m.kind !== 'radio' ? '<small>(Team) </small>' : ''}${m.kind === 'radio' ? '<small>[Radio] </small>' : ''}<b>${esc(m.name)}</b>${m.callout ? ` <small>@ ${esc(m.callout)}</small>` : ''}: ${esc(m.text)}`;
    feed.append(div); lines.push({ div, at: performance.now() }); while (feed.children.length > 7) { feed.firstChild.remove(); lines.shift(); }
    if (m.ping) pings.push({ x: m.ping.x, z: m.ping.z, at: performance.now(), team: m.team });
  }
  lan.onComms?.(show);
  form.addEventListener('submit', async e => { e.preventDefault(); const text = input.value.trim(); if (!text) { api.close(); return; }
    try { await lan.comms({ kind: 'say', team: toTeam, text }); api.close(); } catch (err) { notify(err.message); } });
  input.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); api.close(); } e.stopPropagation(); });
  const calls = () => RADIO[myTeam()] || [];
  const api = {
    get open() { return !form.hidden; }, get radioOpen() { return radioOpen; },
    // Chat box: everyone (Y) or your team (U); shows who reads it before you send.
    chat(team = false, closed = () => {}) { if (!lan.connected) { notify('Comms need a LAN room'); return; } toTeam = !!team && !!myTeam(); onClose = closed; to.textContent = toTeam ? 'TO ' + teamLabel(myTeam()) : 'TO EVERYONE'; to.className = toTeam ? 'team' : ''; form.hidden = false; document.exitPointerLock?.(); input.value = ''; setTimeout(() => input.focus()); },
    close() { form.hidden = true; input.blur(); onClose(); },
    // Quick radio (Z): the side's calls, picked with 1–9; Z / Esc closes.
    radio(on = !radioOpen) { const list = calls(); if (on && !list.length) { notify('No radio for spectators'); return; } radioOpen = !!on; radioBox.hidden = !radioOpen; if (radioOpen) radioBox.innerHTML = `<h4>RADIO · ${teamLabel(myTeam())}</h4>` + list.map(([, label, ping], i) => `<div><kbd>${i + 1}</kbd>${esc(label)}${ping ? ' <small>· marks you on the radar</small>' : ''}</div>`).join('') + '<div><kbd>Z</kbd>close</div>'; },
    async pick(i) { const call = calls()[i - 1]; this.radio(false); if (!call) return; try { await lan.comms({ kind: 'radio', cmd: call[0] }); } catch (err) { notify(err.message); } },
    muteText(n, m) { const k = key(n), set = new Set(muted); if (m) set.add(k); else set.delete(k); muted = [...set]; try { localStorage.setItem(TKEY, JSON.stringify(muted)); } catch {} },
    isTextMuted: n => muted.includes(key(n)),
    // Radar pings from team mates' calls (their own position), for 3 s.
    get pings() { const now = performance.now(); while (pings.length && now - pings[0].at > 3000) pings.shift(); return pings; },
    update() { const now = performance.now(); for (const l of lines) { const o = now - l.at > 9000 ? '0' : '1'; if (l.div.style.opacity !== o) l.div.style.opacity = o; } },
    clear() { feed.innerHTML = ''; lines.length = 0; pings.length = 0; this.radio(false); if (!form.hidden) this.close(); },
  };
  return api;
}
