# Global Defensive: importing CS2 weapon finishes

`tools/import-cs2-skins.mjs` bakes Counter-Strike 2 weapon finishes (skins) from **this computer's own CS2 install**
into the game's git-ignored `user-assets/skins/`. The room serves that folder to every player, so a Windows peer
without CS2 sees the host's finishes. The finishes are Valve's: they stay on this computer and are never committed or
shipped. The tool and `tools/cs2-skins/` hold only identifiers and logic; every texture, colour, parameter and name is
read from the install at run time. `tests/no-valve-data.mjs` guards the obvious leaks.

Without an import (CI, the released game, a host without CS2) the game uses its own built-in finishes. Each CS2 finish
names one of them as its fallback (`fbId`).

## Needs
- The CS2 extract at `~/CS2-extract`: `game/game/csgo/pak01_dir.vpk` (+ archives), `tools/s2v/Source2Viewer-CLI`,
  `export/weapons/*.glb` (CS2's own weapon models; used for the legacy lookups).
- Blender (`/Applications/Blender.app`): its Python brings numpy and OpenImageIO for the bakes; Blender itself bakes
  the legacy lookups.

## Run
```
node tools/import-cs2-skins.mjs --dry-run      # what would be baked, and an estimated size
node tools/import-cs2-skins.mjs                # bake into the staging folder (~/Library/Caches/infra-cs2-skins/stage)
node tools/import-cs2-skins.mjs --install      # bake (finished bakes are kept) and install as user-assets/skins
```
Options: `--set curated|all`, `--only ak,karambit`, `--kits cu_ak47_cobra,aa_fade`, `--styles +3,+6`, `--top 12`,
`--res 1024`, `--fp2k`, `--jobs 2`, `--force`, `--cs2 <dir>`, `--assets <dir>`, `--out <dir>`, `--work <dir>`,
`--blender <exe>`, `--python <exe>`. Bakes run under `nice -n 10`, at most `--jobs` processes at once. A re-run
skips finishes that are already baked by the same bake code (each record carries a hash of `bake.py` and the modules it
uses, and the lookup version), so a code change re-bakes; `--force` bakes everything again. `--dry-run` bakes nothing
and writes nothing to `--out` or `user-assets` (it may read the install into the `--work` cache).

**The staging folder (`--out`)**: a full run deletes every file there that `skins.json` does not list, so the tool
only uses a folder it owns: a new or empty one, one it marked earlier (`.cs2-skins-stage`), one holding nothing but
what a bake makes, or `user-assets/skins.new`. It refuses `user-assets` itself, any folder holding it, and any other
folder inside it, compared by real path (a symlink or another spelling of the same folder is caught), before anything
is written.

**curated** (default): every knife finish available for the four star knives (karambit, butterfly, M9, stiletto), plus
12 finishes per gun: the check list (AK-47 Redline, AWP Asiimov, M4A1-S Printstream, USP-S Kill Confirmed, Glock
Candy Apple, Desert Eagle Urban DDPAT), then the rarest, with one entry per finish name (no four Gamma Doppler
phases). **all**: every importable finish. Spray (style 3), airbrush (style 6) and style 10 finishes are left out by
default, because their projection is calibrated by eye only for the knife Fade (`--styles +3,+6` adds them).

## Install and the back-up rule
`--install` never overwrites anything:
1. It checks the baked folder: every file listed in `skins.json` exists inside it, decodes, and has the expected size.
2. It copies the bake to `user-assets/skins.new/` (refusing if one is left over from an earlier run).
3. An existing `user-assets/skins/` is renamed to `user-assets/skins.bak-YYYYMMDD-HHMM/` (`-2`, `-3`… within one
   minute). At most the 2 newest backups are kept (ordered by time, then by that number).
4. `skins.new` is renamed to `skins`.

When the installed `skins/` already holds exactly this bake (same manifest apart from its date, same files), nothing
changes and no backup is used up, so re-running `--install` cannot rotate away an earlier skins/.

Nothing else under `user-assets` (`manifest.json`, `fp/`, `weapons/`, `maps/`, `sounds/`, `icons/`) is touched, and
`user-maps/` is never written. The live game does not read `skins/` until the room restarts.

`tools/import-cs2-models.mjs` leaves `skins/`, `skins.new/` and `skins.bak-*` out of the models manifest hash, the
desktop app copy and the asset pack. `--with-skins` puts the files `skins/skins.json` lists into the pack under
**`skins-pack/`** (not `assets/skins/`: a room's pack import writes `assets/*` straight over its files, which would mix
old and new finishes with no backup; today's room ignores `skins-pack/`), sets `skins: true` in `infra-pack.json`, and
installs them into the desktop app's own `assets/skins` with the same back-up rule (`installSkins`). A room that wants
to take finishes from a pack unpacks `skins-pack/` into a temp folder and calls `installSkins({ assets, from: temp })`
from `tools/cs2-skins/manifest.mjs`.

## What is baked
Per (model, finish), at `res`² (1024 by default), in the model's first-person UV0 layout. Image row 0 is v = 0, the glTF
convention, so three.js loads these with `flipY = false`, like the first-person sets.

| File | Contents |
|---|---|
| `<model>/<kit>_paint.jpg` | paint albedo, sRGB, with AO and cavity baked in. On knives the handle (outside CS2's blade mask) is matte near-black "paint" (linear about 0.045): black handles, no special case in the shader. |
| `<model>/<kit>_mrw.png` | data (8-bit PNG with no colour chunks: no sRGB, gAMA, cHRM or iCCP, so no decoder colour-manages it). R = paint metalness, G = paint roughness, B = wear rank (the paint survives where `rank > wear`), A = paint coverage (1 on the painted surface; on knives 1 everywhere, the handle being black "paint" that never wears). Decode it as data: no premultiplied alpha, no colour conversion. |
| `<knife>/<kit>_paint2k.jpg`, `_mrw2k.png` | with `--fp2k`: 2048² versions for the star knives. |
| `base/<knife>_color.jpg`, `_orm.jpg` | CS2's own star-knife base maps: colour, and ORM (R AO, G roughness, B metalness). CS2's knife material uses the flat default normal map, so there is no base normal map. |
| `shared/grunge.jpg` | CS2's shared gun grunge texture (wear dirt), 1024². |
| `icons/<model>_<kit>.webp` | CS2's econ image for the finish (light wear), 192×144, for the picker. |

One bake serves every wear value: the shader removes paint where `rank < wear`. The rank is CS2's shared wear texture
pushed lower in cavities and on edges, ranked so that about `k·wear^1.5` of the paint is gone: guns k = 0.4 (about
28% at wear 0.8), knives k = 0.85 (about 59% of the blade paint at 0.8). Both are calibrated against the light and
heavy econ icons; for knives by measuring how much of the knife changes from the light to the heavy icon (Crimson Web,
Lore, Autotronic: 18–32%; the bake at 0.85 changes about 24%). Knife handles have rank 1 (never worn), and so does
the most durable paint: **the shader must clamp the wear it uses to at most 0.97**, or at wear ≥ 0.98 the
`smoothstep(w±0.02)` edge reaches rank 1 and handles fade to half.

**Legacy finishes** (items_game `use_legacy_model 1`, 884 of 1,481 kits: Redline, Asiimov, Printstream, DDPAT…) are
painted by CS2 in the UV layout of the old `body_legacy` mesh, which does not fit the `body_hd` mesh the game draws.
Per gun, Blender bakes a lookup once (`tools/cs2-skins/legacy_lookup.py`): for every HD texel, the nearest same-facing
point on the legacy mesh and its legacy UV. Where that point is hidden under a parallel legacy layer that the HD mesh
does not have (the Five-SeveN grip insert, which CS2's artwork leaves grey), the layer above it is used instead. The finish is composited in the legacy layout and resampled into HD UV0
(`transfer.py`). Texels whose nearest legacy point is farther than 2% of the gun's size (parts CS2 remodelled) take that point's paint.

The composite itself (`bake.py`) re-implements CS2's `csgo_customweapon` shader per paint style from the paint
material's parameters and the model's composite inputs, because the shader source is not in the install. Custom and
gunsmith finishes use CS2's own artwork and are near-exact; anodized, hydrographic, patina and solid finishes are
rebuilt from the material settings. Gunsmith colour brightness lifts only where the pattern's alpha is set (applied to
the whole pattern it made 33 of 105 gunsmith kits about 1.3× lighter than their icons; weighted by alpha the median
matches the other kits). Pearlescent finishes (Printstream) are baked at the angle-averaged colour: their artwork is
mint-tinted and CS2 turns the hue with the view angle, which averages to the neutral pearl of the icons, so the bake
desaturates inside the pearlescence mask (by up to 85% at scale 20). The view-angle shimmer itself, glitter and
iridescence are not reproduced; `pearl` is in the manifest for a runtime that wants to add it.

## Manifest `user-assets/skins/skins.json`
```js
{ version: 1, made: ISO date, res: 1024,
  source: { s2v: '20.0.6980', pakSize: <pak01_dir.vpk bytes>, pakMtime: <seconds> },
  shared: { grunge: 'shared/grunge.jpg' },                       // may be {} if missing
  base: { karambit: { color: 'base/karambit_color.jpg', orm: 'base/karambit_orm.jpg' }, butterfly: {…}, m9: {…}, stiletto: {…} },
  weapons: {                                                      // game weapon id → its CS2 first-person set
    ak: { model: 'cs2_ak', uv: 0, len: 37.287,                    // len: CS2's weapon length (g_flWeaponLength1)
      finishes: { cu_ak47_cobra: { name: 'Redline', rarity: 'Classified', style: 7, wear: [0.1, 0.7], legacy: true,
        pearl: 0, paint: 'ak/cu_ak47_cobra_paint.jpg', mrw: 'ak/cu_ak47_cobra_mrw.png',
        icon: 'icons/ak_cu_ak47_cobra.webp',                      // optional
        fbId: 'redline' } } },                                    // built-in fallback finish id
    … },
  knives: {                                                       // knife family → per star knife
    aa_fade: { name: 'Fade', rarity: 'Covert', style: 6, wear: [0, 0.08], pearl: 0, fbId: 'fade',
      models: { karambit: { kit: 'aa_fade', paint: 'karambit/aa_fade_paint.jpg', mrw: 'karambit/aa_fade_mrw.png',
                            paint2k: '…', mrw2k: '…' },           // 2k only with --fp2k
                butterfly: {…}, m9: {…}, stiletto: {…} },         // a knife missing here has no bake: draw fbId on it
      icon: { karambit: 'icons/karambit_aa_fade.webp', … } },
    … } }
```
- Every path is relative to the `skins/` folder, uses `/`, and stays inside it.
- `style` is the items_game paint style (1 solid, 2 hydro, 3 spray, 4 anodized, 5 anodized multi, 6 anodized
  airbrush, 7 custom, 8 patina, 9 gunsmith). `wear` is the kit's `[wear_remap_min, wear_remap_max]`; the host clamps a
  skin's wear into it. `pearl` is the kit's pearlescent scale (0 when none).
- **Knife families** group one finish across knives: the kit name without the knife's infix (`cu_karam_lore` →
  `cu_lore`), merged by finish name (so `_b`, `_90` or per-knife variants share one family). The family's `name`,
  `style`, `wear` and `pearl` come from the first knife that has it.
- `fbId` rule: knife families take the old knife-skin id (`aa_fade` → `fade`, `am_marble_fade` → `marble`,
  `am_ruby_marbleized` → `doppler`, `am_sapphire_marbleized` → `sapphire`, `am_emerald_marbleized` → `emerald`,
  `aq_oiled` → `casehardened`, `hy_webs` → `web`, `an_tiger_orange` → `tiger`, `sp_mesh_tan` → `camo`,
  `hy_forest_boreal` → `forest`). Spray kits (`sp_mesh_tan` among them) are left out by default, so the old `camo`
  knife id has no CS2 family unless `--styles +3` is used: a runtime alias from `camo` to `cs2k:sp_mesh_tan` must fall
  back to the built-in camo when `knives.sp_mesh_tan` is missing. Otherwise style 6 → `fade`, style 8 → `casehardened`, and the bake's accent hue (its
  most colourful 5%) picks within the style's group (anodized, hydro/spray, paint), e.g. a dark custom paint with red
  accents → `redline`, white with orange → `asiimov`, blue anodized → `sapphire`.
- The host's catalogue is this file without the file paths.

## Checking the result
`tools/cs2-skins/preview.py` composes a bake the way the game's shader does (paint over the base by
`coverage × (rank > wear)`), and `render_check.py` draws it on a first-person set in Blender. These make the contact
sheets compared against CS2's own econ icons. `node tests/import-cs2-skins.mjs` checks the manifest, the install
back-up rule, and (when the install is present) a real bake of the karambit Fade and the AK-47 Redline.

## Limits
- One pattern placement per finish: the seed does not move an imported pattern (no Case Hardened blue gems or per-seed
  Fade percentages).
- Doppler, Marble Fade and Printstream look flatter than in CS2: no view-angle pearlescence, glitter or iridescence.
- Gunsmith metalness: most gunsmith kits carry no metalness parameter or texture and are baked with metal 0; the
  pattern alpha's exact meaning in CS2's shader is not known (it is used only to weight the brightness).
- Size: the curated set is about 460 MB on disk (two textures per finish), more than the plan's 150–200 MB estimate, and
  a runtime that keeps one finish per weapon resident needs paint + mrw: about 2 × 2.7 MiB per weapon at 512², about
  226 MiB for 30 weapons, over the plan's 128 MiB budget unless the mrw is kept at 512 for third person only or loaded
  on demand.
- The knife Fade's projection is calibrated by eye. Its colours run the right way from tip to guard, but the ring is
  gold where CS2's is silver.
- Black handles differ from CS2 on Lore and on the butterfly's inlays, which CS2 paints.
- The AUG has no CS2 first-person set on this install, so it has no imported finishes. The default CT/T knives have no
  CS2 finishes, and the stiletto has no Lore or Autotronic.
