// Global Defensive weapons: the one place every gun is defined. Shared by the host's rules (damage, armor, ammo,
// prices, fire rate, range) and the client (spray, accuracy, scope, HUD, buy menu, models, sounds).
// Stats follow CS2's published values (damage, armor penetration, fire rate, magazine/reserve, reload, speed,
// prices, kill rewards); spray patterns and movement accuracy are our own, tuned to be learnable.
//
// Fields: id · name · kind (rifle | sniper | smg | shotgun | pistol | lmg | knife | nade | bomb) · team ('t' | 'ct' |
// null = both) · price ($) · reward (kill $) · dmg (per bullet; per pellet for shotguns) · ap (armor penetration:
// share of the damage that still goes to health on an armored body) · rangeMod (damage ×rangeMod per 500 HU) ·
// rateMs (between shots) · mode (auto | semi | pump | bolt) · mag / reserve (rounds) · reloadMs · speed (HU/s run) ·
// range (game units, max distance a hit counts) · pellets / pelletSpread (rad, shotguns) · pattern (spray: [pitch°,
// yaw°] of bullet n relative to your aim; first bullet [0, 0]) · recover (pattern bullets recovered per second
// when you stop firing) · move: { run, air, land } (extra inaccuracy in radians: running at full speed, in the air,
// just landed) · unscoped (extra inaccuracy when a scoped gun is not scoped) · zoom (scope FOVs, right click
// cycles) · suppressed · model (base model + look, weapon-models.js) · desc (buy menu).
// Spray from key points [bullet, pitch°, yaw°], linearly interpolated (pitch up, yaw right).
const spray = (n, keys) => { const out = []; for (let i = 0; i < n; i++) { let k = 0; while (k < keys.length - 2 && keys[k + 1][0] <= i) k++; const [a, p0, y0] = keys[k], [b, p1, y1] = keys[k + 1] || keys[k], t = b === a ? 0 : Math.min(1, (i - a) / (b - a)); out.push([+(p0 + (p1 - p0) * t).toFixed(3), +(y0 + (y1 - y0) * t).toFixed(3)]); } return out; };
// Semi-automatic kick: each quick follow-up shot climbs `k` degrees, with a small alternating drift.
const kick = (n, k, drift = .15) => Array.from({ length: n }, (_, i) => [+(k * i * (1 - .03 * i)).toFixed(3), +(i ? (i % 2 ? drift : -drift) * Math.min(1, i / 3) : 0).toFixed(3)]);
const ACC = { rifle: { run: .055, air: .22, land: .05 }, smg: { run: .026, air: .14, land: .03 }, pistol: { run: .03, air: .12, land: .03 }, shotgun: { run: .02, air: .1, land: .02 }, sniper: { run: .12, air: .35, land: .08 }, lmg: { run: .08, air: .3, land: .06 } };
const RECOVER = { rifle: 12, smg: 15, pistol: 5, shotgun: 5, sniper: 4, lmg: 10 };
// Wallbang budget (arena-maps.js bulletPath): what a bullet can go through. A crate 6 thick costs ~5; a thin
// plaster wall ~3; a thin brick wall ~6. Rifles and the AWP shoot through crates and thin walls, pistols and SMGs through
// thin, soft cover, shotgun pellets hardly at all.
const PEN = { rifle: 7, sniper: 11, lmg: 8, smg: 3.5, pistol: 3.5, shotgun: 1.5 };

const G = (o) => ({ team: null, mode: 'semi', pellets: 0, suppressed: false, zoom: null, unscoped: 0, model: o.id, sound: o.id, ...o, auto: o.mode === 'auto', move: { ...ACC[o.kind], ...(o.move || {}) }, recover: o.recover ?? RECOVER[o.kind], cat: { rifle: 'Rifle', sniper: 'Sniper rifle', smg: 'SMG', shotgun: 'Shotgun', pistol: 'Pistol', lmg: 'Machine gun' }[o.kind] });

