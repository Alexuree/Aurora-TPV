-- =====================================================================
-- Aurora TPV — Migración 0010: asignar cliente a venta cerrada
-- Permite completar/reimprimir una venta existente con datos fiscales de
-- cliente sin modificar importes, líneas, pagos ni caja.
-- =====================================================================

create or replace function assign_sale_customer(payload jsonb)
returns uuid language plpgsql security definer as $$
declare
  v_sale sales%rowtype;
  v_settings settings%rowtype;
  v_customer_snapshot jsonb;
  v_customer_id uuid;
  v_customer_name text;
  v_invoice_type text;
  v_series text;
  v_fiscal_number text;
  v_hash text;
begin
  select * into v_sale from sales where id = (payload->>'saleId')::uuid;
  if not found then raise exception 'Venta no encontrada'; end if;
  if v_sale.status = 'cancelled' then raise exception 'No se puede facturar un ticket anulado'; end if;

  select * into v_settings from settings where id = 1;
  v_customer_id := nullif(payload->>'customerId','')::uuid;
  v_customer_name := coalesce(nullif(payload->>'customerName',''), 'Cliente mostrador');
  v_customer_snapshot := case
    when payload ? 'customerSnapshot' and jsonb_typeof(payload->'customerSnapshot') <> 'null'
      then payload->'customerSnapshot'
    else null
  end;

  v_invoice_type := case
    when coalesce(v_customer_snapshot->>'taxId','') <> '' then 'complete'
    else coalesce(v_settings.default_invoice_type, 'simplified')
  end;
  v_series := case
    when v_invoice_type = 'complete' then coalesce(v_settings.complete_invoice_series, 'FC')
    else coalesce(v_settings.simplified_invoice_series, 'FS')
  end;
  v_fiscal_number := v_series || '-' || v_sale.number;
  v_hash := encode(digest(
    v_fiscal_number || '|' || v_sale.id || '|' || coalesce(v_sale.previous_fiscal_hash,'') || '|' ||
    v_sale.total || '|' || v_sale.tax_total || '|' || v_sale.cashier_id,
    'sha256'
  ), 'hex');

  update sales
    set customer_id = v_customer_id,
        customer_name = v_customer_name,
        customer_snapshot = v_customer_snapshot,
        invoice_type = v_invoice_type,
        series = v_series,
        fiscal_number = v_fiscal_number,
        fiscal_hash = v_hash
    where id = v_sale.id;

  insert into audit_events(type, user_id, user_name, entity, entity_id, details)
  values ('sale_customer_assigned', nullif(payload->>'userId','')::uuid, nullif(payload->>'userName',''), 'sale', v_sale.id,
    jsonb_build_object(
      'number', v_sale.number,
      'customer_id', v_customer_id,
      'customer_name', v_customer_name,
      'invoice_type', v_invoice_type,
      'fiscal_number', v_fiscal_number,
      'hash', v_hash
    ));

  return v_sale.id;
end; $$;
