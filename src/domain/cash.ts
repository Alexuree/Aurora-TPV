// =====================================================================
// Lógica pura de caja: efectivo esperado en el cajón al cierre.
//   esperado = fondo inicial + ventas en efectivo (no anuladas)
//              + entradas manuales − salidas manuales
// El cambio devuelto ya está descontado (el pago en efectivo registrado
// es el neto cobrado).
// =====================================================================

import type { CashMovement, Sale } from './types';
import { round2 } from './money';

export interface ExpectedCashInput {
  openingFloat: number;
  cashSales: number;
  cashIn: number;
  cashOut: number;
}

export function expectedCash(input: ExpectedCashInput): number {
  return round2(input.openingFloat + input.cashSales + input.cashIn - input.cashOut);
}

/** Efectivo cobrado en ventas NO anuladas. */
export function cashSalesTotal(sales: Sale[]): number {
  return round2(
    sales
      .filter((s) => s.status !== 'cancelled')
      .reduce(
        (acc, s) => acc + s.payments.filter((p) => p.method === 'cash').reduce((a, p) => a + p.amount, 0),
        0,
      ),
  );
}

/** Suma de entradas y salidas manuales de efectivo. */
export function movementsTotals(movements: CashMovement[]): { cashIn: number; cashOut: number } {
  const cashIn = round2(movements.filter((m) => m.type === 'in').reduce((a, m) => a + m.amount, 0));
  const cashOut = round2(movements.filter((m) => m.type === 'out').reduce((a, m) => a + m.amount, 0));
  return { cashIn, cashOut };
}

/** Efectivo esperado en el cajón a partir de ventas y movimientos de la sesión. */
export function computeExpectedCash(openingFloat: number, sales: Sale[], movements: CashMovement[]): number {
  const { cashIn, cashOut } = movementsTotals(movements);
  return expectedCash({ openingFloat, cashSales: cashSalesTotal(sales), cashIn, cashOut });
}
