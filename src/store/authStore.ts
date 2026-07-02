// =====================================================================
// Estado del OPERADOR actual (sin login).
//
// La app no pide credenciales: al arrancar se inicia sesión sola con la
// cuenta de dispositivo (ver ensureDeviceSession) y se elige un operador
// por defecto. El operador es solo la persona que atiende (aparece en el
// ticket y en la auditoría) y se cambia con un clic desde el icono de
// usuario, sin contraseña. Los permisos por rol siguen filtrando la
// navegación como comodidad (no como seguridad real, ya que el cambio de
// operador es libre en un TPV de mostrador).
// =====================================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Permission, User } from '@/domain/types';
import { hasPermission } from '@/domain/permissions';
import { ensureDeviceSession } from '@/lib/supabase';
import { repo } from '@/data';

interface AuthState {
  user: User | null; // operador actual
  operators: User[]; // operadores activos disponibles para el selector
  operatorId: string | null; // persistido para recordar el último operador
  ready: boolean; // bootstrap terminado con éxito
  error: string | null;
  bootstrap: () => Promise<void>;
  reloadOperators: () => Promise<void>;
  setOperator: (user: User) => void;
  can: (permission: Permission) => boolean;
}

/** Elige el operador actual: el recordado (si sigue activo), el por defecto,
 *  el primer administrador o, en último caso, el primero de la lista. */
function pickOperator(active: User[], persistedId: string | null, defaultOperator?: string): User | null {
  const normalizedDefault = defaultOperator?.trim().toLowerCase();
  const byDefault = normalizedDefault
    ? active.find(
        (u) =>
          u.username.toLowerCase() === normalizedDefault ||
          u.fullName.toLowerCase() === normalizedDefault,
      )
    : undefined;
  return (
    active.find((u) => u.id === persistedId) ??
    byDefault ??
    active.find((u) => u.role === 'admin') ??
    active[0] ??
    null
  );
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      operators: [],
      operatorId: null,
      ready: false,
      error: null,

      async bootstrap() {
        if (get().ready) return;
        set({ error: null });
        try {
          const device = await ensureDeviceSession();
          const active = (await repo.listUsers()).filter((u) => u.active);
          if (active.length === 0) throw new Error('No hay ningún operador activo. Crea uno en Usuarios.');
          const current = pickOperator(active, get().operatorId, device.defaultOperator || device.email);
          set({ operators: active, user: current, operatorId: current?.id ?? null, ready: true });
        } catch (e) {
          set({ error: e instanceof Error ? e.message : 'No se pudo iniciar la aplicación', ready: false });
        }
      },

      async reloadOperators() {
        const active = (await repo.listUsers()).filter((u) => u.active);
        const current = active.find((u) => u.id === get().operatorId) ?? pickOperator(active, get().operatorId);
        set({ operators: active, user: current, operatorId: current?.id ?? null });
      },

      setOperator(user) {
        set({ user, operatorId: user.id });
      },

      can(permission) {
        return hasPermission(get().user?.role, permission);
      },
    }),
    { name: 'aurora-tpv:auth', partialize: (s) => ({ operatorId: s.operatorId }) },
  ),
);
