// Web package entry: `node lan/server.mjs` starts a LAN room on this computer (Node.js 22+).
// Environment: PORT (8080), BIND (0.0.0.0), CAMPAIGN_SAVE (lan/campaign-save.json), ROOM_CODE, HOST_KEY,
// DELIVERY_SCALE (tests only).
import os from 'node:os';
import {startRoom} from './room.mjs';
// The port taken (another room, another program): say so and how to pick another, instead of a stack trace.
const room=await startRoom({port:process.env.PORT??8080,bind:process.env.BIND||'0.0.0.0',savePath:process.env.CAMPAIGN_SAVE,roomCode:process.env.ROOM_CODE,hostKey:process.env.HOST_KEY,deliveryScale:process.env.DELIVERY_SCALE}).catch(e=>{if(e.code==='EADDRINUSE'||e.code==='EACCES'){console.error(`Port ${process.env.PORT??8080} is ${e.code==='EACCES'?'not allowed':'already in use (another room or program)'}. Start on another one, e.g.:  PORT=8081 node lan/server.mjs   (Windows PowerShell: $env:PORT=8081; node lan/server.mjs)`);process.exit(1);}throw e;});
console.log(`Infrastructure LAN · max 12 players\nRoom code: ${room.roomCode}\nPrivate host key: ${room.hostKey}\nHost: http://localhost:${room.port}`);
for(const a of room.addresses())console.log(`Friends: http://${a}  ·  with team voice: https://${a.split(':')[0]}:${room.securePort} (accept the certificate once)`);
console.log('Everyone opens a server address, selects LAN co-op and enters the room code. Ctrl+C stops the room.');
if(process.platform==='win32')console.log('Windows: when the firewall asks, allow Node.js on private networks, or friends can’t reach this computer.');
const stop=async()=>{setTimeout(()=>process.exit(0),3000).unref();await room.close();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);   // (the save written, streams closed — 3 s at most)
