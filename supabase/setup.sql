-- ============================================================
-- Aurora TPV — INSTALACIÓN COMPLETA (esquema + migraciones + datos)
-- Pega TODO este archivo en Supabase → SQL Editor → Run
-- ============================================================

-- ============ migrations/0001_initial_schema.sql ============
-- =====================================================================
-- Aurora TPV — Esquema inicial (PostgreSQL / Supabase)
-- Ejecuta este archivo en el SQL Editor de Supabase (o con la CLI).
-- Incluye: tablas, relaciones, RLS y funciones RPC transaccionales.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Catálogos de roles y permisos (referencia / auditable)
-- ---------------------------------------------------------------------
create table if not exists roles (
  code text primary key,
  name text not null
);

create table if not exists permissions (
  code text primary key,
  name text not null
);

create table if not exists role_permissions (
  role_code text references roles(code) on delete cascade,
  permission_code text references permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

-- ---------------------------------------------------------------------
-- Perfiles de usuario (1:1 con auth.users de Supabase)
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  full_name text not null,
  role text not null references roles(code) default 'cashier',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Categorías y productos
-- ---------------------------------------------------------------------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text,
  sort_order int not null default 0,
  active boolean not null default true
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  sku text,
  barcode text,
  category_id uuid references categories(id) on delete set null,
  price numeric(10,2) not null default 0,
  cost numeric(10,2),
  iva_rate int not null default 21,
  tax_included boolean not null default true,
  stock numeric(10,2) not null default 0,
  track_stock boolean not null default true,
  low_stock_threshold int not null default 3,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_products_barcode on products(barcode);
create index if not exists idx_products_sku on products(sku);
create index if not exists idx_products_category on products(category_id);

-- ---------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  tax_id text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Caja
-- ---------------------------------------------------------------------
create table if not exists cash_sessions (
  id uuid primary key default gen_random_uuid(),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_by_id uuid not null,
  opened_by_name text not null,
  closed_by_id uuid,
  opening_float numeric(10,2) not null default 0,
  status text not null default 'open' check (status in ('open','closed')),
  counted_cash numeric(10,2),
  expected_cash numeric(10,2),
  difference numeric(10,2),
  note text
);
-- Solo puede haber una caja abierta a la vez
create unique index if not exists uniq_open_cash on cash_sessions(status) where status = 'open';

create table if not exists cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references cash_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  type text not null check (type in ('in','out')),
  amount numeric(10,2) not null,
  reason text not null,
  user_id uuid not null
);

-- ---------------------------------------------------------------------
-- Ventas
-- ---------------------------------------------------------------------
create sequence if not exists sale_number_seq start 1001;
create sequence if not exists return_number_seq start 501;

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique,
  created_at timestamptz not null default now(),
  cashier_id uuid not null,
  cashier_name text not null,
  cash_session_id uuid references cash_sessions(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  customer_name text not null default 'Cliente mostrador',
  status text not null default 'completed'
    check (status in ('completed','cancelled','returned','partially_returned')),
  subtotal numeric(10,2) not null,
  tax_total numeric(10,2) not null,
  discount_total numeric(10,2) not null,
  total numeric(10,2) not null,
  cash_given numeric(10,2),
  change_given numeric(10,2),
  note text
);
create index if not exists idx_sales_created on sales(created_at);
create index if not exists idx_sales_session on sales(cash_session_id);

create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid not null,
  name text not null,
  quantity numeric(10,2) not null,
  unit_price numeric(10,2) not null,
  discount_pct numeric(5,2) not null default 0,
  iva_rate int not null,
  tax_base numeric(10,2) not null,
  tax_amount numeric(10,2) not null,
  line_total numeric(10,2) not null,
  returned_qty numeric(10,2) not null default 0
);
create index if not exists idx_sale_items_sale on sale_items(sale_id);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  method text not null check (method in ('cash','card','bizum')),
  amount numeric(10,2) not null
);
create index if not exists idx_payments_sale on payments(sale_id);

-- ---------------------------------------------------------------------
-- Devoluciones
-- ---------------------------------------------------------------------
create table if not exists sale_returns (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique,
  sale_id uuid not null references sales(id) on delete cascade,
  sale_number bigint not null,
  created_at timestamptz not null default now(),
  cashier_id uuid not null,
  cashier_name text not null,
  reason text not null,
  refund_method text not null check (refund_method in ('cash','card','bizum')),
  total numeric(10,2) not null,
  restock boolean not null default true
);

