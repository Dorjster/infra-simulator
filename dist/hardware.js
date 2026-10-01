import {managementLayout} from './management-layout.js';
import {modelForSKU} from './enterprise-models.js';
import * as THREE from './three.module.js';
import {mergeStatic,mergePlates} from './render-optimizer.js';
// Product-inspired visual models; dimensional proportions and face layouts are simplified.
export function createHardware(scene){
const U=.267,W=2.9,F=3.0,nodes=[],links=[],pickables=[],fans=[],racks=[],byId={};
const materials={body:new THREE.MeshStandardMaterial({color:0x3f474e,metalness:.35,roughness:.62}),front:new THREE.MeshStandardMaterial({color:0x192129,metalness:.4,roughness:.56}),edge:new THREE.MeshStandardMaterial({color:0x77838c,metalness:.8,roughness:.32}),slot:new THREE.MeshStandardMaterial({color:0x53636c,metalness:.6,roughness:.45}),board:new THREE.MeshStandardMaterial({color:0x194638,roughness:.55}),black:new THREE.MeshStandardMaterial({color:0x070c11,roughness:.68}),rack:new THREE.MeshStandardMaterial({color:0x25343f,metalness:.6,roughness:.45}),silver:new THREE.MeshStandardMaterial({color:0xb4b8ba,metalness:.65,roughness:.4}),blue:new THREE.MeshBasicMaterial({color:0x008bc9})};
const mgmtSocketMat=new THREE.MeshBasicMaterial({color:0x429dff}),unitBox=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D(),textCache=new Map();
const colors={application:0xff8a38,storage:0xff8a38,management:0x429dff,replication:0xff8a38,backup:0xff8a38};
function box(parent,w,h,d,x,y,z,mat=materials.body){const m=new THREE.Mesh(unitBox,mat);m.scale.set(w,h,d);m.position.set(x,y,z);parent.add(m);return m;}
function batch(parent,positions,size,mat){const m=new THREE.InstancedMesh(unitBox,mat,positions.length);positions.forEach((p,i)=>{dummy.position.set(...p);dummy.scale.set(...size);dummy.rotation.set(0,0,0);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix)});parent.add(m);return m;}
function textTexture(text,color='#d5e1e7',bg=null){const key=text+color+bg;if(textCache.has(key))return textCache.get(key);const c=document.createElement('canvas');c.width=1024;c.height=128;const ctx=c.getContext('2d');if(bg){ctx.fillStyle=bg;ctx.fillRect(0,0,1024,128)}ctx.fillStyle=color;ctx.font='500 48px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,64,1000);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.userData.staticText=true;textCache.set(key,t);return t;}
function plate(parent,text,w,h,x,y,z,color='#d5e1e7',reverse=false){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:textTexture(text,color),transparent:true,depthWrite:false}));m.position.set(x,y,z);if(reverse)m.rotation.y=Math.PI;parent.add(m);return m;}
function label(text,x,y,z,size=.7,color='#b8d4e2',parent=scene){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:textTexture(text,color),transparent:true,depthWrite:false}));s.position.set(x,y,z);s.scale.set(size*8,size,1);parent.add(s);return s;}
function platform(x,z,w,d){const g=new THREE.Group();box(g,w,.2,d,x,-.24,z,materials.rack);const e=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w,.2,d)),new THREE.LineBasicMaterial({color:0x5b8399,transparent:true,opacity:.5}));e.position.set(x,-.24,z);g.add(e);scene.add(g);return g;}
platform(0,0,27,12);platform(25,0,14,12);
const grid=new THREE.GridHelper(120,80,0x314d60,0x1d3345);grid.position.y=-.36;grid.material.transparent=true;grid.material.opacity=.4;scene.add(grid);
function cabinet(id,x,caption,site='primary',z=0){
 const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);const height=12.25;
 for(const xx of [-1.7,1.7])for(const zz of [-3.15,3.15])box(g,.12,height,.13,xx,height/2,zz,materials.rack);
 box(g,3.6,.16,6.5,0,.03,0,materials.rack);box(g,3.6,.16,6.5,0,height,0,materials.rack);
 for(const xx of [-1.76,1.76])box(g,.08,height-.3,6.0,xx,height/2,-.1,materials.rack);
 for(const xx of [-1.51,1.51]){box(g,.08,11.6,.1,xx,6,3.1,materials.edge);box(g,.08,11.6,.1,xx,6,-3.1,materials.edge);const holes=[];for(let u=1;u<=42;u++)for(const dy of [-.074,0,.074])holes.push([xx,.48+u*U+dy,3.16]);batch(g,holes,[.037,.033,.018],materials.black);}
 for(const xx of [-1.55,1.55]){box(g,.12,10,.18,xx,5.4,-2.9,materials.black);const sockets=[];for(let i=0;i<24;i++)sockets.push([xx,.8+i*.39,-2.79]);batch(g,sockets,[.075,.14,.03],materials.slot);}
 for(let u=4;u<=40;u+=4)plate(g,String(u).padStart(2,'0')+'U',.26,.1,-1.63,.48+u*U,3.19,'#a9bcc7');
 plate(g,id+' // '+caption,3.15,.28,0,11.98,3.28,'#e0edf3');plate(g,id+' // REAR',3.1,.26,0,11.98,-3.28,'#e0edf3',true);
 for(const [dx,color]of [[-1.55,0x171b20],[1.3,0xff8a38],[1.55,0x429dff]])box(g,.08,11,.09,dx,5.8,-3.34,new THREE.MeshStandardMaterial({color,roughness:.55}));
 g.traverse(m=>{if(m.isMesh&&!m.isInstancedMesh&&m.geometry?.type==='BoxGeometry'){m.userData={occluder:true};pickables.push(m);}});
 const captionLabel=label(caption,x,12.8,z,.46);racks.push({id,x,z,g,site,label:captionLabel});mergeStatic(g,pickables);mergePlates(g);g.updateMatrixWorld(true);g.traverse(o=>{o.matrixAutoUpdate=false;});return {id,x,z,g,site,label:captionLabel};
}
const security=cabinet('R01',-9,'SECURITY / CORE'),compute=cabinet('R02',-3,'COMPUTE'),storage=cabinet('R03',3,'STORAGE / SAN'),gpu=cabinet('R04',9,'AI / GPU');
const drCompute=cabinet('R05',22,'DR COMPUTE','dr'),drStorage=cabinet('R06',28,'DR STORAGE','dr');
// Structured overhead pathways keep A/B fabrics visually separated.
const statics=new THREE.Group();statics.name='static-pathways';scene.add(statics);
for(const z of [-4.1,-4.65]){box(statics,24,.11,.13,0,13,z,materials.edge);for(let x=-11;x<=11;x+=1)box(statics,.05,.08,.5,x,13,z+.22,materials.rack);}
function vent(g,x,y,z,w,h,cols=20,rows=5){const p=[];for(let j=0;j<rows;j++)for(let i=0;i<cols;i++)p.push([x-w/2+i*w/(cols-1),y-h/2+j*h/(rows-1),z]);batch(g,p,[w/cols*.58,h/rows*.48,.018],materials.black);}
function brandedBezel(g,w,h,z,model){box(g,w,h,.075,0,0,z,materials.front);vent(g,0,0,z+.043,w*.88,h*.7,30,5);plate(g,'DELL',.38,.13,0,0,z+.057,'#f0f4f6');plate(g,model,1.05,.085,w*.2,h*.35,z+.056,'#d0dce3');box(g,.045,h*.7,.04,-w*.46,0,z+.07,materials.blue);}
function driveBays(g,count,rows,z,w,h){const cols=Math.ceil(count/rows),slots=[],handles=[],leds=[];for(let i=0;i<count;i++){const x=-w/2+(i%cols+.5)*w/cols,y=-h/2+(Math.floor(i/cols)+.5)*h/rows;slots.push([x,y,z]);handles.push([x,y-h/rows*.24,z+.031]);leds.push([x-w/cols*.3,y+h/rows*.25,z+.052]);}batch(g,slots,[w/cols*.89,h/rows*.84,.07],materials.front);batch(g,handles,[w/cols*.66,h/rows*.13,.025],materials.edge);return batch(g,leds,[.018,.032,.01],new THREE.MeshBasicMaterial({color:0x61dcae}));}
function addPorts(n,side,items){const z=side==='front'?n.depth/2+.072:-n.depth/2-.072;const p=items.map((it,i)=>[it.x,it.y,z]);const metal=batch(n.group,p,[.105,.068,.10],materials.edge),black=batch(n.group,p.map(v=>[v[0],v[1],v[2]+(side==='front'?.052:-.052)]),[.073,.047,.012],materials.black);metal.userData.node=n;black.userData.node=n;const indices=[];items.forEach((it,i)=>{indices.push(n.ports.length);n.ports.push({name:it.name,speed:it.speed??25,medium:it.medium??'Ethernet',side,pos:new THREE.Vector3(...p[i]),link:null});});metal.userData.portIndices=indices;black.userData.portIndices=indices;pickables.push(metal,black);const mgmt=items.find(it=>/^MGMT(?: UPLINK|-1)/i.test(it.name||'')&&it.speed===1);if(mgmt&&mgmt.name!=='MGMT UPLINK'){plate(n.group,mgmt.name+' · 1G RJ45',.82,.085,mgmt.x,mgmt.y+.12,side==='front'?n.depth/2+.14:-n.depth/2-.14,'#bde8f1',side==='rear');}const lights=batch(n.group,p.map(v=>[v[0]-.031,v[1]+.046,v[2]+(side==='front'?.065:-.065)]),[.021,.014,.012],n.ledMat);n.ledMeshes.push(lights);}
function addManagementPort(n){
 const layout=managementLayout(n),side=layout.side;
 addPorts(n,side,[{name:'MGMT UPLINK',speed:1,x:layout.x,y:layout.y}]);
 const p=n.ports.at(-1);p.displayName=layout.label;p.connector='RJ45';
 const z=p.pos.z+(side==='rear'?-.07:.07);
 const socket=box(n.group,.18,.09,.035,p.pos.x,p.pos.y,z,mgmtSocketMat);
 socket.userData={node:n,port:p};pickables.push(socket);
 box(n.group,.11,.052,.012,p.pos.x,p.pos.y,z+(side==='rear'?-.024:.024),materials.black);
 plate(n.group,layout.label,.6,.07,p.pos.x,p.pos.y+.077,z+(side==='rear'?-.04:.04),'#bde8f1',side==='rear');
}
function device(id,type,rack,u,units,model,{depth=4.5,bezel=false,width=W,portFace='rear',profile=null}={}){
 const h=units*U-.025,g=new THREE.Group(),y=.55+(u-1)*U+h/2,z=F-depth/2+(rack.z||0);g.position.set(rack.x,y,z);scene.add(g);const ledMat=new THREE.MeshBasicMaterial({color:type==='gpu'?0xb199ef:0x65dfb1});
 const body=box(g,width,h,depth,0,0,0,materials.body.clone());box(g,width-.05,h-.04,.055,0,0,depth/2+.018,materials.front);
 const n={id,type,model,rack:rack.id,unit:u,units,group:g,pos:g.position.clone(),color:type==='gpu'?0xac94ec:type==='storage'?0x62e2bb:0x72d9f3,body,ledMat,ledMeshes:[],ports:[],width,height:h,depth,site:rack.site,baseY:y};g.userData.node=n;nodes.push(n);byId[id]=n;body.userData.node=n;pickables.push(body);
 for(const x of [-width/2-.035,width/2+.035]){box(g,.07,h,.09,x,0,depth/2,materials.edge);const screws=[];for(const yy of [-h*.35,h*.35])screws.push([x,yy,depth/2+.06]);batch(g,screws,[.023,.023,.015],materials.black);}
 if(profile?.portLayout){const defs=profile.portLayout.map((p,i)=>({...p,x:-1.34+Math.floor(i/2)*((type==='firewall'?1.85:2.65)/Math.ceil(profile.portLayout.length/2)),y:i%2?-.06:.02}));addPorts(n,'front',defs);plate(g,model,width*.85,.075,0,h*.34,depth/2+.065,profile.vendor==='Fortinet'?'#f0bbc4':'#cce7f1');if(profile.vendor==='Fortinet')n.body.material.color.setHex(0xb2b8bd);
 }else if(type==='firewall'){
  box(g,width-.08,h-.035,.04,0,0,depth/2+.046,materials.silver);plate(g,'FORTINET',1.04,.19,-.6,h*.3,depth/2+.08,'#bc2735');plate(g,'FortiGate 4401F',1.1,.11,.61,h*.3,depth/2+.08,'#25343c');vent(g,0,-h*.31,depth/2+.071,width*.89,h*.13,40,2);
  const ports=[];for(let i=0;i<16;i++)ports.push({name:String(i+1),speed:25,x:-.67+Math.floor(i/2)*.13,y:(i%2?-.09:.045)});for(let i=0;i<12;i++)ports.push({name:String(i+17),speed:100,x:.45+Math.floor(i/2)*.145,y:i%2?-.09:.045});for(let i=0;i<4;i++)ports.push({name:['HA1','HA2','AUX1','AUX2'][i],speed:25,x:-1.22+Math.floor(i/2)*.15,y:i%2?-.09:.045});addPorts(n,'front',ports);
 }else if(type==='switch'||type==='san'){
  plate(g,type==='san'?'DELL CONNECTRIX':model,width*.65,.078,0,h*.33,depth/2+.06,'#d3e1e8');const count=type==='san'?24:48,ports=[];for(let i=0;i<count;i++)ports.push({name:type==='san'?'FC '+(i+1):'1/1/'+(i+1),speed:type==='san'?32:25,medium:type==='san'?'Fibre Channel':'Ethernet',x:-1.33+Math.floor(i/2)*(type==='san'?.185:.096),y:(i%2?-.07:.009)});if(type==='switch')for(let i=0;i<4;i++)ports.push({name:'1/1/'+(49+i),speed:100,x:1.02+Math.floor(i/2)*.16,y:i%2?-.07:.009});addPorts(n,'front',ports);box(g,.035,.12,.02,-1.42,0,depth/2+.08,materials.blue);
 }else if(type==='gpu'){
  const top=new THREE.Group();top.position.y=h*.31;g.add(top);brandedBezel(top,width-.1,h*.34,depth/2+.05,'PowerEdge XE9680');vent(g,0,-h*.18,depth/2+.065,width*.84,h*.5,32,12);
  for(let i=0;i<8;i++){const x=-1.15+i*.33;box(g,.13,h*.46,.055,x,-h*.17,depth/2+.081,materials.edge);vent(g,x,-h*.17,depth/2+.114,.065,h*.39,2,9);}
 }else if(type==='server'){
  if(bezel)brandedBezel(g,width-.08,h-.03,depth/2+.035,'PowerEdge R770');else{n.ledMeshes.push(driveBays(g,16,2,depth/2+.08,width*.84,h*.75));plate(g,model||'DELL / PowerEdge R770',1.45,.067,0,h*.43,depth/2+.13,'#d8e6ec');}
 }else if(type==='storage'){
  const isArray=model.includes('PowerStore');n.ledMeshes.push(driveBays(g,isArray?25:12,isArray?1:2,depth/2+.075,width*.9,h*.74));plate(g,'DELL  /  '+model,width*.78,.085,0,h*.42,depth/2+.13,'#dbe7ec');
 }
 if(!['firewall','switch','san','isp'].includes(type)){
  // NICs, FC HBAs and redundant PSU handles are on the rear face.
  addPorts(n,'rear',[{name:'NIC-1',speed:25,x:-.95,y:0},{name:'NIC-2',speed:25,x:-.79,y:0},{name:'HBA-A',speed:32,medium:'Fibre Channel',x:-.49,y:0},{name:'HBA-B',speed:32,medium:'Fibre Channel',x:-.33,y:0},{name:'MGMT',speed:1,x:0,y:0},{name:'DATA-1',speed:100,x:.22,y:0},{name:'DATA-2',speed:100,x:.38,y:0}]);
  for(const x of [.85,1.2]){box(g,.25,Math.min(h*.8,.3),.09,x,0,-depth/2-.04,materials.front);box(g,.03,.16,.075,x-.08,0,-depth/2-.105,materials.edge);}
  plate(g,model,1.6,.09,-.45,h*.37,-depth/2-.14,'#d6e5ec',true);
 }
 // Small identification tab and black rack rails make the mounting position legible.
 const edge=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(width,h,depth)),new THREE.LineBasicMaterial({color:0x8ca8b9,transparent:true,opacity:.25}));g.add(edge);n.edge=edge;
 n.label=label(id,rack.x,y+h/2+.09,F+.3+(rack.z||0),.26);n.label.visible=false;
 for(let i=0;i<(type==='gpu'?6:type==='server'?2:0);i++){const fan=new THREE.Group();fan.position.set(-.85+i*.30,0,-depth/2-.06);for(let j=0;j<3;j++){const b=box(fan,.025,.19,.013,0,0,0,materials.edge);b.rotation.z=j*Math.PI/3;}g.add(fan);fans.push(fan);}
 mergeStatic(g,pickables);mergePlates(g);return n;
}
function blank(r,u,units=1){box(statics,W,units*U-.025,.11,r.x,.55+(u-1)*U+units*U/2,F+.025,materials.front);}
const fwA=device('FIREWALL-A','firewall',security,29,4,'FortiGate 4401F',{depth:4.0}),fwB=device('FIREWALL-B','firewall',security,23,4,'FortiGate 4401F',{depth:4.0});
device('CORE-A','switch',security,39,1,'Dell PowerSwitch S5248F-ON',{depth:2.8});device('CORE-B','switch',security,36,1,'Dell PowerSwitch S5248F-ON',{depth:2.8});
device('TOR-01','switch',compute,39,1,'Dell PowerSwitch S5248F-ON',{depth:2.8});device('TOR-02','switch',compute,36,1,'Dell PowerSwitch S5248F-ON',{depth:2.8});
for(let i=1;i<=6;i++)device('SERVER-0'+i,'server',compute,31-(i-1)*4,2,'Dell PowerEdge R770',{depth:4.5,bezel:i%2===0});
device('TOR-03','switch',gpu,39,1,'Dell PowerSwitch S5248F-ON',{depth:2.8});device('TOR-04','switch',gpu,36,1,'Dell PowerSwitch S5248F-ON',{depth:2.8});
device('GPU-01','gpu',gpu,26,6,'Dell PowerEdge XE9680',{depth:6.0});device('GPU-02','gpu',gpu,16,6,'Dell PowerEdge XE9680',{depth:6.0});
device('SAN-A','san',storage,39,1,'Dell Connectrix FC fabric A',{depth:2.7});device('SAN-B','san',storage,36,1,'Dell Connectrix FC fabric B',{depth:2.7});
const array=device('NVMe ENCLOSURE','storage',storage,27,2,'PowerStore 3200T',{depth:4.7});
// Controller nodes occupy the two rear modules of the same physical PowerStore chassis.
for(const [suffix,dy]of [['A',.125],['B',-.125]]){const g=new THREE.Group();g.position.set(storage.x,array.pos.y+dy,array.pos.z-array.depth/2-.11);scene.add(g);const body=box(g,2.64,.22,.23,0,0,0,materials.body.clone());const n={id:'CONTROLLER-'+suffix,type:'storage',model:'PowerStore 3200T / Node '+suffix,rack:storage.id,unit:27,units:1,group:g,pos:g.position.clone(),width:2.64,height:.22,depth:.23,color:0x62e2bb,body,ledMat:new THREE.MeshBasicMaterial({color:0x62e2bb}),ledMeshes:[],ports:[],site:'primary',controller:true};nodes.push(n);byId[n.id]=n;body.userData.node=n;pickables.push(body);addPorts(n,'rear',[{name:'FC-1',speed:32,medium:'Fibre Channel',x:-.7,y:0},{name:'FC-2',speed:32,medium:'Fibre Channel',x:-.5,y:0},{name:'CACHE',speed:100,medium:'Internal',x:.15,y:0},{name:'REPL',speed:25,x:.4,y:0}]);plate(g,'NODE '+suffix,1.2,.085,.3,0,-.13,'#def2e8',true);n.label=label(n.id,storage.x,n.pos.y,-4.0,.25);n.label.visible=false;}
device('OBJECT STORAGE','storage',storage,18,2,'Dell ObjectScale X560',{depth:4.5});device('BACKUP','storage',storage,10,2,'Dell PowerProtect DD',{depth:4.5});
device('DR-CORE','switch',drCompute,39,1,'Dell PowerSwitch S5248F-ON',{depth:2.8});device('DR-COMPUTE','server',drCompute,29,2,'Dell PowerEdge R770',{depth:4.5,bezel:true});device('DR-GPU','gpu',drCompute,16,6,'Dell PowerEdge XE9680',{depth:6});device('DR-STORAGE','storage',drStorage,27,2,'PowerStore 3200T',{depth:4.7});
for(const r of racks)for(const [u,n]of [[3,3],[7,1],[42,1]])blank(r,u,n);mergeStatic(statics,pickables);mergePlates(statics);
function cloud(id,x,y,z){const g=new THREE.Group();g.position.set(x,y,z);scene.add(g);const ring=new THREE.Mesh(new THREE.TorusGeometry(.85,.03,6,50),new THREE.MeshBasicMaterial({color:0x83d4e7}));ring.rotation.x=Math.PI/2;g.add(ring);const sphere=new THREE.Mesh(new THREE.IcosahedronGeometry(.52,1),new THREE.MeshStandardMaterial({color:0x426c82,metalness:.5,roughness:.4,wireframe:true}));g.add(sphere);const n={id,type:'cloud',model:id,rack:'EDGE',group:g,pos:g.position.clone(),ports:[],ledMeshes:[],site:'primary',color:0x72d9f3,body:sphere,label:label(id,x,y+1,z,.37)};sphere.userData.node=n;pickables.push(sphere);g.userData.node=n;nodes.push(n);byId[id]=n;}
cloud('INTERNET',-13,15.5,0);cloud('CLOUD EDGE',-9,14,0);
function reservePort(n,kind,speed){let p=n.ports.find(p=>!p.link&&(kind==='storage'?p.medium==='Fibre Channel':kind==='management'?p.name==='MGMT':p.medium!=='Fibre Channel'&&p.speed>=speed));if(!p)p=n.ports.find(p=>!p.link);if(!p){p={name:n.type==='cloud'?'WAN':'INTERNAL',speed:speed??100,side:'rear',medium:'Internal',pos:new THREE.Vector3(0,0,0),link:null};n.ports.push(p);}return p;}
function connect(a,b,kind='application',tag='',speed=100,ports=null){const na=byId[a],nb=byId[b];if(kind==='storage')speed=32;if(kind==='management')speed=1;if((na.type==='server'||nb.type==='server')&&kind==='application')speed=25;const pa=ports?.[0]??reservePort(na,kind,speed),pb=ports?.[1]??reservePort(nb,kind,speed);speed=Math.min(speed,pa.speed,pb.speed);if(a.startsWith('CONTROLLER')&&b==='NVMe ENCLOSURE'){pa.name='NVMe BACKPLANE';pb.name='NODE '+a.slice(-1)+' BACKPLANE';pa.medium=pb.medium='Internal';}const start=pa.pos.clone().add(na.pos),end=pb.pos.clone().add(nb.pos);let curve;
 if(kind==='storage'&&(a.startsWith('CONTROLLER')||b==='NVMe ENCLOSURE')&&na.rack===nb.rack){curve=new THREE.CatmullRomCurve3([start,start.clone().add(new THREE.Vector3(.5,0,-.3)),end]);}
 else{const sign=kind==='storage'?tag==='path-a'?-1:1:kind==='management'?-1:1,lane=-4.0-(kind==='storage'?.65:kind==='replication'?1.0:0),sx=na.pos.x+sign*1.95,ex=nb.pos.x+sign*1.95,top=13+(links.length%6)*.06;const outStart=start.z+(pa.side==='front'?.45:-.45),outEnd=end.z+(pb.side==='front'?.45:-.45);const points=[start,new THREE.Vector3(start.x,start.y,outStart),new THREE.Vector3(sx,start.y,outStart),new THREE.Vector3(sx,start.y,lane)];if(na.rack===nb.rack)points.push(new THREE.Vector3(sx,end.y,lane));else points.push(new THREE.Vector3(sx,top,lane),new THREE.Vector3(ex,top,lane),new THREE.Vector3(ex,end.y,lane));points.push(new THREE.Vector3(ex,end.y,outEnd),new THREE.Vector3(end.x,end.y,outEnd),end);curve=new THREE.CatmullRomCurve3(points,false,'catmullrom',.15);}
 const material=new THREE.MeshBasicMaterial({color:colors[kind],transparent:true,opacity:.36});const line=new THREE.Mesh(new THREE.TubeGeometry(curve,60,.021,4,false),material);scene.add(line);const bright=new THREE.Mesh(new THREE.TubeGeometry(curve,60,.044,5,false),new THREE.MeshBasicMaterial({color:colors[kind],transparent:true,opacity:0,depthWrite:false}));scene.add(bright);const l={a,b,kind,tag,curve,line,bright,disabled:false,phase:Math.random(),speed,pa,pb};line.userData.link=l;const hit=new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(80)),new THREE.LineBasicMaterial({transparent:true,opacity:0,depthWrite:false,visible:false}));hit.userData.link=l;scene.add(hit);l.hit=hit;pickables.push(hit);links.push(l);pa.link=l;pb.link=l;return l;}
