// Spectating while dead in the arena (CS2): the camera follows your killer, left / right click cycles through
// everyone alive, Space switches between their eyes (first person) and a chase camera behind them. A bar shows
// who you watch, their HP and gun, and the respawn countdown. The respawn order from the host ends it.
import * as THREE from './three.module.js';
import { isDown, hpOf } from './combat-logic.js';
import { weaponById } from './weapons-data.js';
import { lineOfSight } from './arena-maps.js';

const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export function createSpectator({ camera, world, lan, name, boxes = () => [] }) {
  const css = document.createElement('style'); css.textContent = `#sp-bar{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:38;display:flex;gap:14px;align-items:center;background:#000b;border:1px solid #ffffff2a;border-radius:8px;padding:8px 18px;color:#fff;font:700 15px system-ui;text-shadow:0 1px 2px #000;pointer-events:none}#sp-bar[hidden]{display:none}#sp-bar small{font:600 12px system-ui;opacity:.75}#sp-bar b{font:800 18px system-ui}#sp-bar .k{color:#ff6a6a}`;
  (document.head || document.body).append?.(css); document.body.insertAdjacentHTML('beforeend', '<div id="sp-bar" hidden></div>');
  const bar = document.getElementById('sp-bar');
  let on = false, target = null, first = false, barAt = 0; const want = new THREE.Vector3(), look = new THREE.Vector3(), lookNow = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  const g = () => world.operations.game;
  // Everyone alive you can watch: [{ id, name, pos, yaw, pitch, weapon }].
  function alive() {
    const out = []; for (const [id, m] of lan.models || []) { if (!m?.g?.visible || isDown(g(), m.name)) continue; const p = lan.players?.find(x => x.id === id);
      out.push({ id, name: m.name, pos: m.g.position, yaw: p?.pose?.yaw ?? m.g.rotation.y, pitch: +p?.pose?.shot?.pitch || 0, weapon: p?.pose?.weapon || null, crouched: !!p?.pose?.crouched }); }
    return out;
  }
  function pick(step) { const list = alive(); if (!list.length) { target = null; return; } const i = list.findIndex(x => x.id === target); target = list[((i < 0 ? 0 : i + step) % list.length + list.length) % list.length].id; }
  return {
    get on() { return on; },
    next() { pick(1); }, prev() { pick(-1); }, toggle() { first = !first; },
    // Returns true while spectating (the game then skips your own movement and mouse look).
    update(dt) {
      const G = g(), d = G.mode === 'arena' && G.combat?.down?.[key(name())], dead = !!d && d.until > Date.now();
      if (!dead) { if (on) { on = false; bar.hidden = true; } return false; }
      if (!on) { on = true; first = false; target = null; const killer = alive().find(x => key(x.name) === key(d.by)); target = killer?.id ?? null; if (!target) pick(0); lookNow.copy(camera.position).add(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)); }
      let t = alive().find(x => x.id === target); if (!t) { pick(1); t = alive().find(x => x.id === target); }
      if (t) {
        const eye = t.crouched ? 5.9 : 9.7, fx = -Math.sin(t.yaw), fz = -Math.cos(t.yaw);
        if (first) { want.set(t.pos.x, t.pos.y + eye, t.pos.z); look.set(t.pos.x + fx * 10, t.pos.y + eye + Math.tan(t.pitch) * 10, t.pos.z + fz * 10); }
        else { // chase camera behind them, pulled in if a wall is in the way
          let dist = 11; while (dist > 3 && !lineOfSight(boxes(), t.pos.x, t.pos.z, t.pos.x - fx * dist, t.pos.z - fz * dist, t.pos.y + 11)) dist -= 1.5;
          want.set(t.pos.x - fx * dist, t.pos.y + 11.5, t.pos.z - fz * dist); look.set(t.pos.x + fx * 4, t.pos.y + 7.5, t.pos.z + fz * 4); }
        const k = 1 - Math.exp(-dt * (first ? 25 : 8)); camera.position.lerp(want, k); lookNow.lerp(look, k);
        m4.lookAt(camera.position, lookNow, camera.up); q.setFromRotationMatrix(m4); camera.quaternion.copy(q);
      }
      if (performance.now() - barAt > 200) { barAt = performance.now();
        const w = t?.weapon ? weaponById(t.weapon)?.name : null, left = Math.max(0, Math.ceil((d.until - Date.now()) / 1000));
        bar.hidden = false; bar.innerHTML = t ? `<small>SPECTATING</small><b>${esc(t.name)}</b><span>✚ ${hpOf(G, t.name)}</span>${w ? `<span>${esc(w)}</span>` : ''}<small>click: next · Space: ${first ? 'chase cam' : 'their eyes'}</small><small class="k">killed by ${esc(d.by)} · respawn in ${left}</small>`
          : `<small>killed by</small><b class="k">${esc(d.by)}</b><small>respawn in ${left}</small>`; }
      return true;
    },
  };
}
