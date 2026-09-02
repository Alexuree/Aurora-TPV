-- =====================================================================
-- Aurora TPV — Migración 0013: ticket regalo como impresión especial
-- Permite registrar intentos de impresión GIFT sin tocar tickets normales.
-- =====================================================================

alter table print_jobs drop constraint if exists print_jobs_type_check;
alter table print_jobs
  add constraint print_jobs_type_check
  check (type in ('ORIGINAL','COPY','TEST','GIFT'));