// Automatic guns' sprays at CS2 proportions: each gun's own shape (above), opened wider sideways and a little taller.
export const SPRAY_SCALE = { pitch: 1.3, yaw: 1.9 };
export const WEAPONS = [
  // Pistols (slot 2). T start with the Glock-18, CTs with the USP-S.
  G({ id: 'pistol', name: 'Glock-18', kind: 'pistol', team: 't', price: 200, reward: 300, dmg: 30, ap: .47, rangeMod: .85, rateMs: 150, mag: 20, reserve: 120, reloadMs: 2270, speed: 240, range: 450, pattern: kick(20, .55, .12), model: 'pistol', desc: 'Terrorist starting pistol. Big magazine, fast fire, weak against armor.' }),
  G({ id: 'usps', name: 'USP-S', kind: 'pistol', team: 'ct', price: 200, reward: 300, dmg: 35, ap: .505, rangeMod: .99, rateMs: 170, mag: 12, reserve: 24, reloadMs: 2200, speed: 240, range: 500, suppressed: true, pattern: kick(12, .7, .08), model: 'pistol', desc: 'Counter-Terrorist starting pistol. Suppressed and accurate at range; small magazine.' }),
  G({ id: 'p250', name: 'P250', kind: 'pistol', price: 300, reward: 300, dmg: 38, ap: .64, rangeMod: .9, rateMs: 150, mag: 13, reserve: 26, reloadMs: 2200, speed: 240, range: 450, pattern: kick(13, .8, .2), model: 'luger', desc: 'Cheap upgrade that punches through armor better than the starting pistols.' }),
  G({ id: 'fiveseven', name: 'Five-SeveN', kind: 'pistol', team: 'ct', price: 500, reward: 300, dmg: 32, ap: .911, rangeMod: .81, rateMs: 150, mag: 20, reserve: 100, reloadMs: 2200, speed: 240, range: 450, pattern: kick(20, .75, .25), model: 'pistol', desc: 'Armor-piercing pistol with a 20-round magazine. Strong in eco rounds.' }),
  G({ id: 'cz75', name: 'CZ75-Auto', kind: 'pistol', price: 500, reward: 100, dmg: 31, ap: .776, rangeMod: .85, rateMs: 100, mode: 'auto', mag: 12, reserve: 12, reloadMs: 2700, speed: 240, range: 420, pattern: kick(12, 1.05, .35), model: 'pistol', desc: 'Fully automatic pistol: twelve rounds in a second, then a long reload. Deadly up close.' }),
  G({ id: 'tec9', name: 'Tec-9', kind: 'pistol', team: 't', price: 500, reward: 300, dmg: 33, ap: .906, rangeMod: .83, rateMs: 120, mag: 18, reserve: 90, reloadMs: 2500, speed: 240, range: 440, pattern: kick(18, .8, .3), model: 'pistol', desc: 'Terrorist pistol for running and gunning: 18 rounds, strong against armor, accurate on the move.' }),
  G({ id: 'deagle', name: 'Desert Eagle', kind: 'pistol', pen: 6, price: 700, reward: 300, dmg: 53, ap: .932, rangeMod: .81, rateMs: 225, mag: 7, reserve: 35, reloadMs: 2200, speed: 230, range: 500, pattern: kick(7, 2.6, .35), recover: 3, move: { run: .06 }, desc: 'Hand cannon. Heavy kick: take one aimed shot at a time.' }),
  // SMGs (slot 1).
  G({ id: 'mac10', name: 'MAC-10', kind: 'smg', team: 't', price: 1050, reward: 600, dmg: 29, ap: .575, rangeMod: .8, rateMs: 75, mode: 'auto', mag: 30, reserve: 100, reloadMs: 2600, speed: 240, range: 380, pattern: spray(30, [[0, 0, 0], [1, .3, 0], [5, 1.8, -.4], [9, 2.8, -1.4], [13, 3.2, -2.6], [17, 3.4, -3.4], [21, 3.5, -2.6], [25, 3.6, -1.4], [29, 3.7, -.4]]), model: 'greasegun', desc: 'Very fast fire and run speed. Deadly close, sprays wide.' }),
  G({ id: 'mp9', name: 'MP9', kind: 'smg', team: 'ct', price: 1250, reward: 600, dmg: 26, ap: .6, rangeMod: .87, rateMs: 70, mode: 'auto', mag: 30, reserve: 120, reloadMs: 2100, speed: 240, range: 380, pattern: spray(30, [[0, 0, 0], [1, .35, 0], [5, 2.4, .7], [9, 3.7, 1.4], [13, 4.2, .2], [17, 4.4, -1.3], [21, 4.6, -2], [25, 4.7, -.4], [29, 4.8, 1]]), model: 'smg', desc: 'Light, fast-firing CT SMG. Keep moving and fight close.' }),
  G({ id: 'mp7', name: 'MP7', kind: 'smg', price: 1500, reward: 600, dmg: 29, ap: .625, rangeMod: .85, rateMs: 80, mode: 'auto', mag: 30, reserve: 120, reloadMs: 3100, speed: 220, range: 400, pattern: spray(30, [[0, 0, 0], [1, .3, 0], [5, 2, -.3], [9, 3.1, .6], [13, 3.5, 1.5], [17, 3.7, .5], [21, 3.8, -.9], [25, 3.9, -1.4], [29, 4, -.3]]), model: 'smg', desc: 'Balanced SMG with a gentle spray. Good armor penetration for its class.' }),
  G({ id: 'smg', name: 'MP5-SD', kind: 'smg', price: 1500, reward: 600, dmg: 27, ap: .625, rangeMod: .85, rateMs: 80, mode: 'auto', mag: 30, reserve: 120, reloadMs: 3000, speed: 235, range: 400, suppressed: true, pattern: spray(30, [[0, 0, 0], [1, .25, 0], [5, 1.6, .3], [9, 2.6, .9], [13, 3, .2], [17, 3.2, -.9], [21, 3.3, -1.3], [25, 3.4, -.2], [29, 3.5, .8]]), model: 'smg', desc: 'Suppressed SMG: quiet shots, easy spray.' }),
  G({ id: 'bizon', name: 'PP-Bizon', kind: 'smg', price: 1400, reward: 600, dmg: 27, ap: .575, rangeMod: .8, rateMs: 80, mode: 'auto', mag: 64, reserve: 120, reloadMs: 2400, speed: 240, range: 360, pattern: spray(64, [[0, 0, 0], [1, .3, 0], [5, 1.9, .5], [9, 3, 1.1], [13, 3.4, .2], [17, 3.6, -1], [21, 3.7, -1.6], [25, 3.8, -.6], [29, 3.9, .6], [37, 4, -.4], [45, 4.1, .8], [63, 4.2, 0]]), model: 'greasegun', desc: 'A 64-round helical magazine: keeps spraying when others reload. Weak against armor.' }),
  G({ id: 'ump45', name: 'UMP-45', kind: 'smg', price: 1200, reward: 600, dmg: 35, ap: .65, rangeMod: .75, rateMs: 90, mode: 'auto', mag: 25, reserve: 100, reloadMs: 3500, speed: 230, range: 380, pattern: spray(25, [[0, 0, 0], [1, .45, 0], [4, 2.4, .2], [8, 4, .5], [12, 4.6, -.7], [16, 4.9, -1.4], [20, 5.1, -.2], [24, 5.2, 1.1]]), model: 'suomi', desc: 'Hard-hitting SMG; loses damage quickly over distance.' }),
  G({ id: 'p90', name: 'P90', kind: 'smg', price: 2350, reward: 300, dmg: 26, ap: .69, rangeMod: .86, rateMs: 70, mode: 'auto', mag: 50, reserve: 100, reloadMs: 3300, speed: 230, range: 400, pattern: spray(50, [[0, 0, 0], [1, .25, 0], [6, 1.8, -.2], [12, 2.9, .6], [18, 3.3, 1.5], [24, 3.5, .6], [30, 3.6, -.8], [36, 3.7, -1.6], [42, 3.8, -.6], [49, 3.9, .7]]), model: 'suomi', desc: '50-round magazine and an easy spray. Expensive for an SMG.' }),
  // Shotguns (slot 1): a fixed pellet pattern around your aim.
  G({ id: 'shotgun', name: 'Nova', kind: 'shotgun', price: 1050, reward: 900, dmg: 26, ap: .5, rangeMod: .7, rateMs: 880, mode: 'pump', pellets: 9, pelletSpread: .05, mag: 8, reserve: 32, reloadMs: 3000, speed: 220, range: 120, pattern: kick(8, 3), desc: 'Pump-action. One close shot can kill; useless at range.' }),
  G({ id: 'xm1014', name: 'XM1014', kind: 'shotgun', price: 2000, reward: 900, dmg: 20, ap: .8, rangeMod: .7, rateMs: 350, mode: 'auto', pellets: 6, pelletSpread: .055, mag: 7, reserve: 32, reloadMs: 3200, speed: 215, range: 120, pattern: spray(7, [[0, 0, 0], [1, 1.6, .2], [3, 3.6, -.3], [6, 4.8, .4]]), recover: 6, model: 'shotgun', desc: 'Automatic shotgun. Holds close angles against rushes.' }),
  // Rifles (slot 1).
  G({ id: 'galil', name: 'Galil AR', kind: 'rifle', team: 't', price: 1800, reward: 300, dmg: 30, ap: .775, rangeMod: .98, rateMs: 90, mode: 'auto', mag: 35, reserve: 90, reloadMs: 3000, speed: 215, range: 600, pattern: spray(35, [[0, 0, 0], [1, .4, 0], [5, 2.6, -.3], [10, 4.6, -.6], [14, 5, 1.2], [18, 5.2, 2.2], [22, 5.4, .6], [26, 5.5, -1.6], [30, 5.6, -.4], [34, 5.7, 1.4]]), model: 'ak', desc: 'Cheap Terrorist rifle with 35 rounds. Two body shots fewer than an AK at range.' }),
  G({ id: 'famas', name: 'FAMAS', kind: 'rifle', team: 'ct', price: 2050, reward: 300, dmg: 30, ap: .7, rangeMod: .96, rateMs: 90, mode: 'auto', mag: 25, reserve: 90, reloadMs: 3300, speed: 220, range: 600, pattern: spray(25, [[0, 0, 0], [1, .4, 0], [4, 2, .4], [8, 3.8, .8], [11, 4.3, -.5], [14, 4.5, -1.5], [18, 4.7, -.2], [21, 4.8, 1.2], [24, 4.9, .4]]), model: 'm4', desc: 'Cheap CT rifle. Short magazine; burst it at range.' }),
  G({ id: 'ak', name: 'AK-47', kind: 'rifle', pen: 7.5, team: 't', price: 2700, reward: 300, dmg: 36, ap: .775, rangeMod: .98, rateMs: 100, mode: 'auto', mag: 30, reserve: 90, reloadMs: 2500, speed: 215, range: 600, pattern: spray(30, [[0, 0, 0], [1, .6, .1], [3, 2.2, .3], [6, 4.6, .5], [9, 6.2, .7], [11, 6.6, -.6], [14, 6.9, -2.6], [17, 7.1, -1.2], [20, 7.2, 1.4], [23, 7.3, 2.6], [26, 7.4, .8], [29, 7.5, -1.6]]), desc: 'The Terrorist rifle. Hard-hitting; climbs, then pulls left and right.' }),
  G({ id: 'm4', name: 'M4A4', kind: 'rifle', pen: 6.5, team: 'ct', price: 3100, reward: 300, dmg: 33, ap: .7, rangeMod: .97, rateMs: 90, mode: 'auto', mag: 30, reserve: 90, reloadMs: 3100, speed: 225, range: 600, pattern: spray(30, [[0, 0, 0], [1, .45, 0], [4, 2.2, -.15], [8, 4.6, -.2], [11, 5.3, .9], [14, 5.6, 2], [17, 5.8, 1], [20, 5.9, -1], [24, 6, -2.2], [27, 6.1, -1], [29, 6.1, .2]]), desc: 'The CT rifle: 30 rounds, fast fire, controllable climb.' }),
  G({ id: 'm4s', name: 'M4A1-S', kind: 'rifle', pen: 6.5, team: 'ct', price: 2900, reward: 300, dmg: 38, ap: .7, rangeMod: .99, rateMs: 100, mode: 'auto', mag: 20, reserve: 80, reloadMs: 3100, speed: 225, range: 600, suppressed: true, pattern: spray(20, [[0, 0, 0], [1, .35, 0], [4, 1.9, .1], [8, 3.6, .3], [11, 4.1, -.6], [14, 4.3, -1.4], [17, 4.4, -.3], [19, 4.5, .7]]), model: 'm4', desc: 'Suppressed CT rifle: precise and quiet, 20 rounds.' }),
  G({ id: 'sg553', name: 'SG 553', kind: 'rifle', pen: 8, team: 't', price: 3000, reward: 300, dmg: 30, ap: 1, rangeMod: .98, rateMs: 110, mode: 'auto', mag: 30, reserve: 90, reloadMs: 2800, speed: 210, range: 650, zoom: [45], pattern: spray(30, [[0, 0, 0], [1, .5, 0], [5, 3, .5], [9, 5.2, 1.3], [12, 5.8, .3], [15, 6.1, -1.4], [19, 6.4, -2.3], [23, 6.6, -.6], [26, 6.7, 1.3], [29, 6.8, 2]]), model: 'ak', desc: 'Scoped Terrorist rifle (right click). Full armor penetration.' }),
  G({ id: 'aug', name: 'AUG', kind: 'rifle', team: 'ct', price: 3300, reward: 300, dmg: 28, ap: .9, rangeMod: .98, rateMs: 100, mode: 'auto', mag: 30, reserve: 90, reloadMs: 3800, speed: 220, range: 650, zoom: [45], pattern: spray(30, [[0, 0, 0], [1, .45, 0], [5, 2.6, -.6], [9, 4.6, -1.2], [12, 5.1, 0], [15, 5.4, 1.4], [19, 5.6, 2.1], [23, 5.8, .4], [26, 5.9, -1.2], [29, 6, -.6]]), model: 'm4', desc: 'Scoped CT rifle (right click). Precise bursts at long range.' }),
  // Sniper rifles (slot 1): right click scopes in, again for more zoom, again out. Unscoped they spray wide.
  G({ id: 'ssg08', name: 'SSG 08', kind: 'sniper', pen: 9, price: 1700, reward: 300, dmg: 88, ap: .85, rangeMod: .98, rateMs: 1250, mode: 'bolt', mag: 10, reserve: 90, reloadMs: 3700, speed: 230, range: 1000, zoom: [40, 15], unscoped: .045, pattern: kick(10, 3.2, .2), move: { air: .08 }, model: 'sniper', desc: 'Light bolt-action. One-shot head shots, mobile and cheap.' }),
  G({ id: 'sniper', name: 'AWP', kind: 'sniper', price: 4750, reward: 100, dmg: 115, ap: .975, rangeMod: .99, rateMs: 1470, mode: 'bolt', mag: 5, reserve: 30, reloadMs: 3600, speed: 200, scopedSpeed: 100, range: 1000, zoom: [40, 10], unscoped: .07, pattern: kick(5, 4, .2), desc: 'One body shot kills. Slow to move and to fire; useless unscoped.' }),
  // Machine gun.
  G({ id: 'lmg', name: 'M249', kind: 'lmg', price: 5200, reward: 300, dmg: 32, ap: .8, rangeMod: .97, rateMs: 80, mode: 'auto', mag: 100, reserve: 200, reloadMs: 5700, speed: 195, range: 550, pattern: spray(100, [[0, 0, 0], [1, .45, 0], [6, 3, .4], [12, 4.6, -.8], [20, 5.2, 1.2], [30, 5.6, -1.3], [45, 5.9, 1], [60, 6.1, -.9], [80, 6.3, .8], [99, 6.4, 0]]), desc: '100 rounds of suppressing fire. Slow to move and to reload.' }),
  G({ id: 'negev', name: 'Negev', kind: 'lmg', price: 1700, reward: 300, dmg: 35, ap: .71, rangeMod: .97, rateMs: 75, mode: 'auto', mag: 150, reserve: 300, reloadMs: 5700, speed: 150, range: 550, pattern: spray(150, [[0, 0, 0], [1, .7, 0], [3, 2.4, .8], [6, 4.4, -1], [9, 5.4, 1.2], [12, 5.2, -.4], [16, 4.7, 0], [24, 4.5, 0], [149, 4.5, 0]]), model: 'lmg', desc: '150 rounds: wild for the first shots, then a steady beam that holds a corner. Cheap for a machine gun; very slow to move.' }),
].map(w => ({ ...w, usd: w.price, spread: w.pelletSpread || .004, pen: w.pen ?? PEN[w.kind], pattern: w.mode === 'auto' && !w.pellets ? w.pattern.map(([p, y]) => [+(p * SPRAY_SCALE.pitch).toFixed(3), +(y * SPRAY_SCALE.yaw).toFixed(3)]) : w.pattern }));
export const WEAPON_IDS = WEAPONS.map(w => w.id);
// Darja's chrome hand cannon (old Payday saves only; not used in Global Defensive).
export const DARJA_GUN = { ...WEAPONS.find(w => w.id === 'deagle'), id: 'cannon', name: "Darja's Hand Cannon", price: 0, reward: 300 };
// Knives (slot 3): left click a quick slash, right click a slow heavy stab; from behind both are much stronger.
export const KNIVES = [
  { id: 'knife', name: 'Knife', kind: 'knife', price: 0, reward: 1500, dmg: 40, ap: .85, rangeMod: 1, rateMs: 400, mode: 'semi', range: 9, mag: 0, reserve: 0, reloadMs: 0, spread: 0, pattern: [[0, 0]], move: {}, recover: 1, speed: 250 },
  { id: 'karambit', name: '★ Karambit | Ruby', kind: 'knife', price: 0, reward: 1500, dmg: 40, ap: .85, rangeMod: 1, rateMs: 400, mode: 'semi', range: 9, mag: 0, reserve: 0, reloadMs: 0, spread: 0, pattern: [[0, 0]], move: {}, recover: 1, speed: 250 },
];
// Knife attacks (CS2): light = left click, heavy = right click; `back` when hit from behind.
export const KNIFE = { light: { front: 40, back: 90, rateMs: 400, hitMs: 90, range: 9 }, heavy: { front: 65, back: 180, rateMs: 1000, hitMs: 260, range: 7 } };
// Grenades (slot 4) and the bomb (slot 5); their effects are host-run (arena-nades.js, arena-defuse.js).
export const GRENADES = [['he', 'HE Grenade', 300], ['flash', 'Flashbang', 200], ['smoke', 'Smoke Grenade', 300], ['molotov', 'Molotov', 400]].map(([id, name, price]) => ({ id, name, kind: 'nade', price, reward: 300, dmg: 0, ap: 1, rangeMod: 1, rateMs: 900, mode: 'semi', range: 0, mag: 0, reserve: 0, reloadMs: 0, spread: 0, pattern: [[0, 0]], move: {}, recover: 1, speed: 245 }));
export const C4 = { id: 'c4', name: 'C4 bomb', kind: 'bomb', price: 0, reward: 0, dmg: 0, ap: 1, rangeMod: 1, rateMs: 500, mode: 'semi', range: 0, mag: 0, reserve: 0, reloadMs: 0, spread: 0, pattern: [[0, 0]], move: {}, recover: 1, speed: 250 };
// Grenade throwing (one place for the input timing; flight is arena-nades.js): the pin takes primeMs to come out; a
// release before that throws nothing.
export const THROW = { primeMs: 350 };
// Recoil, CS:GO style: the camera follows `view` of the recoil (view_recoil_tracking 0.45); bullets land at the full
// recoil, so a spray climbs above the fixed crosshair and you pull down to hold it. `kick`: a quick visual view punch
// per shot (degrees, by gun class), recovering at `kickBack` per second; it never moves the bullets.
export const RECOIL = { view: .45, kick: { pistol: .9, smg: .45, rifle: .7, lmg: .55, sniper: 2.2, shotgun: 2.0 }, kickBack: 18 };
// Body armor (buy menu · Equipment).
export const ARMOR = { kevlar: { name: 'Kevlar Vest', price: 650 }, helmet: { name: 'Kevlar + Helmet', price: 1000, upgrade: 350 } };
const BY_ID = new Map([...WEAPONS, ...KNIVES, ...GRENADES, C4, DARJA_GUN].map(w => [w.id, w]));
export const weaponById = id => BY_ID.get(id) || null;
export const isFirearm = w => !!w && ['rifle', 'smg', 'pistol', 'shotgun', 'sniper', 'lmg'].includes(w.kind);
export const MAX_HP = 100, RESPAWN_MS = 5000;
// Starting pistol for a team (deathmatch: the Glock).
export const defaultPistol = team => team === 'ct' ? 'usps' : 'pistol';
// Full ammo for a gun: [magazine, reserve].
export const fullAmmo = id => { const w = weaponById(id); return isFirearm(w) ? [w.mag, w.reserve] : null; };

