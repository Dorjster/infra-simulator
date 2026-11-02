// The kill feed's CS2 icons (tools/import-cs2-killfeed.mjs -> user-assets/icons/killfeed/, local only): every GD weapon,
// knife, grenade, the bomb and the defuse kit maps to an installed icon, and every feed mark too. Skipped without the import.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEAPONS, KNIVES, GRENADES, C4, DARJA_GUN } from '../dist/weapons-data.js';
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'user-assets', 'icons', 'killfeed'), J = path.join(DIR, 'killfeed.json');
if (!existsSync(J)) { console.log('gd-killfeed-icons: skipped (no CS2 kill-feed icons imported)'); process.exit(0); }
const m = JSON.parse(readFileSync(J, 'utf8')), bad = [];
const ids = [...WEAPONS, ...KNIVES, ...GRENADES, C4, DARJA_GUN].map(w => w.id).concat('kit', 'knife:butterfly', 'knife:stiletto', 'knife:m9', 'knife:karambit');
for (const id of ids) { const n = m.weapons?.[id]; if (!n) bad.push(id + ': no icon'); else if (!existsSync(path.join(DIR, n + '.svg'))) bad.push(id + ': missing ' + n + '.svg'); }
for (const k of ['blind', 'noscope', 'air', 'smoke', 'wallbang', 'head']) { const n = m.marks?.[k]; if (!n || !existsSync(path.join(DIR, n + '.svg'))) bad.push('mark ' + k + ': missing'); }
if (bad.length) { console.error('gd-killfeed-icons FAILED:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`gd-killfeed-icons: ${ids.length} weapons + 6 marks have CS2 icons`);
