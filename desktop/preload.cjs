// Narrow bridge for the game page: no Node APIs are exposed, only these three calls.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('infraDesktop', {
  isDesktop: true,
  hostLan: () => ipcRenderer.invoke('desktop:host'),
  stopHosting: () => ipcRenderer.invoke('desktop:stop-hosting'),
  info: () => ipcRenderer.invoke('desktop:info')
});
