// =====================================================================
// Informes: KPIs, ranking de productos, ventas por categoría y por
// método de pago, beneficio estimado y exportación a CSV.
// =====================================================================

import { useMemo, useState } from 'react';
import { Download, Euro, Package, Receipt, TrendingUp } from 'lucide-react';
import { useCategories, useProducts, useSales } from '@/hooks/data';
import type { Sale } from '@/domain/types';
import { formatMoney, round2 } from '@/domain/money';
import { summarizeSales } from '@/domain/sales';
import { daysAgo, formatTime, startOfToday } from '@/lib/format';
import { PAYMENT_LABELS } from '@/domain/payments';
import { PageHeader, cn } from '@/components/ui';

type Range = 'today' | 'yesterday' | 'week' | 'month' | 'all';

export function ReportsPage() {
  const [range, setRange] = useState<Range>('today');
  const { data: products = [] } = useProducts();
  const { data: categories = [] } = useCategories();
  const filter =
    range === 'today' ? { from: startOfToday() }
    : range === 'yesterday' ? { from: daysAgo(1), to: startOfToday() }
    : range === 'week' ? { from: daysAgo(7) }
    : range === 'month' ? { from: daysAgo(30) }
    : {};
  const { data: sales = [] } = useSales(filter);
  const summary = useMemo(() => summarizeSales(sales), [sales]);

  const costOf = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((p) => map.set(p.id, p.cost ?? 0));
    return map;
  }, [products]);
  const catOf = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => map.set(p.id, p.categoryId ?? '—'));
    return map;
  }, [products]);

  const valid = sales.filter((s) => s.status !== 'cancelled');

  const kpi = useMemo(() => {
    let revenue = 0, units = 0, profit = 0;
    for (const s of valid) {
      revenue += s.total;
      for (const it of s.items) {
        units += it.quantity;
        const net = it.taxBase; // base sin IVA
        profit += net - (costOf.get(it.productId) ?? 0) * it.quantity;
      }
    }
    return {
      revenue: round2(revenue),
      units,
      tickets: valid.length,
      avg: valid.length ? round2(revenue / valid.length) : 0,
      profit: round2(profit),
    };
  }, [valid, costOf]);

  const topProducts = useMemo(() => {
    const acc = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const s of valid) for (const it of s.items) {
      const cur = acc.get(it.productId) ?? { name: it.name, qty: 0, revenue: 0 };
      cur.qty += it.quantity; cur.revenue = round2(cur.revenue + it.lineTotal);
      acc.set(it.productId, cur);
    }
    return [...acc.values()].sort((a, b) => b.qty - a.qty).slice(0, 8);
  }, [valid]);

  const byPayment = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const s of valid) for (const p of s.payments) {
      const method = p.method === 'cash' ? 'cash' : 'card';
      acc[method] = round2((acc[method] ?? 0) + p.amount);
    }
    return acc;
  }, [valid]);

  const byCategory = useMemo(() => {
    const catName = new Map(categories.map((c) => [c.id, c.name]));
    const acc = new Map<string, number>();
    for (const s of valid) for (const it of s.items) {
      const cat = catOf.get(it.productId) ?? '—';
      acc.set(cat, round2((acc.get(cat) ?? 0) + it.lineTotal));
    }
    return [...acc.entries()]
      .map(([id, total]) => ({ id, total, name: catName.get(id) ?? 'Sin categoría' }))
      .sort((a, b) => b.total - a.total);
  }, [valid, catOf, categories]);

  const maxCat = Math.max(1, ...byCategory.map((c) => c.total));

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Informes" subtitle="Resumen de actividad de la tienda." actions={
        <button onClick={() => exportSalesCsv(valid)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <Download size={16} /> Exportar CSV
        </button>
      } />

      <div className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {([['today', 'Hoy'], ['yesterday', 'Ayer'], ['week', '7 días'], ['month', '30 días'], ['all', 'Todo']] as [Range, string][]).map(([r, label]) => (
            <button key={r} onClick={() => setRange(r)} className={cn('rounded-lg px-4 py-1.5 text-sm font-semibold', range === r ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500')}>{label}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Facturación del periodo (bruto / anulado / neto + métodos) */}
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 font-bold text-slate-800">Facturación del periodo</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Mini label="Bruto" value={formatMoney(summary.gross)} />
            <Mini label="Anulado" value={`−${formatMoney(summary.cancelled)}`} tone="rose" />
            <Mini label="Neto" value={formatMoney(summary.net)} tone="brand" />
            <Mini label="Efectivo" value={formatMoney(summary.byMethod.cash)} />
            <Mini label="Tarjeta" value={formatMoney(summary.byMethod.card)} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
            <span>Tickets: <b className="text-slate-700">{summary.ticketCount}</b></span>
            <span>Anulados: <b className="text-slate-700">{summary.cancelledCount}</b></span>
            <span>Ticket medio: <b className="text-slate-700">{formatMoney(summary.avgTicket)}</b></span>
            {summary.firstSaleAt && <span>1ª venta: <b className="text-slate-700">{formatTime(summary.firstSaleAt)}</b></span>}
            {summary.lastSaleAt && <span>Última venta: <b className="text-slate-700">{formatTime(summary.lastSaleAt)}</b></span>}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi icon={<Euro size={18} />} label="Facturación" value={formatMoney(kpi.revenue)} accent />
          <Kpi icon={<Receipt size={18} />} label="Tickets" value={String(kpi.tickets)} />
          <Kpi icon={<TrendingUp size={18} />} label="Ticket medio" value={formatMoney(kpi.avg)} />
          <Kpi icon={<Package size={18} />} label="Unidades" value={String(kpi.units)} />
          <Kpi icon={<TrendingUp size={18} />} label="Beneficio est." value={formatMoney(kpi.profit)} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card title="Productos más vendidos">
            {topProducts.length === 0 ? <Empty /> : (
              <ul className="space-y-2">
                {topProducts.map((p, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-slate-700"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">{i + 1}</span>{p.name}</span>
                    <span className="text-sm"><span className="font-bold text-slate-800">{p.qty} ud</span> <span className="text-slate-400">· {formatMoney(p.revenue)}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Ventas por categoría">
            {byCategory.length === 0 ? <Empty /> : (
              <ul className="space-y-2.5">
                {byCategory.map((c) => (
                  <li key={c.id}>
                    <div className="mb-1 flex justify-between text-sm"><span className="text-slate-600">{c.name}</span><span className="font-semibold tabular-nums text-slate-800">{formatMoney(c.total)}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="bg-aurora h-full rounded-full" style={{ width: `${(c.total / maxCat) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Por método de pago">
            <ul className="space-y-2">
              {Object.keys(PAYMENT_LABELS).map((m) => (
                <li key={m} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
                  <span className="font-medium text-slate-600">{PAYMENT_LABELS[m as keyof typeof PAYMENT_LABELS]}</span>
                  <span className="font-bold tabular-nums text-slate-900">{formatMoney(byPayment[m] ?? 0)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: 'rose' | 'brand' }) {
  const color = tone === 'rose' ? 'text-rose-600' : tone === 'brand' ? 'text-brand-700' : 'text-slate-900';
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className={cn('text-lg font-bold tabular-nums', color)}>{value}</p>
    </div>
  );
}

function Kpi({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-2xl border p-4', accent ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white')}>
      <div className={cn('mb-1 flex items-center gap-1.5 text-xs font-medium', accent ? 'text-brand-600' : 'text-slate-500')}>{icon}{label}</div>
      <p className={cn('text-2xl font-bold tabular-nums', accent ? 'text-brand-700' : 'text-slate-900')}>{value}</p>
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="mb-3 font-bold text-slate-800">{title}</h3>{children}</div>;
}
function Empty() {
  return <p className="py-6 text-center text-sm text-slate-400">Sin datos en este periodo.</p>;
}

function exportSalesCsv(sales: Sale[]) {
  const rows = [['Ticket', 'Fecha', 'Cliente', 'Cajero', 'Base', 'IVA', 'Total', 'Estado']];
  for (const s of sales) {
    rows.push([
      String(s.number), s.createdAt, s.customerName, s.cashierName,
      String(s.subtotal), String(s.taxTotal), String(s.total), s.status,
    ]);
  }
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ventas_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
