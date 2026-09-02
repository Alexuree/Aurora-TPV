// =====================================================================
// Aurora TPV — Modelo de dominio (tipos compartidos)
// Framework-agnostic: no importa React ni Supabase.
// =====================================================================

export type UUID = string;
export type ISODate = string;

export type FiscalMode = 'no_verifactu' | 'verifactu';
export type InvoiceType = 'simplified' | 'complete';

/* ----------------------------- Usuarios ---------------------------- */

export type Role = 'admin' | 'manager' | 'cashier';

export type Permission =
  | 'sell'
  | 'apply_discount'
  | 'modify_price'
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
  imageUrl?: string;
  active: boolean;
  createdAt?: ISODate;
  updatedAt?: ISODate;
}

/** Registro de cambio de precio de un producto (historial). */
export interface ProductPriceChange {
  id: UUID;
  productId: UUID;
  oldPrice: number;
  newPrice: number;
  changedAt: ISODate;
}

/* ---------------------------- Clientes ----------------------------- */

export interface Customer {
  id: UUID;
  name: string;
  phone?: string;
  email?: string;
  taxId?: string; // NIF/CIF/NIE
  address?: string;
  postalCode?: string;
  city?: string;
  province?: string;
  country?: string;
  notes?: string;
  /** Baja lógica: no se borra para conservar el histórico de ventas. */
  active?: boolean;
  createdAt?: ISODate;
  updatedAt?: ISODate;
}

/**
 * Copia inmutable de los datos fiscales del cliente en el momento de la venta.
 * Garantiza que editar el cliente después NO altere tickets antiguos.
 */
export interface CustomerSnapshot {
  name: string;
  taxId?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  province?: string;
  country?: string;
  phone?: string;
  email?: string;
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

export type PaymentMethod = 'cash' | 'card';

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
  /** Datos fiscales del cliente congelados en el momento de la venta. */
  customerSnapshot?: CustomerSnapshot | null;
  note?: string;
  /** Estado de impresión del ticket. */
  printStatus?: 'pending' | 'printed' | 'failed';
  /** Versión de la plantilla con la que se generó el ticket. */
  ticketTemplateVersion?: number;
  /** Datos fiscales preparados para NO-VERIFACTU/VERI*FACTU. */
  invoiceType?: InvoiceType;
  series?: string;
  fiscalNumber?: string;
  fiscalMode?: FiscalMode;
  previousFiscalHash?: string | null;
  fiscalHash?: string;
  /** Solo modo Supabase offline: venta guardada temporalmente pendiente de envio. */
  syncStatus?: 'pending';
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
  reason?: string;
  originalTotal: number;
  paymentMethods: PaymentMethod[];
  cashSessionId: UUID | null;
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
  cardTotal?: number;
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
  returnPolicy: string;
  legalText: string; // mensaje legal (RGPD, etc.)
  logoUrl?: string; // data URL o ruta del logo
  fiscalMode: FiscalMode;
  simplifiedInvoiceSeries: string;
  completeInvoiceSeries: string;
  defaultInvoiceType: InvoiceType;
  enableFiscalQr: boolean;
}

export type AuditEventType =
  | 'sale_created'
  | 'sale_customer_assigned'
  | 'sale_cancelled'
  | 'cash_opened'
  | 'cash_closed'
  | 'discount_applied'
  | 'settings_updated'
  | 'backup_created'
  | 'user_updated'
  // --- Impresión térmica y cajón registrador ---
  | 'print_success'
  | 'print_failed'
  | 'reprint'
  | 'drawer_opened'
  | 'drawer_manual_open'
  | 'cash_in'
  | 'cash_out'
  | 'printer_config_changed'
  | 'drawer_pin_changed'
  | 'default_printer_changed'
  | 'cash_close_difference';

export interface AuditEvent {
  id: UUID;
  createdAt: ISODate;
  type: AuditEventType;
  userId?: UUID;
  userName?: string;
  entity?: string;
  entityId?: UUID;
  details?: Record<string, unknown>;
}

/* --------------------- Impresión térmica / cajón ------------------- */

/** Tipo de conexión física a la impresora térmica. */
export type PrinterConnectionType = 'usb' | 'network' | 'serial' | 'windows-printer';

/** Codificación de caracteres enviada a la impresora. */
export type PrinterEncoding = 'cp858' | 'wpc1252' | 'cp850' | 'utf8';

/** Pin del conector RJ11 del cajón (estándar ESC/POS). */
export type DrawerPin = 2 | 5;

/**
 * Configuración de la impresora térmica y del cajón. Una sola fila
 * (id 'default'). El proceso principal de Electron es STATELESS: el
 * renderer pasa esta config en cada llamada de impresión/cajón.
 */
export interface PrinterConfig {
  id: string; // 'default'
  connectionType: PrinterConnectionType;
  printerName?: string; // impresora de Windows (windows-printer/usb)
  ipAddress?: string; // impresora de red
  port?: number; // puerto de red (9100 por defecto)
  serialPort?: string; // 'COM1' (serie)
  baudRate?: number; // 9600 por defecto (serie)
  paperWidth: TicketWidth; // '58' | '80'
  encoding: PrinterEncoding;
  drawerPin: DrawerPin;
  autoCut: boolean;
  openDrawerOnCashSale: boolean;
  copies: number;
  printLogo: boolean;
  logoData?: string; // data URL o raster (opcional)
  printQr: boolean;
  footerLine: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type PrintJobType = 'ORIGINAL' | 'COPY' | 'TEST' | 'GIFT';
export type PrintJobStatus = 'SUCCESS' | 'FAILED' | 'PENDING';

/** Registro de cada intento de impresión (trazabilidad). */
export interface PrintJob {
  id: UUID;
  saleId?: UUID | null;
  receiptNumber?: number | null;
  type: PrintJobType;
  status: PrintJobStatus;
  errorMessage?: string;
  printedBy: UUID;
  printedAt: ISODate;
  copies: number;
}

export type CashDrawerEventType =
  | 'SALE_CASH'
  | 'REFUND_CASH'
  | 'MANUAL_OPEN'
  | 'CASH_IN'
  | 'CASH_OUT'
  | 'TEST_OPEN';

/** Registro de cada apertura/movimiento del cajón registrador. */
export interface CashDrawerEvent {
  id: UUID;
  sessionId?: UUID | null;
  userId: UUID;
  username: string;
  type: CashDrawerEventType;
  reason?: string;
  amount?: number;
  relatedSaleId?: UUID | null;
  createdAt: ISODate;
}
