// Team voice for Global Defensive: push-to-talk microphone speech to your current team mates over WebRTC (peer to
// peer on the LAN; the room only relays the connection set-up, and only between team mates — lan/room.mjs).
//  · Rule: in a Defuse match you talk to your own side; spectators to spectators; dead players still talk to their
//    team (CS2). Deathmatch has no team mates, so no voice. Changing team closes the old connections at once.
//  · The microphone is asked for only when you turn voice on (Settings or the scoreboard). It needs a secure page:
//    the desktop app, this computer (localhost) or the host's https address.
//  · Speaking indicators come from the audio actually sent / received (its level), not from a held key.
//  · Voice never touches the game state: if it fails, the match and the LAN connection carry on.
import { getVolumes } from './spatial-audio.js';
const KEY = 'gd-voice', key = n => String(n || '').trim().toLowerCase().slice(0, 40);
const DEFAULTS = { enabled: false, inputId: '', outputId: '', micGain: 1, volume: 1, micMuted: false, muted: [] };
export function loadVoicePrefs() { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; } }
function savePrefs(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} }

export function createVoice({ lan, world, name, notify = () => {} }) {
  const prefs = loadVoicePrefs(), peers = new Map(), outbox = new Map();
  let ctx = null, stream = null, src = null, gain = null, analyser = null, dest = null, track = null, talking = false, status = 'off', lastErr = '', selfLevel = 0, testUntil = 0, monitor = null, flushTimer = null;
  const buf = new Float32Array(512), outVol = () => { const v = getVolumes(); return v.master * v.voice; };
  addEventListener('infra-volume', () => { for (const p of peers.values()) if (p.audio) p.audio.volume = Math.min(1, prefs.volume * outVol()); });   // Settings → Audio: master × voice
  const level = a => { if (!a) return 0; a.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); };
  const myTeam = () => { const g = world.operations.game; return g.mode === 'arena' ? g.combat?.d?.teams?.[key(name())] || null : null; };
  const teamOf = n => world.operations.game.combat?.d?.teams?.[key(n)] || null;
  const secure = () => globalThis.isSecureContext !== false;
  const httpsHint = () => { try { const u = new URL(location.href); return 'https://' + u.hostname + ':' + ((+u.port || 80) + 1); } catch { return 'the host’s https address'; } };

  // ── Microphone ──
  async function capture() {
    if (!secure()) throw Object.assign(Error('Voice needs a secure page. Open ' + httpsHint() + ' (accept the certificate once) or use the desktop app.'), { kind: 'insecure' });
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(Error('This browser has no microphone support.'), { kind: 'unsupported' });
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(prefs.inputId ? { deviceId: { exact: prefs.inputId } } : {}) };
    let s; try { s = await navigator.mediaDevices.getUserMedia({ audio, video: false }); }
    catch (e) { if (prefs.inputId && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) { prefs.inputId = ''; savePrefs(prefs); return capture(); }
      throw Object.assign(Error(e.name === 'NotAllowedError' || e.name === 'SecurityError' ? 'Microphone permission was denied. Allow the microphone for this page (browser address bar or system settings), then press Turn on again.' : e.name === 'NotFoundError' ? 'No microphone found. Plug one in, then press Turn on again.' : e.name === 'NotReadableError' ? 'The microphone is busy in another app. Close it, then press Turn on again.' : 'Microphone error: ' + e.message), { kind: e.name }); }
    ctx ??= new AudioContext(); if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    stream?.getTracks().forEach(t => t.stop()); stream = s; src?.disconnect();
    src = ctx.createMediaStreamSource(s); gain ??= ctx.createGain(); gain.gain.value = prefs.micGain; analyser ??= Object.assign(ctx.createAnalyser(), { fftSize: 1024 }); dest ??= ctx.createMediaStreamDestination();
    src.connect(gain); gain.connect(analyser); gain.connect(dest);
    const t = dest.stream.getAudioTracks()[0]; if (t !== track) { track = t; for (const p of peers.values()) p.sender?.replaceTrack(track).catch(() => {}); }
    track.enabled = talking && !prefs.micMuted;
    s.getAudioTracks()[0]?.addEventListener('ended', () => { if (status !== 'on') return; notify('Microphone disconnected · switching to the default microphone'); prefs.inputId = ''; capture().catch(e => fail(e)); });
  }
  function fail(e) { lastErr = e.message; status = 'error'; notify('Voice: ' + e.message); }

  // ── Peers (one RTCPeerConnection per team mate) ──
  const queue = (to, signal) => { const list = outbox.get(to) || []; list.push(signal); outbox.set(to, list); flushTimer ??= setTimeout(flush, 90); };   // ICE candidates batched (the room rate-limits requests)
  function flush() { flushTimer = null; for (const [to, list] of outbox) { outbox.delete(to); lan.voiceSend?.(to, list.length === 1 ? list[0] : { type: 'batch', list }).catch(() => {}); } }
  function closePeer(id, bye = true) { const p = peers.get(id); if (!p) return; peers.delete(id); try { p.pc.close(); } catch {} p.audio?.remove(); p.meter?.disconnect(); if (bye) lan.voiceSend?.(id, { type: 'bye' }).catch(() => setTimeout(() => lan.voiceSend?.(id, { type: 'bye' }).catch(() => {}), 400)); }   // retried once (the room rate-limits requests)
  function makePeer(id, pname) {
    const pc = new RTCPeerConnection({ iceServers: [] }), p = { pc, id, name: pname, level: 0, speakingAt: 0, sender: null, audio: null, meter: null, made: performance.now() };
    p.sender = pc.addTrack(track, dest.stream);
    pc.onicecandidate = e => { if (e.candidate) queue(id, { type: 'ice', c: e.candidate.toJSON() }); };
    pc.ontrack = e => { const rs = e.streams[0] || new MediaStream([e.track]); p.audio?.remove(); const a = document.createElement('audio'); a.autoplay = true; a.srcObject = rs; a.volume = Math.min(1, prefs.volume * outVol()); a.muted = prefs.muted.includes(key(pname)); a.style.display = 'none'; document.body.append(a); if (prefs.outputId && a.setSinkId) a.setSinkId(prefs.outputId).catch(() => {}); a.play?.().catch(() => {}); p.audio = a;
      try { p.meter = Object.assign(ctx.createAnalyser(), { fftSize: 1024 }); ctx.createMediaStreamSource(rs).connect(p.meter); } catch {} };
    pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) closePeer(id, false); else if (pc.connectionState === 'disconnected') p.discAt = performance.now(); else p.discAt = 0; };
    peers.set(id, p); return p;
  }
  async function call(p) { try { const o = await p.pc.createOffer(); await p.pc.setLocalDescription(o); queue(p.id, { type: 'offer', sdp: o.sdp }); } catch {} }
  lan.onVoice?.(async ({ from, signal }) => {
    const list = signal?.type === 'batch' ? signal.list || [] : [signal];
    for (const sig of list) {
      if (!sig) continue; if (sig.type === 'bye') { closePeer(from, false); continue; }
      if (status !== 'on' || !track) continue;
      const who = (lan.players || []).find(x => x.id === from); if (!who || !myTeam() || teamOf(who.name) !== myTeam()) continue;   // team mates only, on this side too
      let p = peers.get(from);
      try {
        if (sig.type === 'offer') { if (!p) p = makePeer(from, who.name); await p.pc.setRemoteDescription({ type: 'offer', sdp: sig.sdp }); const a = await p.pc.createAnswer(); await p.pc.setLocalDescription(a); queue(from, { type: 'answer', sdp: a.sdp }); }
        else if (sig.type === 'answer' && p) await p.pc.setRemoteDescription({ type: 'answer', sdp: sig.sdp });
        else if (sig.type === 'ice' && p) await p.pc.addIceCandidate(sig.c);
      } catch {}
    }
  });
  // Every few frames: connect to new team mates (the lower id calls), drop anyone who is no longer one.
  let syncAt = 0;
  function sync() {
    const team = status === 'on' ? myTeam() : null, me = lan.selfID, want = new Map();
    if (team && me) for (const pl of lan.players || []) if (pl.id !== me && teamOf(pl.name) === team) want.set(pl.id, pl.name);
    for (const id of [...peers.keys()]) if (!want.has(id)) closePeer(id, true);
    for (const [id, p] of [...peers]) if (p.discAt && p.pc.connectionState === 'disconnected' && performance.now() - p.discAt > 3000) closePeer(id, false);   // the other side went away (voice off, closed the game, network): drop it
    for (const [id, n] of want) { const p = peers.get(id); if (!p && String(me) < String(id)) call(makePeer(id, n)); else if (p && p.pc.connectionState === 'new' && performance.now() - p.made > 8000 && String(me) < String(id)) { closePeer(id, false); } }
  }

  const api = {
    get prefs() { return prefs; }, get status() { return status; }, get error() { return lastErr; }, get talking() { return talking && !prefs.micMuted && status === 'on'; },
    get secure() { return secure(); }, httpsHint,
    async enable() { if (status === 'on') return true; status = 'starting'; try { await capture(); status = 'on'; lastErr = ''; prefs.enabled = true; savePrefs(prefs); navigator.mediaDevices.ondevicechange = () => api.refreshDevices?.(); return true; } catch (e) { fail(e); stream?.getTracks().forEach(t => t.stop()); stream = null; return false; } },
    disable() { status = 'off'; prefs.enabled = false; savePrefs(prefs); for (const id of [...peers.keys()]) closePeer(id, true); stream?.getTracks().forEach(t => t.stop()); stream = null; talking = false; },
    // Push to talk (the configurable key): speech is sent only while held.
    talk(on) { talking = !!on; if (track) track.enabled = talking && !prefs.micMuted; },
    setMicMuted(m) { prefs.micMuted = !!m; savePrefs(prefs); if (track) track.enabled = talking && !prefs.micMuted; },
    setMicGain(v) { prefs.micGain = Math.max(0, Math.min(2.5, +v || 0)); savePrefs(prefs); if (gain) gain.gain.value = prefs.micGain; },
    setVolume(v) { prefs.volume = Math.max(0, Math.min(1, +v || 0)); savePrefs(prefs); for (const p of peers.values()) if (p.audio) p.audio.volume = Math.min(1, prefs.volume * outVol()); },
    async setInput(id) { prefs.inputId = id || ''; savePrefs(prefs); if (status === 'on') await capture().catch(e => fail(e)); },
    setOutput(id) { prefs.outputId = id || ''; savePrefs(prefs); for (const p of peers.values()) p.audio?.setSinkId?.(prefs.outputId).catch(() => {}); },
    get canPickOutput() { return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype; },
    async devices() { try { const d = await navigator.mediaDevices.enumerateDevices(); return { inputs: d.filter(x => x.kind === 'audioinput'), outputs: d.filter(x => x.kind === 'audiooutput') }; } catch { return { inputs: [], outputs: [] }; } },
    mute(n, m) { const k = key(n), set = new Set(prefs.muted); if (m) set.add(k); else set.delete(k); prefs.muted = [...set]; savePrefs(prefs); for (const p of peers.values()) if (key(p.name) === k && p.audio) p.audio.muted = !!m; },
    isMuted: n => prefs.muted.includes(key(n)),
    // Test the microphone: hear yourself for 5 s and watch the level.
    test() { if (status !== 'on' || !ctx) return false; testUntil = performance.now() + 5000; if (!monitor) { monitor = ctx.createGain(); monitor.gain.value = .8; gain.connect(monitor); monitor.connect(ctx.destination); } return true; },
    get micLevel() { return selfLevel; },
    // Speaking right now: you (sending, with sound) or a team mate (their received audio has sound).
    speaking(n) { const k = key(n); if (k === key(name())) return this.talking && selfLevel > .012; for (const p of peers.values()) if (key(p.name) === k) return !this.isMuted(n) && performance.now() - p.speakingAt < 250; return false; },
    get peers() { return [...peers.values()].map(p => ({ id: p.id, name: p.name, state: p.pc.connectionState, level: p.level })); },
    update() {
      if (status === 'on') { selfLevel = level(analyser); for (const p of peers.values()) { p.level = level(p.meter); if (p.level > .012) p.speakingAt = performance.now(); } }
      if (monitor && performance.now() > testUntil) { try { gain.disconnect(monitor); monitor.disconnect(); } catch {} monitor = null; }
      const now = performance.now(); if (now - syncAt > 400) { syncAt = now; sync(); }
    },
    // Leaving the room / closing: everything stops (the preference stays for next time).
    shutdown() { for (const id of [...peers.keys()]) closePeer(id, true); stream?.getTracks().forEach(t => t.stop()); stream = null; status = 'off'; },
  };
  addEventListener('pagehide', () => api.shutdown());
  return api;
}
