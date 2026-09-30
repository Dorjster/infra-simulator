// Rack power model shared by operations, device logic, the PDU GUI/CLI and monitoring.
//
// Every rack has two metered 3-phase PDUs (A and B), each behind a 16 A breaker per phase at 230 V
// (3 × 16 A × 230 V = 11 040 W). A device
// draws watts from its model table: idle draw plus (max − idle) × utilization. The draw is split
// equally across the PSUs that currently have a live feed (1+1 redundancy). If a feed's total load
// exceeds its rating the breaker trips and every PSU on that PDU loses input; devices that relied on
// it alone go dark and the other feed may then trip too (a real cascading failure). Nothing trips at
// random: only the load that players create (or a challenge fault) can exceed the rating.
//
// State: game.pdus = { 'R04:A': { tripped, at, peakW } } (persisted). `grid` mirrors it for the pure
// helpers below so physicalOffline() and friends stay synchronous.
export const PDU_RATING_W = 11040;
export const PDU_PHASES = 3;
export const PDU_VOLTS = 230;
export const grid = { tripped: {}, fedOnly: false, fed: {} };
export function syncGrid(pdus) { grid.tripped = {}; for (const [k, v] of Object.entries(pdus || {})) if (v?.tripped) grid.tripped[k] = true; }
// Empty-site campaign: a placed rack's PDU A/B is energized only after its input cord is plugged into
// the building power whip above the rack (game.rackFeeds = { 'R01:A': true }). Other modes keep the
// fixed building racks permanently fed.
export function syncFeeds(game) { grid.fedOnly = !!game?.emptySite; grid.fed = { ...(game?.rackFeeds || {}) }; }
export const feedKey = (rack, feed) => rack + ':' + feed;
export const inputFed = (rack, feed) => !grid.fedOnly || !!grid.fed[feedKey(rack, feed)];
export const feedLive = (n, feed) => !!feed && !grid.tripped[feedKey(n.rack, feed)] && inputFed(n.rack, feed);
// PSU cords: a legacy (factory) device without a physical record is fed from A and B.
export const psuFeeds = n => n.physical ? (n.physical.power || [null, null]) : ['A', 'B'];
export const livePSUs = n => psuFeeds(n).map((f, i) => (feedLive(n, f) && !(n.physical?.fault === 'psu' && i === 1) ? i : -1)).filter(i => i >= 0);
export const hasPower = n => livePSUs(n).length > 0;
export const trippedFeeds = n => psuFeeds(n).filter(f => f && grid.tripped[feedKey(n.rack, f)]);

// [idle W, max W] typical draw per model (training values from vendor spec-sheet ranges).
export const DRAW = {
  fs148f: [60, 120], cx6200: [70, 140], nexus93180: [220, 450], nexus9348: [120, 250], dells5248: [200, 420], ds6610: [60, 110],
  fg200f: [80, 150], fg601f: [180, 320], ispcpe: [12, 18],
  r660: [180, 700], r760: [220, 900], r760xs: [200, 800], dl380g11: [200, 850], fazvm: [150, 450], fsiemvm: [200, 600],
  xe8640: [1100, 3600], xe9680: [1800, 7000],
  me5024iscsi: [380, 580], me5024fc: [380, 580], ps500: [700, 1100], ps3200: [900, 1400], alletra: [800, 1300], storeonce: [450, 700], powerscale: [350, 600], x560: [600, 900],
  // Legacy catalog / factory equipment by type.
  server: [250, 750], gpu: [1800, 7000], switch: [180, 350], san: [90, 150], firewall: [300, 650], storage: [700, 1200], isp: [12, 18]
};
export const PSU_WATTS = { xe9680: 2800, xe8640: 2400, gpu: 2800 };
export function drawRange(n) { return DRAW[n.spec?.sku] || DRAW[n.sku] || DRAW[n.type] || [100, 200]; }
// Utilization 0..1 from what actually runs on the device (no randomness).
export function utilization(n) {
  const r = n.net?.runtime, running = n.net?.workload !== 'stopped';
  if (['server', 'gpu'].includes(n.type)) {
    if (n.spec && !r?.os) return 0.05;
    if (!running) return 0.05;
    if (n.spec && n.type === 'server') { const vms = Object.values(r?.vms || {}).filter(v => v.on).length; return Math.min(1, 0.12 + vms * 0.14); }
    return Math.min(1, (n.net?.load ?? 60) / 100);
  }
  return running ? 0.3 : 0.1;
}
export function drawWatts(n, offline) {
  if (n.active === false || n.type === 'cloud' || n.controller) return 0;
  if (!hasPower(n)) return 0;
  const [idle, max] = drawRange(n);
  if (offline) return n.physical && !n.physical.on ? 15 : Math.round(idle * 0.6); // standby BMC / booting
  return Math.round(idle + (max - idle) * utilization(n));
}
// Load per rack feed with per-outlet detail (what the PDU GUI and CLI show).
export function rackLoad(rack, nodes, offline = () => false) {
  const out = { rack, A: 0, B: 0, outlets: { A: [], B: [] } };
  for (const n of nodes) {
    if (n.rack !== rack || n.active === false || n.type === 'cloud' || n.controller) continue;
    const live = livePSUs(n), feeds = psuFeeds(n), w = drawWatts(n, offline(n));
    feeds.forEach((f, i) => {
      if (!f) return;
      const share = live.includes(i) ? Math.round(w / live.length) : 0;
      out.outlets[f]?.push({ node: n.id, psu: i, watts: share, live: live.includes(i) });
      if (f in out && live.includes(i)) out[f] += share;
    });
  }
  // N+1 planning check: the load one feed must carry if the other fails.
  out.combined = out.A + out.B;
  return out;
}
export const amps = w => Math.round(w / (PDU_VOLTS * PDU_PHASES) * 10) / 10; // average per phase
export function rackIds(nodes, racks = []) { return [...new Set([...nodes.filter(n => n.active !== false && n.rack && n.type !== 'cloud').map(n => n.rack), ...racks.map(r => r.id)])].sort(); }
