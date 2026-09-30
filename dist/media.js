// Cable, optic and connector rules for one physical link. Pure functions of the link and its ports,
// used by physicalLinkDown (operations), the device-logic port state, LEDs and the CLI transceiver view.
//
// Rules (training values from IEEE / vendor datasheets):
//  - RJ45 ports (1G copper, MGMT) take CAT6 only; SFP/QSFP cages take a DAC/AOC or an optic + fiber.
//  - SR optics need multimode fiber (OM4 in this game); LR optics need single-mode OS2 fiber.
//  - Both ends need an optic of the port speed and medium, and the same reach family (SR↔SR, LR↔LR).
//  - Maximum length: CAT6 100 m, passive DAC 7 m, AOC 30 m, SR 10G 400 m / 25G+ 100 m, LR 10 km.
//  - A dirty connector lowers rx power below sensitivity (the port flaps and counts CRC errors);
//    a fiber cut means no light at all. Forced speeds must match on both ends (amber LED).
export const CABLES = {
  cat6: { kind: 'copper', max: 100, label: 'CAT6' }, os2: { kind: 'fiber', fiber: 'OS2', label: 'OS2 single-mode fiber' },
  fiber: { kind: 'fiber', fiber: 'OM4', label: 'OM4 multimode fiber' }, fc: { kind: 'fiber', fiber: 'OM4', label: 'OM4 FC fiber' },
  aoc: { kind: 'aoc', max: 30, label: 'AOC' }, dac10: { kind: 'dac', max: 7, label: '10G DAC' }, dac25: { kind: 'dac', max: 7, label: '25G DAC' }, dac100: { kind: 'dac', max: 7, label: '100G DAC' }, dac200: { kind: 'dac', max: 7, label: '200G DAC' }
};
export function parseOptic(id) { const m = /^(SFP\+|SFP28|QSFP28|FC)(\d+)(SR|LR)$/.exec(id || ''); return m ? { id, form: m[1], speed: +m[2], reach: m[3], medium: m[1] === 'FC' ? 'Fibre Channel' : 'Ethernet' } : null; }
export const connector = p => p.medium === 'Console' ? 'RJ45 console' : p.medium === 'Fibre Channel' ? 'SFP (FC)' : p.speed <= 1 && !/^SFP/.test(p.name) ? 'RJ45' : p.speed >= 100 ? 'QSFP' : 'SFP';
export const opticReach = o => !o ? 0 : o.reach === 'LR' ? 10000 : o.speed === 10 ? 400 : 100;
// Why an optic cannot go into this port (null when it fits).
export function opticFitError(p, id) {
  const o = parseOptic(id);
  if (!o) return 'Not a transceiver';
  if (connector(p) === 'RJ45') return p.name + ' is an RJ45 copper port · it does not take an SFP transceiver';
  return null;
}
export function opticProblem(p) {
  const o = parseOptic(p.optic);
  if (!p.optic) return 'no transceiver inserted';
  if (!o || o.speed !== p.speed || o.medium !== p.medium) return 'unsupported transceiver ' + p.optic + ' (port needs ' + p.speed + 'G ' + (p.medium === 'Fibre Channel' ? 'FC' : 'Ethernet') + ')';
  return null;
}
// Returns null when the physical layer is fine, else { code, text, led } (led: amber | off).
export function mediaFault(l) {
  const c = CABLES[l.media];
  if (l.fault === 'cut') return { code: 'no-light', text: 'no light received (fiber cut / LOS)', led: 'off' };
  if (l.fault === 'dirty') return { code: 'dirty', text: 'rx power −14.2 dBm below −11.1 dBm sensitivity (dirty connector) · link flapping, CRC errors rising', led: 'amber' };
  if (c && (c.kind === 'fiber')) {
    for (const p of [l.pa, l.pb]) { const why = opticProblem(p); if (why) return { code: 'transceiver', text: p.name + ': ' + why, led: 'amber' }; }
    const a = parseOptic(l.pa.optic), b = parseOptic(l.pb.optic);
    if (a.reach !== b.reach) return { code: 'reach', text: a.reach + ' optic ↔ ' + b.reach + ' optic do not interoperate (different wavelength)', led: 'amber' };
    if (a.reach === 'LR' && c.fiber !== 'OS2') return { code: 'fiber-type', text: 'LR optics need single-mode OS2 fiber, this is ' + c.label, led: 'amber' };
    if (a.reach === 'SR' && c.fiber === 'OS2') return { code: 'fiber-type', text: 'SR optics need multimode OM3/OM4 fiber, this is ' + c.label, led: 'amber' };
    if (l.length && l.length > opticReach(a)) return { code: 'length', text: l.length + ' m exceeds ' + a.reach + ' ' + a.speed + 'G reach of ' + opticReach(a) + ' m', led: 'amber' };
  } else if (c && c.max && l.length > c.max) return { code: 'length', text: c.label + ' ' + l.length + ' m exceeds the ' + c.max + ' m maximum', led: 'off' };
  const x = l.pa.cfg || {}, y = l.pb.cfg || {};
  if (Number.isFinite(+x.speed) && +x.speed > 0 && Number.isFinite(+y.speed) && +y.speed > 0 && +x.speed !== +y.speed) return { code: 'speed', text: 'speed mismatch ' + x.speed + ' ↔ ' + y.speed + ' Mb/s (forced)', led: 'amber' };
  return null;
}
// Deterministic counters derived from how long a fault has been present (no per-tick mutation).
export function errorCounters(l, now = Date.now()) {
  if (!l || l.fault !== 'dirty') return { crc: 0, flaps: 0 };
  const secs = Math.max(1, Math.floor((now - (l.faultSince || now)) / 1000));
  return { crc: secs * 37, flaps: Math.ceil(secs / 4) };
}
export function rxPower(p, l) {
  if (!l || l.unplugged) return null;
  if (l.fault === 'cut') return -40;
  if (l.fault === 'dirty') return -14.2;
  const o = parseOptic(p.optic);
  if (!o) return null;
  return o.reach === 'LR' ? -5.1 : -2.3;
}
