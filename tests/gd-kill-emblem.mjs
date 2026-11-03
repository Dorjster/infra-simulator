// Global Defensive · the round's kill tally and the death panel (dist/gd-kill-emblem.js, v53 spec 2.1 + Addendum 7: CS2's
// HudHealthAmmoCenter — the round badge on its line with one card per kill fanned above it), on a small DOM stub (an
// element tree parsed from the markup the module writes; class / hidden / transform / text read back):
//  · one card per kill of yours this round, in CS2's fan for that count (hudhealthammocenter.vcss .HUD--NumKills--N:
//    the translate / rotate table); no card for 0 kills (the badge and line only); a team kill, a kill by someone else
//    and your own death are no card; two kills in one host millisecond (a collateral) are two;
//  · the headshot variant (kind 1: the headshot pip, gold burst), a knife / HE / fire / taser kill its own pip; the marks
//    (wallbang, no-scope, through smoke, blind) from the feed's f.how;
//  · the burst: the new card gets the new-kill animation (two names, so a kill always restarts it), the older ones a
//    pulse; the 3rd / 4th / 5th kill burst bigger, the ace (5th) with the ring wave;
//  · past five, CS2's extra card on top with the count (the five keep their 5-kill fan);
//  · cleared when the next round's freeze time starts (a new round id); deathmatch: on respawning;
//  · the team's logo (T / CT); reduce flashes (preference reduceFlashes); CS2's pictures (cards as luminance masks,
//    pips, logos) taking over ours in the same nodes;
//  · CSS: keyframes on transform / opacity only, no animated SVG element (each arc is an HTML wrapper), and every
//    delayed animation starts invisible (no frozen sparks / ring before the burst);
//  · no allocation per kill and none per frame — the bare kill() and the game's own path (update() reading new feed
//    lines), heap growth over many thousands, no GC between;
//  · the death panel: killer, weapon (the kill feed's icon), HS mark; hidden when back.
//   node tests/gd-kill-emblem.mjs        (re-runs itself with --expose-gc for the allocation check)
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
if (typeof globalThis.gc !== 'function') { const r = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url)], { stdio: 'inherit' }); process.exit(r.status ?? 1); }
let fails = 0, n = 0; const ok = (c, m) => { n++; if (!c) { fails++; console.error('FAIL:', m); } else if (process.env.V) console.log('  ok', m); };

// ── A small DOM: innerHTML is parsed into elements (tags, class, style attribute), querySelector(All) by one class. ──
const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link']);
class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.parent = null; this._cls = ''; this.hidden = false; this.style = {}; this.attrs = {}; this.text = ''; this.id = ''; this.writes = 0; }
  get className() { return this._cls; } set className(v) { this._cls = v; this.writes++; }
  get classList() { const el = this; return { contains: c => el._cls.split(' ').includes(c) }; }
  set textContent(v) { this.text = v; if (this.children.length) this.children.length = 0; } get textContent() { return this.text; }   // (the stub allocates nothing on a write: the allocation check measures the module)
  append(...k) { for (const c of k) { c.parent = this; this.children.push(c); } }
  set innerHTML(h) { this.children = []; parse(h, this); this._html = h; } get innerHTML() { return this._html || ''; }
  matches(c) { return (' ' + this._cls + ' ').includes(' ' + c + ' '); }
  querySelectorAll(sel) { const c = sel.replace(/^\./, ''), out = []; const walk = e => { for (const k of e.children) { if (k.matches(c)) out.push(k); walk(k); } }; walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  setAttribute(k, v) { this.attrs[k] = v; }
}
function parse(h, root) { const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g; let m, cur = root;
  while ((m = re.exec(h))) { const [, close, tag, attrs, self] = m;
    if (close) { if (cur.parent && cur.tagName === tag) cur = cur.parent; continue; }
    const el = new El(tag), cls = /\bclass="([^"]*)"/.exec(attrs); if (cls) el._cls = cls[1]; if (/\shidden(\s|$|=)/.test(attrs)) el.hidden = true;
    cur.append(el); if (!self && !VOID.has(tag)) cur = el; } }
