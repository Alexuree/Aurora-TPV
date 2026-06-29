// =====================================================================
// Contrato de persistencia. La aplicación SOLO conoce esta interfaz, no
// si los datos viven en localStorage o en Supabase. Esto cumple la
// separación lógica de negocio / interfaz / persistencia (requisito #12).
// =====================================================================

import type {
  CashMovement,
  CashSession,
  Category,
  Customer,
  PaymentMethod,
  PaymentPart,
  Product,
  Sale,
  SaleReturn,
  Settings,
  StockMovement,
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

export interface ProcessReturnInput {
  saleId: UUID;
  cashierId: UUID;
  cashierName: string;
  reason: string;
  refundMethod: PaymentMethod;
  restock: boolean;
  items: { saleItemId: UUID; productId: UUID; name: string; quantity: number; refundAmount: number }[];
  total: number;
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
  countedCash: number;
  note?: string;
}

export interface CashMovementInput {
  cashSessionId: UUID;
  type: 'in' | 'out';
  amount: number;
  reason: string;
  userId: UUID;
}

export interface AdjustStockInput {
  productId: UUID;
  newStock: number;
  reason: string;
  userId: UUID;
}

export interface SalesFilter {
  from?: string;
  to?: string;
  cashierId?: UUID;
  status?: string;
  search?: string;
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

  // Clientes
  listCustomers(): Promise<Customer[]>;
  saveCustomer(c: Customer): Promise<Customer>;
  deleteCustomer(id: UUID): Promise<void>;

  // Ventas (operación transaccional)
  processSale(input: ProcessSaleInput): Promise<Sale>;
  listSales(filter?: SalesFilter): Promise<Sale[]>;
  getSale(id: UUID): Promise<Sale | null>;
  setSalePrintStatus(saleId: UUID, status: 'pending' | 'printed' | 'failed'): Promise<void>;

  // Devoluciones
  processReturn(input: ProcessReturnInput): Promise<SaleReturn>;
  listReturns(): Promise<SaleReturn[]>;

  // Caja
  getOpenCashSession(): Promise<CashSession | null>;
  openCashSession(input: OpenCashInput): Promise<CashSession>;
  closeCashSession(input: CloseCashInput): Promise<CashSession>;
  listCashSessions(): Promise<CashSession[]>;
  addCashMovement(input: CashMovementInput): Promise<CashMovement>;
  listCashMovements(sessionId: UUID): Promise<CashMovement[]>;

  // Inventario
  listStockMovements(productId?: UUID): Promise<StockMovement[]>;
  adjustStock(input: AdjustStockInput): Promise<void>;

  // Ajustes
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<Settings>;
}
