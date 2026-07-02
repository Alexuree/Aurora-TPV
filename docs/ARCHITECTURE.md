# Arquitectura — Aurora TPV

Documento técnico del TPV. Escrito desde la perspectiva de diseño de un
producto comercial real, no de una demo.

---

## 1. Visión general

```
┌──────────────────────────────────────────────────────────────┐
│                        NAVEGADOR (SPA)                         │
│                                                                │
│  UI (React + Tailwind)                                         │
│     │  usa                                                     │
│     ▼                                                          │
│  Hooks de datos (TanStack Query)  ── estado servidor/caché     │
│  Stores (Zustand): auth, carrito  ── estado de interacción     │
│     │  llama a                                                 │
│     ▼                                                          │
│  Repository (interfaz)            ── contrato de persistencia  │
│     ├── LocalRepository  (localStorage)                        │
│     └── SupabaseRepository ─────────────┐                      │
│                                          │  HTTPS              │
│  Domain (lógica de negocio pura) ◄───────┘ (consumido por      │
│     money · cart · payments · permissions   ambas impl.)       │
└──────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
                          ┌───────────────────────────────┐
                          │   SUPABASE (modo nube)         │
                          │   PostgreSQL + Auth + RLS      │
                          │   Funciones RPC transaccionales│
                          └───────────────────────────────┘
```

**Principios de diseño**

1. **Separación lógica / interfaz / persistencia.** `domain/` no importa React
   ni Supabase. La UI solo conoce la interfaz `Repository`.
2. **Doble persistencia tras un mismo contrato.** Permite usar la app *hoy*
   (local) y escalar a multi-terminal (Supabase) sin reescribir la UI.
3. **Las operaciones críticas son atómicas.** Venta y cierre de
   caja se ejecutan como una unidad (en Supabase, vía funciones `SECURITY
   DEFINER`; en local, dentro de un único método del repositorio).
4. **El dinero se calcula en un solo sitio** (`domain/cart.ts`,
   `domain/money.ts`) con redondeo a 2 decimales, para que el ticket cuadre
   siempre.

**Stack:** React 19 · TypeScript · Vite · Tailwind v4 · Zustand · TanStack
Query · React Router · Supabase JS · lucide-react.

---

## 2. Pantallas principales

| Ruta             | Pantalla            | Rol mínimo | Descripción |
|------------------|---------------------|------------|-------------|
| `/`              | **Venta**           | Dependiente| Catálogo + ticket + cobro. Bloqueada si la caja está cerrada. |
| `/ventas`        | Historial de ventas | Dependiente| Filtros por fecha, ver/imprimir recibo. |
| `/productos`     | Productos           | Encargado  | Alta/edición/baja del catálogo. |
| `/caja`          | Caja                | Dependiente| Apertura, movimientos, cierre. |
| `/informes`      | Informes            | Encargado  | KPIs, rankings, CSV. |
| `/usuarios`      | Usuarios            | Admin      | Personal y permisos. |
| `/ajustes`       | Ajustes             | Admin      | Datos de tienda / ticket. |
| `/ajustes/impresora` | Impresora y cajón | Admin | Configuración ESC/POS, pruebas y cajón. |
| `/auditoria`     | Auditoría           | Admin      | Eventos de impresión, caja, cajón y configuración. |

**Layout de la pantalla de venta** (prioriza velocidad):

```
┌───────────────────────────────┬───────────────────────┐
│  [ Buscar / escanear código ] │  Cliente mostrador  ▸ │
│  [Todo][Perfumes][Colonias]…  │ ───────────────────── │
│  ┌─────┐┌─────┐┌─────┐┌─────┐ │  2× Sauvage   99,90 € │
│  │ tarj││ tarj││ tarj││ tarj│ │  1× Carrete   11,95 € │
│  └─────┘└─────┘└─────┘└─────┘ │  …                    │
│  ┌─────┐┌─────┐┌─────┐┌─────┐ │ ───────────────────── │
│  │     ││     ││     ││     │ │  Base   ·  IVA  ·  Dto │
│  └─────┘└─────┘└─────┘└─────┘ │  TOTAL        211,75 €│
│                               │  [   COBRAR   ] [ ✕ ] │
└───────────────────────────────┴───────────────────────┘
```

