// Global Defensive crosshair: the player's own look (saved on this computer, never sent over LAN), always drawn at
// the exact screen centre. Purely visual: it never changes where shots go (they leave along the screen centre).
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
    <div class="cp-row"><button data-xh-reset>Reset crosshair</button></div><p class="cp-muted">Saved on this computer for you only; other LAN players keep their own. It only changes the look: every shot goes exactly through the screen centre.</p></div>`;
}
