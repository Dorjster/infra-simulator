// Arena screens: entering / leaving the arena (map + spawn), the scoreboard (Tab, held), a CS-style kill feed
// (killer · weapon · head-shot mark · victim), the match clock, the buy menu (B, CS2-style categories) and
// bot controls. Reads the shared world (game.arena, game.combat); every change is an arena action to the host.
import { ARENA_MAPS, MAP_LIST, mapOffered, inBuyZone as buyZoneAt } from './arena-maps.js';
import { userMapList } from './user-maps.js';
import { fx as recFx, freezeMusic } from './sound-bank.js';
import { ARENA } from './facility-layout.js';
import { WEAPONS, KNIVES, weaponById, ARMOR, hitDamage, defaultPistol } from './weapons-data.js';
import { userAssets, userAssetURL } from './user-assets.js';
import { arenaArsenalOf } from './combat-logic.js';
import { slotOf, PICK_R, ROUND_BOUND } from './arena-logic.js';
import { weaponModel } from './weapon-models.js';
import { NADES } from './arena-nades.js';
import { throwSound, explosion, beep } from './arena-nades-view.js';
import { PRICE, DEFUSE, DEFAULT_RULES } from './arena-defuse.js';

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
// Pictures of every gun and knife (rendered from the game's models: tools/render-weapon-icons.mjs); drawn ones for the rest.
const ICON_DIR = new URL('./icons/', import.meta.url).href, HAS_PIC = new Set([...WEAPONS.map(w => w.id), ...KNIVES.map(k => k.id)]);
const GEAR_SVG = { he: '<circle cx="32" cy="38" r="17" fill="#3d4a2c"/><rect x="26" y="12" width="12" height="10" rx="2" fill="#777"/><path d="M38 16h10v4H38" stroke="#aaa" stroke-width="3" fill="none"/><path d="M20 32h24M18 40h28M20 48h24" stroke="#2a331e" stroke-width="2"/>', flash: '<rect x="22" y="18" width="20" height="38" rx="4" fill="#9aa3ab"/><rect x="25" y="9" width="14" height="10" fill="#666"/><path d="M39 13h10v4H39" stroke="#aaa" stroke-width="3" fill="none"/><path d="M22 28h20M22 46h20" stroke="#6c757d" stroke-width="3"/>', smoke: '<rect x="20" y="18" width="24" height="38" rx="3" fill="#56606a"/><rect x="25" y="9" width="14" height="10" fill="#666"/><path d="M39 13h10v4H39" stroke="#aaa" stroke-width="3" fill="none"/><rect x="20" y="30" width="24" height="8" fill="#c9cfd4"/>', molotov: '<path d="M27 6h10v14l7 9v27H20V29l7-9z" fill="#6b4a1f" opacity=".9"/><path d="M27 6h10v8H27z" fill="#e8e0c8"/><path d="M30 2c6 2 4 6 2 7-3-1-5-4-2-7z" fill="#ff8a1a"/><rect x="20" y="36" width="24" height="12" fill="#c45a1a" opacity=".7"/>', kevlar: '<path d="M18 12l8-4h12l8 4 4 10-6 4v28H20V26l-6-4z" fill="#4e5a46"/><path d="M26 8c2 6 10 6 12 0" stroke="#2c3428" stroke-width="3" fill="none"/>', helmet: '<path d="M10 40c0-18 10-28 22-28s22 10 22 28z" fill="#4e5a46"/><path d="M6 40h52v5H6z" fill="#3a4434"/><path d="M18 48l4 6M46 48l-4 6" stroke="#222" stroke-width="3"/>', kit: '<rect x="12" y="18" width="40" height="28" rx="4" fill="#3b5f8a"/><rect x="26" y="12" width="12" height="8" rx="2" fill="none" stroke="#9fb4c9" stroke-width="3"/><path d="M32 24v16M24 32h16" stroke="#e8eef2" stroke-width="4"/>' };
const pic = id => HAS_PIC.has(id) ? `<img class="pic" src="${ICON_DIR}w-${id}.png" alt="" draggable="false" loading="lazy">` : GEAR_SVG[id] ? `<svg class="pic gear" viewBox="0 0 64 64">${GEAR_SVG[id]}</svg>` : icon(id);
// Kill-feed marks, in CS2's order around the weapon: blind (before), no-scope, airborne, through smoke, wallbang, head shot.
const MARK = { blind: '<svg viewBox="0 0 20 16" width="20" height="16"><path d="M1 8c3-5 15-5 18 0-3 5-15 5-18 0z" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="10" cy="8" r="2.6" fill="#fff"/><path d="M2 15L18 1" stroke="#fff" stroke-width="1.8"/></svg>', noscope: '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="6" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M8 2v12M2 8h12" stroke="#fff" stroke-width="1"/><path d="M2 14L14 2" stroke="#f55" stroke-width="2"/></svg>', air: '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="9" cy="3" r="2" fill="#fff"/><path d="M8 6l-3 4 3 1-1 4M8 6l3 3 3-1M5 10l-3 1" stroke="#fff" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg>', smoke: '<svg viewBox="0 0 20 16" width="20" height="16"><path d="M4 13a3.5 3.5 0 0 1 0-7 4.5 4.5 0 0 1 8.5-1.5A3.5 3.5 0 0 1 16 13z" fill="#fff"/></svg>', wallbang: '<svg viewBox="0 0 20 16" width="20" height="16"><rect x="8" y="1" width="4" height="14" fill="#fff" opacity=".85"/><path d="M1 8h17M14 5l4 3-4 3" stroke="#fff" stroke-width="1.8" fill="none"/></svg>' };
const wpic = id => HAS_PIC.has(id) ? `<img class="wi" src="${ICON_DIR}w-${id}.png" alt="" draggable="false">` : icon(id);
// One kill-feed line (CS2): killer · [blind] weapon [no-scope] [airborne] [smoke] [wallbang] [head shot] [distance] · victim.
const feedLine = (f, mine, ca = '', cv = '') => { const h = f.how || {}; return `<p class="${mine ? 'mine' : ''}"><span class="a"${ca ? ` style="color:${ca}"` : ''}>${esc(f.by)}</span>${h.blind ? MARK.blind : ''}${wpic(f.wid)}${h.noscope ? MARK.noscope : ''}${h.air ? MARK.air : ''}${h.smoke ? MARK.smoke : ''}${h.wallbang ? MARK.wallbang : ''}${f.head ? HS : ''}${h.far >= 35 ? `<small class="far">${h.far} m</small>` : ''}<span class="v"${cv ? ` style="color:${cv}"` : ''}>${esc(f.target)}</span>${f.assist ? `<small class="as">+ ${esc(f.assist)}</small>` : ''}</p>`; };
const HS = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><circle cx="8" cy="7" r="5"/><rect x="6" y="11" width="4" height="4"/><circle cx="6" cy="7" r="1.2" fill="#000"/><circle cx="10" cy="7" r="1.2" fill="#000"/></svg>';

