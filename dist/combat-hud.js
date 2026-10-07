// Payday combat HUD: HP bar, red flash when hit, hit marker, kill feed, the knocked-out screen with a
// countdown, and the respawn move back to the entrance. Remote engineers who are down play the "dead" emote.
import { hpOf, isDown } from './combat-logic.js';
import { MAX_HP } from './weapons-data.js';

const key = name => String(name || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';

// Hit feedback sounds (synthesized): a short tick for a body hit, a bright ding for a head shot, two notes for a knock-out.
let hctx = null;
function hitSound(kind) { try { hctx ??= new AudioContext(); if (hctx.state === 'suspended') hctx.resume(); const t = hctx.currentTime;
  const note = (f, at, len, vol, type = 'sine') => { const o = hctx.createOscillator(), g = hctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t + at); g.gain.setValueAtTime(vol, t + at); g.gain.exponentialRampToValueAtTime(.001, t + at + len); o.connect(g).connect(hctx.destination); o.start(t + at); o.stop(t + at + len + .02); };
  if (kind === 'body') note(1400, 0, .05, .22, 'triangle'); else if (kind === 'head') { note(2600, 0, .12, .25); note(3900, 0, .08, .1); } else { note(1800, 0, .1, .25); note(2700, .09, .18, .25); } } catch {} }
export const warmHitSound = () => { try { hctx ??= new AudioContext(); } catch {} };
export function createCombatHUD({ world, lan, name, onRespawn = () => {} }) {
  const css = document.createElement('style'); css.textContent = `
#cb-hp{position:fixed;left:16px;bottom:96px;z-index:36;width:220px;font:700 12px system-ui;color:#fff;text-shadow:0 1px 2px #000}#cb-hp[hidden]{display:none}
#cb-hp div{height:12px;margin-top:4px;background:#0008;border:1px solid #fff5;border-radius:6px;overflow:hidden}#cb-hp i{display:block;height:100%;background:linear-gradient(90deg,#e23b3b,#ffb347 50%,#5fd97a);transition:width .2s}
#cb-flash{position:fixed;inset:0;z-index:35;pointer-events:none;box-shadow:inset 0 0 160px 40px #d40000;opacity:0;transition:opacity .35s}
#cb-mark{position:fixed;left:50%;top:50%;width:26px;height:26px;margin:-13px;z-index:37;pointer-events:none;opacity:0;transition:opacity .15s}
#cb-mark:before,#cb-mark:after{content:'';position:absolute;left:12px;top:0;width:2px;height:26px;background:#fff;transform:rotate(45deg)}#cb-mark:after{transform:rotate(-45deg)}#cb-mark.kill:before,#cb-mark.kill:after{background:#ff4040}
#cb-feed{position:fixed;right:16px;top:64px;z-index:36;font:600 13px system-ui;color:#fff;text-align:right;pointer-events:none}#cb-feed p{margin:3px 0;background:#0009;padding:3px 8px;border-radius:6px}
#cb-down{position:fixed;inset:0;z-index:44;display:grid;place-items:center;background:#300a0acc;color:#fff;font:700 28px system-ui;text-align:center}#cb-down[hidden]{display:none}#cb-down small{display:block;font:500 16px system-ui;margin-top:8px}`;
  (document.head || document.body).append?.(css);
  document.body.insertAdjacentHTML('beforeend', '<div id="cb-hp" hidden><span id="cb-hp-t">HP 100</span><div><i id="cb-hp-bar" style="width:100%"></i></div></div><div id="cb-flash"></div><div id="cb-mark"></div><div id="cb-feed"></div><div id="cb-down" hidden></div>');
  const $ = id => document.getElementById(id);
  let lastHp = MAX_HP, lastRespawn = null, markTimer = 0, feedKey = '';
  return {
    hitMarker(kill, head) { hitSound(kill ? 'kill' : head ? 'head' : 'body'); const m = $('cb-mark'); m.className = kill ? 'kill' : ''; m.style.opacity = 1; clearTimeout(markTimer); markTimer = setTimeout(() => m.style.opacity = 0, kill ? 500 : 160); },
    get down() { const g = world.operations.game; return !!g.payday && isDown(g, name()); },
    update() {
      const g = world.operations.game, on = !!g.payday && lan.connected; $('cb-hp').hidden = !on;
      if (!on) { $('cb-down').hidden = true; return; }
      const hp = hpOf(g, name()); $('cb-hp-t').textContent = 'HP ' + hp; $('cb-hp-bar').style.width = hp + '%';
      if (hp < lastHp) { const f = $('cb-flash'); f.style.opacity = .85; setTimeout(() => f.style.opacity = 0, 120); } lastHp = hp;
      const d = g.combat?.down?.[key(name())], down = d && d.until > Date.now(); $('cb-down').hidden = !down;
      if (down) $('cb-down').innerHTML = `<div>KNOCKED OUT<small>by ${String(d.by).replace(/[<>&]/g, '')} · ${d.weapon} · back in ${Math.max(0, Math.ceil((d.until - Date.now()) / 1000))} s</small></div>`;
      const r = g.combat?.respawns?.[key(name())] || 0; if (lastRespawn !== null && r > lastRespawn) onRespawn(); lastRespawn = r;
      const feed = (g.combat?.feed || []).filter(f => Date.now() - f.at < 8000), fk = feed.map(f => f.at).join();
      if (fk !== feedKey) { feedKey = fk; $('cb-feed').innerHTML = feed.map(f => `<p>${String(f.by).replace(/[<>&]/g, '')} <b style="color:#ffb347">⟶</b> ${String(f.target).replace(/[<>&]/g, '')} <small>${f.weapon}${f.head ? ' · head' : ''}</small></p>`).join(''); }
      // Engineers who are down fall over on everyone's screen.
      for (const [id, m] of lan.models || []) { const p = lan.players?.find(x => x.id === id); const dn = !!p && isDown(g, p.name); if (dn && !m.cbDown) m.play?.('dead'); m.cbDown = dn; }
    }
  };
}
