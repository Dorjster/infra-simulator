// Arena screens: entering / leaving the arena (map + spawn), the scoreboard (Tab, held), a CS-style kill feed
// (killer · weapon · head-shot mark · victim), the match clock, the buy menu (B, CS2-style categories) and
// bot controls. Reads the shared world (game.arena, game.combat); every change is an arena action to the host.
import { ARENA_MAPS } from './arena-maps.js';
import { ARENA } from './facility-layout.js';
import { WEAPONS, KNIVES, weaponById, ARMOR } from './weapons-data.js';
import { arenaArsenalOf } from './combat-logic.js';
import { slotOf, PICK_R } from './arena-logic.js';
import { weaponModel } from './weapon-models.js';
import { NADES } from './arena-nades.js';
import { throwSound, explosion, beep } from './arena-nades-view.js';
import { PRICE, DEFUSE } from './arena-defuse.js';

const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// CS2 buy-menu prices (for reference in deathmatch, where everything is free; defuse uses them).
export const CS_PRICE = { he: 300, flash: 200, smoke: 300, molotov: 400, pistol: 200, deagle: 700, smg: 1500, shotgun: 1050, lmg: 5200, ak: 2700, m4: 2900, sniper: 4750 };
const CATS = [['Pistols', ['pistol', 'deagle']], ['Mid-tier', ['smg', 'shotgun', 'lmg']], ['Rifles', ['ak', 'm4', 'sniper']], ['Equipment', []], ['Grenades', ['he', 'flash', 'smoke', 'molotov']]];
// Small weapon silhouettes for the kill feed and buy menu (original line drawings).
const ICON = { pistol: 'M2 6h14v3H9l-1 5H4l1-5H2z', deagle: 'M1 5h17v4H10l-1 6H5l1-6H1z', cannon: 'M1 5h17v4H10l-1 6H5l1-6H1z', smg: 'M1 6h20v3h-6l-1 6h-3l1-6H8l-1 4H4l1-4H1z', shotgun: 'M0 6h26v2H12l-2 5H5l2-5H0z', ak: 'M0 6h26v3h-9l2 6h-3l-2-6h-3l-2 4H6l2-4H0z', m4: 'M0 6h26v3h-9l1 6h-3l-1-6h-4l-2 4H5l2-4H0z', sniper: 'M0 6h30v2H17v-3h5v3h-5l-3 5H9l3-5H0z', lmg: 'M0 6h28v3h-8v5h-5V9h-3l-2 4H6l2-4H0z', knife: 'M2 9l14-3 4 2-14 3z', karambit: 'M3 11c4-8 12-8 16-4l-3 1c-3-2-8-2-11 4z' };
const NADE_ICON = { he: 'M11 3h4v2h-4zM13 5a6 6 0 1 1-.01 0z', flash: 'M10 3h6v3h-6zM10 6h6v9h-6z', smoke: 'M9 3h8v3H9zM9 6h8v9H9z', molotov: 'M12 1h2v4h-2zM11 5h4v2l2 2v6H9V9l2-2z' };
Object.assign(ICON, NADE_ICON);
const icon = id => `<svg viewBox="0 0 30 16" width="44" height="20" fill="currentColor"><path d="${ICON[id] || ICON.pistol}"/></svg>`;
const HS = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><circle cx="8" cy="7" r="5"/><rect x="6" y="11" width="4" height="4"/><circle cx="6" cy="7" r="1.2" fill="#000"/><circle cx="10" cy="7" r="1.2" fill="#000"/></svg>';

