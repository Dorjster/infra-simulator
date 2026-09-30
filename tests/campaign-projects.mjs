import assert from 'node:assert/strict';
import {a} from './app-harness.mjs';
import {CATALOG,PROJECTS} from '../dist/operations.js';
import {hostIdentifiers} from '../dist/product-config.js';
const w=a.lab.world,o=w.operations;
const act=action=>w.apply({type:'engineering',action},'ENGINEER-01');
const cfg=(n,value)=>w.apply({type:'config',action:{node:n.id,...value}},'ENGINEER-01');
const prod=(n,op,value)=>w.apply({type:'config',action:{type:'product',node:n.id,op,value}},'ENGINEER-01');let storage;
act({type:'mode',mode:'campaign'});
let ip=140;
function buy(sku,length=7){act({type:'order',sku,quantity:1,length});const order=o.game.orders.at(-1);order.arrives=0;act({type:'unbox',id:order.id});return o.game.stock.find(s=>s.sku===sku&&!s.holders.length);}
function patch(a,b,pa,pb,sku='cat6',length=7){
 const s=buy(sku,length);act({type:'grab',id:s.id});act({type:'start-end',id:s.id,node:a.id,port:pa});
 act({type:'patch',id:s.id,a:a.id,b:b.id,pa,pb});
}
function install(sku,dr=false){
 const c=CATALOG.find(c=>c.id===sku);let rack,unit;
 for(const r of dr?['R05','R06']:['R01','R02','R03','R04']){for(let u=1;u+c.units<=43;u++)if(!o.available().some(n=>n.rack===r&&n.unit<u+c.units&&n.unit+n.units>u)){rack=r;unit=u;break;}if(rack)break;}
 assert(rack);const s=buy(sku);act({type:'grab',id:s.id});act({type:'mount',id:s.id,rack,unit});const n=a.byId[o.game.installed.at(-1)];
 for(const [psu,feed]of [[0,'A'],[1,'B']])act({type:'power',id:o.game.stock.find(s=>s.sku==='power').id,node:n.id,psu,feed});
 if(!n.physical.on)act({type:'boot',node:n.id});n.physical.bootUntil=0;o.tick();
 const hub=a.byId['MGMT-SW'],pa=n.ports.findIndex(p=>p.name==='MGMT UPLINK'),pb=hub.ports.findIndex(p=>!p.link&&!p.service&&p.speed===1);
 patch(n,hub,pa,pb);
 cfg(n,{type:'vlan',id:70});cfg(n,{type:'address',ip:'10.10.70.'+(ip++),prefix:24,vlan:70});cfg(n,{type:'ssh',enabled:true});cfg(hub,{type:'port',index:pb,value:{mode:'access',access:70}});
 return n;
}
const installed=()=>o.available().filter(n=>n.spec);
for(let i=0;i<PROJECTS.length;i++){
 assert.equal(o.game.project,i);
 const p=PROJECTS[i];if(o.validation().checks.some(c=>!c.ok))assert.equal(act({type:'validate'}),'Project requirements not met');
 for(const[type,count]of Object.entries(p.types||{}))while(installed().filter(n=>n.type===type).length<count)install({switch:'switch24',server:'server2',storage:'array',san:'san32',gpu:'gpu',firewall:'firewall'}[type]);
 if(p.sku&&!installed().some(n=>n.spec.sku===p.sku)){const n=install(p.sku);cfg(n,{type:'settings',value:{backup:'enabled'}});}
 if(p.redundancy)for(const n of installed().filter(n=>['server','gpu'].includes(n.type)))for(const sw of installed().filter(n=>n.type==='switch').slice(0,2)){
  if(a.links.some(l=>!l.unplugged&&((l.a===n.id&&l.b===sw.id)||(l.b===n.id&&l.a===sw.id))))continue;
  patch(n,sw,n.ports.findIndex(p=>!p.link&&!p.service&&p.speed===25),sw.ports.findIndex(p=>!p.link&&!p.reserved&&!p.service&&p.speed===25),'dac25');
 }
 // Project 4: real block storage. Array initial setup, host FC initiator, volume + masking, and two
 // direct-attached FC paths; the check reads volume visibility, not a typed mapping string.
 if(p.storage){const n=installed().find(n=>n.type==='storage'),h=installed().find(n=>n.type==='server'),ids=hostIdentifiers(h),hc={os:'Linux',raid:'RAID 1 boot',protocol:'FC',portA:'HBA-A',portB:'HBA-B',mtu:1500,...ids,initiatorEnabled:true};
  assert.match(prod(n,'identity',{name:'ARRAY-01',passwordChanged:true,mode:'Unified',protection:'Double drive'}),/^Applied/);assert.match(prod(h,'host',hc),/^Applied/);
  assert.match(prod(n,'storage',{...hc,pool:'POOL-A',volume:'DATA01',sizeGiB:1000,host:h.id,initiator:ids.wwpnA}),/^Applied/);
  assert(!o.validation().checks.find(c=>/storage volume/i.test(c.text)).ok,'mapping without a data path is not enough');
  for(const side of ['A','B']){const pa=n.ports.findIndex(x=>x.name==='HBA-'+side),pb=h.ports.findIndex(x=>x.name==='HBA-'+side);for(const[d,port]of [[n,pa],[h,pb]]){const s=buy('FC32SR');act({type:'optic',id:s.id,node:d.id,port});}patch(n,h,pa,pb,'fc',30);}
  storage={n,h,ids};}
 // Project 5: move the direct FC cables onto two SAN switches (A/B), add host-side cables and zone
 // each fabric with its host/target WWPN pair. Checked through the same volume-access paths.
 if(p.san){const {n,h,ids}=storage,target=hostIdentifiers(n),sans=installed().filter(x=>x.type==='san');
  sans.forEach((sw,k)=>{const side=k?'B':'A',ha=h.ports.findIndex(x=>x.name==='HBA-'+side),na=n.ports.findIndex(x=>x.name==='HBA-'+side);
   const free=sw.ports.map((x,i)=>i).filter(i=>!sw.ports[i].link&&sw.ports[i].medium==='Fibre Channel').slice(0,2);
   for(const port of free){const s=buy('FC32SR');act({type:'optic',id:s.id,node:sw.id,port});}
   act({type:'unplug-end',node:h.id,port:ha});const moved=o.game.stock.find(x=>x.holders.includes('ENGINEER-01'));
   act({type:'patch',id:moved.id,a:n.id,pa:na,b:sw.id,pb:free[0]});patch(h,sw,ha,free[1],'fc',30);
   assert.match(prod(sw,'fabric',{aliases:{host:[ids['wwpn'+side]],target:[target['wwpn'+side]]},zones:{z:['host','target']},configs:{prod:['z']},members:[ids['wwpn'+side],target['wwpn'+side]],enabled:true,active:'HOST-STORAGE'}),/^Applied/);
  });
  assert.equal(a.lab.kit.network.volumeAccess(n,'DATA01',h).state,'healthy');
 }
 if(p.dr){install('server2',true);const n=install('array',true);cfg(n,{type:'settings',value:{replication:'enabled'}});}
 const checks=o.validation().checks;assert(checks.every(c=>c.ok),p.name+JSON.stringify(checks.filter(c=>!c.ok)));
 assert.match(act({type:'validate'}),/^Project complete/);const saved=w.snapshot();w.restore(saved);assert.equal(o.game.project,i+1);
 console.log('PASS campaign '+(i+1)+': '+p.name);
}
process.exit(0);
