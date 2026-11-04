// v53 ground rule 1: Global Defensive work leaves every other mode (Infra / Field / Operations, the office, the
// campaign, Payday, the casino) exactly as it was in 52.0.5 (d2e74af). Three checks:
//  1. FILES — every module that belongs to the other modes (their scenes, HUD, settings, logic: every file in dist/ and
//     lan/ that is neither Global Defensive's own — gd-*, arena-*, cs2-*, cs-*, fp-*, weapons*, bsp*, vbsp*, nade-mesh,
//     the GD-side helpers in GD_SIDE — nor one of the shared files in SHARED) is byte-identical to 52.0.5's: its
//     SHA-256 equals the one stored in tests/fixtures/other-modes-52.0.5.json (made from git show d2e74af:<file>).
//  2. BEHAVIOUR of the shared modules, run here, against fingerprints taken by running the same code on 52.0.5's
//     dist/: the key bindings of every non-GD context (input.js: actions, defaults, what each key does), the graphics
//     settings as used for every preset and prefs set (graphics.js resolveGraphics) and the default preferences
//     (player-preferences.js — the Settings screen's defaults).
//  3. GD GUARDS in the shared files (SHARED: lab.js, campaign-ui.js, graphics.js, hud.js, multiplayer.js,
//     sound-bank.js, lan/server.mjs, lan/room.mjs): every changed region against 52.0.5 (git word diff) names the GD
//     branch it sits in (inArena(), mode 'arena', gd, practice, a grenade…). Needs git history with d2e74af; a shallow
//     clone (CI) skips this part with a note — parts 1 and 2 still run.
// Fingerprints are remade only from 52.0.5 itself:  GD_UNTOUCHED_DIST=<52.0.5 tree>/dist node tests/gd-other-modes-untouched.mjs --print
//   node tests/gd-other-modes-untouched.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '..');
const DIST = path.resolve(process.env.GD_UNTOUCHED_DIST || path.join(repo, 'dist')), LAN = path.resolve(DIST, '..', 'lan');
const PRINT = process.argv.includes('--print'), BASE = 'd2e74af', FIX = path.join(here, 'fixtures', 'other-modes-52.0.5.json');
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d !== '' ? ' · ' + String(d).slice(0, 600) : '')); };
const sha = b => createHash('sha256').update(b).digest('hex');

// Global Defensive's own modules (spec 0.1), and the GD-side helpers without a GD name (GD stages may change them).
const GD_NAME = /^(gd-|arena-|cs2-|cs-|fp-|weapons|bsp|vbsp|nade-mesh)/;
const GD_SIDE = new Set(['skins.js', 'skin-render.js', 'skin-sync.js', 'skin-textures.js', 'glove-assets.js', 'host-clock.js', 'lag-comp.js', 'lag.js', 'spectate-view.js',
  'spatial-audio.js', 'user-maps.js', 'user-assets.js', 'vtf.js', 'goldsrc-mdl.js', 'mesh-solids.js', 'map-light.js', 'look-cuts.js', 'frame-gate.js', 'third-person.js',
  'weapon-models.js', 'phys-smooth.js', 'combat-logic.js', 'combat-hud.js', 'box-grid.js', 'aiming.js', 'voice.js', 'sun-shadows.js', 'render-optimizer.js', 'rim-light.js',
  'texture-quality.js', 'load-progress.js', 'live-settings.js', 'input.js', 'version.js', 'index.html', 'carried-models.js', 'avatar.js', 'emotes.js', 'media.js', 'jobs.js']);
// The shared files (spec 0.1 and those v53 touched): changed only inside GD branches (part 3); behaviour in part 2.
// (app.js since v53 stage 6: the page's frame loop, which already held GD's frame gate, dynamic resolution and overlay — the GD
// preset's render scale / 30 fps target / detection are added in its GD branches, audited like the others in part 3)
// (fun-pistol.js since v53 GUNS: every gun's shot effects — Global Defensive's too — live in it; CS2's muzzle flash, shell
// case and the light cut to the flash are added in its GD branches (gdOn()), audited like the others in part 3)
const SHARED = ['lab.js', 'campaign-ui.js', 'graphics.js', 'hud.js', 'multiplayer.js', 'sound-bank.js', 'app.js', 'fun-pistol.js', '../lan/server.mjs', '../lan/room.mjs'];
const otherModes = () => {
  const d = readdirSync(DIST).filter(f => /\.(m?js|css|html)$/.test(f) && statSync(path.join(DIST, f)).isFile() && !GD_NAME.test(f) && !GD_SIDE.has(f) && !SHARED.includes(f) && !/^three\./.test(f) && f !== 'OrbitControls.js');
  const l = readdirSync(LAN).filter(f => /\.mjs$/.test(f) && !SHARED.includes('../lan/' + f)).map(f => '../lan/' + f);
  return [...d, ...l].sort(); };

