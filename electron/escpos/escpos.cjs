// =====================================================================
// Aurora TPV — Constructor de comandos ESC/POS (bytes puros).
//
// Sin dependencias nativas: se construyen los Buffer a mano. Funciona con
// cualquier impresora térmica compatible ESC/POS (la inmensa mayoría:
// Epson TM-T20/T88, Bixolon, genéricas 58/80mm, etc.).
//
// Este módulo es PURO (no hace E/S): recibe un "payload" plano serializable
// y una "config" y devuelve un Buffer listo para enviar al transporte.
// El proceso principal de Electron no conoce los tipos de TypeScript, solo
// este contrato JS plano.
//
// Contrato del payload (lo construye el renderer a partir de Sale+Settings):
//   {
//     type: 'ORIGINAL' | 'COPY' | 'TEST',
//     store: { name, logoData, headerText, legalName, taxId, address, phone, footer, legalText },
//     sale: {
//       number, fiscalNumber, createdAt (ISO), cashierName,
//       customer: { name, taxId, address, postalCode, city } | null,
//       items: [{ quantity, name, discountPct, lineTotal }],
//       taxBreakdown: [{ rate, base, tax }],
//       subtotal, discountTotal, taxTotal, total,
//       payments: [{ method, amount }],
//       cashGiven, changeGiven,
//       qrText: string | null,
//     },
//   }
// config (PrinterConfig): { paperWidth:'58'|'80', encoding, autoCut, drawerPin,
//   copies, printLogo, logoData, printQr, footerLine }
// =====================================================================

/* --------------------------- Comandos base ------------------------- */

const ESC = 0x1b;
const GS = 0x1d;

const CMD = {
  INIT: Buffer.from([ESC, 0x40]),
  LF: Buffer.from([0x0a]),
  ALIGN_LEFT: Buffer.from([ESC, 0x61, 0]),
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 1]),
  ALIGN_RIGHT: Buffer.from([ESC, 0x61, 2]),
  BOLD_ON: Buffer.from([ESC, 0x45, 1]),
  BOLD_OFF: Buffer.from([ESC, 0x45, 0]),
  SIZE_NORMAL: Buffer.from([GS, 0x21, 0x00]),
  SIZE_DOUBLE_H: Buffer.from([GS, 0x21, 0x10]),
  SIZE_DOUBLE_W: Buffer.from([GS, 0x21, 0x20]),
  SIZE_DOUBLE: Buffer.from([GS, 0x21, 0x30]),
};

/** Nº de caracteres por línea según ancho de papel. */
function lineWidth(paperWidth) {
  return String(paperWidth) === '58' ? 32 : 48;
}

/** Codifica texto a bytes. cp858/cp850 se aproximan con latin1 (sin iconv). */
function encodeText(text, encoding) {
  const value = text == null ? '' : String(text);
  if (encoding === 'utf8') return Buffer.from(value, 'utf8');
  // cp858/cp850: latin1 cubre los caracteres habituales del español (á,é,ñ,€≈).
  return Buffer.from(value, 'latin1');
}

/* ----------------------------- Helpers ----------------------------- */

