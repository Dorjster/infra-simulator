// Payday casino panel and wallet badge. The panel docks at the side so the 3D table stays in view; pressing
// E at a table also walks the camera to a seat there. Everything shown comes from the shared game state and
// is revealed on the same clock as the 3D table (casino-sync.js): cards appear as they land, the roulette
// number when the ball stops, slot wins when the reels stop, lotto balls as they reach the rack.
import { handValue, rouletteColor, LOTTO, TABLES, DANCES, SLOT_SYMBOLS, tableDef, DRINKS, DRINK_PRICE, luckOf, arsenalOf } from './casino-logic.js';
import { startedAt, SYNC, bjReveal, lottoPlan, boardLandsAt, hitLandsAt } from './casino-sync.js';
import { symbolImg } from './slot-symbols.js';
import { money, short } from './money.js';
import { WEAPONS, weaponById } from './weapons-data.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cardHTML = c => c === '??' ? '<span class="cz-card down"></span>' : `<span class="cz-card${/[♥♦]/.test(c) ? ' red' : ''}"><b>${esc(c.slice(0, -1))}</b>${esc(c.slice(-1))}</span>`;
const CHIPS = [10000, 50000, 100000, 500000, 1000000, 5000000, 20000000];   // tögrög chips
const DANCE_NOTES = ['Hands on the pole, spinning around it', 'Climbs hand over hand, sits with legs wrapped, slides down', 'High cabaret kicks downstage', 'Both hands high, a slow wave through the body', 'Point-up disco moves', 'Hangs out from the pole in a deep arch']

