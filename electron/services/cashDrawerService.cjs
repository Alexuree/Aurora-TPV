// =====================================================================
// Aurora TPV — Servicio del cajón registrador.
//
// El cajón se conecta por RJ11 a la impresora térmica; se abre enviando
// un pulso ESC/POS (ESC p) por el MISMO transporte que los tickets.
// =====================================================================

const escpos = require('../escpos/escpos.cjs');
const printerService = require('./printerService.cjs');

/** Abre el cajón usando el pin configurado (2 o 5). */
async function openCashDrawer(cfg) {
  const pin = Number(cfg && cfg.drawerPin) === 5 ? 5 : 2;
  const bytes = escpos.drawerKick(pin);
  const res = await printerService.sendBytes(bytes, cfg || {});
  if (!res.ok && /no se ha seleccionado|impresora no encontrada/i.test(res.error || '')) {
    return { ok: false, error: 'No se pudo abrir el cajón: revisa la impresora conectada al cajón' };
  }
  return res;
}

/** Prueba de apertura del cajón (botón en ajustes). */
async function testCashDrawer(cfg) {
  return openCashDrawer(cfg);
}

module.exports = { openCashDrawer, testCashDrawer };
