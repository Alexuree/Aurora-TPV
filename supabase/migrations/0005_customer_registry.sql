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
