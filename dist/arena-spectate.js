// Spectating while dead in the arena, CS2's way: always through a living team mate's eyes ("in-eye", first person) —
// no chase camera, no free camera, Space does nothing. Left / right click cycle through who you can watch (Defuse: your
// own team; until the round ends there, until your respawn in the respawn modes). The camera sits at their eye (their
// feet + eye height, crouch included) and looks where they look — yaw AND pitch — from the same smoothed remote motion
// the bodies use (multiplayer.js place(): m.iyaw / m.ipitch / m.iey, adaptive interpolation), so it is smooth at any
// refresh rate. Their own body (head, helmet, arms, third-person gun) and name tag are not drawn for you; their first-
// person view model is (spectate-view.js: their weapon in CS2's first-person set, kick, reload, draw on switch). A CS2-
// style HUD shows THEIR health, armour and ammo; the bar names them, who killed you and when you are back. Nobody left
// to watch: the frozen death view with the 'killed by' bar (as before). The respawn order from the host ends it.
import * as THREE from './three.module.js';
import { isDown, hpOf, armorOf } from './combat-logic.js';
import { weaponById, isFirearm } from './weapons-data.js';
import { skinFor } from './skins.js';
import { hostNow } from './host-clock.js';   // (who is down until when: the host's clock)

const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// CS2's eye over the feet: 64 HU standing, 46 crouched (16.5 HU per game unit · 2.54: the game's inch-based units).
export const EYE_STAND = 9.7, EYE_CROUCH = 46 * 2.54 / 16.5;
// The watched player's eye over their feet: the interpolated one (multiplayer.js place: m.iey), else their pose's
// (lan/room.mjs ey), else CS2's standing / crouched eye.
export const eyeOf = (iey, ey, crouched) => Number.isFinite(iey) ? iey : Number.isFinite(ey) ? ey : crouched ? EYE_CROUCH : EYE_STAND;
// The way they look: yaw (0 = −z, as the game's own camera) and pitch (up +), clamped as the host clamps it.
export const clampPitch = p => Number.isFinite(p) ? Math.max(-1.5, Math.min(1.5, p)) : 0;
// Their eye's spot and look on the camera (one Euler, refilled: nothing made per frame). The same 'YXZ' order the
// player's own camera uses (lab.js), so what you see is exactly what they see (their view punch aside).
const E = new THREE.Euler(0, 0, 0, 'YXZ');
export function eyeCamera(camera, x, feetY, z, eye, yaw, pitch) { camera.position.set(x, feetY + eye, z); camera.quaternion.setFromEuler(E.set(clampPitch(pitch), yaw, 0, 'YXZ')); return camera; }
// The next one to watch, `step` along the list (wrapping); the first when nobody is watched yet.
export function cycleTarget(list, target, step) { if (!list.length) return null; let i = -1; for (let k = 0; k < list.length; k++) if (list[k].id === target) { i = k; break; } return list[((i < 0 ? 0 : i + step) % list.length + list.length) % list.length].id; }
// Their body hidden for you only: the CS2 agent's group (m.cs.g; else the plain avatar's parts — never m.g itself: its
// `visible` is who is in the match / in a smoke for everyone else: the radar, the list here, the ragdoll). What was
// hidden comes back when you watch someone else or stop. A new agent made while watched (a side swap) is hidden too.
export function createBodyHider() {
  let model = null; const hid = [];
  const restore = () => { for (let i = 0; i < hid.length; i++) hid[i].visible = true; hid.length = 0; model = null; };
  const hideOne = o => { if (o && o.visible) { o.visible = false; hid.push(o); } };
  return {
    get model() { return model; }, get hidden() { return hid.length; },
    hide(m) {
      if (m !== model) { restore(); model = m || null; } if (!m?.g) return;
      const cs = m.cs?.g;
      if (cs) { for (let i = hid.length - 1; i >= 0; i--) { const o = hid[i]; if (o !== cs && o.parent === m.g && o !== m.label) { if (o.userData?.csWas === false) o.userData.csWas = true; hid.splice(i, 1); } }   // (an agent arrived over avatar parts hidden here: multiplayer.js dressCS keeps those hidden and gives them back when it goes)
        hideOne(cs); return; }
      const ch = m.g.children || []; for (let i = 0; i < ch.length; i++) if (ch[i] !== m.label) hideOne(ch[i]);
    },
    restore,
  };
}
// Who can be watched: in the match (active), alive, on your side (Defuse); a body hidden only by a smoke still counts.
export const watchable = m => !!m?.g && (m.g.visible || !!m.smokeHid) && m.activeVis !== false;

