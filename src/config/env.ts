// =====================================================================
// Configuración derivada de variables de entorno (Vite import.meta.env).
// Decide en qué modo de persistencia arranca la aplicación.
// =====================================================================

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const forced = import.meta.env.VITE_DATA_MODE ?? 'auto';

export const hasSupabaseConfig = Boolean(url && anonKey);

export type DataMode = 'local' | 'supabase';

export const dataMode: DataMode =
  forced === 'supabase' ? 'supabase' : forced === 'local' ? 'local' : hasSupabaseConfig ? 'supabase' : 'local';

export const env = {
  supabaseUrl: url ?? '',
  supabaseAnonKey: anonKey ?? '',
  dataMode,
};
