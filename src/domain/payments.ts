// =====================================================================
// Lógica de cobro: validación de pagos (incluido mixto) y cálculo de
// cambio. El cambio solo se devuelve sobre el exceso pagado en efectivo.
// =====================================================================

import type { PaymentMethod, PaymentPart } from './types';
import { round2 } from './money';

export interface PaymentSummary {
  paid: number; // total aportado
  cashPaid: number;
  changeDue: number; // cambio a devolver (solo desde efectivo)
  remaining: number; // lo que falta por cobrar (>0 si incompleto)
  isComplete: boolean;
  isMixed: boolean;
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
};

/**
 * Resume un conjunto de pagos frente al total a cobrar.
 * - El exceso solo es válido si proviene de efectivo (se devuelve como cambio).
 * - La tarjeta debe cobrarse por el importe exacto.
 */
export function summarizePayments(total: number, parts: PaymentPart[]): PaymentSummary {
  const cleaned = parts.filter((p) => p.amount > 0);
  const paid = round2(cleaned.reduce((acc, p) => acc + p.amount, 0));
  const cashPaid = round2(
    cleaned.filter((p) => p.method === 'cash').reduce((acc, p) => acc + p.amount, 0),
  );
  const nonCashPaid = round2(paid - cashPaid);

  // Lo que el efectivo debe cubrir = total - lo cubierto por tarjeta.
  const cashTarget = round2(Math.max(0, total - nonCashPaid));
  const changeDue = round2(Math.max(0, cashPaid - cashTarget));
  const remaining = round2(Math.max(0, total - paid));

  return {
    paid,
    cashPaid,
    changeDue,
    remaining,
    isComplete: paid + 1e-9 >= total,
    isMixed: new Set(cleaned.map((p) => p.method)).size > 1,
  };
}

/** Cambio a devolver dado un total y el efectivo entregado. */
export function computeChange(total: number, cashGiven: number): number {
  return round2(Math.max(0, cashGiven - total));
}

/** Importes redondos sugeridos para el botón de "entrega rápida" en efectivo. */
export function quickCashSuggestions(total: number): number[] {
  if (total <= 0) return [];
  const exact = round2(total);
  const rounded5 = Math.ceil(total / 5) * 5;
  const rounded10 = Math.ceil(total / 10) * 10;
  const rounded20 = Math.ceil(total / 20) * 20;
  const rounded50 = Math.ceil(total / 50) * 50;
  const set = new Set<number>([exact, rounded5, rounded10, rounded20, rounded50]);
  return [...set].filter((v) => v >= exact).sort((a, b) => a - b).slice(0, 5);
}
