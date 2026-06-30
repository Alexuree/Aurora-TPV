import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssignSaleCustomerInput, ProcessSaleInput } from '@/data/repository';
import type { Sale, SaleItem } from '@/domain/types';
import { uid } from '@/lib/uid';

const KEY = 'aurora-tpv:pending-sync';
let syncInFlight: Promise<void> | null = null;

type PendingOperation = {
  id: string;
  type: 'process_sale';
  createdAt: string;
  attempts: number;
  lastError?: string;
  payload: ProcessSaleInput;
  localSale: Sale;
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readQueue(): PendingOperation[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingOperation[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingOperation[]): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(KEY, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent('aurora-pending-sync-changed'));
}

export function isConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /failed to fetch|networkerror|network request failed|load failed|fetch|offline/i.test(message);
}

export function listPendingSales(): Sale[] {
  return readQueue().map((op) => op.localSale);
}

export function getPendingSale(id: string): Sale | null {
  return readQueue().find((op) => op.localSale.id === id)?.localSale ?? null;
}

export function enqueuePendingSale(payload: ProcessSaleInput, cause: unknown): Sale {
  const localSale = createTemporarySale(payload);
  const queue = readQueue();
  queue.push({
    id: uid(),
    type: 'process_sale',
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: cause instanceof Error ? cause.message : String(cause ?? 'Sin conexion'),
    payload,
    localSale,
  });
  writeQueue(queue);
  return localSale;
}

export function updatePendingPrintStatus(saleId: string, status: Sale['printStatus']): boolean {
  const queue = readQueue();
  const op = queue.find((item) => item.localSale.id === saleId);
  if (!op) return false;
  op.localSale.printStatus = status;
  writeQueue(queue);
  return true;
}

export function assignPendingSaleCustomer(input: AssignSaleCustomerInput): Sale | null {
  const queue = readQueue();
  const op = queue.find((item) => item.localSale.id === input.saleId);
  if (!op) return null;

  op.payload = {
    ...op.payload,
    customerId: input.customerId,
    customerName: input.customerName,
    customerSnapshot: input.customerSnapshot ?? null,
  };
  op.localSale = {
    ...op.localSale,
    customerId: input.customerId,
    customerName: input.customerName,
    customerSnapshot: input.customerSnapshot ?? null,
    invoiceType: input.customerSnapshot?.taxId ? 'complete' : 'simplified',
    series: input.customerSnapshot?.taxId ? 'FC' : 'FS',
  };
  writeQueue(queue);
  return op.localSale;
}

export async function syncPendingOperations(sb: SupabaseClient): Promise<void> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = doSyncPendingOperations(sb).finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

async function doSyncPendingOperations(sb: SupabaseClient): Promise<void> {
  const queue = readQueue();
  if (queue.length === 0) return;

  const remaining: PendingOperation[] = [];
  for (const op of queue) {
    try {
      const { error } = await sb.rpc('process_sale', { payload: op.payload });
      if (error) throw new Error(error.message);
    } catch (error) {
      remaining.push({
        ...op,
        attempts: op.attempts + 1,
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
  }
  writeQueue(remaining);
}

function createTemporarySale(input: ProcessSaleInput): Sale {
  const now = new Date().toISOString();
  const number = Number(now.replace(/\D/g, '').slice(-10));
  const items: SaleItem[] = input.lines.map((line) => ({
    id: uid(),
    productId: line.productId,
    name: line.name,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountPct: line.discountPct,
    ivaRate: line.ivaRate as SaleItem['ivaRate'],
    taxBase: line.taxBase,
    taxAmount: line.taxAmount,
    lineTotal: line.lineTotal,
    returnedQty: 0,
  }));

  return {
    id: `pending-${uid()}`,
    number,
    createdAt: now,
    cashierId: input.cashierId,
    cashierName: input.cashierName,
    cashSessionId: input.cashSessionId,
    customerId: input.customerId,
    customerName: input.customerName,
    customerSnapshot: input.customerSnapshot ?? null,
    status: 'completed',
    items,
    payments: input.payments,
    subtotal: input.subtotal,
    taxTotal: input.taxTotal,
    discountTotal: input.discountTotal,
    total: input.total,
    cashGiven: input.cashGiven,
    changeGiven: input.changeGiven,
    note: input.note,
    printStatus: 'pending',
    ticketTemplateVersion: 1,
    invoiceType: input.customerSnapshot?.taxId ? 'complete' : 'simplified',
    series: 'PEND',
    fiscalNumber: `PEND-${number}`,
    fiscalMode: 'no_verifactu',
    syncStatus: 'pending',
  };
}
