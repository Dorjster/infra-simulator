// Global Defensive · the death panel, CS2's (v53 Addendum 2; stage 3 made the first one — killer, weapon, HS mark — this
// one takes its place, gd-kill-emblem.js re-exports it). Shown while the death cam runs (gd-deathcam.js), gone when the
// first-person spectating starts (or, with no cam — a down record without its time, the tests — after DEATH_PANEL_MS).
//
// CS2's own layout, from the user's install (panorama/styles/hud/huddeathpanel.vcss, read as text from the compiled
// file): the panel 410 px wide (.DeathPanel__Content), centred at the top (.DeathPanel: horizontal-align center,
// vertical-align top), on rgba(0, 0, 0, .5) with the world blurred behind (.DeathPanel__BG-Blur), fading in over 0.3 s
// linear (DeathPanelFadeInAnim); the killer's avatar 66 px in an 80 px box (.DeathPanel__Avatar / _AvatarBG) with a
// 86 × 5 px health bar #dee5c8 under it (.DeathPanel__AvatarHealthBar); the name #cccccc bold 24 px (.DeathPanel__Name);
// the line under it #c93121 bold 18 px (.DeathPanel__Desc); the weapon in a 150 px box with a 2 px #25252540 rule on its
// left (.DeathPanel__ItemContainer); the two damage lines 18 px, padded 4 px 10 px, the "taken" one under a 2 px
// #25252540 rule (.DeathPanel__Damage), each with a 3 px bar — taken red, given green — on #25252550 (#ProgressDamage…);
// the skip hint 20 px bold #cccccc with a 2 px black shadow at y 810 px, centred (.DeathCancel).
// CS2's words (resource/csgo_english.txt): "killed you with their {s:weapon_name}" (Panorama_DeathPanel_Killer1_KillerWeapon:
// the killer's own gun), "killed you with your own …" (_YourWeapon: a gun of yours they picked up), "killed you with
// <font color='#adadad'>{s:other_player_name}'s</font> …" (_OthersWeapon: someone else's) — chosen by the down record's
// `o` (r2 fix: the gun's owner, combat-logic.js, only when it isn't the killer's own), "Damage taken:
// <b>%d</b> in <b>%d hit(s)</b>" / "Damage given: …" (Panorama_DeathPanel_DamageTaken / _DamageGiven: grey #A0A0A0, the
// numbers white), "YOU KILLED YOURSELF", "You were killed by your own grenade", "You burned to death", "You were killed
// by the C4 explosion" (DeathPanel_KilledSelf / _KilledByOwnGrenade / _KilledByFire / _KilledByC4), "[Space] Skip"
// (Panorama_Death_Cancel_Start_Replay: "[{s:bind_jump}] Skip"). "KILLED BY" over the name is the user's own ask.
// (r2 fix) the health bar 86 × 5 px as the vcss says (it was drawn 66 px wide). The world blur behind the panel is left
// out on the Low / Very Low presets (low(): a backdrop blur re-reads the canvas every frame — spec §5, a laptop with no
// graphics card).
// Ours: the avatar (CS2 shows the killer's Steam picture: we draw a team-coloured silhouette), the top margin TOP (the
// panel's parent offset is in the compiled layout file, not readable as text: placed under the reference HUD's top strip).
// DATA: the host's down record (combat.down[you]: by, weapon, wid, head, at; v53: dg / dt = [damage, hits] given to /
// taken from the killer this round — combat-logic.js) and the kill feed's line of it (its marks: wallbang, no-scope,
// smoke, blind, in the air); the killer's health now (combat.hp). Built once per death; per frame only the killer's
// health and the skip hint are looked at (written when they change): nothing allocated per frame.
// FIT (FINISH pass, after review): CS2's .DeathPanel__Name / __Desc are "text-overflow: shrink min(14px)" — the text
// made smaller, down to 14 px, until it fits — and the line is padded 8 px left with up to 30 px of height (two lines at
// 14 px). Done here once per death, after the panel shows (fitText: 18 → 14 px, 24 → 14 px for the name; then the
// name's ellipsis): the weapon's name is never cut.
import { gdView } from './gd-display.js';
import { DEATHCAM, deathKind } from './gd-deathcam.js';

const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const DEATH_PANEL_MS = 6000;
export const TOP = 128, W = 410;   // px at 1080 p
export const SELF_TEXT = { self: 'YOU KILLED YOURSELF', grenade: 'You were killed by your own grenade', fire: 'You burned to death', bomb: 'You were killed by the C4 explosion' };
export const MARK_ORDER = ['head', 'wallbang', 'noscope', 'smoke', 'blind', 'air'];
const TEAM_COLOR = { t: '#e8b25b', ct: '#6fb1ef' };
const SIL = c => `<svg viewBox="0 0 66 66" width="66" height="66"><rect width="66" height="66" rx="3" fill="#1b2026"/><circle cx="33" cy="25" r="12" fill="${c}"/><path d="M10 66c2-14 11-22 23-22s21 8 23 22z" fill="${c}"/></svg>`;
const hitsWord = n => n === 1 ? 'hit' : 'hits';
export const damageLine = (what, d, h) => `<font color="#A0A0A0">Damage ${what}:  </font><font color="#FFFFFF"><b>${d | 0}</b></font> <font color="#A0A0A0"> in</font> <font color="#FFFFFF"><b>${h | 0} ${hitsWord(h | 0)} </b></font>`;

