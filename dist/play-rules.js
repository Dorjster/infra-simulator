// Engineer titles are presentation only. Enterprise checks live in their own systems.
export const ENGINEER_TITLES=['field','operations'];
export const HOST_ACTIONS=new Set(['mode','begin','checkpoint','recover','fault']);
export function roleError(){return null;}
export function hostActionError(isHost,action){
 if(!isHost&&(action?.type==='reset-cables'||action?.type==='engineering'&&HOST_ACTIONS.has(action.action?.type)))return 'Host only · game mode and campaign saves belong to the host';
 return null;
}
export function freeRackSlot(nodes,rails,rack,units){for(let u=18;u<=42;u++)if(free(u))return u;for(let u=1;u<18;u++)if(free(u))return u;return null;function free(u){return u+units-1<=42&&!nodes.some(n=>n.active!==false&&!n.controller&&n.rack===rack&&n.unit<u+units&&n.unit+n.units>u)&&!rails.some(r=>r.rack===rack&&r.unit<u+units&&r.unit+r.units>u);}}
// Emotes a player may broadcast in the LAN pose (the host rejects anything else).
export const EMOTE_IDS=['salute','wave','wait','shrug','panic','dead'];
// Face styles a player can choose for their avatar.
export const FACE_IDS=['cute','smile','bigeyes','grumpy','angry','sleepy'];
// Head colours a player can choose for their avatar.
export const SKIN_IDS=['yellow','red','blue','green','pink','mint'];
// Character options (headwear, outfit style) and what a player is visibly carrying (host-validated).
export const HAT_IDS=['cap','helmet','beanie','headset','hair'];
export const OUTFIT_IDS=['bands','vest','plain'];
export const CARRY_IDS=['box','rack','cable'];
// Player display names: letters, digits, space, _ and -; at most 20 characters.
export function cleanName(value){return String(value||'').replace(/[^\p{L}\p{N} _-]/gu,'').trim().slice(0,20)||'Engineer';}
