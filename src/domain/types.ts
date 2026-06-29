// =====================================================================
// Aurora TPV — Modelo de dominio (tipos compartidos)
// Framework-agnostic: no importa React ni Supabase.
// =====================================================================

export type UUID = string;
export type ISODate = string;

/* ----------------------------- Usuarios ---------------------------- */

export type Role = 'admin' | 'manager' | 'cashier';

export type Permission =
  | 'sell'
  | 'apply_discount'
  | 'modify_price'
  | 'process_return'
  | 'view_reports'
  | 'manage_products'
  | 'manage_users'
  | 'open_close_cash'
  | 'manage_settings';

export interface User {
  id: UUID;
  username: string; // identificador de acceso (usuario o email)
  fullName: string;
  role: Role;
  active: boolean;
  /** Solo modo local: PIN/contraseña de demostración. En Supabase se usa Auth. */
  pin?: string;
  createdAt?: ISODate;
}

/* ---------------------------- Catálogo ----------------------------- */

export interface Category {
  id: UUID;
  name: string;
  color?: string; // color de la tarjeta/etiqueta
  sortOrder: number;
  active: boolean;
}

/** Tipos de IVA vigentes en España. */
export type IvaRate = 0 | 4 | 10 | 21;

export interface Product {
  id: UUID;
  name: string;
  brand?: string; // marca (relevante en perfumería)
  sku?: string;
  barcode?: string;
  categoryId: UUID | null;
  /** PVP final mostrado al cliente. Si taxIncluded=true, ya lleva el IVA. */
  price: number;
  /** Precio de coste (opcional) para calcular beneficio. */
  cost?: number;
  ivaRate: IvaRate;
  taxIncluded: boolean;
  stock: number;
  trackStock: boolean;
  lowStockThreshold: number;
  imageUrl?: string;
  active: boolean;
  createdAt?: ISODate;
  updatedAt?: ISODate;
}

/* ---------------------------- Clientes ----------------------------- */

export interface Customer {
  id: UUID;
  name: string;
  phone?: string;
  email?: string;
  taxId?: string; // NIF/CIF
  notes?: string;
  createdAt?: ISODate;
}

/* ------------------------------ Ticket ----------------------------- */

export interface CartLine {
  /** id único de la línea (no del producto). */
  lineId: string;
  productId: UUID;
  name: string;
  brand?: string;
  barcode?: string;
  ivaRate: IvaRate;
  taxIncluded: boolean;
  quantity: number;
  /** Precio unitario aplicado (puede diferir del PVP si se modifica). */
  unitPrice: number;
  /** PVP original del producto, para mostrar referencia y detectar cambios. */
  basePrice: number;
  /** Descuento de línea en %, 0..100. */
  discountPct: number;
  priceOverridden: boolean;
  trackStock: boolean;
  stockAvailable: number;
}

/** Resultado del cálculo de una línea (importes en euros, redondeados a 2). */
export interface LineTotals {
  grossBeforeDiscount: number; // PVP * cantidad (con IVA si incluido)
  discountAmount: number;
  gross: number; // total de línea cobrado (con IVA si incluido)
  taxBase: number; // base imponible
  taxAmount: number; // cuota de IVA
}

export interface TaxBreakdownRow {
  rate: IvaRate;
  base: number;
  tax: number;
  total: number;
}

export interface CartTotals {
  itemCount: number;
  unitCount: number;
  subtotal: number; // suma de bases imponibles
  taxTotal: number; // suma de cuotas de IVA
  discountTotal: number;
  total: number; // a cobrar
  taxBreakdown: TaxBreakdownRow[];
}

/* ------------------------------ Pagos ------------------------------ */

export type PaymentMethod = 'cash' | 'card' | 'bizum';

export interface PaymentPart {
  method: PaymentMethod;
  amount: number;
}

/* ------------------------------ Ventas ----------------------------- */

export type SaleStatus = 'completed' | 'cancelled' | 'returned' | 'partially_returned';

