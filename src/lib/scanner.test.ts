import { describe, expect, it } from 'vitest';
import { createScanDeduper, looksLikeBarcode, normalizeScannedCode } from './scanner';

describe('normalizeScannedCode', () => {
  it('elimina CR/LF/Tab y espacios', () => {
    expect(normalizeScannedCode('  8412345600013\r\n')).toBe('8412345600013');
    expect(normalizeScannedCode('ABC123\t')).toBe('ABC123');
  });
});

describe('looksLikeBarcode', () => {
  it('reconoce códigos largos con dígitos', () => {
    expect(looksLikeBarcode('8412345600013')).toBe(true);
    expect(looksLikeBarcode('PROD-001')).toBe(true);
  });
  it('descarta texto de búsqueda', () => {
    expect(looksLikeBarcode('sauvage')).toBe(false);
    expect(looksLikeBarcode('abc')).toBe(false);
  });
});

describe('createScanDeduper', () => {
  it('rechaza el mismo código dentro de la ventana (rebote)', () => {
    let t = 1000;
    const d = createScanDeduper(80, () => t);
    expect(d.accept('123')).toBe(true);
    t = 1040; // 40ms después: rebote
    expect(d.accept('123')).toBe(false);
  });

  it('acepta el mismo código pasada la ventana (repetición intencionada)', () => {
    let t = 1000;
    const d = createScanDeduper(80, () => t);
    expect(d.accept('123')).toBe(true);
    t = 1300; // 300ms después
    expect(d.accept('123')).toBe(true);
  });

  it('acepta códigos distintos seguidos', () => {
    let t = 1000;
    const d = createScanDeduper(80, () => t);
    expect(d.accept('123')).toBe(true);
    t = 1010;
    expect(d.accept('456')).toBe(true);
  });
});
