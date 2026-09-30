// Small HTML component kit shared by every device GUI. All field ids use the "pg-" prefix so the
// existing handlers, tests and LAN actions keep working. Output is plain HTML strings.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pill = (state, text) => `<span class="gv-pill gv-${state}">${esc(text)}</span>`;
export const okPill = (ok, good = 'OK', bad = 'Action needed') => pill(ok ? 'ok' : 'crit', ok ? good : bad);
export const input = (id, label, value = '', type = 'text', hint = '') => `<label>${label}<input id="pg-${id}" type="${type}" value="${esc(value)}" ${type === 'password' ? 'autocomplete="new-password"' : ''}>${hint ? `<small>${hint}</small>` : ''}</label>`;
export const select = (id, label, items, value, hint = '') => `<label>${label}<select id="pg-${id}">${items.map(x => { const [v, t] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(t)}</option>`; }).join('')}</select>${hint ? `<small>${hint}</small>` : ''}</label>`;
export const check = (id, label, value) => `<label class="pg-check"><input id="pg-${id}" type="checkbox" ${value ? 'checked' : ''}>${label}</label>`;
export const button = (id, label, kind = '') => `<button type="button" id="pg-${id}" class="${kind ? 'gv-' + kind : ''}">${label}</button>`;
export const grid = (...fields) => `<div class="pg-grid">${fields.join('')}</div>`;
export const card = (title, body, { wide = false, tone = '' } = {}) => `<section class="gv-card${wide ? ' gv-wide' : ''}${tone ? ' gv-tone-' + tone : ''}"><h4>${esc(title)}</h4>${body}</section>`;
export const cards = (...list) => `<div class="gv-cards">${list.join('')}</div>`;
export const kv = rows => `<dl class="gv-kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
// Rows may contain {html:'…'} cells for pills or buttons; everything else is escaped.
export const table = (heads, rows, empty = 'No entries yet') => `<div class="gv-table"><table><thead><tr>${heads.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(r => `<tr>${r.map(c => `<td>${c && typeof c === 'object' && 'html' in c ? c.html : esc(c)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${heads.length}" class="gv-empty">${esc(empty)}</td></tr>`}</tbody></table></div>`;
// Guided checklist: first incomplete item is highlighted as the next action.
export function checklist(items) {
  const next = items.findIndex(x => !x.ok);
  return `<ol class="gv-steps">${items.map((x, i) => `<li class="${x.ok ? 'done' : i === next ? 'next' : ''}"><span>${x.ok ? '✓' : i === next ? '→' : '○'}</span><div><b>${esc(x.label)}</b>${x.detail ? `<small>${esc(x.detail)}</small>` : ''}</div></li>`).join('')}</ol>`;
}
export const note = (text, tone = 'info') => `<p class="gv-note gv-note-${tone}">${text}</p>`;
export const meter = (value, max, label) => { const pct = max ? Math.min(100, Math.round(value / max * 100)) : 0; return `<div class="gv-meter" title="${esc(label)}"><i style="width:${pct}%" class="${pct >= 90 ? 'crit' : pct >= 75 ? 'warn' : ''}"></i><span>${esc(label)}</span></div>`; };
