// Start flow, level HUD and the task-centred Campaign panel (Objective · Inventory/Orders · Map ·
// Laptop · Team · Settings). Everything shown here is read from the shared world through
// world.campaign (live checks) and world.operations; every button sends the same actions the 3D
// interactions and the LAN host use. The older engineering tabs stay reachable under "Advanced".
import * as THREE from './three.module.js';
import {usdMoney} from './money.js';
import {notify} from './hud.js';
import {savePreferences} from './player-preferences.js';
import {LEVELS, PLACES, CATEGORY_LEVEL, OFFICE_ITEM_LEVEL} from './campaign-levels.js';
import {CATALOG, CHALLENGES} from './operations.js';
import {OFFICE_CATALOG} from './office-schema.js';
import {RACK_PADS, DELIVERY, PROCUREMENT, ROOM} from './facility-layout.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SAVE_KEY = 'infra-local-campaign-v20';
const TABS = [['objective', 'Objective', 'J'], ['inventory', 'Inventory & orders', 'I'], ['map', 'Map', 'M'], ['laptop', 'Laptop', 'L'], ['team', 'Team', 'T'], ['settings', 'Settings', '']];

export function createCampaignUI(ctx) {
  const { world, lan, kit, engineering, officeUI, camera, scene, byId, racks, enter, exit, settings } = ctx;
  const ops = world.operations, C = world.campaign, $ = id => document.getElementById(id);
  let open = false, tab = 'objective', startOpen = true, hintTier = {}, lastHUD = 0, sub = '';
  const actor = () => lan.selfID || 'ENGINEER-01';
  const g = () => ops.game, levels = () => g().track === 'levels' && g().mode === 'campaign';

  document.body.insertAdjacentHTML('beforeend', `
<section id="start-screen" aria-label="Start">
 <div class="ss-wrap">
  <div class="ss-brand"><span>⌘</span> INFRA SIMULATOR <small>v36</small></div>
  <h1>Build a working enterprise, starting from an empty room.</h1>
  <p class="ss-lead">Receive equipment, rack it, cable it, configure it and prove every service works. Real ports, cables, consoles and GUIs, one clear step at a time.</p>
  <div class="ss-grid" id="ss-grid"></div>
  <div id="ss-sub" class="ss-sub" hidden></div>
  <div class="ss-foot"><button data-start="settings">Settings & controls</button><button data-start="inspect">Inspect the facility</button><button data-start="credits">Credits</button></div>
  <p class="ss-credit">Created by <strong>Darja</strong></p>
 </div>
</section>
<div id="level-hud" hidden></div>
<div id="resume-hint" hidden>Click to look around · Esc for the menu</div>
<section id="campaign-panel" hidden aria-label="Campaign">
 <div class="cp-head"><b id="cp-title">CAMPAIGN</b><span id="cp-context"></span><button id="cp-close" aria-label="Close">×</button></div>
 <nav id="cp-nav"></nav>
 <div id="cp-body"></div>
</section>`);

  // ---- 3D target marker: ring on the floor + a slim beam, shown at the current objective target. ----
  const marker = new THREE.Group(), ring = new THREE.Mesh(new THREE.RingGeometry(.9, 1.15, 40), new THREE.MeshBasicMaterial({ color: 0x7ef0c4, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .06; marker.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 14, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x7ef0c4, transparent: true, opacity: .25, depthWrite: false }));
  beam.position.y = 7; marker.add(beam); marker.visible = false; scene.add(marker);

  function send(action) { return lan.connected ? lan.send({ type: 'engineering', action }) : Promise.resolve().then(() => world.apply({ type: 'engineering', action }, actor())); }
  async function run(p, done) { try { const out = await p; const msg = typeof out === 'string' ? out : out?.message || out?.reason || 'Done'; notify(msg); done?.(msg); } catch (e) { notify(e.message); } finally { kit.refreshTargets?.(); render(); } }
  const office = a => lan.connected ? lan.send({ type: 'office', action: a }) : world.apply({ type: 'office', action: a }, actor(), [], { isHost: true });
  const campaign = a => lan.connected ? lan.send({ type: 'campaign', action: a }) : Promise.resolve().then(() => world.apply({ type: 'campaign', action: a }, actor()));

  // ---- Where is a check's target in the world? -----------------------------------------------------
  function targetOf(check) {
    const n = check?.node && byId[check.node];
    if (n?.pos) return { x: n.pos.x, z: (n.pos.z || 0) + (check.where === 'rack-rear' ? -6 : 6), label: n.id };
    const r = g().racks[0] || (!g().emptySite ? { id: 'R01', x: -9, z: 0 } : null);
    if (check?.where === 'rack-rear' && r) return { x: r.x, z: (r.z || 0) - 6, label: r.id + ' rear' };
    if (check?.where === 'rack-row' && r) return { x: r.x, z: (r.z || 0) + 6, label: r.id + ' front' };
    if (check?.where === 'rack-row' && g().emptySite) { const pad = RACK_PADS.find(p => p.core); return { x: pad.x, z: pad.z + 5, label: 'Rack bay ' + pad.rack }; }
    if (check?.where === 'receiving' || check?.where === 'procurement') { const box = g().orders.find(o => !o.opened && Date.now() >= o.arrives); return box ? { x: DELIVERY.x, z: DELIVERY.z, label: 'Receiving · delivery box' } : { x: PROCUREMENT.x, z: PROCUREMENT.z, label: 'Procurement kiosk' }; }
    const p = PLACES[check?.where]; return p && p.x !== null ? { x: p.x, z: p.z, label: p.label } : null;
  }

  // ---- Start screen ---------------------------------------------------------------------------------
  function localSave() { try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return d?.operations?.mode === 'campaign' ? d : null; } catch { return null; } }
  // Host invite bar: while hosting, the address(es) and room code friends need, always on screen.
  let invite = null; const inviteBar = document.createElement('div'); inviteBar.id = 'lan-invite'; inviteBar.hidden = true; document.body.append(inviteBar);
  inviteBar.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:37;background:#0d2231f0;border:1px solid #3fb5c9;border-radius:10px;padding:6px 14px;color:#e8f6fa;font:600 13px system-ui;display:flex;gap:12px;align-items:center;box-shadow:0 4px 16px #0006';
  async function setInvite(hosted) {
    const i = await roomInfo().catch(() => null), code = hosted?.roomCode || i?.roomCode || lan.roomCode || '', addrs = hosted?.addresses || i?.addresses || [];
    invite = code ? { code, addrs } : null; renderInvite();
  }
  function renderInvite() {
    const on = !!invite && lan.connected && lan.canManageWorld; inviteBar.hidden = !on; if (!on) return;
    inviteBar.innerHTML = `<span style="color:#7fe3f2;font-size:11px;letter-spacing:.12em">HOSTING · FRIENDS JOIN WITH</span><span>${invite.addrs.length ? invite.addrs.map(a => `<code style="font-size:15px">${esc(a)}</code>`).join(' or ') : '<em>this computer\'s address</em>'}</span><span>code <code style="font-size:15px">${esc(invite.code)}</code></span>`;
  }
  async function roomInfo() { try { const r = await fetch('/api/room'); if (!r.ok || !r.headers.get('content-type')?.includes('json')) return null; const d = await r.json(); return d.protocol === 'infra-lan-v1' ? d : null; } catch { return null; } }
  function showStart(yes = true) { startOpen = yes; $('start-screen').hidden = !yes; document.body.classList.toggle('at-start', yes); if (yes) { close(); $('ss-sub').hidden = true; renderStart(); if (document.pointerLockElement) document.exitPointerLock(); } }
  function begin() { showStart(false); close(); document.body.classList.add('in-game'); enter(); if (levels() && g().emptySite && !g().racks.length && !g().orders.length) ctx.place?.(-22, 10, -38, 12); render(); }
  function subPanel(html, bind) { sub = html; const el = $('ss-sub'); el.hidden = false; el.innerHTML = html; bind?.(el); el.scrollIntoView?.({ block: 'nearest' }); }
  const titlePicker = (id = 'ss-title') => `<label>Engineer title<select id="${id}"><option value="field">Field Engineer</option><option value="operations">Operations Engineer</option></select><small>Both titles can do every task.</small></label>`;
  // Campaign save the player can continue: the desktop app's own room (file in the user folder) or the
  // browser save. Free Build and Challenges never overwrite it.
  const desktop = globalThis.infraDesktop;
  async function saveInfo() {
    if (desktop) { const info = await roomInfo(); const c = info?.campaign; return c ? { ...c, where: 'room' } : null; }
    const d = localSave(); if (!d) return null; const o = d.operations; return { name: o.name, level: o.levels?.current ?? null, track: o.track || (o.enterprise ? 'contracts' : 'projects'), budget: o.budget, where: 'browser', data: d };
  }
  const levelText = c => c.level === null || c.level === undefined ? 'Older save · continues as levels' : c.level > 10 ? 'Campaign complete' : 'Level ' + c.level + ' · ' + LEVELS[c.level].title;
  let saved = null;
  // Payday mode: its own save (room payday-save.json / browser infra-local-payday-v1), never the Campaign's.
  let paydaySaved = null;
  async function paydayInfo() {
    const info = await roomInfo().catch(() => null);
    if (desktop || info?.payday) { const p = info?.payday; if (p) return { ...p, where: 'room' }; if (desktop) return null; }
    try { const d = JSON.parse(localStorage.getItem('infra-local-payday-v1') || 'null'); if (d?.operations?.payday) return { name: d.operations.name, level: d.operations.levels?.current ?? null, where: 'browser', data: d }; } catch {}
    return null;
  }
  async function renderStart() {
    saved = await saveInfo().catch(() => null); paydaySaved = await paydayInfo().catch(() => null);
    const card = (k, title, text, cls = '', tag = '') => `<button data-start="${k}" class="ss-card ${cls}">${tag ? `<em>${tag}</em>` : ''}<strong>${title}</strong><span>${text}</span></button>`;
    $('ss-grid').innerHTML = (saved ? card('continue', 'Continue Campaign', esc(saved.name) + ' · ' + esc(levelText(saved)) + ' · $' + (saved.budget || 0).toLocaleString(), 'ss-primary', 'Continue') + card('new', 'New Campaign', 'Start again at Level 0 on an empty site') : card('new', 'New Campaign', 'Levels 0–10 · from an empty site to a commissioned enterprise', 'ss-primary', 'Recommended'))
      + card('host', 'LAN Host Campaign', 'Host the campaign for up to 12 engineers on your network') + card('join', 'Join LAN', 'Join a room hosted on your network')
      + card('payday', 'Payday · Work & Casino', paydaySaved ? 'Continue ' + esc(paydaySaved.name) + ' · ' + esc(levelText(paydaySaved)) + ' · do jobs, earn salary, gamble' : 'Do the jobs, get paid, then hit the casino · solo or LAN', '', 'New mode')
      + card('free', 'Free Build', 'A separate, fully built sandbox facility · never touches your campaign') + card('challenges', 'Challenges', CHALLENGES.length + ' fault-repair exercises');
  }
  // True only when other engineers share this room; otherwise sandbox modes run locally and leave the save alone.
  const sharedRoom = () => lan.connected && (lan.players?.length || 1) > 1;
  async function joinLocalRoom() { if (lan.connected) return true; const info = await roomInfo(); return info?.localHost ? lan.join({ name: localStorage.getItem('infra-name') || 'Engineer', code: info.roomCode, hostKey: info.hostKey }, true) : false; }
  async function continueCampaign() {
    if (!saved) return newCampaign();
    if (saved.where === 'room') { await joinLocalRoom(); if (g().mode !== 'campaign' || g().payday) { const m = await send({ type: 'mode', mode: 'campaign', resume: true }); if (!/resumed/i.test(String(m))) { notify(m); return; } } return begin(); }
    lan.playSolo(); try { world.restore(saved.data); kit.refreshTargets?.(); } catch (e) { notify('Save could not load: ' + e.message); return; } begin();
  }
  function newCampaign() {
    subPanel(`<h2>New Campaign</h2><div class="ss-form"><label>Company name<input id="ss-name" maxlength="40" value="Northwind HQ"></label>${titlePicker()}<button id="ss-new" class="primary">Start Level 0</button></div>
     <p class="ss-note">You start in the receiving room of an empty site: no racks, switches, firewall, servers or internal cabling. Building power, the office cabling and the provider's street fibre are the only things already there.${desktop ? ' Saved automatically in your user folder (File → Show saves folder).' : ''}</p>`, el => {
      el.querySelector('#ss-new').addEventListener('click', async () => {
        if (saved && !confirm('Start a new campaign? Your current campaign (' + saved.name + ', ' + levelText(saved) + ') will be replaced. Use ' + (desktop ? 'File → Export' : 'Team → Save → Export') + ' first to keep a copy.')) return;
        if (desktop) await joinLocalRoom(); else lan.playSolo();
        engineering.setRole(el.querySelector('#ss-title').value);
        run(send({ type: 'mode', mode: 'campaign', track: 'levels', name: el.querySelector('#ss-name').value || 'Northwind HQ' }), () => { hintTier = {}; begin(); });
      });
    });
  }
  // Free Build / Challenges: local world unless a shared LAN room is running (then the host switches the room,
  // and the room keeps the campaign for "Continue hosted campaign").
  async function sandbox(action) {
    if (sharedRoom()) { if (!lan.canManageWorld) { notify('Host only · the host chooses the mode'); return false; } if (!confirm('Switch everyone in the room to ' + (action.mode === 'free' ? 'Free Build' : 'this challenge') + '? The campaign is kept and can be continued from LAN Host.')) return false; const m = await send(action); if (/Finish this task/.test(String(m))) { notify(m); return false; } return true; }
    lan.playSolo(); try { world.apply({ type: 'engineering', action }, actor()); } catch (e) { notify(e.message); return false; } kit.refreshTargets?.(); return true;
  }
  async function startSolo() { return saved ? continueCampaign() : newCampaign(); }
  async function startHost() {
    let hosted = null;
    if (desktop) { try { hosted = await desktop.hostLan(); } catch (e) { subPanel(`<h2>LAN Host Campaign</h2><p>Could not open the room on your network: ${esc(e.message)}</p>`); return; } }
    const info = await roomInfo();
    if (!info) { subPanel(`<h2>LAN Host Campaign</h2><p>Hosting needs the local room server. In the desktop app choose <strong>LAN Host</strong> from the launcher. From the web package run <code>node lan/server.mjs</code> and open the address it prints on this computer.</p>`); return; }
    if (!info.localHost && !(lan.connected && lan.canManageWorld)) { subPanel(`<h2>LAN Host Campaign</h2><p>This room already has a host, or this is not the host computer. Choose <strong>Join LAN</strong> instead.</p>`); return; }
    if (!lan.connected) await lan.join({ name: 'Host', code: info.roomCode, hostKey: info.hostKey }, true);
    setInvite(hosted);
    const w = g(), summary = world.remoteSummary || (w.mode === 'campaign' ? { name: w.name, level: w.levels?.current ?? null, budget: w.budget, active: true } : null), addrs = (hosted?.addresses || info.addresses || []).map(a => `<code>${esc(a)}</code>`).join(' ');
    subPanel(`<h2>LAN Host Campaign</h2><div class="ss-room"><div><span>Room code</span><strong>${esc(hosted?.roomCode || info.roomCode || lan.roomCode || '')}</strong></div><div><span>Friends open</span>${addrs || '<code>' + esc(location.host) + '</code>'}</div><div><span>Engineers</span><strong>${lan.players?.length || 1}/12</strong></div></div>
     ${summary ? `<div class="ss-save"><strong>${esc(summary.name)}</strong><span>${esc(levelText(summary))} · ${usdMoney((summary.budget || 0))}</span><button id="ss-host-continue" class="primary">Continue hosted campaign</button></div>` : ''}
     <div class="ss-form"><label>Company name<input id="ss-name" maxlength="40" value="LAN HQ"></label>${titlePicker()}<button id="ss-host-new" class="${w.mode === 'campaign' ? '' : 'primary'}">Start new campaign · Level 0</button></div>
     <p class="ss-note">The campaign is saved on this computer (the host). Guests join with the room code and can do every task; only you choose the mode and saves. Keep this window open while hosting.${desktop ? ' If your firewall asks, allow Infra Simulator on private networks. Stop hosting from Team at any time.' : ''}</p>`, el => {
      el.querySelector('#ss-host-continue')?.addEventListener('click', async () => { if (g().mode !== 'campaign' || g().payday) { const m = await send({ type: 'mode', mode: 'campaign', resume: true }); if (!/resumed/i.test(String(m))) { notify(m); return; } } begin(); });
      el.querySelector('#ss-host-new').addEventListener('click', () => { if (summary && !confirm('Replace the hosted campaign with a new one? The previous save is overwritten.')) return; engineering.setRole(el.querySelector('#ss-title').value); run(send({ type: 'mode', mode: 'campaign', track: 'levels', name: el.querySelector('#ss-name').value || 'LAN HQ' }), () => { hintTier = {}; begin(); }); });
    });
  }
  async function startPayday() {
    const info = await roomInfo().catch(() => null), canHost = !!desktop || !!info?.localHost || (lan.connected && lan.canManageWorld);
    subPanel(`<h2>Payday · Work &amp; Casino</h2>
     ${paydaySaved ? `<div class="ss-save"><strong>${esc(paydaySaved.name)}</strong><span>${esc(levelText(paydaySaved))}${paydaySaved.wallets ? ' · ' + paydaySaved.wallets + ' wallets' : ''}</span><button id="ss-pay-continue" class="primary">Continue Payday</button></div>` : ''}
     <div class="ss-form"><label>Company name<input id="ss-name" maxlength="40" value="Payday Inc."></label>${titlePicker()}<button id="ss-pay-solo" class="${paydaySaved ? '' : 'primary'}">New Payday · solo</button>${canHost ? '<button id="ss-pay-host">New Payday · host on LAN</button>' : ''}</div>
     <p class="ss-note">The same Levels 0–10 as the Campaign, but every engineer has a wallet. Each job you finish pays you a salary (racking, mounting, patching, power…), and every level pays everyone a bonus. Spend it in the <strong>casino</strong> through the door in the north wall of the server hall: blackjack, roulette, Hold'em, slots, the lotto machine, the bar and the weapon market. Money is in tögrög (₮). Lend money to teammates from the casino's Wallet tab. Everyone starts with 1,800,000₮ — engineers named <strong>Darja</strong> start with 36,000,000₮. Drinks at the bar (luck, good or bad) and guns at the weapon market cost a fortune: guns from 90,000,000₮. Play money only. Your Campaign is not affected.</p>`, el => {
      el.querySelector('#ss-pay-continue')?.addEventListener('click', async () => {
        if (paydaySaved.where === 'room') { await joinLocalRoom(); if (g().mode !== 'campaign' || !g().payday) { const m = await send({ type: 'mode', mode: 'campaign', resume: true, payday: true }); if (!/resumed/i.test(String(m))) { notify(m); return; } } return begin(); }
        lan.playSolo(); try { world.restore(paydaySaved.data); kit.refreshTargets?.(); } catch (e) { notify('Save could not load: ' + e.message); return; } begin();
      });
      const start = async host => {
        if (paydaySaved && !confirm('Start a new Payday game? The current Payday save (' + paydaySaved.name + ') will be replaced. Your Campaign is not affected.')) return;
        if (host) { let hosted = null; if (desktop) { try { hosted = await desktop.hostLan(); } catch (e) { notify(e.message); return; } } const i = await roomInfo(); if (!lan.connected && i?.localHost) await lan.join({ name: localStorage.getItem('infra-name') || 'Host', code: i.roomCode, hostKey: i.hostKey }, true); await setInvite(hosted); }
        else if (desktop) await joinLocalRoom(); else lan.playSolo();
        engineering.setRole(el.querySelector('#ss-title').value);
        run(send({ type: 'mode', mode: 'campaign', track: 'levels', payday: true, name: el.querySelector('#ss-name').value || 'Payday Inc.' }), () => { hintTier = {}; begin(); if (host) notify('Hosting Payday · friends: Join LAN → ' + (invite?.addrs?.[0] || 'your address') + ' · code ' + (invite?.code || lan.roomCode || '')); });
      };
      el.querySelector('#ss-pay-solo').addEventListener('click', () => start(false));
      el.querySelector('#ss-pay-host')?.addEventListener('click', () => start(true));
    });
  }
  async function startJoin() {
    const info = await roomInfo(), params = new URLSearchParams(globalThis.location?.search || '');
    subPanel(`<h2>Join LAN</h2><div class="ss-form"><label>Your name<input id="ss-jname" maxlength="20" value="${esc(params.get('name') || localStorage.getItem('infra-name') || 'Engineer')}"></label><label>Room code<input id="ss-code" maxlength="12" autocomplete="off" value="${esc(params.get('join') || '')}" placeholder="From the host"></label>${info && !desktop ? '' : `<label>Host address<input id="ss-addr" placeholder="192.168.1.20:8080"></label>`}${titlePicker('ss-jtitle')}<button id="ss-join" class="primary">Join room</button></div><p class="ss-note">${info ? 'You are on ' + esc(location.host) + '. ' : ''}Guests share the host's world: you can do every task, but only the host chooses the mode and saves.</p><p id="ss-join-status" class="ss-note"></p>`, el => {
      el.querySelector('#ss-join').addEventListener('click', async () => {
        const name = el.querySelector('#ss-jname').value, code = el.querySelector('#ss-code').value, addr = el.querySelector('#ss-addr')?.value.trim();
        if (addr) {
          const status = el.querySelector('#ss-join-status'); let url;
          try { url = new URL((/^https?:/.test(addr) ? '' : 'http://') + addr); } catch { status.textContent = 'That address is not valid · type it as shown on the host, e.g. 192.168.1.20:8080'; return; }
          if (!url.port) url.port = '8080';                                                                   // the desktop host's port
          // Check the host answers before leaving this screen (a wrong address or port used to leave a black window).
          status.textContent = 'Connecting to ' + url.host + '…';
          const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 5000);
          const reachable = await fetch(url.origin + '/api/room', { mode: 'no-cors', signal: ctl.signal }).then(() => true, () => false); clearTimeout(timer);
          if (!reachable) { status.innerHTML = `<b>Can't reach ${esc(url.host)}.</b> Use the address and port in the host's invite bar (top of their screen), be on the same network, and on the host allow Infra Simulator through the firewall (private networks).`; return; }
          url.pathname = '/'; url.search = '?join=' + encodeURIComponent(code) + '&name=' + encodeURIComponent(name); location.href = url.href; return;
        }
        engineering.setRole(el.querySelector('#ss-jtitle').value);
        const ok = await lan.join({ name, code, hostKey: '' }); el.querySelector('#ss-join-status').textContent = ok ? 'Connected' : lan.status || 'Could not join';
        if (ok) begin();
      });
    });
    if (params.get('join') && info) $('ss-join')?.click();
  }
  function creditsHTML() {
    return `<div class="ss-credits"><h2>Credits</h2><p class="ss-credits-by">Infra Simulator<br>created by</p><p class="ss-credits-name">Darja</p>
<dl><dt>Game design</dt><dd>Darja</dd><dt>Development</dt><dd>Darja</dd><dt>Campaign levels 0–10</dt><dd>Darja</dd><dt>Characters and world</dt><dd>Darja</dd></dl>
<p class="ss-note">Built with Three.js and Electron.<br>Thank you for playing, and to everyone who tested it on their LAN.</p></div>`;
  }
  function startChallenges() {
    subPanel(`<h2>Challenges</h2><p class="ss-note">Each challenge builds a healthy facility, then injects a fault when you press Begin. Diagnose it from alarms, GUIs and CLIs, repair it, and the check completes on its own.</p><div class="ss-challenges">${CHALLENGES.map((n, i) => `<button data-ch="${i}"><small>${String(i + 1).padStart(2, '0')}</small>${esc(n)}</button>`).join('')}</div>`, el => {
      el.querySelectorAll('[data-ch]').forEach(b => b.addEventListener('click', async () => { if (await sandbox({ type: 'mode', mode: 'challenge', index: +b.dataset.ch })) { begin(); engineering.panel('projects'); } }));
    });
  }
  $('start-screen').addEventListener('click', async e => {
    const b = e.target.closest('[data-start]'); if (!b) return;
    const k = b.dataset.start; $('start-screen').querySelectorAll('.ss-card').forEach(x => x.classList.toggle('active', x === b));
    if (k === 'continue') continueCampaign(); else if (k === 'new') newCampaign(); else if (k === 'solo') startSolo();
    else if (k === 'host') startHost(); else if (k === 'join') startJoin(); else if (k === 'challenges') startChallenges(); else if (k === 'payday') startPayday();
    else if (k === 'free') { if (await sandbox({ type: 'mode', mode: 'free' })) begin(); }
    else if (k === 'settings') { showStart(false); panel('settings'); }
    else if (k === 'inspect') { showStart(false); document.body.classList.remove('in-game'); exit(); }
    else if (k === 'credits') subPanel(creditsHTML());
  });

  // ---- Panel ---------------------------------------------------------------------------------------------
  function panel(which = 'objective') { if (engineering.busy && which !== 'objective' && which !== 'settings') { notify('Put the item down first · G'); } tab = which; open = true; engineering.close(); kit.hide(); officeUI?.close?.(); if (document.pointerLockElement) document.exitPointerLock(); $('campaign-panel').hidden = false; document.body.classList.add('cp-open'); render(); }
  function close() { open = false; $('campaign-panel').hidden = true; document.body.classList.remove('cp-open'); }
  $('cp-close').onclick = () => { close(); if (!startOpen) enter(); };

  function levelTrack(st) {
    return `<ol class="lv-track">${LEVELS.map(l => { const e = g().levels.earned[l.id], cur = g().levels.current === l.id, rep = st.repairs.some(r => r.id === l.id); return `<li class="${e ? 'done' : ''} ${cur ? 'cur' : ''} ${rep ? 'repair' : ''}" title="${esc(l.title + ' · ' + l.goal)}"><span>${l.id}</span></li>`; }).join('')}</ol>`;
  }
  function objective() {
    const G = g();
    if (!levels()) {
      if (G.mode === 'challenge') return `<h2>Challenge</h2><p>${esc(CHALLENGES[G.challenge?.index] || '')}</p><button data-adv="projects" class="primary">Open challenge controls</button>`;
      if (G.mode === 'free') return `<h2>Free Build</h2><p>A configured facility with every product unlocked. There are no objectives here; your campaign is not affected.</p><button data-go="start">Back to the start screen</button>`;
      return `<h2>Campaign</h2><p>This save uses an older campaign track.</p><button data-adv="projects">Open projects</button>`;
    }
    const st = C.status(); if (!st) return '';
    if (st.complete) { const s = C.summary(); return `<h2>Campaign complete · ${esc(G.name)}</h2>${levelTrack(st)}<p>All eleven levels earned. The facility keeps running; later failures still appear as repair objectives.</p><p class="lv-credit">Infra Simulator · created by <strong>Darja</strong>. Thank you for playing.</p><div class="lv-summary"><div><b>${s.devices}</b><span>devices</span></div><div><b>${s.racks}</b><span>racks</span></div><div><b>${s.vlans}</b><span>VLANs</span></div><div><b>${s.services}</b><span>services</span></div><div><b>${s.backups}</b><span>backups</span></div><div><b>${usdMoney(s.budget)}</b><span>budget</span></div></div>${repairs(st)}<h3>Operations log</h3><ul class="lv-log">${s.history.map(h => `<li>${esc(new Date(h.at).toLocaleTimeString())} · ${esc(h.message)}</li>`).join('')}</ul>`; }
    const L = st.level, tier = hintTier[L.id] || 0, next = st.next;
    const exercise = { 7: ['data-incident', 'Start guided data incident', 'incident'], 8: ['fault-drill', 'Start the fault drill', 'drill'], 9: ['failover-test', 'Run the planned failover test', 'failover-test'], 10: ['final-incident', 'Start the final incident', 'final'] }[L.id];
    const exReady = exercise && (!next || next.id === exercise[2] || (L.id === 9 && next.id === 'failover-test') || (L.id === 10 && next.id === 'final'));
    return `<div class="lv-head"><div><span class="lv-kicker">LEVEL ${L.id} OF 10 · ${st.done}/${st.total} CHECKS</span><h2>${esc(L.title)}</h2><p class="lv-goal">${esc(L.goal)}</p></div><div class="lv-reward"><span>Reward</span><b>${usdMoney(L.reward)}</b><small>Unlocks: ${esc(L.unlock)}</small></div></div>
     ${levelTrack(st)}
     <details data-key="why" class="lv-why" ${tier ? '' : 'open'}><summary>Why it matters</summary><p>${esc(L.why)}</p></details>
     ${next ? `<div class="lv-next"><span>NEXT</span><strong>${esc(next.label)}</strong><p>${esc(next.detail)}</p>${targetOf(next) ? `<button data-go="target">Show me where · ${esc(targetOf(next).label)}</button>` : ''}${actionFor(next)}${next.fix ? `<details><summary>Technical details</summary><code>${esc(next.fix)}</code></details>` : ''}</div>` : '<div class="lv-next ok"><strong>All checks pass</strong><p>The customer accepts the level within a second.</p></div>'}
     ${exReady ? `<button class="primary" data-exercise="${exercise[0]}">${exercise[1]}</button>` : ''}
     <div class="lv-hints"><span>Hints</span>${[1, 2, 3].map(t => `<button data-hint="${t}" ${t > tier + 1 ? 'disabled' : ''} aria-pressed="${t <= tier}">${['Where / what', 'Connections / settings', 'Specific diagnosis'][t - 1]}</button>`).join('')}${tier ? `<ol class="lv-hint-text">${[L.hints[0], L.hints[1], next ? next.label + ': ' + next.detail + (next.fix ? ' · ' + next.fix : '') : 'Everything passes.'].slice(0, tier).map(h => `<li>${esc(h)}</li>`).join('')}</ol>` : ''}</div>
     <h3>Checks</h3><ol class="lv-checks">${L.checks.map(c => `<li class="${c.ok ? 'ok' : c === next ? 'next' : ''}"><i>${c.ok ? '✓' : c === next ? '▶' : '○'}</i><span><strong>${esc(c.label)}</strong><small>${esc(c.detail)}</small></span></li>`).join('')}</ol>
     ${repairs(st)}`;
  }
  function repairs(st) { return st.repairs.length ? `<div class="lv-repairs"><h3>Repair objectives</h3><p>These levels are still earned, but their live checks fail now.</p>${st.repairs.map(r => `<p><b>Level ${r.id} · ${esc(r.title)}</b> · ${esc(r.check.label)} · ${esc(r.check.detail)}</p>`).join('')}</div>` : ''; }
  // Inline controls for steps that are done at a patch panel or a kiosk rather than on a device.
  function actionFor(c) {
    const sws = ops.available().filter(n => n.spec && n.type === 'switch');
    if (c.id === 'admin-pc-patched' || /^net-(sales|finance|engineering)$/.test(c.id) && /outlet|disconnected|patch/i.test(c.detail)) {
      const pcID = c.id === 'admin-pc-patched' ? 'ADMIN-PC' : 'F1-' + c.id.slice(4) + '-PC';
      return sws.length ? `<div class="lv-inline" data-patch="${pcID}"><span>Patch panel · ${esc(pcID)}</span>${pcID === 'ADMIN-PC' ? `<select data-f="switch">${sws.map(n => `<option value="${esc(n.id)}">${esc(n.id)}</option>`).join('')}</select>` : ''}<select data-f="port">${freePorts(pcID === 'ADMIN-PC' ? sws[0] : byId[world.office.state.bindings.access[1]]).map(([i, n]) => `<option value="${i}">${esc(n)}</option>`).join('')}</select><button data-do="patch">Patch (uses a CAT6 lead)</button></div>` : '';
    }
    if (c.where === 'procurement' || /Order |order /.test(c.detail)) return `<button data-tab="inventory">Open orders</button>`;
    if (c.where === 'laptop') return `<button data-go="laptop">Open the laptop</button> <button data-go="company">Company admin (office)</button>`;
    return '';
  }
  function freePorts(sw) { if (!sw) return []; const s = world.office.state; return sw.ports.map((p, i) => [i, p]).filter(([i, p]) => !p.link && !p.service && !p.reserved && p.medium === 'Ethernet' && p.speed === 1 && !/MGMT/.test(p.name) && !Object.values(s.pcs).some(x => (x.switch || s.bindings.access[x.floor]) === sw.id && x.port === i && x.connected !== false)).slice(0, 48).map(([i, p]) => [i, p.name]); }

  function inventory() {
    const G = g(), items = G.stock, byOrder = new Map();
    const catalog = CATALOG.filter(c => !c.legacy && !c.providerOnly && (G.mode !== 'challenge'));
    const cats = [...new Set(catalog.map(c => c.category))].sort((a, b) => (CATEGORY_LEVEL[a] ?? 0) - (CATEGORY_LEVEL[b] ?? 0));
    const lockedAt = cat => levels() ? CATEGORY_LEVEL[cat] ?? 0 : 0, unlocked = cat => !levels() || lockedAt(cat) <= G.levels.current;
    const officeLocked = kind => levels() && (OFFICE_ITEM_LEVEL[kind] ?? 0) > G.levels.current;
    return `<h2>Inventory & orders</h2><p class="cp-muted">Budget <b>${usdMoney(G.budget)}</b> · deliveries arrive in the receiving room (left of the entrance) in about 10 seconds.</p>
     <h3>In hand and in receiving</h3>${items.length ? `<div class="inv-grid">${items.map(s => { const c = CATALOG.find(c => c.id === s.sku); const where = s.holders.includes(actor()) ? 'In your hands' : s.holders.length ? 'Carried by a teammate' : s.floor ? 'On the floor' : 'In its box'; return `<div class="inv-item ${s.holders.includes(actor()) ? 'held' : ''}"><strong>${esc(c?.name || s.sku)}</strong><small>${esc(where)}${s.length && c?.type === 'cable' ? ' · ' + s.length + ' m' : ''}${s.anchor ? ' · end A plugged' : ''}</small></div>`; }).join('')}</div><p class="cp-muted">Pick items up in the world with E (walk to the box or floor item). G puts the item in your hands down.</p>` : '<p class="cp-muted">Nothing received yet.</p>'}
     <h3>Deliveries</h3>${G.orders.length ? `<ul class="inv-orders">${G.orders.slice(-12).reverse().map(o => `<li>${esc(o.quantity + ' × ' + (CATALOG.find(c => c.id === o.sku)?.name || o.sku))}<span>${o.opened ? 'Unboxed' : Date.now() >= o.arrives ? 'Arrived · receiving room' : 'On the way · ' + Math.max(1, Math.ceil((o.arrives - Date.now()) / 1000)) + ' s'}</span></li>`).join('')}</ul>` : '<p class="cp-muted">No orders.</p>'}
     <h3>Order equipment</h3><div class="inv-shop">${cats.map(cat => `<details data-key="cat-${esc(cat)}" ${cat === 'Racks' && levels() && G.levels.current === 0 ? 'open' : ''}><summary>${esc(cat)}${unlocked(cat) ? '' : ' · 🔒 level ' + lockedAt(cat)}</summary>${catalog.filter(c => c.category === cat).map(c => `<div class="inv-row"><span>${esc(c.name)}<small>${c.units ? c.units + 'U · ' : ''}${c.speed ? c.speed + 'G ' + esc(c.medium || '') : ''}</small></span><b>${usdMoney(c.price)}</b>${c.type === 'cable' ? `<select data-key="len-${c.id}" data-len="${c.id}">${[3, 5, 10, 20, 40].map(m => `<option ${m === 5 ? 'selected' : ''}>${m}</option>`).join('')}</select>` : ''}<button data-order="${c.id}" ${unlocked(cat) ? '' : 'disabled'}>Order</button></div>`).join('')}</details>`).join('')}
     <details data-key="office-items"><summary>Office & services</summary>${OFFICE_CATALOG.map(c => `<div class="inv-row"><span>${esc(c.name)}</span><b>${usdMoney(c.price)}</b><button data-office-order="${c.id}" ${officeLocked(c.kind) ? 'disabled' : ''}>${officeLocked(c.kind) ? '🔒 level ' + OFFICE_ITEM_LEVEL[c.kind] : 'Order'}</button></div>`).join('')}<p class="cp-muted">Office items arrive in the office stores; install them from Laptop → Company admin → Procurement.</p></details>
     <details data-key="isp"><summary>ISP circuit</summary><p class="cp-muted">Circuits are ordered for a FortiGate from Company admin → Infrastructure (binding) or Advanced → Procurement. The provider router ships to receiving.</p><button data-adv="procurement">Open ISP ordering</button></details></div>`;
  }
  function mapView() {
    const G = g(), W = 900, H = 420, X = x => (x - ROOM.minX) / (ROOM.maxX - ROOM.minX) * W, Z = z => (z - ROOM.minZ) / (ROOM.maxZ - ROOM.minZ) * H;
    const st = levels() ? C.status() : null, t = st?.next ? targetOf(st.next) : null, players = (lan.players || []).filter(p => p.pose?.active);
    const rackRects = [...(G.emptySite ? [] : [{ id: 'R01', x: -9 }, { id: 'R02', x: -3 }, { id: 'R03', x: 3 }, { id: 'R04', x: 9 }, { id: 'R05', x: 22 }, { id: 'R06', x: 28 }]), ...G.racks].map(r => `<rect x="${X(r.x - 1.8)}" y="${Z((r.z || 0) - 3)}" width="${X(r.x + 1.8) - X(r.x - 1.8)}" height="${Z(3) - Z(-3)}" class="m-rack"><title>${esc(r.id)}</title></rect><text x="${X(r.x)}" y="${Z((r.z || 0) + 4.8)}" class="m-small">${esc(r.id)}</text>`).join('');
    const pads = G.emptySite ? RACK_PADS.filter(p => !G.racks.some(r => r.id === p.rack) && p.core).map(p => `<rect x="${X(p.x - 1.8)}" y="${Z(p.z - 3)}" width="${X(p.x + 1.8) - X(p.x - 1.8)}" height="${Z(3) - Z(-3)}" class="m-pad"/>`).join('') : '';
    const cpe = ops.available().find(n => n.type === 'isp');
    const label = (x, z, text, cls = '') => `<text x="${X(x)}" y="${Z(z)}" class="m-label ${cls}">${esc(text)}</text>`;
    return `<h2>Map</h2><p class="cp-muted">Click a place to put a marker on the floor.</p><svg id="site-map" viewBox="0 0 ${W} ${H}">
     <rect x="${X(-44)}" y="${Z(-28)}" width="${X(-26) - X(-44)}" height="${Z(55) - Z(-28)}" class="m-room m-recv" data-place="receiving"/>${label(-35, -22, 'RECEIVING')}
     <rect x="${X(-26)}" y="${Z(-28)}" width="${X(72) - X(-26)}" height="${Z(55) - Z(-28)}" class="m-room" data-place="rack-row"/>${label(20, -22, 'DATA HALL · RACK ROWS')}
     <rect x="${X(72)}" y="${Z(-28)}" width="${X(164) - X(72)}" height="${Z(55) - Z(-28)}" class="m-room m-office" data-place="office"/>${label(118, -22, 'OFFICE')}
     ${pads}${rackRects}
     <circle cx="${X(PROCUREMENT.x)}" cy="${Z(PROCUREMENT.z)}" r="7" class="m-poi" data-place="procurement"/>${label(PROCUREMENT.x + 10, PROCUREMENT.z + 1, 'Procurement')}
     <circle cx="${X(DELIVERY.x)}" cy="${Z(DELIVERY.z)}" r="7" class="m-poi" data-place="receiving"/>${label(DELIVERY.x + 9, DELIVERY.z + 1, 'Deliveries')}
     <circle cx="${X(80)}" cy="${Z(19)}" r="7" class="m-poi" data-place="admin-pc"/>${label(80, 25, 'Central PC')}
     ${cpe ? `<circle cx="${X(cpe.pos.x)}" cy="${Z(cpe.pos.z - 6)}" r="7" class="m-isp" data-place="isp"/>${label(cpe.pos.x, cpe.pos.z - 10, 'ISP handoff')}` : label(-9, -12, 'ISP fibre enters behind R01', 'm-dim')}
     ${t ? `<circle cx="${X(t.x)}" cy="${Z(t.z)}" r="11" class="m-target"/>${label(t.x, t.z + 7, 'Objective · ' + t.label, 'm-tl')}` : ''}
     ${players.map(p => `<circle cx="${X(p.pose.x)}" cy="${Z(p.pose.z)}" r="5" fill="#${Number(p.color).toString(16).padStart(6, '0')}"><title>${esc(p.name)}</title></circle>`).join('')}
     <circle cx="${X(camera.position.x)}" cy="${Z(camera.position.z)}" r="6" class="m-me"/>
    </svg><div class="map-legend"><span class="k-me"></span>You <span class="k-target"></span>Objective <span class="k-rack"></span>Rack <span class="k-pad"></span>Empty rack bay</div>`;
  }
  function laptop() {
    const tools = kit.assignedTools || [];
    return `<h2>Laptop & consoles</h2><p class="cp-muted">Equip a service lead once; then <kbd>1</kbd> holds the console cable and <kbd>2</kbd> the service Ethernet lead. Aim at a device's CONSOLE or SERVICE LAN port and press E.</p><div class="cp-row"><button data-equip="1" class="${tools.includes(1) ? '' : 'primary'}">${tools.includes(1) ? '✓ Console cable equipped (1)' : 'Equip console cable → slot 1'}</button><button data-equip="2">${tools.includes(2) ? '✓ Service Ethernet equipped (2)' : 'Equip service Ethernet → slot 2'}</button></div><div class="lp-grid" style="margin-top:14px">
     <button data-go="laptop"><strong>Service laptop</strong><span>L in the world · console cable (slot 1) and service Ethernet (slot 2) · SSH and device GUIs</span></button>
     <button data-go="company"><strong>Company admin</strong><span>FortiGate VLANs, DHCP, policies, Wi-Fi, services, storage binding, monitoring</span></button>
     <button data-go="central"><strong>Central management PC</strong><span>The office admin workstation · manage devices over VLAN 70</span></button>
     <button data-adv="configure"><strong>Device console / GUI list</strong><span>Every installed device with its setup guide</span></button>
     <button data-adv="monitoring"><strong>Monitoring & alarms</strong><span>Device alarms from the device logic; click through to the fix page</span></button>
     <button data-adv="power"><strong>Power / PDUs</strong><span>Per-outlet load, breakers, PDU CLI</span></button>
     <button data-adv="noc"><strong>NOC map</strong><span>Live topology and failed links</span></button>
     <button data-adv="documentation"><strong>Documentation</strong><span>Rack elevation, cable matrix, IP plan</span></button></div>`;
  }
  function team() {
    const list = lan.players || [], host = lan.connected && lan.canManageWorld;
    return `<h2>Team</h2>${lan.connected ? `<p>${host ? '<b>You are the host.</b> The campaign is saved on this computer.' : 'Connected to the host · shared world.'} ${lan.roomCode ? 'Room code <code>' + esc(lan.roomCode) + '</code>' : ''}${host && invite?.addrs?.length ? ' · friends join at ' + invite.addrs.map(a => '<code>' + esc(a) + '</code>').join(' or ') : ''}</p><ul class="team-list">${list.map(p => `<li><i style="background:#${Number(p.color).toString(16).padStart(6, '0')}"></i>${esc(p.name)}${p.id === lan.selfID ? ' (you)' : ''}<small>${esc(p.role === 'operations' ? 'Operations Engineer' : 'Field Engineer')} · ${p.pose?.active ? 'in the facility' : 'in menus'}</small></li>`).join('')}</ul><p class="cp-muted">Enter or T opens team chat · middle mouse pings a spot for everyone.</p>${host ? (desktop ? '<button data-go="stop-hosting">Stop hosting</button>' : '') : '<button data-go="leave">Leave the room · play solo</button>'}` : `<p>Solo. Choose <b>LAN Host Campaign</b> on the start screen to invite others.</p>`}
     <h3>Your title</h3><div class="cp-row"><button data-title="field" aria-pressed="${engineering.role === 'field'}">Field Engineer</button><button data-title="operations" aria-pressed="${engineering.role === 'operations'}">Operations Engineer</button></div><p class="cp-muted">Titles are cosmetic: both can do every task. Company credentials, physical reach and host controls are checked separately.</p>
     ${(!lan.connected || host) ? `<h3>Save</h3><div class="cp-row"><button data-adv="saves">Export / import / checkpoints</button></div><p class="cp-muted">${lan.connected ? 'The host autosaves after every change.' : 'Solo campaigns autosave in this browser (desktop app: in your user folder).'}</p>` : ''}
     <h3>Session</h3><div class="cp-row"><button data-go="start">Start screen</button></div>`;
  }
  function settingsView() {
    const p = settings;
    return `<h2>Settings</h2><div class="set-grid">
     <label>Mouse sensitivity<input data-set="look" type="range" min="0.3" max="2.5" step="0.1" value="${p.look}"></label>
     <label>Walk speed<input data-set="speed" type="range" min="0.7" max="1.5" step="0.05" value="${p.speed}"></label>
     <label>Field of view · ${p.fov}°<input data-set="fov" type="range" min="60" max="100" value="${p.fov}"></label>
     <label>Text size<select data-set="uiScale">${[1, 1.15, 1.3].map(v => `<option ${p.uiScale === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
     <label>Graphics<select data-set="graphics">${['Low', 'Medium', 'High'].map(v => `<option ${p.graphics === v ? 'selected' : ''}>${v}</option>`).join('')}</select><small>Low: fastest, sharp text kept · Medium: balanced · High: full display density</small></label>
     <label>Resolution scale<select data-set="resolutionScale">${[[1, '100 %'], [.85, '85 %'], [.7, '70 % (fastest)']].map(([v, t]) => `<option value="${v}" ${+(p.resolutionScale ?? 1) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
     <label>Frame rate limit<select data-set="fpsCap">${[[0, 'Match display'], [60, '60 FPS'], [30, '30 FPS (battery)']].map(([v, t]) => `<option value="${v}" ${+(p.fpsCap || 0) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
     <label>Guidance<select data-set="assistance">${['Off', 'Minimal hints', 'Guided'].map(v => `<option ${p.assistance === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
     ${['toggleSprint', 'toggleCrouch', 'headBob', 'invertY', 'showFPS', 'showControls'].map(k => `<label class="chk"><input type="checkbox" data-set="${k}" ${p[k] ? 'checked' : ''}> ${({ toggleSprint: 'Toggle run', toggleCrouch: 'Toggle crouch', headBob: 'Head bob', invertY: 'Invert mouse Y', showFPS: 'Show FPS', showControls: 'Show control hints' })[k]}</label>`).join('')}</div>
     <h3>Controls</h3><table class="ctl"><tbody>${[['W A S D', 'Walk'], ['Shift', 'Run'], ['C / Ctrl', 'Crouch (low ports)'], ['Q', 'Raise view (top of rack)'], ['Mouse', 'Look'], ['E', 'The action shown under the crosshair'], ['G', 'Put down what you carry'], ['X', 'Cancel: return a loose cable end / unplug the laptop'], ['R', 'Remove a device or optic (hands empty)'], ['F', 'Inspect what you aim at'], ['V', 'Service action (clean fibre, provider ticket, re-mount)'], ['L', 'Service laptop'], ['1 / 2', 'Console cable / service Ethernet'], ['J', 'Objective'], ['I', 'Inventory & orders'], ['M', 'Map'], ['H', 'Next hint'], ['Enter / T', 'Team chat'], ['Esc', 'Menu']].map(([k, v]) => `<tr><td><kbd>${k}</kbd></td><td>${v}</td></tr>`).join('')}</tbody></table>
     <div class="cp-row"><button data-go="unstuck">Return to a clear aisle</button><button data-go="inspect">Orbit inspect view</button><button data-go="diagnostics">Copy performance diagnostics</button></div><p class="cp-muted">Diagnostics contain the graphics hardware, settings, frame times and mode, never names, passwords, room codes or saves. Turn on “Show FPS” for the live overlay.</p>`;
  }

  function render() {
    if (!open) return;
    $('cp-title').textContent = levels() ? 'CAMPAIGN · ' + g().name : g().mode === 'free' ? 'FREE BUILD' : g().mode === 'challenge' ? 'CHALLENGE' : 'CAMPAIGN';
    $('cp-context').textContent = (lan.connected ? 'LAN · ' + (lan.canManageWorld ? 'host' : 'guest') : 'Solo') + ' · $' + g().budget.toLocaleString();
    $('cp-nav').innerHTML = TABS.map(([id, name, key]) => `<button data-tab="${id}" aria-pressed="${tab === id}">${name}${key ? ` <kbd>${key}</kbd>` : ''}</button>`).join('') + '<button data-tab="advanced" class="cp-adv">Advanced ▸</button>';
    const body = { objective, inventory, map: mapView, laptop, team, settings: settingsView }[tab], el = $('cp-body');
    // Keep what the player opened or chose (sections, cable lengths, scroll) across the live refresh.
    const keep = {}; el.querySelectorAll?.('[data-key]').forEach(x => keep[x.dataset.key] = x.tagName === 'DETAILS' ? x.open : x.value); const scroll = el.scrollTop, same = el.dataset.tab === tab;
    el.innerHTML = tab === 'advanced' ? `<h2>Advanced</h2><p class="cp-muted">The full engineering workspace.</p><div class="lp-grid">${['projects', 'procurement', 'equipment', 'configure', 'monitoring', 'power', 'noc', 'documentation', 'saves'].filter(x => x !== 'saves' || !lan.connected || lan.canManageWorld).map(x => `<button data-adv="${x}"><strong>${x[0].toUpperCase() + x.slice(1)}</strong></button>`).join('')}</div>` : body();
    el.dataset.tab = tab;
    if (same) { el.querySelectorAll?.('[data-key]').forEach(x => { const v = keep[x.dataset.key]; if (v === undefined) return; if (x.tagName === 'DETAILS') x.open = v; else x.value = v; }); el.scrollTop = scroll; }
  }
  $('campaign-panel').addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.tab) { tab = t.dataset.tab; render(); return; }
    if (t.dataset.adv) { close(); engineering.panel(t.dataset.adv); return; }
    if (t.dataset.hint) { const L = C.status()?.level; if (L) { hintTier[L.id] = Math.max(hintTier[L.id] || 0, +t.dataset.hint); render(); } return; }
    if (t.dataset.exercise) { run(campaign({ op: t.dataset.exercise })); return; }
    if (t.dataset.order) { const len = +(t.parentElement.querySelector('select')?.value || 5); run(send({ type: 'order', sku: t.dataset.order, quantity: 1, length: len })); return; }
    if (t.dataset.officeOrder) { run(office({ type: 'purchase', sku: t.dataset.officeOrder })); return; }
    if (t.dataset.title) { engineering.setRole(t.dataset.title); render(); return; }
    if (t.dataset.equip) { if (engineering.busy) { notify('Put the item down first · G'); return; } kit.equip(+t.dataset.equip); notify((t.dataset.equip === '1' ? 'Console cable' : 'Service Ethernet') + ' in hand · aim at the port and press E'); close(); enter(); return; }
    if (t.dataset.do === 'patch') { const box = t.closest('[data-patch]'), id = box.dataset.patch, sw = box.querySelector('[data-f=switch]')?.value, port = +box.querySelector('[data-f=port]').value; run(office({ type: 'patch-pc', id, port, ...(sw ? { switch: sw } : {}) })); return; }
    const go = t.dataset.go;
    if (go === 'target') { const st = C.status(); const tg = st?.next && targetOf(st.next); if (tg) { focus = { ...tg, until: Date.now() + 60000 }; close(); enter(); notify('Marker placed · ' + tg.label + ' · follow the green ring'); } }
    else if (go === 'laptop') { close(); enter(); kit.show(); }
    else if (go === 'company') { close(); officeUI.show('overview'); }
    else if (go === 'central') { close(); officeUI.show('central'); }
    else if (go === 'start') { close(); showStart(true); }
    else if (go === 'leave') { lan.playSolo(); render(); }
    else if (go === 'stop-hosting') { if (confirm('Stop hosting? Guests are disconnected; the campaign stays saved on this computer.')) { lan.playSolo(); desktop?.stopHosting().then(() => { notify('Hosting stopped · the room is local only'); render(); }); } }
    else if (go === 'unstuck') { close(); enter(); ctx.unstuck?.(); }
    else if (go === 'diagnostics') { const text = JSON.stringify(globalThis.__infraDiagnostics?.() || {}, null, 2); navigator.clipboard?.writeText(text).then(() => notify('Diagnostics copied · paste them into your message'), () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = 'infra-diagnostics.json'; a.click(); notify('Diagnostics saved as infra-diagnostics.json'); }); }
    else if (go === 'inspect') { close(); document.body.classList.remove('in-game'); exit(); }
  });
  $('campaign-panel').addEventListener('input', e => { const k = e.target.dataset.set; if (!k) return; settings[k] = e.target.type === 'checkbox' ? e.target.checked : ['look', 'speed', 'fov', 'uiScale', 'resolutionScale', 'fpsCap'].includes(k) ? +e.target.value : e.target.value; savePreferences(settings); if (k === 'fov') render(); });
  $('site-map') || 0;
  document.addEventListener('click', e => { const place = e.target.closest?.('#site-map [data-place]'); if (!place) return; const p = PLACES[place.dataset.place]; if (p?.x !== null && p) { focus = { x: p.x, z: p.z, label: p.label, until: Date.now() + 60000 }; notify('Marker · ' + p.label); render(); } });

  // ---- HUD -------------------------------------------------------------------------------------------------
  let focus = null;
  function hud() {
    const el = $('level-hud'), show = levels() && !startOpen && !open && settings.assistance !== 'Off';
    el.hidden = !show; { const eo = $('eng-objective'); if (eo) eo.dataset.hide = levels() ? '1' : ''; }
    if (!show) { marker.visible = !!focus && Date.now() < focus.until; if (marker.visible) marker.position.set(focus.x, 0, focus.z); return; }
    const st = C.status(); if (!st) return;
    if (st.complete) { el.innerHTML = `<div class="lh-top"><b>CAMPAIGN COMPLETE</b><span>11/11</span></div><div class="${st.repairs.length ? 'lh-repair' : 'lh-next ok'}">${st.repairs.length ? '⚠ ' + st.repairs.length + ' repair objective(s) · J' : '✓ Facility operational · J for the summary'}</div>`; marker.visible = false; return; }
    const next = st.next, t = next ? targetOf(next) : null, d = t ? Math.round(Math.hypot(camera.position.x - t.x, camera.position.z - t.z) * .18) : null;
    el.innerHTML = `<div class="lh-top"><b>LEVEL ${st.level.id} · ${esc(st.level.title.toUpperCase())}</b><span>${st.done}/${st.total}</span></div>${next ? `<div class="lh-next">▶ ${esc(next.label)}</div>${settings.assistance === 'Minimal hints' ? '' : `<div class="lh-why">${esc(next.detail)}</div>`}` : '<div class="lh-next ok">✓ All checks pass · accepting…</div>'}${t ? `<div class="lh-where">${d} m · ${esc(t.label)}</div>` : ''}${st.repairs.length ? `<div class="lh-repair">⚠ Repair: level ${st.repairs[0].id} · ${esc(st.repairs[0].check.label)}</div>` : ''}<div class="lh-keys">J objective · H hint · M map</div>`;
    const target = focus && Date.now() < focus.until ? focus : t;
    marker.visible = !!target; if (target) marker.position.set(target.x, 0, target.z);
  }
  let lastLevel = -1;
  function update(dt) {
    ring.rotation.z += dt * .8; beam.material.opacity = .18 + Math.sin(performance.now() / 300) * .08;
    if (performance.now() - lastHUD > 400) { lastHUD = performance.now(); hud(); if (inviteBar.hidden === (!!invite && lan.connected && lan.canManageWorld)) renderInvite(); if (open && ['objective', 'inventory', 'map', 'team'].includes(tab) && !$('campaign-panel').contains?.(document.activeElement)) render(); }
    const cur = levels() ? g().levels.current : -1;
    if (lastLevel >= 0 && cur > lastLevel && cur <= 11) { const def = LEVELS[lastLevel]; celebrate(def); }
    lastLevel = cur;
    $('resume-hint').hidden = !(document.body.classList.contains?.('walking') && !document.pointerLockElement && !open && !startOpen && !engineering.isOpen && !kit.isOpen && !officeUI?.isOpen && !lan.isOpen);
  }
  function celebrate(def) { if (!def) return; engineering.saveNow?.(); notify('LEVEL ' + def.id + ' COMPLETE · ' + def.title + ' · +$' + def.reward.toLocaleString() + ' · unlocked: ' + def.unlock); const el = document.createElement('div'); el.className = 'level-toast'; el.innerHTML = `<span>LEVEL ${def.id} COMPLETE</span><strong>${esc(def.title)}</strong><small>+${usdMoney(def.reward)} · Unlocked: ${esc(def.unlock)}</small>`; document.body.append(el); setTimeout(() => el.remove(), 5200); }
  function key(k) {
    if (startOpen) return false;
    if (k === 'j') { open && tab === 'objective' ? (close(), enter()) : panel('objective'); return true; }
    if (k === 'i' || k === 'tab') { open && tab === 'inventory' ? (close(), enter()) : panel('inventory'); return true; }
    if (k === 'm') { open && tab === 'map' ? (close(), enter()) : panel('map'); return true; }
    if (k === 'h' && levels()) { const L = C.status()?.level; if (L) { hintTier[L.id] = Math.min(3, (hintTier[L.id] || 0) + 1); const tier = hintTier[L.id], st = C.status(); notify('Hint ' + tier + ' · ' + (tier < 3 ? L.hints[tier - 1] : st.next ? st.next.label + ': ' + st.next.detail + (st.next.fix ? ' · ' + st.next.fix : '') : 'Everything passes')); if (open) render(); } return true; }
    if (k === 'escape') { open ? (close(), enter()) : panel(levels() ? 'objective' : 'settings'); return true; }
    return false;
  }
  // First load: the start screen. A ?join= link goes straight to the join form.
  showStart(true); if (new URLSearchParams(globalThis.location?.search || '').get('join')) startJoin();
  return { update, key, panel, close, showStart, get isOpen() { return open || startOpen; }, get startOpen() { return startOpen; }, render, targetOf };
}