const byId = {}; const head = new El('head'), body = new El('body');
globalThis.document = { head, body, createElement: t => new El(t), getElementById: id => byId[id] || null };
const origAppend = El.prototype.append; El.prototype.append = function (...k) { for (const c of k) if (c.id) byId[c.id] = c; return origAppend.apply(this, k); };

const KE = await import('../dist/gd-kill-emblem.js');
const { createKillEmblems, createDeathPanel, pipKind, markBits, EMBLEM_CLASS, TIER_CLASS, ROOT_CLASS, FAN, KIND, SLOTS, FLAGS, reduceFlashesNow } = KE;

const E = createKillEmblems();
const flags = () => E.root.querySelectorAll('.ke-f');
const countCls = () => (E.root.className.match(/\bn(\d|x)\b/) || [])[1];
const shownN = () => { const c = countCls(); return c === 'x' ? SLOTS + 1 : +c; };
const emblem = i => flags()[i].querySelector('.ke-c'), burst = i => flags()[i].querySelector('.ke-bx');
const has = (el, c) => el.matches(c);

// The game the module reads: the host's feed (newest first), the round, the down list, teams.
const me = 'ann'; let T = 1e9;
const G = { combat: { feed: [], down: {}, d: { round: { id: 'r1', phase: 'live' }, teams: { ann: 't', bo: 't', cy: 'ct', di: 'ct', ed: 'ct', fy: 'ct', gu: 'ct' } } } };
const feed = (by, target, o = {}) => { T += 37; G.combat.feed.unshift({ at: o.at ?? T, by, target, weapon: 'AK-47', wid: o.wid || 'ak', head: !!o.head, assist: null, ...(o.how ? { how: o.how } : {}) }); G.combat.feed.length = Math.min(G.combat.feed.length, 6); };
const frame = () => E.update(true, G, me, T);

