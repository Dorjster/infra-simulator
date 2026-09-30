import {deviceRuntime,installStatus,bootHealth} from './device-runtime.js';

// Product managers publish their services into the existing office traffic evaluator.
// Deployed VM state remains on its host; office entries contain references, not copies of VM state.
export function syncDeviceServices(s,nodes){
 for(const n of nodes){if(n.active===false)continue;if(n.id===s.bindings.firewall){for(const x of n.net.enterprise?.interfaces||[])s.vlans[x.vlanid]={...s.vlans[x.vlanid],id:x.vlanid,name:x.name,ip:x.ip,prefix:x.prefix,enabled:x.enabled!==false};}if(!n.net.runtime)continue;const r=deviceRuntime(n);
  const boot=bootHealth(n);if(['server','gpu'].includes(n.type)&&r.os){s.systems[n.id]={...s.systems[n.id],id:n.id,os:r.os,installed:boot.ok,raid:r.raid,reboot:false,cpu:r.cpu,memory:r.memory,hypervisor:!!r.hypervisor,vms:Object.keys(r.vms).length,installState:boot.ok?installStatus(n).reason:boot.reason};}
  else if(['server','gpu'].includes(n.type)&&s.systems[n.id])Object.assign(s.systems[n.id],{installed:false,hypervisor:false,installState:installStatus(n).reason});
  const expected=new Set();for(const target of [r,...Object.values(r.vms)])for(const service of Object.values(target.services||{})){
   const id=n.id+':'+(target.id||'host')+':'+service.id;expected.add(id);const old=s.services[id];s.services[id]={...old,id,kind:service.kind,engine:service.engine,host:n.id,vm:target.id||'',managedBy:n.id,sourceService:service.id,ip:target.id?target.ip:r.hostIP,prefix:target.id?+(target.prefix||24):r.hostPrefix,gateway:target.id?target.gateway||'':r.gateway,vlan:target.id?r.portgroups[target.network]?.vlan:r.hostVlan,port:service.port,running:service.running,groups:service.groups||'company',serverFirewall:service.firewall?String(service.port):'',content:service.content,tls:service.port===443,expires:'2035-12-31',limit:100};
   if(service.name&&s.dns[service.name]?.managedBy===id)s.dns[service.name].ip=s.services[id].ip;
  }
  for(const share of Object.values(r.shares)){const id=n.id+':share:'+share.id;expected.add(id);s.services[id]={id,managedBy:n.id,kind:share.protocol,host:n.id,ip:share.ip,vlan:share.vlan,port:share.protocol==='SMB'?445:2049,running:true,groups:'company',serverFirewall:'445,2049',limit:100};s.shares[id]={id,service:id,protocol:share.protocol,read:share.read,write:share.write,subnets:share.subnets,quota:share.quota*1024*1024};s.files[id]??={};}
  for(const [id,service] of Object.entries(s.services))if(service.managedBy===n.id&&!expected.has(id)){delete s.services[id];delete s.shares[id];}
 }
}
