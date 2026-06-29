// =====================================================================
// Lógica de cálculo del ticket. Pura y testeable.
// Convención: si taxIncluded=true, unitPrice YA contiene el IVA (PVP),
// que es lo habitual en retail español. La base imponible se obtiene
// dividiendo el bruto entre (1 + iva/100).
// =====================================================================

import type { CartLine, CartTotals, IvaRate, LineTotals, TaxBreakdownRow } from './types';
import { round2 } from './money';

/** Calcula los importes de una línea del ticket. */
export function computeLine(line: CartLine): LineTotals {
  const grossBeforeDiscount = round2(line.unitPrice * line.quantity);
  const discountFactor = 1 - clampPct(line.discountPct) / 100;
  const gross = round2(grossBeforeDiscount * discountFactor);
  const discountAmount = round2(grossBeforeDiscount - gross);

  let taxBase: number;
  let taxAmount: number;
  if (line.taxIncluded) {
    taxBase = round2(gross / (1 + line.ivaRate / 100));
    taxAmount = round2(gross - taxBase);
  } else {
    taxBase = gross;
    taxAmount = round2(gross * (line.ivaRate / 100));
  }

  return { grossBeforeDiscount, discountAmount, gross, taxBase, taxAmount };
}

/** El total cobrado por la línea (lo que se suma al total del ticket). */
export function lineChargedTotal(line: CartLine): number {
  const { gross, taxAmount, taxBase } = computeLine(line);
  // Si el IVA no está incluido, el cobro es base + IVA.
  return line.taxIncluded ? gross : round2(taxBase + taxAmount);
}

/** Calcula los totales del ticket completo, con desglose de IVA por tipo. */
export function computeTotals(lines: CartLine[]): CartTotals {
  const byRate = new Map<IvaRate, { base: number; tax: number; total: number }>();
  let subtotal = 0;
  let taxTotal = 0;
  let discountTotal = 0;
  let total = 0;
  let unitCount = 0;

  for (const line of lines) {
    const t = computeLine(line);
    const charged = line.taxIncluded ? t.gross : round2(t.taxBase + t.taxAmount);

    subtotal += t.taxBase;
    taxTotal += t.taxAmount;
    discountTotal += t.discountAmount;
    total += charged;
    unitCount += line.quantity;

    const row = byRate.get(line.ivaRate) ?? { base: 0, tax: 0, total: 0 };
    row.base += t.taxBase;
    row.tax += t.taxAmount;
    row.total += charged;
    byRate.set(line.ivaRate, row);
  }

  const taxBreakdown: TaxBreakdownRow[] = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, v]) => ({
      rate,
      base: round2(v.base),
      tax: round2(v.tax),
      total: round2(v.total),
    }));

  return {
    itemCount: lines.length,
    unitCount,
    subtotal: round2(subtotal),
    taxTotal: round2(taxTotal),
    discountTotal: round2(discountTotal),
    total: round2(total),
    taxBreakdown,
  };
}

export function clampPct(pct: number): number {
  if (Number.isNaN(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}

/** Genera un id de línea único. */
export function newLineId(): string {
  return `ln_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
