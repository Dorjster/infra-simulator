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
// (v53 PERF4X) gapVar: the dynamic gap read from the box's CSS variable --xg instead of baked in (the HUD sets that one
// property as the gap moves — no new nodes, no HTML parsed while firing; the same pixels as extraGap = --xg). Default off.
export function crosshairHTML(c, extraGap = 0, gapVar = false) {
  const dv = gapVar && !!c.dynamic, s = Math.max(1, +c.size), t = Math.max(1, +c.thickness), g = Math.max(0, +c.gap) + (c.dynamic && !dv ? extraGap : 0), ow = c.outline ? Math.max(1, +c.outlineWidth) : 0;
  const sh = ow ? `box-shadow:0 0 0 ${ow}px rgba(0,0,0,.85);` : '', base = `position:absolute;background:${c.color};${sh}`;
  // (gapVar: an arm's offset that grows with the gap — "+" away from the centre on the far side, "−" on the near side)
  const at = (v, k) => dv && k ? `calc(${v}px ${k > 0 ? '+' : '-'} var(--xg, 0px))` : v + 'px';
  const bar = (x, y, w, h, kx = 0, ky = 0) => `<i style="${base}left:${at(x, kx)};top:${at(y, ky)};width:${w}px;height:${h}px"></i>`, out = [];
  if (c.style === 'classic' || c.style === 'tshape' || c.style === 'cross') { const gg = c.style === 'cross' ? 0 : g, k = c.style === 'cross' ? 0 : 1;
    if (c.style !== 'tshape') out.push(bar(-t / 2, -gg - s, t, s, 0, -k)); out.push(bar(-t / 2, gg, t, s, 0, k), bar(-gg - s, -t / 2, s, t, -k, 0), bar(gg, -t / 2, s, t, k, 0)); }
  if (c.style === 'circle') { const r = s + g, d = dv ? `calc(${r * 2}px + 2 * var(--xg, 0px))` : r * 2 + 'px'; out.push(`<i style="position:absolute;left:${at(-r, -1)};top:${at(-r, -1)};width:${d};height:${d};border-radius:50%;border:${t}px solid ${c.color};box-sizing:border-box;${ow ? `outline:${ow}px solid rgba(0,0,0,.6);` : ''}"></i>`); }
  if (c.dot || c.style === 'dot') { const d = Math.max(2, t + (c.style === 'dot' ? 2 : 0)); out.push(bar(-d / 2, -d / 2, d, d)); }
  return `<div style="position:absolute;left:50%;top:50%;width:0;height:0;opacity:${c.opacity}">${out.join('')}</div>`;
}
// ── (v53 HUD, spec 3) CS2's crosshair CODE: Settings → Crosshair shows yours ("Crosshair Code:") to copy, and takes one
// to import ("Share or import a crosshair code." · "Replace current crosshair?" · "Invalid or old crosshair code" — CS2's
// own words, resource/csgo_english.txt GameUI_CrosshairCode / GameUI_Xhair_*). The code: "CSGO-" + 25 letters in five
// groups of 5, a base-57 number over CS2's alphabet holding 18 bytes, byte 0 the sum of the others (mod 256).
// HONEST NOTE: the byte layout is NOT in the install's files (CS2 builds the code in its binary); it is the layout the
// public share-code tools use (as I know it): b2 gap ×10 (signed), b3 outline thickness ×2, b4–b7 red, green, blue, alpha,
// b8 split distance | follow-recoil ×128, b9 fixed gap ×10, b10 colour index (5 = custom RGB) | outline on 8 | inner
// split alpha ×10 << 4, b11 outer split alpha ×10 | split size ratio ×10 << 4, b12 thickness ×10, b13 style << 1 | (dot 1,
// deployed gap 2, alpha on 4, T-style 8) << 4, b14–b15 length ×10 (13 bits). Ours ↔ CS2's: size = length, thickness,
// gap = CS2 gap + 4 px (our 0–14 px vs CS2's −5…5 — a fit, not a CS2 number), outline width = outline thickness, colour
// = the RGB (CS2's preset colours 0–4 read as pure red / green / yellow / blue / cyan — not in the files either), opacity =
// alpha when alpha is on, dot, T-style = 'tshape', style 1 / 4 (static) = Dynamic off; 'dot' = length 0 with the dot.
// Follow-recoil and the split settings have no match here (exported as CS2's defaults). Pure: the tests round-trip it.
const XH_DICT = 'ABCDEFGHJKLMNOPQRSTUVWXYZabcdefhijkmnopqrstuvwxyz23456789';
const XH_PRESET = ['#ff0000', '#00ff00', '#ffff00', '#0000ff', '#00ffff'];
export function crosshairCode(c) {
  const b = new Uint8Array(18), cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), hex = String(c.color || '#ffffff').replace('#', '').padEnd(6, 'f');
  const gap = Math.round(cl((+c.gap || 0) - 4, -12.8, 12.7) * 10), dotOnly = c.style === 'dot', len = dotOnly ? 0 : Math.round(cl(+c.size || 0, 0, 819) * 10);
  b[1] = 1; b[2] = gap & 255; b[3] = Math.round(cl(c.outline ? +c.outlineWidth || 1 : 0, 0, 3) * 2); b[4] = parseInt(hex.slice(0, 2), 16) || 0; b[5] = parseInt(hex.slice(2, 4), 16) || 0; b[6] = parseInt(hex.slice(4, 6), 16) || 0;
  b[7] = Math.round(cl(+c.opacity || 1, 0, 1) * 255); b[8] = 7; b[9] = 0; b[10] = 5 | (c.outline ? 8 : 0); b[11] = 10 | (3 << 4); b[12] = Math.round(cl(+c.thickness || 1, 0, 6.3) * 10) & 63;
  b[13] = ((c.dynamic && !dotOnly ? 2 : 4) << 1) | (((c.dot || dotOnly ? 1 : 0) | 4 | (c.style === 'tshape' ? 8 : 0)) << 4); b[14] = len & 255; b[15] = (len >> 8) & 31;
  let sum = 0; for (let i = 1; i < 18; i++) sum += b[i]; b[0] = sum & 255;
  let n = 0n; for (const x of b) n = (n << 8n) | BigInt(x); let out = ''; for (let i = 0; i < 25; i++) { out += XH_DICT[Number(n % 57n)]; n /= 57n; }
  return 'CSGO-' + out.match(/.{5}/g).join('-'); }
