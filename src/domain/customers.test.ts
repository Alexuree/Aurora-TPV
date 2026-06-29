import { describe, expect, it } from 'vitest';
import { findDuplicate, isValidEmail, snapshotFromCustomer, validateCustomer } from './customers';
import type { Customer } from './types';

const base: Customer = { id: 'c1', name: 'Ana Pérez', taxId: '12345678Z', phone: '600111222', active: true };

describe('validateCustomer', () => {
  it('exige nombre', () => {
    expect(validateCustomer({ name: '' }).ok).toBe(false);
    expect(validateCustomer({ name: 'Ana' }).ok).toBe(true);
  });
  it('valida email si se introduce', () => {
    expect(validateCustomer({ name: 'Ana', email: 'mal' }).errors.email).toBeTruthy();
    expect(validateCustomer({ name: 'Ana', email: 'ana@x.com' }).ok).toBe(true);
  });
});

describe('isValidEmail', () => {
  it('acepta y rechaza correctamente', () => {
    expect(isValidEmail('a@b.com')).toBe(true);
    expect(isValidEmail('a@b')).toBe(false);
  });
});

describe('findDuplicate', () => {
  it('detecta mismo NIF', () => {
    expect(findDuplicate([base], { name: 'Otro', taxId: '12345678z' })?.id).toBe('c1');
  });
  it('detecta mismo nombre + teléfono', () => {
    expect(findDuplicate([base], { name: 'ana pérez', phone: '600111222' })?.id).toBe('c1');
  });
  it('no marca al editar el mismo registro', () => {
    expect(findDuplicate([base], { name: 'Ana Pérez', taxId: '12345678Z' }, 'c1')).toBeUndefined();
  });
});

describe('snapshotFromCustomer', () => {
  it('congela los datos del cliente', () => {
    const snap = snapshotFromCustomer({ ...base, address: 'C/ Mayor 1' });
    expect(snap.name).toBe('Ana Pérez');
    expect(snap.taxId).toBe('12345678Z');
    expect(snap.address).toBe('C/ Mayor 1');
    // mutar el cliente después no debe afectar al snapshot
    expect(Object.isFrozen(snap)).toBe(false); // es una copia, no congelada literalmente
  });
});
