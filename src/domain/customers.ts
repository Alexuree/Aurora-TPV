// =====================================================================
// Lógica de clientes (pura, testeable): validación, detección de
// duplicados evidentes y creación del snapshot fiscal para el ticket.
// =====================================================================

import type { Customer, CustomerSnapshot } from './types';

export interface CustomerValidation {
  ok: boolean;
  errors: Partial<Record<'name' | 'email', string>>;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function validateCustomer(c: Partial<Customer>): CustomerValidation {
  const errors: CustomerValidation['errors'] = {};
  if (!c.name || !c.name.trim()) errors.name = 'El nombre es obligatorio.';
  if (c.email && c.email.trim() && !isValidEmail(c.email)) errors.email = 'Email no válido.';
  return { ok: Object.keys(errors).length === 0, errors };
}

/** Duplicado evidente: mismo NIF/CIF, o mismo nombre + teléfono. */
export function findDuplicate(
  list: Customer[],
  c: Partial<Customer>,
  excludeId?: string,
): Customer | undefined {
  const taxId = c.taxId?.trim().toLowerCase();
  const name = c.name?.trim().toLowerCase();
  const phone = c.phone?.trim();
  return list.find((x) => {
    if (x.id === excludeId) return false;
    if (taxId && x.taxId && x.taxId.trim().toLowerCase() === taxId) return true;
    if (name && phone && x.name.trim().toLowerCase() === name && (x.phone ?? '').trim() === phone) return true;
    return false;
  });
}

/** Congela los datos fiscales del cliente para el ticket. */
export function snapshotFromCustomer(c: Customer): CustomerSnapshot {
  return {
    name: c.name,
    taxId: c.taxId,
    address: c.address,
    postalCode: c.postalCode,
    city: c.city,
    province: c.province,
    country: c.country,
    phone: c.phone,
    email: c.email,
  };
}
