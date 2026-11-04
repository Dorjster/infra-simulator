// A small reader for KV3 text (Source2Viewer-CLI's block dumps: `{ key = value }`, `[ a, b ]`, strings, numbers, true /
// false / null, the <!-- kv3 … --> header skipped, and typed values such as resource:"…" or soundevent:"…", whose type prefix is dropped). Used by
// tools/import-cs2-ragdoll.mjs on a model's PHYS block. Pure; throws on text it does not understand.
export function parseKV3(text) {
  let i = text.indexOf('{', Math.max(0, text.indexOf('-->') + 3)); if (i < 0) throw Error('KV3: no root object');
  const ws = () => { for (;;) { while (i < text.length && /\s/.test(text[i])) i++; if (text.startsWith('//', i)) { while (i < text.length && text[i] !== '\n') i++; continue; } if (text.startsWith('/*', i)) { const e = text.indexOf('*/', i + 2); i = e < 0 ? text.length : e + 2; continue; } return; } };
  function value() {
    ws(); const c = text[i];
    if (c === '{') { i++; const o = {}; for (;;) { ws(); if (text[i] === '}') { i++; return o; } const m = /^[A-Za-z_][\w.]*/.exec(text.slice(i, i + 200)); if (!m) throw Error('KV3: key expected at ' + i); i += m[0].length; ws(); if (text[i] !== '=') throw Error('KV3: = expected at ' + i); i++; o[m[0]] = value(); ws(); if (text[i] === ',') i++; } }
    if (c === '[') { i++; const a = []; for (;;) { ws(); if (text[i] === ']') { i++; return a; } a.push(value()); ws(); if (text[i] === ',') i++; } }
    if (c === '"') { let j = i + 1, s = ''; while (j < text.length && text[j] !== '"') { if (text[j] === '\\') { s += text[j + 1]; j += 2; } else s += text[j++]; } i = j + 1; return s; }
    const m = /^(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/.exec(text.slice(i, i + 64)); if (m) { i += m[0].length; return +m[0]; }
    const w = /^[A-Za-z_][\w]*/.exec(text.slice(i, i + 64)); if (w) { i += w[0].length; if (w[0] === 'true') return true; if (w[0] === 'false') return false; if (w[0] === 'null') return null; if (text[i] === ':') { i++; return value(); } return w[0]; }
    throw Error('KV3: unexpected ' + JSON.stringify(text.slice(i, i + 20)) + ' at ' + i);
  }
  return value();
}
