// =====================================================================
// Validación de productos (pura, testeable): nombre obligatorio, precio
// ≥ 0, IVA válido y código de barras único.
// =====================================================================

import type { IvaRate, Product } from './types';

const VALID_IVA: IvaRate[] = [0, 4, 10, 21];

export interface ProductValidation {
  ok: boolean;
  errors: Partial<Record<'name' | 'price' | 'iva' | 'barcode', string>>;
}

/** ¿El código de barras ya lo usa otro producto? */
export function isBarcodeTaken(all: Product[], barcode: string, excludeId?: string): boolean {
  const b = barcode.trim().toLowerCase();
  if (!b) return false;
  return all.some((p) => p.id !== excludeId && (p.barcode ?? '').trim().toLowerCase() === b);
}

export function validateProduct(p: Partial<Product>, all: Product[], id?: string): ProductValidation {
  const errors: ProductValidation['errors'] = {};
  if (!p.name || !p.name.trim()) errors.name = 'El nombre es obligatorio.';
  if (p.price == null || Number.isNaN(p.price) || p.price < 0) errors.price = 'El precio debe ser mayor o igual a 0.';
  if (p.ivaRate == null || !VALID_IVA.includes(p.ivaRate)) errors.iva = 'Tipo de IVA no válido.';
  if (p.barcode && p.barcode.trim() && isBarcodeTaken(all, p.barcode, id)) {
    errors.barcode = 'Ese código de barras ya está en uso por otro producto.';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}
