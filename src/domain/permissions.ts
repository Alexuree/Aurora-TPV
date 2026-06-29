// =====================================================================
// Matriz de roles -> permisos. Centraliza el control de acceso para que
// tanto la UI (ocultar botones) como la lógica puedan consultarlo.
// =====================================================================

import type { Permission, Role } from './types';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'sell',
    'apply_discount',
    'modify_price',
    'process_return',
    'view_reports',
    'manage_products',
    'manage_users',
    'open_close_cash',
    'manage_settings',
  ],
  manager: [
    'sell',
    'apply_discount',
    'modify_price',
    'process_return',
    'view_reports',
    'manage_products',
    'open_close_cash',
  ],
  cashier: ['sell', 'open_close_cash'],
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  manager: 'Encargado',
  cashier: 'Dependiente',
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  sell: 'Vender',
  apply_discount: 'Aplicar descuentos',
  modify_price: 'Modificar precios',
  process_return: 'Hacer devoluciones',
  view_reports: 'Ver informes',
  manage_products: 'Gestionar productos',
  manage_users: 'Gestionar usuarios',
  open_close_cash: 'Abrir / cerrar caja',
  manage_settings: 'Configuración',
};

export function hasPermission(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
