#!/usr/bin/env node
// CS2's own HUD icons (v53 stage 4) from the host's Counter-Strike 2 install into user-assets/icons/hud/ — Valve's files,
// local only, never committed (user-assets/ is git-ignored; tests/no-valve-data.mjs). The Global Defensive HUD
// (dist/gd-hud.js) and radar (dist/gd-radar.js) draw them when hud.json is there; without it they draw our own.
// What it takes (each optional — a missing one is listed and ours stays):
//   panorama/images/hud/armor, armor_helmet            the armour icon next to health (hudhealthammocenter)
//   panorama/images/icons/ui/bullet                     the bullet next to the reserve ammo
//   panorama/images/icons/ui/bomb_c4, defuser           the C4 / kit in the weapon list and on the team counter's avatars
//   panorama/images/hud/teamcounter/teamcounter_bomb-planted, teamcounter_botavatar   the planted-bomb timer icon, a bot's avatar
//   panorama/images/hud/radar/c4_sml_png (a .png)       the radar's C4 (carried, dropped, planted)
//   panorama/images/hud/ammo_reserve_<type>             the reserve-ammo icon per weapon (hudhealthammocenter.vcss
//                                                       .HUD--ammo-reserve--<type>: magazine, shotgun_shell, box,
//                                                       revolver_loader, banana_mag, bizon_tube, p90, generic_bullet)
//   panorama/images/econ/characters/customplayer_ctm_sas_square_png, customplayer_tm_phoenix_square_png
//                                                       the team counter's avatars: the agents GD draws (SAS / Phoenix,
//                                                       tools/import-cs2-models.mjs) — CS2's square agent portraits
//   panorama/images/backgrounds/bluedots_large_png      the kill cards' dot pattern (.kill-flag-bg-pattern)
//   node tools/import-cs2-hud.mjs [--cs2 <dir>] [--out <dir>]
//     --cs2 <dir>   the CS2 extract (default ~/CS2-extract: game/game/csgo/pak01_dir.vpk, tools/s2v)
//     --out <dir>   where to install (default user-assets/icons/hud). An existing folder is moved to <out>.bak-<stamp>
//                   first — nothing is overwritten.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CS2 = path.resolve(arg('--cs2', path.join(os.homedir(), 'CS2-extract'))), OUT = path.resolve(arg('--out', path.join(ROOT, 'user-assets', 'icons', 'hud')));
const VPK = path.join(CS2, 'game', 'game', 'csgo', 'pak01_dir.vpk'), S2V = path.join(CS2, 'tools', 's2v', 'Source2Viewer-CLI');
for (const [what, p] of [['CS2 install (pak01_dir.vpk)', VPK], ['Source2Viewer-CLI', S2V]]) if (!existsSync(p)) { console.error(`No ${what} at ${p} (--cs2 <dir>)`); process.exit(1); }

// HUD name (gd-hud.js / gd-radar.js) -> the file in the VPK (compiled), and the exported file Source2Viewer writes.
export const HUD_ICONS = {
  armor: 'panorama/images/hud/armor.vsvg_c', armor_helmet: 'panorama/images/hud/armor_helmet.vsvg_c', bullet: 'panorama/images/icons/ui/bullet.vsvg_c',
  c4: 'panorama/images/icons/ui/bomb_c4.vsvg_c', defuser: 'panorama/images/icons/ui/defuser.vsvg_c',
  bomb_planted: 'panorama/images/hud/teamcounter/teamcounter_bomb-planted.vsvg_c', bot_avatar: 'panorama/images/hud/teamcounter/teamcounter_botavatar.vsvg_c',
  radar_c4: 'panorama/images/hud/radar/c4_sml_png.vtex_c',
  ...Object.fromEntries(['magazine', 'shotgun_shell', 'box', 'revolver_loader', 'banana_mag', 'bizon_tube', 'p90', 'generic_bullet'].map(t => ['ammo_' + t, `panorama/images/hud/ammo_reserve_${t}.vsvg_c`])),
  agent_ct: 'panorama/images/econ/characters/customplayer_ctm_sas_square_png.vtex_c', agent_t: 'panorama/images/econ/characters/customplayer_tm_phoenix_square_png.vtex_c',
  kill_dots: 'panorama/images/backgrounds/bluedots_large_png.vtex_c',
};
const exported = f => f.replace(/\.vsvg_c$/, '.svg').replace(/_png\.vtex_c$/, '_png.png');

const tmp = mkdtempSync(path.join(os.tmpdir(), 'gd-hud-icons-'));
try {
  execFileSync(S2V, ['-i', VPK, '-f', Object.values(HUD_ICONS).join(','), '-d', '-o', tmp], { stdio: ['ignore', 'ignore', 'inherit'], maxBuffer: 64 << 20 });
  const got = {}, missing = [];
  for (const [n, f] of Object.entries(HUD_ICONS)) { const p = path.join(tmp, exported(f)); if (existsSync(p)) got[n] = p; else missing.push(n); }
  if (!Object.keys(got).length) throw Error('None of the HUD icons are in this CS2 install');
  if (missing.length) console.log('Not in this install (the HUD draws ours): ' + missing.join(', '));
  if (existsSync(OUT) && readdirSync(OUT).length) { const bak = `${OUT}.bak-${new Date().toISOString().replace(/\D/g, '').slice(0, 12)}`; renameSync(OUT, bak); console.log('Backed up the old folder to ' + bak); }
  mkdirSync(OUT, { recursive: true });
  const h = createHash('sha1'), icons = {};
  for (const [n, p] of Object.entries(got)) { const b = readFileSync(p), file = n + path.extname(p); h.update(n).update(b); writeFileSync(path.join(OUT, file), b, { flag: 'wx' }); icons[n] = file; }
  writeFileSync(path.join(OUT, 'hud.json'), JSON.stringify({ hash: h.digest('hex').slice(0, 12), icons }, null, 1) + '\n', { flag: 'wx' });
  console.log(`${Object.keys(icons).length} CS2 HUD icons -> ${OUT}`);
} finally { rmSync(tmp, { recursive: true, force: true }); }
