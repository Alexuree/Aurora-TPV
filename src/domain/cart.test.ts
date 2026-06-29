import { describe, expect, it } from 'vitest';
import { computeLine, computeTotals, lineChargedTotal } from './cart';
import type { CartLine } from './types';

function line(partial: Partial<CartLine>): CartLine {
  return {
    lineId: 'l',
    productId: 'p',
    name: 'x',
    ivaRate: 21,
    taxIncluded: true,
    quantity: 1,
    unitPrice: 0,
    basePrice: 0,
    discountPct: 0,
    priceOverridden: false,
    ...partial,
  };
}

describe('computeLine (IVA incluido)', () => {
  it('desglosa base e IVA de 2 uds a 99,90 € (21%)', () => {
    const t = computeLine(line({ unitPrice: 99.9, quantity: 2 }));
    expect(t.gross).toBe(199.8);
    expect(t.taxBase).toBe(165.12);
    expect(t.taxAmount).toBe(34.68);
    expect(Math.round((t.taxBase + t.taxAmount) * 100) / 100).toBe(t.gross);
  });

  it('aplica descuento de línea', () => {
    const t = computeLine(line({ unitPrice: 10, quantity: 1, discountPct: 10 }));
    expect(t.gross).toBe(9);
    expect(t.discountAmount).toBe(1);
  });
});

describe('computeTotals', () => {
  it('suma con desglose por tipo de IVA y cuadra', () => {
    const totals = computeTotals([
      line({ unitPrice: 100, quantity: 1, ivaRate: 21 }),
      line({ unitPrice: 50, quantity: 2, ivaRate: 10 }),
    ]);
    expect(totals.total).toBe(200);
    expect(totals.taxBreakdown).toHaveLength(2);
    const sum = Math.round(totals.taxBreakdown.reduce((a, b) => a + b.total, 0) * 100) / 100;
    expect(sum).toBe(totals.total);
    expect(Math.round((totals.subtotal + totals.taxTotal) * 100) / 100).toBe(totals.total);
  });

  it('ticket vacío da total 0', () => {
    const totals = computeTotals([]);
    expect(totals.total).toBe(0);
    expect(totals.unitCount).toBe(0);
  });
});

describe('lineChargedTotal', () => {
  it('coincide con el bruto cuando el IVA está incluido', () => {
    const l = line({ unitPrice: 99.9, quantity: 2 });
    expect(lineChargedTotal(l)).toBe(computeLine(l).gross);
  });
});
