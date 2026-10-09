// Narrow bridge for the game page: no Node APIs are exposed, only these calls.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('infraDesktop', {
  isDesktop: true,
  hostLan: opts => ipcRenderer.invoke('desktop:host', opts || {}),
  discover: () => ipcRenderer.invoke('desktop:discover'),
  stopHosting: () => ipcRenderer.invoke('desktop:stop-hosting'),
  inMatch: on => ipcRenderer.invoke('desktop:in-match', !!on),
  info: () => ipcRenderer.invoke('desktop:info')
});