connect('INTERNET','CLOUD EDGE');for(const s of ['A','B']){connect('CLOUD EDGE','FIREWALL-'+s);connect('FIREWALL-'+s,'CORE-'+s);}connect('CORE-A','CORE-B');for(let i=1;i<=4;i++){connect('CORE-A','TOR-0'+i,'application',i===2?'uplink-02':'');connect('CORE-B','TOR-0'+i);}
for(let i=1;i<=6;i++){connect('TOR-01','SERVER-0'+i,'application','',25);connect('TOR-02','SERVER-0'+i,'application','',25);connect('TOR-02','SERVER-0'+i,'management','',1);connect('SERVER-0'+i,'SAN-A','storage','path-a');connect('SERVER-0'+i,'SAN-B','storage','path-b');}
for(const c of ['A','B'])for(const s of ['A','B'])connect('SAN-'+s,'CONTROLLER-'+c,'storage',s==='A'?'path-a':'path-b');
connect('CONTROLLER-A','NVMe ENCLOSURE','storage');connect('CONTROLLER-B','NVMe ENCLOSURE','storage');connect('CORE-B','OBJECT STORAGE');connect('NVMe ENCLOSURE','BACKUP','backup');connect('OBJECT STORAGE','BACKUP','backup');connect('OBJECT STORAGE','GPU-01','replication');connect('OBJECT STORAGE','GPU-02','replication');connect('TOR-03','GPU-01');connect('TOR-04','GPU-02');connect('BACKUP','DR-STORAGE','replication','',25);connect('OBJECT STORAGE','DR-STORAGE','replication','',25);connect('DR-CORE','DR-COMPUTE');connect('DR-CORE','DR-GPU');connect('DR-COMPUTE','DR-STORAGE','storage');connect('CLOUD EDGE','DR-CORE','application','dr-ingress');
// Dedicated, visible management fabric for the training environment.
const management=device('MGMT-SW','switch',security,20,1,'Management Ethernet switch / training fabric',{depth:2.8});
// Keep one dedicated RJ45 management jack easy to find for field patching.
// Keep the dedicated management socket on the rear, separate from data ports.
management.ports.forEach((p,i)=>{p.name='MGMT-'+(i+2);p.speed=1;});
addPorts(management,'rear',[{name:'MGMT-1',speed:1,x:0,y:0}]);
for(const n of nodes.filter(n=>n.type!=='cloud'&&n!==management)){
 addManagementPort(n);const profile=modelForSKU(n.spec?.sku);n.ports.find(p=>p.name==='MGMT UPLINK').alias=profile?.vendor==='Cisco'?'mgmt0':profile?.vendor==='Fortinet'||n.type==='firewall'?'mgmt':'mgmt1/1/1';
 const pa=management.ports.find(p=>p.name!=='MGMT-1'&&!p.link),pb=n.ports.at(-1);
 connect(management.id,n.id,'management','mgmt-fabric',1,[pa,pb]);mergeStatic(n.group,pickables);mergePlates(n.group);
}
mergeStatic(management.group,pickables);mergePlates(management.group);
const endpointMarkers=[0,1].map(()=>{const m=new THREE.Mesh(new THREE.SphereGeometry(.105,12,8),new THREE.MeshBasicMaterial({color:0xeaffff,transparent:true,opacity:.95}));m.visible=false;scene.add(m);return m;});
function spawn(spec){if(byId[spec.id])return byId[spec.id];const rack=racks.find(r=>r.id===spec.rack);if(!rack)throw Error('Unknown rack');const n=device(spec.id,spec.type,rack,spec.unit,spec.units,spec.model,{depth:spec.type==='gpu'?6:['switch','san','isp'].includes(spec.type)?2.8:4.5,profile:modelForSKU(spec.sku)});n.spec=spec;addManagementPort(n);const profile=modelForSKU(n.spec?.sku);n.ports.find(p=>p.name==='MGMT UPLINK').alias=profile?.vendor==='Cisco'?'mgmt0':profile?.vendor==='Fortinet'||n.type==='firewall'?'mgmt':'mgmt1/1/1';if(spec.sku==='mgmt')n.ports.forEach(p=>p.speed=1);if(spec.sku==='core')n.ports.filter(p=>p.name!=='MGMT UPLINK').forEach(p=>p.speed=100);if(spec.sku==='san64')n.ports.filter(p=>p.name!=='MGMT UPLINK').forEach(p=>p.speed=64);if(spec.sku==='switch24')n.ports.slice(24,48).forEach(p=>p.reserved=true);if(!['switch','san','firewall','isp'].includes(n.type)){const power=box(n.group,.09,.09,.04,-1.3,0,n.depth/2+.16,new THREE.MeshBasicMaterial({color:0x8bc6eb}));power.userData={node:n,powerButton:true};pickables.push(power);}for(let i=0;i<2;i++){const socket=box(n.group,.16,.14,.12,.85+i*.35,0,-n.depth/2-.18,materials.black);socket.userData={node:n,powerPSU:i};pickables.push(socket);}mergeStatic(n.group,pickables);mergePlates(n.group);return n;}
return {spawn,addRack:r=>racks.find(x=>x.id===r.id)||cabinet(r.id,r.x,'EXPANSION',r.site,r.z||0),nodes,links,pickables,fans,byId,materials,box,label,racks,endpointMarkers,trafficColors:colors,connect};
}
