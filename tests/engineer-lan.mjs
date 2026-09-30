import {spawn} from 'node:child_process';
import {mkdtemp,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=await mkdtemp(path.join(os.tmpdir(),'infra-roles-')),save=path.join(temp,'campaign.json');
const HOST_KEY='regression-only-host-key';let child,base,revision=0,last;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function start(){
 child=spawn(process.execPath,['lan/server.mjs'],{cwd:root,env:{...process.env,PORT:'0',BIND:'127.0.0.1',ROOM_CODE:'ROLES18',HOST_KEY,CAMPAIGN_SAVE:save},stdio:['ignore','pipe','pipe']});
 let err='';child.stderr.on('data',d=>err+=d);
 await new Promise((resolve,reject)=>{child.stdout.on('data',d=>{const m=/localhost:(\d+)/.exec(String(d));if(m){base='http://127.0.0.1:'+m[1];resolve();}});child.on('exit',()=>reject(Error(err)));});
}
async function stop(){if(!child||child.exitCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGINT');setTimeout(()=>child.kill('SIGKILL'),1500).unref();});}
async function post(route,data,token){const r=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-Player-Token':token}:{})},body:JSON.stringify(data)});return {status:r.status,...await r.json()};}
async function action(a,p,status=200){
 await delay(40);
 let out=await post('action',{revision,action:a},p.token);
 for(let i=0;i<4&&out.status===409&&out.world;i++){revision=out.revision;out=await post('action',{revision,action:a},p.token);}
 assert.equal(out.status,status,out.error||out.message);
 if(out.revision!==undefined)revision=out.revision;if(out.world)last=out;
 return out;
}
const eng=(a,p,status)=>action({type:'engineering',action:a},p,status);
try{
 await start();
 const localRoom=await fetch(base+'/api/room').then(r=>r.json());
 assert.equal(localRoom.localHost,true,'localhost browser can initialize the host session');
 assert.equal(localRoom.roomCode,'ROLES18');assert.equal(localRoom.hostKey,HOST_KEY);
 assert.equal((await post('join',{code:'WRONG'})).status,403,'room credential remains enforced');
 assert.equal((await post('join',{code:'ROLES18',hostKey:'wrong'})).status,403);
 const field=await post('join',{code:'ROLES18',name:'Field',isHost:true,role:'host'});
 assert.equal(field.isHost,false,'first player and client flags cannot claim host');
 const ops=await post('join',{code:'ROLES18',name:'Operations'});
 assert.equal((await post('role',{role:'operations'},ops.token)).status,200);
 const host=await post('join',{code:'ROLES18',name:'Host',hostKey:HOST_KEY});
 assert.equal(host.isHost,true);
 const occupiedRoom=await fetch(base+'/api/room').then(r=>r.json());assert.equal(occupiedRoom.localHost,false);assert(!occupiedRoom.hostKey,'host key is no longer returned after host joins');
 assert.equal((await post('join',{code:'ROLES18',hostKey:HOST_KEY})).status,409);
 assert(!JSON.stringify(host.world).includes(HOST_KEY));assert(!JSON.stringify(host.players).includes(HOST_KEY));
 for(const p of [field,ops]){
   for(const a of [{type:'mode',mode:'campaign'},{type:'mode',mode:'free'},{type:'begin'},{type:'checkpoint'},{type:'recover'}])await eng(a,p,403);
   await action({type:'reset-cables'},p,403);
   assert.equal((await post('role',{role:'network'},p.token)).status,400,'no specialized classes');
   // Cosmetic metadata cannot grant host power.
   await eng({type:'mode',mode:'campaign',isHost:true,title:'Host',specialty:'Security',assignment:'Network'},p,403);
 }

 // Office authentication, data confidentiality and title-independent authorization.
 const office=(a,p,status)=>action({type:'office',action:a},p,status);
 await office({type:'login',pc:'F1-finance-PC',user:'finance',password:'OfficeLab19!'},field);
 const financeFiles=await office({type:'file',pc:'F1-finance-PC',share:'finance',op:'read',name:'welcome.txt'},field);
 assert.match(financeFiles.result.content,/finance/);assert(!JSON.stringify(financeFiles.world).includes('finance department information'));
 assert(!JSON.stringify(financeFiles.world).includes('passwordHash'));
 const otherFiles=await office({type:'file',pc:'F1-finance-PC',share:'finance',op:'read',name:'welcome.txt'},ops);
 assert.equal(otherFiles.result.ok,false,'a teammate cannot reuse another player session');
 await office({type:'configure',page:'wan',value:{up:false}},ops,400);
 await office({type:'login',user:'itadmin',password:'OfficeLab19!'},ops);
 await office({type:'configure',page:'dns',value:{id:'coop.company.test',ip:'10.10.50.10',enabled:true}},ops);
 assert(last.world.office.dns['coop.company.test']);
 await office({type:'reset-office',mode:'free'},ops,400);
 await eng({type:'mode',mode:'campaign',name:'Equal engineer capabilities'},host);
 const orders=[];
 for(const p of [field,ops]){await eng({type:'order',sku:'r660',quantity:1,length:5},p);orders.push(last.world.operations.orders.at(-1));}
 await delay(Math.max(0,Math.max(...orders.map(o=>o.arrives))-Date.now()+40));
 const devices=[];
 for(const [i,p] of [field,ops].entries()){
   await eng({type:'unbox',id:orders[i].id},p);
   const stock=last.world.operations.stock.filter(s=>s.order===orders[i].id),server=stock.find(s=>s.sku==='r660'),rail=stock.find(s=>s.sku==='rail');
   await eng({type:'rails',id:rail.id,rack:'R02',unit:18+i*3,units:1},p);
   await eng({type:'grab',id:server.id},p);
   // Title changes cannot lose equipment or change skills.
   assert.equal((await post('role',{role:i?'field':'operations'},p.token)).status,200);
   assert.equal((await post('role',{role:i?'operations':'field'},p.token)).status,200);
   await eng({type:'mount',id:server.id,rack:'R02',unit:18+i*3},p);
   const id=last.world.operations.installed.at(-1);devices.push(id);
   await eng({type:'power',id:stock.find(s=>s.sku==='power').id,node:id,psu:0,feed:'A'},p);
   await eng({type:'boot',node:id},p);
   await action({type:'config',action:{type:'product',node:id,op:'management',value:{ip:'10.10.70.'+(180+i),prefix:24,gateway:'10.10.70.1',vlan:70,ssh:true}}},p);
   assert.equal(last.world.nets.find(n=>n.id===id).net.ip,'10.10.70.'+(180+i));
   await action({type:'config',action:{type:'port',node:'MGMT-SW',index:i,value:{admin:true,access:70}}},p);
   await eng({type:'validate'},p); // Campaign objective validation is universal.
 }
 // A guest starts the simulated OS installer; the host tick completes it and it persists.
 await delay(4300);
 await action({type:'config',action:{type:'device-op',node:devices[0],op:'os',value:{os:'VMware ESXi',raid:'RAID 1 boot'}}},ops);
 assert.equal(last.world.nets.find(n=>n.id===devices[0]).net.runtime.install.state,'installing',last.message);
 await delay(8600);
 await action({type:'config',action:{type:'device-op',node:devices[0],op:'portgroup',value:{id:'Servers',vlan:50,uplinks:'0'}}},field);
 assert.equal(last.world.nets.find(n=>n.id===devices[0]).net.runtime.os,'VMware ESXi','installer completed on the host');
 assert.match(last.message,/^Applied/,'hypervisor usable by the other title after installation');
 await eng({type:'checkpoint'},host);await eng({type:'recover'},host);
 const saved=JSON.parse(await readFile(save,'utf8'));assert.equal(saved.operations.name,'Equal engineer capabilities');
 for(const id of devices)assert(saved.operations.installed.includes(id));
 // Twelve player room remains available, including the host.
 for(let i=3;i<12;i++)assert.equal((await post('join',{code:'ROLES18',name:'Guest '+i})).status,200);
 assert.equal((await post('join',{code:'ROLES18'})).status,409);
 await stop();await start();revision=0;
 const rejoin=await post('join',{code:'ROLES18',name:'Guest after restart'});
 assert.equal(rejoin.isHost,false);assert.equal(rejoin.world.operations.name,'Equal engineer capabilities');
 for(const id of devices)assert(rejoin.world.operations.installed.includes(id));
 assert.equal(rejoin.world.nets.find(n=>n.id===devices[0]).net.runtime.portgroups.Servers.vlan,50,'server runtime state persists across host restart');
 await eng({type:'checkpoint'},rejoin,403);
 console.log('PASS: both guest titles purchase/unbox/rail/carry/mount/power/configure/validate; cosmetic title switches while carrying; room credentials; no first-join or forged host privileges; protected modes/checkpoints/recovery/reset; 12 players; campaign persistence and host authority after restart.');
}finally{await stop();}
