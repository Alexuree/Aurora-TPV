// =====================================================================
// Estado del ticket actual (carrito). Solo guarda líneas y cliente; los
// importes se calculan con la lógica de dominio (computeTotals) para no
// duplicar reglas de negocio.
// =====================================================================

import { create } from 'zustand';
import type { CartLine, Customer, Product } from '@/domain/types';
import { newLineId } from '@/domain/cart';

interface CartState {
  lines: CartLine[];
  customer: Customer | null;
  note: string;
  addProduct: (product: Product, qty?: number) => void;
  setQuantity: (lineId: string, qty: number) => void;
  incQuantity: (lineId: string, delta: number) => void;
  setDiscount: (lineId: string, pct: number) => void;
  setUnitPrice: (lineId: string, price: number) => void;
  removeLine: (lineId: string) => void;
  setCustomer: (customer: Customer | null) => void;
  setNote: (note: string) => void;
  clear: () => void;
}

function lineFromProduct(product: Product, qty: number): CartLine {
  return {
    lineId: newLineId(),
    productId: product.id,
    name: product.name,
    brand: product.brand,
    barcode: product.barcode,
    ivaRate: product.ivaRate,
    taxIncluded: product.taxIncluded,
    quantity: qty,
    unitPrice: product.price,
    basePrice: product.price,
    discountPct: 0,
    priceOverridden: false,
    trackStock: product.trackStock,
    stockAvailable: product.stock,
  };
}

export const useCart = create<CartState>((set) => ({
  lines: [],
  customer: null,
  note: '',

  addProduct(product, qty = 1) {
    set((state) => {
      // Si el producto ya está en el ticket (sin precio modificado), acumula cantidad.
      const existing = state.lines.find((l) => l.productId === product.id && !l.priceOverridden);
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.lineId === existing.lineId ? { ...l, quantity: l.quantity + qty } : l,
          ),
        };
      }
      return { lines: [...state.lines, lineFromProduct(product, qty)] };
    });
  },

  setQuantity(lineId, qty) {
    set((state) => ({
      lines: state.lines
        .map((l) => (l.lineId === lineId ? { ...l, quantity: Math.max(0, qty) } : l))
        .filter((l) => l.quantity > 0),
    }));
  },

  incQuantity(lineId, delta) {
    set((state) => ({
      lines: state.lines
        .map((l) => (l.lineId === lineId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    }));
  },

  setDiscount(lineId, pct) {
    set((state) => ({
      lines: state.lines.map((l) =>
        l.lineId === lineId ? { ...l, discountPct: Math.min(100, Math.max(0, pct)) } : l,
      ),
    }));
  },

  setUnitPrice(lineId, price) {
    set((state) => ({
      lines: state.lines.map((l) =>
        l.lineId === lineId ? { ...l, unitPrice: Math.max(0, price), priceOverridden: price !== l.basePrice } : l,
      ),
    }));
  },

  removeLine(lineId) {
    set((state) => ({ lines: state.lines.filter((l) => l.lineId !== lineId) }));
  },

  setCustomer(customer) {
    set({ customer });
  },

  setNote(note) {
    set({ note });
  },

  clear() {
    set({ lines: [], customer: null, note: '' });
  },
}));