create table if not exists return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references sale_returns(id) on delete cascade,
  sale_item_id uuid not null,
  product_id uuid not null,
  name text not null,
  quantity numeric(10,2) not null,
  refund_amount numeric(10,2) not null
);

-- ---------------------------------------------------------------------
-- Inventario (movimientos)
-- ---------------------------------------------------------------------
create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  product_id uuid not null,
  product_name text not null,
  type text not null check (type in ('sale','return','adjustment','purchase')),
  quantity numeric(10,2) not null,
  resulting_stock numeric(10,2) not null,
  reference text,
  user_id uuid not null
);
create index if not exists idx_stock_product on stock_movements(product_id);

-- ---------------------------------------------------------------------
-- Ajustes (fila única)
-- ---------------------------------------------------------------------
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  store_name text not null,
  legal_name text not null,
  tax_id text not null,
  address text not null,
  phone text not null,
  email text not null,
  ticket_footer text not null,
  currency text not null default 'EUR',
  default_iva int not null default 21
);

-- =====================================================================
-- Trigger: crear perfil al registrar un usuario en Supabase Auth
-- =====================================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username, full_name, role)
  values (
    new.id,
    coalesce(new.email, new.id::text),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'role', 'cashier')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =====================================================================
-- RPC: process_sale — crea venta + líneas + pagos y descuenta stock
-- =====================================================================
create or replace function process_sale(payload jsonb)
returns uuid language plpgsql security definer as $$
declare
  v_sale_id uuid := gen_random_uuid();
  v_number bigint := nextval('sale_number_seq');
  v_line jsonb;
  v_pay jsonb;
  v_prod products%rowtype;
  v_qty numeric;
  v_new_stock numeric;
begin
  insert into sales(id, number, cashier_id, cashier_name, cash_session_id, customer_id,
    customer_name, status, subtotal, tax_total, discount_total, total, cash_given, change_given, note)
  values (
    v_sale_id, v_number,
    (payload->>'cashierId')::uuid, payload->>'cashierName',
    nullif(payload->>'cashSessionId','')::uuid,
    nullif(payload->>'customerId','')::uuid,
    coalesce(payload->>'customerName','Cliente mostrador'),
    'completed',
    (payload->>'subtotal')::numeric, (payload->>'taxTotal')::numeric,
    (payload->>'discountTotal')::numeric, (payload->>'total')::numeric,
    nullif(payload->>'cashGiven','')::numeric, nullif(payload->>'changeGiven','')::numeric,
    nullif(payload->>'note','')
  );

  for v_line in select * from jsonb_array_elements(payload->'lines') loop
    insert into sale_items(sale_id, product_id, name, quantity, unit_price, discount_pct,
      iva_rate, tax_base, tax_amount, line_total)
    values (v_sale_id, (v_line->>'productId')::uuid, v_line->>'name',
      (v_line->>'quantity')::numeric, (v_line->>'unitPrice')::numeric, (v_line->>'discountPct')::numeric,
      (v_line->>'ivaRate')::int, (v_line->>'taxBase')::numeric, (v_line->>'taxAmount')::numeric,
      (v_line->>'lineTotal')::numeric);

    select * into v_prod from products where id = (v_line->>'productId')::uuid;
    if found and v_prod.track_stock then
      v_qty := (v_line->>'quantity')::numeric;
      v_new_stock := v_prod.stock - v_qty;
      update products set stock = v_new_stock, updated_at = now() where id = v_prod.id;
      insert into stock_movements(product_id, product_name, type, quantity, resulting_stock, reference, user_id)
      values (v_prod.id, v_prod.name, 'sale', -v_qty, v_new_stock, 'Venta #'||v_number, (payload->>'cashierId')::uuid);
    end if;
  end loop;

  for v_pay in select * from jsonb_array_elements(payload->'payments') loop
    insert into payments(sale_id, method, amount)
    values (v_sale_id, v_pay->>'method', (v_pay->>'amount')::numeric);
  end loop;

  return v_sale_id;
end; $$;

-- =====================================================================
-- RPC: process_return — registra devolución y reintegra stock
-- =====================================================================
create or replace function process_return(payload jsonb)
returns uuid language plpgsql security definer as $$
declare
  v_ret_id uuid := gen_random_uuid();
  v_number bigint := nextval('return_number_seq');
  v_sale sales%rowtype;
  v_item jsonb;
  v_restock boolean := coalesce((payload->>'restock')::boolean, false);
  v_prod products%rowtype;
  v_qty numeric;
  v_new_stock numeric;
  v_all boolean;
