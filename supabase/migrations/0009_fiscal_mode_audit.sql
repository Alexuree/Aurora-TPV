-- =====================================================================
-- Aurora TPV — Migración 0009: base fiscal NO-VERIFACTU/VERI*FACTU
-- Añade series, tipo de factura, hash encadenado y eventos de auditoría.
-- =====================================================================

alter table settings
  add column if not exists fiscal_mode text not null default 'no_verifactu' check (fiscal_mode in ('no_verifactu','verifactu')),
  add column if not exists simplified_invoice_series text not null default 'FS',
  add column if not exists complete_invoice_series text not null default 'FC',
  add column if not exists default_invoice_type text not null default 'simplified' check (default_invoice_type in ('simplified','complete')),
  add column if not exists enable_fiscal_qr boolean not null default true;

alter table sales
  add column if not exists invoice_type text check (invoice_type in ('simplified','complete')),
  add column if not exists series text,
  add column if not exists fiscal_number text,
  add column if not exists fiscal_mode text check (fiscal_mode in ('no_verifactu','verifactu')),
  add column if not exists previous_fiscal_hash text,
  add column if not exists fiscal_hash text;

create unique index if not exists uniq_sales_fiscal_number on sales(fiscal_number) where fiscal_number is not null;

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null,
  user_id uuid,
  user_name text,
  entity text,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb
);

alter table audit_events enable row level security;
drop policy if exists p_all_audit_events on audit_events;
create policy p_all_audit_events on audit_events for all to authenticated using (true) with check (true);

create or replace function process_sale(payload jsonb)
returns uuid language plpgsql security definer as $$
declare
  v_sale_id uuid := gen_random_uuid();
  v_number bigint := nextval('sale_number_seq');
  v_line jsonb;
  v_pay jsonb;
  v_settings settings%rowtype;
  v_invoice_type text;
  v_series text;
  v_fiscal_number text;
  v_prev_hash text;
  v_hash text;
begin
  select * into v_settings from settings where id = 1;
  v_invoice_type := case
    when coalesce(payload->'customerSnapshot'->>'taxId','') <> '' then 'complete'
    else coalesce(v_settings.default_invoice_type, 'simplified')
  end;
  v_series := case when v_invoice_type = 'complete' then coalesce(v_settings.complete_invoice_series, 'FC') else coalesce(v_settings.simplified_invoice_series, 'FS') end;
  v_fiscal_number := v_series || '-' || v_number;
  select fiscal_hash into v_prev_hash from sales where fiscal_hash is not null order by created_at desc limit 1;

  insert into sales(id, number, cashier_id, cashier_name, cash_session_id, customer_id,
    customer_name, customer_snapshot, status, subtotal, tax_total, discount_total, total,
    cash_given, change_given, note, invoice_type, series, fiscal_number, fiscal_mode, previous_fiscal_hash)
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
    nullif(payload->>'note',''), v_invoice_type, v_series, v_fiscal_number,
    coalesce(v_settings.fiscal_mode, 'no_verifactu'), v_prev_hash
  );

  for v_line in select * from jsonb_array_elements(payload->'lines') loop
    insert into sale_items(sale_id, product_id, name, quantity, unit_price, discount_pct,
      iva_rate, tax_base, tax_amount, line_total)
    values (v_sale_id, (v_line->>'productId')::uuid, v_line->>'name',
      (v_line->>'quantity')::numeric, (v_line->>'unitPrice')::numeric, (v_line->>'discountPct')::numeric,
      (v_line->>'ivaRate')::int, (v_line->>'taxBase')::numeric, (v_line->>'taxAmount')::numeric,
      (v_line->>'lineTotal')::numeric);
  end loop;

  for v_pay in select * from jsonb_array_elements(payload->'payments') loop
    insert into payments(sale_id, method, amount)
    values (v_sale_id, v_pay->>'method', (v_pay->>'amount')::numeric);
  end loop;

  v_hash := encode(digest(
    v_fiscal_number || '|' || v_sale_id || '|' || coalesce(v_prev_hash,'') || '|' ||
    (payload->>'total') || '|' || (payload->>'taxTotal') || '|' || payload->>'cashierId',
    'sha256'
  ), 'hex');

  update sales set fiscal_hash = v_hash where id = v_sale_id;

  insert into audit_events(type, user_id, user_name, entity, entity_id, details)
  values ('sale_created', (payload->>'cashierId')::uuid, payload->>'cashierName', 'sale', v_sale_id,
    jsonb_build_object('number', v_number, 'fiscal_number', v_fiscal_number, 'total', (payload->>'total')::numeric, 'hash', v_hash));

  if exists (select 1 from jsonb_array_elements(payload->'lines') l where (l->>'discountPct')::numeric > 0) then
    insert into audit_events(type, user_id, user_name, entity, entity_id, details)
    values ('discount_applied', (payload->>'cashierId')::uuid, payload->>'cashierName', 'sale', v_sale_id,
      jsonb_build_object('number', v_number, 'discount_total', (payload->>'discountTotal')::numeric));
  end if;

  return v_sale_id;
end; $$;

create or replace function cancel_sale(
  p_sale_id uuid, p_user_id uuid, p_user_name text
) returns uuid language plpgsql security definer as $$
declare
  v_sale sales%rowtype;
  v_cancel_id uuid := gen_random_uuid();
  v_session_status text;
  v_methods text[];
begin
  select * into v_sale from sales where id = p_sale_id;
  if not found then raise exception 'Venta no encontrada'; end if;
  if v_sale.status = 'cancelled' then raise exception 'El ticket ya está anulado'; end if;

  if v_sale.cash_session_id is not null then
    select status into v_session_status from cash_sessions where id = v_sale.cash_session_id;
    if v_session_status = 'closed' then
      raise exception 'El ticket está incluido en un cierre de caja cerrado y no puede anularse';
    end if;
  end if;

  update sales set status = 'cancelled' where id = p_sale_id;
  select coalesce(array_agg(distinct method), '{}') into v_methods from payments where sale_id = p_sale_id;

  insert into sale_cancellations(id, sale_id, sale_number, cancelled_by_id, cancelled_by_name,
    reason, original_total, payment_methods, cash_session_id)
  values (v_cancel_id, p_sale_id, v_sale.number, p_user_id, p_user_name,
    'Anulación de ticket', v_sale.total, v_methods, v_sale.cash_session_id);

  insert into audit_events(type, user_id, user_name, entity, entity_id, details)
  values ('sale_cancelled', p_user_id, p_user_name, 'sale', p_sale_id,
    jsonb_build_object('number', v_sale.number, 'fiscal_number', v_sale.fiscal_number, 'total', v_sale.total));

  return v_cancel_id;
end; $$;
