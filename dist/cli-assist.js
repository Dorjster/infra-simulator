// Command-line assistance like real network gear (Cisco/Dell/FortiOS style), built from each device's
// own command list:
//  · Tab completes the current word: one match → completes it; several → extends to their common part and lists them.
//  · "?" shows what can come next at this point (or, right after letters, which words start with them).
//  · A suggestion line shows the most likely full command as you type.
//  · Unique abbreviations run as the full command: "sh int st" → "show interfaces status".
// Placeholders such as <id> or <ip> accept any value; their suggestions come from the device (ports, VLANs).
const words = s => s.trim().split(/\s+/).filter(Boolean);
const lit = t => !/^<.*>$/.test(t);
// A token like "low|high|critical" offers each choice; "|" on its own is a literal pipe.
const choices = t => (t !== '|' && t.includes('|') && !t.startsWith('<')) ? t.split('|') : [t];

export function createAssist(commandList) {
  const cmds = [...new Set(commandList.filter(Boolean))];
  // Every command as a token list (choices expanded), kept in the original order for suggestions.
  const paths = []; for (const c of cmds) { let acc = [[]]; for (const t of words(c)) acc = acc.flatMap(p => choices(t).map(x => [...p, x])); for (const p of acc) paths.push({ toks: p, text: c }); }
  // Match typed tokens against a path: exact word, unique prefix of a literal, or any value for a placeholder.
  function matches(typed, toks, final) {
    if (typed.length > toks.length) return false;
    for (let i = 0; i < typed.length; i++) {
      const t = typed[i].toLowerCase(), p = toks[i];
      if (!lit(p)) continue;
      const last = i === typed.length - 1 && !final;
      if (last ? !p.toLowerCase().startsWith(t) : !(p.toLowerCase() === t || p.toLowerCase().startsWith(t))) return false;
    }
    return true;
  }
  // Next-word options after the complete words of `line` (and the partial word being typed).
  function options(line) {
    const ends = /\s$/.test(line) || !line.trim(), typed = words(line), done = ends ? typed : typed.slice(0, -1), part = ends ? '' : typed.at(-1);
    const out = new Map();
    for (const p of paths) {
      if (!matches(done, p.toks, true) || p.toks.length <= done.length) continue;
      // Earlier words must resolve the same way (an abbreviation can't mean two different words).
      const next = p.toks[done.length];
      if (lit(next) ? next.toLowerCase().startsWith(part.toLowerCase()) : true) { if (!out.has(next)) out.set(next, p.text); }
    }
    return { part, done, list: [...out.keys()], examples: out };
  }
  // Resolve abbreviations against whole commands: every typed word must be the full word or its start (any
  // value fills a placeholder) and the command must end there. Several fits → the one with the most exact
  // words, then the first listed. A single word must be unambiguous on its own ("sh" never runs "shutdown").
  function resolve(line) {
    const typed = words(line); if (!typed.length) return null;
    if (typed.length === 1) { const t = typed[0].toLowerCase(), firsts = new Set(paths.filter(p => lit(p.toks[0]) && p.toks[0].toLowerCase().startsWith(t)).map(p => p.toks[0])); if (firsts.size !== 1 && !firsts.has(typed[0])) return null; }
    let best = null, bestScore = -1;
    for (const p of paths) {
      if (p.toks.length !== typed.length) continue; let score = 0, ok = true;
      for (let i = 0; i < typed.length && ok; i++) { const k = p.toks[i], t = typed[i].toLowerCase(); if (!lit(k)) continue; if (k.toLowerCase() === t) score += 2; else if (k.toLowerCase().startsWith(t)) score += 1; else ok = false; }
      if (ok && score > bestScore) { best = p; bestScore = score; }
    }
    return best ? best.toks.map((k, i) => lit(k) ? k : typed[i]).join(' ') : null;
  }
  const common = list => list.reduce((a, b) => { let i = 0; while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++; return a.slice(0, i); });
  return {
    // Tab: returns { line, list } — the new input and the options to print (empty when it completed).
    complete(line, values = {}) {
      const o = options(line), lits = o.list.filter(lit);
      if (o.list.length === 1 && lit(o.list[0])) return { line: [...o.done, o.list[0]].join(' ') + ' ', list: [] };
      if (lits.length > 1 || (lits.length && o.part)) { const c = common(lits); if (c.length > o.part.length) return { line: [...o.done, c].join(' '), list: [] }; return { line, list: o.list.map(t => lit(t) ? t : t + (values[t] ? '  e.g. ' + values[t] : '')) }; }
      if (o.list.length) return { line, list: o.list.map(t => lit(t) ? t : t + (values[t] ? '  e.g. ' + values[t] : '')) };
      return { line, list: [] };
    },
    // "?": what can follow here (Cisco semantics: "sh?" lists words starting with "sh", "show ?" lists next words).
    help(line) { const o = options(line); return o.list.length ? o.list.map(t => t + (lit(t) ? '' : '  (value)')) : ['<cr>']; },
    // The single most likely full command for what is typed so far (null if nothing fits).
    suggest(line) { if (!line.trim()) return null; const typed = words(line), final = /\s$/.test(line); const p = paths.find(x => matches(typed, x.toks, final)); return p ? p.text : null; },
    // Before running: expand unique abbreviations ("sh int st" → "show interfaces status"); otherwise unchanged.
    expand(line) { const r = resolve(line); return r && r !== line.trim() ? r : line; },
  };
}
