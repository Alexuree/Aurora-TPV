// =====================================================================
// Estado de autenticación / sesión del usuario actual.
// =====================================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Permission, User } from '@/domain/types';
import { hasPermission } from '@/domain/permissions';
import { repo } from '@/data';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (username: string, pin: string) => Promise<boolean>;
  logout: () => void;
  can: (permission: Permission) => boolean;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      loading: false,
      error: null,
      async login(username, pin) {
        set({ loading: true, error: null });
        try {
          const user = await repo.login(username, pin);
          if (!user) {
            set({ loading: false, error: 'Usuario o PIN incorrectos' });
            return false;
          }
          set({ user, loading: false, error: null });
          return true;
        } catch (e) {
          set({ loading: false, error: e instanceof Error ? e.message : 'Error de acceso' });
          return false;
        }
      },
      logout() {
        set({ user: null });
      },
      can(permission) {
        return hasPermission(get().user?.role, permission);
      },
    }),
    { name: 'aurora-tpv:auth', partialize: (s) => ({ user: s.user }) },
  ),
);
