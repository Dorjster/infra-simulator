// CS2's sound events (soundevents/game_sounds_*.vsndevts, KV3 text as Source 2 Viewer decompiles them): a parser and a
// resolver (base inheritance, child events) for tools/import-cs2-sounds.mjs and the tests. Reference data only: the
// numbers it reads (volumes, distance curves in Hammer units, instance limits) describe how CS2 mixes its own sounds;
// nothing of Valve's audio is in this file or the repo.
// KV3 text → plain JS ({ key = value }, [ a, b, ], "strings", numbers, true / false; // and /* */ comments; the
// <!-- kv3 … --> header line).
export function parseKV3(text) {
  let i = text.indexOf('-->'); i = i < 0 ? 0 : i + 3; const n = text.length;
  const ws = () => { for (;;) { while (i < n && /\s|,/.test(text[i])) i++; if (text.startsWith('//', i)) { while (i < n && text[i] !== '\n') i++; continue; } if (text.startsWith('/*', i)) { const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; } return; } };
  const str = () => { if (text.startsWith('"""', i)) { const e = text.indexOf('"""', i + 3); const s = text.slice(i + 3, e); i = e + 3; return s; } i++; let s = ''; while (i < n && text[i] !== '"') { if (text[i] === '\\') i++; s += text[i++]; } i++; return s; };
  const word = () => { const m = /^[^\s=,\[\]{}"]+/.exec(text.slice(i, i + 256)); i += m ? m[0].length : 1; return m ? m[0] : ''; };
  function value() { ws(); const ch = text[i];
    if (ch === '{') { i++; const o = {}; for (;;) { ws(); if (text[i] === '}') { i++; return o; } if (i >= n) return o; const k = text[i] === '"' ? str() : word(); ws(); if (text[i] === '=') i++; o[k] = value(); } }
    if (ch === '[') { i++; const a = []; for (;;) { ws(); if (text[i] === ']') { i++; return a; } if (i >= n) return a; a.push(value()); } }
    if (ch === '"') return str();
    const w = word(); if (w === 'true') return true; if (w === 'false') return false; if (w === 'null') return null; const v = Number(w); if (Number.isFinite(v)) return v;
    if (text[i] === ':') { i++; return value(); }   // (typed values: resource:"…", soundevent:"…")
    return w; }
  return value();
}
// Every event of several files in one table (later files win a name clash; CS2's own order doesn't clash in practice).
export const mergeEvents = (...tables) => Object.assign({}, ...tables);
const lower = new WeakMap();
const find = (EV, name) => { if (EV[name]) return EV[name]; let L = lower.get(EV); if (!L) { L = new Map(Object.keys(EV).map(k => [k.toLowerCase(), k])); lower.set(EV, L); } const k = L.get(String(name).toLowerCase()); return k ? EV[k] : null; };
// One event, as the game needs it: its files (every vsnd_files_track_*), volume, pitch and its random range, the distance
// curve [[HU, gain]…] (CS2 draws a smooth curve through these points with the listed slopes; the game interpolates
// linearly between them — the points themselves are exact), instance limit, occlusion intensity, fade-out time, UI flag
// and child events (soundevent_01…: CS2 starts them together, e.g. a gun's SingleDistant layer).
export function resolveEvent(EV, name, depth = 0) {
  const e = find(EV, name); if (!e || depth > 6) return null;
  const base = typeof e.base === 'string' && e.base ? resolveEvent(EV, e.base, depth + 1) : null;
  const files = Object.keys(e).filter(k => /^vsnd_files/.test(k)).sort().flatMap(k => [].concat(e[k]).filter(f => typeof f === 'string' && f));
  const curve = Array.isArray(e.distance_volume_mapping_curve) && e.use_distance_volume_mapping_curve !== false ? e.distance_volume_mapping_curve.filter(Array.isArray).map(p => [+p[0], +p[1]]) : null;
  const fade = Array.isArray(e.fadetime_volume_mapping_curve) && e.use_fadetime_volume_mapping_curve !== false ? +(e.fadetime_volume_mapping_curve.at(-1)?.[0] ?? 0) : null;
  const children = Object.keys(e).filter(k => /^soundevent_\d+$/.test(k)).sort().flatMap(k => [].concat(e[k])).filter(s => typeof s === 'string' && s);
  const num = (k, d) => Number.isFinite(+e[k]) && e[k] !== undefined && e[k] !== '' ? +e[k] : d;
  return { name, files: files.length ? files.map(f => f.replace(/\.vsnd$/, '')) : base?.files || [], volume: num('volume', base?.volume ?? 1), pitch: num('pitch', base?.pitch ?? 1),
    pitchRand: [num('pitch_random_min', base?.pitchRand?.[0] ?? 0), num('pitch_random_max', base?.pitchRand?.[1] ?? 0)], volRand: [num('volume_random_min', base?.volRand?.[0] ?? 0), num('volume_random_max', base?.volRand?.[1] ?? 0)],
    curve: curve?.length ? curve : base?.curve || null, limit: num('instance_limit', base?.limit ?? 0), occl: num('occlusion_intensity', base?.occl ?? 0), fade: fade ?? base?.fade ?? null,
    ui: !!(e.is_ui_sound ?? base?.ui), delay: num('delay', base?.delay ?? 0), mixgroup: e.mixgroup ?? base?.mixgroup ?? null, children: children.length ? children : base?.children || [] };
}
