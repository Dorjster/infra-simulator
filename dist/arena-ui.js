// Arena screens: entering / leaving the arena (map + spawn), the scoreboard (Tab, held), a CS-style kill feed
// (killer · weapon · head-shot mark · victim), the match clock, the buy menu (B, CS2-style categories) and
// bot controls. Reads the shared world (game.arena, game.combat); every change is an arena action to the host.
import { ARENA_MAPS } from './arena-maps.js';
import { ARENA } from './facility-layout.js';
import { WEAPONS, KNIVES, weaponById } from './weapons-data.js';
import { arenaArsenalOf } from './combat-logic.js';

const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// CS2 buy-menu prices (for reference in deathmatch, where everything is free; defuse uses them).
export const CS_PRICE = { pistol: 200, deagle: 700, smg: 1500, shotgun: 1050, lmg: 5200, ak: 2700, m4: 2900, sniper: 4750 };
const CATS = [['Pistols', ['pistol', 'deagle']], ['Mid-tier', ['smg', 'shotgun', 'lmg']], ['Rifles', ['ak', 'm4', 'sniper']], ['Equipment', []], ['Grenades', []]];
// Small weapon silhouettes for the kill feed and buy menu (original line drawings).
const ICON = { pistol: 'M2 6h14v3H9l-1 5H4l1-5H2z', deagle: 'M1 5h17v4H10l-1 6H5l1-6H1z', cannon: 'M1 5h17v4H10l-1 6H5l1-6H1z', smg: 'M1 6h20v3h-6l-1 6h-3l1-6H8l-1 4H4l1-4H1z', shotgun: 'M0 6h26v2H12l-2 5H5l2-5H0z', ak: 'M0 6h26v3h-9l2 6h-3l-2-6h-3l-2 4H6l2-4H0z', m4: 'M0 6h26v3h-9l1 6h-3l-1-6h-4l-2 4H5l2-4H0z', sniper: 'M0 6h30v2H17v-3h5v3h-5l-3 5H9l3-5H0z', lmg: 'M0 6h28v3h-8v5h-5V9h-3l-2 4H6l2-4H0z', knife: 'M2 9l14-3 4 2-14 3z', karambit: 'M3 11c4-8 12-8 16-4l-3 1c-3-2-8-2-11 4z' };
const icon = id => `<svg viewBox="0 0 30 16" width="44" height="20" fill="currentColor"><path d="${ICON[id] || ICON.pistol}"/></svg>`;
const HS = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><circle cx="8" cy="7" r="5"/><rect x="6" y="11" width="4" height="4"/><circle cx="6" cy="7" r="1.2" fill="#000"/><circle cx="10" cy="7" r="1.2" fill="#000"/></svg>';