begin
  select * into v_sale from sales where id = (payload->>'saleId')::uuid;

  insert into sale_returns(id, number, sale_id, sale_number, cashier_id, cashier_name,
    reason, refund_method, total, restock)
  values (v_ret_id, v_number, v_sale.id, v_sale.number, (payload->>'cashierId')::uuid,
    payload->>'cashierName', payload->>'reason', payload->>'refundMethod',
    (payload->>'total')::numeric, v_restock);

  for v_item in select * from jsonb_array_elements(payload->'items') loop
    insert into return_items(return_id, sale_item_id, product_id, name, quantity, refund_amount)
    values (v_ret_id, (v_item->>'saleItemId')::uuid, (v_item->>'productId')::uuid,
      v_item->>'name', (v_item->>'quantity')::numeric, (v_item->>'refundAmount')::numeric);

    update sale_items set returned_qty = returned_qty + (v_item->>'quantity')::numeric
      where id = (v_item->>'saleItemId')::uuid;

    if v_restock then
      select * into v_prod from products where id = (v_item->>'productId')::uuid;
      if found and v_prod.track_stock then
        v_qty := (v_item->>'quantity')::numeric;
        v_new_stock := v_prod.stock + v_qty;
        update products set stock = v_new_stock, updated_at = now() where id = v_prod.id;
        insert into stock_movements(product_id, product_name, type, quantity, resulting_stock, reference, user_id)
        values (v_prod.id, v_prod.name, 'return', v_qty, v_new_stock, 'Devolución #'||v_number, (payload->>'cashierId')::uuid);
      end if;
    end if;
  end loop;

  select bool_and(returned_qty >= quantity) into v_all from sale_items where sale_id = v_sale.id;
  update sales set status = case when v_all then 'returned' else 'partially_returned' end
    where id = v_sale.id;

  return v_ret_id;
end; $$;

-- =====================================================================
-- RPC: close_cash_session — calcula efectivo previsto y descuadre
-- =====================================================================
create or replace function close_cash_session(p_session_id uuid, p_user_id uuid, p_counted_cash numeric, p_note text)
returns cash_sessions language plpgsql security definer as $$
declare
  v_session cash_sessions%rowtype;
  v_cash_sales numeric;
  v_cash_in numeric;
  v_cash_out numeric;
  v_refunds numeric;
  v_expected numeric;
begin
  select * into v_session from cash_sessions where id = p_session_id;

  select coalesce(sum(p.amount),0) into v_cash_sales
    from payments p join sales s on s.id = p.sale_id
    where s.cash_session_id = p_session_id and p.method = 'cash' and s.status <> 'cancelled';
  select coalesce(sum(amount),0) into v_cash_in from cash_movements where cash_session_id = p_session_id and type = 'in';
  select coalesce(sum(amount),0) into v_cash_out from cash_movements where cash_session_id = p_session_id and type = 'out';
  select coalesce(sum(r.total),0) into v_refunds from sale_returns r join sales s on s.id = r.sale_id
    where s.cash_session_id = p_session_id and r.refund_method = 'cash';

  v_expected := v_session.opening_float + v_cash_sales + v_cash_in - v_cash_out - v_refunds;

  update cash_sessions
    set status = 'closed', closed_at = now(), closed_by_id = p_user_id,
        counted_cash = p_counted_cash, expected_cash = v_expected,
        difference = p_counted_cash - v_expected, note = coalesce(p_note, note)
    where id = p_session_id
    returning * into v_session;

  return v_session;
end; $$;

-- =====================================================================
-- RPC: adjust_stock — ajuste manual con registro de movimiento
-- =====================================================================
create or replace function adjust_stock(p_product_id uuid, p_new_stock numeric, p_reason text, p_user_id uuid)
returns void language plpgsql security definer as $$
declare v_prod products%rowtype; v_delta numeric;
begin
  select * into v_prod from products where id = p_product_id;
  v_delta := p_new_stock - v_prod.stock;
  update products set stock = p_new_stock, updated_at = now() where id = p_product_id;
  insert into stock_movements(product_id, product_name, type, quantity, resulting_stock, reference, user_id)
  values (p_product_id, v_prod.name, 'adjustment', v_delta, p_new_stock, p_reason, p_user_id);
end; $$;

