// =====================================================================
// Capa de abstracción de impresión de tickets.
//
// La app NO se acopla a una impresora concreta: define una interfaz
// `ThermalPrinterService` y, por ahora, una implementación basada en la
// impresión del navegador/Electron (fallback universal que funciona con
// cualquier impresora térmica instalada en el sistema como impresora
// normal). Queda el hueco para una futura implementación ESC/POS directa.
// =====================================================================

import type { IvaRate, PrinterConfig, Sale, Settings, TicketWidth } from '@/domain/types';
import type { ReceiptPayload, ReceiptTaxRow } from '@/electron';
import { round2 } from '@/domain/money';
import { fiscalQrText } from '@/domain/fiscal';

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

/** Devuelve el servicio de impresión por navegador (fallback DOM #print-area). */
export function getPrinterService(): ThermalPrinterService {
  if (!service) service = new BrowserPrintService();
  return service;
}

/* ------------------- Impresión térmica ESC/POS (IPC) --------------- */

/** ¿Estamos en la app de escritorio con impresión ESC/POS disponible? */
export function isDesktopPrinting(): boolean {
  return typeof window !== 'undefined' && Boolean(window.pos?.isDesktop);
}

/** Desglose de IVA agrupado por tipo, listo para el ticket. */
export function buildTaxBreakdown(sale: Sale): ReceiptTaxRow[] {
  const map = new Map<IvaRate, { base: number; tax: number }>();
  for (const it of sale.items) {
    const row = map.get(it.ivaRate) ?? { base: 0, tax: 0 };
    row.base = round2(row.base + it.taxBase);
    row.tax = round2(row.tax + it.taxAmount);
    map.set(it.ivaRate, row);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([rate, v]) => ({ rate, base: v.base, tax: v.tax }));
}

/**
 * Construye el payload plano del ticket a partir de la venta y los ajustes.
 * El proceso principal de Electron lo convierte en bytes ESC/POS.
 */
export function buildReceiptPayload(
  sale: Sale,
  settings: Settings,
  type: 'ORIGINAL' | 'COPY' | 'TEST' = 'ORIGINAL',
): ReceiptPayload {
  const qrText = settings.enableFiscalQr && sale.fiscalHash ? fiscalQrText(sale, settings) : null;
  const snap = sale.customerSnapshot;
  return {
    type,
    store: {
      name: settings.storeName,
      headerText: settings.headerText || undefined,
      legalName: settings.legalName,
      taxId: settings.taxId,
      address: settings.address,
      phone: settings.phone,
      footer: settings.ticketFooter || undefined,
      legalText: settings.legalText || undefined,
    },
    sale: {
      number: sale.number,
      fiscalNumber: sale.fiscalNumber,
      createdAt: sale.createdAt,
      cashierName: sale.cashierName,
      customer: snap
        ? { name: snap.name, taxId: snap.taxId, address: snap.address, postalCode: snap.postalCode, city: snap.city }
        : null,
      items: sale.items.map((it) => ({ quantity: it.quantity, name: it.name, discountPct: it.discountPct, lineTotal: it.lineTotal })),
      taxBreakdown: settings.showTaxBreakdown ? buildTaxBreakdown(sale) : [],
      subtotal: sale.subtotal,
      discountTotal: sale.discountTotal,
      taxTotal: sale.taxTotal,
      total: sale.total,
      payments: sale.payments.map((p) => ({ method: p.method, amount: p.amount })),
      cashGiven: sale.cashGiven,
      changeGiven: sale.changeGiven,
      qrText,
    },
  };
}

/**
 * Imprime un ticket por la impresora térmica (ESC/POS vía IPC). En web/dev
 * sin Electron devuelve { ok:false, error:'No desktop' }; la prioridad es
 * SIEMPRE ESC/POS y el navegador queda solo como recurso manual.
 */
export async function printTicket(payload: ReceiptPayload, config: PrinterConfig): Promise<PrintResult> {
  if (isDesktopPrinting()) return window.pos!.printReceipt(payload, config);
  return { ok: false, error: 'No desktop' };
}
