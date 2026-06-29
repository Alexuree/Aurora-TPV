// =====================================================================
// Tarjeta del "producto pendiente": el último código escaneado que aún no
// se ha añadido a la venta. Si se escanea otro, este se añade solo.
// =====================================================================

import { Barcode, Check, ImageOff, Plus, X } from 'lucide-react';
import type { Product } from '@/domain/types';
import { formatMoney } from '@/domain/money';
import { Button } from '@/components/ui';

interface Props {
  product: Product;
  onAdd: () => void;
  onDiscard: () => void;
}

export function PendingProductCard({ product, onAdd, onDiscard }: Props) {
  const out = product.trackStock && product.stock <= 0;
  return (
    <div className="animate-pop-in flex items-center gap-4 rounded-2xl border-2 border-brand-300 bg-brand-50 p-3 shadow-sm">
      {/* Imagen */}
      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <ImageOff className="text-slate-300" size={28} />
        )}
      </div>

      {/* Datos */}
      <div className="min-w-0 flex-1">
        {product.brand && (
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-brand-600">{product.brand}</p>
        )}
        <p className="truncate text-base font-bold text-slate-800">{product.name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Barcode size={13} /> {product.barcode || product.sku || '—'}
          </span>
          <span>IVA {product.ivaRate}%</span>
          {product.trackStock ? (
            <span className={out ? 'font-semibold text-rose-600' : ''}>
              {out ? 'Sin stock' : `Stock: ${product.stock}`}
            </span>
          ) : (
            <span>Servicio</span>
          )}
        </div>
      </div>

      {/* Precio + acciones */}
      <div className="flex flex-col items-end gap-2">
        <span className="text-2xl font-extrabold tracking-tight text-slate-900">{formatMoney(product.price)}</span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onDiscard} title="Descartar">
            <X size={16} /> Descartar
          </Button>
          <Button size="md" onClick={onAdd} title="Añadir a la venta (Intro)">
            {out ? <Plus size={18} /> : <Check size={18} />} Añadir a venta
          </Button>
        </div>
      </div>
    </div>
  );
}
