# Global Defensive: importing CS2 gloves

`tools/import-cs2-gloves.mjs` turns the gloves of **this computer's own Counter-Strike 2 install** into files the game
can draw: the 8 paintable glove types (Sport, Driver, Hand Wraps, Moto, Specialist, Bloodhound, Hydra, Broken Fang)
and every glove finish the install has an econ icon for (94 on the 2026-10 install). Valve's files stay on this
computer and are never committed: the output goes to the git-ignored `user-assets/gloves/`, and the tool and
`tools/cs2-gloves/` hold only logic. The game's runtime part (a picker, LAN, first- and third-person drawing) is a
later track; this is the import.

```
node tools/import-cs2-gloves.mjs --dry-run          # what would be made, estimated size; writes nothing
node tools/import-cs2-gloves.mjs                    # bake into the staging folder (~/Library/Caches/infra-cs2-gloves/stage)
node tools/import-cs2-gloves.mjs --install          # bake (cached: reruns are quick), check, install as user-assets/gloves
node tools/import-cs2-gloves.mjs --only sporty,slick/slick_black --out /tmp/g    # some types / type/finish only
```

Options: `--cs2 <dir>` (default `~/CS2-extract`), `--assets <dir>`, `--arms <glb>` (the first-person arms glb whose
skeleton the gloves are bound to; default `user-assets/manifest.json` → `models.fpGloves`, else the newest
`user-assets/fp-gloves/arms-*.glb`), `--out <dir>`, `--work <dir>` (cache), `--res 1024`, `--jobs 2` (each process
under `nice -n 10`), `--force`, `--python <Blender's python3>`.
Needs: the CS2 extract (`game/game/csgo/pak01_dir.vpk`, `tools/s2v/Source2Viewer-CLI`), Blender (its Python brings
numpy and OpenImageIO), and package V's arms glb (`tools/export-fp-gloves.py`).

## Safety rules

* `--out` must be a new or empty folder, one the tool made (marker `.cs2-gloves-stage`), or `user-assets/gloves.new`.
  The tool refuses `user-assets` itself, an ancestor of it, or any other folder inside it (compared by real path, so
  symlinks are caught): user-assets is only written by `--install`.
* `--install` checks the baked folder, copies exactly the files its manifest lists into `user-assets/gloves.new`, checks
  the copy, renames an existing `user-assets/gloves` to `gloves.bak-YYYYMMDD-HHMM` (same minute: `-2`, `-3` …), renames
  `gloves.new` to `gloves`, and keeps the 2 newest backups. Installing the same bake again changes nothing. Nothing
  else under user-assets is touched (the logic is `tools/cs2-skins/manifest.mjs installSkins`, copied).
* A full run deletes files in `--out` that the manifest does not list; `--only` runs keep the rest and merge into the
  existing manifest.

## How CS2 paints gloves, and what the bake does

A glove model (`agents/models/shared/arms/glove_<type>/glove_<type>.vmdl`) carries a first-person LOD (left- and
right-hand materials plus a bare-wrist piece) and a third-person LOD, on the same 52 view-model arm bones as the
agents' arms. Its own colour texture is a 4×4 placeholder: every finish is a **composite material**
(`gloves/paints/[volatile_02/]<kit>.vcompmat`) whose compositor renders the paint material with the glove shader in
four output modes into the glove's `g_tColor`, `g_tNormal`, `g_tMetalness` and `g_tAmbientOcclusion` at 2048², with the
wear amount (`g_flWearAmount` → `g_fWearProgress`) baked in. The shaders are not in the install, so
`tools/cs2-gloves/bake.py` rebuilds both generations from the paint material's parameters and textures:

