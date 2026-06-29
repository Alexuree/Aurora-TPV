import { describe, expect, it } from 'vitest';
import { summarizeSales } from './sales';
import type { Sale } from './types';

function sale(partial: Partial<Sale>): Sale {
  return {
    id: Math.random().toString(36),
    number: 1,
    createdAt: '2026-06-27T10:00:00.000Z',
    cashierId: 'u',
    cashierName: 'U',
    cashSessionId: 's',
    customerId: null,
    customerName: 'Cliente mostrador',
    status: 'completed',
    items: [],
    payments: [{ method: 'cash', amount: 100 }],
    subtotal: 82.64,
    taxTotal: 17.36,
    discountTotal: 0,
    total: 100,
    ...partial,
  };
}

describe('summarizeSales', () => {
  it('bruto/anulado/neto con una venta anulada', () => {
    const s = summarizeSales([
      sale({ total: 100, payments: [{ method: 'cash', amount: 100 }] }),
      sale({ total: 50, payments: [{ method: 'card', amount: 50 }] }),
      sale({ total: 30, status: 'cancelled', payments: [{ method: 'cash', amount: 30 }] }),
    ]);
    expect(s.gross).toBe(180); // 100 + 50 + 30
    expect(s.cancelled).toBe(30);
    expect(s.net).toBe(150); // bruto - anulado
    expect(s.ticketCount).toBe(2);
    expect(s.cancelledCount).toBe(1);
  });

  it('separa efectivo y tarjeta solo de ventas válidas', () => {
    const s = summarizeSales([
      sale({ total: 100, payments: [{ method: 'cash', amount: 100 }] }),
      sale({ total: 50, payments: [{ method: 'card', amount: 50 }] }),
      sale({ total: 40, status: 'cancelled', payments: [{ method: 'cash', amount: 40 }] }),
    ]);
    expect(s.byMethod.cash).toBe(100); // la anulada NO cuenta
    expect(s.byMethod.card).toBe(50);
    expect(s.avgTicket).toBe(75); // 150 / 2
  });

  it('ticket medio 0 sin ventas válidas', () => {
    const s = summarizeSales([sale({ status: 'cancelled' })]);
    expect(s.net).toBe(0);
    expect(s.avgTicket).toBe(0);
  });
});
