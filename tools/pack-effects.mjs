// Copies the arena's effect sounds into dist/sounds/ (fx-*.ogg), all CC0 by Kenney (kenney.nl):
//   · "Sci-Fi Sounds" — explosions (HE grenade, flashbang bang, the bomb) and a roaring burn (molotov fire).
//   · "Impact Sounds" — breaking glass (molotov), grenade bounces, brass casings, bullets hitting walls and bodies.
// node tools/pack-effects.mjs <kenney sci-fi Audio folder> <kenney impact Audio folder>
import { copyFileSync, mkdirSync } from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const [scifi, impact] = process.argv.slice(2), out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'sounds');
mkdirSync(out, { recursive: true });
const FX = {
  'he-0': [scifi, 'explosionCrunch_001'], 'he-1': [scifi, 'explosionCrunch_002'], 'he-2': [scifi, 'explosionCrunch_003'], 'low-0': [scifi, 'lowFrequency_explosion_001'],
  'bomb-0': [scifi, 'explosionCrunch_004'], 'bomblow-0': [scifi, 'lowFrequency_explosion_000'], 'flash-0': [scifi, 'explosionCrunch_000'], 'fire-0': [scifi, 'thrusterFire_000'],
  ...Object.fromEntries([0, 1, 2].flatMap(i => [[`glass-${i}`, [impact, `impactGlass_heavy_00${i}`]], [`bounce-${i}`, [impact, `impactPlate_light_00${i}`]], [`wall-${i}`, [impact, `impactGeneric_light_00${i}`]], [`flesh-${i}`, [impact, `impactPunch_medium_00${i}`]]])),
  ...Object.fromEntries([0, 1, 2, 3].map(i => [`casing-${i}`, [impact, `impactTin_medium_00${i}`]])),
};
for (const [name, [dir, f]] of Object.entries(FX)) { copyFileSync(path.join(dir, f + '.ogg'), path.join(out, `fx-${name}.ogg`)); console.log('fx-' + name); }
