// =====================================================================
// Marco de la aplicación: barra lateral de navegación + cabecera.
// La navegación se filtra según permisos del usuario.
// =====================================================================

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Check,
  ChevronDown,
  Contact,
  Package,
  Printer,
  ReceiptText,
  Settings as SettingsIcon,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wallet,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useAuth } from '@/store/authStore';
import type { Permission } from '@/domain/types';
import { ROLE_LABELS } from '@/domain/permissions';
import { useOpenCashSession } from '@/hooks/data';
import { cn } from '@/components/ui';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  permission?: Permission;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Venta', icon: <ShoppingCart size={18} />, permission: 'sell', end: true },
  { to: '/ventas', label: 'Ventas', icon: <ReceiptText size={18} /> },
  { to: '/clientes', label: 'Clientes', icon: <Contact size={18} />, permission: 'sell' },
  { to: '/productos', label: 'Productos', icon: <Package size={18} />, permission: 'manage_products' },
  { to: '/caja', label: 'Caja', icon: <Wallet size={18} />, permission: 'open_close_cash' },
  { to: '/informes', label: 'Informes', icon: <BarChart3 size={18} />, permission: 'view_reports' },
  { to: '/usuarios', label: 'Usuarios', icon: <Users size={18} />, permission: 'manage_users' },
  { to: '/ajustes', label: 'Ajustes', icon: <SettingsIcon size={18} />, permission: 'manage_settings', end: true },
  { to: '/ajustes/impresora', label: 'Impresora', icon: <Printer size={18} />, permission: 'manage_settings' },
  { to: '/auditoria', label: 'Auditoría', icon: <ShieldCheck size={18} />, permission: 'manage_settings' },
];

export function AppShell() {
  const { user, operators, setOperator, can } = useAuth();
  const navigate = useNavigate();
  const { data: openSession } = useOpenCashSession();
  const [operatorMenu, setOperatorMenu] = useState(false);

  const items = NAV.filter((i) => !i.permission || can(i.permission));

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      {/* Sidebar */}
      <aside className="flex w-14 flex-col items-center gap-1 bg-slate-900 py-3 lg:w-32 lg:items-stretch lg:px-2">
        <div className="mb-3 flex items-center gap-2 px-1">
          <img src="/favicon.svg" alt="Aurora" className="h-7 w-7 shrink-0" />
          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-xs font-bold leading-tight text-white">Aurora TPV</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-lg px-2.5 py-2 text-slate-400 transition',
                  'justify-center lg:justify-start',
                  isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-slate-200',
                )
              }
              title={item.label}
            >
              {item.icon}
              <span className="hidden truncate text-xs font-medium lg:inline">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
                openSession ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
              )}
            >
              <Wallet size={14} />
              {openSession ? 'Caja abierta' : 'Caja cerrada'}
            </span>
          </div>

          {/* Selector de operador (sin login): clic → lista de operadores activos. */}
          <div className="relative">
            <button
              onClick={() => setOperatorMenu((o) => !o)}
              className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-slate-100"
              title="Cambiar de operador"
            >
              <div className="text-right">
                <p className="text-sm font-semibold leading-tight text-slate-800">{user?.fullName}</p>
                <p className="text-[11px] leading-tight text-slate-400">{user ? ROLE_LABELS[user.role] : ''}</p>
              </div>
              <div className="bg-aurora flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white">
                {user?.fullName?.slice(0, 1).toUpperCase()}
              </div>
              <ChevronDown size={16} className="text-slate-400" />
            </button>

            {operatorMenu && (
              <>
                <button className="fixed inset-0 z-10 cursor-default" onClick={() => setOperatorMenu(false)} aria-hidden />
                <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Cambiar de operador</p>
                  <div className="max-h-72 overflow-y-auto">
                    {operators.map((op) => (
                      <button
                        key={op.id}
                        onClick={() => { setOperator(op); setOperatorMenu(false); }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-slate-50',
                          op.id === user?.id && 'bg-brand-50',
                        )}
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                          {op.fullName.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">{op.fullName}</p>
                          <p className="text-[11px] text-slate-400">{ROLE_LABELS[op.role]}</p>
                        </div>
                        {op.id === user?.id && <Check size={16} className="text-brand-600" />}
                      </button>
                    ))}
                  </div>
                  {can('manage_users') && (
                    <button
                      onClick={() => { setOperatorMenu(false); navigate('/usuarios'); }}
                      className="mt-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-slate-500 transition hover:bg-slate-50"
                    >
                      <Users size={16} /> Gestionar usuarios…
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
