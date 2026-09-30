import {productProfile,initialProduct,configuredProduct} from './product-profiles.js';
import {hostIdentifiers,pathsTo} from './storage-access.js';
import {deviceRuntime,syncHostNics,poolUsable,poolProtections} from './device-runtime.js';
import {physicalOffline} from './operations.js';
const ipv4=s=>/^\d{1,3}(\.\d{1,3}){3}$/.test(s||'')&&s.split('.').every(v=>+v<=255);
const cidr=(ip,p)=>ipv4(ip)&&Number.isInteger(+p)&&+p>=1&&+p<=30;
const numberIP=s=>s.split('.').reduce((n,v)=>(n*256+Number(v))>>>0,0);
const subnet=(a,b,p)=>ipv4(a)&&ipv4(b)&&((numberIP(a)&(0xffffffff<<(32-p)))===(numberIP(b)&(0xffffffff<<(32-p))));
const nameOK=s=>/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(s||'');
const wwpn=s=>/^[0-9a-f]{2}(:[0-9a-f]{2}){7}$/i.test(s||'');
const iqn=s=>/^iqn\.\d{4}-\d{2}\.[a-z0-9.-]+:.+/i.test(s||'');
const port=(n,v)=>n.ports.find(p=>p.name===v&&!p.service&&p.medium!=='Internal');
const isMgmt=p=>p.service||/MGMT|SERVICE|management/i.test(p.name)||p.alias?.startsWith('mgmt');
export {hostIdentifiers};
function dataPorts(n,v){const a=port(n,v.portA),b=port(n,v.portB);if(!a||!b||a===b||isMgmt(a)||isMgmt(b))return 'Select two different host data ports; management is separate';if(v.protocol==='FC'&&[a,b].some(p=>p.medium!=='Fibre Channel'))return 'FC requires Fibre Channel HBA/target ports';if(['iSCSI','NVMe/TCP'].includes(v.protocol)&&[a,b].some(p=>p.medium!=='Ethernet'))return 'iSCSI / NVMe-TCP requires Ethernet data ports';if(['iSCSI','NVMe/TCP'].includes(v.protocol)){if(!cidr(v.ipA,v.prefix)||!cidr(v.ipB,v.prefix)||v.ipA===v.ipB)return 'Enter two unique data IPs and a prefix';if(![v.vlanA,v.vlanB].every(x=>Number.isInteger(+x)&&+x>0&&+x<4095))return 'Data VLANs must be 1–4094';}if(![1500,9000,9216].includes(+v.mtu))return 'Choose MTU 1500, 9000 or 9216';return '';}
function setDataPorts(n,v){if(!['iSCSI','NVMe/TCP'].includes(v.protocol))return;for(const side of ['A','B']){const p=port(n,v['port'+side]),vlan=+v['vlan'+side];n.net.vlans[vlan]??='STORAGE-'+side;Object.assign(p.cfg,{mode:'access',access:vlan,allowed:[vlan],mtu:+v.mtu,ip:v['ip'+side],prefix:+v.prefix});}}
export function applyProduct(n,a,ctx){const profile=productProfile(n),c=n.net,p=initialProduct(n),v=structuredClone(a.value||{}),family=profile.family;let error='';
 if(a.op==='internet-test'){const status=wanStatus(n,ctx);if(!status.ok)return status.reason;const lan=port(n,v.lan),wan=p.wan.port;if(!lan||lan.name===wan||!lan.cfg.admin||!lan.cfg.ip)return 'Configure an enabled LAN interface with its IPv4 address';if(!lan.link||!good(lan.link,ctx))return 'LAN cable path is down';const rule=c.enterprise?.policies.find(x=>x.enabled&&x.srcintf===lan.name&&x.dstintf===wan);if(!rule||rule.action!=='accept')return 'DENY · LAN → WAN policy is missing or denies traffic';if(!rule.nat)return 'No Source NAT · private LAN requires source NAT for this ISP exercise';return 'PASS · LAN cable → accept policy '+rule.id+' → source NAT → default route → ISP handoff (simulated Internet probe)';}
 if(a.op==='identity'){
  if(!nameOK(v.name))return 'Enter a hostname / cluster name using letters, numbers and hyphens';
  if(!p.identity.passwordSet&&v.passwordChanged!==true)return 'Complete the training administrator password-change step';
  if(family==='powerstore'&&!['Unified','Block Optimized'].includes(v.mode))return 'Select Unified or Block Optimized deployment';
  if(family==='powerstore'&&!['Single drive','Double drive'].includes(v.protection))return 'Select the appliance fault tolerance';
  p.identity={name:v.name,passwordSet:true,mode:v.mode||'',protection:v.protection||'',timeZone:v.timeZone||'UTC'};c.hostname=v.name;
 }else if(a.op==='management'){
  if(!cidr(v.ip,v.prefix)||v.ip==='0.0.0.0')return 'Enter a valid static management IPv4 / prefix';
  if(!Number.isInteger(+v.vlan)||+v.vlan<1||+v.vlan>4094)return 'Management fabric VLAN must be 1–4094';
  if(v.gateway&&(!ipv4(v.gateway)||!subnet(v.ip,v.gateway,+v.prefix)))return 'Management gateway must be in the management subnet';
  if(v.dns&&!ipv4(v.dns)||v.ntp&&!ipv4(v.ntp))return 'Use IPv4 addresses for DNS and NTP in this training profile';
  const addresses=[v.ip];if(['powerstore','powervault'].includes(family)){
   if(!cidr(v.nodeA,v.prefix)||!cidr(v.nodeB,v.prefix)||!subnet(v.ip,v.nodeA,+v.prefix)||!subnet(v.ip,v.nodeB,+v.prefix))return 'Controller/node A and B require addresses in the management subnet';
   if(family==='powerstore')addresses.push(v.nodeA,v.nodeB);else{if(v.ip!==v.nodeA)return 'For ME5, the GUI address is controller A; enter the same address in both fields';addresses.push(v.nodeB);}
  }
  if(new Set(addresses).size!==addresses.length)return 'Management addresses must be unique';
  for(const other of ctx.nodes.filter(x=>x.id!==n.id&&x.active!==false)){const m=configuredProduct(other).management,used=[other.net.ip,m.nodeA,m.nodeB];if(addresses.some(ip=>used.includes(ip)))return 'Management address conflicts with '+other.id;}
  p.management={...v,prefix:+v.prefix,vlan:+v.vlan};Object.assign(c,{ip:v.ip,prefix:+v.prefix,vlan:+v.vlan,gateway:v.gateway||'',dns:v.dns||'',ntp:v.ntp||'',ssh:!!v.ssh});c.vlans[c.vlan]='MANAGEMENT';
  n.ports.filter(x=>isMgmt(x)).forEach(x=>Object.assign(x.cfg,{mode:'access',access:c.vlan,allowed:[c.vlan]}));
 }else if(a.op==='host'){
  if(!['idrac','ilo'].includes(family))return 'Host OS and initiators belong to PowerEdge / XE servers';
  if(!['VMware ESXi','Linux','Windows Server'].includes(v.os))return 'Select an OS image';
  if(!['RAID 1 boot','RAID 10','HBA / passthrough'].includes(v.raid))return 'Select boot storage layout';
  if(!['FC','iSCSI','NVMe/TCP'].includes(v.protocol))return 'Select FC, iSCSI or NVMe/TCP host transport';
  error=dataPorts(n,v);if(error)return error;if(['iSCSI','NVMe/TCP'].includes(v.protocol)&&!(v.protocol==='NVMe/TCP'?/^nqn\./.test(v.iqn):iqn(v.iqn)))return 'Enter a valid IQN or host NQN for the selected transport';if(v.protocol==='FC'&&(!wwpn(v.wwpnA)||!wwpn(v.wwpnB)||v.wwpnA===v.wwpnB))return 'Enter two distinct HBA WWPNs';
  p.host=v;setDataPorts(n,v);syncHostNics(n);c.os=v.os;
 }else if(a.op==='storage'){
  if(!['powerstore','powervault','alletra'].includes(family))return 'Block provisioning is available on PowerStore and PowerVault';
  if(!profile.protocols.includes(v.protocol))return 'Transport does not match the purchased controller option';
  if(!nameOK(v.pool)||!nameOK(v.volume)||!Number.isInteger(+v.sizeGiB)||+v.sizeGiB<1||+v.sizeGiB>65536)return 'Enter a pool, volume and size from 1–65536 GiB';
  if(family==='powervault'&&(!['Virtual','Linear'].includes(v.mode)||!['ADAPT','RAID 1','RAID 5','RAID 6','RAID 10'].includes(v.raid)))return 'Select ME5 storage type and RAID protection';
  error=dataPorts(n,v);if(error)return error;const host=ctx.byId[v.host];if(!host||host.active===false||!['idrac','ilo'].includes(productProfile(host).family))return 'Select an installed PowerEdge, XE or ProLiant host';
  const h=configuredProduct(host).host;if(h.protocol!==v.protocol||!h.initiatorEnabled)return 'Configure and enable the selected host initiator first';
  if(v.protocol==='FC'&&(!wwpn(v.initiator)||![h.wwpnA,h.wwpnB].includes(v.initiator)))return 'Host registration must use the selected host HBA WWPN';if(['iSCSI','NVMe/TCP'].includes(v.protocol)&&v.initiator!==h.iqn)return 'Host registration must use the selected host IQN / NQN';
  if(n.spec&&!p.identity.passwordSet)return 'Complete the array initial setup (system identity and administrator) before provisioning volumes';
  const r=deviceRuntime(n),old=r.volumes[v.volume],protection=v.raid||p.identity.protection||poolProtections(n)[0];
  if(old&&+v.sizeGiB<old.sizeGiB)return 'Volumes cannot be shrunk; create a smaller volume and migrate the data';
  const otherRaw=Object.values(r.pools).filter(x=>x.id!==v.pool).reduce((t,x)=>t+x.sizeGiB,0),pool=r.pools[v.pool]||{id:v.pool,sizeGiB:r.capacityGiB-otherRaw,protection};
  if(pool.sizeGiB<1)return 'No unallocated drive capacity remains for pool '+v.pool;
  const allocated=Object.values(r.volumes).filter(x=>x.pool===v.pool&&x.id!==v.volume).reduce((t,x)=>t+x.sizeGiB,0);
  if(allocated+ +v.sizeGiB>poolUsable(pool))return 'Insufficient usable capacity in '+v.pool+' after '+pool.protection+' protection ('+(poolUsable(pool)-allocated)+' GiB free)';
  p.storage=v;setDataPorts(n,v);c.volume=v.volume;c.mapping=v.host;
  r.pools[v.pool]=pool;r.hosts[v.host]={id:v.host,initiator:v.initiator};r.volumes[v.volume]={thin:true,access:'read-write',group:'',...old,id:v.volume,pool:v.pool,sizeGiB:+v.sizeGiB,protocol:v.protocol,host:v.host,initiator:v.initiator,legacy:true};r.legacyImported=true;
 }else if(a.op==='nas'){
  if(!['powerscale','storeonce'].includes(family))return 'NAS target setup belongs to OneFS or StoreOnce';if(!nameOK(v.name)||!cidr(v.ip,v.prefix)||!['SMB','NFS'].includes(v.protocol)||!nameOK(v.zone)||!Number.isInteger(v.vlan)||v.vlan<1||v.vlan>4094)return 'Enter target, access zone, data IP/prefix, VLAN and SMB or NFS';const iface=port(n,v.port);if(!iface||iface.medium!=='Ethernet'||isMgmt(iface))return 'Select an Ethernet data port';Object.assign(iface.cfg,{ip:v.ip,prefix:v.prefix,mode:'access',access:v.vlan,allowed:[v.vlan]});n.net.vlans[v.vlan]='FILE-DATA';p.nas=v;
 }else if(a.op==='object'){
  if(family!=='objectscale')return 'S3 provisioning belongs to ObjectScale';if(!nameOK(v.pool)||!nameOK(v.replicationGroup)||!nameOK(v.namespace)||!nameOK(v.user)||! /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(v.bucket||''))return 'Enter pool, replication group, namespace, object user and a valid lowercase bucket';
  if(!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(v.endpoint||''))return 'Enter the HTTPS S3 endpoint / load-balancer name';p.object=v;
 }else if(a.op==='wan'){
  if(family!=='fortigate')return 'WAN configuration belongs to FortiGate';const w=port(n,v.port);if(!w||isMgmt(w)||w.medium!=='Ethernet')return 'Select an Ethernet WAN data interface';
  if(!c.ispContract)return 'Order an ISP circuit for this firewall in Procurement first';
  const lease=c.ispContract,prefix=lease.prefix||30,mode=lease.mode||'Static';
  if(lease.physical){const other=w.link&&!w.link.unplugged?(w.link.a===n.id?w.link.b:w.link.a):null;if(other&&ctx.byId[other]?.type!=='isp')return 'This interface is cabled to '+other+'; use the port patched to the provider router';if(v.mode!==mode)return 'This circuit is '+mode+' ('+lease.planName+') · choose '+mode+' addressing';}
  else{if(w.link&&!w.link.unplugged)return 'This interface is already cabled to a device; choose a free WAN port';if(!['Static','DHCP'].includes(v.mode))return 'Choose Static or DHCP';}
  if(v.mode==='DHCP'||v.mode==='PPPoE'){if(v.mode==='PPPoE'){const pp=lease.pppoe,now=Date.now();lease.log??=[];if(pp.lockedUntil>now)return 'PPPoE: account locked by the provider after 3 failed attempts · retry in '+Math.ceil((pp.lockedUntil-now)/1000)+' s';if(v.pppoeUser!==pp.user||v.pppoePassword!==pp.password){pp.fails=(pp.fails||0)+1;lease.log.unshift({at:now,text:'PAP authentication failure for '+(v.pppoeUser||'(empty)')+' ('+pp.fails+'/3)'});if(pp.fails>=3){pp.lockedUntil=now+30000;pp.fails=0;lease.log.unshift({at:now,text:'Account '+pp.user+' locked for 30 s after 3 failed attempts'});}lease.log=lease.log.slice(0,30);return 'PPPoE authentication failed · use the username and password from the circuit sheet'+(pp.lockedUntil>now?' · account now locked for 30 s':' ('+pp.fails+'/3 attempts)');}pp.fails=0;delete pp.changed;lease.log.unshift({at:now,text:'PPPoE session up for '+pp.user+' · IP '+lease.ip});lease.log=lease.log.slice(0,30);}v.ip=lease.ip;v.prefix=prefix;v.gateway=lease.gateway;}
  else if(v.mode!=='Static')return 'Choose the addressing mode from the circuit sheet';
  if(v.ip!==lease.ip||+v.prefix!==prefix||v.gateway!==lease.gateway)return 'Use the circuit sheet: '+lease.ip+'/'+prefix+' gateway '+lease.gateway;
  if(!ipv4(v.dns))return 'Enter an IPv4 DNS server';const auth=v.mode==='PPPoE';delete v.pppoePassword;if(v.mode==='DHCP'){lease.leaseMac=hostMac(n,n.ports.indexOf(w));lease.log??=[];lease.log.unshift({at:Date.now(),text:'DHCPACK '+lease.ip+' to '+lease.leaseMac});}p.wan={...v,prefix,pppoeAuthenticated:auth};Object.assign(w.cfg,{admin:!!v.enabled,ip:v.ip,prefix,role:'wan'});c.enterprise??={policies:[],routes:[],logs:[],incidents:[]};c.enterprise.routes=c.enterprise.routes.filter(r=>r.id!==9999);if(v.defaultRoute)c.enterprise.routes.push({id:9999,dst:'0.0.0.0/0',gateway:v.gateway,device:v.port});
 }else if(a.op==='fabric'){
  if(family!=='connectrix')return 'FC zoning requires a Connectrix B-Series switch';if(!v.aliases||!v.zones||!v.configs||!Array.isArray(v.members))return 'Invalid fabric configuration';if(Object.values(v.aliases).some(list=>!Array.isArray(list)||!list.every(wwpn)))return 'FC aliases require colon-separated WWPNs';p.fabric=v;c.zone=v.active||'';
 }else if(a.op==='commission'){
  const checks=productChecks(n,ctx).filter(x=>x.required);if(checks.some(x=>!x.ok))return 'Complete: '+checks.filter(x=>!x.ok).map(x=>x.label).join(' · ');p.commissioned=true;
 }else return 'Unsupported product setting';
 return 'Applied · '+profile.title+' / '+a.op;
}
function hostMac(n,i){let h=7;for(const c of n.id)h=(h*31+c.charCodeAt(0))>>>0;return ['00','09','0f',((h>>>16)&255).toString(16).padStart(2,'0'),((h>>>8)&255).toString(16).padStart(2,'0'),((h+i)&255).toString(16).padStart(2,'0')].join(':');}
export function productChecks(n,ctx){const p=configuredProduct(n),f=productProfile(n).family,managed=n.net.ip!=='0.0.0.0',rows=[{label:'System identity and administrator changed',ok:!!p.identity.passwordSet,required:true},{label:'Management addressing',ok:managed,required:true}];
 if(['powerstore','powervault'].includes(f))rows.push({label:'Node/controller A and B addresses',ok:!!p.management.nodeA&&!!p.management.nodeB,required:true});
 if(['powerstore','objectscale','siem'].includes(f))rows.push({label:'DNS and NTP addresses',ok:!!p.management.dns&&!!p.management.ntp,required:true});
 if(['idrac','ilo'].includes(f))rows.push({label:'Host OS and data initiators',ok:!!p.host.os&&!!p.host.initiatorEnabled,required:false});
 if(['powerstore','powervault','alletra'].includes(f))rows.push({label:'Volume registered and mapped to host',ok:!!p.storage.volume,required:false},{label:'At least two independent storage paths',ok:storagePaths(n,ctx).length>=2,required:false});
 if(f==='objectscale')rows.push({label:'S3 namespace, user and bucket',ok:!!p.object.bucket,required:false});
 if(f==='fortigate')rows.push({label:'ISP handoff, WAN addressing and default route',ok:wanStatus(n,ctx).ok,required:false});
 rows.push({label:'Remote management cable path',ok:!!ctx.reachable?.(ctx.byId['MGMT-SW'],n,n.net.vlan),required:false});return rows;
}
function good(l,ctx){return !l.retired&&!l.unplugged&&!l.disabled&&!physicalOffline(ctx.byId[l.a])&&!physicalOffline(ctx.byId[l.b])&&l.pa.cfg?.admin!==false&&l.pb.cfg?.admin!==false;}
// Legacy single-mapping view used by the product GUI and older checks: the array's configured
// primary host with the initiator recorded in the storage wizard. Per-volume access (host groups,
// several hosts) is evaluated by storage-access.js volumeAccess().
export function storagePaths(n,ctx){const s=configuredProduct(n).storage,host=ctx.byId[s.host];if(!host||!s.protocol)return [];const h=configuredProduct(host).host;if(!h.initiatorEnabled||h.protocol!==s.protocol)return [];if(['iSCSI','NVMe/TCP'].includes(s.protocol)&&s.initiator!==h.iqn)return [];if(s.protocol==='FC'&&![h.wwpnA,h.wwpnB].includes(s.initiator))return [];return pathsTo(n,host,ctx);}
// Physical circuits need the provider router racked, powered and patched to the WAN port.
export function ispHandoff(n,iface,lease,ctx){
 const cpe=ctx.nodes?.find(x=>x.type==='isp'&&x.active!==false&&x.spec?.contract===lease.id);
 if(!cpe)return {ok:false,reason:'Provider router for '+lease.id+' is not racked yet · receive it, rack it and connect power'};
 if(physicalOffline(cpe))return {ok:false,reason:'Provider router '+cpe.id+' has no power'};
 if(cpe.physical?.faults?.los)return {ok:false,reason:'Provider router '+cpe.id+' reports LOS (no light on FIBER-IN) · provider fiber fault, open a provider ticket'};
 const l=iface.link;if(!l||l.unplugged)return {ok:false,reason:'WAN port '+iface.name+' has no cable · patch it to '+cpe.id+' LAN1 (1G) or SFP1 (10G)'};
 const other=l.a===n.id?l.b:l.a,far=l.a===n.id?l.pb:l.pa;if(other!==cpe.id)return {ok:false,reason:'WAN port '+iface.name+' is cabled to '+other+', not the provider router'};
 if(l.disabled||l.fault||far.fault||iface.cfg.admin===false)return {ok:false,reason:'Link '+iface.name+' ↔ '+cpe.id+' / '+far.name+' is down'};
 return {ok:true,reason:'Handoff '+cpe.id+' / '+far.name+' up',cpe:cpe.id};
}
export function wanStatus(n,ctx){const w=configuredProduct(n).wan,lease=n.net.ispContract,iface=port(n,w.port),prefix=lease?.prefix||30;if(!lease)return {ok:false,reason:'No ISP circuit · Procurement → ISP services'};if(!iface||!w.ip)return {ok:false,reason:'Configure the WAN interface using the circuit sheet'};if(physicalOffline(n))return {ok:false,reason:'Firewall is powered off / booting'};if(iface.cfg.ip!==lease.ip||iface.cfg.prefix!==prefix)return {ok:false,reason:lease.notice?'WAN address '+iface.cfg.ip+' no longer matches the circuit sheet · provider notice: '+lease.notice:'WAN address no longer matches the circuit sheet'};if(!w.enabled||!iface.cfg.admin)return {ok:false,reason:'WAN interface is administratively down'};if(lease.physical){const h=ispHandoff(n,iface,lease,ctx);if(!h.ok)return h;if(lease.mode==='PPPoE'&&!w.pppoeAuthenticated)return {ok:false,reason:lease.pppoe?.changed?'PPPoE authentication failed · the provider changed the password (see the provider notice on the circuit sheet)':'PPPoE session not authenticated'};if(lease.mode==='DHCP'&&lease.leaseMac&&lease.leaseMac!==hostMac(n,n.ports.indexOf(iface)))return {ok:false,reason:'Provider DHCP has no lease for '+hostMac(n,n.ports.indexOf(iface))+' · the lease is bound to '+lease.leaseMac+' (re-apply the WAN on the cabled port)'};}else if(iface.link&&!iface.link.unplugged)return {ok:false,reason:'WAN port is occupied by an internal cable'};if(!n.net.enterprise?.routes.some(r=>r.dst==='0.0.0.0/0'&&r.device===w.port&&r.gateway===lease.gateway))return {ok:false,reason:'Default route to ISP gateway is missing'};return {ok:true,reason:'ISP circuit up · '+lease.id+' · '+(lease.mode||'Static')+' · '+w.ip+'/'+prefix};}
