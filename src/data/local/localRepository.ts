// =====================================================================
// Implementación de Repository sobre localStorage. Es la que hace que la
// aplicación sea usable HOY en el mostrador sin montar infraestructura.
// Mantiene la integridad de stock, numeración de tickets y caja.
// =====================================================================

import type {
  CashMovement,
  CashSession,
  Category,
  Customer,
  Sale,
  SaleItem,
  SaleReturn,
  Settings,
  StockMovement,
  User,
  UUID,
} from '@/domain/types';
import { round2 } from '@/domain/money';
import { uid } from '@/lib/uid';
import { seedCategories, seedProducts, seedSettings, seedUsers } from '@/data/seed';
import type {
  AdjustStockInput,
  CashMovementInput,
  CloseCashInput,
  OpenCashInput,
  ProcessReturnInput,
  ProcessSaleInput,
  Repository,
  SalesFilter,
} from '@/data/repository';
import type { Product } from '@/domain/types';

const NS = 'aurora-tpv';
const K = {
  users: `${NS}:users`,
  categories: `${NS}:categories`,
  products: `${NS}:products`,
  customers: `${NS}:customers`,
  sales: `${NS}:sales`,
  returns: `${NS}:returns`,
  cashSessions: `${NS}:cashSessions`,
  cashMovements: `${NS}:cashMovements`,
  stockMovements: `${NS}:stockMovements`,
  settings: `${NS}:settings`,
  saleSeq: `${NS}:saleSeq`,
  returnSeq: `${NS}:returnSeq`,
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
    write(K.customers, []);
    write(K.sales, []);
    write(K.returns, []);
    write(K.cashSessions, []);
    write(K.cashMovements, []);
    write(K.stockMovements, []);
    write(K.settings, seedSettings);
    localStorage.setItem(K.saleSeq, '1000');
    localStorage.setItem(K.returnSeq, '500');
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
    const saved = { ...user, id: user.id || uid(), createdAt: user.createdAt ?? new Date().toISOString() };
    if (idx >= 0) users[idx] = saved;
    else users.push(saved);
    write(K.users, users);
    return ok(saved);
  }
  async deleteUser(id: UUID): Promise<void> {
    write(K.users, read<User[]>(K.users, []).filter((u) => u.id !== id));
    return ok(undefined);
  }

  /* --------------------------- Categories ------------------------- */
  async listCategories(): Promise<Category[]> {
    return ok(read<Category[]>(K.categories, []).sort((a, b) => a.sortOrder - b.sortOrder));
  }
  async saveCategory(cat: Category): Promise<Category> {
    const cats = read<Category[]>(K.categories, []);
    const saved = { ...cat, id: cat.id || uid() };
    const idx = cats.findIndex((c) => c.id === saved.id);
    if (idx >= 0) cats[idx] = saved;
    else cats.push(saved);
    write(K.categories, cats);
    return ok(saved);
  }
  async deleteCategory(id: UUID): Promise<void> {
    write(K.categories, read<Category[]>(K.categories, []).filter((c) => c.id !== id));
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
    if (idx >= 0) products[idx] = saved;
    else products.push(saved);
    write(K.products, products);
    return ok(saved);
  }
  async deleteProduct(id: UUID): Promise<void> {
    write(K.products, read<Product[]>(K.products, []).filter((p) => p.id !== id));
    return ok(undefined);
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
    const products = read<Product[]>(K.products, []);
    const stockMoves = read<StockMovement[]>(K.stockMovements, []);
    const now = new Date().toISOString();
    const number = nextSeq(K.saleSeq);

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

    // Descontar stock y registrar movimientos
    for (const line of input.lines) {
      const prod = products.find((p) => p.id === line.productId);
      if (prod && prod.trackStock) {
        prod.stock = round2(prod.stock - line.quantity);
        prod.updatedAt = now;
        stockMoves.push({
          id: uid(),
          createdAt: now,
          productId: prod.id,
          productName: prod.name,
          type: 'sale',
          quantity: -line.quantity,
          resultingStock: prod.stock,
          reference: `Venta #${number}`,
          userId: input.cashierId,
        });
      }
    }
    write(K.products, products);
    write(K.stockMovements, stockMoves);

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
      note: input.note,
      printStatus: 'pending',
      ticketTemplateVersion: 1,
    };
    const sales = read<Sale[]>(K.sales, []);
    sales.unshift(sale);
    write(K.sales, sales);
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

  async setSalePrintStatus(saleId: UUID, status: 'pending' | 'printed' | 'failed'): Promise<void> {
    const sales = read<Sale[]>(K.sales, []);
    const sale = sales.find((s) => s.id === saleId);
    if (sale) {
      sale.printStatus = status;
      write(K.sales, sales);
    }
    return ok(undefined);
  }

  /* --------------------------- Returns ---------------------------- */
  async processReturn(input: ProcessReturnInput): Promise<SaleReturn> {
    const sales = read<Sale[]>(K.sales, []);
    const sale = sales.find((s) => s.id === input.saleId);
    if (!sale) throw new Error('Venta no encontrada');

    const products = read<Product[]>(K.products, []);
    const stockMoves = read<StockMovement[]>(K.stockMovements, []);
    const now = new Date().toISOString();
    const number = nextSeq(K.returnSeq);

    for (const ri of input.items) {
      const item = sale.items.find((i) => i.id === ri.saleItemId);
      if (item) item.returnedQty = round2(item.returnedQty + ri.quantity);
      if (input.restock) {
        const prod = products.find((p) => p.id === ri.productId);
        if (prod && prod.trackStock) {
          prod.stock = round2(prod.stock + ri.quantity);
          prod.updatedAt = now;
          stockMoves.push({
            id: uid(),
            createdAt: now,
            productId: prod.id,
            productName: prod.name,
            type: 'return',
            quantity: ri.quantity,
            resultingStock: prod.stock,
            reference: `Devolución #${number}`,
            userId: input.cashierId,
          });
        }
      }
    }

    const fullyReturned = sale.items.every((i) => i.returnedQty >= i.quantity);
    sale.status = fullyReturned ? 'returned' : 'partially_returned';

    write(K.sales, sales);
    write(K.products, products);
    write(K.stockMovements, stockMoves);

    const ret: SaleReturn = {
      id: uid(),
      number,
      saleId: sale.id,
      saleNumber: sale.number,
      createdAt: now,
      cashierId: input.cashierId,
      cashierName: input.cashierName,
      reason: input.reason,
      refundMethod: input.refundMethod,
      items: input.items,
      total: input.total,
      restock: input.restock,
    };
    const returns = read<SaleReturn[]>(K.returns, []);
    returns.unshift(ret);
    write(K.returns, returns);
    return ok(ret);
  }

  async listReturns(): Promise<SaleReturn[]> {
    return ok(read<SaleReturn[]>(K.returns, []));
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
    return ok(session);
  }

  async closeCashSession(input: CloseCashInput): Promise<CashSession> {
    const sessions = read<CashSession[]>(K.cashSessions, []);
    const session = sessions.find((s) => s.id === input.sessionId);
    if (!session) throw new Error('Sesión de caja no encontrada');

    const expectedCash = this.computeExpectedCash(session);
    session.status = 'closed';
    session.closedAt = new Date().toISOString();
    session.closedById = input.userId;
    session.countedCash = round2(input.countedCash);
    session.expectedCash = expectedCash;
    session.difference = round2(input.countedCash - expectedCash);
    session.note = input.note ?? session.note;
    write(K.cashSessions, sessions);
    return ok(session);
  }

  /** Efectivo esperado = fondo + ventas efectivo + entradas - salidas - devoluciones efectivo. */
  private computeExpectedCash(session: CashSession): number {
    const sales = read<Sale[]>(K.sales, []).filter((s) => s.cashSessionId === session.id);
    const cashSales = sales.reduce(
      (acc, s) => acc + s.payments.filter((p) => p.method === 'cash').reduce((a, p) => a + p.amount, 0),
      0,
    );
    // El cambio devuelto ya está implícito (el pago en efectivo registrado es el neto cobrado).
    const movements = read<CashMovement[]>(K.cashMovements, []).filter(
      (m) => m.cashSessionId === session.id,
    );
    const cashIn = movements.filter((m) => m.type === 'in').reduce((a, m) => a + m.amount, 0);
    const cashOut = movements.filter((m) => m.type === 'out').reduce((a, m) => a + m.amount, 0);
    const returns = read<SaleReturn[]>(K.returns, []).filter(
      (r) => r.refundMethod === 'cash' && sales.some((s) => s.id === r.saleId),
    );
    const cashRefunds = returns.reduce((a, r) => a + r.total, 0);
    return round2(session.openingFloat + cashSales + cashIn - cashOut - cashRefunds);
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
    return ok(mv);
  }

  async listCashMovements(sessionId: UUID): Promise<CashMovement[]> {
    return ok(read<CashMovement[]>(K.cashMovements, []).filter((m) => m.cashSessionId === sessionId));
  }

  /* ---------------------------- Stock ----------------------------- */
  async listStockMovements(productId?: UUID): Promise<StockMovement[]> {
    let moves = read<StockMovement[]>(K.stockMovements, []);
    if (productId) moves = moves.filter((m) => m.productId === productId);
    return ok(moves);
  }

  async adjustStock(input: AdjustStockInput): Promise<void> {
    const products = read<Product[]>(K.products, []);
    const prod = products.find((p) => p.id === input.productId);
    if (!prod) throw new Error('Producto no encontrado');
    const delta = round2(input.newStock - prod.stock);
    prod.stock = round2(input.newStock);
    prod.updatedAt = new Date().toISOString();
    write(K.products, products);

    const moves = read<StockMovement[]>(K.stockMovements, []);
    moves.unshift({
      id: uid(),
      createdAt: new Date().toISOString(),
      productId: prod.id,
      productName: prod.name,
      type: 'adjustment',
      quantity: delta,
      resultingStock: prod.stock,
      reference: input.reason,
      userId: input.userId,
    });
    write(K.stockMovements, moves);
    return ok(undefined);
  }

  /* --------------------------- Settings --------------------------- */
  async getSettings(): Promise<Settings> {
    // Mezcla con los valores por defecto para que ajustes guardados antes de
    // añadir nuevos campos (p. ej. plantilla de ticket) no queden incompletos.
    return ok({ ...seedSettings, ...read<Partial<Settings>>(K.settings, {}) });
  }
  async saveSettings(s: Settings): Promise<Settings> {
    write(K.settings, s);
    return ok(s);
  }
}