-- =====================================================================
-- Row Level Security
-- Política base: cualquier usuario autenticado (personal de la tienda)
-- puede operar. Endurece según necesidades (p.ej. limitar profiles a
-- administradores) en una migración posterior.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['profiles','categories','products','customers','cash_sessions',
    'cash_movements','sales','sale_items','payments','sale_returns','return_items',
    'stock_movements','settings','roles','permissions','role_permissions']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists p_all_%1$s on %1$s;', t);
    execute format(
      'create policy p_all_%1$s on %1$s for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;


-- ============ migrations/0002_ticket_and_printing.sql ============
-- =====================================================================
-- Aurora TPV — Migración 0002: plantilla de ticket e impresión
-- Compatible con datos existentes (columnas con DEFAULT).
-- =====================================================================

-- Configuración de la plantilla de ticket
alter table settings
  add column if not exists ticket_width text not null default '80' check (ticket_width in ('58','80')),
  add column if not exists show_tax_breakdown boolean not null default true,
  add column if not exists header_text text not null default '',
  add column if not exists return_policy text not null default '',
  add column if not exists legal_text text not null default '',
  add column if not exists logo_url text;

-- Estado de impresión y versión de plantilla por venta
alter table sales
  add column if not exists print_status text not null default 'pending'
    check (print_status in ('pending','printed','failed')),
  add column if not exists ticket_template_version int not null default 1;

-- process_sale debe marcar la venta como pendiente de imprimir (ya por defecto)
-- y registrar la versión de plantilla. No requiere cambios: los DEFAULT aplican.


-- ============ migrations/0003_ticket_cancellation.sql ============
-- =====================================================================
-- Aurora TPV — Migración 0003: anulación segura de tickets
-- El ticket original se conserva (status='cancelled'); se crea un
-- registro de anulación con trazabilidad. El cierre de caja ya excluye
-- las ventas anuladas (ver close_cash_session en 0001).
-- =====================================================================

create table if not exists sale_cancellations (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  sale_number bigint not null,
  created_at timestamptz not null default now(),
  cancelled_by_id uuid not null,
  cancelled_by_name text not null,
  reason text not null,
  original_total numeric(10,2) not null,
  payment_methods text[] not null default '{}',
  cash_session_id uuid references cash_sessions(id) on delete set null,
  restock boolean not null default true
);
create index if not exists idx_cancellations_sale on sale_cancellations(sale_id);

-- RPC: anula una venta de forma segura y atómica
create or replace function cancel_sale(
  p_sale_id uuid, p_user_id uuid, p_user_name text, p_reason text, p_restock boolean
) returns uuid language plpgsql security definer as $$
declare
  v_sale sales%rowtype;
  v_item sale_items%rowtype;
  v_prod products%rowtype;
  v_remaining numeric;
  v_new_stock numeric;
  v_cancel_id uuid := gen_random_uuid();
  v_session_status text;
  v_methods text[];
begin
  select * into v_sale from sales where id = p_sale_id;
  if not found then raise exception 'Venta no encontrada'; end if;
  if v_sale.status = 'cancelled' then raise exception 'El ticket ya está anulado'; end if;

  -- No anular si pertenece a un cierre de caja cerrado
  if v_sale.cash_session_id is not null then
    select status into v_session_status from cash_sessions where id = v_sale.cash_session_id;
    if v_session_status = 'closed' then
      raise exception 'El ticket está incluido en un cierre de caja cerrado y no puede anularse';
    end if;
  end if;

  -- Reintegro de stock (de lo no devuelto)
  if p_restock then
    for v_item in select * from sale_items where sale_id = p_sale_id loop
      v_remaining := v_item.quantity - v_item.returned_qty;
      if v_remaining > 0 then
        select * into v_prod from products where id = v_item.product_id;
        if found and v_prod.track_stock then
          v_new_stock := v_prod.stock + v_remaining;
          update products set stock = v_new_stock, updated_at = now() where id = v_prod.id;
          insert into stock_movements(product_id, product_name, type, quantity, resulting_stock, reference, user_id)
          values (v_prod.id, v_prod.name, 'return', v_remaining, v_new_stock, 'Anulación #'||v_sale.number, p_user_id);
        end if;
      end if;
    end loop;
  end if;

  update sales set status = 'cancelled' where id = p_sale_id;

  select coalesce(array_agg(distinct method), '{}') into v_methods from payments where sale_id = p_sale_id;

  insert into sale_cancellations(id, sale_id, sale_number, cancelled_by_id, cancelled_by_name,
    reason, original_total, payment_methods, cash_session_id, restock)
  values (v_cancel_id, p_sale_id, v_sale.number, p_user_id, p_user_name,
    p_reason, v_sale.total, v_methods, v_sale.cash_session_id, p_restock);

  return v_cancel_id;
end; $$;

-- RLS
alter table sale_cancellations enable row level security;
drop policy if exists p_all_sale_cancellations on sale_cancellations;
create policy p_all_sale_cancellations on sale_cancellations
  for all to authenticated using (true) with check (true);


-- ============ migrations/0004_cash_closing_totals.sql ============
-- =====================================================================
-- Aurora TPV — Migración 0004: totales en el cierre de caja
-- Guarda ventas netas, tarjeta y anulado del día en el cierre.
-- =====================================================================

alter table cash_sessions
  add column if not exists sales_total numeric(10,2),
  add column if not exists card_total numeric(10,2),
  add column if not exists cancellations_total numeric(10,2);

-- close_cash_session: además del efectivo previsto/descuadre, registra
-- ventas netas, total tarjeta (tarjeta+bizum) y total anulado.
create or replace function close_cash_session(p_session_id uuid, p_user_id uuid, p_counted_cash numeric, p_note text)
returns cash_sessions language plpgsql security definer as $$
declare
  v_session cash_sessions%rowtype;
  v_cash_sales numeric;
  v_cash_in numeric;
  v_cash_out numeric;
  v_refunds numeric;
  v_expected numeric;
  v_net numeric;
  v_card numeric;
  v_cancelled numeric;
begin
  select * into v_session from cash_sessions where id = p_session_id;

  select coalesce(sum(p.amount),0) into v_cash_sales
    from payments p join sales s on s.id = p.sale_id
    where s.cash_session_id = p_session_id and p.method = 'cash' and s.status <> 'cancelled';
  select coalesce(sum(amount),0) into v_cash_in from cash_movements where cash_session_id = p_session_id and type = 'in';
  select coalesce(sum(amount),0) into v_cash_out from cash_movements where cash_session_id = p_session_id and type = 'out';
  select coalesce(sum(r.total),0) into v_refunds from sale_returns r join sales s on s.id = r.sale_id
    where s.cash_session_id = p_session_id and r.refund_method = 'cash';

  v_expected := v_session.opening_float + v_cash_sales + v_cash_in - v_cash_out - v_refunds;

  select coalesce(sum(s.total),0) into v_net
    from sales s where s.cash_session_id = p_session_id and s.status <> 'cancelled';
  select coalesce(sum(p.amount),0) into v_card
    from payments p join sales s on s.id = p.sale_id
    where s.cash_session_id = p_session_id and p.method in ('card','bizum') and s.status <> 'cancelled';
  select coalesce(sum(s.total),0) into v_cancelled
    from sales s where s.cash_session_id = p_session_id and s.status = 'cancelled';

  update cash_sessions
    set status = 'closed', closed_at = now(), closed_by_id = p_user_id, counted_cash = p_counted_cash,
        expected_cash = v_expected, difference = p_counted_cash - v_expected,
        sales_total = v_net, card_total = v_card, cancellations_total = v_cancelled,
        note = coalesce(p_note, note)
    where id = p_session_id
    returning * into v_session;

  return v_session;
end; $$;


-- ============ migrations/0005_customer_registry.sql ============
-- =====================================================================
-- Aurora TPV — Migración 0005: registro de clientes y snapshot fiscal
-- Amplía customers y congela los datos del cliente en cada venta.
-- =====================================================================

alter table customers
  add column if not exists address text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists country text,
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

alter table sales
  add column if not exists customer_snapshot jsonb;

-- process_sale: ahora guarda customer_snapshot (datos fiscales congelados).
create or replace function process_sale(payload jsonb)
returns uuid language plpgsql security definer as $$
declare
  v_sale_id uuid := gen_random_uuid();
  v_number bigint := nextval('sale_number_seq');
  v_line jsonb;
  v_pay jsonb;
  v_prod products%rowtype;
  v_qty numeric;
  v_new_stock numeric;
begin
  insert into sales(id, number, cashier_id, cashier_name, cash_session_id, customer_id,
    customer_name, customer_snapshot, status, subtotal, tax_total, discount_total, total,
    cash_given, change_given, note)
  values (
    v_sale_id, v_number,
    (payload->>'cashierId')::uuid, payload->>'cashierName',
    nullif(payload->>'cashSessionId','')::uuid,
    nullif(payload->>'customerId','')::uuid,
    coalesce(payload->>'customerName','Cliente mostrador'),
    payload->'customerSnapshot',
    'completed',
    (payload->>'subtotal')::numeric, (payload->>'taxTotal')::numeric,
    (payload->>'discountTotal')::numeric, (payload->>'total')::numeric,
    nullif(payload->>'cashGiven','')::numeric, nullif(payload->>'changeGiven','')::numeric,
    nullif(payload->>'note','')
  );

  for v_line in select * from jsonb_array_elements(payload->'lines') loop
    insert into sale_items(sale_id, product_id, name, quantity, unit_price, discount_pct,
      iva_rate, tax_base, tax_amount, line_total)
    values (v_sale_id, (v_line->>'productId')::uuid, v_line->>'name',
      (v_line->>'quantity')::numeric, (v_line->>'unitPrice')::numeric, (v_line->>'discountPct')::numeric,
      (v_line->>'ivaRate')::int, (v_line->>'taxBase')::numeric, (v_line->>'taxAmount')::numeric,
      (v_line->>'lineTotal')::numeric);

    select * into v_prod from products where id = (v_line->>'productId')::uuid;
    if found and v_prod.track_stock then
      v_qty := (v_line->>'quantity')::numeric;
      v_new_stock := v_prod.stock - v_qty;
      update products set stock = v_new_stock, updated_at = now() where id = v_prod.id;
      insert into stock_movements(product_id, product_name, type, quantity, resulting_stock, reference, user_id)
      values (v_prod.id, v_prod.name, 'sale', -v_qty, v_new_stock, 'Venta #'||v_number, (payload->>'cashierId')::uuid);
    end if;
  end loop;

  for v_pay in select * from jsonb_array_elements(payload->'payments') loop
    insert into payments(sale_id, method, amount)
    values (v_sale_id, v_pay->>'method', (v_pay->>'amount')::numeric);
  end loop;

  return v_sale_id;
end; $$;


-- ============ migrations/0006_product_price_history.sql ============
-- =====================================================================
-- Aurora TPV — Migración 0006: historial de cambios de precio
-- Un trigger registra automáticamente cada cambio de precio.
-- =====================================================================

create table if not exists product_price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  old_price numeric(10,2) not null,
  new_price numeric(10,2) not null,
  changed_at timestamptz not null default now()
);
create index if not exists idx_price_history_product on product_price_history(product_id);

