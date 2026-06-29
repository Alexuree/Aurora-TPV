-- =====================================================================
-- Aurora TPV — Datos semilla para Supabase
-- Ejecuta DESPUÉS de 0001_initial_schema.sql.
-- Los usuarios NO se crean aquí: se crean en Supabase Auth (ver README);
-- el trigger handle_new_user genera su perfil automáticamente.
-- =====================================================================

-- Roles
insert into roles(code, name) values
  ('admin','Administrador'), ('manager','Encargado'), ('cashier','Dependiente')
on conflict (code) do nothing;

-- Permisos
insert into permissions(code, name) values
  ('sell','Vender'), ('apply_discount','Aplicar descuentos'), ('modify_price','Modificar precios'),
  ('view_reports','Ver informes'),
  ('manage_products','Gestionar productos'), ('manage_users','Gestionar usuarios'),
  ('open_close_cash','Abrir / cerrar caja'), ('manage_settings','Configuración')
on conflict (code) do nothing;

-- Matriz rol -> permisos
insert into role_permissions(role_code, permission_code)
select 'admin', code from permissions
union all select 'manager', code from permissions
  where code in ('sell','apply_discount','modify_price','view_reports','manage_products','open_close_cash')
union all select 'cashier', code from permissions where code in ('sell','open_close_cash')
on conflict do nothing;

-- Ajustes de la tienda
insert into settings(id, store_name, legal_name, tax_id, address, phone, email, ticket_footer, currency, default_iva,
  fiscal_mode, simplified_invoice_series, complete_invoice_series, default_invoice_type, enable_fiscal_qr)
values (1, 'Aurora Perfumería & Fotografía', 'Aurora Comercio S.L.', 'B12345678',
  'C/ Mayor 12, 28013 Madrid', '910 000 000', 'hola@auroratpv.es',
  '¡Gracias por su compra!', 'EUR', 21,
  'no_verifactu', 'FS', 'FC', 'simplified', true)
on conflict (id) do nothing;

-- Categorías (UUID fijos para enlazar productos)
insert into categories(id, name, color, sort_order, active) values
  ('11111111-0000-0000-0000-000000000001','Perfumes Mujer','#ec4899',1,true),
  ('11111111-0000-0000-0000-000000000002','Perfumes Hombre','#3b82f6',2,true),
  ('11111111-0000-0000-0000-000000000003','Colonias','#14b8a6',3,true),
  ('11111111-0000-0000-0000-000000000004','Cosmética','#a855f7',4,true),
  ('11111111-0000-0000-0000-000000000005','Material Foto','#f59e0b',5,true),
  ('11111111-0000-0000-0000-000000000006','Revelado','#ef4444',6,true),
  ('11111111-0000-0000-0000-000000000007','Marcos y Álbumes','#64748b',7,true)
on conflict (id) do nothing;

-- Productos
insert into products(name, brand, sku, barcode, category_id, price, cost, iva_rate, tax_included, active) values
  ('Eau de Parfum 50ml','Chanel Nº5','PROD-001','3145891255300','11111111-0000-0000-0000-000000000001',109.90,62,21,true,true),
  ('La Vie Est Belle 50ml','Lancôme','PROD-002','3605532612560','11111111-0000-0000-0000-000000000001',89.50,49,21,true,true),
  ('Good Girl 80ml','Carolina Herrera','PROD-003','8411061993989','11111111-0000-0000-0000-000000000001',119.00,67,21,true,true),
  ('Black Opium 50ml','YSL','PROD-004','3614272047693','11111111-0000-0000-0000-000000000001',98.00,55,21,true,true),
  ('J''adore 50ml','Dior','PROD-005','3348901419494','11111111-0000-0000-0000-000000000001',112.50,64,21,true,true),
  ('Sauvage EDT 100ml','Dior','PROD-010','3348901250177','11111111-0000-0000-0000-000000000002',99.90,56,21,true,true),
  ('Acqua di Giò 100ml','Armani','PROD-011','3614273255615','11111111-0000-0000-0000-000000000002',92.00,51,21,true,true),
  ('One Million 100ml','Paco Rabanne','PROD-012','3349668562039','11111111-0000-0000-0000-000000000002',88.50,48,21,true,true),
  ('Boss Bottled 100ml','Hugo Boss','PROD-013','737052352060','11111111-0000-0000-0000-000000000002',79.00,43,21,true,true),
  ('Le Male 125ml','Jean Paul Gaultier','PROD-014','8435415015646','11111111-0000-0000-0000-000000000002',84.90,47,21,true,true),
  ('Agua de Colonia 200ml','Álvarez Gómez','PROD-020','8422385000017','11111111-0000-0000-0000-000000000003',12.90,5.5,21,true,true),
  ('Colonia Fresca 100ml','Heno de Pravia','PROD-021','8410225508018','11111111-0000-0000-0000-000000000003',8.50,3.2,21,true,true),
  ('Nenuco Agua de Colonia 240ml','Nenuco','PROD-022','8410104870218','11111111-0000-0000-0000-000000000003',6.95,2.6,21,true,true),
  ('Crema Hidratante Facial 50ml','Nivea','PROD-030','4005900123459','11111111-0000-0000-0000-000000000004',9.95,4.1,21,true,true),
  ('Barra de Labios Mate','Maybelline','PROD-031','3600531234567','11111111-0000-0000-0000-000000000004',11.50,4.8,21,true,true),
  ('Set Brochas Maquillaje','Real Techniques','PROD-032','0791578256412','11111111-0000-0000-0000-000000000004',24.90,12,21,true,true),
  ('Tarjeta SD 64GB UHS-I','SanDisk','PROD-040','0619659186159','11111111-0000-0000-0000-000000000005',18.90,9.5,21,true,true),
  ('Carrete 35mm Color 36exp','Kodak ColorPlus','PROD-041','6033179000018','11111111-0000-0000-0000-000000000005',11.95,6.2,21,true,true),
  ('Pilas AA Recargables (4u)','Panasonic Eneloop','PROD-042','5410853052418','11111111-0000-0000-0000-000000000005',14.50,7.1,21,true,true),
  ('Trípode Compacto 1.3m','Manfrotto','PROD-043','8024221681543','11111111-0000-0000-0000-000000000005',39.90,21,21,true,true),
  ('Revelado carrete 35mm',null,'PROD-050','2000000000015','11111111-0000-0000-0000-000000000006',9.90,2.5,21,true,true),
  ('Copia foto 10x15 (unidad)',null,'PROD-051','2000000000022','11111111-0000-0000-0000-000000000006',0.35,0.08,21,true,true),
  ('Foto carnet (8 unidades)',null,'PROD-052','2000000000039','11111111-0000-0000-0000-000000000006',6.00,1.2,21,true,true),
  ('Impresión foto A4 sobre lienzo',null,'PROD-053','2000000000046','11111111-0000-0000-0000-000000000006',24.90,9,21,true,true),
  ('Marco de fotos 13x18 madera','Hama','PROD-060','4007249641007','11111111-0000-0000-0000-000000000007',7.95,3.4,21,true,true),
  ('Álbum 200 fotos 10x15','Hofmann','PROD-061','8412345600013','11111111-0000-0000-0000-000000000007',14.90,6.8,21,true,true),
  ('Marco múltiple 4 fotos','Nielsen','PROD-062','4007249641205','11111111-0000-0000-0000-000000000007',19.50,9.2,21,true,true)
on conflict do nothing;
