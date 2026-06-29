# Aurora TPV — Perfumería · Colonias · Fotografía

TPV (Terminal Punto de Venta) profesional para tienda de mostrador, pensado
para **uso real** y no como demo. Atiende a un cliente a la vez, con un flujo
de venta rápido en pocos clics, control de stock, caja, devoluciones, informes
y usuarios con permisos.

> **Arranca y vende en 1 minuto:** funciona en **modo local** (datos en el
> navegador) sin montar nada. Cuando quieras, lo conectas a **Supabase**
> (PostgreSQL en la nube) cambiando dos variables de entorno.

---

## 1. Puesta en marcha

Requisitos: **Node.js 18+** (probado con Node 24).

```bash
npm install      # instala dependencias
npm run dev      # arranca en http://localhost:5173
```

Abre `http://localhost:5173`. En modo local ya hay catálogo de ejemplo
(perfumes, colonias, material de fotografía) y tres usuarios de prueba:

| Rol           | Usuario        | PIN   |
|---------------|----------------|-------|
| Administrador | `admin`        | 1234  |
| Encargado     | `encargado`    | 2222  |
| Dependiente   | `dependiente`  | 0000  |

> En la pantalla de acceso hay botones de **acceso rápido** para entrar con un clic.

### Flujo de venta
1. Inicia sesión.
2. **Abre la caja** con el saldo inicial (obligatorio para vender).
3. Busca o **escanea** un producto → se añade al ticket.
4. Ajusta cantidades / descuentos (según permisos).
5. Pulsa **COBRAR** → elige método (efectivo/tarjeta/Bizum/mixto) → confirma.
6. Se genera el **recibo** (imprimible) y el TPV vuelve a una venta nueva.

---

## 2. Comandos

```bash
npm run dev        # desarrollo con recarga en caliente
npm run build      # build de producción (typecheck + bundle en /dist)
npm run preview    # sirve el build de producción
npm run typecheck  # solo comprobación de tipos
```

---

## 3. Modo Supabase (base de datos en la nube)

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com).
2. En el **SQL Editor**, ejecuta en orden:
   - `supabase/migrations/0001_initial_schema.sql`
   - `supabase/seed.sql`
3. Crea los usuarios en **Authentication → Users** (email + contraseña). El
   `role` se asigna en su perfil; por defecto `cashier`. Para hacer admin a un
   usuario, en SQL Editor:
   ```sql
   update profiles set role = 'admin' where username = 'tu@correo.com';
   ```
4. Copia `.env.example` a `.env` y rellena:
   ```env
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGc...
   ```
5. Reinicia `npm run dev`. La app detecta la configuración y usa Supabase.
   El acceso pasa a ser **email + contraseña**.

> Sin variables de Supabase, la app sigue funcionando en modo local.

---

## 4. Estructura del proyecto

```
TPV_TIENDA/
├─ public/                 logo.svg, favicon.svg
├─ supabase/
│  ├─ migrations/0001_initial_schema.sql   esquema + RLS + funciones RPC
│  └─ seed.sql                              datos de ejemplo
├─ src/
│  ├─ config/env.ts        decide modo local/supabase
│  ├─ domain/              LÓGICA DE NEGOCIO pura (sin framework)
│  │  ├─ types.ts          modelo de datos
│  │  ├─ money.ts          redondeo/formato monetario
│  │  ├─ cart.ts           cálculo de ticket (IVA, descuentos, totales)
│  │  ├─ payments.ts       cobro, cambio, pago mixto
│  │  └─ permissions.ts    matriz rol → permisos
│  ├─ data/                PERSISTENCIA (patrón Repository)
│  │  ├─ repository.ts     contrato (interfaz)
│  │  ├─ local/            implementación localStorage (+ seed)
│  │  ├─ supabase/         implementación Supabase
│  │  └─ index.ts          factory: elige implementación por entorno
│  ├─ store/               estado (Zustand): auth, carrito
│  ├─ hooks/data.ts        acceso a datos con TanStack Query
│  ├─ components/
│  │  ├─ ui/               kit reutilizable (Button, Modal, …)
│  │  ├─ layout/           AppShell (navegación + cabecera)
│  │  └─ pos/              componentes del TPV (rejilla, ticket, cobro…)
│  ├─ pages/               una página por módulo
│  ├─ App.tsx              router + guardas de acceso
│  └─ main.tsx             punto de entrada
└─ docs/ARCHITECTURE.md    diseño técnico detallado
```

La regla clave: **`domain/` no depende de React ni de Supabase**, y la UI nunca
conoce de dónde salen los datos (solo habla con `Repository`). Esto permite
cambiar de almacenamiento o reutilizar la lógica sin tocar la interfaz.

---

## 5. Funcionalidades

- **Venta:** búsqueda/escáner, categorías, ticket en tiempo real, descuentos y
  cambio de precio por permiso, IVA desglosado, aparcar implícito (cancelar).
- **Cobro:** efectivo (con cambio y entregas rápidas), tarjeta, Bizum y mixto.
- **Inventario:** descuento automático de stock, avisos de stock bajo, ajustes
  manuales y registro de movimientos.
- **Caja:** apertura con fondo, entradas/salidas, cierre a ciegas con descuadre
  y resumen por método de pago.
- **Devoluciones:** localizar venta, devolver parcial o total, reintegrar stock.
- **Informes:** facturación, ticket medio, top productos, por categoría y método
  de pago, beneficio estimado, exportación CSV.
- **Usuarios:** roles Administrador / Encargado / Dependiente con permisos.

Consulta [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) para el diseño completo.