ok(createKillEmblems && flags().length === FLAGS && FLAGS === 6, 'one node set: 5 kill cards + the extra card, built once');
ok(E.root.querySelector('.ke-bd') && E.root.querySelectorAll('.ke-ln').length === 2, 'the round badge and its line (two halves)');
frame(); ok(!E.root.hidden && shownN() === 0, 'alive, 0 kills: the badge and line, no card');
ok(has(E.root, 't') && !has(E.root, 'ct'), "the team's logo: T"); 
ok(/translate3d\([\d.]+px,[\d.]+px,0\) scale\([\d.]+\)/.test(E.root.style.transform || ''), 'fitted to the screen (1080 p pixels scaled): ' + E.root.style.transform);
// first look: a kill already in the feed before this player looked is not news
feed('Ann', 'Cy'); { const E2 = createKillEmblems(); E2.update(true, G, me, T); E2.update(true, G, me, T); ok(E2.count === 0, 'a feed line older than the first look is no card'); }
G.combat.feed.length = 0; frame();
feed('Ann', 'Cy'); frame();
ok(E.count === 1 && shownN() === 1, 'a kill: one card (n1)');
ok(has(emblem(0), 'k0') && !has(emblem(0), 'h'), 'a body kill: the default pip');
ok(has(emblem(0), 'nA') || has(emblem(0), 'nB'), 'the new card bursts (pop, shine, lightning, glow, CS2 on-kill + spotlight)');
frame(); frame(); ok(E.count === 1, 'the same feed line seen again: still one');
feed('Bo', 'Di'); frame(); ok(E.count === 1, "a team mate's kill: no card of yours");
feed('Cy', 'Bo'); frame(); ok(E.count === 1, 'an enemy killing someone: none');
feed('Ann', 'Bo'); frame(); ok(E.count === 1, 'a team kill: no card (CS2 counts no kill)');
feed('Ann', 'Di', { head: true, how: { wallbang: true, smoke: true } }); frame();
ok(E.count === 2 && shownN() === 2, 'second kill: two cards (n2)');
ok(has(emblem(1), 'k1') && has(emblem(1), 'h'), 'a headshot kill: the headshot variant');
ok(has(emblem(1), 'mw') && has(emblem(1), 'ms') && !has(emblem(1), 'mn') && !has(emblem(1), 'mb'), 'marks: wallbang + through smoke');
ok(has(emblem(0), 'pA') || has(emblem(0), 'pB'), 'the older card pulses');
ok(burst(1).className === TIER_CLASS[0], 'kills 1–2: the normal burst');
// a collateral: two kills in the same host millisecond
{ const at = T + 50; T = at; feed('Ann', 'Ed', { at, wid: 'knife' }); feed('Ann', 'Fy', { at, wid: 'he' }); frame(); }
ok(E.count === 4 && shownN() === 4, 'two kills in one host ms: both (' + E.count + ')');
ok(has(emblem(2), 'k2') && has(emblem(3), 'k3'), 'a knife kill: the slash pip; an HE kill: the blast pip');
ok(burst(3).className === TIER_CLASS[2], 'the 4th kill bursts bigger (tier 2)');
ok(burst(2).className === TIER_CLASS[1], 'the 3rd kill: tier 1');
// a kill of yours, then your own death in the feed
feed('Gu', 'Ann'); frame(); ok(E.count === 4, 'your own death: no card');
feed('Ann', 'Gu', { wid: 'awp', how: { noscope: true, blind: true } }); frame();
ok(E.count === 5 && burst(4).className === 'ke-bx t3 ace', 'the ace (5th): the biggest burst with the ring wave');
ok(has(emblem(4), 'mn') && has(emblem(4), 'mb'), 'no-scope + blind marks');
ok(shownN() === 5, 'five: the 5-kill fan, no extra card yet');
// a 6th: CS2's extra card on top with the count; the five keep their kinds and fan
G.combat.d.teams.hu = 'ct'; feed('Ann', 'Hu', { head: true }); frame();
ok(E.count === 6 && countCls() === 'x', 'past five: the extra card (nx)');
ok(flags()[5].querySelector('.ke-cn').text === '6', "the extra card shows the round's kill count (6)");
ok(has(emblem(5), 'h') && (has(emblem(5), 'nA') || has(emblem(5), 'nB')), 'the extra card bursts (gold: a headshot)');
ok(has(emblem(1), 'k1') && has(emblem(2), 'k2') && has(emblem(3), 'k3') && has(emblem(4), 'k0'), 'cards 1–5 keep their own kills (CS2 HUD--Kill1…5)');
ok([0, 1, 2, 3, 4].every(i => has(emblem(i), 'pA') || has(emblem(i), 'pB')), 'the five pulse');
// the restart: the same card bursting twice in a row alternates its animation name
{ const before = emblem(5).className; G.combat.d.teams.iv = 'ct'; feed('Ann', 'Iv'); frame(); const after = emblem(5).className;
  ok(before !== after && (before.endsWith(' nA') ? after.endsWith(' nB') : after.endsWith(' nA')), 'the burst restarts by switching animation names (no reflow): ' + before.slice(-3) + ' → ' + after.slice(-3));
  ok(flags()[5].querySelector('.ke-cn').text === '7', 'the count follows (7)'); }
// dead: hidden while you watch others (the spectate HUD), back when alive
G.combat.down[me] = { until: T + 5000, by: 'Cy', weapon: 'M4A4', wid: 'm4', head: true, at: T }; frame(); ok(E.root.hidden, 'dead: the tally hides (the spectate view instead)');
delete G.combat.down[me]; frame(); ok(!E.root.hidden && E.count === 7, 'defuse: alive again in the same round — still there');
// team change (halftime): the CT logo
G.combat.d.teams.ann = 'ct'; frame(); ok(has(E.root, 'ct') && countCls() === 'x', 'the CT logo after switching sides'); G.combat.d.teams.ann = 't';
// the next round's freeze time
G.combat.d.round = { id: 'r2', phase: 'freeze' }; frame();
ok(E.count === 0 && shownN() === 0 && !E.root.hidden, "cleared when the next round's freeze time starts (the badge stays)");
ok([...flags()].every(f => f.querySelector('.ke-c').className === EMBLEM_CLASS[0]), '… every card back at rest');
feed('Ann', 'Cy', { head: true }); frame(); ok(E.count === 1 && has(emblem(0), 'h') && shownN() === 1, 'a new round counts from one');
// deathmatch: no rounds — the tally is per life
{ const E3 = createKillEmblems(), DM = { combat: { feed: [], down: {} } }; let t = 5e9; const f = (by, target) => { t += 10; DM.combat.feed.unshift({ at: t, by, target, wid: 'ak', head: false }); };
  E3.update(true, DM, me, t); f('Ann', 'X'); E3.update(true, DM, me, t); f('Ann', 'Y'); E3.update(true, DM, me, t); const before = E3.count;
  DM.combat.down[me] = { until: t + 3000, at: t, by: 'Z' }; E3.update(true, DM, me, t); t += 4000; E3.update(true, DM, me, t);
  ok(before === 2 && E3.count === 0, 'deathmatch: kept through the life, cleared on respawning'); }