// CS2's line under the killer's name for this gun (o: its owner's key on the down record, absent = the killer's own)
export function killerLine(dn, me, names = null) { const w = esc(dn?.weapon || ''), o = dn?.o;
  if (!o) return `killed you with their ${w}`; if (o === me) return `killed you with your own ${w}`;
  return `killed you with <font color="#adadad">${esc(names?.[o] || o)}'s</font> ${w}`; }
export function createDeathPanel({ doc = globalThis.document, parent = doc?.body, art = null, low = () => false } = {}) {
  const css = doc.createElement('style'); css.textContent = `#gd-dp{position:fixed;left:50%;top:${TOP}px;width:${W}px;transform:translateX(-50%);transform-origin:50% 0;z-index:39;pointer-events:none;color:#fff;font:400 18px Stratum2,'Arial Unicode MS',system-ui,sans-serif;background:rgba(0,0,0,.5);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border-radius:3px;animation:gd-dp-in .3s linear}#gd-dp[hidden]{display:none}@keyframes gd-dp-in{from{opacity:0}to{opacity:1}}
#gd-dp .row{display:flex;align-items:stretch;min-height:86px}#gd-dp .av{width:80px;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px}#gd-dp .hpb{width:86px;height:5px;background:#25252550}#gd-dp.lo{backdrop-filter:none;-webkit-backdrop-filter:none;background:rgba(0,0,0,.62)}#gd-dp .hpb i{display:block;height:100%;background:#dee5c8}
#gd-dp .who{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;padding:6px 6px 6px 4px}#gd-dp .who small{font:700 11px system-ui;letter-spacing:.14em;color:#a0a0a0}#gd-dp .name{color:#ccc;font-weight:700;font-size:24px;line-height:26px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#gd-dp .desc{color:#c93121;font-weight:700;font-size:18px;line-height:1.05;padding-left:8px;max-height:30px;overflow:hidden;overflow-wrap:anywhere}#gd-dp .marks{display:flex;gap:4px;height:18px;margin-top:2px}#gd-dp .marks>*{height:18px;width:auto}
#gd-dp .item{width:150px;flex:none;border-left:2px solid #25252540;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}#gd-dp .item img,#gd-dp .item svg{max-width:130px;max-height:44px}#gd-dp .item .hp{font:700 15px system-ui;color:#dee5c8}
#gd-dp .dmg{position:relative;padding:4px 10px 6px}#gd-dp .dmg.taken{border-top:2px solid #25252540}#gd-dp .dmg .bar{position:absolute;left:0;right:0;bottom:0;height:3px;background:#25252550}#gd-dp .dmg .bar i{display:block;height:100%}#gd-dp .dmg.taken .bar i{background:red}#gd-dp .dmg.given .bar i{background:green}
#gd-dp.self .row{min-height:58px}#gd-dp.self .who{padding:10px 14px}
#gd-dp-skip{position:fixed;left:50%;top:810px;transform:translateX(-50%);transform-origin:50% 0;z-index:39;pointer-events:none;color:#ccc;font:700 20px system-ui;text-shadow:2px 2px #000}#gd-dp-skip[hidden]{display:none}`;
  (doc.head || doc.body)?.append?.(css);
  const el = doc.createElement('div'); el.id = 'gd-dp'; el.className = 'gd-dpc'; el.hidden = true; parent?.append?.(el);   // (class gd-dpc, not stage 3's .gd-dp: its old styles in gd-kill-emblem.js's sheet don't touch this one)
  const skip = doc.createElement('div'); skip.id = 'gd-dp-skip'; skip.hidden = true; skip.textContent = '[SPACE] Skip'; parent?.append?.(skip);
  let shownAt = null, hpEl = null, hpBar = null, hpShown = null, killerK = null, fitH = -1;
  function fit() { const H = gdView?.on && gdView.h > 0 ? gdView.h : (globalThis.innerHeight || 1080), Y = gdView?.on ? gdView.y || 0 : 0; if (H === fitH) return; fitH = H; const s = H / 1080;
    if (el.style) { el.style.top = (Y + TOP * s).toFixed(1) + 'px'; el.style.transform = `translateX(-50%) scale(${s.toFixed(4)})`; } if (skip.style) { skip.style.top = (Y + 810 * s).toFixed(1) + 'px'; skip.style.transform = `translateX(-50%) scale(${s.toFixed(4)})`; } }
  // CS2's "shrink min(14px)": the font stepped down until the text fits its box (once per death: a few layouts, no frame cost)
  const fits = e => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= Math.max(e.clientHeight, 30) + 1;
  function shrink(e, from, min) { if (!e?.style) return; for (let f = from; f >= min; f--) { e.style.fontSize = f + 'px'; if (e.style.lineHeight !== undefined && e.classList?.contains?.('name')) e.style.lineHeight = Math.max(f + 2, 16) + 'px'; if (fits(e)) return; } }
  function fitText() { shrink(el.querySelector?.('.name'), 24, 14); shrink(el.querySelector?.('.desc'), 18, 14); }
  function build(G, me, dn) {
    const kind = deathKind(dn, me), kn = G.arena?.knives?.[key(dn.by)];
    if (kind !== 'killer') { const t = kind === 'bomb' ? SELF_TEXT.bomb : kind === 'fire' ? SELF_TEXT.fire : dn.wid === 'he' ? SELF_TEXT.grenade : SELF_TEXT.self;
      el.className = 'gd-dpc self'; el.innerHTML = `<div class="row"><div class="who"><span class="name">${esc(t)}</span></div></div>`; hpEl = hpBar = null; killerK = null; return; }
    killerK = key(dn.by); const team = G.combat?.d?.teams?.[killerK] || null, hp = G.combat?.hp?.[killerK];
    // the kill feed's line of this death: its marks (CS2's kill-feed icons when imported)
    let how = null; for (const f of G.combat?.feed || []) if (key(f.target) === me && key(f.by) === killerK && Math.abs((f.at || 0) - (dn.at || 0)) < 1500) { how = f.how || null; break; }
    const marks = MARK_ORDER.filter(k => k === 'head' ? dn.head : !!how?.[k]).map(k => art?.mark ? art.mark(k, k === 'head' ? (art.hs || '') : '') : `<span class="m">${k === 'head' ? 'HS' : k}</span>`).join('');
    const gun = art?.gun ? art.gun(dn.wid, kn) : `<span>${esc(dn.weapon)}</span>`;
    const dg = Array.isArray(dn.dg) ? dn.dg : null, dt = Array.isArray(dn.dt) ? dn.dt : null, pct = d => Math.max(0, Math.min(100, d | 0));
    const hpN = Number.isFinite(hp) ? hp : null;
    el.className = low() ? 'gd-dpc lo' : 'gd-dpc';
    el.innerHTML = `<div class="row"><div class="av">${SIL(TEAM_COLOR[team] || '#9aa4ad')}<div class="hpb"><i class="hpi" style="width:${hpN ?? 0}%"></i></div></div>`
      + `<div class="who"><small>KILLED BY</small><span class="name">${esc(dn.by)}</span><span class="desc">${killerLine(dn, me, G.combat?.names)}</span><div class="marks">${marks}</div></div>`
      + `<div class="item">${gun}<span class="hp">${hpN === null ? '' : '✚ ' + hpN}</span></div></div>`
      + (dt ? `<div class="dmg taken"><span>${damageLine('taken', dt[0], dt[1])}</span><div class="bar"><i style="width:${pct(dt[0])}%"></i></div></div>` : '')
      + (dg ? `<div class="dmg given"><span>${damageLine('given', dg[0], dg[1])}</span><div class="bar"><i style="width:${pct(dg[0])}%"></i></div></div>` : '');
    hpEl = el.querySelector?.('.hp') || null; hpBar = el.querySelector?.('.hpi') || null; hpShown = hpN;
  }
  return {
    el, skipEl: skip,
    update(on, G, me, now) {
      const dn = on ? G?.combat?.down?.[me] : null, down = !!dn && dn.until > now;
      if (!down) { if (!el.hidden) el.hidden = true; if (!skip.hidden) skip.hidden = true; shownAt = null; return; }
      if (!dn.by && !dn.wid) { if (!el.hidden) el.hidden = true; if (!skip.hidden) skip.hidden = true; return; }   // (not a death: joined mid-round, watching until the next one)
      if (dn.at !== shownAt) { shownAt = dn.at; build(G, me, dn); el.hidden = false; fit(); fitText(); }
      // gone when the cam is done (spectating), or — no cam for this death — after DEATH_PANEL_MS
      const camThis = DEATHCAM.at === dn.at && DEATHCAM.phase !== 'alive', over = camThis ? DEATHCAM.phase === 'done' : now - (dn.at || now) > DEATH_PANEL_MS;
      if (over) { if (!el.hidden) el.hidden = true; if (!skip.hidden) skip.hidden = true; return; }
      fit();
      const sk = camThis && DEATHCAM.canSkip; if (skip.hidden === sk) skip.hidden = !sk;
      if (killerK && hpEl) { const hp = G.combat?.hp?.[killerK]; if (Number.isFinite(hp) && hp !== hpShown) { hpShown = hp; hpEl.textContent = '✚ ' + hp; if (hpBar?.style) hpBar.style.width = hp + '%'; } }
    },
  };
}
