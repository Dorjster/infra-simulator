import {productProfile} from './product-profiles.js';
import {prefixOf,ipv4} from './device-runtime.js';

export const CLI_COMMANDS=['enable','configure terminal','end','exit','show running-config','show startup-config','show interfaces status','show interfaces counters errors','show ip interface brief','show vlan brief','show lldp neighbors','show mac address-table','show ip route','show logging','show inventory','show environment','copy running-config startup-config','write memory','reload','interface','interface vlan','ip address','ip route','hostname','vlan','name','shutdown','no shutdown','switchport mode access','switchport mode trunk','switchport access vlan','switchport trunk allowed vlan','description','mtu','feature ssh','config system interface','config system global','config firewall policy','config firewall address','config router static','edit','set','unset','next','get system status','get system performance status','show firewall policy'];
export function cliPort(n,name){const key=String(name).replace(/\s/g,'').toLowerCase();return n.ports.find(p=>[p.name,p.alias].some(x=>x?.replace(/\s/g,'').toLowerCase()===key))||n.ports.find(p=>String(p.name).replace(/^ethernet\s*/i,'').toLowerCase()===key.replace(/^ethernet|^eth/i,''))||(/^port\d+$/.test(key)?n.ports[+key.slice(4)-1]:null);}
export function formatConfig(n,config=n.net){const c=config,lines=['hostname '+(c.hostname||n.id),'!'];for(const [id,name] of Object.entries(c.vlans||{}))lines.push('vlan '+id,' name '+name);for(let i=0;i<n.ports.length;i++){const p=n.ports[i],v=c.ports[i];if(!v||p.service||p.medium==='Internal')continue;lines.push('interface '+(p.alias||p.name),...(v.description?[' description '+v.description]:[]),v.admin?' no shutdown':' shutdown',v.routed?' no switchport':' switchport mode '+v.mode);if(!v.routed)lines.push(v.mode==='trunk'?' switchport trunk allowed vlan '+v.allowed.join(','):' switchport access vlan '+v.access);if(v.ip)lines.push(' ip address '+v.ip+'/'+v.prefix);if(v.mtu)lines.push(' mtu '+v.mtu);}
 for(const x of Object.values(c.svis||{}))lines.push('interface vlan '+x.id,...(x.ip?[' ip address '+x.ip+'/'+x.prefix]:[]),x.admin?' no shutdown':' shutdown');
 for(const r of c.enterprise?.routes||[])lines.push('ip route '+r.dst+' '+r.gateway);if(c.gateway)lines.push('management route 0.0.0.0/0 '+c.gateway);if(c.dns)lines.push('ip name-server '+c.dns);if(c.ntp)lines.push('ntp server '+c.ntp);if(c.ssh)lines.push('feature ssh');return lines.join('\n');}
