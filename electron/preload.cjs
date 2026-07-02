// Preload: expone una marca mínima + la API de impresión/cajón (window.pos).
// NUNCA se expone ipcRenderer directamente: solo funciones acotadas.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aurora', {
  desktop: true,
  platform: process.platform,
});

contextBridge.exposeInMainWorld('pos', {
  isDesktop: true,
  // Credenciales de dispositivo leídas del device.json local (no del bundle).
  getDeviceConfig: () => ipcRenderer.invoke('pos:getDeviceConfig'),
  getPrinters: () => ipcRenderer.invoke('pos:getPrinters'),
  printReceipt: (payload, cfg) => ipcRenderer.invoke('pos:printReceipt', payload, cfg),
  printTest: (cfg, store) => ipcRenderer.invoke('pos:printTest', cfg, store),
  printFullTest: (cfg, store) => ipcRenderer.invoke('pos:printFullTest', cfg, store),
  cutPaper: (cfg) => ipcRenderer.invoke('pos:cutPaper', cfg),
  openCashDrawer: (cfg) => ipcRenderer.invoke('pos:openCashDrawer', cfg),
  testCashDrawer: (cfg) => ipcRenderer.invoke('pos:testCashDrawer', cfg),
});
