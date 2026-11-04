// v53 stage 4 · CS2's centre-top messages (dist/gd-hud-alerts.js): which round events show CS2's alert bar and its text
// (the user's csgo_english.txt strings), how long, the warmup clock, nothing written when nothing changes, and the
// look's CS2 numbers (hudalerts.vcss: 300 px wide, 120 px from the top, 18 px text, the 0.25 s open).
//   node tests/gd-hud-alerts.mjs
let n = 0, bad = 0; const check = (name, c, d = '') => { n++; if (!c) { bad++; console.log('FAIL ' + name + (d === '' ? '' : ' · ' + d)); } };
class El { constructor() { this.children = []; this.className = ''; this._t = ''; this.writes = 0; this.id = ''; } append(...k) { this.children.push(...k); } set innerHTML(h) { this._h = h; this.b = new El(); } querySelector() { return this.b; } set textContent(v) { this._t = v; this.writes++; } get textContent() { return this._t; } }
const ids = {}; const body = new El(), head = new El(); body.append = (...k) => { for (const e of k) ids[e.id] = e; };
globalThis.document = { body, head, createElement: () => new El(), getElementById: id => ids[id] || null };
const A = await import('../dist/gd-hud-alerts.js');
const { alertFor, createHudAlerts, ALERT_TEXT, SHOW_MS, ALERTS_CSS } = A;
// the rule
const D = (phase, o = {}) => ({ round: { phase, ...o.r }, n: o.n ?? 5, score: o.score || { t: 2, ct: 2 }, rules: { win: 13 } });
check('the plant: "The bomb has been planted"', alertFor('live', D('planted')) === 'planted' && ALERT_TEXT.planted === 'The bomb has been planted');
check('a defuse: "The bomb has been defused"', alertFor('planted', D('over', { r: { reason: 'defuse', winner: 'ct' } })) === 'defused');
check('a draw: "Round Draw"', alertFor('live', D('over', { r: { reason: 'time', winner: null } })) === 'draw');
check('a plain win: no alert (the win panel says it)', alertFor('live', D('over', { r: { reason: 'elim', winner: 't' } })) === null);
check('match point at the freeze when a side has 12 (MR12, first to 13)', alertFor('over', D('freeze', { n: 20, score: { t: 12, ct: 7 } })) === 'matchPoint');
check('the last round of the first half (round 12)', alertFor('over', D('freeze', { n: 12, score: { t: 6, ct: 5 } })) === 'lastHalf');
check('the final round (24)', alertFor('over', D('freeze', { n: 24, score: { t: 11, ct: 11 } })) === 'final');
check('the match start (after warmup)', alertFor('warmup', D('freeze', { n: 1 })) === 'start');
check('an ordinary freeze time: nothing', alertFor('over', D('freeze', { n: 7, score: { t: 3, ct: 3 } })) === null);
check('the same phase again: nothing', alertFor('planted', D('planted')) === null);
// on the page
const AL = createHudAlerts(), el = ids['gd-alert'];
const G = { combat: { d: D('live') }, arena: {} }; let t = 1e6;
AL.update(true, G, t); check('live: hidden', el.className === '' && AL.text === '');
G.combat.d = D('planted'); AL.update(true, G, t += 16); check('planted: the bar opens with the text', el.className === 'on' && AL.text === ALERT_TEXT.planted);
const w = el.b.writes; for (let i = 0; i < 50; i++) AL.update(true, G, t += 16); check('frames with nothing new write nothing', el.b.writes === w);
AL.update(true, G, t += SHOW_MS); check(`gone after ${SHOW_MS / 1000} s`, el.className === '');
G.combat.d = D('warmup'); G.arena.lobby = { until: t + 65000 }; AL.update(true, G, t += 16); check('warmup: "WARMUP 1:05"', AL.text === 'WARMUP 1:05', AL.text);
const w2 = el.b.writes; AL.update(true, G, t += 100); check('the warmup clock written once a second', el.b.writes === w2);
AL.update(true, G, t += 1000); check('…and the next second', AL.text === 'WARMUP 1:04', AL.text);
G.combat.d = D('freeze', { n: 1 }); AL.update(true, G, t += 16); check('warmup over: "MATCH START"', AL.text === 'MATCH START');
AL.update(false, G, t += 16); check('off screen: hidden', el.className === '');
// CS2's look
check('CS2 numbers: 300 px wide, 120 px from the top, 18 px text, 2 px side bars, 0.25 s open from scale 0, black .5 fill', /width:calc\(300 \* var\(--gd-u/.test(ALERTS_CSS) && /top:calc\(var\(--gd-view-top,0px\) \+ 120 \* var\(--gd-u/.test(ALERTS_CSS) && /calc\(18 \* var\(--gd-u,1px\)\)/.test(ALERTS_CSS) && /\.sd\{[^}]*width:2px/.test(ALERTS_CSS) && /transform:scaleX\(0\);transition:transform \.25s ease-in/.test(ALERTS_CSS) && /#00000080/.test(ALERTS_CSS));
console.log(bad ? `FAIL: gd-hud-alerts · ${bad} of ${n}` : `PASS: gd-hud-alerts · ${n} checks (plant, defuse, draw, match point, last round of the half, final round, match start, warmup clock, DOM only on change, CS2's alert bar look)`); if (bad) process.exit(1);
