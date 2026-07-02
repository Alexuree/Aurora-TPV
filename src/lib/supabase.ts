// =====================================================================
// Cliente Supabase. Se crea solo si hay configuración. La app puede
// funcionar sin él (modo local), por eso devuelve null cuando falta.
// =====================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, hasSupabaseConfig } from '@/config/env';

let client: SupabaseClient | null = null;

export interface DeviceCredentials {
  email: string;
  password: string;
  defaultOperator: string;
  configPath?: string;
}

export function getSupabase(): SupabaseClient | null {
  if (!hasSupabaseConfig) return null;
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

/**
 * Credenciales de la cuenta de dispositivo. Prioridad: el device.json LOCAL
 * (expuesto por el shell de Electron vía window.pos) y, si no hay, las de
 * .env (build local/desarrollo). Así el bundle web alojado NO lleva secretos.
 */
export async function getDeviceCredentials(): Promise<DeviceCredentials> {
  let email = env.deviceEmail;
  let password = env.devicePassword;
  let defaultOperator = env.defaultOperator;
  let configPath: string | undefined;
  const pos = typeof window !== 'undefined' ? window.pos : undefined;
  if (pos?.getDeviceConfig) {
    try {
      const cfg = await pos.getDeviceConfig();
      email = cfg?.email || email;
      password = cfg?.password || password;
      defaultOperator = cfg?.defaultOperator || defaultOperator;
      configPath = cfg?.path;
    } catch {
      /* usa los valores de .env */
    }
  }
  return { email, password, defaultOperator, configPath };
}

/** Email de la sesión de Supabase activa (para elegir el operador por defecto). */
export async function getSessionEmail(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user?.email ?? null;
}

/**
 * Garantiza que hay una sesión de Supabase con la CUENTA DE DISPOSITIVO,
 * sin pantalla de login. Si ya hay sesión de esa cuenta, no hace nada; si
 * hay sesión de otra cuenta (p.ej. una antigua), la cierra y entra con la
 * de dispositivo. En modo local no hace nada.
 */
export async function ensureDeviceSession(): Promise<DeviceCredentials> {
  const credentials = await getDeviceCredentials();
  const sb = getSupabase();
  if (!sb) return credentials; // modo local
  const { email: deviceEmail, password: devicePassword, configPath } = credentials;
  const { data } = await sb.auth.getSession();
  const currentEmail = data.session?.user?.email?.toLowerCase() ?? null;

  // Sin credenciales de dispositivo: si hay una sesión previa, se usa; si no, error claro.
  if (!deviceEmail || !devicePassword) {
    if (data.session) return credentials;
    throw new Error(
      `Falta la cuenta de dispositivo: configúrala en device.json${configPath ? ` (${configPath})` : ''} ` +
        '(o en .env para desarrollo local)',
    );
  }

  if (currentEmail === deviceEmail.toLowerCase()) return credentials; // ya es la cuenta correcta
  if (data.session) await sb.auth.signOut(); // sesión de otra cuenta → cerrarla

  const { error } = await sb.auth.signInWithPassword({ email: deviceEmail, password: devicePassword });
  if (error) throw new Error(`No se pudo iniciar sesión del dispositivo (${deviceEmail}): ${error.message}`);
  return credentials;
}
