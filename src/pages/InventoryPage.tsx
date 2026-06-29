// Inventario: existencias, avisos de stock bajo, ajuste manual y
// historial de movimientos.

import { useMemo, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { useAuth } from '@/store/authStore';
import { useAdjustStock, useProducts, useStockMovements } from '@/hooks/data';
import type { Product, StockMovement } from '@/domain/types';
import { formatDateTime } from '@/lib/format';
import { Badge, Button, Field, Modal, PageHeader, cn, inputClass } from '@/components/ui';

const MOVE_LABELS: Record<StockMovement['type'], string> = {
  sale: 'Venta', return: 'Devolución', adjustment: 'Ajuste', purchase: 'Entrada',
};

export function InventoryPage() {
  const user = useAuth((s) => s.user)!;
  const { data: products = [] } = useProducts();
  const { data: movements = [] } = useStockMovements();
  const adjust = useAdjustStock();
  const [search, setSearch] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [adjusting, setAdjusting] = useState<Product | null>(null);

  const tracked = useMemo(() => {
    const q = search.toLowerCase();
    return products
      .filter((p) => p.trackStock)
      .filter((p) => p.name.toLowerCase().includes(q) || (p.brand ?? '').toLowerCase().includes(q))
      .filter((p) => (onlyLow ? p.stock <= p.lowStockThreshold : true));
  }, [products, search, onlyLow]);

  const lowCount = products.filter((p) => p.trackStock && p.stock <= p.lowStockThreshold).length;

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Inventario" subtitle={`${tracked.length} productos con control de stock`} actions={
        lowCount > 0 ? <Badge color="amber"><AlertTriangle size={12} className="mr-1 inline" />{lowCount} con stock bajo</Badge> : undefined
      } />

      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputClass} h-9 pl-10`} />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
          <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="h-4 w-4" /> Solo stock bajo
        </label>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Producto</th><th className="px-4 py-3 text-center">Stock</th><th className="px-4 py-3 text-center">Mínimo</th><th></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tracked.map((p) => {
                  const low = p.stock <= p.lowStockThreshold;
                  return (
                    <tr key={p.id} className={cn('hover:bg-slate-50', low && 'bg-amber-50/40')}>
                      <td className="px-4 py-3"><div className="font-medium text-slate-800">{p.name}</div>{p.brand && <div className="text-xs text-brand-600">{p.brand}</div>}</td>
                      <td className="px-4 py-3 text-center"><Badge color={p.stock <= 0 ? 'red' : low ? 'amber' : 'slate'}>{p.stock} ud</Badge></td>
                      <td className="px-4 py-3 text-center text-slate-400">{p.lowStockThreshold}</td>
                      <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setAdjusting(p)}>Ajustar</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {tracked.length === 0 && <p className="py-12 text-center text-slate-400">Sin productos.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 font-bold text-slate-800">Últimos movimientos</h3>
          {movements.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">Sin movimientos.</p> : (
            <ul className="space-y-1.5">
              {movements.slice(0, 25).map((m) => (
                <li key={m.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50">
                  <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-700">{m.productName}</p><p className="text-xs text-slate-400">{MOVE_LABELS[m.type]} · {formatDateTime(m.createdAt)}</p></div>
                  <span className={cn('shrink-0 font-bold tabular-nums', m.quantity >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{m.quantity >= 0 ? '+' : ''}{m.quantity}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {adjusting && (
        <AdjustModal product={adjusting} pending={adjust.isPending} onClose={() => setAdjusting(null)} onSave={async (newStock, reason) => {
          await adjust.mutateAsync({ productId: adjusting.id, newStock, reason, userId: user.id });
          setAdjusting(null);
        }} />
      )}
    </div>
  );
}

function AdjustModal({ product, onClose, onSave, pending }: { product: Product; onClose: () => void; onSave: (newStock: number, reason: string) => void; pending: boolean }) {
  const [stock, setStock] = useState(String(product.stock));
  const [reason, setReason] = useState('');
  return (
    <Modal open onClose={onClose} title={`Ajustar stock · ${product.name}`} footer={
      <>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button disabled={pending || !reason.trim()} onClick={() => onSave(parseFloat(stock) || 0, reason.trim())}>Guardar ajuste</Button>
      </>
    }>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Stock actual: <span className="font-bold text-slate-700">{product.stock} ud</span></p>
        <Field label="Nuevo stock"><input type="number" step="1" autoFocus className={inputClass} value={stock} onChange={(e) => setStock(e.target.value)} /></Field>
        <Field label="Motivo del ajuste *" hint="Ej: recuento, rotura, entrada de mercancía"><input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
