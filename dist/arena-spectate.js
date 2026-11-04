// Spectating while dead in the arena, CS2's way: always through a living team mate's eyes ("in-eye", first person) —
// no chase camera, no free camera, Space does nothing. Left / right click cycle through who you can watch (Defuse: your
// own team; until the round ends there, until your respawn in the respawn modes). The camera sits at their eye (their
// feet + eye height, crouch included) and looks where they look — yaw AND pitch — from the same smoothed remote motion
// the bodies use (multiplayer.js place(): m.iyaw / m.ipitch / m.iey, adaptive interpolation), so it is smooth at any
// refresh rate. Their own body (head, helmet, arms, third-person gun) and name tag are not drawn for you; their first-
// person view model is (spectate-view.js: their weapon in CS2's first-person set, kick, reload, draw on switch). A CS2-
// style HUD shows THEIR health, armour and ammo; the bar names them, who killed you and when you are back. Nobody left
// to watch: the frozen death view with the 'killed by' bar (as before). The respawn order from the host ends it.
// v53 DEATH: first, CS2's death cam (gd-deathcam.js) — the view at your death spot turned to your killer, the death panel
// over it, Space (CS2's jump) skips once its lock has passed — then the spectating above. Your own body lies where you
// died as a ragdoll (gd-ragdoll.js) for the round: selfBody(p) gives the dress (lab.js gdDress), made once per side.
// STATE MACHINE: ALIVE --down--> CAM (deathcam.update true: no target, no HUD, the bar hidden) --cam done (or no cam: a
// down record without its time)--> SPECTATE (the in-eye view of a team mate, as before) --alive--> ALIVE.
import * as THREE from './three.module.js';
import { isDown, hpOf, armorOf } from './combat-logic.js';
import { weaponById, isFirearm } from './weapons-data.js';
import { skinFor } from './skins.js';
import { hostNow } from './host-clock.js';   // (who is down until when: the host's clock)
import { createDeathCam } from './gd-deathcam.js';   // (v53 DEATH: CS2's death cam before spectating)

const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
const NO_P = [];
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