// not in a match: hidden
E.update(false, G, me, T); ok(E.root.hidden, 'out of the match: hidden');
// the pure helpers
ok(pipKind('ak', true) === KIND.head && pipKind('knife', false) === KIND.slash && pipKind('knife:butterfly', false) === KIND.slash && pipKind('he', false) === KIND.blast && pipKind('molotov', false) === KIND.burn && pipKind('incendiary', false) === KIND.burn && pipKind('taser', false) === KIND.shock && pipKind('awp', false) === KIND.body && pipKind('decoy', false) === KIND.body, 'pip kinds: head, slash, blast, burn, shock, default (CS2 .HUD--KillN--<kind>)');
ok(markBits({ wallbang: true, noscope: true, smoke: true, blind: true }) === 15 && markBits(null) === 0 && markBits({ air: true, far: 30 }) === 0, 'mark bits (in-air / distance have no mark)');
ok(EMBLEM_CLASS.length === 6 * 16 * 5 && new Set(EMBLEM_CLASS).size === EMBLEM_CLASS.length && ROOT_CLASS.length === 28 && new Set(ROOT_CLASS).size === 28, 'every card look and every root state is one prebuilt class string (' + EMBLEM_CLASS.length + ' + ' + ROOT_CLASS.length + ')');
// reduce flashes
{ const E4 = createKillEmblems({ reduce: true }); ok(has(E4.root, 'rf'), 'reduce flashes: the lightning toned down (root .rf)'); E4.setReduce(false); ok(!has(E4.root, 'rf'), '… and back');
  ok(reduceFlashesNow({ reduceFlashes: true }) === true && reduceFlashesNow({}) === false, 'the preference reduceFlashes'); }
