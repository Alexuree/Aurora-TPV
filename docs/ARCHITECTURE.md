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
3. **Las operaciones críticas son atómicas.** Venta, devolución y cierre de
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
| `/login`         | Acceso              | —          | Usuario+PIN (local) / email+contraseña (Supabase). |
| `/`              | **Venta**           | Dependiente| Catálogo + ticket + cobro. Bloqueada si la caja está cerrada. |
| `/ventas`        | Historial de ventas | Dependiente| Filtros por fecha, ver/imprimir recibo. |
| `/devoluciones`  | Devoluciones        | Encargado  | Localizar venta y devolver artículos. |
| `/productos`     | Productos           | Encargado  | Alta/edición/baja del catálogo. |
| `/inventario`    | Inventario          | Encargado  | Stock, avisos, ajustes, movimientos. |
| `/caja`          | Caja                | Dependiente| Apertura, movimientos, cierre. |
| `/informes`      | Informes            | Encargado  | KPIs, rankings, CSV. |
| `/usuarios`      | Usuarios            | Admin      | Personal y permisos. |
| `/ajustes`       | Ajustes             | Admin      | Datos de tienda / ticket. |

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
            ──< stock_movements

customers  1──< sales
profiles   1──< sales (cashier)
cash_sessions 1──< sales
cash_sessions 1──< cash_movements

sales 1──< sale_items
sales 1──< payments
sales 1──< sale_returns 1──< return_items

settings (fila única, id = 1)
```

**Tablas** (resumen de campos relevantes):

- **profiles** — `id` (=auth.users), `username`, `full_name`, `role`, `active`.
- **categories** — `id`, `name`, `color`, `sort_order`, `active`.
- **products** — `id`, `name`, `brand`, `sku`, `barcode`, `category_id`,
  `price` (PVP, IVA incl.), `cost`, `iva_rate`, `tax_included`, `stock`,
  `track_stock`, `low_stock_threshold`, `active`.
- **customers** — `id`, `name`, `phone`, `email`, `tax_id`, `notes`.
- **sales** — `id`, `number` (correlativo), `cashier_id/name`,
  `cash_session_id`, `customer_id/name`, `status`, `subtotal`, `tax_total`,
  `discount_total`, `total`, `cash_given`, `change_given`.
- **sale_items** — `sale_id`, `product_id`, `name`, `quantity`, `unit_price`,
  `discount_pct`, `iva_rate`, `tax_base`, `tax_amount`, `line_total`,
  `returned_qty`. *(Se copia `name`/`unit_price` para conservar el histórico
  aunque el producto cambie después.)*
- **payments** — `sale_id`, `method` (`cash`|`card`|`bizum`), `amount`.
- **cash_sessions** — `opening_float`, `status`, `counted_cash`,
  `expected_cash`, `difference`, marcas de apertura/cierre.
- **cash_movements** — `cash_session_id`, `type` (`in`|`out`), `amount`,
  `reason`.
- **sale_returns / return_items** — devolución y sus líneas.
- **stock_movements** — `product_id`, `type`
  (`sale`|`return`|`adjustment`|`purchase`), `quantity`, `resulting_stock`,
  `reference`.

Un índice único parcial garantiza **una sola caja abierta** a la vez
(`uniq_open_cash`). Los números de ticket/devolución usan **secuencias**.

---

## 4. Flujo principal de venta (detallado)

```
login → ¿caja abierta? ──no──► abrir caja (fondo)
   │ sí
   ▼
buscar/escanear ─► añadir línea ─► (±cantidad, descuento*, precio*) 
   ▼
COBRAR ─► método (efectivo/tarjeta/bizum/mixto) ─► validar ─► confirmar
   ▼
process_sale (atómico): inserta venta+líneas+pagos, descuenta stock,
                         registra movimientos de stock
   ▼
recibo (imprimible) ─► nueva venta
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
| `process_sale(payload jsonb)` | venta completa | Inserta venta, líneas y pagos; descuenta stock; registra movimientos. Devuelve `sale_id`. |
| `process_return(payload jsonb)` | devolución | Inserta devolución y líneas; suma `returned_qty`; reintegra stock; actualiza estado de la venta. |
| `close_cash_session(id,user,counted,note)` | cierre | Calcula efectivo previsto y descuadre; cierra la sesión. |
| `adjust_stock(product,new,reason,user)` | ajuste | Fija stock y registra el movimiento. |

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
  se almacena como pago). Tarjeta/Bizum se cobran exactos.
- **Caja:** `efectivo previsto = fondo + ventas en efectivo + entradas −
  salidas − devoluciones en efectivo`. Cierre **a ciegas**: el descuadre se
  muestra tras introducir el conteo.
- **Stock:** cada venta descuenta y cada devolución (con reintegro) suma;
  ambos dejan rastro en `stock_movements`. Productos `track_stock=false`
  (servicios de revelado) no afectan al inventario.

---

## 7. Reglas de validación

- No se puede vender con la **caja cerrada**.
- Cantidades > 0; el descuento se acota a 0–100 %; el precio no es negativo.
- Aviso visible si la cantidad supera el stock disponible (no bloquea, decide
  el dependiente).
- Cobro no confirmable si los pagos no cubren el total; en mixto,
  tarjeta+Bizum no pueden superar el total.
- Devolución: cantidad por línea acotada a lo realmente pendiente
  (`quantity − returned_qty`); motivo obligatorio.

---

## 8. Seguridad

- **Autenticación:** Supabase Auth (email+contraseña) en producción; modo local
  con usuario+PIN solo para uso sin backend.
- **Autorización por capas:**
  - UI: la navegación y los botones sensibles se ocultan por permiso.
  - Rutas: `RequirePermission` impide el acceso directo por URL.
  - Datos: **Row Level Security** activada en todas las tablas. La política base
    permite operar a usuarios autenticados; debe **endurecerse** (p. ej.
    limitar `profiles`/`settings` a `admin`, o `process_return` a roles con
    permiso) mediante políticas que consulten el `role` del perfil.
- **Integridad:** las operaciones de dinero/stock son funciones `SECURITY
  DEFINER` del servidor, no cálculos confiados al cliente.
- **Trazabilidad:** ventas, devoluciones y movimientos de stock/caja registran
  usuario y fecha.

> Recomendación de endurecimiento: crear una función `auth_role()` que lea
> `profiles.role` del usuario actual y usarla en las políticas RLS de escritura.

---

## 9. Recomendaciones para escalar

1. **Endurecer RLS** por rol (lo más prioritario antes de producción real).
2. **Multi-tienda:** añadir `store_id` a las tablas operativas y a `profiles`;
   incluirlo en políticas e índices.
3. **Impresión térmica:** integrar impresora de tickets (ESC/POS) y cajón
   portamonedas; ya existe la vista `Receipt` lista para imprimir.
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
