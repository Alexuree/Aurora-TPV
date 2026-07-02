// Panel del ticket actual: líneas, totales y acciones de cobro.

import { useEffect, useState } from 'react';
import { Minus, Plus, Trash2, User as UserIcon, X } from 'lucide-react';
import { useCart } from '@/store/cartStore';
import type { CartLine } from '@/domain/types';
import { computeLine, computeTotals, lineChargedTotal } from '@/domain/cart';
import { formatMoney } from '@/domain/money';
import { Button, cn } from '@/components/ui';

interface Props {
  onCharge: () => void;
  onEditLine: (line: CartLine) => void;
  onSelectCustomer: () => void;
}

export function TicketPanel({ onCharge, onEditLine, onSelectCustomer }: Props) {
  const { lines, customer, incQuantity, setQuantity, removeLine, clear } = useCart();
  const totals = computeTotals(lines);
  const empty = lines.length === 0;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Cliente */}
      <button
        onClick={onSelectCustomer}
        className="flex items-center gap-2 border-b border-slate-100 px-3 py-3 text-left transition hover:bg-slate-50"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <UserIcon size={16} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-700">{customer?.name ?? 'Cliente mostrador'}</p>
          <p className="text-[11px] text-slate-400">{customer ? 'Pulsa para cambiar' : 'Venta anónima · pulsa para asociar'}</p>
        </div>
      </button>

      {/* Líneas */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {empty ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-slate-400">
            <p className="text-sm">El ticket está vacío.<br />Añade productos para empezar.</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {lines.map((line) => {
              const t = computeLine(line);
              const hasDiscount = line.discountPct > 0;
              return (
                <li
                  key={line.lineId}
                  className="rounded-xl border border-transparent p-2 transition hover:border-slate-200 hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={() => onEditLine(line)} className="min-w-0 flex-1 text-left">
                      {line.brand && <span className="block truncate text-[11px] font-semibold uppercase text-brand-600">{line.brand}</span>}
                      <span className="block truncate text-sm font-medium text-slate-800">{line.name}</span>
                      <span className="text-xs text-slate-500">
                        {formatMoney(line.unitPrice)}
                        {line.priceOverridden && <span className="ml-1 text-amber-600">(modif.)</span>}
                        {hasDiscount && <span className="ml-1 text-emerald-600">−{line.discountPct}%</span>}
                        <span className="ml-1 text-slate-400">· IVA {line.ivaRate}%</span>
                      </span>
                    </button>
                    <div className="text-right">
                      <span className="block text-sm font-bold text-slate-900">{formatMoney(lineChargedTotal(line))}</span>
                      {hasDiscount && <span className="block text-[11px] text-slate-400 line-through">{formatMoney(t.grossBeforeDiscount)}</span>}
                    </div>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => incQuantity(line.lineId, -1)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                      >
                        <Minus size={14} />
                      </button>
                      <LineQuantityInput quantity={line.quantity} onChange={(qty) => setQuantity(line.lineId, qty)} />
                      <button
                        onClick={() => incQuantity(line.lineId, 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <button
                      onClick={() => removeLine(line.lineId)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Totales */}
      <div className="border-t border-slate-100 px-3 py-3">
        <div className="space-y-1 text-sm">
          <Row label="Base imponible" value={formatMoney(totals.subtotal)} muted />
          {totals.discountTotal > 0 && <Row label="Descuentos" value={`−${formatMoney(totals.discountTotal)}`} className="text-emerald-600" />}
          {totals.taxBreakdown.map((b) => (
            <Row key={b.rate} label={`IVA ${b.rate}%`} value={formatMoney(b.tax)} muted />
          ))}
        </div>
        <div className="mt-2 flex items-end justify-between border-t border-dashed border-slate-200 pt-2">
          <span className="text-sm font-semibold text-slate-500">TOTAL</span>
          <span className="text-2xl font-extrabold tracking-tight text-slate-900">{formatMoney(totals.total)}</span>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <Button size="lg" variant="primary" disabled={empty} onClick={onCharge} className="text-base font-bold">
            COBRAR
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={empty}
            onClick={() => {
              if (confirm('¿Cancelar la venta actual?')) clear();
            }}
            title="Cancelar venta"
            className="aspect-square px-0"
          >
            <X size={20} />
          </Button>
        </div>
      </div>
    </div>
  );
}

function LineQuantityInput({ quantity, onChange }: { quantity: number; onChange: (qty: number) => void }) {
  const [draft, setDraft] = useState(String(quantity));

  useEffect(() => {
    setDraft(String(quantity));
  }, [quantity]);

  const commit = () => {
    const next = Number(draft.replace(',', '.'));
    if (!Number.isFinite(next) || next <= 0) {
      setDraft(String(quantity));
      return;
    }
    onChange(next);
  };

  return (
    <input
      type="number"
      min={0.01}
      step="1"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className="h-7 w-14 rounded-lg border border-slate-200 text-center text-sm font-semibold tabular-nums text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
    />
  );
}

function Row({ label, value, muted, className }: { label: string; value: string; muted?: boolean; className?: string }) {
  return (
    <div className="flex justify-between">
      <span className={cn(muted ? 'text-slate-500' : 'text-slate-600', className)}>{label}</span>
      <span className={cn('tabular-nums', muted ? 'text-slate-600' : 'font-medium text-slate-800', className)}>{value}</span>
    </div>
  );
}
