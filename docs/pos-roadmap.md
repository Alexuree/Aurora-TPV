# Roadmap — TPV profesional de mostrador

Plan de evolución del TPV actual hacia un TPV profesional, organizado en ramas
pequeñas, funcionales y testeables. **No se reescribe la app**: se respeta la
arquitectura actual (patrón Repository, dominio puro, React+Vite+Electron,
Supabase/local).

> Si el trabajo se desvía: «vuelve al roadmap y continúa solo con la rama actual».

## Stack detectado

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + TypeScript + Vite 6 |
| Estilos | Tailwind CSS v4 (`@tailwindcss/vite`) |
| Estado | Zustand (auth, carrito) + TanStack Query (datos) |
| Rutas | react-router-dom v7 (`HashRouter`, por Electron) |
| Escritorio | Electron 33 (`electron/main.cjs`) |
| Persistencia | Patrón **Repository** → `LocalRepository` (localStorage) / `SupabaseRepository` (PostgreSQL) |
| "ORM" | Supabase JS + funciones RPC SQL (`supabase/migrations`) |
| Lógica negocio | `src/domain/*` (puro, sin framework) |
| Tests | Vitest (`src/**/*.test.ts`) |

**Regla de oro:** toda lógica de datos pasa por la interfaz `Repository`
(`src/data/repository.ts`). Cualquier campo/operación nueva se añade a la
interfaz y a **ambas** implementaciones (local y Supabase) + migración SQL.

## Estrategia de ramas

Todas parten de `main` actualizado. Una funcionalidad por rama, commits claros,
sin romper el flujo de venta.

| # | Rama | Estado |
|---|---|---|
| 1 | `feature/barcode-scanner-flow` | ✅ completada |
| 2 | `feature/thermal-ticket-template` | ✅ completada |
| 3 | `feature/ticket-cancellation` | ✅ completada |
| 4 | `feature/payments-daily-sales-cash-closing` | ✅ completada |
| 5 | `feature/customer-registry-invoicing` | ✅ completada |
| 6 | `feature/product-admin-crud` | ✅ completada |
| 7 | `integration/professional-pos-upgrade` | 🟦 en curso |

Leyenda: ⬜ pendiente · 🟦 en curso · ✅ completada

---

### Rama 1 — `feature/barcode-scanner-flow`
Escaneo con lector USB (teclado→Enter). Producto **pendiente**: al escanear el
siguiente, el anterior se añade solo. Foco automático, debounce anti-dobles
lecturas, error "Producto no encontrado" sin romper la venta.
- **BD:** `barcode`/`sku` ya existen en `products`. Sin migración nueva.
- **Tests:** unit del buffer de escaneo (parseo/debounce). Checklist manual.

### Rama 2 — `feature/thermal-ticket-template`
Capa de abstracción de impresión (no acoplar a una impresora). Plantilla fija
58/80mm configurable (logo, datos, políticas, desglose IVA). Vista previa,
imprimir, reimprimir último. Persistir snapshot + estado de impresión.
- **BD:** `sales.print_status`, `sales.ticket_template_version`; ajustes de
  ticket en `settings`.
- **Tests:** checklist manual (impresión depende de hardware).

### Rama 3 — `feature/ticket-cancellation`
Anulación segura del último ticket (no borrado). Marca `cancelled`, crea
registro de anulación con trazabilidad (quién/cuándo/motivo), recalcula totales
netos y caja. Permisos admin/encargado.
- **BD:** tabla `sale_cancellations`; estado `cancelled` ya existe en `sales`.
- **Tests:** unit de totales netos (bruto/anulado/neto).

### Rama 4 — `feature/payments-daily-sales-cash-closing`
Refuerza cobro efectivo/tarjeta/mixto (cambio validado). Facturación diaria
(bruto/anulado/neto, efectivo/tarjeta, nº tickets, ticket medio, primera/última
venta) con filtros. Cierre de caja con recuento real y descuadre, restando
anulaciones.
- **BD:** `cash_sessions`/`cash_movements` ya existen; añadir
  `cancellations_total`, `card_total` al cierre si falta.
- **Tests:** unit de agregados diarios con anulaciones.

### Rama 5 — `feature/customer-registry-invoicing`
Registro de clientes (alta/edición/baja lógica, búsqueda). Asignar a venta y
crear cliente rápido. **Snapshot fiscal** del cliente en el ticket (no cambia al
editar el cliente después).
- **BD:** ampliar `customers` (address, postal_code, city, province, country,
  active); `sales.customer_snapshot jsonb`.
- **Tests:** unit de inmutabilidad del snapshot. Checklist manual.

### Rama 6 — `feature/product-admin-crud`
CRUD de productos desde la app (ya existe base): validaciones (precio ≥ 0,
barcode único, nombre obligatorio, IVA válido), baja lógica si fue vendido,
disponibilidad inmediata en venta/escaneo. `updated_at` + historial de precio.
- **BD:** `product_price_history` (opcional).
- **Tests:** unit de validaciones. Checklist manual.

### Rama 7 — `integration/professional-pos-upgrade`
Fusiona 1→6, resuelve conflictos, revisa modelos compartidos y migraciones,
ejecuta tests y la prueba E2E.

---

## Checklist E2E (rama de integración)

1. Crear producto con código de barras (Productos).
2. Crear cliente (Clientes).
3. Pantalla principal de venta.
4. Escanear producto A → aparece pendiente.
5. Escanear producto B sin añadir → A se añade solo; B queda pendiente.
6. Añadir B.
7. Asignar cliente.
8. Cobrar en efectivo → cambio correcto.
9. Generar ticket → vista de impresión/imprimir.
10. Consultar "Ventas de hoy" → efectivo/tarjeta separados.
11. Anular último ticket → aparece ANULADO y el neto del día baja.
12. Cierre de caja → recuento real, descuadre, queda guardado.
