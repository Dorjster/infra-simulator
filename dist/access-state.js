import {productProfile} from './product-profiles.js';
import {hasPower,trippedFeeds} from './power-grid.js';
// Serial console and standby management must never depend on an IP data path.
export function controlStatus(n,{kvm=false,siteDown=false}={}){
 if(!n||n.active===false)return {ok:false,reason:'Device is not installed'};
 if(siteDown)return {ok:false,reason:'Site power is unavailable'};
 const p=n.physical;if(!hasPower(n)){const t=[...new Set(trippedFeeds(n))];return {ok:false,reason:t.length?'NO POWER · PDU '+t.map(f=>n.rack+'-'+f).join(' and ')+' breaker tripped':p?.fault==='psu'&&p.power?.[1]&&!p.power[0]?'NO POWER · PSU 2 failed and PSU 1 has no cord':'NO POWER · connect a PSU cord to a rack PDU'};}if(!p)return {ok:true,reason:'Ready'};
 const standby=['idrac','ilo'].includes(productProfile(n).family)&&!kvm;
 if(standby)return {ok:true,reason:(productProfile(n).family==='ilo'?'iLO':'iDRAC')+(p.on?' available':' standby · host is off')};
 if(!p.on)return {ok:false,reason:'POWER OFF · press the front power button'};
 if(p.bootUntil>Date.now())return {ok:false,reason:'BOOTING · '+Math.ceil((p.bootUntil-Date.now())/1000)+' seconds remaining'};
 if(['dimm','controller','nic'].includes(p.fault))return {ok:false,reason:'Hardware fault · '+p.fault};
 return {ok:true,reason:'Ready'};
}
