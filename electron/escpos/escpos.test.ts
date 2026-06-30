import { describe, expect, it } from 'vitest';
// El builder ESC/POS es CommonJS (.cjs), compartido con el proceso de Electron.
import escpos from './escpos.cjs';

const { buildReceiptBytes, drawerKick, cut, padLine, separator, formatEuro, lineWidth, encodeText } = escpos as any;

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

  it('encodeText utf8 vs latin1', () => {
    expect(encodeText('A', 'utf8')[0]).toBe(0x41);
    // 'ñ' en latin1 es 0xF1
    expect(encodeText('ñ', 'cp858')[0]).toBe(0xf1);
  });
});

describe('buildReceiptBytes', () => {
  it('empieza con INIT (ESC @)', () => {
    const buf = buildReceiptBytes({ type: 'ORIGINAL', store, sale }, { paperWidth: '80', autoCut: true });
    expect(buf[0]).toBe(0x1b);
    expect(buf[1]).toBe(0x40);
    expect(Buffer.isBuffer(buf)).toBe(true);
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
    expect(text).toContain('No válido como justificante fiscal');
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
