// Emote wheel and the local player's emote state.
//  · Walking: scroll the mouse wheel → the wheel opens and each notch moves the highlight
//    (1–6 jump straight to an emote); left click plays it; right click / Esc / 6 s idle closes it.
//  · The emote goes out in the LAN pose ({ id, n }), so every other engineer's copy of your avatar
//    plays it; moving cancels it (sent as a new n with no id).
//  · You see yourself in a small corner preview while the wheel is open or an emote plays.
import * as THREE from './three.module.js';
import { EMOTES, createAvatar } from './avatar.js';

export function createEmotes({ canEmote = () => true, color = () => 0x6bd9ff, face = () => 'cute', skin = () => 'yellow', laptop = () => false, notify = () => {}, hat, outfit } = {}) {
  let index = 0, open = false, idleAt = 0, seq = 0, current = null, startedAt = 0, showSelf = false;
  // ---- wheel DOM ----
  const wheel = document.createElement('div'); wheel.id = 'emote-wheel'; wheel.hidden = true; wheel.setAttribute('role', 'menu'); wheel.setAttribute('aria-label', 'Emotes');
  const icons = { salute: '🫡', wave: '👋', wait: '✋', shrug: '🤷', panic: '😱', dead: '💀' };
  wheel.innerHTML = `<div class="ew-center"><b id="ew-name"></b><small>Scroll to choose · click to play</small></div>` + EMOTES.map((e, i) => { const a = -Math.PI / 2 + i * Math.PI * 2 / EMOTES.length; return `<button type="button" class="ew-item" data-emote="${i}" role="menuitem" style="left:${50 + Math.cos(a) * 38}%;top:${50 + Math.sin(a) * 38}%"><span class="ew-icon">${icons[e.id]}</span><span class="ew-label">${e.key} · ${e.label}</span></button>`; }).join('');
  document.body.append(wheel);
  const previewTag = document.createElement('div'); previewTag.id = 'emote-preview-tag'; previewTag.hidden = true; document.body.append(previewTag);
  const style = document.createElement('style');
  style.textContent = `#emote-wheel{position:fixed;left:50%;top:50%;width:min(440px,86vw);aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(8,20,30,.55) 0 30%,rgba(8,20,30,.82) 31% 70%,rgba(8,20,30,0) 71%);z-index:40;pointer-events:auto;font-family:system-ui,sans-serif}
#emote-wheel .ew-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;color:#e8f6ff;width:40%}#emote-wheel .ew-center b{display:block;font-size:20px;margin-bottom:4px}#emote-wheel .ew-center small{opacity:.75;font-size:11px}
#emote-wheel .ew-item{position:absolute;transform:translate(-50%,-50%);width:108px;height:84px;border-radius:18px;border:2px solid rgba(255,255,255,.18);background:rgba(20,40,55,.9);color:#e8f6ff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;transition:transform .08s,background .08s}
#emote-wheel .ew-item .ew-icon{font-size:30px;line-height:1}#emote-wheel .ew-item .ew-label{font-size:11px;white-space:nowrap}
#emote-wheel .ew-item.on{background:#f6c431;color:#1b2233;border-color:#fff;transform:translate(-50%,-50%) scale(1.12)}
#emote-preview-tag{position:fixed;right:16px;bottom:330px;width:200px;text-align:center;color:#e8f6ff;font:600 12px system-ui,sans-serif;text-shadow:0 1px 2px #000;z-index:39;pointer-events:none}`;
  (document.head || document.body).append(style);
  const items = [...(wheel.querySelectorAll?.('.ew-item') || [])];
  const draw = () => { items.forEach((b, i) => b.classList?.toggle('on', i === index)); const n = wheel.querySelector?.('#ew-name'); if (n) n.textContent = EMOTES[index].label; };
  // The wheel always opens on Salute; further notches move the highlight.
  function show() { if (!canEmote()) return false; open = true; index = 0; wheel.hidden = false; idleAt = performance.now(); draw(); return true; }
  function hide() { open = false; wheel.hidden = true; }
  function play(id) {
    const e = EMOTES.find(x => x.id === id); if (!e) return;
    current = e.id; startedAt = performance.now(); seq++; self.play(e.id); hide(); notify(e.label);
  }
  function cancel() { if (!current) return; current = null; seq++; self.play(null); }
  items.forEach((b, i) => { b.onpointerenter = () => { index = i; draw(); }; b.onclick = e => { e.stopPropagation(); play(EMOTES[i].id); }; });
  // Mouse wheel: open / move the highlight (walk mode only, never while a panel is open).
  // A scroll over a menu, the laptop or any other panel scrolls that panel: only a scroll over the 3D
  // view itself (or with the mouse captured by the game) opens the wheel.
  const overWorld = e => !!document.pointerLockElement || e.target?.tagName === 'CANVAS' || e.target === document.body || e.target === document.documentElement;
  addEventListener('wheel', e => {
    if (!open) { if (overWorld(e) && show()) e.preventDefault(); return; }
    if (!canEmote()) { hide(); return; }
    e.preventDefault(); idleAt = performance.now();
    if (Math.abs(e.deltaY) < 2) return;
    index = (index + (e.deltaY > 0 ? 1 : -1) + EMOTES.length) % EMOTES.length; draw();
  }, { passive: false });
  // Click to play (captured before the walk-mode click handlers); right click closes.
  const capture = e => { if (!open) return; if (e.target?.closest?.('#emote-wheel .ew-item')) return; e.preventDefault(); e.stopImmediatePropagation(); if (e.type === 'pointerdown') { if (e.button === 0) play(EMOTES[index].id); else hide(); } };
  for (const t of ['pointerdown', 'pointerup', 'click', 'mousedown', 'mouseup']) addEventListener(t, capture, true);
  addEventListener('contextmenu', e => { if (open) { e.preventDefault(); hide(); } }, true);
  addEventListener('keydown', e => {
    if (!open) return; const k = e.key.toLowerCase();
    if (k === 'escape') { e.preventDefault(); e.stopImmediatePropagation(); hide(); return; }
    const hit = EMOTES.findIndex(x => x.key === k); if (hit >= 0) { e.preventDefault(); e.stopImmediatePropagation(); play(EMOTES[hit].id); }
    if (k === 'enter') { e.preventDefault(); e.stopImmediatePropagation(); play(EMOTES[index].id); }
  }, true);

  // ---- self preview (separate tiny scene, drawn in a corner only while needed) ----
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 200 / 240, .1, 100);
  scene.add(new THREE.HemisphereLight(0xdff3ff, 0x2a3440, 2.2)); const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(4, 10, 8); scene.add(key);
  let selfColor = color(); const look = () => ({ color: selfColor, face: face(), skin: skin(), hat: hat?.() || 'cap', outfit: outfit?.() || 'bands' }); let self = createAvatar(look()); scene.add(self.g);
  cam.position.set(0, 6.4, -21); cam.lookAt(0, 5.6, 0);
  const size = new THREE.Vector2(), clear = new THREE.Color();
  return {
    get open() { return open; }, get current() { return current; }, show, hide, play, cancel,
    // Called every frame by the lab: advances the local emote, cancels it when you walk away.
    update(dt, { moving = false } = {}) {
      if (open && (performance.now() - idleAt > 6000 || !canEmote())) hide();
      if (current && moving && current !== 'dead' && performance.now() - startedAt > 250) cancel();
      if (color() !== selfColor || skin() !== self.skin || (hat?.() || 'cap') !== self.hat || (outfit?.() || 'bands') !== self.outfit) { selfColor = color(); const p = self.emote; self.dispose(); self = createAvatar(look()); scene.add(self.g); if (p) self.play(p); }
      if (self.style !== face()) self.setStyle(face());
      self.update(dt, { laptop: laptop() });
      if (current && !self.emote) current = null;
    },
    // What goes into the LAN pose.
    pose() { return { emote: { id: current, n: seq }, face: face(), skin: skin(), hat: hat?.() || 'cap', outfit: outfit?.() || 'bands' }; },
    // Show your avatar in the corner (while choosing/playing an emote, or while picking a face).
    showSelf(v) { showSelf = !!v; },
    get previewVisible() { return open || !!current || showSelf; },
    renderPreview(renderer) {
      const visible = open || !!current || showSelf; previewTag.hidden = !visible; if (!visible) return;
      previewTag.textContent = 'YOU · ' + (current ? EMOTES.find(e => e.id === current).label : open ? EMOTES[index].label : 'your face');
      renderer.getSize(size); const w = 200, h = 240, x = size.x - w - 16, y = 84;
      const alpha = renderer.getClearAlpha(); renderer.getClearColor(clear); const auto = renderer.autoClear, info = renderer.info.autoReset;
      renderer.info.autoReset = false; renderer.autoClear = false;
      renderer.setScissorTest(true); renderer.setScissor(x, y, w, h); renderer.setViewport(x, y, w, h);
      renderer.setClearColor(0x0b1a24, .88); renderer.clear(true, true, false); renderer.render(scene, cam);
      renderer.setScissorTest(false); renderer.setViewport(0, 0, size.x, size.y); renderer.setClearColor(clear, alpha); renderer.autoClear = auto; renderer.info.autoReset = info;
    },
  };
}
