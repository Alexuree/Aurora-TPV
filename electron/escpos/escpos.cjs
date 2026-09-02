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
//     type: 'ORIGINAL' | 'COPY' | 'TEST' | 'GIFT',
//     store: { name, logoData, headerText, legalName, taxId, address, phone, email, footer, legalText },
//     sale: {
//       number, fiscalNumber, invoiceType, createdAt (ISO), cashierName,
//       customer: { name, taxId, address, postalCode, city, province, country, phone, email } | null,
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

// ---------------------------------------------------------------------
// Codificación de texto a la página de códigos de la impresora.
//
// CLAVE: los bytes 0x80–0xFF de CP858/CP850 NO coinciden con latin1. Hay
// que mapear cada carácter Unicode a su byte real en la tabla y, además,
// seleccionar la página de códigos en la impresora con `ESC t n` (si no,
// la impresora interpreta los bytes con su tabla por defecto, normalmente
// PC437, y salen €, tildes y ñ como basura).
//
// Tabla base = CP850 (multilingüe). CP858 = CP850 con el euro en 0xD5.
// ---------------------------------------------------------------------

/** Unicode → byte CP850 (parte alta 0x80–0xFF), sin el euro. */
const CP850 = {
  // Mayúsculas acentuadas
  'À': 0xb7, 'Á': 0xb5, 'Â': 0xb6, 'Ã': 0xc7, 'Ä': 0x8e, 'Å': 0x8f, 'Æ': 0x92, 'Ç': 0x80,
  'È': 0xd4, 'É': 0x90, 'Ê': 0xd2, 'Ë': 0xd3, 'Ì': 0xde, 'Í': 0xd6, 'Î': 0xd7, 'Ï': 0xd8,
  'Ð': 0xd1, 'Ñ': 0xa5, 'Ò': 0xe3, 'Ó': 0xe0, 'Ô': 0xe2, 'Õ': 0xe5, 'Ö': 0x99, 'Ø': 0x9d,
  'Ù': 0xeb, 'Ú': 0xe9, 'Û': 0xea, 'Ü': 0x9a, 'Ý': 0xed, 'Þ': 0xe8,
  // Minúsculas acentuadas
  'à': 0x85, 'á': 0xa0, 'â': 0x83, 'ã': 0xc6, 'ä': 0x84, 'å': 0x86, 'æ': 0x91, 'ç': 0x87,
  'è': 0x8a, 'é': 0x82, 'ê': 0x88, 'ë': 0x89, 'ì': 0x8d, 'í': 0xa1, 'î': 0x8c, 'ï': 0x8b,
  'ð': 0xd0, 'ñ': 0xa4, 'ò': 0x95, 'ó': 0xa2, 'ô': 0x93, 'õ': 0xe4, 'ö': 0x94, 'ø': 0x9b,
  'ù': 0x97, 'ú': 0xa3, 'û': 0x96, 'ü': 0x81, 'ý': 0xec, 'þ': 0xe7, 'ÿ': 0x98, 'ß': 0xe1,
  // Signos y puntuación
  '¡': 0xad, '¿': 0xa8, 'ª': 0xa6, 'º': 0xa7, '«': 0xae, '»': 0xaf, '·': 0xfa, '°': 0xf8,
  '©': 0xb8, '®': 0xa9, 'µ': 0xe6, '¬': 0xaa, '±': 0xf1, '÷': 0xf6, '×': 0x9e,
  '¢': 0xbd, '£': 0x9c, '¥': 0xbe, '¤': 0xcf,
  '½': 0xab, '¼': 0xac, '¾': 0xf3, '§': 0xf5, '¶': 0xf4, '´': 0xef, '¨': 0xf9, '¯': 0xee,
  '²': 0xfd, '³': 0xfc, '¹': 0xfb, '¦': 0xdd, '¸': 0xf7, ' ': 0xff,
};

/** CP858 = CP850 + euro en 0xD5 (página recomendada por defecto). */
const CP858 = { ...CP850, '€': 0xd5 };

