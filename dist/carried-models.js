import * as THREE from './three.module.js';
import {PICK_LAYER} from './render-optimizer.js';
export const CABLE_COLORS={data:0xff8a38,management:0x429dff,power:0x171b20};
export function makeCarriedModel(c,nodes){
 const g=new THREE.Group();g.userData.itemType=c.type;
 const box=(w,h,d,x,y,z,color)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.6}));m.position.set(x,y,z);g.add(m);return m;};
 if(['power','cable'].includes(c.type)){
  const color=c.type==='power'?CABLE_COLORS.power:c.speed===1?CABLE_COLORS.management:CABLE_COLORS.data;
  const points=[];for(let i=0;i<=80;i++){const t=i/80*Math.PI*4;points.push(new THREE.Vector3(Math.cos(t)*.64,Math.sin(t)*.4,i/80*.16));}
  points.unshift(new THREE.Vector3(-.95,.38,0));points.push(new THREE.Vector3(.95,.38,.16));
  const curve=new THREE.CatmullRomCurve3(points);g.add(new THREE.Mesh(new THREE.TubeGeometry(curve,96,.045,6,false),new THREE.MeshStandardMaterial({color,roughness:.7})));
  for(const x of [-.95,.95]){box(.2,.3,.2,x,.46,.08,c.type==='power'?0x303238:0xb5d4db);box(.14,.08,.12,x,.64,.08,color);if(c.type==='power')for(const dx of [-.045,.045])box(.025,.11,.03,x+dx,.66,.08,0xcbd5db);}
 }else if(c.type==='rail'){for(const x of [-.65,.65]){box(.1,.1,2.8,x,0,0,0xaab8c3);box(.06,.17,2.3,x,.1,0,0x73838e);box(.3,.3,.07,x,0,1.4,0xaab8c3);}}
 else if(c.type==='rack'){for(const x of [-1.7,1.7])for(const z of [-3.15,3.15])box(.12,12.25,.13,x,0,z,0x536570);for(const y of [-6.125,6.125])box(3.6,.16,6.5,0,y,0,0x536570);for(const x of [-1.51,1.51]){box(.08,11.6,.1,x,0,3.1,0x9aa9b7);for(let u=0;u<42;u++)box(.04,.045,.03,x,-5.5+u*.267,3.17,0x151e27);}}
 else {
  // Reuse chassis geometry/materials without copying circular node metadata or live port state.
  const template=nodes.find(n=>n.type===c.type&&n.group);if(template){const copy=(src,parent)=>{if(src.isSprite||src.isInstancedMesh||src.layers.mask===1<<PICK_LAYER)return;const dst=src.isMesh?new THREE.Mesh(src.geometry,src.material):new THREE.Group();dst.position.copy(src.position);dst.rotation.copy(src.rotation);dst.scale.copy(src.scale);parent.add(dst);for(const child of src.children)copy(child,dst);};for(const child of template.group.children)copy(child,g);}
  else {box(1,.2,.7,0,0,0,0x79939d);box(.7,.05,.45,0,.13,0,0x334954);}
 }
 return g;
}
