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

---

## 6. Impresión térmica ESC/POS y cajón registrador

La app de **escritorio** (Electron) imprime tickets reales en impresoras
térmicas ESC/POS y abre el **cajón registrador** conectado a la impresora.
No usa el diálogo del navegador como sistema principal: genera los bytes
ESC/POS y los envía por IPC seguro (`window.pos`) sin dependencias nativas.

### Arquitectura

```
Renderer (React)                 Main (Electron, electron/)
  hooks/pos.ts ─┐                 ipc/printerIpc.cjs  (handlers pos:*)
  lib/printing  ├─ window.pos ──▶ services/printerService.cjs (transportes)
  (payload)     ┘                 services/cashDrawerService.cjs
                                   escpos/escpos.cjs  (bytes ESC/POS)
```

- El **renderer** construye el ticket como objeto plano (`buildReceiptPayload`)
  y pasa la `PrinterConfig` en cada llamada. El **main es stateless**.
- El renderer **nunca** toca `ipcRenderer`: solo la API acotada `window.pos`.
- Toda impresión/apertura queda registrada (`print_jobs`, `cash_drawer_events`,
  `audit_events`) y es consultable en **Auditoría** (solo administración).

### Comandos de escritorio

```bash
npm run app:dev      # Vite + ventana Electron (desarrollo)
npm run app:start    # build + ventana Electron
npm run app:build    # genera dist-app/Aurora TPV-win32-x64/Aurora TPV.exe
```

> En `npm run dev` (navegador) **no** hay acceso al hardware: las pruebas y la
> impresión ESC/POS requieren la app de escritorio. La venta no se bloquea: el
> ticket queda `pendiente` y puede imprimirse desde el diálogo del sistema.

### Configurar una impresora térmica **USB**

1. Instala el **driver de Windows** de la impresora (Epson/Bixolon/genérica).
   Debe aparecer en *Configuración → Impresoras y escáneres*.
2. En la app: **Ajustes → Impresora y cajón** (`/ajustes/impresora`).
3. Tipo de conexión: **Impresora de Windows (USB/instalada)**.
4. Pulsa el botón de refrescar y **selecciona tu impresora** de la lista.
5. Ajusta ancho de papel (58/80 mm), corte automático y copias. **Guardar**.
6. Pulsa **Probar ticket** y **Ticket completo** para validar.

### Configurar una impresora **de red (Ethernet/Wi-Fi)**

1. Anota la **IP** de la impresora (suele imprimir un test al encender).
2. Tipo de conexión: **Red (IP / Ethernet)**.
3. Introduce **IP** y **puerto** (`9100` por defecto). **Guardar** y **Probar**.

### Configurar y probar el **cajón registrador**

1. Conecta el cajón por **RJ11** a la impresora (no va al PC directamente).
2. En **Ajustes → Impresora y cajón**, elige el **pin** (normalmente `2`; en
   algunos modelos `5`) y activa *Abrir cajón en ventas en efectivo*.
3. Pulsa **Probar cajón**. En cada venta en efectivo se abre automáticamente.
4. Apertura manual con motivo desde **Caja → Abrir cajón** (queda auditada).

### Migración de base de datos

Modo Supabase: ejecuta `supabase/migrations/0011_pos_printing_cash_drawer.sql`
(o el `supabase/setup.sql` completo, que ya lo incluye).

### Limitaciones conocidas

- **Solo Windows** probado (descubrimiento de impresoras vía PowerShell;
  transporte serie vía `cmd`). Linux/macOS quedan pendientes.
- **Logo raster** y **QR** son opcionales; el QR se imprime si la impresora lo
  soporta. El logo raster no está implementado en v1 (se imprime el nombre).
- Codificación `cp858`/`cp850` aproximada con `latin1` (sin `iconv`):
  caracteres fuera de Latin-1 pueden no imprimirse correctamente.
- Sin permisos nuevos: reimpresión y apertura manual del cajón requieren el
  permiso `open_close_cash` (en esta instalación lo tienen admin, encargado **y
  dependiente**). Todo queda registrado en auditoría.
- Sin pruebas de hardware automatizadas: los tests cubren los **bytes** ESC/POS
  y la lógica; valida con una impresora real desde *Probar ticket*.
