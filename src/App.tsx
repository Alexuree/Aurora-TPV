// =====================================================================
// Raíz de la aplicación: providers, enrutado y guardas de acceso.
// =====================================================================

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/store/authStore';
import type { Permission } from '@/domain/types';
import { Button, Spinner } from '@/components/ui';
import { AppShell } from '@/components/layout/AppShell';
import { SalePage } from '@/pages/SalePage';
import { CustomersPage } from '@/pages/CustomersPage';
import { ProductsPage } from '@/pages/ProductsPage';
import { SalesHistoryPage } from '@/pages/SalesHistoryPage';
import { CashPage } from '@/pages/CashPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { UsersPage } from '@/pages/UsersPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SettingsPrinterPage } from '@/pages/SettingsPrinterPage';
import { AuditPage } from '@/pages/AuditPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

/**
 * Puerta de arranque: sin pantalla de login. Inicia la sesión de dispositivo
 * y carga los operadores; mientras tanto muestra un cargador, y si algo falla
 * (p. ej. faltan credenciales en .env) muestra el error con opción a reintentar.
 */
function Bootstrap({ children }: { children: ReactNode }) {
  const ready = useAuth((s) => s.ready);
  const error = useAuth((s) => s.error);
  const bootstrap = useAuth((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 p-6 text-center">
        <img src="/logo.svg" alt="Aurora TPV" className="h-14" />
        <div className="max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <h1 className="mb-1 text-lg font-bold text-slate-800">No se pudo iniciar</h1>
          <p className="mb-4 text-sm text-slate-500">{error}</p>
          <Button block onClick={() => void bootstrap()}>Reintentar</Button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <Spinner className="h-8 w-8 border-white/30 border-t-white" />
      </div>
    );
  }

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
        <Bootstrap>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<SalePage />} />
            <Route path="ventas" element={<SalesHistoryPage />} />
            <Route path="clientes" element={<RequirePermission permission="sell"><CustomersPage /></RequirePermission>} />
            <Route path="productos" element={<RequirePermission permission="manage_products"><ProductsPage /></RequirePermission>} />
            <Route path="caja" element={<RequirePermission permission="open_close_cash"><CashPage /></RequirePermission>} />
            <Route path="informes" element={<RequirePermission permission="view_reports"><ReportsPage /></RequirePermission>} />
            <Route path="usuarios" element={<RequirePermission permission="manage_users"><UsersPage /></RequirePermission>} />
            <Route path="ajustes" element={<RequirePermission permission="manage_settings"><SettingsPage /></RequirePermission>} />
            <Route path="ajustes/impresora" element={<RequirePermission permission="manage_settings"><SettingsPrinterPage /></RequirePermission>} />
            <Route path="auditoria" element={<RequirePermission permission="manage_settings"><AuditPage /></RequirePermission>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Bootstrap>
      </HashRouter>
    </QueryClientProvider>
  );
}
