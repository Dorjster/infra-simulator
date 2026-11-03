// Global Defensive crosshair: the player's own look (saved on this computer, never sent over LAN), always drawn at
// the exact screen centre. Purely visual: it never changes where shots go (they leave along your aim, with the gun's
// recoil and CS2 inaccuracy; Dynamic opens the gap with that inaccuracy).
// Settings → Crosshair edits it with a live preview.
const KEY = 'gd-crosshair';
export const CROSSHAIR_DEFAULT = { style: 'classic', size: 7, thickness: 2, gap: 4, outline: true, outlineWidth: 1, color: '#7dff8e', opacity: 1, dot: true, dynamic: true };
export const CROSSHAIR_STYLES = [['classic', 'Classic (4 lines)'], ['tshape', 'T-shape (no top)'], ['dot', 'Dot only'], ['circle', 'Circle'], ['cross', 'Cross (no gap)']];
export function loadCrosshair() { try { return { ...CROSSHAIR_DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...CROSSHAIR_DEFAULT }; } }
export function saveCrosshair(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch {} globalThis.dispatchEvent?.(new CustomEvent('gd-crosshair', { detail: c })); }
// HTML for the crosshair centred in its box (left/top 50 %), with an extra gap (dynamic spread, px).
export function crosshairHTML(c, extraGap = 0) {
  const s = Math.max(1, +c.size), t = Math.max(1, +c.thickness), g = Math.max(0, +c.gap) + (c.dynamic ? extraGap : 0), ow = c.outline ? Math.max(1, +c.outlineWidth) : 0;
  const sh = ow ? `box-shadow:0 0 0 ${ow}px rgba(0,0,0,.85);` : '', base = `position:absolute;background:${c.color};${sh}`;
  const bar = (x, y, w, h) => `<i style="${base}left:${x}px;top:${y}px;width:${w}px;height:${h}px"></i>`, out = [];
  if (c.style === 'classic' || c.style === 'tshape' || c.style === 'cross') { const gg = c.style === 'cross' ? 0 : g;
    if (c.style !== 'tshape') out.push(bar(-t / 2, -gg - s, t, s)); out.push(bar(-t / 2, gg, t, s), bar(-gg - s, -t / 2, s, t), bar(gg, -t / 2, s, t)); }
  if (c.style === 'circle') { const r = s + g; out.push(`<i style="position:absolute;left:${-r}px;top:${-r}px;width:${r * 2}px;height:${r * 2}px;border-radius:50%;border:${t}px solid ${c.color};box-sizing:border-box;${ow ? `outline:${ow}px solid rgba(0,0,0,.6);` : ''}"></i>`); }
  if (c.dot || c.style === 'dot') { const d = Math.max(2, t + (c.style === 'dot' ? 2 : 0)); out.push(bar(-d / 2, -d / 2, d, d)); }
  return `<div style="position:absolute;left:50%;top:50%;width:0;height:0;opacity:${c.opacity}">${out.join('')}</div>`;
}
// Settings section: controls + live preview. `onChange` re-renders the panel.
export function crosshairEditorHTML(c) {
  const opt = (k, v, t) => `<option value="${v}" ${c[k] === v ? 'selected' : ''}>${t}</option>`, rng = (k, label, min, max, step = 1) => `<label>${label} · ${c[k]}<input data-xh="${k}" type="range" min="${min}" max="${max}" step="${step}" value="${c[k]}"></label>`;
  return `<h3>Crosshair (Global Defensive)</h3><div class="xh-edit"><div class="set-grid">
    <label>Style<select data-xh="style">${CROSSHAIR_STYLES.map(([v, t]) => opt('style', v, t)).join('')}</select></label>${rng('size', 'Size', 1, 20)}${rng('thickness', 'Thickness', 1, 6)}${rng('gap', 'Gap', 0, 14)}
    <label>Colour<input data-xh="color" type="color" value="${c.color}"></label>${rng('opacity', 'Opacity', .2, 1, .05)}${rng('outlineWidth', 'Outline width', 1, 3)}
    <label class="chk"><input type="checkbox" data-xh="outline" ${c.outline ? 'checked' : ''}> Outline</label><label class="chk"><input type="checkbox" data-xh="dot" ${c.dot ? 'checked' : ''}> Centre dot</label><label class="chk"><input type="checkbox" data-xh="dynamic" ${c.dynamic ? 'checked' : ''}> Dynamic (opens when moving)</label></div>
    <div class="xh-preview" style="position:relative;height:120px;border-radius:8px;margin:8px 0;background:linear-gradient(135deg,#7a8c9c,#c9b48a 60%,#3d4a33)">${crosshairHTML(c)}</div>
    <div class="cp-row"><button data-xh-reset>Reset crosshair</button></div><p class="cp-muted">Saved on this computer for you only; other LAN players keep their own. It only changes the look: shots go where you aim, with the gun's recoil and inaccuracy (Dynamic shows it).</p></div>`;
}

