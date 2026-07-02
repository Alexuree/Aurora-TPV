// Edición de una línea del ticket: cantidad, descuento y precio.
// Descuento y precio requieren permiso.

import { useState } from 'react';
import type { CartLine } from '@/domain/types';
import { useCart } from '@/store/cartStore';
import { useAuth } from '@/store/authStore';
import { computeLine } from '@/domain/cart';
import { formatMoney, parseDecimal } from '@/domain/money';
import { Button, Field, Modal, inputClass } from '@/components/ui';
import { Lock } from 'lucide-react';

export function LineEditModal({ line, onClose }: { line: CartLine; onClose: () => void }) {
  const { setQuantity, setDiscount, setUnitPrice, removeLine } = useCart();
  const can = useAuth((s) => s.can);
  const canDiscount = can('apply_discount');
  const canPrice = can('modify_price');

  const [qty, setQty] = useState(line.quantity);
  const [discount, setDisc] = useState(line.discountPct);
  // Precio como texto para admitir coma o punto indistintamente.
  const [priceStr, setPriceStr] = useState(String(line.unitPrice));
  const price = Math.max(0, parseDecimal(priceStr) || 0);

  const preview = computeLine({ ...line, quantity: qty, discountPct: discount, unitPrice: price });

  const save = () => {
    setQuantity(line.lineId, qty);
    if (canDiscount) setDiscount(line.lineId, discount);
    if (canPrice) setUnitPrice(line.lineId, price);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={line.name}
      footer={
        <>
          <Button variant="ghost" className="mr-auto text-rose-600" onClick={() => { removeLine(line.lineId); onClose(); }}>
            Quitar del ticket
          </Button>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save}>Aplicar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Cantidad">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="lg" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</Button>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
              className={`${inputClass} text-center text-lg font-bold`}
            />
            <Button variant="outline" size="lg" onClick={() => setQty((q) => q + 1)}>+</Button>
          </div>
        </Field>

        <Field label="Descuento (%)" hint={!canDiscount ? 'No tienes permiso para aplicar descuentos' : undefined}>
          <div className="relative">
            <input
              type="number"
              min={0}
              max={100}
              value={discount}
              disabled={!canDiscount}
              onChange={(e) => setDisc(Math.min(100, Math.max(0, Number(e.target.value))))}
              className={`${inputClass} ${!canDiscount ? 'bg-slate-100 text-slate-400' : ''}`}
            />
            {!canDiscount && <Lock className="absolute right-3 top-3 text-slate-400" size={18} />}
          </div>
        </Field>

        <Field label="Precio unitario (€)" hint={!canPrice ? 'No tienes permiso para modificar precios' : `PVP original: ${formatMoney(line.basePrice)}`}>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={priceStr}
              disabled={!canPrice}
              onChange={(e) => setPriceStr(e.target.value)}
              className={`${inputClass} ${!canPrice ? 'bg-slate-100 text-slate-400' : ''}`}
            />
            {!canPrice && <Lock className="absolute right-3 top-3 text-slate-400" size={18} />}
          </div>
        </Field>

        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <span className="text-sm font-medium text-slate-500">Total de línea</span>
          <span className="text-xl font-bold text-slate-900">{formatMoney(preview.gross)}</span>
        </div>
      </div>
    </Modal>
  );
}
