// Global Defensive · CS2's centre-top messages (v53 stage 4, spec 3 "Messages"): CS2's HUD alert bar (CSGOHudAlerts,
// panorama/styles/hud/hudalerts.vcss in the user's install) for the round's events, in Defuse.
//
// LOOK (hudalerts.vcss / csgostyles.vcss): a bar alert-width 300 px wide, 120 px below the top of the view (y: 120px),
// centred; its text 18 px white with a 1 px shadow (#AlertText, padding 8 px 24 px); a 2 px white bar at each side
// (.alert-bar-side); its fill rgba(0, 0, 0, .5) with CS2's dots at 0.04 (.alert-bar-bg) over the world blurred
// (world-blur). It opens from a white line: scale3d(0, 1, 1) → 1 over 0.25 s ease-in while the white fades to clear in
// 0.15 s (.AlertVisible), and closes the same way back to scale 0 (.AlertHidden, the text fading in 0.25 s). Sizes in
// CS2's 1080 p pixels on the HUD unit --gd-u (gd-hud.js); it sits above the crosshair (top 120 of 1080), never over it.
// TEXT (the user's resource/csgo_english.txt): "The bomb has been planted" (Cstrike_TitlesTXT_Bomb_Planted, its first
// line), "The bomb has been defused" (SFUI_Notice_Bomb_Defused), "Round Draw" (SFUI_Notice_Round_Draw), "MATCH POINT"
// (SFUI_Notice_Alert_Match_Point), "LAST ROUND OF FIRST HALF" (…_Last_Round_Half), "FINAL ROUND" (…_Final_Round),
// "MATCH START" (…_Match_Start), "WARMUP m:ss" (…_Warmup_Period "WARMUP %s1").
// STATE MACHINE (from the host's round, d.round, on every computer): HIDDEN --(an event: the plant, the defuse, a draw;
// a freeze time that is match point / the half's last round / the final round / the first round after warmup)-->
// SHOWN (SHOW_MS, then HIDDEN); warmup: SHOWN while the phase is 'warmup' (its clock written once a second), HIDDEN after.
// How long an alert stays is set in CS2's code, not its files: ours 3 s (SHOW_MS). Sounds: none of its own — CS2's
// round radio ("Bomb has been planted", gd-sounds.js round sounds) already plays, and the user's rule keeps the round
// sounds to CS2's own set.
// COST: one node set, built once; a frame compares the phase, the round number and the warmup second — DOM written only
// when the message changes (text from a fixed table; the warmup clock a string once a second).
export const SHOW_MS = 3000;
export const ALERT_TEXT = Object.freeze({ planted: 'The bomb has been planted', defused: 'The bomb has been defused', draw: 'Round Draw', matchPoint: 'MATCH POINT', lastHalf: 'LAST ROUND OF FIRST HALF', final: 'FINAL ROUND', start: 'MATCH START' });
export const ALERTS_CSS = `
#gd-alert{position:fixed;left:calc(var(--gd-view-left,0px) + var(--gd-view-w,100vw) / 2 - 150 * var(--gd-u,1px));top:calc(var(--gd-view-top,0px) + 120 * var(--gd-u,1px));width:calc(300 * var(--gd-u,1px));z-index:40;pointer-events:none;border-radius:3px;transform:scaleX(0);transition:transform .25s ease-in;overflow:hidden}
#gd-alert .bg{position:absolute;inset:0;background:#00000080;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}#gd-alert .wh{position:absolute;inset:0;background:#fff;opacity:1;transition:opacity .15s ease-in}
#gd-alert .sd{position:absolute;top:0;bottom:0;width:2px;background:#fff}#gd-alert .sd.l{left:0}#gd-alert .sd.r{right:0}
#gd-alert b{position:relative;display:block;padding:calc(8 * var(--gd-u,1px)) calc(24 * var(--gd-u,1px));text-align:center;font:600 calc(18 * var(--gd-u,1px))/1.25 'GD HUD','Barlow Semi Condensed',system-ui,sans-serif;color:#fff;text-shadow:1px 1px 2px #000000d2;opacity:0;transition:opacity .25s ease-in;white-space:nowrap}
#gd-alert.on{transform:scaleX(1)}#gd-alert.on .wh{opacity:0;transition-delay:.25s}#gd-alert.on b{opacity:1;transition-delay:.25s}`;

