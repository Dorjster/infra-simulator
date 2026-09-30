// 3D LED colours and blink patterns. The colour/blink comes from the device-logic leds() (cached per
// logic tick); only the blink phase is computed per frame, so LEDs never disagree with GUI/CLI state.
export const LED_HEX = { green: 0x75ffd0, amber: 0xffac55, red: 0xff5147, blue: 0x5fa8ff, off: 0x12212b };
// Whether a blinking LED is lit at time t (ms); `phase` staggers activity blinking between ports.
export function ledLit(blink, t, phase = 0) {
  if (blink === 'slow') return Math.floor(t / 500) % 2 === 0;
  if (blink === 'fast') return Math.floor(t / 125) % 2 === 0;
  if (blink === 'activity') return Math.sin(t / 140 + phase) > 0;
  return true;
}
export function ledColor(l, t, phase = 0) {
  if (!l || l.color === 'off') return LED_HEX.off;
  const hex = LED_HEX[l.color] ?? LED_HEX.green;
  if (ledLit(l.blink, t, phase)) return hex;
  return l.blink === 'activity' ? 0x278766 : LED_HEX.off;
}
// The chassis status LED of a device: the logic 'status' LED (or the first non-power front LED).
export function statusLed(leds) { const f = leds?.front || []; return f.find(x => /^status$/i.test(x.id)) || f.find(x => !/^(power|pwr)$/i.test(x.id)) || f[0] || null; }
