// "Choose your face" screen. Opens the first time you walk into the facility (and from the Face
// button any time). The choice is remembered in this browser and travels in the LAN pose, so every
// other engineer sees your avatar with the face you picked.
import { FACES, SKINS, HATS, OUTFITS, faceCanvas } from './avatar.js';
import { cleanName } from './play-rules.js';

const KEY = 'infra-face', SKIN_KEY = 'infra-skin', NAME_KEY = 'infra-name', HAT_KEY = 'infra-hat', OUTFIT_KEY = 'infra-outfit';
export function createFacePicker({ onPick = () => {} } = {}) {
  let name = 'Engineer', face = 'cute', skin = 'yellow', hat = 'cap', outfit = 'bands', chosen = false, open = false, pending = 'cute', pendingSkin = 'yellow', pendingHat = 'cap', pendingOutfit = 'bands';
  try { const v = localStorage.getItem(KEY), k = localStorage.getItem(SKIN_KEY); if (FACES.some(f => f.id === v)) { face = pending = v; chosen = true; } if (SKINS[k]) skin = pendingSkin = k; const n = localStorage.getItem(NAME_KEY); if (n) name = cleanName(n); const h = localStorage.getItem(HAT_KEY), o = localStorage.getItem(OUTFIT_KEY); if (HATS.some(x => x.id === h)) hat = pendingHat = h; if (OUTFITS.some(x => x.id === o)) outfit = pendingOutfit = o; } catch { /* storage blocked */ }
  const el = document.createElement('section'); el.id = 'face-picker'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Choose your face');
  el.innerHTML = `<div class="fp-card"><h2>Choose your engineer</h2><p>Other engineers on the LAN see your name, face, headwear and jacket. Change them later with the <b>Face</b> button.</p><label class="fp-name">Your name <input id="fp-name" maxlength="20" autocomplete="nickname" placeholder="Engineer"></label><div class="fp-grid">${FACES.map(f => `<button type="button" class="fp-face" data-face="${f.id}"><canvas width="160" height="160"></canvas><span>${f.label}</span></button>`).join('')}</div><h3>Head colour</h3><div class="fp-skins">${Object.entries(SKINS).map(([id, c]) => `<button type="button" class="fp-skin" data-skin="${id}" title="${id}" aria-label="${id} head" style="background:${c[2]}"></button>`).join('')}</div><h3>Headwear</h3><div class="fp-chips">${HATS.map(h => `<button type="button" class="fp-chip" data-hat="${h.id}">${h.label}</button>`).join('')}</div><h3>Jacket</h3><div class="fp-chips">${OUTFITS.map(o => `<button type="button" class="fp-chip" data-outfit="${o.id}">${o.label}</button>`).join('')}</div><p class="fp-note">Your jacket takes your team colour. Headwear and jacket style help teammates tell engineers apart without relying on colour.</p><button type="button" id="fp-play" class="fp-play">Play</button></div>`;
  const button = document.createElement('button'); button.id = 'face-button'; button.type = 'button'; button.textContent = '🙂 Face'; button.title = 'Change your name, face and head colour';
  const style = document.createElement('style');
  style.textContent = `#face-picker{position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:rgba(4,12,18,.72);font-family:system-ui,sans-serif}#face-picker[hidden]{display:none}
#face-picker .fp-card{background:#10222e;border:1px solid #2b4a5c;border-radius:18px;padding:22px 24px;max-width:min(640px,92vw);color:#e8f6ff;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5)}
#face-picker h2{margin:0 0 6px;font-size:22px}#face-picker p{margin:0 0 16px;opacity:.8;font-size:13px}
#face-picker .fp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
#face-picker .fp-face{background:#173344;border:2px solid transparent;border-radius:14px;padding:10px 6px 8px;color:#e8f6ff;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;font-size:14px}
#face-picker .fp-face canvas{width:96px;height:96px}#face-picker .fp-face.on{border-color:#f6c431;background:#23455a}#face-picker .fp-face:hover{background:#1f3e51}
#face-picker h3{margin:16px 0 8px;font-size:14px;opacity:.85}#face-picker .fp-skins{display:flex;gap:10px;justify-content:center}#face-picker .fp-skin{width:36px;height:36px;border-radius:50%;border:3px solid #10222e;box-shadow:0 0 0 2px #2b4a5c;cursor:pointer}#face-picker .fp-skin.on{box-shadow:0 0 0 3px #fff}
#face-picker .fp-name{display:flex;gap:10px;align-items:center;justify-content:center;margin:0 0 14px;font-size:14px}#face-picker .fp-name input{width:220px;padding:8px 10px;border-radius:8px;border:1px solid #2b4a5c;background:#0b1a24;color:#e8f6ff;font-size:15px}
#face-picker .fp-chips{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}#face-picker .fp-chip{background:#173344;border:2px solid transparent;border-radius:20px;padding:6px 12px;color:#e8f6ff;cursor:pointer;font-size:13px}#face-picker .fp-chip.on{border-color:#f6c431;background:#23455a}#face-picker .fp-note{margin:10px 0 0;font-size:12px}
#face-picker .fp-play{margin-top:16px;background:#f6c431;color:#1b2233;border:0;border-radius:10px;padding:10px 22px;font-weight:700;font-size:15px;cursor:pointer}
#face-button{position:fixed;top:64px;right:20px;z-index:30;background:#10222e;color:#e8f6ff;border:1px solid #2b4a5c;border-radius:8px;padding:6px 10px;font:600 13px system-ui,sans-serif;cursor:pointer}`;
  (document.head || document.body).append(style); document.body.append(el, button);
  const cards = [...(el.querySelectorAll?.('.fp-face') || [])], swatches = [...(el.querySelectorAll?.('.fp-skin') || [])], hatChips = [...(el.querySelectorAll?.('[data-hat]') || [])], outfitChips = [...(el.querySelectorAll?.('[data-outfit]') || [])];
  for (const b of hatChips) b.onclick = () => { pendingHat = b.dataset.hat; draw(); };
  for (const b of outfitChips) b.onclick = () => { pendingOutfit = b.dataset.outfit; draw(); };
  const faceArt = new Map(FACES.map(f => [f.id, faceCanvas(f.id, 'idle')]));
  // Thumbnails: the real face drawing on a head in the chosen colour.
  const paint = () => { for (const b of cards) { try { const c = b.querySelector('canvas'), g = c.getContext('2d'); g.clearRect(0, 0, 160, 160); g.fillStyle = SKINS[pendingSkin][2]; g.beginPath(); g.arc(80, 80, 76, 0, Math.PI * 2); g.fill(); const shade = g.createRadialGradient(60, 50, 10, 80, 80, 80); shade.addColorStop(0, 'rgba(255,255,255,.35)'); shade.addColorStop(1, 'rgba(0,0,0,.18)'); g.fillStyle = shade; g.fill(); g.drawImage(faceArt.get(b.dataset.face), 4, 30, 152, 114); } catch { /* headless canvas stub */ } } };
  for (const b of cards) b.onclick = () => { pending = b.dataset.face; draw(); };
  for (const b of swatches) b.onclick = () => { pendingSkin = b.dataset.skin; draw(); paint(); };
  const draw = () => { cards.forEach(b => b.classList?.toggle('on', b.dataset.face === pending)); swatches.forEach(b => b.classList?.toggle('on', b.dataset.skin === pendingSkin)); hatChips.forEach(b => b.classList?.toggle('on', b.dataset.hat === pendingHat)); outfitChips.forEach(b => b.classList?.toggle('on', b.dataset.outfit === pendingOutfit)); };
  paint();
  const play = el.querySelector?.('#fp-play'); if (play) play.onclick = () => pick(pending, pendingSkin, nameInput?.value);
  const nameInput = el.querySelector?.('#fp-name');
  function pick(id, k = pendingSkin, n = nameInput?.value || name) { if (!FACES.some(f => f.id === id)) return; face = id; if (SKINS[k]) skin = k; hat = pendingHat; outfit = pendingOutfit; name = cleanName(n); chosen = true; try { localStorage.setItem(KEY, face); localStorage.setItem(SKIN_KEY, skin); localStorage.setItem(NAME_KEY, name); localStorage.setItem(HAT_KEY, hat); localStorage.setItem(OUTFIT_KEY, outfit); } catch { /* storage blocked */ } hide(); button.textContent = '🙂 ' + name; onPick(face, skin, name); }
  function show(initialName) { if (initialName && name === 'Engineer') name = cleanName(initialName); if (nameInput) nameInput.value = name; pending = face; pendingSkin = skin; pendingHat = hat; pendingOutfit = outfit; draw(); paint(); open = true; el.hidden = false; if (document.pointerLockElement) document.exitPointerLock?.(); }
  function hide() { open = false; el.hidden = true; }
  button.onclick = () => (open ? hide() : show());
  button.textContent = '🙂 ' + (chosen ? name : 'Face');
  addEventListener('keydown', e => { if (!open) return; if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); pick(pending, pendingSkin, nameInput?.value); } else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); pick(pending, pendingSkin, nameInput?.value); } else e.stopImmediatePropagation(); }, true);
  return { show, hide, pick, get name() { return name; }, get face() { return face; }, get skin() { return skin; }, get hat() { return hat; }, get outfit() { return outfit; }, get chosen() { return chosen; }, get isOpen() { return open; } };
}
