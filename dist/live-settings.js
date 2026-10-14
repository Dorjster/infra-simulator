// Graphics settings read in frame code, kept current on every change (no preferences read per frame):
//  · detail: how far map details (a map file's props) keep their full model and stay drawn, × the usual distance
//    (Settings → Map detail; auto follows the Graphics mode);
//  · rim: the outline of light round the players (Settings → Player outline);
//  · leftHand: the first-person gun in the left hand (Settings → Global Defensive → Gun hand).
import { loadPreferences } from './player-preferences.js';
export const live = { detail: 1, rim: true, leftHand: false };
const DETAIL = { low: .6, medium: 1, high: 1.6 }, DETAIL_AUTO = { Low: .6, Medium: 1, High: 1.25, Ultra: 1.6 };
function update(p) { live.detail = DETAIL[p.detail] || DETAIL_AUTO[p.graphics] || 1; live.rim = p.rim !== 'off'; live.leftHand = p.gunHand === 'left'; }
update(loadPreferences()); globalThis.addEventListener?.('infra-preferences', e => update(e.detail || loadPreferences()));
