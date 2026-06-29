// =====================================================================
// Marco de la aplicación: barra lateral de navegación + cabecera.
// La navegación se filtra según permisos del usuario.
// =====================================================================

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Boxes,
  LogOut,
  Package,
  ReceiptText,
  RotateCcw,
  Settings as SettingsIcon,
  ShoppingCart,
  Users,
  Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';
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
  { to: '/', label: 'Venta', icon: <ShoppingCart size={22} />, permission: 'sell', end: true },
  { to: '/ventas', label: 'Ventas', icon: <ReceiptText size={22} /> },
  { to: '/devoluciones', label: 'Devoluciones', icon: <RotateCcw size={22} />, permission: 'process_return' },
  { to: '/productos', label: 'Productos', icon: <Package size={22} />, permission: 'manage_products' },
  { to: '/inventario', label: 'Inventario', icon: <Boxes size={22} />, permission: 'manage_products' },
  { to: '/caja', label: 'Caja', icon: <Wallet size={22} />, permission: 'open_close_cash' },
  { to: '/informes', label: 'Informes', icon: <BarChart3 size={22} />, permission: 'view_reports' },
  { to: '/usuarios', label: 'Usuarios', icon: <Users size={22} />, permission: 'manage_users' },
  { to: '/ajustes', label: 'Ajustes', icon: <SettingsIcon size={22} />, permission: 'manage_settings' },
];

export function AppShell() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const { data: openSession } = useOpenCashSession();

  const items = NAV.filter((i) => !i.permission || can(i.permission));

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      {/* Sidebar */}
      <aside className="flex w-20 flex-col items-center gap-1 bg-slate-900 py-4 lg:w-60 lg:items-stretch lg:px-3">
        <div className="mb-4 flex items-center gap-2.5 px-2 lg:px-1">
          <img src="/favicon.svg" alt="Aurora" className="h-10 w-10 shrink-0" />
          <div className="hidden lg:block">
            <p className="text-sm font-bold leading-tight text-white">Aurora TPV</p>
            <p className="text-[11px] leading-tight text-slate-400">Perfumería · Foto</p>
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
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-slate-400 transition',
                  'justify-center lg:justify-start',
                  isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-slate-200',
                )
              }
              title={item.label}
            >
              {item.icon}
              <span className="hidden text-sm font-medium lg:inline">{item.label}</span>
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

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold leading-tight text-slate-800">{user?.fullName}</p>
              <p className="text-[11px] leading-tight text-slate-400">{user ? ROLE_LABELS[user.role] : ''}</p>
            </div>
            <div className="bg-aurora flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white">
              {user?.fullName?.slice(0, 1).toUpperCase()}
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
              title="Cerrar sesión"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
