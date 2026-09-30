import {productProfile,initialProduct,configuredProduct} from './product-profiles.js';
import {physicalOffline} from './operations.js';
import {controller,vdState,bootDevice,poolUsableReal} from './raid.js';

const clone=x=>structuredClone(x);
const values=x=>Object.values(x||{});
const nameOK=x=>/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(x||'');
export const ipv4=x=>/^\d{1,3}(\.\d{1,3}){3}$/.test(x||'')&&x.split('.').every(v=>+v<=255);
const num=s=>s.split('.').reduce((n,v)=>(n*256+Number(v))>>>0,0);
const sameNet=(a,b,p)=>ipv4(a)&&ipv4(b)&&(num(a)&(p?(0xffffffff<<(32-p))>>>0:0))===(num(b)&(p?(0xffffffff<<(32-p))>>>0:0));
export function prefixOf(mask){if(/^\d+$/.test(String(mask)))return +mask; if(!ipv4(mask))return NaN;const b=mask.split('.').map(x=>(+x).toString(2).padStart(8,'0')).join('');return /^1*0*$/.test(b)?b.replace(/0/g,'').length:NaN;}
// Simulated installer duration. The OS exists only after the installer finishes on a host that stayed powered.
export const INSTALL_MS=8000;
export const VCPU_RATIO=4,RAM_RATIO=1.25;
const HYPERVISORS=['VMware ESXi','KVM','Hyper-V'];
const mgmtPort=p=>p.service||/MGMT|SERVICE|management/i.test(p.name)||p.alias?.startsWith('mgmt');
export const hostDataPorts=n=>n.ports.map((p,i)=>[i,p]).filter(([,p])=>!mgmtPort(p)&&p.medium==='Ethernet');
export function deviceRuntime(n){
 const p=initialProduct(n),server=['server','gpu'].includes(n.type);
 const d={version:1,cpu:n.type==='gpu'?96:32,memory:n.type==='gpu'?1024:256,capacityGiB:n.type==='storage'?65536:4096,os:p.host.os||(!n.spec&&server?'Linux':''),raid:p.host.raid||'',boot:'UEFI',media:'',install:null,hostIP:'',hostVlan:50,hostPrefix:24,hostPort:null,gateway:'',dns:'',ntp:'',hypervisor:'',maintenance:false,portgroups:{},datastores:{local:{id:'local',kind:'local',sizeGiB:4096}},vms:{},services:{},pools:{},volumes:{},hosts:{},hostGroups:{},shares:{},buckets:{},snapshots:[],volSnaps:{},jobs:[],checkpoint:null};
 n.net.runtime??=d;for(const [k,v] of Object.entries(d))if(n.net.runtime[k]===undefined)n.net.runtime[k]=clone(v);
 const r=n.net.runtime;
 // Import the older single-volume product model once. Keep a marker so a
 // deliberate delete in the new volume UI is not recreated on every render.
 if(!r.legacyImported){if(p.storage.volume&&!r.volumes[p.storage.volume]){const s=p.storage;r.pools[s.pool]??={id:s.pool,sizeGiB:r.capacityGiB,protection:s.raid||p.identity.protection||'Double drive'};r.volumes[s.volume]={id:s.volume,pool:s.pool,sizeGiB:+s.sizeGiB,thin:true,protocol:s.protocol,host:s.host,group:'',access:'read-write',initiator:s.initiator,legacy:true};if(s.host&&s.initiator)r.hosts[s.host]??={id:s.host,initiator:s.initiator};}r.legacyImported=true;}
 advanceInstall(n,r);
 return r;
}
// Installer state machine: installing → completed | failed. Power loss (epoch change or the host
// being offline) during installation fails it; the learner must run the installer again.
function advanceInstall(n,r,now=Date.now()){
 const i=r.install;if(i?.state!=='installing')return;
 if(physicalOffline(n)||(n.physical?.epoch||0)!==i.epoch){i.state='failed';i.reason='Power was lost during installation · run the installer again';r.jobs.unshift({at:now,message:'OS installation failed · '+i.os,state:'Failed'});return;}
 if(now<i.until)return;
 r.os=i.os;r.raid=i.raid;r.hypervisor=HYPERVISORS.includes(i.os)?i.os:'';r.media='';n.net.os=i.os;const h=initialProduct(n).host;h.os=i.os;h.raid=i.raid;
 i.state='completed';i.completed=now;r.jobs.unshift({at:now,message:'OS installation completed · '+i.os,state:'Completed'});
}
// Boot target of the installed OS: the BOSS / NS204i mirror, or a PERC virtual disk. A failed boot
// target means POST ends with "No boot device available" and the host OS (and its VMs) are down.
export function bootHealth(n){const r=n.net.runtime;if(!r||!['server','gpu'].includes(n.type))return {ok:true,state:'n/a'};if(n.physical?.fault==='disk'&&!n.spec)return {ok:true,state:'degraded',reason:'VD0 degraded · physical disk 1 failed'};const c=controller(n,r),t=r.bootTarget||'BOSS';if(t==='BOSS'){const st=bootDevice(c);return {ok:st!=='failed',state:st,target:c.boss.model,reason:st==='failed'?'Boot device '+c.boss.model+' failed (both M.2 disks) · No boot device available':c.boss.model+' '+st};}const vd=c.vds.find(v=>v.id===t.slice(3));if(!vd)return {ok:false,state:'missing',target:t,reason:'Boot virtual disk '+t.slice(3)+' no longer exists · No boot device available'};const st=vdState(c,vd);return {ok:st.state!=='failed',state:st.state,target:vd.id,reason:st.state==='failed'?'Virtual disk '+vd.id+' ('+vd.level+') failed · No boot device available':vd.id+' '+st.state};}
export function installStatus(n){const r=deviceRuntime(n),i=r.install;if(i?.state==='installing')return {state:'installing',reason:'Installing '+i.os+' · '+Math.max(0,Math.ceil((i.until-Date.now())/1000))+' s remaining'};if(i?.state==='failed')return {state:'failed',reason:'Installation of '+i.os+' failed · '+i.reason};return r.os?{state:'installed',reason:r.os+' installed'}:{state:'none',reason:'No operating system installed'};}
// Host NICs mirror the virtual switch: an uplink carries every port-group VLAN (802.1Q trunk),
// plus the host data VLAN on its selected port and any iSCSI/NVMe-TCP data VLAN on that port.
export function syncHostNics(n){
 if(!['server','gpu'].includes(n.type)||!n.net.runtime)return;const r=n.net.runtime,h=configuredProduct(n).host,use=new Map();
 const add=(i,v)=>{if(!Number.isInteger(+i)||!n.ports[i]||!Number.isInteger(+v))return;if(!use.has(+i))use.set(+i,new Set());use.get(+i).add(+v);};
 for(const pg of values(r.portgroups))for(const i of pg.uplinks||[])add(i,pg.vlan);
 if(r.hostIP&&r.hostPort!==null&&r.hostPort!==undefined)add(r.hostPort,r.hostVlan);
 if(['iSCSI','NVMe/TCP'].includes(h.protocol))for(const side of ['A','B']){const i=n.ports.findIndex(p=>p.name===h['port'+side]);if(i>=0&&use.has(i))add(i,h['vlan'+side]);}
 for(const [i,vlans] of use){const p=n.ports[i],list=[...vlans].sort((a,b)=>a-b);for(const v of list)n.net.vlans[v]??='HOST-'+v;Object.assign(p.cfg,{admin:p.cfg.admin!==false,mode:'trunk',allowed:list,access:list[0]});}
}
export function resourceUse(n){const r=deviceRuntime(n),v=values(r.vms);return {cpu:v.reduce((s,x)=>s+x.cpu,0),memory:v.reduce((s,x)=>s+x.memory,0),disk:v.reduce((s,x)=>s+x.disk,0),running:v.filter(x=>x.on).length,volumes:values(r.volumes).reduce((s,x)=>s+x.sizeGiB,0)};}
export function vmState(n,vm,ctx){
 const r=deviceRuntime(n);if(physicalOffline(n))return {ok:false,reason:'Host powered off or booting'};
const boot=bootHealth(n);if(!boot.ok)return {ok:false,reason:'Host OS down · '+boot.reason};
 if(!r.hypervisor)return {ok:false,reason:r.install?.state==='installing'?'Hypervisor installation in progress':r.install?.state==='failed'?'Hypervisor installation failed · reinstall':'Install a hypervisor'};if(!vm?.on)return {ok:false,reason:'VM is powered off'};
 const ds=r.datastores[vm.datastore];if(!ds)return {ok:false,reason:'Datastore missing'};let note='';
 if(ds.kind!=='local'){const array=ctx.byId[ds.array];if(!array||!deviceRuntime(array).volumes[ds.volume])return {ok:false,reason:'Datastore '+ds.id+' · storage volume removed'};
  const acc=ctx.volumeAccess?ctx.volumeAccess(array,ds.volume,n):{ok:!!ctx.storagePaths?.(array).length,reason:'Storage data path unavailable',access:'read-write'};
  if(!acc.ok)return {ok:false,reason:'Datastore '+ds.id+' unavailable · '+acc.reason};if(acc.poolFull)return {ok:false,reason:'Datastore '+ds.id+' went read-only: pool '+acc.record?.pool+' on '+ds.array+' is full · VM I/O stalled'};if(acc.access==='read-only')return {ok:false,reason:'Datastore '+ds.id+' is presented read-only; VM disks need read-write'};if(acc.state==='degraded')note=' · datastore degraded (1 path)';}
 const pg=r.portgroups[vm.network];if(!pg)return {ok:false,reason:'Select a virtual port group'};
 const ports=(pg.uplinks||[pg.uplink]).map(i=>n.ports[i]);const live=ports.filter(p=>p?.cfg?.admin&&p.link&&!p.link.unplugged&&!p.link.disabled&&!p.link.retired&&(p.cfg.mode==='trunk'?p.cfg.allowed.includes(pg.vlan):p.cfg.access===pg.vlan));
 if(!live.length)return {ok:false,reason:'No live uplink carrying VLAN '+pg.vlan+' (check the host cable and the switch port VLAN)'};return {ok:true,reason:'Running · VLAN '+pg.vlan+' · '+live.length+' uplink(s)'+note,vlan:pg.vlan};
}
const PROTECTIONS={powervault:['ADAPT','RAID 6','RAID 5','RAID 10','RAID 1'],powerstore:['Double drive','Single drive'],alletra:['Triple+ parity']};
export const poolProtections=n=>PROTECTIONS[productProfile(n).family]||['Double drive','Single drive','ADAPT','RAID 6','RAID 10'];
const EFFICIENCY={'ADAPT':0.8,'RAID 6':0.8,'RAID 5':0.8,'RAID 10':0.5,'RAID 1':0.5,'Double drive':0.8,'Single drive':0.88,'Triple+ parity':0.75};
export const poolUsable=pool=>poolUsableReal(pool);
export function applyDeviceOperation(n,a,ctx){
 const r=deviceRuntime(n),v=clone(a.value||{}),server=['server','gpu'].includes(n.type),storage=n.type==='storage';
 const fail=s=>s,finite=(x,min,max)=>Number.isFinite(+x)&&+x>=min&&+x<=max;
 if(!ctx.localStatus(n).ok)return ctx.localStatus(n).reason;if(['os','vm','vm-power','service','datastore'].includes(a.op)&&physicalOffline(n))return 'Power on the server and wait for boot before using its operating system';
 if(['os','portgroup','vm','vm-power','service','datastore','host-network'].includes(a.op)&&!server)return 'Select a server or GPU host';
 if(['pool','volume','volume-resize','host-register','host-group','share','bucket'].includes(a.op)&&!storage)return 'Select a storage appliance';
 if(['pool','volume','volume-resize','host-register','host-group'].includes(a.op)&&n.spec&&!configuredProduct(n).identity.passwordSet)return 'Complete the array initial setup (system identity and administrator) before provisioning';
 if(a.op==='os'){
  if(!['Linux','Windows Server','VMware ESXi','KVM','Hyper-V'].includes(v.os))return fail('Choose a supported OS image');
  if(!['RAID 1 boot','RAID 10','HBA / passthrough'].includes(v.raid))return fail('Select a boot storage layout');
  if(values(r.vms).some(x=>x.on))return fail('Stop virtual machines before reinstalling the host');
  if(r.install?.state==='installing')return fail('An installation is already running');
  if(n.physical?.fault==='disk')return fail('Installer found no healthy boot drive · replace the failed disk first');
  {const c=controller(n,r);if(v.raid==='RAID 10'){let vd=c.vds.find(x=>x.name==='OS'&&x.state!=='failed');if(!vd){const free=c.disks.filter(d=>d.state==='ready').slice(0,4);if(free.length<4)return fail('RAID 10 boot needs 4 unassigned physical disks');vd={id:'VD'+c.vds.length,name:'OS',level:'RAID 10',disks:free.map(d=>d.slot),state:'optimal',rebuild:null};free.forEach(d=>d.state='online');c.vds.push(vd);}if(vdState(c,vd).state==='failed')return fail('Installer found no healthy boot drive · virtual disk '+vd.id+' failed');r.bootTarget='VD:'+vd.id;}else{if(bootDevice(c)==='failed')return fail('Installer found no healthy boot drive · '+c.boss.model+' failed');r.bootTarget='BOSS';}}
  r.install={state:'installing',os:v.os,raid:v.raid,started:Date.now(),until:Date.now()+INSTALL_MS,epoch:n.physical?.epoch||0};
  r.os='';r.hypervisor='';r.raid=v.raid;r.media=v.os+' installer (virtual media)';
 }else if(a.op==='raid'){
  // PERC / Smart Array virtual disks: create (fast init), delete, assign a global hot spare.
  const c=controller(n,r);
  if(v.action==='hotspare'){const d=c.disks[+v.slot];if(!d||d.state!=='ready')return 'Physical disk '+v.slot+' is not an unassigned ready disk';d.state='hotspare';for(const vd of c.vds){const st=vdState(c,vd);if(st.state==='degraded'&&!vd.rebuild){const slot=st.failed[0];d.state='rebuilding';vd.disks=vd.disks.map(x=>x===slot?d.slot:x);vd.rebuild={slot:d.slot,progress:0,replaced:slot};break;}}
  }else if(v.action==='delete'){const vd=c.vds.find(x=>x.id===v.id);if(!vd)return 'Virtual disk not found';if(r.bootTarget==='VD:'+vd.id&&r.os&&vdState(c,vd).state!=='failed')return 'Virtual disk '+vd.id+' holds the installed OS · deleting it destroys the OS (reinstall afterwards)'+(v.confirm?'':' · confirm to continue');vd.disks.forEach(slot=>{if(c.disks[slot].state!=='failed')c.disks[slot].state='ready';});c.vds=c.vds.filter(x=>x!==vd);if(r.bootTarget==='VD:'+vd.id){r.os='';r.hypervisor='';n.net.os='';}
  }else if(v.action==='create'){const L={'RAID 0':1,'RAID 1':2,'RAID 5':3,'RAID 6':4,'RAID 10':4},slots=String(v.disks??'').split(',').filter(x=>x!=='').map(Number);if(!L[v.level])return 'Choose RAID 0, 1, 5, 6 or 10';if(slots.length<L[v.level]||v.level==='RAID 1'&&slots.length!==2||v.level==='RAID 10'&&slots.length%2)return v.level+' needs '+(v.level==='RAID 1'?'exactly 2':v.level==='RAID 10'?'an even number (≥4) of':'at least '+L[v.level])+' physical disks';const bad=slots.find(x=>c.disks[x]?.state!=='ready');if(bad!==undefined)return 'Physical disk '+bad+' is '+(c.disks[bad]?.state||'missing')+' · choose unassigned ready disks';const id='VD'+Math.max(0,...c.vds.map(x=>+x.id.slice(2)+1));c.vds.push({id,name:String(v.name||id).slice(0,20),level:v.level,disks:slots,state:'optimal',rebuild:null});slots.forEach(x=>c.disks[x].state='online');
  }else return 'Unknown RAID action';
 }else if(a.op==='host-network'){
  if(!ipv4(v.ip)||!finite(v.vlan,1,4094)||!finite(v.prefix,1,30))return 'Enter valid host IPv4, prefix and VLAN';
  if(v.gateway&&!ipv4(v.gateway)||v.dns&&!ipv4(v.dns))return 'Enter valid gateway and DNS addresses';
  if(v.gateway&&!sameNet(v.ip,v.gateway,+v.prefix))return 'The host gateway must be inside the host data subnet';
  const port=v.port===undefined||v.port===''?hostDataPorts(n)[0]?.[0]:+v.port;if(!hostDataPorts(n).some(([i])=>i===port))return 'Select an Ethernet host data port (not iDRAC / iLO management)';
  if(ctx.nodes.some(x=>x!==n&&x.active!==false&&(x.net.ip===v.ip||x.net.runtime?.hostIP===v.ip||values(x.net.runtime?.vms).some(y=>y.ip===v.ip))))return 'Duplicate IP address';
  Object.assign(r,{hostIP:v.ip,hostPrefix:+v.prefix,hostVlan:+v.vlan,hostPort:port,gateway:v.gateway||'',dns:v.dns||'',ntp:v.ntp||''});syncHostNics(n);
 }else if(a.op==='portgroup'){
  if(!r.hypervisor)return 'Install a hypervisor first';if(!nameOK(v.id)||!Number.isInteger(+v.vlan)||!finite(v.vlan,1,4094))return 'Enter a port-group name and VLAN 1–4094';
  const indices=String(v.uplinks??v.uplink).split(',').map(Number);if(!indices.length||indices.some(i=>!n.ports[i]||n.ports[i].service||n.ports[i].medium!=='Ethernet'||mgmtPort(n.ports[i])))return 'Select Ethernet host uplinks (management ports cannot carry VM traffic)';
  r.portgroups[v.id]={id:v.id,vlan:+v.vlan,uplinks:indices,mtu:+v.mtu||1500};syncHostNics(n);
 }else if(a.op==='vm'){
  if(!r.hypervisor)return 'Install a hypervisor first';if(r.maintenance)return 'Exit maintenance mode before creating virtual machines';
  if(!nameOK(v.id)||!['Linux','Windows Server'].includes(v.os)||!finite(v.cpu,1,r.cpu)||!finite(v.memory,1,r.memory)||!finite(v.disk,1,r.capacityGiB))return 'Choose a VM name, OS and valid CPU / memory / disk resources';
  if(!r.portgroups[v.network]||!r.datastores[v.datastore])return 'Select an existing port group and datastore';
  if(v.ip&&!ipv4(v.ip))return 'Invalid VM IPv4 address';if(v.ip&&ctx.nodes.some(x=>x.active!==false&&(x.net.ip===v.ip||x.net.runtime?.hostIP===v.ip||values(x.net.runtime?.vms).some(y=>!(x===n&&y.id===v.id)&&y.ip===v.ip))))return 'Duplicate VM IP address';
  if(v.ip){v.prefix=+(v.prefix||24);if(!finite(v.prefix,1,30))return 'Guest prefix must be 1–30';if(v.gateway&&(!ipv4(v.gateway)||!sameNet(v.ip,v.gateway,v.prefix)))return 'Guest gateway must be an IPv4 address inside the guest subnet';if(v.dns&&!ipv4(v.dns))return 'Guest DNS must be an IPv4 address';}
  const others=values(r.vms).filter(x=>x.id!==v.id),ds=r.datastores[v.datastore];

  if(others.filter(x=>x.datastore===v.datastore).reduce((s,x)=>s+x.disk,0)+ +v.disk>ds.sizeGiB)return 'Insufficient datastore capacity';
  r.vms[v.id]={...r.vms[v.id],...v,cpu:+v.cpu,memory:+v.memory,disk:+v.disk,gateway:v.gateway||'',dns:v.dns||'',on:r.vms[v.id]?.on??false,services:r.vms[v.id]?.services||{}};
 }else if(a.op==='vm-power'){
  const vm=r.vms[v.id];if(!vm)return 'VM not found';if(v.action==='delete'){if(vm.on)return 'Power off the VM before deleting it';delete r.vms[v.id];}
  else {if(v.on&&r.maintenance)return 'Host is in maintenance mode';if(v.on&&!r.hypervisor)return 'Install a hypervisor first';if(v.on&&!vm.on){const run=values(r.vms).filter(x=>x.on&&x.id!==vm.id),cpu=run.reduce((t,x)=>t+x.cpu,0)+vm.cpu,mem=run.reduce((t,x)=>t+x.memory,0)+vm.memory;const refuse=msg=>{vm.lastError=msg;return msg;};if(cpu>r.cpu*VCPU_RATIO)return refuse('Cannot power on '+vm.id+': '+cpu+' vCPU would run on '+r.cpu+' cores (overcommit limit '+VCPU_RATIO+':1 = '+r.cpu*VCPU_RATIO+' vCPU) · power off or shrink another VM');if(mem>r.memory*RAM_RATIO)return refuse('Cannot power on '+vm.id+': '+mem+' GiB of memory would be committed on '+r.memory+' GiB (limit '+Math.round(RAM_RATIO*100)+'% = '+Math.floor(r.memory*RAM_RATIO)+' GiB) · power off or shrink another VM');}if(v.on)delete vm.lastError;vm.on=!!v.on;}
 }else if(a.op==='service'){
  const target=v.vm?r.vms[v.vm]:r;if(!target||!target.os)return 'Install the target operating system first';
  if(!nameOK(v.id)||!['web','DNS','DHCP','NTP','SMB','NFS','database','monitoring','backup','syslog'].includes(v.kind)||!finite(v.port,1,65535))return 'Select a service name, type and port';
  if(v.engine==='IIS'&&target.os!=='Windows Server'||['Nginx','Apache'].includes(v.engine)&&target.os!=='Linux')return 'IIS requires Windows Server; Nginx / Apache require Linux';
  const ip=v.vm?target.ip:r.hostIP,pg=v.vm?r.portgroups[target.network]:null;if(!ipv4(ip))return 'Configure the target data IP first';
  target.services[v.id]={...v,port:+v.port,running:v.running!==false,ip,vlan:pg?.vlan||r.hostVlan,content:String(v.content||'Welcome to '+v.id).slice(0,16000),requests:target.services[v.id]?.requests||0,groups:v.groups||'company',firewall:v.firewall!==false};
 }else if(a.op==='pool'){
  const protection=v.protection||poolProtections(n)[0];
  if(!nameOK(v.id)||!finite(v.sizeGiB,1,r.capacityGiB))return 'Enter a pool name and raw drive capacity within the appliance size';
  if(!poolProtections(n).includes(protection))return protection+' is not offered by this array · choose '+poolProtections(n).join(', ');
  if(values(r.pools).filter(x=>x.id!==v.id).reduce((s,x)=>s+x.sizeGiB,0)+ +v.sizeGiB>r.capacityGiB)return 'Pool capacity exceeds available disks';
  const usable=poolUsable({sizeGiB:+v.sizeGiB,protection});
  if(values(r.volumes).filter(x=>x.pool===v.id).reduce((s,x)=>s+x.sizeGiB,0)>usable)return 'Pool usable capacity ('+usable+' GiB after '+protection+') is smaller than its allocated volumes';
  r.pools[v.id]={id:v.id,sizeGiB:+v.sizeGiB,protection};
 }else if(a.op==='host-register'){
  const host=ctx.byId[v.id];if(!host||!['server','gpu'].includes(host.type)||!v.initiator)return 'Choose an installed host and its initiator';
  const h=initialProduct(host).host;if(![h.iqn,h.wwpnA,h.wwpnB].includes(v.initiator))return 'Initiator must match the host IQN, NQN or WWPN';
  const kind=/^([0-9a-f]{2}:){7}[0-9a-f]{2}$/i.test(v.initiator)?'FC':/^nqn\./i.test(v.initiator)?'NVMe/TCP':'iSCSI',protocols=productProfile(n).protocols;
  if(!protocols.includes(kind))return 'This array has no '+kind+' host ports ('+protocols.join(' / ')+') · register a matching initiator';
  if(v.chap&&(String(v.chap).length<12||String(v.chap).length>16))return 'CHAP secret must be 12–16 characters';
  r.hosts[v.id]={id:v.id,initiator:v.initiator,protocol:kind,chap:v.chap||r.hosts[v.id]?.chap||''};
 }else if(a.op==='host-group'){
  const members=String(v.hosts||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(!nameOK(v.id)||!members.length)return 'Enter a host-group name and at least one registered host';
  const missing=members.filter(x=>!r.hosts[x]);if(missing.length)return 'Register these hosts first: '+missing.join(', ');
  r.hostGroups[v.id]={id:v.id,hosts:[...new Set(members)]};
 }else if(a.op==='volume'){
  const pool=r.pools[v.pool],base=initialProduct(n).storage,old=r.volumes[v.id];if(!nameOK(v.id)||!pool||!finite(v.sizeGiB,1,r.capacityGiB))return 'Choose a valid volume name, pool and size';
  if(old&&+v.sizeGiB<old.sizeGiB)return 'Volumes cannot be shrunk; create a smaller volume and migrate the data';
  if(old&&old.pool!==v.pool)return 'Moving a volume between pools is not simulated';
  if(values(r.volumes).filter(x=>x.pool===v.pool&&x.id!==v.id).reduce((s,x)=>s+x.sizeGiB,0)+ +v.sizeGiB>poolUsable(pool))return 'Insufficient pool capacity ('+pool.protection+' usable '+poolUsable(pool)+' GiB)';
  if(!productProfile(n).protocols.includes(v.protocol))return 'Protocol is not supported by this appliance';
  if(v.host&&v.group)return 'Map to a host or to a host group, not both';
  if(v.host&&!r.hosts[v.host]&&base.host!==v.host)return 'Register this host before mapping the volume';
  if(v.group&&!r.hostGroups[v.group])return 'Create the host group first';
  if(v.host&&r.hosts[v.host]?.protocol&&r.hosts[v.host].protocol!==v.protocol)return v.host+' is registered with a '+r.hosts[v.host].protocol+' initiator; this volume is '+v.protocol;
  const access=v.access==='read-only'?'read-only':'read-write';
  if(old&&(old.host!==(v.host||'')||old.group!==(v.group||''))&&!v.host&&!v.group&&ctx.nodes.some(x=>values(x.net.runtime?.datastores).some(d=>d.array===n.id&&d.volume===v.id)))return 'A host datastore still uses this volume · unmount it on the host before unmapping';
  // LUN IDs must be unique per host (a host-group mapping counts for every member host).
  const members=v.group?(r.hostGroups[v.group]?.hosts||[]):v.host?[v.host]:[],sees=(x,h)=>x.host===h||(x.group&&(r.hostGroups[x.group]?.hosts||[]).includes(h));
  const usedLun=h=>values(r.volumes).filter(x=>x.id!==v.id&&sees(x,h)).map(x=>x.lun??0);
  const explicit=v.lun!==undefined&&v.lun!=='';let lun=explicit?+v.lun:old&&old.host===(v.host||'')&&old.group===(v.group||'')&&(old.host||old.group)?old.lun:undefined;
  if(lun!==undefined){for(const h of members){if(!explicit&&lun===undefined)break;const clash=values(r.volumes).find(x=>x.id!==v.id&&sees(x,h)&&(x.lun??0)===lun);if(clash)return 'LUN '+lun+' is already used by volume '+clash.id+' for host '+h+' · choose a free LUN ID';}}
  else{lun=0;while(members.some(h=>usedLun(h).includes(lun)))lun++;}
  r.volumes[v.id]={...old,id:v.id,pool:v.pool,sizeGiB:+v.sizeGiB,thin:v.thin!==false,host:v.host||'',group:v.group||'',access,protocol:v.protocol,lun,owner:old?.owner||v.owner||'A',written:old?.written||0,initiator:r.hosts[v.host]?.initiator||(base.host===v.host?base.initiator:'')||''};
 }else if(a.op==='volume-resize'){
  const vol=r.volumes[v.id];if(!vol)return 'Volume not found';if(!finite(v.sizeGiB,1,r.capacityGiB))return 'Enter the new size in GiB';
  if(+v.sizeGiB<vol.sizeGiB)return 'Volumes cannot be shrunk; create a smaller volume and migrate the data';
  const pool=r.pools[vol.pool],used=values(r.volumes).filter(x=>x.pool===vol.pool&&x.id!==vol.id).reduce((s,x)=>s+x.sizeGiB,0);
  if(used+ +v.sizeGiB>poolUsable(pool))return 'Insufficient pool capacity ('+(poolUsable(pool)-used)+' GiB available)';
  vol.sizeGiB=+v.sizeGiB;for(const x of ctx.nodes)for(const d of values(x.net.runtime?.datastores))if(d.array===n.id&&d.volume===vol.id)d.sizeGiB=vol.sizeGiB;
 }else if(a.op==='datastore'){
  if(!r.hypervisor)return 'Install a hypervisor (ESXi / KVM / Hyper-V) before mounting a shared datastore';
  const array=ctx.byId[v.array],vol=array&&deviceRuntime(array).volumes[v.volume];if(!nameOK(v.id)||!vol)return 'Select an existing volume on the array';
  const acc=ctx.volumeAccess?ctx.volumeAccess(array,v.volume,n):{ok:vol.host===n.id&&!!ctx.storagePaths(array).length,reason:'No storage data path: check initiator, transport, cabling, VLAN or FC zoning',access:'read-write'};
  if(!acc.ok)return 'Rescan found no device · '+acc.reason;if(acc.access==='read-only')return 'The volume is presented read-only; a VM datastore needs read-write access';
  r.datastores[v.id]={id:v.id,kind:'shared',array:v.array,volume:v.volume,sizeGiB:vol.sizeGiB};
 }else if(a.op==='share'){
  const profile=productProfile(n);if(!['powerscale','storeonce','powerstore'].includes(profile.family))return 'This block appliance needs an external file server for SMB / NFS';
  if(!nameOK(v.id)||!['SMB','NFS'].includes(v.protocol)||!ipv4(v.ip)||!finite(v.quota,1,r.capacityGiB))return 'Enter share name, protocol, data IP and quota';
  r.shares[v.id]={...v,vlan:+v.vlan,quota:+v.quota,read:v.read||'company',write:v.write||'company',subnets:v.subnets||'10.10.0.0/16'};
 }else if(a.op==='bucket'){
  if(productProfile(n).family!=='objectscale')return 'S3 buckets require ObjectScale';if(!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(v.id)||!finite(v.quota,1,r.capacityGiB))return 'Enter a valid lowercase bucket name and quota';
  r.buckets[v.id]={...v,quota:+v.quota,objects:r.buckets[v.id]?.objects||{}};
 }else if(a.op==='vol-snapshot'){
  const vol=r.volumes[v.volume];if(!vol)return 'Volume not found';const use=values(r.pools).length?null:null;const id=String(v.id||vol.id+'-snap-'+(Object.keys(r.volSnaps).length+1));if(!nameOK(id))return 'Enter a snapshot name';r.volSnaps[id]={id,volume:vol.id,sizeGiB:Math.max(1,Math.round(+v.sizeGiB||vol.sizeGiB*0.1)),at:Date.now()};
 }else if(a.op==='snapshot'){
  if(r.snapshots.length>=20)r.snapshots.shift();r.snapshots.push({id:'SNAP-'+Date.now(),at:Date.now(),volumes:clone(r.volumes),shares:clone(r.shares),buckets:clone(r.buckets)});
 }else if(a.op==='maintenance'){if(v.enabled&&values(r.vms).some(x=>x.on))return 'Shut down VMs before entering maintenance mode';r.maintenance=!!v.enabled;
 }else if(a.op==='checkpoint'){const saved=clone(r);saved.checkpoint=null;r.checkpoint=saved;
 }else if(a.op==='restore'){if(!r.checkpoint)return 'Create a configuration checkpoint first';n.net.runtime=clone(r.checkpoint);syncHostNics(n);
 }else if(a.op==='delete'){
  if(!['volumes','pools','shares','buckets','portgroups','datastores','services','hosts','hostGroups','volSnaps'].includes(v.table)||!r[v.table]?.[v.id])return 'Record not found';
  if(v.table==='pools'&&values(r.volumes).some(x=>x.pool===v.id))return 'Delete or move volumes before removing the pool';
  if(['datastores','portgroups'].includes(v.table)&&values(r.vms).some(x=>x[v.table==='datastores'?'datastore':'network']===v.id))return 'Remove dependent virtual machines first';
  if(v.table==='volumes'&&ctx.nodes.some(x=>values(x.net.runtime?.datastores).some(d=>d.array===n.id&&d.volume===v.id)))return 'Detach the host datastore before deleting its volume';
  if(v.table==='volumes'&&values(r.volSnaps).some(x=>x.volume===v.id))return 'Delete the snapshots of '+v.id+' first';
  if(v.table==='volumes'&&(r.volumes[v.id].host||r.volumes[v.id].group))return 'Unmap the volume from its host / host group before deleting it';
  if(v.table==='hosts'&&(values(r.volumes).some(x=>x.host===v.id)||values(r.hostGroups).some(g=>g.hosts.includes(v.id))))return 'Remove the host from its volume mappings and host groups first';
  if(v.table==='hostGroups'&&values(r.volumes).some(x=>x.group===v.id))return 'Unmap volumes from this host group first';
  delete r[v.table][v.id];if(v.table==='portgroups')syncHostNics(n);
 }else return 'Unsupported device operation';
 const updated=deviceRuntime(n);updated.jobs.unshift({at:Date.now(),message:a.op+(a.op==='os'?' installer started':' applied')+(v.id?' · '+v.id:''),state:a.op==='os'?'Running':'Completed'});updated.jobs=updated.jobs.slice(0,80);return 'Applied · '+n.id+' / '+a.op;
}
