import { describe, expect, it } from 'vitest';
import { computeChange, quickCashSuggestions, summarizePayments } from './payments';

describe('summarizePayments', () => {
  it('calcula cambio en efectivo', () => {
    const s = summarizePayments(42.3, [{ method: 'cash', amount: 50 }]);
    expect(s.changeDue).toBe(7.7);
    expect(s.isComplete).toBe(true);
    expect(s.remaining).toBe(0);
  });

  it('pago mixto: el cambio solo sale del efectivo', () => {
    const s = summarizePayments(40, [
      { method: 'card', amount: 30 },
      { method: 'cash', amount: 15 },
    ]);
    expect(s.isComplete).toBe(true);
    expect(s.isMixed).toBe(true);
    expect(s.changeDue).toBe(5);
  });

  it('pago insuficiente deja pendiente', () => {
    const s = summarizePayments(40, [{ method: 'card', amount: 30 }]);
    expect(s.isComplete).toBe(false);
    expect(s.remaining).toBe(10);
  });
});

describe('computeChange', () => {
  it('no devuelve negativo', () => {
    expect(computeChange(50, 40)).toBe(0);
    expect(computeChange(42.3, 50)).toBe(7.7);
  });
});

describe('quickCashSuggestions', () => {
  it('incluye el importe exacto y todas son >= total', () => {
    const s = quickCashSuggestions(42.3);
    expect(s).toContain(42.3);
    expect(s.every((v) => v >= 42.3)).toBe(true);
  });
});
