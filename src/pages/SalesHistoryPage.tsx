// Historial de ventas con filtros por fecha y búsqueda. Ver/imprimir recibo.

import { useState } from 'react';
import { Eye, Search } from 'lucide-react';
import type { Sale, SaleStatus } from '@/domain/types';
import { useSales, useSettings } from '@/hooks/data';
import { formatMoney } from '@/domain/money';
import { formatDateTime, daysAgo, startOfToday } from '@/lib/format';
import { Badge, Modal, PageHeader, Spinner, cn, inputClass } from '@/components/ui';
import { Receipt } from '@/components/pos/Receipt';
import { Button } from '@/components/ui';
import { Printer } from 'lucide-react';

const STATUS: Record<SaleStatus, { label: string; color: string }> = {
  completed: { label: 'Completada', color: 'green' },
  cancelled: { label: 'Cancelada', color: 'red' },
  returned: { label: 'Devuelta', color: 'amber' },
  partially_returned: { label: 'Dev. parcial', color: 'amber' },
};

type Range = 'today' | 'week' | 'all';

export function SalesHistoryPage() {
  const [range, setRange] = useState<Range>('today');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Sale | null>(null);
  const { data: settings } = useSettings();

  const filter = range === 'today' ? { from: startOfToday() } : range === 'week' ? { from: daysAgo(7) } : {};
  const { data: sales = [], isLoading } = useSales({ ...filter, search: search || undefined });

  const total = sales.filter((s) => s.status !== 'cancelled').reduce((a, s) => a + s.total, 0);

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Ventas" subtitle={`${sales.length} tickets · ${formatMoney(total)}`} />

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {([['today', 'Hoy'], ['week', '7 días'], ['all', 'Todo']] as [Range, string][]).map(([r, label]) => (
            <button key={r} onClick={() => setRange(r)} className={cn('rounded-lg px-3 py-1.5 text-sm font-semibold', range === r ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500')}>{label}</button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input placeholder="Nº ticket o cliente" value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputClass} h-9 pl-10`} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>
        ) : sales.length === 0 ? (
          <p className="py-16 text-center text-slate-400">No hay ventas en este periodo.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Ticket</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Cajero</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-center">Estado</th><th></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.map((s) => (
                  <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(s)}>
                    <td className="px-4 py-3 font-bold text-slate-800">#{s.number}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDateTime(s.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-600">{s.customerName}</td>
                    <td className="px-4 py-3 text-slate-500">{s.cashierName}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">{formatMoney(s.total)}</td>
                    <td className="px-4 py-3 text-center"><Badge color={STATUS[s.status].color}>{STATUS[s.status].label}</Badge></td>
                    <td className="px-4 py-3 text-right"><Eye className="text-slate-300" size={18} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && settings && (
        <Modal open onClose={() => setSelected(null)} size="sm" title={`Ticket #${selected.number}`} footer={
          <Button variant="outline" className="no-print w-full" onClick={() => window.print()}><Printer size={18} /> Imprimir</Button>
        }>
          <div className="rounded-xl border border-slate-200"><Receipt sale={selected} settings={settings} /></div>
        </Modal>
      )}
    </div>
  );
}
