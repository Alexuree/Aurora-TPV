// =====================================================================
// Implementación de Repository sobre Supabase (PostgreSQL).
// Las operaciones que deben ser atómicas (venta, devolución, cierre de
// caja) se delegan a funciones RPC del lado servidor (ver
// /supabase/migrations). El resto son consultas a tablas con RLS.
//
// NOTA: requiere crear el proyecto Supabase y ejecutar las migraciones.
// Hasta entonces la app funciona en modo local sin tocar este archivo.
// =====================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuditEvent,
  CashDrawerEvent,
  CashMovement,
  CashSession,
  Category,
  Customer,
  PrinterConfig,
  PrintJob,
  Product,
  ProductPriceChange,
  Sale,
  SaleCancellation,
  Settings,
  User,
  UUID,
} from '@/domain/types';
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
import { seedPrinterConfig, seedSettings } from '@/data/seed';
import {
  assignPendingSaleCustomer,
  enqueuePendingSale,
  getPendingSale,
  isConnectionError,
  listPendingSales,
  syncPendingOperations,
  updatePendingPrintStatus,
} from '@/data/supabase/pendingSync';

/* --------------------------- Mappers ------------------------------ */

/* eslint-disable @typescript-eslint/no-explicit-any */
const toProduct = (r: any): Product => ({
  id: r.id,
  name: r.name,
  brand: r.brand ?? undefined,
  sku: r.sku ?? undefined,
  barcode: r.barcode ?? undefined,
  categoryId: r.category_id ?? null,
  price: Number(r.price),
  cost: r.cost != null ? Number(r.cost) : undefined,
  ivaRate: Number(r.iva_rate) as Product['ivaRate'],
  taxIncluded: r.tax_included,
  imageUrl: r.image_url ?? undefined,
  active: r.active,
  createdAt: r.created_at ?? undefined,
  updatedAt: r.updated_at ?? undefined,
});

const fromProduct = (p: Product) => ({
  id: p.id || undefined,
  name: p.name,
  brand: p.brand ?? null,
  sku: p.sku ?? null,
  barcode: p.barcode ?? null,
  category_id: p.categoryId,
  price: p.price,
  cost: p.cost ?? null,
  iva_rate: p.ivaRate,
  tax_included: p.taxIncluded,
  image_url: p.imageUrl ?? null,
  active: p.active,
});

const toPriceChange = (r: any): ProductPriceChange => ({
  id: r.id,
  productId: r.product_id,
  oldPrice: Number(r.old_price),
  newPrice: Number(r.new_price),
  changedAt: r.changed_at,
});

const toCategory = (r: any): Category => ({
  id: r.id,
  name: r.name,
  color: r.color ?? undefined,
  sortOrder: Number(r.sort_order ?? 0),
  active: r.active,
});

const toUser = (r: any): User => ({
  id: r.id,
  username: r.username,
  fullName: r.full_name,
  role: r.role,
  active: r.active,
  createdAt: r.created_at ?? undefined,
});

const toCustomer = (r: any): Customer => ({
  id: r.id,
  name: r.name,
  phone: r.phone ?? undefined,
  email: r.email ?? undefined,
  taxId: r.tax_id ?? undefined,
  address: r.address ?? undefined,
  postalCode: r.postal_code ?? undefined,
  city: r.city ?? undefined,
  province: r.province ?? undefined,
  country: r.country ?? undefined,
  notes: r.notes ?? undefined,
  active: r.active ?? true,
  createdAt: r.created_at ?? undefined,
  updatedAt: r.updated_at ?? undefined,
});

