import type { FiscalMode, InvoiceType, Sale, Settings } from './types';

export const FISCAL_MODE_LABELS: Record<FiscalMode, string> = {
  no_verifactu: 'NO-VERIFACTU',
  verifactu: 'VERI*FACTU',
};

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  simplified: 'Factura simplificada',
  complete: 'Factura completa',
};

export function invoiceTypeForSale(settings: Settings, hasFiscalCustomer: boolean): InvoiceType {
  return hasFiscalCustomer ? 'complete' : settings.defaultInvoiceType;
}

export function seriesForInvoice(settings: Settings, type: InvoiceType): string {
  return type === 'complete' ? settings.completeInvoiceSeries : settings.simplifiedInvoiceSeries;
}

export function fiscalDisplayNumber(sale: Pick<Sale, 'series' | 'number' | 'fiscalNumber'>): string {
  return sale.fiscalNumber || `${sale.series || 'FS'}-${sale.number}`;
}

export function fiscalQrText(sale: Sale, settings: Settings): string {
  const params = new URLSearchParams({
    nif: settings.taxId,
    num: fiscalDisplayNumber(sale),
    fecha: sale.createdAt.slice(0, 10),
    total: sale.total.toFixed(2),
    modo: FISCAL_MODE_LABELS[sale.fiscalMode ?? settings.fiscalMode],
  });
  return `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?${params.toString()}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function fiscalHashPayload(sale: Sale): string {
  return JSON.stringify({
    number: sale.number,
    series: sale.series,
    fiscalNumber: sale.fiscalNumber,
    createdAt: sale.createdAt,
    total: sale.total,
    taxTotal: sale.taxTotal,
    cashierId: sale.cashierId,
    customerId: sale.customerId,
    previousFiscalHash: sale.previousFiscalHash ?? null,
    items: sale.items.map((i) => ({ productId: i.productId, quantity: i.quantity, total: i.lineTotal })),
    payments: sale.payments,
  });
}
