// =====================================================================
// Utilidades para el lector de código de barras (lógica pura, testeable).
// Un lector USB se comporta como teclado: teclea el código y pulsa Enter
// (a veces Tab o salto de línea). Aquí solo normalizamos y evitamos dobles
// lecturas accidentales; la captura del input vive en la pantalla de venta.
// =====================================================================

/** Limpia el código: elimina CR/LF/Tab que algunos lectores añaden y espacios. */
export function normalizeScannedCode(raw: string): string {
  return raw.replace(/[\r\n\t]+/g, '').trim();
}

/** Heurística: ¿parece un código escaneado (numérico/alfanumérico largo)?
 *  Sirve para distinguir un escaneo de una búsqueda de texto manual. */
export function looksLikeBarcode(code: string): boolean {
  const c = normalizeScannedCode(code);
  return /^[0-9A-Za-z._-]{6,}$/.test(c) && /\d/.test(c);
}

export interface ScanDeduper {
  /** Devuelve true si el código debe procesarse; false si es un rebote del lector. */
  accept(code: string): boolean;
  reset(): void;
}

/**
 * Evita dobles lecturas accidentales del hardware: rechaza el MISMO código si
 * llega dentro de `windowMs` desde la lectura anterior. Una repetición legítima
 * (el dependiente escanea el mismo producto a propósito) ocurre mucho más tarde,
 * por lo que sí se acepta.
 */
export function createScanDeduper(windowMs = 80, now: () => number = () => Date.now()): ScanDeduper {
  let lastCode = '';
  let lastTime = Number.NEGATIVE_INFINITY;
  return {
    accept(code) {
      const t = now();
      if (code === lastCode && t - lastTime < windowMs) return false;
      lastCode = code;
      lastTime = t;
      return true;
    },
    reset() {
      lastCode = '';
      lastTime = Number.NEGATIVE_INFINITY;
    },
  };
}
