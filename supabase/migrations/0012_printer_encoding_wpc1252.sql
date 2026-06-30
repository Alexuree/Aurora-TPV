-- =====================================================================
-- Aurora TPV — Migración 0012: añade WPC1252 a las codificaciones válidas
-- de printer_config. Las térmicas genéricas que no implementan PC858 sí
-- soportan Windows-1252 (€ en 0x80); se añade como opción seleccionable.
-- Idempotente: recrea el CHECK con la lista ampliada.
-- =====================================================================

alter table printer_config drop constraint if exists printer_config_encoding_check;
alter table printer_config add constraint printer_config_encoding_check
  check (encoding in ('cp858','wpc1252','cp850','utf8'));