export function createArenaUI({ world, lan, name, notify, scene, send, teleport, holster, equip, onEnter, onLeave, where = () => null }) {
  const g = () => world.operations.game, me = () => key(name());
  const css = document.createElement('style'); css.textContent = `
#ar-top{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:37;display:flex;gap:10px;align-items:center;font:800 18px ui-monospace,Menlo,monospace;color:#fff;text-shadow:0 2px 4px #000}#ar-top[hidden]{display:none}#ar-top span{background:#000a;border-radius:6px;padding:4px 12px}#ar-top small{font:600 11px system-ui;opacity:.75;letter-spacing:.1em}
#ar-feed{position:fixed;top:56px;right:16px;z-index:37;display:flex;flex-direction:column;gap:4px;align-items:flex-end;pointer-events:none}#ar-feed p{margin:0;display:flex;gap:8px;align-items:center;background:#000b;border:1px solid #ffffff22;border-radius:4px;padding:3px 10px;color:#fff;font:700 13px system-ui}#ar-feed p.mine{border-color:#e33;box-shadow:inset 0 0 0 1px #e33}#ar-feed .a{color:#ffd36b}#ar-feed .v{color:#9fd8ff}
#ar-board{position:fixed;inset:0;z-index:43;display:grid;place-items:center;pointer-events:none}#ar-board[hidden]{display:none}#ar-board>div{pointer-events:auto;min-width:560px;background:#0b1118ee;border:1px solid #3d5566;border-radius:10px;color:#e8eef2;font:600 14px system-ui;padding:14px 18px}#ar-board table{width:100%;border-collapse:collapse}#ar-board th{text-align:left;font-size:11px;letter-spacing:.12em;color:#8aa2b0;padding:4px 6px}#ar-board td{padding:5px 6px;border-top:1px solid #ffffff12}#ar-board tr.dead td{opacity:.38}#ar-board tr.me td{color:#ffd36b}#ar-board .tools{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}#ar-board button,#ar-buy button{background:#16222c;color:#e8eef2;border:1px solid #3d5566;border-radius:6px;padding:6px 12px;cursor:pointer;font:600 13px system-ui}#ar-board button:hover,#ar-buy button:hover{border-color:#ffd36b}
#ar-buy{position:fixed;inset:0;z-index:44;display:grid;place-items:center;background:#0008}#ar-buy[hidden]{display:none}#ar-buy>div{width:min(880px,94vw);background:#0b1118f2;border:1px solid #3d5566;border-radius:12px;color:#e8eef2;font:600 14px system-ui;padding:16px 20px}
#ar-buy h2{margin:0 0 4px;font:800 20px system-ui;letter-spacing:.04em}#ar-buy .cats{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:12px}#ar-buy .cat h3{margin:0 0 6px;font:700 12px system-ui;letter-spacing:.14em;color:#8aa2b0;text-transform:uppercase}#ar-buy .item{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;margin-bottom:6px;text-align:left}#ar-buy .item.on{border-color:#ffd36b;background:#2a2410}#ar-buy .item svg{color:#e8eef2}#ar-buy .item em{font-style:normal;color:#7fe3a0;font-size:12px}#ar-buy .item s{color:#8aa2b0;font-size:11px}#ar-buy .soon{color:#6f8796;font-size:12px}
body.in-arena #eng-objective,body.in-arena #inventory{display:none!important}
#ar-over{position:fixed;top:30%;left:50%;transform:translateX(-50%);z-index:42;background:#000c;border:2px solid #ffd36b;border-radius:10px;padding:16px 30px;color:#fff;font:800 26px system-ui;text-align:center}#ar-over[hidden]{display:none}#ar-over small{display:block;font:600 14px system-ui;margin-top:6px;opacity:.8}`;
  (document.head || document.body).append?.(css);
  document.body.insertAdjacentHTML('beforeend', '<div id="ar-top" hidden></div><div id="ar-feed"></div><div id="ar-board" hidden><div></div></div><div id="ar-buy" hidden><div></div></div><div id="ar-over" hidden></div>');
  const $ = id => document.getElementById(id);
  let entered = null, spawnAt = null, buyOpen = false, boardOpen = false, feedKey = '';
  const inArena = () => g().mode === 'arena' && !!g().arena;
  const names = () => { const A = g().arena, C = g().combat || {}, list = new Map(); for (const p of lan.players || []) if (p.pose?.z < -200 || p.bot) list.set(key(p.name), p.name); list.set(me(), name()); for (const b of A?.bots || []) list.set(key(b.name), b.name); for (const k of Object.keys(C.kills || {})) if (!list.has(k)) list.set(k, C.names?.[k] || k); return [...list.values()]; };
  const isDownNow = n => (g().combat?.down?.[key(n)]?.until || 0) > Date.now();
  function spawnIndex() { const players = (lan.players || []).filter(p => !p.bot); const i = players.findIndex(p => p.id === lan.selfID); return i >= 0 ? i * 3 + 1 : Math.floor(Math.random() * 8); }
  // Spawn, facing the middle of the map (camera looks along (−sin yaw, −cos yaw)).
  function goTo(i) { const s = scene.spawnFor(i); if (!s) return; teleport(s.x, s.z, Math.atan2(-(ARENA.cx - s.x), -(ARENA.cz - s.z))); }
  function enter() { const A = g().arena; document.body.classList.add('in-arena'); spawnAt = g().combat?.spawnTo?.[me()]?.at ?? null; scene.show(A.map); entered = A.map + ':' + A.startedAt; onEnter(); holster(); goTo(spawnIndex()); const own = arenaArsenalOf(g(), name()); equip(own.find(id => ['pistol', 'deagle', 'cannon'].includes(id)) || own[0]); if (!g().arena.loadout?.[me()]?.primary) setTimeout(() => buy(true), 400); notify('Arena · ' + ARENA_MAPS[A.map].name + ' · deathmatch · B buy menu · Tab scores'); }
  function leave() { entered = null; document.body.classList.remove('in-arena'); scene.hide(); buy(false); scoreboard(false); $('ar-top').hidden = true; $('ar-feed').innerHTML = ''; $('ar-over').hidden = true; onLeave(); }
  function buy(open = !buyOpen) {
    buyOpen = !!open && inArena(); $('ar-buy').hidden = !buyOpen; if (!buyOpen) { return; } document.exitPointerLock?.();
    const l = g().arena.loadout?.[me()] || { primary: null, secondary: 'pistol' }, kn = /^darja$/.test(me()) ? KNIVES[1] : KNIVES[0];
    $('ar-buy').firstElementChild.innerHTML = `<h2>BUY MENU · DEATHMATCH</h2><small style="color:#8aa2b0">Everything is free in deathmatch · CS2 prices shown for reference · your knife: ${esc(kn.name)}</small>
      <div class="cats">${CATS.map(([cat, ids]) => `<div class="cat"><h3>${cat}</h3>${ids.length ? ids.map(id => { const w = weaponById(id), on = l.primary === id || l.secondary === id; return `<button class="item${on ? ' on' : ''}" data-pick="${id}">${icon(id)}<b>${esc(w.name)}</b><em>Free</em><s>$${CS_PRICE[id].toLocaleString('en-US')}</s></button>`; }).join('') : '<p class="soon">Next update</p>'}</div>`).join('')}</div>
      <div style="display:flex;gap:8px;margin-top:10px"><button data-act="close">Done (B)</button></div>`;
    $('ar-buy').querySelectorAll('[data-pick]').forEach(b => b.onclick = async () => { const id = b.dataset.pick, pistol = ['pistol', 'deagle'].includes(id); const r = await send(pistol ? { type: 'loadout', secondary: id } : { type: 'loadout', primary: id }); notify(typeof r === 'string' ? r : r?.message || 'Loadout updated'); equip(id); buy(true); });
    $('ar-buy').querySelector('[data-act=close]').onclick = () => buy(false);
  }
  function scoreboard(open) {
    boardOpen = !!open && inArena(); $('ar-board').hidden = !boardOpen; if (!boardOpen) return;
    const C = g().combat || {}, A = g().arena, rows = names().map(n => ({ n, k: C.kills?.[key(n)] || 0, d: C.deaths?.[key(n)] || 0, bot: /^BOT /.test(n), dead: isDownNow(n) })).sort((a, b) => b.k - a.k || a.d - b.d);
    $('ar-board').firstElementChild.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:16px">DEATHMATCH · ${esc(ARENA_MAPS[A.map].name)}</b><small style="color:#8aa2b0">${rows.length} players · first to the most kills in 10:00</small></div>
      <table><tr><th>PLAYER</th><th>K</th><th>D</th><th>K/D</th></tr>${rows.map(r => `<tr class="${r.dead ? 'dead' : ''}${key(r.n) === me() ? ' me' : ''}"><td>${r.bot ? '🤖 ' : ''}${esc(r.n)}${r.dead ? ' <small>· dead</small>' : ''}</td><td>${r.k}</td><td>${r.d}</td><td>${(r.k / Math.max(1, r.d)).toFixed(2)}</td></tr>`).join('')}</table>
      <div class="tools"><button data-bot="add">+ Add bot</button><button data-bot="remove">− Remove bot</button>${Object.entries(ARENA_MAPS).filter(([, m]) => m.kind === 'dm').map(([id, m]) => `<button data-map="${id}">${id === A.map ? 'Restart' : 'Play'} ${esc(m.name)}</button>`).join('')}</div>`;
    $('ar-board').querySelectorAll('[data-bot]').forEach(b => b.onclick = async () => { const r = await send({ type: b.dataset.bot === 'add' ? 'add-bot' : 'remove-bot' }); notify(typeof r === 'string' ? r : r?.message || ''); scoreboard(true); });
    $('ar-board').querySelectorAll('[data-map]').forEach(b => b.onclick = async () => { const r = await send({ type: 'restart', map: b.dataset.map }); notify(typeof r === 'string' ? r : r?.message || ''); });
  }
  function hud() {
    const A = g().arena, C = g().combat || {}, left = Math.max(0, A.endsAt - Date.now()), mm = Math.floor(left / 60000), ss = String(Math.floor(left / 1000) % 60).padStart(2, '0');
    const top = Object.entries(C.kills || {}).sort((a, b) => b[1] - a[1])[0], mine = C.kills?.[me()] || 0;
    $('ar-top').hidden = false; $('ar-top').innerHTML = `<span><small>KILLS</small> ${mine}</span><span>${mm}:${ss}</span><span><small>LEADER</small> ${top ? esc(C.names?.[top[0]] || top[0]) + ' ' + top[1] : '—'}</span>`;
    const feed = (C.feed || []).filter(f => Date.now() - f.at < 7000), fk = feed.map(f => f.at).join();
    if (fk !== feedKey) { feedKey = fk; $('ar-feed').innerHTML = feed.map(f => `<p class="${key(f.by) === me() || key(f.target) === me() ? 'mine' : ''}"><span class="a">${esc(f.by)}</span>${icon(f.wid)}${f.head ? HS : ''}<span class="v">${esc(f.target)}</span></p>`).join(''); }
    $('ar-over').hidden = !A.over; if (A.over) $('ar-over').innerHTML = `MATCH OVER<small>${A.over.winner ? 'Winner: ' + esc(A.over.winner) : 'No kills'} · next match in ${Math.max(0, Math.ceil((A.over.at + 12000 - Date.now()) / 1000))} s</small>`;
    if (boardOpen) scoreboard(true);
  }
  let hudAt = 0;
  return {
    get open() { return buyOpen; }, buy, scoreboard,
    update() {
      if (!inArena()) { if (entered) leave(); return; }
      const A = g().arena; if (entered !== A.map + ':' + A.startedAt) enter();
      // Respawn: the host picks the spawn farthest from enemies.
      // Something outside the arena moved us back to the hall (joining, a menu): return to a spawn point.
      const at = where(); if (at && !scene.inArena(at.z)) goTo(spawnIndex());
      const s = g().combat?.spawnTo?.[me()]; if (s && s.at !== spawnAt) { spawnAt = s.at; goTo(s.i); notify('Respawned'); }
      if (performance.now() - hudAt > 200) { hudAt = performance.now(); hud(); }
    },
  };
}