/**
 * Caracteres especiales de Windows-1252 (WPC1252) en el rango 0x80–0x9F.
 * Lo importante para nosotros: el euro está en 0x80, página muy soportada
 * por las térmicas genéricas que no implementan bien PC858.
 */
const WIN1252_SPECIALS = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88,
  '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93,
  '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

/** Sustitutos ASCII para caracteres no representables (comillas, guiones…). */
const ASCII_FALLBACK = {
  '‘': "'", '’': "'", '‚': "'", '‛': "'",
  '“': '"', '”': '"', '„': '"',
  '–': '-', '—': '-', '―': '-', '−': '-',
  '…': '...', '•': '*', '™': 'TM', '℠': 'SM',
  '₧': 'Pts', '€': 'EUR', // € sin página 858 → "EUR"
};

/** Página de códigos a seleccionar en la impresora (ESC t n). */
function codePageCommand(encoding) {
  if (encoding === 'utf8') return Buffer.alloc(0);
  // 16 = WPC1252 (€ en 0x80), 2 = PC850 (sin €), 19 = PC858 (€ en 0xD5).
  const n = encoding === 'wpc1252' ? 16 : encoding === 'cp850' ? 2 : 19;
  return Buffer.from([ESC, 0x74, n]);
}

/** Quita diacríticos; devuelve byte ASCII o 0x3f ('?') si no es posible. */
function asciiFallbackByte(ch) {
  const stripped = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const c0 = stripped.charCodeAt(0);
  return stripped && c0 < 0x80 ? c0 : 0x3f;
}

/* --------------------------- Euro como gráfico --------------------- */
// Muchas térmicas genéricas no tienen € en ninguna página de códigos
// accesible (se quedan en PC850). Para que el símbolo SIEMPRE salga, se
// define como carácter de usuario (ESC &) y se imprime activando el juego
// de usuario solo alrededor del euro (ESC % 1 … ESC % 0). Ocupa una celda
// normal, así que la alineación de importes no cambia.

/** Mapa de bits del € (24 filas × 12 columnas) para fuente A 12×24. */
const EURO_GLYPH = [
  '............', '....######..', '..########..', '..##....##..',
  '.##.........', '.##.........', '.##.........', '.##.........',
  '########....', '########....', '.##.........', '.##.........',
  '######......', '######......', '.##.........', '.##.........',
  '.##.........', '.##.........', '..##....##..', '..########..',
  '....######..', '............', '............', '............',
];

const EURO_CODE = 0x7e; // se redefine '~' (nunca lo imprimimos como texto)

/** Comando ESC & que define el glifo del € en el carácter EURO_CODE. */
function buildEuroDefinition() {
  const width = 12;
  const vbytes = 3; // 24 puntos de alto = 3 bytes verticales
  const data = [];
  for (let x = 0; x < width; x++) {
    for (let b = 0; b < vbytes; b++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const row = b * 8 + bit;
        if (row < EURO_GLYPH.length && EURO_GLYPH[row][x] === '#') byte |= 0x80 >> bit;
      }
      data.push(byte);
    }
  }
  return Buffer.from([ESC, 0x26, vbytes, EURO_CODE, EURO_CODE, width, ...data]);
}

/** Secuencia para imprimir el € (activa el juego de usuario solo para él). */
const EURO_PRINT = [ESC, 0x25, 0x01, EURO_CODE, ESC, 0x25, 0x00];

/** ¿La codificación dibuja el € como gráfico (compatible con todas)? */
function usesGraphicEuro(encoding) {
  return encoding === 'cp858' || encoding === 'wpc1252';
}

/**
 * Codifica texto a bytes en la página de códigos indicada (cp858 por
 * defecto). ASCII pasa directo; los acentos/ñ se mapean a su byte real; el
 * € se dibuja (cp858/wpc1252) o se sustituye por "EUR" (cp850); comillas y
 * guiones tipográficos degradan a ASCII; lo desconocido cae a '?'.
 */
