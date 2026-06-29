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
