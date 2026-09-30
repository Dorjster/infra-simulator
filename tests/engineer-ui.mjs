import fs from 'node:fs';import {fileURLToPath,pathToFileURL} from 'node:url';import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const assetRoot=fs.existsSync(path.join(root,'dist/index.html'))?path.join(root,'dist'):root;const asset=name=>pathToFileURL(path.join(assetRoot,name)).href;
const title=process.argv[2]||'field';assert(['field','operations'].includes(title));
globalThis.fetch=async()=>({ok:false,status:404});import assert from 'node:assert/strict';
class El{constructor(){this.style={};this.dataset={};this.hidden=false;this.classList={add(){},remove(){},toggle(){}};this.value='';this.options=[];this.selectedIndex=0;}set innerHTML(html){this._html=html;this.nav=null;for(const m of html.matchAll(/<(input|select|button|fieldset|output|pre|div)[^>]*\bid="([^"]+)"[^>]*>/g)){const e=document.getElementById(m[2]);e.value=/\bvalue="([^"]*)"/.exec(m[0])?.[1]||'';e.checked=/\bchecked\b/.test(m[0]);if(m[1]==='select'){const end=html.slice(m.index).indexOf('</select>'),body=html.slice(m.index,m.index+end),opts=[...body.matchAll(/<option value="([^"]*)"([^>]*)>/g)];e.value=(opts.find(o=>o[2].includes('selected'))||opts[0])?.[1]||'';}}if(html.includes('data-pg-page'))this.nav=[...html.matchAll(/data-pg-page="([^"]+)"/g)].map(m=>{const e=new El();e.dataset.pgPage=m[1];return e;});}get innerHTML(){return this._html||''}insertAdjacentHTML(_where,html){this.innerHTML=html;}replaceChildren(...items){this.options=items;this.value=items[0]?.value??'';}addEventListener(){}setAttribute(){}append(){}querySelectorAll(selector){if(this.nav)return this.nav;return selector==='[data-pg-page]'?[...(this._html||'').matchAll(/data-pg-page="([^"]+)"/g)].map(m=>{const e=new El();e.dataset.pgPage=m[1];return e;}):[]}querySelector(){return new El()}focus(){}remove(){}setPointerCapture(){}click(){this.onclick?.()}getContext(){return {createRadialGradient(){return{addColorStop(){}}},fillRect(){},fillText(){}}}}
const slotButtons=[0,1,2].map(n=>{const e=new El();e.dataset.slot=String(n);e.textContent=n?n+' Empty':'0 Hands';return e;});const els=new Map();globalThis.Option=class{constructor(text,value){this.text=text;this.value=String(value)}};globalThis.document={addEventListener(){},getElementById(id){if(!els.has(id))els.set(id,new El());return els.get(id)},querySelector(){return new El()},querySelectorAll(sel){return sel==='[data-slot]'?slotButtons:[]},createElement(){return new El()},body:new El(),hidden:false};
const listeners={};
Object.assign(globalThis,{innerWidth:1440,innerHeight:900,devicePixelRatio:1,matchMedia:()=>({matches:false}),addEventListener(type,fn){(listeners[type]??=[]).push(fn)},requestAnimationFrame(){}});
globalThis.MockRenderer=class{setPixelRatio(){}setSize(){}setClearColor(){}getPixelRatio(){return 1}render(){}};
const THREE=await import(asset('three.module.js'));globalThis.MockControls=class{constructor(camera){this.camera=camera;this.target=new THREE.Vector3();this.mouseButtons={LEFT:0}}addEventListener(){}update(){this.camera.lookAt(this.target)}};
let src=fs.readFileSync(path.join(assetRoot,'app.js'),'utf8').replace("import { OrbitControls } from './OrbitControls.js';","const OrbitControls=globalThis.MockControls;").replace('new THREE.WebGLRenderer(','new globalThis.MockRenderer(');
src=src.replace(/from '\.\/([^']+)'/g,(_,name)=>"from '"+asset(name)+"'");
src+='\nglobalThis.testApp={lab,state,nodes,links,byId,racks,selectLayer,simulate,restoreAll,command,animate,chooseDevice,chooseLink,zoomBy,camera,orbitControls,setCamera,goalTarget,goalCamera,scene};';
await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));const a=globalThis.testApp;


await new Promise(r=>setTimeout(r,0));
let serviceChecked=false;const kit=a.lab.kit,w=a.lab.world,o=w.operations,eng=a.lab.engineering,net=kit.network;
const act=x=>w.apply({type:'engineering',action:x},'ENGINEER-01');
const cfg=x=>w.apply({type:'config',action:x});
const {ENTERPRISE_MODELS}=await import(asset('enterprise-models.js'));
const {productProfile,configuredProduct}=await import(asset('product-profiles.js'));
const {deviceGuide}=await import(asset('device-guide.js'));const {helpers}=await import('./build-helpers.mjs');
eng.setRole(title);
assert.equal(kit.slot,0);assert.deepEqual(kit.assignedTools,[]);
kit.selectSlot(1);assert.equal(kit.slot,0);kit.selectSlot(2);assert.equal(kit.slot,0);
assert(slotButtons.slice(1).every(b=>b.textContent.endsWith('Empty')));
for(const page of ['equipment','configure','monitoring','documentation']){eng.panel(page);assert(!document.getElementById('engineering-panel').hidden,page);}
eng.panel('equipment');await document.getElementById('equip-console-tool').onclick();assert.equal(kit.slot,1);
eng.panel('equipment');await document.getElementById('equip-lan-tool').onclick();assert.equal(kit.slot,2);
kit.selectSlot(1);assert.equal(kit.slot,1);kit.selectSlot(2);assert.equal(kit.slot,2);
document.getElementById('terminal').hidden=true;document.getElementById('terminal-button').onclick();assert.equal(document.getElementById('terminal').hidden,false,'Inspect terminal');
eng.panel('menu');assert.match(document.getElementById('eng-content').innerHTML,/play-campaign/);
for(const n of a.nodes.filter(n=>n.type!=='cloud'))assert(kit.target(n.id),'baseline '+n.id);
act({type:'mode',mode:'campaign',name:'Product acceptance'});o.game.budget=2000000;
function buy(sku){act({type:'order',sku,quantity:1,length:5});const order=o.game.orders.at(-1);order.arrives=Date.now()-1;act({type:'unbox',id:order.id});return o.game.stock.find(s=>s.sku===sku&&!s.holders.length);}
const $=id=>document.getElementById(id), pg=(page)=>{const b=$('product-gui').querySelectorAll('[data-pg-page]').find(b=>b.dataset.pgPage===page);assert(b,'GUI page '+page);b.onclick();}, val=(id,v)=>{$('pg-'+id).value=String(v);},click=async id=>{assert.equal(typeof $('pg-'+id).onclick,'function',id);await $('pg-'+id).onclick();};
const devices={};let addr=140;
for(const model of ENTERPRISE_MODELS.filter(m=>!m.providerOnly)){
 eng.setRole(title);kit.hide();const stock=buy(model.id);let slot;
 for(const rack of ['R03','R04','R05','R06','R01','R02']){for(let unit=1;unit+model.units-1<=42;unit++){if(!a.nodes.some(n=>n.active!==false&&!n.controller&&n.rack===rack&&n.unit<unit+model.units&&n.unit+n.units>unit)&&!o.game.rails.some(r=>r.rack===rack&&r.unit<unit+model.units&&r.unit+r.units>unit)){slot={rack,unit};break;}}if(slot)break;}
 assert(slot);act({type:'grab',id:stock.id});act({type:'mount',id:stock.id,...slot});const n=a.byId[o.game.installed.at(-1)];devices[model.id]=n;const p=productProfile(n);assert.equal(n.net.ip,'0.0.0.0');
 eng.setRole(title);const sp=n.ports.find(p0=>p0.service&&p0.medium===(p.serial?'Console':'Ethernet'));kit.interact({node:n,port:sp});assert(!kit.canAccess(n));assert.match(net.accessStatus(kit.session,n).reason,/NO POWER/);
 eng.setRole(title);act({type:'power',id:o.game.stock.find(s=>s.sku==='power').id,node:n.id,psu:0,feed:'A'});eng.setRole(title);
 if(['idrac','ilo'].includes(p.family))assert(kit.canAccess(n),'iDRAC standby '+n.id);else assert(!kit.canAccess(n));
 eng.setRole(title);if(!['switch','san','firewall'].includes(n.type))act({type:'boot',node:n.id});eng.setRole(title);if(p.serial)assert.match(net.accessStatus(kit.session,n).reason,/BOOTING/);n.physical.bootUntil=0;o.tick();assert(kit.canAccess(n),'local zero-IP '+model.id);
 if(p.serial){assert.equal(kit.session.mode,'SERIAL CONSOLE');for(const cmd of deviceGuide(n,net,a.byId['MGMT-SW'],a.nodes).commands.split('\n').filter(c=>!c.startsWith('#')))await kit.run(cmd);assert.notEqual(n.net.ip,'0.0.0.0','CLI '+model.id);assert(n.net.ssh,'SSH '+model.id);const ip=n.net.ip;await kit.run('configure terminal');if(n.type==='switch'){await kit.run('interface '+n.ports[0].name);await kit.run('ip address 192.0.2.1/24');assert.equal(n.net.ip,ip,'Data IP must not overwrite OOB');}await kit.run('end');}
 else {
 assert.equal(kit.session.mode,'LOCAL DEVICE GUI');assert.equal($('device-dashboard').hidden,false,'GUI default '+model.id);
 pg('identity');val('name','LAB-'+model.id);val('password','Training16!');await click('identity-save');assert(configuredProduct(n).identity.passwordSet,'identity '+model.id);
 pg('management');const ip='10.10.70.'+addr;addr+=3;val('ip',ip);val('prefix',24);val('gateway','10.10.70.1');val('dns','10.10.70.2');val('ntp','10.10.70.3');val('vlan',70);$('pg-ssh').checked=true;
 if(['powerstore','powervault'].includes(p.family)){val('nodeA',p.family==='powerstore'?'10.10.70.'+(addr-2):ip);val('nodeB','10.10.70.'+(addr-1));}
 await click('management-save');assert.equal(n.net.ip,ip,$('pg-message').textContent);pg('overview');await click('commission');assert(configuredProduct(n).commissioned,$('pg-message').textContent);
 }
 assert(kit.canAccess(n),'IP change keeps physical session');assert(!JSON.stringify(n.net).includes('Training16!'),'password not stored');
 const snapshot=w.snapshot();w.restore(snapshot);assert(kit.canAccess(n),'restore keeps local session '+model.id);
}
// Connect a new server to management, then verify remote standby access and link loss.
const server=devices.r660,hub=a.byId['MGMT-SW'];eng.setRole(title);kit.hide();const cable=buy('cat6'),hp=hub.ports.findIndex(p=>!p.service&&!p.link&&p.speed===1),np=server.ports.findIndex(p=>p.name==='MGMT UPLINK');cfg({type:'port',node:hub.id,index:hp,value:{access:70}});act({type:'patch',id:cable.id,a:hub.id,pa:hp,b:server.id,pb:np});eng.setRole(title);kit.dock();assert(kit.target(server.id),'remote setup done');server.physical.on=false;a.simulate();assert(kit.canAccess(server),'remote iDRAC standby');const link=server.ports[np].link;link.unplugged=true;assert(!kit.canAccess(server),'unplug invalidates remote');link.unplugged=false;server.physical.on=true;a.simulate();
// Product GUI host initiator and controller-specific storage options.
kit.interact({node:server,port:server.ports.find(p=>p.service&&p.medium==='Ethernet')});pg('host');val('protocol','FC');$('pg-initiatorEnabled').checked=true;await click('host-save');assert.equal(configuredProduct(server).host.protocol,'FC',$('pg-message').textContent);
const storage=devices.me5024fc;kit.interact({node:storage,port:storage.ports.find(p=>p.service&&p.medium==='Ethernet')});pg('storage');val('host',server.id);await click('copy-initiator');await click('storage-save');assert.equal(configuredProduct(storage).storage.host,server.id,$('pg-message').textContent);assert.equal(net.storagePaths(storage).length,0);assert.match(cfg({type:'product',node:storage.id,op:'storage',value:{...configuredProduct(storage).storage,protocol:'iSCSI'}}),/purchased controller/);
// WAN purchasing is a shared order; GUI consumes its actual assignment.
const fw=devices.fg200f;eng.setRole(title);kit.hide();const before=o.game.budget;act({type:'isp-order',node:fw.id});assert.equal(o.game.budget,before-500);assert.throws(()=>act({type:'isp-order',node:fw.id}));helpers(a).installISP(fw,'port1');eng.setRole(title);kit.interact({node:fw,port:fw.ports.find(p=>p.service&&p.medium==='Ethernet')});pg('wan');await click('wan-save');assert(net.wanStatus(fw).ok,$('pg-message').textContent+' · '+net.wanStatus(fw).reason);const lease=fw.net.ispContract,wan=configuredProduct(fw).wan;assert.equal(wan.ip,lease.ip);cfg({type:'port',node:fw.id,index:fw.ports.findIndex(p=>p.name===wan.port),value:{admin:false}});assert(!net.wanStatus(fw).ok);cfg({type:'port',node:fw.id,index:fw.ports.findIndex(p=>p.name===wan.port),value:{admin:true}});
const saved=w.snapshot();w.restore(saved);assert.equal(fw.net.ispContract.id,lease.id);assert.equal(configuredProduct(storage).storage.host,server.id);assert(net.wanStatus(fw).ok);
// Physical service UI is available to either title.
eng.setRole(title);kit.hide();const spare=buy('disk');server.physical.fault='disk';a.camera.position.copy(server.pos);
eng.panel('equipment');$('stock-item').value=spare.id;$('service-device').value=server.id;
await $('replace-part').onclick();assert.equal(server.physical.fault,null,'replacement UI '+title);
const removable=devices.r760;kit.hide();act({type:'boot',node:removable.id});
act({type:'power',node:removable.id,psu:0,feed:null});
const loose=o.game.stock.find(s=>s.holders.includes('ENGINEER-01'));act({type:'drop',id:loose.id,position:{x:-38,z:13}});
a.camera.position.copy(removable.pos);eng.remove({node:removable});await new Promise(r=>setTimeout(r,0));
assert(!o.game.installed.includes(removable.id),'device removal '+title);
const rack=buy('rack');act({type:'grab',id:rack.id});
const {RACK_PADS}=await import(asset('facility-layout.js'));const pad=RACK_PADS.find(p=>!a.racks.some(r=>r.id===p.rack));
assert(pad);act({type:'rack',id:rack.id,pad:pad.id});assert(o.game.racks.some(r=>r.id===pad.rack),'rack placement '+title);

// A guest must never get mode/save UI, even when selecting Operations or calling a stale host handler.
// [V] contextual service action: fiber scope/cleaner on a dirty fiber port (host-validated action).
{const n=a.nodes.find(x=>x.active!==false&&x.type!=='cloud'&&x.ports.some(p=>p.link&&!p.link.unplugged&&!p.service)),port=n.ports.find(p=>p.link&&!p.link.unplugged&&!p.service);if(!['fiber','fc','os2'].includes(port.link.media))port.link.media='fiber';// treat this patch as an OM4 fiber
 {port.link.fault='dirty';const aim={node:n,port};assert.match(eng.prompt(aim),/\[V\] INSPECT \/ CLEAN FIBER/);assert.equal(await eng.service(aim),true);assert.equal(port.link.fault,null,'cleaning clears the dirty connector');serviceChecked=true;}}
assert(serviceChecked);
const staleCreate=$('play-campaign').onclick;const originalMode=o.game.mode;
const streamHandlers={};let restores=0;const originalRestore=w.restore;w.restore=(...args)=>{restores++;return originalRestore(...args);};
globalThis.EventSource=class{addEventListener(name,handler){streamHandlers[name]=handler;}close(){}};
globalThis.fetch=async(url)=>({ok:true,status:200,json:async()=>url==='/api/room'?{protocol:'infra-lan-v1'}:url==='/api/join'?{token:'test-guest',id:'test-guest-id',isHost:false,revision:1,world:w.snapshot(),players:[],events:[]}:{ok:true}});
$('lan-code').value='TEST';await $('lan-join').onclick();assert(a.lab.lan.connected);assert.equal(a.lab.lan.canManageWorld,false);assert.equal(eng.isOpen,false,'guest joins gameplay');assert.deepEqual(kit.assignedTools,[],'join clears hand assignments');
for(const t of ['field','operations']){eng.setRole(t);eng.panel('menu');const html=$('eng-content').innerHTML;assert(!/play-campaign|play-free|load-file|save-file|campaign-name/.test(html));assert(!/data-eng-tab="saves"/.test($('eng-nav').innerHTML));staleCreate();assert(!/campaign-name/.test($('eng-content').innerHTML));eng.panel('saves');assert(!/Campaign saves/.test($('eng-content').innerHTML));assert.equal(o.game.mode,originalMode);}
const joinedRestores=restores;streamHandlers.world({data:JSON.stringify({revision:1,world:w.snapshot(),events:[]})});assert.equal(restores,joinedRestores,'duplicate SSE revision must not restore the world twice');
streamHandlers.world({data:JSON.stringify({revision:2,world:w.snapshot(),events:[]})});assert.equal(restores,joinedRestores+1,'new revision restores once');
a.lab.lan.leave();assert.equal(a.lab.lan.canManageWorld,false,'leaving a LAN room cannot unlock local world controls');
a.lab.lan.playSolo();assert.equal(a.lab.lan.canManageWorld,true,'explicit solo selection unlocks only local controls');
console.log('PASS '+title+': empty slots/manual tools; all menus; 24 catalog models ordered/installed; power/boot/zero-IP console; actual GUI identity/network/commission handlers; family defaults; local session restore; remote iDRAC standby and unplug; FC host/ME5 mapping; transport rejection; ISP purchase/WAN/disable and state restoration; [V] fiber clean service action.');
process.exit(0);