create or replace function log_price_change()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'UPDATE' and new.price is distinct from old.price then
    insert into product_price_history(product_id, old_price, new_price)
    values (new.id, old.price, new.price);
  end if;
  return new;
end; $$;

drop trigger if exists trg_log_price_change on products;
create trigger trg_log_price_change
  after update on products
  for each row execute function log_price_change();

alter table product_price_history enable row level security;
drop policy if exists p_all_product_price_history on product_price_history;
create policy p_all_product_price_history on product_price_history
  for all to authenticated using (true) with check (true);


-- ===================== DATOS SEMILLA =====================
-- =====================================================================
-- Aurora TPV — Datos semilla para Supabase
-- Ejecuta DESPUÉS de 0001_initial_schema.sql.
-- Los usuarios NO se crean aquí: se crean en Supabase Auth (ver README);
-- el trigger handle_new_user genera su perfil automáticamente.
-- =====================================================================

-- Roles
insert into roles(code, name) values
  ('admin','Administrador'), ('manager','Encargado'), ('cashier','Dependiente')
on conflict (code) do nothing;

-- Permisos
insert into permissions(code, name) values
  ('sell','Vender'), ('apply_discount','Aplicar descuentos'), ('modify_price','Modificar precios'),
  ('process_return','Hacer devoluciones'), ('view_reports','Ver informes'),
  ('manage_products','Gestionar productos'), ('manage_users','Gestionar usuarios'),
  ('open_close_cash','Abrir / cerrar caja'), ('manage_settings','Configuración')