// CS2 damage model: base × hit-group multiplier × rangeMod^(distance / 500 HU). One game unit ≈ 6.5 HU.
export const HIT_GROUPS = { head: 4, chest: 1, stomach: 1.25, legs: .75 };
export const CS_UNITS_PER_UNIT = 6.5;
export function damageFor(wpn, zone, distance, pellets = 1) {
  const mult = HIT_GROUPS[zone] ?? 1, falloff = Math.pow(wpn.rangeMod ?? 1, (Math.max(0, distance) * CS_UNITS_PER_UNIT) / 500);
  return Math.max(1, Math.round(wpn.dmg * mult * falloff * pellets));
}
// THE rule for every hit, used by the host only (clients never decide damage):
//  · A confirmed head shot from any firearm kills, whatever the HP, armor or helmet (headKill).
//  · Otherwise, armor (kevlar on chest / stomach; the helmet on the head, for knives) lets `ap` of the damage
//    through to health and loses half of the rest; when the armor runs out the remainder goes to health (CS2).
//  · Legs are never armored.
// armor: { kevlar: 0…100, helmet: bool } or null. Returns { hp: health damage, armor: armor lost, headKill }.
export const HEAD_KILL_HP = 1000;
export function hitDamage(wpn, zone, distance, pellets = 1, armor = null, base = null) {
  if (isFirearm(wpn) && zone === 'head') return { hp: HEAD_KILL_HP, armor: armor?.kevlar ? Math.min(armor.kevlar, Math.round(wpn.dmg * .5)) : 0, headKill: true };
  const raw = base ?? damageFor(wpn, zone, distance, pellets), kev = armor?.kevlar || 0;
  const covered = kev > 0 && (zone === 'chest' || zone === 'stomach' || (zone === 'head' && armor.helmet));
  if (!covered) return { hp: raw, armor: 0, headKill: false };
  let hp = Math.round(raw * (wpn.ap ?? 1)), lost = Math.round((raw - hp) * .5);
  if (lost > kev) { lost = kev; hp = Math.round(raw - kev * 2); }
  return { hp: Math.max(1, hp), armor: lost, headKill: false };
}
// Hit group from the height of the hit above the feet (body capsule 11 units tall: CS2's 72 u).
export const zoneAt = y => y > HEAD_Y ? 'head' : y > 6.85 ? 'chest' : y > 4.77 ? 'stomach' : 'legs';
// Player capsule (game units): feet at pose.y − eye height; heads above HEAD_Y count as head shots. As CS2's agents stand
// at their true size (a rifle stance: head from ~61 u — the chin — to 72 u; crouched, 78 % of that height).
export const EYE = 9.7, BODY_R = 1.5, BODY_H = 11.0, HEAD_Y = 9.4, CROUCH_H = .78;