export interface SaleItem {
  id: UUID;
  productId: UUID;
  name: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  ivaRate: IvaRate;
  taxBase: number;
  taxAmount: number;
  lineTotal: number;
  returnedQty: number;
}

export interface Sale {
  id: UUID;
  number: number; // correlativo legible del ticket
  createdAt: ISODate;
  cashierId: UUID;
  cashierName: string;
  cashSessionId: UUID | null;
  customerId: UUID | null;
  customerName: string;
  status: SaleStatus;
  items: SaleItem[];
  payments: PaymentPart[];
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  /** Importe entregado en efectivo y cambio devuelto (informativo). */
  cashGiven?: number;
  changeGiven?: number;
  note?: string;
  /** Estado de impresión del ticket. */
  printStatus?: 'pending' | 'printed' | 'failed';
  /** Versión de la plantilla con la que se generó el ticket. */
  ticketTemplateVersion?: number;
}

/* --------------------------- Devoluciones -------------------------- */

export interface ReturnItem {
  saleItemId: UUID;
  productId: UUID;
  name: string;
  quantity: number;
  refundAmount: number;
}

export interface SaleReturn {
  id: UUID;
  number: number;
  saleId: UUID;
  saleNumber: number;
  createdAt: ISODate;
  cashierId: UUID;
  cashierName: string;
  reason: string;
  refundMethod: PaymentMethod;
  items: ReturnItem[];
  total: number;
  restock: boolean;
}

/* --------------------------- Anulaciones --------------------------- */

/** Registro de anulación de un ticket (no se borra el ticket original). */
export interface SaleCancellation {
  id: UUID;
  saleId: UUID;
  saleNumber: number;
  createdAt: ISODate;
  cancelledById: UUID;
  cancelledByName: string;
  reason: string;
  originalTotal: number;
  paymentMethods: PaymentMethod[];
  cashSessionId: UUID | null;
  restock: boolean;
}

/* ------------------------------ Caja ------------------------------- */

export type CashSessionStatus = 'open' | 'closed';

export interface CashSession {
  id: UUID;
  openedAt: ISODate;
  closedAt?: ISODate;
  openedById: UUID;
  openedByName: string;
  closedById?: UUID;
  openingFloat: number;
  status: CashSessionStatus;
  /** Datos calculados al cerrar. */
  countedCash?: number;
  expectedCash?: number;
  difference?: number;
  /** Totales de la sesión (calculados al cerrar). */
  salesTotal?: number; // ventas netas (sin anuladas)
  cardTotal?: number; // tarjeta + bizum
  cancellationsTotal?: number; // total anulado
  note?: string;
}

export type CashMovementType = 'in' | 'out';

export interface CashMovement {
  id: UUID;
  cashSessionId: UUID;
  createdAt: ISODate;
  type: CashMovementType;
  amount: number;
  reason: string;
  userId: UUID;
}

export type StockMovementType = 'sale' | 'return' | 'adjustment' | 'purchase';

export interface StockMovement {
  id: UUID;
  createdAt: ISODate;
  productId: UUID;
  productName: string;
  type: StockMovementType;
  quantity: number; // positivo entra, negativo sale
  resultingStock: number;
  reference?: string; // ej: nº de venta
  userId: UUID;
}

/* ---------------------------- Ajustes ------------------------------ */

export type TicketWidth = '58' | '80';

export interface Settings {
  storeName: string;
  legalName: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  ticketFooter: string;
  currency: string; // 'EUR'
  defaultIva: IvaRate;
  // --- Plantilla de ticket ---
  ticketWidth: TicketWidth; // 58mm o 80mm
  showTaxBreakdown: boolean; // mostrar desglose de IVA
  headerText: string; // texto bajo los datos de tienda
  returnPolicy: string; // política de devoluciones
  legalText: string; // mensaje legal (RGPD, etc.)
  logoUrl?: string; // data URL o ruta del logo
}
