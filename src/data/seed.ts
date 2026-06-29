// =====================================================================
// Datos iniciales de demostración para una tienda de perfumería,
// colonias y fotografía. Se cargan en el modo local la primera vez.
// Los precios son PVP (IVA del 21% incluido). El coste permite estimar
// beneficio en informes.
// =====================================================================

import type { Category, Product, Settings, User } from '@/domain/types';

export const seedCategories: Category[] = [
  { id: 'cat-perf-mujer', name: 'Perfumes Mujer', color: '#ec4899', sortOrder: 1, active: true },
  { id: 'cat-perf-hombre', name: 'Perfumes Hombre', color: '#3b82f6', sortOrder: 2, active: true },
  { id: 'cat-colonias', name: 'Colonias', color: '#14b8a6', sortOrder: 3, active: true },
  { id: 'cat-cosmetica', name: 'Cosmética', color: '#a855f7', sortOrder: 4, active: true },
  { id: 'cat-foto-material', name: 'Material Foto', color: '#f59e0b', sortOrder: 5, active: true },
  { id: 'cat-foto-revelado', name: 'Revelado', color: '#ef4444', sortOrder: 6, active: true },
  { id: 'cat-marcos', name: 'Marcos y Álbumes', color: '#64748b', sortOrder: 7, active: true },
];

function p(
  id: string,
  name: string,
  brand: string | undefined,
  categoryId: string,
  barcode: string,
  price: number,
  cost: number,
  opts: Partial<Product> = {},
): Product {
  return {
    id,
    name,
    brand,
    sku: id.toUpperCase(),
    barcode,
    categoryId,
    price,
    cost,
    ivaRate: 21,
    taxIncluded: true,
    active: true,
    ...opts,
  };
}

export const seedProducts: Product[] = [
  // Perfumes Mujer
  p('prod-001', 'Eau de Parfum 50ml', 'Chanel Nº5', 'cat-perf-mujer', '3145891255300', 109.9, 62),
  p('prod-002', 'La Vie Est Belle 50ml', 'Lancôme', 'cat-perf-mujer', '3605532612560', 89.5, 49),
  p('prod-003', 'Good Girl 80ml', 'Carolina Herrera', 'cat-perf-mujer', '8411061993989', 119.0, 67),
  p('prod-004', 'Black Opium 50ml', 'YSL', 'cat-perf-mujer', '3614272047693', 98.0, 55),
  p('prod-005', "J'adore 50ml", 'Dior', 'cat-perf-mujer', '3348901419494', 112.5, 64),
  // Perfumes Hombre
  p('prod-010', 'Sauvage EDT 100ml', 'Dior', 'cat-perf-hombre', '3348901250177', 99.9, 56),
  p('prod-011', 'Acqua di Giò 100ml', 'Armani', 'cat-perf-hombre', '3614273255615', 92.0, 51),
  p('prod-012', 'One Million 100ml', 'Paco Rabanne', 'cat-perf-hombre', '3349668562039', 88.5, 48),
  p('prod-013', 'Boss Bottled 100ml', 'Hugo Boss', 'cat-perf-hombre', '737052352060', 79.0, 43),
  p('prod-014', 'Le Male 125ml', 'Jean Paul Gaultier', 'cat-perf-hombre', '8435415015646', 84.9, 47),
  // Colonias
  p('prod-020', 'Agua de Colonia 200ml', 'Álvarez Gómez', 'cat-colonias', '8422385000017', 12.9, 5.5),
  p('prod-021', 'Colonia Fresca 100ml', 'Heno de Pravia', 'cat-colonias', '8410225508018', 8.5, 3.2),
  p('prod-022', 'Nenuco Agua de Colonia 240ml', 'Nenuco', 'cat-colonias', '8410104870218', 6.95, 2.6),
  // Cosmética
  p('prod-030', 'Crema Hidratante Facial 50ml', 'Nivea', 'cat-cosmetica', '4005900123459', 9.95, 4.1),
  p('prod-031', 'Barra de Labios Mate', 'Maybelline', 'cat-cosmetica', '3600531234567', 11.5, 4.8),
  p('prod-032', 'Set Brochas Maquillaje', 'Real Techniques', 'cat-cosmetica', '0791578256412', 24.9, 12),
  // Material Foto
  p('prod-040', 'Tarjeta SD 64GB UHS-I', 'SanDisk', 'cat-foto-material', '0619659186159', 18.9, 9.5),
  p('prod-041', 'Carrete 35mm Color 36exp', 'Kodak ColorPlus', 'cat-foto-material', '6033179000018', 11.95, 6.2),
  p('prod-042', 'Pilas AA Recargables (4u)', 'Panasonic Eneloop', 'cat-foto-material', '5410853052418', 14.5, 7.1),
  p('prod-043', 'Trípode Compacto 1.3m', 'Manfrotto', 'cat-foto-material', '8024221681543', 39.9, 21),
  // Revelado
  p('prod-050', 'Revelado carrete 35mm', undefined, 'cat-foto-revelado', '2000000000015', 9.9, 2.5),
  p('prod-051', 'Copia foto 10x15 (unidad)', undefined, 'cat-foto-revelado', '2000000000022', 0.35, 0.08),
  p('prod-052', 'Foto carnet (8 unidades)', undefined, 'cat-foto-revelado', '2000000000039', 6.0, 1.2),
  p('prod-053', 'Impresión foto A4 sobre lienzo', undefined, 'cat-foto-revelado', '2000000000046', 24.9, 9),
  // Marcos y Álbumes
  p('prod-060', 'Marco de fotos 13x18 madera', 'Hama', 'cat-marcos', '4007249641007', 7.95, 3.4),
  p('prod-061', 'Álbum 200 fotos 10x15', 'Hofmann', 'cat-marcos', '8412345600013', 14.9, 6.8),
  p('prod-062', 'Marco múltiple 4 fotos', 'Nielsen', 'cat-marcos', '4007249641205', 19.5, 9.2),
];

/**
 * Usuarios de demostración (solo modo local).
 * Acceso por usuario + PIN. En producción con Supabase se usa Supabase Auth.
 */
export const seedUsers: User[] = [
  { id: 'usr-admin', username: 'admin', fullName: 'Administrador', role: 'admin', active: true, pin: '1234' },
  { id: 'usr-encargado', username: 'encargado', fullName: 'María (Encargada)', role: 'manager', active: true, pin: '2222' },
  { id: 'usr-dependiente', username: 'dependiente', fullName: 'Lucía (Dependienta)', role: 'cashier', active: true, pin: '0000' },
];

export const seedSettings: Settings = {
  storeName: 'Aurora Perfumería & Fotografía',
  legalName: 'Aurora Comercio S.L.',
  taxId: 'B12345678',
  address: 'C/ Mayor 12, 28013 Madrid',
  phone: '910 000 000',
  email: 'hola@auroratpv.es',
  ticketFooter: '¡Gracias por su compra!',
  currency: 'EUR',
  defaultIva: 21,
  ticketWidth: '80',
  showTaxBreakdown: true,
  headerText: 'Perfumería · Colonias · Fotografía',
  returnPolicy: '',
  legalText: 'IVA incluido en los precios. Conserve este ticket.',
  logoUrl: undefined,
};
