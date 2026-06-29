-- =====================================================================
-- Aurora TPV — Migración 0008: quitar devoluciones y Bizum
-- Mantiene anulación con trazabilidad, pero sin pedir motivo al usuario.
-- =====================================================================

-- Normaliza pagos antiguos: cualquier método no efectivo pasa a tarjeta.
update payments set method = 'card' where method <> 'cash';

do $$
declare
  c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'payments'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%method%';
  if c is not null then
    execute format('alter table payments drop constraint %I', c);
  end if;
end $$;

alter table payments
  add constraint payments_method_check check (method in ('cash','card'));

-- Devoluciones fuera de la aplicación.
drop function if exists process_return(jsonb);
drop table if exists return_items cascade;
drop table if exists sale_returns cascade;

-- Sustituye cualquier firma previa de anulación.
drop function if exists cancel_sale(uuid, uuid, text, text);
drop function if exists cancel_sale(uuid, uuid, text, text, boolean);

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

  return v_cancel_id;
end; $$;

-- Cierre de caja sin devoluciones y con solo efectivo/tarjeta.
create or replace function close_cash_session(p_session_id uuid, p_user_id uuid, p_counted_cash numeric, p_note text)
returns cash_sessions language plpgsql security definer as $$
declare
  v_session cash_sessions%rowtype;
  v_cash_sales numeric;
  v_cash_in numeric;
  v_cash_out numeric;
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

  v_expected := v_session.opening_float + v_cash_sales + v_cash_in - v_cash_out;

  select coalesce(sum(s.total),0) into v_net
    from sales s where s.cash_session_id = p_session_id and s.status <> 'cancelled';
  select coalesce(sum(p.amount),0) into v_card
    from payments p join sales s on s.id = p.sale_id
    where s.cash_session_id = p_session_id and p.method = 'card' and s.status <> 'cancelled';
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

delete from role_permissions where permission_code = 'process_return';
delete from permissions where code = 'process_return';
