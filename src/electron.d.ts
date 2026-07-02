// =====================================================================
// Tipos de la API de escritorio expuesta por Electron (preload.cjs).
// El renderer accede a la impresión térmica y al cajón SOLO a través de
// window.pos (IPC seguro). En web/dev sin Electron, window.pos es undefined.
// =====================================================================

import type { PrinterConfig } from '@/domain/types';

/* ------------------ Contrato del payload del ticket ---------------- */
// El renderer construye este objeto plano a partir de Sale + Settings y lo
// pasa al proceso principal, que no conoce los tipos de dominio.

export interface ReceiptStorePayload {
  name: string;
  logoData?: string;
  headerText?: string;
  legalName?: string;
  taxId?: string;
  address?: string;
  phone?: string;
  footer?: string;
  legalText?: string;
}

export interface ReceiptCustomerPayload {
  name: string;
  taxId?: string;
  address?: string;
  postalCode?: string;
  city?: string;
}

export interface ReceiptItemPayload {
  quantity: number;
  name: string;
  discountPct: number;
  lineTotal: number;
}

export interface ReceiptTaxRow {
  rate: number;
  base: number;
  tax: number;
}

export interface ReceiptSalePayload {
  number?: number;
  fiscalNumber?: string;
  createdAt: string;
  cashierName?: string;
  customer?: ReceiptCustomerPayload | null;
  items: ReceiptItemPayload[];
  taxBreakdown: ReceiptTaxRow[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  payments: { method: string; amount: number }[];
  cashGiven?: number;
  changeGiven?: number;
  qrText?: string | null;
}

export interface ReceiptPayload {
  type: 'ORIGINAL' | 'COPY' | 'TEST';
  store: ReceiptStorePayload;
  sale: ReceiptSalePayload;
}

/* --------------------------- API de window.pos --------------------- */

export interface PosResult {
  ok: boolean;
  error?: string;
}

export interface PosPrinterInfo {
  name: string;
  port: string;
  type: string;
}

export interface PosDeviceConfig {
  email: string;
  password: string;
  defaultOperator: string;
  path?: string;
}

export interface PosApi {
  readonly isDesktop: true;
  getDeviceConfig?(): Promise<PosDeviceConfig>;
  getPrinters(): Promise<PosPrinterInfo[]>;
  printReceipt(payload: ReceiptPayload, cfg: PrinterConfig): Promise<PosResult>;
  printTest(cfg: PrinterConfig, store?: ReceiptStorePayload): Promise<PosResult>;
  printFullTest(cfg: PrinterConfig, store?: ReceiptStorePayload): Promise<PosResult>;
  cutPaper(cfg: PrinterConfig): Promise<PosResult>;
  openCashDrawer(cfg: PrinterConfig): Promise<PosResult>;
  testCashDrawer(cfg: PrinterConfig): Promise<PosResult>;
}

declare global {
  interface Window {
    aurora?: { desktop: boolean; platform: string };
    pos?: PosApi;
  }
}

export {};
