// =====================================================================
// Agregados de ventas (lógica pura, testeable). Distingue ventas válidas
// de anuladas para calcular bruto / anulado / neto y los totales por
// método de pago. Lo usan los informes y el cierre de caja.
// =====================================================================

import type { PaymentMethod, Sale } from './types';
import { round2 } from './money';

export interface SalesSummary {
  gross: number; // bruto: todas las ventas emitidas (válidas + anuladas)
  cancelled: number; // total anulado
  net: number; // neto: bruto - anulado (= ventas válidas)
  byMethod: Record<PaymentMethod, number>; // cobrado por método (solo válidas)
  ticketCount: number; // tickets válidos
  cancelledCount: number;
  avgTicket: number;
  firstSaleAt?: string;
  lastSaleAt?: string;
}

const ZERO_METHODS = (): Record<PaymentMethod, number> => ({ cash: 0, card: 0 });

export function summarizeSales(sales: Sale[]): SalesSummary {
  const valid = sales.filter((s) => s.status !== 'cancelled');
  const cancelledSales = sales.filter((s) => s.status === 'cancelled');

  const grossValid = valid.reduce((a, s) => a + s.total, 0);
  const cancelled = round2(cancelledSales.reduce((a, s) => a + s.total, 0));
  const gross = round2(grossValid + cancelled);
  const net = round2(grossValid);

  const byMethod = ZERO_METHODS();
  for (const s of valid) {
    for (const p of s.payments) {
      const method = p.method === 'cash' ? 'cash' : 'card';
      byMethod[method] = round2(byMethod[method] + p.amount);
    }
  }

  const times = valid.map((s) => s.createdAt).sort();

  return {
    gross,
    cancelled,
    net,
    byMethod,
    ticketCount: valid.length,
    cancelledCount: cancelledSales.length,
    avgTicket: valid.length ? round2(net / valid.length) : 0,
    firstSaleAt: times[0],
    lastSaleAt: times[times.length - 1],
  };
}
