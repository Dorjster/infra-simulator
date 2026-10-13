// Post-match report for Global Defensive Defuse matches: built from the host's recorded match events (combat stats,
// kills / deaths / assists, round history — combat-logic.js / arena-defuse.js), shown when the match ends and kept for
// the session (Team menu → Last match report). Tabs: Overview · Teams · Players · Rounds. Nothing here is shown
// during a live round.
import { ARENA_MAPS } from './arena-maps.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SIDE = { t: 'Terrorists', ct: 'Counter-Terrorists' }, REASON = { elimination: ['☠', 'Eliminated'], bomb: ['💥', 'Bomb exploded'], defuse: ['✂', 'Bomb defused'], time: ['⏱', 'Time ran out'] };
// The report data (pure): from the game state at match end.
export function buildReport(G) {
  const C = G.combat || {}, d = C.d; if (!d?.matchOver) return null;
  const rounds = Math.max(1, (d.history || []).length), nameOf = k => C.names?.[k] || k.replace(/^bot /, 'BOT ').replace(/\b\w/g, c => c.toUpperCase());
  const players = Object.keys(d.teams).filter(k => d.teams[k] === 't' || d.teams[k] === 'ct').map(k => { const s = C.stats?.[k] || {}, kills = C.kills?.[k] || 0;
    return { k, name: nameOf(k), team: d.teams[k], kills, deaths: C.deaths?.[k] || 0, assists: C.assists?.[k] || 0, dmg: s.dmg || 0, adr: Math.round((s.dmg || 0) / rounds), hsKills: s.hsKills || 0, hs: kills ? Math.round((s.hsKills || 0) / kills * 100) : 0,
      shots: s.shots || 0, hits: s.hits || 0, acc: s.shots ? Math.round((s.hits || 0) / s.shots * 100) : 0, hsHits: s.hsHits || 0, util: s.util || 0, flashed: s.flashed || 0, blindS: Math.round((s.blindMs || 0) / 100) / 10, plants: s.plants || 0, defuses: s.defuses || 0 }; });
  const score = p => p.kills * 2 + p.assists + p.adr / 25 + p.plants + p.defuses * 2 + p.flashed * .3;
  const mvp = [...players].sort((a, b) => score(b) - score(a))[0] || null;
  return { map: ARENA_MAPS[G.arena?.map]?.name || G.arena?.map, at: d.matchOver.at, winner: d.matchOver.winner, score: { ...d.score }, rounds: (d.history || []).map(h => ({ ...h })), players, mvp: mvp?.k || null };
}
export function createReport({ notify = () => {} } = {}) {
  const css = document.createElement('style'); css.textContent = `
#gd-report{position:fixed;inset:0;z-index:95;display:grid;place-items:center;background:#05080bcc}#gd-report[hidden]{display:none}
#gd-report>div{width:min(1040px,96vw);max-height:92vh;overflow:auto;background:#0d141b;border:1px solid #ffffff2e;border-radius:10px;padding:18px 20px;color:#e8eef0;font:500 14px system-ui}
#gd-report h2{margin:0;font:900 26px system-ui;letter-spacing:.05em}#gd-report h2.t{color:#e8b25b}#gd-report h2.ct{color:#6fb1ef}#gd-report .sub{color:#93a6af;margin:2px 0 12px}
#gd-report nav{display:flex;gap:6px;margin:10px 0 14px;flex-wrap:wrap}#gd-report nav button,#gd-report .close{background:#ffffff14;border:1px solid #ffffff2e;color:#fff;border-radius:6px;padding:6px 12px;font:700 13px system-ui;cursor:pointer}#gd-report nav button[aria-pressed=true]{background:#2e6b8f;border-color:#6fb1ef}
#gd-report table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}#gd-report th{text-align:left;font:800 11px system-ui;letter-spacing:.08em;color:#93a6af;padding:4px 6px}#gd-report td{padding:5px 6px;border-top:1px solid #ffffff12}#gd-report td.n,#gd-report th.n{text-align:right}
#gd-report .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}#gd-report .card{background:#ffffff0c;border:1px solid #ffffff1c;border-radius:8px;padding:10px}#gd-report .card b{display:block;font:900 22px system-ui}#gd-report .card small{color:#93a6af}
#gd-report .rounds{display:flex;flex-wrap:wrap;gap:6px}#gd-report .rd{width:64px;padding:6px 4px;border-radius:6px;text-align:center;background:#ffffff0c;border-bottom:3px solid}#gd-report .rd.t{border-color:#e8b25b}#gd-report .rd.ct{border-color:#6fb1ef}#gd-report .rd small{display:block;color:#93a6af;font-size:11px}
#gd-report .row{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}#gd-report .t{color:#e8b25b}#gd-report .ct{color:#6fb1ef}`;
  (document.head || document.body).append?.(css); document.body.insertAdjacentHTML('beforeend', '<div id="gd-report" hidden><div></div></div>');
  const el = document.getElementById('gd-report'), box = el.firstElementChild || el; let rep = null, tab = 'overview', who = null, last = null;
  try { last = JSON.parse(sessionStorage.getItem('gd-last-report') || 'null'); } catch {}
  const table = (list, cols) => `<table><tr>${cols.map(([h, , n]) => `<th class="${n ? 'n' : ''}">${h}</th>`).join('')}</tr>${list.map(p => `<tr>${cols.map(([, f, n]) => `<td class="${n ? 'n' : ''}">${f(p)}</td>`).join('')}</tr>`).join('')}</table>`;
  const COLS = [['Player', p => `<span class="${p.team}">${esc(p.name)}</span>${p.k === rep.mvp ? ' ★' : ''}`], ['K', p => p.kills, 1], ['D', p => p.deaths, 1], ['A', p => p.assists, 1], ['ADR', p => p.adr, 1], ['HS%', p => p.kills ? p.hs + '%' : '–', 1], ['Accuracy', p => p.shots ? p.acc + '%' : '–', 1], ['Utility dmg', p => p.util, 1], ['Flashed', p => p.flashed, 1], ['Plants', p => p.plants, 1], ['Defuses', p => p.defuses, 1]];
  function draw() {
    if (!rep) return; const W = rep.winner, mvp = rep.players.find(p => p.k === rep.mvp), best = f => [...rep.players].sort((a, b) => f(b) - f(a))[0];
    const nav = [['overview', 'Overview'], ['teams', 'Teams'], ['players', 'Players'], ['rounds', 'Rounds']].map(([id, t]) => `<button data-rt="${id}" aria-pressed="${tab === id}">${t}</button>`).join('');
    let body = '';
    if (tab === 'overview') { const k = best(p => p.kills), a = best(p => p.adr), u = best(p => p.util + p.flashed * 20), h = best(p => p.kills ? p.hs : -1);
      body = `<div class="cards">${mvp ? `<div class="card"><small>MVP</small><b class="${mvp.team}">★ ${esc(mvp.name)}</b><small>${mvp.kills} kills · ${mvp.adr} ADR</small></div>` : ''}${k ? `<div class="card"><small>Most kills</small><b>${k.kills}</b><small>${esc(k.name)}</small></div>` : ''}${a ? `<div class="card"><small>Highest ADR</small><b>${a.adr}</b><small>${esc(a.name)}</small></div>` : ''}${h && h.kills ? `<div class="card"><small>Best head-shot rate</small><b>${h.hs}%</b><small>${esc(h.name)}</small></div>` : ''}${u ? `<div class="card"><small>Best utility</small><b>${u.util} dmg · ${u.flashed} flashed</b><small>${esc(u.name)}</small></div>` : ''}</div>
        <h3 style="margin:16px 0 6px">All players</h3>${table([...rep.players].sort((a, b) => b.kills - a.kills || b.adr - a.adr), COLS)}`; }
    if (tab === 'teams') body = ['t', 'ct'].map(t => { const L = rep.players.filter(p => p.team === t), sum = f => L.reduce((s, p) => s + f(p), 0);
      return `<h3 class="${t}" style="margin:12px 0 4px">${SIDE[t]} · ${rep.score[t]}${W === t ? ' · winners' : ''}</h3><p class="sub">Kills ${sum(p => p.kills)} · damage ${sum(p => p.dmg)} · utility ${sum(p => p.util)} · flashed ${sum(p => p.flashed)} · plants ${sum(p => p.plants)} · defuses ${sum(p => p.defuses)}</p>${table(L.sort((a, b) => b.kills - a.kills), COLS)}`; }).join('');
    if (tab === 'players') { const p = rep.players.find(x => x.k === who) || rep.players[0];
      body = `<div class="row"><label>Player <select data-rwho>${rep.players.map(x => `<option value="${esc(x.k)}"${x === p ? ' selected' : ''}>${esc(x.name)} (${x.team.toUpperCase()})</option>`).join('')}</select></label></div>${p ? `<div class="cards" style="margin-top:12px">${[['Kills / deaths / assists', `${p.kills} / ${p.deaths} / ${p.assists}`], ['Damage', `${p.dmg} (${p.adr} per round)`], ['Accuracy', p.shots ? `${p.acc}% · ${p.hits} of ${p.shots} shots` : 'no shots'], ['Head shots', `${p.hsKills} kills (${p.kills ? p.hs + '%' : '–'}) · ${p.hsHits} hits`], ['Utility damage', p.util], ['Flashbangs', `${p.flashed} enemies blinded · ${p.blindS} s`], ['Bomb', `${p.plants} plant${p.plants === 1 ? '' : 's'} · ${p.defuses} defuse${p.defuses === 1 ? '' : 's'}`]].map(([h, v]) => `<div class="card"><small>${h}</small><b style="font-size:17px">${esc(v)}</b></div>`).join('')}</div>` : ''}`; }
    if (tab === 'rounds') body = `<div class="rounds">${rep.rounds.map(r => `<div class="rd ${r.winner}" title="${esc(REASON[r.reason]?.[1] || r.reason)}"><b>${r.n}</b><small>${REASON[r.reason]?.[0] || '·'} ${r.winner.toUpperCase()}</small><small>${r.score.t}–${r.score.ct}</small></div>`).join('') || '<p class="sub">No rounds recorded.</p>'}</div><p class="sub" style="margin-top:10px">☠ eliminated · 💥 bomb exploded · ✂ bomb defused · ⏱ time ran out</p>`;
    box.innerHTML = `<div class="row"><div><h2 class="${W}">${SIDE[W].toUpperCase()} WIN ${rep.score[W]}–${rep.score[W === 't' ? 'ct' : 't']}</h2><div class="sub">${esc(rep.map)} · ${rep.rounds.length} rounds · ${new Date(rep.at).toLocaleTimeString()}</div></div><button class="close" data-rclose>Close (Esc)</button></div><nav>${nav}</nav>${body}`;
  }
  box.addEventListener?.('click', e => { const b = e.target.closest('[data-rt]'); if (b) { tab = b.dataset.rt; draw(); } if (e.target.closest('[data-rclose]')) api.close(); });
  box.addEventListener?.('change', e => { if (e.target.dataset.rwho !== undefined) { who = e.target.value; draw(); } });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !el.hidden) { e.stopPropagation(); api.close(); } }, true);
  const api = {
    get open() { return !el.hidden; }, get last() { return last; },
    show(r = last) { if (!r) { notify('No match report yet this session'); return false; } rep = r; tab = 'overview'; who = null; el.hidden = false; document.exitPointerLock?.(); draw(); return true; },
    close() { el.hidden = true; },
    // Called every frame: when a Defuse match ends, build the report from the host's numbers and show it once.
    update(G) { const d = G.combat?.d; if (!d?.matchOver || last?.at === d.matchOver.at) return; const r = buildReport(G); if (!r) return; last = r; try { sessionStorage.setItem('gd-last-report', JSON.stringify(r)); } catch {} this.show(r); },
  };
  return api;
}
