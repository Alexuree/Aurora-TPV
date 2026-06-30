-- =====================================================================
-- Aurora TPV — Migración 0011: impresión térmica ESC/POS y cajón
-- Añade: configuración de impresora (fila única), registro de impresiones
-- (print_jobs) y eventos del cajón (cash_drawer_events).
-- audit_events (0009) se reutiliza tal cual con nuevos valores de 'type'.
-- Idempotente: usa "if not exists" y "on conflict do nothing".
-- =====================================================================

-- ----------------------- printer_config (single-row) ----------------
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

-- ----------------------------- print_jobs --------------------------
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

-- ------------------------- cash_drawer_events ----------------------
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
