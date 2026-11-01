# Global Defensive: how weapons attach to hands and the floor

This file describes the one convention every weapon model follows, and where each view applies it. It covers v52.

## Model convention (all weapons)

Every weapon model the game draws follows the same rules: built-in procedural models, the CC0 packs, the imported CS2 `.bin` files (`weapon-models.js` CS2_FIT), and the star knives baked from their first-person sets (`fp-view.js` bakeKnife).

- The muzzle or blade points along **−z**, **+y** is up and **+x** is right.
- The origin is the **grip**: on guns, 4 cm behind and 3 cm under the trigger. On knives it is the guard, and on the bomb it is the middle of the brick.
- The unit is game units (1 u = 16.5 cm).

No model gets a blanket 180° turn. A model that was authored another way is fixed once, at load (CS2_FIT `rot`, REAL_FIT `flip`).

## Third person: CS2 agents (`cs2-agents.js`)

- The gun hangs off CS2's `wpn` bone through `carry` (named `wpn-carry`) and then `turn` (`wpn-turn`).
- `wpn` uses Source axes: +x is the muzzle (its `wpnTip` child sits ahead of it), +z is up and +y is the agent's left.

### How CS2 itself attaches a world weapon (v52 wave 3, package T)

Measured from the CS2 install (`tools/export-cs2-holds.mjs`):

- Every CS2 world weapon model has a `weapon` bone. Its frame uses the same Source axes: +x is the muzzle, +z is up, and a knife's blade runs along +z.
- In every third-person hold clip, the agent's `wpn` bone sits exactly on `attachHand_R` (0.0 cm apart). CS2 hangs the world model by putting its `weapon` bone on `wpn`.
- The model's `ag1_hand_r` bone is the old animgraph's attachment. It is 13.7 cm off on the AK, so it is not used.
- In the clips, `hand_R` and `hand_L` sit exactly on `wpnHand_R` and `wpnHand_L`. Each gun's own clip already places both hands on that gun.
- Source2Viewer writes a model's skeleton only with `--gltf_export_animations`. Without it there is no `weapon` bone, and the model root is not the weapon frame: on the AUG the bone sits 14.5 cm from the root. The first wave-3 data took the root for the AUG, so the AUG hung 11 cm above the hands and 9 cm forward (user report "aug 3d holding is not on hands"). The tool now always exports with the skeleton, re-exports a cached file that has none, rewrites the AUG through `tools/cs2-fp/kv3_compat.py` (KV3 types 26 / 27) and refuses a gun with no `weapon` bone, or with its bore more than 5 cm off it (every CS2 gun is within 3.4 cm).

### The game's attachment (`holdFit`, with CS2's data)

`user-assets/holds/holds.json` stores each item's CS2 world model, measured in its `weapon` frame: bounds, surface centroid, muzzle point, trigger bone and, for guns, `hands`: where CS2's hands touch it in its standing hold (each palm's centre, the nearest point of the gun's surface to it, the left wrist). When it exists, `setGun` lays the game's model where CS2's model lies on `wpn`. Each model is registered once and cached; `warmHolds` does this at load, one item per tick.

