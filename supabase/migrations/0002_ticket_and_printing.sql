-- =====================================================================
-- Aurora TPV — Migración 0002: plantilla de ticket e impresión
-- Compatible con datos existentes (columnas con DEFAULT).
-- =====================================================================

-- Configuración de la plantilla de ticket
alter table settings
  add column if not exists ticket_width text not null default '80' check (ticket_width in ('58','80')),
  add column if not exists show_tax_breakdown boolean not null default true,
  add column if not exists header_text text not null default '',
  add column if not exists return_policy text not null default '',
  add column if not exists legal_text text not null default '',
  add column if not exists logo_url text;

-- Estado de impresión y versión de plantilla por venta
alter table sales
  add column if not exists print_status text not null default 'pending'
    check (print_status in ('pending','printed','failed')),
  add column if not exists ticket_template_version int not null default 1;

-- process_sale debe marcar la venta como pendiente de imprimir (ya por defecto)
-- y registrar la versión de plantilla. No requiere cambios: los DEFAULT aplican.
