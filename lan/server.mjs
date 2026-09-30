// Web package entry: `node lan/server.mjs` starts a LAN room on this computer (Node.js 22+).
// Environment: PORT (8080), BIND (0.0.0.0), CAMPAIGN_SAVE (lan/campaign-save.json), ROOM_CODE, HOST_KEY,
// DELIVERY_SCALE (tests only).
import os from 'node:os';
import {startRoom} from './room.mjs';
const room=await startRoom({port:process.env.PORT??8080,bind:process.env.BIND||'0.0.0.0',savePath:process.env.CAMPAIGN_SAVE,roomCode:process.env.ROOM_CODE,hostKey:process.env.HOST_KEY,deliveryScale:process.env.DELIVERY_SCALE});
console.log(`Infrastructure LAN · max 12 players\nRoom code: ${room.roomCode}\nPrivate host key: ${room.hostKey}\nHost: http://localhost:${room.port}`);
for(const a of room.addresses())console.log(`Friends: http://${a}`);
console.log('Everyone opens a server address, selects LAN co-op and enters the room code. Ctrl+C stops the room.');
process.on('SIGINT',async()=>{await room.close();process.exit(0);});