on conflict (code) do nothing;

-- Matriz rol -> permisos
insert into role_permissions(role_code, permission_code)
select 'admin', code from permissions
union all select 'manager', code from permissions
  where code in ('sell','apply_discount','modify_price','process_return','view_reports','manage_products','open_close_cash')
union all select 'cashier', code from permissions where code in ('sell','open_close_cash')
on conflict do nothing;

-- Ajustes de la tienda
insert into settings(id, store_name, legal_name, tax_id, address, phone, email, ticket_footer, currency, default_iva)
values (1, 'Aurora Perfumería & Fotografía', 'Aurora Comercio S.L.', 'B12345678',
  'C/ Mayor 12, 28013 Madrid', '910 000 000', 'hola@auroratpv.es',
  '¡Gracias por su compra! Conserve este ticket para cambios y devoluciones (30 días).', 'EUR', 21)
on conflict (id) do nothing;

-- Categorías (UUID fijos para enlazar productos)
insert into categories(id, name, color, sort_order, active) values
  ('11111111-0000-0000-0000-000000000001','Perfumes Mujer','#ec4899',1,true),
  ('11111111-0000-0000-0000-000000000002','Perfumes Hombre','#3b82f6',2,true),
  ('11111111-0000-0000-0000-000000000003','Colonias','#14b8a6',3,true),
  ('11111111-0000-0000-0000-000000000004','Cosmética','#a855f7',4,true),
  ('11111111-0000-0000-0000-000000000005','Material Foto','#f59e0b',5,true),
  ('11111111-0000-0000-0000-000000000006','Revelado','#ef4444',6,true),
  ('11111111-0000-0000-0000-000000000007','Marcos y Álbumes','#64748b',7,true)
