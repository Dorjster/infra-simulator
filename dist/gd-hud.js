// Global Defensive HUD (compact, CS2-like): health + armor (bottom left), weapon · magazine / reserve · fire mode ·
// reload · grenades · bomb / kit (bottom right), the dynamic crosshair (moves to where the next bullet goes and opens
// up with movement inaccuracy) and the scope overlay. DOM is touched only when a value changes.
import { weaponById, moveInaccuracy, MAX_HP, isFirearm } from './weapons-data.js';
import { hpOf, armorOf } from './combat-logic.js';

const key = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';
const MODE = { auto: 'AUTO', semi: 'SEMI', pump: 'PUMP', bolt: 'BOLT' };
const NADE_ICON = { he: '●', flash: '◆', smoke: '■', molotov: '▲' };
export function createGdHud({ world, name, weapons, recoil, fov, move, active }) {
  const css = document.createElement('style'); css.textContent = `
#gd-hud{position:fixed;inset:0;z-index:36;pointer-events:none;font:700 14px system-ui;color:#fff;text-shadow:0 1px 3px #000c}#gd-hud[hidden]{display:none}
#gd-hp{position:absolute;left:22px;bottom:22px;display:flex;align-items:flex-end;gap:18px}#gd-hp .v{display:flex;align-items:baseline;gap:6px}#gd-hp b{font:800 40px ui-monospace,Menlo,Consolas,monospace;letter-spacing:-.02em}#gd-hp small{font:700 11px system-ui;letter-spacing:.12em;opacity:.75}#gd-hp .ico{font:900 22px system-ui;opacity:.9}#gd-hp .low b,#gd-hp .low .ico{color:#ff4d4d}#gd-hp .arm.none{opacity:.35}
#gd-hpbar{position:absolute;left:22px;bottom:12px;width:150px;height:4px;background:#ffffff26;border-radius:2px;overflow:hidden}#gd-hpbar i{display:block;height:100%;background:#e8eef2;transition:width .15s}
#gd-wp{position:absolute;right:22px;bottom:18px;text-align:right}#gd-wp .name{font:800 13px system-ui;letter-spacing:.08em;color:#ffd36b}#gd-wp .ammo{font:800 40px ui-monospace,Menlo,Consolas,monospace}#gd-wp .ammo small{font:700 20px ui-monospace,Menlo,monospace;opacity:.7}#gd-wp .ammo.low{color:#ff6b6b}#gd-wp .meta{font:700 11px system-ui;letter-spacing:.12em;opacity:.8}#gd-wp .rl{height:4px;background:#ffffff26;border-radius:2px;margin-top:4px;overflow:hidden}#gd-wp .rl i{display:block;height:100%;background:#9fd8ff}#gd-wp .util{margin-top:6px;font:900 16px system-ui;letter-spacing:.3em;opacity:.9}#gd-wp .util span.on{color:#ffd36b}
#gd-x{position:absolute;left:50%;top:50%;width:0;height:0}#gd-x i{position:absolute;background:#7dff8e;box-shadow:0 0 1px #000,0 0 2px #000}#gd-x .t,#gd-x .b{width:2px;height:7px;left:-1px}#gd-x .l,#gd-x .r{height:2px;width:7px;top:-1px}#gd-x .c{width:2px;height:2px;left:-1px;top:-1px}#gd-x[hidden]{display:none}
#gd-scope{position:absolute;inset:0;display:none}#gd-scope.on{display:block}#gd-scope .ring{position:absolute;left:50%;top:50%;width:min(92vh,92vw);height:min(92vh,92vw);transform:translate(-50%,-50%);border-radius:50%;box-shadow:0 0 0 200vmax #000;border:2px solid #000}#gd-scope .h,#gd-scope .v{position:absolute;background:#000}#gd-scope .h{left:0;right:0;top:50%;height:1px}#gd-scope .v{top:0;bottom:0;left:50%;width:1px}#gd-scope.dot .ring{width:min(60vh,60vw);height:min(60vh,60vw);box-shadow:0 0 0 200vmax #000c}#gd-scope.dot .h,#gd-scope.dot .v{display:none}#gd-scope.dot:after{content:'';position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px;border-radius:50%;background:#ff3030;box-shadow:0 0 4px #f00}`;
  (document.head || document.body).append?.(css);
  document.body.insertAdjacentHTML('beforeend', `<div id="gd-hud" hidden><div id="gd-scope"><div class="ring"></div><div class="h"></div><div class="v"></div></div><div id="gd-x"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="c"></i></div>
    <div id="gd-hp"><div class="v hp"><span class="ico">✚</span><b>100</b><small>HP</small></div><div class="v arm none"><span class="ico">⛨</span><b>0</b><small>ARMOR</small></div></div><div id="gd-hpbar"><i style="width:100%"></i></div>
    <div id="gd-wp"><div class="name"></div><div class="ammo"></div><div class="meta"></div><div class="rl"><i style="width:0"></i></div><div class="util"></div></div></div>`);
  const $ = s => document.querySelector(s), root = $('#gd-hud'), last = {};
  const set = (k, el, prop, v) => { if (last[k] === v) return; last[k] = v; if (prop === 'html') el.innerHTML = v; else if (prop === 'text') el.textContent = v; else if (prop === 'class') el.className = v; else el.style[prop] = v; };
  const els = { hp: $('#gd-hp .hp b'), hpBox: $('#gd-hp .hp'), arm: $('#gd-hp .arm b'), armBox: $('#gd-hp .arm'), armIco: $('#gd-hp .arm .ico'), bar: $('#gd-hpbar i'), name: $('#gd-wp .name'), ammo: $('#gd-wp .ammo'), meta: $('#gd-wp .meta'), rl: $('#gd-wp .rl i'), util: $('#gd-wp .util'), x: $('#gd-x'), scope: $('#gd-scope'), xt: $('#gd-x .t'), xb: $('#gd-x .b'), xl: $('#gd-x .l'), xr: $('#gd-x .r'), xc: $('#gd-x .c') };
  const px = (rad, f) => Math.tan(rad) / Math.tan(f * Math.PI / 360) * innerHeight / 2;
  return {
    update() {
      const g = world.operations.game, on = g.mode === 'arena' && active(); if (root.hidden === on) root.hidden = !on; if (!on) return;
      const me = name(), hp = hpOf(g, me), arm = armorOf(g, me), w = weapons.current, l = g.arena?.loadout?.[key(me)] || {}, d = g.combat?.d;
      set('hp', els.hp, 'text', String(hp)); set('hpc', els.hpBox, 'class', 'v hp' + (hp <= 25 ? ' low' : '')); set('bar', els.bar, 'width', Math.max(0, hp) / MAX_HP * 100 + '%');
      set('arm', els.arm, 'text', String(arm.kevlar || 0)); set('armc', els.armBox, 'class', 'v arm' + (arm.kevlar ? '' : ' none')); set('armi', els.armIco, 'text', arm.helmet ? '⛑' : '⛨');
      if (w) {
        set('wn', els.name, 'text', w.name.toUpperCase());
        if (isFirearm(w)) { const m = weapons.ammo, r = weapons.reserve; set('wa', els.ammo, 'html', `${m}<small> / ${r}</small>`); set('wac', els.ammo, 'class', 'ammo' + (m <= Math.ceil(w.mag * .2) ? ' low' : '')); set('wm', els.meta, 'text', MODE[w.mode] + (w.suppressed ? ' · SUPPRESSED' : '') + (weapons.reloading ? ' · RELOADING' : m === 0 && r > 0 ? ' · R TO RELOAD' : m === 0 ? ' · EMPTY' : '')); }
        else { set('wa', els.ammo, 'html', ''); set('wm', els.meta, 'text', w.kind === 'knife' ? 'LEFT SLASH · RIGHT STAB' : w.kind === 'nade' ? 'HOLD LEFT: LONG · RIGHT: SHORT · BOTH: MEDIUM' : w.kind === 'bomb' ? 'HOLD LEFT ON A SITE TO PLANT' : ''); }
        set('rl', els.rl, 'width', weapons.reloading ? (1 - weapons.reloadLeft) * 100 + '%' : '0');
      } else { set('wn', els.name, 'text', ''); set('wa', els.ammo, 'html', ''); set('wm', els.meta, 'text', ''); }
      const nades = Array.isArray(l.nades) ? l.nades : [], extra = (d?.bomb?.carrier === key(me) ? ' <span class="on">C4</span>' : '') + (d?.kits?.[key(me)] ? ' <span>KIT</span>' : '');
      set('ut', els.util, 'html', nades.map(n => `<span class="${w?.id === n ? 'on' : ''}">${NADE_ICON[n] || '•'}</span>`).join('') + extra);
      // Crosshair: offset to where the next bullet goes (recoil), gap from movement inaccuracy; scope overlay instead when scoped.
      const sc = weapons.scope, f = fov(), sniper = w?.kind === 'sniper';
      set('sc', els.scope, 'class', sc ? (sniper ? 'on' : 'on dot') : '');
      const showX = !!w && !(sc && sniper); if (els.x.hidden === showX) els.x.hidden = !showX; if (!showX) return;
      const ro = recoil(), ox = px(ro.yaw, f), oy = -px(ro.pitch, f), inacc = w ? moveInaccuracy(w, { ...move(), scoped: sc > 0 }) : 0, gap = 4 + Math.min(60, px(inacc, f));
      set('xpos', els.x, 'transform', `translate(${ox.toFixed(1)}px,${oy.toFixed(1)}px)`);
      const gp = Math.round(gap); if (last.gap !== gp) { last.gap = gp; els.xt.style.top = -(gp + 7) + 'px'; els.xb.style.top = gp + 'px'; els.xl.style.left = -(gp + 7) + 'px'; els.xr.style.left = gp + 'px'; }
    },
  };
}