/** Formatea un número como importe en euros (es-ES) de forma determinista. */
function formatEuro(value) {
  const n = Number.isFinite(value) ? value : 0;
  const fixed = Math.abs(n).toFixed(2).replace('.', ',');
  const sign = n < 0 ? '-' : '';
  // Separador de miles con punto.
  const [intPart, decPart] = fixed.split(',');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${withThousands},${decPart} €`;
}

/** Trunca/rellena para alinear etiqueta a la izquierda y valor a la derecha. */
function padLine(left, right, width) {
  const r = String(right ?? '');
  const maxLeft = Math.max(0, width - r.length - 1);
  let l = String(left ?? '');
  if (l.length > maxLeft) l = l.slice(0, maxLeft);
  const gap = Math.max(1, width - l.length - r.length);
  return l + ' '.repeat(gap) + r;
}

/** Línea separadora de guiones del ancho del papel. */
function separator(width) {
  return '-'.repeat(width);
}

/** Envuelve un texto largo en varias líneas del ancho dado. */
function wrap(text, width) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const w of words) {
    if (current.length + w.length + (current ? 1 : 0) > width) {
      if (current) lines.push(current);
      current = w.length > width ? w.slice(0, width) : w;
    } else {
      current = current ? `${current} ${w}` : w;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/* --------------------------- Comandos físicos ---------------------- */

/**
 * Pulso de apertura del cajón (RJ11 conectado a la impresora).
 * ESC p m t1 t2 — m=0 para pin 2, m=1 para pin 5.
 */
function drawerKick(pin) {
  const m = Number(pin) === 5 ? 1 : 0;
  return Buffer.from([ESC, 0x70, m, 0x19, 0x78]); // ~25ms on, ~120ms off
}

/** Corte de papel. GS V m — 0 total, 1 parcial. */
function cut(partial) {
  return Buffer.from([GS, 0x56, partial ? 1 : 0]);
}

/** Secuencia ESC/POS para imprimir un código QR (GS ( k). */
function qrBytes(text, size) {
  const data = Buffer.from(String(text ?? ''), 'utf8');
  const store = [];
  // Modelo 2
  store.push(Buffer.from([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]));
  // Tamaño del módulo
  store.push(Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size || 6]));
  // Corrección de errores (M)
  store.push(Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]));
  // Guardar datos
  const len = data.length + 3;
  store.push(Buffer.from([GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30]));
  store.push(data);
  // Imprimir
  store.push(Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]));
  return Buffer.concat(store);
}

function logoRasterBytes(dataUrl, maxWidthDots) {
  if (!dataUrl) return null;
  let nativeImage;
  try {
    nativeImage = require('electron').nativeImage;
  } catch (_) {
    return null;
  }
  const image = nativeImage.createFromDataURL(String(dataUrl));
  const size = image.getSize();
  if (!size.width || !size.height) return null;

  const targetWidth = Math.min(maxWidthDots, size.width);
  const targetHeight = Math.max(1, Math.round(size.height * (targetWidth / size.width)));
  const resized = image.resize({ width: targetWidth, height: targetHeight, quality: 'best' });
  const bitmap = resized.getBitmap();
  const width = resized.getSize().width;
  const height = resized.getSize().height;
  const bytesPerRow = Math.ceil(width / 8);
  const data = Buffer.alloc(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const b = bitmap[i] ?? 255;
      const g = bitmap[i + 1] ?? 255;
      const r = bitmap[i + 2] ?? 255;
      const a = bitmap[i + 3] ?? 255;
      const alpha = a / 255;
      const lum = ((0.299 * r + 0.587 * g + 0.114 * b) * alpha) + (255 * (1 - alpha));
      if (lum < 180) data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }

  return Buffer.concat([
    Buffer.from([GS, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff]),
    data,
    CMD.LF,
  ]);
}

/* ------------------------ Constructor del ticket ------------------- */

/**
 * Construye el ticket completo en bytes ESC/POS.
 * @param {object} payload  Datos planos del ticket (ver contrato arriba).
 * @param {object} config   PrinterConfig (paperWidth, encoding, autoCut...).
 * @returns {Buffer}
 */
function buildReceiptBytes(payload, config) {
  const cfg = config || {};
  const width = lineWidth(cfg.paperWidth);
  const enc = cfg.encoding || 'cp858';
  const chunks = [];
  const out = (buf) => chunks.push(buf);
  const line = (text) => {
    out(encodeText(text, enc));
    out(CMD.LF);
  };
  const sep = () => line(separator(width));

  const store = payload.store || {};
  const sale = payload.sale || {};
  const isCopy = payload.type === 'COPY';
  const isTest = payload.type === 'TEST';

  out(CMD.INIT);

  // --- Marca de COPIA ---
  if (isCopy) {
    out(CMD.ALIGN_CENTER);
    out(CMD.BOLD_ON);
    line('*** COPIA ***');
    out(CMD.BOLD_OFF);
  }

  // --- Cabecera de tienda ---
  out(CMD.ALIGN_CENTER);
  if (store.logoData) {
    const logo = logoRasterBytes(store.logoData, Math.min(width * 8, String(cfg.paperWidth) === '58' ? 240 : 384));
    if (logo) out(logo);
  }
  out(CMD.SIZE_DOUBLE_H);
  out(CMD.BOLD_ON);
  line(store.name || 'TICKET');
  out(CMD.BOLD_OFF);
  out(CMD.SIZE_NORMAL);
  if (store.headerText) line(store.headerText);
  if (store.legalName || store.taxId) line([store.legalName, store.taxId].filter(Boolean).join(' · '));
  if (store.address) for (const l of wrap(store.address, width)) line(l);
  if (store.phone) line(`Tel. ${store.phone}`);

  // --- Datos del ticket ---
  out(CMD.ALIGN_LEFT);
  sep();
  if (isTest) {
    out(CMD.ALIGN_CENTER);
    out(CMD.BOLD_ON);
    line('PRUEBA DE IMPRESIÓN');
    out(CMD.BOLD_OFF);
    out(CMD.ALIGN_LEFT);
    line(formatDateTime(sale.createdAt));
    finishDocument(chunks, out, cfg, width, enc, payload);
    return Buffer.concat(chunks);
  }

  line(padLine(`Ticket #${sale.number ?? ''}`, formatDateTime(sale.createdAt), width));
  if (sale.fiscalNumber) line(`Factura: ${sale.fiscalNumber}`);
  if (sale.cashierName) line(`Atendido por ${sale.cashierName}`);

  // --- Cliente (snapshot fiscal) ---
  if (sale.customer && sale.customer.name) {
    sep();
    out(CMD.BOLD_ON);
    line(sale.customer.name);
    out(CMD.BOLD_OFF);
    if (sale.customer.taxId) line(`NIF/CIF: ${sale.customer.taxId}`);
    const addr = [sale.customer.address, sale.customer.postalCode, sale.customer.city].filter(Boolean).join(' ');
    if (addr) for (const l of wrap(addr, width)) line(l);
  }

  // --- Líneas de producto ---
  sep();
  for (const it of sale.items || []) {
    const name = `${it.quantity}x ${it.name}`;
    line(padLine(name, formatEuro(it.lineTotal), width));
    if (it.discountPct > 0) line(`   dto. ${it.discountPct}%`);
  }

  // --- Totales ---
  sep();
  line(padLine('Base imponible', formatEuro(sale.subtotal), width));
  if (sale.discountTotal > 0) line(padLine('Descuentos', `-${formatEuro(sale.discountTotal)}`, width));
  line(padLine('IVA', formatEuro(sale.taxTotal), width));
  for (const r of sale.taxBreakdown || []) {
    line(padLine(`  IVA ${r.rate}% (base ${formatEuro(r.base)})`, formatEuro(r.tax), width));
  }
  out(CMD.SIZE_DOUBLE_H);
  out(CMD.BOLD_ON);
  line(padLine('TOTAL', formatEuro(sale.total), width));
  out(CMD.BOLD_OFF);
  out(CMD.SIZE_NORMAL);

  // --- Pagos ---
  sep();
  for (const p of sale.payments || []) {
    line(padLine(paymentLabel(p.method), formatEuro(p.amount), width));
  }
  if (sale.cashGiven != null && sale.cashGiven > 0) {
    line(padLine('Entregado', formatEuro(sale.cashGiven), width));
    line(padLine('Cambio', formatEuro(sale.changeGiven || 0), width));
  }

  finishDocument(chunks, out, cfg, width, enc, payload);
  return Buffer.concat(chunks);
}

