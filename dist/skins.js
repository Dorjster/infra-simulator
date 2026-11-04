import { WEAPONS, weaponById } from './weapons-data.js';
import { KNIFE_IDS as KNIFE_CHOICES } from './gd-knives.js';   // (v53 KNIVES: every knife a player may pick — gd-knives.js)
// Weapon skins (Global Defensive), as CS2 keeps them: each gun (or knife) of a player's carries a finish (a paint
// kit), a wear float (0 = Factory New … 1 = Battle-Scarred: scratches show the metal under the paint), a pattern
// seed (1 … 1000: where on the pattern the gun is cut from — a Case Hardened gun's blue and gold move with it), up
// to four or five stickers placed anywhere on it (offset, scale, rotation, their own wear), a name tag and, with
// StatTrak™, a count of its kills (kept by the host only). Pure: the room host validates every skin a player sends
// (cleanSkin) and keeps it in game.arena.skins; every client draws it (skin-render.js). The built-in finishes are this
// game's own procedural paints (no Valve artwork is shipped); CS2's own finishes come only from the player's CS2 install,
// imported on this computer into user-assets/skins (tools/import-cs2-skins.mjs): `cs2:<kit>` (guns), `cs2k:<family>`
// (knives), each with `fb`, the built-in finish drawn wherever that import is missing (CI, a host without it, a model
// with no bake). The host's catalogue (that import's skins.json) is injected (setSkinCatalog): no Valve data in here.
// Every gun takes a skin (CS2), kept per player per gun (game.arena.skins[player][gun id]); the one knife skin is worn by
// whichever knife you carry (default, one Darja gave you, her karambit). A gun shows its OWNER's skin (CS2: the buyer,
// whoever picks it up — skinFor). The key a weapon's skin is kept under, or null (grenades, the bomb).
const GUN_IDS = new Set(WEAPONS.map(w => w.id));
export const skinKeyOf = id => id === 'knife' || id === 'karambit' ? 'knife' : GUN_IDS.has(id) ? id : null;
export const SKIN_SLOTS = ['knife', ...GUN_IDS];
// The kind cleanSkin checks a slot by (sticker slots): the knife, or the gun's own kind.
export const skinKindOf = sk => sk === 'knife' ? 'knife' : sk === 'gloves' ? 'gloves' : GUN_IDS.has(sk) ? weaponById(sk).kind : null;   // ('gloves': the one glove slot — cleanGloveNote)
export const FINISHES = {
  none: { name: 'Default', pattern: 'none', colors: [] },
  fade: { name: 'Fade', pattern: 'fade', colors: ['#f6d24a', '#e2459a', '#5b4bd8'], rarity: 'Covert', wear: [0, .08] },
  marble: { name: 'Marble Fade', pattern: 'marble', colors: ['#e33b2f', '#f2d740', '#2a5fe0'], rarity: 'Covert', wear: [0, .08] },
  doppler: { name: 'Doppler Ruby', pattern: 'doppler', colors: ['#7a0710', '#d01226', '#1a0205'], rarity: 'Covert', wear: [0, .08] },
  sapphire: { name: 'Doppler Sapphire', pattern: 'doppler', colors: ['#082a7a', '#1d6af0', '#02061a'], rarity: 'Covert', wear: [0, .08] },
  emerald: { name: 'Gamma Emerald', pattern: 'doppler', colors: ['#06622a', '#18d064', '#021a0a'], rarity: 'Covert', wear: [0, .08] },
  casehardened: { name: 'Case Hardened', pattern: 'casehardened', colors: ['#2a52b8', '#c9a23a', '#6f6a62'], rarity: 'Classified' },
  web: { name: 'Crimson Web', pattern: 'web', colors: ['#7d0d14', '#111111'], rarity: 'Classified' },
  tiger: { name: 'Tiger Tooth', pattern: 'tiger', colors: ['#f0a21c', '#5a2c06'], rarity: 'Classified', wear: [0, .08] },
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
const pk = n => String(n || 'Engineer').trim().toLowerCase().slice(0, 40) || 'engineer';   // (a player's key: arena-logic's)
const builtin = f => typeof f === 'string' && Object.hasOwn(FINISHES, f);
// ── CS2 finishes: the host's catalogue (user-assets/skins/skins.json, imported on this computer) injected, never shipped ──
// The room sets it at start and after a pack install; a page that fetched it sets it too (names in titles; solo play's
// own checks). catalogHash: 12 characters the host's arenaView carries (arena.skinCat): a page's copy is the host's.
let CAT = null, CAT_HASH = '', KIT_NAMES = new Map();
const hash12 = str => { let a = 0x811c9dc5, b = 0x2545f491; for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x5bd1e995); b ^= b >>> 13; } return ((a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')).slice(0, 12); };
export function setSkinCatalog(cat) { CAT = cat && typeof cat === 'object' && (cat.weapons || cat.knives) ? cat : null; CAT_HASH = CAT ? hash12(JSON.stringify(CAT)) : ''; KIT_NAMES = new Map();
  if (CAT) { for (const w of Object.values(CAT.weapons || {})) for (const [k, f] of Object.entries(w?.finishes || {})) KIT_NAMES.set('cs2:' + k, String(f?.name || k)); for (const [k, f] of Object.entries(CAT.knives || {})) KIT_NAMES.set('cs2k:' + k, String(f?.name || k)); }
  return CAT_HASH; }
export const catalogHash = cat => cat === undefined ? CAT_HASH : cat ? hash12(JSON.stringify(cat)) : '';
export const hasCatalog = () => !!CAT;
const KIT_RE = /^[a-z0-9_-]{1,64}$/;   // (kit ids may hold '-': cu_p90-asiimov)
export const isCs2 = s => typeof s?.finish === 'string' ? s.finish.startsWith('cs2k:') ? 'knife' : s.finish.startsWith('cs2:') ? 'gun' : null : null;
export const cs2Kit = s => isCs2(s) ? s.finish.slice(s.finish.indexOf(':') + 1) : null;
// The catalogue's entry for a CS2 finish on this weapon (weapons.<id>.finishes.<kit>) or knife (knives.<family>), or null.
export function catalogEntry(id, finish) { const f = String(finish || ''), sk = skinKeyOf(id); if (!CAT || !sk) return null;
  if (f.startsWith('cs2k:')) { const fam = f.slice(5); return sk === 'knife' && KIT_RE.test(fam) && CAT.knives && Object.hasOwn(CAT.knives, fam) ? CAT.knives[fam] : null; }
  if (f.startsWith('cs2:')) { const kit = f.slice(4), fin = sk !== 'knife' && KIT_RE.test(kit) && CAT.weapons && Object.hasOwn(CAT.weapons, sk) ? CAT.weapons[sk]?.finishes : null; return fin && Object.hasOwn(fin, kit) ? fin[kit] : null; }
  return null; }
// (v53 KNIVES final) A CS2 knife finish CS2 does not make for this star knife (the catalogue's family has models, not
// this one: the Skeleton, Talon, Nomad and Stiletto have 20 of the 31 families — no Lore, Autotronic, Gamma Doppler,
// Marked Up, Night, …, as their econ icons in the install). The default knife and a host without the import: never.
export function knifeLacks(knife, finish) { const f = String(finish || ''); if (!CAT?.knives || !f.startsWith('cs2k:') || !knife || knife === 'default') return false;
  const e = Object.hasOwn(CAT.knives, f.slice(5)) ? CAT.knives[f.slice(5)] : null; return !!(e?.models && typeof e.models === 'object' && !Object.hasOwn(e.models, knife)); }
// Old knife skin ids (v51's built-in knife finishes) → the CS2 knife finish of that name (or the nearest), used when the
// host has it imported; the old id stays the fallback look. Asiimov, Hex, Redline and Gold are no CS2 knife finishes:
// they stay built-in. (Kit ids are identifiers only.)
export const KNIFE_ALIAS = { fade: 'aa_fade', marble: 'am_marble_fade', doppler: 'am_ruby_marbleized', sapphire: 'am_sapphire_marbleized', emerald: 'am_emerald_marbleized', casehardened: 'aq_oiled', web: 'hy_webs', tiger: 'an_tiger_orange', camo: 'sp_mesh_tan', forest: 'hy_forest_boreal' };
// Check a skin a player sends (never trusted: every number finite and in range, the finish and stickers known, each
// sticker in its own slot, no more than the gun takes) → the stored form. Kills are the host's: `prev` keeps them
// (a StatTrak™ count can't be set, only earned; turning StatTrak off clears it). `id`: the weapon (or 'knife') it is for —
// a CS2 finish must be in the host's catalogue for that gun or knife; one that isn't (a host without the import) is
// kept as its built-in look (fb) with a note, never silently dropped. Wear is clamped into the finish's range (a Fade
// goes to 0.08 at most, as CS2's).
export function cleanSkinNote(raw, kind, prev = null, id = kind === 'knife' ? 'knife' : null) {
  if (kind === 'gloves') return cleanGloveNote(raw);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('No skin given');
  const knife = kind === 'knife'; let finish = String(raw.finish ?? 'none'), fb = null, range = null, note = '';
  if (knife && CAT && !raw.builtin && Object.hasOwn(KNIFE_ALIAS, finish) && CAT.knives && Object.hasOwn(CAT.knives, KNIFE_ALIAS[finish])) { fb = finish; finish = 'cs2k:' + KNIFE_ALIAS[finish]; }   // (raw.builtin: the built-in one asked for by name)
  if (/^cs2k?:/.test(finish)) { if (finish.startsWith('cs2k:') !== knife) throw Error(knife ? 'That is a gun finish, not a knife finish' : 'That is a knife finish'); if (!KIT_RE.test(finish.slice(finish.indexOf(':') + 1))) throw Error('Unknown finish');
    const e = catalogEntry(knife ? 'knife' : id, finish);
    if (e) { fb = builtin(fb) ? fb : builtin(e.fbId) ? e.fbId : builtin(raw.fb) ? raw.fb : 'none'; range = e.wear; }
    else { finish = builtin(raw.fb) ? raw.fb : 'none'; fb = finish; range = FINISHES[finish].wear; note = 'that CS2 finish is not imported on the host · its built-in look'; } }
  else { if (!builtin(finish)) throw Error('Unknown finish'); fb = finish; range = FINISHES[finish].wear; }
  let wear = num(raw.wear ?? 0, 0, 1, 'Wear'); const seed = num(raw.seed ?? 1, 1, 1000, 'Pattern seed'); if (!Number.isInteger(seed)) throw Error('Pattern seed must be a whole number');
  if (Array.isArray(range) && Number.isFinite(+range[0]) && Number.isFinite(+range[1])) wear = Math.max(Math.max(0, +range[0]), Math.min(Math.min(1, +range[1]), wear));
  const list = raw.stickers ?? []; if (!Array.isArray(list)) throw Error('Stickers must be a list'); const max = stickerSlots(kind); if (list.length > max) throw Error(`This weapon takes ${max} sticker${max === 1 ? '' : 's'} at most`);
  const used = new Set(), stickers = list.map((s, i) => { if (!s || typeof s !== 'object') throw Error(`Sticker ${i + 1}: not a sticker`); const id = String(s.id); if (!Object.hasOwn(STICKERS, id)) throw Error(`Sticker ${i + 1}: unknown sticker`);
    const slot = num(s.slot ?? i, 0, max - 1, `Sticker ${i + 1} slot`); if (!Number.isInteger(slot)) throw Error(`Sticker ${i + 1} slot must be a whole number`); if (used.has(slot)) throw Error(`Sticker slot ${slot + 1} is used twice`); used.add(slot);
    return { id, slot, x: +num(s.x ?? .5, 0, 1, 'Sticker position').toFixed(4), y: +num(s.y ?? .5, 0, 1, 'Sticker position').toFixed(4), scale: +num(s.scale ?? 1, .4, 2.5, 'Sticker size').toFixed(3), rot: +num(s.rot ?? 0, -180, 180, 'Sticker rotation').toFixed(1), wear: +num(s.wear ?? 0, 0, 1, 'Sticker wear').toFixed(3) }; });
  const name = String(raw.name ?? '').replace(/[\u0000-\u001f<>"'`\\]/g, '').trim().slice(0, 20);
  const st = !!raw.st && kind !== 'nade', kills = st && prev?.st ? Math.max(0, prev.kills | 0) : 0;
  return { skin: { finish, fb, wear: +wear.toFixed(6), seed, stickers, name, st, kills }, note };
}
export const cleanSkin = (raw, kind, prev = null, id) => cleanSkinNote(raw, kind, prev, id).skin;
// ── Gloves (CS2's glove finishes, imported on the host: tools/import-cs2-gloves.mjs → user-assets/gloves/gloves.json) ──
// One more slot in a player's skins record, beside the knife and the guns: 'gloves' = { finish: 'cs2g:<kit>', wear }
// (the glove type is the kit's: gloves.json finishes[kit].type). About 30 bytes a player, in the room's 'skins' message
// with the rest (never the arena frame). Everyone picks any pair (as knives). The host checks the kit against its own
// gloves.json (setGloveCatalog: the room at start and after a pack; a page that fetched it, for names); a kit it has not
// imported is refused (no gloves: the agent's own). Wear is clamped into the finish's range (CS2's wearRange).
let GCAT = null, GCAT_HASH = '';
export const GLOVE_TYPE_ORDER = ['sporty', 'slick', 'handwrap', 'motorcycle', 'specialist', 'bloodhound', 'hydra', 'brokenfang'];   // (Sport Gloves first: CS2's order)
export function setGloveCatalog(m) { GCAT = m && typeof m === 'object' && m.version === 1 && m.finishes && m.types && typeof m.finishes === 'object' ? m : null; GCAT_HASH = GCAT ? hash12(JSON.stringify({ t: Object.keys(GCAT.types), f: Object.keys(GCAT.finishes), made: GCAT.made || '' })) : ''; return GCAT_HASH; }
export const hasGloveCatalog = () => !!GCAT;
export const gloveCatalogHash = () => GCAT_HASH;
export const gloveKit = g => typeof g?.finish === 'string' && g.finish.startsWith('cs2g:') ? g.finish.slice(5) : null;
// The catalogue's entry for a glove record or kit (finishes[kit], with its type), or null.
export function gloveEntry(g) { const kit = typeof g === 'string' ? (g.startsWith('cs2g:') ? g.slice(5) : g) : gloveKit(g); if (!GCAT || !kit || !KIT_RE.test(kit) || !Object.hasOwn(GCAT.finishes, kit)) return null; const f = GCAT.finishes[kit]; return f && Object.hasOwn(GCAT.types, f.type) ? f : null; }
export const gloveTypeName = type => GCAT?.types?.[type]?.name || 'Gloves';
export function cleanGloveNote(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('No gloves given');
  const finish = String(raw.finish ?? ''); if (!finish.startsWith('cs2g:') || !KIT_RE.test(finish.slice(5))) throw Error('Unknown gloves');
  if (!GCAT) throw Error('Gloves are not imported on the host'); const e = gloveEntry(finish); if (!e) throw Error('Those gloves are not imported on the host');
  let wear = num(raw.wear ?? e.wearRange?.[0] ?? .06, 0, 1, 'Wear'); const r = e.wearRange; if (Array.isArray(r) && Number.isFinite(+r[0]) && Number.isFinite(+r[1])) wear = Math.max(Math.max(0, +r[0]), Math.min(Math.min(1, +r[1]), wear));
  return { skin: { finish, wear: +wear.toFixed(6) }, note: '' };
}
export const gloveTitle = g => { const e = gloveEntry(g); return e ? `★ ${gloveTypeName(e.type)} | ${e.name} (${wearName(g.wear ?? 0)})` : 'Default gloves'; };
// A finish's name: the catalogue's for a CS2 finish (else its built-in look's), the built-in's own.
export const finishName = s => (gloveEntry(s)?.name) || KIT_NAMES.get(s?.finish) || FINISHES[s?.finish]?.name || FINISHES[s?.fb]?.name || 'Finish';
// A skin's full name as CS2 shows it: "StatTrak™ AK-47 | Fade (Factory New)" (or its name tag in quotes).
export const skinTitle = (gunName, s) => !s || s.finish === 'none' && !s.name && !s.st ? gunName : (s.name ? `“${s.name}”` : `${s.st ? 'StatTrak™ ' : ''}${gunName}${s.finish !== 'none' ? ' | ' + finishName(s) : ''}${s.finish !== 'none' ? ' (' + wearName(s.wear) + ')' : ''}`);
// What a renderer re-paints for (no kills: a StatTrak count changes mid-round, the look does not). Called on srev change only.
export const lookKey = s => !s ? '' : s.finish + '|' + (s.fb || s.finish) + '|' + s.wear + '|' + s.seed + '|' + (s.name || '') + '|' + (s.st ? 1 : 0) + '|' + (s.stickers || []).map(t => t.id + ',' + t.slot + ',' + t.x + ',' + t.y + ',' + t.scale + ',' + t.rot + ',' + t.wear).join(';');

// ── Whose skin a gun shows (CS2: the owner's — the player who bought it, whoever holds it now; a bot's gun none) ──
// Loadout l.own[slot] = { w: gun id, k: owner key | null } only while that slot holds someone else's gun (checked by w:
// a slot refilled by any other path is the holder's again). Ground items carry `own`; a bot's roster pose too (hint).
// SNAPSHOT_SKINS = false: the owner is a key, not a copy of the skin — an owner's change (at the next freeze) shows on
// the gun a team mate still carries (a per-gun copy would cost bytes in every combat frame).
export const SNAPSHOT_SKINS = false;
export const gunSlot = id => GUN_IDS.has(id) ? (weaponById(id).kind === 'pistol' ? 'secondary' : 'primary') : null;
export function skinOwner(arena, holder, id, hint) { const sk = skinKeyOf(id); if (!sk) return null; const h = pk(holder); if (sk === 'knife') return h; if (hint !== undefined) return hint || null;
  const o = arena?.loadout?.[h]?.own?.[gunSlot(id)]; return o && o.w === id ? o.k || null : h; }
export function skinFor(arena, holder, id, hint) { const o = skinOwner(arena, holder, id, hint); return o ? arena?.skins?.[o]?.[skinKeyOf(id)] || null : null; }
export const groundSkin = (arena, it) => { const sk = skinKeyOf(it?.item); return sk && sk !== 'knife' && it.own ? arena?.skins?.[it.own]?.[sk] || null : null; };
export const ownerIn = (l, id, holder) => { const o = l?.own?.[gunSlot(id)]; return o && o.w === id ? o.k ?? null : pk(holder); };
export function setOwner(l, id, owner, holder) { const s = gunSlot(id); if (!s || !l) return; if (owner === pk(holder)) { if (l.own) { delete l.own[s]; if (!l.own.primary && !l.own.secondary) delete l.own; } } else (l.own ??= {})[s] = { w: id, k: owner ?? null }; }

// ── The host's side: changes, the change log the room sends (its own 'skins' message, by srev), the save ──
// arena.srev rises with every change (a page re-applies skins only then); arena.skinsDirty: which (player, slot) changed
// since the room last sent them. A change made in a live round waits in arena.skinsNext for the next freeze (no skin
// texture is loaded mid-round).
export function touchSkin(arena, k, sk) { arena.srev = (arena.srev || 0) + 1; ((arena.skinsDirty ??= {})[k] ??= {})[sk] = 1; }
export function putSkin(arena, k, sk, skin) { const mine = (arena.skins ??= {})[k] ??= {}; if (skin) mine[sk] = skin; else delete mine[sk]; if (arena.skinsNext?.[k]) delete arena.skinsNext[k][sk]; touchSkin(arena, k, sk); }
export function stageSkin(arena, k, sk, skin) { ((arena.skinsNext ??= {})[k] ??= {})[sk] = skin || null; }
export function flushSkins(arena) { const nx = arena?.skinsNext; if (!nx) return false; delete arena.skinsNext; let n = 0;
  for (const k of Object.keys(nx)) for (const sk of Object.keys(nx[k])) { const s = nx[k][sk], cur = arena.skins?.[k]?.[sk]; if (s?.st) s.kills = cur?.st ? cur.kills | 0 : 0; putSkin(arena, k, sk, s); n++; }   // (kills earned meanwhile stay the gun's)
  return n > 0; }
export function takeSkinDelta(arena) { const d = arena?.skinsDirty; if (!d) return null; delete arena.skinsDirty; const set = {};
  for (const k of Object.keys(d)) { const mine = arena.skins?.[k], row = set[k] = {}; for (const sk of Object.keys(d[k])) row[sk] = mine?.[sk] ?? null; } return { srev: arena.srev || 0, set }; }
export const fullSkins = arena => ({ srev: arena?.srev || 0, full: true, set: arena?.skins || {} });
// The room's save (lan/gd-skins.json): everyone's skins and knives by player key; read back through cleanSkin (anything
// invalid, or a CS2 finish this host has not imported, handled as a player's request is).
export const KNIFE_IDS = KNIFE_CHOICES;   // (v53 KNIVES: default, butterfly, stiletto, m9, karambit + bayonet, skeleton, talon, flip, nomad)
export const skinSave = arena => ({ v: 1, skins: arena?.skins || {}, knives: arena?.knives || {} });
export function cleanSkinSave(data) { const skins = {}, knives = {}; let dropped = 0; if (!data || typeof data !== 'object' || data.v !== 1) return { skins, knives, dropped };
  const safe = k => typeof k === 'string' && k && k !== '__proto__' && k !== 'constructor' && k !== 'prototype';
  for (const [k, row] of Object.entries(data.skins || {})) { const kk = pk(k); if (!safe(kk) || !row || typeof row !== 'object') { dropped++; continue; }
    for (const [sk, raw] of Object.entries(row)) { const kind = skinKindOf(sk); if (!kind) { dropped++; continue; } try { (skins[kk] ??= {})[sk] = cleanSkin(raw, kind, raw, sk); } catch { dropped++; } } }
  for (const [k, v] of Object.entries(data.knives || {})) { const kk = pk(k); if (safe(kk) && KNIFE_IDS.includes(v)) knives[kk] = v; else dropped++; }
  return { skins, knives, dropped }; }