export function createSpectator({ camera, world, lan, name, boxes = () => [], view = null, scene = null, bounds = () => null, selfBody = null, motion = () => null, deathCam = true, fov = null }) {
  const css = document.createElement('style'); css.textContent = `#sp-bar{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:38;display:flex;gap:14px;align-items:center;background:#000b;border:1px solid #ffffff2a;border-radius:8px;padding:8px 18px;color:#fff;font:700 15px system-ui;text-shadow:0 1px 2px #000;pointer-events:none}#sp-bar[hidden]{display:none}#sp-bar small{font:600 12px system-ui;opacity:.75}#sp-bar b{font:800 18px system-ui}#sp-bar .k{color:#ff6a6a}
#sp-hud{position:fixed;inset:0;z-index:36;pointer-events:none;font:700 14px system-ui;color:#fff;text-shadow:0 1px 3px #000c;font-variant-numeric:tabular-nums}#sp-hud[hidden]{display:none}
#sp-hp{position:absolute;left:22px;bottom:22px;display:flex;align-items:flex-end;gap:18px}#sp-hp .v{display:flex;align-items:baseline;gap:6px}#sp-hp b{font:800 40px ui-monospace,Menlo,Consolas,monospace;letter-spacing:-.02em}#sp-hp small{font:700 11px system-ui;letter-spacing:.12em;opacity:.75}#sp-hp .ico{font:900 22px system-ui;opacity:.9}#sp-hp .low b,#sp-hp .low .ico{color:#ff4d4d}#sp-hp .none{opacity:.35}
#sp-wp{position:absolute;right:22px;bottom:18px;text-align:right}#sp-wp .name{font:800 13px system-ui;letter-spacing:.08em;color:#ffd36b}#sp-wp .ammo{font:800 40px ui-monospace,Menlo,Consolas,monospace}#sp-wp .ammo small{font:700 20px ui-monospace,Menlo,monospace;opacity:.7}`;
  (document.head || document.body).append?.(css); document.body.insertAdjacentHTML('beforeend', '<div id="sp-bar" hidden></div><div id="sp-hud" hidden><div id="sp-hp"></div><div id="sp-wp"></div></div>');
  const bar = document.getElementById('sp-bar'), hud = document.getElementById('sp-hud') || { hidden: true }, hpEl = document.getElementById('sp-hp'), wpEl = document.getElementById('sp-wp');
  const put = (el, html) => { if (el && el.__v !== html) { el.__v = html; el.innerHTML = html; } };   // (written only when it changed: no restyle 5× a second)
  let on = false, target = null, barAt = 0, wasHeld = false;
  // (v53 DEATH) the death cam, and your own body lying where you died (made once per side, hidden while you live)
  const cam = deathCam ? createDeathCam({ camera, world, lan, name, boxes, bounds, fov }) : null; let started = false;
  const sb = { key: null, m: null, dead: false, aliveFor: 0 }, sbMotion = { speed: 0, crouch: false, aim: 'rifle', dead: false, vx: 0, vy: 0, vz: 0 };
  // (v53 DEATH r2) spectating at your normal field of view (a death while scoped: lab.js's scope lerp doesn't run while dead)
  const normalFov = () => { if (!fov) return; const f = fov(); if (Number.isFinite(f) && f > 0 && Math.abs(camera.fov - f) > 1e-3) { camera.fov = f; camera.updateProjectionMatrix?.(); } };
  function selfModel() { if (!selfBody || !scene) return null; let w = null; try { w = selfBody({ name: name(), pose: { z: -300, gun: false }, bot: false }); } catch {} if (!w) return null;
    if (w.key !== sb.key) { sb.m?.dispose?.(); sb.m = null; sb.key = w.key; try { sb.m = w.make(); } catch (e) { console.warn('own body', e?.message); } if (sb.m) { sb.m.g.visible = false; sb.m.g.userData.gd = true; sb.m.setWeapon?.(null); scene.add(sb.m.g); } }   // (userData.gd: drawn in Global Defensive's world — lab.js gdKeep)
    return sb.m; }
  function selfAlive(dt) { if (sb.dead && sb.m) { sbMotion.dead = false; sb.m.update(dt, sbMotion); sb.m.g.visible = false; } sb.dead = false; if (g().mode === 'arena' && (sb.aliveFor += dt) > 1) selfModel(); }   // (made a second into the match, not at the death)
  function selfGone() { if (sb.dead && sb.m) { sbMotion.dead = false; sb.m.update(1 / 60, sbMotion); sb.m.g.visible = false; } sb.dead = false; }   // (not dead in a way that leaves a body: none shown)
  function selfDead(dt) { const m = selfModel(); if (!m) return; if (!sb.dead) { sb.dead = true; const mo = motion() || null, cr = !!mo?.crouch, ey = cr ? EYE_CROUCH : EYE_STAND; E.setFromQuaternion(camera.quaternion, 'YXZ');
      m.g.position.set(camera.position.x, camera.position.y - ey, camera.position.z); m.g.rotation.set(0, E.y, 0); sbMotion.dead = false; sbMotion.crouch = cr; sbMotion.speed = 0; m.update(.5, sbMotion); m.update(.5, sbMotion);   // (stood as you stood, then down)
      sbMotion.vx = mo?.vx || 0; sbMotion.vy = mo?.vy || 0; sbMotion.vz = mo?.vz || 0; m.g.visible = true; }
    sbMotion.dead = true; m.update(dt, sbMotion); }
  // Who you watch, for the radar (GDUI-06) and the name tags (lab.js): their eye and the way they face. One reused
  // record; null while nobody is watched.
  const watched = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, name: '', key: '' }; let watching = false;
  const body = createBodyHider();
  // What the first-person view needs from them this frame (spectate-view.js), refilled.
  const skinFor_ = { id: null, w: null, at: -1e9 };
  const VR = { key: null, weapon: null, team: null, knife: null, skin: null, gloves: null, shotN: 0, shotW: null, reloadN: 0, reloadW: null, speed: 0, act: null, actUntil: 0 };
  const g = () => world.operations.game;
  let nameSeen = null, nameKey = '';   // (v53 DEATH final: your key made again only when your name changes — no string made per frame)
  const myKey = () => { const n = name(); if (n !== nameSeen) { nameSeen = n; nameKey = key(n); } return nameKey; };
  // Everyone you can watch: reused records in a reused list (asked every frame while dead: nothing made per frame).
  const list = [], pool = [];
  // (v53 DEATH final, allocation: the models walked with one callback made here — a for…of over the Map made an entry
  // array per model per frame — and each model's name key kept on it, made again only when its name changes)
  const AL = { dd: null, mine: null, down: null, now: 0, P: null };
  const keyOfModel = m => { if (m.__gdKn !== m.name) { m.__gdKn = m.name; m.__gdK = key(m.name); } return m.__gdK; };
  const visit = (m, id) => { const mk = watchable(m) ? keyOfModel(m) : null; if (mk === null || (AL.down?.[mk]?.until || 0) > AL.now || (AL.dd && AL.dd.teams[mk] !== AL.mine)) return;   // (isDown, read straight off the record)
    const P = AL.P; let p = null; for (let i = 0; i < P.length; i++) if (P[i].id === id) { p = P[i]; break; }
    const o = pool[list.length] ??= {}; o.id = id; o.name = m.name; o.key = mk; o.m = m; o.p = p; o.pos = m.g.position; aimOf(o); list.push(o); };
  function alive() {
    const G = g(); AL.dd = G.combat?.d || null; AL.mine = AL.dd?.teams?.[myKey()]; AL.down = G.combat?.down || null; AL.now = hostNow(); AL.P = lan.players || NO_P;   // defuse: only your own team (CS2)
    list.length = 0; lan.models?.forEach?.(visit); return list;
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
    next() { if (!cam?.on) pick(1); }, prev() { if (!cam?.on) pick(-1); },
    // CS2's skip of the death cam (its jump key): true when it took. The cam's state for the HUD / panel: camOn.
    skip() { return !!cam?.skip(); }, get camOn() { return !!cam?.on; }, get selfBody() { return sb.m; },
    // After the remote bodies are placed for this frame (lab.js, after lan.update): the eye camera from where they are drawn
    // NOW. update() runs before that placing, so on its own the camera showed the previous frame's look — one frame late,
    // which turned every long frame into a stall then a jump (seen at 144 Hz: a 45 ms frame drew ~7 ms of turn, the next
    // one ~50 ms). Nothing allocated.
    follow() { if (cam?.on) { cam.follow(); return; } if (!on || !watching || !cur?.m?.g || lan.models?.get(cur.id) !== cur.m) return; aimOf(cur); eyeFrom(cur); },
    // Returns true while spectating (the game then skips your own movement and mouse look).
    update(dt) {
      const G = g(), d = G.mode === 'arena' && G.combat?.down?.[myKey()], dead = !!d && d.until > hostNow();
      if (!dead) { cur = null; cam?.update(dt); selfAlive(dt); if (on) { on = false; started = false; target = null; release(); bar.hidden = true; } return false; }
      // (v53 DEATH final) your own body only for a real death: one with its time (combat-logic.js hurt). A spectator's
      // record ('spectating') or a mid-round joiner's ('joined mid-round') has none — no body of yourself for them.
      if (G.mode === 'arena') { if (Number.isFinite(d.at) && G.combat?.d?.teams?.[myKey()] !== 'spec') selfDead(dt); else selfGone(); }
      if (cam?.update(dt)) { on = true; cur = null; if (watching) release(); if (!bar.hidden) bar.hidden = true; return true; }   // (v53 DEATH: the death cam first)
      if (!started) { started = true; on = true; target = null; normalFov(); const l = alive(); for (let i = 0; i < l.length; i++) if (key(l[i].name) === key(d.by)) { target = l[i].id; break; } if (!target) pick(0); }
      let t = byId(target); if (!t) { pick(1); t = byId(target); }
      if (t) {
        watching = true; cur = t; watched.name = t.name; watched.key = t.key; eyeFrom(t);
        body.hide(t.m);
        if (view) { const pose = t.p?.pose, sh = pose?.shot, dd = G.combat?.d, k = watched.key;
          VR.key = t.id; VR.weapon = t.weapon; VR.team = dd?.teams?.[k] || null; VR.knife = G.arena?.knives?.[k] || null;
          if (VR.key !== skinFor_.id || VR.weapon !== skinFor_.w || performance.now() - skinFor_.at > 250) { skinFor_.id = VR.key; skinFor_.w = VR.weapon; skinFor_.at = performance.now();   // (looked up when who or what changes, else 4× a second: skins.js makes keys as it looks)
            VR.skin = t.weapon ? skinFor(G.arena, t.name, t.weapon, t.p?.bot ? pose?.own : undefined) : null; VR.gloves = t.p?.bot ? null : G.arena?.skins?.[k]?.gloves || null; }   // (their CS2 gloves: the room's skins record — a bot wears its agent's own)
          VR.shotN = sh?.n ?? 0; VR.shotW = sh?.w || null; VR.reloadN = sh?.rs ?? sh?.r ?? 0; VR.reloadW = Number.isInteger(sh?.rs) ? null : sh?.rw || null;   /* (v53 RELOAD: a reload seen from its start — the numbered start rs, with the gun in hand — not from its mag-in) */ VR.speed = t.m.speed || 0;
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
