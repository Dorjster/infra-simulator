// Payday casino screens and the wallet badge. Everything shown comes from the shared game state
// (operations.game.casino / wallets / loans); every button sends one casino action to the host.
import { handValue, rouletteColor, LOTTO, TABLE_MIN, TABLE_MAX } from './casino-logic.js';

const money = n => '$' + Math.round(n || 0).toLocaleString('en-US');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cardHTML = (c, down) => down ? '<span class="cz-card down"></span>' : `<span class="cz-card${/[♥♦]/.test(c) ? ' red' : ''}"><b>${esc(c.slice(0, -1))}</b>${esc(c.slice(-1))}</span>`;
const CHIPS = [10, 25, 100, 500, 1000];

export function createCasinoUI({ world, lan, name, notify = () => {}, onOpen = () => {}, onClose = () => {}, actor = () => 'ENGINEER-01' }) {
  const g = () => world.operations.game, me = () => String(name() || 'Engineer').trim(), key = s => String(s || '').trim().toLowerCase();
  const myWallet = () => g().wallets?.[key(me())];
  document.body.insertAdjacentHTML('beforeend', `<div id="cz-badge" hidden><span>WALLET</span><strong id="cz-cash">$0</strong><em id="cz-delta"></em></div>
<section id="casino-panel" hidden aria-label="Casino"><header><div><small>PAYDAY CASINO</small><h2 id="cz-title">Casino</h2></div><div class="cz-wallet"><span>Your wallet</span><strong id="cz-panel-cash">$0</strong></div><button id="cz-close" aria-label="Close">×</button></header>
<nav><button data-cz="blackjack">Blackjack</button><button data-cz="roulette">Roulette</button><button data-cz="lotto">Lotto</button><button data-cz="wallet">Wallet &amp; loans</button></nav><div id="cz-body"></div><p id="cz-msg" role="status"></p></section>`);
  const style = document.createElement('style'); style.textContent = `
#cz-badge{position:fixed;top:16px;right:120px;z-index:36;background:linear-gradient(135deg,#2a0e19,#4a1626);border:1px solid #d8a945;border-radius:10px;padding:6px 14px;color:#f5ead3;font:600 13px system-ui;display:flex;gap:10px;align-items:baseline;box-shadow:0 4px 16px #0006}
#cz-badge span{font-size:10px;letter-spacing:.14em;color:#e2bc5c}#cz-badge strong{font-size:18px}#cz-badge em{font-style:normal;color:#7dffb0;font-size:13px;opacity:0;transition:opacity .3s}#cz-badge em.on{opacity:1}#cz-badge em.neg{color:#ff8a8a}
#casino-panel{position:fixed;inset:5vh 8vw;z-index:45;background:radial-gradient(circle at 50% 0,#3a1222,#14060c 70%);border:2px solid #d8a945;border-radius:16px;color:#f5ead3;font:15px/1.45 system-ui,sans-serif;display:flex;flex-direction:column;padding:16px 22px;box-shadow:0 20px 60px #000a}
#casino-panel[hidden]{display:none}#casino-panel header{display:flex;align-items:center;gap:18px}#casino-panel header small{letter-spacing:.2em;color:#e2bc5c;font-size:11px}#casino-panel h2{margin:0;font:700 28px Georgia,serif}
.cz-wallet{margin-left:auto;text-align:right}.cz-wallet span{display:block;font-size:11px;color:#c9b38a;letter-spacing:.1em}.cz-wallet strong{font:700 24px Georgia,serif;color:#ffe28a}
#cz-close{background:none;border:1px solid #d8a945;color:#f5ead3;border-radius:8px;width:38px;height:38px;font-size:20px;cursor:pointer}
#casino-panel nav{display:flex;gap:6px;margin:12px 0}#casino-panel nav button{background:#2a0e19;color:#f5ead3;border:1px solid #6b3a2c;border-radius:20px;padding:7px 16px;cursor:pointer}#casino-panel nav button.on{background:#d8a945;color:#2a0e19;font-weight:700}
#cz-body{flex:1;overflow:auto;min-height:0}#cz-msg{min-height:20px;margin:8px 0 0;color:#ffe28a}
.cz-felt{background:radial-gradient(ellipse at 50% 0,#13824a,#0b5530);border:3px solid #6b3a1c;border-radius:20px;padding:16px;margin-bottom:12px}
.cz-row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.cz-seat{background:#0006;border-radius:12px;padding:8px 12px;min-width:150px}.cz-seat.turn{outline:2px solid #ffe28a}.cz-seat.me{background:#0009}
.cz-card{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:44px;height:62px;margin:2px;border-radius:6px;background:#fbfaf5;color:#111;font:700 18px Georgia,serif;box-shadow:0 2px 4px #0006}.cz-card b{font-size:15px}.cz-card.red{color:#c4142b}.cz-card.down{background:repeating-linear-gradient(45deg,#8c1c2c 0 6px,#a8283a 6px 12px);border:2px solid #e8c35a}
.cz-btn{background:#d8a945;color:#2a0e19;border:0;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer}.cz-btn.alt{background:#2a0e19;color:#f5ead3;border:1px solid #d8a945}.cz-btn:disabled{opacity:.4;cursor:not-allowed}
.cz-chip{width:52px;height:52px;border-radius:50%;border:4px dashed #fff8;color:#fff;font-weight:800;cursor:pointer}.cz-chip.on{outline:3px solid #ffe28a;transform:scale(1.08)}
.cz-board{display:grid;grid-template-columns:repeat(13,1fr);gap:3px;margin:8px 0}.cz-board button{border:1px solid #f2e6c4;color:#fff;font-weight:700;padding:10px 0;border-radius:4px;cursor:pointer;position:relative}.cz-board .red{background:#b51624}.cz-board .black{background:#151515}.cz-board .green{background:#0d7a3e}.cz-board i{position:absolute;right:2px;top:-6px;background:#e2bc5c;color:#2a0e19;border-radius:9px;font:700 10px system-ui;padding:1px 4px;font-style:normal}
.cz-wheel{width:110px;height:110px;border-radius:50%;background:conic-gradient(#0d7a3e 0 10deg,#b51624 10deg 20deg,#151515 20deg 30deg,#b51624 30deg 40deg,#151515 40deg 50deg,#b51624 50deg 60deg,#151515 60deg 70deg,#b51624 70deg 80deg,#151515 80deg 90deg,#b51624 90deg 100deg,#151515 100deg 110deg,#b51624 110deg 120deg,#151515 120deg 130deg,#b51624 130deg 140deg,#151515 140deg 150deg,#b51624 150deg 160deg,#151515 160deg 170deg,#b51624 170deg 180deg,#151515 180deg 190deg,#b51624 190deg 200deg,#151515 200deg 210deg,#b51624 210deg 220deg,#151515 220deg 230deg,#b51624 230deg 240deg,#151515 240deg 250deg,#b51624 250deg 260deg,#151515 260deg 270deg,#b51624 270deg 280deg,#151515 280deg 290deg,#b51624 290deg 300deg,#151515 300deg 310deg,#b51624 310deg 320deg,#151515 320deg 330deg,#b51624 330deg 340deg,#151515 340deg 350deg,#b51624 350deg 360deg);border:6px solid #6b3a1c;display:grid;place-items:center}.cz-wheel.spin{animation:czspin .6s linear infinite}@keyframes czspin{to{transform:rotate(360deg)}}
.cz-result{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;font:700 28px Georgia;border:3px solid #ffe28a}.cz-result.red{background:#b51624}.cz-result.black{background:#151515}.cz-result.green{background:#0d7a3e}
.cz-balls{display:grid;grid-template-columns:repeat(12,1fr);gap:6px;max-width:640px}.cz-balls button{aspect-ratio:1;border-radius:50%;border:2px solid #fff4;color:#fff;font-weight:800;cursor:pointer;background:#2a0e19}.cz-balls button.on{background:#d8a945;color:#2a0e19}
.cz-drawn{display:flex;gap:10px;margin:10px 0}.cz-drawn span{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;font:800 18px system-ui;color:#111;background:#fff;animation:czpop .4s backwards}.cz-drawn span.hit{background:#7dffb0}@keyframes czpop{from{transform:scale(0)}}
.cz-table{width:100%;border-collapse:collapse}.cz-table td,.cz-table th{padding:6px 8px;border-bottom:1px solid #5a2a35;text-align:left}.cz-form{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin:10px 0}.cz-form input,.cz-form select{background:#14060c;color:#f5ead3;border:1px solid #d8a945;border-radius:6px;padding:8px;font-size:15px}
.cz-grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:900px){.cz-grid2{grid-template-columns:1fr}#casino-panel{inset:2vh 2vw}}`;
  (document.head || document.body).append?.(style);
  const $ = id => document.getElementById(id);
  let open = false, tab = 'blackjack', chip = 25, picks = new Set(), lastKey = '', lastCash = null, deltaTimer = 0, helloAt = 0, lastLotto = null;
  function send(action) {
    return (lan.connected ? lan.send({ type: 'casino', action }) : Promise.resolve().then(() => world.apply({ type: 'casino', action }, actor())))
      .then(r => { const m = typeof r === 'string' ? r : r?.message || ''; $('cz-msg').textContent = m; render(true); return m; })
      .catch(e => { $('cz-msg').textContent = e.message; render(true); });
  }
  function show(which) { if (!g().payday) { notify('The casino is open in Payday mode · start it from the start screen'); return false; } tab = which || tab; open = true; $('casino-panel').hidden = false; document.exitPointerLock?.(); onOpen(); render(true); return true; }
  function hide() { if (!open) return; open = false; $('casino-panel').hidden = true; onClose(); }
  $('cz-close').onclick = hide;
  [...(document.querySelectorAll?.('[data-cz]') || [])].forEach(b => b.onclick = () => { tab = b.dataset.cz; render(true); });
  const timer = at => at ? Math.max(0, Math.ceil((at - Date.now()) / 1000)) + ' s' : '';
  function chipsHTML() { return `<div class="cz-row">${CHIPS.map((v, i) => `<button class="cz-chip${chip === v ? ' on' : ''}" data-chip="${v}" style="background:${['#3b82f6', '#22c55e', '#111', '#a855f7', '#d8a945'][i]}">${v >= 1000 ? v / 1000 + 'k' : v}</button>`).join('')}<label class="cz-form" style="margin:0">Custom <input id="cz-custom" type="number" min="${TABLE_MIN}" max="${TABLE_MAX}" value="${chip}" style="width:110px"></label></div>`; }
  function blackjackHTML(t) {
    const mine = t.seats.find(s => key(s.name) === key(me())), myTurn = t.phase === 'playing' && t.seats[t.turn] === mine, hidden = t.phase === 'playing';
    const dealer = t.dealer.length ? t.dealer.map((c, i) => cardHTML(c, hidden && i === 1)).join('') + (hidden ? '' : ` <b>${handValue(t.dealer)}</b>`) : '<em>Waiting for bets</em>';
    const seats = t.seats.map((s, i) => `<div class="cz-seat${t.turn === i && t.phase === 'playing' ? ' turn' : ''}${s === mine ? ' me' : ''}"><div><b>${esc(s.name)}</b> · ${money(s.bet)}${s.doubled ? ' · doubled' : ''}</div><div>${(s.cards || []).map(c => cardHTML(c)).join('')}</div><div>${s.cards?.length ? handValue(s.cards) : ''}${s.result ? ' · <b>' + s.result.toUpperCase() + '</b>' + (s.payout ? ' +' + money(s.payout - s.bet) : '') : ''}</div></div>`).join('') || '<em>Empty table · up to 5 players</em>';
    const status = t.phase === 'betting' ? (t.seats.length ? 'Dealing in ' + timer(t.closesAt) + ' · or press Deal' : 'Place a bet to take a seat') : t.phase === 'playing' ? (myTurn ? 'Your turn · ' + timer(t.turnEndsAt) : (t.seats[t.turn]?.name || '') + ' is playing') : t.phase === 'done' ? esc(t.log[0] || '') : 'Dealer plays';
    return `<div class="cz-felt"><p><b>Dealer</b> ${dealer}</p><div class="cz-row">${seats}</div></div><p>${status}</p>
     ${t.phase === 'betting' ? chipsHTML() + `<div class="cz-row" style="margin-top:10px"><button class="cz-btn" data-act="bj-bet">${mine ? 'Raise bet' : 'Bet & sit'} ${money(chip)}</button><button class="cz-btn alt" data-act="bj-deal" ${t.seats.length ? '' : 'disabled'}>Deal now</button>${mine ? '<button class="cz-btn alt" data-act="bj-leave">Leave seat</button>' : ''}</div>` : ''}
     ${myTurn ? `<div class="cz-row"><button class="cz-btn" data-act="bj-hit">Hit</button><button class="cz-btn" data-act="bj-stand">Stand</button><button class="cz-btn alt" data-act="bj-double" ${mine.cards.length === 2 ? '' : 'disabled'}>Double down (${money(mine.bet)})</button></div>` : ''}
     <p class="cz-note">Blackjack pays 3:2 · dealer stands on all 17s · 6-deck shoe · table $${TABLE_MIN}–$${TABLE_MAX.toLocaleString()}</p>`;
  }
  function rouletteHTML(r) {
    const mine = r.bets.filter(b => key(b.name) === key(me())), on = (k, v) => r.bets.filter(b => b.kind === k && (v === undefined || b.value === v)).reduce((a, b) => a + b.amount, 0);
    const n = num => { const c = rouletteColor(num), amt = on('straight', num); return `<button class="${c}" data-rl="straight" data-v="${num}">${num}${amt ? `<i>${amt >= 1000 ? Math.round(amt / 1000) + 'k' : amt}</i>` : ''}</button>`; };
    let grid = `<button class="green" data-rl="straight" data-v="0" style="grid-row:span 3">0${on('straight', 0) ? '<i>' + on('straight', 0) + '</i>' : ''}</button>`;
    for (const row of [3, 2, 1]) for (let col = 1; col <= 12; col++) grid += n((col - 1) * 3 + row);
    const outside = [['red', 'Red'], ['black', 'Black'], ['odd', 'Odd'], ['even', 'Even'], ['low', '1–18'], ['high', '19–36']].map(([k, l]) => `<button class="cz-btn alt" data-rl="${k}">${l}${on(k) ? ' · ' + money(on(k)) : ''}</button>`).join('') + [1, 2, 3].map(v => `<button class="cz-btn alt" data-rl="dozen" data-v="${v}">${['1st', '2nd', '3rd'][v - 1]} 12</button>`).join('') + [1, 2, 3].map(v => `<button class="cz-btn alt" data-rl="column" data-v="${v}">Column ${v}</button>`).join('');
    const last = r.history?.[0], spinning = r.phase === 'spinning';
    const won = !spinning && r.lastWinners ? Object.entries(r.lastWinners).map(([w, a]) => esc(w) + ' +' + money(a)).join(' · ') : '';
    return `<div class="cz-grid2"><div><div class="cz-row"><div class="cz-wheel${spinning ? ' spin' : ''}"></div>${!spinning && last !== undefined ? `<div class="cz-result ${rouletteColor(last)}">${last}</div>` : ''}<div><b>${spinning ? 'No more bets · ball rolling ' + timer(r.landsAt) : 'Place your bets'}</b><br>${won ? 'Winners: ' + won : ''}<br><small>Last: ${(r.history || []).map(x => `<span style="color:${rouletteColor(x) === 'red' ? '#ff6b6b' : rouletteColor(x) === 'green' ? '#7dffb0' : '#ddd'}">${x}</span>`).join(' ')}</small></div></div></div>
     <div><p>Your bets: ${mine.length ? mine.map(b => esc(b.kind + (b.value !== null ? ' ' + b.value : '') + ' ' + money(b.amount))).join(' · ') : 'none'}</p></div></div>
     <div class="cz-felt"><div class="cz-board">${grid}</div><div class="cz-row">${outside}</div></div>${chipsHTML()}
     <div class="cz-row" style="margin-top:10px"><button class="cz-btn" data-act="rl-spin" ${spinning || !r.bets.length ? 'disabled' : ''}>Spin the wheel</button><button class="cz-btn alt" data-act="rl-clear" ${spinning || !mine.length ? 'disabled' : ''}>Take back my bets</button></div>
     <p class="cz-note">European wheel (single 0) · number 35:1 · dozen / column 2:1 · red, black, odd, even, 1–18, 19–36 1:1 · click a number to bet the selected chip</p>`;
  }
  function lottoHTML(t) {
    const mine = t.last?.find(x => key(x.name) === key(me()));
    const balls = Array.from({ length: LOTTO.numbers }, (_, i) => i + 1).map(n => `<button data-pick="${n}" class="${picks.has(n) ? 'on' : ''}">${n}</button>`).join('');
    const drawn = mine ? `<div class="cz-drawn">${mine.balls.map((b, i) => `<span class="${mine.picks.includes(b) ? 'hit' : ''}" style="animation-delay:${i * .35}s">${b}</span>`).join('')}</div><p><b>${mine.hits} matched</b> · ${mine.prize ? 'you won ' + money(mine.prize) + '!' : 'no prize this time'}</p>` : '';
    return `<div class="cz-grid2"><div><h3 style="margin:0;font:700 34px Georgia;color:#ffe28a">JACKPOT ${money(t.jackpot)}</h3><p>Pick ${LOTTO.picks} numbers (${picks.size}/${LOTTO.picks}) · ticket ${money(LOTTO.price)} · 2 → $20 · 3 → $150 · 4 → $2,500 · 5 → jackpot</p><div class="cz-balls">${balls}</div>
     <div class="cz-row" style="margin-top:10px"><button class="cz-btn alt" data-act="quick">Quick pick</button><button class="cz-btn alt" data-act="clearpicks">Clear</button><button class="cz-btn" data-act="lotto" ${picks.size === LOTTO.picks ? '' : 'disabled'}>Buy ticket · ${money(LOTTO.price)}</button></div>${drawn}</div>
     <div><h3>Latest tickets</h3><table class="cz-table">${(t.last || []).map(x => `<tr><td>${esc(x.name)}</td><td>${x.balls.join(' · ')}</td><td>${x.hits}/5</td><td>${x.prize ? money(x.prize) : '—'}</td></tr>`).join('') || '<tr><td>No tickets yet</td></tr>'}</table></div></div>`;
  }
  function walletHTML() {
    const w = myWallet() || { cash: 0, salary: 0, won: 0, lost: 0, log: [] }, all = Object.values(g().wallets || {}).sort((a, b) => b.cash - a.cash), loans = (g().loans || []).filter(l => l.owed > 0);
    const others = all.filter(x => key(x.name) !== key(me()));
    return `<div class="cz-grid2"><div><h3>${esc(me())}</h3><table class="cz-table"><tr><td>Cash</td><th>${money(w.cash)}</th></tr><tr><td>Salary earned</td><td>${money(w.salary)}</td></tr><tr><td>Casino winnings</td><td>${money(w.won)}</td></tr><tr><td>Casino losses</td><td>${money(w.lost)}</td></tr></table>
     <h3>Lend money</h3>${others.length ? `<div class="cz-form"><label>To <select id="cz-lend-to">${others.map(o => `<option>${esc(o.name)}</option>`).join('')}</select></label><label>Amount <input id="cz-lend-amt" type="number" min="1" value="500" style="width:120px"></label><button class="cz-btn" data-act="lend">Lend</button></div>` : '<p>Nobody else has a wallet yet · teammates get one when they join Payday.</p>'}
     <h3>Loans</h3><table class="cz-table">${loans.map(l => `<tr><td>${esc(l.lender)} → ${esc(l.borrower)}</td><td>${money(l.owed)} of ${money(l.amount)}</td><td>${key(l.borrower) === key(me()) ? `<button class="cz-btn" data-repay="${l.id}">Repay all</button> <button class="cz-btn alt" data-repay-part="${l.id}">Repay $100</button>` : key(l.lender) === key(me()) ? `<button class="cz-btn alt" data-forgive="${l.id}">Forgive</button>` : ''}</td></tr>`).join('') || '<tr><td>No open loans</td></tr>'}</table></div>
     <div><h3>Rich list</h3><table class="cz-table">${all.map((x, i) => `<tr><td>${i + 1}. ${esc(x.name)}</td><th>${money(x.cash)}</th><td><small>salary ${money(x.salary)}</small></td></tr>`).join('')}</table><h3>Your history</h3><table class="cz-table">${(w.log || []).slice(0, 12).map(e => `<tr><td>${esc(e.text)}</td><td style="color:${e.amount >= 0 ? '#7dffb0' : '#ff8a8a'}">${e.amount >= 0 ? '+' : ''}${money(e.amount)}</td></tr>`).join('')}</table></div></div>`;
  }
  function render(force) {
    const game = g(); if (!open || !game.payday) return;
    const k = JSON.stringify([tab, game.casino, game.wallets, game.loans, chip, [...picks], Math.floor(Date.now() / 1000)]); if (!force && k === lastKey) return; lastKey = k;
    [...(document.querySelectorAll?.('[data-cz]') || [])].forEach(b => b.classList?.toggle('on', b.dataset.cz === tab));
    $('cz-title').textContent = { blackjack: 'Blackjack', roulette: 'Roulette', lotto: 'Lotto machine', wallet: 'Wallet & loans' }[tab]; $('cz-panel-cash').textContent = money(myWallet()?.cash);
    const body = $('cz-body'), scroll = body.scrollTop;
    body.innerHTML = tab === 'blackjack' ? blackjackHTML(game.casino.blackjack) : tab === 'roulette' ? rouletteHTML(game.casino.roulette) : tab === 'lotto' ? lottoHTML(game.casino.lotto) : walletHTML(); body.scrollTop = scroll;
    body.querySelectorAll('[data-chip]').forEach(b => b.onclick = () => { chip = +b.dataset.chip; render(true); });
    body.querySelector('#cz-custom')?.addEventListener('change', e => { chip = Math.max(TABLE_MIN, Math.min(TABLE_MAX, Math.floor(+e.target.value || TABLE_MIN))); render(true); });
    body.querySelectorAll('[data-rl]').forEach(b => b.onclick = () => send({ type: 'rl-bet', kind: b.dataset.rl, value: b.dataset.v !== undefined ? +b.dataset.v : undefined, amount: chip }));
    body.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { const n = +b.dataset.pick; if (picks.has(n)) picks.delete(n); else if (picks.size < LOTTO.picks) picks.add(n); render(true); });
    body.querySelectorAll('[data-repay]').forEach(b => b.onclick = () => send({ type: 'repay', id: b.dataset.repay }));
    body.querySelectorAll('[data-repay-part]').forEach(b => b.onclick = () => send({ type: 'repay', id: b.dataset.repayPart, amount: 100 }));
    body.querySelectorAll('[data-forgive]').forEach(b => b.onclick = () => send({ type: 'forgive', id: b.dataset.forgive }));
    body.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
      const a = b.dataset.act;
      if (a === 'bj-bet') return send({ type: 'bj-bet', amount: chip });
      if (a === 'quick') { picks = new Set(); while (picks.size < LOTTO.picks) picks.add(1 + Math.floor(Math.random() * LOTTO.numbers)); return render(true); }
      if (a === 'clearpicks') { picks = new Set(); return render(true); }
      if (a === 'lotto') return send({ type: 'lotto', picks: [...picks] });
      if (a === 'lend') return send({ type: 'lend', to: body.querySelector('#cz-lend-to').value, amount: +body.querySelector('#cz-lend-amt').value });
      return send({ type: a });
    });
  }
  // Badge, salary pop-ups and the first "hello" that opens a wallet for this engineer.
  function update() {
    const game = g(), on = !!game.payday; $('cz-badge').hidden = !on;
    if (!on) { lastCash = null; if (open) hide(); return; }
    const w = myWallet();
    if (!w && Date.now() - helloAt > 4000) { helloAt = Date.now(); send({ type: 'hello' }).catch(() => {}); }
    if (w) { $('cz-cash').textContent = money(w.cash); if (lastCash !== null && w.cash !== lastCash) { const d = w.cash - lastCash, el = $('cz-delta'); el.textContent = (d > 0 ? '+' : '') + money(d) + (w.log?.[0]?.text?.startsWith('Salary') && d > 0 ? ' salary' : w.log?.[0]?.text === 'Level bonus' ? ' level bonus' : ''); el.className = 'on' + (d < 0 ? ' neg' : ''); clearTimeout(deltaTimer); deltaTimer = setTimeout(() => el.className = '', 2600); } lastCash = w.cash; }
    render(false);
  }
  const prompt = aim => aim?.casino ? (g().payday ? 'E · ' + { blackjack: 'Play blackjack', roulette: 'Play roulette', lotto: 'Buy a lotto ticket', wallet: 'Wallet & loans' }[aim.casino] : '✗ The casino opens in Payday mode') : '';
  const interact = aim => { if (!aim?.casino) return false; show(aim.casino); return true; };
  addEventListener('keydown', e => { if (open && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); hide(); } }, true);
  return { show, hide, update, prompt, interact, send, get isOpen() { return open; } };
}
