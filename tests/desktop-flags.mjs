// The Electron desktop build's GPU and throttling flags (v53 stage 6, spec §5.3), read from desktop/main.mjs's source (no
// Electron needed): the high-performance GPU asked for; ANGLE left on its Windows default, Direct3D 11 (no --use-angle, or
// only d3d11); ignore-gpu-blocklist (the user asked for it: a blocklisted integrated GPU is not pushed to software);
// SwiftShader allowed as the last fallback; no background throttling (the window's backgroundThrottling false, the
// renderer-backgrounding / timer-throttling switches, Windows occlusion off), so a match never slows behind another window;
// every one of these set once at start-up for the whole app (not per mode: other modes unchanged); nothing that weakens
// the sandbox or turns the GPU off; and Global Defensive's shaders compiled behind its loading card by the page
// (graphics.js prewarm / compileFor / uploadTextures, app.js's freeze-time rehearsal), never mid-fight.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
let n = 0; const ok = (c, m) => { assert(c, m); n++; if (process.env.V) console.log('  ok ' + m); };
const main = readFileSync(new URL('../desktop/main.mjs', import.meta.url), 'utf8');
const switches = [...main.matchAll(/app\.commandLine\.appendSwitch\(\s*'([^']+)'(?:\s*,\s*'([^']*)')?\s*\)/g)].map(m => [m[1], m[2] ?? null]);
const has = (k, v) => switches.some(([a, b]) => a === k && (v === undefined || b === v));
ok(has('force_high_performance_gpu'), 'the high-performance GPU (force_high_performance_gpu: laptops with two GPUs use the discrete one)');
ok(has('ignore-gpu-blocklist'), 'ignore-gpu-blocklist: a blocklisted integrated GPU still runs WebGL on the GPU');
ok(has('enable-unsafe-swiftshader'), 'no usable driver: SwiftShader instead of no WebGL (the Very Low preset then)');
const angle = switches.filter(([k]) => k === 'use-angle');
ok(angle.every(([, v]) => v === 'd3d11'), 'ANGLE: Windows keeps Direct3D 11 (no other --use-angle backend forced)');
ok(!/use-gl['"]?\s*,\s*['"](swiftshader|egl|desktop)/.test(main), 'no --use-gl override');
ok(/backgroundThrottling:\s*false/.test(main), 'the window: backgroundThrottling false');
ok(has('disable-renderer-backgrounding') && has('disable-background-timer-throttling'), 'no renderer backgrounding, no background timer throttling');
ok(has('disable-features', 'CalculateNativeWinOcclusion'), 'Windows: a covered window keeps drawing (native occlusion off)');
ok(/ipcMain\.handle\('desktop:in-match'/.test(main) && /prevent-app-suspension/.test(main), 'in a match: the app may not be suspended (desktop:in-match → powerSaveBlocker)');
for (const bad of ['disable-gpu', 'disable-gpu-compositing', 'disable-software-rasterizer', 'in-process-gpu', 'no-sandbox', 'disable-web-security', 'ignore-certificate-errors', 'disable-frame-rate-limit', 'disable-gpu-vsync'])
  ok(!has(bad), `not used: --${bad}`);
// set once at start-up for the whole app: before the first window, never inside a handler (no per-mode behaviour)
const firstWindow = main.indexOf('function createWindow');
for (const [k] of switches) { const at = main.indexOf(`appendSwitch('${k}'`); ok(at > 0 && at < firstWindow && !/ipcMain|=>\s*\{[^}]*$/.test(main.slice(main.lastIndexOf('\n', at), at)), `--${k}: set once at start-up (every mode alike)`); }
ok(/v53 stage 6, spec §5\.3/.test(main), 'main.mjs documents the §5.3 flags');
// shaders behind the loading card (the page)
const gx = readFileSync(new URL('../dist/graphics.js', import.meta.url), 'utf8'), app = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');
ok(/function prewarm\(/.test(gx) && /compileFor\(root\)/.test(gx) && /async uploadTextures\(/.test(gx), 'graphics.js: prewarm, compileFor and uploadTextures (programs and textures before play)');
ok(/function gdRehearse\(\)/.test(app) && /gdRehearseCheck\(\)/.test(app), 'app.js: the GD effect set compiled again at every freeze time (no compile mid-fight)');
console.log(`PASS: desktop-flags · ${n} checks (high-performance GPU, ANGLE D3D11 kept, ignore-gpu-blocklist, SwiftShader fallback, no background throttling, start-up only, warm-up)`);
