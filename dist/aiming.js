// Never promote a target on another object ahead of the nearest visible surface.
export function pickInteraction(hits){
 const sorted=hits.slice().sort((a,b)=>a.distance-b.distance),first=sorted[0];
 if(!first||first.object.userData.occluder)return null;
 const node=first.object.userData.node;
 if(!node)return first;
 return sorted.find(h=>h.distance<=first.distance+.12&&h.object.userData.node===node&&(h.object.userData.powerPSU!==undefined||h.object.userData.servicePort||h.object.userData.portIndices))||first;
}