on conflict (id) do nothing;

-- Productos
insert into products(name, brand, sku, barcode, category_id, price, cost, iva_rate, tax_included, stock, track_stock, low_stock_threshold, active) values
  ('Eau de Parfum 50ml','Chanel Nº5','PROD-001','3145891255300','11111111-0000-0000-0000-000000000001',109.90,62,21,true,8,true,3,true),
  ('La Vie Est Belle 50ml','Lancôme','PROD-002','3605532612560','11111111-0000-0000-0000-000000000001',89.50,49,21,true,6,true,3,true),
  ('Good Girl 80ml','Carolina Herrera','PROD-003','8411061993989','11111111-0000-0000-0000-000000000001',119.00,67,21,true,5,true,3,true),
  ('Black Opium 50ml','YSL','PROD-004','3614272047693','11111111-0000-0000-0000-000000000001',98.00,55,21,true,4,true,3,true),
  ('J''adore 50ml','Dior','PROD-005','3348901419494','11111111-0000-0000-0000-000000000001',112.50,64,21,true,2,true,3,true),
  ('Sauvage EDT 100ml','Dior','PROD-010','3348901250177','11111111-0000-0000-0000-000000000002',99.90,56,21,true,9,true,3,true),
  ('Acqua di Giò 100ml','Armani','PROD-011','3614273255615','11111111-0000-0000-0000-000000000002',92.00,51,21,true,7,true,3,true),
  ('One Million 100ml','Paco Rabanne','PROD-012','3349668562039','11111111-0000-0000-0000-000000000002',88.50,48,21,true,6,true,3,true),
  ('Boss Bottled 100ml','Hugo Boss','PROD-013','737052352060','11111111-0000-0000-0000-000000000002',79.00,43,21,true,3,true,3,true),
  ('Le Male 125ml','Jean Paul Gaultier','PROD-014','8435415015646','11111111-0000-0000-0000-000000000002',84.90,47,21,true,2,true,3,true),
  ('Agua de Colonia 200ml','Álvarez Gómez','PROD-020','8422385000017','11111111-0000-0000-0000-000000000003',12.90,5.5,21,true,20,true,3,true),
  ('Colonia Fresca 100ml','Heno de Pravia','PROD-021','8410225508018','11111111-0000-0000-0000-000000000003',8.50,3.2,21,true,15,true,3,true),
  ('Nenuco Agua de Colonia 240ml','Nenuco','PROD-022','8410104870218','11111111-0000-0000-0000-000000000003',6.95,2.6,21,true,18,true,3,true),
  ('Crema Hidratante Facial 50ml','Nivea','PROD-030','4005900123459','11111111-0000-0000-0000-000000000004',9.95,4.1,21,true,12,true,3,true),
  ('Barra de Labios Mate','Maybelline','PROD-031','3600531234567','11111111-0000-0000-0000-000000000004',11.50,4.8,21,true,10,true,3,true),
  ('Set Brochas Maquillaje','Real Techniques','PROD-032','0791578256412','11111111-0000-0000-0000-000000000004',24.90,12,21,true,5,true,3,true),
  ('Tarjeta SD 64GB UHS-I','SanDisk','PROD-040','0619659186159','11111111-0000-0000-0000-000000000005',18.90,9.5,21,true,14,true,3,true),
  ('Carrete 35mm Color 36exp','Kodak ColorPlus','PROD-041','6033179000018','11111111-0000-0000-0000-000000000005',11.95,6.2,21,true,22,true,3,true),
  ('Pilas AA Recargables (4u)','Panasonic Eneloop','PROD-042','5410853052418','11111111-0000-0000-0000-000000000005',14.50,7.1,21,true,16,true,3,true),
  ('Trípode Compacto 1.3m','Manfrotto','PROD-043','8024221681543','11111111-0000-0000-0000-000000000005',39.90,21,21,true,4,true,3,true),
  ('Revelado carrete 35mm',null,'PROD-050','2000000000015','11111111-0000-0000-0000-000000000006',9.90,2.5,21,true,0,false,0,true),
  ('Copia foto 10x15 (unidad)',null,'PROD-051','2000000000022','11111111-0000-0000-0000-000000000006',0.35,0.08,21,true,0,false,0,true),
  ('Foto carnet (8 unidades)',null,'PROD-052','2000000000039','11111111-0000-0000-0000-000000000006',6.00,1.2,21,true,0,false,0,true),
  ('Impresión foto A4 sobre lienzo',null,'PROD-053','2000000000046','11111111-0000-0000-0000-000000000006',24.90,9,21,true,0,false,0,true),
  ('Marco de fotos 13x18 madera','Hama','PROD-060','4007249641007','11111111-0000-0000-0000-000000000007',7.95,3.4,21,true,11,true,3,true),
  ('Álbum 200 fotos 10x15','Hofmann','PROD-061','8412345600013','11111111-0000-0000-0000-000000000007',14.90,6.8,21,true,7,true,3,true),
  ('Marco múltiple 4 fotos','Nielsen','PROD-062','4007249641205','11111111-0000-0000-0000-000000000007',19.50,9.2,21,true,3,true,3,true)
