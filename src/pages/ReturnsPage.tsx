// =====================================================================
// Devoluciones: localizar una venta, elegir artículos y cantidades,
// registrar motivo, reintegrar stock (opcional) y generar devolución.
// =====================================================================

import { useMemo, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { useAuth } from '@/store/authStore';
import { useProcessReturn, useSales } from '@/hooks/data';
import type { PaymentMethod, Sale } from '@/domain/types';
import { formatMoney, round2 } from '@/domain/money';
import { formatDateTime } from '@/lib/format';
import { PAYMENT_LABELS } from '@/domain/payments';
import { Button, Field, PageHeader, cn, inputClass } from '@/components/ui';

export function ReturnsPage() {
  const user = useAuth((s) => s.user)!;
  const { data: sales = [] } = useSales();
  const processReturn = useProcessReturn();

  const [query, setQuery] = useState('');
  const [sale, setSale] = useState<Sale | null>(null);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [restock, setRestock] = useState(true);
  const [done, setDone] = useState<number | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return sales.filter((s) => String(s.number).includes(q) || s.customerName.toLowerCase().includes(q)).slice(0, 6);
  }, [sales, query]);

  const pick = (s: Sale) => { setSale(s); setQtys({}); setDone(null); };

  const refundTotal = useMemo(() => {
    if (!sale) return 0;
    return round2(
      sale.items.reduce((acc, it) => {
        const q = qtys[it.id] ?? 0;
        const unit = it.quantity > 0 ? it.lineTotal / it.quantity : 0;
        return acc + unit * q;
      }, 0),
    );
  }, [sale, qtys]);

  const confirm = async () => {
    if (!sale) return;
    const items = sale.items
      .filter((it) => (qtys[it.id] ?? 0) > 0)
      .map((it) => {
        const q = qtys[it.id];
        const unit = it.quantity > 0 ? it.lineTotal / it.quantity : 0;
        return { saleItemId: it.id, productId: it.productId, name: it.name, quantity: q, refundAmount: round2(unit * q) };
      });
    if (items.length === 0 || !reason.trim()) return;
    const ret = await processReturn.mutateAsync({
      saleId: sale.id, cashierId: user.id, cashierName: user.fullName,
      reason: reason.trim(), refundMethod: method, restock, items, total: refundTotal,
    });
    setDone(ret.number);
    setSale(null); setQtys({}); setReason(''); setQuery('');
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Devoluciones" subtitle="Localiza la venta original para devolver artículos." />

      <div className="flex-1 overflow-y-auto p-6">
        {done && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-700">
            <RotateCcw size={18} /> Devolución #{done} registrada correctamente.
          </div>
        )}

        <div className="mx-auto max-w-3xl">
          <div className="relative mb-4">
            <Search className="absolute left-3.5 top-3.5 text-slate-400" size={20} />
            <input autoFocus placeholder="Nº de ticket o nombre del cliente…" value={query} onChange={(e) => setQuery(e.target.value)} className={`${inputClass} h-12 pl-11`} />
          </div>

          {!sale && results.length > 0 && (
            <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {results.map((s) => (
                <button key={s.id} onClick={() => pick(s)} className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-slate-50">
                  <div><p className="font-bold text-slate-800">#{s.number}</p><p className="text-xs text-slate-400">{formatDateTime(s.createdAt)} · {s.customerName}</p></div>
                  <span className="font-semibold tabular-nums text-slate-700">{formatMoney(s.total)}</span>
                </button>
              ))}
            </div>
          )}

          {sale && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <div><h3 className="text-lg font-bold text-slate-800">Ticket #{sale.number}</h3><p className="text-sm text-slate-400">{formatDateTime(sale.createdAt)}</p></div>
                <button onClick={() => setSale(null)} className="text-sm font-medium text-slate-400 hover:text-slate-600">Cambiar venta</button>
              </div>

              <div className="space-y-2">
                {sale.items.map((it) => {
                  const max = it.quantity - it.returnedQty;
                  const val = qtys[it.id] ?? 0;
                  return (
                    <div key={it.id} className={cn('flex items-center justify-between rounded-xl border p-3', max <= 0 ? 'border-slate-100 opacity-50' : 'border-slate-200')}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-800">{it.name}</p>
                        <p className="text-xs text-slate-400">{formatMoney(it.lineTotal)} · {it.quantity} ud{it.returnedQty > 0 ? ` · ${it.returnedQty} ya devueltas` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Devolver</span>
                        <input type="number" min={0} max={max} disabled={max <= 0} value={val}
                          onChange={(e) => setQtys((q) => ({ ...q, [it.id]: Math.min(max, Math.max(0, Number(e.target.value))) }))}
                          className={`${inputClass} h-9 w-20 text-center`} />
                        <span className="text-xs text-slate-400">/ {max}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <Field label="Motivo de la devolución *"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: producto defectuoso" className={inputClass} /></Field>
                <Field label="Método de reembolso">
                  <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={inputClass}>
                    {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}
                  </select>
                </Field>
              </div>

              <label className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-600">
                <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="h-4 w-4" /> Reintegrar al stock
              </label>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                <div><p className="text-sm text-slate-500">Importe a reembolsar</p><p className="text-2xl font-bold text-slate-900">{formatMoney(refundTotal)}</p></div>
                <Button variant="danger" size="lg" disabled={refundTotal <= 0 || !reason.trim() || processReturn.isPending} onClick={confirm}>
                  Confirmar devolución
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