export function createArenaUI({ world, lan, name, notify, scene, send, teleport, holster, equip, onEnter, onLeave, where = () => null, current = () => null, feet = () => 0, yaw = () => 0, ready = () => null, aim = () => ({}), setAmmo = null, onBuyClose = () => {}, lookDir = () => null }) {
  const g = () => world.operations.game, me = () => key(name());
  const css = document.createElement('style'); css.textContent = `
#ar-top{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:37;display:flex;gap:10px;align-items:center;font:800 18px ui-monospace,Menlo,monospace;color:#fff;text-shadow:0 2px 4px #000}#ar-top[hidden]{display:none}#ar-top span{background:#000a;border-radius:6px;padding:4px 12px}#ar-top small{font:600 11px system-ui;opacity:.75;letter-spacing:.1em}
#ar-feed{position:fixed;top:56px;right:16px;z-index:37;display:flex;flex-direction:column;gap:4px;align-items:flex-end;pointer-events:none}#ar-feed p{margin:0;display:flex;gap:8px;align-items:center;background:#000b;border:1px solid #ffffff22;border-radius:4px;padding:3px 10px;color:#fff;font:700 13px system-ui}#ar-feed p.mine{border-color:#e33;box-shadow:inset 0 0 0 1px #e33}#ar-feed .a{color:#ffd36b}#ar-feed .v{color:#9fd8ff}
#ar-board{position:fixed;inset:0;z-index:43;display:grid;place-items:center;pointer-events:none}#ar-board[hidden]{display:none}#ar-board>div{pointer-events:auto;min-width:560px;background:#0b1118ee;border:1px solid #3d5566;border-radius:10px;color:#e8eef2;font:600 14px system-ui;padding:14px 18px}#ar-board table{width:100%;border-collapse:collapse}#ar-board th{text-align:left;font-size:11px;letter-spacing:.12em;color:#8aa2b0;padding:4px 6px}#ar-board td{padding:5px 6px;border-top:1px solid #ffffff12}#ar-board tr.dead td{opacity:.38}#ar-board tr.me td{color:#ffd36b}#ar-board .tools{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}#ar-board button,#ar-buy button{background:#16222c;color:#e8eef2;border:1px solid #3d5566;border-radius:6px;padding:6px 12px;cursor:pointer;font:600 13px system-ui}#ar-board button:hover,#ar-buy button:hover{border-color:#ffd36b}
#ar-buy{position:fixed;inset:0;z-index:44;display:grid;place-items:center;background:#0008}#ar-buy[hidden]{display:none}#ar-buy>div{width:min(880px,94vw);background:#0b1118f2;border:1px solid #3d5566;border-radius:12px;color:#e8eef2;font:600 14px system-ui;padding:16px 20px}
#ar-buy>div{max-height:92vh;overflow:auto;width:min(1180px,96vw)!important}#ar-buy .near{margin-top:10px;padding:8px;border:1px dashed #7fe3a0;border-radius:8px;background:#0f1f14;display:flex;flex-wrap:wrap;gap:6px}#ar-buy .near h3{width:100%;margin:0 0 2px;font:700 12px system-ui;letter-spacing:.14em;color:#7fe3a0}#ar-buy .near .item{width:auto;min-width:180px;margin:0}#ar-buy .near span,#ar-buy .near small{font-size:11px;color:#b9c7cf}#ar-buy .info{margin-top:10px;padding:10px 12px;border:1px solid #3d5566;border-radius:8px;background:#101a22;font:500 13px system-ui}#ar-buy .info p{margin:4px 0 6px;color:#b9c7cf}#ar-buy .info dl{display:grid;grid-template-columns:repeat(4,auto 1fr);gap:2px 10px;margin:0}#ar-buy .info dt{color:#8aa2b0}#ar-buy .info dd{margin:0}
#ar-buy h2{margin:0 0 4px;font:800 20px system-ui;letter-spacing:.04em}#ar-buy .cats{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-top:12px}@media (max-width:900px){#ar-buy .cats{grid-template-columns:repeat(3,1fr)}#ar-buy .info dl{grid-template-columns:auto 1fr}}#ar-buy .cat h3{margin:0 0 6px;font:700 12px system-ui;letter-spacing:.14em;color:#8aa2b0;text-transform:uppercase}#ar-buy .item{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;margin-bottom:6px;text-align:left}#ar-buy .item.on{border-color:#ffd36b;background:#2a2410}#ar-buy .item svg{color:#e8eef2}#ar-buy .item em{font-style:normal;color:#7fe3a0;font-size:12px}#ar-buy .item s{color:#8aa2b0;font-size:11px}#ar-buy .soon{color:#6f8796;font-size:12px}
#ar-load{position:fixed;inset:0;z-index:60;display:grid;place-content:center;gap:8px;text-align:center;background:#0b1118;color:#fff;font:900 34px system-ui;letter-spacing:.18em}#ar-load[hidden]{display:none}#ar-load small{font:600 14px system-ui;letter-spacing:.1em;opacity:.7}
#ar-top .t{color:#ffc36b}#ar-top .ct{color:#8fc4ff}#ar-alive{position:fixed;top:48px;left:50%;transform:translateX(-50%);z-index:37;display:flex;gap:22px;pointer-events:none}#ar-alive[hidden]{display:none}#ar-alive div{display:flex;gap:3px}#ar-alive i{display:block;width:26px;height:8px;border-radius:2px}#ar-alive .t i{background:#e8a53f}#ar-alive .ct i{background:#5b9be8}#ar-alive i.dead{opacity:.22}
#ar-money{position:fixed;left:22px;bottom:142px;z-index:36;color:#7dff8e;font:800 22px ui-monospace,Menlo,monospace;text-shadow:0 2px 3px #000}#ar-money[hidden]{display:none}
#ar-banner{position:fixed;top:22%;left:50%;transform:translateX(-50%);z-index:42;padding:10px 26px;border-radius:8px;background:#000b;color:#fff;font:900 26px system-ui;letter-spacing:.08em;text-align:center;pointer-events:none}#ar-banner[hidden]{display:none}#ar-banner.t{border:2px solid #e8a53f}#ar-banner.ct{border:2px solid #5b9be8}#ar-banner.bomb{border:2px solid #ff4040;color:#ff8080}#ar-banner small{display:block;font:600 14px system-ui;letter-spacing:.04em;opacity:.85;margin-top:4px}
#ar-prog{position:fixed;left:50%;top:58%;transform:translateX(-50%);z-index:41;width:260px;background:#000b;border-radius:6px;padding:6px 10px;color:#fff;font:700 13px system-ui;text-align:center;pointer-events:none}#ar-prog[hidden]{display:none}#ar-prog b{display:block;height:6px;background:#ffd36b;border-radius:3px;margin-top:5px}
#ar-look{position:fixed;left:50%;top:calc(50% + 46px);transform:translateX(-50%);z-index:38;background:#000a;border-radius:6px;padding:4px 12px;color:#fff;font:700 13px system-ui;pointer-events:none}#ar-look[hidden]{display:none}
#ar-over{position:fixed;top:30%;left:50%;transform:translateX(-50%);z-index:42;background:#000c;border:2px solid #ffd36b;border-radius:10px;padding:16px 30px;color:#fff;font:800 26px system-ui;text-align:center}#ar-over[hidden]{display:none}#ar-over small{display:block;font:600 14px system-ui;margin-top:6px;opacity:.8}`;
  (document.head || document.body).append?.(css);
  document.body.insertAdjacentHTML('beforeend', '<div id="ar-top" hidden></div><div id="ar-alive" hidden></div><div id="ar-money" hidden></div><div id="ar-banner" hidden></div><div id="ar-prog" hidden><span></span><b></b></div><div id="ar-feed"></div><div id="ar-board" hidden><div></div></div><div id="ar-buy" hidden><div></div></div><div id="ar-over" hidden></div><div id="ar-look" hidden></div><div id="ar-load" hidden><b>GLOBAL DEFENSIVE</b><small>Loading…</small></div>');
  const $ = id => document.getElementById(id);
  // Campaign objective + hotbar hidden in the arena — set on those two elements only (a class on <body> would
  // restyle the whole page: a 50 ms frame on entering).
  const campaignHud = show => { for (const id of ['eng-objective', 'inventory']) { const el = $(id); if (!el) continue; if (show) el.style.removeProperty('display'); else el.style.setProperty('display', 'none', 'important'); } };
  let entered = null, spawnAt = null, buyOpen = false, boardOpen = false, feedKey = '';
  const inArena = () => g().mode === 'arena' && !!g().arena;
  const names = () => { const A = g().arena, C = g().combat || {}, list = new Map(); for (const p of lan.players || []) if (p.pose?.z < -200 || p.bot) list.set(key(p.name), p.name); list.set(me(), name()); for (const b of A?.bots || []) list.set(key(b.name), b.name); for (const k of Object.keys(C.kills || {})) if (!list.has(k)) list.set(k, C.names?.[k] || k); return [...list.values()]; };
  const isDownNow = n => (g().combat?.down?.[key(n)]?.until || 0) > Date.now();
  const D = () => g().combat?.d || null, myTeam = () => D()?.teams?.[me()] || null;
  function spawnIndex() { const so = g().combat?.spawnTo?.[me()]; if (D()) return so ? so.i : myTeam() === 'ct' ? ARENA_MAPS[g().arena.map].t.length : 0; const players = (lan.players || []).filter(p => !p.bot); const i = players.findIndex(p => p.id === lan.selfID); return i >= 0 ? i * 3 + 1 : Math.floor(Math.random() * 8); }
  // Spawn, facing the middle of the map (camera looks along (−sin yaw, −cos yaw)).
  function goTo(i) { const s = scene.spawnFor(i); if (!s) return; teleport(s.x, s.z, Math.atan2(-(ARENA.cx - s.x), -(ARENA.cz - s.z))); }
  // A spawn order from the host: exact spot (x, z) when given, else the map spawn index.
  function goSpawn(so) { if (Number.isFinite(so?.x)) teleport(so.x, so.z, Math.atan2(-(ARENA.cx - so.x), -(ARENA.cz - so.z))); else goTo(so?.i ?? spawnIndex()); }
  // Entering waits for the arena warm-up (shaders, textures) behind a short loading screen instead of a frozen frame.
  let loading = false;
  function enter() { const r = ready(); if (r && !r.done) { if (!loading) { loading = true; performance.mark?.('arena:loading'); $('ar-load').hidden = false; r.catch(() => {}).finally(() => { loading = false; $('ar-load').hidden = true; }); } return; } enterNow(); }
  function enterNow() { performance.mark?.('arena:enter'); const A = g().arena;
    // The map's first frames (GPU uploads, first shadow pass) are drawn behind the loading card; play starts warm.
    $('ar-load').hidden = false; let frames = 0; const reveal = () => { if (++frames < 4) requestAnimationFrame(reveal); else if (!loading) $('ar-load').hidden = true; }; requestAnimationFrame(reveal); campaignHud(false); spawnAt = g().combat?.spawnTo?.[me()]?.at ?? null; scene.show(A.map); entered = A.map + ':' + A.startedAt; onEnter(); holster(); { const so = g().combat?.spawnTo?.[me()]; if (so) goSpawn(so); else goTo(spawnIndex()); } const own = arenaArsenalOf(g(), name()); equip(own.find(id => ['pistol', 'deagle', 'cannon'].includes(id)) || own[0]); if (!D() && !g().arena.loadout?.[me()]?.primary) setTimeout(() => buy(true), 400); notify('Global Defensive · ' + ARENA_MAPS[A.map].name + (D() ? ' · defuse · you are ' + (myTeam() === 'ct' ? 'Counter-Terrorist' : 'Terrorist') + ' · B buy (in spawn, first 35 s)' : ' · deathmatch · B buy menu') + ' · Tab scores'); }
  function leave() { for (const id of ['ar-alive', 'ar-money', 'ar-banner', 'ar-prog']) $(id).hidden = true; bombView(null); for (const m of groundMeshes.values()) m.removeFromParent(); groundMeshes.clear(); groundKey = -1; entered = null; campaignHud(true); scene.hide(); buy(false); scoreboard(false); $('ar-top').hidden = true; $('ar-feed').innerHTML = ''; $('ar-over').hidden = true; onLeave(); }
  // Buy menu (B opens and closes it, Escape closes it). Guns by category with an info card; equipment (armor, kit);
  // grenades; and, apart from the shop, the guns lying near you (free to pick up, E or click).
  const CATS2 = [['Pistols', w => w.kind === 'pistol'], ['SMGs', w => w.kind === 'smg'], ['Heavy', w => w.kind === 'shotgun' || w.kind === 'lmg'], ['Rifles', w => w.kind === 'rifle'], ['Snipers', w => w.kind === 'sniper']];
  const MODE = { auto: 'Automatic', semi: 'Semi-automatic', pump: 'Pump-action', bolt: 'Bolt-action' };
  const info = w => `<b>${esc(w.name)}</b> <small>${w.cat}${w.team ? ' · ' + (w.team === 't' ? 'Terrorist' : 'Counter-Terrorist') + ' only' : ''}</small><p>${esc(w.desc || '')}</p><dl><dt>Price</dt><dd>$${w.price.toLocaleString('en-US')}</dd><dt>Magazine</dt><dd>${w.mag} / ${w.reserve}</dd><dt>Fire</dt><dd>${MODE[w.mode]}${w.zoom ? ' · scope (right click)' : ''}${w.suppressed ? ' · suppressed' : ''}</dd><dt>Damage</dt><dd>${w.dmg}${w.pellets ? ' × ' + w.pellets + ' pellets' : ''} · head shot kills</dd><dt>Armor</dt><dd>${Math.round(w.ap * 100)} % through armor</dd><dt>Wallbang</dt><dd>${w.pen >= 7 ? 'crates and thin walls' : w.pen >= 3 ? 'thin soft cover' : 'barely'}</dd><dt>Fire rate</dt><dd>${Math.round(60000 / w.rateMs)} rpm</dd><dt>Speed</dt><dd>${w.speed}${w.scopedSpeed ? ' (' + w.scopedSpeed + ' scoped)' : ''}</dd><dt>Kill reward</dt><dd>$${w.reward}</dd></dl>`;
  function nearby() { const at = where(); if (!at) return []; return (g().combat?.ground || []).filter(it => slotOf(it.item) && slotOf(it.item) !== 'bomb' && Math.hypot(it.x - at.x, it.z - at.z) <= PICK_R + 3).map(it => ({ it, d: Math.hypot(it.x - at.x, it.z - at.z) })).sort((a, b) => a.d - b.d); }
  async function pickUp(it) { const r = await send({ type: 'pickup', id: it.id, swap: true }); if (r?.error) { notify(r.error); return false; } notify(typeof r === 'string' ? r : r?.message || 'Picked up'); setAmmo?.(it.item, it.ammo); equip(it.item); return true; }
  let infoId = null;
  function buy(open = !buyOpen) {
    const was = buyOpen; buyOpen = !!open && inArena(); $('ar-buy').hidden = !buyOpen; if (!buyOpen) { if (was) onBuyClose(); return; } document.exitPointerLock?.();
    const l = g().arena.loadout?.[me()] || {}, kn = /^darja$/.test(me()) ? KNIVES[1] : KNIVES[0], team = myTeam();
    const d = D(), money = d ? (d.money?.[me()] ?? 800) : 0, r = d?.round, buyErr = !d ? null : !r || r.phase === 'over' || (r.phase !== 'freeze' && Date.now() > r.buyUntil) ? 'Buy time is over' : !inBuyZone() ? 'Buy in your spawn' : null, cost = id => d ? (PRICE[id] ?? 0) : 0;
    const arm = g().combat?.armor?.[me()] || { kevlar: 0, helmet: false }, near = nearby();
    const btn = (id, label, price, on, why) => `<button class="item${on ? ' on' : ''}" data-pick="${id}" ${why ? `disabled title="${esc(why)}" style="opacity:.45"` : ''}>${icon(id)}<b>${esc(label)}</b>${d ? `<em>$${price.toLocaleString('en-US')}</em>` : `<em>Free</em><s>$${price.toLocaleString('en-US')}</s>`}</button>`;
    const gun = w => { const off = d && w.team && team && w.team !== team, c = cost(w.id) ?? w.price; return btn(w.id, w.name, w.price, l.primary === w.id || l.secondary === w.id, off ? (w.team === 't' ? 'Terrorists only' : 'Counter-Terrorists only') : buyErr || (d && c > money ? 'Not enough money' : '')); };
    $('ar-buy').firstElementChild.innerHTML = (d ? `<h2>BUY MENU · <span style="color:#7dff8e">$${money.toLocaleString('en-US')}</span></h2><small style="color:#8aa2b0">${buyErr ? buyErr : 'Buy in your spawn for ' + Math.max(0, Math.ceil(((r.phase === 'freeze' ? r.freezeUntil : r.buyUntil) - Date.now()) / 1000)) + ' s'} · ${team === 'ct' ? 'Counter-Terrorist' : 'Terrorist'} · knife: ${esc(kn.name)} · B or Esc closes</small>` : `<h2>BUY MENU · DEATHMATCH</h2><small style="color:#8aa2b0">Everything is free in deathmatch (CS2 prices shown) · knife: ${esc(kn.name)} · B or Esc closes</small>`)
      + (near.length ? `<div class="near"><h3>NEARBY DROPPED WEAPONS · free (E)</h3>${near.map(({ it, d: dist }) => { const w = weaponById(it.item); return `<button class="item drop" data-ground="${it.id}">${icon(it.item)}<b>${esc(w.name)}</b><span>${w.cat || 'Grenade'}${it.ammo ? ' · ' + it.ammo[0] + ' / ' + it.ammo[1] : ''} · ${Math.round(dist * .165)} m</span><small>${it.by ? 'dropped by ' + esc(g().combat?.names?.[key(it.by)] || it.by) : ''}${it.team ? ' · ' + (it.team === 't' ? 'T' : 'CT') : ''}</small></button>`; }).join('')}</div>` : '')
      + `<div class="cats">${CATS2.map(([cat, f]) => `<div class="cat"><h3>${cat}</h3>${WEAPONS.filter(f).filter(w => !d || !w.team || !team || w.team === team).map(gun).join('')}</div>`).join('')}
        <div class="cat"><h3>Equipment</h3>${btn('kevlar', 'Kevlar Vest', ARMOR.kevlar.price, arm.kevlar >= 100, buyErr || (arm.kevlar >= 100 ? 'Full' : d && money < ARMOR.kevlar.price ? 'Not enough money' : ''))}${btn('helmet', 'Kevlar + Helmet', arm.kevlar >= 100 ? ARMOR.helmet.upgrade : ARMOR.helmet.price, arm.kevlar >= 100 && arm.helmet, buyErr || (arm.kevlar >= 100 && arm.helmet ? 'Full' : ''))}${d && team === 'ct' ? `<button class="item${d.kits?.[me()] ? ' on' : ''}" data-kit="1" ${buyErr || money < PRICE.kit || d.kits?.[me()] ? 'disabled style="opacity:.45"' : ''}>${'<b>Defuse kit</b>'}<em>$${PRICE.kit}</em></button>` : ''}
        <h3 style="margin-top:10px">Grenades</h3>${['he', 'flash', 'smoke', 'molotov'].map(id => { const n = (l.nades || []).filter(k => k === id).length; return btn(id, NADES[id].name + (n > 1 ? ' ×' + n : ''), PRICE[id], n > 0, buyErr || (d && PRICE[id] > money ? 'Not enough money' : '')); }).join('')}</div></div>
      <div class="info">${info(weaponById(infoId) || weaponById(l.primary) || weaponById(l.secondary) || WEAPONS[0])}</div>
      <div style="display:flex;gap:8px;margin-top:10px"><button data-act="close">Done (B / Esc)</button></div>`;
    const root = $('ar-buy');
    root.querySelectorAll('[data-pick]').forEach(b => { const id = b.dataset.pick; if (weaponById(id)?.mag) { b.onmouseenter = b.onfocus = () => { infoId = id; root.querySelector('.info').innerHTML = info(weaponById(id)); }; }
      b.onclick = async () => { b.blur(); const pistol = weaponById(id)?.kind === 'pistol', at = where(); const r = await send(NADES[id] ? { type: 'buy-nade', kind: id } : id === 'kevlar' || id === 'helmet' ? { type: 'buy-armor', kind: id } : pistol ? { type: 'loadout', secondary: id, x: at?.x, y: at?.y, z: at?.z } : { type: 'loadout', primary: id, x: at?.x, y: at?.y, z: at?.z });
        if (r?.error) { notify(r.error); buy(true); return; } notify(typeof r === 'string' ? r : r?.message || 'Bought'); if (weaponById(id)?.mag) { setAmmo?.(id, null); equip(id); } buy(true); }; });
    root.querySelectorAll('[data-ground]').forEach(b => b.onclick = async () => { b.blur(); const it = (g().combat?.ground || []).find(x => x.id === b.dataset.ground); if (it) await pickUp(it); buy(true); });
    root.querySelector('[data-kit]')?.addEventListener('click', async () => { const r = await send({ type: 'buy-kit' }); notify(r?.error || (typeof r === 'string' ? r : r?.message) || 'Kit'); buy(true); });
    root.querySelector('[data-act=close]').onclick = () => buy(false);
  }
  // In your team's spawn (Defuse buy zone)?
  function inBuyZone() { const d = D(), at = where(); if (!d || !at) return true; const m = ARENA_MAPS[g().arena.map], sp = myTeam() === 'ct' ? m.ct : m.t, cx = sp.reduce((a, s) => a + s[0], 0) / sp.length, cz = sp.reduce((a, s) => a + s[1], 0) / sp.length; return Math.hypot(at.x - ARENA.cx - cx, at.z - ARENA.cz - cz) <= DEFUSE.buyRadius; }
  function scoreboard(open) {
    boardOpen = !!open && inArena(); $('ar-board').hidden = !boardOpen; if (!boardOpen) return;
    const C = g().combat || {}, A = g().arena, rows = names().map(n => ({ n, k: C.kills?.[key(n)] || 0, d: C.deaths?.[key(n)] || 0, bot: /^BOT /.test(n), dead: isDownNow(n) })).sort((a, b) => b.k - a.k || a.d - b.d);
    $('ar-board').firstElementChild.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:16px">DEATHMATCH · ${esc(ARENA_MAPS[A.map].name)}</b><small style="color:#8aa2b0">${rows.length} players · first to the most kills in 10:00</small></div>
      <table><tr><th>PLAYER</th><th>K</th><th>D</th><th>K/D</th></tr>${rows.map(r => `<tr class="${r.dead ? 'dead' : ''}${key(r.n) === me() ? ' me' : ''}"><td>${r.bot ? '🤖 ' : ''}${esc(r.n)}${r.dead ? ' <small>· dead</small>' : ''}</td><td>${r.k}</td><td>${r.d}</td><td>${(r.k / Math.max(1, r.d)).toFixed(2)}</td></tr>`).join('')}</table>
      <div class="tools"><button data-bot="add">+ Add bot</button><button data-bot="remove">− Remove bot</button>${Object.entries(ARENA_MAPS).filter(([, m]) => m.kind === A.kind).map(([id, m]) => `<button data-map="${id}">${id === A.map ? 'Restart' : 'Play'} ${esc(m.name)}</button>`).join('')}</div>`;
    $('ar-board').querySelectorAll('[data-bot]').forEach(b => b.onclick = async () => { const r = await send({ type: b.dataset.bot === 'add' ? 'add-bot' : 'remove-bot' }); notify(typeof r === 'string' ? r : r?.message || ''); scoreboard(true); });
    $('ar-board').querySelectorAll('[data-map]').forEach(b => b.onclick = async () => { const r = await send({ type: 'restart', map: b.dataset.map }); notify(typeof r === 'string' ? r : r?.message || ''); });
  }
  function hud() {
    if (D()) return defuseHud();
    const A = g().arena, C = g().combat || {}, left = Math.max(0, A.endsAt - Date.now()), mm = Math.floor(left / 60000), ss = String(Math.floor(left / 1000) % 60).padStart(2, '0');
    const top = Object.entries(C.kills || {}).sort((a, b) => b[1] - a[1])[0], mine = C.kills?.[me()] || 0;
    $('ar-top').hidden = false; $('ar-top').innerHTML = `<span><small>KILLS</small> ${mine}</span><span>${mm}:${ss}</span><span><small>LEADER</small> ${top ? esc(C.names?.[top[0]] || top[0]) + ' ' + top[1] : '—'}</span>`;
    const feed = (C.feed || []).filter(f => Date.now() - f.at < 7000), fk = feed.map(f => f.at).join();
    if (fk !== feedKey) { feedKey = fk; $('ar-feed').innerHTML = feed.map(f => `<p class="${key(f.by) === me() || key(f.target) === me() ? 'mine' : ''}"><span class="a">${esc(f.by)}</span>${icon(f.wid)}${f.head ? HS : ''}<span class="v">${esc(f.target)}</span></p>`).join(''); }
    $('ar-over').hidden = !A.over; if (A.over) $('ar-over').innerHTML = `MATCH OVER<small>${A.over.winner ? 'Winner: ' + esc(A.over.winner) : 'No kills'} · next match in ${Math.max(0, Math.ceil((A.over.at + 12000 - Date.now()) / 1000))} s</small>`;
    if (boardOpen) scoreboard(true);
  }
  // Dropped items: drawn lying on their side; rebuilt only when the list changes (no per-frame work).
  const groundMeshes = new Map(); let groundKey = -1, pickAt = 0; const tried = new Map();
  function drawGround() {
    const list = g().combat?.ground || [], k = (g().combat?.groundSeq || 0) * 1000 + list.length; if (k === groundKey) return; groundKey = k;
    const live = new Set(list.map(it => it.id));
    for (const [id, m] of groundMeshes) if (!live.has(id)) { m.removeFromParent(); groundMeshes.delete(id); }
    for (const it of list) if (!groundMeshes.has(it.id)) { const m = weaponModel(it.item, 1); m.userData.ground = true; m.rotation.set(0, it.yaw, Math.PI / 2); m.position.set(it.x, it.y + .35, it.z); scene.group.add(m); groundMeshes.set(it.id, m); }
  }
  const nearest = (r, filter = () => true) => { const at = where(); if (!at) return null; let best = null, bd = r; for (const it of g().combat?.ground || []) { const d = Math.hypot(it.x - at.x, it.z - at.z); if (d < bd && filter(it)) { bd = d; best = it; } } return best; };
  // Walking over an item whose slot is empty picks it up (checked 6×/s).
  function autoPick() {
    if (isDownNow(name())) return; const l = g().arena.loadout?.[me()] || {}, free = s => s === 'primary' ? !l.primary : l.secondary === null;
    const it = nearest(3.2, it => slotOf(it.item) && free(slotOf(it.item)) && (tried.get(it.id) || 0) < Date.now()); if (!it) return;
    tried.set(it.id, Date.now() + 1500); send({ type: 'pickup', id: it.id }).then(r => { const m = typeof r === 'string' ? r : r?.message; if (m && !r?.error) { notify(m); setAmmo?.(it.item, it.ammo); } });
  }
  // G: drop the gun in hand (not the knife), then hold the next one.
  async function drop() {
    const id = current(), slot = slotOf(id); if (!slot) { notify('You can\u2019t drop the knife'); return; }
    const at = where(), r = await send({ type: 'drop', slot, kind: id, x: at?.x, z: at?.z, y: feet(), yaw: yaw() }); if (r?.error) { notify(r.error); return; } if (slot !== 'nades') setAmmo?.(id, null);
    if (slot === 'nades' && arenaArsenalOf(g(), name()).includes(id)) return;   // another of the same grenade stays in hand
    const own = arenaArsenalOf(g(), name()); equip(own.find(w => w !== id) || own[own.length - 1]);
  }
  // The item you look at (within reach): the one closest to the crosshair, else the nearest at your feet.
  function lookedAt() { const at = where(), d = lookDir(); if (!at) return null; let best = null, bs = .9;
    for (const it of g().combat?.ground || []) { if (!slotOf(it.item) || slotOf(it.item) === 'bomb' && myTeam() !== 't') continue; const dx = it.x - at.x, dy = (it.y || 0) + .4 - at.y, dz = it.z - at.z, L = Math.hypot(dx, dy, dz); if (Math.hypot(dx, dz) > PICK_R + 3) continue; const c = d ? (dx * d.x + dy * d.y + dz * d.z) / L : 0; if (c > bs) { bs = c; best = it; } }
    return best || nearest(PICK_R, it => !!slotOf(it.item) && (slotOf(it.item) !== 'bomb' || myTeam() === 't')); }
  // E: pick up the gun you look at; if that slot is full, the gun you hold there drops first.
  async function use() { const it = lookedAt(); if (!it) return false; await pickUp(it); return true; }
  // "E · AK-47 · 24 / 90" under the crosshair when a pickup is in reach.
  let lookKey = '';
  function lookPrompt() { const it = !isDownNow(name()) && !buyOpen ? lookedAt() : null, w = it && weaponById(it.item), text = w ? 'E · pick up ' + w.name + (it.ammo ? ' · ' + it.ammo[0] + ' / ' + it.ammo[1] : '') + (it.by ? ' · ' + (g().combat?.names?.[key(it.by)] || it.by) : '') : '';
    if (text !== lookKey) { lookKey = text; $('ar-look').textContent = text; $('ar-look').hidden = !text; } }

  // Defuse HUD: T score · clock · CT score, alive tiles (dead dimmed), money, banners, plant / defuse progress.
  let banner = '', bannerUntil = 0, lastPhase = '', lastN = 0;
  const show = (html, cls, ms) => { $('ar-banner').className = cls; $('ar-banner').innerHTML = html; $('ar-banner').hidden = false; bannerUntil = Date.now() + ms; };
  function defuseHud() {
    const d = D(), r = d.round, C = g().combat || {}, now = Date.now(); if (!r) return;
    const clock = r.phase === 'freeze' ? r.freezeUntil - now : r.phase === 'live' ? r.endsAt - now : 0, t = Math.max(0, Math.ceil(clock / 1000));
    const mid = r.phase === 'planted' ? '<span style="color:#ff6060">💣</span>' : r.phase === 'over' ? '<span>—</span>' : `<span>${r.phase === 'freeze' ? '<small>BUY</small> ' : ''}${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</span>`;
    $('ar-top').hidden = false; $('ar-top').innerHTML = `<span class="t"><small>T</small> ${d.score.t}</span>${mid}<span class="ct">${d.score.ct} <small>CT</small></span>`;
    const tiles = team => names().filter(n => d.teams[key(n)] === team).map(n => `<i class="${isDownNow(n) ? 'dead' : ''}" title="${esc(n)}"></i>`).join('');
    $('ar-alive').hidden = false; $('ar-alive').innerHTML = `<div class="t">${tiles('t')}</div><div class="ct">${tiles('ct')}</div>`;
    $('ar-money').hidden = false; $('ar-money').textContent = '$ ' + (d.money?.[me()] ?? 800).toLocaleString('en-US');
    // Banners when something happens.
    if (d.n !== lastN) { lastN = d.n; if (r.phase === 'freeze') show(`ROUND ${d.n}<small>${myTeam() === 'ct' ? 'Counter-Terrorist · defend A and B' : 'Terrorist · plant the bomb on A or B'}${d.bomb?.carrier === me() ? ' · you have the bomb (5)' : ''}</small>`, myTeam() || '', 3500); }
    if (r.phase !== lastPhase) { if (r.phase === 'planted') show('THE BOMB HAS BEEN PLANTED<small>site ' + r.planted.site + '</small>', 'bomb', 3500);
      if (r.phase === 'over') show((r.winner === 't' ? 'TERRORISTS WIN' : 'COUNTER-TERRORISTS WIN') + `<small>${{ elim: 'eliminated', bomb: 'target bombed', defuse: 'bomb defused', time: 'time ran out' }[r.reason]} · ${d.score.t} – ${d.score.ct}</small>`, r.winner, DEFUSE.overMs);
      if (r.phase === 'over' && r.reason === 'bomb' && r.planted) explosion(scene.group, r.planted, 4); lastPhase = r.phase; }
    if (d.matchOver) show(`MATCH OVER · ${d.matchOver.winner === 't' ? 'TERRORISTS' : 'COUNTER-TERRORISTS'} WIN<small>${d.score.t} – ${d.score.ct} · new match soon</small>`, d.matchOver.winner, 2000);
    if (now > bannerUntil) $('ar-banner').hidden = true;
    const act = r.plant?.by === me() ? ['Planting…', (now - r.plant.start) / DEFUSE.plantMs] : r.defuse?.by === me() ? ['Defusing…', (now - r.defuse.start) / r.defuse.ms] : null;
    $('ar-prog').hidden = !act; if (act) { $('ar-prog').firstElementChild.textContent = act[0]; $('ar-prog').lastElementChild.style.width = Math.min(100, act[1] * 100) + '%'; }
    const feed = (C.feed || []).filter(f => now - f.at < 7000), fk = feed.map(f => f.at).join(), col = n => d.teams[key(n)] === 'ct' ? '#8fc4ff' : '#ffc36b';
    if (fk !== feedKey) { feedKey = fk; $('ar-feed').innerHTML = feed.map(f => `<p class="${key(f.by) === me() || key(f.target) === me() ? 'mine' : ''}"><span style="color:${col(f.by)}">${esc(f.by)}</span>${icon(f.wid)}${f.head ? HS : ''}<span style="color:${col(f.target)}">${esc(f.target)}</span></p>`).join(''); }
    $('ar-over').hidden = true; if (boardOpen) scoreboard(true);
  }
  // The planted bomb: its model, a blinking light and beeps that speed up (3D, everyone hears them).
  let bombObj = null, beepAt = 0;
  function bombView(p) {
    if (!p) { if (bombObj) { bombObj.removeFromParent(); bombObj = null; } return; }
    if (!bombObj) { bombObj = weaponModel('c4', 1.4); bombObj.userData.ground = true; bombObj.position.set(p.x, p.y + .2, p.z); scene.group.add(bombObj); }
    const left = (p.explodeAt - Date.now()) / 1000, gap = Math.max(.12, Math.min(1, left / 40)) * 1000;
    if (Date.now() - beepAt > gap) { beepAt = Date.now(); beep({ x: p.x, y: p.y + 1, z: p.z }, left < 10 ? 1.25 : 1); }
  }
  let hudAt = 0, hudPhase = '', lastNear = '';
  return {
    get open() { return buyOpen; }, buy, scoreboard, drop, use,
    get defuse() { return D(); }, get team() { return myTeam(); },
    // Hold to plant (bomb in hand, on a site) / hold E to defuse (CT at the planted bomb); let go to stop.
    plant(hold) { const at = where(); return send({ type: 'plant', hold, x: at?.x, y: at?.y, z: at?.z }).then(r => { if (hold && r?.error) notify(r.error); return r; }); },
    defuseHold(hold) { const at = where(); return send({ type: 'defuse', hold, x: at?.x, y: at?.y, z: at?.z }).then(r => { if (hold && r?.error) notify(r.error); return r; }); },
    nearBomb() { const p = D()?.round?.phase === 'planted' && D().round.planted, at = where(); return !!(p && at && myTeam() === 'ct' && Math.hypot(at.x - p.x, at.z - p.z) < 7); },
    // Throw the grenade in hand (left click); then the next one of that kind, or back to your best gun.
    async throwNade(id, strength = 'long') { const at = where(), a = aim(); if (!at) return; throwSound(); const r = await send({ type: 'throw', kind: id, x: at.x, y: at.y, z: at.z, strength, ...a }); if (r?.error) { notify(r.error); return; }
      const own = arenaArsenalOf(g(), name()); equip(own.includes(id) ? id : own[0]); },
    update() {
      if (!inArena()) { if (entered) leave(); return; }
      const A = g().arena; if (entered !== A.map + ':' + A.startedAt) { enter(); if (entered !== A.map + ':' + A.startedAt) return; }
      // Respawn: the host picks the spawn farthest from enemies.
      // Something outside the arena moved us back to the hall (joining, a menu): return to a spawn point.
      const at = where(); if (at && !scene.inArena(at.z)) { const so = g().combat?.spawnTo?.[me()]; if (so) goSpawn(so); else goTo(spawnIndex()); }
      const s = g().combat?.spawnTo?.[me()]; if (s && s.at !== spawnAt) { spawnAt = s.at; goSpawn(s); const own = arenaArsenalOf(g(), name()); equip(own[0]); notify('Respawned'); }   // back with your primary in hand (CS2)
      drawGround(); if (performance.now() - pickAt > 160) { pickAt = performance.now(); autoPick(); lookPrompt(); if (buyOpen && nearby().map(n => n.it.id).join() !== lastNear) { lastNear = nearby().map(n => n.it.id).join(); buy(true); } }
      bombView(D()?.round?.phase === 'planted' ? D().round.planted : null);
      const ph = D() ? D().n + ':' + D().round?.phase : '';   // round events (planted, round over…) show at once
      if (performance.now() - hudAt > 200 || ph !== hudPhase) { hudAt = performance.now(); hudPhase = ph; hud(); }
    },
  };
}