---

## 3. Modelo de datos

Relaciones principales (PK = clave primaria, FK = clave externa):

```
roles ──< role_permissions >── permissions
auth.users 1──1 profiles (role → roles)

categories 1──< products
products    ──< sale_items          (por product_id, sin FK dura: histórico)

customers  1──< sales
profiles   1──< sales (cashier)
cash_sessions 1──< sales
cash_sessions 1──< cash_movements

sales 1──< sale_items
sales 1──< payments
sales 1──< print_jobs
cash_sessions 1──< cash_drawer_events
audit_events

settings (fila única, id = 1)
```

**Tablas** (resumen de campos relevantes):

- **profiles** — `id` (=auth.users), `username`, `full_name`, `role`, `active`.
- **categories** — `id`, `name`, `color`, `sort_order`, `active`.
- **products** — `id`, `name`, `brand`, `sku`, `barcode`, `category_id`,
  `price` (PVP, IVA incl.), `cost`, `iva_rate`, `tax_included`, `active`.
- **customers** — `id`, `name`, `phone`, `email`, `tax_id`, `notes`.
- **sales** — `id`, `number` (correlativo), `cashier_id/name`,
  `cash_session_id`, `customer_id/name`, `status`, `subtotal`, `tax_total`,
  `discount_total`, `total`, `cash_given`, `change_given`.
- **sale_items** — `sale_id`, `product_id`, `name`, `quantity`, `unit_price`,
  `discount_pct`, `iva_rate`, `tax_base`, `tax_amount`, `line_total`,
  `returned_qty`. *(Se copia `name`/`unit_price` para conservar el histórico
  aunque el producto cambie después.)*
- **payments** — `sale_id`, `method` (`cash`|`card`), `amount`.
- **cash_sessions** — `opening_float`, `status`, `counted_cash`,
  `expected_cash`, `difference`, marcas de apertura/cierre.
- **cash_movements** — `cash_session_id`, `type` (`in`|`out`), `amount`,
  `reason`.
- **print_jobs** — trabajos de impresión original/copia/test y estado.
- **cash_drawer_events** — aperturas de cajón por venta, prueba, manual o caja.
- **audit_events** — trazabilidad de ventas, impresión, cajón, caja y ajustes.

Un índice único parcial garantiza **una sola caja abierta** a la vez
(`uniq_open_cash`). Los números de ticket usan **secuencias**.

---

## 4. Flujo principal de venta (detallado)

```
sesión de dispositivo → operador → ¿caja abierta? ──no──► abrir caja (fondo)
   │ sí
   ▼
buscar/escanear ─► añadir línea ─► (±cantidad, descuento*, precio*) 
   ▼
COBRAR ─► método (efectivo/tarjeta/mixto) ─► validar ─► confirmar
   ▼
process_sale (atómico): inserta venta+líneas+pagos y datos fiscales
   ▼
impresión ESC/POS ─► cajón si efectivo ─► auditoría ─► nueva venta
```
`*` requiere permiso.

---

## 5. API / RPC

En **modo Supabase**, el acceso a datos se reparte entre:

- **REST autogenerado** (PostgREST) para lecturas/escrituras simples:
  `GET/POST/PATCH /rest/v1/products`, `categories`, `customers`, `sales`,
  `cash_sessions`, `settings`, `profiles`, …
- **Funciones RPC** (`POST /rest/v1/rpc/<fn>`) para lógica transaccional:

