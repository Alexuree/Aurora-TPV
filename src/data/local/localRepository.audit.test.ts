import { beforeEach, describe, expect, it } from 'vitest';
import { LocalRepository } from './localRepository';

// localStorage en memoria para poder probar el repositorio local en Node.
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = new MemStorage() as unknown as Storage;
});

describe('LocalRepository — auditoría de impresión y cajón', () => {
  it('recordPrintJob COPY audita una reimpresión', async () => {
    const repo = new LocalRepository();
    await repo.recordPrintJob({ saleId: 's1', receiptNumber: 1, type: 'COPY', status: 'SUCCESS', printedBy: 'u1' });
    const events = await repo.listAuditEvents();
    expect(events.some((e) => e.type === 'reprint')).toBe(true);
    expect((await repo.listPrintJobs('s1')).length).toBe(1);
  });

  it('recordPrintJob ORIGINAL fallida audita print_failed', async () => {
    const repo = new LocalRepository();
    await repo.recordPrintJob({ saleId: 's2', type: 'ORIGINAL', status: 'FAILED', errorMessage: 'sin papel', printedBy: 'u1' });
    const events = await repo.listAuditEvents({ type: 'print_failed' });
    expect(events.length).toBe(1);
  });

  it('recordCashDrawerEvent MANUAL_OPEN audita y guarda el evento', async () => {
    const repo = new LocalRepository();
    await repo.recordCashDrawerEvent({ userId: 'u1', username: 'María', type: 'MANUAL_OPEN', reason: 'cambio' });
    expect((await repo.listAuditEvents({ type: 'drawer_manual_open' })).length).toBe(1);
    expect((await repo.listCashDrawerEvents()).length).toBe(1);
  });

  it('addCashMovement crea evento de cajón CASH_OUT + auditoría cash_out', async () => {
    const repo = new LocalRepository();
    await repo.addCashMovement({ cashSessionId: 'sess1', type: 'out', amount: 20, reason: 'proveedor', userId: 'u1', userName: 'María' });
    expect((await repo.listAuditEvents({ type: 'cash_out' })).length).toBe(1);
    const drawer = await repo.listCashDrawerEvents('sess1');
    expect(drawer.length).toBe(1);
    expect(drawer[0].type).toBe('CASH_OUT');
  });

  it('savePrinterConfig audita el cambio y el cambio de pin', async () => {
    const repo = new LocalRepository();
    const cfg = await repo.getPrinterConfig();
    await repo.savePrinterConfig({ ...cfg, drawerPin: cfg.drawerPin === 2 ? 5 : 2 }, { userId: 'u1', userName: 'Admin' });
    expect((await repo.listAuditEvents({ type: 'printer_config_changed' })).length).toBe(1);
    expect((await repo.listAuditEvents({ type: 'drawer_pin_changed' })).length).toBe(1);
  });
});
