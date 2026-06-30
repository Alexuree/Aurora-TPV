// =====================================================================
// Implementación de Repository sobre localStorage. Es la que hace que la
// aplicación sea usable HOY en el mostrador sin montar infraestructura.
// Mantiene la numeración de tickets y caja.
// =====================================================================

import type {
  CashDrawerEvent,
  CashMovement,
  CashSession,
  Category,
  Customer,
  AuditEvent,
  PrinterConfig,
  PrintJob,
  Sale,
  SaleCancellation,
  SaleItem,
  Settings,
  User,
  UUID,
} from '@/domain/types';
import { round2 } from '@/domain/money';
import { fiscalHashPayload, invoiceTypeForSale, seriesForInvoice, sha256Hex } from '@/domain/fiscal';
import { summarizeSales } from '@/domain/sales';
import { computeExpectedCash } from '@/domain/cash';
import { uid } from '@/lib/uid';
import { seedCategories, seedPrinterConfig, seedProducts, seedSettings, seedUsers } from '@/data/seed';
import type {
  ActorContext,
  AuditFilter,
  CancelSaleInput,
  AssignSaleCustomerInput,
  CashMovementInput,
  CloseCashInput,
  OpenCashInput,
  ProcessSaleInput,
  RecordCashDrawerEventInput,
  RecordPrintJobInput,
  Repository,
  SalesFilter,
} from '@/data/repository';
import type { Product, ProductPriceChange } from '@/domain/types';