// Update a panel in place: only nodes whose content changed are touched, so a button under the pointer is the
// same element when the click completes, and cards / balls already shown don't replay their pop-in animation.
function morph(el, html) {
  const tpl = document.createElement?.('template'); if (!tpl?.content) { el.innerHTML = html; return; }
  tpl.innerHTML = html; patchChildren(el, tpl.content);
}
function patchChildren(a, b) {
  const an = [...a.childNodes], bn = [...b.childNodes];
  bn.forEach((n, i) => { if (an[i]) patchNode(an[i], n); else a.appendChild(n); });
  for (let i = bn.length; i < an.length; i++) an[i].remove();
}
function patchNode(o, n) {
  if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName) { o.replaceWith(n); return; }
  if (o.nodeType !== 1) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; return; }
  for (const { name } of [...o.attributes]) if (!n.hasAttribute(name)) o.removeAttribute(name);
  for (const { name, value } of [...n.attributes]) if (o.getAttribute(name) !== value) o.setAttribute(name, value);
  // Typed amounts and chosen options are left as the player set them.
  if (o.disabled !== n.disabled) o.disabled = n.disabled;
  patchChildren(o, n);
}
export function createCasinoUI({ world, lan, name, notify = () => {}, onOpen = () => {}, onClose = () => {}, onSeat = () => {}, actor = () => 'ENGINEER-01' }) {
  const g = () => world.operations.game, me = () => String(name() || 'Engineer').trim(), key = s => String(s || '').trim().toLowerCase();
  const myWallet = () => g().wallets?.[key(me())], T = id => g().casino?.tables?.[id];
  document.body.insertAdjacentHTML('beforeend', `<div id="cz-badge" hidden><span>WALLET</span><strong id="cz-cash">0₮</strong><em id="cz-delta"></em><b id="cz-luck" hidden></b></div>
<section id="casino-panel" hidden aria-label="Casino"><header><div><small id="cz-kicker">PAYDAY CASINO</small><h2 id="cz-title">Casino</h2></div><div class="cz-wallet"><span>Wallet</span><strong id="cz-panel-cash">$0</strong></div><button id="cz-close" aria-label="Close">×</button></header>
<nav><button data-cz="table">This table</button><button data-cz="wallet">Wallet &amp; loans</button></nav><div id="cz-body"></div><p id="cz-msg" role="status"></p></section>`);
  const style = document.createElement('style'); style.textContent = `
#cz-badge{position:fixed;top:16px;right:120px;z-index:36;background:linear-gradient(135deg,#2a0e19,#4a1626);border:1px solid #d8a945;border-radius:10px;padding:6px 14px;color:#f5ead3;font:600 13px system-ui;display:flex;gap:10px;align-items:baseline;box-shadow:0 4px 16px #0006}
#cz-badge span{font-size:10px;letter-spacing:.14em;color:#e2bc5c}#cz-badge strong{font-size:18px}#cz-badge em{font-style:normal;color:#7dffb0;font-size:13px;opacity:0;transition:opacity .3s}#cz-badge em.on{opacity:1}#cz-badge em.neg{color:#ff8a8a}
#casino-panel{position:fixed;top:70px;bottom:84px;right:16px;width:min(460px,44vw);z-index:45;background:linear-gradient(180deg,#2a0e19f2,#12060cf2);border:2px solid #d8a945;border-radius:14px;color:#f5ead3;font:14px/1.45 system-ui,sans-serif;display:flex;flex-direction:column;padding:12px 16px;box-shadow:0 16px 40px #000a}
#casino-panel[hidden]{display:none}#casino-panel header{display:flex;align-items:center;gap:12px}#casino-panel header small{letter-spacing:.18em;color:#e2bc5c;font-size:10px}#casino-panel h2{margin:0;font:700 22px Georgia,serif}
.cz-wallet{margin-left:auto;text-align:right}.cz-wallet span{display:block;font-size:10px;color:#c9b38a;letter-spacing:.1em}.cz-wallet strong{font:700 20px Georgia,serif;color:#ffe28a}
#cz-close{background:none;border:1px solid #d8a945;color:#f5ead3;border-radius:8px;width:34px;height:34px;font-size:18px;cursor:pointer}
#casino-panel nav{display:flex;gap:6px;margin:10px 0}#casino-panel nav button{flex:0 0 auto;background:#2a0e19;color:#f5ead3;border:1px solid #6b3a2c;border-radius:16px;padding:5px 12px;cursor:pointer;font:600 13px system-ui}#casino-panel nav button.on{background:#d8a945;color:#2a0e19}
#cz-body{flex:1;overflow:auto;min-height:0;padding-right:4px}#cz-msg{min-height:18px;margin:6px 0 0;color:#ffe28a;font-size:13px}
.cz-box{background:#0006;border:1px solid #5a2a35;border-radius:10px;padding:8px 10px;margin-bottom:8px}.cz-box.turn{border-color:#ffe28a}.cz-box.me{background:#0009}
.cz-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.cz-card{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:34px;height:48px;margin:1px;border-radius:5px;background:#fbfaf5;color:#111;font:700 15px Georgia,serif;box-shadow:0 2px 4px #0006;animation:czdeal .25s}.cz-card b{font-size:12px}.cz-card.red{color:#c4142b}.cz-card.down{background:repeating-linear-gradient(45deg,#8c1c2c 0 5px,#a8283a 5px 10px);border:2px solid #e8c35a}@keyframes czdeal{from{transform:translateY(-14px);opacity:0}}
.cz-btn{background:#d8a945;color:#2a0e19;border:0;border-radius:8px;padding:8px 13px;font-weight:700;cursor:pointer}.cz-btn.alt{background:#2a0e19;color:#f5ead3;border:1px solid #d8a945}.cz-btn:disabled{opacity:.4;cursor:not-allowed}
.cz-chip{width:40px;height:40px;border-radius:50%;border:3px dashed #fff8;color:#fff;font:800 11px system-ui;cursor:pointer}.cz-chip.on{outline:3px solid #ffe28a}
.cz-board{display:grid;grid-template-columns:repeat(13,1fr);gap:2px;margin:6px 0}.cz-board button{border:1px solid #f2e6c4;color:#fff;font:700 11px system-ui;padding:6px 0;border-radius:3px;cursor:pointer;position:relative}.cz-board .red{background:#b51624}.cz-board .black{background:#151515}.cz-board .green{background:#0d7a3e}.cz-board i{position:absolute;right:0;top:-7px;background:#e2bc5c;color:#2a0e19;border-radius:8px;font:700 9px system-ui;padding:0 3px;font-style:normal}
.cz-result{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;font:700 22px Georgia;border:3px solid #ffe28a}.cz-result.red{background:#b51624}.cz-result.black{background:#151515}.cz-result.green{background:#0d7a3e}
.cz-balls{display:grid;grid-template-columns:repeat(9,1fr);gap:4px}.cz-balls button{aspect-ratio:1;border-radius:50%;border:2px solid #fff4;color:#fff;font-weight:800;cursor:pointer;background:#2a0e19;font-size:12px}.cz-balls button.on{background:#d8a945;color:#2a0e19}
.cz-drawn{display:flex;gap:8px;margin:8px 0}.cz-drawn span{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font:800 15px system-ui;color:#111;background:#fff;animation:czpop .35s}.cz-drawn span.hit{background:#7dffb0}.cz-drawn span.wait{background:#fff2;color:#fff6;animation:none}@keyframes czpop{from{transform:scale(0)}}
.cz-reels{display:flex;gap:6px;justify-content:center;background:linear-gradient(#e9e2cf,#fbf6e8 30%,#fbf6e8 70%,#e9e2cf);border:3px solid #d8a945;border-radius:10px;padding:8px;margin:8px 0}.cz-reels span{width:70px;text-align:center;border-right:1px solid #d8cfb8}.cz-reels span:last-child{border:0}.cz-reels.spin span{animation:czreel .12s linear infinite}@keyframes czreel{50%{transform:translateY(-8px);opacity:.5}}
.cz-table{width:100%;border-collapse:collapse}.cz-table td,.cz-table th{padding:4px 6px;border-bottom:1px solid #5a2a35;text-align:left;font-size:13px}.cz-form{display:flex;gap:6px;flex-wrap:wrap;align-items:end;margin:8px 0}.cz-form input,.cz-form select{background:#14060c;color:#f5ead3;border:1px solid #d8a945;border-radius:6px;padding:6px;font-size:14px;width:110px}
.cz-dances{display:grid;grid-template-columns:1fr 1fr;gap:6px}.cz-dances button{text-align:left;background:#2a0e19;color:#f5ead3;border:1px solid #d8a945;border-radius:8px;padding:8px;cursor:pointer}.cz-dances button b{display:block;color:#ff7ab0}
@media(max-width:900px){#casino-panel{width:auto;left:8px;right:8px;top:auto;height:52vh}}`;
  (document.head || document.body).append?.(style);
  const $ = id => document.getElementById(id);
  let renderedAt = 0, open = false, table = 'bj-1', tab = 'table', chip = 100000, picks = new Set(), lastKey = '', lastCash = null, deltaTimer = 0, helloAt = 0, buyIn = 4000000, raiseTo = 0, tipAmt = 200000, slotBet = 10000;
  const v = { set chip(x) { chip = x; } };
  function send(action) {
    return (lan.connected ? lan.send({ type: 'casino', action }) : Promise.resolve().then(() => world.apply({ type: 'casino', action }, actor())))
      .then(r => { const m = typeof r === 'string' ? r : r?.message || '', wait = SUSPENSE[action.type]; $('cz-msg').textContent = wait ? wait[0] : m; if (wait) setTimeout(() => { if ($('cz-msg').textContent === wait[0]) $('cz-msg').textContent = ''; }, wait[1]); render(true); return m; })
      .catch(e => { $('cz-msg').textContent = e.message; render(true); return 'ERR ' + e.message; });
  }
  // Results arrive with the reply, but are revealed only when the 3D table shows them.
  const SUSPENSE = { 'sl-spin': ['Reels spinning…', SYNC.slots], lotto: ['Ticket bought · watch the machine', 3000], 'rl-spin': ['No more bets · watch the wheel', SYNC.roulette] };   // [text, ms shown]
  // Winnings this player can't see yet (reels, ball, lotto draw or dealer still going): held back from the
  // wallet display so the balance never gives the result away.
  function held() {
    const now = performance.now(), mine = n => key(n) === key(me()); let sum = 0;
    for (const [id, t] of Object.entries(g().casino?.tables || {})) {
      const def = tableDef(id); if (!def || !t) continue;
      if (def.game === 'slots' && t.last && mine(t.last.name) && now - startedAt('sl:' + id + ':' + t.last.spin) <= SYNC.slots) sum += t.last.pay;
      if (def.game === 'roulette' && t.round && (t.phase === 'spinning' || now - startedAt('rl:' + id + ':' + t.round) < SYNC.roulette)) for (const [n, a] of Object.entries(t.lastWinners || {})) if (mine(n)) sum += a + (t.lastBets || []).filter(b => mine(b.name) && b.won).reduce((x, b) => x + b.amount, 0);
      if (def.game === 'blackjack' && t.phase === 'done' && !bjReveal(id, t, now).settled) for (const st of t.seats) if (mine(st.name)) sum += st.payout || 0;
      if (def.game === 'lotto') { const plan = lottoPlan(t, now); for (const i of plan.items) if (mine(i.x.name) && i.e < (LOTTO.picks + .3) * SYNC.lottoBall) sum += i.x.prize; }
    }
    return sum;
  }
  const shownCash = () => (myWallet()?.cash || 0) - held();
  const hash = s => [...String(s)].reduce((a, c) => a * 31 + c.charCodeAt(0) >>> 0, 7);
  function mySeat(id) { const t = T(id), def = tableDef(id); if (!t || !def) return 0; if (def.game === 'blackjack') { const i = t.seats.findIndex(s => key(s.name) === key(me())); return i >= 0 ? i : Math.min(4, t.seats.length); } if (def.game === 'poker') { const i = t.seats.findIndex(s => s && key(s.name) === key(me())); return i >= 0 ? i : Math.max(0, t.seats.findIndex(s => !s)); } return hash(me()) % 5; }
  function show(which) {
    if (!g().payday) { notify('The casino is open in Payday mode · start it from the start screen'); return false; }
    if (which === 'wallet') { tab = 'wallet'; } else if (which) { table = which; tab = 'table'; }
    open = true; $('casino-panel').hidden = false; document.exitPointerLock?.(); onOpen(); if (tab === 'table') onSeat(table, mySeat(table)); render(true); return true;
  }
  function hide() { if (!open) return; open = false; $('casino-panel').hidden = true; onClose(); }
  $('cz-close').onclick = hide;
  [...(document.querySelectorAll?.('[data-cz]') || [])].forEach(b => b.onclick = () => { tab = b.dataset.cz; render(true); });
  const secs = at => at ? Math.max(0, Math.ceil((at - Date.now()) / 1000)) + ' s' : '';
  const chipsHTML = (def, values = CHIPS) => `<div class="cz-row">${values.filter(x => !def || x >= def.min && x <= def.max).map((x, i) => `<button class="cz-chip${chip === x ? ' on' : ''}" data-chip="${x}" style="background:${['#f5f5f5;color:#222', '#dc2626', '#16a34a', '#1a1a1a', '#8b5cf6', '#d8a945', '#0e7490'][CHIPS.indexOf(x)]}">${short(x).replace('₮', '')}</button>`).join('')}</div>`;

  function blackjackHTML(id, def, t) {
    const now = performance.now(), t0 = startedAt('bj:' + id + ':' + t.round), n = t.seats.length, landed = order => now - t0 >= order * SYNC.dealCard + 320;
    const mine = t.seats.find(s => key(s.name) === key(me())), myTurn = t.phase === 'playing' && t.seats[t.turn] === mine;
    const rv = bjReveal(id, t, now), settled = t.phase !== 'done' || rv.settled;
    const dealer = t.dealer.map((c, i) => i < 2 && !landed(i === 0 ? n : 2 * n + 1) || now < rv.cardAt(i) + (i >= 2 ? SYNC.cardFlight : 0) ? '' : cardHTML(i === 1 && !(t.phase === 'done' && now >= rv.cardAt(1)) ? '??' : c)).join('');
    const seats = t.seats.map((s, i) => { const onFelt = (s.cards || []).filter((c, k) => !(k < 2 ? !landed(k === 0 ? i : n + 1 + i) : now < hitLandsAt(id + ':' + t.round + ':' + i + ':' + k, now))), cs = onFelt.map(cardHTML).join(''); return `<div class="cz-box${t.turn === i && t.phase === 'playing' ? ' turn' : ''}${s === mine ? ' me' : ''}"><b>${esc(s.name)}</b> · ${money(s.bet)}${s.doubled ? ' · doubled' : ''}<div>${cs}</div><small>${onFelt.length ? handValue(onFelt) : ''}${s.result && settled ? ' · <b>' + s.result.toUpperCase() + '</b>' + (s.payout > s.bet ? ' +' + money(s.payout - s.bet) : '') : ''}</small></div>`; }).join('');
    const status = t.phase === 'betting' ? (n ? 'Dealing in ' + secs(t.closesAt) + ' · or press Deal' : 'Place a bet to take a seat') : t.phase === 'playing' ? (myTurn ? 'Your turn · ' + secs(t.turnEndsAt) : (t.seats[t.turn]?.name || '') + ' is playing') : t.phase === 'done' && settled ? esc(t.log[0] || '') : 'Dealer plays…';
    return `<div class="cz-box"><b>Dealer</b> ${dealer || '<em>—</em>'} ${t.phase === 'done' && settled && t.dealer.length ? '<b>' + handValue(t.dealer) + '</b>' : ''}</div>${seats || '<p><em>Empty table · up to 5 players</em></p>'}<p>${status}</p>
     ${t.phase === 'betting' ? chipsHTML(def) + `<div class="cz-row" style="margin-top:8px"><button class="cz-btn" data-act="bj-bet">${mine ? 'Add' : 'Bet & sit'} ${money(chip)}</button><button class="cz-btn alt" data-act="bj-deal" ${n ? '' : 'disabled'}>Deal now</button>${mine ? '<button class="cz-btn alt" data-act="bj-leave">Leave seat</button>' : ''}</div>` : ''}
     ${myTurn ? `<div class="cz-row"><button class="cz-btn" data-act="bj-hit">Hit</button><button class="cz-btn" data-act="bj-stand">Stand</button><button class="cz-btn alt" data-act="bj-double" ${mine.cards.length === 2 ? '' : 'disabled'}>Double (${money(mine.bet)})</button></div>` : ''}`;
  }
  function rouletteHTML(id, def, t) {
    const now = performance.now(), rolling = t.round && (t.phase === 'spinning' || now - startedAt('rl:' + id + ':' + t.round) < SYNC.roulette), last = rolling ? null : t.history?.[0];
    const mine = t.bets.filter(b => key(b.name) === key(me())), on = (k, x) => t.bets.filter(b => b.kind === k && (x === undefined || b.value === x)).reduce((a, b) => a + b.amount, 0);
    const n = x => { const amt = on('straight', x); return `<button class="${rouletteColor(x)}" data-rl="straight" data-v="${x}">${x}${amt ? `<i>${short(amt).replace('₮', '')}</i>` : ''}</button>`; };
    let grid = `<button class="green" data-rl="straight" data-v="0" style="grid-row:span 3">0</button>`; for (const row of [3, 2, 1]) for (let col = 1; col <= 12; col++) grid += n((col - 1) * 3 + row);
    const outside = [['low', '1–18'], ['even', 'Even'], ['red', 'Red'], ['black', 'Black'], ['odd', 'Odd'], ['high', '19–36']].map(([k, l]) => `<button class="cz-btn alt" data-rl="${k}">${l}${on(k) ? ' ' + money(on(k)) : ''}</button>`).join('') + [1, 2, 3].map(x => `<button class="cz-btn alt" data-rl="dozen" data-v="${x}">${x === 1 ? '1st' : x === 2 ? '2nd' : '3rd'} 12</button>`).join('') + [1, 2, 3].map(x => `<button class="cz-btn alt" data-rl="column" data-v="${x}">Col ${x}</button>`).join('');
    const won = !rolling && t.lastWinners ? Object.entries(t.lastWinners).map(([w, a]) => esc(w) + ' +' + money(a)).join(' · ') : '';
    return `<div class="cz-row">${last !== undefined && last !== null ? `<div class="cz-result ${rouletteColor(last)}">${last}</div>` : ''}<div><b>${rolling ? 'No more bets · watch the wheel' : 'Place your bets'}</b><br>${won ? 'Winners: ' + won : ''}<br><small>Last: ${(rolling ? t.history.slice(1) : t.history || []).slice(0, 12).join(' · ')}</small></div></div>
     <div class="cz-board">${grid}</div><div class="cz-row">${outside}</div>${chipsHTML(def)}
     <p>Your bets: ${mine.length ? mine.map(b => esc(b.kind + (b.value !== null ? ' ' + b.value : '') + ' ' + money(b.amount))).join(' · ') : 'none'}</p>
     <div class="cz-row"><button class="cz-btn" data-act="rl-spin" ${t.phase === 'spinning' || !t.bets.length ? 'disabled' : ''}>Spin</button><button class="cz-btn alt" data-act="rl-clear" ${t.phase === 'spinning' || !mine.length ? 'disabled' : ''}>Take back my bets</button></div>`;
  }
  function pokerHTML(id, def, t) {
    const now = performance.now(), t0 = startedAt('pk:' + id + ':' + t.hand), seated = t.seats.filter(Boolean).length;
    const holeIn = (i, k) => now - t0 >= (k * seated + i) * SYNC.dealCard + SYNC.cardFlight, boardIn = i => now >= boardLandsAt(id, t.hand, i, now);
    const seat = t.seats.findIndex(s => s && key(s.name) === key(me())), mine = t.seats[seat], myTurn = mine && t.toAct === seat && !['waiting', 'showdown'].includes(t.phase), owe = mine ? t.currentBet - mine.bet : 0;
    const pot = t.seats.reduce((a, s) => a + (s?.total || 0), 0), minTo = t.currentBet + t.minRaise; if (!raiseTo || raiseTo < minTo) raiseTo = minTo;
    const seats = t.seats.map((s, i) => !s ? `<div class="cz-box"><small>Seat ${i + 1} · empty</small>${!mine ? ` <button class="cz-btn alt" data-sit="${i}">Sit here</button>` : ''}</div>` : `<div class="cz-box${t.toAct === i && !['waiting', 'showdown'].includes(t.phase) ? ' turn' : ''}${i === seat ? ' me' : ''}"><b>${esc(s.name)}</b>${t.button === i ? ' · D' : ''}${t.sbSeat === i && t.phase !== 'waiting' ? ' · SB' : ''}${t.bbSeat === i && t.phase !== 'waiting' ? ' · BB' : ''} · ${money(s.stack)}${s.bet ? ' · bet ' + money(s.bet) : ''}${s.folded ? ' · folded' : s.allIn ? ' · ALL-IN' : ''}<div>${(s.cards || []).map((c, k) => holeIn(i, k) ? cardHTML(c) : '').join('')}${s.best && s.shown ? ' <small>' + esc(s.best.name) + '</small>' : ''}</div><small>${esc(s.lastAction || '')}</small></div>`).join('');
    return `<div class="cz-box"><b>Board</b> ${t.board.map((c, i) => boardIn(i) ? cardHTML(c) : '').join('') || '<em>—</em>'} · pot ${money(pot)}<br><small>${t.phase === 'waiting' ? (t.seats.filter(Boolean).length < 2 ? 'Waiting for a second player' : 'Next hand starting') : t.phase === 'showdown' ? esc(t.log[0] || '') : t.phase.toUpperCase() + ' · ' + (t.seats[t.toAct]?.name || '') + ' to act · ' + secs(t.actionEndsAt)}</small></div>${seats}
     ${!mine ? `<div class="cz-form"><label>Buy-in <input id="cz-buyin" type="number" min="${def.minBuy}" max="${def.maxBuy}" value="${buyIn}"></label><span><small>${money(def.minBuy)}–${money(def.maxBuy)} · blinds $${def.sb}/$${def.bb}</small></span></div>` : ''}
     ${myTurn ? `<div class="cz-row"><button class="cz-btn alt" data-act="pk-fold">Fold</button>${owe > 0 ? `<button class="cz-btn" data-act="pk-call">Call ${money(Math.min(owe, mine.stack))}</button>` : '<button class="cz-btn" data-act="pk-check">Check</button>'}</div><div class="cz-form"><label>${t.currentBet ? 'Raise to' : 'Bet'} <input id="cz-raise" type="number" min="${minTo}" max="${mine.bet + mine.stack}" value="${Math.min(raiseTo, mine.bet + mine.stack)}"></label><button class="cz-btn" data-act="pk-raise">${t.currentBet ? 'Raise' : 'Bet'}</button><button class="cz-btn alt" data-act="pk-allin">All-in ${money(mine.stack + mine.bet)}</button></div>` : ''}
     ${mine ? `<div class="cz-row"><button class="cz-btn alt" data-act="pk-leave">Leave table (cash out)</button>${['waiting', 'showdown'].includes(t.phase) && mine.stack < def.maxBuy ? `<button class="cz-btn alt" data-act="pk-rebuy">Top up ${money(Math.min(2000000, def.maxBuy - mine.stack))}</button>` : ''}</div>` : ''}
     <p class="cz-note"><small>Texas Hold'em · no limit · your cards are only shown to you · 30 s to act</small></p>`;
  }
  function slotsHTML(id, def, t) {
    const last = t.last, e = last ? performance.now() - startedAt('sl:' + id + ':' + last.spin) : 1e9, done = e > SYNC.slots, mineLast = last && key(last.name) === key(me());
    const reels = last ? last.reels.map((r, k) => e > SYNC.slots * (.55 + k * .2) ? r : Math.floor(e / 90 + k * 2) % 6) : [5, 5, 5];
    return `<div class="cz-reels${last && !done ? ' spin' : ''}">${reels.map(r => `<span>${symbolImg(r, 56)}</span>`).join('')}</div>
     <p>${last ? (done ? (last.pay ? `<b>${esc(last.name)} won ${money(last.pay)}!</b>` : esc(last.name) + ' · no win') : esc(last.name) + ' is spinning…') : 'Pull the lever'}</p>
     <div class="cz-form"><label>Bet <input id="cz-slotbet" type="number" min="${def.min}" max="${def.max}" value="${Math.max(def.min, Math.min(def.max, slotBet))}"></label><button class="cz-btn" data-act="sl-spin" ${last && !done ? 'disabled' : ''}>Spin</button></div>
     <table class="cz-table">${[[5, '250×'], [4, '75×'], [3, '30×'], [2, '15×'], [1, '8×'], [0, '6×']].map(([i, p]) => `<tr><td>${symbolImg(i, 22).repeat(3)}</td><td>${p}</td></tr>`).join('')}<tr><td>any two ${symbolImg(0, 22)}</td><td>2.5×</td></tr><tr><td colspan=2><small>${money(def.min)}–${money(def.max)} a spin</small></td></tr></table>`;
  }
  function lottoHTML(t) {
    const plan = lottoPlan(t), mine = t.last?.find(x => key(x.name) === key(me())), e = mine ? plan.of(mine).e : 1e9, now = plan.shown && plan.shown.e < (LOTTO.picks + .3) * SYNC.lottoBall ? plan.shown.x : null;
    const balls = Array.from({ length: LOTTO.numbers }, (_, i) => i + 1).map(x => `<button data-pick="${x}" class="${picks.has(x) ? 'on' : ''}">${x}</button>`).join('');
    const shown = mine ? mine.balls.map((b, i) => e >= (i + 1) * SYNC.lottoBall ? `<span class="${mine.picks.includes(b) ? 'hit' : ''}">${b}</span>` : '<span class="wait">?</span>').join('') : '', done = mine && e >= (LOTTO.picks + .3) * SYNC.lottoBall;
    return `<h3 style="margin:0;font:700 24px Georgia;color:#ffe28a">JACKPOT ${money(t.jackpot)}</h3><p>Pick ${LOTTO.picks} of ${LOTTO.numbers} (${picks.size}/${LOTTO.picks}) · ${money(LOTTO.price)} · 2 → ${money(LOTTO.pays[2])} · 3 → ${money(LOTTO.pays[3])} · 4 → ${money(LOTTO.pays[4])} · 5 → jackpot</p><div class="cz-balls">${balls}</div>
     <div class="cz-row" style="margin-top:8px"><button class="cz-btn alt" data-act="quick">Quick pick</button><button class="cz-btn alt" data-act="clearpicks">Clear</button><button class="cz-btn" data-act="lotto" ${picks.size === LOTTO.picks && (!mine || done) ? '' : 'disabled'}>Buy ticket · ${money(LOTTO.price)}</button></div>
     <p><b>${now ? 'Machine: drawing for ' + esc(now.name) : 'Machine ready'}</b></p>
     ${mine ? `<div class="cz-drawn">${shown}</div><p>${done ? `<b>${mine.hits} matched</b> · ${mine.prize ? 'you won ' + money(mine.prize) + '!' : 'no prize this time'}` : e < 0 ? 'Your ticket is in the queue · drawn in ' + Math.ceil(-e / 1000) + ' s' : 'Drawing your ticket… watch the machine'}</p>` : ''}
     <table class="cz-table">${plan.items.slice(0, 5).map(({ x, e: xe }) => xe >= (LOTTO.picks + .3) * SYNC.lottoBall ? `<tr><td>${esc(x.name)}</td><td>${x.balls.join(' · ')}</td><td>${x.hits}/5</td><td>${x.prize ? money(x.prize) : '—'}</td></tr>` : `<tr><td>${esc(x.name)}</td><td colspan=3><em>${xe < 0 ? 'waiting' : 'drawing…'}</em></td></tr>`).join('')}</table>`;
  }
  // Bar: every drink the same price; each gives a few minutes of random luck (good or bad) on your own slots and lotto.
  function barHTML(t) {
    const l = luckOf(g(), me()), left = l ? Math.ceil((l.until - Date.now()) / 1000) : 0;
    return `<div class="cz-box">${l ? `<b style="color:${l.kind === 'lucky' ? '#7dffb0' : '#ff8a8a'}">${l.kind === 'lucky' ? '🍀 LUCKY' : '☁ UNLUCKY'}</b> from ${esc(l.drink)} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left` : 'Sober · no luck either way'}<br><small>Every drink is ${money(DRINK_PRICE)}. Luck is random — good or bad — and only touches <b>your own</b> slot spins and lotto draws. Roulette, blackjack and poker stay pure chance.</small></div>
     <div class="cz-dances">${DRINKS.map(d => `<button data-drink="${d.id}"><b>${esc(d.name)}</b>${d.min} min · ${Math.round(d.strength * 100)}% effect</button>`).join('')}</div>
     ${t?.last ? `<p><small>Last served: ${esc(t.last.name)} · ${esc(t.last.drink)}</small></p>` : ''}`;
  }
  // Weapon market: eight guns, each bought once; press 4 to draw and cycle.
  function marketHTML(t) {
    const own = arsenalOf(g(), me()), cash = shownCash();
    return `<p><small>Guns are for Payday shoot-outs between engineers: 100 HP each, head shots hurt more, a knocked-out engineer respawns after 5 s. Press <b>4</b> to draw and cycle your guns, <b>left click</b> to fire, <b>P</b> to switch first / third person.</small></p>
     <table class="cz-table">${WEAPONS.map(w => `<tr><td><b>${esc(w.name)}</b><br><small>${w.pellets ? w.pellets + ' × ' + w.dmg : w.dmg} dmg · ${Math.round(60000 / w.rateMs)} rpm${w.auto ? ' · auto' : ''} · range ${Math.round(w.range * .165)} m</small></td><td>${money(w.price)}</td><td>${own.includes(w.id) ? '<b style="color:#7dffb0">Owned</b>' : `<button class="cz-btn" data-buy="${w.id}" ${cash < w.price ? 'disabled' : ''}>Buy</button>`}</td></tr>`).join('')}</table>
     ${own.includes('cannon') ? `<p><small>You also carry ${esc(weaponById('cannon').name)}.</small></p>` : ''}`;
  }
  function stageHTML(def, t) {
    const active = t.dance >= 0 && Date.now() < t.until;
    return `<div class="cz-box"><b>${active ? 'Now: ' + esc(DANCES[t.dance]) + ' · for ' + esc(t.by) + ' · ' + secs(t.until) : 'Dancing her routine · tip for a special move'}</b><br><small>${t.queue.length ? 'Next: ' + t.queue.map(q => esc(DANCES[q.dance]) + ' (' + esc(q.name) + ')').join(' · ') : 'No requests waiting'}</small></div>
     <div class="cz-form"><label>Tip <input id="cz-tip" type="number" min="${def.min}" max="${def.max}" value="${tipAmt}"></label><small>${money(def.min)} minimum · tips go to the performer</small></div>
     <div class="cz-dances">${DANCES.map((d, i) => `<button data-dance="${i}"><b>${esc(d)}</b><small>${DANCE_NOTES[i]}</small></button>`).join('')}</div>
     <p><small>Total tips tonight ${money(t.tips)} · ${esc(t.log[0] || '')}</small></p>`;
  }
  function walletHTML() {
    const w = myWallet() || { cash: 0, salary: 0, won: 0, lost: 0, log: [] }, all = Object.values(g().wallets || {}).sort((a, b) => b.cash - a.cash), loans = (g().loans || []).filter(l => l.owed > 0), others = all.filter(x => key(x.name) !== key(me()));
    return `<table class="cz-table"><tr><td>Cash</td><th>${money(shownCash())}</th></tr><tr><td>Salary earned</td><td>${money(w.salary)}</td></tr><tr><td>Casino winnings / losses</td><td>${money(w.won)} / ${money(w.lost)}</td></tr></table>
     <h3>Lend money</h3>${others.length ? `<div class="cz-form"><label>To <select id="cz-lend-to">${others.map(o => `<option>${esc(o.name)}</option>`).join('')}</select></label><label>Amount <input id="cz-lend-amt" type="number" min="1000" step="100000" value="1000000"></label><button class="cz-btn" data-act="lend">Lend</button></div>` : '<p>Nobody else has a wallet yet.</p>'}
     <h3>Loans</h3><table class="cz-table">${loans.map(l => `<tr><td>${esc(l.lender)} → ${esc(l.borrower)}</td><td>${money(l.owed)} / ${money(l.amount)}</td><td>${key(l.borrower) === key(me()) ? `<button class="cz-btn" data-repay="${l.id}">Repay</button> <button class="cz-btn alt" data-repay-part="${l.id}">$100</button>` : key(l.lender) === key(me()) ? `<button class="cz-btn alt" data-forgive="${l.id}">Forgive</button>` : ''}</td></tr>`).join('') || '<tr><td>No open loans</td></tr>'}</table>
     <h3>Rich list</h3><table class="cz-table">${all.map((x, i) => `<tr><td>${i + 1}. ${esc(x.name)}</td><th>${money(x.cash)}</th><td><small>salary ${money(x.salary)}</small></td></tr>`).join('')}</table>
     <h3>History</h3><table class="cz-table">${(w.log || []).slice(0, 12).map(e => `<tr><td>${esc(e.text)}</td><td style="color:${e.amount >= 0 ? '#7dffb0' : '#ff8a8a'}">${e.amount >= 0 ? '+' : ''}${money(e.amount)}</td></tr>`).join('')}</table>`;
  }
  function render(force) {
    const game = g(); if (!open || !game.payday || !game.casino?.tables) return;
    if (!force && performance.now() - renderedAt < 100) return; renderedAt = performance.now();                // change check 10× a second, not every frame
    const def = tableDef(table), t = T(table), anim = Math.floor(performance.now() / 250);
    const k = JSON.stringify([tab, table, t, tab === 'wallet' ? [game.wallets, game.loans, shownCash()] : shownCash(), chip, [...picks], anim]);
    if (!force && k === lastKey) return; const typing = document.activeElement?.closest?.('#casino-panel') && document.activeElement.tagName === 'INPUT'; if (!force && typing && k.slice(0, -4) === lastKey.slice(0, -4)) return; lastKey = k;
    [...(document.querySelectorAll?.('[data-cz]') || [])].forEach(b => b.classList?.toggle('on', b.dataset.cz === tab));
    $('cz-kicker').textContent = tab === 'wallet' ? 'PAYDAY CASINO · CASHIER' : 'PAYDAY CASINO · ' + (def.min ? money(def.min) + '–' + money(def.max) : def.game === 'poker' ? 'BLINDS ' + money(def.sb) + ' / ' + money(def.bb) : 'LOTTO');
    $('cz-title').textContent = tab === 'wallet' ? 'Wallet & loans' : def.name; $('cz-panel-cash').textContent = money(shownCash());
    const body = $('cz-body'), scroll = body.scrollTop;
    morph(body, tab === 'wallet' ? walletHTML() : def.game === 'blackjack' ? blackjackHTML(table, def, t) : def.game === 'roulette' ? rouletteHTML(table, def, t) : def.game === 'poker' ? pokerHTML(table, def, t) : def.game === 'slots' ? slotsHTML(table, def, t) : def.game === 'stage' ? stageHTML(def, t) : def.game === 'bar' ? barHTML(t) : def.game === 'market' ? marketHTML(t) : lottoHTML(t));
    body.scrollTop = scroll;
    const q = s => [...(body.querySelectorAll?.(s) || [])], num = (sel, fallback) => +(body.querySelector?.(sel)?.value ?? fallback);
    q('[data-chip]').forEach(b => b.onclick = () => { chip = +b.dataset.chip; render(true); });
    q('[data-rl]').forEach(b => b.onclick = () => send({ type: 'rl-bet', table, kind: b.dataset.rl, value: b.dataset.v !== undefined ? +b.dataset.v : undefined, amount: chip }));
    q('[data-pick]').forEach(b => b.onclick = () => { const x = +b.dataset.pick; if (picks.has(x)) picks.delete(x); else if (picks.size < LOTTO.picks) picks.add(x); render(true); });
    q('[data-sit]').forEach(b => b.onclick = () => { buyIn = num('#cz-buyin', buyIn); send({ type: 'pk-sit', table, seat: +b.dataset.sit, buyIn }).then(() => onSeat(table, mySeat(table))); });
    q('[data-drink]').forEach(b => b.onclick = () => send({ type: 'drink', drink: b.dataset.drink }));
    q('[data-buy]').forEach(b => b.onclick = () => send({ type: 'buy-weapon', weapon: b.dataset.buy }));
    q('[data-dance]').forEach(b => b.onclick = () => { tipAmt = num('#cz-tip', tipAmt); send({ type: 'st-tip', table: 'stage', dance: +b.dataset.dance, amount: tipAmt }); });
    q('[data-repay]').forEach(b => b.onclick = () => send({ type: 'repay', id: b.dataset.repay })); q('[data-repay-part]').forEach(b => b.onclick = () => send({ type: 'repay', id: b.dataset.repayPart, amount: 100 })); q('[data-forgive]').forEach(b => b.onclick = () => send({ type: 'forgive', id: b.dataset.forgive }));
    q('input').forEach(i => i.oninput = () => { if (i.id === 'cz-buyin') buyIn = +i.value; if (i.id === 'cz-raise') raiseTo = +i.value; if (i.id === 'cz-tip') tipAmt = +i.value; if (i.id === 'cz-slotbet') slotBet = +i.value; });
    q('[data-act]').forEach(b => b.onclick = () => {
      const a = b.dataset.act;
      if (a === 'bj-bet') return send({ type: 'bj-bet', table, amount: chip }).then(() => onSeat(table, mySeat(table)));
      if (a === 'quick') { picks = new Set(); while (picks.size < LOTTO.picks) picks.add(1 + Math.floor(Math.random() * LOTTO.numbers)); return render(true); }
      if (a === 'clearpicks') { picks = new Set(); return render(true); }
      if (a === 'lotto') return send({ type: 'lotto', picks: [...picks] });
      if (a === 'lend') return send({ type: 'lend', to: body.querySelector('#cz-lend-to').value, amount: num('#cz-lend-amt', 0) });
      if (a === 'pk-raise') return send({ type: 'pk-raise', table, to: num('#cz-raise', raiseTo) });
      if (a === 'pk-rebuy') return send({ type: 'pk-rebuy', table, amount: Math.min(2000000, def.maxBuy - (T(table).seats.find(s => s && key(s.name) === key(me()))?.stack || 0)) });
      if (a === 'sl-spin') return send({ type: 'sl-spin', table, amount: num('#cz-slotbet', slotBet) });
      return send({ type: a, table });
    });
  }
  // Badge, salary pop-ups and the first "hello" that opens a wallet for this engineer.
  function update() {
    const game = g(), on = !!game.payday; $('cz-badge').hidden = !on;
    if (!on) { lastCash = null; if (open) hide(); return; }
    const w = myWallet();
    if (!w && Date.now() - helloAt > 4000) { helloAt = Date.now(); send({ type: 'hello' }).catch(() => {}); }
    { const l = luckOf(game, me()), b = $('cz-luck'); b.hidden = !l; if (l) { b.textContent = l.kind === 'lucky' ? '🍀 lucky' : '☁ unlucky'; b.style.color = l.kind === 'lucky' ? '#7dffb0' : '#ff8a8a'; } }
    if (w) { const cash = shownCash(); $('cz-cash').textContent = money(cash); if (lastCash !== null && cash !== lastCash) { const d = cash - lastCash, el = $('cz-delta'); el.textContent = (d > 0 ? '+' : '') + money(d) + (w.log?.[0]?.text?.startsWith('Salary') && d > 0 ? ' salary' : w.log?.[0]?.text === 'Level bonus' ? ' level bonus' : ''); el.className = 'on' + (d < 0 ? ' neg' : ''); clearTimeout(deltaTimer); deltaTimer = setTimeout(() => el.className = '', 2600); } lastCash = cash; }
    render(false);
  }
  const VERB = { blackjack: 'Play blackjack', roulette: 'Play roulette', poker: "Sit at the Hold'em table", slots: 'Play the slot machine', lotto: 'Buy a lotto ticket', stage: 'Tip the dancer', bar: 'Order a drink', market: 'Browse the weapon market' };
  const prompt = aim => !aim?.casino ? '' : !g().payday ? '✗ The casino opens in Payday mode' : aim.casino === 'wallet' ? 'E · Cashier · wallet & loans' : 'E · ' + VERB[tableDef(aim.table)?.game] + ' · ' + tableDef(aim.table)?.name;
  const interact = aim => { if (!aim?.casino) return false; show(aim.casino === 'wallet' ? 'wallet' : aim.table); return true; };
  addEventListener('keydown', e => { if (open && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); hide(); } }, true);
  return { show, hide, update, prompt, interact, send, get isOpen() { return open; }, get table() { return table; } };
}
