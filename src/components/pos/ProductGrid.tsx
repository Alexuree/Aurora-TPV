// Rejilla de productos para la pantalla de venta.

import type { Product } from '@/domain/types';
import { formatMoney } from '@/domain/money';
import { ImageOff } from 'lucide-react';

interface Props {
  products: Product[];
  onSelect: (p: Product) => void;
}

export function ProductGrid({ products, onSelect }: Props) {
  if (products.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <div className="text-center">
          <ImageOff className="mx-auto mb-2" size={36} />
          <p className="font-medium">Sin productos</p>
          <p className="text-sm">Prueba con otra búsqueda o categoría.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {products.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className="group relative flex h-32 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-brand-300 hover:shadow-md active:scale-[0.98]"
          >
            <div className="min-h-0">
              {p.brand && <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-brand-600">{p.brand}</p>}
              <p className="line-clamp-2 text-sm font-medium leading-tight text-slate-800">{p.name}</p>
            </div>
            <div className="flex items-end justify-between">
              <span className="text-lg font-bold text-slate-900">{formatMoney(p.price)}</span>
            </div>
          </button>
      ))}
    </div>
  );
}