const toSale = (r: any): Sale => ({
  id: r.id,
  number: Number(r.number),
  createdAt: r.created_at,
  cashierId: r.cashier_id,
  cashierName: r.cashier_name,
  cashSessionId: r.cash_session_id ?? null,
  customerId: r.customer_id ?? null,
  customerName: r.customer_name ?? 'Cliente mostrador',
  status: r.status,
  subtotal: Number(r.subtotal),
  taxTotal: Number(r.tax_total),
  discountTotal: Number(r.discount_total),
  total: Number(r.total),
  cashGiven: r.cash_given != null ? Number(r.cash_given) : undefined,
  changeGiven: r.change_given != null ? Number(r.change_given) : undefined,
  customerSnapshot: r.customer_snapshot ?? null,
  note: r.note ?? undefined,
  printStatus: r.print_status ?? undefined,
  ticketTemplateVersion: r.ticket_template_version ?? undefined,
  invoiceType: r.invoice_type ?? undefined,
  series: r.series ?? undefined,
  fiscalNumber: r.fiscal_number ?? undefined,
  fiscalMode: r.fiscal_mode ?? undefined,
  previousFiscalHash: r.previous_fiscal_hash ?? null,
  fiscalHash: r.fiscal_hash ?? undefined,
  items: (r.sale_items ?? []).map((i: any) => ({
    id: i.id,
    productId: i.product_id,
    name: i.name,
    quantity: Number(i.quantity),
    unitPrice: Number(i.unit_price),
    discountPct: Number(i.discount_pct),
    ivaRate: Number(i.iva_rate),
    taxBase: Number(i.tax_base),
    taxAmount: Number(i.tax_amount),
    lineTotal: Number(i.line_total),
    returnedQty: Number(i.returned_qty ?? 0),
  })),
  payments: (r.payments ?? []).map((p: any) => ({ method: p.method, amount: Number(p.amount) })),
});

const toCashSession = (r: any): CashSession => ({
  id: r.id,
  openedAt: r.opened_at,
  closedAt: r.closed_at ?? undefined,
  openedById: r.opened_by_id,
  openedByName: r.opened_by_name,
  closedById: r.closed_by_id ?? undefined,
  openingFloat: Number(r.opening_float),
  status: r.status,
  countedCash: r.counted_cash != null ? Number(r.counted_cash) : undefined,
  expectedCash: r.expected_cash != null ? Number(r.expected_cash) : undefined,
  difference: r.difference != null ? Number(r.difference) : undefined,
  salesTotal: r.sales_total != null ? Number(r.sales_total) : undefined,
  cardTotal: r.card_total != null ? Number(r.card_total) : undefined,
  cancellationsTotal: r.cancellations_total != null ? Number(r.cancellations_total) : undefined,
  note: r.note ?? undefined,
});

const toCashMovement = (r: any): CashMovement => ({
  id: r.id,
  cashSessionId: r.cash_session_id,
  createdAt: r.created_at,
  type: r.type,
  amount: Number(r.amount),
  reason: r.reason,
  userId: r.user_id,
});

const toCancellation = (r: any): SaleCancellation => ({
  id: r.id,
  saleId: r.sale_id,
  saleNumber: Number(r.sale_number),
  createdAt: r.created_at,
  cancelledById: r.cancelled_by_id,
  cancelledByName: r.cancelled_by_name,
  reason: r.reason,
  originalTotal: Number(r.original_total),
  paymentMethods: r.payment_methods ?? [],
  cashSessionId: r.cash_session_id ?? null,
});