export function createArenaUI({ voice = () => null, comms = () => null, report = () => null, world, lan, name, notify, scene, send: sendRaw, teleport, holster, equip, onEnter, onLeave, where = () => null, current = () => null, feet = () => 0, yaw = () => 0, ready = () => null, aim = () => ({}), setAmmo = null, onBuyClose = () => {}, lookDir = () => null, invite = () => null }) {
  // Round-bound requests (buys, plant, defuse) carry the round they were made in (the host refuses stale ones).
  const send = a => { const id = world.operations.game.combat?.d?.round?.id; return sendRaw(id && ROUND_BOUND.has(a.type) ? { ...a, round: id } : a); };
  const g = () => world.operations.game, me = () => key(name());
  const css = document.createElement('style'); css.textContent = `
#ar-top{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:37;display:flex;gap:10px;align-items:center;font:800 18px ui-monospace,Menlo,monospace;color:#fff;text-shadow:0 2px 4px #000}#ar-top[hidden]{display:none}#ar-top span{background:#000a;border-radius:6px;padding:4px 12px}#ar-top small{font:600 11px system-ui;opacity:.75;letter-spacing:.1em}
body:has(#ar-top:not([hidden])) #game-notifications{top:auto;right:auto;left:22px;bottom:186px;width:min(300px,40vw)}
#ar-feed{position:fixed;top:100px;right:16px;z-index:37;display:flex;flex-direction:column;gap:4px;align-items:flex-end;pointer-events:none}#ar-feed p{margin:0;display:flex;gap:8px;align-items:center;background:#000b;border:1px solid #ffffff22;border-radius:4px;padding:3px 10px;color:#fff;font:700 13px system-ui}#ar-feed p.mine{border-color:#e33;box-shadow:inset 0 0 0 1px #e33}#ar-feed .a{color:#ffd36b}#ar-feed .wi{height:20px;max-width:64px;object-fit:contain;filter:brightness(0) invert(1) drop-shadow(0 0 1px #000)}#ar-feed svg{flex:none}#ar-feed .far{font:700 11px ui-monospace,Menlo,monospace;color:#cfd8de}#ar-feed .as{font-size:11px;color:#b9c7cf}#ar-feed .v{color:#9fd8ff}
#ar-board{position:fixed;inset:0;z-index:43;display:grid;place-items:center;pointer-events:none}#ar-board[hidden]{display:none}#ar-board>div{pointer-events:auto;min-width:560px;background:#0b1118ee;border:1px solid #3d5566;border-radius:10px;color:#e8eef2;font:600 14px system-ui;padding:14px 18px}#ar-board table{width:100%;border-collapse:collapse}#ar-board th{text-align:left;font-size:11px;letter-spacing:.12em;color:#8aa2b0;padding:4px 6px}#ar-board td{padding:5px 6px;border-top:1px solid #ffffff12}#ar-board tr.dead td{opacity:.38}#ar-board tr.me td{color:#ffd36b}#ar-board .tools{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}#ar-board button,#ar-buy button{background:#16222c;color:#e8eef2;border:1px solid #3d5566;border-radius:6px;padding:6px 12px;cursor:pointer;font:600 13px system-ui}#ar-board button:hover,#ar-buy button:hover{border-color:#ffd36b}
#ar-buy{position:fixed;inset:0;z-index:44;background:linear-gradient(90deg,#05070ae8 0%,#05070ad4 60%,#05070a55 100%);color:#d9dde1;font-family:'Stratum2','Stratum2 Web','Arial Narrow','Helvetica Neue',system-ui,sans-serif}#ar-buy[hidden]{display:none}#ar-buy>div{position:absolute;left:max(16px,5vw);top:7vh;bottom:5vh;width:min(1120px,74vw);display:flex;flex-direction:column}@media (max-width:900px){#ar-buy>div{width:calc(100vw - 32px)}}
#ar-buy .bt{align-self:center;margin:0 0 10px;font-weight:600;font-size:15px;letter-spacing:.05em;color:#bfc6cc}#ar-buy .bt b{margin-left:8px;color:#fff;font-variant-numeric:tabular-nums}#ar-buy .bt.free b{color:#8ff59a}
#ar-buy .panel{display:grid;grid-template-columns:1fr 1fr 2fr 1fr 1fr;gap:10px;padding:14px 16px 12px;background:#0b0e11e0;border:1px solid #ffffff14;overflow:auto}@media (max-width:900px){#ar-buy .panel{grid-template-columns:1fr 1fr}}
#ar-buy .col h3{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-weight:600;font-size:14px;color:#e6e9ec;letter-spacing:.02em}#ar-buy .col h3 i{display:inline-grid;place-items:center;width:18px;height:18px;border:1px solid #ffffff55;font-style:normal;font-size:11px;color:#cfd4d8}#ar-buy .col.sel h3 i{background:#e7c15d;border-color:#e7c15d;color:#111}
#ar-buy .cards{display:grid;grid-template-rows:repeat(5,76px);gap:6px}#ar-buy .col.wide .cards{grid-template-columns:1fr 1fr;grid-auto-flow:column}#ar-buy .card{position:relative}
#ar-buy .item{position:relative;display:block;width:100%;height:76px;padding:0;border:1px solid #ffffff12;background:linear-gradient(180deg,#1c2025,#14171b);color:inherit;font:inherit;text-align:left;cursor:pointer}#ar-buy .item:hover:not(:disabled),#ar-buy .item:focus-visible{background:linear-gradient(180deg,#2b3036,#1e2227);border-color:#ffffff45;outline:none}
#ar-buy .item .k{position:absolute;left:5px;top:3px;font-style:normal;font-size:10px;font-weight:600;color:#9aa3aa}#ar-buy .item .nm{position:absolute;right:6px;top:3px;max-width:78%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:10px;font-weight:600;color:#b4bbc1}
#ar-buy .item .ic{position:absolute;left:12%;right:12%;top:19px;bottom:17px;background:#e7c15d;-webkit-mask:var(--m) center/contain no-repeat;mask:var(--m) center/contain no-repeat}#ar-buy .item .pic{position:absolute;left:50%;top:50%;transform:translate(-50%,-46%);max-width:78%;max-height:40px;object-fit:contain}#ar-buy .item svg.pic{width:40px;height:40px}
#ar-buy .item em{position:absolute;right:6px;bottom:3px;font-style:normal;font-size:11px;font-weight:600;color:#a7afb5}#ar-buy .item s{position:absolute;left:6px;bottom:3px;font-size:10px;color:#6c757c}
#ar-buy .card.on .item{border-color:#e7c15daa;background:linear-gradient(180deg,#2d2816,#1d1a0f)}#ar-buy .card.off .item{cursor:default}#ar-buy .card.off .item .ic{background:#585e64}#ar-buy .card.off .item .pic{opacity:.35}#ar-buy .card.off .item em{color:#9a5852}
#ar-buy .sell{position:absolute;right:4px;bottom:17px;z-index:1;padding:1px 6px;border:1px solid #ff8a5a;background:#3a1810;color:#ffd0bc;font:600 10px 'Stratum2','Stratum2 Web','Arial Narrow','Helvetica Neue',system-ui,sans-serif;cursor:pointer}
#ar-buy .info{min-height:40px;margin-top:10px;padding:8px 12px;background:#0b0e11c8;border:1px solid #ffffff10;font-size:13px;color:#c7cdd2}#ar-buy .info b{color:#fff;font-size:14px;margin-right:10px}#ar-buy .info span{margin-right:14px;color:#9aa3aa}#ar-buy .info span i{font-style:normal;color:#e6e9ec}
#ar-buy .bottom{margin-top:auto;display:flex;align-items:flex-end;gap:18px;padding-top:10px}#ar-buy .cash{font-weight:700;font-size:34px;color:#8ff59a;text-shadow:0 2px 4px #000;font-variant-numeric:tabular-nums}#ar-buy .keys{display:flex;flex-wrap:wrap;gap:16px;margin-left:auto;font-weight:600;font-size:12px;letter-spacing:.06em;color:#c3c9ce}
#ar-buy .keys button{padding:0;border:0;background:none;color:inherit;font:inherit;letter-spacing:inherit;cursor:pointer}#ar-buy .keys button:disabled{opacity:.35;cursor:default}#ar-buy .keys kbd{margin-right:6px;padding:1px 5px;border:1px solid #ffffff55;font:inherit}
#ar-load{position:fixed;inset:0;z-index:60;display:grid;place-content:center;gap:8px;text-align:center;background:#0b1118;color:#fff;font:900 34px system-ui;letter-spacing:.18em}#ar-load[hidden]{display:none}#ar-load small{font:600 14px system-ui;letter-spacing:.1em;opacity:.7}
#ar-top .t{color:#ffc36b}#ar-top .ct{color:#8fc4ff}#ar-alive{position:fixed;top:48px;left:50%;transform:translateX(-50%);z-index:37;display:flex;gap:22px;pointer-events:none}#ar-alive[hidden]{display:none}#ar-alive div{display:flex;gap:3px}#ar-alive i{display:block;width:26px;height:8px;border-radius:2px}#ar-alive .t i{background:#e8a53f}#ar-alive .ct i{background:#5b9be8}#ar-alive i.dead{opacity:.22}
#ar-money{position:fixed;left:22px;bottom:142px;z-index:36;color:#7dff8e;font:800 22px ui-monospace,Menlo,monospace;text-shadow:0 2px 3px #000}#ar-money[hidden]{display:none}
#ar-banner{position:fixed;top:22%;left:50%;transform:translateX(-50%);z-index:42;padding:10px 26px;border-radius:8px;background:#000b;color:#fff;font:900 26px system-ui;letter-spacing:.08em;text-align:center;pointer-events:none}#ar-banner[hidden]{display:none}#ar-banner.t{border:2px solid #e8a53f}#ar-banner.ct{border:2px solid #5b9be8}#ar-banner.bomb{top:16%;padding:4px 18px;background:none;border:0;color:#fff;font-weight:600;font-size:22px;letter-spacing:.02em;text-shadow:0 1px 3px #000,0 0 8px #000a}#ar-banner small{display:block;font:600 14px system-ui;letter-spacing:.04em;opacity:.85;margin-top:4px}
#ar-prog{position:fixed;left:50%;top:58%;transform:translateX(-50%);z-index:41;width:260px;background:#000b;border-radius:6px;padding:6px 10px;color:#fff;font:700 13px system-ui;text-align:center;pointer-events:none}#ar-prog[hidden]{display:none}#ar-prog b{display:block;height:6px;background:#ffd36b;border-radius:3px;margin-top:5px}
#ar-board>div{width:min(1040px,96vw);max-height:88vh;overflow:auto}#ar-board .vc{display:inline-block;margin-left:5px;font-size:12px;opacity:0;transition:opacity .08s}#ar-board .vc.on{opacity:1;filter:drop-shadow(0 0 4px #7dff8e)}#ar-board .top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px}#ar-board .top small{color:#8aa2b0}#ar-board .cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media (max-width:820px){#ar-board .cols{grid-template-columns:1fr}}#ar-board .th{display:flex;align-items:baseline;gap:8px;padding:6px 8px;border-radius:6px 6px 0 0}#ar-board .t .th{background:#4a3410;color:#ffc36b}#ar-board .ct .th{background:#123050;color:#8fc4ff}#ar-board .th b{margin-left:auto;font:900 26px ui-monospace,Menlo,monospace}#ar-board .th small{opacity:.8}#ar-board td.n,#ar-board th.n{text-align:right;font-variant-numeric:tabular-nums}#ar-board tr.me td{color:#ffd36b;font-weight:800;background:#ffd36b14}#ar-board .join,#ar-lobby .join{margin-top:8px;padding:6px 10px;border:1px solid #3fb5c9;border-radius:6px;color:#bfeef7;font:600 12px system-ui}#ar-board .spec{margin-top:6px;color:#8aa2b0;font-size:12px}
#ar-team{position:fixed;inset:0;z-index:45;display:grid;place-items:center;background:#0008}#ar-team[hidden]{display:none}#ar-team>div{width:min(640px,94vw);background:#0b1118f4;border:1px solid #3d5566;border-radius:12px;color:#e8eef2;font:600 14px system-ui;padding:16px 20px}#ar-team h2{margin:0 0 10px;font:800 20px system-ui}#ar-team h3{margin:14px 0 6px;font:700 12px system-ui;letter-spacing:.14em;color:#8aa2b0}#ar-team .teams{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}#ar-team button{background:#16222c;color:#e8eef2;border:1px solid #3d5566;border-radius:8px;padding:8px 12px;cursor:pointer;font:600 13px system-ui}#ar-team button:hover{border-color:#ffd36b}#ar-team .teams button{display:flex;flex-direction:column;gap:2px;padding:12px}#ar-team .teams .t{border-color:#e8a53f}#ar-team .teams .ct{border-color:#5b9be8}#ar-team .on{background:#2a2410;border-color:#ffd36b!important}#ar-team .note{color:#8aa2b0;font-size:12px;margin:8px 0 0}#ar-team .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}#ar-team select{background:#101a22;color:#e8eef2;border:1px solid #3d5566;border-radius:6px;padding:4px}#ar-team .primary{background:#1f5130;border-color:#7fe3a0}
#ar-lobby{position:fixed;left:16px;top:50%;transform:translateY(-50%);z-index:38;width:min(300px,40vw);background:#0b1118e6;border:1px solid #3fb5c9;border-radius:10px;padding:10px 12px;color:#e8eef2;font:600 13px system-ui;pointer-events:none}#ar-lobby[hidden]{display:none}#ar-lobby .clock{font:800 22px ui-monospace,Menlo,monospace;margin:4px 0;color:#7fe3f2}#ar-lobby .warn{color:#ffb070;font-size:12px;margin:4px 0}#ar-lobby ul{list-style:none;margin:6px 0;padding:0}#ar-lobby li{display:flex;justify-content:space-between;gap:6px;padding:3px 0;border-top:1px solid #ffffff12}#ar-lobby li.t span{color:#ffc36b}#ar-lobby li.ct span{color:#8fc4ff}#ar-lobby small{color:#8aa2b0}
#ar-look{position:fixed;left:50%;top:calc(50% + 46px);transform:translateX(-50%);z-index:38;background:#000a;border-radius:6px;padding:4px 12px;color:#fff;font:700 13px system-ui;pointer-events:none}#ar-look[hidden]{display:none}
#ar-over{position:fixed;top:30%;left:50%;transform:translateX(-50%);z-index:42;background:#000c;border:2px solid #ffd36b;border-radius:10px;padding:16px 30px;color:#fff;font:800 26px system-ui;text-align:center}#ar-over[hidden]{display:none}#ar-over small{display:block;font:600 14px system-ui;margin-top:6px;opacity:.8}`;
  (document.head || document.body).append?.(css);
  document.body.insertAdjacentHTML('beforeend', '<div id="ar-top" hidden></div><div id="ar-alive" hidden></div><div id="ar-money" hidden></div><div id="ar-banner" hidden></div><div id="ar-paused" hidden style="position:fixed;top:14%;left:50%;transform:translateX(-50%);z-index:42;padding:8px 22px;border-radius:8px;background:#000c;border:1px solid #ffd36b;color:#ffd36b;font:900 22px system-ui;letter-spacing:.12em;pointer-events:none">⏸ PAUSED BY HOST</div><div id="ar-prog" hidden><span></span><b></b></div><div id="ar-feed"></div><div id="ar-board" hidden><div></div></div><div id="ar-buy" hidden><div></div></div><div id="ar-over" hidden></div><div id="ar-look" hidden></div><div id="ar-team" hidden><div></div></div><div id="ar-lobby" hidden></div><div id="ar-load" hidden><b>GLOBAL DEFENSIVE</b><small>Loading…</small></div>');
  const $ = id => document.getElementById(id);
  // Campaign objective + hotbar hidden in the arena — set on those two elements only (a class on <body> would
  // restyle the whole page: a 50 ms frame on entering).
  const campaignHud = show => { for (const id of ['eng-objective', 'inventory', 'game-bar', 'lan-invite']) { const el = $(id); if (!el) continue; if (show) el.style.removeProperty('display'); else el.style.setProperty('display', 'none', 'important'); } };
  let entered = null, spawnAt = null, buyOpen = false, boardOpen = false, feedKey = '', deathAt = Date.now();
  // A kill just reported: the victim's death cry where they fell (3D; once per kill).
  const deathSounds = feed => { for (const f of feed) { if (f.at <= deathAt) continue; const p = (lan.players || []).find(x => key(x.name) === key(f.target))?.pose; recFx('death', { at: p && key(f.target) !== me() ? { x: p.x, y: p.y - 3, z: p.z } : null, volume: .7, rate: .92 + Math.random() * .16, kind: 'effect' }); } deathAt = Math.max(deathAt, ...feed.map(f => f.at)); };
  const inArena = () => g().mode === 'arena' && !!g().arena;
  const names = () => { const A = g().arena, C = g().combat || {}, list = new Map(); for (const p of lan.players || []) if (p.pose?.z < -200 || p.bot) list.set(key(p.name), p.name); list.set(me(), name()); for (const b of A?.bots || []) list.set(key(b.name), b.name); for (const k of Object.keys(C.kills || {})) if (!list.has(k)) list.set(k, C.names?.[k] || k); return [...list.values()]; };
  const isDownNow = n => (g().combat?.down?.[key(n)]?.until || 0) > Date.now();
  const D = () => g().combat?.d || null, myTeam = () => D()?.teams?.[me()] || null;
  function spawnIndex() { const so = g().combat?.spawnTo?.[me()]; if (D()) return so ? so.i : myTeam() === 'ct' ? ARENA_MAPS[g().arena.map].t.length : 0; const players = (lan.players || []).filter(p => !p.bot); const i = players.findIndex(p => p.id === lan.selfID); return i >= 0 ? i * 3 + 1 : Math.floor(Math.random() * 8); }
  // Spawn, facing the middle of the map (camera looks along (−sin yaw, −cos yaw)).
  function goTo(i) { const s = scene.spawnFor(i); if (!s) return; teleport(s.x, s.z, Math.atan2(-(ARENA.cx - s.x), -(ARENA.cz - s.z)), s.y); }
  // A spawn order from the host: exact spot (x, z) when given, else the map spawn index.
  function goSpawn(so) { if (Number.isFinite(so?.x)) teleport(so.x, so.z, Math.atan2(-(ARENA.cx - so.x), -(ARENA.cz - so.z)), so.y); else goTo(so?.i ?? spawnIndex()); }
  // Entering waits for the arena warm-up (shaders, textures) behind a short loading screen instead of a frozen frame.
  let loading = false;
  // The card goes once the GPU has caught up — frames smooth several in a row (2.5 s at most) — so the uploads and first
  // draws queued behind it never show as a hitch (it used to go after 4 frames: a 100–150 ms frame right after).
  let revealing = 0;
  function revealWhenSmooth() { const id = ++revealing; let smooth = 0, frames = 0, minD = Infinity, last = performance.now(); const t0 = last;
    const step = now => { if (id !== revealing) return; const d = now - last; last = now; frames++; if (frames > 1) minD = Math.min(minD, d); smooth = frames > 1 && d < Math.max(24, minD * 1.5) ? smooth + 1 : 0;
      if (!loading && frames >= 4 && (smooth >= 6 || now - t0 > 2500)) $('ar-load').hidden = true; else requestAnimationFrame(step); };
    requestAnimationFrame(step); }
  function enter() { const r = ready(); if (r && !r.done) { if (!loading) { loading = true; performance.mark?.('arena:loading'); $('ar-load').hidden = false; r.catch(() => {}).finally(() => { loading = false; revealWhenSmooth(); }); } return; } enterNow(); }
  function enterNow() { performance.mark?.('arena:enter'); const A = g().arena;
    // The map's first frames (GPU uploads, first shadow pass) are drawn behind the loading card; play starts warm.
    $('ar-load').hidden = false; revealWhenSmooth(); campaignHud(false); spawnAt = g().combat?.spawnTo?.[me()]?.at ?? null; scene.show(A.map); entered = A.map + ':' + A.startedAt; onEnter(); holster(); { const so = g().combat?.spawnTo?.[me()]; if (so) goSpawn(so); else goTo(spawnIndex()); } const own = arenaArsenalOf(g(), name()); equip(own.find(id => ['pistol', 'deagle', 'cannon'].includes(id)) || own[0]); if (!D() && !g().arena.loadout?.[me()]?.primary) setTimeout(() => buy(true), 400); notify('Global Defensive · ' + ARENA_MAPS[A.map].name + (D() ? ' · defuse · you are ' + (myTeam() === 'ct' ? 'Counter-Terrorist' : 'Terrorist') + ' · B buy (in spawn, first 35 s)' : ' · deathmatch · B buy menu') + ' · Tab scores'); }
  function leave() { freezeMusic(false); for (const id of ['ar-paused', 'ar-alive', 'ar-money', 'ar-banner', 'ar-prog', 'ar-lobby', 'ar-team', 'ar-look']) $(id).hidden = true; teamOpen = false; bombView(null); for (const m of groundMeshes.values()) m.removeFromParent(); groundMeshes.clear(); groundKey = -1; entered = null; campaignHud(true); scene.hide(); buy(false); scoreboard(false); $('ar-top').hidden = true; $('ar-feed').innerHTML = ''; $('ar-over').hidden = true; onLeave(); }
  // Buy menu (B opens and closes it, Escape closes it). Guns by category with an info card; equipment (armor, kit);
  // grenades; and, apart from the shop, the guns lying near you (free to pick up, E or click).
  const CATS2 = [['Pistols', w => w.kind === 'pistol'], ['SMGs', w => w.kind === 'smg'], ['Heavy', w => w.kind === 'shotgun' || w.kind === 'lmg'], ['Rifles', w => w.kind === 'rifle'], ['Snipers', w => w.kind === 'sniper']];
  // Damage the host would deal (weapons-data.js hitDamage), at `m` metres; armor: a full vest.
  const dmgAt = (w, m, armor = false) => hitDamage(w, 'chest', m * 6.06, w.pellets || 1, armor ? { kevlar: 100, helmet: true } : null).hp;
  const effRange = w => { const full = hitDamage(w, 'chest', 0, w.pellets || 1).hp; for (let m = 5; m <= 200; m += 5) if (hitDamage(w, 'chest', m * 6.06, w.pellets || 1).hp < full * .8) return 'up to ~' + m + ' m'; return 'the whole map'; };
  const MODE = { auto: 'Automatic', semi: 'Semi-automatic', pump: 'Pump-action', bolt: 'Bolt-action' };
  // The hovered gun in one line under the cards (as CS2 shows its stats): price, kill award, magazine, damage, armor, fire.
  const info = w => `<b>${esc(w.name)}</b><span>Price <i>$${w.price.toLocaleString('en-US')}</i></span><span>Kill award <i>$${(w.reward ?? 300).toLocaleString('en-US')}</i></span><span>Magazine <i>${w.mag} / ${w.reserve}</i></span><span>Damage <i>${dmgAt(w, 3)}${w.pellets ? ' (all pellets)' : ''} · ${dmgAt(w, 3, true)} on armor</i></span><span>Armor penetration <i>${Math.round(w.ap * 100)} %</i></span><span>Fire <i>${MODE[w.mode]} · ${Math.round(60000 / w.rateMs)} rpm${w.zoom ? ' · scope' : ''}${w.suppressed ? ' · suppressed' : ''}</i></span><span>Effective <i>${effRange(w)}</i></span>`;
  function nearby() { const at = where(); if (!at) return []; return (g().combat?.ground || []).filter(it => slotOf(it.item) && slotOf(it.item) !== 'bomb' && Math.hypot(it.x - at.x, it.z - at.z) <= PICK_R + 3).map(it => ({ it, d: Math.hypot(it.x - at.x, it.z - at.z) })).sort((a, b) => a.d - b.d); }
  async function pickUp(it) { const r = await send({ type: 'pickup', id: it.id, swap: true }); if (r?.error) { notify(r.error); return false; } notify(typeof r === 'string' ? r : r?.message || 'Picked up'); setAmmo?.(it.item, it.ammo); equip(it.item); return true; }
  let infoId = null;
  // CS2's buy menu: five columns — Equipment · Pistols · Mid-Tier (SMGs, shotguns, machine guns: two cards a row) ·
  // Rifles · Grenades — a numbered card per item with its picture (CS2's own icons when the room has them: user-assets/
  // icons, models.icons — Valve's, never shipped; else dist/icons, rendered from the game's models), its name and price.
  // Items bought this round carry a sell-back badge (click it or right-click the card; Backspace undoes the last
  // purchase) while buy time lasts. Keys: 1–5 pick a column, then 1–9 buy in it; R rebuys, F full buy. In a Defuse match
  // B opens it only in buy time and in your spawn (as CS2), and it closes when buy time runs out.
  const ofKind = (...k) => WEAPONS.filter(w => k.includes(w.kind)).map(w => w.id);
  const COLS = [['Equipment', ['kevlar', 'helmet', 'kit']], ['Pistols', ofKind('pistol')], ['Mid-Tier', ofKind('smg', 'shotgun', 'lmg')], ['Rifles', ofKind('rifle', 'sniper')], ['Grenades', ['flash', 'smoke', 'he', 'molotov']]];
  let cs2Icons = null; userAssets().then(ua => { const I = ua.models?.icons; if (I && Object.keys(I).length) cs2Icons = Object.fromEntries(Object.entries(I).map(([id, v]) => [id, userAssetURL(ua, v.file)])); }).catch(() => {});
  const art = id => cs2Icons?.[id] ? `<i class="ic" style="--m:url('${cs2Icons[id]}')"></i>` : pic(id);
  let col = -1;
  const refundable = () => { const d = D(); return d ? (d.bought?.[me()] || []) : []; };
  async function refund(item) { const r = await send({ type: 'refund', ...(item ? { item } : {}) }); if (r?.error) notify(r.error); else { notify(typeof r === 'string' ? r : r?.message || 'Refunded'); const l = g().arena.loadout?.[me()] || {}; if (item && weaponById(item)?.mag) equip(l.primary || l.secondary || 'knife'); } if (buyOpen) buy(true); }
  // Quick buys: Rebuy (what you bought in the last round you bought anything, sells taken back) and Full buy (Kevlar +
  // Helmet, your side's rifle, a kit on CT, smoke and flash). Each item goes through the normal buy actions one by one,
  // so the host checks money, buy time and the buy zone exactly as for a click; owned or unaffordable items are skipped.
  // A round is known by when it started (a restarted round or a new match starts again at round 1).
  let buyLog = { at: -1, len: -1, items: [] }, prevBuy = [], quickBusy = false;
  function trackBuys() { const d = D(), at = d?.round?.at; if (!d || at === undefined) return; const b = d.bought?.[me()] || [];
    if (at !== buyLog.at) { if (buyLog.items.length) prevBuy = buyLog.items; buyLog = { at, len: -1, items: [] }; }
    if (b.length !== buyLog.len) { buyLog.len = b.length; buyLog.items = b.map(x => x.item); } }
  const fullBuy = () => myTeam() === 'ct' ? ['helmet', 'm4', 'kit', 'smoke', 'flash'] : ['helmet', 'ak', 'smoke', 'flash'];
  // Already have it? Grenades: as many as the list asked for so far (rebuying a smoke you kept buys nothing).
  function owns(id, want) { const l = g().arena.loadout?.[me()] || {}, arm = g().combat?.armor?.[me()] || {}, d = D();
    return id === 'kit' ? !!d?.kits?.[me()] : id === 'kevlar' ? arm.kevlar >= 100 : id === 'helmet' ? arm.kevlar >= 100 && !!arm.helmet : NADES[id] ? (l.nades || []).filter(x => x === id).length >= want : l.primary === id || l.secondary === id; }
  async function quickBuy(list, label) { if (quickBusy || !D()) return; if (!list.length) { notify('Nothing to rebuy yet'); return; } quickBusy = true; const got = [], miss = [];
    const want = {}; try { for (const id of list) { want[id] = (want[id] || 0) + 1; if (owns(id, want[id])) continue; const w = weaponById(id), at = where();
        const r = await send(NADES[id] ? { type: 'buy-nade', kind: id } : id === 'kevlar' || id === 'helmet' ? { type: 'buy-armor', kind: id } : id === 'kit' ? { type: 'buy-kit' } : w?.kind === 'pistol' ? { type: 'loadout', secondary: id, x: at?.x, y: at?.y, z: at?.z } : { type: 'loadout', primary: id, x: at?.x, y: at?.y, z: at?.z });
        if (r?.error) { miss.push(r.error); if (/buy time|spawn/i.test(r.error)) break; continue; } got.push(id); if (w?.mag) { setAmmo?.(id, null); equip(id); } } }
    finally { quickBusy = false; }
    notify(label + ': ' + (got.length ? got.map(id => weaponById(id)?.name || NADES[id]?.name || { kevlar: 'Kevlar', helmet: 'Kevlar + Helmet', kit: 'Defuse Kit' }[id] || id).join(', ') : 'nothing bought') + (miss.length ? ' · ' + miss[miss.length - 1] : '')); if (buyOpen) buy(true); }
  addEventListener('keydown', e => { if (!buyOpen || e.repeat || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) return;
    if (e.code === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); refund(); return; }
    if (['KeyR', 'KeyF', 'F3', 'F4'].includes(e.code) && D()) { e.preventDefault(); e.stopImmediatePropagation(); if (e.code === 'KeyR' || e.code === 'F4') quickBuy(prevBuy, 'Rebuy'); else quickBuy(fullBuy(), 'Full buy'); return; }   // (CS2: F4 rebuys, F3 auto-buys)
    const n = /^Digit([1-9])$/.exec(e.code)?.[1]; if (!n) return; e.preventDefault(); e.stopImmediatePropagation();
    if (col < 0) { col = Math.min(COLS.length - 1, +n - 1); buy(true); return; } const cards = [...$('ar-buy').querySelectorAll(`.col[data-col="${col}"] [data-pick]`)], c = cards[+n - 1]; col = -1; if (c && !c.disabled) c.click(); else buy(true); }, true);
  // Why you can't buy now (Defuse), or null: buy time over, or out of your spawn.
  const buyBlock = () => { const d = D(), r = d?.round; return !d ? null : !r || r.phase === 'over' || (r.phase !== 'freeze' && Date.now() > r.buyUntil) ? 'The buy time has expired' : !inBuyZone() ? 'You can only buy in your spawn' : null; };
  let buyTick = 0;
  function buy(open = !buyOpen) {
    if (open && !buyOpen && inArena() && buyBlock()) { notify(buyBlock()); return; }   // (CS2: B does nothing after buy time / outside the buy zone)
    const was = buyOpen; buyOpen = !!open && inArena(); $('ar-buy').hidden = !buyOpen;
    if (!buyOpen) { col = -1; clearInterval(buyTick); buyTick = 0; if (was) onBuyClose(); return; } document.exitPointerLock?.();
    // Open: the clock counts down; when buy time runs out (or you walk out of your spawn) the menu closes.
    if (!buyTick) buyTick = setInterval(() => { if (!buyOpen) return; if (buyBlock()) { buy(false); return; } const r = D()?.round, el = $('ar-buy').querySelector('.bt b'); if (r && el) el.textContent = clock(r.buyUntil - Date.now()); }, 250);
    const team = myTeam(), l = { secondary: D() && (team === 't' || team === 'ct') ? defaultPistol(team) : undefined, ...(g().arena.loadout?.[me()] || {}) };
    const d = D(), money = d ? (d.money?.[me()] ?? 800) : 0, r = d?.round, buyErr = buyBlock(), arm = g().combat?.armor?.[me()] || { kevlar: 0, helmet: false };
    const sells = buyErr ? [] : refundable(), sellOf = id => sells.findLast(b => b.item === id);
    // A card: number, name, picture, price; owned ones lit, ones you can't buy dimmed (why: on hover).
    const card = (k, id, label, price, on, why) => { const s = sellOf(id); return `<div class="card${on ? ' on' : ''}${why ? ' off' : ''}"><button class="item" data-pick="${id}" ${why ? `disabled title="${esc(why)}"` : ''}><i class="k">${k}</i><span class="nm">${esc(label)}</span>${art(id)}${d ? `<em>$${price.toLocaleString('en-US')}</em>` : `<s>$${price.toLocaleString('en-US')}</s><em>Free</em>`}</button>${s ? `<button class="sell" data-sell="${id}" title="Sell back for $${s.price} (right-click the card · Backspace undoes the last)">↺ $${s.price}</button>` : ''}</div>`; };
    const poor = p => d && p > money ? 'Not enough money' : '';
    const item = (id, k) => {
      if (id === 'kevlar') return card(k, id, 'Kevlar Vest', ARMOR.kevlar.price, arm.kevlar >= 100, buyErr || (arm.kevlar >= 100 ? 'Full' : poor(ARMOR.kevlar.price)));
      if (id === 'helmet') { const p = arm.kevlar >= 100 ? ARMOR.helmet.upgrade : ARMOR.helmet.price; return card(k, id, 'Kevlar + Helmet', p, arm.kevlar >= 100 && arm.helmet, buyErr || (arm.kevlar >= 100 && arm.helmet ? 'Full' : poor(p))); }
      if (id === 'kit') return card(k, id, 'Defuse Kit', PRICE.kit, !!d?.kits?.[me()], buyErr || (d?.kits?.[me()] ? 'Owned' : poor(PRICE.kit)));
      if (NADES[id]) { const n = (l.nades || []).filter(x => x === id).length; return card(k, id, NADES[id].name + (n > 1 ? ' ×' + n : ''), PRICE[id], n > 0, buyErr || poor(PRICE[id])); }
      const w = weaponById(id); return card(k, id, w.name, w.price, l.primary === id || l.secondary === id, buyErr || poor(PRICE[id] ?? w.price)); };
    // Each column: what your side can buy (Deathmatch: everything; the kit: Counter-Terrorists in Defuse).
    const mineToo = id => id === 'kit' ? !!d && team === 'ct' : !d || !team || !weaponById(id)?.team || weaponById(id).team === team;
    const cols = COLS.map(([title, ids], i) => `<div class="col${col === i ? ' sel' : ''}${ids.filter(mineToo).length > 5 ? ' wide' : ''}" data-col="${i}"><h3><i>${i + 1}</i>${title}</h3><div class="cards">${ids.filter(mineToo).map((id, j) => item(id, j + 1)).join('')}</div></div>`).join('');
    const widths = COLS.map(([, ids]) => ids.filter(mineToo).length > 5 ? '2fr' : '1fr').join(' ');   // (a column of more than five: two cards a row — Mid-Tier; in Deathmatch every gun, so Pistols and Rifles too)
    const w0 = weaponById(infoId) || weaponById(l.primary) || weaponById(l.secondary) || WEAPONS[0];
    $('ar-buy').firstElementChild.innerHTML = `<div class="bt${d ? '' : ' free'}">${d ? `Buy Time Remaining<b>${clock(r.buyUntil - Date.now())}</b>` : 'Deathmatch<b>everything is free</b>'}</div>
      <div class="panel" style="grid-template-columns:${widths}">${cols}</div><div class="info">${info(w0)}</div>
      <div class="bottom"><div class="cash">${d ? '$' + money.toLocaleString('en-US') : 'FREE'}</div><div class="keys">${d ? `<button data-act="undo" ${sells.length ? '' : 'disabled'}><kbd>⌫</kbd>UNDO</button><button data-act="rebuy" ${buyErr || !prevBuy.length ? 'disabled' : ''} title="${esc(prevBuy.map(id => weaponById(id)?.name || NADES[id]?.name || id).join(', ') || 'Nothing bought in an earlier round yet')}"><kbd>F4</kbd>RE-BUY PREVIOUS</button><button data-act="full" ${buyErr ? 'disabled' : ''} title="${esc(fullBuy().map(id => weaponById(id)?.name || NADES[id]?.name || { helmet: 'Kevlar + Helmet', kit: 'Defuse Kit' }[id]).join(', '))}"><kbd>F3</kbd>AUTO BUY</button>` : ''}<button data-act="close"><kbd>ESC</kbd>BACK</button></div></div>`;
    const root = $('ar-buy');
    root.querySelectorAll('[data-pick]').forEach(b => { const id = b.dataset.pick; if (weaponById(id)?.mag) { b.onmouseenter = b.onfocus = () => { infoId = id; root.querySelector('.info').innerHTML = info(weaponById(id)); }; }
      b.onclick = async () => { b.blur(); const pistol = weaponById(id)?.kind === 'pistol', at = where(); const r = await send(id === 'kit' ? { type: 'buy-kit' } : NADES[id] ? { type: 'buy-nade', kind: id } : id === 'kevlar' || id === 'helmet' ? { type: 'buy-armor', kind: id } : pistol ? { type: 'loadout', secondary: id, x: at?.x, y: at?.y, z: at?.z } : { type: 'loadout', primary: id, x: at?.x, y: at?.y, z: at?.z });
        if (r?.error) { notify(r.error); buy(true); return; } notify(typeof r === 'string' ? r : r?.message || 'Bought'); if (weaponById(id)?.mag) { setAmmo?.(id, null); equip(id); } buy(true); }; });
    root.querySelectorAll('.card').forEach(c => c.oncontextmenu = e => { e.preventDefault(); const s = c.querySelector('[data-sell]'); if (s) refund(s.dataset.sell); });
    root.querySelectorAll('[data-sell]').forEach(b => b.onclick = e => { e.stopPropagation(); refund(b.dataset.sell); });
    root.querySelector('[data-act=undo]')?.addEventListener('click', () => refund());
    root.querySelector('[data-act=rebuy]')?.addEventListener('click', () => quickBuy(prevBuy, 'Rebuy'));
    root.querySelector('[data-act=full]')?.addEventListener('click', () => quickBuy(fullBuy(), 'Full buy'));
    root.querySelector('[data-act=close]').onclick = () => buy(false);
  }
  // mm:ss of a time left (ms), as CS2 shows it.
  const clock = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  // In your team's spawn (Defuse buy zone)?
  function inBuyZone() { const d = D(), at = where(); if (!d || !at) return true; return buyZoneAt(ARENA_MAPS[g().arena.map], myTeam(), at.x - ARENA.cx, at.z - ARENA.cz, DEFUSE.buyRadius); }
  // Scoreboard (hold Tab): deathmatch = one table; Defuse = two team columns (attackers / defenders) with each
  // team's score. Name, ping, K / D / A, money (your team only), dead / alive, bomb and kit. You are highlighted.
  // Display only (no buttons): it never covers controls once Tab is released. Host settings live in the M menu.
  const ping = n => { const p = (lan.players || []).find(x => key(x.name) === key(n)); return p?.bot || /^BOT /.test(n) ? 'BOT' : p?.pose?.ping != null ? p.pose.ping + ' ms' : p ? '—' : 'left'; };
  const row = (n, team, d) => { const C = g().combat || {}, k = key(n), dead = isDownNow(n), mine = myTeam() === team || !d, bomb = d && d.bomb?.carrier === k && mine, kit = d && d.kits?.[k];
    return `<tr class="${dead ? 'dead' : ''}${k === me() ? ' me' : ''}"><td>${/^BOT /.test(n) ? '<small>🤖</small> ' : ''}${esc(n)}<span class="vc" data-vcname="${esc(n)}" title="speaking">🔊</span>${voice?.()?.isMuted?.(n) ? ' <small title="muted">🔇</small>' : ''}${bomb ? ' <span title="bomb">💣</span>' : ''}${kit ? ' <span title="defuse kit">🔧</span>' : ''}${dead ? ' <small>☠</small>' : ''}</td><td class="n">${ping(n)}</td><td class="n">${C.kills?.[k] || 0}</td><td class="n">${C.deaths?.[k] || 0}</td><td class="n">${C.assists?.[k] || 0}</td>${d ? `<td class="n">${mine ? '$' + (d.money?.[k] ?? 800).toLocaleString('en-US') : ''}</td>` : ''}</tr>`; };
  const head = d => `<tr><th>PLAYER</th><th class="n">PING</th><th class="n">K</th><th class="n">D</th><th class="n">A</th>${d ? '<th class="n">$</th>' : ''}</tr>`;
  function scoreboard(open) {
    boardOpen = !!open && inArena(); $('ar-board').hidden = !boardOpen; if (!boardOpen) return;
    const C = g().combat || {}, A = g().arena, d = D(), all = names(), sortK = (a, b) => (C.kills?.[key(b)] || 0) - (C.kills?.[key(a)] || 0) || (C.deaths?.[key(a)] || 0) - (C.deaths?.[key(b)] || 0);
    const inv = invite?.(), joinLine = inv ? `<div class="join">Friends join: ${inv.addrs.map(esc).join(' or ') || 'this computer\u2019s address'} · passcode <b>${esc(inv.code)}</b>${inv.voice?.length ? ` · browser with team voice: ${inv.voice.map(esc).join(' or ')}` : ''}</div>` : '';
    const top = `<div class="top"><b>${d ? 'DEFUSE' : 'DEATHMATCH'} · ${esc(ARENA_MAPS[A.map].name)}</b><small>${d ? (d.round?.phase === 'warmup' ? 'Warmup' : 'Round ' + d.n + ' · first to ' + (d.rules || DEFAULT_RULES).win + (d.rules?.ot === 'mr3' && d.n > 2 * ((d.rules.win) - 1) ? ' · overtime' : '')) : all.length + ' players · most kills in 10:00'}${A.lobby && !A.lobby.started ? ' · lobby' : ''}</small></div>`;
    if (!d) { $('ar-board').firstElementChild.innerHTML = top + `<table>${head(null)}${all.sort(sortK).map(n => row(n, null, null)).join('')}</table>` + joinLine; return; }
    const col = (team, label, sub) => { const list = all.filter(n => d.teams[key(n)] === team).sort(sortK); return `<div class="col ${team}"><div class="th"><span>${label}</span><small>${sub}</small><b>${d.score[team]}</b></div><table>${head(d)}${list.map(n => row(n, team, d)).join('') || '<tr><td colspan="6"><small>nobody</small></td></tr>'}</table></div>`; };
    const spec = all.filter(n => d.teams[key(n)] === 'spec');
    $('ar-board').firstElementChild.innerHTML = top + `<div class="cols">${col('t', 'TERRORISTS', 'attackers')}${col('ct', 'COUNTER-TERRORISTS', 'defenders')}</div>${spec.length ? `<div class="spec">Spectating: ${spec.map(esc).join(', ')}</div>` : ''}` + joinLine;
  }
  // M: team menu (Terrorists / Counter-Terrorists / Spectator) and, for the host, match settings: map, bots, difficulty.
  // In the lobby: ready, and the host's Start now. Opens with M, closes with M or Escape.
  let teamOpen = false;
  function teamMenu(open = !teamOpen) {
    teamOpen = !!open && inArena(); $('ar-team').hidden = !teamOpen; if (!teamOpen) { onBuyClose(); return; } document.exitPointerLock?.(); buy(false); drawTeam();
  }
  function drawTeam() {
    const A = g().arena, d = D(), host = !!lan.canManageWorld, L = A.lobby && !A.lobby.started ? A.lobby : null, cnt = t => names().filter(n => d?.teams[key(n)] === t).length, pend = d?.pending?.[me()];
    $('ar-team').firstElementChild.innerHTML = `<h2>${d ? 'CHOOSE TEAM' : 'MATCH'}</h2>${d ? `<div class="teams"><button data-team="t" class="t${myTeam() === 't' ? ' on' : ''}"><b>TERRORISTS</b><small>attackers · ${cnt('t')} players</small></button><button data-team="ct" class="ct${myTeam() === 'ct' ? ' on' : ''}"><b>COUNTER-TERRORISTS</b><small>defenders · ${cnt('ct')} players</small></button><button data-team="spec"${myTeam() === 'spec' ? ' class="on"' : ''}><b>SPECTATOR</b><small>watch</small></button></div><p class="note">${pend ? 'You join the ' + (pend === 't' ? 'Terrorists' : pend === 'ct' ? 'Counter-Terrorists' : 'spectators') + ' at the next round.' : L || d?.round?.phase === 'warmup' ? 'In the lobby a change is immediate.' : 'During a match you change side at the next round.'}</p>` : '<p class="note">Deathmatch: everyone against everyone.</p>'}
      ${(() => { const mine = A.knives?.[me()] || (/^darja$/.test(me()) ? 'karambit' : 'default'), opts = [['default', 'Default'], ['butterfly', '★ Butterfly Knife'], ['stiletto', '★ Stiletto Knife'], ['m9', '★ M9 Bayonet'], ...(/^darja$/.test(me()) ? [['karambit', '★ Karambit | Ruby']] : [])];
        const darja = /^darja$/.test(me()), others = darja ? names().filter(n => key(n) !== me() && !/^BOT /.test(n)) : [], all = [['default', 'Default'], ['butterfly', '★ Butterfly Knife'], ['stiletto', '★ Stiletto Knife'], ['m9', '★ M9 Bayonet'], ['karambit', '★ Karambit | Ruby']];
        return `<h3>KNIFE</h3><div class="row knives">${opts.map(([id, t]) => `<button data-knife="${id}"${mine === id ? ' class="on"' : ''}>${t}</button>`).join('')}</div>`
          + (others.length ? `<h3>DARJA · EQUIP A KNIFE ON A PLAYER</h3><div class="row"><label>Player <select id="ar-knife-for">${others.map(n => `<option>${esc(n)}</option>`).join('')}</select></label></div><div class="row knives">${all.map(([id, t]) => `<button data-knife-give="${id}">${t}</button>`).join('')}</div>` : ''); })()}
      ${L ? `<div class="row"><button data-ready="${L.ready[me()] ? 0 : 1}">${L.ready[me()] ? '✓ Ready (click to undo)' : 'Ready'}</button>${host ? '<button data-start-now class="primary">End warmup now</button>' : ''}</div>` : ''}
      ${host ? `<h3>HOST · MATCH SETTINGS</h3><div class="row"><label>Map <select id="ar-mapsel">${MAP_LIST.filter(m => mapOffered(m, userMapList().map(u => u.id))).map(({ id, ...m }) => `<option value="${id}"${id === A.map ? ' selected' : ''}>${esc(m.name)} · ${m.kind === 'defuse' ? 'Defuse' : 'Deathmatch'}</option>`).join('')}</select></label><button data-map-go>Change map</button></div>
        <div class="row"><label>Bots <select id="ar-botn">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(n => `<option${n === A.bots.length ? ' selected' : ''}>${n}</option>`).join('')}</select></label><label>Difficulty <select id="ar-botd">${['easy', 'normal', 'hard'].map(x => `<option value="${x}"${x === A.difficulty ? ' selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`).join('')}</select></label><button data-bots-go>Apply</button></div>
        <div class="row"><label>Warmup (s) <input id="ar-warm" type="number" min="0" max="600" step="5" value="${A.warmupS ?? 120}" ${A.lobby && !A.lobby.started ? '' : 'disabled title="the match has started"'}></label><label>Freeze time (s) <input id="ar-freeze" type="number" min="0" max="60" value="${Math.round((A.freezeNext ?? A.freezeMs ?? 15000) / 1000)}"></label><button data-timers-go>Apply</button></div>${A.freezeNext !== undefined ? '<p class="note">New freeze time from the next round.</p>' : ''}
        ${A.kind === 'defuse' ? (() => { const ru = A.rulesNext || d?.rules || A.rules || {}; return `<h3>HOST · MATCH RULES</h3><div class="row"><label>Preset <select id="ar-preset"><option value="">Custom</option><option value="competitive">Competitive (first to 13, MR3 overtime)</option><option value="short">Short (first to 9)</option><option value="casual">Casual (first to 8, no friendly fire)</option></select></label></div>
        <div class="row"><label>First to <input id="ar-win" type="number" min="2" max="16" value="${ru.win ?? 13}"></label><label>Round (s) <input id="ar-round" type="number" min="60" max="300" step="5" value="${ru.roundS ?? 115}"></label><label>Start $ <input id="ar-money0" type="number" min="0" max="16000" step="100" value="${ru.start ?? 800}"></label><label>Max $ <input id="ar-moneymax" type="number" min="1000" max="16000" step="500" value="${ru.max ?? 16000}"></label></div>
        <div class="row"><label><input id="ar-ff" type="checkbox"${ru.ff === false ? '' : ' checked'}> Friendly fire</label><label>At a tie <select id="ar-ot">${[['sudden', 'Sudden death'], ['mr3', 'MR3 overtime'], ['draw', 'Draw']].map(([v, t]) => `<option value="${v}"${(ru.ot || 'sudden') === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label><button data-rules-go>Apply rules</button></div>${A.rulesNext ? '<p class="note">These rules start with the next match.</p>' : ''}`; })() : ''}
        ${d ? `<h3>HOST · ADMIN</h3><div class="row"><button data-pause="${d.paused ? 0 : 1}">${d.paused ? '▶ Resume match' : '⏸ Pause match'}</button><button data-restart>Restart round</button></div>
        <div class="row"><label>Player <select id="ar-specsel">${names().filter(n => !/^BOT /.test(n) && d.teams[key(n)] !== 'spec').map(n => `<option>${esc(n)}</option>`).join('')}</select></label><button data-spec>Move to spectator</button></div>
        <div class="row"><label>Next match map <select id="ar-nextsel"><option value="">Same map</option>${MAP_LIST.filter(m => m.kind === 'defuse' && mapOffered(m, userMapList().map(u => u.id))).map(({ id, ...m }) => `<option value="${id}"${id === A.nextMap ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label><button data-next>Set</button></div>` : ''}` : '<p class="note">The host chooses the map, bots, difficulty and timers.</p>'}
      ${(() => { const v = voice?.(); if (!v || !d) return ''; const mates = names().filter(n => key(n) !== me() && !/^BOT /.test(n) && d.teams[key(n)] === myTeam());
        return `<h3>TEAM VOICE</h3><div class="row"><button data-voice-toggle>${v.status === 'on' ? 'Turn voice off' : 'Turn voice on'}</button><small class="note">${v.status === 'on' ? 'Hold K to talk · team mates only' : v.status === 'error' ? esc(v.error) : !v.secure ? 'Needs a secure page: ' + esc(v.httpsHint()) : 'Off'}</small></div>${mates.length ? `<div class="row">${mates.map(n => `<button data-voice-mute="${esc(n)}" title="voice">${v.isMuted(n) ? '🔇 ' : '🔈 '}${esc(n)}</button><button data-text-mute="${esc(n)}" title="text chat">${comms?.()?.isTextMuted(n) ? '🚫💬' : '💬'}</button>`).join('')}</div>` : ''}`; })()}
      <div class="row">${report?.()?.last ? '<button data-report>📊 Last match report</button>' : ''}<button data-close>Close (M / Esc)</button></div>`;
    const R = $('ar-team'), act = async (a, after) => { const r = await send(a); if (r?.error) notify(r.error); else notify(typeof r === 'string' ? r : r?.message || 'Done'); after?.(r); if (teamOpen) drawTeam(); };
    R.querySelectorAll('[data-team]').forEach(b => b.onclick = () => act({ type: 'team', team: b.dataset.team }));
    R.querySelectorAll('[data-knife]').forEach(b => b.onclick = () => act({ type: 'knife', knife: b.dataset.knife }));
    R.querySelectorAll('[data-knife-give]').forEach(b => b.onclick = () => act({ type: 'knife', knife: b.dataset.knifeGive, for: R.querySelector('#ar-knife-for').value }));
    R.querySelector('[data-ready]')?.addEventListener('click', e => act({ type: 'ready', ready: e.currentTarget.dataset.ready === '1' }));
    R.querySelector('[data-start-now]')?.addEventListener('click', () => act({ type: 'start-match' }, r => { if (!r?.error) teamMenu(false); }));
    R.querySelector('[data-map-go]')?.addEventListener('click', () => { const id = R.querySelector('#ar-mapsel').value; if (id === A.map && !confirm('Restart ' + ARENA_MAPS[id].name + '?')) return; act({ type: 'change-map', map: id }, r => { if (!r?.error) teamMenu(false); }); });
    R.querySelector('[data-bots-go]')?.addEventListener('click', () => act({ type: 'settings', bots: +R.querySelector('#ar-botn').value, difficulty: R.querySelector('#ar-botd').value }));
    R.querySelector('[data-timers-go]')?.addEventListener('click', () => { const w = R.querySelector('#ar-warm'), f = R.querySelector('#ar-freeze'); act({ type: 'settings', freeze: +f.value, ...(w.disabled ? {} : { warmup: +w.value }) }); });
    R.querySelector('#ar-preset')?.addEventListener('change', e => { if (e.currentTarget.value) act({ type: 'settings', preset: e.currentTarget.value }); });
    R.querySelector('[data-rules-go]')?.addEventListener('click', () => act({ type: 'settings', rules: { win: +R.querySelector('#ar-win').value, roundS: +R.querySelector('#ar-round').value, start: +R.querySelector('#ar-money0').value, max: +R.querySelector('#ar-moneymax').value, ff: R.querySelector('#ar-ff').checked, ot: R.querySelector('#ar-ot').value } }));
    R.querySelector('[data-pause]')?.addEventListener('click', e => { const on = e.currentTarget.dataset.pause === '1'; if (on && !confirm('Pause the match for everyone?')) return; act({ type: 'pause', on }); });
    R.querySelector('[data-restart]')?.addEventListener('click', () => { if (confirm('Restart this round for everyone? Kills and plants in it are undone.')) act({ type: 'restart-round' }); });
    R.querySelector('[data-spec]')?.addEventListener('click', () => { const n = R.querySelector('#ar-specsel').value; if (n && confirm('Move ' + n + ' to spectator?')) act({ type: 'move-spec', name: n }); });
    R.querySelector('[data-next]')?.addEventListener('click', () => act({ type: 'next-map', map: R.querySelector('#ar-nextsel').value }));
    R.querySelector('[data-voice-toggle]')?.addEventListener('click', async () => { const v = voice?.(); if (!v) return; if (v.status === 'on') v.disable(); else await v.enable(); if (teamOpen) drawTeam(); });
    R.querySelectorAll('[data-text-mute]').forEach(b => b.onclick = () => { const c = comms?.(), n = b.dataset.textMute; c?.muteText(n, !c.isTextMuted(n)); drawTeam(); });
    R.querySelectorAll('[data-voice-mute]').forEach(b => b.onclick = () => { const v = voice?.(), n = b.dataset.voiceMute; v?.mute(n, !v.isMuted(n)); drawTeam(); });
    R.querySelector('[data-report]')?.addEventListener('click', () => { teamMenu(false); report?.()?.show(); });
    R.querySelector('[data-close]').onclick = () => teamMenu(false);
  }
  // Lobby panel (LAN, before the match): mode + map confirmed by the room, countdown, who joined (team, ready,
  // connection), why it is waiting, and how friends join. Left side, clear of the top bar and the crosshair.
  let lobbyKey = '';
  function lobbyPanel() {
    const A = g().arena, L = A?.lobby && !A.lobby.started ? A.lobby : null; if (!L) { if (!$('ar-lobby').hidden) $('ar-lobby').hidden = true; lobbyKey = ''; return; }
    const d = D(), left = Math.max(0, Math.ceil((L.until - Date.now()) / 1000)), inv = invite?.(), people = names().filter(n => !/^BOT /.test(n)), bots = A.bots.length;
    const k = [left, A.warmupS, A.freezeMs, !!D()?.paused, L.note, JSON.stringify(L.ready), people.join(), bots, d ? JSON.stringify(d.teams) : '', (lan.players || []).map(p => p.pose?.ping).join(), !!inv].join('|'); if (k === lobbyKey) return; lobbyKey = k;
    $('ar-lobby').hidden = false; $('ar-lobby').innerHTML = `<b>LOBBY · ${A.kind === 'defuse' ? 'DEFUSE' : 'DEATHMATCH'} · ${esc(ARENA_MAPS[A.map].name)}</b><div class="clock">Match starts in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</div><small>Warmup ${A.warmupS ?? 120} s · freeze time ${Math.round((A.freezeMs ?? 15000) / 1000)} s per round${d?.paused ? ' · <b>paused</b>' : ''}</small>${L.note ? `<div class="warn">${esc(L.note)}</div>` : ''}
      <ul>${people.map(n => { const t = d?.teams[key(n)], p = ping(n); return `<li class="${t || ''}"><span>${esc(n)}${key(n) === me() ? ' (you)' : ''}</span><small>${t === 't' ? 'T' : t === 'ct' ? 'CT' : t === 'spec' ? 'SPEC' : ''} · ${L.ready[key(n)] ? '✓ ready' : 'not ready'} · ${p === 'left' ? 'disconnected' : p}</small></li>`; }).join('')}${bots ? `<li><span>🤖 ${bots} bot${bots > 1 ? 's' : ''}</span><small>${A.difficulty}</small></li>` : ''}</ul>
      ${inv ? `<div class="join">Friends join: ${inv.addrs.map(esc).join(' or ') || 'this computer\u2019s address'}<br>passcode <b>${esc(inv.code)}</b></div>` : ''}<small>M: team · ready${lan.canManageWorld ? ' · start now · map · bots' : ''} · warmup: no damage</small>`;
  }
  function hud() {
    if (D()) return defuseHud();
    const A = g().arena, C = g().combat || {}, left = Math.max(0, A.endsAt - Date.now()), mm = Math.floor(left / 60000), ss = String(Math.floor(left / 1000) % 60).padStart(2, '0');
    const top = Object.entries(C.kills || {}).sort((a, b) => b[1] - a[1])[0], mine = C.kills?.[me()] || 0;
    $('ar-top').hidden = false; $('ar-top').innerHTML = `<span><small>KILLS</small> ${mine}</span><span>${A.practice ? 'PRACTICE' : mm + ':' + ss}</span><span><small>LEADER</small> ${top ? esc(C.names?.[top[0]] || top[0]) + ' ' + top[1] : '—'}</span>`;
    const feed = (C.feed || []).filter(f => Date.now() - f.at < 7000), fk = feed.map(f => f.at).join();
    if (fk !== feedKey) { feedKey = fk; deathSounds(feed); $('ar-feed').innerHTML = feed.map(f => feedLine(f, key(f.by) === me() || key(f.target) === me())).join(''); }
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
  // Not right after a drop (as CS2: the gun you let go is not taken straight back — dropped by a wall it lands at your feet).
  let pickPause = 0;
  function autoPick() {
    if (isDownNow(name()) || Date.now() < pickPause) return; const l = g().arena.loadout?.[me()] || {}, free = s => s === 'primary' ? !l.primary : l.secondary === null;
    const it = nearest(3.2, it => slotOf(it.item) && free(slotOf(it.item)) && (tried.get(it.id) || 0) < Date.now()); if (!it) return;
    tried.set(it.id, Date.now() + 1500); send({ type: 'pickup', id: it.id }).then(r => { const m = typeof r === 'string' ? r : r?.message; if (m && !r?.error) { notify(m); setAmmo?.(it.item, it.ammo); } });
  }
  // G: drop the gun in hand (not the knife), then hold the next one.
  async function drop() {
    const id = current(), slot = slotOf(id); if (!slot) { notify('You can\u2019t drop the knife'); return; }
    pickPause = Date.now() + 1500; const at = where(), r = await send({ type: 'drop', slot, kind: id, x: at?.x, z: at?.z, y: feet(), yaw: yaw() }); if (r?.error) { notify(r.error); return; } if (slot !== 'nades') setAmmo?.(id, null);
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
    if (r.phase !== lastPhase) { if (r.phase === 'planted') show('Bomb has been planted', 'bomb', 3500);   // (CS2: just that — no site, no red box)
      if (r.phase === 'over') show((r.winner === 't' ? 'TERRORISTS WIN' : 'COUNTER-TERRORISTS WIN') + `<small>${{ elim: 'eliminated', bomb: 'target bombed', defuse: 'bomb defused', time: 'time ran out' }[r.reason]} · ${d.score.t} – ${d.score.ct}</small>`, r.winner, DEFUSE.overMs);
      if (r.phase === 'over' && r.reason === 'bomb' && r.planted) explosion(scene.group, r.planted, 4); lastPhase = r.phase; }
    if (d.matchOver) show(`MATCH OVER · ${!d.matchOver.winner ? 'DRAW' : d.matchOver.winner === 't' ? 'TERRORISTS WIN' : 'COUNTER-TERRORISTS WIN'}<small>${d.score.t} – ${d.score.ct} · new match soon</small>`, d.matchOver.winner, 2000);
    if (now > bannerUntil) $('ar-banner').hidden = true;
    const act = r.plant?.by === me() ? ['Planting…', (now - r.plant.start) / DEFUSE.plantMs] : r.defuse?.by === me() ? ['Defusing…', (now - r.defuse.start) / r.defuse.ms] : null;
    $('ar-prog').hidden = !act; if (act) { $('ar-prog').firstElementChild.textContent = act[0]; $('ar-prog').lastElementChild.style.width = Math.min(100, act[1] * 100) + '%'; }
    const feed = (C.feed || []).filter(f => now - f.at < 7000), fk = feed.map(f => f.at).join(), col = n => d.teams[key(n)] === 'ct' ? '#8fc4ff' : '#ffc36b';
    if (fk !== feedKey) { feedKey = fk; deathSounds(feed); $('ar-feed').innerHTML = feed.map(f => feedLine(f, key(f.by) === me() || key(f.target) === me(), col(f.by), col(f.target))).join(''); }
    freezeMusic(r.phase === 'freeze' && !d.matchOver);   // the calm jazz while everyone waits at spawn
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
  let hudAt = 0, hudPhase = '', lastNear = '', teamAt = 0;
  return {
    get open() { return buyOpen || teamOpen; }, get teamOpen() { return teamOpen; }, teamMenu, buy, scoreboard, drop, use,
    get defuse() { return D(); }, get team() { return myTeam(); },
    // Dropped guns within reach (names, nearest first), and picking up the nearest (of that name) as E on it does — tools and tests.
    nearbyGround: () => nearby().map(({ it }) => weaponById(it.item)?.name || NADES[it.item]?.name || it.item), pickNearest: (name = null) => { const n = nearby().find(({ it }) => !name || (weaponById(it.item)?.name || NADES[it.item]?.name || it.item) === name); return n ? pickUp(n.it) : Promise.resolve(false); },
    // Hold to plant (bomb in hand, on a site) / hold E to defuse (CT at the planted bomb); let go to stop.
    plant(hold) { const at = where(); return send({ type: 'plant', hold, x: at?.x, y: at?.y, z: at?.z }).then(r => { if (hold && r?.error) notify(r.error); return r; }); },
    defuseHold(hold) { const at = where(); return send({ type: 'defuse', hold, x: at?.x, y: at?.y, z: at?.z }).then(r => { if (hold && r?.error) notify(r.error); return r; }); },
    nearBomb() { const p = D()?.round?.phase === 'planted' && D().round.planted, at = where(); return !!(p && at && myTeam() === 'ct' && Math.hypot(at.x - p.x, at.z - p.z) < 7); },
    // Throw the grenade in hand (left click); then the next one of that kind, or back to your best gun.
    async throwNade(id, strength = 'long') { const at = where(), a = aim(); if (!at) return; throwSound(); const r = await send({ type: 'throw', kind: id, x: at.x, y: at.y, z: at.z, strength, ...a }); if (r?.error) { notify(r.error); return; } dispatchEvent(new CustomEvent('gd-throw', { detail: { kind: id, a: { x: at.x, y: at.y, z: at.z, strength, ...a } } }));   /* (practice: its flight path) */
      const own = arenaArsenalOf(g(), name()); equip(own.includes(id) ? id : own[0]); },
    update() {
      if (!inArena()) { if (entered) leave(); return; }
      { const P = !!D()?.paused; if ($('ar-paused').hidden === P) $('ar-paused').hidden = !P; }
      if (boardOpen) { const v = voice?.(); if (v) for (const el of document.querySelectorAll('#ar-board .vc')) { const on = v.speaking(el.dataset.vcname); if (el.classList.contains('on') !== on) el.classList.toggle('on', on); } }   // speaking now (real audio level)
      const A = g().arena; if (entered !== A.map + ':' + A.startedAt) { enter(); if (entered !== A.map + ':' + A.startedAt) return; }
      // Respawn: the host picks the spawn farthest from enemies.
      // Something outside the arena moved us back to the hall (joining, a menu): return to a spawn point.
      const at = where(); if (at && !scene.inArena(at.z)) { const so = g().combat?.spawnTo?.[me()]; if (so) goSpawn(so); else goTo(spawnIndex()); }
      const s = g().combat?.spawnTo?.[me()]; if (s && s.at !== spawnAt) { spawnAt = s.at; goSpawn(s); const own = arenaArsenalOf(g(), name()); equip(own[0]); notify('Respawned'); }   // back with your primary in hand (CS2)
      drawGround(); if (performance.now() - pickAt > 160) { pickAt = performance.now(); autoPick(); lookPrompt(); if (buyOpen && nearby().map(n => n.it.id).join() !== lastNear) { lastNear = nearby().map(n => n.it.id).join(); buy(true); } }
      bombView(D()?.round?.phase === 'planted' ? D().round.planted : null);
      const ph = D() ? D().n + ':' + D().round?.phase : '';   // round events (planted, round over…) show at once
      if (performance.now() - hudAt > 200 || ph !== hudPhase) { hudAt = performance.now(); hudPhase = ph; trackBuys(); hud(); lobbyPanel(); if (teamOpen && performance.now() - (teamAt || 0) > 1000) { teamAt = performance.now(); } }
    },
  };
}
