// =====================================================================
// Hooks de impresión térmica y cajón (TanStack Query).
//
// Toda llamada al hardware pasa por window.pos (IPC seguro). En web/dev
// sin Electron, los hooks devuelven { ok:false, error:'No desktop' } o []
// y NO marcan estados de impresión (la venta queda 'pending' para que el
// usuario pueda imprimir manualmente desde el navegador si lo desea).
// =====================================================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repo } from '@/data';
import { useAuth } from '@/store/authStore';
import { buildReceiptPayload, isDesktopPrinting } from '@/lib/printing';
import type { PrinterConfig, Sale, Settings } from '@/domain/types';
import type { PosResult, ReceiptStorePayload } from '@/electron';

const NO_DESKTOP: PosResult = { ok: false, error: 'No desktop' };

export const pqk = {
  printerConfig: ['printerConfig'] as const,
  printers: ['printers'] as const,
  printJobs: (saleId?: string) => ['printJobs', saleId ?? 'all'] as const,
  drawerEvents: (sessionId?: string) => ['cashDrawerEvents', sessionId ?? 'all'] as const,
};

function storePayload(settings?: Settings): ReceiptStorePayload {
  if (!settings) return { name: 'Aurora TPV' };
  return {
    name: settings.storeName,
    headerText: settings.headerText || undefined,
    legalName: settings.legalName,
    taxId: settings.taxId,
    address: settings.address,
    phone: settings.phone,
    footer: settings.ticketFooter || undefined,
    legalText: settings.legalText || undefined,
  };
}

function cashAmount(sale: Sale): number {
  return sale.payments.filter((p) => p.method === 'cash').reduce((a, p) => a + p.amount, 0);
}

/* ----------------------------- Queries ----------------------------- */

export const usePrinterConfig = () => useQuery({ queryKey: pqk.printerConfig, queryFn: () => repo.getPrinterConfig() });

export const usePrinters = () =>
  useQuery({
    queryKey: pqk.printers,
    queryFn: async () => (isDesktopPrinting() ? window.pos!.getPrinters() : []),
    retry: 0,
    staleTime: 0,
    gcTime: 0,
  });

export const usePrintJobs = (saleId?: string) =>
  useQuery({ queryKey: pqk.printJobs(saleId), queryFn: () => repo.listPrintJobs(saleId) });

export const useCashDrawerEvents = (sessionId?: string) =>
  useQuery({ queryKey: pqk.drawerEvents(sessionId), queryFn: () => repo.listCashDrawerEvents(sessionId) });

/* ---------------------------- Mutations ---------------------------- */

export function useSavePrinterConfig() {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  return useMutation({
    mutationFn: (cfg: PrinterConfig) => repo.savePrinterConfig(cfg, { userId: user?.id, userName: user?.fullName }),
    onSuccess: () => qc.invalidateQueries({ queryKey: pqk.printerConfig }),
  });
}

export function useTestPrinter() {
  return useMutation({
    mutationFn: async (v: { config: PrinterConfig; settings?: Settings }) =>
      isDesktopPrinting() ? window.pos!.printTest(v.config, storePayload(v.settings)) : NO_DESKTOP,
  });
}

export function useTestFullReceipt() {
  return useMutation({
    mutationFn: async (v: { config: PrinterConfig; settings?: Settings }) =>
      isDesktopPrinting() ? window.pos!.printFullTest(v.config, storePayload(v.settings)) : NO_DESKTOP,
  });
}

export function useCutPaper() {
  return useMutation({
    mutationFn: async (config: PrinterConfig) => (isDesktopPrinting() ? window.pos!.cutPaper(config) : NO_DESKTOP),
  });
}

export function useTestCashDrawer() {
  return useMutation({
    mutationFn: async (config: PrinterConfig) => (isDesktopPrinting() ? window.pos!.testCashDrawer(config) : NO_DESKTOP),
  });
}

/** Apertura manual del cajón con motivo (queda en cajón + auditoría). */
export function useOpenCashDrawerManual() {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  return useMutation({
    mutationFn: async (v: { config: PrinterConfig; sessionId?: string | null; reason: string }) => {
      const res = isDesktopPrinting() ? await window.pos!.openCashDrawer(v.config) : NO_DESKTOP;
      // El evento + auditoría se registran SIEMPRE (aunque no haya hardware).
      await repo.recordCashDrawerEvent({
        sessionId: v.sessionId ?? null,
        userId: user?.id ?? '',
        username: user?.fullName ?? '',
        type: 'MANUAL_OPEN',
        reason: v.reason,
      });
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashDrawerEvents'] });
    },
  });
}

/**
 * Flujo de impresión + cajón tras una venta. Solo actúa en escritorio:
 * en web/dev deja la venta 'pending' para impresión manual.
 */
export function usePrintSaleFlow() {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  return useMutation({
    mutationFn: async (v: { sale: Sale; settings: Settings; config: PrinterConfig; openDrawer?: boolean }) => {
      const { sale, settings, config } = v;
      if (!isDesktopPrinting()) return { print: NO_DESKTOP, drawer: NO_DESKTOP, skipped: true };

      const payload = buildReceiptPayload(sale, settings, 'ORIGINAL');
      const print = await window.pos!.printReceipt(payload, config);
      await repo.setSalePrintStatus(sale.id, print.ok ? 'printed' : 'failed');
      await repo.recordPrintJob({
        saleId: sale.id,
        receiptNumber: sale.number,
        type: 'ORIGINAL',
        status: print.ok ? 'SUCCESS' : 'FAILED',
        errorMessage: print.ok ? undefined : print.error,
        printedBy: user?.id ?? sale.cashierId,
        copies: config.copies,
      });

      let drawer: PosResult = { ok: true };
      const hasCash = sale.payments.some((p) => p.method === 'cash');
      if (hasCash && config.openDrawerOnCashSale && v.openDrawer !== false) {
        drawer = await window.pos!.openCashDrawer(config);
        await repo.recordCashDrawerEvent({
          sessionId: sale.cashSessionId,
          userId: user?.id ?? sale.cashierId,
          username: user?.fullName ?? sale.cashierName,
          type: 'SALE_CASH',
          relatedSaleId: sale.id,
          amount: cashAmount(sale),
        });
      }
      return { print, drawer, skipped: false };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['printJobs'] });
      qc.invalidateQueries({ queryKey: ['cashDrawerEvents'] });
    },
  });
}

/** Reimpresión de una COPIA (no abre cajón). */
export function useReprintTicket() {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  return useMutation({
    mutationFn: async (v: { sale: Sale; settings: Settings; config: PrinterConfig }) => {
      const payload = buildReceiptPayload(v.sale, v.settings, 'COPY');
      const res = isDesktopPrinting() ? await window.pos!.printReceipt(payload, v.config) : NO_DESKTOP;
      await repo.recordPrintJob({
        saleId: v.sale.id,
        receiptNumber: v.sale.number,
        type: 'COPY',
        status: res.ok ? 'SUCCESS' : 'FAILED',
        errorMessage: res.ok ? undefined : res.error,
        printedBy: user?.id ?? v.sale.cashierId,
      });
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['printJobs'] });
    },
  });
}