// A code → our crosshair settings (merged onto `base`), or null: "Invalid or old crosshair code".
export function crosshairFromCode(code, base = CROSSHAIR_DEFAULT) {
  const t = String(code || '').trim(); if (!/^CSGO(-[A-Za-z0-9]{5}){5}$/.test(t)) return null;
  const ch = t.slice(5).replace(/-/g, '').split('').reverse(); let n = 0n; for (const x of ch) { const i = XH_DICT.indexOf(x); if (i < 0) return null; n = n * 57n + BigInt(i); }
  const b = new Uint8Array(18); for (let i = 17; i >= 0; i--) { b[i] = Number(n & 255n); n >>= 8n; } if (n) return null;
  let sum = 0; for (let i = 1; i < 18; i++) sum += b[i]; if ((sum & 255) !== b[0]) return null;
  const s8 = v => v > 127 ? v - 256 : v, flags = b[13] >> 4, style = (b[13] & 15) >> 1, colorIx = b[10] & 7, len = (((b[15] & 31) << 8) | b[14]) / 10, h2 = v => v.toString(16).padStart(2, '0');
  const color = colorIx === 5 ? '#' + h2(b[4]) + h2(b[5]) + h2(b[6]) : XH_PRESET[colorIx] || base.color, dot = !!(flags & 1);
  return { ...base, style: len === 0 && dot ? 'dot' : flags & 8 ? 'tshape' : 'classic', size: Math.max(1, Math.min(20, Math.round(len) || 1)), thickness: Math.max(1, Math.min(6, Math.round((b[12] & 63) / 10) || 1)),
    gap: Math.max(0, Math.min(14, Math.round(s8(b[2]) / 10 + 4))), outline: !!(b[10] & 8), outlineWidth: Math.max(1, Math.min(3, Math.round(b[3] / 2) || 1)), color, opacity: flags & 4 ? Math.max(.2, Math.round(b[7] / 255 * 20) / 20) : 1, dot, dynamic: !(style === 1 || style === 4) }; }

// Settings section: controls + live preview. `onChange` re-renders the panel.
export function crosshairEditorHTML(c) {
  const opt = (k, v, t) => `<option value="${v}" ${c[k] === v ? 'selected' : ''}>${t}</option>`, rng = (k, label, min, max, step = 1) => `<label>${label} · ${c[k]}<input data-xh="${k}" type="range" min="${min}" max="${max}" step="${step}" value="${c[k]}"></label>`;
  return `<h3>Crosshair (Global Defensive)</h3><div class="xh-edit"><div class="set-grid">
    <label>Style<select data-xh="style">${CROSSHAIR_STYLES.map(([v, t]) => opt('style', v, t)).join('')}</select></label>${rng('size', 'Size', 1, 20)}${rng('thickness', 'Thickness', 1, 6)}${rng('gap', 'Gap', 0, 14)}
    <label>Colour<input data-xh="color" type="color" value="${c.color}"></label>${rng('opacity', 'Opacity', .2, 1, .05)}${rng('outlineWidth', 'Outline width', 1, 3)}
    <label class="chk"><input type="checkbox" data-xh="outline" ${c.outline ? 'checked' : ''}> Outline</label><label class="chk"><input type="checkbox" data-xh="dot" ${c.dot ? 'checked' : ''}> Centre dot</label><label class="chk"><input type="checkbox" data-xh="dynamic" ${c.dynamic ? 'checked' : ''}> Dynamic (opens when moving)</label></div>
    <div class="xh-preview" style="position:relative;height:120px;border-radius:8px;margin:8px 0;background:linear-gradient(135deg,#7a8c9c,#c9b48a 60%,#3d4a33)">${crosshairHTML(c)}</div>
    <div class="cp-row"><button data-xh-reset>Reset crosshair</button></div>
    <div class="cp-row xh-code" title="Share or import a crosshair code."><label>Crosshair Code: <input data-xh-code readonly value="${crosshairCode(c)}" style="width:22em;font-family:ui-monospace,Menlo,monospace"></label><button data-xh-copy>Copy</button><input data-xh-paste placeholder="CSGO-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx" style="width:22em;font-family:ui-monospace,Menlo,monospace"><button data-xh-import>Import</button><span class="cp-muted xh-msg"></span></div><p class="cp-muted">Saved on this computer for you only; other LAN players keep their own. It only changes the look: shots go where you aim, with the gun's recoil and inaccuracy (Dynamic shows it).</p></div>`;
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
