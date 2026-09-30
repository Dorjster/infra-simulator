import * as THREE from './three.module.js';
import {mergeStatic,mergePlates} from './render-optimizer.js';
import {ROOM} from './facility-layout.js';
export function improveFacility(scene,camera,pickables=[]){
 const originals=scene.children.filter(o=>o.isLight).map(l=>[l,l.intensity]);const group=new THREE.Group();scene.add(group);const concrete=new THREE.MeshStandardMaterial({color:0x718592,roughness:.68,metalness:.12}),wall=new THREE.MeshStandardMaterial({color:0x334e60,roughness:.8}),stripe=new THREE.MeshBasicMaterial({color:0x74a7b9}),light=new THREE.MeshBasicMaterial({color:0xd8efff}),roomLights=[];
 function box(w,h,d,x,y,z,mat){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);group.add(m);if(mat===wall&&h>3){m.userData={occluder:true};pickables.push(m);}return m;}
 box(118,.18,85,14,-.38,13.5,concrete);for(const x of [ROOM.minX-.5,ROOM.maxX+.5])box(.3,16,85,x,7.6,13.5,wall);for(const z of [ROOM.minZ-.5,ROOM.maxZ+.5])box(118,16,.3,14,7.6,z,wall);
 // Separate receiving room, with a broad doorway into the server hall.
 box(.35,16,33,-26,7.6,-11.5,wall);box(.35,16,41,-26,7.6,34.5,wall);box(.35,.5,9,-26,15.75,9.5,wall);
 const tiles=[];for(let x=-42;x<=70;x+=4)tiles.push(x,-.277,-28,x,-.277,55);for(let z=-28;z<=55;z+=4)tiles.push(-44,-.277,z,72,-.277,z);const seams=new THREE.BufferGeometry();seams.setAttribute('position',new THREE.Float32BufferAttribute(tiles,3));group.add(new THREE.LineSegments(seams,new THREE.LineBasicMaterial({color:0x4e6879})));
 for(const z of [-8,9,16,33])for(let x=-20;x<=56;x+=3)box(1.8,.012,.08,x,-.263,z,stripe);
 for(const x of [-14,4,24,45])for(const z of [-10,17,34])box(6,.07,.2,x,16,z,light);
 for(const [x,z]of [[-9,9],[20,9],[45,9],[8,28]]){const lamp=new THREE.PointLight(0xc7e5f5,25,34,1.5);lamp.position.set(x,14,z);group.add(lamp);roomLights.push(lamp);}
 const receivingLight=new THREE.PointLight(0xe4e7d6,40,38,1.5);receivingLight.position.set(-37,13,5);group.add(receivingLight);
 function label(text,x,y,z,w=7,flat=false){const c=document.createElement('canvas');c.width=1024;c.height=160;const ctx=c.getContext('2d');ctx.font='bold 66px sans-serif';ctx.fillStyle='#c4dae3';ctx.textAlign='center';ctx.fillText(text,512,110);const m=new THREE.Mesh(new THREE.PlaneGeometry(w,1.2),new THREE.MeshBasicMaterial({map:Object.assign(new THREE.CanvasTexture(c),{userData:{staticText:true}}),transparent:true,depthWrite:false}));if(flat)m.rotation.x=-Math.PI/2;m.position.set(x,y,z);group.add(m);return m;}
 label('RECEIVING / STORES',-36,-.25,9,12,true);label('SERVER HALL',-20,-.25,10,8,true);label('ROW 01',0,-.25,12,7,true);label('EXPANSION BAYS',43,-.25,12,12,true);label('ROW 02',6,-.25,35,12,true);
 const plate=box(.2,1.3,.8,-25.72,7,15,wall),toggle=box(.25,.55,.38,-25.56,7,15,new THREE.MeshBasicMaterial({color:0x8ce8bd}));toggle.userData={lightSwitch:true};pickables.push(toggle);plate.userData={lightSwitch:true};pickables.push(plate);const sign=label('LIGHTS',-25.3,8,15,2);sign.rotation.y=Math.PI/2;
 const flashlight=new THREE.SpotLight(0xe1efff,90,22,.45,.75,1);flashlight.position.set(.3,-.2,0);flashlight.target.position.set(0,-.2,-10);camera.add(flashlight,flashlight.target);flashlight.intensity=0;let current=true;mergeStatic(group,pickables);mergePlates(group);
 return {toggle(){flashlight.intensity=flashlight.intensity?0:90;return flashlight.intensity>0;},setLights(on){if(on===current)return;current=on;for(const [l,intensity]of originals)l.intensity=intensity*(on?1:.025);roomLights.forEach(l=>l.intensity=on?25:0);light.color.setHex(on?0xd8efff:0x142431);toggle.material.color.setHex(on?0x8ce8bd:0xda9873);},clear(x,z){return x>ROOM.minX+1&&x<ROOM.maxX-1&&z>ROOM.minZ+1&&z<ROOM.maxZ-1&&!(Math.abs(x+26)<.7&&(z<5||z>14));}};
}
