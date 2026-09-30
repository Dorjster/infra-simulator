// Stable logical port names preserve saved cables; display labels identify the hardware.
export function managementLayout(n){
 const front=n.type==='firewall';
 const server=['server','gpu'].includes(n.type);
 const hpe=/HPE|ProLiant/i.test(n.model||'');
 return {side:front?'front':'rear',x:front?1.05:.58,y:0,
  label:server?(hpe?'iLO · MGMT':'iDRAC · MGMT'):front?'MGMT':'MGMT UPLINK'};
}
