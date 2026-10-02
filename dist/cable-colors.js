// One colour per cable type. The same palette colours the cables in the racks, carried coils, loose ends
// and the legend, so a cable's colour always says what it is.
export const CABLE_TYPES = {
  cat6: { label: 'Cat6 copper · data', color: 0x3b82f6 },
  mgmt: { label: 'Cat6 copper · management', color: 0xa855f7 },
  fiber: { label: 'OM4 multimode fibre', color: 0x22d3ee },
  os2: { label: 'OS2 single-mode fibre', color: 0xfacc15 },
  fc: { label: 'Fibre Channel · SAN', color: 0x22c55e },
  dac: { label: 'DAC twinax copper', color: 0xb8c2cc },
  aoc: { label: 'AOC active optical', color: 0xf472b6 },
  power: { label: 'Power cord', color: 0xef4444 }
};

// Cable type from the product used (media) or, for pre-cabled facility links, from the ports.
export function cableType({ media, kind, speed, medium, names = '' } = {}) {
  if (media === 'power') return 'power';
  if (media === 'os2') return 'os2';
  if (media === 'fc' || medium === 'Fibre Channel' || (!media && kind === 'storage')) return 'fc';
  if (media === 'fiber') return 'fiber';
  if (media === 'aoc') return 'aoc';
  if (media?.startsWith?.('dac')) return 'dac';
  if (kind === 'management' || /MGMT/.test(names)) return 'mgmt';
  if (!media && speed === 1) return 'mgmt';
  if (media === 'cat6') return 'cat6';
  return speed >= 25 ? 'fiber' : 'cat6';
}

// A link's type: its product if one was installed, otherwise its ports.
export function linkCableType(l) {
  const p = l.pa || {};
  return cableType({ media: l.media, kind: l.kind, speed: Math.min(p.speed ?? 100, l.pb?.speed ?? 100), medium: p.medium, names: (p.name || '') + ' ' + (l.pb?.name || '') });
}

export const cableColor = type => (CABLE_TYPES[type] || CABLE_TYPES.cat6).color;

// Catalogue item (a carried coil) → type.
export function skuCableType(c) {
  if (!c) return 'cat6';
  if (c.type === 'power') return 'power';
  return cableType({ media: c.id, speed: c.speed, medium: c.medium });
}
