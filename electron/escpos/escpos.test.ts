import { describe, expect, it } from 'vitest';
// El builder ESC/POS es CommonJS (.cjs), compartido con el proceso de Electron.
import escpos from './escpos.cjs';

const {
  buildReceiptBytes, drawerKick, cut, padLine, separator, formatEuro, lineWidth, encodeText,
  codePageCommand, buildEuroDefinition, usesGraphicEuro,
} = escpos as any;

const store = { name: 'Aurora', address: 'C/ Mayor 12', phone: '910', footer: 'Gracias' };
const sale = {
  number: 1042,
  fiscalNumber: 'FS-1042',
  createdAt: '2026-06-30T10:00:00.000Z',
  cashierName: 'María',
  customer: null,
  items: [{ quantity: 1, name: 'Sauvage EDT 100ml', discountPct: 0, lineTotal: 99.9 }],
  taxBreakdown: [{ rate: 21, base: 82.56, tax: 17.34 }],
  subtotal: 82.56,
  discountTotal: 0,
  taxTotal: 17.34,
  total: 99.9,
  payments: [{ method: 'cash', amount: 99.9 }],
  cashGiven: 100,
  changeGiven: 0.1,
  qrText: null,
};

function indexOfSeq(buf: Buffer, seq: number[]): number {
  return buf.indexOf(Buffer.from(seq));
}

describe('escpos low-level', () => {
  it('drawerKick usa pin 2 (m=0) y pin 5 (m=1)', () => {
    expect([...drawerKick(2)]).toEqual([0x1b, 0x70, 0, 0x19, 0x78]);
    expect([...drawerKick(5)]).toEqual([0x1b, 0x70, 1, 0x19, 0x78]);
  });

  it('cut total vs parcial', () => {
    expect([...cut(false)]).toEqual([0x1d, 0x56, 0]);
    expect([...cut(true)]).toEqual([0x1d, 0x56, 1]);
  });

  it('lineWidth: 32 para 58mm, 48 para 80mm', () => {
    expect(lineWidth('58')).toBe(32);
    expect(lineWidth('80')).toBe(48);
  });

  it('padLine alinea a izquierda/derecha en el ancho dado', () => {
    const l = padLine('TOTAL', '99,90 €', 20);
    expect(l).toHaveLength(20);
    expect(l.startsWith('TOTAL')).toBe(true);
    expect(l.endsWith('99,90 €')).toBe(true);
  });

  it('padLine trunca la etiqueta si no cabe', () => {
    const l = padLine('NombreMuyLargoDeProducto', '9,99 €', 16);
    expect(l).toHaveLength(16);
    expect(l.endsWith('9,99 €')).toBe(true);
  });

  it('separator tiene el ancho del papel', () => {
    expect(separator(32)).toHaveLength(32);
    expect(separator(48)).toHaveLength(48);
  });

  it('formatEuro formato es-ES', () => {
    expect(formatEuro(99.9)).toBe('99,90 €');
    expect(formatEuro(1234.5)).toBe('1.234,50 €');
    expect(formatEuro(0)).toBe('0,00 €');
    expect(formatEuro(-5)).toBe('-5,00 €');
  });

  it('encodeText mapea a CP858 (no latin1)', () => {
    expect(encodeText('A', 'utf8')[0]).toBe(0x41);
    // ASCII pasa directo en cp858
    expect(encodeText('A', 'cp858')[0]).toBe(0x41);
    // Caracteres del español en su byte real CP858/CP850
    expect(encodeText('ñ', 'cp858')[0]).toBe(0xa4);
    expect(encodeText('Ñ', 'cp858')[0]).toBe(0xa5);
    expect(encodeText('á', 'cp858')[0]).toBe(0xa0);
    expect(encodeText('é', 'cp858')[0]).toBe(0x82);
    expect(encodeText('ü', 'cp858')[0]).toBe(0x81);
    expect(encodeText('¿', 'cp858')[0]).toBe(0xa8);
    expect(encodeText('·', 'cp858')[0]).toBe(0xfa);
  });

  it('encodeText: € se dibuja como gráfico en cp858/wpc1252, "EUR" en cp850', () => {
    // cp858/wpc1252: ESC % 1 + carácter de usuario (0x7E) + ESC % 0.
    const euroSeq = [0x1b, 0x25, 0x01, 0x7e, 0x1b, 0x25, 0x00];
    expect([...encodeText('€', 'cp858')]).toEqual(euroSeq);
    expect([...encodeText('€', 'wpc1252')]).toEqual(euroSeq);
    // cp850 no dibuja: imprime "EUR" como texto.
    expect([...encodeText('€', 'cp850')]).toEqual([0x45, 0x55, 0x52]);
  });

  it('encodeText WPC1252: acentos en bytes latin1', () => {
    expect(encodeText('á', 'wpc1252')[0]).toBe(0xe1);
    expect(encodeText('ñ', 'wpc1252')[0]).toBe(0xf1);
    expect(encodeText('Ñ', 'wpc1252')[0]).toBe(0xd1);
    expect(encodeText('ü', 'wpc1252')[0]).toBe(0xfc);
    expect(encodeText('A', 'wpc1252')[0]).toBe(0x41); // ASCII directo
  });

  it('encodeText degrada comillas/guiones tipográficos a ASCII', () => {
    expect([...encodeText('“a”', 'cp858')]).toEqual([0x22, 0x61, 0x22]);
    expect(encodeText('–', 'cp858')[0]).toBe(0x2d); // guion largo → '-'
    // Carácter desconocido sin equivalente → '?'
    expect(encodeText('☃', 'cp858')[0]).toBe(0x3f);
  });

  it('codePageCommand: 19 (PC858), 16 (WPC1252), 2 (PC850)', () => {
    expect([...codePageCommand('cp858')]).toEqual([0x1b, 0x74, 19]);
    expect([...codePageCommand('wpc1252')]).toEqual([0x1b, 0x74, 16]);
    expect([...codePageCommand('cp850')]).toEqual([0x1b, 0x74, 2]);
    expect([...codePageCommand('utf8')]).toEqual([]); // utf8 no usa página de códigos
  });

  it('buildEuroDefinition: ESC & 3 0x7E 0x7E 12 + 36 bytes de datos', () => {
    const def = buildEuroDefinition();
    expect([def[0], def[1], def[2], def[3], def[4], def[5]]).toEqual([0x1b, 0x26, 3, 0x7e, 0x7e, 12]);
    expect(def.length).toBe(6 + 12 * 3); // cabecera + 12 columnas × 3 bytes
  });

  it('usesGraphicEuro solo en cp858/wpc1252', () => {
    expect(usesGraphicEuro('cp858')).toBe(true);
    expect(usesGraphicEuro('wpc1252')).toBe(true);
    expect(usesGraphicEuro('cp850')).toBe(false);
    expect(usesGraphicEuro('utf8')).toBe(false);
  });
});

