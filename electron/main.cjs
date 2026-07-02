// =====================================================================
// Aurora TPV — Proceso principal de Electron (app de escritorio).
// En desarrollo carga el servidor de Vite; empaquetada carga /dist.
// =====================================================================

const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const path = require('path');
const { registerIpc } = require('./ipc/printerIpc.cjs');
const { loadDeviceConfig, configPath } = require('./config.cjs');

const devUrl = process.env.VITE_DEV_SERVER_URL;

/** Carga la copia local incluida en el shell (offline / sin URL de nube). */
function loadLocal(win) {
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function normalizeRemoteUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    console.error('[main] appUrl inválida en device.json:', raw);
    return null;
  }
}

function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

function canNavigateInShell(targetUrl, remoteUrl) {
  if (devUrl && targetUrl.startsWith(devUrl)) return true;
  if (targetUrl.startsWith('file://')) return true;
  return Boolean(remoteUrl && sameOrigin(targetUrl, remoteUrl.href));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0f172a',
    show: false,
    autoHideMenuBar: true,
    title: 'Aurora TPV',
    icon: path.join(__dirname, '..', 'public', 'favicon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Menú mínimo (sin barra de menús visible, pero con atajos útiles)
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Aurora TPV',
        submenu: [
          { role: 'reload', label: 'Recargar' },
          { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
          {
            label: 'Abrir configuración del dispositivo',
            click: () => {
              loadDeviceConfig(); // crea device.json si aún no existe
              shell.showItemInFolder(configPath());
            },
          },
          { type: 'separator' },
          { role: 'quit', label: 'Salir' },
        ],
      },
      { role: 'editMenu', label: 'Edición' },
      {
        label: 'Ver',
        submenu: [
          { role: 'resetZoom', label: 'Zoom normal' },
          { role: 'zoomIn', label: 'Acercar' },
          { role: 'zoomOut', label: 'Alejar' },
          { role: 'togglefullscreen', label: 'Pantalla completa' },
        ],
      },
    ]),
  );

  win.once('ready-to-show', () => win.show());

  // Los enlaces externos se abren en el navegador del sistema
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const cfg = loadDeviceConfig();
  const remoteUrl = normalizeRemoteUrl(cfg.appUrl);

  win.webContents.on('will-navigate', (event, url) => {
    if (canNavigateInShell(url, remoteUrl)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  if (devUrl) {
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else if (remoteUrl) {
    // App alojada en la nube. Si falla la carga (offline, caída del host),
    // se recurre a la copia local incluida para que el TPV siga abriendo.
    win.webContents.once('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (isMainFrame) {
        console.error('[main] Falló cargar', url, code, desc, '→ usando copia local');
        loadLocal(win);
      }
    });
    win.loadURL(remoteUrl.href);
  } else {
    loadLocal(win);
  }
}

app.whenReady().then(() => {
  registerIpc(); // handlers de impresión térmica y cajón (pos:*)
  // Credenciales de dispositivo: se leen del device.json LOCAL y se entregan
  // al renderer bajo demanda. No viajan en el bundle web público.
  ipcMain.handle('pos:getDeviceConfig', () => {
    const c = loadDeviceConfig();
    return { email: c.deviceEmail, password: c.devicePassword, defaultOperator: c.defaultOperator, path: configPath() };
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