- **Turn.**
  - Guns use `WPN_CARRY = (-.5, .5, .5, -.5)`, which maps our −z to wpn +x and our +y to +z. Both conventions fix the barrel and the up, so this is a definition, not a fit.
  - Knives map our blade (−z) onto CS2's blade (+z). The spin about the blade (the edge side) is the one of the 4 possible turns whose bounds and centroid best match CS2's model.
  - A knife that is not CS2's own mesh (the star knives baked from their first-person sets carry stray skinned vertices, so their bounds are useless) is laid by its blade: the vertices of its finish mask give the blade's length, width and flat axes and its tip. The blade goes along CS2's +z, the width along CS2's x on the side where CS2's centroid lies, and the tip on CS2's tip (within 1 cm). Without a mask, the guard (our origin) goes on CS2's knife origin. Its handle is its own, not CS2's, so `palmOnHandle` then shifts it by at most 3 cm until its surface is as near CS2's right palm centre (`holds.json` `hands.palmR`) as CS2's own handle is (the M9: 3.9 → 2.1 cm, the tip still within 3 cm).
  - Grenades stay upright (our +y on CS2's +z) and are fitted the same way.
  - The bomb uses the best of all 24 axis turns.
- **Place.**
  - Guns: front to back on the centre of CS2's bounds, with our muzzle on CS2's muzzle height and side.
  - Imported CS2 files land on CS2's exact place (muzzle within 0.6 cm).
  - CC0 and built-in stand-ins (no CS2 file imported for that gun: 11 guns on this computer) are fitted to CS2's hand contacts (`fitStandIn`): the tip on CS2's tip, then a scale along the bore and one across it (0.6–1.6, coarse then fine search) so the stand-in's surface passes through CS2's right-hand grip point, its left-hand one and CS2's butt (on its butt plate). The left wrist is then moved by whatever gap is left (`ikL`, in wpn's frame) with two-bone IK, the hand turned as the clip holds it, faded out under a reload, throw or shot. Wave 3's first build scaled them evenly by length: the SG 553 grew 46 cm tall, and the left hand hung 7–9 cm off the UMP-45, MAC-10, LMG and P90.
  - A model registered later (a star knife baked from its first-person set, `registerModel`) is measured then (`onModelRegistered` → `warmHolds`), not at its first equip.
  - Anything else: the centre of its bounds on the centre of CS2's.
- **No per-gun numbers.** The game used to use these two per-gun numbers; neither is used any more:
  - AUG: this Source2Viewer build cannot read the AUG's model (an unknown KV3 type). The tool exports a rewritten copy (`kv3_compat.py`) with its skeleton. Without it the AUG keeps the old palm grip.
  - Decoy and incendiary: exported with their skeleton, their `weapon` bone sits at the model root (checked).
- **Without holds data**, the fallback is the old palm grip: the right palm's centre, read in the wpn frame at the hold clip's first frame. `ITEM_HOLD` is still empty.

### The pose

- **Hold clip per item.** Each gun plays its own (`<id>/hold`). Each knife plays CS2's own idle from `holds-clips.json`: `knife-ct`, `knife-t`, `karambit` (reverse grip), `butterfly`, `stiletto` and `m9`. The molotov plays its own. Other grenades play the shared grenade idle, and the bomb plays `c4/hold`.
- **Standing still.** The hold clip plays for the whole body. CS2's per-gun idle is a full-body pose (the bladed stance, legs included). Before this, the class idle's legs were used under the hold's chest.
- **Walking and running.** The legs come from the walk and run clips. The chest is set as the hold has it relative to its hips, and the gun's pivot rides the right hand. Both hands stay within 2.3 cm of CS2's hold on the gun.
- **Aim pitch.** `update(dt, { pitch })`: `spine_1`, `spine_2` and `spine_3` each bend a third of the pitch, about the agent's right. The arms and the gun go with the chest, so the hold itself never changes. Their clip values are restored before each mixer pass (`upKept`). Remote players send the live look as `pose.shot.pitch`, which multiplayer.js passes on as `m.csPitch`.
- **The IK fallback** (no clips) measures the gun's stock and reach in the gun's own frame before attaching it.
- **Knife choice.** `setWeapon(id, knife)` draws the knife the player chose once its model is registered (`registerModel`, baked from its first-person set). Until then it draws the side's default knife.

### Your own third-person view (`third-person.js`, `lab.js`)

In Global Defensive, key P draws you as the room dresses you (`dress`), so you see yourself exactly as others see you. That is your side's CS2 agent, or else the side's soldier. Before this it was the engineer avatar. Its camera is no longer clamped to the facility's hall, which had made the camera jump out of the map.

## Third person: shipped soldiers (`gd-soldiers.js`, `avatar.js`)

These attach the gun to `elbows.R` with rotation (π/2, π, 0), which puts the muzzle forward. In Global Defensive they follow CS2's convention as far as their rig allows (`setWeapon(id, hold)`):

- Every pistol is held short, up in the hand.
- Knives have the blade tipped up 52°, as CS2's default knife idles carry it (blade along (.24, .79, .57)).

Other modes are unchanged.

## First person (`fp-view.js`)

