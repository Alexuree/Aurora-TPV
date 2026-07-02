# Instalación en otro PC y actualizaciones por nube

Esta instalación separa dos piezas:

- **Renderer web**: la app React compilada en `dist/`, publicada en Vercel, Netlify, Cloudflare Pages o cualquier hosting estático.
- **Shell Electron**: instalador Windows que se instala una vez por equipo. Carga la URL del renderer y mantiene `window.pos` para impresora/cajón.

El PC de la tienda no necesita Node.js, npm ni Git. Solo Windows y el instalador.

## 1. Desplegar el renderer en la nube

En el hosting estático configura:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_DATA_MODE=supabase
```

No configures `VITE_DEVICE_EMAIL` ni `VITE_DEVICE_PASSWORD` en el hosting público.

Build command:

```bash
npm run build
```

Output directory:

```txt
dist
```

Como la app usa `HashRouter` y `base: './'`, no necesita rewrites de servidor.

## 2. Crear el instalador del shell

En el PC de desarrollo, deja `.env` con la URL y anon key de Supabase. No pongas contraseña de dispositivo en el bundle:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_DATA_MODE=supabase
VITE_DEVICE_EMAIL=
VITE_DEVICE_PASSWORD=
VITE_DEFAULT_OPERATOR=
```

Genera el instalador:

```bash
npm install
npm run app:installer
```

El instalador queda en `dist-app/`.

## 3. Instalar en el PC nuevo

1. Copia el `.exe` de `dist-app/` al PC nuevo.
2. Ejecútalo.
3. Abre Aurora TPV una vez. Si no existe configuración, creará `device.json` vacío.
4. Menú superior oculto: pulsa `Alt` si no se ve y abre `Aurora TPV -> Abrir configuración del dispositivo`.
5. Edita `device.json`:

```json
{
  "appUrl": "https://aurora-tpv.vercel.app/",
  "deviceEmail": "terminal-1@tu-tienda.com",
  "devicePassword": "contraseña-del-terminal",
  "defaultOperator": "admin@tu-tienda.com"
}
```

6. Cierra y vuelve a abrir la app.

La cuenta `deviceEmail` debe existir en Supabase Auth y tener un perfil en `profiles`.

## 4. Cómo llegan las actualizaciones

Para cambios de React, pantallas, lógica de venta, informes, ajustes, etc.:

1. Haces commit en el repo.
2. El hosting despliega `dist/` automáticamente.
3. El TPV carga la versión nueva al abrir o recargar.

No hay que reinstalar nada en el PC de la tienda.

Solo hay que generar un nuevo instalador si cambia el shell Electron: impresión/cajón, preload, IPC, menú, `device.json` o lógica de fallback.

## 5. Fallback offline

Si el shell no puede cargar `appUrl`, abre la copia local incluida en el instalador (`dist/index.html`). Esto evita una pantalla en blanco si cae el hosting.

Importante: si la app está en modo Supabase y tampoco hay conexión a Supabase, la funcionalidad queda limitada por los datos/sesión ya cacheados. Para operación 100% offline prolongada habría que usar modo local o añadir una sincronización completa de catálogo/usuarios/caja.

## 6. Seguridad

- `VITE_SUPABASE_ANON_KEY` es pública y puede vivir en el bundle.
- La contraseña del terminal NO se publica: vive en `device.json` de cada equipo.
- Si alguien abre la URL web fuera del shell, no tiene `window.pos.getDeviceConfig()` y no puede iniciar sesión de dispositivo.
- El shell evita navegar dentro de la ventana a dominios que no sean el `appUrl` configurado; los enlaces externos se abren fuera.