function encodeText(text, encoding) {
  const value = text == null ? '' : String(text);
  if (encoding === 'utf8') return Buffer.from(value, 'utf8');
  const graphicEuro = usesGraphicEuro(encoding);
  const win = encoding === 'wpc1252';
  const table = encoding === 'cp850' ? CP850 : CP858;
  const bytes = [];
  for (const ch of value) {
    if (graphicEuro && ch === '€') { for (const b of EURO_PRINT) bytes.push(b); continue; }
    const code = ch.codePointAt(0);
    if (code < 0x80) { bytes.push(code); continue; } // ASCII directo
    if (win) {
      const sp = WIN1252_SPECIALS[ch];
      if (sp != null) { bytes.push(sp); continue; }
      if (code <= 0xff) { bytes.push(code); continue; } // 0xA0–0xFF = latin1
      bytes.push(asciiFallbackByte(ch));
      continue;
    }
    const mapped = table[ch];
    if (mapped != null) { bytes.push(mapped); continue; }
    const fb = ASCII_FALLBACK[ch];
    if (fb != null) { for (let i = 0; i < fb.length; i++) bytes.push(fb.charCodeAt(i)); continue; }
    bytes.push(asciiFallbackByte(ch)); // último recurso
  }
  return Buffer.from(bytes);
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

/** Envuelve un texto largo en varias líneas del ancho dado (sin perder texto). */
function wrap(text, width) {
  const lines = [];
  let current = '';
  const flush = () => { if (current) { lines.push(current); current = ''; } };
  for (let w of String(text ?? '').split(/\s+/).filter(Boolean)) {
    // Parte palabras más largas que el ancho en trozos completos.
    while (w.length > width) {
      flush();
      lines.push(w.slice(0, width));
      w = w.slice(width);
    }
    if (current.length + w.length + (current ? 1 : 0) > width) {
      flush();
      current = w;
    } else {
      current = current ? `${current} ${w}` : w;
    }
  }
  flush();
  return lines.length ? lines : [''];
}

/**
 * Imprime "nombre ......... precio". Si no caben en una línea, el nombre se
 * envuelve en líneas completas (sin truncar) y el precio se alinea a la
 * derecha en la última línea, o en su propia línea si tampoco cabe ahí.
 */
function printItemLine(line, name, price, width) {
  const p = String(price ?? '');
  const n = String(name ?? '');
  if (n.length + p.length + 1 <= width) {
    line(padLine(n, p, width));
    return;
  }
  const nameLines = wrap(n, width);
  for (let i = 0; i < nameLines.length - 1; i++) line(nameLines[i]);
  const last = nameLines[nameLines.length - 1];
  if (last.length + p.length + 1 <= width) {
    line(padLine(last, p, width));
  } else {
    line(last);
    line(padLine('', p, width));
  }
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
  const isGift = payload.type === 'GIFT';
  const isCompleteInvoice = sale.invoiceType === 'complete' || Boolean(sale.customer && sale.customer.taxId);

  out(CMD.INIT);
  // Selecciona la página de códigos en la impresora (ESC t n) para que
  // interprete bien €, tildes y ñ. Debe ir DESPUÉS del INIT (ESC @ resetea).
  out(codePageCommand(enc));
  // Define el € como carácter gráfico cuando la codificación lo dibuja
  // (cp858/wpc1252): así sale aunque la impresora no tenga euro en su tabla.
  if (usesGraphicEuro(enc)) out(buildEuroDefinition());

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
  if (isCompleteInvoice && store.email) for (const l of wrap(store.email, width)) line(l);

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
  if (sale.fiscalNumber) line(`${isCompleteInvoice ? 'Factura completa' : 'Factura'}: ${sale.fiscalNumber}`);
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
    if (sale.customer.province) for (const l of wrap(sale.customer.province, width)) line(l);
    if (sale.customer.country) for (const l of wrap(sale.customer.country, width)) line(l);
    if (sale.customer.phone) line(`Tel. ${sale.customer.phone}`);
    if (sale.customer.email) for (const l of wrap(sale.customer.email, width)) line(l);
  }

  // --- Líneas de producto ---
  sep();
  if (isGift) {
    out(CMD.ALIGN_CENTER);
    out(CMD.BOLD_ON);
    line('TICKET REGALO');
    out(CMD.BOLD_OFF);
    line('Importes ocultos');
    out(CMD.ALIGN_LEFT);
    sep();
    for (const it of sale.items || []) {
      for (const l of wrap(`${it.quantity}x ${it.name}`, width)) line(l);
    }
    finishDocument(chunks, out, cfg, width, enc, payload);
    return Buffer.concat(chunks);
  }

  for (const it of sale.items || []) {
    printItemLine(line, `${it.quantity}x ${it.name}`, formatEuro(it.lineTotal), width);
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
  if (payload.type === 'GIFT') {
    line('No valido como factura');
  }
  if (payload.type !== 'GIFT' && cfg.printQr && sale.qrText) {
    out(CMD.LF);
    out(qrBytes(sale.qrText, 6));
  }
  if (payload.type !== 'GIFT' && store.legalText) for (const l of wrap(store.legalText, width)) line(l);
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

/**
 * Ticket de CIERRE de caja en ESC/POS (mismo camino que el recibo: se imprime
 * por la térmica, automático y con el ancho correcto). Cabecera de tienda +
 * datos del cierre + productos vendidos agrupados.
 * payload: { store: {...}, closing: { closedAt, openedByName, ticketCount,
 *   salesTotal, cashCollected, cardCollected, products:[{quantity,name,total}], note } }
 */
function buildClosingReport(payload, config) {
  const cfg = config || {};
  const width = lineWidth(cfg.paperWidth);
  const enc = cfg.encoding || 'cp858';
  const chunks = [];
  const out = (buf) => chunks.push(buf);
  const line = (text) => { out(encodeText(text, enc)); out(CMD.LF); };
  const sep = () => line(separator(width));

  const store = payload.store || {};
  const c = payload.closing || {};

  out(CMD.INIT);
  out(codePageCommand(enc));
  if (usesGraphicEuro(enc)) out(buildEuroDefinition());

  // --- Cabecera de tienda (logo + datos), como en un ticket normal ---
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

  // --- Título del cierre ---
  out(CMD.ALIGN_LEFT);
  sep();
  out(CMD.ALIGN_CENTER);
  out(CMD.BOLD_ON);
  line('RESUMEN DE CIERRE');
  out(CMD.BOLD_OFF);
  line(formatDateTime(c.closedAt));
  out(CMD.ALIGN_LEFT);
  sep();

  if (c.openedByName) line(padLine('Abierta por', c.openedByName, width));
  if (c.ticketCount != null) line(padLine('Tickets', String(c.ticketCount), width));
  line(padLine('Ventas netas', formatEuro(c.salesTotal), width));
  line(padLine('Efectivo', formatEuro(c.cashCollected), width));
  line(padLine('Tarjeta', formatEuro(c.cardCollected), width));

  const products = c.products || [];
  if (products.length) {
    sep();
    out(CMD.BOLD_ON);
    line('PRODUCTOS VENDIDOS');
    out(CMD.BOLD_OFF);
    for (const p of products) {
      printItemLine(line, `${p.quantity}x ${p.name}`, formatEuro(p.total), width);
    }
    out(CMD.BOLD_ON);
    line(padLine('Total productos', formatEuro(c.salesTotal), width));
    out(CMD.BOLD_OFF);
  }

  if (c.note) { sep(); for (const l of wrap(`Obs.: ${c.note}`, width)) line(l); }

  out(CMD.ALIGN_LEFT);
  out(CMD.LF);
  out(CMD.LF);
  out(CMD.LF);
  if (cfg.autoCut !== false) out(cut(false));
  return Buffer.concat(chunks);
}

module.exports = {
  ESC,
  GS,
  CMD,
  lineWidth,
  encodeText,
  codePageCommand,
  usesGraphicEuro,
  buildEuroDefinition,
  EURO_PRINT,
  EURO_CODE,
  CP850,
  CP858,
  formatEuro,
  padLine,
  separator,
  wrap,
  printItemLine,
  drawerKick,
  cut,
  qrBytes,
  buildReceiptBytes,
  buildClosingReport,
  buildTestTicket,
  buildSampleReceipt,
  formatDateTime,
};