ok(['.rf .ke-a', '.rf .ke-sp', '.rf .ke-rg', '.rf .ke-gl', '.rf .ke-wh'].every(x => KE.KILL_EMBLEM_CSS.includes(x)), 'reduce flashes covers the arcs, sparks, ring, glow and the on-kill flash');
// CSS: CS2's fan, transform / opacity only, no animated SVG element, delayed parts start invisible; spec 2.1 timings
{ const css = KE.KILL_EMBLEM_CSS, frames = css.match(/@keyframes [\w-]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) || [];
  let fanOk = true; for (let n2 = 1; n2 <= 5; n2++) for (let k = 0; k < n2; k++) { const [x, y, r] = FAN[n2][k], re = new RegExp(`\\.gd-ke\\.n${n2} \\.ke-f${k + 1}[^{]*\\{transform:translate3d\\(${x}px,${y}px,0\\) rotate\\(${r}deg\\);visibility:visible\\}`); if (!re.test(css)) { fanOk = false; console.error('  no fan rule', n2, k); } }
  ok(fanOk && JSON.stringify(FAN[5]) === '[[-7,8,-24],[-3,6,-12],[0,4,0],[3,2,12],[7,0,24]]' && JSON.stringify(FAN[3]) === '[[-3,4,-12],[0,2,0],[3,0,12]]', "the fan: CS2's per-count translate / rotate table (hudhealthammocenter.vcss)");
  ok(/\.ke-f\{[^}]*transform:translate3d\(0,42px,0\) rotate\(0deg\);visibility:hidden;transition:transform 200ms ease-in-out/.test(css), "a hidden card rests at translate3d(0, 42px, 0) and moves in over CS2's 0.2 s");
  ok(/\.nA \.ke-wh\{animation:ke-wh0 700ms ease-out/.test(css) && /ke-spot0\{0%\{opacity:0\}1%\{opacity:\.2\}30%\{opacity:\.2\}100%\{opacity:0\}\}/.test(css), "CS2's on-kill (0.7 s) and its spotlight (0 → .2 at 1 % → .2 at 30 % → 0)");
  const props = new Set(); for (const f of frames) for (const m of f.matchAll(/([a-z-]+)\s*:/g)) props.add(m[1]);
  ok(frames.length >= 22 && [...props].every(p => p === 'transform' || p === 'opacity'), 'keyframes animate transform / opacity only: ' + [...props].join(', '));
  // every rule that animates: its targets are HTML elements in the markup (an animated SVG child would be main-thread work)
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*animation:[^{}]*)\}/g)].filter(m => !m[1].includes('@keyframes') && !m[1].includes('gd-dp'));
  let svgAnim = []; const SVGT = new Set(['svg', 'path', 'g', 'rect', 'text', 'circle']);
  for (const m of rules) for (const sel of m[1].split(',')) { const last = sel.trim().split(/[\s~>+]+/).pop(), cls = (last.match(/\.([\w-]+)/g) || []).map(c => c.slice(1)); if (!cls.length) continue;
    const els = E.root.querySelectorAll('.' + cls[0]); for (const el of els) if (SVGT.has(el.tagName)) svgAnim.push(sel.trim()); }
  ok(rules.length >= 10 && svgAnim.length === 0, 'no SVG element is animated (each arc, spark and flash an HTML element): ' + (svgAnim.join(' | ') || rules.length + ' animated rules'));
  // delayed animations: their keyframes start at opacity 0 (nothing shows before its moment)
  const KF = {}; for (const f of frames) { const nm = f.match(/@keyframes ([\w-]+)/)[1]; KF[nm] = f; }
  const delayed = [...css.matchAll(/animation:(ke-[\w-]+) \d+ms \d+ms/g)].map(m => m[1]);
  const bad = delayed.filter(nm => !/^@keyframes [\w-]+\{0%\{opacity:0[;}]/.test(KF[nm] || ''));
  ok(delayed.length >= 10 && bad.length === 0, 'every delayed part starts invisible (' + delayed.length + ' delayed; first keyframe opacity 0): ' + (bad.join(', ') || 'all'));
  ok(/\.nA\{animation:ke-pop0 140ms cubic-bezier\(\.34,1\.56,\.64,1\)/.test(css) && /ke-pop0\{0%\{transform:scale\(1\.35\)\}100%\{transform:scale\(1\)\}/.test(css), 'pop-in: 1.35 → 1.0 over 140 ms, ease-out-back');
  ok(/\.nA \.ke-sh\{animation:ke-sh0 320ms/.test(css), 'shine: 320 ms diagonal sweep');
  ok(/\.nA~\.ke-bx \.ke-a\{animation:ke-ar0 300ms/.test(css) && /\.nA~\.ke-bx \.ke-fl\{animation:ke-fl0 300ms/.test(css), 'lightning burst + flash: 300 ms (spec 250–350)');
  ok(/\.nA \.ke-gl\{animation:ke-gl0 950ms/.test(css) && /ke-gl0\{0%\{opacity:0\}10%\{opacity:1\}37%\{opacity:1\}100%\{opacity:0\}/.test(css), 'glow-down: held to ~350 ms, then 600 ms down');
  ok(/\.h~\.ke-bx \.ke-a \.o\{stroke:#ffc23d/.test(css) && /\.ke-a \.o\{fill:none;stroke:#7cc4ff/.test(css), 'arcs: gold / white for a headshot, blue / white for a body kill'); }
// arcs: 5 drawn per card (each an HTML wrapper); 3 (body) / 4 (headshot) at tier 0, up to 5 when escalated
ok([...flags()].every(f => f.querySelectorAll('.ke-a').length === 5 && f.querySelectorAll('.ke-a').every(a => a.tagName === 'i') && f.querySelectorAll('.o').length === 5 && f.querySelectorAll('.ke-sp').length === 6), 'each card: 5 lightning arcs (HTML wrappers) and 6 sparks, prebuilt');
ok(JSON.stringify(E.root.innerHTML.match(/>\d<\/text>/g)) === JSON.stringify(['>1</text>', '>2</text>', '>3</text>', '>4</text>', '>5</text>']) && flags()[5].querySelector('.ke-cn'), 'our own cards carry their kill number 1–5 (the extra card: the count label instead)');
// CS2's pictures: set once, in place (no new nodes); cards as luminance masks (black fill clear)
{ const cd0 = flags()[0].querySelector('.ke-cd'), p1 = flags()[0].querySelectorAll('.ke-p')[1], lg = E.root.querySelectorAll('.ke-lg')[0];
  const files = { card: { 1: 'kill_1', 2: 'kill_2', 3: 'kill_3', 4: 'kill_4', 5: 'kill_5', extra: 'kill_extra', mask: 'kill_mask' }, pip: { default: 'kill_pip_default', headshot: 'kill_pip_headshot' }, logo: { t: 't_logo_1c', ct: 'ct_logo_1c' } };
  E.setArt({ url: (g, k) => files[g]?.[k] ? `/user-assets/icons/killfeed/${files[g][k]}.svg?h=x` : null, mark: (k, ours) => ours });
  ok(flags()[0].querySelector('.ke-cd') === cd0 && cd0.innerHTML.includes('kill_1.svg') && cd0.innerHTML.includes('ke-mk lum'), "CS2's kill_1 card replaces ours in the same node, as a luminance mask");
  ok(p1.innerHTML.includes('kill_pip_headshot.svg') && !p1.innerHTML.includes('lum'), "CS2's headshot pip (an alpha mask) in the same node");
  ok(flags()[2].querySelectorAll('.ke-p')[2].innerHTML.includes('<svg'), 'a pip the install lacks (slash here): ours stays');
  ok(flags()[5].querySelector('.ke-cd').innerHTML.includes('kill_extra.svg') && flags()[0].querySelector('.ke-bw').innerHTML.includes('kill_mask.svg'), "the extra card and CS2's card shape (kill_mask) behind every card");
  ok(lg.innerHTML.includes('t_logo_1c.svg'), "CS2's T logo on the badge"); }

// ── No allocation per kill, none per frame ──
{ const E5 = createKillEmblems(); const kinds = new Uint8Array([0, 1, 2, 1, 0, 3, 4, 1]), marks = new Uint8Array([0, 1, 5, 15, 0, 2, 8, 0]);
  const run = N => { for (let i = 0; i < N; i++) { E5.kill(kinds[i & 7], marks[i & 7]); if ((i & 7) === 7) E5.clear(); } };
  run(20000); const round = () => { gc(); gc(); const h0 = process.memoryUsage().heapUsed; run(200000); const h1 = process.memoryUsage().heapUsed; return h1 - h0; };
  const dh = Math.min(round(), round(), round()); ok(dh < 64 * 1024, 'no allocation per kill: 200 000 kills (and a clear every 8) grow the heap ' + (dh / 1024).toFixed(1) + ' KB');
  // and the per-frame update with nothing new
  const G2 = { combat: { feed: G.combat.feed.slice(), down: {}, d: { round: { id: 'r9' }, teams: {} } } }; E5.update(true, G2, me, T); E5.update(true, G2, me, T + 1);
  const frames = N => { for (let i = 0; i < N; i++) E5.update(true, G2, me, T + 2); }; frames(20000);
  const fr = () => { gc(); gc(); const h0 = process.memoryUsage().heapUsed; frames(200000); return process.memoryUsage().heapUsed - h0; };
  const df = Math.min(fr(), fr(), fr()); ok(df < 64 * 1024, 'no allocation per frame: 200 000 updates grow the heap ' + (df / 1024).toFixed(1) + ' KB');
  // the game's own path: update() reading a NEW feed line of yours every frame (names → keys cached), a clear every 4
  const E6 = createKillEmblems(), ENT = []; for (let i = 0; i < 8; i++) ENT.push({ at: 0, by: 'Ann', target: 'Bot' + i, wid: i & 1 ? 'ak' : 'knife', head: !!(i & 2), how: i & 4 ? { wallbang: true } : null });
  const G6 = { combat: { feed: [ENT[0]], down: {}, d: { round: { id: 'q1' }, teams: {} } } }; let t6 = 2e9; E6.update(true, G6, me, t6);
  let kills = 0; const path = N => { for (let i = 0; i < N; i++) { t6 += 1; const e = ENT[i & 7]; e.at = t6; G6.combat.feed[0] = e; E6.update(true, G6, me, t6); if ((i & 3) === 3) { kills += E6.count; E6.clear(); } } };
  path(20000); kills = 0; const pr = () => { gc(); gc(); const h0 = process.memoryUsage().heapUsed; path(200000); return process.memoryUsage().heapUsed - h0; };
  const dp = Math.min(pr(), pr(), pr()); ok(kills > 0 && dp < 64 * 1024, 'no allocation in the game path: 200 000 new feed lines read by update() grow the heap ' + (dp / 1024).toFixed(1) + ' KB (' + kills + ' kills)'); }

// ── The death panel ──
{ const art = { gun: (id) => `<img class="kw" src="/i/${id}.svg">`, mark: (k, ours) => `<img class="km" data-k="${k}">`, hs: '<svg></svg>' };
  const P = createDeathPanel({ art }); const G3 = { combat: { down: {}, hp: { cy: 64 } }, arena: { knives: {} } };
  P.update(true, G3, me, 1000); ok(P.el.hidden, 'death panel: hidden while alive');
  G3.combat.down[me] = { until: 99999, by: 'Cy', weapon: 'M4A4', wid: 'm4', head: true, at: 1000 }; P.update(true, G3, me, 1100);
  ok(!P.el.hidden && P.el.innerHTML.includes('KILLED BY') && P.el.innerHTML.includes('Cy') && P.el.innerHTML.includes('/i/m4.svg') && P.el.innerHTML.includes('data-k="head"') && P.el.innerHTML.includes('64'), 'death panel: killer, weapon icon, HS mark, their health');
  const w = P.el.innerHTML; P.update(true, G3, me, 1200); ok(P.el.innerHTML === w, 'written once per death');
  P.update(true, G3, me, 1000 + KE.DEATH_PANEL_MS + 10); ok(P.el.hidden, 'gone after ' + KE.DEATH_PANEL_MS / 1000 + ' s');
  delete G3.combat.down[me]; P.update(true, G3, me, 9000); G3.combat.down[me] = { until: 99999, by: 'Di', weapon: 'Glock', wid: 'pistol', head: false, at: 9000 }; P.update(true, G3, me, 9001);
  ok(!P.el.hidden && !P.el.innerHTML.includes('data-k="head"'), 'a body kill: no HS mark');
  G3.combat.down[me] = { until: 99999, by: '<b>x</b>', weapon: 'x', wid: 'ak', at: 9500 }; P.update(true, G3, me, 9501); ok(!P.el.innerHTML.includes('<b>x</b>'), "the killer's name is escaped");
  delete G3.combat.down[me]; P.update(true, G3, me, 9600); ok(P.el.hidden, 'back: hidden'); }

if (fails) { console.error(`FAIL: gd-kill-emblem · ${fails} of ${n}`); process.exit(1); }
console.log(`PASS: gd-kill-emblem · ${n} checks (CS2 card fan per count, badge + line, headshot variant, pips, marks, burst / pulse / escalation / ace ring, extra card past 5, cleared at the freeze, deathmatch per life, team logo, reduce flashes, CS2 pictures in place, transform/opacity on HTML only, delayed parts start invisible, no allocation per kill, frame or feed line, death panel)`);
