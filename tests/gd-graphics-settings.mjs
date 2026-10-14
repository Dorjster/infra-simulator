// Graphics settings (Settings → Graphics): each part on its own, 'auto' following the Graphics mode — shadows (off on
// Performance / Balanced, medium on Quality, high on Ultra), their edges, the glow, anti-aliasing (MSAA 4× on Ultra
// only), brightness kept in range; the old single "Shadows & glow" setting still counts where the new ones are on
// auto; nothing on software rendering. Texture quality (picture size) and filtering by mode or chosen; map detail and
// the player outline follow a change at once.
import assert from 'node:assert/strict';
import { resolveGraphics, SHADOW_MAPS } from '../dist/graphics.js';
import { textureSize, anisotropy, fitImage } from '../dist/texture-quality.js';
let n = 0; const ok = (name, c, d = '') => { n++; assert(c, name + (d !== '' ? ' · ' + d : '')); };
const R = (p, preset) => resolveGraphics(p, preset);
ok('auto: no shadows or glow on Performance / Balanced', ['Low', 'Medium'].every(m => R({}, m).shadows === 'off' && !R({}, m).glow));
ok('auto: medium shadows and glow on Quality', R({}, 'High').shadows === 'medium' && R({}, 'High').glow && R({}, 'High').aa === 0);
ok('auto: high shadows, glow and MSAA 4× on Ultra', R({}, 'Ultra').shadows === 'high' && R({}, 'Ultra').glow && R({}, 'Ultra').aa === 4);
ok('chosen: shadows on Balanced without glow', R({ shadows: 'low', glow: 'off' }, 'Medium').shadows === 'low' && !R({ shadows: 'low', glow: 'off' }, 'Medium').glow);
ok('chosen: no shadows on Ultra, glow kept', R({ shadows: 'off' }, 'Ultra').shadows === 'off' && R({ shadows: 'off' }, 'Ultra').glow);
ok('the old "Shadows & glow: off" still turns both off on Quality', R({ effects: 'off' }, 'High').shadows === 'off' && !R({ effects: 'off' }, 'High').glow);
ok('the old "Shadows & glow: on" on Balanced: medium shadows and glow', R({ effects: 'on' }, 'Medium').shadows === 'medium' && R({ effects: 'on' }, 'Medium').glow);
ok('a new setting wins over the old one', R({ effects: 'off', shadows: 'high' }, 'High').shadows === 'high');
ok('shadow edges: soft unless sharp', R({}, 'High').edges === 'soft' && R({ shadowEdges: 'sharp' }, 'High').edges === 'sharp');
ok('anti-aliasing chosen', R({ antialias: '2' }, 'High').aa === 2 && R({ antialias: '0' }, 'Ultra').aa === 0);
ok('brightness kept between 60 and 160 %', R({ brightness: 9 }).brightness === 1.6 && R({ brightness: .1 }).brightness === .6 && R({}).brightness === 1);
ok('tone mapping: off unless filmic / AgX', R({}).tone === 'off' && R({ tonemap: 'filmic' }).tone === 'filmic' && R({ tonemap: 'agx' }).tone === 'agx' && R({ tonemap: 'x' }).tone === 'off');
ok('unknown shadow value: off', R({ shadows: 'huge' }, 'High').shadows === 'off');
{ const sw = resolveGraphics({ shadows: 'high', glow: 'on', antialias: '4' }, 'Ultra', true); ok('software rendering: none of it', sw.shadows === 'off' && !sw.glow && sw.aa === 0); }
ok('shadow maps grow with the setting, larger outdoors', SHADOW_MAPS.low[0] < SHADOW_MAPS.medium[0] && SHADOW_MAPS.medium[0] < SHADOW_MAPS.high[0] && Object.values(SHADOW_MAPS).every(([a, b]) => b === a * 2));
ok('texture size by mode', textureSize({ graphics: 'Low' }) === 512 && textureSize({ graphics: 'Medium' }) === 1024 && textureSize({ graphics: 'High' }) === 1024 && textureSize({ graphics: 'Ultra' }) === 2048);
ok('texture size chosen', textureSize({ textures: 'high', graphics: 'Low' }) === 2048 && textureSize({ textures: 'low', graphics: 'Ultra' }) === 512);
ok('filtering by mode and chosen', anisotropy({ graphics: 'Low' }) === 2 && anisotropy({ graphics: 'Ultra' }) === 16 && anisotropy({ filtering: '8', graphics: 'Low' }) === 8 && anisotropy({ filtering: 'auto', graphics: 'High' }) === 8);
ok('a picture already small enough is kept as is', await fitImage({ width: 512, height: 512 }, 1024) !== null);
{ const store = {}; globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
  const ev = new EventTarget(); globalThis.addEventListener = ev.addEventListener.bind(ev); globalThis.dispatchEvent = ev.dispatchEvent.bind(ev);
  const { live } = await import('../dist/live-settings.js'), { savePreferences, loadPreferences } = await import('../dist/player-preferences.js');
  savePreferences({ ...loadPreferences(), detail: 'high', rim: 'off' }); ok('map detail and outline follow a change at once', live.detail === 1.6 && live.rim === false, JSON.stringify(live));
  savePreferences({ ...loadPreferences(), detail: 'auto', graphics: 'Low', rim: 'on' }); ok('map detail auto: near on Performance', live.detail === .6 && live.rim === true); }
console.log('PASS: graphics settings · ' + n + ' checks');
