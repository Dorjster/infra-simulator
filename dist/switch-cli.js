import {productProfile,configuredProduct} from './product-profiles.js';
export async function switchCLI(input,session,change){const n=session.node,f=productProfile(n),text=input.trim(),lower=text.toLowerCase();if(!f.serial)return null;let m;
 const mgmt=(ip,prefix,gateway='')=>change({type:'product',node:n.id,op:'management',value:{ip,prefix:+prefix,gateway,vlan:70,ssh:true,dns:n.net.dns||'',ntp:n.net.ntp||''}});
 if(f.family==='fortiswitch'){
  if(lower==='config system interface'||lower==='config switch interface'||lower==='config router static'){session.config=true;session.fortiSection=lower;return n.id+' (config)#';}
  if(m=/^edit (.+)$/i.exec(text)){const name=m[1].replace(/^"|"$/g,'');session.management=name==='mgmt';session.interface=n.ports.findIndex(p=>p.name===name||p.alias===name);return n.id+' ('+m[1]+')#';}
  if(m=/^set ip (\S+)(?: (\S+))?$/i.exec(text)){const [ip,prefix]=m[1].split('/');const bits=m[2]?.split('.').map(x=>(+x).toString(2).padStart(8,'0')).join('');return mgmt(ip,prefix||(bits&&/^1*0*$/.test(bits)?bits.replace(/0/g,'').length:24),n.net.gateway);}
  if(/^set allowaccess /i.test(text))return change({type:'ssh',node:n.id,enabled:lower.includes('ssh')});
  if(m=/^set gateway (\S+)$/i.exec(text))return change({type:'settings',node:n.id,value:{gateway:m[1]}});
  if(m=/^set (native-vlan|allowed-vlans) ([\d, ]+)$/i.exec(text)){if(session.interface<0)return 'Select a switch port first';const vlans=m[2].split(/[ ,]+/).map(Number);for(const v of vlans)await change({type:'vlan',node:n.id,id:v});return change({type:'port',node:n.id,index:session.interface,value:m[1]==='native-vlan'?{mode:'access',access:vlans[0]}:{mode:'trunk',allowed:vlans}});}
 }
 if(f.family==='aoscx'){
  if(lower==='interface mgmt'){session.config=true;session.management=true;return n.id+' (config-if-mgmt)#';}
  if(m=/^ip static (\S+)$/i.exec(text)){const [ip,prefix]=m[1].split('/');return mgmt(ip,prefix,n.net.gateway);}
  if(lower==='no ip dhcp')return 'Management DHCP disabled';
  if(m=/^default-gateway (\S+)$/i.exec(text))return change({type:'settings',node:n.id,value:{gateway:m[1]}});
  if(lower==='ssh server vrf mgmt')return change({type:'ssh',node:n.id,enabled:true});
 }
 if(f.family==='connectrix'){
  const state=configuredProduct(n).fabric||{aliases:{},zones:{},configs:{},members:[],enabled:false};
  const save=v=>change({type:'product',node:n.id,op:'fabric',value:v});
  if(session.ipWizard){const d=session.ipWizard;d.values.push(text);if(d.values.length===1)return 'Ethernet Subnetmask:';if(d.values.length===2)return 'Gateway IP Address:';session.ipWizard=null;const bits=d.values[1].split('.').map(x=>(+x).toString(2).padStart(8,'0')).join('');if(!/^1+0+$/.test(bits))return 'Invalid subnet mask';return mgmt(d.values[0],bits.indexOf('0'),d.values[2]);}
  if(lower==='help')return 'ipaddrset (interactive IPv4 address, mask, gateway)\nipaddrshow | switchname NAME | switchshow\nportdisable PORT | portenable PORT\nalicreate "NAME","WWPN"\nzonecreate "ZONE","HOST_ALIAS;TARGET_ALIAS"\ncfgcreate "CFG","ZONE"\ncfgenable "CFG"\ncfgsave | cfgshow\nUse separate switches/fabrics for paths A and B.';
  if(lower==='ipaddrset'){session.ipWizard={values:[]};return 'Ethernet IP Address:';}
  if(lower==='ipaddrshow')return `Ethernet IP Address: ${n.net.ip}/${n.net.prefix}\nGateway: ${n.net.gateway||'not set'}`;
  if(m=/^switchname\s+(.+)$/i.exec(text))return change({type:'settings',node:n.id,value:{hostname:m[1]}});
  if(lower==='switchshow')return n.ports.filter(p=>p.medium==='Fibre Channel').map(p=>p.name+' '+(p.cfg.admin?'Enabled':'Disabled')+' '+(p.link&&!p.link.unplugged?'Online':'No light')).join('\n');
  if(m=/^port(enable|disable)\s+(\S+)$/i.exec(text)){const p=n.ports.find(p=>p.name===m[2]||p.name==='FC '+(+m[2]+1));return p?change({type:'port',node:n.id,index:n.ports.indexOf(p),value:{admin:m[1].toLowerCase()==='enable'}}):'Unknown FC port';}
  if(m=/^(alicreate|zonecreate|cfgcreate)\s+"([\w.-]+)"\s*,\s*"([^"]+)"$/i.exec(text)){const v=structuredClone(state),key=m[1].toLowerCase()==='alicreate'?'aliases':m[1].toLowerCase()==='zonecreate'?'zones':'configs';v[key][m[2]]=m[3].split(';');return save(v);}
  if(m=/^cfgenable\s+"?([\w.-]+)"?$/i.exec(text)){if(!state.configs[m[1]])return 'Create this configuration first';const v=structuredClone(state);v.active=m[1];v.enabled=true;v.members=[];for(const zone of v.configs[m[1]]){if(!v.zones[zone])return 'Unknown zone '+zone;for(const alias of v.zones[zone])v.members.push(...(v.aliases[alias]||[alias]));}return save(v);}
  if(lower==='cfgshow')return JSON.stringify(state,null,2);if(lower==='cfgsave')return 'Fabric configuration saved in the shared world';
  return 'Fabric OS command not supported. Type help; use ipaddrset for management.';
 }
 if(m=/^interface\s+(mgmt\s*1\/1\/1|management\s*1\/1\/1|mgmt0)$/i.exec(text)){if(!session.config)return 'Enter configure terminal first';const p=n.ports.find(p=>p.name==='MGMT UPLINK')||n.ports.find(p=>p.name==='MGMT');if(!p)return 'No dedicated management port';session.interface=n.ports.indexOf(p);session.management=true;return `${n.id}(config-if-mgmt)#`;}
 if(/^interface /i.test(text))session.management=false;
 if(m=/^interface ethernet\s+(\S+)$/i.exec(text)){if(!session.config)return 'Enter configure terminal first';session.interface=n.ports.findIndex(p=>p.name.toLowerCase()==='ethernet'+m[1].toLowerCase()||p.name===m[1]);return session.interface>=0?n.id+'(config-if)#':'Unknown Ethernet interface';}
 if(m=/^ip address (\S+)$/i.exec(text)){const p=n.ports[session.interface];if(session.management||p?.name==='MGMT UPLINK'){const [ip,prefix]=m[1].split('/');return mgmt(ip,prefix,n.net.gateway||'');}return 'Use the dedicated management interface for initial IP setup. Routed data interfaces and SVIs are not emulated by this switch profile.';}
 if(lower==='no ip address dhcp'&&session.management)return change({type:'settings',node:n.id,value:{addressing:'Static'}});
 if(lower==='exit'){session.management=false;session.managementVRF=false;}
 if(lower==='vrf context management'){session.managementVRF=true;return n.id+'(config-vrf)#';}
 if(m=/^(?:management route|ip route) (\S+) (\S+)$/i.exec(text)){if(lower.startsWith('ip route')&&!session.managementVRF)return 'Use vrf context management for the OOB route';if(m[1]!=='0.0.0.0/0')return 'This training profile supports the management default route';return change({type:'settings',node:n.id,value:{gateway:m[2]}});}
 if(m=/^(?:ip name-server|ntp server) (\S+)$/i.exec(text))return change({type:'settings',node:n.id,value:{[lower.startsWith('ntp')?'ntp':'dns']:m[1]}});
 if(lower==='ip ssh server enable')return change({type:'ssh',node:n.id,enabled:true});
 if(lower==='end'){session.management=false;session.managementVRF=false;}
 return null;
}