// ── Aim (client and tests) ───────────────────────────────────────────────────────────────────────────────────
// Spray offset [pitch°, yaw°] at a (fractional) pattern position: the first bullet is exactly [0, 0].
export function sprayAt(wpn, idx) {
  const p = wpn.pattern || [[0, 0]], i = Math.max(0, Math.min(p.length - 1, idx)), a = Math.floor(i), b = Math.min(p.length - 1, a + 1), t = i - a;
  if (idx > p.length - 1) { const last = p[p.length - 1]; return [last[0], last[1]]; }
  return [p[a][0] + (p[b][0] - p[a][0]) * t, p[a][1] + (p[b][1] - p[a][1]) * t];
}
// Movement inaccuracy (radians, radius of a random cone): 0 when standing still or barely moving (up to 34 % of
// the gun's speed, CS2) on the ground — so a still, aimed shot goes exactly through the crosshair.
// m: { speed (u/s), max (u/s), onGround, landedAgo (s), ducked, scoped }.
export function moveInaccuracy(wpn, m) {
  if (!wpn || !isFirearm(wpn)) return 0; const mv = wpn.move || {}; let a = 0;
  if (!m.onGround) a = mv.air || 0;
  else { const f = m.max > 0 ? m.speed / m.max : 0; a = Math.max(0, (f - .34) / .66) * (mv.run || 0) * (m.ducked ? .7 : 1); if (m.landedAgo < .35) a += (mv.land || 0) * (1 - m.landedAgo / .35); }
  if (wpn.unscoped && !m.scoped) a += wpn.unscoped;
  return a;
}
// Shotgun pellet directions as [pitch, yaw] radians around the aim: a fixed pattern (a centre pellet and rings),
// so every shot lands the same way.
export function pelletPattern(wpn) {
  const n = wpn.pellets || 1, r = wpn.pelletSpread || 0, out = [[0, 0]];
  for (let i = 1; i < n; i++) { const ring = i <= 6 ? .55 : 1, k = i <= 6 ? i : i - 6, cnt = i <= 6 ? Math.min(6, n - 1) : Math.max(1, n - 7), a = (k / cnt) * Math.PI * 2 + (i <= 6 ? 0 : .5); out.push([Math.sin(a) * r * ring, Math.cos(a) * r * ring]); }
  return out;
}
