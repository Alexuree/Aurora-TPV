import { describe, expect, it } from 'vitest';
import { aggregateSoldProducts, cashSalesTotal, computeExpectedCash, expectedCash, movementsTotals } from './cash';
import type { CashMovement, Sale, SaleItem } from './types';

function item(partial: Partial<SaleItem>): SaleItem {
  return {
    id: 'i', productId: 'p', name: 'Producto', quantity: 1, unitPrice: 0, discountPct: 0,
    ivaRate: 21, taxBase: 0, taxAmount: 0, lineTotal: 0, returnedQty: 0, ...partial,
  };
}

function sale(partial: Partial<Sale>): Sale {
  return {
    id: 'x',
    number: 1,
    createdAt: '2026-06-30T10:00:00.000Z',
    cashierId: 'c',
    cashierName: 'C',
    cashSessionId: 's1',
    customerId: null,
    customerName: 'Cliente mostrador',
    status: 'completed',
    items: [],
    payments: [],
    subtotal: 0,
    taxTotal: 0,
    discountTotal: 0,
    total: 0,
    ...partial,
  };
}

function mov(type: 'in' | 'out', amount: number): CashMovement {
  return { id: 'm', cashSessionId: 's1', createdAt: '', type, amount, reason: '', userId: 'u' };
}

describe('expectedCash', () => {
  it('suma fondo + ventas efectivo + entradas − salidas', () => {
    expect(expectedCash({ openingFloat: 100, cashSales: 250, cashIn: 30, cashOut: 20 })).toBe(360);
  });
  it('redondea a 2 decimales', () => {
    expect(expectedCash({ openingFloat: 0.1, cashSales: 0.2, cashIn: 0, cashOut: 0 })).toBe(0.3);
  });
});

describe('cashSalesTotal', () => {
  it('suma solo efectivo de ventas no anuladas', () => {
    const sales = [
      sale({ payments: [{ method: 'cash', amount: 50 }] }),
      sale({ payments: [{ method: 'card', amount: 40 }] }),
      sale({ payments: [{ method: 'cash', amount: 20 }, { method: 'card', amount: 10 }] }),
      sale({ status: 'cancelled', payments: [{ method: 'cash', amount: 999 }] }),
    ];
    expect(cashSalesTotal(sales)).toBe(70);
  });
});

describe('movementsTotals', () => {
  it('separa entradas y salidas', () => {
    const r = movementsTotals([mov('in', 30), mov('out', 12.5), mov('in', 5)]);
    expect(r).toEqual({ cashIn: 35, cashOut: 12.5 });
  });
});

describe('computeExpectedCash', () => {
  it('combina ventas y movimientos excluyendo anuladas', () => {
    const sales = [
      sale({ payments: [{ method: 'cash', amount: 100 }] }),
      sale({ status: 'cancelled', payments: [{ method: 'cash', amount: 100 }] }),
    ];
    const movements = [mov('in', 20), mov('out', 5)];
    // 50 (fondo) + 100 (efectivo) + 20 − 5 = 165
    expect(computeExpectedCash(50, sales, movements)).toBe(165);
  });
});

describe('aggregateSoldProducts', () => {
  it('acumula cantidad e importe por producto en ventas no anuladas', () => {
    const sales = [
      sale({ items: [item({ productId: 'foto1', name: 'Fotografía 1', quantity: 2, lineTotal: 10 })] }),
      sale({ items: [
        item({ productId: 'foto1', name: 'Fotografía 1', quantity: 1, lineTotal: 5 }),
        item({ productId: 'colonia', name: 'Colonia 50ml', quantity: 1, lineTotal: 30 }),
      ] }),
      sale({ status: 'cancelled', items: [item({ productId: 'foto1', name: 'Fotografía 1', quantity: 9, lineTotal: 999 })] }),
    ];
    const result = aggregateSoldProducts(sales);
    // Colonia (30) va antes que Fotografía 1 (15) por importe desc.
    expect(result).toEqual([
      { productId: 'colonia', name: 'Colonia 50ml', quantity: 1, total: 30 },
      { productId: 'foto1', name: 'Fotografía 1', quantity: 3, total: 15 },
    ]);
  });

  it('agrupa por nombre cuando no hay productId', () => {
    const sales = [
      sale({ items: [item({ productId: '', name: 'Suelto', quantity: 1, lineTotal: 2 })] }),
      sale({ items: [item({ productId: '', name: 'Suelto', quantity: 3, lineTotal: 6 })] }),
    ];
    expect(aggregateSoldProducts(sales)).toEqual([{ productId: '', name: 'Suelto', quantity: 4, total: 8 }]);
  });
});
