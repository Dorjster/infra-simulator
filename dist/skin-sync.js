// Skins between the room and the GPU (Global Defensive): the host's CS2 finish catalogue on this page, and the
// finishes everyone will show loaded ahead while the round is quiet. Off the frame: a 1 s timer, nothing per frame.
// - Catalogue: the room serves the host's user-assets/skins/skins.json to every player (a Windows guest without CS2
//   draws the Mac host's finishes); this page's copy feeds skins.js (CS2 names in titles, solo play's own checks) and
//   is fetched again when the host's arenaView says its catalogue changed (arena.skinCat ≠ ours).
// - Prefetch (PLAN §5.6): at a quiet moment (freeze, buy time, warmup, deathmatch: skin-textures' gate) whenever the
//   skins (srev), the loadouts (who holds what) or the ground change, the pictures of every CS2 finish in sight are
//   queued: other players' guns and knives and the dropped guns at 'tp' (512), your own at 'fp' (1024). Materials ask
//   for their own when shown too (skin-render.js); this only gets them in before a round goes live.
import { setSkinCatalog, catalogHash, skinFor, groundSkin, isCs2 } from './skins.js';
import { loadSkinManifest, onSkinManifest, prefetchSkins, finishFiles } from './skin-textures.js';
import { loadGloveManifest, prefetchGloves } from './glove-assets.js';
import { gloveCatalogHash, gloveKit } from './skins.js';
// CS2 gloves the same way (glove-assets.js): the host's gloves.json fetched once (again when arena.gloveCat changes), and
// at quiet moments every player's gloves queued — others' at 'tp' (their agents), yours and your team mates' at 'fp'
// (your arms; spectating shows a team mate's own gloves in first person; a spectator watches anyone: all at 'fp').

export function createSkinSync({ game, me, quiet = () => true }) {
  let catAsked = null, lastKey = '', gcatAsked = null, glKey = '';
  onSkinManifest(m => setSkinCatalog(m));
  function tick() {
    const G = game(), A = G?.arena; if (!A) return;
    if (A.skinCat !== undefined && A.skinCat !== catalogHash() && A.skinCat !== catAsked) { catAsked = A.skinCat; loadSkinManifest(true); }   // (once per new host catalogue: a host without one sends none)
    else if (catAsked === null) { catAsked = ''; loadSkinManifest(); }   // (first look: solo play reads this computer's own)
    if (A.gloveCat !== undefined && A.gloveCat !== gloveCatalogHash() && A.gloveCat !== gcatAsked) { gcatAsked = A.gloveCat; loadGloveManifest(true); }
    else if (gcatAsked === null) { gcatAsked = ''; loadGloveManifest(); }
    if (!quiet()) return;
    { const teams = G.combat?.d?.teams || null, gk = (A.srev || 0) + '|' + gloveCatalogHash() + '|' + (teams ? JSON.stringify(teams) : ''); if (gk !== glKey) { glKey = gk; prefetchGloves(wantedGloves(A, teams, me())); } }
    const ground = G.combat?.ground || [], k = (A.srev || 0) + '|' + (A.lrev ?? '') + '|' + JSON.stringify(A.loadout ? Object.keys(A.loadout).map(n => [n, A.loadout[n]?.primary, A.loadout[n]?.secondary]) : 0) + '|' + JSON.stringify(A.knives || 0) + '|' + ground.map(it => it.id).join();
    if (k === lastKey) return; lastKey = k; prefetchSkins(wanted(A, ground, me()));
  }
  const t = setInterval(tick, 1000);
  return { tick, stop: () => clearInterval(t) };
}

// What to load: [{ model, finish, tier }] for every CS2 finish shown (pure: tests).
export function wanted(A, ground, mine) {
  const out = [], seen = new Set(), add = (model, s, tier) => { if (!model || !isCs2(s) || !finishFiles(model, s.finish)) return; const k = model + '|' + s.finish + '|' + tier; if (seen.has(k)) return; seen.add(k); out.push({ model, finish: s.finish, tier }); };
  for (const who of Object.keys(A?.loadout || {})) { const l = A.loadout[who]; for (const slot of ['primary', 'secondary']) { const id = l?.[slot]; if (!id) continue; const s = skinFor(A, who, id); add(id, s, who === mine ? 'fp' : 'tp'); } }
  for (const who of Object.keys(A?.skins || {})) { const km = A.knives?.[who]; if (!km || km === 'default') continue; add(km, A.skins[who]?.knife, who === mine ? 'fp' : 'tp'); }   // (default knives have no CS2 bakes: they draw the built-in stand-in)
  for (const it of ground || []) add(it.item, groundSkin(A, it), 'tp');
  return out;
}

// Gloves to load: [{ rec, tier }] — every player's at 'tp', yours and your side's at 'fp' (pure: tests).
export function wantedGloves(A, teams, mine) {
  const out = [], my = teams?.[mine] || null, all = my === 'spec';   // (no sides — deathmatch, no spectating: only yours at 'fp')
  for (const who of Object.keys(A?.skins || {})) { const rec = A.skins[who]?.gloves; if (!gloveKit(rec)) continue; if (who !== mine) out.push({ rec, tier: 'tp' }); if (who === mine || all || my && teams?.[who] === my) out.push({ rec, tier: 'fp' }); }
  return out;
}
