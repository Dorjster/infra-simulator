// Global Defensive (Defuse): CS2's round-end win panel and the CS2-style Tab scoreboard, as HTML strings from the host's
// state — pure functions (no DOM) so node tests check them. Data: the round (d.round: winner, reason, mvp with this round's
// kills / damage / head shots — arena-defuse.js end) and the match stats (arena-defuse.js matchStats, frame.ms on LAN
// clients: per player [kills, assists, deaths, MVPs, head-shot kills, damage], each round's [winner, reason], and the last
// round's damage report). Pages talking to an older host (no ms) fall back to the combat counts.
export const WIN_REASON = { defuse: 'Bomb defused', bomb: 'Bomb exploded', elim: 'All enemies eliminated', time: 'Target saved' };
export const MVP_REASON = { kills: 'Most eliminations', plant: 'Planted the bomb', defuse: 'Defused the bomb' };
const TEAM = { t: 'TERRORISTS', ct: 'COUNTER-TERRORISTS' }, ICON = { elim: '☠', bomb: '💥', defuse: '✂', time: '⏱' };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
const nameOf = (C, k) => C?.names?.[k] || k;

// One player's match line: K, A, D, MVP stars, head-shot kills, HS% (head-shot kills / kills, CS2) and total damage.
export function statsOf(C, ms, k) {
  const p = ms?.p?.[k], st = C?.stats?.[k];
  const s = p ? { k: p[0], a: p[1], d: p[2], mvp: p[3], hsk: p[4], dmg: p[5] } : { k: C?.kills?.[k] || 0, a: C?.assists?.[k] || 0, d: C?.deaths?.[k] || 0, mvp: 0, hsk: st?.hsKills || 0, dmg: st?.dmg || 0 };
  s.hsp = s.k ? Math.round(100 * Math.min(s.hsk, s.k) / s.k) : 0; return s; }

// The win panel's HTML for the round that just ended ('' while no round is over): the banner (who won, why), the MVP card
// (none: the banner only) and your own round (damage dealt and to whom, damage taken).
export function roundPanelHTML(d, C, ms, me) {
  const r = d?.round; if (!r || r.phase !== 'over' || !TEAM[r.winner]) return '';
  let h = `<div class="rp-ban ${r.winner}"><b>${TEAM[r.winner]} WIN</b><small>${WIN_REASON[r.reason] || ''}</small></div>`;
  const m = r.mvp; if (m?.k) { const tm = d.teams?.[m.k] || r.winner, kills = m.kills ?? r.rk?.[m.k] ?? 0;
    h += `<div class="rp-mvp ${tm}"><span class="rp-star">★</span><div><small>ROUND MVP · ${MVP_REASON[m.why] || ''}</small><b>${esc(nameOf(C, m.k))}</b></div><div class="rp-st"><span><b>${kills}</b>kills</span><span><b>${m.dmg | 0}</b>damage</span><span><b>${m.hs | 0}</b>head shots</span></div></div>`; }
  const mine = ms && ms.sumN === d.n ? ms.sum?.[me] : null;
  if (mine && (mine.d || mine.t)) h += `<div class="rp-me">Your round: <b>${mine.d}</b> damage${mine.g.length ? ' to ' + mine.g.map(([v, n, x]) => `${esc(nameOf(C, v))} ${n} (${x} hit${x === 1 ? '' : 's'})`).join(', ') : ''} · took <b>${mine.t}</b>${mine.th ? ` in ${mine.th} hit${mine.th === 1 ? '' : 's'}` : ''}</div>`;
  else if (ms && d.teams?.[me] && d.teams[me] !== 'spec') h += '<div class="rp-me">Your round: no damage dealt or taken</div>';
  return h; }

// The panel on the page: written only when what it shows changes (a new round end, its report arriving, a new match);
// every other frame compares four values and returns — nothing allocated.
export function createRoundPanel(el) {
  let on = false, n = -1, sumN = -1, match = '', hasMvp = false;
  return { update(d, C, ms, me) {
    const r = d?.round, show = !!r && r.phase === 'over', sn = ms ? ms.sumN : -1, mid = d ? d.match : '', mv = !!r?.mvp;
    if (show === on && (!show || (d.n === n && sn === sumN && mid === match && mv === hasMvp))) return false;
    on = show; n = d ? d.n : -1; sumN = sn; match = mid; hasMvp = mv;
    if (!show) { el.hidden = true; return true; }
    el.innerHTML = roundPanelHTML(d, C, ms, me); el.hidden = false; return true; } }; }

// The rows of one side, sorted by kills then damage: what the scoreboard shows of each player. Money only for the viewer's
// own side (and spectators see none of it).
export function boardRows(d, C, ms, list, team, viewerTeam, me, isDown) {
  return list.filter(n => d.teams?.[key(n)] === team).map(n => { const k = key(n), s = statsOf(C, ms, k);
    return { n, key: k, bot: /^BOT /.test(n), me: k === me, dead: !!isDown?.(n), money: viewerTeam === team ? (d.money?.[k] ?? 800) : null, ...s }; })
    .sort((a, b) => b.k - a.k || b.dmg - a.dmg || a.d - b.d); }