| Función | Entrada | Efecto |
|---|---|---|
| `process_sale(payload jsonb)` | venta completa | Inserta venta, líneas y pagos; genera numeración fiscal y auditoría. Devuelve `sale_id`. |
| `close_cash_session(id,user,counted,note)` | cierre | Calcula efectivo previsto y descuadre; cierra la sesión. |

La interfaz `Repository` (en `src/data/repository.ts`) es el **contrato
equivalente** que también cumple el modo local; sirve como especificación de la
"API" independientemente del backend.

---

## 6. Lógica de negocio y reglas de cálculo

- **Precios con IVA incluido** (estándar retail ES). La base imponible se
  obtiene como `bruto / (1 + iva/100)`; la cuota es `bruto − base`.
- **Línea:** `bruto = precio_unitario × cantidad`; se aplica el descuento de
  línea; todo se **redondea a 2 decimales** en cada paso (round half away from
  zero) para evitar descuadres de céntimos.
- **Ticket:** suma de bases, cuotas y totales con **desglose de IVA por tipo**.
- **Cobro:** la suma de pagos registrados **debe igualar el total**. El exceso
  solo es válido si proviene de **efectivo** y se devuelve como **cambio** (no
  se almacena como pago). Tarjeta se cobra exacta.
- **Caja:** `efectivo previsto = fondo + ventas en efectivo + entradas −
  salidas`. Cierre **a ciegas**: el descuadre se
  muestra tras introducir el conteo.

---

## 7. Reglas de validación

- No se puede vender con la **caja cerrada**.
- Cantidades > 0; el descuento se acota a 0–100 %; el precio no es negativo.
- Cobro no confirmable si los pagos no cubren el total; en mixto,
  tarjeta no puede superar el total.

---

## 8. Seguridad

- **Autenticación:** el shell Electron lee la cuenta de dispositivo desde
  `device.json` y abre sesión de Supabase automáticamente. El operador visible
  se elige en la cabecera; en modo local se usan los operadores semilla.
- **Autorización por capas:**
  - UI: la navegación y los botones sensibles se ocultan por permiso.
  - Rutas: `RequirePermission` impide el acceso directo por URL.
  - Datos: **Row Level Security** activada en todas las tablas. La política base
    permite operar a usuarios autenticados; debe **endurecerse** (p. ej.
    limitar `profiles`/`settings` a `admin`, o acciones sensibles a roles con
    permiso) mediante políticas que consulten el `role` del perfil.
- **Integridad:** las operaciones de venta/caja son funciones `SECURITY
  DEFINER` del servidor, no cálculos confiados al cliente.
- **Trazabilidad:** ventas, impresión, cajón y movimientos de caja registran
  usuario, fecha y metadatos.

> Recomendación de endurecimiento: crear una función `auth_role()` que lea
> `profiles.role` del usuario actual y usarla en las políticas RLS de escritura.

---

## 9. Recomendaciones para escalar

1. **Endurecer RLS** por rol (lo más prioritario antes de producción real).
2. **Multi-tienda:** añadir `store_id` a las tablas operativas y a `profiles`;
   incluirlo en políticas e índices.
3. **Impresión térmica:** la integración ESC/POS y el cajón ya viven en el
   shell Electron; seguir ampliando compatibilidad por modelo si hace falta.
4. **Facturación:** emisión de factura simplificada/completa y series; base de
   datos ya guarda IVA desglosado y datos fiscales del cliente.
5. **Offline-first con Supabase:** cola de operaciones y sincronización para
   resistir cortes de red (el patrón Repository facilita añadir una capa de
   sincronización).
6. **Rendimiento de catálogo grande:** búsqueda del lado servidor con índices y
   paginación; ya existen índices por `barcode`/`sku`/`category_id`.
7. **Code-splitting** por ruta para reducir el bundle inicial.
8. **Tests:** la lógica de `domain/` es pura y directamente testeable
   (Vitest): cálculo de líneas, totales, cambio y pago mixto.