export function applyCLIState(n,a){
 const c=n.net,v=a.value||{};if(a.op==='save'){const copy=structuredClone(c);delete copy.startup;delete copy.cliCheckpoint;c.startup=copy;return 'Applied · Configuration saved to startup-config';}
 if(a.op==='reload'){if(!c.startup)return 'No startup-config saved. Save configuration before this training reload';const runtime=c.runtime,startup=structuredClone(c.startup);n.net={...structuredClone(startup),startup,runtime};n.ports.forEach((p,i)=>p.cfg=n.net.ports[i]);return 'Applied · Device reloaded from startup-config';}
 if(a.op==='svi'){const id=+v.id;if(!Number.isInteger(id)||id<1||id>4094||!c.vlans[id])return 'Create the VLAN first';if(v.ip&&(!ipv4(v.ip)||!Number.isInteger(v.prefix)||v.prefix<1||v.prefix>30))return 'Invalid SVI address / prefix';c.svis??={};c.svis[id]={id,admin:true,...c.svis[id],...v};return 'Applied · VLAN '+id+' interface';}
 if(a.op==='route'){if(!ipv4(v.dst?.split('/')[0])||!/^\d+$/.test(v.dst?.split('/')[1]||'')||+v.dst.split('/')[1]>32||!ipv4(v.gateway))return 'Invalid route destination or gateway';const routes=c.enterprise.routes;const old=routes.findIndex(r=>r.dst===v.dst);if(v.remove){if(old>=0)routes.splice(old,1);}else {const route={id:old>=0?routes[old].id:Math.max(0,...routes.map(r=>+r.id||0))+1,dst:v.dst,gateway:v.gateway,device:v.device||'',vrf:v.vrf||'default'};if(old>=0)routes[old]=route;else routes.push(route);}return 'Applied · Route '+v.dst;}
 if(a.op==='interface'){const p=n.ports[a.index];if(!p||p.service||p.medium==='Internal')return 'Select a valid physical interface';if(v.ip&&(!ipv4(v.ip)||!Number.isInteger(v.prefix)||v.prefix<1||v.prefix>30))return 'Invalid interface address';for(const key of ['description','routed','ip','prefix','native','portfast','bpduguard','speed','duplex','fec','alias','role','allowaccess','lag','lacp','poePriority'])if(v[key]!==undefined)p.cfg[key]=v[key];return 'Applied · Interface '+p.name;}
 if(a.op==='global'){for(const key of ['stp','stpPriority','poeBudget','mclag'])if(v[key]!==undefined)c[key]=v[key];return 'Applied · global switch settings';}
 return 'Unsupported CLI operation';
}
export async function nativeCLI(input,s,change,ctx){
 const n=s.node,c=n.net,f=productProfile(n),text=input.trim(),lower=text.toLowerCase(),forti=['fortigate','fortiswitch','analyzer','siem'].includes(f.family);let m;
 const send=(op,value={},index)=>change({type:'cli-state',node:n.id,op,value,index});
 if(f.family==='connectrix')return null;
 if(['write memory','copy running-config startup-config'].includes(lower))return send('save');
 if(lower==='show startup-config')return c.startup?formatConfig(n,c.startup):'No startup-config saved';
 if(lower==='reload'){s.reloadPending=true;return 'Reload discards unsaved network changes. Type confirm to reload or cancel.';}
 if(s.reloadPending){s.reloadPending=false;return lower==='confirm'?send('reload'):'Reload cancelled';}
 if(lower==='show running-config'&&!forti)return formatConfig(n);
 if(lower==='show ip route')return 'Connected management: '+c.ip+'/'+c.prefix+'\n'+Object.values(c.svis||{}).filter(x=>x.admin&&x.ip).map(x=>'C '+x.ip+'/'+x.prefix+' via VLAN '+x.id).join('\n')+'\n'+c.enterprise.routes.map(x=>'S '+x.dst+' via '+x.gateway+(x.device?' dev '+x.device:'')).join('\n');
 if(lower==='show ip interface brief')return [['Management',c.ip+'/'+c.prefix,'up'],...Object.values(c.svis||{}).map(x=>['Vlan'+x.id,x.ip?x.ip+'/'+x.prefix:'unassigned',x.admin?'up':'down']),...n.ports.filter(p=>p.cfg.ip).map(p=>[p.name,p.cfg.ip+'/'+p.cfg.prefix,p.cfg.admin?'up':'down'])].map(x=>x.join('  ')).join('\n');
 if(/^show (lldp neighbors|mac address-table|arp)/.test(lower))return n.ports.filter(p=>p.link&&!p.link.unplugged&&!p.link.disabled).map(p=>{const l=p.link,peer=ctx.byId[l.a===n.id?l.b:l.a];return p.name+' → '+peer.id+' · '+peer.net.ip+' · VLAN '+(p.cfg.mode==='trunk'?p.cfg.allowed.join(','):p.cfg.access);}).join('\n')||'No live neighbors learned';
 if(lower==='show interfaces counters errors')return n.ports.map(p=>p.name+'  errors '+(p.fault?1:0)+'  '+(p.cfg.admin?'enabled':'shutdown')).join('\n');
 if(lower==='show logging')return c.enterprise.logs.map(x=>new Date(x.at).toLocaleTimeString()+' '+x.message).join('\n')||'No events';
 if(lower==='show inventory')return n.model+' · '+n.id+'\n'+n.ports.map(p=>p.name+' · '+p.medium+' · '+p.speed+'G').join('\n');
 if(lower==='show environment'||lower==='show power')return 'Power: '+(ctx.localStatus(n).ok?'available':'unavailable')+'\nPSU A: '+(n.physical?.power[0]||(!n.physical?'factory A':'disconnected'))+'\nPSU B: '+(n.physical?.power[1]||(!n.physical?'factory B':'disconnected'));
 if(lower==='show transceiver'||lower==='show interface transceiver details')return n.ports.filter(p=>!p.service).map(p=>p.name+' · '+(p.optic||'No replaceable optic / copper or DAC')+' · '+p.speed+'G').join('\n');
 if(lower==='?'||lower==='help')return forti?null:CLI_COMMANDS.filter(x=>!x.startsWith('config ')&&!['edit','set','unset','next','get system status','get system performance status','show firewall policy'].includes(x)).join('\n')+'\nSupported simulator commands; ? and Tab show available syntax.';
 if(text.endsWith('?'))return CLI_COMMANDS.filter(x=>x.startsWith(lower.slice(0,-1).trim())).join('\n')||'No matching commands';
 if(forti)return null;
 if(lower==='enable'){s.privileged=true;return (c.hostname||n.id)+'#';}
 if(['configure terminal','conf t'].includes(lower)){s.config=true;s.interface=null;s.svi=null;return (c.hostname||n.id)+'(config)#';}
 if(lower==='end'){s.config=false;s.interface=null;s.svi=null;s.management=false;return (c.hostname||n.id)+'#';}
 if(lower==='exit'){s.interface=null;s.svi=null;s.management=false;return (c.hostname||n.id)+(s.config?'(config)#':'#');}
 if(m=/^interface\s+vlan\s*(\d+)$/i.exec(text)){if(!s.config)return 'Enter configure terminal first';if(!c.vlans[+m[1]])return 'Create VLAN '+m[1]+' first';s.svi=+m[1];s.interface=null;s.management=false;return (c.hostname||n.id)+'(config-if-vlan)#';}
 if(m=/^interface\s+(.+)$/i.exec(text)){if(!s.config)return 'Enter configure terminal first';const p=cliPort(n,m[1]);if(!p)return null;s.svi=null;s.interface=n.ports.indexOf(p);s.management=/mgmt|management/i.test(p.name+' '+p.alias);return (c.hostname||n.id)+'(config-if)#';}
 if(!s.config)return null;
 if(m=/^ip address (\S+)(?:\s+(\S+))?$/i.exec(text)){const [ip,slash]=m[1].split('/'),prefix=prefixOf(slash||m[2]);if(!ipv4(ip)||!Number.isInteger(prefix)||prefix<1||prefix>30)return 'Enter IPv4 and prefix or contiguous subnet mask';if(s.svi)return send('svi',{id:s.svi,ip,prefix});if(s.management)return change({type:'address',node:n.id,ip,prefix});if(Number.isInteger(s.interface))return send('interface',{ip,prefix,routed:true},s.interface);return 'Select a management interface, routed port or VLAN interface first';}
 if(s.svi&&['shutdown','shut','no shutdown','no shut'].includes(lower))return send('svi',{id:s.svi,admin:lower.startsWith('no ')});
 if(m=/^(no )?ip route (\S+) (\S+)(?: (\S+))?$/i.exec(text)){let dst=m[2],gateway=m[3];if(!dst.includes('/')){dst+='/'+prefixOf(m[3]);gateway=m[4];}return send('route',{dst,gateway,remove:!!m[1]});}
 if(Number.isInteger(s.interface)){
  if(m=/^description (.+)$/i.exec(text))return send('interface',{description:m[1].slice(0,80)},s.interface);
  if(lower==='no switchport'||lower==='switchport')return send('interface',{routed:lower.startsWith('no')},s.interface);
  if(m=/^switchport trunk native vlan (\d+)$/i.exec(text))return send('interface',{native:+m[1]},s.interface);
  if(m=/^mtu (\d+)$/i.exec(text))return change({type:'port',node:n.id,index:s.interface,value:{mtu:+m[1]}});
  if(m=/^switchport trunk allowed vlan (?:(add|remove) )?([\d,-]+)$/i.exec(text)){const ids=[];for(const part of m[2].split(',')){const [a,b=a]=part.split('-').map(Number);if(a<1||b>4094||b<a||b-a>127)return 'Invalid VLAN range (maximum 128 per operation)';for(let i=a;i<=b;i++)ids.push(i);}if(ids.some(v=>!c.vlans[v]))return 'Create each VLAN first';const prev=n.ports[s.interface].cfg.allowed;return change({type:'port',node:n.id,index:s.interface,value:{allowed:m[1]==='add'?[...new Set([...prev,...ids])]:m[1]==='remove'?prev.filter(x=>!ids.includes(x)):ids}});}
 }
 return null;
}
