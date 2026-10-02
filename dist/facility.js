import * as THREE from './three.module.js';
import {mergeStatic,mergePlates} from './render-optimizer.js';
import {ROOM} from './facility-layout.js';
export function improveFacility(scene,camera,pickables=[]){
 const originals=scene.children.filter(o=>o.isLight).map(l=>[l,l.intensity]);const group=new THREE.Group();scene.add(group);// v32 art direction: raised-floor tiles (perforated in the cold aisles), a real acoustic ceiling with
 // recessed LED panels, neutral walls with a darker base band. One canvas texture per surface, shared.
 const tex=(size,draw,repeat)=>{const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');try{draw(g,size);}catch{}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(...repeat);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;};
 const tile=(g,n,perf)=>{g.fillStyle=perf?'#8d979d':'#a3acb1';g.fillRect(0,0,n,n);for(let i=0;i<900;i++){g.fillStyle=`rgba(${Math.random()<.5?255:0},${Math.random()<.5?255:0},255,.025)`;g.fillRect(Math.random()*n,Math.random()*n,2,2);}if(perf){g.fillStyle='#5b656c';for(let y=10;y<n-6;y+=9)for(let x=10;x<n-6;x+=9){g.beginPath();g.arc(x,y,2.1,0,7);g.fill();}}g.strokeStyle='#6f7a81';g.lineWidth=3;g.strokeRect(1.5,1.5,n-3,n-3);g.strokeStyle='#c2c9cd';g.lineWidth=1;g.strokeRect(4,4,n-8,n-8);};
 const concrete=new THREE.MeshStandardMaterial({color:0xaab2b8,map:tex(128,(g,n)=>tile(g,n,false),[118/4,85/4]),roughness:.82,metalness:.05}),wall=new THREE.MeshStandardMaterial({color:0x7d8a93,roughness:.9}),stripe=new THREE.MeshBasicMaterial({color:0xe2c84a}),light=new THREE.MeshBasicMaterial({color:0xf2f7ff}),roomLights=[];
 const perforated=new THREE.MeshStandardMaterial({color:0xaab2b8,map:tex(128,(g,n)=>tile(g,n,true),[1,1]),roughness:.85,metalness:.05});
 const ceilingMat=new THREE.MeshStandardMaterial({color:0xffffff,map:tex(128,(g,n)=>{g.fillStyle='#8e969d';g.fillRect(0,0,n,n);for(let i=0;i<500;i++){g.fillStyle='rgba(0,0,0,.06)';g.fillRect(Math.random()*n,Math.random()*n,1.5,1.5);}g.strokeStyle='#6b737a';g.lineWidth=4;g.strokeRect(0,0,n,n);},[118/6,85/6]),roughness:.95,side:THREE.DoubleSide,emissive:0x6a737c,emissiveIntensity:.55}),baseMat=new THREE.MeshStandardMaterial({color:0x3b444c,roughness:.8});
 function box(w,h,d,x,y,z,mat){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);group.add(m);if(mat===wall&&h>3){m.userData={occluder:true};pickables.push(m);}return m;}
 box(118,.18,85,14,-.38,13.5,concrete);for(const x of [ROOM.minX-.5,ROOM.maxX+.5])box(.3,16,85,x,7.6,13.5,wall);box(118,16,.3,14,7.6,ROOM.minZ-.5,wall);// North wall with the casino doorway (x 1–9, Payday mode opens it).
 box(44,16,.3,-23,7.6,ROOM.maxZ+.5,wall);box(60,16,.3,43,7.6,ROOM.maxZ+.5,wall);box(14,1.6,.3,6,14.8,ROOM.maxZ+.5,wall);
 // Separate receiving room, with a broad doorway into the server hall.
 box(.35,16,33,-26,7.6,-11.5,wall);box(.35,16,41,-26,7.6,34.5,wall);box(.35,.5,9,-26,15.75,9.5,wall);
 const tiles=[];for(let x=-42;x<=70;x+=4)tiles.push(x,-.277,-28,x,-.277,55);for(let z=-28;z<=55;z+=4)tiles.push(-44,-.277,z,72,-.277,z);
 box(118,.2,85,14,16.3,13.5,ceilingMat);
 for(const x of [ROOM.minX+.1,ROOM.maxX-.1])box(.12,1.1,85,x,.25,13.5,baseMat);box(118,1.1,.12,14,.25,ROOM.minZ+.1,baseMat);box(44,1.1,.12,-23,.25,ROOM.maxZ-.1,baseMat);box(60,1.1,.12,43,.25,ROOM.maxZ-.1,baseMat);
 // Cold-aisle perforated tiles in front of the rack rows; yellow safety lines at the aisle edges.
 for(const [z0,z1] of [[3.6,7.6],[27.6,31.6]])for(let x=-12;x<=56;x+=4){const t=new THREE.Mesh(new THREE.PlaneGeometry(3.96,3.96),perforated);t.rotation.x=-Math.PI/2;t.position.set(x+2,-.268,(z0+z1)/2);group.add(t);}
 for(const z of [-8,9,16,33])box(76,.012,.12,18,-.263,z,stripe);
 for(const x of [-14,-2,10,22,34,46,60])for(const z of [-10,4,17,30,44]){box(3.2,.05,1.6,x,16.18,z,light);box(3.5,.08,1.9,x,16.2,z,baseMat);}
 for(const z of [-10,4,17,30,44])for(const x of [-38,-32]){box(3.2,.05,1.6,x,16.18,z,light);}
  for(const [x,z]of [[-9,9],[-9,-9],[20,9],[45,9],[8,28],[40,28]]){const lamp=new THREE.PointLight(0xf1f5fa,34,30,1.6);lamp.position.set(x,15.4,z);group.add(lamp);roomLights.push(lamp);}
 const receivingLight=new THREE.PointLight(0xfff3dc,40,34,1.6);receivingLight.position.set(-35,15,6);group.add(receivingLight);roomLights.push(receivingLight);
 function label(text,x,y,z,w=7,flat=false){const c=document.createElement('canvas');c.width=1024;c.height=160;const ctx=c.getContext('2d');ctx.font='bold 66px sans-serif';ctx.fillStyle='#c4dae3';ctx.textAlign='center';ctx.fillText(text,512,110);const m=new THREE.Mesh(new THREE.PlaneGeometry(w,1.2),new THREE.MeshBasicMaterial({map:Object.assign(new THREE.CanvasTexture(c),{userData:{staticText:true}}),transparent:true,depthWrite:false}));if(flat)m.rotation.x=-Math.PI/2;m.position.set(x,y,z);group.add(m);return m;}
 // Receiving room: roll-up loading door, a hatched delivery zone where boxes land, pallet shelving with
 // cartons and a packing bench. Static, merged below.
 {const yellow=new THREE.MeshStandardMaterial({color:0xd9b53a,roughness:.7}),steel=new THREE.MeshStandardMaterial({color:0x6d7780,roughness:.5,metalness:.5}),orange=new THREE.MeshStandardMaterial({color:0xd06a2a,roughness:.6}),carton=new THREE.MeshStandardMaterial({color:0xa9824f,roughness:.9}),wood=new THREE.MeshStandardMaterial({color:0x8d6a45,roughness:.9}),slat=new THREE.MeshStandardMaterial({color:0x9aa3aa,roughness:.6,metalness:.3});
  for(let i=0;i<24;i++)box(10,.28,.05,ROOM.minX+.35,1+i*.46,0,slat).rotation.y=Math.PI/2;box(.3,.6,11,ROOM.minX+.4,12.2,0,baseMat);for(const z of [-5.6,5.6])box(.35,12.4,.35,ROOM.minX+.4,6.2,z,yellow);
  for(const [x0,z0,x1,z1] of [[-41,-9.5,-29.5,-9.3],[-41,9.3,-29.5,9.5],[-41,-9.5,-40.8,9.5],[-29.7,-9.5,-29.5,9.5]])box(x1-x0,.02,z1-z0,(x0+x1)/2,-.255,(z0+z1)/2,stripe);
  for(let k=0;k<11;k++){const m=box(2.6,.015,.14,-39.6+k*1.05,-.258,0,stripe);m.rotation.y=Math.PI/4;}
  for(const z of [22,34]){for(const x of [-43.2,-40.2])box(.14,9,.14,x,4.5,z-4.8,orange),box(.14,9,.14,x,4.5,z+4.8,orange);for(const y of [.4,3.3,6.2])box(3.1,.16,9.8,-41.7,y,z,orange),box(2.9,.06,9.6,-41.7,y+.1,z,steel);for(const y of [1.4,4.3,7.2])for(let c=0;c<3;c++)box(2.2,1.6+((c+y)%2)*.5,2.4,-41.7,y-.2+(((c+y)%2)*.25),z-3+c*3.1,carton);}
  box(6,.2,2.6,-31,3.2,44,wood);for(const [dx,dz] of [[-2.8,-1.1],[2.8,-1.1],[-2.8,1.1],[2.8,1.1]])box(.16,3.1,.16,-31+dx,1.55,44+dz,steel);box(1.6,.9,1.2,-32.5,3.75,44,carton);box(.9,.5,.7,-30,3.55,44.2,carton);
  for(const [x,z] of [[-35,26],[-35,30.2]]){for(let k=0;k<3;k++)box(3.8,.18,.9,x,.1,z-1.4+k*1.4,wood);box(3.8,.1,3.8,x,.3,z,wood);}box(3.2,2.2,3.2,-35,1.5,26,carton);}
 label('RECEIVING / STORES',-36,-.25,9,12,true);label('DELIVERIES',-35.2,-.25,-8.2,6,true);label('SERVER HALL',-20,-.25,10,8,true);label('ROW 01',0,-.25,12,7,true);label('EXPANSION BAYS',43,-.25,12,12,true);label('ROW 02',6,-.25,35,12,true);
 const plate=box(.08,.95,.62,-25.78,6.2,15,new THREE.MeshStandardMaterial({color:0xd9dde0,roughness:.5})),toggle=box(.12,.32,.16,-25.7,6.2,15,new THREE.MeshBasicMaterial({color:0x8ce8bd}));toggle.userData={lightSwitch:true};pickables.push(toggle);plate.userData={lightSwitch:true};pickables.push(plate);const sign=label('LIGHTS',-25.62,7.05,15,1.1);sign.rotation.y=Math.PI/2;
 const flashlight=new THREE.SpotLight(0xe1efff,90,22,.45,.75,1);flashlight.position.set(.3,-.2,0);flashlight.target.position.set(0,-.2,-10);camera.add(flashlight,flashlight.target);flashlight.intensity=0;let current=true;mergeStatic(group,pickables);mergePlates(group);
 // The hall never moves: freeze its matrices so the per-frame scene update skips it.
 group.updateMatrixWorld(true);group.traverse(o=>{o.matrixAutoUpdate=false;});
  const lampLevels=roomLights.map(l=>l.intensity);
 // Lights off = emergency lighting: the hall is clearly darker and blue-tinted, but aisles, ports and
 // labels stay readable and the device LEDs stand out.
 return {toggle(){flashlight.intensity=flashlight.intensity?0:90;return flashlight.intensity>0;},setLights(on){if(on===current)return;current=on;for(const [l,intensity]of originals)l.intensity=intensity*(on?1:.28);roomLights.forEach((l,i)=>{l.intensity=on?lampLevels[i]:lampLevels[i]*.12;l.color.setHex(on?0xf1f5fa:0x9fb6ff);});light.color.setHex(on?0xf2f7ff:0x39465a);ceilingMat.emissiveIntensity=on?.55:.12;toggle.material.color.setHex(on?0x8ce8bd:0xda9873);},get lightsOn(){return current;},clear(x,z){return x>ROOM.minX+1&&x<ROOM.maxX-1&&z>ROOM.minZ+1&&z<ROOM.maxZ-1&&!(Math.abs(x+26)<.7&&(z<5||z>14));}};
}
