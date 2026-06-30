// =====================================================================
// Raíz de la aplicación: providers, enrutado y guardas de acceso.
// =====================================================================

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/store/authStore';
import type { Permission } from '@/domain/types';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { SalePage } from '@/pages/SalePage';
import { CustomersPage } from '@/pages/CustomersPage';
import { ProductsPage } from '@/pages/ProductsPage';
import { SalesHistoryPage } from '@/pages/SalesHistoryPage';
import { CashPage } from '@/pages/CashPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { UsersPage } from '@/pages/UsersPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SettingsPrinterPage } from '@/pages/SettingsPrinterPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuth((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const can = useAuth((s) => s.can);
  if (!can(permission)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<SalePage />} />
            <Route path="ventas" element={<SalesHistoryPage />} />
            <Route path="clientes" element={<RequirePermission permission="sell"><CustomersPage /></RequirePermission>} />
            <Route path="productos" element={<RequirePermission permission="manage_products"><ProductsPage /></RequirePermission>} />
            <Route path="caja" element={<RequirePermission permission="open_close_cash"><CashPage /></RequirePermission>} />
            <Route path="informes" element={<RequirePermission permission="view_reports"><ReportsPage /></RequirePermission>} />
            <Route path="usuarios" element={<RequirePermission permission="manage_users"><UsersPage /></RequirePermission>} />
            <Route path="ajustes" element={<RequirePermission permission="manage_settings"><SettingsPage /></RequirePermission>} />
            <Route path="ajustes/impresora" element={<RequirePermission permission="manage_settings"><SettingsPrinterPage /></RequirePermission>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  );
}