const NS = 'aurora-tpv';
const K = {
  users: `${NS}:users`,
  categories: `${NS}:categories`,
  products: `${NS}:products`,
  priceHistory: `${NS}:priceHistory`,
  customers: `${NS}:customers`,
  sales: `${NS}:sales`,
  cancellations: `${NS}:cancellations`,
  cashSessions: `${NS}:cashSessions`,
  cashMovements: `${NS}:cashMovements`,
  cashDrawerEvents: `${NS}:cashDrawerEvents`,
  auditEvents: `${NS}:auditEvents`,
  printerConfig: `${NS}:printerConfig`,
  printJobs: `${NS}:printJobs`,
  settings: `${NS}:settings`,
  saleSeq: `${NS}:saleSeq`,
  seeded: `${NS}:seeded`,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function nextSeq(key: string): number {
  const current = Number(localStorage.getItem(key) ?? '0') + 1;
  localStorage.setItem(key, String(current));
  return current;
}

/** Simula latencia mínima para que la UI se comporte igual que con red. */
function ok<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

export class LocalRepository implements Repository {
  readonly mode = 'local' as const;

  constructor() {
    this.ensureSeed();
  }

  private ensureSeed(): void {
    if (localStorage.getItem(K.seeded)) return;
    write(K.users, seedUsers);
    write(K.categories, seedCategories);
    write(K.products, seedProducts);
    write(K.priceHistory, []);
    write(K.customers, []);
    write(K.sales, []);
    write(K.cancellations, []);
    write(K.cashSessions, []);
    write(K.cashMovements, []);
    write(K.cashDrawerEvents, []);
    write(K.auditEvents, []);
    const now = new Date().toISOString();
    write(K.printerConfig, { ...seedPrinterConfig, createdAt: now, updatedAt: now });
    write(K.printJobs, []);
    write(K.settings, seedSettings);
    localStorage.setItem(K.saleSeq, '1000');
    localStorage.setItem(K.seeded, '1');
  }

  /* ----------------------------- Auth ----------------------------- */
  async login(username: string, pin: string): Promise<User | null> {
    const users = read<User[]>(K.users, []);
    const u = users.find(
      (x) => x.active && x.username.toLowerCase() === username.trim().toLowerCase() && x.pin === pin,
    );
    return ok(u ?? null);
  }

  /* ----------------------------- Users ---------------------------- */
  async listUsers(): Promise<User[]> {
    return ok(read<User[]>(K.users, []));
  }
  async saveUser(user: User): Promise<User> {
    const users = read<User[]>(K.users, []);
    const idx = users.findIndex((u) => u.id === user.id);
    const prev = idx >= 0 ? users[idx] : undefined;
    const saved = { ...user, pin: user.pin || prev?.pin, id: user.id || uid(), createdAt: user.createdAt ?? new Date().toISOString() };
    if (idx >= 0) users[idx] = saved;
    else users.push(saved);
    write(K.users, users);
    this.audit('user_updated', { userId: saved.id, userName: saved.fullName, entity: 'user', entityId: saved.id });
    return ok(saved);
  }
  async deleteUser(id: UUID): Promise<void> {
    write(K.users, read<User[]>(K.users, []).filter((u) => u.id !== id));
    return ok(undefined);
  }

  /* --------------------------- Categories ------------------------- */
  async listCategories(): Promise<Category[]> {
    return ok(read<Category[]>(K.categories, []).filter((c) => c.active !== false).sort((a, b) => a.sortOrder - b.sortOrder));
  }
  async saveCategory(cat: Category): Promise<Category> {
    const cats = read<Category[]>(K.categories, []);
    const saved = { ...cat, id: cat.id || uid(), active: cat.active !== false };
    const idx = cats.findIndex((c) => c.id === saved.id);
    if (idx >= 0) cats[idx] = saved;
    else cats.push(saved);
    write(K.categories, cats);
    return ok(saved);
  }
  async deleteCategory(id: UUID): Promise<void> {
    const cats = read<Category[]>(K.categories, []);
    const cat = cats.find((c) => c.id === id);
    if (cat) {
      cat.active = false;
      write(K.categories, cats);
    }
    return ok(undefined);
  }

  /* ---------------------------- Products -------------------------- */
  async listProducts(): Promise<Product[]> {
    return ok(read<Product[]>(K.products, []));
  }
  async getProductByCode(code: string): Promise<Product | null> {
    const q = code.trim().toLowerCase();
    const found = read<Product[]>(K.products, []).find(
      (p) => p.active && (p.barcode?.toLowerCase() === q || p.sku?.toLowerCase() === q),
    );
    return ok(found ?? null);
  }
  async saveProduct(p: Product): Promise<Product> {
    const products = read<Product[]>(K.products, []);
    const now = new Date().toISOString();
    const saved: Product = {
      ...p,
      id: p.id || uid(),
      createdAt: p.createdAt ?? now,
      updatedAt: now,
    };
    const idx = products.findIndex((x) => x.id === saved.id);
    if (idx >= 0) {
      // Historial de precio: registra si cambió
      const prev = products[idx];
      if (prev.price !== saved.price) {
        const hist = read<ProductPriceChange[]>(K.priceHistory, []);
        hist.unshift({ id: uid(), productId: saved.id, oldPrice: prev.price, newPrice: saved.price, changedAt: now });
        write(K.priceHistory, hist);
      }
      products[idx] = saved;
    } else {
      products.push(saved);
    }
    write(K.products, products);
    return ok(saved);
  }
  /** Baja LÓGICA: no se borra (puede tener ventas asociadas), se marca inactivo. */
  async deleteProduct(id: UUID): Promise<void> {
    const products = read<Product[]>(K.products, []);
    const prod = products.find((p) => p.id === id);
    if (prod) {
      prod.active = false;
      prod.updatedAt = new Date().toISOString();
      write(K.products, products);
    }
    return ok(undefined);
  }
  async listPriceHistory(productId: UUID): Promise<ProductPriceChange[]> {
    return ok(read<ProductPriceChange[]>(K.priceHistory, []).filter((h) => h.productId === productId));
  }

  /* ---------------------------- Customers ------------------------- */
  async listCustomers(): Promise<Customer[]> {
    return ok(read<Customer[]>(K.customers, []));
  }
  async saveCustomer(c: Customer): Promise<Customer> {
    const list = read<Customer[]>(K.customers, []);
    const saved = { ...c, id: c.id || uid(), createdAt: c.createdAt ?? new Date().toISOString() };
    const idx = list.findIndex((x) => x.id === saved.id);
    if (idx >= 0) list[idx] = saved;
    else list.push(saved);
    write(K.customers, list);
    return ok(saved);
  }
  async deleteCustomer(id: UUID): Promise<void> {
    write(K.customers, read<Customer[]>(K.customers, []).filter((c) => c.id !== id));
    return ok(undefined);
  }

  /* ------------------------------ Sales --------------------------- */
  async processSale(input: ProcessSaleInput): Promise<Sale> {
    const now = new Date().toISOString();
    const number = nextSeq(K.saleSeq);
    const settings = { ...seedSettings, ...read<Partial<Settings>>(K.settings, {}) };
    const invoiceType = invoiceTypeForSale(settings, Boolean(input.customerSnapshot?.taxId));
    const series = seriesForInvoice(settings, invoiceType);
    const previousFiscalHash = read<Sale[]>(K.sales, []).find((s) => s.fiscalHash)?.fiscalHash ?? null;

    const items: SaleItem[] = input.lines.map((l) => ({
      id: uid(),
      productId: l.productId,
      name: l.name,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct,
      ivaRate: l.ivaRate as SaleItem['ivaRate'],
      taxBase: l.taxBase,
      taxAmount: l.taxAmount,
      lineTotal: l.lineTotal,
      returnedQty: 0,
    }));

    const sale: Sale = {
      id: uid(),
      number,
      createdAt: now,
      cashierId: input.cashierId,
      cashierName: input.cashierName,
      cashSessionId: input.cashSessionId,
      customerId: input.customerId,
      customerName: input.customerName,
      status: 'completed',
      items,
      payments: input.payments,
      subtotal: input.subtotal,
      taxTotal: input.taxTotal,
      discountTotal: input.discountTotal,
      total: input.total,
      cashGiven: input.cashGiven,
      changeGiven: input.changeGiven,
      customerSnapshot: input.customerSnapshot ?? null,
      note: input.note,
      printStatus: 'pending',
      ticketTemplateVersion: 1,
      invoiceType,
      series,
      fiscalNumber: `${series}-${number}`,
      fiscalMode: settings.fiscalMode,
      previousFiscalHash,
    };
    sale.fiscalHash = await sha256Hex(fiscalHashPayload(sale));
    const sales = read<Sale[]>(K.sales, []);
    sales.unshift(sale);
    write(K.sales, sales);
    this.audit('sale_created', {
      userId: input.cashierId,
      userName: input.cashierName,
      entity: 'sale',
      entityId: sale.id,
      details: { number: sale.number, total: sale.total, invoiceType, fiscalHash: sale.fiscalHash },
    });
    if (input.lines.some((l) => l.discountPct > 0)) {
      this.audit('discount_applied', {
        userId: input.cashierId,
        userName: input.cashierName,
        entity: 'sale',
        entityId: sale.id,
        details: { number: sale.number, discountTotal: sale.discountTotal },
      });
    }
    return ok(sale);
  }

  async listSales(filter?: SalesFilter): Promise<Sale[]> {
    let sales = read<Sale[]>(K.sales, []);
    if (filter) {
      if (filter.from) sales = sales.filter((s) => s.createdAt >= filter.from!);
      if (filter.to) sales = sales.filter((s) => s.createdAt <= filter.to!);
      if (filter.cashierId) sales = sales.filter((s) => s.cashierId === filter.cashierId);
      if (filter.status) sales = sales.filter((s) => s.status === filter.status);
      if (filter.search) {
        const q = filter.search.toLowerCase();
        sales = sales.filter(
          (s) => String(s.number).includes(q) || s.customerName.toLowerCase().includes(q),
        );
      }
    }
    return ok(sales);
  }

  async getSale(id: UUID): Promise<Sale | null> {
    return ok(read<Sale[]>(K.sales, []).find((s) => s.id === id) ?? null);
  }

  async assignSaleCustomer(input: AssignSaleCustomerInput): Promise<Sale> {
    const sales = read<Sale[]>(K.sales, []);
    const sale = sales.find((s) => s.id === input.saleId);
    if (!sale) throw new Error('Venta no encontrada');
    if (sale.status === 'cancelled') throw new Error('No se puede facturar un ticket anulado');

    const settings = { ...seedSettings, ...read<Partial<Settings>>(K.settings, {}) };
    const invoiceType = invoiceTypeForSale(settings, Boolean(input.customerSnapshot?.taxId));
    const series = seriesForInvoice(settings, invoiceType);

    sale.customerId = input.customerId;
    sale.customerName = input.customerName || 'Cliente mostrador';
    sale.customerSnapshot = input.customerSnapshot ?? null;
    sale.invoiceType = invoiceType;
    sale.series = series;
    sale.fiscalNumber = `${series}-${sale.number}`;
    sale.fiscalHash = await sha256Hex(fiscalHashPayload(sale));
    write(K.sales, sales);
    this.audit('sale_customer_assigned', {
      userId: input.userId,
      userName: input.userName,
      entity: 'sale',
      entityId: sale.id,
      details: { number: sale.number, customerId: input.customerId, invoiceType, fiscalNumber: sale.fiscalNumber },
    });
    return ok(sale);
  }

  async setSalePrintStatus(saleId: UUID, status: 'pending' | 'printed' | 'failed'): Promise<void> {
    const sales = read<Sale[]>(K.sales, []);
    const sale = sales.find((s) => s.id === saleId);
    if (sale) {
      sale.printStatus = status;
      write(K.sales, sales);
    }
    return ok(undefined);
  }

  /* ------------------------- Cancellations ------------------------ */
  async cancelSale(input: CancelSaleInput): Promise<SaleCancellation> {
    const sales = read<Sale[]>(K.sales, []);
    const sale = sales.find((s) => s.id === input.saleId);
    if (!sale) throw new Error('Venta no encontrada');
    if (sale.status === 'cancelled') throw new Error('El ticket ya está anulado');

    // No anular si pertenece a un cierre de caja ya cerrado.
    if (sale.cashSessionId) {
      const session = read<CashSession[]>(K.cashSessions, []).find((s) => s.id === sale.cashSessionId);
      if (session && session.status === 'closed') {
        throw new Error('El ticket está incluido en un cierre de caja cerrado y no puede anularse');
      }
    }

    const now = new Date().toISOString();

    sale.status = 'cancelled';
    write(K.sales, sales);

    const cancellation: SaleCancellation = {
      id: uid(),
      saleId: sale.id,
      saleNumber: sale.number,
      createdAt: now,
      cancelledById: input.userId,
      cancelledByName: input.userName,
      reason: 'Anulación de ticket',
      originalTotal: sale.total,
      paymentMethods: [...new Set(sale.payments.map((p) => p.method))],
      cashSessionId: sale.cashSessionId,
    };
    const list = read<SaleCancellation[]>(K.cancellations, []);
    list.unshift(cancellation);
    write(K.cancellations, list);
    this.audit('sale_cancelled', {
      userId: input.userId,
      userName: input.userName,
      entity: 'sale',
      entityId: sale.id,
      details: { number: sale.number, total: sale.total },
    });
    return ok(cancellation);
  }

  async listCancellations(): Promise<SaleCancellation[]> {
    return ok(read<SaleCancellation[]>(K.cancellations, []));
  }

  /* ------------------------------ Cash ---------------------------- */
  async getOpenCashSession(): Promise<CashSession | null> {
    return ok(read<CashSession[]>(K.cashSessions, []).find((s) => s.status === 'open') ?? null);
  }

  async openCashSession(input: OpenCashInput): Promise<CashSession> {
    const sessions = read<CashSession[]>(K.cashSessions, []);
    if (sessions.some((s) => s.status === 'open')) {
      throw new Error('Ya hay una caja abierta');
    }
    const session: CashSession = {
      id: uid(),
      openedAt: new Date().toISOString(),
      openedById: input.userId,
      openedByName: input.userName,
      openingFloat: input.openingFloat,
      status: 'open',
      note: input.note,
    };
    sessions.unshift(session);
    write(K.cashSessions, sessions);
    this.audit('cash_opened', {
      userId: input.userId,
      userName: input.userName,
      entity: 'cash_session',
      entityId: session.id,
      details: { openingFloat: input.openingFloat },
    });
    return ok(session);
  }

  async closeCashSession(input: CloseCashInput): Promise<CashSession> {
    const sessions = read<CashSession[]>(K.cashSessions, []);
    const session = sessions.find((s) => s.id === input.sessionId);
    if (!session) throw new Error('Sesión de caja no encontrada');

    const expectedCash = this.computeExpectedCash(session);
    const sessionSales = read<Sale[]>(K.sales, []).filter((s) => s.cashSessionId === session.id);
    const summary = summarizeSales(sessionSales);

    session.status = 'closed';
    session.closedAt = new Date().toISOString();
    session.closedById = input.userId;
    session.countedCash = input.countedCash == null ? undefined : round2(input.countedCash);
    session.expectedCash = expectedCash;
    session.difference = input.countedCash == null ? undefined : round2(input.countedCash - expectedCash);
    session.salesTotal = summary.net;
    session.cardTotal = round2(summary.byMethod.card);
    session.cancellationsTotal = summary.cancelled;
    session.note = input.note ?? session.note;
    write(K.cashSessions, sessions);
    this.audit('cash_closed', {
      userId: input.userId,
      entity: 'cash_session',
      entityId: session.id,
      details: { expectedCash, countedCash: input.countedCash, salesTotal: session.salesTotal, cardTotal: session.cardTotal },
    });
    if (session.difference != null && session.difference !== 0) {
      this.audit('cash_close_difference', {
        userId: input.userId,
        entity: 'cash_session',
        entityId: session.id,
        details: { difference: session.difference, expectedCash, countedCash: session.countedCash },
      });
    }
    return ok(session);
  }

  /** Efectivo esperado = fondo + ventas efectivo + entradas - salidas. */
  private computeExpectedCash(session: CashSession): number {
    const sales = read<Sale[]>(K.sales, []).filter((s) => s.cashSessionId === session.id);
    const movements = read<CashMovement[]>(K.cashMovements, []).filter((m) => m.cashSessionId === session.id);
    // Lógica pura compartida (excluye ventas anuladas internamente).
    return computeExpectedCash(session.openingFloat, sales, movements);
  }

  async listCashSessions(): Promise<CashSession[]> {
    return ok(read<CashSession[]>(K.cashSessions, []));
  }

  async addCashMovement(input: CashMovementInput): Promise<CashMovement> {
    const movements = read<CashMovement[]>(K.cashMovements, []);
    const mv: CashMovement = {
      id: uid(),
      cashSessionId: input.cashSessionId,
      createdAt: new Date().toISOString(),
      type: input.type,
      amount: round2(input.amount),
      reason: input.reason,
      userId: input.userId,
    };
    movements.unshift(mv);
    write(K.cashMovements, movements);
    // Cada entrada/salida de efectivo deja rastro en el cajón y en auditoría.
    this.pushDrawerEvent({
      sessionId: input.cashSessionId,
      userId: input.userId,
      username: input.userName ?? '',
      type: input.type === 'in' ? 'CASH_IN' : 'CASH_OUT',
      reason: input.reason,
      amount: mv.amount,
    });
    this.audit(input.type === 'in' ? 'cash_in' : 'cash_out', {
      userId: input.userId,
      userName: input.userName,
      entity: 'cash_session',
      entityId: input.cashSessionId,
      details: { amount: mv.amount, reason: input.reason },
    });
    return ok(mv);
  }

  async listCashMovements(sessionId: UUID): Promise<CashMovement[]> {
    return ok(read<CashMovement[]>(K.cashMovements, []).filter((m) => m.cashSessionId === sessionId));
  }

  /* --------------------------- Settings --------------------------- */
  async getSettings(): Promise<Settings> {
    // Mezcla con los valores por defecto para que ajustes guardados antes de
    // añadir nuevos campos (p. ej. plantilla de ticket) no queden incompletos.
    return ok({ ...seedSettings, ...read<Partial<Settings>>(K.settings, {}) });
  }
  async saveSettings(s: Settings): Promise<Settings> {
    write(K.settings, s);
    this.audit('settings_updated', { entity: 'settings', details: { fiscalMode: s.fiscalMode } });
    return ok(s);
  }

  /* ------------------- Impresora térmica / cajón ------------------ */
  async getPrinterConfig(): Promise<PrinterConfig> {
    const stored = read<Partial<PrinterConfig> | null>(K.printerConfig, null);
    if (!stored) {
      const now = new Date().toISOString();
      return ok({ ...seedPrinterConfig, createdAt: now, updatedAt: now });
    }
    // Mezcla con defaults para stores creados antes de añadir campos nuevos.
    return ok({ ...seedPrinterConfig, ...stored });
  }

  async savePrinterConfig(cfg: PrinterConfig, actor?: ActorContext): Promise<PrinterConfig> {
    const prev = read<PrinterConfig | null>(K.printerConfig, null);
    const now = new Date().toISOString();
    const saved: PrinterConfig = { ...cfg, createdAt: prev?.createdAt || cfg.createdAt || now, updatedAt: now };
    write(K.printerConfig, saved);
    this.audit('printer_config_changed', {
      userId: actor?.userId,
      userName: actor?.userName,
      entity: 'printer_config',
      entityId: saved.id,
      details: { connectionType: saved.connectionType, printerName: saved.printerName, paperWidth: saved.paperWidth },
    });
    if (prev && prev.drawerPin !== saved.drawerPin) {
      this.audit('drawer_pin_changed', {
        userId: actor?.userId, userName: actor?.userName, entity: 'printer_config', entityId: saved.id,
        details: { from: prev.drawerPin, to: saved.drawerPin },
      });
    }
    if (prev && prev.printerName !== saved.printerName) {
      this.audit('default_printer_changed', {
        userId: actor?.userId, userName: actor?.userName, entity: 'printer_config', entityId: saved.id,
        details: { from: prev.printerName, to: saved.printerName },
      });
    }
    return ok(saved);
  }

  async recordPrintJob(input: RecordPrintJobInput): Promise<PrintJob> {
    const job: PrintJob = {
      id: uid(),
      saleId: input.saleId ?? null,
      receiptNumber: input.receiptNumber ?? null,
      type: input.type,
      status: input.status,
      errorMessage: input.errorMessage,
      printedBy: input.printedBy,
      printedAt: new Date().toISOString(),
      copies: input.copies ?? 1,
    };
    const jobs = read<PrintJob[]>(K.printJobs, []);
    jobs.unshift(job);
    write(K.printJobs, jobs.slice(0, 5000));
    return ok(job);
  }

  async listPrintJobs(saleId?: UUID): Promise<PrintJob[]> {
    const jobs = read<PrintJob[]>(K.printJobs, []);
    return ok(saleId ? jobs.filter((j) => j.saleId === saleId) : jobs);
  }

  private pushDrawerEvent(input: RecordCashDrawerEventInput): CashDrawerEvent {
    const ev: CashDrawerEvent = {
      id: uid(),
      sessionId: input.sessionId ?? null,
      userId: input.userId,
      username: input.username,
      type: input.type,
      reason: input.reason,
      amount: input.amount,
      relatedSaleId: input.relatedSaleId ?? null,
      createdAt: new Date().toISOString(),
    };
    const list = read<CashDrawerEvent[]>(K.cashDrawerEvents, []);
    list.unshift(ev);
    write(K.cashDrawerEvents, list.slice(0, 5000));
    return ev;
  }

  async recordCashDrawerEvent(input: RecordCashDrawerEventInput): Promise<CashDrawerEvent> {
    return ok(this.pushDrawerEvent(input));
  }

  async listCashDrawerEvents(sessionId?: UUID): Promise<CashDrawerEvent[]> {
    const list = read<CashDrawerEvent[]>(K.cashDrawerEvents, []);
    return ok(sessionId ? list.filter((e) => e.sessionId === sessionId) : list);
  }

  async listAuditEvents(filter?: AuditFilter): Promise<AuditEvent[]> {
    let events = read<AuditEvent[]>(K.auditEvents, []);
    if (filter) {
      if (filter.type) events = events.filter((e) => e.type === filter.type);
      if (filter.userId) events = events.filter((e) => e.userId === filter.userId);
      if (filter.entity) events = events.filter((e) => e.entity === filter.entity);
      if (filter.entityId) events = events.filter((e) => e.entityId === filter.entityId);
      if (filter.from) events = events.filter((e) => e.createdAt >= filter.from!);
      if (filter.to) events = events.filter((e) => e.createdAt <= filter.to!);
    }
    return ok(filter?.limit ? events.slice(0, filter.limit) : events);
  }

  private audit(type: AuditEvent['type'], event: Omit<AuditEvent, 'id' | 'createdAt' | 'type'>): void {
    const events = read<AuditEvent[]>(K.auditEvents, []);
    events.unshift({ id: uid(), createdAt: new Date().toISOString(), type, ...event });
    write(K.auditEvents, events.slice(0, 5000));
  }
}
