// Global Defensive radar options (Settings → Global Defensive → Radar), CS2's own five, saved on this computer only and
// applied live (a 'gd-radar-prefs' event the radar listens to: nothing read per frame). Defaults = CS2's cvar defaults:
//   centered  cl_radar_always_centered 1   "Radar Centers The Player"   (no: best fit — the map's edge stays at the panel's edge)
//   rotate    cl_radar_rotate 1            "Radar Is Rotating"          (no: north up, your arrow turns)
//   size      cl_hud_radar_scale 1         "Radar Hud Size"             (CS2's slider 0.8 – 1.3)
//   zoom      cl_radar_scale 0.7           "Radar Map Zoom"             (CS2's slider 0.25 – 1: more = closer)
//   squareTab cl_radar_square_with_scoreboard 1  "Toggle Square Shape With Scoreboard" (the whole map while Tab is held)
// (labels: CS2's resource/csgo_english.txt SFUI_Settings_Radar_* / SFUI_Settings_HUD_Radar_Size; the defaults live in the
// game's client binary, not its data files — the CS:GO / CS2 cvar list values.)
const KEY = 'gd-radar', OLD = 'gd-radar-mode';
export const RADAR_DEFAULT = Object.freeze({ centered: true, rotate: true, size: 1, zoom: .7, squareTab: true });
export const RADAR_RANGE = Object.freeze({ size: [.8, 1.3, .05], zoom: [.25, 1, .05] });
const clamp = (v, [lo, hi], d) => Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d;
// Any stored value made safe (unknown keys dropped, numbers clamped to CS2's slider ranges, flags as booleans).
export function cleanRadarPrefs(p = {}) { const D = RADAR_DEFAULT; return { centered: p.centered === undefined ? D.centered : !!p.centered, rotate: p.rotate === undefined ? D.rotate : !!p.rotate, size: clamp(p.size, RADAR_RANGE.size, D.size), zoom: clamp(p.zoom, RADAR_RANGE.zoom, D.zoom), squareTab: p.squareTab === undefined ? D.squareTab : !!p.squareTab }; }
export function loadRadarPrefs() { let s = null, old = null; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); old = localStorage.getItem(OLD); } catch {}
  return cleanRadarPrefs(s && typeof s === 'object' ? s : old === 'fixed' ? { rotate: false } : {}); }   // (v51's N key saved only rotating / fixed: carried over once)
