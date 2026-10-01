// Every browser/room module must parse (the game ships unbundled ES modules; one syntax error blanks the page).
import { readdirSync } from 'node:fs'; import { execFileSync } from 'node:child_process'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), files = [];
for (const dir of ['dist', 'dist/device-logic', 'lan', 'desktop']) for (const f of readdirSync(path.join(root, dir))) if (/\.(m?js|cjs)$/.test(f) && !/^three\./.test(f)) files.push(path.join(root, dir, f));
const bad = []; for (const f of files) { try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { bad.push(path.relative(root, f) + ': ' + String(e.stderr).split('\n').slice(0, 4).join(' ')); } }
if (bad.length) { console.error('Syntax errors:\n' + bad.join('\n')); process.exit(1); }
console.log('PASS: syntax · ' + files.length + ' modules parse');
