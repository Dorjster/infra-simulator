// Device GUI guards shared by every vendor page:
//  · inline validation — IPv4 addresses, prefixes, VLAN IDs, MTU and sizes are checked while typing
//    (red field + reason under it) and a Save/submit with an invalid field is stopped before it is sent;
//  · dangerous actions — delete, power off, restore, reinstall, maintenance, disabling a policy… first
//    show the impact and only run on a second click ("Confirm") within 10 s.
// Both run as capture-phase listeners on the GUI container, so page handlers stay unchanged.
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;
const int = v => /^-?\d+$/.test(String(v).trim()) ? +v : NaN;
// The rule for a field comes from its id (pg-…) or form name.
export function fieldError(key, raw) {
  const k = String(key || '').replace(/^pg-/, '').toLowerCase(), v = String(raw ?? '').trim();
  if (!v) return '';
  if (/(^|-)(ip|ipa|ipb|lanip|wanip|nodea|nodeb|gateway|wangateway|wandns|dns|nexthop|gw)$/.test(k)) return IPV4.test(v) ? '' : 'Enter an IPv4 address such as 10.10.10.1';
  if (/(^|-)ntp$/.test(k)) return IPV4.test(v) || HOST.test(v) ? '' : 'Enter an IPv4 address or host name';
  if (/prefix$/.test(k)) { const n = int(v); return n >= 0 && n <= 32 ? '' : 'Prefix length is 0–32 (for example 24)'; }
  if (/(^|-)vlan(a|b)?$/.test(k)) { const n = int(v); return n >= 0 && n <= 4094 ? '' : 'VLAN ID is 1–4094'; }
  if (/(^|-)mtu$/.test(k)) { const n = int(v); return n >= 576 && n <= 9216 ? '' : 'MTU is 576–9216 bytes (1500 standard, 9000 jumbo)'; }
  if (/sizegib$/.test(k)) { const n = int(v); return n > 0 ? '' : 'Size must be a positive number of GiB'; }
  return '';
}
function mark(el) {
  const err = el.disabled ? '' : fieldError(el.id || el.name, el.value);
  el.classList?.toggle('gv-invalid', !!err); el.setAttribute?.('aria-invalid', err ? 'true' : 'false');
  let tip = el.nextElementSibling?.classList?.contains('gv-field-err') ? el.nextElementSibling : null;
  if (err && !tip) { tip = document.createElement('small'); tip.className = 'gv-field-err'; el.after(tip); }
  if (tip) { tip.textContent = err; tip.hidden = !err; }
  return err;
}
const say = (container, text) => { const m = container.querySelector('#pg-message'); if (m) m.textContent = text; };
// impact(button|form, values) → text describing what the action will break, or '' when it is harmless.
export function bindGuards(container, { impact } = {}) {
  if (!container?.addEventListener) return;
  container.__guardImpact = impact;
  if (container.__guards) return; container.__guards = true;
  let pending = null;
  container.addEventListener('input', e => { if (e.target?.matches?.('input')) mark(e.target); });
  const invalidIn = scope => [...scope.querySelectorAll('input')].map(el => [el, mark(el)]).filter(x => x[1]);
  const confirmStep = (e, el, text, label) => {
    if (!text) return false;
    if (pending && pending.el === el && Date.now() - pending.at < 10000) { el.textContent = pending.label; pending = null; return false; }
    e.preventDefault(); e.stopImmediatePropagation();
    if (pending?.el && pending.el !== el) pending.el.textContent = pending.label;
    pending = { el, at: Date.now(), label: label ?? el.textContent };
    say(container, '⚠ ' + text + ' · click “Confirm” to continue.');
    el.textContent = 'Confirm: ' + pending.label;
    return true;
  };
  container.addEventListener('click', e => {
    const b = e.target?.closest?.('button'); if (!b || !container.contains(b) || b.type === 'submit') return;
    if (/-(save|add)$/.test(b.id || '')) { const bad = invalidIn(b.closest('.gv-card') || container); if (bad.length) { e.preventDefault(); e.stopImmediatePropagation(); say(container, 'Fix the highlighted field first: ' + bad[0][1]); bad[0][0].focus?.(); return; } }
    confirmStep(e, b, container.__guardImpact?.(b, {}) || '');
  }, true);
  container.addEventListener('submit', e => {
    const f = e.target; if (!f?.matches?.('form')) return;
    const bad = invalidIn(f); if (bad.length) { e.preventDefault(); e.stopImmediatePropagation(); say(container, 'Fix the highlighted field first: ' + bad[0][1]); return; }
    const v = {}; for (const el of f.elements || []) if (el.name) v[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    const btn = f.querySelector('button[type=submit]');
    if (btn) confirmStep(e, btn, container.__guardImpact?.(f, v) || '');
  }, true);
}
