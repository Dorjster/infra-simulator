// Graphics settings read in frame code, kept current on every change (no preferences read per frame):
//  · detail: how far map details (a map file's props) keep their full model and stay drawn, × the usual distance
//    (Settings → Map detail; auto follows the Graphics mode);
//  · rim: the outline of light round the players (Settings → Player outline);
//  · leftHand: the first-person gun in the left hand (Settings → Global Defensive → Gun hand);
//  · blood: CS2's blood spray and decals on hits (Settings → Global Defensive → Blood; default on — gd-blood.js);
//  · (v53 FEEDBACK, spec addendum 15) tracers: 'cs2' — each gun's m_nTracerFrequency (weapons.vdata) — or 'every' (every
//    bullet), Settings → Global Defensive → Bullet tracers, default CS2 (gd-tracers.js); hitMarker: the white X on a hit
//    (Settings → Global Defensive → Hit marker: Off (CS2) | On, default off — CS2 has none; gd-hit-feedback.js). Both per
//    user (stored with the preferences, never sent over LAN); absent from the default preferences, so the other modes'
//    defaults stay as they were.
import { loadPreferences } from './player-preferences.js';
export const live = { detail: 1, rim: true, leftHand: false, blood: true, tracers: 'cs2', hitMarker: false };
const DETAIL = { low: .6, medium: 1, high: 1.6 }, DETAIL_AUTO = { Low: .6, Medium: 1, High: 1.25, Ultra: 1.6 };
function update(p) { live.detail = DETAIL[p.detail] || DETAIL_AUTO[p.graphics] || 1; live.rim = p.rim !== 'off'; live.leftHand = p.gunHand === 'left'; live.blood = p.blood !== false; live.tracers = p.tracers === 'every' ? 'every' : 'cs2'; live.hitMarker = p.hitMarker === 'on'; }
update(loadPreferences()); globalThis.addEventListener?.('infra-preferences', e => update(e.detail || loadPreferences()));
