// =====================================================================
// Utilidades monetarias. Trabajamos en euros pero redondeando siempre a
// 2 decimales con "round half away from zero" para que las sumas cuadren
// con lo que ve el cliente en el ticket.
// =====================================================================

/** Redondea a 2 decimales evitando errores de coma flotante. */
export function round2(value: number): number {
  // +Number.EPSILON corrige casos como 1.005 -> 1.00
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Redondea a n decimales. */
export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Formatea un importe como moneda (por defecto EUR, locale es-ES). */
export function formatMoney(value: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
  }).format(value ?? 0);
}

/** Suma una lista de importes redondeando el resultado. */
export function sumMoney(values: number[]): number {
  return round2(values.reduce((acc, v) => acc + v, 0));
}