// ── 2. behaviour fingerprints (the same code runs on 52.0.5's dist for --print) ──
const imp = f => import(pathToFileURL(path.join(DIST, f)).href);
async function behaviour() {
  const out = {};
  { const I = await imp('input.js'), ctxs = Object.keys(I.CONTEXTS).filter(c => c !== 'arena');
    const acts = I.ACTIONS.filter(a => a.ctx.some(c => c !== 'arena')).map(a => ({ id: a.id, label: a.label, legacy: a.legacy, def: a.def, ctx: a.ctx.filter(c => c !== 'arena'), hold: !!a.hold }));
    const codes = [...new Set(I.ACTIONS.flatMap(a => a.def).concat(['KeyA', 'KeyZ', 'Digit5', 'Digit9', 'Space', 'F1', 'Backquote', 'WheelUp', 'WheelDown', 'MouseLeft', 'MouseRight']))].sort();
    const keys = {}; for (const c of ctxs) keys[c] = codes.map(k => [k, I.legacyKey(c, k), I.isBoundKey(c, k), I.labelOf(c, I.actionsFor(c, k)[0]?.id ?? '')]);
    out.input = sha(JSON.stringify({ ctxs: ctxs.map(c => [c, I.CONTEXTS[c]]), acts, keys })); }
  { const G = await imp('graphics.js'), rows = [];
    const sets = [{}, { effects: 'on' }, { effects: 'off' }, { shadows: 'low', glow: 'on', antialias: '4' }, { shadows: 'high', shadowEdges: 'sharp', tonemap: 'agx', brightness: 1.3 }, { glow: 'off', tonemap: 'filmic', brightness: 9 }];
    for (const p of sets) for (const pre of [undefined, 'Low', 'Medium', 'High', 'Ultra']) for (const sw of [false, true]) rows.push(G.resolveGraphics(p, pre ?? p.graphics ?? 'Medium', sw));
    out.graphics = sha(JSON.stringify({ rows, maps: G.SHADOW_MAPS })); }
  { const P = await imp('player-preferences.js'); out.preferences = sha(JSON.stringify(P.defaultPreferences)); }
  return out; }

if (PRINT) {
  const files = {}; for (const f of otherModes()) files[f] = sha(readFileSync(path.join(DIST, f)));
  console.log(JSON.stringify({ base: BASE, version: '52.0.5', files, behaviour: await behaviour() }, null, 1)); process.exit(0); }

const F = JSON.parse(readFileSync(FIX, 'utf8'));
// ── 1. other modes' own modules, byte for byte ──
{ const now = otherModes(), changed = [], gone = [], extra = now.filter(f => !(f in F.files));
  for (const [f, h] of Object.entries(F.files)) { if (SHARED.includes(f)) continue; /* (a file moved to SHARED: audited in part 3 instead) */ const p = path.join(DIST, f); if (!existsSync(p)) gone.push(f); else if (sha(readFileSync(p)) !== h) changed.push(f); }
  ok('every other-mode module is byte-identical to 52.0.5 (' + Object.keys(F.files).length + ' files: scenes, HUD, settings, logic)', !changed.length, 'changed: ' + changed.join(', ') + ' — keep Global Defensive work out of them (spec 0.1)');
  ok('no other-mode module removed', !gone.length, gone.join(', '));
  ok('no new module outside Global Defensive\'s own names (a GD module goes in gd-* / arena-* …; a new shared one needs a GD_SIDE entry with a reason)', !extra.length, extra.join(', ')); }
// ── 2. the shared modules behave as in 52.0.5 for the other modes ──
{ const B = await behaviour();
  ok('key bindings of every non-GD context (actions, defaults, each key\'s meaning and label) as in 52.0.5', B.input === F.behaviour.input);
  ok('graphics settings as used (every preset, prefs set, software rendering) as in 52.0.5', B.graphics === F.behaviour.graphics);
  ok('default preferences (Settings) as in 52.0.5', B.preferences === F.behaviour.preferences); }
// ── 3. GD guards in the shared files' changes ──
let audited = 'skipped (no git history with ' + BASE + ')';
{ let git = false; try { execFileSync('git', ['-C', repo, 'cat-file', '-e', BASE + '^{commit}'], { stdio: 'ignore' }); git = true; } catch {}
  if (git && !process.env.GD_UNTOUCHED_DIST) {
    const GUARD = /inArena|['"]arena['"]|\barena\b|arena[-A-Z]|\bgd\b|\bgd[A-Z]|GD|Global Defensive|practice|[Nn]ade|jumpthrow|jumpRelease|amClk|\bam\b|pressThrow|throw/;
    const bad = []; let regions = 0;
    for (const f of SHARED) { const rel = path.posix.join('dist', f).replace(/^dist\/\.\.\//, '');
      const diff = execFileSync('git', ['-C', repo, 'diff', '--word-diff=porcelain', '--unified=0', BASE, '--', rel], { maxBuffer: 1 << 28 }).toString();
      // a region: the removed and added words between two unchanged ones; judged on what really changed in it (the
      // common start and end of its old and new text cut off — lab.js's long lines are single 'words'), with the 160
      // characters before it, where its guard (if (inArena() …) …) is written.
      let was = '', now = ''; const flush = () => { if (was || now) { regions++; let i = 0, j = 0; while (i < was.length && i < now.length && was[i] === now[i]) i++;
          while (j < was.length - i && j < now.length - i && was[was.length - 1 - j] === now[now.length - 1 - j]) j++;
          const ch = was.slice(i, was.length - j) + ' ⟶ ' + now.slice(i, now.length - j), lead = now.slice(Math.max(0, i - 160), i); if (!GUARD.test(lead + ch)) bad.push(rel + ': ' + ch.replace(/\s+/g, ' ').slice(0, 200)); } was = now = ''; };
      for (const line of diff.split('\n')) { if (/^(diff |index |--- |\+\+\+ )/.test(line)) continue; if (line.startsWith('@@')) { flush(); continue; }
        if (line[0] === '-') was += line.slice(1) + ' '; else if (line[0] === '+') now += line.slice(1) + ' '; else if (line[0] === ' ') flush(); }
      flush(); }
    ok('every change to a shared file since 52.0.5 sits in a Global Defensive branch (' + regions + ' changed regions)', !bad.length, bad.join(' | '));
    audited = regions + ' changed regions in ' + SHARED.length + ' shared files, all in GD branches'; } }

console.log(`PASS: gd-other-modes-untouched · ${n} checks (${Object.keys(F.files).length} other-mode modules byte-identical to 52.0.5; non-GD key bindings, graphics settings and default preferences as in 52.0.5; shared-file audit: ${audited})`);
