import { describe, expect, it } from 'vitest';
import { parseDecimal, round2 } from './money';

describe('parseDecimal', () => {
  it('acepta coma y punto como decimal por igual', () => {
    expect(parseDecimal('12,50')).toBe(12.5);
    expect(parseDecimal('12.50')).toBe(12.5);
    expect(parseDecimal('0,99')).toBe(0.99);
    expect(parseDecimal('7')).toBe(7);
  });

  it('con ambos separadores, el último es el decimal', () => {
    expect(parseDecimal('1.234,50')).toBe(1234.5); // es-ES
    expect(parseDecimal('1,234.50')).toBe(1234.5); // en-US
  });

  it('ignora espacios y devuelve NaN si no hay número', () => {
    expect(parseDecimal(' 3,5 ')).toBe(3.5);
    expect(parseDecimal('')).toBeNaN();
    expect(parseDecimal('abc')).toBeNaN();
    expect(parseDecimal(null)).toBeNaN();
  });

  it('deja pasar los números tal cual', () => {
    expect(parseDecimal(9.9)).toBe(9.9);
    expect(round2(parseDecimal('10,005'))).toBe(10.01);
  });
});
