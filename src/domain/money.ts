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

/**
 * Convierte texto a número aceptando indistintamente COMA o PUNTO como
 * separador decimal ("12,50" y "12.50" → 12.5). Si aparecen ambos, el
 * último es el decimal y el otro se trata como separador de miles
 * ("1.234,50" y "1,234.50" → 1234.5). Ignora espacios. Devuelve NaN si no
 * hay un número válido.
 */
export function parseDecimal(input: string | number | null | undefined): number {
  if (typeof input === 'number') return input;
  if (input == null) return NaN;
  let s = String(input).trim().replace(/\s/g, '');
  if (s === '') return NaN;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.') // formato es-ES: 1.234,50
      : s.replace(/,/g, ''); // formato en-US: 1,234.50
  } else if (hasComma) {
    s = s.replace(',', '.'); // coma como decimal
  }
  return parseFloat(s);
}
