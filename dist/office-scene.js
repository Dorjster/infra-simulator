import * as THREE from './three.module.js';
import {mergeStatic} from './render-optimizer.js';
import {DEPARTMENTS} from './office-schema.js';
export function createOfficeScene({scene,pickables,camera,office}){
 const root=new THREE.Group();scene.add(root);const floors=new Map(),employees=[],targets=[];let currentFloor=1,signature='';
 // Two office lamps follow the visible floor: a constant light count avoids shader recompiles (hitches) when changing floors.
 const lamps=[97,140].map(x=>{const l=new THREE.PointLight(0xd8efff,160,75,1.5);l.position.set(x,15,12);root.add(l);return l;});
 const mat=c=>{const m=new THREE.MeshStandardMaterial({color:c,roughness:.72,metalness:.08});return m;};const wall=mat(0x8fa5ae),wood=mat(0xa78c6c),screen=new THREE.MeshBasicMaterial({color:0x72c9d5}),floorMat=mat(0x687c86),glass=new THREE.MeshStandardMaterial({color:0xa5d2e2,transparent:true,opacity:.18,roughness:.2});
 function box(group,w,h,d,x,y,z,material,data){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);group.add(m);if(data){m.userData=data;pickables.push(m);targets.push(m);}return m;}
 function label(group,text,x,y,z,width=10){const c=document.createElement('canvas');c.width=768;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#d8eef1';ctx.font='bold 48px sans-serif';ctx.textAlign='center';ctx.fillText(text,384,84);const m=new THREE.Mesh(new THREE.PlaneGeometry(width,1.6),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}));m.position.set(x,y,z);group.add(m);}
 function build(){for(const g of floors.values()){root.remove(g);g.traverse(o=>{o.geometry?.dispose();if(o.material&&![wall,wood,screen,floorMat,glass].includes(o.material)){o.material.map?.dispose();o.material.dispose();}});}for(const t of targets){const i=pickables.indexOf(t);if(i>=0)pickables.splice(i,1);}targets.length=0;floors.clear();employees.length=0;
  for(let f=1;f<=office.state.floorCount;f++){const g=new THREE.Group();g.position.y=(f-1)*22;root.add(g);floors.set(f,g);box(g,92,.3,84,118,-.33,13,floorMat);box(g,.3,16,84,164,7.7,13,wall,{occluder:true});for(const z of [-28,55])box(g,92,16,.3,118,7.7,z,glass,{occluder:true});
   for(const x of [97,140]){box(g,15,.15,2,x,15.8,12,new THREE.MeshBasicMaterial({color:0xe7f6ff}));}
   label(g,'FLOOR '+f+' / COMPANY OFFICES',117,13,49,25);label(g,'SERVER HALL ←',80,10,47,10);
   for(const z of [0,36])box(g,78,.02,.22,123,-.16,z,new THREE.MeshBasicMaterial({color:0xc5b87f}));
   box(g,4,9,4,78,4.4,42,mat(0x264451),{officeElevator:true});label(g,'LIFT',78,10,44.1,4);
   box(g,4,5,2,80,2.4,19,mat(0x213b49),{officeTerminal:'central'});box(g,3.4,2.2,.12,80,5.7,20.1,screen,{officeTerminal:'central'});label(g,f===1?'CENTRAL ADMINISTRATION PC':'FLOOR IDF',80,9,21,13);
   for(const [dep,name,,x,z]of DEPARTMENTS){const tint={sales:0x4ba7bf,finance:0x88b592,engineering:0x9a91c4,executive:0xc1a36e}[dep];box(g,34,.03,27,x,-.14,z,mat(tint));label(g,name.toUpperCase(),x,11,z-10,13);for(const side of [-1,1])box(g,.12,13,19,x+side*18,6.3,z-2,glass,{occluder:true});
    for(const pc of Object.values(office.state.pcs).filter(p=>p.floor===f&&p.department===dep)){box(g,8,.3,4,pc.x,4,pc.z,wood,{occluder:true});for(const dx of [-3,3])box(g,.25,4,.25,pc.x+dx,1.9,pc.z,wall);box(g,4,2.6,.3,pc.x,6.1,pc.z-.8,mat(0x182d39),{officePC:pc.id});const display=box(g,3.65,2.2,.1,pc.x,6.1,pc.z-.58,screen,{officePC:pc.id});box(g,3,.1,1,pc.x,4.25,pc.z+.9,mat(0x1c2e37),{officePC:pc.id});box(g,1.4,3.5,2.5,pc.x+4.3,1.8,pc.z,mat(0x243b47),{officePC:pc.id});
     const human=new THREE.Group();human.visible=false;g.add(human);human.position.set(pc.x,0,pc.z+5);box(human,1.6,3,1,0,4.2,0,mat(tint));box(human,1.25,1.4,1.2,0,6.45,0,mat(0xc9aa8d));for(const dx of [-.5,.5])box(human,.55,2.7,.6,dx,1.4,0,mat(0x273b48));employees.push({g:human,pc,display});
    }
    const drop=office.state.drops['F'+f+'-'+dep];box(g,1.8,.25,1.8,drop.x,15,drop.z,mat(Object.values(office.state.aps).some(a=>a.floor===f&&a.department===dep)?0xe0eeee:0x556975),{officeDrop:drop.id});label(g,'PoE / AP',drop.x,13,drop.z,4);
   }
   label(g,'NETWORK TEST LAB',117,10,40,14);box(g,9,.3,3,117,4,43,wood,{occluder:true});box(g,4,2.4,.3,117,6,42,screen,{officeTerminal:'lab'});label(g,'MEETING / PRINT / SUPPORT',144,10,44,17);
  }
 mergeStatic(root,[],{skipOccluders:true});}
 function update(now){for(const l of lamps)l.position.y=(currentFloor-1)*22+15;const next=office.state.floorCount+':'+Object.keys(office.state.pcs).join(',')+':'+Object.keys(office.state.aps).join(',');if(currentFloor>office.state.floorCount)currentFloor=1;if(next!==signature){signature=next;build();}for(const [f,g]of floors)g.visible=f===currentFloor;for(const e of employees){e.pc=office.state.pcs[e.pc.id]||e.pc;const phase=(now/1000+e.pc.vlan)%60,walking=phase>45;e.g.position.x=e.pc.x+(walking?Math.sin((phase-45)/15*Math.PI)*6:0);e.g.position.z=e.pc.z+5+(walking?Math.sin((phase-45)/15*Math.PI)*3:0);e.g.rotation.y=walking?Math.PI/2:Math.PI;e.display.visible=e.pc.power;}}
 function travel(f){if(f<1||f>office.state.floorCount)return false;currentFloor=f;camera.position.set(81,(f-1)*22+9.7,42);camera.lookAt(110,camera.position.y,24);update(performance.now());return true;}
 function clear(x,z){if(currentFloor>1&&x<73)return false;if(x<73)return true;if(x>163||z<-27||z>54)return false;if(DEPARTMENTS.some(([, , ,cx,cz])=>[cx-18,cx+18].some(wx=>Math.abs(x-wx)<.9&&Math.abs(z-(cz-2))<10)))return false;return !Object.values(office.state.pcs).some(p=>p.floor===currentFloor&&Math.abs(x-p.x)<4.8&&Math.abs(z-p.z)<2.8);}
 update(0);return {update,travel,clear,get floor(){return currentFloor;},get baseY(){return (currentFloor-1)*22;}};
}