/** Pie común: QR, footer, leyenda de copia, corte. */
function finishDocument(chunks, out, cfg, width, enc, payload) {
  const store = payload.store || {};
  const sale = payload.sale || {};
  const line = (text) => {
    out(encodeText(text, enc));
    out(CMD.LF);
  };

  out(CMD.ALIGN_CENTER);
  line(separator(width));
  if (store.footer) line(store.footer);
  if (cfg.printQr && sale.qrText) {
    out(CMD.LF);
    out(qrBytes(sale.qrText, 6));
  }
  if (store.legalText) for (const l of wrap(store.legalText, width)) line(l);
  if (payload.type === 'COPY') {
    out(CMD.BOLD_ON);
    line('COPIA - No válido como justificante fiscal');
    out(CMD.BOLD_OFF);
  }
  out(CMD.ALIGN_LEFT);
  // Avance para separar del corte.
  out(CMD.LF);
  out(CMD.LF);
  out(CMD.LF);
  if (cfg.autoCut !== false) out(cut(false));
}

/* ------------------------------ Misc ------------------------------- */

function paymentLabel(method) {
  return method === 'cash' ? 'Efectivo' : method === 'card' ? 'Tarjeta' : 'Pago';
}

/** Fecha/hora es-ES de forma robusta (sin depender de Intl). */
function formatDateTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Ticket de prueba sencillo (logo + cabecera + PRUEBA + corte). */
function buildTestTicket(config, store) {
  return buildReceiptBytes(
    { type: 'TEST', store: store || { name: 'Aurora TPV' }, sale: { createdAt: new Date().toISOString() } },
    config,
  );
}

/** Ticket de ejemplo completo (producto ficticio, totales, pago). */
function buildSampleReceipt(config, store) {
  return buildReceiptBytes(
    {
      type: 'ORIGINAL',
      store: store || { name: 'Aurora TPV', address: 'C/ Mayor 12, Madrid', phone: '910 000 000', footer: '¡Gracias por su compra!' },
      sale: {
        number: 9999,
        fiscalNumber: 'FS-9999',
        createdAt: new Date().toISOString(),
        cashierName: 'Prueba',
        customer: null,
        items: [
          { quantity: 1, name: 'Sauvage EDT 100ml', discountPct: 0, lineTotal: 99.9 },
          { quantity: 2, name: 'Carrete 35mm Color', discountPct: 10, lineTotal: 21.51 },
        ],
        taxBreakdown: [{ rate: 21, base: 100.34, tax: 21.07 }],
        subtotal: 100.34,
        discountTotal: 2.39,
        taxTotal: 21.07,
        total: 121.41,
        payments: [{ method: 'cash', amount: 121.41 }],
        cashGiven: 130,
        changeGiven: 8.59,
        qrText: null,
      },
    },
    config,
  );
}

module.exports = {
  ESC,
  GS,
  CMD,
  lineWidth,
  encodeText,
  formatEuro,
  padLine,
  separator,
  wrap,
  drawerKick,
  cut,
  qrBytes,
  buildReceiptBytes,
  buildTestTicket,
  buildSampleReceipt,
  formatDateTime,
};
