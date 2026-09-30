const ports=(count,speed,prefix,start=1)=>Array.from({length:count},(_,i)=>({name:prefix+(i+start),speed,medium:'Ethernet'}));
const model=(id,name,type,units,vendor,os,role,price,portLayout)=>({id,name,type,units,vendor,os,role,price,weight:units*8,category:role==='logs'||role==='siem'?'Security operations':type==='san'?'SAN':type==='switch'?'Network':type==='firewall'?'Security':type==='storage'?'Storage':type==='gpu'?'GPU':'Compute',portLayout});
export const ENTERPRISE_MODELS=[
 model('fs148f','Fortinet FortiSwitch 148F-POE','switch',1,'Fortinet','FortiSwitchOS','switch',3200,[...ports(48,1,'port'),...ports(4,10,'port',49)]),
 model('cx6200','HPE Aruba CX 6200F 48G PoE','switch',1,'HPE Aruba','AOS-CX','switch',4800,[...ports(48,1,'1/1/'),...ports(4,10,'1/1/',49)]),
 model('dl380g11','HPE ProLiant DL380 Gen11','server',2,'HPE','iLO 6 / Intelligent Provisioning','compute',10500),
 model('alletra','HPE Alletra 6000 · block array','storage',4,'HPE','Alletra array management','storage',32000),
 model('storeonce','HPE StoreOnce 3660 · backup appliance','storage',2,'HPE','StoreOnce System','storage',16000),
 model('powerscale','Dell PowerScale F600 · node','storage',1,'Dell','OneFS','storage',24000),
 model('nexus93180','Cisco Nexus 93180YC-FX3','switch',1,'Cisco','NX-OS','switch',16000,[...ports(48,25,'Ethernet1/'),...ports(6,100,'Ethernet1/',49)]),
 model('nexus9348','Cisco Nexus 9348GC-FX3','switch',1,'Cisco','NX-OS','switch',10000,[...ports(48,1,'Ethernet1/'),...ports(4,25,'Ethernet1/',49),...ports(2,100,'Ethernet1/',53)]),
 model('dells5248','Dell PowerSwitch S5248F-ON','switch',1,'Dell','SmartFabric OS10','switch',14000,[...ports(48,25,'ethernet1/1/'),...ports(4,100,'ethernet1/1/',49),...ports(2,200,'ethernet1/1/',53)]),
 model('fg200f','Fortinet FortiGate 200F','firewall',1,'Fortinet','FortiOS','firewall',18000,[...ports(24,1,'port'),...ports(4,10,'x'),{name:'ha',speed:1,medium:'Ethernet'}]),
 model('fg601f','Fortinet FortiGate 601F','firewall',1,'Fortinet','FortiOS','firewall',35000,[...ports(24,1,'port'),...ports(4,10,'x'),...ports(4,25,'x',5),{name:'ha',speed:1,medium:'Ethernet'}]),
 model('fazvm','FortiAnalyzer-VM on 1U server','server',1,'Fortinet','FortiAnalyzer','logs',9000),
 model('fsiemvm','FortiSIEM on 2U server','server',2,'Fortinet','FortiSIEM','siem',18000),
 model('r660','Dell PowerEdge R660','server',1,'Dell','iDRAC9 / Lifecycle Controller','compute',8000),
 model('r760xs','Dell PowerEdge R760xs','server',2,'Dell','iDRAC9 / Lifecycle Controller','compute',9500),
 model('xe8640','Dell PowerEdge XE8640','gpu',4,'Dell','iDRAC9 / GPU compute','gpu',45000),
 model('me5024iscsi','Dell PowerVault ME5024 · iSCSI controllers','storage',2,'Dell','PowerVault Manager','storage',22000),
 model('me5024fc','Dell PowerVault ME5024 · FC controllers','storage',2,'Dell','PowerVault Manager','storage',23000),
 model('ds6610','Dell Connectrix DS-6610B','san',1,'Dell','Fabric OS','san',9000,Array.from({length:24},(_,i)=>({name:String(i),speed:32,medium:'Fibre Channel'}))),
 model('x560','Dell ObjectScale X560 · node','storage',4,'Dell','ObjectScale','object',26000),
 model('ps500','Dell PowerStore 500T','storage',2,'Dell','PowerStore Manager','storage',30000),
 model('r760','Dell PowerEdge R760','server',2,'Dell','Linux / hypervisor','compute',11000),
 model('xe9680','Dell PowerEdge XE9680','gpu',6,'Dell','GPU workload dashboard','gpu',60000),
 model('ps3200','Dell PowerStore 3200T','storage',2,'Dell','PowerStore management','storage',45000),
 // Provider-owned customer-premises router delivered with an ISP circuit order (not sold separately).
 {...model('ispcpe','ISP fiber handoff router (provider-owned)','isp',1,'ISP','Provider managed','isp',0,[...ports(4,1,'LAN'),{name:'SFP1',speed:10,medium:'Ethernet'},{name:'FIBER-IN',speed:1,medium:'Internal'}]),category:'ISP',providerOnly:true}
];
export function enterpriseModel(n){return ENTERPRISE_MODELS.find(m=>m.id===(n.spec?.sku||n.sku))||{vendor:n.type==='firewall'?'Fortinet':'Dell',os:n.type==='firewall'?'FortiOS':['switch','san'].includes(n.type)?'SmartFabric OS10':n.type==='storage'?'Storage OS':'Linux / hypervisor',role:n.type==='firewall'?'firewall':n.type==='switch'||n.type==='san'?'switch':n.type==='storage'?'storage':n.type==='gpu'?'gpu':'compute',name:n.model};}
export function modelForSKU(sku){return ENTERPRISE_MODELS.find(m=>m.id===sku);}
