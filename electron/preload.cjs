// Preload: expone una marca mínima al renderer. Sin acceso a Node.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('aurora', {
  desktop: true,
  platform: process.platform,
});