export function createSpectator({ camera, world, lan, name, boxes = () => [], view = null }) {
  const css = document.createElement('style'); css.textContent = `#sp-bar{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:38;display:flex;gap:14px;align-items:center;background:#000b;border:1px solid #ffffff2a;border-radius:8px;padding:8px 18px;color:#fff;font:700 15px system-ui;text-shadow:0 1px 2px #000;pointer-events:none}#sp-bar[hidden]{display:none}#sp-bar small{font:600 12px system-ui;opacity:.75}#sp-bar b{font:800 18px system-ui}#sp-bar .k{color:#ff6a6a}
#sp-hud{position:fixed;inset:0;z-index:36;pointer-events:none;font:700 14px system-ui;color:#fff;text-shadow:0 1px 3px #000c;font-variant-numeric:tabular-nums}#sp-hud[hidden]{display:none}
#sp-hp{position:absolute;left:22px;bottom:22px;display:flex;align-items:flex-end;gap:18px}#sp-hp .v{display:flex;align-items:baseline;gap:6px}#sp-hp b{font:800 40px ui-monospace,Menlo,Consolas,monospace;letter-spacing:-.02em}#sp-hp small{font:700 11px system-ui;letter-spacing:.12em;opacity:.75}#sp-hp .ico{font:900 22px system-ui;opacity:.9}#sp-hp .low b,#sp-hp .low .ico{color:#ff4d4d}#sp-hp .none{opacity:.35}
#sp-wp{position:absolute;right:22px;bottom:18px;text-align:right}#sp-wp .name{font:800 13px system-ui;letter-spacing:.08em;color:#ffd36b}#sp-wp .ammo{font:800 40px ui-monospace,Menlo,Consolas,monospace}#sp-wp .ammo small{font:700 20px ui-monospace,Menlo,monospace;opacity:.7}`;
  (document.head || document.body).append?.(css); document.body.insertAdjacentHTML('beforeend', '<div id="sp-bar" hidden></div><div id="sp-hud" hidden><div id="sp-hp"></div><div id="sp-wp"></div></div>');
  const bar = document.getElementById('sp-bar'), hud = document.getElementById('sp-hud') || { hidden: true }, hpEl = document.getElementById('sp-hp'), wpEl = document.getElementById('sp-wp');
  const put = (el, html) => { if (el && el.__v !== html) { el.__v = html; el.innerHTML = html; } };   // (written only when it changed: no restyle 5× a second)
  let on = false, target = null, barAt = 0, wasHeld = false;
  // Who you watch, for the radar (GDUI-06) and the name tags (lab.js): their eye and the way they face. One reused
  // record; null while nobody is watched.
  const watched = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, name: '', key: '' }; let watching = false;
  const body = createBodyHider();
  // What the first-person view needs from them this frame (spectate-view.js), refilled.
  const VR = { key: null, weapon: null, team: null, knife: null, skin: null, shotN: 0, shotW: null, reloadN: 0, reloadW: null, speed: 0, act: null, actUntil: 0 };
  const g = () => world.operations.game;
  // Everyone you can watch: reused records in a reused list (asked every frame while dead: nothing made per frame).
  const list = [], pool = [];
  function alive() {
    const dd = g().combat?.d, mine = dd?.teams?.[key(name())], now = hostNow(), P = lan.players || [];   // defuse: only your own team (CS2)
    list.length = 0; for (const [id, m] of lan.models || []) { if (!watchable(m) || isDown(g(), m.name, now) || (dd && dd.teams[key(m.name)] !== mine)) continue; let p = null; for (let i = 0; i < P.length; i++) if (P[i].id === id) { p = P[i]; break; }
      const o = pool[list.length] ??= {}; o.id = id; o.name = m.name; o.m = m; o.p = p; o.pos = m.g.position; aimOf(o); list.push(o); }
    return list;
  }
  // Their look and eye from the smoothed remote motion (multiplayer.js place: m.iyaw / m.ipitch / m.iey), else the newest pose.
  function aimOf(o) { const m = o.m, pose = o.p?.pose;
    o.yaw = Number.isFinite(m.iyaw) ? m.iyaw : pose?.yaw ?? m.g.rotation.y; o.pitch = clampPitch(Number.isFinite(m.ipitch) ? m.ipitch : +pose?.shot?.pitch || 0);
    o.weapon = pose?.gun === false ? null : pose?.weapon || null; o.crouched = !!(m.crouch ?? pose?.crouched); o.eye = eyeOf(m.iey, pose?.ey, o.crouched); }
  // The eye camera from them, and the record the radar / name tags read.
  function eyeFrom(t) { watched.x = t.pos.x; watched.y = t.pos.y + t.eye; watched.z = t.pos.z; watched.yaw = t.yaw; watched.pitch = t.pitch; eyeCamera(camera, t.pos.x, t.pos.y, t.pos.z, t.eye, t.yaw, t.pitch); }
  let cur = null;   // (the record watched this frame: follow() re-reads it)
  const byId = id => { const l = alive(); for (let i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; };
  function pick(step) { target = cycleTarget(alive(), target, step); }
  // Stop showing anyone: their body and name tag back, the view model gone (your own takes its set back: lab.js).
  function release() { body.restore(); if (view?.hide()) wasHeld = true; watching = false; hud.hidden = true; }
  return {
    get on() { return on; }, get watched() { return on && watching ? watched : null; }, get target() { return on ? target : null; },
    // The name key of who you watch (lab.js: their name tag is not drawn for you); null when nobody.
    get watchedKey() { return on && watching ? watched.key : null; },
    get view() { return view; }, get bodyHidden() { return body.model; },
    // (true once after the view model gave up a CS2 set — your own view takes it back: weapons.js hideView)
    takeReleased() { const r = wasHeld; wasHeld = false; return r; },
    next() { pick(1); }, prev() { pick(-1); },
    // After the remote bodies are placed for this frame (lab.js, after lan.update): the eye camera from where they are drawn
    // NOW. update() runs before that placing, so on its own the camera showed the previous frame's look — one frame late,
    // which turned every long frame into a stall then a jump (seen at 144 Hz: a 45 ms frame drew ~7 ms of turn, the next
    // one ~50 ms). Nothing allocated.
    follow() { if (!on || !watching || !cur?.m?.g || lan.models?.get(cur.id) !== cur.m) return; aimOf(cur); eyeFrom(cur); },
    // Returns true while spectating (the game then skips your own movement and mouse look).
    update(dt) {
      const G = g(), d = G.mode === 'arena' && G.combat?.down?.[key(name())], dead = !!d && d.until > hostNow();
      if (!dead) { cur = null; if (on) { on = false; target = null; release(); bar.hidden = true; } return false; }
      if (!on) { on = true; target = null; const l = alive(); for (let i = 0; i < l.length; i++) if (key(l[i].name) === key(d.by)) { target = l[i].id; break; } if (!target) pick(0); }
      let t = byId(target); if (!t) { pick(1); t = byId(target); }
      if (t) {
        watching = true; cur = t; watched.name = t.name; watched.key = key(t.name); eyeFrom(t);
        body.hide(t.m);
        if (view) { const pose = t.p?.pose, sh = pose?.shot, dd = G.combat?.d, k = watched.key;
          VR.key = t.id; VR.weapon = t.weapon; VR.team = dd?.teams?.[k] || null; VR.knife = G.arena?.knives?.[k] || null;
          VR.skin = t.weapon ? skinFor(G.arena, t.name, t.weapon, t.p?.bot ? pose?.own : undefined) : null;
          VR.shotN = sh?.n ?? 0; VR.shotW = sh?.w || null; VR.reloadN = sh?.r ?? 0; VR.reloadW = sh?.rw || null; VR.speed = t.m.speed || 0;
          VR.act = performance.now() < (t.m.actUntil || 0) ? t.m.act : null; VR.actUntil = t.m.actUntil || 0; view.show(VR, dt); }
      } else { cur = null; if (watching) release(); }   // (nobody left: the frozen death view — the last eye you watched from)
      if (performance.now() - barAt > 200) { barAt = performance.now();
        const left = Math.max(0, Math.ceil((d.until - hostNow()) / 1000)), next = G.combat?.d ? 'back next round' : 'respawn in ' + left;
        if (t) { const w = t.weapon ? weaponById(t.weapon) : null, hp = hpOf(G, t.name), ar = armorOf(G, t.name), a = w && isFirearm(w) ? G.combat?.ammo?.[key(t.name)]?.[w.id] : null;
          put(bar, `<small>SPECTATING</small><b>${esc(t.name)}</b><span>✚ ${hp}</span>${w ? `<span>${esc(w.name)}</span>` : ''}<small>click: next player</small><small class="k">killed by ${esc(d.by)} · ${next}</small>`);
          put(hpEl, `<div class="v hp${hp <= 20 ? ' low' : ''}"><span class="ico">✚</span><b>${hp}</b><small>HP</small></div><div class="v arm${ar.kevlar > 0 ? '' : ' none'}"><span class="ico">${ar.helmet ? '⛑' : '⛨'}</span><b>${ar.kevlar | 0}</b><small>ARMOR</small></div>`);
          put(wpEl, w ? `<div class="name">${esc(w.name)}</div>${a ? `<div class="ammo">${a[0]}<small> / ${a[1]}</small></div>` : ''}` : '');
          hud.hidden = false; }
        else { put(bar, `<small>killed by</small><b class="k">${esc(d.by)}</b><small>${next}</small>`); hud.hidden = true; }
        bar.hidden = false; }
      return true;
    },
  };
}