describe('buildReceiptBytes', () => {
  it('empieza con INIT (ESC @) y selecciona página de códigos PC858', () => {
    const buf = buildReceiptBytes({ type: 'ORIGINAL', store, sale }, { paperWidth: '80', autoCut: true });
    expect(buf[0]).toBe(0x1b);
    expect(buf[1]).toBe(0x40);
    // Justo tras el INIT debe ir ESC t 19 (PC858) para € y tildes.
    expect([buf[2], buf[3], buf[4]]).toEqual([0x1b, 0x74, 19]);
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('define el € como carácter gráfico (ESC &) y lo imprime (ESC % 1)', () => {
    const buf = buildReceiptBytes({ type: 'ORIGINAL', store, sale }, { paperWidth: '80', autoCut: true });
    // ESC & (0x1b,0x26) define el glifo del euro tras el INIT.
    expect(indexOfSeq(buf, [0x1b, 0x26])).toBeGreaterThan(-1);
    // El total contiene el € → se imprime con ESC % 1 + 0x7E.
    expect(indexOfSeq(buf, [0x1b, 0x25, 0x01, 0x7e])).toBeGreaterThan(-1);
  });

  it('no trunca nombres largos en 58mm: los envuelve íntegros', () => {
    const longSale = {
      ...sale,
      items: [{ quantity: 1, name: 'Colonia estandar 50 ml', discountPct: 0, lineTotal: 12.5 }],
    };
    const buf = buildReceiptBytes({ type: 'ORIGINAL', store, sale: longSale }, { paperWidth: '58', autoCut: true });
    const text = buf.toString('latin1');
    // El nombre completo aparece (antes se perdía la última "l" de "ml").
    expect(text).toContain('Colonia estandar 50 ml');
    expect(text).toContain('12,50'); // y el precio sigue imprimiéndose
  });

  it('incluye corte cuando autoCut es true', () => {
    const buf = buildReceiptBytes({ type: 'ORIGINAL', store, sale }, { paperWidth: '80', autoCut: true });
    expect(indexOfSeq(buf, [0x1d, 0x56, 0])).toBeGreaterThan(-1);
  });

  it('NO incluye corte cuando autoCut es false', () => {
    const buf = buildReceiptBytes({ type: 'ORIGINAL', store, sale }, { paperWidth: '80', autoCut: false });
    expect(indexOfSeq(buf, [0x1d, 0x56, 0])).toBe(-1);
  });

  it('contiene el texto del total y del nombre de tienda', () => {
    const buf = buildReceiptBytes({ type: 'ORIGINAL', store, sale }, { paperWidth: '80', autoCut: true });
    const text = buf.toString('latin1');
    expect(text).toContain('Aurora');
    expect(text).toContain('TOTAL');
    expect(text).toContain('99,90');
  });

  it('un ticket COPY marca la copia', () => {
    const buf = buildReceiptBytes({ type: 'COPY', store, sale }, { paperWidth: '80', autoCut: true });
    const text = buf.toString('latin1');
    expect(text).toContain('COPIA');
    // 'válido' lleva tilde (byte CP858), así que comprobamos la parte ASCII.
    expect(text).toContain('justificante fiscal');
  });

  it('imprime QR solo si printQr y qrText', () => {
    const withQr = buildReceiptBytes(
      { type: 'ORIGINAL', store, sale: { ...sale, qrText: 'https://x' } },
      { paperWidth: '80', autoCut: true, printQr: true },
    );
    // GS ( k aparece para el QR
    expect(indexOfSeq(withQr, [0x1d, 0x28, 0x6b])).toBeGreaterThan(-1);
    const noQr = buildReceiptBytes({ type: 'ORIGINAL', store, sale }, { paperWidth: '80', autoCut: true, printQr: true });
    expect(indexOfSeq(noQr, [0x1d, 0x28, 0x6b])).toBe(-1);
  });
});
