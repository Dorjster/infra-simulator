// Global Defensive HUD options (Settings → Global Defensive → HUD), v53 stage 4. CS2's own HUD settings where CS2 has
// them, saved on this computer only (localStorage 'gd-hud') and applied live: saving fires a 'gd-hud-prefs' event that
// the HUD, the team counter and the kill tally listen to — nothing is read per frame.
//   scale        hud_scaling            "HUD Scale"          0.8 – 1.4 (spec 3's slider; CS2's own slider is 0.5 – 0.95
//                                                            in its binary, not in the data files — the spec's range kept)
//   color        cl_hud_color           "HUD Color"          0 Team Color … 12 Teammate Color (SFUI_Settings_HUD_Color_*,
//                                                            colours: csgostyles.vcss color-hud-1 … 11, t-color / ct-color)
//   letters      cl_teammate_colors_show 2  "Colors and Letters" — CS2's colour-blind aid: a letter (Y P G B O) over each
//                                                            player colour on the avatars and the radar (AvatarL__PlayerLetter)
//   reduceFlashes  (ours, spec 3 accessibility) tones the kill tally's lightning, flash, sparks and glow down
// (labels: the user's CS2 resource/csgo_english.txt SFUI_Settings_HUDScaling / SFUI_Settings_HUD_Color_0…12 /
// SFUI_Settings_TeammateColorsShowLetters. CS2's default HUD colour is 0, Team Color — the reference picture's gold is
// the Terrorists' t-color #eabe54.)
const KEY = 'gd-hud';
export const HUD_DEFAULT = Object.freeze({ scale: 1, color: 0, letters: false, reduceFlashes: false });
export const HUD_SCALE_RANGE = Object.freeze([.8, 1.4, .05]);
// cl_hud_color 0 … 12 (CS2's names) and their colours (csgostyles.vcss @define color-hud-N; 0 and 12 follow the team /
// your player colour: null here, resolved by hudColorOf).
export const HUD_COLORS = Object.freeze([['Team Color', null], ['White', '#e8e8e8'], ['Bright White', '#ffffff'], ['Light Blue', '#96c8ff'], ['Blue', '#2478ff'], ['Purple', '#c864ff'], ['Red', '#ff2924'], ['Orange', '#ff7124'], ['Yellow', '#fff724'], ['Green', '#3eff24'], ['Aqua', '#70ffdb'], ['Pink', '#ff9ccd'], ['Teammate Color', null]]);
// CS2's team colours (csgostyles.vcss @define t-color #eabe54, ct-color rgb(150, 200, 250)) and player colours
// (@define color-player-yellow / purple / green / blue / orange), with their letters (cl_teammate_colors_show 2).
export const TEAM_COLOR = Object.freeze({ t: '#eabe54', ct: '#96c8fa' });
export const PLAYER_COLORS = Object.freeze(['#f8f62d', '#c03699', '#1da284', '#88cef5', '#ff9b25']);
export const PLAYER_LETTERS = Object.freeze(['Y', 'P', 'G', 'B', 'O']);
// The HUD colour for your side and your player colour slot (0–4): cl_hud_color's rule.
export function hudColorOf(p, side, slot = 0) { const c = HUD_COLORS[p?.color | 0] ? p.color | 0 : 0; if (c === 12) return PLAYER_COLORS[(slot | 0) % 5]; return HUD_COLORS[c][1] || (side === 'ct' ? TEAM_COLOR.ct : TEAM_COLOR.t); }
const clamp = (v, [lo, hi], d) => Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d;
export function cleanHudPrefs(p = {}) { const D = HUD_DEFAULT; return { scale: Math.round(clamp(p.scale, HUD_SCALE_RANGE, D.scale) * 100) / 100, color: Number.isInteger(+p.color) && +p.color >= 0 && +p.color < HUD_COLORS.length ? +p.color : D.color, letters: !!p.letters, reduceFlashes: !!p.reduceFlashes }; }
export function loadHudPrefs() { let s = null; try { s = JSON.parse(globalThis.localStorage?.getItem(KEY) || 'null'); } catch {} return cleanHudPrefs(s && typeof s === 'object' ? s : {}); }
export function saveHudPrefs(p) { const c = cleanHudPrefs(p); try { globalThis.localStorage?.setItem(KEY, JSON.stringify(c)); } catch {} globalThis.dispatchEvent?.(new CustomEvent('gd-hud-prefs', { detail: c })); return c; }
// The settings section (CS2's names and ranges) and a reset.
export function hudEditorHTML(p = loadHudPrefs()) {
  const [a, b, s] = HUD_SCALE_RANGE;
  return `<h3>HUD (Global Defensive)</h3><div class="set-grid">
    <label title="The size of every HUD element (CS2: HUD Scale)">HUD scale · <span>${p.scale.toFixed(2)}</span><input data-hd="scale" type="range" min="${a}" max="${b}" step="${s}" value="${p.scale}"></label>
    <label title="The colour of health, armour, ammo, money and the kill cards (CS2: HUD Color)">HUD color<select data-hd="color">${HUD_COLORS.map(([n], i) => `<option value="${i}" ${p.color === i ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="chk" title="Colour-blind aid: a letter over each player colour on the avatars and the radar (CS2: Colors and Letters)"><input type="checkbox" data-hd="letters" ${p.letters ? 'checked' : ''}> Show letters over player colors</label>
    <label class="chk" title="Tones down the kill cards' lightning, flash, sparks and glow"><input type="checkbox" data-hd="reduceFlashes" ${p.reduceFlashes ? 'checked' : ''}> Reduce flashes</label>
    </div><div class="cp-row"><button data-hd-reset>Reset HUD (CS2 defaults)</button></div>`;
}
export function wireHudEditor(panel, rerender) {
  if (!panel || panel.__hdWired) return; panel.__hdWired = true;
  const on = e => { const k = e.target?.dataset?.hd; if (!k) return; const p = loadHudPrefs(); p[k] = e.target.type === 'range' ? +e.target.value : e.target.type === 'checkbox' ? e.target.checked : +e.target.value; const c = saveHudPrefs(p);
    const sp = e.target.type === 'range' ? e.target.closest('label')?.querySelector('span') : null; if (sp) sp.textContent = c.scale.toFixed(2); };
  panel.addEventListener('input', on); panel.addEventListener('change', on);
  panel.addEventListener('click', e => { if (!e.target.closest?.('[data-hd-reset]')) return; saveHudPrefs({ ...HUD_DEFAULT }); rerender?.(); });
}