- CS2 sets play as authored.
- `muzzle()`: no set has a muzzle node. For guns, the game finds the front end of the gun mesh at load in the idle pose and keeps it in the `weapon` bone's frame, so it follows every clip. Knives, grenades and the bomb keep the hand position.
- Gloves: the right hand uses the shared glove material. The left hand uses a mirrored copy with the normal map's x negated, because its UVs run from 0 to −1.
- Default knives get a blade mask, so a skin paints only the blade and the handle stays black. Star knives carry their own mask in vertex colours.

## Dropped (`weapon-models.js` groundRest, `arena-ui.js`, host `arena-logic.js`)

- Rest pose: the model lies on its largest face. Guns, knives and grenade cans lie on their side; the bomb and the kit lie flat. Each model is lifted by its own lowest point in that pose, so it neither sinks into the floor nor floats.
- Applied as `rotation.set(x, yaw, z, 'YXZ')`.
- On landing, the model settles into the rest pose over 150 ms instead of snapping.
- The host owns existence and pickup:
  - Items leave the ground on the first claim.
  - Walk-over pickups and bots wait for the flight to land. This covers the host's own walk-over check and the client's walk-over request (`{type: 'pickup', walk: true}`, sent by arena-ui `autoPick`), which the host refuses with "Not landed yet". Bots, including a T bot going for a dropped bomb, also only take items on their own floor (within 4 units).
  - An explicit E press (a `pickup` without `walk`) can still catch an item in flight, as CS2 allows.
  - A player with no known pose cannot pick anything up.
  - The bomb is tossed like a gun from the carrier's host pose and lands where the swept flight stops. With no host pose the drop is refused; the client's position and height are never used.
  - Lying direction (`lieYaw`): the host turns the yaw until the grip-to-muzzle and grip-to-butt lines are clear of walls.

## Tests

- `tools/export-cs2-holds.mjs`: run once on a computer with the CS2 install. It writes `user-assets/holds/`, which is local only (Valve's data) and is served by the room to everyone in it.
- `tests/gd-agent-hold.mjs`: node, uses the agents if present. Section 3 needs `user-assets/holds` and loads the real models. It compares every item, standing and crouched, T and CT, with CS2's ground truth (`holds-truth.json`):
  - the wpn bone within 2 cm;
  - the barrel or blade direction, dot > .98;
  - the muzzle within 2 cm;
  - both hands within 3 cm;
  - the stock-to-shoulder distance within 3 cm.
  It also checks walking, running, jumping and aiming up or down (both hands on the gun within 3 cm, the muzzle following the pitch). The built-in soldiers' knife and pistol hold are checked too.
  Section 4 does not trust `holds.json`: it reads each gun's CS2 model from `holds/src` (a missing `weapon` bone fails), hangs it by that bone on the game agent's `wpn`, and checks the drawn gun's muzzle (< 2 cm), each palm's distance to the drawn gun's surface against CS2's to CS2's model (≤ CS2's, at least 1.5 cm, + 1.5 cm) and the butt plate on CS2's butt (< 3 cm, stand-ins too). `GD_HOLDS_DIR=<old export>` runs it against another export: the first wave-3 data fails it (AUG muzzle 14.5 cm, left palm 10.1 cm). Section 5: a model registered after load is measured at once.
- `tests/browser/gd-models-sheet.mjs only=holds before=<v51 repo> desktop=1 [refdir=<dir>]`: writes `GD-v52-holds-vs-CS2.jpg`, with three columns per item: CS2 (its clip and its own world model, in orange), v51, and now. Labels: the gun's front vs CS2's muzzle, each palm's distance to the drawn gun's surface (CS2's own in its column), a knife's guard-to-tip direction vs CS2's. `refdir` saves the reference renders and the ground truth.
- `tests/browser/gd-holds-lan-e2e.mjs`: over LAN, a remote player's hold equals their own third-person view (AK, Deagle, knife).
- `tests/gd-fp-sets.mjs`: node, uses the first-person sets if present.
- `tests/gd-drops.mjs`: node, built-in maps.
- `tests/gd-skins.mjs`: node.
- `tests/browser/gd-models-sheet.mjs`: builds the contact sheets, with before/after when given `before=<repo>`.
- `tests/browser/gd-v47-e2e.mjs`: section H.
