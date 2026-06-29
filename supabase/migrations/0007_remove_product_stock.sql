-- =====================================================================
-- Aurora TPV — Migración 0007: eliminar stock de producto
-- Quita inventario/stock de productos y deja ventas, devoluciones,
-- anulaciones y cierres de caja sin movimientos de inventario.
-- =====================================================================

-- Venta atómica sin descuento de stock.
create or replace function process_sale(payload jsonb)
returns uuid language plpgsql security definer as $$
declare
  v_sale_id uuid := gen_random_uuid();
  v_number bigint := nextval('sale_number_seq');
  v_line jsonb;
  v_pay jsonb;
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
  end loop;

  for v_pay in select * from jsonb_array_elements(payload->'payments') loop
    insert into payments(sale_id, method, amount)
    values (v_sale_id, v_pay->>'method', (v_pay->>'amount')::numeric);
  end loop;

  return v_sale_id;
end; $$;

-- Devolución sin reintegro de stock.
create or replace function process_return(payload jsonb)
returns uuid language plpgsql security definer as $$
declare
  v_ret_id uuid := gen_random_uuid();
  v_number bigint := nextval('return_number_seq');
  v_sale sales%rowtype;
  v_item jsonb;
  v_all boolean;
begin
  select * into v_sale from sales where id = (payload->>'saleId')::uuid;
  if not found then raise exception 'Venta no encontrada'; end if;

  insert into sale_returns(id, number, sale_id, sale_number, cashier_id, cashier_name,
    reason, refund_method, total)
  values (v_ret_id, v_number, v_sale.id, v_sale.number, (payload->>'cashierId')::uuid,
    payload->>'cashierName', payload->>'reason', payload->>'refundMethod',
    (payload->>'total')::numeric);

  for v_item in select * from jsonb_array_elements(payload->'items') loop
    insert into return_items(return_id, sale_item_id, product_id, name, quantity, refund_amount)
    values (v_ret_id, (v_item->>'saleItemId')::uuid, (v_item->>'productId')::uuid,
      v_item->>'name', (v_item->>'quantity')::numeric, (v_item->>'refundAmount')::numeric);

    update sale_items set returned_qty = returned_qty + (v_item->>'quantity')::numeric
      where id = (v_item->>'saleItemId')::uuid;
  end loop;

  select bool_and(returned_qty >= quantity) into v_all from sale_items where sale_id = v_sale.id;
  update sales set status = case when v_all then 'returned' else 'partially_returned' end
    where id = v_sale.id;

  return v_ret_id;
end; $$;

-- Sustituye la firma anterior, que recibía p_restock.
drop function if exists cancel_sale(uuid, uuid, text, text, boolean);

create or replace function cancel_sale(
  p_sale_id uuid, p_user_id uuid, p_user_name text, p_reason text
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
    p_reason, v_sale.total, v_methods, v_sale.cash_session_id);

  return v_cancel_id;
end; $$;

-- Cierre de caja: el recuento real puede ser NULL. Se conservan expected_cash
-- y totales de sesión; difference queda NULL si no se introdujo recuento.
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
  if not found then raise exception 'Sesión de caja no encontrada'; end if;

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
        expected_cash = v_expected,
        difference = case when p_counted_cash is null then null else p_counted_cash - v_expected end,
        sales_total = v_net, card_total = v_card, cancellations_total = v_cancelled,
        note = coalesce(p_note, note)
    where id = p_session_id
    returning * into v_session;

  return v_session;
end; $$;

-- Eliminar objetos de inventario/stock.
drop function if exists adjust_stock(uuid, numeric, text, uuid);
drop table if exists stock_movements cascade;

alter table sale_returns drop column if exists restock;
alter table sale_cancellations drop column if exists restock;

alter table products
  drop column if exists stock,
  drop column if exists track_stock,
  drop column if exists low_stock_threshold;
