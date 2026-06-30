// =====================================================================
// Aurora TPV — Proceso principal de Electron (app de escritorio).
// En desarrollo carga el servidor de Vite; empaquetada carga /dist.
// =====================================================================

const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const { registerIpc } = require('./ipc/printerIpc.cjs');

const devUrl = process.env.VITE_DEV_SERVER_URL;

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

  if (devUrl) {
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  registerIpc(); // handlers de impresión térmica y cajón (pos:*)
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