* **v1 `csgo_customglove`** (72 finishes): `g_tLayerMask`: textile layer 1 where RGB is 0 (most of the glove's body), R/G/B = layers 2/3/4 painted over it,
  A = colour id 1..8 (stored as (id−0.5)/8) → `g_vColorTint<id>`; per layer a tiled detail texture (R shade, G
  roughness, `g_fDetailScale`, black point, roughness brightness/contrast, metalness) and detail normal; `g_tPattern`
  replaces colour id `g_nPatternReplaceIndex` (mode 0: palette chain `g_vPatternPaletteIndices` by the pattern's R, G,
  B; mode 2: the pattern's own colours, e.g. Fade) with the composite's instance rotation/offset; `g_tSurface` G =
  ambient occlusion, B = edges.
* **v2 `csgo_customglove_preview`** (22 newer finishes): `g_tLayerId` RGB = layers 1-3, layer 4 where RGB is 0 (the opposite of v1's order, checked against the icons); `g_tTintId` (an 8-bit
  texture format, VTexFormat 33, that `tools/cs2-gloves/tex.py` adds) = id = which eighth of 0..1 → `g_vId<id>Color`
  (A = how much it multiplies in); per layer a tiled textile (`g_tSurface<i>` colour + normal) with brightness,
  contrast, saturation and tint (tint alpha set: the tint's hue at the textile's brightness); `g_tPattern` is a paint
  in the glove's UV (A = coverage, only on ids with `g_bId<id>Pattern`), `g_tPatternProperties` G its roughness;
  `g_tObjectProperties` R = ambient occlusion.
* CS2's normal maps are hemi-octahedral (RG); they are decoded as Source2Viewer does (+Y = glTF's convention, the
  same as package V's arms).

The v1 reconstruction matches CS2's icons closely; v2 is an approximation (its colour model is inferred from the
parameters; CS2's light icon sits next to every bake on the import sheet for comparison). Each type has **no default
look** in CS2 (the glove's own material is the placeholder grey): `default` is `null`; players without a glove skin
keep the agent's own gloves (package V).

**Wear.** CS2 has no wear mask for gloves: it re-runs the composite at the item's wear. The bake is the unworn look
(wear 0) plus `<kit>_wear.png` (512², R = wear threshold: a texel looks worn once the float wear passes it; edges /
curvature first) and the manifest's `wearLook` (how worn texels change: brightness and saturation offsets, roughness
factor — CS2's per-layer damage parameters averaged over the glove) so the runtime can approximate worn gloves.

## Meshes and the skeleton

`tools/cs2-gloves/export_mesh.py` writes `meshes/glove-<type>.glb`: the 52 bones in the order and with the inverse
bind matrices of the arms glb (`user-assets/fp-gloves/arms-<sha8>.glb`, package V), so the runtime can bind the glove
to each first-person set's own glove skeleton exactly like the arms (fp-view.js loadArms/armsFrom/dressArms) and swap
only the glove part, keeping the agent's sleeves. CS2's glove models use the same bones; three upper-arm twist bones
sit up to 0.8° differently, so each vertex is moved into the arms glb's bind pose (the largest move is 0.00007 m).

| mesh | what | material |
|---|---|---|
| `glove_L`, `glove_R` | first-person gloves (CS2's viewmodel LOD) | `glove_<type>` (`extras.part = "glove"`): the finish textures |
| `skin` | the bare wrist CS2 draws with this glove | `bare_arm_133` (`extras.part = "skin"`, `extras.shareWith`): use the arms glb's material of that name |
| `world_L`, `world_R` | CS2's third-person glove mesh, same bones | `glove_<type>` |

Both hands use one texture set: CS2 lays the right hand out at u −1..0 with the texture repeating (Hand Wraps and
Hydra also have pieces at u 1..2 and −1..0); every triangle is moved by whole texture widths into u 0..1, so the
textures can be sampled with clamp, as the arms glb is. A mesh's `extras.hand` is CS2's material side: Specialist
Gloves' left-hand material also covers a small piece on the back of the right hand (weighted to the right-hand bones),
so draw `glove_L` and `glove_R` together and never hide one hand by mesh. The skeleton hash (sha1 of the bone names + the inverse bind matrices
rounded to 1e-4, `export_mesh.py skeleton_hash` = `manifest.mjs skeletonHash`) is stored in the glb's root node
`extras.skeleton` and in the manifest; the runtime should compare it with the arms glb before swapping.

Third person: CS2 shows the chosen gloves on third-person agents too. The glove model holds a `.worldmodel` LOD next
to the `.viewmodel` one, and each agent model has a separate `thirdperson_default_gloves` mesh that the glove's world
mesh replaces. The world mesh is exported as `world_L` / `world_R`. All 52 glove bones also exist, by name, in both
skins of GD's CS2 agents (`user-assets/agents/cs2_ct.glb`, 94 bones; `cs2_t.glb`, 86 bones), with the same inverse
bind matrices (largest difference 1.5e-5). So `world_L` / `world_R` bind straight onto the agent's bones with no
retargeting. `node tools/cs2-gloves/tp-check.mjs` checks this for every glove glb (32/32 ok on 2026-11-01). GD's
older `ct.glb` / `t.glb` agents use a different rig and are not covered.

## `user-assets/gloves/gloves.json`

```jsonc
{
  "version": 1, "made": "2026-11-01T…", "res": 1024,
  "source": { "s2v": "20.0.6980", "pakSize": 7706712, "pakMtime": 1760567600 },   // Source2Viewer version, pak01_dir.vpk size / mtime (s)
  "skeleton": { "hash": "<sha1>", "bones": 52, "from": "arms-d1f4a9fe.glb" },
  "types": {                                    // CS2's glove order: Sport Gloves first
    "sporty": { "id": "sporty", "name": "<CS2's English name>", "item": "<items_game item name>", "defindex": 0,
                "mesh": "meshes/glove-sporty.glb", "skeleton": "<sha1, = skeleton.hash>",
                "meshes": { "glove_L": { "verts": 0, "tris": 0 }, … }, "default": null,
                "finishes": ["<kit>", …] }      // sorted by name
  },
  "finishes": {
    "<kit>": { "id": "<kit>",                   // CS2's paint kit name (unique across glove types)
      "paintKit": 0,                            // paint kit number (econ id)
      "name": "<CS2's English name>", "rarity": "<items_game rarity id>", "rarityName": "<English label>",
      "type": "sporty", "shader": "v1" | "v2",
      "color": "sporty/<kit>_color.jpg",        // res², sRGB JPEG, no AO baked in
      "normal": "sporty/<kit>_normal.png",      // res², tangent space, glTF +Y
      "orm": "sporty/<kit>_orm.png",            // res², R ambient occlusion, G roughness, B metalness (linear)
      "wear": "sporty/<kit>_wear.png",          // 512², R = wear threshold
      "icon": "icons/sporty/<kit>.webp",        // 256×192, CS2's light econ icon
      "wearRange": [0.06, 0.8],                 // the paint kit's float range
      "wearLook": { "brightness": 0, "saturation": 0, "roughness": 1 },
      "cloth": true,                            // CS2 shades it as cloth (sheen)
      "roughMean": 0.5, "metalMean": 0,
      "fallback": "#rrggbb" }                   // a plain colour for players without the files (the bake's average)
  }
}
```

All paths are relative to `user-assets/gloves/`, never absolute or leaving the folder (the check refuses them).
Images: row 0 = v 0 (glTF; three.js `flipY = false`). PNGs carry no colour chunks.

## Checks and pictures

* `tests/import-cs2-gloves.mjs` — part 1 (synthetic, CI): image / glb headers, skeleton hash, manifest check,
  staging rule, install back-up rule. Part 2 (only with `~/CS2-extract`, Blender and the arms glb, else `SKIP`):
  a real bake of two Sport Gloves finishes (one per shader generation), the skeleton matched bone by bone against
  the arms glb, Python = JS hash, install into a fake user-assets folder.
* `tools/cs2-gloves/render.py` (Blender): `studio` renders every finish on its glove (both hands, studio light);
  `fit` renders a glove on a first-person set's clip with the agent's sleeves, from the set's camera.
  `tools/cs2-gloves/sheet.mjs` assembles the labelled import sheet (`~/Desktop/GD-gloves-import*.jpg`).

## In the game (v52.0.1): gloves as skins

* **Picker** — M → LOADOUT & SKINS → **Gloves** (shown only when the host's `gloves.json` is there): left the types
  (Default (agent gloves), then Sport Gloves and the rest in CS2's order), middle that type's finishes (CS2's econ
  icon, name, rarity in its colour, a search), right the pair with a wear slider limited to the finish's `wearRange`,
  Equip / Default gloves and Darja's give. Everyone picks any pair (as knives). `dist/arena-ui.js`.
* **LAN** — one more slot in a player's skins record: `gloves: { finish: "cs2g:<kit>", wear }` (about 40 bytes), sent
  in the room's `skins` message with the rest (never in the arena frame; the arena frame only names the catalogue's
  hash, `gloveCat`, so a page fetches `gloves.json` again when the host installs a new one). The host checks the kit
  against its own `gloves.json` (`dist/skins.js cleanGloveNote`: unknown kit or no catalogue → refused, wear clamped);
  a pick in a live round applies at the next freeze; kept across rematch, a new match, a host restart
  (`gd-skins.json`) and a reconnect. `NET_PROTOCOL` stays `gd-52`.
* **Files** — `dist/glove-assets.js`: the catalogue, each type's glb (once), and per (kit, wear step of 0.02, tier) one
  texture set: `fp` (your gloves and your side's, 1024, colour + normal + ORM) and `tp` (others' agents, 512, colour +
  normal). Wear is baked into the colour as the set loads (`_wear.png` thresholds, `wearLook`). Fetched and uploaded
  under the gun skins' gates (`skin-textures.js`: never in a live round), one picture a frame, freed LRU over 160 MB.
  A type's glb parsed while a round is live is shown to the views only when the gate opens (the freeze), like a
  picture: no glove meshes are built and no agent re-wears mid-round. Types wanted at 'fp' (yours and your team
  mates', for spectating) are built, hidden, on every first-person set then, so a first spectate builds nothing.
  Until the pictures are in: the finish's 1×1 fallback set (the same maps: the same shader); a type whose glb is
  missing: the agent's own gloves tinted with `fallback`.
* **First person** — `dist/fp-view.js` `set.setGloves(rec, team)` / `hold(…, { gloves })`: in the side's
  `cs2_arms_<side>` the `arms_<side>` glove and bare-wrist meshes are hidden; the type's `glove_L` + `glove_R` + `skin`
  are bound to the set's own skeleton (same 52 bones, same order: that skeleton), the `skin` piece with the arms'
  `bare_arm_133` material; every `sleeves_<side>` mesh is kept. The glove material is a copy of the CS2 arms' glove
  material (same maps, `armsShader`, program key `cs2arms1`, reflections), one per finish and wear step, shared by
  every set: no shader is built for a glove. Your own view (`weapons.js`), spectating (`spectate-view.js`: the
  watched player's record) and other modes (no side: the set's own glove) all go through it.
* **Third person** (feasible, done) — `dist/cs2-agents.js` `setGloves(rec)`: the type's `world_L` / `world_R` with
  their bone indices re-numbered once per (type, side) into the agent's `thirdperson_default_gloves` skeleton (all 52
  bones there by name, inverse binds equal to 1.5e-5), sharing every other attribute with the glove's geometry (no
  tangents, as the agents' meshes); the default gloves hidden. Material: a copy of the agent's own glove material
  (same maps and rim hook: its program) with the finish's `tp` pictures — the agent's own shaded copy when it is lit by
  the map, else one per finish and side. Bots wear their agent's own gloves. GD's older non-CS2 agents: none.
* **Other computers** — `node tools/import-cs2-models.mjs --with-gloves` puts `user-assets/gloves/` into the asset
  pack as `gloves-pack/…` and into the desktop app's copy (installed there by `installGloves`, the back-up rule);
  without it `gloves/` is left out of the manifest hash, the app copy and the pack (282 MB). A room's
  Import asset pack installs `gloves-pack/` the same way (`gloves.bak-…`, two kept) and reads the catalogue again;
  `assets/gloves/…` in a pack is never written over the installed set.
* **Tests** — `tests/gd-gloves.mjs` (synthetic, CI: data, host checks, LAN merge and sizes, save, page catalogue,
  wear bake, what loads for whom, gloves-pack install), `tests/gd-gloves-view.mjs` (this computer's import: every
  type on the arms' skeleton, the swap on all first-person sets CT and T, the hands through idle and inspect, the
  fallback and tint, third person on both agents, no per-frame allocation),
  `tests/browser/gd-gloves-skins-e2e.mjs` (the picker at 1280×720, every type in game CT and T with a rifle and the
  knife inspect, pictures on the GPU first, no program built by a swap, left-handed, spectating; writes
  `GD-v52-gloves-in-game.jpg`).
