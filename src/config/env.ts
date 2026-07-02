// =====================================================================
// Configuración derivada de variables de entorno (Vite import.meta.env).
// Decide en qué modo de persistencia arranca la aplicación.
// =====================================================================

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const forced = import.meta.env.VITE_DATA_MODE ?? 'auto';

// Cuenta de dispositivo: la app inicia sesión sola con estas credenciales al
// arrancar (sin pantalla de login). Los operadores luego se cambian sin clave.
const deviceEmail = import.meta.env.VITE_DEVICE_EMAIL?.trim();
const devicePassword = import.meta.env.VITE_DEVICE_PASSWORD?.trim();
// Operador mostrado por defecto (por username/email). Si no se indica, el de la cuenta.
const defaultOperator = (import.meta.env.VITE_DEFAULT_OPERATOR?.trim() || deviceEmail) ?? '';

export const hasSupabaseConfig = Boolean(url && anonKey);

export type DataMode = 'local' | 'supabase';

export const dataMode: DataMode =
  forced === 'supabase' ? 'supabase' : forced === 'local' ? 'local' : hasSupabaseConfig ? 'supabase' : 'local';

export const env = {
  supabaseUrl: url ?? '',
  supabaseAnonKey: anonKey ?? '',
  deviceEmail: deviceEmail ?? '',
  devicePassword: devicePassword ?? '',
  defaultOperator,
  dataMode,
};
