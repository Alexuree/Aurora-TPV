// =====================================================================
// Contrato de persistencia. La aplicación SOLO conoce esta interfaz, no
// si los datos viven en localStorage o en Supabase. Esto cumple la
// separación lógica de negocio / interfaz / persistencia (requisito #12).
// =====================================================================

import type {
  AuditEvent,
  CashDrawerEvent,
  CashDrawerEventType,
  CashMovement,
  CashSession,
  Category,
  Customer,
  CustomerSnapshot,
  PaymentPart,
  PrinterConfig,
  PrintJob,
  PrintJobStatus,
  PrintJobType,
  Product,
  ProductPriceChange,
  Sale,
  SaleCancellation,
  Settings,
  User,
  UUID,
} from '@/domain/types';

/* ---------------------------- Inputs ------------------------------- */

export interface SaleLineInput {
  productId: UUID;
  name: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  ivaRate: number;
  taxBase: number;
  taxAmount: number;
  lineTotal: number;
}

export interface ProcessSaleInput {
  cashierId: UUID;
  cashierName: string;
  cashSessionId: UUID | null;
  customerId: UUID | null;
  customerName: string;
  customerSnapshot?: CustomerSnapshot | null;
  lines: SaleLineInput[];
  payments: PaymentPart[];
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  cashGiven?: number;
  changeGiven?: number;
  note?: string;
}

export interface CancelSaleInput {
  saleId: UUID;
  userId: UUID;
  userName: string;
}

export interface AssignSaleCustomerInput {
  saleId: UUID;
  userId?: UUID;
  userName?: string;
  customerId: UUID | null;
  customerName: string;
  customerSnapshot?: CustomerSnapshot | null;
}

export interface OpenCashInput {
  userId: UUID;
  userName: string;
  openingFloat: number;
  note?: string;
}

export interface CloseCashInput {
  sessionId: UUID;
  userId: UUID;
  countedCash: number | null;
  note?: string;
}

export interface CashMovementInput {
  cashSessionId: UUID;
  type: 'in' | 'out';
  amount: number;
  reason: string;
  userId: UUID;
  /** Nombre del usuario (para el evento de cajón asociado). */
  userName?: string;
}

export interface SalesFilter {
  from?: string;
  to?: string;
  cashierId?: UUID;
  status?: string;
  search?: string;
}

/* ---------------- Impresión térmica / cajón / auditoría ------------ */

export interface RecordPrintJobInput {
  saleId?: UUID | null;
  receiptNumber?: number | null;
  type: PrintJobType;
  status: PrintJobStatus;
  errorMessage?: string;
  printedBy: UUID;
  copies?: number;
}

export interface RecordCashDrawerEventInput {
  sessionId?: UUID | null;
  userId: UUID;
  username: string;
  type: CashDrawerEventType;
  reason?: string;
  amount?: number;
  relatedSaleId?: UUID | null;
}

/** Quién realiza un cambio sensible (para auditoría). */
export interface ActorContext {
  userId?: UUID;
  userName?: string;
}

export interface AuditFilter {
  type?: string;
  userId?: UUID;
  from?: string;
  to?: string;
  entity?: string;
  entityId?: UUID;
  limit?: number;
}

/* --------------------------- Interfaz ------------------------------ */

export interface Repository {
  readonly mode: 'local' | 'supabase';

  // Autenticación (modo local usa esto; Supabase usa Supabase Auth aparte)
  login(username: string, pin: string): Promise<User | null>;

  // Usuarios
  listUsers(): Promise<User[]>;
  saveUser(user: User): Promise<User>;
  deleteUser(id: UUID): Promise<void>;

  // Categorías
  listCategories(): Promise<Category[]>;
  saveCategory(cat: Category): Promise<Category>;
  deleteCategory(id: UUID): Promise<void>;

  // Productos
  listProducts(): Promise<Product[]>;
  getProductByCode(code: string): Promise<Product | null>;
  saveProduct(p: Product): Promise<Product>;
  deleteProduct(id: UUID): Promise<void>;
  listPriceHistory(productId: UUID): Promise<ProductPriceChange[]>;

  // Clientes
  listCustomers(): Promise<Customer[]>;
  saveCustomer(c: Customer): Promise<Customer>;
  deleteCustomer(id: UUID): Promise<void>;

  // Ventas (operación transaccional)
  processSale(input: ProcessSaleInput): Promise<Sale>;
  listSales(filter?: SalesFilter): Promise<Sale[]>;
  getSale(id: UUID): Promise<Sale | null>;
  assignSaleCustomer(input: AssignSaleCustomerInput): Promise<Sale>;
  setSalePrintStatus(saleId: UUID, status: 'pending' | 'printed' | 'failed'): Promise<void>;

  // Anulaciones
  cancelSale(input: CancelSaleInput): Promise<SaleCancellation>;
  listCancellations(): Promise<SaleCancellation[]>;

  // Caja
  getOpenCashSession(): Promise<CashSession | null>;
  openCashSession(input: OpenCashInput): Promise<CashSession>;
  closeCashSession(input: CloseCashInput): Promise<CashSession>;
  listCashSessions(): Promise<CashSession[]>;
  addCashMovement(input: CashMovementInput): Promise<CashMovement>;
  listCashMovements(sessionId: UUID): Promise<CashMovement[]>;

  // Ajustes
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<Settings>;

  // Impresora térmica y cajón
  getPrinterConfig(): Promise<PrinterConfig>;
  savePrinterConfig(cfg: PrinterConfig, actor?: ActorContext): Promise<PrinterConfig>;
  recordPrintJob(input: RecordPrintJobInput): Promise<PrintJob>;
  listPrintJobs(saleId?: UUID): Promise<PrintJob[]>;
  recordCashDrawerEvent(input: RecordCashDrawerEventInput): Promise<CashDrawerEvent>;
  listCashDrawerEvents(sessionId?: UUID): Promise<CashDrawerEvent[]>;

  // Auditoría (lectura)
  listAuditEvents(filter?: AuditFilter): Promise<AuditEvent[]>;
}
