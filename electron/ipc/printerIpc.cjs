// =====================================================================
// Aurora TPV — Handlers IPC de impresión y cajón (proceso principal).
//
// El renderer NUNCA toca ipcRenderer directamente: usa window.pos (ver
// preload.cjs). Cada handler delega en los servicios y devuelve siempre
// { ok, error } o un valor serializable; nunca lanza al renderer.
// =====================================================================

const { ipcMain } = require('electron');
const printerService = require('../services/printerService.cjs');
const cashDrawerService = require('../services/cashDrawerService.cjs');

let registered = false;

function safe(fn) {
  return async (_event, ...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : 'Error inesperado' };
    }
  };
}

function registerIpc() {
  if (registered) return;
  registered = true;

  ipcMain.handle('pos:getPrinters', safe(async () => {
    try {
      return await printerService.getPrinters();
    } catch (_) {
      return [];
    }
  }));

  ipcMain.handle('pos:printReceipt', safe((payload, cfg) => printerService.printReceipt(payload, cfg)));
  ipcMain.handle('pos:printTest', safe((cfg, store) => printerService.testPrinter(cfg, store)));
  ipcMain.handle('pos:printFullTest', safe((cfg, store) => printerService.testFullReceipt(cfg, store)));
  ipcMain.handle('pos:cutPaper', safe((cfg) => printerService.cutPaper(cfg)));
  ipcMain.handle('pos:openCashDrawer', safe((cfg) => cashDrawerService.openCashDrawer(cfg)));
  ipcMain.handle('pos:testCashDrawer', safe((cfg) => cashDrawerService.testCashDrawer(cfg)));
}

module.exports = { registerIpc };
