// Weapon skins (Global Defensive), as CS2 keeps them: each gun (or knife) of a player's carries a finish (a paint
// kit), a wear float (0 = Factory New … 1 = Battle-Scarred: scratches show the metal under the paint), a pattern
// seed (1 … 1000: where on the pattern the gun is cut from — a Case Hardened gun's blue and gold move with it), up
// to four or five stickers placed anywhere on it (offset, scale, rotation, their own wear), a name tag and, with
// StatTrak™, a count of its kills (kept by the host only). Pure: the room host validates every skin a player sends
// (cleanSkin) and keeps it in game.arena.skins; every client draws it (skin-render.js). The finishes are this
// game's own procedural paints (no Valve artwork is shipped).
// Skins go on knives only: whichever knife you carry (the default, one Darja gave you, her karambit) wears your one
// knife skin (game.arena.skins[player].knife); guns keep their own look. The key a weapon's skin is kept under, or null.
export const skinKeyOf = id => id === 'knife' || id === 'karambit' ? 'knife' : null;
export const FINISHES = {
  none: { name: 'Default', pattern: 'none', colors: [] },
  fade: { name: 'Fade', pattern: 'fade', colors: ['#f6d24a', '#e2459a', '#5b4bd8'], rarity: 'Covert' },
  marble: { name: 'Marble Fade', pattern: 'marble', colors: ['#e33b2f', '#f2d740', '#2a5fe0'], rarity: 'Covert' },
  doppler: { name: 'Doppler Ruby', pattern: 'doppler', colors: ['#7a0710', '#d01226', '#1a0205'], rarity: 'Covert' },
  sapphire: { name: 'Doppler Sapphire', pattern: 'doppler', colors: ['#082a7a', '#1d6af0', '#02061a'], rarity: 'Covert' },
  emerald: { name: 'Gamma Emerald', pattern: 'doppler', colors: ['#06622a', '#18d064', '#021a0a'], rarity: 'Covert' },
  casehardened: { name: 'Case Hardened', pattern: 'casehardened', colors: ['#2a52b8', '#c9a23a', '#6f6a62'], rarity: 'Classified' },
  web: { name: 'Crimson Web', pattern: 'web', colors: ['#7d0d14', '#111111'], rarity: 'Classified' },
  tiger: { name: 'Tiger Tooth', pattern: 'tiger', colors: ['#f0a21c', '#5a2c06'], rarity: 'Classified' },
  asiimov: { name: 'Asiimov', pattern: 'asiimov', colors: ['#f2f2f0', '#f26a1b', '#151515'], rarity: 'Covert' },
  hex: { name: 'Hex Neon', pattern: 'hex', colors: ['#121218', '#38f0e0', '#e038c8'], rarity: 'Restricted' },
  camo: { name: 'Desert Camo', pattern: 'camo', colors: ['#c9b48a', '#8a7650', '#5b4a32'], rarity: 'Mil-Spec' },
  forest: { name: 'Forest Camo', pattern: 'camo', colors: ['#5d6b3a', '#2f3a22', '#8a8a5a'], rarity: 'Mil-Spec' },
  redline: { name: 'Redline', pattern: 'redline', colors: ['#141414', '#c8141c', '#e8e8e8'], rarity: 'Classified' },
  gold: { name: 'Gold Arabesque', pattern: 'hex', colors: ['#3a2a08', '#e8c050', '#8a6a20'], rarity: 'Covert' },
};
export const PATTERNS = ['none', 'fade', 'marble', 'doppler', 'casehardened', 'web', 'tiger', 'asiimov', 'hex', 'camo', 'redline'];
// Stickers: this game's own art (drawn at run time: a glyph on a badge) — Valve's sticker capsules aren't shipped.
export const STICKERS = {
  infra: { name: 'Infra Simulator', glyph: 'IS', fg: '#ffffff', bg: '#1f6feb' }, darja: { name: 'Darja', glyph: '♛', fg: '#ffd84a', bg: '#7a0710' },
  crown: { name: 'Crown (Foil)', glyph: '♚', fg: '#ffe680', bg: '#3a2a08', foil: true }, skull: { name: 'Skull', glyph: '☠', fg: '#f2f2f2', bg: '#151515' },
  star: { name: 'Gold Star', glyph: '★', fg: '#ffd84a', bg: '#22224a', foil: true }, flame: { name: 'Flame', glyph: '🔥', fg: '#ffffff', bg: '#4a1004' },
  heart: { name: 'Heart', glyph: '♥', fg: '#ff4060', bg: '#ffffff' }, bolt: { name: 'Lightning', glyph: 'ϟ', fg: '#ffe23a', bg: '#1a1a1a' },
  dragon: { name: 'Dragon', glyph: '🐉', fg: '#ffffff', bg: '#0b3a1a' }, eye: { name: 'Eye', glyph: '◉', fg: '#38f0e0', bg: '#121218' },
  gg: { name: 'GG', glyph: 'GG', fg: '#121212', bg: '#38f080' }, ace: { name: 'Ace', glyph: 'A♠', fg: '#111111', bg: '#f4f4f4' },
};
export const STICKER_IDS = Object.keys(STICKERS);
// Sticker slots: rifles, SMGs, heavies and snipers take five; pistols four; knives none (as in CS2).
export const stickerSlots = kind => kind === 'knife' ? 0 : kind === 'pistol' ? 4 : ['rifle', 'smg', 'sniper', 'shotgun', 'lmg'].includes(kind) ? 5 : 0;
// Wear names (CS2's ranges).
export const wearName = w => w < .07 ? 'Factory New' : w < .15 ? 'Minimal Wear' : w < .38 ? 'Field-Tested' : w < .45 ? 'Well-Worn' : 'Battle-Scarred';
// A pattern seed → where on the pattern this gun is cut from: an offset and a turn (CS2 moves its pattern textures the
// same way per seed — two guns with one seed look the same).
export const patternOf = seed => { const s = Math.max(1, Math.min(1000, seed | 0)); return { u: (s * .12345) % 1, v: (s * .6789) % 1, rot: ((s * 37) % 360) * Math.PI / 180, scale: .9 + ((s * 7) % 23) / 60 }; };
const num = (v, lo, hi, what) => { const n = Number(v); if (typeof v === 'boolean' || v === null || v === '' || !Number.isFinite(n)) throw Error(what + ' must be a number'); if (n < lo || n > hi) throw Error(`${what} must be between ${lo} and ${hi}`); return n; };
// Check a skin a player sends (never trusted: every number finite and in range, the finish and stickers known, each
// sticker in its own slot, no more than the gun takes) → the stored form. Kills are the host's: `prev` keeps them
// (a StatTrak™ count can't be set, only earned; turning StatTrak off clears it).
export function cleanSkin(raw, kind, prev = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('No skin given');
  const finish = String(raw.finish ?? 'none'); if (!Object.hasOwn(FINISHES, finish)) throw Error('Unknown finish');
  const wear = num(raw.wear ?? 0, 0, 1, 'Wear'), seed = num(raw.seed ?? 1, 1, 1000, 'Pattern seed'); if (!Number.isInteger(seed)) throw Error('Pattern seed must be a whole number');
  const list = raw.stickers ?? []; if (!Array.isArray(list)) throw Error('Stickers must be a list'); const max = stickerSlots(kind); if (list.length > max) throw Error(`This weapon takes ${max} sticker${max === 1 ? '' : 's'} at most`);
  const used = new Set(), stickers = list.map((s, i) => { if (!s || typeof s !== 'object') throw Error(`Sticker ${i + 1}: not a sticker`); const id = String(s.id); if (!Object.hasOwn(STICKERS, id)) throw Error(`Sticker ${i + 1}: unknown sticker`);
    const slot = num(s.slot ?? i, 0, max - 1, `Sticker ${i + 1} slot`); if (!Number.isInteger(slot)) throw Error(`Sticker ${i + 1} slot must be a whole number`); if (used.has(slot)) throw Error(`Sticker slot ${slot + 1} is used twice`); used.add(slot);
    return { id, slot, x: +num(s.x ?? .5, 0, 1, 'Sticker position').toFixed(4), y: +num(s.y ?? .5, 0, 1, 'Sticker position').toFixed(4), scale: +num(s.scale ?? 1, .4, 2.5, 'Sticker size').toFixed(3), rot: +num(s.rot ?? 0, -180, 180, 'Sticker rotation').toFixed(1), wear: +num(s.wear ?? 0, 0, 1, 'Sticker wear').toFixed(3) }; });
  const name = String(raw.name ?? '').replace(/[\u0000-\u001f<>"'`\\]/g, '').trim().slice(0, 20);
  const st = !!raw.st && kind !== 'nade', kills = st && prev?.st ? Math.max(0, prev.kills | 0) : 0;
  return { finish, wear: +wear.toFixed(6), seed, stickers, name, st, kills };
}
// A skin's full name as CS2 shows it: "StatTrak™ AK-47 | Fade (Factory New)" (or its name tag in quotes).
export const skinTitle = (gunName, s) => !s || s.finish === 'none' && !s.name && !s.st ? gunName : (s.name ? `“${s.name}”` : `${s.st ? 'StatTrak™ ' : ''}${gunName}${s.finish !== 'none' ? ' | ' + FINISHES[s.finish].name : ''}${s.finish !== 'none' ? ' (' + wearName(s.wear) + ')' : ''}`);
