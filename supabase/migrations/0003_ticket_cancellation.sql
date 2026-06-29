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
