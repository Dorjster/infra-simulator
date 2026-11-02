#!/usr/bin/env node
// CS2's own kill-feed icons (weapon silhouettes + the headshot / wallbang / no-scope / smoke / blind / in-air marks) from
// the host's Counter-Strike 2 install into user-assets/icons/killfeed/ — Valve's files, local only, never committed
// (user-assets/ is git-ignored; tests/no-valve-data.mjs). The game draws them in the feed when killfeed.json is there.
//   node tools/import-cs2-killfeed.mjs [--cs2 <dir>] [--out <dir>]
//     --cs2 <dir>   the CS2 extract (default ~/CS2-extract: game/game/csgo/pak01_dir.vpk, tools/s2v)
//     --out <dir>   where to install (default user-assets/icons/killfeed). An existing folder is moved to
//                   <out>.bak-<stamp> first — nothing is overwritten.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CS2 = path.resolve(arg('--cs2', path.join(os.homedir(), 'CS2-extract'))), OUT = path.resolve(arg('--out', path.join(ROOT, 'user-assets', 'icons', 'killfeed')));
const VPK = path.join(CS2, 'game', 'game', 'csgo', 'pak01_dir.vpk'), S2V = path.join(CS2, 'tools', 's2v', 'Source2Viewer-CLI');
for (const [what, p] of [['CS2 install (pak01_dir.vpk)', VPK], ['Source2Viewer-CLI', S2V]]) if (!existsSync(p)) { console.error(`No ${what} at ${p} (--cs2 <dir>)`); process.exit(1); }

// GD weapon id -> CS2 icon (panorama/images/icons/equipment/<name>). Knife styles: 'knife:<style>' (the killer's pick).
const WEAPON_ICONS = {
  pistol: 'glock', usps: 'usp_silencer', p250: 'p250', fiveseven: 'fiveseven', cz75: 'cz75a', tec9: 'tec9', deagle: 'deagle', cannon: 'deagle',
  mac10: 'mac10', mp9: 'mp9', mp7: 'mp7', smg: 'mp5sd', bizon: 'bizon', ump45: 'ump45', p90: 'p90', shotgun: 'nova', xm1014: 'xm1014',
  galil: 'galilar', famas: 'famas', ak: 'ak47', m4: 'm4a1', m4s: 'm4a1_silencer', sg553: 'sg556', aug: 'aug', ssg08: 'ssg08', sniper: 'awp',
  lmg: 'm249', negev: 'negev', knife: 'knife', karambit: 'knife_karambit', 'knife:butterfly': 'knife_butterfly', 'knife:stiletto': 'knife_stiletto',
  'knife:m9': 'knife_m9_bayonet', 'knife:karambit': 'knife_karambit', he: 'hegrenade', flash: 'flashbang', smoke: 'smokegrenade', decoy: 'decoy',
  molotov: 'molotov', incendiary: 'incgrenade', c4: 'c4', kit: 'defuser', kevlar: 'kevlar', helmet: 'armor_helmet', world: 'world',
};
// feed marks (f.how.* / f.head) -> CS2 icon (panorama/images/hud/deathnotice/<name>)
const MARK_ICONS = { blind: 'blind_kill', noscope: 'noscope', air: 'inairkill', smoke: 'smoke_kill', wallbang: 'penetrate', head: 'icon_headshot', suicide: 'icon_suicide' };

const tmp = mkdtempSync(path.join(os.tmpdir(), 'gd-killfeed-'));
try {
  execFileSync(S2V, ['-i', VPK, '-f', 'panorama/images/icons/equipment/,panorama/images/hud/deathnotice/', '-e', 'vsvg_c', '-d', '-o', tmp], { stdio: ['ignore', 'ignore', 'inherit'], maxBuffer: 64 << 20 });
  const src = { equipment: path.join(tmp, 'panorama/images/icons/equipment'), deathnotice: path.join(tmp, 'panorama/images/hud/deathnotice') };
  const need = [...new Set(Object.values(WEAPON_ICONS))].map(n => [n, src.equipment]).concat(Object.values(MARK_ICONS).map(n => [n, src.deathnotice]));
  const missing = need.filter(([n, d]) => !existsSync(path.join(d, n + '.svg'))).map(([n]) => n);
  if (missing.length) throw Error('Not in this CS2 install: ' + missing.join(', '));
  if (existsSync(OUT) && readdirSync(OUT).length) { const bak = `${OUT}.bak-${new Date().toISOString().replace(/\D/g, '').slice(0, 12)}`; renameSync(OUT, bak); console.log('Backed up the old folder to ' + bak); }
  mkdirSync(OUT, { recursive: true });
  const h = createHash('sha1');
  for (const [n, d] of need) { const svg = readFileSync(path.join(d, n + '.svg')); h.update(n).update(svg); writeFileSync(path.join(OUT, n + '.svg'), svg, { flag: 'wx' }); }
  writeFileSync(path.join(OUT, 'killfeed.json'), JSON.stringify({ hash: h.digest('hex').slice(0, 12), weapons: WEAPON_ICONS, marks: MARK_ICONS }, null, 1) + '\n', { flag: 'wx' });
  console.log(`${need.length} CS2 kill-feed icons -> ${OUT}`);
} finally { rmSync(tmp, { recursive: true, force: true }); }
