export const DELIVERY={x:-38,z:0};
export const PROCUREMENT={x:-38,z:15};
export const ROOM={minX:-44,maxX:164,minZ:-28,maxZ:55};
// Payday casino: north of the server hall through a doorway at x 1–9.
// Real-life scale ≈ 0.165 m per unit: the room is ~18.5 × 22 m (4.3 m ceiling), the doorway 2.3 m wide and high.
export const CASINO={minX:-42,maxX:70,minZ:56,maxZ:190,doorX:[-1,13],doorH:14,height:26};
// Shooting arena: a separate area far south of the hall; only the active arena map is built and walkable there.
export const ARENA={minX:-160,maxX:160,minZ:-560,maxZ:-240,cx:0,cz:-400};
// Core rack bays R01–R06 hold the building racks in Free Play and older campaigns. In the empty-site
// campaign (levels 0–10) they start bare and the team places purchased racks on them.
export const CORE_PADS=[-9,-3,3,9,22,28].map((x,i)=>({id:'PAD-R0'+(i+1),rack:'R0'+(i+1),x,z:0,core:true}));
export const RACK_PADS=[
 ...CORE_PADS,
 ...[35,41,47,53].map((x,i)=>({id:'PAD-'+(i+1),rack:'R'+String(i+7).padStart(2,'0'),x,z:0})),
 ...[-9,-3,3,9,22,28].map((x,i)=>({id:'PAD-'+(i+5),rack:'R'+String(i+11).padStart(2,'0'),x,z:24})),
 ...[35,41,47,53].map((x,i)=>({id:'PAD-'+(i+11),rack:'R'+String(i+17).padStart(2,'0'),x,z:24}))
];
export function deliveryPosition(index){return {x:DELIVERY.x+(index%3)*3.1,z:-7+Math.floor(index/3)%5*3.4};}
export function validFloorPosition(pos,racks=[]){return pos&&Number.isFinite(pos.x)&&Number.isFinite(pos.z)&&pos.x>ROOM.minX+1&&pos.x<ROOM.maxX-1&&pos.z>ROOM.minZ+1&&pos.z<ROOM.maxZ-1&&!racks.some(r=>Math.abs(pos.x-r.x)<2.1&&Math.abs(pos.z-(r.z||0))<3.7)&&!(Math.abs(pos.x+26)<1.2&&(pos.z<5||pos.z>14));}
