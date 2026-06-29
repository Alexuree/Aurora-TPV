// =====================================================================
// Capa de abstracción de impresión de tickets.
//
// La app NO se acopla a una impresora concreta: define una interfaz
// `ThermalPrinterService` y, por ahora, una implementación basada en la
// impresión del navegador/Electron (fallback universal que funciona con
// cualquier impresora térmica instalada en el sistema como impresora
// normal). Queda el hueco para una futura implementación ESC/POS directa.
// =====================================================================

import type { TicketWidth } from '@/domain/types';

/** Versión de la plantilla de ticket (se guarda en cada venta). */
export const TICKET_TEMPLATE_VERSION = 1;

/** Ancho del ticket en píxeles para previsualización/impresión. */
export function ticketWidthPx(width: TicketWidth): number {
  return width === '58' ? 220 : 300;
}

export interface PrintResult {
  ok: boolean;
  error?: string;
}

export interface ThermalPrinterService {
  readonly kind: string;
  /** Imprime el contenido actualmente montado en #print-area. */
  print(): Promise<PrintResult>;
}

/**
 * Implementación por defecto: usa el cuadro de impresión del sistema.
 * El CSS @media print (en index.css) aísla #print-area, de modo que solo
 * se imprime el ticket. Compatible con impresoras térmicas instaladas como
 * impresora de Windows (58/80mm).
 */
class BrowserPrintService implements ThermalPrinterService {
  readonly kind = 'browser';
  print(): Promise<PrintResult> {
    return new Promise((resolve) => {
      try {
        const done = () => {
          window.removeEventListener('afterprint', done);
          resolve({ ok: true });
        };
        window.addEventListener('afterprint', done);
        window.print();
        // Salvaguarda: si el navegador no dispara afterprint, resolvemos igual.
        setTimeout(() => resolve({ ok: true }), 1500);
      } catch (e) {
        resolve({ ok: false, error: e instanceof Error ? e.message : 'Error de impresión' });
      }
    });
  }
}

let service: ThermalPrinterService | null = null;

/** Devuelve el servicio de impresión activo (seam para futuras impls). */
export function getPrinterService(): ThermalPrinterService {
  if (!service) service = new BrowserPrintService();
  return service;
}