// Round history strip: each round's winner (colour) and how it ended (icon), numbered; the half's empty slots dimmed.
export function historyHTML(ms, d) {
  const R = ms?.r || (d?.history || []).map(h => [h.winner, h.reason]);
  if (!R.length) return '';
  return `<div class="gb-hist">${R.map(([w, why], i) => `<i class="${w}" title="Round ${i + 1}: ${w === 'ct' ? 'Counter-Terrorists' : 'Terrorists'} · ${esc(WIN_REASON[why] || why)}"><small>${i + 1}</small>${ICON[why] || '•'}</i>`).join('')}</div>`; }

// The Defuse Tab board: CT on top (blue), T below (yellow), each with its score; per player name (BOT tag), money (your
// side only), K, A, D, ★ MVPs, HS%, DMG. nameExtra(n) adds the page's marks (speaking, muted, bomb, kit) inside the name.
export function boardHTML({ d, C, ms, list, viewerTeam, me, isDown, top = '', nameExtra = () => '' }) {
  const head = `<tr><th>PLAYER</th><th class="n">$</th><th class="n">K</th><th class="n">A</th><th class="n">D</th><th class="n">★</th><th class="n">HS%</th><th class="n">DMG</th></tr>`;
  const block = (team, label) => { const rows = boardRows(d, C, ms, list, team, viewerTeam, me, isDown);
    return `<div class="col gb ${team}"><div class="th"><span>${label}</span><b>${d.score?.[team] ?? 0}</b></div><table>${head}${rows.map(p => `<tr class="${p.dead ? 'dead' : ''}${p.me ? ' me' : ''}"><td>${p.bot ? '<span class="gb-bot">BOT</span> ' : ''}${esc(p.bot ? p.n.slice(4) : p.n)}${nameExtra(p.n)}</td><td class="n">${p.money === null ? '' : '$' + p.money.toLocaleString('en-US')}</td><td class="n">${p.k}</td><td class="n">${p.a}</td><td class="n">${p.d}</td><td class="n gb-mvp">${p.mvp ? '★' + p.mvp : ''}</td><td class="n">${p.hsp}%</td><td class="n">${p.dmg}</td></tr>`).join('') || '<tr><td colspan="8"><small>nobody</small></td></tr>'}</table></div>`; };
  return top + historyHTML(ms, d) + `<div class="cols gbc">${block('ct', 'COUNTER-TERRORISTS')}${block('t', 'TERRORISTS')}</div>`; }

export const ROUND_PANEL_CSS = `
#ar-rp{position:fixed;top:calc(30px + 5vh);left:50%;transform:translateX(-50%);z-index:41;pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:.5em;font:600 calc(6px + .9vmin) system-ui;color:#e8eef2;text-shadow:0 1px 3px #000;width:max-content;max-width:94vw}
#ar-rp[hidden]{display:none}
#ar-rp .rp-ban{display:flex;flex-direction:column;align-items:center;padding:.5em 2.2em .55em;background:linear-gradient(90deg,#0000,#000c 18%,#000c 82%,#0000);border-bottom:.18em solid currentColor}
#ar-rp .rp-ban b{font:900 2.3em system-ui;letter-spacing:.1em}
#ar-rp .rp-ban small{font-size:1.05em;color:#e8eef2;opacity:.9;letter-spacing:.06em}
#ar-rp .ct{color:#8fc4ff}#ar-rp .t{color:#ffc36b}
#ar-rp .rp-mvp{display:flex;align-items:center;gap:1em;padding:.5em 1.2em;background:#000b;border-left:.25em solid currentColor;border-radius:.3em}
#ar-rp .rp-star{font-size:2.2em;color:#ffd36b}
#ar-rp .rp-mvp small{display:block;font-size:.8em;letter-spacing:.1em;color:#c9d6de}
#ar-rp .rp-mvp b{font:800 1.5em system-ui}
#ar-rp .rp-st{display:flex;gap:1.1em;color:#e8eef2}
#ar-rp .rp-st span{display:flex;flex-direction:column;align-items:center;font-size:.8em;color:#9fb2bf}
#ar-rp .rp-st span b{font:800 1.5em ui-monospace,Menlo,monospace;color:#fff}
#ar-rp .rp-me{font-size:.9em;padding:.25em .9em;background:#0009;border-radius:.3em;color:#d5dee4}
#ar-rp .rp-me b{color:#fff}
#ar-board .gb-hist{display:flex;gap:3px;flex-wrap:wrap;margin:0 0 8px}
#ar-board .gb-hist i{font-style:normal;display:flex;flex-direction:column;align-items:center;min-width:22px;padding:1px 2px;border-radius:3px;font-size:12px;line-height:1.1}
#ar-board .gb-hist i small{font-size:9px;opacity:.75}
#ar-board .gb-hist i.ct{background:#123050;color:#8fc4ff}#ar-board .gb-hist i.t{background:#4a3410;color:#ffc36b}
#ar-board .gb .th{border-radius:6px 6px 0 0}
#ar-board .gb.ct td{border-top-color:#8fc4ff22}#ar-board .gb.t td{border-top-color:#ffc36b22}
#ar-board .gb.ct tr td:first-child{box-shadow:inset 3px 0 #4f8fd8}#ar-board .gb.t tr td:first-child{box-shadow:inset 3px 0 #d9a03f}
#ar-board .gb-mvp{color:#ffd36b}
#ar-board .gb-bot{font:800 10px system-ui;padding:0 4px;border-radius:3px;background:#3d5566;color:#c9d6de;vertical-align:1px}
#ar-board .cols.gbc{gap:10px;grid-template-columns:1fr}
`;