export function saveRadarPrefs(p) { const c = cleanRadarPrefs(p); try { localStorage.setItem(KEY, JSON.stringify(c)); localStorage.removeItem(OLD); } catch {} globalThis.dispatchEvent?.(new CustomEvent('gd-radar-prefs', { detail: c })); return c; }
// The settings section: CS2's names, its slider ranges, a live preview (drawRadarPreview) and a reset.
export function radarEditorHTML(p = loadRadarPrefs()) {
  const yn = (k, label, tip) => `<label title="${tip}">${label}<select data-rd="${k}"><option value="1" ${p[k] ? 'selected' : ''}>Yes</option><option value="0" ${p[k] ? '' : 'selected'}>No</option></select></label>`;
  const rng = (k, label, tip) => { const [a, b, s] = RADAR_RANGE[k]; return `<label title="${tip}">${label} · <span>${(+p[k]).toFixed(2)}</span><input data-rd="${k}" type="range" min="${a}" max="${b}" step="${s}" value="${p[k]}"></label>`; };
  return `<h3>Radar (Global Defensive)</h3><div class="rd-edit" style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap"><div class="set-grid" style="flex:1 1 300px">
    ${yn('centered', 'Radar centers the player', 'Yes: you stay in the middle. No: best fit — the map stays against the radar\'s edges near the map\'s border (CS2: cl_radar_always_centered)')}
    ${yn('rotate', 'Radar is rotating', 'Yes: the map turns with your view. No: north up, your arrow turns (CS2: cl_radar_rotate; N switches it in game)')}
    ${rng('size', 'Radar HUD size', 'The radar\'s size on screen (CS2: cl_hud_radar_scale, 0.8 – 1.3)')}
    ${rng('zoom', 'Radar map zoom', 'How much of the map the radar shows: lower shows more (CS2: cl_radar_scale, 0.25 – 1)')}
    ${yn('squareTab', 'Toggle radar shape with scoreboard', 'Yes: holding Tab shows the whole map beside the scoreboard (CS2: cl_radar_square_with_scoreboard)')}
    </div><canvas class="rd-preview" width="180" height="180" style="width:180px;height:180px;border-radius:8px;background:#0b0f12;flex:0 0 auto"></canvas></div>
    <div class="cp-row"><button data-rd-reset>Reset radar (CS2 defaults)</button></div><p class="cp-muted">Saved on this computer for you only; applied at once. Defaults are CS2's: centred, rotating, size 1.00, zoom 0.70, whole map with the scoreboard.</p>`;
}
// The preview: a schematic map (corridors, two sites) as the radar would show it with these options — the panel's size
// (HUD size), how much of the map (zoom), turned or north up, the player centred or fitted at the map's edge.
export function drawRadarPreview(cv, p = loadRadarPrefs()) {
  const g = cv?.getContext?.('2d'); if (!g) return; const W = cv.width, s = Math.round(W * (.62 + (p.size - .8) / .5 * .38)), o = (W - s) / 2, me = { x: 70, z: 82, yaw: .5 };   // (map 100 × 100, you near the bottom right)
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, W); g.fillStyle = 'rgba(8,12,14,.85)'; g.fillRect(o, o, s, s); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.strokeRect(o + .5, o + .5, s - 1, s - 1);
  const view = 100 * 1.4 * .35 / p.zoom, k = s / view; let cx = me.x, cz = me.z; if (!p.centered) { const h = view / 2; cx = view >= 100 ? 50 : Math.min(100 - h, Math.max(h, cx)); cz = view >= 100 ? 50 : Math.min(100 - h, Math.max(h, cz)); }
  g.save(); g.beginPath(); g.rect(o, o, s, s); g.clip(); g.translate(o + s / 2, o + s / 2); if (p.rotate) g.rotate(me.yaw); g.scale(k, k); g.translate(-cx, -cz);
  g.fillStyle = '#4f6a66'; for (const [x, z, w, d] of [[8, 8, 30, 24], [62, 6, 30, 26], [18, 30, 10, 50], [28, 44, 50, 10], [70, 30, 10, 62], [10, 76, 40, 16], [40, 54, 10, 30]]) g.fillRect(x, z, w, d);
  g.fillStyle = '#7a6a48'; g.fillRect(14, 12, 16, 14); g.fillRect(68, 10, 18, 16); g.restore();
  const P = (x, z) => { let dx = (x - cx) * k, dz = (z - cz) * k; if (p.rotate) { const c = Math.cos(me.yaw), n = Math.sin(me.yaw), t = c * dx - n * dz; dz = n * dx + c * dz; dx = t; } return [o + s / 2 + dx, o + s / 2 + dz]; };
  g.font = `900 ${Math.round(s * .09)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f0f0f0';
  g.save(); g.beginPath(); g.rect(o, o, s, s); g.clip(); for (const [L, x, z] of [['A', 22, 19], ['B', 77, 18]]) { const [a, b] = P(x, z); g.fillText(L, a, b); }
  for (const [x, z, c] of [[44, 48, '#f2e33a'], [24, 60, '#a35bd8']]) { const [a, b] = P(x, z); g.beginPath(); g.arc(a, b, 3.5, 0, 7); g.fillStyle = c; g.fill(); g.strokeStyle = '#000'; g.stroke(); }
  { const [a, b] = P(me.x, me.z); g.translate(a, b); g.rotate(p.rotate ? 0 : -me.yaw); g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5); g.closePath(); g.fillStyle = '#34c46a'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.stroke(); }
  g.restore();
}
// Wires the settings section (event delegation on the settings panel, once): every change saved and applied at once,
// the preview redrawn; reset restores CS2's defaults. `rerender` redraws the whole panel (after a reset).
export function wireRadarEditor(panel, rerender) {
  if (!panel || panel.__rdWired) return; panel.__rdWired = true;
  const preview = () => { const cv = panel.querySelector?.('.rd-preview'); if (cv) drawRadarPreview(cv, loadRadarPrefs()); };
  const on = e => { const k = e.target?.dataset?.rd; if (!k) return; const p = loadRadarPrefs(); p[k] = e.target.type === 'range' ? +e.target.value : e.target.value === '1'; const c = saveRadarPrefs(p);
    const sp = e.target.type === 'range' ? e.target.closest('label')?.querySelector('span') : null; if (sp) sp.textContent = (+c[k]).toFixed(2); preview(); };
  panel.addEventListener('input', on); panel.addEventListener('change', on);
  panel.addEventListener('click', e => { if (!e.target.closest?.('[data-rd-reset]')) return; saveRadarPrefs({ ...RADAR_DEFAULT }); rerender?.(); preview(); });
  // (the panel's markup is rebuilt by its own render(): the preview drawn whenever a fresh one appears)
  if (typeof MutationObserver !== 'undefined') new MutationObserver(() => { const cv = panel.querySelector('.rd-preview'); if (cv && !cv.__drawn) { cv.__drawn = true; drawRadarPreview(cv, loadRadarPrefs()); } }).observe(panel, { childList: true, subtree: true });
}
