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
