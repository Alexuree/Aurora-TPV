import { describe, expect, it } from 'vitest';
import { isBarcodeTaken, validateProduct } from './products';
import type { Product } from './types';

const p = (over: Partial<Product>): Product => ({
  id: 'p1', name: 'X', categoryId: null, price: 10, ivaRate: 21, taxIncluded: true,
  active: true, ...over,
});

const existing: Product[] = [p({ id: 'p1', barcode: '8410104870218' })];

describe('validateProduct', () => {
  it('exige nombre', () => {
    expect(validateProduct(p({ name: '' }), existing, 'p1').errors.name).toBeTruthy();
  });
  it('rechaza precio negativo', () => {
    expect(validateProduct(p({ price: -1 }), existing, 'p1').errors.price).toBeTruthy();
  });
  it('rechaza IVA no válido', () => {
    expect(validateProduct(p({ ivaRate: 7 as never }), existing, 'p1').errors.iva).toBeTruthy();
  });
  it('rechaza código de barras duplicado de otro producto', () => {
    expect(validateProduct(p({ id: 'p2', barcode: '8410104870218' }), existing, 'p2').errors.barcode).toBeTruthy();
  });
  it('permite el mismo código si es el mismo producto', () => {
    expect(validateProduct(p({ id: 'p1', barcode: '8410104870218' }), existing, 'p1').ok).toBe(true);
  });
});

describe('isBarcodeTaken', () => {
  it('detecta y excluye correctamente', () => {
    expect(isBarcodeTaken(existing, '8410104870218', 'p9')).toBe(true);
    expect(isBarcodeTaken(existing, '8410104870218', 'p1')).toBe(false);
    expect(isBarcodeTaken(existing, '', 'p9')).toBe(false);
  });
});
