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