// MATCH POINT (v53 HITS, ui-ot-match-point): a side one round from winning. In regulation that is win − 1 (12 of MR12)
// while the other side has less (12–12 under MR3 overtime is no match point: it goes to overtime). In MR3 overtime
// (arena-defuse.js end: blocks of six from (win − 1)–(win − 1), each won at its base + 4) a side on its block's base + 3:
// 15–14, 15–12 … in the first block, 18–17 in the second. (Sudden death: the next round at (win − 1)–(win − 1) decides.)
export function matchPoint(d) { const win = d?.rules?.win || 13, s = d?.score || {}, t = s.t | 0, ct = s.ct | 0, reg = 2 * (win - 1), played = t + ct, ot = d?.rules?.ot;
  if (ot === 'mr3' && t >= win - 1 && ct >= win - 1) { const base = win - 1 + 3 * Math.floor((played - reg) / 6); return Math.max(t, ct) === base + 3; }
  return t === win - 1 || ct === win - 1; }
// The alert for a round state (pure: tests): the message key for what just happened, or null.
// prev: the last phase seen; d: the host's defuse state (d.round, d.n, d.score, d.rules).
export function alertFor(prev, d) {
  const r = d?.round; if (!r || r.phase === prev) return null;
  if (r.phase === 'planted') return 'planted';
  if (r.phase === 'over') return r.reason === 'defuse' ? 'defused' : !r.winner ? 'draw' : null;   // (a win: CS2's win panel says it — gd-round-panel.js)
  if (r.phase === 'freeze') { const win = d.rules?.win || 13, half = win - 1, s = d.score || {}, n = d.n | 0;
    if (prev === 'warmup' || n === 1) return 'start';
    if (matchPoint(d)) return 'matchPoint';
    if (n === half) return 'lastHalf'; if (n === 2 * half) return 'final'; }
  return null; }

export function createHudAlerts({ doc = globalThis.document } = {}) {
  if (!doc?.body) return { update() {}, get text() { return ''; } };
  if (!doc.getElementById('gd-alert-css')) { const st = doc.createElement('style'); st.id = 'gd-alert-css'; st.textContent = ALERTS_CSS; (doc.head || doc.body).append(st); }
  const el = doc.createElement('div'); el.id = 'gd-alert'; el.innerHTML = '<i class="bg"></i><i class="wh"></i><i class="sd l"></i><i class="sd r"></i><b></b>'; doc.body.append(el);
  const tx = el.querySelector('b'); let prev, until = 0, on = false, cur = '', wsec = -1, round = null;
  const show = t => { if (t !== cur) { cur = t; tx.textContent = t; } if (!on) { on = true; el.className = 'on'; } };
  const hide = () => { if (on) { on = false; el.className = ''; } };
  return {
    get text() { return on ? cur : ''; },
    // Every frame: on = a Defuse match is on screen; G = the game; now = the host's clock (ms).
    update(onScreen, G, now) {
      const d = onScreen ? G?.combat?.d : null, r = d?.round; if (!r) { hide(); prev = undefined; return; }
      if (r.phase === 'warmup') { const L = G.arena?.lobby, s = L && !L.started && L.until ? Math.max(0, Math.ceil((L.until - now) / 1000)) : -1;   // (the lobby's countdown, as arena-ui.js: none — just WARMUP)
        if (s !== wsec || !on) { wsec = s; show(s < 0 ? 'WARMUP' : 'WARMUP ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')); } prev = r.phase; until = 0; return; }
      wsec = -1;
      if (r !== round || r.phase !== prev) { round = r; const k = alertFor(prev, d); prev = r.phase; if (k) { show(ALERT_TEXT[k]); until = now + SHOW_MS; } else if (!until) hide(); }
      if (until && now > until) { until = 0; hide(); }
    },
  };
}
