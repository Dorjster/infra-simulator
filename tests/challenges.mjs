import assert from 'node:assert/strict';
import {a} from './app-harness.mjs';
import {CHALLENGES,CATALOG,LEGACY_CHALLENGES} from '../dist/operations.js';
let randomSeed=Number(process.env.TEST_SEED||12345);
Math.random=()=>((randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0)/4294967296);
const w=a.lab.world,op=w.operations,actor='ENGINEER-01';
const act=action=>w.apply({type:'engineering',action},actor);
const cfg=action=>w.apply({type:'config',action},actor);
function buy(sku,length=30){
 act({type:'order',sku,quantity:1,length});
 const order=op.game.orders.at(-1);order.arrives=0;act({type:'unbox',id:order.id});
 return op.game.stock.find(s=>s.sku===sku&&!s.holders.length);
}
function install(){
 const s=op.game.stock.find(s=>s.sku==='server2')||buy('server2');
 act({type:'grab',id:s.id});act({type:'mount',id:s.id,rack:'R01',unit:4});
 const n=a.byId[op.game.installed.at(-1)];
 act({type:'power',id:op.game.stock.find(s=>s.sku==='power').id,node:n.id,psu:0,feed:'A'});
 act({type:'boot',node:n.id});n.physical.bootUntil=0;op.tick();
 const hub=a.byId['MGMT-SW'],pa=n.ports.findIndex(p=>p.name==='MGMT UPLINK'),pb=hub.ports.findIndex(p=>!p.service&&!p.link&&p.speed===1);
 const c=buy('cat6');act({type:'grab',id:c.id});act({type:'start-end',id:c.id,node:n.id,port:pa});
 act({type:'patch',id:c.id,a:n.id,pa,b:hub.id,pb});
 cfg({type:'address',node:n.id,ip:'10.10.70.200',prefix:24});
 cfg({type:'vlan',node:n.id,id:70});cfg({type:'address',node:n.id,ip:'10.10.70.200',prefix:24,vlan:70});
 cfg({type:'port',node:n.id,index:pa,value:{access:70}});
 cfg({type:'port',node:hub.id,index:pb,value:{access:70}});
 cfg({type:'ssh',node:n.id,enabled:true});
}
for(let index=0;index<LEGACY_CHALLENGES;index++){
 act({type:'mode',mode:'challenge',index});
 const baseline=w.snapshot();
 assert.equal(op.alerts().length,0,'healthy baseline '+CHALLENGES[index]);
 act({type:'begin'});
 assert.notEqual(act({type:'validate'}),'Challenge complete','must fail before repair '+index);
 if(index===0){
  for(const order of op.game.orders){order.arrives=0;if(!order.opened)act({type:'unbox',id:order.id});}
  install();
 }else{
  for(const n of op.available()){
   const before=baseline.nets.find(x=>x.id===n.id).net;
   if(n.net.ip!==before.ip)cfg({type:'address',node:n.id,ip:before.ip,prefix:before.prefix,vlan:before.vlan});
   if(n.net.load!==before.load)cfg({type:'load',node:n.id,value:before.load});
   for(let i=0;i<n.ports.length;i++){
    const p=n.ports[i];
    if(JSON.stringify(p.cfg)!==JSON.stringify(before.ports[i]))cfg({type:'port',node:n.id,index:i,value:before.ports[i]});
    if(p.fault==='optic'){
     const optic=CATALOG.find(c=>c.type==='optic'&&c.speed===p.speed&&c.medium===p.medium);
     assert(optic,'repairable optic '+p.name);const s=buy(optic.id);act({type:'optic',id:s.id,node:n.id,port:i});
    }
   }
   if(n.physical?.fault){const s=buy(n.physical.fault);act({type:'repair',id:s.id,node:n.id});}
  }
  for(const c of baseline.cables.filter(c=>!c.unplugged)){
   const n=a.byId[c.a],p=n.ports[c.pa],other=a.byId[c.b].ports[c.pb];
   if(p.link&&other.link)continue;
   assert.equal(p.speed,other.speed,'physical repair endpoints match');
   const sku=p.medium==='Fibre Channel'?'fc':p.speed===1?'cat6':'fiber';
   if(sku==='fiber'||sku==='fc')for(const [id,i] of [[c.a,c.pa],[c.b,c.pb]]){
    const port=a.byId[id].ports[i],optic=CATALOG.find(o=>o.type==='optic'&&o.speed===port.speed&&o.medium===port.medium);
    assert(optic);const s=buy(optic.id);act({type:'optic',id:s.id,node:id,port:i});
   }
   const s=buy(sku);act({type:'grab',id:s.id});act({type:'start-end',id:s.id,node:c.a,port:c.pa});
   act({type:'patch',id:s.id,a:c.a,pa:c.pa,b:c.b,pb:c.pb});
  }
 }
 assert.equal(act({type:'validate'}),'Challenge complete',CHALLENGES[index]+': '+JSON.stringify(op.alerts()));
 console.log('PASS challenge '+(index+1)+': '+CHALLENGES[index]);
}
process.exit(0);
