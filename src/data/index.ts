// =====================================================================
// Punto único para obtener el repositorio activo. El resto de la app
// importa SOLO desde aquí y nunca conoce la implementación concreta.
// =====================================================================

import { dataMode } from '@/config/env';
import { getSupabase } from '@/lib/supabase';
import type { Repository } from '@/data/repository';
import { LocalRepository } from '@/data/local/localRepository';
import { SupabaseRepository } from '@/data/supabase/supabaseRepository';

let instance: Repository | null = null;

export function getRepository(): Repository {
  if (instance) return instance;
  const sb = getSupabase();
  if (dataMode === 'supabase' && sb) {
    instance = new SupabaseRepository(sb);
  } else {
    instance = new LocalRepository();
  }
  return instance;
}

export const repo = getRepository();
export type { Repository } from '@/data/repository';