on conflict do nothing;

-- =====================================================================
-- 0011 — Impresión térmica ESC/POS y cajón registrador
-- =====================================================================

create table if not exists printer_config (
  id text primary key default 'default',
  connection_type text not null default 'windows-printer'
    check (connection_type in ('usb','network','serial','windows-printer')),
  printer_name text,
  ip_address text,
  port int default 9100,
  serial_port text,
  baud_rate int default 9600,
  paper_width text not null default '80' check (paper_width in ('58','80')),
  encoding text not null default 'cp858' check (encoding in ('cp858','cp850','utf8')),
  drawer_pin int not null default 2 check (drawer_pin in (2,5)),
  auto_cut boolean not null default true,
  open_drawer_on_cash_sale boolean not null default true,
  copies int not null default 1,
  print_logo boolean not null default false,
  logo_data text,
  print_qr boolean not null default true,
  footer_line boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into printer_config (id) values ('default') on conflict (id) do nothing;
alter table printer_config enable row level security;
drop policy if exists p_all_printer_config on printer_config;
create policy p_all_printer_config on printer_config for all to authenticated using (true) with check (true);

create table if not exists print_jobs (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references sales(id) on delete set null,
  receipt_number bigint,
  type text not null check (type in ('ORIGINAL','COPY','TEST')),
  status text not null check (status in ('SUCCESS','FAILED','PENDING')),
  error_message text,
  printed_by uuid not null,
  printed_at timestamptz not null default now(),
  copies int not null default 1
);
create index if not exists idx_print_jobs_sale on print_jobs(sale_id);
create index if not exists idx_print_jobs_printed_at on print_jobs(printed_at desc);
alter table print_jobs enable row level security;
drop policy if exists p_all_print_jobs on print_jobs;
create policy p_all_print_jobs on print_jobs for all to authenticated using (true) with check (true);

create table if not exists cash_drawer_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references cash_sessions(id) on delete set null,
  user_id uuid not null,
  username text not null,
  type text not null
    check (type in ('SALE_CASH','REFUND_CASH','MANUAL_OPEN','CASH_IN','CASH_OUT','TEST_OPEN')),
  reason text,
  amount numeric(10,2),
  related_sale_id uuid references sales(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_cash_drawer_events_session on cash_drawer_events(session_id);
create index if not exists idx_cash_drawer_events_created on cash_drawer_events(created_at desc);
alter table cash_drawer_events enable row level security;
drop policy if exists p_all_cash_drawer_events on cash_drawer_events;
create policy p_all_cash_drawer_events on cash_drawer_events for all to authenticated using (true) with check (true);
