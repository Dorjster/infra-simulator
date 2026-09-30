import {switchCLI} from './switch-cli.js';
import {nativeCLI,applyCLIState} from './native-cli.js';
import {applyDeviceOperation,deviceRuntime,resourceUse,vmState} from './device-runtime.js';
import {controlStatus} from './access-state.js';
import {productProfile} from './product-profiles.js';
import {applyProduct,productChecks,storagePaths,wanStatus} from './product-config.js';
import {enterpriseModel} from './enterprise-models.js';
import {enterpriseState,applyEnterprise,enterpriseCLI,receiveEvent,policyTest} from './enterprise-config.js';
import { physicalOffline } from './operations.js';
import {volumeAccess,hostVolumes,arrayVolumes,diagnoseSide} from './storage-access.js';
import {serviceHealth} from './service-health.js';
import {plusCLI,plusHelp} from './cli-plus.js';
import {createLogic} from './device-logic/index.js';
import {hasPower} from './power-grid.js';
import {credentialCommand} from './admin-credentials.js';
export const networkDevice=n=>['switch','firewall','san'].includes(n.type);
export function validIPv4(s){return /^\d{1,3}(\.\d{1,3}){3}$/.test(s)&&s.split('.').every(x=>+x<=255);}
const ipNumber=s=>s.split('.').reduce((a,b)=>(a*256+Number(b))>>>0,0);
export function sameSubnet(a,b,prefix=24){const mask=prefix===0?0:(0xffffffff<<(32-prefix))>>>0;return (ipNumber(a)&mask)===(ipNumber(b)&mask);}
export function portCarries(p,vlan){const c=p.cfg;return !c||c.admin&&(c.mode==='trunk'?c.allowed.includes(vlan):c.access===vlan);}
export function createNetwork({nodes,links,byId,isOffline,refreshFaults}){
 let guard=()=>true;let onChange=()=>{};let submit=null;
 function init(){nodes.forEach((n,i)=>{if(!n.net)n.net={ip:'10.10.70.'+(i+10),prefix:24,vlan:70,ssh:true,vlans:{1:'DEFAULT',70:'MANAGEMENT'},workload:'running',load:n.type==='gpu'?80:60,os:enterpriseModel(n).os,ports:n.ports.map(p=>({admin:true,mode:'access',access:p.link?.kind==='management'||p.service?70:1,allowed:[1,70]}))};n.ports.forEach((p,i)=>{n.net.ports[i]??={admin:true,mode:'access',access:n.net.vlan,allowed:[1,n.net.vlan]};p.cfg=n.net.ports[i];});enterpriseState(n);});}
 init();
 function resolve(value){return byId[value]||nodes.find(n=>n.id.toLowerCase()===String(value).toLowerCase()||n.net.ip===value);}
 function reachable(from,to,vlan=70){if(!from||!to||!localStatus(from).ok||!localStatus(to).ok)return false;const adj=new Map();for(const l of links){if(l.unplugged)continue;for(const e of [l.a,l.b]){let x=adj.get(e);if(!x)adj.set(e,x=[]);x.push(l);}}const seen=new Set([from.id]),q=[from.id];while(q.length){const id=q.shift();if(id===to.id)return true;const n=byId[id];if(!localStatus(n).ok||!n.net.vlans[vlan])continue;if(n!==from&&!networkDevice(n))continue;for(const l of adj.get(id)||[]){if((l.disabled&&!(l.kind==='management'&&!l.fault&&!l.pa.fault&&!l.pb.fault&&localStatus(byId[l.a]).ok&&localStatus(byId[l.b]).ok))||l.unplugged||l.pa.medium!=='Ethernet'||l.pb.medium!=='Ethernet'||!portCarries(l.pa,vlan)||!portCarries(l.pb,vlan))continue;const other=l.a===id?l.b:l.b===id?l.a:null;if(other&&!seen.has(other)){seen.add(other);q.push(other);}}}return false;}
 function localStatus(n,kvm=false){return controlStatus(n,{kvm,siteDown:isOffline({...n,physical:undefined})&&n.active!==false});}
 function accessStatus(anchor,target){
  if(!anchor||!target)return {ok:false,reason:'Connect console or management Ethernet first'};
  const source=byId[anchor.node?.id],dest=byId[target.id];if(!source||!dest)return {ok:false,reason:'Device unavailable'};
  const local=['KVM','SERIAL CONSOLE','LOCAL SETUP','LOCAL DEVICE GUI'].includes(anchor.mode);
  if(local&&source.id!==dest.id)return {ok:false,reason:'Local cable controls '+source.id+' only · dock laptop for remote access'};
  const state=localStatus(dest,anchor.mode==='KVM');if(!state.ok)return state;
  if(local)return {ok:true,reason:anchor.mode==='SERIAL CONSOLE'?'CONSOLE CONNECTED · IP/VLAN not required':state.reason};
  const src=localStatus(source);if(!src.ok)return src;
  if(dest.net.ip==='0.0.0.0')return {ok:false,reason:'No management IP · use local console / setup GUI'};
  const port=source.ports.find(p=>p===anchor.port)||source.ports.find(p=>p.name===anchor.port?.name);
  if(!port?.cfg?.admin)return {ok:false,reason:'Laptop management port is disabled'};
  const vlan=port.cfg.access;
  if(dest.net.vlan!==vlan)return {ok:false,reason:'Management VLAN differs from the laptop fabric'};
  if(!sameSubnet(anchor.laptopIP??'10.10.70.250',dest.net.ip,anchor.laptopPrefix??24))return {ok:false,reason:'Laptop IP is in a different subnet'};
  if(!reachable(source,dest,vlan))return {ok:false,reason:'No management cable path · check link and VLAN on the switch'};
  return {ok:true,reason:'MANAGEMENT CONNECTED'};
 }
 function canAccess(anchor,target){return accessStatus(anchor,target).ok;}
 function apply(action){const n=byId[action.node];if(!n)return 'Unknown device';const c=n.net;
 if(['device-op','cli-state'].includes(action.type)){const result=action.type==='device-op'?applyDeviceOperation(n,action,{nodes,byId,links,localStatus,storagePaths:x=>storagePaths(x,{nodes,byId,links,reachable}),volumeAccess:(array,vol,host)=>volumeAccess(array,vol,host,{nodes,byId,links})}):applyCLIState(n,action);if(result.startsWith('Applied')){receiveEvent(n,result,nodes,reachable);refreshFaults();onChange(action);}return result;}
 if(action.type==='zoning'){if(n.type!=='san')return 'Not a Fibre Channel switch';n.net.zoneDisabled=!action.enabled;refreshFaults();onChange(action);return 'Applied · zoning '+(action.enabled?'enabled':'disabled');}
 if(action.type==='bmc'){if(!['server','gpu'].includes(n.type))return 'No iDRAC / iLO on this device';if(action.op==='clear-sel'){n.net.sel=[];onChange(action);return 'Applied · SEL cleared';}if(action.op==='power'){const p=n.physical;if(!p)return 'Factory chassis: use the front power button';if(!hasPower(n))return 'No AC input · connect a PSU cord first';const v=action.value;if(v==='on'&&!p.on){p.on=true;p.bootUntil=Date.now()+4000;}else if(v==='off'&&p.on){p.on=false;p.bootUntil=0;p.epoch=(p.epoch||0)+1;}else if(v==='cycle'){p.on=true;p.epoch=(p.epoch||0)+1;p.bootUntil=Date.now()+4000;}refreshFaults();onChange(action);return 'Applied · host power '+v;}return 'Unsupported management controller operation';}
 if(action.type==='fortios'){const r=office?office.fortiosEdit(action.op,action.store,action.value||{}):'Command fail. Return code -61 (not the office gateway)';if(String(r).startsWith('Applied')){receiveEvent(n,'CLI '+action.store+' '+action.op,nodes,reachable);refreshFaults();onChange(action);}return r;}
 if(action.type==='product'){const result=applyProduct(n,action,{nodes,byId,links,reachable});if(result.startsWith('Applied')){refreshFaults();onChange(action);}return result;}
 if(action.type==='enterprise'){if(action.op==='test'){if(enterpriseModel(n).role!=='firewall')return 'Select a firewall';const src=n.ports.find(p=>p.name===action.src),dst=n.ports.find(p=>p.name===action.dst);if(!src||!dst)return 'Select valid ingress and egress interfaces';const result=policyTest(n,action.src,action.dst),text=`${result.allowed&&src.cfg.admin&&dst.cfg.admin?'ACCEPT':'DENY'} · policy ${result.rule} · ${action.src} → ${action.dst} · NAT ${result.nat?'enabled':'disabled'} · simulated policy lookup`;receiveEvent(n,text,nodes,reachable);onChange(action);return text;}const result=applyEnterprise(n,action);if(result.startsWith('Applied')){receiveEvent(n,'Configuration '+action.op,nodes,reachable);onChange(action);}return result;}
 if(action.type==='port'){const p=n.ports[action.index];if(!p||p.medium==='Internal')return 'Port unavailable';const v=action.value;if(Number.isInteger(v.mtu)&&v.mtu>=576&&v.mtu<=9216)p.cfg.mtu=v.mtu;if(typeof v.admin==='boolean')p.cfg.admin=v.admin;if(['access','trunk'].includes(v.mode))p.cfg.mode=v.mode;if(Number.isInteger(v.access)&&v.access>0&&v.access<4095)p.cfg.access=v.access;if(Array.isArray(v.allowed)&&v.allowed.length<=128&&v.allowed.every(x=>Number.isInteger(x)&&x>0&&x<4095))p.cfg.allowed=[...new Set(v.allowed)];}
 else if(action.type==='vlan'){if(!Number.isInteger(action.id)||action.id<1||action.id>4094)return 'VLAN must be 1–4094';if(action.remove){if(action.id===1)return 'Default VLAN 1 cannot be deleted';delete c.vlans[action.id];}else c.vlans[action.id]=String(action.name||'VLAN'+action.id).slice(0,32);}
 else if(action.type==='address'){if(!validIPv4(action.ip)||!Number.isInteger(action.prefix)||action.prefix<1||action.prefix>30)return 'Use IPv4/prefix (1–30)';if(nodes.some(x=>x!==n&&x.net.ip===action.ip))return 'Duplicate management IP';if(action.vlan!==undefined&&!c.vlans[action.vlan])return 'Create the management VLAN first';c.ip=action.ip;c.prefix=action.prefix;if(action.vlan!==undefined){c.vlan=action.vlan;n.ports.filter(p=>p.service||p.name==='MGMT UPLINK'||p.alias==='mgmt0'||p.alias==='mgmt').forEach(p=>{p.cfg.access=action.vlan;p.cfg.allowed=[action.vlan];});}}
 else if(action.type==='settings'){for(const k of ['hostname','gateway','dns','ntp','addressing','volume','mapping','zone','backup','replication'])if(typeof action.value?.[k]==='string')c[k]=action.value[k].slice(0,64);if(action.value?.mtu!==undefined){const mtu=Number(action.value.mtu);if(!Number.isInteger(mtu)||mtu<576||mtu>9216)return 'MTU must be 576–9216';c.mtu=mtu;n.ports.forEach(p=>p.cfg.mtu=mtu);}}
 else if(action.type==='ssh')c.ssh=!!action.enabled;
 else if(action.type==='workload'){if(!['running','stopped'].includes(action.state))return 'Invalid workload state';c.workload=action.state;}
 else if(action.type==='load'){if(!Number.isInteger(action.value)||action.value<0||action.value>100)return 'Load must be 0–100';c.load=action.value;}
 else return 'Unsupported change';receiveEvent(n,action.type==='port'&&action.value?.admin===false?'Interface shutdown':`Configuration ${action.type}`,nodes,reachable);refreshFaults();onChange(action);return 'Applied to '+n.id;
 }
 async function change(action){if(!guard())return 'Finish the current task or put the item down · G';return submit?submit({type:'config',action}):apply(action);}
 function port(n,name){const alias=/^(?:port|ethernet|eth)\s*(\d+)$/i.exec(name);return alias?n.ports[+alias[1]-1]:n.ports.find(p=>p.name.toLowerCase()===name.toLowerCase()||p.alias?.toLowerCase()===name.toLowerCase());}
 let office=null;
 // Simple, task-focused commands (status/diagnostics) are tried first; everything else falls back to
 // the vendor-inspired CLI subsets below. "help" lists both.
 async function command(input,session){const lower=input.trim().toLowerCase();{const cred=credentialCommand(input,session,change);if(cred!==null)return cred;}if(session?.node&&(lower==='?'||lower==='help'||lower.endsWith('?'))){const own=api.logic.commands(session.node),q=lower.endsWith('?')&&lower!=='?'?lower.slice(0,-1).trim():'',mine=own.filter(c=>c.startsWith(q)),base=await command0(input,session);if(!mine.length)return base;const head=session.node.id+' · '+(api.logic.family?.(session.node)||'device')+' commands';return (q?'':(typeof base==='string'&&base&&!/^No matching/.test(base)?base+'\n\n':''))+head+':\n  '+mine.join('\n  ')+(q&&typeof base==='string'&&!/^No matching/.test(base)?'\n'+base:'');}if(session?.node&&lower!=='status'){const r=api.logic.cli(session.node,input,session);if(r!==null&&r!==undefined){if(typeof r==='object'&&r.change){const out=await change(r.change);return (r.text?r.text+'\n':'')+out;}return r;}}const out=await command0(input,session);if(session?.node&&typeof out==='string'&&/^(Unsupported command|Unknown command|Unsupported setting in this context|Use set, next or end|Use FortiOS syntax|Fabric OS command not supported|Select interface PORT-NAME first|Enter configure terminal first. Type help)/.test(out)){const v=api.logic.unknown(session.node,input);if(v)return v+'\n'+out;}return out;}
 async function command0(input,session){const ctx={nodes,byId,links,office,localStatus,wanStatus:x=>wanStatus(x,{nodes,byId,links}),vmState:(h,v)=>vmState(h,v,{byId,volumeAccess:(a,vol,host)=>volumeAccess(a,vol,host,{nodes,byId,links})}),hostVolumes:h=>hostVolumes(h,{nodes,byId,links}),arrayVolumes:x=>arrayVolumes(x,{nodes,byId,links})};const plus=plusCLI(input,session,ctx);if(plus!==null)return plus;const out=await baseCommand(input,session);return /^(help|\?)$/i.test(input.trim())&&session.node?String(out)+plusHelp(session.node,ctx):out;}
 async function baseCommand(input,session){const n=session.node,c=n.net,text=input.trim(),lower=text.toLowerCase();
 const extended=await nativeCLI(input,session,change,{nodes,byId,links,localStatus});if(extended!==null)return extended;
 const sw=await switchCLI(input,session,change);if(sw!==null)return sw;
 const native=await enterpriseCLI(input,session,change,(device,src,dst)=>change({type:'enterprise',node:device.id,op:'test',src,dst}));if(native!==null)return native;
 if(lower==='help')return 'ssh DEVICE-ID | ping DEVICE-ID\nshow system | show interfaces | show vlan | show running-config\nconfigure terminal (or conf t)\ninterface PORT-NAME (or portN)\nshutdown | no shutdown\nswitchport mode access|trunk\nswitchport access vlan 70\nswitchport trunk allowed vlan 1,70\nvlan 350 | name MANAGEMENT | no vlan 350\nip address 10.10.70.20/24\nmanagement vlan 70\nssh enable | ssh disable\nend | exit\nFirewall aliases: config system interface; edit portN; set status up|down; next; end\nShared training syntax, not a vendor CLI. Changes apply immediately.';
 if(lower==='show vlan'||lower==='show vlans')return Object.entries(c.vlans).map(([id,name])=>id.padEnd(6)+name).join('\n');
 if(lower==='show running-config')return JSON.stringify(c,null,2);
 if(['configure terminal','conf t','config system interface'].includes(lower)){if(!networkDevice(n))return 'Network CLI is available on switches, SAN switches and firewalls.';session.config=true;return n.id+'(config)#';}
 if(lower==='end'){session.config=false;session.interface=null;session.vlan=null;return n.id+'#';}
 if(lower==='exit'||lower==='next'){session.interface=null;session.vlan=null;return n.id+(session.config?'(config)#':'#');}
 if(!session.config)return 'Enter configure terminal first. Type help for supported commands.';
 if(!networkDevice(n))return 'This device uses the management dashboard.';
 let m;if(m=/^(?:interface|edit)\s+(.+)$/i.exec(text)){const p=port(n,m[1]);if(!p||p.medium==='Internal')return 'Unknown port. Use show interfaces; portN uses its displayed index.';session.interface=n.ports.indexOf(p);session.vlan=null;return n.id+'(interface '+p.name+')#';}
 if(m=/^(no )?vlan (\d+)$/i.exec(text)){session.interface=null;session.vlan=+m[2];return change({type:'vlan',node:n.id,id:+m[2],remove:!!m[1]});}
 if(m=/^name (.{1,32})$/i.exec(text)){if(session.vlan===null||session.vlan===undefined)return 'Select a VLAN first.';return change({type:'vlan',node:n.id,id:session.vlan,name:m[1]});}
 if(m=/^ip address (\S+)$/i.exec(text)){const [ip,prefix]=m[1].split('/');return change({type:'address',node:n.id,ip,prefix:Number(prefix)});}
 if(m=/^management vlan (\d+)$/i.exec(text))return change({type:'address',node:n.id,ip:c.ip,prefix:c.prefix,vlan:+m[1]});
 if(m=/^(hostname|gateway|dns|mtu|zone|volume|mapping|backup|replication) (.+)$/i.exec(text))return change({type:'settings',node:n.id,value:{[m[1].toLowerCase()]:m[2]}});
 if(m=/^ssh (enable|disable)$/i.exec(text))return change({type:'ssh',node:n.id,enabled:m[1].toLowerCase()==='enable'});
 if(session.interface===null||session.interface===undefined)return 'Select interface PORT-NAME first.';
 let value;if(['shutdown','shut','set status down'].includes(lower))value={admin:false};else if(['no shutdown','no shut','set status up'].includes(lower))value={admin:true};else if(m=/^switchport mode (access|trunk)$/.exec(lower))value={mode:m[1]};else if(m=/^(?:switchport access vlan|set vlanid) (\d+)$/.exec(lower)){if(!c.vlans[+m[1]])return 'Create that VLAN first.';value={access:+m[1]};}else if(m=/^switchport trunk allowed vlan ([\d,]+)$/.exec(lower)){const allowed=m[1].split(',').map(Number);if(allowed.some(v=>!c.vlans[v]))return 'Create each VLAN before adding it to a trunk.';value={allowed};}else return 'Unsupported command. Type help.';
 return change({type:'port',node:n.id,index:session.interface,value});
 }
 function snapshot(){return nodes.map(n=>({id:n.id,net:structuredClone(n.net)}));}
 function restore(data){for(const d of data){const n=byId[d.id];if(n){n.net=structuredClone(d.net);n.ports.forEach((p,i)=>p.cfg=n.net.ports[i]??{admin:true,mode:'access',access:70,allowed:[1,70]});}}refreshFaults();}
 function metrics(n){const online=!isOffline(n)&&!physicalOffline(n),r=deviceRuntime(n),use=resourceUse(n),running=online&&n.net.workload==='running',load=running?Math.min(100,r.hypervisor?use.running*12+5:n.net.load):0,phase=n.id.split('').reduce((a,c)=>a+c.charCodeAt(0),0),wave=running?Math.sin(Date.now()/4000+phase)*3:0;return {online,running,cpu:Math.max(0,Math.min(100,load+wave)),memory:running?Math.min(96,24+load*.6):8,iops:Math.round((n.type==='storage'?420000:18000)*load/100),latency:running?(load>90?12+(load-90)*2:0.2+load/180).toFixed(2):'0.00',throughput:(load*(n.type==='storage'?.22:.04)).toFixed(2),gpu:Math.max(0,Math.min(100,load+wave)),temperature:Math.round(online?32+load*.45:24)};}
 const api={setOffice(o){office=o;},setGuard(fn){guard=fn;},init,resolve,reachable,canAccess,accessStatus,localStatus,productChecks:n=>productChecks(n,{nodes,byId,links,reachable}),storagePaths:n=>storagePaths(n,{nodes,byId,links}),wanStatus:n=>wanStatus(n,{nodes,byId,links}),apply,change,command,metrics,vmState:(n,v)=>vmState(n,v,{byId,storagePaths:x=>storagePaths(x,{nodes,byId,links,reachable}),volumeAccess:(array,vol,host)=>volumeAccess(array,vol,host,{nodes,byId,links})}),serviceHealth:()=>serviceHealth({nodes,links,byId},(n,v)=>vmState(n,v,{byId,volumeAccess:(array,vol,host)=>volumeAccess(array,vol,host,{nodes,byId,links})})),volumeAccess:(array,vol,host)=>volumeAccess(array,vol,host,{nodes,byId,links}),hostVolumes:host=>hostVolumes(host,{nodes,byId,links}),arrayVolumes:array=>arrayVolumes(array,{nodes,byId,links}),snapshot,restore,setSubmit(fn){submit=fn;},setOnChange(fn){onChange=fn;}};
 api.logic=createLogic({nodes,links,byId,network:api});return api;
}
