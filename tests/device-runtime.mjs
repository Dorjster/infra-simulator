import assert from 'node:assert/strict';
import {createNetwork} from '../dist/network-sim.js';
import {deviceRuntime,resourceUse} from '../dist/device-runtime.js';
import {initialProduct} from '../dist/product-profiles.js';

const nodes=[],byId={},links=[];
function node(id,type,sku){const n={id,type,spec:{sku},model:sku,active:true,ports:[{name:'DATA-A',medium:'Ethernet',speed:25},{name:'DATA-B',medium:'Ethernet',speed:25}],physical:{on:true,power:['A','B']}};nodes.push(n);byId[id]=n;return n;}
const host=node('R760-01','server','server1'),array=node('ME5024-01','storage','me5024iscsi'),sw=node('TOR-01','switch','switch48');
const net=createNetwork({nodes,links,byId,isOffline:()=>false,refreshFaults:()=>{}});
const apply=(n,op,value={})=>net.apply({type:'device-op',node:n.id,op,value});
const ok=x=>assert.match(x,/^Applied/);

ok(apply(host,'os',{os:'KVM',raid:'RAID 1 boot'}));assert.equal(deviceRuntime(host).install.state,'installing');assert.match(apply(host,'portgroup',{id:'Servers',vlan:50,uplinks:'0'}),/hypervisor/,'no hypervisor until the installer finishes');deviceRuntime(host).install.until=0;assert.equal(deviceRuntime(host).os,'KVM');assert.equal(deviceRuntime(host).install.state,'completed');
ok(apply(host,'host-network',{ip:'10.10.50.10',prefix:24,vlan:50,gateway:'10.10.50.1',dns:'10.10.70.1'}));
ok(apply(host,'portgroup',{id:'Servers',vlan:50,uplinks:'0'}));
ok(apply(host,'vm',{id:'WEB-01',os:'Linux',cpu:4,memory:8,disk:100,datastore:'local',network:'Servers',ip:'10.10.50.11',prefix:24}));
assert.equal(resourceUse(host).running,0);
ok(apply(host,'vm-power',{id:'WEB-01',action:'start',on:true}));
assert.equal(net.vmState(host,deviceRuntime(host).vms['WEB-01']).ok,false,'a VM needs a live VLAN-carrying uplink');
// A connected access port makes the guest state observable.
const l={a:host.id,pa:host.ports[0],b:sw.id,pb:sw.ports[0]};host.ports[0].link=l;sw.ports[0].link=l;host.ports[0].cfg.access=50;sw.ports[0].cfg.access=50;sw.ports[0].cfg.admin=true;
assert.equal(net.vmState(host,deviceRuntime(host).vms['WEB-01']).ok,true);
ok(apply(host,'service',{vm:'WEB-01',id:'intranet',kind:'web',engine:'Nginx',port:443,content:'Hello'}));
assert.equal(deviceRuntime(host).vms['WEB-01'].services.intranet.ip,'10.10.50.11');
assert.match(apply(host,'vm',{id:'TOO-BIG',os:'Linux',cpu:999,memory:8,disk:100,datastore:'local',network:'Servers'}),/Insufficient|valid/);

assert.match(apply(array,'pool',{id:'POOL-01',sizeGiB:1000,protection:'RAID 6'}),/initial setup/);array.net.product.identity={name:'ME5-01',passwordSet:true};ok(apply(array,'pool',{id:'POOL-01',sizeGiB:1000,protection:'RAID 6'}));
ok(apply(array,'volume',{id:'VOL-01',pool:'POOL-01',sizeGiB:200,protocol:'iSCSI'}));
assert.equal(deviceRuntime(array).volumes['VOL-01'].sizeGiB,200);
assert.match(apply(array,'volume',{id:'VOL-02',pool:'POOL-01',sizeGiB:900,protocol:'iSCSI'}),/Insufficient pool capacity/);
ok(apply(array,'snapshot'));
ok(apply(array,'checkpoint'));
ok(apply(array,'delete',{table:'volumes',id:'VOL-01'}));
assert.equal(deviceRuntime(array).volumes['VOL-01'],undefined);
ok(apply(array,'restore'));
assert.equal(deviceRuntime(array).volumes['VOL-01'].sizeGiB,200);
console.log('PASS: host OS and hypervisor workflow, VLAN-backed VM state, guest service, resource limits, storage pools/volumes, snapshots and checkpoints.');