// ── (v53 S3, spec 2.2) The hit marker: a brief white X round the crosshair on every hit the host confirmed, red-tinted
// for a kill, with an extra outer tick on each arm for a headshot. One node set built once; a hit only switches its
// class to one of a table of prebuilt strings (two animation names per look, so a hit restarts it without a reflow) —
// opacity / transform animations only, no allocation per hit. ──
export const HIT_MARKER_CSS = `
.gd-hm{position:absolute;left:50%;top:50%;width:0;height:0;opacity:0;pointer-events:none}
.gd-hm i{position:absolute;left:-1px;top:-1px;width:2px;height:7px;background:#fff;box-shadow:0 0 1px #000,0 0 2px #000a;transform-origin:1px 1px}
.gd-hm .x1{transform:rotate(45deg) translateY(6px)}.gd-hm .x2{transform:rotate(135deg) translateY(6px)}.gd-hm .x3{transform:rotate(225deg) translateY(6px)}.gd-hm .x4{transform:rotate(315deg) translateY(6px)}
.gd-hm .t1{transform:rotate(45deg) translateY(15px);height:3px}.gd-hm .t2{transform:rotate(135deg) translateY(15px);height:3px}.gd-hm .t3{transform:rotate(225deg) translateY(15px);height:3px}.gd-hm .t4{transform:rotate(315deg) translateY(15px);height:3px}
.gd-hm .t1,.gd-hm .t2,.gd-hm .t3,.gd-hm .t4{display:none}.gd-hm.h .t1,.gd-hm.h .t2,.gd-hm.h .t3,.gd-hm.h .t4{display:block}
.gd-hm.k i{background:#ff3b30}
.gd-hm.a{animation:gd-hm0 180ms ease-out both}.gd-hm.b{animation:gd-hm1 180ms ease-out both}.gd-hm.k.a{animation:gd-hmk0 480ms ease-out both}.gd-hm.k.b{animation:gd-hmk1 480ms ease-out both}
@keyframes gd-hm0{0%{opacity:1;transform:scale(1.25)}35%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1)}}@keyframes gd-hm1{0%{opacity:1;transform:scale(1.25)}35%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1)}}
@keyframes gd-hmk0{0%{opacity:1;transform:scale(1.35)}25%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.05)}}@keyframes gd-hmk1{0%{opacity:1;transform:scale(1.35)}25%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.05)}}`;
export const HIT_MARKER_CLASS = [];   // [(kill * 2 + head) * 2 + parity]
for (const k of [0, 1]) for (const h of [0, 1]) for (const p of [0, 1]) HIT_MARKER_CLASS.push('gd-hm' + (k ? ' k' : '') + (h ? ' h' : '') + (p ? ' b' : ' a'));
export function createHitMarker(parent, doc = globalThis.document) {
  const el = doc.createElement('div'); el.className = 'gd-hm'; el.innerHTML = '<i class="x1"></i><i class="x2"></i><i class="x3"></i><i class="x4"></i><i class="t1"></i><i class="t2"></i><i class="t3"></i><i class="t4"></i>';
  if (doc.getElementById && !doc.getElementById('gd-hm-css')) { const css = doc.createElement('style'); css.id = 'gd-hm-css'; css.textContent = HIT_MARKER_CSS; (doc.head || doc.body).append?.(css); }
  parent?.append?.(el); let par = 0;
  return { el, show(kill, head) { par ^= 1; el.className = HIT_MARKER_CLASS[((kill ? 2 : 0) + (head ? 1 : 0)) * 2 + par]; } };
}