const toPrinterConfig = (r: any): PrinterConfig => ({
  id: r.id,
  connectionType: r.connection_type,
  printerName: r.printer_name ?? undefined,
  ipAddress: r.ip_address ?? undefined,
  port: r.port != null ? Number(r.port) : undefined,
  serialPort: r.serial_port ?? undefined,
  baudRate: r.baud_rate != null ? Number(r.baud_rate) : undefined,
  paperWidth: (r.paper_width as PrinterConfig['paperWidth']) ?? '80',
  encoding: (r.encoding as PrinterConfig['encoding']) ?? 'cp858',
  drawerPin: Number(r.drawer_pin) === 5 ? 5 : 2,
  autoCut: r.auto_cut ?? true,
  openDrawerOnCashSale: r.open_drawer_on_cash_sale ?? true,
  copies: Number(r.copies ?? 1),
  printLogo: r.print_logo ?? false,
  logoData: r.logo_data ?? undefined,
  printQr: r.print_qr ?? true,
  footerLine: r.footer_line ?? true,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const fromPrinterConfig = (c: PrinterConfig) => ({
  id: c.id || 'default',
  connection_type: c.connectionType,
  printer_name: c.printerName ?? null,
  ip_address: c.ipAddress ?? null,
  port: c.port ?? 9100,
  serial_port: c.serialPort ?? null,
  baud_rate: c.baudRate ?? 9600,
  paper_width: c.paperWidth,
  encoding: c.encoding,
  drawer_pin: c.drawerPin,
  auto_cut: c.autoCut,
  open_drawer_on_cash_sale: c.openDrawerOnCashSale,
  copies: c.copies,
  print_logo: c.printLogo,
  logo_data: c.logoData ?? null,
  print_qr: c.printQr,
  footer_line: c.footerLine,
  updated_at: new Date().toISOString(),
});

const toPrintJob = (r: any): PrintJob => ({
  id: r.id,
  saleId: r.sale_id ?? null,
  receiptNumber: r.receipt_number != null ? Number(r.receipt_number) : null,
  type: r.type,
  status: r.status,
  errorMessage: r.error_message ?? undefined,
  printedBy: r.printed_by,
  printedAt: r.printed_at,
  copies: Number(r.copies ?? 1),
});

const toCashDrawerEvent = (r: any): CashDrawerEvent => ({
  id: r.id,
  sessionId: r.session_id ?? null,
  userId: r.user_id,
  username: r.username,
  type: r.type,
  reason: r.reason ?? undefined,
  amount: r.amount != null ? Number(r.amount) : undefined,
  relatedSaleId: r.related_sale_id ?? null,
  createdAt: r.created_at,
});

const toAuditEvent = (r: any): AuditEvent => ({
  id: r.id,
  createdAt: r.created_at,
  type: r.type,
  userId: r.user_id ?? undefined,
  userName: r.user_name ?? undefined,
  entity: r.entity ?? undefined,
  entityId: r.entity_id ?? undefined,
  details: r.details ?? undefined,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

function guard<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data as T;
}

/* --------------------------- Repository --------------------------- */

export class SupabaseRepository implements Repository {
  readonly mode = 'supabase' as const;
  constructor(private sb: SupabaseClient) {
    if (typeof window !== 'undefined') {
      void syncPendingOperations(this.sb);
      window.addEventListener('online', () => void syncPendingOperations(this.sb));
    }
  }

  async login(username: string, pin: string): Promise<User | null> {
    // En modo Supabase, username = email y pin = contraseña.
    const { data, error } = await this.sb.auth.signInWithPassword({ email: username, password: pin });
    if (error || !data.user) return null;
    const { data: profile } = await this.sb.from('profiles').select('*').eq('id', data.user.id).single();
    return profile ? toUser(profile) : null;
  }

  async listUsers(): Promise<User[]> {
    const { data, error } = await this.sb.from('profiles').select('*').order('full_name');
    return guard(data, error).map(toUser);
  }
  async saveUser(user: User): Promise<User> {
    let id = user.id;
    if (!id) {
      const password = user.pin?.trim();
      if (!password || password.length < 6) throw new Error('Indica una contraseña de al menos 6 caracteres');
      const { data: auth, error: authError } = await this.sb.auth.signUp({
        email: user.username,
        password,
        options: { data: { full_name: user.fullName, role: user.role } },
      });
      if (authError) throw new Error(authError.message);
      id = auth.user?.id ?? '';
      if (!id) throw new Error('No se pudo crear el usuario de autenticación');
    }
    const row = { id, username: user.username, full_name: user.fullName, role: user.role, active: user.active };
    const { data, error } = await this.sb.from('profiles').upsert(row).select().single();
    return toUser(guard(data, error));
  }
  async deleteUser(id: UUID): Promise<void> {
    const { error } = await this.sb.from('profiles').update({ active: false }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async listCategories(): Promise<Category[]> {
    const { data, error } = await this.sb.from('categories').select('*').eq('active', true).order('sort_order');
    return guard(data, error).map(toCategory);
  }
  async saveCategory(cat: Category): Promise<Category> {
    const row = { id: cat.id || undefined, name: cat.name, color: cat.color ?? null, sort_order: cat.sortOrder, active: cat.active !== false };
    const { data, error } = await this.sb.from('categories').upsert(row).select().single();
    return toCategory(guard(data, error));
  }
  async deleteCategory(id: UUID): Promise<void> {
    const { error } = await this.sb.from('categories').update({ active: false }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async listProducts(): Promise<Product[]> {
    const { data, error } = await this.sb.from('products').select('*').order('name');
    return guard(data, error).map(toProduct);
  }
  async getProductByCode(code: string): Promise<Product | null> {
    const { data, error } = await this.sb
      .from('products')
      .select('*')
      .or(`barcode.eq.${code},sku.eq.${code}`)
      .eq('active', true)
      .limit(1);
    if (error) throw new Error(error.message);
    return data && data[0] ? toProduct(data[0]) : null;
  }
  async saveProduct(p: Product): Promise<Product> {
    const { data, error } = await this.sb.from('products').upsert(fromProduct(p)).select().single();
    return toProduct(guard(data, error));
  }
  async deleteProduct(id: UUID): Promise<void> {
    const { error } = await this.sb.from('products').update({ active: false }).eq('id', id);
    if (error) throw new Error(error.message);
  }
  async listPriceHistory(productId: UUID): Promise<ProductPriceChange[]> {
    const { data, error } = await this.sb
      .from('product_price_history')
      .select('*')
      .eq('product_id', productId)
      .order('changed_at', { ascending: false });
    return guard(data, error).map(toPriceChange);
  }

  async listCustomers(): Promise<Customer[]> {
    const { data, error } = await this.sb.from('customers').select('*').order('name');
    return guard(data, error).map(toCustomer);
  }
  async saveCustomer(c: Customer): Promise<Customer> {
    const row = {
      id: c.id || undefined,
      name: c.name,
      phone: c.phone ?? null,
      email: c.email ?? null,
      tax_id: c.taxId ?? null,
      address: c.address ?? null,
      postal_code: c.postalCode ?? null,
      city: c.city ?? null,
      province: c.province ?? null,
      country: c.country ?? null,
      notes: c.notes ?? null,
      active: c.active ?? true,
    };
    const { data, error } = await this.sb.from('customers').upsert(row).select().single();
    return toCustomer(guard(data, error));
  }
  async deleteCustomer(id: UUID): Promise<void> {
    const { error } = await this.sb.from('customers').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async processSale(input: ProcessSaleInput): Promise<Sale> {
    let saleId: string | undefined;
    try {
      await syncPendingOperations(this.sb);
      const { data, error } = await this.sb.rpc('process_sale', { payload: input });
      if (error) throw new Error(error.message);
      saleId = typeof data === 'string' ? data : data?.id;
    } catch (error) {
      if (!isConnectionError(error)) throw error;
      return enqueuePendingSale(input, error);
    }
    if (!saleId) throw new Error('Venta creada, pero Supabase no devolvio el identificador');
    const sale = await this.getSale(saleId);
    if (!sale) throw new Error('Venta creada, pero no se pudo recuperar el ticket');
    return sale;
  }

  async listSales(filter?: SalesFilter): Promise<Sale[]> {
    const pendingSales = listPendingSales().filter((sale) => {
      if (filter?.from && sale.createdAt < filter.from) return false;
      if (filter?.to && sale.createdAt > filter.to) return false;
      if (filter?.cashierId && sale.cashierId !== filter.cashierId) return false;
      if (filter?.status && sale.status !== filter.status) return false;
      return true;
    });
    try {
      await syncPendingOperations(this.sb);
      let q = this.sb.from('sales').select('*, sale_items(*), payments(*)').order('number', { ascending: false });
      if (filter?.from) q = q.gte('created_at', filter.from);
      if (filter?.to) q = q.lte('created_at', filter.to);
      if (filter?.cashierId) q = q.eq('cashier_id', filter.cashierId);
      if (filter?.status) q = q.eq('status', filter.status);
      const { data, error } = await q;
      const syncedSales = guard(data, error).map(toSale);
      return [...pendingSales, ...syncedSales].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (error) {
      if (isConnectionError(error)) return pendingSales;
      throw error;
    }
  }
  async getSale(id: UUID): Promise<Sale | null> {
    const pending = getPendingSale(id);
    if (pending) return pending;
    const { data, error } = await this.sb.from('sales').select('*, sale_items(*), payments(*)').eq('id', id).single();
    if (error) return null;
    return data ? toSale(data) : null;
  }
  async assignSaleCustomer(input: AssignSaleCustomerInput): Promise<Sale> {
    const pending = assignPendingSaleCustomer(input);
    if (pending) return pending;
    const { data, error } = await this.sb.rpc('assign_sale_customer', { payload: input });
    if (error) throw new Error(error.message);
    const saleId = typeof data === 'string' ? data : data?.id;
    const sale = await this.getSale(saleId);
    if (!sale) throw new Error('No se pudo recuperar la venta actualizada');
    return sale;
  }
  async setSalePrintStatus(saleId: UUID, status: 'pending' | 'printed' | 'failed'): Promise<void> {
    if (updatePendingPrintStatus(saleId, status)) return;
    const { error } = await this.sb.from('sales').update({ print_status: status }).eq('id', saleId);
    if (error) throw new Error(error.message);
  }

  async cancelSale(input: CancelSaleInput): Promise<SaleCancellation> {
    const { data, error } = await this.sb.rpc('cancel_sale', {
      p_sale_id: input.saleId,
      p_user_id: input.userId,
      p_user_name: input.userName,
    });
    if (error) throw new Error(error.message);
    const id = typeof data === 'string' ? data : data?.id;
    const { data: row, error: e2 } = await this.sb
      .from('sale_cancellations')
      .select('*')
      .eq('id', id)
      .single();
    return toCancellation(guard(row, e2));
  }
  async listCancellations(): Promise<SaleCancellation[]> {
    const { data, error } = await this.sb
      .from('sale_cancellations')
      .select('*')
      .order('created_at', { ascending: false });
    return guard(data, error).map(toCancellation);
  }

  async getOpenCashSession(): Promise<CashSession | null> {
    const { data, error } = await this.sb.from('cash_sessions').select('*').eq('status', 'open').limit(1);
    if (error) throw new Error(error.message);
    return data && data[0] ? toCashSession(data[0]) : null;
  }
  async openCashSession(input: OpenCashInput): Promise<CashSession> {
    const row = { opened_by_id: input.userId, opened_by_name: input.userName, opening_float: input.openingFloat, status: 'open', note: input.note ?? null };
    const { data, error } = await this.sb.from('cash_sessions').insert(row).select().single();
    return toCashSession(guard(data, error));
  }
  async closeCashSession(input: CloseCashInput): Promise<CashSession> {
    const { data, error } = await this.sb.rpc('close_cash_session', {
      p_session_id: input.sessionId,
      p_user_id: input.userId,
      p_counted_cash: input.countedCash,
      p_note: input.note ?? null,
    });
    if (error) throw new Error(error.message);
    return toCashSession(data);
  }
  async listCashSessions(): Promise<CashSession[]> {
    const { data, error } = await this.sb.from('cash_sessions').select('*').order('opened_at', { ascending: false });
    return guard(data, error).map(toCashSession);
  }
  async addCashMovement(input: CashMovementInput): Promise<CashMovement> {
    const row = { cash_session_id: input.cashSessionId, type: input.type, amount: input.amount, reason: input.reason, user_id: input.userId };
    const { data, error } = await this.sb.from('cash_movements').insert(row).select().single();
    const mv = toCashMovement(guard(data, error));
    // Rastro de cajón + auditoría (inserción cliente; tablas con RLS authenticated).
    await this.sb.from('cash_drawer_events').insert({
      session_id: input.cashSessionId,
      user_id: input.userId,
      username: input.userName ?? '',
      type: input.type === 'in' ? 'CASH_IN' : 'CASH_OUT',
      reason: input.reason,
      amount: input.amount,
    });
    await this.insertAudit(input.type === 'in' ? 'cash_in' : 'cash_out', { userId: input.userId, userName: input.userName }, 'cash_session', input.cashSessionId, { amount: input.amount, reason: input.reason });
    return mv;
  }
  async listCashMovements(sessionId: UUID): Promise<CashMovement[]> {
    const { data, error } = await this.sb.from('cash_movements').select('*').eq('cash_session_id', sessionId).order('created_at', { ascending: false });
    return guard(data, error).map(toCashMovement);
  }

  async getSettings(): Promise<Settings> {
    const { data, error } = await this.sb.from('settings').select('*').eq('id', 1).single();
    if (error || !data) return seedSettings;
    return {
      storeName: data.store_name,
      legalName: data.legal_name,
      taxId: data.tax_id,
      address: data.address,
      phone: data.phone,
      email: data.email,
      ticketFooter: data.ticket_footer,
      currency: data.currency,
      defaultIva: data.default_iva,
      ticketWidth: (data.ticket_width as Settings['ticketWidth']) ?? '80',
      showTaxBreakdown: data.show_tax_breakdown ?? true,
      headerText: data.header_text ?? '',
      returnPolicy: data.return_policy ?? '',
      legalText: data.legal_text ?? '',
      logoUrl: data.logo_url ?? undefined,
      fiscalMode: data.fiscal_mode ?? 'no_verifactu',
      simplifiedInvoiceSeries: data.simplified_invoice_series ?? 'FS',
      completeInvoiceSeries: data.complete_invoice_series ?? 'FC',
      defaultInvoiceType: data.default_invoice_type ?? 'simplified',
      enableFiscalQr: data.enable_fiscal_qr ?? true,
    };
  }
  async saveSettings(s: Settings): Promise<Settings> {
    const row = {
      id: 1,
      store_name: s.storeName,
      legal_name: s.legalName,
      tax_id: s.taxId,
      address: s.address,
      phone: s.phone,
      email: s.email,
      ticket_footer: s.ticketFooter,
      currency: s.currency,
      default_iva: s.defaultIva,
      ticket_width: s.ticketWidth,
      show_tax_breakdown: s.showTaxBreakdown,
      header_text: s.headerText,
      return_policy: s.returnPolicy,
      legal_text: s.legalText,
      logo_url: s.logoUrl ?? null,
      fiscal_mode: s.fiscalMode,
      simplified_invoice_series: s.simplifiedInvoiceSeries,
      complete_invoice_series: s.completeInvoiceSeries,
      default_invoice_type: s.defaultInvoiceType,
      enable_fiscal_qr: s.enableFiscalQr,
    };
    const { error } = await this.sb.from('settings').upsert(row);
    if (error) throw new Error(error.message);
    return s;
  }

  /* ------------------- Impresora térmica / cajón ------------------ */
  async getPrinterConfig(): Promise<PrinterConfig> {
    const { data, error } = await this.sb.from('printer_config').select('*').eq('id', 'default').maybeSingle();
    if (error || !data) {
      const now = new Date().toISOString();
      return { ...seedPrinterConfig, createdAt: now, updatedAt: now };
    }
    return toPrinterConfig(data);
  }

  async savePrinterConfig(cfg: PrinterConfig, actor?: ActorContext): Promise<PrinterConfig> {
    const prev = await this.getPrinterConfig().catch(() => null);
    const { data, error } = await this.sb.from('printer_config').upsert(fromPrinterConfig(cfg)).select().single();
    const saved = toPrinterConfig(guard(data, error));
    await this.insertAudit('printer_config_changed', actor, 'printer_config', null, {
      connectionType: saved.connectionType, printerName: saved.printerName, paperWidth: saved.paperWidth,
    });
    if (prev && prev.drawerPin !== saved.drawerPin) {
      await this.insertAudit('drawer_pin_changed', actor, 'printer_config', null, { from: prev.drawerPin, to: saved.drawerPin });
    }
    if (prev && prev.printerName !== saved.printerName) {
      await this.insertAudit('default_printer_changed', actor, 'printer_config', null, { from: prev.printerName, to: saved.printerName });
    }
    return saved;
  }

  async recordPrintJob(input: RecordPrintJobInput): Promise<PrintJob> {
    const row = {
      sale_id: input.saleId ?? null,
      receipt_number: input.receiptNumber ?? null,
      type: input.type,
      status: input.status,
      error_message: input.errorMessage ?? null,
      printed_by: input.printedBy,
      copies: input.copies ?? 1,
    };
    const { data, error } = await this.sb.from('print_jobs').insert(row).select().single();
    const job = toPrintJob(guard(data, error));
    const auditType = input.type === 'COPY' ? 'reprint' : input.status === 'SUCCESS' ? 'print_success' : input.status === 'FAILED' ? 'print_failed' : null;
    if (auditType) {
      await this.insertAudit(auditType, { userId: input.printedBy }, 'sale', input.saleId ?? null, {
        type: input.type, receiptNumber: input.receiptNumber, error: input.errorMessage,
      });
    }
    return job;
  }

  async listPrintJobs(saleId?: UUID): Promise<PrintJob[]> {
    let q = this.sb.from('print_jobs').select('*').order('printed_at', { ascending: false });
    if (saleId) q = q.eq('sale_id', saleId);
    const { data, error } = await q;
    return guard(data, error).map(toPrintJob);
  }

  async recordCashDrawerEvent(input: RecordCashDrawerEventInput): Promise<CashDrawerEvent> {
    const row = {
      session_id: input.sessionId ?? null,
      user_id: input.userId,
      username: input.username,
      type: input.type,
      reason: input.reason ?? null,
      amount: input.amount ?? null,
      related_sale_id: input.relatedSaleId ?? null,
    };
    const { data, error } = await this.sb.from('cash_drawer_events').insert(row).select().single();
    const ev = toCashDrawerEvent(guard(data, error));
    const auditType = input.type === 'MANUAL_OPEN' ? 'drawer_manual_open'
      : (input.type === 'SALE_CASH' || input.type === 'TEST_OPEN' || input.type === 'REFUND_CASH') ? 'drawer_opened'
      : null;
    if (auditType) {
      await this.insertAudit(auditType, { userId: input.userId, userName: input.username }, 'cash_drawer', input.relatedSaleId ?? input.sessionId ?? null, {
        drawerEvent: input.type, reason: input.reason, amount: input.amount,
      });
    }
    return ev;
  }

  async listCashDrawerEvents(sessionId?: UUID): Promise<CashDrawerEvent[]> {
    let q = this.sb.from('cash_drawer_events').select('*').order('created_at', { ascending: false });
    if (sessionId) q = q.eq('session_id', sessionId);
    const { data, error } = await q;
    return guard(data, error).map(toCashDrawerEvent);
  }

  async listAuditEvents(filter?: AuditFilter): Promise<AuditEvent[]> {
    let q = this.sb.from('audit_events').select('*').order('created_at', { ascending: false });
    if (filter?.type) q = q.eq('type', filter.type);
    if (filter?.userId) q = q.eq('user_id', filter.userId);
    if (filter?.entity) q = q.eq('entity', filter.entity);
    if (filter?.entityId) q = q.eq('entity_id', filter.entityId);
    if (filter?.from) q = q.gte('created_at', filter.from);
    if (filter?.to) q = q.lte('created_at', filter.to);
    q = q.limit(filter?.limit ?? 500);
    const { data, error } = await q;
    return guard(data, error).map(toAuditEvent);
  }

  private async insertAudit(
    type: string,
    actor: ActorContext | undefined,
    entity: string,
    entityId: string | null,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.sb.from('audit_events').insert({
      type,
      user_id: actor?.userId ?? null,
      user_name: actor?.userName ?? null,
      entity,
      entity_id: entityId,
      details,
    });
  }
}
