// =====================================================================
// Configuración POR EQUIPO (device.json en la carpeta de usuario).
//
// Contiene la URL de la app alojada en la nube y las credenciales de la
// cuenta de dispositivo. Así los secretos NO viajan en el bundle web
// público: viven solo en cada equipo. Si el fichero no existe, se crea una
// plantilla vacía y la app usa la copia local incluida (compatibilidad).
// =====================================================================

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const TEMPLATE = {
  // URL de la app alojada. Vacío = usa la copia local incluida en el shell.
  appUrl: '',
  // Cuenta de dispositivo de Supabase (inicio de sesión automático).
  deviceEmail: '',
  devicePassword: '',
  // Opcional: username/email del operador que aparece por defecto.
  defaultOperator: '',
};

function sanitizeConfig(raw) {
  const cfg = { ...TEMPLATE, ...(raw && typeof raw === 'object' ? raw : {}) };
  return {
    appUrl: String(cfg.appUrl || '').trim(),
    deviceEmail: String(cfg.deviceEmail || '').trim(),
    devicePassword: String(cfg.devicePassword || ''),
    defaultOperator: String(cfg.defaultOperator || '').trim(),
  };
}

function configPath() {
  return path.join(app.getPath('userData'), 'device.json');
}

/** Lee device.json (creándolo vacío la primera vez). Nunca lanza. */
function loadDeviceConfig() {
  const p = configPath();
  try {
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, JSON.stringify(TEMPLATE, null, 2), 'utf8');
      return sanitizeConfig(TEMPLATE);
    }
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return sanitizeConfig(raw);
  } catch (e) {
    console.error('[config] No se pudo leer device.json:', e && e.message);
    return sanitizeConfig(TEMPLATE);
  }
}

module.exports = { loadDeviceConfig, configPath };
